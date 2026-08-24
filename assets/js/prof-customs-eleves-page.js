import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getProfAccess, getProfActorId, getProfDisplayName } from "./prof-identity.js?v=1";

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
const workspace = document.querySelector(".customs-v2-workspace");
const summary = document.getElementById("customsSummary");
const reloadBtn = document.getElementById("reloadCustomsAccess");
const userInitials = document.getElementById("customsUserInitials");
const userEmail = document.getElementById("customsUserEmail");
const userRole = document.getElementById("customsUserRole");

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
    workspace?.classList.add("is-leaving");
    window.setTimeout(() => window.location.assign(target), 190);
  });
});

function getInitials(value) {
  return String(value || "prof")
    .split("@")[0]
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("") || "PR";
}

function getLocalDisplayName() {
  try {
    const profile = JSON.parse(window.localStorage.getItem("profV2Profile") || "{}");
    return String(profile.displayName || "").trim().replace(/\s+/g, " ").slice(0, 32);
  } catch (error) {
    console.warn("Profil local indisponible :", error);
    return "";
  }
}

function setUserPill(user, access = currentAccess) {
  const displayName = getLocalDisplayName() || getProfDisplayName(user);
  if (userInitials) userInitials.textContent = getInitials(displayName);
  if (userEmail) userEmail.textContent = displayName;
  if (userRole) userRole.textContent = access.admin ? "Admin privé" : "Compte professeur";
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

function renderSummary() {
  if (!summary) return;

  const total = CUSTOMS.length;
  const openCount = CUSTOMS.filter(custom => states[custom.id] !== false).length;
  const closedCount = total - openCount;

  summary.innerHTML = `
    <div class="customs-v2-summary-item">
      <span>Total</span>
      <strong>${total}</strong>
    </div>
    <div class="customs-v2-summary-item is-open">
      <span>Ouverts</span>
      <strong>${openCount}</strong>
    </div>
    <div class="customs-v2-summary-item is-closed">
      <span>Fermés</span>
      <strong>${closedCount}</strong>
    </div>
  `;
}

async function loadAccess(user) {
  return getProfAccess(user, async () => {
    if (!user?.email) return { role: null, admin: false };
    const snap = await withTimeout(
      getDoc(doc(db, "users", user.email)),
      FIRESTORE_TIMEOUT_MS,
      "Verification du compte trop longue."
    );
    if (!snap.exists()) return { role: null, admin: false };
    const data = snap.data();
    return { role: data.role || null, admin: data.admin === true };
  });
}

function renderRows() {
  if (!content) return;

  renderSummary();

  content.innerHTML = `
    <div class="customs-v2-grid">
      ${CUSTOMS.map(custom => {
        const enabled = states[custom.id] !== false;
        const customNumber = String(CUSTOMS.indexOf(custom) + 1).padStart(2, "0");
        const statusLabel = enabled ? "Visible" : "Masqué";

        return `
          <article class="customs-access-row customs-v2-card ${enabled ? "is-open" : "is-closed"}${lastChangedId === custom.id ? " is-updated" : ""}" data-custom-row="${custom.id}">
            <div class="customs-v2-card-head">
              <span class="customs-v2-mark">${customNumber}</span>
              <span class="customs-v2-state" data-enabled="${enabled}">${statusLabel}</span>
            </div>

            <div class="customs-v2-card-body">
              <h2>${custom.label}</h2>
              <p>${custom.vehicle}</p>
            </div>

            <div class="customs-row-actions">
              <button type="button" class="customs-toggle-btn" data-custom-id="${custom.id}" data-enabled="${enabled}">
                ${enabled ? "Fermer" : "Ouvrir"}
              </button>
              <a class="customs-test-link" href="${custom.page}?guardState=${enabled ? "open" : "closed"}&guardTest=${Date.now()}">
                Tester
              </a>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderMessage(title, message) {
  if (!content) return;

  content.innerHTML = `
    <div class="customs-v2-message">
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
  const custom = CUSTOMS.find(item => item.id === customId);

  try {
    button.disabled = true;
    setStatus("Sauvegarde...");

    await withTimeout(
      setDoc(doc(db, "customAvailability", customId), {
        enabled: nextEnabled,
        updatedAt: serverTimestamp(),
        updatedBy: getProfActorId(currentUser)
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
      `${custom?.label || "Custom"} ${nextEnabled ? "ouverte" : "fermée"} pour les élèves.`,
      "ok"
    );
  } catch (error) {
    console.warn("Sauvegarde custom impossible :", error);
    setStatus("Sauvegarde impossible. Réessaie dans quelques instants.", "error");
  } finally {
    button.disabled = false;
  }
}

async function refreshCustomAccess() {
  if (!canManageCustoms()) return;

  try {
    if (reloadBtn) reloadBtn.disabled = true;
    setStatus("Actualisation...");
    await loadStates();
    lastChangedId = "";
    renderRows();
    setStatus("Réglages à jour.", "ok");
  } catch (error) {
    console.warn("Actualisation customs impossible :", error);
    setStatus("Actualisation impossible. Réessaie dans quelques instants.", "error");
  } finally {
    if (reloadBtn) reloadBtn.disabled = false;
  }
}

content?.addEventListener("click", event => {
  const button = event.target.closest("[data-custom-id]");
  if (button) toggleCustom(button);
});

reloadBtn?.addEventListener("click", refreshCustomAccess);

onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  setUserPill(user);

  if (!user) {
    renderMessage("Connexion requise", "Connecte-toi d'abord sur l'espace prof.");
    setStatus("", "");
    return;
  }

  try {
    currentAccess = await loadAccess(user);
    setUserPill(user, currentAccess);
  } catch (error) {
    console.warn("Verification compte impossible :", error);
    renderMessage("Vérification impossible", "Impossible de vérifier ton compte pour le moment.");
    setStatus("Réessaie dans quelques instants.", "error");
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
    setStatus("Chargement impossible. Réessaie dans quelques instants.", "error");
  }
});

