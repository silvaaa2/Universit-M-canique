const { ProfAuthError, loadAccessRows, sendJson } = require("../../lib/server/discord-prof-auth.js");
const { verifyFirebaseProfAccess } = require("../../lib/server/firebase-prof-access.js");
const {
  createDiscordAuditChannel,
  listAuditEvents,
  recordAuditEvent,
  resolveAuditChannelId
} = require("../../lib/server/audit-log.js");
const {
  buildProfessorAccessRows,
  getProfAccessPolicy,
  loadAccessControl,
  updateProfAccessPolicy
} = require("../../lib/server/prof-access-control.js");
const handleCursusManagement = require("../../lib/server/cursus-management.js");
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

async function requireProf(request) {
  const token = getBearerToken(request);
  if (!token) throw new ProfAuthError("prof", "Connexion professeur requise.", 401);
  const access = await verifyFirebaseProfAccess(token);
  if (!access.allowed) throw new ProfAuthError("prof", "Accès professeur requis.", 403);
  return access;
}

module.exports = async function handler(request, response) {
  const requestUrl = getRequestUrl(request);
  const adminAction = requestUrl.searchParams.get("admin") || "";
  const adminCompanyCodes = adminAction === "company-codes";
  const adminCompanyPreview = adminAction === "company-preview";
  const adminCursusManagement = adminAction === "cursus-management";
  const adminAccessControl = adminAction === "access-control";
  const profAccess = requestUrl.searchParams.get("prof") === "access";
  const auditRequest = requestUrl.searchParams.get("audit") === "1";
  const stageContext = requestUrl.searchParams.get("context") === "stages";

  if (adminCursusManagement) {
    await handleCursusManagement(request, response);
    return;
  }

  if (request.method === "GET") {
    try {
      if (adminCompanyCodes) {
        await requireAdmin(request);
        sendJson(response, 200, { companies: await getCompanyCodeStates() });
        return;
      }

      if (adminAccessControl) {
        await requireAdmin(request);
        const [sheetRows, policies, logs] = await Promise.all([
          loadAccessRows({ bypassCache: true }),
          loadAccessControl({ force: true }),
          listAuditEvents({
            category: requestUrl.searchParams.get("category") || "",
            actor: requestUrl.searchParams.get("actor") || "",
            actorType: requestUrl.searchParams.get("actorType") || ""
          })
        ]);
        sendJson(response, 200, {
          users: buildProfessorAccessRows(sheetRows, policies),
          logs,
          discordChannelConfigured: Boolean(await resolveAuditChannelId())
        });
        return;
      }

      if (profAccess) {
        const access = await requireProf(request);
        sendJson(response, 200, {
          allowed: true,
          admin: access.admin,
          permissions: access.permissions || [],
          actorId: access.actorId,
          displayName: access.displayName
        });
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
      const session = await validateStageCompanySession(request);
      if (session) {
        await recordAuditEvent({
          actorType: "company",
          actorId: `company:${session.companyId}`,
          actorName: session.companyName,
          category: "connexion",
          action: "Déconnexion entreprise"
        }).catch(error => console.warn("Journal entreprise indisponible :", error?.message || error));
      }
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
      if (auditRequest) {
        const access = await requireProf(request);
        const body = readBody(request);
        const log = await recordAuditEvent({
          actorType: access.admin ? "admin" : "prof",
          actorId: access.actorId,
          actorName: access.displayName,
          category: body.category,
          action: body.action,
          target: body.target,
          details: body.details
        });
        sendJson(response, 200, { logged: true, id: log.id });
        return;
      }

      if (adminCompanyPreview) {
        const admin = await requireAdmin(request);
        const companyId = String(readBody(request).companyId || "");
        const company = COMPANIES.find(item => item.id === companyId);
        if (!company) throw new ProfAuthError("company", "Entreprise inconnue.", 404);

        response.setHeader("Set-Cookie", [
          createCompanyPreviewSession(request, company.id, admin.actorId),
          clearCompanySession(request)
        ]);
        await recordAuditEvent({
          actorType: "admin",
          actorId: admin.actorId,
          actorName: admin.displayName,
          category: "entreprises",
          action: "Ouverture de l’aperçu entreprise",
          target: company.name
        }).catch(error => console.warn("Journal aperçu indisponible :", error?.message || error));
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
      await recordAuditEvent({
        actorType: "company",
        actorId: `company:${company.id}`,
        actorName: company.name,
        category: "connexion",
        action: "Connexion entreprise validée"
      }).catch(error => console.warn("Journal connexion entreprise indisponible :", error?.message || error));
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

  if (request.method === "PATCH" && adminAccessControl) {
    try {
      assertSameOrigin(request);
      const admin = await requireAdmin(request);
      const body = readBody(request);
      const action = String(body.action || "");
      if (action === "create-audit-channel") {
        const result = await createDiscordAuditChannel(admin.actorId);
        await recordAuditEvent({
          actorType: "admin",
          actorId: admin.actorId,
          actorName: admin.displayName,
          category: "administration",
          action: result.created ? "Salon Discord des logs créé" : "Salon Discord des logs vérifié",
          target: `#logs-universite · ${result.channelId}`
        });
        sendJson(response, 200, { updated: true, discordChannelConfigured: true, ...result });
        return;
      }
      const discordId = String(body.discordId || "").trim();
      const sheetRows = await loadAccessRows({ bypassCache: true });
      const target = sheetRows.find(row => row.discordId === discordId);
      if (!target) throw new ProfAuthError("user", "Compte Discord introuvable.", 404);

      if (target.role === "admin" && action !== "disconnect") {
        throw new ProfAuthError("admin", "Les droits administrateur sont protégés.", 400);
      }
      let changes;
      let actionLabel;
      if (action === "disconnect") {
        changes = { disconnect: true };
        actionLabel = "Session déconnectée à distance";
      } else if (action === "set-disabled") {
        changes = { disabled: body.disabled === true, disconnect: body.disabled === true };
        actionLabel = body.disabled === true ? "Compte Discord désactivé" : "Compte Discord réactivé";
      } else if (action === "set-permissions") {
        changes = { permissions: body.permissions, disconnect: true };
        actionLabel = "Permissions du professeur modifiées";
      } else {
        throw new ProfAuthError("action", "Action administrateur inconnue.", 400);
      }

      const policy = await updateProfAccessPolicy(discordId, changes, admin.actorId);
      await recordAuditEvent({
        actorType: "admin",
        actorId: admin.actorId,
        actorName: admin.displayName,
        category: "administration",
        action: actionLabel,
        target: `${target.name || "Professeur"} · ${discordId}`,
        details: action === "set-permissions" ? policy.permissions.join(", ") : ""
      }).catch(error => console.warn("Journal administration indisponible :", error?.message || error));
      sendJson(response, 200, { updated: true, policy: await getProfAccessPolicy(discordId, { force: true }) });
    } catch (error) {
      const status = Number(error?.status) || 500;
      sendJson(response, status, { error: status >= 500 ? "Contrôle d’accès temporairement indisponible." : error.message });
    }
    return;
  }

  sendJson(response, 405, { error: "Méthode non autorisée." });
};
