import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { format, placeholdersOf, tagsOf, type Message, type Plural } from '../src/i18n/format.js';
import { KNOWN_MESSAGES, KNOWN_PATTERNS, knownMessage } from '../src/i18n/errors.js';
import { detectLocale, LOADERS, LOCALES } from '../src/i18n/locales.js';
import { en } from '../src/i18n/locales/en.js';
import { de } from '../src/i18n/locales/de.js';

/**
 * What keeps every language saying the same thing: every translation has every
 * message, with the same values and tags in it, and the plural forms its
 * language needs; nothing a person can read is left in the code; and every
 * English sentence that reaches a page from the core or the server has a
 * translation to go to.
 */
const ROOT = resolve(import.meta.dirname, '..');
const REPO = resolve(ROOT, '../..');

// Every language the picker offers, loaded the way a page loads it.
const TRANSLATIONS = Object.fromEntries(
  await Promise.all(Object.entries(LOADERS).map(async ([locale, load]) => [locale, await load()] as const)),
);

describe('the language files', () => {
  it('cover every language the picker offers', () => {
    expect(Object.keys(TRANSLATIONS).sort()).toEqual(LOCALES.filter((locale) => locale !== 'en').sort());
  });

  for (const [locale, dictionary] of Object.entries(TRANSLATIONS)) {
    describe(locale, () => {
      const entries = Object.entries(en) as [keyof typeof en, Message][];

      it('has every message, and nothing else', () => {
        expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort());
      });

      it('keeps every value and tag the English has', () => {
        const wrong = entries.filter(([key, english]) => {
          const theirs = dictionary[key] as Message;
          return (
            JSON.stringify(placeholdersOf(theirs)) !== JSON.stringify(placeholdersOf(english)) ||
            JSON.stringify(tagsOf(theirs)) !== JSON.stringify(tagsOf(english))
          );
        });
        expect(wrong.map(([key]) => key)).toEqual([]);
      });

      it('has the plural forms its language uses, and no empty text', () => {
        const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
        const wrong = entries.filter(([key, english]) => {
          const theirs = dictionary[key] as Message;
          // A message that is only a full stop may be empty: Thai ends a sentence without one.
          if (typeof english === 'string') {
            return typeof theirs !== 'string' || (theirs.trim() === '' && !/^\p{P}+$/u.test(english));
          }
          if (typeof theirs === 'string') return true;
          // `many` and the rest fall back to `other`; `one` is what reads wrong without its own form.
          // Arabic is the exception: a count of two, or of three to ten, takes another word entirely.
          const needed = categories.filter(
            (category) => locale === 'ar' || category === 'one' || category === 'other',
          );
          return needed.some((category) => !(theirs as Plural)[category as keyof Plural]?.trim());
        });
        expect(wrong.map(([key]) => key)).toEqual([]);
      });

      it('formats every message without leaving a placeholder behind', () => {
        const leftover = entries.filter(([key, english]) => {
          const values = Object.fromEntries(placeholdersOf(english).map((name) => [name, name === 'count' ? 2 : 'x']));
          return /\{\w+\}/.test(format(dictionary[key] as Message, locale, values));
        });
        expect(leftover.map(([key]) => key)).toEqual([]);
      });
    });
  }
});

describe('choosing a language', () => {
  it('takes the first the browser lists that the extension speaks', () => {
    expect(detectLocale(['de-AT', 'en'])).toBe('de');
    expect(detectLocale(['es-MX', 'pt-BR', 'en'])).toBe('es');
    expect(detectLocale(['ja'])).toBe('ja');
    expect(detectLocale(['vi', 'ru'])).toBe('vi');
    expect(detectLocale(['ar-EG'])).toBe('ar');
    expect(detectLocale(['ru', 'uk'])).toBe('ru');
    expect(detectLocale(['yo', 'zu'])).toBe('en');
  });

  it('finds a language under the older tags browsers still send', () => {
    expect(detectLocale(['nb-NO'])).toBe('no');
    expect(detectLocale(['nn'])).toBe('no');
    expect(detectLocale(['iw'])).toBe('he');
    expect(detectLocale(['in-ID'])).toBe('id');
    expect(detectLocale(['tl-PH'])).toBe('fil');
  });

  it('gives the Brazilian Portuguese to every reader of Portuguese', () => {
    expect(detectLocale(['pt-BR'])).toBe('pt-BR');
    expect(detectLocale(['pt-PT', 'en'])).toBe('pt-BR');
    expect(detectLocale(['pt'])).toBe('pt-BR');
  });

  it('gives Traditional Chinese to Taiwan and Hong Kong, and Simplified to everyone else', () => {
    expect(detectLocale(['zh-TW'])).toBe('zh-TW');
    expect(detectLocale(['zh-HK'])).toBe('zh-TW');
    expect(detectLocale(['zh-Hant'])).toBe('zh-TW');
    expect(detectLocale(['zh-CN', 'fr'])).toBe('zh-CN');
    expect(detectLocale(['zh-SG'])).toBe('zh-CN');
    expect(detectLocale(['zh'])).toBe('zh-CN');
  });

  it('picks the plural form by the count, in each language', () => {
    const message = en['vault.count'];
    expect(format(message, 'en', { count: 1 })).toBe('1 account');
    expect(format(message, 'en', { count: 1200 })).toBe('1,200 accounts');
    expect(format(de['vault.count'], 'de', { count: 1200 })).toContain('1.200');
  });
});

/** Every file under a directory with one of these endings. */
function files(dir: string, endings: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, endings);
    return endings.some((ending) => name.endsWith(ending)) ? [path] : [];
  });
}

describe('English that comes from elsewhere', () => {
  it('names only messages that exist', () => {
    const keys = new Set(Object.keys(en));
    const unknown = [...Object.values(KNOWN_MESSAGES), ...KNOWN_PATTERNS.map(([, key]) => key)].filter(
      (key) => !keys.has(key),
    );
    expect(unknown).toEqual([]);
  });

  /**
   * Thrown somewhere a page can show it, but not something a person meets:
   * a programming error, or a guard against a malformed file the friendlier
   * checks above it already refuse.
   */
  const INTERNAL = new Set([
    'KDF iteration count is below the safe minimum',
    'Hex string has odd length',
    'Invalid hex string',
    'digits must be between 6 and 10',
    'period must be positive',
    'Malformed pairing key.',
    'A pairing needs two different keys.',
    'The server returned too short a salt.',
    'Account KDF iteration count is below the safe minimum',
    'Malformed recovery state.',
    'scrypt N must be a power of two',
    // A server that hands out KDF settings the client refuses is a hostile
    // one; the refusal is the protection, and its wording is for the log.
    'Unsupported KDF: 12',
    'Unsupported account KDF: 12',
    'The server asked for an unsupported KDF: 12',
    'The server asked for 12 KDF iterations, ',
  ]);

  // In the core, anything thrown. In the server, only what goes back to a
  // browser: a refusal from a route, or a provider's, relayed. Its start-up
  // and backup messages are for the operator's terminal.
  const thrown = /new (?:Error|DecryptionError)\(\s*(['`])((?:(?!\1).)+)\1/g;
  const sent = /(?:new ProviderRefused\(|fail\(c, \d+, '\w+', )\s*(['`])((?:(?!\1).)+)\1/g;

  for (const [name, dir, literal] of [
    ['@authx/core', resolve(REPO, 'packages/core/src'), thrown],
    ['the sync server', resolve(REPO, 'apps/server/src'), sent],
  ] as const) {
    // The published source has no server; this tree checks it before every
    // release, and a copy without it has nothing of the server's to translate.
    it.skipIf(!existsSync(dir))(`has a translation for every sentence ${name} sends`, () => {
      const missing: string[] = [];
      for (const file of files(dir, ['.ts'])) {
        if (file.endsWith('dev.ts')) continue;
        for (const match of readFileSync(file, 'utf8').matchAll(literal)) {
          // A template's values are matched by shape: try it with a number in.
          const text = match[2]!.replace(/\$\{[^}]+\}/g, '12');
          if (INTERNAL.has(text) || knownMessage(text)) continue;
          missing.push(`${relative(REPO, file)}: ${text}`);
        }
      }
      expect(missing).toEqual([]);
    });
  }
});

/**
 * Text a person reads, written straight into a component. Each of these was
 * once a sentence that stayed English in a German page.
 */
describe('the pages', () => {
  const ATTRIBUTES = new Set(['label', 'title', 'placeholder', 'aria-label', 'description', 'hint', 'subtitle', 'alt', 'footnote', 'badge', 'cancelLabel', 'withoutNativeReader', 'term', 'detail']);
  /** Not words: names, units, a code, an example key. */
  const ALLOWED = /^(?:[\s\d.,:;·•–—+%×/()[\]{}|→←↑↓▲▼'"“”‘’!?#&*@=_-]|AES-256-GCM|Alt|Shift|A|GitHub|Google|SHA-?\d*|otpauth:\/\/[\w/:.?=&@%-]*|JBSW[\w ]*|[X-]{4,}|000000|Keyrook|\d+ s)*$/;

  /**
   * Never shown: a failure of the browser's own key store, which leaves the
   * vault locked rather than saying anything; and an English message that
   * only travels with a key that is shown instead.
   */
  const QUIET = new Set([
    'Could not open the key store.',
    'Key store request failed.',
    'Key store transaction aborted.',
    'No response from the background service worker.',
  ]);

  /** Three or more words from a capital: how every sentence on these pages begins. */
  const SENTENCE = /^[A-Z][a-z’']+(?:[ ,][\w’'.,—-]+){2,}/;

  function hardcoded(file: string): string[] {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) {
        const text = node.getText().trim();
        if (/[A-Za-z]{2,}/.test(text) && !ALLOWED.test(text)) found.push(text);
      }
      // A sentence anywhere else: in a ternary, a state setter, a table.
      if (
        ts.isStringLiteralLike(node) &&
        SENTENCE.test(node.text) &&
        !ts.isImportDeclaration(node.parent) &&
        !knownMessage(node.text) &&
        !QUIET.has(node.text)
      ) {
        found.push(node.text);
      }
      if (ts.isJsxAttribute(node) && ATTRIBUTES.has(node.name.getText()) && node.initializer) {
        const value = ts.isStringLiteral(node.initializer)
          ? node.initializer.text
          : ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isStringLiteralLike(node.initializer.expression)
            ? node.initializer.expression.text
            : null;
        if (value && /[a-z]{3,}/.test(value) && !ALLOWED.test(value)) found.push(`${node.name.getText()}="${value}"`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found.map((text) => `${relative(ROOT, file)}: ${text}`);
  }

  it('say nothing that is not in a language file', () => {
    const pages = files(resolve(ROOT, 'src'), ['.tsx', '.ts']).filter(
      (file) =>
        !file.includes('/i18n/') &&
        !file.includes('/background/') &&
        !file.endsWith('.d.ts') &&
        // Service names, generated from the icon sets.
        !file.endsWith('brand-icons.ts'),
    );
    expect(pages.flatMap(hardcoded)).toEqual([]);
  });
});
