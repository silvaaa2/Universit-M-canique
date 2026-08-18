(() => {
  "use strict";

  const STORAGE_KEY = "profSimplifiedMode";
  const ROOT_CLASS = "prof-simplified-mode";
  const root = document.documentElement;

  function readPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch (error) {
      console.warn("Préférence d’affichage locale indisponible :", error);
      return false;
    }
  }

  function isEnabled() {
    return root.classList.contains(ROOT_CLASS);
  }

  function syncControls() {
    const enabled = isEnabled();

    document.querySelectorAll("[data-simplified-toggle]").forEach((control) => {
      control.classList.toggle("active", enabled);
      control.setAttribute("aria-checked", String(enabled));
      control.dataset.enabled = String(enabled);

      const label = control.querySelector("[data-simplified-label]");
      if (label) label.textContent = enabled ? "Activé" : "Désactivé";
    });

    document.querySelectorAll("[data-simplified-status]").forEach((status) => {
      status.textContent = enabled
        ? "Mode simplifié actif sur cet appareil."
        : "Mode simplifié désactivé.";
    });
  }

  function applyPreference(enabled, { persist = false, notify = true } = {}) {
    const safeEnabled = Boolean(enabled);
    root.classList.toggle(ROOT_CLASS, safeEnabled);
    root.dataset.simplifiedMode = safeEnabled ? "on" : "off";

    if (persist) {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(safeEnabled));
      } catch (error) {
        console.warn("Impossible d’enregistrer le mode simplifié :", error);
      }
    }

    syncControls();

    if (notify) {
      window.dispatchEvent(new CustomEvent("prof:simplified-mode-change", {
        detail: { enabled: safeEnabled, localOnly: true }
      }));
    }
  }

  applyPreference(readPreference(), { notify: false });

  document.addEventListener("click", (event) => {
    const control = event.target instanceof Element
      ? event.target.closest("[data-simplified-toggle]")
      : null;

    if (!(control instanceof HTMLElement)) return;
    event.preventDefault();
    applyPreference(!isEnabled(), { persist: true });
  });

  document.addEventListener("DOMContentLoaded", syncControls, { once: true });

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    applyPreference(event.newValue === "true", { notify: true });
  });

  window.profSimplifiedMode = Object.freeze({
    storageKey: STORAGE_KEY,
    isEnabled,
    set: (enabled) => applyPreference(enabled, { persist: true }),
    sync: syncControls
  });
})();
