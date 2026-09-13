import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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

function setBusy(controls, busy) {
  controls.filter(Boolean).forEach(control => {
    control.disabled = busy;
    if (busy) control.setAttribute("aria-busy", "true");
    else control.removeAttribute("aria-busy");
  });
}

async function clearCompanySession() {
  await fetch("/api/access/logout", {
    method: "POST",
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
    const response = await fetch("/api/access/company-login", {
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

fetch("/api/access/session", { credentials: "same-origin", cache: "no-store" })
  .then(response => response.ok ? response.json() : null)
  .then(session => {
    if (!session?.authenticated || session.role !== "company") return;
    const status = document.getElementById("companyStatus");
    if (status) status.textContent = `Session active · ${session.label}`;
  })
  .catch(() => null);
