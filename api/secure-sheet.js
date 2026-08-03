const FIREBASE_WEB_API_KEY = "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c";
const FIREBASE_PROJECT_ID = "universit-4b11e";

const ALLOWED_SHEETS = {
  examResponses: {
    "exam-form-1": {
      spreadsheetIdEnv: [
        "EXAM_RESPONSES_SPREADSHEET_ID",
        "EXAM_RESPONSES_SHEET_ID",
        "EXAM_RESPONSES_URL",
        "EXAM_SPREADSHEET_ID",
        "EXAM_SHEET_ID"
      ],
      gidEnv: [
        "EXAM_RESPONSES_GID",
        "EXAM_RESPONSES_SHEET_GID",
        "EXAM_GID"
      ]
    }
  },
  customResponses: {
    sentinelClassic: {
      spreadsheetIdEnv: [
        "CUSTOM_SENTINEL_CLASSIC_SPREADSHEET_ID",
        "CUSTOM_SENTINEL_CLASSIC_SHEET_ID",
        "CUSTOM_SENTINEL_CLASSIC_URL",
        "CUSTOM_SENTINEL_SPREADSHEET_ID",
        "CUSTOM_FACILE_SPREADSHEET_ID",
        "CUSTOM_FACILE_SHEET_ID",
        "CUSTOM_FACILE_URL"
      ],
      gidEnv: [
        "CUSTOM_SENTINEL_CLASSIC_GID",
        "CUSTOM_SENTINEL_GID",
        "CUSTOM_FACILE_GID"
      ]
    },
    argento2f: {
      spreadsheetIdEnv: [
        "CUSTOM_ARGENTO_2F_SPREADSHEET_ID",
        "CUSTOM_ARGENTO_2F_SHEET_ID",
        "CUSTOM_ARGENTO_2F_URL",
        "CUSTOM_ARGENTO2F_SPREADSHEET_ID",
        "CUSTOM_ARGENTO2F_SHEET_ID",
        "CUSTOM_MOYEN_SPREADSHEET_ID",
        "CUSTOM_MOYEN_SHEET_ID",
        "CUSTOM_MOYEN_URL"
      ],
      gidEnv: [
        "CUSTOM_ARGENTO_2F_GID",
        "CUSTOM_ARGENTO2F_GID",
        "CUSTOM_MOYEN_GID"
      ]
    },
    cypher: {
      spreadsheetIdEnv: [
        "CUSTOM_CYPHER_SPREADSHEET_ID",
        "CUSTOM_CYPHER_SHEET_ID",
        "CUSTOM_CYPHER_URL",
        "CUSTOM_DIFFICILE_SPREADSHEET_ID",
        "CUSTOM_DIFFICILE_SHEET_ID",
        "CUSTOM_DIFFICILE_URL"
      ],
      gidEnv: [
        "CUSTOM_CYPHER_GID",
        "CUSTOM_DIFFICILE_GID"
      ]
    }
  }
};

const SOURCE_DOCS = {
  examResponses: "examResponses",
  customResponses: "customResponses"
};

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function normalizeSheetKey(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
}

function extractSpreadsheetId(value) {
  const text = String(value || "").trim();
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
  return "";
}

function safeGid(value) {
  const text = String(value || "").trim();
  return /^\d+$/.test(text) ? text : "";
}

function extractGid(value) {
  const text = String(value || "").trim();
  const direct = safeGid(text);
  if (direct) return direct;

  const match = text.match(/[?#&]gid=(\d+)/);
  return match?.[1] || "";
}

function readFirstEnv(names) {
  const envNames = Array.isArray(names) ? names : [names];
  for (const name of envNames) {
    const value = process.env[name];
    if (String(value || "").trim()) return value;
  }
  return "";
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(decodeFirestoreValue);
  }
  if ("mapValue" in value) {
    return decodeFirestoreFields(value.mapValue.fields || {});
  }
  return null;
}

function decodeFirestoreFields(fields) {
  return Object.entries(fields || {}).reduce((data, [key, value]) => {
    data[key] = decodeFirestoreValue(value);
    return data;
  }, {});
}

async function getFirebaseUser(idToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    }
  );

  if (!response.ok) {
    throw new Error("Token Firebase invalide.");
  }

  const data = await response.json();
  const user = data.users?.[0];

  if (!user?.email) {
    throw new Error("Utilisateur Firebase introuvable.");
  }

  return user;
}

async function getFirestoreDocument(pathParts, idToken) {
  const encodedPath = pathParts.map(part => encodeURIComponent(part)).join("/");
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${encodedPath}`,
    {
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    }
  );

  if (response.status === 404) return {};

  if (!response.ok) {
    throw new Error(`Lecture Firebase impossible (${response.status}).`);
  }

  const data = await response.json();
  return decodeFirestoreFields(data.fields || {});
}

async function getUserAccess(email, idToken) {
  const data = await getFirestoreDocument(["users", email], idToken);

  return {
    role: data.role || null,
    admin: data.admin === true
  };
}

async function resolveSheet(source, sheetKey, idToken) {
  const safeSource = SOURCE_DOCS[source] ? source : "";
  const safeSheetKey = normalizeSheetKey(sheetKey);

  if (!safeSource || !safeSheetKey) {
    throw new Error("Feuille demandée invalide.");
  }

  const allowedSheet = ALLOWED_SHEETS[safeSource]?.[safeSheetKey];

  if (!allowedSheet) {
    throw new Error("Feuille non autorisée.");
  }

  const serverFallback = {
    spreadsheetId: extractSpreadsheetId(readFirstEnv(allowedSheet.spreadsheetIdEnv)),
    gid:
      extractGid(readFirstEnv(allowedSheet.gidEnv)) ||
      extractGid(readFirstEnv(allowedSheet.spreadsheetIdEnv))
  };

  let settings = {};

  try {
    settings = await getFirestoreDocument(["profSettings", SOURCE_DOCS[safeSource]], idToken);
  } catch (error) {
    console.warn("Réglage feuille indisponible, fallback utilisé :", error);
  }

  const sheetSettings =
    settings.sheets?.[safeSheetKey] ||
    settings[safeSheetKey] ||
    {};

  if (safeSource === "examResponses") {
    const spreadsheetId =
      extractSpreadsheetId(settings.spreadsheetUrl) ||
      extractSpreadsheetId(settings.spreadsheetId) ||
      extractSpreadsheetId(sheetSettings.spreadsheetUrl) ||
      extractSpreadsheetId(sheetSettings.spreadsheetId) ||
      serverFallback.spreadsheetId;

    return {
      spreadsheetId,
      gid:
        extractGid(settings.gid) ||
        extractGid(settings.spreadsheetUrl) ||
        extractGid(settings.spreadsheetId) ||
        extractGid(sheetSettings.gid) ||
        extractGid(sheetSettings.spreadsheetUrl) ||
        extractGid(sheetSettings.spreadsheetId) ||
        serverFallback.gid
    };
  }

  const spreadsheetId =
    extractSpreadsheetId(sheetSettings.spreadsheetUrl) ||
    extractSpreadsheetId(sheetSettings.spreadsheetId) ||
    extractSpreadsheetId(settings[`${safeSheetKey}SpreadsheetUrl`]) ||
    extractSpreadsheetId(settings[`${safeSheetKey}SpreadsheetId`]) ||
    serverFallback.spreadsheetId;

  return {
    spreadsheetId,
    gid:
      extractGid(sheetSettings.gid) ||
      extractGid(sheetSettings.spreadsheetUrl) ||
      extractGid(sheetSettings.spreadsheetId) ||
      extractGid(settings[`${safeSheetKey}Gid`]) ||
      extractGid(settings[`${safeSheetKey}SpreadsheetUrl`]) ||
      extractGid(settings[`${safeSheetKey}SpreadsheetId`]) ||
      serverFallback.gid
  };
}

async function fetchCsv({ spreadsheetId, gid }) {
  if (!spreadsheetId || !gid) {
    throw new Error("Réglage Google Sheets incomplet côté serveur.");
  }

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Google Sheets a refusé la lecture (${response.status}).`);
  }

  return response.text();
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Méthode non autorisée." });
    return;
  }

  try {
    const idToken = getBearerToken(req);

    if (!idToken) {
      sendJson(res, 401, { error: "Connexion professeur requise." });
      return;
    }

    const user = await getFirebaseUser(idToken);
    const access = await getUserAccess(user.email, idToken);

    if (access.role !== "prof" && access.admin !== true) {
      sendJson(res, 403, { error: "Accès réservé aux professeurs." });
      return;
    }

    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const source = url.searchParams.get("source") || "";
    const sheet = url.searchParams.get("sheet") || "";
    const resolvedSheet = await resolveSheet(source, sheet, idToken);
    const csv = await fetchCsv(resolvedSheet);

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(csv);
  } catch (error) {
    console.error("Lecture sécurisée Google Sheets impossible :", error);
    sendJson(res, 500, {
      error: error.message || "Lecture Google Sheets impossible."
    });
  }
};
