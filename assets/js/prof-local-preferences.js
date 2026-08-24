(() => {
  "use strict";

  const CATEGORY_STORAGE_KEY = "profSettingsActiveCategory";
  const CATEGORIES = new Set(["profile", "display", "accessibility", "corrections"]);
  const PREFERENCES = Object.freeze({
    highContrast: {
      storageKey: "profHighContrast",
      rootClass: "prof-high-contrast",
      defaultValue: false
    },
    reducedMotion: {
      storageKey: "profReducedMotion",
      rootClass: "prof-reduced-motion",
      defaultValue: false
    },
    keepAwake: {
      storageKey: "profKeepScreenAwake",
      defaultValue: false
    },
    autoPaste: {
      storageKey: "profModulesAutoPasteEnabled",
      defaultValue: true
    }
  });

  const root = document.documentElement;
  const state = Object.create(null);
  let wakeLock = null;
  let controlsBound = false;

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // Les valeurs actives sont tout de même réinitialisées dans la page.
    }
  }

  function readBooleanPreference(name) {
    const preference = PREFERENCES[name];
    if (!preference) return false;
    const savedValue = readStorage(preference.storageKey);
    return savedValue === null ? preference.defaultValue : savedValue === "true";
  }

  function applyRootPreference(name, enabled) {
    const preference = PREFERENCES[name];
    if (!preference?.rootClass) return;
    root.classList.toggle(preference.rootClass, enabled);
    root.dataset[name] = enabled ? "on" : "off";
  }

  function setPreferenceStatus(name, message) {
    document.querySelectorAll(`[data-preference-status="${name}"]`).forEach((status) => {
      status.textContent = message;
    });
  }

  function supportsWakeLock() {
    return Boolean(navigator.wakeLock && typeof navigator.wakeLock.request === "function");
  }

  async function releaseWakeLock() {
    const activeLock = wakeLock;
    wakeLock = null;
    if (!activeLock) return;

    try {
      await activeLock.release();
    } catch (error) {
      // Le navigateur peut avoir libéré le verrou pendant la mise en veille.
    }
  }

  async function requestWakeLock() {
    if (!state.keepAwake || document.visibilityState !== "visible" || wakeLock) return Boolean(wakeLock);

    if (!supportsWakeLock()) {
      setPreferenceStatus("keepAwake", "Cette fonction n’est pas disponible sur ce navigateur.");
      return false;
    }

    try {
      wakeLock = await navigator.wakeLock.request("screen");
      setPreferenceStatus("keepAwake", "Écran maintenu allumé pendant l’utilisation du site.");

      wakeLock.addEventListener("release", () => {
        wakeLock = null;
        if (state.keepAwake && document.visibilityState === "visible") {
          setPreferenceStatus("keepAwake", "Le maintien de l’écran sera réactivé automatiquement.");
        }
      }, { once: true });

      return true;
    } catch (error) {
      setPreferenceStatus("keepAwake", "Le navigateur a refusé le maintien de l’écran.");
      return false;
    }
  }

  function syncPreferenceControls() {
    document.querySelectorAll("[data-local-preference]").forEach((control) => {
      const name = control.dataset.localPreference;
      if (!PREFERENCES[name]) return;

      const enabled = Boolean(state[name]);
      control.classList.toggle("active", enabled);
      control.setAttribute("aria-checked", String(enabled));

      const label = control.querySelector("[data-preference-label]");
      if (label) label.textContent = enabled ? "Activé" : "Désactivé";

      if (name === "keepAwake" && !supportsWakeLock()) {
        control.disabled = true;
        control.setAttribute("aria-disabled", "true");
        setPreferenceStatus(name, "Cette fonction n’est pas disponible sur ce navigateur.");
      }
    });
  }

  async function applyLocalPreference(name, enabled, { persist = false } = {}) {
    const preference = PREFERENCES[name];
    if (!preference) return false;

    let safeEnabled = Boolean(enabled);
    if (name === "keepAwake" && safeEnabled && !supportsWakeLock()) safeEnabled = false;

    state[name] = safeEnabled;
    applyRootPreference(name, safeEnabled);
    if (persist) writeStorage(preference.storageKey, String(safeEnabled));

    if (name === "keepAwake") {
      if (safeEnabled) {
        await requestWakeLock();
      } else {
        await releaseWakeLock();
        setPreferenceStatus("keepAwake", "");
      }
    }

    syncPreferenceControls();
    window.dispatchEvent(new CustomEvent("prof:local-preference-change", {
      detail: { name, enabled: safeEnabled, localOnly: true }
    }));
    return safeEnabled;
  }

  function readCategoryPreference() {
    const savedCategory = readStorage(CATEGORY_STORAGE_KEY);
    return CATEGORIES.has(savedCategory) ? savedCategory : "profile";
  }

  function showSettingsCategory(category, { persist = false } = {}) {
    const safeCategory = CATEGORIES.has(category) ? category : "profile";

    document.querySelectorAll("[data-settings-category]").forEach((control) => {
      const active = control.dataset.settingsCategory === safeCategory;
      control.classList.toggle("active", active);
      control.setAttribute("aria-selected", String(active));
    });

    document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.settingsPanel !== safeCategory;
    });

    if (persist) writeStorage(CATEGORY_STORAGE_KEY, safeCategory);
  }

  async function resetLocalPreferences() {
    Object.values(PREFERENCES).forEach((preference) => removeStorage(preference.storageKey));
    removeStorage("profSimplifiedMode");
    removeStorage("profSimplifiedTextSize");
    removeStorage("profV2Theme");

    window.profSimplifiedMode?.set(false);
    window.profSimplifiedMode?.setTextSize("standard");
    window.profSimplifiedMode?.setTheme("dark");

    for (const [name, preference] of Object.entries(PREFERENCES)) {
      await applyLocalPreference(name, preference.defaultValue, { persist: false });
    }

    document.querySelectorAll("[data-reset-preferences-status]").forEach((status) => {
      status.textContent = "Préférences réinitialisées. Votre nom et votre connexion ont été conservés.";
    });
  }

  function bindControls() {
    if (controlsBound) return;
    controlsBound = true;

    document.querySelectorAll("[data-settings-category]").forEach((control) => {
      control.addEventListener("click", () => {
        showSettingsCategory(control.dataset.settingsCategory, { persist: true });
      });
    });

    document.querySelectorAll("[data-local-preference]").forEach((control) => {
      control.addEventListener("click", async () => {
        const name = control.dataset.localPreference;
        await applyLocalPreference(name, !state[name], { persist: true });
      });
    });

    document.querySelectorAll("[data-reset-local-preferences]").forEach((control) => {
      control.addEventListener("click", resetLocalPreferences);
    });
  }

  Object.keys(PREFERENCES).forEach((name) => {
    state[name] = readBooleanPreference(name);
    applyRootPreference(name, state[name]);
  });

  function initializeLocalPreferences() {
    bindControls();
    showSettingsCategory(readCategoryPreference());
    syncPreferenceControls();
    if (state.keepAwake) requestWakeLock();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLocalPreferences, { once: true });
  } else {
    initializeLocalPreferences();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.keepAwake) requestWakeLock();
  });

  window.addEventListener("pagehide", releaseWakeLock);
  window.addEventListener("storage", (event) => {
    const entry = Object.entries(PREFERENCES)
      .find(([, preference]) => preference.storageKey === event.key);
    if (!entry) return;
    applyLocalPreference(entry[0], event.newValue === null ? entry[1].defaultValue : event.newValue === "true");
  });

  window.profLocalPreferences = Object.freeze({
    get: (name) => Boolean(state[name]),
    set: (name, enabled) => applyLocalPreference(name, enabled, { persist: true }),
    showCategory: (category) => showSettingsCategory(category, { persist: true }),
    reset: resetLocalPreferences
  });
})();
