window.addEventListener("load", () => {
  const loader = document.getElementById("loader");

  if (!loader) return;

  loader.classList.remove("hide");
  loader.style.display = "grid";
  loader.style.opacity = "1";
  loader.style.visibility = "visible";

  setTimeout(() => {
    loader.classList.add("hide");

    setTimeout(() => {
      loader.style.display = "none";
    }, 450);
  }, 450);
});

window.addEventListener("beforeunload", () => {
  const loader = document.getElementById("loader");

  if (!loader) return;

  loader.classList.add("hide");
  loader.style.opacity = "0";
  loader.style.visibility = "hidden";
  loader.style.pointerEvents = "none";
  loader.style.display = "none";
});
