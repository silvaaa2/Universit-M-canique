import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const STAGE_SETTINGS_COLLECTION = "stageSettings";
const EFFECTIF_SETTINGS_DOC_ID = "effectif";
const STUDENT_MODULES_COLLECTION = "studentModules";

const DEFAULT_EFFECTIF_SPREADSHEET_ID = "1DRZwLrNXK_kkxpSsaPn_m7XDJ5v0_5iGq-8FoWTQRYU";
const DEFAULT_EFFECTIF_GID = "460642936";

const MODULE_COLUMNS = [
  { key: "module1", label: "Module 1" },
  { key: "module2", label: "Module 2" },
  { key: "module3", label: "Module 3" },
  { key: "module4", label: "Module 4" },
  { key: "exam", label: "Examen" },
  { key: "retakeExam", label: "Rattrapage" }
];

let currentUser = null;
let currentAccess = { role: null, admin: false };
let effectifRows = [];
let studentProgressById = new Map();
let currentSearch = "";
let hasLoadedOnce = false;
let modalEventsBound = false;
let positionObserverStarted = false;

function waitForProfFirebase() {
  if (window.profFirebase?.db) {
    return Promise.resolve(window.profFirebase);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Firebase prof n'est pas pret."));
    }, 8000);

    window.addEventListener("profFirebaseReady", () => {
      clearTimeout(timeout);
      resolve(window.profFirebase);
    }, { once: true });
  });
}

function canUseStudentModules() {
  return currentAccess.role === "prof" || currentAccess.admin === true;
}

async function loadUserAccess(user) {
  if (!user?.email) return { role: null, admin: false };

  try {
    const firebase = await waitForProfFirebase();
    const snap = await firebase.getDoc(firebase.doc(firebase.db, "users", user.email));

    if (!snap.exists()) return { role: null, admin: false };

    const data = snap.data();
    return {
      role: data.role || null,
      admin: data.admin === true
    };
  } catch (error) {
    console.warn("Acces modules eleves indisponible :", error);
    return { role: null, admin: false };
  }
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildEffectifEditLink(spreadsheetId, gid) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=${gid}#gid=${gid}`;
}

function normalizeEffectifSettings(settings) {
  const spreadsheetId = settings?.spreadsheetId || DEFAULT_EFFECTIF_SPREADSHEET_ID;
  const gid = settings?.gid || DEFAULT_EFFECTIF_GID;

  return {
    link: settings?.link || buildEffectifEditLink(spreadsheetId, gid),
    spreadsheetId,
    gid
  };
}

async function loadEffectifSettings() {
  try {
    const firebase = await waitForProfFirebase();
    const snap = await firebase.getDoc(firebase.doc(firebase.db, STAGE_SETTINGS_COLLECTION, EFFECTIF_SETTINGS_DOC_ID));
    return normalizeEffectifSettings(snap.exists() ? snap.data() : null);
  } catch (error) {
    console.warn("Reglage effectif indisponible, fallback utilise :", error);
    return normalizeEffectifSettings(null);
  }
}

function buildEffectifCsvUrl(settings) {
  return `https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/export?format=csv&gid=${settings.gid}`;
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

      if (row.some(cell => String(cell).trim() !== "")) {
        rows.push(row);
      }

      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);

  if (row.some(cell => String(cell).trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function normalizeEffectifRows(rows) {
  if (!rows.length) return [];

  const firstA = normalizeSearchText(rows[0]?.[0] || "");
  const firstB = normalizeSearchText(rows[0]?.[1] || "");

  const hasHeader =
    firstA.includes("id") ||
    firstA.includes("unique") ||
    firstB.includes("nom") ||
    firstB.includes("prenom") ||
    firstB.includes("eleve");

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
        studentName: studentName || "Nom non renseigne"
      };
    })
    .filter(item => item.normalizedIdUnique)
    .filter(item => {
      if (seenIds.has(item.normalizedIdUnique)) return false;
      seenIds.add(item.normalizedIdUnique);
      return true;
    });
}

function getEmptyChecks() {
  return MODULE_COLUMNS.reduce((checks, column) => {
    checks[column.key] = false;
    return checks;
  }, {});
}

function normalizeProgress(data = {}) {
  const checks = {
    ...getEmptyChecks(),
    ...(data.checks || {})
  };

  MODULE_COLUMNS.forEach(column => {
    checks[column.key] = checks[column.key] === true;
  });

  return {
    ...data,
    checks,
    completedAt: data.completedAt || {}
  };
}

async function loadEffectifRows(force = false) {
  if (effectifRows.length && !force) return effectifRows;

  const settings = await loadEffectifSettings();
  const response = await fetch(buildEffectifCsvUrl(settings));

  if (!response.ok) {
    throw new Error(`Erreur Google Sheets : ${response.status}`);
  }

  const csvText = await response.text();
  effectifRows = normalizeEffectifRows(parseCsv(csvText));
  return effectifRows;
}

async function loadStudentProgress(force = false) {
  if (studentProgressById.size && !force) return studentProgressById;

  const firebase = await waitForProfFirebase();
  const snap = await firebase.getDocs(firebase.collection(firebase.db, STUDENT_MODULES_COLLECTION));
  studentProgressById = new Map();

  snap.forEach(docSnap => {
    studentProgressById.set(docSnap.id, normalizeProgress({
      firebaseId: docSnap.id,
      ...docSnap.data()
    }));
  });

  return studentProgressById;
}

function injectStudentModulesStyles() {
  if (document.getElementById("studentModulesStyles")) return;

  const style = document.createElement("style");
  style.id = "studentModulesStyles";
  style.textContent = `
    .student-modules-btn {
      margin-left: auto;
      border-color: rgba(214,180,106,.34) !important;
      background: rgba(214,180,106,.12) !important;
      color: var(--gold2) !important;
    }

    .prof-admin-btn + .student-modules-btn {
      margin-left: 0;
    }

    .student-modules-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 10950;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(0,0,0,.70);
      backdrop-filter: blur(16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s ease;
    }

    .student-modules-modal-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .student-modules-modal-overlay[hidden] {
      display: none !important;
    }

    .student-modules-modal-card {
      position: relative;
      width: min(1380px, 100%);
      max-height: min(88vh, 900px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 22px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.11);
      background:
        radial-gradient(circle at 14% 0%, rgba(214,180,106,.15), transparent 34%),
        linear-gradient(145deg, rgba(255,255,255,.078), rgba(255,255,255,.030)),
        rgba(8,8,8,.98);
      box-shadow:
        0 35px 120px rgba(0,0,0,.68),
        inset 0 1px 0 rgba(255,255,255,.05);
      transform: translateY(18px) scale(.98);
      transition: transform .18s ease;
    }

    .student-modules-modal-overlay.active .student-modules-modal-card {
      transform: translateY(0) scale(1);
    }

    .student-modules-close {
      position: absolute;
      top: 18px;
      right: 18px;
      width: 36px;
      height: 36px;
      border: 1px solid rgba(248,113,113,.28);
      border-radius: 8px;
      background: rgba(248,113,113,.12);
      color: #fca5a5;
      font-size: 22px;
      font-weight: 1000;
      line-height: 1;
      cursor: pointer;
    }

    .student-modules-modal-card h2 {
      margin: 0;
      padding-right: 52px;
      font-size: clamp(34px, 4vw, 58px);
      line-height: .9;
      letter-spacing: -.065em;
    }

    .student-modules-intro {
      max-width: 760px;
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 14px;
      font-weight: 800;
      line-height: 1.5;
    }

    .student-modules-summary {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 10px;
      margin: 18px 0 14px;
    }

    .student-modules-stat {
      min-height: 82px;
      padding: 13px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.085);
      background:
        linear-gradient(145deg, rgba(255,255,255,.060), rgba(255,255,255,.022)),
        rgba(0,0,0,.22);
    }

    .student-modules-stat span {
      display: block;
      margin-bottom: 10px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 1000;
      text-transform: uppercase;
    }

    .student-modules-stat strong {
      display: block;
      color: var(--text);
      font-size: 24px;
      line-height: 1;
      font-weight: 1000;
      letter-spacing: -.04em;
    }

    .student-modules-stat.done strong {
      color: #86efac;
    }

    .student-modules-toolbar {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto auto;
      gap: 10px;
      align-items: center;
      margin-bottom: 14px;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.035);
    }

    .student-modules-search {
      width: 100%;
      height: 44px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.11);
      background: rgba(0,0,0,.28);
      color: var(--text);
      padding: 0 14px;
      font: inherit;
      font-size: 14px;
      font-weight: 900;
      outline: none;
    }

    .student-modules-search:focus {
      border-color: rgba(214,180,106,.45);
      box-shadow: 0 0 0 3px rgba(214,180,106,.10);
    }

    .student-modules-status {
      min-height: 18px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
      text-align: right;
    }

    .student-modules-status[data-tone="ok"] {
      color: #86efac;
    }

    .student-modules-status[data-tone="error"] {
      color: #fca5a5;
    }

    .student-modules-status[data-tone="info"] {
      color: #7dd3fc;
    }

    .student-modules-table-wrap {
      position: relative;
      min-height: 260px;
      overflow: auto;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(0,0,0,.22);
    }

    .student-modules-loader {
      position: absolute;
      inset: 0;
      z-index: 4;
      display: grid;
      place-items: center;
      background: rgba(8,8,8,.74);
      backdrop-filter: blur(10px);
    }

    .student-modules-loader[hidden] {
      display: none !important;
    }

    .student-modules-loader-box {
      width: min(360px, 92%);
      padding: 20px;
      border-radius: 8px;
      border: 1px solid rgba(214,180,106,.24);
      background: rgba(18,18,18,.96);
      text-align: center;
    }

    .student-modules-spinner {
      width: 34px;
      height: 34px;
      margin: 0 auto 12px;
      border-radius: 999px;
      border: 3px solid rgba(214,180,106,.18);
      border-top-color: var(--gold2);
      animation: studentModulesSpin .75s linear infinite;
    }

    @keyframes studentModulesSpin {
      to { transform: rotate(360deg); }
    }

    .student-modules-loader-box p {
      margin: 0;
      color: var(--gold2);
      font-size: 13px;
      font-weight: 1000;
    }

    .student-modules-table {
      min-width: 980px;
    }

    .student-modules-row {
      display: grid;
      grid-template-columns: minmax(260px, 1.3fr) 116px repeat(6, minmax(112px, 1fr));
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,.07);
    }

    .student-modules-head {
      position: sticky;
      top: 0;
      z-index: 2;
      background:
        linear-gradient(145deg, rgba(214,180,106,.14), rgba(255,255,255,.035)),
        rgba(12,12,12,.98);
      backdrop-filter: blur(14px);
    }

    .student-modules-head > div {
      padding: 13px 12px;
      color: var(--gold2);
      font-size: 11px;
      font-weight: 1000;
      text-transform: uppercase;
      border-right: 1px solid rgba(255,255,255,.07);
    }

    .student-modules-cell {
      min-width: 0;
      padding: 11px 12px;
      border-right: 1px solid rgba(255,255,255,.055);
    }

    .student-modules-student strong,
    .student-modules-id strong {
      display: block;
      overflow: hidden;
      color: var(--text);
      font-size: 14px;
      font-weight: 1000;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .student-modules-student span,
    .student-modules-id span {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
    }

    .student-module-check {
      width: 100%;
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 7px 9px;
      border-radius: 999px;
      border: 1px solid rgba(248,113,113,.28);
      background: rgba(248,113,113,.10);
      color: #fca5a5;
      font-size: 12px;
      font-weight: 1000;
      cursor: pointer;
      user-select: none;
      transition: transform .18s ease, border-color .18s ease, background .18s ease, color .18s ease;
    }

    .student-module-check:hover {
      transform: translateY(-1px);
    }

    .student-module-check input {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: #86efac;
      cursor: pointer;
    }

    .student-module-check.checked {
      border-color: rgba(74,222,128,.36);
      background: rgba(74,222,128,.13);
      color: #86efac;
      box-shadow: 0 0 18px rgba(74,222,128,.10);
    }

    .student-module-check.is-saving {
      opacity: .72;
      pointer-events: none;
    }

    .student-modules-empty,
    .student-modules-error {
      margin: 14px;
      padding: 18px;
      border-radius: 8px;
      border: 1px solid rgba(214,180,106,.18);
      background: rgba(214,180,106,.08);
      color: var(--gold2);
      font-weight: 1000;
      line-height: 1.45;
      text-align: center;
    }

    .student-modules-error {
      border-color: rgba(248,113,113,.28);
      background: rgba(248,113,113,.10);
      color: #fca5a5;
    }

    @media (max-width: 980px) {
      .student-modules-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .student-modules-toolbar {
        grid-template-columns: 1fr;
      }

      .student-modules-status {
        text-align: left;
      }
    }

    @media (max-width: 650px) {
      .student-modules-modal-overlay {
        padding: 12px;
      }

      .student-modules-modal-card {
        padding: 18px;
      }

      .student-modules-summary {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

function openModal(modal) {
  if (!modal) return;

  modal.hidden = false;

  requestAnimationFrame(() => {
    modal.classList.add("active");
  });
}

function closeModal(modal) {
  if (!modal) return;

  modal.classList.remove("active");

  setTimeout(() => {
    modal.hidden = true;
  }, 180);
}

function ensureStudentModulesModal() {
  if (document.getElementById("studentModulesModal")) return;

  injectStudentModulesStyles();

  document.body.insertAdjacentHTML("beforeend", `
    <div id="studentModulesModal" class="student-modules-modal-overlay" hidden>
      <div class="student-modules-modal-card">
        <button type="button" class="student-modules-close" onclick="window.closeStudentModulesPanel()">x</button>

        <p class="kicker">Suivi modules</p>
        <h2>Modules eleves</h2>
        <p class="student-modules-intro">
          La liste vient de l'effectif partage du site stage. Les coches sont sauvegardees dans Firebase pour le suivi professeur.
        </p>

        <div id="studentModulesSummary" class="student-modules-summary"></div>

        <div class="student-modules-toolbar">
          <input id="studentModulesSearch" class="student-modules-search" type="text" autocomplete="off" placeholder="Rechercher nom ou ID Unique...">
          <button type="button" class="prof-admin-small-btn" id="reloadStudentModulesBtn">Recharger</button>
          <span id="studentModulesStatus" class="student-modules-status"></span>
        </div>

        <div class="student-modules-table-wrap">
          <div id="studentModulesLoader" class="student-modules-loader" hidden>
            <div class="student-modules-loader-box">
              <div class="student-modules-spinner"></div>
              <p id="studentModulesLoaderText">Chargement...</p>
            </div>
          </div>

          <div id="studentModulesTable" class="student-modules-table"></div>
        </div>
      </div>
    </div>
  `);

  bindStudentModulesModalEvents();
}

function bindStudentModulesModalEvents() {
  if (modalEventsBound) return;
  modalEventsBound = true;

  document.getElementById("reloadStudentModulesBtn")?.addEventListener("click", () => {
    loadAndRenderStudentModules(true);
  });

  document.getElementById("studentModulesSearch")?.addEventListener("input", event => {
    currentSearch = event.target.value || "";
    renderStudentModulesTable();
  });

  document.getElementById("studentModulesTable")?.addEventListener("change", event => {
    const input = event.target.closest("[data-module-check]");
    if (!input) return;

    saveModuleCheck(input);
  });
}

function setModulesStatus(message, tone = "") {
  const status = document.getElementById("studentModulesStatus");
  if (!status) return;

  status.textContent = message || "";
  status.dataset.tone = tone;
}

function showModulesLoader(message = "Chargement...") {
  const loader = document.getElementById("studentModulesLoader");
  const text = document.getElementById("studentModulesLoaderText");

  if (text) text.textContent = message;
  if (loader) loader.hidden = false;
}

function hideModulesLoader() {
  const loader = document.getElementById("studentModulesLoader");
  if (loader) loader.hidden = true;
}

function getProgressForStudent(normalizedIdUnique) {
  return studentProgressById.get(normalizedIdUnique) || normalizeProgress({});
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

function renderStudentModulesSummary() {
  const summary = document.getElementById("studentModulesSummary");
  if (!summary) return;

  const total = effectifRows.length;
  const moduleStats = MODULE_COLUMNS.map(column => {
    const count = getModuleCount(column.key);
    return `
      <div class="student-modules-stat done">
        <span>${escapeHtml(column.label)}</span>
        <strong>${count} / ${total}</strong>
      </div>
    `;
  }).join("");

  summary.innerHTML = `
    <div class="student-modules-stat">
      <span>Effectif</span>
      <strong>${total}</strong>
    </div>
    ${moduleStats}
  `;
}

function renderModuleCheck(row, column, progress) {
  const checked = progress.checks?.[column.key] === true;

  return `
    <div class="student-modules-cell">
      <label class="student-module-check ${checked ? "checked" : ""}" data-module-label>
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

function renderStudentModulesTable() {
  const table = document.getElementById("studentModulesTable");
  if (!table) return;

  renderStudentModulesSummary();

  const rows = getFilteredRows();

  if (!effectifRows.length) {
    table.innerHTML = `<div class="student-modules-empty">Aucun eleve trouve dans l'effectif.</div>`;
    return;
  }

  if (!rows.length) {
    table.innerHTML = `<div class="student-modules-empty">Aucun eleve ne correspond a cette recherche.</div>`;
    return;
  }

  const header = `
    <div class="student-modules-row student-modules-head">
      <div>Eleve</div>
      <div>ID Unique</div>
      ${MODULE_COLUMNS.map(column => `<div>${escapeHtml(column.label)}</div>`).join("")}
    </div>
  `;

  const body = rows.map(row => {
    const progress = getProgressForStudent(row.normalizedIdUnique);

    return `
      <div class="student-modules-row" data-student-row="${escapeHtml(row.normalizedIdUnique)}">
        <div class="student-modules-cell student-modules-student">
          <strong title="${escapeHtml(row.studentName)}">${escapeHtml(row.studentName)}</strong>
          <span>${escapeHtml(row.idUnique)}</span>
        </div>

        <div class="student-modules-cell student-modules-id">
          <strong>${escapeHtml(row.idUnique)}</strong>
          <span>ID</span>
        </div>

        ${MODULE_COLUMNS.map(column => renderModuleCheck(row, column, progress)).join("")}
      </div>
    `;
  }).join("");

  table.innerHTML = header + body;
}

function updateCheckVisual(input) {
  const label = input.closest("[data-module-label]");
  if (!label) return;

  label.classList.toggle("checked", input.checked);
  label.querySelector("span").textContent = input.checked ? "Fait" : "Non";
}

async function saveModuleCheck(input) {
  const normalizedIdUnique = input.dataset.studentId || "";
  const moduleKey = input.dataset.moduleKey || "";
  const row = effectifRows.find(item => item.normalizedIdUnique === normalizedIdUnique);

  if (!row || !MODULE_COLUMNS.some(column => column.key === moduleKey)) {
    alert("Eleve ou module introuvable.");
    return;
  }

  const previousProgress = getProgressForStudent(normalizedIdUnique);
  const previousChecked = previousProgress.checks?.[moduleKey] === true;
  const nextChecked = input.checked === true;
  const label = input.closest("[data-module-label]");

  const nextProgress = normalizeProgress({
    ...previousProgress,
    checks: {
      ...previousProgress.checks,
      [moduleKey]: nextChecked
    },
    completedAt: {
      ...(previousProgress.completedAt || {}),
      [moduleKey]: nextChecked ? new Date().toISOString() : null
    }
  });

  studentProgressById.set(normalizedIdUnique, nextProgress);
  updateCheckVisual(input);
  renderStudentModulesSummary();

  try {
    label?.classList.add("is-saving");
    setModulesStatus("Enregistrement...", "info");

    const firebase = await waitForProfFirebase();
    await firebase.setDoc(firebase.doc(firebase.db, STUDENT_MODULES_COLLECTION, normalizedIdUnique), {
      idUnique: row.idUnique,
      normalizedIdUnique: row.normalizedIdUnique,
      studentName: row.studentName,
      checks: nextProgress.checks,
      completedAt: nextProgress.completedAt,
      updatedAt: firebase.serverTimestamp(),
      updatedBy: currentUser?.email || null
    }, { merge: true });

    setModulesStatus("Sauvegarde effectuee.", "ok");
  } catch (error) {
    console.error("Sauvegarde module eleve impossible :", error);

    input.checked = previousChecked;
    studentProgressById.set(normalizedIdUnique, previousProgress);
    updateCheckVisual(input);
    renderStudentModulesSummary();

    setModulesStatus("Sauvegarde impossible.", "error");
    alert(`Sauvegarde impossible : ${error.code || error.message}`);
  } finally {
    label?.classList.remove("is-saving");
  }
}

async function loadAndRenderStudentModules(force = false) {
  ensureStudentModulesModal();

  try {
    showModulesLoader("Chargement de l'effectif...");
    setModulesStatus("", "");

    await loadEffectifRows(force);

    showModulesLoader("Chargement des coches...");
    await loadStudentProgress(force);

    hasLoadedOnce = true;
    renderStudentModulesTable();
    setModulesStatus("Donnees chargees.", "ok");
  } catch (error) {
    console.error("Chargement modules eleves impossible :", error);

    const table = document.getElementById("studentModulesTable");
    if (table) {
      table.innerHTML = `
        <div class="student-modules-error">
          Impossible de charger les modules eleves.<br>
          Verifie que le Google Sheet effectif est public et que les regles Firebase autorisent studentModules.
        </div>
      `;
    }

    setModulesStatus("Chargement impossible.", "error");
  } finally {
    hideModulesLoader();
  }
}

function positionStudentModulesButton() {
  const button = document.getElementById("studentModulesBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  if (!button || !logoutBtn) return;

  const adminBtn = document.getElementById("profAdminBtn");

  if (adminBtn && button.previousElementSibling !== adminBtn) {
    adminBtn.insertAdjacentElement("afterend", button);
    return;
  }

  if (!adminBtn && button.nextElementSibling !== logoutBtn) {
    logoutBtn.insertAdjacentElement("beforebegin", button);
  }
}

function ensureStudentModulesButton() {
  if (!canUseStudentModules()) {
    removeStudentModulesUi();
    return;
  }

  injectStudentModulesStyles();

  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  let button = document.getElementById("studentModulesBtn");

  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.id = "studentModulesBtn";
    button.className = "btn secondary student-modules-btn";
    button.textContent = "Modules Eleves";
    button.addEventListener("click", window.openStudentModulesPanel);
    logoutBtn.insertAdjacentElement("beforebegin", button);
  }

  positionStudentModulesButton();

  if (!positionObserverStarted) {
    positionObserverStarted = true;

    const observer = new MutationObserver(() => {
      if (!canUseStudentModules()) return;
      positionStudentModulesButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }
}

function removeStudentModulesUi() {
  document.getElementById("studentModulesBtn")?.remove();
  document.getElementById("studentModulesModal")?.remove();
  hasLoadedOnce = false;
}

window.openStudentModulesPanel = async function() {
  if (!canUseStudentModules()) {
    alert("Acces reserve aux comptes professeurs.");
    return;
  }

  ensureStudentModulesModal();
  openModal(document.getElementById("studentModulesModal"));

  if (!hasLoadedOnce) {
    await loadAndRenderStudentModules(false);
  } else {
    renderStudentModulesTable();
  }
};

window.closeStudentModulesPanel = function() {
  closeModal(document.getElementById("studentModulesModal"));
};

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  window.closeStudentModulesPanel();
});

async function startStudentModulesLayer() {
  try {
    injectStudentModulesStyles();
    const firebase = await waitForProfFirebase();

    onAuthStateChanged(firebase.auth, async user => {
      currentUser = user || null;

      if (!user) {
        currentAccess = { role: null, admin: false };
        removeStudentModulesUi();
        return;
      }

      currentAccess = await loadUserAccess(user);

      if (!canUseStudentModules()) {
        removeStudentModulesUi();
        return;
      }

      ensureStudentModulesButton();
      setTimeout(ensureStudentModulesButton, 300);
      setTimeout(ensureStudentModulesButton, 1000);
    });
  } catch (error) {
    console.error("Erreur modules eleves :", error);
  }
}

startStudentModulesLayer();
