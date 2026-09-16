(() => {
  const root = document.documentElement;
  const ARRIVAL_STORAGE_KEY = "universityLoginArrival";
  const compactViewport = window.matchMedia?.("(max-width: 900px)")?.matches === true;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const lowCpu = Number(navigator.hardwareConcurrency || 8) <= 4;
  const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
  const firefox = /firefox/i.test(navigator.userAgent || "");
  const performanceLite = compactViewport
    || lowCpu
    || lowMemory
    || connection?.saveData === true
    || firefox;
  root.classList.add("university-motion");
  root.classList.toggle("university-performance-lite", performanceLite);

  // Les animations font partie intégrante de l'interface Université.
  // Elles restent actives même si le système demande moins de mouvement.
  const reduceMotion = false;
  root.classList.remove("university-motion-reduced");

  const wait = duration => new Promise(resolve => {
    const safeDuration = Math.max(0, Number(duration) || 0);
    window.setTimeout(resolve, reduceMotion ? Math.min(safeDuration, 220) : safeDuration);
  });

  let transitionStartedAt = 0;
  let pendingArrival = null;

  try {
    const savedArrival = JSON.parse(window.sessionStorage.getItem(ARRIVAL_STORAGE_KEY) || "null");
    if (savedArrival && Date.now() - Number(savedArrival.createdAt || 0) < 12000) {
      pendingArrival = savedArrival;
      root.classList.add("university-login-arrival");
    }
    window.sessionStorage.removeItem(ARRIVAL_STORAGE_KEY);
  } catch (error) {
    pendingArrival = null;
  }

  function ensureAccessTransition() {
    let layer = document.getElementById("universityAccessTransition");
    if (layer) return layer;

    layer = document.createElement("div");
    layer.id = "universityAccessTransition";
    layer.className = "university-access-transition";
    layer.hidden = true;
    layer.setAttribute("role", "status");
    layer.setAttribute("aria-live", "polite");
    layer.setAttribute("aria-atomic", "true");
    layer.innerHTML = `
      <div class="university-access-aura" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="university-access-transition-card">
        <i class="university-access-corner corner-a" aria-hidden="true"></i>
        <i class="university-access-corner corner-b" aria-hidden="true"></i>
        <div class="university-access-transition-logo" aria-hidden="true">
          <span class="university-access-orbit orbit-a"></span>
          <span class="university-access-orbit orbit-b"></span>
          <img src="/Images/logo.webp" alt="">
          <strong>✓</strong>
        </div>
        <p class="university-access-transition-kicker">ACCÈS SÉCURISÉ</p>
        <h2 data-transition-title>Connexion en cours</h2>
        <p data-transition-detail>Vérification de votre accès…</p>
        <div class="university-access-steps" aria-hidden="true">
          <span data-step="identity"><i></i>Identité</span>
          <span data-step="rights"><i></i>Autorisations</span>
          <span data-step="space"><i></i>Espace</span>
        </div>
        <div class="university-access-transition-progress" aria-hidden="true"><i></i></div>
      </div>`;
    document.body.append(layer);
    return layer;
  }

  function updateAccessTransition({ mode = "enter", phase = "checking", title, detail, complete = false } = {}) {
    const layer = ensureAccessTransition();
    layer.dataset.mode = mode;
    layer.dataset.phase = phase;
    layer.classList.toggle("is-complete", complete);
    const titleNode = layer.querySelector("[data-transition-title]");
    const detailNode = layer.querySelector("[data-transition-detail]");
    if (title && titleNode) titleNode.textContent = title;
    if (detail && detailNode) detailNode.textContent = detail;
    return layer;
  }

  function beginAccessTransition(options = {}) {
    const layer = updateAccessTransition({ phase: "checking", ...options, complete: false });
    transitionStartedAt = performance.now();
    layer.hidden = false;
    layer.classList.remove("is-visible", "is-complete", "is-welcome", "is-departing");
    document.documentElement.classList.add("university-transitioning");
    void layer.offsetWidth;
    layer.classList.add("is-visible");

    window.setTimeout(() => {
      if (!layer.classList.contains("is-visible") || layer.classList.contains("is-complete")) return;
      layer.dataset.phase = "validating";
      const detailNode = layer.querySelector("[data-transition-detail]");
      if (detailNode) {
        detailNode.textContent = layer.dataset.mode === "exit"
          ? "Fermeture sécurisée de la session…"
          : "Contrôle des autorisations…";
      }
    }, reduceMotion ? 80 : 520);
  }

  async function completeAccessTransition(options = {}) {
    const minimum = Number(options.minimum ?? 1000);
    const elapsed = performance.now() - transitionStartedAt;
    if (elapsed < minimum) await wait(minimum - elapsed);

    updateAccessTransition({
      mode: options.mode || "enter",
      phase: "validated",
      title: options.validatedTitle || "Accès validé",
      detail: options.validatedDetail || "Votre accès est autorisé.",
      complete: true
    });
    await wait(Number(options.validationHold ?? 480));

    const layer = updateAccessTransition({
      mode: options.mode || "enter",
      phase: "welcome",
      title: options.title || "Bienvenue",
      detail: options.detail || "Préparation de votre espace…",
      complete: true
    });
    layer.classList.add("is-welcome");
    await wait(Number(options.hold ?? 620));
  }

  async function departAccessTransition({ detail = "Ouverture de votre espace…" } = {}) {
    const layer = ensureAccessTransition();
    const detailNode = layer.querySelector("[data-transition-detail]");
    if (detailNode) detailNode.textContent = detail;
    layer.classList.add("is-departing");
    await wait(380);
  }

  function prepareArrival({ label = "Utilisateur", role = "" } = {}) {
    try {
      window.sessionStorage.setItem(ARRIVAL_STORAGE_KEY, JSON.stringify({
        label: String(label || "Utilisateur"),
        role: String(role || ""),
        createdAt: Date.now()
      }));
    } catch (error) {
      // La navigation reste fonctionnelle si le stockage de session est indisponible.
    }
  }

  async function hideAccessTransition() {
    const layer = document.getElementById("universityAccessTransition");
    if (!layer) return;
    layer.classList.add("is-departing");
    await wait(280);
    layer.classList.remove("is-visible", "is-complete", "is-welcome", "is-departing");
    layer.hidden = true;
    document.documentElement.classList.remove("university-transitioning");
  }

  async function playArrivalTransition(arrival) {
    const layer = updateAccessTransition({
      mode: "enter",
      phase: "welcome",
      title: `Bienvenue, ${arrival.label || "Utilisateur"}`,
      detail: "Votre espace est prêt.",
      complete: true
    });
    layer.hidden = false;
    layer.classList.add("is-visible", "is-welcome");
    document.documentElement.classList.add("university-transitioning");
    await wait(760);
    layer.classList.add("is-departing");
    document.documentElement.classList.add("university-page-reveal");
    await wait(460);
    layer.hidden = true;
    layer.classList.remove("is-visible", "is-complete", "is-welcome", "is-departing");
    document.documentElement.classList.remove("university-transitioning", "university-login-arrival", "university-page-reveal");
  }

  window.UniversityMotion = Object.freeze({
    beginAccess: beginAccessTransition,
    completeAccess: completeAccessTransition,
    departAccess: departAccessTransition,
    prepareArrival,
    hideAccess: hideAccessTransition,
    async showExit({ title = "À bientôt", detail = "Fermeture de votre session…" } = {}) {
      beginAccessTransition({ mode: "exit", phase: "checking", title: "Déconnexion en cours", detail });
      const minimum = reduceMotion ? 180 : 760;
      const elapsed = performance.now() - transitionStartedAt;
      if (elapsed < minimum) await wait(minimum - elapsed);
      updateAccessTransition({
        mode: "exit",
        phase: "validated",
        title,
        detail: "Session fermée · retour au portail…",
        complete: true
      });
      await wait(620);
    }
  });

  document.addEventListener("university:show-exit", event => {
    void window.UniversityMotion.showExit(event.detail || {});
  });

  const itemSelector = [
    ".access-card",
    ".stage-header",
    ".dashboard-top",
    ".company-hero",
    ".stage-card",
    ".company-column",
    ".admin-summary-card",
    ".v2-nav-item",
    ".apex-hero",
    ".apex-kpi",
    ".apex-panel",
    ".v2-apex-hero",
    ".v2-apex-stat-card",
    ".v2-apex-panel",
    ".v2-settings-card",
    ".v2-settings-panel:not([hidden])",
    ".v2-preference-card",
    ".exam-v2-hero",
    ".exam-stat-card",
    ".rp-v2-hero",
    ".custom-cockpit-stat",
    ".custom-card",
    ".vehicle-card",
    ".home-card",
    ".showroom-hero",
    ".workshop-bay",
    ".vehicle-page .page-top",
    ".vehicle-page .media-column",
    ".vehicle-page .info-card",
    ".modules-summary > *"
  ].join(",");

  let sequence = 0;

  function animateItem(element) {
    if (!(element instanceof HTMLElement)) return;
    if (element.classList.contains("university-motion-item")) return;
    if (element.hidden) return;

    const delay = Math.min(sequence % 9, 7) * 48;
    sequence += 1;
    element.style.setProperty("--university-motion-delay", `${delay}ms`);
    element.classList.add("university-motion-item");
  }

  function decorate(scope) {
    if (!(scope instanceof Element || scope instanceof Document)) return;
    if (scope instanceof Element && scope.matches(itemSelector)) animateItem(scope);
    scope.querySelectorAll(itemSelector).forEach(animateItem);
  }

  async function start() {
    const pendingNodes = new Set();
    let decorationFrame = 0;
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (node instanceof Element) pendingNodes.add(node);
        });
      });

      if (decorationFrame) return;
      decorationFrame = window.requestAnimationFrame(() => {
        decorationFrame = 0;
        pendingNodes.forEach(decorate);
        pendingNodes.clear();
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("pointerdown", event => {
      const control = event.target.closest?.("button, a, [role='button']");
      if (!(control instanceof HTMLElement) || control.matches(":disabled")) return;
      control.classList.remove("motion-feedback");
      void control.offsetWidth;
      control.classList.add("motion-feedback");
    }, { passive: true });

    document.addEventListener("animationend", event => {
      if (event.animationName === "university-feedback") {
        event.target.classList.remove("motion-feedback");
      }
    });

    if (pendingArrival) await playArrivalTransition(pendingArrival);
    decorate(document);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    void start();
  }
})();
