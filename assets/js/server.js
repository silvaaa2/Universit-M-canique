// server.js
import express from "express";
import cors from "cors";
import { GoogleSpreadsheet } from "google-spreadsheet";
import admin from "firebase-admin";
import fs from "fs";

// ===== CONFIG =====
const SERVICE_ACCOUNT_JSON_PATH = "./credentials/universit-4b11e.json"; // ton JSON téléchargé
const FIRESTORE_PROJECT_ID = "universit-4b11e";

// Google Sheets IDs + gid
const SHEETS_CONFIG = [
  { name: "Dukes", sheetId: "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc", gid: 1133112226 },
  { name: "Sentinel XS4", sheetId: "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc", gid: 1138787690 },
  { name: "Annis Rumina", sheetId: "1oGwdggjcA4X2Zxsj4TD_iKrablfK6_pK4hXjXiptCBc", gid: 49030161 },
  { name: "Examen", sheetId: "1Nqivjm5iqWTwyzWvKCH35vb8tGMzcLHFoSTHtnwp_RY", gid: 282279229 }
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

async function loadSheet(sheetId, gid) {
  const doc = new GoogleSpreadsheet(sheetId);
  await doc.useServiceAccountAuth(JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_JSON_PATH)));
  await doc.loadInfo();
  const sheet = doc.sheetsById[gid];
  const rows = await sheet.getRows();
  return rows.map(row => row._rawData); // simplifié
}

// Endpoint pour lancer l'import
app.get("/load-all", async (req, res) => {
  try {
    for (const conf of SHEETS_CONFIG) {
      const rows = await loadSheet(conf.sheetId, conf.gid);
      const colRef = db.collection(conf.name);

      for (const row of rows) {
        const id = row[0] || Math.random().toString(36).substring(2, 10);
        await colRef.doc(id).set({ data: row }, { merge: true });
      }
    }
    res.json({ success: true, message: "Import terminé" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
