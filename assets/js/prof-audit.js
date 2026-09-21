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

function studentTarget(element) {
  const card = element.closest("[data-answer-card], [data-student-row]");
  const warningModal = element.closest("#moduleWarningModal");
  const name = cleanLabel(
    card?.dataset.studentName
    || card?.querySelector("h2,strong")?.textContent
    || warningModal?.querySelector("#moduleWarningTitle")?.textContent
    || ""
  );
  const id = cleanLabel(
    element.dataset.studentId
    || card?.dataset.idUnique
    || card?.dataset.normalizedIdUnique
    || card?.dataset.studentRow
    || warningModal?.querySelector("#moduleWarningSubtitle")?.textContent?.replace(/^ID Unique\s*:\s*/i, "")
    || ""
  );
  return [name, id ? `ID ${id}` : ""].filter(Boolean).join(" · ");
}

function describeAction(element) {
  if (element.matches("[data-module-check]")) {
    const label = cleanLabel(element.dataset.checkLabel || element.dataset.moduleKey || "Module");
    const willValidate = element.dataset.checked !== "true";
    return {
      action: willValidate ? `Validation : ${label}` : `Annulation : ${label}`,
      target: studentTarget(element),
      details: `Nouvel état demandé : ${willValidate ? "validé" : "non validé"}`
    };
  }
  if (element.matches("[data-warning-save]")) {
    const modal = element.closest("#moduleWarningModal");
    const level = cleanLabel(modal?.querySelector("[data-warning-choice].active")?.textContent || "Non précisé");
    const comment = cleanLabel(modal?.querySelector("#moduleWarningComment")?.value || "Aucun motif", 300);
    return {
      action: "Enregistrement d’un avertissement",
      target: studentTarget(element) || "Élève sélectionné",
      details: `Niveau : ${level} · Motif : ${comment}`
    };
  }
  if (element.matches("[data-set-status]")) {
    const approved = element.dataset.setStatus === "approved";
    return {
      action: approved ? "Réponse approuvée" : "Réponse refusée",
      target: studentTarget(element),
      details: `Décision : ${approved ? "approuvée" : "refusée"}`
    };
  }
  const label = cleanLabel(element.getAttribute("aria-label") || element.title || element.textContent);
  if (!label) return null;
  if (/approuv|valid|enregistr|sauveg|refus|supprim|archiv|synchron|sync|publier|modifier|corriger|déconnexion/i.test(label)) {
    return { action: label, target: studentTarget(element), details: `Commande utilisée : ${label}` };
  }
  return null;
}

document.addEventListener("click", event => {
  const element = event.target instanceof Element ? event.target.closest("button, a") : null;
  if (!element) return;
  if (element.closest("#profAccessControlModal")) return;
  const description = describeAction(element);
  if (!description) return;
  void sendAudit(description.action, description.target, description.details);
}, true);

document.addEventListener("change", event => {
  const element = event.target instanceof Element ? event.target : null;
  if (element?.matches("input[data-module-date]")) {
    const moduleName = cleanLabel(
      element.getAttribute("aria-label")?.match(/^Date\s+(.+?)\s+pour\s+/i)?.[1]
      || element.dataset.moduleKey
      || "module"
    );
    void sendAudit(
      `Date modifiée : ${moduleName}`,
      studentTarget(element),
      `Nouvelle date : ${cleanLabel(element.value || "date supprimée")}`
    );
  }
  if (element?.matches("[data-score-input]")) {
    const control = element.closest("[data-score-control]");
    const question = cleanLabel(element.closest("[data-exam-line]")?.querySelector(".exam-line-content span")?.textContent || "Question");
    const maximum = cleanLabel(control?.dataset.maxPoints || "0");
    void sendAudit(
      "Note d’examen modifiée",
      studentTarget(element),
      `${question} : ${cleanLabel(element.value || "0")} / ${maximum}`
    );
  }
}, true);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
onAuthStateChanged(getAuth(app), user => {
  auditUser = user || null;
});
