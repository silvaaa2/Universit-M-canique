const crypto = require("crypto");

const FIREBASE_PROJECT_ID = "universit-4b11e";
const FIREBASE_CERTIFICATES_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const CLOCK_SKEW_SECONDS = 30;

let certificateCache = {
  values: null,
  expiresAt: 0
};

function authError(message, status = 401) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function decodeJwtPart(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
  } catch {
    throw authError("Token Firebase invalide.");
  }
}

function getCertificateTtl(response) {
  const cacheControl = String(response.headers?.get?.("cache-control") || "");
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 0);
  return Math.max(300, Number.isFinite(maxAge) ? maxAge : 0) * 1000;
}

async function loadFirebaseCertificates(fetchImpl, { forceRefresh = false } = {}) {
  if (!forceRefresh && certificateCache.values && certificateCache.expiresAt > Date.now()) {
    return certificateCache.values;
  }

  const response = await fetchImpl(FIREBASE_CERTIFICATES_URL, { cache: "no-store" });
  if (!response.ok) {
    throw authError("Vérification Firebase momentanément indisponible.", 503);
  }

  const values = await response.json().catch(() => null);
  if (!values || typeof values !== "object") {
    throw authError("Certificats Firebase invalides.", 503);
  }

  certificateCache = {
    values,
    expiresAt: Date.now() + getCertificateTtl(response)
  };
  return values;
}

async function getFirebaseCertificate(keyId, fetchImpl) {
  let certificates = await loadFirebaseCertificates(fetchImpl);
  if (certificates[keyId]) return certificates[keyId];

  certificates = await loadFirebaseCertificates(fetchImpl, { forceRefresh: true });
  if (!certificates[keyId]) throw authError("Clé de signature Firebase inconnue.");
  return certificates[keyId];
}

async function verifyFirebaseIdToken(idToken, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const nowSeconds = Number.isFinite(options.nowSeconds)
    ? options.nowSeconds
    : Math.floor(Date.now() / 1000);
  const parts = String(idToken || "").split(".");

  if (parts.length !== 3) throw authError("Token Firebase invalide.");

  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) {
    throw authError("Signature Firebase invalide.");
  }

  const certificate = await getFirebaseCertificate(String(header.kid), fetchImpl);
  const signatureValid = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    certificate,
    Buffer.from(parts[2], "base64url")
  );

  if (!signatureValid) throw authError("Signature Firebase refusée.");
  if (claims.aud !== FIREBASE_PROJECT_ID || claims.iss !== FIREBASE_ISSUER) {
    throw authError("Token Firebase destiné à un autre projet.");
  }
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128) {
    throw authError("Identité Firebase invalide.");
  }
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds - CLOCK_SKEW_SECONDS) {
    throw authError("Session Firebase expirée.");
  }
  if (typeof claims.iat !== "number" || claims.iat > nowSeconds + CLOCK_SKEW_SECONDS) {
    throw authError("Date du token Firebase invalide.");
  }

  return claims;
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue === true;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  return null;
}

async function loadLegacyAccess(email, idToken, fetchImpl = fetch) {
  if (!email) return { role: null, admin: false };
  const response = await fetchImpl(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );

  if (response.status === 404) return { role: null, admin: false };
  if (!response.ok) {
    const error = new Error("Rôle utilisateur impossible à vérifier.");
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const fields = data.fields || {};
  return {
    role: decodeFirestoreValue(fields.role),
    admin: decodeFirestoreValue(fields.admin) === true
  };
}

async function verifyFirebaseProfAccess(idToken, options = {}) {
  if (!idToken) throw authError("Connexion professeur requise.");

  const claims = await verifyFirebaseIdToken(idToken, options);
  const user = {
    localId: claims.sub,
    email: String(claims.email || "")
  };
  const discordIdentity = claims.authProvider === "discord" && claims.discordId;
  const access = discordIdentity
    ? { role: claims.role || null, admin: claims.admin === true }
    : await loadLegacyAccess(user.email, idToken, options.fetchImpl || fetch);

  return {
    user,
    claims,
    role: access.role,
    admin: access.admin === true,
    allowed: access.role === "prof" || access.admin === true,
    actorId: discordIdentity
      ? `discord:${claims.discordId}`
      : String(user.email || user.localId || "professeur inconnu"),
    displayName: discordIdentity
      ? String(claims.discordName || claims.discordUsername || "Professeur")
      : String(user.email || "Professeur")
  };
}

module.exports = {
  FIREBASE_PROJECT_ID,
  verifyFirebaseIdToken,
  verifyFirebaseProfAccess
};
