const HOTFIX_STATE = {
  profUiPromise: null,
  modulesPromise: null,
  adminPromise: null
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isDashboardVisible() {
  const dashboard = document.getElementById("profDashboard");
  if (!dashboard || dashboard.hidden) return false;

  return window.getComputedStyle(dashboard).display !== "none";
}

function loadClassicScriptOnce(src, id, runDomReadyListener = false) {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }

    const capturedDomReadyListeners = [];
    const originalAddEventListener = document.addEventListener.bind(document);

    if (runDomReadyListener) {
      document.addEventListener = function(type, listener, options) {
        if (type === "DOMContentLoaded" && typeof listener === "function") {
          capturedDomReadyListeners.push(listener);
        }

        return originalAddEventListener(type, listener, options);
      };
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (runDomReadyListener) {
        document.addEventListener = originalAddEventListener;
        capturedDomReadyListeners.forEach(listener => {
          try {
            listener.call(document, new Event("DOMContentLoaded"));
          } catch (error) {
            console.error("Initialisation prof-ui impossible :", error);
          }
        });
      }

      resolve();
    };
    script.onerror = () => {
      if (runDomReadyListener) document.addEventListener = originalAddEventListener;
      reject(new Error(`Script indisponible : ${src}`));
    };

    document.head.appendChild(script);
  });
}

function forceUnlockDashboard() {
  if (!isDashboardVisible()) return;

  const transition = document.getElementById("loginTransition");
  if (transition) {
    transition.hidden = true;
    transition.classList.remove("active");
    transition.style.pointerEvents = "none";
  }

  const loginSection = document.getElementById("loginSection");
  if (loginSection) {
    loginSection.classList.remove("leaving");
    loginSection.style.display = "none";
  }

  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.disabled = false;
    loginBtn.classList.remove("loading");
  }
}

async function loadProfUi() {
  if (!HOTFIX_STATE.profUiPromise) {
    HOTFIX_STATE.profUiPromise = loadClassicScriptOnce("../assets/js/prof-ui.js?v=1003", "profUiScript", true);
  }

  return HOTFIX_STATE.profUiPromise;
}

function openCorrectionsFallback() {
  const inlineCorrections = document.getElementById("inlineCorrections");
  const chooser = document.getElementById("inlineCorrectionChooser");
  const detail = document.getElementById("inlineCorrectionDetail");

  if (!inlineCorrections) return;

  inlineCorrections.hidden = false;
  chooser?.removeAttribute("hidden");
  detail?.setAttribute("hidden", "");

  requestAnimationFrame(() => {
    inlineCorrections.classList.add("active");
    inlineCorrections.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function bindCorrectionsButton() {
  const button = document.getElementById("openCorrectionsBtn");
  if (!button || button.dataset.hotfixBound === "true") return;

  button.dataset.hotfixBound = "true";
  button.addEventListener("click", async event => {
    if (button.dataset.profUiReady === "true") return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const previousText = button.querySelector("h2")?.textContent || "Corrigés";
    button.disabled = true;

    try {
      const title = button.querySelector("h2");
      if (title) title.textContent = "Chargement...";

      await loadProfUi();
      button.dataset.profUiReady = "true";
      button.disabled = false;

      if (title) title.textContent = previousText;
      setTimeout(() => button.click(), 40);
    } catch (error) {
      console.error("Chargement corrigés impossible :", error);
      button.disabled = false;
      const title = button.querySelector("h2");
      if (title) title.textContent = previousText;
      openCorrectionsFallback();
    }
  }, true);
}

function waitFor(predicate, timeout = 2500) {
  const startedAt = Date.now();

  return new Promise(resolve => {
    const tick = () => {
      const value = predicate();
      if (value) {
        resolve(value);
        return;
      }

      if (Date.now() - startedAt >= timeout) {
        resolve(null);
        return;
      }

      setTimeout(tick, 80);
    };

    tick();
  });
}

async function loadStudentModulesTools() {
  if (!HOTFIX_STATE.modulesPromise) {
    HOTFIX_STATE.modulesPromise = (async () => {
      await import("./prof-student-modules.js?v=1004");
      await import("./prof-student-modules-polish.js?v=1003");
    })();
  }

  return HOTFIX_STATE.modulesPromise;
}

function ensureStudentModulesLazyButton() {
  if (!isDashboardVisible()) return;
  if (document.getElementById("studentModulesBtn") || document.getElementById("studentModulesLazyBtn")) return;

  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "studentModulesLazyBtn";
  button.className = "btn secondary student-modules-btn";
  button.textContent = "Modules Élèves";

  button.addEventListener("click", async () => {
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = "Chargement...";

    try {
      await loadStudentModulesTools();
      await waitFor(() => typeof window.openStudentModulesPanel === "function", 3000);
      await sleep(350);

      if (typeof window.openStudentModulesPanel === "function") {
        window.openStudentModulesPanel();
      } else {
        alert("Modules élèves indisponible. Recharge la page une fois.");
      }
    } catch (error) {
      console.error("Modules élèves indisponible :", error);
      alert("Impossible de charger Modules élèves pour le moment.");
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  });

  logoutBtn.insertAdjacentElement("beforebegin", button);
}

async function loadAdminTools() {
  if (!HOTFIX_STATE.adminPromise) {
    HOTFIX_STATE.adminPromise = (async () => {
      await import("./prof-admin-drive-tools.js?v=1016");
      await import("./prof-admin-exam-settings.js?v=1021");
      await import("./prof-admin-exam-scale-wizard.js?v=1006");
    })();
  }

  return HOTFIX_STATE.adminPromise;
}

function bindAdminLazyButton() {
  const button = document.getElementById("profAdminLazyBtn");
  if (!button || button.dataset.hotfixBound === "true") return;

  button.dataset.hotfixBound = "true";
  button.addEventListener("click", async event => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = "Chargement...";

    try {
      await loadAdminTools();
      await waitFor(() => typeof window.openProfAdminPanel === "function", 3500);
      await sleep(700);

      if (typeof window.openProfAdminPanel === "function") {
        window.openProfAdminPanel();
      } else {
        alert("Espace admin indisponible. Recharge la page une fois.");
      }
    } catch (error) {
      console.error("Admin indisponible :", error);
      HOTFIX_STATE.adminPromise = null;
      alert("Impossible de charger l'espace admin pour le moment.");
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }, true);
}

function cleanDuplicateButtons() {
  const realAdmin = document.getElementById("profAdminBtn");
  const lazyAdmin = document.getElementById("profAdminLazyBtn");
  if (realAdmin && lazyAdmin) lazyAdmin.remove();

  const realModules = document.getElementById("studentModulesBtn");
  const lazyModules = document.getElementById("studentModulesLazyBtn");
  if (realModules && lazyModules) lazyModules.remove();
}

function tickDashboardHotfix() {
  forceUnlockDashboard();
  bindCorrectionsButton();
  bindAdminLazyButton();
  ensureStudentModulesLazyButton();
  cleanDuplicateButtons();
}

function startDashboardHotfix() {
  tickDashboardHotfix();

  const observer = new MutationObserver(tickDashboardHotfix);
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(tickDashboardHotfix, 700);
}

if (document.body) {
  startDashboardHotfix();
} else {
  document.addEventListener("DOMContentLoaded", startDashboardHotfix, { once: true });
}