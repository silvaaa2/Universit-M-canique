const COMPANY_CODES_TAB = "companyCodes";
const COMPANY_CODE_PLACEHOLDERS = [
  { id: "bennys", name: "Benny's", loading: true },
  { id: "lsc", name: "LSC", loading: true },
  { id: "paleto", name: "Paleto Garage", loading: true },
  { id: "harmony", name: "Harmony Repair", loading: true },
  { id: "cayo", name: "Cayo Garage", loading: true },
  { id: "portolina", name: "Portolina Mechanic", loading: true },
  { id: "favelas", name: "Favelas Repair", loading: true }
];

let companyCodeToolStarted = false;
let companyCodeLoadPromise = null;

function escapeCompanyCodeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function injectCompanyCodeStyles() {
  if (document.getElementById("profAdminCompanyCodeStyles")) return;
  const style = document.createElement("style");
  style.id = "profAdminCompanyCodeStyles";
  style.textContent = `
    .prof-admin-company-intro {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      margin-bottom: 16px;
      padding: 15px;
      border: 1px solid rgba(214,180,106,.18);
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(214,180,106,.09), rgba(255,255,255,.025));
    }
    .prof-admin-company-intro strong { display: block; color: var(--gold2); font-size: 15px; }
    .prof-admin-company-intro p { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .prof-admin-company-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .prof-admin-company-card { padding: 15px; border: 1px solid rgba(255,255,255,.09); border-radius: 10px; background: rgba(255,255,255,.03); }
    .prof-admin-company-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 13px; }
    .prof-admin-company-head strong { font-size: 15px; color: var(--text); }
    .prof-admin-company-state { padding: 5px 8px; border-radius: 999px; background: rgba(255,255,255,.06); color: var(--muted); font-size: 11px; font-weight: 900; }
    .prof-admin-company-state.custom { background: rgba(74,222,128,.10); color: #86efac; }
    .prof-admin-company-form { display: grid; gap: 9px; }
    .prof-admin-company-form label { color: var(--muted); font-size: 12px; font-weight: 900; }
    .prof-admin-company-password { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    .prof-admin-company-save { justify-self: start; margin-top: 3px; }
    .prof-admin-company-card small { display: block; margin-top: 10px; color: var(--muted); font-size: 11px; }
    #companyCodesStatus[data-tone="ok"] { color: #86efac; }
    #companyCodesStatus[data-tone="error"] { color: #fca5a5; }
    @media (max-width: 780px) {
      .prof-admin-company-grid { grid-template-columns: 1fr; }
      .prof-admin-company-intro { display: block; }
    }
  `;
  document.head.appendChild(style);
}

function setCompanyCodeStatus(message, tone = "") {
  const status = document.getElementById("companyCodesStatus");
  if (!status) return;
  status.textContent = message || "";
  status.dataset.tone = tone;
}

function waitForCompanyCodeFirebase() {
  if (window.profFirebase?.auth) return Promise.resolve(window.profFirebase);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Firebase indisponible.")), 7000);
    window.addEventListener("profFirebaseReady", () => {
      window.clearTimeout(timeout);
      resolve(window.profFirebase);
    }, { once: true });
  });
}

async function getCompanyCodeAdminToken() {
  const firebase = await waitForCompanyCodeFirebase();
  const user = firebase.auth?.currentUser || window.currentProfUser;
  return user?.getIdToken ? user.getIdToken() : "";
}

function formatCompanyCodeDate(value, loading = false) {
  if (loading) return "Vérification de l’accès…";
  if (!value) return "Code initial actif";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Code personnalisé actif"
    : `Modifié le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(date)}`;
}

function renderCompanyCodeCards(companies) {
  const container = document.getElementById("companyCodesList");
  if (!container) return;
  container.innerHTML = companies.map(company => `
    <article class="prof-admin-company-card" data-company-code-card="${escapeCompanyCodeHtml(company.id)}">
      <div class="prof-admin-company-head">
        <strong>${escapeCompanyCodeHtml(company.name)}</strong>
        <span class="prof-admin-company-state ${company.customized ? "custom" : ""}">
          ${company.loading ? "Vérification…" : company.customized ? "Code personnalisé" : "Code initial"}
        </span>
      </div>
      <form class="prof-admin-company-form" data-company-code-form="${escapeCompanyCodeHtml(company.id)}" novalidate>
        <label>Nouveau code d’accès</label>
        <div class="prof-admin-company-password">
          <input class="prof-admin-input" name="newCode" type="password" minlength="8" maxlength="64" autocomplete="new-password" autocapitalize="characters" spellcheck="false" required placeholder="8 caractères minimum">
          <button type="button" class="prof-admin-small-btn" data-company-code-toggle>Afficher</button>
        </div>
        <label>Confirmer le nouveau code</label>
        <input class="prof-admin-input" name="confirmation" type="password" minlength="8" maxlength="64" autocomplete="new-password" autocapitalize="characters" spellcheck="false" required placeholder="Retapez le code">
        <button type="submit" class="prof-admin-small-btn gold prof-admin-company-save">Changer le code</button>
      </form>
      <small>${escapeCompanyCodeHtml(formatCompanyCodeDate(company.updatedAt, company.loading))}</small>
    </article>
  `).join("");

  container.querySelectorAll("[data-company-code-toggle]").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const input = toggle.closest(".prof-admin-company-password")?.querySelector("input");
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      toggle.textContent = input.type === "password" ? "Afficher" : "Masquer";
    });
  });
  container.querySelectorAll("[data-company-code-form]").forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
      saveCompanyCode(form);
    });
  });
}

async function loadCompanyCodes() {
  if (companyCodeLoadPromise) return companyCodeLoadPromise;
  companyCodeLoadPromise = (async () => {
    try {
      setCompanyCodeStatus("Chargement des accès…");
      const token = await getCompanyCodeAdminToken();
      if (!token) throw new Error("Reconnecte-toi avec ton compte administrateur.");
      const response = await fetch("/api/access/session?admin=company-codes", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Chargement impossible.");
      const companies = Array.isArray(payload.companies) ? payload.companies : [];
      renderCompanyCodeCards(companies.length ? companies : COMPANY_CODE_PLACEHOLDERS);
      setCompanyCodeStatus(companies.length ? "Accès à jour." : "Liste temporairement indisponible.", companies.length ? "ok" : "error");
    } catch (error) {
      setCompanyCodeStatus(error?.message || "Chargement impossible.", "error");
    } finally {
      companyCodeLoadPromise = null;
    }
  })();
  return companyCodeLoadPromise;
}

async function saveCompanyCode(form) {
  const companyId = form.dataset.companyCodeForm || "";
  const card = form.closest("[data-company-code-card]");
  const companyName = card?.querySelector(".prof-admin-company-head strong")?.textContent?.trim() || "cette entreprise";
  const newCode = form.elements.newCode?.value || "";
  const confirmation = form.elements.confirmation?.value || "";
  const normalizedCode = newCode.trim().replace(/\s+/g, "");

  if (normalizedCode.length < 8 || normalizedCode.length > 64 || !/[a-z]/i.test(normalizedCode) || !/\d/.test(normalizedCode)) {
    setCompanyCodeStatus("Le nouveau code doit contenir 8 à 64 caractères, avec au moins une lettre et un chiffre.", "error");
    form.elements.newCode?.focus();
    return;
  }
  if (newCode !== confirmation) {
    setCompanyCodeStatus("Les deux codes ne correspondent pas.", "error");
    form.elements.confirmation?.focus();
    return;
  }
  if (!window.confirm(`Remplacer le code d’accès de ${companyName} ? L’ancien code et les sessions ouvertes seront désactivés.`)) return;

  const button = form.querySelector("[type='submit']");
  try {
    button.disabled = true;
    setCompanyCodeStatus(`Modification de ${companyName}…`);
    const token = await getCompanyCodeAdminToken();
    if (!token) throw new Error("Reconnecte-toi avec ton compte administrateur.");
    const response = await fetch("/api/access/session?admin=company-codes", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ companyId, newCode, confirmation })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Modification impossible.");
    form.reset();
    await loadCompanyCodes();
    setCompanyCodeStatus(`Nouveau code enregistré pour ${companyName}.`, "ok");
  } catch (error) {
    setCompanyCodeStatus(error?.message || "Modification impossible.", "error");
  } finally {
    button.disabled = false;
  }
}

function ensureCompanyCodePanel() {
  const modal = document.getElementById("profAdminModal");
  const tabs = modal?.querySelector(".prof-admin-tabs");
  const workspace = modal?.querySelector(".prof-admin-workspace");
  if (!modal || !tabs || !workspace) return;

  if (!tabs.querySelector(`[data-admin-tab="${COMPANY_CODES_TAB}"]`)) {
    tabs.insertAdjacentHTML("beforeend", `<button type="button" class="prof-admin-tab" data-admin-tab="${COMPANY_CODES_TAB}">Accès entreprises</button>`);
  }
  if (!document.getElementById("profCompanyCodesPanel")) {
    workspace.insertAdjacentHTML("beforeend", `
      <section id="profCompanyCodesPanel" class="prof-admin-panel" data-admin-panel="${COMPANY_CODES_TAB}" hidden>
        <div class="prof-admin-toolbar">
          <button type="button" class="prof-admin-small-btn" id="reloadCompanyCodesBtn">Actualiser</button>
          <span class="prof-admin-status" id="companyCodesStatus"></span>
        </div>
        <div class="prof-admin-company-intro">
          <div>
            <strong>Mots de passe des entreprises</strong>
            <p>Le code actuel n’est jamais affiché. Après un changement, l’ancien code et les sessions déjà ouvertes sont automatiquement refusés.</p>
          </div>
        </div>
        <div class="prof-admin-company-grid" id="companyCodesList"></div>
      </section>
    `);
  }

  const tab = tabs.querySelector(`[data-admin-tab="${COMPANY_CODES_TAB}"]`);
  if (tab && tab.dataset.companyCodesBound !== "true") {
    tab.dataset.companyCodesBound = "true";
    tab.addEventListener("click", loadCompanyCodes);
  }

  const reloadButton = document.getElementById("reloadCompanyCodesBtn");
  if (reloadButton && reloadButton.dataset.companyCodesBound !== "true") {
    reloadButton.dataset.companyCodesBound = "true";
    reloadButton.addEventListener("click", loadCompanyCodes);
  }

  const list = document.getElementById("companyCodesList");
  if (list && !list.childElementCount) renderCompanyCodeCards(COMPANY_CODE_PLACEHOLDERS);
}

function startCompanyCodeTool() {
  if (companyCodeToolStarted) return;
  companyCodeToolStarted = true;
  injectCompanyCodeStyles();
  const observer = new MutationObserver(ensureCompanyCodePanel);
  observer.observe(document.body, { childList: true, subtree: true });
  ensureCompanyCodePanel();
}

if (document.body) startCompanyCodeTool();
else document.addEventListener("DOMContentLoaded", startCompanyCodeTool, { once: true });

window.loadProfAdminCompanyCodes = loadCompanyCodes;
