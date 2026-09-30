import { describe, expect, it } from 'vitest';
import { crockfordDecode, crockfordEncode, group } from '../src/util/crockford.js';
import {
  attachRecoveryKit,
  generateRecoveryKey,
  hasRecoveryKit,
  isWellFormedRecoveryKey,
  normaliseRecoveryKey,
  recoveryKitDocument,
  removeRecoveryKit,
  RECOVERY_KEY_BYTES,
  unlockWithRecoveryKey,
} from '../src/vault/recovery.js';
import {
  addItem,
  createVault,
  deviceKeyring,
  itemFromUri,
  liveItems,
  passphraseKeyring,
  rewrapVault,
  sealVault,
  unlockVaultWithPassword,
} from '../src/vault/vault.js';
import { DecryptionError } from '../src/crypto/aead.js';
import { newKdfParams } from '../src/crypto/kdf.js';
import { parseOtpUri } from '../src/otp/uri.js';

const PASSWORD = 'correct horse battery staple';
const FAST_KDF = () => newKdfParams(100_000);
const ITEM = 'otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';

async function vaultWithItem(password = PASSWORD) {
  const vault = await createVault(await passphraseKeyring(password, FAST_KDF()));
  const data = addItem(vault.data, itemFromUri(parseOtpUri(ITEM)));
  const file = await sealVault(vault.file, vault.dataKey, data);
  return { ...vault, file, data };
}

async function deviceVault() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
  const vault = await createVault(deviceKeyring(key));
  const data = addItem(vault.data, itemFromUri(parseOtpUri(ITEM)));
  return { ...vault, file: await sealVault(vault.file, vault.dataKey, data), deviceKey: key };
}

describe('Crockford base32', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    expect(crockfordDecode(crockfordEncode(bytes))).toEqual(bytes);
  });

  it('never emits the confusable letters', () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const encoded = crockfordEncode(crypto.getRandomValues(new Uint8Array(20)));
      expect(encoded).not.toMatch(/[ILOU]/);
    }
  });

  it('forgives what people actually type', () => {
    const canonical = crockfordEncode(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    // Lower case, their own spacing, and O/I written where 0/1 were meant.
    const asTyped = group(canonical, 4, ' ')
      .toLowerCase()
      .replace(/0/g, 'O')
      .replace(/1/g, 'l');
    expect(crockfordDecode(asTyped)).toEqual(crockfordDecode(canonical));
  });

  it('rejects a character that is not in the alphabet', () => {
    expect(() => crockfordDecode('ABC$')).toThrow(/not part of a recovery key/);
    expect(() => crockfordDecode('   ')).toThrow(/empty/);
  });

  it('groups for legibility', () => {
    expect(group('ABCDEFGH')).toBe('ABCD-EFGH');
  });
});

describe('recovery keys', () => {
  it('is 160 bits, shown in groups of four', () => {
    const key = generateRecoveryKey();
    expect(key).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){7}$/);
    expect(crockfordDecode(key)).toHaveLength(RECOVERY_KEY_BYTES);
  });

  it('is different every time', () => {
    const keys = new Set(Array.from({ length: 50 }, generateRecoveryKey));
    expect(keys.size).toBe(50);
  });

  it('recognises a well-formed key and rejects a truncated one', () => {
    expect(isWellFormedRecoveryKey(generateRecoveryKey())).toBe(true);
    expect(isWellFormedRecoveryKey('ABCD-EFGH')).toBe(false);
    expect(isWellFormedRecoveryKey('not a key at all!')).toBe(false);
  });

  it('normalises to one canonical form', () => {
    const key = generateRecoveryKey();
    expect(normaliseRecoveryKey(key.toLowerCase().replace(/-/g, ' '))).toBe(
      normaliseRecoveryKey(key),
    );
  });
});

describe('the kit', () => {
  it('opens the vault without the master password', async () => {
    const vault = await vaultWithItem();
    const { file, recoveryKey } = await attachRecoveryKit(vault.file, vault.dataKey);

    expect(hasRecoveryKit(file)).toBe(true);
    const recovered = await unlockWithRecoveryKey(file, recoveryKey);
    expect(liveItems(recovered.data)).toHaveLength(1);
    expect(recovered.data.items[0]!.secret).toBe('JBSWY3DPEHPK3PXP');
  });

  it('accepts the key as a person would retype it', async () => {
    const vault = await vaultWithItem();
    const { file, recoveryKey } = await attachRecoveryKit(vault.file, vault.dataKey);

    const retyped = recoveryKey.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o');
    const recovered = await unlockWithRecoveryKey(file, retyped);
    expect(liveItems(recovered.data)).toHaveLength(1);
  });

  it('rejects a different key of the right shape', async () => {
    const vault = await vaultWithItem();
    const { file } = await attachRecoveryKit(vault.file, vault.dataKey);

    await expect(unlockWithRecoveryKey(file, generateRecoveryKey())).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it('says when the input is not a recovery key at all', async () => {
    const vault = await vaultWithItem();
    const { file } = await attachRecoveryKit(vault.file, vault.dataKey);

    // Distinct from "wrong key": someone who pasted their password should not
    // be told their recovery key failed.
    await expect(unlockWithRecoveryKey(file, PASSWORD)).rejects.toThrow(/does not look like/);
  });

  it('refuses when no kit was ever issued', async () => {
    const vault = await vaultWithItem();
    await expect(unlockWithRecoveryKey(vault.file, generateRecoveryKey())).rejects.toThrow(
      /does not have a recovery key/,
    );
  });

  it('leaves the payload and the password untouched', async () => {
    const vault = await vaultWithItem();
    const { file } = await attachRecoveryKit(vault.file, vault.dataKey);

    expect(file.payload).toEqual(vault.file.payload);
    expect(file.protection).toEqual(vault.file.protection);
    expect(liveItems((await unlockVaultWithPassword(file, PASSWORD)).data)).toHaveLength(1);
  });

  it('stores nothing that reveals the key or the vault', async () => {
    const vault = await vaultWithItem();
    const { file, recoveryKey } = await attachRecoveryKit(vault.file, vault.dataKey);

    const serialised = JSON.stringify(file);
    expect(serialised).not.toContain(recoveryKey);
    expect(serialised).not.toContain(normaliseRecoveryKey(recoveryKey));
    expect(serialised).not.toContain('JBSWY3DPEHPK3PXP');
  });

  it('survives a master password change', async () => {
    const vault = await vaultWithItem();
    const { file, recoveryKey } = await attachRecoveryKit(vault.file, vault.dataKey);

    // The kit wraps the data key, not the password, so rotating the password
    // must not invalidate it — otherwise every password change silently
    // destroys the user's only way back in.
    const rotated = await rewrapVault(
      file,
      vault.dataKey,
      await passphraseKeyring('an entirely new password', FAST_KDF()),
    );

    expect(liveItems((await unlockWithRecoveryKey(rotated, recoveryKey)).data)).toHaveLength(1);
  });

  it('survives switching between device and password protection', async () => {
    const vault = await deviceVault();
    const { file, recoveryKey } = await attachRecoveryKit(vault.file, vault.dataKey);

    const upgraded = await rewrapVault(
      file,
      vault.dataKey,
      await passphraseKeyring(PASSWORD, FAST_KDF()),
    );
    expect(liveItems((await unlockWithRecoveryKey(upgraded, recoveryKey)).data)).toHaveLength(1);
  });

  it('rescues a device vault whose device key is gone', async () => {
    // The state the UI otherwise has to call unrecoverable: storage survived,
    // the browser-held key did not.
    const vault = await deviceVault();
    const { file, recoveryKey } = await attachRecoveryKit(vault.file, vault.dataKey);

    const recovered = await unlockWithRecoveryKey(file, recoveryKey);
    expect(liveItems(recovered.data)).toHaveLength(1);
  });

  it('can be revoked', async () => {
    const vault = await vaultWithItem();
    const { file, recoveryKey } = await attachRecoveryKit(vault.file, vault.dataKey);

    const revoked = removeRecoveryKit(file);
    expect(hasRecoveryKit(revoked)).toBe(false);
    await expect(unlockWithRecoveryKey(revoked, recoveryKey)).rejects.toThrow(
      /does not have a recovery key/,
    );
    // Revoking the kit must not lock the owner out.
    expect(liveItems((await unlockVaultWithPassword(revoked, PASSWORD)).data)).toHaveLength(1);
  });

  it('reissuing invalidates the previous key', async () => {
    const vault = await vaultWithItem();
    const first = await attachRecoveryKit(vault.file, vault.dataKey);
    const second = await attachRecoveryKit(first.file, vault.dataKey);

    await expect(unlockWithRecoveryKey(second.file, first.recoveryKey)).rejects.toBeInstanceOf(
      DecryptionError,
    );
    expect(liveItems((await unlockWithRecoveryKey(second.file, second.recoveryKey)).data)).toHaveLength(1);
  });
});

describe('the printed sheet', () => {
  it('carries the key and says plainly that nobody can reset it', () => {
    const key = generateRecoveryKey();
    const document = recoveryKitDocument(key, Date.UTC(2026, 8, 11));

    expect(document).toContain(key);
    expect(document).toContain('2026-09-11');
    expect(document).toMatch(/Nobody can reset it for you/);
  });
});
