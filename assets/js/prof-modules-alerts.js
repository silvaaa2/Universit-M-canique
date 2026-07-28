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

const WARNING_STATES = [
  { key: "none", label: "OK", rowClass: "" },
  { key: "warning1", label: "A1", rowClass: "alert-warning-1" },
  { key: "warning2", label: "A2", rowClass: "alert-warning-2" },
  { key: "warning3", label: "A3", rowClass: "alert-warning-3" },
  { key: "refused", label: "Refusé", rowClass: "alert-refused" }
];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentAccess = { role: null, admin: false };
let warningByStudentId = new Map();
let loadingWarnings = false;

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
    const snap = await getDoc(doc(db, "users", user.email));
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
    const snap = await getDocs(collection(db, STUDENT_MODULES_COLLECTION));
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

  button.textContent = state.label;
  button.dataset.warningLevel = state.key;
  button.className = `module-warning-pill ${state.rowClass || "alert-none"}`;
  button.title = "Changer l'averto de cet élève";
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
    button.setAttribute("aria-label", "Changer l'averto de l'élève");
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

function markEmptyDates() {
  document.querySelectorAll(".module-date").forEach(input => {
    input.dataset.empty = input.value ? "false" : "true";
  });
}

async function saveWarning(studentId, warningKey) {
  await setDoc(doc(db, STUDENT_MODULES_COLLECTION, studentId), {
    warningLevel: normalizeWarning(warningKey),
    warningUpdatedAt: serverTimestamp(),
    warningUpdatedBy: currentUser?.email || null
  }, { merge: true });
}

async function handleWarningClick(button) {
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
    await saveWarning(studentId, nextWarning.key);
  } catch (error) {
    console.error("Sauvegarde averto impossible :", error);
    warningByStudentId.set(studentId, previousWarning);
    if (row) setRowWarning(row, previousWarning);
    alert(`Averto non sauvegardé : ${error.code || error.message}`);
  } finally {
    button.disabled = false;
  }
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-warning-toggle]");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  handleWarningClick(button);
});

document.addEventListener("input", event => {
  if (event.target.matches(".module-date")) markEmptyDates();
});

document.addEventListener("change", event => {
  if (event.target.matches(".module-date")) markEmptyDates();
});

const observer = new MutationObserver(decorateModuleRows);
observer.observe(document.body, { childList: true, subtree: true });

onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  currentAccess = user ? await getUserAccess(user) : { role: null, admin: false };

  if (!user || (currentAccess.role !== "prof" && !currentAccess.admin)) return;

  await loadWarnings();
  decorateModuleRows();
});

requestAnimationFrame(decorateModuleRows);
