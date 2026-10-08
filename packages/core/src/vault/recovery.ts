/**
 * The emergency recovery kit.
 *
 * A vault encrypted under a master password is unopenable if that password is
 * forgotten — by us as much as by the user, which is the whole point. The kit
 * is the escape hatch that does not weaken it: a second, independent wrapping
 * of the *same data key* under a high-entropy secret the user keeps on paper.
 *
 * Because it wraps the data key rather than the password, the kit survives a
 * password change, and switching between device and passphrase protection, with
 * no re-encryption. It also rescues a device-protected vault whose device key
 * was lost while its storage survived — the state the UI otherwise has to call
 * unrecoverable.
 *
 * This has to exist before the first real user does. Adding it afterwards
 * cannot help anyone who already lost a password.
 */
import { DecryptionError, unwrapDataKey, wrapDataKey } from '../crypto/aead.js';
import { deriveKek, newKdfParams, type KdfParams } from '../crypto/kdf.js';
import { crockfordDecode, crockfordEncode, group } from '../util/crockford.js';
import { randomBytes } from '../util/id.js';
import type { RecoveryWrap, VaultFile } from './model.js';
import { readPayload, type UnlockedVault } from './vault.js';

/** 160 bits — exactly 32 Crockford characters, no padding, nothing to trim. */
export const RECOVERY_KEY_BYTES = 20;

/**
 * Lower than the 600,000 rounds used for a master password, deliberately.
 *
 * Stretching exists to buy time against guessing a low-entropy secret. This one
 * has 160 bits of entropy from a CSPRNG, so guessing is off the table and extra
 * rounds buy nothing measurable. The count is kept at the accepted floor rather
 * than removed entirely so that the parameters are still recorded in the file
 * and can be raised if the kit ever accepts a user-chosen phrase.
 *
 * Do not "fix" this to match the master password's count, and do not lower the
 * master password's count to match this one.
 */
export const RECOVERY_KDF_ITERATIONS = 100_000;

/** A fresh recovery key, formatted the way it will be shown and written down. */
export function generateRecoveryKey(): string {
  return group(crockfordEncode(randomBytes(RECOVERY_KEY_BYTES)));
}

/**
 * Accept what a person actually types: lower case, their own spacing, and the
 * letters they confused for digits.
 */
export function normaliseRecoveryKey(input: string): string {
  return crockfordEncode(crockfordDecode(input));
}

export function isWellFormedRecoveryKey(input: string): boolean {
  try {
    return crockfordDecode(input).length === RECOVERY_KEY_BYTES;
  } catch {
    return false;
  }
}

async function deriveRecoveryKek(recoveryKey: string, kdf: KdfParams): Promise<CryptoKey> {
  return deriveKek(normaliseRecoveryKey(recoveryKey), kdf);
}

export function hasRecoveryKit(file: VaultFile): boolean {
  return file.recovery !== null;
}

/**
 * Issue a kit. Returns the key exactly once — it is never stored anywhere, so
 * a caller that drops it has thrown it away for good.
 */
export async function attachRecoveryKit(
  file: VaultFile,
  dataKey: CryptoKey,
): Promise<{ file: VaultFile; recoveryKey: string }> {
  const recoveryKey = generateRecoveryKey();
  const kdf = newKdfParams(RECOVERY_KDF_ITERATIONS);
  const kek = await deriveRecoveryKek(recoveryKey, kdf);

  const recovery: RecoveryWrap = {
    kdf,
    wrappedKey: await wrapDataKey(kek, dataKey),
    createdAt: Date.now(),
  };

  return { file: { ...file, recovery, updatedAt: Date.now() }, recoveryKey };
}

/**
 * Opens a kit's wrapping of the data key — from this vault file, or handed back
 * by the sync server to a device that has nothing else.
 */
export async function unwrapRecoveryWrap(
  wrap: Pick<RecoveryWrap, 'kdf' | 'wrappedKey'>,
  recoveryKey: string,
): Promise<CryptoKey> {
  if (!isWellFormedRecoveryKey(recoveryKey)) {
    // Distinguish "that is not a recovery key" from "that is the wrong one", so
    // someone who pasted the wrong thing entirely is not told their key failed.
    throw new Error('That does not look like a recovery key.');
  }
  const kek = await deriveRecoveryKek(recoveryKey, wrap.kdf);
  return unwrapDataKey(kek, wrap.wrappedKey);
}

export async function unlockWithRecoveryKey(
  file: VaultFile,
  recoveryKey: string,
): Promise<UnlockedVault> {
  if (!file.recovery) {
    throw new Error('This vault does not have a recovery key.');
  }
  const dataKey = await unwrapRecoveryWrap(file.recovery, recoveryKey);
  return { file, dataKey, data: await readPayload(file, dataKey) };
}

export function removeRecoveryKit(file: VaultFile): VaultFile {
  return { ...file, recovery: null, updatedAt: Date.now() };
}

export { DecryptionError };

/** The printable sheet. Plain text on purpose: it has to survive everything. */
export function recoveryKitDocument(recoveryKey: string, createdAt = Date.now()): string {
  return [
    'KEYROOK AUTHENTICATOR — EMERGENCY RECOVERY KEY',
    '',
    `Issued: ${new Date(createdAt).toISOString().slice(0, 10)}`,
    '',
    '    ' + recoveryKey,
    '',
    'What this is for',
    '  If you forget your master password, this key is the only way back into',
    '  your accounts. Nobody can reset it for you — not us, not Google. That is',
    '  deliberate: it is the same property that stops anyone else opening your',
    '  vault.',
    '',
    'How to keep it',
    '  Print this and put it somewhere you would keep a passport. Do not store',
    '  it in the same place as your master password, and do not photograph it',
    '  onto a phone that syncs to a cloud you sign into with 2FA from this app.',
    '',
    'How to use it',
    '  Open Keyrook Authenticator, choose "Use a recovery key" on the unlock',
    '  screen, and type the key above. You will then set a new master password.',
    '',
  ].join('\n');
}
