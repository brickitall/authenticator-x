import { useEffect, useState, type ReactNode } from 'react';
import { accountPasswordProblem, isWellFormedRecoveryKey } from '@authx/core';
import { send, type SignInResult, type SyncSummary } from '../lib/messaging.js';
import { AlertIcon, ArrowLeftIcon, CheckIcon, CloudLockIcon, KeyIcon } from '../ui/icons.js';
import { PasswordField } from '../ui/password.js';
import { Button, Callout, Field, Spinner } from '../ui/primitives.js';
import { PRIVACY_URL, SECURITY_MODEL_URL } from '../lib/links.js';
import { SourceLink } from '../ui/SourceLink.js';

type Step = 'intro' | 'create' | 'signIn' | 'recover';

/**
 * What signing in adds, said plainly. Only what exists today: there is no
 * phone app yet, so this does not promise one. Nothing about limits either —
 * a local vault has none, so an account cannot be sold as lifting one.
 */
const BENEFITS = [
  'The same codes in every browser you sign in to.',
  'A lost or broken laptop is not a lost vault.',
  'Free, and optional — everything keeps working on this device without it.',
];

/** A narrow, centred card: one column, one decision at a time. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="animate-fade-in mx-auto w-full max-w-[400px] rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {children}
    </div>
  );
}

const MARK_TONES = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300',
  success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  warning: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
} as const;

function Mark({ icon, tone = 'brand' }: { icon: ReactNode; tone?: keyof typeof MARK_TONES }) {
  return (
    <div className={`grid h-11 w-11 place-items-center rounded-2xl text-[22px] ${MARK_TONES[tone]}`}>
      {icon}
    </div>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  return (
    <div>
      <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{subtitle}</p>
    </div>
  );
}

function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
    >
      {children}
    </button>
  );
}

function Footnote({ children }: { children: ReactNode }) {
  return (
    <p className="text-center text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{children}</p>
  );
}

/**
 * Creating an account, signing in, and recovering one — for a vault that is
 * not signed in.
 *
 * It opens on what sync is for and two plain choices, then one short form per
 * step. The old version put both forms behind tabs in a two-column grid, with
 * a paragraph above, a callout inside and a benefits list below the button;
 * people had to read all of it to find the one field they needed.
 */
export function SyncAuth({
  protectionMode,
  signedOutElsewhere,
  onSignedUp,
  onSignedIn,
  introFooter,
}: {
  protectionMode: 'device' | 'passphrase';
  /** The account this device was signed out of by the server, if any. */
  signedOutElsewhere: string | null;
  onSignedUp: (recoveryKey: string | null) => void;
  /** Joined an account, by password or by recovery key. */
  onSignedIn: (result: SignInResult, how: 'signIn' | 'recover') => void;
  /** Shown under the card on the first step only. */
  introFooter?: ReactNode;
}) {
  // Someone who was signed out by the server wants back in, not a sales pitch.
  const [step, setStep] = useState<Step>(signedOutElsewhere ? 'signIn' : 'intro');
  const [email, setEmail] = useState(signedOutElsewhere ?? '');

  const go = (next: Step) => setStep(next);

  return (
    <div className="flex flex-col gap-8">
      <AuthCard>
        {step === 'intro' && <Intro onCreate={() => go('create')} onSignIn={() => go('signIn')} />}
        {step === 'create' && (
          <CreateForm
            protectionMode={protectionMode}
            email={email}
            onEmail={setEmail}
            onBack={() => go('intro')}
            onSignIn={() => go('signIn')}
            onSignedUp={onSignedUp}
          />
        )}
        {step === 'signIn' && (
          <SignInForm
            protectionMode={protectionMode}
            email={email}
            onEmail={setEmail}
            signedOutElsewhere={signedOutElsewhere}
            onBack={() => go('intro')}
            onCreate={() => go('create')}
            onForgot={() => go('recover')}
            onSignedIn={(result) => onSignedIn(result, 'signIn')}
          />
        )}
        {step === 'recover' && (
          <RecoverForm
            email={email}
            onEmail={setEmail}
            onBack={() => go('signIn')}
            onSignedIn={(result) => onSignedIn(result, 'recover')}
          />
        )}
      </AuthCard>
      {step === 'intro' && introFooter}
    </div>
  );
}

function Intro({ onCreate, onSignIn }: { onCreate: () => void; onSignIn: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Mark icon={<CloudLockIcon />} />
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight">Sync your vault</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Encrypted on this device before it leaves. The server stores what it cannot read — and
            neither can we.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex gap-2.5 text-[13px] leading-snug text-zinc-700 dark:text-zinc-300">
            <CheckIcon className="mt-px shrink-0 text-[15px] text-brand-600 dark:text-brand-400" />
            {benefit}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <Button variant="primary" className="w-full" onClick={onCreate}>
          Create an account
        </Button>
        <Button className="w-full" onClick={onSignIn}>
          Sign in
        </Button>
      </div>

      {/* The moment someone decides whether to hand their codes to a server
          is the moment to show them exactly what leaves the device. */}
      <div className="flex justify-center text-[12px]">
        <SourceLink href={SECURITY_MODEL_URL}>Open source — see how your codes are encrypted</SourceLink>
      </div>
    </div>
  );
}

function FormShell({
  onBack,
  title,
  subtitle,
  children,
  onSubmit,
}: {
  onBack: () => void;
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="-ml-1.5 grid h-8 w-8 place-items-center rounded-lg text-[17px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        >
          <ArrowLeftIcon />
        </button>
        <Heading title={title} subtitle={subtitle} />
      </div>
      {children}
    </form>
  );
}

/** Runs a submit with a busy flag and an error, the same way on every form. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}

const WEAK_HINT = 'At least 12 characters with a mix, or four or five unrelated words.';

function EmailField({
  email,
  onEmail,
  autoFocus,
}: {
  email: string;
  onEmail: (email: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <Field
      label="Email"
      type="email"
      autoComplete="username"
      placeholder="you@example.com"
      autoFocus={autoFocus}
      value={email}
      onChange={(event) => onEmail(event.target.value)}
    />
  );
}

function CreateForm({
  protectionMode,
  email,
  onEmail,
  onBack,
  onSignIn,
  onSignedUp,
}: {
  protectionMode: 'device' | 'passphrase';
  email: string;
  onEmail: (email: string) => void;
  onBack: () => void;
  onSignIn: () => void;
  onSignedUp: (recoveryKey: string | null) => void;
}) {
  const [stage, setStage] = useState<'details' | 'code'>('details');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const { busy, error, run } = useSubmit();

  // A vault with a master password signs up with it — one password, not two.
  // One that opens with the device key chooses a password for the account.
  const choosing = protectionMode === 'device';
  const tooWeak = choosing && password.length > 0 && accountPasswordProblem(password) !== null;
  const ready =
    email.includes('@') &&
    password.length >= 8 &&
    (!choosing || (!tooWeak && password === confirm));

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const askForCode = () =>
    run(async () => {
      await send({ type: 'account/startSignUp', email, password });
      setCode('');
      setStage('code');
      // The server allows one email a minute per address; say so on the
      // button rather than letting a second click fail.
      setResendIn(60);
    });

  if (stage === 'code') {
    return (
      <FormShell
        onBack={() => setStage('details')}
        title="Check your email"
        subtitle={
          <>
            We sent a six-digit code to <span className="font-medium text-zinc-700 dark:text-zinc-200">{email}</span>.
            It works once, for 15 minutes.
          </>
        }
        onSubmit={() =>
          void run(async () => {
            if (!/^\d{6}$/.test(code)) return;
            const { recoveryKey } = await send({ type: 'account/signUp', email, password, code });
            onSignedUp(recoveryKey);
          })
        }
      >
        <Field
          label="Code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="000000"
          value={code}
          // Pasted codes often arrive with a space or a dash in them.
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          className="text-center font-mono text-[20px] tracking-[0.4em]"
        />

        {/* A new sender often lands in spam at first. Saying where to look
            keeps people from stalling here, and each "Not spam" teaches the
            mail provider to deliver the next code properly. */}
        <Callout tone="info">
          Not in your inbox? Look in <strong>Spam</strong> for a message from{' '}
          <strong>Authenticator X</strong>, and mark it <strong>Not spam</strong>.
        </Callout>

        {error && <Callout tone="danger">{error}</Callout>}

        <div className="flex flex-col gap-3">
          <Button type="submit" variant="primary" className="w-full" disabled={code.length !== 6 || busy}>
            {busy ? <Spinner /> : null} Create account
          </Button>
          <Footnote>
            If this address already has an account, the email says so instead — then sign in there.
          </Footnote>
        </div>

        <Footnote>
          Still nothing?{' '}
          {resendIn > 0 ? (
            <span>Send a new code in {resendIn}s</span>
          ) : (
            <TextLink onClick={() => void askForCode()}>Send a new code</TextLink>
          )}
          . Wrong address? <TextLink onClick={() => setStage('details')}>Change it</TextLink>
        </Footnote>
      </FormShell>
    );
  }

  return (
    <FormShell
      onBack={onBack}
      title="Create your account"
      subtitle={
        choosing
          ? 'You will need this password on a new device. This one keeps opening without it.'
          : 'Your master password becomes your account password too — still just one.'
      }
      onSubmit={() => {
        if (ready) void askForCode();
      }}
    >
      <div className="flex flex-col gap-4">
        <EmailField email={email} onEmail={onEmail} autoFocus />
        {choosing ? (
          <>
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              meter
              hint={tooWeak ? WEAK_HINT : undefined}
            />
            <PasswordField
              label="Confirm password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              error={confirm && confirm !== password ? 'Passwords do not match.' : null}
            />
          </>
        ) : (
          <PasswordField
            label="Master password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        )}
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <div className="flex flex-col gap-3">
        <Button type="submit" variant="primary" className="w-full" disabled={!ready || busy}>
          {busy ? <Spinner /> : null} Continue
        </Button>
        <Footnote>
          Next, we email you a code to confirm the address, then you save a recovery key — the only
          way back if you forget the password.
        </Footnote>
        <Footnote>
          Creating an account means agreeing to the{' '}
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            privacy policy
          </a>
          .
        </Footnote>
      </div>

      <Footnote>
        Already have an account? <TextLink onClick={onSignIn}>Sign in</TextLink>
      </Footnote>
    </FormShell>
  );
}

function SignInForm({
  protectionMode,
  email,
  onEmail,
  signedOutElsewhere,
  onBack,
  onCreate,
  onForgot,
  onSignedIn,
}: {
  protectionMode: 'device' | 'passphrase';
  email: string;
  onEmail: (email: string) => void;
  signedOutElsewhere: string | null;
  onBack: () => void;
  onCreate: () => void;
  onForgot: () => void;
  onSignedIn: (result: SignInResult) => void;
}) {
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const ready = email.includes('@') && password.length > 0;

  return (
    <FormShell
      onBack={onBack}
      title="Sign in"
      subtitle="Codes already on this device are added to your account."
      onSubmit={() =>
        void run(async () => {
          if (!ready) return;
          onSignedIn(await send({ type: 'account/signIn', email, password }));
        })
      }
    >
      {signedOutElsewhere && (
        <Callout tone="warning">
          This device was signed out of {signedOutElsewhere} — the password was changed or the device
          was removed from another one. Sign in again to keep syncing.
        </Callout>
      )}

      <div className="flex flex-col gap-4">
        <EmailField email={email} onEmail={onEmail} autoFocus={!email} />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          autoFocus={Boolean(email)}
          labelAction={
            <span className="text-[12px]">
              <TextLink onClick={onForgot}>Forgot password?</TextLink>
            </span>
          }
        />
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <div className="flex flex-col gap-3">
        <Button type="submit" variant="primary" className="w-full" disabled={!ready || busy}>
          {busy ? <Spinner /> : null} Sign in
        </Button>
        <Footnote>
          {protectionMode === 'passphrase'
            ? 'This device will lock with your account password from then on.'
            : 'This device keeps opening without a password.'}
        </Footnote>
      </div>

      <Footnote>
        New here? <TextLink onClick={onCreate}>Create an account</TextLink>
      </Footnote>
    </FormShell>
  );
}

function RecoverForm({
  email,
  onEmail,
  onBack,
  onSignedIn,
}: {
  email: string;
  onEmail: (email: string) => void;
  onBack: () => void;
  onSignedIn: (result: SignInResult) => void;
}) {
  const [recoveryKey, setRecoveryKey] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, run } = useSubmit();

  const tooWeak = password.length > 0 && accountPasswordProblem(password) !== null;
  const ready =
    email.includes('@') &&
    isWellFormedRecoveryKey(recoveryKey) &&
    password.length >= 8 &&
    !tooWeak &&
    password === confirm;

  return (
    <FormShell
      onBack={onBack}
      title="Recover your account"
      subtitle="Use the recovery key you saved when you created it, then choose a new password."
      onSubmit={() =>
        void run(async () => {
          if (!ready) return;
          onSignedIn(await send({ type: 'account/recover', email, recoveryKey, password }));
        })
      }
    >
      <div className="flex flex-col gap-4">
        <EmailField email={email} onEmail={onEmail} autoFocus={!email} />
        <Field
          label="Recovery key"
          autoComplete="off"
          spellCheck={false}
          autoFocus={Boolean(email)}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          value={recoveryKey}
          onChange={(event) => setRecoveryKey(event.target.value)}
          className="font-mono text-[13px] uppercase"
          hint={
            recoveryKey && !isWellFormedRecoveryKey(recoveryKey)
              ? '32 characters from your printed sheet. Spaces and dashes do not matter.'
              : undefined
          }
        />
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          meter
          hint={tooWeak ? WEAK_HINT : undefined}
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          error={confirm && confirm !== password ? 'Passwords do not match.' : null}
        />
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <div className="flex flex-col gap-3">
        <Button type="submit" variant="primary" className="w-full" disabled={!ready || busy}>
          {busy ? <Spinner /> : null} Recover and sign in
        </Button>
        <Footnote>
          Every device on the account is signed out and asked for the new password. Your recovery key
          keeps working.
        </Footnote>
      </div>
    </FormShell>
  );
}

/** How much of this device's vault the account now holds. */
export interface BackupCount {
  total: number;
  pending: number;
}

function backedUpLine({ total, pending }: BackupCount): string {
  if (total === 0) return 'Your account is ready.';
  if (pending === 0) {
    return total === 1
      ? 'Your account is ready, and the account on this device is backed up to it.'
      : `Your account is ready, and all ${total} accounts on this device are backed up to it.`;
  }
  return `Your account is ready. ${total - pending} of ${total} accounts are backed up so far; the rest follow on the next sync.`;
}

/** Shown once, straight after the account is made. */
export function FreshRecoveryKey({ backup, children }: { backup: BackupCount; children: ReactNode }) {
  return (
    <AuthCard>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-4 text-center">
          <Mark icon={<KeyIcon />} />
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight">Save your recovery key</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {backedUpLine(backup)} If you forget your password, this key is the only way back in —
              nobody can reset it for you, not us and not Google.
            </p>
          </div>
        </div>
        {children}
      </div>
    </AuthCard>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Where the codes came from, in the words a person would use. */
function breakdown(sync: SyncSummary, total: number): string {
  const parts = [
    sync.pulled > 0 ? `${sync.pulled} from your account` : null,
    sync.pushed > 0 ? `${sync.pushed} added from this device` : null,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  return total > 0 ? 'Already in sync.' : 'Nothing here yet.';
}

/**
 * The moment after joining an account: what arrived, and where to find it.
 *
 * Without it, signing in synced every code in the background and then showed
 * a settings page — nothing said the codes had arrived, or how many, or where
 * to look. A first sync that failed is said here too, as what it is: the
 * sign-in worked, the sync did not yet.
 */
export function SignedInWelcome({
  how,
  email,
  backup,
  sync,
  syncError,
  onRetry,
  onOpenAccounts,
  onDone,
}: {
  how: 'signIn' | 'recover';
  email: string;
  backup: BackupCount;
  sync: SyncSummary | null;
  syncError: string | null;
  onRetry: () => Promise<void>;
  onOpenAccounts: () => void;
  onDone: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const failed = syncError !== null;

  async function retry() {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <AuthCard>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <Mark icon={failed ? <AlertIcon /> : <CheckIcon />} tone={failed ? 'warning' : 'success'} />
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight">
              {failed
                ? 'Signed in — the first sync did not finish'
                : how === 'recover'
                  ? 'You are back in'
                  : 'You are signed in'}
            </h2>
            <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">{email}</p>
          </div>
        </div>

        {failed ? (
          <Callout tone="warning">
            <p className="font-medium">{syncError}</p>
            <p className="mt-1">
              Nothing is lost: your codes arrive with the next sync. Try again now, or it happens by
              itself within five minutes.
            </p>
          </Callout>
        ) : (
          <div className="rounded-2xl bg-zinc-50 px-5 py-4 text-center dark:bg-zinc-900">
            <p className="text-[30px] leading-none font-semibold tracking-tight tabular-nums">
              {backup.total}
            </p>
            <p className="mt-1.5 text-[13px] font-medium">
              {backup.total === 1 ? 'account on this device' : 'accounts on this device'}
            </p>
            <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
              {sync ? breakdown(sync, backup.total) : null}
              {backup.pending > 0 &&
                ` · ${plural(backup.pending, 'is', 'are')} still uploading and will follow on the next sync`}
            </p>
          </div>
        )}

        {how === 'recover' && !failed && (
          <p className="text-center text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Every other device was signed out, and will ask for the new password.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {failed ? (
            <Button variant="primary" className="w-full" disabled={retrying} onClick={() => void retry()}>
              {retrying ? <Spinner /> : null} Try again
            </Button>
          ) : (
            <Button variant="primary" className="w-full" onClick={onOpenAccounts}>
              See your accounts
            </Button>
          )}
          <Button className="w-full" onClick={onDone}>
            Done
          </Button>
        </div>

        {!failed && backup.total > 0 && (
          <Footnote>They are also one click away: the Authenticator X icon in your toolbar.</Footnote>
        )}
      </div>
    </AuthCard>
  );
}
