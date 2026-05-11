const SPREADSHEET_ID = "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc";
const SHEET_GID = "1133112226";

const sheetStatus = document.getElementById("sheetStatus");
const sheetContent = document.getElementById("sheetContent");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildCsvUrl() {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      currentValue += '"';
      i++;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }

      currentRow.push(currentValue);

      if (currentRow.some(cell => String(cell).trim() !== "")) {
        rows.push(currentRow);
      }

      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  currentRow.push(currentValue);

  if (currentRow.some(cell => String(cell).trim() !== "")) {
    rows.push(currentRow);
  }

  return rows;
}

function renderAnswers(rows) {
  if (!rows.length) {
    sheetStatus.innerHTML = `
      <div class="inline-empty-box">
        Aucune réponse trouvée.
      </div>
    `;
    return;
  }

  const headers = rows[0].map(header => String(header || "").trim());
  const answers = rows.slice(1);

  if (!answers.length) {
    sheetStatus.innerHTML = `
      <div class="inline-empty-box">
        Le fichier existe, mais aucune réponse élève n’est encore présente.
      </div>
    `;
    return;
  }

  const cardsHtml = answers.map((row, index) => {
    const fieldsHtml = headers.map((header, cellIndex) => {
      if (!header) return "";

      const value = row[cellIndex] || "Non renseigné";

      return `
        <div class="student-answer-field">
          <span>${escapeHtml(header)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `;
    }).join("");

    return `
      <article class="student-answer-card">
        <div class="student-answer-card-head">
          <span>Réponse ${index + 1}</span>
        </div>

        <div class="student-answer-fields">
          ${fieldsHtml}
        </div>
      </article>
    `;
  }).join("");

  sheetStatus.hidden = true;
  sheetContent.hidden = false;
  sheetContent.innerHTML = cardsHtml;
}

async function loadSheetAnswers() {
  if (!window.currentProfUser) {
    window.location.href = "espace-prof.html";
    return;
  }

  try {
    const response = await fetch(buildCsvUrl());

    if (!response.ok) {
      throw new Error(`Erreur Google Sheets : ${response.status}`);
    }

    const csvText = await response.text();
    const rows = parseCsv(csvText);

    renderAnswers(rows);
  } catch (error) {
    console.error("Erreur chargement Google Sheets :", error);

    sheetStatus.innerHTML = `
      <div class="inline-error-box">
        <h4>Impossible de charger les réponses</h4>
        <p>
          Vérifie que le Google Sheet est bien accessible avec le lien,
          et que l’ID + GID sont corrects.
        </p>
      </div>
    `;
  }
}

loadSheetAnswers();
