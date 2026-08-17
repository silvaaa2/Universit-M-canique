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

  const appbar = document.createElement("header");
  appbar.className = "prof-mobile-appbar";
  appbar.dataset.profMobileAppbar = "true";
  appbar.innerHTML = `
    <a class="prof-mobile-brand" href="espace-prof.html" aria-label="Tableau de bord professeur">
      <img src="../Images/logo.png" alt="">
      <span>
        <small>Mécanique · Université</small>
        <strong>${currentMeta.title}</strong>
      </span>
    </a>
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
      <span class="prof-mobile-tab-icon">AC</span>
      <small>Accueil</small>
    </a>
    <a href="prof-rp-7x92q.html" data-mobile-section="customs">
      <span class="prof-mobile-tab-icon">CU</span>
      <small>Customs</small>
    </a>
    <a href="prof-exam-4x91q.html" data-mobile-section="exams">
      <span class="prof-mobile-tab-icon">EX</span>
      <small>Examens</small>
    </a>
    <a href="prof-modules-eleves.html" data-mobile-section="modules">
      <span class="prof-mobile-tab-icon">MO</span>
      <small>Modules</small>
    </a>
    <a href="prof-customs-eleves.html" data-mobile-section="access">
      <span class="prof-mobile-tab-icon">GE</span>
      <small>Gérer</small>
    </a>
  `;

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
        <button type="button" data-mobile-action="logout" hidden>Déconnexion</button>
      </div>
    </section>
  `;

  body.prepend(appbar);
  body.append(menu, tabbar);

  tabbar.querySelectorAll("[data-mobile-section]").forEach((link) => {
    const isActive = link.dataset.mobileSection === currentMeta.section;
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
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

  function syncSessionVisibility() {
    const hasVisibleDashboard = !dashboard || !dashboard.hidden;
    body.classList.toggle("mobile-prof-session", hasVisibleDashboard);
  }

  function syncOverlayState() {
    body.classList.toggle(
      "mobile-correction-open",
      Boolean(document.querySelector(".student-answer-card.is-open"))
    );
    body.classList.toggle(
      "mobile-warning-open",
      Boolean(document.querySelector(".module-warning-modal.is-open"))
    );
  }

  syncSessionVisibility();
  syncOverlayState();

  const observer = new MutationObserver(() => {
    syncSessionVisibility();
    syncOverlayState();
  });

  observer.observe(body, {
    attributes: true,
    attributeFilter: ["class", "hidden"],
    childList: true,
    subtree: true
  });
})();
