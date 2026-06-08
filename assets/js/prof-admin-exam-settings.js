import "./prof-admin-drive-tools.js?v=1013";

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const EXAM_SETTINGS_DOC = "examResponses";
const DEFAULT_EXAM_SETTINGS = {
  spreadsheetId: "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY",
  gid: "282279229",
  label: "Réponses formulaire"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserIsAdmin = false;
let examSettingsLoaded = false;

onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  currentUserIsAdmin = await loadAdminAccess(user);

  if (currentUserIsAdmin) {
    setTimeout(() => {
      ensureExamSettingsPanel();
      hydrateExamSettings();
    }, 700);
  }
});

async function loadAdminAccess(user) {
  if (!user?.email) return false;

  const snap = await getDoc(doc(db, "users", user.email));
  return snap.exists() && snap.data().admin === true;
}

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
            Enregistrer le lien
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
      </section>
    `);
  }

  bindExamSettingsEvents(modal);
}

function bindExamSettingsEvents(modal) {
  if (modal.dataset.examSettingsBound === "true") return;
  modal.dataset.examSettingsBound = "true";

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
  });

  document.getElementById("saveExamSettingsBtn")?.addEventListener("click", saveExamSettings);
  document.getElementById("reloadExamSettingsBtn")?.addEventListener("click", () => hydrateExamSettings(true));

  document.getElementById("examSheetUrlInput")?.addEventListener("input", () => {
    const urlInput = document.getElementById("examSheetUrlInput");
    const gidInput = document.getElementById("examSheetGidInput");
    const gid = extractGid(urlInput?.value || "");

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

async function loadExamSettings() {
  if (!currentUserIsAdmin) return {};

  const snap = await getDoc(doc(db, "profSettings", EXAM_SETTINGS_DOC));
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
    const urlInput = document.getElementById("examSheetUrlInput");
    const gidInput = document.getElementById("examSheetGidInput");
    const labelInput = document.getElementById("examSheetLabelInput");

    if (!urlInput || !gidInput || !labelInput) return;

    urlInput.value = settings.spreadsheetUrl || buildDefaultSheetUrl({ spreadsheetId, gid });
    gidInput.value = gid;
    labelInput.value = label;

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
    setExamBusy(true);
    setExamStatus("Enregistrement...", "info");

    const settings = getExamSettingsFromEditor();

    await setDoc(doc(db, "profSettings", EXAM_SETTINGS_DOC), {
      ...settings,
      updatedAt: serverTimestamp(),
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

function startExamSettingsPanel() {
  injectExamSettingsStyles();

  const observer = new MutationObserver(() => {
    ensureExamSettingsPanel();
    hydrateExamSettings();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  ensureExamSettingsPanel();
  hydrateExamSettings();
}

if (document.body) {
  startExamSettingsPanel();
} else {
  document.addEventListener("DOMContentLoaded", startExamSettingsPanel);
}
