const fs = require("fs");
const path = require("path");

function hardenProfAuthV2(source) {
  return source
    .replace(
      /const DEFAULT_EXAM_SHEET = \{[\s\S]*?\};\s*\nconst CURRENT_CUSTOM_SHEETS = \[[\s\S]*?\];/,
      `const DEFAULT_EXAM_SHEET = {
  id: "exam-form-1",
  label: "Réponses formulaire",
  source: "examResponses"
};
const CURRENT_CUSTOM_SHEETS = [
  {
    id: "sentinelClassic",
    label: "Sentinel Classic",
    source: "customResponses"
  },
  {
    id: "argento2f",
    label: "Argento 2F",
    source: "customResponses"
  },
  {
    id: "cypher",
    label: "Cypher",
    source: "customResponses"
  }
];`
    )
    .replace(
      /function buildCsvUrl\(sheet\) \{\s*return `https:\/\/docs\.google\.com\/spreadsheets\/d\/\$\{sheet\.spreadsheetId\}\/export\?format=csv&gid=\$\{sheet\.gid\}`;\s*\}/,
      `function buildCsvUrl(sheet) {
  const params = new URLSearchParams({
    source: sheet.source || "customResponses",
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
      /fetch\(buildCsvUrl\(sheet\), \{ cache: "no-store" \}\)/g,
      `fetch(buildCsvUrl(sheet), {
      cache: "no-store",
      headers: await buildSecureSheetHeaders()
    })`
    )
    .replace(/Erreur Google Sheets/g, "Erreur lecture sécurisée")
    .replace(
      /spreadsheetId: extractSpreadsheetId\(data\.spreadsheetUrl\) \|\| extractSpreadsheetId\(data\.spreadsheetId\) \|\| DEFAULT_EXAM_SHEET\.spreadsheetId,\s*\n\s*gid: String\(data\.gid \|\| DEFAULT_EXAM_SHEET\.gid\),\s*\n\s*label: String\(data\.label \|\| DEFAULT_EXAM_SHEET\.label\)/,
      `label: String(data.label || DEFAULT_EXAM_SHEET.label)`
    );
}

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method not allowed");
    return;
  }

  const loaderPath = path.join(process.cwd(), "assets", "js", "prof-auth-v2.js");
  const source = fs.readFileSync(loaderPath, "utf8");
  const sanitizedSource = hardenProfAuthV2(source);

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(sanitizedSource);
};
