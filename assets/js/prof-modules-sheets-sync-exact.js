import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
const GOOGLE_CLIENT_ID_STORAGE_KEY = "prof_modules_google_client_id";
const DEFAULT_GOOGLE_CLIENT_ID = "156801758179-0v4oqbhm3pa6fcpd18kqqqu6k8dst3i3.apps.googleusercontent.com";
const GOOGLE_CLIENT_ID_PATTERN = /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i;
const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const MODULE_TARGETS = [
  { key: "module1", label: "Module 1", checkCol: "E", dateCol: "F", checkIndex: 4, dateIndex: 5 },
  { key: "module2", label: "Module 2", checkCol: "G", dateCol: "H", checkIndex: 6, dateIndex: 7 },
  { key: "module3", label: "Module 3", checkCol: "I", dateCol: "J", checkIndex: 8, dateIndex: 9 },
  { key: "module4", label: "Module 4", checkCol: "K", dateCol: "L", checkIndex: 10, dateIndex: 11 },
  { key: "exam", label: "Examen", checkCol: "W", dateCol: "X", checkIndex: 22, dateIndex: 23 },
  { key: "retakeExam", label: "Rattrapage", checkCol: "Y", dateCol: "Z", checkIndex: 24, dateIndex: 25 }
];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentAccess = { role: null, admin: false };
let exactSyncButton = null;
let currentCursusKey = "";

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

function formatDateForSheets(value) {
  const normalized = normalizeDateValue(value);
  if (!normalized) return "";

  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function quoteSheetName(title) {
  return `'${String(title || "").replaceAll("'", "''")}'`;
}

function getEmptyChecks() {
  return MODULE_TARGETS.reduce((checks, target) => {
    checks[target.key] = false;
    return checks;
  }, {});
}

function getEmptyDates() {
  return MODULE_TARGETS.reduce((dates, target) => {
    dates[target.key] = "";
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

  MODULE_TARGETS.forEach(target => {
    checks[target.key] = checks[target.key] === true;
    dates[target.key] = normalizeDateValue(dates[target.key] || data.completedAt?.[target.key] || "");
  });

  return { checks, dates };
}

function setStatus(message = "", tone = "") {
  const status = document.getElementById("modulesStatus");
  if (!status) return;

  status.textContent = message;
  status.dataset.tone = tone;
}

function showLoader(message = "Chargement...") {
  const loader = document.getElementById("modulesLoader");
  const text = document.getElementById("modulesLoaderText");

  if (text) text.textContent = message;
  if (loader) loader.hidden = false;
}

function hideLoader() {
  const loader = document.getElementById("modulesLoader");
  if (loader) loader.hidden = true;
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
    console.warn("Accès sync Sheets exact indisponible :", error);
    return { role: null, admin: false };
  }
}

async function loadEffectifSettings() {
  const snap = await getDoc(doc(db, STAGE_SETTINGS_COLLECTION, EFFECTIF_SETTINGS_DOC_ID));

  if (!snap.exists()) {
    throw new Error("Aucun effectif n'est configuré.");
  }

  const data = snap.data();
  const spreadsheetId = extractSpreadsheetId(data.spreadsheetId) || extractSpreadsheetId(data.link) || extractSpreadsheetId(data.url);
  const gid = String(data.gid || extractGid(data.link) || extractGid(data.url) || "").trim();

  if (!spreadsheetId || !gid) {
    throw new Error("Le lien effectif ou le GID est incomplet dans le panneau admin.");
  }

  currentCursusKey = buildCursusKey({ spreadsheetId, gid });
  return { spreadsheetId, gid, cursusKey: currentCursusKey };
}

async function loadStudentProgress() {
  const progressById = new Map();
  const snap = await getDocs(collection(db, STUDENT_MODULES_COLLECTION));

  snap.forEach(docSnap => {
    const data = docSnap.data() || {};
    if (!isCurrentCursusModuleDoc(docSnap.id, data)) return;

    const studentId = getStudentIdFromModuleDoc(docSnap.id, data);
    if (!studentId) return;

    progressById.set(studentId, normalizeProgress(data));
  });

  return progressById;
}

function getGoogleClientId() {
  const stored = localStorage.getItem(GOOGLE_CLIENT_ID_STORAGE_KEY) || "";
  const cleanStored = stored.trim();

  if (GOOGLE_CLIENT_ID_PATTERN.test(cleanStored)) return cleanStored;

  if (cleanStored) localStorage.removeItem(GOOGLE_CLIENT_ID_STORAGE_KEY);
  localStorage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, DEFAULT_GOOGLE_CLIENT_ID);
  return DEFAULT_GOOGLE_CLIENT_ID;
}

function waitForGoogleIdentity() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve();
        return;
      }

      if (Date.now() - startedAt > 9000) {
        clearInterval(timer);
        reject(new Error("Google Identity n'a pas chargé. Vérifie la connexion ou les bloqueurs du navigateur."));
      }
    }, 100);
  });
}

async function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) return;

  if (!document.getElementById("googleIdentityScript")) {
    const script = document.createElement("script");
    script.id = "googleIdentityScript";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  await waitForGoogleIdentity();
}

async function requestGoogleSheetsToken() {
  await loadGoogleIdentityScript();
  const clientId = getGoogleClientId();

  return new Promise((resolve, reject) => {
    let tokenClient;

    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_SHEETS_SCOPE,
        callback: response => {
          if (response?.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }

          if (!response?.access_token) {
            reject(new Error("Google n'a pas renvoyé de jeton d'accès."));
            return;
          }

          resolve(response.access_token);
        },
        error_callback: error => {
          reject(new Error(error?.message || error?.type || "Connexion Google annulée."));
        }
      });
    } catch (error) {
      reject(error);
      return;
    }

    tokenClient.requestAccessToken({ prompt: "" });
  });
}

async function googleSheetsRequest(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error?.message || `Erreur Google Sheets (${response.status}).`);
  }

  return data;
}

async function loadSheetValues(accessToken, settings) {
  const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(settings.spreadsheetId)}?fields=sheets(properties(sheetId,title))`;
  const metadata = await googleSheetsRequest(metadataUrl, accessToken);
  const sheet = (metadata.sheets || []).find(item => String(item?.properties?.sheetId) === String(settings.gid));

  if (!sheet?.properties?.title) {
    throw new Error(`Aucune feuille ne correspond au GID ${settings.gid}.`);
  }

  const sheetTitle = sheet.properties.title;
  const range = `${quoteSheetName(sheetTitle)}!A1:Z`;
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(settings.spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
  const response = await googleSheetsRequest(valuesUrl, accessToken);

  return {
    sheetTitle,
    values: response.values || []
  };
}

function findHeaderRow(values) {
  const limit = Math.min(values.length, 12);

  for (let index = 0; index < limit; index++) {
    const labels = (values[index] || []).map(normalizeHeaderLabel);
    const hasId = labels.some(label => label.includes("idunique") || (label.includes("id") && label.includes("unique")));
    const hasModule1 = labels[4]?.includes("module1");
    const hasExam = labels[22]?.includes("examen") || labels[24]?.includes("examen");

    if (hasId && (hasModule1 || hasExam)) return index;
  }

  return 0;
}

function validateExactHeaders(values, headerRowIndex) {
  const labels = (values[headerRowIndex] || []).map(normalizeHeaderLabel);
  const expected = [
    [4, "module1", "E"], [5, "date", "F"],
    [6, "module2", "G"], [7, "date", "H"],
    [8, "module3", "I"], [9, "date", "J"],
    [10, "module4", "K"], [11, "date", "L"],
    [22, "examen", "W"], [23, "date", "X"],
    [24, "examen", "Y"], [25, "date", "Z"]
  ];

  const missing = expected
    .filter(([index, label]) => !labels[index]?.includes(label))
    .map(([, label, column]) => `${column} (${label})`);

  if (missing.length) {
    const confirmed = confirm(
      `Attention : certains en-têtes ne ressemblent pas au modèle attendu :\n\n` +
      `${missing.join(", ")}\n\n` +
      `Je peux quand même écrire sur les colonnes fixes E/F, G/H, I/J, K/L, W/X, Y/Z. Continuer ?`
    );

    if (!confirmed) {
      throw new Error("Synchronisation annulée : en-têtes Google Sheets différents du modèle attendu.");
    }
  }
}

function getStudentRows(values, headerRowIndex) {
  const labels = (values[headerRowIndex] || []).map(normalizeHeaderLabel);
  const idColumn = labels.findIndex(label => label.includes("idunique") || (label.includes("id") && label.includes("unique")));
  const nameColumn = labels.findIndex(label => label.includes("nom") || label.includes("eleve"));

  if (idColumn < 0) {
    throw new Error("Colonne ID Unique introuvable dans la feuille.");
  }

  const studentRows = [];
  const seenIds = new Set();

  values.slice(headerRowIndex + 1).forEach((row, offset) => {
    const rowIndex = headerRowIndex + 1 + offset;
    const idUnique = String(row?.[idColumn] || "").trim();
    const normalizedIdUnique = normalizeIdUnique(idUnique);

    if (!normalizedIdUnique || seenIds.has(normalizedIdUnique)) return;

    seenIds.add(normalizedIdUnique);
    studentRows.push({
      rowIndex,
      idUnique,
      normalizedIdUnique,
      studentName: String(row?.[nameColumn] || "").trim()
    });
  });

  if (!studentRows.length) {
    throw new Error("Aucune ligne élève avec ID Unique n'a été trouvée.");
  }

  return studentRows;
}

function buildUpdates(sheetTitle, studentRows, progressById) {
  const quotedTitle = quoteSheetName(sheetTitle);
  const updates = [];
  let rowsWithProgress = 0;

  studentRows.forEach(student => {
    const progress = progressById.get(student.normalizedIdUnique) || normalizeProgress({});
    if (progressById.has(student.normalizedIdUnique)) rowsWithProgress++;

    MODULE_TARGETS.forEach(target => {
      const rowNumber = student.rowIndex + 1;
      const checked = progress.checks?.[target.key] === true;
      const dateValue = formatDateForSheets(progress.dates?.[target.key] || "");

      updates.push({
        range: `${quotedTitle}!${target.checkCol}${rowNumber}`,
        values: [[checked]]
      });

      updates.push({
        range: `${quotedTitle}!${target.dateCol}${rowNumber}`,
        values: [[dateValue]]
      });
    });
  });

  return {
    updates,
    rowsWithProgress
  };
}

async function syncModulesToGoogleSheetsExact() {
  if (exactSyncButton?.disabled) return;

  if (!currentAccess.admin) {
    alert("Accès admin requis.");
    return;
  }

  try {
    exactSyncButton.disabled = true;
    setStatus("Connexion Google...", "info");
    showLoader("Connexion à Google Sheets...");

    const accessToken = await requestGoogleSheetsToken();

    showLoader("Lecture de la feuille Google Sheets...");
    const settings = await loadEffectifSettings();
    const progressById = await loadStudentProgress();
    const { sheetTitle, values } = await loadSheetValues(accessToken, settings);
    const headerRowIndex = findHeaderRow(values);

    validateExactHeaders(values, headerRowIndex);

    const studentRows = getStudentRows(values, headerRowIndex);
    const { updates, rowsWithProgress } = buildUpdates(sheetTitle, studentRows, progressById);
    const columnsText = "Module 1 E/F • Module 2 G/H • Module 3 I/J • Module 4 K/L • Examen W/X • Rattrapage Y/Z";

    hideLoader();

    const shouldWrite = confirm(
      `Feuille prête.\n\n` +
      `Feuille : ${sheetTitle}\n` +
      `Élèves trouvés : ${studentRows.length}\n` +
      `Élèves avec progression : ${rowsWithProgress}\n` +
      `Colonnes utilisées : ${columnsText}\n\n` +
      `Les colonnes C "Obtenu" et D "Validation" ne seront pas touchées.\n\n` +
      `Lancer l'écriture des coches et dates dans Google Sheets ?`
    );

    if (!shouldWrite) {
      setStatus("Synchronisation annulée.", "info");
      return;
    }

    showLoader("Écriture dans Google Sheets...");
    setStatus("Écriture Sheets...", "info");

    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(settings.spreadsheetId)}/values:batchUpdate`;
    await googleSheetsRequest(updateUrl, accessToken, {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: updates
      })
    });

    setStatus(`Sheets synchronisé (${studentRows.length} élèves).`, "ok");
    alert("Synchronisation Google Sheets terminée.");
  } catch (error) {
    console.error("Synchronisation Google Sheets exacte impossible :", error);
    setStatus("Synchronisation impossible.", "error");
    alert("Synchronisation impossible. Vérifie les réglages de la feuille puis réessaie.");
  } finally {
    if (exactSyncButton) exactSyncButton.disabled = false;
    hideLoader();
  }
}

function bindExactSyncButton(button) {
  if (!button || button.dataset.exactSheetsSyncBound === "true") return;

  exactSyncButton = button;
  button.dataset.exactSheetsSyncBound = "true";
  button.title = "Synchroniser vers les colonnes E/F, G/H, I/J, K/L, W/X, Y/Z";
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    syncModulesToGoogleSheetsExact();
  }, true);
}

function installExactSyncBinding() {
  if (!currentAccess.admin) return;

  const button = document.getElementById("syncSheetsBtn");
  if (button) bindExactSyncButton(button);
}

onAuthStateChanged(auth, async user => {
  currentAccess = user ? await getUserAccess(user) : { role: null, admin: false };

  if (!currentAccess.admin) return;

  installExactSyncBinding();
  setTimeout(installExactSyncBinding, 300);
  setTimeout(installExactSyncBinding, 900);
});

const observer = new MutationObserver(installExactSyncBinding);
observer.observe(document.documentElement, { childList: true, subtree: true });
