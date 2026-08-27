// Client-safe open-redirect guard: only approved TP-CAMP destinations are allowed.
export function safeTpcampRedirect(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return url.toString();
    }
    if (url.protocol !== "https:") return null;
    const ok =
      url.hostname === "tpcamponesuite.app" ||
      url.hostname === "www.tpcamponesuite.app" ||
      url.hostname.endsWith(".tpcamponesuite.app");
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
}

export const CHILD_APP_HOSTS: Record<string, string> = {
  "catalog.tpcamponesuite.app": "catalog",
  "invoice.tpcamponesuite.app": "invoice",
  "splits.tpcamponesuite.app": "splits",
  "operations.tpcamponesuite.app": "operations",
  "finance.tpcamponesuite.app": "finance",
};

/** If a return URL points at an approved child app, return its slug. */
export function childAppSlugFromUrl(candidate: string | null | undefined): string | null {
  const safe = safeTpcampRedirect(candidate);
  if (!safe) return null;
  try {
    return CHILD_APP_HOSTS[new URL(safe).hostname] ?? null;
  } catch {
    return null;
  }
}
