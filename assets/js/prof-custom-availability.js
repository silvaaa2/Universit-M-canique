const CUSTOMS = [
  { id: "sentinelClassic", label: "Custom Facile", vehicle: "Sentinel Classic" },
  { id: "argento2f", label: "Custom Moyen", vehicle: "Argento 2F" },
  { id: "cypher", label: "Custom Difficile", vehicle: "Cypher" }
];

let customAccessObserverStarted = false;
let customAccessModalBound = false;
let currentAccessUser = null;
let currentAccessData = { role: null, admin: false };

function waitForProfFirebase() {
  if (window.profFirebase?.db && window.profFirebase?.auth) {
    return Promise.resolve(window.profFirebase);
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Firebase prof n'est pas prêt."));
    }, 8000);

    window.addEventListener("profFirebaseReady", () => {
      window.clearTimeout(timeout);
      resolve(window.profFirebase);
    }, { once: true });
  });
}

async function loadAccess(firebase, user) {
  if (!user?.email) return { role: null, admin: false };

  try {
    const snap = await firebase.getDoc(firebase.doc(firebase.db, "users", user.email));
    if (!snap.exists()) return { role: null, admin: false };

    const data = snap.data();
    return {
      role: data.role || null,
      admin: data.admin === true
    };
  } catch (error) {
    console.warn("Accès réglage customs indisponible :", error);
    return { role: null, admin: false };
  }
}

function canManageCustoms() {
  return currentAccessData.role === "prof" || currentAccessData.admin === true;
}

function injectCustomAccessStyles() {
  if (document.getElementById("profCustomAccessStyles")) return;

  const style = document.createElement("style");
  style.id = "profCustomAccessStyles";
  style.textContent = `
    .prof-custom-access-btn {
      border-color: rgba(214,180,106,.34) !important;
      background: rgba(214,180,106,.12) !important;
      color: var(--gold2) !important;
      white-space: nowrap;
    }

    .prof-custom-access-btn.first-action {
      margin-left: auto;
    }

    .prof-custom-access-modal {
      position: fixed;
      inset: 0;
      z-index: 11200;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(0,0,0,.72);
      backdrop-filter: blur(16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s ease;
    }

    .prof-custom-access-modal.active {
      opacity: 1;
      pointer-events: auto;
    }

    .prof-custom-access-modal[hidden] {
      display: none !important;
    }

    .prof-custom-access-card {
      width: min(920px, 100%);
      max-height: min(88vh, 760px);
      overflow: auto;
      position: relative;
      padding: 24px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.11);
      background:
        linear-gradient(145deg, rgba(214,180,106,.10), transparent 34%),
        linear-gradient(145deg, rgba(255,255,255,.070), rgba(255,255,255,.028)),
        rgba(8,8,8,.97);
      box-shadow: 0 35px 120px rgba(0,0,0,.65);
      transform: translateY(18px) scale(.98);
      transition: transform .18s ease;
    }

    .prof-custom-access-modal.active .prof-custom-access-card {
      transform: translateY(0) scale(1);
    }

    .prof-custom-access-close {
      position: absolute;
      top: 18px;
      right: 18px;
      width: 36px;
      height: 36px;
      border: 1px solid rgba(248,113,113,.28);
      border-radius: 8px;
      background: rgba(248,113,113,.12);
      color: #fca5a5;
      font-size: 22px;
      font-weight: 1000;
      line-height: 1;
      cursor: pointer;
    }

    .prof-custom-access-card h2 {
      margin: 4px 0 8px;
      padding-right: 44px;
      font-size: clamp(36px, 5vw, 60px);
      line-height: .95;
      letter-spacing: 0;
    }

    .prof-custom-access-intro {
      max-width: 620px;
      margin: 0 0 20px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.5;
    }

    .prof-custom-access-list {
      display: grid;
      gap: 12px;
    }

    .prof-custom-access-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: center;
      padding: 16px;
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 8px;
      background: rgba(255,255,255,.035);
    }

    .prof-custom-access-row h3 {
      margin: 0;
      font-size: 22px;
      letter-spacing: 0;
    }

    .prof-custom-access-row p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
    }

    .prof-custom-switch {
      min-width: 168px;
      border: 1px solid rgba(134,239,172,.32);
      border-radius: 999px;
      background: rgba(34,197,94,.14);
      color: #86efac;
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 1000;
      cursor: pointer;
    }

    .prof-custom-switch[data-enabled="false"] {
      border-color: rgba(248,113,113,.32);
      background: rgba(248,113,113,.12);
      color: #fca5a5;
    }

    .prof-custom-switch:disabled {
      cursor: wait;
      opacity: .65;
    }

    .prof-custom-access-status {
      min-height: 20px;
      margin: 16px 0 0;
      color: var(--muted);
      font-size: 13px;
      font-weight: 900;
    }

    .prof-custom-access-status[data-tone="ok"] {
      color: #86efac;
    }

    .prof-custom-access-status[data-tone="error"] {
      color: #fca5a5;
    }

    @media (max-width: 780px) {
      .prof-custom-access-row {
        grid-template-columns: 1fr;
      }

      .prof-custom-switch {
        width: 100%;
      }

      .prof-custom-access-btn.first-action {
        margin-left: 0;
      }
    }
  `;

  document.head.appendChild(style);
}

function setStatus(message, tone = "") {
  const status = document.getElementById("profCustomAccessStatus");
  if (!status) return;

  status.textContent = message || "";
  status.dataset.tone = tone;
}

function openCustomAccessModal() {
  ensureCustomAccessModal();

  const modal = document.getElementById("profCustomAccessModal");
  if (!modal) return;

  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("active"));
  loadCustomAvailability();
}

function closeCustomAccessModal() {
  const modal = document.getElementById("profCustomAccessModal");
  if (!modal) return;

  modal.classList.remove("active");
  window.setTimeout(() => {
    modal.hidden = true;
  }, 180);
}

function ensureCustomAccessModal() {
  injectCustomAccessStyles();

  if (document.getElementById("profCustomAccessModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="profCustomAccessModal" class="prof-custom-access-modal" hidden>
      <div class="prof-custom-access-card">
        <button type="button" class="prof-custom-access-close" id="closeCustomAccessBtn">×</button>
        <p class="kicker">Réglage prof</p>
        <h2>Customs élèves</h2>
        <p class="prof-custom-access-intro">Ouvrez ou fermez les fiches custom visibles par les élèves. Quand une fiche est fermée, le lien direct affiche une page indisponible.</p>
        <div class="prof-custom-access-list" id="profCustomAccessList"></div>
        <p class="prof-custom-access-status" id="profCustomAccessStatus"></p>
      </div>
    </div>
  `);

  if (!customAccessModalBound) {
    customAccessModalBound = true;
    document.getElementById("closeCustomAccessBtn")?.addEventListener("click", closeCustomAccessModal);
    document.getElementById("profCustomAccessModal")?.addEventListener("click", event => {
      if (event.target?.id === "profCustomAccessModal") closeCustomAccessModal();
    });
  }
}

function renderRows(states = {}) {
  const list = document.getElementById("profCustomAccessList");
  if (!list) return;

  list.innerHTML = CUSTOMS.map(custom => {
    const enabled = states[custom.id] !== false;

    return `
      <div class="prof-custom-access-row" data-custom-id="${custom.id}">
        <div>
          <h3>${custom.label}</h3>
          <p>${custom.vehicle}</p>
        </div>
        <button type="button" class="prof-custom-switch" data-enabled="${enabled}" data-toggle-custom="${custom.id}">
          ${enabled ? "Ouvert aux élèves" : "Fermé aux élèves"}
        </button>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-toggle-custom]").forEach(button => {
    button.addEventListener("click", () => toggleCustom(button.dataset.toggleCustom, button));
  });
}

async function loadCustomAvailability() {
  if (!canManageCustoms()) return;

  try {
    setStatus("Chargement des réglages...");
    const firebase = await waitForProfFirebase();
    const states = {};

    await Promise.all(CUSTOMS.map(async custom => {
      const snap = await firebase.getDoc(firebase.doc(firebase.db, "customAvailability", custom.id));
      states[custom.id] = snap.exists() ? snap.data().enabled !== false : true;
    }));

    renderRows(states);
    setStatus("Réglages chargés.", "ok");
  } catch (error) {
    console.error("Chargement disponibilité custom impossible :", error);
    renderRows({});
    setStatus("Impossible de charger les réglages. Vérifie les règles Firebase.", "error");
  }
}

async function toggleCustom(customId, button) {
  if (!canManageCustoms() || !button) return;

  const nextEnabled = button.dataset.enabled !== "true";

  try {
    button.disabled = true;
    setStatus("Sauvegarde...");

    const firebase = await waitForProfFirebase();
    await firebase.setDoc(firebase.doc(firebase.db, "customAvailability", customId), {
      enabled: nextEnabled,
      updatedAt: firebase.serverTimestamp(),
      updatedBy: currentAccessUser?.email || null
    }, { merge: true });

    button.dataset.enabled = String(nextEnabled);
    button.textContent = nextEnabled ? "Ouvert aux élèves" : "Fermé aux élèves";
    setStatus(nextEnabled ? "Fiche ouverte aux élèves." : "Fiche fermée aux élèves.", "ok");
  } catch (error) {
    console.error("Sauvegarde disponibilité custom impossible :", error);
    setStatus("Sauvegarde impossible. Vérifie les règles Firebase.", "error");
  } finally {
    button.disabled = false;
  }
}

function positionCustomAccessButton() {
  const button = document.getElementById("profCustomAccessBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  if (!button || !logoutBtn) return;

  const modulesBtn = document.getElementById("profModulesElevesBtn");
  const adminBtn = document.getElementById("profAdminBtn");
  const anchor = modulesBtn || adminBtn;

  if (anchor) {
    if (button.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement("afterend", button);
    }

    button.classList.remove("first-action");
    return;
  }

  if (button.nextElementSibling !== logoutBtn) {
    logoutBtn.insertAdjacentElement("beforebegin", button);
  }

  button.classList.add("first-action");
}

function ensureCustomAccessButton() {
  injectCustomAccessStyles();

  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  let button = document.getElementById("profCustomAccessBtn");

  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.id = "profCustomAccessBtn";
    button.className = "btn secondary prof-custom-access-btn";
    button.textContent = "Customs élèves";
    button.addEventListener("click", openCustomAccessModal);
    logoutBtn.insertAdjacentElement("beforebegin", button);
  }

  positionCustomAccessButton();
}

function removeCustomAccessButton() {
  document.getElementById("profCustomAccessBtn")?.remove();
}

async function startCustomAccessControls() {
  try {
    const firebaseAuth = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const firebase = await waitForProfFirebase();

    firebaseAuth.onAuthStateChanged(firebase.auth, async user => {
      currentAccessUser = user || null;
      currentAccessData = await loadAccess(firebase, user);

      if (!user || !canManageCustoms()) {
        removeCustomAccessButton();
        return;
      }

      ensureCustomAccessButton();
      setTimeout(positionCustomAccessButton, 350);
      setTimeout(positionCustomAccessButton, 1000);
    });

    if (!customAccessObserverStarted) {
      customAccessObserverStarted = true;
      const observer = new MutationObserver(positionCustomAccessButton);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  } catch (error) {
    console.warn("Réglage customs élèves indisponible :", error);
  }
}

startCustomAccessControls();
