import { isMigrationUri } from './migration.js';
import { DEFAULT_OTP_PARAMS, type OtpAlgorithm } from './types.js';
import { parseOtpUri, type ParsedOtpUri } from './uri.js';

/**
 * A code from whatever a person pastes, kept nowhere: the extension's "get a
 * code without saving" and the website's code page both read input here, so
 * one key gives the same code in both, and the same code as an account added
 * with it.
 *
 * A setup link carries its own settings. A bare key takes the settings beside
 * it — six digits, thirty seconds and SHA-1 unless the site said otherwise,
 * which is what almost every site uses.
 */
export interface QuickSettings {
  algorithm: OtpAlgorithm;
  digits: number;
  period: number;
}

export const QUICK_DEFAULTS: QuickSettings = {
  algorithm: DEFAULT_OTP_PARAMS.algorithm,
  digits: DEFAULT_OTP_PARAMS.digits,
  period: DEFAULT_OTP_PARAMS.period,
};

/** Shared with the manual-entry form, where the same slip is made. */
export const BAD_KEY_MESSAGE =
  'A setup key uses only the letters A–Z and the digits 2–7. Check it was copied in full, with nothing extra.';

export type QuickInput =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  /** `fromLink`: the settings came with the input, and the ones beside it do not apply. */
  | { kind: 'ok'; params: ParsedOtpUri; fromLink: boolean };

export function readQuickInput(input: string, settings: QuickSettings = QUICK_DEFAULTS): QuickInput {
  const text = input.trim();
  if (!text) return { kind: 'empty' };

  if (isMigrationUri(text)) {
    return {
      kind: 'error',
      message: 'That is a Google Authenticator transfer link, for several accounts at once. Import it instead.',
    };
  }

  if (/^otpauth:\/\//i.test(text)) {
    try {
      return { kind: 'ok', params: parseOtpUri(text), fromLink: true };
    } catch (cause) {
      return { kind: 'error', message: cause instanceof Error ? cause.message : String(cause) };
    }
  }

  // Sites print keys in groups, in either case, sometimes with dashes; the
  // padding some add means nothing. None of that is part of the key.
  const key = text.replace(/[\s-]+/g, '').replace(/=+$/, '').toUpperCase();
  if (!/^[A-Z2-7]+$/.test(key)) return { kind: 'error', message: BAD_KEY_MESSAGE };
  // Two letters is the least that holds a byte; anything shorter is no key.
  if (key.length < 2) return { kind: 'error', message: 'That is too short to be a setup key.' };

  return {
    kind: 'ok',
    fromLink: false,
    params: {
      type: 'totp',
      secret: key,
      algorithm: settings.algorithm,
      digits: settings.digits,
      period: settings.period,
      counter: 0,
      issuer: '',
      label: '',
    },
  };
}
