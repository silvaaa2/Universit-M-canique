import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiUrl = new URL("../api/discord-patch-note.js", import.meta.url);
const uiUrl = new URL("../assets/js/prof-admin-patch-notes.js", import.meta.url);

test("les patch notes sont publiés par le bot dans le salon configuré", async () => {
  const [api, ui] = await Promise.all([
    readFile(apiUrl, "utf8"),
    readFile(uiUrl, "utf8")
  ]);

  assert.match(api, /DEFAULT_PATCH_CHANNEL_ID = "1531769824085151764"/);
  assert.match(api, /process\.env\.DISCORD_BOT_TOKEN/);
  assert.match(api, /process\.env\.DISCORD_PATCH_CHANNEL_ID \|\| DEFAULT_PATCH_CHANNEL_ID/);
  assert.match(api, /\/channels\/\$\{channelId\}\/messages/);
  assert.match(api, /Authorization: `Bot \$\{botToken\}`/);
  assert.doesNotMatch(api, /DISCORD_PATCH_WEBHOOK/);
  assert.match(api, /allowed_mentions: \{ parse: \[\] \}/);
  assert.match(ui, /Publier avec le bot/);
  assert.match(ui, />Patch notes</);
  assert.match(ui, /Patch notes Discord/);
  assert.match(ui, /window\.confirm\(`/);
  assert.match(ui, /patchNoteCharacterCount/);
});
