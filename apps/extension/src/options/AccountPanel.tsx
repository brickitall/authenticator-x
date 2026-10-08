import { useCallback, useEffect, useState } from 'react';
import {
  accountPasswordProblem,
  liveItems,
  type DeviceSummary,
  type SignInProvider,
  type VaultData,
} from '@authx/core';
import { SYNC_ENABLED } from '../lib/config.js';
import { send, type SignInResult, type SyncSummary } from '../lib/messaging.js';
import { Button, Callout, Field, Spinner } from '../ui/primitives.js';
import { RecoveryKeySheet } from './RecoveryKeySheet.js';
import { PasswordField } from '../ui/password.js';
import { PageHeader, Row, Section } from './Section.js';
import { FreshRecoveryKey, SignedInWelcome, SyncAuth, type BackupCount } from './SyncAuth.js';
import { PairingRequests, ProviderMark, providerLabel } from './ProviderSignIn.js';
import { errorText, localise } from '../i18n/error-text.js';
import { useT } from '../i18n/react.js';

export function AccountPanel({
  data,
  protectionMode,
  accountRecovery,
  openOn,
  onOpenSecurity,
  onOpenAccounts,
}: {
  data: VaultData;
  protectionMode: 'device' | 'passphrase';
  accountRecovery: boolean;
  /** The email form the popup asked for, if it asked for one. */
  openOn?: 'signIn' | 'create' | null;
  onOpenSecurity: () => void;
  onOpenAccounts: () => void;
}) {
  const t = useT();
  const signedIn = Boolean(data.account.email) && data.account.plan === 'synced';
  // An address kept with a local plan means the server ended this device's
  // session; a deliberate sign-out forgets the address too.
  const signedOutElsewhere = !signedIn ? data.account.email : null;
  // Signed in with Google or GitHub: no account password exists to ask for.
  const provider = data.account.method === 'provider' ? data.account.provider : undefined;
  // Issued with the account itself. Held here, above the forms, because the
  // sign-up form is gone the moment the account exists.
  const [freshKey, setFreshKey] = useState<string | null>(null);
  // What the first sync after joining did, until the user has seen it.
  const [welcome, setWelcome] = useState<
    (Omit<SignInResult, 'status'> & { how: 'signIn' | 'recover' }) | null
  >(null);
  // A sign-in made in this tab with Google or GitHub, just back from the
  // provider: shown as what it came to, the way a sign-in on this page is.
  // Nothing is drawn until it is known, or the signed-out card would flash
  // before the welcome.
  const [returned, setReturned] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  useEffect(() => {
    if (!SYNC_ENABLED) {
      setReturned(true);
      return;
    }
    void send({ type: 'provider/outcome' })
      .then((outcome) => {
        if (outcome?.kind === 'signedIn') {
          setWelcome({ how: 'signIn', sync: outcome.sync, syncError: outcome.syncError });
        }
        if (outcome?.kind === 'error') setProviderError(localise(outcome.message, outcome.key, outcome.values));
      })
      .catch(() => undefined)
      .finally(() => setReturned(true));
  }, []);

  // Read from the vault itself, so the numbers are what this device now holds
  // rather than what one sync call happened to report.
  const live = liveItems(data);
  const backup: BackupCount = {
    total: live.length,
    pending: live.filter((item) => item.rev > item.syncedRev).length,
  };

  if (!returned) return null;

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
              syncError: errorText(cause),
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
      <FreshRecoveryKey backup={backup} provider={provider}>
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
          signedOutProvider={provider}
          initialStep={openOn ?? undefined}
          onSignedUp={(recoveryKey) => setFreshKey(recoveryKey)}
          onSignedIn={({ sync, syncError }, how) => setWelcome({ how, sync, syncError })}
          providerError={providerError}
          introFooter={<LocalVaultFacts compact />}
        />
      </div>
    );
  }

  return (
    <>
      <PageHeader title={t('nav.sync')} description={t('sync.description')} />
      {signedIn && provider && <PairingRequests provider={provider} />}
      <Section title={t('account.title')}>
        <div className="flex flex-col gap-4 p-4">
          {signedIn ? (
            <SignedIn
              data={data}
              provider={provider}
              accountRecovery={accountRecovery}
              onOpenSecurity={onOpenSecurity}
            />
          ) : (
            <NotAvailableYet />
          )}
        </div>
      </Section>

      {signedIn ? (
        <>
          {!provider && <ChangePasswordSection protectionMode={protectionMode} />}
          <DevicesSection />
          <DeleteAccountSection provider={provider} />
        </>
      ) : (
        <LocalVaultFacts />
      )}
    </>
  );
}

function LocalVaultFacts({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const facts = (
    <dl className="divide-y divide-zinc-100 text-[13px] dark:divide-zinc-900">
      {/* Every line here states what *this build* does, read from the same
          flags that govern it. The table once printed a five-account cap
          the build did not enforce — shown beside a vault holding seven,
          and in a store screenshot, where it could only put people off a
          limit that did not exist. */}
      <Fact term={t('facts.stored')} detail={t('facts.noLimit')} />
      <Fact term={t('facts.encryption')} detail="AES-256-GCM" />
      <Fact term={t('facts.autofill')} detail={t('facts.included')} />
      <Fact term={t('facts.backup')} detail={t('facts.included')} />
      <Fact term={t('facts.sync')} detail={SYNC_ENABLED ? t('facts.needsAccount') : t('facts.notYet')} />
    </dl>
  );

  // Under the sign-up card it keeps to the card's column: a full-width table
  // beneath a centred card reads as two unrelated pages.
  if (compact) {
    return (
      <div className="mx-auto w-full max-w-[400px]">
        <p className="mb-2 px-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
          {t('facts.withoutAccount')}
        </p>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800">{facts}</div>
      </div>
    );
  }

  return (
    <Section
      title={t('facts.title')}
      description={t('facts.description')}
    >
      {facts}
    </Section>
  );
}

/** Only in a build made with sync switched off: the store's builds have it. */
function NotAvailableYet() {
  const t = useT();
  return (
    <div>
      <p className="text-[13px] font-medium">{t('account.localOnly')}</p>
      <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">{t('account.noServer')}</p>
    </div>
  );
}

function SignedIn({
  data,
  provider,
  accountRecovery,
  onOpenSecurity,
}: {
  data: VaultData;
  provider: SignInProvider | undefined;
  accountRecovery: boolean;
  onOpenSecurity: () => void;
}) {
  const t = useT();
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
      setError(errorText(cause));
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
              {provider && (
                <>
                  <ProviderMark provider={provider} className="me-1 inline h-3 w-3 align-[-1px]" />
                  {t('account.signedInWith', { provider: providerLabel(provider) })}
                </>
              )}
              {lastSync
                ? t('account.lastSynced', { time: new Date(lastSync).toLocaleTimeString(t.locale) })
                : t('account.notSynced')}
              {t('account.every5')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={() => run(async () => setSummary(await send({ type: 'account/sync' })))}
          >
            {busy ? <Spinner /> : null} {t('account.syncNow')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => run(() => send({ type: 'account/signOut' }))}>
            {t('account.signOut')}
          </Button>
        </div>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      {!accountRecovery && (
        // The one thing that can still go permanently wrong for a synced
        // vault, so it sits on this page and not only under Security.
        <Callout tone="warning">
          <p>
            {provider
              ? t('account.noKitProvider', { provider: providerLabel(provider) })
              : t('account.noKit')}
          </p>
          <button
            type="button"
            onClick={onOpenSecurity}
            className="mt-1.5 font-medium underline underline-offset-2"
          >
            {t('account.createUnderSecurity')}
          </button>
        </Callout>
      )}

      {summary && (
        <Callout tone={summary.rejectedRecords > 0 ? 'warning' : 'info'}>
          {t('summary.sentReceived', { sent: summary.pushed, received: summary.pulled })}
          {summary.conflicts > 0 && t('summary.conflicts', { count: summary.conflicts })}
          {summary.rejectedForLimit > 0 && t('summary.overLimit', { count: summary.rejectedForLimit })}
          {t('summary.end')}
          {/* A mass deletion arriving from the server should never be silent.
              Everything removed is restorable from Recently deleted. */}
          {summary.deleted > 0 && t('summary.deleted', { count: summary.deleted })}
          {summary.rejectedRecords > 0 && t('summary.rejected', { count: summary.rejectedRecords })}
        </Callout>
      )}

      <p className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        {t('account.signOutNote')}
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
  const t = useT();
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
          protectionMode === 'passphrase' ? t('password.changedBoth') : t('password.changedAccount'),
      });
    } catch (cause) {
      setMessage({ tone: 'danger', text: errorText(cause) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={t('password.title')}>
      {message && (
        <div className="px-4 pt-4">
          <Callout tone={message.tone}>{message.text}</Callout>
        </div>
      )}
      {!open ? (
        <Row
          label={t('password.row')}
          description={t('password.rowDescription')}
          control={
            <Button size="sm" onClick={() => setOpen(true)}>
              {t('password.change')}
            </Button>
          }
        />
      ) : (
        <form onSubmit={submit} className="flex max-w-md flex-col gap-4 p-4">
          <p className="text-[13px] font-medium">{t('password.formTitle')}</p>
          <PasswordField
            label={t('protect.currentPassword')}
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            autoFocus
          />
          <PasswordField
            label={t('protect.newPassword')}
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            meter
            hint={tooWeak ? t('protect.hint12') : undefined}
          />
          <PasswordField
            label={t('protect.confirmNew')}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            error={confirm && confirm !== next ? t('common.passwordsDiffer') : null}
          />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={!ready || busy}>
              {busy ? <Spinner /> : null} {t('protect.changePassword')}
            </Button>
            <Button onClick={close}>{t('common.cancel')}</Button>
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
  const t = useT();
  const [devices, setDevices] = useState<DeviceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDevices(await send({ type: 'account/devices' }));
      setError(null);
    } catch (cause) {
      setError(errorText(cause));
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
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section
      title={t('devices.title')}
      description={t('devices.description')}
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
                  <span className="ms-2 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    {t('devices.this')}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                {t('devices.when', {
                  created: new Date(device.createdAt).toLocaleDateString(t.locale),
                  seen: new Date(device.lastSeenAt).toLocaleString(t.locale),
                })}
              </p>
            </div>
            {!device.current && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => void revoke(device.id)}
              >
                {busy === device.id ? <Spinner /> : null} {t('account.signOut')}
              </Button>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function DeleteAccountSection({ provider }: { provider: SignInProvider | undefined }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armed = (provider || password.length > 0) && confirmation === 'DELETE';

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      // A provider account proves it is its owner in the provider's window,
      // which the service worker opens.
      await send({ type: 'account/delete', ...(provider ? {} : { password }) });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  return (
    <Section tone="danger">
      {!open ? (
        <Row
          label={t('delete.row')}
          description={t('delete.rowDescription')}
          control={
            <Button
              size="sm"
              variant="ghost"
              // The ghost variant sets its own text colour; the destructive one
              // has to win, or the row reads like any other setting.
              className="text-red-600! hover:bg-red-50! hover:text-red-700! dark:text-red-400! dark:hover:bg-red-500/10!"
              onClick={() => setOpen(true)}
            >
              {t('delete.open')}
            </Button>
          }
        />
      ) : (
        <div className="flex max-w-md flex-col gap-4 p-4">
          <p className="text-[13px] font-medium">{t('delete.row')}</p>
          <Callout tone="danger">
            {t('delete.warning')}
          </Callout>
          {provider ? (
            <p className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t('delete.reauth', { provider: providerLabel(provider) })}
            </p>
          ) : (
            <PasswordField
              label={t('password.row')}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              autoFocus
            />
          )}
          <Field
            label={t('common.typeToConfirm', { word: 'DELETE' })}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {error && <Callout tone="danger">{error}</Callout>}
          <div className="flex gap-2">
            <Button variant="danger" disabled={!armed || busy} onClick={() => void remove()}>
              {busy ? <Spinner /> : null} {t('delete.confirm')}
            </Button>
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
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
      <dd className="text-end text-zinc-500 dark:text-zinc-400">{detail}</dd>
    </div>
  );
}
