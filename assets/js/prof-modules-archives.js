import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getProfAccess } from "./prof-identity.js?v=2";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const STUDENT_MODULE_ARCHIVES_COLLECTION = "studentModuleArchives";

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

let archiveItems = [];
let selectedArchiveId = "";
let archiveSearch = "";
let currentUserAllowed = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeIdUnique(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function getDateFromValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(value) {
  const date = getDateFromValue(value);
  if (!date) return "date inconnue";

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatDateTime(value) {
  const date = getDateFromValue(value);
  if (!date) return "date inconnue";

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getArchivePeriod(archive) {
  const startDisplay = archive.cursusStartDisplay || archive.startDisplay || "";
  const endDisplay = archive.cursusEndDisplay || archive.endDisplay || "";

  if (startDisplay && endDisplay) {
    return {
      startDisplay,
      endDisplay,
      label: `Cursus du ${startDisplay} au ${endDisplay}`
    };
  }

  const startDate = getDateFromValue(archive.cursusStartDate || archive.startDate);
  const endDate = getDateFromValue(archive.cursusEndDate || archive.endDate);

  if (startDate && endDate) {
    const start = formatDate(startDate);
    const end = formatDate(endDate);
    return {
      startDisplay: start,
      endDisplay: end,
      label: `Cursus du ${start} au ${end}`
    };
  }

  const archivedAt = getDateFromValue(archive.archivedAt);

  if (archivedAt) {
    const end = formatDate(archivedAt);
    const start = formatDate(addDays(archivedAt, -13));
    return {
      startDisplay: start,
      endDisplay: end,
      label: `Cursus du ${start} au ${end}`
    };
  }

  return {
    startDisplay: "date inconnue",
    endDisplay: "date inconnue",
    label: "Cursus date inconnue"
  };
}

function normalizeArchive(docSnap) {
  const data = docSnap.data() || {};
  const students = Array.isArray(data.students) ? data.students : [];
  const period = getArchivePeriod(data);
  const archivedAtTime = getDateFromValue(data.archivedAt)?.getTime() || 0;

  return {
    firebaseId: docSnap.id,
    ...data,
    students,
    period,
    archivedAtTime
  };
}

async function getUserAccess(user) {
  try {
    return await getProfAccess(user, async () => {
      if (!user?.email) return { role: null, admin: false };
      const snap = await getDoc(doc(db, "users", user.email));
      if (!snap.exists()) return { role: null, admin: false };
      const data = snap.data();
      return { role: data.role || null, admin: data.admin === true };
    });
  } catch (error) {
    console.warn("Acces archives modules indisponible :", error);
    return { role: null, admin: false };
  }
}

function injectArchiveStyles() {
  if (document.getElementById("profModulesArchiveStyles")) return;

  const style = document.createElement("style");
  style.id = "profModulesArchiveStyles";
  style.textContent = `
    .modules-toolbar {
      grid-template-columns: minmax(260px, 1fr) auto auto auto !important;
    }

    .modules-archive-btn {
      border-color: rgba(125,211,252,.34) !important;
      background: rgba(125,211,252,.10) !important;
      color: #bae6fd !important;
    }

    .modules-archive-overlay {
      position: fixed;
      inset: 0;
      z-index: 12500;
      display: grid;
      place-items: stretch;
      padding: 12px;
      background: rgba(0,0,0,.76);
      backdrop-filter: blur(16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s ease;
    }

    .modules-archive-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .modules-archive-overlay[hidden] {
      display: none !important;
    }

    .modules-archive-card {
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 10px;
      background:
        radial-gradient(circle at 12% 0%, rgba(214,180,106,.13), transparent 30%),
        rgba(10,10,10,.98);
      box-shadow: 0 30px 120px rgba(0,0,0,.72);
      overflow: hidden;
    }

    .modules-archive-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 16px 18px;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }

    .modules-archive-head p,
    .modules-archive-head h2 {
      margin: 0;
    }

    .modules-archive-head h2 {
      font-size: clamp(30px, 4vw, 54px);
      line-height: .92;
      letter-spacing: -.04em;
    }

    .modules-archive-close {
      width: 42px;
      height: 42px;
      border: 1px solid rgba(248,113,113,.30);
      border-radius: 10px;
      background: rgba(248,113,113,.12);
      color: #fca5a5;
      font-size: 24px;
      font-weight: 1000;
      cursor: pointer;
    }

    .modules-archive-layout {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
      overflow: hidden;
    }

    .modules-archive-sidebar {
      min-height: 0;
      overflow: auto;
      padding: 12px;
      border-right: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.025);
    }

    .modules-archive-list {
      display: grid;
      gap: 10px;
    }

    .modules-archive-item {
      width: 100%;
      padding: 13px;
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 9px;
      background: rgba(255,255,255,.045);
      color: var(--text);
      font-family: inherit;
      text-align: left;
      cursor: pointer;
    }

    .modules-archive-item.active {
      border-color: rgba(214,180,106,.42);
      background: rgba(214,180,106,.13);
      box-shadow: 0 0 28px rgba(214,180,106,.10);
    }

    .modules-archive-item span,
    .modules-archive-item strong,
    .modules-archive-item em {
      display: block;
    }

    .modules-archive-item span {
      color: var(--gold2);
      font-size: 12px;
      font-weight: 1000;
      line-height: 1.35;
    }

    .modules-archive-item strong {
      margin-top: 7px;
      color: var(--text);
      font-size: 13px;
      font-weight: 1000;
    }

    .modules-archive-item em {
      margin-top: 5px;
      color: var(--muted);
      font-size: 11px;
      font-style: normal;
      font-weight: 850;
      line-height: 1.35;
    }

    .modules-archive-main {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
      overflow: hidden;
    }

    .modules-archive-title {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding: 12px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 9px;
      background: rgba(255,255,255,.035);
    }

    .modules-archive-title h3 {
      margin: 0;
      color: var(--text);
      font-size: 22px;
      letter-spacing: -.02em;
    }

    .modules-archive-title p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
    }

    .modules-archive-search {
      height: 42px;
      border: 1px solid rgba(255,255,255,.11);
      border-radius: 8px;
      background: rgba(0,0,0,.30);
      color: var(--text);
      padding: 0 14px;
      font: inherit;
      font-size: 14px;
      font-weight: 900;
      outline: none;
    }

    .modules-archive-table-wrap {
      min-height: 0;
      overflow: auto;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 8px;
      background: rgba(0,0,0,.24);
    }

    .modules-archive-table .module-check {
      pointer-events: none;
      cursor: default;
    }

    .modules-archive-table .module-check.readonly:not(.checked) {
      opacity: .82;
    }

    .module-date-readonly {
      display: grid;
      place-items: center start;
    }

    .modules-archive-empty {
      padding: 18px;
      border: 1px solid rgba(214,180,106,.18);
      border-radius: 8px;
      background: rgba(214,180,106,.08);
      color: var(--gold2);
      font-weight: 1000;
      text-align: center;
      line-height: 1.45;
    }

    @media (max-width: 1000px) {
      .modules-toolbar {
        grid-template-columns: 1fr !important;
      }

      .modules-archive-layout {
        grid-template-columns: 1fr;
      }

      .modules-archive-sidebar {
        max-height: 220px;
        border-right: 0;
        border-bottom: 1px solid rgba(255,255,255,.08);
      }
    }
  `;

  document.head.appendChild(style);
}

function ensureArchiveUi() {
  if (!currentUserAllowed) return;

  injectArchiveStyles();

  const reloadButton = document.getElementById("reloadModulesBtn");

  if (reloadButton && !document.getElementById("openModuleArchivesBtn")) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = "openModuleArchivesBtn";
    button.className = "modules-reload-btn modules-archive-btn";
    button.textContent = "Archives cursus";
    button.addEventListener("click", openArchivesModal);
    reloadButton.insertAdjacentElement("afterend", button);
  }

  if (document.getElementById("modulesArchiveModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="modulesArchiveModal" class="modules-archive-overlay" hidden>
      <div class="modules-archive-card">
        <div class="modules-archive-head">
          <div>
            <p class="kicker">Archives cursus</p>
            <h2>Modules archivés</h2>
          </div>
          <button type="button" id="closeModuleArchivesBtn" class="modules-archive-close">×</button>
        </div>

        <div class="modules-archive-layout">
          <aside class="modules-archive-sidebar">
            <div id="modulesArchiveList" class="modules-archive-list">
              <div class="modules-archive-empty">Aucune archive chargée.</div>
            </div>
          </aside>

          <section class="modules-archive-main">
            <div id="modulesArchiveTitle" class="modules-archive-title">
              <div>
                <h3>Choisissez une archive</h3>
                <p>Les anciens cursus s'afficheront ici en lecture seule.</p>
              </div>
            </div>

            <input id="modulesArchiveSearch" class="modules-archive-search" type="text" autocomplete="off" placeholder="Rechercher nom ou ID Unique dans l'archive...">

            <div class="modules-archive-table-wrap">
              <div id="modulesArchiveTable" class="modules-table modules-archive-table"></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  `);

  document.getElementById("closeModuleArchivesBtn")?.addEventListener("click", closeArchivesModal);
  document.getElementById("modulesArchiveModal")?.addEventListener("click", event => {
    if (event.target?.id === "modulesArchiveModal") closeArchivesModal();
  });
  document.getElementById("modulesArchiveSearch")?.addEventListener("input", event => {
    archiveSearch = event.target.value || "";
    renderArchiveDetail(getSelectedArchive());
  });
}

function openModal(modal) {
  if (!modal) return;

  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("active"));
}

function closeModal(modal) {
  if (!modal) return;

  modal.classList.remove("active");
  window.setTimeout(() => {
    modal.hidden = true;
  }, 180);
}

async function openArchivesModal() {
  ensureArchiveUi();
  openModal(document.getElementById("modulesArchiveModal"));
  await loadAndRenderArchives();
}

function closeArchivesModal() {
  closeModal(document.getElementById("modulesArchiveModal"));
}

async function loadAndRenderArchives() {
  const list = document.getElementById("modulesArchiveList");
  const table = document.getElementById("modulesArchiveTable");

  if (list) list.innerHTML = `<div class="modules-archive-empty">Chargement des archives...</div>`;
  if (table) table.innerHTML = "";

  try {
    const snap = await getDocs(collection(db, STUDENT_MODULE_ARCHIVES_COLLECTION));
    archiveItems = [];

    snap.forEach(docSnap => {
      archiveItems.push(normalizeArchive(docSnap));
    });

    archiveItems.sort((a, b) => b.archivedAtTime - a.archivedAtTime);

    if (!selectedArchiveId || !archiveItems.some(item => item.firebaseId === selectedArchiveId)) {
      selectedArchiveId = archiveItems[0]?.firebaseId || "";
    }

    renderArchiveList();
    renderArchiveDetail(getSelectedArchive());
  } catch (error) {
    console.error("Archives modules indisponibles :", error);

    if (list) {
      list.innerHTML = `
        <div class="modules-archive-empty">
          Impossible de charger les archives pour le moment.
        </div>
      `;
    }
  }
}

function getSelectedArchive() {
  return archiveItems.find(item => item.firebaseId === selectedArchiveId) || null;
}

function renderArchiveList() {
  const list = document.getElementById("modulesArchiveList");
  if (!list) return;

  if (!archiveItems.length) {
    list.innerHTML = `
      <div class="modules-archive-empty">
        Aucune archive modules pour le moment.
      </div>
    `;
    return;
  }

  list.innerHTML = archiveItems.map(archive => {
    const total = archive.summary?.totalStudents ?? archive.students.length;
    const active = archive.firebaseId === selectedArchiveId ? "active" : "";

    return `
      <button type="button" class="modules-archive-item ${active}" data-archive-id="${escapeHtml(archive.firebaseId)}">
        <span>${escapeHtml(archive.period.label)}</span>
        <strong>${escapeHtml(total)} élève(s)</strong>
        <em>Archivé le ${escapeHtml(formatDateTime(archive.archivedAt))}</em>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-archive-id]").forEach(button => {
    button.addEventListener("click", () => {
      selectedArchiveId = button.dataset.archiveId || "";
      archiveSearch = "";

      const input = document.getElementById("modulesArchiveSearch");
      if (input) input.value = "";

      renderArchiveList();
      renderArchiveDetail(getSelectedArchive());
    });
  });
}

function getFilteredArchiveStudents(archive) {
  const students = Array.isArray(archive?.students) ? archive.students : [];
  const search = normalizeSearchText(archiveSearch);
  const searchId = normalizeIdUnique(archiveSearch);

  if (!search && !searchId) return students;

  return students.filter(student => {
    const name = normalizeSearchText(student.studentName || "");
    const id = normalizeIdUnique(student.idUnique || student.normalizedIdUnique || "");
    return name.includes(search) || id.includes(searchId);
  });
}

function renderArchiveSummary(archive) {
  const total = archive.summary?.totalStudents ?? archive.students.length;
  const stats = MODULE_COLUMNS.map(column => {
    const count = archive.summary?.[column.key] ?? archive.students.filter(student => student.checks?.[column.key] === true).length;

    return `
      <div class="modules-stat done">
        <span>${escapeHtml(column.label)}</span>
        <strong>${escapeHtml(count)} / ${escapeHtml(total)}</strong>
      </div>
    `;
  }).join("");

  return `
    <div class="modules-summary">
      <div class="modules-stat">
        <span>Effectif</span>
        <strong>${escapeHtml(total)}</strong>
      </div>
      ${stats}
    </div>
  `;
}

function renderArchiveCheck(student, column) {
  const checked = student.checks?.[column.key] === true;

  return `
    <div class="modules-cell">
      <span class="module-check readonly ${checked ? "checked" : ""}">
        <span>${checked ? "Fait" : "Non"}</span>
      </span>
    </div>
  `;
}

function renderArchiveDate(student, column) {
  const value = student.dates?.[column.key] || "";

  return `
    <div class="modules-cell">
      <div class="module-date module-date-readonly">${escapeHtml(value ? formatDate(value) : "-")}</div>
    </div>
  `;
}

function renderArchiveTable(archive) {
  const table = document.getElementById("modulesArchiveTable");
  if (!table) return;

  if (!archive) {
    table.innerHTML = `<div class="modules-archive-empty">Choisissez une archive dans la liste.</div>`;
    return;
  }

  const rows = getFilteredArchiveStudents(archive);

  if (!rows.length) {
    table.innerHTML = `<div class="modules-archive-empty">Aucun élève ne correspond à cette recherche.</div>`;
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

  const body = rows.map(student => `
    <div class="modules-row">
      <div class="modules-cell modules-student">
        <strong title="${escapeHtml(student.studentName || "Nom non renseigné")}">${escapeHtml(student.studentName || "Nom non renseigné")}</strong>
        <span>ID Unique : ${escapeHtml(student.idUnique || student.normalizedIdUnique || "-")}</span>
      </div>

      ${MODULE_COLUMNS.map(column => (
        renderArchiveCheck(student, column) + renderArchiveDate(student, column)
      )).join("")}
    </div>
  `).join("");

  table.innerHTML = header + body;
}

function renderArchiveDetail(archive) {
  const title = document.getElementById("modulesArchiveTitle");

  if (!archive) {
    if (title) {
      title.innerHTML = `
        <div>
          <h3>Aucune archive</h3>
          <p>Les archives apparaîtront ici après un changement d'effectif.</p>
        </div>
      `;
    }

    renderArchiveTable(null);
    return;
  }

  if (title) {
    title.innerHTML = `
      <div>
        <h3>${escapeHtml(archive.period.label)}</h3>
        <p>Lecture seule · Archivé le ${escapeHtml(formatDateTime(archive.archivedAt))} par ${escapeHtml(archive.archivedBy || "admin")}</p>
      </div>
    `;
  }

  const table = document.getElementById("modulesArchiveTable");
  if (table) {
    table.innerHTML = renderArchiveSummary(archive);
  }

  renderArchiveTable(archive);
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeArchivesModal();
});

onAuthStateChanged(auth, async user => {
  const access = await getUserAccess(user);
  currentUserAllowed = access.role === "prof" || access.admin === true;

  if (currentUserAllowed) {
    ensureArchiveUi();
    window.setTimeout(ensureArchiveUi, 400);
    window.setTimeout(ensureArchiveUi, 1200);
  }
});
