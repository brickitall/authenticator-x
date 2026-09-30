import { describe, expect, it } from 'vitest';
import {
  generateDataKey,
  itemToRecord,
  liveItems,
  mergeRecords,
  recordToItem,
  syncOnce,
  type PullResult,
  type PushResult,
  type RemoteRecord,
  type SyncAdapter,
  type VaultData,
  type VaultItem,
} from '../src/index.js';
import { addItem, itemFromUri, updateItem } from '../src/vault/vault.js';
import { parseOtpUri } from '../src/otp/uri.js';
import { DEFAULT_ACCOUNT, DEFAULT_SETTINGS } from '../src/vault/model.js';

/**
 * The server cannot read a vault. It can do everything else: every plaintext
 * field around the ciphertext is its to choose, and it decides which records a
 * client is handed and in what order.
 *
 * These are the attacks that needs no key.
 */
function vault(...items: VaultItem[]): VaultData {
  return {
    schemaVersion: 1,
    items,
    groups: [],
    settings: { ...DEFAULT_SETTINGS },
    account: { ...DEFAULT_ACCOUNT, email: 'me@example.com', plan: 'synced' },
    sync: { deviceId: 'device-a', serverRev: 0, lastSyncAt: null },
  };
}

function item(issuer: string, secret: string, overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    ...itemFromUri(parseOtpUri(`otpauth://totp/${issuer}:me?secret=${secret}&issuer=${issuer}`)),
    ...overrides,
  };
}

/** Synced and untouched since — the state a clean local copy is in. */
const settled = (entry: VaultItem): VaultItem => ({ ...entry, syncedRev: entry.rev });

class HostileServer implements SyncAdapter {
  readonly id = 'hostile';
  constructor(private readonly records: RemoteRecord[]) {}
  async isAvailable() {
    return true;
  }
  async pull(): Promise<PullResult> {
    return { records: this.records, serverRev: 99, hasMore: false };
  }
  async push(): Promise<PushResult> {
    return { accepted: [], conflicts: [], serverRev: 99 };
  }
}

describe('ciphertext moved between accounts', () => {
  it('will not open under another account’s record', async () => {
    const key = await generateDataKey();
    const github = settled(item('GitHub', 'JBSWY3DPEHPK3PXP'));
    const bank = settled(item('Bank', 'MZXW6YTBOIQWY3DPEB3W64TMMQ'));

    const githubRecord = await itemToRecord(github, key, 'device-a');

    // The server keeps the bank's envelope and swaps in GitHub's ciphertext.
    // Nothing here needs the key, and without binding it would have worked:
    // the user would see GitHub's secret labelled as their bank.
    const spliced: RemoteRecord = {
      ...(await itemToRecord(bank, key, 'device-a')),
      box: githubRecord.box,
    };

    await expect(recordToItem(spliced, key)).rejects.toThrow();
  });

  it('will not open under a different revision', async () => {
    const key = await generateDataKey();
    const entry = settled(item('GitHub', 'JBSWY3DPEHPK3PXP'));
    const record = await itemToRecord(entry, key, 'device-a');

    // Re-labelling an old box as a newer revision is how a rotated-away secret
    // gets served back as the current one.
    await expect(recordToItem({ ...record, rev: record.rev + 5 }, key)).rejects.toThrow();
  });
});

describe('replaying an old record', () => {
  it('cannot roll a clean local copy backwards', async () => {
    const key = await generateDataKey();
    const original = settled(item('GitHub', 'JBSWY3DPEHPK3PXP'));
    const stale = await itemToRecord(original, key, 'device-a');

    // The user rotated the secret; the local copy is current and synced.
    const rotated = settled(
      updateItem(vault(original), original.id, { secret: 'MZXW6YTBOIQWY3DPEB3W64TMMQ' }).items[0]!,
    );
    const local = vault(rotated);

    const merged = await mergeRecords(local, [stale], key);

    expect(merged.applied).toBe(0);
    expect(liveItems(merged.data)[0]!.secret).toBe('MZXW6YTBOIQWY3DPEB3W64TMMQ');
  });

  it('still accepts a genuinely newer record', async () => {
    const key = await generateDataKey();
    const original = settled(item('GitHub', 'JBSWY3DPEHPK3PXP'));
    const local = vault(original);

    const newer = updateItem(local, original.id, { issuer: 'GitHub Work' }).items[0]!;
    const merged = await mergeRecords(local, [await itemToRecord(newer, key, 'device-b')], key);

    expect(merged.applied).toBe(1);
    expect(liveItems(merged.data)[0]!.issuer).toBe('GitHub Work');
  });
});

describe('a record that will not open', () => {
  it('is skipped rather than stopping the whole cycle', async () => {
    const key = await generateDataKey();
    const other = await generateDataKey();
    const good = settled(item('GitHub', 'JBSWY3DPEHPK3PXP'));
    const forged = settled(item('Forged', 'MZXW6YTBOI'));

    const records = [
      await itemToRecord(forged, other, 'attacker'),
      await itemToRecord(good, key, 'device-b'),
    ];

    // One bad record used to throw, which let whoever served it stop a vault
    // syncing for good.
    const outcome = await syncOnce(vault(), { adapter: new HostileServer(records), dataKey: key });

    expect(outcome.rejectedRecords).toBe(1);
    expect(outcome.pulled).toBe(1);
    expect(liveItems(outcome.data).map((entry) => entry.issuer)).toEqual(['GitHub']);
  });

  it('leaves the local copy alone when a forgery targets an existing account', async () => {
    const key = await generateDataKey();
    const other = await generateDataKey();
    const mine = settled(item('GitHub', 'JBSWY3DPEHPK3PXP'));

    const forged = await itemToRecord({ ...mine, rev: mine.rev + 1 }, other, 'attacker');
    const merged = await mergeRecords(vault(mine), [forged], key);

    expect(merged.rejected).toBe(1);
    expect(liveItems(merged.data)[0]!.secret).toBe('JBSWY3DPEHPK3PXP');
  });
});

describe('deletions arriving from the server', () => {
  it('are applied but counted, so they are never silent', async () => {
    const key = await generateDataKey();
    const a = settled(item('GitHub', 'JBSWY3DPEHPK3PXP'));
    const b = settled(item('Bank', 'MZXW6YTBOI'));

    // A tombstone carries no ciphertext, so nothing can authenticate it — the
    // server can always claim an account was deleted. What it must not do is
    // make that invisible: the count drives a notice, and everything removed
    // stays restorable.
    const tombstones = [
      { ...(await itemToRecord(a, key, 'x')), deleted: true, box: null, rev: a.rev + 1 },
      { ...(await itemToRecord(b, key, 'x')), deleted: true, box: null, rev: b.rev + 1 },
    ];

    const outcome = await syncOnce(vault(a, b), {
      adapter: new HostileServer(tombstones),
      dataKey: key,
    });

    expect(outcome.deleted).toBe(2);
    expect(liveItems(outcome.data)).toHaveLength(0);
    // Restorable, not gone.
    expect(outcome.data.items).toHaveLength(2);
    expect(outcome.data.items.every((entry) => entry.deletedAt !== null)).toBe(true);
  });

  it('does not double-count one that was already deleted locally', async () => {
    const key = await generateDataKey();
    const gone = settled(item('GitHub', 'JBSWY3DPEHPK3PXP', { deletedAt: Date.now() }));
    const record = { ...(await itemToRecord(gone, key, 'x')), rev: gone.rev + 1 };

    const merged = await mergeRecords(vault(gone), [record], key);
    expect(merged.deleted).toBe(0);
  });
});

describe('a server that never finishes', () => {
  it('gives up rather than looping forever', async () => {
    const key = await generateDataKey();
    let pulls = 0;
    const endless: SyncAdapter = {
      id: 'endless',
      async isAvailable() {
        return true;
      },
      async pull() {
        pulls += 1;
        // Always more, never anything new.
        return { records: [], serverRev: pulls, hasMore: true };
      },
      async push() {
        return { accepted: [], conflicts: [], serverRev: pulls };
      },
    };

    await syncOnce(vault(), { adapter: endless, dataKey: key, maxPages: 5 });
    expect(pulls).toBe(5);
  });
});

describe('adding an unknown account', () => {
  it('accepts a record for an id it has never seen', async () => {
    const key = await generateDataKey();
    const fresh = settled(item('Fastmail', 'JBSWY3DPEHPK3PXP'));
    const merged = await mergeRecords(vault(), [await itemToRecord(fresh, key, 'device-b')], key);

    expect(merged.applied).toBe(1);
    expect(liveItems(merged.data)[0]!.issuer).toBe('Fastmail');
  });
});
