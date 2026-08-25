const crypto = require("crypto");

const FIREBASE_PROJECT_ID = "universit-4b11e";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

let accessTokenCache = null;

function getServiceAccount() {
  const email = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "")
    .replace(/\\n/g, "\n")
    .trim();

  if (!email || !privateKey) {
    const error = new Error("Compte de service Google non configuré.");
    error.status = 503;
    throw error;
  }

  return { email, privateKey };
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function getFirestoreAccessToken(fetchImpl = fetch) {
  if (accessTokenCache?.token && accessTokenCache.expiresAt > Date.now() + 60_000) {
    return accessTokenCache.token;
  }

  const serviceAccount = getServiceAccount();
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = encodeBase64Url(JSON.stringify({
    iss: serviceAccount.email,
    scope: FIRESTORE_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600
  }));
  const unsignedToken = `${header}.${claim}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsignedToken)
    .sign(serviceAccount.privateKey);
  const assertion = `${unsignedToken}.${encodeBase64Url(signature)}`;
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.access_token) {
    const error = new Error(`Authentification Firestore impossible (${response.status}).`);
    error.status = 503;
    throw error;
  }

  accessTokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(300, Number(payload.expires_in) || 3600) * 1000
  };
  return accessTokenCache.token;
}

function encodeFirestoreValue(value) {
  if (typeof value === "boolean") return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
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

module.exports = {
  FIREBASE_PROJECT_ID,
  decodeFirestoreFields,
  encodeFirestoreFields,
  getFirestoreAccessToken,
  listDocuments,
  upsertDocument
};
