const modeButtons = [...document.querySelectorAll("[data-exam-mode]")];
const classicHero = document.getElementById("examClassicHero");
const classicBoard = document.getElementById("examClassicBoard");
const nativeBoard = document.getElementById("examNativeBoard");
const nativeStatus = document.getElementById("examNativeStatus");
const nativeList = document.getElementById("examNativeList");
const resultsList = document.getElementById("examNativeResults");
const resultsStatus = document.getElementById("examNativeResultsStatus");
let loaded = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return "Date inconnue";
  }
}

async function waitForUser() {
  if (window.currentProfUser?.getIdToken) return window.currentProfUser;
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (window.currentProfUser?.getIdToken) {
        window.clearInterval(timer);
        resolve(window.currentProfUser);
      } else if (Date.now() - started > 10_000) {
        window.clearInterval(timer);
        reject(new Error("Session professeur indisponible."));
      }
    }, 120);
  });
}

async function loadNativeExams() {
  loaded = true;
  nativeStatus.hidden = false;
  nativeStatus.textContent = "Chargement de l’Examen 2...";
  resultsStatus.textContent = "Chargement des copies…";
  try {
    const user = await waitForUser();
    const token = await user.getIdToken(false);
    const headers = { Authorization: `Bearer ${token}` };
    const [examResponse, resultsResponse] = await Promise.all([
      fetch("/api/access/session?prof=exam-builder", { headers, cache: "no-store" }),
      fetch("/api/access/session?prof=exam-v2-results", { headers, cache: "no-store" })
    ]);
    const payload = await examResponse.json().catch(() => ({}));
    const resultPayload = await resultsResponse.json().catch(() => ({}));
    if (!examResponse.ok) throw new Error(payload.error || "Chargement impossible.");
    if (!resultsResponse.ok) throw new Error(resultPayload.error || "Chargement des copies impossible.");
    const exams = Array.isArray(payload.exams) ? payload.exams : [];
    const results = Array.isArray(resultPayload.results) ? resultPayload.results : [];
    nativeStatus.hidden = exams.length > 0;
    nativeStatus.textContent = exams.length ? "" : "Aucun Examen 2 n’a encore été créé.";
    nativeList.innerHTML = exams.map(exam => `
      <article class="exam-native-card">
        <header><div><h3>${escapeHtml(exam.title || "Sans titre")}</h3><p>${escapeHtml(exam.description || "Examen créé directement sur le site.")}</p></div><b>${exam.status === "published" ? "Publié" : exam.status === "archived" ? "Archivé" : "Brouillon"}</b></header>
        <footer><span>${Number(exam.questionCount || 0)} question(s) · ${Number(exam.maxScore || 0)} points · ${escapeHtml(formatDate(exam.updatedAt))}</span><a href="prof-exam-builder.html">Modifier</a></footer>
      </article>
    `).join("");
    resultsStatus.textContent = results.length ? `${results.length} copie(s) enregistrée(s).` : "Aucune copie reçue pour le moment.";
    resultsList.innerHTML = results.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""))).map(renderResult).join("");
  } catch (error) {
    loaded = false;
    nativeStatus.hidden = false;
    nativeStatus.textContent = error.message || "Impossible de charger l’Examen 2.";
    resultsStatus.textContent = "";
  }
}

function renderResult(result) {
  const snapshots = Array.isArray(result.questionSnapshots) ? result.questionSnapshots : [];
  const answerText = value => Array.isArray(value) ? value.join(" · ") : String(value || "Sans réponse");
  return `<article class="exam-native-result" data-native-result="${escapeHtml(result.id)}">
    <header><div><span>${escapeHtml(result.examTitle || "Examen 2")}</span><h4>${escapeHtml(result.studentName || `${result.firstName || ""} ${result.lastName || ""}`)}</h4><small>ID ${escapeHtml(result.idUnique || "")} · ${escapeHtml(formatDate(result.submittedAt))}</small></div>
      <div class="exam-native-grade"><strong>${Number(result.totalScore || 0)} / ${Number(result.maxScore || 0)}</strong><span>${result.status === "approved" ? "Validé" : result.status === "rejected" ? "Refusé" : "À corriger"}</span></div></header>
    <p class="exam-native-bonuses">Questions : ${Number(result.baseScore || 0)} · Custom : +${Number(result.customBonus || 0)} · Stage : +${Number(result.stageBonus || 0)}${result.bonusPending ? " · Bonus en attente de synchronisation" : ""}</p>
    <div class="exam-native-answer-list">${snapshots.map((question, index) => {
      const written = ["short", "long"].includes(question.type);
      const score = result.manualScores?.[question.id];
      return `<div class="exam-native-answer"><div><b>${index + 1}. ${escapeHtml(question.title)}</b><p>${escapeHtml(answerText(result.answers?.[question.id]))}</p></div>
        ${written ? `<label>Note / ${Number(question.points || 0)}<input type="number" min="0" max="${Number(question.points || 0)}" step="0.01" value="${score === undefined ? "" : Number(score)}" data-native-score="${escapeHtml(question.id)}" placeholder="—"></label>
          <button type="button" data-save-native-score="${escapeHtml(question.id)}">Enregistrer</button>`
          : `<strong>${Number(result.fieldScores?.[question.id] || 0)} / ${Number(question.points || 0)}</strong>`}</div>`;
    }).join("")}</div>
  </article>`;
}

resultsList?.addEventListener("click", async event => {
  const button = event.target.closest("[data-save-native-score]");
  if (!button || button.disabled) return;
  const card = button.closest("[data-native-result]");
  const questionId = button.dataset.saveNativeScore;
  const input = [...card.querySelectorAll("[data-native-score]")].find(field => field.dataset.nativeScore === questionId);
  if (!input || input.value === "" || !input.checkValidity()) {
    resultsStatus.textContent = "Entre une note comprise entre 0 et le maximum indiqué.";
    return;
  }
  button.disabled = true;
  resultsStatus.textContent = "Enregistrement de la note…";
  try {
    const user = await waitForUser();
    const token = await user.getIdToken(false);
    const response = await fetch("/api/access/session?prof=exam-v2-results", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: card.dataset.nativeResult, questionId, score: Number(input.value) }),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Note impossible à enregistrer.");
    card.outerHTML = renderResult(payload.result);
    resultsStatus.textContent = "Note enregistrée et total recalculé.";
  } catch (error) {
    button.disabled = false;
    resultsStatus.textContent = error.message || "Enregistrement impossible.";
  }
});

document.getElementById("examNativeRefresh")?.addEventListener("click", () => void loadNativeExams());

function selectMode(mode) {
  const native = mode === "native";
  classicHero.hidden = native;
  classicBoard.hidden = native;
  nativeBoard.hidden = !native;
  modeButtons.forEach(button => {
    const active = button.dataset.examMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (native) void loadNativeExams();
}

modeButtons.forEach(button => button.addEventListener("click", () => selectMode(button.dataset.examMode)));

if (new URLSearchParams(window.location.search).get("exam") === "2") selectMode("native");
