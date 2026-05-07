// assets/js/firestore-listeners.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// CONFIG FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.appspot.com",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- CUSTOMS ---
const customCollections = ["dukes", "sentinel", "rumina"];

customCollections.forEach(name => {
  const colRef = collection(db, name);
  const grid = document.getElementById(`${name}Answer`);
  if (!grid) return;

  onSnapshot(colRef, snapshot => {
    grid.innerHTML = "";
    if (snapshot.empty) {
      grid.innerHTML = `<div class="student-info-card wide"><h4>Aucune réponse</h4><p>Aucune donnée trouvée pour cette custom.</p></div>`;
      return;
    }

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const card = document.createElement("div");
      card.className = "student-card";
      card.innerHTML = `
        <h4>${data.studentName || "Nom inconnu"}</h4>
        <p>ID: ${data.uniqueId || "Aucun"}</p>
        <p>Réponses: ${JSON.stringify(data.answers)}</p>
        <p>Status: ${data.status || "pending"}</p>
      `;
      grid.appendChild(card);
    });
  });
});

// --- EXAMENS ---
const examCol = collection(db, "examCorrections");
const examGrid = document.getElementById("examGrid");
const examStatus = document.getElementById("examStatus");

if (examGrid && examStatus) {
  onSnapshot(examCol, snapshot => {
    examGrid.innerHTML = "";
    if (snapshot.empty) {
      examStatus.textContent = "Aucune réponse d'examen pour l'instant.";
      return;
    }
    examStatus.textContent = `${snapshot.size} réponse(s) d’examen chargée(s).`;

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const card = document.createElement("div");
      card.className = "exam-student-card";
      card.innerHTML = `
        <h4>${data.studentName || "Nom inconnu"}</h4>
        <p>ID: ${data.uniqueId || "Aucun"}</p>
        <p>Score: ${data.score || 0}/${data.maxScore || 50}</p>
        <p>Réponses: ${JSON.stringify(data.answers)}</p>
      `;
      examGrid.appendChild(card);
    });
  });
}
