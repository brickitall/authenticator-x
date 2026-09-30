import { useEffect, useMemo, useState } from 'react';
import {
  itemMatchesHost,
  itemTitle,
  liveItems,
  shouldWarnBeforeFilling,
  sectionItems,
  sortItems,
  type ProtectionMode,
  type VaultData,
  type VaultItem,
} from '@authx/core';
import { send, type FieldDetection, type Mutate, type TabContext } from '../lib/messaging.js';
import { useCodes, useCopy, useNow } from '../ui/hooks.js';
import { LockIcon, Logo, PlusIcon, SearchIcon, SettingsIcon } from '../ui/icons.js';
import { Button, Callout, cx } from '../ui/primitives.js';
import { AccountRow } from './AccountRow.js';
import { AddSheet } from './AddSheet.js';
import { SCAN_FRAGMENT } from '../lib/deep-link.js';

export function VaultScreen({
  data,
  protection,
  mutate,
  refresh,
}: {
  data: VaultData;
  protection: ProtectionMode;
  mutate: Mutate;
  refresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<TabContext | null>(null);
  const [fields, setFields] = useState<FieldDetection | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmFill, setConfirmFill] = useState<VaultItem | null>(null);

  const now = useNow();
  const { copiedId, copy } = useCopy();

  const all = useMemo(() => sortItems(liveItems(data), data.settings.sortBy), [data]);
  const codes = useCodes(all, now);

  useEffect(() => {
    void send({ type: 'tab/context' }).then(setTab);
  }, []);

  // Probing for OTP fields injects the content script, so it only happens when
  // autofill is switched on and only for the tab the user opened the popup on.
  useEffect(() => {
    if (!data.settings.autofillEnabled || !tab?.hostname) return;
    void send({ type: 'tab/detectFields' })
      .then(setFields)
      .catch(() => setFields(null));
  }, [data.settings.autofillEnabled, tab?.hostname]);

  const suggested = useMemo(
    () => (tab?.hostname ? all.filter((item) => itemMatchesHost(item, tab.hostname!)) : []),
    [all, tab?.hostname],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((item) =>
      `${item.issuer} ${item.label} ${item.note}`.toLowerCase().includes(needle),
    );
  }, [all, query]);

  const suggestedIds = new Set(suggested.map((item) => item.id));
  const rest = query ? filtered : filtered.filter((item) => !suggestedIds.has(item.id));
  // Searching flattens the groups: when someone is hunting for one account,
  // headings are in the way rather than helping.
  const sections = useMemo(
    () => (query ? [{ id: null, name: '', color: null, items: rest }] : sectionItems(data, rest)),
    [data, rest, query],
  );
  const canFill = Boolean(fields?.found) && data.settings.autofillEnabled;
  const sortedByName = data.settings.sortBy === 'name';
  // Shown where people look every day, not only in Settings: a vault signed in
  // to an account its owner does not recognise should be hard to miss.
  const syncedAs = data.account.plan === 'synced' ? data.account.email : null;

  async function fill(item: VaultItem, confirmed = false) {
    const code = codes[item.id];
    if (!code) return;

    if (!confirmed && shouldWarnBeforeFilling(item, tab?.hostname ?? null)) {
      setConfirmFill(item);
      return;
    }

    setConfirmFill(null);
    try {
      await send({ type: 'tab/fill', code });
      window.close();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function rowProps(item: VaultItem) {
    return {
      item,
      code: codes[item.id],
      now,
      hideCodes: data.settings.hideCodes,
      copied: copiedId === item.id,
      canFill,
      onCopy: () => {
        const code = codes[item.id];
        if (code) void copy(item.id, code);
      },
      onFill: () => void fill(item),
      onToggleFavorite: () =>
        void mutate({ op: 'items/update', id: item.id, patch: { favorite: !item.favorite } }),
      onAdvanceCounter: () => void mutate({ op: 'items/advanceCounter', id: item.id }),
    };
  }

  return (
    <div className="relative flex h-[520px] flex-col">
      <header className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-900">
        <Logo className="h-6 w-6 shrink-0" />
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[15px] text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search accounts"
            aria-label="Search accounts"
            className="h-8 w-full rounded-lg border border-transparent bg-zinc-100 pr-2 pl-8 text-[13px] placeholder:text-zinc-400 focus:border-brand-400 focus:bg-white dark:bg-zinc-900 dark:focus:bg-zinc-900"
          />
        </div>
        <IconButton label="Add account" onClick={() => setAdding(true)}>
          <PlusIcon />
        </IconButton>
        <IconButton label="Settings" onClick={() => void chrome.runtime.openOptionsPage()}>
          <SettingsIcon />
        </IconButton>
        {/* Nothing to lock when the key comes from the device itself. */}
        {protection === 'passphrase' && (
          <IconButton
            label="Lock now"
            onClick={async () => {
              await send({ type: 'vault/lock' });
              await refresh();
            }}
          >
            <LockIcon />
          </IconButton>
        )}
      </header>

      {(all.length > 1 || syncedAs) && (
        <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3.5 py-1.5 text-[11px] dark:border-zinc-900">
          <span className="min-w-0 truncate text-zinc-400 dark:text-zinc-500">
            {all.length} {all.length === 1 ? 'account' : 'accounts'}
            {syncedAs && (
              <span title={`Synced with ${syncedAs}`}>
                {' · synced as '}
                {syncedAs}
              </span>
            )}
          </span>
          {all.length > 1 && (
            <button
              type="button"
              onClick={() =>
                void mutate({
                  op: 'settings/update',
                  patch: { sortBy: sortedByName ? 'added' : 'name' },
                })
              }
              title="Change the order"
              className="font-medium text-zinc-500 hover:text-brand-600 dark:text-zinc-400 dark:hover:text-brand-400"
            >
              {sortedByName ? 'By name' : 'Order added'}
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2 scrollarea">
        {notice && (
          <div className="mb-2 px-1">
            <Callout tone="warning">{notice}</Callout>
          </div>
        )}

        {all.length === 0 ? (
          <EmptyState onAdd={() => setAdding(true)} />
        ) : filtered.length === 0 ? (
          <p className="px-3 py-10 text-center text-[13px] text-zinc-400">
            No accounts match “{query}”.
          </p>
        ) : (
          <>
            {!query && suggested.length > 0 && (
              <section className="mb-1">
                <SectionLabel>
                  For {tab?.hostname}
                  {canFill && (
                    <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                      code field detected
                    </span>
                  )}
                </SectionLabel>
                <ul>
                  {suggested.map((item) => (
                    <AccountRow key={item.id} {...rowProps(item)} />
                  ))}
                </ul>
              </section>
            )}

            {sections.map((section) => (
              <section key={section.id ?? 'ungrouped'}>
                {/* One unnamed heap of accounts needs no heading — and no empty
                    one either: emptying the text left the label's padding,
                    which printed as a blank band above the first account. */}
                {section.name &&
                  !(sections.length === 1 && suggested.length === 0 && section.id === null) && (
                    <SectionLabel>
                      {section.color && (
                        <span
                          className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
                          style={{ background: section.color }}
                        />
                      )}
                      {section.name}
                    </SectionLabel>
                  )}
                <ul>
                  {section.items.map((item) => (
                    <AccountRow key={item.id} {...rowProps(item)} />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>

      {confirmFill && (
        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-amber-200 bg-amber-50 p-3.5 animate-slide-up dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-[13px] leading-relaxed text-amber-900 dark:text-amber-200">
            <strong>{itemTitle(confirmFill)}</strong> is for{' '}
            <strong>{confirmFill.domains[0]}</strong>, but this page is{' '}
            <strong>{tab?.hostname}</strong>. If you did not expect that, the page may be
            impersonating the site.
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setConfirmFill(null)}>
              Don't fill
            </Button>
            <Button size="sm" variant="danger" onClick={() => void fill(confirmFill, true)}>
              Fill anyway
            </Button>
          </div>
        </div>
      )}

      {adding && (
        <AddSheet
          hostname={tab?.hostname ?? null}
          onAdd={(items) => mutate({ op: 'items/add', items })}
          onClose={() => setAdding(false)}
          existing={data.items}
          // openOptionsPage takes no fragment, and the fragment is what lands
          // the user on the scanner rather than on a list they then have to
          // navigate. Opening a new tab moves focus, which closes the popup
          // anyway; closing it here just does so without the flicker.
          onCameraElsewhere={() => {
            void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${SCAN_FRAGMENT}`) });
            window.close();
          }}
        />
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
      {children}
    </h2>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        'shrink-0 rounded-lg p-1.5 text-base text-zinc-500 transition',
        'hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100',
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-8 py-16 text-center">
      <Logo className="h-10 w-10 opacity-90" />
      <div>
        <h2 className="text-[15px] font-semibold">No accounts yet</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          Open the two-factor setup page on any site, then scan its QR code straight from the tab.
        </p>
      </div>
      <Button variant="primary" onClick={onAdd}>
        <PlusIcon /> Add your first account
      </Button>
    </div>
  );
}
