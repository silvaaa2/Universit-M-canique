import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

const EXAM_MAX_POINTS = 50;
const EXAM_PASS_POINTS = 40;

let allExamStudents = [];
const examStatus = document.getElementById("examStatus");
const examGrid = document.getElementById("examGrid");
const examDetail = document.getElementById("examDetail");

async function loadExamStudentsFromFirestore() {
  if (!examGrid || !examStatus || !examDetail) return;

  examStatus.textContent = "Chargement des réponses depuis Firestore...";
  examGrid.innerHTML = "";
  examDetail.classList.remove("show");

  try {
    const snapshot = await getDocs(collection(db, "exams"));
    const imported = [];

    snapshot.forEach(docu => {
      const data = docu.data();
      imported.push({
        id: docu.id,
        name: data.name || "Sans nom",
        uniqueId: data.uniqueId || "Aucun ID",
        questions: data.questions || [],
        extras: data.extras || { stage: false, custom: false },
        comment: data.comment || ""
      });
    });

    allExamStudents = imported;
    renderExamStudents();
  } catch (err) {
    console.error(err);
    examStatus.textContent = "Erreur : impossible de charger les réponses Firestore.";
  }
}

function renderExamStudents() {
  examStatus.textContent = `${allExamStudents.length} réponse(s) d’examen affichée(s).`;

  if (!allExamStudents.length) {
    examGrid.innerHTML = `<div class="exam-empty-card"><h4>Aucune réponse</h4><p>Aucune donnée trouvée.</p></div>`;
    return;
  }

  examGrid.innerHTML = allExamStudents.map(student => {
    const base = student.questions.reduce((sum, q) => sum + (q.points || 0), 0);
    const bonus = (student.extras.stage ? 1 : 0) + (student.extras.custom ? 1 : 0);
    const finalScore = base + bonus;
    const result = finalScore >= EXAM_PASS_POINTS ? "passed" : finalScore > 0 ? "failed" : "pending";

    return `
      <button class="exam-student-card ${result}" onclick="openExamDetail('${student.id}')">
        <small>Examen mécanique</small>
        <h4>${student.name}</h4>
        <p>ID ${student.uniqueId}</p>
        <div class="exam-score-row"><span>${finalScore}/${EXAM_MAX_POINTS}</span><b class="${result}">${result === "passed" ? "Approuvé" : result === "failed" ? "Refusé" : "En attente"}</b></div>
      </button>
    `;
  }).join("");
}

// Réutilise openExamDetail, closeExamDetail, updateExamPoint, toggleExamExtra etc.
// (copie les fonctions existantes de ton exams-import.js)
window.loadExamStudentsFromFirestore = loadExamStudentsFromFirestore;
