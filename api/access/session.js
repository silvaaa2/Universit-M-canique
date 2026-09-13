const { ProfAuthError, sendJson } = require("../../lib/server/discord-prof-auth.js");
const {
  assertSameOrigin,
  clearCompanySession,
  createCompanySession,
  findCompanyByCode,
  publicCompanySession,
  readCompanySession
} = require("../../lib/server/unified-access.js");

module.exports = function handler(request, response) {
  if (request.method === "GET") {
    const session = readCompanySession(request);
    if (!session) {
      response.setHeader("Set-Cookie", clearCompanySession(request));
      sendJson(response, 200, { authenticated: false });
      return;
    }

    sendJson(response, 200, publicCompanySession(session));
    return;
  }

  if (request.method === "DELETE") {
    try {
      assertSameOrigin(request);
      response.setHeader("Set-Cookie", clearCompanySession(request));
      sendJson(response, 200, { loggedOut: true });
    } catch (error) {
      sendJson(response, Number(error?.status) || 403, { error: error.message || "Déconnexion refusée." });
    }
    return;
  }

  if (request.method === "POST") {
    try {
      assertSameOrigin(request);
      const body = typeof request.body === "string"
        ? JSON.parse(request.body || "{}")
        : (request.body || {});
      const company = findCompanyByCode(String(body.code || ""));
      if (!company) {
        sendJson(response, 401, { error: "Code entreprise incorrect." });
        return;
      }

      response.setHeader("Set-Cookie", createCompanySession(request, company));
      sendJson(response, 200, publicCompanySession({
        role: "company",
        label: company.name,
        companyId: company.id,
        companyName: company.name
      }));
    } catch (error) {
      const status = error instanceof ProfAuthError ? error.status : 500;
      sendJson(response, status, {
        error: status === 500 ? "Connexion entreprise indisponible." : error.message
      });
    }
    return;
  }

  sendJson(response, 405, { error: "Méthode non autorisée." });
};
