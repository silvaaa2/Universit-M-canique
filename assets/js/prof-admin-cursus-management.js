const CURSUS_ADMIN_TAB = "cursusManagement";
let cursusAdminStarted = false;
let cursusAdminBusy = false;

function escapeCursusAdminHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function waitForCursusFirebase() {
  if (window.profFirebase?.auth) return Promise.resolve(window.profFirebase);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Connexion Firebase indisponible.")), 8000);
    window.addEventListener("profFirebaseReady", () => {
      window.clearTimeout(timeout);
      resolve(window.profFirebase);
    }, { once: true });
  });
}

async function getCursusAdminToken() {
  const firebase = await waitForCursusFirebase();
  const user = firebase.auth?.currentUser || window.currentProfUser;
  if (!user?.getIdToken) return "";
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("La session administrateur met trop de temps à répondre.")), 10000);
  });
  try {
    return await Promise.race([user.getIdToken(false), timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

async function requestCursusAdmin(method = "GET", body = null) {
  const token = await getCursusAdminToken();
  if (!token) throw new Error("Reconnecte-toi avec le compte administrateur.");
  const response = await fetch("/api/access/session?admin=cursus-management", {
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

function injectCursusAdminStyles() {
  if (document.getElementById("profAdminCursusStyles")) return;
  const style = document.createElement("style");
  style.id = "profAdminCursusStyles";
  style.textContent = `
    .cursus-admin-layout { display: grid; gap: 16px; }
    .cursus-admin-card { padding: 16px; border: 1px solid rgba(255,255,255,.09); border-radius: 11px; background: rgba(255,255,255,.025); }
    .cursus-admin-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .cursus-admin-card-head h3, .cursus-admin-card-head p { margin: 0; }
    .cursus-admin-card-head h3 { color: var(--text); font-size: 18px; }
    .cursus-admin-card-head p { margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.45; }
    .cursus-admin-counts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .cursus-admin-count { padding: 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 9px; background: rgba(0,0,0,.22); }
    .cursus-admin-count span, .cursus-admin-count strong { display: block; }
    .cursus-admin-count span { color: var(--muted); font-size: 10px; font-weight: 950; text-transform: uppercase; letter-spacing: .08em; }
    .cursus-admin-count strong { margin-top: 5px; color: var(--gold2); font-size: 24px; }
    .cursus-admin-period { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .cursus-admin-period label, .cursus-sheet-field { display: grid; gap: 7px; color: var(--muted); font-size: 11px; font-weight: 950; }
    .cursus-admin-period input, .cursus-sheet-field input { min-width: 0; height: 42px; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 0 12px; background: rgba(0,0,0,.28); color: var(--text); font: inherit; }
    .cursus-admin-steps { display: grid; grid-template-columns: 1fr; gap: 10px; }
    .cursus-admin-step { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center; padding: 13px; border: 1px solid rgba(255,255,255,.09); border-radius: 10px; background: rgba(0,0,0,.18); }
    .cursus-admin-step-number { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%; background: rgba(214,180,106,.13); color: var(--gold2); font-weight: 1000; }
    .cursus-admin-step strong, .cursus-admin-step small { display: block; }
    .cursus-admin-step strong { color: var(--text); font-size: 13px; }
    .cursus-admin-step small { margin-top: 4px; color: var(--muted); font-size: 10px; line-height: 1.4; }
    .cursus-admin-step button { grid-column: 1 / -1; width: 100%; }
    .cursus-admin-step.done { border-color: rgba(74,222,128,.27); background: rgba(74,222,128,.055); }
    .cursus-admin-step.done .cursus-admin-step-number { background: rgba(74,222,128,.16); color: #86efac; }
    .cursus-admin-status { min-height: 20px; margin: 12px 0 0; color: var(--muted); font-size: 12px; font-weight: 850; }
    .cursus-admin-status[data-tone="ok"] { color: #86efac; }
    .cursus-admin-status[data-tone="error"] { color: #fca5a5; }
    .cursus-sheet-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
    .cursus-sheet-card { display: grid; gap: 11px; padding: 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 10px; background: rgba(0,0,0,.18); }
    .cursus-sheet-card h4, .cursus-sheet-card p { margin: 0; }
    .cursus-sheet-card h4 { color: var(--gold2); font-size: 14px; }
    .cursus-sheet-card p { color: var(--muted); font-size: 11px; line-height: 1.4; }
    .cursus-sheet-fields { display: grid; grid-template-columns: minmax(0, 1fr) 100px; gap: 9px; }
    .cursus-sheet-field:first-child { grid-column: 1 / -1; }
    .cursus-admin-layout.is-busy { opacity: .72; pointer-events: none; }
    @media (max-width: 780px) {
      .cursus-admin-counts, .cursus-admin-steps, .cursus-sheet-grid, .cursus-admin-period { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);
}

function setCursusAdminStatus(message, tone = "") {
  const status = document.getElementById("cursusAdminStatus");
  if (status) {
    status.textContent = message || "";
    status.dataset.tone = tone;
  }
}

function setEffectifSaveStatus(message, tone = "") {
  const status = document.getElementById("cursusEffectifSaveStatus");
  if (!status) return;
  status.textContent = message || "";
  status.dataset.tone = tone;
}

function setCursusAdminBusy(value) {
  cursusAdminBusy = value;
  document.getElementById("cursusAdminLayout")?.classList.toggle("is-busy", value);
  document.querySelectorAll("#profAdminCursusPanel button, #profAdminCursusPanel input").forEach(element => {
    element.disabled = value || element.dataset.workflowDisabled === "true";
  });
}

function getDefaultArchiveDates() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  const toValue = date => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  return { start: toValue(start), end: toValue(end) };
}

function ensureCursusAdminPanel() {
  const modal = document.getElementById("profAdminModal");
  const tabs = modal?.querySelector(".prof-admin-tabs");
  const workspace = modal?.querySelector(".prof-admin-workspace");
  if (!modal || !tabs || !workspace) return;
  injectCursusAdminStyles();

  if (!tabs.querySelector(`[data-admin-tab="${CURSUS_ADMIN_TAB}"]`)) {
    tabs.insertAdjacentHTML("beforeend", `<button type="button" class="prof-admin-tab" data-admin-tab="${CURSUS_ADMIN_TAB}">Archives & effectifs</button>`);
  }
  if (!document.getElementById("profAdminCursusPanel")) {
    const dates = getDefaultArchiveDates();
    workspace.insertAdjacentHTML("beforeend", `
      <section id="profAdminCursusPanel" class="prof-admin-panel" data-admin-panel="${CURSUS_ADMIN_TAB}" hidden>
        <div class="prof-admin-toolbar">
          <button type="button" class="prof-admin-small-btn" id="reloadCursusAdminBtn">Actualiser</button>
          <span class="prof-admin-status">Archives existantes conservées · opération réservée à l’administrateur</span>
        </div>
        <div class="cursus-admin-layout" id="cursusAdminLayout">
          <article class="cursus-admin-card">
            <div class="cursus-admin-card-head">
              <div><h3>Archiver le cursus complet</h3><p>Une seule action archive les stages, les entreprises, les examens et tous les élèves des modules.</p></div>
            </div>
            <div class="cursus-admin-counts">
              <div class="cursus-admin-count"><span>Effectif commun</span><strong id="cursusEffectifCount">—</strong></div>
              <div class="cursus-admin-count"><span>Stages attribués</span><strong id="cursusStageCount">—</strong></div>
              <div class="cursus-admin-count"><span>Examens</span><strong id="cursusExamCount">—</strong></div>
            </div>
            <div class="cursus-admin-period">
              <label>Date de début<input id="cursusArchiveStart" type="date" value="${dates.start}"></label>
              <label>Date de fin<input id="cursusArchiveEnd" type="date" value="${dates.end}"></label>
            </div>
            <div class="cursus-admin-steps">
              <div class="cursus-admin-step" id="cursusArchiveStep">
                <span class="cursus-admin-step-number">✓</span>
                <div><strong>Stages + modules</strong><small>L’effectif complet est sauvegardé dans les deux archives, y compris les élèves sans progression.</small></div>
                <button type="button" class="prof-admin-small-btn gold" id="archiveAllCursusBtn">Archiver tout le cursus</button>
              </div>
            </div>
            <p class="cursus-admin-status" id="cursusAdminStatus" role="status" aria-live="polite"></p>
          </article>

          <article class="cursus-admin-card">
            <div class="cursus-admin-card-head">
              <div><h3>Source Google Sheets commune</h3><p>Ce lien alimente à la fois Modules élèves, le Suivi de stage, les entreprises et les futures archives.</p></div>
            </div>
            <div class="cursus-sheet-grid">
              <form class="cursus-sheet-card" id="cursusSharedEffectifForm">
                <div><h4>Effectif commun</h4><p>Un seul changement s’applique partout sur le site.</p></div>
                <div class="cursus-sheet-fields">
                  <label class="cursus-sheet-field">Lien Google Sheets<input type="url" data-sheet-link autocomplete="off" placeholder="https://docs.google.com/spreadsheets/d/..."></label>
                  <label class="cursus-sheet-field">GID<input type="text" inputmode="numeric" data-sheet-gid autocomplete="off"></label>
                </div>
                <button type="button" class="prof-admin-small-btn gold" id="saveSharedEffectifBtn" onclick="window.saveSharedCursusEffectif()">Enregistrer pour Modules + Stages</button>
                <p class="cursus-admin-status" id="cursusEffectifSaveStatus" role="status" aria-live="polite"></p>
              </form>
            </div>
          </article>
        </div>
      </section>
    `);
    bindCursusAdminEvents();
  }

  const tab = tabs.querySelector(`[data-admin-tab="${CURSUS_ADMIN_TAB}"]`);
  if (tab && tab.dataset.cursusBound !== "true") {
    tab.dataset.cursusBound = "true";
    tab.addEventListener("click", loadCursusAdminState);
  }
}

function fillEffectifForm(settings) {
  const form = document.getElementById("cursusSharedEffectifForm");
  if (!form || !settings) return;
  const link = form.querySelector("[data-sheet-link]");
  const gid = form.querySelector("[data-sheet-gid]");
  if (link) link.value = settings.link || "";
  if (gid) gid.value = settings.gid || "";
}

function renderCursusAdminState(state) {
  const counts = state.counts || {};
  document.getElementById("cursusEffectifCount").textContent = String(counts.effectif ?? 0);
  document.getElementById("cursusStageCount").textContent = String(counts.stages ?? 0);
  document.getElementById("cursusExamCount").textContent = String(counts.exams ?? 0);
  fillEffectifForm(state.settings?.sharedEffectif || state.settings?.stageEffectif || state.settings?.moduleEffectif);

  const workflow = state.workflow;
  const archiveDone = workflow?.status === "complete";
  const archiveButton = document.getElementById("archiveAllCursusBtn");
  document.getElementById("cursusArchiveStep")?.classList.toggle("done", archiveDone);
  if (archiveButton) {
    const resumable = ["stage-running", "stage-complete", "module-running"].includes(workflow?.status);
    archiveButton.textContent = archiveDone
      ? "Cursus archivé ✓"
      : resumable
        ? "Reprendre l’archivage complet"
        : "Archiver tout le cursus";
  }

  if (workflow?.period?.startDate) {
    document.getElementById("cursusArchiveStart").value = workflow.period.startDate;
    document.getElementById("cursusArchiveEnd").value = workflow.period.endDate;
  }
  if (["stage-running", "stage-complete", "module-running"].includes(workflow?.status)) {
    setCursusAdminStatus("Un archivage incomplet a été détecté. Clique sur Reprendre pour le terminer.");
  } else if (workflow?.status === "complete") {
    setCursusAdminStatus("Le dernier cursus a été entièrement archivé.", "ok");
  } else {
    setCursusAdminStatus("");
  }
}

async function loadCursusAdminState() {
  if (cursusAdminBusy) return;
  try {
    setCursusAdminBusy(true);
    setCursusAdminStatus("Chargement des données…");
    renderCursusAdminState(await requestCursusAdmin());
  } catch (error) {
    setCursusAdminStatus(error?.message || "Chargement impossible.", "error");
  } finally {
    setCursusAdminBusy(false);
  }
}

async function runArchiveAll() {
  if (cursusAdminBusy) return;
  const startDate = document.getElementById("cursusArchiveStart")?.value || "";
  const endDate = document.getElementById("cursusArchiveEnd")?.value || "";
  if (!window.confirm("Archiver en une fois les stages, les entreprises, les examens et les modules de tout l’effectif ?")) return;

  try {
    setCursusAdminBusy(true);
    setCursusAdminStatus("Archivage complet en cours…");
    await requestCursusAdmin("POST", { action: "archive-all", startDate, endDate });
    renderCursusAdminState(await requestCursusAdmin());
    setCursusAdminStatus("Archivage complet : stages, examens et modules sauvegardés.", "ok");
  } catch (error) {
    setCursusAdminStatus(error?.message || "Archivage impossible.", "error");
  } finally {
    setCursusAdminBusy(false);
  }
}

async function saveEffectifForm(form) {
  if (cursusAdminBusy) return;
  const link = form.querySelector("[data-sheet-link]")?.value?.trim() || "";
  const gid = form.querySelector("[data-sheet-gid]")?.value?.trim() || "";
  const button = document.getElementById("saveSharedEffectifBtn");
  if (!link || !/^\d+$/.test(gid)) {
    setEffectifSaveStatus("Ajoute un lien Google Sheets complet avec son GID.", "error");
    return;
  }
  try {
    setCursusAdminBusy(true);
    if (button) button.textContent = "Enregistrement…";
    setCursusAdminStatus("Enregistrement du lien commun…");
    setEffectifSaveStatus("Enregistrement en cours…");
    await requestCursusAdmin("PATCH", { action: "save-effectif", link, gid });
    renderCursusAdminState(await requestCursusAdmin());
    setCursusAdminStatus("Lien enregistré pour Modules élèves et Suivi de stage.", "ok");
    setEffectifSaveStatus("Lien appliqué à Modules élèves et au Suivi de stage.", "ok");
  } catch (error) {
    console.error("Enregistrement de l’effectif commun impossible :", error);
    setCursusAdminStatus(error?.message || "Enregistrement impossible.", "error");
    setEffectifSaveStatus(error?.message || "Enregistrement impossible.", "error");
  } finally {
    setCursusAdminBusy(false);
    if (button) button.textContent = "Enregistrer pour Modules + Stages";
  }
}

window.saveSharedCursusEffectif = function() {
  const form = document.getElementById("cursusSharedEffectifForm");
  if (!form) return;
  void saveEffectifForm(form);
};

function bindCursusAdminEvents() {
  if (document.documentElement.dataset.cursusAdminEventsBound === "true") return;
  document.documentElement.dataset.cursusAdminEventsBound = "true";

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("#reloadCursusAdminBtn")) {
      event.preventDefault();
      void loadCursusAdminState();
    }
    if (target?.closest("#archiveAllCursusBtn")) {
      event.preventDefault();
      void runArchiveAll();
    }
  }, true);

  document.addEventListener("submit", event => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (form?.id !== "cursusSharedEffectifForm") return;
    event.preventDefault();
    event.stopPropagation();
    void saveEffectifForm(form);
  }, true);

  document.addEventListener("input", event => {
    const linkInput = event.target instanceof Element ? event.target.closest("#cursusSharedEffectifForm [data-sheet-link]") : null;
    if (!linkInput) return;
    const form = document.getElementById("cursusSharedEffectifForm");
    const gid = String(event.target.value || "").match(/[?&#]gid=([0-9]+)/)?.[1] || "";
    const gidInput = form?.querySelector("[data-sheet-gid]");
    if (gid && gidInput) gidInput.value = gid;
  }, true);
}

function startCursusAdminTool() {
  if (cursusAdminStarted) return;
  cursusAdminStarted = true;
  injectCursusAdminStyles();
  const observer = new MutationObserver(ensureCursusAdminPanel);
  observer.observe(document.body, { childList: true, subtree: true });
  ensureCursusAdminPanel();
}

if (document.body) startCursusAdminTool();
else document.addEventListener("DOMContentLoaded", startCursusAdminTool, { once: true });
