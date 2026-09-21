const crypto = require("crypto");
const {
  ProfAuthError,
  decryptLoginTicket,
  encryptLoginTicket,
  parseCookies,
  serializeCookie
} = require("./discord-prof-auth.js");
const { getDocument, upsertDocument } = require("./firestore-service-account.js");

const ACCESS_COOKIE = "university_company_access";
const ACCESS_MAX_AGE_SECONDS = 8 * 60 * 60;
const ADMIN_PREVIEW_COOKIE = "university_admin_company_preview";
const ADMIN_PREVIEW_MAX_AGE_SECONDS = 30 * 60;
const COMPANY_CODES_COLLECTION = "profSettings";
const COMPANY_CODES_DOCUMENT = "companyAccessCodes";
const COMPANY_CODE_CACHE_MS = 10 * 60 * 1000;
const COMPANY_CODE_RETRY_DELAY_MS = 180;

// Only hashes are committed. The actual codes never reach HTML or browser JavaScript.
const COMPANIES = Object.freeze([
  { id: "bennys", name: "Benny's", hash: "328e99df5f63d5b5dbd20f288fd38fe273467ee5cc43d02875653ea2632f4513" },
  { id: "lsc", name: "LSC", hash: "3e890d169cca7a037236542b7feb1b0d51dea39e4d27493b6381efa16eb4600d" },
  { id: "paleto", name: "Paleto Garage", hash: "f4edc88136f5afc85983a5d9c88297087bb691fd8c9dac579df5042d0e56955e" },
  { id: "harmony", name: "Harmony Repair", hash: "d9b3ba73480503ca0ef8765c722690275237c16cabd1c76c39950a45e22fd5ea" },
  { id: "cayo", name: "Cayo Garage", hash: "f3ea5061e9d16d55709b860bcf421814713ce6841a6f3382a5d425b542ffb104" },
  { id: "portolina", name: "Portolina Mechanic", hash: "c88fc44b3cbe6cf9a8c2281a0e4d9379203372ddb6baf04eaebf61f725c6f9f3" },
  { id: "favelas", name: "Favelas Repair", hash: "30d63f735221e5e0b17a32f181ae353825cacec43f720215cd5d6ce1f670dd5c" }
]);

let companyCodeConfigCache = { value: null, expiresAt: 0 };

function normalizeCompanyCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function hashCode(value) {
  return crypto.createHash("sha256").update(normalizeCompanyCode(value)).digest();
}

function hashManagedCode(value) {
  const secret = String(process.env.DISCORD_SESSION_SECRET || "").trim();
  if (secret.length < 32) {
    throw new ProfAuthError("configuration", "Secret serveur indisponible.", 500);
  }
  return crypto.createHmac("sha256", secret).update(normalizeCompanyCode(value)).digest("hex");
}

function safeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(String(left || "")) || !/^[a-f0-9]{64}$/i.test(String(right || ""))) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function findCompanyByCode(value) {
  const candidate = hashCode(value);
  return COMPANIES.find(company => {
    const expected = Buffer.from(company.hash, "hex");
    return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
  }) || null;
}

function normalizeCompanyCodeConfig(stored) {
  const hashes = stored?.hashes && typeof stored.hashes === "object" ? stored.hashes : {};
  const versions = stored?.versions && typeof stored.versions === "object" ? stored.versions : {};
  const updatedAt = stored?.updatedAt && typeof stored.updatedAt === "object" ? stored.updatedAt : {};

  return { hashes, versions, updatedAt };
}

function isTemporaryCompanyConfigError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toUpperCase();
  return status === 408
    || status === 425
    || status === 429
    || status >= 500
    || error?.name === "TypeError"
    || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH"].includes(code);
}

async function loadCompanyCodeConfig(options = {}) {
  const {
    allowStale = false,
    fallbackToDefaults = false,
    force = false,
    loader = getDocument,
    wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  } = options;

  if (!force && companyCodeConfigCache.value && companyCodeConfigCache.expiresAt > Date.now()) {
    return companyCodeConfigCache.value;
  }

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const config = normalizeCompanyCodeConfig(
        await loader(COMPANY_CODES_COLLECTION, COMPANY_CODES_DOCUMENT)
      );
      companyCodeConfigCache = {
        value: config,
        expiresAt: Date.now() + COMPANY_CODE_CACHE_MS
      };
      return config;
    } catch (error) {
      if (!isTemporaryCompanyConfigError(error)) throw error;
      lastError = error;
      if (attempt === 0 && Number(error?.status || 0) !== 429) {
        await wait(COMPANY_CODE_RETRY_DELAY_MS);
      } else if (attempt === 0) {
        break;
      }
    }
  }

  if (allowStale && companyCodeConfigCache.value) {
    console.warn(
      "Codes entreprise temporairement indisponibles, utilisation du cache serveur :",
      lastError?.message || lastError
    );
    return companyCodeConfigCache.value;
  }

  if (fallbackToDefaults) {
    console.warn(
      "Codes entreprise temporairement indisponibles, utilisation des codes de secours intégrés :",
      lastError?.message || lastError
    );
    return normalizeCompanyCodeConfig(null);
  }

  throw lastError;
}

async function authenticateCompanyCode(value, options = {}) {
  const normalized = normalizeCompanyCode(value);
  if (!normalized) return null;

  const config = await loadCompanyCodeConfig({
    allowStale: true,
    fallbackToDefaults: true,
    loader: options.loader,
    wait: options.wait
  });
  const managedCandidate = hashManagedCode(normalized);
  const defaultCandidate = hashCode(normalized);

  for (const company of COMPANIES) {
    const managedHash = String(config.hashes[company.id] || "");
    const valid = managedHash
      ? safeHexEqual(managedCandidate, managedHash)
      : crypto.timingSafeEqual(defaultCandidate, Buffer.from(company.hash, "hex"));
    if (valid) {
      return {
        company,
        credentialVersion: String(config.versions[company.id] || "default")
      };
    }
  }

  return null;
}

async function getCompanyCodeStates() {
  const config = await loadCompanyCodeConfig({
    allowStale: true,
    fallbackToDefaults: true
  });
  return COMPANIES.map(company => ({
    id: company.id,
    name: company.name,
    customized: Boolean(config.hashes[company.id]),
    updatedAt: String(config.updatedAt[company.id] || "")
  }));
}

async function updateCompanyCode(companyId, value, actorId = "admin") {
  const company = COMPANIES.find(item => item.id === String(companyId || ""));
  if (!company) throw new ProfAuthError("company", "Entreprise inconnue.", 404);

  const normalized = normalizeCompanyCode(value);
  if (normalized.length < 8 || normalized.length > 64 || !/[A-Z]/.test(normalized) || !/\d/.test(normalized)) {
    throw new ProfAuthError("password", "Utilise 8 à 64 caractères avec au moins une lettre et un chiffre.", 400);
  }

  const config = await loadCompanyCodeConfig({ force: true });
  const now = new Date().toISOString();
  const credentialVersion = crypto.randomBytes(16).toString("hex");
  const payload = {
    hashes: { ...config.hashes, [company.id]: hashManagedCode(normalized) },
    versions: { ...config.versions, [company.id]: credentialVersion },
    updatedAt: { ...config.updatedAt, [company.id]: now },
    updatedBy: String(actorId || "admin").slice(0, 160),
    updatedAtIso: now
  };

  await upsertDocument(COMPANY_CODES_COLLECTION, COMPANY_CODES_DOCUMENT, payload);
  companyCodeConfigCache = {
    value: normalizeCompanyCodeConfig(payload),
    expiresAt: Date.now() + COMPANY_CODE_CACHE_MS
  };
  return { company, credentialVersion, updatedAt: now };
}

function getRequestOrigin(request) {
  const proto = String(request.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(request.headers?.["x-forwarded-host"] || request.headers?.host || "").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
}

function assertSameOrigin(request) {
  const origin = String(request.headers?.origin || "").trim();
  const expected = getRequestOrigin(request);
  if (!origin || !expected || origin !== expected) {
    throw new ProfAuthError("origin", "Origine de connexion refusée.", 403);
  }
}

function createCompanySession(request, companyOrAccess) {
  const company = companyOrAccess?.company || companyOrAccess;
  const credentialVersion = String(companyOrAccess?.credentialVersion || "default");
  const expiresAt = Date.now() + ACCESS_MAX_AGE_SECONDS * 1000;
  const token = encryptLoginTicket({
    role: "company",
    label: company.name,
    companyId: company.id,
    companyName: company.name,
    credentialVersion,
    expiresAt
  });
  return serializeCookie(request, ACCESS_COOKIE, token, {
    maxAge: ACCESS_MAX_AGE_SECONDS,
    path: "/"
  });
}

function clearCompanySession(request) {
  return serializeCookie(request, ACCESS_COOKIE, "", { maxAge: 0, path: "/" });
}

function createCompanyPreviewSession(request, companyId, actorId = "admin") {
  const company = COMPANIES.find(item => item.id === String(companyId || ""));
  if (!company) throw new ProfAuthError("company", "Entreprise inconnue.", 404);

  const expiresAt = Date.now() + ADMIN_PREVIEW_MAX_AGE_SECONDS * 1000;
  const token = encryptLoginTicket({
    role: "company-preview",
    companyId: company.id,
    actorId: String(actorId || "admin").slice(0, 160),
    expiresAt
  });
  return serializeCookie(request, ADMIN_PREVIEW_COOKIE, token, {
    maxAge: ADMIN_PREVIEW_MAX_AGE_SECONDS,
    path: "/"
  });
}

function clearCompanyPreviewSession(request) {
  return serializeCookie(request, ADMIN_PREVIEW_COOKIE, "", { maxAge: 0, path: "/" });
}

function readCompanyPreviewSession(request) {
  const encrypted = parseCookies(request)[ADMIN_PREVIEW_COOKIE];
  if (!encrypted) return null;

  try {
    const payload = decryptLoginTicket(encrypted);
    const company = COMPANIES.find(item => item.id === payload.companyId);
    if (!company || payload.role !== "company-preview") return null;
    return {
      role: "company",
      label: company.name,
      companyId: company.id,
      companyName: company.name,
      adminPreview: true,
      actorId: String(payload.actorId || "admin")
    };
  } catch {
    return null;
  }
}

function readCompanySession(request) {
  const encrypted = parseCookies(request)[ACCESS_COOKIE];
  if (!encrypted) return null;

  try {
    const payload = decryptLoginTicket(encrypted);
    const company = COMPANIES.find(item => item.id === payload.companyId);
    if (!company || payload.role !== "company") return null;
    return {
      role: "company",
      label: company.name,
      companyId: company.id,
      companyName: company.name,
      credentialVersion: String(payload.credentialVersion || "default")
    };
  } catch {
    return null;
  }
}

async function validateCompanySession(request, options = {}) {
  const session = readCompanySession(request);
  if (!session) return null;
  let config;
  try {
    config = await loadCompanyCodeConfig({
      allowStale: true,
      loader: options.loader,
      wait: options.wait
    });
  } catch (error) {
    if (!isTemporaryCompanyConfigError(error)) throw error;
    console.warn(
      "Validation du code entreprise temporairement indisponible, maintien de la session signée :",
      error?.message || error
    );
    return session;
  }
  const expectedVersion = String(config.versions[session.companyId] || "default");
  return session.credentialVersion === expectedVersion ? session : null;
}

async function validateStageCompanySession(request) {
  return readCompanyPreviewSession(request) || validateCompanySession(request);
}

function publicCompanySession(session) {
  if (!session) return { authenticated: false };
  const payload = {
    authenticated: true,
    role: session.role,
    label: session.label,
    companyId: session.companyId,
    companyName: session.companyName,
    target: "/stages/"
  };
  if (session.adminPreview === true) payload.adminPreview = true;
  return payload;
}

module.exports = {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE_SECONDS,
  ADMIN_PREVIEW_COOKIE,
  ADMIN_PREVIEW_MAX_AGE_SECONDS,
  COMPANIES,
  authenticateCompanyCode,
  assertSameOrigin,
  clearCompanySession,
  clearCompanyPreviewSession,
  createCompanySession,
  createCompanyPreviewSession,
  findCompanyByCode,
  getCompanyCodeStates,
  hashManagedCode,
  isTemporaryCompanyConfigError,
  loadCompanyCodeConfig,
  normalizeCompanyCode,
  publicCompanySession,
  readCompanyPreviewSession,
  readCompanySession,
  updateCompanyCode,
  validateCompanySession,
  validateStageCompanySession
};
