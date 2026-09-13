const { sendJson } = require("../../lib/server/discord-prof-auth.js");
const {
  clearCompanySession,
  publicCompanySession,
  readCompanySession
} = require("../../lib/server/unified-access.js");

module.exports = function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Méthode non autorisée." });
    return;
  }

  const session = readCompanySession(request);
  if (!session) {
    response.setHeader("Set-Cookie", clearCompanySession(request));
    sendJson(response, 200, { authenticated: false });
    return;
  }

  sendJson(response, 200, publicCompanySession(session));
};
