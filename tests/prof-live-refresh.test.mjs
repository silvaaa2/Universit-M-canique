import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

const professorPages = [
  "pages/espace-prof.html",
  "pages/prof-rp-7x92q.html",
  "pages/prof-exam-4x91q.html",
  "pages/prof-modules-eleves.html",
  "pages/prof-customs-eleves.html"
];

test("l'espace professeur actualise ses données toutes les dix secondes", async () => {
  const source = await read("assets/js/prof-live-refresh.js");

  assert.match(source, /const REFRESH_INTERVAL_MS = 10_000/);
  assert.match(source, /setInterval\(\(\) => dispatchRefresh\("interval"\), REFRESH_INTERVAL_MS\)/);
  assert.match(source, /new CustomEvent\("prof:live-refresh"/);
  assert.match(source, /document\.visibilityState !== "visible"/);
  assert.match(source, /\[data-answer-card\]\.is-open/);
  assert.match(source, /input, textarea, select/);
  assert.doesNotMatch(source, /window\.location\.reload/);
});

test("la date et l'heure restent visibles et actualisées sur chaque page professeur", async () => {
  const source = await read("assets/js/prof-live-refresh.js");
  assert.match(source, /hour: "2-digit"/);
  assert.match(source, /minute: "2-digit"/);
  assert.match(source, /updateClock\(new Date\(now\)\)/);

  for (const page of professorPages) {
    const html = await read(page);
    assert.match(html, /data-prof-live-clock/);
    assert.match(html, /prof-live-refresh\.js\?v=1/);
  }
});

test("chaque écran recharge silencieusement sa propre source sans interrompre une correction", async () => {
  const [dashboard, modules, customs, customAnswers, exams] = await Promise.all([
    read("assets/js/prof-auth-v2.js"),
    read("assets/js/prof-modules-eleves-safe.js"),
    read("assets/js/prof-customs-eleves-page.js"),
    read("assets/js/rp-loader-9kq4z.js"),
    read("assets/js/exam-loader-x8p2.js")
  ]);

  assert.match(dashboard, /addEventListener\("prof:live-refresh"[\s\S]*?loadDashboardStats\(\)/);
  assert.match(modules, /loadAndRenderModules\(\{ silent: true \}\)/);
  assert.match(customs, /refreshCustomAccess\(\{ silent: true \}\)/);
  assert.match(customAnswers, /loadSheet\(sheet, \{ force: true, silent: true \}\)/);
  assert.match(exams, /loadSheet\(sheet, \{ force: true, silent: true \}\)/);
  assert.match(customAnswers, /if \(force\) cache\.delete\(sheet\.id\)/);
  assert.match(exams, /if \(force\) cache\.delete\(sheet\.id\)/);
});
