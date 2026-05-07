import { getFirestore, collection, getDocs, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { app } from "./prof-login.js"; // ton Firebase déjà initialisé

const db = getFirestore(app);

let allStudents = [];
let activeStudentFilter = "all";

const studentsGrid = document.getElementById("studentsGrid");
const studentsStatus = document.getElementById("studentsStatus");
const studentDetail = document.getElementById("studentDetail");

// Récupération depuis Firestore
export async function loadFirestoreCustoms() {
  if (!studentsGrid || !studentsStatus) return;

  studentsStatus.textContent = "Import des réponses depuis Firestore...";
  studentsGrid.innerHTML = "";
  allStudents = [];

  try {
    const snapshot = await getDocs(collection(db, "customs"));
    snapshot.forEach(docSnap => {
      allStudents.push(docSnap.data());
    });

    renderStudents();
  } catch (err) {
    console.error(err);
    studentsStatus.textContent = "Erreur : impossible de charger les customs depuis Firestore.";
  }
}

// Affichage
export function renderStudents() {
  if (!studentsGrid || !studentsStatus) return;

  const filtered = activeStudentFilter === "all" 
    ? allStudents 
    : allStudents.filter(s => s.vehicle === activeStudentFilter);

  studentsStatus.textContent = `${filtered.length} réponse(s) affichée(s).`;

  if (!filtered.length) {
    studentsGrid.innerHTML = `<div class="student-info-card wide"><h4>Aucune réponse</h4><p>Pas de données pour ce filtre.</p></div>`;
    return;
  }

  studentsGrid.innerHTML = filtered.map(student => `
    <button class="student-card ${student.status}" onclick="openStudentDetail('${student.id}')">
      <small>${student.customLabel}</small>
      <h4>${student.name}</h4>
      <p>${student.vehicle} — ID ${student.uniqueId}</p>
      <div class="student-badge ${student.status}">${student.status}</div>
    </button>
  `).join("");
}

// Sauvegarder correction sur Firestore
export async function saveCustomFirestore(studentId, customData) {
  await setDoc(doc(db, "customs", studentId), customData);
}

// Filtre
export function setStudentFilter(filter) {
  activeStudentFilter = filter;
  renderStudents();
}
