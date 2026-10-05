/** RFC 4648 base32, the encoding every authenticator uses for OTP secrets. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array, pad = false): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  if (pad) while (out.length % 8 !== 0) out += '=';
  return out;
}

/**
 * Decode a base32 secret. Users paste these by hand, so we forgive lowercase,
 * spaces, dashes and missing padding — but reject genuinely invalid characters
 * rather than silently producing a wrong secret.
 */
export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (clean.length === 0) throw new Error('Secret is empty');

  const out = new Uint8Array(Math.floor((clean.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let index = 0;

  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: "${char}"`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out[index++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return out.subarray(0, index);
}

export function isValidBase32(input: string): boolean {
  try {
    return base32Decode(input).length > 0;
  } catch {
    return false;
  }
}

/**
 * A key in its one canonical spelling: upper case, unpadded, and the bits past
 * the last byte zero. The bytes — and so the codes — are unchanged. What goes
 * to another app goes like this: Google Authenticator on iOS refuses a QR code
 * whose key has `=` padding, or a last letter carrying spare bits, which a key
 * typed by hand often has.
 */
export function canonicalSecret(secret: string): string {
  return base32Encode(base32Decode(secret));
}
