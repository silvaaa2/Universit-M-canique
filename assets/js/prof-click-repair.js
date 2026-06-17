(function() {
  function dashboardIsOpen() {
    const dashboard = document.getElementById("profDashboard");
    return Boolean(dashboard && !dashboard.hidden && window.getComputedStyle(dashboard).display !== "none");
  }

  function hideBlockingLayer(element) {
    if (!element) return;

    element.classList.add("hide");
    element.classList.remove("active");
    element.hidden = true;
    element.style.opacity = "0";
    element.style.visibility = "hidden";
    element.style.pointerEvents = "none";
    element.style.display = "none";
  }

  function clearClickBlockers() {
    if (!dashboardIsOpen()) return;

    hideBlockingLayer(document.getElementById("loader"));
    hideBlockingLayer(document.getElementById("loginTransition"));

    document.querySelectorAll(".prof-admin-modal-overlay[hidden], .student-modules-modal-overlay[hidden]").forEach(element => {
      element.style.pointerEvents = "none";
      element.style.display = "none";
    });
  }

  function injectClickRepairStyles() {
    if (document.getElementById("profClickRepairStyles")) return;

    const style = document.createElement("style");
    style.id = "profClickRepairStyles";
    style.textContent = `
      .prof-panel-btn {
        text-decoration: none !important;
      }

      #loader.hide,
      #loginTransition.hide,
      #loginTransition[hidden] {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        display: none !important;
      }

      .prof-admin-message-banner.prof-admin-message-toast {
        pointer-events: none !important;
      }

      .prof-admin-message-banner.prof-admin-message-toast .prof-admin-toast-close {
        pointer-events: auto !important;
      }
    `;

    document.head.appendChild(style);
  }

  function bindDirectNavigation() {
    document.querySelectorAll("[data-prof-nav]").forEach(element => {
      if (element.dataset.directNavBound === "true") return;
      element.dataset.directNavBound = "true";

      element.addEventListener("click", event => {
        const url = element.dataset.profNav;
        if (!url) return;

        event.preventDefault();
        clearClickBlockers();
        window.location.assign(url);
      });
    });
  }

  function bindCorrectionsFallback() {
    const button = document.getElementById("openCorrectionsBtn");
    if (!button || button.dataset.repairBound === "true") return;

    button.dataset.repairBound = "true";
    button.addEventListener("click", () => {
      clearClickBlockers();

      setTimeout(() => {
        const inlineCorrections = document.getElementById("inlineCorrections");
        if (!inlineCorrections || !inlineCorrections.hidden) return;

        const chooser = document.getElementById("inlineCorrectionChooser");
        const detail = document.getElementById("inlineCorrectionDetail");

        inlineCorrections.hidden = false;
        chooser.hidden = false;
        detail.hidden = true;

        requestAnimationFrame(() => {
          inlineCorrections.classList.add("active");
          inlineCorrections.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }, 80);
    });
  }

  function tick() {
    injectClickRepairStyles();
    clearClickBlockers();
    bindDirectNavigation();
    bindCorrectionsFallback();
  }

  function start() {
    tick();

    const observer = new MutationObserver(tick);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "class", "style"]
    });

    document.addEventListener("pointerdown", clearClickBlockers, true);
    document.addEventListener("click", clearClickBlockers, true);
    setInterval(tick, 500);
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();