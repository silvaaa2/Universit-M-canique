const fs = require("fs");
const path = require("path");

const PUBLIC_DISCORD_PLACEHOLDER = "https://discord.com/api/webhooks/secure-server-endpoint";

function hardenExamLoader(source) {
  let hardened = source
    .replace(
      /const SPREADSHEET_ID = "[^"]+";\s*\n\s*\n/,
      ""
    )
    .replace(
      /const SHEETS = \[\s*\{\s*id: "exam-form-1",\s*label: "Réponses formulaire",\s*gid: "[^"]+"\s*\}\s*\];/s,
      `const SHEETS = [
  {
    id: "exam-form-1",
    label: "Réponses formulaire"
  }
];`
    )
    .replace(
      /const EXAM_RESULTS_WEBHOOK_URL = "https:\/\/discord\.com\/api\/webhooks\/[^"]+";/,
      `const EXAM_RESULTS_WEBHOOK_URL = "${PUBLIC_DISCORD_PLACEHOLDER}";`
    )
    .replace(
      /function buildCsvUrl\(gid\) \{\s*return `https:\/\/docs\.google\.com\/spreadsheets\/d\/\$\{SPREADSHEET_ID\}\/export\?format=csv&gid=\$\{gid\}`;\s*\}/,
      `function buildCsvUrl(sheet) {
  const params = new URLSearchParams({
    source: "examResponses",
    sheet: sheet.id
  });

  return \`/api/secure-sheet?\${params.toString()}\`;
}

async function buildSecureSheetHeaders() {
  const user = window.currentProfUser;
  if (!user?.getIdToken) {
    throw new Error("Connexion professeur requise.");
  }

  return {
    Authorization: \`Bearer \${await user.getIdToken(true)}\`
  };
}`
    )
    .replace(
      /const response = await fetch\(buildCsvUrl\(sheet\.gid\)\);/g,
      `const response = await fetch(buildCsvUrl(sheet), {
        cache: "no-store",
        headers: await buildSecureSheetHeaders()
      });`
    )
    .replace(
      /if \(!response\.ok\) \{\s*throw new Error\(`Erreur (?:Google Sheets|Google Sheets examens|chargement examens sécurisés|lecture sécurisée) : \$\{response\.status\}`\);\s*\}/g,
      `if (!response.ok) {
        let details = "";
        try {
          const payload = await response.clone().json();
          details = payload?.error ? \` \${payload.error}\` : "";
        } catch (_) {}
        throw new Error(\`Erreur lecture sécurisée : \${response.status}.\${details}\`);
      }`
    )
    .replace(/Erreur Google Sheets examens/g, "Erreur chargement examens sécurisés")
    .replace(
      /setError\("Vérifie que le Google Sheet est public avec lien, et que le GID est correct\."\);/g,
      `setError("Impossible de charger les réponses d'examen. Vérifie la connexion prof et le réglage Google Sheets.");`
    )
    .replace(
      /setError\("Impossible de charger les réponses d'examen\. Vérifie la connexion prof et le réglage Google Sheets\."\);/g,
      `setError(\`Impossible de charger les réponses d'examen. Détail : \${error?.message || "erreur inconnue"}\`);`
    );

  hardened = hardened
    .replace(
      /\bconst EXAM_DISPLAY_MAX_POINTS = 50;/,
      "const DEFAULT_EXAM_DISPLAY_MAX_POINTS = 50;"
    )
    .replace(
      /function getQuestionPointsMap\(\) \{\s*const firebasePoints = window\.__examResponsesSettings\?\.questionPoints \|\| \{\};\s*return \{\s*\.\.\.QUESTION_POINTS,\s*\.\.\.firebasePoints\s*\};\s*\}/,
      `function getQuestionPointsMap() {
  const firebasePoints = window.__examResponsesSettings?.questionPoints || {};
  return Object.keys(firebasePoints).length ? firebasePoints : QUESTION_POINTS;
}`
    );

  if (!hardened.includes("function getExamMaxPoints()")) {
    hardened = hardened.replace(
      /function getSafeQuestionPointValue\(value\) \{\s*const number = Number\(value\);\s*return Number\.isFinite\(number\) \? Math\.max\(0, number\) : null;\s*\}/,
      `function getSafeQuestionPointValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

function getExamMaxPoints() {
  const configuredMax = Number(window.__examResponsesSettings?.maxPoints);

  if (Number.isFinite(configuredMax) && configuredMax > 0) {
    return configuredMax;
  }

  const total = Object.values(getQuestionPointsMap()).reduce((sum, value) => {
    const points = getSafeQuestionPointValue(value);
    return points === null ? sum : sum + points;
  }, 0);

  return total > 0 ? total : DEFAULT_EXAM_DISPLAY_MAX_POINTS;
}

function getExamPassPoints() {
  const configuredPass = Number(window.__examResponsesSettings?.passPoints);

  if (Number.isFinite(configuredPass) && configuredPass > 0) {
    return configuredPass;
  }

  return Math.min(EXAM_PASS_POINTS, getExamMaxPoints());
}`
    );
  }

  return hardened
    .replace(/\bEXAM_DISPLAY_MAX_POINTS\b/g, "getExamMaxPoints()")
    .replace(/\btotalScore >= EXAM_PASS_POINTS\b/g, "totalScore >= getExamPassPoints()");
}

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method not allowed");
    return;
  }

  const loaderPath = path.join(process.cwd(), "assets", "js", "exam-loader-x8p2.js");
  const source = fs.readFileSync(loaderPath, "utf8");
  const sanitizedSource = hardenExamLoader(source);

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(sanitizedSource);
};