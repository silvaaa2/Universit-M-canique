import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const require = createRequire(import.meta.url);
const { __test } = require(path.join(root, "lib/server/native-exam-v2.js"));

test("l’Examen 2 reste ouvert par défaut mais un verrou Firestore bloque la lecture et l’envoi", async () => {
  let calls = 0;
  await __test.assertStudentExamOpen(async (collection, id) => {
    assert.equal(collection, "customAvailability");
    assert.equal(id, "examV2");
    calls++;
    return null;
  });
  assert.equal(calls, 1);
  await assert.rejects(
    __test.assertStudentExamOpen(async () => ({ enabled: false })),
    error => error.status === 423 && /verrouillé/.test(error.message)
  );
  await assert.rejects(
    __test.assertStudentExamOpen(async () => { throw new Error("Firestore indisponible"); }),
    /Firestore indisponible/
  );
});

test("la page Fiches Élèves commande le même verrou que le serveur et le portail élève", () => {
  const manager = read("assets/js/prof-customs-eleves-page.js");
  const portal = read("assets/js/custom-availability-links.js");
  const student = read("assets/js/student-exam-v2.js");
  const server = read("lib/server/native-exam-v2.js");
  const page = read("pages/prof-customs-eleves.html");

  assert.match(manager, /id: "examV2"/);
  assert.match(manager, /setDoc\(doc\(db, "customAvailability", customId\)/);
  assert.match(manager, /Verrouiller/);
  assert.match(page, /Fiches Élèves/);
  assert.match(portal, /const EXAM_ID = "examV2"/);
  assert.match(read("eleve.html"), /data-custom-link="examV2"/);
  assert.match(student, /error\.status === 423/);
  assert.match(server, /await assertStudentExamOpen\(\)/g);
});
