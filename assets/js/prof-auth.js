const loginSection = document.getElementById("loginSection");
const profDashboard = document.getElementById("profDashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");

async function startFirebaseAuth() {
  try {
    const firebaseApp = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const firebaseAuth = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");

    const { initializeApp } = firebaseApp;
    const {
      getAuth,
      signInWithEmailAndPassword,
      onAuthStateChanged,
      signOut
    } = firebaseAuth;

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

    onAuthStateChanged(auth, (user) => {
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

      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      loginError.textContent = "Connexion en cours...";

      try {
        await signInWithEmailAndPassword(auth, email, password);
        loginError.textContent = "";
      } catch (error) {
        if (error.code === "auth/invalid-credential") {
          loginError.textContent = "Email ou mot de passe incorrect.";
        } else if (error.code === "auth/too-many-requests") {
          loginError.textContent = "Trop de tentatives. Réessaie plus tard.";
        } else {
          loginError.textContent = "Erreur de connexion.";
        }
      }
    });

    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
    });

  } catch (error) {
    loginError.textContent = "Erreur de chargement Firebase.";
  }
}

startFirebaseAuth();
