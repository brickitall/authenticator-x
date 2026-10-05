import { useState } from 'react';
import { liveItems } from '@authx/core';
import { useActivityPing, useTheme, useVault } from '../ui/hooks.js';
import { ArchiveIcon, CloudLockIcon, InfoIcon, KeyIcon, Logo, ShieldIcon } from '../ui/icons.js';
import { Spinner, cx } from '../ui/primitives.js';
import { RecoveryScreen } from '../popup/RecoveryScreen.js';
import { SetupScreen } from '../popup/SetupScreen.js';
import { UnlockScreen } from '../popup/UnlockScreen.js';
import { AccountPanel } from './AccountPanel.js';
import { AccountsPanel } from './AccountsPanel.js';
import { BackupPanel } from './BackupPanel.js';
import { SecurityPanel } from './SecurityPanel.js';
import { AboutPanel } from './AboutPanel.js';
import { takeScanRequest } from '../lib/deep-link.js';
import { SourceLink } from '../ui/SourceLink.js';
import { LICENCE, SECURITY_MODEL_URL } from '../lib/links.js';

/** Sent here by the popup to scan, which it cannot ask for the camera to do. */
const OPENED_TO_SCAN = takeScanRequest();

const TABS = [
  { id: 'accounts', label: 'Accounts', Icon: KeyIcon },
  { id: 'backup', label: 'Backup & import', Icon: ArchiveIcon },
  { id: 'security', label: 'Security', Icon: ShieldIcon },
  { id: 'account', label: 'Account & sync', Icon: CloudLockIcon },
  { id: 'about', label: 'About', Icon: InfoIcon },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function App() {
  const { status, data, protection, error, refresh, mutate, setStatus } = useVault();
  const [tab, setTab] = useState<TabId>('accounts');
  const [recovering, setRecovering] = useState(false);
  // State rather than the constant: the Accounts panel remounts every time
  // its tab is chosen, and would otherwise open the camera again each time.
  const [scanPending, setScanPending] = useState(OPENED_TO_SCAN);

  useTheme(data?.settings.theme);
  useActivityPing(status?.state === 'unlocked');

  if (error) {
    return (
      <Shell>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </Shell>
    );
  }

  if (!status) {
    return (
      <Shell>
        <Spinner className="h-5 w-5 text-zinc-400" />
      </Shell>
    );
  }

  if (status.state !== 'unlocked' || !data || !protection) {
    const hasRecovery = status.state === 'uninitialized' ? false : status.hasRecovery;
    const authenticated = (next: typeof status) => {
      setRecovering(false);
      setStatus(next);
    };

    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
        <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800">
          {recovering ? (
            <RecoveryScreen onRecovered={authenticated} onCancel={() => setRecovering(false)} />
          ) : status.state === 'uninitialized' ? (
            <SetupScreen onCreated={authenticated} />
          ) : (
            <UnlockScreen
              onUnlocked={authenticated}
              hasRecovery={hasRecovery}
              onUseRecoveryKey={() => setRecovering(true)}
            />
          )}
        </div>
      </div>
    );
  }

  const count = liveItems(data).length;
  const signedIn = Boolean(data.account.email) && data.account.plan === 'synced';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
    <div className="mx-auto flex w-full max-w-5xl gap-10 px-6 py-10">
      <aside className="sticky top-10 flex h-[calc(100vh-5rem)] w-56 shrink-0 flex-col">
        <div className="mb-7 flex items-center gap-3 px-2">
          <Logo className="h-8 w-8" />
          <div className="leading-tight">
            <p className="text-[14.5px] font-semibold tracking-[-0.01em]">Authenticator X</p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              {count} {count === 1 ? 'account' : 'accounts'}
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cx(
                'flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-colors',
                tab === id
                  ? 'bg-white text-brand-700 shadow-[0_1px_2px_rgba(16,24,40,0.06)] ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:text-brand-300 dark:ring-zinc-800'
                  : 'text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-200',
              )}
            >
              <Icon
                className={cx(
                  'h-[18px] w-[18px] shrink-0',
                  tab === id ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-400 dark:text-zinc-500',
                )}
              />
              {label}
            </button>
          ))}
        </nav>

        {/* What someone deciding whether to trust this with their codes wants
            to know, where they can always see it. */}
        <div className="mt-auto rounded-2xl border border-zinc-200/80 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="flex items-center gap-2 text-[12.5px] font-semibold">
            <ShieldIcon className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" />
            Encrypted on this device
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            AES-256-GCM before anything is stored or synced. The code is public under {LICENCE}.
          </p>
          <div className="mt-2.5 flex flex-col gap-1.5 text-[12px]">
            <SourceLink>Open source on GitHub</SourceLink>
            <SourceLink href={SECURITY_MODEL_URL}>Security model</SourceLink>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-16">
        {tab === 'accounts' && (
          <AccountsPanel
            data={data}
            mutate={mutate}
            scanOnOpen={scanPending}
            onScanOpened={() => setScanPending(false)}
          />
        )}
        {tab === 'backup' && <BackupPanel data={data} mutate={mutate} protectionMode={protection} />}
        {tab === 'security' && (
          <SecurityPanel
            data={data}
            mutate={mutate}
            refresh={refresh}
            protectionMode={protection}
            hasRecovery={status.hasRecovery}
            signedIn={signedIn}
            accountRecovery={status.accountRecovery}
          />
        )}
        {tab === 'account' && (
          <AccountPanel
            data={data}
            protectionMode={protection}
            accountRecovery={status.accountRecovery}
            onOpenSecurity={() => setTab('security')}
            onOpenAccounts={() => setTab('accounts')}
          />
        )}
        {tab === 'about' && <AboutPanel />}
      </main>
    </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Logo className="h-9 w-9 opacity-90" />
      {children}
    </div>
  );
}
