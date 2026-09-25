let discordBotState = null;
let discordBotBusy = false;

function botEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function botAdminRequest(method = "GET", body = null) {
  const firebase = window.profFirebase;
  const user = firebase?.auth?.currentUser || window.currentProfUser;
  if (!user?.getIdToken) throw new Error("Reconnecte-toi avec le compte administrateur.");
  const idToken = await user.getIdToken(false);
  const response = await fetch("/api/access/session?admin=discord-bot", {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Action BOT Discord impossible.");
  return payload;
}

function botStatus(message, tone = "") {
  const element = document.getElementById("discordBotPanelStatus");
  if (!element) return;
  element.textContent = message || "";
  element.dataset.tone = tone;
}

function ensureDiscordBotPanel() {
  if (document.getElementById("profDiscordBotModal")) return;
  const style = document.createElement("style");
  style.id = "profDiscordBotStyles";
  style.textContent = `
    .prof-discord-bot-card { width:min(1060px,100%); max-height:min(92vh,900px); overflow:auto; }
    .discord-bot-intro { margin:4px 0 20px; color:var(--muted); font-size:13px; line-height:1.5; }
    .discord-bot-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; }
    .discord-bot-section { padding:19px; border:1px solid rgba(255,255,255,.09); border-radius:14px; background:rgba(255,255,255,.025); }
    .discord-bot-section.wide { grid-column:1/-1; }
    .discord-bot-section h3 { margin:0 0 7px; color:var(--text); font-size:18px; }
    .discord-bot-section p { margin:0 0 14px; color:var(--muted); font-size:12px; line-height:1.5; }
    .discord-bot-connect { display:inline-flex; align-items:center; gap:7px; padding:7px 10px; margin:0 0 15px; border:1px solid rgba(255,255,255,.11); border-radius:999px; color:var(--muted); font-size:11px; font-weight:800; }
    .discord-bot-connect::before { content:""; width:8px; height:8px; border-radius:50%; background:#f87171; }
    .discord-bot-connect[data-connected="true"] { color:#86efac; border-color:rgba(134,239,172,.28); }
    .discord-bot-connect[data-connected="true"]::before { background:#86efac; box-shadow:0 0 12px #86efac; }
    .discord-bot-statuses { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
    .discord-bot-statuses button { min-height:45px; padding:9px; border:1px solid rgba(255,255,255,.12); border-radius:10px; background:rgba(255,255,255,.035); color:var(--text); font:inherit; font-size:12px; font-weight:900; cursor:pointer; transition:transform .16s,border-color .16s,background .16s; }
    .discord-bot-statuses button:hover { transform:translateY(-2px); border-color:rgba(214,180,106,.55); }
    .discord-bot-statuses button[aria-pressed="true"] { color:var(--gold2); border-color:rgba(214,180,106,.6); background:rgba(214,180,106,.11); }
    .discord-bot-field { display:grid; gap:7px; margin:0 0 12px; color:var(--text); font-size:12px; font-weight:850; }
    .discord-bot-field textarea,.discord-bot-field select { width:100%; min-width:0; box-sizing:border-box; border:1px solid rgba(255,255,255,.13); border-radius:10px; background:#121310; color:var(--text); font:inherit; font-size:13px; }
    .discord-bot-field textarea { min-height:108px; padding:12px; resize:vertical; line-height:1.5; }
    .discord-bot-field select { height:46px; padding:0 12px; }
    .discord-bot-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .discord-bot-count { color:var(--muted); font-size:11px; }
    .discord-bot-status { min-height:21px; margin:17px 0 0; color:var(--muted); font-size:12px; font-weight:850; }
    .discord-bot-status[data-tone="error"] { color:#fca5a5; }
    .discord-bot-status[data-tone="ok"] { color:#86efac; }
    @media(max-width:760px) { .discord-bot-grid{grid-template-columns:1fr}.discord-bot-section.wide{grid-column:auto}.discord-bot-statuses{grid-template-columns:1fr 1fr 1fr} }
    @media(prefers-reduced-motion:reduce) { .discord-bot-statuses button{transition:none} }
  `;
  document.head.appendChild(style);
  document.body.insertAdjacentHTML("beforeend", `
    <div id="profDiscordBotModal" class="prof-admin-modal-overlay" hidden>
      <div class="prof-admin-modal-card prof-discord-bot-card" role="dialog" aria-modal="true" aria-labelledby="profDiscordBotTitle">
        <button type="button" class="prof-admin-close" data-close-discord-bot aria-label="Fermer">×</button>
        <p class="kicker">Administration</p>
        <h2 id="profDiscordBotTitle">BOT Discord</h2>
        <p class="discord-bot-intro">Pilote le statut et la présentation du bot, puis publie dans les salons du serveur. Le token reste sur le serveur et sur ton PC.</p>
        <div class="discord-bot-grid">
          <section class="discord-bot-section">
            <h3>Présence</h3>
            <p id="discordBotName">Chargement du bot…</p>
            <span class="discord-bot-connect" id="discordBotConnection" data-connected="false">Connexion PC inconnue</span>
            <p id="discordBotCurrentStatus">Statut actuel : chargement…</p>
            <div class="discord-bot-statuses" role="group" aria-label="Statut du bot">
              <button type="button" data-discord-bot-status="online">🟢 En ligne</button>
              <button type="button" data-discord-bot-status="idle">🟡 Absent</button>
              <button type="button" data-discord-bot-status="dnd">🔴 NPD</button>
            </div>
            <p style="margin:13px 0 0">Le changement est appliqué par le programme sur ton PC sous environ une minute.</p>
          </section>
          <section class="discord-bot-section">
            <h3>Présentation</h3>
            <p>La description du profil de l'application Discord.</p>
            <label class="discord-bot-field" for="discordBotDescription">Description du bot
              <textarea id="discordBotDescription" maxlength="400" placeholder="Présente le rôle du bot…"></textarea>
            </label>
            <div class="discord-bot-actions"><button type="button" class="prof-admin-small-btn gold" id="discordBotSaveDescription">Enregistrer la description</button><span class="discord-bot-count" id="discordBotDescriptionCount">0 / 400</span></div>
          </section>
          <section class="discord-bot-section wide">
            <h3>Écrire dans un salon</h3>
            <p>Tous les salons du serveur sont répertoriés. Seuls les salons textuels et d'annonces acceptent un message. Les mentions automatiques sont désactivées pour éviter les ping accidentels.</p>
            <label class="discord-bot-field" for="discordBotChannel">Salon
              <select id="discordBotChannel"><option value="">Chargement des salons…</option></select>
            </label>
            <label class="discord-bot-field" for="discordBotMessage">Message
              <textarea id="discordBotMessage" maxlength="2000" placeholder="Écris ton message ici…"></textarea>
            </label>
            <div class="discord-bot-actions"><button type="button" class="prof-admin-small-btn gold" id="discordBotSendMessage">Envoyer avec le bot</button><span class="discord-bot-count" id="discordBotMessageCount">0 / 2 000</span></div>
          </section>
        </div>
        <div class="discord-bot-actions" style="margin-top:15px"><button type="button" class="prof-admin-small-btn" id="discordBotRefresh">Actualiser</button></div>
        <p id="discordBotPanelStatus" class="discord-bot-status" role="status" aria-live="polite"></p>
      </div>
    </div>
  `);
}

function renderDiscordBot() {
  if (!discordBotState) return;
  const { settings = {}, bot = {}, channels = [] } = discordBotState;
  document.getElementById("discordBotName").textContent = `${bot.name || "Bot Discord"} · serveur Université`;
  const connection = document.getElementById("discordBotConnection");
  connection.dataset.connected = String(settings.connected === true);
  connection.textContent = settings.connected ? "Programme PC connecté" : "Programme PC non détecté";
  const labels = { online: "En ligne", idle: "Absent", dnd: "Ne pas déranger" };
  document.getElementById("discordBotCurrentStatus").textContent = settings.connected
    ? `Statut appliqué : ${labels[settings.currentStatus] || "en attente"}`
    : "Le bot doit rester lancé sur ton PC pour changer de statut.";
  document.querySelectorAll("[data-discord-bot-status]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.discordBotStatus === settings.desiredStatus));
  });
  const description = document.getElementById("discordBotDescription");
  if (document.activeElement !== description) description.value = discordBotState.description || "";
  document.getElementById("discordBotDescriptionCount").textContent = `${description.value.length} / 400`;

  const select = document.getElementById("discordBotChannel");
  const selected = select.value;
  select.innerHTML = `<option value="">Choisir un salon…</option>${channels.map(channel => `
    <option value="${botEscape(channel.id)}" ${channel.sendable ? "" : "disabled"}>${botEscape(channel.category)} / ${botEscape(channel.name)}${channel.sendable ? "" : " (lecture seule)"}</option>
  `).join("")}`;
  if (channels.some(channel => channel.id === selected && channel.sendable)) select.value = selected;
}

async function loadDiscordBot() {
  if (discordBotBusy) return;
  discordBotBusy = true;
  botStatus("Chargement des informations Discord…");
  try {
    discordBotState = await botAdminRequest();
    renderDiscordBot();
    botStatus("");
  } catch (error) {
    botStatus(error.message || "Chargement impossible.", "error");
  } finally {
    discordBotBusy = false;
  }
}

function openDiscordBotPanel() {
  ensureDiscordBotPanel();
  const modal = document.getElementById("profDiscordBotModal");
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("active"));
  void loadDiscordBot();
}

function closeDiscordBotPanel() {
  const modal = document.getElementById("profDiscordBotModal");
  if (!modal) return;
  modal.classList.remove("active");
  window.setTimeout(() => { modal.hidden = true; }, 180);
}

async function changeDiscordBotStatus(status) {
  if (discordBotBusy) return;
  discordBotBusy = true;
  botStatus("Transmission du nouveau statut…");
  try {
    await botAdminRequest("PATCH", { action: "status", status });
    discordBotState.settings.desiredStatus = status;
    renderDiscordBot();
    botStatus("Statut demandé. Le programme PC va l'appliquer sous environ une minute.", "ok");
  } catch (error) {
    botStatus(error.message || "Changement de statut impossible.", "error");
  } finally {
    discordBotBusy = false;
  }
}

async function saveDiscordBotDescription() {
  if (discordBotBusy) return;
  const description = document.getElementById("discordBotDescription")?.value.trim() || "";
  discordBotBusy = true;
  botStatus("Enregistrement de la description…");
  try {
    const result = await botAdminRequest("PATCH", { action: "description", description });
    discordBotState.description = result.description;
    botStatus("Description mise à jour sur Discord.", "ok");
  } catch (error) {
    botStatus(error.message || "Enregistrement impossible.", "error");
  } finally {
    discordBotBusy = false;
  }
}

async function sendDiscordBotMessage() {
  if (discordBotBusy) return;
  const channelId = document.getElementById("discordBotChannel")?.value || "";
  const content = document.getElementById("discordBotMessage")?.value.trim() || "";
  const channel = discordBotState?.channels?.find(item => item.id === channelId && item.sendable);
  if (!channel || !content) {
    botStatus("Choisis un salon textuel et écris un message.", "error");
    return;
  }
  if (!window.confirm(`Envoyer ce message avec le bot dans #${channel.name} ?`)) return;
  discordBotBusy = true;
  botStatus(`Envoi dans #${channel.name}…`);
  try {
    await botAdminRequest("POST", { action: "message", channelId, content });
    document.getElementById("discordBotMessage").value = "";
    document.getElementById("discordBotMessageCount").textContent = "0 / 2 000";
    botStatus(`Message envoyé dans #${channel.name}.`, "ok");
  } catch (error) {
    botStatus(error.message || "Envoi impossible.", "error");
  } finally {
    discordBotBusy = false;
  }
}

document.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("[data-close-discord-bot]") || target?.id === "profDiscordBotModal") closeDiscordBotPanel();
  const status = target?.closest("[data-discord-bot-status]")?.dataset.discordBotStatus;
  if (status) void changeDiscordBotStatus(status);
  if (target?.closest("#discordBotSaveDescription")) void saveDiscordBotDescription();
  if (target?.closest("#discordBotSendMessage")) void sendDiscordBotMessage();
  if (target?.closest("#discordBotRefresh")) void loadDiscordBot();
}, true);

document.addEventListener("input", event => {
  if (event.target?.id === "discordBotDescription") document.getElementById("discordBotDescriptionCount").textContent = `${event.target.value.length} / 400`;
  if (event.target?.id === "discordBotMessage") document.getElementById("discordBotMessageCount").textContent = `${event.target.value.length} / 2 000`;
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeDiscordBotPanel();
});

window.openProfDiscordBotPanel = openDiscordBotPanel;
