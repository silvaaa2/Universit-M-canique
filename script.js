const loader = document.getElementById("loader");
const loaderText = document.getElementById("loaderText");

const messages = [
  "Initialisation du campus mécanique...",
  "Chargement des modules...",
  "Connexion au laboratoire custom...",
  "Interface prête."
];

let currentMessage = 0;

function showLoader(text = "Chargement du module...") {
  loaderText.textContent = text;
  loader.classList.remove("hide");

  setTimeout(() => {
    loader.classList.add("hide");
  }, 750);
}

function openPage(pageId) {
  showLoader("Ouverture du module...");

  setTimeout(() => {
    document.querySelectorAll(".page").forEach(page => {
      page.classList.remove("active");
    });

    document.getElementById(pageId).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 350);
}

window.addEventListener("load", () => {
  const timer = setInterval(() => {
    currentMessage++;
    if (currentMessage < messages.length) {
      loaderText.textContent = messages[currentMessage];
    }
  }, 350);

  setTimeout(() => {
    clearInterval(timer);
    loader.classList.add("hide");
  }, 1600);
});
