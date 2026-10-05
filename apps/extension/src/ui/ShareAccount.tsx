import { useEffect, useState } from 'react';
import { buildOtpUri, itemTitle, type VaultItem } from '@authx/core';
import { CheckIcon, CopyIcon, ImageIcon } from './icons.js';
import { Button, Callout } from './primitives.js';
import { QrCode, qrPng } from './QrCode.js';

/** How long a shown code stays on screen before it hides itself. */
const SHOWN_FOR_SECONDS = 60;

/**
 * One account, handed to another app: its setup QR code, which every
 * authenticator scans, and its `otpauth://` link. Shared by the popup and the
 * settings page.
 *
 * The code is the account's secret in a form a camera can take. So it is not
 * drawn until asked for, the warning comes first, and it hides itself again
 * after a minute — a screen left open, or a screen being shared, should not be
 * showing it.
 */
export function ShareAccount({ item, compact = false }: { item: VaultItem; compact?: boolean }) {
  const [shownUntil, setShownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const uri = buildOtpUri(item);
  const shown = shownUntil !== null && now < shownUntil;

  useEffect(() => {
    if (shownUntil === null) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [shownUntil]);

  useEffect(() => {
    if (shownUntil !== null && now >= shownUntil) {
      setShownUntil(null);
      setCopied(false);
    }
  }, [now, shownUntil]);

  async function copyLink() {
    await navigator.clipboard.writeText(uri);
    setCopied(true);
  }

  async function saveImage() {
    const url = URL.createObjectURL(await qrPng(uri));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(item.issuer || item.label || 'account').replace(/[^\p{L}\p{N}._-]+/gu, '-')}-2fa-qr.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  if (!shown) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          Scan it with Google Authenticator, Microsoft Authenticator, 1Password, Authy — any authenticator app —
          and it makes the same codes as this one.
        </p>
        <Callout tone="warning">
          Anyone who sees or photographs this code can make your codes for {itemTitle(item)}, for as long as the
          account exists. Show it only to the app you are moving to.
        </Callout>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => {
            setNow(Date.now());
            setShownUntil(Date.now() + SHOWN_FOR_SECONDS * 1000);
          }}
        >
          Show QR code
        </Button>
      </div>
    );
  }

  const secondsLeft = Math.max(0, Math.ceil(((shownUntil ?? 0) - now) / 1000));

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl border border-zinc-200 bg-white p-2 dark:border-zinc-700">
        <QrCode text={uri} size={compact ? 196 : 240} label={`Setup QR code for ${itemTitle(item)}`} />
      </div>
      <p className="text-center text-[12px] text-zinc-500 dark:text-zinc-400">
        Scan with the other app. Hides itself in {secondsLeft}s.
      </p>
      <div className="grid w-full grid-cols-2 gap-2">
        <Button size="sm" onClick={() => void copyLink()}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Link copied' : 'Copy setup link'}
        </Button>
        <Button size="sm" onClick={() => void saveImage()}>
          <ImageIcon />
          Save as image
        </Button>
      </div>
      {copied && (
        <p className="text-center text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-300">
          The link holds the secret too. Paste it into the other app, then copy something else over it.
        </p>
      )}
      <Button size="sm" variant="ghost" onClick={() => setShownUntil(null)}>
        Hide now
      </Button>
    </div>
  );
}
