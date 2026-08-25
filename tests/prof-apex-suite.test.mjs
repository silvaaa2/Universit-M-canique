import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const pages = [
  "pages/espace-prof.html",
  "pages/prof-rp-7x92q.html",
  "pages/prof-exam-4x91q.html",
  "pages/prof-modules-eleves.html",
  "pages/prof-customs-eleves.html"
];

test("la V3 APEX est partagée par tout l'espace professeur", async () => {
  for (const path of pages) {
    const html = await readFile(new URL(path, root), "utf8");
    assert.match(html, /prof-dashboard-apex\.css\?v=(?:3|4|6|7|8|9|10)/);
    assert.match(html, /prof-apex-suite\.css\?v=1/);
  }
});

test("les pages métiers affichent la version V3 et gardent leurs zones fonctionnelles", async () => {
  const expectedZones = new Map([
    ["pages/prof-rp-7x92q.html", /id="sheetContent"/],
    ["pages/prof-exam-4x91q.html", /id="sheetContent"/],
    ["pages/prof-modules-eleves.html", /id="modulesTable"/],
    ["pages/prof-customs-eleves.html", /id="customsAccessContent"/]
  ]);

  for (const [path, zone] of expectedZones) {
    const html = await readFile(new URL(path, root), "utf8");
    assert.match(html, /class="apex-version-badge"/);
    assert.match(html, zone);
  }
});

test("la couche APEX couvre les corrections, examens, modules, customs et le mobile", async () => {
  const css = await readFile(new URL("assets/css/prof-apex-suite.css", root), "utf8");

  assert.match(css, /\.rp-v2-page/);
  assert.match(css, /\.exam-v2-page/);
  assert.match(css, /\.modules-page/);
  assert.match(css, /\.customs-v2-page/);
  assert.match(css, /\.v2-settings-card/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /prefers-reduced-motion/);
});
