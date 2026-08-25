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

const HEARTBEAT_MS = 10_000;
const MAX_DESKTOP_AVATARS = 3;
const MAX_MOBILE_AVATARS = 2;
const SECTIONS = new Set(["dashboard", "customResponses", "exams", "modules", "customAccess"]);
const MOBILE_SECTION_MAP = {
  home: "dashboard",
  customs: "customResponses",
  exams: "exams",
  modules: "modules",
  access: "customAccess"
};

let heartbeatTimer = 0;
let currentUser = null;
let requestInFlight = false;

function currentSection() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("prof-rp-7x92q")) return "customResponses";
  if (path.includes("prof-exam-4x91q")) return "exams";
  if (path.includes("prof-modules-eleves")) return "modules";
  if (path.includes("prof-customs-eleves")) return "customAccess";
  return "dashboard";
}

function sectionFromElement(element) {
  const mobileSection = element.dataset.mobileSection;
  if (MOBILE_SECTION_MAP[mobileSection]) return MOBILE_SECTION_MAP[mobileSection];

  const href = String(element.getAttribute("href") || "").toLowerCase();
  const action = String(element.getAttribute("onclick") || "").toLowerCase();
  const text = String(element.textContent || "").toLowerCase();
  const source = `${href} ${action} ${text}`;

  if (source.includes("prof-rp-7x92q") || source.includes("réponses élèves") || source.includes("réponses customs")) return "customResponses";
  if (source.includes("prof-exam-4x91q") || text.includes("examens") || text.includes("corriger les copies")) return "exams";
  if (source.includes("prof-modules-eleves") || text.includes("modules élèves") || text.trim() === "modules") return "modules";
  if (source.includes("prof-customs-eleves") || text.includes("customs élèves") || text.includes("accès customs") || text.trim() === "gérer") return "customAccess";
  if (source.includes("espace-prof") || text.includes("centre de pilotage") || text.includes("tableau de bord") || text.trim() === "accueil") return "dashboard";
  return "";
}

function getTargets() {
  return Array.from(document.querySelectorAll([
    ".v2-nav .v2-nav-item",
    ".prof-mobile-tabbar a[data-mobile-section]",
    ".prof-mobile-menu-grid a"
  ].join(","))).filter(element => {
    if (String(element.textContent || "").toLowerCase().includes("corrigés")) return false;
    return Boolean(sectionFromElement(element));
  });
}

function initials(name) {
  const parts = String(name || "P").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) || "P").toUpperCase();
}

function trustedAvatar(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:"
      && (url.hostname === "cdn.discordapp.com" || url.hostname === "media.discordapp.net")
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function buildAvatar(person) {
  const avatar = document.createElement("span");
  avatar.className = "prof-presence-avatar";
  avatar.title = `${person.displayName} est ici`;
  avatar.setAttribute("aria-label", avatar.title);

  const avatarUrl = trustedAvatar(person.avatarUrl);
  if (avatarUrl) {
    const image = document.createElement("img");
    image.src = avatarUrl;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    avatar.append(image);
  } else {
    const fallback = document.createElement("span");
    fallback.textContent = initials(person.displayName);
    avatar.append(fallback);
  }

  const dot = document.createElement("i");
  dot.setAttribute("aria-hidden", "true");
  avatar.append(dot);
  return avatar;
}

function renderTarget(target, people) {
  target.querySelector(":scope > .prof-presence-stack")?.remove();
  if (!people.length) return;

  const mobile = target.closest(".prof-mobile-tabbar, .prof-mobile-menu-grid");
  const limit = mobile ? MAX_MOBILE_AVATARS : MAX_DESKTOP_AVATARS;
  const stack = document.createElement("span");
  stack.className = "prof-presence-stack";
  stack.dataset.count = String(people.length);
  stack.setAttribute("aria-label", people.map(person => person.displayName).join(", "));

  people.slice(0, limit).forEach(person => stack.append(buildAvatar(person)));
  if (people.length > limit) {
    const overflow = document.createElement("span");
    overflow.className = "prof-presence-overflow";
    overflow.textContent = `+${people.length - limit}`;
    overflow.title = people.slice(limit).map(person => person.displayName).join(", ");
    stack.append(overflow);
  }
  target.append(stack);
}

function renderPresences(presences) {
  const valid = (Array.isArray(presences) ? presences : []).filter(person => SECTIONS.has(person?.section));
  getTargets().forEach(target => {
    const section = sectionFromElement(target);
    renderTarget(target, valid.filter(person => person.section === section));
  });
}

async function sendHeartbeat() {
  // Ne jamais couper la présence quand la fenêtre passe derrière une autre :
  // c'est précisément le cas d'un professeur connecté dans un second navigateur.
  if (!currentUser || requestInFlight) return;
  requestInFlight = true;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const idToken = await currentUser.getIdToken();
    const response = await fetch("/api/prof-presence", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ section: currentSection() }),
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Présence indisponible (${response.status})`);
    const payload = await response.json();
    renderPresences(payload.presences);
    window.dispatchEvent(new CustomEvent("profPresenceUpdated", { detail: payload.presences }));
  } catch (error) {
    console.warn("Présence des professeurs indisponible :", error);
  } finally {
    window.clearTimeout(timeout);
    requestInFlight = false;
  }
}

function startHeartbeat(user) {
  window.clearInterval(heartbeatTimer);
  currentUser = user;
  if (!user) {
    renderPresences([]);
    return;
  }
  sendHeartbeat();
  heartbeatTimer = window.setInterval(sendHeartbeat, HEARTBEAT_MS);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") sendHeartbeat();
});
window.addEventListener("focus", sendHeartbeat);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
onAuthStateChanged(getAuth(app), startHeartbeat);

window.setTimeout(sendHeartbeat, 800);
window.setTimeout(sendHeartbeat, 1800);
