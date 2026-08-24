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
  assert.match(html, /id="v2WatchList"/);
  assert.match(html, /id="v2StatExamSent"/);
  assert.match(html, /id="v2StatModuleActive"/);
  assert.match(html, /id="v2StatCustomsOpen"/);
  assert.match(html, /prof-rp-7x92q\.html/);
  assert.match(html, /prof-exam-4x91q\.html/);
  assert.match(html, /prof-modules-eleves\.html/);
  assert.doesNotMatch(html, /Accès direct|Actions rapides|apexSettingsShortcut/);
  assert.match(script, /function renderApexDashboard/);
  assert.match(script, /modules\.moduleCounts/);
  assert.match(script, /renderApexDashboard\(\{ cursus, modules, exams, customAnswers, customAccess \}\)/);
  assert.match(styles, /\.apex-command-grid/);
  assert.match(styles, /@media \(max-width: 900px\)/);
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
