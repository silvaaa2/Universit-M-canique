import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const secureSheetHandler = require("../api/secure-sheet.js");
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createLegacyToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "RS256", typ: "JWT", kid: "effectif-test-key" });
  const payload = encode({
    aud: "universit-4b11e",
    iss: "https://securetoken.google.com/universit-4b11e",
    sub: "legacy-prof",
    email: "prof@example.com",
    iat: now - 10,
    exp: now + 3600
  });
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey)
    .toString("base64url");
  return `${header}.${payload}.${signature}`;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("l'API sécurisée résout et renvoie l'effectif actif", async () => {
  const originalFetch = globalThis.fetch;
  const originalEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const originalKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const calls = [];

  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    calls.push({ url: requestUrl, options });

    if (requestUrl.includes("securetoken@system.gserviceaccount.com")) {
      return new Response(JSON.stringify({ "effectif-test-key": publicKeyPem }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600"
        }
      });
    }

    if (requestUrl.includes("/documents/users/prof%40example.com")) {
      return jsonResponse({ fields: { role: { stringValue: "prof" } } });
    }

    if (requestUrl.includes("/documents/stageSettings/effectif")) {
      return jsonResponse({
        fields: {
          link: {
            stringValue: "https://docs.google.com/spreadsheets/d/1TestSpreadsheetId1234567890/edit#gid=42"
          }
        }
      });
    }

    if (requestUrl.includes("docs.google.com/spreadsheets")) {
      return new Response("ID Unique,Nom de l'élève\n123456,Élève Test", { status: 200 });
    }

    throw new Error(`Requête inattendue : ${requestUrl}`);
  };

  const req = {
    method: "GET",
    url: "/api/secure-sheet?source=effectif&sheet=current",
    headers: {
      authorization: `Bearer ${createLegacyToken()}`,
      host: "localhost"
    }
  };
  const res = {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body = "") {
      this.body = String(body);
    }
  };

  try {
    await secureSheetHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /123456,Élève Test/);
    assert.equal(res.headers["X-University-Spreadsheet-Id"], "1TestSpreadsheetId1234567890");
    assert.equal(res.headers["X-University-Sheet-Gid"], "42");
    assert.ok(calls.some(call => call.url.includes("export?format=csv&gid=42")));
  } finally {
    globalThis.fetch = originalFetch;

    if (originalEmail === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    else process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = originalEmail;

    if (originalKey === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    else process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = originalKey;
  }
});

test("l'effectif reste disponible quand Firestore limite temporairement le serveur", async () => {
  const originalFetch = globalThis.fetch;
  const originalEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const originalKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  let settingsAttempts = 0;

  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "service@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });

  globalThis.fetch = async url => {
    const requestUrl = String(url);

    if (requestUrl.includes("securetoken@system.gserviceaccount.com")) {
      return new Response(JSON.stringify({ "effectif-test-key": publicKeyPem }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600"
        }
      });
    }

    if (requestUrl.includes("/documents/users/prof%40example.com")) {
      return jsonResponse({ fields: { role: { stringValue: "prof" } } });
    }

    if (requestUrl.includes("/documents/stageSettings/effectif")) {
      settingsAttempts += 1;
      return jsonResponse({ error: { message: "quota" } }, 429);
    }

    if (requestUrl.includes("docs.google.com/spreadsheets")) {
      assert.match(requestUrl, /1FallbackSpreadsheetId1234567890/);
      assert.match(requestUrl, /gid=77/);
      return new Response("ID Unique,Nom de l'élève\n654321,Élève Secours", { status: 200 });
    }

    throw new Error(`Requête inattendue : ${requestUrl}`);
  };

  const req = {
    method: "GET",
    url: "/api/secure-sheet?source=effectif&sheet=current&spreadsheetId=1FallbackSpreadsheetId1234567890&gid=77",
    headers: {
      authorization: `Bearer ${createLegacyToken()}`,
      host: "localhost"
    }
  };
  const res = {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body = "") {
      this.body = String(body);
    }
  };

  try {
    await secureSheetHandler(req, res);

    assert.equal(settingsAttempts, 3);
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /654321,Élève Secours/);
  } finally {
    globalThis.fetch = originalFetch;

    if (originalEmail === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    else process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = originalEmail;

    if (originalKey === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    else process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = originalKey;
  }
});

test("les réponses restent lisibles si le compte de service n'a pas accès à leur feuille publique", async () => {
  const originalFetch = globalThis.fetch;
  const originalEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const originalKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  let privateAttempts = 0;
  let publicAttempts = 0;

  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "service@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });

  globalThis.fetch = async url => {
    const requestUrl = String(url);

    if (requestUrl.includes("securetoken@system.gserviceaccount.com")) {
      return new Response(JSON.stringify({ "effectif-test-key": publicKeyPem }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600"
        }
      });
    }

    if (requestUrl.includes("/documents/users/prof%40example.com")) {
      return jsonResponse({ fields: { role: { stringValue: "prof" } } });
    }

    if (requestUrl.includes("/documents/profSettings/examResponses")) {
      return jsonResponse({}, 404);
    }

    if (requestUrl.includes("oauth2.googleapis.com/token")) {
      return jsonResponse({ access_token: "google-test-token", expires_in: 3600 });
    }

    if (requestUrl.includes("sheets.googleapis.com")) {
      privateAttempts += 1;
      return jsonResponse({ error: { message: "forbidden" } }, 403);
    }

    if (requestUrl.includes("docs.google.com/spreadsheets")) {
      publicAttempts += 1;
      return new Response("Horodateur,Prénom / Nom (RP)\n25/08/2026,Élève Test", { status: 200 });
    }

    throw new Error(`Requête inattendue : ${requestUrl}`);
  };

  const req = {
    method: "GET",
    url: "/api/secure-sheet?source=examResponses&sheet=exam-form-1",
    headers: {
      authorization: `Bearer ${createLegacyToken()}`,
      host: "localhost"
    }
  };
  const res = {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body = "") {
      this.body = String(body);
    }
  };

  try {
    await secureSheetHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Élève Test/);
    assert.equal(privateAttempts, 1);
    assert.equal(publicAttempts, 1);
  } finally {
    globalThis.fetch = originalFetch;

    if (originalEmail === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    else process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = originalEmail;

    if (originalKey === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    else process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = originalKey;
  }
});

test("l'espace Modules reçoit l'effectif et les progressions dans une seule réponse", async () => {
  const originalFetch = globalThis.fetch;
  const originalEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const originalKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  globalThis.fetch = async url => {
    const requestUrl = String(url);

    if (requestUrl.includes("securetoken@system.gserviceaccount.com")) {
      return new Response(JSON.stringify({ "effectif-test-key": publicKeyPem }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" }
      });
    }
    if (requestUrl.includes("/documents/users/prof%40example.com")) {
      return jsonResponse({ fields: { role: { stringValue: "prof" } } });
    }
    if (requestUrl.includes("/documents/stageSettings/moduleEffectif")) {
      return jsonResponse({
        fields: {
          spreadsheetId: { stringValue: "1ModulesWorkspaceSpreadsheet123456" },
          gid: { stringValue: "84" }
        }
      });
    }
    if (requestUrl.includes("/documents/studentModules")) {
      return jsonResponse({
        documents: [{
          name: "projects/universit-4b11e/databases/(default)/documents/studentModules/cursus_test__123456",
          fields: {
            studentId: { stringValue: "123456" },
            cursusKey: { stringValue: "cursus_test" },
            checks: { mapValue: { fields: { module1: { booleanValue: true } } } },
            dates: { mapValue: { fields: { module1: { stringValue: "2026-09-21" } } } }
          }
        }]
      });
    }
    if (requestUrl.includes("docs.google.com/spreadsheets")) {
      return new Response("ID Unique,Nom de l'élève\n123456,Élève Modules", { status: 200 });
    }

    throw new Error(`Requête inattendue : ${requestUrl}`);
  };

  const req = {
    method: "GET",
    url: "/api/secure-sheet?source=module-workspace&sheet=current",
    headers: { authorization: `Bearer ${createLegacyToken()}`, host: "localhost" }
  };
  const res = {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    end(body = "") { this.body = String(body); }
  };

  try {
    await secureSheetHandler(req, res);
    const payload = JSON.parse(res.body);

    assert.equal(res.statusCode, 200);
    assert.equal(payload.gid, "84");
    assert.match(payload.csv, /Élève Modules/);
    assert.equal(payload.progressDocuments.length, 1);
    assert.equal(payload.progressDocuments[0].data.checks.module1, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEmail === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    else process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = originalEmail;
    if (originalKey === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    else process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = originalKey;
  }
});

test("une validation Module est enregistrée par la route professeur sécurisée", async () => {
  const originalFetch = globalThis.fetch;
  let savedDocument = null;

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);

    if (requestUrl.includes("securetoken@system.gserviceaccount.com")) {
      return new Response(JSON.stringify({ "effectif-test-key": publicKeyPem }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" }
      });
    }
    if (requestUrl.includes("/documents/users/prof%40example.com")) {
      return jsonResponse({ fields: { role: { stringValue: "prof" } } });
    }
    if (options.method === "PATCH" && requestUrl.includes("/documents/studentModules/")) {
      savedDocument = JSON.parse(options.body);
      return jsonResponse({ name: "saved" });
    }

    throw new Error(`Requête inattendue : ${requestUrl}`);
  };

  const cursusKey = "cursus_1modulesworkspacespreadsheet123456_84";
  const req = {
    method: "POST",
    url: "/api/secure-sheet?source=module-workspace&sheet=current",
    headers: { authorization: `Bearer ${createLegacyToken()}`, host: "localhost" },
    body: {
      documentId: `${cursusKey}__123456`,
      idUnique: "123456",
      studentId: "123456",
      studentName: "Élève Modules",
      searchText: "eleve modules 123456",
      cursusKey,
      cursusSpreadsheetId: "1ModulesWorkspaceSpreadsheet123456",
      cursusGid: "84",
      checks: { module1: true, module2: false },
      dates: { module1: "2026-09-21", module2: "" }
    }
  };
  const res = {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    end(body = "") { this.body = String(body); }
  };

  try {
    await secureSheetHandler(req, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { ok: true });
    assert.equal(savedDocument.fields.checks.mapValue.fields.module1.booleanValue, true);
    assert.equal(savedDocument.fields.dates.mapValue.fields.module1.stringValue, "2026-09-21");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("un avertissement Module conserve le format lu par les entreprises", async () => {
  const originalFetch = globalThis.fetch;
  let savedDocument = null;
  let savedUrl = "";

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);

    if (requestUrl.includes("securetoken@system.gserviceaccount.com")) {
      return new Response(JSON.stringify({ "effectif-test-key": publicKeyPem }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" }
      });
    }
    if (requestUrl.includes("/documents/users/prof%40example.com")) {
      return jsonResponse({ fields: { role: { stringValue: "prof" } } });
    }
    if (options.method === "PATCH" && requestUrl.includes("/documents/studentModules/")) {
      savedUrl = requestUrl;
      savedDocument = JSON.parse(options.body);
      return jsonResponse({ name: "saved-warning" });
    }

    throw new Error(`Requête inattendue : ${requestUrl}`);
  };

  const cursusKey = "cursus_1modulesworkspacespreadsheet123456_84";
  const req = {
    method: "POST",
    url: "/api/secure-sheet?source=module-workspace&sheet=current",
    headers: { authorization: `Bearer ${createLegacyToken()}`, host: "localhost" },
    body: {
      action: "warning",
      documentId: `${cursusKey}__123456`,
      studentId: "123456",
      cursusKey,
      warningLevel: "warning2",
      warningComment: "Retards répétés"
    }
  };
  const res = {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    end(body = "") { this.body = String(body); }
  };

  try {
    await secureSheetHandler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(savedDocument.fields.warningLevel.stringValue, "warning2");
    assert.equal(savedDocument.fields.warningComment.stringValue, "Retards répétés");
    assert.equal(savedDocument.fields.cursusKey.stringValue, cursusKey);
    assert.equal(savedDocument.fields.checks, undefined);
    assert.match(savedUrl, /updateMask\.fieldPaths=warningLevel/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
