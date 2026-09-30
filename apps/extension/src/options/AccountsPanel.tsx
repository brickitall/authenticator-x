import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildOtpUri,
  itemTitle,
  liveGroups,
  liveItems,
  sortItems,
  type Group,
  type VaultData,
  type VaultItem,
} from '@authx/core';
import type { Mutate } from '../lib/messaging.js';
import { AddSheet } from '../popup/AddSheet.js';
import { BrandMark } from '../ui/BrandMark.js';
import { ICON_ACCEPT, prepareIcon } from '../ui/icon-upload.js';
import { ServiceField } from '../ui/ServiceField.js';
import { PlusIcon, TrashIcon } from '../ui/icons.js';
import { Button, Callout, Field, cx } from '../ui/primitives.js';
import { GroupsPanel } from './GroupsPanel.js';
import { Section } from './Section.js';

export function AccountsPanel({
  data,
  mutate,
  scanOnOpen = false,
  onScanOpened,
}: {
  data: VaultData;
  mutate: Mutate;
  /** Open straight onto the camera: the popup sent the user here to grant it. */
  scanOnOpen?: boolean;
  onScanOpened?: () => void;
}) {
  const [adding, setAdding] = useState<'choose' | 'camera' | null>(scanOnOpen ? 'camera' : null);

  useEffect(() => {
    if (scanOnOpen) onScanOpened?.();
    // Mount only: the request is taken the first time this panel appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [editing, setEditing] = useState<VaultItem | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const items = useMemo(() => sortItems(liveItems(data), data.settings.sortBy), [data]);
  const deleted = useMemo(
    () => data.items.filter((item) => item.deletedAt !== null).sort((a, b) => b.deletedAt! - a.deletedAt!),
    [data.items],
  );

  return (
    <>
      <Section
        title="Accounts"
        description="Everything stored in this vault. Codes are generated on this device — nothing is sent anywhere."
        action={
          <Button variant="primary" onClick={() => setAdding('choose')}>
            <PlusIcon /> Add account
          </Button>
        }
      >
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-zinc-400">
            No accounts yet. Add one to get started.
          </p>
        ) : (
          <ul>
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3.5 border-b border-zinc-100 px-4 py-3 last:border-b-0 dark:border-zinc-900"
              >
                <BrandMark
                  issuer={item.issuer}
                  label={item.label}
                  domains={item.domains}
                  icon={item.icon}
                  size={30}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{itemTitle(item)}</p>
                  <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                    {/* With no issuer the title already is the label; saying
                        it again underneath is noise, as the popup knows. */}
                    {itemTitle(item) !== item.label && (
                      <>
                        {item.label || '—'}
                        <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">·</span>
                      </>
                    )}
                    {item.type.toUpperCase()} {item.digits} digits
                    {item.type === 'totp' ? ` · ${item.period}s` : ` · counter ${item.counter}`}
                    {item.algorithm !== 'SHA1' && ` · ${item.algorithm}`}
                  </p>
                </div>

                {item.domains.length > 0 && (
                  <span className="hidden shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500 sm:inline dark:bg-zinc-900 dark:text-zinc-400">
                    {item.domains[0]}
                    {item.domains.length > 1 && ` +${item.domains.length - 1}`}
                  </span>
                )}

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" onClick={() => setEditing(item)}>
                    Edit
                  </Button>
                  {confirmingDelete === item.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          await mutate({ op: 'items/delete', id: item.id });
                          setConfirmingDelete(null);
                        }}
                      >
                        Delete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${itemTitle(item)}`}
                      onClick={() => setConfirmingDelete(item.id)}
                    >
                      <TrashIcon />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {deleted.length > 0 && (
        <Section
          title="Recently deleted"
          description="Kept so other devices learn about the removal once sync is switched on. Restore anything you removed by mistake."
        >
          <ul>
            {deleted.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-4 border-b border-zinc-100 px-4 py-3 last:border-b-0 dark:border-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-zinc-500 line-through dark:text-zinc-400">
                    {itemTitle(item)}
                  </p>
                  <p className="text-[12px] text-zinc-400 dark:text-zinc-500">
                    Deleted {new Date(item.deletedAt!).toLocaleDateString()}
                  </p>
                </div>
                <Button size="sm" onClick={() => void mutate({ op: 'items/restore', id: item.id })}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <GroupsPanel data={data} mutate={mutate} />

      {adding && (
        <Modal onClose={() => setAdding(null)}>
          <AddSheet
            hostname={null}
            onAdd={(newItems) => mutate({ op: 'items/add', items: newItems })}
            onClose={() => setAdding(null)}
            initialMode={adding}
            // Options is a real tab, so it survives the camera permission
            // prompt stealing focus. The popup does not, and does not ask.
            camera
            pageScan={false}
            existing={data.items}
          />
        </Modal>
      )}

      {editing && (
        <Modal size="form" onClose={() => setEditing(null)}>
          <ItemEditor
            item={editing}
            groups={liveGroups(data)}
            onSave={async (patch) => {
              await mutate({ op: 'items/update', id: editing.id, patch });
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </>
  );
}

/**
 * The height is fixed, not fitted to content, because the add sheet lays itself
 * out absolutely inside it. So it comes in two sizes. The account editor needs
 * about 820px to show every field; at the add sheet's 560px it was cut off at
 * "Note", its Group and setup key below with no scrollbar on macOS to say so.
 * Its own size fits it whole on most screens, and a smaller screen still
 * scrolls.
 */
const MODAL_HEIGHT = {
  sheet: 'h-[min(640px,calc(100vh-3rem))]',
  form: 'h-[min(840px,calc(100vh-3rem))]',
} as const;

function Modal({
  children,
  onClose,
  size = 'sheet',
}: {
  children: React.ReactNode;
  onClose: () => void;
  size?: keyof typeof MODAL_HEIGHT;
}) {
  return (
    // In dark mode the dialog and the page behind it are nearly the same black,
    // so a light scrim and a shadow — which is what separates them in light
    // mode — separate nothing. A heavier scrim and a hairline ring do.
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6 animate-fade-in dark:bg-black/70"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cx(
          'relative w-[420px] overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-950 dark:ring-1 dark:ring-zinc-800',
          MODAL_HEIGHT[size],
        )}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

function ItemEditor({
  item,
  groups,
  onSave,
  onCancel,
}: {
  item: VaultItem;
  groups: Group[];
  onSave: (patch: Partial<VaultItem>) => Promise<void>;
  onCancel: () => void;
}) {
  const [issuer, setIssuer] = useState(item.issuer);
  const [label, setLabel] = useState(item.label);
  const [note, setNote] = useState(item.note);
  const [groupId, setGroupId] = useState(item.groupId);
  const [domains, setDomains] = useState(item.domains.join(', '));
  const [icon, setIcon] = useState(item.icon);
  const [iconError, setIconError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const pickIcon = useRef<HTMLInputElement>(null);

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          issuer: issuer.trim(),
          label: label.trim(),
          note: note.trim(),
          groupId,
          icon,
          domains: domains
            .split(',')
            .map((entry) => entry.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
            .filter(Boolean),
        });
      }}
    >
      <header className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-900">
        <h2 className="text-[15px] font-semibold">Edit account</h2>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 scrollarea">
        <div className="flex items-center gap-4">
          <BrandMark
            issuer={issuer}
            label={label}
            domains={item.domains}
            icon={icon}
            size={52}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">Picture</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {icon
                ? 'Your own image, used instead of the service mark.'
                : 'Choose one for services that have no logo here, or to tell two accounts apart.'}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => pickIcon.current?.click()}>
              {icon ? 'Replace' : 'Choose image…'}
            </Button>
            {icon && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIcon(null);
                  setIconError(null);
                }}
              >
                Remove
              </Button>
            )}
          </div>
          <input
            ref={pickIcon}
            type="file"
            accept={ICON_ACCEPT}
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setIconError(null);
              try {
                setIcon(await prepareIcon(file));
              } catch (cause) {
                setIconError(cause instanceof Error ? cause.message : String(cause));
              }
            }}
          />
        </div>

        {iconError && <Callout tone="danger">{iconError}</Callout>}

        <ServiceField
          value={issuer}
          onChange={(next) => setIssuer(next)}
          onPick={(brand) => {
            // Only fill the websites field if the user has not curated it.
            if (domains.trim().length === 0) setDomains(brand.domains.slice(0, 2).join(', '));
          }}
        />
        <Field label="Account" value={label} onChange={(event) => setLabel(event.target.value)} />
        <Field
          label="Websites"
          value={domains}
          onChange={(event) => setDomains(event.target.value)}
          placeholder="github.com, gist.github.com"
          hint="Comma-separated. Used to suggest this account on matching sites."
        />
        <Field label="Note" value={note} onChange={(event) => setNote(event.target.value)} />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="item-group"
            className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300"
          >
            Group
          </label>
          <select
            id="item-group"
            value={groupId ?? ''}
            onChange={(event) => setGroupId(event.target.value || null)}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <option value="">Ungrouped</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          {groups.length === 0 && (
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              Create a group under Accounts first.
            </p>
          )}
        </div>

        {/* "Setup key", the name the add sheet gives the same secret. This
            was once titled "Recovery key" — which is what Security calls the
            key that opens the whole vault. Two of the app's most sensitive
            things shared one name, and someone looking for the vault's could
            reveal this instead. */}
        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium">Setup key</p>
              <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                The secret behind this account. Anyone who sees it can generate your codes.
              </p>
            </div>
            <Button size="sm" onClick={() => setRevealed((value) => !value)}>
              {revealed ? 'Hide' : 'Reveal'}
            </Button>
          </div>
          {revealed && (
            <div className="mt-3 flex flex-col gap-2">
              <code className="block break-all rounded-lg bg-zinc-100 px-3 py-2 text-[12px] dark:bg-zinc-900">
                {item.secret}
              </code>
              <code className="block break-all rounded-lg bg-zinc-100 px-3 py-2 text-[11px] text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                {buildOtpUri(item)}
              </code>
              <Callout tone="warning">
                Only show this on a screen nobody else can see. Copying this link into another
                authenticator app is how you move the account to a phone.
              </Callout>
            </div>
          )}
        </div>
      </div>

      {/* The shadow casts upward over the fields: on a screen too short for
          the whole form, it is the only sign — macOS hides scrollbars until
          they move — that there is more above the buttons. */}
      <footer
        className={cx(
          'relative flex justify-end gap-2 border-t border-zinc-100 px-5 py-4',
          'shadow-[0_-10px_16px_-12px_rgba(0,0,0,0.18)] dark:border-zinc-900',
        )}
      >
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary">
          Save changes
        </Button>
      </footer>
    </form>
  );
}
