const crypto = require("crypto");
const { verifyFirebaseProfAccess } = require("../lib/server/firebase-prof-access.js");

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
      ],
      defaultSpreadsheetId: "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY",
      defaultGid: "282279229"
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
      ],
      defaultSpreadsheetId: "1rroFCRTih9jdnIJmp5n2WvXagITjaARiv4i0b-JejvU",
      defaultGid: "574123607"
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
      ],
      defaultSpreadsheetId: "1Vv6XRfEKpCJGVFtGKoauE0rFyOTlEhuLHR_qUyfwqZw",
      defaultGid: "848029927"
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
      ],
      defaultSpreadsheetId: "1mkKA6K9f6n6sScfG93hShySKkOgxCDZQXwDL0LafvEQ",
      defaultGid: "154372807"
    }
  }
};

const SOURCE_DOCS = {
  examResponses: "examResponses",
  customResponses: "customResponses"
};

const EFFECTIF_SOURCE = "effectif";
const EFFECTIF_SHEET_KEY = "current";

let googleAccessTokenCache = null;

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

function getGoogleServiceAccount() {
  const email = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "")
    .replace(/\\n/g, "\n")
    .trim();

  return email && privateKey ? { email, privateKey } : null;
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getGoogleAccessToken() {
  const serviceAccount = getGoogleServiceAccount();
  if (!serviceAccount) return "";

  if (googleAccessTokenCache?.token && googleAccessTokenCache.expiresAt > Date.now() + 60_000) {
    return googleAccessTokenCache.token;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = encodeBase64Url(JSON.stringify({
    iss: serviceAccount.email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600
  }));
  const unsignedToken = `${header}.${claim}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsignedToken)
    .sign(serviceAccount.privateKey);
  const assertion = `${unsignedToken}.${encodeBase64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    throw new Error(`Authentification Google privée impossible (${response.status}).`);
  }

  googleAccessTokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(300, Number(payload.expires_in) || 3600) * 1000
  };

  return googleAccessTokenCache.token;
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows) {
  return (rows || [])
    .map(row => (row || []).map(escapeCsvCell).join(","))
    .join("\r\n");
}

async function fetchPrivateGoogleCsv({ spreadsheetId, gid }) {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return "";

  const headers = { Authorization: `Bearer ${accessToken}` };
  const metadataResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`,
    { headers, cache: "no-store" }
  );

  if (!metadataResponse.ok) {
    throw new Error(`Feuille Google privée inaccessible (${metadataResponse.status}).`);
  }

  const metadata = await metadataResponse.json();
  const sheet = (metadata.sheets || []).find(item => String(item.properties?.sheetId) === String(gid));
  const sheetTitle = String(sheet?.properties?.title || "").trim();

  if (!sheetTitle) {
    throw new Error("Onglet Google Sheets introuvable côté serveur.");
  }

  const escapedTitle = `'${sheetTitle.replace(/'/g, "''")}'`;
  const valuesResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(escapedTitle)}?majorDimension=ROWS`,
    { headers, cache: "no-store" }
  );

  if (!valuesResponse.ok) {
    throw new Error(`Lecture Google privée impossible (${valuesResponse.status}).`);
  }

  const values = await valuesResponse.json();
  return rowsToCsv(values.values || []);
}

function decodeJwtPayload(idToken) {
  try {
    const payload = String(idToken || "").split(".")[1];
    if (!payload) return {};

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch (error) {
    console.warn("Décodage token Firebase impossible :", error);
    return {};
  }
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
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      }
    );

    if (response.ok) {
      const data = await response.json();
      const user = data.users?.[0];

      if (user?.email) return user;
    }

    console.warn("Lookup Firebase refusé, fallback Firestore :", response.status);
  } catch (error) {
    console.warn("Lookup Firebase indisponible, fallback Firestore :", error);
  }

  const payload = decodeJwtPayload(idToken);
  const email = payload.email || payload.firebase?.identities?.email?.[0] || "";

  if (!email) {
    throw new Error("Token Firebase illisible.");
  }

  return { email };
}

async function getFirestoreDocument(pathParts, idToken) {
  const encodedPath = pathParts.map(part => encodeURIComponent(part)).join("/");
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${encodedPath}`;
  const retryDelays = [0, 180, 620];
  let response;

  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt]) {
      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
    }

    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    });

    if (response.status !== 429 || attempt === retryDelays.length - 1) break;
  }

  if (response.status === 404) return {};

  if (!response.ok) {
    const error = new Error(`Lecture Firebase impossible (${response.status}).`);
    error.status = response.status;
    throw error;
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

async function resolveEffectifSheet(idToken, clientFallback = {}) {
  let settings;

  try {
    settings = await getFirestoreDocument(["stageSettings", "effectif"], idToken);
  } catch (error) {
    const spreadsheetId = extractSpreadsheetId(clientFallback.spreadsheetId);
    const gid = safeGid(clientFallback.gid);
    const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

    if (!transientStatuses.has(Number(error?.status)) || !spreadsheetId || !gid) throw error;

    console.warn(`Réglage effectif Firebase indisponible (${error.status}), utilisation publique du réglage déjà vérifié côté professeur.`);
    return { spreadsheetId, gid, publicOnly: true };
  }

  const spreadsheetId =
    extractSpreadsheetId(settings.spreadsheetId) ||
    extractSpreadsheetId(settings.spreadsheetUrl) ||
    extractSpreadsheetId(settings.link) ||
    extractSpreadsheetId(settings.url);
  const gid =
    extractGid(settings.gid) ||
    extractGid(settings.spreadsheetId) ||
    extractGid(settings.spreadsheetUrl) ||
    extractGid(settings.link) ||
    extractGid(settings.url);

  if (!spreadsheetId || !gid) {
    throw new Error("Le cursus actif est incomplet dans les réglages.");
  }

  return { spreadsheetId, gid };
}

async function resolveSheet(source, sheetKey, idToken, options = {}) {
  const safeSheetKey = normalizeSheetKey(sheetKey);

  if (source === EFFECTIF_SOURCE && safeSheetKey === EFFECTIF_SHEET_KEY) {
    return resolveEffectifSheet(idToken, options.effectifFallback);
  }

  const safeSource = SOURCE_DOCS[source] ? source : "";

  if (!safeSource || !safeSheetKey) {
    throw new Error("Feuille demandée invalide.");
  }

  const allowedSheet = ALLOWED_SHEETS[safeSource]?.[safeSheetKey];

  if (!allowedSheet) {
    throw new Error("Feuille non autorisée.");
  }

  const serverFallback = {
    spreadsheetId:
      extractSpreadsheetId(readFirstEnv(allowedSheet.spreadsheetIdEnv)) ||
      allowedSheet.defaultSpreadsheetId ||
      "",
    gid:
      extractGid(readFirstEnv(allowedSheet.gidEnv)) ||
      extractGid(readFirstEnv(allowedSheet.spreadsheetIdEnv)) ||
      allowedSheet.defaultGid ||
      ""
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

function buildGoogleCsvUrls({ spreadsheetId, gid }) {
  const encodedId = encodeURIComponent(spreadsheetId);
  const encodedGid = encodeURIComponent(gid);

  return [
    `https://docs.google.com/spreadsheets/d/${encodedId}/export?format=csv&gid=${encodedGid}`,
    `https://docs.google.com/spreadsheets/d/${encodedId}/gviz/tq?tqx=out:csv&gid=${encodedGid}`
  ];
}

async function fetchGoogleCsv(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "text/csv,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 Universite-Mecanique-Secure-Sheets/1.0"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      statusText: response.statusText,
      text
    };
  }

  return {
    ok: true,
    text
  };
}

async function fetchCsv({ spreadsheetId, gid, publicOnly = false }) {
  if (!spreadsheetId || !gid) {
    throw new Error("Réglage Google Sheets incomplet côté serveur.");
  }

  // Le repli fourni par le navigateur ne doit jamais donner accès aux feuilles
  // privées du compte de service. Il est limité aux exports déjà publics.
  if (!publicOnly && getGoogleServiceAccount()) {
    return fetchPrivateGoogleCsv({ spreadsheetId, gid });
  }

  const attempts = [];

  for (const url of buildGoogleCsvUrls({ spreadsheetId, gid })) {
    try {
      const result = await fetchGoogleCsv(url);

      if (result.ok) {
        return result.text;
      }

      attempts.push(`${result.status}${result.statusText ? ` ${result.statusText}` : ""}`);
    } catch (error) {
      attempts.push(error.message || "erreur réseau");
    }
  }

  throw new Error(`Google Sheets a refusé la lecture (${attempts.join(" puis ")}).`);
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

    const access = await verifyFirebaseProfAccess(idToken);

    if (!access.allowed) {
      sendJson(res, 403, { error: "Accès réservé aux professeurs." });
      return;
    }

    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const source = url.searchParams.get("source") || "";
    const sheet = url.searchParams.get("sheet") || "";
    const resolvedSheet = await resolveSheet(source, sheet, idToken, {
      effectifFallback: {
        spreadsheetId: url.searchParams.get("spreadsheetId") || "",
        gid: url.searchParams.get("gid") || ""
      }
    });
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
