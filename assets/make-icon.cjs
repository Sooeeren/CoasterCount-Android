// Builds assets/icon.png (1024×1024) from the Coaster-Count brand mark.
//
//   node assets/make-icon.cjs assets/brand-mark.svg
//   npm run icons            # then regenerates every platform icon from it
//
// The mark (a rounded square with a coaster car cut out) is taken from the
// site's SVG sprite (https://coaster-count.com/static/svg/ui.svg, symbol
// "coaster_count_logo") and drawn white on brand blue. It's sized to ~44% of
// the canvas so it stays inside Android's adaptive-icon safe zone (the
// launcher may crop to a circle, squircle or rounded square).
//
// Needs @resvg/resvg-js (npm i -D @resvg/resvg-js).

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const BRAND = '#004a80';
const SIZE = 1024;
const MARK_FRACTION = 0.44;

const sprite = fs.readFileSync(process.argv[2], 'utf8');
const m = /<path[^>]*id="coaster_count_logo"[^>]*\sd="([^"]+)"/s.exec(sprite);
if (!m) throw new Error('coaster_count_logo path not found in sprite');
const d = m[1].replace(/\s+/g, ' ');

// Measure the mark on its own to centre it exactly.
const probe = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 200"><path d="${d}"/></svg>`);
const bb = probe.getBBox();
const scale = (SIZE * MARK_FRACTION) / Math.max(bb.width, bb.height);
const tx = (SIZE - bb.width * scale) / 2 - bb.x * scale;
const ty = (SIZE - bb.height * scale) / 2 - bb.y * scale;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BRAND}"/>
  <path d="${d}" fill="#ffffff" fill-rule="evenodd" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})"/>
</svg>`;

const out = path.join(__dirname, 'icon.png');
fs.writeFileSync(out, new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng());
fs.writeFileSync(path.join(__dirname, 'icon.svg'), svg);
console.log('wrote', out);
