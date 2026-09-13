const { ProfAuthError, sendJson } = require("../../lib/server/discord-prof-auth.js");
const {
  assertSameOrigin,
  createCompanySession,
  findCompanyByCode,
  publicCompanySession
} = require("../../lib/server/unified-access.js");

module.exports = function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Méthode non autorisée." });
    return;
  }

  try {
    assertSameOrigin(request);
    const body = typeof request.body === "string"
      ? JSON.parse(request.body || "{}")
      : (request.body || {});
    const code = String(body.code || "");
    const company = findCompanyByCode(code);
    if (!company) {
      sendJson(response, 401, { error: "Code entreprise incorrect." });
      return;
    }

    response.setHeader("Set-Cookie", createCompanySession(request, company));
    sendJson(response, 200, {
      ...publicCompanySession({
        role: "company",
        label: company.name,
        companyId: company.id,
        companyName: company.name
      })
    });
  } catch (error) {
    const status = error instanceof ProfAuthError ? error.status : 500;
    sendJson(response, status, {
      error: status === 500 ? "Connexion entreprise indisponible." : error.message
    });
  }
};
