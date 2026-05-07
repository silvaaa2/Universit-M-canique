// server.js
import express from "express";
import cors from "cors";
import { GoogleSpreadsheet } from "google-spreadsheet";
import fs from "fs";
import path from "path";

// ===== CONFIG =====
const SERVICE_ACCOUNT_JSON_PATH = path.resolve("./credentials/universit-4b11e-29f07d194df0.json"); // <-- ton fichier JSON service account
const PORT = 3000;

// Google Sheets
const SHEETS_CONFIG = [
  { name: "Dukes", sheetId: "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc", gid: "1133112226", label: "Custom Facile" },
  { name: "Sentinel XS4", sheetId: "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc", gid: "1138787690", label: "Custom Moyen" },
  { name: "Annis Rumina", sheetId: "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc", gid: "49030161", label: "Custom Difficile" },
  { name: "Examen", sheetId: "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY", gid: "282279229", label: "Examen Mécanique" }
];

// ===== INIT SERVEUR =====
const app = express();
app.use(cors());
app.use(express.json());

// ===== FONCTION POUR LIRE GOOGLE SHEETS =====
async function loadSheet(sheetId, gid) {
  const creds = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_JSON_PATH, "utf-8"));
  const doc = new GoogleSpreadsheet(sheetId);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();

  const sheet = doc.sheetsById[gid];
  if (!sheet) throw new Error(`Sheet GID ${gid} introuvable`);

  const rows = await sheet.getRows();

  return rows.map(r => r._rawData); // simple array de données
}

// ===== ENDPOINT POUR LES CUSTOMS & EXAM =====
app.get("/load-answers", async (req, res) => {
  try {
    const allData = {};

    for (const sheetConf of SHEETS_CONFIG) {
      const rows = await loadSheet(sheetConf.sheetId, sheetConf.gid);

      // Convertit chaque ligne en objet pour ton espace prof
      const parsedRows = rows.map((row, index) => ({
        id: `${sheetConf.name}-${index+2}`,
        sheet: sheetConf.name,
        customLabel: sheetConf.label,
        name: row[0] || "Sans nom",
        uniqueId: row[1] || "Aucun ID",
        vehicle: row[2] || "",
        answers: row.slice(3), // reste des colonnes pour questions / réponses
      }));

      allData[sheetConf.name] = parsedRows;
    }

    res.json({ success: true, data: allData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
