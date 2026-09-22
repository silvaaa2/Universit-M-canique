const crypto = require("crypto");
const { getDocument, upsertDocument } = require("./firestore-service-account.js");

const SETTINGS_COLLECTION = "profSettings";
const ACCESS_CONTROL_DOCUMENT = "profAccessControl";
const POLICY_CACHE_MS = 60_000;
const ALL_PERMISSIONS = Object.freeze([
  "dashboard",
  "corrections",
  "customResponses",
  "exams",
  "modules",
  "customAccess",
  "stages"
]);

let policyCache = { expiresAt: 0, users: {} };

function clean(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizePermissions(values, admin = false) {
  if (admin) return [...ALL_PERMISSIONS];
  const requested = new Set(Array.isArray(values) ? values.map(String) : ALL_PERMISSIONS);
  return ALL_PERMISSIONS.filter(permission => requested.has(permission));
}

function normalizePolicy(value = {}, admin = false) {
  return {
    disabled: admin ? false : value.disabled === true,
    sessionVersion: clean(value.sessionVersion || "default", 80) || "default",
    permissions: normalizePermissions(value.permissions, admin),
    adminOverride: typeof value.adminOverride === "boolean" ? value.adminOverride : null,
    updatedAt: clean(value.updatedAt, 80),
    updatedBy: clean(value.updatedBy, 160)
  };
}

function normalizeName(value) {
  return clean(value, 100)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveOwnerDiscordId(sheetRows = []) {
  const configured = clean(process.env.DISCORD_OWNER_ID || process.env.DISCORD_SUPERADMIN_ID, 32);
  if (/^\d{15,22}$/.test(configured)) return configured;
  const owner = (Array.isArray(sheetRows) ? sheetRows : []).find(row => (
    row?.active === true
    && row?.role === "admin"
    && normalizeName(row?.name) === "marc carter"
  ));
  return clean(owner?.discordId, 32);
}

function resolveEffectiveAdmin(row = {}, policy = {}, ownerDiscordId = "") {
  const discordId = clean(row.discordId, 32);
  if (discordId && discordId === clean(ownerDiscordId, 32)) return true;
  if (typeof policy.adminOverride === "boolean") return policy.adminOverride;
  return row.role === "admin";
}

async function loadAccessControl({ force = false } = {}) {
  if (!force && policyCache.expiresAt > Date.now()) return policyCache.users;
  const document = await getDocument(SETTINGS_COLLECTION, ACCESS_CONTROL_DOCUMENT);
  const users = document?.users && typeof document.users === "object" ? document.users : {};
  policyCache = { users, expiresAt: Date.now() + POLICY_CACHE_MS };
  return users;
}

async function getProfAccessPolicy(discordId, options = {}) {
  const safeId = clean(discordId, 32);
  if (!safeId) return normalizePolicy({}, options.admin === true);
  const users = await loadAccessControl(options);
  return normalizePolicy(users[safeId], options.admin === true);
}

async function updateProfAccessPolicy(discordId, changes = {}, actorId = "admin") {
  const safeId = clean(discordId, 32);
  if (!/^\d{15,22}$/.test(safeId)) {
    const error = new Error("Identifiant Discord invalide.");
    error.status = 400;
    throw error;
  }

  const users = await loadAccessControl({ force: true });
  const current = normalizePolicy(users[safeId]);
  const next = normalizePolicy({
    ...current,
    ...(Object.hasOwn(changes, "disabled") ? { disabled: changes.disabled === true } : {}),
    ...(Object.hasOwn(changes, "permissions") ? { permissions: changes.permissions } : {}),
    ...(Object.hasOwn(changes, "adminOverride") ? { adminOverride: changes.adminOverride === true } : {}),
    ...(changes.disconnect === true ? { sessionVersion: crypto.randomBytes(18).toString("hex") } : {}),
    updatedAt: new Date().toISOString(),
    updatedBy: clean(actorId, 160)
  });

  const nextUsers = { ...users, [safeId]: next };
  await upsertDocument(SETTINGS_COLLECTION, ACCESS_CONTROL_DOCUMENT, { users: nextUsers });
  policyCache = { users: nextUsers, expiresAt: Date.now() + POLICY_CACHE_MS };
  return next;
}

function buildProfessorAccessRows(sheetRows, policies = {}) {
  const ownerDiscordId = resolveOwnerDiscordId(sheetRows);
  return (Array.isArray(sheetRows) ? sheetRows : []).map(row => {
    const rawPolicy = normalizePolicy(policies[row.discordId]);
    const admin = resolveEffectiveAdmin(row, rawPolicy, ownerDiscordId);
    const policy = normalizePolicy(rawPolicy, admin);
    return {
      discordId: clean(row.discordId, 32),
      name: clean(row.name || "Professeur", 80),
      role: admin ? "admin" : "prof",
      owner: clean(row.discordId, 32) === ownerDiscordId,
      sheetActive: row.active === true,
      disabled: policy.disabled,
      sessionVersion: policy.sessionVersion,
      permissions: policy.permissions,
      updatedAt: policy.updatedAt,
      updatedBy: policy.updatedBy
    };
  });
}

module.exports = {
  ACCESS_CONTROL_DOCUMENT,
  ALL_PERMISSIONS,
  SETTINGS_COLLECTION,
  buildProfessorAccessRows,
  getProfAccessPolicy,
  loadAccessControl,
  normalizePermissions,
  normalizePolicy,
  resolveEffectiveAdmin,
  resolveOwnerDiscordId,
  updateProfAccessPolicy
};
