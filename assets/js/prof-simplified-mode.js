(() => {
  "use strict";

  const STORAGE_KEY = "profSimplifiedMode";
  const TEXT_SIZE_STORAGE_KEY = "profSimplifiedTextSize";
  const ROOT_CLASS = "prof-simplified-mode";
  const TEXT_SIZES = new Set(["standard", "large", "xlarge"]);
  const root = document.documentElement;
  let activeSpeechButton = null;
  let speechStatus = null;

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

  function readTextSizePreference() {
    try {
      const savedSize = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
      return TEXT_SIZES.has(savedSize) ? savedSize : "standard";
    } catch (error) {
      console.warn("Taille de texte locale indisponible :", error);
      return "standard";
    }
  }

  function getTextSize() {
    return TEXT_SIZES.has(root.dataset.simplifiedTextSize)
      ? root.dataset.simplifiedTextSize
      : "standard";
  }

  function getTextSizeLabel(size) {
    return {
      standard: "Standard",
      large: "Grand",
      xlarge: "Très grand"
    }[size] || "Standard";
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

    const textSize = getTextSize();

    document.querySelectorAll("[data-simplified-text-size]").forEach((control) => {
      const isActive = control.dataset.simplifiedTextSize === textSize;
      control.classList.toggle("active", isActive);
      control.setAttribute("aria-pressed", String(isActive));
    });

    document.querySelectorAll("[data-simplified-text-size-status]").forEach((status) => {
      status.textContent = enabled
        ? `Taille ${getTextSizeLabel(textSize).toLowerCase()} active.`
        : `Taille ${getTextSizeLabel(textSize).toLowerCase()} enregistrée pour le Mode Simplifié.`;
    });
  }

  function applyTextSize(size, { persist = false, notify = true } = {}) {
    const safeSize = TEXT_SIZES.has(size) ? size : "standard";
    root.dataset.simplifiedTextSize = safeSize;

    if (persist) {
      try {
        window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, safeSize);
      } catch (error) {
        console.warn("Impossible d’enregistrer la taille du texte :", error);
      }
    }

    syncControls();

    if (notify) {
      window.dispatchEvent(new CustomEvent("prof:simplified-text-size-change", {
        detail: { size: safeSize, localOnly: true }
      }));
    }
  }

  function applyPreference(enabled, { persist = false, notify = true } = {}) {
    const safeEnabled = Boolean(enabled);
    root.classList.toggle(ROOT_CLASS, safeEnabled);
    root.dataset.simplifiedMode = safeEnabled ? "on" : "off";

    if (!safeEnabled) stopSpeech();

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

  applyTextSize(readTextSizePreference(), { notify: false });
  applyPreference(readPreference(), { notify: false });

  document.addEventListener("click", (event) => {
    const textSizeControl = event.target instanceof Element
      ? event.target.closest("[data-simplified-text-size]")
      : null;

    if (textSizeControl instanceof HTMLElement) {
      event.preventDefault();
      applyTextSize(textSizeControl.dataset.simplifiedTextSize, { persist: true });
      return;
    }

    const speechControl = event.target instanceof Element
      ? event.target.closest("[data-simplified-speak]")
      : null;

    if (speechControl instanceof HTMLButtonElement) {
      event.preventDefault();
      event.stopPropagation();
      toggleSpeech(speechControl);
      return;
    }

    const control = event.target instanceof Element
      ? event.target.closest("[data-simplified-toggle]")
      : null;

    if (!(control instanceof HTMLElement)) return;
    event.preventDefault();
    applyPreference(!isEnabled(), { persist: true });
  });

  function supportsSpeech() {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  function setSpeechStatus(message) {
    if (!speechStatus) {
      speechStatus = document.createElement("p");
      speechStatus.className = "prof-simplified-speech-status";
      speechStatus.setAttribute("aria-live", "polite");
      document.body.append(speechStatus);
    }

    speechStatus.textContent = message;
  }

  function resetSpeechButton(button) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.classList.remove("is-speaking");
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = '<span aria-hidden="true">▶</span> Lire';
  }

  function stopSpeech(message = "Lecture arrêtée.") {
    if (!supportsSpeech()) return;
    window.speechSynthesis.cancel();
    resetSpeechButton(activeSpeechButton);
    activeSpeechButton = null;
    if (speechStatus && message) setSpeechStatus(message);
  }

  function getFrenchVoice() {
    return window.speechSynthesis
      .getVoices()
      .find((voice) => String(voice.lang || "").toLowerCase().startsWith("fr")) || null;
  }

  function toggleSpeech(button) {
    if (!supportsSpeech() || !isEnabled()) return;

    if (activeSpeechButton === button && window.speechSynthesis.speaking) {
      stopSpeech();
      return;
    }

    stopSpeech("");

    const text = String(button.dataset.simplifiedSpeechText || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2600);

    if (!text) {
      setSpeechStatus("Aucun texte à lire.");
      return;
    }

    const utterance = new window.SpeechSynthesisUtterance(text);
    const frenchVoice = getFrenchVoice();

    utterance.lang = frenchVoice?.lang || "fr-FR";
    utterance.rate = 0.88;
    utterance.pitch = 1;
    if (frenchVoice) utterance.voice = frenchVoice;

    activeSpeechButton = button;
    button.classList.add("is-speaking");
    button.setAttribute("aria-pressed", "true");
    button.innerHTML = '<span aria-hidden="true">■</span> Arrêter';
    setSpeechStatus("Lecture en cours.");

    utterance.onend = () => {
      if (activeSpeechButton !== button) return;
      resetSpeechButton(button);
      activeSpeechButton = null;
      setSpeechStatus("Lecture terminée.");
    };

    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") return;
      if (activeSpeechButton === button) {
        resetSpeechButton(button);
        activeSpeechButton = null;
      }
      setSpeechStatus("La lecture vocale n’est pas disponible pour ce texte.");
    };

    window.speechSynthesis.speak(utterance);
  }

  function getSpeechText(container) {
    const content = container.querySelector(".exam-line-content") || container;
    const label = content.querySelector(":scope > span")?.textContent?.trim() || "Réponse";
    const valueNode = content.querySelector(":scope > strong, :scope > a");
    const value = valueNode?.textContent?.trim() || "";
    const safeValue = value === "Ouvrir le lien" ? "Lien disponible" : value;
    return `${label}. ${safeValue}`.trim();
  }

  function enhanceSpeechContent(scope = document) {
    if (!supportsSpeech()) return;

    scope.querySelectorAll(".exam-line, .student-answer-field:not(.student-link-card)").forEach((container) => {
      if (!(container instanceof HTMLElement) || container.querySelector("[data-simplified-speak]")) return;

      const speechText = getSpeechText(container);
      if (!speechText) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "prof-simplified-speak-btn";
      button.dataset.simplifiedSpeak = "true";
      button.dataset.simplifiedSpeechText = speechText;
      button.setAttribute("aria-label", `Lire : ${speechText.slice(0, 120)}`);
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = '<span aria-hidden="true">▶</span> Lire';

      const target = container.querySelector(".exam-line-content") || container;
      target.append(button);
    });
  }

  function initSpeechEnhancement() {
    enhanceSpeechContent();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(".exam-line, .student-answer-field:not(.student-link-card)")) {
            enhanceSpeechContent(node.parentElement || document);
          } else {
            enhanceSpeechContent(node);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    syncControls();
    initSpeechEnhancement();
  }, { once: true });

  window.addEventListener("pagehide", () => stopSpeech(""));

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      applyPreference(event.newValue === "true", { notify: true });
    }

    if (event.key === TEXT_SIZE_STORAGE_KEY) {
      applyTextSize(event.newValue, { notify: true });
    }
  });

  window.profSimplifiedMode = Object.freeze({
    storageKey: STORAGE_KEY,
    textSizeStorageKey: TEXT_SIZE_STORAGE_KEY,
    isEnabled,
    getTextSize,
    set: (enabled) => applyPreference(enabled, { persist: true }),
    setTextSize: (size) => applyTextSize(size, { persist: true }),
    sync: syncControls
  });
})();
