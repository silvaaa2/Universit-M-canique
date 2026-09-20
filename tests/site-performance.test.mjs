import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("les boucles permanentes inutiles sont retirées des pages professeur", async () => {
  const [modules, examSettings, mobile] = await Promise.all([
    read("assets/js/prof-modules-eleves.js"),
    read("assets/js/prof-admin-exam-settings.js"),
    read("assets/js/prof-mobile-app.js")
  ]);

  assert.doesNotMatch(modules, /setInterval\(keepModulesDashboardVisible, 250\)/);
  assert.doesNotMatch(examSettings, /setInterval\(refreshAdminAccess, 1200\)/);
  assert.match(mobile, /if \(!mobileViewport\.matches\) return/);
  assert.match(mobile, /observer\.disconnect\(\)/);
});

test("les modules privilégient une lecture Firestore compatible et évitent les rendus identiques", async () => {
  const [modules, alerts] = await Promise.all([
    read("assets/js/prof-modules-eleves-safe.js"),
    read("assets/js/prof-modules-alerts.js")
  ]);

  assert.match(modules, /getDocs\(collection\(db, STUDENT_MODULES_COLLECTION\)\)/);
  assert.doesNotMatch(modules, /where\(documentId\(\), ">=", cursusPrefix\)/);
  assert.match(alerts, /where\(documentId\(\), ">=", cursusPrefix\)/);
  assert.match(alerts, /where\(documentId\(\), "<", `\$\{cursusPrefix\}\\uf8ff`\)/);

  assert.match(modules, /getModulesStateSignature\(\)/);
  assert.match(modules, /if \(!silent \|\| nextSignature !== lastRenderedSignature\)/);
});

test("la page Modules restaure l'ordre de chargement stable de ses fonctions", async () => {
  const [entry, loader, page, navigation] = await Promise.all([
    read("assets/js/prof-modules-eleves.js"),
    read("assets/js/prof-modules-eleves-safe.js"),
    read("pages/prof-modules-eleves.html"),
    read("assets/js/navigation.js")
  ]);

  assert.match(loader, /window\.profModulesCriticalReady = true/);
  assert.match(loader, /new CustomEvent\("profModulesReady"/);
  assert.match(entry, /prof-modules-eleves-safe\.js\?v=1023/);
  assert.match(entry, /prof-modules-alerts\.js\?v=1015/);
  assert.doesNotMatch(entry, /scheduleModulesExtras/);
  assert.match(page, /prof-modules-sheets-sync\.js\?v=1008/);
  assert.match(page, /prof-modules-archives\.js\?v=1004/);
  assert.match(page, /prof-modules-clipboard\.js\?v=9/);
  assert.match(page, /prof-notifications-v2\.js\?v=8/);
  assert.match(page, /prof-presence\.js\?v=6/);
  assert.doesNotMatch(navigation, /import\("\.\/prof-modules-(?:archives|alerts)\.js/);
});

test("le garde Modules ne peut plus cacher son propre message", async () => {
  const [entry, loader] = await Promise.all([
    read("assets/js/prof-modules-eleves.js"),
    read("assets/js/prof-modules-eleves-safe.js")
  ]);
  const guard = loader.slice(
    loader.indexOf("function showGuardMessage"),
    loader.indexOf("async function getUserAccess")
  );

  assert.match(loader, /const modulesMainContent = document\.querySelector\("\.modules-v2-content"\)/);
  assert.match(guard, /protectedContent\.hidden = false/);
  assert.match(guard, /modulesMainContent\.hidden = true/);
  assert.doesNotMatch(guard, /protectedContent\.hidden = true/);
  assert.match(entry, /protectedContent\.hidden = false/);
  assert.doesNotMatch(entry, /!protectedContent \|\| protectedContent\.hidden/);
});

test("les onglets masqués suspendent les rafraîchissements lourds", async () => {
  const [liveRefresh, notifications, presence] = await Promise.all([
    read("assets/js/prof-live-refresh.js"),
    read("assets/js/prof-notifications-v2.js"),
    read("assets/js/prof-presence.js")
  ]);

  assert.match(liveRefresh, /document\.visibilityState !== "visible"[\s\S]*?clearTimeout\(refreshTimer\)/);
  assert.match(notifications, /Date\.now\(\) - lastCheckAt < INTERVAL_MS/);
  assert.match(presence, /const HIDDEN_HEARTBEAT_MS = 60_000/);
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
  const stageImportIndex = source.indexOf('import "./stage-app.js?v=9086"');
  const getAppIndex = source.indexOf("const app = getApp()");

  assert.ok(stageImportIndex >= 0);
  assert.ok(getAppIndex > stageImportIndex);
});
