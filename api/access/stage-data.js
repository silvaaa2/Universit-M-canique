const { sendJson } = require("../../lib/server/discord-prof-auth.js");
const { recordAuditEvent } = require("../../lib/server/audit-log.js");
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
const COLLECTION_CACHE_TTL_MS = 90_000;
const ARCHIVE_CACHE_TTL_MS = 5 * 60_000;
const DOCUMENT_CACHE_TTL_MS = 2 * 60_000;

const collectionCache = new Map();
const collectionRequests = new Map();
const documentCache = new Map();
const documentRequests = new Map();

function isTemporaryFirebaseReadError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toUpperCase();
  return status === 408
    || status === 425
    || status === 429
    || status >= 500
    || error?.name === "TypeError"
    || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH"].includes(code);
}

async function listDocumentsCached(collectionName, ttlMs = COLLECTION_CACHE_TTL_MS) {
  const cached = collectionCache.get(collectionName);
  if (cached?.expiresAt > Date.now()) return cached.rows;
  if (collectionRequests.has(collectionName)) return collectionRequests.get(collectionName);

  const request = listDocuments(collectionName)
    .then(rows => {
      collectionCache.set(collectionName, {
        rows,
        expiresAt: Date.now() + ttlMs
      });
      return rows;
    })
    .catch(error => {
      if (cached?.rows && isTemporaryFirebaseReadError(error)) {
        console.warn(`Lecture ${collectionName} limitée, utilisation du cache serveur.`);
        return cached.rows;
      }
      throw error;
    })
    .finally(() => collectionRequests.delete(collectionName));

  collectionRequests.set(collectionName, request);
  return request;
}

async function getDocumentCached(collectionName, documentId, ttlMs = DOCUMENT_CACHE_TTL_MS) {
  const key = `${collectionName}/${documentId}`;
  const cached = documentCache.get(key);
  if (cached?.expiresAt > Date.now()) return cached.value;
  if (documentRequests.has(key)) return documentRequests.get(key);

  const request = getDocument(collectionName, documentId)
    .then(value => {
      documentCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch(error => {
      if (cached && isTemporaryFirebaseReadError(error)) {
        console.warn(`Lecture ${key} limitée, utilisation du cache serveur.`);
        return cached.value;
      }
      throw error;
    })
    .finally(() => documentRequests.delete(key));

  documentRequests.set(key, request);
  return request;
}

function invalidateCollectionCache(collectionName) {
  collectionCache.delete(collectionName);
  for (const key of documentCache.keys()) {
    if (key.startsWith(`${collectionName}/`)) documentCache.delete(key);
  }
}

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
    await getDocumentCached(STAGE_SETTINGS_COLLECTION, EFFECTIF_SETTINGS_DOCUMENT, 5 * 60_000) ||
    await getDocumentCached(STAGE_SETTINGS_COLLECTION, MODULE_EFFECTIF_SETTINGS_DOCUMENT, 5 * 60_000)
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
      row: await getDocumentCached(STUDENT_MODULES_COLLECTION, `${cursusKey}__${studentId}`)
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
  const effectifStudents = (Array.isArray(archive.effectifStudents) ? archive.effectifStudents : [])
    .map(row => ({
      idUnique: String(row?.idUnique || ""),
      normalizedIdUnique: normalizeIdUnique(row?.normalizedIdUnique || row?.idUnique),
      studentName: String(row?.studentName || "Nom non renseigné")
    }))
    .filter(row => row.normalizedIdUnique || row.studentName !== "Nom non renseigné");
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
    effectifStudents,
    stageValidations: stageRows,
    examParticipants: examRows,
    summary: {
      totalStages: stageRows.length,
      totalExams: examRows.length,
      totalEffectif: effectifStudents.length,
      approved: examRows.filter(row => row.status === "approved").length,
      rejected: examRows.filter(row => row.status === "rejected").length,
      pending: examRows.filter(row => row.status !== "approved" && row.status !== "rejected").length
    },
    createdAt: archive.createdAt || null
  };
}

async function readCompanyArchives(session) {
  const rows = await listDocumentsCached(STAGE_ARCHIVE_COLLECTION, ARCHIVE_CACHE_TTL_MS);
  return rows
    .map(row => sanitizeCompanyArchive(row, session.companyId))
    .filter(Boolean)
    .sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")));
}

async function readCompanyStages(session) {
  const rows = await listDocumentsCached(STAGE_COLLECTION);
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

async function readCompanyExams() {
  const rows = await listDocumentsCached(EXAM_COLLECTION);
  return rows.filter(row => row.archived !== true);
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
    return readCompanyStages(session);
  }
  if (kind === "exams") {
    return readCompanyExams();
  }
  if (kind === "archives") {
    return readCompanyArchives(session);
  }
  if (kind === "workspace") {
    const [stages, exams, archives] = await Promise.all([
      readCompanyStages(session),
      readCompanyExams(),
      readCompanyArchives(session)
    ]);
    return {
      stages,
      exams: { rows: exams },
      archives: { rows: archives }
    };
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
      ? await getDocumentCached(STUDENT_MODULES_COLLECTION, `${cursusKey}__${requestedId}`)
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

  const existingRows = await listDocumentsCached(STAGE_COLLECTION);
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
    invalidateCollectionCache(STAGE_COLLECTION);
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
  invalidateCollectionCache(STAGE_COLLECTION);
  return { deleted: true };
}

async function logCompanyAction(session, action, target = "", details = "") {
  return recordAuditEvent({
    actorType: "company",
    actorId: `company:${session.companyId}`,
    actorName: session.companyName,
    category: "entreprises",
    action,
    target,
    details
  }).catch(error => console.warn("Journal entreprise indisponible :", error?.message || error));
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
        kind === "stages" || kind === "student-progress" || kind === "workspace" ? data : { rows: data }
      );
      return;
    }

    if (request.method === "POST") {
      assertSameOrigin(request);
      if (session.adminPreview) throw Object.assign(new Error("Aperçu administrateur en lecture seule."), { status: 403 });
      const body = readBody(request);
      if (kind !== "stages") throw Object.assign(new Error("Action refusée."), { status: 403 });
      const result = await addCompanyStages(session, body);
      await logCompanyAction(session, "Ajout de stagiaires", `${result.added} ajouté(s)`, `${result.skipped} ignoré(s)`);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "DELETE") {
      assertSameOrigin(request);
      if (session.adminPreview) throw Object.assign(new Error("Aperçu administrateur en lecture seule."), { status: 403 });
      if (kind !== "stages") throw Object.assign(new Error("Action refusée."), { status: 403 });
      const documentId = String(getRequestUrl(request).searchParams.get("id") || "");
      const result = await deleteCompanyStage(session, request);
      await logCompanyAction(session, "Suppression d’un stagiaire", documentId);
      sendJson(response, 200, result);
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
