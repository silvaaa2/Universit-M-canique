import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// 🔑 Config Firebase – remplace par la tienne
const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 🔹 Helper pour rendre les liens cliquables
function formatAnswer(answer) {
  if (!answer) return "Aucune réponse.";
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return answer.replace(urlRegex, match => `<a href="${match}" target="_blank">${match}</a>`);
}

// 🔹 Charger les réponses customs
export async function loadStudentsFirestore() {
  const studentsGrid = document.getElementById("studentsGrid");
  const studentsStatus = document.getElementById("studentsStatus");

  if (!studentsGrid || !studentsStatus) return;
  studentsStatus.textContent = "Chargement des réponses...";

  try {
    const snapshot = await getDocs(collection(db, "customAnswers"));
    const allStudents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (!allStudents.length) {
      studentsGrid.innerHTML = "<p>Aucune réponse trouvée pour le moment.</p>";
      studentsStatus.textContent = "0 réponse(s).";
      return;
    }

    studentsStatus.textContent = `${allStudents.length} réponse(s) chargée(s).`;

    studentsGrid.innerHTML = allStudents.map(student => {
      const answersHtml = Object.entries(student.answers)
        .map(([q, ans]) => `<p><strong>${q}:</strong> ${formatAnswer(ans)}</p>`)
        .join("");

      return `
        <button class="exam-student-card" onclick="openStudentDetail('${student.id}')">
          <h4>${student.studentName}</h4>
          <div class="exam-answer-box">${answersHtml}</div>
        </button>
      `;
    }).join("");

  } catch (err) {
    console.error(err);
    studentsStatus.textContent = "Erreur lors du chargement des réponses Firestore.";
  }
}
