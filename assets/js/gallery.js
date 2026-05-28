const images = [
  "../Images/COTÉ SENTINEL.png",
  "../Images/COTÉ GAUCHE SENTINEL.png",
  "../Images/DEVANT SENTINEL.png",
  "../Images/DERRIÈRE SENTINEL.png",
  "../Images/FINAL SENTINEL.png"
];

let currentIndex = 0;

const vehicleImage = document.getElementById("vehicleImage");
const currentImage = document.getElementById("currentImage");
const totalImages = document.getElementById("totalImages");

if (totalImages) {
  totalImages.textContent = images.length;
}

function changeImage(direction) {
  currentIndex += direction;

  if (currentIndex < 0) {
    currentIndex = images.length - 1;
  }

  if (currentIndex >= images.length) {
    currentIndex = 0;
  }

  if (!vehicleImage) return;

  vehicleImage.classList.add("fade-out");

  setTimeout(() => {
    vehicleImage.src = images[currentIndex];

    if (currentImage) {
      currentImage.textContent = currentIndex + 1;
    }

    vehicleImage.classList.remove("fade-out");
  }, 180);
}
