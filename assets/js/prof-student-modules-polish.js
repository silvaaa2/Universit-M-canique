let polishStarted = false;

function injectPolishStyles() {
  if (document.getElementById("studentModulesPolishStyles")) return;

  const style = document.createElement("style");
  style.id = "studentModulesPolishStyles";
  style.textContent = `
    .student-modules-modal-overlay {
      padding: 0 !important;
      place-items: stretch !important;
      background:
        radial-gradient(circle at 12% 8%, rgba(214,180,106,.16), transparent 28%),
        radial-gradient(circle at 88% 12%, rgba(125,211,252,.10), transparent 24%),
        rgba(0,0,0,.84) !important;
    }

    .student-modules-modal-card {
      width: 100vw !important;
      height: 100vh !important;
      max-height: none !important;
      border-radius: 0 !important;
      border: 0 !important;
      padding: 28px 34px 30px !important;
      background:
        linear-gradient(rgba(0,0,0,.75), rgba(0,0,0,.88)),
        linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px),
        radial-gradient(circle at 16% 0%, rgba(214,180,106,.16), transparent 32%),
        radial-gradient(circle at 86% 6%, rgba(125,211,252,.08), transparent 24%),
        rgba(8,8,8,.99) !important;
      background-size: auto, 68px 68px, 68px 68px, auto, auto, auto !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06) !important;
    }

    .student-modules-modal-card::before {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      height: 4px;
      background: linear-gradient(90deg, var(--gold), rgba(214,180,106,.10), #7dd3fc, var(--gold2));
      box-shadow: 0 0 26px rgba(214,180,106,.38);
    }

    .student-modules-close {
      top: 26px !important;
      right: 32px !important;
      width: 46px !important;
      height: 46px !important;
      border-radius: 14px !important;
      font-size: 26px !important;
      background: rgba(248,113,113,.13) !important;
    }

    .student-modules-modal-card > .kicker {
      width: fit-content;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid rgba(214,180,106,.18);
      background: rgba(214,180,106,.08);
      color: var(--gold2);
    }

    .student-modules-modal-card h2 {
      margin-top: 10px !important;
      font-size: clamp(48px, 6vw, 92px) !important;
      letter-spacing: -.075em !important;
    }

    .student-modules-intro {
      max-width: 900px !important;
      color: rgba(255,247,232,.72) !important;
      font-size: 15px !important;
    }

    .student-modules-summary {
      grid-template-columns: minmax(150px, .9fr) repeat(6, minmax(130px, 1fr)) !important;
      gap: 12px !important;
      margin: 22px 0 16px !important;
    }

    .student-modules-stat {
      min-height: 92px !important;
      padding: 16px !important;
      border-radius: 18px !important;
      background:
        radial-gradient(circle at 16% 0%, rgba(214,180,106,.12), transparent 36%),
        linear-gradient(145deg, rgba(255,255,255,.070), rgba(255,255,255,.024)),
        rgba(0,0,0,.30) !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 16px 40px rgba(0,0,0,.22);
    }

    .student-modules-stat.done {
      border-color: rgba(74,222,128,.20) !important;
    }

    .student-modules-stat strong {
      font-size: clamp(26px, 2.4vw, 38px) !important;
    }

    .student-modules-toolbar {
      grid-template-columns: minmax(300px, 1fr) auto minmax(170px, auto) !important;
      padding: 14px !important;
      border-radius: 20px !important;
      background:
        radial-gradient(circle at 12% 0%, rgba(214,180,106,.10), transparent 34%),
        rgba(255,255,255,.040) !important;
    }

    .student-modules-search {
      height: 50px !important;
      border-radius: 999px !important;
      padding: 0 18px !important;
    }

    .student-modules-table-wrap {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      border-radius: 22px !important;
      background:
        linear-gradient(145deg, rgba(255,255,255,.035), rgba(255,255,255,.014)),
        rgba(0,0,0,.34) !important;
      box-shadow: 0 24px 70px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.04);
    }

    .student-modules-table {
      min-width: 1180px !important;
    }

    .student-modules-row {
      grid-template-columns: minmax(280px, 1.45fr) repeat(6, minmax(132px, 1fr)) !important;
      min-height: 64px;
    }

    .student-modules-head {
      background:
        linear-gradient(145deg, rgba(214,180,106,.18), rgba(255,255,255,.045)),
        rgba(12,12,12,.98) !important;
    }

    .student-modules-head > div:nth-child(2),
    .student-modules-id {
      display: none !important;
    }

    .student-modules-head > div,
    .student-modules-cell {
      padding-left: 16px !important;
      padding-right: 16px !important;
    }

    .student-modules-student strong {
      font-size: 15px !important;
    }

    .student-module-check {
      min-height: 42px !important;
      border-radius: 999px !important;
      background:
        radial-gradient(circle at 20% 0%, rgba(248,113,113,.12), transparent 34%),
        rgba(248,113,113,.095) !important;
    }

    .student-module-check.checked {
      background:
        radial-gradient(circle at 22% 0%, rgba(255,255,255,.14), transparent 32%),
        linear-gradient(135deg, rgba(74,222,128,.22), rgba(74,222,128,.075)) !important;
      box-shadow: 0 0 0 1px rgba(74,222,128,.08), 0 0 24px rgba(74,222,128,.14) !important;
    }

    .student-module-check input {
      appearance: none;
      width: 18px !important;
      height: 18px !important;
      border-radius: 6px;
      border: 2px solid currentColor;
      background: rgba(0,0,0,.22);
      display: grid;
      place-items: center;
    }

    .student-module-check input:checked::after {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 3px;
      background: currentColor;
      box-shadow: 0 0 12px currentColor;
    }

    @media (max-width: 980px) {
      .student-modules-modal-card {
        padding: 22px 18px !important;
      }

      .student-modules-summary,
      .student-modules-toolbar {
        grid-template-columns: 1fr !important;
      }

      .student-modules-close {
        right: 18px !important;
      }
    }
  `;

  document.head.appendChild(style);
}

function replaceText(node, replacements) {
  if (!node) return;

  const current = node.textContent || "";
  const next = replacements[current] || current
    .replaceAll("Modules Eleves", "Modules Élèves")
    .replaceAll("Modules eleves", "Modules élèves")
    .replaceAll("Eleve", "Élève")
    .replaceAll("eleve", "élève")
    .replaceAll("Donnees", "Données")
    .replaceAll("donnees", "données")
    .replaceAll("Reglage", "Réglage")
    .replaceAll("sauvegardees", "sauvegardées")
    .replaceAll("partage", "partagé")
    .replaceAll("Verifie", "Vérifie")
    .replaceAll("regles", "règles");

  if (next !== current) node.textContent = next;
}

function polishStudentModulesUi() {
  document.getElementById("studentModulesBtn")?.replaceChildren(document.createTextNode("Modules Élèves"));

  const modal = document.getElementById("studentModulesModal");
  if (!modal) return;

  replaceText(modal.querySelector("h2"), {});
  replaceText(modal.querySelector(".student-modules-intro"), {});

  const close = modal.querySelector(".student-modules-close");
  if (close) close.textContent = "×";

  modal.querySelectorAll(".student-modules-head > div, .student-modules-empty, .student-modules-error, .student-modules-status, .student-modules-loader-box p").forEach(node => {
    replaceText(node, {});
  });
}

function startPolishObserver() {
  if (polishStarted) return;
  polishStarted = true;

  injectPolishStyles();
  polishStudentModulesUi();

  const observer = new MutationObserver(polishStudentModulesUi);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

if (document.body) {
  startPolishObserver();
} else {
  document.addEventListener("DOMContentLoaded", startPolishObserver, { once: true });
}
