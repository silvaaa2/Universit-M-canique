import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getProfAccess, getProfActorId } from "./prof-identity.js?v=2";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const STUDENT_MODULES_COLLECTION = "studentModules";
const FIRESTORE_TIMEOUT_MS = 8500;
const MODAL_CLOSE_ANIMATION_MS = 190;

const WARNING_STATES = [
  { key: "none", label: "Aucun", rowClass: "" },
  { key: "warning1", label: "Averto 1", rowClass: "alert-warning-1" },
  { key: "warning2", label: "Averto 2", rowClass: "alert-warning-2" },
  { key: "warning3", label: "Averto 3", rowClass: "alert-warning-3" },
  { key: "refused", label: "Refusé", rowClass: "alert-refused" }
];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentAccess = { role: null, admin: false };
let warningByStudentId = new Map();
let loadingWarnings = false;
let decorateScheduled = false;
let activeModalStudentId = "";
let activeModalWarningKey = "none";
let closeModalTimer = 0;

function installWarningIconStyles() {
  if (document.getElementById("moduleWarningIconStyles")) return;

  const style = document.createElement("style");
  style.id = "moduleWarningIconStyles";
  style.textContent = `
    .module-warning-pill {
      position: relative !important;
      width: 34px !important;
      min-width: 34px !important;
      height: 28px !important;
      padding: 0 !important;
      display: grid !important;
      place-items: center !important;
      overflow: hidden !important;
      color: rgba(255,255,255,.46) !important;
      font-size: 0 !important;
      line-height: 0 !important;
    }

    .module-warning-pill::before {
      content: "" !important;
      width: 0 !important;
      height: 0 !important;
      border-left: 8px solid transparent !important;
      border-right: 8px solid transparent !important;
      border-bottom: 15px solid currentColor !important;
      filter: drop-shadow(0 0 6px rgba(0,0,0,.34)) !important;
    }

    .module-warning-pill::after {
      content: "!" !important;
      position: absolute !important;
      top: 8px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      color: rgba(8,8,8,.84) !important;
      font-size: 10px !important;
      line-height: 1 !important;
      font-weight: 1000 !important;
      pointer-events: none !important;
    }

    .module-warning-pill.alert-none {
      border-color: rgba(255,255,255,.13) !important;
      background: rgba(255,255,255,.045) !important;
      color: rgba(255,255,255,.40) !important;
    }

    .module-warning-pill.has-comment.alert-none {
      color: #bfdbfe !important;
      border-color: rgba(125,211,252,.34) !important;
      background: rgba(125,211,252,.10) !important;
    }

    .module-warning-pill.alert-warning-1 { color: #fdba74 !important; }
    .module-warning-pill.alert-warning-2 { color: #fde68a !important; }
    .module-warning-pill.alert-warning-3 { color: #fca5a5 !important; }
    .module-warning-pill.alert-refused { color: #fff7ed !important; }

    .module-warning-modal[hidden] { display: none !important; }

    .module-warning-modal {
      position: fixed !important;
      inset: 0 !important;
      z-index: 9999 !important;
      display: grid !important;
      place-items: center !important;
      padding: 22px !important;
    }

    .module-warning-backdrop {
      position: absolute !important;
      inset: 0 !important;
      background: rgba(0,0,0,.68) !important;
      backdrop-filter: blur(8px) !important;
    }

    .module-warning-dialog {
      position: relative !important;
      width: min(620px, 96vw) !important;
      border: 1px solid rgba(214,180,106,.26) !important;
      border-radius: 12px !important;
      background:
        radial-gradient(circle at 8% 0%, rgba(214,180,106,.16), transparent 38%),
        linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.025)),
        rgba(18,18,18,.98) !important;
      box-shadow: 0 22px 80px rgba(0,0,0,.58), 0 0 34px rgba(214,180,106,.10) !important;
      padding: 22px !important;
      color: var(--text, #fff7ed) !important;
      will-change: transform, opacity !important;
    }

    .module-warning-modal.is-open .module-warning-backdrop {
      animation: moduleWarningBackdropIn .18s ease-out both !important;
    }

    .module-warning-modal.is-open .module-warning-dialog {
      animation: moduleWarningDialogIn .22s cubic-bezier(.16, 1, .3, 1) both !important;
    }

    .module-warning-modal.is-closing .module-warning-backdrop {
      animation: moduleWarningBackdropOut .16s ease-in both !important;
    }

    .module-warning-modal.is-closing .module-warning-dialog {
      animation: moduleWarningDialogOut .16s ease-in both !important;
    }

    @keyframes moduleWarningBackdropIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes moduleWarningBackdropOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    @keyframes moduleWarningDialogIn {
      from {
        opacity: 0;
        transform: translateY(18px) scale(.965);
      }
      70% {
        opacity: 1;
        transform: translateY(-2px) scale(1.004);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes moduleWarningDialogOut {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateY(12px) scale(.975);
      }
    }

    .module-warning-close {
      position: absolute !important;
      top: 12px !important;
      right: 12px !important;
      width: 34px !important;
      height: 34px !important;
      border: 1px solid rgba(248,113,113,.35) !important;
      border-radius: 10px !important;
      background: rgba(248,113,113,.13) !important;
      color: #fca5a5 !important;
      font: inherit !important;
      font-size: 20px !important;
      font-weight: 1000 !important;
      line-height: 1 !important;
      cursor: pointer !important;
    }

    .module-warning-kicker {
      margin: 0 44px 8px 0 !important;
      color: var(--gold2, #f7d98b) !important;
      font-size: 11px !important;
      font-weight: 1000 !important;
      text-transform: uppercase !important;
    }

    .module-warning-title {
      margin: 0 44px 4px 0 !important;
      font-size: 28px !important;
      line-height: 1.05 !important;
      font-weight: 1000 !important;
    }

    .module-warning-subtitle {
      margin: 0 0 18px !important;
      color: rgba(255,247,237,.62) !important;
      font-size: 13px !important;
      font-weight: 800 !important;
    }

    .module-warning-choices {
      display: grid !important;
      grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
      gap: 8px !important;
      margin-bottom: 16px !important;
    }

    .module-warning-choice {
      height: 40px !important;
      border: 1px solid rgba(255,255,255,.12) !important;
      border-radius: 10px !important;
      background: rgba(255,255,255,.045) !important;
      color: rgba(255,247,237,.70) !important;
      font: inherit !important;
      font-size: 12px !important;
      font-weight: 1000 !important;
      cursor: pointer !important;
      transition: transform .16s ease, border-color .16s ease, background .16s ease, color .16s ease !important;
    }

    .module-warning-choice:hover,
    .module-warning-choice.active {
      transform: translateY(-1px) !important;
      color: #fff7ed !important;
      border-color: rgba(214,180,106,.45) !important;
      background: rgba(214,180,106,.15) !important;
    }

    .module-warning-choice[data-warning-choice="warning1"].active {
      border-color: rgba(249,115,22,.52) !important;
      background: rgba(249,115,22,.18) !important;
      color: #fdba74 !important;
    }

    .module-warning-choice[data-warning-choice="warning2"].active {
      border-color: rgba(234,179,8,.56) !important;
      background: rgba(234,179,8,.17) !important;
      color: #fde68a !important;
    }

    .module-warning-choice[data-warning-choice="warning3"].active {
      border-color: rgba(248,113,113,.56) !important;
      background: rgba(248,113,113,.17) !important;
      color: #fca5a5 !important;
    }

    .module-warning-choice[data-warning-choice="refused"].active {
      border-color: rgba(255,255,255,.50) !important;
      background: rgba(255,255,255,.12) !important;
      color: #fff7ed !important;
    }

    .module-warning-label {
      display: block !important;
      margin: 0 0 8px !important;
      color: var(--gold2, #f7d98b) !important;
      font-size: 11px !important;
      font-weight: 1000 !important;
      text-transform: uppercase !important;
    }

    .module-warning-comment {
      width: 100% !important;
      min-height: 132px !important;
      resize: vertical !important;
      -webkit-user-select: text !important;
      user-select: text !important;
      touch-action: auto !important;
      border: 1px solid rgba(255,255,255,.12) !important;
      border-radius: 10px !important;
      background: rgba(0,0,0,.32) !important;
      color: var(--text, #fff7ed) !important;
      padding: 12px !important;
      font: inherit !important;
      font-size: 14px !important;
      font-weight: 800 !important;
      outline: none !important;
    }

    .module-warning-comment:focus {
      border-color: rgba(214,180,106,.48) !important;
      box-shadow: 0 0 0 3px rgba(214,180,106,.11) !important;
    }

    .module-warning-actions {
      display: flex !important;
      justify-content: flex-end !important;
      gap: 10px !important;
      margin-top: 16px !important;
    }

    .module-warning-save,
    .module-warning-cancel {
      height: 42px !important;
      padding: 0 16px !important;
      border-radius: 999px !important;
      font: inherit !important;
      font-size: 12px !important;
      font-weight: 1000 !important;
      cursor: pointer !important;
      transition: transform .16s ease, border-color .16s ease, background .16s ease !important;
    }

    .module-warning-save:hover,
    .module-warning-cancel:hover {
      transform: translateY(-1px) !important;
    }

    .module-warning-save {
      border: 1px solid rgba(214,180,106,.42) !important;
      background: rgba(214,180,106,.18) !important;
      color: var(--gold2, #f7d98b) !important;
    }

    .module-warning-cancel {
      border: 1px solid rgba(255,255,255,.12) !important;
      background: rgba(255,255,255,.055) !important;
      color: rgba(255,247,237,.72) !important;
    }

    @media (prefers-reduced-motion: reduce) {
      .module-warning-modal.is-open .module-warning-backdrop,
      .module-warning-modal.is-open .module-warning-dialog,
      .module-warning-modal.is-closing .module-warning-backdrop,
      .module-warning-modal.is-closing .module-warning-dialog {
        animation-duration: .01ms !important;
      }
    }

    @media (max-width: 760px) {
      .module-warning-choices {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function normalizeWarning(value) {
  const key = String(value || "none");
  return WARNING_STATES.some(state => state.key === key) ? key : "none";
}

function normalizeStudentId(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function getCurrentCursusKey() {
  return String(window.profModulesCurrentCursusKey || "").trim();
}

function getWarningStudentId(docId, data, cursusKey) {
  const fromData = normalizeStudentId(data.studentId || data.normalizedIdUnique || data.idUnique || "");
  if (fromData) return fromData;

  const prefix = `${cursusKey}__`;
  return String(docId || "").startsWith(prefix)
    ? normalizeStudentId(String(docId).slice(prefix.length))
    : "";
}

function normalizeWarningRecord(value = {}) {
  if (typeof value === "string") {
    return { level: normalizeWarning(value), comment: "" };
  }

  return {
    level: normalizeWarning(value.warningLevel || value.level || "none"),
    comment: String(value.warningComment || value.comment || "").trim()
  };
}

function getWarningRecord(studentId) {
  return normalizeWarningRecord(warningByStudentId.get(studentId));
}

function getWarningState(value) {
  const key = normalizeWarning(value);
  return WARNING_STATES.find(state => state.key === key) || WARNING_STATES[0];
}

async function getUserAccess(user) {
  try {
    return await getProfAccess(user, async () => {
      if (!user?.email) return { role: null, admin: false };
      const snap = await withTimeout(
        getDoc(doc(db, "users", user.email)),
        FIRESTORE_TIMEOUT_MS,
        "Vérification accès avertos trop longue."
      );
      if (!snap.exists()) return { role: null, admin: false };
      const data = snap.data();
      return { role: data.role || null, admin: data.admin === true };
    });
  } catch (error) {
    console.warn("Accès avertos modules indisponible :", error);
    return { role: null, admin: false };
  }
}

async function loadWarnings() {
  if (loadingWarnings) return;

  loadingWarnings = true;

  try {
    const cursusKey = getCurrentCursusKey();
    warningByStudentId = new Map();

    if (!cursusKey) return;

    const snap = await withTimeout(
      getDocs(collection(db, STUDENT_MODULES_COLLECTION)),
      FIRESTORE_TIMEOUT_MS,
      "Lecture avertos modules trop longue."
    );

    snap.forEach(docSnap => {
      const data = docSnap.data() || {};
      const belongsToCursus = data.cursusKey
        ? data.cursusKey === cursusKey
        : String(docSnap.id || "").startsWith(`${cursusKey}__`);
      if (!belongsToCursus) return;

      const studentId = getWarningStudentId(docSnap.id, data, cursusKey);
      if (studentId) warningByStudentId.set(studentId, normalizeWarningRecord(data));
    });
  } catch (error) {
    console.warn("Lecture avertos modules impossible :", error);
  } finally {
    loadingWarnings = false;
    decorateModuleRows();
  }
}

function clearRowWarningClasses(row) {
  row.classList.remove("alert-warning-1", "alert-warning-2", "alert-warning-3", "alert-refused");
}

function setRowWarning(row, warningRecord) {
  const record = normalizeWarningRecord(warningRecord);
  const state = getWarningState(record.level);
  clearRowWarningClasses(row);

  if (state.rowClass) row.classList.add(state.rowClass);

  const button = row.querySelector("[data-warning-toggle]");
  if (!button) return;

  const hasComment = record.comment.length > 0;
  const nextClassName = `module-warning-pill ${state.rowClass || "alert-none"}${hasComment ? " has-comment" : ""}`;
  const nextTitle = `${state.label}${hasComment ? ` - ${record.comment}` : ""}`;

  if (button.textContent) button.textContent = "";
  if (button.dataset.warningLevel !== state.key) button.dataset.warningLevel = state.key;
  if (button.dataset.warningLabel !== state.label) button.dataset.warningLabel = state.label;
  if (button.dataset.warningComment !== record.comment) button.dataset.warningComment = record.comment;
  if (button.className !== nextClassName) button.className = nextClassName;
  if (button.title !== nextTitle) button.title = nextTitle;

  button.setAttribute("aria-label", `Ouvrir le suivi averto : ${nextTitle}`);
}

function ensureWarningButton(row) {
  const studentId = row.dataset.studentRow || "";
  const studentCell = row.querySelector(".modules-student");
  if (!studentId || !studentCell) return;

  let button = studentCell.querySelector("[data-warning-toggle]");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.dataset.warningToggle = "true";
    button.dataset.studentId = studentId;
    studentCell.appendChild(button);
  }

  setRowWarning(row, getWarningRecord(studentId));
}

function decorateModuleRows() {
  document.querySelectorAll("[data-student-row]").forEach(row => {
    ensureWarningButton(row);
  });

  markEmptyDates();
}

function scheduleDecorateModuleRows() {
  if (decorateScheduled) return;

  decorateScheduled = true;
  requestAnimationFrame(() => {
    decorateScheduled = false;
    decorateModuleRows();
  });
}

function markEmptyDates() {
  document.querySelectorAll(".module-date").forEach(input => {
    input.dataset.empty = input.value ? "false" : "true";
  });
}

function ensureWarningModal() {
  let modal = document.getElementById("moduleWarningModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "moduleWarningModal";
  modal.className = "module-warning-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="module-warning-backdrop" data-warning-close></div>
    <section class="module-warning-dialog" role="dialog" aria-modal="true" aria-labelledby="moduleWarningTitle">
      <button type="button" class="module-warning-close" data-warning-close aria-label="Fermer">×</button>
      <p class="module-warning-kicker">Suivi modules</p>
      <h2 id="moduleWarningTitle" class="module-warning-title">Averto élève</h2>
      <p id="moduleWarningSubtitle" class="module-warning-subtitle"></p>
      <div class="module-warning-choices">
        ${WARNING_STATES.map(state => `<button type="button" class="module-warning-choice" data-warning-choice="${state.key}">${state.label}</button>`).join("")}
      </div>
      <label class="module-warning-label" for="moduleWarningComment">Commentaire</label>
      <textarea id="moduleWarningComment" class="module-warning-comment" data-clipboard-scan-ignore placeholder="Ajouter un commentaire visible par les profs..."></textarea>
      <div class="module-warning-actions">
        <button type="button" class="module-warning-cancel" data-warning-close>Annuler</button>
        <button type="button" class="module-warning-save" data-warning-save>Enregistrer</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  return modal;
}

function getStudentNameFromRow(row) {
  return row?.querySelector(".modules-student strong")?.textContent?.trim() || "Élève";
}

function getStudentIdTextFromRow(row) {
  return row?.querySelector(".modules-student span")?.textContent?.trim() || "";
}

function refreshModalChoices() {
  const modal = ensureWarningModal();
  modal.querySelectorAll("[data-warning-choice]").forEach(button => {
    button.classList.toggle("active", button.dataset.warningChoice === activeModalWarningKey);
  });
}

function isWarningModalOpen() {
  const modal = document.getElementById("moduleWarningModal");
  return Boolean(modal && !modal.hidden && !modal.classList.contains("is-closing"));
}

function focusWarningComment(comment, moveCursorToEnd = false) {
  if (!comment) return;

  try {
    comment.focus({ preventScroll: true });
  } catch (error) {
    comment.focus();
  }

  if (!moveCursorToEnd || typeof comment.setSelectionRange !== "function") return;

  const cursorPosition = comment.value.length;
  comment.setSelectionRange(cursorPosition, cursorPosition);
}

function insertPastedWarningText(comment, text) {
  const pastedText = String(text || "");
  if (!comment || !pastedText) return;

  const selectionStart = Number.isInteger(comment.selectionStart)
    ? comment.selectionStart
    : comment.value.length;
  const selectionEnd = Number.isInteger(comment.selectionEnd)
    ? comment.selectionEnd
    : selectionStart;

  if (typeof comment.setRangeText === "function") {
    comment.setRangeText(pastedText, selectionStart, selectionEnd, "end");
  } else {
    comment.value = `${comment.value.slice(0, selectionStart)}${pastedText}${comment.value.slice(selectionEnd)}`;
  }

  try {
    comment.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertFromPaste",
      data: pastedText
    }));
  } catch (error) {
    comment.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

async function captureWarningModalPaste(event) {
  if (!isWarningModalOpen()) return;

  const modal = document.getElementById("moduleWarningModal");
  const comment = modal?.querySelector("#moduleWarningComment");
  if (!comment) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  focusWarningComment(comment);

  let pastedText = event.clipboardData?.getData("text/plain")
    || event.clipboardData?.getData("text")
    || window.clipboardData?.getData("Text")
    || "";

  if (!pastedText && navigator.clipboard?.readText) {
    try {
      pastedText = await navigator.clipboard.readText();
    } catch (error) {
      console.warn("Collage du commentaire indisponible :", error);
    }
  }

  if (!isWarningModalOpen()) return;
  insertPastedWarningText(comment, pastedText);
}

function openWarningModal(button) {
  if (!currentAccess.admin && currentAccess.role !== "prof") {
    alert("Accès prof requis.");
    return;
  }

  const studentId = button.dataset.studentId || "";
  const row = button.closest("[data-student-row]");
  if (!studentId || !row) return;

  const record = getWarningRecord(studentId);
  const modal = ensureWarningModal();
  const title = modal.querySelector("#moduleWarningTitle");
  const subtitle = modal.querySelector("#moduleWarningSubtitle");
  const comment = modal.querySelector("#moduleWarningComment");

  activeModalStudentId = studentId;
  activeModalWarningKey = record.level;

  if (title) title.textContent = getStudentNameFromRow(row);
  if (subtitle) subtitle.textContent = getStudentIdTextFromRow(row);
  if (comment) comment.value = record.comment;

  refreshModalChoices();
  window.clearTimeout(closeModalTimer);
  modal.hidden = false;
  modal.classList.remove("is-closing");
  modal.classList.remove("is-open");
  void modal.offsetWidth;
  modal.classList.add("is-open");
  focusWarningComment(comment, true);
  requestAnimationFrame(() => focusWarningComment(comment));
}

function closeWarningModal() {
  const modal = ensureWarningModal();
  if (modal.hidden || modal.classList.contains("is-closing")) return;

  modal.classList.remove("is-open");
  modal.classList.add("is-closing");
  window.clearTimeout(closeModalTimer);

  closeModalTimer = window.setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove("is-closing");
    activeModalStudentId = "";
    activeModalWarningKey = "none";
  }, MODAL_CLOSE_ANIMATION_MS);
}

function selectWarningLevel(choiceKey) {
  activeModalWarningKey = normalizeWarning(choiceKey);
  refreshModalChoices();
}

async function saveWarning(studentId, record) {
  const normalized = normalizeWarningRecord(record);
  const cursusKey = getCurrentCursusKey();
  const normalizedStudentId = normalizeStudentId(studentId);

  if (!cursusKey || !normalizedStudentId) {
    throw new Error("Le cursus actif n'est pas encore chargé.");
  }

  await withTimeout(
    setDoc(doc(db, STUDENT_MODULES_COLLECTION, `${cursusKey}__${normalizedStudentId}`), {
      studentId: normalizedStudentId,
      normalizedIdUnique: normalizedStudentId,
      cursusKey,
      warningLevel: normalized.level,
      warningComment: normalized.comment,
      warningUpdatedAt: serverTimestamp(),
      warningUpdatedBy: getProfActorId(currentUser)
    }, { merge: true }),
    FIRESTORE_TIMEOUT_MS,
    "Sauvegarde averto trop longue."
  );
}

async function saveWarningModal() {
  if (!activeModalStudentId) return;

  const modal = ensureWarningModal();
  const saveButton = modal.querySelector("[data-warning-save]");
  const comment = modal.querySelector("#moduleWarningComment")?.value || "";
  const previousRecord = getWarningRecord(activeModalStudentId);
  const nextRecord = normalizeWarningRecord({
    level: activeModalWarningKey,
    comment
  });
  const row = document.querySelector(`[data-student-row="${CSS.escape(activeModalStudentId)}"]`);

  warningByStudentId.set(activeModalStudentId, nextRecord);
  if (row) setRowWarning(row, nextRecord);

  try {
    if (saveButton) saveButton.disabled = true;
    await saveWarning(activeModalStudentId, nextRecord);
    closeWarningModal();
  } catch (error) {
    console.error("Sauvegarde averto impossible :", error);
    warningByStudentId.set(activeModalStudentId, previousRecord);
    if (row) setRowWarning(row, previousRecord);
    alert("Avertissement non sauvegardé. Réessaie dans quelques instants.");
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

document.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const closeButton = target.closest("[data-warning-close]");
  const choiceButton = target.closest("[data-warning-choice]");
  const saveButton = target.closest("[data-warning-save]");
  const warningButton = target.closest("[data-warning-toggle]");

  if (!closeButton && !choiceButton && !saveButton && !warningButton) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (closeButton) {
    closeWarningModal();
    return;
  }

  if (choiceButton) {
    selectWarningLevel(choiceButton.dataset.warningChoice || "none");
    return;
  }

  if (saveButton) {
    saveWarningModal();
    return;
  }

  if (warningButton) {
    openWarningModal(warningButton);
  }
}, true);

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !ensureWarningModal().hidden) {
    event.preventDefault();
    closeWarningModal();
  }
});

document.addEventListener("paste", captureWarningModalPaste, true);

document.addEventListener("focusin", event => {
  if (!isWarningModalOpen()) return;

  const modal = document.getElementById("moduleWarningModal");
  if (modal?.contains(event.target)) return;

  event.stopPropagation();
  focusWarningComment(modal?.querySelector("#moduleWarningComment"));
}, true);

document.addEventListener("input", event => {
  if (event.target.matches(".module-date")) markEmptyDates();
});

document.addEventListener("change", event => {
  if (event.target.matches(".module-date")) markEmptyDates();
});

installWarningIconStyles();

const observerTarget = document.getElementById("modulesTable") || document.body;
const observer = new MutationObserver(scheduleDecorateModuleRows);
observer.observe(observerTarget, { childList: true, subtree: true });

onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  currentAccess = user ? await getUserAccess(user) : { role: null, admin: false };

  if (!user || (currentAccess.role !== "prof" && !currentAccess.admin)) return;

  await loadWarnings();
  decorateModuleRows();
});

requestAnimationFrame(decorateModuleRows);

window.addEventListener("profModulesCursusReady", async () => {
  if (!currentUser || (currentAccess.role !== "prof" && !currentAccess.admin)) return;
  await loadWarnings();
  decorateModuleRows();
});
