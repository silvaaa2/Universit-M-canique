const EXAM_SHEET_ID = "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY";
const EXAM_GID = "282279229";

const EXAM_MAX_POINTS = 50;
const EXAM_PASS_POINTS = 40;

const EXAM_POINTS_MANUAL = [
  1, // Q1
  6, // Q2
  2, // Q3
  3, // Q4
  4, // Q5
  7, // Q6
  1, // Q7
  4, // Q8
  5, // Q9
  3, // Q10
  4, // Q11
  3, // Q12
  3, // Q13
  4  // Q14
];

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

function getExamStorageKey(studentId) {
  return `exam-correction-${studentId}`;
}

function getExamCorrection(studentId) {
  try {
    const saved = localStorage.getItem(getExamStorageKey(studentId));
    if (!saved) {
      return {
        points: {},
        extras: {
          stage: false,
          custom: false
        },
        comment: ""
      };
    }

    const parsed = JSON.parse(saved);

    return {
      points: parsed.points || {},
      extras: {
        stage: Boolean(parsed.extras?.stage),
        custom: Boolean(parsed.extras?.custom)
      },
      comment: parsed.comment || ""
    };
  } catch {
    return {
      points: {},
      extras: {
        stage: false,
        custom: false
      },
      comment: ""
    };
  }
}

function saveExamCorrection(studentId, correction) {
  localStorage.setItem(getExamStorageKey(studentId), JSON.stringify(correction));
}

function getExamQuestionMaxPoints(questionIndex) {
  return Number(EXAM_POINTS_MANUAL[questionIndex]) || 0;
}

function calculateExamBaseScore(student) {
  const correction = getExamCorrection(student.id);

  return student.questions.reduce((total, question, index) => {
    const value = Number(correction.points[index] ?? 0);
    const safeValue = Math.max(0, Math.min(value, question.maxPoints));
    return total + safeValue;
  }, 0);
}

function calculateExamExtraPoints(student) {
  const correction = getExamCorrection(student.id);
  let bonus = 0;

  if (correction.extras?.stage) bonus += 1;
  if (correction.extras?.custom) bonus += 1;

  return bonus;
}

function calculateExamFinalScore(student) {
  return calculateExamBaseScore(student) + calculateExamExtraPoints(student);
}

function getExamResult(student) {
  const finalScore = calculateExamFinalScore(student);

  if (finalScore >= EXAM_PASS_POINTS) return "passed";
  if (finalScore > 0) return "failed";
  return "pending";
}

function getExamResultLabel(result) {
  if (result === "passed") return "Approuvé";
  if (result === "failed") return "Refusé";
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

      if (!name && !uniqueId) return;

      const studentId = `exam-${index + 2}-${uniqueId || name}`;

      const questions = questionHeaders.map((item, questionIndex) => ({
        label: item.header,
        answer: row[item.index] || "",
        maxPoints: getExamQuestionMaxPoints(questionIndex)
      }));

      imported.push({
        id: studentId,
        rowNumber: index + 2,
        name,
        uniqueId,
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
    const baseScore = calculateExamBaseScore(student);
    const extraPoints = calculateExamExtraPoints(student);
    const finalScore = calculateExamFinalScore(student);
    const result = getExamResult(student);

    return `
      <button class="exam-student-card ${result}" onclick="openExamDetail('${student.id}')">
        <small>Examen mécanique</small>
        <h4>${examEscapeHTML(student.name)}</h4>
        <p>ID ${examEscapeHTML(student.uniqueId)}</p>

        <div class="exam-score-row">
          <span>${finalScore}/${EXAM_MAX_POINTS}</span>
          <b class="${result}">${getExamResultLabel(result)}</b>
        </div>

        <div class="exam-bonus-line">
          Base : ${baseScore}/${EXAM_MAX_POINTS} · Bonus : +${extraPoints}
        </div>
      </button>
    `;
  }).join("");
}

function openExamDetail(studentId) {
  const student = allExamStudents.find(item => item.id === studentId);
  if (!student || !examDetail) return;

  const correction = getExamCorrection(student.id);
  const baseScore = calculateExamBaseScore(student);
  const extraPoints = calculateExamExtraPoints(student);
  const finalScore = calculateExamFinalScore(student);
  const result = getExamResult(student);

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
        <strong>Score final</strong>
        <span>${finalScore}/${EXAM_MAX_POINTS}</span>
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

    <div class="exam-extra-card">
      <h4>Points bonus</h4>

      <div class="exam-extra-buttons">
        <button
          type="button"
          class="exam-extra-btn ${correction.extras.stage ? "active" : ""}"
          onclick="toggleExamExtra('${student.id}', 'stage')"
        >
          Point stage (+1)
        </button>

        <button
          type="button"
          class="exam-extra-btn ${correction.extras.custom ? "active" : ""}"
          onclick="toggleExamExtra('${student.id}', 'custom')"
        >
          Point custom (+1)
        </button>
      </div>

      <p class="exam-extra-note">
        Score base : ${baseScore}/${EXAM_MAX_POINTS} · Bonus activés : +${extraPoints}
      </p>
    </div>

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
          placeholder="Exemple : bon niveau général, revoir quelques points..."
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

function toggleExamExtra(studentId, type) {
  const student = allExamStudents.find(item => item.id === studentId);
  if (!student) return;

  const correction = getExamCorrection(studentId);
  correction.extras[type] = !correction.extras[type];
  saveExamCorrection(studentId, correction);

  renderExamStudents();
  openExamDetail(studentId);
}

function updateExamPoint(studentId, questionIndex, value) {
  const student = allExamStudents.find(item => item.id === studentId);
  if (!student) return;

  const correction = getExamCorrection(studentId);
  const question = student.questions[questionIndex];

  let number = Number(value);

  if (Number.isNaN(number)) {
    number = 0;
  }

  number = Math.max(0, Math.min(number, question.maxPoints));

  correction.points[questionIndex] = number;
  saveExamCorrection(studentId, correction);

  renderExamStudents();
  openExamDetail(studentId);
}

function updateExamComment(studentId, value) {
  const correction = getExamCorrection(studentId);
  correction.comment = value;
  saveExamCorrection(studentId, correction);
}

function closeExamDetail() {
  if (!examDetail) return;
  examDetail.classList.remove("show");
}

document.addEventListener("DOMContentLoaded", () => {
  if (examStatus && examGrid && examDetail) {
    loadExamStudents();
  }
});
