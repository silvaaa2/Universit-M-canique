const crypto = require("crypto");

const FIREBASE_PROJECT_ID = "universit-4b11e";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

let accessTokenCache = null;

async function getFirestoreAccessToken(fetchImpl = fetch) {
  if (accessTokenCache?.token && accessTokenCache.expiresAt > Date.now() + 60_000) {
    return accessTokenCache.token;
  }

  const serviceAccountEmail = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!serviceAccountEmail || !privateKey) {
    const error = new Error("Compte de service Firebase non configuré.");
    error.status = 503;
    throw error;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const base64Url = value => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const header = base64Url({ alg: "RS256", typ: "JWT" });
  const jwtPayload = base64Url({
    iss: serviceAccountEmail,
    scope: FIRESTORE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600
  });
  const unsignedToken = `${header}.${jwtPayload}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsignedToken).sign(privateKey).toString("base64url");
  const assertion = `${unsignedToken}.${signature}`;

  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const tokenPayload = await response.json().catch(() => ({}));

  if (!response.ok || !tokenPayload.access_token) {
    const error = new Error(`Session Firebase serveur impossible (${response.status}).`);
    error.status = 503;
    throw error;
  }

  accessTokenCache = {
    token: tokenPayload.access_token,
    expiresAt: Date.now() + Math.max(300, Number(tokenPayload.expires_in) || 3600) * 1000
  };
  return accessTokenCache.token;
}

function encodeFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFirestoreFields(value) } };
  }
  return { stringValue: String(value ?? "") };
}

function encodeFirestoreFields(data) {
  return Object.fromEntries(
    Object.entries(data || {}).map(([key, value]) => [key, encodeFirestoreValue(value)])
  );
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue === true;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
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
  return Object.fromEntries(
    Object.entries(fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)])
  );
}

function collectionUrl(collectionName, documentId = "") {
  const base = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${encodeURIComponent(collectionName)}`;
  return documentId ? `${base}/${encodeURIComponent(documentId)}` : base;
}

async function upsertDocument(collectionName, documentId, data, fetchImpl = fetch) {
  const accessToken = await getFirestoreAccessToken(fetchImpl);
  const response = await fetchImpl(collectionUrl(collectionName, documentId), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields: encodeFirestoreFields(data) })
  });

  if (!response.ok) {
    const error = new Error(`Enregistrement de la présence impossible (${response.status}).`);
    error.status = response.status === 403 ? 503 : response.status;
    throw error;
  }
}

async function listDocuments(collectionName, fetchImpl = fetch) {
  const accessToken = await getFirestoreAccessToken(fetchImpl);
  const url = new URL(collectionUrl(collectionName));
  url.searchParams.set("pageSize", "100");
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });

  if (!response.ok) {
    const error = new Error(`Lecture des présences impossible (${response.status}).`);
    error.status = response.status === 403 ? 503 : response.status;
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  return (payload.documents || []).map(document => ({
    id: String(document.name || "").split("/").pop() || "",
    ...decodeFirestoreFields(document.fields || {})
  }));
}

async function deleteDocument(collectionName, documentId, fetchImpl = fetch) {
  const accessToken = await getFirestoreAccessToken(fetchImpl);
  const response = await fetchImpl(collectionUrl(collectionName, documentId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok && response.status !== 404) {
    const error = new Error(`Suppression Firebase impossible (${response.status}).`);
    error.status = response.status === 403 ? 503 : response.status;
    throw error;
  }
}

module.exports = {
  FIREBASE_PROJECT_ID,
  decodeFirestoreFields,
  deleteDocument,
  encodeFirestoreFields,
  getFirestoreAccessToken,
  listDocuments,
  upsertDocument
};
