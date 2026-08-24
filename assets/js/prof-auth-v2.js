import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getProfAccess,
  getProfDisplayName,
  getProfSecondaryLabel,
  isProfAllowed
} from "./prof-identity.js?v=1";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
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

const AUTH_TIMEOUT_MS = 8500;
const THEME_STORAGE_KEY = "profV2Theme";
const PROFILE_STORAGE_KEY = "profV2Profile";
const DASHBOARD_TIMEOUT_MS = 7000;
const EFFECTIF_TIMEOUT_MS = 12000;
const STAGE_SETTINGS_COLLECTION = "stageSettings";
const EFFECTIF_SETTINGS_DOC_ID = "effectif";
const MODULE_KEYS = ["module1", "module2", "module3", "module4"];
const MODULE_EXAM_KEY = "exam";
const MODULE_RETAKE_KEY = "retakeExam";
const CUSTOM_AVAILABILITY = [
  { id: "sentinelClassic", label: "Custom Facile" },
  { id: "argento2f", label: "Custom Moyen" },
  { id: "cypher", label: "Custom Difficile" }
];
const DEFAULT_EXAM_SHEET = {
  id: "exam-form-1",
  label: "Réponses formulaire",
  source: "examResponses"
};
const CURRENT_CUSTOM_SHEETS = [
  {
    id: "sentinelClassic",
    label: "Sentinel Classic",
    source: "customResponses"
  },
  {
    id: "argento2f",
    label: "Argento 2F",
    source: "customResponses"
  },
  {
    id: "cypher",
    label: "Cypher",
    source: "customResponses"
  }
];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loginSection = document.getElementById("loginSection");
const profDashboard = document.getElementById("profDashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = loginBtn?.querySelector(".btn-text");
const discordLoginBtn = document.getElementById("discordLoginBtn");
const discordLoginBtnText = discordLoginBtn?.querySelector(".discord-btn-text");
const emailLoginDetails = document.getElementById("emailLoginDetails");
const emailLoginSummary = document.getElementById("emailLoginSummary");
const loginTransition = document.getElementById("loginTransition");
const v2UserEmail = document.getElementById("v2UserEmail");
const v2UserRole = document.getElementById("v2UserRole");
const v2UserInitials = document.getElementById("v2UserInitials");
const v2SessionChip = document.getElementById("v2SessionChip");
const v2CommandInput = document.getElementById("v2CommandInput");
const v2DashboardUpdated = document.getElementById("v2DashboardUpdated");
const v2DashboardHealth = document.getElementById("v2DashboardHealth");
const v2WatchCount = document.getElementById("v2WatchCount");
const v2WatchList = document.getElementById("v2WatchList");
const adminBtn = document.getElementById("profAdminBtn");
const settingsBtn = document.getElementById("profSettingsBtn");
const settingsPanel = document.getElementById("v2SettingsPanel");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const profileForm = document.getElementById("v2ProfileForm");
const profileNameInput = document.getElementById("v2ProfileName");
const profileStatus = document.getElementById("v2ProfileStatus");
const resetProfileBtn = document.getElementById("resetProfileBtn");
const profilePreviewInitials = document.getElementById("v2ProfilePreviewInitials");
const profilePreviewName = document.getElementById("v2ProfilePreviewName");
const profilePreviewMeta = document.getElementById("v2ProfilePreviewMeta");
const homeButtons = document.querySelectorAll("[data-v2-home]");

let isManualLoginTransition = false;
let currentAccess = { role: null, admin: false };
let dashboardStatsLoading = false;

window.profFirebase = {
  app,
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp
};

window.dispatchEvent(new Event("profFirebaseReady"));

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function setLoginLoading(isLoading) {
  if (!loginBtn || !loginBtnText) return;

  loginBtn.disabled = isLoading;
  loginBtn.classList.toggle("loading", isLoading);
  loginBtnText.textContent = isLoading ? "Connexion..." : "Connexion";
}

function setDiscordLoading(isLoading) {
  if (!discordLoginBtn || !discordLoginBtnText) return;
  discordLoginBtn.disabled = isLoading;
  discordLoginBtn.classList.toggle("loading", isLoading);
  discordLoginBtnText.textContent = isLoading ? "Connexion à Discord..." : "Continuer avec Discord";
}

function setTheme(theme) {
  const safeTheme = ["dark", "light"].includes(theme) ? theme : "dark";
  document.body.dataset.theme = safeTheme;
  localStorage.setItem(THEME_STORAGE_KEY, safeTheme);

  document.querySelectorAll("[data-theme-choice]").forEach(button => {
    button.classList.toggle("active", button.dataset.themeChoice === safeTheme);
  });
}

function initTheme() {
  setTheme(localStorage.getItem(THEME_STORAGE_KEY) || document.body.dataset.theme || "dark");

  document.querySelectorAll("[data-theme-choice]").forEach(button => {
    button.addEventListener("click", () => {
      setTheme(button.dataset.themeChoice);
    });
  });
}

function getInitials(email) {
  const name = String(email || "prof").split("@")[0];
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("") || "PR";
}

function cleanProfileName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 32);
}

function loadLocalProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "{}");
    return {
      displayName: cleanProfileName(saved.displayName)
    };
  } catch (error) {
    console.warn("Profil local illisible :", error);
    return { displayName: "" };
  }
}

function saveLocalProfile(profile) {
  const safeProfile = {
    displayName: cleanProfileName(profile.displayName)
  };

  if (!safeProfile.displayName) {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    return safeProfile;
  }

  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(safeProfile));
  return safeProfile;
}

function getRoleLabel(access) {
  return access.admin ? "Admin privé" : "Compte professeur";
}

function getDisplayProfile(user, access) {
  const localProfile = loadLocalProfile();
  const displayName = localProfile.displayName || getProfDisplayName(user);
  const initials = getInitials(displayName || user?.email);
  const secondaryLabel = getProfSecondaryLabel(user);

  return {
    displayName,
    initials,
    roleLabel: getRoleLabel(access),
    secondaryLabel
  };
}

function renderProfileForm(user = window.currentProfUser, access = currentAccess) {
  const saved = loadLocalProfile();
  const profile = getDisplayProfile(user, access);

  if (profileNameInput) profileNameInput.value = saved.displayName;
  if (profilePreviewInitials) profilePreviewInitials.textContent = profile.initials;
  if (profilePreviewName) profilePreviewName.textContent = profile.displayName;
  if (profilePreviewMeta) profilePreviewMeta.textContent = profile.secondaryLabel
    ? `${profile.roleLabel} • ${profile.secondaryLabel}`
    : profile.roleLabel;
}

function updateProfile(user, access) {
  const profile = getDisplayProfile(user, access);

  if (v2UserEmail) v2UserEmail.textContent = profile.displayName;
  if (v2UserInitials) v2UserInitials.textContent = profile.initials;
  if (v2UserRole) v2UserRole.textContent = profile.secondaryLabel
    ? `${profile.roleLabel} • ${profile.secondaryLabel}`
    : profile.roleLabel;
  if (v2SessionChip) v2SessionChip.textContent = access.admin ? "Session admin" : "Session prof";
  if (adminBtn) adminBtn.hidden = access.admin !== true;
  renderProfileForm(user, access);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatCount(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : "--";
}

function isCheckedValue(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;

  if (typeof value === "string") {
    const normalized = normalizeSearch(value);
    return ["true", "oui", "yes", "fait", "done", "approved", "valide", "validé", "1"].includes(normalized);
  }

  if (typeof value === "object") {
    return [
      value.checked,
      value.done,
      value.enabled,
      value.validated,
      value.value,
      value.status
    ].some(isCheckedValue);
  }

  return false;
}

function getNestedValue(data, key) {
  return data?.[key]
    ?? data?.modules?.[key]
    ?? data?.checks?.[key]
    ?? data?.validations?.[key]
    ?? data?.sessions?.[key]
    ?? null;
}

function getWarningLevel(data) {
  const candidates = [
    data?.warningLevel,
    data?.warning?.level,
    data?.warning,
    data?.alertLevel,
    data?.alert?.level,
    data?.alert,
    data?.averto,
    data?.avertoLevel
  ];

  const raw = candidates.find(value => value != null && value !== "");
  const normalized = normalizeSearch(raw);

  if (normalized.includes("refus")) return 4;
  if (normalized.includes("3")) return 3;
  if (normalized.includes("2")) return 2;
  if (normalized.includes("1")) return 1;

  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function getCollectionSnapshot(collectionName, constraints = []) {
  const source = constraints.length
    ? query(collection(db, collectionName), ...constraints)
    : collection(db, collectionName);
  const snap = await withTimeout(
    getDocs(source),
    DASHBOARD_TIMEOUT_MS,
    `Lecture ${collectionName} trop longue.`
  );

  const rows = [];
  snap.forEach(docSnap => {
    rows.push({
      id: docSnap.id,
      data: docSnap.data() || {}
    });
  });

  return rows;
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

function getDateFromValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCursusDate(value) {
  const date = getDateFromValue(value);
  if (!date) return "";

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function getCursusLabel(settings = {}) {
  const explicitLabel = String(
    settings.cursusLabel || settings.label || settings.name || settings.title || ""
  ).trim();
  if (explicitLabel) return explicitLabel;

  const start = settings.cursusStartDisplay || settings.startDisplay || formatCursusDate(settings.cursusStartDate || settings.startDate);
  const end = settings.cursusEndDisplay || settings.endDisplay || formatCursusDate(settings.cursusEndDate || settings.endDate);
  if (start && end) return `Du ${start} au ${end}`;

  return "Cursus en cours";
}

function findEffectifLayout(rows) {
  const limit = Math.min(rows.length, 10);

  for (let rowIndex = 0; rowIndex < limit; rowIndex++) {
    const labels = (rows[rowIndex] || []).map(value => normalizeHeader(value).replace(/[^a-z0-9]+/g, ""));
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
      normalizedStudentName: normalizeStudentName(studentName)
    });
    return students;
  }, []);
}

async function loadCurrentCursus() {
  const settingsSnap = await withTimeout(
    getDoc(doc(db, STAGE_SETTINGS_COLLECTION, EFFECTIF_SETTINGS_DOC_ID)),
    DASHBOARD_TIMEOUT_MS,
    "Lecture du cursus actif trop longue."
  );

  if (!settingsSnap.exists()) {
    throw new Error("Aucun cursus actif n'est configuré.");
  }

  const settings = settingsSnap.data() || {};
  const spreadsheetId = extractSpreadsheetId(settings.spreadsheetId)
    || extractSpreadsheetId(settings.link)
    || extractSpreadsheetId(settings.url);
  const gid = String(settings.gid || extractGid(settings.link) || extractGid(settings.url) || "").trim();
  const cursusKey = buildCursusKey({ spreadsheetId, gid });

  if (!spreadsheetId || !gid || !cursusKey) {
    throw new Error("Le cursus actif est incomplet dans les réglages.");
  }

  const user = auth.currentUser || window.currentProfUser;
  if (!user?.getIdToken) {
    throw new Error("Connexion professeur requise pour charger le cursus actif.");
  }

  const idToken = await withTimeout(
    user.getIdToken(),
    DASHBOARD_TIMEOUT_MS,
    "Vérification de la session trop longue."
  );
  const csvUrl = "/api/secure-sheet?source=effectif&sheet=current";
  const response = await withTimeout(
    fetch(csvUrl, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    }),
    EFFECTIF_TIMEOUT_MS,
    "Chargement de l'effectif actif trop long."
  );

  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error || `Effectif actif impossible à lire (${response.status}).`);
  }

  const csv = await withTimeout(
    response.text(),
    EFFECTIF_TIMEOUT_MS,
    "Lecture de l'effectif actif trop longue."
  );
  const students = normalizeEffectifRows(parseCsv(csv));

  return {
    key: cursusKey,
    label: getCursusLabel(settings),
    spreadsheetId,
    gid,
    students,
    total: students.length,
    studentIds: new Set(students.map(student => student.normalizedIdUnique)),
    studentNames: new Set(students.map(student => student.normalizedStudentName).filter(Boolean))
  };
}

function matchesCurrentCursusStudent(cursus, idUnique, studentName) {
  const normalizedId = normalizeIdUnique(idUnique);
  if (normalizedId) return cursus.studentIds.has(normalizedId);

  const normalizedName = normalizeStudentName(studentName);
  return Boolean(normalizedName && cursus.studentNames.has(normalizedName));
}

function getCurrentCursusModuleRows(rows, cursus) {
  const prefix = `${cursus.key}__`;
  const byStudent = new Map();

  rows.forEach(row => {
    const data = row.data || {};
    const belongsToCursus = data.cursusKey
      ? data.cursusKey === cursus.key
      : String(row.id || "").startsWith(prefix);
    if (!belongsToCursus) return;

    const studentId = normalizeIdUnique(
      data.studentId
      || data.normalizedIdUnique
      || data.idUnique
      || String(row.id || "").slice(prefix.length)
    );
    if (!studentId || !cursus.studentIds.has(studentId)) return;

    byStudent.set(studentId, row);
  });

  return Array.from(byStudent.values());
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
}

function normalizeIdUnique(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeStudentName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildStudentKeyFromParts(idUnique, studentName) {
  const normalizedId = normalizeIdUnique(idUnique);
  if (normalizedId) return `id:${normalizedId}`;

  const normalizedName = normalizeStudentName(studentName);
  return normalizedName ? `name:${normalizedName}` : "";
}

function getField(answer, possibleNames) {
  for (const name of possibleNames) {
    const foundKey = Object.keys(answer).find(key => normalizeHeader(key) === normalizeHeader(name));
    if (foundKey) return answer[foundKey] || "";
  }

  return "";
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      currentValue += '"';
      i++;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      currentRow.push(currentValue);

      if (currentRow.some(cell => String(cell).trim() !== "")) {
        rows.push(currentRow);
      }

      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue);

  if (currentRow.some(cell => String(cell).trim() !== "")) {
    rows.push(currentRow);
  }

  return rows;
}

function rowsToAnswers(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map(header => String(header || "").trim());

  return rows
    .slice(1)
    .filter(row => row.some(cell => String(cell || "").trim() !== ""))
    .map(row => {
      const answer = {};
      const orderedFields = [];

      headers.forEach((header, index) => {
        if (!header) return;
        const value = row[index] || "";
        answer[header] = value;
        orderedFields.push({ label: header, value, index });
      });

      answer.__orderedFields = orderedFields;
      return answer;
    });
}

function buildCsvUrl(sheet) {
  const params = new URLSearchParams({
    source: sheet.source,
    sheet: sheet.id
  });

  return `/api/secure-sheet?${params.toString()}`;
}

async function fetchSheetAnswers(sheet) {
  const user = auth.currentUser;
  if (!user?.getIdToken) {
    throw new Error("Connexion professeur requise.");
  }

  const response = await withTimeout(
    fetch(buildCsvUrl(sheet), {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${await user.getIdToken(true)}`
      }
    }),
    DASHBOARD_TIMEOUT_MS,
    `Chargement ${sheet.label} trop long.`
  );

  if (!response.ok) {
    throw new Error(`Erreur Google Sheets ${sheet.label} : ${response.status}`);
  }

  const csv = await withTimeout(
    response.text(),
    DASHBOARD_TIMEOUT_MS,
    `Lecture ${sheet.label} trop longue.`
  );

  return rowsToAnswers(parseCsv(csv));
}

function getExamStudentName(answer, index) {
  const ordered = answer.__orderedFields || [];
  const byHeader = getField(answer, [
    "Prénom / Nom (RP)",
    "Prénom - Nom (RP)",
    "Prénom / Nom",
    "Prénom - Nom",
    "Nom RP",
    "Nom",
    "Pseudo"
  ]);

  if (byHeader) return byHeader;
  if (ordered[3]?.value) return ordered[3].value;
  return `Copie ${index + 1}`;
}

function buildExamAnswerKey(answer, sheetId, index) {
  const horodateur = getField(answer, ["Horodateur", "Timestamp"]);
  const nom = getExamStudentName(answer, index);
  const email = getField(answer, ["Adresse e-mail", "Email", "Adresse mail"]);

  return `${sheetId}__${index}__${horodateur}__${nom}__${email}`;
}

function buildCustomAnswerKey(answer, sheetId, index) {
  const horodateur = getField(answer, ["Horodateur"]);
  const nom = getField(answer, ["Prénom - Nom (RP)", "Prénom - Nom", "Nom"]);
  const idUnique = getField(answer, ["ID Unique", "ID"]);

  return `${sheetId}__${index}__${horodateur}__${nom}__${idUnique}`;
}

function getCustomStudentKey(answer) {
  const idUnique = getField(answer, ["ID Unique", "ID"]);
  const studentName = getField(answer, ["Prénom - Nom (RP)", "Prénom - Nom", "Nom"]);
  return buildStudentKeyFromParts(idUnique, studentName);
}

function indexStatusesByAnswerKey(rows) {
  const statuses = new Map();

  rows.forEach(({ data }) => {
    if (!data?.answerKey) return;
    statuses.set(data.answerKey, data);
  });

  return statuses;
}

async function getStatusRowsForSheets(collectionName, sheets) {
  const results = await Promise.allSettled(sheets.map(sheet => {
    return getCollectionSnapshot(collectionName, [where("sheetId", "==", sheet.id)]);
  }));

  return results.flatMap(result => result.status === "fulfilled" ? result.value : []);
}

async function loadCurrentExamSheets() {
  try {
    const settingsSnap = await withTimeout(
      getDoc(doc(db, "profSettings", "examResponses")),
      DASHBOARD_TIMEOUT_MS,
      "Lecture du réglage examen trop longue."
    );
    const data = settingsSnap.exists() ? settingsSnap.data() : {};

    return [{
      ...DEFAULT_EXAM_SHEET,
      label: String(data.label || DEFAULT_EXAM_SHEET.label)
    }];
  } catch (error) {
    console.warn("Réglage examen indisponible :", error);
    return [DEFAULT_EXAM_SHEET];
  }
}

function summarizeModules(rows, cursusTotal = rows.length) {
  let active = 0;
  let complete = 0;
  let retake = 0;
  let exam = 0;
  let warnings = 0;
  let refused = 0;

  rows.forEach(({ data }) => {
    const checkedModules = MODULE_KEYS.filter(key => isCheckedValue(getNestedValue(data, key))).length;
    if (checkedModules > 0) active++;
    if (checkedModules === MODULE_KEYS.length) complete++;
    if (isCheckedValue(getNestedValue(data, MODULE_EXAM_KEY))) exam++;
    if (isCheckedValue(getNestedValue(data, MODULE_RETAKE_KEY))) retake++;

    const warningLevel = getWarningLevel(data);
    if (warningLevel > 0) warnings++;
    if (warningLevel >= 4 || normalizeSearch(data?.status).includes("refus")) refused++;
  });

  return {
    total: cursusTotal,
    active,
    complete,
    exam,
    retake,
    warnings,
    refused,
    inactive: Math.max(cursusTotal - active, 0)
  };
}

async function summarizeCurrentExams(cursus) {
  const sheets = await loadCurrentExamSheets();
  const statusRows = await getStatusRowsForSheets("examAnswerStatuses", sheets);
  const statuses = indexStatusesByAnswerKey(statusRows);
  const sheetResults = await Promise.allSettled(sheets.map(fetchSheetAnswers));

  let total = 0;
  let approved = 0;
  let rejected = 0;
  let loadedSheets = 0;

  sheetResults.forEach((result, sheetIndex) => {
    if (result.status !== "fulfilled") {
      console.warn("Feuille examen indisponible :", sheets[sheetIndex], result.reason);
      return;
    }

    loadedSheets++;
    result.value.forEach((answer, answerIndex) => {
      const idUnique = getField(answer, ["ID Unique", "ID"]);
      const studentName = getExamStudentName(answer, answerIndex);
      if (!matchesCurrentCursusStudent(cursus, idUnique, studentName)) return;

      const answerKey = buildExamAnswerKey(answer, sheets[sheetIndex].id, answerIndex);
      const status = statuses.get(answerKey)?.status || "pending";

      total++;
      if (status === "approved") approved++;
      if (status === "rejected") rejected++;
    });
  });

  const pending = Math.max(total - approved - rejected, 0);

  return {
    total,
    approved,
    rejected,
    pending,
    unavailable: loadedSheets === 0,
    partial: loadedSheets > 0 && loadedSheets < sheets.length
  };
}

async function summarizeCurrentCustomAnswers(cursus) {
  const statusRows = await getStatusRowsForSheets("studentAnswerStatuses", CURRENT_CUSTOM_SHEETS);
  const statuses = indexStatusesByAnswerKey(statusRows);
  const sheetResults = await Promise.allSettled(CURRENT_CUSTOM_SHEETS.map(fetchSheetAnswers));
  const submittedStudents = new Set();
  const approvedStudents = new Set();

  let totalAnswers = 0;
  let approvedAnswers = 0;
  let rejectedAnswers = 0;
  let loadedSheets = 0;

  sheetResults.forEach((result, sheetIndex) => {
    if (result.status !== "fulfilled") {
      console.warn("Feuille custom indisponible :", CURRENT_CUSTOM_SHEETS[sheetIndex], result.reason);
      return;
    }

    loadedSheets++;
    result.value.forEach((answer, answerIndex) => {
      const idUnique = getField(answer, ["ID Unique", "ID"]);
      const studentName = getField(answer, ["Prénom - Nom (RP)", "Prénom - Nom", "Nom"]);
      const studentKey = getCustomStudentKey(answer);
      if (!studentKey || !matchesCurrentCursusStudent(cursus, idUnique, studentName)) return;

      const answerKey = buildCustomAnswerKey(answer, CURRENT_CUSTOM_SHEETS[sheetIndex].id, answerIndex);
      const status = statuses.get(answerKey)?.status || "pending";

      submittedStudents.add(studentKey);
      totalAnswers++;

      if (status === "approved") {
        approvedAnswers++;
        approvedStudents.add(studentKey);
      }

      if (status === "rejected") rejectedAnswers++;
    });
  });

  return {
    totalAnswers,
    totalStudents: cursus.total,
    submittedStudents: submittedStudents.size,
    approved: approvedStudents.size,
    approvedAnswers,
    rejected: rejectedAnswers,
    pending: Math.max(totalAnswers - approvedAnswers - rejectedAnswers, 0),
    unavailable: loadedSheets === 0,
    partial: loadedSheets > 0 && loadedSheets < CURRENT_CUSTOM_SHEETS.length
  };
}

async function summarizeCustomAvailability() {
  const results = await Promise.allSettled(CUSTOM_AVAILABILITY.map(async custom => {
    const snap = await withTimeout(
      getDoc(doc(db, "customAvailability", custom.id)),
      DASHBOARD_TIMEOUT_MS,
      `Lecture ${custom.label} trop longue.`
    );

    return {
      id: custom.id,
      label: custom.label,
      enabled: snap.exists() ? snap.data().enabled !== false : true
    };
  }));

  const customs = results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return {
      ...CUSTOM_AVAILABILITY[index],
      enabled: true,
      unknown: true
    };
  });

  return {
    total: CUSTOM_AVAILABILITY.length,
    open: customs.filter(custom => custom.enabled).length,
    closed: customs.filter(custom => !custom.enabled).length,
    unknown: customs.some(custom => custom.unknown),
    closedLabels: customs.filter(custom => !custom.enabled).map(custom => custom.label)
  };
}

function renderWatchList({ modules, exams, customAccess, customAnswers }) {
  const items = [];

  if (exams.pending > 0) items.push({
    label: "Examens en attente",
    value: exams.pending,
    tone: "warning",
    eyebrow: "Corrections",
    href: "prof-exam-4x91q.html"
  });
  if (customAnswers.pending > 0) items.push({
    label: "Customs à corriger",
    value: customAnswers.pending,
    tone: "warning",
    eyebrow: "Réponses élèves",
    href: "prof-rp-7x92q.html"
  });
  if (modules.warnings > 0) items.push({
    label: "Avertissements modules",
    value: modules.warnings,
    tone: "danger",
    eyebrow: "Suivi prioritaire",
    href: "prof-modules-eleves.html"
  });
  if (modules.inactive > 0) items.push({
    label: "Élèves sans module",
    value: modules.inactive,
    tone: "info",
    eyebrow: "Cursus",
    href: "prof-modules-eleves.html"
  });

  if (v2WatchCount) {
    v2WatchCount.textContent = String(items.reduce((total, item) => total + Number(item.value || 0), 0));
  }

  if (!v2WatchList) return;

  if (!items.length) {
    v2WatchList.innerHTML = `<p class="v2-watch-empty">Rien d'urgent pour le moment.</p>`;
    return;
  }

  v2WatchList.innerHTML = items.map(item => `
    <a class="v2-watch-item" data-tone="${item.tone}" href="${item.href}">
      <span class="v2-watch-copy">
        <small>${item.eyebrow}</small>
        <b>${item.label}</b>
      </span>
      <strong>${item.value}<i aria-hidden="true">›</i></strong>
    </a>
  `).join("");
}

function renderCursusStats(cursus, modules) {
  setText("v2StatModuleActiveState", `${formatCount(modules.active)} / ${formatCount(cursus.total)} de l'effectif`);
  setText("v2StatModuleCompleteState", `${formatCount(modules.complete)} / ${formatCount(cursus.total)} du cursus`);
}

function setDashboardFallback(message) {
  [
    "v2StatExamSent",
    "v2StatExamApproved",
    "v2StatModuleActive",
    "v2StatModuleComplete",
    "v2StatRetake",
    "v2StatCustomsOpen",
    "v2StatModuleTotal",
    "v2StatCustomApproved",
    "v2StatWarnings"
  ].forEach(id => setText(id, "--"));

  setText("v2StatExamPending", "Données indisponibles");
  setText("v2StatExamRejected", "Refusés : --");
  setText("v2StatCustomsState", "Réponses indisponibles");
  setText("v2StatModuleActiveState", "Cursus indisponible");
  setText("v2StatModuleCompleteState", "Cursus indisponible");
  if (v2DashboardHealth) v2DashboardHealth.textContent = "Indisponible";
  if (v2WatchCount) v2WatchCount.textContent = "--";
  if (v2WatchList) v2WatchList.innerHTML = `<p class="v2-watch-empty">${message}</p>`;
  if (v2DashboardUpdated) v2DashboardUpdated.textContent = "--";
}

async function loadDashboardStats() {
  if (dashboardStatsLoading || !window.currentProfUser) return;

  dashboardStatsLoading = true;
  try {
    const [cursusResult, modulesResult, customAccessResult] = await Promise.allSettled([
      loadCurrentCursus(),
      getCollectionSnapshot("studentModules"),
      summarizeCustomAvailability()
    ]);

    if (cursusResult.status !== "fulfilled") throw cursusResult.reason;

    const cursus = cursusResult.value;
    const allModuleRows = modulesResult.status === "fulfilled" ? modulesResult.value : [];
    const moduleRows = getCurrentCursusModuleRows(allModuleRows, cursus);
    const modules = summarizeModules(moduleRows, cursus.total);
    const customAccess = customAccessResult.status === "fulfilled"
      ? customAccessResult.value
      : { total: CUSTOM_AVAILABILITY.length, open: 0, closed: 0, unknown: true, closedLabels: [] };
    const [examsResult, customAnswersResult] = await Promise.allSettled([
      summarizeCurrentExams(cursus),
      summarizeCurrentCustomAnswers(cursus)
    ]);
    const exams = examsResult.status === "fulfilled"
      ? examsResult.value
      : { total: 0, approved: 0, rejected: 0, pending: 0, unavailable: true, partial: false };
    const customAnswers = customAnswersResult.status === "fulfilled"
      ? customAnswersResult.value
      : {
        totalAnswers: 0,
        totalStudents: modules.total || 0,
        submittedStudents: 0,
        approved: 0,
        approvedAnswers: 0,
        rejected: 0,
        pending: 0,
        unavailable: true,
        partial: false
      };

    setText("v2StatExamSent", formatCount(exams.total));
    setText("v2StatExamApproved", formatCount(exams.approved));
    setText("v2StatExamPending", exams.unavailable ? "Feuille indisponible" : `En attente : ${formatCount(exams.pending)}`);
    setText("v2StatExamRejected", `Refusés : ${formatCount(exams.rejected)}`);

    setText("v2StatModuleActive", formatCount(modules.active));
    setText("v2StatModuleComplete", formatCount(modules.complete));
    setText("v2StatRetake", formatCount(modules.retake));
    setText("v2StatModuleTotal", formatCount(modules.total));
    setText("v2StatWarnings", formatCount(modules.warnings));

    setText("v2StatCustomsOpen", `${customAnswers.submittedStudents}/${customAnswers.totalStudents || modules.total || 0}`);
    setText("v2StatCustomsState", customAnswers.unavailable
      ? "Feuilles indisponibles"
      : `${customAnswers.totalAnswers} réponse(s) reçue(s)`
    );
    setText("v2StatCustomApproved", formatCount(customAnswers.approved));
    renderCursusStats(cursus, modules);

    const health = exams.pending || modules.inactive || modules.warnings || customAccess.closed ? "À vérifier" : "À jour";
    if (v2DashboardHealth) v2DashboardHealth.textContent = health;
    if (v2DashboardUpdated) {
      v2DashboardUpdated.textContent = new Date().toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    renderWatchList({ modules, exams, customAccess, customAnswers });
  } catch (error) {
    console.warn("Tableau de bord impossible à charger :", error);
    setDashboardFallback("Impossible de charger les statistiques pour le moment.");
  } finally {
    dashboardStatsLoading = false;
  }
}

function showLogin() {
  if (loginTransition) {
    loginTransition.hidden = true;
    loginTransition.classList.remove("active");
  }

  profDashboard?.classList.remove("dashboard-visible");
  loginSection?.removeAttribute("hidden");
  profDashboard?.setAttribute("hidden", "");

  if (loginSection) loginSection.style.display = "grid";
  if (profDashboard) profDashboard.style.display = "none";

  setLoginLoading(false);
}

function showDashboardInstant() {
  if (loginTransition) {
    loginTransition.hidden = true;
    loginTransition.classList.remove("active");
  }

  loginSection?.setAttribute("hidden", "");
  profDashboard?.removeAttribute("hidden");

  if (loginSection) loginSection.style.display = "none";
  if (profDashboard) profDashboard.style.display = "grid";

  requestAnimationFrame(() => {
    profDashboard?.classList.add("dashboard-visible");
    loadDashboardStats();
  });

  setLoginLoading(false);
  window.scrollTo(0, 0);
}

async function showDashboardWithTransition() {
  loginSection?.classList.add("leaving");

  await wait(220);

  if (loginTransition) {
    loginTransition.hidden = false;
    requestAnimationFrame(() => loginTransition.classList.add("active"));
  }

  await wait(760);

  loginSection?.setAttribute("hidden", "");
  profDashboard?.removeAttribute("hidden");

  if (loginSection) loginSection.style.display = "none";
  if (profDashboard) profDashboard.style.display = "grid";

  await wait(220);

  loginTransition?.classList.remove("active");

  await wait(220);

  if (loginTransition) loginTransition.hidden = true;

  requestAnimationFrame(() => {
    profDashboard?.classList.add("dashboard-visible");
    loadDashboardStats();
  });

  setLoginLoading(false);
  window.scrollTo(0, 0);
}

async function getUserAccess(user) {
  return getProfAccess(user, async () => {
    if (!user?.email) return { role: null, admin: false };

    const snap = await withTimeout(
      getDoc(doc(db, "users", user.email)),
      AUTH_TIMEOUT_MS,
      "Vérification du compte trop longue."
    );

    if (!snap.exists()) return { role: null, admin: false };
    const data = snap.data();
    return { role: data.role || null, admin: data.admin === true };
  });
}

function isAllowed(access) {
  return isProfAllowed(access);
}

async function refuseAccess(user) {
  console.warn("Accès refusé :", user?.profActorId || user?.email || "identité inconnue");

  window.currentProfUser = null;

  try {
    await signOut(auth);
  } catch (error) {
    console.error("Erreur déconnexion après refus :", error);
  }

  if (loginError) {
    loginError.textContent = "Accès refusé. Ce compte n'est pas autorisé sur l'espace professeur.";
  }

  loginSection?.classList.remove("leaving");
  showLogin();
}

function resetHomeState() {
  document.getElementById("v2HomePanel")?.removeAttribute("hidden");
  const inlineCorrections = document.getElementById("inlineCorrections");
  if (inlineCorrections) inlineCorrections.hidden = true;
  if (settingsPanel) settingsPanel.hidden = true;

  document.querySelectorAll(".v2-nav-item").forEach(item => item.classList.remove("active"));
  homeButtons.forEach(button => button.classList.add("active"));
  loadDashboardStats();
}

function initV2Actions() {
  homeButtons.forEach(button => {
    button.addEventListener("click", resetHomeState);
  });

  document.getElementById("openCorrectionsBtn")?.addEventListener("click", () => {
    document.getElementById("v2HomePanel")?.setAttribute("hidden", "");
    if (settingsPanel) settingsPanel.hidden = true;
    document.querySelectorAll(".v2-nav-item").forEach(item => item.classList.remove("active"));
    document.getElementById("openCorrectionsBtn")?.classList.add("active");
  });

  settingsBtn?.addEventListener("click", () => {
    document.getElementById("v2HomePanel")?.setAttribute("hidden", "");
    const inlineCorrections = document.getElementById("inlineCorrections");
    if (inlineCorrections) inlineCorrections.hidden = true;
    if (settingsPanel) settingsPanel.hidden = false;

    document.querySelectorAll(".v2-nav-item").forEach(item => item.classList.remove("active"));
    settingsBtn.classList.add("active");
    renderProfileForm();
  });

  closeSettingsBtn?.addEventListener("click", resetHomeState);

  profileForm?.addEventListener("submit", event => {
    event.preventDefault();

    const saved = saveLocalProfile({
      displayName: profileNameInput?.value
    });

    if (profileNameInput) profileNameInput.value = saved.displayName;
    updateProfile(window.currentProfUser, currentAccess);

    if (profileStatus) {
      profileStatus.textContent = "Profil enregistré sur ce navigateur.";
      profileStatus.dataset.tone = "ok";
    }
  });

  resetProfileBtn?.addEventListener("click", () => {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    updateProfile(window.currentProfUser, currentAccess);

    if (profileStatus) {
      profileStatus.textContent = "Profil local réinitialisé.";
      profileStatus.dataset.tone = "info";
    }
  });

  profileNameInput?.addEventListener("input", () => {
    const displayName = cleanProfileName(profileNameInput.value) || getProfDisplayName(window.currentProfUser);

    if (profilePreviewInitials) profilePreviewInitials.textContent = getInitials(displayName);
    if (profilePreviewName) profilePreviewName.textContent = displayName;
    if (profilePreviewMeta) {
      const roleLabel = getRoleLabel(currentAccess);
      const secondaryLabel = getProfSecondaryLabel(window.currentProfUser);
      profilePreviewMeta.textContent = secondaryLabel
        ? `${roleLabel} • ${secondaryLabel}`
        : roleLabel;
    }

    if (profileStatus) profileStatus.textContent = "";
  });

}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function initCommandSearch() {
  if (!v2CommandInput) return;

  const commands = [
    {
      label: "Corrigés",
      terms: ["corrige", "correction", "custom"],
      run: () => document.getElementById("openCorrectionsBtn")?.click()
    },
    {
      label: "Réponses élèves",
      terms: ["reponse", "eleve", "custom rendu"],
      run: () => goPage("prof-rp-7x92q.html")
    },
    {
      label: "Examens",
      terms: ["examen", "copie", "note"],
      run: () => goPage("prof-exam-4x91q.html")
    },
    {
      label: "Modules élèves",
      terms: ["module", "pointage", "cursus"],
      run: () => goPage("prof-modules-eleves.html")
    },
    {
      label: "Customs élèves",
      terms: ["custom eleve", "ouvrir", "fermer", "acces"],
      run: () => goPage("prof-customs-eleves.html")
    },
    {
      label: "Paramètres",
      terms: ["profil", "nom", "initiales", "compte"],
      run: () => settingsBtn?.click()
    }
  ];

  function findCommand() {
    const value = normalizeSearch(v2CommandInput.value);
    if (!value) return null;

    return commands.find(command => {
      return normalizeSearch(command.label).includes(value)
        || command.terms.some(term => normalizeSearch(term).includes(value));
    }) || null;
  }

  v2CommandInput.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    const command = findCommand();
    if (!command) return;
    event.preventDefault();
    command.run();
  });
}

function initAuth() {
  showLogin();
  setLoginLoading(false);
  setDiscordLoading(false);

  emailLoginSummary?.addEventListener("click", event => {
    event.preventDefault();
    if (!emailLoginDetails) return;

    const shouldOpen = !emailLoginDetails.open;
    emailLoginDetails.open = shouldOpen;
    emailLoginSummary.setAttribute("aria-expanded", String(shouldOpen));

    if (shouldOpen) {
      requestAnimationFrame(() => document.getElementById("email")?.focus({ preventScroll: true }));
    }
  });

  const authParams = new URLSearchParams(window.location.search);
  const discordError = authParams.get("discord_error");
  const discordComplete = authParams.get("discord") === "complete";
  const discordWarning = authParams.get("discord_warning");

  const discordErrorMessages = {
    discord_cancelled: "Connexion Discord annulée.",
    session_expired: "La connexion Discord a expiré. Recommence.",
    access_denied: "Accès refusé. Cet ID Discord n'est pas autorisé.",
    not_member: "Accès refusé. Ce compte n'est pas présent sur le serveur Discord.",
    sheet_invalid: "La feuille des autorisations est mal configurée.",
    sheet_unavailable: "La liste des professeurs est momentanément indisponible.",
    discord_exchange: "Discord n'a pas pu valider la connexion.",
    discord_unavailable: "Discord est momentanément indisponible.",
    configuration: "La connexion Discord n'est pas complètement configurée.",
    unknown: "La connexion Discord a échoué. Réessaie."
  };

  if (discordError && loginError) {
    loginError.textContent = discordErrorMessages[discordError] || discordErrorMessages.unknown;
  }

  function cleanDiscordQuery() {
    const url = new URL(window.location.href);
    ["discord", "discord_error", "discord_warning"].forEach(key => url.searchParams.delete(key));
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  onAuthStateChanged(auth, async user => {
    if (isManualLoginTransition) return;

    if (!user) {
      window.currentProfUser = null;
      showLogin();
      return;
    }

    try {
      currentAccess = await getUserAccess(user);
    } catch (error) {
      console.error("Erreur accès utilisateur :", error);
      if (loginError) loginError.textContent = "Impossible de vérifier le compte.";
      await refuseAccess(user);
      return;
    }

    if (!isAllowed(currentAccess)) {
      await refuseAccess(user);
      return;
    }

    window.currentProfUser = user;
    updateProfile(user, currentAccess);
    showDashboardInstant();
  });

  loginBtn?.addEventListener("click", event => {
    event.preventDefault();
    if (!loginForm?.checkValidity()) {
      loginForm?.reportValidity();
      return;
    }

    if (typeof loginForm.requestSubmit === "function") {
      loginForm.requestSubmit();
    } else {
      loginForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  });

  loginForm?.addEventListener("submit", async event => {
    event.preventDefault();

    const email = document.getElementById("email")?.value.trim() || "";
    const password = document.getElementById("password")?.value || "";

    if (loginError) loginError.textContent = "";
    setLoginLoading(true);
    isManualLoginTransition = true;

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      currentAccess = await getUserAccess(user);

      if (!isAllowed(currentAccess)) {
        isManualLoginTransition = false;
        await refuseAccess(user);
        return;
      }

      window.currentProfUser = user;
      updateProfile(user, currentAccess);
      await showDashboardWithTransition();
    } catch (error) {
      console.error("Erreur Firebase :", error.code, error.message);

      if (loginError) {
        if (error.code === "auth/invalid-credential") {
          loginError.textContent = "Email ou mot de passe incorrect.";
        } else if (error.code === "auth/too-many-requests") {
          loginError.textContent = "Trop de tentatives. Réessaie plus tard.";
        } else if (error.code === "auth/network-request-failed") {
          loginError.textContent = "Erreur réseau.";
        } else {
          loginError.textContent = "Erreur de connexion.";
        }
      }

      loginSection?.classList.remove("leaving");
      setLoginLoading(false);
    } finally {
      isManualLoginTransition = false;
    }
  });

  discordLoginBtn?.addEventListener("click", () => {
    if (loginError) loginError.textContent = "";
    setDiscordLoading(true);
    window.location.assign("/api/auth/discord/start");
  });

  if (discordComplete) {
    (async () => {
      if (loginError) loginError.textContent = "Connexion Discord en cours...";
      setDiscordLoading(true);
      isManualLoginTransition = true;

      try {
        const response = await fetch("/api/auth/discord/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store"
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload.customToken) {
          throw new Error(payload.error || "Connexion Discord impossible.");
        }

        const credential = await signInWithCustomToken(auth, payload.customToken);
        const user = credential.user;
        currentAccess = await getUserAccess(user);

        if (!isAllowed(currentAccess)) {
          await refuseAccess(user);
          return;
        }

        window.currentProfUser = user;
        updateProfile(user, currentAccess);
        if (loginError) loginError.textContent = discordWarning === "role_sync"
          ? "Connexion validée. Le rôle Discord n'a pas pu être synchronisé automatiquement."
          : "";
        cleanDiscordQuery();
        await showDashboardWithTransition();
      } catch (error) {
        console.error("Connexion Discord impossible :", error);
        if (loginError) loginError.textContent = error.message || discordErrorMessages.unknown;
        cleanDiscordQuery();
        showLogin();
      } finally {
        isManualLoginTransition = false;
        setDiscordLoading(false);
      }
    })();
  } else if (discordError) {
    cleanDiscordQuery();
  }

  logoutBtn?.addEventListener("click", async () => {
    await signOut(auth);
    window.currentProfUser = null;
    showLogin();
  });
}

initTheme();
initV2Actions();
initCommandSearch();
initAuth();
