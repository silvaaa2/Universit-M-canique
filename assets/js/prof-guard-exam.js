import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
const db = getFirestore(app);

const guardLoader = document.getElementById("guardLoader");
const protectedContent = document.getElementById("protectedContent");

window.profFirebase = {
  app,
  auth,
  db,

  doc,
  getDoc,
  setDoc,

  collection,
  getDocs,
  query,
  where,

  serverTimestamp
};

window.dispatchEvent(new Event("profFirebaseReady"));

async function getUserRole(user) {
  if (!user?.email) return null;

  try {
    const userRef = doc(db, "users", user.email);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return null;

    return userSnap.data().role || null;
  } catch (error) {
    console.error("Erreur lecture rôle utilisateur :", error);
    return null;
  }
}

function showAccessDenied() {
  if (protectedContent) {
    protectedContent.hidden = true;
    protectedContent.style.display = "none";
  }

  if (guardLoader) {
    guardLoader.hidden = false;
    guardLoader.style.display = "grid";

    guardLoader.innerHTML = `
      <div class="prof-login-card">
        <p class="kicker">Accès refusé</p>
        <h1>Refusé</h1>
        <p class="intro">
          Ce compte n’est pas autorisé à accéder à la correction des examens.
        </p>

        <button class="btn secondary" onclick="window.location.href='espace-prof.html'">
          Retour connexion
        </button>
      </div>
    `;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "espace-prof.html";
    return;
  }

  const role = await getUserRole(user);

  if (role !== "prof") {
    console.warn("Accès refusé page examens :", user.email, "role =", role);

    window.currentProfUser = null;

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erreur déconnexion après refus :", error);
    }

    showAccessDenied();
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
    await import("./exam-loader-x8p2.js?v=7011");
  } catch (error) {
    console.error("Erreur chargement loader examens :", error);

    const sheetStatus = document.getElementById("sheetStatus");

    if (sheetStatus) {
      sheetStatus.innerHTML = `
        <div class="inline-error-box">
          <h4>Erreur de chargement</h4>
          <p>Impossible de charger le module des examens.</p>
        </div>
      `;
    }
  }
});
