const IDENTITY_TIMEOUT_MS = 7000;

function withTimeout(promise, ms = IDENTITY_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("Lecture de l'identité trop longue.")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function clean(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function getDiscordIdentity(claims = {}) {
  const discordId = clean(claims.discordId, 32);
  if (claims.authProvider !== "discord" || !discordId) return null;

  return {
    provider: "discord",
    actorId: `discord:${discordId}`,
    discordId,
    username: clean(claims.discordUsername, 80),
    displayName: clean(claims.discordName, 80) || "Professeur",
    avatarUrl: clean(claims.discordAvatar, 500),
    role: claims.role === "prof" || claims.admin === true ? "prof" : null,
    admin: claims.admin === true,
    roleSynced: claims.discordRoleSynced === true
  };
}

function getEmailIdentity(user) {
  const email = clean(user?.email, 180);
  return {
    provider: "email",
    actorId: email || clean(user?.uid, 180),
    discordId: "",
    username: "",
    displayName: email || "Professeur",
    avatarUrl: clean(user?.photoURL, 500),
    role: null,
    admin: false,
    roleSynced: true
  };
}

function decorateUser(user, identity) {
  if (!user || !identity) return identity;
  try {
    Object.defineProperties(user, {
      profIdentity: { value: identity, configurable: true, writable: true },
      profActorId: { value: identity.actorId, configurable: true, writable: true },
      profDisplayName: { value: identity.displayName, configurable: true, writable: true }
    });
  } catch {
    user.profIdentity = identity;
    user.profActorId = identity.actorId;
    user.profDisplayName = identity.displayName;
  }
  window.currentProfIdentity = identity;
  window.dispatchEvent(new CustomEvent("profIdentityReady", {
    detail: { user, identity }
  }));
  return identity;
}

function getTrustedAvatarUrl(value) {
  const source = clean(value, 500);
  if (!source) return "";

  try {
    const url = new URL(source);
    const isDiscordCdn = url.protocol === "https:"
      && (url.hostname === "cdn.discordapp.com" || url.hostname === "media.discordapp.net");
    return isDiscordCdn ? url.href : "";
  } catch {
    return "";
  }
}

export async function resolveProfIdentity(user, { forceRefresh = false } = {}) {
  if (!user) return null;
  if (user.profIdentity && !forceRefresh) return user.profIdentity;

  let identity = null;
  if (typeof user.getIdTokenResult === "function") {
    try {
      const tokenResult = await withTimeout(user.getIdTokenResult(forceRefresh));
      identity = getDiscordIdentity(tokenResult?.claims || {});
    } catch (error) {
      console.warn("Identité Discord indisponible :", error);
    }
  }

  return decorateUser(user, identity || getEmailIdentity(user));
}

export async function getProfAccess(user, legacyAccessLoader) {
  const identity = await resolveProfIdentity(user);
  if (!identity) return { role: null, admin: false, identity: null };

  if (identity.provider === "discord") {
    return {
      role: identity.role,
      admin: identity.admin === true,
      identity
    };
  }

  const legacy = typeof legacyAccessLoader === "function"
    ? await legacyAccessLoader()
    : { role: null, admin: false };
  const access = {
    role: legacy?.role || null,
    admin: legacy?.admin === true,
    identity: {
      ...identity,
      role: legacy?.role || null,
      admin: legacy?.admin === true
    }
  };
  decorateUser(user, access.identity);
  return access;
}

export function isProfAllowed(access) {
  return access?.role === "prof" || access?.admin === true;
}

export function getProfDisplayName(user) {
  return clean(user?.profDisplayName || user?.profIdentity?.displayName || user?.email, 80) || "Professeur";
}

export function getProfActorId(user) {
  return clean(user?.profActorId || user?.profIdentity?.actorId || user?.email || user?.uid, 180) || "professeur inconnu";
}

export function getProfSecondaryLabel(user) {
  const identity = user?.profIdentity;
  if (identity?.provider === "discord") {
    return identity.username ? `Discord • @${identity.username}` : "Compte Discord";
  }
  return clean(user?.email, 180);
}

export function getProfAvatarUrl(user) {
  const identity = user?.profIdentity || window.currentProfIdentity;
  if (identity?.provider !== "discord") return "";
  return getTrustedAvatarUrl(identity.avatarUrl);
}

export function renderProfAvatar(element, user, fallbackText = "PR") {
  if (!(element instanceof HTMLElement)) return false;

  const safeFallback = clean(fallbackText, 4) || "PR";
  const avatarUrl = getProfAvatarUrl(user);
  element.classList.remove("has-prof-avatar");
  element.textContent = safeFallback;

  if (!avatarUrl) return false;

  const image = new Image();
  image.className = "prof-avatar-image";
  image.alt = `Photo de profil Discord de ${getProfDisplayName(user)}`;
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";

  image.addEventListener("load", () => {
    element.textContent = "";
    element.appendChild(image);
    element.classList.add("has-prof-avatar");
  }, { once: true });

  image.addEventListener("error", () => {
    element.classList.remove("has-prof-avatar");
    element.textContent = safeFallback;
  }, { once: true });

  image.src = avatarUrl;
  return true;
}

window.profIdentityUtils = {
  getProfAvatarUrl,
  getProfAccess,
  getProfActorId,
  getProfDisplayName,
  getProfSecondaryLabel,
  isProfAllowed,
  renderProfAvatar,
  resolveProfIdentity
};
