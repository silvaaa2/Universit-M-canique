(() => {
  const studentAccess = Number(sessionStorage.getItem("universityStudentAccess") || 0);
  const studentSession = studentAccess && Date.now() - studentAccess < 8 * 60 * 60 * 1000
    ? { authenticated: true, role: "student", label: "Élève" }
    : null;

  const serverSession = fetch("/api/access/session", {
    credentials: "same-origin",
    cache: "no-store"
  })
    .then(response => response.ok ? response.json() : { authenticated: false })
    .catch(() => ({ authenticated: false }));

  window.__UNIVERSITY_ACCESS_PROMISE__ = serverSession.then(session => (
    session?.authenticated ? session : (studentSession || session)
  ));

  function stageIcon() {
    return `<span class="v2-nav-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6V4h6v2M4 8h16v11H4z"/><path d="M4 12c5 2 11 2 16 0M10 12v2h4v-2"/></svg></span>`;
  }

  function installStageLinks(session) {
    if (!session?.authenticated || !["prof", "admin"].includes(session.role)) return;
    const nav = document.querySelector(".v2-nav");
    if (nav && !nav.querySelector("[data-university-stage-link]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "v2-nav-item";
      button.dataset.universityStageLink = "true";
      button.innerHTML = `${stageIcon()}Suivi de stage`;
      button.addEventListener("click", () => window.location.assign("/stages/"));
      const accountHeading = [...nav.querySelectorAll("p")].find(item => item.textContent.trim() === "Compte");
      nav.insertBefore(button, accountHeading || null);
    }

    const mobileMenu = document.querySelector(".prof-mobile-menu-grid");
    if (mobileMenu && !mobileMenu.querySelector("[data-university-stage-link]")) {
      const link = document.createElement("a");
      link.href = "/stages/";
      link.dataset.universityStageLink = "true";
      link.innerHTML = `<span aria-hidden="true">${stageIcon()}</span><strong>Suivi de stage</strong><small>Stagiaires et examens</small>`;
      mobileMenu.append(link);
    }
  }

  const ready = document.readyState === "loading"
    ? new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
    : Promise.resolve();

  Promise.all([ready, window.__UNIVERSITY_ACCESS_PROMISE__]).then(([, session]) => {
    if (session?.role) document.documentElement.dataset.universityRole = session.role;
    if (session?.companyId) document.documentElement.dataset.companyScope = session.companyId;
    installStageLinks(session);

    if (session?.role === "student") {
      document.querySelectorAll(".prof-button").forEach(button => {
        button.addEventListener("click", async event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          try {
            await window.UniversityMotion?.showExit({
              title: "À bientôt",
              detail: "Fermeture de votre espace élève…"
            });
          } finally {
            sessionStorage.removeItem("universityStudentAccess");
            window.location.replace("/");
          }
        }, true);
      });
    }
  });
})();
