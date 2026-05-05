const loader = document.getElementById("loader");
const loaderText = document.getElementById("loaderText");

function openPage(id) {
  loaderText.textContent = "Ouverture de l’espace...";
  loader.classList.remove("hide");

  setTimeout(() => {
    document.querySelectorAll(".page").forEach(page => {
      page.classList.remove("active");
    });

    document.getElementById(id).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 250);

  setTimeout(() => {
    loader.classList.add("hide");
  }, 700);
}

window.addEventListener("load", () => {
  setTimeout(() => {
    loader.classList.add("hide");
  }, 1200);
});
