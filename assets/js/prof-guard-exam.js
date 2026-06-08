import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const DEFAULT_EXAM_SHEET_ID = "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY";
const DEFAULT_EXAM_GID = "282279229";
const DEFAULT_EXAM_LABEL = "Réponses formulaire";

const guardLoader = document.getElementById("guardLoader");
const protectedContent = document.getElementById("protectedContent");

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

function extractSpreadsheetId(value) {
  const text = String(value || "").trim();
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
  return "";
}

function installExamSheetFetchProxy() {
  if (window.__examSheetFetchProxyInstalled) return;
  window.__examSheetFetchProxyInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    const settings = window.__examResponsesSettings;
    const sourceUrl = typeof input === "string" ? input : input?.url || "";

    if (settings?.spreadsheetId && sourceUrl.includes(`/spreadsheets/d/${DEFAULT_EXAM_SHEET_ID}/export`)) {
      const nextUrl = new URL(sourceUrl);
      nextUrl.pathname = `/spreadsheets/d/${settings.spreadsheetId}/export`;
      nextUrl.searchParams.set("gid", settings.gid || DEFAULT_EXAM_GID);

      if (typeof input === "string") {
        return originalFetch(nextUrl.toString(), init);
      }

      if (input instanceof Request) {
        return originalFetch(new Request(nextUrl.toString(), input), init);
      }
    }

    return originalFetch(input, init);
  };
}

function normalizeQuestionPoints(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value).reduce((points, [label, score]) => {
    const cleanLabel = String(label || "").trim();
    const cleanScore = Number(score);

    if (cleanLabel && Number.isFinite(cleanScore)) {
      points[cleanLabel] = Math.max(0, cleanScore);
    }

    return points;
  }, {});
}

async function loadExamResponsesSettings() {
  try {
    const settingsRef = doc(db, "profSettings", "examResponses");
    const settingsSnap = await getDoc(settingsRef);
    const data = settingsSnap.exists() ? settingsSnap.data() : {};

    window.__examResponsesSettings = {
      spreadsheetId: extractSpreadsheetId(data.spreadsheetUrl) || extractSpreadsheetId(data.spreadsheetId) || DEFAULT_EXAM_SHEET_ID,
      gid: String(data.gid || DEFAULT_EXAM_GID),
      label: String(data.label || DEFAULT_EXAM_LABEL),
      questionPoints: normalizeQuestionPoints(data.questionPoints)
    };
  } catch (error) {
    console.warn("Réglages examens indisponibles :", error);
    window.__examResponsesSettings = {
      spreadsheetId: DEFAULT_EXAM_SHEET_ID,
      gid: DEFAULT_EXAM_GID,
      label: DEFAULT_EXAM_LABEL,
      questionPoints: {}
    };
  }

  installExamSheetFetchProxy();
}

function applyExamLabel() {
  const label = window.__examResponsesSettings?.label;
  if (!label) return;

  requestAnimationFrame(() => {
    const tab = document.querySelector(".student-sheet-tab[data-sheet='exam-form-1']");
    if (tab) tab.textContent = label;
  });
}

async function getUserRole(user) {
  if (!user?.email) return null;

  try {
    const userRef = doc(db, "users", user.email);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return null;

    return userSnap.data().role || null;
  } catch (error) {
    console.error("Erreur lecture rôle utilisateur :", error);
    return null;
  }
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
        <p class="intro">
          Ce compte n’est pas autorisé à accéder à la correction des examens.
        </p>

        <button class="btn secondary" onclick="window.location.href='espace-prof.html'">
          Retour connexion
        </button>
      </div>
    `;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "espace-prof.html";
    return;
  }

  const role = await getUserRole(user);

  if (role !== "prof") {
    console.warn("Accès refusé page examens :", user.email, "role =", role);

    window.currentProfUser = null;

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erreur déconnexion après refus :", error);
    }

    showAccessDenied();
    return;
  }

  window.currentProfUser = user;

  if (guardLoader) {
    guardLoader.hidden = true;
    guardLoader.style.display = "none";
  }

  if (protectedContent) {
    protectedContent.hidden = false;
    protectedContent.style.display = "block";

    requestAnimationFrame(() => {
      protectedContent.classList.add("dashboard-visible");
    });
  }

  try {
    await loadExamResponsesSettings();
    await import("./exam-loader-x8p2.js?v=9030");
    await import("./exam-grading-settings.js?v=1001");
    applyExamLabel();
  } catch (error) {
    console.error("Erreur chargement loader examens :", error);

    const sheetStatus = document.getElementById("sheetStatus");

    if (sheetStatus) {
      sheetStatus.innerHTML = `
        <div class="inline-error-box">
          <h4>Erreur de chargement</h4>
          <p>Impossible de charger le module des examens.</p>
        </div>
      `;
    }
  }
});
