const FIREBASE_WEB_API_KEY = "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c";
const FIREBASE_PROJECT_ID = "universit-4b11e";
const ALLOWED_ROLE_IDS = new Set(["1199780299786158160", "1169634939797524480"]);

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

async function getFirebaseUser(idToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    }
  );

  if (!response.ok) {
    throw new Error("Token Firebase invalide.");
  }

  const data = await response.json();
  const user = data.users?.[0];

  if (!user?.email) {
    throw new Error("Utilisateur Firebase introuvable.");
  }

  return user;
}

async function getUserAccess(email, idToken) {
  const encodedEmail = encodeURIComponent(email);
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${encodedEmail}`,
    {
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error("Rôle utilisateur impossible à vérifier.");
  }

  const data = await response.json();
  const fields = data.fields || {};

  return {
    role: fields.role?.stringValue || null,
    admin: fields.admin?.booleanValue === true
  };
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

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Méthode non autorisée." });
    return;
  }

  const webhookUrl = process.env.DISCORD_EXAM_RESULTS_WEBHOOK_URL;

  if (!webhookUrl) {
    sendJson(res, 500, { error: "Webhook Discord non configuré côté serveur." });
    return;
  }

  try {
    const idToken = getBearerToken(req);

    if (!idToken) {
      sendJson(res, 401, { error: "Connexion professeur requise." });
      return;
    }

    const user = await getFirebaseUser(idToken);
    const access = await getUserAccess(user.email, idToken);

    if (access.role !== "prof" && access.admin !== true) {
      sendJson(res, 403, { error: "Accès réservé aux professeurs." });
      return;
    }

    const body = await readJsonBody(req);
    const content = String(body.content || "").trim();

    if (!content) {
      sendJson(res, 400, { error: "Message Discord vide." });
      return;
    }

    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        allowed_mentions: sanitizeAllowedMentions(body.allowed_mentions)
      })
    });

    if (!discordResponse.ok) {
      const details = await discordResponse.text().catch(() => "");
      sendJson(res, 502, {
        error: `Discord a refusé l'envoi (${discordResponse.status}).`,
        details
      });
      return;
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("Envoi Discord examens impossible :", error);
    sendJson(res, 500, { error: error.message || "Envoi Discord impossible." });
  }
};
