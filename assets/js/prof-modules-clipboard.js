const MODULE_SCAN_COLUMNS = [
  { key: "module1", label: "Module 1" },
  { key: "module2", label: "Module 2" },
  { key: "module3", label: "Module 3" },
  { key: "module4", label: "Module 4" },
  { key: "exam", label: "Examen" },
  { key: "retakeExam", label: "Rattrapage" }
];

const SCAN_TARGET_STORAGE_KEY = "profModulesScanTarget";
const SCAN_ENABLED_STORAGE_KEY = "profModulesAutoPasteEnabled";
const CLIPBOARD_SCAN_DELAY_MS = 5000;
const SCAN_FLASH_DURATION_MS = 5000;

let clipboardScanEnabled = false;
let clipboardScanTimer = null;
let clipboardScanBusy = false;
let clipboardReadUnavailable = false;

function isWarningModalActive() {
  const warningModal = document.getElementById("moduleWarningModal");
  return Boolean(warningModal && !warningModal.hidden);
}

function isEditableClipboardTarget(target) {
  if (!target || typeof target.closest !== "function") return false;

  return Boolean(target.closest(
    "textarea, input, [contenteditable], [data-clipboard-scan-ignore]"
  ));
}

function shouldPauseClipboardScan() {
  return Boolean(
    isWarningModalActive() ||
    isEditableClipboardTarget(document.activeElement)
  );
}

function normalizeScanId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function getScanTarget() {
  const select = document.querySelector("[data-modules-scan-target]");
  return select?.value || "module1";
}

function getScanTargetLabel() {
  const target = getScanTarget();
  return MODULE_SCAN_COLUMNS.find(column => column.key === target)?.label || "Module";
}

function setScanStatus(message, tone = "info") {
  const status = document.querySelector("[data-modules-scan-status]");
  if (!status) return;

  status.textContent = message;
  status.dataset.tone = tone;
}

function readScanEnabledPreference() {
  try {
    const savedValue = localStorage.getItem(SCAN_ENABLED_STORAGE_KEY);
    return savedValue === null ? true : savedValue === "true";
  } catch (error) {
    return true;
  }
}

function saveScanEnabledPreference(enabled) {
  try {
    localStorage.setItem(SCAN_ENABLED_STORAGE_KEY, String(Boolean(enabled)));
  } catch (error) {
    // L'auto-collage reste utilisable même si le stockage local est bloqué.
  }
}

function syncScanToggle() {
  const toggle = document.querySelector("[data-modules-scan-toggle]");
  const label = toggle?.querySelector("[data-modules-scan-toggle-label]");
  if (!toggle || !label) return;

  toggle.classList.toggle("is-active", clipboardScanEnabled);
  toggle.setAttribute("aria-pressed", String(clipboardScanEnabled));
  label.textContent = clipboardScanEnabled ? "Auto activé" : "Auto désactivé";
}

function extractIdCandidates(text) {
  const raw = String(text || "").trim();
  const candidates = new Set();

  if (raw) candidates.add(normalizeScanId(raw));

  raw.match(/[a-zA-Z0-9_-]{3,}/g)?.forEach(token => {
    candidates.add(normalizeScanId(token));
  });

  return Array.from(candidates).filter(Boolean);
}

function findStudentRowById(studentId) {
  const normalized = normalizeScanId(studentId);

  return Array.from(document.querySelectorAll("[data-student-row]"))
    .find(row => normalizeScanId(row.dataset.studentRow) === normalized) || null;
}

function waitForTableRender() {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

async function showStudentInTable(studentId) {
  if (isWarningModalActive()) return null;

  let row = findStudentRowById(studentId);
  if (row) return row;

  const searchInput = document.getElementById("modulesSearch");
  if (!searchInput) return null;

  searchInput.value = studentId;
  searchInput.dispatchEvent(new Event("input", { bubbles: true }));

  await waitForTableRender();
  return findStudentRowById(studentId);
}

function flashScannedRow(row, tone = "ok") {
  if (!row) return;

  row.classList.remove("modules-scan-hit", "modules-scan-duplicate", "modules-scan-error");
  row.classList.add(
    tone === "duplicate" ? "modules-scan-duplicate" : tone === "error" ? "modules-scan-error" : "modules-scan-hit"
  );

  row.scrollIntoView({ behavior: "smooth", block: "center" });

  window.setTimeout(() => {
    row.classList.remove("modules-scan-hit", "modules-scan-duplicate", "modules-scan-error");
  }, SCAN_FLASH_DURATION_MS);
}

async function validateStudentModuleFromId(rawText, source = "paste") {
  if (isWarningModalActive()) return false;

  const candidates = extractIdCandidates(rawText);

  if (!candidates.length) {
    setScanStatus("Aucun ID détecté.", "error");
    return false;
  }

  if (!document.querySelector("[data-student-row]")) {
    setScanStatus("Tableau pas encore chargé.", "info");
    return false;
  }

  const moduleKey = getScanTarget();
  const moduleLabel = getScanTargetLabel();

  for (const candidate of candidates) {
    const row = await showStudentInTable(candidate);
    if (isWarningModalActive()) return false;
    if (!row) continue;

    const checkControl = row.querySelector(`button[data-module-check][data-module-key="${moduleKey}"]`);
    const dateInput = row.querySelector(`[data-module-date][data-module-key="${moduleKey}"]`);
    const studentName = row.querySelector(".modules-student strong")?.textContent?.trim() || candidate;

    if (!checkControl || !dateInput) {
      flashScannedRow(row, "error");
      setScanStatus(`${moduleLabel} introuvable pour ${studentName}.`, "error");
      return false;
    }

    const wasChecked = checkControl.dataset.checked === "true";
    if (!wasChecked) {
      checkControl.click();
      flashScannedRow(row, "ok");
      setScanStatus(`${moduleLabel} validé : ${studentName}.`, "ok");
      return true;
    }

    setScanStatus(`ID ${candidate} déjà noté pour ${moduleLabel} · ${studentName}.`, "info");
    return true;
  }

  setScanStatus(`ID introuvable : ${candidates[0]}.`, "error");
  return false;
}

async function readClipboardOnce() {
  if (!clipboardScanEnabled || clipboardScanBusy) return;
  if (document.hidden || !document.body.classList.contains("modules-page")) return;
  if (shouldPauseClipboardScan()) return;

  if (!navigator.clipboard?.readText) {
    setScanStatus("Auto actif. Ctrl+V si besoin.", "info");
    return;
  }

  clipboardScanBusy = true;

  try {
    const text = await navigator.clipboard.readText();
    clipboardReadUnavailable = false;
    if (shouldPauseClipboardScan()) return;

    const firstCandidate = extractIdCandidates(text)[0] || "";

    if (!firstCandidate) return;
    await validateStudentModuleFromId(text, "clipboard");
  } catch (error) {
    clipboardReadUnavailable = true;
    setScanStatus("Auto actif. Ctrl+V si le navigateur bloque la lecture.", "info");
  } finally {
    clipboardScanBusy = false;
  }
}

function startClipboardScan({ persist = false } = {}) {
  if (clipboardScanEnabled) {
    syncScanToggle();
    return;
  }

  clipboardScanEnabled = true;
  clipboardReadUnavailable = false;
  if (persist) saveScanEnabledPreference(true);
  syncScanToggle();
  setScanStatus(`Auto-collage actif · ${getScanTargetLabel()}.`, "ok");

  window.clearInterval(clipboardScanTimer);
  clipboardScanTimer = window.setInterval(readClipboardOnce, CLIPBOARD_SCAN_DELAY_MS);
  readClipboardOnce();
}

function stopClipboardScan({ persist = false } = {}) {
  clipboardScanEnabled = false;
  clipboardReadUnavailable = false;
  window.clearInterval(clipboardScanTimer);
  clipboardScanTimer = null;
  if (persist) saveScanEnabledPreference(false);
  syncScanToggle();
  setScanStatus("Auto-collage désactivé · Ctrl+V disponible.", "info");
}

function toggleClipboardScan() {
  if (clipboardScanEnabled) {
    stopClipboardScan({ persist: true });
    return;
  }

  startClipboardScan({ persist: true });
}

function createScanControls() {
  const toolbar = document.querySelector(".modules-toolbar");
  const searchInput = document.getElementById("modulesSearch");
  if (!toolbar || !searchInput || document.querySelector("[data-modules-scan]")) return;

  const savedTarget = localStorage.getItem(SCAN_TARGET_STORAGE_KEY) || "module1";
  const controls = document.createElement("div");
  controls.className = "modules-scan-controls";
  controls.dataset.modulesScan = "true";
  controls.innerHTML = `
    <span class="modules-scan-label">Pointage</span>
    <select class="modules-scan-select" data-modules-scan-target aria-label="Module à valider">
      ${MODULE_SCAN_COLUMNS.map(column => `
        <option value="${column.key}" ${column.key === savedTarget ? "selected" : ""}>${column.label}</option>
      `).join("")}
    </select>
    <button
      type="button"
      class="modules-scan-toggle"
      data-modules-scan-toggle
      aria-pressed="false"
      aria-label="Activer ou désactiver l’auto-collage"
    >
      <span class="modules-scan-toggle-dot" aria-hidden="true"></span>
      <span data-modules-scan-toggle-label>Auto désactivé</span>
    </button>
    <span class="modules-scan-status" data-modules-scan-status data-tone="info">Préparation…</span>
  `;

  searchInput.insertAdjacentElement("afterend", controls);

  controls.querySelector("[data-modules-scan-target]")?.addEventListener("change", event => {
    localStorage.setItem(SCAN_TARGET_STORAGE_KEY, event.target.value);
    setScanStatus(
      clipboardScanEnabled
        ? `Auto-collage actif · ${getScanTargetLabel()}.`
        : `Cible : ${getScanTargetLabel()} · auto-collage désactivé.`,
      clipboardScanEnabled ? "ok" : "info"
    );
  });

  controls.querySelector("[data-modules-scan-toggle]")?.addEventListener("click", toggleClipboardScan);
}

function bindPasteScan() {
  document.addEventListener("paste", event => {
    if (!document.body.classList.contains("modules-page")) return;
    if (isWarningModalActive()) return;

    const text = event.clipboardData?.getData("text") || "";
    if (isEditableClipboardTarget(event.target)) {
      return;
    }

    if (!extractIdCandidates(text).length) return;

    event.preventDefault();
    validateStudentModuleFromId(text, "paste");
  });
}

function initClipboardModuleScan() {
  createScanControls();
  bindPasteScan();
  if (readScanEnabledPreference()) {
    startClipboardScan();
  } else {
    stopClipboardScan();
  }

  // Une interaction volontaire permet une nouvelle tentative immédiate dans
  // les navigateurs qui exigent un geste utilisateur pour le presse-papiers.
  document.addEventListener("pointerup", () => {
    if (!clipboardScanEnabled || !clipboardReadUnavailable) return;
    readClipboardOnce();
  }, { capture: true });

  window.addEventListener("focus", readClipboardOnce);
  window.addEventListener("storage", event => {
    if (event.key !== SCAN_ENABLED_STORAGE_KEY) return;

    if (readScanEnabledPreference()) {
      startClipboardScan();
    } else {
      stopClipboardScan();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initClipboardModuleScan);
} else {
  initClipboardModuleScan();
}

