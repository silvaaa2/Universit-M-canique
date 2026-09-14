const { ProfAuthError, sendJson } = require("../../lib/server/discord-prof-auth.js");
const { verifyFirebaseProfAccess } = require("../../lib/server/firebase-prof-access.js");
const {
  COMPANIES,
  authenticateCompanyCode,
  assertSameOrigin,
  clearCompanyPreviewSession,
  clearCompanySession,
  createCompanyPreviewSession,
  createCompanySession,
  getCompanyCodeStates,
  publicCompanySession,
  updateCompanyCode,
  validateCompanySession,
  validateStageCompanySession
} = require("../../lib/server/unified-access.js");

function getRequestUrl(request) {
  return new URL(request.url, `https://${request.headers?.host || "localhost"}`);
}

function getBearerToken(request) {
  const authorization = String(request.headers?.authorization || "");
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

function readBody(request) {
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return request.body || {};
}

async function requireAdmin(request) {
  const token = getBearerToken(request);
  if (!token) throw new ProfAuthError("admin", "Connexion administrateur requise.", 401);
  const access = await verifyFirebaseProfAccess(token);
  if (!access.admin) throw new ProfAuthError("admin", "Accès administrateur requis.", 403);
  return access;
}

module.exports = async function handler(request, response) {
  const requestUrl = getRequestUrl(request);
  const adminAction = requestUrl.searchParams.get("admin") || "";
  const adminCompanyCodes = adminAction === "company-codes";
  const adminCompanyPreview = adminAction === "company-preview";
  const stageContext = requestUrl.searchParams.get("context") === "stages";

  if (request.method === "GET") {
    try {
      if (adminCompanyCodes) {
        await requireAdmin(request);
        sendJson(response, 200, { companies: await getCompanyCodeStates() });
        return;
      }

      const session = stageContext
        ? await validateStageCompanySession(request)
        : await validateCompanySession(request);
      if (!session) {
        response.setHeader("Set-Cookie", stageContext
          ? [clearCompanySession(request), clearCompanyPreviewSession(request)]
          : clearCompanySession(request));
        sendJson(response, 200, { authenticated: false });
        return;
      }
      sendJson(response, 200, publicCompanySession(session));
    } catch (error) {
      const status = Number(error?.status) || 500;
      sendJson(response, status, { error: status >= 500 ? "Session temporairement indisponible." : error.message });
    }
    return;
  }

  if (request.method === "DELETE") {
    try {
      assertSameOrigin(request);
      response.setHeader("Set-Cookie", adminCompanyPreview
        ? clearCompanyPreviewSession(request)
        : [clearCompanySession(request), clearCompanyPreviewSession(request)]);
      sendJson(response, 200, { loggedOut: true });
    } catch (error) {
      sendJson(response, Number(error?.status) || 403, { error: error.message || "Déconnexion refusée." });
    }
    return;
  }

  if (request.method === "POST") {
    try {
      assertSameOrigin(request);
      if (adminCompanyPreview) {
        const admin = await requireAdmin(request);
        const companyId = String(readBody(request).companyId || "");
        const company = COMPANIES.find(item => item.id === companyId);
        if (!company) throw new ProfAuthError("company", "Entreprise inconnue.", 404);

        response.setHeader("Set-Cookie", [
          createCompanyPreviewSession(request, company.id, admin.actorId),
          clearCompanySession(request)
        ]);
        sendJson(response, 200, publicCompanySession({
          role: "company",
          label: company.name,
          companyId: company.id,
          companyName: company.name,
          adminPreview: true
        }));
        return;
      }

      const access = await authenticateCompanyCode(String(readBody(request).code || ""));
      if (!access) {
        sendJson(response, 401, { error: "Code entreprise incorrect." });
        return;
      }

      response.setHeader("Set-Cookie", [
        createCompanySession(request, access),
        clearCompanyPreviewSession(request)
      ]);
      const { company } = access;
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

  if (request.method === "PATCH" && adminCompanyCodes) {
    try {
      assertSameOrigin(request);
      const admin = await requireAdmin(request);
      const body = readBody(request);
      if (String(body.newCode || "") !== String(body.confirmation || "")) {
        throw new ProfAuthError("confirmation", "Les deux codes ne correspondent pas.", 400);
      }
      const result = await updateCompanyCode(body.companyId, body.newCode, admin.actorId);
      sendJson(response, 200, {
        updated: true,
        company: { id: result.company.id, name: result.company.name },
        updatedAt: result.updatedAt
      });
    } catch (error) {
      const status = Number(error?.status) || 500;
      sendJson(response, status, { error: status >= 500 ? "Modification temporairement indisponible." : error.message });
    }
    return;
  }

  sendJson(response, 405, { error: "Méthode non autorisée." });
};
