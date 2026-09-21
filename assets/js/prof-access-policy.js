import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58"
};

const ALL_PERMISSIONS = new Set(["dashboard", "corrections", "customResponses", "exams", "modules", "customAccess", "stages"]);
const CHECK_INTERVAL_MS = 20_000;
let timer = 0;
let currentUser = null;
let revoking = false;

function currentSection() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("prof-rp-7x92q")) return "customResponses";
  if (path.includes("prof-exam-4x91q")) return "exams";
  if (path.includes("prof-modules-eleves")) return "modules";
  if (path.includes("prof-customs-eleves")) return "customAccess";
  if (path.startsWith("/stages")) return "stages";
  return "dashboard";
}

function permissionForElement(element) {
  const href = String(element.getAttribute("href") || "").toLowerCase();
  const action = String(element.getAttribute("onclick") || "").toLowerCase();
  const text = String(element.textContent || "").toLowerCase();
  const source = `${href} ${action} ${text}`;
  if (source.includes("prof-rp-7x92q") || source.includes("réponses élèves")) return "customResponses";
  if (source.includes("prof-exam-4x91q") || text.trim() === "examens") return "exams";
  if (source.includes("prof-modules-eleves") || source.includes("modules élèves")) return "modules";
  if (source.includes("prof-customs-eleves") || source.includes("customs élèves")) return "customAccess";
  if (source.includes("stages/") || source.includes("suivi de stage")) return "stages";
  if (source.includes("corrig") || text.trim() === "corrigés") return "corrections";
  if (source.includes("espace-prof") || source.includes("tableau de bord") || source.includes("centre de pilotage")) return "dashboard";
  return "";
}

function applyPermissions(policy) {
  const permissions = new Set(Array.isArray(policy.permissions) ? policy.permissions : []);
  if (policy.admin) ALL_PERMISSIONS.forEach(permission => permissions.add(permission));
  window.profAccessPolicy = { ...policy, permissions: [...permissions] };
  document.documentElement.dataset.profPolicyReady = "true";

  document.querySelectorAll("a, button[onclick], [data-mobile-section]").forEach(element => {
    const permission = permissionForElement(element);
    if (!permission) return;
    const allowed = permissions.has(permission);
    element.hidden = !allowed;
    element.setAttribute("aria-hidden", String(!allowed));
  });

  const adminButton = document.getElementById("profAdminBtn");
  if (adminButton) adminButton.hidden = policy.admin !== true;
  return permissions;
}

function showRevokedMessage(message) {
  let overlay = document.getElementById("profAccessRevokedOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "profAccessRevokedOverlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:30000;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.92);color:#fff;font-family:inherit";
    overlay.innerHTML = `<section style="width:min(440px,100%);padding:28px;border:1px solid rgba(214,180,106,.35);border-radius:18px;background:#121310;text-align:center"><strong style="display:block;font-size:22px">Session fermée</strong><p style="margin:12px 0 0;color:#aaa;line-height:1.5"></p></section>`;
    document.body.appendChild(overlay);
  }
  overlay.querySelector("p").textContent = message || "Cette session a été déconnectée par un administrateur.";
}

async function revokeAccess(message) {
  if (revoking) return;
  revoking = true;
  window.clearTimeout(timer);
  showRevokedMessage(message);
  window.dispatchEvent(new CustomEvent("profAccessRevoked", { detail: { message } }));
  try { await signOut(getAuth()); } catch {}
  window.setTimeout(() => window.location.replace("/"), 1600);
}

async function checkPolicy() {
  if (!currentUser || revoking) return;
  try {
    const token = await currentUser.getIdToken(false);
    const response = await fetch("/api/access/session?prof=access", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      await revokeAccess(payload.error || "Ton accès a été coupé par un administrateur.");
      return;
    }
    if (!response.ok) throw new Error(payload.error || `Accès indisponible (${response.status})`);
    const permissions = applyPermissions(payload);
    if (!permissions.has(currentSection())) {
      window.location.replace("/pages/espace-prof.html?access=restricted");
      return;
    }
  } catch (error) {
    console.warn("Contrôle des permissions temporairement indisponible :", error?.message || error);
  } finally {
    if (!revoking && currentUser) timer = window.setTimeout(checkPolicy, CHECK_INTERVAL_MS);
  }
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
onAuthStateChanged(getAuth(app), user => {
  window.clearTimeout(timer);
  currentUser = user || null;
  if (currentUser) void checkPolicy();
});

window.addEventListener("focus", () => {
  if (currentUser && !revoking) {
    window.clearTimeout(timer);
    void checkPolicy();
  }
});
