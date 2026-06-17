window.__profAuthStarted = true;

const loginSection = document.getElementById("loginSection");
const profDashboard = document.getElementById("profDashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = loginBtn?.querySelector(".btn-text");

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

function hideLoader() {
  ["loader", "loginTransition"].forEach(id => {
    const element = document.getElementById(id);
    if (!element) return;

    element.classList.add("hide");
    element.classList.remove("active");
    element.style.pointerEvents = "none";
  });
}

function setLoginLoading(isLoading) {
  if (!loginBtn) return;

  loginBtn.disabled = isLoading;
  loginBtn.classList.toggle("loading", isLoading);

  if (loginBtnText) {
    loginBtnText.textContent = isLoading ? "Connexion..." : "Connexion";
  }
}

function showLogin(message = "") {
  hideLoader();

  profDashboard.classList.remove("dashboard-visible");
  profDashboard.hidden = true;
  profDashboard.style.display = "none";

  loginSection.hidden = false;
  loginSection.style.display = "grid";
  loginSection.classList.remove("leaving");

  loginError.textContent = message;
  setLoginLoading(false);
}

function showDashboard() {
  hideLoader();

  loginSection.hidden = true;
  loginSection.style.display = "none";

  profDashboard.hidden = false;
  profDashboard.style.display = "block";

  requestAnimationFrame(() => {
    profDashboard.classList.add("dashboard-visible");
  });

  setLoginLoading(false);
  window.scrollTo(0, 0);
}

function bindLogout(signOut, auth) {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn || logoutBtn.dataset.bound === "true") return;

  logoutBtn.dataset.bound = "true";
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.currentProfUser = null;
    showLogin();
  });
}

async function startAuth() {
  try {
    const firebaseApp = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const firebaseAuth = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const firebaseFirestore = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

    const { initializeApp, getApps, getApp } = firebaseApp;
    const { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } = firebaseAuth;
    const { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, where, serverTimestamp } = firebaseFirestore;

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

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

    async function getUserData(user) {
      if (!user?.email) return null;

      const snap = await getDoc(doc(db, "users", user.email));
      return snap.exists() ? snap.data() : null;
    }

    async function enterDashboard(user) {
      const data = await getUserData(user);
      const allowed = data?.role === "prof" || data?.admin === true;

      if (!allowed) {
        await signOut(auth);
        showLogin("Accès refusé. Ce compte n’est pas autorisé sur l’espace professeur.");
        return;
      }

      window.currentProfUser = user;
      bindLogout(signOut, auth);
      showDashboard();
    }

    showLogin();

    onAuthStateChanged(auth, async user => {
      if (!user) {
        window.currentProfUser = null;
        showLogin();
        return;
      }

      try {
        await enterDashboard(user);
      } catch (error) {
        console.error("Accès prof impossible :", error);
        showLogin("Erreur d’accès à l’espace professeur.");
      }
    });

    loginForm.addEventListener("submit", async event => {
      event.preventDefault();

      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      loginError.textContent = "";
      setLoginLoading(true);

      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        console.error("Erreur Firebase :", error.code, error.message);

        if (error.code === "auth/invalid-credential") {
          loginError.textContent = "Email ou mot de passe incorrect.";
        } else if (error.code === "auth/too-many-requests") {
          loginError.textContent = "Trop de tentatives. Réessaie plus tard.";
        } else if (error.code === "auth/unauthorized-domain") {
          loginError.textContent = "Domaine non autorisé dans Firebase.";
        } else if (error.code === "auth/network-request-failed") {
          loginError.textContent = "Erreur réseau.";
        } else {
          loginError.textContent = "Erreur de connexion.";
        }

        setLoginLoading(false);
      }
    });
  } catch (error) {
    console.error("Firebase indisponible :", error);
    showLogin("Erreur de chargement Firebase.");
  }
}

hideLoader();
startAuth();