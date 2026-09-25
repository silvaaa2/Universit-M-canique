import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalizeChannels, normalizeSettings, validateBotRequest } = require("../lib/server/discord-bot-control.js");
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("le panneau BOT Discord est placé sous Accès & journaux et réservé aux admins", () => {
  const page = read("../pages/espace-prof.html");
  const access = page.indexOf('id="profAccessLogsBtn"');
  const bot = page.indexOf('id="profDiscordBotBtn"');
  assert.ok(access >= 0 && bot > access);
  assert.match(page.slice(bot - 80, bot + 100), /admin-only/);
  assert.match(read("../assets/js/prof-access-policy.js"), /#profDiscordBotBtn/);
  assert.match(read("../assets/js/prof-admin-v2.js"), /openProfDiscordBotPanel/);
});

test("le bot local conserve une connexion Gateway sans accès aux messages des membres", () => {
  const script = read("../scripts/discord-presence.mjs");
  assert.match(script, /intents:\s*1/);
  assert.match(script, /op:\s*3/);
  assert.match(script, /heartbeat\(\)/);
  assert.match(script, /bot=discord-bot/);
  assert.doesNotMatch(script, /MESSAGE_CONTENT|intents:\s*32768/);
});

test("les salons sont listés sans rendre les salons vocaux ou forums envoyables", () => {
  const channels = normalizeChannels([
    { id: "42", name: "Général", type: 4, position: 0 },
    { id: "43", name: "annonces", parent_id: "42", type: 5, position: 2 },
    { id: "44", name: "discussion", parent_id: "42", type: 0, position: 1 },
    { id: "45", name: "vocal", parent_id: "42", type: 2, position: 3 },
    { id: "46", name: "forum", parent_id: "42", type: 15, position: 4 }
  ]);
  assert.deepEqual(channels.map(item => [item.name, item.sendable]), [
    ["discussion", true], ["annonces", true], ["vocal", false], ["forum", false]
  ]);
  assert.ok(channels.every(item => item.category === "Général"));
});

test("le statut affiché exige un signal récent du programme PC", () => {
  assert.equal(normalizeSettings({ lastSeenAt: Date.now(), currentStatus: "idle" }).connected, true);
  assert.equal(normalizeSettings({ lastSeenAt: Date.now() - 600_000, currentStatus: "idle" }).connected, false);
  assert.equal(normalizeSettings({ desiredStatus: "incorrect" }).desiredStatus, "online");
});

test("le canal de contrôle du bot rejette une fausse authentification", () => {
  const previous = process.env.DISCORD_BOT_TOKEN;
  process.env.DISCORD_BOT_TOKEN = "unit-test-bot-token";
  try {
    assert.throws(() => validateBotRequest({ headers: { authorization: "Bot mauvais" } }), { status: 401 });
    assert.doesNotThrow(() => validateBotRequest({ headers: { authorization: "Bot unit-test-bot-token" } }));
  } finally {
    if (previous === undefined) delete process.env.DISCORD_BOT_TOKEN;
    else process.env.DISCORD_BOT_TOKEN = previous;
  }
});

test("les messages sont limités au serveur choisi et les mentions sont désactivées", () => {
  const server = read("../lib/server/discord-bot-control.js");
  assert.match(server, /SENDABLE_TYPES\.has\(item\.type\)/);
  assert.match(server, /discord\(`\/guilds\/\$\{guildId\}\/channels`\)/);
  assert.match(server, /allowed_mentions:\s*\{\s*parse:\s*\[\]\s*\}/);
  assert.match(server, /content\.length > 2000/);
  assert.match(read("../api/access/session.js"), /handleDiscordBotControl/);
});
