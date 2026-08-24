import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("../pages/espace-prof.html", import.meta.url);
const scriptUrl = new URL("../assets/js/prof-auth-v2.js", import.meta.url);

test("l'écran de préparation souhaite la bienvenue au professeur", async () => {
  const [html, script] = await Promise.all([
    readFile(htmlUrl, "utf8"),
    readFile(scriptUrl, "utf8")
  ]);

  assert.match(html, /id="loginTransitionTitle">Bienvenue</);
  assert.match(html, /id="loginTransitionStatus">Chargement de vos statistiques/);
  assert.match(script, /`Bienvenue, \$\{displayName\}`/);
});

test("le tableau reste masqué jusqu'à la fin du chargement statistique après connexion", async () => {
  const script = await readFile(scriptUrl, "utf8");
  const start = script.indexOf("async function prepareAndShowDashboard");
  const end = script.indexOf("function showDashboardInstant", start);
  const preparation = script.slice(start, end);
  const instantStart = end;
  const instantEnd = script.indexOf("function showDashboardWithTransition", instantStart);
  const instantDisplay = script.slice(instantStart, instantEnd);

  assert.ok(start >= 0 && end > start, "Le flux de préparation doit exister.");
  assert.ok(
    preparation.indexOf("await loadDashboardStats()")
      < preparation.indexOf('profDashboard?.removeAttribute("hidden")'),
    "Les statistiques doivent finir de charger avant l'affichage du tableau."
  );
  assert.ok(instantEnd > instantStart, "L'affichage direct du tableau doit exister.");
  assert.doesNotMatch(instantDisplay, /prepareAndShowDashboard/);
  assert.match(instantDisplay, /loadDashboardStats\(\)/);
  assert.match(script, /showDashboardInstant\(\)/);
  assert.match(script, /await showDashboardWithTransition\(user\)/);
});
