/**
 * Generates the extension icons with no image dependencies.
 *
 *   node scripts/gen-icons.mjs <out dir> [sizes…]     default 16 32 48 128
 *
 * The mark is a countdown asterisk: eight rounded ticks round a centre, like
 * the dial of the 30-second timer every authenticator code runs on, and like
 * the asterisks that mask a password. Shapes are coverage functions,
 * supersampled, so the 16 px icon stays legible instead of jagged. The same
 * geometry is drawn as SVG by `Logo` in apps/extension/src/ui/icons.tsx.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 6;

// In units of the icon's side, centred on (0.5, 0.5).
const TICK_FROM = 0.18; // centre of a tick's inner cap
const TICK_TO = 0.41; // centre of its outer cap
const TICK_HALF_WIDTH = 0.0625;

// Clockwise from twelve o'clock.
const COLOURS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#4285F4', '#EA4335', '#FBBC05', '#34A853'].map(
  (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)),
);

const TICKS = COLOURS.map((colour, index) => {
  const angle = -Math.PI / 2 + (index * Math.PI) / 4;
  return {
    colour,
    x1: 0.5 + TICK_FROM * Math.cos(angle),
    y1: 0.5 + TICK_FROM * Math.sin(angle),
    x2: 0.5 + TICK_TO * Math.cos(angle),
    y2: 0.5 + TICK_TO * Math.sin(angle),
  };
});

/** The tick covering (x, y), if any: within half a width of its centre line. */
function tickAt(x, y) {
  for (const tick of TICKS) {
    const dx = tick.x2 - tick.x1;
    const dy = tick.y2 - tick.y1;
    const t = Math.max(0, Math.min(1, ((x - tick.x1) * dx + (y - tick.y1) * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(x - (tick.x1 + t * dx), y - (tick.y1 + t * dy)) <= TICK_HALF_WIDTH) return tick;
  }
  return null;
}

function renderRgba(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const tick = tickAt((px + (sx + 0.5) / SUPERSAMPLE) / size, (py + (sy + 0.5) / SUPERSAMPLE) / size);
          if (!tick) continue;
          hits++;
          for (let i = 0; i < 3; i++) sum[i] += tick.colour[i];
        }
      }
      const offset = (py * size + px) * 4;
      if (hits === 0) continue; // Transparent: the toolbar shows through.
      // Colour averaged over the covered samples only, so an edge pixel keeps
      // its tick's hue and fades by alpha rather than towards black.
      for (let i = 0; i < 3; i++) pixels[offset + i] = Math.round(sum[i] / hits);
      pixels[offset + 3] = Math.round((hits / samples) * 255);
    }
  }
  return pixels;
}

// --- Minimal PNG writer -----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = resolve(process.cwd(), process.argv[2] ?? 'icons');
const sizes = process.argv.slice(3).map(Number).filter(Boolean);
mkdirSync(outDir, { recursive: true });

for (const size of sizes.length ? sizes : DEFAULT_SIZES) {
  const file = resolve(outDir, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, renderRgba(size)));
  console.log(`✓ ${file}`);
}
