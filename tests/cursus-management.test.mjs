import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cursusManagement = require("../lib/server/cursus-management.js");

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("l’admin privé archive le cursus dans l’ordre stages puis modules", async () => {
  const server = await read("lib/server/cursus-management.js");
  const client = await read("assets/js/prof-admin-cursus-management.js");
  const loader = await read("assets/js/prof-admin-v2.js");
  const session = await read("api/access/session.js");

  assert.match(loader, /prof-admin-cursus-management\.js/);
  assert.match(session, /adminAction === "cursus-management"/);
  assert.match(server, /action === "archive-stages"/);
  assert.match(server, /action === "archive-modules"/);
  assert.match(server, /L’étape 1 doit être terminée avant les modules/);
  assert.match(server, /STAGE_ARCHIVE_COLLECTION/);
  assert.match(server, /STUDENT_MODULE_ARCHIVES_COLLECTION/);
  assert.match(client, /Archiver le cursus en deux étapes/);
  assert.match(client, /Stages et entreprises/);
  assert.match(client, /Modules élèves/);
  assert.match(client, /data-workflow-disabled="true"/);
  assert.match(client, /effectif Google Sheets complet/);
});

test("l’archive modules contient tout l’effectif même sans progression", () => {
  const csv = [
    'ID Unique,Nom de l’élève',
    '100,Élève avec module',
    '200,Élève sans module'
  ].join("\n");
  const effectif = cursusManagement.__test.normalizeEffectifStudents(
    cursusManagement.__test.parseCsv(csv)
  );
  const archived = cursusManagement.__test.buildCompleteModuleArchiveRows(effectif, [{
    id: "cursus_test__100",
    idUnique: "100",
    normalizedIdUnique: "100",
    studentName: "Ancien nom",
    checks: { module1: true },
    dates: { module1: "2026-09-01" }
  }]);

  assert.equal(archived.length, 2);
  assert.equal(archived[0].studentName, "Élève avec module");
  assert.equal(archived[0].checks.module1, true);
  assert.equal(archived[1].studentName, "Élève sans module");
  assert.deepEqual(Object.values(archived[1].checks), [false, false, false, false, false, false]);
});

test("les deux liens d’effectif sont indépendants et gardent le réglage historique en repli", async () => {
  const server = await read("lib/server/cursus-management.js");
  const modules = await read("assets/js/prof-modules-eleves-safe.js");
  const secureSheet = await read("api/secure-sheet.js");
  const exactSync = await read("assets/js/prof-modules-sheets-sync-exact.js");
  const stageApp = await read("stages/assets/js/stage-app.js");
  const rules = await read("firestore.rules");

  assert.match(server, /MODULE_EFFECTIF_DOCUMENT = "moduleEffectif"/);
  assert.match(server, /STAGE_EFFECTIF_DOCUMENT = "effectif"/);
  assert.match(server, /target === "modules"/);
  assert.match(server, /target === "stages"/);
  assert.match(modules, /source:\s*"module-effectif"/);
  assert.doesNotMatch(modules, /loadEffectifSettings/);
  assert.match(secureSheet, /getFirestoreDocument\(\["stageSettings", "moduleEffectif"\], idToken\)/);
  assert.match(secureSheet, /return resolveEffectifSheet\(idToken, clientFallback\)/);
  assert.match(exactSync, /MODULE_EFFECTIF_SETTINGS_DOC_ID/);
  assert.doesNotMatch(stageApp, /id="changeEffectifBtn"/);
  assert.match(rules, /docId in \["effectif", "moduleEffectif"\]/);
});

test("les entreprises voient leurs stagiaires archivés mais tous les examens et l’effectif", async () => {
  const endpoint = await read("api/access/stage-data.js");
  const stageApp = await read("stages/assets/js/stage-app.js");

  assert.match(endpoint, /function sanitizeCompanyArchive\(archive, companyId\)/);
  assert.match(endpoint, /String\(row\?\.companyId \|\| ""\) === companyId/);
  assert.doesNotMatch(endpoint, /studentIds\.has\(normalizeIdUnique/);
  assert.match(endpoint, /examParticipants\) \? archive\.examParticipants : \[\]\)\s*\.map/);
  assert.match(endpoint, /if \(kind === "archives"\)/);
  assert.match(stageApp, /fetchCompanyRows\("archives"\)/);
  assert.doesNotMatch(stageApp, /if \(IS_COMPANY_ACCESS && panel === "archives"\) return/);
  assert.doesNotMatch(stageApp, /const archivesButton = IS_COMPANY_ACCESS \? ""/);
  assert.doesNotMatch(stageApp, /\$\{currentArchive \? "disabled" : ""\}/);
  assert.doesNotMatch(stageApp, /if \(currentArchive\) \{\s*currentRightPanel = "examens"/);
});

test("l’ancien archivage du suivi de stage n’est plus exposé", async () => {
  const html = await read("stages/index.html");
  const rules = await read("firestore.rules");

  assert.doesNotMatch(html, /resetWeekBtn/);
  assert.doesNotMatch(html, /student-module-archives\.js/);
  assert.doesNotMatch(html, /admin-effectif-settings\.js/);
  assert.match(rules, /match \/stageArchives\/\{docId\}[\s\S]*allow create: if isAdmin\(\)/);
});
