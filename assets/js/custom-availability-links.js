const firebaseConfig = {
  apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
  authDomain: "universit-4b11e.firebaseapp.com",
  projectId: "universit-4b11e",
  storageBucket: "universit-4b11e.firebasestorage.app",
  messagingSenderId: "11363330953",
  appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
  measurementId: "G-Z5B51BQCNL"
};

const CUSTOM_IDS = ["sentinelClassic", "argento2f", "cypher"];
const EXAM_ID = "examV2";
const ACCESS_IDS = [...CUSTOM_IDS, EXAM_ID];
const FIRESTORE_TIMEOUT_MS = 6500;

const elements = [...document.querySelectorAll("[data-custom-link]")];
const availabilityState = new Map(ACCESS_IDS.map(customId => [customId, null]));
let allClosedNoticeShown = false;
let allClosedNoticeTimer = null;

if (elements.length) {
  startLinksAvailability();
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function getLinkedElements(customId) {
  return elements.filter(element => element.dataset.customLink === customId);
}

function readLocalState(customId) {
  try {
    const raw = window.localStorage.getItem(`customAvailability:${customId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return typeof parsed?.enabled === "boolean" ? parsed.enabled : null;
  } catch (error) {
    console.warn("Lecture locale lien custom impossible :", error);
    return null;
  }
}

function setClosedState(customId, closed) {
  getLinkedElements(customId).forEach(element => {
    element.classList.toggle("custom-link-closed", closed);
    element.setAttribute("aria-disabled", closed ? "true" : "false");
    element.dataset.customAvailabilityState = closed ? "closed" : "open";

    if (closed) {
      element.setAttribute("title", customId === EXAM_ID ? "Examen verrouillé pour les élèves" : "Fiche fermée pour les élèves");
    } else {
      element.removeAttribute("title");
    }
    if (customId === EXAM_ID) {
      const label = element.querySelector("[data-exam-access-label]");
      if (label) label.textContent = closed ? "Examen verrouillé" : "Voir les examens disponibles";
      const caption = document.querySelector("[data-exam-access-caption]");
      if (caption) caption.textContent = closed
        ? "L’examen est temporairement verrouillé par les professeurs."
        : "Les examens publiés s’ouvrent ici après validation des quatre modules.";
    }
  });
}

function setAvailabilityState(customId, enabled) {
  availabilityState.set(customId, enabled);
  setClosedState(customId, !enabled);
  maybeShowAllClosedNotice();
}

function maybeShowAllClosedNotice() {
  const allStatesKnown = CUSTOM_IDS.every(customId => availabilityState.get(customId) !== null);
  const allClosed = allStatesKnown && CUSTOM_IDS.every(customId => availabilityState.get(customId) === false);

  if (!allClosed || allClosedNoticeShown) return;

  allClosedNoticeShown = true;
  showAllClosedNotice();
}

function showAllClosedNotice() {
  const notice = document.createElement("div");
  notice.className = "custom-closed-toast";
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  notice.innerHTML = `
    <strong>Customs fermées</strong>
    <span>Les fiches customs sont actuellement fermées. Demandez à un professeur de les ouvrir avant de commencer.</span>
  `;

  document.body.appendChild(notice);

  window.requestAnimationFrame(() => {
    notice.classList.add("is-visible");
  });

  window.clearTimeout(allClosedNoticeTimer);
  allClosedNoticeTimer = window.setTimeout(() => {
    notice.classList.remove("is-visible");
    notice.addEventListener("transitionend", () => notice.remove(), { once: true });
  }, 10000);
}

function applyInitialLocalStates() {
  ACCESS_IDS.forEach(customId => {
    const enabled = readLocalState(customId);
    if (enabled !== null) {
      setAvailabilityState(customId, enabled);
    }
  });
}

function bindClickGuard() {
  document.addEventListener(
    "click",
    event => {
      const blockedLink = event.target.closest("[data-custom-link].custom-link-closed");
      if (!blockedLink) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      blockedLink.classList.remove("custom-link-blocked-pulse");
      void blockedLink.offsetWidth;
      blockedLink.classList.add("custom-link-blocked-pulse");
    },
    true
  );
}

async function startLinksAvailability() {
  bindClickGuard();
  applyInitialLocalStates();

  try {
    const [appModule, firestoreModule] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
    ]);

    const { initializeApp, getApps, getApp } = appModule;
    const { getFirestore, doc, getDoc, onSnapshot } = firestoreModule;
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(app);

    ACCESS_IDS.forEach(customId => {
      const availabilityRef = doc(db, "customAvailability", customId);

      withTimeout(
        getDoc(availabilityRef),
        FIRESTORE_TIMEOUT_MS,
        "Lecture Firestore trop longue."
      )
        .then(snapshot => {
          const enabled = snapshot.exists() ? snapshot.data().enabled !== false : true;
          setAvailabilityState(customId, enabled);
        })
        .catch(error => {
          console.warn("Lecture lien custom indisponible :", error);
        });

      onSnapshot(
        availabilityRef,
        snapshot => {
          const enabled = snapshot.exists() ? snapshot.data().enabled !== false : true;
          setAvailabilityState(customId, enabled);
        },
        error => {
          console.warn("Ecoute lien custom indisponible :", error);
        }
      );
    });
  } catch (error) {
    console.warn("Chargement Firebase liens custom impossible :", error);
  }
}
