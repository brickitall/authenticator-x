import { isVaultFile, type VaultFile } from '@authx/core';

/**
 * Storage split, and why it matters:
 *
 * - `chrome.storage.local` holds the encrypted vault file. It is written to
 *   disk, so it must never contain anything readable.
 * - `chrome.storage.session` holds the unwrapped data key while unlocked. It
 *   lives in memory only, is wiped when the browser closes, and is unreachable
 *   from content scripts (TRUSTED_CONTEXTS is the default access level).
 */
const VAULT_KEY = 'authx.vault';
const SESSION_KEY = 'authx.sessionKey';
const LAST_ACTIVE_KEY = 'authx.lastActive';

export async function loadVaultFile(): Promise<VaultFile | null> {
  const stored = await chrome.storage.local.get(VAULT_KEY);
  const value = stored[VAULT_KEY];
  if (!value) return null;
  if (!isVaultFile(value)) {
    throw new Error('The stored vault is corrupted or was written by another app.');
  }
  return value;
}

export async function saveVaultFile(file: VaultFile): Promise<void> {
  await chrome.storage.local.set({ [VAULT_KEY]: file });
}

export async function clearVaultFile(): Promise<void> {
  await chrome.storage.local.remove(VAULT_KEY);
}

export async function saveSessionKey(rawKey: string): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY]: rawKey });
}

export async function loadSessionKey(): Promise<string | null> {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  return (stored[SESSION_KEY] as string | undefined) ?? null;
}

export async function clearSessionKey(): Promise<void> {
  await chrome.storage.session.remove([SESSION_KEY, LAST_ACTIVE_KEY]);
}

export async function markActive(): Promise<void> {
  await chrome.storage.session.set({ [LAST_ACTIVE_KEY]: Date.now() });
}

export async function lastActiveAt(): Promise<number | null> {
  const stored = await chrome.storage.session.get(LAST_ACTIVE_KEY);
  return (stored[LAST_ACTIVE_KEY] as number | undefined) ?? null;
}
