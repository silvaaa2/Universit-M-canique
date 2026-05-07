// assets/js/firestore-listeners.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.appspot.com",
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

  if (!studentsGrid || !studentsStatus) return;

  if (snapshot.empty) {
    studentsStatus.textContent = "Aucune réponse pour l'instant.";
    studentsGrid.innerHTML = "";
    return;
  }

  studentsGrid.innerHTML = "";
  studentsStatus.textContent = `${snapshot.docs.length} réponse(s) chargée(s).`;

  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    const card = document.createElement("button");
    card.className = `student-card ${data.status || "pending"}`;
    card.onclick = () => openStudentDetailWithLoading(docSnap.id);

    card.innerHTML = `
      <small>${data.customLabel || "Custom"}</small>
      <h4>${data.studentName || "Nom inconnu"}</h4>
      <p>${data.vehicle || "Véhicule"} — ID ${data.uniqueId || "Aucun ID"}</p>
      <div class="student-badge ${data.status || "pending"}">
        ${data.status === "approved" ? "Approuvé" : data.status === "refused" ? "Refusé" : "En attente"}
      </div>
    `;

    studentsGrid.appendChild(card);
  });
});

// --- EXAMENS ---
const examCol = collection(db, "examCorrections");

onSnapshot(examCol, snapshot => {
  const examGrid = document.getElementById("examGrid");
  const examStatus = document.getElementById("examStatus");

  if (!examGrid || !examStatus) return;

  if (snapshot.empty) {
    examStatus.textContent = "Aucune réponse d'examen pour l'instant.";
    examGrid.innerHTML = "";
    return;
  }

  examGrid.innerHTML = "";
  examStatus.textContent = `${snapshot.docs.length} réponse(s) d’examen chargée(s).`;

  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    const baseScore = data.questions?.reduce((sum, q) => sum + (q.points || 0), 0) || 0;
    const bonus = (data.extras?.stage ? 1 : 0) + (data.extras?.custom ? 1 : 0);
    const finalScore = baseScore + bonus;
    const result = finalScore >= 40 ? "passed" : finalScore > 0 ? "failed" : "pending";

    const card = document.createElement("button");
    card.className = `exam-student-card ${result}`;
    card.onclick = () => openExamDetail(docSnap.id);

    card.innerHTML = `
      <small>Examen mécanique</small>
      <h4>${data.studentName || "Nom inconnu"}</h4>
      <p>ID ${data.uniqueId || "Aucun ID"}</p>
      <div class="exam-score-row">
        <span>${finalScore}/50</span>
        <b class="${result}">${result === "passed" ? "Approuvé" : result === "failed" ? "Refusé" : "En attente"}</b>
      </div>
    `;

    examGrid.appendChild(card);
  });
});
