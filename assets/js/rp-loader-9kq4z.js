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
      if (char === "\r" && nextChar === "\n") i++;

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

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getField(answer, possibleNames) {
  for (const name of possibleNames) {
    const foundKey = Object.keys(answer).find(key => normalizeHeader(key) === normalizeHeader(name));
    if (foundKey) return answer[foundKey] || "";
  }

  return "";
}

function isLink(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function getValue(value) {
  const cleaned = String(value || "").trim();
  return cleaned || "Non renseigné";
}

function renderField(label, value) {
  const cleanValue = getValue(value);

  if (isLink(cleanValue)) {
    return `
      <a class="student-link-card" href="${escapeHtml(cleanValue)}" target="_blank" rel="noopener noreferrer">
        <span>${escapeHtml(label)}</span>
        <strong>Ouvrir le lien</strong>
      </a>
    `;
  }

  return `
    <div class="student-answer-field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(cleanValue)}</strong>
    </div>
  `;
}

function renderSection(title, fieldsHtml) {
  return `
    <section class="student-section">
      <div class="student-section-head">
        <h3>${escapeHtml(title)}</h3>
      </div>

      <div class="student-section-grid">
        ${fieldsHtml}
      </div>
    </section>
  `;
}

function renderAnswerCard(answer, index) {
  const horodateur = getField(answer, ["Horodateur"]);
  const nom = getField(answer, ["Prénom - Nom (RP)", "Prénom - Nom", "Nom"]);
  const idUnique = getField(answer, ["ID Unique", "ID"]);

  const couleurPrincipale = getField(answer, ["Couleur principale"]);
  const couleurSecondaire = getField(answer, ["Couleur secondaire"]);
  const couleurInterieur = getField(answer, ["Couleur intérieur", "Couleur intérieure"]);
  const nacre = getField(answer, ["Nacré", "Nacre"]);

  const score = getField(answer, ["Score"]);
  const email = getField(answer, ["Adresse e-mail", "Email", "Adresse mail"]);

  const photoFields = Object.entries(answer).filter(([key, value]) => {
    const normalizedKey = normalizeHeader(key);
    return normalizedKey.includes("photo") || normalizedKey.includes("final");
  });

  const ignoredHeaders = [
    "horodateur",
    "prenom - nom (rp)",
    "prenom - nom",
    "nom",
    "id unique",
    "id",
    "couleur principale",
    "couleur secondaire",
    "couleur interieur",
    "couleur interieure",
    "nacre",
    "nacre",
    "score",
    "adresse e-mail",
    "email",
    "adresse mail"
  ];

  const extraFields = Object.entries(answer).filter(([key, value]) => {
    const normalizedKey = normalizeHeader(key);

    if (!key || !String(key).trim()) return false;
    if (ignoredHeaders.includes(normalizedKey)) return false;
    if (normalizedKey.includes("photo")) return false;
    if (normalizedKey.includes("final")) return false;

    return String(value || "").trim() !== "";
  });

  const identityHtml = [
    renderField("Nom RP", nom),
    renderField("ID Unique", idUnique),
    renderField("Horodateur", horodateur),
    renderField("E-mail", email)
  ].join("");

  const colorsHtml = [
    renderField("Couleur principale", couleurPrincipale),
    renderField("Couleur secondaire", couleurSecondaire),
    renderField("Couleur intérieure", couleurInterieur),
    renderField("Nacré", nacre)
  ].join("");

  const photosHtml = photoFields.length
    ? photoFields.map(([key, value]) => renderField(key, value)).join("")
    : `<div class="student-empty">Aucune photo renseignée.</div>`;

  const extraHtml = extraFields.length
    ? extraFields.map(([key, value]) => renderField(key, value)).join("")
    : `<div class="student-empty">Aucune information supplémentaire.</div>`;

  return `
    <article class="student-answer-card">
      <div class="student-card-top">
        <div>
          <p class="student-kicker">Réponse ${index + 1}</p>
          <h2>${escapeHtml(nom || `Élève ${index + 1}`)}</h2>
        </div>

        <div class="student-tags">
          <span>${escapeHtml(idUnique || "ID inconnu")}</span>
          <span>${escapeHtml(score || "Score non renseigné")}</span>
        </div>
      </div>

      ${renderSection("Identité", identityHtml)}
      ${renderSection("Couleurs", colorsHtml)}
      ${renderSection("Photos envoyées", photosHtml)}
      ${renderSection("Autres réponses", extraHtml)}
    </article>
  `;
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
  const dataRows = rows.slice(1).filter(row => row.some(cell => String(cell || "").trim() !== ""));

  if (!dataRows.length) {
    sheetStatus.innerHTML = `
      <div class="inline-empty-box">
        Le fichier existe, mais aucune réponse élève n’est encore présente.
      </div>
    `;
    return;
  }

  const answers = dataRows.map(row => {
    const answer = {};

    headers.forEach((header, index) => {
      if (!header) return;
      answer[header] = row[index] || "";
    });

    return answer;
  });

  const cardsHtml = answers.map((answer, index) => renderAnswerCard(answer, index)).join("");

  sheetStatus.hidden = true;
  sheetStatus.style.display = "none";

  sheetContent.hidden = false;
  sheetContent.innerHTML = `
    <div class="student-answer-grid">
      ${cardsHtml}
    </div>
  `;
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
