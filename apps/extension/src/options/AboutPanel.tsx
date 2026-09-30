import { Logo } from '../ui/icons.js';
import { Section } from './Section.js';

const FACTS = [
  {
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

  return (
    <>
      <div className="mb-8 flex items-start gap-4">
        <Logo className="h-12 w-12" />
        <div>
          <h1 className="text-[18px] font-semibold">Authenticator X</h1>
          <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">Version {version}</p>
        </div>
      </div>

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
          519 services have a real mark. Artwork from{' '}
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
