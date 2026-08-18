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

test("la clé de correction n'est plus publiée", () => {
  assert.equal(existsSync(join(root, "assets/js/update-corrections.js")), false);
});

test("le presse-papiers ne démarre jamais sans action utilisateur", () => {
  const source = read("assets/js/prof-modules-clipboard.js");
  const init = source.match(/function initClipboardModuleScan\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.doesNotMatch(init, /startClipboardScan\s*\(/);
  assert.doesNotMatch(source, /data-modules-scan-toggle hidden/);
  assert.match(source, /Auto bloqué par le navigateur/);
  assert.match(source, /stopClipboardScan\(false\)/);
});

test("la page Modules reste visible avec animations réduites", () => {
  const html = read("pages/prof-modules-eleves.html");
  assert.match(html, /prefers-reduced-motion:\s*reduce[\s\S]*?\.modules-v2-app[\s\S]*?opacity:\s*1\s*!important/);
  assert.match(html, /animation:\s*none\s*!important/);
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
