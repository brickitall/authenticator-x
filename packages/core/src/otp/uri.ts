import { canonicalSecret, isValidBase32 } from '../util/base32.js';
import { DEFAULT_OTP_PARAMS, type OtpAlgorithm, type OtpParams, type OtpType } from './types.js';

/** A parsed `otpauth://` URI: OTP parameters plus the human-facing naming. */
export interface ParsedOtpUri extends OtpParams {
  issuer: string;
  label: string;
}

const ALGORITHMS: OtpAlgorithm[] = ['SHA1', 'SHA256', 'SHA512'];

function parseAlgorithm(raw: string | null): OtpAlgorithm {
  if (!raw) return DEFAULT_OTP_PARAMS.algorithm;
  const upper = raw.toUpperCase().replace('-', '');
  const match = ALGORITHMS.find((a) => a === upper);
  if (!match) throw new Error(`Unsupported algorithm: ${raw}`);
  return match;
}

function parsePositiveInt(raw: string | null, fallback: number, field: string): number {
  if (raw === null || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${field}: ${raw}`);
  return value;
}

/**
 * Parse an `otpauth://totp/...` or `otpauth://hotp/...` URI.
 * Throws with a message suitable for showing to the user.
 */
export function parseOtpUri(uri: string): ParsedOtpUri {
  const trimmed = uri.trim();
  if (!/^otpauth:\/\//i.test(trimmed)) {
    throw new Error('Not an otpauth:// URI');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Malformed otpauth:// URI');
  }

  const type = url.host.toLowerCase() as OtpType;
  if (type !== 'totp' && type !== 'hotp') {
    throw new Error(`Unsupported OTP type: ${url.host}`);
  }

  const secret = (url.searchParams.get('secret') ?? '').replace(/\s/g, '');
  if (!secret) throw new Error('URI is missing the "secret" parameter');
  if (!isValidBase32(secret)) throw new Error('The "secret" parameter is not valid base32');

  // Label is `Issuer:Account` or just `Account`. The issuer query param wins
  // when both are present, per the Key Uri Format spec.
  let rawLabel = decodeURIComponent(url.pathname.replace(/^\//, ''));
  let issuer = url.searchParams.get('issuer')?.trim() ?? '';
  const separator = rawLabel.indexOf(':');
  if (separator !== -1) {
    const labelIssuer = rawLabel.slice(0, separator).trim();
    rawLabel = rawLabel.slice(separator + 1).trim();
    if (!issuer) issuer = labelIssuer;
  }

  const digits = parsePositiveInt(url.searchParams.get('digits'), DEFAULT_OTP_PARAMS.digits, 'digits');
  if (digits < 6 || digits > 10) throw new Error(`Invalid digits: ${digits}`);

  const period = parsePositiveInt(url.searchParams.get('period'), DEFAULT_OTP_PARAMS.period, 'period');
  if (period <= 0) throw new Error(`Invalid period: ${period}`);

  const counter = parsePositiveInt(url.searchParams.get('counter'), 0, 'counter');
  if (type === 'hotp' && url.searchParams.get('counter') === null) {
    throw new Error('HOTP URIs must include a "counter" parameter');
  }

  return {
    type,
    secret: secret.toUpperCase(),
    algorithm: parseAlgorithm(url.searchParams.get('algorithm')),
    digits,
    period,
    counter,
    issuer,
    label: rawLabel,
  };
}

/** Build an `otpauth://` URI — used for backups and for handing an item to a phone. */
export function buildOtpUri(item: ParsedOtpUri): string {
  const label = item.issuer
    ? `${encodeURIComponent(item.issuer)}:${encodeURIComponent(item.label)}`
    : encodeURIComponent(item.label);

  // Canonical whatever form the key arrived in: apps stricter than this one
  // turn a whole code away over padding or spare bits.
  const params: [string, string][] = [['secret', canonicalSecret(item.secret)]];
  if (item.issuer) params.push(['issuer', item.issuer]);
  if (item.algorithm !== DEFAULT_OTP_PARAMS.algorithm) params.push(['algorithm', item.algorithm]);
  if (item.digits !== DEFAULT_OTP_PARAMS.digits) params.push(['digits', String(item.digits)]);
  if (item.type === 'totp') {
    if (item.period !== DEFAULT_OTP_PARAMS.period) params.push(['period', String(item.period)]);
  } else {
    params.push(['counter', String(item.counter)]);
  }

  // Percent-encoded, never URLSearchParams: that writes a space as `+`, which
  // the Key URI format does not have. An app that reads `+` literally sees
  // the issuer "Amazon+Web+Services", unequal to the label's "Amazon Web
  // Services" — and refuses the code, or files it under the wrong name.
  const query = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return `otpauth://${item.type}/${label}?${query}`;
}
