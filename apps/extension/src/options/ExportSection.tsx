import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  buildOtpUri,
  encodeMigrationUris,
  exportAegisJson,
  exportBitwardenJson,
  exportEncryptedBackup,
  exportPlainUris,
  itemTitle,
  type ProtectionMode,
  type VaultData,
  type VaultItem,
} from '@authx/core';
import { send } from '../lib/messaging.js';
import { Button, Callout, Field, Spinner, cx } from '../ui/primitives.js';
import { BrandMark } from '../ui/BrandMark.js';
import { QrIcon } from '../ui/icons.js';
import { QrCode } from '../ui/QrCode.js';
import { DESTINATIONS, type Destination, type Method } from './destinations.js';
import { Section } from './Section.js';

export function download(filename: string, contents: string | Blob, mime: string) {
  const url = URL.createObjectURL(typeof contents === 'string' ? new Blob([contents], { type: mime }) : contents);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/**
 * Getting accounts out: chosen ones or all, encrypted for keeping, or readable
 * for moving to another app — by Google Authenticator's transfer codes, a page
 * of QR codes to print or scan one by one, or a file other apps import.
 */
export function ExportSection({
  items,
  data,
  protectionMode,
}: {
  items: VaultItem[];
  data: VaultData;
  protectionMode: ProtectionMode;
}) {
  // 'all' rather than every id: an account added while this page is open is
  // in an export of everything, as the count above the button says.
  const [selection, setSelection] = useState<'all' | Set<string>>('all');
  const chosen = selection === 'all' ? items : items.filter((item) => selection.has(item.id));

  return (
    <>
      <AccountPicker items={items} groups={data.groups} chosen={chosen} onChange={setSelection} />
      <EncryptedBackup chosen={chosen} data={data} />
      <MoveToAnotherApp chosen={chosen} data={data} protectionMode={protectionMode} />
    </>
  );
}

function AccountPicker({
  items,
  groups,
  chosen,
  onChange,
}: {
  items: VaultItem[];
  groups: VaultData['groups'];
  chosen: VaultItem[];
  onChange: (next: 'all' | Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = new Set(chosen.map((item) => item.id));
  const usedGroups = groups.filter(
    (group) => group.deletedAt === null && items.some((item) => item.groupId === group.id),
  );
  const all = chosen.length === items.length;

  return (
    <Section
      title="What to export"
      description={
        all
          ? `All ${items.length} ${items.length === 1 ? 'account' : 'accounts'}.`
          : `${chosen.length} of ${items.length} chosen.`
      }
      action={
        <Button size="sm" onClick={() => setOpen((value) => !value)}>
          {open ? 'Done' : 'Choose…'}
        </Button>
      }
    >
      {open && (
        <div className="p-4">
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Chip active={all} onClick={() => onChange('all')}>
              All
            </Chip>
            <Chip active={chosen.length === 0} onClick={() => onChange(new Set())}>
              None
            </Chip>
            {usedGroups.map((group) => {
              const members = items.filter((item) => item.groupId === group.id).map((item) => item.id);
              const only = !all && members.length === selected.size && members.every((id) => selected.has(id));
              return (
                <Chip key={group.id} active={only} onClick={() => onChange(new Set(members))}>
                  {group.name}
                </Chip>
              );
            })}
          </div>
          <ul className="max-h-72 overflow-y-auto rounded-xl border border-zinc-200 scrollarea dark:border-zinc-800">
            {items.map((item) => (
              <li key={item.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/80">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      onChange(next);
                    }}
                    className="h-4 w-4 accent-brand-600"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{itemTitle(item)}</span>
                  {item.issuer && item.label && (
                    <span className="max-w-[45%] truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                      {item.label}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'h-7 rounded-full border px-3 text-[12px] font-medium transition-colors',
        active
          ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-300'
          : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300',
      )}
    >
      {children}
    </button>
  );
}

function EncryptedBackup({ chosen, data }: { chosen: VaultItem[]; data: VaultData }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = password.length >= 8 && password === confirm && chosen.length > 0;

  async function exportEncrypted() {
    setBusy(true);
    setError(null);
    try {
      const backup = await exportEncryptedBackup(chosen, data.groups, password);
      download(`authenticator-x-${stamp()}.authx`, JSON.stringify(backup, null, 2), 'application/json');
      setPassword('');
      setConfirm('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Encrypted backup"
      description="A file locked with a password you choose here. Keep a copy somewhere safe — if this device dies, this file is how you get your accounts back."
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Backup password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint="At least 8 characters. Can differ from your master password."
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            error={confirm && confirm !== password ? 'Passwords do not match.' : null}
          />
        </div>
        {error && <Callout tone="danger">{error}</Callout>}
        <div>
          <Button variant="primary" disabled={!ready || busy} onClick={exportEncrypted}>
            {busy ? <Spinner /> : null}
            Download encrypted backup ({chosen.length})
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** How long readable exports stay open after the gate, before it closes again. */
const OPEN_FOR_MS = 5 * 60_000;

/**
 * Everything readable — transfer codes, printed codes, plain files — sits
 * behind one gate: the warning, a box to tick, and with a master password, the
 * password again. Holding an unlocked vault is not the same as being the
 * person who should walk away with every secret in it at once.
 */
function MoveToAnotherApp({
  chosen,
  data,
  protectionMode,
}: {
  chosen: VaultItem[];
  data: VaultData;
  protectionMode: ProtectionMode;
}) {
  const [openUntil, setOpenUntil] = useState<number | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'transfer' | 'one-by-one' | 'print' | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [, tick] = useState(0);
  const needsPassword = protectionMode === 'passphrase';
  const open = openUntil !== null && Date.now() < openUntil;

  useEffect(() => {
    if (openUntil === null) return;
    const timer = setInterval(() => {
      if (Date.now() >= openUntil) {
        setOpenUntil(null);
        setView(null);
      }
      tick((value) => value + 1);
    }, 5_000);
    return () => clearInterval(timer);
  }, [openUntil]);

  /** Moving through codes is use: it keeps the readable exports open. */
  const touch = () => setOpenUntil(Date.now() + OPEN_FOR_MS);

  function saveFile(format: 'aegis' | 'bitwarden' | 'text') {
    touch();
    if (format === 'aegis') {
      download(`authenticator-x-aegis-${stamp()}.json`, exportAegisJson(chosen, data.groups), 'application/json');
    } else if (format === 'bitwarden') {
      download(`authenticator-x-bitwarden-${stamp()}.json`, exportBitwardenJson(chosen, data.groups), 'application/json');
    } else {
      download(`authenticator-x-${stamp()}.txt`, exportPlainUris(chosen), 'text/plain');
    }
  }

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      if (needsPassword) await send({ type: 'vault/confirmPassword', password });
      setOpenUntil(Date.now() + OPEN_FOR_MS);
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Move to another app"
      description="Readable exports, for moving to another authenticator or keeping on paper. Unlike the backup above, none of them is encrypted."
    >
      {!open ? (
        <div className="flex flex-col gap-3 p-4">
          <Callout tone="danger">
            These hold your 2FA secrets in the clear. Anyone who sees the codes or opens the files can make your
            codes for as long as the accounts exist. Delete files, and shred paper, once you are done.
          </Callout>
          <label className="flex items-start gap-2.5 text-[13px] text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-600"
            />
            I understand these are not encrypted.
          </label>
          {needsPassword && (
            <Field
              label="Master password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
          {error && <Callout tone="danger">{error}</Callout>}
          <div>
            <Button
              variant="danger"
              disabled={!understood || (needsPassword && !password) || busy || chosen.length === 0}
              onClick={() => void unlock()}
            >
              {busy ? <Spinner /> : null} Continue
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="p-4">
            <p id="destination-label" className="text-[13px] font-medium">
              Which app are you moving to?
            </p>
            <div role="radiogroup" aria-labelledby="destination-label" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DESTINATIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={destination?.id === option.id}
                  onClick={() => setDestination(option)}
                  className={cx(
                    'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium transition-colors',
                    destination?.id === option.id
                      ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-200'
                      : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900',
                  )}
                >
                  {option.brand ? (
                    <BrandMark issuer={option.brand} size={24} />
                  ) : (
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      <QrIcon className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="min-w-0 truncate">{option.name}</span>
                </button>
              ))}
            </div>
            {destination && (
              <DestinationPanel
                destination={destination}
                count={chosen.length}
                onMethod={(method) => {
                  touch();
                  if (method === 'transfer' || method === 'one-by-one') setView(method);
                  else saveFile(method);
                }}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800/80">
            <span className="mr-1 text-[12px] text-zinc-500 dark:text-zinc-400">Files and paper:</span>
            <Button size="sm" onClick={() => saveFile('aegis')}>
              Aegis .json
            </Button>
            <Button size="sm" onClick={() => saveFile('bitwarden')}>
              Bitwarden .json
            </Button>
            <Button size="sm" onClick={() => saveFile('text')}>
              otpauth .txt
            </Button>
            <Button size="sm" onClick={() => setView('print')}>
              Print sheet
            </Button>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-[12px] text-zinc-500 dark:border-zinc-800/80 dark:text-zinc-400">
            <span>
              {chosen.length} {chosen.length === 1 ? 'account' : 'accounts'}. Closes again{' '}
              {openUntil ? `in ${Math.max(1, Math.ceil((openUntil - Date.now()) / 60_000))} min` : 'soon'}.
            </span>
            <Button size="sm" variant="ghost" onClick={() => { setOpenUntil(null); setView(null); }}>
              Close now
            </Button>
          </div>
        </div>
      )}
      {open && view === 'transfer' && (
        <TransferCodes chosen={chosen} destination={destination ?? DESTINATIONS[0]!} onActivity={touch} onClose={() => setView(null)} />
      )}
      {open && view === 'one-by-one' && (
        <OneByOne chosen={chosen} destination={destination ?? OTHER} onActivity={touch} onClose={() => setView(null)} />
      )}
      {open && view === 'print' && <PrintSheet chosen={chosen} onClose={() => setView(null)} />}
    </Section>
  );
}

const OTHER = DESTINATIONS.find((option) => option.id === 'other')!;

const METHOD_LABEL: Record<Method, string> = {
  transfer: 'Show transfer codes',
  'one-by-one': 'Scan one by one',
  aegis: 'Download Aegis file',
  bitwarden: 'Download Bitwarden file',
  text: 'Download text file',
};

function DestinationPanel({
  destination,
  count,
  onMethod,
}: {
  destination: Destination;
  count: number;
  onMethod: (method: Method) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 animate-fade-in dark:border-zinc-800 dark:bg-zinc-900/60"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-semibold">{destination.name}</p>
        <span
          className={cx(
            'rounded-full px-2 py-0.5 text-[11px] font-medium',
            destination.allAtOnce
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'bg-zinc-200/80 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
          )}
        >
          {destination.allAtOnce ? 'All at once' : 'One at a time'}
        </span>
      </div>
      <p className="mt-1.5 max-w-[68ch] text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        {destination.steps}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {destination.methods.map((method, index) => (
          <Button key={method} size="sm" variant={index === 0 ? 'primary' : 'secondary'} onClick={() => onMethod(method)}>
            {METHOD_LABEL[method]}
            {method === 'one-by-one' ? ` (${count})` : ''}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** A full-screen layer over the settings page, closed by its button or Escape. */
function Overlay({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="export-sheet fixed inset-0 z-50 overflow-y-auto bg-white text-zinc-900 animate-fade-in dark:bg-zinc-950 dark:text-zinc-50"
    >
      {children}
    </div>,
    document.body,
  );
}

function TransferCodes({
  chosen,
  destination,
  onActivity,
  onClose,
}: {
  chosen: VaultItem[];
  destination: Destination;
  onActivity: () => void;
  onClose: () => void;
}) {
  // Once, not per render: every code of a transfer carries the same batch id,
  // and Google Authenticator refuses to finish a batch whose codes disagree.
  const [{ uris, skipped }] = useState(() => encodeMigrationUris(chosen));
  const [index, setIndex] = useState(0);

  return (
    <Overlay onClose={onClose} label={`Transfer codes for ${destination.name}`}>
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-10">
        <h2 className="text-[20px] font-semibold tracking-tight">
          {destination.id === 'other' ? 'Google Authenticator transfer codes' : `Move to ${destination.name}`}
        </h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {destination.steps}
        </p>

        {uris.length === 0 ? (
          <div className="mt-8 w-full">
            <Callout tone="warning">None of the chosen accounts can go to Google Authenticator.</Callout>
          </div>
        ) : (
          <>
            <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-700">
              <QrCode text={uris[index]!} size={360} label={`Transfer code ${index + 1} of ${uris.length}`} />
            </div>
            {uris.length > 1 ? (
              <div className="mt-5 flex items-center gap-3">
                <Button
                  size="sm"
                  disabled={index === 0}
                  onClick={() => {
                    onActivity();
                    setIndex((value) => value - 1);
                  }}
                >
                  Previous
                </Button>
                <span className="min-w-28 text-center text-[13px] font-medium">
                  Code {index + 1} of {uris.length}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={index === uris.length - 1}
                  onClick={() => {
                    onActivity();
                    setIndex((value) => value + 1);
                  }}
                >
                  Next
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-zinc-500 dark:text-zinc-400">
                One code holds all {chosen.length - skipped.length}{' '}
                {chosen.length - skipped.length === 1 ? 'account' : 'accounts'}.
              </p>
            )}
          </>
        )}

        {skipped.length > 0 && (
          <div className="mt-8 w-full">
            <Callout tone="warning">
              <p className="font-medium">Not included — move these one by one instead:</p>
              <ul className="mt-1 list-disc pl-5">
                {skipped.map(({ item, reason }) => (
                  <li key={item.id}>
                    {itemTitle(item)}: {reason}
                  </li>
                ))}
              </ul>
            </Callout>
          </div>
        )}

        <Button className="mt-8" onClick={onClose}>
          Done
        </Button>
      </div>
    </Overlay>
  );
}

/**
 * Setup codes one after another, for the apps that import nothing in bulk:
 * scan, Next, scan. One code on the screen at a time, large — a sheet of them
 * leaves the phone's camera to pick whichever it sees first.
 */
function OneByOne({
  chosen,
  destination,
  onActivity,
  onClose,
}: {
  chosen: VaultItem[];
  destination: Destination;
  onActivity: () => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const item = chosen[index]!;
  const last = index === chosen.length - 1;

  const move = (step: number) => {
    onActivity();
    setIndex((value) => Math.min(chosen.length - 1, Math.max(0, value + step)));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        move(1);
      } else if (event.key === 'ArrowLeft') {
        move(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Overlay onClose={onClose} label={`Setup codes for ${destination.name}, one at a time`}>
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-10">
        <h2 className="text-[20px] font-semibold tracking-tight">
          {destination.id === 'other' ? 'One account at a time' : `Move to ${destination.name}`}
        </h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {destination.steps}
        </p>

        <div className="mt-7 flex max-w-full items-center gap-3">
          <BrandMark issuer={item.issuer} label={item.label} domains={item.domains} icon={item.icon} size={36} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{itemTitle(item)}</p>
            {item.issuer && item.label && (
              <p className="truncate text-[12.5px] text-zinc-500 dark:text-zinc-400">{item.label}</p>
            )}
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-700">
          <QrCode text={buildOtpUri(item)} size={300} label={`Setup QR code for ${itemTitle(item)}`} />
        </div>

        <div
          className="mt-5 h-1 w-64 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={chosen.length}
          aria-valuenow={index + 1}
          aria-label="Accounts shown"
        >
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] dark:bg-brand-400"
            style={{ width: `${((index + 1) / chosen.length) * 100}%` }}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" disabled={index === 0} onClick={() => move(-1)}>
            Previous
          </Button>
          <span className="min-w-32 text-center text-[13px] font-medium">
            Account {index + 1} of {chosen.length}
          </span>
          {last ? (
            <Button size="sm" variant="primary" onClick={onClose}>
              Done
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => move(1)}>
              Next
            </Button>
          )}
        </div>
        <p className="mt-3 text-[11.5px] text-zinc-400 dark:text-zinc-500">→ or Space for the next one, Esc to stop</p>
      </div>
    </Overlay>
  );
}

/**
 * One setup code per account, laid out for paper. The browser's own print
 * dialog does the rest — print it, or save it as PDF — and print styles hide
 * everything but the sheet.
 */
function PrintSheet({ chosen, onClose }: { chosen: VaultItem[]; onClose: () => void }) {
  return (
    <Overlay onClose={onClose} label="QR codes to print or scan">
      <div className="mx-auto max-w-4xl px-6 py-8 print:max-w-none print:p-0">
        <div className="mb-6 flex items-start justify-between gap-6 print:mb-4">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight">Authenticator X — setup codes</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400 print:text-zinc-600">
              {chosen.length} {chosen.length === 1 ? 'account' : 'accounts'}, {new Date().toLocaleDateString()}. Each code sets up the
              account in any authenticator app. Anyone holding this can make your codes: keep it locked away.
            </p>
          </div>
          <div className="flex shrink-0 gap-2 print:hidden">
            <Button variant="primary" onClick={() => window.print()}>
              Print or save as PDF
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3 print:gap-3">
          {chosen.map((item) => (
            <li
              key={item.id}
              className="flex break-inside-avoid flex-col items-center rounded-2xl border border-zinc-200 p-4 text-center dark:border-zinc-800 print:border-zinc-300 print:p-3"
            >
              <QrCode text={buildOtpUri(item)} size={168} exact label={`Setup QR code for ${itemTitle(item)}`} />
              <p className="mt-2 w-full truncate text-[13px] font-semibold">{itemTitle(item)}</p>
              {item.issuer && item.label && (
                <p className="w-full truncate text-[11.5px] text-zinc-500 print:text-zinc-600">{item.label}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Overlay>
  );
}
