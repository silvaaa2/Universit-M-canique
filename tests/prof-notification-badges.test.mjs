import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

const professorPages = [
  "pages/espace-prof.html",
  "pages/prof-rp-7x92q.html",
  "pages/prof-exam-4x91q.html",
  "pages/prof-modules-eleves.html",
  "pages/prof-customs-eleves.html"
];

test("les nouvelles copies et customs alimentent des compteurs non lus locaux", async () => {
  const source = await read("assets/js/prof-notifications-v2.js");

  assert.match(source, /UNREAD_KEY = "profV2NotificationUnread"/);
  assert.match(source, /SEEN_NEWS_KEY = "profV2SeenSiteNews"/);
  assert.match(source, /function addUnread\(target, count\)/);
  assert.match(source, /addUnread\("exam", examDiff\)/);
  assert.match(source, /addUnread\("custom", customDiff\)/);
  assert.match(source, /function markTargetSeen\(target\)/);
  assert.match(source, /currentPageTarget\(\) === target/);
  assert.match(source, /window\.profNotificationBadges = Object\.freeze/);
});

test("les pastilles sont présentes sur la navigation PC et téléphone de tout l'espace prof", async () => {
  for (const page of professorPages) {
    const html = await read(page);
    assert.match(html, /prof-notifications-v2\.js\?v=6/);
    assert.match(html, /data-prof-notification-target="custom"/);
    assert.match(html, /data-prof-notification-target="exam"/);
  }

  const mobile = await read("assets/js/prof-mobile-app.js");
  assert.match(mobile, /data-mobile-section="customs" data-prof-notification-target="custom"/);
  assert.match(mobile, /data-mobile-section="exams" data-prof-notification-target="exam"/);
  assert.match(mobile, /data-mobile-action="settings" data-prof-notification-target="settings"/);
  assert.match(mobile, /new CustomEvent\("profNavigationReady"\)/);
});

test("une nouveauté Paramètres est annoncée puis marquée comme vue à l'ouverture", async () => {
  const [html, source, desktopStyles, mobileStyles] = await Promise.all([
    read("pages/espace-prof.html"),
    read("assets/js/prof-notifications-v2.js"),
    read("assets/css/prof-v2.css"),
    read("assets/css/prof-mobile-app.css")
  ]);

  assert.match(html, /id="profSettingsBtn" data-prof-notification-target="settings"/);
  assert.match(html, /data-site-news-id="2026-08-25-notification-badges"/);
  assert.match(html, /Pastilles de notifications/);
  assert.match(source, /id: "2026-08-25-notification-badges"/);
  assert.match(source, /profSettingsBtn"\)\?\.addEventListener\("click"[\s\S]*?markTargetSeen\("settings"\)/);
  assert.match(desktopStyles, /\.prof-notification-badge/);
  assert.match(desktopStyles, /\.v2-settings-news/);
  assert.match(mobileStyles, /\.prof-mobile-tabbar a > \.prof-notification-badge/);
});

test("ouvrir une rubrique remet uniquement son compteur à zéro", async () => {
  const source = await read("assets/js/prof-notifications-v2.js");
  const values = new Map();
  const localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
  const document = {
    visibilityState: "visible",
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {},
    body: { appendChild() {} }
  };
  const window = {
    location: { pathname: "/pages/prof-modules-eleves.html", href: "http://localhost/pages/prof-modules-eleves.html" },
    localStorage,
    profLiveRefresh: {},
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    addEventListener() {}
  };

  runInNewContext(source, { window, document, localStorage, console, URL, setTimeout });
  window.profNotificationBadges.add("exam", 4);
  window.profNotificationBadges.add("custom", 2);

  let unread = JSON.parse(localStorage.getItem("profV2NotificationUnread"));
  assert.equal(unread.exam, 4);
  assert.equal(unread.custom, 2);

  window.profNotificationBadges.markSeen("exam");
  unread = JSON.parse(localStorage.getItem("profV2NotificationUnread"));
  assert.equal(unread.exam, 0);
  assert.equal(unread.custom, 2);
});
