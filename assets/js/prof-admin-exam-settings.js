const EXAM_SETTINGS_DOC = "examResponses";
const DEFAULT_EXAM_SETTINGS = {
  spreadsheetId: "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY",
  gid: "282279229",
  label: "Réponses formulaire"
};

const DEFAULT_EXAM_QUESTION_POINTS = {
  "Prénom / Nom (RP)": 0,
  "ID Unique": 2,
  "Pourquoi voulez vous devenir mécano ?": 1,
  "Quelles sont les qualités d'un mécano pour vous ? (Citez en 6)": 6,
  "Citez 2 services que peut vendre un mécano.": 2,
  "Quel véhicule personnel un mécanicien peut-il utiliser": 3,
  "Citez 4 pièces de carrosserie": 4,
  "Citez 4 pièces de carrosserie (Pas répétée)": 4,
  "Quels sont les différents garages": 7,
  "Comme appelle t'on ce qui est montré sur l'image ?": 1,
  "Quel est la procédure d'une réparation au garage ?": 4,
  "Indiquez tout ce qui ne va pas sur cette image": 5,
  "Vous êtes en custom pour une peinture et vous avez changé la couleur secondaire, mais elle n'est pas visible. Que faites vous ?": 3,
  "Pouvez-vous retirer une FP (Full Perf) lors d'une custom ? (Justifiez)": 3,
  "Dans quelles situations un mécanicien est autorisé à mettre un véhicule en fourrière": 4,
  "Les 3 métiers les plus important": 3,
  "Vous arrivez sur un dépannage et un mécano de la concurrence est déjà en train de réparer le véhicule. Que faites-vous par rapport au client ?": 4,
  "Vous êtes en poste avec plusieurs mécaniciens. Quelles sont les règles à respecter pour que tout se passe bien entre mécaniciens ?": 3,
  "Quels sont les étapes pour changer un pneu ?": 4,
  "Citez 3 Outils de mécanique": 3,
  "Un client arrive masqué au garage pour une full perf mais il lui manque une portière. Que faites-vous ?": 4
};

let currentUser = null;
let currentUserIsAdmin = false;
let examSettingsLoaded = false;
let accessCheckRunning = false;
let eventsBoundForModal = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildDefaultSheetUrl(settings = DEFAULT_EXAM_SETTINGS) {
  return `https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/edit#gid=${settings.gid}`;
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

function injectExamSettingsStyles() {
  if (document.getElementById("profAdminExamSettingsStyles")) return;

  const style = document.createElement("style");
  style.id = "profAdminExamSettingsStyles";
  style.textContent = `
    .prof-admin-exam-card {
      display: grid;
      gap: 14px;
      border: 1px solid rgba(214,180,106,.16);
      border-radius: 8px;
      background:
        linear-gradient(135deg, rgba(214,180,106,.08), transparent 40%),
        rgba(255,255,255,.035);
      padding: 16px;
    }

    .prof-admin-exam-card-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .prof-admin-exam-note {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
      line-height: 1.45;
    }

    .prof-admin-exam-status {
      min-height: 18px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
    }

    .prof-admin-exam-status[data-tone="ok"] {
      color: #86efac;
    }

    .prof-admin-exam-status[data-tone="error"] {
      color: #fca5a5;
    }

    .prof-admin-exam-status[data-tone="info"] {
      color: #7dd3fc;
    }

    .prof-admin-panel.is-busy {
      opacity: .74;
      pointer-events: none;
    }

    .prof-admin-scale-list {
      display: grid;
      gap: 10px;
    }

    .prof-admin-scale-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 92px 42px;
      gap: 10px;
      align-items: stretch;
    }

    .prof-admin-scale-question,
    .prof-admin-scale-points {
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

    .prof-admin-scale-question {
      min-height: 42px;
      resize: vertical;
      line-height: 1.35;
    }

    .prof-admin-scale-points {
      text-align: center;
      font-weight: 1000;
    }

    .prof-admin-scale-remove {
      border: 1px solid rgba(248,113,113,.28);
      border-radius: 8px;
      background: rgba(248,113,113,.09);
      color: #fecaca;
      font-weight: 1000;
      cursor: pointer;
    }

    @media (max-width: 760px) {
      .prof-admin-scale-row {
        grid-template-columns: minmax(0, 1fr) 78px 38px;
      }
    }
  `;

  document.head.appendChild(style);
}

function setExamStatus(message, tone = "") {
  const status = document.getElementById("examSettingsStatus");
  if (!status) return;

  status.textContent = message || "";
  status.dataset.tone = tone;
}

function setExamBusy(isBusy) {
  const panel = document.getElementById("profAdminExamSettingsPanel");
  const saveButton = document.getElementById("saveExamSettingsBtn");
  const reloadButton = document.getElementById("reloadExamSettingsBtn");

  panel?.classList.toggle("is-busy", isBusy);
  if (saveButton) saveButton.disabled = isBusy;
  if (reloadButton) reloadButton.disabled = isBusy;
}

function ensureExamSettingsPanel() {
  if (!currentUserIsAdmin) return;

  const modal = document.getElementById("profAdminModal");
  const tabs = modal?.querySelector(".prof-admin-tabs");
  const workspace = modal?.querySelector(".prof-admin-workspace");

  if (!modal || !tabs || !workspace) return;

  injectExamSettingsStyles();

  if (!document.getElementById("profAdminExamSettingsTab")) {
    tabs.insertAdjacentHTML("beforeend", `
      <button type="button" class="prof-admin-tab" id="profAdminExamSettingsTab" data-exam-settings-tab>
        Examens
      </button>
    `);
  }

  if (!document.getElementById("profAdminExamSettingsPanel")) {
    workspace.insertAdjacentHTML("beforeend", `
      <section class="prof-admin-panel" id="profAdminExamSettingsPanel" data-exam-settings-panel hidden>
        <div class="prof-admin-toolbar">
          <button type="button" class="prof-admin-small-btn gold" id="saveExamSettingsBtn">
            Enregistrer les réglages
          </button>
          <button type="button" class="prof-admin-small-btn" id="reloadExamSettingsBtn">
            Recharger
          </button>
          <span class="prof-admin-exam-status" id="examSettingsStatus"></span>
        </div>

        <div class="prof-admin-exam-card">
          <p class="prof-admin-exam-note">
            Ce lien sert au tableau Examens, partie réponses élèves. Le Google Sheet doit rester public avec le lien.
          </p>

          <div class="prof-admin-field-grid">
            <div class="prof-admin-field full">
              <label for="examSheetUrlInput">Lien Google Sheet examen</label>
              <input id="examSheetUrlInput" class="prof-admin-input" type="url" autocomplete="off" placeholder="${escapeHtml(buildDefaultSheetUrl())}">
            </div>

            <div class="prof-admin-field">
              <label for="examSheetGidInput">GID de l'onglet</label>
              <input id="examSheetGidInput" class="prof-admin-input" type="text" inputmode="numeric" autocomplete="off" placeholder="${escapeHtml(DEFAULT_EXAM_SETTINGS.gid)}">
            </div>

            <div class="prof-admin-field">
              <label for="examSheetLabelInput">Nom affiché</label>
              <input id="examSheetLabelInput" class="prof-admin-input" type="text" autocomplete="off" placeholder="${escapeHtml(DEFAULT_EXAM_SETTINGS.label)}">
            </div>
          </div>
        </div>

        <div class="prof-admin-exam-card">
          <div class="prof-admin-exam-card-head">
            <p class="prof-admin-exam-note">
              Barème des questions. Le texte doit correspondre au libellé de la question dans Google Forms.
            </p>
            <button type="button" class="prof-admin-small-btn" id="addExamScaleRowBtn">
              Ajouter une question
            </button>
          </div>

          <div class="prof-admin-scale-list" id="examScaleRows"></div>
        </div>
      </section>
    `);
  }

  bindExamSettingsEvents(modal);
}

function bindExamSettingsEvents(modal) {
  if (eventsBoundForModal === modal) return;
  eventsBoundForModal = modal;

  modal.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.closest("[data-exam-settings-tab]")) {
      activateExamSettingsPanel();
      hydrateExamSettings();
      return;
    }

    if (target.closest("[data-admin-tab]")) {
      hideExamSettingsPanel();
    }

    if (target.closest("#saveExamSettingsBtn")) {
      saveExamSettings();
      return;
    }

    if (target.closest("#reloadExamSettingsBtn")) {
      hydrateExamSettings(true);
      return;
    }

    if (target.closest("#addExamScaleRowBtn")) {
      addExamScaleRow("", 0);
      return;
    }

    const removeButton = target.closest("[data-remove-exam-scale-row]");
    if (removeButton) {
      removeButton.closest("[data-exam-scale-row]")?.remove();
    }
  });

  modal.addEventListener("input", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.id !== "examSheetUrlInput") return;

    const gidInput = document.getElementById("examSheetGidInput");
    const gid = extractGid(target.value || "");

    if (gidInput && gid && !gidInput.value.trim()) {
      gidInput.value = gid;
    }
  });
}

function activateExamSettingsPanel() {
  document.querySelectorAll("[data-admin-tab]").forEach(button => {
    button.classList.remove("active");
  });

  document.querySelectorAll("[data-admin-panel]").forEach(panel => {
    panel.hidden = true;
  });

  document.querySelectorAll("[data-exam-settings-tab]").forEach(button => {
    button.classList.add("active");
  });

  document.querySelectorAll("[data-exam-settings-panel]").forEach(panel => {
    panel.hidden = false;
  });
}

function hideExamSettingsPanel() {
  document.querySelectorAll("[data-exam-settings-tab]").forEach(button => {
    button.classList.remove("active");
  });

  document.querySelectorAll("[data-exam-settings-panel]").forEach(panel => {
    panel.hidden = true;
  });
}

function getExamSettingsFromEditor() {
  const urlInput = document.getElementById("examSheetUrlInput");
  const gidInput = document.getElementById("examSheetGidInput");
  const labelInput = document.getElementById("examSheetLabelInput");

  const spreadsheetUrl = urlInput?.value?.trim() || "";
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  const gid = gidInput?.value?.trim() || extractGid(spreadsheetUrl) || DEFAULT_EXAM_SETTINGS.gid;
  const label = labelInput?.value?.trim() || DEFAULT_EXAM_SETTINGS.label;

  if (!spreadsheetId) {
    throw new Error("Lien Google Sheet invalide.");
  }

  return {
    spreadsheetUrl,
    spreadsheetId,
    gid,
    label
  };
}

function normalizeQuestionPointsMap(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  return Object.entries(source).reduce((points, [label, score]) => {
    const cleanLabel = String(label || "").trim();
    const cleanScore = Number(score);

    if (cleanLabel && Number.isFinite(cleanScore)) {
      points[cleanLabel] = Math.max(0, cleanScore);
    }

    return points;
  }, {});
}

function getExamQuestionPointsFromEditor() {
  const rows = document.querySelectorAll("[data-exam-scale-row]");

  return Array.from(rows).reduce((points, row) => {
    const label = row.querySelector("[data-exam-scale-question]")?.value?.trim() || "";
    const score = Number(row.querySelector("[data-exam-scale-points]")?.value || 0);

    if (label && Number.isFinite(score)) {
      points[label] = Math.max(0, score);
    }

    return points;
  }, {});
}

function addExamScaleRow(label = "", score = 0) {
  const list = document.getElementById("examScaleRows");
  if (!list) return;

  list.insertAdjacentHTML("beforeend", `
    <div class="prof-admin-scale-row" data-exam-scale-row>
      <textarea class="prof-admin-scale-question" data-exam-scale-question>${escapeHtml(label)}</textarea>
      <input class="prof-admin-scale-points" data-exam-scale-points type="number" min="0" step="1" value="${escapeHtml(score)}">
      <button type="button" class="prof-admin-scale-remove" data-remove-exam-scale-row title="Supprimer">×</button>
    </div>
  `);
}

function renderExamScaleRows(questionPoints) {
  const list = document.getElementById("examScaleRows");
  if (!list) return;

  list.innerHTML = "";

  Object.entries(questionPoints).forEach(([label, score]) => {
    addExamScaleRow(label, score);
  });
}

async function loadExamSettings() {
  const firebase = await waitForProfFirebase();
  const snap = await firebase.getDoc(firebase.doc(firebase.db, "profSettings", EXAM_SETTINGS_DOC));
  return snap.exists() ? snap.data() : {};
}

async function hydrateExamSettings(force = false) {
  ensureExamSettingsPanel();

  if (!currentUserIsAdmin || (examSettingsLoaded && !force)) return;

  try {
    setExamStatus("Chargement...", "info");

    const settings = await loadExamSettings();
    const spreadsheetId = extractSpreadsheetId(settings.spreadsheetUrl) || extractSpreadsheetId(settings.spreadsheetId) || DEFAULT_EXAM_SETTINGS.spreadsheetId;
    const gid = String(settings.gid || DEFAULT_EXAM_SETTINGS.gid);
    const label = String(settings.label || DEFAULT_EXAM_SETTINGS.label);
    const questionPoints = {
      ...DEFAULT_EXAM_QUESTION_POINTS,
      ...normalizeQuestionPointsMap(settings.questionPoints)
    };
    const urlInput = document.getElementById("examSheetUrlInput");
    const gidInput = document.getElementById("examSheetGidInput");
    const labelInput = document.getElementById("examSheetLabelInput");

    if (!urlInput || !gidInput || !labelInput) return;

    urlInput.value = settings.spreadsheetUrl || buildDefaultSheetUrl({ spreadsheetId, gid });
    gidInput.value = gid;
    labelInput.value = label;
    renderExamScaleRows(questionPoints);

    examSettingsLoaded = true;
    setExamStatus("Lien examen chargé.", "ok");
  } catch (error) {
    console.warn("Réglages examens indisponibles :", error);
    setExamStatus("Impossible de charger le lien examen.", "error");
  }
}

async function saveExamSettings() {
  if (!currentUserIsAdmin) return;

  try {
    const firebase = await waitForProfFirebase();

    setExamBusy(true);
    setExamStatus("Enregistrement...", "info");

    const settings = getExamSettingsFromEditor();
    const questionPoints = getExamQuestionPointsFromEditor();

    await firebase.setDoc(firebase.doc(firebase.db, "profSettings", EXAM_SETTINGS_DOC), {
      ...settings,
      questionPoints,
      updatedAt: firebase.serverTimestamp(),
      updatedBy: currentUser?.email || null
    }, { merge: true });

    examSettingsLoaded = false;
    setExamStatus("Lien examen enregistré. Recharge la page Examens si elle est déjà ouverte.", "ok");
  } catch (error) {
    console.error("Lien examen non sauvegardé :", error);
    setExamStatus(error.message || "Impossible d'enregistrer le lien examen.", "error");
  } finally {
    setExamBusy(false);
  }
}

async function refreshAdminAccess() {
  if (accessCheckRunning) return;
  accessCheckRunning = true;

  try {
    const firebase = await waitForProfFirebase();
    const user = window.currentProfUser || firebase.auth?.currentUser || null;

    if (!user?.email) {
      currentUser = null;
      currentUserIsAdmin = false;
      examSettingsLoaded = false;
      return;
    }

    currentUser = user;

    const snap = await firebase.getDoc(firebase.doc(firebase.db, "users", user.email));
    currentUserIsAdmin = snap.exists() && snap.data().admin === true;

    if (currentUserIsAdmin) {
      ensureExamSettingsPanel();
      hydrateExamSettings();
    }
  } catch (error) {
    console.warn("Accès admin examen indisponible :", error);
  } finally {
    accessCheckRunning = false;
  }
}

function startExamSettingsPanel() {
  injectExamSettingsStyles();

  const observer = new MutationObserver(() => {
    ensureExamSettingsPanel();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  refreshAdminAccess();
  window.addEventListener("profFirebaseReady", refreshAdminAccess);
  window.setInterval(refreshAdminAccess, 1200);
}

if (document.body) {
  startExamSettingsPanel();
} else {
  document.addEventListener("DOMContentLoaded", startExamSettingsPanel);
}
