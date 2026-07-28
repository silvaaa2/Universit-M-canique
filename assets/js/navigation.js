window.goPage = function (url) {
  const loader = document.getElementById("loader");

  if (loader) {
    loader.classList.add("hide");
    loader.style.opacity = "0";
    loader.style.visibility = "hidden";
    loader.style.pointerEvents = "none";
    loader.style.display = "none";
  }

  window.location.assign(url);
};

(function applyUpdatedBrandName() {
  const previousName = "Module 4 - Mécanique";
  const nextName = "Mécanique - Université";

  if (document.title.includes("Module 4")) {
    document.title = document.title.replaceAll("Module 4", nextName);
  }

  document.querySelectorAll("span, p, h1, h2, h3").forEach(element => {
    if (element.textContent.trim() === previousName) {
      element.textContent = nextName;
    }
  });

  document.querySelectorAll('img[alt="Logo Module 4"]').forEach(image => {
    image.alt = "Logo Mécanique - Université";
  });
})();

(function loadModulesPageExtras() {
  if (!document.body?.classList.contains("modules-page")) return;

  if (!document.querySelector("link[data-modules-table-colors]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "../assets/css/prof-modules-eleves.css?v=1003";
    link.dataset.modulesTableColors = "true";
    document.head.appendChild(link);
  }

  import("./prof-modules-archives.js?v=1001").catch(error => {
    console.warn("Archives modules indisponibles :", error);
  });

  import("./prof-modules-alerts.js?v=1001").catch(error => {
    console.warn("Avertos modules indisponibles :", error);
  });
})();
