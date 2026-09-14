const { sendJson } = require("../../lib/server/discord-prof-auth.js");
const {
  assertSameOrigin,
  validateStageCompanySession
} = require("../../lib/server/unified-access.js");
const {
  deleteDocument,
  getDocument,
  listDocuments,
  upsertDocument
} = require("../../lib/server/firestore-service-account.js");

const STAGE_COLLECTION = "stageValidations";
const EXAM_COLLECTION = "examAnswerStatuses";
const STAGE_ARCHIVE_COLLECTION = "stageArchives";
const STUDENT_MODULES_COLLECTION = "studentModules";
const STAGE_SETTINGS_COLLECTION = "stageSettings";
const EFFECTIF_SETTINGS_DOCUMENT = "effectif";
const MODULE_EFFECTIF_SETTINGS_DOCUMENT = "moduleEffectif";
const COMPANY_WARNING_LEVELS = new Set(["warning1", "warning2", "warning3", "refused"]);

function normalizeIdUnique(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function readBody(request) {
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return request.body || {};
}

function getRequestUrl(request) {
  return new URL(request.url, `https://${request.headers?.host || "localhost"}`);
}

async function requireCompany(request) {
  const session = await validateStageCompanySession(request);
  if (!session) {
    const error = new Error("Session entreprise expirée.");
    error.status = 401;
    throw error;
  }
  return session;
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
  const text = String(value || "");
  return text.match(/[?#&]gid=([0-9]+)/)?.[1] || "";
}

function buildCursusKey(settings = {}) {
  const spreadsheetId = extractSpreadsheetId(settings.spreadsheetId || settings.link || settings.url);
  const gid = String(settings.gid || extractGid(settings.link) || extractGid(settings.url) || "").trim();
  const safeKey = `${spreadsheetId}_${gid}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safeKey ? `cursus_${safeKey}` : "";
}

function sanitizeCompanyWarning(row) {
  const level = String(row?.warningLevel || row?.warning?.level || row?.warning || "none");
  if (!COMPANY_WARNING_LEVELS.has(level)) return null;

  return {
    level,
    studentName: String(row?.studentName || "").trim().slice(0, 160),
    comment: String(row?.warningComment || row?.warning?.comment || "").trim().slice(0, 1200)
  };
}

async function readModuleEffectifSettings() {
  return (
    await getDocument(STAGE_SETTINGS_COLLECTION, MODULE_EFFECTIF_SETTINGS_DOCUMENT) ||
    await getDocument(STAGE_SETTINGS_COLLECTION, EFFECTIF_SETTINGS_DOCUMENT)
  );
}

async function readCompanyWarnings(companyRows) {
  const companyStudentIds = new Set(companyRows
    .map(row => normalizeIdUnique(row.normalizedIdUnique || row.idUnique))
    .filter(Boolean));
  if (!companyStudentIds.size) return [];

  try {
    const settings = await readModuleEffectifSettings();
    const cursusKey = buildCursusKey(settings || {});
    if (!cursusKey) return [];

    const warningRows = await Promise.all([...companyStudentIds].map(async studentId => ({
      studentId,
      row: await getDocument(STUDENT_MODULES_COLLECTION, `${cursusKey}__${studentId}`)
    })));

    return warningRows.reduce((warnings, { studentId, row }) => {
      const warning = sanitizeCompanyWarning(row);
      if (warning) warnings.push({ studentId, ...warning });
      return warnings;
    }, []);
  } catch (error) {
    console.warn("Lecture des avertissements entreprise impossible :", error?.message || error);
    return [];
  }
}

function sanitizeCompanyArchive(archive, companyId) {
  const stageRows = (Array.isArray(archive.stageValidations) ? archive.stageValidations : [])
    .filter(row => String(row?.companyId || "") === companyId)
    .map(row => ({
      firebaseId: String(row?.firebaseId || ""),
      idUnique: String(row?.idUnique || ""),
      normalizedIdUnique: normalizeIdUnique(row?.normalizedIdUnique || row?.idUnique),
      companyId,
      companyName: String(row?.companyName || ""),
      status: String(row?.status || "approved")
    }));
  const examRows = (Array.isArray(archive.examParticipants) ? archive.examParticipants : [])
    .map(row => ({
      firebaseId: String(row?.firebaseId || ""),
      idUnique: String(row?.idUnique || ""),
      normalizedIdUnique: normalizeIdUnique(row?.normalizedIdUnique || row?.idUnique),
      studentName: String(row?.studentName || "Nom non renseigné"),
      totalScore: Number(row?.totalScore || 0),
      maxScore: Number(row?.maxScore || 50),
      status: String(row?.status || "pending"),
      companyId: String(row?.companyId || ""),
      companyName: String(row?.companyName || "")
    }));

  if (!stageRows.length && !examRows.length) return null;
  return {
    firebaseId: String(archive.id || ""),
    title: String(archive.title || ""),
    startDate: String(archive.startDate || ""),
    endDate: String(archive.endDate || ""),
    startDisplay: String(archive.startDisplay || ""),
    endDisplay: String(archive.endDisplay || ""),
    stageValidations: stageRows,
    examParticipants: examRows,
    summary: {
      totalStages: stageRows.length,
      totalExams: examRows.length,
      approved: examRows.filter(row => row.status === "approved").length,
      rejected: examRows.filter(row => row.status === "rejected").length,
      pending: examRows.filter(row => row.status !== "approved" && row.status !== "rejected").length
    },
    createdAt: archive.createdAt || null
  };
}

async function readCompanyArchives(session) {
  const rows = await listDocuments(STAGE_ARCHIVE_COLLECTION);
  return rows
    .map(row => sanitizeCompanyArchive(row, session.companyId))
    .filter(Boolean)
    .sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")));
}

function sanitizeStudentProgress(row) {
  if (!row) return null;

  const checks = row.checks && typeof row.checks === "object" ? row.checks : {};
  const dates = row.dates && typeof row.dates === "object" ? row.dates : {};
  const readCheck = key => isChecked(checks[key] ?? row[key]);
  const readDate = key => String(dates[key] || "").trim();

  return {
    idUnique: String(row.idUnique || ""),
    normalizedIdUnique: normalizeIdUnique(
      row.normalizedIdUnique || row.studentId || row.idUnique || row.id
    ),
    studentName: String(row.studentName || ""),
    checks: {
      module1: readCheck("module1"),
      module2: readCheck("module2"),
      module3: readCheck("module3"),
      module4: readCheck("module4")
    },
    dates: {
      module1: readDate("module1"),
      module2: readDate("module2"),
      module3: readDate("module3"),
      module4: readDate("module4")
    }
  };
}

async function readCompanyData(session, kind, request) {
  if (kind === "stages") {
    const rows = await listDocuments(STAGE_COLLECTION);
    const companyRows = rows.filter(row => row.companyId === session.companyId);
    return {
      rows: companyRows,
      directory: rows.map(row => ({
        idUnique: String(row.idUnique || ""),
        normalizedIdUnique: normalizeIdUnique(row.normalizedIdUnique || row.idUnique),
        companyId: String(row.companyId || ""),
        companyName: String(row.companyName || "")
      })).filter(row => row.normalizedIdUnique && row.companyId),
      warnings: await readCompanyWarnings(companyRows)
    };
  }
  if (kind === "exams") {
    const rows = await listDocuments(EXAM_COLLECTION);
    return rows.filter(row => row.archived !== true);
  }
  if (kind === "archives") {
    return readCompanyArchives(session);
  }
  if (kind === "student-progress") {
    const requestedId = normalizeIdUnique(getRequestUrl(request).searchParams.get("id"));
    if (!requestedId) {
      const error = new Error("Élève introuvable.");
      error.status = 400;
      throw error;
    }

    const settings = await readModuleEffectifSettings();
    const cursusKey = buildCursusKey(settings || {});
    const matchingRow = cursusKey
      ? await getDocument(STUDENT_MODULES_COLLECTION, `${cursusKey}__${requestedId}`)
      : null;

    return { student: sanitizeStudentProgress(matchingRow) };
  }
  const error = new Error("Données demandées invalides.");
  error.status = 400;
  throw error;
}

async function addCompanyStages(session, body) {
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : [body.idUnique])
    .map(value => String(value || "").trim())
    .filter(Boolean))]
    .slice(0, 250);
  if (!ids.length) {
    const error = new Error("Aucun ID Unique fourni.");
    error.status = 400;
    throw error;
  }

  const existingRows = await listDocuments(STAGE_COLLECTION);
  const existing = new Set(existingRows
    .filter(row => row.companyId === session.companyId)
    .map(row => normalizeIdUnique(row.normalizedIdUnique || row.idUnique)));
  let added = 0;
  let skipped = 0;

  for (const idUnique of ids) {
    const normalizedIdUnique = normalizeIdUnique(idUnique);
    if (!normalizedIdUnique || existing.has(normalizedIdUnique)) {
      skipped += 1;
      continue;
    }

    const documentId = `${session.companyId}__${normalizedIdUnique}`;
    await upsertDocument(STAGE_COLLECTION, documentId, {
      idUnique,
      normalizedIdUnique,
      companyId: session.companyId,
      companyName: session.companyName,
      status: "approved",
      addedBy: `entreprise:${session.companyId}`,
      addedByRole: "company",
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString()
    });
    existing.add(normalizedIdUnique);
    added += 1;
  }

  return { added, skipped };
}

async function deleteCompanyStage(session, request) {
  const documentId = String(getRequestUrl(request).searchParams.get("id") || "").trim();
  if (!documentId.startsWith(`${session.companyId}__`)) {
    const error = new Error("Cet ID n’appartient pas à votre entreprise.");
    error.status = 403;
    throw error;
  }

  const { rows: ownedRows } = await readCompanyData(session, "stages");
  if (!ownedRows.some(row => row.id === documentId)) {
    const error = new Error("ID stagiaire introuvable.");
    error.status = 404;
    throw error;
  }
  await deleteDocument(STAGE_COLLECTION, documentId);
  return { deleted: true };
}

module.exports = async function handler(request, response) {
  try {
    const session = await requireCompany(request);
    const url = getRequestUrl(request);
    const kind = String(url.searchParams.get("kind") || "stages");

    if (request.method === "GET") {
      const data = await readCompanyData(session, kind, request);
      sendJson(
        response,
        200,
        kind === "stages" || kind === "student-progress" ? data : { rows: data }
      );
      return;
    }

    if (request.method === "POST") {
      assertSameOrigin(request);
      if (session.adminPreview) throw Object.assign(new Error("Aperçu administrateur en lecture seule."), { status: 403 });
      if (kind !== "stages") throw Object.assign(new Error("Action refusée."), { status: 403 });
      sendJson(response, 200, await addCompanyStages(session, readBody(request)));
      return;
    }

    if (request.method === "DELETE") {
      assertSameOrigin(request);
      if (session.adminPreview) throw Object.assign(new Error("Aperçu administrateur en lecture seule."), { status: 403 });
      if (kind !== "stages") throw Object.assign(new Error("Action refusée."), { status: 403 });
      sendJson(response, 200, await deleteCompanyStage(session, request));
      return;
    }

    sendJson(response, 405, { error: "Méthode non autorisée." });
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error("Accès entreprise aux stages impossible :", error);
    sendJson(response, status, {
      error: status >= 500 ? "Données temporairement indisponibles." : error.message
    });
  }
};
