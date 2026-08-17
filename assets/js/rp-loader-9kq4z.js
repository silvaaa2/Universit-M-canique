const SHEETS = [
  {
    id: "sentinelClassic",
    label: "Sentinel Classic",
    spreadsheetId: "1rroFCRTih9jdnIJmp5n2WvXagITjaARiv4i0b-JejvU",
    gid: "574123607"
  },
  {
    id: "argento2f",
    label: "Argento 2F",
    spreadsheetId: "1Vv6XRfEKpCJGVFtGKoauE0rFyOTlEhuLHR_qUyfwqZw",
    gid: "848029927"
  },
  {
    id: "cypher",
    label: "Cypher",
    spreadsheetId: "1mkKA6K9f6n6sScfG93hShySKkOgxCDZQXwDL0LafvEQ",
    gid: "154372807"
  }
];

const STATUS_COLLECTION = "studentAnswerStatuses";

const sheetTabs = document.getElementById("sheetTabs");
const sheetStatus = document.getElementById("sheetStatus");
const sheetContent = document.getElementById("sheetContent");

const minimizeAnswersBtn = document.getElementById("minimizeAnswersBtn");
const restoreAnswersBtn = document.getElementById("restoreAnswersBtn");
const answersMiniBar = document.getElementById("answersMiniBar");
const answersBody = document.getElementById("answersBody");

const cache = new Map();
let answerStatuses = {};
let approvedCustomAnswers = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildCsvUrl(sheet) {
  return `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}/export?format=csv&gid=${sheet.gid}`;
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
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeIdUnique(value) {
  const normalizedId = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");

  const invalidIds = new Set([
    "",
    "-",
    "aucun",
    "idindisponible",
    "idinconnu",
    "inconnu",
    "n/a",
    "na",
    "nonrenseigne"
  ]);

  return invalidIds.has(normalizedId) ? "" : normalizedId;
}

function normalizeStudentName(value) {
  const normalizedName = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const invalidNames = new Set([
    "",
    "aucun",
    "eleve inconnu",
    "inconnu",
    "non renseigne"
  ]);

  return invalidNames.has(normalizedName) ? "" : normalizedName;
}

function buildStudentIdentity(idUnique, studentName) {
  return {
    id: normalizeIdUnique(idUnique),
    name: normalizeStudentName(studentName)
  };
}

function isSameStudentIdentity(firstIdentity, secondIdentity) {
  if (firstIdentity.id && secondIdentity.id) {
    return firstIdentity.id === secondIdentity.id;
  }

  return Boolean(
    firstIdentity.name &&
    secondIdentity.name &&
    firstIdentity.name === secondIdentity.name
  );
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

    headers.forEach((header, index) => {
      if (!header) return;
      answer[header] = row[index] || "";
    });

    return answer;
  });
}

/* =========================================================
   FIREBASE STATUTS PARTAGÉS
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

function buildAnswerKey(answer, sheetId, index) {
  const horodateur = getField(answer, ["Horodateur"]);
  const nom = getField(answer, ["Prénom - Nom (RP)", "Prénom - Nom", "Nom"]);
  const idUnique = getField(answer, ["ID Unique", "ID"]);

  return `${sheetId}__${index}__${horodateur}__${nom}__${idUnique}`;
}

function buildStatusDocId(answerKey) {
  return encodeURIComponent(answerKey);
}

async function loadStatusesForAllSheets() {
  try {
    const firebase = await waitForFirebaseReady();
    const nextStatuses = {};

    const results = await Promise.allSettled(SHEETS.map(async (sheet) => {
      const statusesRef = firebase.collection(firebase.db, STATUS_COLLECTION);
      const q = firebase.query(statusesRef, firebase.where("sheetId", "==", sheet.id));
      const snap = await firebase.getDocs(q);

      snap.forEach(docSnap => {
        const data = docSnap.data();

        if (data.answerKey && data.status) {
          nextStatuses[data.answerKey] = data.status;
        }
      });
    }));

    results.forEach((result) => {
      if (result.status === "rejected") {
        console.warn("Statut custom partiel impossible à charger :", result.reason);
      }
    });

    answerStatuses = nextStatuses;
  } catch (error) {
    console.error("Erreur chargement global statuts Firebase :", error);
    answerStatuses = {};
  }
}

async function saveAnswerStatusToFirebase(answerKey, sheetId, status, meta = {}) {
  const firebase = await waitForFirebaseReady();
  const docId = buildStatusDocId(answerKey);

  const ref = firebase.doc(firebase.db, STATUS_COLLECTION, docId);

  const idUnique = meta.idUnique || "";

  await firebase.setDoc(ref, {
    answerKey,
    sheetId,
    status,

    idUnique,
    normalizedIdUnique: normalizeIdUnique(idUnique),

    studentName: meta.studentName || "",
    customLabel: meta.customLabel || "",

    updatedBy: window.currentProfUser?.email || "professeur inconnu",
    updatedAt: firebase.serverTimestamp()
  }, { merge: true });
}

function getStatusMeta(status) {
  switch (status) {
    case "approved":
      return {
        value: "approved",
        label: "Approuvé",
        shortLabel: "✔ Approuvé",
        className: "approved"
      };

    case "rejected":
      return {
        value: "rejected",
        label: "Refusé",
        shortLabel: "✖ Refusé",
        className: "rejected"
      };

    default:
      return {
        value: "pending",
        label: "En attente",
        shortLabel: "• En attente",
        className: "pending"
      };
  }
}

function getAnswerStatus(answerKey) {
  return answerStatuses[answerKey] || "pending";
}

async function fetchAnswersForSheet(sheet) {
  if (cache.has(sheet.id)) {
    return cache.get(sheet.id);
  }

  const response = await fetch(buildCsvUrl(sheet));

  if (!response.ok) {
    throw new Error(`Erreur Google Sheets : ${response.status}`);
  }

  const csvText = await response.text();
  const rows = parseCsv(csvText);
  const answers = rowsToAnswers(rows);

  cache.set(sheet.id, answers);
  return answers;
}

async function ensureAllAnswersLoaded(activeSheet, activeAnswers) {
  cache.set(activeSheet.id, activeAnswers);

  const results = await Promise.allSettled(
    SHEETS
      .filter(sheet => !cache.has(sheet.id))
      .map(sheet => fetchAnswersForSheet(sheet))
  );

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.warn("Réponses custom partielles impossibles à charger :", result.reason);
    }
  });
}

function buildApprovedCustomAnswers() {
  const approvals = [];

  SHEETS.forEach((sheet) => {
    const answers = cache.get(sheet.id) || [];

    answers.forEach((answer, index) => {
      const answerKey = buildAnswerKey(answer, sheet.id, index);

      if (getAnswerStatus(answerKey) !== "approved") return;

      const studentName = getField(answer, ["Prénom - Nom (RP)", "Prénom - Nom", "Nom"]);
      const idUnique = getField(answer, ["ID Unique", "ID"]);
      const identity = buildStudentIdentity(idUnique, studentName);

      if (!identity.id && !identity.name) return;

      approvals.push({
        answerKey,
        identity,
        label: sheet.label
      });
    });
  });

  approvedCustomAnswers = approvals;
}

function getAlreadyApprovedInfo(answerKey, idUnique, studentName, status) {
  if (status === "approved") return null;

  const identity = buildStudentIdentity(idUnique, studentName);
  if (!identity.id && !identity.name) return null;

  const matchingApprovals = approvedCustomAnswers.filter((approval) => (
    approval.answerKey !== answerKey &&
    isSameStudentIdentity(identity, approval.identity)
  ));

  if (!matchingApprovals.length) return null;

  return {
    labels: Array.from(new Set(matchingApprovals.map(approval => approval.label)))
  };
}

function formatAlreadyApprovedLabel(info) {
  if (!info?.labels?.length) return "Déjà approuvé";
  return `Déjà approuvé (${info.labels.join(", ")})`;
}

/* =========================================================
   RENDER FIELDS
========================================================= */

function renderField(label, value) {
  const cleanValue = getValue(value);

  if (isLink(cleanValue)) {
    return `
      <a class="student-answer-field student-link-card" href="${escapeHtml(cleanValue)}" target="_blank" rel="noopener noreferrer">
        <span>${escapeHtml(label)}</span>
        <strong>Ouvrir le lien</strong>
      </a>
    `;
  }

  return `
    <div class="student-answer-field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(cleanValue)}</strong>
    </div>
  `;
}

function renderSection(title, fieldsHtml) {
  return `
    <section class="student-section">
      <div class="student-section-head">
        <h3>${escapeHtml(title)}</h3>
      </div>

      <div class="student-section-grid">
        ${fieldsHtml}
      </div>
    </section>
  `;
}

function getPhotoFields(answer) {
  return Object.entries(answer).filter(([key, value]) => {
    const normalizedKey = normalizeHeader(key);
    const cleanValue = String(value || "").trim();

    if (!cleanValue) return false;

    return (
      normalizedKey.includes("photo") ||
      normalizedKey.includes("final") ||
      normalizedKey.includes("screen") ||
      normalizedKey.includes("image")
    );
  });
}

function getExtraFields(answer) {
  const ignoredHeaders = [
    "horodateur",
    "prenom - nom (rp)",
    "prenom - nom",
    "nom",
    "id unique",
    "id",
    "couleur principale",
    "couleur secondaire",
    "couleur interieur",
    "couleur interieure",
    "nacre",
    "nacre",
    "score",
    "adresse e-mail",
    "email",
    "adresse mail"
  ];

  return Object.entries(answer).filter(([key, value]) => {
    const normalizedKey = normalizeHeader(key);

    if (!key || !String(key).trim()) return false;
    if (!String(value || "").trim()) return false;

    if (ignoredHeaders.includes(normalizedKey)) return false;
    if (normalizedKey.includes("photo")) return false;
    if (normalizedKey.includes("final")) return false;
    if (normalizedKey.includes("screen")) return false;
    if (normalizedKey.includes("image")) return false;

    return true;
  });
}

/* =========================================================
   CARTE RÉPONSE
========================================================= */

function renderAnswerCard(answer, index, sheet) {
  const horodateur = getField(answer, ["Horodateur"]);
  const nom = getField(answer, ["Prénom - Nom (RP)", "Prénom - Nom", "Nom"]);
  const idUnique = getField(answer, ["ID Unique", "ID"]);

  const couleurPrincipale = getField(answer, ["Couleur principale"]);
  const couleurSecondaire = getField(answer, ["Couleur secondaire"]);
  const couleurInterieur = getField(answer, ["Couleur intérieur", "Couleur intérieure"]);
  const nacre = getField(answer, ["Nacré", "Nacre"]);

  const email = getField(answer, ["Adresse e-mail", "Email", "Adresse mail"]);

  const photoFields = getPhotoFields(answer);
  const extraFields = getExtraFields(answer);

  const answerKey = buildAnswerKey(answer, sheet.id, index);
  const status = getAnswerStatus(answerKey);
  const statusMeta = getStatusMeta(status);

  const studentName = nom || `Élève ${index + 1}`;
  const alreadyApprovedInfo = getAlreadyApprovedInfo(answerKey, idUnique, nom, status);
  const alreadyApprovedClass = alreadyApprovedInfo ? " already-approved-elsewhere" : "";
  const alreadyApprovedLabel = formatAlreadyApprovedLabel(alreadyApprovedInfo);

  const identityHtml = [
    renderField("Nom RP", nom),
    renderField("ID Unique", idUnique),
    renderField("Horodateur", horodateur),
    renderField("E-mail", email)
  ].join("");

  const colorsHtml = [
    renderField("Couleur principale", couleurPrincipale),
    renderField("Couleur secondaire", couleurSecondaire),
    renderField("Couleur intérieure", couleurInterieur),
    renderField("Nacré", nacre)
  ].join("");

  const photosHtml = photoFields.length
    ? photoFields.map(([key, value]) => renderField(key, value)).join("")
    : `<div class="student-empty">Aucune photo renseignée.</div>`;

  const extraHtml = extraFields.length
    ? extraFields.map(([key, value]) => renderField(key, value)).join("")
    : `<div class="student-empty">Aucune information supplémentaire.</div>`;

  return `
    <article
      class="student-answer-card collapsed status-${escapeHtml(statusMeta.className)}${alreadyApprovedClass}"
      data-answer-card
      data-answer-key="${escapeHtml(answerKey)}"
      data-sheet-id="${escapeHtml(sheet.id)}"
      data-status="${escapeHtml(statusMeta.value)}"
      data-id-unique="${escapeHtml(idUnique)}"
      data-student-name="${escapeHtml(nom)}"
      data-custom-label="${escapeHtml(sheet.label)}"
      data-already-approved="${alreadyApprovedInfo ? "true" : "false"}"
    >
      <button type="button" class="student-card-top" data-toggle-card>
        <div class="student-card-main">
          <p class="student-kicker">${escapeHtml(sheet.label)} · Réponse ${index + 1}</p>
          <h2>${escapeHtml(studentName)}</h2>
        </div>

        <div class="student-tags">
          <span class="student-id-badge">${escapeHtml(idUnique || "ID inconnu")}</span>

          <span class="student-status-badge status-${escapeHtml(statusMeta.className)}" data-status-badge>
            ${escapeHtml(statusMeta.shortLabel)}
          </span>

          <span class="student-already-approved-badge" data-already-approved-badge ${alreadyApprovedInfo ? "" : "hidden"}>
            ${escapeHtml(alreadyApprovedLabel)}
          </span>

          <span class="student-toggle-icon">+</span>
        </div>
      </button>

      <div class="student-card-body">
        <div class="student-already-approved-panel" data-already-approved-panel ${alreadyApprovedInfo ? "" : "hidden"}>
          <strong>Déjà approuvé</strong>
          <span>Un autre custom de cet élève est déjà validé. Cette réponse n’est plus modifiable.</span>
        </div>

        <div class="student-status-actions" ${alreadyApprovedInfo ? "hidden" : ""}>
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

        ${renderSection("Identité", identityHtml)}
        ${renderSection("Couleurs", colorsHtml)}
        ${renderSection("Photos envoyées", photosHtml)}
        ${renderSection("Autres réponses", extraHtml)}
      </div>
    </article>
  `;
}

/* =========================================================
   STATES UI
========================================================= */

function setLoading(sheetLabel) {
  sheetStatus.hidden = false;
  sheetStatus.style.display = "flex";
  sheetStatus.innerHTML = `
    <div class="inline-loader"></div>
    <p>Chargement des réponses ${escapeHtml(sheetLabel)}...</p>
  `;

  sheetContent.hidden = true;
  sheetContent.innerHTML = "";
}

function setError(message) {
  sheetStatus.hidden = false;
  sheetStatus.style.display = "block";
  sheetStatus.innerHTML = `
    <div class="inline-error-box">
      <h4>Impossible de charger les réponses</h4>
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

  await ensureAllAnswersLoaded(sheet, answers);
  await loadStatusesForAllSheets();
  buildApprovedCustomAnswers();

  sheetStatus.hidden = true;
  sheetStatus.style.display = "none";

  sheetContent.hidden = false;
  sheetContent.innerHTML = `
    <div class="student-results-head">
      <div>
        <p class="student-kicker">Feuille sélectionnée</p>
        <h2>${escapeHtml(sheet.label)}</h2>
      </div>

      <span>${answers.length} réponse(s)</span>
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
      const response = await fetch(buildCsvUrl(sheet));

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
    console.error("Erreur chargement Google Sheets :", error);
    setError("Vérifie que le Google Sheet est bien public avec lien, et que le GID est correct.");
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
   OPEN / CLOSE CARDS
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

function setAlreadyApprovedState(card, info) {
  const isAlreadyApproved = Boolean(info);
  const label = formatAlreadyApprovedLabel(info);

  card.classList.toggle("already-approved-elsewhere", isAlreadyApproved);
  card.dataset.alreadyApproved = isAlreadyApproved ? "true" : "false";

  const badge = card.querySelector("[data-already-approved-badge]");
  if (badge) {
    badge.hidden = !isAlreadyApproved;
    badge.textContent = label;
  }

  const panel = card.querySelector("[data-already-approved-panel]");
  if (panel) {
    panel.hidden = !isAlreadyApproved;
  }

  const actions = card.querySelector(".student-status-actions");
  if (actions) {
    actions.hidden = isAlreadyApproved;
  }

  card.querySelectorAll("[data-set-status]").forEach((btn) => {
    btn.disabled = isAlreadyApproved;
  });
}

function applyAlreadyApprovedStates() {
  document.querySelectorAll("[data-answer-card]").forEach((card) => {
    const info = getAlreadyApprovedInfo(
      card.dataset.answerKey || "",
      card.dataset.idUnique || "",
      card.dataset.studentName || "",
      card.dataset.status || "pending"
    );

    setAlreadyApprovedState(card, info);
  });
}

function bindStatusButtons() {
  document.querySelectorAll("[data-set-status]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();

      if (button.disabled) return;

      const card = button.closest("[data-answer-card]");
      if (!card) return;

      const answerKey = card.dataset.answerKey;
      const sheetId = card.dataset.sheetId;
      const newStatus = button.dataset.setStatus;

      if (!answerKey || !sheetId || !newStatus) return;

      const oldStatus = card.dataset.status || "pending";

      const meta = {
        idUnique: card.dataset.idUnique || "",
        studentName: card.dataset.studentName || "",
        customLabel: card.dataset.customLabel || ""
      };

      updateCardStatus(card, newStatus);
      answerStatuses[answerKey] = newStatus;
      buildApprovedCustomAnswers();
      applyAlreadyApprovedStates();

      try {
        await saveAnswerStatusToFirebase(answerKey, sheetId, newStatus, meta);
      } catch (error) {
        console.error("Erreur sauvegarde statut Firebase :", error);

        updateCardStatus(card, oldStatus);
        answerStatuses[answerKey] = oldStatus;
        buildApprovedCustomAnswers();
        applyAlreadyApprovedStates();

        alert("Impossible de sauvegarder le statut. Réessaie dans quelques instants.");
      }
    });
  });

  document.querySelectorAll("[data-answer-card]").forEach((card) => {
    updateCardStatus(card, card.dataset.status || "pending");
  });

  applyAlreadyApprovedStates();
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

