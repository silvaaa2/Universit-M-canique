import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("APEX Command conserve les statistiques réelles et les accès professeur", async () => {
  const [html, script, styles] = await Promise.all([
    read("../pages/espace-prof.html"),
    read("../assets/js/prof-auth-v2.js"),
    read("../assets/css/prof-dashboard-apex.css")
  ]);

  assert.match(html, /class="v2-home apex-dashboard"/);
  assert.match(html, /id="v2ApexHealthRing"/);
  assert.match(html, /id="v2ApexHistoryChart"/);
  assert.match(html, /Effectif par cursus/);
  assert.match(html, /id="v2ApexSyncChip" hidden/);
  assert.match(html, /class="apex-kicker">Université Mécanique<\/p>/);
  assert.doesNotMatch(html, /Promotion actuelle|Ouvrir les priorités|Voir tous les élèves/);
  assert.doesNotMatch(html, /Corrections prioritaires/);
  assert.match(html, /id="v2StatExamSent"/);
  assert.match(html, /id="v2StatModuleActive"/);
  assert.match(html, /id="v2StatCustomsOpen"/);
  assert.match(html, /prof-rp-7x92q\.html/);
  assert.match(html, /prof-exam-4x91q\.html/);
  assert.match(html, /prof-modules-eleves\.html/);
  assert.doesNotMatch(html, /Accès direct|Actions rapides|apexSettingsShortcut/);
  assert.match(script, /function renderApexDashboard/);
  assert.match(script, /function ensureCurrentCursusSnapshot/);
  assert.match(script, /function loadAndRenderCursusHistory/);
  assert.match(script, /function renderCursusHistory/);
  assert.match(styles, /grid-template-rows:\s*310px 142px minmax\(430px, auto\)/);
  assert.match(styles, /\.apex-history-chart\s*\{[^}]*min-height:\s*334px/s);
  assert.match(styles, /\.apex-history-viewport\s*\{[^}]*min-height:\s*334px/s);
  assert.match(styles, /\.apex-history-line\s*\{[^}]*stroke-width:\s*4\.5/s);
  assert.match(script, /function buildSmoothHistoryPath/);
  assert.match(script, /class="apex-history-line"/);
  assert.match(script, /v2ApexSyncChip\.hidden = access\.admin !== true/);
  assert.doesNotMatch(script, /setText\("v2ApexQueueAction"/);
  assert.match(script, /viewport\.scrollLeft = viewport\.scrollWidth/);
  assert.match(script, /getCollectionSnapshot\("studentModuleArchives"\)/);
  assert.match(script, /void loadAndRenderCursusHistory\(cursus, allModuleRows\)/);
  assert.match(script, /modules\.moduleCounts/);
  assert.match(script, /renderApexDashboard\(\{ cursus, modules, exams, customAnswers, customAccess \}\)/);
  assert.match(styles, /\.apex-command-grid/);
  assert.match(styles, /\.apex-history-chart/);
  assert.match(styles, /\.apex-history-line/);
  assert.match(styles, /\.apex-history-point-dot/);
  assert.match(styles, /stroke-dashoffset: 0 !important/);
  assert.match(styles, /opacity: 1 !important/);
  assert.match(styles, /@media \(max-width: 900px\)/);

  const dashboardLoader = script.slice(
    script.indexOf("async function loadDashboardStats"),
    script.indexOf("function showLogin")
  );
  assert.doesNotMatch(dashboardLoader, /await ensureCurrentCursusSnapshot/);
  assert.doesNotMatch(dashboardLoader, /await getCollectionSnapshot\("studentModuleArchives"\)/);
});

test("le tableau APEX ne contient aucun identifiant HTML en double", async () => {
  const html = await read("../pages/espace-prof.html");
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

  assert.deepEqual([...new Set(duplicates)], []);
});

test("la navigation professeur remplace les initiales par de vraies icônes SVG", async () => {
  const mobileNavigation = await read("../assets/js/prof-mobile-app.js");

  assert.match(mobileNavigation, /function profNavIcon\(name\)/);
  assert.match(mobileNavigation, /"CO": "corrections"/);
  assert.match(mobileNavigation, /"RE": "responses"/);
  assert.match(mobileNavigation, /"EX": "exams"/);
  assert.match(mobileNavigation, /"ME": "modules"/);
  assert.match(mobileNavigation, /"CE": "customs"/);
  assert.match(mobileNavigation, /"PA": "settings"/);
  assert.match(mobileNavigation, /"AD": "admin"/);
  assert.match(mobileNavigation, /class="prof-nav-svg"/);
});
