import type { DeviceSummary, ProtectionMode, VaultData, VaultItem, VaultSettings } from '@authx/core';

/** What the popup/options pages know about the vault at any moment. */
export type VaultStatus =
  | { state: 'uninitialized' }
  | { state: 'locked'; hasRecovery: boolean }
  /**
   * The vault is protected by a device key that is no longer in this browser
   * profile — cleared site data, a new profile, or a reinstall. Without a
   * recovery key nothing can open it, and the only way forward is to reset.
   */
  | { state: 'unrecoverable'; hasRecovery: boolean }
  | {
      state: 'unlocked';
      data: VaultData;
      protection: ProtectionMode;
      hasRecovery: boolean;
      /**
       * Signed in, and the account holds this device's recovery kit — so the
       * printed key also recovers the account on a new device.
       */
      accountRecovery: boolean;
    };

/** How a new vault should be protected. */
export type ProtectionChoice =
  | { mode: 'device' }
  | { mode: 'passphrase'; password: string };

/**
 * Mutations are described rather than applied by the caller: the service worker
 * is the only writer, which keeps the popup and the options tab from clobbering
 * each other when both are open.
 */
export type Mutation =
  | { op: 'items/add'; items: VaultItem[] }
  | { op: 'items/update'; id: string; patch: Partial<VaultItem> }
  | { op: 'items/delete'; id: string }
  | { op: 'items/restore'; id: string }
  | { op: 'items/advanceCounter'; id: string }
  | { op: 'groups/add'; name: string }
  | { op: 'groups/rename'; id: string; name: string }
  | { op: 'groups/delete'; id: string }
  | { op: 'groups/move'; id: string; direction: -1 | 1 }
  | { op: 'settings/update'; patch: Partial<VaultSettings> };

export type Request =
  | { type: 'vault/status' }
  | { type: 'vault/create'; protection: ProtectionChoice }
  | { type: 'vault/unlock'; password: string }
  | { type: 'vault/lock' }
  | { type: 'vault/mutate'; mutation: Mutation }
  /** Switch between device and passphrase protection, or change the password. */
  | { type: 'vault/setProtection'; next: ProtectionChoice; currentPassword?: string }
  /**
   * Issue a recovery kit. The key is returned once and stored nowhere. Signed
   * in, the kit is also the account's, and changing it needs the account
   * password — it is a way to reset the account.
   */
  | { type: 'vault/createRecoveryKit'; password?: string }
  | { type: 'vault/removeRecoveryKit'; password?: string }
  /**
   * The way back in when the password is gone. Re-protection happens in the
   * same call: there must be no moment where the vault is open but still locked
   * behind the key its owner has lost.
   */
  | { type: 'vault/recover'; recoveryKey: string; next: ProtectionChoice }
  | { type: 'vault/reset' }
  /**
   * Create the sync account, keeping this device's data key and how it opens.
   * `password` is the vault's master password if it has one, which then serves
   * as the account's too; otherwise it is a new password for the account alone.
   */
  | { type: 'account/signUp'; email: string; password: string }
  /** Join an existing account; this device adopts the account's data key. */
  | { type: 'account/signIn'; email: string; password: string }
  /**
   * Join an account whose password is forgotten, with its recovery key. The
   * password given becomes the account's, and this vault's.
   */
  | { type: 'account/recover'; email: string; recoveryKey: string; password: string }
  /** A new account password; also this vault's, if it locks with one. */
  | { type: 'account/changePassword'; currentPassword: string; nextPassword: string }
  | { type: 'account/signOut' }
  | { type: 'account/sync' }
  | { type: 'account/devices' }
  | { type: 'account/revokeDevice'; id: string }
  /** Deletes the account on the server. The vault on this device stays. */
  | { type: 'account/delete'; password: string }
  | { type: 'activity/ping' }
  | { type: 'tab/context' }
  | { type: 'tab/captureQr' }
  | { type: 'tab/detectFields' }
  | { type: 'tab/fill'; code: string };

export interface TabContext {
  tabId: number | null;
  url: string | null;
  hostname: string | null;
  title: string | null;
}

export interface FieldDetection {
  found: boolean;
  count: number;
}

/** What one sync cycle did, for the status line in Settings. */
export interface SyncSummary {
  pulled: number;
  pushed: number;
  conflicts: number;
  rejectedForLimit: number;
  /** Records that would not open — corrupt, or forged by whoever served them. */
  rejectedRecords: number;
  /** Accounts the pull removed. Surfaced so a mass deletion is never silent. */
  deleted: number;
  at: number;
}

/**
 * Signed in, and what the first sync did. `syncError` is set when that sync
 * failed: the sign-in itself still succeeded, and the UI should say so.
 */
export interface SignInResult {
  status: VaultStatus;
  sync: SyncSummary | null;
  syncError: string | null;
}

/**
 * A new account, and the recovery key issued with it — null if issuing failed,
 * which leaves the account fine and Settings asking for a key.
 */
export interface SignUpResult extends SignInResult {
  recoveryKey: string | null;
}

export type ResponseFor<R extends Request> = R extends { type: 'vault/status' }
  ? VaultStatus
  : R extends { type: 'vault/createRecoveryKit' }
    ? { recoveryKey: string }
    : R extends { type: 'account/sync' }
      ? SyncSummary
      : R extends { type: 'account/signUp' }
        ? SignUpResult
      : R extends { type: 'account/signIn' } | { type: 'account/recover' }
        ? SignInResult
      : R extends
            | { type: 'vault/create' }
            | { type: 'vault/unlock' }
            | { type: 'vault/recover' }
        ? VaultStatus
        : R extends { type: 'account/devices' }
          ? DeviceSummary[]
          : R extends { type: 'tab/context' }
              ? TabContext
              : R extends { type: 'tab/captureQr' }
                ? { dataUrl: string }
                : R extends { type: 'tab/detectFields' }
                  ? FieldDetection
                  : void;

/** The single write path handed down to every panel. */
export type Mutate = (mutation: Mutation) => Promise<void>;

export type Envelope<T> = { ok: true; value: T } | { ok: false; error: string };

/** Broadcast by the service worker after any successful write. */
export const VAULT_CHANGED = 'vault/changed' as const;
export interface VaultChangedEvent {
  type: typeof VAULT_CHANGED;
}

/** The parts of a `chrome.runtime.MessageSender` the trust decision needs. */
export interface SenderIdentity {
  id?: string | undefined;
  origin?: string | undefined;
}

/**
 * Whether a message may drive the vault.
 *
 * `id` alone is not enough. A content script carries the extension's own id, so
 * checking only that leaves the whole vault API reachable from any page the
 * script is injected into — and the script is injected into whatever page the
 * user last opened the popup on.
 *
 * The origin is the discriminator. An extension page reports
 * `chrome-extension://<id>`; a content script reports the page's own origin,
 * whatever that page happens to be.
 *
 * Not `sender.tab`: the options page is an extension page that lives in a tab,
 * so gating on that locks the settings screen out of its own vault.
 */
export function isTrustedSender(sender: SenderIdentity, runtimeId: string): boolean {
  return sender.id === runtimeId && sender.origin === `chrome-extension://${runtimeId}`;
}

export class BackgroundError extends Error {
  override readonly name = 'BackgroundError';
}

/** Typed wrapper around `chrome.runtime.sendMessage`. Throws on failure. */
export async function send<R extends Request>(request: R): Promise<ResponseFor<R>> {
  const response = (await chrome.runtime.sendMessage(request)) as
    | Envelope<ResponseFor<R>>
    | undefined;

  if (!response) {
    throw new BackgroundError('No response from the background service worker.');
  }
  if (!response.ok) throw new BackgroundError(response.error);
  return response.value;
}

/** Subscribe to vault-changed broadcasts; returns an unsubscribe function. */
export function onVaultChanged(handler: () => void): () => void {
  const listener = (message: unknown) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as VaultChangedEvent).type === VAULT_CHANGED
    ) {
      handler();
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

export type { ProtectionMode };

// --- Content-script protocol (background/popup → injected script) ------------

export type ContentRequest = { type: 'authx/detect' } | { type: 'authx/fill'; code: string };
export type ContentResponse = FieldDetection;
