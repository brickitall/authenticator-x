import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATOR_MARK,
  AUTHENTICATOR_MARK_COMPACT,
  CRAYON,
  INK,
  LOCKUP_HORIZONTAL,
  LOCKUP_STACKED,
  MARK_COMPACT,
  MARK_FULL,
  NEUTRAL,
  PAPER,
  ROLES,
  WORDMARK,
  authenticatorMarkFor,
  markFor,
  markSvg,
  type Mark,
} from '@keyrook/brand';

const DRAWINGS: Record<string, Mark> = {
  AUTHENTICATOR_MARK,
  AUTHENTICATOR_MARK_COMPACT,
  MARK_FULL,
  MARK_COMPACT,
  WORDMARK,
  LOCKUP_HORIZONTAL,
  LOCKUP_STACKED,
};

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => {
    const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

describe('drawings', () => {
  // scripts/raster.mjs reads absolute M, L, C and Z and nothing else; a
  // relative command or an arc would be drawn as garbage in every icon.
  it.each(Object.entries(DRAWINGS))('%s uses only the path commands the rasteriser reads', (_, mark) => {
    const arity: Record<string, number> = { M: 2, L: 2, C: 6, Z: 0 };
    for (const part of mark.parts) {
      if (part.kind !== 'fill' && part.kind !== 'stroke') continue;
      const commands = part.d.match(/[A-Za-z][^A-Za-z]*/g) ?? [];
      expect(commands.length).toBeGreaterThan(0);
      for (const command of commands) {
        const letter = command[0]!;
        expect(Object.keys(arity), `${letter} in ${part.d}`).toContain(letter);
        const numbers = command.slice(1).trim().split(/[\s,]+/).filter(Boolean);
        expect(numbers.every((n) => Number.isFinite(Number(n)))).toBe(true);
        expect(numbers.length % Math.max(arity[letter]!, 1)).toBe(0);
        if (letter === 'Z') expect(numbers).toHaveLength(0);
      }
    }
  });

  // A drawing that pokes out of its view box is cropped in every PNG.
  it.each(Object.entries(DRAWINGS))('%s fits inside its view box', (_, mark) => {
    const [x, y, width, height] = mark.view;
    for (const part of mark.parts) {
      const reach = part.kind === 'stroke' || part.kind === 'ring' ? part.width / 2 : 0;
      const points =
        part.kind === 'fill' || part.kind === 'stroke'
          ? (part.d.match(/-?\d*\.?\d+/g) ?? []).map(Number).reduce<[number, number][]>((pairs, value, index, all) => {
              if (index % 2 === 0) pairs.push([value, all[index + 1]!]);
              return pairs;
            }, [])
          : [
              [part.cx - part.r, part.cy - part.r],
              [part.cx + part.r, part.cy + part.r],
            ];
      for (const [px, py] of points) {
        expect(px - reach).toBeGreaterThanOrEqual(x);
        expect(py - reach).toBeGreaterThanOrEqual(y);
        expect(px + reach).toBeLessThanOrEqual(x + width);
        expect(py + reach).toBeLessThanOrEqual(y + height);
      }
    }
  });

  it('uses the compact drawings below 32 px and the full ones from there', () => {
    expect(markFor(16)).toBe(MARK_COMPACT);
    expect(markFor(24)).toBe(MARK_COMPACT);
    expect(markFor(32)).toBe(MARK_FULL);
    expect(markFor(512)).toBe(MARK_FULL);
    expect(authenticatorMarkFor(16)).toBe(AUTHENTICATOR_MARK_COMPACT);
    expect(authenticatorMarkFor(32)).toBe(AUTHENTICATOR_MARK);
  });

  // The crow is Keyrook's; a product carries its own mark. Sharing a single
  // part with the crow would be the crow by another route.
  it('keeps the Authenticator mark free of any part of the crow', () => {
    const crow = new Set([...MARK_FULL.parts, ...MARK_COMPACT.parts].map((part) => JSON.stringify(part)));
    for (const mark of [AUTHENTICATOR_MARK, AUTHENTICATOR_MARK_COMPACT]) {
      for (const part of mark.parts) expect(crow.has(JSON.stringify(part))).toBe(false);
    }
  });

  it('writes a title as text, never as markup', () => {
    const svg = markSvg(MARK_FULL, { title: '<script>x</script>" onload="y' });
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('" onload="');
  });
});

describe('colour', () => {
  // The first icon used Google's own four colours. Nothing in the brand may
  // drift back to them: it is the quickest way to look like someone else.
  it('never uses Google’s exact brand colours', () => {
    const google = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'];
    const ours = [
      INK,
      PAPER,
      ...Object.values(NEUTRAL),
      ...Object.values(CRAYON).flatMap((ramp) => Object.values(ramp)),
      ...Object.values(DRAWINGS).flatMap((mark) => mark.parts.map((part) => part.colour)),
    ].map((hex) => hex.toUpperCase());
    for (const hex of google) expect(ours).not.toContain(hex);
  });

  // Eight coloured ticks are already close to Google's look. What keeps the
  // asterisk ours is its hues (above) and its order: never blue, red,
  // yellow, green clockwise from any tick.
  it.each([
    ['AUTHENTICATOR_MARK', AUTHENTICATOR_MARK],
    ['AUTHENTICATOR_MARK_COMPACT', AUTHENTICATOR_MARK_COMPACT],
  ] as const)('%s does not run its colours in Google’s order', (_, mark) => {
    const name = Object.fromEntries(
      Object.entries(CRAYON).map(([crayon, ramp]) => [ramp[500].toUpperCase(), crayon]),
    );
    const order = mark.parts.map((part) => name[part.colour.toUpperCase()]);
    expect(order.every(Boolean)).toBe(true);
    const google = ['blue', 'red', 'yellow', 'green'];
    for (let start = 0; start < order.length; start++) {
      const run = [0, 1, 2, 3].map((k) => order[(start + k) % order.length]);
      expect(run).not.toEqual(google);
      expect(run).not.toEqual([...google].reverse());
    }
  });

  it.each(Object.entries(ROLES))('%s text holds 4.5:1 on its page, light and dark', (_, role) => {
    const ramp = CRAYON[role.crayon];
    expect(contrast(ramp[role.light], PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ramp[role.light], NEUTRAL[0])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ramp[role.dark], NEUTRAL[950])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ramp[role.dark], NEUTRAL[900])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps ink on paper readable, and the muted text the CSS uses', () => {
    expect(contrast(INK, PAPER)).toBeGreaterThanOrEqual(7);
    expect(contrast(NEUTRAL[600], PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(NEUTRAL[400], NEUTRAL[950])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the package', () => {
  // The brand is shared by the extension, the site and future apps that are
  // not browsers. A platform reference here would tie all of them to one.
  it('references no browser or extension API', () => {
    const dir = join(import.meta.dirname, '../src');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(source, file).not.toMatch(/\b(window|document|navigator|chrome)\s*\./);
    }
  });
});
