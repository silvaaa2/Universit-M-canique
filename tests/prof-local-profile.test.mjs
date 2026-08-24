import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authScriptUrl = new URL("../assets/js/prof-auth-v2.js", import.meta.url);
const customsScriptUrl = new URL("../assets/js/prof-customs-eleves-page.js", import.meta.url);
const mobileScriptUrl = new URL("../assets/js/prof-mobile-app.js", import.meta.url);

test("le nom affiché est conservé localement et utilisé par l'accueil", async () => {
  const script = await readFile(authScriptUrl, "utf8");

  assert.match(script, /localStorage\.setItem\(PROFILE_STORAGE_KEY, JSON\.stringify\(safeProfile\)\)/);
  assert.match(script, /getDisplayProfile\(user, currentAccess\)\.displayName/);
  assert.match(script, /new CustomEvent\("profProfileChanged"/);
});

test("le nom local reste prioritaire dans les customs et le menu mobile", async () => {
  const [customsScript, mobileScript] = await Promise.all([
    readFile(customsScriptUrl, "utf8"),
    readFile(mobileScriptUrl, "utf8")
  ]);

  assert.match(customsScript, /getLocalDisplayName\(\) \|\| getProfDisplayName\(user\)/);
  assert.match(mobileScript, /window\.addEventListener\("profProfileChanged", syncMobileUser\)/);
  assert.match(mobileScript, /function openMenu\(\) \{[\s\S]*?syncMobileUser\(\)/);
});
