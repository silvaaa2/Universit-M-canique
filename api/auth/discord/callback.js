const {
  STATE_COOKIE,
  TICKET_COOKIE,
  TICKET_MAX_AGE_SECONDS,
  ProfAuthError,
  authorizeDiscordLogin,
  createFirebaseCustomToken,
  encryptLoginTicket,
  getErrorRedirect,
  getLoginPath,
  parseCookies,
  redirect,
  serializeCookie,
  verifyOAuthState
} = require("../../../lib/server/discord-prof-auth.js");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed");
    return;
  }

  const clearStateCookie = serializeCookie(request, STATE_COOKIE, "", {
    maxAge: 0,
    path: "/api/auth/discord"
  });
  const clearTicketCookie = serializeCookie(request, TICKET_COOKIE, "", {
    maxAge: 0,
    path: "/api/auth/discord/complete"
  });

  try {
    const query = request.query || {};
    if (query.error) {
      redirect(response, getErrorRedirect("discord_cancelled"), [clearStateCookie]);
      return;
    }

    const code = String(query.code || "").trim();
    const state = String(query.state || "").trim();
    const cookies = parseCookies(request);

    if (!code || !state || !cookies[STATE_COOKIE]) {
      throw new ProfAuthError("session_expired", "Session Discord incomplète.", 401);
    }

    verifyOAuthState(state, cookies[STATE_COOKIE]);
    const identity = await authorizeDiscordLogin(code);
    const customToken = createFirebaseCustomToken(identity);
    const ticket = encryptLoginTicket({
      customToken,
      identity,
      expiresAt: Date.now() + TICKET_MAX_AGE_SECONDS * 1000
    });
    const ticketCookie = serializeCookie(request, TICKET_COOKIE, ticket, {
      maxAge: TICKET_MAX_AGE_SECONDS,
      path: "/api/auth/discord/complete"
    });

    const params = new URLSearchParams({ discord: "complete" });
    if (!identity.roleSynced) params.set("discord_warning", "role_sync");
    redirect(response, `${getLoginPath()}?${params.toString()}`, [clearStateCookie, ticketCookie]);
  } catch (error) {
    const code = error instanceof ProfAuthError ? error.code : "unknown";
    console.error("Callback OAuth Discord impossible :", code, error.message);
    redirect(response, getErrorRedirect(code), [clearStateCookie, clearTicketCookie]);
  }
};
