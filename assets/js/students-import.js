import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = window.firebaseDb; // déjà initialisé dans prof-login.js
let allStudents = [];
let activeStudentFilter = "all";

const studentsGrid = document.getElementById("studentsGrid");
const studentsStatus = document.getElementById("studentsStatus");
const studentDetail = document.getElementById("studentDetail");

// Récupère les réponses depuis Firestore uniquement si connecté
export async function loadStudents() {
  const user = window.currentProfUser;
  if (!user) {
    studentsStatus.textContent = "Connexion requise pour voir les réponses.";
    return;
  }

  studentsStatus.textContent = "Chargement des réponses…";
  studentsGrid.innerHTML = "";
  studentDetail.classList.remove("show");

  try {
    const snapshot = await getDocs(collection(db, "customAnswers"));
    const imported = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      imported.push({
        id: doc.id,
        name: data.name || "Sans nom",
        vehicle: data.vehicle || "Véhicule",
        sheet: data.sheet || "Custom",
        customLabel: data.customLabel || "Custom",
        status: data.status || "pending",
        answers: data.answers || [],
        photos: data.photos || []
      });
    });

    allStudents = imported;
    renderStudents();
  } catch (err) {
    console.error(err);
    studentsStatus.textContent = "Erreur : impossible de charger les réponses.";
  }
}

function renderStudents() {
  const filtered = activeStudentFilter === "all"
    ? allStudents
    : allStudents.filter(s => s.sheet === activeStudentFilter);

  studentsStatus.textContent = `${filtered.length} réponse(s) affichée(s).`;

  if (!filtered.length) {
    studentsGrid.innerHTML = `<div class="student-info-card wide"><h4>Aucune réponse</h4></div>`;
    return;
  }

  studentsGrid.innerHTML = filtered.map(student => `
    <button class="student-card ${student.status}" onclick="openStudentDetail('${student.id}')">
      <small>${student.customLabel}</small>
      <h4>${student.name}</h4>
      <p>${student.vehicle}</p>
      <div class="student-badge ${student.status}">
        ${student.status === "approved" ? "Approuvé" : student.status === "refused" ? "Refusé" : "En attente"}
      </div>
    </button>
  `).join("");
}

window.loadStudents = loadStudents;
