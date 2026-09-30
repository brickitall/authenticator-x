import { useState } from 'react';
import { liveItems } from '@authx/core';
import { useActivityPing, useTheme, useVault } from '../ui/hooks.js';
import { Logo } from '../ui/icons.js';
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

/** Sent here by the popup to scan, which it cannot ask for the camera to do. */
const OPENED_TO_SCAN = takeScanRequest();

const TABS = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'backup', label: 'Backup & import' },
  { id: 'security', label: 'Security' },
  { id: 'account', label: 'Account & sync' },
  { id: 'about', label: 'About' },
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
    <div className="mx-auto flex min-h-screen w-full max-w-5xl gap-8 px-6 py-10">
      <aside className="w-52 shrink-0">
        <div className="mb-8 flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <div className="leading-tight">
            <p className="text-[14px] font-semibold">Authenticator X</p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              {count} {count === 1 ? 'account' : 'accounts'}
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cx(
                'rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
                tab === entry.id
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900',
              )}
            >
              {entry.label}
            </button>
          ))}
        </nav>
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
        {tab === 'backup' && <BackupPanel data={data} mutate={mutate} />}
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
