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
    /** How the account proves who is signing in. */
    method?: AccountMethod;
  };
}

/**
 * `password`: the account password, as since 0.2. `provider`: Google or
 * GitHub, with no password at all; docs/provider-sign-in.md.
 */
export type AccountMethod = 'password' | 'provider';
export type SignInProvider = 'google' | 'github';

// --- Sign in with a provider ------------------------------------------------
//
// GET /oauth/:provider/start?ext=<extension id>&challenge=<S256 of a verifier>
//     &state=<client state>&purpose=signin|reauth
//   → the provider's consent page → /oauth/:provider/callback
//   → https://<extension id>.chromiumapp.org/oauth#ticket=…&state=…
//     (or #error=…&state=…)
//
// The ticket is worth nothing without the verifier, which never leaves the
// extension.

/** A ticket from the callback, and the verifier its challenge was made from. */
export interface ProviderTicket {
  ticket: string;
  verifier: string;
}

export interface ProviderSessionRequest extends ProviderTicket {
  deviceId: string;
  deviceName: string;
}

/**
 * A provider account's session. No `protectedKey`: nothing wraps its data key
 * for the server, which is the point — a new browser gets the key by
 * `PairingRequest` or with the recovery key (`RecoveryWrapRequest`).
 */
export type ProviderLogin = Omit<LoginResponse, 'protectedKey'>;

/**
 * `existing`: signed in; the device holds no data key yet unless it already
 * had the account's. `new`: no account has this identity — `signupToken`
 * creates one within ten minutes.
 */
export type ProviderSessionResponse =
  | { status: 'existing'; session: ProviderLogin }
  | { status: 'new'; signupToken: string; email: string };

export interface ProviderRegisterRequest {
  signupToken: string;
  /** Proof of holding the data key; see `deriveKeyCheck`. */
  keyCheck: string;
  /**
   * The recovery kit is part of signing up, not an option: for an account with
   * no password it is the only way back in once every device is gone.
   */
  recovery: {
    issuedAt: number;
    state: SealedBox;
    wrap: RecoveryWrap;
    recoveryAuthHash: string;
  };
  deviceId: string;
  deviceName: string;
}

/**
 * What a change to a provider account needs instead of the password: a fresh
 * sign-in with the provider, made for this purpose within the last minutes.
 */
export type OwnerProof = { authHash: string } | { reauth: ProviderTicket };

// --- Joining by approval: /pairing ------------------------------------------

/** A browser signed in to the account, without its data key, asks to join. */
export interface PairingRequest {
  /** An ephemeral ECDH P-256 public key, raw, base64. */
  publicKey: string;
  deviceName: string;
}

export interface PairingCreated {
  id: string;
  expiresAt: number;
}

/** An open request, as a browser that could approve it sees it. */
export interface PairingSummary {
  id: string;
  deviceName: string;
  createdAt: number;
  requesterKey: string;
  /** Set once a browser has started approving. */
  approverKey: string | null;
}

export interface PairingsResponse {
  pairings: PairingSummary[];
}

/** The requester's view of its own request. */
export interface PairingStatus {
  status: 'waiting' | 'accepted' | 'approved';
  approverKey: string | null;
  /** The data key wrapped for the requester; see `unwrapPairedDataKey`. */
  wrap: SealedBox | null;
}

/** The approving browser's key, sent before the codes are compared. */
export interface PairingAccept {
  publicKey: string;
}

/** The data key, after the person approving said the codes match. */
export interface PairingApprove {
  wrap: SealedBox;
}

// --- POST /account/recovery/wrap ---------------------------------------------

/**
 * A signed-in browser with nothing but the recovery key asks for the kit's
 * wrap — how a provider account joins when no other browser is left.
 */
export interface RecoveryWrapRequest {
  recoveryAuthHash: string;
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
  /** Proof of the current account password. Password accounts. */
  authHash?: string;
  /** A fresh sign-in with the provider. Provider accounts. */
  reauth?: ProviderTicket;
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

/** Irreversible, so it takes the password — or a fresh provider sign-in — not just a session. */
export interface DeleteAccountRequest {
  authHash?: string;
  reauth?: ProviderTicket;
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
  /** A provider identity whose email already belongs to another account. */
  | 'email_taken'
  /** A pairing that has ended, expired, or is not this session's to act on. */
  | 'not_found'
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
