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

let extrasLoading = null;

function wait(delay) {
  return new Promise(resolve => window.setTimeout(resolve, delay));
}

async function importOptional(path, label, delay = 0) {
  if (delay) await wait(delay);
  try {
    await import(path);
  } catch (error) {
    console.warn(`${label} indisponible :`, error);
  }
}

function loadModulesExtras() {
  if (extrasLoading) return extrasLoading;

  // Le tableau critique est déjà affiché. Les outils secondaires arrivent
  // ensuite un par un pour ne plus saturer Firebase et Google Sheets au login.
  extrasLoading = (async () => {
    await importOptional("./prof-modules-clipboard.js?v=10", "Pointage automatique", 100);
    await importOptional("./prof-modules-alerts.js?v=1016", "Avertissements modules", 250);
    await importOptional("./prof-modules-archives.js?v=1005", "Archives modules", 250);
    await importOptional("./prof-modules-sheets-sync.js?v=1009", "Synchronisation Sheets", 300);
    await importOptional("./prof-modules-sheets-sync-exact.js?v=1010", "Synchronisation Sheets exacte", 150);
    await importOptional("./prof-presence.js?v=7", "Présence professeur", 1200);
    await importOptional("./prof-notifications-v2.js?v=9", "Pastilles de notifications", 150);
  })();

  return extrasLoading;
}

function scheduleModulesExtras() {
  const run = () => void loadModulesExtras();
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 700 });
  } else {
    window.setTimeout(run, 150);
  }
}

window.addEventListener("profModulesReady", scheduleModulesExtras, { once: true });
if (window.profModulesCriticalReady) scheduleModulesExtras();

import "./prof-modules-eleves-safe.js?v=1030";
