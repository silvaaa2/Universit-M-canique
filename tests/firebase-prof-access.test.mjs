import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  FIREBASE_PROJECT_ID,
  verifyFirebaseIdToken,
  verifyFirebaseProfAccess
} = require("../lib/server/firebase-prof-access.js");

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
const nowSeconds = 1_800_000_000;

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createIdToken(overrides = {}) {
  const header = encode({ alg: "RS256", typ: "JWT", kid: "firebase-test-key" });
  const payload = encode({
    aud: FIREBASE_PROJECT_ID,
    iss: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    sub: "discord:123456789012345678",
    iat: nowSeconds - 10,
    exp: nowSeconds + 3600,
    authProvider: "discord",
    discordId: "123456789012345678",
    discordName: "Marc Carter",
    role: "prof",
    admin: true,
    ...overrides
  });
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey)
    .toString("base64url");
  return `${header}.${payload}.${signature}`;
}

function certificatesFetch() {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => "public, max-age=3600" },
    json: async () => ({ "firebase-test-key": publicKeyPem })
  });
}

test("le serveur valide localement un jeton Firebase Discord signé", async () => {
  const token = createIdToken();
  const claims = await verifyFirebaseIdToken(token, {
    fetchImpl: certificatesFetch,
    nowSeconds
  });

  assert.equal(claims.authProvider, "discord");
  assert.equal(claims.role, "prof");
  assert.equal(claims.admin, true);
});

test("la session Discord validée donne directement les droits professeur", async () => {
  const access = await verifyFirebaseProfAccess(createIdToken(), {
    fetchImpl: certificatesFetch,
    nowSeconds
  });

  assert.equal(access.allowed, true);
  assert.equal(access.role, "prof");
  assert.equal(access.admin, true);
  assert.equal(access.actorId, "discord:123456789012345678");
});

test("un jeton signé pour un autre projet est refusé", async () => {
  await assert.rejects(
    verifyFirebaseIdToken(createIdToken({ aud: "autre-projet" }), {
      fetchImpl: certificatesFetch,
      nowSeconds
    }),
    /autre projet/
  );
});
