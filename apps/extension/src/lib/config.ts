/**
 * Build-time product configuration.
 */

/**
 * The sync backend, injected at build time via `VITE_SYNC_API_URL` — the
 * official server unless the build says otherwise (scripts/release.mjs).
 *
 * Empty disables every account feature in the UI: a sign-in form that cannot
 * reach anything is worse than no sign-in form at all.
 */
export const SYNC_API_URL = (import.meta.env.VITE_SYNC_API_URL ?? '').replace(/\/+$/, '');

export const SYNC_ENABLED = SYNC_API_URL.length > 0;
