import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  ALL_PERMISSIONS,
  buildProfessorAccessRows,
  normalizePermissions,
  resolveOwnerDiscordId
} = require("../lib/server/prof-access-control.js");
const { isPassiveAuditEvent, normalizeAuditEvent } = require("../lib/server/audit-log.js");

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("les permissions professeur sont toutes réellement décochables", () => {
  assert.deepEqual(normalizePermissions(["modules", "exams"]), ["exams", "modules"]);
  assert.deepEqual(normalizePermissions([]), []);
  assert.deepEqual(normalizePermissions([], true), [...ALL_PERMISSIONS]);
  const rows = buildProfessorAccessRows([
    { discordId: "123456789012345678", name: "Prof Test", role: "prof", active: true },
    { discordId: "223456789012345678", name: "Admin Test", role: "admin", active: true },
    { discordId: "323456789012345678", name: "Marc Carter", role: "admin", active: true }
  ], {
    "123456789012345678": { disabled: true, permissions: ["modules"] },
    "223456789012345678": { adminOverride: false, permissions: ["exams"] }
  });
  assert.equal(rows[0].disabled, true);
  assert.deepEqual(rows[0].permissions, ["modules"]);
  assert.equal(rows[1].disabled, false);
  assert.equal(rows[1].role, "prof");
  assert.deepEqual(rows[1].permissions, ["exams"]);
  assert.equal(rows[2].owner, true);
  assert.equal(rows[2].role, "admin");
  assert.equal(resolveOwnerDiscordId([{ discordId: "323456789012345678", name: "Marc Carter", role: "admin", active: true }]), "323456789012345678");
});

test("le journal nettoie les actions et distingue professeurs et entreprises", () => {
  const event = normalizeAuditEvent({
    actorType: "company",
    actorId: "company:lsc",
    actorName: "LSC",
    category: "entreprises",
    action: "Ajout\nstagiaire",
    target: "123"
  });
  assert.equal(event.actorType, "company");
  assert.equal(event.action, "Ajout stagiaire");
  assert.equal(event.category, "entreprises");
  assert.equal(isPassiveAuditEvent({ action: "Ouverture de la page" }), true);
  assert.equal(isPassiveAuditEvent({ action: "Consultation de l’effectif" }), true);
  assert.equal(isPassiveAuditEvent(event), false);
});

test("l’admin privé contrôle les sessions, comptes, pages et journaux", async () => {
  const endpoint = await read("api/access/session.js");
  const adminLoader = await read("assets/js/prof-admin-v2.js");
  const adminPanel = await read("assets/js/prof-admin-access-control.js");
  const dashboard = await read("pages/espace-prof.html");
  const policy = await read("assets/js/prof-access-policy.js");
  const audit = await read("assets/js/prof-audit.js");

  assert.match(endpoint, /adminAction === "access-control"/);
  assert.match(endpoint, /action === "disconnect"/);
  assert.match(endpoint, /action === "set-disabled"/);
  assert.match(endpoint, /action === "set-permissions"/);
  assert.match(endpoint, /action === "set-admin"/);
  assert.match(endpoint, /Seul Marc Carter peut modifier les droits administrateur/);
  assert.match(adminLoader, /prof-admin-access-control\.js/);
  assert.match(adminPanel, /Déconnecter la session/);
  assert.match(adminPanel, /Désactiver temporairement/);
  assert.match(adminPanel, /Journal d’activité/);
  assert.match(adminPanel, /Donner les droits admin/);
  assert.match(dashboard, /id="profAccessLogsBtn"/);
  assert.match(adminLoader, /#profAdminBtn, #profAccessLogsBtn/);
  assert.match(adminPanel, /id="profAccessControlModal"/);
  assert.doesNotMatch(adminPanel, /data-admin-tab=.*accessControl/);
  assert.match(policy, /CHECK_INTERVAL_MS = 60_000/);
  assert.match(policy, /profAccessRevoked/);
  assert.doesNotMatch(audit, /Ouverture de la page/);
  assert.match(audit, /Validation :/);
});

test("les entreprises ont un graphique, une identité et un avertissement réellement fermable", async () => {
  const app = await read("stages/assets/js/stage-app.js");
  const css = await read("stages/assets/css/stage.css");

  assert.match(app, /Stages par cursus/);
  assert.match(app, /renderCompanyCursusChart/);
  assert.match(app, /renderCompanyLogo/);
  assert.match(app, /company-data-arrived/);
  assert.match(app, /COMPANY_REFRESH_MS = 600_000/);
  assert.match(css, /\.company-warning-modal\[hidden\][\s\S]*display: none !important/);
  assert.match(css, /\.company-brand-logo/);
  assert.match(css, /\.company-cursus-chart/);
});

test("Paleto Garage utilise son vrai logo dans son espace entreprise", async () => {
  const app = await read("stages/assets/js/stage-app.js");
  const css = await read("stages/assets/css/stage.css");
  const logo = await read("Images/companies/paleto-garage.webp");

  assert.match(app, /id: "paleto"[\s\S]*logo: "\/Images\/companies\/paleto-garage\.webp"/);
  assert.match(app, /class="company-brand-logo has-image"/);
  assert.match(css, /\.company-brand-logo\.has-image img/);
  assert.match(css, /\.company-brand-logo\.has-image\s*\{[^}]*background:\s*transparent;/);
  assert.match(css, /\.company-brand-logo\.has-image\s*\{[^}]*filter:\s*none;/);
  assert.doesNotMatch(css, /\.company-brand-logo\.has-image\s*\{[^}]*border-radius:\s*50%/);
  assert.match(css, /body\.company-workspace \.brand-logo\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/);
  assert.ok(logo.length > 1_000, "le fichier du logo Paleto ne doit pas être vide");
});

test("la nouvelle interface APEX Stage couvre toutes les entreprises", async () => {
  const app = await read("stages/assets/js/stage-app.js");
  const css = await read("stages/assets/css/stage.css");

  assert.match(app, /IS_COMPANY_STAGE_V2 = IS_COMPANY_ACCESS/);
  assert.match(app, /`Navigation \$\{scopedCompany\.name\}`/);
  assert.match(app, /escapeHtml\(scopedCompany\.name\)/);
  assert.match(app, /className = "paleto-stage-sidebar"/);
  assert.match(app, /data-paleto-stage-panel="dashboard"/);
  assert.match(app, /data-paleto-stage-panel="stages"/);
  assert.match(app, /data-paleto-stage-panel="archives"/);
  assert.match(app, /panel === "archives" \? "archives"/);
  assert.match(css, /body\.paleto-stage-v2 \.stage-header/);
  assert.match(css, /body\.paleto-stage-v2 \.stage-layout/);
  assert.match(css, /body\.paleto-stage-v2 \.company-cursus-chart \{ display: none !important; \}/);
  assert.doesNotMatch(css, /body\.company-workspace\.paleto-stage-v2|body\.company-workspace\s+\.paleto-stage-sidebar/);
});

test("Harmony Repair utilise son vrai logo dans son espace entreprise", async () => {
  const app = await read("stages/assets/js/stage-app.js");
  const logo = await read("Images/companies/harmony-repair.webp");

  assert.match(app, /id: "harmony"[\s\S]*logo: "\/Images\/companies\/harmony-repair\.webp"/);
  assert.ok(logo.length > 1_000, "le fichier du logo Harmony ne doit pas être vide");
});

test("Cayo Garage utilise son vrai logo dans son espace entreprise", async () => {
  const app = await read("stages/assets/js/stage-app.js");
  const logo = await read("Images/companies/cayo-garage.webp");

  assert.match(app, /id: "cayo"[\s\S]*logo: "\/Images\/companies\/cayo-garage\.webp"/);
  assert.ok(logo.length > 1_000, "le fichier du logo Cayo ne doit pas être vide");
});

test("le salon Discord des logs reste une configuration serveur", async () => {
  const audit = await read("lib/server/audit-log.js");
  assert.match(audit, /process\.env\.DISCORD_AUDIT_CHANNEL_ID/);
  assert.match(audit, /Authorization: `Bot \$\{token\}`/);
  assert.match(audit, /Effectué par/);
  assert.match(audit, /Informations précises/);
  assert.doesNotMatch(audit, /allowed_mentions:\s*\{\s*parse:\s*\["everyone"\]/);
});
