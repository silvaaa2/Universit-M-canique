import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("le triangle averto est intégré au nouveau contrôleur Modules", () => {
  const modules = read("assets/js/prof-modules-eleves-v4.js");
  const endpoint = read("api/secure-sheet.js");
  const navigation = read("assets/js/navigation.js");
  const page = read("pages/prof-modules-eleves.html");

  assert.match(modules, /target\?\.closest\("button\[data-warning-toggle\]"\)/);
  assert.match(modules, /openWarning\(warning\.dataset\.studentId/);
  assert.match(modules, /action: "warning"/);
  assert.match(endpoint, /payload\.action === "warning"/);
  assert.match(endpoint, /warningComment: cleanModuleText\(payload\.warningComment, 1000\)/);
  assert.doesNotMatch(modules, /prof-modules-alerts\.js/);
  assert.doesNotMatch(navigation, /import\("\.\/prof-modules-alerts\.js/);
  assert.match(page, /navigation\.js\?v=1012/);
  assert.match(page, /prof-modules-eleves-v4\.js\?v=1/);
});
