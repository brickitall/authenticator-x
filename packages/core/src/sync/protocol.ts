/**
 * The wire contract between the client and the sync server.
 *
 * Types only. Keeping the contract in the
 * shared package means the extension, the future native apps and the server all
 * compile against one definition rather than three drifting copies.
 *
 * What the client guarantees whatever the server does is set out in
 * docs/security-model.md.
 */
import type { SealedBox } from '../crypto/aead.js';
import type { RecoveryWrap } from '../vault/model.js';
import type { AccountKdfParams } from './account.js';
import type { RemoteRecord } from './adapter.js';

export const SYNC_API_VERSION = 1;

// --- POST /auth/prelogin ----------------------------------------------------

export interface PreloginRequest {
  email: string;
}

/**
 * Returns the KDF parameters for an account so the client can derive its keys
 * before authenticating. Unknown emails get deterministic pseudo-parameters
 * derived from a server secret, so this cannot be used to enumerate accounts.
 */
export interface PreloginResponse {
  kdf: AccountKdfParams;
}

// --- POST /auth/register/start ----------------------------------------------

/**
 * Asks for a one-time code to be sent to the address. Answered the same way
 * whether or not the address already has an account: if it does, the email
 * says so instead of carrying a code, and only the address's owner reads it.
 */
export interface RegisterStartRequest {
  email: string;
}

// --- POST /auth/register ----------------------------------------------------

export interface RegisterRequest {
  email: string;
  /** The six-digit code sent to `email`. An account only exists once it is proved. */
  code: string;
  /** HKDF output; the server hashes it again before storing. */
  authHash: string;
  kdf: AccountKdfParams;
  /** The vault data key, wrapped under the stretched key. */
  protectedKey: SealedBox;
  /** Proof of holding the data key; see `deriveKeyCheck`. */
  keyCheck: string;
  /** Shown in the device list so a user can recognise their own sessions. */
  deviceName: string;
  deviceId: string;
}

// --- POST /auth/login -------------------------------------------------------

export interface LoginRequest {
  email: string;
  authHash: string;
  deviceId: string;
  deviceName: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  /** The client unwraps this with its stretched key to recover the data key. */
  protectedKey: SealedBox;
  account: {
    email: string;
  };
}

// --- POST /auth/refresh, POST /auth/logout ----------------------------------

export interface RefreshRequest {
  refreshToken: string;
}

export type RefreshResponse = Pick<LoginResponse, 'accessToken' | 'refreshToken' | 'expiresIn'>;

/** Ends this device's session on the server. Answers 204 whatever it finds. */
export type LogoutRequest = RefreshRequest;

// --- GET /account/devices, DELETE /account/devices/:id ----------------------

/** One signed-in session. A device that signs in again replaces its own. */
export interface DeviceSummary {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
  /** The session making this request. */
  current: boolean;
}

export interface DevicesResponse {
  devices: DeviceSummary[];
}

// --- POST /account/password -------------------------------------------------

/**
 * Replaces the account password. The data key does not change — only its
 * wrapping — so nothing is re-encrypted. Proving the *current* password is
 * required: a session token alone must never be enough to take over an
 * account. Every other session is ended.
 */
export interface ChangePasswordRequest {
  currentAuthHash: string;
  authHash: string;
  kdf: AccountKdfParams;
  protectedKey: SealedBox;
}

// --- PUT /account/recovery --------------------------------------------------

/**
 * Sets or removes the account's recovery kit. Needs the account password and
 * the data key, not just the session: whoever sets the kit can reset the
 * password through it, and anyone at an unlocked vault holds the data key.
 */
export interface SetRecoveryRequest {
  /** Proof of the current account password. */
  authHash: string;
  keyCheck: string;
  /**
   * The sealed state's `issuedAt`, in the clear so an honest server can refuse
   * a change that is not newer than the one it holds — two devices racing, or
   * one with a slow clock. A hostile server can ignore it; devices still
   * refuse to go backwards on their own.
   */
  issuedAt: number;
  /** What the account's other devices adopt. */
  state: SealedBox;
  /** What a device with nothing but the recovery key is handed. Null removes. */
  wrap: RecoveryWrap | null;
  recoveryAuthHash: string | null;
}

// --- POST /auth/recover, POST /auth/recover/reset ---------------------------

/** Step one of recovering an account with nothing but its recovery key. */
export interface RecoverRequest {
  email: string;
  recoveryAuthHash: string;
}

export interface RecoverResponse {
  wrap: RecoveryWrap;
}

/**
 * Step two: a new password, with proof that the kit really did open the data
 * key. Every existing session is ended.
 */
export interface RecoverResetRequest {
  email: string;
  recoveryAuthHash: string;
  keyCheck: string;
  authHash: string;
  kdf: AccountKdfParams;
  protectedKey: SealedBox;
  deviceId: string;
  deviceName: string;
}

// --- DELETE /account --------------------------------------------------------

/** Irreversible, so it takes the password, not just a session. */
export interface DeleteAccountRequest {
  authHash: string;
}

// --- GET /sync?since=<serverRev> -------------------------------------------

export interface PullResponse {
  records: RemoteRecord[];
  serverRev: number;
  hasMore: boolean;
  /**
   * The account's recovery-kit state, sealed under the data key, when it
   * changed after `since`. Opaque to the server; see `openRecoveryState`.
   */
  recovery?: SealedBox;
  /**
   * Names the database's history. It changes only when the server is restored
   * from a backup, which forgets every change made after the backup was taken.
   */
  epoch?: string;
}

// --- POST /sync -------------------------------------------------------------

export interface PushRequest {
  records: RemoteRecord[];
  /** The revision the client believes it is up to date with. */
  baseServerRev: number;
}

export interface PushResponse {
  accepted: { id: string; rev: number; serverRev: number }[];
  /** Records the server refused because it holds a newer revision. */
  conflicts: RemoteRecord[];
  serverRev: number;
  /** Set when a push was trimmed by the account's ceiling on live accounts. */
  rejectedForLimit?: { id: string }[];
}

// --- Errors -----------------------------------------------------------------

export type SyncErrorCode =
  | 'invalid_credentials'
  /** Signed in, but the password or key proof this change needs was wrong. */
  | 'forbidden'
  /** The emailed code was wrong, used, expired, or tried too many times. */
  | 'invalid_code'
  /** The server could not do something it depends on, such as sending mail. */
  | 'unavailable'
  | 'rate_limited'
  | 'stale_revision'
  | 'payload_too_large'
  | 'unauthorized';

export interface SyncErrorBody {
  error: SyncErrorCode;
  message: string;
  /** Seconds to wait, on `rate_limited`. */
  retryAfter?: number;
}
