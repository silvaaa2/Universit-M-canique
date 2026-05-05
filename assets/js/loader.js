const loader = document.getElementById("loader");
const loaderText = document.getElementById("loaderText");

window.addEventListener("load", () => {
  setTimeout(() => {
    loader.classList.add("hide");
  }, 1000);
});
