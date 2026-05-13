const SPREADSHEET_ID = "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY";

const SHEETS = [
  {
    id: "exam-form-1",
    label: "Réponses formulaire",
    gid: "282279229"
  }
];

const STATUS_COLLECTION = "examAnswerStatuses";
const CUSTOM_STATUS_COLLECTION = "studentAnswerStatuses";

const EXAM_DISPLAY_MAX_POINTS = 50;
const EXAM_PASS_POINTS = 40;

const QUESTION_POINTS = {
  "Prénom / Nom (RP)": 1,
  "Prénom - Nom (RP)": 1,
  "ID Unique": 1,

  "Pourquoi voulez vous devenir mécano ?": 1,
  "Quelles sont les qualités d'un mécano pour vous ? (Citez en 6)": 6,
  "Citez 2 services que peut vendre un mécano.": 2,
  "Quel véhicule personnel un mécanicien peut-il utiliser": 3,
  "Citez 4 pièces de carrosserie": 4,
  "Quels sont les différents garages": 7,

  "Comme appelle t'on ce qui est montré sur l'image ?": 1,

  "Quel est la procédure d’une réparation au garage ?": 4,
  "Quel est la procédure d'une réparation au garage ?": 4,

  "Indiquez tout ce qui ne va pas sur cette image": 5,

  "Vous êtes en custom pour une peinture et vous avez changé la couleur secondaire, mais elle n’est pas visible. Que faites vous ?": 3,
  "Vous êtes en custom pour une peinture et vous avez changé la couleur secondaire, mais elle n'est pas visible. Que faites vous ?": 3,

  "Dans quelles situations un mécanicien est autorisé à mettre un véhicule en fourrière": 4,

  "Vous êtes en poste avec plusieurs mécaniciens. Quelles sont les règles à respecter pour que tout se passe bien entre mécaniciens ?": 3,

  "Citez 3 Outils de mécanique": 3,

  "Un client arrive masqué au garage pour une full perf mais il lui manque une portière . Que faites-vous ?": 4,
  "Un client arrive masqué au garage pour une full perf mais il lui manque une portière. Que faites-vous ?": 4
};

const sheetTabs = document.getElementById("sheetTabs");
const sheetStatus = document.getElementById("sheetStatus");
const sheetContent = document.getElementById("sheetContent");

const minimizeAnswersBtn = document.getElementById("minimizeAnswersBtn");
const restoreAnswersBtn = document.getElementById("restoreAnswersBtn");
const answersMiniBar = document.getElementById("answersMiniBar");
const answersBody = document.getElementById("answersBody");

const cache = new Map();

let answerRecords = {};
let approvedCustomIds = new Set();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildCsvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      currentValue += '"';
      i++;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") i++;

      currentRow.push(currentValue);

      if (currentRow.some(cell => String(cell).trim() !== "")) {
        rows.push(currentRow);
      }

      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue);

  if (currentRow.some(cell => String(cell).trim() !== "")) {
    rows.push(currentRow);
  }

  return rows;
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

function normalizeIdUnique(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function getField(answer, possibleNames) {
  for (const name of possibleNames) {
    const foundKey = Object.keys(answer).find(key => normalizeHeader(key) === normalizeHeader(name));
    if (foundKey) return answer[foundKey] || "";
  }

  return "";
}

function isLink(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function getValue(value) {
  const cleaned = String(value || "").trim();
  return cleaned || "Non renseigné";
}

function rowsToAnswers(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map(header => String(header || "").trim());

  const dataRows = rows
    .slice(1)
    .filter(row => row.some(cell => String(cell || "").trim() !== ""));

  return dataRows.map(row => {
    const answer = {};
    const orderedFields = [];

    headers.forEach((header, index) => {
      if (!header) return;

      const value = row[index] || "";

      answer[header] = value;

      orderedFields.push({
        label: header,
        value,
        index
      });
    });

    answer.__orderedFields = orderedFields;

    return answer;
  });
}

/* =========================================================
   FIREBASE
========================================================= */

function waitForFirebaseReady() {
  if (window.profFirebase?.db) {
    return Promise.resolve(window.profFirebase);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Firebase n’est pas prêt."));
    }, 6000);

    window.addEventListener("profFirebaseReady", () => {
      clearTimeout(timeout);
      resolve(window.profFirebase);
    }, { once: true });
  });
}

function getStudentName(answer, index) {
  const ordered = answer.__orderedFields || [];

  const byHeader = getField(answer, [
    "Prénom / Nom (RP)",
    "Prénom - Nom (RP)",
    "Prénom / Nom",
    "Prénom - Nom",
    "Nom RP",
    "Nom",
    "Pseudo"
  ]);

  if (byHeader) return byHeader;

  const columnD = ordered[3]?.value;
  if (columnD) return columnD;

  return `Copie ${index + 1}`;
}

function getExamIdentity(answer, index) {
  const studentName = getStudentName(answer, index);
  const idUnique = getField(answer, ["ID Unique", "ID"]);
  const normalizedIdUnique = normalizeIdUnique(idUnique);

  return {
    studentName,
    idUnique,
    normalizedIdUnique
  };
}

function buildAnswerKey(answer, sheetId, index) {
  const horodateur = getField(answer, ["Horodateur", "Timestamp"]);
  const nom = getStudentName(answer, index);
  const email = getField(answer, ["Adresse e-mail", "Email", "Adresse mail"]);

  return `${sheetId}__${index}__${horodateur}__${nom}__${email}`;
}

function buildStatusDocId(answerKey) {
  return encodeURIComponent(answerKey);
}

async function loadRecordsForSheet(sheetId) {
  try {
    const firebase = await waitForFirebaseReady();

    const statusesRef = firebase.collection(firebase.db, STATUS_COLLECTION);
    const q = firebase.query(statusesRef, firebase.where("sheetId", "==", sheetId));
    const snap = await firebase.getDocs(q);

    answerRecords = {};

    snap.forEach(docSnap => {
      const data = docSnap.data();

      if (data.answerKey) {
        answerRecords[data.answerKey] = {
          status: data.status || "pending",
          fieldScores: data.fieldScores || {},
          totalScore: Number(data.totalScore || 0),
          hasScoring: Boolean(data.hasScoring),

          studentName: data.studentName || "",
          idUnique: data.idUnique || "",
          normalizedIdUnique: data.normalizedIdUnique || ""
        };
      }
    });
  } catch (error) {
    console.error("Erreur chargement Firebase examens :", error);
    answerRecords = {};
  }
}

async function loadApprovedCustomIds() {
  try {
    const firebase = await waitForFirebaseReady();

    const statusesRef = firebase.collection(firebase.db, CUSTOM_STATUS_COLLECTION);
    const q = firebase.query(statusesRef, firebase.where("status", "==", "approved"));
    const snap = await firebase.getDocs(q);

    approvedCustomIds = new Set();

    snap.forEach(docSnap => {
      const data = docSnap.data();

      const normalizedId =
        data.normalizedIdUnique ||
        normalizeIdUnique(data.idUnique || "");

      if (normalizedId) {
        approvedCustomIds.add(normalizedId);
      }
    });
  } catch (error) {
    console.error("Erreur chargement customs approuvées :", error);
    approvedCustomIds = new Set();
  }
}

async function saveExamRecordToFirebase(answerKey, sheetId, record, identity = {}) {
  const firebase = await waitForFirebaseReady();
  const docId = buildStatusDocId(answerKey);

  const ref = firebase.doc(firebase.db, STATUS_COLLECTION, docId);

  await firebase.setDoc(ref, {
    answerKey,
    sheetId,

    studentName: identity.studentName || record.studentName || "",
    idUnique: identity.idUnique || record.idUnique || "",
    normalizedIdUnique: identity.normalizedIdUnique || record.normalizedIdUnique || "",

    status: record.status || "pending",
    fieldScores: record.fieldScores || {},
    totalScore: Number(record.totalScore || 0),
    maxScore: EXAM_DISPLAY_MAX_POINTS,
    hasScoring: Boolean(record.hasScoring),
    updatedBy: window.currentProfUser?.email || "professeur inconnu",
    updatedAt: firebase.serverTimestamp()
  }, { merge: true });
}

async function ensureExamParticipantsInFirebase(answers, sheet) {
  const savePromises = [];

  answers.forEach((answer, index) => {
    const answerKey = buildAnswerKey(answer, sheet.id, index);
    const identity = getExamIdentity(answer, index);

    if (!identity.normalizedIdUnique) return;

    const record = getAnswerRecord(answerKey);

    record.studentName = identity.studentName;
    record.idUnique = identity.idUnique;
    record.normalizedIdUnique = identity.normalizedIdUnique;

    answerRecords[answerKey] = record;

    savePromises.push(
      saveExamRecordToFirebase(answerKey, sheet.id, record, identity)
    );
  });

  if (savePromises.length) {
    try {
      await Promise.all(savePromises);
    } catch (error) {
      console.error("Erreur sauvegarde participants examens :", error);
    }
  }
}

/* =========================================================
   SCORE / STATUS
========================================================= */

function getStatusMeta(status) {
  switch (status) {
    case "approved":
      return {
        value: "approved",
        shortLabel: "✔ Approuvé",
        className: "approved"
      };

    case "rejected":
      return {
        value: "rejected",
        shortLabel: "✖ Refusé",
        className: "rejected"
      };

    default:
      return {
        value: "pending",
        shortLabel: "• En attente",
        className: "pending"
      };
  }
}

function getQuestionPoints(label) {
  const normalizedLabel = normalizeQuestion(label);

  const foundKey = Object.keys(QUESTION_POINTS).find(key => {
    return normalizeQuestion(key) === normalizedLabel;
  });

  if (!foundKey) return null;

  return QUESTION_POINTS[foundKey];
}

function buildFieldScoreKey(field) {
  return `${field.index}__${normalizeQuestion(field.label)}`;
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

function getAnswerRecord(answerKey) {
  return answerRecords[answerKey] || getDefaultRecord();
}

function calculateRealScore(fieldScores) {
  return Object.values(fieldScores || {}).reduce((sum, value) => {
    const number = Number(value || 0);
    return sum + (Number.isNaN(number) ? 0 : number);
  }, 0);
}

function calculateTotalScore(fieldScores) {
  const realTotal = calculateRealScore(fieldScores);
  return Math.min(realTotal, EXAM_DISPLAY_MAX_POINTS);
}

function getAutoStatusFromManualScore(totalScore, hasScoring) {
  if (!hasScoring) return "pending";
  return totalScore >= EXAM_PASS_POINTS ? "approved" : "rejected";
}

function syncRecordScoreAndStatus(record) {
  const totalScore = calculateTotalScore(record.fieldScores);
  const realScore = calculateRealScore(record.fieldScores);
  const hasScoring = record.hasScoring || realScore > 0;

  record.totalScore = totalScore;
  record.hasScoring = hasScoring;
  record.status = getAutoStatusFromManualScore(totalScore, hasScoring);

  return record;
}

function renderScoreBadge(totalScore, hasScoring) {
  if (!hasScoring) {
    return `
      <span class="student-score-badge score-pending" data-total-score-badge>
        0 / ${EXAM_DISPLAY_MAX_POINTS}
      </span>
    `;
  }

  const scoreClass = totalScore >= EXAM_PASS_POINTS ? "score-approved" : "score-rejected";

  return `
    <span class="student-score-badge ${scoreClass}" data-total-score-badge>
      ${escapeHtml(totalScore)} / ${EXAM_DISPLAY_MAX_POINTS}
    </span>
  `;
}

/* =========================================================
   BONUS AUTO CUSTOM APPROUVÉE
========================================================= */

function findIdUniqueField(answer) {
  const orderedFields = answer.__orderedFields || [];

  return orderedFields.find(field => {
    const label = normalizeHeader(field.label);
    return (
      label === normalizeHeader("ID Unique") ||
      label === normalizeHeader("ID")
    );
  });
}

async function applyApprovedCustomBonus(answers, sheet) {
  const savePromises = [];

  answers.forEach((answer, index) => {
    const examIdUnique = getField(answer, ["ID Unique", "ID"]);
    const normalizedExamId = normalizeIdUnique(examIdUnique);

    if (!normalizedExamId) return;
    if (!approvedCustomIds.has(normalizedExamId)) return;

    const idField = findIdUniqueField(answer);
    if (!idField) return;

    const maxPoints = getQuestionPoints(idField.label);
    if (maxPoints === null || maxPoints === undefined) return;

    const answerKey = buildAnswerKey(answer, sheet.id, index);
    const record = getAnswerRecord(answerKey);
    const fieldKey = buildFieldScoreKey(idField);

    const currentScore = Number(record.fieldScores?.[fieldKey] || 0);
    const bonusScore = Math.min(1, maxPoints);

    if (currentScore >= bonusScore) return;

    record.fieldScores = {
      ...(record.fieldScores || {}),
      [fieldKey]: bonusScore
    };

    record.hasScoring = true;

    const identity = getExamIdentity(answer, index);
    record.studentName = identity.studentName;
    record.idUnique = identity.idUnique;
    record.normalizedIdUnique = identity.normalizedIdUnique;

    syncRecordScoreAndStatus(record);

    answerRecords[answerKey] = record;

    savePromises.push(
      saveExamRecordToFirebase(answerKey, sheet.id, record, identity)
    );
  });

  if (savePromises.length) {
    try {
      await Promise.all(savePromises);
    } catch (error) {
      console.error("Erreur sauvegarde bonus ID Unique auto :", error);
    }
  }
}

/* =========================================================
   RENDER EXAM
========================================================= */

function shouldDisplayExamField(field) {
  const label = normalizeHeader(field.label);

  if (!label) return false;

  if (label === normalizeHeader("Horodateur")) return false;
  if (label === normalizeHeader("Adresse e-mail")) return false;
  if (label === normalizeHeader("Email")) return false;
  if (label === normalizeHeader("Adresse mail")) return false;
  if (label === normalizeHeader("Score")) return false;

  return true;
}

function renderScoreControl(field, currentScore) {
  const maxPoints = getQuestionPoints(field.label);

  if (maxPoints === null || maxPoints === undefined) {
    return `
      <div class="exam-score-control exam-score-missing">
        <span>Barème ?</span>
      </div>
    `;
  }

  const safeCurrent = Math.max(0, Math.min(Number(currentScore || 0), maxPoints));

  const isIdUniqueField =
    normalizeHeader(field.label) === normalizeHeader("ID Unique") ||
    normalizeHeader(field.label) === normalizeHeader("ID");

  const autoText = isIdUniqueField && safeCurrent >= 1
    ? `<em class="exam-auto-bonus">Auto custom ✅</em>`
    : "";

  return `
    <div
      class="exam-score-control"
      data-score-control
      data-field-key="${escapeHtml(buildFieldScoreKey(field))}"
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
      ${autoText}
    </div>
  `;
}

function renderExamLine(field, displayIndex, record) {
  const cleanValue = getValue(field.value);
  const fieldKey = buildFieldScoreKey(field);
  const currentScore = record.fieldScores?.[fieldKey] || 0;

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

function renderExamAnswersSection(answer, record) {
  const orderedFields = answer.__orderedFields || [];
  const displayFields = orderedFields.filter(shouldDisplayExamField);

  const html = displayFields
    .map((field, index) => renderExamLine(field, index, record))
    .join("");

  return `
    <section class="student-section exam-ordered-section">
      <div class="student-section-head">
        <h3>Correction de l’examen</h3>
      </div>

      <div class="exam-lines-list">
        ${html || `<div class="student-empty">Aucune réponse trouvée.</div>`}
      </div>
    </section>
  `;
}

function renderAnswerCard(answer, index, sheet) {
  const name = getStudentName(answer, index);
  const idUnique = getField(answer, ["ID Unique", "ID"]);
  const normalizedIdUnique = normalizeIdUnique(idUnique);

  const answerKey = buildAnswerKey(answer, sheet.id, index);

  const record = getAnswerRecord(answerKey);
  const totalScore = calculateTotalScore(record.fieldScores);
  const realScore = calculateRealScore(record.fieldScores);
  const hasScoring = record.hasScoring || realScore > 0;

  const autoStatus = getAutoStatusFromManualScore(totalScore, hasScoring);
  const status = record.status && record.status !== "pending" ? record.status : autoStatus;
  const statusMeta = getStatusMeta(status);

  return `
    <article
      class="student-answer-card collapsed status-${escapeHtml(statusMeta.className)}"
      data-answer-card
      data-answer-key="${escapeHtml(answerKey)}"
      data-sheet-id="${escapeHtml(sheet.id)}"
      data-status="${escapeHtml(statusMeta.value)}"
      data-student-name="${escapeHtml(name)}"
      data-id-unique="${escapeHtml(idUnique)}"
      data-normalized-id-unique="${escapeHtml(normalizedIdUnique)}"
    >
      <div class="student-card-top">
        <button type="button" class="student-card-main student-card-open-zone" data-toggle-card>
          <p class="student-kicker">${escapeHtml(sheet.label)} · Copie ${index + 1}</p>
          <h2>${escapeHtml(name)}</h2>
        </button>

        <div class="student-tags">
          <span class="student-id-badge">${escapeHtml(idUnique || "Copie")}</span>

          ${renderScoreBadge(totalScore, hasScoring)}

          <span class="student-status-badge status-${escapeHtml(statusMeta.className)}" data-status-badge>
            ${escapeHtml(statusMeta.shortLabel)}
          </span>

          <button
            type="button"
            class="copy-result-btn"
            data-copy-result
            data-copy-name="${escapeHtml(name)}"
            data-copy-score="${escapeHtml(totalScore)}"
          >
            Copier résultat
          </button>

          <button type="button" class="student-toggle-icon" data-toggle-card>
            +
          </button>
        </div>
      </div>

      <div class="student-card-body">
        <div class="student-status-actions">
          <button type="button" class="student-status-btn approve" data-set-status="approved">
            ✔ Approuver
          </button>

          <button type="button" class="student-status-btn reject" data-set-status="rejected">
            ✖ Refuser
          </button>

          <button type="button" class="student-status-btn pending" data-set-status="pending">
            • En attente
          </button>
        </div>

        ${renderExamAnswersSection(answer, record)}
      </div>
    </article>
  `;
}

/* =========================================================
   UI STATES
========================================================= */

function setLoading(sheetLabel) {
  sheetStatus.hidden = false;
  sheetStatus.style.display = "flex";
  sheetStatus.innerHTML = `
    <div class="inline-loader"></div>
    <p>Chargement des examens ${escapeHtml(sheetLabel)}...</p>
  `;

  sheetContent.hidden = true;
  sheetContent.innerHTML = "";
}

function setError(message) {
  sheetStatus.hidden = false;
  sheetStatus.style.display = "block";
  sheetStatus.innerHTML = `
    <div class="inline-error-box">
      <h4>Impossible de charger les examens</h4>
      <p>${escapeHtml(message)}</p>
    </div>
  `;

  sheetContent.hidden = true;
}

function setEmpty(sheetLabel) {
  sheetStatus.hidden = false;
  sheetStatus.style.display = "block";
  sheetStatus.innerHTML = `
    <div class="inline-empty-box">
      Aucune réponse trouvée pour ${escapeHtml(sheetLabel)}.
    </div>
  `;

  sheetContent.hidden = true;
}

/* =========================================================
   RENDER ANSWERS
========================================================= */

async function renderAnswers(answers, sheet) {
  if (!answers.length) {
    setEmpty(sheet.label);
    return;
  }

  await loadRecordsForSheet(sheet.id);
  await ensureExamParticipantsInFirebase(answers, sheet);
  await loadApprovedCustomIds();
  await applyApprovedCustomBonus(answers, sheet);

  sheetStatus.hidden = true;
  sheetStatus.style.display = "none";

  sheetContent.hidden = false;
  sheetContent.innerHTML = `
    <div class="student-results-head">
      <div>
        <p class="student-kicker">Feuille sélectionnée</p>
        <h2>${escapeHtml(sheet.label)}</h2>
      </div>

      <span>${answers.length} copie(s)</span>
    </div>

    <div class="student-answer-grid">
      ${answers.map((answer, index) => renderAnswerCard(answer, index, sheet)).join("")}
    </div>
  `;

  bindCardToggles();
  bindStatusButtons();
  bindScoreControls();
  bindCopyResultButtons();
}

async function loadSheet(sheet) {
  if (!window.currentProfUser) {
    window.location.href = "espace-prof.html";
    return;
  }

  setActiveTab(sheet.id);
  setLoading(sheet.label);

  try {
    let answers;

    if (cache.has(sheet.id)) {
      answers = cache.get(sheet.id);
    } else {
      const response = await fetch(buildCsvUrl(sheet.gid));

      if (!response.ok) {
        throw new Error(`Erreur Google Sheets : ${response.status}`);
      }

      const csvText = await response.text();
      const rows = parseCsv(csvText);
      answers = rowsToAnswers(rows);

      cache.set(sheet.id, answers);
    }

    await renderAnswers(answers, sheet);
  } catch (error) {
    console.error("Erreur chargement Google Sheets examens :", error);
    setError("Vérifie que le Google Sheet est public avec lien, et que le GID est correct.");
  }
}

/* =========================================================
   TABS
========================================================= */

function setActiveTab(sheetId) {
  document.querySelectorAll(".student-sheet-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.sheet === sheetId);
  });
}

function renderTabs() {
  sheetTabs.innerHTML = SHEETS.map(sheet => `
    <button type="button" class="student-sheet-tab" data-sheet="${escapeHtml(sheet.id)}">
      ${escapeHtml(sheet.label)}
    </button>
  `).join("");

  document.querySelectorAll(".student-sheet-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const sheet = SHEETS.find(item => item.id === btn.dataset.sheet);
      if (sheet) loadSheet(sheet);
    });
  });
}

/* =========================================================
   CARD OPEN / CLOSE
========================================================= */

function bindCardToggles() {
  const cards = document.querySelectorAll("[data-answer-card]");

  cards.forEach((card) => {
    card.classList.add("collapsed");
    card.classList.remove("is-open");

    const icon = card.querySelector(".student-toggle-icon");
    if (icon) icon.textContent = "+";
  });

  document.querySelectorAll("[data-toggle-card]").forEach(button => {
    button.addEventListener("click", () => {
      const selectedCard = button.closest("[data-answer-card]");
      if (!selectedCard) return;

      const isAlreadyOpen = selectedCard.classList.contains("is-open");

      cards.forEach(card => {
        card.classList.add("collapsed");
        card.classList.remove("is-open");

        const icon = card.querySelector(".student-toggle-icon");
        if (icon) icon.textContent = "+";
      });

      if (!isAlreadyOpen) {
        selectedCard.classList.remove("collapsed");
        selectedCard.classList.add("is-open");

        const icon = selectedCard.querySelector(".student-toggle-icon");
        if (icon) icon.textContent = "−";

        setTimeout(() => {
          selectedCard.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
        }, 120);
      }
    });
  });
}

/* =========================================================
   STATUS UI
========================================================= */

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

  card.querySelectorAll("[data-set-status]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.setStatus === meta.value);
  });
}

function updateScoreUi(card, record) {
  syncRecordScoreAndStatus(record);

  const totalScore = record.totalScore;
  const hasScoring = record.hasScoring;

  const scoreBadge = card.querySelector("[data-total-score-badge]");

  if (scoreBadge) {
    scoreBadge.classList.remove("score-approved", "score-rejected", "score-pending");

    if (!hasScoring) {
      scoreBadge.classList.add("score-pending");
      scoreBadge.textContent = `0 / ${EXAM_DISPLAY_MAX_POINTS}`;
    } else if (totalScore >= EXAM_PASS_POINTS) {
      scoreBadge.classList.add("score-approved");
      scoreBadge.textContent = `${totalScore} / ${EXAM_DISPLAY_MAX_POINTS}`;
    } else {
      scoreBadge.classList.add("score-rejected");
      scoreBadge.textContent = `${totalScore} / ${EXAM_DISPLAY_MAX_POINTS}`;
    }
  }

  updateCardStatus(card, record.status);

  const copyButton = card.querySelector("[data-copy-result]");
  if (copyButton) {
    copyButton.dataset.copyScore = String(totalScore);
  }
}

function getIdentityFromCard(card) {
  return {
    studentName: card.dataset.studentName || "",
    idUnique: card.dataset.idUnique || "",
    normalizedIdUnique: card.dataset.normalizedIdUnique || ""
  };
}

/* =========================================================
   SCORE INPUTS
========================================================= */

function bindScoreControls() {
  document.querySelectorAll("[data-score-input]").forEach((input) => {
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });

    input.addEventListener("input", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const control = input.closest("[data-score-control]");
      const card = input.closest("[data-answer-card]");

      if (!control || !card) return;

      const answerKey = card.dataset.answerKey;
      const sheetId = card.dataset.sheetId;
      const fieldKey = control.dataset.fieldKey;
      const maxPoints = Number(control.dataset.maxPoints || 0);

      if (!answerKey || !sheetId || !fieldKey) return;

      let newScore = Number(input.value);

      if (Number.isNaN(newScore)) {
        newScore = 0;
      }

      newScore = Math.max(0, Math.min(newScore, maxPoints));

      input.value = String(newScore);

      const record = answerRecords[answerKey] || getDefaultRecord();
      const identity = getIdentityFromCard(card);

      record.fieldScores = {
        ...(record.fieldScores || {}),
        [fieldKey]: newScore
      };

      record.studentName = identity.studentName;
      record.idUnique = identity.idUnique;
      record.normalizedIdUnique = identity.normalizedIdUnique;

      record.hasScoring = true;
      syncRecordScoreAndStatus(record);

      answerRecords[answerKey] = record;

      updateScoreUi(card, record);

      try {
        await saveExamRecordToFirebase(answerKey, sheetId, record, identity);
      } catch (error) {
        console.error("Erreur sauvegarde score Firebase :", error);
        alert("Impossible de sauvegarder les points dans Firebase.");
      }
    });
  });
}

/* =========================================================
   COPY RESULT
========================================================= */

function bindCopyResultButtons() {
  document.querySelectorAll("[data-copy-result]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const name = button.dataset.copyName || "Élève";
      const score = button.dataset.copyScore || "0";

      const textToCopy = `${name} ${score}/${EXAM_DISPLAY_MAX_POINTS}`;

      try {
        await navigator.clipboard.writeText(textToCopy);

        const oldText = button.textContent;
        button.textContent = "Copié ✅";
        button.classList.add("copied");

        setTimeout(() => {
          button.textContent = oldText;
          button.classList.remove("copied");
        }, 1200);
      } catch (error) {
        console.error("Erreur copie presse-papier :", error);
        alert(`Résultat à copier : ${textToCopy}`);
      }
    });
  });
}

/* =========================================================
   MANUAL STATUS BUTTONS
========================================================= */

function bindStatusButtons() {
  document.querySelectorAll("[data-set-status]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();

      const card = button.closest("[data-answer-card]");
      if (!card) return;

      const answerKey = card.dataset.answerKey;
      const sheetId = card.dataset.sheetId;
      const newStatus = button.dataset.setStatus;

      if (!answerKey || !sheetId || !newStatus) return;

      const record = answerRecords[answerKey] || getDefaultRecord();
      const identity = getIdentityFromCard(card);

      record.status = newStatus;
      record.hasScoring = true;

      record.studentName = identity.studentName;
      record.idUnique = identity.idUnique;
      record.normalizedIdUnique = identity.normalizedIdUnique;

      answerRecords[answerKey] = record;

      updateCardStatus(card, newStatus);

      try {
        await saveExamRecordToFirebase(answerKey, sheetId, record, identity);
      } catch (error) {
        console.error("Erreur sauvegarde statut Firebase examens :", error);
        alert("Impossible de sauvegarder le statut dans Firebase.");
      }
    });
  });

  document.querySelectorAll("[data-answer-card]").forEach((card) => {
    updateCardStatus(card, card.dataset.status || "pending");
  });
}

/* =========================================================
   MINIMIZE GLOBAL
========================================================= */

function bindMinimize() {
  if (minimizeAnswersBtn) {
    minimizeAnswersBtn.addEventListener("click", () => {
      const isMinimized = answersBody.hidden;

      if (isMinimized) {
        answersBody.hidden = false;
        answersMiniBar.hidden = true;
        minimizeAnswersBtn.textContent = "−";
      } else {
        answersBody.hidden = true;
        answersMiniBar.hidden = false;
        minimizeAnswersBtn.textContent = "+";
      }
    });
  }

  if (restoreAnswersBtn) {
    restoreAnswersBtn.addEventListener("click", () => {
      answersBody.hidden = false;
      answersMiniBar.hidden = true;

      if (minimizeAnswersBtn) {
        minimizeAnswersBtn.textContent = "−";
      }
    });
  }
}

/* =========================================================
   INIT
========================================================= */

renderTabs();
bindMinimize();
loadSheet(SHEETS[0]);
