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
