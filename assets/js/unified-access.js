import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signOut, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getProfAccess, isProfAllowed } from "./prof-identity.js?v=2";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const DISCORD_SIGNIN_TIMEOUT_MS = 12000;

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error("La vérification prend trop de temps. Réessaie.")), ms);
    })
  ]).finally(() => window.clearTimeout(timer));
}

async function verifyProfAccess(user) {
  const access = await getProfAccess(user);
  if (!isProfAllowed(access)) throw new Error("Accès refusé. Ce compte n’est pas autorisé comme professeur.");
  return access;
}

function setBusy(controls, busy) {
  controls.filter(Boolean).forEach(control => {
    control.disabled = busy;
    if (busy) control.setAttribute("aria-busy", "true");
    else control.removeAttribute("aria-busy");
  });
}

async function clearCompanySession() {
  await fetch("/api/access/session", {
    method: "DELETE",
    credentials: "same-origin"
  }).catch(() => null);
}

async function animateAccess({ label, role, detail = "Ouverture de votre espace…" }) {
  await window.UniversityMotion?.completeAccess({
    mode: "enter",
    title: `Bienvenue, ${label}`,
    detail,
    validatedTitle: "Accès validé",
    validatedDetail: `Bienvenue, ${label}.`,
    minimum: 1000,
    validationHold: 480,
    hold: 560
  });
  window.UniversityMotion?.prepareArrival({ label, role });
  await window.UniversityMotion?.departAccess({ detail });
}

async function enterStudent() {
  const button = document.getElementById("studentAccessButton");
  const status = document.getElementById("studentStatus");
  setBusy([button], true);
  status.textContent = "Préparation de l’espace élève…";
  window.UniversityMotion?.beginAccess({
    mode: "enter",
    title: "Connexion en cours",
    detail: "Préparation de votre espace…"
  });

  try {
    if (auth.currentUser) await signOut(auth);
    await clearCompanySession();
    sessionStorage.setItem("universityStudentAccess", String(Date.now()));
    await animateAccess({ label: "Élève", role: "student" });
    window.location.assign("/eleve.html");
  } catch (error) {
    await window.UniversityMotion?.hideAccess();
    status.textContent = "Impossible d’ouvrir l’espace élève.";
    setBusy([button], false);
  }
}

async function enterCompany(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector("input[name='code']");
  const button = form.querySelector("button[type='submit']");
  const status = document.getElementById("companyStatus");
  const code = input.value.trim();
  if (!code) {
    status.textContent = "Saisissez votre code.";
    input.focus();
    return;
  }

  status.className = "form-status";
  status.textContent = "Vérification…";
  setBusy([input, button], true);
  window.UniversityMotion?.beginAccess({
    mode: "enter",
    title: "Connexion en cours",
    detail: "Vérification du code entreprise…"
  });

  try {
    const response = await fetch("/api/access/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ code })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.authenticated) {
      throw new Error(payload.error || "Accès refusé.");
    }

    if (auth.currentUser) await signOut(auth);
    sessionStorage.removeItem("universityStudentAccess");
    status.classList.add("success");
    status.textContent = `Accès validé · ${payload.label}`;
    await animateAccess({ label: payload.label, role: "company" });
    window.location.assign(payload.target || "/stages/");
  } catch (error) {
    await window.UniversityMotion?.hideAccess();
    status.textContent = error?.message || "Connexion impossible.";
    setBusy([input, button], false);
  }
}

async function enterDiscord() {
  const button = document.getElementById("discordAccessButton");
  const status = document.getElementById("discordStatus");
  setBusy([button], true);
  status.textContent = "Ouverture de Discord…";
  window.UniversityMotion?.beginAccess({
    mode: "enter",
    title: "Connexion Discord",
    detail: "Ouverture de la vérification sécurisée…"
  });

  try {
    await clearCompanySession();
    sessionStorage.removeItem("universityStudentAccess");
    await new Promise(resolve => window.setTimeout(resolve, 760));
    await window.UniversityMotion?.departAccess({ detail: "Redirection vers Discord…" });
    window.location.assign("/api/auth/discord/start");
  } catch (error) {
    await window.UniversityMotion?.hideAccess();
    status.textContent = "Connexion Discord indisponible.";
    setBusy([button], false);
  }
}

async function completeDiscordLogin() {
  const button = document.getElementById("discordAccessButton");
  const status = document.getElementById("discordStatus");
  setBusy([button], true);
  status.textContent = "Validation de votre connexion Discord…";
  window.UniversityMotion?.beginAccess({
    mode: "enter",
    title: "Connexion Discord",
    detail: "Validation de votre session…"
  });

  let signedInForAttempt = false;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), DISCORD_SIGNIN_TIMEOUT_MS);
    let response;
    try {
      response = await fetch("/api/auth/discord/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal
      });
    } finally {
      window.clearTimeout(timer);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.customToken) {
      throw new Error(payload.error || "Connexion Discord impossible.");
    }

    const credential = await withTimeout(
      signInWithCustomToken(auth, payload.customToken),
      DISCORD_SIGNIN_TIMEOUT_MS
    );
    signedInForAttempt = true;
    await verifyProfAccess(credential.user);
    await clearCompanySession();
    sessionStorage.removeItem("universityStudentAccess");
    const displayName = credential.user.profDisplayName || payload.profile?.displayName || "Professeur";
    await animateAccess({ label: displayName, role: "prof" });
    window.location.assign("/pages/espace-prof.html");
  } catch (error) {
    if (signedInForAttempt) await signOut(auth).catch(() => null);
    await window.UniversityMotion?.hideAccess();
    status.textContent = error?.name === "AbortError"
      ? "Connexion Discord trop longue. Réessaie."
      : error?.message || "Connexion Discord impossible.";
    setBusy([button], false);
  }
}

const companyToggle = document.getElementById("companyAccessToggle");
const companyPanel = document.getElementById("companyAccessPanel");
companyToggle?.addEventListener("click", () => {
  const shouldOpen = companyPanel.hidden;
  companyPanel.hidden = !shouldOpen;
  companyToggle.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) document.getElementById("companyCode")?.focus();
});

document.getElementById("studentAccessButton")?.addEventListener("click", enterStudent);
document.getElementById("discordAccessButton")?.addEventListener("click", enterDiscord);
document.getElementById("companyAccessForm")?.addEventListener("submit", enterCompany);

const accessParams = new URLSearchParams(window.location.search);
const discordErrors = {
  discord_cancelled: "Connexion Discord annulée.",
  session_expired: "La connexion Discord a expiré. Recommence.",
  access_denied: "Accès refusé. Ce compte Discord n’est pas autorisé.",
  not_member: "Ce compte n’est pas présent sur le serveur Discord.",
  sheet_invalid: "La liste des professeurs est mal configurée.",
  sheet_unavailable: "La liste des professeurs est momentanément indisponible.",
  discord_exchange: "Discord n’a pas pu valider la connexion.",
  discord_unavailable: "Discord est momentanément indisponible.",
  configuration: "La connexion Discord n’est pas complètement configurée.",
  unknown: "La connexion Discord a échoué. Réessaie."
};
if (accessParams.get("discord") === "complete") {
  window.history.replaceState({}, "", "/");
  void completeDiscordLogin();
} else {
  const discordError = accessParams.get("discord_error");
  const loginError = accessParams.get("login_error");
  const status = document.getElementById("discordStatus");
  if (discordError) status.textContent = discordErrors[discordError] || discordErrors.unknown;
  else if (loginError === "access_denied") status.textContent = "Accès refusé. Ce compte n’est pas autorisé comme professeur.";
  else if (loginError === "verification_unavailable") status.textContent = "Impossible de vérifier le compte pour le moment. Réessaie.";
}

fetch("/api/access/session", { credentials: "same-origin", cache: "no-store" })
  .then(response => response.ok ? response.json() : null)
  .then(session => {
    if (!session?.authenticated || session.role !== "company") return;
    const status = document.getElementById("companyStatus");
    if (status) status.textContent = `Session active · ${session.label}`;
  })
  .catch(() => null);
