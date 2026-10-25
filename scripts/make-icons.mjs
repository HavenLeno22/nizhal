// Renders the app icon (same geometry as public/icon.svg) to PNG without any
// dependencies: signed-distance shapes, 4×4 supersampling, zlib for the PNG.
// Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const NEEM = hex('#1e5b43');
const LIME = hex('#eef1ec');
const SUN = hex('#f1d36d');

// Shapes in the 512 × 512 design space.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function polyline(px, py, pts, width) {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  return d <= width / 2;
}
function roundedRect(px, py, x, y, w, h, r) {
  const cx = Math.max(x + r, Math.min(px, x + w - r));
  const cy = Math.max(y + r, Math.min(py, y + h - r));
  return Math.hypot(px - cx, py - cy) <= r && px >= x && px <= x + w && py >= y && py <= y + h;
}

/** Colour of the icon at a point (or null for transparent), in design space. */
function shade(px, py, maskable) {
  // Maskable icons need full-bleed background; the art is scaled into the safe zone.
  if (!maskable && !roundedRect(px, py, 0, 0, 512, 512, 112)) return null;
  let qx = px;
  let qy = py;
  if (maskable) {
    qx = 256 + (px - 256) / 0.8;
    qy = 256 + (py - 256) / 0.8;
  }
  let c = NEEM;
  if (Math.hypot(qx - 356, qy - 150) <= 54) c = SUN;
  if (qx >= 212 && qx <= 300 && qy >= 318 && qy <= 396) c = mix(c, LIME, 0.28);
  if (polyline(qx, qy, [[92, 262], [256, 130], [420, 262]], 30)) c = LIME;
  if (polyline(qx, qy, [[132, 240], [132, 396], [380, 396], [380, 240]], 26)) c = LIME;
  return c;
}
function mix(a, b, t) {
  return a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
}

function render(size, maskable) {
  const ss = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const dx = ((x + (sx + 0.5) / ss) / size) * 512;
          const dy = ((y + (sy + 0.5) / ss) / size) * 512;
          const c = shade(dx, dy, maskable);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a++;
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return encodePng(size, size, px);
}

// ---- Minimal PNG encoder (RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
writeFileSync(join(out, 'icon-192.png'), render(192, true));
writeFileSync(join(out, 'icon-512.png'), render(512, true));
writeFileSync(join(out, 'icon-64.png'), render(64, false));
console.log('Wrote icon-192.png, icon-512.png, icon-64.png');
