import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58"
};

const TYPE_LABELS = {
  short: "Réponse courte",
  long: "Texte long",
  single: "Choix unique",
  multiple: "Choix multiple",
  true_false: "Vrai / Faux"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const editor = document.getElementById("examEditor");
const questionList = document.getElementById("questionList");
const libraryList = document.getElementById("examLibraryList");
const libraryStatus = document.getElementById("examLibraryStatus");
const guardLoader = document.getElementById("guardLoader");
const previewModal = document.getElementById("examPreviewModal");

try {
  document.body.dataset.theme = localStorage.getItem("profV2Theme") === "light" ? "light" : "dark";
} catch {
  document.body.dataset.theme = "dark";
}

let currentUser = null;
let currentExamId = "";
let currentStatus = "draft";
let questions = [];
let exams = [];
let busy = false;
let dirty = false;

function uid(prefix = "q") {
  if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function defaultQuestion(type = "short") {
  const choice = type === "single" || type === "multiple";
  return {
    id: uid(),
    type,
    title: "",
    description: "",
    points: 1,
    required: true,
    options: choice ? ["Option 1", "Option 2"] : [],
    correctAnswers: [],
    image: ""
  };
}

function findQuestion(id) {
  return questions.find(question => question.id === id);
}

function getInitials(value) {
  return String(value || "Professeur")
    .split(/[@\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("") || "PR";
}

function syncIdentity(user) {
  let localName = "";
  try { localName = JSON.parse(localStorage.getItem("profV2Profile") || "{}").displayName || ""; } catch {}
  const name = String(localName || user?.profDisplayName || user?.displayName || user?.email || "Professeur");
  const label = document.getElementById("builderUserName");
  const avatar = document.getElementById("builderUserInitials");
  if (label) label.textContent = name;
  if (avatar) {
    const renderAvatar = window.profIdentityUtils?.renderProfAvatar;
    if (typeof renderAvatar === "function") renderAvatar(avatar, user, getInitials(name));
    else avatar.textContent = getInitials(name);
  }
}

function setStatus(message, tone = "") {
  const status = document.getElementById("builderStatus");
  if (!status) return;
  status.textContent = message || "";
  status.dataset.tone = tone;
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll("#saveDraftBtn, #publishExamBtn, #newExamBtn, #deleteExamBtn").forEach(button => {
    button.disabled = value;
  });
}

function formatDate(value) {
  if (!value) return "Jamais enregistré";
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function updateSummary() {
  const score = Math.round(questions.reduce((total, question) => total + (Number(question.points) || 0), 0) * 100) / 100;
  document.getElementById("questionCount").textContent = String(questions.length);
  document.getElementById("maxScore").textContent = String(score).replace(".", ",");
  document.getElementById("examStateLabel").textContent = currentStatus === "published" ? "Publié" : currentStatus === "archived" ? "Archivé" : "Brouillon";
}

function renderOptions(question) {
  if (question.type === "true_false") {
    return `
      <div class="question-options" data-options-for="${escapeHtml(question.id)}">
        <span class="answer-key-hint">Coche la bonne réponse</span>
        ${["true", "false"].map(value => `
          <label class="question-option">
            <input type="radio" name="correct-${escapeHtml(question.id)}" value="${value}" data-correct-true-false="${escapeHtml(question.id)}" ${question.correctAnswers.includes(value) ? "checked" : ""}>
            <span>${value === "true" ? "Vrai" : "Faux"}</span>
          </label>
        `).join("")}
      </div>`;
  }
  if (question.type !== "single" && question.type !== "multiple") return "";
  const inputType = question.type === "single" ? "radio" : "checkbox";
  return `
    <div class="question-options" data-options-for="${escapeHtml(question.id)}">
      <span class="answer-key-hint">${question.type === "multiple" ? "Coche les bonnes réponses" : "Coche la bonne réponse"}</span>
      ${question.options.map((option, index) => `
        <div class="question-option">
          <input type="${inputType}" name="correct-${escapeHtml(question.id)}" data-correct-option="${escapeHtml(question.id)}" data-option-index="${index}" ${question.correctAnswers.includes(option) ? "checked" : ""} aria-label="Bonne réponse">
          <input type="text" value="${escapeHtml(option)}" maxlength="180" data-option-text="${escapeHtml(question.id)}" data-option-index="${index}" aria-label="Texte de l'option ${index + 1}">
          <button type="button" class="option-remove" data-remove-option="${escapeHtml(question.id)}" data-option-index="${index}" aria-label="Supprimer l'option">×</button>
        </div>
      `).join("")}
      <button type="button" class="add-option" data-add-option="${escapeHtml(question.id)}">+ Ajouter une option</button>
    </div>`;
}

function renderQuestion(question, index) {
  return `
    <article class="exam-question" data-question-id="${escapeHtml(question.id)}">
      <header class="exam-question-head">
        <div class="exam-question-number"><b>${index + 1}</b><span>${escapeHtml(TYPE_LABELS[question.type] || "Question")}</span></div>
        <div class="exam-question-tools">
          <button type="button" data-move-question="up" data-question="${escapeHtml(question.id)}" aria-label="Monter" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-move-question="down" data-question="${escapeHtml(question.id)}" aria-label="Descendre" ${index === questions.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" data-duplicate-question="${escapeHtml(question.id)}" aria-label="Dupliquer">⧉</button>
          <button type="button" class="delete-question" data-delete-question="${escapeHtml(question.id)}" aria-label="Supprimer">×</button>
        </div>
      </header>
      <div class="exam-question-body">
        <div class="question-main">
          <label>Question</label>
          <input class="question-title" data-question-field="title" data-question="${escapeHtml(question.id)}" maxlength="500" value="${escapeHtml(question.title)}" placeholder="Écris la question...">
          <label>Précision facultative</label>
          <textarea data-question-field="description" data-question="${escapeHtml(question.id)}" maxlength="1200" rows="2" placeholder="Ajoute une indication si nécessaire.">${escapeHtml(question.description)}</textarea>
          ${renderOptions(question)}
        </div>
        <div class="question-side">
          <label>Type de réponse</label>
          <select data-question-field="type" data-question="${escapeHtml(question.id)}">
            ${Object.entries(TYPE_LABELS).map(([value, label]) => `<option value="${value}" ${question.type === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
          </select>
          <label>Points</label>
          <input type="number" min="0" max="200" step="0.5" value="${Number(question.points) || 0}" data-question-field="points" data-question="${escapeHtml(question.id)}">
          <label class="question-required"><input type="checkbox" data-question-field="required" data-question="${escapeHtml(question.id)}" ${question.required ? "checked" : ""}> Réponse obligatoire</label>
        </div>
        <div class="question-image-zone">
          <div class="image-picker">
            <button type="button" class="image-picker-button" data-pick-image="${escapeHtml(question.id)}">+ Choisir une photo sur l’appareil</button>
            <input class="question-image-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" data-image-input="${escapeHtml(question.id)}" aria-label="Choisir une photo depuis cet appareil">
            <small>Le bouton natif reste disponible juste au-dessus du format accepté · JPG, PNG ou WebP · 12 Mo maximum</small>
          </div>
          ${question.image ? `<div class="question-image-preview"><img src="${question.image}" alt="Photo de la question"><button type="button" class="image-remove" data-remove-image="${escapeHtml(question.id)}" aria-label="Retirer la photo">×</button></div>` : `<span class="exam-library-status">Aucune photo</span>`}
        </div>
      </div>
    </article>`;
}

function renderQuestions() {
  questionList.innerHTML = questions.map(renderQuestion).join("");
  updateSummary();
}

function markDirty() {
  dirty = true;
  if (!busy) setStatus("Modifications non sauvegardées.", "info");
  updateSummary();
}

function clearEditor() {
  currentExamId = "";
  currentStatus = "draft";
  editor.reset();
  document.getElementById("examDuration").value = "0";
  questions = [defaultQuestion("short")];
  document.getElementById("deleteExamBtn").hidden = true;
  dirty = false;
  renderQuestions();
  renderLibrary();
  setStatus("Nouveau brouillon prêt.");
}

function renderLibrary() {
  document.getElementById("examLibraryCount").textContent = String(exams.length);
  libraryStatus.hidden = exams.length > 0;
  libraryStatus.textContent = exams.length ? "" : "Aucun examen enregistré pour le moment.";
  libraryList.innerHTML = exams.map(exam => `
    <button type="button" class="exam-library-item ${exam.id === currentExamId ? "active" : ""}" data-open-exam="${escapeHtml(exam.id)}">
      <strong>${escapeHtml(exam.title || "Sans titre")}</strong>
      <span><i>${exam.status === "published" ? "Publié" : exam.status === "archived" ? "Archivé" : "Brouillon"}</i><b>${Number(exam.maxScore || 0)} pts</b></span>
      <span>${Number(exam.questionCount || exam.questions?.length || 0)} question(s)<small>${escapeHtml(formatDate(exam.updatedAt))}</small></span>
    </button>
  `).join("");
}

function loadExamIntoEditor(exam) {
  if (!exam) return;
  currentExamId = String(exam.id || "");
  currentStatus = String(exam.status || "draft");
  document.getElementById("examTitle").value = exam.title || "";
  document.getElementById("examDescription").value = exam.description || "";
  document.getElementById("examInstructions").value = exam.instructions || "";
  document.getElementById("examDuration").value = String(Number(exam.durationMinutes || 0));
  questions = Array.isArray(exam.questions) && exam.questions.length
    ? exam.questions.map(question => ({ ...defaultQuestion(question.type), ...question, options: [...(question.options || [])], correctAnswers: [...(question.correctAnswers || [])] }))
    : [defaultQuestion("short")];
  document.getElementById("deleteExamBtn").hidden = false;
  dirty = false;
  renderQuestions();
  renderLibrary();
  setStatus(`Examen chargé · dernière sauvegarde ${formatDate(exam.updatedAt)}.`);
  document.querySelector(".exam-builder-content")?.scrollTo({ top: 0, behavior: "smooth" });
}

function collectPayload(status) {
  return {
    id: currentExamId,
    title: document.getElementById("examTitle").value.trim(),
    description: document.getElementById("examDescription").value.trim(),
    instructions: document.getElementById("examInstructions").value.trim(),
    durationMinutes: Number(document.getElementById("examDuration").value || 0),
    status,
    questions: questions.map(question => ({
      ...question,
      points: Number(question.points || 0),
      options: [...question.options],
      correctAnswers: [...question.correctAnswers]
    }))
  };
}

function validatePayload(payload) {
  if (!payload.title) throw new Error("Donne un titre à l’examen.");
  if (!payload.questions.length) throw new Error("Ajoute au moins une question.");
  const emptyIndex = payload.questions.findIndex(question => !String(question.title || "").trim());
  if (emptyIndex >= 0) throw new Error(`Écris le texte de la question ${emptyIndex + 1}.`);
  const invalidChoice = payload.questions.findIndex(question => ["single", "multiple"].includes(question.type) && question.options.filter(Boolean).length < 2);
  if (invalidChoice >= 0) throw new Error(`Ajoute au moins deux choix à la question ${invalidChoice + 1}.`);
  if (payload.status === "published") {
    const missingAnswer = payload.questions.findIndex(question => (
      ["single", "multiple", "true_false"].includes(question.type)
      && question.correctAnswers.length === 0
    ));
    if (missingAnswer >= 0) throw new Error(`Coche au moins une bonne réponse à la question ${missingAnswer + 1}.`);
  }
}

async function apiRequest(method = "GET", payload = null) {
  if (!currentUser) throw new Error("Connexion professeur requise.");
  const token = await currentUser.getIdToken(false);
  const response = await fetch("/api/access/session?prof=exam-builder", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload ? { "Content-Type": "application/json" } : {})
    },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Action impossible (${response.status}).`);
  return data;
}

async function loadExams() {
  libraryStatus.hidden = false;
  libraryStatus.textContent = "Chargement des examens...";
  const payload = await apiRequest();
  exams = Array.isArray(payload.exams) ? payload.exams : [];
  renderLibrary();
}

async function saveExam(status) {
  if (busy) return;
  try {
    const payload = collectPayload(status);
    validatePayload(payload);
    setBusy(true);
    setStatus(status === "published" ? "Publication en cours..." : "Sauvegarde en cours...", "info");
    const result = await apiRequest(currentExamId ? "PATCH" : "POST", payload);
    const saved = result.exam;
    const index = exams.findIndex(exam => exam.id === saved.id);
    if (index >= 0) exams[index] = saved;
    else exams.unshift(saved);
    currentExamId = saved.id;
    currentStatus = saved.status;
    dirty = false;
    renderLibrary();
    updateSummary();
    setStatus(status === "published" ? "Examen publié. Il est prêt pour la future interface élève V2." : "Brouillon sauvegardé.", "ok");
  } catch (error) {
    setStatus(error.message || "Sauvegarde impossible.", "error");
  } finally {
    setBusy(false);
  }
}

async function compressImage(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Choisis une image JPG, PNG ou WebP.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Cette image dépasse 12 Mo.");
  const source = await new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Cette image ne peut pas être lue."));
    };
    image.src = objectUrl;
  });
  const maximumWidth = 1280;
  const maximumHeight = 900;
  const ratio = Math.min(1, maximumWidth / source.naturalWidth, maximumHeight / source.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * ratio));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  let quality = .82;
  let result = canvas.toDataURL("image/jpeg", quality);
  while (result.length > 330_000 && quality > .42) {
    quality -= .1;
    result = canvas.toDataURL("image/jpeg", quality);
  }
  if (result.length > 350_000) throw new Error("L’image reste trop lourde après compression.");
  return result;
}

function previewAnswer(question) {
  if (question.type === "long") return `<div class="preview-answer" style="min-height:90px">Réponse longue de l’élève...</div>`;
  if (question.type === "short") return `<div class="preview-answer">Réponse de l’élève...</div>`;
  const options = question.type === "true_false" ? ["Vrai", "Faux"] : question.options;
  const type = question.type === "multiple" ? "checkbox" : "radio";
  const name = `preview-${question.id}`;
  return `<fieldset class="preview-options"><legend>${question.type === "multiple" ? "Plusieurs réponses sont possibles" : "Choisis une réponse"}</legend>${options.map((option, index) => `
    <label class="preview-option">
      <input type="${type}" name="${escapeHtml(name)}" value="${escapeHtml(question.type === "true_false" ? (index === 0 ? "true" : "false") : option)}">
      <span>${escapeHtml(option)}</span>
    </label>`).join("")}</fieldset>`;
}

function openPreview() {
  const payload = collectPayload(currentStatus);
  const score = questions.reduce((total, question) => total + (Number(question.points) || 0), 0);
  document.getElementById("previewTitle").textContent = payload.title || "Examen sans titre";
  document.getElementById("examPreviewContent").innerHTML = `
    <section class="preview-intro">
      <h3>${escapeHtml(payload.title || "Examen sans titre")}</h3>
      <p>${escapeHtml(payload.description || "Aucune description.")}</p>
      ${payload.instructions ? `<p><strong>Consignes :</strong> ${escapeHtml(payload.instructions)}</p>` : ""}
      <p><strong>${payload.durationMinutes ? `${payload.durationMinutes} minutes · ` : ""}${score} points</strong></p>
    </section>
    ${payload.questions.map((question, index) => `
      <article class="preview-question">
        <header><h4>${index + 1}. ${escapeHtml(question.title || "Question sans titre")}${question.required ? " *" : ""}</h4><span>${Number(question.points) || 0} pt(s)</span></header>
        ${question.description ? `<p>${escapeHtml(question.description)}</p>` : ""}
        ${question.image ? `<img src="${question.image}" alt="Illustration de la question ${index + 1}">` : ""}
        ${previewAnswer(question)}
      </article>
    `).join("")}`;
  previewModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closePreview() {
  previewModal.hidden = true;
  document.body.style.overflow = "";
}

editor.addEventListener("input", event => {
  const target = event.target;
  const questionId = target.dataset?.question;
  const field = target.dataset?.questionField;
  if (questionId && field && field !== "type") {
    const question = findQuestion(questionId);
    if (!question) return;
    question[field] = field === "points" ? Number(target.value || 0) : field === "required" ? target.checked : target.value;
  }
  if (target.dataset?.optionText) {
    const question = findQuestion(target.dataset.optionText);
    const index = Number(target.dataset.optionIndex);
    if (question?.options?.[index] !== undefined) {
      const previous = question.options[index];
      question.options[index] = target.value;
      question.correctAnswers = question.correctAnswers.map(answer => answer === previous ? target.value : answer);
    }
  }
  markDirty();
});

editor.addEventListener("change", async event => {
  const target = event.target;
  if (target.dataset?.questionField === "type") {
    const question = findQuestion(target.dataset.question);
    if (!question) return;
    question.type = target.value;
    question.options = ["single", "multiple"].includes(question.type) ? (question.options.length >= 2 ? question.options : ["Option 1", "Option 2"]) : [];
    question.correctAnswers = [];
    renderQuestions();
    markDirty();
    return;
  }
  if (target.dataset?.correctOption) {
    const question = findQuestion(target.dataset.correctOption);
    const option = question?.options?.[Number(target.dataset.optionIndex)];
    if (!question || option === undefined) return;
    if (question.type === "single") question.correctAnswers = target.checked ? [option] : [];
    else if (target.checked) question.correctAnswers = [...new Set([...question.correctAnswers, option])];
    else question.correctAnswers = question.correctAnswers.filter(answer => answer !== option);
    markDirty();
    return;
  }
  if (target.dataset?.correctTrueFalse) {
    const question = findQuestion(target.dataset.correctTrueFalse);
    if (question) question.correctAnswers = [target.value];
    markDirty();
    return;
  }
  if (target.dataset?.imageInput) {
    const question = findQuestion(target.dataset.imageInput);
    if (!question || !target.files?.[0]) return;
    setStatus("Compression de la photo...", "info");
    try {
      question.image = await compressImage(target.files[0]);
      renderQuestions();
      markDirty();
      setStatus("Photo ajoutée et compressée.", "ok");
    } catch (error) {
      setStatus(error.message || "Photo impossible à ajouter.", "error");
    }
  }
});

editor.addEventListener("click", event => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.pickImage) {
    event.preventDefault();
    const input = target.closest(".image-picker")?.querySelector("input[type='file']");
    if (!input) {
      setStatus("Le sélecteur de photos est introuvable. Recharge la page.", "error");
      return;
    }

    input.value = "";
    setStatus("Ouverture du sélecteur de photos...", "info");
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
      } else {
        input.click();
      }
    } catch (error) {
      console.error("Ouverture du sélecteur de photos impossible :", error);
      setStatus("Le navigateur a bloqué l’ouverture. Utilise le bouton natif « Choisir un fichier » dans le cadre photo.", "error");
      input.focus();
    }
    return;
  }
  if (target.dataset.addQuestion) {
    if (questions.length >= 60) return setStatus("Limite de 60 questions atteinte.", "error");
    questions.push(defaultQuestion(target.dataset.addQuestion));
    renderQuestions();
    markDirty();
    return;
  }
  if (target.dataset.deleteQuestion) {
    if (questions.length === 1) return setStatus("Un examen doit garder au moins une question.", "error");
    questions = questions.filter(question => question.id !== target.dataset.deleteQuestion);
    renderQuestions();
    markDirty();
    return;
  }
  if (target.dataset.duplicateQuestion) {
    const index = questions.findIndex(question => question.id === target.dataset.duplicateQuestion);
    if (index < 0 || questions.length >= 60) return;
    const copy = JSON.parse(JSON.stringify(questions[index]));
    copy.id = uid();
    questions.splice(index + 1, 0, copy);
    renderQuestions();
    markDirty();
    return;
  }
  if (target.dataset.moveQuestion) {
    const index = questions.findIndex(question => question.id === target.dataset.question);
    const next = target.dataset.moveQuestion === "up" ? index - 1 : index + 1;
    if (index < 0 || next < 0 || next >= questions.length) return;
    [questions[index], questions[next]] = [questions[next], questions[index]];
    renderQuestions();
    markDirty();
    return;
  }
  if (target.dataset.addOption) {
    const question = findQuestion(target.dataset.addOption);
    if (!question || question.options.length >= 12) return;
    question.options.push(`Option ${question.options.length + 1}`);
    renderQuestions();
    markDirty();
    return;
  }
  if (target.dataset.removeOption) {
    const question = findQuestion(target.dataset.removeOption);
    const index = Number(target.dataset.optionIndex);
    if (!question || question.options.length <= 2) return setStatus("Garde au moins deux choix.", "error");
    const removed = question.options[index];
    question.options.splice(index, 1);
    question.correctAnswers = question.correctAnswers.filter(answer => answer !== removed);
    renderQuestions();
    markDirty();
    return;
  }
  if (target.dataset.removeImage) {
    const question = findQuestion(target.dataset.removeImage);
    if (question) question.image = "";
    renderQuestions();
    markDirty();
  }
});

libraryList.addEventListener("click", async event => {
  const button = event.target.closest("[data-open-exam]");
  if (!button) return;
  const summary = exams.find(item => item.id === button.dataset.openExam);
  if (!summary) return;
  try {
    setStatus("Chargement de l’examen...", "info");
    const token = await currentUser.getIdToken(false);
    const response = await fetch(`/api/access/session?prof=exam-builder&id=${encodeURIComponent(summary.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Chargement impossible.");
    loadExamIntoEditor(payload.exam);
  } catch (error) {
    setStatus(error.message || "Impossible d’ouvrir cet examen.", "error");
  }
});

document.getElementById("newExamBtn").addEventListener("click", () => {
  if (dirty && !window.confirm("Abandonner les modifications non sauvegardées ?")) return;
  clearEditor();
});
document.getElementById("saveDraftBtn").addEventListener("click", () => saveExam("draft"));
document.getElementById("publishExamBtn").addEventListener("click", () => saveExam("published"));
document.getElementById("previewExamBtn").addEventListener("click", openPreview);
document.getElementById("deleteExamBtn").addEventListener("click", async () => {
  if (!currentExamId || busy) return;
  const title = document.getElementById("examTitle").value.trim() || "cet examen";
  if (!window.confirm(`Supprimer définitivement « ${title} » ?`)) return;
  try {
    setBusy(true);
    setStatus("Suppression en cours...", "info");
    await apiRequest("DELETE", { id: currentExamId });
    exams = exams.filter(exam => exam.id !== currentExamId);
    clearEditor();
    setStatus("Examen supprimé.", "ok");
  } catch (error) {
    setStatus(error.message || "Suppression impossible.", "error");
  } finally {
    setBusy(false);
  }
});
previewModal.addEventListener("click", event => {
  if (event.target.closest("[data-close-preview]")) closePreview();
});
window.addEventListener("keydown", event => { if (event.key === "Escape" && !previewModal.hidden) closePreview(); });
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.replace("espace-prof.html");
    return;
  }
  currentUser = user;
  window.currentProfUser = user;
  syncIdentity(user);
  window.setTimeout(() => syncIdentity(user), 700);
  try {
    clearEditor();
    await loadExams();
    guardLoader.hidden = true;
  } catch (error) {
    guardLoader.innerHTML = `<div class="exam-builder-guard-card"><p class="v2-eyebrow">Chargement impossible</p><h2>Éditeur indisponible</h2><p>${escapeHtml(error.message || "Réessaie dans un instant.")}</p><button class="builder-btn" onclick="location.reload()">Réessayer</button></div>`;
  }
});
