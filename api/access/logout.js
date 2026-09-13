const { sendJson } = require("../../lib/server/discord-prof-auth.js");
const {
  assertSameOrigin,
  clearCompanySession
} = require("../../lib/server/unified-access.js");

module.exports = function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Méthode non autorisée." });
    return;
  }

  try {
    assertSameOrigin(request);
    response.setHeader("Set-Cookie", clearCompanySession(request));
    sendJson(response, 200, { loggedOut: true });
  } catch (error) {
    sendJson(response, Number(error?.status) || 403, { error: error.message || "Déconnexion refusée." });
  }
};
