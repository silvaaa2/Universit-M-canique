const modulesStyle = document.querySelector("link[data-modules-table-colors]");

if (modulesStyle) {
  modulesStyle.href = "../assets/css/prof-modules-eleves.css?v=1005";
} else {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "../assets/css/prof-modules-eleves.css?v=1005";
  link.dataset.modulesTableColors = "true";
  document.head.appendChild(link);
}

function keepModulesDashboardVisible() {
  const protectedContent = document.getElementById("protectedContent");
  if (!protectedContent || protectedContent.hidden) return;

  protectedContent.style.display = "block";
  protectedContent.classList.add("dashboard-visible");
}

window.setInterval(keepModulesDashboardVisible, 250);
requestAnimationFrame(keepModulesDashboardVisible);

import "./prof-modules-eleves-safe.js?v=1009";
import "./prof-modules-alerts.js?v=1010";
