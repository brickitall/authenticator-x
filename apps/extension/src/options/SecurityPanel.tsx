import { useMemo, useState } from 'react';
import { accountPasswordProblem, scorePassword, type ProtectionMode, type VaultData } from '@authx/core';
import { send, type Mutate } from '../lib/messaging.js';
import { Button, Callout, Field, Spinner } from '../ui/primitives.js';
import { RecoveryKeySheet } from './RecoveryKeySheet.js';
import { Row, Section, Select, Toggle } from './Section.js';

export function SecurityPanel({
  data,
  mutate,
  refresh,
  protectionMode,
  hasRecovery,
  signedIn,
  accountRecovery,
}: {
  data: VaultData;
  mutate: Mutate;
  refresh: () => Promise<void>;
  protectionMode: ProtectionMode;
  hasRecovery: boolean;
  signedIn: boolean;
  accountRecovery: boolean;
}) {
  const { settings } = data;
  const passwordProtected = protectionMode === 'passphrase';

  return (
    <>
      <Section title="Locking">
        <Row
          label="Lock after inactivity"
          description={
            passwordProtected
              ? 'The decryption key is dropped from memory. Your master password is needed again.'
              : 'Only applies with a master password — a device-key vault has nothing to unlock.'
          }
          control={
            passwordProtected ? (
              <Select
                label="Auto-lock delay"
                value={settings.autoLockMinutes}
                onChange={(value) =>
                  void mutate({ op: 'settings/update', patch: { autoLockMinutes: value } })
                }
                options={[
                  { value: 1, label: '1 minute' },
                  { value: 5, label: '5 minutes' },
                  { value: 15, label: '15 minutes' },
                  { value: 60, label: '1 hour' },
                  { value: 0, label: 'Never' },
                ]}
              />
            ) : (
              <span className="text-[13px] text-zinc-400 dark:text-zinc-500">Not applicable</span>
            )
          }
        />
        <Row
          label="Blur codes until hovered"
          description="Keeps codes off the screen during screen sharing."
          control={
            <Toggle
              label="Blur codes"
              checked={settings.hideCodes}
              onChange={(value) => void mutate({ op: 'settings/update', patch: { hideCodes: value } })}
            />
          }
        />
      </Section>

      <Section
        title="Autofill"
        description="When enabled, opening the popup on a page checks whether it has a one-time-code field, so the right account can be filled in one click. The extension only ever looks at the tab you opened it on."
      >
        <Row
          label="Offer to fill codes on web pages"
          control={
            <Toggle
              label="Autofill"
              checked={settings.autofillEnabled}
              onChange={(value) =>
                void mutate({ op: 'settings/update', patch: { autofillEnabled: value } })
              }
            />
          }
        />
      </Section>

      <Section title="Appearance">
        <Row
          label="Theme"
          control={
            <Select
              label="Theme"
              value={settings.theme}
              onChange={(value) => void mutate({ op: 'settings/update', patch: { theme: value } })}
              options={[
                { value: 'system', label: 'Match system' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          }
        />
        <Row
          label="Sort accounts by"
          control={
            <Select
              label="Sort order"
              value={settings.sortBy}
              onChange={(value) => void mutate({ op: 'settings/update', patch: { sortBy: value } })}
              options={[
                { value: 'added', label: 'Order added' },
                { value: 'name', label: 'Name' },
              ]}
            />
          }
        />
      </Section>

      <ProtectionSection mode={protectionMode} signedIn={signedIn} />
      <RecoverySection
        mode={protectionMode}
        hasRecovery={hasRecovery}
        signedIn={signedIn}
        accountRecovery={accountRecovery}
      />
      <DangerZone onReset={refresh} />
    </>
  );
}

/**
 * Switching protection mode, and changing the password within passphrase mode.
 * Both go through the same `vault/setProtection` call, which re-wraps the data
 * key without touching a byte of the encrypted payload.
 *
 * Signed in, there is no free choice of password: a vault opens either with
 * the device key or with the account password. So "adding" a password means
 * locking with the account's, and changing it changes the account's.
 */
function ProtectionSection({ mode, signedIn }: { mode: ProtectionMode; signedIn: boolean }) {
  const [intent, setIntent] = useState<'idle' | 'set' | 'change' | 'remove'>('idle');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);

  // Locking a signed-in device-key vault takes the existing account password:
  // nothing new to choose, so nothing to confirm or score.
  const usesAccountPassword = signedIn && intent === 'set';
  const strength = useMemo(() => scorePassword(next), [next]);
  // A new password on a signed-in vault is a new account password, and has to
  // be strong enough to protect a copy that lives on a server.
  const tooWeak =
    signedIn && intent === 'change' && next.length > 0 ? accountPasswordProblem(next) : null;
  const needsCurrent = mode === 'passphrase';
  const needsNext = intent === 'set' || intent === 'change';
  const ready =
    (!needsCurrent || current.length > 0) &&
    (!needsNext ||
      (usesAccountPassword ? next.length > 0 : next.length >= 8 && next === confirm && !tooWeak));

  function reset() {
    setIntent('idle');
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
      await send({
        type: 'vault/setProtection',
        next: needsNext ? { mode: 'passphrase', password: next } : { mode: 'device' },
        ...(needsCurrent ? { currentPassword: current } : {}),
      });
      reset();
      setMessage({
        tone: 'info',
        text:
          intent === 'remove'
            ? signedIn
              ? 'This device now opens without a password. Your account password has not changed.'
              : 'Master password removed. This vault now unlocks automatically on this device.'
            : intent === 'set'
              ? signedIn
                ? 'This device now locks with your account password.'
                : 'Master password set. You will be asked for it after the vault locks.'
              : signedIn
                ? 'Password changed, for this vault and your account. Your other devices will ask you to sign in again with it.'
                : 'Master password changed.',
      });
    } catch (cause) {
      setMessage({ tone: 'danger', text: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="How this vault is protected"
      description={
        mode === 'device'
          ? 'A key held by this browser unlocks the vault automatically. Nothing to type, and no script can read the key — but it is not hardware-backed, so it will not stop malware running as you on this machine.'
          : 'A key derived from your master password unlocks the vault. This is the stronger option: a copy of this browser profile is useless without the password.'
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                mode === 'passphrase' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span className="text-[13px] font-medium">
              {mode === 'passphrase'
                ? signedIn
                  ? 'Locks with your account password'
                  : 'Master password'
                : 'Device key (no password)'}
            </span>
          </div>

          {intent === 'idle' && (
            <div className="flex gap-2">
              {mode === 'device' ? (
                <Button variant="primary" size="sm" onClick={() => setIntent('set')}>
                  {signedIn ? 'Lock with your account password' : 'Add a master password'}
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={() => setIntent('change')}>
                    Change password
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIntent('remove')}>
                    Remove
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {signedIn && intent === 'idle' && (
          <p className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {mode === 'passphrase'
              ? 'This is also your sync account’s password. Changing it here changes it there, and your other devices will ask you to sign in again.'
              : 'Your sync account has its own password, which this device does not ask for. You need it on a new device, and to change the account or its recovery key.'}
          </p>
        )}

        {message && <Callout tone={message.tone}>{message.text}</Callout>}

        {intent !== 'idle' && (
          <form onSubmit={submit} className="flex flex-col gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-900">
            {intent === 'remove' && (
              <Callout tone="warning">
                The vault stays encrypted, but it will unlock by itself whenever this browser profile
                is open. Anyone using this computer can then see your codes.
                {signedIn &&
                  ' Your account keeps its password — you will still need it on a new device.'}
              </Callout>
            )}

            {needsCurrent && (
              <Field
                label={signedIn ? 'Current password' : 'Current master password'}
                type="password"
                autoComplete="current-password"
                autoFocus
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
              />
            )}

            {usesAccountPassword ? (
              <Field
                label="Account password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={next}
                onChange={(event) => setNext(event.target.value)}
                hint="The password you use to sign in to sync. This device will ask for it after it locks."
              />
            ) : (
              needsNext && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    autoFocus={!needsCurrent}
                    value={next}
                    onChange={(event) => setNext(event.target.value)}
                    hint={
                      next
                        ? `Strength: ${strength.label}`
                        : signedIn
                          ? 'At least 12 characters with a mix, or four or five unrelated words.'
                          : 'At least 8 characters.'
                    }
                    error={tooWeak}
                  />
                  <Field
                    label="Confirm new password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    error={confirm && confirm !== next ? 'Passwords do not match.' : null}
                  />
                </div>
              )
            )}

            <div className="flex gap-2">
              <Button
                type="submit"
                variant={intent === 'remove' ? 'danger' : 'primary'}
                disabled={!ready || busy}
              >
                {busy ? <Spinner /> : null}
                {intent === 'remove'
                  ? 'Remove password'
                  : intent === 'set'
                    ? usesAccountPassword
                      ? 'Lock with it'
                      : 'Set password'
                    : 'Change password'}
              </Button>
              <Button onClick={reset}>Cancel</Button>
            </div>
          </form>
        )}
      </div>
    </Section>
  );
}

function DangerZone({ onReset }: { onReset: () => Promise<void> }) {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const armed = confirmation === 'DELETE';

  return (
    <Section
      title="Delete this vault"
      description="Removes every account and the encrypted vault from this device. There is no undo, and no copy anywhere else."
    >
      <div className="flex flex-col gap-4 p-4">
        <Callout tone="danger">
          Make sure you still have another way into every account first — a backup file, recovery
          codes, or the same accounts on your phone.
        </Callout>
        <Field
          label="Type DELETE to confirm"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <div>
          <Button
            variant="danger"
            disabled={!armed || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await send({ type: 'vault/reset' });
                await onReset();
              } finally {
                setBusy(false);
                setConfirmation('');
              }
            }}
          >
            {busy ? <Spinner /> : null} Delete everything
          </Button>
        </div>
      </div>
    </Section>
  );
}

/**
 * The recovery kit: a second wrapping of the same data key under a key the user
 * keeps on paper. It is the only thing standing between a forgotten password
 * and a permanently unopenable vault, so the section says that outright rather
 * than filing it under "advanced".
 *
 * Signed in, the kit is also a way to reset the account, so issuing or removing
 * one asks for the account password — someone at an unlocked vault holds
 * everything else it would take.
 */
function RecoverySection({
  mode,
  hasRecovery,
  signedIn,
  accountRecovery,
}: {
  mode: ProtectionMode;
  hasRecovery: boolean;
  signedIn: boolean;
  accountRecovery: boolean;
}) {
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<'issue' | 'remove' | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  function close() {
    setAsking(null);
    setPassword('');
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const issue = () =>
    run(async () => {
      const { recoveryKey } = await send({
        type: 'vault/createRecoveryKit',
        ...(signedIn ? { password } : {}),
      });
      setIssued(recoveryKey);
    });

  const remove = () =>
    run(async () => {
      await send({ type: 'vault/removeRecoveryKit', ...(signedIn ? { password } : {}) });
    });

  return (
    <Section
      title="Recovery key"
      description={
        signedIn
          ? 'Nobody can reset your password — not us, not Google. A recovery key is the only way back if you forget it: it opens this vault, your other devices, and your account on a new one.'
          : mode === 'passphrase'
            ? 'Nobody can reset your master password — not us, not Google. That is what stops anyone else opening your vault, and it is also why a recovery key is the only way back if you forget it.'
            : 'This vault unlocks with a key your browser holds. If that key goes — cleared browsing data, a new profile, a reinstall — a recovery key is the only thing that can still open it.'
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {error && <Callout tone="danger">{error}</Callout>}

        {issued ? (
          <RecoveryKeySheet recoveryKey={issued} onDone={() => setIssued(null)} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    hasRecovery && (!signedIn || accountRecovery) ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span className="text-[13px] font-medium">
                  {!hasRecovery
                    ? 'No recovery key yet'
                    : signedIn && !accountRecovery
                      ? 'Opens this vault, but not your account'
                      : 'A recovery key has been issued'}
                </span>
              </div>
              {asking === null && (
                <div className="flex gap-2">
                  <Button
                    variant={hasRecovery ? 'secondary' : 'primary'}
                    disabled={busy}
                    onClick={() => (signedIn ? setAsking('issue') : void issue())}
                  >
                    {busy ? <Spinner /> : null}
                    {hasRecovery ? 'Issue a new one' : 'Create a recovery key'}
                  </Button>
                  {hasRecovery && (
                    <Button variant="ghost" onClick={() => setAsking('remove')}>
                      Remove
                    </Button>
                  )}
                </div>
              )}
            </div>

            {hasRecovery && signedIn && !accountRecovery && (
              // Issued before signing up. Its key was shown once and kept
              // nowhere, so it cannot be uploaded after the fact.
              <Callout tone="warning">
                This key was issued before you signed in, so your account does not have it. It still
                opens this vault here, but not on a new device. Issue a new one to cover both.
              </Callout>
            )}

            {hasRecovery && asking === null && (
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                Issuing a new key makes the previous one stop working
                {signedIn ? ', here and on your other devices' : ''}, so an old printed sheet is safe
                to throw away once you have replaced it.
              </p>
            )}

            {!hasRecovery && asking === null && (
              // The loss to warn about depends on the mode, as the description
              // above already knows: a device-key vault has no password to
              // forget, and telling its owner they might forget one points
              // them at the wrong risk.
              <Callout tone="warning">
                {signedIn || mode === 'passphrase'
                  ? 'Without one, forgetting your password means every account in this vault is gone for good.'
                  : 'Without one, losing the key this browser holds means every account in this vault is gone for good.'}{' '}
                There is no support request that can undo it.
              </Callout>
            )}

            {asking !== null && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void (asking === 'issue' ? issue() : remove());
                }}
                className="flex flex-col gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-900"
              >
                {asking === 'remove' && (
                  <Callout tone="danger">
                    Removing it leaves your password as the only way in
                    {signedIn ? ' — on this device, your other devices and your account' : ''}.
                  </Callout>
                )}
                {signedIn && (
                  <Field
                    label="Account password"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    hint="A recovery key can reset your account, so changing it takes your password."
                  />
                )}
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant={asking === 'remove' ? 'danger' : 'primary'}
                    disabled={busy || (signedIn && password.length === 0)}
                  >
                    {busy ? <Spinner /> : null}
                    {asking === 'remove' ? 'Remove the recovery key' : 'Create the key'}
                  </Button>
                  <Button onClick={close}>Cancel</Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </Section>
  );
}
