const PROF_USERNAME = "mecaniqueprof";
const PROF_PASSWORD = "mecaniqueflashbackfa";

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

function checkSession() {
  const isLogged = localStorage.getItem("profLogged") === "true";

  if (isLogged) {
    loginCard.style.display = "none";
    profPanel.classList.add("show");
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

      loginCard.classList.add("fade-out");

      setTimeout(() => {
        loginCard.style.display = "none";
        loginCard.classList.remove("fade-out");

        profPanel.classList.add("show");
        hideAuthOverlay();
      }, 350);

    } else {
      hideAuthOverlay();

      setTimeout(() => {
        loginError.classList.add("show");
      }, 150);
    }
  }, 1100);
});

function logoutProf() {
  showAuthOverlay("Déconnexion en cours...", "Fermeture de la session professeur.");

  profPanel.classList.add("fade-out");

  setTimeout(() => {
    localStorage.removeItem("profLogged");

    profPanel.classList.remove("show");
    profPanel.classList.remove("fade-out");

    loginCard.style.display = "block";
    loginError.classList.remove("show");

    hideAuthOverlay();
  }, 1100);
}

checkSession();
