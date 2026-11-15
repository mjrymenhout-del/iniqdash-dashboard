/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// VISUAL SNAPSHOT of the reference ROOM, LIGHT, CLIMATE and POPUP (real PHP server, fake Home Assistant): every card's screenshot and a
// DOM signature (each element's class, logical box, font size, colours, background, radius, shadow, opacity, transform, visibility), at
// runtime and in the configure preview. Used to compare a refactor BEFORE / AFTER: `node tests/lib/snapshot.mjs <out-dir>` then
// `node tests/lib/snapshot.mjs --compare <before-dir> <after-dir>`.
import fs from 'node:fs';
import path from 'node:path';
import { live, liveBrowser } from './live.mjs';
import { roomPopup, POPUP_ID, DEMO_ENTITIES } from './room-popup.mjs';

const [, , a1, a2, a3] = process.argv;
if (a1 === '--compare') {
  const A = JSON.parse(fs.readFileSync(path.join(a2, 'sig.json'), 'utf8')), Bs = JSON.parse(fs.readFileSync(path.join(a3, 'sig.json'), 'utf8'));
  let diffs = 0;
  for (const k of Object.keys(A)) {
    const x = A[k], y = Bs[k] || [];
    if (x.length !== y.length) { console.log(`DIFF ${k}: ${x.length} → ${y.length} elements`); diffs++; }
    const n = Math.min(x.length, y.length);
    for (let i = 0; i < n; i++) if (x[i] !== y[i]) { console.log(`DIFF ${k}[${i}]\n  - ${x[i]}\n  + ${y[i]}`); if (++diffs > 60) break; }
  }
  // pixels: decoded in a browser canvas; a pixel differs when a channel moves by more than 24 (anti-aliasing noise is ignored)
  const { playwright } = await import('./harness.mjs');
  const br = await playwright().chromium.launch(), pg = await br.newPage();
  for (const f of fs.readdirSync(a2).filter((n) => n.endsWith('.png'))) {
    const q = path.join(a3, f);
    if (!fs.existsSync(q)) { console.log(`PIXELS missing: ${f}`); diffs++; continue; }
    const r = await pg.evaluate(async ([x, y]) => {
      const load = (b) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = `data:image/png;base64,${b}`; });
      const [i, j] = await Promise.all([load(x), load(y)]);
      if (i.width !== j.width || i.height !== j.height) return { size: `${i.width}×${i.height} → ${j.width}×${j.height}` };
      const c = (im) => { const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const p = c(i), q = c(j); let n = 0;
      for (let k = 0; k < p.length; k += 4) if (Math.abs(p[k] - q[k]) > 24 || Math.abs(p[k + 1] - q[k + 1]) > 24 || Math.abs(p[k + 2] - q[k + 2]) > 24) n++;
      return { n, total: p.length / 4 };
    }, [fs.readFileSync(path.join(a2, f)).toString('base64'), fs.readFileSync(q).toString('base64')]);
    if (r.size || r.n > r.total * 0.002) { console.log(`PIXELS differ: ${f} ${JSON.stringify(r)}`); diffs++; } else if (r.n) console.log(`pixels ~ ${f}: ${r.n} of ${r.total} (noise)`);
  }
  await br.close();
  console.log(diffs ? `${diffs} difference(s)` : 'IDENTICAL: signatures and pixels');
  process.exit(0);
}
const OUT = a1 || 'snapshot';
fs.mkdirSync(OUT, { recursive: true });
let L, B;
try {
  L = await live();
  Object.entries(DEMO_ENTITIES).forEach(([k, v]) => L.setEntity(k, v[0], v[1]));
  L.setEntity('light.salon', 'on', { name: 'Salon lamp', f: 0, area: 'salon' });
  L.setEntity('sensor.salon_temp', '21.4', { name: 'Salon temperature', unit: '°C', dc: 'temperature' });
  L.setEntity('sensor.salon_hum', '48', { name: 'Salon humidity', unit: '%', dc: 'humidity' });
  L.setEntity('fan.salon', 'on', { name: 'Salon fan' });
  L.setEntity('scene.relax', 'unknown', { name: 'Relax' }); L.setEntity('scene.guest', 'unknown', { name: 'Guest' });
  L.setEntity('light.full', 'on', { name: 'Dining', f: 0, scm: ['color_temp', 'hs'], br: 184, cm: 'color_temp', ctk: 2700, ckmin: 2000, ckmax: 6500, hs: [30, 80] });
  L.setEntity('climate.stove', 'heat', { name: 'Pellet stove', f: 1 | 16, cur: 21.4, target: 22.5, min: 5, max: 35, step: 0.5, modes: ['heat', 'off'], action: 'heating', preset: 'eco', pml: ['eco', 'comfort'] });
  L.setEntity('sensor.pellet_state', 'Spegnimento', { name: 'Pellet stove' });
  L.setEntity('sensor.exhaust_temp', '118', { name: 'Exhaust', unit: '°C', dc: 'temperature' });
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1400 } }); const page = B.page;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y, w: Math.min(w, 8), h }, mobile: { w: 4, h } });
  const ROOM_INFO = [{ id: 'i1', entity: 'sensor.salon_temp', value: 'state', label: 'Temp', icon: 'mdi:thermometer', color: 'accent-hot', valueSize: 22, iconBg: 'subtle' },
    { id: 'i2', entity: 'sensor.salon_hum', value: 'state', icon: 'mdi:water-percent', color: 'info' },
    { id: 'i3', entity: 'fan.salon', value: 'state', label: 'Fan', icon: 'mdi:fan', animation: 'rotate', showLabel: false }];
  const SCENES = [{ label: 'Relax', icon: 'mdi:sofa' }, { label: 'Guest', icon: 'mdi:account', style: 'filled', color: 'accent', shape: 'pill', size: 64, iconSize: 26 }, { label: 'Night', icon: 'mdi:weather-night', style: 'outline', showLabel: false }];
  const items = [
    { id: 'r1', type: 'custom.room-scene', config: { name: 'Living Room', area: 'salon', image: 'widgets/custom/room-scene/assets/demo-living-room.svg', info: ROOM_INFO, scenes: SCENES, haSlots: { scenes: ['scene.relax', 'scene.guest'] } }, layout: lay(1, 1, 7, 7) },
    { id: 'r2', type: 'custom.room-scene', config: { name: 'Study', variant: 'status', fallbackIcon: { icon: 'mdi:desk', color: 'accent', animation: 'pulse', animateWhen: 'always' }, info: ROOM_INFO, scenes: SCENES }, layout: lay(8, 1, 5, 6) },
    { id: 'r3', type: 'custom.room-scene', config: { name: 'Hall', variant: 'card', fallbackIcon: { icon: 'mdi:door', background: 'accent' }, info: ROOM_INFO.slice(0, 2), scenes: SCENES.slice(0, 2), sceneGap: 14, sceneAlign: 'center' }, layout: lay(1, 8, 7, 4) },
    { id: 'l1', type: 'light', config: { name: 'Dining', entity: 'light.full' }, layout: lay(8, 8, 5, 5) },
    { id: 'l2', type: 'light', config: { name: 'Desk', state: 'on', brightness: 60, capabilities: { power: true, brightness: true, colorTemp: true }, variant: 'compact' }, layout: lay(1, 12, 6, 2) },
    { id: 'c1', type: 'climate', config: { name: 'Pellet stove', entity: 'climate.stove', image: 'widgets/default/climate/assets/fireplace.svg', controls: [{ type: 'dial' }, { type: 'mode' }, { type: 'minus' }, { type: 'plus' }, { type: 'power' }, { type: 'preset' }],
      info: [{ id: 'h1', entity: 'sensor.pellet_state', label: 'Pellet stove', icon: 'mdi:fire', color: 'accent-hot', animation: 'pulse', animateWhen: 'always', slot: 'left', vslot: 'bottom' }, { id: 'h2', entity: 'sensor.exhaust_temp', label: 'Exhaust', icon: 'mdi:weather-windy', iconBg: 'subtle', style: 'minimal', slot: 'right', vslot: 'bottom' }] }, layout: lay(1, 14, 6, 13) },
    { id: 'c2', type: 'climate', config: { name: 'Pellet stove', entity: 'climate.stove', titlePlace: 'bottom-center', infoLayout: 'bar', barTopDivider: true,
      controls: [{ type: 'dial', design: 'digital', place: 'center-center' }, { type: 'mode', place: 'top-left' }, { type: 'minus', place: 'center-left', ox: 6 }, { type: 'plus', place: 'center-right' }, { type: 'power', show: true, place: 'top-right' }, { type: 'preset', show: false }],
      info: [{ id: 'h1', entity: 'sensor.salon_temp', label: 'Room now', icon: 'mdi:thermometer', style: 'minimal' }, { id: 'h2', entity: 'sensor.pellet_state', label: 'Pellet stove', icon: 'mdi:fire', color: 'accent-hot', style: 'minimal' },
        { id: 'h3', entity: 'sensor.exhaust_temp', label: 'Exhaust', icon: 'mdi:weather-windy', style: 'minimal', inDial: true, dialSlot: 'top' }, { id: 'h4', entity: 'sensor.salon_hum', label: 'Humidity', icon: 'mdi:water-percent', style: 'card' }] }, layout: lay(7, 14, 6, 14) },
  ];
  const ok = await E(({ items, pp }) => { const m = window.editor.getModel(); m.pages[0].items.push(...items.map((x) => ({ ...x, parent: null }))); m.popups = [...(m.popups || []), pp]; const r = window.editor.setModel(m); return r.ok ? 'ok' : JSON.stringify(r.errors); }, { items, pp: roomPopup() });
  if (ok !== 'ok') throw new Error(ok);
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(2500);
  const sig = {};
  /** the DOM signature of an element and its descendants (logical boxes relative to the root) */
  const signature = (sel) => E((sel) => {
    const r = document.querySelector(sel); if (!r) return ['MISSING'];
    const rr = r.getBoundingClientRect(), out = [];
    [r, ...r.querySelectorAll('*')].forEach((n) => {
      if (n.closest('svg') && n.tagName.toLowerCase() !== 'svg') return;
      const b = n.getBoundingClientRect(), cs = getComputedStyle(n);
      out.push([n.tagName.toLowerCase(), typeof n.className === 'string' ? n.className : '', Math.round(b.left - rr.left), Math.round(b.top - rr.top), Math.round(b.width), Math.round(b.height),
        cs.fontSize, cs.fontWeight, cs.color, cs.backgroundColor, cs.backgroundImage.replace(/https?:\/\/[^/]+/g, '').slice(0, 80), cs.borderRadius, cs.boxShadow.slice(0, 80), cs.opacity, cs.transform, cs.display, cs.visibility,
        n.getAttribute('aria-label') || '', n.getAttribute('role') || '', n.children.length ? '' : (n.textContent || '').trim().slice(0, 30)].join('|'));
    });
    return out;
  }, sel);
  for (const it of items) {
    const sel = `[data-grid-id="${it.id}"]`;
    await page.locator(sel).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    sig[it.id] = await signature(sel);
    await page.locator(sel).screenshot({ path: path.join(OUT, `${it.id}.png`), animations: 'disabled' });
  }
  await E((id) => window.editor.openPopup(id), POPUP_ID); await page.waitForTimeout(2200);
  sig.popup = await signature('.mpop__panel');
  await page.locator('.mpop__panel').screenshot({ path: path.join(OUT, 'popup.png'), animations: 'disabled' });
  fs.writeFileSync(path.join(OUT, 'sig.json'), JSON.stringify(sig, null, 1));
  console.log(`snapshot: ${Object.keys(sig).length} cards → ${OUT}; errors: ${B.errors.join(' | ') || 'none'}`);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
