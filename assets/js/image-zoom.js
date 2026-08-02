document.addEventListener("DOMContentLoaded", () => {
  const vehicleImage = document.getElementById("vehicleImage");
  const photoCard = document.querySelector(".photo-card");

  if (!vehicleImage || !photoCard) return;

  const zoomBtn = document.createElement("button");
  zoomBtn.type = "button";
  zoomBtn.className = "image-zoom-btn";
  zoomBtn.innerHTML = "⌕";
  zoomBtn.title = "Agrandir l'image";

  photoCard.appendChild(zoomBtn);

  const overlay = document.createElement("div");
  overlay.className = "image-zoom-overlay";
  overlay.hidden = true;

  overlay.innerHTML = `
    <button type="button" class="image-zoom-close" title="Fermer">×</button>

    <div class="image-zoom-box">
      <img id="zoomedVehicleImage" src="" alt="Image agrandie">
    </div>
  `;

  document.body.appendChild(overlay);

  const zoomedImage = document.getElementById("zoomedVehicleImage");
  const closeBtn = overlay.querySelector(".image-zoom-close");

  function openZoom() {
    zoomedImage.src = vehicleImage.src;
    zoomedImage.alt = vehicleImage.alt || "Image agrandie";

    overlay.hidden = false;

    requestAnimationFrame(() => {
      overlay.classList.add("active");
    });

    document.body.classList.add("zoom-open");
  }

  function closeZoom() {
    overlay.classList.remove("active");
    document.body.classList.remove("zoom-open");

    setTimeout(() => {
      overlay.hidden = true;
      zoomedImage.src = "";
    }, 180);
  }

  zoomBtn.addEventListener("click", openZoom);

  closeBtn.addEventListener("click", closeZoom);

  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      closeZoom();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !overlay.hidden) {
      closeZoom();
    }
  });
});

