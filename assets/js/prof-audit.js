import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58"
};

let auditUser = null;
const recent = new Map();

function pageCategory() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("prof-modules")) return "modules";
  if (path.includes("prof-exam")) return "examens";
  if (path.includes("prof-rp")) return "customs";
  if (path.includes("prof-customs")) return "customs";
  return "tableau de bord";
}

function cleanLabel(value, maxLength = 120) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

async function sendAudit(action, target = "", details = "") {
  if (!auditUser) return;
  const key = `${pageCategory()}:${action}:${target}`;
  const now = Date.now();
  if (now - Number(recent.get(key) || 0) < 1200) return;
  recent.set(key, now);
  try {
    const token = await auditUser.getIdToken(false);
    await fetch("/api/access/session?audit=1", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ category: pageCategory(), action, target, details }),
      cache: "no-store",
      keepalive: true
    });
  } catch (error) {
    console.warn("Journal d’activité non envoyé :", error?.message || error);
  }
}

function describeAction(element) {
  if (element.matches("[data-module-check]")) return "Modification d’un module";
  if (element.matches("[data-warning-save]")) return "Enregistrement d’un avertissement";
  const label = cleanLabel(element.getAttribute("aria-label") || element.title || element.textContent);
  if (!label) return "";
  if (/approuv|valid|enregistr|sauveg|refus|supprim|archiv|synchron|sync|publier|modifier|corriger|déconnexion/i.test(label)) return label;
  return "";
}

document.addEventListener("click", event => {
  const element = event.target instanceof Element ? event.target.closest("button, a") : null;
  if (!element) return;
  const action = describeAction(element);
  if (!action) return;
  const target = cleanLabel(element.dataset.studentId || element.dataset.id || element.closest("[data-student-id]")?.dataset.studentId || "");
  void sendAudit(action, target);
}, true);

document.addEventListener("change", event => {
  const element = event.target instanceof Element ? event.target : null;
  if (element?.matches("input[data-module-date]")) {
    void sendAudit("Modification d’une date de module", cleanLabel(element.dataset.studentId));
  }
}, true);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
onAuthStateChanged(getAuth(app), user => {
  auditUser = user || null;
  if (!auditUser) return;
  const visitKey = `profAuditVisit:${window.location.pathname}`;
  const previous = Number(sessionStorage.getItem(visitKey) || 0);
  if (Date.now() - previous > 30_000) {
    sessionStorage.setItem(visitKey, String(Date.now()));
    void sendAudit("Ouverture de la page", document.title);
  }
});
