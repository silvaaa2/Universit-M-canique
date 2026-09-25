const crypto = require("crypto");
const { getDocument, mergeDocument } = require("./firestore-service-account.js");
const { recordAuditEvent } = require("./audit-log.js");
const { sendJson } = require("./discord-prof-auth.js");
const { assertSameOrigin } = require("./unified-access.js");

const DISCORD_API = "https://discord.com/api/v10";
const SETTINGS_COLLECTION = "profSettings";
const SETTINGS_DOCUMENT = "discordBotControl";
const STATUSES = new Set(["online", "idle", "dnd"]);
const SENDABLE_TYPES = new Set([0, 5]); // Text and announcement channels.

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function bodyOf(request) {
  try {
    return typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
  } catch {
    fail(400, "Requête invalide.");
  }
}

function configuredBotToken() {
  const token = String(process.env.DISCORD_BOT_TOKEN || "").trim();
  if (!token) fail(503, "Le bot Discord n'est pas configuré.");
  return token;
}

function validateBotRequest(request) {
  const expected = configuredBotToken();
  const actual = String(request.headers?.authorization || "").match(/^Bot\s+(.+)$/i)?.[1]?.trim() || "";
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const actualHash = crypto.createHash("sha256").update(actual).digest();
  if (!actual || !crypto.timingSafeEqual(expectedHash, actualHash)) {
    fail(401, "Bot non autorisé.");
  }
}

function normalizedStatus(status) {
  return STATUSES.has(status) ? status : "online";
}

function normalizeSettings(document) {
  const lastSeenAt = Number(document?.lastSeenAt || 0);
  return {
    desiredStatus: normalizedStatus(document?.desiredStatus),
    currentStatus: STATUSES.has(document?.currentStatus) ? document.currentStatus : "",
    lastSeenAt,
    connected: lastSeenAt > 0 && Date.now() - lastSeenAt < 300_000,
    updatedAt: String(document?.updatedAt || "")
  };
}

async function discord(path, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${DISCORD_API}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bot ${configuredBotToken()}`,
      "Content-Type": "application/json",
      "User-Agent": "DiscordBot (https://universite-mecanique-m4.vercel.app, 1.0)"
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(12_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403) fail(403, "Le bot n'a pas la permission Discord nécessaire.");
    if (response.status === 404) fail(404, "Élément Discord introuvable.");
    if (response.status === 429) fail(429, "Discord limite temporairement les actions. Réessaie plus tard.");
    fail(502, `Discord a refusé l'action (HTTP ${response.status}).`);
  }
  return payload;
}

function normalizeChannels(channels) {
  if (!Array.isArray(channels)) return [];
  const categories = new Map(channels.filter(item => item.type === 4).map(item => [item.id, item.name]));
  return channels
    .filter(item => item.type !== 4)
    .map(item => ({
      id: String(item.id || ""),
      name: String(item.name || ""),
      category: String(categories.get(item.parent_id) || "Sans catégorie"),
      position: Number(item.position || 0),
      sendable: SENDABLE_TYPES.has(item.type),
      type: Number(item.type)
    }))
    .sort((a, b) => a.category.localeCompare(b.category, "fr") || a.position - b.position || a.name.localeCompare(b.name, "fr"));
}

async function loadSettings(fetchImpl = fetch) {
  return normalizeSettings(await getDocument(SETTINGS_COLLECTION, SETTINGS_DOCUMENT, fetchImpl));
}

async function audit(admin, action, target, details = "") {
  await recordAuditEvent({
    actorType: "admin",
    actorId: admin.actorId,
    actorName: admin.displayName,
    category: "administration",
    action,
    target,
    details
  }).catch(error => console.warn("Journal BOT Discord indisponible :", error?.message || error));
}

async function handleBotRequest(request, response) {
  validateBotRequest(request);
  if (request.method === "GET") {
    const settings = await loadSettings();
    sendJson(response, 200, { desiredStatus: settings.desiredStatus });
    return;
  }
  if (request.method === "POST") {
    const body = bodyOf(request);
    if (!STATUSES.has(body.currentStatus)) fail(400, "Statut invalide.");
    await mergeDocument(SETTINGS_COLLECTION, SETTINGS_DOCUMENT, {
      currentStatus: body.currentStatus,
      lastSeenAt: Date.now()
    });
    sendJson(response, 200, { received: true });
    return;
  }
  fail(405, "Méthode non autorisée.");
}

async function handleAdminRequest(request, response, requireAdmin) {
  if (!["GET", "PATCH", "POST"].includes(request.method)) fail(405, "Méthode non autorisée.");
  if (request.method !== "GET") assertSameOrigin(request);
  const admin = await requireAdmin(request);
  const guildId = String(process.env.DISCORD_GUILD_ID || "").trim();
  if (!/^\d{17,20}$/.test(guildId)) fail(503, "Le serveur Discord n'est pas configuré.");

  if (request.method === "GET") {
    const [settings, application, bot, channels] = await Promise.all([
      loadSettings(),
      discord("/applications/@me"),
      discord("/users/@me"),
      discord(`/guilds/${guildId}/channels`)
    ]);
    sendJson(response, 200, {
      settings,
      bot: { id: String(bot.id || ""), name: String(bot.username || "Bot Discord"), avatar: bot.avatar || null },
      description: String(application.description || ""),
      channels: normalizeChannels(channels)
    });
    return;
  }

  const body = bodyOf(request);
  if (request.method === "PATCH" && body.action === "status") {
    if (!STATUSES.has(body.status)) fail(400, "Choisis En ligne, Absent ou Ne pas déranger.");
    await mergeDocument(SETTINGS_COLLECTION, SETTINGS_DOCUMENT, {
      desiredStatus: body.status,
      updatedAt: new Date().toISOString(),
      updatedBy: admin.actorId
    });
    await audit(admin, "Statut du bot modifié", body.status);
    sendJson(response, 200, { updated: true, desiredStatus: body.status });
    return;
  }

  if (request.method === "PATCH" && body.action === "description") {
    const description = String(body.description || "").trim();
    if (!description || description.length > 400) fail(400, "La description doit contenir entre 1 et 400 caractères.");
    const application = await discord("/applications/@me", { method: "PATCH", body: { description } });
    await audit(admin, "Description du bot modifiée", "Profil Discord");
    sendJson(response, 200, { updated: true, description: String(application.description || description) });
    return;
  }

  if (request.method === "POST" && body.action === "message") {
    const channelId = String(body.channelId || "").trim();
    const content = String(body.content || "").trim();
    if (!/^\d{17,20}$/.test(channelId)) fail(400, "Choisis un salon valide.");
    if (!content || content.length > 2000) fail(400, "Le message doit contenir entre 1 et 2 000 caractères.");
    const channels = await discord(`/guilds/${guildId}/channels`);
    const channel = channels.find(item => item.id === channelId && SENDABLE_TYPES.has(item.type));
    if (!channel) fail(403, "Ce salon ne permet pas l'envoi de messages par le bot.");
    const sent = await discord(`/channels/${channelId}/messages`, {
      method: "POST",
      body: { content, allowed_mentions: { parse: [] } }
    });
    await audit(admin, "Message envoyé par le bot", `#${channel.name} · ${channelId}`, `Message Discord : ${sent.id || "envoyé"}`);
    sendJson(response, 200, { sent: true, messageId: String(sent.id || ""), channelId });
    return;
  }

  fail(400, "Action BOT Discord inconnue.");
}

async function handleDiscordBotControl(request, response, { requireAdmin, botRequest = false }) {
  try {
    if (botRequest) await handleBotRequest(request, response);
    else await handleAdminRequest(request, response, requireAdmin);
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error("Contrôle du bot Discord indisponible :", error);
    sendJson(response, status, { error: status >= 500 ? "Contrôle du bot temporairement indisponible." : error.message });
  }
}

module.exports = {
  handleDiscordBotControl,
  normalizeChannels,
  normalizeSettings,
  normalizedStatus,
  validateBotRequest
};
