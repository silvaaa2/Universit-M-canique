const { sendJson } = require("../../lib/server/discord-prof-auth.js");
const {
  assertSameOrigin,
  validateStageCompanySession
} = require("../../lib/server/unified-access.js");
const {
  deleteDocument,
  listDocuments,
  upsertDocument
} = require("../../lib/server/firestore-service-account.js");

const STAGE_COLLECTION = "stageValidations";
const EXAM_COLLECTION = "examAnswerStatuses";
const STUDENT_MODULES_COLLECTION = "studentModules";

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
      module4: readCheck("module4"),
      verif3: readCheck("verif3"),
      verif4: readCheck("verif4")
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
    return {
      rows: rows.filter(row => row.companyId === session.companyId),
      directory: rows.map(row => ({
        idUnique: String(row.idUnique || ""),
        normalizedIdUnique: normalizeIdUnique(row.normalizedIdUnique || row.idUnique),
        companyId: String(row.companyId || ""),
        companyName: String(row.companyName || "")
      })).filter(row => row.normalizedIdUnique && row.companyId)
    };
  }
  if (kind === "exams") {
    const rows = await listDocuments(EXAM_COLLECTION);
    return rows.filter(row => row.archived !== true);
  }
  if (kind === "student-progress") {
    const requestedId = normalizeIdUnique(getRequestUrl(request).searchParams.get("id"));
    if (!requestedId) {
      const error = new Error("Élève introuvable.");
      error.status = 400;
      throw error;
    }

    const rows = await listDocuments(STUDENT_MODULES_COLLECTION);
    const matchingRow = rows.find(row => {
      return normalizeIdUnique(
        row.normalizedIdUnique || row.studentId || row.idUnique || row.id
      ) === requestedId;
    });

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
