import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getProfAccess, getProfActorId, isProfAllowed } from "./prof-identity.js?v=2";
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

const WORKSPACE_URL = "/api/secure-sheet?source=module-workspace&sheet=current";
const REQUEST_TIMEOUT_MS = 25000;
const AUTH_TIMEOUT_MS = 9000;
const REFRESH_THROTTLE_MS = 600_000;
const MODULE_COLUMNS = [
  { key: "module1", label: "Module 1" },
  { key: "module2", label: "Module 2" },
  { key: "module3", label: "Module 3", verificationKey: "verif3", verificationLabel: "Vérif 3" },
  { key: "module4", label: "Module 4", verificationKey: "verif4", verificationLabel: "Vérif 4" },
  { key: "exam", label: "Examen" },
  { key: "retakeExam", label: "Rattrapage" }
];
const WARNING_STATES = [
  { key: "none", label: "Aucun averto", short: "—", rowClass: "" },
  { key: "warning1", label: "Averto 1", short: "1", rowClass: "alert-warning-1" },
  { key: "warning2", label: "Averto 2", short: "2", rowClass: "alert-warning-2" },
  { key: "warning3", label: "Averto 3", short: "3", rowClass: "alert-warning-3" },
  { key: "refused", label: "Refusé", short: "×", rowClass: "alert-refused" }
];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const dom = {
  dashboard: document.getElementById("protectedContent"),
  guard: document.getElementById("guardLoader"),
  content: document.querySelector(".modules-v2-content"),
  summary: document.getElementById("modulesSummary"),
  search: document.getElementById("modulesSearch"),
  reload: document.getElementById("reloadModulesBtn"),
  status: document.getElementById("modulesStatus"),
  loader: document.getElementById("modulesLoader"),
  loaderText: document.getElementById("modulesLoaderText"),
  table: document.getElementById("modulesTable")
};

const state = {
  user: null,
  access: { role: null, admin: false },
  students: [],
  progress: new Map(),
  settings: null,
  cursusKey: "",
  filter: "",
  loading: false,
  loaded: false,
  lastLoadAt: 0,
  lastSignature: "",
  writes: new Map(),
  warningStudentId: "",
  warningLevel: "none",
  extrasStarted: false
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeStudentId(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/);
  if (!match) return "";
  const year = String(match[3] || new Date().getFullYear());
  return `${year.length === 2 ? `20${year}` : year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function todayValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function extractSpreadsheetId(value) {
  const text = String(value || "").trim();
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(text) ? text : "";
}

function buildCursusKey(spreadsheetId, gid) {
  const raw = `${spreadsheetId}_${gid}`.toLowerCase();
  const safe = raw.replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe ? `cursus_${safe}` : "";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text || "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some(cell => String(cell).trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some(cell => String(cell).trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return normalizeSearch(value).replace(/[^a-z0-9]+/g, "");
}

function studentsFromCsv(csv) {
  const rows = parseCsv(csv);
  let headerIndex = -1;
  let idIndex = -1;
  let nameIndex = -1;

  rows.some((row, index) => {
    const labels = row.map(normalizeHeader);
    idIndex = labels.findIndex(label => label === "idunique" || label === "identifiant" || label === "id");
    nameIndex = labels.findIndex(label => label === "nomdeleleve" || label === "nomeleve" || label === "nom" || label === "eleve");
    if (idIndex >= 0 && nameIndex >= 0) {
      headerIndex = index;
      return true;
    }
    return false;
  });

  if (headerIndex < 0) {
    headerIndex = 0;
    idIndex = 0;
    nameIndex = 1;
  }

  const seen = new Set();
  return rows.slice(headerIndex + 1).reduce((result, row) => {
    const idUnique = String(row[idIndex] || "").trim();
    const studentName = String(row[nameIndex] || "").trim();
    const id = normalizeStudentId(idUnique);
    if (!id || !studentName || seen.has(id)) return result;
    seen.add(id);
    result.push({
      idUnique,
      normalizedIdUnique: id,
      studentName,
      searchText: normalizeSearch(`${studentName} ${idUnique}`)
    });
    return result;
  }, []);
}

function emptyChecks() {
  return Object.fromEntries(ALL_PROGRESS_CHECK_KEYS.map(key => [key, false]));
}

function emptyDates() {
  return Object.fromEntries(MODULE_COLUMNS.map(column => [column.key, ""]));
}

function normalizeWarningLevel(value) {
  const key = String(value || "none");
  return WARNING_STATES.some(item => item.key === key) ? key : "none";
}

function normalizeProgress(data = {}) {
  const checks = emptyChecks();
  const dates = emptyDates();
  ALL_PROGRESS_CHECK_KEYS.forEach(key => {
    checks[key] = data.checks?.[key] === true;
  });
  MODULE_COLUMNS.forEach(column => {
    dates[column.key] = normalizeDate(data.dates?.[column.key]);
  });
  return {
    checks,
    dates,
    warningLevel: normalizeWarningLevel(data.warningLevel),
    warningComment: String(data.warningComment || "").trim()
  };
}

function cloneProgress(progress) {
  return {
    checks: { ...progress.checks },
    dates: { ...progress.dates },
    warningLevel: progress.warningLevel,
    warningComment: progress.warningComment
  };
}

function getProgress(studentId) {
  if (!state.progress.has(studentId)) state.progress.set(studentId, normalizeProgress());
  return state.progress.get(studentId);
}

function setStatus(message = "", tone = "") {
  if (!dom.status) return;
  dom.status.textContent = message;
  dom.status.dataset.tone = tone;
}

function setLoader(visible, message = "Chargement...") {
  if (dom.loaderText) dom.loaderText.textContent = message;
  if (dom.loader) dom.loader.hidden = !visible;
}

function showGuard(title, message, canRetry = false) {
  dom.dashboard?.classList.add("dashboard-visible");
  if (dom.content) dom.content.hidden = true;
  if (!dom.guard) return;
  dom.guard.hidden = false;
  dom.guard.innerHTML = `
    <div class="prof-login-card">
      <p class="kicker">Accès sécurisé</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="intro">${escapeHtml(message)}</p>
      ${canRetry ? '<button type="button" class="prof-submit" data-modules-auth-retry>Réessayer</button>' : '<button type="button" class="prof-submit" onclick="goPage(\'../index.html\')">Retour à la connexion</button>'}
    </div>`;
}

function showWorkspace() {
  dom.dashboard?.classList.add("dashboard-visible");
  if (dom.guard) dom.guard.hidden = true;
  if (dom.content) dom.content.hidden = false;
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

async function getAccess(user) {
  return getProfAccess(user, async () => {
    if (!user?.email) return { role: null, admin: false };
    const snapshot = await withTimeout(
      getDoc(doc(db, "users", user.email)),
      AUTH_TIMEOUT_MS,
      "Vérification du compte trop longue."
    );
    const data = snapshot.exists() ? snapshot.data() : {};
    return { role: data.role || null, admin: data.admin === true };
  });
}

async function apiRequest({ method = "GET", body = null, forceRefresh = false } = {}) {
  const token = await withTimeout(
    state.user?.getIdToken?.(forceRefresh),
    AUTH_TIMEOUT_MS,
    "La session Discord met trop de temps à répondre."
  );
  if (!token) throw new Error("Session Discord indisponible.");

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(WORKSPACE_URL, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(String(payload.error || "").trim() || `Erreur serveur (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return payload;
  } finally {
    window.clearTimeout(timer);
  }
}

async function requestWithSessionRetry(options = {}) {
  try {
    return await apiRequest(options);
  } catch (error) {
    if (error?.status !== 401 && error?.status !== 403) throw error;
    return apiRequest({ ...options, forceRefresh: true });
  }
}

function applyWorkspace(payload) {
  const spreadsheetId = extractSpreadsheetId(payload.spreadsheetId);
  const gid = String(payload.gid || "").trim();
  const cursusKey = buildCursusKey(spreadsheetId, gid);
  if (!spreadsheetId || !gid || !cursusKey) throw new Error("Le cursus actif est incomplet.");

  const students = studentsFromCsv(String(payload.csv || ""));
  if (!students.length) throw new Error("Aucun élève avec ID Unique n’a été trouvé dans la feuille.");

  state.settings = { spreadsheetId, gid };
  state.cursusKey = cursusKey;
  state.students = students;
  state.progress = new Map();

  (Array.isArray(payload.progressDocuments) ? payload.progressDocuments : []).forEach(item => {
    const data = item?.data || {};
    const belongs = data.cursusKey
      ? data.cursusKey === cursusKey
      : String(item?.id || "").startsWith(`${cursusKey}__`);
    if (!belongs) return;
    const studentId = normalizeStudentId(data.studentId || data.normalizedIdUnique || data.idUnique || String(item?.id || "").slice(`${cursusKey}__`.length));
    if (studentId) state.progress.set(studentId, normalizeProgress(data));
  });

  window.profModulesCurrentCursusKey = cursusKey;
  window.dispatchEvent(new CustomEvent("profModulesCursusReady", { detail: { cursusKey } }));
}

function getVisibleStudents() {
  return state.filter
    ? state.students.filter(student => student.searchText.includes(state.filter))
    : state.students;
}

function doneCount(key) {
  return state.students.reduce((total, student) => total + (getProgress(student.normalizedIdUnique).checks[key] ? 1 : 0), 0);
}

function renderSummary() {
  if (!dom.summary) return;
  const total = state.students.length;
  const items = [
    ["Effectif", total, ""],
    ...MODULE_COLUMNS.map(column => [column.label, `${doneCount(column.key)} / ${total}`, "done"])
  ];
  dom.summary.innerHTML = items.map(([label, value, className]) => `
    <div class="modules-stat ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join("");
}

function warningState(value) {
  return WARNING_STATES.find(item => item.key === normalizeWarningLevel(value)) || WARNING_STATES[0];
}

function renderCheck(student, progress, key, label, verification = false) {
  const checked = progress.checks[key] === true;
  const blockReason = checked ? "" : getProgressionBlockReason(progress.checks, key, true);
  return `
    <button type="button" class="module-check ${verification ? "module-verification-check" : ""} ${checked ? "checked" : ""} ${blockReason ? "is-locked" : ""}"
      title="${escapeHtml(blockReason || (checked ? `${label} validé` : `${label} non validé`))}"
      aria-label="${escapeHtml(label)} pour ${escapeHtml(student.studentName)}"
      aria-pressed="${checked}" aria-disabled="${Boolean(blockReason)}"
      data-module-check="true" data-student-id="${escapeHtml(student.normalizedIdUnique)}"
      data-module-key="${escapeHtml(key)}" data-check-label="${escapeHtml(label)}"
      data-checked="${checked}" data-persisted-checked="${checked}" data-locked="${Boolean(blockReason)}">
      <span class="module-check-icon" aria-hidden="true"></span>
      ${verification ? `<span class="module-verification-label">${escapeHtml(label)}</span>` : ""}
    </button>`;
}

function renderDate(student, progress, column) {
  const value = normalizeDate(progress.dates[column.key]);
  const blockReason = progress.checks[column.key]
    ? ""
    : getProgressionBlockReason(progress.checks, column.key, true);
  return `<input class="module-date" type="date" value="${escapeHtml(value)}"
    aria-label="Date ${escapeHtml(column.label)} pour ${escapeHtml(student.studentName)}"
    title="${escapeHtml(blockReason)}" ${blockReason ? "disabled" : ""}
    data-module-date="true" data-empty="${value ? "false" : "true"}"
    data-student-id="${escapeHtml(student.normalizedIdUnique)}" data-module-key="${escapeHtml(column.key)}">`;
}

function renderTable() {
  renderSummary();
  if (!dom.table) return;
  const students = getVisibleStudents();
  if (!students.length) {
    dom.table.innerHTML = '<div class="modules-empty">Aucun élève trouvé.</div>';
    return;
  }

  const header = `<div class="modules-row head"><div>Élève</div>${MODULE_COLUMNS.map(column => `<div>${escapeHtml(column.label)}</div><div>Date</div>`).join("")}</div>`;
  const rows = students.map(student => {
    const progress = getProgress(student.normalizedIdUnique);
    const warning = warningState(progress.warningLevel);
    const cells = MODULE_COLUMNS.map(column => `
      <div class="modules-cell module-progress-cell" data-module-label="${escapeHtml(column.label)}">
        <div class="module-check-group">
          ${renderCheck(student, progress, column.key, column.label)}
          ${column.verificationKey ? renderCheck(student, progress, column.verificationKey, column.verificationLabel, true) : ""}
        </div>
      </div>
      <div class="modules-cell module-date-cell">${renderDate(student, progress, column)}</div>`).join("");

    return `<div class="modules-row ${warning.rowClass}" data-student-row="${escapeHtml(student.normalizedIdUnique)}">
      <div class="modules-cell modules-student">
        <div><strong>${escapeHtml(student.studentName)}</strong><span>ID Unique : ${escapeHtml(student.idUnique)}</span></div>
        <button type="button" class="module-warning-pill ${warning.rowClass || "alert-none"} ${progress.warningComment ? "has-comment" : ""}"
          data-warning-toggle data-student-id="${escapeHtml(student.normalizedIdUnique)}"
          data-warning-level="${escapeHtml(warning.key)}"
          title="${escapeHtml(progress.warningComment ? `${warning.label} - ${progress.warningComment}` : warning.label)}"
          aria-label="Ouvrir le suivi averto pour ${escapeHtml(student.studentName)}">
          <span aria-hidden="true">!</span><b>${escapeHtml(warning.short)}</b>
        </button>
      </div>${cells}</div>`;
  }).join("");
  dom.table.innerHTML = header + rows;
}

function refreshRow(studentId) {
  const row = dom.table?.querySelector(`[data-student-row="${CSS.escape(studentId)}"]`);
  const student = state.students.find(item => item.normalizedIdUnique === studentId);
  if (!row || !student) {
    renderTable();
    return;
  }
  // Un rendu global est plus sûr : il recalcule tous les verrouillages en ordre.
  renderTable();
}

function renderFailure(error) {
  const message = error?.name === "AbortError"
    ? "Le serveur a mis trop de temps à répondre. Appuie sur Recharger."
    : String(error?.message || "Chargement impossible.");
  if (dom.table) dom.table.innerHTML = `
    <div class="modules-v4-error">
      <strong>Impossible de charger les modules</strong>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="modules-reload-btn" data-modules-inline-retry>Réessayer</button>
    </div>`;
  setStatus("Chargement interrompu", "error");
}

function signature() {
  return state.students.map(student => {
    const progress = getProgress(student.normalizedIdUnique);
    const checks = ALL_PROGRESS_CHECK_KEYS.map(key => progress.checks[key] ? "1" : "0").join("");
    const dates = MODULE_COLUMNS.map(column => progress.dates[column.key] || "").join(",");
    return `${student.normalizedIdUnique}:${checks}:${dates}:${progress.warningLevel}:${progress.warningComment}`;
  }).join("|");
}

async function loadWorkspace({ silent = false, force = false } = {}) {
  if (!state.user || state.loading) return false;
  if (!force && silent && Date.now() - state.lastLoadAt < REFRESH_THROTTLE_MS) return false;
  state.loading = true;
  if (!silent) {
    setLoader(true, "Chargement des élèves et des validations...");
    setStatus("Connexion aux données...", "info");
  }

  try {
    const payload = await requestWithSessionRetry();
    applyWorkspace(payload);
    const nextSignature = signature();
    if (!silent || nextSignature !== state.lastSignature) renderTable();
    state.lastSignature = nextSignature;
    state.lastLoadAt = Date.now();
    state.loaded = true;
    setStatus("Données à jour", "ok");
    announceReady();
    return true;
  } catch (error) {
    console.error("Modules V4 : chargement impossible", error);
    if (!silent || !state.loaded) renderFailure(error);
    return false;
  } finally {
    state.loading = false;
    if (!silent) setLoader(false);
  }
}

function moduleDocumentId(studentId) {
  return `${state.cursusKey}__${studentId}`;
}

async function persistProgress(student) {
  const studentId = student.normalizedIdUnique;
  const latest = cloneProgress(getProgress(studentId));
  const payload = {
    action: "progress",
    documentId: moduleDocumentId(studentId),
    idUnique: student.idUnique,
    studentId,
    normalizedIdUnique: studentId,
    studentName: student.studentName,
    searchText: student.searchText,
    cursusKey: state.cursusKey,
    cursusSpreadsheetId: state.settings?.spreadsheetId || "",
    cursusGid: state.settings?.gid || "",
    checks: latest.checks,
    dates: latest.dates,
    updatedBy: getProfActorId(state.user)
  };

  const previous = state.writes.get(studentId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(() => requestWithSessionRetry({ method: "POST", body: payload }));
  state.writes.set(studentId, next);
  try {
    await next;
  } finally {
    if (state.writes.get(studentId) === next) state.writes.delete(studentId);
  }
}

async function changeCheck(button) {
  if (button.dataset.saving === "true") return;
  const studentId = button.dataset.studentId || "";
  const key = button.dataset.moduleKey || "";
  const student = state.students.find(item => item.normalizedIdUnique === studentId);
  if (!student || !ALL_PROGRESS_CHECK_KEYS.includes(key)) return;
  const progress = getProgress(studentId);
  const before = cloneProgress(progress);
  const nextChecked = button.dataset.checked !== "true";
  const blockReason = getProgressionBlockReason(progress.checks, key, nextChecked);
  if (blockReason) {
    setStatus(blockReason, "info");
    button.classList.add("is-blocked-pulse");
    window.setTimeout(() => button.classList.remove("is-blocked-pulse"), 650);
    return;
  }

  progress.checks[key] = nextChecked;
  if (nextChecked && Object.prototype.hasOwnProperty.call(progress.dates, key) && !progress.dates[key]) {
    progress.dates[key] = todayValue();
  }
  button.dataset.saving = "true";
  refreshRow(studentId);
  setStatus("Sauvegarde...", "info");
  try {
    await persistProgress(student);
    state.lastSignature = signature();
    setStatus("Enregistré", "ok");
  } catch (error) {
    state.progress.set(studentId, before);
    renderTable();
    console.error("Modules V4 : sauvegarde coche impossible", error);
    setStatus("Sauvegarde impossible", "error");
    alert("La validation n’a pas été enregistrée. Réessaie.");
  }
}

async function changeDate(input) {
  const studentId = input.dataset.studentId || "";
  const key = input.dataset.moduleKey || "";
  const student = state.students.find(item => item.normalizedIdUnique === studentId);
  if (!student || !MODULE_COLUMNS.some(column => column.key === key)) return;
  const progress = getProgress(studentId);
  const before = cloneProgress(progress);
  progress.dates[key] = normalizeDate(input.value);
  input.classList.add("saving");
  setStatus("Sauvegarde...", "info");
  try {
    await persistProgress(student);
    state.lastSignature = signature();
    input.dataset.empty = progress.dates[key] ? "false" : "true";
    setStatus("Enregistré", "ok");
  } catch (error) {
    state.progress.set(studentId, before);
    renderTable();
    console.error("Modules V4 : sauvegarde date impossible", error);
    setStatus("Sauvegarde impossible", "error");
    alert("La date n’a pas été enregistrée. Réessaie.");
  } finally {
    input.classList.remove("saving");
  }
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
      <h2 id="moduleWarningTitle" class="module-warning-title">Avertissement</h2>
      <p id="moduleWarningSubtitle" class="module-warning-subtitle"></p>
      <div class="module-warning-choices">${WARNING_STATES.map(item => `<button type="button" class="module-warning-choice" data-warning-choice="${item.key}">${item.label}</button>`).join("")}</div>
      <label class="module-warning-label" for="moduleWarningComment">Motif ou commentaire</label>
      <textarea id="moduleWarningComment" class="module-warning-comment" data-clipboard-scan-ignore placeholder="Explique l’avertissement..."></textarea>
      <div class="module-warning-actions">
        <button type="button" class="module-warning-cancel" data-warning-close>Annuler</button>
        <button type="button" class="module-warning-save" data-warning-save>Enregistrer</button>
      </div>
    </section>`;
  document.body.appendChild(modal);
  return modal;
}

function refreshWarningChoices() {
  ensureWarningModal().querySelectorAll("[data-warning-choice]").forEach(button => {
    button.classList.toggle("active", button.dataset.warningChoice === state.warningLevel);
  });
}

function openWarning(studentId) {
  const student = state.students.find(item => item.normalizedIdUnique === studentId);
  if (!student) return;
  const progress = getProgress(studentId);
  const modal = ensureWarningModal();
  state.warningStudentId = studentId;
  state.warningLevel = normalizeWarningLevel(progress.warningLevel);
  modal.querySelector("#moduleWarningTitle").textContent = student.studentName;
  modal.querySelector("#moduleWarningSubtitle").textContent = `ID Unique : ${student.idUnique}`;
  modal.querySelector("#moduleWarningComment").value = progress.warningComment;
  refreshWarningChoices();
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("is-open"));
}

function closeWarning() {
  const modal = document.getElementById("moduleWarningModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  window.setTimeout(() => { modal.hidden = true; }, 180);
  state.warningStudentId = "";
}

async function saveWarning() {
  const studentId = state.warningStudentId;
  const student = state.students.find(item => item.normalizedIdUnique === studentId);
  if (!student) return;
  const modal = ensureWarningModal();
  const button = modal.querySelector("[data-warning-save]");
  const progress = getProgress(studentId);
  const before = cloneProgress(progress);
  progress.warningLevel = normalizeWarningLevel(state.warningLevel);
  progress.warningComment = String(modal.querySelector("#moduleWarningComment")?.value || "").trim();
  button.disabled = true;

  try {
    await requestWithSessionRetry({
      method: "POST",
      body: {
        action: "warning",
        documentId: moduleDocumentId(studentId),
        studentId,
        normalizedIdUnique: studentId,
        cursusKey: state.cursusKey,
        warningLevel: progress.warningLevel,
        warningComment: progress.warningComment
      }
    });
    state.lastSignature = signature();
    renderTable();
    closeWarning();
    setStatus("Avertissement enregistré", "ok");
  } catch (error) {
    state.progress.set(studentId, before);
    console.error("Modules V4 : sauvegarde averto impossible", error);
    setStatus("Avertissement non enregistré", "error");
    alert("L’avertissement n’a pas été enregistré. Réessaie.");
  } finally {
    button.disabled = false;
  }
}

function announceReady() {
  if (window.profModulesCriticalReady) return;
  window.profModulesCriticalReady = true;
  window.dispatchEvent(new CustomEvent("profModulesReady", {
    detail: { cursusKey: state.cursusKey, studentCount: state.students.length }
  }));
  loadExtras();
}

async function importOptional(path, label, delay) {
  await new Promise(resolve => window.setTimeout(resolve, delay));
  try {
    await import(path);
  } catch (error) {
    console.warn(`${label} indisponible :`, error);
  }
}

function loadExtras() {
  if (state.extrasStarted) return;
  state.extrasStarted = true;
  // Chaque outil arrive après le tableau. Aucun ne peut bloquer l'effectif.
  void importOptional("./prof-modules-clipboard.js?v=11", "Pointage automatique", 100);
  void importOptional("./prof-modules-archives.js?v=1006", "Archives cursus", 700);
  void importOptional("./prof-modules-sheets-sync.js?v=1011", "Bouton Sync Sheets", 1100)
    .then(() => importOptional("./prof-modules-sheets-sync-exact.js?v=1012", "Synchronisation exacte", 250));
  void importOptional("./prof-presence.js?v=9", "Présence professeur", 1800);
  void importOptional("./prof-notifications-v2.js?v=10", "Pastilles de notifications", 2300);
}

dom.search?.addEventListener("input", event => {
  state.filter = normalizeSearch(event.target.value);
  renderTable();
});

dom.reload?.addEventListener("click", () => void loadWorkspace({ force: true }));

dom.table?.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : null;
  const retry = target?.closest("[data-modules-inline-retry]");
  const check = target?.closest("button[data-module-check]");
  const warning = target?.closest("button[data-warning-toggle]");
  if (retry) void loadWorkspace({ force: true });
  if (check) {
    event.preventDefault();
    void changeCheck(check);
  }
  if (warning) {
    event.preventDefault();
    openWarning(warning.dataset.studentId || "");
  }
});

dom.table?.addEventListener("change", event => {
  const target = event.target instanceof Element ? event.target : null;
  const input = target?.closest("input[data-module-date]");
  if (input) void changeDate(input);
});

document.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("[data-warning-close]")) closeWarning();
  const choice = target?.closest("[data-warning-choice]");
  if (choice) {
    state.warningLevel = normalizeWarningLevel(choice.dataset.warningChoice);
    refreshWarningChoices();
  }
  if (target?.closest("[data-warning-save]")) void saveWarning();
  if (target?.closest("[data-modules-auth-retry]")) window.location.reload();
});

window.addEventListener("prof:live-refresh", () => {
  if (document.hidden || state.writes.size || !state.loaded) return;
  void loadWorkspace({ silent: true });
});

window.addEventListener("unhandledrejection", event => {
  console.error("Modules V4 : erreur non gérée", event.reason);
});

onAuthStateChanged(auth, async user => {
  state.user = user || null;
  if (!user) {
    setLoader(false);
    showGuard("Connexion requise", "Reconnecte-toi avec Discord pour ouvrir les modules élèves.");
    return;
  }

  try {
    state.access = await getAccess(user);
    if (!isProfAllowed(state.access)) {
      setLoader(false);
      showGuard("Accès refusé", "Cette page est réservée aux professeurs et administrateurs.");
      return;
    }

    window.currentProfUser = user;
    window.dispatchEvent(new CustomEvent("profIdentityReady", {
      detail: { user, identity: state.access.identity || user.profIdentity || null }
    }));
    showWorkspace();
    await loadWorkspace({ force: true });
  } catch (error) {
    console.error("Modules V4 : vérification de session impossible", error);
    setLoader(false);
    showGuard("Session indisponible", "La vérification Discord a échoué. Réessaie.", true);
  }
});

// La feuille prof.css démarre les dashboards à opacity:0. La page Modules ne
// dépend plus d'un ancien garde externe pour devenir visible.
requestAnimationFrame(() => dom.dashboard?.classList.add("dashboard-visible"));
