if (!window.__profAuthSafeStarted) {
  window.__profAuthSafeStarted = true;
  window.__profAuthStarted = true;

  const loginSection = document.getElementById("loginSection");
  const profDashboard = document.getElementById("profDashboard");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginBtn");
  const loginBtnText = loginBtn?.querySelector(".btn-text");
  const loginTransition = document.getElementById("loginTransition");

  let logoutBtn = null;
  let lazyToolsStarted = false;
  let adminToolsStarted = false;

  const firebaseConfig = {
    apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
    authDomain: "universit-4b11e.firebaseapp.com",
    projectId: "universit-4b11e",
    storageBucket: "universit-4b11e.firebasestorage.app",
    messagingSenderId: "11363330953",
    appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
    measurementId: "G-Z5B51BQCNL"
  };

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function setLoginLoading(isLoading) {
    if (!loginBtn) return;

    loginBtn.disabled = isLoading;
    loginBtn.classList.toggle("loading", isLoading);

    if (loginBtnText) {
      loginBtnText.textContent = isLoading ? "Connexion..." : "Connexion";
    }
  }

  function ensureDashboardMarkup(isAdmin = false) {
    if (profDashboard.dataset.privateReady === "true") {
      ensureAdminLazyButton(isAdmin);
      return;
    }

    profDashboard.innerHTML = `
      <div class="prof-dashboard-top">
        <div>
          <p class="kicker">Module 4 - Mécanique</p>
          <h1>Tableau Prof</h1>
          <p class="intro">
            Bienvenue dans l’espace sécurisé. Ici on ajoutera les corrigés et les réponses élèves.
          </p>
        </div>

        <button id="logoutBtn" class="btn secondary">
          Déconnexion
        </button>
      </div>

      <div class="prof-grid">
        <button type="button" class="prof-panel prof-panel-btn" id="openCorrectionsBtn">
          <span class="panel-number">01</span>
          <h2>Corrigés</h2>
          <p>Accéder aux corrigés des customs.</p>
        </button>

        <button type="button" class="prof-panel prof-panel-btn" onclick="goPage('prof-rp-7x92q.html')">
          <span class="panel-number">02</span>
          <h2>Réponses élèves</h2>
          <p>Consulter les réponses des élèves.</p>
        </button>

        <button type="button" class="prof-panel prof-panel-btn" onclick="goPage('prof-exam-4x91q.html')">
          <span class="panel-number">03</span>
          <h2>Examens</h2>
          <p>Consulter les réponses d’examen.</p>
        </button>
      </div>

      <section class="inline-corrections" id="inlineCorrections" hidden>
        <div class="inline-corrections-card">
          <div class="inline-corrections-head">
            <div>
              <p class="kicker">Corrigés</p>
              <h2>Centre de correction</h2>
              <p>Choisissez une custom pour afficher sa correction directement ici.</p>
            </div>

            <button type="button" class="inline-corrections-minimize" id="minimizeCorrectionsBtn">−</button>
          </div>

          <div class="inline-correction-chooser" id="inlineCorrectionChooser">
            <button type="button" class="inline-custom-btn" data-doc="sentinelClassic" data-label="Custom Facile" data-vehicle="Sentinel Classic">
              <span>01</span>
              <h3>Custom Facile</h3>
              <p>Sentinel Classic</p>
            </button>

            <button type="button" class="inline-custom-btn" data-doc="argento2f" data-label="Custom Moyen" data-vehicle="Argento 2F">
              <span>02</span>
              <h3>Custom Moyen</h3>
              <p>Argento 2F</p>
            </button>

            <button type="button" class="inline-custom-btn" data-doc="cypher" data-label="Custom Difficile" data-vehicle="Cypher">
              <span>03</span>
              <h3>Custom Difficile</h3>
              <p>Cypher</p>
            </button>
          </div>

          <section class="inline-correction-detail" id="inlineCorrectionDetail" hidden>
            <div class="inline-detail-toolbar">
              <button type="button" class="inline-back-btn" id="backToCustomsBtn">← Retour aux customs</button>
              <p class="inline-detail-path" id="correctionPath">Firestore / customAnswerKeys</p>
            </div>

            <div class="inline-detail-hero">
              <div class="inline-detail-hero-left">
                <p class="kicker" id="correctionHeroKicker">Corrigé</p>
                <h3 id="correctionTitle">Custom</h3>
                <p class="inline-detail-description" id="correctionDescription">
                  Réponses et configuration attendue pour le custom sélectionné.
                </p>
              </div>

              <div class="inline-detail-tags" id="correctionTags"></div>
            </div>

            <div class="inline-detail-sections" id="correctionSections"></div>
          </section>
        </div>
      </section>
    `;

    profDashboard.dataset.privateReady = "true";
    logoutBtn = document.getElementById("logoutBtn");
    ensureAdminLazyButton(isAdmin);
  }

  function ensureAdminLazyButton(isAdmin) {
    if (!isAdmin || document.getElementById("profAdminLazyBtn")) return;

    const logout = document.getElementById("logoutBtn");
    if (!logout) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "profAdminLazyBtn";
    button.className = "btn secondary prof-admin-btn";
    button.textContent = "Admin";
    button.addEventListener("click", loadAdminToolsAndOpen);

    logout.insertAdjacentElement("beforebegin", button);
  }

  function showLogin() {
    loginTransition.hidden = true;
    loginTransition.classList.remove("active");
    profDashboard.classList.remove("dashboard-visible");
    loginSection.classList.remove("leaving");

    loginSection.removeAttribute("hidden");
    profDashboard.setAttribute("hidden", "");
    loginSection.style.display = "grid";
    profDashboard.style.display = "none";
    setLoginLoading(false);
  }

  async function showDashboardWithTransition() {
    loginSection.classList.add("leaving");
    await sleep(180);

    loginTransition.hidden = false;
    requestAnimationFrame(() => loginTransition.classList.add("active"));
    await sleep(650);

    loginSection.setAttribute("hidden", "");
    profDashboard.removeAttribute("hidden");
    loginSection.style.display = "none";
    profDashboard.style.display = "block";

    await sleep(180);
    loginTransition.classList.remove("active");
    await sleep(220);
    loginTransition.hidden = true;

    requestAnimationFrame(() => profDashboard.classList.add("dashboard-visible"));
    setLoginLoading(false);
    window.scrollTo(0, 0);
  }

  function showDashboardInstant() {
    loginTransition.hidden = true;
    loginTransition.classList.remove("active");
    loginSection.setAttribute("hidden", "");
    profDashboard.removeAttribute("hidden");
    loginSection.style.display = "none";
    profDashboard.style.display = "block";
    requestAnimationFrame(() => profDashboard.classList.add("dashboard-visible"));
    setLoginLoading(false);
    window.scrollTo(0, 0);
  }

  function loadClassicScriptOnce(src, id, runDomReadyListener = false) {
    return new Promise((resolve, reject) => {
      if (document.getElementById(id)) {
        resolve();
        return;
      }

      const capturedDomReadyListeners = [];
      const originalAddEventListener = document.addEventListener.bind(document);

      if (runDomReadyListener) {
        document.addEventListener = function(type, listener, options) {
          if (type === "DOMContentLoaded" && typeof listener === "function") {
            capturedDomReadyListeners.push(listener);
          }

          return originalAddEventListener(type, listener, options);
        };
      }

      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      script.onload = () => {
        if (runDomReadyListener) {
          document.addEventListener = originalAddEventListener;
          capturedDomReadyListeners.forEach(listener => listener.call(document, new Event("DOMContentLoaded")));
        }

        resolve();
      };
      script.onerror = () => {
        if (runDomReadyListener) document.addEventListener = originalAddEventListener;
        reject(new Error(`Script indisponible : ${src}`));
      };

      document.head.appendChild(script);
    });
  }

  function loadPrivateToolsInBackground() {
    if (lazyToolsStarted) return;
    lazyToolsStarted = true;

    setTimeout(async () => {
      try {
        await loadClassicScriptOnce("../assets/js/prof-ui.js?v=1002", "profUiScript", true);
        await import("./prof-student-modules.js?v=1003");
        await import("./prof-student-modules-polish.js?v=1002");
      } catch (error) {
        console.error("Outils prof secondaires indisponibles :", error);
      }
    }, 150);
  }

  async function loadAdminToolsAndOpen() {
    const button = document.getElementById("profAdminLazyBtn");

    if (button) {
      button.disabled = true;
      button.textContent = "Chargement...";
    }

    try {
      if (!adminToolsStarted) {
        adminToolsStarted = true;
        await import("./prof-admin-drive-tools.js?v=1015");
        await import("./prof-admin-exam-settings.js?v=1020");
        await import("./prof-admin-exam-scale-wizard.js?v=1005");
      }

      setTimeout(() => {
        if (typeof window.openProfAdminPanel === "function") {
          window.openProfAdminPanel();
        }
      }, 250);
    } catch (error) {
      console.error("Outils admin indisponibles :", error);
      alert("Impossible de charger l'espace admin pour le moment. Réessaie après un rafraîchissement complet.");
      adminToolsStarted = false;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Admin";
      }
    }
  }

  function bindLogout(signOut, auth) {
    logoutBtn = document.getElementById("logoutBtn");
    if (!logoutBtn || logoutBtn.dataset.bound === "true") return;

    logoutBtn.dataset.bound = "true";
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      window.currentProfUser = null;
      showLogin();
    });
  }

  async function startFirebaseAuth() {
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

      async function getUserData(user) {
        if (!user?.email) return null;

        const snap = await getDoc(doc(db, "users", user.email));
        return snap.exists() ? snap.data() : null;
      }

      function userCanEnter(data) {
        return data?.role === "prof" || data?.admin === true;
      }

      async function enterDashboard(user, animated = false) {
        const data = await getUserData(user);

        if (!userCanEnter(data)) {
          await signOut(auth);
          loginError.textContent = "Accès refusé. Ce compte n’est pas autorisé sur l’espace professeur.";
          showLogin();
          return;
        }

        window.currentProfUser = user;
        ensureDashboardMarkup(data?.admin === true);
        bindLogout(signOut, auth);
        loadPrivateToolsInBackground();

        if (animated) {
          await showDashboardWithTransition();
        } else {
          showDashboardInstant();
        }
      }

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
      showLogin();

      onAuthStateChanged(auth, async user => {
        if (!user) {
          window.currentProfUser = null;
          showLogin();
          return;
        }

        await enterDashboard(user, false);
      });

      loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        loginError.textContent = "";
        setLoginLoading(true);

        try {
          const credential = await signInWithEmailAndPassword(auth, email, password);
          await enterDashboard(credential.user, true);
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

          loginSection.classList.remove("leaving");
          setLoginLoading(false);
        }
      });
    } catch (error) {
      console.error("Erreur chargement Firebase :", error);
      loginError.textContent = "Erreur de chargement Firebase.";
      setLoginLoading(false);
    }
  }

  startFirebaseAuth();
}