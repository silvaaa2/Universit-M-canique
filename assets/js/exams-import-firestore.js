import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// 🔑 Config Firebase – même que pour customs
const firebaseConfig = {
  apiKey: "TA_API_KEY",
  authDomain: "TON_PROJET.firebaseapp.com",
  projectId: "TON_PROJET",
  storageBucket: "TON_PROJET.appspot.com",
  messagingSenderId: "123456789",
  appId: "APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 🔹 Helper liens cliquables
function formatAnswer(answer) {
  if (!answer) return "Aucune réponse.";
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return answer.replace(urlRegex, match => `<a href="${match}" target="_blank">${match}</a>`);
}

// 🔹 Charger les réponses examens
export async function loadExamFirestore() {
  const examGrid = document.getElementById("examGrid");
  const examStatus = document.getElementById("examStatus");

  if (!examGrid || !examStatus) return;
  examStatus.textContent = "Chargement des réponses d’examen...";

  try {
    const snapshot = await getDocs(collection(db, "examAnswers"));
    const allExams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (!allExams.length) {
      examGrid.innerHTML = "<p>Aucune réponse d’examen pour le moment.</p>";
      examStatus.textContent = "0 réponse(s).";
      return;
    }

    examStatus.textContent = `${allExams.length} réponse(s) chargée(s).`;

    examGrid.innerHTML = allExams.map(student => {
      const questionsHtml = Object.entries(student.questions)
        .map(([q, ans]) => `<p><strong>${q}:</strong> ${formatAnswer(ans)}</p>`)
        .join("");

      return `
        <button class="exam-student-card" onclick="openExamDetail('${student.id}')">
          <h4>${student.studentName}</h4>
          <div class="exam-answer-box">${questionsHtml}</div>
        </button>
      `;
    }).join("");

  } catch (err) {
    console.error(err);
    examStatus.textContent = "Erreur lors du chargement des réponses Firestore.";
  }
}
