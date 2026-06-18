function waitForProfFirebase() {
  if (window.profFirebase?.db && window.profFirebase?.auth) {
    return Promise.resolve(window.profFirebase);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Firebase prof n'est pas prêt."));
    }, 8000);

    window.addEventListener("profFirebaseReady", () => {
      clearTimeout(timeout);
      resolve(window.profFirebase);
    }, { once: true });
  });
}

function injectModulesNavStyles() {
  if (document.getElementById("profModulesNavStyles")) return;

  const style = document.createElement("style");
  style.id = "profModulesNavStyles";
  style.textContent = `
    .prof-modules-nav-btn {
      border-color: rgba(125,211,252,.34) !important;
      background: rgba(125,211,252,.10) !important;
      color: #bae6fd !important;
      white-space: nowrap;
    }

    .prof-modules-nav-btn.first-action {
      margin-left: auto;
    }

    .prof-admin-btn + .prof-modules-nav-btn {
      margin-left: 0;
    }

    @media (max-width: 780px) {
      .prof-modules-nav-btn.first-action {
        margin-left: 0;
      }
    }
  `;

  document.head.appendChild(style);
}

async function loadAccess(firebase, user) {
  if (!user?.email) return { role: null, admin: false };

  try {
    const snap = await firebase.getDoc(firebase.doc(firebase.db, "users", user.email));
    if (!snap.exists()) return { role: null, admin: false };

    const data = snap.data();
    return {
      role: data.role || null,
      admin: data.admin === true
    };
  } catch (error) {
    console.warn("Accès modules élèves indisponible :", error);
    return { role: null, admin: false };
  }
}

function positionModulesButton() {
  const button = document.getElementById("profModulesElevesBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  if (!button || !logoutBtn) return;

  const adminBtn = document.getElementById("profAdminBtn");

  if (adminBtn) {
    if (button.previousElementSibling !== adminBtn) {
      adminBtn.insertAdjacentElement("afterend", button);
    }

    button.classList.remove("first-action");
    return;
  }

  if (button.nextElementSibling !== logoutBtn) {
    logoutBtn.insertAdjacentElement("beforebegin", button);
  }

  button.classList.add("first-action");
}

function ensureModulesButton() {
  injectModulesNavStyles();

  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  let button = document.getElementById("profModulesElevesBtn");

  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.id = "profModulesElevesBtn";
    button.className = "btn secondary prof-modules-nav-btn";
    button.textContent = "Modules Élèves";
    button.addEventListener("click", () => {
      window.location.href = "prof-modules-eleves.html";
    });

    logoutBtn.insertAdjacentElement("beforebegin", button);
  }

  positionModulesButton();
}

function removeModulesButton() {
  document.getElementById("profModulesElevesBtn")?.remove();
}

async function startModulesNav() {
  try {
    const firebaseAuth = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const firebase = await waitForProfFirebase();

    firebaseAuth.onAuthStateChanged(firebase.auth, async user => {
      if (!user) {
        removeModulesButton();
        return;
      }

      const access = await loadAccess(firebase, user);
      const allowed = access.role === "prof" || access.admin === true;

      if (!allowed) {
        removeModulesButton();
        return;
      }

      ensureModulesButton();
      setTimeout(positionModulesButton, 350);
      setTimeout(positionModulesButton, 1000);
    });

    const observer = new MutationObserver(positionModulesButton);
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (error) {
    console.warn("Bouton Modules Élèves indisponible :", error);
  }
}

startModulesNav();