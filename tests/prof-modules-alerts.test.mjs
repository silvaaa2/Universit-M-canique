import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("le triangle averto intercepte le clic avant les contrôles de la table", () => {
  const alerts = read("assets/js/prof-modules-alerts.js");
  const modules = read("assets/js/prof-modules-eleves.js");
  const navigation = read("assets/js/navigation.js");
  const page = read("pages/prof-modules-eleves.html");

  assert.match(alerts, /event\.target instanceof Element/);
  assert.match(alerts, /target\.closest\("\[data-warning-toggle\]"\)/);
  assert.match(alerts, /openWarningModal\(warningButton\)/);
  assert.match(alerts, /\}, true\);/);
  assert.match(modules, /prof-modules-alerts\.js\?v=1012/);
  assert.match(navigation, /prof-modules-alerts\.js\?v=1012/);
  assert.match(page, /navigation\.js\?v=1010/);
  assert.match(page, /prof-modules-eleves\.js\?v=1017/);
});
