const crypto = require("crypto");
const {
  ProfAuthError,
  decryptLoginTicket,
  encryptLoginTicket,
  parseCookies,
  serializeCookie
} = require("./discord-prof-auth.js");

const ACCESS_COOKIE = "university_company_access";
const ACCESS_MAX_AGE_SECONDS = 8 * 60 * 60;

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

function normalizeCompanyCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function hashCode(value) {
  return crypto.createHash("sha256").update(normalizeCompanyCode(value)).digest();
}

function findCompanyByCode(value) {
  const candidate = hashCode(value);
  return COMPANIES.find(company => {
    const expected = Buffer.from(company.hash, "hex");
    return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
  }) || null;
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

function createCompanySession(request, company) {
  const expiresAt = Date.now() + ACCESS_MAX_AGE_SECONDS * 1000;
  const token = encryptLoginTicket({
    role: "company",
    label: company.name,
    companyId: company.id,
    companyName: company.name,
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
      companyName: company.name
    };
  } catch {
    return null;
  }
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
  return payload;
}

module.exports = {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE_SECONDS,
  COMPANIES,
  assertSameOrigin,
  clearCompanySession,
  createCompanySession,
  findCompanyByCode,
  normalizeCompanyCode,
  publicCompanySession,
  readCompanySession
};
