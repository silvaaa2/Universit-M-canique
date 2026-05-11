const SPREADSHEET_ID = "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc";

const SHEETS = [
  {
    id: "dukes",
    label: "Dukes",
    gid: "1133112226"
  },
  {
    id: "sentinel",
    label: "Sentinel XS4",
    gid: "1138787690"
  },
  {
    id: "rumina",
    label: "Annis Rumina",
    gid: "49030161"
  }
];

const sheetTabs = document.getElementById("sheetTabs");
const sheetStatus = document.getElementById("sheetStatus");
const sheetContent = document.getElementById("sheetContent");

const minimizeAnswersBtn = document.getElementById("minimizeAnswersBtn");
const restoreAnswersBtn = document.getElementById("restoreAnswersBtn");
const answersMiniBar = document.getElementById("answersMiniBar");
const answersBody = document.getElementById("answersBody");

const cache = new Map();

const STATUS_STORAGE_KEY = "module4-answer-status-v1";

function loadStatuses() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStatuses(data) {
  localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(data));
}

let answerStatuses = loadStatuses();

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
    .replace(/[\u0300-\u036f]/g, "");
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

function buildAnswerKey(answer, sheetId, index) {
  const horodateur = getField(answer, ["Horodateur"]);
  const nom = getField(answer, ["Prénom - Nom (RP)", "Prénom - Nom", "Nom"]);
  const idUnique = getField(answer, ["ID Unique", "ID"]);

  return `${sheetId}__${index}__${horodateur}__${nom}__${idUnique}`;
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

function setAnswerStatus(answerKey, status) {
  answerStatuses[answerKey] = status;
  saveStatuses(answerStatuses);
}

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
      class="student-answer-card collapsed status-${escapeHtml(statusMeta.className)}"
      data-answer-card
      data-answer-key="${escapeHtml(answerKey)}"
      data-status="${escapeHtml(statusMeta.value)}"
    >
      <button type="button" class="student-card-top" data-toggle-card>
        <div class="student-card-main">
          <p class="student-kicker">${escapeHtml(sheet.label)} · Réponse ${index + 1}</p>
          <h2>${escapeHtml(nom || `Élève ${index + 1}`)}</h2>
        </div>

        <div class="student-tags">
          <span class="student-id-badge">${escapeHtml(idUnique || "ID inconnu")}</span>

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

        ${renderSection("Identité", identityHtml)}
        ${renderSection("Couleurs", colorsHtml)}
        ${renderSection("Photos envoyées", photosHtml)}
        ${renderSection("Autres réponses", extraHtml)}
      </div>
    </article>
  `;
}

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

function renderAnswers(answers, sheet) {
  if (!answers.length) {
    setEmpty(sheet.label);
    return;
  }

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
    if (cache.has(sheet.id)) {
      renderAnswers(cache.get(sheet.id), sheet);
      return;
    }

    const response = await fetch(buildCsvUrl(sheet.gid));

    if (!response.ok) {
      throw new Error(`Erreur Google Sheets : ${response.status}`);
    }

    const csvText = await response.text();
    const rows = parseCsv(csvText);
    const answers = rowsToAnswers(rows);

    cache.set(sheet.id, answers);
    renderAnswers(answers, sheet);
  } catch (error) {
    console.error("Erreur chargement Google Sheets :", error);
    setError("Vérifie que le Google Sheet est bien public avec lien, et que le GID est correct.");
  }
}

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
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const card = button.closest("[data-answer-card]");
      if (!card) return;

      const answerKey = card.dataset.answerKey;
      const newStatus = button.dataset.setStatus;

      if (!answerKey || !newStatus) return;

      setAnswerStatus(answerKey, newStatus);
      updateCardStatus(card, newStatus);
    });
  });

  document.querySelectorAll("[data-answer-card]").forEach((card) => {
    updateCardStatus(card, card.dataset.status || "pending");
  });
}

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

renderTabs();
bindMinimize();
loadSheet(SHEETS[0]);
