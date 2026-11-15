/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ENERGY FLOW · SYSTEM layout (real server, the SIMULATED home's fictional battery system):
//   1  the house at the centre, every node around it (solar, grid, battery, heat pump), the house value from its own sensor
//   2  routes worked out from the SIGNED totals: solar → house 1 800, solar → battery 1 500, solar → grid 900 — kW and W mixed correctly;
//      self-powered 100 %; nothing goes grid → house; directions from the signs only
//   3  the routing algorithm on its own: evening (battery discharging + import), grid charging the battery, zero readings, a battery
//      discharging to the grid — every route non-negative and the totals add up
//   4  an unavailable / missing reading: dashed, still, "Not found"; the routes are not drawn and the card says why
//   5  the balance check: a house reading that does not match what the sources deliver is said plainly
//   6  an ENERGY reading (kWh) on a node is shown as a value, never animated
//   7  style settings (line thickness, glow, speed, node size, decimals) reach the drawing; saved and reloaded
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const nodes = [
  { id: 'sun', type: 'solar', entity: 'sensor.demo_energy_solar' },
  { id: 'net', type: 'grid', entity: 'sensor.demo_energy_grid' },
  { id: 'bat', type: 'battery', entity: 'sensor.demo_energy_battery', level: 'sensor.demo_energy_battery_level' },
  { id: 'hp', type: 'heatpump', entity: 'sensor.demo_energy_heat_pump', label: 'Heat pump' },
];
const lay = (y) => ({ desktop: { x: 1, y, w: 8, h: 9 }, tablet: { x: 1, y, w: 8, h: 9 }, mobile: { w: 4, h: 9 } });
const E1 = (extra, n = nodes) => ({ name: 'Energy', variant: 'system', entity: 'sensor.demo_energy_house', nodes: n, ...extra });
const dash = { version: 3, app: { id: 'e', startPage: 'p', navigation: {}, simulated: true }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  { id: 'sys', type: 'energy', config: E1({ lineWidth: 5, glowLevel: 70, flowSpeed: 'fast', nodeSize: 'l', decimals: 1 }), layout: lay(1) },
  { id: 'na', type: 'energy', config: E1({}, [nodes[0], { id: 'net', type: 'grid', entity: 'sensor.demo_energy_grid_missing' }, nodes[2]]), layout: lay(11) },
  { id: 'off', type: 'energy', config: E1({ entity: 'sensor.house_power' }), layout: lay(21) },
  { id: 'kwh', type: 'energy', config: E1({}, [nodes[0], nodes[1], nodes[2], { id: 'today', type: 'custom', entity: 'sensor.demo_energy_solar_today', label: 'Solar today' }]), layout: lay(31) },
] }] };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'System', dashboard: dash })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1400, height: 1100 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/?d=${id}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 });
  await p.waitForFunction(() => /1\.8 kW/.test(document.querySelector('[data-grid-id="sys"] .iq-esys__hv')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  await wait(1200);
  const read = (k) => E((k) => { const r = document.querySelector(`[data-grid-id="${k}"] .iq-energy--sys`);
    return { house: r.querySelector('.iq-esys__hv').textContent, self: r.querySelector('.iq-esys__self').hidden ? '' : r.querySelector('.iq-esys__self').textContent,
      note: r.querySelector('.iq-esys__note').hidden ? '' : r.querySelector('.iq-esys__note').textContent,
      nodes: [...r.querySelectorAll('.iq-esys__node')].map((n) => [n.dataset.type, n.querySelector('.iq-esys__v').textContent, n.querySelector('.iq-esys__x').textContent, n.dataset.state, n.dataset.energy]),
      routes: r.energy.routes(), sr: [...r.querySelectorAll('.iq-esys__sr li')].map((x) => x.textContent),
      spokes: [...r.querySelectorAll('.iq-esys__fl:not(.iq-esys__rt)')].map((f) => [f.dataset.still, f.dataset.dir, f.dataset.state]),
      lw: getComputedStyle(r).getPropertyValue('--iq-esys-lw').trim(), glow: getComputedStyle(r).getPropertyValue('--iq-esys-glow').trim(), nr: parseFloat(getComputedStyle(r).getPropertyValue('--iq-esys-nr')), hr: parseFloat(getComputedStyle(r).getPropertyValue('--iq-esys-hr')), nodeW: r.querySelector('.iq-esys__node').getBoundingClientRect().width,
      anim: [...r.querySelectorAll('.iq-esys__fl')].map((f) => f.style.animationDuration).filter(Boolean)[0] || '', hub: r.querySelector('.iq-esys__house').childElementCount > 0 || r.querySelector('.iq-esys__house').dataset.photo === 'true' }; }, k);
  // ---- 1 · 2
  const a = await read('sys');
  const byType = Object.fromEntries(a.nodes.map((n) => [n[0], n]));
  check('1 · the house at the centre (1.8 kW from its own sensor), four nodes around it: solar 4.2 kW generating, grid 0.9 kW export, battery 1.5 kW charging at 64 %, heat pump',
    /1\.8 kW/.test(a.house) && a.hub && a.nodes.length === 4 && /4\.2 kW/.test(byType.solar[1]) && /Generating/.test(byType.solar[2]) && /900 W/.test(byType.grid[1]) && /Export/.test(byType.grid[2])
      && /1\.5 kW/.test(byType.battery[1]) && /Charging · 64%/.test(byType.battery[2]) && /650 W/.test(byType.heatpump[1]), JSON.stringify(a.nodes));
  check('2 · routes from the signed totals (kW and W mixed): solar → battery 1.5 kW and solar → grid 900 W drawn, no grid → battery; 100 % self-powered; the solar spoke flows to the house, the grid spoke is still (it only exports)',
    a.routes.some(([r]) => r === 'solar-battery') && a.routes.some(([r]) => r === 'solar-grid') && !a.routes.some(([r]) => r === 'grid-battery') && /100% self-powered/.test(a.self) && !a.note
      && a.sr.some((t) => /Solar to Battery: 1\.5 kW/.test(t)) && a.sr.some((t) => /Solar to Grid: 900 W/.test(t)) && a.spokes[0][0] === 'false' && a.spokes[0][1] === 'fwd' && a.spokes[1][0] === 'true',
    JSON.stringify({ routes: a.routes, self: a.self, note: a.note, sr: a.sr, spokes: a.spokes }));
  // ---- 3 · the algorithm on its own
  const alg = await E(() => {
    const R = window.MaisonEnergy.routesOf;
    const cases = { evening: R(0, 600, 1200, 1800), gridCharge: R(0, 3000, -2000, 1000), zero: R(0, 0, 0, 0), toGrid: R(0, -500, 2300, 1800), surplus: R(5000, -3000, -1500, 500) };
    const ok = Object.values(cases).every((r) => Object.values(r).every((v) => v >= 0 && Number.isFinite(v)));
    return { ok, ...cases };
  });
  check('3 · routes stay physical in every situation (never negative): evening battery 1 200 + grid 600 → house; grid charges the battery 2 000; zero → nothing; battery → grid 500; surplus solar split house / battery / grid',
    alg.ok && alg.evening.bh === 1200 && alg.evening.gh === 600 && alg.gridCharge.gb === 2000 && alg.gridCharge.gh === 1000 && Object.values(alg.zero).every((v) => v === 0) && alg.toGrid.bg === 500 && alg.toGrid.bh === 1800
      && alg.surplus.sh === 500 && alg.surplus.sb === 1500 && alg.surplus.sg === 3000, JSON.stringify(alg));
  // ---- 4
  const n4 = await read('na');
  check('4 · a missing grid reading: its node says "Not found" (dashed), no routes are drawn, and the card says why', n4.nodes.find((x) => x[0] === 'grid')[3] === 'missing' && /Not found/.test(n4.nodes.find((x) => x[0] === 'grid')[1]) && n4.routes.length === 0 && /Routes .* appear when/.test(n4.note), JSON.stringify(n4));
  // ---- 5
  const n5 = await read('off');
  check('5 · a house sensor that does not match the sources (480 W vs 1 800 W delivered): the difference is said, not hidden', /Readings differ by 1\.32 kW/.test(n5.note), n5.note);
  // ---- 6
  const n6 = await read('kwh');
  const today = n6.nodes.find((x) => x[0] === 'custom');
  const todaySpoke = await E(() => { const r = document.querySelector('[data-grid-id="kwh"] .iq-energy--sys'); const f = [...r.querySelectorAll('.iq-esys__fl:not(.iq-esys__rt)')][3]; return f.dataset.still; });
  check('6 · an energy reading (18.4 kWh) is shown as a value and never animated as a flow', /18\.4 kWh/.test(today[1]) && today[4] === 'true' && todaySpoke === 'true', JSON.stringify({ today, todaySpoke }));
  // ---- 7
  check('7a · style: line 5 px, glow 0.7, large nodes (bigger relative to the house, drawn at that size), fast animation (under 1 s), one decimal', a.lw === '5px' && a.glow === '0.7' && a.nr / a.hr > 0.55 && Math.abs(a.nodeW - 2 * a.nr) < 2 && parseFloat(a.anim) < 1 && /4\.2 kW/.test(byType.solar[1]), JSON.stringify({ lw: a.lw, glow: a.glow, nr: a.nr, hr: a.hr, nodeW: a.nodeW, anim: a.anim }));
  await p.goto(`${L.base}/editor.html?d=${id}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(800);
  const ch = await E(() => { const md = window.editor.getModel(); const c = md.pages[0].items[0].config; c.lineWidth = 2; c.spacing = 80; c.routes = false; c.lineWidth2 = 9; return window.editor.setModel(md); });
  const sv = await E(() => window.editor.save());
  await p.reload(); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(1500);
  const c7 = await E(() => window.editor.getModel().pages[0].items[0].config);
  const routes7 = await E(() => document.querySelector('[data-grid-id="sys"] .iq-energy--sys').energy.routes().length);
  const bad = await E(() => window.MaisonRegistry.fullConfig('energy', { variant: 'system', lineWidth: 40, glowLevel: -3, flowSpeed: 'warp', decimals: 7, spacing: 10 }));
  check('7b · changed settings saved and reloaded (thickness 2, spacing 80 %, routes off → none drawn); out-of-range values are dropped',
    ch.ok === false || (sv && c7.lineWidth === 2 && c7.spacing === 80 && c7.routes === false && routes7 === 0) ? (sv && c7.lineWidth === 2 && c7.spacing === 80 && c7.routes === false && routes7 === 0 && ['lineWidth', 'glowLevel', 'flowSpeed', 'decimals', 'spacing'].every((k) => bad[k] === undefined)) : false,
    JSON.stringify({ ch, sv, c7: { lineWidth: c7.lineWidth, spacing: c7.spacing, routes: c7.routes }, routes7, bad: ['lineWidth', 'glowLevel', 'flowSpeed', 'decimals', 'spacing'].map((k) => bad[k]) }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('energy-system test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
