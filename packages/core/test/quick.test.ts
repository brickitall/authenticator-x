import { describe, expect, it } from 'vitest';
import { generateCode, readQuickInput } from '../src/index.js';

/**
 * A code from a pasted key, saved nowhere. The RFC 6238 test key at T = 59 s
 * makes 94287082 with eight digits — and 287082 with six — in every
 * implementation that is right.
 */
const RFC_KEY = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const T59 = 59_000;

const codeFor = async (input: string, settings?: Parameters<typeof readQuickInput>[1]) => {
  const read = readQuickInput(input, settings);
  if (read.kind !== 'ok') throw new Error(`not ok: ${JSON.stringify(read)}`);
  return generateCode(read.params, T59);
};

describe('a quick code', () => {
  it('comes from a bare key with the usual settings', async () => {
    expect(await codeFor(RFC_KEY)).toBe('287082');
  });

  it('forgives the ways sites print keys: groups, lower case, dashes, padding', async () => {
    expect(await codeFor('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')).toBe('287082');
    expect(await codeFor('GEZD-GNBV-GY3T-QOJQ-GEZD-GNBV-GY3T-QOJQ')).toBe('287082');
    expect(await codeFor(`${RFC_KEY}====`)).toBe('287082');
  });

  it('takes the settings beside a bare key', async () => {
    expect(await codeFor(RFC_KEY, { algorithm: 'SHA1', digits: 8, period: 30 })).toBe('94287082');
  });

  it('takes a setup link with its own settings, whatever is beside it', async () => {
    const link = `otpauth://totp/Test:me?secret=${RFC_KEY}&digits=8&issuer=Test`;
    const read = readQuickInput(link, { algorithm: 'SHA512', digits: 6, period: 60 });
    expect(read).toMatchObject({ kind: 'ok', fromLink: true, params: { issuer: 'Test', label: 'me', digits: 8 } });
    expect(await codeFor(link, { algorithm: 'SHA512', digits: 6, period: 60 })).toBe('94287082');
  });

  it('says what is wrong, in words, rather than making a wrong code', () => {
    expect(readQuickInput('   ')).toEqual({ kind: 'empty' });
    expect(readQuickInput('JBSW Y3DP 0000')).toMatchObject({ kind: 'error', message: /letters A–Z and the digits 2–7/ });
    expect(readQuickInput('A')).toMatchObject({ kind: 'error', message: /too short/ });
    expect(readQuickInput('otpauth-migration://offline?data=CjEKCkhlbGxv')).toMatchObject({
      kind: 'error',
      message: /transfer link/,
    });
    expect(readQuickInput('otpauth://totp/x?issuer=nokey')).toMatchObject({ kind: 'error' });
  });
});
