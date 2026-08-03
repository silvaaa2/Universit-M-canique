const PATCH_NOTE_TAB = "patchNotes";

let patchNoteToolStarted = false;
let patchNoteEventsBound = false;

function getPatchNoteTemplate() {
  return [
    "Ajout :",
    "- ...",
    "",
    "Correction :",
    "- ...",
    "",
    "A savoir :",
    "- ..."
  ].join("\n");
}

function injectPatchNoteStyles() {
  if (document.getElementById("profAdminPatchNoteStyles")) return;

  const style = document.createElement("style");
  style.id = "profAdminPatchNoteStyles";
  style.textContent = `
    .prof-admin-patch-panel .prof-admin-textarea {
      min-height: 260px;
      font-family: inherit;
      line-height: 1.55;
    }

    .prof-admin-patch-note-card {
      margin-top: 14px;
      padding: 14px;
      border: 1px solid rgba(214,180,106,.18);
      border-radius: 8px;
      background:
        linear-gradient(135deg, rgba(214,180,106,.08), transparent 34%),
        rgba(255,255,255,.028);
    }

    .prof-admin-patch-note-card strong {
      display: block;
      color: var(--gold2);
      font-size: 13px;
      margin-bottom: 8px;
    }

    .prof-admin-patch-note-card p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    #patchNoteStatus[data-tone="ok"] {
      color: #86efac;
    }

    #patchNoteStatus[data-tone="error"] {
      color: #fca5a5;
    }
  `;

  document.head.appendChild(style);
}

function setPatchNoteStatus(message, tone = "") {
  const status = document.getElementById("patchNoteStatus");
  if (!status) return;

  status.textContent = message || "";
  status.dataset.tone = tone;
}

function waitForProfFirebase() {
  if (window.profFirebase?.auth) {
    return Promise.resolve(window.profFirebase);
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Firebase prof n'est pas prêt."));
    }, 7000);

    window.addEventListener("profFirebaseReady", () => {
      window.clearTimeout(timeout);
      resolve(window.profFirebase);
    }, { once: true });
  });
}

async function getAdminIdToken() {
  const firebase = await waitForProfFirebase();
  const user = firebase.auth?.currentUser || window.currentProfUser;

  if (!user?.getIdToken) return "";
  return user.getIdToken();
}

function bindPatchNoteEvents() {
  if (patchNoteEventsBound) return;

  const panel = document.getElementById("profPatchNotesPanel");
  if (!panel) return;

  patchNoteEventsBound = true;

  const bodyInput = document.getElementById("patchNoteBodyInput");
  if (bodyInput && !bodyInput.value.trim()) {
    bodyInput.value = getPatchNoteTemplate();
  }

  document.getElementById("fillPatchNoteTemplateBtn")?.addEventListener("click", async () => {
    const body = document.getElementById("patchNoteBodyInput");
    if (!body) return;

    body.value = getPatchNoteTemplate();

    try {
      await navigator.clipboard.writeText(body.value);
      setPatchNoteStatus("Modèle chargé et copié.", "ok");
    } catch {
      setPatchNoteStatus("Modèle chargé.", "ok");
    }
  });

  document.getElementById("sendPatchNoteBtn")?.addEventListener("click", sendPatchNote);
}

function ensurePatchNotePanel() {
  const modal = document.getElementById("profAdminModal");
  const tabs = modal?.querySelector(".prof-admin-tabs");
  const workspace = modal?.querySelector(".prof-admin-workspace");

  if (!modal || !tabs || !workspace) return;

  if (!tabs.querySelector(`[data-admin-tab="${PATCH_NOTE_TAB}"]`)) {
    tabs.insertAdjacentHTML("beforeend", `
      <button type="button" class="prof-admin-tab" data-admin-tab="${PATCH_NOTE_TAB}">Patch notes</button>
    `);
  }

  if (!document.getElementById("profPatchNotesPanel")) {
    workspace.insertAdjacentHTML("beforeend", `
      <section id="profPatchNotesPanel" class="prof-admin-panel prof-admin-patch-panel" data-admin-panel="${PATCH_NOTE_TAB}" hidden>
        <div class="prof-admin-toolbar">
          <button type="button" class="prof-admin-small-btn gold" id="sendPatchNoteBtn">Envoyer Discord</button>
          <button type="button" class="prof-admin-small-btn" id="fillPatchNoteTemplateBtn">Modèle patch note</button>
          <span class="prof-admin-status" id="patchNoteStatus"></span>
        </div>

        <div class="prof-admin-field-grid">
          <div class="prof-admin-field full">
            <label for="patchNoteTitleInput">Titre Discord</label>
            <input id="patchNoteTitleInput" class="prof-admin-input" type="text" value="PATCH NOTE - Site Prof">
          </div>

          <div class="prof-admin-field full">
            <label for="patchNoteBodyInput">Message à envoyer</label>
            <textarea id="patchNoteBodyInput" class="prof-admin-textarea" spellcheck="true"></textarea>
          </div>
        </div>

        <div class="prof-admin-patch-note-card">
          <strong>Envoi sécurisé</strong>
          <p>Le webhook Discord reste dans les variables Vercel. L'API vérifie votre session admin Firebase avant l'envoi.</p>
        </div>
      </section>
    `);
  }

  bindPatchNoteEvents();
}

async function sendPatchNote() {
  const sendButton = document.getElementById("sendPatchNoteBtn");
  const title = document.getElementById("patchNoteTitleInput")?.value?.trim() || "PATCH NOTE - Site Prof";
  const message = document.getElementById("patchNoteBodyInput")?.value?.trim() || "";

  if (!message) {
    setPatchNoteStatus("Écris un message avant d'envoyer.", "error");
    return;
  }

  try {
    if (sendButton) sendButton.disabled = true;
    setPatchNoteStatus("Vérification admin...");

    const idToken = await getAdminIdToken();
    if (!idToken) {
      setPatchNoteStatus("Reconnecte-toi avec ton compte admin.", "error");
      return;
    }

    setPatchNoteStatus("Envoi en cours...");

    const response = await fetch("/api/discord-patch-note", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({ title, message })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setPatchNoteStatus(result.error || "Envoi impossible.", "error");
      return;
    }

    setPatchNoteStatus("Patch note envoyé sur Discord.", "ok");
  } catch (error) {
    setPatchNoteStatus(`Envoi impossible : ${error.message || error}`, "error");
  } finally {
    if (sendButton) sendButton.disabled = false;
  }
}

function startPatchNoteTool() {
  if (patchNoteToolStarted) return;

  patchNoteToolStarted = true;
  injectPatchNoteStyles();

  const observer = new MutationObserver(ensurePatchNotePanel);
  observer.observe(document.body, { childList: true, subtree: true });
  ensurePatchNotePanel();
}

if (document.body) {
  startPatchNoteTool();
} else {
  document.addEventListener("DOMContentLoaded", startPatchNoteTool, { once: true });
}
