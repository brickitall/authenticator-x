import type { TokenStore, Tokens } from '@authx/core';

/**
 * Session tokens for the sync account.
 *
 * These live in `chrome.storage.local`, on disk, unlike the vault's data key.
 * That is a deliberate difference, not an oversight: a stolen token buys an
 * attacker ciphertext and nothing else, because decrypting any of it still
 * needs the master password. The alternative — session-only storage — would
 * mean signing in again every time the browser restarts, which trades real
 * usability for protection the encryption already provides.
 *
 * The server can revoke a token; it cannot un-leak a data key.
 */
const TOKENS_KEY = 'authx.tokens';

export const tokenStore: TokenStore = {
  async get(): Promise<Tokens | null> {
    const stored = await chrome.storage.local.get(TOKENS_KEY);
    return (stored[TOKENS_KEY] as Tokens | undefined) ?? null;
  },

  async set(tokens: Tokens): Promise<void> {
    await chrome.storage.local.set({ [TOKENS_KEY]: tokens });
  },

  async clear(): Promise<void> {
    await chrome.storage.local.remove(TOKENS_KEY);
  },
};
