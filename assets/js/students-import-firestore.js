import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// 🔑 Config Firebase – remplace par la tienne
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
