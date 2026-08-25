import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

test("le Cockpit Customs remplace uniquement la zone de correction", () => {
  const page = read("pages/prof-rp-7x92q.html");
  const css = read("assets/css/prof-rp-v2.css");
  const loader = read("assets/js/rp-loader-9kq4z.js");

  assert.match(page, /prof-rp-v2\.css\?v=5/);
  assert.match(page, /prof-guard\.js\?v=6012/);
  assert.match(page, /<aside class="v2-sidebar rp-v2-sidebar">/);

  const cockpitCss = css.split("CUSTOMS V3 — COCKPIT DE CORRECTION")[1] || "";
  assert.match(cockpitCss, /@media \(min-width: 921px\)/);
  assert.match(cockpitCss, /\.custom-cockpit-stats/);
  assert.match(cockpitCss, /#sheetContent \.student-answer-grid/);
  assert.doesNotMatch(cockpitCss, /\.v2-sidebar/);

  assert.match(loader, /let activeCustomAnswerKey = ""/);
  assert.match(loader, /data-custom-search/);
  assert.match(loader, /data-custom-filter="pending"/);
  assert.match(loader, /openCustomCard/);
  assert.match(loader, /saveAnswerStatusToFirebase\(answerKey, sheetId, newStatus, meta\)/);
  assert.match(loader, /applyAlreadyApprovedStates/);
  assert.match(loader, /data-open-external-link/);
});

test("le chargeur sécurisé livre aussi le Cockpit Customs", () => {
  const require = createRequire(import.meta.url);
  const handler = require(path.join(root, "api", "secure-rp-loader.js"));
  const headers = new Map();
  let body = "";
  let statusCode = 0;

  handler(
    { method: "GET" },
    {
      set statusCode(value) { statusCode = value; },
      get statusCode() { return statusCode; },
      setHeader(name, value) { headers.set(name, value); },
      end(value = "") { body += value; }
    }
  );

  assert.equal(statusCode, 200);
  assert.match(headers.get("Content-Type"), /application\/javascript/);
  assert.match(body, /custom-cockpit-tools/);
  assert.match(body, /activeCustomAnswerKey/);
  assert.match(body, /\/api\/secure-sheet/);
  assert.doesNotMatch(body, /docs\.google\.com\/spreadsheets/);
  assert.doesNotThrow(() => new Function(body));
});
