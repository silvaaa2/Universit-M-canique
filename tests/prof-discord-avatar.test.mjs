import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("la photo Discord remplace les initiales avec un repli sûr", async () => {
  const [identity, dashboard, customs, localProfile, css, modulesPage, examPage, customsPage, discordAuth] = await Promise.all([
    read("../assets/js/prof-identity.js"),
    read("../assets/js/prof-auth-v2.js"),
    read("../assets/js/prof-customs-eleves-page.js"),
    read("../assets/js/prof-local-profile.js"),
    read("../assets/css/prof-v2.css"),
    read("../pages/prof-modules-eleves.html"),
    read("../pages/prof-exam-4x91q.html"),
    read("../pages/prof-customs-eleves.html"),
    read("../lib/server/discord-prof-auth.js")
  ]);

  assert.match(identity, /avatarUrl: clean\(claims\.discordAvatar/);
  assert.match(identity, /cdn\.discordapp\.com/);
  assert.match(identity, /export function renderProfAvatar/);
  assert.match(identity, /image\.addEventListener\("error"/);
  assert.match(identity, /element\.textContent = safeFallback/);
  assert.match(dashboard, /renderProfAvatar\(v2UserInitials, user, profile\.initials\)/);
  assert.match(dashboard, /renderProfAvatar\(profilePreviewInitials, user, profile\.initials\)/);
  assert.match(customs, /renderProfAvatar\(userInitials, user, getInitials\(displayName\)\)/);
  assert.match(localProfile, /profIdentityUtils\?\.renderProfAvatar/);
  assert.match(css, /\.prof-avatar-image/);
  assert.match(modulesPage, /profIdentityReady/);
  assert.match(examPage, /renderProfAvatar/);
  assert.match(customsPage, /prof-customs-eleves-page\.js\?v=13/);
  assert.match(discordAuth, /cdn\.discordapp\.com\/embed\/avatars/);
});
