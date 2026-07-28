const modulesStyle = document.querySelector("link[data-modules-table-colors]");

if (modulesStyle) {
  modulesStyle.href = "../assets/css/prof-modules-eleves.css?v=1003";
} else {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "../assets/css/prof-modules-eleves.css?v=1003";
  link.dataset.modulesTableColors = "true";
  document.head.appendChild(link);
}

import "./prof-modules-eleves-shared.js?v=1001";
import "./prof-modules-alerts.js?v=1001";
