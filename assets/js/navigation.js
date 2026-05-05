function goPage(url) {
  document.getElementById("loader").style.display = "block";

  setTimeout(() => {
    window.location.href = url;
  }, 400);
}
