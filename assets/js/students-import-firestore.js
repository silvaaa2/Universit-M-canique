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

let allStudents = [];
let activeStudentFilter = "all";

const studentsGrid = document.getElementById("studentsGrid");
const studentsStatus = document.getElementById("studentsStatus");
const studentDetail = document.getElementById("studentDetail");

async function loadStudentsFromFirestore() {
  if (!studentsGrid || !studentsStatus) return;
  studentsStatus.textContent = "Chargement des réponses des customs depuis Firestore...";
  studentsGrid.innerHTML = "";

  try {
    const snapshot = await getDocs(collection(db, "customs_corrections"));
    allStudents = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      allStudents.push({
        id: data.studentId,
        name: data.name,
        uniqueId: data.uniqueId,
        customLabel: data.custom,
        vehicle: data.vehicle,
        status: data.status,
        answers: data.points || [],
        comment: data.comment || "",
        photos: data.photos || []
      });
    });

    renderStudents();
  } catch (error) {
    console.error(error);
    studentsStatus.textContent = "Erreur : impossible de charger les customs depuis Firestore.";
  }
}

function renderStudents() {
  if (!studentsGrid || !studentsStatus) return;

  const filtered = activeStudentFilter === "all"
    ? allStudents
    : allStudents.filter(s => s.customLabel === activeStudentFilter);

  studentsStatus.textContent = `${filtered.length} réponse(s) affichée(s).`;

  if (!filtered.length) {
    studentsGrid.innerHTML = `<div class="student-info-card wide"><h4>Aucune réponse</h4></div>`;
    return;
  }

  studentsGrid.innerHTML = filtered.map(student => `
    <button class="student-card ${student.status}" onclick="openStudentDetailWithLoading('${student.id}')">
      <small>${student.customLabel}</small>
      <h4>${student.name}</h4>
      <p>${student.vehicle} — ID ${student.uniqueId}</p>
      <div class="student-badge ${student.status}">${student.status}</div>
    </button>
  `).join("");
}

async function saveCustomCorrection(studentId, correction) {
  await setDoc(doc(db, "customs_corrections", studentId), correction);
  loadStudentsFromFirestore();
}

function setStudentFilter(filter) {
  activeStudentFilter = filter;
  document.querySelectorAll(".student-filter").forEach(btn => btn.classList.remove("active"));
  const currentBtn = document.querySelector(`[data-student-filter="${filter}"]`);
  if (currentBtn) currentBtn.classList.add("active");
  renderStudents();
}

// Ajouter ici les fonctions openStudentDetailWithLoading, openStudentDetail, closeStudentDetail
// et changeStudentStatus en les adaptant pour Firestore via saveCustomCorrection

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".student-filter").forEach(btn => {
    btn.addEventListener("click", () => setStudentFilter(btn.dataset.studentFilter));
  });
  loadStudentsFromFirestore();
});
