import { SYNC_ENABLED } from '../lib/config.js';
import { ISSUES_URL, LICENCE, SECURITY_MODEL_URL, SOURCE_URL } from '../lib/links.js';
import { answered, storeListing, updateRating } from '../lib/rating.js';
import { BRAND_ICONS } from '../ui/brand-icons.js';
import { Logo, StarIcon } from '../ui/icons.js';
import { SourceLink } from '../ui/SourceLink.js';
import { Row, Section } from './Section.js';

const FACTS = [
  // Said of the build that is running: a release without sync has no server
  // at all, and one with sync must not claim that.
  SYNC_ENABLED
    ? {
        title: 'Your secrets are encrypted before anything leaves this device',
        body: 'Sync is optional. With it, only ciphertext reaches the server, and it has no way to decrypt it. Codes are always computed locally. There is no telemetry.',
      }
    : {
        title: 'Your secrets never leave this device',
        body: 'There is no server, no account and no telemetry in this version. Codes are computed locally from secrets stored in an encrypted vault.',
      },
  {
    title: 'Two ways to hold the key, both AES-256-GCM',
    body: 'Your accounts are encrypted with a data key that is itself wrapped. With a master password, the wrapping key comes from PBKDF2 at 600,000 rounds and exists only in memory while unlocked. Without one, it is a non-extractable key this browser holds — no script can read its bytes, though it is not hardware-backed.',
  },
  {
    title: 'No blanket site access',
    body: 'The extension asks for no host permissions. Reading a QR code from a page, or filling a code into one, uses activeTab — a grant Chrome hands out only for the tab you invoked the extension on.',
  },
  {
    title: 'Standards, not lock-in',
    body: 'RFC 6238 TOTP and RFC 4226 HOTP, with otpauth:// import and export. You can leave for another app at any time and take everything with you.',
  },
];

export function AboutPanel() {
  const version = chrome.runtime.getManifest().version;
  const listing = storeListing();

  return (
    <>
      <div className="mb-8 flex items-start gap-4">
        <Logo className="h-12 w-12" />
        <div>
          <h1 className="text-[18px] font-semibold">Authenticator X</h1>
          <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">Version {version}</p>
        </div>
      </div>

      <Section
        title="Open source"
        description="The code that runs on your machine is public, so how your codes are protected can be read rather than taken on trust. Every store release is built from a tagged commit you can rebuild and compare."
      >
        <Row
          label="Source code"
          description={SOURCE_URL.replace('https://', '')}
          control={<SourceLink className="text-[13px]">View on GitHub</SourceLink>}
        />
        <Row
          label="Security model"
          description="What the extension guarantees, including against the sync server."
          control={
            <SourceLink href={SECURITY_MODEL_URL} className="text-[13px]">
              Read it
            </SourceLink>
          }
        />
        <Row label="Licence" description="Free software: use it, study it, change it, share it." control={<span className="text-[13px] text-zinc-500 dark:text-zinc-400">{LICENCE}</span>} />
      </Section>

      <Section
        title="Help it reach people"
        description="No ads, no marketing budget: people find Authenticator X through its ratings and through each other."
      >
        <Row
          label="Rate Authenticator X"
          description={`On ${listing.store}. It takes a few seconds.`}
          control={
            <a
              href={listing.url}
              target="_blank"
              rel="noreferrer"
              // Rated from here, the popup has no reason to ask.
              onClick={() => void updateRating(answered)}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-zinc-500 hover:text-brand-600 dark:text-zinc-400 dark:hover:text-brand-400"
            >
              <StarIcon className="h-3.5 w-3.5 shrink-0" />
              Rate it
            </a>
          }
        />
        <Row
          label="Report a problem or suggest something"
          description="On GitHub, where anyone can read it. Never paste a setup key, a code or a backup there."
          control={
            <SourceLink href={`${ISSUES_URL}/new`} className="text-[13px]">
              Open an issue
            </SourceLink>
          }
        />
      </Section>

      <Section title="How this works">
        <dl className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {FACTS.map((fact) => (
            <div key={fact.title} className="px-4 py-3.5">
              <dt className="text-[13px] font-medium">{fact.title}</dt>
              <dd className="mt-1 max-w-prose text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                {fact.body}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title="Service logos"
        description="Marks are compiled into the extension, never fetched. Asking the network for a logo would tell whoever answered which services you have two-factor authentication on."
      >
        <div className="px-4 py-3.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
          {Object.keys(BRAND_ICONS).length} services have a real mark. Artwork from{' '}
          <a
            href="https://simpleicons.org"
            target="_blank"
            rel="noreferrer"
            className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
          >
            Simple Icons
          </a>{' '}
          (CC0 1.0), LobeHub Icons, SVG Logos, CoreUI Brands, Arcticons and{' '}
          <a
            href="https://fontawesome.com"
            target="_blank"
            rel="noreferrer"
            className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
          >
            Font Awesome Free
          </a>{' '}
          (icons, CC BY 4.0). All product names and logos belong to their owners and are
          used only to identify the service an account belongs to. A service with no mark in
          either set gets a lettered tile.
        </div>
      </Section>

      <Section
        title="Keyboard shortcut"
        description="Open Authenticator X without reaching for the mouse."
      >
        <div className="px-4 py-3.5 text-[13px] text-zinc-600 dark:text-zinc-300">
          <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[12px] dark:border-zinc-700 dark:bg-zinc-900">
            Alt
          </kbd>
          {' + '}
          <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[12px] dark:border-zinc-700 dark:bg-zinc-900">
            Shift
          </kbd>
          {' + '}
          <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[12px] dark:border-zinc-700 dark:bg-zinc-900">
            A
          </kbd>
          <span className="ml-2 text-zinc-500 dark:text-zinc-400">
            — change it at chrome://extensions/shortcuts
          </span>
        </div>
      </Section>
    </>
  );
}
