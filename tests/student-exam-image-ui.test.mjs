import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

function eventTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener(name, listener) { listeners.set(name, listener); },
    dispatch(name, event = {}) { listeners.get(name)?.(event); }
  };
}

test("l'élève peut agrandir une image d'examen et la refermer sans perdre sa réponse", async () => {
  const source = await read("assets/js/student-exam-v2.js");
  const bodyClasses = new Set();
  const image = { src: "data:image/png;base64,YWJj", currentSrc: "", alt: "Illustration de la question 2" };
  const frame = { querySelector: selector => selector === "img" ? image : null };
  let triggerFocused = false;
  let closeFocused = false;
  const trigger = {
    dataset: { questionNumber: "2" },
    closest: selector => selector === ".student-exam-image-preview" ? frame : null,
    focus() { triggerFocused = true; }
  };
  const content = eventTarget({ innerHTML: "Réponse déjà saisie" });
  const dialog = eventTarget({
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; this.dispatch("close"); }
  });
  const fullImage = {
    removeAttribute(name) { if (name === "src") delete this.src; }
  };
  const caption = { textContent: "" };
  const closeButton = eventTarget({ focus() { closeFocused = true; } });
  const elements = {
    studentExamStatus: { textContent: "", dataset: {} },
    studentExamList: eventTarget({ innerHTML: "" }),
    studentExamPanel: { hidden: true },
    studentExamContent: content,
    studentExamImageDialog: dialog,
    studentExamImageFull: fullImage,
    studentExamImageCaption: caption,
    studentExamImageClose: closeButton,
    studentExamListBack: eventTarget()
  };

  vm.runInNewContext(source, {
    document: {
      getElementById: id => elements[id] || null,
      addEventListener() {},
      body: { classList: {
        add: name => bodyClasses.add(name),
        remove: name => bodyClasses.delete(name)
      } }
    },
    window: {
      location: { replace() { throw new Error("Accès élève inattendu"); } },
      setTimeout: callback => callback()
    },
    sessionStorage: { getItem: () => String(Date.now()) },
    fetch: async () => ({ ok: true, json: async () => ({ exams: [] }) }),
    Date,
    console
  });

  content.dispatch("click", { target: { closest: () => trigger } });
  assert.equal(dialog.open, true);
  assert.equal(fullImage.src, image.src);
  assert.equal(fullImage.alt, image.alt);
  assert.equal(caption.textContent, "Question 2 · image agrandie");
  assert.equal(closeFocused, true);
  assert.equal(bodyClasses.has("student-exam-image-open"), true);

  closeButton.dispatch("click");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dialog.open, false);
  assert.equal(fullImage.src, undefined);
  assert.equal(triggerFocused, true);
  assert.equal(bodyClasses.has("student-exam-image-open"), false);
  assert.equal(content.innerHTML, "Réponse déjà saisie");
});

test("la loupe, la croix visible et les animations sont réservées à l'examen élève", async () => {
  const page = await read("pages/examen-2.html");
  const script = await read("assets/js/student-exam-v2.js");
  const css = await read("assets/css/student-exam-v2-enhancements.css");

  assert.match(page, /<dialog[^>]*id="studentExamImageDialog"/);
  assert.match(page, /id="studentExamImageClose"[^>]*aria-label="Fermer l’image agrandie"/);
  assert.match(page, /student-exam-v2-enhancements\.css\?v=2/);
  assert.match(script, /class="student-exam-image-zoom"[^>]*data-exam-image-zoom/);
  assert.match(script, /imageDialog\.showModal\(\)/);
  assert.match(css, /\.student-exam-image-dialog\[open\]/);
  assert.match(css, /\.student-exam-question[^\{]*\{[\s\S]*?animation:/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
