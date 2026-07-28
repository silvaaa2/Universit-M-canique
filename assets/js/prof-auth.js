if (!window.__profAuthStarted) {
  import("./prof-auth-static-secure.js?v=1009").catch(error => {
    console.error("Chargement auth prof moderne impossible :", error);
  });
} else {
  console.info("Ancien auth prof ignoré : auth moderne déjà active.");
}
