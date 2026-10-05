/**
 * Account and sync handling for the service worker.
 *
 * Kept out of `index.ts` so the message router stays readable, and because
 * everything here is about one question: which data key is this vault using,
 * and does the server agree?
 *
 * One rule holds everything together: a signed-in vault either opens with the
 * device key, or with the account password — never with a third password.
 * Every path that changes one password changes the other in the same step, or
 * refuses. Letting them drift is how a user ends up on a new laptop typing a
 * password that no longer exists anywhere but on their old one.
 *
 * How a device opens is its own choice and survives signing in: the account
 * password is for new devices and for changes to the account, not for every
 * glance at a code.
 */
import {
  accountPasswordProblem,
  adoptDataKey,
  assertAcceptableAccountKdf,
  DecryptionError,
  deviceKeyring,
  deriveAccountKeys,
  deriveKeyCheck,
  deriveRecoveryAuthHash,
  HttpSyncAdapter,
  logout,
  newAccountKdfParams,
  passphraseKeyring,
  prelogin,
  recover,
  recoverReset,
  register,
  sealRecoveryState,
  startRegistration,
  sealVault,
  SyncHttpError,
  syncOnce,
  unwrapDataKey,
  unwrapRecoveryWrap,
  updateAccount,
  verifyPassword,
  wrapDataKey,
  login,
  type AccountKdfParams,
  type AccountRecoveryState,
  type DeviceSummary,
  type Keyring,
  type LoginResponse,
  type RecoveryWrap,
  type UnlockedVault,
  type VaultData,
  type VaultFile,
} from '@authx/core';
import { SYNC_API_URL, SYNC_ENABLED } from '../lib/config.js';
import { tokenStore } from '../lib/account.js';
import { getOrCreateDeviceKey } from '../lib/deviceKey.js';
import type { SyncSummary } from '../lib/messaging.js';

export function adapter(): HttpSyncAdapter {
  if (!SYNC_ENABLED) throw new Error('Sync is not available in this build.');
  return new HttpSyncAdapter({ baseUrl: SYNC_API_URL, tokens: tokenStore });
}

/** Whether this vault is signed in to an account. */
export function isSignedIn(data: VaultData): data is VaultData & { account: { email: string } } {
  return Boolean(data.account.email) && data.account.plan === 'synced';
}

function assertStrongEnough(password: string): void {
  const problem = accountPasswordProblem(password);
  if (problem) throw new Error(problem);
}

/**
 * The account's current keys for a password. The KDF parameters come from the
 * server before anything is authenticated, so they are checked, not trusted.
 */
async function accountKeysFor(email: string, password: string) {
  const kdf = await prelogin(SYNC_API_URL, email, fetch);
  assertAcceptableAccountKdf(kdf);
  return { kdf, keys: await deriveAccountKeys(password, kdf) };
}

/** Proof of the account password, for the changes that need it. */
export async function accountAuthHash(data: VaultData, password: string): Promise<string> {
  if (!isSignedIn(data)) throw new Error('Not signed in.');
  return (await accountKeysFor(data.account.email, password)).keys.authHash;
}

/**
 * Checks a password against the account by signing this device in again with
 * it — which also gives it a fresh session. Used when a device-key vault starts
 * locking with the account password, so a typo cannot become a third password.
 */
export async function proveAccountPassword(data: VaultData, password: string): Promise<void> {
  if (!isSignedIn(data)) throw new Error('Not signed in.');
  const { keys } = await accountKeysFor(data.account.email, password);
  try {
    await storeSession(
      await login(
        SYNC_API_URL,
        { email: data.account.email, authHash: keys.authHash, deviceId: data.sync.deviceId, deviceName: deviceName() },
        fetch,
      ),
    );
  } catch (error) {
    if (error instanceof SyncHttpError && error.code === 'invalid_credentials') {
      throw new Error(
        'That is not your account password. While signed in, it is the only password this vault can lock with.',
      );
    }
    throw error;
  }
}

/**
 * The keyring a vault should keep after adopting the account's data key: the
 * device key if it opened without a password before, the account password if
 * it had one. Joining an account does not change how a device opens.
 */
async function keyringKeepingMode(
  file: VaultFile,
  password: string,
  kdf: AccountKdfParams,
): Promise<Keyring> {
  return file.protection.mode === 'device'
    ? deviceKeyring(await getOrCreateDeviceKey())
    : passphraseKeyring(password, kdf);
}

/**
 * Everything a device knows locally becomes an unsynced change to push, and it
 * forgets which account kit it had seen: a vault that has just joined or
 * created an account has seen none of that account's kits yet.
 */
function markEverythingPending(data: VaultData, email: string): VaultData {
  return updateAccount(
    {
      ...data,
      items: data.items.map((item) => ({ ...item, syncedRev: 0 })),
      sync: { ...data.sync, serverRev: 0, lastSyncAt: null, recoveryAt: 0, epoch: undefined },
    },
    { email, plan: 'synced' },
  );
}

async function storeSession(session: Pick<LoginResponse, 'accessToken' | 'refreshToken'>) {
  await tokenStore.set({ accessToken: session.accessToken, refreshToken: session.refreshToken });
}

/**
 * Create the account from this device, in one step from either mode.
 *
 * A vault with a master password uses it: it becomes the account password, so
 * there is still only one. A vault that opens with the device key keeps doing
 * so, and the password chosen here is the account's alone — needed on a new
 * device and for changes to the account, not to open this one.
 *
 * The local data key becomes the account's, wrapped under a key derived from
 * the password, so nothing is re-encrypted.
 */
/**
 * Whether this password may become this vault's account password. Checked
 * before a code is sent, so nobody waits for an email only to be told the
 * password was never going to do, and again when the account is made.
 */
async function assertCanSignUpWith(unlocked: UnlockedVault, password: string): Promise<void> {
  if (unlocked.file.protection.mode === 'passphrase') {
    if (!(await verifyPassword(unlocked.file, password))) {
      throw new Error('That is not this vault’s master password. It becomes your account password too.');
    }
    if (accountPasswordProblem(password)) {
      throw new Error(
        'Your master password is too weak to protect a copy of your vault that leaves this device. ' +
          'Change it under Security first — at least 12 characters with a mix, or four or five unrelated words.',
      );
    }
  } else {
    assertStrongEnough(password);
  }
}

/**
 * Step one of signing up: the password is checked here, then a code goes to
 * the address. The server answers the same whether or not the address already
 * has an account — the email says which — so this cannot be used to find out.
 */
export async function prepareSignUp(
  unlocked: UnlockedVault,
  email: string,
  password: string,
): Promise<void> {
  await assertCanSignUpWith(unlocked, password);
  await startRegistration(SYNC_API_URL, email, fetch);
}

export async function signUp(
  unlocked: UnlockedVault,
  email: string,
  password: string,
  code: string,
): Promise<{ file: typeof unlocked.file; data: VaultData; authHash: string }> {
  await assertCanSignUpWith(unlocked, password);

  const kdf = newAccountKdfParams();
  const keys = await deriveAccountKeys(password, kdf);

  // Registering issues the session; there is no need to sign in a second time.
  await storeSession(
    await register(
      SYNC_API_URL,
      {
        email,
        code,
        authHash: keys.authHash,
        kdf,
        protectedKey: await wrapDataKey(keys.stretchedKey, unlocked.dataKey),
        keyCheck: await deriveKeyCheck(unlocked.dataKey),
        deviceId: unlocked.data.sync.deviceId,
        deviceName: deviceName(),
      },
      fetch,
    ),
  );

  const data = markEverythingPending(unlocked.data, email);
  return {
    file: await sealVault(unlocked.file, unlocked.dataKey, data),
    data,
    authHash: keys.authHash,
  };
}

/**
 * Join an existing account.
 *
 * The account already has a data key and every device must converge on it, so
 * this one re-encrypts: the local payload is re-sealed under the account key.
 * A device that opened with its own key still does; one with a master password
 * now uses the account password, so there is only ever one. Anything already
 * on this device is marked unsynced so the next cycle uploads it rather than
 * losing it. The account's recovery kit arrives with the first pull.
 */
export async function signIn(
  unlocked: UnlockedVault,
  email: string,
  password: string,
): Promise<{ file: typeof unlocked.file; dataKey: CryptoKey; data: VaultData }> {
  const { kdf, keys } = await accountKeysFor(email, password);
  const session = await login(
    SYNC_API_URL,
    { email, authHash: keys.authHash, deviceId: unlocked.data.sync.deviceId, deviceName: deviceName() },
    fetch,
  );
  await storeSession(session);

  const accountDataKey = await unwrapDataKey(keys.stretchedKey, session.protectedKey);
  const data = markEverythingPending(unlocked.data, email);

  return {
    file: await adoptDataKey(
      unlocked.file,
      await keyringKeepingMode(unlocked.file, password, kdf),
      accountDataKey,
      data,
    ),
    dataKey: accountDataKey,
    data,
  };
}

/**
 * Sets a new account password through the recovery kit, given the data key the
 * kit opened. Signs this device in; every other session ends.
 */
async function resetThroughKit(
  email: string,
  recoveryKey: string,
  dataKey: CryptoKey,
  deviceId: string,
  password: string,
) {
  const kdf = newAccountKdfParams();
  const keys = await deriveAccountKeys(password, kdf);
  const session = await recoverReset(
    SYNC_API_URL,
    {
      email,
      recoveryAuthHash: await deriveRecoveryAuthHash(recoveryKey),
      keyCheck: await deriveKeyCheck(dataKey),
      authHash: keys.authHash,
      kdf,
      protectedKey: await wrapDataKey(keys.stretchedKey, dataKey),
      deviceId,
      deviceName: deviceName(),
    },
    fetch,
  );
  await storeSession(session);
  return kdf;
}

/**
 * Recover an account with nothing but its recovery key, from this device.
 *
 * For the case the kit exists for: every device that had the vault is gone,
 * and so is the password. Like joining, this device adopts the account's key.
 */
export async function recoverAccount(
  unlocked: UnlockedVault,
  email: string,
  recoveryKey: string,
  password: string,
): Promise<{ file: typeof unlocked.file; dataKey: CryptoKey; data: VaultData }> {
  assertStrongEnough(password);

  const { wrap } = await recover(
    SYNC_API_URL,
    { email, recoveryAuthHash: await deriveRecoveryAuthHash(recoveryKey) },
    fetch,
  );
  let dataKey: CryptoKey;
  try {
    dataKey = await unwrapRecoveryWrap(wrap, recoveryKey);
  } catch (error) {
    if (error instanceof DecryptionError) throw new Error('That recovery key does not match this account.');
    throw error;
  }

  const kdf = await resetThroughKit(email, recoveryKey, dataKey, unlocked.data.sync.deviceId, password);
  const data = markEverythingPending(unlocked.data, email);
  return {
    file: await adoptDataKey(unlocked.file, await keyringKeepingMode(unlocked.file, password, kdf), dataKey, data),
    dataKey,
    data,
  };
}

/**
 * After a local recovery on a signed-in vault: bring the account along, so the
 * new password works everywhere. Only possible when the kit used is also the
 * account's; returns false when it is not, and the caller signs the device out
 * rather than leave the two passwords apart.
 */
export async function followLocalRecovery(
  data: VaultData,
  recoveryKey: string,
  dataKey: CryptoKey,
  password: string,
): Promise<boolean> {
  if (!isSignedIn(data)) return true;
  try {
    await resetThroughKit(data.account.email, recoveryKey, dataKey, data.sync.deviceId, password);
    return true;
  } catch {
    return false;
  }
}

/**
 * Change the account password along with the vault's. The server checks the
 * current one — a session token alone must never be enough — and signs every
 * other device out, so each re-wraps its own vault under the new password when
 * it signs back in.
 */
export async function changeAccountPassword(
  unlocked: UnlockedVault,
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  if (!isSignedIn(unlocked.data)) return;
  assertStrongEnough(nextPassword);

  const current = await accountKeysFor(unlocked.data.account.email, currentPassword);
  const kdf = newAccountKdfParams();
  const next = await deriveAccountKeys(nextPassword, kdf);

  try {
    await adapter().changePassword({
      currentAuthHash: current.keys.authHash,
      authHash: next.authHash,
      kdf,
      protectedKey: await wrapDataKey(next.stretchedKey, unlocked.dataKey),
    });
  } catch (error) {
    if (error instanceof SyncHttpError && error.code === 'forbidden') {
      // The vault accepted this password a moment ago, so the account has a
      // different one. Say which half disagrees.
      throw new Error(
        'Your account password is different from this vault’s. Sign out of sync and back in to bring them together, then try again.',
      );
    }
    throw error;
  }
}

/**
 * Sets the account's recovery kit to match this device's, or removes it. Needs
 * the account password as well as the data key: anyone at an unlocked vault
 * holds the key, and a kit they issued would let them reset the account.
 */
export async function publishRecovery(
  dataKey: CryptoKey,
  authHash: string,
  wrap: RecoveryWrap | null,
  recoveryKey: string | null,
  issuedAt: number,
): Promise<AccountRecoveryState> {
  const state: AccountRecoveryState = { wrap, issuedAt };
  try {
    await adapter().setRecovery({
      authHash,
      keyCheck: await deriveKeyCheck(dataKey),
      issuedAt,
      state: await sealRecoveryState(dataKey, state),
      wrap,
      recoveryAuthHash: recoveryKey ? await deriveRecoveryAuthHash(recoveryKey) : null,
    });
  } catch (error) {
    if (error instanceof SyncHttpError && error.code === 'stale_revision') {
      throw new Error(
        'Another of your devices changed the recovery key a moment ago. Nothing was changed here — try again.',
      );
    }
    if (error instanceof SyncHttpError && error.code === 'forbidden') {
      throw new Error('That is not your account password.');
    }
    throw error;
  }
  return state;
}

export async function runSync(unlocked: UnlockedVault): Promise<{
  data: VaultData;
  summary: SyncSummary;
  recovery?: AccountRecoveryState;
}> {
  const outcome = await syncOnce(unlocked.data, {
    adapter: adapter(),
    dataKey: unlocked.dataKey,
  });

  return {
    data: outcome.data,
    summary: {
      pulled: outcome.pulled,
      pushed: outcome.pushed,
      conflicts: outcome.conflicts,
      rejectedForLimit: outcome.rejectedForLimit,
      rejectedRecords: outcome.rejectedRecords,
      deleted: outcome.deleted,
      at: Date.now(),
    },
    ...(outcome.recovery ? { recovery: outcome.recovery } : {}),
  };
}

export function listDevices(): Promise<DeviceSummary[]> {
  return adapter().devices();
}

export function revokeDevice(id: string): Promise<void> {
  return adapter().revokeDevice(id);
}

/** Deletes the account and everything it stored. The local vault stays. */
export async function deleteAccount(data: VaultData, password: string): Promise<VaultData> {
  if (!isSignedIn(data)) throw new Error('Not signed in.');
  const { keys } = await accountKeysFor(data.account.email, password);
  try {
    await adapter().deleteAccount({ authHash: keys.authHash });
  } catch (error) {
    if (error instanceof SyncHttpError && error.code === 'forbidden') {
      throw new Error('That is not your account password.');
    }
    throw error;
  }
  await tokenStore.clear();
  return forgetAccount(data);
}

/**
 * Signing out ends the session on the server and drops it here. The vault stays
 * exactly as it is — still encrypted, still openable with the same password —
 * because wiping it here would turn a stray click into data loss.
 */
export async function signOut(data: VaultData): Promise<VaultData> {
  const tokens = await tokenStore.get();
  if (tokens) {
    // Best effort, and briefly: signing out has to work offline, and a server
    // that hangs must not hold the button hostage.
    await logout(SYNC_API_URL, tokens.refreshToken, (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(5_000) }),
    ).catch(() => undefined);
  }
  await tokenStore.clear();
  return forgetAccount(data);
}

function forgetAccount(data: VaultData): VaultData {
  return updateAccount(
    { ...data, sync: { ...data.sync, serverRev: 0, lastSyncAt: null, recoveryAt: 0, epoch: undefined } },
    { email: null, plan: 'local' },
  );
}

/**
 * The server ended this device's session — the password changed elsewhere, or
 * the device was removed from the list. The email stays so the sign-in form can
 * say which account and offer it back.
 */
export async function markSignedOutElsewhere(data: VaultData): Promise<VaultData> {
  await tokenStore.clear();
  return updateAccount(
    { ...data, sync: { ...data.sync, serverRev: 0, lastSyncAt: null, recoveryAt: 0, epoch: undefined } },
    { plan: 'local' },
  );
}

function deviceName(): string {
  const platform = navigator.userAgent.includes('Mac')
    ? 'Mac'
    : navigator.userAgent.includes('Windows')
      ? 'Windows'
      : navigator.userAgent.includes('Linux')
        ? 'Linux'
        : 'Browser';
  const browser = navigator.userAgent.includes('Edg/') ? 'Edge' : 'Chrome';
  return `${browser} on ${platform}`;
}
