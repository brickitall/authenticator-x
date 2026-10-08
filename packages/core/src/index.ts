/**
 * @authx/core — everything that is not tied to a browser extension.
 *
 * The Chrome extension, and later the desktop and mobile apps, all consume this
 * package; nothing in here may reference `chrome.*`, `window` or the DOM.
 */

// OTP
export * from './otp/types.js';
export * from './otp/totp.js';
export * from './otp/uri.js';
export * from './otp/migration.js';
export * from './otp/quick.js';

// Crypto
export * from './crypto/kdf.js';
export * from './crypto/aead.js';

// Vault
export * from './vault/model.js';
export * from './vault/vault.js';
export * from './vault/recovery.js';
export * from './vault/backup.js';
export * from './vault/foreign.js';
export * from './vault/autofill.js';
export * from './vault/csv.js';

// Brands
export * from './brand/registry.js';

// Sync
export * from './sync/adapter.js';
export * from './sync/account.js';
export * from './sync/protocol.js';
export * from './sync/http.js';
export * from './sync/engine.js';
export * from './sync/recovery.js';
export * from './sync/pairing.js';

// Utilities worth exposing to app code
export { base32Decode, base32Encode, canonicalSecret, isValidBase32 } from './util/base32.js';
export { crockfordDecode, crockfordEncode, group } from './util/crockford.js';
export { toBase64, fromBase64, toHex, fromHex, utf8, fromUtf8 } from './util/bytes.js';
export { newId, randomBytes } from './util/id.js';
