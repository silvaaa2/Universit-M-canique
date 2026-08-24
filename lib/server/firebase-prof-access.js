const FIREBASE_WEB_API_KEY = "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c";
const FIREBASE_PROJECT_ID = "universit-4b11e";

function decodeJwtPayload(idToken) {
  try {
    const payload = String(idToken || "").split(".")[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue === true;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  return null;
}

async function lookupFirebaseUser(idToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    }
  );

  if (!response.ok) {
    const error = new Error("Token Firebase refusé.");
    error.status = 401;
    throw error;
  }

  const payload = await response.json();
  const user = payload.users?.[0];
  if (!user?.localId) {
    const error = new Error("Session Firebase introuvable.");
    error.status = 401;
    throw error;
  }
  return user;
}

async function loadLegacyAccess(email, idToken) {
  if (!email) return { role: null, admin: false };
  const response = await fetch(
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

async function verifyFirebaseProfAccess(idToken) {
  if (!idToken) {
    const error = new Error("Connexion professeur requise.");
    error.status = 401;
    throw error;
  }

  const user = await lookupFirebaseUser(idToken);
  const tokenClaims = decodeJwtPayload(idToken);
  let storedClaims = {};
  try {
    storedClaims = user.customAttributes ? JSON.parse(user.customAttributes) : {};
  } catch {
    storedClaims = {};
  }
  const claims = { ...tokenClaims, ...storedClaims };
  const discordIdentity = claims.authProvider === "discord" && claims.discordId;
  const access = discordIdentity
    ? { role: claims.role || null, admin: claims.admin === true }
    : await loadLegacyAccess(user.email || claims.email || "", idToken);

  return {
    user,
    claims,
    role: access.role,
    admin: access.admin === true,
    allowed: access.role === "prof" || access.admin === true,
    actorId: discordIdentity
      ? `discord:${claims.discordId}`
      : String(user.email || claims.email || user.localId || "professeur inconnu"),
    displayName: discordIdentity
      ? String(claims.discordName || claims.discordUsername || "Professeur")
      : String(user.email || claims.email || "Professeur")
  };
}

module.exports = {
  FIREBASE_PROJECT_ID,
  verifyFirebaseProfAccess
};
