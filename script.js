function openPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  document.getElementById("loader").classList.remove("hide");

  setTimeout(() => {
    document.getElementById("loader").classList.add("hide");
  }, 500);
}

window.onload = () => {
  setTimeout(() => {
    document.getElementById("loader").classList.add("hide");
  }, 1200);
};
