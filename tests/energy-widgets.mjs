/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// HOME BATTERY and SOLAR widgets (real server, the SIMULATED home's fictional battery system):
//   1  Home battery: 64 %, kWh left from the usable capacity, "Charging" from the SIGN (+1.5 kW), ≈ time to full (marked as an estimate),
//      the reserve line, health / temperature / in / out today
//   2  the sign setting: "a positive power means discharging" turns the same reading into Discharging, ≈ time to the reserve
//   3  Solar: 4.2 kW now and % of 6 kWp, 18.4 kWh today vs the forecast (expected by now = 24.6 − 7.9 = 16.7 → 10 % above), tomorrow,
//      where it goes (house / battery / grid)
//   4  a missing entity: "—" / Unavailable, nothing invented; without entities: the demo
//   5  saved and reloaded; a role pointing at a non-sensor is dropped
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const lay = (x, y) => ({ desktop: { x, y, w: 4, h: 6 }, tablet: { x: x > 5 ? 1 : x, y: x > 5 ? y + 14 : y, w: 4, h: 6 }, mobile: { w: 4, h: 6 } });
const HB = { level: 'sensor.demo_energy_battery_level', power: 'sensor.demo_energy_battery', health: 'sensor.demo_energy_battery_health', temp: 'sensor.demo_energy_battery_temperature',
  inToday: 'sensor.demo_energy_battery_in_today', outToday: 'sensor.demo_energy_battery_out_today' };
const dash = { version: 3, app: { id: 'e', startPage: 'p', navigation: {}, simulated: true }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  { id: 'hb', type: 'homebattery', config: { name: 'Battery', map: HB, capacity: 10, reserve: 20 }, layout: lay(1, 1) },
  { id: 'hb2', type: 'homebattery', config: { name: 'Battery (other sign)', map: HB, capacity: 10, reserve: 20, positive: 'discharge' }, layout: lay(5, 1) },
  { id: 'sol', type: 'solar', config: { name: 'Solar', capacity: 6, map: { power: 'sensor.demo_energy_solar', today: 'sensor.demo_energy_solar_today', forecast: 'sensor.demo_energy_forecast_today',
    remaining: 'sensor.demo_energy_forecast_remaining', tomorrow: 'sensor.demo_energy_forecast_tomorrow', toBattery: 'sensor.demo_energy_battery' } }, layout: lay(9, 1) },
  { id: 'gone', type: 'homebattery', config: { name: 'Gone', map: { level: 'sensor.no_such_level', power: 'sensor.no_such_power' } }, layout: lay(1, 8) },
] }] };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Energy widgets', dashboard: dash })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1400, height: 1000 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/?d=${id}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 });
  await p.waitForFunction(() => document.querySelector('[data-grid-id="hb"] .iq-hb__pct')?.textContent === '64%', null, { timeout: 15000 }).catch(() => {});
  await wait(800);
  const hb = (k) => E((k) => { const r = document.querySelector(`[data-grid-id="${k}"] .iq-hb`); return { pct: r.querySelector('.iq-hb__pct').textContent, state: r.querySelector('.iq-hb__state').textContent, kwh: r.querySelector('.iq-hb__kwh').textContent,
    pw: r.querySelector('.iq-hb__pw').textContent, time: r.querySelector('.iq-hb__time').textContent, res: !r.querySelector('.iq-hb__res').hidden, chips: [...r.querySelectorAll('.iq-hb__chips li')].map((x) => x.textContent) }; }, k);
  const a = await hb('hb');
  check('1 · Home battery: 64 %, 6.4 of 10 kWh, Charging (+1.5 kW, from the sign), ≈ full in 2 h 24 (an estimate), the 20 % reserve line, health / temperature / in / out today',
    a.pct === '64%' && /6\.4 of 10 kWh/.test(a.kwh) && a.state === 'Charging' && /In 1\.5 kW/.test(a.pw) && /^≈ full in 2 h 24/.test(a.time) && a.res && a.chips.length === 4 && a.chips.some((c) => /Health97%/.test(c)),
    JSON.stringify(a));
  const b = await hb('hb2');
  check('2 · "positive means discharging": the same reading is Discharging, ≈ time to the 20 % reserve (4.4 kWh at 1.5 kW → 2 h 56)', b.state === 'Discharging' && /Out 1\.5 kW/.test(b.pw) && /^≈ reserve in 2 h 56/.test(b.time), JSON.stringify(b));
  const s = await E(() => { const r = document.querySelector('[data-grid-id="sol"] .iq-sol'); return { w: r.querySelector('.iq-sol__w').textContent, cap: r.querySelector('.iq-sol__cap').textContent, vs: r.querySelector('.iq-sol__vs').textContent,
    today: r.querySelector('.iq-sol__today').textContent, tom: r.querySelector('.iq-sol__tom').textContent, split: [...r.querySelectorAll('.iq-sol__seg')].map((x) => x.textContent), exp: !r.querySelector('.iq-sol__exp').hidden }; });
  check('3 · Solar: 4.2 kW now = 70 % of 6 kWp; 18.4 kWh today vs forecast 24.6 with 7.9 still expected → 10 % above forecast; tomorrow ≈ 19.2 kWh; split shows the battery',
    s.w === '4.2 kW' && /70% of 6 kWp/.test(s.cap) && s.vs === '10% above forecast' && /18\.4 kWh today · forecast 24\.6 · 7\.9 still expected/.test(s.today) && /19\.2 kWh/.test(s.tom) && s.exp && s.split.some((x) => /Battery 1\.5 kW/.test(x)), JSON.stringify(s));
  const g = await hb('gone');
  const demo = await E(() => { const R = window.MaisonRegistry; const a = R.build('homebattery', {}), b = R.build('solar', {}); document.body.append(a, b); const o = [a.querySelector('.iq-hb__pct').textContent, b.querySelector('.iq-sol__w').textContent]; a.remove(); b.remove(); return o; });
  check('4 · entities that do not exist: "—" and Unavailable, no estimate; without entities each widget shows its demo', g.pct === '—' && g.state === 'Unavailable' && !g.time && !g.kwh && demo[0] === '64%' && demo[1] === '4.2 kW', JSON.stringify({ g, demo }));
  await p.goto(`${L.base}/editor.html?d=${id}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(500);
  const clean = await E(() => window.MaisonRegistry.fullConfig('homebattery', { map: { level: 'light.x', power: 'sensor.p', nope: 'sensor.q' }, reserve: 99, positive: 'sideways' }));
  const saved = await E(() => { const md = window.editor.getModel(); md.pages[0].items[0].config.reserve = 30; window.editor.setModel(md); return window.editor.save(); });
  await p.reload(); await p.waitForFunction(() => window.editor, null, { timeout: 20000 });
  const back = await E(() => window.editor.getModel().pages[0].items[0].config);
  check('5 · saved and reloaded (reserve 30 %); a light as the level, an unknown role, an impossible reserve and sign are dropped', saved && back.reserve === 30 && back.map.level === HB.level && JSON.stringify(clean.map) === '{"power":"sensor.p"}' && clean.reserve === undefined && clean.positive === undefined,
    JSON.stringify({ back: back.reserve, clean }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('energy-widgets test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
