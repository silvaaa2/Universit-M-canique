// server.js
import express from "express";
import cors from "cors";
import { GoogleSpreadsheet } from "google-spreadsheet";
import admin from "firebase-admin";
import fs from "fs";

// ===== CONFIG =====
const SERVICE_ACCOUNT_JSON_PATH = "./credentials/serviceAccount.json"; // <--- ton JSON ici
const FIRESTORE_PROJECT_ID = "universit-4b11e"; // <--- ton projet Firebase
const PORT = 3000;

// Google Sheets
const SHEETS_CONFIG = [
  { name: "Dukes", gid: "1133112226", label: "Custom Facile" },
  { name: "Sentinel XS4", gid: "1138787690", label: "Custom Moyen" },
  { name: "Annis Rumina", gid: "49030161", label: "Custom Difficile" },
  { name: "Examen", gid: "282279229", label: "Examen Mécanique" }
];

// Firestore init
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_JSON_PATH, "utf-8"))),
  projectId: FIRESTORE_PROJECT_ID,
});
const db = admin.firestore();

// Express init
const app = express();
app.use(cors());
app.use(express.json());

// ===== FONCTION POUR CHARGER LES DONNÉES SHEET =====
async function loadSheet(sheetId, gid) {
  const doc = new GoogleSpreadsheet(sheetId);
  await doc.useServiceAccountAuth(JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_JSON_PATH)));
  await doc.loadInfo();
  const sheet = doc.sheetsById[gid];
  const rows = await sheet.getRows();
  return rows.map(row => row._rawData); // simplifié
}

// ===== ENDPOINTS =====
app.get("/load-customs", async (req, res) => {
  try {
    const allData = {};
    for (const sheetConf of SHEETS_CONFIG) {
      const rows = await loadSheet("1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc", sheetConf.gid);
      allData[sheetConf.name] = rows;
      // Optionnel : push dans Firestore
      const colRef = db.collection(sheetConf.name);
      for (const row of rows) {
        const id = row[0] || Math.random().toString(36).substring(2, 10);
        await colRef.doc(id).set({ data: row });
      }
    }
    res.json({ success: true, data: allData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== LANCEMENT SERVEUR =====
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
