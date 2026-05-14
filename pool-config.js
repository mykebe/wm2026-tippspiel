// Pool detection + per-pool branding.
// `/family` (or any path starting with `/family`) → family pool.
// Anything else → work pool. Defaulting to "work" preserves existing bookmarks.

function detectPoolId() {
  const path = (typeof location !== "undefined" && location.pathname) || "/";
  if (path === "/family" || path.startsWith("/family/")) return "family";
  return "work";
}

export const POOL_ID = detectPoolId();

export const POOL_BRANDING = {
  work: {
    title: "WM-Tippspiel",
    logo: "/logo.png",
    logoWhite: "/logo_white.png",
    authTitle: "WM-Tippspiel 2026",
    authSubtitle: "Registriere dich und sei der Beste... bei den Lebensräumen ;)"
  },
  family: {
    title: "WM-Tippspiel Family",
    logo: "/logo_family.png",
    logoWhite: "/logo_family_white.png",
    authTitle: "WM-Tippspiel 2026 — Family",
    authSubtitle: "Registriere dich — Familienliga 2026"
  }
};

export const BRANDING = POOL_BRANDING[POOL_ID];
