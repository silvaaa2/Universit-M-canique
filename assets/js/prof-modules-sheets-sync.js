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

const MODULE_COLUMNS = [
  { key: "module1", label: "Module 1", match: label => label === "module1" || label.includes("module1") },
  { key: "module2", label: "Module 2", match: label => label === "module2" || label.includes("module2") },
  { key: "module3", label: "Module 3", match: label => label === "module3" || label.includes("module3") },
  { key: "module4", label: "Module 4", match: label => label === "module4" || label.includes("module4") },
  { key: "exam", label: "Examen", match: label => label === "examen" || label.startsWith("examen") },
  { key: "retakeExam", label: "Rattrapage", match: label => label.includes("rattrapage") }
];

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentAccess = { role: null, admin: false };
let syncButton = null;

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

function columnIndexToA1(index) {
  let value = index + 1;
  let label = "";

  while (value > 0) {
    const mod = (value - 1) % 26;
    label = String.fromCharCode(65 + mod) + label;
    value = Math.floor((value - mod) / 26);
  }

  return label;
}

function quoteSheetName(title) {
  return `'${String(title || "").replaceAll("'", "''")}'`;
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
    console.warn("Accès Google Sheets modules indisponible :", error);
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

  return { spreadsheetId, gid };
}

async function loadStudentProgress() {
  const progressById = new Map();
  const snap = await getDocs(collection(db, STUDENT_MODULES_COLLECTION));

  snap.forEach(docSnap => {
    progressById.set(docSnap.id, normalizeProgress(docSnap.data()));
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
  const range = `${quoteSheetName(sheetTitle)}!A1:ZZ`;
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
    const hasModule = labels.some(label => label.includes("module1") || label.includes("examen") || label.includes("rattrapage"));

    if (hasId && hasModule) return index;
  }

  return 0;
}

function findDateColumn(labels, statusColumn) {
  if (labels[statusColumn + 1]?.includes("date")) return statusColumn + 1;

  for (let index = statusColumn + 1; index < Math.min(labels.length, statusColumn + 4); index++) {
    if (labels[index]?.includes("date")) return index;
  }

  return statusColumn + 1;
}

function findUnusedHeader(labels, usedColumns, matcher, startAt = 0) {
  for (let index = startAt; index < labels.length; index++) {
    if (usedColumns.has(index)) continue;
    if (matcher(labels[index], index)) return index;
  }

  return -1;
}

function detectSyncLayout(values) {
  if (!values.length) {
    throw new Error("La feuille Google Sheets est vide.");
  }

  const headerRowIndex = findHeaderRow(values);
  const headers = values[headerRowIndex] || [];
  const labels = headers.map(normalizeHeaderLabel);
  const idColumn = labels.findIndex(label => label.includes("idunique") || (label.includes("id") && label.includes("unique")));
  const nameColumn = labels.findIndex(label => label.includes("nom") || label.includes("eleve"));

  if (idColumn < 0) {
    throw new Error("Colonne ID Unique introuvable dans la feuille.");
  }

  const usedColumns = new Set([idColumn]);
  const moduleTargets = new Map();

  MODULE_COLUMNS.forEach(column => {
    let statusColumn = findUnusedHeader(labels, usedColumns, column.match);

    if (column.key === "retakeExam" && statusColumn < 0) {
      const examTarget = moduleTargets.get("exam");
      statusColumn = findUnusedHeader(labels, usedColumns, label => label === "examen" || label.startsWith("examen"), (examTarget?.statusColumn || 0) + 1);
    }

    if (statusColumn < 0) return;

    usedColumns.add(statusColumn);
    moduleTargets.set(column.key, {
      statusColumn,
      dateColumn: findDateColumn(labels, statusColumn)
    });
  });

  const missingColumns = MODULE_COLUMNS
    .filter(column => !moduleTargets.has(column.key))
    .map(column => column.label);

  if (missingColumns.length) {
    throw new Error(`Colonnes introuvables : ${missingColumns.join(", ")}.`);
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

  return {
    headerRowIndex,
    idColumn,
    nameColumn,
    moduleTargets,
    studentRows
  };
}

function buildUpdates(sheetTitle, layout, progressById) {
  const quotedTitle = quoteSheetName(sheetTitle);
  const updates = [];
  let rowsWithProgress = 0;

  layout.studentRows.forEach(student => {
    const progress = progressById.get(student.normalizedIdUnique) || normalizeProgress({});
    if (progressById.has(student.normalizedIdUnique)) rowsWithProgress++;

    MODULE_COLUMNS.forEach(column => {
      const target = layout.moduleTargets.get(column.key);
      const rowNumber = student.rowIndex + 1;
      const checked = progress.checks?.[column.key] === true;
      const dateValue = formatDateForSheets(progress.dates?.[column.key] || "");

      updates.push({
        range: `${quotedTitle}!${columnIndexToA1(target.statusColumn)}${rowNumber}`,
        values: [[checked]]
      });

      updates.push({
        range: `${quotedTitle}!${columnIndexToA1(target.dateColumn)}${rowNumber}`,
        values: [[dateValue]]
      });
    });
  });

  return {
    updates,
    rowsWithProgress
  };
}

function getDetectedColumnsText(layout) {
  return MODULE_COLUMNS.map(column => {
    const target = layout.moduleTargets.get(column.key);
    return `${column.label} ${columnIndexToA1(target.statusColumn)}/${columnIndexToA1(target.dateColumn)}`;
  }).join(" • ");
}

async function syncModulesToGoogleSheets() {
  if (syncButton?.disabled) return;

  if (!currentAccess.admin) {
    alert("Accès admin requis.");
    return;
  }

  try {
    syncButton.disabled = true;
    setStatus("Connexion Google...", "info");
    showLoader("Connexion à Google Sheets...");

    const accessToken = await requestGoogleSheetsToken();

    showLoader("Lecture de la feuille Google Sheets...");
    const settings = await loadEffectifSettings();
    const progressById = await loadStudentProgress();
    const { sheetTitle, values } = await loadSheetValues(accessToken, settings);
    const layout = detectSyncLayout(values);
    const { updates, rowsWithProgress } = buildUpdates(sheetTitle, layout, progressById);
    const columnsText = getDetectedColumnsText(layout);

    hideLoader();

    const shouldWrite = confirm(
      `Feuille prête.\n\n` +
      `Feuille : ${sheetTitle}\n` +
      `Élèves trouvés : ${layout.studentRows.length}\n` +
      `Élèves avec progression : ${rowsWithProgress}\n` +
      `Colonnes détectées : ${columnsText}\n\n` +
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

    setStatus(`Sheets synchronisé (${layout.studentRows.length} élèves).`, "ok");
    alert("Synchronisation Google Sheets terminée.");
  } catch (error) {
    console.error("Synchronisation Google Sheets impossible :", error);
    setStatus("Synchronisation impossible.", "error");
    alert("Synchronisation impossible. Vérifie les réglages de la feuille puis réessaie.");
  } finally {
    if (syncButton) syncButton.disabled = false;
    hideLoader();
  }
}

function bindSyncButton(button) {
  if (!button || button.dataset.sheetsSyncBound === "true") return;

  button.dataset.sheetsSyncBound = "true";
  button.addEventListener("click", syncModulesToGoogleSheets);
}

function installSyncButton() {
  if (!currentAccess.admin) return;

  const existingButton = document.getElementById("syncSheetsBtn");
  if (existingButton) {
    syncButton = existingButton;
    bindSyncButton(syncButton);
    return;
  }

  const reloadButton = document.getElementById("reloadModulesBtn");
  if (!reloadButton) return;

  syncButton = document.createElement("button");
  syncButton.type = "button";
  syncButton.id = "syncSheetsBtn";
  syncButton.className = "modules-reload-btn modules-sheets-btn";
  syncButton.textContent = "Sync Sheets";
  bindSyncButton(syncButton);

  reloadButton.insertAdjacentElement("afterend", syncButton);
}

function removeSyncButton() {
  document.getElementById("syncSheetsBtn")?.remove();
  syncButton = null;
}

onAuthStateChanged(auth, async user => {
  currentUser = user || null;

  if (!user) {
    currentAccess = { role: null, admin: false };
    removeSyncButton();
    return;
  }

  currentAccess = await getUserAccess(user);

  if (currentAccess.admin) {
    installSyncButton();
    setTimeout(installSyncButton, 400);
  } else {
    removeSyncButton();
  }
});
