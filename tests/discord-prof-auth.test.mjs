import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

function loadAuthHelpers() {
  const modulePath = require.resolve("../lib/server/discord-prof-auth.js");
  delete require.cache[modulePath];
  return require(modulePath);
}

function decodeJwtPayload(token) {
  const value = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

test("la feuille Discord accepte les colonnes prévues et normalise les rôles", () => {
  const { parseAccessRows } = loadAuthHelpers();
  const rows = parseAccessRows([
    ["discord_id", "nom", "role_site", "actif"],
    ["123456789012345678", "Marc Carter", "ADMIN", "oui"],
    ["223456789012345678", "Prof Test", "professeur", "true"],
    ["323456789012345678", "Compte coupé", "prof", "non"]
  ]);

  assert.deepEqual(rows, [
    { discordId: "123456789012345678", name: "Marc Carter", role: "admin", active: true },
    { discordId: "223456789012345678", name: "Prof Test", role: "prof", active: true },
    { discordId: "323456789012345678", name: "Compte coupé", role: "prof", active: false }
  ]);
});

test("l'état OAuth est signé, limité dans le temps et lié au navigateur", () => {
  const previousSecret = process.env.DISCORD_SESSION_SECRET;
  process.env.DISCORD_SESSION_SECRET = "test-secret-discord-session-0123456789-abcdefghijklmnopqrstuvwxyz";

  try {
    const { createOAuthState, verifyOAuthState } = loadAuthHelpers();
    const issuedAt = Date.now();
    const state = createOAuthState("nonce-test", issuedAt);
    assert.equal(verifyOAuthState(state.value, "nonce-test", issuedAt + 1_000).nonce, "nonce-test");
    assert.throws(() => verifyOAuthState(state.value, "autre-nonce", issuedAt + 1_000), /Session OAuth différente/);
    assert.throws(() => verifyOAuthState(`${state.value}x`, "nonce-test", issuedAt + 1_000), /État OAuth invalide/);
  } finally {
    if (previousSecret === undefined) delete process.env.DISCORD_SESSION_SECRET;
    else process.env.DISCORD_SESSION_SECRET = previousSecret;
  }
});

test("le ticket de connexion chiffré est lisible une fois avant expiration", () => {
  const previousSecret = process.env.DISCORD_SESSION_SECRET;
  process.env.DISCORD_SESSION_SECRET = "test-secret-discord-session-0123456789-abcdefghijklmnopqrstuvwxyz";

  try {
    const { decryptLoginTicket, encryptLoginTicket } = loadAuthHelpers();
    const now = Date.now();
    const encrypted = encryptLoginTicket({ customToken: "firebase-token", expiresAt: now + 60_000 });
    assert.equal(decryptLoginTicket(encrypted, now).customToken, "firebase-token");
    assert.throws(() => decryptLoginTicket(encrypted, now + 61_000), /Ticket de connexion expiré/);
  } finally {
    if (previousSecret === undefined) delete process.env.DISCORD_SESSION_SECRET;
    else process.env.DISCORD_SESSION_SECRET = previousSecret;
  }
});

test("le jeton Firebase contient uniquement l'identité et les droits Discord attendus", () => {
  const previousEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const previousKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "discord-auth@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });

  try {
    const { createFirebaseCustomToken } = loadAuthHelpers();
    const token = createFirebaseCustomToken({
      discordId: "123456789012345678",
      discordUsername: "prof.test",
      displayName: "Prof Test",
      avatarUrl: "https://cdn.discordapp.com/avatar.png",
      admin: true,
      roleSynced: true
    }, 1_800_000_000);
    const payload = decodeJwtPayload(token);

    assert.equal(payload.uid, "discord:123456789012345678");
    assert.equal(payload.claims.authProvider, "discord");
    assert.equal(payload.claims.role, "prof");
    assert.equal(payload.claims.admin, true);
    assert.equal(payload.claims.discordName, "Prof Test");
    assert.equal(payload.exp - payload.iat, 3600);
  } finally {
    if (previousEmail === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    else process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = previousEmail;
    if (previousKey === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    else process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = previousKey;
  }
});
