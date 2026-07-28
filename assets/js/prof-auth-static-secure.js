window.__profAuthStarted = true;

const loginSection = document.getElementById("loginSection");
const profDashboard = document.getElementById("profDashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = loginBtn?.querySelector(".btn-text");
const loginTransition = document.getElementById("loginTransition");
const loginTransitionTitle = loginTransition?.querySelector("h2");
const loginTransitionText = loginTransition?.querySelector("p");

let hideTransitionTimer = null;
let firstRenderDone = false;
let firstRenderTimer = null;
let loginAttemptTimer = null;

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

function markFirstRenderDone() {
  firstRenderDone = true;

  if (firstRenderTimer) {
    window.clearTimeout(firstRenderTimer);
    firstRenderTimer = null;
  }
}

function clearLoginAttemptTimer() {
  if (loginAttemptTimer) {
    window.clearTimeout(loginAttemptTimer);
    loginAttemptTimer = null;
  }
}

function startFirstRenderFallback() {
  firstRenderTimer = window.setTimeout(() => {
    if (firstRenderDone) return;

    console.warn("Affichage forcé du login : chargement initial trop long.");
    showLogin("Chargement trop long. Recharge la page si la connexion ne répond pas.");
  }, 6500);
}

function hidePageLoader() {
  const loader = document.getElementById("loader");
  if (!loader) return;

  loader.classList.add("hide");
  loader.style.pointerEvents = "none";

  window.setTimeout(() => {
    loader.style.display = "none";
  }, 450);
}

function setLoginTransitionContent(title, text) {
  if (loginTransitionTitle) loginTransitionTitle.textContent = title;
  if (loginTransitionText) loginTransitionText.textContent = text;
}

function showLoginTransition(
  title = "Connexion en cours",
  text = "Vérification de votre accès professeur..."
) {
  if (!loginTransition) return;

  window.clearTimeout(hideTransitionTimer);
  setLoginTransitionContent(title, text);
  loginTransition.classList.remove("hide");
  loginTransition.hidden = false;
  loginTransition.style.pointerEvents = "all";

  requestAnimationFrame(() => {
    loginTransition.classList.add("active");
  });
}

function hideLoginTransition() {
  if (!loginTransition) return;

  window.clearTimeout(hideTransitionTimer);
  loginTransition.classList.remove("active");
  loginTransition.style.pointerEvents = "none";

  hideTransitionTimer = window.setTimeout(() => {
    if (!loginTransition.classList.contains("active")) {
      loginTransition.hidden = true;
    }
  }, 350);
}

function hideLoader() {
  hidePageLoader();
  hideLoginTransition();
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
  markFirstRenderDone();
  clearLoginAttemptTimer();
  hideLoader();

  if (profDashboard) {
    profDashboard.classList.remove("dashboard-visible");
    profDashboard.hidden = true;
    profDashboard.style.display = "none";
  }

  if (loginSection) {
    loginSection.hidden = false;
    loginSection.style.display = "grid";
    loginSection.classList.remove("leaving");
  }

  if (loginError) loginError.textContent = message;
  setLoginLoading(false);
}

function showDashboard() {
  markFirstRenderDone();
  clearLoginAttemptTimer();

  const transitionIsVisible = Boolean(
    loginTransition && !loginTransition.hidden && loginTransition.classList.contains("active")
  );

  hidePageLoader();

  if (transitionIsVisible) {
    setLoginTransitionContent("Connexion validée", "Préparation de l’espace professeur...");
  } else {
    hideLoginTransition();
  }

  if (loginSection) {
    loginSection.hidden = true;
    loginSection.style.display = "none";
  }

  if (profDashboard) {
    profDashboard.hidden = false;
    profDashboard.style.display = "block";

    requestAnimationFrame(() => {
      profDashboard.classList.add("dashboard-visible");
    });
  }

  window.setTimeout(() => {
    hideLoginTransition();
  }, transitionIsVisible ? 650 : 0);

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
  startFirstRenderFallback();

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
    }, error => {
      console.error("État de connexion prof indisponible :", error);
      showLogin("Erreur de chargement de la connexion.");
    });

    loginForm?.addEventListener("submit", async event => {
      event.preventDefault();

      const email = document.getElementById("email")?.value.trim() || "";
      const password = document.getElementById("password")?.value || "";

      if (loginError) loginError.textContent = "";
      setLoginLoading(true);
      showLoginTransition();

      clearLoginAttemptTimer();
      loginAttemptTimer = window.setTimeout(() => {
        hideLoginTransition();
        setLoginLoading(false);
        if (loginError) loginError.textContent = "Connexion trop longue. Recharge la page si besoin.";
      }, 14000);

      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        console.error("Erreur Firebase :", error.code, error.message);

        clearLoginAttemptTimer();
        hideLoginTransition();

        if (error.code === "auth/invalid-credential") {
          if (loginError) loginError.textContent = "Email ou mot de passe incorrect.";
        } else if (error.code === "auth/too-many-requests") {
          if (loginError) loginError.textContent = "Trop de tentatives. Réessaie plus tard.";
        } else if (error.code === "auth/unauthorized-domain") {
          if (loginError) loginError.textContent = "Domaine non autorisé dans Firebase.";
        } else if (error.code === "auth/network-request-failed") {
          if (loginError) loginError.textContent = "Erreur réseau.";
        } else {
          if (loginError) loginError.textContent = "Erreur de connexion.";
        }

        setLoginLoading(false);
      }
    });
  } catch (error) {
    console.error("Firebase indisponible :", error);
    showLogin("Erreur de chargement Firebase.");
  }
}

startAuth();