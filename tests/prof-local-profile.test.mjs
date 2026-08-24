import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const authScriptUrl = new URL("../assets/js/prof-auth-v2.js", import.meta.url);
const customsScriptUrl = new URL("../assets/js/prof-customs-eleves-page.js", import.meta.url);
const mobileScriptUrl = new URL("../assets/js/prof-mobile-app.js", import.meta.url);
const localProfileScriptUrl = new URL("../assets/js/prof-local-profile.js", import.meta.url);

test("le bouton du profil utilise un contrôleur local indépendant", async () => {
  const [authScript, localProfileScript] = await Promise.all([
    readFile(authScriptUrl, "utf8"),
    readFile(localProfileScriptUrl, "utf8")
  ]);

  assert.match(localProfileScript, /getElementById\("saveProfileBtn"\)/);
  assert.match(localProfileScript, /saveButton\?\.addEventListener\("click", applyFromField\)/);
  assert.match(localProfileScript, /window\.localStorage\.setItem\(STORAGE_KEY/);
  assert.match(authScript, /window\.profLocalProfile\?\.read\?\.\(\)/);
  assert.match(authScript, /getDisplayProfile\(user, currentAccess\)\.displayName/);
});

test("le contrôleur enregistre réellement le nom dans le stockage du navigateur", async () => {
  const script = await readFile(localProfileScriptUrl, "utf8");
  const storage = new Map();
  const context = {
    console,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    document: {
      getElementById: () => null
    },
    window: {
      currentProfUser: { profDisplayName: "Nom Discord" },
      dispatchEvent: () => {},
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key)
      }
    }
  };

  vm.runInNewContext(script, context);
  const result = context.window.profLocalProfile.save("  Marc   Test  ");

  assert.equal(result.ok, true);
  assert.equal(result.displayName, "Marc Test");
  assert.deepEqual(JSON.parse(storage.get("profV2Profile")), { displayName: "Marc Test" });
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
