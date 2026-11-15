/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Builds assets/demo/rooms/*.svg — IniqDash's OWN night-time room illustrations for the Maison demo's room cards (created here, so they
// can ship with IniqDash): simple shapes, gradients and glows in one mood (dark rooms, warm lamps, purple / blue LED light). Deterministic (no randomness): the same files every run.
//   node tools/build-room-scenes.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'assets/demo/rooms');
let W = 544, H = 480;                                       // 2× the card (272 × 240); a wide scene sets its own

let gid = 0;
const defs = [];
const lin = (stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => { const id = `g${gid++}`; defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`); return `url(#${id})`; };
const rad = (stops) => { const id = `g${gid++}`; defs.push(`<radialGradient id="${id}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`); return `url(#${id})`; };
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const glow = (cx, cy, rx, ry, colour, a = 0.9) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${rad([[0, colour, a], [0.45, colour, a * 0.35], [1, colour, 0]])}"/>`;
const poly = (pts, fill, extra = '') => `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}" ${extra}/>`;
const circle = (cx, cy, r, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
const stars = (n, y1 = 0, y2 = 160) => Array.from({ length: n }, (_, i) => circle((i * 97 + 31) % W, y1 + ((i * 53 + 17) % (y2 - y1)), i % 3 ? 0.8 : 1.4, '#ffffff', `opacity="${0.25 + (i % 4) * 0.12}"`)).join('');
const wall = (top, bottom) => rect(0, 0, W, H, lin([[0, top], [1, bottom]]));
const floor = (y, c1, c2) => rect(0, y, W, H - y, lin([[0, c1], [1, c2]]));

function svg(body) { const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs.join('')}</defs>${body}</svg>\n`; defs.length = 0; gid = 0; return out; }
const house = (x, y, s, lit = '#ffcc7a') => {                // a two-storey house: walls, roof, lit windows
  const w = 220 * s, h = 120 * s;
  return [poly([[x - 20 * s, y], [x + w / 2, y - 90 * s], [x + w + 20 * s, y]], '#1c1d22'), rect(x, y, w, h, '#2a2723'),
    ...[0, 1, 2, 3].map((i) => rect(x + 18 * s + i * 52 * s, y + 22 * s, 26 * s, 34 * s, lit, `opacity="${i % 2 ? 0.95 : 0.75}"`)),
    rect(x + w / 2 - 14 * s, y + 70 * s, 28 * s, 50 * s, lit, 'opacity=".85"'), glow(x + w / 2, y + 60 * s, w * 0.8, h * 0.7, '#ffb347', 0.35)].join('');
};
const panels = (x, y, n, s = 1) => Array.from({ length: n }, (_, i) => poly([[x + i * 34 * s, y + i * 12 * s], [x + 30 * s + i * 34 * s, y - 14 * s + i * 12 * s], [x + 30 * s + i * 34 * s, y + 18 * s + i * 12 * s], [x + i * 34 * s, y + 32 * s + i * 12 * s]], '#1d2c44', 'stroke="#5b7aa6" stroke-width="1.5"')).join('');
const tree = (x, y, h, c = '#11180f') => poly([[x, y - h], [x + h * 0.35, y], [x - h * 0.35, y]], c);

const SCENES = {
  house: () => svg(wall('#0b1020', '#1b2233') + stars(40) + glow(120, 120, 200, 120, '#3b4a7a', 0.25) + tree(40, 380, 200) + tree(500, 380, 230)
    + house(150, 250, 1.05) + panels(260, 175, 3, 0.9) + floor(372, '#14160f', '#0c0d0a')),
  bedroom: () => svg(wall('#1b1426', '#0d0b12') + glow(300, 20, 420, 60, '#c04dff', 0.75) + glow(470, 200, 160, 220, '#ff4fa3', 0.35)
    + rect(0, 30, W, 6, '#e98bff', 'opacity=".7"') + rect(280, 220, 264, 150, '#08080b') + rect(290, 230, 244, 130, '#111018') + floor(360, '#141018', '#0a090c')
    + rect(30, 300, 230, 80, '#1d1822') + rect(30, 280, 230, 24, '#2a2230')),
  kitchen: () => svg(wall('#141414', '#0c0c0c') + rect(0, 60, W, 150, '#1a1918') + rect(0, 208, W, 4, '#ffcf8a') + glow(272, 214, 340, 30, '#ffb85c', 0.8)
    + rect(0, 250, W, 120, '#151413') + rect(220, 250, 4, 120, '#0e0d0c') + rect(380, 250, 4, 120, '#0e0d0c') + floor(370, '#131211', '#0b0a0a')),
  garden: () => svg(wall('#0b1209', '#0f160c') + Array.from({ length: 26 }, (_, i) => circle((i * 83) % W, 60 + ((i * 47) % 300), 40 + (i % 5) * 12, ['#18240f', '#1f2e12', '#25371a', '#2c3f1c'][i % 4], 'opacity=".9"')).join('')
    + Array.from({ length: 14 }, (_, i) => glow((i * 131) % W, 120 + ((i * 71) % 240), 14, 14, '#d8ff8a', 0.55)).join('') + floor(400, '#0d120a', '#070906')),
  kids: () => svg(wall('#1d1210', '#0e0a09') + glow(272, 20, 300, 50, '#ff4f9a', 0.5) + glow(272, 230, 230, 200, '#ffb04d', 0.85)
    + poly([[232, 170], [312, 170], [330, 250], [214, 250]], '#ffd28a') + rect(266, 250, 12, 70, '#3a2a1a') + rect(180, 320, 184, 60, '#2a1d14') + floor(380, '#170f0b', '#0c0806')),
  study: () => svg(wall('#2a1638', '#120c1a') + glow(150, 60, 320, 140, '#d14dff', 0.55) + glow(520, 160, 200, 260, '#3f7bff', 0.45) + glow(420, 40, 200, 80, '#ff6fa8', 0.5)
    + rect(0, 120, 120, 280, '#160f20') + rect(150, 300, 394, 100, '#1a1222') + floor(400, '#140e1a', '#0a070d')),
  bath: () => svg(wall('#141c26', '#0b1016') + glow(380, 230, 210, 210, '#9bc9ff', 0.3) + `<circle cx="380" cy="230" r="150" fill="none" stroke="#ffe0b0" stroke-width="10" opacity=".55"/>`
    + circle(380, 230, 140, '#0f151d') + rect(0, 120, 200, 300, '#121a24') + floor(420, '#0e141b', '#080b0f')),
  dining: () => svg(wall('#141312', '#0b0a0a') + [170, 300, 420].map((x) => rect(x, 0, 2, 150, '#2b2a28') + poly([[x - 26, 190], [x + 28, 190], [x + 14, 150], [x - 12, 150]], '#1b1a19') + glow(x + 1, 196, 90, 60, '#ffcf80', 0.8)).join('')
    + rect(120, 330, 340, 16, '#2a241d') + rect(140, 346, 10, 80, '#1d1913') + rect(430, 346, 10, 80, '#1d1913') + floor(420, '#121110', '#0a0909')),
  living: () => svg(wall('#1e1428', '#0d0a12') + glow(380, 30, 360, 80, '#b44dff', 0.6) + rect(0, 60, 180, 280, '#0b1122') + stars(18, 70, 330).replace(/cx="(\d+)/g, (m, x) => `cx="${Number(x) % 170 + 5}`)
    + rect(240, 190, 300, 170, '#07070a') + glow(270, 300, 150, 160, '#ff9a57', 0.35) + floor(380, '#130e18', '#09070c')),
  roof: () => svg(wall('#0d1220', '#1b2030') + stars(30) + poly([[-40, 480], [300, 120], [620, 480]], '#26262b') + panels(250, 250, 5, 1.25)
    + rect(60, 330, 40, 60, '#ffcc7a', 'opacity=".75"') + glow(80, 360, 90, 80, '#ffb347', 0.35)),
  cellar: () => svg(wall('#1a1b1d', '#0e0f10') + [70, 140, 210].map((y) => rect(60, y, 280, 6, '#e8f1ff', 'opacity=".75"') + glow(200, y + 3, 220, 26, '#d8e8ff', 0.35)).join('')
    + rect(360, 80, 184, 300, '#151617') + [0, 1, 2, 3].map((i) => rect(372, 100 + i * 64, 160, 6, '#2a2b2d')).join('')
    + `<path d="M60 380 Q80 300 170 290 L330 290 Q400 300 420 380 Z" fill="#1d1f22"/>` + floor(380, '#121314', '#0a0a0b')),
  bathroom: () => svg(wall('#16314a', '#0b1724') + glow(300, 80, 360, 140, '#5ab0ff', 0.45) + `<path d="M420 120 A150 150 0 1 1 420 420" fill="none" stroke="#ffb35c" stroke-width="18" opacity=".85"/>`
    + glow(470, 270, 200, 200, '#ffa04a', 0.35) + rect(0, 140, 180, 280, '#0f2132') + floor(420, '#0d1a26', '#081018')),
  pendant: () => svg(wall('#2b1a12', '#120b08') + rect(270, 0, 4, 70, '#3a2a20') + `<path d="M60 230 Q272 30 484 230 Z" fill="#1a120d"/>` + rect(60, 226, 424, 14, '#ffcf8a')
    + glow(272, 260, 320, 120, '#ffb45c', 0.85) + floor(380, '#1e130d', '#0f0906')),
  // the Lights page's wide hero: a living room at night — a window wall onto a city, a long sofa, a dim lamp
  apartment: () => { W = 1185; H = 273; const out = svg(wall('#0d1220', '#1a1f2b') + [10, 255, 535].map((x) => rect(x, 0, 220, 190, '#0a0f1e') + Array.from({ length: 60 }, (_, i) => rect(x + 8 + (i * 37) % 200, 8 + ((i * 53) % 170), 4, 6, '#ffd890', `opacity="${0.15 + (i % 5) * 0.12}"`)).join('')).join('')
      + rect(790, 0, 395, 190, '#3a3e4a') + rect(255, 140, 500, 60, '#9a9ea8', 'rx="18"') + rect(255, 160, 830, 50, '#7c808a', 'rx="22"') + floor(190, '#2a2d36', '#14161c')
      + glow(1000, 230, 160, 40, '#000000', 0.5)); W = 544; H = 480; return out; },
  // the Home page's event card: a deep-blue backdrop with a large, soft recycling sign
  recycle: () => svg(wall('#0d1a26', '#0b131c') + glow(300, 200, 300, 260, '#1d5f8a', 0.55)
    + [0, 120, 240].map((r) => `<g transform="rotate(${r} 300 240)"><path d="M300 110 L370 210 L340 210 L340 260 L260 260 L260 210 L230 210 Z" fill="#1f5c84" opacity=".55"/></g>`).join('')
    + circle(160, 120, 6, '#2a6f9c', 'opacity=".5"') + circle(420, 330, 4, '#2a6f9c', 'opacity=".5"')),
  outside: () => svg(wall('#141618', '#0c0d0f') + poly([[0, 0], [170, 60], [170, 420], [0, 480]], '#1f2125') + poly([[544, 0], [380, 70], [380, 420], [544, 480]], '#2a2c30')
    + [100, 180, 260, 340].map((y) => rect(392, y, 110, 4, '#3a3c40')).join('') + rect(170, 60, 210, 360, '#101113') + glow(275, 200, 70, 80, '#ffd08a', 0.45)
    + tree(240, 420, 70, '#16201a') + tree(320, 420, 60, '#16201a') + floor(420, '#121315', '#0a0a0b')),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(SCENES)) fs.writeFileSync(path.join(OUT, `${name}.svg`), make());
console.log(`room scenes: ${Object.keys(SCENES).length} → assets/demo/rooms/`);
