document.addEventListener("DOMContentLoaded", () => {
  const openCorrectionsBtn = document.getElementById("openCorrectionsBtn");
  const closeCorrectionsBtn = document.getElementById("closeCorrectionsBtn");
  const correctionsInterface = document.getElementById("correctionsInterface");

  const correctionsChooserHead = document.getElementById("correctionsChooserHead");
  const correctionCardsList = document.getElementById("correctionCardsList");
  const correctionCards = document.querySelectorAll(".correction-card");

  const correctionDetailView = document.getElementById("correctionDetailView");
  const backToCorrectionCards = document.getElementById("backToCorrectionCards");

  const correctionTitle = document.getElementById("correctionTitle");
  const correctionDescription = document.getElementById("correctionDescription");
  const correctionPath = document.getElementById("correctionPath");
  const correctionTags = document.getElementById("correctionTags");
  const correctionSections = document.getElementById("correctionSections");

  if (!openCorrectionsBtn || !correctionsInterface) {
    console.error("Interface Corrigés introuvable.");
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

  function normalizeArray(value) {
    if (!value) return [];

    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === "object") {
      return Object.values(value);
    }

    return [];
  }

  function openCorrectionsInterface() {
    correctionsInterface.hidden = false;
    document.body.classList.add("modal-open");
    showCorrectionCards();

    requestAnimationFrame(() => {
      correctionsInterface.classList.add("active");
    });
  }

  function closeCorrectionsInterface() {
    correctionsInterface.classList.remove("active");
    document.body.classList.remove("modal-open");

    setTimeout(() => {
      correctionsInterface.hidden = true;
      showCorrectionCards();
    }, 300);
  }

  function showCorrectionCards() {
    if (correctionsChooserHead) {
      correctionsChooserHead.hidden = false;
    }

    if (correctionCardsList) {
      correctionCardsList.hidden = false;
      correctionCardsList.style.display = "grid";
    }

    if (correctionDetailView) {
      correctionDetailView.hidden = true;
      correctionDetailView.classList.remove("active");
    }

    if (correctionSections) {
      correctionSections.innerHTML = "";
    }

    if (correctionTags) {
      correctionTags.innerHTML = "";
    }
  }

  function showCorrectionDetail() {
    if (correctionsChooserHead) {
      correctionsChooserHead.hidden = true;
    }

    if (correctionCardsList) {
      correctionCardsList.hidden = true;
      correctionCardsList.style.display = "none";
    }

    if (correctionDetailView) {
      correctionDetailView.hidden = false;

      requestAnimationFrame(() => {
        correctionDetailView.classList.add("active");
      });
    }
  }

  function renderLoading(customName) {
    showCorrectionDetail();

    correctionTitle.textContent = "Chargement...";
    correctionDescription.textContent = `Récupération de la correction ${customName}.`;
    correctionPath.textContent = "Connexion à Firebase...";

    correctionTags.innerHTML = `
      <span class="detail-tag">Chargement</span>
    `;

    correctionSections.innerHTML = `
      <div class="detail-empty correction-loading-box">
        <div class="correction-loader"></div>
        <span>Chargement de la fiche de correction...</span>
      </div>
    `;
  }

  function renderError(message) {
    showCorrectionDetail();

    correctionTitle.textContent = "Erreur";
    correctionDescription.textContent = "Impossible de charger la correction.";
    correctionPath.textContent = "Firebase / erreur";

    correctionTags.innerHTML = `
      <span class="detail-tag">Erreur</span>
    `;

    correctionSections.innerHTML = `
      <div class="detail-empty">
        <strong>Oups, ça a merdé.</strong><br>
        ${escapeHtml(message)}
      </div>
    `;
  }

  function renderTags(data, docId, sections) {
    const tags = [];

    if (data?.label) {
      tags.push(data.label);
    }

    if (docId) {
      tags.push(`ID : ${docId}`);
    }

    tags.push(`${sections.length} section(s)`);

    correctionTags.innerHTML = tags
      .map((tag) => `<span class="detail-tag">${escapeHtml(tag)}</span>`)
      .join("");
  }

  function renderSections(sections) {
    if (!sections.length) {
      correctionSections.innerHTML = `
        <div class="detail-empty">
          Aucune section trouvée pour cette correction.
        </div>
      `;
      return;
    }

    correctionSections.innerHTML = sections.map((section, index) => {
      const sectionTitle = section.title || section.label || `Section ${index + 1}`;
      const items = normalizeArray(section.items);

      const itemsHtml = items.length
        ? items.map((item) => {
            const itemLabel = item.label || "Élément";
            const itemValue = item.value ?? item.valeur ?? "-";

            return `
              <div class="detail-item">
                <div class="detail-item-label">${escapeHtml(itemLabel)}</div>
                <div class="detail-item-value">${escapeHtml(itemValue)}</div>
              </div>
            `;
          }).join("")
        : `
          <div class="detail-empty">
            Aucun élément dans cette section.
          </div>
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
  }

  function renderCorrection(data, docId) {
    const title = data.label || data.title || data.titre || "Correction";
    const description = data.description || "Correction du custom sélectionné.";
    const sections = normalizeArray(data.sections);

    correctionTitle.textContent = title;
    correctionDescription.textContent = description;
    correctionPath.textContent = `Firestore / customAnswerKeys / ${docId}`;

    renderTags(data, docId, sections);
    renderSections(sections);

    showCorrectionDetail();
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

  if (backToCorrectionCards) {
    backToCorrectionCards.addEventListener("click", showCorrectionCards);
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
    if (e.key !== "Escape" || correctionsInterface.hidden) return;

    if (correctionDetailView && !correctionDetailView.hidden) {
      showCorrectionCards();
    } else {
      closeCorrectionsInterface();
    }
  });
});
