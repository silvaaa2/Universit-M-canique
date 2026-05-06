const PROF_USERNAME = "mecaniqueprof";
const PROF_PASSWORD = "module4prof";

const loginForm = document.getElementById("loginForm");
const loginCard = document.getElementById("loginCard");
const profPanel = document.getElementById("profPanel");
const loginError = document.getElementById("loginError");

const authOverlay = document.getElementById("authOverlay");
const authTitle = document.getElementById("authTitle");
const authText = document.getElementById("authText");

function showAuthOverlay(title, text) {
  authTitle.textContent = title;
  authText.textContent = text;
  authOverlay.classList.add("show");
}

function hideAuthOverlay() {
  authOverlay.classList.remove("show");
}

function showLogin() {
  document.body.classList.remove("is-prof-logged");

  loginCard.style.display = "block";
  profPanel.classList.remove("show");

  closeCustomAnswersSafe();
}

function showPanel() {
  document.body.classList.add("is-prof-logged");

  loginCard.style.display = "none";
  profPanel.classList.add("show");
}

function closeCustomAnswersSafe() {
  document.querySelectorAll(".custom-answer-panel").forEach(panel => {
    panel.classList.remove("show");
  });
}

function checkSession() {
  const isLogged = localStorage.getItem("profLogged") === "true";

  if (isLogged) {
    showPanel();
  } else {
    showLogin();
  }
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  loginError.classList.remove("show");

  showAuthOverlay("Connexion en cours...", "Vérification des accès professeur.");

  setTimeout(() => {
    if (username === PROF_USERNAME && password === PROF_PASSWORD) {
      localStorage.setItem("profLogged", "true");
      showPanel();
      hideAuthOverlay();
    } else {
      localStorage.removeItem("profLogged");
      showLogin();
      hideAuthOverlay();
      loginError.classList.add("show");
    }
  }, 900);
});

function logoutProf() {
  showAuthOverlay("Déconnexion en cours...", "Fermeture de la session professeur.");

  setTimeout(() => {
    localStorage.removeItem("profLogged");
    showLogin();
    hideAuthOverlay();
  }, 900);
}

checkSession();
