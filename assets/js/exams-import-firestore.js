import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

let allExamStudents = [];

const examGrid = document.getElementById("examGrid");
const examStatus = document.getElementById("examStatus");
const examDetail = document.getElementById("examDetail");

function statusLabel(result) {
  if (result === "passed") return "Approuvé";
  if (result === "failed") return "Refusé";
  return "En attente";
}

function renderExamStudents() {
  if (!examGrid || !examStatus) return;
  examStatus.textContent = `${allExamStudents.length} réponse(s) d’examen affichée(s).`;

  if (!allExamStudents.length) {
    examGrid.innerHTML = `<div class="exam-empty-card"><h4>Aucune réponse</h4></div>`;
    return;
  }

  examGrid.innerHTML = allExamStudents.map(student => `
    <button class="exam-student-card ${student.result}" onclick="openExamDetail('${student.id}')">
      <small>Examen mécanique</small>
      <h4>${student.name}</h4>
      <p>ID ${student.uniqueId}</p>
      <div class="exam-score-row">
        <span>${student.score}/50</span>
        <b class="${student.result}">${statusLabel(student.result)}</b>
      </div>
    </button>
  `).join("");
}

export async function loadExamStudents() {
  if (!examGrid || !examStatus) return;
  examStatus.textContent = "Chargement des réponses d’examen depuis Firestore...";

  try {
    const querySnapshot = await getDocs(collection(db, "exams"));
    allExamStudents = [];
    querySnapshot.forEach(doc => allExamStudents.push(doc.data()));

    renderExamStudents();
  } catch (e) {
    console.error(e);
    examStatus.textContent = "Erreur : impossible de charger les réponses Firestore.";
  }
}
