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

const DEFAULT_EXAM_GID = "282279229";
const DEFAULT_EXAM_LABEL = "Réponses formulaire";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
  const settingsRef = doc(db, "profSettings", "examResponses");
  const settingsSnap = await getDoc(settingsRef);
  const data = settingsSnap.exists() ? settingsSnap.data() : {};
  const spreadsheetId = extractSpreadsheetId(data.spreadsheetUrl) || extractSpreadsheetId(data.spreadsheetId);

  if (!spreadsheetId) {
    throw new Error("Aucun lien Google Sheet examen n'est configuré.");
  }

  window.__examResponsesSettings = {
    spreadsheetId,
    gid: String(data.gid || DEFAULT_EXAM_GID),
    label: String(data.label || DEFAULT_EXAM_LABEL),
    questionPoints: normalizeQuestionPoints(data.questionPoints)
  };
}

async function getUserAccess(user) {
  if (!user?.email) return { role: null, isAdmin: false };

  try {
    const userRef = doc(db, "users", user.email);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return { role: null, isAdmin: false };

    const data = userSnap.data();
    return {
      role: data.role || null,
      isAdmin: data.admin === true
    };
  } catch (error) {
    console.error("Erreur lecture accès utilisateur :", error);
    return { role: null, isAdmin: false };
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
          Ce compte n'est pas autorisé à accéder à la correction des examens.
        </p>
        <button class="btn secondary" onclick="window.location.href='espace-prof.html'">
          Retour connexion
        </button>
      </div>
    `;
  }
}

function showExamConfigError(message) {
  const sheetStatus = document.getElementById("sheetStatus");

  if (sheetStatus) {
    sheetStatus.innerHTML = `
      <div class="inline-error-box">
        <h4>Réglage examen manquant</h4>
        <p>${String(message || "Impossible de charger les réglages examens.")}</p>
      </div>
    `;
  }
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "espace-prof.html";
    return;
  }

  const access = await getUserAccess(user);
  const allowed = access.role === "prof" || access.isAdmin;

  if (!allowed) {
    console.warn("Accès refusé page examens :", user.email, "role =", access.role);
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
    await import("./exam-loader-secure.js?v=1002");
    await import("./exam-discord-send.js?v=1002");
  } catch (error) {
    console.error("Erreur chargement examens :", error);
    showExamConfigError(error.message);
  }
});
