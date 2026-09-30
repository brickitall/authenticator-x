import { describe, expect, it } from 'vitest';
import { isMigrationUri, parseMigrationUri } from '../src/otp/migration.js';
import { base32Decode } from '../src/util/base32.js';
import { toBase64, utf8 } from '../src/util/bytes.js';

// A minimal protobuf *encoder*, written independently of the decoder under
// test, so the two have to agree on the wire format rather than on a shared bug.
function varint(value: number): number[] {
  const out: number[] = [];
  let remaining = value;
  while (remaining > 0x7f) {
    out.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  out.push(remaining);
  return out;
}

function tag(field: number, wireType: number): number[] {
  return varint((field << 3) | wireType);
}

function bytesField(field: number, value: Uint8Array): number[] {
  return [...tag(field, 2), ...varint(value.length), ...value];
}

function stringField(field: number, value: string): number[] {
  return bytesField(field, utf8(value));
}

function varintField(field: number, value: number): number[] {
  return [...tag(field, 0), ...varint(value)];
}

interface Entry {
  secret: string;
  name: string;
  issuer: string;
  algorithm?: number;
  digits?: number;
  type?: number;
  counter?: number;
}

interface Batch {
  size: number;
  index: number;
  id?: number;
}

function encodeMigration(
  entries: Entry[],
  extras: number[] = [],
  batch: Batch = { size: 1, index: 0 },
): string {
  const body: number[] = [];

  for (const entry of entries) {
    const params = [
      ...bytesField(1, base32Decode(entry.secret)),
      ...stringField(2, entry.name),
      ...stringField(3, entry.issuer),
      ...varintField(4, entry.algorithm ?? 1),
      ...varintField(5, entry.digits ?? 1),
      ...varintField(6, entry.type ?? 2),
      ...varintField(7, entry.counter ?? 0),
    ];
    body.push(...tag(1, 2), ...varint(params.length), ...params);
  }

  body.push(...varintField(2, 1)); // version
  body.push(...varintField(3, batch.size)); // batch_size
  body.push(...varintField(4, batch.index)); // batch_index
  if (batch.id !== undefined) body.push(...varintField(5, batch.id)); // batch_id
  body.push(...extras);

  const data = toBase64(new Uint8Array(body));
  return `otpauth-migration://offline?data=${encodeURIComponent(data)}`;
}

describe('Google Authenticator migration payloads', () => {
  it('recognises the scheme', () => {
    expect(isMigrationUri('otpauth-migration://offline?data=AA')).toBe(true);
    expect(isMigrationUri('otpauth://totp/x?secret=AA')).toBe(false);
  });

  it('decodes a single TOTP entry', () => {
    const uri = encodeMigration([
      { secret: 'JBSWY3DPEHPK3PXP', name: 'octocat', issuer: 'GitHub' },
    ]);
    const payload = parseMigrationUri(uri);

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      type: 'totp',
      issuer: 'GitHub',
      label: 'octocat',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
  });

  it('decodes several entries in one payload', () => {
    const payload = parseMigrationUri(
      encodeMigration([
        { secret: 'JBSWY3DPEHPK3PXP', name: 'a@example.com', issuer: 'Alpha' },
        { secret: 'MZXW6YTBOI', name: 'b@example.com', issuer: 'Beta', algorithm: 2, digits: 2 },
        { secret: 'MZXW6YTBOI', name: 'c', issuer: 'Gamma', type: 1, counter: 12 },
      ]),
    );

    expect(payload.items.map((item) => item.issuer)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(payload.items[1]).toMatchObject({ algorithm: 'SHA256', digits: 8 });
    expect(payload.items[2]).toMatchObject({ type: 'hotp', counter: 12 });
  });

  it('splits an "Issuer:Account" name that also carries an issuer field', () => {
    const payload = parseMigrationUri(
      encodeMigration([{ secret: 'JBSWY3DPEHPK3PXP', name: 'AWS:root', issuer: 'AWS' }]),
    );
    expect(payload.items[0]).toMatchObject({ issuer: 'AWS', label: 'root' });
  });

  it('skips entries whose secret is missing instead of failing the whole import', () => {
    const good = [...varintField(2, 1), ...varintField(3, 1), ...varintField(4, 0)];
    const emptyParams = [...utf8('')];
    const body = [
      ...tag(1, 2),
      ...varint(emptyParams.length),
      ...emptyParams,
      ...good,
    ];
    const uri = `otpauth-migration://offline?data=${encodeURIComponent(
      toBase64(new Uint8Array(body)),
    )}`;
    expect(parseMigrationUri(uri).items).toHaveLength(0);
  });

  it('ignores unknown fields a future Google build might add', () => {
    const uri = encodeMigration(
      [{ secret: 'JBSWY3DPEHPK3PXP', name: 'x', issuer: 'Y' }],
      [...varintField(9, 123), ...stringField(10, 'future')],
    );
    expect(parseMigrationUri(uri).items).toHaveLength(1);
  });

  it('reports batch information for multi-QR exports', () => {
    const payload = parseMigrationUri(
      encodeMigration([{ secret: 'JBSWY3DPEHPK3PXP', name: 'x', issuer: 'Y' }]),
    );
    expect(payload.batchSize).toBe(1);
    expect(payload.batchIndex).toBe(0);
  });

  it('reads which part of which export a QR is', () => {
    const entry = [{ secret: 'JBSWY3DPEHPK3PXP', name: 'x', issuer: 'Y' }];
    const payload = parseMigrationUri(encodeMigration(entry, [], { size: 3, index: 2, id: 918273 }));

    expect(payload).toMatchObject({ batchSize: 3, batchIndex: 2, batchId: 918273 });
  });

  it('tells two exports apart even when they are at the same position', () => {
    // The case batchId exists for: the user backs out of an export and starts
    // again, and "part 2 of 3" of the new one must not complete the old one.
    const entry = [{ secret: 'JBSWY3DPEHPK3PXP', name: 'x', issuer: 'Y' }];
    const first = parseMigrationUri(encodeMigration(entry, [], { size: 3, index: 1, id: 111 }));
    const second = parseMigrationUri(encodeMigration(entry, [], { size: 3, index: 1, id: 222 }));

    expect(first.batchId).not.toBe(second.batchId);
  });

  it('defaults the export id when an older payload leaves it out', () => {
    const payload = parseMigrationUri(
      encodeMigration([{ secret: 'JBSWY3DPEHPK3PXP', name: 'x', issuer: 'Y' }]),
    );
    expect(payload.batchId).toBe(0);
  });

  it('rejects a payload with no data parameter', () => {
    expect(() => parseMigrationUri('otpauth-migration://offline')).toThrow(/missing the "data"/);
  });
});
