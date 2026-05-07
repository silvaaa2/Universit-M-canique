import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let customAnswersCache = {};
let currentUser = null;

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPanelHost() {
  return document.getElementById("customAnswersHost");
}

function showCustomAnswerError(message) {
  const host = getPanelHost();
  if (!host) return;

  host.innerHTML = `
    <div class="custom-answer-panel show">
      <div class="answer-head">
        <div>
          <span>Erreur</span>
          <h2>Impossible de charger</h2>
          <p>${escapeHTML(message)}</p>
        </div>

        <button type="button" class="answer-close" onclick="closeCustomAnswers()">×</button>
      </div>
    </div>
  `;
}

function renderAnswerPanel(customId, data) {
  const host = getPanelHost();
  if (!host) return;

  const sections = Array.isArray(data.sections) ? data.sections : [];

  host.innerHTML = `
    <div class="custom-answer-panel show" id="${escapeHTML(customId)}Answer">
      <div class="answer-head">
        <div>
          <span>${escapeHTML(data.label || "Custom")}</span>
          <h2>${escapeHTML(data.title || "Réponses")}</h2>
          <p>${escapeHTML(data.description || "Réponses et configuration attendue.")}</p>
        </div>

        <button type="button" class="answer-close" onclick="closeCustomAnswers()">×</button>
      </div>

      <div class="answer-grid">
        ${
          sections.map(section => `
            <div class="answer-card ${section.wide ? "wide" : ""}">
              <span>${escapeHTML(section.title || "Section")}</span>

              ${
                Array.isArray(section.items)
                  ? section.items.map(item => `
                    <div class="answer-line">
                      <strong>${escapeHTML(item.label)}</strong>
                      <p>${escapeHTML(item.value)}</p>
                    </div>
                  `).join("")
                  : ""
              }

              ${
                Array.isArray(section.columns)
                  ? `
                    <div class="answer-columns">
                      ${
                        section.columns.map(column => `
                          <div>
                            <h4>${escapeHTML(column.title)}</h4>
                            ${
                              Array.isArray(column.items)
                                ? column.items.map(value => `<p>${escapeHTML(value)}</p>`).join("")
                                : ""
                            }
                          </div>
                        `).join("")
                      }
                    </div>
                  `
                  : ""
              }
            </div>
          `).join("")
        }
      </div>
    </div>
  `;

  setTimeout(() => {
    const panel = host.querySelector(".custom-answer-panel.show");
    if (panel) {
      panel.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, 80);
}

async function loadCustomAnswer(customId) {
  if (customAnswersCache[customId]) {
    return customAnswersCache[customId];
  }

  const snapshot = await getDoc(doc(db, "customAnswerKeys", customId));

  if (!snapshot.exists()) {
    throw new Error(`Aucune réponse trouvée pour ${customId}.`);
  }

  const data = snapshot.data();
  customAnswersCache[customId] = data;

  return data;
}

async function openCustomAnswer(customId) {
  if (!currentUser) {
    showCustomAnswerError("Vous devez être connecté en tant que professeur.");
    return;
  }

  closeCustomAnswers();

  const host = getPanelHost();

  if (host) {
    host.innerHTML = `
      <div class="custom-answer-panel show">
        <div class="answer-head">
          <div>
            <span>Chargement</span>
            <h2>Réponses</h2>
            <p>Chargement sécurisé des réponses depuis Firestore...</p>
          </div>
        </div>
      </div>
    `;
  }

  try {
    const data = await loadCustomAnswer(customId);
    renderAnswerPanel(customId, data);
  } catch (error) {
    console.error(error);
    showCustomAnswerError("Les réponses n’ont pas pu être chargées. Vérifie Firestore et les règles.");
  }
}

function closeCustomAnswers() {
  const host = getPanelHost();
  if (host) {
    host.innerHTML = "";
  }

  document.querySelectorAll(".custom-answer-panel").forEach(panel => {
    panel.classList.remove("show");
  });
}

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;

  if (!currentUser) {
    closeCustomAnswers();
    customAnswersCache = {};
  }
});

window.openCustomAnswer = openCustomAnswer;
window.closeCustomAnswers = closeCustomAnswers;
