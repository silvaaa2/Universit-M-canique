const crypto = require("crypto");
const { verifyFirebaseProfAccess } = require("../lib/server/firebase-prof-access.js");
const { validateStageCompanySession } = require("../lib/server/unified-access.js");

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
const MODULE_EFFECTIF_SOURCE = "module-effectif";
const MODULE_WORKSPACE_SOURCE = "module-workspace";
const EFFECTIF_SHEET_KEY = "current";
const STUDENT_MODULES_COLLECTION = "studentModules";
const MODULE_CHECK_KEYS = new Set([
  "module1", "module2", "module3", "verif3", "module4", "verif4", "exam", "retakeExam"
]);
const MODULE_DATE_KEYS = new Set(["module1", "module2", "module3", "module4", "exam", "retakeExam"]);
const MODULE_WARNING_LEVELS = new Set(["none", "warning1", "warning2", "warning3", "refused"]);

let googleAccessTokenCache = null;
const GOOGLE_SHEET_TITLE_TTL_MS = 10 * 60_000;
const SHEET_CSV_CACHE_TTL_MS = 8_000;
const googleSheetTitleCache = new Map();
const sheetCsvCache = new Map();
const sheetCsvRequests = new Map();
const GOOGLE_RETRY_DELAYS_MS = [0, 250, 800];
const RETRYABLE_GOOGLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

async function fetchGoogleWithRetry(url, options = {}) {
  let response;
  let lastError;

  for (let attempt = 0; attempt < GOOGLE_RETRY_DELAYS_MS.length; attempt += 1) {
    if (GOOGLE_RETRY_DELAYS_MS[attempt]) {
      await new Promise(resolve => setTimeout(resolve, GOOGLE_RETRY_DELAYS_MS[attempt]));
    }

    try {
      response = await fetch(url, options);
      if (response.ok || !RETRYABLE_GOOGLE_STATUSES.has(response.status)) return response;
    } catch (error) {
      lastError = error;
    }
  }

  if (response) return response;
  throw lastError || new Error("Google Sheets est momentanément indisponible.");
}

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
  const response = await fetchGoogleWithRetry("https://oauth2.googleapis.com/token", {
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
  const titleCacheKey = `${spreadsheetId}:${gid}`;
  const cachedTitle = googleSheetTitleCache.get(titleCacheKey);
  let sheetTitle = cachedTitle?.expiresAt > Date.now() ? cachedTitle.value : "";

  if (!sheetTitle) {
    const metadataResponse = await fetchGoogleWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`,
      { headers, cache: "no-store" }
    );

    if (!metadataResponse.ok) {
      throw new Error(`Feuille Google privée inaccessible (${metadataResponse.status}).`);
    }

    const metadata = await metadataResponse.json();
    const sheet = (metadata.sheets || []).find(item => String(item.properties?.sheetId) === String(gid));
    sheetTitle = String(sheet?.properties?.title || "").trim();
    if (sheetTitle) {
      googleSheetTitleCache.set(titleCacheKey, {
        value: sheetTitle,
        expiresAt: Date.now() + GOOGLE_SHEET_TITLE_TTL_MS
      });
    }
  }

  if (!sheetTitle) {
    throw new Error("Onglet Google Sheets introuvable côté serveur.");
  }

  const escapedTitle = `'${sheetTitle.replace(/'/g, "''")}'`;
  const valuesResponse = await fetchGoogleWithRetry(
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
  if ("timestampValue" in value) return value.timestampValue;
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

    response = await fetch(url, idToken ? {
      headers: { Authorization: `Bearer ${idToken}` }
    } : { cache: "no-store" });

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

function encodeFirestoreValue(value, key = "") {
  if (key === "updatedAt" && typeof value === "string") {
    return { timestampValue: value };
  }
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(item => encodeFirestoreValue(item)) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFirestoreFields(value) } };
  }
  return { stringValue: String(value ?? "") };
}

function encodeFirestoreFields(data) {
  return Object.fromEntries(
    Object.entries(data || {}).map(([key, value]) => [key, encodeFirestoreValue(value, key)])
  );
}

function firestoreCollectionUrl(collectionName, documentId = "") {
  const base = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${encodeURIComponent(collectionName)}`;
  return documentId ? `${base}/${encodeURIComponent(documentId)}` : base;
}

async function listFirestoreDocuments(collectionName, idToken) {
  const documents = [];
  let pageToken = "";

  do {
    const url = new URL(firestoreCollectionUrl(collectionName));
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store"
    });

    if (!response.ok) {
      const error = new Error(`Lecture Firebase impossible (${response.status}).`);
      error.status = response.status;
      throw error;
    }

    const payload = await response.json().catch(() => ({}));
    documents.push(...(payload.documents || []).map(document => ({
      id: String(document.name || "").split("/").pop() || "",
      data: decodeFirestoreFields(document.fields || {})
    })));
    pageToken = String(payload.nextPageToken || "");
  } while (pageToken);

  return documents;
}

function cleanModuleText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanModuleMap(value, allowedKeys, normalizer) {
  return Object.fromEntries(
    Object.entries(value && typeof value === "object" ? value : {})
      .filter(([key]) => allowedKeys.has(key))
      .map(([key, item]) => [key, normalizer(item)])
  );
}

function normalizeModuleWrite(payload = {}, actorId = "professeur inconnu") {
  const documentId = cleanModuleText(payload.documentId, 500);
  const cursusKey = cleanModuleText(payload.cursusKey, 300);
  const studentId = cleanModuleText(payload.studentId || payload.normalizedIdUnique, 120).toLowerCase().replace(/\s+/g, "");

  if (!documentId || documentId.includes("/") || !documentId.startsWith("cursus_") || !documentId.includes("__")) {
    const error = new Error("Identifiant de progression invalide.");
    error.status = 400;
    throw error;
  }
  if (!cursusKey || !studentId || documentId !== `${cursusKey}__${studentId}`) {
    const error = new Error("Progression incohérente avec le cursus actif.");
    error.status = 400;
    throw error;
  }

  if (payload.action === "warning") {
    const warningLevel = cleanModuleText(payload.warningLevel, 24);
    return {
      documentId,
      data: {
        studentId,
        normalizedIdUnique: studentId,
        cursusKey,
        warningLevel: MODULE_WARNING_LEVELS.has(warningLevel) ? warningLevel : "none",
        warningComment: cleanModuleText(payload.warningComment, 1000),
        warningUpdatedAt: new Date().toISOString(),
        warningUpdatedBy: cleanModuleText(actorId, 180)
      }
    };
  }

  const checks = cleanModuleMap(payload.checks, MODULE_CHECK_KEYS, value => value === true);
  const dates = cleanModuleMap(payload.dates, MODULE_DATE_KEYS, value => {
    const date = cleanModuleText(value, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  });

  return {
    documentId,
    data: {
      idUnique: cleanModuleText(payload.idUnique, 120),
      studentId,
      normalizedIdUnique: studentId,
      studentName: cleanModuleText(payload.studentName, 160),
      searchText: cleanModuleText(payload.searchText, 320),
      cursusKey,
      cursusSpreadsheetId: cleanModuleText(payload.cursusSpreadsheetId, 160),
      cursusGid: cleanModuleText(payload.cursusGid, 40),
      checks,
      dates,
      updatedAt: new Date().toISOString(),
      updatedBy: cleanModuleText(actorId, 180)
    }
  };
}

async function writeFirestoreDocument(collectionName, documentId, data, idToken) {
  const url = new URL(firestoreCollectionUrl(collectionName, documentId));
  Object.keys(data).forEach(field => url.searchParams.append("updateMask.fieldPaths", field));
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields: encodeFirestoreFields(data) })
  });

  if (!response.ok) {
    const error = new Error(`Sauvegarde Firebase impossible (${response.status}).`);
    error.status = response.status;
    throw error;
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
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

async function resolveModuleEffectifSheet(idToken, clientFallback = {}) {
  let settings = {};
  try {
    settings = await getFirestoreDocument(["stageSettings", "moduleEffectif"], idToken);
  } catch (error) {
    console.warn("Réglage effectif modules indisponible, fallback stage utilisé :", error);
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

  if (spreadsheetId && gid) return { spreadsheetId, gid };
  return resolveEffectifSheet(idToken, clientFallback);
}

async function resolveSheet(source, sheetKey, idToken, options = {}) {
  const safeSheetKey = normalizeSheetKey(sheetKey);

  if (source === EFFECTIF_SOURCE && safeSheetKey === EFFECTIF_SHEET_KEY) {
    return resolveEffectifSheet(idToken, options.effectifFallback);
  }
  if (source === MODULE_EFFECTIF_SOURCE && safeSheetKey === EFFECTIF_SHEET_KEY) {
    return resolveModuleEffectifSheet(idToken, options.effectifFallback);
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
  const response = await fetchGoogleWithRetry(url, {
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

async function fetchCsvUncached({ spreadsheetId, gid, publicOnly = false }) {
  if (!spreadsheetId || !gid) {
    throw new Error("Réglage Google Sheets incomplet côté serveur.");
  }

  // Le repli fourni par le navigateur ne doit jamais donner accès aux feuilles
  // privées du compte de service. Il est limité aux exports déjà publics.
  const attempts = [];

  if (!publicOnly && getGoogleServiceAccount()) {
    try {
      return await fetchPrivateGoogleCsv({ spreadsheetId, gid });
    } catch (error) {
      // Le compte de service sert aussi à la connexion Discord. Il peut donc
      // être correctement configuré sans avoir été invité sur toutes les
      // feuilles de réponses. Dans ce cas, on conserve le repli public qui
      // faisait déjà fonctionner les formulaires partagés par lien.
      attempts.push(`accès privé : ${error.message || "erreur Google"}`);
    }
  }

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

async function fetchCsv(options) {
  const spreadsheetId = String(options?.spreadsheetId || "");
  const gid = String(options?.gid || "");
  const cacheKey = `${spreadsheetId}:${gid}:${options?.publicOnly === true ? "public" : "private"}`;
  const cached = sheetCsvCache.get(cacheKey);

  if (cached?.expiresAt > Date.now()) return cached.value;
  if (sheetCsvRequests.has(cacheKey)) return sheetCsvRequests.get(cacheKey);

  const request = fetchCsvUncached(options)
    .then(value => {
      sheetCsvCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + SHEET_CSV_CACHE_TTL_MS
      });
      return value;
    })
    .finally(() => sheetCsvRequests.delete(cacheKey));

  sheetCsvRequests.set(cacheKey, request);
  return request;
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { error: "Méthode non autorisée." });
    return;
  }

  try {
    const idToken = getBearerToken(req);
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const source = url.searchParams.get("source") || "";
    const sheet = url.searchParams.get("sheet") || "";

    let profAccess = null;
    if (idToken) {
      profAccess = await verifyFirebaseProfAccess(idToken);
      if (!profAccess.allowed) {
        sendJson(res, 403, { error: "Accès réservé aux professeurs." });
        return;
      }
    } else {
      const companySession = await validateStageCompanySession(req);
      const companyEffectifAccess = Boolean(companySession) && source === EFFECTIF_SOURCE && sheet === EFFECTIF_SHEET_KEY;
      if (!companyEffectifAccess) {
        sendJson(res, 401, { error: "Connexion requise." });
        return;
      }
    }

    if (source === MODULE_WORKSPACE_SOURCE) {
      if (!idToken || !profAccess?.allowed) {
        sendJson(res, 401, { error: "Connexion professeur requise." });
        return;
      }

      if (req.method === "POST") {
        const body = await readJsonBody(req);
        const normalized = normalizeModuleWrite(body, profAccess.actorId);
        await writeFirestoreDocument(
          STUDENT_MODULES_COLLECTION,
          normalized.documentId,
          normalized.data,
          idToken
        );
        sendJson(res, 200, { ok: true });
        return;
      }

      const resolvedSheet = await resolveModuleEffectifSheet(idToken, {
        spreadsheetId: url.searchParams.get("spreadsheetId") || "",
        gid: url.searchParams.get("gid") || ""
      });
      const [csv, progressDocuments] = await Promise.all([
        fetchCsv(resolvedSheet),
        listFirestoreDocuments(STUDENT_MODULES_COLLECTION, idToken)
      ]);
      sendJson(res, 200, {
        spreadsheetId: resolvedSheet.spreadsheetId,
        gid: resolvedSheet.gid,
        csv,
        progressDocuments
      });
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Méthode non autorisée pour cette feuille." });
      return;
    }

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
    if (
      (source === EFFECTIF_SOURCE || source === MODULE_EFFECTIF_SOURCE)
      && sheet === EFFECTIF_SHEET_KEY
    ) {
      res.setHeader("X-University-Spreadsheet-Id", resolvedSheet.spreadsheetId);
      res.setHeader("X-University-Sheet-Gid", resolvedSheet.gid);
    }
    res.end(csv);
  } catch (error) {
    console.error("Lecture sécurisée Google Sheets impossible :", error);
    sendJson(res, Number(error?.status) || 500, {
      error: error.message || "Lecture Google Sheets impossible."
    });
  }
};

// Réutilisé côté serveur lors de l’archivage d’un cursus afin de figer
// l’effectif complet, y compris les élèves sans progression enregistrée.
module.exports.fetchCsv = fetchCsv;
