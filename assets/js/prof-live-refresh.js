(() => {
  if (window.profLiveRefresh) return;

  const REFRESH_INTERVAL_MS = 10_000;
  const RESUME_REFRESH_DELAY_MS = 4_000;
  const CLOCK_SELECTOR = "[data-prof-live-clock]";
  const EDITING_SELECTOR = "input, textarea, select, [contenteditable='true']";
  const SAVING_SELECTOR = ".saving, [data-module-saving='true'], [aria-busy='true']";
  const OPEN_CORRECTION_SELECTOR = "[data-answer-card].is-open";
  let lastRefreshAt = Date.now();

  const clockFormatter = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

  function formatClock(date) {
    return clockFormatter.format(date).replace(",", " ·");
  }

  function updateClock(now = new Date()) {
    document.querySelectorAll(CLOCK_SELECTOR).forEach(clock => {
      clock.textContent = formatClock(now);
      if (clock instanceof HTMLTimeElement) clock.dateTime = now.toISOString();
    });
  }

  function isVisible(element) {
    if (!(element instanceof Element) || element.hidden) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function isUserBusy() {
    const activeElement = document.activeElement;
    if (activeElement instanceof Element && activeElement.matches(EDITING_SELECTOR)) return true;
    if (document.querySelector(SAVING_SELECTOR)) return true;
    if (document.querySelector(OPEN_CORRECTION_SELECTOR)) return true;

    return Array.from(document.querySelectorAll("dialog[open], [role='dialog']"))
      .some(isVisible);
  }

  function dispatchRefresh(reason = "interval", { force = false } = {}) {
    const now = Date.now();
    updateClock(new Date(now));

    if (document.visibilityState !== "visible") return false;
    if (!force && isUserBusy()) return false;

    lastRefreshAt = now;
    window.dispatchEvent(new CustomEvent("prof:live-refresh", {
      detail: { timestamp: now, reason }
    }));
    return true;
  }

  function handleVisibilityChange() {
    updateClock();
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastRefreshAt < RESUME_REFRESH_DELAY_MS) return;
    dispatchRefresh("visibility");
  }

  updateClock();
  const intervalId = window.setInterval(() => dispatchRefresh("interval"), REFRESH_INTERVAL_MS);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  window.profLiveRefresh = Object.freeze({
    intervalMs: REFRESH_INTERVAL_MS,
    refreshNow: () => dispatchRefresh("manual"),
    updateClock,
    isUserBusy,
    stop() {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  });
})();
