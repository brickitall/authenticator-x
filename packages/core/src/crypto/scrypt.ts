/**
 * scrypt (RFC 7914), for opening backups other apps made with it — Aegis
 * derives the key to its vault this way. Web Crypto has PBKDF2 but not scrypt,
 * and the core takes no dependencies, so the memory-hard part is here:
 * Salsa20/8, BlockMix and ROMix, on 32-bit words.
 *
 * It is used only to read a file someone chose, never to protect anything of
 * ours, so the caller bounds N, r and p before it runs: the parameters come
 * from the file.
 */

async function pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', password as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 1 }, key, length * 8);
  return new Uint8Array(bits);
}

const rotl = (value: number, by: number) => (value << by) | (value >>> (32 - by));

/** Salsa20/8 core, in place on 16 words of `b` starting at `at`. */
function salsa208(b: Uint32Array, at: number, x: Uint32Array): void {
  for (let i = 0; i < 16; i++) x[i] = b[at + i]!;
  for (let round = 0; round < 8; round += 2) {
    x[4]! ^= rotl((x[0]! + x[12]!) | 0, 7);
    x[8]! ^= rotl((x[4]! + x[0]!) | 0, 9);
    x[12]! ^= rotl((x[8]! + x[4]!) | 0, 13);
    x[0]! ^= rotl((x[12]! + x[8]!) | 0, 18);
    x[9]! ^= rotl((x[5]! + x[1]!) | 0, 7);
    x[13]! ^= rotl((x[9]! + x[5]!) | 0, 9);
    x[1]! ^= rotl((x[13]! + x[9]!) | 0, 13);
    x[5]! ^= rotl((x[1]! + x[13]!) | 0, 18);
    x[14]! ^= rotl((x[10]! + x[6]!) | 0, 7);
    x[2]! ^= rotl((x[14]! + x[10]!) | 0, 9);
    x[6]! ^= rotl((x[2]! + x[14]!) | 0, 13);
    x[10]! ^= rotl((x[6]! + x[2]!) | 0, 18);
    x[3]! ^= rotl((x[15]! + x[11]!) | 0, 7);
    x[7]! ^= rotl((x[3]! + x[15]!) | 0, 9);
    x[11]! ^= rotl((x[7]! + x[3]!) | 0, 13);
    x[15]! ^= rotl((x[11]! + x[7]!) | 0, 18);
    x[1]! ^= rotl((x[0]! + x[3]!) | 0, 7);
    x[2]! ^= rotl((x[1]! + x[0]!) | 0, 9);
    x[3]! ^= rotl((x[2]! + x[1]!) | 0, 13);
    x[0]! ^= rotl((x[3]! + x[2]!) | 0, 18);
    x[6]! ^= rotl((x[5]! + x[4]!) | 0, 7);
    x[7]! ^= rotl((x[6]! + x[5]!) | 0, 9);
    x[4]! ^= rotl((x[7]! + x[6]!) | 0, 13);
    x[5]! ^= rotl((x[4]! + x[7]!) | 0, 18);
    x[11]! ^= rotl((x[10]! + x[9]!) | 0, 7);
    x[8]! ^= rotl((x[11]! + x[10]!) | 0, 9);
    x[9]! ^= rotl((x[8]! + x[11]!) | 0, 13);
    x[10]! ^= rotl((x[9]! + x[8]!) | 0, 18);
    x[12]! ^= rotl((x[15]! + x[14]!) | 0, 7);
    x[13]! ^= rotl((x[12]! + x[15]!) | 0, 9);
    x[14]! ^= rotl((x[13]! + x[12]!) | 0, 13);
    x[15]! ^= rotl((x[14]! + x[13]!) | 0, 18);
  }
  for (let i = 0; i < 16; i++) b[at + i] = (b[at + i]! + x[i]!) | 0;
}

/** BlockMix_{Salsa20/8, r}: `b` (2r blocks of 16 words) into `y`, then back into `b`. */
function blockMix(b: Uint32Array, y: Uint32Array, r: number, x: Uint32Array, t: Uint32Array): void {
  const last = (2 * r - 1) * 16;
  for (let i = 0; i < 16; i++) t[i] = b[last + i]!;
  for (let block = 0; block < 2 * r; block++) {
    for (let i = 0; i < 16; i++) t[i]! ^= b[block * 16 + i]!;
    salsa208(t, 0, x);
    // Even blocks to the first half, odd to the second.
    const to = (block % 2 === 0 ? block / 2 : r + (block - 1) / 2) * 16;
    for (let i = 0; i < 16; i++) y[to + i] = t[i]!;
  }
  b.set(y);
}

/** ROMix on one 128·r-byte chunk of B, as little-endian words. */
function roMix(chunk: Uint32Array, n: number, r: number): void {
  const words = 32 * r;
  const v = new Uint32Array(words * n);
  const y = new Uint32Array(words);
  const x = new Uint32Array(16);
  const t = new Uint32Array(16);
  for (let i = 0; i < n; i++) {
    v.set(chunk, i * words);
    blockMix(chunk, y, r, x, t);
  }
  for (let i = 0; i < n; i++) {
    // Integerify: the first word of the last 64-byte block, mod N (a power of two).
    const j = chunk[(2 * r - 1) * 16]! & (n - 1);
    for (let k = 0; k < words; k++) chunk[k]! ^= v[j * words + k]!;
    blockMix(chunk, y, r, x, t);
  }
}

export interface ScryptParams {
  /** CPU and memory cost; a power of two above 1. */
  n: number;
  r: number;
  p: number;
  /** Length of the key, in bytes. */
  length: number;
}

export async function scrypt(password: Uint8Array, salt: Uint8Array, { n, r, p, length }: ScryptParams): Promise<Uint8Array> {
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error('scrypt N must be a power of two');
  const chunkBytes = 128 * r;
  const b = await pbkdf2Sha256(password, salt, p * chunkBytes);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const words = new Uint32Array(chunkBytes / 4);
  for (let chunk = 0; chunk < p; chunk++) {
    const offset = chunk * chunkBytes;
    for (let i = 0; i < words.length; i++) words[i] = view.getUint32(offset + i * 4, true);
    roMix(words, n, r);
    for (let i = 0; i < words.length; i++) view.setUint32(offset + i * 4, words[i]!, true);
  }
  // The final PBKDF2 uses the mixed B as its salt.
  const key = await crypto.subtle.importKey('raw', password as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b as BufferSource, iterations: 1 }, key, length * 8);
  return new Uint8Array(bits);
}
