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

let allStudents = [];
let activeStudentFilter = "all";

const studentsGrid = document.getElementById("studentsGrid");
const studentsStatus = document.getElementById("studentsStatus");
const studentDetail = document.getElementById("studentDetail");

async function loadStudentsFromFirestore() {
  if (!studentsGrid || !studentsStatus || !studentDetail) return;

  studentsStatus.textContent = "Chargement des réponses depuis Firestore...";
  studentsGrid.innerHTML = "";
  studentDetail.classList.remove("show");
  document.body.classList.remove("student-focus");

  try {
    const snapshot = await getDocs(collection(db, "customs"));
    const imported = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      imported.push({
        id: doc.id,
        name: data.name || "Sans nom",
        uniqueId: data.uniqueId || "Aucun ID",
        sheet: data.sheet || "Custom",
        customLabel: data.customLabel || "Custom",
        vehicle: data.vehicle || "Véhicule",
        status: data.status || "pending",
        photos: data.photos || [],
        answers: data.answers || []
      });
    });

    allStudents = imported;
    renderStudents();
  } catch (err) {
    console.error(err);
    studentsStatus.textContent = "Erreur : impossible de charger les réponses Firestore.";
  }
}

function renderStudents() {
  const filtered = activeStudentFilter === "all" ? allStudents : allStudents.filter(s => s.sheet === activeStudentFilter);
  studentsStatus.textContent = `${filtered.length} réponse(s) affichée(s).`;

  if (!filtered.length) {
    studentsGrid.innerHTML = `<div class="student-info-card wide"><h4>Aucune réponse</h4><p>Aucune donnée trouvée pour ce filtre.</p></div>`;
    return;
  }

  studentsGrid.innerHTML = filtered.map(student => `
    <button class="student-card ${student.status}" onclick="openStudentDetailWithLoading('${student.id}')">
      <small>${student.customLabel}</small>
      <h4>${student.name}</h4>
      <p>${student.vehicle} — ID ${student.uniqueId}</p>
      <div class="student-badge ${student.status}">${student.status === "approved" ? "Approuvé" : student.status === "refused" ? "Refusé" : "En attente"}</div>
    </button>
  `).join("");
}

// Réutilise toutes les fonctions openStudentDetail, closeStudentDetail, changeStudentStatus etc.
// (tu peux copier les fonctions déjà existantes de ton students-import.js ici)
window.loadStudentsFromFirestore = loadStudentsFromFirestore;
