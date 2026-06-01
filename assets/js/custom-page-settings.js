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

const CUSTOM_BY_PAGE = {
  "custom-facile.html": "sentinelClassic",
  "custom-moyen.html": "argento2f",
  "custom-difficile.html": "cypher"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

function getCustomId() {
  const pageName = window.location.pathname.split("/").pop();
  return CUSTOM_BY_PAGE[pageName] || null;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element && value) element.textContent = value;
}

function setAttribute(selector, attribute, value) {
  const element = document.querySelector(selector);
  if (element && value) element.setAttribute(attribute, value);
}

function normalizeImages(images) {
  return Array.isArray(images) ? images.map(String).filter(Boolean) : [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyGallery(images) {
  const galleryImages = normalizeImages(images);
  const vehicleImage = document.getElementById("vehicleImage");
  const currentImage = document.getElementById("currentImage");
  const totalImages = document.getElementById("totalImages");

  if (!vehicleImage || !galleryImages.length) return;

  let currentIndex = 0;

  function renderImage(fade = true) {
    if (fade) vehicleImage.classList.add("fade-out");

    setTimeout(() => {
      vehicleImage.src = galleryImages[currentIndex];
      vehicleImage.alt = `Photo ${currentIndex + 1}`;

      if (currentImage) currentImage.textContent = String(currentIndex + 1);
      if (totalImages) totalImages.textContent = String(galleryImages.length);

      vehicleImage.classList.remove("fade-out");
    }, fade ? 180 : 0);
  }

  window.changeImage = function(direction) {
    currentIndex += direction;

    if (currentIndex < 0) currentIndex = galleryImages.length - 1;
    if (currentIndex >= galleryImages.length) currentIndex = 0;

    renderImage(true);
  };

  renderImage(false);
}

function applyInfoRows(rows) {
  const list = document.querySelector(".info-list");
  if (!list || !Array.isArray(rows)) return;

  const html = rows
    .map(row => {
      const label = String(row?.label || "").trim();
      const value = String(row?.value || "").trim();
      const tone = ["yes", "no"].includes(row?.tone) ? row.tone : "yes";

      if (!label && !value) return "";

      return `
        <div class="info-line">
          <span>${escapeHtml(label)}</span>
          <b class="${tone}">${escapeHtml(value)}</b>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  if (html) list.innerHTML = html;
}

function applyPageSettings(data) {
  if (!data || typeof data !== "object") return;

  if (data.label && data.vehicleName) {
    document.title = `${data.label} - ${data.vehicleName}`;
  }

  setText("#loader h2", data.label);
  setText(".page-top h1", data.label);
  setText(".page-top .intro", data.intro);
  setText(".info-head h2", data.vehicleName);

  setAttribute(".btn.primary.full", "href", data.formUrl);
  setText(".btn.primary.full", data.formText);

  setAttribute(".meteo-card img", "src", data.meteoImage);

  applyGallery(data.images);
  applyInfoRows(data.infoRows);
}

async function startCustomPageSettings() {
  const customId = getCustomId();
  if (!customId) return;

  try {
    const snap = await getDoc(doc(db, "customPages", customId));
    if (!snap.exists()) return;

    applyPageSettings(snap.data());
  } catch (error) {
    console.warn("Configuration Custom indisponible :", error);
  }
}

startCustomPageSettings();
