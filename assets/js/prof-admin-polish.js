import "./prof-admin.js?v=1003";

let toastTimer = null;
let observerStarted = false;

function injectAdminPolishStyles() {
  if (document.getElementById("profAdminPolishStyles")) return;

  const style = document.createElement("style");
  style.id = "profAdminPolishStyles";
  style.textContent = `
    .prof-admin-message-banner.prof-admin-message-toast {
      position: fixed !important;
      top: 22px !important;
      right: 22px !important;
      z-index: 12000 !important;
      width: min(390px, calc(100vw - 32px)) !important;
      margin: 0 !important;
      overflow: hidden;
      padding: 16px 46px 18px 18px !important;
      border-radius: 8px !important;
      border: 1px solid rgba(214,180,106,.30) !important;
      background:
        linear-gradient(145deg, rgba(255,255,255,.085), rgba(255,255,255,.030)),
        rgba(10,10,10,.96) !important;
      color: var(--text) !important;
      box-shadow:
        0 22px 70px rgba(0,0,0,.52),
        inset 0 1px 0 rgba(255,255,255,.08) !important;
      backdrop-filter: blur(18px);
      opacity: 0;
      transform: translateX(28px) translateY(-8px);
      pointer-events: none;
      transition: opacity .22s ease, transform .22s ease;
    }

    .prof-admin-message-banner.prof-admin-message-toast.active {
      opacity: 1;
      transform: translateX(0) translateY(0);
      pointer-events: auto;
    }

    .prof-admin-message-banner.prof-admin-message-toast.leaving {
      opacity: 0;
      transform: translateX(28px) translateY(-8px);
      pointer-events: none;
    }

    .prof-admin-message-banner.prof-admin-message-toast::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 4px;
      background: linear-gradient(180deg, var(--gold), var(--gold2));
    }

    .prof-admin-toast-close {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 30px;
      height: 30px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      background: rgba(255,255,255,.055);
      color: var(--muted);
      font-size: 18px;
      font-weight: 1000;
      line-height: 1;
      cursor: pointer;
    }

    .prof-admin-toast-close:hover {
      color: var(--gold2);
      border-color: rgba(214,180,106,.34);
      background: rgba(214,180,106,.12);
    }

    .prof-admin-toast-progress {
      position: absolute;
      left: 4px;
      right: 0;
      bottom: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--gold), var(--gold2));
      transform-origin: left center;
      animation: profAdminToastTimer 10s linear forwards;
    }

    @keyframes profAdminToastTimer {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }

    .prof-admin-modal-card {
      background:
        linear-gradient(145deg, rgba(214,180,106,.09), transparent 32%),
        linear-gradient(145deg, rgba(255,255,255,.080), rgba(255,255,255,.028)),
        rgba(8,8,8,.97) !important;
    }

    .prof-admin-modal-card::before {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      height: 4px;
      border-radius: 8px 8px 0 0;
      background: linear-gradient(90deg, var(--gold), rgba(214,180,106,.12), var(--gold2));
    }

    .prof-admin-tabs {
      padding: 8px !important;
      border: 1px solid rgba(255,255,255,.08) !important;
      border-radius: 8px !important;
      background: rgba(255,255,255,.035) !important;
    }

    .prof-admin-tab {
      background: transparent !important;
    }

    .prof-admin-tab.active {
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
    }

    .prof-admin-workspace {
      margin-top: 16px !important;
      padding: 18px !important;
      border: 1px solid rgba(255,255,255,.08) !important;
      border-radius: 8px !important;
      background: rgba(255,255,255,.025) !important;
    }

    .prof-admin-input:focus,
    .prof-admin-select:focus,
    .prof-admin-textarea:focus {
      border-color: rgba(214,180,106,.42) !important;
      box-shadow: 0 0 0 3px rgba(214,180,106,.10) !important;
    }
  `;

  document.head.appendChild(style);
}

function dismissToast(toast = document.getElementById("profAdminMessageBanner")) {
  clearTimeout(toastTimer);

  if (!toast) return;

  toast.classList.add("leaving");
  toast.classList.remove("active");

  setTimeout(() => {
    toast.remove();
  }, 240);
}

function promoteBannerToToast(banner) {
  if (!banner) return;

  const needsControls = (
    !banner.querySelector(".prof-admin-toast-close") ||
    !banner.querySelector(".prof-admin-toast-progress")
  );

  if (banner.dataset.toastReady === "true" && !needsControls) return;

  banner.dataset.toastReady = "true";
  banner.classList.add("prof-admin-message-toast");
  banner.querySelector(".prof-admin-toast-close")?.remove();
  banner.querySelector(".prof-admin-toast-progress")?.remove();

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "prof-admin-toast-close";
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => dismissToast(banner));

  const progress = document.createElement("div");
  progress.className = "prof-admin-toast-progress";

  banner.prepend(closeButton);
  banner.appendChild(progress);

  requestAnimationFrame(() => {
    banner.classList.add("active");
  });

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dismissToast(banner), 10000);
}

function startToastObserver() {
  if (observerStarted) return;

  observerStarted = true;
  injectAdminPolishStyles();

  const existing = document.getElementById("profAdminMessageBanner");
  if (existing) promoteBannerToToast(existing);

  const observer = new MutationObserver(() => {
    const banner = document.getElementById("profAdminMessageBanner");
    if (banner) promoteBannerToToast(banner);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.body) {
  startToastObserver();
} else {
  document.addEventListener("DOMContentLoaded", startToastObserver, { once: true });
}
