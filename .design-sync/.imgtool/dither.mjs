// Offline replication of @paper-design/shaders ImageDithering fragment shader
// (v0.0.77) for DitherPhoto defaults: type "4x4", colorSteps 2, size 3, cover,
// speed 0. Everything runs in raw sRGB byte space (the shader uses a plain
// RGBA/UNSIGNED_BYTE texture and raw hex colors -- no gamma linearization).

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const SRC_DIR = path.join(REPO, "public/brand");
const OUT_DIR = path.join(REPO, ".design-sync/assets/brand-dithered");

// DitherPhoto defaults
const COLOR_BACK = [0x0b, 0x0d, 0x12]; // #0b0d12
const COLOR_FRONT = [0xcd, 0xd4, 0xf7]; // #cdd4f7
const COLOR_HIGHLIGHT = [0xff, 0xff, 0xff]; // #ffffff
const COLOR_STEPS = 2;
const PX_SIZE = 3; // size=3, pixelRatio=1
const MAX_SIDE = 1200;

// Bayer 4x4, values 0..15 (indexed row-major, matches shader bayer4x4)
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const JOBS = [
  { name: "proof", inverted: true },
  { name: "web", inverted: true },
  { name: "swarm", inverted: true },
  { name: "signal", inverted: false }, // footer uses inverted={false}
];

function mod(n, m) {
  return ((n % m) + m) % m;
}

// bilinear sample of resized RGB buffer (channels=3), CLAMP_TO_EDGE
function sample(buf, W, H, fx, fy) {
  // clamp to edge in texel space
  let x = fx - 0.5;
  let y = fy - 0.5;
  let x0 = Math.floor(x);
  let y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  let x1 = x0 + 1;
  let y1 = y0 + 1;
  const cx = (v) => Math.min(Math.max(v, 0), W - 1);
  const cy = (v) => Math.min(Math.max(v, 0), H - 1);
  x0 = cx(x0);
  x1 = cx(x1);
  y0 = cy(y0);
  y1 = cy(y1);
  const idx = (xx, yy) => (yy * W + xx) * 3;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const p00 = buf[idx(x0, y0) + c];
    const p10 = buf[idx(x1, y0) + c];
    const p01 = buf[idx(x0, y1) + c];
    const p11 = buf[idx(x1, y1) + c];
    const top = p00 + (p10 - p00) * tx;
    const bot = p01 + (p11 - p01) * tx;
    out[c] = (top + (bot - top) * ty) / 255; // 0..1
  }
  return out;
}

async function processImage({ name, inverted }) {
  const srcPath = path.join(SRC_DIR, `${name}.webp`);
  const meta = await sharp(srcPath).metadata();
  const ar = meta.width / meta.height;

  // Canvas uses the image's own aspect ratio so cover == exact fit (no crop),
  // matching the shader's cover mapping as an identity. Cap longest side.
  let W, H;
  if (ar >= 1) {
    W = Math.min(MAX_SIDE, meta.width);
    H = Math.round(W / ar);
  } else {
    H = Math.min(MAX_SIDE, meta.height);
    W = Math.round(H * ar);
  }

  const { data } = await sharp(srcPath)
    .resize(W, H, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(W * H * 3);
  const colorCounts = new Map();

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      // gl_FragCoord (origin bottom-left)
      const fx = px + 0.5;
      const fy = H - (py + 0.5);
      // pxSizeUV, centered on resolution center
      const ux = (fx - 0.5 * W) / PX_SIZE;
      const uy = (fy - 0.5 * H) / PX_SIZE;
      const cx = Math.floor(ux);
      const cy = Math.floor(uy);

      // canvasPixelizedUV (centered) -> normalizedUV in ~[-0.5, 0.5]
      const nUVx = ((cx + 0.5) * PX_SIZE) / W;
      const nUVy = ((cy + 0.5) * PX_SIZE) / H;
      // cover mapping (identity for matching AR) + y flip
      const imgUVx = nUVx + 0.5;
      const imgUVy = 0.5 - nUVy;

      const [r, g, b] = sample(data, W, H, imgUVx * W, imgUVy * H);
      let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (inverted) lum = 1 - lum;

      const bp_x = mod(cx, 4);
      const bp_y = mod(cy, 4);
      let dith = BAYER4[bp_y * 4 + bp_x] / 16;
      dith -= 0.5;

      let brightness = lum + dith / COLOR_STEPS;
      brightness = Math.min(Math.max(brightness, 0), 1);
      const quantLum =
        Math.floor(brightness * COLOR_STEPS + 0.5) / COLOR_STEPS;

      // highlight threshold: step(1.02 - 0.02*colorSteps, brightness)
      const useHl = brightness >= 1.02 - 0.02 * COLOR_STEPS;
      const fg = useHl ? COLOR_HIGHLIGHT : COLOR_FRONT;

      // color = fg*quantLum + bg*(1-quantLum)  (all alphas = 1)
      const o = (py * W + px) * 3;
      const R = Math.round(fg[0] * quantLum + COLOR_BACK[0] * (1 - quantLum));
      const G = Math.round(fg[1] * quantLum + COLOR_BACK[1] * (1 - quantLum));
      const B = Math.round(fg[2] * quantLum + COLOR_BACK[2] * (1 - quantLum));
      out[o] = R;
      out[o + 1] = G;
      out[o + 2] = B;

      const key = `${R},${G},${B}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
  }

  const outPath = path.join(OUT_DIR, `${name}.png`);
  await sharp(out, { raw: { width: W, height: H, channels: 3 } })
    .png()
    .toFile(outPath);

  return { name, inverted, W, H, outPath, colorCounts };
}

const hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

for (const job of JOBS) {
  const res = await processImage(job);
  const total = res.W * res.H;
  const top = [...res.colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  console.log(`\n=== ${res.name}.png  (inverted=${res.inverted}) ===`);
  console.log(`dims: ${res.W}x${res.H}  distinctColors: ${res.colorCounts.size}`);
  for (const [k, c] of top) {
    const [r, g, b] = k.split(",").map(Number);
    console.log(
      `  ${hex(r, g, b)}  (${r},${g},${b})  ${((c / total) * 100).toFixed(1)}%`,
    );
  }
}
console.log("\nDONE");
