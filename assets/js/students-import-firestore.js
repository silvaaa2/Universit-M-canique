import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "...",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const studentsGrid = document.getElementById("studentsGrid");
const studentsStatus = document.getElementById("studentsStatus");

const customCol = collection(db, "customAnswers");

onSnapshot(customCol, snapshot => {
  if (!studentsGrid || !studentsStatus) return;

  if (snapshot.empty) {
    studentsStatus.textContent = "Aucune réponse pour l'instant.";
    studentsGrid.innerHTML = "";
    return;
  }

  studentsGrid.innerHTML = "";
  studentsStatus.textContent = `${snapshot.size} réponse(s) reçue(s).`;

  snapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    const card = document.createElement("div");
    card.className = "student-card";
    card.innerHTML = `
      <h4>${data.studentName || "Nom inconnu"}</h4>
      <p>Custom: ${data.customLabel}</p>
      <p>Réponses: ${JSON.stringify(data.answers)}</p>
    `;
    studentsGrid.appendChild(card);
  });
});
