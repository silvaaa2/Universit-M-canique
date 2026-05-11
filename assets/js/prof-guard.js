import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const guardLoader = document.getElementById("guardLoader");
const protectedContent = document.getElementById("protectedContent");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "espace-prof.html";
    return;
  }

  window.currentProfUser = user;

  if (guardLoader) {
    guardLoader.hidden = true;
    guardLoader.style.display = "none";
  }

  if (protectedContent) {
    protectedContent.hidden = false;
    protectedContent.style.display = "block";

    requestAnimationFrame(() => {
      protectedContent.classList.add("dashboard-visible");
    });
  }

  try {
    await import("./rp-loader-9kq4z.js?v=3002");
  } catch (error) {
    console.error("Erreur chargement loader réponses :", error);

    const sheetStatus = document.getElementById("sheetStatus");

    if (sheetStatus) {
      sheetStatus.innerHTML = `
        <div class="inline-error-box">
          <h4>Erreur de chargement</h4>
          <p>Impossible de charger le module des réponses élèves.</p>
        </div>
      `;
    }
  }
});
