// server.js
import express from "express";
import cors from "cors";
import { GoogleSpreadsheet } from "google-spreadsheet";
import admin from "firebase-admin";
import fs from "fs";

// ===== CONFIG =====
const SERVICE_ACCOUNT_JSON_PATH = "./credentials/universit-4b11e-29f07d194df0.json"; // chemin relatif
const FIRESTORE_PROJECT_ID = "universit-4b11e";
const PORT = 3000;

// Google Sheets
const CUSTOMS_SHEET_ID = "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc";
const EXAM_SHEET_ID = "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY";

const SHEETS_CONFIG = [
  { name: "Dukes", gid: 1133112226, label: "Custom Facile" },
  { name: "Sentinel XS4", gid: 1138787690, label: "Custom Moyen" },
  { name: "Annis Rumina", gid: 49030161, label: "Custom Difficile" }
];

// ===== FIRESTORE INIT =====
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_JSON_PATH, "utf-8"))),
  projectId: FIRESTORE_PROJECT_ID,
});
const db = admin.firestore();

// ===== EXPRESS INIT =====
const app = express();
app.use(cors());
app.use(express.json());

// ===== FONCTION POUR CHARGER LES DONNÉES SHEET =====
async function loadSheet(sheetId, gid) {
  const doc = new GoogleSpreadsheet(sheetId);
  await doc.useServiceAccountAuth(JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_JSON_PATH, "utf-8")));
  await doc.loadInfo();
  const sheet = doc.sheetsById[gid];
  const rows = await sheet.getRows();
  return rows.map(row => row._rawData);
}

// ===== ENDPOINTS =====

// Customs
app.get("/load-customs", async (req, res) => {
  try {
    const allData = {};
    for (const sheetConf of SHEETS_CONFIG) {
      const rows = await loadSheet(CUSTOMS_SHEET_ID, sheetConf.gid);
      allData[sheetConf.name] = rows;

      // Push dans Firestore
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

// Examen
app.get("/load-exam", async (req, res) => {
  try {
    const rows = await loadSheet(EXAM_SHEET_ID, 282279229);
    const colRef = db.collection("Examen");
    for (const row of rows) {
      const id = row[0] || Math.random().toString(36).substring(2, 10);
      await colRef.doc(id).set({ data: row });
    }
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
