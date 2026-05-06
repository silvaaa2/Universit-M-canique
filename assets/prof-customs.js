function openCustomAnswer(custom) {
  closeCustomAnswers();

  const panels = {
    dukes: document.getElementById("dukesAnswer"),
    sentinel: document.getElementById("sentinelAnswer"),
    rumina: document.getElementById("ruminaAnswer")
  };

  if (panels[custom]) {
    panels[custom].classList.add("show");

    setTimeout(() => {
      panels[custom].scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 100);
  }
}

function closeCustomAnswers() {
  document.querySelectorAll(".custom-answer-panel").forEach(panel => {
    panel.classList.remove("show");
  });
}
