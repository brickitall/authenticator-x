/**
 * Asking for a rating, once, after real use — and never in a way the stores
 * forbid. Both ban rewarding a rating; asking only people who said they were
 * happy (and sending the rest to a feedback form) is the review-gating they
 * treat as manipulation. So everyone who is asked gets the same plain question,
 * and "Not now" is as easy as "Rate it".
 *
 * What it remembers stays in local storage and is never sent anywhere: when a
 * code was first used, how many have been copied or filled since, and the
 * answer. No secret, no account name — the privacy policy lists it.
 */

const RATING_KEY = 'authx.rating';

/** Real use, not a first look: a week of it, and codes actually used. */
export const ASK_AFTER_DAYS = 7;
export const ASK_AFTER_USES = 15;
/** "Not now" means not for two months. The second "Not now" means never. */
export const SNOOZE_DAYS = 60;
const MAX_SNOOZES = 2;

const DAY = 24 * 60 * 60 * 1000;

export interface RatingState {
  firstUseAt: number | null;
  uses: number;
  snoozes: number;
  snoozedUntil: number | null;
  /** Rated, or asked as many times as it ever will be. */
  done: boolean;
}

const FRESH: RatingState = { firstUseAt: null, uses: 0, snoozes: 0, snoozedUntil: null, done: false };

export function shouldAsk(state: RatingState, now: number): boolean {
  if (state.done || state.firstUseAt === null) return false;
  if (state.snoozedUntil !== null && now < state.snoozedUntil) return false;
  return now - state.firstUseAt >= ASK_AFTER_DAYS * DAY && state.uses >= ASK_AFTER_USES;
}

export function recordUse(state: RatingState, now: number): RatingState {
  if (state.done) return state;
  return { ...state, firstUseAt: state.firstUseAt ?? now, uses: state.uses + 1 };
}

export function snooze(state: RatingState, now: number): RatingState {
  const snoozes = state.snoozes + 1;
  return { ...state, snoozes, snoozedUntil: now + SNOOZE_DAYS * DAY, done: snoozes >= MAX_SNOOZES };
}

export function answered(state: RatingState): RatingState {
  return { ...state, done: true };
}

function isRatingState(value: unknown): value is RatingState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return (
    (state.firstUseAt === null || typeof state.firstUseAt === 'number') &&
    typeof state.uses === 'number' &&
    typeof state.snoozes === 'number' &&
    (state.snoozedUntil === null || typeof state.snoozedUntil === 'number') &&
    typeof state.done === 'boolean'
  );
}

export async function loadRating(): Promise<RatingState> {
  const stored = await chrome.storage.local.get(RATING_KEY);
  return isRatingState(stored[RATING_KEY]) ? stored[RATING_KEY] : FRESH;
}

/**
 * Read, change, write. Two surfaces counting at the same moment can lose one
 * use; for a count that only decides when to ask a question, that is fine,
 * and it keeps this off the service worker's vault queue.
 */
export async function updateRating(change: (state: RatingState) => RatingState): Promise<void> {
  const next = change(await loadRating());
  await chrome.storage.local.set({ [RATING_KEY]: next });
}

const CHROME_ID = 'occcfljfhlijenkofoceocnimkfpdndl';
const EDGE_ID = 'lnbabkbknabedpnmdihllnbhdmolianm';

/**
 * Where this copy was installed from, so the rating lands on the listing the
 * person actually uses. The store builds are known by their ids; an unpacked
 * build goes by the browser.
 */
export function storeListing(
  extensionId: string = chrome.runtime.id,
  userAgent: string = navigator.userAgent,
): { store: string; url: string } {
  const edge = extensionId === EDGE_ID || (extensionId !== CHROME_ID && / Edg\//.test(userAgent));
  return edge
    ? { store: 'Edge Add-ons', url: `https://microsoftedge.microsoft.com/addons/detail/${EDGE_ID}` }
    : { store: 'the Chrome Web Store', url: `https://chromewebstore.google.com/detail/${CHROME_ID}/reviews` };
}
