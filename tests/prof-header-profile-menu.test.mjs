import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("l'en-tête garde seulement l'avatar et ouvre un menu de compte compact", async () => {
  const [html, auth, styles] = await Promise.all([
    read("../pages/espace-prof.html"),
    read("../assets/js/prof-auth-v2.js"),
    read("../assets/css/prof-v2.css")
  ]);

  assert.match(html, /id="v2ProfileMenuTrigger"/);
  assert.match(html, /id="v2ProfileDropdown"[^>]*role="menu"[^>]*hidden/);
  assert.match(html, /id="v2ProfileDropdown"[\s\S]*?id="v2UserEmail"[\s\S]*?id="logoutBtn"/);
  assert.doesNotMatch(html, /class="v2-notify-btn"/);
  assert.doesNotMatch(html, /class="v2-user-pill"/);
  assert.match(auth, /function initProfileMenu\(\)/);
  assert.match(auth, /setProfileMenuOpen\(v2ProfileDropdown\.hidden\)/);
  assert.match(auth, /event\.key !== "Escape"/);
  assert.match(styles, /\.v2-profile-dropdown/);
  assert.match(styles, /@keyframes v2ProfileMenuIn/);
});

test("les notifications sont actives par défaut et réglables uniquement dans Paramètres", async () => {
  const [html, notifications, mobile] = await Promise.all([
    read("../pages/espace-prof.html"),
    read("../assets/js/prof-notifications-v2.js"),
    read("../assets/js/prof-mobile-app.js")
  ]);

  assert.match(html, /data-settings-category="notifications"/);
  assert.match(html, /data-settings-panel="notifications"/);
  assert.match(html, /id="v2NotificationsBtn"[\s\S]*?aria-checked="true"/);
  assert.equal((html.match(/id="v2NotificationsBtn"/g) || []).length, 1);
  assert.match(notifications, /savedValue === null \? true : savedValue === "true"/);
  assert.match(notifications, /button\.setAttribute\("aria-checked"/);
  assert.doesNotMatch(mobile, /data-mobile-action="notifications"/);
});
