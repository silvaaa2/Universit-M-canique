import { getFirestore, collection, getDocs, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { app } from "./prof-login.js";

const db = getFirestore(app);

const EXAM_MAX_POINTS = 50;
const EXAM_PASS_POINTS = 40;

let allExamStudents = [];

const examStatus = document.getElementById("examStatus");
const examGrid = document.getElementById("examGrid");
const examDetail = document.getElementById("examDetail");

// Charger depuis Firestore
export async function loadFirestoreExams() {
  if (!examGrid || !examStatus) return;

  examStatus.textContent = "Import des réponses d’examen depuis Firestore...";
  examGrid.innerHTML = "";
  allExamStudents = [];

  try {
    const snapshot = await getDocs(collection(db, "exams"));
    snapshot.forEach(docSnap => {
      allExamStudents.push(docSnap.data());
    });

    renderExamStudents();
  } catch (err) {
    console.error(err);
    examStatus.textContent = "Erreur : impossible de charger l'examen depuis Firestore.";
  }
}

// Affichage des élèves
export function renderExamStudents() {
  if (!examGrid || !examStatus) return;

  examStatus.textContent = `${allExamStudents.length} réponse(s) affichée(s).`;

  if (!allExamStudents.length) {
    examGrid.innerHTML = `<div class="exam-empty-card"><h4>Aucune réponse</h4><p>Pas de données disponibles.</p></div>`;
    return;
  }

  examGrid.innerHTML = allExamStudents.map(student => {
    const finalScore = student.questions.reduce((acc, q) => acc + (q.points || 0), 0)
                     + ((student.extras?.stage ? 1 : 0) + (student.extras?.custom ? 1 : 0));
    const result = finalScore >= EXAM_PASS_POINTS ? "passed" : "failed";

    return `
      <button class="exam-student-card ${result}" onclick="openExamDetail('${student.id}')">
        <small>Examen mécanique</small>
        <h4>${student.name}</h4>
        <p>ID ${student.uniqueId}</p>
        <div class="exam-score-row">
          <span>${finalScore}/${EXAM_MAX_POINTS}</span>
          <b class="${result}">${result === "passed" ? "Approuvé" : "Refusé"}</b>
        </div>
      </button>
    `;
  }).join("");
}

// Sauvegarder correction
export async function saveExamFirestore(studentId, correction) {
  await setDoc(doc(db, "exams", studentId), correction);
}
