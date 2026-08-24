import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getPrerequisiteKeys,
  getProgressionBlockReason
} from "../assets/js/module-progression-rules.js";

const root = new URL("../", import.meta.url);

test("les modules et l'examen se débloquent uniquement dans l'ordre", () => {
  const checks = {};

  assert.match(getProgressionBlockReason(checks, "module2", true), /Module 1/);
  checks.module1 = true;
  assert.equal(getProgressionBlockReason(checks, "module2", true), "");

  checks.module2 = true;
  checks.module3 = true;
  assert.equal(getProgressionBlockReason(checks, "module4", true), "");
  assert.match(getProgressionBlockReason(checks, "exam", true), /Module 4/);

  checks.module4 = true;
  assert.equal(getProgressionBlockReason(checks, "exam", true), "");
  assert.deepEqual(getPrerequisiteKeys("retakeExam"), ["module1", "module2", "module3", "module4"]);
});

test("une étape nécessaire ne peut pas être retirée avant ses dépendances", () => {
  const checks = { module1: true, module2: true, module3: false };

  assert.match(getProgressionBlockReason(checks, "module1", false), /Décoche d’abord Module 2/);
  checks.module2 = false;
  assert.equal(getProgressionBlockReason(checks, "module1", false), "");
});

test("Vérif 3 et Vérif 4 dépendent de leur module et restent hors Google Sheets", async () => {
  assert.match(getProgressionBlockReason({}, "verif3", true), /Module 1/);
  assert.equal(getProgressionBlockReason({ module1: true, module2: true, module3: true }, "verif3", true), "");
  assert.match(getProgressionBlockReason({ module1: true, module2: true, module3: true }, "verif4", true), /Module 4/);

  const page = await readFile(new URL("assets/js/prof-modules-eleves-safe.js", root), "utf8");
  const exactSync = await readFile(new URL("assets/js/prof-modules-sheets-sync-exact.js", root), "utf8");
  const legacySync = await readFile(new URL("assets/js/prof-modules-sheets-sync.js", root), "utf8");

  assert.match(page, /verificationKey: "verif3"/);
  assert.match(page, /verificationKey: "verif4"/);
  assert.match(page, /checks: latestProgress\.checks/);
  assert.doesNotMatch(exactSync, /verif3|verif4/);
  assert.doesNotMatch(legacySync, /verif3|verif4/);
});
