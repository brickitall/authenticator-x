/**
 * Generates the extension icons with no image dependencies.
 *
 * The mark is a countdown ring — the visual every authenticator user already
 * associates with a rotating code — over an indigo→violet rounded square.
 * Shapes are described as coverage functions and 4× supersampled, which keeps
 * the 16 px icon legible instead of jagged.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;

const GRADIENT_FROM = [79, 70, 229]; // #4F46E5
const GRADIENT_TO = [124, 58, 237]; // #7C3AED

const CORNER_RADIUS = 0.225;
const RING_OUTER = 0.335;
const RING_INNER = 0.215;
const RING_SWEEP = 0.86; // Fraction of the circle drawn; the gap sits at twelve o'clock.
const DOT_RADIUS = 0.085;

/** Signed coverage of a rounded square centred on (0.5, 0.5). */
function insideRoundedSquare(x, y) {
  const inset = 0.045;
  const half = 0.5 - inset;
  const r = CORNER_RADIUS;
  const dx = Math.abs(x - 0.5) - (half - r);
  const dy = Math.abs(y - 0.5) - (half - r);
  if (dx <= 0 || dy <= 0) return Math.abs(x - 0.5) <= half && Math.abs(y - 0.5) <= half;
  return Math.hypot(dx, dy) <= r;
}

function insideRing(x, y) {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const dist = Math.hypot(dx, dy);
  if (dist > RING_OUTER || dist < RING_INNER) return false;
  // 0 at twelve o'clock, increasing clockwise. The gap is centred on 0 so the
  // mark reads as a timer that has just started rather than as a letter.
  let angle = Math.atan2(dx, -dy);
  if (angle < 0) angle += Math.PI * 2;
  const gapHalf = Math.PI * (1 - RING_SWEEP);
  return angle >= gapHalf && angle <= Math.PI * 2 - gapHalf;
}

function insideDot(x, y) {
  return Math.hypot(x - 0.5, y - 0.5) <= DOT_RADIUS;
}

function renderRgba(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SUPERSAMPLE);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgHits = 0;
      let fgHits = 0;
      let gradientSum = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / size;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / size;
          if (!insideRoundedSquare(x, y)) continue;
          bgHits++;
          gradientSum += (x + y) / 2;
          if (insideRing(x, y) || insideDot(x, y)) fgHits++;
        }
      }

      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const offset = (py * size + px) * 4;
      if (bgHits === 0) {
        pixels.writeUInt32BE(0, offset); // Fully transparent outside the tile.
        continue;
      }

      const t = gradientSum / bgHits;
      const base = GRADIENT_FROM.map((from, i) => Math.round(from + (GRADIENT_TO[i] - from) * t));
      const fgRatio = fgHits / bgHits;
      const rgb = base.map((channel) => Math.round(channel + (255 - channel) * fgRatio));

      pixels[offset] = rgb[0];
      pixels[offset + 1] = rgb[1];
      pixels[offset + 2] = rgb[2];
      pixels[offset + 3] = Math.round((bgHits / samples) * 255);
      // step is unused per-pixel but documents the sampling grid density.
      void step;
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
mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  const file = resolve(outDir, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, renderRgba(size)));
  console.log(`✓ ${file}`);
}
