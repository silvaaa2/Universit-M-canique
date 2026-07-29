import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
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

const CUSTOMS = [
  { id: "sentinelClassic", label: "Custom Facile", vehicle: "Sentinel Classic", page: "custom-facile.html" },
  { id: "argento2f", label: "Custom Moyen", vehicle: "Argento 2F", page: "custom-moyen.html" },
  { id: "cypher", label: "Custom Difficile", vehicle: "Cypher", page: "custom-difficile.html" }
];

const FIRESTORE_TIMEOUT_MS = 6500;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const content = document.getElementById("customsAccessContent");
const status = document.getElementById("customsAccessStatus");
const card = document.querySelector(".customs-access-card");

let currentUser = null;
let currentAccess = { role: null, admin: false };
let states = {};
let lastChangedId = "";

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function setStatus(message = "", tone = "") {
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

document.querySelectorAll("[data-customs-close]").forEach(button => {
  button.addEventListener("click", () => {
    const target = button.dataset.customsClose || "espace-prof.html";
    card?.classList.add("is-leaving");
    window.setTimeout(() => window.location.assign(target), 190);
  });
});

function formatFirebaseError(error) {
  const code = error?.code ? `${error.code} - ` : "";
  return `${code}${error?.message || "Erreur inconnue"}`;
}

function saveLocalState(customId, enabled) {
  try {
    window.localStorage.setItem(
      `customAvailability:${customId}`,
      JSON.stringify({ enabled, updatedAt: Date.now() })
    );
  } catch (error) {
    console.warn("Sauvegarde locale custom impossible :", error);
  }
}

function canManageCustoms() {
  return currentAccess.role === "prof" || currentAccess.admin === true;
}

async function loadAccess(user) {
  if (!user?.email) return { role: null, admin: false };

  const snap = await withTimeout(
    getDoc(doc(db, "users", user.email)),
    FIRESTORE_TIMEOUT_MS,
    "Verification du compte trop longue."
  );

  if (!snap.exists()) return { role: null, admin: false };

  const data = snap.data();
  return {
    role: data.role || null,
    admin: data.admin === true
  };
}

function renderRows() {
  if (!content) return;

  content.innerHTML = `
    <div class="customs-access-list">
      ${CUSTOMS.map(custom => {
        const enabled = states[custom.id] !== false;

        return `
          <div class="customs-access-row${lastChangedId === custom.id ? " is-updated" : ""}" data-custom-row="${custom.id}">
            <div>
              <h2>${custom.label}</h2>
              <p>${custom.vehicle} · customAvailability/${custom.id}</p>
            </div>
            <div class="customs-row-actions">
              <button type="button" class="customs-toggle-btn" data-custom-id="${custom.id}" data-enabled="${enabled}">
                ${enabled ? "Ouvert aux élèves" : "Fermé aux élèves"}
              </button>
              <a class="customs-test-link" href="${custom.page}?guardState=${enabled ? "open" : "closed"}&guardTest=${Date.now()}">
                Tester la fiche
              </a>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderMessage(title, message) {
  if (!content) return;

  content.innerHTML = `
    <div class="customs-access-row" style="grid-template-columns: 1fr;">
      <div>
        <h2>${title}</h2>
        <p>${message}</p>
      </div>
    </div>
  `;
}

async function loadStates() {
  const nextStates = {};

  await Promise.all(CUSTOMS.map(async custom => {
    const snap = await withTimeout(
      getDoc(doc(db, "customAvailability", custom.id)),
      FIRESTORE_TIMEOUT_MS,
      "Lecture des reglages customs trop longue."
    );

    nextStates[custom.id] = snap.exists() ? snap.data().enabled !== false : true;
  }));

  states = nextStates;
}

async function toggleCustom(button) {
  const customId = button.dataset.customId || "";
  const nextEnabled = button.dataset.enabled !== "true";

  try {
    button.disabled = true;
    setStatus("Sauvegarde...");

    await withTimeout(
      setDoc(doc(db, "customAvailability", customId), {
        enabled: nextEnabled,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.email || null
      }, { merge: true }),
      FIRESTORE_TIMEOUT_MS,
      "Sauvegarde des reglages customs trop longue."
    );

    states[customId] = nextEnabled;
    lastChangedId = customId;
    saveLocalState(customId, nextEnabled);
    renderRows();
    window.setTimeout(() => {
      document.querySelector(`[data-custom-row="${customId}"]`)?.classList.remove("is-updated");
    }, 620);
    setStatus(
      `Document écrit : customAvailability/${customId} = ${nextEnabled ? "enabled true" : "enabled false"}.`,
      "ok"
    );
  } catch (error) {
    console.warn("Sauvegarde custom impossible :", error);
    setStatus(`Sauvegarde impossible : ${formatFirebaseError(error)}`, "error");
  } finally {
    button.disabled = false;
  }
}

content?.addEventListener("click", event => {
  const button = event.target.closest("[data-custom-id]");
  if (button) toggleCustom(button);
});

onAuthStateChanged(auth, async user => {
  currentUser = user || null;

  if (!user) {
    renderMessage("Connexion requise", "Connecte-toi d'abord sur l'espace prof.");
    setStatus("", "");
    return;
  }

  try {
    currentAccess = await loadAccess(user);
  } catch (error) {
    console.warn("Verification compte impossible :", error);
    renderMessage("Vérification impossible", "Firebase ne répond pas pour vérifier ton compte.");
    setStatus(`Vérification impossible : ${formatFirebaseError(error)}`, "error");
    return;
  }

  if (!canManageCustoms()) {
    renderMessage("Accès refusé", "Cette page est réservée aux comptes professeur et admin.");
    setStatus("", "");
    return;
  }

  try {
    setStatus("Chargement des réglages...");
    await loadStates();
    renderRows();
    setStatus("Réglages chargés.", "ok");
  } catch (error) {
    console.warn("Lecture reglages impossible :", error);
    states = {};
    renderRows();
    setStatus(`Lecture impossible : ${formatFirebaseError(error)}`, "error");
  }
});
