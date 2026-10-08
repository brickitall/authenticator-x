/**
 * Draws a Keyrook drawing (packages/brand/src/mark.ts) to a PNG with no image
 * dependencies, for the extension icons and the brand kit.
 *
 * Every part is a coverage function, supersampled, so a 16 px icon stays
 * legible instead of jagged. With `sticker`, the whole drawing gets a paper
 * outline, like a cut-out: the crow is near-black, and without it the toolbar
 * icon vanishes on a dark theme.
 */
import { deflateSync } from 'node:zlib';
import { INK, PAPER } from '../packages/brand/src/tokens.ts';

const CURVE_STEPS = 24;

const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

/** Absolute M, L, C and Z, flattened to polylines. */
function flatten(d) {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g);
  const paths = [];
  let current = null;
  let i = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === 'M') {
      current = { points: [[num(), num()]], closed: false };
      paths.push(current);
    } else if (command === 'L') {
      current.points.push([num(), num()]);
    } else if (command === 'C') {
      const [x0, y0] = current.points.at(-1);
      const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
      for (let step = 1; step <= CURVE_STEPS; step++) {
        const t = step / CURVE_STEPS;
        const s = 1 - t;
        current.points.push([
          s * s * s * x0 + 3 * s * s * t * x1 + 3 * s * t * t * x2 + t * t * t * x3,
          s * s * s * y0 + 3 * s * s * t * y1 + 3 * s * t * t * y2 + t * t * t * y3,
        ]);
      }
    } else if (command === 'Z') {
      current.closed = true;
    } else {
      throw new Error(`path command ${command} is not one the rasteriser reads`);
    }
  }
  return paths;
}

function segmentsOf(paths) {
  const segments = [];
  for (const { points, closed } of paths) {
    for (let k = 1; k < points.length; k++) segments.push([...points[k - 1], ...points[k]]);
    if (closed) segments.push([...points.at(-1), ...points[0]]);
  }
  return segments;
}

function distanceToSegments(x, y, segments) {
  let best = Infinity;
  for (const [x1, y1, x2, y2] of segments) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return best;
}

/** Non-zero winding, the SVG default fill rule. */
function inside(x, y, segments) {
  let winding = 0;
  for (const [x1, y1, x2, y2] of segments) {
    if (y1 <= y) {
      if (y2 > y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0) winding++;
    } else if (y2 <= y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0) winding--;
  }
  return winding !== 0;
}

/**
 * Each part as a test for "covers (x, y)" grown by `grow` units, so the same
 * function draws the part (grow 0) and its share of the outline.
 */
function compile(part, ink, mono) {
  const colour = rgb(mono ?? (part.colour === 'ink' ? ink : part.colour));
  if (part.kind === 'disc' || part.kind === 'ring') {
    const outer = part.r + (part.kind === 'ring' ? part.width / 2 : 0);
    return {
      colour,
      extent: [part.cx - outer, part.cy - outer, part.cx + outer, part.cy + outer],
      covers(x, y, grow) {
        const distance = Math.hypot(x - part.cx, y - part.cy);
        if (part.kind === 'disc' || grow > 0) return distance <= outer + grow;
        return Math.abs(distance - part.r) <= part.width / 2;
      },
    };
  }
  const segments = segmentsOf(flatten(part.d));
  const xs = segments.flatMap(([x1, , x2]) => [x1, x2]);
  const ys = segments.flatMap(([, y1, , y2]) => [y1, y2]);
  const half = part.kind === 'stroke' ? part.width / 2 : 0;
  return {
    colour,
    extent: [Math.min(...xs) - half, Math.min(...ys) - half, Math.max(...xs) + half, Math.max(...ys) + half],
    covers(x, y, grow) {
      if (part.kind === 'fill' && inside(x, y, segments)) return true;
      return distanceToSegments(x, y, segments) <= half + grow;
    },
  };
}

/**
 * @param {import('../packages/brand/src/mark.ts').Mark} mark
 * @param {{ width: number, height?: number, sticker?: boolean, ink?: string, mono?: string, background?: string }} options
 */
export function renderPng(mark, { width, height, sticker = false, ink = INK, mono, background }) {
  const [left, top, viewWidth, viewHeight] = mark.view;
  height ??= Math.round((width * viewHeight) / viewWidth);
  const scale = viewWidth / width;
  const parts = mark.parts.map((part) => compile(part, ink, mono));
  const paper = rgb(PAPER);
  const backdrop = background ? rgb(background) : null;
  const supersample = Math.max(width, height) <= 48 ? 6 : 3;
  const samples = supersample * supersample;
  const pixels = Buffer.alloc(width * height * 4);

  const near = (part, x, y, grow) =>
    x >= part.extent[0] - grow && x <= part.extent[2] + grow && y >= part.extent[1] - grow && y <= part.extent[3] + grow;

  const colourAt = (x, y) => {
    // Later parts are drawn over earlier ones, as in the SVG.
    for (let k = parts.length - 1; k >= 0; k--) {
      if (near(parts[k], x, y, 0) && parts[k].covers(x, y, 0)) return parts[k].colour;
    }
    if (sticker) {
      for (const part of parts) if (near(part, x, y, mark.halo) && part.covers(x, y, mark.halo)) return paper;
    }
    return backdrop;
  };

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let hits = 0;
      const sum = [0, 0, 0];
      for (let sy = 0; sy < supersample; sy++) {
        for (let sx = 0; sx < supersample; sx++) {
          const colour = colourAt(
            left + (px + (sx + 0.5) / supersample) * scale,
            top + (py + (sy + 0.5) / supersample) * scale,
          );
          if (!colour) continue;
          hits++;
          for (let i = 0; i < 3; i++) sum[i] += colour[i];
        }
      }
      const offset = (py * width + px) * 4;
      if (hits === 0) continue; // Transparent: whatever is behind shows through.
      // Colour averaged over the covered samples only, so an edge pixel keeps
      // its part's hue and fades by alpha rather than towards black.
      for (let i = 0; i < 3; i++) pixels[offset + i] = Math.round(sum[i] / hits);
      pixels[offset + 3] = Math.round((hits / samples) * 255);
    }
  }
  return encodePng(width, height, pixels);
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

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline.
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
