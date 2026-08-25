import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");

test("le Cockpit remplace uniquement la zone de correction des examens", () => {
  const page = read("pages/prof-exam-4x91q.html");
  const css = read("assets/css/prof-exam-v2.css");
  const loader = read("assets/js/exam-loader-x8p2.js");

  assert.match(page, /prof-exam-v2\.css\?v=5/);
  assert.match(page, /prof-guard-exam\.js\?v=9056/);
  assert.match(page, /<aside class="v2-sidebar exam-v2-sidebar">/);

  const cockpitCss = css.split("EXAMENS V3 — COCKPIT")[1] || "";
  assert.match(cockpitCss, /@media \(min-width: 921px\)/);
  assert.match(cockpitCss, /\.student-answer-grid/);
  assert.match(cockpitCss, /\.exam-score-control input\[data-score-input\]/);
  assert.match(cockpitCss, /width:\s*64px\s*!important/);
  assert.doesNotMatch(cockpitCss, /\.v2-sidebar/);

  assert.match(loader, /let activeExamAnswerKey = ""/);
  assert.match(loader, /data-exam-question-previous/);
  assert.match(loader, /inputmode="numeric"/);
  assert.match(loader, /max="\$\{escapeHtml\(maxPoints\)\}"/);
  assert.match(loader, /Math\.max\(0, Math\.min\(newScore, maxPoints\)\)/);
  assert.doesNotMatch(loader, /data-score-choice/);
  assert.match(loader, /saveExamRecordToFirebase\(answerKey, sheetId, record, identity\)/);
  assert.match(loader, /applyAutomaticIdUniqueBonuses/);
});

test("le chargeur sécurisé livre aussi l'interface Cockpit", () => {
  const require = createRequire(import.meta.url);
  const handler = require(path.join(root, "api", "secure-exam-loader.js"));
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
  assert.match(body, /data-score-input/);
  assert.doesNotMatch(body, /data-score-choice/);
  assert.match(body, /activeExamAnswerKey/);
  assert.match(body, /\/api\/secure-sheet/);
  assert.doesNotMatch(body, /const SPREADSHEET_ID =/);
  assert.doesNotThrow(() => new Function(body));
});
