const modeButtons = [...document.querySelectorAll("[data-exam-mode]")];
const classicHero = document.getElementById("examClassicHero");
const classicBoard = document.getElementById("examClassicBoard");
const nativeBoard = document.getElementById("examNativeBoard");
const nativeStatus = document.getElementById("examNativeStatus");
const nativeList = document.getElementById("examNativeList");
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
  if (loaded) return;
  loaded = true;
  nativeStatus.hidden = false;
  nativeStatus.textContent = "Chargement de l’Examen 2...";
  try {
    const user = await waitForUser();
    const token = await user.getIdToken(false);
    const response = await fetch("/api/access/session?prof=exam-builder", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Chargement impossible.");
    const exams = Array.isArray(payload.exams) ? payload.exams : [];
    nativeStatus.hidden = exams.length > 0;
    nativeStatus.textContent = exams.length ? "" : "Aucun Examen 2 n’a encore été créé.";
    nativeList.innerHTML = exams.map(exam => `
      <article class="exam-native-card">
        <header><div><h3>${escapeHtml(exam.title || "Sans titre")}</h3><p>${escapeHtml(exam.description || "Examen créé directement sur le site.")}</p></div><b>${exam.status === "published" ? "Publié" : exam.status === "archived" ? "Archivé" : "Brouillon"}</b></header>
        <footer><span>${Number(exam.questionCount || 0)} question(s) · ${Number(exam.maxScore || 0)} points · ${escapeHtml(formatDate(exam.updatedAt))}</span><a href="prof-exam-builder.html">Modifier</a></footer>
      </article>
    `).join("");
  } catch (error) {
    loaded = false;
    nativeStatus.hidden = false;
    nativeStatus.textContent = error.message || "Impossible de charger l’Examen 2.";
  }
}

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
