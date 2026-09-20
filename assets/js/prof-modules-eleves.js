const modulesStyle = document.querySelector("link[data-modules-table-colors]");

if (modulesStyle) {
  modulesStyle.href = "../assets/css/prof-modules-eleves.css?v=1006";
} else {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "../assets/css/prof-modules-eleves.css?v=1006";
  link.dataset.modulesTableColors = "true";
  document.head.appendChild(link);
}

function keepModulesDashboardVisible() {
  const protectedContent = document.getElementById("protectedContent");
  if (!protectedContent) return;

  protectedContent.hidden = false;
  if (protectedContent.style.display !== "block") {
    protectedContent.style.display = "block";
  }
  protectedContent.classList.add("dashboard-visible");
}

function installModulesDashboardVisibilityGuard() {
  const protectedContent = document.getElementById("protectedContent");
  if (!protectedContent) return;

  keepModulesDashboardVisible();
  const observer = new MutationObserver(keepModulesDashboardVisible);
  observer.observe(protectedContent, {
    attributes: true,
    attributeFilter: ["hidden", "class", "style"]
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installModulesDashboardVisibilityGuard, { once: true });
} else {
  installModulesDashboardVisibilityGuard();
}
window.addEventListener("profIdentityReady", keepModulesDashboardVisible);

import "./prof-modules-eleves-safe.js?v=1023";
import "./prof-modules-alerts.js?v=1015";
