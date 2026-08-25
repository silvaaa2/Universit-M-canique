(() => {
  const ENABLED_KEY = "profV2NotificationsEnabled";
  const SNAPSHOT_KEY = "profV2NotificationsSnapshot";
  const UNREAD_KEY = "profV2NotificationUnread";
  const SEEN_NEWS_KEY = "profV2SeenSiteNews";
  const INTERVAL_MS = 30000;
  const AUTH_WAIT_MS = 45000;

  const SITE_NEWS = [
    {
      id: "2026-08-25-notification-badges",
      target: "settings",
      label: "Pastilles de notifications"
    }
  ];

  const EXAM_SHEETS = [
    {
      id: "exam-form-1",
      label: "Examens",
      source: "examResponses"
    }
  ];

  const CUSTOM_SHEETS = [
    {
      id: "sentinelClassic",
      label: "Custom Facile",
      source: "customResponses"
    },
    {
      id: "argento2f",
      label: "Custom Moyen",
      source: "customResponses"
    },
    {
      id: "cypher",
      label: "Custom Difficile",
      source: "customResponses"
    }
  ];

  const button = document.getElementById("v2NotificationsBtn");
  const label = document.getElementById("v2NotificationsLabel");

  let timer = null;
  let checkRunning = false;
  let audioContext = null;
  let authWaitTimer = null;
  let authWaitStartedAt = 0;

  function notificationsEnabled() {
    const savedValue = localStorage.getItem(ENABLED_KEY);
    return savedValue === null ? true : savedValue === "true";
  }

  function setNotificationsEnabled(value) {
    localStorage.setItem(ENABLED_KEY, value ? "true" : "false");
  }

  function browserNotificationPermission() {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
  }

  function updateButton() {
    if (!button) return;

    const enabled = notificationsEnabled();
    const permission = browserNotificationPermission();

    button.classList.toggle("active", enabled);
    button.dataset.permission = permission;
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    button.setAttribute("aria-checked", enabled ? "true" : "false");

    if (label) {
      label.textContent = enabled
        ? (permission === "denied" ? "Alertes du site actives" : "Notifications actives")
        : "Notifications désactivées";
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readLocalJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (error) {
      console.warn(`État local ${key} illisible :`, error);
      return fallback;
    }
  }

  function readUnread() {
    const saved = readLocalJson(UNREAD_KEY, {});
    return {
      exam: Math.max(0, Number(saved?.exam || 0)),
      custom: Math.max(0, Number(saved?.custom || 0))
    };
  }

  function saveUnread(unread) {
    localStorage.setItem(UNREAD_KEY, JSON.stringify({
      exam: Math.max(0, Number(unread?.exam || 0)),
      custom: Math.max(0, Number(unread?.custom || 0)),
      updatedAt: Date.now()
    }));
  }

  function readSeenNews() {
    const saved = readLocalJson(SEEN_NEWS_KEY, []);
    return new Set(Array.isArray(saved) ? saved.map(String) : []);
  }

  function saveSeenNews(seenNews) {
    localStorage.setItem(SEEN_NEWS_KEY, JSON.stringify(Array.from(seenNews)));
  }

  function currentPageTarget() {
    const page = window.location.pathname.split("/").pop()?.toLowerCase() || "";
    if (page === "prof-exam-4x91q.html") return "exam";
    if (page === "prof-rp-7x92q.html") return "custom";
    return "";
  }

  function newsCount(target) {
    const seenNews = readSeenNews();
    return SITE_NEWS.filter(item => item.target === target && !seenNews.has(item.id)).length;
  }

  function badgeCount(target) {
    if (target === "settings") return newsCount(target);
    return Math.max(0, Number(readUnread()[target] || 0));
  }

  function ensureBadge(target) {
    let badge = Array.from(target.children).find(child => child.matches?.(".prof-notification-badge"));
    if (badge) return badge;

    badge = document.createElement("span");
    badge.className = "prof-notification-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.hidden = true;
    target.appendChild(badge);
    return badge;
  }

  function renderBadges() {
    document.querySelectorAll("[data-prof-notification-target]").forEach(target => {
      const type = target.dataset.profNotificationTarget || "";
      const count = badgeCount(type);
      const badge = ensureBadge(target);

      badge.textContent = count > 99 ? "99+" : String(count);
      badge.hidden = count < 1;
      badge.title = count > 1 ? `${count} notifications non vues` : "1 notification non vue";
      target.classList.toggle("has-prof-notification", count > 0);
      target.dataset.profNotificationCount = String(count);
    });
  }

  function markTargetSeen(target) {
    if (!target) return;

    if (target === "exam" || target === "custom") {
      const unread = readUnread();
      unread[target] = 0;
      saveUnread(unread);
    }

    const seenNews = readSeenNews();
    SITE_NEWS.filter(item => item.target === target).forEach(item => seenNews.add(item.id));
    saveSeenNews(seenNews);
    renderBadges();
  }

  function addUnread(target, count) {
    if (!count || (target !== "exam" && target !== "custom")) return;

    if (currentPageTarget() === target) {
      markTargetSeen(target);
      return;
    }

    const unread = readUnread();
    unread[target] = Math.min(999, Math.max(0, Number(unread[target] || 0)) + Number(count));
    saveUnread(unread);
    renderBadges();
  }

  function ensureToastHost() {
    let host = document.querySelector("[data-v2-notification-toasts]");

    if (!host) {
      host = document.createElement("div");
      host.className = "v2-notification-toasts";
      host.dataset.v2NotificationToasts = "true";
      document.body.appendChild(host);
    }

    return host;
  }

  function showToast(title, message, tone = "info") {
    const host = ensureToastHost();
    const toast = document.createElement("article");
    toast.className = "v2-notification-toast";
    toast.dataset.tone = tone;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.innerHTML = `
      <span class="v2-notification-pulse" aria-hidden="true"></span>
      <div class="v2-notification-copy">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(message)}</p>
      </div>
      <button type="button" class="v2-notification-close" aria-label="Fermer la notification">×</button>
    `;

    while (host.children.length >= 2) {
      host.firstElementChild?.remove();
    }

    host.appendChild(toast);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      toast.classList.add("leaving");
      window.setTimeout(() => toast.remove(), 260);
    };

    toast.querySelector(".v2-notification-close")?.addEventListener("click", dismiss);
    window.setTimeout(dismiss, 4500);
  }

  async function unlockSound() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;

    try {
      audioContext = audioContext || new AudioContextConstructor();

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
    } catch (error) {
      console.warn("Son de notification indisponible :", error);
    }
  }

  function playSound() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;

    try {
      audioContext = audioContext || new AudioContextConstructor();

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(740, now);
      oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.12);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.24);
    } catch (error) {
      console.warn("Lecture son notification impossible :", error);
    }
  }

  async function requestBrowserPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission !== "default") return Notification.permission;

    try {
      return await Notification.requestPermission();
    } catch (error) {
      console.warn("Demande de notification refusée :", error);
      return Notification.permission;
    }
  }

  function sendBrowserNotification(title, message, tag) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    try {
      new Notification(title, {
        body: message,
        icon: new URL("../Images/favicon.png", window.location.href).href,
        tag,
        renotify: true,
        silent: false
      });
    } catch (error) {
      console.warn("Notification navigateur impossible :", error);
    }
  }

  function parseCsv(text) {
    const rows = [];
    let currentRow = [];
    let currentValue = "";
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"' && insideQuotes && nextChar === '"') {
        currentValue += '"';
        i++;
        continue;
      }

      if (char === '"') {
        insideQuotes = !insideQuotes;
        continue;
      }

      if (char === "," && !insideQuotes) {
        currentRow.push(currentValue);
        currentValue = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !insideQuotes) {
        if (char === "\r" && nextChar === "\n") i++;
        currentRow.push(currentValue);

        if (currentRow.some(cell => String(cell).trim() !== "")) {
          rows.push(currentRow);
        }

        currentRow = [];
        currentValue = "";
        continue;
      }

      currentValue += char;
    }

    currentRow.push(currentValue);

    if (currentRow.some(cell => String(cell).trim() !== "")) {
      rows.push(currentRow);
    }

    return rows;
  }

  function rowsFromCsv(csv) {
    return parseCsv(csv)
      .slice(1)
      .filter(row => row.some(cell => String(cell || "").trim() !== ""));
  }

  async function buildHeaders() {
    const user = window.currentProfUser;

    if (!user?.getIdToken) {
      throw new Error("Connexion professeur requise.");
    }

    const token = await user.getIdToken();
    return {
      Authorization: `Bearer ${token}`
    };
  }

  function buildSheetUrl(sheet) {
    const params = new URLSearchParams({
      source: sheet.source,
      sheet: sheet.id
    });

    return `/api/secure-sheet?${params.toString()}`;
  }

  async function loadSheetState(sheet) {
    const response = await fetch(buildSheetUrl(sheet), {
      cache: "no-store",
      headers: await buildHeaders()
    });

    if (!response.ok) {
      throw new Error(`${sheet.label} indisponible (${response.status})`);
    }

    const rows = rowsFromCsv(await response.text());

    return {
      id: sheet.id,
      label: sheet.label,
      count: rows.length,
      lastRows: rows.slice(-5).map(row => row.join("|"))
    };
  }

  async function loadGroupState(sheets) {
    const results = await Promise.allSettled(sheets.map(loadSheetState));
    const loadedSheets = results
      .filter(result => result.status === "fulfilled")
      .map(result => result.value);

    results.forEach(result => {
      if (result.status === "rejected") {
        console.warn("Source notification partielle impossible :", result.reason);
      }
    });

    return {
      unavailable: loadedSheets.length === 0,
      total: loadedSheets.reduce((sum, sheet) => sum + Number(sheet.count || 0), 0),
      sheets: loadedSheets
    };
  }

  async function loadSnapshot() {
    const [exams, customs] = await Promise.all([
      loadGroupState(EXAM_SHEETS),
      loadGroupState(CUSTOM_SHEETS)
    ]);

    return { exams, customs };
  }

  function readSnapshot() {
    try {
      return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "null");
    } catch (error) {
      console.warn("Historique notifications illisible :", error);
      return null;
    }
  }

  function saveSnapshot(snapshot) {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      ...snapshot,
      checkedAt: Date.now()
    }));
  }

  function mergeUnavailableGroups(previous, current) {
    return {
      exams: current.exams.unavailable ? (previous?.exams || current.exams) : current.exams,
      customs: current.customs.unavailable ? (previous?.customs || current.customs) : current.customs
    };
  }

  function compareSheets(previousSheets = [], currentSheets = []) {
    const previousById = new Map(previousSheets.map(sheet => [sheet.id, sheet]));

    return currentSheets
      .map(sheet => {
        const previous = previousById.get(sheet.id);
        const previousCount = Number(previous?.count || 0);
        const diff = Math.max(Number(sheet.count || 0) - previousCount, 0);

        return {
          label: sheet.label,
          diff
        };
      })
      .filter(item => item.diff > 0);
  }

  function formatDetails(items) {
    return items
      .map(item => `${item.label} +${item.diff}`)
      .join(", ");
  }

  function notify(type, count, details) {
    const isExam = type === "exam";
    const title = isExam
      ? (count > 1 ? "Nouveaux examens reçus" : "Nouvel examen reçu")
      : (count > 1 ? "Nouvelles réponses customs" : "Nouvelle réponse custom");
    const message = isExam
      ? `${count} nouvelle(s) copie(s) d'examen.`
      : `${count} nouvelle(s) réponse(s) élève.`;
    const fullMessage = details ? `${message} ${details}.` : message;

    showToast(title, fullMessage, isExam ? "exam" : "custom");
    sendBrowserNotification(title, fullMessage, `prof-${type}-${Date.now()}`);
    playSound();
  }

  async function checkNotifications({ baselineOnly = false } = {}) {
    if (!notificationsEnabled() || !window.currentProfUser || checkRunning) return;

    checkRunning = true;

    try {
      const current = await loadSnapshot();
      const previous = readSnapshot();

      if (current.exams.unavailable && current.customs.unavailable) {
        throw new Error("Aucune source de notification disponible.");
      }

      const nextSnapshot = mergeUnavailableGroups(previous, current);

      if (!previous || baselineOnly) {
        saveSnapshot(nextSnapshot);
        return;
      }

      const examDiff = current.exams.unavailable
        ? 0
        : Math.max(Number(current.exams.total || 0) - Number(previous.exams?.total || 0), 0);
      const customDiff = current.customs.unavailable
        ? 0
        : Math.max(Number(current.customs.total || 0) - Number(previous.customs?.total || 0), 0);
      const examDetails = current.exams.unavailable
        ? ""
        : formatDetails(compareSheets(previous.exams?.sheets, current.exams.sheets));
      const customDetails = current.customs.unavailable
        ? ""
        : formatDetails(compareSheets(previous.customs?.sheets, current.customs.sheets));

      saveSnapshot(nextSnapshot);

      if (examDiff > 0) {
        addUnread("exam", examDiff);
        notify("exam", examDiff, examDetails);
      }
      if (customDiff > 0) {
        addUnread("custom", customDiff);
        notify("custom", customDiff, customDetails);
      }
    } catch (error) {
      console.warn("Vérification notifications prof impossible :", error);
    } finally {
      checkRunning = false;
    }
  }

  function startNotifications(options = {}) {
    if (!notificationsEnabled()) {
      stopNotifications();
      return;
    }

    updateButton();
    checkNotifications(options);

    if (!timer && !window.profLiveRefresh) {
      timer = window.setInterval(checkNotifications, INTERVAL_MS);
    }
  }

  function stopNotifications() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }

    updateButton();
  }

  function waitForConnectedProf() {
    if (!notificationsEnabled()) return;

    if (window.currentProfUser) {
      startNotifications();
      return;
    }

    if (authWaitTimer) return;

    authWaitStartedAt = Date.now();
    authWaitTimer = window.setInterval(() => {
      if (window.currentProfUser) {
        window.clearInterval(authWaitTimer);
        authWaitTimer = null;
        startNotifications();
        return;
      }

      if (Date.now() - authWaitStartedAt > AUTH_WAIT_MS) {
        window.clearInterval(authWaitTimer);
        authWaitTimer = null;
      }
    }, 500);
  }

  button?.addEventListener("click", async () => {
    const shouldEnable = !notificationsEnabled();

    if (!shouldEnable) {
      setNotificationsEnabled(false);
      stopNotifications();
      showToast("Notifications désactivées", "La vérification des nouvelles réponses est arrêtée.", "info");
      return;
    }

    if (!window.currentProfUser) {
      showToast("Connexion requise", "Connecte-toi à l'espace prof avant d'activer les notifications.", "info");
      return;
    }

    await unlockSound();
    const permission = await requestBrowserPermission();

    setNotificationsEnabled(true);
    updateButton();
    await checkNotifications({ baselineOnly: true });
    startNotifications();

    if (permission === "granted") {
      showToast("Notifications activées", "Le site vérifie les nouvelles réponses toutes les 10 secondes.", "ok");
    } else {
      showToast("Notifications site activées", "Windows bloque les notifications, mais les alertes du site restent actives.", "info");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkNotifications();
    }
  });

  window.addEventListener("focus", () => checkNotifications());
  window.addEventListener("prof:live-refresh", () => checkNotifications());
  window.addEventListener("profNavigationReady", renderBadges);
  window.addEventListener("storage", event => {
    if (event.key === UNREAD_KEY || event.key === SEEN_NEWS_KEY) renderBadges();
  });

  document.getElementById("profSettingsBtn")?.addEventListener("click", () => {
    markTargetSeen("settings");
  });

  markTargetSeen(currentPageTarget());
  renderBadges();

  window.profNotificationBadges = Object.freeze({
    render: renderBadges,
    markSeen: markTargetSeen,
    add: addUnread
  });

  updateButton();
  waitForConnectedProf();
})();
