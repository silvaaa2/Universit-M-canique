import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = relativePath => readFileSync(join(root, relativePath), "utf8");

test("les réponses customs sont chargées via l'API professeur", () => {
  const loader = read("assets/js/rp-loader-9kq4z.js");
  assert.match(loader, /\/api\/secure-sheet/);
  assert.match(loader, /Authorization:/);
  assert.doesNotMatch(loader, /docs\.google\.com\/spreadsheets/);
  assert.doesNotMatch(loader, /spreadsheetId:\s*["'][A-Za-z0-9_-]{20,}/);
});

test("le serveur est prêt pour des feuilles Google privées", () => {
  const endpoint = read("api/secure-sheet.js");
  assert.match(endpoint, /GOOGLE_SERVICE_ACCOUNT_EMAIL/);
  assert.match(endpoint, /GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
  assert.match(endpoint, /spreadsheets\.readonly/);
  assert.match(endpoint, /fetchPrivateGoogleCsv/);
});

test("le tableau de bord charge l'effectif actif par l'API sécurisée", () => {
  const dashboard = read("assets/js/prof-auth-v2.js");
  const secureSheet = read("api/secure-sheet.js");

  assert.match(dashboard, /\/api\/secure-sheet\?source=effectif&sheet=current/);
  assert.match(dashboard, /Authorization: `Bearer \$\{idToken\}`/);
  assert.doesNotMatch(dashboard, /const csvUrl = `https:\/\/docs\.google\.com\/spreadsheets\/d\/\$\{encodeURIComponent\(spreadsheetId\)\}/);
  assert.match(secureSheet, /source === EFFECTIF_SOURCE && safeSheetKey === EFFECTIF_SHEET_KEY/);
  assert.match(secureSheet, /getFirestoreDocument\(\["stageSettings", "effectif"\], idToken\)/);
});

test("la clé de correction n'est plus publiée", () => {
  assert.equal(existsSync(join(root, "assets/js/update-corrections.js")), false);
});

test("le pointage automatique est activé par défaut, désactivable et garde Ctrl+V en secours", () => {
  const source = read("assets/js/prof-modules-clipboard.js");
  const init = source.match(/function initClipboardModuleScan\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(init, /readScanEnabledPreference\(\)[\s\S]*?startClipboardScan\s*\(/);
  assert.match(source, /CLIPBOARD_SCAN_DELAY_MS = 5000/);
  assert.match(source, /savedValue === null \? true/);
  assert.match(source, /SCAN_ENABLED_STORAGE_KEY = "profModulesAutoPasteEnabled"/);
  assert.match(source, /data-modules-scan-toggle/);
  assert.match(source, /function toggleClipboardScan\(\)/);
  assert.match(source, /function stopClipboardScan\(/);
  assert.match(source, /saveScanEnabledPreference\(false\)/);
  assert.match(source, /Auto-collage désactivé · Ctrl\+V disponible/);
  assert.match(source, /Ctrl\+V si le navigateur bloque/);
  assert.match(source, /ID \$\{candidate\} déjà noté pour \$\{moduleLabel\}/);
  assert.doesNotMatch(source, /if \(clipboardReadUnavailable\) return;\n  if \(document\.hidden/);
  assert.doesNotMatch(source, /firstCandidate === lastClipboardCandidate/);
  assert.doesNotMatch(source, /déjà validé, date mise à jour/);
});

test("la page Modules reste visible avec animations réduites", () => {
  const html = read("pages/prof-modules-eleves.html");
  assert.match(html, /prefers-reduced-motion:\s*reduce[\s\S]*?\.modules-v2-app[\s\S]*?opacity:\s*1\s*!important/);
  assert.match(html, /animation:\s*none\s*!important/);
});

test("le Mode Simplifié branche directement son interrupteur et sauvegarde le choix", () => {
  const source = read("assets/js/prof-simplified-mode.js");
  const dashboard = read("pages/espace-prof.html");

  assert.match(source, /querySelectorAll\("\[data-simplified-toggle\]"\)[\s\S]*?control\.addEventListener\("click"/);
  assert.match(source, /applyPreference\(!isEnabled\(\), \{ persist: true \}\)/);
  assert.match(source, /localStorage\.setItem\(STORAGE_KEY, String\(safeEnabled\)\)/);
  assert.match(source, /document\.readyState === "loading"/);
  assert.match(dashboard, /id="simplifiedModeToggle"/);
  assert.match(dashboard, /prof-simplified-mode\.js\?v=5/);
});

test("la lecture vocale utilise un clic direct et privilégie une voix française masculine", () => {
  const source = read("assets/js/prof-simplified-mode.js");
  const dashboard = read("pages/espace-prof.html");

  assert.match(source, /function bindSpeechButton\(button\)/);
  assert.match(source, /button\.addEventListener\("click"/);
  assert.match(source, /function getFrenchMaleVoice\(\)/);
  assert.match(source, /"thomas", "henri", "paul"/);
  assert.match(source, /utterance\.pitch = 0\.82/);
  assert.match(source, /window\.speechSynthesis\.resume\(\)/);
  assert.match(source, /voiceschanged/);
  assert.match(dashboard, /id="simplifiedVoiceTest"/);
  assert.match(dashboard, /Tester la voix masculine/);
});

test("le Confort de lecture applique directement le thème et les tailles", () => {
  const source = read("assets/js/prof-simplified-mode.js");
  const auth = read("assets/js/prof-auth-v2.js");

  assert.match(source, /querySelectorAll\("\[data-theme-choice\]"\)[\s\S]*?control\.addEventListener\("click"/);
  assert.match(source, /applyTheme\(control\.dataset\.themeChoice, \{ persist: true \}\)/);
  assert.match(source, /localStorage\.setItem\(THEME_STORAGE_KEY, safeTheme\)/);
  assert.match(source, /querySelectorAll\("\[data-simplified-text-size\]"\)[\s\S]*?control\.addEventListener\("click"/);
  assert.doesNotMatch(auth, /function initTheme\(/);
});

test("les paramètres utiles sont classés et restent locaux", () => {
  const dashboard = read("pages/espace-prof.html");
  const preferences = read("assets/js/prof-local-preferences.js");
  const styles = read("assets/css/prof-simplified-mode.css");

  for (const category of ["profile", "display", "accessibility", "notifications"]) {
    assert.match(dashboard, new RegExp(`data-settings-category="${category}"`));
    assert.match(dashboard, new RegExp(`data-settings-panel="${category}"`));
  }

  assert.match(dashboard, /data-local-preference="highContrast"/);
  assert.match(dashboard, /data-local-preference="reducedMotion"/);
  assert.match(dashboard, /data-reset-local-preferences/);
  assert.match(preferences, /window\.localStorage\.setItem/);
  assert.match(preferences, /profHighContrast/);
  assert.match(preferences, /profReducedMotion/);
  assert.match(styles, /html\.prof-high-contrast/);
  assert.match(styles, /html\.prof-reduced-motion/);
  assert.doesNotMatch(dashboard, /data-local-preference="(?:keepAwake|autoPaste)"/);
  assert.doesNotMatch(preferences, /wakeLock|profKeepScreenAwake|profModulesAutoPasteEnabled/);
  assert.doesNotMatch(preferences, /firebase|firestore/i);
});

test("le zoom ne charge jamais une URL vide", () => {
  const source = read("assets/js/image-zoom.js");
  assert.doesNotMatch(source, /src=["']{2}/);
  assert.doesNotMatch(source, /\.src\s*=\s*["']{2}/);
  assert.match(source, /removeAttribute\("src"\)/);
});

test("les images initiales utilisent les versions optimisées", () => {
  const homepage = read("index.html");
  const expected = [
    "Images/logo.webp",
    "Images/FINAL SENTINEL.webp",
    "Images/FINAL RS2 (2).webp",
    "Images/FINAL CYPHER.webp"
  ];

  expected.forEach(path => {
    assert.match(homepage, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(existsSync(join(root, path)), true);
  });

  const totalBytes = expected.reduce((total, path) => total + statSync(join(root, path)).size, 0);
  assert.ok(totalBytes < 500_000, `Poids initial trop élevé : ${totalBytes} octets`);
});

test("les contrôles mobiles principaux ont un nom accessible", () => {
  const pages = ["index.html", "pages/custom-facile.html", "pages/custom-moyen.html", "pages/custom-difficile.html"];
  pages.forEach(path => {
    const html = read(path);
    assert.doesNotMatch(html, /<button class="prof-button"(?![^>]*aria-label)/);
  });

  for (const path of pages.slice(1)) {
    const html = read(path);
    assert.doesNotMatch(html, /<button(?![^>]*aria-label)[^>]*class="(?:panel-close|gallery-arrow)/);
  }
});

test("la connexion Discord utilise le logo officiel et garde l'e-mail fonctionnel", () => {
  const html = read("pages/espace-prof.html");
  const auth = read("assets/js/prof-auth-v2.js");

  assert.match(html, /Images\/discord-symbol\.svg/);
  assert.match(html, /<span>Connexion e-mail<\/span>/);
  assert.doesNotMatch(html, /Connexion e-mail de secours/);
  assert.match(html, /id="loginForm"/);
  assert.match(auth, /signInWithEmailAndPassword/);
  assert.match(auth, /loginForm\?\.addEventListener\("submit"/);
  assert.match(auth, /emailLoginDetails\.open = shouldOpen/);
  assert.match(auth, /loginForm\.requestSubmit\(\)/);
  assert.equal(existsSync(join(root, "Images/discord-symbol.svg")), true);
});

test("les ressources locales référencées par les pages existent", () => {
  const pages = [
    "index.html",
    "pages/custom-facile.html",
    "pages/custom-moyen.html",
    "pages/custom-difficile.html",
    "pages/espace-prof.html",
    "pages/prof-exam-4x91q.html",
    "pages/prof-rp-7x92q.html",
    "pages/prof-customs-eleves.html",
    "pages/prof-modules-eleves.html"
  ];

  for (const page of pages) {
    const html = read(page);
    const base = dirname(join(root, page));
    const urls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);

    for (const rawUrl of urls) {
      if (/^(?:https?:|data:|mailto:|#)/.test(rawUrl)) continue;
      const cleanUrl = rawUrl.split(/[?#]/)[0];
      if (!cleanUrl || extname(cleanUrl) === "") continue;
      const target = cleanUrl.startsWith("/")
        ? join(root, cleanUrl.slice(1))
        : resolve(base, cleanUrl);
      assert.equal(existsSync(target), true, `${page} référence une ressource absente : ${rawUrl}`);
    }
  }
});

test("Vercel applique les protections de navigateur non bloquantes", () => {
  const config = JSON.parse(read("vercel.json"));
  const headers = config.headers?.[0]?.headers || [];
  const byName = new Map(headers.map(header => [header.key.toLowerCase(), header.value]));
  assert.equal(byName.get("x-frame-options"), "DENY");
  assert.equal(byName.get("x-content-type-options"), "nosniff");
});

test("la synchronisation Suivi de Stage utilise A et B quand leurs en-têtes sont absents", () => {
  const sync = read("assets/js/prof-modules-sheets-sync-exact.js");
  assert.match(sync, /const idColumn = detectedIdColumn >= 0 \? detectedIdColumn : 0;/);
  assert.match(sync, /const nameColumn = detectedNameColumn >= 0 \? detectedNameColumn : 1;/);
  assert.doesNotMatch(sync, /throw new Error\("Colonne ID Unique introuvable dans la feuille\."\)/);
});

test("Déjà approuvé reste masqué tant qu'aucune autre réponse n'est validée", () => {
  const css = read("assets/css/prof-rp-v2.css");
  assert.match(css, /\.rp-v2-page \.student-already-approved-badge\[hidden\],[\s\S]*?display: none !important;/);
  assert.match(css, /\.rp-v2-page \.student-already-approved-panel\[hidden\][\s\S]*?display: none !important;/);
});

test("les liens customs ont une ouverture externe native et un secours navigateur", () => {
  const loader = read("assets/js/rp-loader-9kq4z.js");
  assert.match(loader, /target="_blank" rel="noopener noreferrer" data-open-external-link/);
  assert.match(loader, /window\.open\("about:blank", "_blank"\)/);
  assert.match(loader, /newTab\.location\.replace\(externalUrl\)/);
});

test("les modules utilisent un vrai bouton compatible entre navigateurs", () => {
  const modules = read("assets/js/prof-modules-eleves-safe.js");
  assert.match(modules, /<button type="button" class="module-check/);
  assert.match(modules, /aria-pressed=/);
  assert.match(modules, /data-persisted-checked=/);
  assert.match(modules, /modulesTable\?\.addEventListener\("click"/);
  assert.match(modules, /handleModuleCheckChange\(control\)/);
  assert.doesNotMatch(modules, /<input type="checkbox"[^>]*data-module-check/);
});
