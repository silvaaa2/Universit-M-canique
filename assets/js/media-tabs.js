function openMediaPanel(panelName) {
  const photosPanel = document.getElementById("photosPanel");
  const meteoPanel = document.getElementById("meteoPanel");
  const tabs = document.querySelectorAll(".media-tab");

  photosPanel.classList.remove("active");
  meteoPanel.classList.remove("active");

  tabs.forEach(tab => tab.classList.remove("active"));

  if (panelName === "photos") {
    photosPanel.classList.add("active");
    tabs[0].classList.add("active");
  }

  if (panelName === "meteo") {
    meteoPanel.classList.add("active");
    tabs[1].classList.add("active");
  }
}

function closeMediaPanels() {
  const photosPanel = document.getElementById("photosPanel");
  const meteoPanel = document.getElementById("meteoPanel");
  const tabs = document.querySelectorAll(".media-tab");

  photosPanel.classList.remove("active");
  meteoPanel.classList.remove("active");

  tabs.forEach(tab => tab.classList.remove("active"));
}

