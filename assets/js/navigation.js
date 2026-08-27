(function setupNavigationTransition() {
  let navigationLocked = false;

  function getTransitionCopy(url) {
    const target = String(url || "").toLowerCase();

    if (target.includes("espace-prof")) {
      return {
        title: "Espace Prof",
        text: "Ouverture de l'espace sécurisé..."
      };
    }

    if (target.includes("prof-")) {
      return {
        title: "Espace Prof",
        text: "Chargement de l'outil professeur..."
      };
    }

    if (target.includes("custom-")) {
      return {
        title: "Fiche custom",
        text: "Chargement de la fiche véhicule..."
      };
    }

    return {
      title: "Mécanique - Université",
      text: "Chargement de la page..."
    };
  }

  function ensureTransitionStyles() {
    if (document.getElementById("navigationTransitionStyles")) return;

    const style = document.createElement("style");
    style.id = "navigationTransitionStyles";
    style.textContent = `
      #loader.navigation-page-loader {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        place-items: center;
        background: #000000;
        transition: opacity .5s ease, visibility .5s ease;
      }

      #loader.navigation-page-loader .loader-box {
        width: min(430px, 90%);
        padding: 34px;
        border-radius: 34px;
        background: rgba(255,255,255,.07);
        border: 1px solid rgba(255,255,255,.15);
        backdrop-filter: blur(20px);
        box-shadow: 0 0 80px rgba(214,180,106,.14);
        transform: translateY(12px) scale(.96);
        animation: navigationBoxIn .48s cubic-bezier(.2,.8,.2,1) forwards;
      }

      #loader.navigation-page-loader .loader-box h2 {
        margin: 0 0 8px;
        font-size: 28px;
      }

      #loader.navigation-page-loader .loader-box p {
        color: rgba(255,255,255,.68);
      }

      #loader.navigation-page-loader .loader-bar {
        height: 8px;
        border-radius: 999px;
        background: rgba(255,255,255,.1);
        overflow: hidden;
      }

      #loader.navigation-page-loader .loader-bar span {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, #d6b46a, #f0d98a);
        animation: navigationLoad 1.15s ease forwards;
      }

      .v2-workspace {
        position: relative;
      }

      .v2-workspace.is-navigating > :not(.v2-workspace-transition) {
        pointer-events: none;
      }

      .v2-workspace-transition {
        position: absolute;
        inset: 84px 14px 14px;
        z-index: 120;
        display: grid;
        place-items: center;
        border-radius: var(--v2-radius, 18px);
        background:
          linear-gradient(145deg, rgba(214, 180, 106, .12), rgba(0, 0, 0, .08) 38%),
          rgba(6, 6, 5, .72);
        border: 1px solid rgba(255, 255, 255, .12);
        box-shadow: 0 24px 90px rgba(0, 0, 0, .34);
        backdrop-filter: blur(16px);
        opacity: 0;
        transition: opacity .24s ease;
      }

      body[data-theme="light"] .v2-workspace-transition {
        background:
          linear-gradient(145deg, rgba(196, 151, 66, .16), rgba(255, 255, 255, .38) 42%),
          rgba(247, 244, 237, .78);
        border-color: rgba(30, 24, 14, .12);
      }

      .v2-workspace-transition.is-visible {
        opacity: 1;
      }

      .v2-workspace-loader-card {
        width: min(430px, calc(100% - 28px));
        padding: 24px;
        border-radius: var(--v2-radius, 18px);
        color: var(--v2-text, #fff8ea);
        background: color-mix(in srgb, var(--v2-panel-strong, #171614) 82%, transparent);
        border: 1px solid var(--v2-line, rgba(255, 255, 255, .14));
        box-shadow: 0 22px 70px color-mix(in srgb, var(--v2-shadow, rgba(0, 0, 0, .5)) 72%, transparent);
        transform: translateY(8px) scale(.98);
        animation: navigationBoxIn .34s cubic-bezier(.2,.8,.2,1) forwards;
      }

      .v2-workspace-loader-card h2 {
        margin: 0 0 8px;
        font-size: 24px;
        letter-spacing: 0;
      }

      .v2-workspace-loader-card p {
        margin: 0 0 16px;
        color: var(--v2-muted, rgba(255, 255, 255, .66));
        font-weight: 900;
      }

      .v2-workspace-loader-bar {
        height: 7px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--v2-line, rgba(255, 255, 255, .16)) 70%, transparent);
        overflow: hidden;
      }

      .v2-workspace-loader-bar span {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, var(--v2-gold, #d6b46a), #f0d98a);
        animation: navigationLoad .75s ease forwards;
      }

      .v2-nav-item.is-loading {
        background: color-mix(in srgb, var(--v2-gold, #d6b46a) 18%, transparent);
        border-color: color-mix(in srgb, var(--v2-gold, #d6b46a) 44%, transparent);
      }

      @keyframes navigationLoad {
        from { transform: translateX(-100%); }
        to { transform: translateX(0); }
      }

      @keyframes navigationBoxIn {
        to { transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureLoader() {
    ensureTransitionStyles();
    let loader = document.getElementById("loader");

    if (!loader) {
      loader = document.createElement("div");
      loader.id = "loader";
      loader.className = "navigation-page-loader hide";
      loader.innerHTML = `
        <div class="loader-box">
          <h2>Mécanique - Université</h2>
          <p id="loaderText">Chargement de la page...</p>
          <div class="loader-bar"><span></span></div>
        </div>
      `;
      document.body.appendChild(loader);
      return loader;
    }

    loader.classList.add("navigation-page-loader");
    return loader;
  }

  function restartBar(loader) {
    const bar = loader.querySelector(".loader-bar span");
    if (!bar) return;

    bar.style.animation = "none";
    void bar.offsetWidth;
    bar.style.animation = "";
  }

  function showTransition(url) {
    const copy = getTransitionCopy(url);
    const loader = ensureLoader();
    const title = loader.querySelector(".loader-box h2");
    const text = loader.querySelector("#loaderText") || loader.querySelector(".loader-box p");

    if (title) title.textContent = copy.title;
    if (text) text.textContent = copy.text;

    restartBar(loader);

    loader.classList.remove("hide");
    loader.style.display = "grid";
    loader.style.visibility = "visible";
    loader.style.pointerEvents = "all";
    loader.style.opacity = "0";

    requestAnimationFrame(() => {
      loader.style.opacity = "1";
    });
  }

  function targetFileName(url) {
    try {
      const target = new URL(url, window.location.href);
      return target.pathname.split("/").pop().toLowerCase();
    } catch (error) {
      const cleanUrl = String(url || "").split("?")[0].split("#")[0];
      return cleanUrl.split("/").pop().toLowerCase();
    }
  }

  function canUseWorkspaceTransition(url) {
    if (!document.body?.classList.contains("prof-v2-page")) return false;
    if (!document.querySelector(".v2-sidebar") || !document.querySelector(".v2-workspace")) return false;

    const fileName = targetFileName(url);
    return [
      "espace-prof.html",
      "prof-rp-7x92q.html",
      "prof-exam-4x91q.html",
      "prof-modules-eleves.html",
      "prof-customs-eleves.html"
    ].includes(fileName);
  }

  function markSidebarTarget(url) {
    const fileName = targetFileName(url);
    document.querySelectorAll(".v2-nav-item").forEach(button => {
      button.classList.remove("active", "is-loading");
    });

    const targetButton = Array.from(document.querySelectorAll(".v2-nav-item")).find(button => {
      const action = button.getAttribute("onclick") || "";
      return fileName && action.toLowerCase().includes(fileName);
    });

    if (targetButton) {
      targetButton.classList.add("active", "is-loading");
    }
  }

  function showWorkspaceTransition(url) {
    if (!canUseWorkspaceTransition(url)) return false;

    ensureTransitionStyles();

    const workspace = document.querySelector(".v2-workspace");
    const copy = getTransitionCopy(url);
    if (!workspace) return false;

    let transition = workspace.querySelector(".v2-workspace-transition");

    if (!transition) {
      transition = document.createElement("div");
      transition.className = "v2-workspace-transition";
      transition.setAttribute("role", "status");
      transition.setAttribute("aria-live", "polite");
      workspace.appendChild(transition);
    }

    transition.innerHTML = `
      <div class="v2-workspace-loader-card">
        <h2>${copy.title}</h2>
        <p>${copy.text}</p>
        <div class="v2-workspace-loader-bar"><span></span></div>
      </div>
    `;

    workspace.classList.add("is-navigating");
    markSidebarTarget(url);

    requestAnimationFrame(() => {
      transition.classList.add("is-visible");
    });

    return true;
  }

  window.goPage = function (url) {
    if (!url || navigationLocked) return;

    navigationLocked = true;
    const isWorkspaceNavigation = showWorkspaceTransition(url);

    if (!isWorkspaceNavigation) {
      showTransition(url);
    }

    window.setTimeout(() => {
      window.location.assign(url);
    }, isWorkspaceNavigation ? 320 : 650);
  };
})();

(function applyUpdatedBrandName() {
  const previousName = "Module 4 - Mécanique";
  const nextName = "Mécanique - Université";

  if (document.title === previousName) {
    document.title = nextName;
  } else if (document.title.includes(previousName)) {
    document.title = document.title.replaceAll(previousName, nextName);
  } else if (document.title.includes("Module 4")) {
    document.title = document.title.replaceAll("Module 4", nextName);
  }

  document.querySelectorAll("span, p, h1, h2, h3").forEach(element => {
    if (element.textContent.trim() === previousName) {
      element.textContent = nextName;
    }
  });

  document.querySelectorAll('img[alt="Logo Module 4"]').forEach(image => {
    image.alt = "Logo Mécanique - Université";
  });
})();

(function loadModulesPageExtras() {
  if (!document.body?.classList.contains("modules-page")) return;

  if (!document.querySelector("link[data-modules-table-colors]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "../assets/css/prof-modules-eleves.css?v=1003";
    link.dataset.modulesTableColors = "true";
    document.head.appendChild(link);
  }

  import("./prof-modules-archives.js?v=1003").catch(error => {
    console.warn("Archives modules indisponibles :", error);
  });

  import("./prof-modules-alerts.js?v=1012").catch(error => {
    console.warn("Avertos modules indisponibles :", error);
  });
})();
