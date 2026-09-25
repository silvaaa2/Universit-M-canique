(() => {
  let leaving = false;

  document.addEventListener("click", event => {
    const link = event.target?.closest?.('a[data-custom-link="examV2"]');
    if (!link || event.defaultPrevented || link.classList.contains("custom-link-closed") || link.getAttribute?.("aria-disabled") === "true") return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank") return;

    event.preventDefault();
    if (leaving) return;
    leaving = true;
    document.body.classList.add("student-exam-opening");
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    window.setTimeout(() => window.location.assign(link.href), reducedMotion ? 0 : 300);
  });

  window.addEventListener("pageshow", () => {
    leaving = false;
    document.body.classList.remove("student-exam-opening");
  });
})();
