const SHEETS = [
  {
    id: "exam-form-1",
    label: "Réponses formulaire"
  }
];

const STATUS_COLLECTION = "examAnswerStatuses";
const CUSTOM_STATUS_COLLECTION = "studentAnswerStatuses";
const STAGE_COLLECTION = "stageValidations";
const EXAM_RESULTS_SEND_ENDPOINT = "/api/discord-exam-results";

const DEFAULT_EXAM_DISPLAY_MAX_POINTS = 50;
const EXAM_PASS_POINTS = 40;

const CUSTOM_BONUS_SHEETS = [
  { id: "sentinelClassic", label: "Sentinel Classic" },
  { id: "argento2f", label: "Argento 2F" },
  { id: "cypher", label: "Cypher" }
];

const QUESTION_POINTS = {
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
let approvedStageIds = new Set();
let customBonusDataReady = false;

let currentExamSearch = "";
let currentExamFilter = "all";
let activeSheetId = SHEETS[0].id;
let sheetLoadInFlight = false;
let activeExamAnswerKey = "";
const activeExamQuestionIndexes = new Map();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildCsvUrl(sheet) {
  const params = new URLSearchParams({
    source: "examResponses",
    sheet: sheet.id
  });

  return `/api/secure-sheet?${params.toString()}`;
}

function buildCustomBonusCsvUrl(sheet) {
  const params = new URLSearchParams({
    source: "customResponses",
    sheet: sheet.id
  });

  return `/api/secure-sheet?${params.toString()}`;
}

async function buildSecureSheetHeaders() {
  const user = window.currentProfUser;

  if (!user?.getIdToken) {
    throw new Error("Connexion professeur requise.");
  }

  const idToken = await user.getIdToken();

  return {
    Authorization: `Bearer ${idToken}`
  };
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

function buildCustomBonusAnswerKey(answer, sheetId, index) {
  const horodateur = getField(answer, ["Horodateur"]);
  const nom = getField(answer, ["Prénom - Nom (RP)", "Prénom - Nom", "Nom"]);
  const idUnique = getField(answer, ["ID Unique", "ID"]);

  return `${sheetId}__${index}__${horodateur}__${nom}__${idUnique}`;
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
    const currentCustomAnswerIds = await loadCurrentCustomBonusAnswerIds();

    const statusesRef = firebase.collection(firebase.db, CUSTOM_STATUS_COLLECTION);
    const q = firebase.query(statusesRef, firebase.where("status", "==", "approved"));
    const snap = await firebase.getDocs(q);

    approvedCustomIds = new Set();

    snap.forEach(docSnap => {
      const data = docSnap.data();
      const normalizedId = currentCustomAnswerIds.get(data.answerKey);

      if (normalizedId) {
        approvedCustomIds.add(normalizedId);
      }
    });

    customBonusDataReady = true;
  } catch (error) {
    console.error("Erreur chargement customs approuvées du cursus :", error);
    approvedCustomIds = new Set();
    customBonusDataReady = false;
  }
}

async function loadCurrentCustomBonusAnswerIds() {
  const currentAnswerIds = new Map();

  const results = await Promise.allSettled(CUSTOM_BONUS_SHEETS.map(async sheet => {
    const response = await fetch(buildCustomBonusCsvUrl(sheet), {
      cache: "no-store",
      headers: await buildSecureSheetHeaders()
    });

    if (!response.ok) {
      throw new Error(`Erreur lecture customs ${sheet.label} : ${response.status}`);
    }

    const rows = parseCsv(await response.text());
    const answers = rowsToAnswers(rows);

    answers.forEach((answer, index) => {
      const answerKey = buildCustomBonusAnswerKey(answer, sheet.id, index);
      const normalizedId = normalizeIdUnique(getField(answer, ["ID Unique", "ID"]));

      if (answerKey && normalizedId) {
        currentAnswerIds.set(answerKey, normalizedId);
      }
    });
  }));

  const loadedCount = results.filter(result => result.status === "fulfilled").length;

  results.forEach(result => {
    if (result.status === "rejected") {
      console.warn("Réponses custom partielles impossibles à charger pour le bonus examen :", result.reason);
    }
  });

  if (loadedCount < CUSTOM_BONUS_SHEETS.length) {
    throw new Error("Toutes les feuilles customs actuelles doivent être chargées pour recalculer le bonus examen.");
  }

  return currentAnswerIds;
}

async function loadApprovedStageIds() {
  try {
    const firebase = await waitForFirebaseReady();

    const stagesRef = firebase.collection(firebase.db, STAGE_COLLECTION);
    const snap = await firebase.getDocs(stagesRef);

    approvedStageIds = new Set();

    snap.forEach(docSnap => {
      const data = docSnap.data();

      const normalizedId =
        data.normalizedIdUnique ||
        normalizeIdUnique(data.idUnique || "");

      if (normalizedId) {
        approvedStageIds.add(normalizedId);
      }
    });
  } catch (error) {
    console.error("Erreur chargement stages validés :", error);
    approvedStageIds = new Set();
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
    maxScore: getExamMaxPoints(),
    hasScoring: Boolean(record.hasScoring),
    updatedBy: window.currentProfUser?.profActorId || window.currentProfUser?.email || "professeur inconnu",
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
  const questionPoints = getQuestionPointsMap();

  const foundKey = Object.keys(questionPoints).find(key => {
    return normalizeQuestion(key) === normalizedLabel;
  });

  if (!foundKey) return null;

  return getSafeQuestionPointValue(questionPoints[foundKey]);
}

function getQuestionPointsFromFieldKey(fieldKey) {
  const normalizedFieldKey = String(fieldKey || "").split("__").slice(1).join("__");
  const questionPoints = getQuestionPointsMap();

  if (!normalizedFieldKey) return null;

  const foundKey = Object.keys(questionPoints).find(key => {
    return normalizeQuestion(key) === normalizedFieldKey;
  });

  if (!foundKey) return null;

  return getSafeQuestionPointValue(questionPoints[foundKey]);
}

function getQuestionPointsMap() {
  const firebasePoints = window.__examResponsesSettings?.questionPoints || {};
  return Object.keys(firebasePoints).length ? firebasePoints : QUESTION_POINTS;
}

function getSafeQuestionPointValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

function getExamMaxPoints() {
  const configuredMax = Number(window.__examResponsesSettings?.maxPoints);

  if (Number.isFinite(configuredMax) && configuredMax > 0) {
    return Math.min(configuredMax, DEFAULT_EXAM_DISPLAY_MAX_POINTS);
  }

  return DEFAULT_EXAM_DISPLAY_MAX_POINTS;
}

function getExamPassPoints() {
  const configuredPass = Number(window.__examResponsesSettings?.passPoints);

  if (Number.isFinite(configuredPass) && configuredPass > 0) {
    return configuredPass;
  }

  return Math.min(EXAM_PASS_POINTS, getExamMaxPoints());
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
  return Object.entries(fieldScores || {}).reduce((sum, [fieldKey, value]) => {
    const maxPoints = getQuestionPointsFromFieldKey(fieldKey);
    const number = Number(value || 0);

    if (Number.isNaN(number)) return sum;

    if (maxPoints === 0) return sum;

    if (maxPoints !== null && maxPoints !== undefined) {
      return sum + Math.max(0, Math.min(number, maxPoints));
    }

    return sum + Math.max(0, number);
  }, 0);
}

function calculateTotalScore(fieldScores) {
  const realTotal = calculateRealScore(fieldScores);
  return Math.min(realTotal, getExamMaxPoints());
}

function getAutoStatusFromManualScore(totalScore, hasScoring) {
  if (!hasScoring) return "pending";
  return totalScore >= getExamPassPoints() ? "approved" : "rejected";
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
        0 / ${getExamMaxPoints()}
      </span>
    `;
  }

  const scoreClass = totalScore >= getExamPassPoints() ? "score-approved" : "score-rejected";

  return `
    <span class="student-score-badge ${scoreClass}" data-total-score-badge>
      ${escapeHtml(totalScore)} / ${getExamMaxPoints()}
    </span>
  `;
}

/* =========================================================
   EXAM TOOLS - RECHERCHE / FILTRES / STATS
========================================================= */

function normalizeSearchValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getVisibleExamCards() {
  return Array.from(document.querySelectorAll("[data-answer-card]"))
    .filter(card => !card.hidden && getComputedStyle(card).display !== "none");
}

function getAllExamCards() {
  return Array.from(document.querySelectorAll("[data-answer-card]"));
}

function getScoreFromCard(card) {
  const scoreText =
    card.querySelector("[data-total-score-badge]")?.textContent || "0";

  const number = Number(String(scoreText).split("/")[0].trim());

  return Number.isNaN(number) ? 0 : number;
}

function applyExamDashboardTools() {
  const cards = getAllExamCards();

  const search = normalizeSearchValue(currentExamSearch);
  const filter = currentExamFilter;

  cards.forEach(card => {
    const name = normalizeSearchValue(card.dataset.studentName || "");
    const idUnique = normalizeSearchValue(card.dataset.idUnique || "");
    const status = card.dataset.status || "pending";

    const matchSearch =
      !search ||
      name.includes(search) ||
      idUnique.includes(search);

    const matchFilter =
      filter === "all" ||
      status === filter;

    card.style.display = matchSearch && matchFilter ? "" : "none";
  });

  ensureActiveExamCardVisible();
  updateExamStats();
}

function updateExamStats() {
  const visibleCards = getVisibleExamCards();

  const total = visibleCards.length;

  const approved = visibleCards.filter(card => card.dataset.status === "approved").length;
  const rejected = visibleCards.filter(card => card.dataset.status === "rejected").length;
  const pending = visibleCards.filter(card => card.dataset.status === "pending").length;

  const scores = visibleCards.map(getScoreFromCard);
  const average = scores.length
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
    : 0;

  const totalEl = document.querySelector("[data-stat-total]");
  const approvedEl = document.querySelector("[data-stat-approved]");
  const rejectedEl = document.querySelector("[data-stat-rejected]");
  const pendingEl = document.querySelector("[data-stat-pending]");
  const averageEl = document.querySelector("[data-stat-average]");
  const emptyEl = document.querySelector("[data-exam-empty-filter]");

  if (totalEl) totalEl.textContent = String(total);
  if (approvedEl) approvedEl.textContent = String(approved);
  if (rejectedEl) rejectedEl.textContent = String(rejected);
  if (pendingEl) pendingEl.textContent = String(pending);
  if (averageEl) averageEl.textContent = `${average} / ${getExamMaxPoints()}`;

  if (emptyEl) {
    emptyEl.hidden = total > 0;
  }
}

function bindExamDashboardTools() {
  const searchInput = document.querySelector("[data-exam-search]");
  const filterButtons = document.querySelectorAll("[data-exam-filter]");

  if (searchInput) {
    searchInput.value = currentExamSearch;

    searchInput.addEventListener("input", () => {
      currentExamSearch = searchInput.value;
      applyExamDashboardTools();
    });
  }

  filterButtons.forEach(button => {
    button.classList.toggle("active", button.dataset.examFilter === currentExamFilter);

    button.addEventListener("click", () => {
      currentExamFilter = button.dataset.examFilter || "all";

      filterButtons.forEach(btn => {
        btn.classList.toggle("active", btn.dataset.examFilter === currentExamFilter);
      });

      applyExamDashboardTools();
    });
  });

  applyExamDashboardTools();
}

/* =========================================================
   BONUS AUTO CUSTOM + STAGE
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

function getAutoBonusInfo(answer) {
  const examIdUnique = getField(answer, ["ID Unique", "ID"]);
  const normalizedExamId = normalizeIdUnique(examIdUnique);

  if (!normalizedExamId) {
    return {
      total: 0,
      hasCustom: false,
      hasStage: false
    };
  }

  const hasCustom = approvedCustomIds.has(normalizedExamId);
  const hasStage = approvedStageIds.has(normalizedExamId);

  return {
    total: Number(hasCustom) + Number(hasStage),
    hasCustom,
    hasStage
  };
}

async function applyAutomaticIdUniqueBonuses(answers, sheet) {
  if (!customBonusDataReady) {
    return;
  }

  const savePromises = [];

  answers.forEach((answer, index) => {
    const bonusInfo = getAutoBonusInfo(answer);

    const idField = findIdUniqueField(answer);
    if (!idField) return;

    const maxPoints = getQuestionPoints(idField.label);
    if (maxPoints === null || maxPoints === undefined || maxPoints <= 0) return;

    const answerKey = buildAnswerKey(answer, sheet.id, index);
    const record = getAnswerRecord(answerKey);
    const fieldKey = buildFieldScoreKey(idField);

    const currentScore = Number(record.fieldScores?.[fieldKey] || 0);
    const autoScore = Math.min(bonusInfo.total, maxPoints);

    if (currentScore === autoScore) return;

    record.fieldScores = {
      ...(record.fieldScores || {}),
      [fieldKey]: autoScore
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

function renderScoreControl(field, currentScore, answer) {
  const maxPoints = getQuestionPoints(field.label);

  if (maxPoints === null || maxPoints === undefined) {
    return `
      <div class="exam-score-control exam-score-missing">
        <span>Barème ?</span>
      </div>
    `;
  }

  if (maxPoints === 0) {
    return `
      <div class="exam-score-control exam-score-noted">
        <span>Non noté</span>
      </div>
    `;
  }

  const safeCurrent = Math.max(0, Math.min(Number(currentScore || 0), maxPoints));

  const isIdUniqueField =
    normalizeHeader(field.label) === normalizeHeader("ID Unique") ||
    normalizeHeader(field.label) === normalizeHeader("ID");

  let autoText = "";

  if (isIdUniqueField) {
    const bonusInfo = getAutoBonusInfo(answer);
    const tags = [];

    if (bonusInfo.hasCustom) tags.push("Custom");
    if (bonusInfo.hasStage) tags.push("Stage");

    if (tags.length) {
      autoText = `<em class="exam-auto-bonus">${tags.join(" · ")}</em>`;
    }
  }

  const quickScoreMax = Math.min(10, Math.max(0, Math.floor(maxPoints)));
  const quickScores = Number.isInteger(maxPoints) && maxPoints <= 10
    ? Array.from({ length: quickScoreMax + 1 }, (_, score) => `
        <button
          type="button"
          class="exam-score-choice${safeCurrent === score ? " active" : ""}"
          data-score-choice="${score}"
          aria-label="Attribuer ${score} point${score > 1 ? "s" : ""}"
        >${score}</button>
      `).join("")
    : "";

  return `
    <div
      class="exam-score-control"
      data-score-control
      data-field-key="${escapeHtml(buildFieldScoreKey(field))}"
      data-max-points="${escapeHtml(maxPoints)}"
    >
      <div class="exam-score-choices" role="group" aria-label="Notation rapide">
        ${quickScores}
      </div>

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

function renderExamLine(field, displayIndex, record, answer) {
  const cleanValue = getValue(field.value);
  const fieldKey = buildFieldScoreKey(field);
  const currentScore = record.fieldScores?.[fieldKey] || 0;
  const hasExplicitScore = Object.prototype.hasOwnProperty.call(record.fieldScores || {}, fieldKey);

  const valueHtml = isLink(cleanValue)
    ? `<a href="${escapeHtml(cleanValue)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien</a>`
    : `<strong>${escapeHtml(cleanValue)}</strong>`;

  return `
    <div
      class="exam-line${displayIndex === 0 ? " is-current" : ""}"
      data-exam-line
      data-question-index="${displayIndex}"
      data-scored="${hasExplicitScore ? "true" : "false"}"
    >
      <div class="exam-line-number">${String(displayIndex + 1).padStart(2, "0")}</div>

      <div class="exam-line-content">
        <span>${escapeHtml(field.label)}</span>
        ${valueHtml}
      </div>

      <div class="exam-line-score">
        ${renderScoreControl(field, currentScore, answer)}
      </div>
    </div>
  `;
}

function renderExamAnswersSection(answer, record) {
  const orderedFields = answer.__orderedFields || [];
  const displayFields = orderedFields.filter(field => {
    if (!shouldDisplayExamField(field)) return false;
    return getQuestionPoints(field.label) !== 0;
  });

  const html = displayFields
    .map((field, index) => renderExamLine(field, index, record, answer))
    .join("");

  return `
    <section class="student-section exam-ordered-section">
      <div class="student-section-head exam-cockpit-question-head">
        <div>
          <p>Correction guidée</p>
          <h3>Question <span data-exam-current-question>1</span> sur ${displayFields.length}</h3>
        </div>

        <span data-exam-question-progress>${displayFields.length ? `1 / ${displayFields.length}` : "0 / 0"}</span>
      </div>

      <div class="exam-cockpit-progress" aria-hidden="true">
        <span data-exam-question-meter style="width:${displayFields.length ? 100 / displayFields.length : 0}%"></span>
      </div>

      <div class="exam-lines-list">
        ${html || `<div class="student-empty">Aucune réponse trouvée.</div>`}
      </div>

      <nav class="exam-cockpit-question-nav" aria-label="Navigation entre les questions">
        <button type="button" data-exam-question-previous>← Précédente</button>
        <span data-exam-question-state aria-live="polite">Sauvegarde automatique active</span>
        <button type="button" data-exam-question-next>Suivante →</button>
      </nav>
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
      data-copy-number="${index + 1}"
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
  await loadApprovedStageIds();
  await applyAutomaticIdUniqueBonuses(answers, sheet);

  sheetStatus.hidden = true;
  sheetStatus.style.display = "none";

  sheetContent.hidden = false;
  sheetContent.innerHTML = `
    <div class="exam-dashboard-tools">
      <div class="exam-stats-grid">
        <div class="exam-stat-card">
          <span>Total copies</span>
          <strong data-stat-total>0</strong>
        </div>

        <div class="exam-stat-card approved">
          <span>Approuvés</span>
          <strong data-stat-approved>0</strong>
        </div>

        <div class="exam-stat-card rejected">
          <span>Refusés</span>
          <strong data-stat-rejected>0</strong>
        </div>

        <div class="exam-stat-card pending">
          <span>En attente</span>
          <strong data-stat-pending>0</strong>
        </div>

        <div class="exam-stat-card average">
          <span>Moyenne</span>
          <strong data-stat-average>0 / ${getExamMaxPoints()}</strong>
        </div>
      </div>

      <div class="exam-toolbar">
        <div class="exam-search-box">
          <span>Recherche</span>
          <input
            type="text"
            placeholder="Nom, prénom ou ID Unique..."
            data-exam-search
          >
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
        <h2>${escapeHtml(sheet.label)}</h2>
      </div>

      <div class="student-results-actions">
        <span>${answers.length} copie(s)</span>

        <button
          type="button"
          class="copy-all-results-btn"
          data-copy-all-results
        >
          Envoyer liste
        </button>
      </div>
    </div>

    <div class="exam-empty-filter" data-exam-empty-filter hidden>
      Aucun résultat ne correspond à cette recherche.
    </div>

    <div class="student-answer-grid">
      ${answers.map((answer, index) => renderAnswerCard(answer, index, sheet)).join("")}
    </div>
  `;

  bindCardQuestionNavigation();
  bindCardToggles();
  bindStatusButtons();
  bindScoreControls();
  bindCopyResultButtons();
  bindCopyAllResultsButton();
  bindExamDashboardTools();
}

async function loadSheet(sheet, { force = false, silent = false } = {}) {
  if (!window.currentProfUser) {
    window.location.href = "espace-prof.html";
    return false;
  }

  if (sheetLoadInFlight) return false;
  sheetLoadInFlight = true;
  activeSheetId = sheet.id;

  setActiveTab(sheet.id);
  if (!silent) setLoading(sheet.label);

  try {
    let answers;

    if (force) cache.delete(sheet.id);

    if (cache.has(sheet.id)) {
      answers = cache.get(sheet.id);
    } else {
      const response = await fetch(buildCsvUrl(sheet), {
        cache: "no-store",
        headers: await buildSecureSheetHeaders()
      });

      if (!response.ok) {
        throw new Error(`Erreur lecture sécurisée : ${response.status}`);
      }

      const csvText = await response.text();
      const rows = parseCsv(csvText);
      answers = rowsToAnswers(rows);

      cache.set(sheet.id, answers);
    }

    await renderAnswers(answers, sheet);
    return true;
  } catch (error) {
    console.error("Erreur chargement examens sécurisés :", error);
    if (!silent) {
      setError("Impossible de charger les réponses d'examen. Vérifie la connexion prof et le réglage Google Sheets.");
    }
    return false;
  } finally {
    sheetLoadInFlight = false;
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

function isMobileExamViewport() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function getCardQuestionLines(card) {
  return Array.from(card?.querySelectorAll("[data-exam-line]") || []);
}

function getInitialQuestionIndex(card, lines) {
  const answerKey = card?.dataset.answerKey || "";
  const storedIndex = activeExamQuestionIndexes.get(answerKey);

  if (Number.isInteger(storedIndex) && storedIndex >= 0 && storedIndex < lines.length) {
    return storedIndex;
  }

  const firstUnscored = lines.findIndex(line => line.dataset.scored !== "true");
  return firstUnscored >= 0 ? firstUnscored : 0;
}

function renderCardQuestion(card, requestedIndex) {
  if (!card) return;

  const lines = getCardQuestionLines(card);
  if (!lines.length) return;

  const answerKey = card.dataset.answerKey || "";
  const fallbackIndex = getInitialQuestionIndex(card, lines);
  const safeIndex = Math.max(0, Math.min(
    Number.isInteger(requestedIndex) ? requestedIndex : fallbackIndex,
    lines.length - 1
  ));

  activeExamQuestionIndexes.set(answerKey, safeIndex);

  lines.forEach((line, index) => {
    line.classList.toggle("is-current", index === safeIndex);
  });

  const current = card.querySelector("[data-exam-current-question]");
  const progress = card.querySelector("[data-exam-question-progress]");
  const meter = card.querySelector("[data-exam-question-meter]");
  const previous = card.querySelector("[data-exam-question-previous]");
  const next = card.querySelector("[data-exam-question-next]");

  if (current) current.textContent = String(safeIndex + 1);
  if (progress) progress.textContent = `${safeIndex + 1} / ${lines.length}`;
  if (meter) meter.style.width = `${((safeIndex + 1) / lines.length) * 100}%`;
  if (previous) previous.disabled = safeIndex === 0;
  if (next) next.disabled = safeIndex === lines.length - 1;
}

function openExamCard(cards, selectedCard, { scroll = false } = {}) {
  cards.forEach(card => {
    const isSelected = card === selectedCard;
    card.classList.toggle("collapsed", !isSelected);
    card.classList.toggle("is-open", isSelected);

    const icon = card.querySelector(".student-toggle-icon");
    if (icon) icon.textContent = isSelected ? "−" : "+";
  });

  if (!selectedCard) {
    activeExamAnswerKey = "";
    return;
  }

  activeExamAnswerKey = selectedCard.dataset.answerKey || "";
  renderCardQuestion(selectedCard);

  if (scroll && isMobileExamViewport()) {
    setTimeout(() => {
      selectedCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }
}

function ensureActiveExamCardVisible() {
  if (isMobileExamViewport()) return;

  const cards = getAllExamCards();
  const visibleCards = cards.filter(card => card.style.display !== "none");
  if (!visibleCards.length) return;

  const currentCard = visibleCards.find(card => card.dataset.answerKey === activeExamAnswerKey);
  const selectedCard = currentCard || visibleCards[0];

  if (!selectedCard.classList.contains("is-open")) {
    openExamCard(cards, selectedCard);
  }
}

function bindCardQuestionNavigation() {
  document.querySelectorAll("[data-answer-card]").forEach(card => {
    const answerKey = card.dataset.answerKey || "";
    const lines = getCardQuestionLines(card);
    if (!lines.length) return;

    renderCardQuestion(card, activeExamQuestionIndexes.get(answerKey));

    card.querySelector("[data-exam-question-previous]")?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const currentIndex = activeExamQuestionIndexes.get(answerKey) || 0;
      renderCardQuestion(card, currentIndex - 1);
    });

    card.querySelector("[data-exam-question-next]")?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const currentIndex = activeExamQuestionIndexes.get(answerKey) || 0;
      renderCardQuestion(card, currentIndex + 1);
    });
  });
}

function bindCardToggles() {
  const cards = Array.from(document.querySelectorAll("[data-answer-card]"));
  const storedCard = cards.find(card => card.dataset.answerKey === activeExamAnswerKey);
  const initialCard = storedCard || (!isMobileExamViewport() ? cards[0] : null);

  openExamCard(cards, initialCard);

  document.querySelectorAll("[data-toggle-card]").forEach(button => {
    button.addEventListener("click", () => {
      const selectedCard = button.closest("[data-answer-card]");
      if (!selectedCard) return;

      const isAlreadyOpen = selectedCard.classList.contains("is-open");

      if (isAlreadyOpen && isMobileExamViewport()) {
        openExamCard(cards, null);
        return;
      }

      openExamCard(cards, selectedCard, { scroll: true });
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

  applyExamDashboardTools();
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
      scoreBadge.textContent = `0 / ${getExamMaxPoints()}`;
    } else if (totalScore >= getExamPassPoints()) {
      scoreBadge.classList.add("score-approved");
      scoreBadge.textContent = `${totalScore} / ${getExamMaxPoints()}`;
    } else {
      scoreBadge.classList.add("score-rejected");
      scoreBadge.textContent = `${totalScore} / ${getExamMaxPoints()}`;
    }
  }

  updateCardStatus(card, record.status);

  const copyButton = card.querySelector("[data-copy-result]");
  if (copyButton) {
    copyButton.dataset.copyScore = String(totalScore);
  }

  applyExamDashboardTools();
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
  document.querySelectorAll("[data-score-choice]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const control = button.closest("[data-score-control]");
      const input = control?.querySelector("[data-score-input]");
      if (!control || !input) return;

      input.value = String(button.dataset.scoreChoice || 0);
      control.querySelectorAll("[data-score-choice]").forEach(choice => {
        choice.classList.toggle("active", choice === button);
      });
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

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

      control.querySelectorAll("[data-score-choice]").forEach(choice => {
        choice.classList.toggle("active", Number(choice.dataset.scoreChoice) === newScore);
      });

      const line = input.closest("[data-exam-line]");
      if (line) line.dataset.scored = "true";

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
      renderCardQuestion(card, activeExamQuestionIndexes.get(answerKey));

      const questionState = card.querySelector("[data-exam-question-state]");
      if (questionState) questionState.textContent = "Sauvegarde en cours…";

      window.dispatchEvent(new CustomEvent("prof:correction-save", {
        detail: { state: "saving", card, advance: false }
      }));

      try {
        await saveExamRecordToFirebase(answerKey, sheetId, record, identity);
        if (questionState) questionState.textContent = "✓ Note sauvegardée";
        window.dispatchEvent(new CustomEvent("prof:correction-save", {
          detail: { state: "saved", card, advance: false }
        }));
      } catch (error) {
        console.error("Erreur sauvegarde score Firebase :", error);
        window.dispatchEvent(new CustomEvent("prof:correction-save", {
          detail: { state: "error", card, advance: false }
        }));
        alert("Impossible de sauvegarder les points. Réessaie dans quelques instants.");
        if (questionState) questionState.textContent = "Échec de la sauvegarde";
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

      const textToCopy = `${name} ${score}/${getExamMaxPoints()}`;

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
   COPY ALL RESULTS
========================================================= */

function buildSimpleResultsListFromCards() {
  return getExamResultsFromCards()
    .map(result => `${result.name} ${result.score}`)
    .join("\n");
}

function getExamStatusLabel(status) {
  switch (status) {
    case "approved":
      return "Approuvé";
    case "rejected":
      return "Refusé";
    default:
      return "En attente";
  }
}

function getExamCardsForResultsList() {
  const visibleCards = getVisibleExamCards();
  return visibleCards.length ? visibleCards : getAllExamCards();
}

function getExamResultsFromCards() {
  return getExamCardsForResultsList().map(card => {
    const name =
      card.dataset.studentName ||
      card.querySelector("h2")?.textContent?.trim() ||
      "Élève";

    const score =
      card.querySelector("[data-total-score-badge]")?.textContent
        ?.replace(/\s+/g, " ")
        .replace(/\s*\/\s*/g, "/")
        .trim() ||
      `0/${getExamMaxPoints()}`;

    return {
      name,
      score,
      status: card.dataset.status || "pending",
      statusLabel: getExamStatusLabel(card.dataset.status || "pending")
    };
  });
}

function formatExamPreviewDate(value) {
  const parts = String(value || "").split("-");
  if (parts.length !== 3) return "Non renseignée";

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function buildExamPreviewMessage({ startDate, endDate, results }) {
  const studentList = results
    .map(result => `- ${result.name} : ${result.score} - ${result.statusLabel}`)
    .join("\n");

  return [
    `# Résultats du cursus ${formatExamPreviewDate(startDate)} au ${formatExamPreviewDate(endDate)} <@&1199780299786158160> !`,
    "",
    studentList || "Aucun élève visible.",
    "",
    "",
    "Cordialement",
    "L'équipe des professeurs de Mécanique"
  ].join("\n");
}

function buildApprovedExamMessage(results) {
  const approvedList = results
    .filter(result => result.status === "approved")
    .map(result => `- ${result.name} : ${result.score}`)
    .join("\n");

  return [
    "Bonsoir <@&1169634939797524480> voici la liste des approuvés pour ce cursus.",
    "",
    approvedList || "Aucun élève approuvé détecté.",
    "",
    "Merci"
  ].join("\n");
}

async function sendExamListDiscordMessage(message, roleIds = []) {
  const user = window.currentProfUser;

  if (!user?.getIdToken) {
    throw new Error("Connexion professeur requise pour envoyer sur Discord.");
  }

  const idToken = await user.getIdToken(true);
  const response = await fetch(EXAM_RESULTS_SEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({
      content: message,
      allowed_mentions: {
        parse: [],
        roles: roleIds
      }
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Envoi Discord impossible (${response.status}). ${details}`);
  }
}

function updateExamListPreview(modal) {
  const preview = modal.querySelector("[data-exam-list-preview]");
  const count = modal.querySelector("[data-exam-list-count]");
  const startInput = modal.querySelector("[data-exam-list-start]");
  const endInput = modal.querySelector("[data-exam-list-end]");
  const results = getExamResultsFromCards();

  if (count) {
    count.textContent = results.length
      ? `${results.length} copie(s) détectée(s)`
      : "Aucune copie détectée";
  }

  if (preview) {
    preview.textContent = buildExamPreviewMessage({
      startDate: startInput?.value || "",
      endDate: endInput?.value || "",
      results
    });
  }
}

function closeExamListModal() {
  const modal = document.getElementById("examListModal");
  if (!modal) return;

  modal.classList.remove("active");
  modal.classList.add("closing");

  setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove("closing");
  }, 180);
}

function ensureExamListModal() {
  let modal = document.getElementById("examListModal");
  if (modal) return modal;

  document.body.insertAdjacentHTML("beforeend", `
    <div class="exam-list-modal" id="examListModal" hidden>
      <div class="exam-list-backdrop" data-exam-list-close></div>

      <section class="exam-list-card" role="dialog" aria-modal="true" aria-labelledby="examListTitle">
        <div class="exam-list-head">
          <div>
            <p class="kicker">Examens</p>
            <h2 id="examListTitle">Envoyer liste</h2>
          </div>

          <button type="button" class="exam-list-close" data-exam-list-close>
            ×
          </button>
        </div>

        <div class="exam-list-grid">
          <label>
            <span>Début du cursus</span>
            <input type="date" data-exam-list-start>
          </label>

          <label>
            <span>Fin du cursus</span>
            <input type="date" data-exam-list-end>
          </label>
        </div>

        <div class="exam-list-preview">
          <div class="exam-list-preview-head">
            <strong>Aperçu</strong>
            <span data-exam-list-count></span>
          </div>
          <pre data-exam-list-preview></pre>
        </div>

        <div class="exam-list-actions">
          <span data-exam-list-status></span>
          <button type="button" class="btn secondary" data-exam-list-close>Fermer</button>
          <button type="button" class="btn primary" data-exam-list-copy>Copier message</button>
          <button type="button" class="btn primary" data-exam-list-send>Envoyer avec le bot</button>
        </div>
      </section>
    </div>
  `);

  modal = document.getElementById("examListModal");

  modal.querySelectorAll("[data-exam-list-close]").forEach(button => {
    button.addEventListener("click", closeExamListModal);
  });

  modal.querySelectorAll("[data-exam-list-start], [data-exam-list-end]").forEach(input => {
    input.addEventListener("input", () => updateExamListPreview(modal));
  });

  modal.querySelector("[data-exam-list-copy]")?.addEventListener("click", async () => {
    const preview = modal.querySelector("[data-exam-list-preview]");
    const status = modal.querySelector("[data-exam-list-status]");
    const message = preview?.textContent || "";

    if (!message.trim()) {
      if (status) {
        status.textContent = "Aucun message à copier.";
        status.dataset.tone = "error";
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(message);
      if (status) {
        status.textContent = "Message copié.";
        status.dataset.tone = "ok";
      }
    } catch (error) {
      console.error("Erreur copie message examens :", error);
      alert(`Message à copier :\n${message}`);
    }
  });

  modal.querySelector("[data-exam-list-send]")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    const preview = modal.querySelector("[data-exam-list-preview]");
    const status = modal.querySelector("[data-exam-list-status]");
    const message = preview?.textContent || "";
    const approvedMessage = buildApprovedExamMessage(getExamResultsFromCards());

    if (!message.trim()) {
      if (status) {
        status.textContent = "Aucun message à envoyer.";
        status.dataset.tone = "error";
      }
      return;
    }

    button.disabled = true;
    const previousText = button.textContent;
    button.textContent = "Envoi...";

    if (status) {
      status.textContent = "Envoi par le bot en cours...";
      status.dataset.tone = "";
    }

    try {
      await sendExamListDiscordMessage(message, ["1199780299786158160"]);

      if (status) {
        status.textContent = "Liste complète envoyée, envoi des approuvés...";
        status.dataset.tone = "";
      }

      await sendExamListDiscordMessage(approvedMessage, ["1169634939797524480"]);

      if (status) {
        status.textContent = "Messages envoyés par le bot.";
        status.dataset.tone = "ok";
      }
    } catch (error) {
      console.error("Erreur envoi Discord examens :", error);

      if (status) {
        status.textContent = "Envoi impossible, message copiable.";
        status.dataset.tone = "error";
      }

      alert("Envoi Discord impossible. Le message reste disponible à copier.");
    } finally {
      button.disabled = false;
      button.textContent = previousText;
    }
  });

  return modal;
}

function openExamListModal() {
  const modal = ensureExamListModal();
  const today = new Date().toISOString().slice(0, 10);
  const startInput = modal.querySelector("[data-exam-list-start]");
  const endInput = modal.querySelector("[data-exam-list-end]");
  const status = modal.querySelector("[data-exam-list-status]");

  if (startInput && !startInput.value) startInput.value = today;
  if (endInput && !endInput.value) endInput.value = today;
  if (status) {
    status.textContent = "";
    status.dataset.tone = "";
  }

  updateExamListPreview(modal);

  modal.hidden = false;
  modal.classList.remove("closing");
  requestAnimationFrame(() => {
    modal.classList.add("active");
  });
}

function bindCopyAllResultsButton() {
  const button = document.querySelector("[data-copy-all-results]");
  if (!button) return;

  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();

    if (!buildSimpleResultsListFromCards()) {
      alert("Aucun résultat à copier.");
      return;
    }

    openExamListModal();
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

      window.dispatchEvent(new CustomEvent("prof:correction-save", {
        detail: { state: "saving", card, advance: true }
      }));

      try {
        await saveExamRecordToFirebase(answerKey, sheetId, record, identity);
        window.dispatchEvent(new CustomEvent("prof:correction-save", {
          detail: { state: "saved", card, advance: true }
        }));
      } catch (error) {
        console.error("Erreur sauvegarde statut Firebase examens :", error);
        window.dispatchEvent(new CustomEvent("prof:correction-save", {
          detail: { state: "error", card, advance: false }
        }));
        alert("Impossible de sauvegarder le statut. Réessaie dans quelques instants.");
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
void loadSheet(SHEETS[0]);

window.addEventListener("prof:live-refresh", () => {
  if (!window.currentProfUser || sheetLoadInFlight) return;
  const sheet = SHEETS.find(item => item.id === activeSheetId) || SHEETS[0];
  void loadSheet(sheet, { force: true, silent: true });
});



