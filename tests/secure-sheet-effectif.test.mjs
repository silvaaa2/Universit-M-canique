import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const secureSheetHandler = require("../api/secure-sheet.js");

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

    if (requestUrl.includes("identitytoolkit.googleapis.com")) {
      return jsonResponse({ users: [{ email: "prof@example.com" }] });
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
      authorization: "Bearer test-token",
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
    assert.ok(calls.some(call => call.url.includes("export?format=csv&gid=42")));
  } finally {
    globalThis.fetch = originalFetch;

    if (originalEmail === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    else process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = originalEmail;

    if (originalKey === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    else process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = originalKey;
  }
});
