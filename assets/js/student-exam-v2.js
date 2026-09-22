const endpoint = "/api/access/session?student=exam-v2";
const status = document.getElementById("studentExamStatus");
const list = document.getElementById("studentExamList");
const panel = document.getElementById("studentExamPanel");
const content = document.getElementById("studentExamContent");
let activeExam = null;
let sending = false;

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function setStatus(message, tone = "") {
  status.textContent = message;
  status.dataset.tone = tone;
}

async function request(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Action impossible (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function questionInput(question, index) {
  const key = escapeHtml(question.id);
  if (question.type === "short") return `<input name="answer-${key}" maxlength="500" ${question.required ? "required" : ""} placeholder="Ta réponse">`;
  if (question.type === "long") return `<textarea name="answer-${key}" maxlength="3000" rows="5" ${question.required ? "required" : ""} placeholder="Ta réponse"></textarea>`;
  const choices = question.type === "true_false" ? ["true", "false"] : question.options;
  const type = question.type === "multiple" ? "checkbox" : "radio";
  return `<div class="student-exam-choices">${choices.map(choice => `
    <label><input type="${type}" name="answer-${key}" value="${escapeHtml(choice)}"><span>${escapeHtml(choice === "true" && question.type === "true_false" ? "Vrai" : choice === "false" && question.type === "true_false" ? "Faux" : choice)}</span></label>
  `).join("")}</div>`;
}

function renderExam(exam) {
  activeExam = exam;
  list.hidden = true;
  panel.hidden = false;
  setStatus("");
  content.innerHTML = `
    <div class="student-exam-intro"><p>EXAMEN PUBLIÉ</p><h2>${escapeHtml(exam.title)}</h2><span>${escapeHtml(exam.description || "")}</span>
      <div class="student-exam-metrics"><b>${exam.questions.length} questions</b><b>${exam.maxScore} points</b>${exam.durationMinutes ? `<b>${exam.durationMinutes} minutes</b>` : ""}</div>
      ${exam.instructions ? `<div class="student-exam-instructions"><strong>Consignes</strong><p>${escapeHtml(exam.instructions)}</p></div>` : ""}
    </div>
    <form id="studentExamForm" novalidate>
      <fieldset class="student-exam-identity"><legend>Identité obligatoire</legend>
        <p>Ces informations rattachent la copie à ton dossier dans l’effectif.</p>
        <div><label>Prénom<input name="firstName" maxlength="80" autocomplete="given-name" required></label>
          <label>Nom<input name="lastName" maxlength="80" autocomplete="family-name" required></label>
          <label>ID unique<input name="idUnique" maxlength="80" autocomplete="off" required></label></div>
      </fieldset>
      ${exam.questions.map((question, index) => `<fieldset class="student-exam-question" data-question-id="${escapeHtml(question.id)}">
        <legend><span>${index + 1}</span> ${escapeHtml(question.title)} ${question.required ? "*" : ""}</legend>
        ${question.description ? `<p>${escapeHtml(question.description)}</p>` : ""}
        ${question.image ? `<img src="${question.image}" alt="Illustration de la question ${index + 1}">` : ""}
        ${questionInput(question, index)}
        <small>${Number(question.points || 0)} point(s)</small>
      </fieldset>`).join("")}
      <div class="student-exam-bonus"><strong>Bonus automatiques · 2 points maximum</strong><span>Custom approuvé +1 · Stage validé +1. Le calcul se fait après l’envoi de la copie.</span></div>
      <div class="student-exam-submit"><p>Une seule copie par examen et par cursus. Relis tes réponses avant d’envoyer.</p><button type="submit">Envoyer ma copie</button></div>
    </form>`;
  content.querySelector("#studentExamForm")?.addEventListener("submit", submitExam);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function collectAnswers(form, exam) {
  const answers = {};
  for (const question of exam.questions) {
    const controls = [...form.elements].filter(control => control.name === `answer-${question.id}`);
    const answer = question.type === "multiple"
      ? controls.filter(control => control.checked).map(control => control.value)
      : ["single", "true_false"].includes(question.type)
        ? controls.find(control => control.checked)?.value || ""
        : controls[0]?.value.trim() || "";
    if (question.required && (Array.isArray(answer) ? !answer.length : !answer)) {
      throw new Error(`Réponds à la question ${exam.questions.indexOf(question) + 1}.`);
    }
    answers[question.id] = answer;
  }
  return answers;
}

async function submitExam(event) {
  event.preventDefault();
  if (sending || !activeExam) return;
  const form = event.currentTarget;
  try {
    if (!form.reportValidity()) return;
    const payload = {
      examId: activeExam.id,
      firstName: form.elements.firstName.value.trim(),
      lastName: form.elements.lastName.value.trim(),
      idUnique: form.elements.idUnique.value.trim(),
      answers: collectAnswers(form, activeExam)
    };
    sending = true;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    button.textContent = "Envoi en cours…";
    setStatus("Envoi de ta copie…");
    const data = await request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    content.innerHTML = `<div class="student-exam-receipt"><span>✓</span><h2>Copie envoyée</h2><p>${escapeHtml(activeExam.title)} a été enregistré pour ${escapeHtml(payload.firstName)} ${escapeHtml(payload.lastName)}.</p>
      <p>${data.result?.status === "pending" ? "La note finale apparaîtra après correction des réponses écrites et calcul des bonus." : `Résultat : ${Number(data.result?.totalScore || 0)} / ${Number(data.result?.maxScore || 0)}.`}</p>
      <a href="../eleve.html">Revenir à l’espace élève</a></div>`;
    setStatus("Copie enregistrée.", "ok");
  } catch (error) {
    setStatus(error.message || "Envoi impossible.", "error");
    const button = form.querySelector("button[type='submit']");
    if (button) { button.disabled = false; button.textContent = "Envoyer ma copie"; }
  } finally { sending = false; }
}

async function loadExams() {
  setStatus("Chargement des examens…");
  try {
    const { exams } = await request(endpoint);
    if (!Array.isArray(exams) || !exams.length) {
      list.innerHTML = "<p class='student-exam-empty'>Aucun examen publié pour le moment.</p>";
      setStatus("");
      return;
    }
    list.innerHTML = exams.map(exam => `<button type="button" data-exam-id="${escapeHtml(exam.id)}"><span>EXAMEN PUBLIÉ</span><strong>${escapeHtml(exam.title)}</strong><small>${escapeHtml(exam.description || "Clique pour ouvrir le formulaire.")}</small><b>${Number(exam.questionCount || 0)} questions · ${Number(exam.maxScore || 0)} points →</b></button>`).join("");
    setStatus("");
  } catch (error) {
    if (error.status === 423) {
      list.innerHTML = "<p class='student-exam-empty'>L’Examen 2 est verrouillé pour le moment. Réessaie quand un professeur l’aura ouvert.</p>";
    }
    setStatus(error.message || "Chargement impossible.", "error");
  }
}

list.addEventListener("click", async event => {
  const button = event.target.closest("[data-exam-id]");
  if (!button) return;
  button.disabled = true;
  setStatus("Ouverture de l’examen…");
  try {
    const { exam } = await request(`${endpoint}&id=${encodeURIComponent(button.dataset.examId)}`);
    renderExam(exam);
  } catch (error) {
    button.disabled = false;
    setStatus(error.message || "Examen indisponible.", "error");
  }
});

document.getElementById("studentExamListBack")?.addEventListener("click", () => {
  panel.hidden = true;
  list.hidden = false;
  activeExam = null;
  setStatus("");
});

const accessTimestamp = Number(sessionStorage.getItem("universityStudentAccess") || 0);
if (!accessTimestamp || Date.now() - accessTimestamp > 8 * 60 * 60 * 1000) {
  window.location.replace("../index.html");
} else {
  void loadExams();
}
