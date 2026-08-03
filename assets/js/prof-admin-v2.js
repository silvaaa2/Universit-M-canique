const ADMIN_PANEL_ID = "profAdminV2Panel";
const ADMIN_STYLE_ID = "profAdminV2Styles";
const ADMIN_TOAST_ID = "profAdminV2Toast";

const CUSTOM_PAGES = [
  { label: "Custom Facile", path: "custom-facile.html" },
  { label: "Custom Moyen", path: "custom-moyen.html" },
  { label: "Custom Difficile", path: "custom-difficile.html" }
];

const DEFAULT_EXAM_SETTINGS = {
  label: "Réponses formulaire",
  spreadsheetUrl: "",
  gid: "282279229"
};

const state = {
  firebase: null,
  user: null,
  access: { role: null, admin: false },
  messageTimer: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function waitForFirebase() {
  if (window.profFirebase?.db) {
    state.firebase = window.profFirebase;
    return Promise.resolve(state.firebase);
  }

  return new Promise(resolve => {
    const timeout = window.setTimeout(() => resolve(null), 5000);

    window.addEventListener("profFirebaseReady", () => {
      window.clearTimeout(timeout);
      state.firebase = window.profFirebase || null;
      resolve(state.firebase);
    }, { once: true });
  });
}

async function loadAccess(user = state.user) {
  if (!user?.email) {
    state.access = { role: null, admin: false };
    return state.access;
  }

  const firebase = await waitForFirebase();
  if (!firebase?.db) {
    state.access = { role: null, admin: false };
    return state.access;
  }

  try {
    const snap = await firebase.getDoc(firebase.doc(firebase.db, "users", user.email));
    const data = snap.exists() ? snap.data() : {};

    state.access = {
      role: data.role || null,
      admin: data.admin === true
    };
  } catch (error) {
    console.error("Erreur accès admin V2 :", error);
    state.access = { role: null, admin: false };
  }

  return state.access;
}

function isAdmin() {
  return state.access.admin === true;
}

function injectStyles() {
  if (document.getElementById(ADMIN_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = ADMIN_STYLE_ID;
  style.textContent = `
    .prof-admin-v2-overlay {
      position: fixed;
      inset: 0;
      z-index: 12000;
      display: grid;
      place-items: center;
      padding: 28px;
      background: rgba(0, 0, 0, .68);
      backdrop-filter: blur(16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .22s ease;
    }

    .prof-admin-v2-overlay.is-open {
      opacity: 1;
      pointer-events: auto;
    }

    .prof-admin-v2-card {
      width: min(1120px, 100%);
      max-height: min(860px, calc(100vh - 56px));
      overflow: auto;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 18px;
      background:
        radial-gradient(circle at 15% 0%, rgba(224, 191, 111, .17), transparent 32%),
        linear-gradient(135deg, rgba(31,30,24,.96), rgba(14,14,14,.98));
      box-shadow: 0 30px 110px rgba(0,0,0,.58);
      color: var(--text, #f8f2e7);
      transform: translateY(18px) scale(.985);
      transition: transform .22s ease;
    }

    .prof-admin-v2-overlay.is-open .prof-admin-v2-card {
      transform: translateY(0) scale(1);
    }

    .prof-admin-v2-head {
      display: flex;
      justify-content: space-between;
      gap: 22px;
      padding: 30px 32px 22px;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }

    .prof-admin-v2-head p {
      margin: 0 0 6px;
      color: var(--gold, #e0bf6f);
      font-size: 12px;
      font-weight: 1000;
      text-transform: uppercase;
    }

    .prof-admin-v2-head h2 {
      margin: 0;
      font-size: clamp(34px, 5vw, 62px);
      letter-spacing: 0;
      line-height: .92;
    }

    .prof-admin-v2-head small {
      display: block;
      margin-top: 12px;
      max-width: 620px;
      color: var(--muted, #b4afa7);
      font-size: 15px;
      line-height: 1.45;
    }

    .prof-admin-v2-close {
      width: 44px;
      height: 44px;
      flex: 0 0 auto;
      border: 1px solid rgba(255,120,120,.38);
      border-radius: 14px;
      background: rgba(111, 34, 34, .42);
      color: #ffabab;
      font-size: 26px;
      font-weight: 1000;
      cursor: pointer;
    }

    .prof-admin-v2-body {
      display: grid;
      grid-template-columns: minmax(220px, .8fr) minmax(0, 1.4fr);
      gap: 18px;
      padding: 22px 32px 32px;
    }

    .prof-admin-v2-box {
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 14px;
      background: rgba(255,255,255,.035);
      padding: 18px;
    }

    .prof-admin-v2-box h3 {
      margin: 0 0 12px;
      font-size: 20px;
    }

    .prof-admin-v2-actions {
      display: grid;
      gap: 10px;
    }

    .prof-admin-v2-action,
    .prof-admin-v2-btn {
      min-height: 44px;
      border: 1px solid rgba(224,191,111,.28);
      border-radius: 12px;
      background: rgba(224,191,111,.12);
      color: var(--text, #f8f2e7);
      font-weight: 950;
      cursor: pointer;
      transition: transform .16s ease, border-color .16s ease, background .16s ease;
    }

    .prof-admin-v2-action {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 13px 14px;
      text-align: left;
    }

    .prof-admin-v2-action span {
      color: var(--gold, #e0bf6f);
      font-size: 12px;
      text-transform: uppercase;
    }

    .prof-admin-v2-action:hover,
    .prof-admin-v2-btn:hover {
      transform: translateY(-1px);
      border-color: rgba(224,191,111,.55);
      background: rgba(224,191,111,.18);
    }

    .prof-admin-v2-form {
      display: grid;
      gap: 12px;
    }

    .prof-admin-v2-form label {
      display: grid;
      gap: 7px;
      color: var(--muted, #b4afa7);
      font-size: 12px;
      font-weight: 950;
      text-transform: uppercase;
    }

    .prof-admin-v2-form input,
    .prof-admin-v2-form textarea {
      width: 100%;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 12px;
      background: rgba(0,0,0,.28);
      color: var(--text, #f8f2e7);
      font: inherit;
      font-weight: 800;
      outline: none;
      padding: 13px 14px;
    }

    .prof-admin-v2-form textarea {
      min-height: 116px;
      resize: vertical;
      line-height: 1.45;
    }

    .prof-admin-v2-form input:focus,
    .prof-admin-v2-form textarea:focus {
      border-color: rgba(224,191,111,.58);
      box-shadow: 0 0 0 4px rgba(224,191,111,.10);
    }

    .prof-admin-v2-switch {
      display: flex !important;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 12px;
      padding: 12px 14px;
      background: rgba(0,0,0,.18);
      text-transform: none !important;
      color: var(--text, #f8f2e7) !important;
      font-size: 14px !important;
    }

    .prof-admin-v2-switch input {
      width: 21px;
      height: 21px;
      accent-color: #e0bf6f;
    }

    .prof-admin-v2-status {
      min-height: 20px;
      margin: 0;
      color: #82f0ad;
      font-size: 13px;
      font-weight: 950;
    }

    .prof-admin-v2-stack {
      display: grid;
      gap: 18px;
    }

    .prof-admin-v2-toast {
      position: fixed;
      top: 22px;
      right: 22px;
      z-index: 13000;
      width: min(420px, calc(100vw - 28px));
      border: 1px solid rgba(96, 184, 220, .48);
      border-radius: 15px;
      background:
        radial-gradient(circle at 100% 0%, rgba(96,184,220,.18), transparent 38%),
        rgba(22, 22, 22, .96);
      color: var(--text, #f8f2e7);
      box-shadow: 0 18px 56px rgba(96,184,220,.18), 0 20px 70px rgba(0,0,0,.42);
      padding: 17px 46px 19px 18px;
      overflow: hidden;
      transform: translateX(24px);
      opacity: 0;
      transition: opacity .22s ease, transform .22s ease;
    }

    .prof-admin-v2-toast.is-open {
      transform: translateX(0);
      opacity: 1;
    }

    .prof-admin-v2-toast span {
      color: var(--gold, #e0bf6f);
      font-size: 11px;
      font-weight: 1000;
      text-transform: uppercase;
    }

    .prof-admin-v2-toast h3 {
      margin: 7px 0 0;
      font-size: 18px;
    }

    .prof-admin-v2-toast p {
      margin: 8px 0 0;
      color: var(--muted, #b4afa7);
      line-height: 1.45;
      white-space: pre-wrap;
    }

    .prof-admin-v2-toast button {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 30px;
      height: 30px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 9px;
      background: rgba(255,255,255,.07);
      color: var(--text, #f8f2e7);
      cursor: pointer;
    }

    .prof-admin-v2-toast::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: linear-gradient(90deg, #e0bf6f, #60b8dc);
      transform-origin: left center;
      animation: profAdminToastLife 10s linear forwards;
    }

    @keyframes profAdminToastLife {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }

    @media (max-width: 860px) {
      .prof-admin-v2-overlay {
        padding: 14px;
      }

      .prof-admin-v2-head {
        padding: 22px 20px 18px;
      }

      .prof-admin-v2-body {
        grid-template-columns: 1fr;
        padding: 18px 20px 24px;
      }
    }
  `;

  document.head.appendChild(style);
}

function pageButton(label, path, hint) {
  return `
    <button type="button" class="prof-admin-v2-action" data-admin-page="${escapeHtml(path)}">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(hint)}</span>
    </button>
  `;
}

function ensurePanel() {
  if (document.getElementById(ADMIN_PANEL_ID)) return;

  injectStyles();

  document.body.insertAdjacentHTML("beforeend", `
    <div class="prof-admin-v2-overlay" id="${ADMIN_PANEL_ID}" hidden>
      <section class="prof-admin-v2-card" role="dialog" aria-modal="true" aria-labelledby="profAdminV2Title">
        <div class="prof-admin-v2-head">
          <div>
            <p>Admin privé</p>
            <h2 id="profAdminV2Title">Panneau admin</h2>
            <small>Raccourcis et réglages réservés au compte admin. Les profs non-admin ne voient pas ce menu.</small>
          </div>
          <button type="button" class="prof-admin-v2-close" data-admin-close aria-label="Fermer">×</button>
        </div>

        <div class="prof-admin-v2-body">
          <aside class="prof-admin-v2-box">
            <h3>Accès rapides</h3>
            <div class="prof-admin-v2-actions">
              ${pageButton("Modules élèves", "prof-modules-eleves.html", "suivi")}
              ${pageButton("Customs élèves", "prof-customs-eleves.html", "ouverture")}
              ${pageButton("Réponses élèves", "prof-rp-7x92q.html", "copies")}
              ${pageButton("Examens", "prof-exam-4x91q.html", "résultats")}
              ${CUSTOM_PAGES.map(custom => pageButton(custom.label, custom.path, "page")).join("")}
            </div>
          </aside>

          <div class="prof-admin-v2-stack">
            <section class="prof-admin-v2-box">
              <h3>Message admin</h3>
              <form class="prof-admin-v2-form" id="profAdminMessageForm">
                <label class="prof-admin-v2-switch">
                  <span>Afficher la notification sur l'espace prof</span>
                  <input id="profAdminMessageEnabled" type="checkbox">
                </label>

                <label for="profAdminMessageTitle">
                  Titre
                  <input id="profAdminMessageTitle" type="text" placeholder="Ex : Nouvelles corrections à jour">
                </label>

                <label for="profAdminMessageBody">
                  Message
                  <textarea id="profAdminMessageBody" placeholder="Texte visible dans la notification..."></textarea>
                </label>

                <button type="submit" class="prof-admin-v2-btn">Enregistrer le message</button>
                <p class="prof-admin-v2-status" id="profAdminMessageStatus"></p>
              </form>
            </section>

            <section class="prof-admin-v2-box">
              <h3>Réglage examens</h3>
              <form class="prof-admin-v2-form" id="profAdminExamForm">
                <label for="profAdminExamLabel">
                  Nom affiché
                  <input id="profAdminExamLabel" type="text" placeholder="Réponses formulaire">
                </label>

                <label for="profAdminExamUrl">
                  Lien Google Sheets
                  <input id="profAdminExamUrl" type="url" placeholder="https://docs.google.com/spreadsheets/d/.../edit">
                </label>

                <label for="profAdminExamGid">
                  GID
                  <input id="profAdminExamGid" type="text" inputmode="numeric" placeholder="282279229">
                </label>

                <button type="submit" class="prof-admin-v2-btn">Enregistrer le réglage examen</button>
                <p class="prof-admin-v2-status" id="profAdminExamStatus"></p>
              </form>
            </section>
          </div>
        </div>
      </section>
    </div>
  `);

  bindPanelEvents();
}

function getPanel() {
  ensurePanel();
  return document.getElementById(ADMIN_PANEL_ID);
}

function openPanel() {
  const panel = getPanel();

  panel.hidden = false;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => panel.classList.add("is-open"));

  loadAdminForms();
}

function closePanel() {
  const panel = document.getElementById(ADMIN_PANEL_ID);
  if (!panel) return;

  panel.classList.remove("is-open");
  document.body.style.overflow = "";
  window.setTimeout(() => {
    if (!panel.classList.contains("is-open")) panel.hidden = true;
  }, 220);
}

function bindPanelEvents() {
  const panel = document.getElementById(ADMIN_PANEL_ID);

  panel?.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.closest("[data-admin-close]") || target === panel) {
      closePanel();
      return;
    }

    const pageButtonEl = target.closest("[data-admin-page]");
    if (pageButtonEl) {
      const path = pageButtonEl.dataset.adminPage;
      if (path) window.location.href = path;
    }
  });

  document.getElementById("profAdminMessageForm")?.addEventListener("submit", saveAdminMessage);
  document.getElementById("profAdminExamForm")?.addEventListener("submit", saveExamSettings);
}

async function loadAdminMessage() {
  const firebase = await waitForFirebase();
  if (!firebase?.db) return null;

  try {
    const snap = await firebase.getDoc(firebase.doc(firebase.db, "profSettings", "adminMessage"));
    return snap.exists() ? snap.data() : null;
  } catch (error) {
    console.warn("Message admin indisponible :", error);
    return null;
  }
}

async function loadExamSettings() {
  const firebase = await waitForFirebase();
  if (!firebase?.db) return DEFAULT_EXAM_SETTINGS;

  try {
    const snap = await firebase.getDoc(firebase.doc(firebase.db, "profSettings", "examResponses"));
    return snap.exists() ? { ...DEFAULT_EXAM_SETTINGS, ...snap.data() } : DEFAULT_EXAM_SETTINGS;
  } catch (error) {
    console.warn("Réglage examen indisponible :", error);
    return DEFAULT_EXAM_SETTINGS;
  }
}

async function loadAdminForms() {
  const [message, examSettings] = await Promise.all([
    loadAdminMessage(),
    loadExamSettings()
  ]);

  const enabledInput = document.getElementById("profAdminMessageEnabled");
  const titleInput = document.getElementById("profAdminMessageTitle");
  const bodyInput = document.getElementById("profAdminMessageBody");
  const examLabelInput = document.getElementById("profAdminExamLabel");
  const examUrlInput = document.getElementById("profAdminExamUrl");
  const examGidInput = document.getElementById("profAdminExamGid");

  if (enabledInput) enabledInput.checked = message?.enabled === true;
  if (titleInput) titleInput.value = message?.title || "";
  if (bodyInput) bodyInput.value = message?.body || "";

  if (examLabelInput) examLabelInput.value = examSettings.label || DEFAULT_EXAM_SETTINGS.label;
  if (examUrlInput) examUrlInput.value = examSettings.spreadsheetUrl || examSettings.spreadsheetId || "";
  if (examGidInput) examGidInput.value = examSettings.gid || DEFAULT_EXAM_SETTINGS.gid;
}

function setStatus(id, message, tone = "success") {
  const status = document.getElementById(id);
  if (!status) return;

  status.textContent = message;
  status.style.color = tone === "error" ? "#ffabab" : "#82f0ad";
}

async function saveAdminMessage(event) {
  event.preventDefault();

  if (!isAdmin()) {
    setStatus("profAdminMessageStatus", "Accès admin réservé.", "error");
    return;
  }

  const firebase = await waitForFirebase();
  if (!firebase?.db) {
    setStatus("profAdminMessageStatus", "Firebase indisponible.", "error");
    return;
  }

  const payload = {
    enabled: document.getElementById("profAdminMessageEnabled")?.checked === true,
    title: document.getElementById("profAdminMessageTitle")?.value?.trim() || "Message admin",
    body: document.getElementById("profAdminMessageBody")?.value?.trim() || "",
    updatedAt: firebase.serverTimestamp(),
    updatedBy: state.user?.email || window.currentProfUser?.email || "admin"
  };

  try {
    await firebase.setDoc(firebase.doc(firebase.db, "profSettings", "adminMessage"), payload, { merge: true });
    setStatus("profAdminMessageStatus", "Message enregistré.");
    renderAdminToast(payload);
  } catch (error) {
    console.error("Sauvegarde message admin impossible :", error);
    setStatus("profAdminMessageStatus", `Sauvegarde impossible : ${error.code || error.message}`, "error");
  }
}

async function saveExamSettings(event) {
  event.preventDefault();

  if (!isAdmin()) {
    setStatus("profAdminExamStatus", "Accès admin réservé.", "error");
    return;
  }

  const firebase = await waitForFirebase();
  if (!firebase?.db) {
    setStatus("profAdminExamStatus", "Firebase indisponible.", "error");
    return;
  }

  const payload = {
    label: document.getElementById("profAdminExamLabel")?.value?.trim() || DEFAULT_EXAM_SETTINGS.label,
    spreadsheetUrl: document.getElementById("profAdminExamUrl")?.value?.trim() || "",
    gid: document.getElementById("profAdminExamGid")?.value?.trim() || DEFAULT_EXAM_SETTINGS.gid,
    updatedAt: firebase.serverTimestamp(),
    updatedBy: state.user?.email || window.currentProfUser?.email || "admin"
  };

  try {
    await firebase.setDoc(firebase.doc(firebase.db, "profSettings", "examResponses"), payload, { merge: true });
    setStatus("profAdminExamStatus", "Réglage examen enregistré.");
  } catch (error) {
    console.error("Sauvegarde réglage examen impossible :", error);
    setStatus("profAdminExamStatus", `Sauvegarde impossible : ${error.code || error.message}`, "error");
  }
}

function removeAdminToast() {
  const toast = document.getElementById(ADMIN_TOAST_ID);
  if (!toast) return;

  toast.classList.remove("is-open");
  window.setTimeout(() => toast.remove(), 220);
}

function renderAdminToast(message) {
  injectStyles();
  window.clearTimeout(state.messageTimer);

  if (!message?.enabled || !message.body) {
    removeAdminToast();
    return;
  }

  removeAdminToast();

  document.body.insertAdjacentHTML("beforeend", `
    <aside class="prof-admin-v2-toast" id="${ADMIN_TOAST_ID}" role="status">
      <button type="button" aria-label="Fermer">×</button>
      <span>Message admin</span>
      <h3>${escapeHtml(message.title || "Message admin")}</h3>
      <p>${escapeHtml(message.body)}</p>
    </aside>
  `);

  const toast = document.getElementById(ADMIN_TOAST_ID);
  toast?.querySelector("button")?.addEventListener("click", removeAdminToast);
  requestAnimationFrame(() => toast?.classList.add("is-open"));

  state.messageTimer = window.setTimeout(removeAdminToast, 10000);
}

async function refreshSession(user) {
  state.user = user || window.currentProfUser || null;
  await loadAccess(state.user);

  const button = document.getElementById("profAdminBtn");
  if (button) button.hidden = !isAdmin();

  const message = await loadAdminMessage();
  renderAdminToast(message);
}

async function openAdminFromButton(event) {
  const button = event.target?.closest?.("#profAdminBtn");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  await refreshSession(window.currentProfUser || state.firebase?.auth?.currentUser || null);

  if (!isAdmin()) {
    alert("Accès admin réservé.");
    return;
  }

  openPanel();
}

async function initAdminV2() {
  injectStyles();

  const firebase = await waitForFirebase();
  state.firebase = firebase;

  document.addEventListener("click", openAdminFromButton, true);

  if (firebase?.auth?.onAuthStateChanged) {
    firebase.auth.onAuthStateChanged(user => refreshSession(user));
  } else {
    window.setTimeout(() => refreshSession(window.currentProfUser || null), 500);
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closePanel();
  });
}

initAdminV2();