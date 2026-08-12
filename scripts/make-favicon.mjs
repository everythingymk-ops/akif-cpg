// One-off favicon generator (zero deps): renders the app/icon.svg motif —
// three white waterfall bars on the green-ink rounded square — into a
// 2-frame app/favicon.ico (32px + 16px, 32-bit BMP-in-ICO).
// Run: node scripts/make-favicon.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const GREEN = [0x22, 0x52, 0x41]; // --primary oklch(0.40 0.06 168) in sRGB
const WHITE = [0xff, 0xff, 0xff];

const mix = (fg, bg, a) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));

/** Draw the glyph at `size` px; returns RGBA per pixel (top-down rows). */
function draw(size) {
  const s = size / 32; // geometry is authored on the 32px grid of icon.svg
  const radius = 7 * s;
  const bars = [
    { y: 8 * s, w: 18 * s, color: mix(WHITE, GREEN, 0.95) },
    { y: 14 * s, w: 13 * s, color: mix(WHITE, GREEN, 0.8) },
    { y: 20 * s, w: 8 * s, color: mix(WHITE, GREEN, 0.65) },
  ];
  const barX = 7 * s;
  const barH = 4 * s;

  const inRoundedSquare = (x, y) => {
    const cx = Math.min(Math.max(x, radius), size - radius);
    const cy = Math.min(Math.max(y, radius), size - radius);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };

  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRoundedSquare(x + 0.5, y + 0.5)) continue; // transparent
      let color = GREEN;
      for (const bar of bars) {
        if (x + 0.5 >= barX && x + 0.5 < barX + bar.w && y + 0.5 >= bar.y && y + 0.5 < bar.y + barH) {
          color = bar.color;
        }
      }
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = 255;
    }
  }
  return px;
}

/** Encode one frame as BMP-in-ICO (BITMAPINFOHEADER + BGRA bottom-up + AND mask). */
function bmpFrame(size, rgba) {
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const data = Buffer.alloc(40 + size * size * 4 + maskRowBytes * size);
  data.writeUInt32LE(40, 0); // header size
  data.writeInt32LE(size, 4);
  data.writeInt32LE(size * 2, 8); // height doubled: image + AND mask
  data.writeUInt16LE(1, 12); // planes
  data.writeUInt16LE(32, 14); // bpp
  let o = 40;
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[o++] = rgba[i + 2]; // B
      data[o++] = rgba[i + 1]; // G
      data[o++] = rgba[i]; // R
      data[o++] = rgba[i + 3]; // A
    }
  }
  // AND mask: all zero (alpha channel carries transparency)
  return data;
}

const sizes = [32, 16];
const frames = sizes.map((s) => ({ size: s, data: bmpFrame(s, draw(s)) }));
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((f, n) => {
  const e = 6 + n * 16;
  header[e] = f.size; // width
  header[e + 1] = f.size; // height
  header.writeUInt16LE(1, e + 4); // planes
  header.writeUInt16LE(32, e + 6); // bpp
  header.writeUInt32LE(f.data.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += f.data.length;
});

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "favicon.ico");
writeFileSync(out, Buffer.concat([header, ...frames.map((f) => f.data)]));
console.log(`wrote ${out} (${offset} bytes, sizes: ${sizes.join(", ")})`);
