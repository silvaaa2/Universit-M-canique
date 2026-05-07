const EXAM_SHEET_ID = "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY";
const EXAM_GID = "282279229";

const EXAM_MAX_POINTS = 50;
const EXAM_PASS_POINTS = 40;

/*
  Points automatiques :
  Le site divise 50 points sur toutes les questions détectées.
  Si tu veux forcer manuellement plus tard :
  const EXAM_POINTS_MANUAL = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
*/
const EXAM_POINTS_MANUAL = [];

let allExamStudents = [];

const examStatus = document.getElementById("examStatus");
const examGrid = document.getElementById("examGrid");
const examDetail = document.getElementById("examDetail");

function examCsvUrl() {
  return `https://docs.google.com/spreadsheets/d/${EXAM_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${EXAM_GID}`;
}

function parseExamCSV(text) {
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

function examEscapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeExamHeader(header) {
  return String(header ?? "").trim().toLowerCase();
}

function isExamMetaColumn(header) {
  const h = normalizeExamHeader(header);

  return (
    h.includes("horodateur") ||
    h.includes("timestamp") ||
    h.includes("adresse e-mail") ||
    h.includes("email") ||
    h.includes("score") ||
    h.includes("prénom") ||
    h.includes("prenom") ||
    h.includes("nom") ||
    h.includes("id unique") ||
    h === "id"
  );
}

function getExamName(row, headers) {
  const index = headers.findIndex(header => {
    const h = normalizeExamHeader(header);
    return h.includes("prénom") || h.includes("prenom") || h.includes("nom");
  });

  return index >= 0 && row[index] ? row[index] : "Sans nom";
}

function getExamUniqueId(row, headers) {
  const index = headers.findIndex(header => {
    const h = normalizeExamHeader(header);
    return h.includes("id unique") || h === "id";
  });

  return index >= 0 && row[index] ? row[index] : "Aucun ID";
}

function getExamEmail(row, headers) {
  const index = headers.findIndex(header => {
    const h = normalizeExamHeader(header);
    return h.includes("adresse e-mail") || h.includes("email");
  });

  return index >= 0 && row[index] ? row[index] : "";
}

function getFormScore(row, headers) {
  const index = headers.findIndex(header => normalizeExamHeader(header).includes("score"));
  return index >= 0 && row[index] ? row[index] : "";
}

function getExamQuestionMaxPoints(questionIndex, totalQuestions) {
  if (EXAM_POINTS_MANUAL.length) {
    return Number(EXAM_POINTS_MANUAL[questionIndex]) || 0;
  }

  if (!totalQuestions) return 0;

  const base = Math.floor(EXAM_MAX_POINTS / totalQuestions);
  const remainder = EXAM_MAX_POINTS % totalQuestions;

  return questionIndex < remainder ? base + 1 : base;
}

function getExamStorageKey(studentId) {
  return `exam-correction-${studentId}`;
}

function getExamCorrection(studentId) {
  try {
    const saved = localStorage.getItem(getExamStorageKey(studentId));
    if (!saved) return null;
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function saveExamCorrection(studentId, correction) {
  localStorage.setItem(getExamStorageKey(studentId), JSON.stringify(correction));
}

function calculateExamTotal(student) {
  const correction = getExamCorrection(student.id);

  if (!correction || !correction.points) {
    return 0;
  }

  return student.questions.reduce((total, question, index) => {
    const value = Number(correction.points[index] ?? 0);
    const safeValue = Math.max(0, Math.min(value, question.maxPoints));
    return total + safeValue;
  }, 0);
}

function getExamResult(total) {
  if (total >= EXAM_PASS_POINTS) {
    return "passed";
  }

  if (total > 0) {
    return "failed";
  }

  return "pending";
}

function getExamResultLabel(result) {
  if (result === "passed") return "Réussi";
  if (result === "failed") return "Échoué";
  return "En attente";
}

async function loadExamStudents() {
  if (!examStatus || !examGrid || !examDetail) return;

  examStatus.textContent = "Import des réponses d’examen depuis Google Sheets...";
  examGrid.innerHTML = "";
  examDetail.classList.remove("show");

  try {
    const response = await fetch(examCsvUrl());
    const csvText = await response.text();
    const rows = parseExamCSV(csvText);

    if (rows.length < 2) {
      examStatus.textContent = "Aucune réponse d’examen trouvée.";
      return;
    }

    const headers = rows[0].map(header => header.trim());

    const questionHeaders = headers
      .map((header, index) => ({ header, index }))
      .filter(item => item.header && !isExamMetaColumn(item.header));

    const imported = [];

    rows.slice(1).forEach((row, index) => {
      const name = getExamName(row, headers);
      const uniqueId = getExamUniqueId(row, headers);
      const email = getExamEmail(row, headers);
      const formScore = getFormScore(row, headers);

      if (!name && !uniqueId && !email) return;

      const studentId = `exam-${index + 2}-${uniqueId || name || email}`;

      const questions = questionHeaders.map((item, questionIndex) => ({
        label: item.header,
        answer: row[item.index] || "",
        maxPoints: getExamQuestionMaxPoints(questionIndex, questionHeaders.length)
      }));

      imported.push({
        id: studentId,
        rowNumber: index + 2,
        name,
        uniqueId,
        email,
        formScore,
        questions
      });
    });

    allExamStudents = imported;
    renderExamStudents();

  } catch (error) {
    console.error(error);
    examStatus.textContent = "Erreur : impossible d’importer l’examen. Vérifie que le Google Sheets est public.";
  }
}

function renderExamStudents() {
  if (!examStatus || !examGrid) return;

  examStatus.textContent = `${allExamStudents.length} réponse(s) d’examen affichée(s).`;

  if (!allExamStudents.length) {
    examGrid.innerHTML = `
      <div class="exam-empty-card">
        <h4>Aucune réponse</h4>
        <p>Aucune ligne trouvée dans le Google Sheets de l’examen.</p>
      </div>
    `;
    return;
  }

  examGrid.innerHTML = allExamStudents.map(student => {
    const total = calculateExamTotal(student);
    const result = getExamResult(total);

    return `
      <button class="exam-student-card ${result}" onclick="openExamDetail('${student.id}')">
        <small>Examen Module 4</small>
        <h4>${examEscapeHTML(student.name)}</h4>
        <p>ID ${examEscapeHTML(student.uniqueId)}</p>

        <div class="exam-score-row">
          <span>${total}/${EXAM_MAX_POINTS}</span>
          <b class="${result}">${getExamResultLabel(result)}</b>
        </div>
      </button>
    `;
  }).join("");
}

function openExamDetail(studentId) {
  const student = allExamStudents.find(item => item.id === studentId);
  if (!student || !examDetail) return;

  const correction = getExamCorrection(student.id) || { points: {}, comment: "" };
  const total = calculateExamTotal(student);
  const result = getExamResult(total);

  if (typeof closeCustomAnswers === "function") {
    closeCustomAnswers();
  }

  examDetail.innerHTML = `
    <div class="exam-detail-head">
      <div>
        <span>Fiche examen</span>
        <h3>${examEscapeHTML(student.name)}</h3>
        <p>ID unique : ${examEscapeHTML(student.uniqueId)}</p>
      </div>

      <button type="button" class="exam-detail-close" onclick="closeExamDetail()">×</button>
    </div>

    <div class="exam-result-bar ${result}">
      <div>
        <strong>Score actuel</strong>
        <span>${total}/${EXAM_MAX_POINTS}</span>
      </div>

      <div>
        <strong>Résultat</strong>
        <span>${getExamResultLabel(result)}</span>
      </div>

      <div>
        <strong>Minimum requis</strong>
        <span>${EXAM_PASS_POINTS}/${EXAM_MAX_POINTS}</span>
      </div>
    </div>

    ${
      student.formScore
        ? `<div class="exam-form-score">Score Google Forms détecté : <strong>${examEscapeHTML(student.formScore)}</strong></div>`
        : ""
    }

    <div class="exam-questions">
      ${
        student.questions.map((question, index) => {
          const savedPoint = correction.points?.[index] ?? "";

          return `
            <div class="exam-question-card">
              <div class="exam-question-top">
                <div>
                  <span>Question ${index + 1}</span>
                  <h4>${examEscapeHTML(question.label)}</h4>
                </div>

                <label>
                  Points
                  <input
                    type="number"
                    min="0"
                    max="${question.maxPoints}"
                    step="0.5"
                    value="${examEscapeHTML(savedPoint)}"
                    data-exam-point-index="${index}"
                    oninput="updateExamPoint('${student.id}', ${index}, this.value)"
                  >
                  <small>/ ${question.maxPoints}</small>
                </label>
              </div>

              <div class="exam-answer-box">
                <strong>Réponse élève</strong>
                <p>${examEscapeHTML(question.answer || "Aucune réponse.")}</p>
              </div>
            </div>
          `;
        }).join("")
      }
    </div>

    <div class="exam-comment-card">
      <label>
        Commentaire de correction
        <textarea
          placeholder="Exemple : Bon niveau général, revoir certaines notions..."
          oninput="updateExamComment('${student.id}', this.value)"
        >${examEscapeHTML(correction.comment || "")}</textarea>
      </label>
    </div>
  `;

  examDetail.classList.add("show");

  setTimeout(() => {
    examDetail.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, 80);
}

function updateExamPoint(studentId, questionIndex, value) {
  const student = allExamStudents.find(item => item.id === studentId);
  if (!student) return;

  const correction = getExamCorrection(studentId) || { points: {}, comment: "" };
  const question = student.questions[questionIndex];

  let number = Number(value);

  if (Number.isNaN(number)) {
    number = 0;
  }

  number = Math.max(0, Math.min(number, question.maxPoints));

  correction.points[questionIndex] = number;
  saveExamCorrection(studentId, correction);

  renderExamStudents();

  const total = calculateExamTotal(student);
  const result = getExamResult(total);

  const resultBar = examDetail.querySelector(".exam-result-bar");
  if (resultBar) {
    resultBar.className = `exam-result-bar ${result}`;
    resultBar.innerHTML = `
      <div>
        <strong>Score actuel</strong>
        <span>${total}/${EXAM_MAX_POINTS}</span>
      </div>

      <div>
        <strong>Résultat</strong>
        <span>${getExamResultLabel(result)}</span>
      </div>

      <div>
        <strong>Minimum requis</strong>
        <span>${EXAM_PASS_POINTS}/${EXAM_MAX_POINTS}</span>
      </div>
    `;
  }
}

function updateExamComment(studentId, value) {
  const correction = getExamCorrection(studentId) || { points: {}, comment: "" };
  correction.comment = value;
  saveExamCorrection(studentId, correction);
}

function closeExamDetail() {
  if (!examDetail) return;
  examDetail.classList.remove("show");
}

document.addEventListener("DOMContentLoaded", () => {
  loadExamStudents();
});
