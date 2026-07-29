import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
  { id: "sentinelClassic", label: "Custom Facile", page: "custom-facile.html" },
  { id: "argento2f", label: "Custom Moyen", page: "custom-moyen.html" },
  { id: "cypher", label: "Custom Difficile", page: "custom-difficile.html" }
];

const FIRESTORE_TIMEOUT_MS = 6500;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function injectAvailabilityStyles() {
  if (document.getElementById("customAvailabilityStyles")) return;

  const style = document.createElement("style");
  style.id = "customAvailabilityStyles";
  style.textContent = `
    .custom-closed-page {
      min-height: calc(100vh - 120px);
      display: grid;
      place-items: center;
      padding: 48px 20px;
    }

    .custom-closed-box {
      width: min(720px, 100%);
      padding: 34px;
      border: 1px solid rgba(214,180,106,.22);
      border-radius: 8px;
      background:
        linear-gradient(145deg, rgba(214,180,106,.10), transparent 36%),
        rgba(255,255,255,.035);
      box-shadow: 0 34px 100px rgba(0,0,0,.42);
    }

    .custom-closed-box .kicker {
      color: var(--gold2);
    }

    .custom-closed-box h1 {
      margin: 8px 0 12px;
      font-size: clamp(42px, 7vw, 76px);
      line-height: .95;
      letter-spacing: 0;
    }

    .custom-closed-box p {
      margin: 0 0 22px;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.5;
    }
  `;

  document.head.appendChild(style);
}

function readLocalState(customId) {
  try {
    const raw = window.localStorage.getItem(`customAvailability:${customId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return typeof parsed?.enabled === "boolean" ? parsed.enabled : null;
  } catch (error) {
    console.warn("Lecture locale disponibilité custom impossible :", error);
    return null;
  }
}

function saveLocalState(customId, enabled) {
  try {
    window.localStorage.setItem(
      `customAvailability:${customId}`,
      JSON.stringify({ enabled, updatedAt: Date.now() })
    );
  } catch (error) {
    console.warn("Sauvegarde locale disponibilité custom impossible :", error);
  }
}

function getCurrentCustom() {
  const pageName = window.location.pathname.split("/").pop();
  const bodyCustomId = document.body?.dataset?.customAvailabilityId || "";

  if (bodyCustomId) {
    return CUSTOMS.find(custom => custom.id === bodyCustomId) || null;
  }

  return CUSTOMS.find(custom => custom.page === pageName) || null;
}

function readForcedState(custom) {
  const currentCustom = getCurrentCustom();
  if (currentCustom?.id !== custom.id) return null;

  const forced = new URLSearchParams(window.location.search).get("guardState");
  if (forced === "closed") return false;
  if (forced === "open") return true;
  return null;
}

function getLinkedElements(custom) {
  const explicit = [...document.querySelectorAll(`[data-custom-link="${custom.id}"]`)];
  const fallback = [...document.querySelectorAll("nav button, .modules .card")].filter(element => {
    const text = element.textContent.trim();
    const onclick = element.getAttribute("onclick") || "";
    return text.includes(custom.label) || onclick.includes(custom.page);
  });

  return [...new Set([...explicit, ...fallback])];
}

function setClosedState(custom, closed) {
  getLinkedElements(custom).forEach(element => {
    element.classList.toggle("custom-link-closed", closed);
    element.classList.toggle("custom-closed-link", false);
    element.classList.toggle("custom-closed-card", false);
    element.setAttribute("aria-disabled", closed ? "true" : "false");
    element.dataset.customAvailabilityState = closed ? "closed" : "open";

    if (closed) {
      element.setAttribute("title", "Fiche fermée pour les élèves");
    } else {
      element.removeAttribute("title");
    }
  });
}

function bindClickGuard() {
  document.addEventListener(
    "click",
    event => {
      const blockedLink = event.target.closest("[data-custom-link].custom-link-closed, nav button.custom-link-closed, .modules .card.custom-link-closed");
      if (!blockedLink) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      blockedLink.classList.remove("custom-link-blocked-pulse");
      void blockedLink.offsetWidth;
      blockedLink.classList.add("custom-link-blocked-pulse");
    },
    true
  );
}

function showClosedPage(custom) {
  const main = document.querySelector("main");
  if (!main || main.dataset.customClosedRendered === "true") return;

  main.dataset.customClosedRendered = "true";
  main.innerHTML = `
    <section class="custom-closed-page">
      <div class="custom-closed-box">
        <p class="kicker">Fiche indisponible</p>
        <h1>${custom.label}</h1>
        <p>Cette fiche est fermée pour le moment. Elle sera réouverte par les professeurs quand le module sera actif.</p>
        <button type="button" class="btn secondary" onclick="goPage('../index.html')">Retour à l'accueil</button>
      </div>
    </section>
  `;

  const loader = document.getElementById("loader");
  if (loader) {
    loader.classList.add("hide");
    loader.style.display = "none";
    loader.style.pointerEvents = "none";
  }
}

function applyAvailability(custom, enabled) {
  setClosedState(custom, !enabled);

  const currentCustom = getCurrentCustom();
  if (currentCustom?.id === custom.id && enabled === false) {
    showClosedPage(custom);
  }
}

async function loadAvailability(custom) {
  const forcedEnabled = readForcedState(custom);
  if (forcedEnabled !== null) {
    applyAvailability(custom, forcedEnabled);
    return;
  }

  const localEnabled = readLocalState(custom.id);
  if (localEnabled !== null) {
    applyAvailability(custom, localEnabled);
  }

  const availabilityRef = doc(db, "customAvailability", custom.id);

  try {
    const snapshot = await withTimeout(
      getDoc(availabilityRef),
      FIRESTORE_TIMEOUT_MS,
      "Lecture Firestore trop longue."
    );

    const enabled = snapshot.exists() ? snapshot.data().enabled !== false : true;
    saveLocalState(custom.id, enabled);
    applyAvailability(custom, enabled);
  } catch (error) {
    console.warn("Disponibilité custom indisponible :", error);
  }

  onSnapshot(
    availabilityRef,
    snapshot => {
      const enabled = snapshot.exists() ? snapshot.data().enabled !== false : true;
      saveLocalState(custom.id, enabled);
      applyAvailability(custom, enabled);
    },
    error => {
      console.warn("Ecoute disponibilité custom indisponible :", error);
    }
  );
}

function startCustomAvailability() {
  injectAvailabilityStyles();
  bindClickGuard();
  CUSTOMS.forEach(custom => loadAvailability(custom));
}

startCustomAvailability();
