const loginSection = document.getElementById("loginSection");
const profDashboard = document.getElementById("profDashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = loginBtn.querySelector(".btn-text");
const loginTransition = document.getElementById("loginTransition");

let isManualLoginTransition = false;

function setLoginLoading(isLoading) {
  loginBtn.disabled = isLoading;
  loginBtn.classList.toggle("loading", isLoading);
  loginBtnText.textContent = isLoading ? "Connexion..." : "Connexion";
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

async function startFirebaseAuth() {
  try {
    const firebaseApp = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const firebaseAuth = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const firebaseFirestore = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

    const { initializeApp } = firebaseApp;

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

    const app = initializeApp(firebaseConfig);
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

    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      window.currentProfUser = null;
      showLogin();
    });

  } catch (error) {
    console.error("Erreur chargement Firebase :", error);
    loginError.textContent = "Erreur de chargement Firebase.";
    setLoginLoading(false);
  }
}

startFirebaseAuth();

