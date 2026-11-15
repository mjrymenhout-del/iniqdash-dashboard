/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ENERGY FLOW — DYNAMIC NODES (presets Circles — Tesla-style — and Node cards). Real editor, real PHP server, FAKE Home Assistant
// (tests/lib/live.mjs — not a real Home Assistant).
//   the diagram is built from the nodes the user ADDED: Home + Solar + Grid → exactly three nodes (no battery / EV placeholder); add a
//   battery → four; two batteries → both; remove → gone · automatic layout: every node inside the widget, none touching, re-laid out on
//   add / remove and on resize; too small → a summary list · connectors (the shared IniqFlow) run from each node's edge to its target's
//   edge, re-routed with the layout · direction = the user's own "a positive value flows towards / away" (never a name): solar
//   generating → towards Home, battery charging (+) → away from Home, discharging (−) → towards it, grid export (−) → away; 0 → still;
//   unavailable → dashed and "Unavailable" · a node linked to another node (Solar → Inverter → Home) · a configuration from before nodes
//   (mapped roles) shows only its mapped roles · the old Flow / Compact presets unchanged · Configure: the Nodes collection, its item
//   editor's real preview; save + reload keep the list · nothing is ever sent to Home Assistant.
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  const P = (id, v, name, unit = 'W') => L.setEntity(id, String(v), { name, unit, dc: unit === '%' ? 'battery' : 'power' });
  P('sensor.home_power', 1800, 'Home power'); P('sensor.solar_power', 3600, 'Solar power'); P('sensor.grid_power', -1000, 'Grid power');
  P('sensor.battery_power', 800, 'Battery power'); P('sensor.battery_level', 72, 'Battery level', '%'); P('sensor.battery2_power', -300, 'Garage battery');
  P('sensor.inverter_power', 3400, 'Inverter'); P('sensor.heatpump_power', 950, 'Heat pump');
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1200 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const services = () => L.haCalls.filter((x) => x.method === 'POST' && /\/api\/services\//.test(x.url)).length;
  const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y, w: Math.min(w, 8), h }, mobile: { w: 4, h } });
  const SOLAR = { id: 'solar', type: 'solar', entity: 'sensor.solar_power' }, GRID = { id: 'grid', type: 'grid', entity: 'sensor.grid_power' };
  const BATT = { id: 'battery', type: 'battery', entity: 'sensor.battery_power', level: 'sensor.battery_level' };
  const setItems = (items) => E((items) => { const m = window.editor.getModel(); m.pages[0].items = items; const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join('; ')); }, items);
  const energy = (id, config, l) => ({ id, type: 'energy', parent: null, config: { name: 'Energy', entity: 'sensor.home_power', ...config }, layout: l });
  const st = (id) => E((id) => { const w = document.querySelector(`.ed-canvas [data-grid-id="${id}"] .iq-energy`); if (!w || !w.energy) return null;
    const box = w.getBoundingClientRect(), nodes = [...w.querySelectorAll('.iq-energy__n')].map((b) => { const r = b.getBoundingClientRect(); return { id: b.dataset.node, x: r.x - box.x, y: r.y - box.y, w: r.width, h: r.height }; });
    return { dyn: w.classList.contains('iq-energy--dyn'), variant: w.dataset.variant, arr: w.dataset.fitArr, box: { w: box.width, h: box.height }, nodes, state: w.energy.getState(),
      con: [...w.querySelectorAll('.iqf')].map((g) => ({ state: g.dataset.state, dir: g.dataset.dir })), geo: w.energy.geometry && w.energy.geometry() }; }, id);
  const ready = (id, n) => page.waitForFunction(({ id, n }) => { const w = document.querySelector(`.ed-canvas [data-grid-id="${id}"] .iq-energy`); return w && w.energy && w.querySelectorAll('.iq-energy__n').length === n && !/…/.test(w.textContent); }, { id, n }, { timeout: 15000 }).catch(() => {});
  /** no two nodes' boxes (disc + caption for circles) touch; every node inside the widget */
  const tidy = (s) => {
    const inside = s.nodes.every((b) => b.x >= -1 && b.y >= -1 && b.x + b.w <= s.box.w + 1 && b.y + b.h <= s.box.h + 1);
    let clear = true; for (let i = 0; i < s.nodes.length; i++) for (let j = i + 1; j < s.nodes.length; j++) { const A = s.nodes[i], C = s.nodes[j]; if (A.x < C.x + C.w && C.x < A.x + A.w && A.y < C.y + C.h && C.y < A.y + A.h) clear = false; }
    return inside && clear;
  };
  const n0 = services();

  // ---------------------------------------------------------------- only what is configured
  await setItems([energy('e1', { variant: 'circles', nodes: [SOLAR, GRID] }, lay(1, 1, 6, 6))]);
  await ready('e1', 3); await wait(500);
  let s = await st('e1');
  check('HOME + SOLAR + GRID: exactly three nodes (Home, Solar, Grid) — no battery or EV placeholder anywhere', s.dyn && JSON.stringify(s.nodes.map((n) => n.id).sort()) === JSON.stringify(['grid', 'home', 'solar'])
    && !(await E(() => /Battery|EV/.test(document.querySelector('.ed-canvas [data-grid-id="e1"] .iq-energy').textContent))), JSON.stringify(s.nodes.map((n) => n.id)));
  check('…laid out automatically: every node inside the widget, none touching (Circles preset)', tidy(s), JSON.stringify({ box: s.box, nodes: s.nodes }));
  check('…VALUES and DIRECTION from Home Assistant: Home 1,800 W; Solar 3,600 W generating → flows towards Home; Grid −1,000 W (positive = import) → Export, flowing away from Home',
    s.state.home.text === '1,800 W' && s.state.nodes.solar.text === '3,600 W' && s.state.nodes.solar.words === 'Generating' && s.state.nodes.solar.direction === 'forward'
      && s.state.nodes.grid.text === '1,000 W' && s.state.nodes.grid.words === 'Export' && s.state.nodes.grid.direction === 'reverse', JSON.stringify(s.state));
  { const g = s.geo, near = (p, b, tol = 6) => p[0] >= b.dx - tol && p[0] <= b.dx + b.dw + tol && p[1] >= b.dy - tol && p[1] <= b.dy + b.dh + tol;
    check('CONNECTORS follow the node geometry: each starts on its node\'s disc and ends on Home\'s disc (the shared IniqFlow)',
      ['solar', 'grid'].every((k) => near(g.connectors[k].start, g.at[k]) && near(g.connectors[k].end, g.home)) && s.con.length === 2, JSON.stringify({ c: g.connectors, at: g.at, home: g.home })); }
  if (SHOTS) await (await page.$('.ed-canvas [data-grid-id="e1"]')).screenshot({ path: path.join(SHOTS, 'energy-circles-3.png') });

  // ---------------------------------------------------------------- add / remove / multiple
  await setItems([energy('e1', { variant: 'circles', nodes: [SOLAR, GRID, BATT] }, lay(1, 1, 6, 6))]);
  await ready('e1', 4); await wait(500);
  s = await st('e1');
  check('ADD a battery: four nodes, re-laid out without touching; Battery +800 W (positive = charging, the type\'s default) → Charging, flowing AWAY from Home; its level 72 % as a ring',
    s.nodes.length === 4 && tidy(s) && s.state.nodes.battery.words === 'Charging' && s.state.nodes.battery.direction === 'reverse' && s.state.nodes.battery.level === 72, JSON.stringify(s.state.nodes.battery));
  if (SHOTS) await (await page.$('.ed-canvas [data-grid-id="e1"]')).screenshot({ path: path.join(SHOTS, 'energy-circles-4.png') });
  await setItems([energy('e1', { variant: 'circles', nodes: [SOLAR, GRID, BATT, { id: 'b2', type: 'battery', label: 'Garage battery', entity: 'sensor.battery2_power' }, { id: 'hp', type: 'heatpump', entity: 'sensor.heatpump_power' }] }, lay(1, 1, 7, 7))]);
  await ready('e1', 6); await wait(500);
  s = await st('e1');
  check('MULTIPLE nodes of a type: two batteries (the second −300 W → Discharging, towards Home) and a heat pump (Using) — six nodes, none touching',
    s.nodes.length === 6 && tidy(s) && s.state.nodes.b2.words === 'Discharging' && s.state.nodes.b2.direction === 'forward' && s.state.nodes.hp.words === 'Using', JSON.stringify(s.state.nodes));
  if (SHOTS) await (await page.$('.ed-canvas [data-grid-id="e1"]')).screenshot({ path: path.join(SHOTS, 'energy-circles-6.png') });
  await setItems([energy('e1', { variant: 'circles', nodes: [SOLAR, GRID] }, lay(1, 1, 7, 7))]);
  await ready('e1', 3); await wait(400);
  s = await st('e1');
  check('REMOVE: back to Home + Solar + Grid — the removed nodes and their connectors are gone', s.nodes.length === 3 && s.con.length === 2, JSON.stringify(s.nodes.map((n) => n.id)));

  // ---------------------------------------------------------------- live changes: direction, zero, unavailable
  await setItems([energy('e1', { variant: 'circles', nodes: [SOLAR, GRID, BATT] }, lay(1, 1, 6, 6))]);
  await ready('e1', 4); await wait(400);
  P('sensor.battery_power', -650, 'Battery power'); P('sensor.grid_power', 0, 'Grid power'); P('sensor.solar_power', 'unavailable', 'Solar power');
  await page.waitForFunction(() => { const w = document.querySelector('.ed-canvas [data-grid-id="e1"] .iq-energy'); const x = w && w.energy.getState().nodes; return x && x.battery.words === 'Discharging' && x.grid.flow === 'idle' && x.solar.na; }, null, { timeout: 20000 }).catch(() => {});
  s = await st('e1');
  const conBy = await E(() => Object.fromEntries([...document.querySelectorAll('.ed-canvas [data-grid-id="e1"] .iqf')].map((g, i) => [i, { state: g.dataset.state, dir: g.dataset.dir }])));
  check('LIVE: the battery turns to −650 W → Discharging, now flowing TOWARDS Home; the grid at 0 → Idle and still; the solar entity unavailable → "Unavailable", its connection dashed — nothing invented',
    s.state.nodes.battery.words === 'Discharging' && s.state.nodes.battery.direction === 'forward' && s.state.nodes.grid.flow === 'idle' && s.state.nodes.grid.words === 'Idle'
      && s.state.nodes.solar.na && s.state.nodes.solar.text === 'Unavailable' && s.state.nodes.solar.flow === 'unavailable' && Object.values(conBy).some((c) => c.state === 'unavailable'), JSON.stringify({ n: s.state.nodes, conBy }));
  P('sensor.solar_power', 3600, 'Solar power'); P('sensor.grid_power', -1000, 'Grid power'); P('sensor.battery_power', 800, 'Battery power');

  // ---------------------------------------------------------------- user-chosen direction semantics
  await setItems([energy('e1', { variant: 'circles', nodes: [SOLAR, { ...GRID, positive: 'away' }, { ...BATT, positive: 'toward' }] }, lay(1, 1, 6, 6))]);
  await ready('e1', 4); await page.waitForFunction(() => { const x = document.querySelector('.ed-canvas [data-grid-id="e1"] .iq-energy')?.energy?.getState().nodes; return x && x.grid && x.grid.text === '1,000 W'; }, null, { timeout: 15000 }).catch(() => {});
  s = await st('e1');
  check('THE USER DECIDES what a positive value means: grid "positive flows away" makes −1,000 W an IMPORT (towards Home); battery "positive flows towards" makes +800 W DISCHARGING',
    s.state.nodes.grid.words === 'Import' && s.state.nodes.grid.direction === 'forward' && s.state.nodes.battery.words === 'Discharging' && s.state.nodes.battery.direction === 'forward', JSON.stringify(s.state.nodes));

  // ---------------------------------------------------------------- node → node, cards, legacy derived, small box, old presets
  await setItems([
    energy('e1', { variant: 'circles', nodes: [{ ...SOLAR, link: 'inv' }, { id: 'inv', type: 'inverter', entity: 'sensor.inverter_power' }, GRID] }, lay(1, 1, 6, 6)),
    energy('e2', { variant: 'nodes', nodes: [SOLAR, GRID, BATT] }, lay(7, 1, 6, 5)),
    energy('e3', { variant: 'circles', mappings: { solar: 'sensor.solar_power', battery: 'sensor.battery_power', batteryLevel: 'sensor.battery_level' } }, lay(1, 7, 5, 5)),
    energy('e4', { variant: 'circles', nodes: [SOLAR, GRID, BATT] }, lay(7, 7, 2, 2)),
    energy('e5', { mappings: { solar: 'sensor.solar_power', grid: 'sensor.grid_power' } }, lay(9, 7, 4, 4)),
  ]);
  for (const [id, n] of [['e1', 4], ['e2', 4], ['e3', 3]]) await ready(id, n);
  await wait(800);
  const e1 = await st('e1'), e2 = await st('e2'), e3 = await st('e3'), e4 = await st('e4');
  { const g = e1.geo, near = (p, b, tol = 6) => p[0] >= b.dx - tol && p[0] <= b.dx + b.dw + tol && p[1] >= b.dy - tol && p[1] <= b.dy + b.dh + tol;
    check('NODE → NODE: Solar connects to the Inverter (its connector ends on the Inverter, not on Home), the Inverter to Home; laid out without touching',
      near(g.connectors.solar.end, g.at.inv) && !near(g.connectors.solar.end, g.home, 0) && near(g.connectors.inv.end, g.home) && tidy(e1), JSON.stringify(g.connectors)); }
  check('NODE CARDS preset: the same nodes as rounded cards, laid out without touching', e2.variant === 'nodes' && e2.nodes.length === 4 && tidy(e2), JSON.stringify(e2.nodes));
  check('A CONFIGURATION FROM BEFORE NODES (mapped Solar and Battery only), shown as Circles: exactly those — Home, Solar, Battery; no Grid, no EV',
    JSON.stringify(e3.nodes.map((n) => n.id).sort()) === JSON.stringify(['battery', 'home', 'solar']), JSON.stringify(e3.nodes.map((n) => n.id)));
  check('A 2 × 2 TILE: no squeezed diagram — the summary list (every node a readable row)', e4.arr === 'micro' && (await E(() => getComputedStyle(document.querySelector('.ed-canvas [data-grid-id="e4"] .iq-energy__list')).display)) === 'flex', JSON.stringify({ arr: e4.arr }));
  check('THE OLD FLOW PRESET unchanged: a configuration without a preset still draws the original diagram (not the dynamic one)', !(await E(() => document.querySelector('.ed-canvas [data-grid-id="e5"] .iq-energy').classList.contains('iq-energy--dyn'))));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'energy-presets.png') });

  // ---------------------------------------------------------------- MaisonFit: a resize re-lays out
  const sizes = [];
  for (const [w, h] of [[4, 4], [5, 5], [8, 6], [12, 8]]) {
    await setItems([energy('e1', { variant: 'circles', nodes: [SOLAR, GRID, BATT, { id: 'ev', type: 'ev' }] }, lay(1, 1, w, h))]);
    await ready('e1', 5); await wait(500);
    const x = await st('e1'); sizes.push({ w, h, arr: x.arr, tidy: x.arr === 'micro' || tidy(x) });
  }
  check('RESPONSIVE (MaisonFit, the widget\'s own box): 4 × 4 · 5 × 5 · 8 × 6 · 12 × 8 — each a tidy diagram or, when too small, the list', sizes.every((x) => x.tidy) && sizes.slice(1).every((x) => x.arr === 'diagram'), JSON.stringify(sizes));

  // ---------------------------------------------------------------- Configure: the Nodes collection + its real preview; save + reload
  await setItems([energy('e1', { variant: 'circles', nodes: [SOLAR, GRID] }, lay(1, 1, 6, 6))]);
  await ready('e1', 3); await wait(400);
  await E(() => window.editor.setEditing(true)); await wait(300);
  await page.click('.ed-canvas [data-grid-id="e1"]', { position: { x: 10, y: 10 }, force: true }); await wait(200);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ef'); await wait(500);
  await E(() => document.querySelectorAll('dialog[open] details.ef-group--acc').forEach((d) => { d.open = true; }));
  const rows = await E(() => [...document.querySelectorAll('dialog[open] [data-col="nodes"] .ef-col__row .ef-col__t')].map((t) => t.textContent));
  const presets = await E(() => [...document.querySelectorAll('dialog[open] .ef-field[data-key="variant"] option')].map((o) => o.textContent));
  check('CONFIGURE: presets Flow · Compact · Connected Circles · Tesla Style · Node cards · System · House; the Nodes section lists exactly the configured nodes (Solar, Grid)',
    JSON.stringify(presets) === JSON.stringify(['Flow', 'Compact', 'Connected Circles', 'Tesla Style', 'Node cards', 'System (house at the centre)', 'House']) && JSON.stringify(rows) === JSON.stringify(['Solar', 'Grid']), JSON.stringify({ presets, rows }));
  await E(() => document.querySelector('dialog[open] [data-col="nodes"] [data-k=col-add]').click()); await page.waitForSelector('dialog[open] [data-k=item-editor]'); await wait(400);
  const ED = 'dialog[open] [data-k=item-editor]';
  await page.selectOption(`${ED} .ef-field[data-key="type"] select`, 'battery'); await wait(300);
  await page.fill(`${ED} .ef-field[data-key="label"] input`, 'Powerwall'); await wait(400);
  const pv = await E((ED) => { const p = document.querySelector(`${ED} [data-k=item-preview]`); return { nodes: [...p.querySelectorAll('.iq-energy__n')].map((b) => b.dataset.node), text: p.textContent.includes('Powerwall') }; }, ED);
  check('ADD A NODE in Configure: the item editor\'s preview is the REAL widget and already shows the new battery ("Powerwall") among the nodes', pv.nodes.length === 4 && pv.text, JSON.stringify(pv));
  await page.click(`${ED} [data-k=sub-save]`); await wait(400);
  await page.click('dialog[open] .ecfg-foot button:has-text("Apply")').catch(async () => { await page.click('dialog[open] .ecfg-foot .ecfg-btn--primary'); }); await wait(600);
  await E(() => window.editor.setEditing(false));
  check('SAVE', await E(() => window.editor.save()));
  await page.reload(); await page.waitForFunction(() => window.editor); await wait(1500);
  const saved = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'e1').config);
  check('RELOAD: the node list kept (Solar, Grid, and the added battery "Powerwall" — its own id, no entity until one is chosen)',
    Array.isArray(saved.nodes) && saved.nodes.length === 3 && saved.nodes[2].type === 'battery' && saved.nodes[2].label === 'Powerwall' && !saved.nodes[2].entity, JSON.stringify(saved.nodes));
  check('NOTHING SENT to Home Assistant (display only)', services() === n0);
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
