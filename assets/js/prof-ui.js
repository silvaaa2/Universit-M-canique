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

  function openCorrectionsInterface() {
    correctionsInterface.hidden = false;
    document.body.classList.add("modal-open");

    requestAnimationFrame(() => {
      correctionsInterface.classList.add("active");
    });
  }

  function closeCorrectionsInterface() {
    correctionsInterface.classList.remove("active");
    document.body.classList.remove("modal-open");

    setTimeout(() => {
      correctionsInterface.hidden = true;
    }, 300);
  }

  openCorrectionsBtn.addEventListener("click", openCorrectionsInterface);

  if (closeCorrectionsBtn) {
    closeCorrectionsBtn.addEventListener("click", closeCorrectionsInterface);
  }

  correctionsInterface.addEventListener("click", (e) => {
    if (e.target === correctionsInterface) {
      closeCorrectionsInterface();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !correctionsInterface.hidden) {
      closeCorrectionsInterface();
    }
  });
});
