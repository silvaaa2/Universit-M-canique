const fs = require("fs");
const path = require("path");

function hardenRpLoader(source) {
  return source
    .replace(
      /const SHEETS = \[[\s\S]*?\];\s*\n\s*\nconst STATUS_COLLECTION/,
      `const SHEETS = [
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
];

const STATUS_COLLECTION`
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
    Authorization: \`Bearer \${await user.getIdToken(true)}\`
  };
}`
    )
    .replace(
      /fetch\(buildCsvUrl\(sheet\)\)/g,
      `fetch(buildCsvUrl(sheet), {
    cache: "no-store",
    headers: await buildSecureSheetHeaders()
  })`
    )
    .replace(/Erreur Google Sheets/g, "Erreur lecture sécurisée")
    .replace(
      /setError\("Vérifie que le Google Sheet est bien public avec lien, et que le GID est correct\."\);/g,
      `setError("Impossible de charger les réponses customs. Vérifie la connexion prof et les réglages Google Sheets.");`
    );
}

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method not allowed");
    return;
  }

  const loaderPath = path.join(process.cwd(), "assets", "js", "rp-loader-9kq4z.js");
  const source = fs.readFileSync(loaderPath, "utf8");
  const sanitizedSource = hardenRpLoader(source);

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(sanitizedSource);
};