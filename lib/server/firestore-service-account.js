const { createFirebaseCustomToken } = require("./discord-prof-auth.js");

const FIREBASE_PROJECT_ID = "universit-4b11e";
const FIREBASE_WEB_API_KEY = "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c";
const FIREBASE_TOKEN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_WEB_API_KEY}`;

let accessTokenCache = null;

async function getFirestoreAccessToken(fetchImpl = fetch) {
  if (accessTokenCache?.token && accessTokenCache.expiresAt > Date.now() + 60_000) {
    return accessTokenCache.token;
  }

  const customToken = createFirebaseCustomToken({
    discordId: "prof-presence-service",
    displayName: "Présence professeurs",
    discordUsername: "presence-service",
    avatarUrl: "",
    admin: true,
    roleSynced: true
  });
  const response = await fetchImpl(FIREBASE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.idToken) {
    const error = new Error(`Session Firebase serveur impossible (${response.status}).`);
    error.status = 503;
    throw error;
  }

  accessTokenCache = {
    token: payload.idToken,
    expiresAt: Date.now() + Math.max(300, Number(payload.expiresIn) || 3600) * 1000
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
