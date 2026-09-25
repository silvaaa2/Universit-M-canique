import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function classes() {
  const values = new Set();
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    contains: value => values.has(value)
  };
}

function target(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener(name, handler) { listeners.set(name, handler); },
    dispatch(name, event) { return listeners.get(name)?.(event); }
  };
}

test("l'entrée depuis l'espace élève anime seulement un examen ouvert", async () => {
  const source = await read("assets/js/student-exam-home-motion.js");
  const body = { classList: classes() };
  const document = target({ body });
  const navigations = [];
  const window = target({
    location: { assign: url => navigations.push(url) },
    setTimeout: callback => callback(),
    matchMedia: () => ({ matches: false })
  });
  vm.runInNewContext(source, { document, window });

  const link = { href: "/pages/examen-2.html", classList: classes() };
  const click = { target: { closest: () => link }, preventDefault() { this.prevented = true; } };
  link.classList.add("custom-link-closed");
  document.dispatch("click", click);
  assert.equal(navigations.length, 0);

  link.classList.remove("custom-link-closed");
  document.dispatch("click", click);
  assert.equal(click.prevented, true);
  assert.equal(body.classList.contains("student-exam-opening"), true);
  assert.deepEqual(navigations, ["/pages/examen-2.html"]);

  window.dispatch("pageshow");
  assert.equal(body.classList.contains("student-exam-opening"), false);
});

test("la liste, le formulaire et le retour élève gardent leurs transitions fonctionnelles", async () => {
  const source = await read("assets/js/student-exam-v2.js");
  const list = target({ hidden: false, innerHTML: "", classList: classes() });
  const panel = { hidden: true, classList: classes() };
  const submitButton = { disabled: false, textContent: "Envoyer ma copie", classList: classes() };
  const form = target({
    classList: classes(),
    reportValidity: () => true,
    elements: {
      firstName: { value: "Ada" },
      lastName: { value: "Lovelace" },
      idUnique: { value: "ID-123" }
    },
    querySelector: () => submitButton
  });
  const content = target({ innerHTML: "", querySelector: selector => selector === "#studentExamForm" ? form : null });
  const back = target();
  const status = { textContent: "", dataset: {} };
  const body = { classList: classes() };
  const document = target({
    body,
    getElementById(id) {
      return {
        studentExamStatus: status,
        studentExamList: list,
        studentExamPanel: panel,
        studentExamContent: content,
        studentExamListBack: back
      }[id] || null;
    }
  });
  const navigations = [];
  const window = target({
    location: { replace() { throw new Error("Accès élève inattendu"); }, assign: url => navigations.push(url) },
    setTimeout: callback => callback(),
    matchMedia: () => ({ matches: false }),
    scrollTo() {}
  });
  const exam = { id: "examen-test", title: "Examen test", description: "", questions: [], maxScore: 0 };
  let submissions = 0;
  const fetch = async (url, options = {}) => ({
    ok: true,
    json: async () => {
      if (options.method === "POST") {
        submissions += 1;
        return { result: { status: "scored", totalScore: 0, maxScore: 0 } };
      }
      return url.includes("&id=") ? { exam } : { exams: [{ ...exam, questionCount: 0 }] };
    }
  });
  vm.runInNewContext(source, {
    document, window, fetch,
    sessionStorage: { getItem: () => String(Date.now()) },
    Date, console
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(list.innerHTML, /Examen test/);

  const examButton = { dataset: { examId: exam.id }, disabled: false };
  await list.dispatch("click", { target: { closest: () => examButton } });
  assert.equal(list.hidden, true);
  assert.equal(panel.hidden, false);
  assert.match(content.innerHTML, /studentExamForm/);
  assert.equal(examButton.disabled, false);

  await back.dispatch("click");
  assert.equal(panel.hidden, true);
  assert.equal(list.hidden, false);

  await list.dispatch("click", { target: { closest: () => examButton } });
  await form.dispatch("submit", { currentTarget: form, preventDefault() {} });
  assert.equal(submissions, 1);
  assert.match(content.innerHTML, /Copie envoyée/);
  assert.equal(status.dataset.tone, "ok");

  const link = { href: "/eleve.html" };
  const event = { target: { closest: () => link }, preventDefault() { this.prevented = true; } };
  await document.dispatch("click", event);
  assert.equal(event.prevented, true);
  assert.equal(body.classList.contains("is-leaving"), true);
  assert.deepEqual(navigations, ["/eleve.html"]);
});

test("les sorties, le chargement et le reçu sont animés uniquement côté examen élève", async () => {
  const [page, home, css, script] = await Promise.all([
    read("pages/examen-2.html"),
    read("eleve.html"),
    read("assets/css/student-exam-v2-enhancements.css"),
    read("assets/js/student-exam-v2.js")
  ]);
  assert.match(page, /body class="student-exam-page"/);
  assert.match(page, /student-exam-v2-enhancements\.css\?v=2/);
  assert.match(home, /student-exam-home-motion\.js\?v=1/);
  assert.match(css, /student-exam-page\.is-leaving/);
  assert.match(css, /student-exam-receipt-arrive/);
  assert.match(css, /student-exam-image-dialog\.is-closing/);
  assert.match(script, /await animateOut\(form\)/);
  assert.match(script, /await animateOut\(list\)/);
  assert.match(script, /await animateOut\(panel\)/);
});
