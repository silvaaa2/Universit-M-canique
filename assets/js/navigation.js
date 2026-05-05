function goPage(url) {
  loaderText.textContent = "Ouverture de l’espace...";
  loader.classList.remove("hide");

  setTimeout(() => {
    window.location.href = url;
  }, 650);
}
