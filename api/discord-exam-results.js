const DISCORD_API_BASE = "https://discord.com/api/v10";
const MAX_MESSAGE_LENGTH = 2000;
const ALLOWED_ROLE_IDS = new Set(["1199780299786158160", "1169634939797524480"]);
const { verifyFirebaseProfAccess } = require("../lib/server/firebase-prof-access.js");

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  if (typeof req[Symbol.asyncIterator] !== "function") return {};

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sanitizeAllowedMentions(value) {
  const roles = Array.isArray(value?.roles) ? value.roles : [];

  return {
    parse: [],
    roles: roles
      .map(role => String(role || "").trim())
      .filter(role => ALLOWED_ROLE_IDS.has(role))
  };
}

function isDiscordWebhookUrl(value) {
  try {
    const url = new URL(value);
    const allowedHost = url.hostname === "discord.com" || url.hostname === "discordapp.com";
    return url.protocol === "https:" && allowedHost && url.pathname.startsWith("/api/webhooks/");
  } catch {
    return false;
  }
}

async function resolveExamResultsChannelId() {
  const configuredChannelId = String(process.env.DISCORD_EXAM_RESULTS_CHANNEL_ID || "").trim();

  if (/^\d{17,20}$/.test(configuredChannelId)) {
    return configuredChannelId;
  }

  // Transition douce : l'ancien webhook ne sert plus à envoyer le message.
  // Il permet seulement de retrouver le salon actuel tant que son ID n'est pas configuré.
  const legacyWebhookUrl = String(process.env.DISCORD_EXAM_RESULTS_WEBHOOK_URL || "").trim();
  if (!isDiscordWebhookUrl(legacyWebhookUrl)) return "";

  const metadataResponse = await fetch(legacyWebhookUrl, { method: "GET" });
  if (!metadataResponse.ok) return "";

  const metadata = await metadataResponse.json().catch(() => ({}));
  const channelId = String(metadata.channel_id || "").trim();
  return /^\d{17,20}$/.test(channelId) ? channelId : "";
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: "Méthode non autorisée." });
    return;
  }

  const idToken = getBearerToken(req);
  if (!idToken) {
    sendJson(res, 401, { error: "Connexion professeur requise." });
    return;
  }

  try {
    const access = await verifyFirebaseProfAccess(idToken);

    if (!access.allowed) {
      sendJson(res, 403, { error: "Accès réservé aux professeurs." });
      return;
    }

    const botToken = String(process.env.DISCORD_BOT_TOKEN || "").trim();
    if (!botToken) {
      sendJson(res, 500, { error: "Bot Discord non configuré côté serveur." });
      return;
    }

    const channelId = await resolveExamResultsChannelId();
    if (!channelId) {
      sendJson(res, 500, {
        error: "Salon des résultats non configuré.",
        details: "Ajoute DISCORD_EXAM_RESULTS_CHANNEL_ID dans les variables Vercel."
      });
      return;
    }

    const body = await readJsonBody(req);
    const content = String(body.content || "").trim();

    if (!content) {
      sendJson(res, 400, { error: "Message Discord vide." });
      return;
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      sendJson(res, 400, {
        error: `Message Discord trop long (${content.length}/${MAX_MESSAGE_LENGTH} caractères).`
      });
      return;
    }

    const discordResponse = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content,
        allowed_mentions: sanitizeAllowedMentions(body.allowed_mentions)
      })
    });

    if (!discordResponse.ok) {
      const details = await discordResponse.text().catch(() => "");
      sendJson(res, 502, {
        error: `Discord a refusé l'envoi du bot (${discordResponse.status}).`,
        details: details.slice(0, 300)
      });
      return;
    }

    const sentMessage = await discordResponse.json().catch(() => ({}));
    sendJson(res, 200, {
      ok: true,
      channelId,
      messageId: String(sentMessage.id || "")
    });
  } catch (error) {
    console.error("Envoi des résultats par le bot impossible :", error);
    sendJson(res, 502, {
      error: "Envoi Discord impossible.",
      details: String(error?.message || error).slice(0, 300)
    });
  }
};
