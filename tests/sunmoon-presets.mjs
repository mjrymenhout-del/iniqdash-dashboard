/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// SUN & MOON PRESETS — the sun-path presets of the existing Sun & Moon widget (minimal · horizon · atmospheric · detail · moon), all from
// what Home Assistant reports: the sun ON the path at its real azimuth, above / below the horizon from its real elevation, Home Assistant's
// next sunrise / sunset as the labels, the moon only from a mapped sensor. FAKE Home Assistant (tests/lib/harness.mjs — not a real one).
import { start, check } from './lib/harness.mjs';
const SHOTS = process.env.SHOTS || '';
const iso = (h) => new Date(Date.now() + h * 3600000).toISOString();
const T = await start([
  ['sun.sun', 'above_horizon', { name: 'Sun', el: 33.4, az: 191.2, ns: iso(5), nr: iso(14), nn: iso(23), nd: iso(13), nu: iso(6), nm: iso(11), ri: false }],
  ['sun.east', 'above_horizon', { name: 'Morning sun', el: 12, az: 110, ns: iso(9), nr: iso(20), ri: true }],
  ['sun.dusk', 'below_horizon', { name: 'Dusk', el: -3, az: 290, ns: iso(23), nr: iso(10), ri: true }],
  ['sun.night', 'below_horizon', { name: 'Night sun', el: -22, az: 20, ns: iso(20), nr: iso(8), ri: true }],
  ['sensor.moon', 'first_quarter', { name: 'Moon', dc: 'enum' }],
]);
const page = await T.page();
const geo = () => page.evaluate(() => {
  const r = document.querySelector('#w .iq-sun'), a = r && r.querySelector('.iq-sun__arc'), sun = a && a.querySelector('.iq-sun__sun'), al = a ? [...a.querySelectorAll('.iq-sun__al')].map((t) => t.textContent) : [];
  let onPath = null;
  if (sun && a.querySelector('.iq-sun__track').getTotalLength) {
    const p = a.querySelector('.iq-sun__track'), x = Number(sun.getAttribute('cx')), y = Number(sun.getAttribute('cy')), n = p.getTotalLength();
    let best = 1e9; for (let i = 0; i <= 400; i++) { const q = p.getPointAtLength((n * i) / 400); best = Math.min(best, Math.hypot(q.x - x, q.y - y)); }
    onPath = best;
  }
  return { variant: r.dataset.variant, sky: r.dataset.sky, arc: !!a, oldPlot: !!r.querySelector('.iq-sun__plot') && getComputedStyle(r.querySelector('.iq-sun__plot')).display !== 'none', cx: sun && Number(sun.getAttribute('cx')), cy: sun && Number(sun.getAttribute('cy')),
    below: sun && sun.classList.contains('iq-sun__sun--below'), labels: al, onPath, pos: r.querySelector('.iq-sun__pos')?.textContent, moon: !!r.querySelector('.iq-sun__moonlit'), moonVisible: !!r.querySelector('.iq-sun__moon:not([hidden])') && getComputedStyle(r.querySelector('.iq-sun__moon')).display !== 'none', bg: getComputedStyle(r).backgroundImage };
});
const res = {};
for (const v of ['minimal', 'horizon', 'atmospheric', 'detail', 'moon']) {
  await T.mount(page, 'sunmoon', { entity: 'sun.sun', variant: v }, 360, 300); await page.waitForTimeout(250);
  res[v] = await geo();
  if (SHOTS) await (await page.$('#w')).screenshot({ path: `${SHOTS}/c1-${v}.png` });
}
check('FIVE PRESETS of the one widget (minimal · horizon · atmospheric · detail · moon): each draws the sun path instead of the sky plot', Object.values(res).every((r) => r.arc && !r.oldPlot), JSON.stringify(Object.entries(res).map(([k, r]) => [k, r.arc, r.oldPlot])));
check('THE SUN ON ITS PATH at its real azimuth (191° ≈ just west of south): on the drawn line (< 1.5 px), right of the middle; above the horizon (not hollow)',
  Object.values(res).every((r) => r.onPath < 1.5 && r.cx > 100 && r.cx < 120 && !r.below), JSON.stringify(Object.entries(res).map(([k, r]) => [k, r.cx, r.onPath && r.onPath.toFixed(2), r.below])));
check('LABELS: Home Assistant\'s next sunrise (↑, in 14 h → "Tomorrow …" or today) and next sunset (in 5 h)', Object.values(res).every((r) => /^↑ /.test(r.labels[0]) && / ↓$/.test(r.labels[1])), JSON.stringify(res.minimal.labels));
check('SOLAR DETAIL: the real elevation and azimuth in words', /Elevation 33° · Azimuth 191° S/.test(res.detail.pos), res.detail.pos);
check('MOON preset without a mapped moon sensor: no moon is invented', !res.moon.moon, JSON.stringify(res.moon));
await T.mount(page, 'sunmoon', { entity: 'sun.sun', variant: 'moon', mappings: { moon: 'sensor.moon' } }, 360, 320);
await page.waitForFunction(() => !!document.querySelector('#w .iq-sun__moonlit'), null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(150);
const mo = await geo();
if (SHOTS) await (await page.$('#w')).screenshot({ path: `${SHOTS}/c1-moon-mapped.png` });
check('MOON preset with the mapped moon sensor: the first-quarter phase drawn large beside the sun path', mo.moon && mo.moonVisible, JSON.stringify(mo));
// morning sun: east of south → left of the middle
await T.mount(page, 'sunmoon', { entity: 'sun.east', variant: 'minimal' }, 360, 300); await page.waitForTimeout(250);
const ea = await geo();
check('MORNING (azimuth 110°, east): the sun left of the middle, on the path', ea.cx < 100 && ea.onPath < 1.5 && !ea.below, JSON.stringify(ea));
// atmospheric: the sky follows the REAL elevation
const skies = {};
for (const [e, want] of [['sun.sun', 'day'], ['sun.dusk', 'twilight'], ['sun.night', 'night']]) { await T.mount(page, 'sunmoon', { entity: e, variant: 'atmospheric' }, 360, 300); await page.waitForTimeout(200); skies[e] = await geo(); skies[e].want = want; if (SHOTS) await (await page.$('#w')).screenshot({ path: `${SHOTS}/c1-atmo-${want}.png` }); }
check('ATMOSPHERIC: the sky is day (33°), twilight (−3°), night (−22°) — from the real elevation, each its own gradient', Object.values(skies).every((r) => r.sky === r.want) && new Set(Object.values(skies).map((r) => r.bg)).size === 3, JSON.stringify(Object.values(skies).map((r) => [r.want, r.sky])));
check('BELOW THE HORIZON: the sun rests hollow under the line', skies['sun.night'].below === true, JSON.stringify(skies['sun.night']));
// look options
await T.mount(page, 'sunmoon', { entity: 'sun.sun', variant: 'horizon', arcWidth: 6, glow: false, showHorizon: false, showLabels: false, sunColor: 'info' }, 360, 300); await page.waitForTimeout(200);
const lk = await page.evaluate(() => { const a = document.querySelector('#w .iq-sun__arc'); return { w: a.querySelector('.iq-sun__track').getAttribute('stroke-width'), hz: getComputedStyle(a.querySelector('.iq-sun__hz')).display, lab: getComputedStyle(a.querySelector('.iq-sun__al')).display, halo: getComputedStyle(a.querySelector('.iq-sun__halo')).display, sun: getComputedStyle(a.querySelector('.iq-sun__sun')).fill }; });
check('LOOK: path thickness 6, no glow, no horizon line, no labels, sun colour Information (a theme token)', lk.w === '6' && lk.hz === 'none' && lk.lab === 'none' && lk.halo === 'none' && lk.sun === 'rgb(59, 167, 255)', JSON.stringify(lk));
// the default presets are unchanged
await T.mount(page, 'sunmoon', { entity: 'sun.sun' }, 360, 300); await page.waitForTimeout(200);
const sky = await geo();
check('DEFAULT (Sky) is unchanged: the sky plot, no sun path', sky.variant === 'sky' && !sky.arc && sky.oldPlot, JSON.stringify(sky));
check('no page errors', page.errors.length === 0, page.errors.join(' | '));
await T.close();
