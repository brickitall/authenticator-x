import { scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { scrypt } from '../src/crypto/scrypt.js';

const hex = (bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString('hex');
const enc = (text: string) => new TextEncoder().encode(text);

/**
 * scrypt is only ever used to open another app's backup, but a wrong byte in
 * it means every such backup looks like a wrong password. So it is held to
 * RFC 7914's own vector and to Node's implementation across shapes of r and p.
 */
describe('scrypt', () => {
  it('gives RFC 7914’s answer for "password" and "NaCl"', async () => {
    const key = await scrypt(enc('password'), enc('NaCl'), { n: 1024, r: 8, p: 16, length: 64 });
    expect(hex(key)).toBe(
      'fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640',
    );
  });

  it('matches Node’s scrypt for other shapes, including the one Aegis uses', async () => {
    for (const [password, salt, n, r, p, length] of [
      ['test', 'salt-one', 16, 1, 1, 32],
      ['a longer passphrase', 'another salt', 256, 2, 3, 48],
      ['test', 'aegis-like', 32768, 8, 1, 32],
    ] as const) {
      const ours = await scrypt(enc(password), enc(salt), { n, r, p, length });
      const node = scryptSync(password, salt, length, { N: n, r, p, maxmem: 256 * 1024 * 1024 });
      expect(hex(ours)).toBe(hex(node));
    }
  });

  it('refuses an N that is not a power of two', async () => {
    await expect(scrypt(enc('x'), enc('y'), { n: 1000, r: 1, p: 1, length: 32 })).rejects.toThrow();
  });
});
