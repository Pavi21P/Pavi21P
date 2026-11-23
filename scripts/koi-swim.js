// Draws the profile intro (heading, About me, tools) as an animated SVG with the
// day's koi swimming a figure-8 over it. Runs in .github/workflows/koi.yml after
// git-koi renders koi/koi.gif.
//
//   node scripts/koi-swim.js koi/koi.gif koi            -> koi/intro-light.svg, koi/intro-dark.svg
//   node scripts/koi-swim.js koi/koi.gif out --debug    -> also out/intro-debug.svg (static, many koi)
//
// The koi GIF swims a loop in a transparent pond, so across its frames the koi faces
// every direction. For each point on the figure-8 this picks the frame whose koi faces
// the way the path goes and places it there, so the pixel art is never rotated.

const fs = require("fs");
const path = require("path");
const { GifReader } = require("omggif");
const { PNG } = require("pngjs");

// ---- Content: edit this to change the intro ---------------------------------
const CONTENT = {
  name: "Hi, I'm Pavi",
  wave: "\u{1F44B}",
  about: [
    "Student at the University of Houston-Downtown (UHD).",
    "I like to make fun apps and apps that I think are beneficial to society.",
  ],
  iconRows: ["skillicons-row1.svg", "skillicons-row2.svg", "skillicons-row3.svg"],
};

// ---- Layout (px, mirrors GitHub's markdown styles) ---------------------------
const W = 840;
const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`;
const THEMES = {
  light: { text: "#1f2328", rule: "#d1d9e0" },
  dark: { text: "#f0f6fc", rule: "#3d444d" },
};

// ---- Motion -------------------------------------------------------------------
const FISH_SCALE = 2; // screen px per native koi pixel
const SPEED = 130; // px per second along the path
const FPS = 20;

const [gifPath, outDir = "koi", ...flags] = process.argv.slice(2);
if (!gifPath) {
  console.error("usage: node scripts/koi-swim.js <koi.gif> [out-dir] [--debug]");
  process.exit(1);
}
const debug = flags.includes("--debug");
const repoRoot = path.resolve(__dirname, "..");

// ---- Read the koi frames --------------------------------------------------------
const gif = new GifReader(fs.readFileSync(gifPath));
const GW = gif.width;
const GH = gif.height;
const canvas = new Uint8Array(GW * GH * 4);

const raw = [];
for (let i = 0; i < gif.numFrames(); i++) {
  const info = gif.frameInfo(i);
  canvas.fill(0);
  gif.decodeAndBlitFrameRGBA(i, canvas);
  // Crop to the opaque pixels of this frame alone.
  let x0 = GW, y0 = GH, x1 = -1, y1 = -1;
  for (let y = info.y; y < info.y + info.height; y++)
    for (let x = info.x; x < info.x + info.width; x++)
      if (canvas[(y * GW + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) continue;
  raw.push({ x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1, rgba: canvas.slice() });
}
if (!raw.length) throw new Error("the koi GIF has no visible frames");

// git-koi exports each native pixel as an N x N block; find N so sprites stay small.
function blockFactor() {
  for (const n of [4, 3, 2]) {
    if (GW % n || GH % n) continue;
    let ok = true;
    for (const f of raw) {
      for (let y = 0; y < GH && ok; y += n)
        for (let x = 0; x < GW && ok; x += n) {
          const a = (y * GW + x) * 4;
          for (let dy = 0; dy < n && ok; dy++)
            for (let dx = 0; dx < n && ok; dx++) {
              const b = ((y + dy) * GW + x + dx) * 4;
              for (let c = 0; c < 4; c++) if (f.rgba[a + c] !== f.rgba[b + c]) ok = false;
            }
        }
      if (!ok) break;
    }
    if (ok) return n;
  }
  return 1;
}
const N = blockFactor();

const sprites = raw.map((f, id) => {
  const sx = Math.floor(f.x0 / N), sy = Math.floor(f.y0 / N);
  const w = Math.ceil((f.x0 + f.w) / N) - sx, h = Math.ceil((f.y0 + f.h) / N) - sy;
  const png = new PNG({ width: w, height: h });
  let cx = 0, cy = 0, n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = (((sy + y) * N) * GW + (sx + x) * N) * 4;
      const d = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) png.data[d + c] = f.rgba[s + c];
      if (f.rgba[s + 3] > 0) { cx += x + 0.5; cy += y + 0.5; n++; }
    }
  return {
    id, w, h,
    cx: cx / n, cy: cy / n, // centroid, sprite-local native px
    px: sx + cx / n, py: sy + cy / n, // centroid in the pond
    uri: "data:image/png;base64," + PNG.sync.write(png, { deflateLevel: 9 }).toString("base64"),
  };
});

// Heading of each frame from the koi's own motion around its pond (screen coords, y down).
const F = sprites.length;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
for (let i = 0; i < F; i++) {
  const a = sprites[(i - 2 + F) % F], b = sprites[(i + 2) % F];
  sprites[i].heading = Math.atan2(b.py - a.py, b.px - a.px);
}
for (let i = 0; i < F; i++) {
  sprites[i].turn = Math.sign(wrapAngle(sprites[(i + 1) % F].heading - sprites[(i - 1 + F) % F].heading));
}

// ---- Static layout ------------------------------------------------------------
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function layout(theme) {
  const t = THEMES[theme];
  const out = [];
  let y = 0;
  // h1
  y += 38;
  out.push(`<text x="0" y="${y}" font-size="32" font-weight="600" fill="${t.text}">${esc(CONTENT.name)} ${CONTENT.wave}</text>`);
  y += 12;
  out.push(`<rect x="0" y="${y}" width="${W}" height="1" fill="${t.rule}"/>`);
  // h2 About me
  y += 24 + 28;
  out.push(`<text x="0" y="${y}" font-size="24" font-weight="600" fill="${t.text}">About me</text>`);
  y += 10;
  out.push(`<rect x="0" y="${y}" width="${W}" height="1" fill="${t.rule}"/>`);
  y += 16;
  for (const line of CONTENT.about) {
    y += 20;
    out.push(`<circle cx="18" cy="${y - 5}" r="2.6" fill="${t.text}"/>`);
    out.push(`<text x="32" y="${y}" font-size="16" fill="${t.text}">${esc(line)}</text>`);
    y += 6;
  }
  // h2 Languages and Tools
  y += 24 + 26;
  out.push(`<text x="0" y="${y}" font-size="24" font-weight="600" fill="${t.text}">Languages and Tools</text>`);
  y += 10;
  out.push(`<rect x="0" y="${y}" width="${W}" height="1" fill="${t.rule}"/>`);
  y += 16;
  for (const file of CONTENT.iconRows) {
    const svg = fs.readFileSync(path.join(repoRoot, "assets", file), "utf8");
    const width = Number((svg.match(/<svg[^>]*\swidth="([\d.]+)"/) || [])[1] || 48);
    const height = Number((svg.match(/<svg[^>]*\sheight="([\d.]+)"/) || [])[1] || 48);
    out.push(`<image x="0" y="${y}" width="${width}" height="${height}" href="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"/>`);
    y += height + 16;
  }
  return { body: out.join("\n"), height: Math.round(y) };
}

// ---- Figure-8 path, resampled at equal arc length -------------------------------
function figureEight(H) {
  const fishReach = 46 * FISH_SCALE;
  const A = W / 2 - fishReach; // half width
  const B = H / 2 - fishReach * 0.7; // half height of each lobe
  const cx = W / 2, cy = H / 2;
  const dense = [];
  for (let k = 0; k <= 4000; k++) {
    const t = (k / 4000) * 2 * Math.PI;
    dense.push([cx + A * Math.sin(t), cy + B * Math.sin(2 * t)]);
  }
  const cum = [0];
  for (let k = 1; k < dense.length; k++)
    cum.push(cum[k - 1] + Math.hypot(dense[k][0] - dense[k - 1][0], dense[k][1] - dense[k - 1][1]));
  const length = cum[cum.length - 1];
  const duration = length / SPEED;
  const steps = Math.round(duration * FPS);
  const pts = [];
  let j = 0;
  for (let s = 0; s < steps; s++) {
    const target = (s / steps) * length;
    while (cum[j + 1] < target) j++;
    const u = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    pts.push([dense[j][0] + u * (dense[j + 1][0] - dense[j][0]), dense[j][1] + u * (dense[j + 1][1] - dense[j][1])]);
  }
  for (let s = 0; s < steps; s++) {
    const a = pts[(s - 1 + steps) % steps], b = pts[(s + 1) % steps];
    pts[s].heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  for (let s = 0; s < steps; s++) {
    const d = wrapAngle(pts[(s + 2) % steps].heading - pts[(s - 2 + steps) % steps].heading);
    pts[s].turn = Math.abs(d) < 0.02 ? 0 : Math.sign(d);
  }
  return { pts, duration };
}

// Pick the frame (maybe mirrored) whose koi faces `heading` and bends the same way.
function choose(heading, turn, wiggle) {
  let best = null;
  for (const s of sprites)
    for (const flip of [false, true]) {
      const h = flip ? Math.PI - s.heading : s.heading;
      const bend = flip ? -s.turn : s.turn;
      const cost = Math.abs(wrapAngle(heading - h)) + (turn && bend !== turn ? 0.35 : 0);
      if (!best || cost < best.cost) best = { s, flip, h, cost };
    }
  // Step a couple of frames either side of the best match so the tail keeps moving.
  const i = (best.s.id + wiggle + F) % F;
  const s = sprites[i];
  const h = best.flip ? Math.PI - s.heading : s.heading;
  return { s, flip: best.flip, residual: wrapAngle(heading - h) };
}

function placement(pt, k) {
  const wiggle = Math.round(2 * Math.sin((2 * Math.PI * k) / (FPS * 0.7)));
  const { s, flip, residual } = choose(pt.heading, pt.turn, wiggle);
  const tr = [`translate(${pt[0].toFixed(1)} ${pt[1].toFixed(1)})`];
  // Only rotate when no frame faces close enough (a koi day with a narrow swim).
  if (Math.abs(residual) > (10 * Math.PI) / 180) tr.push(`rotate(${((residual * 180) / Math.PI).toFixed(1)})`);
  tr.push(`scale(${flip ? -FISH_SCALE : FISH_SCALE} ${FISH_SCALE})`);
  tr.push(`translate(${(-s.cx).toFixed(2)} ${(-s.cy).toFixed(2)})`);
  return { s, transform: tr.join(" ") };
}

function build(theme, mode) {
  const { body, height } = layout(theme);
  const { pts, duration } = figureEight(height);
  const used = new Set();
  const frames = [];
  const dur = duration.toFixed(2);
  pts.forEach((pt, k) => {
    if (mode === "debug" && k % 12) return;
    const { s, transform } = placement(pt, k);
    used.add(s.id);
    const delay = (-(pts.length - k) * duration / pts.length).toFixed(3);
    const style = mode === "debug" ? "" : ` style="animation-delay:${delay}s"`;
    frames.push(`<use href="#k${s.id}" transform="${transform}"${style}/>`);
  });
  const defs = sprites
    .filter((s) => used.has(s.id))
    .map((s) => `<image id="k${s.id}" width="${s.w}" height="${s.h}" image-rendering="pixelated" style="image-rendering:pixelated" href="${s.uri}"/>`)
    .join("\n");
  const css =
    mode === "debug"
      ? ""
      : `<style>
#koi use{visibility:hidden;animation:swim ${dur}s step-end infinite}
@keyframes swim{0%{visibility:visible}${(100 / pts.length).toFixed(4)}%{visibility:hidden}}
@media (prefers-reduced-motion:reduce){#koi use{animation:none}#koi use:first-child{visibility:visible}}
</style>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(CONTENT.name)}. About me: ${esc(CONTENT.about.join(" "))} Languages and tools.">
${css}
<defs>
${defs}
</defs>
<g font-family='${FONT}'>
${body}
</g>
<g id="koi">
${frames.join("\n")}
</g>
</svg>
`;
}

fs.mkdirSync(outDir, { recursive: true });
for (const theme of Object.keys(THEMES)) {
  const file = path.join(outDir, `intro-${theme}.svg`);
  fs.writeFileSync(file, build(theme, "anim"));
  console.log(`${file}: ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
if (debug) fs.writeFileSync(path.join(outDir, "intro-debug.svg"), build("light", "debug"));
console.log(`${F} koi frames, block ${N}`);
