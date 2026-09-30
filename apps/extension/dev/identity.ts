/**
 * Who the dev harness claims to be when it delivers a message.
 *
 * Kept apart from `chrome-stub.ts` only so a test can reach it: the stub
 * touches `localStorage` while it is still being imported, and the unit suite
 * runs in node with no DOM. This pair is the whole of what needs pinning.
 *
 * Development only — nothing here is part of the built extension.
 */
export const DEV_RUNTIME_ID = 'authx-dev-harness';

/** What Chrome reports as the origin of a page belonging to an extension. */
export const DEV_RUNTIME_ORIGIN = `chrome-extension://${DEV_RUNTIME_ID}`;

/**
 * The sender the stub hands to every listener, exported as one object so the
 * test pins what is actually delivered rather than a pair that merely happens
 * to sit next to it.
 */
export const DEV_SENDER = { id: DEV_RUNTIME_ID, origin: DEV_RUNTIME_ORIGIN };
