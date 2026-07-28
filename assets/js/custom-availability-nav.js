import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

function injectAvailabilityStyles() {
  if (document.getElementById("customAvailabilityStyles")) return;

  const style = document.createElement("style");
  style.id = "customAvailabilityStyles";
  style.textContent = `
    .custom-closed-link {
      opacity: .42 !important;
      cursor: not-allowed !important;
      filter: grayscale(.75);
    }

    button.custom-closed-link {
      pointer-events: auto;
    }

    .custom-closed-card {
      position: relative;
      opacity: .52;
      cursor: not-allowed !important;
      filter: grayscale(.6);
    }

    .custom-closed-card::after {
      content: "Fermé";
      position: absolute;
      top: 14px;
      right: 14px;
      padding: 7px 10px;
      border: 1px solid rgba(248,113,113,.34);
      border-radius: 999px;
      background: rgba(248,113,113,.12);
      color: #fca5a5;
      font-size: 11px;
      font-weight: 1000;
      text-transform: uppercase;
    }

    .custom-availability-banner {
      width: min(920px, calc(100vw - 32px));
      margin: 26px auto 0;
      padding: 18px 20px;
      border: 1px solid rgba(214,180,106,.20);
      border-radius: 8px;
      background: rgba(214,180,106,.08);
      color: var(--text);
    }

    .custom-availability-banner strong {
      display: block;
      color: var(--gold2);
      font-size: 13px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .custom-availability-banner p {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }

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

async function loadAvailability(customId) {
  try {
    const snap = await getDoc(doc(db, "customAvailability", customId));
    if (!snap.exists()) return { enabled: true };

    const data = snap.data();
    return { enabled: data.enabled !== false };
  } catch (error) {
    console.warn("Disponibilité custom indisponible :", error);
    return { enabled: true };
  }
}

function getCurrentCustom() {
  const pageName = window.location.pathname.split("/").pop();
  return CUSTOMS.find(custom => custom.page === pageName) || null;
}

function disableNavigationFor(custom) {
  document.querySelectorAll("nav button").forEach(button => {
    const text = button.textContent.trim();
    const onclick = button.getAttribute("onclick") || "";

    if (!text.includes(custom.label) && !onclick.includes(custom.page)) return;

    button.classList.add("custom-closed-link");
    button.title = `${custom.label} fermé pour le moment`;
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
    };
  });

  document.querySelectorAll(".modules .card").forEach(card => {
    const text = card.textContent.trim();
    const onclick = card.getAttribute("onclick") || "";

    if (!text.includes(custom.label) && !onclick.includes(custom.page)) return;

    card.classList.add("custom-closed-card");
    card.removeAttribute("onclick");
    card.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
    });
  });
}

function showClosedPage(custom) {
  const main = document.querySelector("main");
  if (!main) return;

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

function showAllClosedBanner(closedCount) {
  if (closedCount !== CUSTOMS.length || document.getElementById("customAvailabilityBanner")) return;

  const modules = document.querySelector(".modules");
  if (!modules) return;

  modules.insertAdjacentHTML("beforebegin", `
    <div class="custom-availability-banner" id="customAvailabilityBanner">
      <strong>Customs fermés</strong>
      <p>Les fiches custom ne sont pas disponibles pour le moment. Elles seront rouvertes par les professeurs quand le module sera actif.</p>
    </div>
  `);
}

async function startCustomAvailability() {
  injectAvailabilityStyles();

  const states = await Promise.all(CUSTOMS.map(async custom => ({
    custom,
    ...(await loadAvailability(custom.id))
  })));

  let closedCount = 0;

  states.forEach(({ custom, enabled }) => {
    if (enabled) return;
    closedCount += 1;
    disableNavigationFor(custom);
  });

  showAllClosedBanner(closedCount);

  const currentCustom = getCurrentCustom();
  if (!currentCustom) return;

  const currentState = states.find(state => state.custom.id === currentCustom.id);
  if (currentState && currentState.enabled === false) {
    showClosedPage(currentCustom);
  }
}

startCustomAvailability();
