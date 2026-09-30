import { useState, type FormEvent } from 'react';
import { send, type VaultStatus } from '../lib/messaging.js';
import { Logo } from '../ui/icons.js';
import { Button, Field, Spinner } from '../ui/primitives.js';

export function UnlockScreen({
  onUnlocked,
  hasRecovery,
  onUseRecoveryKey,
}: {
  onUnlocked: (status: VaultStatus) => void;
  hasRecovery: boolean;
  onUseRecoveryKey: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // Guarded here rather than by disabling the button: a disabled default
    // button stops the browser submitting the form on Enter, and Enter is how
    // most people unlock.
    if (!password || busy) return;

    setBusy(true);
    setError(null);
    try {
      onUnlocked(await send({ type: 'vault/unlock', password }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-[480px] flex-col justify-center gap-6 p-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <Logo className="h-12 w-12" />
        <div>
          <h1 className="text-[17px] font-semibold">Authenticator X</h1>
          <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
            Enter your master password to unlock.
          </p>
        </div>
      </header>

      <Field
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Master password"
        error={error}
      />

      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? <Spinner /> : null}
        Unlock
      </Button>

      {hasRecovery && (
        // The way back for someone locked out of their vault, so it has to
        // look like something to press before the pointer finds it — not
        // grey text that only admits to being a link on hover.
        <button
          type="button"
          onClick={onUseRecoveryKey}
          className="group text-[12px] text-zinc-500 dark:text-zinc-400"
        >
          Forgotten it?{' '}
          <span className="font-medium text-brand-600 underline-offset-2 group-hover:underline dark:text-brand-400">
            Use your recovery key
          </span>
        </button>
      )}
    </form>
  );
}
