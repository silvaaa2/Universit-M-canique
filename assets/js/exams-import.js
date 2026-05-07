// assets/js/exams-import.js
const EXAM_SHEET_ID = "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY";
const EXAM_GID = "282279229";
const EXAM_MAX_POINTS = 50;
const EXAM_PASS_POINTS = 40;

let allExamStudents = [];

const examStatus = document.getElementById("examStatus");
const examGrid = document.getElementById("examGrid");
const examDetail = document.getElementById("examDetail");

function examCsvUrl() {
  return `https://docs.google.com/spreadsheets/d/${EXAM_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${EXAM_GID}`;
}

function parseCSV(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') { current += '"'; i++; }
    else if (char === '"') { inQuotes = !inQuotes; }
    else if (char === "," && !inQuotes) { row.push(current.trim()); current = ""; }
    else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (current || row.length) { row.push(current.trim()); rows.push(row); row = []; current = ""; }
      if (char === "\r" && next === "\n") i++;
    } else { current += char; }
  }
  if (current || row.length) { row.push(current.trim()); rows.push(row); }
  return rows;
}

function loadExamStudents() {
  if (!examStatus || !examGrid) return;
  examStatus.textContent = "Chargement des réponses de l'examen..."; 
  examGrid.innerHTML = "";
  allExamStudents = [];

  fetch(examCsvUrl())
    .then(resp => resp.text())
    .then(csvText => {
      const rows = parseCSV(csvText);
      if (rows.length < 2) {
        examStatus.textContent = "Aucune réponse d’examen trouvée.";
        return;
      }

      const headers = rows[0].map(h => h.trim());
      const questionHeaders = headers.filter(h => !["timestamp","email","prénom","nom","id unique"].includes(h.toLowerCase()));

      rows.slice(1).forEach((row, index) => {
        const studentId = `exam-${index + 2}-${row[2] || row[1] || "unknown"}`;
        const student = {
          id: studentId,
          rowNumber: index + 2,
          name: row[1] || "Sans nom",
          uniqueId: row[2] || "Aucun ID",
          questions: questionHeaders.map((q, i) => ({
            label: q,
            answer: row[i+3] || "", // décalage selon ton CSV
            maxPoints: 5
          }))
        };
        allExamStudents.push(student);
      });

      examStatus.textContent = `${allExamStudents.length} réponse(s) chargée(s)`;
      renderExamStudents();
    });
}

function renderExamStudents() {
  if (!examGrid || !examStatus) return;
  examGrid.innerHTML = allExamStudents.map(s => `
    <button class="exam-student-card" onclick="openExamDetail('${s.id}')">
      <h4>${s.name}</h4>
      <p>ID ${s.uniqueId}</p>
    </button>
  `).join("");
}

window.loadExamStudents = loadExamStudents;
