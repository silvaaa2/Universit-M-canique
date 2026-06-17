if (!window.__profAuthDirectStarted) {
  window.__profAuthDirectStarted = true;
  window.__profAuthStarted = true;

  const loginSection = document.getElementById("loginSection");
  const profDashboard = document.getElementById("profDashboard");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginBtn");
  const loginBtnText = loginBtn?.querySelector(".btn-text");

  let profUiReady = false;
  let adminToolsPromise = null;
  let modulesToolsPromise = null;

  const firebaseConfig = {
    apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
    authDomain: "universit-4b11e.firebaseapp.com",
    projectId: "universit-4b11e",
    storageBucket: "universit-4b11e.firebasestorage.app",
    messagingSenderId: "11363330953",
    appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
    measurementId: "G-Z5B51BQCNL"
  };

  function setLoginLoading(isLoading) {
    if (!loginBtn) return;

    loginBtn.disabled = isLoading;
    loginBtn.classList.toggle("loading", isLoading);

    if (loginBtnText) {
      loginBtnText.textContent = isLoading ? "Connexion..." : "Connexion";
    }
  }

  function removeBlockingLoaders() {
    ["loader", "loginTransition"].forEach(id => {
      const element = document.getElementById(id);
      if (!element) return;

      element.classList.add("hide");
      element.classList.remove("active");
      element.hidden = true;
      element.style.display = "none";
      element.style.opacity = "0";
      element.style.visibility = "hidden";
      element.style.pointerEvents = "none";
    });
  }

  function ensureDashboardMarkup(isAdmin = false) {
    if (profDashboard.dataset.ready === "true") {
      ensureDirectButtons(isAdmin);
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

        <button id="logoutBtn" class="btn secondary">Déconnexion</button>
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

    profDashboard.dataset.ready = "true";
    bindCorrectionsButton();
    ensureDirectButtons(isAdmin);
  }

  function ensureDirectButtons(isAdmin = false) {
    const logoutBtn = document.getElementById("logoutBtn");
    if (!logoutBtn) return;

    if (!document.getElementById("studentModulesDirectBtn")) {
      const modulesButton = document.createElement("button");
      modulesButton.type = "button";
      modulesButton.id = "studentModulesDirectBtn";
      modulesButton.className = "btn secondary";
      modulesButton.textContent = "Modules Élèves";
      modulesButton.addEventListener("click", openStudentModulesDirect);
      logoutBtn.insertAdjacentElement("beforebegin", modulesButton);
    }

    if (isAdmin && !document.getElementById("profAdminDirectBtn")) {
      const adminButton = document.createElement("button");
      adminButton.type = "button";
      adminButton.id = "profAdminDirectBtn";
      adminButton.className = "btn secondary prof-admin-btn";
      adminButton.textContent = "Admin";
      adminButton.addEventListener("click", openAdminDirect);
      logoutBtn.insertAdjacentElement("beforebegin", adminButton);
    }
  }

  function showLogin(message = "") {
    removeBlockingLoaders();
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
    removeBlockingLoaders();
    loginSection.hidden = true;
    loginSection.style.display = "none";
    profDashboard.hidden = false;
    profDashboard.style.display = "block";

    requestAnimationFrame(() => {
      profDashboard.classList.add("dashboard-visible");
      removeBlockingLoaders();
    });

    setLoginLoading(false);
    window.scrollTo(0, 0);
  }

  function loadClassicScriptOnce(src, id, runDomReadyListener = false) {
    return new Promise((resolve, reject) => {
      if (document.getElementById(id)) {
        resolve();
        return;
      }

      const capturedListeners = [];
      const originalAddEventListener = document.addEventListener.bind(document);

      if (runDomReadyListener) {
        document.addEventListener = function(type, listener, options) {
          if (type === "DOMContentLoaded" && typeof listener === "function") {
            capturedListeners.push(listener);
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
          capturedListeners.forEach(listener => {
            try {
              listener.call(document, new Event("DOMContentLoaded"));
            } catch (error) {
              console.error("Initialisation script prof impossible :", error);
            }
          });
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

  function openCorrectionsFallback() {
    const inlineCorrections = document.getElementById("inlineCorrections");
    const chooser = document.getElementById("inlineCorrectionChooser");
    const detail = document.getElementById("inlineCorrectionDetail");

    if (!inlineCorrections) return;

    inlineCorrections.hidden = false;
    chooser.hidden = false;
    detail.hidden = true;

    requestAnimationFrame(() => {
      inlineCorrections.classList.add("active");
      inlineCorrections.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function bindCorrectionsButton() {
    const button = document.getElementById("openCorrectionsBtn");
    if (!button || button.dataset.bound === "true") return;

    button.dataset.bound = "true";
    button.addEventListener("click", async event => {
      if (profUiReady) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const title = button.querySelector("h2");
      const oldTitle = title?.textContent || "Corrigés";
      button.disabled = true;
      if (title) title.textContent = "Chargement...";

      try {
        await loadClassicScriptOnce("../assets/js/prof-ui.js?v=1004", "profUiScript", true);
        profUiReady = true;
        openCorrectionsFallback();
      } catch (error) {
        console.error("Corrigés indisponibles :", error);
        openCorrectionsFallback();
      } finally {
        button.disabled = false;
        if (title) title.textContent = oldTitle;
      }
    }, true);
  }

  function waitForFunction(name, timeout = 3500) {
    const startedAt = Date.now();

    return new Promise(resolve => {
      const tick = () => {
        if (typeof window[name] === "function") {
          resolve(window[name]);
          return;
        }

        if (Date.now() - startedAt >= timeout) {
          resolve(null);
          return;
        }

        setTimeout(tick, 100);
      };

      tick();
    });
  }

  async function openStudentModulesDirect() {
    const button = document.getElementById("studentModulesDirectBtn");
    const oldText = button?.textContent || "Modules Élèves";

    if (button) {
      button.disabled = true;
      button.textContent = "Chargement...";
    }

    try {
      if (!modulesToolsPromise) {
        modulesToolsPromise = Promise.all([
          import("./prof-student-modules.js?v=1005"),
          import("./prof-student-modules-polish.js?v=1004")
        ]);
      }

      await modulesToolsPromise;
      const openPanel = await waitForFunction("openStudentModulesPanel");

      if (openPanel) {
        openPanel();
      } else {
        alert("Modules élèves indisponible. Recharge la page une fois.");
      }
    } catch (error) {
      console.error("Modules élèves indisponible :", error);
      modulesToolsPromise = null;
      alert("Impossible de charger Modules élèves pour le moment.");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldText;
      }
    }
  }

  async function openAdminDirect() {
    const button = document.getElementById("profAdminDirectBtn");
    const oldText = button?.textContent || "Admin";

    if (button) {
      button.disabled = true;
      button.textContent = "Chargement...";
    }

    try {
      if (!adminToolsPromise) {
        adminToolsPromise = Promise.all([
          import("./prof-admin-drive-tools.js?v=1017"),
          import("./prof-admin-exam-settings.js?v=1022"),
          import("./prof-admin-exam-scale-wizard.js?v=1007")
        ]);
      }

      await adminToolsPromise;
      const openPanel = await waitForFunction("openProfAdminPanel");

      if (openPanel) {
        openPanel();
      } else {
        alert("Espace admin indisponible. Recharge la page une fois.");
      }
    } catch (error) {
      console.error("Admin indisponible :", error);
      adminToolsPromise = null;
      alert("Impossible de charger l'espace admin pour le moment.");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldText;
      }
    }
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

  async function start() {
    removeBlockingLoaders();
    setInterval(removeBlockingLoaders, 500);

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
        const isAllowed = data?.role === "prof" || data?.admin === true;

        if (!isAllowed) {
          await signOut(auth);
          showLogin("Accès refusé. Ce compte n’est pas autorisé sur l’espace professeur.");
          return;
        }

        window.currentProfUser = user;
        ensureDashboardMarkup(data?.admin === true);
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
          console.error("Entrée espace prof impossible :", error);
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

  start();
}