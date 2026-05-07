import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

window.firebaseApp = app;
window.firebaseAuth = auth;

const loginForm = document.getElementById("loginForm");
const loginCard = document.getElementById("loginCard");
const profPanel = document.getElementById("profPanel");
const loginError = document.getElementById("loginError");

const authOverlay = document.getElementById("authOverlay");
const authTitle = document.getElementById("authTitle");
const authText = document.getElementById("authText");

let hasLoadedProfData = false;

function showAuthOverlay(title, text) {
  if (!authOverlay || !authTitle || !authText) return;

  authOverlay.style.display = "";
  authTitle.textContent = title;
  authText.textContent = text;
  authOverlay.classList.add("show");
}

function hideAuthOverlay() {
  if (!authOverlay) return;

  authOverlay.classList.remove("show");

  setTimeout(() => {
    authOverlay.style.display = "";
  }, 300);
}

function closeCustomAnswersSafe() {
  document.querySelectorAll(".custom-answer-panel").forEach(panel => {
    panel.classList.remove("show");
  });

  document.body.classList.remove("student-focus");

  const studentDetail = document.getElementById("studentDetail");
  if (studentDetail) {
    studentDetail.classList.remove("show", "focus-pop");
  }

  const examDetail = document.getElementById("examDetail");
  if (examDetail) {
    examDetail.classList.remove("show");
  }
}

function loadProfDataAfterLogin() {
  if (hasLoadedProfData) return;
  hasLoadedProfData = true;

  setTimeout(() => {
    if (typeof window.loadStudents === "function") {
      window.loadStudents();
    } else if (typeof window.loadStudentsFromServer === "function") {
      window.loadStudentsFromServer();
    } else {
      console.warn("Fonction loadStudents introuvable.");
    }

    if (typeof window.loadExamStudents === "function") {
      window.loadExamStudents();
    } else if (typeof window.loadExamStudentsFromServer === "function") {
      window.loadExamStudentsFromServer();
    } else {
      console.warn("Fonction loadExamStudents introuvable.");
    }
  }, 300);
}

function showLogin() {
  document.body.classList.remove("is-prof-logged");

  hasLoadedProfData = false;

  if (loginCard) {
    loginCard.style.display = "block";
  }

  if (profPanel) {
    profPanel.classList.remove("show");
  }

  closeCustomAnswersSafe();
}

function showPanel() {
  document.body.classList.add("is-prof-logged");

  if (loginCard) {
    loginCard.style.display = "none";
  }

  if (profPanel) {
    profPanel.classList.add("show");
  }

  loadProfDataAfterLogin();
}

function showLoginError(message) {
  if (!loginError) return;

  loginError.textContent = message;
  loginError.classList.add("show");
}

function hideLoginError() {
  if (!loginError) return;

  loginError.classList.remove("show");
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const emailInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value.trim() : "";

    hideLoginError();

    if (!email || !password) {
      showLoginError("Email ou mot de passe manquant.");
      return;
    }

    showAuthOverlay("Connexion en cours...", "Vérification des accès professeur.");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      showPanel();
      hideAuthOverlay();
    } catch (error) {
      console.error(error);
      hideAuthOverlay();

      let message = "Email ou mot de passe incorrect.";

      if (error.code === "auth/invalid-email") {
        message = "Adresse email invalide.";
      }

      if (error.code === "auth/user-not-found") {
        message = "Aucun compte professeur trouvé avec cet email.";
      }

      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        message = "Email ou mot de passe incorrect.";
      }

      if (error.code === "auth/too-many-requests") {
        message = "Trop de tentatives. Réessaie plus tard.";
      }

      showLoginError(message);
      showLogin();
    }
  });
}

async function logoutProf() {
  showAuthOverlay("Déconnexion en cours...", "Fermeture de la session professeur.");

  try {
    await signOut(auth);
    closeCustomAnswersSafe();
    showLogin();
    hideAuthOverlay();
  } catch (error) {
    console.error(error);
    hideAuthOverlay();
    showLoginError("Erreur pendant la déconnexion.");
  }
}

window.logoutProf = logoutProf;

onAuthStateChanged(auth, (user) => {
  window.currentProfUser = user || null;

  if (user) {
    showPanel();
  } else {
    showLogin();
  }
});
