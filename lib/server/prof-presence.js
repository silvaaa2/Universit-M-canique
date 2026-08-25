const PRESENCE_COLLECTION = "profSettings";
const PRESENCE_DOCUMENT_PREFIX = "presence_";
// Les navigateurs ralentissent volontairement les minuteurs des onglets en
// arrière-plan. Deux minutes et demie gardent donc la présence fiable pendant
// qu'un professeur compare deux comptes ou deux fenêtres.
const PRESENCE_TTL_MS = 150_000;

const SECTION_LABELS = Object.freeze({
  dashboard: "Centre de pilotage",
  customResponses: "Réponses customs",
  exams: "Examens",
  modules: "Modules élèves",
  customAccess: "Accès customs"
});

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function isTrustedDiscordAvatar(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:"
      && (url.hostname === "cdn.discordapp.com" || url.hostname === "media.discordapp.net");
  } catch {
    return false;
  }
}

function normalizeSection(value) {
  const section = clean(value, 40);
  return Object.prototype.hasOwnProperty.call(SECTION_LABELS, section) ? section : "";
}

function buildPresence(access, section, now = Date.now()) {
  const safeSection = normalizeSection(section);
  if (!safeSection) return null;

  const claims = access?.claims || {};
  const rawAvatar = clean(claims.discordAvatar, 500);
  return {
    recordType: "profPresence",
    actorId: clean(access?.actorId, 180),
    displayName: clean(access?.displayName, 80) || "Professeur",
    avatarUrl: isTrustedDiscordAvatar(rawAvatar) ? rawAvatar : "",
    section: safeSection,
    sectionLabel: SECTION_LABELS[safeSection],
    admin: access?.admin === true,
    updatedAtMs: Math.floor(now)
  };
}

function listActivePresences(documents, now = Date.now()) {
  return (Array.isArray(documents) ? documents : [])
    .filter(item => item?.recordType === "profPresence")
    .filter(item => normalizeSection(item?.section))
    .filter(item => Number.isFinite(Number(item?.updatedAtMs)))
    .filter(item => now - Number(item.updatedAtMs) <= PRESENCE_TTL_MS)
    .map(item => ({
      displayName: clean(item.displayName, 80) || "Professeur",
      avatarUrl: isTrustedDiscordAvatar(item.avatarUrl) ? clean(item.avatarUrl, 500) : "",
      section: normalizeSection(item.section),
      admin: item.admin === true,
      updatedAtMs: Number(item.updatedAtMs)
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "fr"));
}

module.exports = {
  PRESENCE_COLLECTION,
  PRESENCE_DOCUMENT_PREFIX,
  PRESENCE_TTL_MS,
  SECTION_LABELS,
  buildPresence,
  isTrustedDiscordAvatar,
  listActivePresences,
  normalizeSection
};
