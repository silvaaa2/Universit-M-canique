const EXAM_DISPLAY_MAX_POINTS = 50;
const EXAM_PASS_POINTS = 40;
const STATUS_COLLECTION = "examAnswerStatuses";

const DEFAULT_QUESTION_POINTS = {
  "Prénom / Nom (RP)": 0,
  "Prénom - Nom (RP)": 0,
  "ID Unique": 2,
  "ID": 2,
  "Pourquoi voulez vous devenir mécano ?": 1,
  "Quelles sont les qualités d'un mécano pour vous ? (Citez en 6)": 6,
  "Citez 2 services que peut vendre un mécano.": 2,
  "Quel véhicule personnel un mécanicien peut-il utiliser": 3,
  "Citez 4 pièces de carrosserie": 4,
  "Citez 4 pièces de carrosserie (Pas répétée)": 4,
  "Quels sont les différents garages": 7,
  "Comme appelle t'on ce qui est montré sur l'image ?": 1,
  "Quel est la procédure d’une réparation au garage ?": 4,
  "Quel est la procédure d'une réparation au garage ?": 4,
  "Indiquez tout ce qui ne va pas sur cette image": 5,
  "Vous êtes en custom pour une peinture et vous avez changé la couleur secondaire, mais elle n’est pas visible. Que faites vous ?": 3,
  "Vous êtes en custom pour une peinture et vous avez changé la couleur secondaire, mais elle n'est pas visible. Que faites vous ?": 3,
  "Pouvez-vous retirer une FP (Full Perf) lors d'une custom ? (Justifiez)": 3,
  "Dans quelles situations un mécanicien est autorisé à mettre un véhicule en fourrière": 4,
  "Les 3 métiers les plus important": 3,
  "Vous arrivez sur un dépannage et un mécano de la concurrence est déjà entrain de réparer le véhicule. Que faites-vous par rapport au client ?": 4,
  "Vous arrivez sur un dépannage et un mécano de la concurrence est déjà en train de réparer le véhicule. Que faites-vous par rapport au client ?": 4,
  "Vous êtes en poste avec plusieurs mécaniciens. Quelles sont les règles à respecter pour que tout se passe bien entre mécaniciens ?": 3,
  "Quels sont les étapes pour changer un pneu ?": 4,
  "Citez 3 Outils de mécanique": 3,
  "Un client arrive masqué au garage pour une full perf mais il lui manque une portière . Que faites-vous ?": 4,
  "Un client arrive masqué au garage pour une full perf mais il lui manque une portière. Que faites-vous ?": 4
};

const recordsCache = new Map();
let patchTimer = null;
let saveTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
}

function normalizeQuestion(value) {
  return normalizeHeader(value)
    .replace(/[’]/g, "'")
    .replace(/[\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function getQuestionPointsMap() {
  return {
    ...DEFAULT_QUESTION_POINTS,
    ...(window.__examResponsesSettings?.questionPoints || {})
  };
}

function getQuestionPoints(label) {
  const normalizedLabel = normalizeQuestion(label);
  const pointsMap = getQuestionPointsMap();

  const foundKey = Object.keys(pointsMap).find(key => normalizeQuestion(key) === normalizedLabel);
  if (!foundKey) return null;

  const points = Number(pointsMap[foundKey]);
  return Number.isFinite(points) ? Math.max(0, points) : null;
}

function getLineLabel(line) {
  return line.querySelector(".exam-line-content span")?.textContent?.trim() || "";
}

function buildFallbackFieldKey(label) {
  return `firebase__${normalizeQuestion(label)}`;
}

function getScoreFieldKey(line, label) {
  const currentControl = line.querySelector("[data-score-control]");
  return currentControl?.dataset.fieldKey || buildFallbackFieldKey(label);
}

function getRecordForCard(card) {
  return recordsCache.get(card.dataset.answerKey || "") || {};
}

function setRecordForCard(card, record) {
  const key = card.dataset.answerKey || "";
  if (key) recordsCache.set(key, record || {});
}

function renderScoreControl(fieldKey, maxPoints, currentScore) {
  const safeCurrent = Math.max(0, Math.min(Number(currentScore || 0), maxPoints));

  if (maxPoints === 0) {
    return `
      <div class="exam-score-control exam-score-noted">
        <span>Non noté</span>
      </div>
    `;
  }

  return `
    <div
      class="exam-score-control"
      data-score-control
      data-firebase-score-control
      data-field-key="${escapeHtml(fieldKey)}"
      data-max-points="${escapeHtml(maxPoints)}"
    >
      <input
        type="number"
        min="0"
        max="${escapeHtml(maxPoints)}"
        step="1"
        value="${escapeHtml(safeCurrent)}"
        data-score-input
      >
      <strong>/ ${escapeHtml(maxPoints)}</strong>
    </div>
  `;
}

function patchScoreControl(line, card) {
  const label = getLineLabel(line);
  const maxPoints = getQuestionPoints(label);

  if (maxPoints === null || maxPoints === undefined) return;

  const scoreCell = line.querySelector(".exam-line-score");
  if (!scoreCell) return;

  const fieldKey = getScoreFieldKey(line, label);
  const record = getRecordForCard(card);
  const currentScore = Number(record.fieldScores?.[fieldKey] || 0);
  const currentControl = scoreCell.querySelector("[data-score-control]");

  if (currentControl) {
    const input = currentControl.querySelector("[data-score-input]");
    const labelMax = currentControl.querySelector("strong");
    const safeScore = Math.max(0, Math.min(Number(input?.value || currentScore || 0), maxPoints));

    currentControl.dataset.maxPoints = String(maxPoints);
    if (input) {
      input.max = String(maxPoints);
      input.value = String(safeScore);
    }
    if (labelMax) labelMax.textContent = `/ ${maxPoints}`;
    return;
  }

  if (scoreCell.querySelector(".exam-score-missing")) {
    scoreCell.innerHTML = renderScoreControl(fieldKey, maxPoints, currentScore);
  }
}

function collectFieldScores(card) {
  const fieldScores = {};

  card.querySelectorAll("[data-score-control]").forEach(control => {
    const fieldKey = control.dataset.fieldKey;
    const maxPoints = Number(control.dataset.maxPoints || 0);
    const input = control.querySelector("[data-score-input]");

    if (!fieldKey || !input) return;

    const value = Math.max(0, Math.min(Number(input.value || 0), maxPoints));
    fieldScores[fieldKey] = Number.isFinite(value) ? value : 0;
    input.value = String(fieldScores[fieldKey]);
  });

  return fieldScores;
}

function calculateTotal(fieldScores) {
  const total = Object.values(fieldScores || {}).reduce((sum, value) => {
    const points = Number(value || 0);
    return Number.isFinite(points) ? sum + Math.max(0, points) : sum;
  }, 0);

  return Math.min(total, EXAM_DISPLAY_MAX_POINTS);
}

function getStatus(totalScore, hasScoring) {
  if (!hasScoring) return "pending";
  return totalScore >= EXAM_PASS_POINTS ? "approved" : "rejected";
}

function getStatusMeta(status) {
  switch (status) {
    case "approved":
      return { shortLabel: "✔ Approuvé", className: "approved" };
    case "rejected":
      return { shortLabel: "✖ Refusé", className: "rejected" };
    default:
      return { shortLabel: "• En attente", className: "pending" };
  }
}

function updateCardUi(card, record) {
  const totalScore = calculateTotal(record.fieldScores);
  const hasScoring = Boolean(record.hasScoring || totalScore > 0);
  const status = getStatus(totalScore, hasScoring);
  const statusMeta = getStatusMeta(status);
  const scoreBadge = card.querySelector("[data-total-score-badge]");
  const statusBadge = card.querySelector("[data-status-badge]");
  const copyButton = card.querySelector("[data-copy-result]");

  record.totalScore = totalScore;
  record.hasScoring = hasScoring;
  record.status = status;

  card.dataset.status = status;
  card.classList.remove("status-approved", "status-rejected", "status-pending");
  card.classList.add(`status-${statusMeta.className}`);

  if (scoreBadge) {
    scoreBadge.classList.remove("score-approved", "score-rejected", "score-pending");
    scoreBadge.classList.add(hasScoring ? `score-${statusMeta.className}` : "score-pending");
    scoreBadge.textContent = `${totalScore} / ${EXAM_DISPLAY_MAX_POINTS}`;
  }

  if (statusBadge) {
    statusBadge.className = `student-status-badge status-${statusMeta.className}`;
    statusBadge.textContent = statusMeta.shortLabel;
  }

  if (copyButton) {
    copyButton.dataset.copyScore = String(totalScore);
  }

  updateStats();
}

function updateStats() {
  const visibleCards = Array.from(document.querySelectorAll("[data-answer-card]"))
    .filter(card => card.style.display !== "none");

  const total = visibleCards.length;
  const approved = visibleCards.filter(card => card.dataset.status === "approved").length;
  const rejected = visibleCards.filter(card => card.dataset.status === "rejected").length;
  const pending = visibleCards.filter(card => card.dataset.status === "pending").length;
  const scores = visibleCards.map(card => {
    const raw = card.querySelector("[data-total-score-badge]")?.textContent || "0";
    const value = Number(String(raw).split("/")[0].trim());
    return Number.isFinite(value) ? value : 0;
  });
  const average = scores.length
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
    : 0;

  const totalEl = document.querySelector("[data-stat-total]");
  const approvedEl = document.querySelector("[data-stat-approved]");
  const rejectedEl = document.querySelector("[data-stat-rejected]");
  const pendingEl = document.querySelector("[data-stat-pending]");
  const averageEl = document.querySelector("[data-stat-average]");

  if (totalEl) totalEl.textContent = String(total);
  if (approvedEl) approvedEl.textContent = String(approved);
  if (rejectedEl) rejectedEl.textContent = String(rejected);
  if (pendingEl) pendingEl.textContent = String(pending);
  if (averageEl) averageEl.textContent = `${average} / ${EXAM_DISPLAY_MAX_POINTS}`;
}

async function loadRecord(card) {
  const answerKey = card.dataset.answerKey || "";
  if (!answerKey || recordsCache.has(answerKey)) return getRecordForCard(card);

  try {
    const firebase = window.profFirebase;
    const snap = await firebase.getDoc(firebase.doc(firebase.db, STATUS_COLLECTION, encodeURIComponent(answerKey)));
    const record = snap.exists() ? snap.data() : {};
    setRecordForCard(card, record);
    return record;
  } catch (error) {
    console.warn("Barème examen indisponible pour une copie :", error);
    setRecordForCard(card, {});
    return {};
  }
}

async function saveRecord(card, record) {
  const firebase = window.profFirebase;
  const answerKey = card.dataset.answerKey || "";
  const sheetId = card.dataset.sheetId || "";

  if (!firebase?.db || !answerKey || !sheetId) return;

  await firebase.setDoc(firebase.doc(firebase.db, STATUS_COLLECTION, encodeURIComponent(answerKey)), {
    answerKey,
    sheetId,
    studentName: card.dataset.studentName || "",
    idUnique: card.dataset.idUnique || "",
    normalizedIdUnique: card.dataset.normalizedIdUnique || "",
    status: record.status || "pending",
    fieldScores: record.fieldScores || {},
    totalScore: Number(record.totalScore || 0),
    maxScore: EXAM_DISPLAY_MAX_POINTS,
    hasScoring: Boolean(record.hasScoring),
    updatedBy: window.currentProfUser?.email || "professeur inconnu",
    updatedAt: firebase.serverTimestamp()
  }, { merge: true });
}

async function patchCard(card) {
  const record = await loadRecord(card);

  card.querySelectorAll(".exam-line").forEach(line => {
    patchScoreControl(line, card);
  });

  record.fieldScores = {
    ...(record.fieldScores || {}),
    ...collectFieldScores(card)
  };

  updateCardUi(card, record);
  setRecordForCard(card, record);
}

function schedulePatch() {
  clearTimeout(patchTimer);
  patchTimer = setTimeout(async () => {
    const cards = Array.from(document.querySelectorAll("[data-answer-card]"));

    for (const card of cards) {
      await patchCard(card);
    }
  }, 160);
}

function scheduleSave(card) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const record = getRecordForCard(card);
    record.fieldScores = collectFieldScores(card);
    updateCardUi(card, record);
    setRecordForCard(card, record);

    try {
      await saveRecord(card, record);
    } catch (error) {
      console.error("Erreur sauvegarde barème Firebase :", error);
      alert("Impossible de sauvegarder les points dans Firebase.");
    }
  }, 80);
}

function bindScoreInputPatch() {
  document.addEventListener("input", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches("[data-score-input]")) return;

    const card = target.closest("[data-answer-card]");
    if (!card) return;

    scheduleSave(card);
  }, true);
}

function startExamGradingSettings() {
  if (!window.profFirebase?.db) return;

  bindScoreInputPatch();

  const observer = new MutationObserver(schedulePatch);
  observer.observe(document.body, { childList: true, subtree: true });

  schedulePatch();
}

if (window.profFirebase?.db) {
  startExamGradingSettings();
} else {
  window.addEventListener("profFirebaseReady", startExamGradingSettings, { once: true });
}
