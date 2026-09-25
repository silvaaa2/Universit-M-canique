// Local-only Discord Gateway connection. The website's Vercel functions remain unchanged.
const token = String(process.env.DISCORD_BOT_TOKEN || "").trim();

if (token.length < 30) {
  console.error("Renseigne d'abord le nouveau DISCORD_BOT_TOKEN dans .env.local.");
  process.exit(1);
}

const fatalCloseCodes = new Set([4004, 4010, 4011, 4012, 4013, 4014]);
const controlUrl = "https://universite-mecanique-m4.vercel.app/api/access/session?bot=discord-bot";
const allowedStatuses = new Set(["online", "idle", "dnd"]);
let stopping = false;
let activeSocket = null;
let wakeRetry = null;
let controlTimer = null;
let controlBusy = false;
let controlErrorReported = false;
let gatewayReady = false;
let desiredStatus = "online";
let appliedStatus = "online";
let lastReportedAt = 0;

function presence(status) {
  return {
    status,
    activities: [],
    since: status === "idle" ? Date.now() : null,
    afk: status === "idle"
  };
}

function applyDesiredStatus() {
  if (!gatewayReady || activeSocket?.readyState !== WebSocket.OPEN || desiredStatus === appliedStatus) return;
  activeSocket.send(JSON.stringify({ op: 3, d: presence(desiredStatus) }));
  appliedStatus = desiredStatus;
  lastReportedAt = 0;
  console.log(`Nouveau statut Discord appliqué : ${desiredStatus}.`);
}

async function controlRequest(method = "GET", body = null) {
  const response = await fetch(controlUrl, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function scheduleControl(delay = 60_000) {
  clearTimeout(controlTimer);
  if (!stopping) controlTimer = setTimeout(() => void pollControl(), delay);
}

async function pollControl() {
  if (controlBusy || stopping) return;
  controlBusy = true;
  try {
    const settings = await controlRequest();
    if (allowedStatuses.has(settings.desiredStatus)) {
      desiredStatus = settings.desiredStatus;
      applyDesiredStatus();
    }
    if (gatewayReady && Date.now() - lastReportedAt > 180_000) {
      await controlRequest("POST", { currentStatus: appliedStatus });
      lastReportedAt = Date.now();
    }
    controlErrorReported = false;
  } catch (error) {
    if (!controlErrorReported) {
      console.warn(`Panneau BOT Discord indisponible (${error.message}). Le bot reste connecté.`);
      controlErrorReported = true;
    }
  } finally {
    controlBusy = false;
    scheduleControl();
  }
}

function stop() {
  stopping = true;
  clearTimeout(controlTimer);
  wakeRetry?.();
  if (activeSocket?.readyState === WebSocket.OPEN) {
    activeSocket.close(1000, "Arrêt demandé");
  }
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

async function getGatewayUrl() {
  const response = await fetch("https://discord.com/api/v10/gateway/bot", {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(15_000)
  });

  if (response.status === 401) {
    throw new Error("TOKEN_INVALIDE");
  }
  if (!response.ok) {
    throw new Error(`Discord a répondu HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.url) {
    throw new Error("Adresse Gateway absente dans la réponse Discord");
  }

  const url = new URL(payload.url);
  url.searchParams.set("v", "10");
  url.searchParams.set("encoding", "json");
  return url.toString();
}

function connect(gatewayUrl) {
  return new Promise((resolve) => {
    const socket = new WebSocket(gatewayUrl);
    activeSocket = socket;
    let lastSequence = null;
    let awaitingHeartbeatAck = false;
    let firstHeartbeat = null;
    let heartbeatInterval = null;
    let ready = false;
    let readySince = 0;
    let identifiedStatus = desiredStatus;
    const handshakeTimeout = setTimeout(() => {
      console.warn("Discord ne répond pas à la connexion. Nouvelle tentative...");
      socket.close(4000, "Délai de connexion dépassé");
    }, 60_000);

    socket.addEventListener("open", () => {
      if (stopping) socket.close(1000, "Arrêt demandé");
    });

    function send(payload) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    }

    function heartbeat() {
      if (awaitingHeartbeatAck) {
        console.warn("Connexion Discord interrompue. Reconnexion...");
        socket.close(4000, "Heartbeat sans réponse");
        return;
      }
      send({ op: 1, d: lastSequence });
      awaitingHeartbeatAck = true;
    }

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (typeof message.s === "number") lastSequence = message.s;

      switch (message.op) {
        case 10: {
          const interval = Number(message.d?.heartbeat_interval);
          if (!Number.isFinite(interval) || interval <= 0) {
            socket.close(4000, "Intervalle invalide");
            return;
          }
          firstHeartbeat = setTimeout(() => {
            heartbeat();
            heartbeatInterval = setInterval(heartbeat, interval);
          }, Math.floor(Math.random() * interval));
          identifiedStatus = desiredStatus;
          send({
            op: 2,
            d: {
              token,
              intents: 1, // GUILDS only; no privileged intents or message reading.
              properties: {
                os: process.platform,
                browser: "universite-presence",
                device: "universite-presence"
              },
              presence: presence(identifiedStatus)
            }
          });
          break;
        }
        case 1:
          send({ op: 1, d: lastSequence });
          awaitingHeartbeatAck = true;
          break;
        case 11:
          awaitingHeartbeatAck = false;
          break;
        case 7:
        case 9:
          socket.close(4000, "Nouvelle session demandée");
          break;
        case 0:
          if (message.t === "READY") {
            ready = true;
            readySince = Date.now();
            gatewayReady = true;
            appliedStatus = identifiedStatus;
            applyDesiredStatus();
            scheduleControl(0);
            clearTimeout(handshakeTimeout);
            const name = message.d?.user?.username || "Bot";
            console.log(`${name} est en ligne sur Discord. Laisse cette fenêtre ouverte.`);
          }
          break;
        default:
          break;
      }
    });

    socket.addEventListener("error", () => {
      console.warn("Erreur de connexion Discord. Nouvelle tentative...");
    });

    socket.addEventListener("close", (event) => {
      gatewayReady = false;
      clearTimeout(handshakeTimeout);
      clearTimeout(firstHeartbeat);
      clearInterval(heartbeatInterval);
      if (activeSocket === socket) activeSocket = null;
      resolve({ code: event.code, ready, onlineDuration: ready ? Date.now() - readySince : 0 });
    });
  });
}

let gatewayUrl = null;
let retry = 0;

void pollControl();

while (!stopping) {
  try {
    gatewayUrl ||= await getGatewayUrl();
    const result = await connect(gatewayUrl);
    if (stopping) break;
    if (fatalCloseCodes.has(result.code)) {
      console.error(`Discord a refusé la session (code ${result.code}). Arrêt du bot.`);
      process.exitCode = 1;
      break;
    }
    if (result.onlineDuration > 300_000) retry = 0;
  } catch (error) {
    if (error.message === "TOKEN_INVALIDE") {
      console.error("Token Discord refusé. Vérifie DISCORD_BOT_TOKEN dans .env.local.");
      process.exitCode = 1;
      break;
    }
    console.warn(`Discord indisponible : ${error.message}. Nouvelle tentative...`);
  }

  if (!stopping) {
    const waitMs = Math.min(300_000, 5_000 * 2 ** Math.min(retry++, 6));
    console.log(`Nouvelle tentative dans ${Math.round(waitMs / 1000)} s.`);
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        wakeRetry = null;
        resolve();
      }, waitMs);
      wakeRetry = () => {
        clearTimeout(timer);
        wakeRetry = null;
        resolve();
      };
    });
  }
}

console.log("Bot arrêté.");
