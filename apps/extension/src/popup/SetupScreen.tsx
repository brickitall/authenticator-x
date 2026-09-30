import { useMemo, useState, type FormEvent } from 'react';
import { scorePassword } from '@authx/core';
import { send, type ProtectionChoice, type VaultStatus } from '../lib/messaging.js';
import { ArrowLeftIcon, LockIcon, Logo } from '../ui/icons.js';
import { Button, Callout, Field, Spinner, cx } from '../ui/primitives.js';

const STRENGTH_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-lime-500',
  'bg-emerald-500',
];

export function SetupScreen({ onCreated }: { onCreated: (status: VaultStatus) => void }) {
  const [step, setStep] = useState<'choose' | 'password'>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(protection: ProtectionChoice) {
    setBusy(true);
    setError(null);
    try {
      onCreated(await send({ type: 'vault/create', protection }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  if (step === 'password') {
    return (
      <PasswordStep
        busy={busy}
        error={error}
        onBack={() => {
          setError(null);
          setStep('choose');
        }}
        onSubmit={(password) => create({ mode: 'passphrase', password })}
      />
    );
  }

  return (
    <div className="flex min-h-[480px] flex-col gap-5 p-6">
      <header className="flex flex-col items-center gap-3 pt-6 text-center">
        <Logo className="h-11 w-11" />
        <div>
          <h1 className="text-[17px] font-semibold">Authenticator X</h1>
          <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
            Choose how your 2FA secrets are protected.
          </p>
        </div>
      </header>

      {error && <Callout tone="danger">{error}</Callout>}

      <div className="flex flex-col gap-3">
        <ProtectionOption
          title="Just start"
          badge="Recommended"
          description="Your secrets are encrypted with a key this browser holds for you. Nothing to remember, nothing to type."
          footnote="Protects against anything that can run scripts or read your extension data. Not against malware running as you on this machine."
          busy={busy}
          onClick={() => create({ mode: 'device' })}
        />
        <ProtectionOption
          title="Add a master password"
          icon={<LockIcon />}
          description="One password unlocks the vault, then it locks itself again when you stop using it."
          footnote="The strongest option, and the one that will let your vault sync between devices without the server ever being able to read it."
          onClick={() => setStep('password')}
        />
      </div>

      <p className="mt-auto pt-2 text-center text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        Either way your accounts are encrypted with AES-256-GCM and stay on this device. You can
        switch modes later in Settings.
      </p>
    </div>
  );
}

function ProtectionOption({
  title,
  badge,
  icon,
  description,
  footnote,
  busy,
  onClick,
}: {
  title: string;
  badge?: string;
  icon?: React.ReactNode;
  description: string;
  footnote: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex flex-col gap-1.5 rounded-xl border border-zinc-200 p-3.5 text-left transition hover:border-brand-400 hover:bg-brand-50/40 disabled:opacity-60 dark:border-zinc-800 dark:hover:border-brand-500 dark:hover:bg-brand-500/5"
    >
      <span className="flex items-center gap-2">
        {busy ? (
          <Spinner className="h-[1em] w-[1em] text-brand-600" />
        ) : (
          icon && <span className="text-brand-600 dark:text-brand-400">{icon}</span>
        )}
        <span className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">{title}</span>
        {badge && (
          <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[13px] leading-snug text-zinc-600 dark:text-zinc-300">
        {description}
      </span>
      <span className="text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">{footnote}</span>
    </button>
  );
}

function PasswordStep({
  busy,
  error,
  onBack,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const strength = useMemo(() => scorePassword(password), [password]);
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= 8 && password === confirm;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    onSubmit(password);
  }

  return (
    <form onSubmit={submit} className="flex min-h-[480px] flex-col gap-5 p-6">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="rounded-lg p-1.5 text-base text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          <ArrowLeftIcon />
        </button>
        <h1 className="text-[15px] font-semibold">Set a master password</h1>
      </header>

      <Callout tone="warning">
        There is no way to reset this password. If you forget it, your accounts cannot be recovered —
        write it down somewhere safe.
      </Callout>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Field
            label="Master password"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
          />
          {password.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((index) => (
                  <span
                    key={index}
                    className={cx(
                      'h-1 flex-1 rounded-full transition-colors',
                      index <= strength.score
                        ? STRENGTH_COLORS[strength.score]
                        : 'bg-zinc-200 dark:bg-zinc-800',
                    )}
                  />
                ))}
              </div>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                Strength: {strength.label}
                {strength.warnings[0] ? ` — ${strength.warnings[0]}` : ''}
              </p>
            </div>
          )}
        </div>

        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={mismatch ? 'Passwords do not match.' : null}
        />
      </div>

      {error && <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-auto flex flex-col gap-2">
        <Button type="submit" variant="primary" disabled={!ready || busy}>
          {busy ? <Spinner /> : null}
          Create my vault
        </Button>
        <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500">
          AES-256-GCM · key derived with PBKDF2 (600,000 rounds)
        </p>
      </div>
    </form>
  );
}
