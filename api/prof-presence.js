const { verifyFirebaseProfAccess } = require("../lib/server/firebase-prof-access.js");
const { listDocuments, upsertDocument } = require("../lib/server/firestore-service-account.js");
const {
  PRESENCE_COLLECTION,
  PRESENCE_DOCUMENT_PREFIX,
  buildPresence,
  listActivePresences,
  normalizeSection
} = require("../lib/server/prof-presence.js");

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
  const match = String(req.headers?.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  if (typeof req[Symbol.asyncIterator] !== "function") return {};

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", "POST, DELETE");
    sendJson(res, 405, { error: "Méthode non autorisée." });
    return;
  }

  const idToken = getBearerToken(req);
  if (!idToken) {
    sendJson(res, 401, { error: "Connexion professeur requise." });
    return;
  }

  try {
    const access = await verifyFirebaseProfAccess(idToken);
    if (!access.allowed) {
      sendJson(res, 403, { error: "Accès réservé aux professeurs." });
      return;
    }

    const now = Date.now();
    const body = req.method === "POST" ? await readJsonBody(req) : {};
    const section = req.method === "POST" ? normalizeSection(body.section) : "dashboard";
    if (!section) {
      sendJson(res, 400, { error: "Rubrique professeur inconnue." });
      return;
    }

    const presence = buildPresence(access, section, now);
    if (req.method === "DELETE") presence.active = false;
    await upsertDocument(PRESENCE_COLLECTION, `${PRESENCE_DOCUMENT_PREFIX}${access.user.localId}`, presence);

    if (req.method === "DELETE") {
      sendJson(res, 200, { ok: true, offline: true });
      return;
    }

    const documents = await listDocuments(PRESENCE_COLLECTION);

    sendJson(res, 200, {
      ok: true,
      refreshAfterMs: 10_000,
      presences: listActivePresences(documents, now)
    });
  } catch (error) {
    console.error("Présence professeur indisponible :", error);
    const status = Number(error?.status);
    sendJson(res, status >= 400 && status < 500 ? status : 503, {
      error: "Présence des professeurs momentanément indisponible.",
      details: String(error?.message || error).slice(0, 180)
    });
  }
};
