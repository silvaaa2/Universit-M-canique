import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/*
  GOOGLE SHEETS PUBLIC EN LECTURE
  Le chargement se fait uniquement après login via prof-login.js.
*/
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
let customCorrections = {};

const studentsGrid = document.getElementById("studentsGrid");
const studentsStatus = document.getElementById("studentsStatus");
const studentDetail = document.getElementById("studentDetail");

function waitForProfUser() {
  return new Promise((resolve) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

function safeDocId(value) {
  return encodeURIComponent(String(value));
}

function csvUrl(gid) {
  const cache = Date.now();
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}&cache=${cache}`;
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
  return normalizeStatus(customCorrections[studentId]?.status);
}

async function loadCustomCorrections() {
  const user = await waitForProfUser();

  if (!user) {
    customCorrections = {};
    return;
  }

  const snapshot = await getDocs(collection(db, "customCorrections"));
  const loaded = {};

  snapshot.forEach((item) => {
    const data = item.data();
    if (!data.studentId) return;

    loaded[data.studentId] = {
      status: normalizeStatus(data.status),
      updatedBy: data.updatedBy || "",
      updatedAt: data.updatedAt || null
    };
  });

  customCorrections = loaded;
}

async function setStoredStatus(studentId, status) {
  const user = await waitForProfUser();

  if (!user) {
    throw new Error("Aucun professeur connecté.");
  }

  const cleanStatus = normalizeStatus(status);

  customCorrections[studentId] = {
    status: cleanStatus,
    updatedBy: user.email || "",
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, "customCorrections", safeDocId(studentId)), {
    studentId,
    status: cleanStatus,
    updatedBy: user.email || "",
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function isPhotoColumn(header) {
  const h = String(header).toLowerCase().trim();
  return h.includes("photo") || h === "final";
}

function isUsefulValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function showStudentLoading() {
  const authOverlay = document.getElementById("authOverlay");
  const authTitle = document.getElementById("authTitle");
  const authText = document.getElementById("authText");

  if (!authOverlay || !authTitle || !authText) return;

  authOverlay.style.display = "";
  authTitle.textContent = "Ouverture des réponses...";
  authText.textContent = "Chargement rapide de la fiche élève.";
  authOverlay.classList.add("show");
}

function hideStudentLoading() {
  const authOverlay = document.getElementById("authOverlay");

  if (!authOverlay) return;

  authOverlay.classList.remove("show");
  authOverlay.style.display = "none";
}

async function loadStudents() {
  if (!studentsStatus || !studentsGrid || !studentDetail) return;

  const user = await waitForProfUser();

  if (!user) {
    studentsStatus.textContent = "Connexion professeur requise.";
    return;
  }

  studentsStatus.textContent = "Import des réponses depuis Google Sheets...";
  studentsGrid.innerHTML = "";
  studentDetail.classList.remove("show", "focus-pop");
  document.body.classList.remove("student-focus");

  try {
    await loadCustomCorrections();

    const imported = [];

    for (const sheet of SHEETS) {
      const response = await fetch(csvUrl(sheet.gid));

      if (!response.ok) {
        throw new Error(`Erreur Google Sheets ${sheet.name} : ${response.status}`);
      }

      const csvText = await response.text();

      if (csvText.toLowerCase().includes("<html") || csvText.toLowerCase().includes("<!doctype")) {
        throw new Error(`Le Google Sheet ${sheet.name} ne renvoie pas un CSV. Vérifie le partage public en lecture.`);
      }

      const rows = parseCSV(csvText);

      if (rows.length < 2) continue;

      const headers = rows[0].map(h => String(h || "").trim());

      rows.slice(1).forEach((row, index) => {
        const rowNumber = index + 2;

        /*
          Selon ton ancien Google Forms :
          row[1] = Nom RP
          row[2] = ID unique
        */
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
    studentsStatus.textContent = "Erreur : impossible d’importer les réponses. Vérifie que le Google Sheets est accessible en lecture.";
  }
}

function renderStudents() {
  if (!studentsStatus || !studentsGrid) return;

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
    <button class="student-card ${student.status}" data-student-id="${escapeAttr(student.id)}">
      <small>${escapeHTML(student.customLabel)}</small>
      <h4>${escapeHTML(student.name)}</h4>
      <p>${escapeHTML(student.vehicle)} — ID ${escapeHTML(student.uniqueId)}</p>
      <div class="student-badge ${student.status}">
        ${statusLabel(student.status)}
      </div>
    </button>
  `).join("");

  document.querySelectorAll(".student-card[data-student-id]").forEach(card => {
    card.addEventListener("click", () => {
      openStudentDetailWithLoading(card.dataset.studentId);
    });
  });
}

function setStudentFilter(filter) {
  activeStudentFilter = filter;

  document.querySelectorAll(".student-filter").forEach(button => {
    button.classList.remove("active");
  });

  const currentButton = document.querySelector(`[data-student-filter="${filter}"]`);
  if (currentButton) {
    currentButton.classList.add("active");
  }

  if (studentDetail) {
    studentDetail.classList.remove("show", "focus-pop");
  }

  document.body.classList.remove("student-focus");
  renderStudents();
}

function openStudentDetailWithLoading(studentId) {
  showStudentLoading();

  setTimeout(() => {
    openStudentDetail(studentId);
    hideStudentLoading();
  }, 180);
}

function openStudentDetail(studentId) {
  const student = allStudents.find(item => item.id === studentId);
  if (!student || !studentDetail) return;

  const mainAnswers = student.answers.filter(item => {
    const label = String(item.label || "").toLowerCase();
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
      <button class="status-btn approve" data-status-action="approved" data-student-id="${escapeAttr(student.id)}">
        Approuver
      </button>

      <button class="status-btn refuse" data-status-action="refused" data-student-id="${escapeAttr(student.id)}">
        Refuser
      </button>

      <button class="status-btn pending" data-status-action="pending" data-student-id="${escapeAttr(student.id)}">
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
                  <a class="photo-link" href="${escapeAttr(photo.url)}" target="_blank" rel="noopener noreferrer">
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
          mainAnswers.length
            ? mainAnswers.map(answer => `
                <div class="student-line">
                  <strong>${escapeHTML(cleanHeader(answer.label))}</strong>
                  <span>${formatAnswerValue(answer.value)}</span>
                </div>
              `).join("")
            : `<p>Aucune réponse détectée.</p>`
        }
      </div>
    </div>
  `;

  document.querySelectorAll("[data-status-action]").forEach(button => {
    button.addEventListener("click", () => {
      changeStudentStatus(button.dataset.studentId, button.dataset.statusAction);
    });
  });

  document.querySelectorAll(".custom-answer-panel").forEach(panel => {
    panel.classList.remove("show");
  });

  hideStudentLoading();

  const authOverlay = document.getElementById("authOverlay");
  if (authOverlay) {
    authOverlay.classList.remove("show");
    authOverlay.style.display = "none";
  }

  document.body.classList.add("student-focus");
  studentDetail.classList.add("show");

  studentDetail.classList.remove("focus-pop");
  void studentDetail.offsetWidth;
  studentDetail.classList.add("focus-pop");
}

function closeStudentDetail() {
  if (studentDetail) {
    studentDetail.classList.remove("show", "focus-pop");
  }

  document.body.classList.remove("student-focus");

  const authOverlay = document.getElementById("authOverlay");
  if (authOverlay) {
    authOverlay.classList.remove("show");
    authOverlay.style.display = "";
  }

  const dashboard = document.querySelector(".students-dashboard");
  if (dashboard) {
    dashboard.scrollIntoView({
      behavior: "auto",
      block: "start"
    });
  }
}

async function changeStudentStatus(studentId, status) {
  const student = allStudents.find(item => item.id === studentId);
  if (!student) return;

  const previousStatus = student.status;
  student.status = normalizeStatus(status);

  renderStudents();
  openStudentDetail(student.id);

  try {
    await setStoredStatus(student.id, student.status);
  } catch (error) {
    console.error(error);
    student.status = previousStatus;
    renderStudents();
    openStudentDetail(student.id);
    alert("Impossible de sauvegarder le statut. Vérifie Firestore.");
  }
}

function cleanHeader(header) {
  return String(header)
    .replace("Prénom - Nom (RP)", "Nom RP")
    .replace("Prénom / Nom", "Nom RP")
    .replace("Prenom/ Nom", "Nom RP")
    .replace("ID Unique", "ID unique")
    .replace("Id unique", "ID unique")
    .replace("Photo menu ", "")
    .replace("Photo ", "")
    .trim();
}

function formatAnswerValue(value) {
  const text = escapeHTML(value);

  const urlRegex = /(https?:\/\/[^\s<]+)/g;

  return text.replace(urlRegex, (url) => {
    const cleanUrl = url.replace(/&amp;/g, "&");
    return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value);
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".student-filter").forEach(button => {
    button.addEventListener("click", () => {
      setStudentFilter(button.dataset.studentFilter);
    });
  });
});

window.loadStudents = loadStudents;
window.renderStudents = renderStudents;
window.setStudentFilter = setStudentFilter;
window.openStudentDetailWithLoading = openStudentDetailWithLoading;
window.openStudentDetail = openStudentDetail;
window.closeStudentDetail = closeStudentDetail;
window.changeStudentStatus = changeStudentStatus;
