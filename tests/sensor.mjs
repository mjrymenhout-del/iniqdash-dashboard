/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
import { start, check } from './lib/harness.mjs';
const T = await start([
  ['sensor.temp', '21.5', { name: 'Temp', unit: '°C', dc: 'temperature' }],
  ['sensor.batt', '37', { name: 'Batt', unit: '%', dc: 'battery' }],
  ['sensor.power', '1200', { name: 'Power', unit: 'W', dc: 'power' }],
  ['binary_sensor.door', 'on', { name: 'Door', dc: 'door' }],
  ['binary_sensor.smoke', 'on', { name: 'Smoke', dc: 'smoke' }],
  ['input_number.vol', '30', { name: 'Vol', nmin: 0, nmax: 60, nstep: 1 }],
]);
const page = await T.page();
const q = (sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const level = () => page.$eval('#w .sw__level', (e) => ({ hidden: e.hidden, w: e.firstElementChild.style.width })).catch(() => null);

await T.mount(page, 'sensor', { entity: 'sensor.batt', variant: 'level' }, 300, 180);
let l = await level();
check('level: percentage sensor draws 37%', !l.hidden && l.w === '37%', JSON.stringify(l));
await T.mount(page, 'sensor', { entity: 'sensor.temp', variant: 'level' }, 300, 180);
check('level: no range → no bar (nothing invented)', (await level()).hidden);
await T.mount(page, 'sensor', { entity: 'sensor.temp', variant: 'level', levelMin: 10, levelMax: 30 }, 300, 180);
l = await level();
check('level: owner range 10–30 → 57.5%', !l.hidden && l.w === '57.5%', JSON.stringify(l));
await T.mount(page, 'sensor', { entity: 'input_number.vol', variant: 'level' }, 300, 180);
l = await level();
check('level: entity range 0–60 → 50%', !l.hidden && l.w === '50%', JSON.stringify(l));
await T.mount(page, 'sensor', { variant: 'level', value: 60, unit: '%' }, 300, 180);
check('level: demo percentage', !(await level()).hidden);

await T.mount(page, 'sensor', { entity: 'binary_sensor.door', variant: 'status' }, 300, 180);
check('status: HA words (Open)', (await q('#w .sw__value')) === 'Open', await q('#w .sw__value'));
check('status: door open is not an alert', (await page.$eval('#w .sw', (e) => e.dataset.tone)) === 'normal');
await T.mount(page, 'sensor', { entity: 'binary_sensor.smoke', variant: 'status' }, 300, 180);
check('status: smoke on → warning tone', (await page.$eval('#w .sw', (e) => e.dataset.tone)) === 'warning');

// mini graph: asks for history (area) for the entity only; draws nothing when there is none
let histReq = 0;
await page.route('**/api/ha_history.php*', (r) => { histReq++; r.fulfill({ json: { ok: true, configured: true, results: { 'sensor.temp': { error: null, points: [[Date.now() - 3600000, 20, 19, 21], [Date.now() - 1800000, 22, 21, 23]], start: Date.now() - 6 * 3600000, end: Date.now(), step: 600000, refresh: 60 } } } }); });
await T.mount(page, 'sensor', { entity: 'sensor.temp', variant: 'graph' }, 320, 200);
await page.waitForTimeout(1200);
check('graph: requests the real history', histReq > 0);
check('graph: drawn from it', (await page.$eval('#w .iq-hist', (e) => e.dataset.drawn).catch(() => '0')) !== '0');
histReq = 0;
await T.mount(page, 'sensor', { entity: 'sensor.temp' }, 320, 200);
await page.waitForTimeout(800);
check('standard: no history requested', histReq === 0);
await T.mount(page, 'sensor', { variant: 'graph' }, 320, 200);
check('graph demo: nothing invented', !(await page.$('#w .iq-hist')));
check('no page errors', page.errors.length === 0, page.errors.join('|'));
await T.close();
