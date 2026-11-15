/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// VEHICLE widget (real server, the SIMULATED home — two fictional vehicles):
//   1  battery, range (HA's unit), charging line (power + time to full), target marker; the van: not plugged in; tabs switch vehicles
//   2  the target charge: + sends set_value inside the number's own range (the server re-checks); the limit stops at its max
//   3  unlock asks for a second tap (a single tap never unlocks); lock / unlock reach Home Assistant; the climate switch toggles
//   4  a missing / unavailable battery entity shows "—" and Unavailable, nothing invented; demo without entities
//   5  added through the gallery: configured (Name + vehicle), saved, reloaded
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const lay = (y, h = 7) => ({ desktop: { x: 1, y, w: 5, h }, tablet: { x: 1, y, w: 5, h }, mobile: { w: 4, h } });
const car = { id: 'v1', name: 'City car', battery: 'sensor.demo_car_battery', range: 'sensor.demo_car_range', target: 'number.demo_car_charge_limit', charging: 'binary_sensor.demo_car_charging',
  power: 'sensor.demo_car_charging_power', remaining: 'sensor.demo_car_time_to_full', plug: 'binary_sensor.demo_car_plugged', lock: 'lock.demo_car_doors', climate: 'switch.demo_car_climate', mileage: 'sensor.demo_car_odometer' };
const van = { id: 'v2', name: 'Van', battery: 'sensor.demo_van_battery', range: 'sensor.demo_van_range', plug: 'binary_sensor.demo_van_plugged' };
const dash = { version: 3, app: { id: 'v', startPage: 'p', navigation: {}, simulated: true }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  { id: 'two', type: 'vehicle', config: { name: 'Our vehicles', vehicles: [car, van] }, layout: lay(1, 8) },
  { id: 'gone', type: 'vehicle', config: { name: 'Gone', vehicles: [{ id: 'v1', name: 'Old car', battery: 'sensor.no_such_car_battery', range: 'sensor.no_such_range' }] }, layout: lay(10, 6) }] }] };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Vehicles', dashboard: dash })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1400, height: 1100 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/?d=${id}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 });
  await p.waitForFunction(() => document.querySelector('[data-grid-id="two"] .iq-veh__pct')?.textContent === '68%', null, { timeout: 15000 }).catch(() => {});
  await wait(600);
  const read = (k) => E((k) => { const r = document.querySelector(`[data-grid-id="${k}"] .iq-veh`); return { pct: r.querySelector('.iq-veh__pct').textContent, range: r.querySelector('.iq-veh__range').textContent, state: r.querySelector('.iq-veh__state').textContent,
    tgtShown: !r.querySelector('.iq-veh__tgt').hidden, tgtLeft: r.querySelector('.iq-veh__tgt').style.left, tval: r.querySelector('.iq-veh__tval').textContent, charging: r.dataset.charging, available: r.dataset.available,
    chips: [...r.querySelectorAll('.iq-veh__chip')].map((c) => [c.dataset.k, c.dataset.on, c.textContent]), tabs: [...r.querySelectorAll('.iq-veh__tab')].map((t) => t.textContent), pic: !!r.querySelector('.iq-veh__art, .iq-veh__img') }; }, k);
  // ---- 1
  const a = await read('two');
  check('1 · the car: 68%, 312 km, "Charging · 7.4 kW · full in 1 h 25", the target marker at 80%, plug / lock / climate chips, a picture; two tabs',
    a.pct === '68%' && /312\s*km/.test(a.range) && /Charging · 7\.4 kW · full in 1 h 25/.test(a.state) && /48,?210/.test(a.state) && a.tgtShown && a.tgtLeft === '80%' && a.charging === 'true' && a.pic
      && a.chips.map((c) => c[0]).join() === 'plug,lock,climate' && a.tabs.join() === 'City car,Van', JSON.stringify(a));
  await p.click('[data-grid-id="two"] .iq-veh__tab:nth-child(2)'); await wait(300);
  const b = await read('two');
  check('1b · the van: 41%, 118 km, not plugged in, no target, no lock chip', b.pct === '41%' && /118/.test(b.range) && /Not plugged in/.test(b.state) && !b.tgtShown && b.chips.map((c) => c[0]).join() === 'plug', JSON.stringify(b));
  await p.click('[data-grid-id="two"] .iq-veh__tab:nth-child(1)'); await wait(300);
  // ---- 2 · target +
  const st = (id) => E(async (id) => { for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 250)); } return window.IniqHA.get(id)?.state; }, id);
  await p.click('[data-grid-id="two"] .iq-veh__step[data-d="1"]'); await wait(1500);
  const t2 = await read('two');
  const sent = await st('number.demo_car_charge_limit');
  for (let i = 0; i < 6; i++) { await p.click('[data-grid-id="two"] .iq-veh__step[data-d="1"]').catch(() => {}); await wait(700); }
  const t3 = await read('two'); const plusOff = await E(() => document.querySelector('[data-grid-id="two"] .iq-veh__step[data-d="1"]').disabled);
  check('2 · + raises the target by the number\'s own step (80 → 85; the number in Home Assistant becomes 85), stops at its maximum (100)', t2.tval === '85%' && String(sent) === '85' && t3.tval === '100%' && plusOff, JSON.stringify({ t2: t2.tval, t3: t3.tval, sent, plusOff }));
  // ---- 3 · unlock twice, climate
  await p.click('[data-grid-id="two"] .iq-veh__chip[data-k="lock"]'); await wait(800);
  const armed = await read('two'); const after1 = await E(() => window.IniqHA.get('lock.demo_car_doors')?.state);
  await p.click('[data-grid-id="two"] .iq-veh__chip[data-k="lock"]'); await wait(1500);
  const un = await read('two'); const after2 = await st('lock.demo_car_doors');
  await wait(4500);
  await p.click('[data-grid-id="two"] .iq-veh__chip[data-k="lock"]'); await wait(1500);
  const re = await read('two');
  await p.click('[data-grid-id="two"] .iq-veh__chip[data-k="climate"]'); await wait(1500);
  const cl = await read('two'); const clSt = await st('switch.demo_car_climate'); const reSt = await st('lock.demo_car_doors');
  check('3 · unlock: the first tap only asks ("Tap again to unlock"), the second unlocks; a tap locks again at once; the climate switch turns on',
    after1 === 'locked' && armed.chips.find((c) => c[0] === 'lock')[2] === 'Tap again to unlock' && after2 === 'unlocked' && un.chips.find((c) => c[0] === 'lock')[1] === 'false' && re.chips.find((c) => c[0] === 'lock')[1] === 'true' && cl.chips.find((c) => c[0] === 'climate')[1] === 'true' && clSt === 'on' && reSt === 'locked',
    JSON.stringify({ clSt, reSt, after1, after2, armed: armed.chips, un: un.chips, re: re.chips, cl: cl.chips }));
  // ---- 4
  const g = await read('gone');
  check('4 · a vehicle whose entities do not exist: "—", Unavailable, no range invented', g.pct === '—' && g.available === 'false' && /Unavailable/.test(g.state) && !g.range, JSON.stringify(g));
  // ---- 5 · the gallery + configuration + save + reload (editor)
  await p.goto(`${L.base}/editor.html?d=${id}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(800);
  await E(() => window.editor.setEditing(true)); await wait(300);
  const added = await E(() => { const md = window.editor.getModel(); md.pages[0].items.push({ id: 'new', type: 'vehicle', parent: null, config: window.MaisonRegistry.fullConfig('vehicle', { name: 'Garage', vehicles: [{ id: 'v1', name: 'Hatchback', battery: 'sensor.demo_van_battery', image: 'javascript:alert(1)', lock: 'sensor.wrong_domain' }] }), layout: { desktop: { x: 7, y: 1, w: 4, h: 6 } } }); return window.editor.setModel(md); });
  const saved = await E(() => window.editor.save());
  await p.reload(); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(1200);
  const back = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'new')?.config);
  const shown = await E(() => document.querySelector('[data-grid-id="new"] .iq-veh__pct')?.textContent);
  const demo = await E(() => { const el = window.MaisonRegistry.build('vehicle', {}); document.body.append(el); const t = el.querySelector('.iq-veh__pct').textContent; el.remove(); return t; });
  check('5 · a new Vehicle saved and reloaded: shows its battery; an unsafe picture address and a wrong-domain entity are dropped; with no vehicle: the demo',
    added.ok && saved && back && back.vehicles[0].name === 'Hatchback' && !back.vehicles[0].image && !back.vehicles[0].lock && shown === '41%' && demo === '68%', JSON.stringify({ added, saved, back, shown, demo }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('vehicle test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
