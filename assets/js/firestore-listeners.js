// assets/js/firestore-listeners.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// config firebasee
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
