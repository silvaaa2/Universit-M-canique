import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

const WARNING_STATES = [
  { key: "none", label: "Averto", rowClass: "" },
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

    .module-warning-pill.alert-warning-1 {
      color: #fdba74 !important;
    }

    .module-warning-pill.alert-warning-2 {
      color: #fde68a !important;
    }

    .module-warning-pill.alert-warning-3 {
      color: #fca5a5 !important;
    }

    .module-warning-pill.alert-refused {
      color: #fff7ed !important;
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

function getWarningState(value) {
  const key = normalizeWarning(value);
  return WARNING_STATES.find(state => state.key === key) || WARNING_STATES[0];
}

function getNextWarning(value) {
  const currentKey = normalizeWarning(value);
  const currentIndex = WARNING_STATES.findIndex(state => state.key === currentKey);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % WARNING_STATES.length : 1;
  return WARNING_STATES[nextIndex];
}

async function getUserAccess(user) {
  if (!user?.email) return { role: null, admin: false };

  try {
    const snap = await withTimeout(
      getDoc(doc(db, "users", user.email)),
      FIRESTORE_TIMEOUT_MS,
      "Vérification accès avertos trop longue."
    );

    if (!snap.exists()) return { role: null, admin: false };

    const data = snap.data();
    return {
      role: data.role || null,
      admin: data.admin === true
    };
  } catch (error) {
    console.warn("Accès avertos modules indisponible :", error);
    return { role: null, admin: false };
  }
}

async function loadWarnings() {
  if (loadingWarnings) return;

  loadingWarnings = true;

  try {
    const snap = await withTimeout(
      getDocs(collection(db, STUDENT_MODULES_COLLECTION)),
      FIRESTORE_TIMEOUT_MS,
      "Lecture avertos modules trop longue."
    );

    warningByStudentId = new Map();

    snap.forEach(docSnap => {
      warningByStudentId.set(docSnap.id, normalizeWarning(docSnap.data()?.warningLevel));
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

function setRowWarning(row, warningKey) {
  const state = getWarningState(warningKey);
  clearRowWarningClasses(row);

  if (state.rowClass) row.classList.add(state.rowClass);

  const button = row.querySelector("[data-warning-toggle]");
  if (!button) return;

  const nextClassName = `module-warning-pill ${state.rowClass || "alert-none"}`;
  const nextTitle = state.key === "none" ? "Ajouter un averto" : `${state.label} - cliquer pour changer`;

  if (button.textContent) button.textContent = "";
  if (button.dataset.warningLevel !== state.key) button.dataset.warningLevel = state.key;
  if (button.dataset.warningLabel !== state.label) button.dataset.warningLabel = state.label;
  if (button.className !== nextClassName) button.className = nextClassName;
  if (button.title !== nextTitle) button.title = nextTitle;

  button.setAttribute("aria-label", nextTitle);
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

  setRowWarning(row, warningByStudentId.get(studentId) || "none");
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

async function saveWarning(studentId, warningKey) {
  await withTimeout(
    setDoc(doc(db, STUDENT_MODULES_COLLECTION, studentId), {
      warningLevel: normalizeWarning(warningKey),
      warningUpdatedAt: serverTimestamp(),
      warningUpdatedBy: currentUser?.email || null
    }, { merge: true }),
    FIRESTORE_TIMEOUT_MS,
    "Sauvegarde averto trop longue."
  );
}

async function handleWarningClick(button) {
  if (button.disabled || button.dataset.saving === "true") return;

  if (!currentAccess.admin && currentAccess.role !== "prof") {
    alert("Accès prof requis.");
    return;
  }

  const studentId = button.dataset.studentId || "";
  if (!studentId) return;

  const previousWarning = warningByStudentId.get(studentId) || "none";
  const nextWarning = getNextWarning(previousWarning);
  const row = button.closest("[data-student-row]");

  warningByStudentId.set(studentId, nextWarning.key);
  if (row) setRowWarning(row, nextWarning.key);

  try {
    button.disabled = true;
    button.dataset.saving = "true";
    await saveWarning(studentId, nextWarning.key);
  } catch (error) {
    console.error("Sauvegarde averto impossible :", error);
    warningByStudentId.set(studentId, previousWarning);
    if (row) setRowWarning(row, previousWarning);
    alert(`Averto non sauvegardé : ${error.code || error.message}`);
  } finally {
    button.disabled = false;
    button.dataset.saving = "false";
  }
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-warning-toggle]");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  handleWarningClick(button);
});

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
