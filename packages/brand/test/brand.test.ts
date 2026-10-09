import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATOR_MARK,
  AUTHENTICATOR_MARK_COMPACT,
  CRAYON,
  ICONS,
  ICON_GROUPS,
  INK,
  LETTERING_PEN,
  LOCKUP_HORIZONTAL,
  LOCKUP_STACKED,
  MARK_COMPACT,
  MARK_FULL,
  NEUTRAL,
  PAPER,
  ROLES,
  SPACE,
  TYPE,
  WORDMARK,
  authenticatorMarkFor,
  iconSvg,
  letter,
  markFor,
  markSvg,
  type IconName,
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
  // Lettering is laid out at run time; every glyph and every mark goes through
  // the same rasteriser and the same view box as the drawings above.
  'letter a–m': letter('abcdefghijklm'),
  'letter n–z': letter('nopqrstuvwxyz'),
  'letter digits and stops': letter("0123456789 .,!?-'"),
  'letter đ and the hats': letter('đơưăâêô'),
  'letter tones': letter('á à ả ã ạ'),
  'letter tones on â': letter('ấ ầ ẩ ẫ ậ'),
  'letter tones on ă': letter('ắ ằ ẳ ẵ ặ'),
  'letter tones on ê': letter('ế ề ể ễ ệ'),
  'letter tones on ô': letter('ố ồ ổ ỗ ộ'),
  'letter tones on ơ': letter('ớ ờ ở ỡ ợ'),
  'letter tones on ư': letter('ứ ừ ử ữ ự'),
  'letter tones on i': letter('í ì ỉ ĩ ị'),
  'letter tones on y': letter('ý ỳ ỷ ỹ ỵ'),
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

describe('icons', () => {
  const entries = Object.entries(ICONS) as [IconName, (typeof ICONS)[IconName]][];

  // Same reason as the drawings: the rasteriser reads M, L and C and nothing else.
  it.each(entries)('%s uses only the path commands the rasteriser reads', (_, icon) => {
    const arity: Record<string, number> = { M: 2, L: 2, C: 6 };
    const commands = icon.d.match(/[A-Za-z][^A-Za-z]*/g) ?? [];
    expect(commands.length > 0 || ('dots' in icon && icon.dots.length > 0)).toBe(true);
    for (const command of commands) {
      const letter = command[0]!;
      expect(Object.keys(arity), `${letter} in ${icon.d}`).toContain(letter);
      const numbers = command.slice(1).trim().split(/[\s,]+/).filter(Boolean);
      expect(numbers.every((n) => Number.isFinite(Number(n)))).toBe(true);
      expect(numbers.length % arity[letter]!).toBe(0);
    }
  });

  // Inside the 24-unit box with the pen's half-width to spare, or the round
  // ends are shaved off at every size.
  it.each(entries)('%s stays inside its grid', (_, icon) => {
    for (const value of (icon.d.match(/-?\d*\.?\d+/g) ?? []).map(Number)) {
      expect(value - 1).toBeGreaterThanOrEqual(0);
      expect(value + 1).toBeLessThanOrEqual(24);
    }
    for (const [cx, cy, r] of 'dots' in icon ? icon.dots : []) {
      expect(Math.min(cx, cy) - r).toBeGreaterThanOrEqual(0);
      expect(Math.max(cx, cy) + r).toBeLessThanOrEqual(24);
    }
  });

  it('files every icon in exactly one group', () => {
    const grouped = Object.values(ICON_GROUPS).flat();
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(Object.keys(ICONS).sort());
  });

  it('keeps the line steady on screen whatever the size', () => {
    expect(iconSvg('copy', { size: 24 })).toContain('stroke-width="2"');
    // 1.5 px at 16 px is 2.25 units of a 24-unit grid.
    expect(iconSvg('copy', { size: 16 })).toContain('stroke-width="2.25"');
    expect(iconSvg('copy', { size: 48 })).toContain('stroke-width="1.5"');
  });

  it('writes a title as text, never as markup', () => {
    const svg = iconSvg('copy', { title: '<script>x</script>" onload="y', className: '" onclick="z' });
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('" onload="');
    expect(svg).not.toContain('" onclick="');
  });
});

describe('lettering', () => {
  const strokes = (mark: Mark) => mark.parts.filter((part) => part.kind === 'stroke');

  it('is drawn in the wordmark’s one pen', () => {
    const pen = WORDMARK.parts.find((part) => part.kind === 'stroke');
    expect(pen && 'width' in pen && pen.width).toBe(LETTERING_PEN);
    for (const part of letter('giữ chìa khoá').parts) expect(part).toMatchObject({ kind: 'stroke', width: LETTERING_PEN });
  });

  // The wordmark is a drawing of its own; lettering it would be a second,
  // slightly different wordmark loose in the world.
  it.each(['keyrook', 'Keyrook', 'by KEYROOK'])('refuses to letter %s', (text) => {
    expect(() => letter(text)).toThrow(/wordmark/);
  });

  it('is for a few display words, not a sentence', () => {
    expect(() => letter('one two three four five')).not.toThrow();
    expect(() => letter('one two three four five six')).toThrow(/five/);
    expect(() => letter('   ')).toThrow();
  });

  // Drawing a stand-in for a letter it lacks would spell something else.
  it.each(['ß', '€', 'ü', 'ñ', 'ŷ', 'ج', '字'])('refuses a character it has no drawing for: %s', (char) => {
    expect(() => letter(char)).toThrow(/No lettering/);
  });

  it('is lower case, as the wordmark is', () => {
    expect(letter('GIỮ CHÌA')).toEqual(letter('giữ chìa'));
  });

  it('drops the dot of an i that carries a mark above, and keeps it under a dot below', () => {
    const hasDot = (mark: Mark) => strokes(mark).some((part) => part.kind === 'stroke' && part.d.includes('L'));
    expect(hasDot(letter('i'))).toBe(true);
    expect(hasDot(letter('í'))).toBe(false);
    expect(hasDot(letter('ị'))).toBe(true);
  });

  it('gives ơ and ư their horn and the room for it', () => {
    expect(strokes(letter('ơ'))).toHaveLength(2);
    expect(letter('ơ').view[2]).toBeGreaterThan(letter('o').view[2]);
  });

  it('speaks the words it draws', () => {
    expect(markSvg(letter('giữ chìa khoá'), { title: 'giữ chìa khoá' })).toContain('aria-label="giữ chìa khoá"');
  });
});

describe('what brand.css animates', () => {
  // .kr-blink finds the crow's eye as its first circle. A part moved ahead of
  // it would make the key ring blink instead.
  it.each([
    ['MARK_FULL', MARK_FULL],
    ['MARK_COMPACT', MARK_COMPACT],
  ] as const)('%s draws its eye as its first circle', (_, mark) => {
    const first = mark.parts.find((part) => part.kind === 'disc' || part.kind === 'ring');
    expect(first).toMatchObject({ kind: 'disc', colour: CRAYON.yellow[500] });
  });

  // .kr-wait lights the Authenticator ticks in the order they are drawn; that
  // order has to go round the dial clockwise from twelve.
  it.each([
    ['AUTHENTICATOR_MARK', AUTHENTICATOR_MARK],
    ['AUTHENTICATOR_MARK_COMPACT', AUTHENTICATOR_MARK_COMPACT],
  ] as const)('%s draws its ticks clockwise from twelve', (_, mark) => {
    const angles = mark.parts.map((part) => {
      const numbers = (part.kind === 'stroke' ? part.d : '').match(/-?\d*\.?\d+/g)!.map(Number);
      const [x, y] = numbers.slice(-2) as [number, number];
      const degrees = (Math.atan2(y - 50, x - 50) * 180) / Math.PI;
      // Twelve o'clock is -90°; start the dial just before it so it reads as the first tick.
      return degrees < -100 ? degrees + 360 : degrees;
    });
    expect(angles[0]).toBeCloseTo(-90, -1);
    for (let i = 1; i < angles.length; i++) expect(angles[i]!).toBeGreaterThan(angles[i - 1]!);
  });
});

describe('measures', () => {
  it('keeps space and line heights on the 4 px beat', () => {
    for (const px of Object.values(SPACE)) expect(px % 4).toBe(0);
    for (const t of Object.values(TYPE)) expect(t.line % 2).toBe(0);
  });

  it('sets nothing smaller than 12 px', () => {
    for (const t of Object.values(TYPE)) expect(t.size).toBeGreaterThanOrEqual(12);
  });
});
