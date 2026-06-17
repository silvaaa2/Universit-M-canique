import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
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

const STAGE_SETTINGS_COLLECTION = "stageSettings";
const EFFECTIF_SETTINGS_DOC_ID = "effectif";
const STUDENT_MODULES_COLLECTION = "studentModules";

const MODULE_COLUMNS = [
  { key: "module1", label: "Module 1" },
  { key: "module2", label: "Module 2" },
  { key: "module3", label: "Module 3" },
  { key: "module4", label: "Module 4" },
  { key: "exam", label: "Examen" },
  { key: "retakeExam", label: "Rattrapage" }
];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const guardLoader = document.getElementById("guardLoader");
const protectedContent = document.getElementById("protectedContent");
const modulesSummary = document.getElementById("modulesSummary");
const modulesSearch = document.getElementById("modulesSearch");
const reloadModulesBtn = document.getElementById("reloadModulesBtn");
const modulesStatus = document.getElementById("modulesStatus");
const modulesLoader = document.getElementById("modulesLoader");
const modulesLoaderText = document.getElementById("modulesLoaderText");
const modulesTable = document.getElementById("modulesTable");

let currentUser = null;
let effectifRows = [];
let progressById = new Map();
let currentSearch = "";
let writesAvailable = true;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeIdUnique(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
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

function getTodayDateValue() {
  const date = new Date();
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeDateValue(value) {
  if (!value) return "";

  if (typeof value === "string") {
    const direct = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (direct) return direct[0];
  }

  if (typeof value?.toDate === "function") {
    return normalizeDateValue(value.toDate().toISOString());
  }

  if (typeof value?.seconds === "number") {
    return normalizeDateValue(new Date(value.seconds * 1000).toISOString());
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : normalizeDateValue(date.toISOString());
}

function showLoader(message = "Chargement...") {
  if (modulesLoaderText) modulesLoaderText.textContent = message;
  if (modulesLoader) modulesLoader.hidden = false;
}

function hideLoader() {
  if (modulesLoader) modulesLoader.hidden = true;
}

function setStatus(message = "", tone = "") {
  if (!modulesStatus) return;
  modulesStatus.textContent = message;
  modulesStatus.dataset.tone = tone;
}

function showAccessDenied() {
  if (protectedContent) {
    protectedContent.hidden = true;
    protectedContent.style.display = "none";
  }

  if (guardLoader) {
    guardLoader.hidden = false;
    guardLoader.style.display = "grid";
    guardLoader.innerHTML = `
      <div class="prof-login-card">
        <p class="kicker">Accès refusé</p>
        <h1>Refusé</h1>
        <p class="intro">Ce compte n'est pas autorisé à accéder au suivi des modules.</p>
        <button class="btn secondary" onclick="window.location.href='espace-prof.html'">Retour connexion</button>
      </div>
    `;
  }
}

function showProtectedContent() {
  if (guardLoader) {
    guardLoader.hidden = true;
    guardLoader.style.display = "none";
  }

  if (protectedContent) {
    protectedContent.hidden = false;
    protectedContent.style.display = "block";
    requestAnimationFrame(() => protectedContent.classList.add("dashboard-visible"));
  }
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
    console.error("Erreur lecture accès modules :", error);
    return { role: null, admin: false };
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      value += '"';
      i++;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
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

function normalizeEffectifRows(rows) {
  if (!rows.length) return [];

  const firstA = normalizeSearchText(rows[0]?.[0] || "");
  const firstB = normalizeSearchText(rows[0]?.[1] || "");
  const hasHeader = firstA.includes("id") || firstA.includes("unique") || firstB.includes("nom") || firstB.includes("eleve");
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const seenIds = new Set();

  return dataRows
    .map(row => {
      const idUnique = String(row[0] || "").trim();
      const studentName = String(row[1] || "").trim();
      const normalizedIdUnique = normalizeIdUnique(idUnique);

      return {
        idUnique,
        normalizedIdUnique,
        studentName: studentName || "Nom non renseigné"
      };
    })
    .filter(row => row.normalizedIdUnique)
    .filter(row => {
      if (seenIds.has(row.normalizedIdUnique)) return false;
      seenIds.add(row.normalizedIdUnique);
      return true;
    });
}

function getEmptyChecks() {
  return MODULE_COLUMNS.reduce((checks, column) => {
    checks[column.key] = false;
    return checks;
  }, {});
}

function getEmptyDates() {
  return MODULE_COLUMNS.reduce((dates, column) => {
    dates[column.key] = "";
    return dates;
  }, {});
}

function normalizeProgress(data = {}) {
  const checks = {
    ...getEmptyChecks(),
    ...(data.checks || {})
  };

  const dates = {
    ...getEmptyDates(),
    ...(data.dates || {})
  };

  MODULE_COLUMNS.forEach(column => {
    checks[column.key] = checks[column.key] === true;
    dates[column.key] = normalizeDateValue(dates[column.key] || data.completedAt?.[column.key] || "");
  });

  return {
    ...data,
    checks,
    dates,
    completedAt: data.completedAt || {}
  };
}

async function loadEffectifSettings() {
  const snap = await getDoc(doc(db, STAGE_SETTINGS_COLLECTION, EFFECTIF_SETTINGS_DOC_ID));

  if (!snap.exists()) {
    throw new Error("Aucun réglage d'effectif n'est configuré dans Firebase.");
  }

  const data = snap.data();
  const spreadsheetId = extractSpreadsheetId(data.spreadsheetId) || extractSpreadsheetId(data.link) || extractSpreadsheetId(data.url);
  const gid = String(data.gid || extractGid(data.link) || extractGid(data.url) || "").trim();

  if (!spreadsheetId || !gid) {
    throw new Error("Le lien effectif ou le GID est incomplet dans le panneau admin.");
  }

  return { spreadsheetId, gid };
}

async function loadEffectifRows() {
  const settings = await loadEffectifSettings();
  const csvUrl = `https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/export?format=csv&gid=${settings.gid}`;
  const response = await fetch(csvUrl);

  if (!response.ok) {
    throw new Error(`Google Sheets a refusé le chargement de l'effectif (${response.status}).`);
  }

  const csvText = await response.text();
  return normalizeEffectifRows(parseCsv(csvText));
}

async function loadStudentProgress() {
  progressById = new Map();
  writesAvailable = true;

  try {
    const snap = await getDocs(collection(db, STUDENT_MODULES_COLLECTION));

    snap.forEach(docSnap => {
      progressById.set(docSnap.id, normalizeProgress({
        firebaseId: docSnap.id,
        ...docSnap.data()
      }));
    });
  } catch (error) {
    writesAvailable = false;
    console.warn("Lecture des coches modules impossible :", error);
    setStatus("Coches non chargées : règle Firebase à ajouter.", "error");
  }
}

function getProgressForStudent(normalizedIdUnique) {
  return progressById.get(normalizedIdUnique) || normalizeProgress({});
}

function getFilteredRows() {
  const search = normalizeSearchText(currentSearch);
  const searchId = normalizeIdUnique(currentSearch);

  if (!search && !searchId) return effectifRows;

  return effectifRows.filter(row => {
    const name = normalizeSearchText(row.studentName);
    const id = normalizeIdUnique(row.idUnique);
    return name.includes(search) || id.includes(searchId);
  });
}

function getModuleCount(key) {
  return effectifRows.reduce((count, row) => {
    const progress = getProgressForStudent(row.normalizedIdUnique);
    return count + (progress.checks?.[key] === true ? 1 : 0);
  }, 0);
}

function renderSummary() {
  if (!modulesSummary) return;

  const total = effectifRows.length;
  const stats = MODULE_COLUMNS.map(column => {
    const count = getModuleCount(column.key);
    return `
      <div class="modules-stat done">
        <span>${escapeHtml(column.label)}</span>
        <strong>${count} / ${total}</strong>
      </div>
    `;
  }).join("");

  modulesSummary.innerHTML = `
    <div class="modules-stat">
      <span>Effectif</span>
      <strong>${total}</strong>
    </div>
    ${stats}
  `;
}

function renderModuleCheck(row, column, progress) {
  const checked = progress.checks?.[column.key] === true;

  return `
    <div class="modules-cell">
      <label class="module-check ${checked ? "checked" : ""}" data-module-label>
        <input
          type="checkbox"
          data-module-check
          data-student-id="${escapeHtml(row.normalizedIdUnique)}"
          data-module-key="${escapeHtml(column.key)}"
          ${checked ? "checked" : ""}
        >
        <span>${checked ? "Fait" : "Non"}</span>
      </label>
    </div>
  `;
}

function renderModuleDate(row, column, progress) {
  const value = progress.dates?.[column.key] || "";

  return `
    <div class="modules-cell">
      <input
        class="module-date"
        type="date"
        data-module-date
        data-student-id="${escapeHtml(row.normalizedIdUnique)}"
        data-module-key="${escapeHtml(column.key)}"
        value="${escapeHtml(value)}"
        aria-label="Date ${escapeHtml(column.label)} pour ${escapeHtml(row.studentName)}"
      >
    </div>
  `;
}

function renderTable() {
  if (!modulesTable) return;

  renderSummary();

  const rows = getFilteredRows();

  if (!effectifRows.length) {
    modulesTable.innerHTML = `<div class="modules-empty">Aucun élève trouvé dans l'effectif.</div>`;
    return;
  }

  if (!rows.length) {
    modulesTable.innerHTML = `<div class="modules-empty">Aucun élève ne correspond à cette recherche.</div>`;
    return;
  }

  const header = `
    <div class="modules-row head">
      <div>Élève</div>
      ${MODULE_COLUMNS.map(column => `
        <div>${escapeHtml(column.label)}</div>
        <div>Date</div>
      `).join("")}
    </div>
  `;

  const body = rows.map(row => {
    const progress = getProgressForStudent(row.normalizedIdUnique);

    return `
      <div class="modules-row" data-student-row="${escapeHtml(row.normalizedIdUnique)}">
        <div class="modules-cell modules-student">
          <strong title="${escapeHtml(row.studentName)}">${escapeHtml(row.studentName)}</strong>
          <span>ID Unique : ${escapeHtml(row.idUnique)}</span>
        </div>

        ${MODULE_COLUMNS.map(column => (
          renderModuleCheck(row, column, progress) + renderModuleDate(row, column, progress)
        )).join("")}
      </div>
    `;
  }).join("");

  modulesTable.innerHTML = header + body;
}

function updateCheckVisual(input) {
  const label = input.closest("[data-module-label]");
  if (!label) return;

  label.classList.toggle("checked", input.checked);
  const text = label.querySelector("span");
  if (text) text.textContent = input.checked ? "Fait" : "Non";
}

async function saveStudentProgress(normalizedIdUnique, nextProgress) {
  const row = effectifRows.find(item => item.normalizedIdUnique === normalizedIdUnique);

  if (!row) {
    throw new Error("Élève introuvable.");
  }

  await setDoc(doc(db, STUDENT_MODULES_COLLECTION, normalizedIdUnique), {
    idUnique: row.idUnique,
    normalizedIdUnique: row.normalizedIdUnique,
    studentName: row.studentName,
    checks: nextProgress.checks,
    dates: nextProgress.dates,
    completedAt: nextProgress.completedAt,
    updatedAt: serverTimestamp(),
    updatedBy: currentUser?.email || null
  }, { merge: true });
}

async function saveModuleCheck(input) {
  const normalizedIdUnique = input.dataset.studentId || "";
  const moduleKey = input.dataset.moduleKey || "";
  const label = input.closest("[data-module-label]");
  const dateInput = modulesTable?.querySelector(`[data-module-date][data-student-id="${CSS.escape(normalizedIdUnique)}"][data-module-key="${CSS.escape(moduleKey)}"]`);

  if (!effectifRows.some(item => item.normalizedIdUnique === normalizedIdUnique) || !MODULE_COLUMNS.some(column => column.key === moduleKey)) {
    alert("Élève ou module introuvable.");
    return;
  }

  const previousProgress = getProgressForStudent(normalizedIdUnique);
  const previousChecked = previousProgress.checks?.[moduleKey] === true;
  const previousDate = previousProgress.dates?.[moduleKey] || "";
  const nextChecked = input.checked === true;
  const nextDate = nextChecked && !dateInput?.value ? getTodayDateValue() : (dateInput?.value || previousDate);

  if (dateInput && nextChecked && !dateInput.value) {
    dateInput.value = nextDate;
  }

  const nextProgress = normalizeProgress({
    ...previousProgress,
    checks: {
      ...previousProgress.checks,
      [moduleKey]: nextChecked
    },
    dates: {
      ...previousProgress.dates,
      [moduleKey]: nextDate
    },
    completedAt: {
      ...(previousProgress.completedAt || {}),
      [moduleKey]: nextChecked ? new Date().toISOString() : null
    }
  });

  progressById.set(normalizedIdUnique, nextProgress);
  updateCheckVisual(input);
  renderSummary();

  try {
    label?.classList.add("saving");
    dateInput?.classList.add("saving");
    setStatus("Enregistrement...", "info");

    await saveStudentProgress(normalizedIdUnique, nextProgress);

    writesAvailable = true;
    setStatus("Sauvegardé.", "ok");
  } catch (error) {
    console.error("Sauvegarde module impossible :", error);

    input.checked = previousChecked;
    if (dateInput) dateInput.value = previousDate;
    progressById.set(normalizedIdUnique, previousProgress);
    updateCheckVisual(input);
    renderSummary();

    writesAvailable = false;
    setStatus("Sauvegarde impossible : règle Firebase à ajouter.", "error");
    alert(`Sauvegarde impossible : ${error.code || error.message}`);
  } finally {
    label?.classList.remove("saving");
    dateInput?.classList.remove("saving");
  }
}

async function saveModuleDate(input) {
  const normalizedIdUnique = input.dataset.studentId || "";
  const moduleKey = input.dataset.moduleKey || "";

  if (!effectifRows.some(item => item.normalizedIdUnique === normalizedIdUnique) || !MODULE_COLUMNS.some(column => column.key === moduleKey)) {
    alert("Élève ou module introuvable.");
    return;
  }

  const previousProgress = getProgressForStudent(normalizedIdUnique);
  const previousDate = previousProgress.dates?.[moduleKey] || "";
  const nextDate = input.value || "";

  const nextProgress = normalizeProgress({
    ...previousProgress,
    dates: {
      ...previousProgress.dates,
      [moduleKey]: nextDate
    }
  });

  progressById.set(normalizedIdUnique, nextProgress);

  try {
    input.classList.add("saving");
    setStatus("Enregistrement...", "info");

    await saveStudentProgress(normalizedIdUnique, nextProgress);

    writesAvailable = true;
    setStatus("Date sauvegardée.", "ok");
  } catch (error) {
    console.error("Sauvegarde date impossible :", error);

    input.value = previousDate;
    progressById.set(normalizedIdUnique, previousProgress);

    writesAvailable = false;
    setStatus("Sauvegarde impossible : règle Firebase à ajouter.", "error");
    alert(`Sauvegarde impossible : ${error.code || error.message}`);
  } finally {
    input.classList.remove("saving");
  }
}

async function loadAndRenderModules() {
  try {
    showLoader("Chargement de l'effectif...");
    setStatus("", "");

    effectifRows = await loadEffectifRows();

    showLoader("Chargement des coches et dates...");
    await loadStudentProgress();

    renderTable();

    if (writesAvailable) {
      setStatus("Données chargées.", "ok");
    }
  } catch (error) {
    console.error("Chargement modules impossible :", error);

    if (modulesTable) {
      modulesTable.innerHTML = `
        <div class="modules-error">
          Impossible de charger les modules élèves.<br>
          ${escapeHtml(error.message || "Erreur inconnue.")}
        </div>
      `;
    }

    setStatus("Chargement impossible.", "error");
  } finally {
    hideLoader();
  }
}

modulesSearch?.addEventListener("input", event => {
  currentSearch = event.target.value || "";
  renderTable();
});

reloadModulesBtn?.addEventListener("click", () => {
  loadAndRenderModules();
});

modulesTable?.addEventListener("change", event => {
  const checkInput = event.target.closest("[data-module-check]");
  if (checkInput) {
    saveModuleCheck(checkInput);
    return;
  }

  const dateInput = event.target.closest("[data-module-date]");
  if (dateInput) {
    saveModuleDate(dateInput);
  }
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "espace-prof.html";
    return;
  }

  const access = await getUserAccess(user);
  const allowed = access.role === "prof" || access.admin === true;

  if (!allowed) {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erreur déconnexion après refus modules :", error);
    }

    currentUser = null;
    showAccessDenied();
    return;
  }

  currentUser = user;
  showProtectedContent();
  await loadAndRenderModules();
});