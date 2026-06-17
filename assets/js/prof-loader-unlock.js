(function() {
  function isDashboardVisible() {
    const dashboard = document.getElementById("profDashboard");
    if (!dashboard || dashboard.hidden) return false;

    return window.getComputedStyle(dashboard).display !== "none";
  }

  function hideElementCompletely(element) {
    if (!element) return;

    element.classList.add("hide");
    element.classList.remove("active");
    element.hidden = true;
    element.style.opacity = "0";
    element.style.visibility = "hidden";
    element.style.pointerEvents = "none";
    element.style.display = "none";
  }

  function unlockProfPage() {
    if (!isDashboardVisible()) return;

    hideElementCompletely(document.getElementById("loader"));
    hideElementCompletely(document.getElementById("loginTransition"));

    const loginSection = document.getElementById("loginSection");
    if (loginSection) {
      loginSection.classList.remove("leaving");
      loginSection.hidden = true;
      loginSection.style.display = "none";
    }

    const loginButton = document.getElementById("loginBtn");
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.classList.remove("loading");
    }
  }

  function startUnlocker() {
    unlockProfPage();

    const observer = new MutationObserver(unlockProfPage);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "class", "style"]
    });

    setInterval(unlockProfPage, 300);
    window.addEventListener("pageshow", unlockProfPage);
    window.addEventListener("focus", unlockProfPage);
  }

  if (document.body) {
    startUnlocker();
  } else {
    document.addEventListener("DOMContentLoaded", startUnlocker, { once: true });
  }
})();