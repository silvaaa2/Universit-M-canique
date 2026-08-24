const {
  TICKET_COOKIE,
  ProfAuthError,
  decryptLoginTicket,
  parseCookies,
  sendJson,
  serializeCookie
} = require("../../../lib/server/discord-prof-auth.js");

module.exports = function handler(request, response) {
  const clearTicketCookie = serializeCookie(request, TICKET_COOKIE, "", {
    maxAge: 0,
    path: "/api/auth/discord/complete"
  });
  response.setHeader("Set-Cookie", clearTicketCookie);

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Méthode non autorisée." });
    return;
  }

  try {
    const ticket = parseCookies(request)[TICKET_COOKIE];
    const payload = decryptLoginTicket(ticket);
    sendJson(response, 200, {
      ok: true,
      customToken: payload.customToken,
      profile: {
        discordId: payload.identity?.discordId || "",
        displayName: payload.identity?.displayName || "Professeur",
        avatarUrl: payload.identity?.avatarUrl || "",
        siteRole: payload.identity?.siteRole || "prof",
        admin: payload.identity?.admin === true,
        roleSynced: payload.identity?.roleSynced === true
      }
    });
  } catch (error) {
    const status = error instanceof ProfAuthError ? error.status : 401;
    sendJson(response, status, {
      error: "La connexion Discord a expiré. Recommence la connexion.",
      code: error instanceof ProfAuthError ? error.code : "session_expired"
    });
  }
};
