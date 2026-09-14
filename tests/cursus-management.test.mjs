import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
});

test("les deux liens d’effectif sont indépendants et gardent le réglage historique en repli", async () => {
  const server = await read("lib/server/cursus-management.js");
  const modules = await read("assets/js/prof-modules-eleves-safe.js");
  const exactSync = await read("assets/js/prof-modules-sheets-sync-exact.js");
  const stageApp = await read("stages/assets/js/stage-app.js");
  const rules = await read("firestore.rules");

  assert.match(server, /MODULE_EFFECTIF_DOCUMENT = "moduleEffectif"/);
  assert.match(server, /STAGE_EFFECTIF_DOCUMENT = "effectif"/);
  assert.match(server, /target === "modules"/);
  assert.match(server, /target === "stages"/);
  assert.match(modules, /MODULE_EFFECTIF_SETTINGS_DOC_ID/);
  assert.match(modules, /if \(!snap\.exists\(\)\)[\s\S]*EFFECTIF_SETTINGS_DOC_ID/);
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
