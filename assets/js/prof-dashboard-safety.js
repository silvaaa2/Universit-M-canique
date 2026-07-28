(() => {
  const DASHBOARD_SELECTOR = "#profDashboard";
  const LOGIN_SELECTOR = "#loginSection";
  const TRANSITION_SELECTOR = "#loginTransition";

  let safetyLoop = null;

  function getDashboard() {
    return document.querySelector(DASHBOARD_SELECTOR);
  }

  function isDashboardVisible() {
    const dashboard = getDashboard();
    if (!dashboard || dashboard.hidden) return false;

    const style = window.getComputedStyle(dashboard);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function hideBlockingLoginLayers() {
    const transition = document.querySelector(TRANSITION_SELECTOR);
    if (transition) {
      transition.classList.remove("active", "hide");
      transition.hidden = true;
      transition.style.pointerEvents = "none";
      transition.style.visibility = "hidden";
      transition.style.opacity = "0";
      transition.style.display = "none";
    }

    const loader = document.getElementById("loader");
    if (loader) {
      loader.classList.add("hide");
      loader.hidden = true;
      loader.style.pointerEvents = "none";
      loader.style.visibility = "hidden";
      loader.style.opacity = "0";
      loader.style.display = "none";
    }

    const login = document.querySelector(LOGIN_SELECTOR);
    if (login && isDashboardVisible()) {
      login.hidden = true;
      login.style.pointerEvents = "none";
      login.style.display = "none";
    }
  }

  function unlockDashboard() {
    const dashboard = getDashboard();
    if (!dashboard || dashboard.hidden) return;

    hideBlockingLoginLayers();

    dashboard.style.pointerEvents = "auto";
    dashboard.classList.add("dashboard-visible");

    dashboard.querySelectorAll("button, a").forEach(control => {
      if (control.dataset.keepDisabled === "true") return;
      control.disabled = false;
      control.style.pointerEvents = "";
    });
  }

  function openCorrectionsFallback() {
    const inlineCorrections = document.getElementById("inlineCorrections");
    const chooser = document.getElementById("inlineCorrectionChooser");
    const detail = document.getElementById("inlineCorrectionDetail");

    if (!inlineCorrections) return;

    inlineCorrections.hidden = false;
    inlineCorrections.classList.add("active");

    if (chooser) chooser.hidden = false;
    if (detail) detail.hidden = true;

    window.setTimeout(() => {
      inlineCorrections.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  function openCustomAccessFallback() {
    if (typeof window.openCustomAccessModal === "function") {
      window.openCustomAccessModal();
      return;
    }

    window.dispatchEvent(new Event("openProfCustomAccess"));
  }

  function handleDashboardClick(event) {
    if (!isDashboardVisible()) return;

    const control = event.target?.closest?.("button, a");
    const dashboard = getDashboard();

    if (!control || !dashboard?.contains(control)) return;

    unlockDashboard();

    if (control.id === "openCorrectionsBtn") {
      openCorrectionsFallback();
      return;
    }

    if (control.id === "profCustomAccessBtn") {
      event.preventDefault();
      openCustomAccessFallback();
      return;
    }

    if (control.id === "profModulesElevesBtn") {
      event.preventDefault();
      window.location.href = "prof-modules-eleves.html";
      return;
    }

    if (control.id === "profAdminBtn" && typeof window.openProfAdminPanel === "function") {
      event.preventDefault();
      window.openProfAdminPanel();
      return;
    }

    const inlineTarget = control.getAttribute("onclick") || "";

    if (inlineTarget.includes("prof-rp-7x92q")) {
      event.preventDefault();
      window.location.href = "prof-rp-7x92q.html";
      return;
    }

    if (inlineTarget.includes("prof-exam-4x91q")) {
      event.preventDefault();
      window.location.href = "prof-exam-4x91q.html";
    }
  }

  function startSafetyLoop() {
    if (safetyLoop) return;

    safetyLoop = window.setInterval(() => {
      if (isDashboardVisible()) unlockDashboard();
    }, 400);
  }

  window.openProfCorrectionsPanel = openCorrectionsFallback;
  window.unlockProfDashboard = unlockDashboard;

  document.addEventListener("click", handleDashboardClick, true);
  document.addEventListener("pointerdown", () => {
    if (isDashboardVisible()) unlockDashboard();
  }, true);
  window.addEventListener("profFirebaseReady", startSafetyLoop);
  document.addEventListener("DOMContentLoaded", startSafetyLoop, { once: true });
  startSafetyLoop();
})();