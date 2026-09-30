/**
 * MV3 service worker — the single writer for the vault.
 *
 * Service workers are terminated aggressively, so no state is assumed to
 * survive between messages: everything is rehydrated from `chrome.storage`,
 * with the unwrapped data key coming from session storage (memory only) when
 * the vault is password-protected, or from the device key when it is not.
 */
import {
  accountPasswordProblem,
  addGroup,
  addItem,
  advanceHotpCounter,
  applyRecoveryState,
  attachRecoveryKit,
  createVault,
  DecryptionError,
  deleteGroup,
  deleteItem,
  deviceKeyring,
  exportDataKey,
  importDataKey,
  keyringForFile,
  moveGroup,
  passphraseKeyring,
  hasRecoveryKit,
  readPayload,
  removeRecoveryKit,
  restoreItem,
  rewrapVault,
  sealVault,
  SyncHttpError,
  unlockVault,
  unlockWithRecoveryKey,
  updateGroup,
  updateItem,
  updateSettings,
  verifyPassword,
  type Keyring,
  type UnlockedVault,
  type VaultData,
  type VaultFile,
} from '@authx/core';
import { SYNC_ENABLED } from '../lib/config.js';
import { createSerialiser } from '../lib/serial.js';
import {
  accountAuthHash,
  changeAccountPassword,
  deleteAccount,
  followLocalRecovery,
  isSignedIn,
  listDevices,
  markSignedOutElsewhere,
  proveAccountPassword,
  publishRecovery,
  recoverAccount,
  revokeDevice,
  runSync,
  signIn,
  signOut,
  signUp,
} from './sync.js';
import { tokenStore } from '../lib/account.js';
import { destroyDeviceKey, getDeviceKey, getOrCreateDeviceKey } from '../lib/deviceKey.js';
import {
  isTrustedSender,
  VAULT_CHANGED,
  type Envelope,
  type FieldDetection,
  type Mutation,
  type ProtectionChoice,
  type Request,
  type SyncSummary,
  type TabContext,
  type VaultStatus,
} from '../lib/messaging.js';
import {
  clearSessionKey,
  clearVaultFile,
  loadSessionKey,
  loadVaultFile,
  markActive,
  saveSessionKey,
  saveVaultFile,
} from '../lib/storage.js';

const AUTO_LOCK_ALARM = 'authx.autolock';
const SYNC_ALARM = 'authx.sync';
const SYNC_INTERVAL_MINUTES = 5;

/** Warm cache for the lifetime of this worker instance only. */
let cached: UnlockedVault | null = null;

/**
 * Every write runs through here, one at a time. See createSerialiser: the whole
 * read-modify-write has to be inside, or two of them still race on the snapshot
 * they read before taking their turn.
 */
const serial = createSerialiser();

/** Read the vault, change it, store it — without anything else interleaving. */
async function mutateVault<T>(
  run: (unlocked: UnlockedVault) => Promise<{ data: VaultData; result: T }>,
): Promise<T> {
  return serial(async () => {
    const unlocked = await getUnlocked();
    if (!unlocked) throw new Error('Vault is locked.');
    const { data, result } = await run(unlocked);
    await persist(data);
    return result;
  });
}

async function keyringFor(choice: ProtectionChoice): Promise<Keyring> {
  return choice.mode === 'device'
    ? deviceKeyring(await getOrCreateDeviceKey())
    : passphraseKeyring(choice.password);
}

/**
 * Device-protected vaults open silently. Password-protected ones open only
 * while the data key is still in session memory.
 */
async function getUnlocked(): Promise<UnlockedVault | null> {
  if (cached) return cached;

  const file = await loadVaultFile();
  if (!file) return null;

  try {
    if (file.protection.mode === 'device') {
      const deviceKey = await getDeviceKey();
      if (!deviceKey) return null;
      cached = await unlockVault(file, deviceKeyring(deviceKey));
      return cached;
    }

    const rawKey = await loadSessionKey();
    if (!rawKey) return null;

    const dataKey = await importDataKey(rawKey);
    cached = { file, dataKey, data: await readPayload(file, dataKey) };
    return cached;
  } catch {
    // A key that no longer opens the file means the vault was replaced or
    // reset elsewhere. Treat it as locked rather than surfacing a crash.
    await clearSessionKey();
    return null;
  }
}

async function status(): Promise<VaultStatus> {
  const file = await loadVaultFile();
  if (!file) return { state: 'uninitialized' };

  const hasRecovery = hasRecoveryKit(file);
  const unlocked = await getUnlocked();
  if (unlocked) return unlockedStatus(unlocked);

  // A device-protected vault whose device key is gone cannot be opened by any
  // password. Say so plainly instead of showing a prompt that cannot work —
  // unless a recovery kit exists, which is exactly the case it is for.
  if (file.protection.mode === 'device' && !(await getDeviceKey())) {
    return { state: 'unrecoverable', hasRecovery };
  }
  return { state: 'locked', hasRecovery };
}

async function persist(data: VaultData): Promise<void> {
  const unlocked = cached;
  if (!unlocked) throw new Error('Vault is locked.');

  const file = await sealVault(unlocked.file, unlocked.dataKey, data);
  await saveVaultFile(file);
  cached = { ...unlocked, file, data };
  broadcastChange();
}

function broadcastChange(): void {
  // No receiver is a normal state (nothing is open); swallow that specific error.
  chrome.runtime.sendMessage({ type: VAULT_CHANGED }).catch(() => undefined);
}

async function setLockedTitle(locked: boolean): Promise<void> {
  await chrome.action.setTitle({ title: locked ? 'Authenticator X — locked' : 'Authenticator X' });
}

async function scheduleAutoLock(file: VaultFile, minutes: number): Promise<void> {
  await chrome.alarms.clear(AUTO_LOCK_ALARM);
  // There is nothing to lock when the key comes from the device itself.
  if (file.protection.mode !== 'passphrase' || minutes <= 0) return;
  // Chrome clamps alarms to a 30-second floor.
  chrome.alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: Math.max(0.5, minutes) });
}

async function lock(): Promise<void> {
  cached = null;
  await clearSessionKey();
  await chrome.alarms.clear(AUTO_LOCK_ALARM);
  await setLockedTitle(true);
  broadcastChange();
}

async function openSession(unlocked: UnlockedVault): Promise<VaultStatus> {
  cached = unlocked;
  if (unlocked.file.protection.mode === 'passphrase') {
    await saveSessionKey(await exportDataKey(unlocked.dataKey));
  }
  await markActive();
  await scheduleAutoLock(unlocked.file, unlocked.data.settings.autoLockMinutes);
  await setLockedTitle(false);
  return unlockedStatus(unlocked);
}

function unlockedStatus(unlocked: UnlockedVault): VaultStatus {
  const { file, data } = unlocked;
  return {
    state: 'unlocked',
    data,
    protection: file.protection.mode,
    hasRecovery: hasRecoveryKit(file),
    // The kit on this device is the account's exactly when it is the last one
    // this device published or adopted.
    accountRecovery:
      isSignedIn(data) && file.recovery !== null && file.recovery.createdAt === data.sync.recoveryAt,
  };
}

/** Applies a mutation. There is no cap on how many accounts a vault holds. */
function applyMutation(data: VaultData, mutation: Mutation): { data: VaultData } {
  switch (mutation.op) {
    case 'items/add':
      return { data: mutation.items.reduce((acc, item) => addItem(acc, item), data) };
    case 'items/update':
      return { data: updateItem(data, mutation.id, mutation.patch) };
    case 'items/delete':
      return { data: deleteItem(data, mutation.id) };
    case 'items/restore':
      return { data: restoreItem(data, mutation.id) };
    case 'items/advanceCounter':
      return { data: advanceHotpCounter(data, mutation.id) };
    case 'groups/add':
      return { data: addGroup(data, mutation.name) };
    case 'groups/rename':
      return { data: updateGroup(data, mutation.id, { name: mutation.name.trim() || 'Untitled group' }) };
    case 'groups/delete':
      return { data: deleteGroup(data, mutation.id) };
    case 'groups/move':
      return { data: moveGroup(data, mutation.id, mutation.direction) };
    case 'settings/update':
      return { data: updateSettings(data, mutation.patch) };
  }
}

// --- Active-tab helpers -----------------------------------------------------

async function requireUnlocked(): Promise<UnlockedVault> {
  if (!SYNC_ENABLED) throw new Error('Sync is not available in this build.');
  const unlocked = await getUnlocked();
  if (!unlocked) throw new Error('Vault is locked.');
  return unlocked;
}

async function scheduleSync(): Promise<void> {
  await chrome.alarms.clear(SYNC_ALARM);
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });
}

const SIGNED_OUT_ELSEWHERE =
  'This device was signed out of sync — the password was changed or the device was removed on another one. Sign in again.';

/**
 * The server has ended this device's session. Recorded in the vault — keeping
 * the address, so the sign-in form can say which account — rather than left as
 * a vault that believes it is signed in with no session behind it. For a
 * caller already holding the write queue.
 */
async function endSessionInTurn(unlocked: UnlockedVault): Promise<void> {
  await chrome.alarms.clear(SYNC_ALARM);
  if (isSignedIn(unlocked.data)) await persist(await markSignedOutElsewhere(unlocked.data));
}

/**
 * Runs an account call outside the write queue — listing or removing devices —
 * and records a rejected session the same way a sync cycle would. Whichever
 * call meets the 401 first clears the tokens, so every one of them has to.
 */
async function withSession<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SyncHttpError && error.status === 401) {
      await serial(async () => {
        const unlocked = await getUnlocked();
        if (unlocked) await endSessionInTurn(unlocked);
      });
      throw new Error(SIGNED_OUT_ELSEWHERE);
    }
    throw error;
  }
}

/**
 * One cycle, for a caller already holding the write queue. Installs the
 * account's recovery kit if a newer one arrived, and notices when the server
 * has ended this device's session so the settings page can say so.
 */
async function syncInTurn(unlocked: UnlockedVault) {
  // Signed in with no session left: another call already met the 401.
  if (!(await tokenStore.get())) {
    await endSessionInTurn(unlocked);
    throw new Error(SIGNED_OUT_ELSEWHERE);
  }

  let outcome;
  try {
    outcome = await runSync(unlocked);
  } catch (error) {
    if (error instanceof SyncHttpError && error.status === 401) {
      await endSessionInTurn(unlocked);
      throw new Error(SIGNED_OUT_ELSEWHERE);
    }
    throw error;
  }

  if (outcome.recovery) {
    cached = { ...unlocked, file: applyRecoveryState(unlocked.file, outcome.recovery) };
  }
  await persist(outcome.data);
  return { unlocked: cached!, summary: outcome.summary };
}

/**
 * Runs one cycle if there is an account to run it against. Returns null rather
 * than throwing when there is not, so the periodic alarm stays quiet.
 */
async function syncNow() {
  if (!SYNC_ENABLED) return null;

  // Inside the same queue as every other write. A cycle takes as long as the
  // network does, and anything the user changes meanwhile would otherwise be
  // overwritten by the snapshot the sync started from.
  return serial(async () => {
    const unlocked = await getUnlocked();
    if (!unlocked || !isSignedIn(unlocked.data)) return null;
    return (await syncInTurn(unlocked)).summary;
  });
}

/**
 * The first cycle after joining an account. Its outcome is reported beside the
 * sign-in, never instead of it: by now the device *is* signed in, and a network
 * hiccup here once surfaced as "sign-in failed" on a device that had succeeded.
 */
async function firstSync(): Promise<{ sync: SyncSummary | null; syncError: string | null }> {
  try {
    return { sync: await syncNow(), syncError: null };
  } catch (error) {
    return { sync: null, syncError: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Publishes a change to the account's recovery kit and applies it here. Syncs
 * first, so the change is ordered after any another device already made. The
 * caller brings proof of the account password: see `publishRecovery`.
 */
async function changeAccountKit(
  current: UnlockedVault,
  authHash: string,
  change: (
    unlocked: UnlockedVault,
    issuedAt: number,
  ) => Promise<{ file: VaultFile; recoveryKey: string | null }>,
): Promise<string | null> {
  const { unlocked } = await syncInTurn(current);
  // Never behind the newest state this device has seen, whatever its clock.
  const issuedAt = Math.max(Date.now(), (unlocked.data.sync.recoveryAt ?? 0) + 1);
  const { file, recoveryKey } = await change(unlocked, issuedAt);

  await publishRecovery(unlocked.dataKey, authHash, file.recovery, recoveryKey, issuedAt);

  const data = { ...unlocked.data, sync: { ...unlocked.data.sync, recoveryAt: issuedAt } };
  const sealed = await sealVault(file, unlocked.dataKey, data);
  await saveVaultFile(sealed);
  cached = { ...unlocked, file: sealed, data };
  broadcastChange();
  return recoveryKey;
}

/** Issues a kit whose `createdAt` is the account state's `issuedAt`. */
async function issueKit(synced: UnlockedVault, issuedAt: number) {
  const issued = await attachRecoveryKit(synced.file, synced.dataKey);
  return {
    file: { ...issued.file, recovery: { ...issued.file.recovery!, createdAt: issuedAt } },
    recoveryKey: issued.recoveryKey,
  };
}

/** A password-protected vault's new password takes effect here, at once. */
async function relockWith(unlocked: UnlockedVault, password: string): Promise<void> {
  const file = await rewrapVault(unlocked.file, unlocked.dataKey, await passphraseKeyring(password));
  await saveVaultFile(file);
  cached = { ...unlocked, file };
  await saveSessionKey(await exportDataKey(unlocked.dataKey));
  await scheduleAutoLock(file, unlocked.data.settings.autoLockMinutes);
}

async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ?? null;
}

async function tabContext(): Promise<TabContext> {
  const tab = await activeTab();
  if (!tab?.id || !tab.url) return { tabId: null, url: null, hostname: null, title: null };

  let hostname: string | null = null;
  try {
    const url = new URL(tab.url);
    // Only http(s) pages can be injected into or matched against an issuer.
    hostname = url.protocol === 'http:' || url.protocol === 'https:' ? url.hostname : null;
  } catch {
    hostname = null;
  }

  return { tabId: tab.id, url: tab.url, hostname, title: tab.title ?? null };
}

async function injectAndSend(request: { type: string; code?: string }): Promise<FieldDetection> {
  const tab = await activeTab();
  if (!tab?.id) throw new Error('No active tab.');
  if (!tab.url || !/^https?:/.test(tab.url)) {
    throw new Error('Autofill only works on regular web pages.');
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch {
    throw new Error(
      'Chrome would not let the extension read this page. Open the popup from the page you want to fill.',
    );
  }

  // Frame 0 explicitly. `executeScript` put the script in the top frame only,
  // so an unaddressed message would be offered to every frame in the tab and
  // answered by whichever replied first.
  return (await chrome.tabs.sendMessage(tab.id, request, { frameId: 0 })) as FieldDetection;
}

// --- Request routing --------------------------------------------------------

async function handle(request: Request): Promise<unknown> {
  switch (request.type) {
    case 'vault/status':
      return status();

    case 'vault/create': {
      if (await loadVaultFile()) throw new Error('A vault already exists on this device.');
      const unlocked = await createVault(await keyringFor(request.protection));
      await saveVaultFile(unlocked.file);
      return openSession(unlocked);
    }

    case 'vault/unlock': {
      const file = await loadVaultFile();
      if (!file) throw new Error('No vault on this device yet.');
      try {
        return await openSession(await unlockVault(file, await keyringForFile(file, request.password)));
      } catch (error) {
        if (error instanceof DecryptionError) throw new Error('Wrong master password.');
        throw error;
      }
    }

    case 'vault/lock':
      return lock();

    case 'vault/mutate':
      return mutateVault(async (unlocked) => {
        const { data } = applyMutation(unlocked.data, request.mutation);
        if (request.mutation.op === 'settings/update') {
          await scheduleAutoLock(unlocked.file, data.settings.autoLockMinutes);
        }
        return { data, result: undefined };
      });

    case 'vault/setProtection':
      return serial(async () => {
      const unlocked = await getUnlocked();
      if (!unlocked) throw new Error('Vault is locked.');
      const signedIn = isSignedIn(unlocked.data);

      // Proving knowledge of the current password is required before it can be
      // replaced or removed — otherwise anyone at an unlocked screen could
      // silently downgrade the vault's protection.
      if (unlocked.file.protection.mode === 'passphrase') {
        if (!request.currentPassword) throw new Error('Enter your current master password.');
        if (!(await verifyPassword(unlocked.file, request.currentPassword))) {
          throw new Error('Current password is incorrect.');
        }
      }

      // Signed in, a vault either opens with the device key or with the account
      // password — never a third one.
      if (signedIn && request.next.mode === 'passphrase') {
        if (unlocked.file.protection.mode === 'passphrase') {
          // A new password here is a new account password. The account first:
          // if the server refuses, nothing has changed here either.
          await changeAccountPassword(unlocked, request.currentPassword!, request.next.password);
        } else {
          // Starting to lock a device-key vault: only with the account password.
          await proveAccountPassword(unlocked.data, request.next.password);
        }
      }

      const file = await rewrapVault(unlocked.file, unlocked.dataKey, await keyringFor(request.next));
      await saveVaultFile(file);
      cached = { ...unlocked, file };

      if (request.next.mode === 'passphrase') {
        await saveSessionKey(await exportDataKey(unlocked.dataKey));
      } else {
        await clearSessionKey();
      }
      await scheduleAutoLock(file, unlocked.data.settings.autoLockMinutes);
      broadcastChange();
      return undefined;
      });

    case 'vault/createRecoveryKit':
      return serial(async () => {
        const unlocked = await getUnlocked();
        if (!unlocked) throw new Error('Vault is locked.');

        // Signed in, the kit is the account's: the server gets it first, and
        // if it cannot, no key is shown that would only half work. It takes the
        // account password — a kit is a way to reset the account.
        if (isSignedIn(unlocked.data)) {
          if (!request.password) throw new Error('Enter your account password.');
          const authHash = await accountAuthHash(unlocked.data, request.password);
          const recoveryKey = await changeAccountKit(unlocked, authHash, issueKit);
          return { recoveryKey: recoveryKey! };
        }

        // Reissuing replaces any previous kit, so an old printed sheet stops
        // working the moment a new one is made.
        const { file, recoveryKey } = await attachRecoveryKit(unlocked.file, unlocked.dataKey);
        await saveVaultFile(file);
        cached = { ...unlocked, file };
        broadcastChange();
        return { recoveryKey };
      });

    case 'vault/removeRecoveryKit':
      return serial(async () => {
        const unlocked = await getUnlocked();
        if (!unlocked) throw new Error('Vault is locked.');

        // Removed from the account too, and so from every other device: the
        // usual reason to remove a kit is that the sheet has gone missing.
        if (isSignedIn(unlocked.data)) {
          if (!request.password) throw new Error('Enter your account password.');
          const authHash = await accountAuthHash(unlocked.data, request.password);
          await changeAccountKit(unlocked, authHash, async (synced) => ({
            file: removeRecoveryKit(synced.file),
            recoveryKey: null,
          }));
          return undefined;
        }

        const file = removeRecoveryKit(unlocked.file);
        await saveVaultFile(file);
        cached = { ...unlocked, file };
        broadcastChange();
        return undefined;
      });

    case 'vault/recover':
      return serial(async () => {
        const file = await loadVaultFile();
        if (!file) throw new Error('No vault on this device yet.');

        let opened;
        try {
          opened = await unlockWithRecoveryKey(file, request.recoveryKey);
        } catch (error) {
          if (error instanceof DecryptionError) throw new Error('That recovery key does not match.');
          throw error;
        }

        // A signed-in vault's new password becomes the account's too, so it has
        // to be strong enough to leave the device. Choosing the device key
        // instead leaves the account's password as it was.
        const signedIn = isSignedIn(opened.data);
        if (signedIn && request.next.mode === 'passphrase') {
          const problem = accountPasswordProblem(request.next.password);
          if (problem) throw new Error(problem);
        }

        // Re-protect before handing back a session. Leaving the vault opened but
        // still wrapped by the key its owner lost would put them right back where
        // they started on the next lock.
        let reprotected = await rewrapVault(
          opened.file,
          opened.dataKey,
          await keyringFor(request.next),
        );

        // Bring the account along. If the kit used here is not the account's,
        // the account keeps its old password — so this device signs out rather
        // than carry on under a password that no longer matches it.
        let data = opened.data;
        if (signedIn && request.next.mode === 'passphrase') {
          const followed = await followLocalRecovery(
            opened.data,
            request.recoveryKey,
            opened.dataKey,
            request.next.password,
          );
          if (!followed) {
            await chrome.alarms.clear(SYNC_ALARM);
            data = await markSignedOutElsewhere(opened.data);
            reprotected = await sealVault(reprotected, opened.dataKey, data);
          }
        }

        await saveVaultFile(reprotected);
        return openSession({ file: reprotected, dataKey: opened.dataKey, data });
      });

    case 'vault/reset':
      await clearVaultFile();
      await destroyDeviceKey();
      await tokenStore.clear();
      await chrome.alarms.clear(SYNC_ALARM);
      await lock();
      return undefined;

    case 'account/signUp': {
      let recoveryKey: string | null = null;
      await serial(async () => {
        const unlocked = await requireUnlocked();
        const result = await signUp(unlocked, request.email, request.password);
        await saveVaultFile(result.file);
        cached = { ...unlocked, file: result.file, data: result.data };
        // Said now, not left to the first sync's save: if that sync fails,
        // every open page would otherwise still show a signed-out vault.
        broadcastChange();
        await scheduleSync();

        // The recovery key belongs to the moment the account is made: the
        // password was just typed, and an account without one is a forgotten
        // password away from gone. A failure here costs the account nothing —
        // Settings keeps asking until a key exists.
        try {
          recoveryKey = await changeAccountKit(cached, result.authHash, issueKit);
        } catch {
          recoveryKey = null;
        }
      });
      const first = await firstSync();
      return { status: await status(), recoveryKey, ...first };
    }

    case 'account/signIn': {
      await serial(async () => {
        const unlocked = await requireUnlocked();
        const result = await signIn(unlocked, request.email, request.password);
        await saveVaultFile(result.file);
        cached = { file: result.file, dataKey: result.dataKey, data: result.data };
        // The data key changed. A password-protected vault keeps it in session
        // memory; a device-key vault reads it through the device key instead.
        if (result.file.protection.mode === 'passphrase') {
          await saveSessionKey(await exportDataKey(result.dataKey));
        }
        // Said now, not left to the first sync's save: if that sync fails,
        // every open page would otherwise still show a signed-out vault.
        broadcastChange();
        await scheduleSync();
      });
      const first = await firstSync();
      return { status: await status(), ...first };
    }

    case 'account/recover': {
      await serial(async () => {
        const unlocked = await requireUnlocked();
        const result = await recoverAccount(unlocked, request.email, request.recoveryKey, request.password);
        await saveVaultFile(result.file);
        cached = { file: result.file, dataKey: result.dataKey, data: result.data };
        // As with joining: the data key changed, and a password-protected vault
        // now opens with the new account password.
        if (result.file.protection.mode === 'passphrase') {
          await saveSessionKey(await exportDataKey(result.dataKey));
        }
        // Said now, not left to the first sync's save: if that sync fails,
        // every open page would otherwise still show a signed-out vault.
        broadcastChange();
        await scheduleSync();
      });
      const first = await firstSync();
      return { status: await status(), ...first };
    }

    case 'account/changePassword':
      return serial(async () => {
        const unlocked = await getUnlocked();
        if (!unlocked) throw new Error('Vault is locked.');
        if (!isSignedIn(unlocked.data)) throw new Error('Not signed in.');
        const locksWithPassword = unlocked.file.protection.mode === 'passphrase';
        if (locksWithPassword && !(await verifyPassword(unlocked.file, request.currentPassword))) {
          throw new Error('Current password is incorrect.');
        }
        // The account first, so a refusal leaves both exactly as they were.
        await changeAccountPassword(unlocked, request.currentPassword, request.nextPassword);
        // A vault that locks with the account password locks with the new one.
        if (locksWithPassword) await relockWith(unlocked, request.nextPassword);
        broadcastChange();
        return undefined;
      });

    case 'account/signOut':
      return mutateVault(async (unlocked) => {
        await chrome.alarms.clear(SYNC_ALARM);
        return { data: await signOut(unlocked.data), result: undefined };
      });

    case 'account/devices':
      await requireUnlocked();
      return withSession(listDevices);

    case 'account/revokeDevice':
      await requireUnlocked();
      return withSession(() => revokeDevice(request.id));

    case 'account/delete':
      return withSession(() =>
        mutateVault(async (unlocked) => {
          const data = await deleteAccount(unlocked.data, request.password);
          await chrome.alarms.clear(SYNC_ALARM);
          return { data, result: undefined };
        }),
      );

    case 'account/sync': {
      const summary = await syncNow();
      if (!summary) throw new Error('Not signed in.');
      return summary;
    }

    case 'activity/ping': {
      const unlocked = await getUnlocked();
      if (!unlocked) return undefined;
      await markActive();
      await scheduleAutoLock(unlocked.file, unlocked.data.settings.autoLockMinutes);
      return undefined;
    }

    case 'tab/context':
      return tabContext();

    case 'tab/captureQr': {
      const tab = await activeTab();
      if (!tab?.windowId) throw new Error('No active tab.');
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      return { dataUrl };
    }

    case 'tab/detectFields':
      return injectAndSend({ type: 'authx/detect' });

    case 'tab/fill':
      return injectAndSend({ type: 'authx/fill', code: request.code });
  }
}

chrome.runtime.onMessage.addListener((message: Request, sender, sendResponse) => {
  // Only this extension's own pages may drive the vault. See isTrustedSender.
  if (!isTrustedSender(sender, chrome.runtime.id)) return false;

  handle(message)
    .then((value) => sendResponse({ ok: true, value } satisfies Envelope<unknown>))
    .catch((error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies Envelope<never>),
    );

  return true; // Keep the message channel open for the async response.
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_LOCK_ALARM) void lock();
  if (alarm.name === SYNC_ALARM) {
    // A failed background sync is not worth surfacing: the next tick retries,
    // and an offline laptop should not produce an error the user cannot act on.
    void syncNow().catch(() => undefined);
  }
});

chrome.runtime.onStartup.addListener(() => {
  void setLockedTitle(true);
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await setLockedTitle(true);
  if (details.reason === 'install') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('options.html#welcome') });
  }
});