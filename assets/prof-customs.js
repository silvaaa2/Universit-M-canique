function openCustomAnswer(custom) {
  closeCustomAnswers();

  const panels = {
    dukes: document.getElementById("dukesAnswer"),
    sentinel: document.getElementById("sentinelAnswer"),
    rumina: document.getElementById("ruminaAnswer")
  };

  const selectedPanel = panels[custom];

  if (!selectedPanel) {
    console.error("Panel introuvable :", custom);
    return;
  }

  selectedPanel.classList.add("show");

  setTimeout(() => {
    selectedPanel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, 100);
}

function closeCustomAnswers() {
  document.querySelectorAll(".custom-answer-panel").forEach(panel => {
    panel.classList.remove("show");
  });
}
