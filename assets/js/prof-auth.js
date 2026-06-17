if (!window.__profAuthStarted) {
  window.__profAuthStarted = true;

  const loginSection = document.getElementById("loginSection");
  const profDashboard = document.getElementById("profDashboard");
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginBtn");
  const loginBtnText = loginBtn.querySelector(".btn-text");
  const loginTransition = document.getElementById("loginTransition");

  let logoutBtn = document.getElementById("logoutBtn");
  let isManualLoginTransition = false;
  let privateModulesPromise = null;

  function setLoginLoading(isLoading) {
    loginBtn.disabled = isLoading;
    loginBtn.classList.toggle("loading", isLoading);
    loginBtnText.textContent = isLoading ? "Connexion..." : "Connexion";
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function ensureDashboardMarkup() {
    if (profDashboard.dataset.privateReady === "true") return;

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
              <p>
                Choisissez une custom pour afficher sa correction directement ici.
              </p>
            </div>

            <button type="button" class="inline-corrections-minimize" id="minimizeCorrectionsBtn">
              −
            </button>
          </div>

          <div class="inline-correction-chooser" id="inlineCorrectionChooser">
            <button
              type="button"
              class="inline-custom-btn"
              data-doc="sentinelClassic"
              data-label="Custom Facile"
              data-vehicle="Sentinel Classic"
            >
              <span>01</span>
              <h3>Custom Facile</h3>
              <p>Sentinel Classic</p>
            </button>

            <button
              type="button"
              class="inline-custom-btn"
              data-doc="argento2f"
              data-label="Custom Moyen"
              data-vehicle="Argento 2F"
            >
              <span>02</span>
              <h3>Custom Moyen</h3>
              <p>Argento 2F</p>
            </button>

            <button
              type="button"
              class="inline-custom-btn"
              data-doc="cypher"
              data-label="Custom Difficile"
              data-vehicle="Cypher"
            >
              <span>03</span>
              <h3>Custom Difficile</h3>
              <p>Cypher</p>
            </button>
          </div>

          <section class="inline-correction-detail" id="inlineCorrectionDetail" hidden>
            <div class="inline-detail-toolbar">
              <button type="button" class="inline-back-btn" id="backToCustomsBtn">
                ← Retour aux customs
              </button>

              <p class="inline-detail-path" id="correctionPath">
                Firestore / customAnswerKeys
              </p>
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

  function showDashboardInstant() {
    loginTransition.hidden = true;
    loginTransition.classList.remove("active");

    loginSection.setAttribute("hidden", "");
    profDashboard.removeAttribute("hidden");

    loginSection.style.display = "none";
    profDashboard.style.display = "block";

    requestAnimationFrame(() => {
      profDashboard.classList.add("dashboard-visible");
    });

    setLoginLoading(false);
    window.scrollTo(0, 0);
  }

  async function showDashboardWithTransition() {
    loginSection.classList.add("leaving");

    await sleep(250);

    loginTransition.hidden = false;

    requestAnimationFrame(() => {
      loginTransition.classList.add("active");
    });

    await sleep(950);

    loginSection.setAttribute("hidden", "");
    profDashboard.removeAttribute("hidden");

    loginSection.style.display = "none";
    profDashboard.style.display = "block";

    await sleep(250);

    loginTransition.classList.remove("active");

    await sleep(350);

    loginTransition.hidden = true;

    requestAnimationFrame(() => {
      profDashboard.classList.add("dashboard-visible");
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
          capturedDomReadyListeners.forEach(listener => {
            listener.call(document, new Event("DOMContentLoaded"));
          });
        }

        resolve();
      };
      script.onerror = () => {
        if (runDomReadyListener) {
          document.addEventListener = originalAddEventListener;
        }

        reject(new Error(`Script indisponible : ${src}`));
      };

      document.head.appendChild(script);
    });
  }

  async function loadPrivateProfModules() {
    if (privateModulesPromise) return privateModulesPromise;

    privateModulesPromise = (async () => {
      await loadClassicScriptOnce("../assets/js/prof-ui.js?v=1001", "profUiScript", true);

      await Promise.all([
        import("./prof-admin-drive-tools.js?v=1014"),
        import("./prof-admin-exam-settings.js?v=1019"),
        import("./prof-admin-exam-scale-wizard.js?v=1004"),
        import("./prof-student-modules.js?v=1002")
      ]);

      await import("./prof-student-modules-polish.js?v=1001");
    })();

    return privateModulesPromise;
  }

  function bindDashboardLogout(signOut, auth) {
    logoutBtn = document.getElementById("logoutBtn");

    if (!logoutBtn || logoutBtn.dataset.bound === "true") return;

    logoutBtn.dataset.bound = "true";
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      window.currentProfUser = null;
      showLogin();
    });
  }

  async function preparePrivateDashboard(signOut, auth) {
    ensureDashboardMarkup();
    bindDashboardLogout(signOut, auth);
    await loadPrivateProfModules();
  }

  async function startFirebaseAuth() {
    try {
      const firebaseApp = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
      const firebaseAuth = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
      const firebaseFirestore = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

      const { initializeApp, getApps, getApp } = firebaseApp;

      const {
        getAuth,
        signInWithEmailAndPassword,
        onAuthStateChanged,
        signOut
      } = firebaseAuth;

      const {
        getFirestore,
        doc,
        getDoc,
        setDoc,
        collection,
        getDocs,
        query,
        where,
        serverTimestamp
      } = firebaseFirestore;

      const firebaseConfig = {
        apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
        authDomain: "universit-4b11e.firebaseapp.com",
        projectId: "universit-4b11e",
        storageBucket: "universit-4b11e.firebasestorage.app",
        messagingSenderId: "11363330953",
        appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
        measurementId: "G-Z5B51BQCNL"
      };

      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const db = getFirestore(app);

      async function getUserRole(user) {
        if (!user?.email) return null;

        const userRef = doc(db, "users", user.email);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) return null;

        return userSnap.data().role || null;
      }

      async function isUserProf(user) {
        const role = await getUserRole(user);
        return role === "prof";
      }

      async function refuseAccess(user) {
        console.warn("Accès refusé :", user?.email || "email inconnu");

        window.currentProfUser = null;

        try {
          await signOut(auth);
        } catch (error) {
          console.error("Erreur déconnexion après refus :", error);
        }

        loginError.textContent = "Accès refusé. Ce compte n’est pas autorisé sur l’espace professeur.";
        loginSection.classList.remove("leaving");
        showLogin();
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

      onAuthStateChanged(auth, async (user) => {
        if (isManualLoginTransition) return;

        if (!user) {
          window.currentProfUser = null;
          showLogin();
          return;
        }

        const allowed = await isUserProf(user);

        if (!allowed) {
          await refuseAccess(user);
          return;
        }

        window.currentProfUser = user;
        await preparePrivateDashboard(signOut, auth);
        showDashboardInstant();
      });

      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        loginError.textContent = "";
        setLoginLoading(true);
        isManualLoginTransition = true;

        try {
          const credential = await signInWithEmailAndPassword(auth, email, password);
          const user = credential.user;

          const allowed = await isUserProf(user);

          if (!allowed) {
            isManualLoginTransition = false;
            await refuseAccess(user);
            return;
          }

          window.currentProfUser = user;
          await preparePrivateDashboard(signOut, auth);
          await showDashboardWithTransition();

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
          } else if (error.code === "permission-denied") {
            loginError.textContent = "Accès refusé. Rôle utilisateur introuvable ou non autorisé.";
          } else {
            loginError.textContent = "Erreur de connexion.";
          }

          loginSection.classList.remove("leaving");
          setLoginLoading(false);
        } finally {
          isManualLoginTransition = false;
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
