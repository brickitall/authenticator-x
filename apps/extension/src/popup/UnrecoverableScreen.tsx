import { useState } from 'react';
import { send } from '../lib/messaging.js';
import { Logo } from '../ui/icons.js';
import { Button, Callout, Spinner } from '../ui/primitives.js';

/**
 * Shown when a device-protected vault outlives the key that protected it —
 * cleared browsing data, a fresh profile, or a reinstall. There is genuinely
 * no way back in, so the screen says that outright instead of pretending.
 */
export function UnrecoverableScreen({
  onReset,
  hasRecovery,
  onUseRecoveryKey,
}: {
  onReset: () => Promise<void>;
  hasRecovery: boolean;
  onUseRecoveryKey: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  return (
    <div className="flex min-h-[480px] flex-col justify-center gap-5 p-7 text-center">
      <div className="flex flex-col items-center gap-3">
        <Logo className="h-11 w-11 opacity-60" />
        <h1 className="text-[16px] font-semibold">This vault can no longer be opened</h1>
      </div>

      <Callout tone="danger">
        Its encryption key lived in this browser profile and is gone — usually because browsing data
        was cleared, the extension was reinstalled, or this is a different profile. Without that key
        the stored accounts cannot be decrypted by anyone, including us.
      </Callout>

      {hasRecovery ? (
        <>
          <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            You issued a recovery key for this vault. That key wraps the same data, independently of
            the missing one — it will open everything.
          </p>
          <Button variant="primary" onClick={onUseRecoveryKey}>
            Use my recovery key
          </Button>
        </>
      ) : (
        <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          Start again and restore from a backup file if you have one. Otherwise you will need to set
          up two-factor authentication again on each site, using the recovery codes they gave you.
        </p>
      )}

      {armed ? (
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await send({ type: 'vault/reset' });
                await onReset();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner /> : null} Yes, erase and start over
          </Button>
          <Button variant="ghost" onClick={() => setArmed(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant={hasRecovery ? 'ghost' : 'primary'} onClick={() => setArmed(true)}>
          Start over
        </Button>
      )}
    </div>
  );
}
