const EXAM_SHEETS_TIMEOUT_MS = 15000;
const EXAM_FIREBASE_READ_TIMEOUT_MS = 6000;
const EXAM_FIREBASE_WRITE_SOFT_TIMEOUT_MS = 3000;
const EXAM_UI_WATCHDOG_MS = 12000;

function rejectAfter(label, timeoutMs) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${label} a pris trop de temps.`));
    }, timeoutMs);
  });
}

function resolveAfter(label, timeoutMs) {
  return new Promise(resolve => {
    setTimeout(() => {
      console.warn(label);
      resolve(undefined);
    }, timeoutMs);
  });
}

function withRejectTimeout(promise, label, timeoutMs) {
  return Promise.race([
    Promise.resolve(promise),
    rejectAfter(label, timeoutMs)
  ]);
}

function withSoftWriteTimeout(promise, label, timeoutMs) {
  const trackedPromise = Promise.resolve(promise);
  trackedPromise.catch(error => {
    console.warn(label, error);
  });

  return Promise.race([
    trackedPromise,
    resolveAfter(label, timeoutMs)
  ]);
}

function patchExamFetch() {
  if (window.__examSafetyFetchPatched) return;
  window.__examSafetyFetchPatched = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const sourceUrl = typeof input === "string" ? input : input?.url || "";
    const isGoogleSheetExport =
      sourceUrl.includes("docs.google.com/spreadsheets/") &&
      sourceUrl.includes("/export");

    if (!isGoogleSheetExport) {
      return originalFetch(input, init);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXAM_SHEETS_TIMEOUT_MS);

    try {
      return await originalFetch(input, {
        ...init,
        signal: init.signal || controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Google Sheets ne repond pas. Verifie le lien, le GID et le partage de la feuille.");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}

function patchExamFirebase() {
  const firebase = window.profFirebase;
  if (!firebase || firebase.__examSafetyPatched) return false;

  const originalGetDoc = firebase.getDoc;
  const originalGetDocs = firebase.getDocs;
  const originalSetDoc = firebase.setDoc;

  if (typeof originalGetDoc === "function") {
    firebase.getDoc = (...args) => withRejectTimeout(
      originalGetDoc(...args),
      "Lecture Firebase document examen",
      EXAM_FIREBASE_READ_TIMEOUT_MS
    );
  }

  if (typeof originalGetDocs === "function") {
    firebase.getDocs = (...args) => withRejectTimeout(
      originalGetDocs(...args),
      "Lecture Firebase examens",
      EXAM_FIREBASE_READ_TIMEOUT_MS
    );
  }

  if (typeof originalSetDoc === "function") {
    firebase.setDoc = (...args) => withSoftWriteTimeout(
      originalSetDoc(...args),
      "Sauvegarde Firebase examens trop longue, affichage poursuivi.",
      EXAM_FIREBASE_WRITE_SOFT_TIMEOUT_MS
    );
  }

  firebase.__examSafetyPatched = true;
  return true;
}

function installExamFirebasePatch() {
  if (patchExamFirebase()) return;

  window.addEventListener("profFirebaseReady", () => {
    patchExamFirebase();
  }, { once: true });
}

function getExamDebugInfo() {
  const settings = window.__examResponsesSettings || {};
  return [
    `currentProfUser: ${window.currentProfUser?.email || "absent"}`,
    `spreadsheetId: ${settings.spreadsheetId ? "present" : "absent"}`,
    `gid: ${settings.gid || "absent"}`,
    `firebase: ${window.profFirebase?.db ? "present" : "absent"}`
  ].join(" | ");
}

function installExamLoadingWatchdog() {
  if (window.__examSafetyWatchdogInstalled) return;
  window.__examSafetyWatchdogInstalled = true;

  setTimeout(() => {
    const sheetStatus = document.getElementById("sheetStatus");
    const sheetContent = document.getElementById("sheetContent");
    const hasCards = Boolean(document.querySelector("[data-answer-card]"));
    const hasContent = Boolean(sheetContent?.innerHTML?.trim());

    if (!sheetStatus || hasCards || hasContent) {
      return;
    }

    sheetStatus.hidden = false;
    sheetStatus.style.display = "block";
    sheetStatus.innerHTML = `
      <div class="inline-error-box">
        <h4>Chargement trop long</h4>
        <p>
          Le chargement examens n'a pas rendu la main. Le blocage vient probablement
          de Google Sheets ou d'une lecture Firebase pendant l'initialisation.
        </p>
        <p style="margin-top:10px; opacity:.75; font-size:12px; word-break:break-word;">
          ${getExamDebugInfo()}
        </p>
        <button type="button" class="btn secondary" onclick="window.location.reload()">
          Recharger
        </button>
      </div>
    `;

    if (sheetContent && !sheetContent.innerHTML.trim()) {
      sheetContent.hidden = true;
    }
  }, EXAM_UI_WATCHDOG_MS);
}

patchExamFetch();
installExamFirebasePatch();
installExamLoadingWatchdog();
