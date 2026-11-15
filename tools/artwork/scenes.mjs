/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ORIGINAL IniqDash SCENE ARTWORK — illustrated rooms, the house, evening lights, a fireplace (card backgrounds, room hero cards, popup
// headers: assets/img/scenes/*.jpg) and two DEMO CAMERA views (assets/img/cameras/*.jpg). Drawn here as SVG from simple shapes, gradients and
// soft light, rendered by Chromium to JPEG; the colour profile Chromium writes is removed (the public snapshot refuses image metadata).
// Every picture is project artwork under MPL-2.0 — no photograph, no third-party design.     node tools/artwork/scenes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { playwright } from '../../tests/lib/harness.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const W = 1200, H = 800;
let uid = 0;
const id = (p) => `${p}${++uid}`;
const defs = [];
const lin = (stops, x2 = 0, y2 = 1) => { const n = id('l'); defs.push(`<linearGradient id="${n}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`); return `url(#${n})`; };
const rad = (stops, cx = '50%', cy = '50%', r = '50%') => { const n = id('r'); defs.push(`<radialGradient id="${n}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`); return `url(#${n})`; };
const blur = (sd) => { const n = id('f'); defs.push(`<filter id="${n}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`); return `url(#${n})`; };
/** a soft light: a blurred coloured ellipse */
const glow = (cx, cy, rx, ry, color, a = 0.7, sd = 40) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${color}" opacity="${a}" filter="${blur(sd)}"/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
/** a night city seen through a window: towers with lit windows (deterministic) */
function city(x, y, w, h, seed = 1) {
  let s = seed; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let out = rect(x, y, w, h, lin([[0, '#0b1730'], [1, '#1c2b4f']]));
  for (let bx = x - 10; bx < x + w; bx += 40 + rnd() * 50) {
    const bw = 36 + rnd() * 50, bh = h * (0.35 + rnd() * 0.6), by = y + h - bh;
    out += rect(bx, by, bw, bh, rnd() > 0.5 ? '#101a2e' : '#0d1526');
    for (let wy = by + 8; wy < y + h - 8; wy += 12) for (let wx = bx + 5; wx < bx + bw - 6; wx += 9) if (rnd() > 0.62) out += rect(wx, wy, 4, 5, rnd() > 0.3 ? '#ffd38a' : '#9fc7ff', `opacity="${0.5 + rnd() * 0.5}"`);
  }
  return out;
}
/** a window frame with mullions over its view */
const windowFrame = (x, y, w, h, view, cols = 3) => `${view}<g fill="none" stroke="#0a0d14" stroke-width="10">${rect(x, y, w, h, 'none')}${Array.from({ length: cols - 1 }, (_, i) => `<line x1="${x + (w / cols) * (i + 1)}" y1="${y}" x2="${x + (w / cols) * (i + 1)}" y2="${y + h}"/>`).join('')}</g>`;
/** a pendant lamp: cord, dome, light below */
const pendant = (cx, y, r, on = true) => `<line x1="${cx}" y1="0" x2="${cx}" y2="${y}" stroke="#151820" stroke-width="3"/>${on ? glow(cx, y + r * 1.4, r * 2.6, r * 1.6, '#ffb45c', 0.55, 30) : ''}<path d="M${cx - r} ${y + r * 0.9} Q ${cx} ${y - r * 0.5} ${cx + r} ${y + r * 0.9} Z" fill="#1d2028"/><ellipse cx="${cx}" cy="${y + r * 0.9}" rx="${r}" ry="${r * 0.16}" fill="${on ? '#ffd9a0' : '#2a2d35'}"/>`;
const floor = (y, c1, c2) => rect(0, y, W, H - y, lin([[0, c1], [1, c2]]));
const vignette = () => rect(0, 0, W, H, rad([[0.55, '#000', 0], [1, '#000', 0.55]]));

function scene(name) {
  uid = 0; defs.length = 0;
  let b = '';
  switch (name) {
    case 'living': {
      b += rect(0, 0, W, H, lin([[0, '#1a1f33'], [1, '#121521']]));
      b += windowFrame(80, 90, 560, 420, city(80, 90, 560, 420, 7), 3);
      b += glow(980, 300, 260, 220, '#7b4dff', 0.35, 70) + glow(250, 760, 520, 120, '#4a6dff', 0.25, 60);
      b += floor(560, '#1b1d27', '#0d0e14');
      b += `<path d="M120 640 Q120 560 200 560 H780 Q860 560 860 640 V700 H120Z" fill="#2c3040"/>` + rect(150, 600, 680, 70, '#353a4e', 'rx="18"') + rect(170, 575, 200, 50, '#3c4258', 'rx="14"') + rect(400, 575, 200, 50, '#3c4258', 'rx="14"') + rect(630, 575, 180, 50, '#3c4258', 'rx="14"');
      b += rect(0, 700, W, 8, '#ff7ad9', 'opacity=".55"') + glow(600, 712, 620, 30, '#ff6fd1', 0.45, 18);
      b += rect(930, 430, 160, 210, '#14161f', 'rx="6"') + glow(1010, 470, 120, 90, '#ffb35c', 0.5, 40) + `<path d="M985 430 L1035 430 L1050 390 L970 390Z" fill="#f6c27a"/>` + rect(1006, 430, 8, 120, '#20232c');
      break;
    }
    case 'kitchen': {
      b += rect(0, 0, W, H, lin([[0, '#1d1a18'], [1, '#121110']]));
      b += rect(60, 120, 1080, 220, '#17161a') + Array.from({ length: 6 }, (_, i) => rect(70 + i * 178, 130, 168, 200, '#201f25', 'rx="4"')).join('');
      b += rect(60, 340, 1080, 10, '#ffbe6b') + glow(600, 360, 620, 50, '#ffb15c', 0.75, 22);
      b += rect(60, 350, 1080, 150, lin([[0, '#3a2c20'], [1, '#1b1612']]));
      b += rect(40, 500, 1120, 30, '#2b2a30') + rect(60, 530, 1080, 270, '#16151a');
      b += pendant(360, 250, 46) + pendant(600, 230, 46) + pendant(840, 250, 46);
      b += rect(300, 600, 600, 26, '#d9c2a3', 'opacity=".9"') + rect(320, 626, 560, 160, '#232228');
      break;
    }
    case 'bedroom': {
      b += rect(0, 0, W, H, lin([[0, '#1d1830'], [1, '#110f1c']]));
      b += glow(600, 200, 520, 220, '#a64dff', 0.28, 80);
      b += windowFrame(820, 110, 300, 340, rect(820, 110, 300, 340, lin([[0, '#1a2a52'], [1, '#2e3f6b']])) + glow(1000, 200, 60, 60, '#dfe8ff', 0.6, 20), 2);
      b += floor(560, '#1c1826', '#0d0b12');
      b += rect(200, 430, 640, 70, '#2a2438', 'rx="16"') + rect(180, 480, 680, 140, '#3a3350', 'rx="22"') + rect(220, 450, 220, 60, '#e6e0f2', 'rx="22" opacity=".85"') + rect(470, 450, 220, 60, '#e6e0f2', 'rx="22" opacity=".85"');
      b += rect(180, 540, 680, 90, '#4c4466', 'rx="18"');
      b += rect(890, 470, 120, 150, '#1a1724', 'rx="6"') + glow(950, 440, 140, 120, '#ffbb6e', 0.55, 35) + `<path d="M915 440 L985 440 L975 395 L925 395Z" fill="#ffd79a"/>`;
      break;
    }
    case 'bathroom': {
      b += rect(0, 0, W, H, lin([[0, '#12212e'], [1, '#0c141c']]));
      for (let y = 0; y < 560; y += 60) b += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#1a2c3b" stroke-width="2"/>`;
      for (let x = 0; x < W; x += 60) b += `<line x1="${x}" y1="0" x2="${x}" y2="560" stroke="#1a2c3b" stroke-width="2"/>`;
      b += glow(760, 240, 190, 190, '#7fd6ff', 0.35, 40) + `<circle cx="760" cy="240" r="150" fill="#0d1a24" stroke="#cfe9ff" stroke-width="6" opacity=".95"/>` + `<circle cx="760" cy="240" r="160" fill="none" stroke="#8fdcff" stroke-width="3" opacity=".6" filter="${blur(6)}"/>`;
      b += floor(560, '#16222c', '#0a1016');
      b += rect(560, 450, 400, 110, '#e8f1f7', 'rx="16"') + rect(600, 470, 320, 70, '#c8d8e3', 'rx="30"');
      b += `<path d="M120 560 Q120 470 220 470 H420 V560Z" fill="#dfe9f0"/>` + glow(270, 500, 160, 40, '#9fdcff', 0.25, 20);
      break;
    }
    case 'office': {
      b += rect(0, 0, W, H, lin([[0, '#161a26'], [1, '#0e1018']]));
      b += windowFrame(700, 90, 420, 360, city(700, 90, 420, 360, 3), 2);
      b += rect(80, 120, 380, 320, '#141823') + Array.from({ length: 3 }, (_, i) => rect(90, 140 + i * 100, 360, 8, '#2a3040')).join('') + Array.from({ length: 9 }, (_, i) => rect(100 + i * 38, 120 + (i % 3) * 100 - 60 + 80, 26, 60, ['#3a5a8a', '#8a5a3a', '#4a8a6a'][i % 3])).join('');
      b += floor(580, '#171a24', '#0b0d12');
      b += rect(200, 520, 640, 22, '#3a3328') + rect(230, 542, 18, 200, '#2a2620') + rect(792, 542, 18, 200, '#2a2620');
      b += rect(380, 380, 300, 170, '#0f1724', 'rx="10"') + rect(392, 392, 276, 146, lin([[0, '#1d4f8f'], [1, '#2f8fd6']]), 'rx="6"') + glow(530, 470, 220, 120, '#4fa8f5', 0.35, 40) + rect(510, 550, 40, 20, '#1a1d26');
      b += glow(260, 470, 120, 90, '#ffc070', 0.45, 30) + `<path d="M230 520 L270 450 L300 460 L262 520Z" fill="#2a2d36"/>` + `<circle cx="285" cy="455" r="18" fill="#ffd79a"/>`;
      break;
    }
    case 'garden': {
      b += rect(0, 0, W, H, lin([[0, '#0b1424'], [1, '#13241d']]));
      b += glow(900, 120, 80, 80, '#e9f1ff', 0.55, 25) + `<circle cx="900" cy="120" r="34" fill="#eef4ff"/>`;
      b += `<path d="M0 470 Q300 410 600 450 T1200 430 V800 H0Z" fill="#14281c"/>` + `<path d="M0 560 Q300 520 620 560 T1200 540 V800 H0Z" fill="#0f2016"/>`;
      for (let i = 0; i < 9; i++) { const x = 60 + i * 140, r = 70 + (i % 3) * 25; b += `<circle cx="${x}" cy="${440 - (i % 2) * 30}" r="${r}" fill="${i % 2 ? '#183622' : '#1d4129'}"/>`; }
      b += `<path d="M560 800 Q600 620 640 560 Q680 620 720 800Z" fill="#3a3326" opacity=".8"/>`;
      for (let i = 0; i < 6; i++) { const x = 520 + (i % 2) * 220, y = 600 + Math.floor(i / 2) * 70; b += rect(x, y, 8, 40, '#2a2a2a') + glow(x + 4, y, 50, 30, '#ffe0a0', 0.55, 14) + `<circle cx="${x + 4}" cy="${y}" r="7" fill="#fff1c8"/>`; }
      for (let i = 0; i < 22; i++) b += `<circle cx="${(i * 97) % W}" cy="${380 + ((i * 53) % 160)}" r="3" fill="#d8ff9a" opacity=".7" filter="${blur(1.5)}"/>`;
      break;
    }
    case 'house': {
      b += rect(0, 0, W, H, lin([[0, '#0d1630'], [0.6, '#2a2d55'], [1, '#5a3e52']]));
      for (let i = 0; i < 40; i++) b += `<circle cx="${(i * 131) % W}" cy="${(i * 71) % 300}" r="${i % 5 ? 1.2 : 2}" fill="#fff" opacity=".7"/>`;
      b += `<path d="M0 600 Q400 540 800 580 T1200 560 V800 H0Z" fill="#141a1c"/>`;
      b += `<path d="M300 380 L600 200 L900 380Z" fill="#1d2230"/>` + rect(340, 380, 520, 240, '#2a2a33');
      for (let i = 0; i < 5; i++) b += `<path d="M${470 + i * 52} ${270 + i * 0} l44 -26 l20 12 l-44 26Z" fill="#2b4a7a" stroke="#6aa0e0" stroke-width="1.5"/>`;
      [[380, 430], [480, 430], [680, 430], [780, 430], [380, 520], [780, 520]].forEach(([x, y]) => { b += glow(x + 25, y + 30, 60, 50, '#ffbe6b', 0.6, 20) + rect(x, y, 50, 60, '#ffd08a') + `<line x1="${x + 25}" y1="${y}" x2="${x + 25}" y2="${y + 60}" stroke="#2a2a33" stroke-width="4"/>`; });
      b += rect(565, 500, 70, 120, '#ffcf8a') + glow(600, 600, 120, 60, '#ffb35c', 0.5, 30);
      b += `<path d="M200 600 L190 470 L240 470 Z" fill="#0f1814"/>` + `<path d="M980 610 L960 440 L1030 440Z" fill="#0f1814"/>`;
      break;
    }
    case 'lights': {
      b += rect(0, 0, W, H, lin([[0, '#151827'], [1, '#0c0d14']]));
      b += windowFrame(60, 70, 1080, 330, city(60, 70, 1080, 330, 11), 5);
      b += floor(470, '#1a1b24', '#0b0b10');
      b += `<path d="M180 640 Q180 540 280 540 H920 Q1020 540 1020 640 V700 H180Z" fill="#c9cdd9"/>` + rect(220, 580, 760, 70, '#dfe2ea', 'rx="20"');
      b += pendant(300, 190, 40) + pendant(600, 160, 40) + pendant(900, 190, 40);
      b += glow(600, 720, 700, 40, '#ffb85c', 0.35, 30);
      break;
    }
    case 'fireplace': {
      b += rect(0, 0, W, H, lin([[0, '#1a1412'], [1, '#0d0a09']]));
      b += rect(380, 160, 440, 520, '#2a2522', 'rx="10"') + rect(420, 300, 360, 300, '#0a0807');
      b += glow(600, 520, 220, 160, '#ff7a2a', 0.85, 40) + glow(600, 560, 140, 80, '#ffd27a', 0.9, 20);
      b += `<path d="M520 600 Q540 480 590 430 Q580 520 620 470 Q640 540 680 500 Q690 560 680 600Z" fill="#ffb347"/>` + `<path d="M560 600 Q570 520 600 490 Q605 550 630 530 Q640 570 640 600Z" fill="#fff0b3"/>`;
      b += rect(360, 600, 480, 30, '#3a332e') + floor(680, '#1c1613', '#0a0807') + glow(600, 700, 520, 90, '#ff8a3d', 0.35, 40);
      break;
    }
    case 'camera-garden': {   // a stationary outdoor camera: driveway and front garden at dusk, high viewpoint
      b += rect(0, 0, W, H, lin([[0, '#1c2733'], [1, '#2a3440']]));
      b += `<path d="M0 260 L1200 200 L1200 800 L0 800Z" fill="#26302a"/>`;
      b += `<path d="M380 800 L560 230 L720 228 L980 800Z" fill="#3a3c40"/>` + `<path d="M560 230 L720 228 L740 300 L540 302Z" fill="#46484c"/>`;
      b += rect(600, 300, 190, 90, '#20252c', 'rx="14"') + rect(610, 280, 160, 50, '#2b3139', 'rx="14"') + rect(612, 350, 40, 40, '#111', 'rx="18"') + rect(740, 350, 40, 40, '#111', 'rx="18"') + glow(615, 330, 30, 20, '#fff4c2', 0.6, 8);
      b += `<path d="M0 230 L320 210 L320 330 L0 360Z" fill="#30363e"/>` + rect(60, 250, 70, 80, '#ffd08a', 'opacity=".85"') + rect(180, 245, 70, 85, '#3a4048');
      for (let i = 0; i < 7; i++) b += `<circle cx="${900 + (i % 4) * 80}" cy="${300 + Math.floor(i / 4) * 140}" r="${60 + (i % 3) * 15}" fill="${i % 2 ? '#1f3424' : '#24402b'}"/>`;
      b += rect(0, 0, W, H, '#7a8a9a', 'opacity=".06"') + vignette();
      break;
    }
    case 'camera-living': {   // a stationary indoor camera: the living room from a ceiling corner
      b += rect(0, 0, W, H, lin([[0, '#2a2a30'], [1, '#1c1c22']]));
      b += `<path d="M0 0 L1200 0 L1200 330 L0 430Z" fill="#33333b"/>` + `<path d="M0 430 L1200 330 L1200 800 L0 800Z" fill="#2a2620"/>`;
      b += `<path d="M700 60 L1100 30 L1100 300 L700 330Z" fill="#45566a"/>` + `<path d="M900 45 L900 315" stroke="#2a2a30" stroke-width="10"/>`;
      b += `<path d="M160 560 L640 480 L660 600 L180 690Z" fill="#4a4f60"/>` + `<path d="M160 520 L640 440 L640 480 L160 560Z" fill="#555b6e"/>`;
      b += `<path d="M440 640 L720 590 L760 660 L480 715Z" fill="#6b5a46"/>`;
      b += `<path d="M820 380 L1040 350 L1040 470 L820 500Z" fill="#111317"/>` + rect(1000, 520, 80, 130, '#3a3a40') + glow(1040, 520, 90, 70, '#ffcf8a', 0.4, 25);
      b += rect(0, 0, W, H, '#8a8a7a', 'opacity=".05"') + vignette();
      break;
    }
    default: throw new Error(name);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs.join('')}</defs>${b}${name.startsWith('camera') ? '' : vignette()}</svg>`;
}

/** a JPEG without its APPn metadata segments (ICC colour profile, EXIF), byte for byte otherwise */
function stripJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const out = [buf.subarray(0, 2)]; let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) break;
    const m = buf[i + 1];
    if (m === 0xda) { out.push(buf.subarray(i)); break; }              // start of scan: the rest is image data
    const len = buf.readUInt16BE(i + 2);
    if (!(m >= 0xe1 && m <= 0xef)) out.push(buf.subarray(i, i + 2 + len)); // keep APP0 (JFIF) and every non-APP segment
    i += 2 + len;
  }
  return Buffer.concat(out);
}

const SCENES = ['living', 'kitchen', 'bedroom', 'bathroom', 'office', 'garden', 'house', 'lights', 'fireplace'];
const CAMERAS = ['camera-garden', 'camera-living'];
const browser = await playwright().chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
for (const n of [...SCENES, ...CAMERAS]) {
  const svg = scene(n);
  fs.mkdirSync(path.join(ROOT, 'tools/artwork/scenes'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'tools/artwork/scenes', `${n}.svg`), svg);
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  const jpg = stripJpeg(await page.screenshot({ type: 'jpeg', quality: 84, clip: { x: 0, y: 0, width: W, height: H } }));
  const dest = n.startsWith('camera') ? `assets/img/cameras/${n.replace('camera-', '')}.jpg` : `assets/img/scenes/${n}.jpg`;
  fs.mkdirSync(path.dirname(path.join(ROOT, dest)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, dest), jpg);
  console.log(dest, `${Math.round(jpg.length / 1024)} KB`);
}
await browser.close();
