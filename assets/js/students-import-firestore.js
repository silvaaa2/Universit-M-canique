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

function statusLabel(status) {
  if (status === "approved") return "Approuvé";
  if (status === "refused") return "Refusé";
  return "En attente";
}

function renderStudents() {
  if (!studentsStatus || !studentsGrid) return;

  const filtered = activeStudentFilter === "all"
    ? allStudents
    : allStudents.filter(student => student.vehicle === activeStudentFilter);

  studentsStatus.textContent = `${filtered.length} réponse(s) affichée(s).`;

  if (!filtered.length) {
    studentsGrid.innerHTML = `<div class="student-info-card wide"><h4>Aucune réponse</h4></div>`;
    return;
  }

  studentsGrid.innerHTML = filtered.map(student => `
    <button class="student-card ${student.status}" onclick="openStudentDetail('${student.id}')">
      <small>${student.vehicle}</small>
      <h4>${student.name}</h4>
      <p>ID ${student.uniqueId}</p>
      <div class="student-badge ${student.status}">${statusLabel(student.status)}</div>
    </button>
  `).join("");
}

export async function loadStudents() {
  if (!studentsStatus || !studentsGrid) return;
  studentsStatus.textContent = "Chargement des réponses depuis Firestore...";

  try {
    const querySnapshot = await getDocs(collection(db, "customs"));
    allStudents = [];
    querySnapshot.forEach(doc => {
      allStudents.push(doc.data());
    });

    renderStudents();
  } catch (e) {
    console.error(e);
    studentsStatus.textContent = "Erreur : impossible de charger les réponses Firestore.";
  }
}

export function setStudentFilter(filter) {
  activeStudentFilter = filter;
  renderStudents();
}
