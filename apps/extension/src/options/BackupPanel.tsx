import { useRef, useState } from 'react';
import {
  assertUsableBackup,
  dedupeAgainst,
  importEncryptedBackup,
  importFromText,
  isBackupFile,
  liveItems,
  MAX_BACKUP_BYTES,
  type ProtectionMode,
  type VaultData,
  type VaultItem,
} from '@authx/core';
import type { Mutate } from '../lib/messaging.js';
import { planScan, startSession, type ScanSession } from '../lib/scan-session.js';
import { CameraScanner } from '../ui/CameraScanner.js';
import { decodeQrFromFile } from '../ui/qr.js';
import { CameraIcon } from '../ui/icons.js';
import { Button, Callout, Field, Spinner } from '../ui/primitives.js';
import { ScanProgress } from '../ui/ScanProgress.js';
import { ExportSection } from './ExportSection.js';
import { Section } from './Section.js';

export function BackupPanel({
  data,
  mutate,
  protectionMode,
}: {
  data: VaultData;
  mutate: Mutate;
  protectionMode: ProtectionMode;
}) {
  const items = liveItems(data);

  return (
    <>
      <ExportSection items={items} data={data} protectionMode={protectionMode} />
      <ImportSection existing={data.items} mutate={mutate} />
    </>
  );
}

interface PendingImport {
  fresh: VaultItem[];
  duplicates: VaultItem[];
  errors: { line: string; reason: string }[];
  /** Something the user should know before importing, that is not an error. */
  warning?: string;
}

/** The screenshots a QR can be read from; anything else chosen here is a backup or a text file. */
const QR_IMAGE = /^image\/(png|jpeg|webp|gif|bmp)$/;

/**
 * Screenshots that hold only some of an export's codes import only some of
 * its accounts. Nothing is wrong with what was read, so it is not an error —
 * but the user should know before pressing Import, not after wondering where
 * a dozen accounts went.
 */
function incompleteExport(scanned: ScanSession): string | undefined {
  const batch = scanned.batch;
  if (!batch || batch.seen.size >= batch.size) return undefined;
  const missing = batch.size - batch.seen.size;
  return `These screenshots hold ${batch.seen.size} of the ${batch.size} codes in this Google Authenticator export, so the accounts in the other ${missing === 1 ? 'one are' : `${missing} are`} not here. Choose every screenshot of the export together to bring them all across.`;
}

function ImportSection({
  existing,
  mutate,
}: {
  existing: VaultItem[];
  mutate: Mutate;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Read by every decoded frame, so a ref; `progress` mirrors it for rendering.
  const session = useRef<ScanSession>(startSession());
  const [progress, setProgress] = useState<ScanSession | null>(null);

  function stage(items: VaultItem[], errors: PendingImport['errors'], warning?: string) {
    const { fresh, duplicates } = dedupeAgainst(existing, items);
    setPending({ fresh, duplicates, errors, warning });
  }

  async function handleFiles(files: File[]) {
    setError(null);
    setPending(null);
    if (files.length === 0) return;

    if (files.every((file) => QR_IMAGE.test(file.type))) {
      await handleScreenshots(files);
    } else if (files.length === 1) {
      await handleFile(files[0]!);
    } else {
      setError('Choose one backup file, or one or more screenshots of QR codes.');
    }
  }

  /**
   * Screenshots of QR codes: the way round a camera that cannot read a full
   * Google Authenticator export, on a Chrome with no native reader. A clean
   * image of a code reads where a webcam's view of it will not.
   *
   * Several at once, because an export is several codes. They go through the
   * same session as the camera, so a screenshot chosen twice, or a second
   * export overlapping the first, is counted once — and so it can tell when
   * some of an export's codes were left out.
   */
  async function handleScreenshots(files: File[]) {
    setBusy(true);
    try {
      let scanned = startSession();
      const errors: PendingImport['errors'] = [];

      for (const file of files) {
        let text: string | null;
        try {
          text = await decodeQrFromFile(file);
        } catch (cause) {
          errors.push({ line: file.name, reason: cause instanceof Error ? cause.message : String(cause) });
          continue;
        }
        if (!text) {
          errors.push({ line: file.name, reason: 'No QR code found in this image.' });
          continue;
        }

        const plan = planScan(scanned, text, []);
        if (plan.kind === 'ignore') continue;
        scanned = plan.next;
        if (plan.kind === 'reject') errors.push({ line: file.name, reason: plan.reason });
      }

      if (scanned.stored.length === 0 && errors.length === 0) {
        setError('Those images did not contain any accounts.');
        return;
      }
      stage([...scanned.stored], errors, incompleteExport(scanned));
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {

    // Checked before reading: a file chosen here may have come from anyone,
    // and `file.text()` on a huge one pulls the lot into memory first.
    if (file.size > MAX_BACKUP_BYTES) {
      setError('That file is too large to be a backup.');
      return;
    }
    const contents = await file.text();

    try {
      const parsed: unknown = JSON.parse(contents);
      if (isBackupFile(parsed)) {
        // Reject a malformed one now, while there is still something useful to
        // say about it — not from inside the crypto after a password is typed.
        assertUsableBackup(parsed);
        setPendingFile(contents);
        return;
      }
    } catch (cause) {
      // A JSON file that is a backup but a bad one has something worth saying;
      // anything else is treated as a list of otpauth:// URIs.
      if (cause instanceof Error && !(cause instanceof SyntaxError)) {
        setError(cause.message);
        return;
      }
    }

    const result = importFromText(contents);
    if (result.items.length === 0 && result.errors.length === 0) {
      setError('That file did not contain any accounts.');
      return;
    }
    stage(result.items, result.errors);
  }

  async function decryptStagedFile() {
    if (!pendingFile) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await importEncryptedBackup(JSON.parse(pendingFile), backupPassword);
      stage(payload.items, []);
      setPendingFile(null);
      setBackupPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function startScan() {
    session.current = startSession();
    setProgress(null);
    setError(null);
    setPending(null);
    setScanning(true);
  }

  /**
   * One decoded frame. Unlike adding from the Accounts tab, nothing is stored
   * here: every account scanned is collected, and when the export is complete
   * they go to the same review as a file or pasted links, where the user
   * decides. That is what lets Cancel mean cancel.
   *
   * The session is asked to dedupe only against itself — repeats of a code in
   * view, the overlap of a second export. Accounts already in the vault are
   * left in, so the review can say how many it is skipping, as it does for a
   * file.
   */
  async function scanCamera(text: string): Promise<boolean> {
    const plan = planScan(session.current, text, []);
    if (plan.kind === 'ignore') return false;

    // Collecting cannot fail, so the plan is adopted at once — unlike storing,
    // where it waits for the write.
    session.current = plan.next;
    if (plan.kind === 'reject') {
      setError(plan.reason);
      return false;
    }
    setError(null);
    setProgress(plan.next);

    if (plan.finished) review(plan.next);
    return plan.finished;
  }

  /** Stop the camera and hand what was scanned to the ordinary import review. */
  function review(scanned: ScanSession) {
    setScanning(false);
    setProgress(null);
    stage([...scanned.stored], []);
  }

  function cancelScan() {
    setScanning(false);
    setProgress(null);
    setError(null);
  }

  async function confirmImport() {
    if (!pending || pending.fresh.length === 0) return;
    setBusy(true);
    try {
      await mutate({ op: 'items/add', items: pending.fresh });
      setPending(null);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Import"
      description="Bring accounts in from a backup file, from another authenticator's export — scanned with your camera or chosen as screenshots — or by pasting otpauth:// links."
    >
      <div className="flex flex-col gap-4 p-4">
        {error && <Callout tone="danger">{error}</Callout>}

        {scanning ? (
          <div className="flex max-w-md flex-col gap-3">
            {progress && <ScanProgress session={progress} storing={false} />}
            {progress && progress.added > 0 && (
              // An export whose last code will not read should not cost the
              // user the codes that did. A way out, not the next step — the
              // next step is showing the next code — so it does not shout.
              <Button onClick={() => review(session.current)}>
                Stop and review {progress.added}
              </Button>
            )}
            <CameraScanner
              onDecode={scanCamera}
              onCancel={cancelScan}
              compact={progress !== null}
              withoutNativeReader="Chrome on this computer has no built-in QR reader, so a large code — like a Google Authenticator export — often will not scan from a camera. If yours will not, screenshot each code on your phone and pick them all with Choose files."
            />
          </div>
        ) : pendingFile ? (
          <div className="flex flex-col gap-3">
            <Callout>This backup is encrypted. Enter the password it was created with.</Callout>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Field
                  label="Backup password"
                  type="password"
                  autoFocus
                  value={backupPassword}
                  onChange={(event) => setBackupPassword(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void decryptStagedFile()}
                />
              </div>
              <Button variant="primary" disabled={busy} onClick={decryptStagedFile}>
                {busy ? <Spinner /> : null} Open backup
              </Button>
              <Button
                onClick={() => {
                  setPendingFile(null);
                  setBackupPassword('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : pending ? (
          <div className="flex flex-col gap-3">
            {pending.warning && <Callout tone="warning">{pending.warning}</Callout>}
            <Callout tone={pending.fresh.length > 0 ? 'info' : 'warning'}>
              Found {pending.fresh.length} new{' '}
              {pending.fresh.length === 1 ? 'account' : 'accounts'}
              {pending.duplicates.length > 0 &&
                `, skipping ${pending.duplicates.length} already in your vault`}
              {pending.errors.length > 0 && `, and ${pending.errors.length} could not be read`}.
            </Callout>

            {pending.fresh.length > 0 && (
              <ul className="max-h-56 overflow-y-auto rounded-xl border border-zinc-200 text-[13px] scrollarea dark:border-zinc-800">
                {pending.fresh.map((item) => (
                  <li
                    key={item.id}
                    className="flex justify-between gap-4 border-b border-zinc-100 px-3 py-2 last:border-b-0 dark:border-zinc-900"
                  >
                    <span className="font-medium">{item.issuer || 'Untitled'}</span>
                    <span className="truncate text-zinc-500 dark:text-zinc-400">{item.label}</span>
                  </li>
                ))}
              </ul>
            )}

            {pending.errors.length > 0 && (
              <details className="text-[12px] text-zinc-500 dark:text-zinc-400">
                <summary className="cursor-pointer">Show the lines that failed</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {pending.errors.map((entry, index) => (
                    <li key={index}>
                      <code className="text-zinc-400">{entry.line}</code> — {entry.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={busy || pending.fresh.length === 0}
                onClick={confirmImport}
              >
                {busy ? <Spinner /> : null} Import {pending.fresh.length}
              </Button>
              <Button onClick={() => setPending(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button onClick={startScan}>
                <CameraIcon /> Scan with your camera
              </Button>
              <Button disabled={busy} onClick={() => fileInput.current?.click()}>
                {busy ? <Spinner /> : null} Choose files…
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".authx,.json,.txt,text/plain,application/json,image/png,image/jpeg,image/webp,image/gif,image/bmp"
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = '';
                  void handleFiles(files);
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="import-paste"
                className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300"
              >
                …or paste otpauth:// links, one per line
              </label>
              <textarea
                id="import-paste"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={4}
                spellCheck={false}
                placeholder="otpauth://totp/GitHub:you@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub"
                className="w-full rounded-xl border border-zinc-200 bg-white p-3 font-mono text-[12px] placeholder:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
              />
              <div>
                <Button
                  disabled={text.trim().length === 0}
                  onClick={() => {
                    const result = importFromText(text);
                    stage(result.items, result.errors);
                  }}
                >
                  Read links
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
