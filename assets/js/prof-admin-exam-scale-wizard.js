const EXAM_SETTINGS_DOC = "examResponses";

let currentSettings = {};
let currentScale = [];
let wizardOpenedOnce = false;
let isSaving = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function extractSpreadsheetId(value) {
  const text = String(value || "").trim();
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
  return "";
}

function extractGid(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  try {
    const url = new URL(text);
    const searchGid = url.searchParams.get("gid");
    if (searchGid) return searchGid;

    const hashGid = url.hash.match(/gid=([0-9]+)/);
    if (hashGid?.[1]) return hashGid[1];
  } catch (error) {
    const rawGid = text.match(/gid=([0-9]+)/);
    if (rawGid?.[1]) return rawGid[1];
  }

  return "";
}

function waitForProfFirebase() {
  if (window.profFirebase?.db) {
    return Promise.resolve(window.profFirebase);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Firebase prof n'est pas prêt."));
    }, 8000);

    window.addEventListener("profFirebaseReady", () => {
      clearTimeout(timeout);
      resolve(window.profFirebase);
    }, { once: true });
  });
}

function normalizeQuestion(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isIdentityQuestion(label) {
  const normalized = normalizeQuestion(label);
  return (
    normalized === normalizeQuestion("Prénom / Nom (RP)") ||
    normalized === normalizeQuestion("Prénom - Nom (RP)") ||
    normalized === normalizeQuestion("ID Unique") ||
    normalized === normalizeQuestion("ID")
  );
}

function normalizeScale(source) {
  if (!Array.isArray(source)) return [];

  return source.reduce((scale, item) => {
    const label = String(item?.label || item?.question || "").trim();
    const points = Number(item?.points ?? item?.score ?? 0);

    if (label && !isIdentityQuestion(label) && Number.isFinite(points)) {
      scale.push({ label, points: Math.max(0, points) });
    }

    return scale;
  }, []);
}

function scaleFromPointsMap(pointsMap) {
  if (!pointsMap || typeof pointsMap !== "object" || Array.isArray(pointsMap)) return [];

  return Object.entries(pointsMap).reduce((scale, [label, points]) => {
    const cleanPoints = Number(points);

    if (label && !isIdentityQuestion(label) && Number.isFinite(cleanPoints)) {
      scale.push({ label, points: Math.max(0, cleanPoints) });
    }

    return scale;
  }, []);
}

function buildQuestionPoints(scale) {
  const questionPoints = {
    "Prénom / Nom (RP)": 0,
    "Prénom - Nom (RP)": 0,
    "ID Unique": 2,
    "ID": 2
  };

  scale.forEach(item => {
    if (item.label && !isIdentityQuestion(item.label)) {
      questionPoints[item.label] = Number(item.points || 0);
    }
  });

  return questionPoints;
}

function getScaleFromEditor() {
  return Array.from(document.querySelectorAll("[data-scale-wizard-row]")).reduce((scale, row) => {
    const label = row.querySelector("[data-scale-wizard-label]")?.value?.trim() || "";
    const points = Number(row.querySelector("[data-scale-wizard-points]")?.value || 0);

    if (label && !isIdentityQuestion(label) && Number.isFinite(points)) {
      scale.push({ label, points: Math.max(0, points) });
    }

    return scale;
  }, []);
}

function getSettingsFromEditor() {
  const spreadsheetUrl = document.getElementById("examSheetUrlInput")?.value?.trim() || currentSettings.spreadsheetUrl || "";
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl) || extractSpreadsheetId(currentSettings.spreadsheetId) || "";
  const gid = document.getElementById("examSheetGidInput")?.value?.trim() || extractGid(spreadsheetUrl) || currentSettings.gid || "282279229";
  const label = document.getElementById("examSheetLabelInput")?.value?.trim() || currentSettings.label || "Réponses formulaire";

  return {
    spreadsheetUrl,
    spreadsheetId,
    gid,
    label
  };
}

function injectWizardStyles() {
  if (document.getElementById("examScaleWizardStyles")) return;

  const style = document.createElement("style");
  style.id = "examScaleWizardStyles";
  style.textContent = `
    .exam-scale-wizard-card {
      display: grid;
      gap: 12px;
      border: 1px solid rgba(214,180,106,.16);
      border-radius: 8px;
      background:
        linear-gradient(135deg, rgba(214,180,106,.09), transparent 38%),
        rgba(255,255,255,.035);
      padding: 16px;
    }

    .exam-scale-wizard-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .exam-scale-wizard-summary {
      margin: 0;
      color: var(--text);
      font-size: 20px;
      font-weight: 1000;
    }

    .exam-scale-wizard-overlay {
      position: fixed;
      inset: 0;
      z-index: 12500;
      display: grid;
      place-items: center;
      padding: 18px;
      background: rgba(0,0,0,.72);
      backdrop-filter: blur(10px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s ease;
    }

    .exam-scale-wizard-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .exam-scale-wizard-overlay[hidden] {
      display: none !important;
    }

    .exam-scale-wizard-modal {
      width: min(980px, 100%);
      max-height: min(88vh, 860px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid rgba(214,180,106,.26);
      border-radius: 8px;
      background:
        radial-gradient(circle at 18% 0%, rgba(214,180,106,.13), transparent 34%),
        rgba(18,18,18,.98);
      box-shadow: 0 26px 90px rgba(0,0,0,.68);
      transform: translateY(10px) scale(.985);
      transition: transform .18s ease;
    }

    .exam-scale-wizard-overlay.active .exam-scale-wizard-modal {
      transform: translateY(0) scale(1);
    }

    .exam-scale-wizard-top,
    .exam-scale-wizard-bottom {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 18px;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }

    .exam-scale-wizard-bottom {
      border-top: 1px solid rgba(255,255,255,.08);
      border-bottom: 0;
    }

    .exam-scale-wizard-top h3 {
      margin: 0;
      font-size: 24px;
      line-height: 1;
    }

    .exam-scale-wizard-close {
      width: 40px;
      height: 40px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      background: rgba(255,255,255,.06);
      color: var(--text);
      font-size: 20px;
      font-weight: 1000;
      cursor: pointer;
    }

    .exam-scale-wizard-body {
      overflow: auto;
      padding: 18px;
    }

    .exam-scale-wizard-list {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }

    .exam-scale-wizard-row {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) 92px 42px;
      gap: 10px;
      align-items: stretch;
    }

    .exam-scale-wizard-index {
      display: grid;
      place-items: center;
      border: 1px solid rgba(214,180,106,.16);
      border-radius: 8px;
      background: rgba(214,180,106,.08);
      color: var(--gold2);
      font-size: 12px;
      font-weight: 1000;
    }

    .exam-scale-wizard-label,
    .exam-scale-wizard-points {
      width: 100%;
      border: 1px solid rgba(255,255,255,.11);
      border-radius: 8px;
      background: rgba(255,255,255,.055);
      color: var(--text);
      padding: 10px;
      font: inherit;
      font-size: 13px;
      outline: none;
    }

    .exam-scale-wizard-label {
      min-height: 42px;
      resize: vertical;
      line-height: 1.35;
    }

    .exam-scale-wizard-points {
      text-align: center;
      font-weight: 1000;
    }

    .exam-scale-wizard-remove {
      border: 1px solid rgba(248,113,113,.28);
      border-radius: 8px;
      background: rgba(248,113,113,.09);
      color: #fecaca;
      font-weight: 1000;
      cursor: pointer;
    }

    .exam-scale-wizard-status {
      min-height: 18px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
    }

    .exam-scale-wizard-status[data-tone="ok"] {
      color: #86efac;
    }

    .exam-scale-wizard-status[data-tone="error"] {
      color: #fca5a5;
    }

    @media (max-width: 760px) {
      .exam-scale-wizard-row {
        grid-template-columns: 38px minmax(0, 1fr) 72px 36px;
      }
    }
  `;

  document.head.appendChild(style);
}

function setWizardStatus(message, tone = "") {
  const status = document.getElementById("examScaleWizardStatus");
  if (!status) return;

  status.textContent = message || "";
  status.dataset.tone = tone;
}

function updateSummary() {
  const summary = document.getElementById("examScaleWizardSummary");
  const scale = getScaleFromEditor();
  const total = scale.reduce((sum, item) => sum + Number(item.points || 0), 0);

  if (summary) {
    summary.textContent = `${scale.length} question(s) · ${total} points`;
  }
}

function refreshIndexes() {
  document.querySelectorAll("[data-scale-wizard-index]").forEach((indexEl, index) => {
    indexEl.textContent = String(index + 1).padStart(2, "0");
  });
}

function addScaleRow(label = "", points = 0) {
  const list = document.getElementById("examScaleWizardRows");
  if (!list) return;

  list.insertAdjacentHTML("beforeend", `
    <div class="exam-scale-wizard-row" data-scale-wizard-row>
      <div class="exam-scale-wizard-index" data-scale-wizard-index></div>
      <textarea class="exam-scale-wizard-label" data-scale-wizard-label>${escapeHtml(label)}</textarea>
      <input class="exam-scale-wizard-points" data-scale-wizard-points type="number" min="0" step="1" value="${escapeHtml(points)}">
      <button type="button" class="exam-scale-wizard-remove" data-scale-wizard-remove title="Supprimer">×</button>
    </div>
  `);

  refreshIndexes();
  updateSummary();
}

function renderScale(scale) {
  const list = document.getElementById("examScaleWizardRows");
  if (!list) return;

  list.innerHTML = "";

  if (!scale.length) {
    addScaleRow("", 0);
    return;
  }

  scale.forEach(item => addScaleRow(item.label, item.points));
  refreshIndexes();
  updateSummary();
}

function ensureWizard() {
  if (document.getElementById("examScaleWizardOverlay")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="examScaleWizardOverlay" class="exam-scale-wizard-overlay" hidden>
      <div class="exam-scale-wizard-modal">
        <div class="exam-scale-wizard-top">
          <div>
            <p class="kicker">Barème examen</p>
            <h3>Points par question</h3>
          </div>
          <button type="button" class="exam-scale-wizard-close" data-scale-wizard-close>×</button>
        </div>

        <div class="exam-scale-wizard-body">
          <p class="prof-admin-exam-note">
            Mets les questions dans l'ordre voulu, puis indique les points. Prénom/Nom RP et ID Unique ne sont pas affichés ici.
          </p>
          <div id="examScaleWizardRows" class="exam-scale-wizard-list"></div>
        </div>

        <div class="exam-scale-wizard-bottom">
          <button type="button" class="prof-admin-small-btn" data-scale-wizard-add>Ajouter une question</button>
          <button type="button" class="prof-admin-small-btn gold" data-scale-wizard-save>Enregistrer le barème</button>
        </div>
      </div>
    </div>
  `);

  bindWizardEvents();
}

function openWizard() {
  ensureWizard();
  renderScale(currentScale);

  const overlay = document.getElementById("examScaleWizardOverlay");
  if (!overlay) return;

  overlay.hidden = false;
  requestAnimationFrame(() => {
    overlay.classList.add("active");
  });
}

function closeWizard() {
  const overlay = document.getElementById("examScaleWizardOverlay");
  if (!overlay) return;

  overlay.classList.remove("active");
  setTimeout(() => {
    overlay.hidden = true;
  }, 180);
}

function bindWizardEvents() {
  const overlay = document.getElementById("examScaleWizardOverlay");
  if (!overlay || overlay.dataset.bound === "true") return;

  overlay.dataset.bound = "true";

  overlay.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.closest("[data-scale-wizard-close]")) {
      closeWizard();
      return;
    }

    if (target.closest("[data-scale-wizard-add]")) {
      addScaleRow("", 0);
      return;
    }

    if (target.closest("[data-scale-wizard-save]")) {
      saveWizardScale();
      return;
    }

    if (target.closest("[data-scale-wizard-remove]")) {
      target.closest("[data-scale-wizard-row]")?.remove();
      refreshIndexes();
      updateSummary();
    }
  });

  overlay.addEventListener("input", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches("[data-scale-wizard-label], [data-scale-wizard-points]")) {
      updateSummary();
    }
  });
}

function simplifyOldPanel() {
  const oldRows = document.getElementById("examScaleRows");
  const oldCard = oldRows?.closest(".prof-admin-exam-card");

  if (!oldCard || oldCard.dataset.scaleWizardSimplified === "true") return;

  oldCard.dataset.scaleWizardSimplified = "true";
  oldCard.innerHTML = `
    <div class="exam-scale-wizard-card">
      <div class="exam-scale-wizard-head">
        <div>
          <p class="prof-admin-exam-note">Barème des questions, hors Prénom/Nom RP et ID Unique.</p>
          <p class="exam-scale-wizard-summary" id="examScaleWizardSummary">Barème non chargé</p>
        </div>
        <button type="button" class="prof-admin-small-btn gold" id="openExamScaleWizardBtn">
          Ouvrir le barème
        </button>
      </div>
      <span class="exam-scale-wizard-status" id="examScaleWizardStatus"></span>
    </div>
  `;

  document.getElementById("openExamScaleWizardBtn")?.addEventListener("click", openWizard);
  updateSummary();
}

async function loadSettings() {
  const firebase = await waitForProfFirebase();
  const snap = await firebase.getDoc(firebase.doc(firebase.db, "profSettings", EXAM_SETTINGS_DOC));
  currentSettings = snap.exists() ? snap.data() : {};

  const storedScale = normalizeScale(currentSettings.questionScale);
  const fallbackScale = scaleFromPointsMap(currentSettings.questionPoints);

  currentScale = storedScale.length ? storedScale : fallbackScale;
  renderScale(currentScale);
  updateSummary();

  if (!wizardOpenedOnce && !storedScale.length && !fallbackScale.length) {
    wizardOpenedOnce = true;
    openWizard();
  }
}

async function saveWizardScale() {
  if (isSaving) return;

  try {
    isSaving = true;
    setWizardStatus("Enregistrement...", "");

    const firebase = await waitForProfFirebase();
    const questionScale = getScaleFromEditor();
    const questionPoints = buildQuestionPoints(questionScale);

    currentScale = questionScale;
    currentSettings = {
      ...currentSettings,
      ...getSettingsFromEditor(),
      questionScale,
      questionPoints
    };

    await firebase.setDoc(firebase.doc(firebase.db, "profSettings", EXAM_SETTINGS_DOC), {
      ...currentSettings,
      updatedAt: firebase.serverTimestamp(),
      updatedBy: window.currentProfUser?.profActorId || window.currentProfUser?.email || firebase.auth?.currentUser?.profActorId || firebase.auth?.currentUser?.email || null
    }, { merge: true });

    updateSummary();
    setWizardStatus("Barème enregistré.", "ok");
    closeWizard();
  } catch (error) {
    console.error("Barème examen non sauvegardé :", error);
    setWizardStatus("Impossible d'enregistrer le barème.", "error");
  } finally {
    isSaving = false;
  }
}

function interceptOldSaveButton() {
  const saveButton = document.getElementById("saveExamSettingsBtn");
  if (!saveButton || saveButton.dataset.scaleWizardIntercepted === "true") return;

  saveButton.dataset.scaleWizardIntercepted = "true";
  saveButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    saveWizardScale();
  }, true);
}

function enhanceAdminPanel() {
  injectWizardStyles();
  ensureWizard();
  simplifyOldPanel();
  interceptOldSaveButton();
}

function startScaleWizard() {
  const observer = new MutationObserver(() => {
    enhanceAdminPanel();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  enhanceAdminPanel();
  loadSettings().catch(error => {
    console.warn("Assistant barème indisponible :", error);
  });
}

if (document.body) {
  startScaleWizard();
} else {
  document.addEventListener("DOMContentLoaded", startScaleWizard);
}
