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

  function normalizeArray(rawValue) {
    if (!rawValue) return [];

    if (Array.isArray(rawValue)) {
      return rawValue;
    }

    if (typeof rawValue === "object") {
      return Object.values(rawValue);
    }

    return [];
  }

  function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function prettifyKey(key) {
    return String(key)
      .replaceAll("_", " ")
      .replaceAll("-", " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, letter => letter.toUpperCase());
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

  function renderValue(value) {
    if (value === null || value === undefined || value === "") {
      return "Non renseigné";
    }

    if (typeof value === "boolean") {
      return value ? "Oui" : "Non";
    }

    if (typeof value === "number") {
      return String(value);
    }

    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      if (!value.length) return "Aucun élément";

      return value.map((entry) => {
        if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
          return `• ${renderValue(entry)}`;
        }

        if (isPlainObject(entry)) {
          const label = entry.label || entry.title || entry.nom || entry.name || "Élément";
          const itemValue = entry.value ?? entry.valeur ?? entry.reponse ?? entry.answer ?? "";

          if (itemValue !== "") {
            return `• ${label} : ${renderValue(itemValue)}`;
          }

          return Object.entries(entry)
            .map(([key, val]) => `• ${prettifyKey(key)} : ${renderValue(val)}`)
            .join("\n");
        }

        return `• ${String(entry)}`;
      }).join("\n");
    }

    if (isPlainObject(value)) {
      return Object.entries(value)
        .map(([key, val]) => `${prettifyKey(key)} : ${renderValue(val)}`)
        .join("\n");
    }

    return String(value);
  }

  function renderItemLine(label, value) {
    return `
      <div class="inline-detail-item">
        <div class="inline-detail-item-label">${escapeHtml(label)}</div>
        <div class="inline-detail-item-value">${escapeHtml(renderValue(value))}</div>
      </div>
    `;
  }

  function renderSectionCard(title, itemsHtml, countText = "") {
    return `
      <article class="inline-detail-section">
        <div class="inline-detail-section-head">
          <h4>${escapeHtml(title)}</h4>
          <span>${escapeHtml(countText || "Données")}</span>
        </div>

        <div class="inline-detail-items">
          ${itemsHtml || `
            <div class="inline-empty-box">
              Aucun élément dans cette section.
            </div>
          `}
        </div>
      </article>
    `;
  }

  function renderKnownSection(section, index) {
    const sectionTitle = section.title || section.label || section.nom || `Section ${index + 1}`;
    const items = normalizeArray(section.items);

    let html = "";

    if (items.length) {
      html += items.map((item) => {
        if (isPlainObject(item)) {
          const itemLabel = item.label || item.title || item.nom || item.name || "Élément";
          const itemValue = item.value ?? item.valeur ?? item.reponse ?? item.answer ?? "Non renseigné";
          return renderItemLine(itemLabel, itemValue);
        }

        return renderItemLine("Élément", item);
      }).join("");
    }

    const ignoredKeys = ["title", "label", "nom", "name", "items"];

    const extraFieldsHtml = Object.entries(section)
      .filter(([key]) => !ignoredKeys.includes(key))
      .map(([key, value]) => renderItemLine(prettifyKey(key), value))
      .join("");

    html += extraFieldsHtml;

    const count = items.length + Object.entries(section).filter(([key]) => !ignoredKeys.includes(key)).length;

    return renderSectionCard(sectionTitle, html, `${count} élément(s)`);
  }

  function renderExtraRootFields(data) {
    const ignoredRootKeys = [
      "label",
      "title",
      "titre",
      "description",
      "sections"
    ];

    const extraEntries = Object.entries(data)
      .filter(([key]) => !ignoredRootKeys.includes(key));

    if (!extraEntries.length) return "";

    const html = extraEntries
      .map(([key, value]) => renderItemLine(prettifyKey(key), value))
      .join("");

    return renderSectionCard("Autres informations", html, `${extraEntries.length} champ(s)`);
  }

  function renderCorrection(data, docId, meta) {
    const title = data.label || data.title || data.titre || meta.label || docId;
    const description = data.description || `Réponses et configuration attendue pour le custom ${meta.vehicle}.`;

    const sections = normalizeArray(data.sections);

    correctionHeroKicker.textContent = "Corrigé";
    correctionTitle.textContent = title;
    correctionDescription.textContent = description;
    correctionPath.textContent = `Firestore / customAnswerKeys / ${docId}`;

    const extraRootCount = Object.keys(data).filter(key => ![
      "label",
      "title",
      "titre",
      "description",
      "sections"
    ].includes(key)).length;

    correctionTags.innerHTML = `
      <span class="inline-tag">${escapeHtml(meta.label)}</span>
      <span class="inline-tag">${escapeHtml(meta.vehicle)}</span>
      <span class="inline-tag">${sections.length} section(s)</span>
      ${extraRootCount ? `<span class="inline-tag">${extraRootCount} champ(s) bonus</span>` : ""}
    `;

    let finalHtml = "";

    if (sections.length) {
      finalHtml += sections.map((section, index) => {
        if (isPlainObject(section)) {
          return renderKnownSection(section, index);
        }

        return renderSectionCard(
          `Section ${index + 1}`,
          renderItemLine("Valeur", section),
          "1 élément"
        );
      }).join("");
    }

    finalHtml += renderExtraRootFields(data);

    if (!finalHtml.trim()) {
      finalHtml = `
        <div class="inline-empty-box">
          Aucune donnée disponible pour cette correction.
        </div>
      `;
    }

    correctionSections.innerHTML = finalHtml;
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
