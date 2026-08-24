const crypto = require("crypto");

const DISCORD_API_BASE = "https://discord.com/api/v10";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const FIREBASE_CUSTOM_TOKEN_AUDIENCE = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";
const DEFAULT_REDIRECT_URI = "https://universite-mecanique-m4.vercel.app/api/auth/discord/callback";
const DEFAULT_LOGIN_PATH = "/pages/espace-prof.html";
const STATE_COOKIE = "prof_discord_oauth_state";
const TICKET_COOKIE = "prof_discord_login_ticket";
const STATE_MAX_AGE_SECONDS = 10 * 60;
const TICKET_MAX_AGE_SECONDS = 2 * 60;

let googleAccessTokenCache = null;
let accessSheetCache = null;

class ProfAuthError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "ProfAuthError";
    this.code = code;
    this.status = status;
  }
}

function base64UrlEncode(value) {
  const source = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return source
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64");
}

function getRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new ProfAuthError("configuration", `Variable serveur manquante : ${name}.`, 500);
  }
  return value;
}

function getGooglePrivateKey() {
  return getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");
}

function getSessionSecret() {
  const secret = getRequiredEnv("DISCORD_SESSION_SECRET");
  if (secret.length < 32) {
    throw new ProfAuthError("configuration", "Le secret de session Discord est trop court.", 500);
  }
  return secret;
}

function getRedirectUri() {
  return String(process.env.DISCORD_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();
}

function getLoginPath() {
  const value = String(process.env.DISCORD_LOGIN_PATH || DEFAULT_LOGIN_PATH).trim();
  return value.startsWith("/") ? value : DEFAULT_LOGIN_PATH;
}

function isSecureRequest(request) {
  const forwardedProto = String(request.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  if (forwardedProto) return forwardedProto === "https";
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

function parseCookies(request) {
  return String(request.headers?.cookie || "")
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return cookies;
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
      return cookies;
    }, {});
}

function serializeCookie(request, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || "/"}`);
  parts.push(`Max-Age=${Number.isFinite(options.maxAge) ? Math.max(0, Math.floor(options.maxAge)) : 0}`);
  parts.push("SameSite=Lax");
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (isSecureRequest(request)) parts.push("Secure");
  return parts.join("; ");
}

function setNoStore(response) {
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  response.setHeader("Pragma", "no-cache");
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  setNoStore(response);
  response.end(JSON.stringify(payload));
}

function redirect(response, location, cookies = []) {
  response.statusCode = 302;
  response.setHeader("Location", location);
  setNoStore(response);
  if (cookies.length) response.setHeader("Set-Cookie", cookies);
  response.end();
}

function getStateSignature(payload) {
  return base64UrlEncode(
    crypto.createHmac("sha256", getSessionSecret()).update(payload).digest()
  );
}

function createOAuthState(nonce = base64UrlEncode(crypto.randomBytes(24)), issuedAt = Date.now()) {
  const payload = base64UrlEncode(JSON.stringify({ nonce, issuedAt }));
  return {
    nonce,
    value: `${payload}.${getStateSignature(payload)}`
  };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyOAuthState(value, expectedNonce, now = Date.now()) {
  const [payload, signature] = String(value || "").split(".");
  if (!payload || !signature || !safeEqual(signature, getStateSignature(payload))) {
    throw new ProfAuthError("session_expired", "État OAuth invalide.", 401);
  }

  let parsed;
  try {
    parsed = JSON.parse(base64UrlDecode(payload).toString("utf8"));
  } catch {
    throw new ProfAuthError("session_expired", "État OAuth illisible.", 401);
  }

  if (!safeEqual(parsed.nonce, expectedNonce)) {
    throw new ProfAuthError("session_expired", "Session OAuth différente.", 401);
  }

  if (!Number.isFinite(parsed.issuedAt) || now - parsed.issuedAt > STATE_MAX_AGE_SECONDS * 1000 || parsed.issuedAt > now + 30_000) {
    throw new ProfAuthError("session_expired", "Session OAuth expirée.", 401);
  }

  return parsed;
}

function getEncryptionKey() {
  return crypto.createHash("sha256").update(getSessionSecret()).digest();
}

function encryptLoginTicket(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const clearText = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(clearText), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map(base64UrlEncode).join(".");
}

function decryptLoginTicket(value, now = Date.now()) {
  const [ivValue, tagValue, encryptedValue] = String(value || "").split(".");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new ProfAuthError("session_expired", "Ticket de connexion absent.", 401);
  }

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), base64UrlDecode(ivValue));
    decipher.setAuthTag(base64UrlDecode(tagValue));
    const clearText = Buffer.concat([
      decipher.update(base64UrlDecode(encryptedValue)),
      decipher.final()
    ]);
    const payload = JSON.parse(clearText.toString("utf8"));

    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < now) {
      throw new ProfAuthError("session_expired", "Ticket de connexion expiré.", 401);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProfAuthError) throw error;
    throw new ProfAuthError("session_expired", "Ticket de connexion invalide.", 401);
  }
}

function signJwt(payload, privateKey = getGooglePrivateKey()) {
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${header}.${body}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsignedToken).sign(privateKey);
  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

async function getGoogleAccessToken() {
  if (googleAccessTokenCache?.token && googleAccessTokenCache.expiresAt > Date.now() + 60_000) {
    return googleAccessTokenCache.token;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const email = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const assertion = signJwt({
    iss: email,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.access_token) {
    throw new ProfAuthError("sheet_unavailable", "Authentification Google Sheets impossible.", 502);
  }

  googleAccessTokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(300, Number(payload.expires_in) || 3600) * 1000
  };
  return googleAccessTokenCache.token;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function findHeaderIndex(headers, candidates) {
  const normalizedCandidates = new Set(candidates.map(normalizeHeader));
  return headers.findIndex(header => normalizedCandidates.has(normalizeHeader(header)));
}

function isActiveValue(value) {
  return ["oui", "yes", "true", "1", "actif", "active"].includes(normalizeText(value));
}

function normalizeSiteRole(value) {
  const role = normalizeText(value);
  if (["admin", "administrateur", "administrator"].includes(role)) return "admin";
  if (["prof", "professeur", "teacher"].includes(role)) return "prof";
  return "";
}

function parseAccessRows(values) {
  const rows = Array.isArray(values) ? values : [];
  const headers = rows[0] || [];
  const idIndex = findHeaderIndex(headers, ["discord_id", "id discord", "discord id"]);
  const nameIndex = findHeaderIndex(headers, ["nom", "name", "nom affiche"]);
  const roleIndex = findHeaderIndex(headers, ["role_site", "role site", "role"]);
  const activeIndex = findHeaderIndex(headers, ["actif", "active", "acces actif"]);

  if (idIndex < 0 || roleIndex < 0 || activeIndex < 0) {
    throw new ProfAuthError("sheet_invalid", "Colonnes de la feuille d'accès incomplètes.", 500);
  }

  return rows.slice(1).map(row => ({
    discordId: String(row[idIndex] || "").trim(),
    name: nameIndex >= 0 ? String(row[nameIndex] || "").trim() : "",
    role: normalizeSiteRole(row[roleIndex]),
    active: isActiveValue(row[activeIndex])
  })).filter(row => row.discordId);
}

async function loadAccessRows({ bypassCache = false } = {}) {
  if (!bypassCache && accessSheetCache?.rows && accessSheetCache.expiresAt > Date.now()) {
    return accessSheetCache.rows;
  }

  const spreadsheetId = getRequiredEnv("PROF_ACCESS_SPREADSHEET_ID");
  const gid = getRequiredEnv("PROF_ACCESS_SHEET_GID");
  const accessToken = await getGoogleAccessToken();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const metadataResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`,
    { headers, cache: "no-store" }
  );

  if (!metadataResponse.ok) {
    throw new ProfAuthError("sheet_unavailable", `Feuille d'accès inaccessible (${metadataResponse.status}).`, 502);
  }

  const metadata = await metadataResponse.json();
  const selectedSheet = (metadata.sheets || []).find(sheet => String(sheet.properties?.sheetId) === String(gid));
  const title = String(selectedSheet?.properties?.title || "").trim();

  if (!title) {
    throw new ProfAuthError("sheet_invalid", "Onglet d'autorisations introuvable.", 500);
  }

  const escapedTitle = `'${title.replace(/'/g, "''")}'`;
  const valuesResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(escapedTitle)}?majorDimension=ROWS`,
    { headers, cache: "no-store" }
  );

  if (!valuesResponse.ok) {
    throw new ProfAuthError("sheet_unavailable", `Lecture des autorisations impossible (${valuesResponse.status}).`, 502);
  }

  const valuesPayload = await valuesResponse.json();
  const rows = parseAccessRows(valuesPayload.values || []);
  accessSheetCache = { rows, expiresAt: Date.now() + 30_000 };
  return rows;
}

async function exchangeDiscordCode(code) {
  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getRequiredEnv("DISCORD_CLIENT_ID"),
      client_secret: getRequiredEnv("DISCORD_CLIENT_SECRET"),
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri()
    })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.access_token) {
    throw new ProfAuthError("discord_exchange", "Discord a refusé le code de connexion.", 401);
  }
  return payload.access_token;
}

async function fetchDiscordJson(path, accessToken) {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });

  if (response.status === 404) {
    throw new ProfAuthError("not_member", "Ce compte ne fait pas partie du serveur Discord autorisé.", 403);
  }
  if (!response.ok) {
    throw new ProfAuthError("discord_unavailable", `Vérification Discord impossible (${response.status}).`, 502);
  }
  return response.json();
}

async function synchronizeDiscordRole(discordId, roleId, currentRoles = []) {
  if (currentRoles.map(String).includes(String(roleId))) return true;

  const response = await fetch(
    `${DISCORD_API_BASE}/guilds/${encodeURIComponent(getRequiredEnv("DISCORD_GUILD_ID"))}/members/${encodeURIComponent(discordId)}/roles/${encodeURIComponent(roleId)}`,
    {
      method: "PUT",
      headers: { Authorization: `Bot ${getRequiredEnv("DISCORD_BOT_TOKEN")}` }
    }
  );

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.warn("Synchronisation rôle Discord impossible :", response.status, details.slice(0, 200));
    return false;
  }
  return true;
}

function buildDiscordAvatarUrl(user) {
  if (!user?.id || !user?.avatar) return "";
  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.png?size=128`;
}

async function authorizeDiscordLogin(code) {
  const accessToken = await exchangeDiscordCode(code);
  const guildId = getRequiredEnv("DISCORD_GUILD_ID");
  const [user, member, rows] = await Promise.all([
    fetchDiscordJson("/users/@me", accessToken),
    fetchDiscordJson(`/users/@me/guilds/${encodeURIComponent(guildId)}/member`, accessToken),
    loadAccessRows()
  ]);

  const access = rows.find(row => row.discordId === String(user.id));
  if (!access || !access.active || !access.role) {
    throw new ProfAuthError("access_denied", "Ce compte Discord n'est pas autorisé.", 403);
  }

  const roleId = access.role === "admin"
    ? getRequiredEnv("DISCORD_ADMIN_ROLE_ID")
    : getRequiredEnv("DISCORD_PROF_ROLE_ID");
  const roleSynced = await synchronizeDiscordRole(user.id, roleId, member.roles || []);
  const displayName = access.name || member.nick || user.global_name || user.username || "Professeur";

  return {
    discordId: String(user.id),
    discordUsername: String(user.username || ""),
    displayName: String(displayName).slice(0, 80),
    avatarUrl: buildDiscordAvatarUrl(user),
    siteRole: access.role,
    admin: access.role === "admin",
    roleSynced
  };
}

function createFirebaseCustomToken(identity, nowSeconds = Math.floor(Date.now() / 1000)) {
  const serviceAccountEmail = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const uid = `discord:${identity.discordId}`;
  return signJwt({
    iss: serviceAccountEmail,
    sub: serviceAccountEmail,
    aud: FIREBASE_CUSTOM_TOKEN_AUDIENCE,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
    uid,
    claims: {
      role: "prof",
      admin: identity.admin === true,
      authProvider: "discord",
      discordId: identity.discordId,
      discordName: identity.displayName,
      discordUsername: identity.discordUsername,
      discordAvatar: identity.avatarUrl,
      discordRoleSynced: identity.roleSynced === true
    }
  });
}

function buildDiscordAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: getRequiredEnv("DISCORD_CLIENT_ID"),
    response_type: "code",
    redirect_uri: getRedirectUri(),
    scope: "identify guilds.members.read",
    state
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function getErrorRedirect(code) {
  const params = new URLSearchParams({ discord_error: String(code || "unknown") });
  return `${getLoginPath()}?${params.toString()}`;
}

module.exports = {
  DEFAULT_REDIRECT_URI,
  STATE_COOKIE,
  TICKET_COOKIE,
  STATE_MAX_AGE_SECONDS,
  TICKET_MAX_AGE_SECONDS,
  ProfAuthError,
  authorizeDiscordLogin,
  buildDiscordAuthorizeUrl,
  createFirebaseCustomToken,
  createOAuthState,
  decryptLoginTicket,
  encryptLoginTicket,
  getErrorRedirect,
  getLoginPath,
  parseAccessRows,
  parseCookies,
  redirect,
  sendJson,
  serializeCookie,
  verifyOAuthState
};
