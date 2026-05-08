document.addEventListener("DOMContentLoaded", () => {
  const openCorrectionsBtn = document.getElementById("openCorrectionsBtn");

  const inlineCorrections = document.getElementById("inlineCorrections");
  const minimizeCorrectionsBtn = document.getElementById("minimizeCorrectionsBtn");

  const inlineCorrectionChooser = document.getElementById("inlineCorrectionChooser");
  const inlineCorrectionDetail = document.getElementById("inlineCorrectionDetail");

  const backToCustomsBtn = document.getElementById("backToCustomsBtn");

  const correctionCards = document.querySelectorAll(".inline-custom-btn");

  const correctionPath = document.getElementById("correctionPath");
  const correctionHeroKicker = document.getElementById("correctionHeroKicker");
  const correctionTitle = document.getElementById("correctionTitle");
  const correctionDescription = document.getElementById("correctionDescription");
  const correctionTags = document.getElementById("correctionTags");
  const correctionSections = document.getElementById("correctionSections");

  if (!openCorrectionsBtn || !inlineCorrections) {
    console.error("Interface des corrigés introuvable.");
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

  function normalizeSections(rawSections) {
    if (!rawSections) return [];
    if (Array.isArray(rawSections)) return rawSections;
    if (typeof rawSections === "object") return Object.values(rawSections);
    return [];
  }

  function normalizeItems(rawItems) {
    if (!rawItems) return [];
    if (Array.isArray(rawItems)) return rawItems;
    if (typeof rawItems === "object") return Object.values(rawItems);
    return [];
  }

  function openInlineCorrections() {
    if (!inlineCorrections.hidden) {
      inlineCorrections.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    inlineCorrections.hidden = false;

    requestAnimationFrame(() => {
      inlineCorrections.classList.add("active");
    });

    showChooser();

    setTimeout(() => {
      inlineCorrections.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  function closeInlineCorrections() {
    inlineCorrections.classList.remove("active");

    setTimeout(() => {
      inlineCorrections.hidden = true;
      showChooser();
    }, 220);
  }

  function showChooser() {
    inlineCorrectionChooser.hidden = false;
    inlineCorrectionDetail.hidden = true;

    correctionSections.innerHTML = "";
    correctionTags.innerHTML = "";
  }

  function showDetail() {
    inlineCorrectionChooser.hidden = true;
    inlineCorrectionDetail.hidden = false;
  }

  function renderLoading(customName) {
    showDetail();

    correctionHeroKicker.textContent = "Chargement";
    correctionTitle.textContent = customName;
    correctionDescription.textContent = "Récupération de la correction en cours...";
    correctionPath.textContent = "Firestore / customAnswerKeys / ...";
    correctionTags.innerHTML = "";

    correctionSections.innerHTML = `
      <div class="inline-loading-box">
        <div class="inline-loader"></div>
        <p>Chargement de la fiche de correction...</p>
      </div>
    `;
  }

  function renderError(message) {
    showDetail();

    correctionHeroKicker.textContent = "Erreur";
    correctionTitle.textContent = "Impossible de charger";
    correctionDescription.textContent = "Une erreur est survenue pendant le chargement.";
    correctionPath.textContent = "Firestore / customAnswerKeys / erreur";
    correctionTags.innerHTML = "";

    correctionSections.innerHTML = `
      <div class="inline-error-box">
        <h4>Oups, ça a merdé.</h4>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  function renderCorrection(data, docId, meta) {
    const title = data.label || meta.label || docId;
    const description = data.description || `Réponses et configuration attendue pour le custom ${meta.vehicle}.`;
    const sections = normalizeSections(data.sections);

    correctionHeroKicker.textContent = "Corrigé";
    correctionTitle.textContent = title;
    correctionDescription.textContent = description;
    correctionPath.textContent = `Firestore / customAnswerKeys / ${docId}`;

    correctionTags.innerHTML = `
      <span class="inline-tag">${escapeHtml(meta.label)}</span>
      <span class="inline-tag">${escapeHtml(meta.vehicle)}</span>
      <span class="inline-tag">${sections.length} section(s)</span>
    `;

    if (!sections.length) {
      correctionSections.innerHTML = `
        <div class="inline-empty-box">
          Aucune section disponible pour cette correction.
        </div>
      `;
      return;
    }

    correctionSections.innerHTML = sections.map((section, index) => {
      const sectionTitle = section.title || section.label || `Section ${index + 1}`;
      const items = normalizeItems(section.items);

      const itemsHtml = items.length
        ? items.map((item) => {
            const itemLabel = item.label || "Élément";
            const itemValue = item.value ?? item.valeur ?? "Non renseigné";

            return `
              <div class="inline-detail-item">
                <div class="inline-detail-item-label">${escapeHtml(itemLabel)}</div>
                <div class="inline-detail-item-value">${escapeHtml(itemValue)}</div>
              </div>
            `;
          }).join("")
        : `
          <div class="inline-empty-box">
            Aucun élément dans cette section.
          </div>
        `;

      return `
        <article class="inline-detail-section">
          <div class="inline-detail-section-head">
            <h4>${escapeHtml(sectionTitle)}</h4>
            <span>${items.length} élément(s)</span>
          </div>

          <div class="inline-detail-items">
            ${itemsHtml}
          </div>
        </article>
      `;
    }).join("");
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

  async function loadCorrection(docId, meta) {
    try {
      renderLoading(meta.label);

      const firebase = await waitForFirebaseReady();

      if (!window.currentProfUser) {
        renderError("Tu dois être connecté pour lire les corrections.");
        return;
      }

      const correctionRef = firebase.doc(firebase.db, "customAnswerKeys", docId);
      const correctionSnap = await firebase.getDoc(correctionRef);

      if (!correctionSnap.exists()) {
        renderError(`Aucune correction trouvée pour : ${docId}`);
        return;
      }

      renderCorrection(correctionSnap.data(), docId, meta);

      setTimeout(() => {
        inlineCorrections.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);

    } catch (error) {
      console.error("Erreur chargement correction :", error);
      renderError(error.message || "Erreur inconnue pendant le chargement.");
    }
  }

  openCorrectionsBtn.addEventListener("click", openInlineCorrections);

  if (minimizeCorrectionsBtn) {
    minimizeCorrectionsBtn.addEventListener("click", closeInlineCorrections);
  }

  if (backToCustomsBtn) {
    backToCustomsBtn.addEventListener("click", showChooser);
  }

  correctionCards.forEach((card) => {
    card.addEventListener("click", () => {
      const docId = card.dataset.doc;
      const label = card.dataset.label || "Custom";
      const vehicle = card.dataset.vehicle || docId;

      if (!docId) {
        renderError("data-doc manquant sur la carte.");
        return;
      }

      loadCorrection(docId, { label, vehicle });
    });
  });
});
