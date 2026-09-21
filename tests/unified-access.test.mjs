import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  COMPANIES,
  createCompanyPreviewSession,
  createCompanySession,
  findCompanyByCode,
  loadCompanyCodeConfig,
  normalizeCompanyCode,
  readCompanyPreviewSession,
  readCompanySession,
  validateCompanySession
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
  const stageCss = await readFile(new URL("../stages/assets/css/stage.css", import.meta.url), "utf8");
  const serverProxy = await readFile(new URL("../api/access/stage-data.js", import.meta.url), "utf8");

  assert.match(stageApp, /fetchCompanyRows\("stages"\)/);
  assert.match(stageApp, /fetchCompanyRows\("exams"\)/);
  assert.match(stageApp, /fetchCompanyRows\("student-progress"/);
  assert.match(stageApp, /data-company-student-id/);
  assert.match(stageApp, /data-company-warning-student/);
  assert.match(stageApp, /companyWarningByStudentId/);
  assert.match(stageApp, /openCompanyStudentWarning/);
  assert.match(stageApp, /companyStudentProgressModal/);
  assert.match(stageApp, /lockCompanyStudentProgressScroll\(\)/);
  assert.match(stageApp, /unlockCompanyStudentProgressScroll\(\)/);
  assert.match(stageApp, /document\.body\.classList\.add\("company-student-modal-open"\)/);
  assert.doesNotMatch(stageApp, /document\.body\.style\.top|window\.scrollTo\(0, companyStudentProgressScrollY\)/);
  assert.match(stageCss, /\.company-student-progress-modal,[\s\S]*\.company-warning-modal\s*\{[^}]*position: fixed !important;[^}]*align-items: center;[^}]*justify-content: center;/);
  assert.match(stageCss, /body\.company-student-modal-open\s*\{[^}]*overflow: hidden;/);
  assert.doesNotMatch(stageCss, /body\.company-student-modal-open\s*\{[^}]*position: fixed;/);
  assert.match(stageApp, /stageDirectory = \(payload\.directory \|\| \[\]\)/);
  assert.match(stageApp, /const found = stageDirectory\.find/);
  assert.match(stageApp, /IS_COMPANY_ACCESS[\s\S]*\/api\/secure-sheet\?source=effectif&sheet=current/);
  assert.match(stageApp, /currentUserRole = "company"/);
  assert.doesNotMatch(stageApp, /Vérifie que le Google Sheet est bien public en lecture/);
  assert.match(serverProxy, /row\.companyId === session\.companyId/);
  assert.match(serverProxy, /directory: rows\.map\(row => \(\{/);
  assert.match(serverProxy, /companyName: String\(row\.companyName \|\| ""\)/);
  assert.match(serverProxy, /STUDENT_MODULES_COLLECTION = "studentModules"/);
  assert.match(serverProxy, /warnings: await readCompanyWarnings\(companyRows\)/);
  assert.match(serverProxy, /companyStudentIds = new Set\(companyRows/);
  assert.match(serverProxy, /getDocument\(STUDENT_MODULES_COLLECTION, `\$\{cursusKey\}__\$\{studentId\}`\)/);
  assert.match(serverProxy, /getDocument\(STUDENT_MODULES_COLLECTION, `\$\{cursusKey\}__\$\{requestedId\}`\)/);
  assert.match(serverProxy, /warningComment[\s\S]*slice\(0, 1200\)/);
  assert.match(serverProxy, /kind === "student-progress"/);
  assert.match(serverProxy, /module1: readCheck\("module1"\)/);
  assert.doesNotMatch(serverProxy, /verif3: readCheck|verif4: readCheck/);
  assert.doesNotMatch(stageApp, /Vérif 3|Vérif 4|company-verification-badge/);
  assert.match(serverProxy, /documentId\.startsWith\(`\$\{session\.companyId\}__`\)/);
  assert.match(serverProxy, /if \(kind !== "stages"\)/);
});

test("les entreprises voient uniquement les avertissements de leurs stagiaires en lecture seule", async () => {
  const stageApp = await readFile(new URL("../stages/assets/js/stage-app.js", import.meta.url), "utf8");
  const stageCss = await readFile(new URL("../stages/assets/css/stage.css", import.meta.url), "utf8");
  const effectifRenderer = stageApp.slice(
    stageApp.indexOf("function renderEffectifRows"),
    stageApp.indexOf("function renderRightPanelTabs")
  );
  const companyRenderer = stageApp.slice(
    stageApp.indexOf("function renderCompanies"),
    stageApp.indexOf("function renderExamParticipants")
  );
  const warningPopup = stageApp.slice(
    stageApp.indexOf("function ensureCompanyWarningModal"),
    stageApp.indexOf("function ensureCompanyStudentProgressModal")
  );

  assert.match(warningPopup, /Avertissement actuel/);
  assert.match(warningPopup, /Raison indiquée par le professeur/);
  assert.match(warningPopup, /lecture seule/);
  assert.doesNotMatch(warningPopup, /setDoc|data-warning-save|method:\s*"POST"/);
  assert.doesNotMatch(effectifRenderer, /data-company-warning-student/);
  assert.match(companyRenderer, /stage-student-id-line/);
  assert.match(companyRenderer, /data-company-warning-student/);
  assert.match(stageCss, /\.company-warning-triangle/);
  assert.match(stageCss, /\.company-warning-modal/);
});

test("l’effectif entreprise passe par la session serveur sans exposer les autres feuilles", async () => {
  const secureSheet = await readFile(new URL("../api/secure-sheet.js", import.meta.url), "utf8");

  assert.match(secureSheet, /validateStageCompanySession\(req\)/);
  assert.match(secureSheet, /source === EFFECTIF_SOURCE && sheet === EFFECTIF_SHEET_KEY/);
  assert.match(secureSheet, /idToken \? \{[\s\S]*Authorization: `Bearer \$\{idToken\}`[\s\S]*\} : \{ cache: "no-store" \}/);
});

test("l’aperçu entreprise admin utilise une session séparée et limitée", () => {
  process.env.DISCORD_SESSION_SECRET = "test-session-secret-long-de-plus-de-trente-deux-caracteres";

  const company = COMPANIES[1];
  const request = { headers: { host: "localhost", "x-forwarded-proto": "http" } };
  const cookie = createCompanyPreviewSession(request, company.id, "admin-test");
  const cookieValue = cookie.match(/university_admin_company_preview=([^;]+)/)?.[1];
  const restored = readCompanyPreviewSession({
    headers: { cookie: `university_admin_company_preview=${cookieValue}` }
  });

  assert.equal(restored.companyId, company.id);
  assert.equal(restored.role, "company");
  assert.equal(restored.adminPreview, true);
  assert.equal(restored.actorId, "admin-test");
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

test("une limite Firebase temporaire ne bloque ni le formulaire ni une session entreprise signée", async () => {
  process.env.DISCORD_SESSION_SECRET = "test-session-secret-long-de-plus-de-trente-deux-caracteres";
  const quotaError = Object.assign(new Error("Lecture Firebase impossible (429)."), { status: 429 });
  const unavailableLoader = async () => { throw quotaError; };

  const fallbackConfig = await loadCompanyCodeConfig({
    force: true,
    fallbackToDefaults: true,
    loader: unavailableLoader,
    wait: async () => {}
  });
  assert.deepEqual(fallbackConfig, { hashes: {}, versions: {}, updatedAt: {} });

  const company = COMPANIES[2];
  const request = { headers: { host: "localhost", "x-forwarded-proto": "http" } };
  const cookie = createCompanySession(request, company);
  const cookieValue = cookie.match(/university_company_access=([^;]+)/)?.[1];
  const restored = await validateCompanySession({
    headers: { cookie: `university_company_access=${cookieValue}` }
  }, {
    loader: unavailableLoader,
    wait: async () => {}
  });

  assert.equal(restored.companyId, company.id);
  assert.equal(restored.credentialVersion, "default");
});

test("le déploiement reste dans la limite de fonctions du projet Vercel", async () => {
  async function countJavaScriptFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const counts = await Promise.all(entries.map(entry => (
      entry.isDirectory()
        ? countJavaScriptFiles(new URL(`${entry.name}/`, directory))
        : Number(entry.name.endsWith(".js"))
    )));
    return counts.reduce((sum, count) => sum + count, 0);
  }

  assert.ok(await countJavaScriptFiles(new URL("../api/", import.meta.url)) <= 12);
});

test("le proxy Firestore échange sa session Firebase depuis l’origine officielle", async () => {
  const serverClient = await readFile(new URL("../lib/server/firestore-service-account.js", import.meta.url), "utf8");

  assert.match(serverClient, /identitytoolkit\.googleapis\.com/);
  assert.match(serverClient, /Origin: PUBLIC_ORIGIN/);
  assert.match(serverClient, /Referer: `\$\{PUBLIC_ORIGIN\}\//);
  assert.match(serverClient, /discordId: "stage-company-service"/);
});
