import "./prof-admin-free-tools.js?v=1011";

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_SETTINGS_DOC = "driveUpload";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentUserIsAdmin = false;
let driveUploadStarted = false;
let driveSettingsLoaded = false;
let driveAccessToken = "";
let driveTokenExpiresAt = 0;

onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  currentUserIsAdmin = await loadAdminAccess(user);

  if (currentUserIsAdmin) {
    setTimeout(() => {
      ensureDriveUploadPanel();
      hydrateDriveSettings();
    }, 600);
  }
});

async function loadAdminAccess(user) {
  if (!user?.email) return false;

  const snap = await getDoc(doc(db, "users", user.email));
  return snap.exists() && snap.data().admin === true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function injectDriveStyles() {
  if (document.getElementById("profAdminDriveUploadStyles")) return;

  const style = document.createElement("style");
  style.id = "profAdminDriveUploadStyles";
  style.textContent = `
    .prof-admin-drive-upload {
      margin: 0 0 13px;
      padding: 13px;
      border: 1px solid rgba(125,211,252,.16);
      border-radius: 8px;
      background:
        linear-gradient(135deg, rgba(125,211,252,.08), transparent 36%),
        rgba(255,255,255,.028);
    }

    .prof-admin-drive-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 10px;
    }

    .prof-admin-drive-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
    }

    .prof-admin-drive-status {
      min-height: 18px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
    }

    .prof-admin-drive-status[data-tone="ok"] {
      color: #86efac;
    }

    .prof-admin-drive-status[data-tone="error"] {
      color: #fca5a5;
    }

    .prof-admin-drive-status[data-tone="info"] {
      color: #7dd3fc;
    }

    .prof-admin-drive-upload.is-busy {
      opacity: .74;
      pointer-events: none;
    }

    @media (max-width: 780px) {
      .prof-admin-drive-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

function getDrivePanel() {
  return document.getElementById("profAdminDriveUpload");
}

function setDriveStatus(message) {
  const status = document.getElementById("driveUploadStatus");
  if (!status) return;

  status.textContent = message || "";
  status.dataset.tone = "";
}

function setDriveStatusTone(message, tone = "") {
  const status = document.getElementById("driveUploadStatus");
  if (!status) return;

  status.textContent = message || "";
  status.dataset.tone = tone;
}

function setDriveBusy(isBusy) {
  const panel = getDrivePanel();
  const connectButton = document.getElementById("driveConnectButton");
  const uploadButton = document.getElementById("driveUploadButton");
  const saveButton = document.getElementById("saveDriveSettingsBtn");

  panel?.classList.toggle("is-busy", isBusy);
  if (connectButton) connectButton.disabled = isBusy;
  if (uploadButton) uploadButton.disabled = isBusy;
  if (saveButton) saveButton.disabled = isBusy;
}

function getDriveSettingsFromEditor() {
  return {
    clientId: document.getElementById("driveClientIdInput")?.value?.trim() || "",
    folderId: document.getElementById("driveFolderIdInput")?.value?.trim() || "",
    sharePublic: document.getElementById("driveSharePublicInput")?.checked !== false
  };
}

async function loadDriveSettings() {
  if (!currentUserIsAdmin) return {};

  const snap = await getDoc(doc(db, "profSettings", DRIVE_SETTINGS_DOC));
  return snap.exists() ? snap.data() : {};
}

async function saveDriveSettings() {
  if (!currentUserIsAdmin) return;

  const settings = getDriveSettingsFromEditor();

  try {
    setDriveBusy(true);
    setDriveStatus("Enregistrement...");

    await setDoc(doc(db, "profSettings", DRIVE_SETTINGS_DOC), {
      ...settings,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || null
    }, { merge: true });

    driveSettingsLoaded = false;
    setDriveStatusTone("Réglages Google Drive enregistrés.", "ok");
  } catch (error) {
    console.error("Réglages Drive non sauvegardés :", error);
    setDriveStatusTone("Impossible d'enregistrer les réglages Drive.", "error");
  } finally {
    setDriveBusy(false);
  }
}

async function hydrateDriveSettings() {
  if (driveSettingsLoaded || !currentUserIsAdmin) return;

  try {
    const settings = await loadDriveSettings();
    document.getElementById("driveClientIdInput").value = settings.clientId || "";
    document.getElementById("driveFolderIdInput").value = settings.folderId || "";
    document.getElementById("driveSharePublicInput").checked = settings.sharePublic !== false;
    driveSettingsLoaded = true;
  } catch (error) {
    console.warn("Réglages Drive indisponibles :", error);
    setDriveStatus("Réglages Drive indisponibles.");
  }
}

function loadScriptOnce(src, id) {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Script indisponible : ${src}`));
    document.head.appendChild(script);
  });
}

function hasDriveToken() {
  return Boolean(driveAccessToken && Date.now() < driveTokenExpiresAt - 60000);
}

async function getDriveAccessToken(clientId) {
  if (hasDriveToken()) {
    return driveAccessToken;
  }

  await loadScriptOnce("https://accounts.google.com/gsi/client", "googleIdentityServicesScript");

  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error("Connexion Google indisponible."));
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: response => {
        if (response?.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }

        driveAccessToken = response.access_token || "";
        driveTokenExpiresAt = Date.now() + Number(response.expires_in || 3300) * 1000;
        resolve(driveAccessToken);
      }
    });

    tokenClient.requestAccessToken({
      prompt: driveAccessToken ? "" : "consent"
    });
  });
}

async function connectGoogleDrive() {
  const settings = getDriveSettingsFromEditor();

  if (!settings.clientId) {
    setDriveStatusTone("Colle le Client ID Google puis enregistre Drive.", "error");
    return false;
  }

  try {
    setDriveBusy(true);
    setDriveStatusTone("Connexion Google...", "info");

    await getDriveAccessToken(settings.clientId);
    setDriveStatusTone("Google Drive connecté. Tu peux uploader.", "ok");
    return true;
  } catch (error) {
    console.error("Connexion Drive impossible :", error);
    setDriveStatusTone("Connexion Google Drive impossible.", "error");
    alert(`Connexion Google Drive impossible : ${error.message || error}`);
    return false;
  } finally {
    setDriveBusy(false);
  }
}

function cleanDriveFolderId(value) {
  const text = String(value || "").trim();
  const match = text.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match?.[1] || text;
}

function getDriveImageUrl(fileId) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;
}

async function uploadImageToDrive(file, settings) {
  const token = await getDriveAccessToken(settings.clientId);
  const folderId = cleanDriveFolderId(settings.folderId);
  const metadata = {
    name: file.name,
    mimeType: file.type || "image/jpeg"
  };

  if (folderId) metadata.parents = [folderId];

  const boundary = `codex_drive_${Date.now()}`;
  const body = new Blob([
    `--${boundary}\r\n`,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${metadata.mimeType}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`
  ], { type: `multipart/related; boundary=${boundary}` });

  const uploadResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body
  });

  if (!uploadResponse.ok) {
    throw new Error(await uploadResponse.text());
  }

  const uploadedFile = await uploadResponse.json();

  if (settings.sharePublic !== false) {
    const permissionResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploadedFile.id)}/permissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        role: "reader",
        type: "anyone"
      })
    });

    if (!permissionResponse.ok) {
      throw new Error(await permissionResponse.text());
    }
  }

  return {
    ...uploadedFile,
    imageUrl: getDriveImageUrl(uploadedFile.id)
  };
}

function appendDriveImageToEditor(url) {
  const editor = document.getElementById("pageImagesEditor");
  if (!editor) return;

  const row = document.createElement("div");
  row.className = "prof-admin-mini-grid prof-admin-image-row";
  row.dataset.imageRow = "";
  row.innerHTML = `
    <input class="prof-admin-input" data-image-url type="text" value="${escapeHtml(url)}" placeholder="../Images/image.png ou https://...">
    <button type="button" class="prof-admin-danger-btn" data-action="remove-image">Supprimer</button>
  `;

  editor.appendChild(row);
  editor.dispatchEvent(new Event("change", { bubbles: true }));
  row.querySelector("[data-image-url]")?.dispatchEvent(new Event("input", { bubbles: true }));

  setTimeout(() => {
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  }, 200);
}

async function handleDriveFileSelected(event) {
  const file = event.target.files?.[0];
  event.target.value = "";

  if (!file) return;

  const settings = getDriveSettingsFromEditor();
  if (!settings.clientId) {
    setDriveStatusTone("Ajoute d'abord le Client ID Google.", "error");
    return;
  }

  if (!hasDriveToken()) {
    setDriveStatusTone("Clique d'abord sur Connecter Google.", "error");
    return;
  }

  if (!file.type.startsWith("image/")) {
    setDriveStatusTone("Choisis une image.", "error");
    return;
  }

  try {
    setDriveBusy(true);
    setDriveStatusTone("Upload vers Google Drive...", "info");

    const uploadedFile = await uploadImageToDrive(file, settings);
    appendDriveImageToEditor(uploadedFile.imageUrl);
    setDriveStatusTone("Image ajoutée. Enregistre la page pour publier.", "ok");
  } catch (error) {
    console.error("Upload Drive impossible :", error);
    setDriveStatusTone("Upload Google Drive impossible.", "error");
    alert(`Upload Google Drive impossible : ${error.message || error}`);
  } finally {
    setDriveBusy(false);
  }
}

function ensureDriveUploadPanel() {
  const pageImagesEditor = document.getElementById("pageImagesEditor");
  const card = pageImagesEditor?.closest(".prof-admin-edit-card");

  if (!card || getDrivePanel()) return;

  injectDriveStyles();

  const head = card.querySelector(".prof-admin-edit-card-head");
  head?.insertAdjacentHTML("afterend", `
    <div class="prof-admin-drive-upload" id="profAdminDriveUpload">
      <div class="prof-admin-drive-grid">
        <div class="prof-admin-field">
          <label for="driveClientIdInput">Client ID Google</label>
          <input id="driveClientIdInput" class="prof-admin-input" type="text" autocomplete="off">
        </div>
        <div class="prof-admin-field">
          <label for="driveFolderIdInput">Dossier Drive</label>
          <input id="driveFolderIdInput" class="prof-admin-input" type="text" autocomplete="off" placeholder="Optionnel">
        </div>
      </div>
      <div class="prof-admin-drive-actions">
        <label class="prof-admin-check">
          <input id="driveSharePublicInput" type="checkbox" checked>
          Visible avec le lien
        </label>
        <button type="button" class="prof-admin-small-btn" id="saveDriveSettingsBtn">Enregistrer Drive</button>
        <button type="button" class="prof-admin-small-btn" id="driveConnectButton">Connecter Google</button>
        <button type="button" class="prof-admin-small-btn gold" id="driveUploadButton">Uploader depuis le PC</button>
        <input id="driveUploadFileInput" type="file" accept="image/*" hidden>
        <span class="prof-admin-drive-status" id="driveUploadStatus"></span>
      </div>
    </div>
  `);

  document.getElementById("saveDriveSettingsBtn")?.addEventListener("click", saveDriveSettings);
  document.getElementById("driveConnectButton")?.addEventListener("click", connectGoogleDrive);
  document.getElementById("driveUploadButton")?.addEventListener("click", () => {
    if (!hasDriveToken()) {
      setDriveStatusTone("Clique d'abord sur Connecter Google.", "error");
      return;
    }

    document.getElementById("driveUploadFileInput")?.click();
  });
  document.getElementById("driveUploadFileInput")?.addEventListener("change", handleDriveFileSelected);
  hydrateDriveSettings();
}

function startDriveUploadTools() {
  if (driveUploadStarted) return;

  driveUploadStarted = true;
  injectDriveStyles();

  const observer = new MutationObserver(() => {
    ensureDriveUploadPanel();
    hydrateDriveSettings();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  ensureDriveUploadPanel();
  hydrateDriveSettings();
}

if (document.body) {
  startDriveUploadTools();
} else {
  document.addEventListener("DOMContentLoaded", startDriveUploadTools, { once: true });
}
