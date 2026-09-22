const PERMISSIONS = [
  ["dashboard", "Tableau de bord"],
  ["corrections", "Corrigés"],
  ["customResponses", "Réponses élèves"],
  ["exams", "Examens"],
  ["modules", "Modules élèves"],
  ["customAccess", "Fiches Élèves"],
  ["stages", "Suivi de stage"]
];

let accessControlState = { users: [], logs: [], viewerOwner: false, discordChannelConfigured: false };
let accessControlBusy = false;

function accessEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function waitForAccessFirebase() {
  if (window.profFirebase?.auth) return Promise.resolve(window.profFirebase);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Session administrateur indisponible.")), 8000);
    window.addEventListener("profFirebaseReady", () => {
      window.clearTimeout(timer);
      resolve(window.profFirebase);
    }, { once: true });
  });
}

async function accessRequest(method = "GET", body = null) {
  const firebase = await waitForAccessFirebase();
  const user = firebase.auth?.currentUser || window.currentProfUser;
  if (!user?.getIdToken) throw new Error("Reconnecte-toi avec le compte administrateur.");
  const token = await user.getIdToken(false);
  const response = await fetch("/api/access/session?admin=access-control", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Action impossible.");
  return payload;
}

function injectAccessStyles() {
  if (document.getElementById("profAdminAccessStyles")) return;
  const style = document.createElement("style");
  style.id = "profAdminAccessStyles";
  style.textContent = `
    .access-control-layout { display:grid; gap:16px; }
    .access-control-card { padding:16px; border:1px solid rgba(255,255,255,.09); border-radius:12px; background:rgba(255,255,255,.025); }
    .access-control-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; }
    .access-control-head h3,.access-control-head p { margin:0; }
    .access-control-head h3 { color:var(--text); font-size:18px; }
    .access-control-head p { margin-top:5px; color:var(--muted); font-size:12px; line-height:1.45; }
    .access-discord-state { padding:7px 10px; border-radius:999px; border:1px solid rgba(252,165,165,.25); color:#fca5a5; font-size:10px; font-weight:950; white-space:nowrap; }
    .access-discord-state.ok { border-color:rgba(74,222,128,.25); color:#86efac; }
    .access-user-list { display:grid; gap:10px; }
    .access-user { padding:14px; border:1px solid rgba(255,255,255,.08); border-radius:11px; background:rgba(0,0,0,.20); }
    .access-user.is-disabled { border-color:rgba(252,165,165,.32); background:rgba(127,29,29,.08); }
    .access-user-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .access-user-head strong,.access-user-head span { display:block; }
    .access-user-head strong { color:var(--text); font-size:15px; }
    .access-user-head span { margin-top:3px; color:var(--muted); font-size:10px; }
    .access-role { padding:6px 9px; border-radius:999px; background:rgba(214,180,106,.11); color:var(--gold2)!important; font-weight:950; text-transform:uppercase; }
    .access-permissions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; margin-top:13px; }
    .access-permissions label { display:flex; align-items:center; gap:7px; min-width:0; padding:8px 9px; border:1px solid rgba(255,255,255,.07); border-radius:8px; color:var(--muted); font-size:10px; font-weight:850; }
    .access-user-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
    .access-user-actions button { min-height:36px; }
    .access-user-actions .danger { border-color:rgba(252,165,165,.25); color:#fca5a5; }
    .access-log-filters { display:grid; grid-template-columns:1fr 180px 160px; gap:9px; margin-bottom:12px; }
    .access-log-filters input,.access-log-filters select { min-width:0; height:39px; padding:0 10px; border:1px solid rgba(255,255,255,.10); border-radius:8px; background:rgba(0,0,0,.28); color:var(--text); }
    .access-log-list { display:grid; gap:8px; max-height:420px; overflow:auto; }
    .access-log { display:grid; grid-template-columns:132px minmax(130px,.7fr) minmax(150px,1fr) minmax(190px,1.4fr); gap:10px; align-items:center; padding:10px 11px; border:1px solid rgba(255,255,255,.07); border-radius:9px; background:rgba(0,0,0,.18); }
    .access-log time,.access-log small { color:var(--muted); font-size:10px; }
    .access-log strong { color:var(--text); font-size:11px; }
    .access-log span { color:var(--gold2); font-size:10px; font-weight:900; text-transform:uppercase; }
    .access-control-status { min-height:20px; margin:10px 0 0; color:var(--muted); font-size:12px; font-weight:850; }
    .access-control-status[data-tone="error"] { color:#fca5a5; }
    .access-control-status[data-tone="ok"] { color:#86efac; }
    .prof-access-modal-card { width:min(1460px,100%); max-height:min(92vh,940px); }
    .prof-access-modal-card .prof-admin-workspace { min-height:min(710px,calc(92vh - 125px)); padding-top:18px; }
    .prof-access-modal-card .access-log-list { max-height:520px; }
    @media(max-width:780px){.access-permissions{grid-template-columns:1fr 1fr}.access-log-filters{grid-template-columns:1fr}.access-log{grid-template-columns:1fr;gap:4px}}
  `;
  document.head.appendChild(style);
}

function ensureAccessPanel() {
  if (document.getElementById("profAccessControlModal")) return;
  injectAccessStyles();
  document.body.insertAdjacentHTML("beforeend", `
    <div id="profAccessControlModal" class="prof-admin-modal-overlay" hidden>
      <div class="prof-admin-modal-card prof-access-modal-card" role="dialog" aria-modal="true" aria-labelledby="profAccessControlTitle">
        <button type="button" class="prof-admin-close" data-close-access-control aria-label="Fermer">×</button>
        <p class="kicker">Administration</p>
        <h2 id="profAccessControlTitle">Accès &amp; journaux</h2>
        <div class="prof-admin-workspace">
          <section id="profAdminAccessPanel" class="prof-admin-panel">
        <div class="prof-admin-toolbar"><button type="button" class="prof-admin-small-btn" id="reloadAccessControl">Actualiser</button><span class="prof-admin-status">Sessions, pages autorisées et journal du site</span></div>
        <div class="access-control-layout">
          <article class="access-control-card">
            <div class="access-control-head"><div><h3>Professeurs Discord</h3><p>Toutes les pages peuvent être décochées. Seul Marc Carter peut accorder ou retirer les droits administrateur.</p></div><div><span id="accessDiscordState" class="access-discord-state">Salon logs à configurer</span><button type="button" class="prof-admin-small-btn gold" id="createAuditChannelBtn">Créer le salon Discord</button></div></div>
            <div id="accessUserList" class="access-user-list"><p class="prof-admin-status">Chargement…</p></div>
          </article>
          <article class="access-control-card">
            <div class="access-control-head"><div><h3>Journal d’activité</h3><p>Connexions et actions des professeurs et entreprises.</p></div></div>
            <div class="access-log-filters"><input id="accessLogSearch" type="search" placeholder="Utilisateur ou ID…"><select id="accessLogType"><option value="">Tous les comptes</option><option value="admin">Admins</option><option value="prof">Professeurs</option><option value="company">Entreprises</option></select><select id="accessLogCategory"><option value="">Toutes les catégories</option><option value="connexion">Connexions</option><option value="tableau de bord">Tableau de bord</option><option value="modules">Modules</option><option value="examens">Examens</option><option value="customs">Customs</option><option value="entreprises">Entreprises</option><option value="administration">Administration</option></select></div>
            <div id="accessLogList" class="access-log-list"></div>
          </article>
        </div>
        <p id="accessControlStatus" class="access-control-status" role="status" aria-live="polite"></p>
          </section>
        </div>
      </div>
    </div>`);
}

function openAccessControlPanel() {
  ensureAccessPanel();
  const modal = document.getElementById("profAccessControlModal");
  if (!modal) return;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("active"));
  void loadAccessControl();
}

function closeAccessControlPanel() {
  const modal = document.getElementById("profAccessControlModal");
  if (!modal) return;
  modal.classList.remove("active");
  window.setTimeout(() => { modal.hidden = true; }, 180);
}

function setAccessStatus(message, tone = "") {
  const status = document.getElementById("accessControlStatus");
  if (!status) return;
  status.textContent = message || "";
  status.dataset.tone = tone;
}

function renderAccessUsers() {
  const container = document.getElementById("accessUserList");
  if (!container) return;
  container.innerHTML = accessControlState.users.map(user => {
    const protectedAdmin = user.role === "admin";
    const canChangeAdmin = accessControlState.viewerOwner === true && user.owner !== true;
    return `
      <article class="access-user ${user.disabled ? "is-disabled" : ""}" data-access-user="${accessEscape(user.discordId)}">
        <div class="access-user-head"><div><strong>${accessEscape(user.name)}</strong><span>${accessEscape(user.discordId)} · ${user.sheetActive ? "Présent sur la feuille" : "Désactivé dans la feuille"}</span></div><span class="access-role">${user.owner ? "Propriétaire" : protectedAdmin ? "Admin" : user.disabled ? "Désactivé" : "Prof"}</span></div>
        <div class="access-permissions">${PERMISSIONS.map(([key, label]) => `<label><input type="checkbox" data-access-permission="${key}" ${user.permissions.includes(key) ? "checked" : ""} ${protectedAdmin ? "disabled" : ""}> ${label}</label>`).join("")}</div>
        <div class="access-user-actions">
          ${protectedAdmin ? "" : `<button type="button" class="prof-admin-small-btn gold" data-access-save>Enregistrer les pages</button><button type="button" class="prof-admin-small-btn danger" data-access-disable>${user.disabled ? "Réactiver le compte" : "Désactiver temporairement"}</button>`}
          ${canChangeAdmin ? `<button type="button" class="prof-admin-small-btn ${protectedAdmin ? "danger" : "gold"}" data-access-admin>${protectedAdmin ? "Retirer les droits admin" : "Donner les droits admin"}</button>` : ""}
          <button type="button" class="prof-admin-small-btn" data-access-disconnect>Déconnecter la session</button>
        </div>
      </article>`;
  }).join("") || `<p class="prof-admin-status">Aucun professeur trouvé dans la feuille Discord.</p>`;
}

function renderAccessLogs() {
  const container = document.getElementById("accessLogList");
  if (!container) return;
  const search = String(document.getElementById("accessLogSearch")?.value || "").trim().toLowerCase();
  const type = document.getElementById("accessLogType")?.value || "";
  const category = document.getElementById("accessLogCategory")?.value || "";
  const rows = accessControlState.logs.filter(log => {
    if (type && log.actorType !== type) return false;
    if (category && log.category !== category) return false;
    return !search || `${log.actorName} ${log.actorId} ${log.action} ${log.target}`.toLowerCase().includes(search);
  });
  container.innerHTML = rows.map(log => `
    <article class="access-log"><time>${accessEscape(new Date(log.timestampMs || log.timestamp).toLocaleString("fr-FR"))}</time><div><strong>${accessEscape(log.actorName)}</strong><small>${accessEscape(log.actorId)}</small></div><span>${accessEscape(log.category)}</span><div><strong>${accessEscape(log.action)}</strong>${log.target ? `<small>${accessEscape(log.target)}</small>` : ""}</div></article>
  `).join("") || `<p class="prof-admin-status">Aucune action pour ce filtre.</p>`;
}

function renderAccessControl() {
  renderAccessUsers();
  renderAccessLogs();
  const discord = document.getElementById("accessDiscordState");
  if (discord) {
    discord.textContent = accessControlState.discordChannelConfigured ? "Salon Discord actif" : "Salon Discord à configurer";
    discord.classList.toggle("ok", accessControlState.discordChannelConfigured);
  }
  const createButton = document.getElementById("createAuditChannelBtn");
  if (createButton) createButton.hidden = accessControlState.discordChannelConfigured;
}

async function loadAccessControl() {
  if (accessControlBusy) return;
  accessControlBusy = true;
  setAccessStatus("Chargement des accès et journaux…");
  try {
    accessControlState = await accessRequest();
    renderAccessControl();
    setAccessStatus("");
  } catch (error) {
    setAccessStatus(error?.message || "Chargement impossible.", "error");
  } finally {
    accessControlBusy = false;
  }
}

async function mutateAccess(card, action) {
  if (accessControlBusy || !card) return;
  const discordId = card.dataset.accessUser || "";
  const user = accessControlState.users.find(item => item.discordId === discordId);
  if (!user) return;
  let body = { action, discordId };
  if (action === "set-permissions") body.permissions = [...card.querySelectorAll("[data-access-permission]:checked")].map(input => input.dataset.accessPermission);
  if (action === "set-disabled") body.disabled = !user.disabled;
  if (action === "set-admin") body.admin = user.role !== "admin";
  const confirmation = action === "disconnect"
    ? `Déconnecter immédiatement ${user.name} de tous ses appareils ?`
    : action === "set-disabled" && !user.disabled
      ? `Désactiver temporairement le compte de ${user.name} ?`
      : action === "set-admin"
        ? `${user.role === "admin" ? "Retirer" : "Accorder"} les droits administrateur à ${user.name} ? Sa session actuelle sera fermée.`
      : "";
  if (confirmation && !window.confirm(confirmation)) return;

  accessControlBusy = true;
  setAccessStatus("Application de la modification…");
  try {
    await accessRequest("PATCH", body);
    setAccessStatus("Modification appliquée. Les anciennes sessions sont invalidées.", "ok");
    accessControlBusy = false;
    await loadAccessControl();
  } catch (error) {
    setAccessStatus(error?.message || "Modification impossible.", "error");
  } finally {
    accessControlBusy = false;
  }
}

function bindAccessEvents() {
  if (document.documentElement.dataset.accessControlBound === "true") return;
  document.documentElement.dataset.accessControlBound = "true";
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-close-access-control]")) closeAccessControlPanel();
    if (target?.id === "profAccessControlModal") closeAccessControlPanel();
    if (target?.closest("#reloadAccessControl")) void loadAccessControl();
    if (target?.closest("#createAuditChannelBtn")) {
      if (window.confirm("Créer un salon Discord privé #logs-universite visible par le rôle Admin ?")) {
        accessControlBusy = true;
        setAccessStatus("Création du salon Discord…");
        accessRequest("PATCH", { action: "create-audit-channel" })
          .then(() => {
            accessControlBusy = false;
            setAccessStatus("Salon Discord créé et relié au journal.", "ok");
            return loadAccessControl();
          })
          .catch(error => {
            accessControlBusy = false;
            setAccessStatus(error?.message || "Création du salon impossible.", "error");
          });
      }
    }
    const card = target?.closest("[data-access-user]");
    if (target?.closest("[data-access-save]")) void mutateAccess(card, "set-permissions");
    if (target?.closest("[data-access-disable]")) void mutateAccess(card, "set-disabled");
    if (target?.closest("[data-access-admin]")) void mutateAccess(card, "set-admin");
    if (target?.closest("[data-access-disconnect]")) void mutateAccess(card, "disconnect");
  }, true);
  document.addEventListener("input", event => {
    if (event.target?.matches?.("#accessLogSearch,#accessLogType,#accessLogCategory")) renderAccessLogs();
  });
  document.addEventListener("change", event => {
    if (event.target?.matches?.("#accessLogType,#accessLogCategory")) renderAccessLogs();
  });
}

function startAccessControl() {
  injectAccessStyles();
  bindAccessEvents();
  ensureAccessPanel();
}

window.openProfAccessControlPanel = openAccessControlPanel;
window.closeProfAccessControlPanel = closeAccessControlPanel;
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeAccessControlPanel();
});

if (document.body) startAccessControl();
else document.addEventListener("DOMContentLoaded", startAccessControl, { once: true });
