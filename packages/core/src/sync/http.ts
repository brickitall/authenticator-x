/**
 * The client half of the sync protocol.
 *
 * Everything here moves ciphertext. No plaintext secret, no data key and no
 * master password is ever passed to these functions — by the time a record
 * reaches `push`, its `box` is already sealed.
 */
import type { AccountKdfParams } from './account.js';
import type { PullResult, PushResult, RemoteRecord, SyncAdapter } from './adapter.js';
import type {
  ChangePasswordRequest,
  DeleteAccountRequest,
  DeviceSummary,
  DevicesResponse,
  LoginRequest,
  LoginResponse,
  PreloginResponse,
  PullResponse,
  PushRequest,
  PushResponse,
  RecoverRequest,
  RecoverResetRequest,
  RecoverResponse,
  RefreshResponse,
  RegisterRequest,
  SetRecoveryRequest,
  SyncErrorBody,
  SyncErrorCode,
} from './protocol.js';

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export class SyncHttpError extends Error {
  override readonly name = 'SyncHttpError';
  constructor(
    readonly status: number,
    readonly code: SyncErrorCode | 'network',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  fetcher: Fetcher,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch (cause) {
    // The message is shown to people as it is, so it says what happened in
    // their words; the browser's own ("TypeError: Failed to fetch") stays on
    // `cause` for whoever is debugging.
    throw new SyncHttpError(
      0,
      'network',
      'Could not reach the sync server. Check your connection and try again.',
      { cause },
    );
  }

  if (!response.ok) {
    // A server that is down or behind a captive portal will not return our
    // error shape; fall back rather than throwing a parse error over the top
    // of the real problem.
    const body = (await response.json().catch(() => null)) as SyncErrorBody | null;
    throw new SyncHttpError(
      response.status,
      body?.error ?? 'unauthorized',
      body?.message ?? `Sync request failed (${response.status}).`,
    );
  }

  // Endpoints that only confirm something happened answer 204 with no body.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** Where the caller keeps tokens. The extension puts them in session storage. */
export interface TokenStore {
  get(): Promise<Tokens | null>;
  set(tokens: Tokens): Promise<void>;
  clear(): Promise<void>;
}

// --- Unauthenticated endpoints ----------------------------------------------

export async function prelogin(
  baseUrl: string,
  email: string,
  fetcher: Fetcher = fetch,
): Promise<AccountKdfParams> {
  const { kdf } = await request<PreloginResponse>(
    baseUrl,
    '/auth/prelogin',
    { method: 'POST', body: JSON.stringify({ email }) },
    fetcher,
  );
  return kdf;
}

export function register(
  baseUrl: string,
  body: RegisterRequest,
  fetcher: Fetcher = fetch,
): Promise<LoginResponse> {
  return request<LoginResponse>(
    baseUrl,
    '/auth/register',
    { method: 'POST', body: JSON.stringify(body) },
    fetcher,
  );
}

export function login(
  baseUrl: string,
  body: LoginRequest,
  fetcher: Fetcher = fetch,
): Promise<LoginResponse> {
  return request<LoginResponse>(
    baseUrl,
    '/auth/login',
    { method: 'POST', body: JSON.stringify(body) },
    fetcher,
  );
}

/** Fetches the account's wrapped key, for a device holding only the recovery key. */
export async function recover(
  baseUrl: string,
  body: RecoverRequest,
  fetcher: Fetcher = fetch,
): Promise<RecoverResponse> {
  return request<RecoverResponse>(
    baseUrl,
    '/auth/recover',
    { method: 'POST', body: JSON.stringify(body) },
    fetcher,
  );
}

/** Sets a new password through the recovery kit and signs this device in. */
export function recoverReset(
  baseUrl: string,
  body: RecoverResetRequest,
  fetcher: Fetcher = fetch,
): Promise<LoginResponse> {
  return request<LoginResponse>(
    baseUrl,
    '/auth/recover/reset',
    { method: 'POST', body: JSON.stringify(body) },
    fetcher,
  );
}

/**
 * Ends this device's session on the server. Best effort by design: signing out
 * must work offline too, so a caller should clear its tokens whatever this does.
 */
export async function logout(
  baseUrl: string,
  refreshToken: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  await request<void>(
    baseUrl,
    '/auth/logout',
    { method: 'POST', body: JSON.stringify({ refreshToken }) },
    fetcher,
  );
}

// --- The adapter ------------------------------------------------------------

export interface HttpSyncOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetcher?: Fetcher;
}

/**
 * Refreshes in flight, keyed by the refresh token being spent.
 *
 * The server ends a whole session when a spent refresh token comes back, which
 * is what makes a copied token worthless. It cannot tell a thief from two of
 * the owner's own calls that hit 401 together and both try to refresh — so the
 * client must never do that. Every caller holding the same token shares one
 * exchange.
 */
const inflightRefreshes = new Map<string, Promise<Tokens>>();

export class HttpSyncAdapter implements SyncAdapter {
  readonly id = 'http';
  private readonly fetcher: Fetcher;

  constructor(private readonly options: HttpSyncOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async isAvailable(): Promise<boolean> {
    return (await this.options.tokens.get()) !== null;
  }

  /**
   * Runs an authenticated call, refreshing once on a 401. A refresh the server
   * refuses clears the stored tokens: the session is genuinely gone, and
   * holding dead credentials just produces a loop.
   */
  private async authed<T>(path: string, init: RequestInit): Promise<T> {
    const tokens = await this.options.tokens.get();
    if (!tokens) throw new SyncHttpError(401, 'unauthorized', 'Not signed in.');

    const call = (accessToken: string) =>
      request<T>(
        this.options.baseUrl,
        path,
        { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${accessToken}` } },
        this.fetcher,
      );

    try {
      return await call(tokens.accessToken);
    } catch (error) {
      if (!(error instanceof SyncHttpError) || error.status !== 401) throw error;
      const refreshed = await this.refresh(tokens);
      return call(refreshed.accessToken);
    }
  }

  private async refresh(stale: Tokens): Promise<Tokens> {
    // Another call may have rotated while this one was waiting on its 401. Its
    // result is already stored; spending the old token again would look
    // exactly like a replay and end the session.
    const current = await this.options.tokens.get();
    if (!current) throw new SyncHttpError(401, 'unauthorized', 'Not signed in.');
    if (current.refreshToken !== stale.refreshToken) return current;

    let pending = inflightRefreshes.get(stale.refreshToken);
    if (!pending) {
      pending = this.exchange(stale.refreshToken).finally(() =>
        inflightRefreshes.delete(stale.refreshToken),
      );
      inflightRefreshes.set(stale.refreshToken, pending);
    }
    return pending;
  }

  private async exchange(refreshToken: string): Promise<Tokens> {
    let refreshed: RefreshResponse;
    try {
      refreshed = await request<RefreshResponse>(
        this.options.baseUrl,
        '/auth/refresh',
        { method: 'POST', body: JSON.stringify({ refreshToken }) },
        this.fetcher,
      );
    } catch (error) {
      // Only the server saying no ends the session. An offline laptop or a
      // captive portal is not a reason to sign someone out.
      if (error instanceof SyncHttpError && error.status === 401) {
        await this.options.tokens.clear();
        throw new SyncHttpError(
          401,
          'unauthorized',
          error.message && !error.message.startsWith('Sync request failed')
            ? error.message
            : 'Your session expired. Sign in again.',
        );
      }
      throw error;
    }

    const next = { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken };
    await this.options.tokens.set(next);
    return next;
  }

  // --- The account itself ---------------------------------------------------

  async devices(): Promise<DeviceSummary[]> {
    return (await this.authed<DevicesResponse>('/account/devices', { method: 'GET' })).devices;
  }

  async revokeDevice(id: string): Promise<void> {
    await this.authed<void>(`/account/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async changePassword(body: ChangePasswordRequest): Promise<void> {
    await this.authed<void>('/account/password', { method: 'POST', body: JSON.stringify(body) });
  }

  async setRecovery(body: SetRecoveryRequest): Promise<void> {
    await this.authed<void>('/account/recovery', { method: 'PUT', body: JSON.stringify(body) });
  }

  async deleteAccount(body: DeleteAccountRequest): Promise<void> {
    await this.authed<void>('/account', { method: 'DELETE', body: JSON.stringify(body) });
  }

  // --- Records ----------------------------------------------------------------

  async pull(sinceServerRev: number): Promise<PullResult> {
    const body = await this.authed<PullResponse>(`/sync?since=${sinceServerRev}`, {
      method: 'GET',
    });
    return {
      records: body.records,
      serverRev: body.serverRev,
      hasMore: body.hasMore,
      ...(body.recovery ? { recovery: body.recovery } : {}),
    };
  }

  async push(records: RemoteRecord[], baseServerRev = 0): Promise<PushResult> {
    if (records.length === 0) {
      const head = await this.pull(baseServerRev);
      return { accepted: [], conflicts: [], serverRev: head.serverRev };
    }

    const body = await this.authed<PushResponse>('/sync', {
      method: 'POST',
      body: JSON.stringify({ records, baseServerRev } satisfies PushRequest),
    });

    return {
      accepted: body.accepted,
      conflicts: body.conflicts,
      serverRev: body.serverRev,
      ...(body.rejectedForLimit ? { rejectedForLimit: body.rejectedForLimit } : {}),
    };
  }
}
