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

(function loadModulesPageExtras() {
  if (!document.body?.classList.contains("modules-page")) return;

  if (!document.querySelector("link[data-modules-table-colors]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "../assets/css/prof-modules-eleves.css?v=1001";
    link.dataset.modulesTableColors = "true";
    document.head.appendChild(link);
  }

  import("./prof-modules-archives.js?v=1001").catch(error => {
    console.warn("Archives modules indisponibles :", error);
  });
})();
