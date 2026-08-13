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

  const IGNORED_KEYS = [
    "label",
    "title",
    "titre",
    "description",
    "sections",
    "columns",
    "wide",
    "updatedAt",
    "createdAt",
    "updated_at",
    "created_at",
    "timestamp",
    "date",
    "lastUpdate",
    "lastUpdated"
  ];

  const ENTER_DURATION = 320;
  const EXIT_DURATION = 220;

  if (!openCorrectionsBtn || !inlineCorrections) {
    console.error("Interface des corrigés introuvable.");
    return;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function enterView(el) {
    if (!el) return;
    el.classList.remove("is-leaving");
    void el.offsetWidth;
    el.classList.add("is-entering");

    setTimeout(() => {
      el.classList.remove("is-entering");
    }, ENTER_DURATION);
  }

  async function leaveView(el) {
    if (!el || el.hidden) return;
    el.classList.remove("is-entering");
    void el.offsetWidth;
    el.classList.add("is-leaving");
    await wait(EXIT_DURATION);
    el.classList.remove("is-leaving");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeArray(rawValue) {
    if (!rawValue) return [];
    if (Array.isArray(rawValue)) return rawValue;
    if (isPlainObject(rawValue)) return Object.values(rawValue);
    return [];
  }

  function prettifyKey(key) {
    return String(key)
      .replaceAll("_", " ")
      .replaceAll("-", " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function isTimestampLike(value) {
    if (!isPlainObject(value)) return false;

    return (
      ("seconds" in value && "nanoseconds" in value) ||
      ("_seconds" in value && "_nanoseconds" in value)
    );
  }

  function shouldIgnoreKey(key, value) {
    return IGNORED_KEYS.includes(key) || isTimestampLike(value);
  }

  function openInlineCorrections() {
    if (!inlineCorrections.hidden) {
      inlineCorrections.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    inlineCorrections.hidden = false;

    showChooser(false);

    requestAnimationFrame(() => {
      inlineCorrections.classList.add("active");
      enterView(inlineCorrectionChooser);
    });

    setTimeout(() => {
      inlineCorrections.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  function closeInlineCorrections() {
    inlineCorrections.classList.remove("active");

    setTimeout(() => {
      inlineCorrections.hidden = true;
      inlineCorrectionChooser.hidden = false;
      inlineCorrectionDetail.hidden = true;
      correctionSections.innerHTML = "";
      correctionTags.innerHTML = "";
    }, 220);
  }

  async function showChooser(animated = true) {
    correctionSections.innerHTML = "";
    correctionTags.innerHTML = "";

    if (!inlineCorrectionDetail.hidden && animated) {
      await leaveView(inlineCorrectionDetail);
    }

    inlineCorrectionDetail.hidden = true;
    inlineCorrectionChooser.hidden = false;

    if (animated) {
      enterView(inlineCorrectionChooser);
    }
  }

  async function showDetail(animated = true) {
    if (!inlineCorrectionChooser.hidden && animated) {
      await leaveView(inlineCorrectionChooser);
    }

    inlineCorrectionChooser.hidden = true;
    inlineCorrectionDetail.hidden = false;

    if (animated) {
      enterView(inlineCorrectionDetail);
    }
  }

  async function renderLoading(customName) {
    await showDetail(true);

    correctionHeroKicker.textContent = "Chargement";
    correctionTitle.textContent = customName;
    correctionDescription.textContent = "Récupération de la correction en cours...";
    correctionPath.textContent = "";
    correctionTags.innerHTML = "";

    correctionSections.innerHTML = `
      <div class="inline-loading-box">
        <div class="inline-loader"></div>
        <p>Chargement de la fiche de correction...</p>
      </div>
    `;
  }

  function renderError(message) {
    correctionHeroKicker.textContent = "Erreur";
    correctionTitle.textContent = "Impossible de charger";
    correctionDescription.textContent = "Une erreur est survenue pendant le chargement.";
    correctionPath.textContent = "";
    correctionTags.innerHTML = "";

    correctionSections.innerHTML = `
      <div class="inline-error-box">
        <h4>Oups, ça a merdé.</h4>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  function renderValue(value) {
    if (value === null || value === undefined || value === "") return "Non renseigné";
    if (isTimestampLike(value)) return "";

    if (typeof value === "boolean") return value ? "Oui" : "Non";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return value;

    if (Array.isArray(value)) {
      if (!value.length) return "Aucun élément";

      return value
        .map((entry) => {
          if (isPlainObject(entry)) {
            const label = entry.label || entry.title || entry.nom || entry.name || "";
            const itemValue = entry.value ?? entry.valeur ?? entry.reponse ?? entry.answer ?? "";

            if (itemValue !== "") {
              return label ? `${label} : ${renderValue(itemValue)}` : `${renderValue(itemValue)}`;
            }

            return Object.entries(entry)
              .filter(([key, val]) => !shouldIgnoreKey(key, val))
              .map(([key, val]) => `${prettifyKey(key)} : ${renderValue(val)}`)
              .filter(Boolean)
              .join("\n");
          }

          return renderValue(entry);
        })
        .filter(Boolean)
        .join("\n");
    }

    if (isPlainObject(value)) {
      return Object.entries(value)
        .filter(([key, val]) => !shouldIgnoreKey(key, val))
        .map(([key, val]) => `${prettifyKey(key)} : ${renderValue(val)}`)
        .filter(Boolean)
        .join("\n");
    }

    return String(value);
  }

  function splitLabelValue(text) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return null;

    const separators = [" : ", ": "];

    for (const sep of separators) {
      const idx = cleaned.indexOf(sep);
      if (idx > 0) {
        const left = cleaned.slice(0, idx).trim();
        const right = cleaned.slice(idx + sep.length).trim();

        if (left && right) {
          return { label: left, value: right };
        }
      }
    }

    return null;
  }

  function renderItemLine(label, value, hideLabel = false) {
    const renderedValue = renderValue(value);
    if (!renderedValue) return "";

    let finalLabel = label;
    let finalValue = renderedValue;
    let finalHideLabel = hideLabel || !label || label === "Élément";

    if (finalHideLabel) {
      const split = splitLabelValue(renderedValue);
      if (split) {
        finalLabel = split.label;
        finalValue = split.value;
        finalHideLabel = false;
      }
    }

    return `
      <div class="inline-detail-item ${finalHideLabel ? "no-label" : ""}">
        ${finalHideLabel ? "" : `<div class="inline-detail-item-label">${escapeHtml(finalLabel)}</div>`}
        <div class="inline-detail-item-value">${escapeHtml(finalValue)}</div>
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

  function isSectionLike(value) {
    return isPlainObject(value) && (
      "items" in value ||
      "title" in value ||
      "label" in value ||
      "nom" in value ||
      "name" in value ||
      "columns" in value
    );
  }

  function getSectionTitle(section, fallback) {
    return section.title || section.label || section.nom || section.name || fallback;
  }

  function extractSimpleItems(obj) {
    if (!isPlainObject(obj)) return [];

    const ignored = [
      "title",
      "label",
      "nom",
      "name",
      "items",
      "columns",
      "wide"
    ];

    const baseItems = normalizeArray(obj.items).map((item) => {
      if (isPlainObject(item)) return item;
      return { value: item };
    });

    const extraItems = Object.entries(obj)
      .filter(([key, value]) => !ignored.includes(key) && !shouldIgnoreKey(key, value))
      .map(([key, value]) => ({
        label: prettifyKey(key),
        value
      }));

    return [...baseItems, ...extraItems];
  }

  function renderItems(items) {
    return items.map((item) => {
      if (isPlainObject(item)) {
        const hasCustomLabel = !!(item.label || item.title || item.nom || item.name);
        const label = item.label || item.title || item.nom || item.name || "";

        if ("value" in item || "valeur" in item || "reponse" in item || "answer" in item) {
          const value = item.value ?? item.valeur ?? item.reponse ?? item.answer;
          return renderItemLine(label, value, !hasCustomLabel);
        }

        const entries = Object.entries(item)
          .filter(([key, value]) => !["label", "title", "nom", "name"].includes(key) && !shouldIgnoreKey(key, value));

        return entries
          .map(([key, value]) => renderItemLine(prettifyKey(key), value))
          .join("");
      }

      return renderItemLine("", item, true);
    }).join("");
  }

  function renderColumnsAsSubSections(columns) {
    const columnGroups = normalizeArray(columns);

    if (!columnGroups.length) return "";

    return columnGroups.map((group, index) => {
      if (!isPlainObject(group)) {
        return renderSectionCard(
          `Groupe ${index + 1}`,
          renderItemLine("", group, true),
          "1 élément"
        );
      }

      const title = getSectionTitle(group, `Groupe ${index + 1}`);
      const items = extractSimpleItems(group);
      const html = renderItems(items);

      return renderSectionCard(title, html, `${items.length} élément(s)`);
    }).join("");
  }

  function renderKnownSection(section, index) {
    if (!isPlainObject(section)) {
      return renderSectionCard(
        `Section ${index + 1}`,
        renderItemLine("", section, true),
        "1 élément"
      );
    }

    const sectionTitle = getSectionTitle(section, `Section ${index + 1}`);

    const normalItems = extractSimpleItems(section).filter((item) => {
      const label = String(item.label || "").toLowerCase().trim();
      return label !== "wide" && label !== "columns";
    });

    const normalHtml = renderItems(normalItems);

    const columnsHtml = section.columns
      ? renderColumnsAsSubSections(section.columns)
      : "";

    const finalHtml = `
      ${normalHtml}
      ${columnsHtml ? `<div class="inline-subsections">${columnsHtml}</div>` : ""}
    `;

    const totalCount = normalItems.length + normalizeArray(section.columns).length;

    return renderSectionCard(sectionTitle, finalHtml, `${totalCount} élément(s)`);
  }

  function renderSmartRootField(key, value) {
    if (shouldIgnoreKey(key, value)) return "";

    if (key === "columns") {
      return renderColumnsAsSubSections(value);
    }

    const title = prettifyKey(key);

    if (Array.isArray(value)) {
      const allSectionLike = value.every(isSectionLike);

      if (allSectionLike) {
        return value.map((entry, index) => renderKnownSection(entry, index)).join("");
      }

      return renderSectionCard(title, renderItemLine(title, value), `${value.length} élément(s)`);
    }

    if (isPlainObject(value)) {
      const values = Object.values(value);
      const looksLikeSectionList = values.length > 0 && values.every(isSectionLike);

      if (looksLikeSectionList) {
        return values.map((entry, index) => renderKnownSection(entry, index)).join("");
      }

      if (isSectionLike(value)) {
        return renderKnownSection(value, 0);
      }

      const entries = Object.entries(value)
        .filter(([childKey, childValue]) => !shouldIgnoreKey(childKey, childValue));

      const html = entries
        .map(([childKey, childValue]) => renderItemLine(prettifyKey(childKey), childValue))
        .join("");

      return renderSectionCard(title, html, `${entries.length} champ(s)`);
    }

    return renderSectionCard(title, renderItemLine(title, value), "1 champ");
  }

  function renderExtraRootFields(data) {
    return Object.entries(data)
      .filter(([key, value]) => !shouldIgnoreKey(key, value))
      .map(([key, value]) => renderSmartRootField(key, value))
      .filter(Boolean)
      .join("");
  }

  function renderCorrection(data, docId, meta) {
    const title = data.label || data.title || data.titre || meta.label || docId;
    const description = data.description || `Réponses et configuration attendue pour le custom ${meta.vehicle}.`;
    const sections = normalizeArray(data.sections);

    correctionHeroKicker.textContent = "Corrigé";
    correctionTitle.textContent = title;
    correctionDescription.textContent = description;
    correctionPath.textContent = "";

    correctionTags.innerHTML = `
      <span class="inline-tag">${escapeHtml(meta.label)}</span>
      <span class="inline-tag">${escapeHtml(meta.vehicle)}</span>
      <span class="inline-tag">${sections.length} section(s)</span>
    `;

    let finalHtml = "";

    if (sections.length) {
      finalHtml += sections.map((section, index) => renderKnownSection(section, index)).join("");
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
      await renderLoading(meta.label);

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
      renderError("Cette correction ne peut pas être chargée pour le moment. Réessaie dans quelques instants.");
    }
  }

  openCorrectionsBtn.addEventListener("click", openInlineCorrections);

  if (minimizeCorrectionsBtn) {
    minimizeCorrectionsBtn.addEventListener("click", closeInlineCorrections);
  }

  if (backToCustomsBtn) {
    backToCustomsBtn.addEventListener("click", async () => {
      await showChooser(true);
    });
  }

  correctionCards.forEach((card) => {
    card.addEventListener("click", async () => {
      const docId = card.dataset.doc;
      const label = card.dataset.label || "Custom";
      const vehicle = card.dataset.vehicle || docId;

      if (!docId) {
        renderError("data-doc manquant sur cette carte.");
        return;
      }

      await loadCorrection(docId, { label, vehicle });
    });
  });
});

