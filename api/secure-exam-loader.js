const fs = require("fs");
const path = require("path");

const PUBLIC_DISCORD_PLACEHOLDER = "https://discord.com/api/webhooks/secure-server-endpoint";

function hardenExamLoader(source) {
  return source
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
    Authorization: \`Bearer \${await user.getIdToken()}\`
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
    .replace(/Erreur Google Sheets examens/g, "Erreur chargement examens sécurisés")
    .replace(
      /setError\("Vérifie que le Google Sheet est public avec lien, et que le GID est correct\."\);/g,
      `setError("Impossible de charger les réponses d'examen. Vérifie la connexion prof et le réglage Google Sheets.");`
    );
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
