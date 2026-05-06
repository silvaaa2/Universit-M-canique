const SHEET_ID = "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc";

const SHEETS = [
  {
    name: "Dukes",
    label: "Custom Facile",
    vehicle: "Dukes",
    gid: "1133112226"
  },
  {
    name: "Sentinel XS4",
    label: "Custom Moyen",
    vehicle: "Sentinel XS4",
    gid: "1138787690"
  },
  {
    name: "Annis Rumina",
    label: "Custom Difficile",
    vehicle: "Annis Rumina",
    gid: "49030161"
  }
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

      if (char === "\r" && next === "\n") {
        i++;
      }
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

function normalizeStatus(status) {
  if (status === "approved") return "approved";
  if (status === "refused") return "refused";
  return "pending";
}

function statusLabel(status) {
  if (status === "approved") return "Approuvé";
  if (status === "refused") return "Refusé";
  return "En attente";
}

function getStoredStatus(studentId) {
  return normalizeStatus(localStorage.getItem(`student-status-${studentId}`));
}

function setStoredStatus(studentId, status) {
  localStorage.setItem(`student-status-${studentId}`, status);
}

function isPhotoColumn(header) {
  const h = String(header).toLowerCase();
  return h.includes("photo") || h === "final";
}

function isUsefulValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

/* Loader focus élève */
function showStudentLoading() {
  const authOverlay = document.getElementById("authOverlay");
  const authTitle = document.getElementById("authTitle");
  const authText = document.getElementById("authText");

  if (!authOverlay || !authTitle || !authText) return;

  authTitle.textContent = "Ouverture des réponses...";
  authText.textContent = "Chargement de la fiche élève et des éléments envoyés.";
  authOverlay.classList.add("show");
}

function hideStudentLoading() {
  const authOverlay = document.getElementById("authOverlay");

  if (!authOverlay) return;

  authOverlay.classList.remove("show");
}

/* Import Google Sheets */
async function loadStudents() {
  studentsStatus.textContent = "Import des réponses depuis Google Sheets...";
  studentsGrid.innerHTML = "";
  studentDetail.classList.remove("show");
  document.body.classList.remove("student-focus");

  try {
    const imported = [];

    for (const sheet of SHEETS) {
      const response = await fetch(csvUrl(sheet.gid));
      const csvText = await response.text();
      const rows = parseCSV(csvText);

      if (rows.length < 2) continue;

      const headers = rows[0].map(h => h.trim());

      rows.slice(1).forEach((row, index) => {
        const rowNumber = index + 2;

        const name = row[1] || "";
        const uniqueId = row[2] || "";

        if (!name && !uniqueId) return;

        const studentId = `${sheet.name}-${rowNumber}-${uniqueId || name}`;

        const student = {
          id: studentId,
          rowNumber,
          sheet: sheet.name,
          customLabel: sheet.label,
          vehicle: sheet.vehicle,
          name: name || "Sans nom",
          uniqueId: uniqueId || "Aucun ID",
          status: getStoredStatus(studentId),
          answers: [],
          photos: []
        };

        headers.forEach((header, colIndex) => {
          if (!header) return;

          const value = row[colIndex];

          if (!isUsefulValue(value)) return;

          if (isPhotoColumn(header)) {
            student.photos.push({
              label: header,
              url: value
            });
          } else {
            student.answers.push({
              label: header,
              value: value
            });
          }
        });

        imported.push(student);
      });
    }

    allStudents = imported;
    renderStudents();

  } catch (error) {
    console.error(error);
    studentsStatus.textContent = "Erreur : impossible d’importer les réponses. Vérifie que le Google Sheets est public.";
  }
}

/* Affichage des étiquettes */
function renderStudents() {
  const filtered = activeStudentFilter === "all"
    ? allStudents
    : allStudents.filter(student => student.sheet === activeStudentFilter);

  studentsStatus.textContent = `${filtered.length} réponse(s) affichée(s).`;

  if (!filtered.length) {
    studentsGrid.innerHTML = `
      <div class="student-info-card wide">
        <h4>Aucune réponse</h4>
        <p>Aucune ligne trouvée pour ce filtre.</p>
      </div>
    `;
    return;
  }

  studentsGrid.innerHTML = filtered.map(student => `
    <button class="student-card ${student.status}" onclick="openStudentDetailWithLoading('${student.id}')">
      <small>${student.customLabel}</small>
      <h4>${escapeHTML(student.name)}</h4>
      <p>${escapeHTML(student.vehicle)} — ID ${escapeHTML(student.uniqueId)}</p>
      <div class="student-badge ${student.status}">
        ${statusLabel(student.status)}
      </div>
    </button>
  `).join("");
}

/* Filtres */
function setStudentFilter(filter) {
  activeStudentFilter = filter;

  document.querySelectorAll(".student-filter").forEach(button => {
    button.classList.remove("active");
  });

  const currentButton = document.querySelector(`[data-student-filter="${filter}"]`);
  if (currentButton) {
    currentButton.classList.add("active");
  }

  studentDetail.classList.remove("show");
  document.body.classList.remove("student-focus");
  renderStudents();
}

/* Ouverture avec loader */
function openStudentDetailWithLoading(studentId) {
  showStudentLoading();

  setTimeout(() => {
    openStudentDetail(studentId);
    hideStudentLoading();
  }, 850);
}

/* Fiche élève */
function openStudentDetail(studentId) {
  const student = allStudents.find(item => item.id === studentId);
  if (!student) return;

  const mainAnswers = student.answers.filter(item => {
    const label = item.label.toLowerCase();
    return !label.includes("horodateur");
  });

  studentDetail.innerHTML = `
    <div class="student-detail-head">
      <div>
        <span>${escapeHTML(student.customLabel)}</span>
        <h3>${escapeHTML(student.name)}</h3>
        <p>${escapeHTML(student.vehicle)} — ID unique : ${escapeHTML(student.uniqueId)}</p>
      </div>

      <button class="student-close" onclick="closeStudentDetail()">×</button>
    </div>

    <div class="student-focus-status ${student.status}">
      ${statusLabel(student.status)}
    </div>

    <div class="student-detail-actions">
      <button class="status-btn approve" onclick="changeStudentStatus('${student.id}', 'approved')">
        Approuver
      </button>

      <button class="status-btn refuse" onclick="changeStudentStatus('${student.id}', 'refused')">
        Refuser
      </button>

      <button class="status-btn pending" onclick="changeStudentStatus('${student.id}', 'pending')">
        Remettre en attente
      </button>
    </div>

    <div class="student-info-grid">
      <div class="student-info-card">
        <h4>Informations élève</h4>

        <div class="student-line">
          <strong>Nom RP</strong>
          <span>${escapeHTML(student.name)}</span>
        </div>

        <div class="student-line">
          <strong>ID unique</strong>
          <span>${escapeHTML(student.uniqueId)}</span>
        </div>

        <div class="student-line">
          <strong>Custom</strong>
          <span>${escapeHTML(student.customLabel)} — ${escapeHTML(student.vehicle)}</span>
        </div>

        <div class="student-line">
          <strong>Statut</strong>
          <span>${statusLabel(student.status)}</span>
        </div>
      </div>

      <div class="student-info-card">
        <h4>Photos envoyées</h4>

        <div class="student-photos">
          ${
            student.photos.length
              ? student.photos.map(photo => `
                  <a class="photo-link" href="${escapeAttr(photo.url)}" target="_blank">
                    ${escapeHTML(cleanHeader(photo.label))}
                  </a>
                `).join("")
              : `<p>Aucune photo détectée.</p>`
          }
        </div>
      </div>

      <div class="student-info-card wide">
        <h4>Réponses du formulaire</h4>

        ${
          mainAnswers.map(answer => `
            <div class="student-line">
              <strong>${escapeHTML(cleanHeader(answer.label))}</strong>
              <span>${escapeHTML(answer.value)}</span>
            </div>
          `).join("")
        }
      </div>
    </div>
  `;

  /* Ferme les fiches customs si ouvertes */
  document.querySelectorAll(".custom-answer-panel").forEach(panel => {
    panel.classList.remove("show");
  });

  /* Active le vrai mode focus */
  document.body.classList.add("student-focus");
  studentDetail.classList.add("show");
}

/* Fermeture fiche élève */
function closeStudentDetail() {
  studentDetail.classList.remove("show");
  document.body.classList.remove("student-focus");

  setTimeout(() => {
    const dashboard = document.querySelector(".students-dashboard");
    if (dashboard) {
      dashboard.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, 80);
}

/* Changement statut */
function changeStudentStatus(studentId, status) {
  const student = allStudents.find(item => item.id === studentId);
  if (!student) return;

  student.status = normalizeStatus(status);
  setStoredStatus(student.id, student.status);

  renderStudents();
  openStudentDetail(student.id);
}

/* Nettoyage affichage */
function cleanHeader(header) {
  return String(header)
    .replace("Prénom - Nom (RP)", "Nom RP")
    .replace("ID Unique", "ID unique")
    .replace("Photo menu ", "")
    .replace("Photo ", "")
    .trim();
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value);
}

/* Init */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".student-filter").forEach(button => {
    button.addEventListener("click", () => {
      setStudentFilter(button.dataset.studentFilter);
    });
  });

  loadStudents();
});
