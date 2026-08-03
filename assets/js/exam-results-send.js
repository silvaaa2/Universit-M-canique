const EXAM_RESULTS_SEND_ENDPOINT = "/api/discord-exam-results";
const EXAM_RESULTS_ROLE_ID = "1199780299786158160";
const EXAM_APPROVED_ROLE_ID = "1169634939797524480";

function getExamStatusLabel(status) {
  switch (status) {
    case "approved":
      return "Approuvé";
    case "rejected":
      return "Refusé";
    default:
      return "En attente";
  }
}

function getAllExamCards() {
  return Array.from(document.querySelectorAll("[data-answer-card]"));
}

function getVisibleExamCards() {
  return getAllExamCards()
    .filter(card => !card.hidden && getComputedStyle(card).display !== "none");
}

function getExamCardsForResultsList() {
  const visibleCards = getVisibleExamCards();
  return visibleCards.length ? visibleCards : getAllExamCards();
}

function getExamResultsFromCards() {
  return getExamCardsForResultsList().map(card => {
    const name =
      card.dataset.studentName ||
      card.querySelector("h2")?.textContent?.trim() ||
      "Élève";

    const score =
      card.querySelector("[data-total-score-badge]")?.textContent
        ?.replace(/\s+/g, " ")
        .replace(/\s*\/\s*/g, "/")
        .trim() ||
      "0/50";

    const status = card.dataset.status || "pending";

    return {
      name,
      score,
      status,
      statusLabel: getExamStatusLabel(status)
    };
  });
}

function formatExamPreviewDate(value) {
  const parts = String(value || "").split("-");
  if (parts.length !== 3) return "Non renseignée";

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function buildExamPreviewMessage({ startDate, endDate, results }) {
  const studentList = results
    .map(result => `- ${result.name} : ${result.score} - ${result.statusLabel}`)
    .join("\n");

  return [
    `# Résultats du cursus ${formatExamPreviewDate(startDate)} au ${formatExamPreviewDate(endDate)} <@&${EXAM_RESULTS_ROLE_ID}> !`,
    "",
    studentList || "Aucun élève visible.",
    "",
    "",
    "Cordialement",
    "L'équipe des professeurs de Mécanique"
  ].join("\n");
}

function buildApprovedExamMessage(results) {
  const approvedList = results
    .filter(result => result.status === "approved")
    .map(result => `- ${result.name} : ${result.score}`)
    .join("\n");

  return [
    `Bonsoir <@&${EXAM_APPROVED_ROLE_ID}> voici la liste des approuvés pour ce cursus.`,
    "",
    approvedList || "Aucun élève approuvé détecté.",
    "",
    "Merci"
  ].join("\n");
}

async function sendExamListDiscordMessage(message, roleIds = []) {
  const user = window.currentProfUser;

  if (!user?.getIdToken) {
    throw new Error("Connexion professeur requise pour envoyer sur Discord.");
  }

  const idToken = await user.getIdToken(true);
  const response = await fetch(EXAM_RESULTS_SEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({
      content: message,
      allowed_mentions: {
        parse: [],
        roles: roleIds
      }
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Envoi Discord impossible (${response.status}). ${details}`);
  }
}

function updateExamListPreview(modal) {
  const preview = modal.querySelector("[data-exam-list-preview]");
  const count = modal.querySelector("[data-exam-list-count]");
  const startInput = modal.querySelector("[data-exam-list-start]");
  const endInput = modal.querySelector("[data-exam-list-end]");
  const results = getExamResultsFromCards();

  if (count) {
    count.textContent = results.length
      ? `${results.length} copie(s) détectée(s)`
      : "Aucune copie détectée";
  }

  if (preview) {
    preview.textContent = buildExamPreviewMessage({
      startDate: startInput?.value || "",
      endDate: endInput?.value || "",
      results
    });
  }
}

function closeExamListModal() {
  const modal = document.getElementById("examListModal");
  if (!modal) return;

  modal.classList.remove("active");
  modal.classList.add("closing");

  setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove("closing");
  }, 180);
}

function ensureExamListModal() {
  let modal = document.getElementById("examListModal");
  if (modal) return modal;

  document.body.insertAdjacentHTML("beforeend", `
    <div class="exam-list-modal" id="examListModal" hidden>
      <div class="exam-list-backdrop" data-exam-list-close></div>

      <section class="exam-list-card" role="dialog" aria-modal="true" aria-labelledby="examListTitle">
        <div class="exam-list-head">
          <div>
            <p class="kicker">Examens</p>
            <h2 id="examListTitle">Envoyer liste</h2>
          </div>

          <button type="button" class="exam-list-close" data-exam-list-close>
            ×
          </button>
        </div>

        <div class="exam-list-grid">
          <label>
            <span>Début du cursus</span>
            <input type="date" data-exam-list-start>
          </label>

          <label>
            <span>Fin du cursus</span>
            <input type="date" data-exam-list-end>
          </label>
        </div>

        <div class="exam-list-preview">
          <div class="exam-list-preview-head">
            <strong>Aperçu</strong>
            <span data-exam-list-count></span>
          </div>
          <pre data-exam-list-preview></pre>
        </div>

        <div class="exam-list-actions">
          <span data-exam-list-status></span>
          <button type="button" class="btn secondary" data-exam-list-close>Fermer</button>
          <button type="button" class="btn primary" data-exam-list-copy>Copier message</button>
          <button type="button" class="btn primary" data-exam-list-send>Envoyer Discord</button>
        </div>
      </section>
    </div>
  `);

  modal = document.getElementById("examListModal");

  modal.querySelectorAll("[data-exam-list-close]").forEach(button => {
    button.addEventListener("click", closeExamListModal);
  });

  modal.querySelectorAll("[data-exam-list-start], [data-exam-list-end]").forEach(input => {
    input.addEventListener("input", () => updateExamListPreview(modal));
  });

  modal.querySelector("[data-exam-list-copy]")?.addEventListener("click", async () => {
    const preview = modal.querySelector("[data-exam-list-preview]");
    const status = modal.querySelector("[data-exam-list-status]");
    const message = preview?.textContent || "";

    if (!message.trim()) {
      if (status) {
        status.textContent = "Aucun message à copier.";
        status.dataset.tone = "error";
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(message);
      if (status) {
        status.textContent = "Message copié.";
        status.dataset.tone = "ok";
      }
    } catch (error) {
      console.error("Erreur copie message examens :", error);
      alert(`Message à copier :\n${message}`);
    }
  });

  modal.querySelector("[data-exam-list-send]")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    const preview = modal.querySelector("[data-exam-list-preview]");
    const status = modal.querySelector("[data-exam-list-status]");
    const message = preview?.textContent || "";
    const approvedMessage = buildApprovedExamMessage(getExamResultsFromCards());

    if (!message.trim()) {
      if (status) {
        status.textContent = "Aucun message à envoyer.";
        status.dataset.tone = "error";
      }
      return;
    }

    button.disabled = true;
    const previousText = button.textContent;
    button.textContent = "Envoi...";

    if (status) {
      status.textContent = "Envoi Discord en cours...";
      status.dataset.tone = "";
    }

    try {
      await sendExamListDiscordMessage(message, [EXAM_RESULTS_ROLE_ID]);

      if (status) {
        status.textContent = "Liste complète envoyée, envoi des approuvés...";
        status.dataset.tone = "";
      }

      await sendExamListDiscordMessage(approvedMessage, [EXAM_APPROVED_ROLE_ID]);

      if (status) {
        status.textContent = "Messages envoyés.";
        status.dataset.tone = "ok";
      }
    } catch (error) {
      console.error("Erreur envoi Discord examens :", error);

      if (status) {
        status.textContent = "Envoi impossible, message copiable.";
        status.dataset.tone = "error";
      }

      alert(error.message || "Envoi Discord impossible.");
    } finally {
      button.disabled = false;
      button.textContent = previousText;
    }
  });

  return modal;
}

function openExamListModal() {
  const modal = ensureExamListModal();
  const today = new Date().toISOString().slice(0, 10);
  const startInput = modal.querySelector("[data-exam-list-start]");
  const endInput = modal.querySelector("[data-exam-list-end]");
  const status = modal.querySelector("[data-exam-list-status]");

  if (startInput && !startInput.value) startInput.value = today;
  if (endInput && !endInput.value) endInput.value = today;
  if (status) {
    status.textContent = "";
    status.dataset.tone = "";
  }

  updateExamListPreview(modal);

  modal.hidden = false;
  modal.classList.remove("closing");
  requestAnimationFrame(() => {
    modal.classList.add("active");
  });
}

function buildSimpleResultsListFromCards() {
  return getExamResultsFromCards()
    .map(result => `${result.name} ${result.score}`)
    .join("\n");
}

function refreshSendButton() {
  const button = document.querySelector("[data-copy-all-results]");
  if (!button) return;

  button.textContent = "Envoyer liste";
  button.dataset.examSendReady = "true";
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-copy-all-results]");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (!buildSimpleResultsListFromCards().trim()) {
    alert("Aucun résultat à envoyer.");
    return;
  }

  openExamListModal();
}, true);

refreshSendButton();

new MutationObserver(refreshSendButton)
  .observe(document.body, {
    childList: true,
    subtree: true
  });


