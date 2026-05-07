// assets/js/students-import.js
const SHEET_ID = "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc";

const SHEETS = [
  { name: "Dukes", label: "Custom Facile", vehicle: "Dukes", gid: "1133112226" },
  { name: "Sentinel XS4", label: "Custom Moyen", vehicle: "Sentinel XS4", gid: "1138787690" },
  { name: "Annis Rumina", label: "Custom Difficile", vehicle: "Annis Rumina", gid: "49030161" }
];

let allStudents = [];
let activeStudentFilter = "all";

const studentsGrid = document.getElementById("studentsGrid");
const studentsStatus = document.getElementById("studentsStatus");
const studentDetail = document.getElementById("studentDetail");

function csvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

function parseCSV(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (current || row.length) {
        row.push(current.trim());
        rows.push(row);
        row = [];
        current = "";
      }
      if (char === "\r" && next === "\n") i++;
    } else {
      current += char;
    }
  }
  if (current || row.length) {
    row.push(current.trim());
    rows.push(row);
  }
  return rows;
}

function isPhotoColumn(header) {
  const h = String(header).toLowerCase();
  return h.includes("photo") || h === "final";
}

function isUsefulValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function renderStudents() {
  if (!studentsGrid || !studentsStatus) return;
  const filtered = activeStudentFilter === "all" ? allStudents : allStudents.filter(s => s.sheet === activeStudentFilter);
  studentsStatus.textContent = `${filtered.length} réponse(s) affichée(s).`;

  if (!filtered.length) {
    studentsGrid.innerHTML = `<div class="student-info-card wide"><h4>Aucune réponse</h4><p>Aucune donnée trouvée.</p></div>`;
    return;
  }

  studentsGrid.innerHTML = filtered.map(student => `
    <button class="student-card" onclick="openStudentDetail('${student.id}')">
      <small>${student.customLabel}</small>
      <h4>${student.name}</h4>
      <p>${student.vehicle} — ID ${student.uniqueId}</p>
    </button>
  `).join("");
}

async function loadStudents() {
  if (!studentsGrid || !studentsStatus) return;

  studentsStatus.textContent = "Chargement des réponses depuis Google Sheets...";
  studentsGrid.innerHTML = "";
  allStudents = [];

  for (const sheet of SHEETS) {
    try {
      const resp = await fetch(csvUrl(sheet.gid));
      const csvText = await resp.text();
      const rows = parseCSV(csvText);
      if (rows.length < 2) continue;

      const headers = rows[0].map(h => h.trim());

      rows.slice(1).forEach((row, index) => {
        const studentId = `${sheet.name}-${index + 2}-${row[2] || row[1] || "unknown"}`;
        const student = {
          id: studentId,
          rowNumber: index + 2,
          sheet: sheet.name,
          customLabel: sheet.label,
          vehicle: sheet.vehicle,
          name: row[1] || "Sans nom",
          uniqueId: row[2] || "Aucun ID",
          photos: [],
          answers: []
        };

        headers.forEach((header, colIndex) => {
          const value = row[colIndex];
          if (!header || !isUsefulValue(value)) return;
          if (isPhotoColumn(header)) {
            student.photos.push({ label: header, url: value });
          } else {
            student.answers.push({ label: header, value });
          }
        });

        allStudents.push(student);
      });

    } catch (err) {
      console.error(`Erreur import ${sheet.name}:`, err);
    }
  }

  renderStudents();
}

window.loadStudents = loadStudents;
