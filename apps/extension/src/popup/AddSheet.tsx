import { useEffect, useRef, useState } from 'react';
import {
  BAD_KEY_MESSAGE,
  importFromText,
  itemFromUri,
  itemMatchesHost,
  matchBrand,
  parseOtpUri,
  type BrandEntry,
  type VaultItem,
} from '@authx/core';
import { send } from '../lib/messaging.js';
import { planScan, startSession, type ScanSession } from '../lib/scan-session.js';
import { CameraScanner, cameraAlreadyGranted } from '../ui/CameraScanner.js';
import { ScanProgress, plural } from '../ui/ScanProgress.js';
import { decodeQrFromDataUrl, decodeQrFromFile } from '../ui/qr.js';
import { ServiceField } from '../ui/ServiceField.js';
import { ArrowLeftIcon, CameraIcon, ImageIcon, KeyIcon, KeyboardIcon, QrIcon } from '../ui/icons.js';
import { QuickCode } from '../ui/QuickCode.js';
import { Button, Callout, Field, Spinner } from '../ui/primitives.js';

type Mode = 'choose' | 'manual' | 'camera' | 'quick';

export function AddSheet({
  hostname,
  onAdd,
  onClose,
  camera = false,
  onCameraElsewhere,
  initialMode = 'choose',
  existing = [],
  pageScan = true,
}: {
  hostname: string | null;
  onAdd: (items: VaultItem[]) => Promise<void>;
  onClose: () => void;
  /**
   * The vault as the caller sees it, so a camera scan can skip accounts that
   * are already there. Scanning an export twice is easy to do by accident.
   */
  existing?: readonly VaultItem[];
  /**
   * This surface can ask for the camera. Chrome's permission prompt takes
   * focus, and a popup dies when it loses focus, taking the scanner and the
   * just-granted stream with it — so only a surface that lives in a tab may
   * pass true.
   */
  camera?: boolean;
  /**
   * For a surface that cannot ask: where to send the user so the camera can be
   * granted once. The grant belongs to the extension, not the page, so after
   * that this surface scans in place and never needs to send anyone again.
   */
  onCameraElsewhere?: () => void;
  initialMode?: 'choose' | 'camera';
  /**
   * Offer to read the QR on the page the extension was opened over. Only the
   * popup has such a page. Settings is itself the active tab, so the option
   * there photographed Settings and reported, every time, that it found no
   * code.
   */
  pageScan?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Read synchronously by every decoded frame, so a ref; `progress` mirrors it
  // for rendering. See scan-session.ts for what it tracks and why.
  const session = useRef<ScanSession>(startSession());
  const [progress, setProgress] = useState<ScanSession | null>(null);
  const [summary, setSummary] = useState<ScanSession | null>(null);

  // Whether the camera can be opened on this surface. A tab can always ask;
  // the popup only if it was granted before, which takes a look to find out.
  const handsOff = !camera && onCameraElsewhere !== undefined;
  const [cameraHere, setCameraHere] = useState(camera);
  useEffect(() => {
    if (!handsOff) return;
    let live = true;
    void cameraAlreadyGranted().then((granted) => {
      if (live) setCameraHere(granted);
    });
    return () => {
      live = false;
    };
  }, [handsOff]);

  /**
   * A QR scanned on a page came from that page's own enrolment screen, so the
   * site is worth recording. A hand-typed key might have been pasted anywhere,
   * so only record the site when the issuer plausibly belongs to it — otherwise
   * every account added while sitting on one tab ends up suggested there.
   */
  async function commit(items: VaultItem[], source: 'qr' | 'manual') {
    if (items.length === 0) throw new Error('No accounts found.');

    if (hostname) {
      for (const item of items) {
        if (item.domains.length > 0) continue;
        if (source === 'qr' || !item.issuer || itemMatchesHost(item, hostname)) {
          item.domains = [hostname];
        }
      }
    }

    await onAdd(items);
    onClose();
  }

  async function handleUri(uri: string) {
    const result = importFromText(uri);
    if (result.items.length === 0) {
      throw new Error(result.errors[0]?.reason ?? 'That QR code is not a 2FA setup code.');
    }
    await commit(result.items, 'qr');
  }

  async function scanPage() {
    setBusy('scan');
    setError(null);
    try {
      const { dataUrl } = await send({ type: 'tab/captureQr' });
      const decoded = await decodeQrFromDataUrl(dataUrl);
      if (!decoded) {
        throw new Error('No QR code found on the visible part of the page. Scroll it into view and try again.');
      }
      await handleUri(decoded);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  async function scanFile(file: File) {
    setBusy('file');
    setError(null);
    try {
      const decoded = await decodeQrFromFile(file);
      if (!decoded) throw new Error('No QR code found in that image.');
      await handleUri(decoded);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  /**
   * One decoded frame. Resolves true when the scanner should release the
   * camera: the session is complete, or something went wrong that another
   * frame will not fix.
   *
   * Unlike the page scan, this never records the current site on what it
   * stores. The code came from a phone held up to the camera, not from the
   * page the user happens to have open.
   */
  async function scanCamera(text: string): Promise<boolean> {
    const plan = planScan(session.current, text, existing);
    if (plan.kind === 'ignore') return false;

    if (plan.kind === 'reject') {
      // The user is still holding something up, and the next thing may be right.
      session.current = plan.next;
      setError(plan.reason);
      return false;
    }

    if (plan.items.length > 0) {
      try {
        await onAdd(plan.items);
      } catch (cause) {
        // Not adopting the plan leaves this payload unhandled, so the next
        // frame would try the same failing write again, several times a
        // second. Stop and say why instead.
        setError(cause instanceof Error ? cause.message : String(cause));
        return true;
      }
    }

    session.current = plan.next;
    setError(null);
    setProgress(plan.next);

    if (!plan.finished) return false;
    if (plan.next.batch === null) {
      onClose();
    } else {
      setSummary(plan.next);
    }
    return true;
  }

  function openCamera() {
    session.current = startSession();
    setProgress(null);
    setSummary(null);
    setError(null);
    setMode('camera');
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white animate-slide-up dark:bg-zinc-950">
      <header className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-900">
        <button
          type="button"
          onClick={() => (mode === 'choose' ? onClose() : setMode('choose'))}
          aria-label="Back"
          className="rounded-lg p-1.5 text-base text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          <ArrowLeftIcon />
        </button>
        <h2 className="text-[14px] font-semibold">
          {mode === 'manual'
            ? 'Enter a setup key'
            : mode === 'camera'
              ? 'Scan with your camera'
              : mode === 'quick'
                ? 'Get a code, without saving'
                : 'Add an account'}
        </h2>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 scrollarea">
        {error && <Callout tone="danger">{error}</Callout>}

        {mode === 'choose' ? (
          <>
            {pageScan && (
              <Choice
                icon={<QrIcon />}
                title="Scan the QR code on this page"
                description="Takes a screenshot of the visible tab and reads the code from it."
                busy={busy === 'scan'}
                onClick={scanPage}
              />
            )}
            {(camera || handsOff) && (
              <Choice
                icon={<CameraIcon />}
                title="Scan with your camera"
                description={
                  cameraHere
                    ? 'For a code on your phone — including a Google Authenticator export.'
                    : 'Opens Settings once so Chrome can ask to use the camera. After that it works right here.'
                }
                onClick={cameraHere ? openCamera : () => onCameraElsewhere?.()}
              />
            )}
            <Choice
              icon={<ImageIcon />}
              title="Upload a QR image"
              description="A screenshot or photo you saved earlier."
              busy={busy === 'file'}
              onClick={() => fileInput.current?.click()}
            />
            <Choice
              icon={<KeyboardIcon />}
              title="Enter a setup key manually"
              description="For sites that show a code instead of a QR."
              onClick={() => setMode('manual')}
            />
            <Choice
              icon={<KeyIcon />}
              title="Just get a code"
              description="Paste a key and see its code now. Nothing is saved."
              onClick={() => setMode('quick')}
            />

            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void scanFile(file);
              }}
            />

            <p className="mt-2 text-center text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
              Importing from Google Authenticator? Export your accounts there, then scan the code it
              shows with your camera or upload a screenshot of it. If it shows several, do each one.
            </p>
          </>
        ) : mode === 'camera' && summary ? (
          <ExportSummary session={summary} onDone={onClose} />
        ) : mode === 'camera' ? (
          <>
            {progress && <ScanProgress session={progress} storing />}
            <CameraScanner
              onDecode={scanCamera}
              // Anything already added stays added, so once there is some,
              // "Cancel" would promise an undo that does not happen.
              cancelLabel={progress && progress.added > 0 ? 'Done' : 'Cancel'}
              compact={progress !== null}
              withoutNativeReader="Chrome on this computer has no built-in QR reader, so a large code — like a Google Authenticator export — often will not scan from a camera. If yours will not, screenshot it on your phone and use Upload a QR image instead."
              // Only reachable if the camera looked granted and still would
              // not open here. Settings is a tab, and can ask again.
              fallback={
                handsOff && (
                  <Button variant="primary" onClick={() => onCameraElsewhere?.()}>
                    Open the scanner in Settings
                  </Button>
                )
              }
              onCancel={progress && progress.added > 0 ? onClose : () => setMode('choose')}
            />
          </>
        ) : mode === 'quick' ? (
          <QuickCode onSave={(params) => commit([itemFromUri(params)], 'manual')} />
        ) : (
          <ManualForm hostname={hostname} onSubmit={(items) => commit(items, 'manual')} />
        )}
      </div>
    </div>
  );
}

function Choice({
  icon,
  title,
  description,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 text-left transition hover:border-brand-400 hover:bg-brand-50/50 disabled:opacity-60 dark:border-zinc-800 dark:hover:border-brand-500 dark:hover:bg-brand-500/5"
    >
      <span className="mt-0.5 shrink-0 text-lg text-brand-600 dark:text-brand-400">
        {busy ? <Spinner className="h-[1em] w-[1em]" /> : icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-100">{title}</span>
        <span className="text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
          {description}
        </span>
      </span>
    </button>
  );
}

function ManualForm({
  hostname,
  onSubmit,
}: {
  hostname: string | null;
  onSubmit: (items: VaultItem[]) => Promise<void>;
}) {
  // Opened on the site being set up, the answer is usually already known.
  const suggested = hostname ? matchBrand('', [hostname]) : null;

  const [issuer, setIssuer] = useState(suggested?.name ?? '');
  const [domains, setDomains] = useState<string[]>(suggested?.domains.slice(0, 1) ?? []);
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(brand: BrandEntry) {
    // Taking a suggestion is worth more than the keystrokes: the domains it
    // carries are what let the popup offer this code on the right site later.
    setDomains(brand.domains.slice(0, 2));
  }

  const looksLikeUri = /^otpauth(-migration)?:\/\//i.test(secret.trim());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (looksLikeUri) {
        const result = importFromText(secret.trim());
        if (result.items.length === 0) {
          throw new Error(result.errors[0]?.reason ?? 'Could not read that URI.');
        }
        await onSubmit(result.items);
        return;
      }

      const cleaned = secret.replace(/\s+/g, '').toUpperCase();
      if (!cleaned) throw new Error('Enter the setup key from the site.');
      // Checked here rather than left to the URI parser below, whose complaint
      // — 'the "secret" parameter is not valid base32' — names two things
      // nobody copying a key off a website has heard of. Naming the alphabet
      // also catches the usual slip: a 0 or 1 typed for an O or I.
      if (!/^[A-Z2-7]+=*$/.test(cleaned)) {
        throw new Error(BAD_KEY_MESSAGE);
      }
      // Round-tripping through the URI parser gives us one validation path for
      // both entry methods.
      const parsed = parseOtpUri(
        `otpauth://totp/${encodeURIComponent(issuer || 'Account')}:${encodeURIComponent(
          label || 'me',
        )}?secret=${cleaned}${issuer ? `&issuer=${encodeURIComponent(issuer)}` : ''}`,
      );
      await onSubmit([itemFromUri(parsed, domains)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <ServiceField
        value={issuer}
        onChange={(next) => {
          setIssuer(next);
          // Typing over a chosen service drops what it brought with it.
          setDomains([]);
        }}
        onPick={pick}
        autoFocus
        hint={
          domains.length > 0
            ? `Codes for ${domains[0]} will be offered on that site.`
            : 'Start typing — known services fill in their own details.'
        }
      />
      <Field
        label="Account"
        placeholder="you@example.com"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <Field
        label="Setup key"
        placeholder="JBSWY3DPEHPK3PXP"
        value={secret}
        onChange={(event) => setSecret(event.target.value)}
        error={error}
        hint={
          looksLikeUri
            ? 'Detected an otpauth:// link — the service and account fields will be filled from it.'
            : 'Spaces and lower case are fine.'
        }
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
      />
      <Button type="submit" variant="primary" disabled={busy || secret.trim().length === 0}>
        {busy ? <Spinner /> : null}
        Add account
      </Button>
    </form>
  );
}

function ExportSummary({ session, onDone }: { session: ScanSession; onDone: () => void }) {
  const { batch, added, skipped } = session;
  return (
    <div className="flex flex-col gap-3">
      <Callout tone="info">
        {`All ${batch?.size ?? 1} codes scanned. ${plural(added, 'account', 'accounts')} added.`}
        {skipped > 0 &&
          ` ${plural(skipped, 'was', 'were')} already in your vault and ${skipped === 1 ? 'was' : 'were'} left as ${skipped === 1 ? 'it was' : 'they were'}.`}
      </Callout>
      <Button variant="primary" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
