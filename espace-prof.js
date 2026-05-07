// assets/js/espace-prof.js
let allStudents = [];
let allExams = [];
let activeStudentFilter = "all";

const studentsGrid = document.getElementById("studentsGrid");
const studentsStatus = document.getElementById("studentsStatus");
const studentDetail = document.getElementById("studentDetail");

const examGrid = document.getElementById("examGrid");
const examStatus = document.getElementById("examStatus");
const examDetail = document.getElementById("examDetail");

// --- FETCH DES CUSTOMS ---
async function loadStudentsFromServer() {
  if (!studentsGrid || !studentsStatus || !studentDetail) return;

  studentsStatus.textContent = "Chargement des réponses depuis le serveur...";
  studentsGrid.innerHTML = "";
  studentDetail.classList.remove("show");

  try {
    const res = await fetch("http://localhost:3000/load-customs");
    const data = await res.json();
    allStudents = [];

    for (const customName in data) {
      const rows = data[customName];
      rows.forEach((row, i) => {
        allStudents.push({
          id: `${customName}-${i}`,
          name: row[0] || "Sans nom",
          uniqueId: row[1] || "Aucun ID",
          sheet: customName,
          customLabel: row[2] || "Custom",
          vehicle: row[3] || "Véhicule",
          answers: row.slice(4)
        });
      });
    }

    renderStudents();
  } catch (err) {
    console.error(err);
    studentsStatus.textContent = "Erreur : impossible de charger les réponses du serveur.";
  }
}

// --- RENDER CUSTOMS ---
function renderStudents() {
  const filtered = activeStudentFilter === "all" ? allStudents : allStudents.filter(s => s.sheet === activeStudentFilter);
  studentsStatus.textContent = `${filtered.length} réponse(s) affichée(s).`;

  if (!filtered.length) {
    studentsGrid.innerHTML = `<div class="student-info-card wide"><h4>Aucune réponse</h4><p>Aucune donnée trouvée pour ce filtre.</p></div>`;
    return;
  }

  studentsGrid.innerHTML = filtered.map(student => `
    <button class="student-card" onclick="openStudentDetail('${student.id}')">
      <small>${student.customLabel}</small>
      <h4>${student.name}</h4>
      <p>${student.vehicle} — ID ${student.uniqueId}</p>
      <div class="student-badge">En attente</div>
    </button>
  `).join("");
}

// --- FETCH DES EXAMS ---
async function loadExamStudentsFromServer() {
  if (!examGrid || !examStatus || !examDetail) return;

  examStatus.textContent = "Chargement des réponses d’examen...";
  examGrid.innerHTML = "";
  examDetail.classList.remove("show");

  try {
    const res = await fetch("http://localhost:3000/load-exams");
    const data = await res.json();
    allExams = [];

    data.Examen.forEach((row, i) => {
      allExams.push({
        id: `exam-${i}`,
        name: row[0] || "Sans nom",
        uniqueId: row[1] || "Aucun ID",
        questions: row.slice(2),
        extras: { stage: false, custom: false },
        comment: ""
      });
    });

    renderExamStudents();
  } catch (err) {
    console.error(err);
    examStatus.textContent = "Erreur : impossible de charger les examens du serveur.";
  }
}

// --- RENDER EXAMS ---
function renderExamStudents() {
  examStatus.textContent = `${allExams.length} réponse(s) d’examen affichée(s).`;

  if (!allExams.length) {
    examGrid.innerHTML = `<div class="exam-empty-card"><h4>Aucune réponse</h4><p>Aucune donnée trouvée.</p></div>`;
    return;
  }

  examGrid.innerHTML = allExams.map(student => `
    <button class="exam-student-card" onclick="openExamDetail('${student.id}')">
      <small>Examen mécanique</small>
      <h4>${student.name}</h4>
      <p>ID ${student.uniqueId}</p>
      <div class="exam-score-row"><span>0 points</span><b>En attente</b></div>
    </button>
  `).join("");
}

// --- EXPORT POUR LE HTML ---
window.loadStudentsFromServer = loadStudentsFromServer;
window.loadExamStudentsFromServer = loadExamStudentsFromServer;
