import { useCallback, useEffect, useState } from 'react';
import {
  accountPasswordProblem,
  liveItems,
  type DeviceSummary,
  type VaultData,
} from '@authx/core';
import { SYNC_ENABLED } from '../lib/config.js';
import { send, type SignInResult, type SyncSummary } from '../lib/messaging.js';
import { Button, Callout, Field, Spinner } from '../ui/primitives.js';
import { RecoveryKeySheet } from './RecoveryKeySheet.js';
import { PasswordField } from '../ui/password.js';
import { Row, Section } from './Section.js';
import { FreshRecoveryKey, SignedInWelcome, SyncAuth, type BackupCount } from './SyncAuth.js';

export function AccountPanel({
  data,
  protectionMode,
  accountRecovery,
  onOpenSecurity,
  onOpenAccounts,
}: {
  data: VaultData;
  protectionMode: 'device' | 'passphrase';
  accountRecovery: boolean;
  onOpenSecurity: () => void;
  onOpenAccounts: () => void;
}) {
  const signedIn = Boolean(data.account.email) && data.account.plan === 'synced';
  // An address kept with a local plan means the server ended this device's
  // session; a deliberate sign-out forgets the address too.
  const signedOutElsewhere = !signedIn ? data.account.email : null;
  // Issued with the account itself. Held here, above the forms, because the
  // sign-up form is gone the moment the account exists.
  const [freshKey, setFreshKey] = useState<string | null>(null);
  // What the first sync after joining did, until the user has seen it.
  const [welcome, setWelcome] = useState<
    (Omit<SignInResult, 'status'> & { how: 'signIn' | 'recover' }) | null
  >(null);

  // Read from the vault itself, so the numbers are what this device now holds
  // rather than what one sync call happened to report.
  const live = liveItems(data);
  const backup: BackupCount = {
    total: live.length,
    pending: live.filter((item) => item.rev > item.syncedRev).length,
  };


  if (welcome && signedIn) {
    return (
      <SignedInWelcome
        how={welcome.how}
        email={data.account.email!}
        backup={backup}
        sync={welcome.sync}
        syncError={welcome.syncError}
        onRetry={async () => {
          try {
            const sync = await send({ type: 'account/sync' });
            setWelcome({ ...welcome, sync, syncError: null });
          } catch (cause) {
            setWelcome({
              ...welcome,
              syncError: cause instanceof Error ? cause.message : String(cause),
            });
          }
        }}
        onOpenAccounts={() => {
          setWelcome(null);
          onOpenAccounts();
        }}
        onDone={() => setWelcome(null)}
      />
    );
  }

  if (freshKey) {
    return (
      <FreshRecoveryKey backup={backup}>
        <RecoveryKeySheet recoveryKey={freshKey} onDone={() => setFreshKey(null)} wide />
      </FreshRecoveryKey>
    );
  }

  if (!signedIn && SYNC_ENABLED) {
    return (
      <div className="flex flex-col gap-6 pt-2">
        <SyncAuth
          protectionMode={protectionMode}
          signedOutElsewhere={signedOutElsewhere}
          onSignedUp={(recoveryKey) => setFreshKey(recoveryKey)}
          onSignedIn={({ sync, syncError }, how) => setWelcome({ how, sync, syncError })}
          introFooter={<LocalVaultFacts compact />}
        />
      </div>
    );
  }

  return (
    <>
      <Section
        title="Account"
        description="Signing in is what makes a vault portable: the account is where the encrypted copy lives and where other devices read it from. The server only ever sees ciphertext — it has no way to decrypt your accounts, and neither do we."
      >
        <div className="flex flex-col gap-4 p-4">
          {signedIn ? (
            <SignedIn data={data} accountRecovery={accountRecovery} onOpenSecurity={onOpenSecurity} />
          ) : (
            <NotAvailableYet />
          )}
        </div>
      </Section>

      {signedIn ? (
        <>
          <ChangePasswordSection protectionMode={protectionMode} />
          <DevicesSection />
          <DeleteAccountSection />
        </>
      ) : (
        <LocalVaultFacts />
      )}
    </>
  );
}

function LocalVaultFacts({ compact = false }: { compact?: boolean }) {
  const facts = (
    <dl className="divide-y divide-zinc-100 text-[13px] dark:divide-zinc-900">
      {/* Every line here states what *this build* does, read from the same
          flags that govern it. The table once printed a five-account cap
          the build did not enforce — shown beside a vault holding seven,
          and in a store screenshot, where it could only put people off a
          limit that did not exist. */}
      <Fact
        term="Accounts stored"
        detail="No limit"
      />
      <Fact term="Encryption" detail="AES-256-GCM" />
      <Fact term="Autofill and QR scanning" detail="Included" />
      <Fact term="Encrypted backup file" detail="Included" />
      <Fact
        term="Sync between devices"
        detail={SYNC_ENABLED ? 'Requires an account' : 'Not available yet'}
      />
    </dl>
  );

  // Under the sign-up card it keeps to the card's column: a full-width table
  // beneath a centred card reads as two unrelated pages.
  if (compact) {
    return (
      <div className="mx-auto w-full max-w-[400px]">
        <p className="mb-2 px-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
          Without an account, on this device
        </p>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800">{facts}</div>
      </div>
    );
  }

  return (
    <Section
      title="What a free local vault gets you"
      description="No account, no email, no server — and no limits on the parts that matter for security."
    >
      {facts}
    </Section>
  );
}

/** Only in a build made with sync switched off: the store's builds have it. */
function NotAvailableYet() {
  return (
    <div>
      <p className="text-[13px] font-medium">Local only — not signed in</p>
      <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
        This build was made without a sync server, so nothing you add here leaves your machine.
      </p>
    </div>
  );
}

function SignedIn({
  data,
  accountRecovery,
  onOpenSecurity,
}: {
  data: VaultData;
  accountRecovery: boolean;
  onOpenSecurity: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastSync = data.sync.lastSyncAt;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <div>
            <p className="text-[13px] font-medium">{data.account.email}</p>
            <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
              {lastSync
                ? `Last synced ${new Date(lastSync).toLocaleTimeString()}`
                : 'Not synced yet'}
              {' · syncs every 5 minutes'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={() => run(async () => setSummary(await send({ type: 'account/sync' })))}
          >
            {busy ? <Spinner /> : null} Sync now
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => run(() => send({ type: 'account/signOut' }))}>
            Sign out
          </Button>
        </div>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      {!accountRecovery && (
        // The one thing that can still go permanently wrong for a synced
        // vault, so it sits on this page and not only under Security.
        <Callout tone="warning">
          <p>
            Your account has no recovery key. If you forget your password and lose this device,
            nothing can get your accounts back — not us, not anyone.
          </p>
          <button
            type="button"
            onClick={onOpenSecurity}
            className="mt-1.5 font-medium underline underline-offset-2"
          >
            Create one under Security
          </button>
        </Callout>
      )}

      {summary && (
        <Callout tone={summary.rejectedRecords > 0 ? 'warning' : 'info'}>
          Sent {summary.pushed}, received {summary.pulled}
          {summary.conflicts > 0 && `, kept this device's version for ${summary.conflicts}`}
          {summary.rejectedForLimit > 0 &&
            `, ${summary.rejectedForLimit} did not fit — an account holds up to 10,000 — and stayed on this device`}
          .
          {/* A mass deletion arriving from the server should never be silent.
              Everything removed is restorable from Recently deleted. */}
          {summary.deleted > 0 && ` ${summary.deleted} account${summary.deleted === 1 ? ' was' : 's were'} removed on another device — you can restore ${summary.deleted === 1 ? 'it' : 'them'} under Accounts.`}
          {summary.rejectedRecords > 0 &&
            ` ${summary.rejectedRecords} record${summary.rejectedRecords === 1 ? '' : 's'} could not be decrypted and ${summary.rejectedRecords === 1 ? 'was' : 'were'} ignored. If this keeps happening, something is wrong with the stored copy.`}
        </Callout>
      )}

      <p className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        Signing out leaves this vault exactly as it is — still here, still encrypted, still opened the
        same way.
      </p>
    </div>
  );
}

/**
 * The account password, changeable from any signed-in device — including one
 * that opens without a password and so has nowhere else to change it. On a
 * vault that locks with the account password, this changes that too.
 */
function ChangePasswordSection({ protectionMode }: { protectionMode: 'device' | 'passphrase' }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);

  const tooWeak = next.length > 0 ? accountPasswordProblem(next) : null;
  const ready = current.length > 0 && next.length >= 8 && next === confirm && !tooWeak;

  function close() {
    setOpen(false);
    setCurrent('');
    setNext('');
    setConfirm('');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await send({ type: 'account/changePassword', currentPassword: current, nextPassword: next });
      close();
      setMessage({
        tone: 'info',
        text:
          protectionMode === 'passphrase'
            ? 'Password changed, for your account and this vault. Your other devices will ask you to sign in again with it.'
            : 'Account password changed. Your other devices will ask you to sign in again with it.',
      });
    } catch (cause) {
      setMessage({ tone: 'danger', text: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Password">
      {message && (
        <div className="px-4 pt-4">
          <Callout tone={message.tone}>{message.text}</Callout>
        </div>
      )}
      {!open ? (
        <Row
          label="Account password"
          description="What you sign in with on a new device. Nobody can reset it for you — keep your recovery key safe."
          control={
            <Button size="sm" onClick={() => setOpen(true)}>
              Change password…
            </Button>
          }
        />
      ) : (
        <form onSubmit={submit} className="flex max-w-md flex-col gap-4 p-4">
          <p className="text-[13px] font-medium">Change your account password</p>
          <PasswordField
            label="Current password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            autoFocus
          />
          <PasswordField
            label="New password"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            meter
            hint={tooWeak ? 'At least 12 characters with a mix, or four or five unrelated words.' : undefined}
          />
          <PasswordField
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            error={confirm && confirm !== next ? 'Passwords do not match.' : null}
          />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={!ready || busy}>
              {busy ? <Spinner /> : null} Change password
            </Button>
            <Button onClick={close}>Cancel</Button>
          </div>
        </form>
      )}
    </Section>
  );
}

/**
 * Every device signed in to the account, and a way to sign one out from here —
 * the answer to a lost or sold laptop that is still signed in.
 */
function DevicesSection() {
  const [devices, setDevices] = useState<DeviceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDevices(await send({ type: 'account/devices' }));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: string) {
    setBusy(id);
    try {
      await send({ type: 'account/revokeDevice', id });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section
      title="Signed-in devices"
      description="Sign out a device you no longer use or no longer have. It keeps whatever it had already synced, locked behind the same password, but receives nothing new."
    >
      <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
        {error && (
          <div className="p-4">
            <Callout tone="danger">{error}</Callout>
          </div>
        )}
        {!devices && !error && (
          <div className="p-4">
            <Spinner className="h-4 w-4 text-zinc-400" />
          </div>
        )}
        {devices?.map((device) => (
          <div key={device.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-[13px] font-medium">
                {device.name}
                {device.current && (
                  <span className="ml-2 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    This device
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                Signed in {new Date(device.createdAt).toLocaleDateString()} · last active{' '}
                {new Date(device.lastSeenAt).toLocaleString()}
              </p>
            </div>
            {!device.current && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void revoke(device.id)}
              >
                {busy === device.id ? <Spinner /> : null} Sign out
              </Button>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armed = password.length > 0 && confirmation === 'DELETE';

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await send({ type: 'account/delete', password });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  return (
    <Section title="Delete account">
      {!open ? (
        <Row
          label="Delete your account"
          description="Removes every encrypted copy the server holds. This device keeps its vault exactly as it is; other devices stop syncing."
          control={
            <Button
              size="sm"
              variant="ghost"
              // The ghost variant sets its own text colour; the destructive one
              // has to win, or the row reads like any other setting.
              className="text-red-600! hover:bg-red-50! hover:text-red-700! dark:text-red-400! dark:hover:bg-red-500/10!"
              onClick={() => setOpen(true)}
            >
              Delete account…
            </Button>
          }
        />
      ) : (
        <div className="flex max-w-md flex-col gap-4 p-4">
          <p className="text-[13px] font-medium">Delete your account</p>
          <Callout tone="danger">
            There is no undo. If this device is the only place your accounts still exist after this,
            keep it — or export a backup first.
          </Callout>
          <PasswordField
            label="Account password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            autoFocus
          />
          <Field
            label="Type DELETE to confirm"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {error && <Callout tone="danger">{error}</Callout>}
          <div className="flex gap-2">
            <Button variant="danger" disabled={!armed || busy} onClick={() => void remove()}>
              {busy ? <Spinner /> : null} Delete the account
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </Section>
  );
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="font-medium">{term}</dt>
      <dd className="text-right text-zinc-500 dark:text-zinc-400">{detail}</dd>
    </div>
  );
}
