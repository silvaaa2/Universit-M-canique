document.addEventListener("DOMContentLoaded", () => {
  const openCorrectionsBtn = document.getElementById("openCorrectionsBtn");
  const closeCorrectionsBtn = document.getElementById("closeCorrectionsBtn");
  const closeCorrectionsDetailBtn = document.getElementById("closeCorrectionsDetailBtn");
  const correctionsInterface = document.getElementById("correctionsInterface");

  const correctionsChooserHead = document.getElementById("correctionsChooserHead");
  const correctionCardsList = document.getElementById("correctionCardsList");
  const correctionCards = document.querySelectorAll(".correction-card");

  const correctionDetailView = document.getElementById("correctionDetailView");
  const backToCorrectionCards = document.getElementById("backToCorrectionCards");

  const correctionPath = document.getElementById("correctionPath");
  const correctionHeroKicker = document.getElementById("correctionHeroKicker");
  const correctionTitle = document.getElementById("correctionTitle");
  const correctionDescription = document.getElementById("correctionDescription");
  const correctionTags = document.getElementById("correctionTags");
  const correctionSections = document.getElementById("correctionSections");

  const DOC_ID_MAP = {
    facile: "dukes",
    moyen: "sentinel",
    difficile: "rumina"
  };

  const firebaseConfig = {
    apiKey: "AIzaSyDsEuRjht4ujClPreuT4btpSJKxXSP8I6c",
    authDomain: "universit-4b11e.firebaseapp.com",
    projectId: "universit-4b11e",
    storageBucket: "universit-4b11e.firebasestorage.app",
    messagingSenderId: "11363330953",
    appId: "1:11363330953:web:b08d1b2de1f93a8e11cf58",
    measurementId: "G-Z5B51BQCNL"
  };

  let firebaseServices = null;

  if (!openCorrectionsBtn || !correctionsInterface) {
    console.error("Éléments de l'interface corrigés introuvables.");
    return;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeCollection(rawValue) {
    if (!rawValue) return [];
    if (Array.isArray(rawValue)) return rawValue;
    if (typeof rawValue === "object") return Object.values(rawValue);
    return [];
  }

  async function getFirebaseServices() {
    if (firebaseServices) return firebaseServices;

    const [
      firebaseAppModule,
      firebaseAuthModule,
      firebaseFirestoreModule
    ] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
    ]);

    const {
      initializeApp,
      getApps,
      getApp
    } = firebaseAppModule;

    const { getAuth } = firebaseAuthModule;

    const {
      getFirestore,
      doc,
      getDoc
    } = firebaseFirestoreModule;

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    firebaseServices = { app, auth, db, doc, getDoc };
    return firebaseServices;
  }

  function openCorrectionsInterface() {
    correctionsInterface.hidden = false;
    document.body.classList.add("modal-open");

    showCorrectionsList();

    requestAnimationFrame(() => {
      correctionsInterface.classList.add("active");
    });
  }

  function closeCorrectionsInterface() {
    correctionsInterface.classList.remove("active");
    document.body.classList.remove("modal-open");

    setTimeout(() => {
      correctionsInterface.hidden = true;
      showCorrectionsList();
    }, 280);
  }

  function showCorrectionsList() {
    correctionsChooserHead.hidden = false;
    correctionCardsList.hidden = false;

    correctionDetailView.hidden = true;
    correctionDetailView.classList.remove("active");

    correctionSections.innerHTML = "";
    correctionTags.innerHTML = "";
  }

  function showCorrectionDetailView() {
    correctionsChooserHead.hidden = true;
    correctionCardsList.hidden = true;

    correctionDetailView.hidden = false;

    requestAnimationFrame(() => {
      correctionDetailView.classList.add("active");
    });
  }

  function renderLoading(customLabel, docId) {
    showCorrectionDetailView();

    correctionPath.textContent = `Firestore / customAnswerKeys / ${docId}`;
    correctionHeroKicker.textContent = "Chargement";
    correctionTitle.textContent = customLabel;
    correctionDescription.textContent = "Récupération de la fiche de correction...";

    correctionTags.innerHTML = `
      <span class="detail-tag">Chargement</span>
    `;

    correctionSections.innerHTML = `
      <div class="detail-empty">
        <div class="correction-loading-box">
          <div class="correction-loader"></div>
          <span>Chargement de la correction...</span>
        </div>
      </div>
    `;
  }

  function renderError(message) {
    showCorrectionDetailView();

    correctionHeroKicker.textContent = "Erreur";
    correctionTitle.textContent = "Impossible de charger";
    correctionDescription.textContent = "La fiche n’a pas pu être récupérée.";

    correctionTags.innerHTML = `
      <span class="detail-tag">Erreur</span>
    `;

    correctionSections.innerHTML = `
      <div class="detail-empty">
        ${escapeHtml(message)}
      </div>
    `;
  }

  function renderCorrection(data, docId) {
    const title = data.label || data.title || docId;
    const description = data.description || "Correction du custom sélectionné.";
    const sections = normalizeCollection(data.sections);

    correctionPath.textContent = `Firestore / customAnswerKeys / ${docId}`;
    correctionHeroKicker.textContent = "Corrigé";
    correctionTitle.textContent = title;
    correctionDescription.textContent = description;

    correctionTags.innerHTML = `
      <span class="detail-tag">${escapeHtml(title)}</span>
      <span class="detail-tag">ID : ${escapeHtml(docId)}</span>
      <span class="detail-tag">${sections.length} section(s)</span>
    `;

    if (!sections.length) {
      correctionSections.innerHTML = `
        <div class="detail-empty">
          Aucune section trouvée dans ce document.
        </div>
      `;
      return;
    }

    const sectionsHtml = sections.map((section, index) => {
      const sectionTitle = section.title || section.label || `Section ${index + 1}`;
      const items = normalizeCollection(section.items);

      const itemsHtml = items.length
        ? items.map((item) => {
            const itemLabel = item.label || "Élément";
            const itemValue = item.value ?? item.valeur ?? "Non renseigné";

            return `
              <div class="detail-item">
                <div class="detail-item-label">${escapeHtml(itemLabel)}</div>
                <div class="detail-item-value">${escapeHtml(itemValue)}</div>
              </div>
            `;
          }).join("")
        : `
          <div class="detail-empty">Aucun élément dans cette section.</div>
        `;

      return `
        <article class="detail-section">
          <div class="detail-section-head">
            <h3 class="detail-section-title">${escapeHtml(sectionTitle)}</h3>
            <span class="detail-section-count">${items.length} élément(s)</span>
          </div>

          <div class="detail-items">
            ${itemsHtml}
          </div>
        </article>
      `;
    }).join("");

    correctionSections.innerHTML = sectionsHtml;
  }

  async function loadCorrection(customKey, customLabel) {
    const docId = DOC_ID_MAP[customKey] || customKey;

    try {
      renderLoading(customLabel, docId);

      const firebase = await getFirebaseServices();

      if (!firebase.auth.currentUser) {
        renderError("Tu dois être connecté pour consulter les corrections.");
        return;
      }

      const snap = await firebase.getDoc(
        firebase.doc(firebase.db, "customAnswerKeys", docId)
      );

      if (!snap.exists()) {
        renderError(`Aucun document trouvé pour "${docId}".`);
        return;
      }

      renderCorrection(snap.data(), docId);

    } catch (error) {
      console.error("Erreur chargement correction :", error);
      renderError(error.message || "Erreur inconnue pendant le chargement.");
    }
  }

  openCorrectionsBtn.addEventListener("click", openCorrectionsInterface);

  if (closeCorrectionsBtn) {
    closeCorrectionsBtn.addEventListener("click", closeCorrectionsInterface);
  }

  if (closeCorrectionsDetailBtn) {
    closeCorrectionsDetailBtn.addEventListener("click", closeCorrectionsInterface);
  }

  if (backToCorrectionCards) {
    backToCorrectionCards.addEventListener("click", showCorrectionsList);
  }

  correctionCards.forEach((card) => {
    card.addEventListener("click", () => {
      const customKey = card.dataset.custom;
      const customLabel = card.querySelector("h3")?.textContent?.trim() || "Correction";

      if (!customKey) {
        renderError("Attribut data-custom manquant sur la carte.");
        return;
      }

      loadCorrection(customKey, customLabel);
    });
  });

  correctionsInterface.addEventListener("click", (e) => {
    if (e.target === correctionsInterface) {
      closeCorrectionsInterface();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !correctionsInterface.hidden) {
      closeCorrectionsInterface();
    }
  });
});
