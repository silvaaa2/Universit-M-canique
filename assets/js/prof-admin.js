import "./prof-auth.js?v=1001";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let currentAdminUser = null;
let currentAdminAccess = { role: null, admin: false };

function waitForProfFirebase() {
  if (window.profFirebase?.db) {
    return Promise.resolve(window.profFirebase);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Firebase prof n'est pas prêt."));
    }, 7000);

    window.addEventListener("profFirebaseReady", () => {
      clearTimeout(timeout);
      resolve(window.profFirebase);
    }, { once: true });
  });
}

async function loadUserAccess(user) {
  if (!user?.email) return { role: null, admin: false };

  const firebase = await waitForProfFirebase();
  const ref = firebase.doc(firebase.db, "users", user.email);
  const snap = await firebase.getDoc(ref);

  if (!snap.exists()) return { role: null, admin: false };

  const data = snap.data();

  return {
    role: data.role || null,
    admin: data.admin === true
  };
}

function isAdmin() {
  return currentAdminAccess.admin === true;
}

function injectProfAdminStyles() {
  if (document.getElementById("profAdminStyles")) return;

  const style = document.createElement("style");
  style.id = "profAdminStyles";
  style.textContent = `
    .prof-admin-btn {
      border-color: rgba(214,180,106,.34) !important;
      background: rgba(214,180,106,.12) !important;
      color: var(--gold2) !important;
      margin-left: auto;
    }

    .prof-admin-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 11000;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(0,0,0,.68);
      backdrop-filter: blur(16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s ease;
    }

    .prof-admin-modal-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .prof-admin-modal-overlay[hidden] {
      display: none !important;
    }

    .prof-admin-modal-card {
      width: min(760px, 100%);
      position: relative;
      padding: 24px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.11);
      background:
        radial-gradient(circle at 16% 0%, rgba(214,180,106,.16), transparent 34%),
        linear-gradient(145deg, rgba(255,255,255,.075), rgba(255,255,255,.030)),
        rgba(8,8,8,.96);
      box-shadow:
        0 35px 120px rgba(0,0,0,.65),
        inset 0 1px 0 rgba(255,255,255,.05);
      transform: translateY(18px) scale(.98);
      transition: transform .18s ease;
    }

    .prof-admin-modal-overlay.active .prof-admin-modal-card {
      transform: translateY(0) scale(1);
    }

    .prof-admin-close {
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

    .prof-admin-modal-card h2 {
      margin: 0;
      max-width: 560px;
      font-size: 30px;
      line-height: 1;
      letter-spacing: 0;
    }

    .prof-admin-grid {
      margin-top: 22px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .prof-admin-card {
      min-height: 96px;
      padding: 15px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.045);
    }

    .prof-admin-card span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      font-weight: 1000;
      text-transform: uppercase;
    }

    .prof-admin-card strong {
      display: block;
      margin-top: 8px;
      color: var(--gold2);
      font-size: 14px;
      font-weight: 1000;
      line-height: 1.35;
      word-break: break-word;
    }

    .prof-admin-placeholder {
      margin-top: 16px;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid rgba(214,180,106,.18);
      background: rgba(214,180,106,.08);
      color: var(--gold2);
      font-size: 13px;
      font-weight: 900;
      line-height: 1.45;
    }

    @media (max-width: 760px) {
      .prof-dashboard-top {
        flex-wrap: wrap;
      }

      .prof-admin-btn {
        margin-left: 0;
      }

      .prof-admin-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

function openModal(modal) {
  if (!modal) return;

  modal.hidden = false;

  requestAnimationFrame(() => {
    modal.classList.add("active");
  });
}

function closeModal(modal) {
  if (!modal) return;

  modal.classList.remove("active");

  setTimeout(() => {
    modal.hidden = true;
  }, 180);
}

function ensureProfAdminModal() {
  if (document.getElementById("profAdminModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="profAdminModal" class="prof-admin-modal-overlay" hidden>
      <div class="prof-admin-modal-card">
        <button type="button" class="prof-admin-close" onclick="window.closeProfAdminPanel()">×</button>

        <p class="kicker">Admin privé</p>
        <h2>Espace admin prof</h2>

        <div class="prof-admin-grid">
          <div class="prof-admin-card">
            <span>Compte</span>
            <strong id="profAdminEmail">-</strong>
          </div>

          <div class="prof-admin-card">
            <span>Rôle</span>
            <strong id="profAdminRole">-</strong>
          </div>

          <div class="prof-admin-card">
            <span>Admin</span>
            <strong id="profAdminStatus">-</strong>
          </div>
        </div>

        <div class="prof-admin-placeholder">
          Le bouton admin est actif. On pourra ajouter ici les outils réservés uniquement à ton compte.
        </div>
      </div>
    </div>
  `);
}

function updateProfAdminModal() {
  const email = document.getElementById("profAdminEmail");
  const role = document.getElementById("profAdminRole");
  const status = document.getElementById("profAdminStatus");

  if (email) email.textContent = currentAdminUser?.email || "-";
  if (role) role.textContent = currentAdminAccess.role || "-";
  if (status) status.textContent = currentAdminAccess.admin ? "Oui" : "Non";
}

function ensureProfAdminButton() {
  if (!isAdmin()) {
    removeProfAdminUi();
    return;
  }

  injectProfAdminStyles();
  ensureProfAdminModal();

  if (document.getElementById("profAdminBtn")) {
    updateProfAdminModal();
    return;
  }

  const logoutBtn = document.getElementById("logoutBtn");
  const dashboardTop = document.querySelector(".prof-dashboard-top");

  if (!logoutBtn || !dashboardTop) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "profAdminBtn";
  button.className = "btn secondary prof-admin-btn";
  button.textContent = "Admin";
  button.addEventListener("click", window.openProfAdminPanel);

  logoutBtn.insertAdjacentElement("beforebegin", button);
  updateProfAdminModal();
}

function removeProfAdminUi() {
  const button = document.getElementById("profAdminBtn");
  const modal = document.getElementById("profAdminModal");

  if (button) button.remove();
  if (modal) modal.remove();
}

window.openProfAdminPanel = function() {
  if (!isAdmin()) {
    alert("Accès admin réservé.");
    return;
  }

  ensureProfAdminModal();
  updateProfAdminModal();
  openModal(document.getElementById("profAdminModal"));
};

window.closeProfAdminPanel = function() {
  closeModal(document.getElementById("profAdminModal"));
};

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  window.closeProfAdminPanel();
});

async function startProfAdminLayer() {
  try {
    const firebase = await waitForProfFirebase();

    onAuthStateChanged(firebase.auth, async user => {
      currentAdminUser = user || null;

      if (!user) {
        currentAdminAccess = { role: null, admin: false };
        removeProfAdminUi();
        return;
      }

      currentAdminAccess = await loadUserAccess(user);

      if (!isAdmin()) {
        removeProfAdminUi();
        return;
      }

      ensureProfAdminButton();
      setTimeout(ensureProfAdminButton, 300);
      setTimeout(ensureProfAdminButton, 1000);
    });
  } catch (error) {
    console.error("Erreur couche admin prof :", error);
  }
}

startProfAdminLayer();
