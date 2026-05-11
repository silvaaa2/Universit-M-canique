const SPREADSHEET_ID = "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY";

const SHEETS = [
  {
    id: "exam-form-1",
    label: "Réponses formulaire",
    gid: "282279229"
  }
];

const STATUS_COLLECTION = "examAnswerStatuses";

const EXAM_MAX_POINTS = 52;
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
let answerStatuses = {};

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
    .replace(/\s+/g, " ");
}

function normalizeQuestion(value) {
  return normalizeHeader(value)
    .replace(/[?.!]+$/g, "")
    .replace(/\s+/g, " ");
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
   FIREBASE STATUTS
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

function getRawScore(answer) {
  return getField(answer, [
    "Score",
    "Note",
    "Résultat",
    "Resultat"
  ]);
}

function parseScore(value) {
  const raw = String(value || "").trim();

  if (!raw) return null;

  const match = raw.match(/-?\d+(?:[.,]\d+)?/);

  if (!match) return null;

  const score = Number(match[0].replace(",", "."));

  if (Number.isNaN(score)) return null;

  return score;
}

function getAutoStatusFromScore(score) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return "pending";
  }

  return score >= EXAM_PASS_POINTS ? "approved" : "rejected";
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

async function loadStatusesForSheet(sheetId) {
  try {
    const firebase = await waitForFirebaseReady();

    const statusesRef = firebase.collection(firebase.db, STATUS_COLLECTION);
    const q = firebase.query(statusesRef, firebase.where("sheetId", "==", sheetId));
    const snap = await firebase.getDocs(q);

    answerStatuses = {};

    snap.forEach(docSnap => {
      const data = docSnap.data();

      if (data.answerKey && data.status) {
        answerStatuses[data.answerKey] = data.status;
      }
    });
  } catch (error) {
    console.error("Erreur chargement statuts Firebase examens :", error);
    answerStatuses = {};
  }
}

async function saveAnswerStatusToFirebase(answerKey, sheetId, status) {
  const firebase = await waitForFirebaseReady();
  const docId = buildStatusDocId(answerKey);

  const ref = firebase.doc(firebase.db, STATUS_COLLECTION, docId);

  await firebase.setDoc(ref, {
    answerKey,
    sheetId,
    status,
    updatedBy: window.currentProfUser?.email || "professeur inconnu",
    updatedAt: firebase.serverTimestamp()
  }, { merge: true });
}

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

function getAnswerStatus(answerKey, autoStatus) {
  return answerStatuses[answerKey] || autoStatus || "pending";
}

/* =========================================================
   POINTS
========================================================= */

function getQuestionPoints(label) {
  const normalizedLabel = normalizeQuestion(label);

  const foundKey = Object.keys(QUESTION_POINTS).find(key => {
    return normalizeQuestion(key) === normalizedLabel;
  });

  if (!foundKey) return null;

  return QUESTION_POINTS[foundKey];
}

function renderPointsBadge(points) {
  if (points === null || points === undefined) {
    return "";
  }

  const suffix = points > 1 ? "pts" : "pt";

  return `
    <div class="exam-points-badge">
      +${escapeHtml(points)} ${suffix}
    </div>
  `;
}

function renderScoreBadge(score) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return `
      <span class="student-score-badge score-pending">
        Score inconnu
      </span>
    `;
  }

  const scoreClass = score >= EXAM_PASS_POINTS ? "score-approved" : "score-rejected";

  return `
    <span class="student-score-badge ${scoreClass}">
      ${escapeHtml(score)} / ${EXAM_MAX_POINTS}
    </span>
  `;
}

/* =========================================================
   RENDER
========================================================= */

function renderExamLine(label, value, index) {
  const cleanValue = getValue(value);
  const points = getQuestionPoints(label);

  if (isLink(cleanValue)) {
    return `
      <div class="exam-line">
        <div class="exam-line-number">${String(index + 1).padStart(2, "0")}</div>

        <div class="exam-line-content">
          <div class="exam-line-head">
            <span>${escapeHtml(label)}</span>
            ${renderPointsBadge(points)}
          </div>

          <a href="${escapeHtml(cleanValue)}" target="_blank" rel="noopener noreferrer">
            Ouvrir le lien
          </a>
        </div>
      </div>
    `;
  }

  return `
    <div class="exam-line">
      <div class="exam-line-number">${String(index + 1).padStart(2, "0")}</div>

      <div class="exam-line-content">
        <div class="exam-line-head">
          <span>${escapeHtml(label)}</span>
          ${renderPointsBadge(points)}
        </div>

        <strong>${escapeHtml(cleanValue)}</strong>
      </div>
    </div>
  `;
}

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

function renderExamAnswersSection(answer) {
  const orderedFields = answer.__orderedFields || [];

  const displayFields = orderedFields.filter(shouldDisplayExamField);

  const html = displayFields
    .map((field, index) => renderExamLine(field.label, field.value, index))
    .join("");

  return `
    <section class="student-section exam-ordered-section">
      <div class="student-section-head">
        <h3>Réponses dans l’ordre du formulaire</h3>
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

  const rawScore = getRawScore(answer);
  const score = parseScore(rawScore);
  const autoStatus = getAutoStatusFromScore(score);

  const answerKey = buildAnswerKey(answer, sheet.id, index);
  const status = getAnswerStatus(answerKey, autoStatus);
  const statusMeta = getStatusMeta(status);

  return `
    <article
      class="student-answer-card collapsed status-${escapeHtml(statusMeta.className)}"
      data-answer-card
      data-answer-key="${escapeHtml(answerKey)}"
      data-sheet-id="${escapeHtml(sheet.id)}"
      data-status="${escapeHtml(statusMeta.value)}"
    >
      <button type="button" class="student-card-top" data-toggle-card>
        <div class="student-card-main">
          <p class="student-kicker">${escapeHtml(sheet.label)} · Copie ${index + 1}</p>
          <h2>${escapeHtml(name)}</h2>
        </div>

        <div class="student-tags">
          <span class="student-id-badge">${escapeHtml(idUnique || "Copie")}</span>

          ${renderScoreBadge(score)}

          <span class="student-status-badge status-${escapeHtml(statusMeta.className)}" data-status-badge>
            ${escapeHtml(statusMeta.shortLabel)}
          </span>

          <span class="student-toggle-icon">+</span>
        </div>
      </button>

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

        ${renderExamAnswersSection(answer)}
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

  await loadStatusesForSheet(sheet.id);

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
   CARDS OPEN / CLOSE
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
   STATUS BUTTONS
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

      const oldStatus = card.dataset.status || "pending";

      updateCardStatus(card, newStatus);
      answerStatuses[answerKey] = newStatus;

      try {
        await saveAnswerStatusToFirebase(answerKey, sheetId, newStatus);
      } catch (error) {
        console.error("Erreur sauvegarde statut Firebase examens :", error);

        updateCardStatus(card, oldStatus);
        answerStatuses[answerKey] = oldStatus;

        alert("Impossible de sauvegarder le statut dans Firebase. Vérifie les règles Firestore.");
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
