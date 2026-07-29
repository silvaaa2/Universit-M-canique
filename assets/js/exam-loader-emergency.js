const EMERGENCY_AFTER_VISIBLE_DELAY_MS = 5000;
const EMERGENCY_FETCH_TIMEOUT_MS = 12000;
const EMERGENCY_CHECK_INTERVAL_MS = 1000;
const DEFAULT_EXAM_SHEET_ID = "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY";
const DEFAULT_EXAM_GID = "282279229";
const DEFAULT_EXAM_LABEL = "Réponses formulaire";
const STATUS_COLLECTION = "examAnswerStatuses";

let emergencyStarted = false;
let firstVisibleAt = 0;

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
    .replace(/\s+/g, " ");
}

function normalizeIdUnique(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
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
  const headers = rows[0] || [];
  return rows.slice(1).map(row => {
    const answer = { __orderedFields: [] };

    headers.forEach((header, index) => {
      const label = String(header || "").trim() || `Question ${index + 1}`;
      const value = String(row[index] || "").trim();
      answer[label] = value;
      answer.__orderedFields.push({ label, value, index });
    });

    return answer;
  }).filter(answer => answer.__orderedFields.some(field => field.value));
}

function getField(answer, labels) {
  const wanted = labels.map(normalizeHeader);
  const found = answer.__orderedFields.find(field => wanted.includes(normalizeHeader(field.label)));
  return found?.value || "";
}

function getStudentName(answer, index) {
  return getField(answer, ["Prénom / Nom (RP)", "Prénom - Nom (RP)", "Nom de l'élève", "Nom", "Nom Prénom"])
    || `Copie ${index + 1}`;
}

function shouldDisplayField(field) {
  const label = normalizeHeader(field.label);
  return ![
    normalizeHeader("Horodateur"),
    normalizeHeader("Timestamp"),
    normalizeHeader("Adresse e-mail"),
    normalizeHeader("Email"),
    normalizeHeader("Adresse mail"),
    normalizeHeader("Score")
  ].includes(label);
}

function getSettings() {
  const settings = window.__examResponsesSettings || {};
  return {
    spreadsheetId: settings.spreadsheetId || DEFAULT_EXAM_SHEET_ID,
    gid: String(settings.gid || DEFAULT_EXAM_GID),
    label: settings.label || DEFAULT_EXAM_LABEL
  };
}

function buildCsvUrl() {
  const settings = getSettings();
  return `https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/export?format=csv&gid=${settings.gid}`;
}

async function fetchCsvWithTimeout() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMERGENCY_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(buildCsvUrl(), { signal: controller.signal });
    if (!response.ok) throw new Error(`Google Sheets ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function getStatusMeta(status) {
  switch (status) {
    case "approved":
      return { label: "Approuvé", className: "approved" };
    case "rejected":
      return { label: "Refusé", className: "rejected" };
    default:
      return { label: "En attente", className: "pending" };
  }
}

function renderAnswerFields(answer) {
  return answer.__orderedFields
    .filter(shouldDisplayField)
    .map((field, index) => `
      <div class="exam-line">
        <div class="exam-line-number">${String(index + 1).padStart(2, "0")}</div>
        <div class="exam-line-content">
          <span>${escapeHtml(field.label)}</span>
          <strong>${escapeHtml(field.value || "Non renseigné")}</strong>
        </div>
        <div class="exam-line-score exam-score-control exam-score-missing">
          <span>Mode secours</span>
        </div>
      </div>
    `).join("");
}

function renderEmergencyCard(answer, index) {
  const settings = getSettings();
  const name = getStudentName(answer, index);
  const idUnique = getField(answer, ["ID Unique", "ID"]);
  const answerKey = `exam-form-1__${index}__${getField(answer, ["Horodateur", "Timestamp"])}__${name}`;
  const status = "pending";
  const meta = getStatusMeta(status);

  return `
    <article class="student-answer-card collapsed status-${meta.className}"
      data-answer-card
      data-answer-key="${escapeHtml(answerKey)}"
      data-sheet-id="exam-form-1"
      data-status="${status}"
      data-student-name="${escapeHtml(name)}"
      data-id-unique="${escapeHtml(idUnique)}"
      data-normalized-id-unique="${escapeHtml(normalizeIdUnique(idUnique))}">
      <div class="student-card-top">
        <button type="button" class="student-card-main student-card-open-zone" data-emergency-toggle-card>
          <p class="student-kicker">${escapeHtml(settings.label)} · Copie ${index + 1}</p>
          <h2>${escapeHtml(name)}</h2>
        </button>

        <div class="student-tags">
          <span class="student-id-badge">${escapeHtml(idUnique || "Copie")}</span>
          <span class="student-score-badge score-pending" data-total-score-badge>0 / 50</span>
          <span class="student-status-badge status-${meta.className}" data-status-badge>${meta.label}</span>
          <button type="button" class="copy-result-btn" data-copy-result data-copy-name="${escapeHtml(name)}" data-copy-score="0">Copier résultat</button>
          <button type="button" class="student-toggle-icon" data-emergency-toggle-card>+</button>
        </div>
      </div>

      <div class="student-card-body">
        <div class="student-status-actions">
          <button type="button" class="student-status-btn approve" data-emergency-status="approved">Approuver</button>
          <button type="button" class="student-status-btn reject" data-emergency-status="rejected">Refuser</button>
          <button type="button" class="student-status-btn pending" data-emergency-status="pending">En attente</button>
        </div>

        <section class="student-section exam-ordered-section">
          <div class="student-section-head">
            <h3>Réponses chargées en mode secours</h3>
          </div>
          <div class="exam-lines-list">
            ${renderAnswerFields(answer) || `<div class="student-empty">Aucune réponse trouvée.</div>`}
          </div>
        </section>
      </div>
    </article>
  `;
}

function updateEmergencyStats() {
  const cards = Array.from(document.querySelectorAll("[data-answer-card]"));
  const visibleCards = cards.filter(card => card.style.display !== "none");
  const approved = visibleCards.filter(card => card.dataset.status === "approved").length;
  const rejected = visibleCards.filter(card => card.dataset.status === "rejected").length;
  const pending = visibleCards.filter(card => card.dataset.status === "pending").length;

  const totalEl = document.querySelector("[data-stat-total]");
  const approvedEl = document.querySelector("[data-stat-approved]");
  const rejectedEl = document.querySelector("[data-stat-rejected]");
  const pendingEl = document.querySelector("[data-stat-pending]");
  const averageEl = document.querySelector("[data-stat-average]");

  if (totalEl) totalEl.textContent = String(visibleCards.length);
  if (approvedEl) approvedEl.textContent = String(approved);
  if (rejectedEl) rejectedEl.textContent = String(rejected);
  if (pendingEl) pendingEl.textContent = String(pending);
  if (averageEl) averageEl.textContent = "0 / 50";
}

async function saveEmergencyStatus(card, status) {
  const firebase = window.profFirebase;
  if (!firebase?.db || typeof firebase.setDoc !== "function") return;

  const ref = firebase.doc(firebase.db, STATUS_COLLECTION, encodeURIComponent(card.dataset.answerKey || ""));
  await firebase.setDoc(ref, {
    answerKey: card.dataset.answerKey || "",
    sheetId: card.dataset.sheetId || "exam-form-1",
    studentName: card.dataset.studentName || "",
    idUnique: card.dataset.idUnique || "",
    normalizedIdUnique: card.dataset.normalizedIdUnique || "",
    status,
    fieldScores: {},
    totalScore: 0,
    maxScore: 50,
    hasScoring: false,
    emergencyMode: true,
    updatedBy: window.currentProfUser?.email || "professeur inconnu",
    updatedAt: firebase.serverTimestamp()
  }, { merge: true });
}

function bindEmergencyCards() {
  document.querySelectorAll("[data-emergency-toggle-card]").forEach(button => {
    button.addEventListener("click", () => {
      const selectedCard = button.closest("[data-answer-card]");
      if (!selectedCard) return;
      const wasOpen = selectedCard.classList.contains("is-open");

      document.querySelectorAll("[data-answer-card]").forEach(card => {
        card.classList.add("collapsed");
        card.classList.remove("is-open");
        const icon = card.querySelector(".student-toggle-icon");
        if (icon) icon.textContent = "+";
      });

      if (!wasOpen) {
        selectedCard.classList.remove("collapsed");
        selectedCard.classList.add("is-open");
        const icon = selectedCard.querySelector(".student-toggle-icon");
        if (icon) icon.textContent = "−";
      }
    });
  });

  document.querySelectorAll("[data-emergency-status]").forEach(button => {
    button.addEventListener("click", async event => {
      event.stopPropagation();
      const card = button.closest("[data-answer-card]");
      if (!card) return;

      const status = button.dataset.emergencyStatus || "pending";
      const meta = getStatusMeta(status);
      card.dataset.status = status;
      card.classList.remove("status-approved", "status-rejected", "status-pending");
      card.classList.add(`status-${meta.className}`);

      const badge = card.querySelector("[data-status-badge]");
      if (badge) {
        badge.className = `student-status-badge status-${meta.className}`;
        badge.textContent = meta.label;
      }

      updateEmergencyStats();

      try {
        await saveEmergencyStatus(card, status);
      } catch (error) {
        console.error("Sauvegarde statut secours impossible :", error);
      }
    });
  });
}

function renderEmergencyAnswers(answers) {
  const sheetStatus = document.getElementById("sheetStatus");
  const sheetContent = document.getElementById("sheetContent");
  const settings = getSettings();

  if (!sheetStatus || !sheetContent) return;

  sheetStatus.hidden = true;
  sheetStatus.style.display = "none";
  sheetContent.hidden = false;
  sheetContent.innerHTML = `
    <div class="inline-error-box" style="margin-bottom:16px; border-color:rgba(214,180,106,.35);">
      <h4>Mode secours examens</h4>
      <p>Le loader principal n'a pas terminé. Les copies sont affichées depuis Google Sheets pour éviter le chargement infini.</p>
    </div>

    <div class="exam-dashboard-tools">
      <div class="exam-stats-grid">
        <div class="exam-stat-card"><span>Total copies</span><strong data-stat-total>${answers.length}</strong></div>
        <div class="exam-stat-card approved"><span>Approuvés</span><strong data-stat-approved>0</strong></div>
        <div class="exam-stat-card rejected"><span>Refusés</span><strong data-stat-rejected>0</strong></div>
        <div class="exam-stat-card pending"><span>En attente</span><strong data-stat-pending>${answers.length}</strong></div>
        <div class="exam-stat-card average"><span>Moyenne</span><strong data-stat-average>0 / 50</strong></div>
      </div>
    </div>

    <div class="student-results">
      <div class="student-results-head">
        <div>
          <p class="student-kicker">Feuille sélectionnée</p>
          <h2>${escapeHtml(settings.label)}</h2>
        </div>
        <div class="student-results-actions">
          <span>${answers.length} copie(s)</span>
          <button type="button" class="copy-all-results-btn" data-copy-all-results>Envoyer liste</button>
        </div>
      </div>
      <div class="student-answer-grid">${answers.map(renderEmergencyCard).join("")}</div>
    </div>
  `;

  bindEmergencyCards();
  updateEmergencyStats();
}

function showEmergencyError(error) {
  const sheetStatus = document.getElementById("sheetStatus");
  const sheetContent = document.getElementById("sheetContent");

  if (!sheetStatus) return;

  sheetStatus.hidden = false;
  sheetStatus.style.display = "block";
  sheetStatus.innerHTML = `
    <div class="inline-error-box">
      <h4>Impossible de charger les examens</h4>
      <p>${escapeHtml(error?.message || "Le chargement a bloqué et le mode secours n'a pas réussi à lire Google Sheets.")}</p>
      <p style="margin-top:10px; opacity:.75; font-size:12px;">Secours examens v1010</p>
      <button type="button" class="btn secondary" onclick="window.location.reload()">Recharger</button>
    </div>
  `;

  if (sheetContent && !sheetContent.innerHTML.trim()) sheetContent.hidden = true;
}

function isProtectedContentVisible() {
  const protectedContent = document.getElementById("protectedContent");
  if (!protectedContent || protectedContent.hidden) return false;

  const style = window.getComputedStyle(protectedContent);
  return style.display !== "none" && style.visibility !== "hidden";
}

async function runEmergencyLoader() {
  if (emergencyStarted || document.querySelector("[data-answer-card]")) return;
  if (!isProtectedContentVisible()) return;

  emergencyStarted = true;

  try {
    const csvText = await fetchCsvWithTimeout();
    if (document.querySelector("[data-answer-card]")) return;

    const answers = rowsToAnswers(parseCsv(csvText));
    if (!answers.length) throw new Error("Aucune réponse trouvée dans la feuille examen.");

    renderEmergencyAnswers(answers);
  } catch (error) {
    console.error("Mode secours examens impossible :", error);
    if (!document.querySelector("[data-answer-card]")) showEmergencyError(error);
  }
}

function watchExamLoading() {
  if (document.querySelector("[data-answer-card]")) return;

  if (isProtectedContentVisible()) {
    if (!firstVisibleAt) firstVisibleAt = Date.now();

    const waitedAfterVisible = Date.now() - firstVisibleAt;
    if (waitedAfterVisible >= EMERGENCY_AFTER_VISIBLE_DELAY_MS) {
      runEmergencyLoader();
    }
  }

  if (!emergencyStarted && !document.querySelector("[data-answer-card]")) {
    window.setTimeout(watchExamLoading, EMERGENCY_CHECK_INTERVAL_MS);
  }
}

watchExamLoading();
