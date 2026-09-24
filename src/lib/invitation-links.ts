/**
 * Invitation link origins. Links are only ever built from this exact list.
 * No wildcard, suffix or partial matching. A request's Origin header is used
 * only when the complete value equals an entry; Host, Forwarded and
 * X-Forwarded-Host are never consulted.
 */
export const DEFAULT_INVITE_ORIGIN = "https://tpcamponesuite.app";

export const TRUSTED_INVITE_ORIGINS: readonly string[] = [
  "https://tpcamponesuite.app",
  "https://www.tpcamponesuite.app",
  "https://tpcamponesuite.lovable.app",
  "https://id-preview--78e0852d-a4cf-409c-9124-a9a045dc4411.lovable.app",
];

export function trustedInviteOrigin(requestOrigin: string | null | undefined): string {
  if (typeof requestOrigin !== "string") return DEFAULT_INVITE_ORIGIN;
  return TRUSTED_INVITE_ORIGINS.includes(requestOrigin) ? requestOrigin : DEFAULT_INVITE_ORIGIN;
}

export function inviteLink(requestOrigin: string | null | undefined, token: string) {
  return `${trustedInviteOrigin(requestOrigin)}/invite/${encodeURIComponent(token)}`;
}
