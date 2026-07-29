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
        background: #050505;
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

  window.goPage = function (url) {
    if (!url || navigationLocked) return;

    navigationLocked = true;
    showTransition(url);

    window.setTimeout(() => {
      window.location.assign(url);
    }, 650);
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

  import("./prof-modules-archives.js?v=1001").catch(error => {
    console.warn("Archives modules indisponibles :", error);
  });

  import("./prof-modules-alerts.js?v=1001").catch(error => {
    console.warn("Avertos modules indisponibles :", error);
  });
})();
