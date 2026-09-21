const crypto = require("crypto");
const { createDocument, getDocument, listDocuments, upsertDocument } = require("./firestore-service-account.js");

const AUDIT_COLLECTION = "stageHistory";
const DISCORD_API_BASE = "https://discord.com/api/v10";
const AUDIT_LIMIT = 300;
const AUDIT_SETTINGS_COLLECTION = "profSettings";
const AUDIT_SETTINGS_DOCUMENT = "auditLogSettings";
let auditChannelCache = { id: "", expiresAt: 0 };

function clean(value, maxLength = 300) {
  return String(value || "").trim().replace(/[\u0000-\u001f]/g, " ").slice(0, maxLength);
}

function normalizeAuditEvent(event = {}) {
  const timestamp = clean(event.timestamp, 80) || new Date().toISOString();
  return {
    recordType: "auditLog",
    actorType: ["prof", "admin", "company", "system"].includes(event.actorType) ? event.actorType : "system",
    actorId: clean(event.actorId, 160) || "inconnu",
    actorName: clean(event.actorName, 100) || "Utilisateur inconnu",
    category: clean(event.category, 60) || "site",
    action: clean(event.action, 120) || "action",
    target: clean(event.target, 180),
    details: clean(event.details, 700),
    timestamp,
    timestampMs: Number.isFinite(Number(event.timestampMs)) ? Number(event.timestampMs) : Date.now()
  };
}

function isPassiveAuditEvent(event = {}) {
  const action = clean(event.action, 120).toLowerCase();
  return action === "ouverture de la page"
    || action.startsWith("consultation de ")
    || action.startsWith("ouverture de ")
    || action.startsWith("ouverture des ");
}

function actorTypeLabel(actorType) {
  return ({ admin: "Administrateur", prof: "Professeur", company: "Entreprise", system: "Système" })[actorType] || "Utilisateur";
}

function categoryLabel(category) {
  const key = clean(category, 60).toLowerCase();
  return ({
    connexion: "Connexion et session",
    administration: "Administration",
    modules: "Modules élèves",
    examens: "Examens",
    customs: "Customs élèves",
    entreprises: "Suivi de stage",
    "tableau de bord": "Tableau de bord"
  })[key] || clean(category, 60) || "Site";
}

function formatAuditDate(timestamp) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "full",
      timeStyle: "medium",
      timeZone: "Europe/Paris"
    }).format(new Date(timestamp));
  } catch {
    return clean(timestamp, 80);
  }
}

async function sendDiscordAudit(event, fetchImpl = fetch) {
  const token = clean(process.env.DISCORD_BOT_TOKEN, 200);
  const channelId = await resolveAuditChannelId(fetchImpl);
  if (!token || !/^\d{17,20}$/.test(channelId)) return { skipped: true };

  const fields = [
    { name: "Effectué par", value: `**${event.actorName}**\n${actorTypeLabel(event.actorType)}`, inline: true },
    { name: "Zone du site", value: categoryLabel(event.category), inline: true },
    { name: "Identifiant du compte", value: `\`${event.actorId}\``, inline: false }
  ];
  if (event.target) fields.push({ name: "Élément concerné", value: event.target, inline: false });
  if (event.details) fields.push({ name: "Informations précises", value: event.details, inline: false });
  fields.push({ name: "Date et heure", value: formatAuditDate(event.timestamp), inline: false });

  const response = await fetchImpl(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      allowed_mentions: { parse: [] },
      embeds: [{
        title: event.action,
        description: `${actorTypeLabel(event.actorType)} · ${categoryLabel(event.category)}`,
        color: event.actorType === "company" ? 0x4fd1a1 : 0xd6b46a,
        fields,
        timestamp: event.timestamp,
        footer: { text: "Université Mécanique · Journal sécurisé" }
      }]
    })
  });
  if (!response.ok) throw new Error(`Discord audit refusé (${response.status}).`);
  return { sent: true };
}

async function resolveAuditChannelId(fetchImpl = fetch, { force = false } = {}) {
  const configured = clean(process.env.DISCORD_AUDIT_CHANNEL_ID, 32);
  if (/^\d{17,20}$/.test(configured)) return configured;
  if (!force && auditChannelCache.expiresAt > Date.now()) return auditChannelCache.id;
  const settings = await getDocument(AUDIT_SETTINGS_COLLECTION, AUDIT_SETTINGS_DOCUMENT, fetchImpl);
  const channelId = clean(settings?.channelId, 32);
  auditChannelCache = {
    id: /^\d{17,20}$/.test(channelId) ? channelId : "",
    expiresAt: Date.now() + 60_000
  };
  return auditChannelCache.id;
}

async function createDiscordAuditChannel(actorId = "admin", fetchImpl = fetch) {
  const existing = await resolveAuditChannelId(fetchImpl, { force: true });
  if (existing) return { channelId: existing, created: false };

  const token = clean(process.env.DISCORD_BOT_TOKEN, 200);
  const guildId = clean(process.env.DISCORD_GUILD_ID, 32);
  const adminRoleId = clean(process.env.DISCORD_ADMIN_ROLE_ID, 32);
  if (!token || !/^\d{17,20}$/.test(guildId) || !/^\d{17,20}$/.test(adminRoleId)) {
    const error = new Error("Le bot Discord, le serveur ou le rôle Admin n’est pas configuré.");
    error.status = 500;
    throw error;
  }

  const response = await fetchImpl(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "logs-universite",
      type: 0,
      topic: "Journal automatique des connexions et actions du site Université Mécanique.",
      permission_overwrites: [
        { id: guildId, type: 0, deny: "1024", allow: "0" },
        { id: adminRoleId, type: 0, deny: "0", allow: "68608" }
      ]
    })
  });
  const payload = await response.json().catch(() => ({}));
  const channelId = clean(payload.id, 32);
  if (!response.ok || !/^\d{17,20}$/.test(channelId)) {
    const error = new Error(`Création du salon Discord impossible (${response.status}). Vérifie la permission Gérer les salons du bot.`);
    error.status = 502;
    throw error;
  }

  const now = new Date().toISOString();
  await upsertDocument(AUDIT_SETTINGS_COLLECTION, AUDIT_SETTINGS_DOCUMENT, {
    channelId,
    channelName: "logs-universite",
    createdAt: now,
    createdBy: clean(actorId, 160)
  }, fetchImpl);
  auditChannelCache = { id: channelId, expiresAt: Date.now() + 60_000 };
  return { channelId, created: true };
}

async function recordAuditEvent(input, options = {}) {
  const event = normalizeAuditEvent(input);
  if (isPassiveAuditEvent(event)) return { skipped: true, ...event };
  const documentId = `audit_${event.timestampMs}_${crypto.randomBytes(7).toString("hex")}`;
  await createDocument(AUDIT_COLLECTION, documentId, event, options.fetchImpl || fetch);
  try {
    await sendDiscordAudit(event, options.fetchImpl || fetch);
  } catch (error) {
    console.warn("Envoi du journal Discord impossible :", error?.message || error);
  }
  return { id: documentId, ...event };
}

async function listAuditEvents(filters = {}, fetchImpl = fetch) {
  const category = clean(filters.category, 60);
  const actor = clean(filters.actor, 160).toLowerCase();
  const actorType = clean(filters.actorType, 30);
  const rows = await listDocuments(AUDIT_COLLECTION, fetchImpl);
  return rows
    .filter(row => row.recordType === "auditLog")
    .filter(row => !isPassiveAuditEvent(row))
    .filter(row => !category || row.category === category)
    .filter(row => !actorType || row.actorType === actorType)
    .filter(row => !actor || `${row.actorName} ${row.actorId}`.toLowerCase().includes(actor))
    .sort((left, right) => Number(right.timestampMs || 0) - Number(left.timestampMs || 0))
    .slice(0, AUDIT_LIMIT)
    .map(row => ({
      id: row.id,
      actorType: clean(row.actorType, 30),
      actorId: clean(row.actorId, 160),
      actorName: clean(row.actorName, 100),
      category: clean(row.category, 60),
      action: clean(row.action, 120),
      target: clean(row.target, 180),
      details: clean(row.details, 700),
      timestamp: clean(row.timestamp, 80),
      timestampMs: Number(row.timestampMs || 0)
    }));
}

module.exports = {
  AUDIT_COLLECTION,
  createDiscordAuditChannel,
  listAuditEvents,
  isPassiveAuditEvent,
  normalizeAuditEvent,
  recordAuditEvent,
  resolveAuditChannelId,
  sendDiscordAudit
};
