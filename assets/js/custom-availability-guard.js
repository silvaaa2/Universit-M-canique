const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const CUSTOM_BY_PAGE = {
  "custom-facile.html": {
    id: "sentinelClassic",
    label: "Custom Facile"
  },
  "custom-moyen.html": {
    id: "argento2f",
    label: "Custom Moyen"
  },
  "custom-difficile.html": {
    id: "cypher",
    label: "Custom Difficile"
  }
};

const pageName = window.location.pathname.split("/").pop();
const bodyCustomId = document.body?.dataset?.customAvailabilityId || "";
const bodyCustomLabel = document.body?.dataset?.customAvailabilityLabel || "";
const currentCustom = bodyCustomId
  ? { id: bodyCustomId, label: bodyCustomLabel || pageName || "Custom" }
  : CUSTOM_BY_PAGE[pageName];
const forcedGuardState = new URLSearchParams(window.location.search).get("guardState");
const FIRESTORE_TIMEOUT_MS = 6500;

if (currentCustom) {
  startAvailabilityGuard(currentCustom);
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function formatFirebaseError(error) {
  const code = error?.code ? `${error.code} - ` : "";
  return `${code}${error?.message || "Erreur inconnue"}`;
}

function readLocalState(custom) {
  try {
    const raw = window.localStorage.getItem(`customAvailability:${custom.id}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (typeof parsed?.enabled !== "boolean") return null;

    return parsed.enabled;
  } catch (error) {
    console.warn("Lecture locale custom impossible :", error);
    return null;
  }
}

function readForcedState() {
  if (forcedGuardState === "closed") return false;
  if (forcedGuardState === "open") return true;
  return null;
}

function injectStyles() {
  if (document.getElementById("customAvailabilityGuardStyles")) return;

  const style = document.createElement("style");
  style.id = "customAvailabilityGuardStyles";
  style.textContent = `
    .custom-closed-overlay {
      position: fixed;
      inset: 0;
      z-index: 15000;
      display: grid;
      place-items: center;
      padding: 24px;
      background:
        radial-gradient(circle at 50% 28%, rgba(214,180,106,.16), transparent 34%),
        rgba(0,0,0,.88);
      backdrop-filter: blur(16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .22s ease;
    }

    .custom-closed-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .custom-closed-overlay[hidden] {
      display: none !important;
    }

    .custom-closed-card {
      width: min(560px, 100%);
      padding: 28px;
      border: 1px solid rgba(214,180,106,.22);
      border-radius: 10px;
      background:
        linear-gradient(145deg, rgba(214,180,106,.12), rgba(255,255,255,.035)),
        rgba(10,10,10,.98);
      box-shadow:
        0 35px 120px rgba(0,0,0,.68),
        0 0 55px rgba(214,180,106,.08);
      transform: translateY(14px) scale(.98);
      transition: transform .22s ease;
    }

    .custom-closed-overlay.active .custom-closed-card {
      transform: translateY(0) scale(1);
    }

    .custom-closed-card h1 {
      margin: 0 0 10px;
      color: var(--text);
      font-size: clamp(38px, 7vw, 66px);
      line-height: .9;
      letter-spacing: 0;
    }

    .custom-closed-card p {
      margin: 0;
      color: var(--muted);
      font-weight: 800;
      line-height: 1.55;
    }

    .custom-closed-card .kicker {
      margin-bottom: 10px;
      color: var(--gold2);
    }

    .custom-closed-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 22px;
    }

    body.custom-locked main {
      filter: blur(3px);
      pointer-events: none;
      user-select: none;
    }

    .custom-availability-badge {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 16000;
      max-width: min(360px, calc(100vw - 36px));
      padding: 10px 13px;
      border: 1px solid rgba(214,180,106,.24);
      border-radius: 999px;
      background: rgba(14,14,14,.92);
      box-shadow: 0 18px 55px rgba(0,0,0,.42);
      color: var(--muted);
      font-size: 12px;
      font-weight: 1000;
      line-height: 1.35;
      backdrop-filter: blur(16px);
    }

    .custom-availability-badge[data-tone="ok"] {
      border-color: rgba(134,239,172,.34);
      color: #86efac;
    }

    .custom-availability-badge[data-tone="closed"] {
      border-color: rgba(248,113,113,.38);
      color: #fca5a5;
    }

    .custom-availability-badge[data-tone="error"],
    .custom-availability-badge[data-tone="warn"] {
      border-color: rgba(251,191,36,.42);
      color: #fde68a;
    }
  `;

  document.head.appendChild(style);
}

function ensureBadge(custom) {
  injectStyles();

  let badge = document.getElementById("customAvailabilityBadge");
  if (badge) return badge;

  badge = document.createElement("div");
  badge.id = "customAvailabilityBadge";
  badge.className = "custom-availability-badge";
  badge.textContent = `${custom.label} · vérification Firestore...`;
  document.body.appendChild(badge);
  return badge;
}

function setBadge(custom, message, tone = "") {
  const badge = ensureBadge(custom);
  badge.textContent = `${custom.label} · ${message}`;
  badge.dataset.tone = tone;
}

function ensureOverlay(custom) {
  injectStyles();

  let overlay = document.getElementById("customClosedOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "customClosedOverlay";
  overlay.className = "custom-closed-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="custom-closed-card">
      <p class="kicker">Fiche fermée</p>
      <h1>${custom.label}</h1>
      <p>
        Cette fiche custom n'est pas disponible pour les élèves pour le moment.
        Un professeur pourra la rouvrir depuis l'espace prof.
      </p>
      <div class="custom-closed-actions">
        <button type="button" class="btn primary" data-custom-go-home>Accueil</button>
      </div>
    </div>
  `;

  overlay.querySelector("[data-custom-go-home]")?.addEventListener("click", () => {
    window.location.assign("../index.html");
  });

  document.body.appendChild(overlay);
  return overlay;
}

function setCustomLocked(custom, locked) {
  const overlay = ensureOverlay(custom);
  document.body.classList.toggle("custom-locked", locked);

  if (locked) {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("active"));
    document.querySelectorAll("a, button, input, select, textarea").forEach(element => {
      if (!overlay.contains(element)) {
        element.dataset.customGuardDisabled = "true";
        element.setAttribute("aria-disabled", "true");
      }
    });
    return;
  }

  overlay.classList.remove("active");
  window.setTimeout(() => {
    overlay.hidden = true;
  }, 220);

  document.querySelectorAll("[data-custom-guard-disabled]").forEach(element => {
    element.removeAttribute("aria-disabled");
    delete element.dataset.customGuardDisabled;
  });
}

function applyAvailability(custom, snapshot) {
  const enabled = snapshot.exists() ? snapshot.data().enabled !== false : true;
  setBadge(custom, enabled ? "ouvert aux élèves" : "fermé aux élèves", enabled ? "ok" : "closed");
  setCustomLocked(custom, !enabled);
}

async function startAvailabilityGuard(custom) {
  const forcedEnabled = readForcedState();

  if (forcedEnabled !== null) {
    setBadge(custom, forcedEnabled ? "ouvert aux élèves (test)" : "fermé aux élèves (test)", forcedEnabled ? "ok" : "closed");
    setCustomLocked(custom, !forcedEnabled);
    return;
  }

  const localEnabled = readLocalState(custom);

  if (localEnabled !== null) {
    setBadge(custom, localEnabled ? "ouvert aux élèves (local)" : "fermé aux élèves (local)", localEnabled ? "ok" : "closed");
    setCustomLocked(custom, !localEnabled);
  }

  setBadge(custom, "vérification Firestore...");

  try {
    const [appModule, firestoreModule] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
    ]);

    const { initializeApp, getApps, getApp } = appModule;
    const { getFirestore, doc, getDoc, onSnapshot } = firestoreModule;
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const availabilityRef = doc(db, "customAvailability", custom.id);

    withTimeout(
      getDoc(availabilityRef),
      FIRESTORE_TIMEOUT_MS,
      "Lecture Firestore trop longue."
    )
      .then(snapshot => applyAvailability(custom, snapshot))
      .catch(error => {
        console.warn("Lecture directe disponibilite custom indisponible :", error);
        const fallbackEnabled = readLocalState(custom);
        if (fallbackEnabled !== null) {
          setBadge(custom, fallbackEnabled ? "ouvert aux élèves (secours local)" : "fermé aux élèves (secours local)", fallbackEnabled ? "ok" : "closed");
          setCustomLocked(custom, !fallbackEnabled);
          return;
        }

        setBadge(custom, `lecture impossible : ${formatFirebaseError(error)}`, "error");
        setCustomLocked(custom, false);
      });

    onSnapshot(
      availabilityRef,
      snapshot => applyAvailability(custom, snapshot),
      error => {
        console.warn("Disponibilite custom indisponible :", error);
        setBadge(custom, `écoute impossible : ${formatFirebaseError(error)}`, "error");
        setCustomLocked(custom, false);
      }
    );
  } catch (error) {
    console.warn("Chargement Firebase custom impossible :", error);
    const fallbackEnabled = readLocalState(custom);
    if (fallbackEnabled !== null) {
      setBadge(custom, fallbackEnabled ? "ouvert aux élèves (secours local)" : "fermé aux élèves (secours local)", fallbackEnabled ? "ok" : "closed");
      setCustomLocked(custom, !fallbackEnabled);
      return;
    }

    setBadge(custom, `Firebase impossible : ${formatFirebaseError(error)}`, "error");
    setCustomLocked(custom, false);
  }
}

