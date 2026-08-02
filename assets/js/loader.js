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
    }, 550);
  }, 700);
});

window.addEventListener("beforeunload", () => {
  const loader = document.getElementById("loader");

  if (!loader) return;

  loader.classList.remove("hide");
  loader.style.display = "grid";
  loader.style.opacity = "1";
  loader.style.visibility = "visible";
  loader.style.pointerEvents = "all";
});

