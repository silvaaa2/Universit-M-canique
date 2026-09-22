import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("les boucles permanentes inutiles sont retirées des pages professeur", async () => {
  const [modules, examSettings, mobile] = await Promise.all([
    read("assets/js/prof-modules-eleves-v4.js"),
    read("assets/js/prof-admin-exam-settings.js"),
    read("assets/js/prof-mobile-app.js")
  ]);

  assert.doesNotMatch(modules, /setInterval\(keepModulesDashboardVisible, 250\)/);
  assert.doesNotMatch(examSettings, /setInterval\(refreshAdminAccess, 1200\)/);
  assert.match(mobile, /if \(!mobileViewport\.matches\) return/);
  assert.match(mobile, /observer\.disconnect\(\)/);
});

test("les modules regroupent les lectures critiques et évitent les rendus identiques", async () => {
  const modules = await read("assets/js/prof-modules-eleves-v4.js");

  assert.match(modules, /source=module-workspace&sheet=current/);
  assert.doesNotMatch(modules, /getDocs\(collection\(db, STUDENT_MODULES_COLLECTION\)\)/);
  assert.match(modules, /function signature\(\)/);
  assert.match(modules, /if \(!silent \|\| nextSignature !== state\.lastSignature\) renderTable\(\)/);
});

test("la page Modules restaure l'ordre de chargement stable de ses fonctions", async () => {
  const [loader, page, navigation] = await Promise.all([
    read("assets/js/prof-modules-eleves-v4.js"),
    read("pages/prof-modules-eleves.html"),
    read("assets/js/navigation.js")
  ]);

  assert.match(loader, /window\.profModulesCriticalReady = true/);
  assert.match(loader, /new CustomEvent\("profModulesReady"/);
  assert.match(loader, /function loadExtras\(\)/);
  assert.match(loader, /prof-modules-sheets-sync\.js\?v=1011/);
  assert.match(loader, /prof-modules-sheets-sync-exact\.js\?v=1012/);
  assert.match(loader, /prof-modules-archives\.js\?v=1006/);
  assert.match(loader, /prof-modules-clipboard\.js\?v=11/);
  assert.match(loader, /prof-notifications-v2\.js\?v=10/);
  assert.match(loader, /prof-presence\.js\?v=9/);
  assert.match(page, /prof-modules-eleves-v4\.js\?v=1/);
  assert.doesNotMatch(page, /prof-modules-sheets-sync\.js/);
  assert.doesNotMatch(navigation, /import\("\.\/prof-modules-(?:archives|alerts)\.js/);
});

test("le garde Modules ne peut plus cacher son propre message", async () => {
  const [loader, styles] = await Promise.all([
    read("assets/js/prof-modules-eleves-v4.js"),
    read("assets/css/prof-modules-eleves-v4.css")
  ]);
  const guard = loader.slice(
    loader.indexOf("function showGuard"),
    loader.indexOf("function showWorkspace")
  );

  assert.match(loader, /content: document\.querySelector\("\.modules-v2-content"\)/);
  assert.match(guard, /dom\.content\.hidden = true/);
  assert.match(guard, /dom\.guard\.hidden = false/);
  assert.match(loader, /dashboard\?\.classList\.add\("dashboard-visible"\)/);
  assert.match(styles, /modules-v2-dashboard[\s\S]*?opacity: 1 !important/);
  assert.doesNotMatch(loader, /MutationObserver\(keepModulesDashboardVisible\)/);
});

test("les onglets masqués suspendent les rafraîchissements lourds", async () => {
  const [liveRefresh, notifications, presence] = await Promise.all([
    read("assets/js/prof-live-refresh.js"),
    read("assets/js/prof-notifications-v2.js"),
    read("assets/js/prof-presence.js")
  ]);

  assert.match(liveRefresh, /document\.visibilityState !== "visible"[\s\S]*?clearTimeout\(refreshTimer\)/);
  assert.match(notifications, /Date\.now\(\) - lastCheckAt < INTERVAL_MS/);
  assert.match(presence, /const HIDDEN_HEARTBEAT_MS = 300_000/);
  assert.match(presence, /orderBy\(documentId\(\)\)/);
});

test("le rendu adapte les effets coûteux aux navigateurs et appareils modestes", async () => {
  const [motion, styles] = await Promise.all([
    read("assets/js/unified-motion.js"),
    read("assets/css/unified-motion.css")
  ]);

  assert.match(motion, /navigator\.hardwareConcurrency/);
  assert.match(motion, /navigator\.deviceMemory/);
  assert.match(motion, /firefox/i);
  assert.match(motion, /const reduceMotion = false/);
  assert.match(motion, /classList\.remove\("university-motion-reduced"\)/);
  assert.doesNotMatch(styles, /university-performance-lite \.university-motion-item/);
  assert.match(styles, /html\.university-performance-lite \*/);
  assert.match(styles, /content-visibility: auto/);
  assert.doesNotMatch(styles, /\.modules-row:not\(\.head\)/);
  assert.doesNotMatch(styles, /\[data-student-row\]/);
});

test("les feuilles et ressources statiques utilisent des caches courts et sûrs", async () => {
  const [secureSheet, vercel] = await Promise.all([
    read("api/secure-sheet.js"),
    read("vercel.json")
  ]);
  const config = JSON.parse(vercel);

  assert.match(secureSheet, /const SHEET_CSV_CACHE_TTL_MS = 8_000/);
  assert.match(secureSheet, /const googleSheetTitleCache = new Map\(\)/);
  assert.match(secureSheet, /const sheetCsvRequests = new Map\(\)/);
  const assetsRule = config.headers.find(rule => rule.source === "/assets/(.*)");
  assert.ok(assetsRule);
  assert.ok(assetsRule.headers.some(header => (
    header.key === "Cache-Control" && header.value === "public, max-age=0, must-revalidate"
  )));
  assert.ok(config.headers.some(rule => rule.source === "/Images/(.*)"));
});

test("les modules Stage autonomes initialisent Firebase avant getApp", async () => {
  const source = await read("stages/assets/js/stage-effectif-membership.js");
  const stageImportIndex = source.search(/import "\.\/stage-app\.js\?v=\d+"/);
  const getAppIndex = source.indexOf("const app = getApp()");

  assert.ok(stageImportIndex >= 0);
  assert.ok(getAppIndex > stageImportIndex);
});
