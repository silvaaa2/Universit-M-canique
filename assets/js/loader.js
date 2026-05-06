window.addEventListener("load", () => {
  const loader = document.getElementById("loader");

  if (!loader) return;

  setTimeout(() => {
    loader.classList.add("hide");

    setTimeout(() => {
      loader.style.display = "none";
    }, 450);
  }, 450);
});
