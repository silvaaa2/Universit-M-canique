import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rulesUrl = new URL("../firestore.rules", import.meta.url);

test("les règles Firestore reconnaissent les sessions Discord signées", async () => {
  const rules = await readFile(rulesUrl, "utf8");

  assert.match(rules, /tokenValue\("authProvider", ""\) == "discord"/);
  assert.match(rules, /tokenValue\("role", ""\) == "prof"/);
  assert.match(rules, /tokenValue\("admin", false\) == true/);
  assert.match(rules, /isDiscordProf\(\) \|\| \(hasEmailIdentity\(\) && userRole\(\) == "prof"\)/);
  assert.match(rules, /isDiscordAdmin\(\) \|\| \(hasEmailIdentity\(\) && userData\(\)\.admin == true\)/);
});

test("les collections professeur restent protégées", async () => {
  const rules = await readFile(rulesUrl, "utf8");

  for (const collection of [
    "studentAnswerStatuses",
    "studentModules",
    "examAnswerStatuses",
    "examCorrections",
    "profSettings"
  ]) {
    assert.match(rules, new RegExp(`match /${collection}/\\{docId\\}`));
  }

  assert.doesNotMatch(rules, /match \/\{document=\*\*\}[\s\S]*allow read, write: if true/);
});
