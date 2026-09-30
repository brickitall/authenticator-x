import { describe, expect, it } from 'vitest';
import { isTrustedSender } from '../src/lib/messaging.js';

const ME = 'abcdefghijklmnopabcdefghijklmnop';
const MY_ORIGIN = `chrome-extension://${ME}`;

describe('who may drive the vault', () => {
  it('accepts this extension’s own pages', () => {
    // Popup and options both report the extension's origin, whether they are a
    // browser-action popup or a tab.
    expect(isTrustedSender({ id: ME, origin: MY_ORIGIN }, ME)).toBe(true);
  });

  it('refuses a content script, which carries the same id', () => {
    // This is the case the id check alone misses, and it is the whole reason
    // the origin is checked: the script is injected into whatever page the user
    // last opened the popup on.
    expect(isTrustedSender({ id: ME, origin: 'https://example.com' }, ME)).toBe(false);
    expect(isTrustedSender({ id: ME, origin: 'http://localhost:3000' }, ME)).toBe(false);
    expect(isTrustedSender({ id: ME, origin: 'null' }, ME)).toBe(false);
  });

  it('refuses another extension', () => {
    const other = 'ponmlkjihgfedcbaponmlkjihgfedcba';
    expect(isTrustedSender({ id: other, origin: `chrome-extension://${other}` }, ME)).toBe(false);
    // Right origin string, wrong id — and the reverse.
    expect(isTrustedSender({ id: other, origin: MY_ORIGIN }, ME)).toBe(false);
    expect(isTrustedSender({ id: ME, origin: `chrome-extension://${other}` }, ME)).toBe(false);
  });

  it('refuses a sender that reports nothing', () => {
    expect(isTrustedSender({}, ME)).toBe(false);
    expect(isTrustedSender({ id: ME }, ME)).toBe(false);
    expect(isTrustedSender({ origin: MY_ORIGIN }, ME)).toBe(false);
  });

  it('is not fooled by an origin that merely starts the same', () => {
    expect(isTrustedSender({ id: ME, origin: `${MY_ORIGIN}.evil.example` }, ME)).toBe(false);
    expect(isTrustedSender({ id: ME, origin: `https://chrome-extension://${ME}` }, ME)).toBe(false);
  });
});
