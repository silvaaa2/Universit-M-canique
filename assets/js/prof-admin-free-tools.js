import "./prof-admin-preview.js?v=1008";

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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const PRIORITIES = {
  info: "Message admin",
  important: "Message important",
  urgent: "Message urgent"
};

let currentUser = null;
let currentUserIsAdmin = false;
let freeToolsStarted = false;
let previewDebounce = null;
let expirationTimer = null;

onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  currentUserIsAdmin = await loadAdminAccess(user);

  if (currentUserIsAdmin) {
    setTimeout(loadMessageMetaIntoEditor, 500);
    setTimeout(styleToastFromFirestore, 500);
  }
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

async function getAdminMessage() {
  const snap = await getDoc(doc(db, "profSettings", "adminMessage"));
  return snap.exists() ? snap.data() : {};
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function injectFreeToolStyles() {
  if (document.getElementById("profAdminFreeToolStyles")) return;

  const style = document.createElement("style");
  style.id = "profAdminFreeToolStyles";
  style.textContent = `
    .prof-admin-message-toast.priority-info {
      border-color: rgba(125,211,252,.45) !important;
      box-shadow:
        0 0 0 1px rgba(125,211,252,.10),
        0 0 26px rgba(125,211,252,.22),
        0 22px 70px rgba(0,0,0,.52),
        inset 0 1px 0 rgba(255,255,255,.08) !important;
    }

    .prof-admin-message-toast.priority-info::before {
      display: none !important;
    }

    .prof-admin-message-toast.priority-info .prof-admin-toast-progress {
      background: linear-gradient(90deg, #7dd3fc, rgba(255,255,255,.72)) !important;
    }

    .prof-admin-message-toast.priority-important {
      border-color: rgba(251,191,36,.58) !important;
      box-shadow:
        0 0 0 1px rgba(251,191,36,.12),
        0 0 30px rgba(251,191,36,.32),
        0 0 68px rgba(214,180,106,.22),
        0 22px 70px rgba(0,0,0,.52),
        inset 0 1px 0 rgba(255,255,255,.08) !important;
    }

    .prof-admin-message-toast.priority-important::before,
    .prof-admin-message-toast.priority-important .prof-admin-toast-progress {
      background: linear-gradient(180deg, #fbbf24, var(--gold2)) !important;
    }

    .prof-admin-message-toast.priority-urgent {
      border-color: rgba(248,113,113,.62) !important;
      box-shadow:
        0 0 0 1px rgba(248,113,113,.14),
        0 0 34px rgba(248,113,113,.34),
        0 0 76px rgba(214,180,106,.22),
        0 22px 70px rgba(0,0,0,.52),
        inset 0 1px 0 rgba(255,255,255,.08) !important;
    }

    .prof-admin-message-toast.priority-urgent::before,
    .prof-admin-message-toast.priority-urgent .prof-admin-toast-progress {
      background: linear-gradient(180deg, #f87171, #fbbf24) !important;
    }

    .prof-admin-date-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
    }

    .prof-admin-date-actions input {
      min-width: 0;
    }

    .prof-admin-mini-btn {
      height: 42px;
      padding: 0 14px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      background: rgba(255,255,255,.055);
      color: var(--muted);
      font-size: 12px;
      font-weight: 1000;
      cursor: pointer;
      white-space: nowrap;
    }

    .prof-admin-mini-btn:hover {
      border-color: rgba(214,180,106,.34);
      color: var(--gold2);
      background: rgba(214,180,106,.12);
    }

    .prof-admin-image-row-enhanced {
      grid-template-columns: minmax(0, 1fr) auto auto auto auto !important;
    }

    .prof-admin-icon-btn {
      width: 42px;
      height: 42px;
      display: inline-grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      background: rgba(255,255,255,.055);
      color: var(--text);
      font-size: 16px;
      font-weight: 1000;
      cursor: pointer;
    }

    .prof-admin-icon-btn:hover {
      border-color: rgba(214,180,106,.34);
      background: rgba(214,180,106,.12);
      color: var(--gold2);
    }

    .prof-admin-image-link-preview {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      min-height: 72px;
      padding: 10px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 8px;
      background: rgba(0,0,0,.22);
    }

    .prof-admin-image-link-preview[hidden] {
      display: none !important;
    }

    .prof-admin-image-link-preview img {
      width: 96px;
      height: 58px;
      object-fit: contain;
      border-radius: 6px;
      background: rgba(0,0,0,.38);
    }

    .prof-admin-image-link-preview span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
      line-height: 1.35;
      word-break: break-word;
    }

    .prof-admin-image-link-preview[data-tone="ok"] span {
      color: #86efac;
    }

    .prof-admin-image-link-preview[data-tone="error"] span {
      color: #fca5a5;
    }

    @media (max-width: 780px) {
      .prof-admin-image-row-enhanced {
        grid-template-columns: 1fr 1fr 1fr 1fr !important;
      }

      .prof-admin-image-row-enhanced [data-image-url] {
        grid-column: 1 / -1;
      }

      .prof-admin-image-link-preview {
        grid-template-columns: 1fr;
      }

      .prof-admin-image-link-preview img {
        width: 100%;
        height: 120px;
      }
    }
  `;

  document.head.appendChild(style);
}

function getPriorityInput() {
  return document.getElementById("messagePriorityInput");
}

function getExpirationInput() {
  return document.getElementById("messageExpiresAtInput");
}

function getClearExpirationButton() {
  return document.getElementById("clearMessageExpirationBtn");
}

function ensureMessageMetaControls() {
  const panel = document.querySelector('[data-admin-panel="message"]');
  const grid = panel?.querySelector(".prof-admin-field-grid");

  if (!panel || !grid || getPriorityInput()) return;

  grid.insertAdjacentHTML("beforeend", `
    <div class="prof-admin-field">
      <label for="messagePriorityInput">Priorité</label>
      <select id="messagePriorityInput" class="prof-admin-select">
        <option value="info">Info</option>
        <option value="important">Important</option>
        <option value="urgent">Urgent</option>
      </select>
    </div>

    <div class="prof-admin-field">
      <label for="messageExpiresAtInput">Fin d'affichage</label>
      <div class="prof-admin-date-actions">
        <input id="messageExpiresAtInput" type="datetime-local" class="prof-admin-input">
        <button type="button" class="prof-admin-mini-btn" id="clearMessageExpirationBtn">Retirer</button>
      </div>
    </div>
  `);

  getClearExpirationButton()?.addEventListener("click", () => {
    const input = getExpirationInput();
    if (input) input.value = "";
  });
}

function getDateFromStoredValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDatetimeLocalValue(date) {
  if (!date) return "";

  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getExpirationIsoFromEditor() {
  const value = getExpirationInput()?.value || "";
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function messageIsExpired(data = {}) {
  const expiresAt = getDateFromStoredValue(data.expiresAt);
  return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
}

function scheduleMessageExpirationCheck(data = {}) {
  if (expirationTimer) {
    clearTimeout(expirationTimer);
    expirationTimer = null;
  }

  const expiresAt = getDateFromStoredValue(data.expiresAt);
  if (!expiresAt) return;

  const delay = expiresAt.getTime() - Date.now();
  if (delay <= 0 || delay > 2147483000) return;

  expirationTimer = setTimeout(styleToastFromFirestore, delay + 400);
}

async function loadMessageMetaIntoEditor() {
  const priorityInput = getPriorityInput();
  const expirationInput = getExpirationInput();
  if (!priorityInput && !expirationInput) return;

  try {
    const data = await getAdminMessage();

    if (priorityInput) {
      priorityInput.value = ["info", "important", "urgent"].includes(data.priority)
        ? data.priority
        : "info";
    }

    if (expirationInput) {
      expirationInput.value = toDatetimeLocalValue(getDateFromStoredValue(data.expiresAt));
    }
  } catch (error) {
    console.warn("Réglages du message indisponibles :", error);
  }
}

function applyPriorityToToast(priority = "info") {
  const toast = document.getElementById("profAdminMessageBanner");
  if (!toast) return;

  const finalPriority = ["info", "important", "urgent"].includes(priority) ? priority : "info";

  toast.classList.remove("priority-info", "priority-important", "priority-urgent");
  toast.classList.add(`priority-${finalPriority}`);

  const label = toast.querySelector("span");
  if (label) label.textContent = PRIORITIES[finalPriority];
}

async function styleToastFromFirestore() {
  try {
    const data = await getAdminMessage();
    scheduleMessageExpirationCheck(data);

    const toast = document.getElementById("profAdminMessageBanner");
    if (toast && messageIsExpired(data)) {
      toast.dataset.expiredHidden = "true";
      toast.hidden = true;
      toast.style.display = "none";
      return;
    }

    if (toast?.dataset.expiredHidden === "true") {
      delete toast.dataset.expiredHidden;
      toast.hidden = false;
      toast.style.display = "";
    }

    applyPriorityToToast(data.priority || "info");
  } catch (error) {
    console.warn("Style priorité indisponible :", error);
  }
}

function saveMessageMetaAfterCoreSave() {
  const priorityInput = getPriorityInput();
  if (!priorityInput || !currentUserIsAdmin) return;

  const priority = priorityInput.value || "info";
  const expiresAt = getExpirationIsoFromEditor();

  [900, 1800, 3200].forEach(delay => {
    setTimeout(async () => {
      try {
        await setDoc(doc(db, "profSettings", "adminMessage"), {
          priority,
          expiresAt,
          updatedAt: serverTimestamp(),
          updatedBy: window.profIdentityUtils.getProfActorId(currentUser)
        }, { merge: true });

        await styleToastFromFirestore();
      } catch (error) {
        console.warn("Réglages du message non sauvegardés :", error);
      }
    }, delay);
  });
}

function enhanceMessagePanel() {
  const panel = document.querySelector('[data-admin-panel="message"]');
  if (!panel || panel.dataset.priorityEnhanced === "true") return;

  panel.dataset.priorityEnhanced = "true";
  ensureMessageMetaControls();
  loadMessageMetaIntoEditor();

  const saveButton = document.getElementById("saveMessageBtn");
  saveButton?.addEventListener("click", saveMessageMetaAfterCoreSave);
}

function setImagePreview(row, html, tone = "") {
  const preview = row.querySelector("[data-image-link-preview]");
  if (!preview) return;

  preview.hidden = false;
  preview.dataset.tone = tone;
  preview.innerHTML = html;
}

function testImageRow(row, silent = false) {
  const input = row.querySelector("[data-image-url]");
  const url = input?.value?.trim() || "";
  const preview = row.querySelector("[data-image-link-preview]");

  if (!url) {
    if (preview) preview.hidden = true;
    return;
  }

  if (!silent) {
    setImagePreview(row, `<span>Test du lien...</span>`);
  }

  const img = new Image();

  img.onload = () => {
    setImagePreview(
      row,
      `<img src="${escapeHtml(url)}" alt="Aperçu"><span>Image chargée correctement.</span>`,
      "ok"
    );
  };

  img.onerror = () => {
    setImagePreview(
      row,
      `<span>Impossible de charger cette image. Vérifie le lien ou le chemin.</span>`,
      "error"
    );
  };

  img.src = url;
}

function dispatchImageRowsChanged() {
  document.getElementById("pageImagesEditor")
    ?.dispatchEvent(new Event("change", { bubbles: true }));
}

function moveImageRow(row, direction) {
  const sibling = direction < 0
    ? row.previousElementSibling
    : row.nextElementSibling;

  if (!sibling) return;

  if (direction < 0) {
    row.parentElement.insertBefore(row, sibling);
  } else {
    row.parentElement.insertBefore(sibling, row);
  }

  dispatchImageRowsChanged();
}

function enhanceImageRow(row) {
  if (!row || row.dataset.freeImageEnhanced === "true") return;

  row.dataset.freeImageEnhanced = "true";
  row.classList.add("prof-admin-image-row-enhanced");

  const removeButton = row.querySelector('[data-action="remove-image"]');
  removeButton?.insertAdjacentHTML("beforebegin", `
    <button type="button" class="prof-admin-icon-btn" data-free-action="test-image-link" title="Tester le lien">✓</button>
    <button type="button" class="prof-admin-icon-btn" data-free-action="move-image-up" title="Monter">↑</button>
    <button type="button" class="prof-admin-icon-btn" data-free-action="move-image-down" title="Descendre">↓</button>
  `);

  row.insertAdjacentHTML("beforeend", `
    <div class="prof-admin-image-link-preview" data-image-link-preview hidden></div>
  `);

  const input = row.querySelector("[data-image-url]");
  input?.addEventListener("input", () => {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(() => testImageRow(row, true), 350);
  });

  testImageRow(row, true);
}

function enhanceImageRows() {
  document.querySelectorAll("[data-image-row]").forEach(enhanceImageRow);
}

function handleFreeToolClicks(event) {
  const button = event.target.closest("[data-free-action]");
  if (!button) return;

  const row = button.closest("[data-image-row]");
  if (!row) return;

  const action = button.dataset.freeAction;

  if (action === "test-image-link") {
    testImageRow(row);
  }

  if (action === "move-image-up") {
    moveImageRow(row, -1);
  }

  if (action === "move-image-down") {
    moveImageRow(row, 1);
  }
}

function startFreeTools() {
  if (freeToolsStarted) return;

  freeToolsStarted = true;
  injectFreeToolStyles();
  document.addEventListener("click", handleFreeToolClicks);

  const observer = new MutationObserver(() => {
    enhanceMessagePanel();
    enhanceImageRows();

    const toast = document.getElementById("profAdminMessageBanner");
    if (toast) styleToastFromFirestore();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  enhanceMessagePanel();
  enhanceImageRows();
  styleToastFromFirestore();
}

if (document.body) {
  startFreeTools();
} else {
  document.addEventListener("DOMContentLoaded", startFreeTools, { once: true });
}
