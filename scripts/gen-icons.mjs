/**
 * Generates the extension icons with no image dependencies.
 *
 *   node scripts/gen-icons.mjs <out dir> [sizes…]     default 16 32 48 128
 *
 * The icon is Keyrook Authenticator's own mark, the crayon asterisk
 * (packages/brand/src/authenticator.ts) — never the Keyrook crow, which is the
 * brand's. Below 32 px the compact drawing, straighter and thicker, so a tick
 * stays a tick at that size. Drawn by scripts/raster.mjs.
 *
 * At 128 px the mark is drawn 96 px across with 16 px clear on each side, as
 * the Chrome Web Store asks of the icon it shows beside a listing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { authenticatorMarkFor as markFor } from '../packages/brand/src/authenticator.ts';
import { renderPng } from './raster.mjs';

const DEFAULT_SIZES = [16, 32, 48, 128];

const outDir = resolve(process.cwd(), process.argv[2] ?? 'icons');
const sizes = process.argv.slice(3).map(Number).filter(Boolean);
mkdirSync(outDir, { recursive: true });

/** The same drawing with room round it: `art` of every `size` pixels is mark. */
function padded(mark, art, size) {
  const [x, y, width, height] = mark.view;
  const grow = (width * size) / art - width;
  return { ...mark, view: [x - grow / 2, y - grow / 2, width + grow, height + grow] };
}

for (const size of sizes.length ? sizes : DEFAULT_SIZES) {
  const file = resolve(outDir, `icon-${size}.png`);
  const mark = size === 128 ? padded(markFor(96), 96, 128) : markFor(size);
  writeFileSync(file, renderPng(mark, { width: size }));
  console.log(`✓ ${file}`);
}
