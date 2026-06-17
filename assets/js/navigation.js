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

(function loadModulesTableStyles() {
  if (!document.body?.classList.contains("modules-page")) return;
  if (document.querySelector("link[data-modules-table-colors]")) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "../assets/css/prof-modules-eleves.css?v=1001";
  link.dataset.modulesTableColors = "true";
  document.head.appendChild(link);
})();
