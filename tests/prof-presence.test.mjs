import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  PRESENCE_TTL_MS,
  buildPresence,
  listActivePresences,
  normalizeSection
} = require("../lib/server/prof-presence.js");

test("les rubriques de présence sont strictement limitées", () => {
  assert.equal(normalizeSection("exams"), "exams");
  assert.equal(normalizeSection("modules"), "modules");
  assert.equal(normalizeSection("admin"), "");
});

test("la présence utilise l'identité Discord vérifiée", () => {
  const presence = buildPresence({
    actorId: "discord:123",
    displayName: "Marc Carter",
    admin: true,
    claims: { discordAvatar: "https://cdn.discordapp.com/avatars/123/photo.webp" }
  }, "exams", 5000);

  assert.equal(presence.displayName, "Marc Carter");
  assert.equal(presence.section, "exams");
  assert.equal(presence.avatarUrl, "https://cdn.discordapp.com/avatars/123/photo.webp");
  assert.equal(presence.admin, true);
});

test("les présences anciennes et les avatars externes sont retirés", () => {
  const now = 100_000;
  const result = listActivePresences([
    { recordType: "profPresence", actorId: "a", displayName: "Actif", avatarUrl: "https://example.com/a.png", section: "modules", updatedAtMs: now - 5000 },
    { recordType: "profPresence", actorId: "b", displayName: "Ancien", section: "exams", updatedAtMs: now - PRESENCE_TTL_MS - 1 },
    { recordType: "configuration", displayName: "Réglage", section: "exams", updatedAtMs: now }
  ], now);

  assert.equal(result.length, 1);
  assert.equal(result[0].displayName, "Actif");
  assert.equal(result[0].avatarUrl, "");
});

test("les cinq pages prof chargent l'interface de présence", () => {
  const pages = [
    "espace-prof.html",
    "prof-rp-7x92q.html",
    "prof-exam-4x91q.html",
    "prof-modules-eleves.html",
    "prof-customs-eleves.html"
  ];

  pages.forEach(page => {
    const html = readFileSync(new URL(`../pages/${page}`, import.meta.url), "utf8");
    assert.match(html, /prof-presence\.css\?v=1/);
    assert.match(html, /prof-presence\.js\?v=1/);
  });
});

test("le client actualise la présence toutes les dix secondes", () => {
  const source = readFileSync(new URL("../assets/js/prof-presence.js", import.meta.url), "utf8");
  assert.match(source, /const HEARTBEAT_MS = 10_000/);
  assert.match(source, /cdn\.discordapp\.com/);
  assert.match(source, /prof-mobile-tabbar/);
});
