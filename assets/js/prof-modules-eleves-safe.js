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

const STAGE_SETTINGS_COLLECTION = "stageSettings";
const EFFECTIF_SETTINGS_DOC_ID = "effectif";
const STUDENT_MODULES_COLLECTION = "studentModules";
const FIRESTORE_TIMEOUT_MS = 8500;
const EFFECTIF_TIMEOUT_MS = 12000;

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
let currentAccess = { role: null, admin: false };
let effectifRows = [];
let progressById = new Map();
let currentFilter = "";
let writesAvailable = true;
let currentCursusKey = "";
let currentCursusSettings = null;

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function fetchWithTimeout(url, ms, options = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => window.clearTimeout(timer));
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

function normalizeHeaderLabel(value) {
  return normalizeSearchText(value).replace(/[^a-z0-9]+/g, "");
}

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

function buildCursusKey(settings = {}) {
  const spreadsheetId = extractSpreadsheetId(settings.spreadsheetId || settings.link || settings.url);
  const gid = String(settings.gid || extractGid(settings.link) || extractGid(settings.url) || "").trim();
  const rawKey = `${spreadsheetId}_${gid}`.toLowerCase();
  const safeKey = rawKey.replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return safeKey ? `cursus_${safeKey}` : "";
}

function getStudentModuleDocId(studentId) {
  const normalizedStudentId = normalizeIdUnique(studentId);
  return `${currentCursusKey || "cursus_unknown"}__${normalizedStudentId}`;
}

function getStudentIdFromModuleDoc(docId, data = {}) {
  const fromData = normalizeIdUnique(data.studentId || data.normalizedIdUnique || data.idUnique || "");
  if (fromData) return fromData;

  const prefix = `${currentCursusKey}__`;
  if (currentCursusKey && String(docId || "").startsWith(prefix)) {
    return normalizeIdUnique(String(docId).slice(prefix.length));
  }

  return "";
}

function isCurrentCursusModuleDoc(docId, data = {}) {
  if (!currentCursusKey) return false;
  if (data.cursusKey) return data.cursusKey === currentCursusKey;
  return String(docId || "").startsWith(`${currentCursusKey}__`);
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

function getTodayDateValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
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

function cloneProgress(progress) {
  return {
    checks: { ...getEmptyChecks(), ...(progress?.checks || {}) },
    dates: { ...getEmptyDates(), ...(progress?.dates || {}) }
  };
}

function normalizeProgress(data = {}) {
  const progress = cloneProgress({
    checks: data.checks || {},
    dates: data.dates || data.completedAt || {}
  });

  MODULE_COLUMNS.forEach(column => {
    progress.checks[column.key] = progress.checks[column.key] === true;
    progress.dates[column.key] = normalizeDateValue(progress.dates[column.key]);
  });

  return progress;
}

function setStatus(message = "", tone = "") {
  if (!modulesStatus) return;
  modulesStatus.textContent = message;
  modulesStatus.dataset.tone = tone;
}

function showLoader(message = "Chargement...") {
  if (modulesLoaderText) modulesLoaderText.textContent = message;
  if (modulesLoader) modulesLoader.hidden = false;
}

function hideLoader() {
  if (modulesLoader) modulesLoader.hidden = true;
}

function showProtectedContent() {
  if (guardLoader) guardLoader.hidden = true;
  if (protectedContent) protectedContent.hidden = false;
}

function showGuardMessage(title, message) {
  if (protectedContent) protectedContent.hidden = true;
  if (!guardLoader) return;

  guardLoader.hidden = false;
  guardLoader.innerHTML = `
    <div class="prof-login-card">
      <p class="kicker">Accès sécurisé</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="intro">${escapeHtml(message)}</p>
      <button type="button" class="prof-submit" onclick="goPage('espace-prof.html')">Retour espace prof</button>
    </div>
  `;
}

async function getUserAccess(user) {
  if (!user?.email) return { role: null, admin: false };

  const snap = await withTimeout(
    getDoc(doc(db, "users", user.email)),
    FIRESTORE_TIMEOUT_MS,
    "Vérification du compte trop longue."
  );

  if (!snap.exists()) return { role: null, admin: false };

  const data = snap.data();
  return {
    role: data.role || null,
    admin: data.admin === true
  };
}

async function loadEffectifSettings() {
  const snap = await withTimeout(
    getDoc(doc(db, STAGE_SETTINGS_COLLECTION, EFFECTIF_SETTINGS_DOC_ID)),
    FIRESTORE_TIMEOUT_MS,
    "Lecture du réglage effectif trop longue."
  );

  if (!snap.exists()) {
    throw new Error("Aucun effectif n'est configuré.");
  }

  const data = snap.data();
  const spreadsheetId = extractSpreadsheetId(data.spreadsheetId) || extractSpreadsheetId(data.link) || extractSpreadsheetId(data.url);
  const gid = String(data.gid || extractGid(data.link) || extractGid(data.url) || "").trim();

  if (!spreadsheetId || !gid) {
    throw new Error("Le lien effectif ou le GID est incomplet dans le panneau admin.");
  }

  return { spreadsheetId, gid, cursusKey: buildCursusKey({ spreadsheetId, gid }) };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);
  return rows.filter(item => item.some(cell => String(cell || "").trim()));
}

function findEffectifLayout(rows) {
  const limit = Math.min(rows.length, 10);

  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const labels = (rows[rowIndex] || []).map(normalizeHeaderLabel);
    const idIndex = labels.findIndex(label => label.includes("idunique") || (label.includes("id") && label.includes("unique")));
    const nameIndex = labels.findIndex(label => label.includes("nom") || label.includes("eleve"));

    if (idIndex >= 0 && nameIndex >= 0) {
      return { rowIndex, idIndex, nameIndex };
    }
  }

  return { rowIndex: 0, idIndex: 0, nameIndex: 1 };
}

function normalizeEffectifRows(rows) {
  const layout = findEffectifLayout(rows);
  const seen = new Set();

  return rows.slice(layout.rowIndex + 1).reduce((students, row) => {
    const idUnique = String(row?.[layout.idIndex] || "").trim();
    const studentName = String(row?.[layout.nameIndex] || "").trim();
    const normalizedIdUnique = normalizeIdUnique(idUnique);

    if (!normalizedIdUnique || !studentName || seen.has(normalizedIdUnique)) return students;

    seen.add(normalizedIdUnique);
    students.push({
      idUnique,
      normalizedIdUnique,
      studentName,
      searchText: normalizeSearchText(`${studentName} ${idUnique}`)
    });

    return students;
  }, []);
}

async function loadEffectifRows() {
  const settings = await loadEffectifSettings();
  currentCursusSettings = settings;
  currentCursusKey = settings.cursusKey;
  window.profModulesCurrentCursusKey = currentCursusKey;
  window.dispatchEvent(new CustomEvent("profModulesCursusReady", {
    detail: { cursusKey: currentCursusKey }
  }));

  const csvUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(settings.spreadsheetId)}/export?format=csv&gid=${encodeURIComponent(settings.gid)}&cacheBust=${Date.now()}`;
  const response = await fetchWithTimeout(csvUrl, EFFECTIF_TIMEOUT_MS, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Effectif Google Sheets impossible à lire (${response.status}).`);
  }

  const csv = await response.text();
  const rows = normalizeEffectifRows(parseCsv(csv));

  if (!rows.length) {
    throw new Error("Aucun élève avec ID Unique n'a été trouvé dans l'effectif.");
  }

  return rows;
}

function isPermissionError(error) {
  return String(error?.code || error?.message || "").toLowerCase().includes("permission");
}

async function loadStudentProgress() {
  progressById = new Map();
  writesAvailable = true;

  try {
    const snap = await withTimeout(
      getDocs(collection(db, STUDENT_MODULES_COLLECTION)),
      FIRESTORE_TIMEOUT_MS,
      "Le chargement de la progression prend trop de temps."
    );

    snap.forEach(docSnap => {
      const data = docSnap.data() || {};
      if (!isCurrentCursusModuleDoc(docSnap.id, data)) return;

      const studentId = getStudentIdFromModuleDoc(docSnap.id, data);
      if (!studentId) return;

      progressById.set(studentId, normalizeProgress(data));
    });
  } catch (error) {
    console.warn("Lecture des modules élèves impossible :", error);
    writesAvailable = !isPermissionError(error);
    setStatus("La progression n’a pas pu être chargée.", "error");
  }
}

function getProgress(studentId) {
  if (!progressById.has(studentId)) {
    progressById.set(studentId, normalizeProgress({}));
  }

  return progressById.get(studentId);
}

function getFilteredRows() {
  if (!currentFilter) return effectifRows;
  return effectifRows.filter(row => row.searchText.includes(currentFilter));
}

function getDoneCount(moduleKey) {
  return effectifRows.reduce((count, row) => {
    const progress = progressById.get(row.normalizedIdUnique);
    return count + (progress?.checks?.[moduleKey] === true ? 1 : 0);
  }, 0);
}

function renderSummary() {
  if (!modulesSummary) return;

  const total = effectifRows.length;
  const stats = [
    `<div class="modules-stat"><span>Effectif</span><strong>${total}</strong></div>`,
    ...MODULE_COLUMNS.map(column => {
      const done = getDoneCount(column.key);
      return `<div class="modules-stat done"><span>${escapeHtml(column.label)}</span><strong>${done} / ${total}</strong></div>`;
    })
  ];

  modulesSummary.innerHTML = stats.join("");
}

function renderModuleCheck(row, column, progress) {
  const checked = progress.checks[column.key] === true;
  const studentId = escapeHtml(row.normalizedIdUnique);
  const moduleKey = escapeHtml(column.key);

  return `
    <label class="module-check${checked ? " checked" : ""}" title="${checked ? "Validé" : "Non validé"}">
      <input type="checkbox" data-module-check="true" data-student-id="${studentId}" data-module-key="${moduleKey}" ${checked ? "checked" : ""}>
      <span class="module-check-icon" aria-hidden="true"></span>
    </label>
  `;
}

function renderModuleDate(row, column, progress) {
  const dateValue = normalizeDateValue(progress.dates[column.key]);
  const studentId = escapeHtml(row.normalizedIdUnique);
  const moduleKey = escapeHtml(column.key);

  return `
    <input class="module-date" type="date" data-module-date="true" data-empty="${dateValue ? "false" : "true"}" data-student-id="${studentId}" data-module-key="${moduleKey}" value="${escapeHtml(dateValue)}">
  `;
}

function renderTable() {
  renderSummary();

  if (!modulesTable) return;

  const rows = getFilteredRows();

  if (!rows.length) {
    modulesTable.innerHTML = `<div class="modules-empty">Aucun élève trouvé.</div>`;
    return;
  }

  const head = `
    <div class="modules-row head">
      <div>Élève</div>
      ${MODULE_COLUMNS.map(column => `<div>${escapeHtml(column.label)}</div><div>Date</div>`).join("")}
    </div>
  `;

  const body = rows.map(row => {
    const progress = getProgress(row.normalizedIdUnique);
    const moduleCells = MODULE_COLUMNS.map(column => `
      <div class="modules-cell">${renderModuleCheck(row, column, progress)}</div>
      <div class="modules-cell">${renderModuleDate(row, column, progress)}</div>
    `).join("");

    return `
      <div class="modules-row" data-student-row="${escapeHtml(row.normalizedIdUnique)}">
        <div class="modules-cell modules-student">
          <strong>${escapeHtml(row.studentName)}</strong>
          <span>ID Unique : ${escapeHtml(row.idUnique)}</span>
        </div>
        ${moduleCells}
      </div>
    `;
  }).join("");

  modulesTable.innerHTML = head + body;
}

function renderError(message) {
  if (!modulesTable) return;
  modulesTable.innerHTML = `<div class="modules-error">${escapeHtml(message)}</div>`;
}

async function loadAndRenderModules() {
  try {
    showLoader("Chargement de l'effectif...");
    setStatus("", "");
    effectifRows = await loadEffectifRows();

    showLoader("Chargement des coches et dates...");
    await loadStudentProgress();
    renderTable();

    if (!modulesStatus?.textContent) setStatus("", "");
  } catch (error) {
    console.error("Chargement modules élèves impossible :", error);
    renderSummary();
    renderError(error.message || "Chargement impossible.");
    setStatus("Chargement impossible.", "error");
  } finally {
    hideLoader();
  }
}

function getStudentById(studentId) {
  return effectifRows.find(row => row.normalizedIdUnique === studentId) || null;
}

async function saveStudentModulePatch(student, moduleKey, patch) {
  if (!student) throw new Error("Élève introuvable dans l'effectif.");
  if (!writesAvailable) throw new Error("La sauvegarde des modules est momentanément indisponible.");

  const data = {
    idUnique: student.idUnique,
    studentId: student.normalizedIdUnique,
    normalizedIdUnique: student.normalizedIdUnique,
    studentName: student.studentName,
    searchText: student.searchText,
    cursusKey: currentCursusKey,
    cursusSpreadsheetId: currentCursusSettings?.spreadsheetId || null,
    cursusGid: currentCursusSettings?.gid || null,
    updatedAt: serverTimestamp(),
    updatedBy: currentUser?.email || null
  };

  if (Object.prototype.hasOwnProperty.call(patch, "checked")) {
    data.checks = { [moduleKey]: patch.checked === true };
  }

  if (Object.prototype.hasOwnProperty.call(patch, "date")) {
    data.dates = { [moduleKey]: normalizeDateValue(patch.date) };
  }

  await withTimeout(
    setDoc(doc(db, STUDENT_MODULES_COLLECTION, getStudentModuleDocId(student.normalizedIdUnique)), data, { merge: true }),
    FIRESTORE_TIMEOUT_MS,
    "La sauvegarde prend trop de temps."
  );
}

async function handleModuleCheckChange(input) {
  const studentId = input.dataset.studentId || "";
  const moduleKey = input.dataset.moduleKey || "";
  const student = getStudentById(studentId);
  const progress = getProgress(studentId);
  const before = cloneProgress(progress);
  const checked = input.checked === true;
  const row = input.closest(".modules-row");
  const dateInput = row?.querySelector(`[data-module-date][data-module-key="${moduleKey}"]`);
  const checkLabel = input.closest(".module-check");

  progress.checks[moduleKey] = checked;

  if (checked && !progress.dates[moduleKey]) {
    progress.dates[moduleKey] = getTodayDateValue();
    if (dateInput) {
      dateInput.value = progress.dates[moduleKey];
      dateInput.dataset.empty = "false";
    }
  }

  checkLabel?.classList.toggle("checked", checked);
  checkLabel?.classList.add("saving");
  dateInput?.classList.add("saving");
  renderSummary();

  try {
    await saveStudentModulePatch(student, moduleKey, {
      checked,
      date: progress.dates[moduleKey] || ""
    });
    setStatus("", "");
  } catch (error) {
    progressById.set(studentId, before);
    renderTable();
    console.error("Sauvegarde coche impossible :", error);
    setStatus("Sauvegarde impossible.", "error");
    alert("Sauvegarde impossible. Réessaie dans quelques instants.");
  } finally {
    checkLabel?.classList.remove("saving");
    dateInput?.classList.remove("saving");
  }
}

async function handleModuleDateChange(input) {
  const studentId = input.dataset.studentId || "";
  const moduleKey = input.dataset.moduleKey || "";
  const student = getStudentById(studentId);
  const progress = getProgress(studentId);
  const before = cloneProgress(progress);
  const value = normalizeDateValue(input.value);

  progress.dates[moduleKey] = value;
  input.value = value;
  input.dataset.empty = value ? "false" : "true";
  input.classList.add("saving");

  try {
    await saveStudentModulePatch(student, moduleKey, { date: value });
    setStatus("", "");
  } catch (error) {
    progressById.set(studentId, before);
    renderTable();
    console.error("Sauvegarde date impossible :", error);
    setStatus("Sauvegarde impossible.", "error");
    alert("Sauvegarde impossible. Réessaie dans quelques instants.");
  } finally {
    input.classList.remove("saving");
  }
}

modulesSearch?.addEventListener("input", event => {
  currentFilter = normalizeSearchText(event.target.value);
  renderTable();
});

reloadModulesBtn?.addEventListener("click", () => {
  loadAndRenderModules();
});

modulesTable?.addEventListener("change", event => {
  const checkInput = event.target.closest("[data-module-check]");
  if (checkInput) {
    handleModuleCheckChange(checkInput);
    return;
  }

  const dateInput = event.target.closest("[data-module-date]");
  if (dateInput) {
    handleModuleDateChange(dateInput);
  }
});

onAuthStateChanged(auth, async user => {
  currentUser = user || null;

  if (!user) {
    showGuardMessage("Connexion requise", "Connecte-toi d'abord avec le compte professeur.");
    return;
  }

  try {
    currentAccess = await getUserAccess(user);
  } catch (error) {
    console.error("Vérification accès modules impossible :", error);
    showGuardMessage("Vérification impossible", "Impossible de vérifier ton compte. Réessaie dans quelques instants.");
    return;
  }

  if (currentAccess.role !== "prof" && !currentAccess.admin) {
    showGuardMessage("Accès refusé", "Cette page est réservée aux comptes professeur et admin.");
    return;
  }

  showProtectedContent();
  await loadAndRenderModules();
});
