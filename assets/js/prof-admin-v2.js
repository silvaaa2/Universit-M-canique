import "./prof-identity.js?v=1";

const ADMIN_MODULES = [
  "./prof-admin.js?v=1007",
  "./prof-admin-polish.js?v=1006",
  "./prof-admin-preview.js?v=1008",
  "./prof-admin-free-tools.js?v=1012",
  "./prof-admin-media.js?v=1011",
  "./prof-admin-drive-tools.js?v=1006",
  "./prof-admin-exam-settings.js?v=1012",
  "./prof-admin-exam-scale-wizard.js?v=1007",
  "./prof-admin-patch-notes.js?v=1004"
];

let adminBundlePromise = null;

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function getFreshModuleUrl(path) {
  const url = new URL(path, import.meta.url);
  url.searchParams.set("_admin", "20260813-clean-copy");
  return url;
}

function stripLegacyImports(source) {
  return String(source || "")
    .replace(/^\s*import\s+["']\.\/prof-auth\.js[^"']*["'];\s*$/gm, "")
    .replace(/^\s*import\s+["']\.\/prof-admin[^"']*["'];\s*$/gm, "");
}

async function importLegacyModule(path) {
  const url = getFreshModuleUrl(path);
  const response = await fetch(url.href, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Module admin introuvable : ${path}`);
  }

  const source = stripLegacyImports(await response.text());
  const blob = new Blob([source], { type: "text/javascript" });
  const blobUrl = URL.createObjectURL(blob);

  try {
    await import(blobUrl);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }
}

async function loadAdminBundle() {
  if (!adminBundlePromise) {
    adminBundlePromise = (async () => {
      for (const modulePath of ADMIN_MODULES) {
        await importLegacyModule(modulePath);
      }
    })().catch(error => {
      adminBundlePromise = null;
      throw error;
    });
  }

  return adminBundlePromise;
}

async function waitForAdminModal() {
  for (let index = 0; index < 24; index += 1) {
    if (document.getElementById("profAdminModal")) return true;
    await wait(150);
  }

  return false;
}

function showAdminLoadError(error) {
  console.error("Chargement du panneau admin impossible :", error);
  alert("Le panneau d’administration ne peut pas s’ouvrir pour le moment.");
}

async function openAdminPanel(event) {
  const button = event.target?.closest?.("#profAdminBtn");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  try {
    button.disabled = true;
    await loadAdminBundle();

    const modalReady = await waitForAdminModal();
    if (!modalReady || typeof window.openProfAdminPanel !== "function") {
      throw new Error("Le panneau admin complet n'est pas prêt.");
    }

    window.openProfAdminPanel();
  } catch (error) {
    showAdminLoadError(error);
  } finally {
    button.disabled = false;
  }
}

document.addEventListener("click", openAdminPanel, true);
