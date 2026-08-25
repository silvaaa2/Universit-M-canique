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
import { getProfAccess, isProfAllowed } from "./prof-identity.js?v=2";

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

function installExamDiscordSendProxy(user) {
  if (window.__examDiscordSendProxyInstalled) return;
  window.__examDiscordSendProxyInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const sourceUrl = typeof input === "string" ? input : input?.url || "";

    if (!sourceUrl.startsWith("https://discord.com/api/webhooks/")) {
      return originalFetch(input, init);
    }

    if (!user?.getIdToken) {
      throw new Error("Connexion professeur requise pour envoyer sur Discord.");
    }

    const idToken = await user.getIdToken(true);
    let body = init?.body;

    if (!body && input instanceof Request) {
      body = await input.clone().text();
    }

    return originalFetch("/api/discord-exam-results", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`
      },
      body: typeof body === "string" ? body : JSON.stringify(body || {})
    });
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
      label: String(data.label || DEFAULT_EXAM_LABEL),
      questionPoints: normalizeQuestionPoints(data.questionPoints)
    };
  } catch (error) {
    console.warn("Réglages examens indisponibles :", error);
    window.__examResponsesSettings = {
      label: DEFAULT_EXAM_LABEL,
      questionPoints: {}
    };
  }
}

function applyExamLabel() {
  const label = window.__examResponsesSettings?.label;
  if (!label) return;

  requestAnimationFrame(() => {
    const tab = document.querySelector(".student-sheet-tab[data-sheet='exam-form-1']");
    if (tab) tab.textContent = label;
  });
}

async function getUserAccess(user) {
  return getProfAccess(user, async () => {
    if (!user?.email) return { role: null, admin: false };
    const userRef = doc(db, "users", user.email);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return { role: null, admin: false };
    const data = userSnap.data();
    return { role: data.role || null, admin: data.admin === true };
  });
}

function isInlineGuard() {
  return Boolean(guardLoader && protectedContent && guardLoader.closest("#protectedContent") === protectedContent);
}

function showAccessDenied() {
  const inlineGuard = isInlineGuard();

  if (protectedContent && !inlineGuard) {
    protectedContent.hidden = true;
    protectedContent.style.display = "none";
  } else if (protectedContent) {
    protectedContent.hidden = false;
    protectedContent.style.display = "block";
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

  const access = await getUserAccess(user);

  if (!isProfAllowed(access)) {
    console.warn("Accès refusé page examens :", user.profActorId || user.email, "role =", access.role);

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
  installExamDiscordSendProxy(user);

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
    await import("./secure-exam-loader.js?v=9");
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

