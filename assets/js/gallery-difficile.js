const images = [
  "../Images/annis-rumina-1.png",
  "../Images/annis-rumina-2.png",
  "../Images/annis-rumina-3.png",
  "../Images/annis-rumina-4.png"
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

  vehicleImage.classList.add("fade-out");

  setTimeout(() => {
    vehicleImage.src = images[currentIndex];
    currentImage.textContent = currentIndex + 1;
    vehicleImage.classList.remove("fade-out");
  }, 180);
}
