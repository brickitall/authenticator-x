export type OtpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';
export type OtpType = 'totp' | 'hotp';

/** Everything needed to produce a code, independent of how it is stored. */
export interface OtpParams {
  type: OtpType;
  /** Base32-encoded shared secret. */
  secret: string;
  algorithm: OtpAlgorithm;
  digits: number;
  /** Step size in seconds. TOTP only. */
  period: number;
  /** Moving factor. HOTP only. */
  counter: number;
}

export const DEFAULT_OTP_PARAMS: Omit<OtpParams, 'secret'> = {
  type: 'totp',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
  counter: 0,
};
