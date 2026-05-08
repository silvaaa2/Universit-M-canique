document.addEventListener("DOMContentLoaded", () => {
  const openCorrectionsBtn = document.getElementById("openCorrectionsBtn");
  const closeCorrectionsBtn = document.getElementById("closeCorrectionsBtn");
  const correctionsInterface = document.getElementById("correctionsInterface");

  const correctionCards = document.querySelectorAll(".correction-card");
  const correctionCardsContainer = document.getElementById("correctionCards");
  const correctionDetail = document.getElementById("correctionDetail");
  const correctionContent = document.getElementById("correctionContent");
  const backCorrectionsBtn = document.getElementById("backCorrectionsBtn");

  const correctionsTitle = document.getElementById("correctionsTitle");
  const correctionsSubtitle = document.getElementById("correctionsSubtitle");

  if (!openCorrectionsBtn) {
    console.error("Bouton Corrigés introuvable : #openCorrectionsBtn");
    return;
  }

  if (!correctionsInterface) {
    console.error("Interface corrigés introuvable : #correctionsInterface");
    return;
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
    }, 300);
  }

  function showCorrectionsList() {
    if (correctionsTitle) {
      correctionsTitle.textContent = "Choisir un custom";
    }

    if (correctionsSubtitle) {
      correctionsSubtitle.textContent = "Sélectionnez le custom souhaité pour consulter sa fiche de correction.";
    }

    if (correctionCardsContainer) {
      correctionCardsContainer.hidden = false;
      correctionCardsContainer.style.display = "grid";
    }

    if (correctionDetail) {
      correctionDetail.hidden = true;
      correctionDetail.classList.remove("active");
    }

    if (correctionContent) {
      correctionContent.innerHTML = "";
    }
  }

  function showCorrectionDetail() {
    if (correctionCardsContainer) {
      correctionCardsContainer.hidden = true;
      correctionCardsContainer.style.display = "none";
    }

    if (correctionDetail) {
      correctionDetail.hidden = false;

      requestAnimationFrame(() => {
        correctionDetail.classList.add("active");
      });
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderLoading(customName) {
    showCorrectionDetail();

    if (correctionsTitle) {
      correctionsTitle.textContent = "Chargement...";
    }

    if (correctionsSubtitle) {
      correctionsSubtitle.textContent = `Récupération de la correction ${customName}.`;
    }

    correctionContent.innerHTML = `
      <div class="correction-loading">
        <div class="correction-loader"></div>
        <p>Chargement de la fiche de correction...</p>
      </div>
    `;
  }

  function renderError(message) {
    showCorrectionDetail();

    if (correctionsTitle) {
      correctionsTitle.textContent = "Erreur";
    }

    if (correctionsSubtitle) {
      correctionsSubtitle.textContent = "Impossible de charger la correction.";
    }

    correctionContent.innerHTML = `
      <div class="correction-error-box">
        <h3>Oups, ça a merdé.</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  function normalizeSections(rawSections) {
    if (!rawSections) return [];

    if (Array.isArray(rawSections)) {
      return rawSections;
    }

    if (typeof rawSections === "object") {
      return Object.values(rawSections);
    }

    return [];
  }

  function normalizeItems(rawItems) {
    if (!rawItems) return [];

    if (Array.isArray(rawItems)) {
      return rawItems;
    }

    if (typeof rawItems === "object") {
      return Object.values(rawItems);
    }

    return [];
  }

  function renderCorrection(data, docId) {
    const title = data.label || data.title || data.titre || docId;
    const description = data.description || "Correction du custom sélectionné.";

    if (correctionsTitle) {
      correctionsTitle.textContent = title;
    }

    if (correctionsSubtitle) {
      correctionsSubtitle.textContent = description;
    }

    const sections = normalizeSections(data.sections);

    let sectionsHtml = "";

    if (sections.length > 0) {
      sectionsHtml = sections.map((section, index) => {
        const sectionTitle = section.title || section.label || `Section ${index + 1}`;
        const items = normalizeItems(section.items);

        const itemsHtml = items.map((item) => {
          const itemLabel = item.label || "Élément";
          const itemValue = item.value ?? item.valeur ?? "Non renseigné";

          return `
            <div class="correction-line">
              <span>${escapeHtml(itemLabel)}</span>
              <strong>${escapeHtml(itemValue)}</strong>
            </div>
          `;
        }).join("");

        return `
          <article class="correction-section-card">
            <h3>${escapeHtml(sectionTitle)}</h3>
            <div class="correction-lines">
              ${itemsHtml || `<p class="empty-correction">Aucun élément dans cette section.</p>`}
            </div>
          </article>
        `;
      }).join("");
    } else {
      const fallbackItems = Object.entries(data)
        .filter(([key]) => !["label", "title", "titre", "description", "sections"].includes(key))
        .map(([key, value]) => `
          <div class="correction-line">
            <span>${escapeHtml(key)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `)
        .join("");

      sectionsHtml = `
        <article class="correction-section-card">
          <h3>Informations</h3>
          <div class="correction-lines">
            ${fallbackItems || `<p class="empty-correction">Aucune donnée disponible.</p>`}
          </div>
        </article>
      `;
    }

    showCorrectionDetail();

    correctionContent.innerHTML = `
      <div class="correction-detail-head">
        <p class="correction-document-id">Firestore / customAnswerKeys / ${escapeHtml(docId)}</p>
      </div>

      <div class="correction-sections">
        ${sectionsHtml}
      </div>
    `;
  }

  async function waitForFirebaseReady() {
    if (window.profFirebase?.db) {
      return window.profFirebase;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Firebase n’est pas prêt. Vérifie prof-auth.js."));
      }, 6000);

      window.addEventListener("profFirebaseReady", () => {
        clearTimeout(timeout);
        resolve(window.profFirebase);
      }, { once: true });
    });
  }

  async function loadCorrection(customDocId, customName) {
    try {
      renderLoading(customName);

      const firebase = await waitForFirebaseReady();

      if (!window.currentProfUser) {
        renderError("Tu dois être connecté pour lire les corrections.");
        return;
      }

      const correctionRef = firebase.doc(firebase.db, "customAnswerKeys", customDocId);
      const correctionSnap = await firebase.getDoc(correctionRef);

      if (!correctionSnap.exists()) {
        renderError(`Aucune correction trouvée pour : ${customDocId}`);
        return;
      }

      renderCorrection(correctionSnap.data(), customDocId);

    } catch (error) {
      console.error("Erreur chargement correction :", error);
      renderError(error.message || "Erreur inconnue pendant le chargement.");
    }
  }

  openCorrectionsBtn.addEventListener("click", openCorrectionsInterface);

  if (closeCorrectionsBtn) {
    closeCorrectionsBtn.addEventListener("click", closeCorrectionsInterface);
  }

  if (backCorrectionsBtn) {
    backCorrectionsBtn.addEventListener("click", showCorrectionsList);
  }

  correctionCards.forEach((card) => {
    card.addEventListener("click", () => {
      const customDocId = card.dataset.custom;
      const customName = card.querySelector("h3")?.textContent || "custom";

      if (!customDocId) {
        renderError("data-custom manquant sur cette carte.");
        return;
      }

      loadCorrection(customDocId, customName);
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
