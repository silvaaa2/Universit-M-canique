import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const apiUrl = new URL("../api/discord-exam-results.js", import.meta.url);
const loaderUrl = new URL("../assets/js/exam-loader-x8p2.js", import.meta.url);

test("les listes d'examens sont publiées par le bot dans le salon configuré", async () => {
  const [api, loader] = await Promise.all([
    readFile(apiUrl, "utf8"),
    readFile(loaderUrl, "utf8")
  ]);

  assert.match(api, /verifyFirebaseProfAccess/);
  assert.match(api, /process\.env\.DISCORD_BOT_TOKEN/);
  assert.match(api, /process\.env\.DISCORD_EXAM_RESULTS_CHANNEL_ID/);
  assert.match(api, /Authorization: `Bot \$\{botToken\}`/);
  assert.match(api, /channels\/\$\{channelId\}\/messages/);
  assert.match(api, /ALLOWED_ROLE_IDS/);
  assert.match(api, /fetch\(legacyWebhookUrl, \{ method: "GET" \}\)/);
  assert.doesNotMatch(api, /fetch\(legacyWebhookUrl, \{\s*method: "POST"/);
  assert.match(loader, /Envoyer avec le bot/);
  assert.match(loader, /Messages envoyés par le bot\./);
});
