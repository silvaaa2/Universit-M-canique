import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  COMPANIES,
  createCompanySession,
  findCompanyByCode,
  normalizeCompanyCode,
  readCompanySession
} = require("../lib/server/unified-access.js");

test("les codes entreprise ne sont jamais livrés au navigateur", async () => {
  const portal = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const browserScript = await readFile(new URL("../assets/js/unified-access.js", import.meta.url), "utf8");

  assert.equal(COMPANIES.length, 7);
  COMPANIES.forEach(company => assert.match(company.hash, /^[a-f0-9]{64}$/));
  assert.doesNotMatch(portal, /PALETO-M4|BENNYS-M4|LSC-M4/);
  assert.doesNotMatch(browserScript, /hash:\s*["']/);
  assert.equal(findCompanyByCode("code-invalide"), null);
  assert.equal(normalizeCompanyCode("  abc - 123 "), "ABC-123");
});

test("le portail expose les trois parcours demandés", async () => {
  const portal = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(portal, /Continuer avec Discord/);
  assert.match(portal, /Continuer en tant qu’élève/);
  assert.match(portal, /Connexion avec un code entreprise/);
});

test("le suivi de stage applique le périmètre entreprise côté requête", async () => {
  const stageApp = await readFile(new URL("../stages/assets/js/stage-app.js", import.meta.url), "utf8");
  const serverProxy = await readFile(new URL("../api/access/stage-data.js", import.meta.url), "utf8");

  assert.match(stageApp, /fetchCompanyRows\("stages"\)/);
  assert.match(stageApp, /fetchCompanyRows\("exams"\)/);
  assert.match(stageApp, /currentUserRole = "company"/);
  assert.match(serverProxy, /row\.companyId === session\.companyId/);
  assert.match(serverProxy, /documentId\.startsWith\(`\$\{session\.companyId\}__`\)/);
  assert.match(serverProxy, /if \(kind !== "stages"\)/);
});

test("la session entreprise est signée et reste limitée à son périmètre serveur", () => {
  process.env.DISCORD_SESSION_SECRET = "test-session-secret-long-de-plus-de-trente-deux-caracteres";

  const company = COMPANIES[0];
  const request = { headers: { host: "localhost", "x-forwarded-proto": "http" } };
  const cookie = createCompanySession(request, company);
  const cookieValue = cookie.match(/university_company_access=([^;]+)/)?.[1];
  const restored = readCompanySession({ headers: { cookie: `university_company_access=${cookieValue}` } });

  assert.equal(restored.companyId, company.id);
  assert.equal(restored.companyName, company.name);
  assert.equal(restored.role, "company");
});
