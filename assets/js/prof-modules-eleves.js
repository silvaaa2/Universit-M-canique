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

let extrasLoading = null;

function reportOptionalModuleError(label, error) {
  console.warn(`${label} indisponible :`, error);
}

function waitForOptionalModule(delay) {
  return new Promise(resolve => window.setTimeout(resolve, delay));
}

async function importOptionalModule(path, label, delay = 0) {
  if (delay) await waitForOptionalModule(delay);
  if (document.visibilityState === "hidden") return;

  try {
    await import(path);
  } catch (error) {
    reportOptionalModuleError(label, error);
  }
}

function loadModulesExtras() {
  if (extrasLoading) return extrasLoading;

  extrasLoading = (async () => {
    await importOptionalModule("./prof-modules-clipboard.js?v=8", "Pointage automatique", 250);
    await importOptionalModule("./prof-modules-alerts.js?v=1014", "Avertos modules", 450);
    await importOptionalModule("./prof-modules-archives.js?v=1003", "Archives modules", 550);
    await importOptionalModule("./prof-modules-sheets-sync.js?v=1006", "Synchronisation Sheets", 650);
    await importOptionalModule("./prof-modules-sheets-sync-exact.js?v=1007", "Synchronisation Sheets exacte", 350);
    await importOptionalModule("./prof-notifications-v2.js?v=7", "Notifications", 700);
    await importOptionalModule("./prof-presence.js?v=5", "Présence professeur", 350);
  })();

  return extrasLoading;
}

function scheduleModulesExtras() {
  const run = () => void loadModulesExtras();

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 900 });
  } else {
    window.setTimeout(run, 180);
  }
}

window.addEventListener("profModulesReady", scheduleModulesExtras, { once: true });
if (window.profModulesCriticalReady) scheduleModulesExtras();

import "./prof-modules-eleves-safe.js?v=1022";
