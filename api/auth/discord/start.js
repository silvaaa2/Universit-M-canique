const crypto = require("crypto");
const {
  STATE_COOKIE,
  STATE_MAX_AGE_SECONDS,
  buildDiscordAuthorizeUrl,
  createOAuthState,
  redirect,
  sendJson,
  serializeCookie
} = require("../../../lib/server/discord-prof-auth.js");

module.exports = function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Méthode non autorisée." });
    return;
  }

  try {
    const nonce = crypto.randomBytes(24).toString("base64url");
    const state = createOAuthState(nonce);
    const stateCookie = serializeCookie(request, STATE_COOKIE, state.nonce, {
      maxAge: STATE_MAX_AGE_SECONDS,
      path: "/api/auth/discord"
    });
    redirect(response, buildDiscordAuthorizeUrl(state.value), [stateCookie]);
  } catch (error) {
    console.error("Démarrage OAuth Discord impossible :", error);
    sendJson(response, 500, { error: "Connexion Discord indisponible." });
  }
};
