import { describe, expect, it } from 'vitest';
import { itemForShortcutFill } from '../src/vault/autofill.js';
import { itemFromUri } from '../src/vault/vault.js';
import { parseOtpUri } from '../src/otp/uri.js';

const account = (issuer: string, domains: string[] = [], type: 'totp' | 'hotp' = 'totp') =>
  itemFromUri(
    parseOtpUri(`otpauth://${type}/${encodeURIComponent(issuer)}:me?secret=JBSWY3DPEHPK3PXP&issuer=${encodeURIComponent(issuer)}${type === 'hotp' ? '&counter=0' : ''}`),
    domains,
  );

/**
 * A shortcut fills with nobody looking at the page, so each case here is a
 * page that would like a code it should not get.
 */
describe('the account a shortcut may fill', () => {
  it('fills the one account recorded for the site, on the site and its subdomains', () => {
    const github = account('GitHub', ['github.com']);
    expect(itemForShortcutFill([github], 'github.com')).toBe(github);
    expect(itemForShortcutFill([github], 'www.github.com')).toBe(github);
    expect(itemForShortcutFill([github], 'gist.github.com')).toBe(github);
  });

  it('knows a well-known service’s own domains when the account records none', () => {
    const google = account('Google');
    expect(itemForShortcutFill([google], 'accounts.google.com')).toBe(google);
  });

  it('gives nothing to a look-alike, however the page names itself', () => {
    const github = account('GitHub', ['github.com']);
    expect(itemForShortcutFill([github], 'github.com.evil.example')).toBeNull();
    expect(itemForShortcutFill([github], 'github-login.example')).toBeNull();
    expect(itemForShortcutFill([github], 'notgithub.com')).toBeNull();
    // The issuer guess that orders the popup's list does not count here.
    const custom = account('Acmecorp');
    expect(itemForShortcutFill([custom], 'acmecorp.evil.example')).toBeNull();
  });

  it('lets a person choose when two accounts belong to the site, or none does', () => {
    const work = account('GitHub', ['github.com']);
    const home = account('GitHub', ['github.com']);
    expect(itemForShortcutFill([work, home], 'github.com')).toBeNull();
    expect(itemForShortcutFill([work], 'gitlab.com')).toBeNull();
    expect(itemForShortcutFill([work], null)).toBeNull();
  });

  it('leaves a counter-based code, and a deleted account, to the popup', () => {
    expect(itemForShortcutFill([account('GitHub', ['github.com'], 'hotp')], 'github.com')).toBeNull();
    const gone = { ...account('GitHub', ['github.com']), deletedAt: 1 };
    expect(itemForShortcutFill([gone], 'github.com')).toBeNull();
  });

  it('keeps an account to the sites it records, even when its service is well known', () => {
    // Recorded on a company's own sign-in page: Google's domains are not its.
    const sso = account('Google', ['sso.example.com']);
    expect(itemForShortcutFill([sso], 'accounts.google.com')).toBeNull();
    expect(itemForShortcutFill([sso], 'sso.example.com')).toBe(sso);
  });
});
