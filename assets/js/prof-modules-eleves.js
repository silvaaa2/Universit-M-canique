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
  if (!protectedContent || protectedContent.hidden) return;

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

function loadModulesExtras() {
  if (extrasLoading) return extrasLoading;

  extrasLoading = (async () => {
    const immediateResults = await Promise.allSettled([
      import("./prof-modules-alerts.js?v=1014"),
      import("./prof-modules-archives.js?v=1003"),
      import("./prof-modules-clipboard.js?v=8")
    ]);

    const immediateLabels = ["Avertos modules", "Archives modules", "Pointage automatique"];
    immediateResults.forEach((result, index) => {
      if (result.status === "rejected") {
        reportOptionalModuleError(immediateLabels[index], result.reason);
      }
    });

    try {
      await import("./prof-modules-sheets-sync.js?v=1006");
      await import("./prof-modules-sheets-sync-exact.js?v=1007");
    } catch (error) {
      reportOptionalModuleError("Synchronisation Sheets", error);
    }

    window.setTimeout(() => {
      Promise.allSettled([
        import("./prof-notifications-v2.js?v=7"),
        import("./prof-presence.js?v=5")
      ]).then(results => {
        const labels = ["Notifications", "Présence professeur"];
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            reportOptionalModuleError(labels[index], result.reason);
          }
        });
      });
    }, 1200);
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

import "./prof-modules-eleves-safe.js?v=1019";
