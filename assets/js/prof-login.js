<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// --- Config Firebase ---
const firebaseConfig = {
  apiKey: "xxx",
  authDomain: "xxx.firebaseapp.com",
  projectId: "universite-4b11e",
  storageBucket: "xxx.appspot.com",
  messagingSenderId: "xxx",
  appId: "xxx"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Login ---
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginCard = document.getElementById('loginCard');
const profPanel = document.getElementById('profPanel');

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    sessionStorage.setItem("profToken", "ok");
    loginCard.style.display = 'none';
    profPanel.style.display = 'block';
  } catch (err) {
    loginError.style.display = 'block';
  }
});

// --- Déconnexion ---
window.logoutProf = async () => {
  await signOut(auth);
  sessionStorage.removeItem("profToken");
  profPanel.style.display = 'none';
  loginCard.style.display = 'block';
};

// --- Vérification session au chargement ---
onAuthStateChanged(auth, user => {
  if (user) {
    sessionStorage.setItem("profToken", "ok");
    loginCard.style.display = 'none';
    profPanel.style.display = 'block';
  } else {
    loginCard.style.display = 'block';
    profPanel.style.display = 'none';
  }
});

// --- Chargement dynamique des customs ---
window.loadCustom = async (custom) => {
  if (!sessionStorage.getItem("profToken")) {
    alert("Connectez-vous pour accéder aux réponses !");
    return;
  }

  const panelMap = {
    dukes: 'dukesAnswer',
    sentinel: 'sentinelAnswer',
    rumina: 'ruminaAnswer'
  };
  const panel = document.getElementById(panelMap[custom]);
  panel.innerHTML = ""; // vide l'ancien contenu

  const docRef = doc(db, "customAnswerKeys", custom);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return;

  const data = docSnap.data();
  
  data.sections.forEach(section => {
    const card = document.createElement("div");
    card.className = "answer-card";
    let html = `<span>${section.title || "Section"}</span>`;
    section.items.forEach(item => {
      html += `
        <div class="answer-line">
          <strong>${item.label}</strong>
          <p>${item.value}</p>
        </div>
      `;
    });
    card.innerHTML = html;
    panel.appendChild(card);
  });

  // Affiche et scroll
  document.querySelectorAll(".custom-answer-panel").forEach(p => p.classList.remove("show"));
  panel.classList.add("show");
  setTimeout(() => {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
};

// --- Fermeture des panels ---
window.closeCustomAnswers = () => {
  document.querySelectorAll(".custom-answer-panel").forEach(panel => panel.classList.remove("show"));
};
</script>
