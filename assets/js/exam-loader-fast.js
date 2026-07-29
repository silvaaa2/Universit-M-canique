const STATUS_COLLECTION = "examAnswerStatuses";
const EXAM_DISPLAY_MAX_POINTS = 50;
const EXAM_PASS_POINTS = 40;
const DEFAULT_EXAM_SHEET_ID = "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY";
const DEFAULT_EXAM_GID = "282279229";
const DEFAULT_EXAM_LABEL = "Réponses formulaire";
const EXAM_FETCH_TIMEOUT_MS = 15000;
const EXAM_FIREBASE_TIMEOUT_MS = 6000;

const IDENTITY_POINTS = {
  "Prénom / Nom (RP)": 0,
  "Prénom - Nom (RP)": 0,
  "ID Unique": 2,
  "ID": 2
};

const settings = window.__examResponsesSettings || {};
const SHEET = {
  id: "exam-form-1",
  label: settings.label || DEFAULT_EXAM_LABEL,
  spreadsheetId: settings.spreadsheetId || DEFAULT_EXAM_SHEET_ID,
  gid: String(settings.gid || DEFAULT_EXAM_GID),
  questionPoints: settings.questionPoints || {}
};

const sheetTabs = document.getElementById("sheetTabs");
const sheetStatus = document.getElementById("sheetStatus");
const sheetContent = document.getElementById("sheetContent");
const minimizeAnswersBtn = document.getElementById("minimizeAnswersBtn");
const restoreAnswersBtn = document.getElementById("restoreAnswersBtn");
const answersMiniBar = document.getElementById("answersMiniBar");
const answersBody = document.getElementById("answersBody");

let answerRecords = {};
let currentSearch = "";
let currentFilter = "all";

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
    .replace(/[\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ");
}

function normalizeQuestion(value) {
  return normalizeHeader(value)
    .replace(/[\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function normalizeIdUnique(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function rejectAfter(label, timeoutMs) {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(`${label} a pris trop de temps.`)), timeoutMs);
  });
}

function withTimeout(promise, label, timeoutMs) {
  return Promise.race([Promise.resolve(promise), rejectAfter(label, timeoutMs)]);
}

function getQuestionPointsMap() {
  return {
    ...IDENTITY_POINTS,
    ...(SHEET.questionPoints || {})
  };
}

function getQuestionPoints(label) {
  const normalizedLabel = normalizeQuestion(label);
  const pointsMap = getQuestionPointsMap();
  const foundKey = Object.keys(pointsMap).find(key => normalizeQuestion(key) === normalizedLabel);

  if (!foundKey) return null;
  return Number(pointsMap[foundKey]);
}

function buildFieldScoreKey(field) {
  return `${field.index}__${normalizeQuestion(field.label)}`;
}

function getQuestionPointsFromFieldKey(fieldKey) {
  const normalizedFieldKey = String(fieldKey || "").split("__").slice(1).join("__");
  const pointsMap = getQuestionPointsMap();
  const foundKey = Object.keys(pointsMap).find(key => normalizeQuestion(key) === normalizedFieldKey);

  if (!foundKey) return null;
  return Number(pointsMap[foundKey]);
}

function calculateRealScore(fieldScores) {
  return Object.entries(fieldScores || {}).reduce((sum, [fieldKey, value]) => {
    const maxPoints = getQuestionPointsFromFieldKey(fieldKey);
    const number = Number(value || 0);

    if (Number.isNaN(number) || maxPoints === 0) return sum;
    if (maxPoints !== null && maxPoints !== undefined) return sum + Math.max(0, Math.min(number, maxPoints));
    return sum + Math.max(0, number);
  }, 0);
}

function calculateTotalScore(fieldScores) {
  return Math.min(calculateRealScore(fieldScores), EXAM_DISPLAY_MAX_POINTS);
}

function getAutoStatus(totalScore, hasScoring) {
  if (!hasScoring) return "pending";
  return totalScore >= EXAM_PASS_POINTS ? "approved" : "rejected";
}

function getStatusMeta(status) {
  switch (status) {
    case "approved":
      return { value: "approved", shortLabel: "Approuvé", className: "approved" };
    case "rejected":
      return { value: "rejected", shortLabel: "Refusé", className: "rejected" };
    default:
      return { value: "pending", shortLabel: "En attente", className: "pending" };
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i++;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(value);
      if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
  return rows;
}

function rowsToAnswers(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(header => String(header || "").trim());

  return rows.slice(1)
    .filter(row => row.some(cell => String(cell || "").trim() !== ""))
    .map(row => {
      const answer = { __orderedFields: [] };

      headers.forEach((header, index) => {
        if (!header) return;
        const value = row[index] || "";
        answer[header] = value;
        answer.__orderedFields.push({ label: header, value, index });
      });

      return answer;
    });
}

function getField(answer, possibleNames) {
  for (const name of possibleNames) {
    const found = Object.keys(answer).find(key => normalizeHeader(key) === normalizeHeader(name));
    if (found) return answer[found] || "";
  }

  return "";
}

function getStudentName(answer, index) {
  return getField(answer, [
    "Prénom / Nom (RP)",
    "Prénom - Nom (RP)",
    "Prénom / Nom",
    "Prénom - Nom",
    "Nom RP",
    "Nom",
    "Pseudo"
  ]) || answer.__orderedFields?.[3]?.value || `Copie ${index + 1}`;
}

function getIdentity(answer, index) {
  const studentName = getStudentName(answer, index);
  const idUnique = getField(answer, ["ID Unique", "ID"]);

  return {
    studentName,
    idUnique,
    normalizedIdUnique: normalizeIdUnique(idUnique)
  };
}

function buildAnswerKey(answer, index) {
  const horodateur = getField(answer, ["Horodateur", "Timestamp"]);
  const name = getStudentName(answer, index);
  const email = getField(answer, ["Adresse e-mail", "Email", "Adresse mail"]);
  return `${SHEET.id}__${index}__${horodateur}__${name}__${email}`;
}

function buildStatusDocId(answerKey) {
  return encodeURIComponent(answerKey);
}

function getDefaultRecord() {
  return {
    status: "pending",
    fieldScores: {},
    totalScore: 0,
    hasScoring: false,
    studentName: "",
    idUnique: "",
    normalizedIdUnique: ""
  };
}

function getRecord(answerKey) {
  return answerRecords[answerKey] || getDefaultRecord();
}

function syncRecord(record) {
  const totalScore = calculateTotalScore(record.fieldScores);
  const hasScoring = record.hasScoring || calculateRealScore(record.fieldScores) > 0;

  record.totalScore = totalScore;
  record.hasScoring = hasScoring;

  if (!record.manualStatus) {
    record.status = getAutoStatus(totalScore, hasScoring);
  }

  return record;
}

function getFirebase() {
  return window.profFirebase?.db ? window.profFirebase : null;
}

async function loadRecords() {
  const firebase = getFirebase();
  if (!firebase) return;

  try {
    const statusesRef = firebase.collection(firebase.db, STATUS_COLLECTION);
    const q = firebase.query(statusesRef, firebase.where("sheetId", "==", SHEET.id));
    const snap = await withTimeout(firebase.getDocs(q), "Lecture Firebase examens", EXAM_FIREBASE_TIMEOUT_MS);

    answerRecords = {};
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (!data.answerKey) return;

      answerRecords[data.answerKey] = {
        status: data.status || "pending",
        manualStatus: Boolean(data.manualStatus),
        fieldScores: data.fieldScores || {},
        totalScore: Number(data.totalScore || 0),
        hasScoring: Boolean(data.hasScoring),
        studentName: data.studentName || "",
        idUnique: data.idUnique || "",
        normalizedIdUnique: data.normalizedIdUnique || ""
      };
    });
  } catch (error) {
    console.warn("Firebase examens ignoré au chargement :", error);
    answerRecords = {};
  }
}

async function saveRecord(answerKey, record, identity) {
  const firebase = getFirebase();
  if (!firebase) throw new Error("Firebase indisponible.");

  const ref = firebase.doc(firebase.db, STATUS_COLLECTION, buildStatusDocId(answerKey));
  await withTimeout(firebase.setDoc(ref, {
    answerKey,
    sheetId: SHEET.id,
    studentName: identity.studentName || record.studentName || "",
    idUnique: identity.idUnique || record.idUnique || "",
    normalizedIdUnique: identity.normalizedIdUnique || record.normalizedIdUnique || "",
    status: record.status || "pending",
    manualStatus: Boolean(record.manualStatus),
    fieldScores: record.fieldScores || {},
    totalScore: Number(record.totalScore || 0),
    maxScore: EXAM_DISPLAY_MAX_POINTS,
    hasScoring: Boolean(record.hasScoring),
    updatedBy: window.currentProfUser?.email || "professeur inconnu",
    updatedAt: firebase.serverTimestamp()
  }, { merge: true }), "Sauvegarde Firebase examens", EXAM_FIREBASE_TIMEOUT_MS);
}

function buildCsvUrl() {
  return `https://docs.google.com/spreadsheets/d/${SHEET.spreadsheetId}/export?format=csv&gid=${SHEET.gid}`;
}

async function fetchCsv() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), EXAM_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(buildCsvUrl(), { signal: controller.signal });
    if (!response.ok) throw new Error(`Erreur Google Sheets : ${response.status}`);
    return await response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Google Sheets ne répond pas. Vérifie le lien, le GID et le partage.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function shouldDisplayField(field) {
  const label = normalizeHeader(field.label);
  if (!label) return false;

  return ![
    normalizeHeader("Horodateur"),
    normalizeHeader("Timestamp"),
    normalizeHeader("Adresse e-mail"),
    normalizeHeader("Email"),
    normalizeHeader("Adresse mail"),
    normalizeHeader("Score")
  ].includes(label);
}

function isLink(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function renderScoreBadge(totalScore, hasScoring) {
  if (!hasScoring) {
    return `<span class="student-score-badge score-pending" data-total-score-badge>0 / ${EXAM_DISPLAY_MAX_POINTS}</span>`;
  }

  const scoreClass = totalScore >= EXAM_PASS_POINTS ? "score-approved" : "score-rejected";
  return `<span class="student-score-badge ${scoreClass}" data-total-score-badge>${escapeHtml(totalScore)} / ${EXAM_DISPLAY_MAX_POINTS}</span>`;
}

function renderScoreControl(field, currentScore) {
  const maxPoints = getQuestionPoints(field.label);

  if (maxPoints === null || maxPoints === undefined || Number.isNaN(maxPoints)) {
    return `<div class="exam-score-control exam-score-missing"><span>Barème ?</span></div>`;
  }

  if (maxPoints === 0) {
    return `<div class="exam-score-control exam-score-noted"><span>Non noté</span></div>`;
  }

  const safeCurrent = Math.max(0, Math.min(Number(currentScore || 0), maxPoints));

  return `
    <div class="exam-score-control" data-score-control data-field-key="${escapeHtml(buildFieldScoreKey(field))}" data-max-points="${escapeHtml(maxPoints)}">
      <input type="number" min="0" max="${escapeHtml(maxPoints)}" step="1" value="${escapeHtml(safeCurrent)}" data-score-input>
      <strong>/ ${escapeHtml(maxPoints)}</strong>
    </div>
  `;
}

function renderExamLine(field, displayIndex, record) {
  const fieldKey = buildFieldScoreKey(field);
  const currentScore = record.fieldScores?.[fieldKey] || 0;
  const cleanValue = String(field.value || "").trim() || "Non renseigné";
  const valueHtml = isLink(cleanValue)
    ? `<a href="${escapeHtml(cleanValue)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien</a>`
    : `<strong>${escapeHtml(cleanValue)}</strong>`;

  return `
    <div class="exam-line">
      <div class="exam-line-number">${String(displayIndex + 1).padStart(2, "0")}</div>
      <div class="exam-line-content">
        <span>${escapeHtml(field.label)}</span>
        ${valueHtml}
      </div>
      <div class="exam-line-score">
        ${renderScoreControl(field, currentScore)}
      </div>
    </div>
  `;
}

function renderAnswerCard(answer, index) {
  const identity = getIdentity(answer, index);
  const answerKey = buildAnswerKey(answer, index);
  const record = syncRecord(getRecord(answerKey));
  const statusMeta = getStatusMeta(record.status || "pending");
  const fieldsHtml = (answer.__orderedFields || [])
    .filter(shouldDisplayField)
    .map((field, fieldIndex) => renderExamLine(field, fieldIndex, record))
    .join("");

  return `
    <article class="student-answer-card collapsed status-${escapeHtml(statusMeta.className)}"
      data-answer-card
      data-answer-key="${escapeHtml(answerKey)}"
      data-sheet-id="${escapeHtml(SHEET.id)}"
      data-status="${escapeHtml(statusMeta.value)}"
      data-student-name="${escapeHtml(identity.studentName)}"
      data-id-unique="${escapeHtml(identity.idUnique)}"
      data-normalized-id-unique="${escapeHtml(identity.normalizedIdUnique)}">
      <div class="student-card-top">
        <button type="button" class="student-card-main student-card-open-zone" data-toggle-card>
          <p class="student-kicker">${escapeHtml(SHEET.label)} · Copie ${index + 1}</p>
          <h2>${escapeHtml(identity.studentName)}</h2>
        </button>

        <div class="student-tags">
          <span class="student-id-badge">${escapeHtml(identity.idUnique || "Copie")}</span>
          ${renderScoreBadge(record.totalScore, record.hasScoring)}
          <span class="student-status-badge status-${escapeHtml(statusMeta.className)}" data-status-badge>${escapeHtml(statusMeta.shortLabel)}</span>
          <button type="button" class="copy-result-btn" data-copy-result data-copy-name="${escapeHtml(identity.studentName)}" data-copy-score="${escapeHtml(record.totalScore)}">Copier résultat</button>
          <button type="button" class="student-toggle-icon" data-toggle-card>+</button>
        </div>
      </div>

      <div class="student-card-body">
        <div class="student-status-actions">
          <button type="button" class="student-status-btn approve" data-set-status="approved">Approuver</button>
          <button type="button" class="student-status-btn reject" data-set-status="rejected">Refuser</button>
          <button type="button" class="student-status-btn pending" data-set-status="pending">En attente</button>
        </div>

        <section class="student-section exam-ordered-section">
          <div class="student-section-head"><h3>Correction de l'examen</h3></div>
          <div class="exam-lines-list">
            ${fieldsHtml || `<div class="student-empty">Aucune réponse trouvée.</div>`}
          </div>
        </section>
      </div>
    </article>
  `;
}

function setLoading() {
  if (!sheetStatus || !sheetContent) return;

  sheetStatus.hidden = false;
  sheetStatus.style.display = "flex";
  sheetStatus.innerHTML = `
    <div class="inline-loader"></div>
    <p>Chargement des examens ${escapeHtml(SHEET.label)}...</p>
  `;
  sheetContent.hidden = true;
  sheetContent.innerHTML = "";
}

function setError(message) {
  if (!sheetStatus || !sheetContent) return;

  sheetStatus.hidden = false;
  sheetStatus.style.display = "block";
  sheetStatus.innerHTML = `
    <div class="inline-error-box">
      <h4>Impossible de charger les examens</h4>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="btn secondary" onclick="window.location.reload()">Recharger</button>
    </div>
  `;
  sheetContent.hidden = true;
}

function normalizeSearchValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getAllCards() {
  return Array.from(document.querySelectorAll("[data-answer-card]"));
}

function getVisibleCards() {
  return getAllCards().filter(card => card.style.display !== "none");
}

function getScoreFromCard(card) {
  const scoreText = card.querySelector("[data-total-score-badge]")?.textContent || "0";
  const number = Number(String(scoreText).split("/")[0].trim());
  return Number.isNaN(number) ? 0 : number;
}

function updateStats() {
  const visibleCards = getVisibleCards();
  const scores = visibleCards.map(getScoreFromCard);
  const average = scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : 0;

  const values = {
    "[data-stat-total]": visibleCards.length,
    "[data-stat-approved]": visibleCards.filter(card => card.dataset.status === "approved").length,
    "[data-stat-rejected]": visibleCards.filter(card => card.dataset.status === "rejected").length,
    "[data-stat-pending]": visibleCards.filter(card => card.dataset.status === "pending").length,
    "[data-stat-average]": `${average} / ${EXAM_DISPLAY_MAX_POINTS}`
  };

  Object.entries(values).forEach(([selector, value]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = String(value);
  });

  const empty = document.querySelector("[data-exam-empty-filter]");
  if (empty) empty.hidden = visibleCards.length > 0;
}

function applyTools() {
  const search = normalizeSearchValue(currentSearch);
  const filter = currentFilter;

  getAllCards().forEach(card => {
    const name = normalizeSearchValue(card.dataset.studentName || "");
    const idUnique = normalizeSearchValue(card.dataset.idUnique || "");
    const status = card.dataset.status || "pending";
    const matchSearch = !search || name.includes(search) || idUnique.includes(search);
    const matchFilter = filter === "all" || status === filter;
    card.style.display = matchSearch && matchFilter ? "" : "none";
  });

  updateStats();
}

function updateCardStatus(card, status) {
  const meta = getStatusMeta(status);
  card.dataset.status = meta.value;
  card.classList.remove("status-approved", "status-rejected", "status-pending");
  card.classList.add(`status-${meta.className}`);

  const badge = card.querySelector("[data-status-badge]");
  if (badge) {
    badge.className = `student-status-badge status-${meta.className}`;
    badge.textContent = meta.shortLabel;
  }

  card.querySelectorAll("[data-set-status]").forEach(button => {
    button.classList.toggle("active", button.dataset.setStatus === meta.value);
  });

  applyTools();
}

function updateScoreUi(card, record) {
  syncRecord(record);

  const scoreBadge = card.querySelector("[data-total-score-badge]");
  if (scoreBadge) {
    scoreBadge.classList.remove("score-approved", "score-rejected", "score-pending");

    if (!record.hasScoring) {
      scoreBadge.classList.add("score-pending");
      scoreBadge.textContent = `0 / ${EXAM_DISPLAY_MAX_POINTS}`;
    } else if (record.totalScore >= EXAM_PASS_POINTS) {
      scoreBadge.classList.add("score-approved");
      scoreBadge.textContent = `${record.totalScore} / ${EXAM_DISPLAY_MAX_POINTS}`;
    } else {
      scoreBadge.classList.add("score-rejected");
      scoreBadge.textContent = `${record.totalScore} / ${EXAM_DISPLAY_MAX_POINTS}`;
    }
  }

  const copyButton = card.querySelector("[data-copy-result]");
  if (copyButton) copyButton.dataset.copyScore = String(record.totalScore || 0);
  updateCardStatus(card, record.status || "pending");
}

function getIdentityFromCard(card) {
  return {
    studentName: card.dataset.studentName || "",
    idUnique: card.dataset.idUnique || "",
    normalizedIdUnique: card.dataset.normalizedIdUnique || ""
  };
}

function bindCards() {
  document.querySelectorAll("[data-toggle-card]").forEach(button => {
    button.addEventListener("click", () => {
      const selected = button.closest("[data-answer-card]");
      if (!selected) return;
      const wasOpen = selected.classList.contains("is-open");

      getAllCards().forEach(card => {
        card.classList.add("collapsed");
        card.classList.remove("is-open");
        const icon = card.querySelector(".student-toggle-icon");
        if (icon) icon.textContent = "+";
      });

      if (!wasOpen) {
        selected.classList.remove("collapsed");
        selected.classList.add("is-open");
        const icon = selected.querySelector(".student-toggle-icon");
        if (icon) icon.textContent = "−";
      }
    });
  });

  document.querySelectorAll("[data-score-input]").forEach(input => {
    input.addEventListener("click", event => event.stopPropagation());
    input.addEventListener("keydown", event => event.stopPropagation());
    input.addEventListener("input", async () => {
      const control = input.closest("[data-score-control]");
      const card = input.closest("[data-answer-card]");
      if (!control || !card) return;

      const answerKey = card.dataset.answerKey;
      const fieldKey = control.dataset.fieldKey;
      const maxPoints = Number(control.dataset.maxPoints || 0);
      const identity = getIdentityFromCard(card);
      const record = getRecord(answerKey);

      let score = Number(input.value);
      if (Number.isNaN(score)) score = 0;
      score = Math.max(0, Math.min(score, maxPoints));
      input.value = String(score);

      record.fieldScores = { ...(record.fieldScores || {}), [fieldKey]: score };
      record.hasScoring = true;
      record.manualStatus = false;
      record.studentName = identity.studentName;
      record.idUnique = identity.idUnique;
      record.normalizedIdUnique = identity.normalizedIdUnique;
      answerRecords[answerKey] = record;

      updateScoreUi(card, record);

      try {
        await saveRecord(answerKey, record, identity);
      } catch (error) {
        console.warn("Sauvegarde score impossible :", error);
      }
    });
  });

  document.querySelectorAll("[data-set-status]").forEach(button => {
    button.addEventListener("click", async event => {
      event.stopPropagation();
      const card = button.closest("[data-answer-card]");
      if (!card) return;

      const answerKey = card.dataset.answerKey;
      const identity = getIdentityFromCard(card);
      const record = getRecord(answerKey);
      record.status = button.dataset.setStatus || "pending";
      record.manualStatus = true;
      record.studentName = identity.studentName;
      record.idUnique = identity.idUnique;
      record.normalizedIdUnique = identity.normalizedIdUnique;
      answerRecords[answerKey] = record;

      updateCardStatus(card, record.status);

      try {
        await saveRecord(answerKey, record, identity);
      } catch (error) {
        console.warn("Sauvegarde statut impossible :", error);
      }
    });
  });

  document.querySelectorAll("[data-copy-result]").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const text = `${button.dataset.copyName || "Élève"} ${button.dataset.copyScore || "0"}/${EXAM_DISPLAY_MAX_POINTS}`;

      try {
        await navigator.clipboard.writeText(text);
        const oldText = button.textContent;
        button.textContent = "Copié";
        window.setTimeout(() => { button.textContent = oldText; }, 1200);
      } catch (error) {
        alert(`Résultat à copier : ${text}`);
      }
    });
  });

  getAllCards().forEach(card => updateCardStatus(card, card.dataset.status || "pending"));
}

function bindTools() {
  const searchInput = document.querySelector("[data-exam-search]");
  const filterButtons = document.querySelectorAll("[data-exam-filter]");

  if (searchInput) {
    searchInput.value = currentSearch;
    searchInput.addEventListener("input", () => {
      currentSearch = searchInput.value;
      applyTools();
    });
  }

  filterButtons.forEach(button => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.examFilter || "all";
      filterButtons.forEach(item => item.classList.toggle("active", item.dataset.examFilter === currentFilter));
      applyTools();
    });
  });

  const copyAll = document.querySelector("[data-copy-all-results]");
  if (copyAll) {
    copyAll.addEventListener("click", async event => {
      const text = getVisibleCards().map(card => {
        const name = card.dataset.studentName || "Élève";
        const score = card.querySelector("[data-total-score-badge]")?.textContent?.replace(/\s+/g, " ").trim() || "0 / 50";
        return `${name} ${score}`;
      }).join("\n");

      if (!text.trim()) return;

      try {
        await navigator.clipboard.writeText(text);
      } catch (error) {
        alert(`Liste à copier :\n\n${text}`);
      }
    });
  }

  applyTools();
}

function bindMinimize() {
  if (minimizeAnswersBtn) {
    minimizeAnswersBtn.addEventListener("click", () => {
      const isMinimized = answersBody.hidden;
      answersBody.hidden = !isMinimized;
      answersMiniBar.hidden = isMinimized;
      minimizeAnswersBtn.textContent = isMinimized ? "−" : "+";
    });
  }

  if (restoreAnswersBtn) {
    restoreAnswersBtn.addEventListener("click", () => {
      answersBody.hidden = false;
      answersMiniBar.hidden = true;
      if (minimizeAnswersBtn) minimizeAnswersBtn.textContent = "−";
    });
  }
}

function renderAnswers(answers) {
  sheetStatus.hidden = true;
  sheetStatus.style.display = "none";
  sheetContent.hidden = false;
  sheetContent.innerHTML = `
    <div class="exam-dashboard-tools">
      <div class="exam-stats-grid">
        <div class="exam-stat-card"><span>Total copies</span><strong data-stat-total>0</strong></div>
        <div class="exam-stat-card approved"><span>Approuvés</span><strong data-stat-approved>0</strong></div>
        <div class="exam-stat-card rejected"><span>Refusés</span><strong data-stat-rejected>0</strong></div>
        <div class="exam-stat-card pending"><span>En attente</span><strong data-stat-pending>0</strong></div>
        <div class="exam-stat-card average"><span>Moyenne</span><strong data-stat-average>0 / ${EXAM_DISPLAY_MAX_POINTS}</strong></div>
      </div>

      <div class="exam-toolbar">
        <div class="exam-search-box">
          <span>Recherche</span>
          <input type="text" placeholder="Nom, prénom ou ID Unique..." data-exam-search>
        </div>

        <div class="exam-filter-buttons">
          <button type="button" data-exam-filter="all" class="active">Tous</button>
          <button type="button" data-exam-filter="approved">Approuvés</button>
          <button type="button" data-exam-filter="rejected">Refusés</button>
          <button type="button" data-exam-filter="pending">En attente</button>
        </div>
      </div>
    </div>

    <div class="student-results-head">
      <div>
        <p class="student-kicker">Feuille sélectionnée</p>
        <h2>${escapeHtml(SHEET.label)}</h2>
      </div>
      <div class="student-results-actions">
        <span>${answers.length} copie(s)</span>
        <button type="button" class="copy-all-results-btn" data-copy-all-results>Envoyer liste</button>
      </div>
    </div>

    <div class="exam-empty-filter" data-exam-empty-filter hidden>Aucun résultat ne correspond à cette recherche.</div>
    <div class="student-answer-grid">${answers.map((answer, index) => renderAnswerCard(answer, index)).join("")}</div>
  `;

  bindCards();
  bindTools();
}

async function init() {
  if (!sheetTabs || !sheetStatus || !sheetContent) return;

  bindMinimize();
  sheetTabs.innerHTML = `
    <button type="button" class="student-sheet-tab active" data-sheet="${escapeHtml(SHEET.id)}">
      ${escapeHtml(SHEET.label)}
    </button>
  `;

  setLoading();

  try {
    const csvText = await fetchCsv();
    const answers = rowsToAnswers(parseCsv(csvText));

    if (!answers.length) {
      setError(`Aucune réponse trouvée pour ${SHEET.label}.`);
      return;
    }

    await loadRecords();
    renderAnswers(answers);
  } catch (error) {
    console.error("Erreur chargement examens rapide :", error);
    setError(error.message || "Impossible de charger les examens.");
  }
}

init();
