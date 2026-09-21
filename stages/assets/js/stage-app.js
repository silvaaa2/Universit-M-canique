import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { normalizeArchiveDateInput, buildArchivePeriod } from "./archive-period.mjs?v=1";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  runTransaction,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const unifiedAccess = await (window.__UNIVERSITY_ACCESS_PROMISE__ || Promise.resolve({ authenticated: false }));
const COMPANY_SCOPE_ID = unifiedAccess?.role === "company" ? String(unifiedAccess.companyId || "") : "";
const COMPANY_SCOPE_NAME = unifiedAccess?.role === "company" ? String(unifiedAccess.companyName || "") : "";
const IS_COMPANY_ACCESS = Boolean(COMPANY_SCOPE_ID);
const IS_ADMIN_COMPANY_PREVIEW = IS_COMPANY_ACCESS && unifiedAccess?.adminPreview === true;

const STAGE_COLLECTION = "stageValidations";
const EXAM_COLLECTION = "examAnswerStatuses";
const STAGE_ARCHIVE_COLLECTION = "stageArchives";
const COMPANY_WARNING_META = {
  warning1: { label: "Averto 1", tone: "warning-1" },
  warning2: { label: "Averto 2", tone: "warning-2" },
  warning3: { label: "Averto 3", tone: "warning-3" },
  refused: { label: "Refusé", tone: "refused" }
};

const DEFAULT_EFFECTIF_SPREADSHEET_ID = "1DRZwLrNXK_kkxpSsaPn_m7XDJ5v0_5iGq-8FoWTQRYU";
const DEFAULT_EFFECTIF_GID = "460642936"; // Feuille Mécanique

const EFFECTIF_LINK_STORAGE_KEY = "stage_effectif_google_sheet_link";
const EFFECTIF_ID_STORAGE_KEY = "stage_effectif_spreadsheet_id";
const EFFECTIF_GID_STORAGE_KEY = "stage_effectif_gid";

let effectifSpreadsheetId =
  localStorage.getItem(EFFECTIF_ID_STORAGE_KEY) ||
  DEFAULT_EFFECTIF_SPREADSHEET_ID;

let effectifGid =
  localStorage.getItem(EFFECTIF_GID_STORAGE_KEY) ||
  DEFAULT_EFFECTIF_GID;

const ALL_COMPANIES = [
  { id: "bennys", name: "Benny's", mark: "B", accent: "#5b8cff" },
  { id: "lsc", name: "LSC", mark: "LS", accent: "#f0b14a" },
  {
    id: "paleto",
    name: "Paleto Garage",
    mark: "PG",
    accent: "#e4494f",
    logo: "/Images/companies/paleto-garage.webp"
  },
  {
    id: "harmony",
    name: "Harmony Repair",
    mark: "HR",
    accent: "#e6c45d",
    logo: "/Images/companies/harmony-repair.webp"
  },
  { id: "cayo", name: "Cayo Garage", mark: "CG", accent: "#4fd1a1" },
  { id: "portolina", name: "Portolina Mechanic", mark: "PM", accent: "#cf7cff" },
  { id: "favelas", name: "Favelas Repair", mark: "FR", accent: "#ff7a59" }
];
const COMPANIES = IS_COMPANY_ACCESS
  ? ALL_COMPANIES.filter(company => company.id === COMPANY_SCOPE_ID)
  : ALL_COMPANIES;

const loginSection = document.getElementById("loginSection");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = loginBtn.querySelector(".btn-text");

const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");

const companyGrid = document.getElementById("companyGrid");
const examList = document.getElementById("examList");
const dashboardTitle = dashboard?.querySelector(".dashboard-top h1");
const dashboardIntro = dashboard?.querySelector(".dashboard-top .intro");

let stageValidations = [];
let stageDirectory = [];
let examParticipants = [];
let effectifRows = [];
let stageArchives = [];
let companyWarningByStudentId = new Map();
const companyStudentProgressCache = new Map();
const COMPANY_STUDENT_PROGRESS_CACHE_MS = 10000;
let companyStudentProgressScrollLocked = false;

let currentUserRole = null;
let currentUserAdmin = false;
let currentStageSearch = "";
let currentEffectifSearch = "";
let currentRightPanel = "examens";
let currentCompanyFilter = "all";
let currentArchive = null;
let currentArchiveSearch = "";
let companyWorkspaceReady = false;
let unifiedLogoutInProgress = false;
let companyDataSignature = "";
let companyRefreshTimer = 0;
let companyRefreshRunning = false;
const COMPANY_REFRESH_MS = 15_000;

function getScopedCompany() {
  return ALL_COMPANIES.find(company => company.id === COMPANY_SCOPE_ID) || ALL_COMPANIES[0];
}

function renderCompanyLogo(company = getScopedCompany()) {
  const mark = escapeHtml(company?.mark || "UM");
  const accent = escapeHtml(company?.accent || "#d6b46a");
  const logo = escapeHtml(company?.logo || "");

  if (logo) {
    return `
      <span class="company-brand-logo has-image" style="--company-accent:${accent}" aria-hidden="true">
        <strong>${mark}</strong>
        <img src="${logo}" alt="" decoding="async" onerror="this.remove()">
      </span>`;
  }

  return `
    <span class="company-brand-logo" style="--company-accent:${accent}" aria-hidden="true">
      <svg viewBox="0 0 72 72" role="img">
        <path d="M36 3 61 17v38L36 69 11 55V17L36 3Z"/>
        <path d="M36 12 53 22v28L36 60 19 50V22L36 12Z"/>
      </svg>
      <strong>${mark}</strong>
    </span>`;
}

function buildCompanyDataSignature() {
  return JSON.stringify({
    stages: stageValidations.map(item => [item.firebaseId, item.idUnique]).sort(),
    exams: examParticipants.map(item => [item.firebaseId, item.status, item.totalScore]).sort(),
    archives: stageArchives.map(item => [item.firebaseId, item.stageValidations?.length || 0]).sort()
  });
}

function animateCompanyDataUpdate() {
  document.querySelectorAll(".company-overview article, .company-cursus-chart, .stage-companies-card, .stage-exams-card").forEach(element => {
    element.classList.remove("company-data-arrived");
    void element.offsetWidth;
    element.classList.add("company-data-arrived");
  });
}

function ensureCompanyWorkspaceChrome() {
  if (!IS_COMPANY_ACCESS || companyWorkspaceReady) return;

  companyWorkspaceReady = true;
  document.body.classList.add("company-workspace");
  document.body.classList.toggle("admin-company-preview", IS_ADMIN_COMPANY_PREVIEW);

  if (IS_ADMIN_COMPANY_PREVIEW) {
    const header = document.querySelector(".stage-header");
    if (header && !document.getElementById("adminCompanyPreviewBanner")) {
      header.insertAdjacentHTML("afterend", `
        <aside id="adminCompanyPreviewBanner" class="admin-company-preview-banner">
          <div>
            <strong>Aperçu administrateur</strong>
            <span>Interface de ${escapeHtml(COMPANY_SCOPE_NAME || "l’entreprise")} · lecture seule</span>
          </div>
          <button type="button" onclick="window.exitAdminCompanyPreview()">Retour à l’espace admin</button>
        </aside>
      `);
    }
    logoutBtn.textContent = "Quitter l’aperçu";
  }

  const brandSubtitle = document.querySelector(".stage-header .brand span");
  if (brandSubtitle) brandSubtitle.textContent = COMPANY_SCOPE_NAME || "Espace entreprise";
  const headerLogo = document.querySelector(".stage-header .brand-logo");
  if (headerLogo) headerLogo.innerHTML = renderCompanyLogo();

  if (dashboardTitle?.closest(".dashboard-top")) {
    dashboardTitle.closest(".dashboard-top").innerHTML = `
      <div class="company-hero">
        <div class="company-hero-copy">
          <div class="company-access-badge"><span></span> ${IS_ADMIN_COMPANY_PREVIEW ? "Aperçu admin" : "Espace entreprise"}</div>
          <div class="company-brand-lockup">
            ${renderCompanyLogo()}
            <div><p class="kicker">Mécanique · Université</p><h1>Bienvenue, <span>${escapeHtml(COMPANY_SCOPE_NAME || "Entreprise")}</span>.</h1></div>
          </div>
          <p class="intro">${IS_ADMIN_COMPANY_PREVIEW ? "Visualisation de l’espace entreprise sans modification possible." : "Suivez vos stagiaires et consultez les résultats du cursus."}</p>
        </div>

        <nav class="company-workspace-tabs" aria-label="Sections de l’espace entreprise">
          <button type="button" class="active" data-company-workspace-panel="stages" aria-pressed="true">Mes stagiaires</button>
          <button type="button" data-company-workspace-panel="examens" aria-pressed="false">Examens</button>
          <button type="button" data-company-workspace-panel="effectif" aria-pressed="false">Effectif</button>
        </nav>

        <div class="company-overview" aria-label="Résumé de l’entreprise">
          <article>
            <span>Mes stagiaires</span>
            <strong data-company-stat="stages">0</strong>
            <small>dans le cursus actuel</small>
          </article>
          <article>
            <span>Examens corrigés</span>
            <strong data-company-stat="exams">0</strong>
            <small data-company-stat-detail="exams">sur 0 reçus</small>
          </article>
          <article>
            <span>Effectif total</span>
            <strong data-company-stat="effectif">0</strong>
            <small>élèves inscrits</small>
          </article>
        </div>
        <section id="companyCursusChart" class="company-cursus-chart" aria-label="Historique des stages par cursus"></section>
      </div>
    `;
  }

  const companyCard = document.querySelector(".stage-companies-card .card-head > div");
  if (companyCard) {
    companyCard.innerHTML = `
      <p class="kicker">Stage</p>
      <h2>Mes stagiaires</h2>
      <p>${IS_ADMIN_COMPANY_PREVIEW ? "Liste affichée comme pour l’entreprise, en lecture seule." : "Ajoutez ou retirez les ID Unique rattachés à votre entreprise."}</p>
    `;
  }

  const examCard = document.querySelector(".stage-exams-card .card-head > div");
  if (examCard) {
    examCard.innerHTML = `
      <p class="kicker">Cursus</p>
      <h2>Suivi des élèves</h2>
      <p>Consultez les notes d’examen et l’effectif complet.</p>
    `;
  }

  document.querySelectorAll("[data-company-workspace-panel]").forEach(button => {
    button.addEventListener("click", () => {
      window.openCompanyWorkspaceSection(button.dataset.companyWorkspacePanel || "stages");
    });
  });
}

function updateCompanyWorkspaceNavigation(panel) {
  if (!IS_COMPANY_ACCESS) return;

  document.querySelectorAll("[data-company-workspace-panel]").forEach(button => {
    const active = button.dataset.companyWorkspacePanel === panel;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function updateCompanyWorkspaceStats() {
  if (!IS_COMPANY_ACCESS) return;

  const completedExams = examParticipants.filter(participant => participant.status !== "pending").length;
  const values = {
    stages: stageValidations.length,
    exams: completedExams,
    effectif: effectifRows.length
  };

  Object.entries(values).forEach(([key, value]) => {
    const target = document.querySelector(`[data-company-stat="${key}"]`);
    if (target) target.textContent = String(value);
  });

  const examDetail = document.querySelector('[data-company-stat-detail="exams"]');
  if (examDetail) examDetail.textContent = `sur ${examParticipants.length} reçu(s)`;
  renderCompanyCursusChart();
}

function renderCompanyCursusChart() {
  if (!IS_COMPANY_ACCESS) return;
  const container = document.getElementById("companyCursusChart");
  if (!container) return;

  const archivedPoints = [...stageArchives]
    .sort((left, right) => String(left.startDate || "").localeCompare(String(right.startDate || "")))
    .map((archive, index) => ({
      label: archive.startDisplay || archive.startDate || `Cursus ${index + 1}`,
      value: Array.isArray(archive.stageValidations) ? archive.stageValidations.length : 0
    }));
  const points = [...archivedPoints, { label: "Actuel", value: stageValidations.length }].slice(-8);
  const max = Math.max(1, ...points.map(point => point.value));
  const width = 760;
  const height = 150;
  const left = 28;
  const right = 18;
  const top = 24;
  const bottom = 32;
  const usableWidth = width - left - right;
  const usableHeight = height - top - bottom;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? width / 2 : left + (index * usableWidth / (points.length - 1)),
    y: top + usableHeight - (point.value / max * usableHeight)
  }));
  const line = coordinates.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = coordinates.length
    ? `${left},${height - bottom} ${line} ${coordinates.at(-1).x.toFixed(1)},${height - bottom}`
    : "";

  container.innerHTML = `
    <div class="company-chart-head"><div><span>Historique</span><h2>Stages par cursus</h2></div><strong>${points.length} cursus</strong></div>
    <div class="company-chart-scroll">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Nombre de stages pour chacun des derniers cursus">
        <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" class="company-chart-axis"/>
        ${area ? `<polygon points="${area}" class="company-chart-area"/>` : ""}
        ${coordinates.length > 1 ? `<polyline points="${line}" class="company-chart-line"/>` : ""}
        ${coordinates.map(point => `
          <g class="company-chart-point">
            <circle cx="${point.x}" cy="${point.y}" r="6"/>
            <text x="${point.x}" y="${Math.max(14, point.y - 12)}" text-anchor="middle" class="company-chart-value">${point.value}</text>
            <text x="${point.x}" y="${height - 10}" text-anchor="middle" class="company-chart-label">${escapeHtml(point.label)}</text>
          </g>`).join("")}
      </svg>
    </div>`;
}

window.openCompanyWorkspaceSection = function(panel) {
  if (!IS_COMPANY_ACCESS) return;

  if (panel === "stages") {
    updateCompanyWorkspaceNavigation("stages");
    document.querySelector(".stage-companies-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  window.switchRightPanel(panel === "effectif" ? "effectif" : "examens");
  document.querySelector(".stage-exams-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

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

function escapeJsString(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll('"', "&quot;")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}

function parseBulkIds(value) {
  return String(value || "")
    .split(/[\n,;|\t ]+/g)
    .map(item => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => {
      const normalized = normalizeIdUnique(item);
      return normalized && array.findIndex(other => normalizeIdUnique(other) === normalized) === index;
    });
}

function setLoginLoading(isLoading) {
  loginBtn.disabled = isLoading;
  loginBtn.classList.toggle("loading", isLoading);
  loginBtnText.textContent = isLoading ? "Connexion..." : "Connexion";
}

function hideStageSurfaceForExit() {
  loginSection.hidden = true;
  dashboard.hidden = true;
  refreshBtn.hidden = true;
  logoutBtn.hidden = true;
}

async function returnToUnifiedPortal() {
  if (!unifiedAccess?.authenticated) return false;
  if (unifiedLogoutInProgress) return true;

  unifiedLogoutInProgress = true;
  try {
    if (typeof window.UniversityMotion?.showExit === "function") {
      await window.UniversityMotion.showExit({
        title: IS_ADMIN_COMPANY_PREVIEW ? "Retour administrateur" : "À bientôt",
        detail: IS_ADMIN_COMPANY_PREVIEW ? "Fermeture de l’aperçu entreprise…" : "Fermeture de votre espace stage…"
      });
    }
  } catch (error) {
    console.warn("Transition de déconnexion ignorée :", error);
  }
  hideStageSurfaceForExit();

  try {
    await fetch(IS_ADMIN_COMPANY_PREVIEW
      ? "/api/access/session?admin=company-preview"
      : "/api/access/session", {
      method: "DELETE",
      credentials: "same-origin"
    });
  } catch (error) {
    console.warn("Session locale déjà fermée :", error);
  }

  if (!IS_ADMIN_COMPANY_PREVIEW) {
    try {
      if (auth.currentUser) await signOut(auth);
    } catch (error) {
      console.warn("Session Firebase déjà fermée :", error);
    }
  }

  window.location.replace(IS_ADMIN_COMPANY_PREVIEW ? "/pages/espace-prof.html" : "/");
  return true;
}

window.exitAdminCompanyPreview = returnToUnifiedPortal;

function showLogin() {
  hideStageSurfaceForExit();
  window.location.replace("/");
}

function showDashboard() {
  loginSection.hidden = true;
  dashboard.hidden = false;
  refreshBtn.hidden = false;
  logoutBtn.hidden = false;
  ensureCompanyWorkspaceChrome();

  ensureEffectifLinkModal();
}

async function getUserRole(user) {
  currentUserAdmin = false;
  if (!user) return null;

  try {
    const token = await user.getIdTokenResult();
    const claims = token?.claims || {};
    if (claims.authProvider === "company" && claims.role === "company") {
      const claimCompanyId = String(claims.companyId || "");
      if (!IS_COMPANY_ACCESS || claimCompanyId !== COMPANY_SCOPE_ID) return null;
      return "company";
    }
    if (claims.authProvider === "discord" && claims.role === "prof") {
      currentUserAdmin = claims.admin === true;
      return "prof";
    }
  } catch (error) {
    console.error("Lecture des autorisations signées impossible :", error);
    return null;
  }

  if (!user.email) return null;

  try {
    const userRef = doc(db, "users", user.email);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return null;

    if (auth.currentUser?.uid !== user.uid) return null;
    currentUserAdmin = userSnap.data().admin === true;
    return userSnap.data().role || null;
  } catch (error) {
    console.error("Erreur lecture rôle utilisateur :", error);
    return null;
  }
}

function isAllowedStageRole(role) {
  return role === "prof" || role === "stage" || role === "company";
}

async function refuseAccess(user) {
  console.warn("Accès refusé site stage :", user?.email || "email inconnu");

  currentUserRole = null;

  try {
    await signOut(auth);
  } catch (error) {
    console.error("Erreur déconnexion après refus :", error);
  }

  loginError.textContent = "Accès refusé. Ce compte n’est pas autorisé sur le suivi de stage.";
  showLogin();
}

function buildStageDocId(companyId, normalizedIdUnique) {
  return `${companyId}__${normalizedIdUnique}`;
}

async function fetchCompanyRows(kind, options = {}) {
  const response = await fetch(`/api/access/stage-data?kind=${encodeURIComponent(kind)}${options.documentId ? `&id=${encodeURIComponent(options.documentId)}` : ""}`, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    credentials: "same-origin",
    cache: "no-store",
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Données entreprise indisponibles.");
  return payload;
}

async function loadStageValidations() {
  stageValidations = [];
  stageDirectory = [];
  companyWarningByStudentId = new Map();

  if (IS_COMPANY_ACCESS) {
    const payload = await fetchCompanyRows("stages");
    stageValidations = (payload.rows || []).map(row => ({
      firebaseId: row.id,
      ...row
    }));
    stageDirectory = (payload.directory || []).map(row => ({
      idUnique: String(row.idUnique || ""),
      normalizedIdUnique: normalizeIdUnique(row.normalizedIdUnique || row.idUnique),
      companyId: String(row.companyId || ""),
      companyName: String(row.companyName || "")
    }));
    companyWarningByStudentId = new Map((payload.warnings || []).map(warning => [
      normalizeIdUnique(warning.studentId),
      {
        level: String(warning.level || "none"),
        studentName: String(warning.studentName || "").trim(),
        comment: String(warning.comment || "").trim()
      }
    ]).filter(([studentId, warning]) => studentId && COMPANY_WARNING_META[warning.level]));
    return;
  }

  const snap = await getDocs(collection(db, STAGE_COLLECTION));

  snap.forEach(docSnap => {
    const data = docSnap.data();
    stageValidations.push({
      firebaseId: docSnap.id,
      ...data
    });
  });
  stageDirectory = stageValidations;
}

function getExamParticipantFirebaseIds(participant) {
  return [...new Set([
    participant?.firebaseId,
    ...(Array.isArray(participant?.firebaseIds) ? participant.firebaseIds : [])
  ].filter(Boolean))];
}

function getExamParticipantScoreFieldCount(participant) {
  if (Number.isFinite(Number(participant?.scoreFieldCount))) {
    return Number(participant.scoreFieldCount);
  }

  return participant?.fieldScores && typeof participant.fieldScores === "object"
    ? Object.keys(participant.fieldScores).length
    : 0;
}

function getExamParticipantUpdatedAt(participant) {
  const value = participant?.updatedAt;

  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000;
  if (Number.isFinite(Number(participant?.updatedAtMs))) return Number(participant.updatedAtMs);

  return 0;
}

function isAutomaticOnePointResult(participant) {
  return Number(participant?.totalScore || 0) === 1 &&
    Number(participant?.maxScore || 50) === 50 &&
    getExamParticipantScoreFieldCount(participant) <= 1;
}

function shouldPreferExamParticipant(candidate, current) {
  const candidatePriority = [
    isAutomaticOnePointResult(candidate) ? 0 : 1,
    getExamParticipantScoreFieldCount(candidate),
    getExamParticipantUpdatedAt(candidate),
    Number(candidate?.totalScore || 0)
  ];

  const currentPriority = [
    isAutomaticOnePointResult(current) ? 0 : 1,
    getExamParticipantScoreFieldCount(current),
    getExamParticipantUpdatedAt(current),
    Number(current?.totalScore || 0)
  ];

  for (let index = 0; index < candidatePriority.length; index += 1) {
    if (candidatePriority[index] === currentPriority[index]) continue;
    return candidatePriority[index] > currentPriority[index];
  }

  return false;
}

function dedupeExamParticipants(participants) {
  const participantsById = new Map();

  (participants || []).forEach(participant => {
    const normalizedId = participant.normalizedIdUnique || normalizeIdUnique(participant.idUnique || "");
    if (!normalizedId) return;

    const normalizedParticipant = {
      ...participant,
      normalizedIdUnique: normalizedId,
      firebaseIds: getExamParticipantFirebaseIds(participant)
    };

    const current = participantsById.get(normalizedId);

    if (!current) {
      participantsById.set(normalizedId, normalizedParticipant);
      return;
    }

    const preferred = shouldPreferExamParticipant(normalizedParticipant, current)
      ? normalizedParticipant
      : current;

    participantsById.set(normalizedId, {
      ...preferred,
      firebaseIds: [...new Set([
        ...getExamParticipantFirebaseIds(current),
        ...getExamParticipantFirebaseIds(normalizedParticipant)
      ])]
    });
  });

  return [...participantsById.values()];
}

function getAllExamParticipantFirebaseIds(participants) {
  return [...new Set((participants || []).flatMap(getExamParticipantFirebaseIds))];
}

async function loadExamParticipants() {
  const loadedParticipants = [];

  if (IS_COMPANY_ACCESS) {
    const payload = await fetchCompanyRows("exams");
    (payload.rows || []).forEach(data => {
      const normalizedId = data.normalizedIdUnique || normalizeIdUnique(data.idUnique || "");
      if (!normalizedId || data.archived === true) return;
      loadedParticipants.push({
        firebaseId: data.id,
        idUnique: data.idUnique || normalizedId,
        normalizedIdUnique: normalizedId,
        studentName: data.studentName || "Nom non renseigné",
        totalScore: Number(data.totalScore || 0),
        maxScore: Number(data.maxScore || 50),
        status: data.status || "pending",
        scoreFieldCount: data.fieldScores && typeof data.fieldScores === "object"
          ? Object.keys(data.fieldScores).length
          : 0,
        updatedAt: data.updatedAt || data.updatedAtIso || null
      });
    });
  } else {
    const snap = await getDocs(collection(db, EXAM_COLLECTION));

    snap.forEach(docSnap => {
      const data = docSnap.data();

      if (data.archived === true) return;

      const normalizedId =
        data.normalizedIdUnique ||
        normalizeIdUnique(data.idUnique || "");

      if (!normalizedId) return;

      loadedParticipants.push({
        firebaseId: docSnap.id,
        idUnique: data.idUnique || normalizedId,
        normalizedIdUnique: normalizedId,
        studentName: data.studentName || "Nom non renseigné",
        totalScore: Number(data.totalScore || 0),
        maxScore: Number(data.maxScore || 50),
        status: data.status || "pending",
        scoreFieldCount: data.fieldScores && typeof data.fieldScores === "object"
          ? Object.keys(data.fieldScores).length
          : 0,
        updatedAt: data.updatedAt || null
      });
    });
  }

  examParticipants = dedupeExamParticipants(loadedParticipants);

  examParticipants.sort((a, b) => {
    return String(a.studentName).localeCompare(String(b.studentName), "fr");
  });
}

function getStagesByCompany(companyId) {
  return stageValidations
    .filter(item => item.companyId === companyId)
    .sort((a, b) => String(a.idUnique).localeCompare(String(b.idUnique), "fr"));
}

function hasStageForId(normalizedIdUnique) {
  return stageDirectory.some(item => item.normalizedIdUnique === normalizedIdUnique);
}

function getStageCompanyForId(normalizedIdUnique) {
  const found = stageDirectory.find(item => item.normalizedIdUnique === normalizedIdUnique);
  return found?.companyName || "";
}

function getStageCompanyIdForId(normalizedIdUnique) {
  const found = stageDirectory.find(item => item.normalizedIdUnique === normalizedIdUnique);
  return found?.companyId || "";
}

function getStatusLabel(status) {
  switch (status) {
    case "approved":
      return "Approuvé";
    case "rejected":
      return "Refusé";
    default:
      return "En attente";
  }
}

function getExamStatusClass(status) {
  switch (status) {
    case "approved":
      return "status-approved";
    case "rejected":
      return "status-rejected";
    default:
      return "status-pending";
  }
}

function getFilteredExamParticipants() {
  return examParticipants.filter(participant => {
    const companyId = getStageCompanyIdForId(participant.normalizedIdUnique);

    if (currentCompanyFilter === "all") return true;
    if (currentCompanyFilter === "none") return !companyId;

    return companyId === currentCompanyFilter;
  });
}

function renderCompanyFilterOptions() {
  const companyOptions = COMPANIES.map(company => `
    <option value="${escapeHtml(company.id)}" ${currentCompanyFilter === company.id ? "selected" : ""}>
      ${escapeHtml(company.name)}
    </option>
  `).join("");

  return `
    <option value="all" ${currentCompanyFilter === "all" ? "selected" : ""}>Tous les élèves</option>
    ${companyOptions}
    <option value="none" ${currentCompanyFilter === "none" ? "selected" : ""}>Aucun stage</option>
  `;
}

/* =========================================================
   ARCHIVES CURSUS
========================================================= */

function formatArchiveDate(value) {
  const parsed = normalizeArchiveDateInput(value);
  if (parsed) return parsed.display;

  return String(value || "").trim() || "date inconnue";
}

function getArchiveDisplayTitle(archive) {
  const start = archive.startDisplay || formatArchiveDate(archive.startDate);
  const end = archive.endDisplay || formatArchiveDate(archive.endDate);

  return `Archive du ${start} au ${end}`;
}

function buildArchiveDocId(start, end) {
  return `archive_${start.iso}_${end.iso}`;
}

function setDashboardCurrentTitle() {
  if (dashboardTitle) {
    dashboardTitle.textContent = IS_COMPANY_ACCESS
      ? `Suivi de Stage · ${COMPANY_SCOPE_NAME || "Entreprise"}`
      : "Suivi de Stage";
  }

  if (dashboardIntro) {
    dashboardIntro.textContent = IS_COMPANY_ACCESS
      ? "Gérez les ID Unique de vos stagiaires. L’effectif et les résultats d’examens restent disponibles à droite."
      : "Ajoutez les ID Unique de vos stagiaires. Sur la droite les examens seront actualisés avec le résultat du candidat.";
  }
}

function setDashboardArchiveTitle(archive) {
  if (dashboardTitle) {
    dashboardTitle.textContent = `Suivi de Stage — ${getArchiveDisplayTitle(archive)}`;
  }

  if (dashboardIntro) {
    dashboardIntro.textContent = "Lecture seule de l’ancien cursus archivé : entreprises, stagiaires et résultats d’examen.";
  }
}

async function loadStageArchives() {
  if (IS_COMPANY_ACCESS) {
    const payload = await fetchCompanyRows("archives");
    stageArchives = (payload.rows || []).map(row => ({
      firebaseId: row.firebaseId || row.id,
      ...row
    }));
  } else {
    const snap = await getDocs(collection(db, STAGE_ARCHIVE_COLLECTION));

    stageArchives = [];

    snap.forEach(docSnap => {
      stageArchives.push({
        firebaseId: docSnap.id,
        ...docSnap.data()
      });
    });
  }

  stageArchives.sort((a, b) => {
    return String(b.startDate || "").localeCompare(String(a.startDate || ""));
  });
  if (currentArchive) {
    currentArchive = stageArchives.find(item => item.firebaseId === currentArchive.firebaseId) || null;
  }
}

async function saveStageArchivePeriod(archive, startValue, endValue) {
  const user = auth.currentUser;
  if (!user?.email || !currentUserAdmin) throw new Error("Seul le compte administrateur peut modifier les dates.");
  const period = buildArchivePeriod(startValue, endValue);
  const archiveRef = doc(db, STAGE_ARCHIVE_COLLECTION, archive.firebaseId);
  const userRef = doc(db, "users", user.email);
  const historyRef = doc(collection(db, "stageHistory"));

  await runTransaction(db, async transaction => {
    const userSnap = await transaction.get(userRef);
    const archiveSnap = await transaction.get(archiveRef);
    if (auth.currentUser?.uid !== user.uid || !userSnap.exists() || userSnap.data().admin !== true) {
      throw new Error("Seul le compte administrateur peut modifier les dates.");
    }
    if (!archiveSnap.exists()) throw new Error("Cette archive n’existe plus. Actualisez la liste.");
    const previous = archiveSnap.data();
    if (previous.startDate !== archive.startDate || previous.endDate !== archive.endDate) {
      throw new Error("Les dates ont déjà été modifiées. Actualisez puis rouvrez l’archive.");
    }

    // Keep the document ID and all archived results: other records reference this ID.
    transaction.update(archiveRef, {
      ...period,
      datesUpdatedBy: user.email,
      datesUpdatedAt: serverTimestamp()
    });
    transaction.set(historyRef, {
      action: "stage_archive_dates_updated",
      actor: user.email,
      createdAt: serverTimestamp(),
      details: {
        archiveId: archive.firebaseId,
        previousPeriod: getArchiveDisplayTitle(previous),
        period: period.title
      }
    });
  });
  return period;
}

let archiveDateEditorArchive = null;
let archiveDateSaving = false;
let archiveDateOpener = null;

function ensureArchiveDateEditor() {
  let dialog = document.getElementById("archiveDateDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "archiveDateDialog";
  dialog.className = "archive-date-dialog";
  dialog.setAttribute("aria-labelledby", "archiveDateTitle");
  dialog.innerHTML = `
    <form id="archiveDateForm">
      <p class="kicker">Archive · Administration</p>
      <h2 id="archiveDateTitle">Modifier les dates</h2>
      <p id="archiveDateCurrent" class="archive-date-current"></p>
      <div class="archive-date-fields">
        <label for="archiveStartDate">Date de début
          <input id="archiveStartDate" type="date" min="1000-01-01" max="9999-12-31" required>
        </label>
        <label for="archiveEndDate">Date de fin
          <input id="archiveEndDate" type="date" min="1000-01-01" max="9999-12-31" required>
        </label>
      </div>
      <p id="archiveDateStatus" class="archive-date-status" role="status" aria-live="polite"></p>
      <div class="archive-date-actions">
        <button type="button" id="archiveDateCancel" class="header-btn">Annuler</button>
        <button type="submit" id="archiveDateSave" class="main-btn">Enregistrer</button>
      </div>
    </form>`;
  document.body.append(dialog);
  dialog.querySelector("#archiveDateCancel").addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", event => {
    if (archiveDateSaving) event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    archiveDateEditorArchive = null;
    if (archiveDateOpener?.isConnected) archiveDateOpener.focus();
    else examList.querySelector("[data-edit-archive-dates], .archive-card-btn")?.focus();
  });
  dialog.querySelector("#archiveDateForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (archiveDateSaving || !archiveDateEditorArchive) return;
    const archive = archiveDateEditorArchive;
    const status = dialog.querySelector("#archiveDateStatus");
    const saveButton = dialog.querySelector("#archiveDateSave");
    const startValue = dialog.querySelector("#archiveStartDate").value;
    const endValue = dialog.querySelector("#archiveEndDate").value;
    archiveDateSaving = true;
    dialog.querySelectorAll("input, button").forEach(element => { element.disabled = true; });
    saveButton.textContent = "Enregistrement…";
    status.textContent = "";
    try {
      const period = await saveStageArchivePeriod(archive, startValue, endValue);
      const item = stageArchives.find(item => item.firebaseId === archive.firebaseId);
      if (item) Object.assign(item, period);
      stageArchives.sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")));
      if (currentArchive?.firebaseId === archive.firebaseId) {
        Object.assign(currentArchive, period);
        setDashboardArchiveTitle(currentArchive);
      }
      renderExamParticipants();
      dialog.close();
    } catch (error) {
      status.textContent = error.code === "permission-denied"
        ? "Accès refusé : la modification est réservée à l’administrateur."
        : error.code === "unavailable"
          ? "Connexion indisponible. Réessayez dès que le réseau est rétabli."
          : error.message || "Enregistrement impossible. Réessayez.";
    } finally {
      archiveDateSaving = false;
      dialog.querySelectorAll("input, button").forEach(element => { element.disabled = false; });
      saveButton.textContent = "Enregistrer";
    }
  });
  return dialog;
}

examList.addEventListener("click", event => {
  const button = event.target.closest("[data-edit-archive-dates]");
  if (!button || !currentUserAdmin || !auth.currentUser) return;
  const archive = stageArchives.find(item => item.firebaseId === button.dataset.editArchiveDates);
  if (!archive) return;
  const dialog = ensureArchiveDateEditor();
  archiveDateEditorArchive = { ...archive };
  archiveDateOpener = button;
  dialog.querySelector("#archiveDateCurrent").textContent = getArchiveDisplayTitle(archive);
  dialog.querySelector("#archiveStartDate").value = normalizeArchiveDateInput(archive.startDate || archive.startDisplay)?.iso || "";
  dialog.querySelector("#archiveEndDate").value = normalizeArchiveDateInput(archive.endDate || archive.endDisplay)?.iso || "";
  dialog.querySelector("#archiveDateStatus").textContent = "";
  dialog.showModal();
});

function renderArchiveDateButton(archive) {
  if (!currentUserAdmin) return "";
  return `<button type="button" class="archive-edit-dates-btn" data-edit-archive-dates="${escapeHtml(archive.firebaseId)}">Modifier les dates</button>`;
}

function getArchiveStageCompanyForId(archive, normalizedIdUnique) {
  const found = (archive.stageValidations || []).find(item => {
    return item.normalizedIdUnique === normalizedIdUnique;
  });

  return found?.companyName || "";
}

function getArchiveStageCompanyIdForId(archive, normalizedIdUnique) {
  const found = (archive.stageValidations || []).find(item => {
    return item.normalizedIdUnique === normalizedIdUnique;
  });

  return found?.companyId || "";
}

function getArchiveStagesByCompany(archive, companyId) {
  return (archive.stageValidations || [])
    .filter(item => item.companyId === companyId)
    .sort((a, b) => String(a.idUnique).localeCompare(String(b.idUnique), "fr"));
}

function getArchiveFilteredExamParticipants(archive) {
  const search = normalizeSearchText(currentArchiveSearch);
  const searchId = normalizeIdUnique(currentArchiveSearch);

  return dedupeExamParticipants(archive.examParticipants || []).filter(participant => {
    const normalizedId = participant.normalizedIdUnique || normalizeIdUnique(participant.idUnique);
    const companyId = participant.companyId || getArchiveStageCompanyIdForId(archive, normalizedId);

    if (currentCompanyFilter === "none" && companyId) return false;
    if (currentCompanyFilter !== "all" && currentCompanyFilter !== "none" && companyId !== currentCompanyFilter) return false;

    if (!search && !searchId) return true;

    const name = normalizeSearchText(participant.studentName || "");
    const id = normalizeIdUnique(participant.idUnique || "");

    return name.includes(search) || id.includes(searchId);
  }).sort((a, b) => {
    return String(a.studentName).localeCompare(String(b.studentName), "fr");
  });
}

function buildArchiveSummary(stageItems, examItems) {
  const uniqueExamItems = dedupeExamParticipants(examItems);
  const approved = uniqueExamItems.filter(item => item.status === "approved").length;
  const rejected = uniqueExamItems.filter(item => item.status === "rejected").length;
  const pending = uniqueExamItems.filter(item => item.status !== "approved" && item.status !== "rejected").length;

  return {
    totalStages: stageItems.length,
    totalExams: uniqueExamItems.length,
    approved,
    rejected,
    pending
  };
}

async function createStageArchive(start, end) {
  const archiveId = buildArchiveDocId(start, end);

  const stageItems = stageValidations.map(item => ({
    firebaseId: item.firebaseId || "",
    idUnique: item.idUnique || "",
    normalizedIdUnique: item.normalizedIdUnique || normalizeIdUnique(item.idUnique || ""),
    companyId: item.companyId || "",    companyName: item.companyName || "",
    status: item.status || "approved"
  }));

  const examItems = examParticipants.map(participant => {
    const normalizedId = participant.normalizedIdUnique || normalizeIdUnique(participant.idUnique || "");
    const companyId = getStageCompanyIdForId(normalizedId);
    const companyName = getStageCompanyForId(normalizedId);

    return {
      firebaseId: participant.firebaseId || "",
      idUnique: participant.idUnique || "",
      normalizedIdUnique: normalizedId,
      studentName: participant.studentName || "Nom non renseigné",
      totalScore: Number(participant.totalScore || 0),
      maxScore: Number(participant.maxScore || 50),
      status: participant.status || "pending",
      companyId,
      companyName
    };
  });

  const archivePayload = {
    title: `Archive du ${start.display} au ${end.display}`,
    startDate: start.iso,
    endDate: end.iso,
    startDisplay: start.display,
    endDisplay: end.display,
    stageValidations: stageItems,
    examParticipants: examItems,
    summary: buildArchiveSummary(stageItems, examItems),
    archivedBy: auth.currentUser?.email || "professeur inconnu",
    createdAt: serverTimestamp()
  };

  await runTransaction(db, async transaction => {
    const archiveRef = doc(db, STAGE_ARCHIVE_COLLECTION, archiveId);
    const existing = await transaction.get(archiveRef);
    if (existing.exists()) throw new Error("Une archive existe déjà pour cet identifiant de cursus. Elle ne sera pas remplacée.");
    transaction.set(archiveRef, archivePayload);
  });

  return archiveId;
}

window.openStageArchive = function(archiveId) {
  const archive = stageArchives.find(item => item.firebaseId === archiveId);

  if (!archive) {
    alert("Archive introuvable.");
    return;
  }

  currentArchive = archive;
  currentRightPanel = "examens";
  currentArchiveSearch = "";
  currentCompanyFilter = "all";

  setDashboardArchiveTitle(archive);
  renderCompanies();
  renderExamParticipants();
};

window.closeStageArchive = function() {
  currentArchive = null;
  currentRightPanel = "archives";
  currentArchiveSearch = "";
  currentCompanyFilter = "all";

  setDashboardCurrentTitle();
  renderCompanies();
  renderExamParticipants();
};

/* =========================================================
   RECHERCHE EXAMENS
========================================================= */

function getStageSearchMatches(query) {
  const rawQuery = String(query || "").trim();
  const normalizedTextQuery = normalizeSearchText(rawQuery);
  const normalizedIdQuery = normalizeIdUnique(rawQuery);

  if (!normalizedTextQuery && !normalizedIdQuery) return [];

  const results = [];

  getFilteredExamParticipants().forEach(participant => {
    const participantName = normalizeSearchText(participant.studentName || "");
    const participantId = normalizeIdUnique(participant.idUnique || "");

    const matchName = normalizedTextQuery && participantName.includes(normalizedTextQuery);
    const matchId = normalizedIdQuery && participantId.includes(normalizedIdQuery);

    if (!matchName && !matchId) return;

    const companyName = getStageCompanyForId(participant.normalizedIdUnique);
    const hasStage = Boolean(companyName);
    const statusLabel = getStatusLabel(participant.status);
    const statusClass = getExamStatusClass(participant.status);

    results.push({
      key: participant.firebaseId,
      idUnique: participant.idUnique,
      studentName: participant.studentName,
      companyName: companyName || "Aucun stage",
      hasStage,
      status: statusLabel,
      statusClass,
      score: `${participant.totalScore} / ${participant.maxScore}`
    });
  });

  results.sort((a, b) => {
    return String(a.studentName).localeCompare(String(b.studentName), "fr");
  });

  return results.slice(0, 12);
}

function renderStageSearchResults(query) {
  const resultBox = document.getElementById("stageSearchResults");
  if (!resultBox) return;

  const rawQuery = String(query || "").trim();

  if (!rawQuery) {
    resultBox.innerHTML = "";
    return;
  }

  const matches = getStageSearchMatches(rawQuery);

  if (!matches.length) {
    resultBox.innerHTML = `
      <div class="stage-search-empty no-result">
        Aucun examen trouvé pour “${escapeHtml(rawQuery)}”.
      </div>
    `;
    return;
  }

  resultBox.innerHTML = matches.map(item => `
    <div class="stage-search-result ${item.hasStage ? "found" : "not-found"} ${item.statusClass}" title="${escapeHtml(item.studentName)}">
      <div>
        <strong title="${escapeHtml(item.studentName)}">${escapeHtml(item.studentName)}</strong>
        <span>ID ${escapeHtml(item.idUnique)} · ${escapeHtml(item.score)} · ${escapeHtml(item.status)}</span>
      </div>

      <em>${item.hasStage ? "✅" : "❌"} ${escapeHtml(item.companyName)}</em>
    </div>
  `).join("");
}

function bindStageSearch() {
  const input = document.getElementById("stageSearchInput");
  const filter = document.getElementById("stageCompanyFilter");

  if (input) {
    input.value = currentStageSearch;

    input.addEventListener("input", () => {
      currentStageSearch = input.value;
      renderStageSearchResults(currentStageSearch);
    });

    renderStageSearchResults(currentStageSearch);
  }

  if (filter) {
    filter.value = currentCompanyFilter;

    filter.addEventListener("change", () => {
      currentCompanyFilter = filter.value;
      renderExamParticipants();
    });
  }
}

function bindArchiveControls() {
  const input = document.getElementById("archiveSearchInput");
  const filter = document.getElementById("archiveCompanyFilter");

  if (input) {
    input.value = currentArchiveSearch;

    input.addEventListener("input", () => {
      currentArchiveSearch = input.value;
      renderExamParticipants();
    });
  }

  if (filter) {
    filter.value = currentCompanyFilter;

    filter.addEventListener("change", () => {
      currentCompanyFilter = filter.value;
      renderExamParticipants();
    });
  }
}

/* =========================================================
   EFFECTIF GOOGLE SHEETS
========================================================= */

function buildEffectifCsvUrl() {
  return `https://docs.google.com/spreadsheets/d/${effectifSpreadsheetId}/export?format=csv&gid=${effectifGid}`;
}

function getCurrentEffectifLink() {
  return (
    localStorage.getItem(EFFECTIF_LINK_STORAGE_KEY) ||
    `https://docs.google.com/spreadsheets/d/${effectifSpreadsheetId}/edit?gid=${effectifGid}#gid=${effectifGid}`
  );
}

function extractGoogleSheetInfoFromUrl(value) {
  const url = String(value || "").trim();

  const spreadsheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/[?&#]gid=([0-9]+)/);

  if (!spreadsheetMatch) {
    return null;
  }

  return {
    spreadsheetId: spreadsheetMatch[1],
    gid: gidMatch ? gidMatch[1] : "0"
  };
}

function saveEffectifLinkFromInput() {
  const input = document.getElementById("effectifLinkInput");
  if (!input) return;

  const link = input.value.trim();
  const parsed = extractGoogleSheetInfoFromUrl(link);

  if (!parsed) {
    alert("Lien Google Sheets invalide. Colle bien le lien complet du Google Sheet.");
    return;
  }

  effectifSpreadsheetId = parsed.spreadsheetId;
  effectifGid = parsed.gid;

  localStorage.setItem(EFFECTIF_LINK_STORAGE_KEY, link);
  localStorage.setItem(EFFECTIF_ID_STORAGE_KEY, effectifSpreadsheetId);
  localStorage.setItem(EFFECTIF_GID_STORAGE_KEY, effectifGid);

  effectifRows = [];
  currentEffectifSearch = "";

  closeEffectifLinkModal();

  if (currentRightPanel === "effectif") {
    renderEffectifPanel();
  }

  alert("Lien effectif mis à jour ✅");
}

function resetEffectifLink() {
  const confirmed = confirm("Remettre le lien effectif par défaut ?");
  if (!confirmed) return;

  effectifSpreadsheetId = DEFAULT_EFFECTIF_SPREADSHEET_ID;
  effectifGid = DEFAULT_EFFECTIF_GID;

  localStorage.removeItem(EFFECTIF_LINK_STORAGE_KEY);
  localStorage.removeItem(EFFECTIF_ID_STORAGE_KEY);
  localStorage.removeItem(EFFECTIF_GID_STORAGE_KEY);

  effectifRows = [];
  currentEffectifSearch = "";

  closeEffectifLinkModal();

  if (currentRightPanel === "effectif") {
    renderEffectifPanel();
  }

  alert("Lien effectif réinitialisé ✅");
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
    firstB.includes("prenom");

  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map(row => {
      const idUnique = String(row[0] || "").trim();
      const studentName = String(row[1] || "").trim();

      return {
        idUnique,
        normalizedIdUnique: normalizeIdUnique(idUnique),
        studentName
      };
    })
    .filter(item => item.idUnique || item.studentName);
}

async function loadEffectifRows() {
  if (effectifRows.length) return effectifRows;

  const effectifUrl = IS_COMPANY_ACCESS
    ? `/api/secure-sheet?source=effectif&sheet=current&spreadsheetId=${encodeURIComponent(effectifSpreadsheetId)}&gid=${encodeURIComponent(effectifGid)}`
    : buildEffectifCsvUrl();
  const response = await fetch(effectifUrl, IS_COMPANY_ACCESS ? {
    credentials: "same-origin",
    cache: "no-store"
  } : undefined);

  if (!response.ok) {
    const payload = IS_COMPANY_ACCESS ? await response.json().catch(() => ({})) : {};
    throw new Error(payload.error || `Erreur de chargement de l’effectif : ${response.status}`);
  }

  const csvText = await response.text();
  const rows = parseCsv(csvText);

  effectifRows = normalizeEffectifRows(rows);

  return effectifRows;
}

function getEffectifMatches() {
  const search = normalizeSearchText(currentEffectifSearch);
  const searchId = normalizeIdUnique(currentEffectifSearch);
  const displayedRows = currentArchive?.effectifStudents?.length
    ? currentArchive.effectifStudents
    : effectifRows;

  if (!search && !searchId) return displayedRows;

  return displayedRows.filter(item => {
    const name = normalizeSearchText(item.studentName);
    const id = normalizeIdUnique(item.idUnique);

    return name.includes(search) || id.includes(searchId);
  });
}

function bindCompanyWarningButtons() {
  if (!IS_COMPANY_ACCESS) return;

  document.querySelectorAll("[data-company-warning-student]").forEach(button => {
    const openWarning = event => {
      event.preventDefault();
      event.stopPropagation();
      window.openCompanyStudentWarning(button.dataset.companyWarningStudent || "");
    };

    button.addEventListener("click", openWarning);
    button.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      openWarning(event);
    });
  });
}

function bindCompanyStudentProgressRows() {
  if (!IS_COMPANY_ACCESS) return;

  document.querySelectorAll("[data-company-student-id]").forEach(row => {
    const openStudent = () => {
      window.openCompanyStudentProgress(row.dataset.companyStudentId || "");
    };

    row.addEventListener("click", openStudent);
    row.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openStudent();
    });
  });
}

function renderEffectifRows() {
  const content = document.getElementById("rightPanelContent");
  if (!content) return;

  const rows = getEffectifMatches();
  const historicalEffectif = Boolean(currentArchive?.effectifStudents?.length);
  const effectifLabel = historicalEffectif ? "Effectif archivé" : "Effectif actuel";
  const displayedExams = currentArchive?.examParticipants || examParticipants;

  if (!rows.length) {
    content.innerHTML = `
      <div class="effectif-tools">
        <div>
          <p class="kicker">${effectifLabel}</p>
          <h3>0 personne</h3>
        </div>

        <input
          id="effectifSearchInput"
          type="text"
          placeholder="Rechercher nom ou ID Unique..."
          value="${escapeHtml(currentEffectifSearch)}"
          autocomplete="off"
        >
      </div>

      <div class="effectif-empty">
        Aucun résultat dans l’effectif.
      </div>
    `;

    bindEffectifSearch();
    return;
  }

  content.innerHTML = `
    <div class="effectif-tools">
      <div>
        <p class="kicker">${effectifLabel}</p>
        <h3>${rows.length} personne(s)</h3>
      </div>

      <input
        id="effectifSearchInput"
        type="text"
        placeholder="Rechercher nom ou ID Unique..."
        value="${escapeHtml(currentEffectifSearch)}"
        autocomplete="off"
      >
    </div>

    <div class="effectif-list">
      ${rows.map(item => {
        const exam = displayedExams.find(participant => {
          return participant.normalizedIdUnique === item.normalizedIdUnique;
        });

        const stageCompany = currentArchive
          ? getArchiveStageCompanyForId(currentArchive, item.normalizedIdUnique)
          : getStageCompanyForId(item.normalizedIdUnique);

        const examText = exam
          ? `${escapeHtml(exam.totalScore)} / ${escapeHtml(exam.maxScore)} · ${escapeHtml(getStatusLabel(exam.status))}`
          : "Pas d’examen";

        const examClass = exam ? "ok" : "no";

        const stageText = stageCompany
          ? `✅ ${escapeHtml(stageCompany)}`
          : "❌ Aucun stage";

        const stageClass = stageCompany ? "ok" : "no";

        const safeStudentName = escapeHtml(item.studentName || "Nom non renseigné");
        const safeIdUnique = escapeHtml(item.idUnique || "ID non renseigné");
        const safeExamText = escapeHtml(examText);
        const safeStageTooltip = stageCompany
          ? `Stage : ${escapeHtml(stageCompany)}`
          : "Stage : Aucun stage";

        const tooltipText = `${safeStudentName} · ID ${safeIdUnique} · ${safeExamText} · ${safeStageTooltip}`;
        const companyRowAttributes = IS_COMPANY_ACCESS && !currentArchive
          ? `role="button" tabindex="0" data-company-student-id="${escapeHtml(item.normalizedIdUnique)}" aria-label="Voir le parcours de ${safeStudentName}"`
          : "";

        return `
          <div class="effectif-row has-effectif-tooltip ${IS_COMPANY_ACCESS ? "company-effectif-row" : ""}" data-tooltip="${tooltipText}" ${companyRowAttributes}>
            <strong title="${safeIdUnique}">${safeIdUnique}</strong>

            <div>
              <b title="${safeStudentName}">${safeStudentName}</b>
              <span title="${safeExamText}">${safeExamText}</span>
            </div>

            <em class="${examClass}">
              ${exam ? "✅ Examen" : "❌ Aucun examen"}
            </em>

            <em class="${stageClass}">
              ${stageText}
            </em>
          </div>
        `;
      }).join("")}
    </div>
  `;

  bindEffectifSearch();
  bindCompanyStudentProgressRows();
}

function bindEffectifSearch() {
  const input = document.getElementById("effectifSearchInput");
  if (!input) return;

  input.addEventListener("input", () => {
    currentEffectifSearch = input.value;
    renderEffectifRows();
  });

  input.focus();

  const valueLength = input.value.length;
  input.setSelectionRange(valueLength, valueLength);
}

async function renderEffectifPanel() {
  const content = document.getElementById("rightPanelContent");
  if (!content) return;

  content.innerHTML = `
    <div class="loading-box">
      Chargement de l’effectif...
    </div>
  `;

  try {
    if (!currentArchive?.effectifStudents?.length) await loadEffectifRows();
    renderEffectifRows();
  } catch (error) {
    console.error("Erreur chargement effectif :", error);

    content.innerHTML = `
      <div class="loading-box">
        Impossible de charger l’effectif.<br>
        ${IS_COMPANY_ACCESS ? "Réessaie dans quelques secondes." : "Vérifie le réglage Google Sheets de l’effectif."}
      </div>
    `;
  }
}/* =========================================================
   ONGLETS PANNEAU DROIT
========================================================= */

function renderRightPanelTabs() {
  const archivesButton = `
      <button
        type="button"
        class="${currentRightPanel === "archives" ? "active" : ""}"
        onclick="window.switchRightPanel('archives')"
      >
        Archives
      </button>`;
  return `
    <div class="right-panel-tabs right-panel-tabs-archives">
      <button
        type="button"
        class="${currentRightPanel === "examens" ? "active" : ""}"
        onclick="window.switchRightPanel('examens')"
      >
        Examens
      </button>

      <button
        type="button"
        class="${currentRightPanel === "effectif" ? "active" : ""}"
        onclick="window.switchRightPanel('effectif')"
      >
        Effectif
      </button>

      ${archivesButton}
    </div>

    <div id="rightPanelContent"></div>
  `;
}

window.switchRightPanel = function(panel) {
  currentRightPanel = panel;
  updateCompanyWorkspaceNavigation(panel === "effectif" ? "effectif" : "examens");

  if (panel === "effectif") {
    renderExamParticipants();
    renderEffectifPanel();
    return;
  }

  if (panel === "archives") {
    renderExamParticipants();
    renderArchivesPanel();
    return;
  }

  renderExamParticipants();
};

/* =========================================================
   RENDER ENTREPRISES
========================================================= */

function renderCompanies() {
  if (currentArchive) {
    setDashboardArchiveTitle(currentArchive);

    const companiesHtml = COMPANIES.map(company => {
      const entries = getArchiveStagesByCompany(currentArchive, company.id);

      const rowsHtml = entries.length
        ? entries.map(entry => `
            <div class="stage-id-row archive-stage-row">
              <strong>${escapeHtml(entry.idUnique || "ID inconnu")}</strong>
            </div>
          `).join("")
        : `<div class="empty-row">Aucun ID archivé.</div>`;

      return `
        <article class="company-column archive-company-column">
          <div class="company-head">${escapeHtml(company.name)}</div>
          <div class="company-subhead">ID Unique archivés</div>

          <div class="stage-id-list">
            ${rowsHtml}
          </div>
        </article>
      `;
    }).join("");

    companyGrid.innerHTML = companiesHtml;
    return;
  }

  setDashboardCurrentTitle();

  const companiesHtml = COMPANIES.map(company => {
    const entries = getStagesByCompany(company.id);

    const rowsHtml = entries.length
      ? entries.map(entry => {
          const safeDocIdJs = escapeJsString(entry.firebaseId);
          const safeIdUniqueJs = escapeJsString(entry.idUnique);
          const normalizedStudentId = normalizeIdUnique(entry.normalizedIdUnique || entry.idUnique);
          const effectifStudent = IS_COMPANY_ACCESS
            ? effectifRows.find(item => item.normalizedIdUnique === normalizedStudentId)
            : null;
          const companyWarning = IS_COMPANY_ACCESS
            ? companyWarningByStudentId.get(normalizedStudentId)
            : null;
          const warningMeta = companyWarning ? COMPANY_WARNING_META[companyWarning.level] : null;
          const studentName = effectifStudent?.studentName || companyWarning?.studentName || "";
          const warningButton = warningMeta
            ? `<button type="button" class="company-warning-triangle ${escapeHtml(warningMeta.tone)}" data-company-warning-student="${escapeHtml(normalizedStudentId)}" aria-label="Voir ${escapeHtml(warningMeta.label)} de ${escapeHtml(studentName || entry.idUnique)}" title="${escapeHtml(warningMeta.label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.7 1.8 18.4A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.6L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 8v5"/><circle cx="12" cy="17" r="1"/></svg></button>`
            : "";
          const deleteButton = IS_ADMIN_COMPANY_PREVIEW ? "" : `
              <button
                type="button"
                onclick="window.deleteStageIdFromStage('${safeDocIdJs}', '${safeIdUniqueJs}')"
                title="Supprimer"
              >
                ×
              </button>`;

          return `
            <div class="stage-id-row" data-stage-row-id="${escapeHtml(entry.firebaseId)}">
              <div class="stage-student-identity">
                <div class="stage-student-id-line">
                  <strong>${escapeHtml(entry.idUnique)}</strong>
                  ${warningButton}
                </div>
                ${studentName ? `<span>${escapeHtml(studentName)}</span>` : ""}
              </div>
              ${deleteButton}
            </div>
          `;
        }).join("")
      : `<div class="empty-row">Aucun ID enregistré.</div>`;

    return `
      <article class="company-column">
        <div class="company-head">${escapeHtml(company.name)}</div>
        <div class="company-subhead">ID Unique</div>

        ${IS_ADMIN_COMPANY_PREVIEW ? `
          <div class="company-preview-readonly">Aperçu en lecture seule</div>
        ` : `
          <div class="company-actions">
            <button
              type="button"
              class="open-bulk-modal-btn"
              onclick="window.openBulkStageModal('${escapeJsString(company.id)}')"
            >
              Ajouter une liste
            </button>

            <button
              type="button"
              class="delete-company-list-btn"
              onclick="window.deleteCompanyStageList('${escapeJsString(company.id)}')"
              ${entries.length ? "" : "disabled"}
            >
              Supprimer liste
            </button>
          </div>
        `}

        <div class="stage-id-list">
          ${rowsHtml}
        </div>
      </article>
    `;
  }).join("");

  companyGrid.innerHTML = companiesHtml;

  ensureBulkModal();
  bindCompanyWarningButtons();
  updateCompanyWorkspaceStats();
}

/* =========================================================
   RENDER EXAMENS / EFFECTIF / ARCHIVES
========================================================= */

function renderExamParticipants() {
  examList.innerHTML = renderRightPanelTabs();

  const content = document.getElementById("rightPanelContent");
  if (!content) return;

  if (currentRightPanel === "archives") {
    renderArchivesPanel();
    return;
  }

  if (currentRightPanel === "effectif") {
    renderEffectifPanel();
    return;
  }

  if (currentArchive) {
    renderArchiveExamParticipants(content);
    return;
  }

  const searchBox = `
    <div class="exam-search-panel">
      <div class="exam-tools-row">
        <div class="exam-tool-block">
          <p class="kicker">Recherche</p>

          <input
            id="stageSearchInput"
            type="text"
            placeholder="Nom ou ID Unique..."
            autocomplete="off"
          >
        </div>

        <div class="exam-tool-block exam-filter-block">
          <p class="kicker">Filtres</p>

          <select id="stageCompanyFilter">
            ${renderCompanyFilterOptions()}
          </select>
        </div>
      </div>

      <div id="stageSearchResults" class="stage-search-results"></div>
    </div>
  `;

  if (!examParticipants.length) {
    content.innerHTML = `
      ${searchBox}

      <div class="loading-box">
        Aucun examen à cet instant.
      </div>
    `;

    bindStageSearch();
    return;
  }

  const deleteAllButton = currentUserRole === "prof"
    ? `
      <div class="exam-list-actions">
        <button
          type="button"
          class="delete-all-exams-btn"
          onclick="window.deleteAllExamParticipantsFromStage()"
        >
          Supprimer tout
        </button>
      </div>
    `
    : "";

  const visibleExamParticipants = getFilteredExamParticipants();

  const rowsHtml = visibleExamParticipants.length
    ? visibleExamParticipants.map(participant => {
        const hasStage = hasStageForId(participant.normalizedIdUnique);
        const companyName = getStageCompanyForId(participant.normalizedIdUnique);
        const statusLabel = getStatusLabel(participant.status);
        const statusClass = getExamStatusClass(participant.status);

        const safeDocIdHtml = escapeHtml(participant.firebaseId);
        const safeDocIdJs = escapeJsString(participant.firebaseId);
        const safeStudentNameJs = escapeJsString(participant.studentName);

        const badgeText = hasStage
          ? "✅ " + escapeHtml(companyName)
          : "Aucun stage";

        const deleteButton = currentUserRole === "prof"
          ? `
            <button
              type="button"
              class="delete-exam-participant-btn"
              onclick="window.deleteExamParticipantFromStage('${safeDocIdJs}', '${safeStudentNameJs}')"
              title="Supprimer le participant"
            >
              ×
            </button>
          `
          : "";

        const safeMaxScore = Math.max(1, Number(participant.maxScore || 50));
        const safeTotalScore = Math.max(0, Math.min(safeMaxScore, Number(participant.totalScore || 0)));
        const scorePercent = Math.round((safeTotalScore / safeMaxScore) * 100);

        return `
          <div class="exam-row ${hasStage ? "stage-ok" : ""} ${statusClass}" data-exam-row-id="${safeDocIdHtml}">
            <strong>${escapeHtml(participant.idUnique)}</strong>

            <div class="exam-name">
              <b title="${escapeHtml(participant.studentName)}">${escapeHtml(participant.studentName)}</b>
              <span>${escapeHtml(participant.totalScore)} / ${escapeHtml(participant.maxScore)} · ${escapeHtml(statusLabel)}</span>
              <span class="exam-score-track" aria-label="${scorePercent}% des points">
                <i style="width:${scorePercent}%"></i>
              </span>
            </div>

            <span class="badge ${hasStage ? "ok" : "no"}">
              ${badgeText}
            </span>

            ${deleteButton}
          </div>
        `;
      }).join("")
    : `
      <div class="loading-box">
        Aucun participant pour ce filtre.
      </div>
    `;

  content.innerHTML = `
    ${searchBox}
    ${deleteAllButton}
    ${rowsHtml}
  `;

  bindStageSearch();
  updateCompanyWorkspaceStats();
}

function renderArchiveExamParticipants(content) {
  const archiveParticipants = getArchiveFilteredExamParticipants(currentArchive);

  const archiveHeader = `
    <div class="archive-current-box">
      <div>
        <p class="kicker">Archive ouverte</p>
        <h3>${escapeHtml(getArchiveDisplayTitle(currentArchive))}</h3>
      </div>

      <div class="archive-header-actions">
      ${renderArchiveDateButton(currentArchive)}
      <button
        type="button"
        class="archive-return-btn"
        onclick="window.closeStageArchive()"
      >
        Retour cursus actuel
      </button>
      </div>
    </div>
  `;

  const archiveTools = `
    <div class="exam-search-panel archive-search-panel">
      <div class="exam-tools-row">
        <div class="exam-tool-block">
          <p class="kicker">Recherche archive</p>

          <input
            id="archiveSearchInput"
            type="text"
            placeholder="Nom ou ID Unique..."
            autocomplete="off"
            value="${escapeHtml(currentArchiveSearch)}"
          >
        </div>

        <div class="exam-tool-block exam-filter-block">
          <p class="kicker">Filtres</p>

          <select id="archiveCompanyFilter">
            ${renderCompanyFilterOptions()}
          </select>
        </div>
      </div>
    </div>
  `;

  const rowsHtml = archiveParticipants.length
    ? archiveParticipants.map(participant => {
        const normalizedId = participant.normalizedIdUnique || normalizeIdUnique(participant.idUnique || "");
        const companyName = participant.companyName || getArchiveStageCompanyForId(currentArchive, normalizedId);
        const hasStage = Boolean(companyName);
        const statusLabel = getStatusLabel(participant.status);
        const statusClass = getExamStatusClass(participant.status);

        const badgeText = hasStage
          ? "✅ " + escapeHtml(companyName)
          : "Aucun stage";

        return `
          <div class="exam-row archive-exam-row ${hasStage ? "stage-ok" : ""} ${statusClass}">
            <strong>${escapeHtml(participant.idUnique || "ID inconnu")}</strong>

            <div class="exam-name">
              <b title="${escapeHtml(participant.studentName || "Nom non renseigné")}">${escapeHtml(participant.studentName || "Nom non renseigné")}</b>
              <span>${escapeHtml(participant.totalScore || 0)} / ${escapeHtml(participant.maxScore || 50)} · ${escapeHtml(statusLabel)}</span>
            </div>

            <span class="badge ${hasStage ? "ok" : "no"}">
              ${badgeText}
            </span>
          </div>
        `;
      }).join("")
    : `
      <div class="loading-box">
        Aucun participant dans cette archive pour ce filtre.
      </div>
    `;

  content.innerHTML = `
    ${archiveHeader}
    ${archiveTools}
    ${rowsHtml}
  `;

  bindArchiveControls();
}

function renderArchivesPanel() {
  const content = document.getElementById("rightPanelContent");
  if (!content) return;

  if (!stageArchives.length) {
    content.innerHTML = `
      <div class="archive-list-panel">
        <p class="kicker">Archives</p>
        <h3>Aucune archive</h3>
        <p>
          Quand vous réinitialisez une semaine, le cursus est sauvegardé ici avec les stagiaires et les résultats.
        </p>
      </div>
    `;
    return;
  }

  const cardsHtml = stageArchives.map(archive => {
    const summary = buildArchiveSummary(
      archive.stageValidations || [],
      archive.examParticipants || []
    );
    const safeArchiveId = escapeJsString(archive.firebaseId);

    return `
      <div class="archive-list-item">
      <button
        type="button"
        class="archive-card-btn"
        onclick="window.openStageArchive('${safeArchiveId}')"
      >
        <span>${escapeHtml(getArchiveDisplayTitle(archive))}</span>
        <strong>
          ${escapeHtml(summary.totalStages || 0)} ID stage · ${escapeHtml(summary.totalExams || 0)} examen(s)
        </strong>
        <em>
          ✅ ${escapeHtml(summary.approved || 0)} approuvé(s) · ❌ ${escapeHtml(summary.rejected || 0)} refusé(s) · ⏳ ${escapeHtml(summary.pending || 0)} en attente
        </em>
      </button>
      ${renderArchiveDateButton(archive)}
      </div>
    `;
  }).join("");

  content.innerHTML = `
    <div class="archive-list-panel">
      <p class="kicker">Archives</p>
      <h3>Cursus archivés</h3>
      <p>
        Sélectionnez une archive pour revoir le cursus en lecture seule.
      </p>

      <div class="archive-list">
        ${cardsHtml}
      </div>
    </div>
  `;
}

/* =========================================================
   AJOUT LISTE
========================================================= */

async function addStageValidationsBulk(companyId, ids) {
  if (IS_ADMIN_COMPANY_PREVIEW) {
    throw new Error("Aperçu administrateur en lecture seule.");
  }
  const company = COMPANIES.find(item => item.id === companyId);
  if (!company) return { added: 0, skipped: 0 };

  const cleanIds = parseBulkIds(ids);

  if (IS_COMPANY_ACCESS) {
    if (companyId !== COMPANY_SCOPE_ID) throw new Error("Entreprise non autorisée.");
    return fetchCompanyRows("stages", {
      method: "POST",
      body: { ids: cleanIds }
    });
  }

  let added = 0;
  let skipped = 0;

  for (const idUnique of cleanIds) {
    const normalizedIdUnique = normalizeIdUnique(idUnique);

    const alreadyExists = stageValidations.some(item => {
      return item.companyId === companyId && item.normalizedIdUnique === normalizedIdUnique;
    });

    if (alreadyExists) {
      skipped++;
      continue;
    }

    const docId = buildStageDocId(companyId, normalizedIdUnique);
    const ref = doc(db, STAGE_COLLECTION, docId);

    await setDoc(ref, {
      idUnique: String(idUnique).trim(),
      normalizedIdUnique,
      companyId: company.id,
      companyName: company.name,
      status: "approved",
      addedBy: auth.currentUser?.email || "compte stage",
      addedByRole: currentUserRole || "unknown",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    stageValidations.push({
      firebaseId: docId,
      idUnique: String(idUnique).trim(),
      normalizedIdUnique,
      companyId: company.id,
      companyName: company.name,
      status: "approved"
    });

    added++;
  }

  return { added, skipped };
}

/* =========================================================
   MODAL AJOUT LISTE
========================================================= */

function ensureBulkModal() {
  if (document.getElementById("bulkStageModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="bulkStageModal" class="bulk-modal-overlay" hidden>
      <div class="bulk-modal-card">
        <button type="button" class="bulk-modal-close" onclick="window.closeBulkStageModal()">×</button>

        <p class="bulk-modal-kicker">Gestion des Stages</p>
        <h2 id="bulkStageTitle">Ajouter une liste</h2>

        <p class="bulk-modal-text">
          Collez plusieurs ID Unique. Vous pouvez utiliser des retours à la ligne, virgules, espaces ou points-virgules.
        </p>

        <textarea
          id="bulkStageTextarea"
          placeholder="Ex:
322644
265982
266167"
        ></textarea>

        <div class="bulk-modal-actions">
          <button type="button" class="bulk-cancel-btn" onclick="window.closeBulkStageModal()">
            Annuler
          </button>

          <button type="button" id="bulkStageSubmitBtn" class="bulk-submit-btn">
            Ajouter la liste
          </button>
        </div>
      </div>
    </div>
  `);  const submitBtn = document.getElementById("bulkStageSubmitBtn");

  submitBtn.addEventListener("click", async () => {
    const modal = document.getElementById("bulkStageModal");
    const textarea = document.getElementById("bulkStageTextarea");
    const companyId = modal.dataset.companyId;

    const ids = parseBulkIds(textarea.value);

    if (!companyId) {
      alert("Entreprise introuvable.");
      return;
    }

    if (!ids.length) {
      alert("Colle au moins un ID Unique.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Ajout...";

    try {
      const result = await addStageValidationsBulk(companyId, ids);

      textarea.value = "";
      window.closeBulkStageModal();

      alert(`${result.added} ID ajouté(s). ${result.skipped} doublon(s) ignoré(s).`);

      await refreshAll();
    } catch (error) {
      console.error("Erreur ajout liste ID stage :", error);
      alert("Impossible d’ajouter cette liste. Vérifie les règles Firebase.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Ajouter la liste";
    }
  });
}

window.openBulkStageModal = function(companyId) {
  if (IS_ADMIN_COMPANY_PREVIEW) return;
  if (currentArchive) {
    alert("Impossible de modifier une archive.");
    return;
  }

  const modal = document.getElementById("bulkStageModal");
  const textarea = document.getElementById("bulkStageTextarea");
  const title = document.getElementById("bulkStageTitle");

  const company = COMPANIES.find(item => item.id === companyId);

  if (!modal || !textarea || !title || !company) return;

  modal.dataset.companyId = companyId;
  title.textContent = `Ajouter une liste — ${company.name}`;

  modal.hidden = false;

  requestAnimationFrame(() => {
    modal.classList.add("active");
    textarea.focus();
  });
};

window.closeBulkStageModal = function() {
  const modal = document.getElementById("bulkStageModal");
  const textarea = document.getElementById("bulkStageTextarea");

  if (!modal) return;

  modal.classList.remove("active");

  setTimeout(() => {
    modal.hidden = true;
    modal.dataset.companyId = "";
    if (textarea) textarea.value = "";
  }, 180);
};

/* =========================================================
   FICHE PARCOURS ÉLÈVE - ENTREPRISE
========================================================= */

function lockCompanyStudentProgressScroll() {
  if (companyStudentProgressScrollLocked) return;

  document.documentElement.classList.add("company-student-modal-open");
  document.body.classList.add("company-student-modal-open");
  companyStudentProgressScrollLocked = true;
}

function unlockCompanyStudentProgressScroll() {
  if (!companyStudentProgressScrollLocked) return;

  document.documentElement.classList.remove("company-student-modal-open");
  document.body.classList.remove("company-student-modal-open");
  companyStudentProgressScrollLocked = false;
}

function ensureCompanyWarningModal() {
  if (!IS_COMPANY_ACCESS || document.getElementById("companyWarningModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="companyWarningModal" class="bulk-modal-overlay company-warning-modal" hidden>
      <section class="bulk-modal-card company-warning-card" role="dialog" aria-modal="true" aria-labelledby="companyWarningTitle">
        <button id="companyWarningCloseBtn" type="button" class="bulk-modal-close" aria-label="Fermer">×</button>
        <p class="bulk-modal-kicker">Suivi modules</p>
        <h2 id="companyWarningTitle">Avertissement</h2>
        <p id="companyWarningMeta" class="bulk-modal-text"></p>
        <div id="companyWarningContent"></div>
      </section>
    </div>
  `);

  const modal = document.getElementById("companyWarningModal");
  document.getElementById("companyWarningCloseBtn")?.addEventListener("click", () => {
    window.closeCompanyStudentWarning();
  });
  modal?.addEventListener("click", event => {
    if (event.target === modal) window.closeCompanyStudentWarning();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal && !modal.hidden) {
      window.closeCompanyStudentWarning();
    }
  });
}

window.openCompanyStudentWarning = function(normalizedIdUnique) {
  if (!IS_COMPANY_ACCESS) return;

  const normalizedId = normalizeIdUnique(normalizedIdUnique);
  const warning = companyWarningByStudentId.get(normalizedId);
  const warningMeta = warning ? COMPANY_WARNING_META[warning.level] : null;
  const effectifStudent = effectifRows.find(item => item.normalizedIdUnique === normalizedId);
  const stageStudent = stageValidations.find(item => (
    normalizeIdUnique(item.normalizedIdUnique || item.idUnique) === normalizedId
  ));
  if (!warning || !warningMeta || !stageStudent) return;

  ensureCompanyWarningModal();
  const modal = document.getElementById("companyWarningModal");
  const title = document.getElementById("companyWarningTitle");
  const meta = document.getElementById("companyWarningMeta");
  const content = document.getElementById("companyWarningContent");
  if (!modal || !title || !meta || !content) return;

  title.textContent = effectifStudent?.studentName || warning.studentName || "Nom non renseigné";
  meta.textContent = `ID Unique ${effectifStudent?.idUnique || stageStudent.idUnique || normalizedId} · Consultation uniquement`;
  content.innerHTML = `
    <div class="company-warning-status ${escapeHtml(warningMeta.tone)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.7 1.8 18.4A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.6L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 8v5"/><circle cx="12" cy="17" r="1"/></svg>
      <div><span>Avertissement actuel</span><strong>${escapeHtml(warningMeta.label)}</strong></div>
    </div>
    <div class="company-warning-reason">
      <span>Raison indiquée par le professeur</span>
      <p>${escapeHtml(warning.comment || "Aucune raison n’a été renseignée.")}</p>
    </div>
    <p class="company-warning-readonly">Cette information est affichée en lecture seule.</p>
  `;

  lockCompanyStudentProgressScroll();
  modal.hidden = false;
  requestAnimationFrame(() => {
    modal.classList.add("active");
    document.getElementById("companyWarningCloseBtn")?.focus();
  });
};

window.closeCompanyStudentWarning = function() {
  const modal = document.getElementById("companyWarningModal");
  if (!modal) return;

  modal.classList.remove("active");
  setTimeout(() => {
    modal.hidden = true;
    unlockCompanyStudentProgressScroll();
  }, 180);
};

function ensureCompanyStudentProgressModal() {
  if (!IS_COMPANY_ACCESS || document.getElementById("companyStudentProgressModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="companyStudentProgressModal" class="bulk-modal-overlay company-student-progress-modal" hidden>
      <section class="bulk-modal-card company-student-progress-card" role="dialog" aria-modal="true" aria-labelledby="companyStudentProgressTitle">
        <button id="companyStudentProgressCloseBtn" type="button" class="bulk-modal-close" aria-label="Fermer">×</button>
        <p class="bulk-modal-kicker">Parcours élève</p>
        <h2 id="companyStudentProgressTitle">Fiche élève</h2>
        <p id="companyStudentProgressMeta" class="bulk-modal-text"></p>
        <div id="companyStudentProgressContent" class="company-student-progress-content"></div>
      </section>
    </div>
  `);

  const modal = document.getElementById("companyStudentProgressModal");
  document.getElementById("companyStudentProgressCloseBtn")?.addEventListener("click", () => {
    window.closeCompanyStudentProgress();
  });
  modal?.addEventListener("click", event => {
    if (event.target === modal) window.closeCompanyStudentProgress();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal && !modal.hidden) {
      window.closeCompanyStudentProgress();
    }
  });
}

async function loadCompanyStudentProgress(normalizedIdUnique) {
  const cached = companyStudentProgressCache.get(normalizedIdUnique);
  if (cached && Date.now() - cached.loadedAt < COMPANY_STUDENT_PROGRESS_CACHE_MS) {
    return cached.student;
  }

  const payload = await fetchCompanyRows("student-progress", {
    documentId: normalizedIdUnique
  });
  const student = payload.student || null;
  companyStudentProgressCache.set(normalizedIdUnique, {
    loadedAt: Date.now(),
    student
  });
  return student;
}

function renderCompanyStudentProgress(student, exam) {
  const checks = student?.checks || {};
  const dates = student?.dates || {};
  const modules = [
    { key: "module1", label: "Module 1" },
    { key: "module2", label: "Module 2" },
    { key: "module3", label: "Module 3" },
    { key: "module4", label: "Module 4" }
  ];
  const completedModules = modules.filter(module => checks[module.key] === true).length;
  const moduleCards = modules.map(module => {
    const completed = checks[module.key] === true;
    const date = String(dates[module.key] || "").trim();
    return `
      <article class="company-progress-item ${completed ? "is-complete" : "is-pending"}">
        <span class="company-progress-icon" aria-hidden="true">${completed ? "✓" : "—"}</span>
        <div>
          <strong>${module.label}</strong>
          <small>${completed ? escapeHtml(date ? `Validé · ${date}` : "Validé") : "Non validé"}</small>
        </div>
      </article>
    `;
  }).join("");

  const safeMaxScore = exam ? Math.max(1, Number(exam.maxScore || 50)) : 50;
  const safeTotalScore = exam
    ? Math.max(0, Math.min(safeMaxScore, Number(exam.totalScore || 0)))
    : 0;
  const examPercent = exam ? Math.round((safeTotalScore / safeMaxScore) * 100) : 0;
  const examStatus = exam ? getStatusLabel(exam.status) : "Pas encore passé";

  return `
    <div class="company-progress-summary">
      <div>
        <strong>${completedModules} / 4</strong>
        <span>modules validés</span>
      </div>
      <div class="company-progress-bar" aria-label="${completedModules} modules validés sur 4">
        <i style="width:${completedModules * 25}%"></i>
      </div>
    </div>

    <div class="company-progress-grid">${moduleCards}</div>

    <article class="company-exam-card ${exam ? "has-exam" : "no-exam"}">
      <div>
        <span>Examen</span>
        <strong>${exam ? `${escapeHtml(safeTotalScore)} / ${escapeHtml(safeMaxScore)}` : "Aucun résultat"}</strong>
        <small>${escapeHtml(examStatus)}</small>
      </div>
      <div class="company-exam-gauge" aria-label="${examPercent}% des points">
        <i style="width:${examPercent}%"></i>
      </div>
    </article>
  `;
}

window.openCompanyStudentProgress = async function(normalizedIdUnique) {
  if (!IS_COMPANY_ACCESS) return;

  const normalizedId = normalizeIdUnique(normalizedIdUnique);
  const effectifStudent = effectifRows.find(item => item.normalizedIdUnique === normalizedId);
  if (!effectifStudent) return;

  ensureCompanyStudentProgressModal();
  const modal = document.getElementById("companyStudentProgressModal");
  const title = document.getElementById("companyStudentProgressTitle");
  const meta = document.getElementById("companyStudentProgressMeta");
  const content = document.getElementById("companyStudentProgressContent");
  if (!modal || !title || !meta || !content) return;

  modal.dataset.studentId = normalizedId;
  title.textContent = effectifStudent.studentName || "Nom non renseigné";
  meta.textContent = `ID Unique ${effectifStudent.idUnique || normalizedId} · Consultation uniquement`;
  content.innerHTML = `<div class="company-progress-loading"><span></span> Chargement du parcours...</div>`;
  lockCompanyStudentProgressScroll();
  modal.hidden = false;
  requestAnimationFrame(() => {
    modal.classList.add("active");
    document.getElementById("companyStudentProgressCloseBtn")?.focus();
  });

  const exam = examParticipants.find(participant => {
    return participant.normalizedIdUnique === normalizedId;
  });

  try {
    const student = await loadCompanyStudentProgress(normalizedId);
    if (modal.dataset.studentId !== normalizedId) return;
    content.innerHTML = renderCompanyStudentProgress(student, exam);
  } catch (error) {
    console.error("Erreur chargement parcours élève :", error);
    if (modal.dataset.studentId !== normalizedId) return;
    content.innerHTML = `
      <div class="company-progress-error">
        Impossible de charger les modules pour le moment. Réessaie dans quelques secondes.
      </div>
    `;
  }
};

window.closeCompanyStudentProgress = function() {
  const modal = document.getElementById("companyStudentProgressModal");
  if (!modal) return;

  const studentId = modal.dataset.studentId || "";
  modal.classList.remove("active");
  setTimeout(() => {
    modal.hidden = true;
    modal.dataset.studentId = "";
    unlockCompanyStudentProgressScroll();
    [...document.querySelectorAll("[data-company-student-id]")]
      .find(row => row.dataset.companyStudentId === studentId)
      ?.focus();
  }, 180);
};

/* =========================================================
   MODAL CHANGER EFFECTIF
========================================================= */

function ensureEffectifLinkModal() {
  if (document.getElementById("effectifLinkModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="effectifLinkModal" class="effectif-link-modal-overlay" hidden>
      <div class="effectif-link-modal-card">
        <button
          type="button"
          class="effectif-link-modal-close"
          onclick="window.closeEffectifLinkModal()"
        >
          ×
        </button>

        <p class="effectif-link-kicker">Effectif</p>
        <h2>Changer l’effectif</h2>

        <p class="effectif-link-text">
          Collez le lien complet du Google Sheet. Le site récupère automatiquement l’ID du fichier et l’onglet sélectionné.
        </p>

        <label for="effectifLinkInput">Lien Google Sheets</label>

        <textarea
          id="effectifLinkInput"
          placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=..."
        ></textarea>

        <div class="effectif-link-current">
          <span>Lien actuel :</span>
          <strong id="effectifCurrentLinkText"></strong>
        </div>

        <div class="effectif-link-actions">
          <button
            type="button"
            class="effectif-link-reset-btn"
            onclick="window.resetEffectifLink()"
          >
            Réinitialiser
          </button>

          <button
            type="button"
            class="effectif-link-cancel-btn"
            onclick="window.closeEffectifLinkModal()"
          >
            Annuler
          </button>

          <button
            type="button"
            class="effectif-link-save-btn"
            onclick="window.saveEffectifLinkFromInput()"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  `);
}

window.openEffectifLinkModal = function() {
  if (currentUserRole !== "prof") {
    alert("Seul un compte professeur peut changer l’effectif.");
    return;
  }

  if (currentArchive) {
    alert("Impossible de modifier l’effectif depuis une archive.");
    return;
  }

  ensureEffectifLinkModal();

  const modal = document.getElementById("effectifLinkModal");
  const input = document.getElementById("effectifLinkInput");
  const currentText = document.getElementById("effectifCurrentLinkText");

  if (!modal || !input || !currentText) return;

  const currentLink = getCurrentEffectifLink();

  input.value = currentLink;
  currentText.textContent = currentLink;

  modal.hidden = false;

  requestAnimationFrame(() => {
    modal.classList.add("active");
    input.focus();
    input.select();
  });
};

window.closeEffectifLinkModal = function() {
  const modal = document.getElementById("effectifLinkModal");

  if (!modal) return;

  modal.classList.remove("active");

  setTimeout(() => {
    modal.hidden = true;
  }, 180);
};

window.saveEffectifLinkFromInput = saveEffectifLinkFromInput;
window.resetEffectifLink = resetEffectifLink;

/* =========================================================
   SUPPRESSION ID / LISTES STAGE
========================================================= */

window.deleteStageIdFromStage = async function(docId, idUnique) {
  if (IS_ADMIN_COMPANY_PREVIEW) {
    alert("L’aperçu administrateur est en lecture seule.");
    return;
  }
  if (currentArchive) {
    alert("Impossible de modifier une archive.");
    return;
  }

  console.log("DELETE STAGE ID CLICK OK", {
    docId,
    idUnique,
    currentUserRole,
    user: auth.currentUser?.email
  });

  if (!docId) {
    alert("Document Firebase introuvable.");
    return;
  }

  try {
    if (IS_COMPANY_ACCESS) {
      await fetchCompanyRows("stages", { method: "DELETE", documentId: docId });
    } else {
      await deleteDoc(doc(db, STAGE_COLLECTION, docId));
    }

    const row = document.querySelector(`[data-stage-row-id="${CSS.escape(docId)}"]`);
    if (row) row.remove();

    console.log("ID stagiaire supprimé avec succès :", idUnique);

    await refreshAll();

  } catch (error) {
    console.error("Erreur suppression ID stage :", error);
    alert(`Erreur suppression ID stage : ${error.code || error.message}`);
  }
};

window.deleteCompanyStageList = async function(companyId) {
  if (IS_ADMIN_COMPANY_PREVIEW) {
    alert("L’aperçu administrateur est en lecture seule.");
    return;
  }
  if (currentArchive) {
    alert("Impossible de modifier une archive.");
    return;
  }

  const company = COMPANIES.find(item => item.id === companyId);
  if (!company) {
    alert("Entreprise introuvable.");
    return;
  }

  const entries = getStagesByCompany(companyId);

  if (!entries.length) {
    alert("Aucun ID à supprimer pour cette entreprise.");
    return;
  }

  const confirmed = confirm(
    `Supprimer toute la liste de ${company.name} ?\n\n${entries.length} ID seront supprimés.`
  );

  if (!confirmed) return;

  try {
    await Promise.all(entries.map(entry => IS_COMPANY_ACCESS
      ? fetchCompanyRows("stages", { method: "DELETE", documentId: entry.firebaseId })
      : deleteDoc(doc(db, STAGE_COLLECTION, entry.firebaseId))
    ));

    console.log(`Liste supprimée pour ${company.name} :`, entries.length);

    await refreshAll();
  } catch (error) {
    console.error("Erreur suppression liste entreprise :", error);
    alert(`Erreur suppression liste : ${error.code || error.message}`);
  }
};

/* =========================================================
   SUPPRESSION / MASQUAGE PARTICIPANTS EXAMEN
========================================================= */

window.deleteExamParticipantFromStage = async function(docId, studentName) {
  if (currentArchive) {
    alert("Impossible de modifier une archive.");
    return;
  }

  console.log("DELETE INLINE CLICK OK", {
    docId,
    studentName,
    currentUserRole,
    user: auth.currentUser?.email
  });

  if (currentUserRole !== "prof") {
    alert("Seul un compte professeur peut supprimer un participant.");
    return;
  }

  if (!docId) {
    alert("Document participant introuvable.");
    return;
  }

  try {
    const participant = examParticipants.find(item => {
      return getExamParticipantFirebaseIds(item).includes(docId);
    });

    const firebaseIds = participant
      ? getExamParticipantFirebaseIds(participant)
      : [docId];

    await Promise.all(firebaseIds.map(firebaseId => {
      const ref = doc(db, EXAM_COLLECTION, firebaseId);

      return setDoc(ref, {
        archived: true,
        archivedBy: auth.currentUser?.email || "professeur inconnu",
        archivedAt: serverTimestamp()
      }, { merge: true });
    }));

    const row = document.querySelector(`[data-exam-row-id="${CSS.escape(docId)}"]`);
    if (row) row.remove();

    console.log("Participant masqué avec succès :", studentName);

    await refreshAll();

  } catch (error) {
    console.error("Erreur suppression participant :", error);
    alert(`Erreur suppression : ${error.code || error.message}`);
  }
};

window.deleteAllExamParticipantsFromStage = async function() {
  if (currentArchive) {
    alert("Impossible de modifier une archive.");
    return;
  }

  if (currentUserRole !== "prof") {
    alert("Seul un compte professeur peut supprimer tous les participants.");
    return;
  }

  if (!examParticipants.length) {
    alert("Aucun examen à supprimer.");
    return;
  }

  const typed = prompt(
    `Action sensible.\n\n${examParticipants.length} participant(s) seront masqués côté examens.\n\nTape RESET pour confirmer.`
  );

  if (typed !== "RESET") {
    alert("Suppression annulée.");
    return;
  }

  try {
    const firebaseIds = getAllExamParticipantFirebaseIds(examParticipants);

    await Promise.all(
      firebaseIds.map(firebaseId => {
        const ref = doc(db, EXAM_COLLECTION, firebaseId);

        return setDoc(ref, {
          archived: true,
          archivedBy: auth.currentUser?.email || "professeur inconnu",
          archivedAt: serverTimestamp()
        }, { merge: true });
      })
    );

    console.log("Tous les participants examens ont été masqués :", firebaseIds.length);

    await refreshAll();
  } catch (error) {
    console.error("Erreur suppression tous examens :", error);
    alert(`Erreur suppression examens : ${error.code || error.message}`);
  }
};

/* =========================================================
   RESET SEMAINE PROF + ARCHIVE
========================================================= */

window.resetStageWeek = async function() {
  if (currentUserRole !== "prof") {
    alert("Seul un compte professeur peut réinitialiser la semaine.");
    return;
  }

  if (currentArchive) {
    alert("Impossible de réinitialiser depuis une archive.");
    return;
  }

  const totalStages = stageValidations.length;
  const totalExams = examParticipants.length;

  if (!totalStages && !totalExams) {
    alert("Rien à réinitialiser.");
    return;
  }

  const startInput = prompt(
    "Date de début du cursus à archiver ?\n\nFormat : JJ/MM/AAAA",
    "18/05/2026"
  );

  if (!startInput) {
    alert("Réinitialisation annulée.");
    return;
  }

  const startDate = normalizeArchiveDateInput(startInput);

  if (!startDate) {
    alert("Date de début invalide. Utilise le format JJ/MM/AAAA.");
    return;
  }

  const endInput = prompt(
    "Date de fin du cursus à archiver ?\n\nFormat : JJ/MM/AAAA",
    "31/05/2026"
  );

  if (!endInput) {
    alert("Réinitialisation annulée.");
    return;
  }

  const endDate = normalizeArchiveDateInput(endInput);

  if (!endDate) {
    alert("Date de fin invalide. Utilise le format JJ/MM/AAAA.");
    return;
  }

  if (endDate.iso < startDate.iso) {
    alert("La date de fin doit être égale ou postérieure à la date de début.");
    return;
  }

  if (stageArchives.some(archive => archive.startDate === startDate.iso && archive.endDate === endDate.iso)) {
    alert("Une archive porte déjà ces dates. Choisissez une autre période.");
    return;
  }

  const archiveId = buildArchiveDocId(startDate, endDate);

  const typed = prompt(
    `⚠️ ARCHIVAGE + RÉINITIALISATION\n\n` +
    `Une archive sera créée :\n` +
    `Archive du ${startDate.display} au ${endDate.display}\n\n` +
    `Elle contiendra :\n` +
    `- ${totalStages} ID Unique de stage ;\n` +
    `- ${totalExams} examen(s) avec scores/statuts.\n\n` +
    `Ensuite la semaine actuelle sera réinitialisée.\n\n` +
    `Tape ARCHIVE pour confirmer.`
  );

  if (typed !== "ARCHIVE") {
    alert("Archivage annulé.");
    return;
  }

  try {
    await createStageArchive(startDate, endDate);

    const stageDeletes = stageValidations.map(item => {
      return deleteDoc(doc(db, STAGE_COLLECTION, item.firebaseId));
    });

    const examArchives = getAllExamParticipantFirebaseIds(examParticipants).map(firebaseId => {
      const ref = doc(db, EXAM_COLLECTION, firebaseId);

      return setDoc(ref, {
        archived: true,
        archivedBy: auth.currentUser?.email || "professeur inconnu",
        archivedAt: serverTimestamp(),
        resetWeek: true,
        archivedInCursus: archiveId
      }, { merge: true });
    });

    await Promise.all([...stageDeletes, ...examArchives]);

    alert(`Archive créée ✅\n\nArchive du ${startDate.display} au ${endDate.display}\n\nSemaine réinitialisée.`);

    currentArchive = null;
    currentRightPanel = "examens";
    currentStageSearch = "";
    currentEffectifSearch = "";
    currentArchiveSearch = "";
    currentCompanyFilter = "all";
    effectifRows = [];

    await refreshAll();
  } catch (error) {
    console.error("Erreur archivage/réinitialisation semaine :", error);
    alert(`Erreur archivage/réinitialisation : ${error.code || error.message}`);
  }
};

/* =========================================================
   REFRESH
========================================================= */

async function refreshAll({ silent = false } = {}) {
  if (!silent) {
    companyGrid.innerHTML = `<div class="loading-box">Chargement des stages...</div>`;
    examList.innerHTML = `<div class="loading-box">Chargement des participants...</div>`;
  }

  const loaders = [
    loadStageValidations(),
    loadExamParticipants()
  ];

  if (IS_COMPANY_ACCESS) {
    loaders.push(loadEffectifRows().catch(error => {
      console.warn("Effectif indisponible dans le résumé entreprise :", error);
      return [];
    }));
  }
  loaders.push(loadStageArchives());

  await Promise.all(loaders);

  const nextCompanySignature = IS_COMPANY_ACCESS ? buildCompanyDataSignature() : "";
  const shouldAnimate = Boolean(companyDataSignature && nextCompanySignature !== companyDataSignature);
  companyDataSignature = nextCompanySignature;

  renderCompanies();
  renderExamParticipants();
  updateCompanyWorkspaceStats();
  if (shouldAnimate) requestAnimationFrame(animateCompanyDataUpdate);
}

function scheduleCompanyRefresh() {
  window.clearTimeout(companyRefreshTimer);
  if (!IS_COMPANY_ACCESS || unifiedLogoutInProgress) return;
  companyRefreshTimer = window.setTimeout(async () => {
    if (document.visibilityState !== "visible" || companyRefreshRunning) {
      scheduleCompanyRefresh();
      return;
    }
    companyRefreshRunning = true;
    try {
      await refreshAll({ silent: true });
    } catch (error) {
      console.warn("Actualisation entreprise momentanément indisponible :", error?.message || error);
    } finally {
      companyRefreshRunning = false;
      scheduleCompanyRefresh();
    }
  }, COMPANY_REFRESH_MS);
}

/* =========================================================
   LOGIN
========================================================= */

loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  loginError.textContent = "";
  setLoginLoading(true);

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const user = credential.user;

    const role = await getUserRole(user);

    if (!isAllowedStageRole(role)) {
      await refuseAccess(user);
      return;
    }

    currentUserRole = role;
    showDashboard();
    await refreshAll();

  } catch (error) {
    console.error("Erreur connexion Firebase :", error.code, error.message);

    if (error.code === "auth/invalid-credential") {
      loginError.textContent = "Email ou mot de passe incorrect.";
    } else if (error.code === "auth/wrong-password") {
      loginError.textContent = "Mot de passe incorrect.";
    } else if (error.code === "auth/user-not-found") {
      loginError.textContent = "Compte introuvable.";
    } else if (error.code === "auth/invalid-email") {
      loginError.textContent = "Adresse e-mail invalide.";
    } else if (error.code === "auth/unauthorized-domain") {
      loginError.textContent = "Domaine Vercel non autorisé dans Firebase.";
    } else if (error.code === "auth/operation-not-allowed") {
      loginError.textContent = "Connexion email/mot de passe désactivée dans Firebase.";
    } else if (error.code === "auth/network-request-failed") {
      loginError.textContent = "Erreur réseau.";
    } else if (error.code === "permission-denied") {
      loginError.textContent = "Accès refusé. Rôle utilisateur introuvable ou non autorisé.";
    } else {
      loginError.textContent = `Erreur : ${error.code}`;
    }

    setLoginLoading(false);
  }
});

logoutBtn.addEventListener("click", async () => {
  if (await returnToUnifiedPortal()) return;
  unifiedLogoutInProgress = true;
  try {
    await window.UniversityMotion?.showExit({
      title: "À bientôt",
      detail: "Fermeture de votre espace stage…"
    });
  } catch (error) {
    console.warn("Transition de déconnexion ignorée :", error);
  }
  currentUserRole = null;
  currentUserAdmin = false;
  document.getElementById("archiveDateDialog")?.close();
  await signOut(auth);
  window.location.replace("/");
});

refreshBtn.addEventListener("click", async () => {
  effectifRows = [];
  await refreshAll();
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    if (IS_ADMIN_COMPANY_PREVIEW) {
      await returnToUnifiedPortal();
      return;
    }
    if (IS_COMPANY_ACCESS) {
      currentUserRole = "company";
      currentUserAdmin = false;
      showDashboard();
      try {
        await refreshAll();
        scheduleCompanyRefresh();
      } catch (error) {
        console.error("Erreur chargement espace entreprise :", error);
        companyGrid.innerHTML = `<div class="loading-box">Impossible de charger vos stagiaires.</div>`;
        examList.innerHTML = `<div class="loading-box">Impossible de charger les examens.</div>`;
      }
      return;
    }
    currentUserRole = null;
    currentUserAdmin = false;
    document.getElementById("archiveDateDialog")?.close();
    showLogin();
    return;
  }

  if (IS_ADMIN_COMPANY_PREVIEW) {
    const adminRole = await getUserRole(user);
    if (adminRole !== "prof" || !currentUserAdmin) {
      await returnToUnifiedPortal();
      return;
    }

    currentUserRole = "company";
    currentUserAdmin = false;
    showDashboard();
    try {
      await refreshAll();
      scheduleCompanyRefresh();
    } catch (error) {
      console.error("Erreur chargement aperçu entreprise :", error);
      companyGrid.innerHTML = `<div class="loading-box">Impossible de charger cet aperçu.</div>`;
      examList.innerHTML = `<div class="loading-box">Impossible de charger les examens.</div>`;
    }
    return;
  }

  const role = await getUserRole(user);

  if (!isAllowedStageRole(role)) {
    await refuseAccess(user);
    return;
  }

  currentUserRole = role;
  showDashboard();

  try {
    await refreshAll();
  } catch (error) {
    console.error("Erreur chargement dashboard stage :", error);

    companyGrid.innerHTML = `
      <div class="loading-box">
        Erreur de chargement des stages.<br>
        Vérifie les règles Firestore.
      </div>
    `;

    examList.innerHTML = `
      <div class="loading-box">
        Erreur de chargement des examens.<br>
        Vérifie les règles Firestore.
      </div>
    `;
  }
});
