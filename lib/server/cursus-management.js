const { ProfAuthError, sendJson } = require("./discord-prof-auth.js");
const { verifyFirebaseProfAccess } = require("./firebase-prof-access.js");
const { assertSameOrigin } = require("./unified-access.js");
const { fetchCsv: fetchSheetCsv } = require("../../api/secure-sheet.js");
const {
  commitDocumentChanges,
  createDocument,
  getDocument,
  listDocuments,
  upsertDocument
} = require("./firestore-service-account.js");

const STAGE_COLLECTION = "stageValidations";
const EXAM_COLLECTION = "examAnswerStatuses";
const STAGE_ARCHIVE_COLLECTION = "stageArchives";
const STUDENT_MODULES_COLLECTION = "studentModules";
const STUDENT_MODULE_ARCHIVES_COLLECTION = "studentModuleArchives";
const SETTINGS_COLLECTION = "stageSettings";
const STAGE_EFFECTIF_DOCUMENT = "effectif";
const MODULE_EFFECTIF_DOCUMENT = "moduleEffectif";
const PROF_SETTINGS_COLLECTION = "profSettings";
const WORKFLOW_DOCUMENT = "cursusArchiveWorkflow";
const HISTORY_COLLECTION = "stageHistory";
const MODULE_COLUMNS = ["module1", "module2", "module3", "module4", "exam", "retakeExam"];

function getBearerToken(request) {
  const authorization = String(request.headers?.authorization || "");
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

function readBody(request) {
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return request.body || {};
}

async function requireAdmin(request) {
  const token = getBearerToken(request);
  if (!token) throw new ProfAuthError("admin", "Connexion administrateur requise.", 401);
  const access = await verifyFirebaseProfAccess(token);
  if (!access.admin) throw new ProfAuthError("admin", "Accès administrateur requis.", 403);
  return access;
}

function normalizeIdUnique(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function isChecked(value) {
  return value === true || value === 1 || value === "true" || value === "1";
}

function extractSpreadsheetId(value) {
  const text = String(value || "").trim();
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || (/^[a-zA-Z0-9_-]{20,}$/.test(text) ? text : "");
}

function extractGid(value) {
  return String(value || "").match(/[?#&]gid=([0-9]+)/)?.[1] || "";
}

function buildSheetLink(spreadsheetId, gid) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=${gid}#gid=${gid}`;
}

function normalizeSheetSettings(value = {}) {
  const spreadsheetId = extractSpreadsheetId(value.spreadsheetId || value.link || value.url);
  const gid = String(value.gid || extractGid(value.link) || extractGid(value.url) || "").trim();
  if (!spreadsheetId || !/^\d+$/.test(gid)) return null;
  return {
    link: buildSheetLink(spreadsheetId, gid),
    spreadsheetId,
    gid
  };
}

function buildCursusKey(settings = {}) {
  const normalized = normalizeSheetSettings(settings);
  if (!normalized) return "";
  const safeKey = `${normalized.spreadsheetId}_${normalized.gid}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safeKey ? `cursus_${safeKey}` : "";
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function parseCsv(text) {
  const source = String(text || "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some(cell => String(cell || "").trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some(cell => String(cell || "").trim())) rows.push(row);
  return rows;
}

function findEffectifLayout(rows) {
  const limit = Math.min(rows.length, 10);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const labels = (rows[rowIndex] || []).map(normalizeHeader);
    const idIndex = labels.findIndex(label => label.includes("idunique") || (label.includes("id") && label.includes("unique")));
    const nameIndex = labels.findIndex(label => label.includes("nom") || label.includes("eleve"));
    if (idIndex >= 0 && nameIndex >= 0) return { dataStart: rowIndex + 1, idIndex, nameIndex };
  }
  return { dataStart: 0, idIndex: 0, nameIndex: 1 };
}

function normalizeEffectifStudents(rows) {
  const layout = findEffectifLayout(rows);
  const seen = new Set();
  return rows.slice(layout.dataStart).reduce((students, row) => {
    const idUnique = String(row?.[layout.idIndex] || "").trim();
    const studentName = String(row?.[layout.nameIndex] || "").trim();
    const normalizedIdUnique = normalizeIdUnique(idUnique);
    const uniqueKey = normalizedIdUnique || `name:${normalizeText(studentName)}`;
    if ((!normalizedIdUnique && !studentName) || seen.has(uniqueKey)) return students;
    seen.add(uniqueKey);
    students.push({ idUnique, normalizedIdUnique, studentName: studentName || "Nom non renseigné" });
    return students;
  }, []);
}

async function loadEffectifStudents(settings, label) {
  const normalized = normalizeSheetSettings(settings || {});
  if (!normalized) {
    throw Object.assign(new Error(`Le lien de l’effectif ${label} est incomplet.`), { status: 400 });
  }
  try {
    const csv = await fetchSheetCsv(normalized);
    const students = normalizeEffectifStudents(parseCsv(csv));
    if (!students.length) throw new Error("aucun élève trouvé");
    return students;
  } catch (error) {
    throw Object.assign(new Error(`Impossible de lire tout l’effectif ${label} (${error.message || "Google Sheets indisponible"}).`), { status: 502 });
  }
}

function sameSheetTarget(left, right) {
  return Boolean(left?.spreadsheetId && left?.gid)
    && left.spreadsheetId === right?.spreadsheetId
    && left.gid === right?.gid;
}

async function loadCursusEffectifs(settings) {
  const stageEffectifStudents = await loadEffectifStudents(settings.stageEffectif, "du suivi de stage");
  const moduleEffectifStudents = sameSheetTarget(settings.stageEffectif, settings.moduleEffectif)
    ? stageEffectifStudents
    : await loadEffectifStudents(settings.moduleEffectif, "des modules");
  return { stageEffectifStudents, moduleEffectifStudents };
}

function parseDate(value, label) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw Object.assign(new Error(`${label} invalide.`), { status: 400 });
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw Object.assign(new Error(`${label} invalide.`), { status: 400 });
  }
  return {
    iso: text,
    display: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`
  };
}

function parsePeriod(body) {
  const start = parseDate(body.startDate, "Date de début");
  const end = parseDate(body.endDate, "Date de fin");
  if (end.iso < start.iso) {
    throw Object.assign(new Error("La date de fin doit être postérieure à la date de début."), { status: 400 });
  }
  return {
    startDate: start.iso,
    endDate: end.iso,
    startDisplay: start.display,
    endDisplay: end.display,
    title: `Archive du ${start.display} au ${end.display}`
  };
}

async function readEffectifSettings() {
  const [stageRaw, moduleRaw] = await Promise.all([
    getDocument(SETTINGS_COLLECTION, STAGE_EFFECTIF_DOCUMENT),
    getDocument(SETTINGS_COLLECTION, MODULE_EFFECTIF_DOCUMENT)
  ]);
  const sharedEffectif = normalizeSheetSettings(stageRaw || moduleRaw || {}) || null;
  return {
    sharedEffectif,
    stageEffectif: sharedEffectif,
    moduleEffectif: sharedEffectif
  };
}

function isActiveModuleDocument(row, cursusKey) {
  if (!cursusKey) return false;
  if (row.cursusKey) return row.cursusKey === cursusKey;
  return String(row.id || "").startsWith(`${cursusKey}__`);
}

async function readCurrentData() {
  const settings = await readEffectifSettings();
  const [stages, examRows, allModules] = await Promise.all([
    listDocuments(STAGE_COLLECTION),
    listDocuments(EXAM_COLLECTION),
    listDocuments(STUDENT_MODULES_COLLECTION)
  ]);
  const { refreshNativeExamRows } = require("./native-exam-v2.js");
  const exams = await refreshNativeExamRows(examRows);
  const moduleCursusKey = buildCursusKey(settings.moduleEffectif || {});
  const modules = allModules.filter(row => isActiveModuleDocument(row, moduleCursusKey));
  return {
    settings,
    stages,
    exams: exams.filter(row => row.archived !== true),
    modules,
    moduleCursusKey
  };
}

function normalizeStageArchiveRows(rows) {
  return rows.map(row => ({
    firebaseId: String(row.id || row.firebaseId || ""),
    idUnique: String(row.idUnique || ""),
    normalizedIdUnique: normalizeIdUnique(row.normalizedIdUnique || row.idUnique),
    companyId: String(row.companyId || ""),
    companyName: String(row.companyName || ""),
    status: String(row.status || "approved")
  }));
}

function normalizeExamArchiveRows(rows, stageRows) {
  const stageByStudent = new Map(stageRows.map(row => [row.normalizedIdUnique, row]));
  return rows.map(row => {
    const normalizedIdUnique = normalizeIdUnique(row.normalizedIdUnique || row.idUnique);
    const stage = stageByStudent.get(normalizedIdUnique);
    return {
      firebaseId: String(row.id || row.firebaseId || ""),
      idUnique: String(row.idUnique || ""),
      normalizedIdUnique,
      studentName: String(row.studentName || row.name || "Nom non renseigné"),
      totalScore: Number(row.totalScore || row.score || 0),
      maxScore: Number(row.maxScore || 50),
      status: String(row.status || "pending"),
      recordType: String(row.recordType || ""),
      examId: String(row.examId || ""),
      examTitle: String(row.examTitle || ""),
      companyId: String(row.companyId || stage?.companyId || ""),
      companyName: String(row.companyName || stage?.companyName || "")
    };
  });
}

function buildStageSummary(stageRows, examRows) {
  return {
    totalStages: stageRows.length,
    totalExams: examRows.length,
    approved: examRows.filter(row => row.status === "approved").length,
    rejected: examRows.filter(row => row.status === "rejected").length,
    pending: examRows.filter(row => row.status !== "approved" && row.status !== "rejected").length
  };
}

function normalizeModuleArchiveRows(rows) {
  return rows.map(row => {
    const checks = row.checks && typeof row.checks === "object" ? row.checks : {};
    const dates = row.dates && typeof row.dates === "object" ? row.dates : {};
    return {
      firebaseId: String(row.id || ""),
      idUnique: String(row.idUnique || ""),
      normalizedIdUnique: normalizeIdUnique(row.normalizedIdUnique || row.studentId || row.idUnique),
      studentName: String(row.studentName || "Nom non renseigné"),
      checks: Object.fromEntries(MODULE_COLUMNS.map(key => [key, isChecked(checks[key] ?? row[key])])),
      dates: Object.fromEntries(MODULE_COLUMNS.map(key => [key, String(dates[key] || "")])),
      completedAt: row.completedAt && typeof row.completedAt === "object" ? row.completedAt : {},
      updatedAt: row.updatedAt || null,
      updatedBy: row.updatedBy || null
    };
  });
}

function buildCompleteModuleArchiveRows(effectifStudents, moduleRows) {
  const progressRows = normalizeModuleArchiveRows(moduleRows);
  const progressById = new Map(progressRows
    .filter(row => row.normalizedIdUnique)
    .map(row => [row.normalizedIdUnique, row]));
  const includedIds = new Set();
  const emptyChecks = () => Object.fromEntries(MODULE_COLUMNS.map(key => [key, false]));
  const emptyDates = () => Object.fromEntries(MODULE_COLUMNS.map(key => [key, ""]));

  const completeRows = effectifStudents.map(student => {
    const progress = progressById.get(student.normalizedIdUnique);
    if (student.normalizedIdUnique) includedIds.add(student.normalizedIdUnique);
    return progress
      ? { ...progress, idUnique: student.idUnique || progress.idUnique, studentName: student.studentName || progress.studentName }
      : {
          firebaseId: "",
          idUnique: student.idUnique,
          normalizedIdUnique: student.normalizedIdUnique,
          studentName: student.studentName,
          checks: emptyChecks(),
          dates: emptyDates(),
          completedAt: {},
          updatedAt: null,
          updatedBy: null
        };
  });

  // Une progression orpheline ne doit jamais être perdue si la feuille a été
  // modifiée juste avant l’archivage.
  progressRows.forEach(row => {
    if (!row.normalizedIdUnique || !includedIds.has(row.normalizedIdUnique)) completeRows.push(row);
  });
  return completeRows;
}

function buildModuleSummary(rows) {
  return {
    totalStudents: rows.length,
    ...Object.fromEntries(MODULE_COLUMNS.map(key => [
      key,
      rows.filter(row => row.checks?.[key] === true).length
    ]))
  };
}

async function addHistory(action, actor, details) {
  const historyId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  await createDocument(HISTORY_COLLECTION, historyId, {
    action,
    actor,
    details,
    createdAt: new Date().toISOString()
  }).catch(error => console.warn("Historique admin non enregistré :", error?.message || error));
}

function publicWorkflow(value) {
  if (!value) return null;
  return {
    runId: String(value.runId || ""),
    archiveId: String(value.archiveId || ""),
    moduleArchiveId: String(value.moduleArchiveId || ""),
    status: String(value.status || ""),
    period: value.period || null,
    counts: value.counts || null,
    updatedAt: value.updatedAt || null
  };
}

async function getDashboardState() {
  const [current, workflow] = await Promise.all([
    readCurrentData(),
    getDocument(PROF_SETTINGS_COLLECTION, WORKFLOW_DOCUMENT)
  ]);
  let effectifs = null;
  try {
    effectifs = await loadCursusEffectifs(current.settings);
  } catch (error) {
    console.warn("Comptage de l’effectif complet indisponible :", error?.message || error);
  }
  return {
    settings: current.settings,
    counts: {
      stages: current.stages.length,
      exams: current.exams.length,
      modules: effectifs?.moduleEffectifStudents.length ?? current.modules.length,
      effectif: effectifs?.stageEffectifStudents.length ?? 0
    },
    workflow: publicWorkflow(workflow)
  };
}

async function archiveStages(access, body) {
  const period = parsePeriod(body);
  const archiveId = `archive_${period.startDate}_${period.endDate}`;
  const runId = `cursus_${period.startDate}_${period.endDate}`;
  const [current, workflow, existingArchive] = await Promise.all([
    readCurrentData(),
    getDocument(PROF_SETTINGS_COLLECTION, WORKFLOW_DOCUMENT),
    getDocument(STAGE_ARCHIVE_COLLECTION, archiveId)
  ]);

  if (workflow?.status === "stage-complete" && workflow.runId === runId) {
    return { workflow: publicWorkflow(workflow), alreadyDone: true };
  }
  if (workflow?.status === "complete" && workflow.runId === runId) {
    throw Object.assign(new Error("Cette période a déjà été entièrement archivée."), { status: 409 });
  }
  if (workflow?.status && workflow.status !== "complete" && workflow.runId !== runId) {
    throw Object.assign(new Error("Termine d’abord l’archivage déjà commencé."), { status: 409 });
  }
  if (existingArchive && workflow?.runId !== runId) {
    throw Object.assign(new Error("Une archive existe déjà pour cette période."), { status: 409 });
  }
  const { stageEffectifStudents, moduleEffectifStudents } = await loadCursusEffectifs(current.settings);

  const stageRows = normalizeStageArchiveRows(current.stages);
  const examRows = normalizeExamArchiveRows(current.exams, stageRows);
  const now = new Date().toISOString();
  const workflowBase = {
    runId,
    archiveId,
    moduleArchiveId: "",
    status: "stage-running",
    period,
    moduleEffectif: current.settings.moduleEffectif,
    moduleEffectifStudents,
    moduleCursusKey: current.moduleCursusKey,
    counts: {
      stages: stageRows.length,
      exams: examRows.length,
      modules: moduleEffectifStudents.length,
      effectif: stageEffectifStudents.length
    },
    startedBy: access.actorId,
    startedAt: workflow?.runId === runId ? workflow.startedAt || now : now,
    updatedAt: now
  };
  await upsertDocument(PROF_SETTINGS_COLLECTION, WORKFLOW_DOCUMENT, workflowBase);

  if (!existingArchive) {
    await createDocument(STAGE_ARCHIVE_COLLECTION, archiveId, {
      ...period,
      effectifStudents: stageEffectifStudents,
      stageValidations: stageRows,
      examParticipants: examRows,
      summary: { ...buildStageSummary(stageRows, examRows), totalEffectif: stageEffectifStudents.length },
      archivedBy: access.actorId,
      createdAt: now
    });
  }

  await commitDocumentChanges({
    deletes: current.stages.map(row => ({
      collectionName: STAGE_COLLECTION,
      documentId: row.id
    })),
    merges: current.exams.map(row => ({
      collectionName: EXAM_COLLECTION,
      documentId: row.id,
      data: {
        archived: true,
        archivedBy: access.actorId,
        archivedAt: now,
        resetWeek: true,
        archivedInCursus: archiveId
      }
    }))
  });

  const completed = { ...workflowBase, status: "stage-complete", updatedAt: new Date().toISOString() };
  await upsertDocument(PROF_SETTINGS_COLLECTION, WORKFLOW_DOCUMENT, completed);
  await addHistory("stage_cursus_archived", access.actorId, {
    archiveId,
    period: period.title,
    stages: stageRows.length,
    exams: examRows.length,
    effectif: stageEffectifStudents.length
  });
  return { workflow: publicWorkflow(completed) };
}

async function archiveModules(access) {
  const workflow = await getDocument(PROF_SETTINGS_COLLECTION, WORKFLOW_DOCUMENT);
  if (!workflow || !["stage-complete", "module-running"].includes(workflow.status)) {
    if (workflow?.status === "complete") return { workflow: publicWorkflow(workflow), alreadyDone: true };
    throw Object.assign(new Error("L’étape 1 doit être terminée avant les modules."), { status: 409 });
  }

  const allModules = await listDocuments(STUDENT_MODULES_COLLECTION);
  const cursusKey = String(workflow.moduleCursusKey || buildCursusKey(workflow.moduleEffectif || {}));
  const activeModules = allModules.filter(row => isActiveModuleDocument(row, cursusKey));
  const effectifStudents = Array.isArray(workflow.moduleEffectifStudents) && workflow.moduleEffectifStudents.length
    ? workflow.moduleEffectifStudents
    : await loadEffectifStudents(workflow.moduleEffectif, "des modules");
  const students = buildCompleteModuleArchiveRows(effectifStudents, activeModules);
  const moduleArchiveId = `modules_${String(workflow.runId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const existingArchive = await getDocument(STUDENT_MODULE_ARCHIVES_COLLECTION, moduleArchiveId);
  const now = new Date().toISOString();

  await upsertDocument(PROF_SETTINGS_COLLECTION, WORKFLOW_DOCUMENT, {
    ...workflow,
    moduleArchiveId,
    status: "module-running",
    updatedAt: now
  });

  if (!existingArchive) {
    const period = workflow.period || {};
    await createDocument(STUDENT_MODULE_ARCHIVES_COLLECTION, moduleArchiveId, {
      title: `Archive modules du ${period.startDisplay || "?"} au ${period.endDisplay || "?"}`,
      trigger: "admin-private-two-step",
      stageArchiveId: workflow.archiveId || "",
      previousEffectif: workflow.moduleEffectif || null,
      cursusStartDate: period.startDate || "",
      cursusEndDate: period.endDate || "",
      cursusStartDisplay: period.startDisplay || "",
      cursusEndDisplay: period.endDisplay || "",
      startDisplay: period.startDisplay || "",
      endDisplay: period.endDisplay || "",
      students,
      summary: buildModuleSummary(students),
      archivedBy: access.actorId,
      archivedAt: now
    });
  }

  await commitDocumentChanges({
    deletes: activeModules.map(row => ({
      collectionName: STUDENT_MODULES_COLLECTION,
      documentId: row.id
    }))
  });
  const completed = {
    ...workflow,
    moduleArchiveId,
    status: "complete",
    completedBy: access.actorId,
    completedAt: now,
    updatedAt: now
  };
  await upsertDocument(PROF_SETTINGS_COLLECTION, WORKFLOW_DOCUMENT, completed);
  await addHistory("student_modules_archived", access.actorId, {
    archiveId: moduleArchiveId,
    stageArchiveId: workflow.archiveId || "",
    totalStudents: students.length,
    period: workflow.period?.title || ""
  });
  return { workflow: publicWorkflow(completed) };
}

async function archiveAll(access, body) {
  const period = parsePeriod(body);
  const runId = `cursus_${period.startDate}_${period.endDate}`;
  const workflow = await getDocument(PROF_SETTINGS_COLLECTION, WORKFLOW_DOCUMENT);

  if (workflow?.runId === runId && workflow.status === "complete") {
    return { workflow: publicWorkflow(workflow), alreadyDone: true };
  }

  if (workflow?.runId === runId && ["stage-complete", "module-running"].includes(workflow.status)) {
    return archiveModules(access);
  }

  await archiveStages(access, body);
  return archiveModules(access);
}

async function saveEffectifSettings(access, body) {
  const settings = normalizeSheetSettings({
    link: body.link,
    spreadsheetId: body.spreadsheetId,
    gid: body.gid
  });
  if (!settings) throw Object.assign(new Error("Lien Google Sheets ou GID invalide."), { status: 400 });

  const now = new Date().toISOString();
  const sharedSettings = {
    ...settings,
    shared: true,
    updatedBy: access.actorId,
    updatedAt: now
  };
  await commitDocumentChanges({
    merges: [STAGE_EFFECTIF_DOCUMENT, MODULE_EFFECTIF_DOCUMENT].map(documentId => ({
      collectionName: SETTINGS_COLLECTION,
      documentId,
      data: sharedSettings
    }))
  });
  await addHistory("effectif_link_changed", access.actorId, {
    target: "shared",
    spreadsheetId: settings.spreadsheetId,
    gid: settings.gid
  });
  return { target: "shared", settings };
}

module.exports = async function handler(request, response) {
  try {
    const access = await requireAdmin(request);

    if (request.method === "GET") {
      sendJson(response, 200, await getDashboardState());
      return;
    }

    assertSameOrigin(request);
    const body = readBody(request);
    const action = String(body.action || "");

    if (request.method === "PATCH" && action === "save-effectif") {
      sendJson(response, 200, await saveEffectifSettings(access, body));
      return;
    }
    if (request.method === "POST" && action === "archive-stages") {
      sendJson(response, 200, await archiveStages(access, body));
      return;
    }
    if (request.method === "POST" && action === "archive-modules") {
      sendJson(response, 200, await archiveModules(access));
      return;
    }
    if (request.method === "POST" && action === "archive-all") {
      sendJson(response, 200, await archiveAll(access, body));
      return;
    }

    sendJson(response, 405, { error: "Action non autorisée." });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error("Gestion du cursus impossible :", error);
    sendJson(response, status, {
      error: status >= 500 ? "Gestion du cursus temporairement indisponible." : error.message
    });
  }
};

module.exports.__test = {
  archiveAll,
  buildCompleteModuleArchiveRows,
  normalizeEffectifStudents,
  parseCsv
};
module.exports.buildCursusKey = buildCursusKey;
module.exports.normalizeEffectifStudents = normalizeEffectifStudents;
module.exports.normalizeIdUnique = normalizeIdUnique;
module.exports.parseCsv = parseCsv;
