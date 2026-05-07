import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const EXAM_MAX_POINTS = 50;
const EXAM_PASS_POINTS = 40;

let allExamStudents = [];

const examGrid = document.getElementById("examGrid");
const examStatus = document.getElementById("examStatus");
const examDetail = document.getElementById("examDetail");

async function loadExamStudentsFromFirestore() {
  if (!examGrid || !examStatus) return;

  examStatus.textContent = "Chargement des réponses d’examen depuis Firestore...";
  examGrid.innerHTML = "";

  try {
    const snapshot = await getDocs(collection(db, "exam_responses"));
    allExamStudents = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      allExamStudents.push({
        id: data.studentId,
        name: data.name,
        uniqueId: data.uniqueId,
        questions: data.questions || [],
        extras: data.extras || {},
        comment: data.comment || ""
      });
    });

    renderExamStudents();
  } catch (error) {
    console.error(error);
    examStatus.textContent = "Erreur : impossible de charger les examens depuis Firestore.";
  }
}

function calculateExamFinalScore(student) {
  let base = 0;
  Object.values(student.questions).forEach(v => base += Number(v || 0));
  let bonus = 0;
  if (student.extras.stage) bonus++;
  if (student.extras.custom) bonus++;
  return base + bonus;
}

function getExamResult(student) {
  const score = calculateExamFinalScore(student);
  if (score >= EXAM_PASS_POINTS) return "passed";
  if (score > 0) return "failed";
  return "pending";
}

function getExamResultLabel(result) {
  if (result === "passed") return "Approuvé";
  if (result === "failed") return "Refusé";
  return "En attente";
}

async function saveExamResponse(studentId, correction) {
  await setDoc(doc(db, "exam_responses", studentId), correction);
  loadExamStudentsFromFirestore();
}

function renderExamStudents() {
  if (!examGrid || !examStatus) return;
  examStatus.textContent = `${allExamStudents.length} réponses d’examen affichée(s).`;

  examGrid.innerHTML = allExamStudents.map(student => {
    const finalScore = calculateExamFinalScore(student);
    const result = getExamResult(student);

    return `
      <button class="exam-student-card ${result}" onclick="openExamDetail('${student.id}')">
        <small>Examen mécanique</small>
        <h4>${student.name}</h4>
        <p>ID ${student.uniqueId}</p>
        <div class="exam-score-row">
          <span>${finalScore}/${EXAM_MAX_POINTS}</span>
          <b class="${result}">${getExamResultLabel(result)}</b>
        </div>
      </button>
    `;
  }).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  loadExamStudentsFromFirestore();
});
