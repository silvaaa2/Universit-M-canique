import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

console.log("prof-auth.js chargé ✅");

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const loginSection = document.getElementById("loginSection");
const profDashboard = document.getElementById("profDashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");

if (!loginForm) {
  console.error("Formulaire loginForm introuvable ❌");
}

if (!loginSection) {
  console.error("Section loginSection introuvable ❌");
}

if (!profDashboard) {
  console.error("Dashboard profDashboard introuvable ❌");
}

onAuthStateChanged(auth, (user) => {
  console.log("État connexion Firebase :", user);

  if (user) {
    loginSection.hidden = true;
    profDashboard.hidden = false;
  } else {
    loginSection.hidden = false;
    profDashboard.hidden = true;
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  console.log("Bouton connexion cliqué ✅");

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  loginError.textContent = "Connexion en cours...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginError.textContent = "";
    console.log("Connexion réussie ✅");
  } catch (error) {
    console.error("Erreur Firebase :", error.code, error.message);

    if (error.code === "auth/invalid-credential") {
      loginError.textContent = "Email ou mot de passe incorrect.";
    } else if (error.code === "auth/user-not-found") {
      loginError.textContent = "Compte professeur introuvable.";
    } else if (error.code === "auth/wrong-password") {
      loginError.textContent = "Mot de passe incorrect.";
    } else if (error.code === "auth/too-many-requests") {
      loginError.textContent = "Trop de tentatives. Réessaie plus tard.";
    } else {
      loginError.textContent = "Erreur Firebase : " + error.code;
    }
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});
