(() => {
  "use strict";

  const STORAGE_KEY = "profV2Profile";
  const UPDATED_EVENT = "profProfileChanged";

  function cleanName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 32);
  }

  function initialsFor(value) {
    return String(value || "prof")
      .split("@")[0]
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "PR";
  }

  function read() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
      return { displayName: cleanName(saved.displayName) };
    } catch (error) {
      console.warn("Profil local illisible :", error);
      return { displayName: "" };
    }
  }

  function identityName() {
    const user = window.currentProfUser;
    return cleanName(
      user?.profDisplayName
      || user?.profIdentity?.displayName
      || user?.email
      || "Professeur"
    );
  }

  function sync(displayName) {
    const safeName = cleanName(displayName) || identityName();
    const initials = initialsFor(safeName);

    ["v2UserEmail", "v2ProfilePreviewName"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = safeName;
    });

    ["v2UserInitials", "v2ProfilePreviewInitials"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = initials;
    });

    const transitionTitle = document.getElementById("loginTransitionTitle");
    if (transitionTitle) transitionTitle.textContent = `Bienvenue, ${safeName}`;

    window.dispatchEvent(new CustomEvent(UPDATED_EVENT, {
      detail: { displayName: safeName }
    }));

    return safeName;
  }

  function save(value) {
    const displayName = cleanName(value);

    if (!displayName) {
      return { ok: false, displayName: "", message: "Saisissez un nom à afficher." };
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ displayName }));
      sync(displayName);
      return { ok: true, displayName, message: "Nom appliqué et enregistré sur ce navigateur." };
    } catch (error) {
      console.warn("Sauvegarde du nom local impossible :", error);
      return {
        ok: false,
        displayName,
        message: "Impossible d’enregistrer le nom sur ce navigateur."
      };
    }
  }

  function reset() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      const displayName = sync(identityName());
      return { ok: true, displayName, message: "Nom Discord restauré." };
    } catch (error) {
      console.warn("Réinitialisation du nom local impossible :", error);
      return { ok: false, displayName: "", message: "Réinitialisation impossible." };
    }
  }

  function setStatus(result) {
    const status = document.getElementById("v2ProfileStatus");
    if (!status) return;
    status.textContent = result.message;
    status.dataset.tone = result.ok ? "ok" : "error";
  }

  function applyFromField() {
    const input = document.getElementById("v2ProfileName");
    const result = save(input?.value);
    if (input && result.ok) input.value = result.displayName;
    setStatus(result);
    return result;
  }

  function init() {
    const form = document.getElementById("v2ProfileForm");
    const input = document.getElementById("v2ProfileName");
    const saveButton = document.getElementById("saveProfileBtn");
    const resetButton = document.getElementById("resetProfileBtn");

    saveButton?.addEventListener("click", applyFromField);
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      applyFromField();
    });

    resetButton?.addEventListener("click", () => {
      const result = reset();
      if (input && result.ok) input.value = "";
      setStatus(result);
    });

    input?.addEventListener("input", () => {
      const previewName = cleanName(input.value) || identityName();
      const preview = document.getElementById("v2ProfilePreviewName");
      const previewInitials = document.getElementById("v2ProfilePreviewInitials");
      if (preview) preview.textContent = previewName;
      if (previewInitials) previewInitials.textContent = initialsFor(previewName);
      const status = document.getElementById("v2ProfileStatus");
      if (status) status.textContent = "";
    });
  }

  window.profLocalProfile = Object.freeze({
    storageKey: STORAGE_KEY,
    read,
    save,
    reset,
    sync
  });

  init();
})();
