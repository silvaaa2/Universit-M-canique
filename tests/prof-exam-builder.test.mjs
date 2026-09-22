import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const require = createRequire(import.meta.url);
const { normalizeExamPayload, examSummary } = require(path.join(root, "lib/server/prof-exam-builder.js"));

test("le nouvel éditeur crée un examen natif avec barème, photos et aperçu", () => {
  const page = read("pages/prof-exam-builder.html");
  const script = read("assets/js/prof-exam-builder.js");
  const css = read("assets/css/prof-exam-builder.css");

  assert.match(page, /id="examTitle"/);
  assert.match(page, /data-add-question="short"/);
  assert.match(page, /data-add-question="multiple"/);
  assert.match(page, /id="publishExamBtn"/);
  assert.match(page, /id="examPreviewModal"/);
  assert.match(script, /prof=exam-builder/);
  assert.match(script, /compressImage/);
  assert.match(script, /question-image-input/);
  assert.doesNotMatch(script, /input\.click\(\)/);
  assert.match(css, /\.exam-editor \.question-image-input/);
  assert.match(css, /position:\s*absolute/);
  assert.match(script, /correctAnswers/);
  assert.match(css, /\.exam-question-list/);
  assert.match(css, /@media \(max-width: 760px\)/);
});

test("le serveur nettoie le formulaire et calcule exactement son barème", () => {
  const exam = normalizeExamPayload({
    title: " Examen mécanique ",
    status: "published",
    durationMinutes: 45,
    questions: [
      { type: "short", title: "ID ?", points: 2.5, required: true },
      { type: "single", title: "Couleur ?", points: 3, options: ["Rouge", "Bleu"], correctAnswers: ["Bleu"] },
      { type: "true_false", title: "Le moteur tourne", points: 1, correctAnswer: "true" }
    ]
  });

  assert.equal(exam.title, "Examen mécanique");
  assert.equal(exam.questionCount, 3);
  assert.equal(exam.maxScore, 6.5);
  assert.equal(exam.status, "published");
  assert.deepEqual(exam.questions[1].correctAnswers, ["Bleu"]);
  assert.deepEqual(exam.questions[2].correctAnswers, ["true"]);
  assert.equal(examSummary({ id: "exam-1", ...exam }).questions.length, 0);
});

test("les formulaires invalides ou trop lourds sont refusés", () => {
  assert.throws(() => normalizeExamPayload({ title: "", questions: [{ title: "Q", type: "short" }] }), /titre/i);
  assert.throws(() => normalizeExamPayload({ title: "Test", questions: [] }), /question/i);
  assert.throws(() => normalizeExamPayload({
    title: "Test",
    questions: [{ title: "Q", type: "single", options: ["Un seul"] }]
  }), /deux réponses/i);
  assert.throws(() => normalizeExamPayload({
    title: "Test",
    questions: [{ title: "Q", type: "short", image: "https://example.com/image.jpg" }]
  }), /image/i);
});

test("Nouvel examen reste lié au droit Examens et Examen 2 apparaît dans les réponses", () => {
  const session = read("api/access/session.js");
  const policy = read("assets/js/prof-access-policy.js");
  const examPage = read("pages/prof-exam-4x91q.html");
  const navPages = [
    "pages/espace-prof.html",
    "pages/prof-rp-7x92q.html",
    "pages/prof-exam-4x91q.html",
    "pages/prof-modules-eleves.html",
    "pages/prof-customs-eleves.html"
  ];

  assert.match(session, /profExamBuilder/);
  assert.match(session, /handleProfExamBuilder/);
  assert.match(policy, /prof-exam-builder/);
  assert.match(examPage, /data-exam-mode="native"/);
  assert.match(examPage, />Examen 2</);
  assert.match(examPage, /prof-exam-2-panel\.js\?v=1/);
  navPages.forEach(page => assert.match(read(page), /prof-exam-builder\.html/));
});
