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
  return user ? user.getIdToken(true) : "";
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
    .cursus-admin-counts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .cursus-admin-count { padding: 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 9px; background: rgba(0,0,0,.22); }
    .cursus-admin-count span, .cursus-admin-count strong { display: block; }
    .cursus-admin-count span { color: var(--muted); font-size: 10px; font-weight: 950; text-transform: uppercase; letter-spacing: .08em; }
    .cursus-admin-count strong { margin-top: 5px; color: var(--gold2); font-size: 24px; }
    .cursus-admin-period { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .cursus-admin-period label, .cursus-sheet-field { display: grid; gap: 7px; color: var(--muted); font-size: 11px; font-weight: 950; }
    .cursus-admin-period input, .cursus-sheet-field input { min-width: 0; height: 42px; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 0 12px; background: rgba(0,0,0,.28); color: var(--text); font: inherit; }
    .cursus-admin-steps { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
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
    .cursus-sheet-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
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
              <div><h3>Archiver le cursus en deux étapes</h3><p>Les deux étapes archivent l’effectif Google Sheets complet, même pour les élèves sans stage, examen ou module.</p></div>
            </div>
            <div class="cursus-admin-counts">
              <div class="cursus-admin-count"><span>Effectif stage</span><strong id="cursusEffectifCount">—</strong></div>
              <div class="cursus-admin-count"><span>Stages attribués</span><strong id="cursusStageCount">—</strong></div>
              <div class="cursus-admin-count"><span>Examens</span><strong id="cursusExamCount">—</strong></div>
              <div class="cursus-admin-count"><span>Effectif modules</span><strong id="cursusModuleCount">—</strong></div>
            </div>
            <div class="cursus-admin-period">
              <label>Date de début<input id="cursusArchiveStart" type="date" value="${dates.start}"></label>
              <label>Date de fin<input id="cursusArchiveEnd" type="date" value="${dates.end}"></label>
            </div>
            <div class="cursus-admin-steps">
              <div class="cursus-admin-step" id="cursusStageStep">
                <span class="cursus-admin-step-number">1</span>
                <div><strong>Stages et entreprises</strong><small>Archive tout l’effectif, les attributions et les examens, puis vide le cursus stage actif.</small></div>
                <button type="button" class="prof-admin-small-btn gold" id="archiveStagesStepBtn">Archiver les stages</button>
              </div>
              <div class="cursus-admin-step" id="cursusModuleStep">
                <span class="cursus-admin-step-number">2</span>
                <div><strong>Modules élèves</strong><small>Archive chaque élève de l’effectif ; les modules non réalisés restent décochés.</small></div>
                <button type="button" class="prof-admin-small-btn gold" id="archiveModulesStepBtn" data-workflow-disabled="true" disabled>Archiver les modules</button>
              </div>
            </div>
            <p class="cursus-admin-status" id="cursusAdminStatus" role="status" aria-live="polite"></p>
          </article>

          <article class="cursus-admin-card">
            <div class="cursus-admin-card-head">
              <div><h3>Sources Google Sheets</h3><p>Les deux effectifs sont désormais indépendants. Modifier le lien des modules ne change plus le suivi de stage.</p></div>
            </div>
            <div class="cursus-sheet-grid">
              <form class="cursus-sheet-card" data-effectif-target="modules">
                <div><h4>Effectif · Modules élèves</h4><p>Utilisé par le pointage et la progression des modules.</p></div>
                <div class="cursus-sheet-fields">
                  <label class="cursus-sheet-field">Lien Google Sheets<input type="url" data-sheet-link autocomplete="off" placeholder="https://docs.google.com/spreadsheets/d/..."></label>
                  <label class="cursus-sheet-field">GID<input type="text" inputmode="numeric" data-sheet-gid autocomplete="off"></label>
                </div>
                <button type="submit" class="prof-admin-small-btn gold">Enregistrer le lien modules</button>
              </form>
              <form class="cursus-sheet-card" data-effectif-target="stages">
                <div><h4>Effectif · Suivi de Stage</h4><p>Utilisé dans l’effectif et les fiches visibles côté entreprises.</p></div>
                <div class="cursus-sheet-fields">
                  <label class="cursus-sheet-field">Lien Google Sheets<input type="url" data-sheet-link autocomplete="off" placeholder="https://docs.google.com/spreadsheets/d/..."></label>
                  <label class="cursus-sheet-field">GID<input type="text" inputmode="numeric" data-sheet-gid autocomplete="off"></label>
                </div>
                <button type="submit" class="prof-admin-small-btn gold">Enregistrer le lien stage</button>
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

function fillEffectifForm(target, settings) {
  const form = document.querySelector(`[data-effectif-target="${target}"]`);
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
  document.getElementById("cursusModuleCount").textContent = String(counts.modules ?? 0);
  fillEffectifForm("modules", state.settings?.moduleEffectif);
  fillEffectifForm("stages", state.settings?.stageEffectif);

  const workflow = state.workflow;
  const stageDone = ["stage-complete", "module-running", "complete"].includes(workflow?.status);
  const moduleDone = workflow?.status === "complete";
  const moduleButton = document.getElementById("archiveModulesStepBtn");
  document.getElementById("cursusStageStep")?.classList.toggle("done", stageDone);
  document.getElementById("cursusModuleStep")?.classList.toggle("done", moduleDone);
  if (moduleButton) {
    const locked = !["stage-complete", "module-running"].includes(workflow?.status);
    moduleButton.dataset.workflowDisabled = String(locked);
    moduleButton.disabled = locked || cursusAdminBusy;
    moduleButton.textContent = moduleDone ? "Modules archivés ✓" : "Archiver les modules";
  }

  if (workflow?.period?.startDate) {
    document.getElementById("cursusArchiveStart").value = workflow.period.startDate;
    document.getElementById("cursusArchiveEnd").value = workflow.period.endDate;
  }
  if (workflow?.status === "stage-complete") {
    setCursusAdminStatus("Étape 1 terminée. Lance maintenant l’archive des modules.", "ok");
  } else if (workflow?.status === "module-running") {
    setCursusAdminStatus("L’archive des modules doit être terminée. Relance l’étape 2.");
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

async function runArchiveStep(action) {
  if (cursusAdminBusy) return;
  const startDate = document.getElementById("cursusArchiveStart")?.value || "";
  const endDate = document.getElementById("cursusArchiveEnd")?.value || "";
  const isStageStep = action === "archive-stages";
  const message = isStageStep
    ? "Archiver les entreprises, les stagiaires et les examens, puis vider le cursus stage actif ?"
    : "Créer maintenant l’archive des modules élèves et remettre le pointage actif à zéro ?";
  if (!window.confirm(message)) return;

  try {
    setCursusAdminBusy(true);
    setCursusAdminStatus(isStageStep ? "Archivage des stages en cours…" : "Archivage des modules en cours…");
    await requestCursusAdmin("POST", { action, startDate, endDate });
    renderCursusAdminState(await requestCursusAdmin());
    setCursusAdminStatus(isStageStep
      ? "Étape 1 terminée. Vérifie puis lance l’étape 2."
      : "Archivage complet : stages et modules sauvegardés.", "ok");
  } catch (error) {
    setCursusAdminStatus(error?.message || "Archivage impossible.", "error");
  } finally {
    setCursusAdminBusy(false);
  }
}

async function saveEffectifForm(form) {
  if (cursusAdminBusy) return;
  const target = form.dataset.effectifTarget;
  const link = form.querySelector("[data-sheet-link]")?.value?.trim() || "";
  const gid = form.querySelector("[data-sheet-gid]")?.value?.trim() || "";
  try {
    setCursusAdminBusy(true);
    setCursusAdminStatus(`Enregistrement du lien ${target === "modules" ? "modules" : "stage"}…`);
    await requestCursusAdmin("PATCH", { action: "save-effectif", target, link, gid });
    renderCursusAdminState(await requestCursusAdmin());
    setCursusAdminStatus("Lien Google Sheets enregistré.", "ok");
  } catch (error) {
    setCursusAdminStatus(error?.message || "Enregistrement impossible.", "error");
  } finally {
    setCursusAdminBusy(false);
  }
}

function bindCursusAdminEvents() {
  document.getElementById("reloadCursusAdminBtn")?.addEventListener("click", loadCursusAdminState);
  document.getElementById("archiveStagesStepBtn")?.addEventListener("click", () => runArchiveStep("archive-stages"));
  document.getElementById("archiveModulesStepBtn")?.addEventListener("click", () => runArchiveStep("archive-modules"));
  document.querySelectorAll("[data-effectif-target]").forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
      saveEffectifForm(form);
    });
    form.querySelector("[data-sheet-link]")?.addEventListener("input", event => {
      const gid = String(event.target.value || "").match(/[?&#]gid=([0-9]+)/)?.[1] || "";
      const gidInput = form.querySelector("[data-sheet-gid]");
      if (gid && gidInput) gidInput.value = gid;
    });
  });
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
