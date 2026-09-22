import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const examModule = require(path.join(process.cwd(), "lib/server/native-exam-v2.js"));
const builderModule = require(path.join(process.cwd(), "lib/server/prof-exam-builder.js"));

const exam = {
  id: "exam-2",
  recordType: "examDefinitionV2",
  status: "published",
  title: "Examen 2",
  questions: [
    { id: "q1", type: "single", title: "Couleur", options: ["Rouge", "Bleu"], correctAnswers: ["Bleu"], points: 3, required: true },
    { id: "q2", type: "multiple", title: "Pièces", options: ["Roue", "Radio", "Moteur"], correctAnswers: ["Roue", "Moteur"], points: 2, required: true },
    { id: "q3", type: "true_false", title: "Vrai ?", correctAnswers: ["true"], points: 1, required: true },
    { id: "q4", type: "short", title: "Explique", points: 4, required: true }
  ]
};

test("la version élève ne révèle jamais les bonnes réponses et ajoute les bonus au barème", () => {
  const publicExam = examModule.publicStudentExam(exam);
  assert.equal(publicExam.questionMaxScore, 10);
  assert.equal(publicExam.maxScore, 12);
  assert.equal(publicExam.questions.length, 4);
  assert.equal(JSON.stringify(publicExam).includes("correctAnswers"), false);
  assert.equal(builderModule.publicExam(exam).maxScore, 12);
});

test("les choix se corrigent exactement, puis la réponse écrite attend sa note", () => {
  const submission = examModule.prepareSubmission(exam, { idUnique: "123" }, {
    q1: "Bleu", q2: ["Roue", "Moteur"], q3: "false", q4: "Un moteur."
  });
  const first = examModule.computeResult(submission, { custom: true, stage: false });
  assert.equal(first.baseScore, 5);
  assert.equal(first.customBonus, 1);
  assert.equal(first.stageBonus, 0);
  assert.equal(first.totalScore, 6);
  assert.equal(first.maxScore, 12);
  assert.equal(first.status, "pending");

  const corrected = examModule.computeResult({ ...submission, manualScores: { q4: 4 } }, { custom: true, stage: true });
  assert.equal(corrected.totalScore, 11);
  assert.equal(corrected.passPoints, 9.6);
  assert.equal(corrected.status, "approved");
  assert.equal(corrected.customBonus, 1);
  assert.equal(corrected.stageBonus, 1);
});

test("une mauvaise sélection multiple ne gagne aucun point et les choix inventés sont rejetés", () => {
  const submission = examModule.prepareSubmission(exam, {}, {
    q1: "Bleu", q2: ["Roue"], q3: "true", q4: "Texte"
  });
  assert.equal(submission.fieldScores.q2, 0);
  assert.throws(() => examModule.prepareSubmission(exam, {}, {
    q1: "Bleu", q2: ["Roue", "Inconnu"], q3: "true", q4: "Texte"
  }), /choix proposés/);
});

test("les copies de deux examens sont distinctes pour le même élève et le même cursus", () => {
  const first = examModule.resultId("cursus-a", "exam-1", "123");
  assert.equal(first, examModule.resultId("cursus-a", "exam-1", "123"));
  assert.notEqual(first, examModule.resultId("cursus-a", "exam-2", "123"));
  assert.notEqual(first, examModule.resultId("cursus-b", "exam-1", "123"));
});

test("seules les réponses customs de la feuille actuelle créent un bonus", () => {
  const keys = examModule.currentCustomAnswerKeys(
    "Horodateur,Prénom - Nom (RP),ID Unique\n2026-08-25,Alice Exemple,123\n", "sentinelClassic"
  );
  assert.equal(keys.get("sentinelClassic__0__2026-08-25__Alice Exemple__123"), "123");
});

test("l’envoi anonyme d’une copie exige l’origine du site", async () => {
  await assert.rejects(
    examModule.handleStudentExam({ method: "POST", url: "/api/access/session?student=exam-v2", headers: { host: "example.test" }, body: {} }, {}),
    error => error.status === 403
  );
});
