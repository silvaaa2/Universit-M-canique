document.addEventListener("DOMContentLoaded", () => {
  const openCorrectionsBtn = document.getElementById("openCorrectionsBtn");
  const closeCorrectionsBtn = document.getElementById("closeCorrectionsBtn");
  const correctionsInterface = document.getElementById("correctionsInterface");

  if (!openCorrectionsBtn) {
    console.error("Bouton Corrigés introuvable : #openCorrectionsBtn");
    return;
  }

  if (!correctionsInterface) {
    console.error("Interface corrigés introuvable : #correctionsInterface");
    return;
  }

  openCorrectionsBtn.addEventListener("click", () => {
    correctionsInterface.hidden = false;

    requestAnimationFrame(() => {
      correctionsInterface.classList.add("active");
    });

    setTimeout(() => {
      correctionsInterface.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 120);
  });

  if (closeCorrectionsBtn) {
    closeCorrectionsBtn.addEventListener("click", () => {
      correctionsInterface.classList.remove("active");

      setTimeout(() => {
        correctionsInterface.hidden = true;
      }, 300);
    });
  }
});
