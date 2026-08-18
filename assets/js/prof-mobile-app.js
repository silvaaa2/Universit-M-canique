(() => {
  const body = document.body;

  if (!body?.classList.contains("prof-v2-page")) return;
  if (document.querySelector("[data-prof-mobile-appbar]")) return;

  const currentPage = window.location.pathname.split("/").pop() || "espace-prof.html";
  const pageMeta = {
    "espace-prof.html": {
      title: "Centre professeur",
      section: "home"
    },
    "espace-prof-v2.html": {
      title: "Centre professeur",
      section: "home"
    },
    "prof-rp-7x92q.html": {
      title: "Corrections customs",
      section: "customs"
    },
    "prof-exam-4x91q.html": {
      title: "Corrections examens",
      section: "exams"
    },
    "prof-modules-eleves.html": {
      title: "Suivi des modules",
      section: "modules"
    },
    "prof-customs-eleves.html": {
      title: "Accès aux customs",
      section: "access"
    }
  };

  const currentMeta = pageMeta[currentPage] || {
    title: "Espace professeur",
    section: "home"
  };

  const mobileSectionOrder = ["home", "customs", "exams", "modules", "access"];
  const navigationTransitionKey = "profMobileNavigationTransition";
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let incomingTransition = null;

  try {
    const savedTransition = JSON.parse(sessionStorage.getItem(navigationTransitionKey) || "null");
    const isRecent = Date.now() - Number(savedTransition?.createdAt || 0) < 2500;

    if (isRecent && savedTransition?.to === currentMeta.section) {
      incomingTransition = savedTransition;
    }

    sessionStorage.removeItem(navigationTransitionKey);
  } catch (error) {
    console.warn("Transition mobile indisponible :", error);
  }

  if (incomingTransition && !reducedMotionQuery.matches) {
    body.classList.add(
      "prof-mobile-page-entering",
      incomingTransition.direction > 0 ? "prof-mobile-nav-forward" : "prof-mobile-nav-backward"
    );

    window.setTimeout(() => {
      body.classList.remove("prof-mobile-page-entering", "prof-mobile-nav-forward", "prof-mobile-nav-backward");
    }, 480);
  }

  const appbar = document.createElement("header");
  appbar.className = "prof-mobile-appbar";
  appbar.dataset.profMobileAppbar = "true";
  appbar.innerHTML = `
    <a class="prof-mobile-brand" href="espace-prof.html" aria-label="Tableau de bord professeur">
      <img src="../Images/logo.png" alt="">
      <span>
        <small>Centre professeur</small>
        <strong>${currentMeta.title}</strong>
      </span>
    </a>
    <span class="prof-mobile-online" aria-label="Session active"><i></i>Actif</span>
    <button type="button" class="prof-mobile-menu-trigger" data-prof-mobile-menu-open aria-label="Ouvrir le menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  `;

  const tabbar = document.createElement("nav");
  tabbar.className = "prof-mobile-tabbar";
  tabbar.dataset.profMobileTabbar = "true";
  tabbar.setAttribute("aria-label", "Navigation mobile professeur");
  tabbar.innerHTML = `
    <a href="espace-prof.html" data-mobile-section="home">
      <span class="prof-mobile-tab-icon" aria-hidden="true">⌂</span>
      <small>Accueil</small>
    </a>
    <a href="prof-rp-7x92q.html" data-mobile-section="customs">
      <span class="prof-mobile-tab-icon" aria-hidden="true">◆</span>
      <small>Customs</small>
    </a>
    <a href="prof-exam-4x91q.html" data-mobile-section="exams">
      <span class="prof-mobile-tab-icon" aria-hidden="true">✓</span>
      <small>Examens</small>
    </a>
    <a href="prof-modules-eleves.html" data-mobile-section="modules">
      <span class="prof-mobile-tab-icon" aria-hidden="true">▦</span>
      <small>Modules</small>
    </a>
    <a href="prof-customs-eleves.html" data-mobile-section="access">
      <span class="prof-mobile-tab-icon" aria-hidden="true">⚙</span>
      <small>Gérer</small>
    </a>
  `;

  const tabGlider = document.createElement("span");
  tabGlider.className = "prof-mobile-tab-glider";
  tabGlider.setAttribute("aria-hidden", "true");
  tabbar.prepend(tabGlider);

  const menu = document.createElement("div");
  menu.className = "prof-mobile-menu";
  menu.dataset.profMobileMenu = "true";
  menu.hidden = true;
  menu.innerHTML = `
    <button type="button" class="prof-mobile-menu-backdrop" data-prof-mobile-menu-close aria-label="Fermer le menu"></button>
    <section class="prof-mobile-menu-sheet" role="dialog" aria-modal="true" aria-label="Menu professeur">
      <div class="prof-mobile-menu-handle" aria-hidden="true"></div>
      <div class="prof-mobile-menu-head">
        <div>
          <small>Compte professeur</small>
          <strong data-prof-mobile-user>Professeur</strong>
        </div>
        <button type="button" data-prof-mobile-menu-close aria-label="Fermer">×</button>
      </div>

      <div class="prof-mobile-menu-grid">
        <a href="espace-prof.html"><span>AC</span><strong>Tableau de bord</strong><small>Résumé du cursus</small></a>
        <a href="prof-rp-7x92q.html"><span>CU</span><strong>Réponses customs</strong><small>Valider les customs</small></a>
        <a href="prof-exam-4x91q.html"><span>EX</span><strong>Examens</strong><small>Corriger les copies</small></a>
        <a href="prof-modules-eleves.html"><span>MO</span><strong>Modules élèves</strong><small>Cocher et dater</small></a>
        <a href="prof-customs-eleves.html"><span>GE</span><strong>Accès customs</strong><small>Ouvrir ou fermer</small></a>
        <a href="../index.html"><span>SI</span><strong>Site principal</strong><small>Voir l’université</small></a>
      </div>

      <div class="prof-mobile-menu-tools">
        <button type="button" data-mobile-action="notifications" hidden>Notifications</button>
        <button type="button" data-mobile-action="settings" hidden>Paramètres</button>
        <button type="button" data-mobile-theme="dark">Mode sombre</button>
        <button type="button" data-mobile-theme="light">Mode clair</button>
        <button type="button" data-simplified-toggle role="switch" aria-checked="false">
          Mode Simplifié : <span data-simplified-label>Désactivé</span>
        </button>
        <button type="button" data-mobile-action="logout" hidden>Déconnexion</button>
      </div>
    </section>
  `;

  const statusDock = document.createElement("div");
  statusDock.className = "student-status-actions prof-mobile-status-dock";
  statusDock.dataset.profMobileStatusDock = "true";
  statusDock.setAttribute("aria-label", "Actions de correction");
  statusDock.hidden = true;

  const correctionProgress = document.createElement("div");
  correctionProgress.className = "prof-mobile-correction-progress";
  correctionProgress.setAttribute("aria-hidden", "true");
  correctionProgress.innerHTML = "<span></span>";
  correctionProgress.hidden = true;

  const quickCorrection = document.createElement("section");
  quickCorrection.className = "prof-mobile-quick-correction";
  quickCorrection.dataset.profMobileQuickCorrection = "true";
  quickCorrection.setAttribute("aria-label", "Navigation rapide entre les copies");
  quickCorrection.hidden = true;
  quickCorrection.innerHTML = `
    <button type="button" class="prof-mobile-quick-arrow" data-quick-correction-prev aria-label="Copie précédente">‹</button>
    <div class="prof-mobile-quick-copy">
      <strong data-quick-correction-count>Copie 1 / 1</strong>
      <span data-quick-correction-save>Sauvegarde auto</span>
    </div>
    <button type="button" class="prof-mobile-quick-auto" data-quick-correction-auto aria-pressed="true">Auto</button>
    <button type="button" class="prof-mobile-quick-arrow" data-quick-correction-next aria-label="Copie suivante">›</button>
  `;

  body.prepend(appbar);
  body.append(menu, tabbar, statusDock, quickCorrection, correctionProgress);
  window.profSimplifiedMode?.sync();

  const tabLinks = Array.from(tabbar.querySelectorAll("[data-mobile-section]"));

  tabLinks.forEach((link) => {
    const isActive = link.dataset.mobileSection === currentMeta.section;
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
  });

  function positionTabGlider(link, immediate = false) {
    if (!(link instanceof HTMLElement) || !tabbar.offsetWidth) return;

    const tabbarRect = tabbar.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();

    if (immediate) tabGlider.classList.add("is-instant");

    tabGlider.style.setProperty("--pm-tab-x", `${linkRect.left - tabbarRect.left}px`);
    tabGlider.style.setProperty("--pm-tab-y", `${linkRect.top - tabbarRect.top}px`);
    tabGlider.style.setProperty("--pm-tab-width", `${linkRect.width}px`);
    tabGlider.style.setProperty("--pm-tab-height", `${linkRect.height}px`);

    if (immediate) {
      window.requestAnimationFrame(() => tabGlider.classList.remove("is-instant"));
    }
  }

  function setActiveMobileTab(link) {
    tabLinks.forEach((candidate) => {
      const isActive = candidate === link;
      candidate.classList.toggle("active", isActive);

      if (isActive) candidate.setAttribute("aria-current", "page");
      else candidate.removeAttribute("aria-current");
    });

    positionTabGlider(link);
  }

  let mobileNavigationInProgress = false;

  tabbar.addEventListener("click", (event) => {
    const link = event.target instanceof Element
      ? event.target.closest("a[data-mobile-section]")
      : null;
    if (!(link instanceof HTMLAnchorElement)) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target === "_blank" || link.hasAttribute("download")) return;

    const targetSection = link.dataset.mobileSection;
    const currentIndex = mobileSectionOrder.indexOf(currentMeta.section);
    const targetIndex = mobileSectionOrder.indexOf(targetSection);

    if (mobileNavigationInProgress || targetIndex < 0 || currentIndex < 0) {
      event.preventDefault();
      return;
    }

    if (targetSection === currentMeta.section) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: reducedMotionQuery.matches ? "auto" : "smooth" });
      return;
    }

    event.preventDefault();
    mobileNavigationInProgress = true;

    const direction = targetIndex > currentIndex ? 1 : -1;
    const directionClass = direction > 0 ? "prof-mobile-nav-forward" : "prof-mobile-nav-backward";

    tabbar.classList.add("is-navigating");
    setActiveMobileTab(link);

    if (reducedMotionQuery.matches) {
      window.location.assign(link.href);
      return;
    }

    body.classList.add("prof-mobile-page-leaving", directionClass);

    try {
      sessionStorage.setItem(navigationTransitionKey, JSON.stringify({
        from: currentMeta.section,
        to: targetSection,
        direction,
        createdAt: Date.now()
      }));
    } catch (error) {
      console.warn("Transition mobile indisponible :", error);
    }

    window.setTimeout(() => window.location.assign(link.href), 285);
  });

  window.addEventListener("resize", () => {
    const activeLink = tabbar.querySelector("a.active");
    positionTabGlider(activeLink, true);
    syncMobileSkeletons();
  }, { passive: true });

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;

    mobileNavigationInProgress = false;
    tabbar.classList.remove("is-navigating");
    body.classList.remove("prof-mobile-page-leaving", "prof-mobile-nav-forward", "prof-mobile-nav-backward");

    const activeLink = tabLinks.find((link) => link.dataset.mobileSection === currentMeta.section);
    if (activeLink) {
      setActiveMobileTab(activeLink);
      window.requestAnimationFrame(() => positionTabGlider(activeLink, true));
    }
  });

  const trigger = appbar.querySelector("[data-prof-mobile-menu-open]");
  const menuSheet = menu.querySelector(".prof-mobile-menu-sheet");
  let lastFocusedElement = null;

  function openMenu() {
    lastFocusedElement = document.activeElement;
    menu.hidden = false;
    body.classList.add("prof-mobile-menu-open");
    trigger?.setAttribute("aria-expanded", "true");
    window.requestAnimationFrame(() => {
      menu.classList.add("is-open");
      menuSheet?.querySelector("[data-prof-mobile-menu-close]")?.focus();
    });
  }

  function closeMenu() {
    menu.classList.remove("is-open");
    body.classList.remove("prof-mobile-menu-open");
    trigger?.setAttribute("aria-expanded", "false");

    window.setTimeout(() => {
      menu.hidden = true;
      if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
    }, 180);
  }

  trigger?.addEventListener("click", openMenu);
  menu.querySelectorAll("[data-prof-mobile-menu-close]").forEach((button) => {
    button.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) closeMenu();
  });

  function findDisplayName() {
    const selectors = [
      "#v2UserEmail",
      "#rpUserEmail",
      "#examUserEmail",
      "#modulesUserEmail",
      "#customsUserEmail"
    ];

    for (const selector of selectors) {
      const value = document.querySelector(selector)?.textContent?.trim();
      if (value && value !== "Professeur") return value;
    }

    try {
      const profile = JSON.parse(localStorage.getItem("profV2Profile") || "{}");
      if (String(profile.displayName || "").trim()) return String(profile.displayName).trim();
    } catch (error) {
      console.warn("Profil mobile indisponible :", error);
    }

    return "Professeur";
  }

  function syncMobileUser() {
    const target = menu.querySelector("[data-prof-mobile-user]");
    if (target) target.textContent = findDisplayName();
  }

  syncMobileUser();
  window.setTimeout(syncMobileUser, 600);
  window.setTimeout(syncMobileUser, 1400);

  const notificationButton = document.getElementById("v2NotificationsBtn");
  const settingsButton = document.getElementById("profSettingsBtn");
  const logoutButton = document.getElementById("logoutBtn");

  const mobileNotificationButton = menu.querySelector('[data-mobile-action="notifications"]');
  const mobileSettingsButton = menu.querySelector('[data-mobile-action="settings"]');
  const mobileLogoutButton = menu.querySelector('[data-mobile-action="logout"]');

  if (notificationButton && mobileNotificationButton) {
    mobileNotificationButton.hidden = false;
    mobileNotificationButton.addEventListener("click", () => {
      closeMenu();
      notificationButton.click();
    });
  }

  if (settingsButton && mobileSettingsButton) {
    mobileSettingsButton.hidden = false;
    mobileSettingsButton.addEventListener("click", () => {
      closeMenu();
      settingsButton.click();
    });
  }

  if (logoutButton && mobileLogoutButton) {
    mobileLogoutButton.hidden = false;
    mobileLogoutButton.addEventListener("click", () => {
      closeMenu();
      logoutButton.click();
    });
  }

  menu.querySelectorAll("[data-mobile-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      const theme = button.dataset.mobileTheme === "light" ? "light" : "dark";
      const existingThemeButton = document.querySelector(`[data-theme-choice="${theme}"]`);

      if (existingThemeButton instanceof HTMLElement) {
        existingThemeButton.click();
      } else {
        body.dataset.theme = theme;
        try {
          localStorage.setItem("profV2Theme", theme);
        } catch (error) {
          console.warn("Thème mobile indisponible :", error);
        }
      }

      closeMenu();
    });
  });

  const dashboard = document.getElementById("profDashboard");
  let statusDockSignature = "";
  let activeCorrectionCard = null;
  let quickCorrectionCard = null;
  let quickAdvanceTimer = null;
  let quickAutoAdvanceEnabled = true;

  try {
    quickAutoAdvanceEnabled = localStorage.getItem("profMobileAutoAdvance") !== "false";
  } catch (error) {
    console.warn("Préférence de correction rapide indisponible :", error);
  }

  const quickCount = quickCorrection.querySelector("[data-quick-correction-count]");
  const quickSave = quickCorrection.querySelector("[data-quick-correction-save]");
  const quickPrevious = quickCorrection.querySelector("[data-quick-correction-prev]");
  const quickNext = quickCorrection.querySelector("[data-quick-correction-next]");
  const quickAuto = quickCorrection.querySelector("[data-quick-correction-auto]");

  function isSimplifiedCorrectionMode() {
    return document.documentElement.classList.contains("prof-simplified-mode");
  }

  function syncQuickAutoButton() {
    const simplified = isSimplifiedCorrectionMode();
    if (quickAuto && quickAuto.hidden !== simplified) quickAuto.hidden = simplified;
    quickAuto?.classList.toggle("active", quickAutoAdvanceEnabled);
    quickAuto?.setAttribute("aria-pressed", quickAutoAdvanceEnabled ? "true" : "false");
    if (quickAuto) quickAuto.textContent = quickAutoAdvanceEnabled ? "Auto ✓" : "Auto";
  }

  function setQuickSaveState(state) {
    if (!quickSave) return;

    const labels = {
      ready: "Sauvegarde auto",
      saving: "Enregistrement…",
      saved: "Enregistré ✓",
      done: "Dernière copie ✓",
      error: "Échec · réessayer"
    };

    quickSave.dataset.state = state;
    quickSave.textContent = labels[state] || labels.ready;
  }

  function getCorrectionCards() {
    return Array.from(document.querySelectorAll(".student-answer-card"))
      .filter((card) => !card.hidden && card.getClientRects().length > 0);
  }

  function openCorrectionCard(card) {
    if (!(card instanceof HTMLElement)) return false;

    const trigger = card.querySelector(".student-card-open-zone[data-toggle-card], [data-toggle-card]");
    if (!(trigger instanceof HTMLElement)) return false;

    trigger.click();
    return true;
  }

  function moveQuickCorrection(offset) {
    const cards = getCorrectionCards();
    const openCard = document.querySelector(".student-answer-card.is-open");
    const currentIndex = cards.indexOf(openCard);
    const target = cards[currentIndex + offset];

    if (!target) return false;
    return openCorrectionCard(target);
  }

  function syncQuickCorrection(openCard) {
    const isMobile = window.matchMedia("(max-width: 900px)").matches;

    if (!isMobile || !openCard) {
      if (!quickCorrection.hidden) quickCorrection.hidden = true;
      quickCorrectionCard = null;
      return;
    }

    const cards = getCorrectionCards();
    const currentIndex = cards.indexOf(openCard);

    if (currentIndex < 0) {
      if (!quickCorrection.hidden) quickCorrection.hidden = true;
      return;
    }

    if (quickCorrectionCard !== openCard) {
      if (quickAdvanceTimer) window.clearTimeout(quickAdvanceTimer);
      quickAdvanceTimer = null;
      quickCorrectionCard = openCard;
      setQuickSaveState("ready");
    }

    if (quickCount) quickCount.textContent = `Copie ${currentIndex + 1} / ${cards.length}`;
    const previousDisabled = currentIndex <= 0;
    const nextDisabled = currentIndex >= cards.length - 1;
    if (quickPrevious && quickPrevious.disabled !== previousDisabled) {
      quickPrevious.disabled = previousDisabled;
    }
    if (quickNext && quickNext.disabled !== nextDisabled) {
      quickNext.disabled = nextDisabled;
    }

    syncQuickAutoButton();
    if (quickCorrection.hidden) quickCorrection.hidden = false;
  }

  quickPrevious?.addEventListener("click", () => moveQuickCorrection(-1));
  quickNext?.addEventListener("click", () => moveQuickCorrection(1));
  quickAuto?.addEventListener("click", () => {
    quickAutoAdvanceEnabled = !quickAutoAdvanceEnabled;
    syncQuickAutoButton();

    try {
      localStorage.setItem("profMobileAutoAdvance", String(quickAutoAdvanceEnabled));
    } catch (error) {
      console.warn("Préférence de correction rapide indisponible :", error);
    }
  });

  window.addEventListener("prof:correction-save", (event) => {
    const detail = event.detail || {};
    const openCard = document.querySelector(".student-answer-card.is-open");

    if (!openCard || detail.card !== openCard) return;

    setQuickSaveState(detail.state || "ready");

    if (
      detail.state !== "saved" ||
      !detail.advance ||
      !quickAutoAdvanceEnabled ||
      isSimplifiedCorrectionMode()
    ) return;

    if (quickAdvanceTimer) window.clearTimeout(quickAdvanceTimer);
    quickAdvanceTimer = window.setTimeout(() => {
      quickAdvanceTimer = null;
      if (!quickAutoAdvanceEnabled || !moveQuickCorrection(1)) setQuickSaveState("done");
    }, 520);
  });

  window.addEventListener("prof:simplified-mode-change", () => {
    if (isSimplifiedCorrectionMode() && quickAdvanceTimer) {
      window.clearTimeout(quickAdvanceTimer);
      quickAdvanceTimer = null;
    }

    syncQuickAutoButton();
    syncOverlayState();
  });

  function updateCorrectionProgress() {
    if (!activeCorrectionCard) return;
    const scrollable = Math.max(0, activeCorrectionCard.scrollHeight - activeCorrectionCard.clientHeight);
    const progress = scrollable ? activeCorrectionCard.scrollTop / scrollable : 1;
    correctionProgress.style.setProperty("--pm-correction-progress", String(Math.min(1, Math.max(0, progress))));
  }

  function syncCorrectionProgress(openCard) {
    if (activeCorrectionCard !== openCard) {
      activeCorrectionCard?.removeEventListener("scroll", updateCorrectionProgress);
      activeCorrectionCard = openCard || null;
      activeCorrectionCard?.addEventListener("scroll", updateCorrectionProgress, { passive: true });
    }

    const shouldShow = Boolean(openCard && window.matchMedia("(max-width: 900px)").matches);
    if (correctionProgress.hidden !== !shouldShow) correctionProgress.hidden = !shouldShow;
    updateCorrectionProgress();
  }

  function hideStatusDock() {
    if (!statusDock.hidden) statusDock.hidden = true;
    if (statusDock.childElementCount) statusDock.replaceChildren();
    statusDockSignature = "";
  }

  function syncStatusDock(openCard) {
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    const source = openCard?.querySelector(".student-status-actions");

    if (!isMobile || !source || source.hidden) {
      hideStatusDock();
      return;
    }

    const sourceButtons = Array.from(source.querySelectorAll("[data-set-status]"));
    if (!sourceButtons.length) {
      hideStatusDock();
      return;
    }

    const signature = sourceButtons.map((button) => [
      button.dataset.setStatus || "",
      button.className,
      button.disabled ? "disabled" : "enabled",
      button.textContent?.trim() || ""
    ].join(":")).join("|");

    if (signature !== statusDockSignature) {
      const dockButtons = sourceButtons.map((button) => {
        const clone = button.cloneNode(true);
        clone.removeAttribute("data-set-status");
        clone.dataset.mobileSetStatus = button.dataset.setStatus || "";
        clone.disabled = button.disabled;
        return clone;
      });

      statusDock.replaceChildren(...dockButtons);
      statusDockSignature = signature;
    }

    if (statusDock.hidden) statusDock.hidden = false;
  }

  statusDock.addEventListener("click", (event) => {
    const dockButton = event.target.closest("[data-mobile-set-status]");
    if (!dockButton || dockButton.disabled) return;

    const openCard = document.querySelector(".student-answer-card.is-open");
    const requestedStatus = dockButton.dataset.mobileSetStatus;
    const sourceButton = Array.from(openCard?.querySelectorAll("[data-set-status]") || [])
      .find((button) => button.dataset.setStatus === requestedStatus);

    sourceButton?.click();
  });

  function syncSessionVisibility() {
    const hasVisibleDashboard = !dashboard || !dashboard.hidden;
    const wasVisible = body.classList.contains("mobile-prof-session");
    body.classList.toggle("mobile-prof-session", hasVisibleDashboard);

    if (hasVisibleDashboard && !wasVisible) {
      window.requestAnimationFrame(() => {
        positionTabGlider(tabbar.querySelector("a.active"), true);
      });
    }
  }

  function syncOverlayState() {
    const openCard = document.querySelector(".student-answer-card.is-open");
    body.classList.toggle(
      "mobile-correction-open",
      Boolean(openCard)
    );
    body.classList.toggle(
      "mobile-warning-open",
      Boolean(document.querySelector(".module-warning-modal.is-open"))
    );
    syncStatusDock(openCard);
    syncCorrectionProgress(openCard);
    syncQuickCorrection(openCard);
    syncMobileSkeletons();
  }

  function syncMobileSkeletons() {
    const loaders = document.querySelectorAll("#sheetStatus, #modulesLoader, .customs-v2-loading");
    const isMobile = window.matchMedia("(max-width: 900px)").matches;

    if (!isMobile) {
      loaders.forEach((loader) => {
        loader.classList.remove("prof-mobile-loading");
        loader.querySelector(":scope > .prof-mobile-skeleton")?.remove();
      });
      return;
    }

    loaders.forEach((loader) => {
      const isLoading = Boolean(loader.querySelector(".inline-loader, .modules-spinner, .customs-loader"));
      let skeleton = loader.querySelector(":scope > .prof-mobile-skeleton");

      if (isLoading && !skeleton) {
        skeleton = document.createElement("div");
        skeleton.className = "prof-mobile-skeleton";
        skeleton.setAttribute("aria-hidden", "true");
        skeleton.innerHTML = "<i></i><i></i><i></i>";
        loader.appendChild(skeleton);
      }

      loader.classList.toggle("prof-mobile-loading", isLoading);

      if (!isLoading && skeleton) skeleton.remove();
    });
  }

  syncSessionVisibility();
  syncOverlayState();

  window.requestAnimationFrame(() => {
    const activeLink = tabbar.querySelector("a.active");
    positionTabGlider(activeLink, true);
  });

  let interfaceSyncQueued = false;
  const observer = new MutationObserver(() => {
    if (interfaceSyncQueued) return;
    interfaceSyncQueued = true;

    window.requestAnimationFrame(() => {
      interfaceSyncQueued = false;
      syncSessionVisibility();
      syncOverlayState();
    });
  });

  observer.observe(body, {
    attributes: true,
    attributeFilter: ["class", "hidden", "disabled"],
    childList: true,
    subtree: true
  });
})();
