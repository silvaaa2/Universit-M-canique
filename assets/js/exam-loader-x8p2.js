import "./exam-loader-secure.js?v=1001";

const EXAM_SEND_WEBHOOK_URL = "https://discord.com/api/webhooks/1532074252252086382/uzHdIqZdga-Qexgbql68Ieba_oPdYkDfuakv2aTHWVPEfO_TjAdEpzAbjHjUXJTsqm8B";
const EXAM_SEND_RESULTS_ROLE_ID = "1199780299786158160";
const EXAM_SEND_APPROVED_ROLE_ID = "1169634939797524480";
const EXAM_SEND_MAX_POINTS = 50;

function normalizeExamSendText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getExamSendVisibleCards() {
  return Array.from(document.querySelectorAll("[data-answer-card]"))
    .filter(card => card.style.display !== "none");
}

function getExamSendStatusLabel(status) {
  if (status === "approved") return "Approuvé";
  if (status === "rejected") return "Refusé";
  return "En attente";
}

function getExamSendScore(card) {
  const score = card.querySelector("[data-total-score-badge]")?.textContent
    ?.replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .trim();

  return score || `0/${EXAM_SEND_MAX_POINTS}`;
}

function getExamSendResults() {
  return getExamSendVisibleCards().map(card => {
    const name = normalizeExamSendText(
      card.dataset.studentName || card.querySelector("h2")?.textContent || "Élève"
    );
    const idUnique = normalizeExamSendText(card.dataset.idUnique || "");
    const status = card.dataset.status || "pending";

    return {
      name,
      idUnique,
      score: getExamSendScore(card),
      status,
      statusLabel: getExamSendStatusLabel(status)
    };
  });
}

function cleanExamPromptDate(value) {
  return normalizeExamSendText(value) || "Non renseignée";
}

function buildExamResultsDiscordMessage(startDate, endDate, results) {
  const lines = results.map(result => {
    const identity = result.idUnique ? `${result.name} (${result.idUnique})` : result.name;
    return `- ${identity} : ${result.score} - ${result.statusLabel}`;
  });

  return [
    `# Résultats du cursus ${startDate} au ${endDate} <@&${EXAM_SEND_RESULTS_ROLE_ID}> !`,
    "",
    lines.join("\n"),
    "",
    "",
    "Cordialement",
    "L'équipe des professeurs de Mécanique"
  ].join("\n");
}

function buildApprovedExamDiscordMessage(results) {
  const approvedResults = results.filter(result => result.status === "approved");
  const lines = approvedResults.map(result => {
    const identity = result.idUnique ? `${result.name} (${result.idUnique})` : result.name;
    return `- ${identity} : ${result.score}`;
  });

  return [
    `Bonsoir <@&${EXAM_SEND_APPROVED_ROLE_ID}> voici la liste des approuvés pour ce cursus.`,
    "",
    lines.length ? lines.join("\n") : "Aucun approuvé pour ce cursus.",
    "",
    "Merci"
  ].join("\n");
}

async function sendExamDiscordMessage(content, roleIds) {
  const response = await fetch(EXAM_SEND_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content,
      allowed_mentions: {
        parse: [],
        roles: roleIds
      }
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Discord a refusé l'envoi (${response.status}). ${details}`.trim());
  }
}

function bindExamDiscordSendButton(button) {
  if (!button || button.dataset.discordSendReady === "true") return;

  button.dataset.discordSendReady = "true";
  button.textContent = "Envoyer liste";

  button.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (button.dataset.discordSending === "true") return;

    const results = getExamSendResults();
    if (!results.length) {
      alert("Aucun résultat à envoyer.");
      return;
    }

    const startRaw = prompt("Date de début du cursus :", "");
    if (startRaw === null) return;

    const endRaw = prompt("Date de fin du cursus :", "");
    if (endRaw === null) return;

    const startDate = cleanExamPromptDate(startRaw);
    const endDate = cleanExamPromptDate(endRaw);
    const approvedCount = results.filter(result => result.status === "approved").length;

    const shouldSend = confirm(
      `Envoyer la liste Discord du cursus ${startDate} au ${endDate} ?\n\n` +
      `${results.length} copie(s)\n` +
      `${approvedCount} approuvé(s)`
    );

    if (!shouldSend) return;

    const oldText = button.textContent;
    button.dataset.discordSending = "true";
    button.disabled = true;
    button.textContent = "Envoi...";

    try {
      await sendExamDiscordMessage(
        buildExamResultsDiscordMessage(startDate, endDate, results),
        [EXAM_SEND_RESULTS_ROLE_ID]
      );
      await sendExamDiscordMessage(
        buildApprovedExamDiscordMessage(results),
        [EXAM_SEND_APPROVED_ROLE_ID]
      );

      alert("Messages Discord envoyés.");
    } catch (error) {
      console.error("Erreur envoi Discord examens :", error);
      alert(`Envoi Discord impossible : ${error.message || error}`);
    } finally {
      button.disabled = false;
      button.textContent = oldText || "Envoyer liste";
      delete button.dataset.discordSending;
    }
  }, true);
}

function watchExamDiscordSendButton() {
  const bindCurrentButton = () => {
    const button = document.querySelector("[data-copy-all-results]");
    if (button) bindExamDiscordSendButton(button);
  };

  bindCurrentButton();
  const timer = window.setInterval(bindCurrentButton, 500);
  window.setTimeout(() => window.clearInterval(timer), 60000);
}

watchExamDiscordSendButton();
