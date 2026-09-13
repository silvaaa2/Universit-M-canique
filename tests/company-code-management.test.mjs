import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiUrl = new URL("../api/access/session.js", import.meta.url);
const serverUrl = new URL("../lib/server/unified-access.js", import.meta.url);
const uiUrl = new URL("../assets/js/prof-admin-company-codes.js", import.meta.url);
const bundleUrl = new URL("../assets/js/prof-admin-v2.js", import.meta.url);

test("la modification des codes entreprise reste réservée à l'admin", async () => {
  const api = await readFile(apiUrl, "utf8");

  assert.match(api, /request\.method === "PATCH" && adminCompanyCodes/);
  assert.match(api, /verifyFirebaseProfAccess\(token\)/);
  assert.match(api, /if \(!access\.admin\)/);
  assert.match(api, /assertSameOrigin\(request\)/);
  assert.match(api, /body\.newCode[\s\S]*body\.confirmation/);
});

test("les nouveaux codes sont hachés avec le secret et invalident les anciennes sessions", async () => {
  const server = await readFile(serverUrl, "utf8");

  assert.match(server, /createHmac\("sha256", secret\)/);
  assert.match(server, /COMPANY_CODES_DOCUMENT = "companyAccessCodes"/);
  assert.match(server, /credentialVersion = crypto\.randomBytes/);
  assert.match(server, /session\.credentialVersion === expectedVersion/);
  assert.doesNotMatch(server, /newCode\s*:/);
});

test("Admin privé propose un formulaire par entreprise sans mémoriser les codes", async () => {
  const [ui, bundle] = await Promise.all([
    readFile(uiUrl, "utf8"),
    readFile(bundleUrl, "utf8")
  ]);

  assert.match(bundle, /prof-admin-company-codes\.js/);
  assert.match(ui, />Accès entreprises</);
  assert.match(ui, /autocomplete="new-password"/);
  assert.match(ui, /method: "PATCH"/);
  assert.match(ui, /L’ancien code et les sessions ouvertes seront désactivés/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage/);
});
