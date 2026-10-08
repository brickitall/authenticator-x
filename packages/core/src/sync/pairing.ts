/**
 * Joining a browser to an account by approval from one already in it — how a
 * provider account, which has no password, gets its data key to a new device.
 * The design and the attacks it answers are in docs/provider-sign-in.md.
 *
 * Both browsers make an ephemeral ECDH P-256 key pair. The server carries the
 * public halves between them, and so could swap either for its own: swap the
 * requester's and it receives the data key; swap the approver's and it hands
 * the new browser a key of its choosing, then reads everything added there.
 * So both browsers show a code computed over *both* public keys, and the
 * person approving checks the two screens agree. The code is 75 bits because
 * the server sees both keys before the codes are shown and could search for a
 * pair that collides with a short one; six digits would take it a second.
 *
 * The data key then travels wrapped under a key only the two browsers can
 * derive, and the wrap is bound to this pairing and these two keys, so it
 * cannot be replayed into another.
 */
import { DecryptionError, type SealedBox } from '../crypto/aead.js';
import { concatBytes, fromBase64, toBase64, utf8 } from '../util/bytes.js';
import { crockfordEncode, group } from '../util/crockford.js';
import { randomBytes } from '../util/id.js';

const CODE_INFO = 'authx:v1:pairing-code';
const WRAP_INFO = 'authx:v1:pairing-wrap';
const WRAP_AAD = 'authx.pairing:v1';
const CURVE: EcKeyImportParams = { name: 'ECDH', namedCurve: 'P-256' };
/** An uncompressed P-256 point: 0x04, then 32 bytes of x and 32 of y. */
const PUBLIC_KEY_BYTES = 65;
/** Fifteen Crockford characters — 75 bits — in three groups of five. */
export const PAIRING_CODE_LENGTH = 15;

export interface PairingKeys {
  privateKey: CryptoKey;
  /** The raw public point, base64: what goes to the server. */
  publicKey: string;
}

/**
 * A fresh key pair for one pairing. The private half is extractable only so
 * the requesting browser can keep it in session storage while it waits — a
 * service worker can be stopped at any moment during the minutes a person
 * takes to approve — and it never leaves memory.
 */
export async function newPairingKeys(): Promise<PairingKeys> {
  const pair = await crypto.subtle.generateKey(CURVE, true, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { privateKey: pair.privateKey, publicKey: toBase64(raw) };
}

export async function exportPairingKeys(keys: PairingKeys): Promise<{ privateKey: JsonWebKey; publicKey: string }> {
  return { privateKey: await crypto.subtle.exportKey('jwk', keys.privateKey), publicKey: keys.publicKey };
}

export async function importPairingKeys(stored: { privateKey: JsonWebKey; publicKey: string }): Promise<PairingKeys> {
  const privateKey = await crypto.subtle.importKey('jwk', stored.privateKey, CURVE, true, ['deriveBits']);
  return { privateKey, publicKey: stored.publicKey };
}

/**
 * Checks a public key from the server is a point on the curve. Importing does
 * that; a malformed or off-curve point is a reason to stop, not to proceed
 * with whatever ECDH would make of it.
 */
async function importPublic(publicKey: string): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = fromBase64(publicKey);
  } catch {
    throw new Error('Malformed pairing key.');
  }
  if (raw.length !== PUBLIC_KEY_BYTES || raw[0] !== 0x04) throw new Error('Malformed pairing key.');
  try {
    return await crypto.subtle.importKey('raw', raw as BufferSource, CURVE, false, []);
  } catch {
    throw new Error('Malformed pairing key.');
  }
}

/** Everything a code and a wrap are bound to, in one unambiguous byte string. */
function transcript(label: string, pairingId: string, requesterKey: string, approverKey: string): Uint8Array {
  if (requesterKey === approverKey) throw new Error('A pairing needs two different keys.');
  const field = (value: string) => {
    const bytes = utf8(value);
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, bytes.length);
    return concatBytes(length, bytes);
  };
  return concatBytes(field(label), field(pairingId), field(requesterKey), field(approverKey));
}

/**
 * The code both browsers show, as ABCDE-FGHIJ-KLMNO. Equal codes mean both
 * browsers hold the same two public keys — that nothing in between swapped one.
 */
export async function pairingCode(pairingId: string, requesterKey: string, approverKey: string): Promise<string> {
  await importPublic(requesterKey);
  await importPublic(approverKey);
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', transcript(CODE_INFO, pairingId, requesterKey, approverKey) as BufferSource),
  );
  return group(crockfordEncode(digest.subarray(0, 10)).slice(0, PAIRING_CODE_LENGTH), 5);
}

/** The AES key only the two browsers in this pairing can derive. */
async function wrappingKey(
  own: PairingKeys,
  peerKey: string,
  pairingId: string,
  requesterKey: string,
  approverKey: string,
): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: await importPublic(peerKey) }, own.privateKey, 256);
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: transcript(WRAP_INFO, pairingId, requesterKey, approverKey) as BufferSource,
      info: utf8(WRAP_INFO) as BufferSource,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

const wrapParams = (iv: Uint8Array, pairingId: string, requesterKey: string, approverKey: string): AesGcmParams => ({
  name: 'AES-GCM',
  iv: iv as BufferSource,
  tagLength: 128,
  additionalData: transcript(WRAP_AAD, pairingId, requesterKey, approverKey) as BufferSource,
});

/** The approving browser: the data key, wrapped for the requester's key. */
export async function wrapDataKeyForPairing(
  dataKey: CryptoKey,
  approver: PairingKeys,
  pairingId: string,
  requesterKey: string,
): Promise<SealedBox> {
  const key = await wrappingKey(approver, requesterKey, pairingId, requesterKey, approver.publicKey);
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey(
    'raw',
    dataKey,
    key,
    wrapParams(iv, pairingId, requesterKey, approver.publicKey),
  );
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(wrapped)) };
}

/**
 * The requesting browser: the data key, from a wrap made for its key by the
 * holder of `approverKey`. Anything else — another pairing's wrap, a different
 * approver key, a tampered box — fails as a `DecryptionError`.
 *
 * Opening proves the wrap came from whoever holds the approver key the codes
 * were compared over; it does not prove the key is the account's. The caller
 * checks that against something only the account's key opens — its sealed
 * recovery-kit state — before adopting it.
 */
export async function unwrapPairedDataKey(
  requester: PairingKeys,
  pairingId: string,
  approverKey: string,
  box: SealedBox,
): Promise<CryptoKey> {
  const key = await wrappingKey(requester, approverKey, pairingId, requester.publicKey, approverKey);
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      fromBase64(box.ct) as BufferSource,
      key,
      wrapParams(fromBase64(box.iv), pairingId, requester.publicKey, approverKey),
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  } catch {
    throw new DecryptionError('That approval did not come from the browser whose code you checked.');
  }
}
