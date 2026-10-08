/**
 * Errors, in the language of the page that shows them.
 *
 * The service worker has no language of its own — two pages open in two
 * languages share it — so it throws an `AppError` naming a message key, and
 * the page translates the key. Errors that only have English text, because
 * they come from `@authx/core` or the sync server, are matched against the
 * English they are known to say. `test/i18n.test.ts` reads both sources and
 * fails on any message a person can see that is in neither table.
 */
import type { Values } from './format.js';
import type { MessageKey } from './locales/en.js';

export class AppError extends Error {
  override readonly name: string = 'AppError';
  constructor(
    readonly key: MessageKey,
    readonly values?: Values,
  ) {
    super(key);
  }
}

/** Shorthand for the service worker's many refusals. */
export function fail(key: MessageKey, values?: Values): never {
  throw new AppError(key, values);
}

/**
 * Text that arrives in English from code that cannot know the page's language.
 * Keyed by the exact sentence, so a reworded source shows up as a failing test
 * rather than as English in a German page.
 */
export const KNOWN_MESSAGES: Record<string, MessageKey> = {
  // @authx/core
  'Recovery key is empty': 'error.recoveryKeyMalformed',
  'That does not look like a recovery key.': 'error.recoveryKeyMalformed',
  'This vault does not have a recovery key.': 'error.noRecoveryKit',
  'Master password must be at least 8 characters.': 'error.masterPasswordShort',
  'This vault is not protected by a master password.': 'error.notPassphraseVault',
  'Backup password must be at least 8 characters.': 'error.backupPasswordShort',
  'This file is not a Keyrook Authenticator backup.': 'error.backupNotOurs',
  'This backup was made by a newer version of the app.': 'error.backupNewer',
  'This backup uses an encryption method this version does not know.': 'error.backupUnknownCipher',
  'This backup asks for an unreasonable amount of work to open. Ignoring it.': 'error.backupTooCostly',
  'This backup is malformed.': 'error.backupMalformed',
  'That password does not open this file.': 'error.backupWrongPassword',
  // DecryptionError's own wording, which our backups' wrong password arrives as.
  'Could not decrypt — wrong password or corrupted data.': 'error.backupWrongPassword',
  'Steam Guard codes cannot be imported yet.': 'error.foreign.steam',
  'This export is locked with a password Keyrook Authenticator cannot open. Export it again without a password.':
    'error.foreign.locked',
  'Not an otpauth:// URI': 'error.uriNotOtpauth',
  'Malformed otpauth:// URI': 'error.uriMalformed',
  'URI is missing the "secret" parameter': 'error.uriNoSecret',
  'The "secret" parameter is not valid base32': 'error.uriBadSecret',
  'HOTP URIs must include a "counter" parameter': 'error.uriNoCounter',
  'Secret is empty': 'error.secretEmpty',
  'Secret decoded to zero bytes': 'error.secretEmpty',
  'Not an otpauth-migration:// URI': 'error.migrationNotOurs',
  'Migration URI is missing the "data" parameter': 'error.migrationMalformed',
  'Truncated varint': 'error.migrationMalformed',
  'Varint too long': 'error.migrationMalformed',
  'Truncated length-delimited field': 'error.migrationMalformed',
  'That password is too weak to protect a copy of your vault that leaves this device. Use at least 12 characters mixing upper and lower case, numbers and symbols — or four or five unrelated words.':
    'error.accountPasswordWeak',
  'That approval did not come from the browser whose code you checked.': 'error.pairingForged',
  'A setup key uses only the letters A–Z and the digits 2–7. Check it was copied in full, with nothing extra.':
    'error.badKey',
  'That is a Google Authenticator transfer link, for several accounts at once. Import it instead.':
    'error.quickIsMigration',
  'That is too short to be a setup key.': 'error.keyTooShort',
  'That file is too large to read.': 'error.fileTooLarge',
  // The extension's own scan session, which tests read in English.
  'That QR code is not a 2FA setup code.': 'error.notSetupQr',
  'That account is already in your vault.': 'error.alreadyInVault',
  // Password strength, as @authx/core scores it.
  'Use at least 10 characters — length matters most.': 'strength.tooShort',
  'Digits only is easy to guess.': 'strength.digitsOnly',
  'Avoid repeated characters.': 'strength.repeated',
  // The sync server.
  'That request was not valid JSON.': 'error.server.badRequest',
  'That request is too large.': 'error.server.badRequest',
  'Missing bearer token.': 'error.server.session',
  'That session is no longer valid.': 'error.server.session',
  'That session has expired.': 'error.server.session',
  'That account no longer exists.': 'error.server.accountGone',
  'That recovery key does not match this account.': 'error.recoveryKeyWrong',
  'That sign-up has expired. Sign in again.': 'error.server.signupExpired',
  'That sign-in has expired. Try again.': 'error.server.signinExpired',
  'Too many wrong codes. Ask for a new one.': 'error.server.tooManyCodes',
  'Too many browsers are waiting to join this account. Try again in a few minutes.': 'error.server.tooManyPairings',
  'This device does not hold the account key.': 'error.server.wrongKey',
  'This account signs in with Google or GitHub, not a password.': 'error.server.providerAccount',
  'The email could not be sent. Try again in a minute.': 'error.server.mailFailed',
  'That request has ended.': 'error.pairingEnded',
  'That request has ended. Ask again.': 'error.pairingEnded',
  'That request has ended, or another browser is approving it.': 'error.server.pairingTaken',
  'That password is not correct.': 'error.server.passwordWrong',
  'Email or password is incorrect.': 'error.server.badCredentials',
  'That code is not right, or it has expired. Check the email, or ask for a new one.': 'error.server.badCode',
  'Sign in again with the account you use for Keyrook to confirm this.': 'error.server.reauthMismatch',
  // The server's wording before it was renamed, until every server has been.
  'Sign in again with the account you use for Authenticator X to confirm this.': 'error.server.reauthMismatch',
  'KDF iteration count is below the minimum.': 'error.server.badRequest',
  'Another device changed the recovery key just now.': 'error.server.kitRace',
  'Not found.': 'error.server.unavailable',
  'Account vanished mid-transaction': 'error.server.unavailable',
  'A provider account has no wrapped key to hand out.': 'error.server.providerAccount',
  'This vault was created by a newer version of Keyrook Authenticator. Please update before opening it.':
    'error.vaultNewer',
  'Something went wrong.': 'error.server.unavailable',
  // Google and GitHub, as the server relays their refusal.
  'GitHub refused the sign-in.': 'error.provider.githubRefused',
  'Google did not ask you to sign in again.': 'error.provider.noReauth',
  'Google has not verified that email address.': 'error.provider.unverifiedEmail',
  'Your GitHub account has no verified primary email address.': 'error.provider.githubNoEmail',
  'Expired.': 'error.provider.refused',
  'Malformed ID token.': 'error.provider.refused',
  'No GitHub user id.': 'error.provider.refused',
  'No ID token.': 'error.provider.refused',
  'No subject.': 'error.provider.refused',
  'Not issued by Google.': 'error.provider.refused',
  'Not issued for this server.': 'error.provider.refused',
  'Not this sign-in.': 'error.provider.refused',
  // The browser, when the network or the server is not there.
  'Failed to fetch': 'error.offline',
  'NetworkError when attempting to fetch resource.': 'error.offline',
};

/** The few that carry a value, matched by shape. */
export const KNOWN_PATTERNS: [RegExp, MessageKey, string[]][] = [
  [/^Too many failed attempts\. Try again in (\d+) seconds\.$/, 'error.server.lockedOut', ['count']],
  [/^Too many attempts\. Try again in (\d+) seconds\.$/, 'error.server.rateLimited', ['count']],
  [/^(.+) already has (?:a Keyrook|an Authenticator X) account\.$/, 'error.server.emailTaken', ['email']],
  [/^Record (.+) exceeds the size limit\.$/, 'error.server.recordTooLarge', ['id']],
  [/^(\S+) answered (\d+)\.$/, 'error.provider.unreachable', ['provider', 'status']],
  [/^(?:Unsupported algorithm|Unsupported OTP type|Invalid digits|Invalid period|Invalid \w+): (.+)$/, 'error.uriUnsupported', ['value']],
  [/^Invalid base32 character: "(.+)"$/, 'error.uriBadSecret', ['value']],
  [/^"(.+)" is not part of a recovery key$/, 'error.recoveryKeyMalformed', ['value']],
  [/^Unsupported protobuf wire type: (\d+)$/, 'error.migrationMalformed', ['value']],
  [/^Google Authenticator only keeps 30-second codes; this one uses (\d+)\.$/, 'error.gaSkipPeriod', ['period']],
  [/^Google Authenticator only keeps 6- or 8-digit codes; this one has (\d+)\.$/, 'error.gaSkipDigits', ['digits']],
];

/** The key and values for an English message, if it is one this app knows. */
export function knownMessage(message: string): { key: MessageKey; values?: Values } | null {
  const key = KNOWN_MESSAGES[message];
  if (key) return { key };
  for (const [pattern, patternKey, names] of KNOWN_PATTERNS) {
    const match = pattern.exec(message);
    if (!match) continue;
    const values: Values = {};
    names.forEach((name, index) => {
      const raw = match[index + 1]!;
      values[name] = /^\d+$/.test(raw) ? Number(raw) : raw;
    });
    return { key: patternKey, values };
  }
  return null;
}
