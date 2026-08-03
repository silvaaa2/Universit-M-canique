const MAX_MESSAGE_LENGTH = 3800;
const EMBED_COLOR = 0xd6b46a;
const FIREBASE_PROJECT_ID = "universit-4b11e";

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function getHeader(request, name) {
  const value = request.headers?.[name.toLowerCase()] ?? request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function getBearerToken(request) {
  const authorization = getHeader(request, "authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function getEmailFromToken(token) {
  try {
    const payload = JSON.parse(decodeBase64Url(token.split(".")[1] || ""));
    return String(payload.email || "").trim();
  } catch {
    return "";
  }
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") return request.body;

  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      return {};
    }
  }

  if (typeof request[Symbol.asyncIterator] !== "function") return {};

  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) return {};

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
}

async function loadAdminAccess(idToken, email) {
  const userDocUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(email)}`;

  const response = await fetch(userDocUrl, {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return false;
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || "Firestore access failed");
  }

  const userDocument = await response.json();
  return userDocument.fields?.admin?.booleanValue === true;
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const idToken = getBearerToken(request);
  const email = getEmailFromToken(idToken);

  if (!idToken || !email) {
    sendJson(response, 401, { error: "Connexion admin requise" });
    return;
  }

  try {
    const isAdmin = await loadAdminAccess(idToken, email);

    if (!isAdmin) {
      sendJson(response, 403, { error: "Accès admin requis" });
      return;
    }
  } catch (error) {
    sendJson(response, 502, {
      error: "Vérification admin impossible",
      details: String(error?.message || error).slice(0, 300)
    });
    return;
  }

  const webhook = process.env.DISCORD_PATCH_WEBHOOK || "";
  if (!/^https:\/\/discord(?:app)?\.com\/api\/webhooks\//.test(webhook)) {
    sendJson(response, 500, { error: "DISCORD_PATCH_WEBHOOK is not configured" });
    return;
  }

  const body = await readJsonBody(request);
  const title = String(body.title || "PATCH NOTE - Site Prof").trim().slice(0, 256);
  const message = String(body.message || "").trim();

  if (!message) {
    sendJson(response, 400, { error: "Message required" });
    return;
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    sendJson(response, 400, { error: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.` });
    return;
  }

  const discordPayload = {
    username: "Universite Mecanique",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: title || "PATCH NOTE - Site Prof",
        description: message,
        color: EMBED_COLOR,
        timestamp: new Date().toISOString(),
        footer: { text: "Patch note admin" }
      }
    ]
  };

  try {
    const discordResponse = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload)
    });

    if (!discordResponse.ok) {
      const details = await discordResponse.text().catch(() => "");
      sendJson(response, 502, {
        error: "Discord rejected the message",
        details: details.slice(0, 300)
      });
      return;
    }

    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 502, {
      error: "Discord request failed",
      details: String(error?.message || error).slice(0, 300)
    });
  }
};
