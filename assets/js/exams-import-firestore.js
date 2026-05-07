import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "...",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const examGrid = document.getElementById("examGrid");
const examStatus = document.getElementById("examStatus");

const examCol = collection(db, "examCorrections");

onSnapshot(examCol, snapshot => {
  if (!examGrid || !examStatus) return;

  if (snapshot.empty) {
    examStatus.textContent = "Aucune réponse d'examen pour l'instant.";
    examGrid.innerHTML = "";
    return;
  }

  examGrid.innerHTML = "";
  examStatus.textContent = `${snapshot.size} réponse(s) d’examen reçue(s).`;

  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    const card = document.createElement("div");
    card.className = "exam-card";
    card.innerHTML = `
      <h4>${data.studentName || "Nom inconnu"}</h4>
      <p>Score: ${data.score || 0}/${data.maxScore || 50}</p>
      <p>Réponses: ${JSON.stringify(data.answers)}</p>
    `;
    examGrid.appendChild(card);
  });
});
