/**
 * Build-time product configuration.
 */

/** Where the popup sends people who want sync. Empty until the site is live. */
export const ACCOUNT_URL = '';

/**
 * The sync backend, injected at build time via `VITE_SYNC_API_URL`.
 *
 * Empty disables every account feature in the UI, which is the state to ship in
 * until a server is deployed: a sign-in form that cannot reach anything is
 * worse than no sign-in form at all.
 */
export const SYNC_API_URL = (import.meta.env.VITE_SYNC_API_URL ?? '').replace(/\/+$/, '');

export const SYNC_ENABLED = SYNC_API_URL.length > 0;
