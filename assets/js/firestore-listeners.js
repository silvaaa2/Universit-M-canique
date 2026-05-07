// assets/js/firestore-listeners.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// 🔑 Config Firebase (mets tes infos)
const firebaseConfig = {
  apiKey: "TON_API_KEY",
  authDomain: "TON_PROJET.firebaseapp.com",
  projectId: "TON_PROJET",
  storageBucket: "TON_PROJET.appspot.com",
  messagingSenderId: "XXXX",
  appId: "XXXX"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- CUSTOMS ---
const customCol = collection(db, "customAnswers");

onSnapshot(customCol, snapshot => {
  const studentsGrid = document.getElementById("studentsGrid");
  const studentsStatus = document.getElementById("studentsStatus");

  if (snapshot.empty) {
    studentsStatus.textContent = "Aucune réponse pour l'instant.";
    studentsGrid.innerHTML = "";
    return;
  }

  studentsGrid.innerHTML = ""; // clear
  studentsStatus.textContent = "";

  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    const card = document.createElement("div");
    card.className = "student-card";

    card.innerHTML = `
      <h4>${data.studentName || "Nom inconnu"}</h4>
      <p>Custom: ${data.customLabel}</p>
      <p>Réponses: ${JSON.stringify(data.answers)}</p>
    `;

    studentsGrid.appendChild(card);
  });
});

// --- EXAMENS ---
const examCol = collection(db, "examCorrections");

onSnapshot(examCol, snapshot => {
  const examGrid = document.getElementById("examGrid");
  const examStatus = document.getElementById("examStatus");

  if (snapshot.empty) {
    examStatus.textContent = "Aucune réponse d'examen pour l'instant.";
    examGrid.innerHTML = "";
    return;
  }

  examGrid.innerHTML = ""; // clear
  examStatus.textContent = "";

  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    const card = document.createElement("div");
    card.className = "exam-card";

    card.innerHTML = `
      <h4>${data.studentName || "Nom inconnu"}</h4>
      <p>Score: ${data.score || 0}/${data.maxScore}</p>
      <p>Réponses: ${JSON.stringify(data.answers)}</p>
    `;

    examGrid.appendChild(card);
  });
});
