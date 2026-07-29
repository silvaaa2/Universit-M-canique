const EXAM_DISCORD_WEBHOOK_STORAGE_KEY = "examDiscordWebhookUrl";
const DISCORD_MESSAGE_LIMIT = 1900;
const MAIN_RESULTS_ROLE_MENTION = "<@&1199780299786158160>";
const APPROVED_RESULTS_ROLE_MENTION = "<@&1169634939797524480>";

function getAllExamCards() {
  return Array.from(document.querySelectorAll("[data-answer-card]"));
}

function getVisibleExamCards() {
  return getAllExamCards().filter(card => {
    return !card.hidden && getComputedStyle(card).display !== "none";
  });
}

function getExamCardsForDiscordList() {
  const visibleCards = getVisibleExamCards();
  return visibleCards.length ? visibleCards : getAllExamCards();
}

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

function getExamResultsFromCards() {
  return getExamCardsForDiscordList().map(card => {
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

function getSafeExamResultsFromCards() {
  try {
    return getExamResultsFromCards();
  } catch (error) {
    console.error("Erreur préparation liste Discord :", error);
    return [];
  }
}

function formatDateForDiscord(value) {
  const parts = String(value || "").split("-");
  if (parts.length !== 3) return "Non renseignée";

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function buildExamDiscordMessage({ startDate, endDate, results }) {
  const studentList = results
    .map(result => `- ${result.name} : ${result.score} - ${result.statusLabel}`)
    .join("\n");

  return [
    `# Résultats du cursus ${formatDateForDiscord(startDate)} au ${formatDateForDiscord(endDate)} ${MAIN_RESULTS_ROLE_MENTION} !`,
    "",
    studentList || "Aucun élève visible.",
    "",
    "",
    "Cordialement",
    "L'équipe des professeurs de Mécanique"
  ].join("\n");
}

function buildExamDiscordApprovedFollowupMessage(results) {
  const approvedList = results
    .filter(result => result.status === "approved")
    .map(result => `- ${result.name} : ${result.score} - ${result.statusLabel}`)
    .join("\n");

  return [
    `Bonsoir ${APPROVED_RESULTS_ROLE_MENTION} voici la liste des approuvés pour ce cursus.`,
    "",
    approvedList || "Aucun élève approuvé pour ce cursus.",
    "",
    "Merci"
  ].join("\n");
}

function splitDiscordMessage(message) {
  const chunks = [];
  let current = "";

  String(message || "").split("\n").forEach(line => {
    const next = current ? `${current}\n${line}` : line;

    if (next.length > DISCORD_MESSAGE_LIMIT) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  });

  if (current) chunks.push(current);
  return chunks;
}

function getSavedDiscordWebhook() {
  try {
    return window.localStorage.getItem(EXAM_DISCORD_WEBHOOK_STORAGE_KEY) || "";
  } catch (error) {
    console.warn("Lecture webhook Discord locale impossible :", error);
    return "";
  }
}

function saveDiscordWebhook(webhookUrl) {
  try {
    window.localStorage.setItem(EXAM_DISCORD_WEBHOOK_STORAGE_KEY, webhookUrl);
  } catch (error) {
    console.warn("Sauvegarde webhook Discord locale impossible :", error);
  }
}

async function postDiscordMessage(webhookUrl, content) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "Université Mécanique",
      content
    })
  });

  if (!response.ok) {
    throw new Error(`Discord a refusé l'envoi (${response.status}).`);
  }
}

async function sendDiscordExamMessages(webhookUrl, mainMessage, results) {
  const mainChunks = splitDiscordMessage(mainMessage);

  for (let index = 0; index < mainChunks.length; index++) {
    const suffix = mainChunks.length > 1 ? `\n\nPartie ${index + 1}/${mainChunks.length}` : "";
    await postDiscordMessage(webhookUrl, `${mainChunks[index]}${suffix}`);
  }

  const followupMessage = buildExamDiscordApprovedFollowupMessage(results);
  const followupChunks = splitDiscordMessage(followupMessage);

  for (let index = 0; index < followupChunks.length; index++) {
    const suffix = followupChunks.length > 1 ? `\n\nPartie ${index + 1}/${followupChunks.length}` : "";
    await postDiscordMessage(webhookUrl, `${followupChunks[index]}${suffix}`);
  }
}

function setExamSendStatus(message, tone = "") {
  const status = document.querySelector("[data-exam-send-status]");
  if (!status) return;

  status.textContent = message || "";
  status.dataset.tone = tone;
}

function setExamSendWebhookMode(modal, forceEdit = false) {
  if (!modal) return;

  const savedWebhook = getSavedDiscordWebhook();
  const webhookWrap = modal.querySelector("[data-exam-send-webhook-wrap]");
  const webhookInput = modal.querySelector("[data-exam-send-webhook]");
  const savedNotice = modal.querySelector("[data-exam-send-webhook-saved]");
  const shouldEdit = forceEdit || !savedWebhook;

  if (webhookWrap) webhookWrap.hidden = !shouldEdit;
  if (savedNotice) savedNotice.hidden = shouldEdit;

  if (webhookInput) {
    webhookInput.required = shouldEdit;

    if (shouldEdit && !webhookInput.value) {
      webhookInput.value = savedWebhook;
    }

    if (!shouldEdit) {
      webhookInput.value = "";
    }
  }
}

function updateExamSendPreview(modal) {
  const preview = modal.querySelector("[data-exam-send-preview]");
  const startInput = modal.querySelector("[data-exam-send-start]");
  const endInput = modal.querySelector("[data-exam-send-end]");
  const results = getSafeExamResultsFromCards();

  if (!preview) return;

  preview.textContent = buildExamDiscordMessage({
    startDate: startInput?.value || "",
    endDate: endInput?.value || "",
    results
  });
}

function closeExamSendModal() {
  const modal = document.getElementById("examSendModal");
  if (!modal) return;

  const card = modal.querySelector(".exam-send-card");

  modal.classList.remove("active");
  modal.classList.add("closing");

  if (card) {
    card.style.opacity = "";
    card.style.transform = "";
  }

  setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove("closing");
    modal.style.display = "";
    modal.style.opacity = "";
    modal.style.pointerEvents = "";
    modal.style.zIndex = "";
  }, 180);
}

function ensureExamSendModal() {
  let modal = document.getElementById("examSendModal");
  if (modal) return modal;

  document.body.insertAdjacentHTML("beforeend", `
    <div class="exam-send-modal" id="examSendModal" hidden>
      <div class="exam-send-backdrop" data-exam-send-close></div>

      <form class="exam-send-card" data-exam-send-form>
        <div class="exam-send-head">
          <div>
            <p class="kicker">Examens</p>
            <h2>Envoyer liste</h2>
          </div>

          <button type="button" class="exam-send-close" data-exam-send-close>
            ×
          </button>
        </div>

        <div class="exam-send-grid">
          <label>
            <span>Début du cursus</span>
            <input type="date" data-exam-send-start required>
          </label>

          <label>
            <span>Fin du cursus</span>
            <input type="date" data-exam-send-end required>
          </label>
        </div>

        <div class="exam-send-webhook-saved" data-exam-send-webhook-saved hidden>
          <div>
            <strong>Webhook Discord configuré</strong>
            <span>Il ne sera plus demandé sur ce navigateur.</span>
          </div>
          <button type="button" data-exam-send-change-webhook>Modifier</button>
        </div>

        <label class="exam-send-webhook" data-exam-send-webhook-wrap>
          <span>Webhook Discord</span>
          <input type="url" data-exam-send-webhook placeholder="https://discord.com/api/webhooks/..." required>
        </label>

        <div class="exam-send-preview">
          <div class="exam-send-preview-head">
            <strong>Aperçu</strong>
            <span data-exam-send-count></span>
          </div>
          <pre data-exam-send-preview></pre>
        </div>

        <div class="exam-send-actions">
          <span data-exam-send-status></span>
          <button type="button" class="btn secondary" data-exam-send-close>Annuler</button>
          <button type="submit" class="btn primary" data-exam-send-submit>Envoyer</button>
        </div>
      </form>
    </div>
  `);

  modal = document.getElementById("examSendModal");

  modal.querySelectorAll("[data-exam-send-close]").forEach(button => {
    button.addEventListener("click", closeExamSendModal);
  });

  modal.querySelectorAll("[data-exam-send-start], [data-exam-send-end]").forEach(input => {
    input.addEventListener("input", () => updateExamSendPreview(modal));
  });

  modal.querySelector("[data-exam-send-change-webhook]")?.addEventListener("click", () => {
    const webhookInput = modal.querySelector("[data-exam-send-webhook]");
    setExamSendWebhookMode(modal, true);
    webhookInput?.focus();
    webhookInput?.select();
  });

  modal.querySelector("[data-exam-send-form]")?.addEventListener("submit", async event => {
    event.preventDefault();

    const submitButton = modal.querySelector("[data-exam-send-submit]");
    const webhookInput = modal.querySelector("[data-exam-send-webhook]");
    const startInput = modal.querySelector("[data-exam-send-start]");
    const endInput = modal.querySelector("[data-exam-send-end]");
    const results = getSafeExamResultsFromCards();
    const webhookUrl = String(webhookInput?.value || "").trim() || getSavedDiscordWebhook();

    if (!results.length) {
      setExamSendStatus("Aucun résultat à envoyer.", "error");
      return;
    }

    if (!webhookUrl) {
      setExamSendStatus("Webhook Discord manquant.", "error");
      return;
    }

    const message = buildExamDiscordMessage({
      startDate: startInput?.value || "",
      endDate: endInput?.value || "",
      results
    });

    submitButton.disabled = true;
    submitButton.textContent = "Envoi...";
    setExamSendStatus("Envoi vers Discord...", "pending");

    try {
      await sendDiscordExamMessages(webhookUrl, message, results);
      saveDiscordWebhook(webhookUrl);
      setExamSendWebhookMode(modal);
      setExamSendStatus("Liste envoyée.", "ok");

      setTimeout(() => {
        closeExamSendModal();
        submitButton.disabled = false;
        submitButton.textContent = "Envoyer";
      }, 900);
    } catch (error) {
      console.error("Erreur envoi liste Discord :", error);
      setExamSendStatus(error.message || "Envoi impossible.", "error");
      if (!getSavedDiscordWebhook()) setExamSendWebhookMode(modal, true);
      submitButton.disabled = false;
      submitButton.textContent = "Envoyer";
    }
  });

  return modal;
}

function openExamSendModal() {
  const results = getSafeExamResultsFromCards();
  const modal = ensureExamSendModal();
  const card = modal.querySelector(".exam-send-card");
  const today = new Date().toISOString().slice(0, 10);
  const startInput = modal.querySelector("[data-exam-send-start]");
  const endInput = modal.querySelector("[data-exam-send-end]");
  const webhookInput = modal.querySelector("[data-exam-send-webhook]");
  const count = modal.querySelector("[data-exam-send-count]");

  if (startInput && !startInput.value) startInput.value = today;
  if (endInput && !endInput.value) endInput.value = today;
  if (webhookInput) webhookInput.value = getSavedDiscordWebhook();
  if (count) {
    count.textContent = results.length
      ? `${results.length} copie(s) visible(s)`
      : "Aucune copie détectée";
  }

  setExamSendWebhookMode(modal);
  setExamSendStatus(results.length ? "" : "Aucune copie détectée sur la page.", results.length ? "" : "error");
  updateExamSendPreview(modal);

  modal.hidden = false;
  modal.style.display = "grid";
  modal.style.opacity = "1";
  modal.style.pointerEvents = "auto";
  modal.style.zIndex = "10040";
  modal.classList.remove("closing");
  modal.classList.add("active");

  if (card) {
    card.style.opacity = "1";
    card.style.transform = "translateY(0) scale(1)";
  }
}

function updateExamSendButtons() {
  document.querySelectorAll("[data-copy-all-results]").forEach(button => {
    button.textContent = "Envoyer liste";
    button.dataset.examDiscordSend = "true";
    button.setAttribute("aria-label", "Envoyer la liste des examens sur Discord");
  });
}

document.addEventListener("click", event => {
  const button = event.target?.closest?.("[data-copy-all-results]");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  try {
    openExamSendModal();
  } catch (error) {
    console.error("Erreur ouverture pop-up Envoyer liste :", error);
    alert("Impossible d'ouvrir la fenêtre Envoyer liste. Regarde la console pour le détail.");
  }
}, true);

updateExamSendButtons();

new MutationObserver(updateExamSendButtons).observe(document.body, {
  childList: true,
  subtree: true
});
