import "./prof-auth.js?v=1001";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const CUSTOMS = [
  { id: "sentinelClassic", label: "Custom Facile", vehicle: "Sentinel Classic" },
  { id: "argento2f", label: "Custom Moyen", vehicle: "Argento 2F" },
  { id: "cypher", label: "Custom Difficile", vehicle: "Cypher" }
];

const PAGE_DEFAULTS = {
  sentinelClassic: {
    label: "Custom Facile",
    title: "Custom Facile",
    intro: "Photos et informations techniques pour la Custom Facile.",
    vehicleName: "Sentinel Classic",
    formUrl: "https://docs.google.com/forms/d/e/1FAIpQLSdOz9FE8Kodhlzze1BBWW0FCB4C5ElFlIF2AcXwDunDkNT2wg/viewform?usp=dialog",
    formText: "Remplir le formulaire",
    meteoImage: "../Images/meteo.png",
    images: [
      "../Images/COTÉ SENTINEL.png",
      "../Images/COTÉ GAUCHE SENTINEL.png",
      "../Images/DEVANT SENTINEL.png",
      "../Images/DERRIÈRE SENTINEL.png",
      "../Images/FINAL SENTINEL.png"
    ],
    infoRows: [
      { label: "Couleur principale", value: "Oui", tone: "yes" },
      { label: "Couleur secondaire", value: "Oui", tone: "yes" },
      { label: "Couleur intérieur", value: "Non", tone: "no" },
      { label: "Couleur Jante", value: "Blanc", tone: "yes" },
      { label: "Nacré", value: "Non", tone: "no" },
      { label: "Néon", value: "Non", tone: "no" },
      { label: "Full perf", value: "Non", tone: "no" }
    ]
  },

  argento2f: {
    label: "Custom Moyen",
    title: "Custom Moyen",
    intro: "Photos et informations techniques pour la Custom Moyen.",
    vehicleName: "Argento 2F",
    formUrl: "https://docs.google.com/forms/d/e/1FAIpQLSdSqcoHBjIWW6HS9cR5CQtiLFTiIVqW21ysQ4gi1bo8g_56jA/viewform?usp=publish-editor",
    formText: "Remplir le formulaire",
    meteoImage: "../Images/meteo.png",
    images: [
      "../Images/FINAL RS2 (2).png",
      "../Images/DEVANT RS2 (2).png",
      "../Images/COTÉ RS2 (2).png",
      "../Images/COTÉ GAUCHE RS2 (2).png",
      "../Images/DERRIÈRE RS2 (2).png"
    ],
    infoRows: [
      { label: "Couleur principale", value: "Oui", tone: "yes" },
      { label: "Couleur secondaire", value: "Non", tone: "no" },
      { label: "Couleur intérieur", value: "Non", tone: "no" },
      { label: "Couleur Jante", value: "Noir", tone: "yes" },
      { label: "Nacré", value: "Oui", tone: "yes" },
      { label: "Néon", value: "Non", tone: "no" },
      { label: "Extras", value: "Oui", tone: "yes" },
      { label: "Full perf", value: "Oui", tone: "yes" }
    ]
  },

  cypher: {
    label: "Custom Difficile",
    title: "Custom Difficile",
    intro: "Photos et informations techniques pour la Custom Difficile.",
    vehicleName: "Cypher",
    formUrl: "https://docs.google.com/forms/d/e/1FAIpQLSeT_AsDK5uMVVLm3m5OKq_XPGYrW-YPMwH-THKwE0MLX6hEcA/viewform?usp=publish-editor",
    formText: "Remplir le formulaire",
    meteoImage: "../Images/meteo.png",
    images: [
      "../Images/FINAL CYPHER.png",
      "../Images/DEVANT CYPHER.png",
      "../Images/COTÉ CYPHER.png",
      "../Images/COTÉ GAUCHE CYPHER.png",
      "../Images/DERRIÈRE CYPHER.png"
    ],
    infoRows: [
      { label: "Couleur principale", value: "Oui", tone: "yes" },
      { label: "Couleur secondaire", value: "Oui", tone: "yes" },
      { label: "Couleur intérieur", value: "Oui", tone: "yes" },
      { label: "Couleur Jante", value: "Noir", tone: "yes" },
      { label: "Nacré", value: "Oui", tone: "yes" },
      { label: "Néon", value: "Non", tone: "no" },
      { label: "Full perf", value: "Oui", tone: "yes" }
    ]
  }
};

let currentAdminUser = null;
let currentAdminAccess = { role: null, admin: false };
let selectedCorrectionId = CUSTOMS[0].id;
let selectedPageId = CUSTOMS[0].id;
let currentCorrectionData = null;
let currentPageData = null;
let currentMessageData = null;

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCustom(id) {
  return CUSTOMS.find(custom => custom.id === id) || CUSTOMS[0];
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items.map(item => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return {
        label: String(item.label ?? item.title ?? item.name ?? ""),
        value: String(item.value ?? item.valeur ?? item.reponse ?? item.answer ?? "")
      };
    }

    return {
      label: "",
      value: String(item ?? "")
    };
  });
}

function normalizeCorrection(data, meta) {
  const source = data && typeof data === "object" ? data : {};

  return {
    label: String(source.label ?? meta.label),
    title: String(source.title ?? source.titre ?? meta.vehicle),
    description: String(source.description ?? `Réponses et configuration attendue pour le custom ${meta.vehicle}.`),
    sections: Array.isArray(source.sections)
      ? source.sections.map((section, index) => ({
        title: String(section?.title ?? section?.label ?? `Section ${index + 1}`),
        items: normalizeItems(section?.items)
      }))
      : []
  };
}

function normalizePage(data, fallback) {
  const source = data && typeof data === "object" ? data : {};

  return {
    label: String(source.label ?? fallback.label),
    title: String(source.title ?? fallback.title),
    intro: String(source.intro ?? fallback.intro),
    vehicleName: String(source.vehicleName ?? fallback.vehicleName),
    formUrl: String(source.formUrl ?? fallback.formUrl),
    formText: String(source.formText ?? fallback.formText),
    meteoImage: String(source.meteoImage ?? fallback.meteoImage),
    images: Array.isArray(source.images) ? source.images.map(String).filter(Boolean) : [...fallback.images],
    infoRows: Array.isArray(source.infoRows)
      ? source.infoRows.map(row => ({
        label: String(row?.label ?? ""),
        value: String(row?.value ?? ""),
        tone: ["yes", "no", "neutral"].includes(row?.tone) ? row.tone : "neutral"
      }))
      : fallback.infoRows.map(row => ({ ...row }))
  };
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

    .prof-admin-message-banner {
      margin: 22px 0 0;
      padding: 16px 18px;
      border-radius: 8px;
      border: 1px solid rgba(214,180,106,.22);
      background: rgba(214,180,106,.08);
      color: var(--text);
    }

    .prof-admin-message-banner span {
      display: block;
      color: var(--gold);
      font-size: 11px;
      font-weight: 1000;
      text-transform: uppercase;
    }

    .prof-admin-message-banner h3 {
      margin: 7px 0 0;
      font-size: 18px;
      letter-spacing: 0;
    }

    .prof-admin-message-banner p {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .prof-admin-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 11000;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(0,0,0,.70);
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
      width: min(1100px, 100%);
      max-height: min(88vh, 880px);
      position: relative;
      display: flex;
      flex-direction: column;
      padding: 22px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.11);
      background:
        radial-gradient(circle at 16% 0%, rgba(214,180,106,.16), transparent 34%),
        linear-gradient(145deg, rgba(255,255,255,.075), rgba(255,255,255,.030)),
        rgba(8,8,8,.97);
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
      padding-right: 48px;
      font-size: 28px;
      line-height: 1;
      letter-spacing: 0;
    }

    .prof-admin-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 20px;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }

    .prof-admin-tab {
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      background: rgba(255,255,255,.055);
      color: var(--muted);
      padding: 11px 14px;
      font-weight: 1000;
      cursor: pointer;
    }

    .prof-admin-tab.active {
      border-color: rgba(214,180,106,.38);
      background: rgba(214,180,106,.14);
      color: var(--gold2);
    }

    .prof-admin-workspace {
      position: relative;
      min-height: 360px;
      overflow: auto;
      padding: 18px 2px 2px;
    }

    .prof-admin-loader {
      position: absolute;
      inset: 0;
      z-index: 5;
      display: grid;
      place-items: center;
      border-radius: 8px;
      background: rgba(8,8,8,.74);
      backdrop-filter: blur(10px);
    }

    .prof-admin-loader[hidden] {
      display: none !important;
    }

    .prof-admin-loader-box {
      width: min(360px, 92%);
      padding: 20px;
      border-radius: 8px;
      border: 1px solid rgba(214,180,106,.24);
      background: rgba(18,18,18,.96);
      text-align: center;
    }

    .prof-admin-spinner {
      width: 34px;
      height: 34px;
      margin: 0 auto 12px;
      border-radius: 999px;
      border: 3px solid rgba(214,180,106,.18);
      border-top-color: var(--gold2);
      animation: profAdminSpin .75s linear infinite;
    }

    @keyframes profAdminSpin {
      to { transform: rotate(360deg); }
    }

    .prof-admin-loader-box p {
      margin: 0;
      color: var(--gold2);
      font-size: 13px;
      font-weight: 1000;
    }

    .prof-admin-panel[hidden] {
      display: none !important;
    }

    .prof-admin-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
    }

    .prof-admin-status {
      min-height: 20px;
      margin-left: auto;
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
    }

    .prof-admin-field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }

    .prof-admin-field {
      display: grid;
      gap: 7px;
    }

    .prof-admin-field.full {
      grid-column: 1 / -1;
    }

    .prof-admin-field label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 1000;
      text-transform: uppercase;
    }

    .prof-admin-input,
    .prof-admin-select,
    .prof-admin-textarea {
      width: 100%;
      border: 1px solid rgba(255,255,255,.11);
      border-radius: 8px;
      background: rgba(255,255,255,.055);
      color: var(--text);
      padding: 12px;
      font: inherit;
      font-size: 14px;
      outline: none;
    }

    .prof-admin-textarea {
      min-height: 96px;
      resize: vertical;
      line-height: 1.45;
    }

    .prof-admin-row-list {
      display: grid;
      gap: 12px;
      margin-top: 10px;
    }

    .prof-admin-edit-card {
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 8px;
      background: rgba(255,255,255,.035);
      padding: 14px;
    }

    .prof-admin-edit-card-head {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
    }

    .prof-admin-edit-card-head .prof-admin-input {
      font-weight: 1000;
    }

    .prof-admin-mini-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      margin-top: 8px;
    }

    .prof-admin-page-row {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 120px auto;
    }

    .prof-admin-image-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .prof-admin-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 16px;
    }

    .prof-admin-small-btn,
    .prof-admin-danger-btn {
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      background: rgba(255,255,255,.055);
      color: var(--text);
      padding: 10px 12px;
      font-size: 12px;
      font-weight: 1000;
      cursor: pointer;
    }

    .prof-admin-small-btn.gold {
      border-color: rgba(214,180,106,.34);
      background: rgba(214,180,106,.12);
      color: var(--gold2);
    }

    .prof-admin-danger-btn {
      border-color: rgba(248,113,113,.26);
      background: rgba(248,113,113,.10);
      color: #fca5a5;
    }

    .prof-admin-check {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--text);
      font-size: 14px;
      font-weight: 900;
    }

    .prof-admin-check input {
      width: 18px;
      height: 18px;
      accent-color: var(--gold2);
    }

    @media (max-width: 780px) {
      .prof-dashboard-top {
        flex-wrap: wrap;
      }

      .prof-admin-btn {
        margin-left: 0;
      }

      .prof-admin-field-grid,
      .prof-admin-mini-grid,
      .prof-admin-page-row,
      .prof-admin-image-row {
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

function setStatus(message) {
  const status = document.getElementById("profAdminStatusText");
  if (status) status.textContent = message || "";
}

function showAdminLoader(message = "Chargement...") {
  const loader = document.getElementById("profAdminLoader");
  const text = document.getElementById("profAdminLoaderText");

  if (text) text.textContent = message;
  if (loader) loader.hidden = false;
}

function hideAdminLoader() {
  const loader = document.getElementById("profAdminLoader");
  if (loader) loader.hidden = true;
}

function getFormValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function renderCustomOptions(selectedId) {
  return CUSTOMS.map(custom => `
    <option value="${escapeHtml(custom.id)}" ${custom.id === selectedId ? "selected" : ""}>
      ${escapeHtml(custom.label)}
    </option>
  `).join("");
}

function ensureProfAdminModal() {
  if (document.getElementById("profAdminModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="profAdminModal" class="prof-admin-modal-overlay" hidden>
      <div class="prof-admin-modal-card">
        <button type="button" class="prof-admin-close" onclick="window.closeProfAdminPanel()">×</button>

        <p class="kicker">Admin privé</p>
        <h2>Gestion du site</h2>

        <div class="prof-admin-tabs">
          <button type="button" class="prof-admin-tab active" data-admin-tab="corrections">Corrigés</button>
          <button type="button" class="prof-admin-tab" data-admin-tab="pages">Pages Custom</button>
          <button type="button" class="prof-admin-tab" data-admin-tab="message">Message prof</button>
        </div>

        <div class="prof-admin-workspace">
          <div id="profAdminLoader" class="prof-admin-loader" hidden>
            <div class="prof-admin-loader-box">
              <div class="prof-admin-spinner"></div>
              <p id="profAdminLoaderText">Chargement...</p>
            </div>
          </div>

          <section class="prof-admin-panel" data-admin-panel="corrections">
            <div class="prof-admin-toolbar">
              <select id="adminCorrectionSelect" class="prof-admin-select">
                ${renderCustomOptions(selectedCorrectionId)}
              </select>
              <button type="button" class="prof-admin-small-btn gold" id="reloadCorrectionBtn">Recharger</button>
              <span class="prof-admin-status" id="profAdminStatusText"></span>
            </div>

            <div class="prof-admin-field-grid">
              <div class="prof-admin-field">
                <label for="correctionLabelInput">Nom custom</label>
                <input id="correctionLabelInput" class="prof-admin-input" type="text">
              </div>

              <div class="prof-admin-field">
                <label for="correctionTitleInput">Véhicule</label>
                <input id="correctionTitleInput" class="prof-admin-input" type="text">
              </div>

              <div class="prof-admin-field full">
                <label for="correctionDescriptionInput">Description</label>
                <textarea id="correctionDescriptionInput" class="prof-admin-textarea"></textarea>
              </div>
            </div>

            <div id="correctionSectionsEditor" class="prof-admin-row-list"></div>

            <div class="prof-admin-actions">
              <button type="button" class="prof-admin-small-btn" id="addCorrectionSectionBtn">Ajouter une section</button>
              <button type="button" class="prof-admin-small-btn gold" id="saveCorrectionBtn">Enregistrer le corrigé</button>
            </div>
          </section>

          <section class="prof-admin-panel" data-admin-panel="pages" hidden>
            <div class="prof-admin-toolbar">
              <select id="adminPageSelect" class="prof-admin-select">
                ${renderCustomOptions(selectedPageId)}
              </select>
              <button type="button" class="prof-admin-small-btn gold" id="reloadPageBtn">Recharger</button>
              <span class="prof-admin-status">Les images peuvent être des liens ou des chemins Images/.</span>
            </div>

            <div class="prof-admin-field-grid">
              <div class="prof-admin-field">
                <label for="pageLabelInput">Titre page</label>
                <input id="pageLabelInput" class="prof-admin-input" type="text">
              </div>

              <div class="prof-admin-field">
                <label for="pageVehicleInput">Véhicule</label>
                <input id="pageVehicleInput" class="prof-admin-input" type="text">
              </div>

              <div class="prof-admin-field full">
                <label for="pageIntroInput">Texte intro</label>
                <textarea id="pageIntroInput" class="prof-admin-textarea"></textarea>
              </div>

              <div class="prof-admin-field">
                <label for="pageFormUrlInput">Lien formulaire</label>
                <input id="pageFormUrlInput" class="prof-admin-input" type="url">
              </div>

              <div class="prof-admin-field">
                <label for="pageFormTextInput">Texte bouton</label>
                <input id="pageFormTextInput" class="prof-admin-input" type="text">
              </div>

              <div class="prof-admin-field full">
                <label for="pageMeteoInput">Image météo</label>
                <input id="pageMeteoInput" class="prof-admin-input" type="text">
              </div>
            </div>

            <div class="prof-admin-edit-card">
              <div class="prof-admin-edit-card-head">
                <strong>Photos</strong>
                <button type="button" class="prof-admin-small-btn" id="addPageImageBtn">Ajouter une photo</button>
              </div>
              <div id="pageImagesEditor" class="prof-admin-row-list"></div>
            </div>

            <div class="prof-admin-edit-card" style="margin-top:12px">
              <div class="prof-admin-edit-card-head">
                <strong>Infos fiche</strong>
                <button type="button" class="prof-admin-small-btn" id="addPageInfoRowBtn">Ajouter une ligne</button>
              </div>
              <div id="pageInfoRowsEditor" class="prof-admin-row-list"></div>
            </div>

            <div class="prof-admin-actions">
              <button type="button" class="prof-admin-small-btn gold" id="savePageBtn">Enregistrer la page</button>
            </div>
          </section>

          <section class="prof-admin-panel" data-admin-panel="message" hidden>
            <div class="prof-admin-toolbar">
              <label class="prof-admin-check">
                <input id="messageEnabledInput" type="checkbox">
                Message visible sur l'espace prof
              </label>
            </div>

            <div class="prof-admin-field-grid">
              <div class="prof-admin-field full">
                <label for="messageTitleInput">Titre</label>
                <input id="messageTitleInput" class="prof-admin-input" type="text">
              </div>

              <div class="prof-admin-field full">
                <label for="messageBodyInput">Message</label>
                <textarea id="messageBodyInput" class="prof-admin-textarea"></textarea>
              </div>
            </div>

            <div class="prof-admin-actions">
              <button type="button" class="prof-admin-small-btn gold" id="saveMessageBtn">Enregistrer le message</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  `);

  bindProfAdminModalEvents();
}

function bindProfAdminModalEvents() {
  const modal = document.getElementById("profAdminModal");

  modal?.addEventListener("click", event => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) return;

    const tab = target.closest("[data-admin-tab]");
    if (tab) {
      activateAdminTab(tab.dataset.adminTab);
      return;
    }

    const action = target.dataset.action;

    if (action === "remove-section") {
      target.closest("[data-section-row]")?.remove();
      return;
    }

    if (action === "add-item") {
      const section = target.closest("[data-section-row]");
      section?.querySelector("[data-section-items]")?.insertAdjacentHTML("beforeend", renderCorrectionItemRow("", ""));
      return;
    }

    if (action === "remove-item") {
      target.closest("[data-item-row]")?.remove();
      return;
    }

    if (action === "remove-image") {
      target.closest("[data-image-row]")?.remove();
      return;
    }

    if (action === "remove-info-row") {
      target.closest("[data-info-row]")?.remove();
    }
  });

  document.getElementById("adminCorrectionSelect")?.addEventListener("change", event => {
    selectedCorrectionId = event.target.value;
    loadCorrectionEditor(selectedCorrectionId);
  });

  document.getElementById("reloadCorrectionBtn")?.addEventListener("click", () => {
    loadCorrectionEditor(selectedCorrectionId);
  });

  document.getElementById("addCorrectionSectionBtn")?.addEventListener("click", () => {
    document.getElementById("correctionSectionsEditor")
      ?.insertAdjacentHTML("beforeend", renderCorrectionSectionEditor({ title: "Nouvelle section", items: [] }));
  });

  document.getElementById("saveCorrectionBtn")?.addEventListener("click", saveCorrectionEditor);

  document.getElementById("adminPageSelect")?.addEventListener("change", event => {
    selectedPageId = event.target.value;
    loadPageEditor(selectedPageId);
  });

  document.getElementById("reloadPageBtn")?.addEventListener("click", () => {
    loadPageEditor(selectedPageId);
  });

  document.getElementById("addPageImageBtn")?.addEventListener("click", () => {
    document.getElementById("pageImagesEditor")
      ?.insertAdjacentHTML("beforeend", renderImageRow(""));
  });

  document.getElementById("addPageInfoRowBtn")?.addEventListener("click", () => {
    document.getElementById("pageInfoRowsEditor")
      ?.insertAdjacentHTML("beforeend", renderInfoRow({ label: "", value: "", tone: "neutral" }));
  });

  document.getElementById("savePageBtn")?.addEventListener("click", savePageEditor);
  document.getElementById("saveMessageBtn")?.addEventListener("click", saveMessageEditor);
}

function activateAdminTab(tabName = "corrections") {
  document.querySelectorAll("[data-admin-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.adminTab === tabName);
  });

  document.querySelectorAll("[data-admin-panel]").forEach(panel => {
    panel.hidden = panel.dataset.adminPanel !== tabName;
  });

  if (tabName === "corrections" && !currentCorrectionData) loadCorrectionEditor(selectedCorrectionId);
  if (tabName === "pages" && !currentPageData) loadPageEditor(selectedPageId);
  if (tabName === "message" && !currentMessageData) loadMessageEditor();
}

function renderCorrectionItemRow(label, value) {
  return `
    <div class="prof-admin-mini-grid" data-item-row>
      <input class="prof-admin-input" data-item-label type="text" value="${escapeHtml(label)}" placeholder="Nom">
      <input class="prof-admin-input" data-item-value type="text" value="${escapeHtml(value)}" placeholder="Valeur">
      <button type="button" class="prof-admin-danger-btn" data-action="remove-item">Supprimer</button>
    </div>
  `;
}

function renderCorrectionSectionEditor(section) {
  const items = normalizeItems(section.items);

  return `
    <div class="prof-admin-edit-card" data-section-row>
      <div class="prof-admin-edit-card-head">
        <input class="prof-admin-input" data-section-title type="text" value="${escapeHtml(section.title)}">
        <button type="button" class="prof-admin-small-btn" data-action="add-item">Ajouter une ligne</button>
        <button type="button" class="prof-admin-danger-btn" data-action="remove-section">Supprimer</button>
      </div>

      <div data-section-items>
        ${items.map(item => renderCorrectionItemRow(item.label, item.value)).join("")}
      </div>
    </div>
  `;
}

function renderCorrectionEditor(data) {
  document.getElementById("correctionLabelInput").value = data.label;
  document.getElementById("correctionTitleInput").value = data.title;
  document.getElementById("correctionDescriptionInput").value = data.description;

  const editor = document.getElementById("correctionSectionsEditor");
  editor.innerHTML = data.sections.map(renderCorrectionSectionEditor).join("");
}

async function loadCorrectionEditor(docId) {
  if (!isAdmin()) return;

  const meta = getCustom(docId);

  try {
    showAdminLoader("Chargement du corrigé...");
    setStatus("");

    const firebase = await waitForProfFirebase();
    const snap = await firebase.getDoc(firebase.doc(firebase.db, "customAnswerKeys", docId));
    currentCorrectionData = normalizeCorrection(snap.exists() ? snap.data() : null, meta);

    renderCorrectionEditor(currentCorrectionData);
    setStatus("Corrigé chargé.");
  } catch (error) {
    console.error("Erreur chargement corrigé :", error);
    setStatus("Impossible de charger ce corrigé.");
  } finally {
    hideAdminLoader();
  }
}

function collectCorrectionEditor() {
  const sections = [...document.querySelectorAll("[data-section-row]")].map(section => {
    const title = section.querySelector("[data-section-title]")?.value?.trim() || "Section";
    const items = [...section.querySelectorAll("[data-item-row]")].map(row => ({
      label: row.querySelector("[data-item-label]")?.value?.trim() || "",
      value: row.querySelector("[data-item-value]")?.value?.trim() || ""
    })).filter(item => item.label || item.value);

    return { title, items };
  }).filter(section => section.title || section.items.length);

  return {
    label: getFormValue("correctionLabelInput"),
    title: getFormValue("correctionTitleInput"),
    description: getFormValue("correctionDescriptionInput"),
    sections
  };
}

async function saveCorrectionEditor() {
  if (!isAdmin()) return;

  try {
    showAdminLoader("Enregistrement du corrigé...");
    setStatus("");

    const firebase = await waitForProfFirebase();
    const payload = {
      ...collectCorrectionEditor(),
      updatedAt: firebase.serverTimestamp(),
      updatedBy: currentAdminUser?.email || null
    };

    await firebase.setDoc(firebase.doc(firebase.db, "customAnswerKeys", selectedCorrectionId), payload);
    currentCorrectionData = normalizeCorrection(payload, getCustom(selectedCorrectionId));
    setStatus("Corrigé enregistré.");
  } catch (error) {
    console.error("Erreur sauvegarde corrigé :", error);
    setStatus("Sauvegarde impossible.");
    alert(`Sauvegarde impossible : ${error.code || error.message}`);
  } finally {
    hideAdminLoader();
  }
}

function renderImageRow(value) {
  return `
    <div class="prof-admin-mini-grid prof-admin-image-row" data-image-row>
      <input class="prof-admin-input" data-image-url type="text" value="${escapeHtml(value)}" placeholder="../Images/image.png ou https://...">
      <button type="button" class="prof-admin-danger-btn" data-action="remove-image">Supprimer</button>
    </div>
  `;
}

function renderInfoRow(row) {
  return `
    <div class="prof-admin-mini-grid prof-admin-page-row" data-info-row>
      <input class="prof-admin-input" data-info-label type="text" value="${escapeHtml(row.label)}" placeholder="Nom">
      <input class="prof-admin-input" data-info-value type="text" value="${escapeHtml(row.value)}" placeholder="Valeur">
      <select class="prof-admin-select" data-info-tone>
        <option value="yes" ${row.tone === "yes" ? "selected" : ""}>Vert</option>
        <option value="no" ${row.tone === "no" ? "selected" : ""}>Rouge</option>
        <option value="neutral" ${row.tone === "neutral" ? "selected" : ""}>Neutre</option>
      </select>
      <button type="button" class="prof-admin-danger-btn" data-action="remove-info-row">Supprimer</button>
    </div>
  `;
}

function renderPageEditor(data) {
  document.getElementById("pageLabelInput").value = data.label;
  document.getElementById("pageVehicleInput").value = data.vehicleName;
  document.getElementById("pageIntroInput").value = data.intro;
  document.getElementById("pageFormUrlInput").value = data.formUrl;
  document.getElementById("pageFormTextInput").value = data.formText;
  document.getElementById("pageMeteoInput").value = data.meteoImage;

  document.getElementById("pageImagesEditor").innerHTML = data.images.map(renderImageRow).join("");
  document.getElementById("pageInfoRowsEditor").innerHTML = data.infoRows.map(renderInfoRow).join("");
}

async function loadPageEditor(docId) {
  if (!isAdmin()) return;

  try {
    showAdminLoader("Chargement de la page...");
    setStatus("");

    const firebase = await waitForProfFirebase();
    const snap = await firebase.getDoc(firebase.doc(firebase.db, "customPages", docId));
    currentPageData = normalizePage(snap.exists() ? snap.data() : null, PAGE_DEFAULTS[docId]);

    renderPageEditor(currentPageData);
  } catch (error) {
    console.error("Erreur chargement page custom :", error);
    currentPageData = normalizePage(null, PAGE_DEFAULTS[docId]);
    renderPageEditor(currentPageData);
  } finally {
    hideAdminLoader();
  }
}

function collectPageEditor() {
  const images = [...document.querySelectorAll("[data-image-row]")]
    .map(row => row.querySelector("[data-image-url]")?.value?.trim() || "")
    .filter(Boolean);

  const infoRows = [...document.querySelectorAll("[data-info-row]")].map(row => ({
    label: row.querySelector("[data-info-label]")?.value?.trim() || "",
    value: row.querySelector("[data-info-value]")?.value?.trim() || "",
    tone: row.querySelector("[data-info-tone]")?.value || "neutral"
  })).filter(row => row.label || row.value);

  return {
    label: getFormValue("pageLabelInput"),
    title: getFormValue("pageLabelInput"),
    intro: getFormValue("pageIntroInput"),
    vehicleName: getFormValue("pageVehicleInput"),
    formUrl: getFormValue("pageFormUrlInput"),
    formText: getFormValue("pageFormTextInput") || "Remplir le formulaire",
    meteoImage: getFormValue("pageMeteoInput"),
    images,
    infoRows
  };
}

async function savePageEditor() {
  if (!isAdmin()) return;

  try {
    showAdminLoader("Enregistrement de la page...");

    const firebase = await waitForProfFirebase();
    const payload = {
      ...collectPageEditor(),
      updatedAt: firebase.serverTimestamp(),
      updatedBy: currentAdminUser?.email || null
    };

    await firebase.setDoc(firebase.doc(firebase.db, "customPages", selectedPageId), payload);
    currentPageData = normalizePage(payload, PAGE_DEFAULTS[selectedPageId]);
    alert("Page Custom enregistrée.");
  } catch (error) {
    console.error("Erreur sauvegarde page custom :", error);
    alert(`Sauvegarde impossible : ${error.code || error.message}`);
  } finally {
    hideAdminLoader();
  }
}

function renderProfMessage(data) {
  const existing = document.getElementById("profAdminMessageBanner");
  const dashboardTop = document.querySelector(".prof-dashboard-top");

  if (!data?.enabled || (!data.title && !data.body)) {
    existing?.remove();
    return;
  }

  const html = `
    <span>Message admin</span>
    ${data.title ? `<h3>${escapeHtml(data.title)}</h3>` : ""}
    ${data.body ? `<p>${escapeHtml(data.body)}</p>` : ""}
  `;

  if (existing) {
    existing.innerHTML = html;
    return;
  }

  const banner = document.createElement("div");
  banner.id = "profAdminMessageBanner";
  banner.className = "prof-admin-message-banner";
  banner.innerHTML = html;

  dashboardTop?.insertAdjacentElement("afterend", banner);
}

async function loadAndRenderProfMessage() {
  try {
    const firebase = await waitForProfFirebase();
    const snap = await firebase.getDoc(firebase.doc(firebase.db, "profSettings", "adminMessage"));
    const data = snap.exists() ? snap.data() : null;

    renderProfMessage(data);
  } catch (error) {
    console.warn("Message admin prof indisponible :", error);
  }
}

async function loadMessageEditor() {
  if (!isAdmin()) return;

  try {
    showAdminLoader("Chargement du message...");

    const firebase = await waitForProfFirebase();
    const snap = await firebase.getDoc(firebase.doc(firebase.db, "profSettings", "adminMessage"));
    currentMessageData = snap.exists() ? snap.data() : { enabled: false, title: "", body: "" };

    document.getElementById("messageEnabledInput").checked = currentMessageData.enabled === true;
    document.getElementById("messageTitleInput").value = currentMessageData.title || "";
    document.getElementById("messageBodyInput").value = currentMessageData.body || "";
  } catch (error) {
    console.error("Erreur chargement message :", error);
    currentMessageData = { enabled: false, title: "", body: "" };
  } finally {
    hideAdminLoader();
  }
}

async function saveMessageEditor() {
  if (!isAdmin()) return;

  try {
    showAdminLoader("Enregistrement du message...");

    const firebase = await waitForProfFirebase();
    const payload = {
      enabled: document.getElementById("messageEnabledInput").checked,
      title: getFormValue("messageTitleInput"),
      body: getFormValue("messageBodyInput"),
      updatedAt: firebase.serverTimestamp(),
      updatedBy: currentAdminUser?.email || null
    };

    await firebase.setDoc(firebase.doc(firebase.db, "profSettings", "adminMessage"), payload);
    currentMessageData = payload;
    renderProfMessage(payload);
    alert("Message enregistré.");
  } catch (error) {
    console.error("Erreur sauvegarde message :", error);
    alert(`Sauvegarde impossible : ${error.code || error.message}`);
  } finally {
    hideAdminLoader();
  }
}

function ensureProfAdminButton() {
  if (!isAdmin()) {
    removeProfAdminUi();
    return;
  }

  injectProfAdminStyles();
  ensureProfAdminModal();

  if (document.getElementById("profAdminBtn")) return;

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
  openModal(document.getElementById("profAdminModal"));
  activateAdminTab("corrections");
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
    injectProfAdminStyles();

    const firebase = await waitForProfFirebase();

    onAuthStateChanged(firebase.auth, async user => {
      currentAdminUser = user || null;

      if (!user) {
        currentAdminAccess = { role: null, admin: false };
        removeProfAdminUi();
        renderProfMessage(null);
        return;
      }

      currentAdminAccess = await loadUserAccess(user);
      await loadAndRenderProfMessage();

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
