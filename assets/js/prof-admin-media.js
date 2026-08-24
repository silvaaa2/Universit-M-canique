import "./prof-admin-polish.js?v=1006";

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let currentUser = null;
let currentUserIsAdmin = false;
let pageEnhancerStarted = false;
let previewTimer = null;

onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  currentUserIsAdmin = await loadAdminAccess(user);
});

async function loadAdminAccess(user) {
  if (!user) return false;
  const access = await window.profIdentityUtils.getProfAccess(user, async () => {
    if (!user.email) return { role: null, admin: false };
    const snap = await getDoc(doc(db, "users", user.email));
    return snap.exists() ? snap.data() : { role: null, admin: false };
  });
  return access.admin === true;
}

async function requireAdminAccess() {
  if (!currentUser) {
    throw new Error("Tu dois être connecté.");
  }

  currentUserIsAdmin = await loadAdminAccess(currentUser);

  if (!currentUserIsAdmin) {
    throw new Error("Accès admin réservé.");
  }

  return currentUser;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeFileName(name) {
  return String(name || "image")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "image";
}

function getInputValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function setMediaStatus(message, tone = "") {
  const status = document.getElementById("adminMediaStatus");
  if (!status) return;

  status.textContent = message || "";
  status.dataset.tone = tone;
}

function injectMediaStyles() {
  if (document.getElementById("profAdminMediaStyles")) return;

  const style = document.createElement("style");
  style.id = "profAdminMediaStyles";
  style.textContent = `
    .prof-admin-media-status {
      margin-left: auto;
      color: var(--muted);
      font-size: 12px;
      font-weight: 1000;
    }

    .prof-admin-media-status[data-tone="ok"] {
      color: #86efac;
    }

    .prof-admin-media-status[data-tone="error"] {
      color: #fca5a5;
    }

    .prof-admin-preview {
      margin: 0 0 14px;
      overflow: hidden;
      border: 1px solid rgba(214,180,106,.20);
      border-radius: 14px;
      background:
        linear-gradient(145deg, rgba(214,180,106,.08), transparent 28%),
        rgba(255,255,255,.030);
      box-shadow: 0 16px 42px rgba(0,0,0,.24);
    }

    .prof-admin-preview-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 13px 14px;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }

    .prof-admin-preview-head span {
      color: var(--gold);
      font-size: 11px;
      font-weight: 1000;
      text-transform: uppercase;
    }

    .prof-admin-preview-body {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(260px, .65fr);
      gap: 14px;
      padding: 14px;
    }

    .prof-admin-preview-main {
      min-width: 0;
    }

    .prof-admin-preview-main h3 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 0;
    }

    .prof-admin-preview-main p {
      margin: 8px 0 12px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .prof-admin-preview-image {
      width: 100%;
      aspect-ratio: 16 / 9;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.09);
      background: rgba(0,0,0,.38);
    }

    .prof-admin-preview-image img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    .prof-admin-preview-image span {
      color: var(--muted);
      font-size: 13px;
      font-weight: 900;
    }

    .prof-admin-preview-side {
      display: grid;
      align-content: start;
      gap: 10px;
      padding: 13px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(0,0,0,.24);
    }

    .prof-admin-preview-side p {
      margin: 0;
      color: var(--muted);
      font-size: 11px;
      font-weight: 1000;
      text-transform: uppercase;
    }

    .prof-admin-preview-side h4 {
      margin: -4px 0 2px;
      color: var(--text);
      font-size: 18px;
      letter-spacing: 0;
    }

    .prof-admin-preview-info {
      display: grid;
      gap: 7px;
    }

    .prof-admin-preview-info div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,.07);
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }

    .prof-admin-preview-info b {
      color: var(--gold2);
      font-size: 12px;
      text-align: right;
    }

    .prof-admin-preview-form {
      margin-top: 2px;
      padding: 10px 12px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      color: #080808;
      font-size: 12px;
      font-weight: 1000;
      text-align: center;
    }

    @media (max-width: 820px) {
      .prof-admin-preview-body {
        grid-template-columns: 1fr;
      }

      .prof-admin-media-status {
        width: 100%;
        margin-left: 0;
      }
    }
  `;

  document.head.appendChild(style);
}

function renderImageRow(value) {
  return `
    <div class="prof-admin-mini-grid prof-admin-image-row" data-image-row>
      <input class="prof-admin-input" data-image-url type="text" value="${escapeHtml(value)}" placeholder="../Images/image.png ou https://...">
      <button type="button" class="prof-admin-danger-btn" data-action="remove-image">Supprimer</button>
    </div>
  `;
}

function collectPreviewData() {
  const panel = document.querySelector('[data-admin-panel="pages"]');

  const images = [...document.querySelectorAll("[data-image-row]")]
    .map(row => row.querySelector("[data-image-url]")?.value?.trim() || "")
    .filter(Boolean);

  const infoRows = [...document.querySelectorAll("[data-info-row]")]
    .map(row => ({
      label: row.querySelector("[data-info-label]")?.value?.trim() || "",
      value: row.querySelector("[data-info-value]")?.value?.trim() || ""
    }))
    .filter(row => row.label || row.value);

  return {
    label: getInputValue("pageLabelInput") || "Titre de la custom",
    vehicleName: getInputValue("pageVehicleInput") || "Véhicule",
    intro: getInputValue("pageIntroInput") || "Texte de présentation de la page.",
    formText: getInputValue("pageFormTextInput") || "Remplir le formulaire",
    images,
    infoRows,
    panel
  };
}

function updatePagePreview() {
  const preview = document.getElementById("adminPagePreview");
  if (!preview) return;

  const data = collectPreviewData();
  const image = data.images[0];
  const infoRows = data.infoRows.slice(0, 7);

  preview.querySelector("[data-preview-title]").textContent = data.label;
  preview.querySelector("[data-preview-intro]").textContent = data.intro;
  preview.querySelector("[data-preview-vehicle]").textContent = data.vehicleName;
  preview.querySelector("[data-preview-form]").textContent = data.formText;

  const imageBox = preview.querySelector("[data-preview-image]");
  imageBox.innerHTML = image
    ? `<img src="${escapeHtml(image)}" alt="Aperçu photo">`
    : `<span>Aucune photo pour le moment</span>`;

  preview.querySelector("[data-preview-info]").innerHTML = infoRows.length
    ? infoRows.map(row => `
      <div>
        <span>${escapeHtml(row.label)}</span>
        <b>${escapeHtml(row.value)}</b>
      </div>
    `).join("")
    : `<div><span>Aucune info fiche</span><b>-</b></div>`;
}

function schedulePreviewUpdate() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePagePreview, 80);
}

function ensurePreview(panel) {
  if (document.getElementById("adminPagePreview")) {
    schedulePreviewUpdate();
    return;
  }

  const preview = document.createElement("div");
  preview.id = "adminPagePreview";
  preview.className = "prof-admin-preview";
  preview.innerHTML = `
    <div class="prof-admin-preview-head">
      <span>Aperçu avant publication</span>
      <button type="button" class="prof-admin-small-btn" id="refreshPagePreviewBtn">Actualiser aperçu</button>
    </div>

    <div class="prof-admin-preview-body">
      <div class="prof-admin-preview-main">
        <h3 data-preview-title>Custom</h3>
        <p data-preview-intro></p>
        <div class="prof-admin-preview-image" data-preview-image></div>
      </div>

      <aside class="prof-admin-preview-side">
        <p>Véhicule</p>
        <h4 data-preview-vehicle></h4>
        <div class="prof-admin-preview-info" data-preview-info></div>
        <div class="prof-admin-preview-form" data-preview-form>Remplir le formulaire</div>
      </aside>
    </div>
  `;

  const firstEditCard = panel.querySelector(".prof-admin-edit-card");
  firstEditCard?.insertAdjacentElement("beforebegin", preview);

  document.getElementById("refreshPagePreviewBtn")?.addEventListener("click", updatePagePreview);
  schedulePreviewUpdate();
}

async function uploadImages(files) {
  const selectedCustom = document.getElementById("adminPageSelect")?.value || "custom";
  const validFiles = [...files].filter(file => file.type.startsWith("image/"));

  if (!validFiles.length) return;

  try {
    const user = await requireAdminAccess();
    setMediaStatus(`Import de ${validFiles.length} image(s)...`);

    const urls = [];

    for (const file of validFiles) {
      if (file.size > 8 * 1024 * 1024) {
        throw new Error(`${file.name} dépasse 8 Mo.`);
      }

      const path = `customPages/${selectedCustom}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitizeFileName(file.name)}`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, file, {
        contentType: file.type,
        customMetadata: {
          uploadedBy: window.profIdentityUtils.getProfActorId(user),
          customId: selectedCustom
        }
      });

      urls.push(await getDownloadURL(storageRef));
    }

    const editor = document.getElementById("pageImagesEditor");
    editor?.insertAdjacentHTML("beforeend", urls.map(renderImageRow).join(""));

    setMediaStatus("Image(s) ajoutée(s). Pense à enregistrer la page.", "ok");
    schedulePreviewUpdate();
  } catch (error) {
    console.error("Erreur upload image :", error);
    setMediaStatus("Import impossible.", "error");
    alert("Import impossible. Vérifie les images puis réessaie.");
  }
}

function enhancePagesPanel() {
  const panel = document.querySelector('[data-admin-panel="pages"]');
  if (!panel || panel.dataset.mediaEnhanced === "true") return;

  panel.dataset.mediaEnhanced = "true";
  injectMediaStyles();
  ensurePreview(panel);

  const toolbar = panel.querySelector(".prof-admin-toolbar");
  if (toolbar && !document.getElementById("adminMediaStatus")) {
    toolbar.insertAdjacentHTML("beforeend", `<span id="adminMediaStatus" class="prof-admin-media-status"></span>`);
  }

  const addImageBtn = document.getElementById("addPageImageBtn");
  if (addImageBtn && !document.getElementById("uploadPageImageBtn")) {
    addImageBtn.insertAdjacentHTML("afterend", `
      <button type="button" class="prof-admin-small-btn gold" id="uploadPageImageBtn">Importer une photo</button>
      <input id="adminImageUploadInput" type="file" accept="image/*" multiple hidden>
    `);
  }

  document.getElementById("uploadPageImageBtn")?.addEventListener("click", () => {
    document.getElementById("adminImageUploadInput")?.click();
  });

  document.getElementById("adminImageUploadInput")?.addEventListener("change", event => {
    uploadImages(event.target.files || []);
    event.target.value = "";
  });

  panel.addEventListener("input", schedulePreviewUpdate);
  panel.addEventListener("change", () => {
    setTimeout(schedulePreviewUpdate, 120);
    setTimeout(schedulePreviewUpdate, 600);
  });
  panel.addEventListener("click", () => {
    setTimeout(schedulePreviewUpdate, 120);
  });
}

function startPageEnhancer() {
  if (pageEnhancerStarted) return;

  pageEnhancerStarted = true;

  const observer = new MutationObserver(() => {
    enhancePagesPanel();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  enhancePagesPanel();
}

if (document.body) {
  startPageEnhancer();
} else {
  document.addEventListener("DOMContentLoaded", startPageEnhancer, { once: true });
}
