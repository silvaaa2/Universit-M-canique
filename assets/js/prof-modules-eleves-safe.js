import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getProfAccess, getProfActorId } from "./prof-identity.js?v=2";
import {
  ALL_PROGRESS_CHECK_KEYS,
  getCheckLabel,
  getProgressionBlockReason
} from "./module-progression-rules.js?v=1";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const FIRESTORE_TIMEOUT_MS = 8500;
const EFFECTIF_TIMEOUT_MS = 20000;
const MODULE_WORKSPACE_URL = "/api/secure-sheet?source=module-workspace&sheet=current";

const MODULE_COLUMNS = [
  { key: "module1", label: "Module 1" },
  { key: "module2", label: "Module 2" },
  { key: "module3", label: "Module 3", verificationKey: "verif3", verificationLabel: "Vérif 3" },
  { key: "module4", label: "Module 4", verificationKey: "verif4", verificationLabel: "Vérif 4" },
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
const modulesMainContent = document.querySelector(".modules-v2-content");

let currentUser = null;
let currentAccess = { role: null, admin: false };
let effectifRows = [];
let progressById = new Map();
let currentFilter = "";
let currentCursusKey = "";
let currentCursusSettings = null;
const studentWriteQueues = new Map();
let modulesRefreshLoading = false;
let lastRenderedSignature = "";
let criticalReadyAnnounced = false;

function announceModulesReady() {
  if (criticalReadyAnnounced) return;
  criticalReadyAnnounced = true;
  window.profModulesCriticalReady = true;
  window.dispatchEvent(new CustomEvent("profModulesReady", {
    detail: {
      cursusKey: currentCursusKey,
      studentCount: effectifRows.length
    }
  }));
}

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
  return ALL_PROGRESS_CHECK_KEYS.reduce((checks, checkKey) => {
    checks[checkKey] = false;
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

  ALL_PROGRESS_CHECK_KEYS.forEach(checkKey => {
    progress.checks[checkKey] = progress.checks[checkKey] === true;
  });

  MODULE_COLUMNS.forEach(column => {
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
  if (modulesMainContent) modulesMainContent.hidden = false;
}

function showGuardMessage(title, message) {
  // Le garde est dans protectedContent : cacher le parent produisait un écran
  // noir quand Firebase restaurait la session plus lentement sur mobile.
  if (protectedContent) protectedContent.hidden = false;
  if (modulesMainContent) modulesMainContent.hidden = true;
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
  return getProfAccess(user, async () => {
    if (!user?.email) return { role: null, admin: false };
    const snap = await withTimeout(
      getDoc(doc(db, "users", user.email)),
      FIRESTORE_TIMEOUT_MS,
      "Vérification du compte trop longue."
    );
    if (!snap.exists()) return { role: null, admin: false };
    const data = snap.data();
    return { role: data.role || null, admin: data.admin === true };
  });
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
  const params = new URLSearchParams({
    source: "module-workspace",
    sheet: "current"
  });

  const requestWorkspace = async forceRefresh => {
    const token = await withTimeout(
      currentUser?.getIdToken?.(forceRefresh),
      FIRESTORE_TIMEOUT_MS,
      "La session professeur met trop de temps à répondre."
    );
    if (!token) throw new Error("Session professeur indisponible. Reconnecte-toi puis réessaie.");

    return fetchWithTimeout(`/api/secure-sheet?${params.toString()}`, EFFECTIF_TIMEOUT_MS, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` }
    });
  };

  let response = await requestWorkspace(false);

  // Les navigateurs mobiles peuvent restaurer un ancien jeton après avoir
  // remis l'onglet en mémoire. On le renouvelle une fois avant d'abandonner.
  if (response.status === 401 || response.status === 403) {
    response = await requestWorkspace(true);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error || "").trim() || `Chargement des modules impossible (${response.status}).`);
  }

  const spreadsheetId = extractSpreadsheetId(payload.spreadsheetId || "");
  const gid = String(payload.gid || "").trim();
  const cursusKey = buildCursusKey({ spreadsheetId, gid });

  if (!spreadsheetId || !gid || !cursusKey) {
    throw new Error("Le serveur n'a pas pu identifier le cursus actif.");
  }

  currentCursusSettings = { spreadsheetId, gid, cursusKey };
  currentCursusKey = cursusKey;
  window.profModulesCurrentCursusKey = currentCursusKey;
  window.dispatchEvent(new CustomEvent("profModulesCursusReady", {
    detail: { cursusKey: currentCursusKey }
  }));

  const csv = String(payload.csv || "");
  const rows = normalizeEffectifRows(parseCsv(csv));

  if (!rows.length) {
    throw new Error("Aucun élève avec ID Unique n'a été trouvé dans l'effectif.");
  }

  progressById = new Map();
  (Array.isArray(payload.progressDocuments) ? payload.progressDocuments : []).forEach(item => {
    const data = item?.data || {};
    if (!isCurrentCursusModuleDoc(item?.id, data)) return;

    const studentId = getStudentIdFromModuleDoc(item?.id, data);
    if (!studentId) return;
    progressById.set(studentId, normalizeProgress(data));
  });

  return rows;
}

async function loadStudentProgress() {
  // L'effectif et la progression arrivent ensemble par la route serveur.
  // Cette fonction reste volontairement présente pour conserver le contrat
  // du chargeur et éviter une deuxième lecture Firebase dans le navigateur.
  return progressById;
}

function getModulesStateSignature() {
  return effectifRows.map(row => {
    const progress = progressById.get(row.normalizedIdUnique) || normalizeProgress({});
    const checks = ALL_PROGRESS_CHECK_KEYS.map(key => progress.checks[key] === true ? "1" : "0").join("");
    const dates = MODULE_COLUMNS.map(column => progress.dates[column.key] || "").join(",");
    return `${row.normalizedIdUnique}:${row.studentName}:${checks}:${dates}`;
  }).join("|");
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

function renderCheckButton(row, checkKey, label, progress, { verification = false } = {}) {
  const checked = progress.checks[checkKey] === true;
  const lockReason = checked ? "" : getProgressionBlockReason(progress.checks, checkKey, true);
  const locked = Boolean(lockReason);
  const studentId = escapeHtml(row.normalizedIdUnique);
  const moduleKey = escapeHtml(checkKey);
  const safeLabel = escapeHtml(label);
  const classes = [
    "module-check",
    verification ? "module-verification-check" : "",
    checked ? "checked" : "",
    locked ? "is-locked" : ""
  ].filter(Boolean).join(" ");
  const title = lockReason || (checked ? `${label} validé` : `${label} non validé`);

  return `
    <button type="button" class="${classes}" title="${escapeHtml(title)}" aria-label="${safeLabel} pour ${escapeHtml(row.studentName)}" aria-pressed="${checked ? "true" : "false"}" aria-disabled="${locked ? "true" : "false"}" data-module-check="true" data-student-id="${studentId}" data-module-key="${moduleKey}" data-check-label="${safeLabel}" data-checked="${checked ? "true" : "false"}" data-persisted-checked="${checked ? "true" : "false"}" data-locked="${locked ? "true" : "false"}">
      <span class="module-check-icon" aria-hidden="true"></span>
      ${verification ? `<span class="module-verification-label">${safeLabel}</span>` : ""}
    </button>
  `;
}

function renderModuleCheck(row, column, progress) {
  return `
    <div class="module-check-group">
      ${renderCheckButton(row, column.key, column.label, progress)}
      ${column.verificationKey
        ? renderCheckButton(row, column.verificationKey, column.verificationLabel, progress, { verification: true })
        : ""}
    </div>
  `;
}

function renderModuleDate(row, column, progress) {
  const dateValue = normalizeDateValue(progress.dates[column.key]);
  const lockReason = progress.checks[column.key] === true
    ? ""
    : getProgressionBlockReason(progress.checks, column.key, true);
  const studentId = escapeHtml(row.normalizedIdUnique);
  const moduleKey = escapeHtml(column.key);

  return `
    <input class="module-date" type="date" aria-label="Date ${escapeHtml(column.label)} pour ${escapeHtml(row.studentName)}" title="${escapeHtml(lockReason)}" data-module-date="true" data-empty="${dateValue ? "false" : "true"}" data-student-id="${studentId}" data-module-key="${moduleKey}" value="${escapeHtml(dateValue)}" ${lockReason ? "disabled" : ""}>
  `;
}

function refreshRowControlStates(row, progress) {
  if (!row) return;

  row.querySelectorAll("button[data-module-check]").forEach(control => {
    const checkKey = control.dataset.moduleKey || "";
    const checked = progress.checks[checkKey] === true;
    const lockReason = checked ? "" : getProgressionBlockReason(progress.checks, checkKey, true);
    const label = control.dataset.checkLabel || getCheckLabel(checkKey);

    control.dataset.locked = lockReason ? "true" : "false";
    control.setAttribute("aria-disabled", lockReason ? "true" : "false");
    control.classList.toggle("is-locked", Boolean(lockReason));
    control.title = lockReason || (checked ? `${label} validé` : `${label} non validé`);
  });

  row.querySelectorAll("[data-module-date]").forEach(input => {
    const moduleKey = input.dataset.moduleKey || "";
    const lockReason = progress.checks[moduleKey] === true
      ? ""
      : getProgressionBlockReason(progress.checks, moduleKey, true);

    input.disabled = Boolean(lockReason);
    input.title = lockReason;
  });
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
      <div class="modules-cell module-progress-cell" data-module-label="${escapeHtml(column.label)}">${renderModuleCheck(row, column, progress)}</div>
      <div class="modules-cell module-date-cell">${renderModuleDate(row, column, progress)}</div>
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

async function loadAndRenderModules({ silent = false } = {}) {
  if (modulesRefreshLoading) return false;
  modulesRefreshLoading = true;

  try {
    if (!silent) {
      showLoader("Chargement de l'effectif...");
      setStatus("", "");
    }
    effectifRows = await loadEffectifRows();

    if (!silent) showLoader("Chargement des coches et dates...");
    await loadStudentProgress();
    const nextSignature = getModulesStateSignature();
    if (!silent || nextSignature !== lastRenderedSignature) {
      renderTable();
      lastRenderedSignature = nextSignature;
    }

    if (!silent && !modulesStatus?.textContent) setStatus("", "");
    announceModulesReady();
    return true;
  } catch (error) {
    console.error("Chargement modules élèves impossible :", error);
    if (!silent) {
      renderSummary();
      renderError(error.message || "Chargement impossible.");
      setStatus("Chargement impossible.", "error");
    }
    return false;
  } finally {
    if (!silent) hideLoader();
    modulesRefreshLoading = false;
  }
}

function getStudentById(studentId) {
  return effectifRows.find(row => row.normalizedIdUnique === studentId) || null;
}

async function saveStudentModulePatch(student, moduleKey, patch) {
  if (!student) throw new Error("Élève introuvable dans l'effectif.");

  const progress = getProgress(student.normalizedIdUnique);

  if (Object.prototype.hasOwnProperty.call(patch, "checked")) {
    progress.checks[moduleKey] = patch.checked === true;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "date")) {
    progress.dates[moduleKey] = normalizeDateValue(patch.date);
  }

  const studentId = student.normalizedIdUnique;
  const previousWrite = studentWriteQueues.get(studentId) || Promise.resolve();
  const nextWrite = previousWrite
    .catch(() => undefined)
    .then(async () => {
      const latestProgress = cloneProgress(getProgress(studentId));
      const data = {
        documentId: getStudentModuleDocId(studentId),
        idUnique: student.idUnique,
        studentId,
        normalizedIdUnique: studentId,
        studentName: student.studentName,
        searchText: student.searchText,
        cursusKey: currentCursusKey,
        cursusSpreadsheetId: currentCursusSettings?.spreadsheetId || null,
        cursusGid: currentCursusSettings?.gid || null,
        checks: latestProgress.checks,
        dates: latestProgress.dates,
        updatedBy: getProfActorId(currentUser)
      };

      const commitWrite = async forceRefresh => {
        const token = await withTimeout(
          currentUser?.getIdToken?.(forceRefresh),
          FIRESTORE_TIMEOUT_MS,
          "La session professeur met trop de temps à répondre."
        );
        if (!token) throw new Error("Session professeur indisponible.");

        const response = await fetchWithTimeout(MODULE_WORKSPACE_URL, EFFECTIF_TIMEOUT_MS, {
          method: "POST",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(data)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(String(payload?.error || "").trim() || `Sauvegarde impossible (${response.status}).`);
          error.status = response.status;
          throw error;
        }
      };

      try {
        await commitWrite(false);
      } catch (error) {
        const errorText = String(error?.status || error?.code || error?.message || "").toLowerCase();
        const canRetry = ["401", "403", "permission", "unauthenticated", "unavailable", "deadline", "aborted", "network"]
          .some(token => errorText.includes(token));

        if (!canRetry || !currentUser?.getIdToken) throw error;
        await commitWrite(true);
      }
    });

  studentWriteQueues.set(studentId, nextWrite);

  try {
    await nextWrite;
  } finally {
    if (studentWriteQueues.get(studentId) === nextWrite) {
      studentWriteQueues.delete(studentId);
    }
  }
}

async function handleModuleCheckChange(control) {
  if (control.dataset.moduleSaving === "true") return;

  const studentId = control.dataset.studentId || "";
  const moduleKey = control.dataset.moduleKey || "";
  const student = getStudentById(studentId);
  const progress = getProgress(studentId);
  const before = cloneProgress(progress);
  const checked = control.dataset.checked === "true";
  const row = control.closest(".modules-row");
  const dateInput = row?.querySelector(`[data-module-date][data-module-key="${moduleKey}"]`);

  control.dataset.moduleSaving = "true";

  progress.checks[moduleKey] = checked;

  if (checked && !progress.dates[moduleKey]) {
    progress.dates[moduleKey] = getTodayDateValue();
    if (dateInput) {
      dateInput.value = progress.dates[moduleKey];
      dateInput.dataset.empty = "false";
    }
  }

  control.classList.toggle("checked", checked);
  control.classList.add("saving");
  dateInput?.classList.add("saving");
  refreshRowControlStates(row, progress);
  renderSummary();

  try {
    await saveStudentModulePatch(student, moduleKey, {
      checked,
      date: progress.dates[moduleKey] || ""
    });
    control.dataset.persistedChecked = checked ? "true" : "false";
    refreshRowControlStates(row, progress);
    setStatus("", "");
  } catch (error) {
    progressById.set(studentId, before);
    renderTable();
    console.error("Sauvegarde coche impossible :", error);
    setStatus("Sauvegarde impossible.", "error");
    alert("Sauvegarde impossible. Réessaie dans quelques instants.");
  } finally {
    delete control.dataset.moduleSaving;
    control.classList.remove("saving");
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
  void loadAndRenderModules();
});

window.addEventListener("prof:live-refresh", () => {
  if (!currentUser || modulesRefreshLoading || studentWriteQueues.size > 0) return;
  void loadAndRenderModules({ silent: true });
});

modulesTable?.addEventListener("change", event => {
  const target = event.target instanceof Element ? event.target : null;
  const dateInput = target?.closest("[data-module-date]");
  if (dateInput) {
    handleModuleDateChange(dateInput);
  }
});

// Un vrai bouton évite les différences de comportement des cases transparentes
// entre Chrome, Firefox, Safari et les navigateurs mobiles.
modulesTable?.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : null;
  const control = target?.closest("button[data-module-check]");

  if (!(control instanceof HTMLButtonElement)) return;
  event.preventDefault();
  event.stopPropagation();
  if (control.dataset.moduleSaving === "true") return;

  const studentId = control.dataset.studentId || "";
  const moduleKey = control.dataset.moduleKey || "";
  const progress = getProgress(studentId);
  const checked = control.dataset.checked !== "true";
  const blockReason = getProgressionBlockReason(progress.checks, moduleKey, checked);

  if (blockReason) {
    setStatus(blockReason, "info");
    control.classList.remove("is-blocked-pulse");
    requestAnimationFrame(() => control.classList.add("is-blocked-pulse"));
    window.setTimeout(() => control.classList.remove("is-blocked-pulse"), 620);
    return;
  }

  control.dataset.checked = checked ? "true" : "false";
  control.setAttribute("aria-pressed", checked ? "true" : "false");
  control.title = checked ? "Validé" : "Non validé";
  control.classList.toggle("checked", checked);
  handleModuleCheckChange(control);
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

  window.currentProfUser = user;
  window.dispatchEvent(new CustomEvent("profIdentityReady", {
    detail: { user, identity: user.profIdentity || null }
  }));
  showProtectedContent();
  await loadAndRenderModules();
});
