const PROF_USERNAME = "mécaniqueprof";
const PROF_PASSWORD = "5T23UJ4B";

const loginForm = document.getElementById("loginForm");
const loginCard = document.getElementById("loginCard");
const profPanel = document.getElementById("profPanel");
const loginError = document.getElementById("loginError");

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

  if (username === PROF_USERNAME && password === PROF_PASSWORD) {
    localStorage.setItem("profLogged", "true");
    loginCard.style.display = "none";
    profPanel.classList.add("show");
    loginError.classList.remove("show");
  } else {
    loginError.classList.add("show");
  }
});

function logoutProf() {
  localStorage.removeItem("profLogged");
  profPanel.classList.remove("show");
  loginCard.style.display = "block";
}

checkSession();
