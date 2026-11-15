/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
import { start, check } from './lib/harness.mjs';
const iso = (h) => new Date(Date.now() + h * 3600000).toISOString();
const T = await start([
  ['sun.sun', 'above_horizon', { name: 'Sun', el: 33.4, az: 191.2, ns: iso(5), nr: iso(14), nn: iso(23), nd: iso(13), nu: iso(6), nm: iso(11), ri: false }],
  ['sun.night', 'below_horizon', { name: 'Night sun', el: -22, az: 20, ns: iso(20), nr: iso(8), ri: true }],
  ['sun.bare', 'above_horizon', { name: 'Bare' }],
  ['sensor.moon', 'waning_gibbous', { name: 'Moon', dc: 'enum' }],
  ['sensor.moonrise', iso(3), { name: 'Moonrise', dc: 'timestamp' }],
  ['sensor.weird_moon', 'blue_moon', { name: 'Weird' }],
]);
const page = await T.page();
const q = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const vis = (sel) => page.$eval(sel, (e) => !!e.offsetParent).catch(() => false);

await T.mount(page, 'sunmoon', { entity: 'sun.sun' }, 300, 380);
check('state in words', (await q('#w .iq-sun__state')) === 'Above the horizon');
check('elevation + azimuth + compass', (await q('#w .iq-sun__pos')) === 'Elevation 33° · Azimuth 191° S', await q('#w .iq-sun__pos'));
const labels = await page.$$eval('#w .iq-sun__tl', (l) => l.map((x) => x.textContent));
check('next events chronological: sunset, dusk? → by time', labels[0] === 'Sunset' && labels.includes('Sunrise') && labels.includes('Solar noon'), labels.join());
const dot = await page.$eval('#w .iq-sun__dot', (e) => [Number(e.getAttribute('cx')), Number(e.getAttribute('cy'))]);
check('sun dot: az 191° (south, slightly west of south) at 33° elevation on the sky arc', Math.abs(dot[0] - 110.3) < 4 && dot[1] > 55 && dot[1] < 70, JSON.stringify(dot));
check('no moon without a mapping (nothing invented)', !(await vis('#w .iq-sun__moon')));
await T.mount(page, 'sunmoon', { entity: 'sun.sun', mappings: { moon: 'sensor.moon', moonrise: 'sensor.moonrise' } }, 300, 420);
await page.waitForTimeout(2800);
check('moon phase in HA words', (await q('#w .iq-sun__moonname')) === 'Waning gibbous', await q('#w .iq-sun__moonname'));
check('moonrise from the mapped timestamp', (await q('#w .iq-sun__moonmore')).startsWith('Moonrise'), await q('#w .iq-sun__moonmore'));
check('moon icon drawn for a known phase', !!(await page.$('#w .iq-sun__moonlit')));
await T.mount(page, 'sunmoon', { entity: 'sun.sun', mappings: { moon: 'sensor.weird_moon' } }, 300, 420);
await page.waitForTimeout(2800);
check('unknown phase name: HA word shown, plain disc (no invented phase)', (await q('#w .iq-sun__moonname')) === 'Blue moon' && !(await page.$('#w .iq-sun__moonlit')));
await T.mount(page, 'sunmoon', { entity: 'sun.night' }, 300, 380);
check('below horizon: words + hollow dot on the rim', (await q('#w .iq-sun__state')) === 'Below the horizon' && !!(await page.$('#w .iq-sun__dot--below')));
await T.mount(page, 'sunmoon', { entity: 'sun.bare' }, 300, 380);
check('sun without position/events: no invented values', !(await vis('#w .iq-sun__pos')) && (await page.$$('#w .iq-sun__time')).length === 0);
await T.mount(page, 'sunmoon', { entity: 'sun.sun', variant: 'times' }, 300, 90);
check('times variant: sunrise + sunset only', (await page.$$eval('#w .iq-sun__time', (l) => l.filter((x) => x.offsetParent).map((x) => x.dataset.k))).sort().join() === 'rising,setting');
for (const [w, h] of [[150, 110], [200, 200], [440, 200], [300, 420]]) {
  await T.mount(page, 'sunmoon', { entity: 'sun.sun', mappings: { moon: 'sensor.moon' } }, w, h);
  await page.waitForTimeout(2800);
  const ok = await page.$eval('#w .iq-sun', (e) => { const r = e.getBoundingClientRect(); return [...e.querySelectorAll('.iq-sun__plot,.iq-sun__state,.iq-sun__time,.iq-sun__moon')].filter((x) => x.getClientRects().length && getComputedStyle(x).display !== 'none').every((x) => { const b = x.getBoundingClientRect(); return b.right <= r.right + 1 && b.bottom <= r.bottom + 1 && b.left >= r.left - 1 && b.top >= r.top - 1; }); });
  check(`fits ${w}x${h}`, ok);
}
await T.mount(page, 'sunmoon', { demoMoon: 'full_moon' }, 300, 420);
check('demo shows a sample sun + the chosen demo moon', (await q('#w .iq-sun__state')) === 'Above the horizon' && (await q('#w .iq-sun__moonname')) === 'Full moon');
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
