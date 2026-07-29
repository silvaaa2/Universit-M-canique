window.__profAuthStarted = true;
window.__profAuthReady = false;

const loginSection = document.getElementById("loginSection");
const profDashboard = document.getElementById("profDashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = loginBtn?.querySelector(".btn-text");
const loginTransition = document.getElementById("loginTransition");
const loginTransitionTitle = loginTransition?.querySelector("h2");
const loginTransitionText = loginTransition?.querySelector("p");

const authStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
let hideTransitionTimer = null;
let loaderHideTimer = null;
let firstRenderDone = false;
let firstRenderTimer = null;
let loginAttemptTimer = null;
let loginRevealToken = 0;
let dashboardToolsLoaded = false;
let dashboardFallbackActionsBound = false;

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  let timer = null;

  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(label || "Opération trop longue."));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

function markFirstRenderDone() {
  firstRenderDone = true;

  if (firstRenderTimer) {
    window.clearTimeout(firstRenderTimer);
    firstRenderTimer = null;
  }

  if (window.__profLoaderFallback) {
    window.clearTimeout(window.__profLoaderFallback);
    window.__profLoaderFallback = null;
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
    showLogin("Chargement trop long. Recharge la page si la connexion ne répond pas.", {
      skipInitialDelay: true
    });
  }, 6500);
}

function hidePageLoader(options = {}) {
  const loader = document.getElementById("loader");
  if (!loader) return;

  const immediate = options.immediate === true;

  if (loaderHideTimer) {
    window.clearTimeout(loaderHideTimer);
    loaderHideTimer = null;
  }

  loader.classList.add("hide");
  loader.style.pointerEvents = "none";
  loader.style.opacity = "0";
  loader.style.visibility = "hidden";

  if (immediate) {
    loader.style.display = "none";
    return;
  }

  loaderHideTimer = window.setTimeout(() => {
    if (loader.classList.contains("hide")) {
      loader.style.display = "none";
    }
  }, 560);
}

function prepareLoginSurface() {
  if (profDashboard) {
    profDashboard.classList.remove("dashboard-visible");
    profDashboard.hidden = true;
    profDashboard.style.display = "none";
  }

  if (loginSection) {
    loginSection.hidden = false;
    loginSection.style.display = "grid";
    loginSection.classList.remove("leaving", "auth-visible");
    loginSection.classList.add("auth-preparing");
  }

  setLoginLoading(false);
}

async function waitForInitialLoader(skipInitialDelay = false) {
  if (skipInitialDelay) return;

  const minLoaderTime = 900;
  const elapsed = now() - authStartedAt;
  const remaining = Math.max(0, minLoaderTime - elapsed);

  if (remaining > 0) {
    await sleep(remaining);
  }
}

async function revealLoginAfterLoader(options = {}) {
  const token = ++loginRevealToken;

  await waitForInitialLoader(options.skipInitialDelay === true);
  if (token !== loginRevealToken) return;

  hidePageLoader();

  if (!loginSection) return;

  requestAnimationFrame(() => {
    if (token !== loginRevealToken) return;

    loginSection.classList.remove("auth-preparing");
    void loginSection.offsetWidth;
    loginSection.classList.add("auth-visible");
  });
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
  loginTransition.style.visibility = "";
  loginTransition.style.opacity = "";

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
  }, 520);
}

function hideLoader() {
  hidePageLoader();
  hideLoginTransition();
}

function setLoginLoading(isLoading) {
  if (!loginBtn) return;

  loginBtn.disabled = isLoading || window.__profAuthReady !== true;
  loginBtn.classList.toggle("loading", isLoading);

  if (loginBtnText) {
    if (isLoading) {
      loginBtnText.textContent = "Connexion...";
    } else {
      loginBtnText.textContent = window.__profAuthReady === true ? "Connexion" : "Chargement...";
    }
  }
}

function showLogin(message = "", options = {}) {
  markFirstRenderDone();
  clearLoginAttemptTimer();
  hideLoginTransition();

  if (profDashboard) {
    profDashboard.classList.remove("dashboard-visible");
    profDashboard.hidden = true;
    profDashboard.style.display = "none";
  }

  if (loginSection) {
    loginSection.hidden = false;
    loginSection.style.display = "grid";
    loginSection.classList.remove("leaving", "auth-visible");
    loginSection.classList.add("auth-preparing");
  }

  if (loginError) loginError.textContent = message;
  setLoginLoading(false);
  revealLoginAfterLoader(options);
}

function forceUnlockDashboardInteractions() {
  if (loginTransition) {
    window.clearTimeout(hideTransitionTimer);
    loginTransition.classList.remove("active", "hide");
    loginTransition.hidden = true;
    loginTransition.style.pointerEvents = "none";
    loginTransition.style.visibility = "hidden";
    loginTransition.style.opacity = "0";
  }

  hidePageLoader({ immediate: true });

  document.querySelectorAll(".prof-dashboard button").forEach(button => {
    button.disabled = false;
    button.style.pointerEvents = "";
  });

  if (profDashboard) {
    profDashboard.style.pointerEvents = "auto";
  }
}

function bindDashboardFallbackActions() {
  if (!profDashboard || dashboardFallbackActionsBound) return;
  dashboardFallbackActionsBound = true;

  const responsesButton = profDashboard.querySelector('button[onclick*="prof-rp-7x92q"]');
  const examsButton = profDashboard.querySelector('button[onclick*="prof-exam-4x91q"]');

  responsesButton?.addEventListener("click", () => {
    window.location.href = "prof-rp-7x92q.html";
  });

  examsButton?.addEventListener("click", () => {
    window.location.href = "prof-exam-4x91q.html";
  });
}

function loadDashboardTools() {
  if (dashboardToolsLoaded) return;
  dashboardToolsLoaded = true;

  const tools = [
    "./prof-admin-polish.js?v=1007",
    "./prof-admin-patch-notes.js?v=1003",
    "./prof-admin-exam-settings.js?v=1020",
    "./prof-admin-exam-scale-wizard.js?v=1005",
    "./prof-modules-eleves-nav.js?v=1004"
  ];

  tools.forEach(src => {
    import(src).catch(error => {
      console.warn(`Outil prof non chargé : ${src}`, error);
    });
  });
}

async function showDashboard() {
  markFirstRenderDone();
  clearLoginAttemptTimer();
  loginRevealToken += 1;

  const transitionActive = loginTransition?.classList.contains("active") === true;

  if (transitionActive) {
    setLoginTransitionContent("Connexion validée", "Préparation de l’espace professeur...");
  }

  if (loginSection) {
    loginSection.classList.remove("auth-preparing", "auth-visible");
    loginSection.classList.add("leaving");
  }

  if (transitionActive) {
    await sleep(460);
  }

  hidePageLoader();

  if (loginSection) {
    loginSection.hidden = true;
    loginSection.style.display = "none";
  }

  if (profDashboard) {
    profDashboard.classList.remove("dashboard-visible");
    profDashboard.hidden = false;
    profDashboard.style.display = "block";

    await sleep(90);

    requestAnimationFrame(() => {
      profDashboard.classList.add("dashboard-visible");
    });
  }

  setLoginLoading(false);
  bindDashboardFallbackActions();
  loadDashboardTools();

  if (transitionActive) {
    await sleep(760);
    hideLoginTransition();
    await sleep(520);
  } else {
    hideLoginTransition();
    await sleep(120);
  }

  forceUnlockDashboardInteractions();
  window.setTimeout(forceUnlockDashboardInteractions, 900);
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
  prepareLoginSurface();

  try {
    const [firebaseApp, firebaseAuth, firebaseFirestore] = await withTimeout(Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
    ]), 10000, "Firebase met trop de temps à charger.");

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

      const snap = await withTimeout(
        getDoc(doc(db, "users", user.email)),
        9000,
        "Lecture du compte prof trop longue."
      );

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
      await showDashboard();
    }

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
        await withTimeout(
          signInWithEmailAndPassword(auth, email, password),
          12000,
          "Connexion Firebase trop longue."
        );
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
          if (loginError) loginError.textContent = error.message || "Erreur de connexion.";
        }

        setLoginLoading(false);
      }
    });

    window.__profAuthReady = true;
    setLoginLoading(false);

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
        showLogin(error.message || "Erreur d’accès à l’espace professeur.");
      }
    }, error => {
      console.error("État de connexion prof indisponible :", error);
      showLogin("Erreur de chargement de la connexion.");
    });
  } catch (error) {
    console.error("Firebase indisponible :", error);
    window.__profAuthReady = false;
    showLogin(error.message || "Erreur de chargement Firebase.");
  }
}

startAuth();
