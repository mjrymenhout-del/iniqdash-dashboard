/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ENERGY FLOW — TESLA STYLE vs CONNECTED CIRCLES. Real editor, real PHP server, FAKE Home Assistant (tests/lib/live.mjs — not a real one).
//   two presets of ONE engine (the same nodes, bindings, direction rules, IniqFlow connectors): Connected Circles (id 'circles', the
//   approved design, unchanged) and Tesla Style (id 'tesla': the structured grid of the reference — large thin-outlined circles, dark
//   inside, names above / below, thin coloured right-angle connections with sparse moving dots) · built from the configured nodes only
//   (3 → 3, 4 → 4, 7 → 7; no placeholder) · no circle touches another, no connection runs through a circle · direction / 0 / unavailable ·
//   compact sizes · switching presets in Configure keeps every node and binding · save + reload · nothing sent to Home Assistant.
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  const P = (id, v, name, unit = 'W', dc = 'power') => L.setEntity(id, String(v), { name, unit, dc });
  P('sensor.home_power', 1800, 'Home power'); P('sensor.solar_power', 3600, 'Solar power'); P('sensor.grid_power', -1000, 'Grid power');
  P('sensor.battery_power', 800, 'Battery power'); P('sensor.battery_level', 72, 'Battery level', '%', 'battery'); P('sensor.ev_power', 7400, 'EV power');
  P('sensor.gas_flow', 0.42, 'Gas', 'm³/h', 'gas'); P('sensor.water_flow', 6.5, 'Water', 'L/min', 'water'); P('sensor.co2', 612, 'CO2', 'ppm', 'carbon_dioxide');
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1300 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const services = () => L.haCalls.filter((x) => x.method === 'POST' && /\/api\/services\//.test(x.url)).length;
  const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y, w: Math.min(w, 8), h }, mobile: { w: 4, h } });
  const setItems = (items) => E((items) => { const m = window.editor.getModel(); m.pages[0].items = items; const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join('; ')); }, items);
  const energy = (id, config, l) => ({ id, type: 'energy', parent: null, config: { name: 'Energy distribution', entity: 'sensor.home_power', ...config }, layout: l });
  const S = { id: 'solar', type: 'solar', entity: 'sensor.solar_power' }, G = { id: 'grid', type: 'grid', entity: 'sensor.grid_power' };
  const BA = { id: 'battery', type: 'battery', entity: 'sensor.battery_power', level: 'sensor.battery_level' };
  const SEVEN = [S, G, BA, { id: 'ev', type: 'ev', entity: 'sensor.ev_power' }, { id: 'gas', type: 'gas', entity: 'sensor.gas_flow' }, { id: 'water', type: 'water', entity: 'sensor.water_flow' },
    { id: 'co2', type: 'co2', label: 'Low-carbon', entity: 'sensor.co2' }];
  const ready = (id, n) => page.waitForFunction(({ id, n }) => { const w = document.querySelector(`.ed-canvas [data-grid-id="${id}"] .iq-energy`); return w && w.energy && w.querySelectorAll('.iq-energy__n').length === n && !/…/.test(w.textContent); }, { id, n }, { timeout: 15000 }).catch(() => {});
  /** the drawn diagram: discs (relative to the widget), captions, connectors (sampled), styles */
  const st = (id) => E((id) => {
    const w = document.querySelector(`.ed-canvas [data-grid-id="${id}"] .iq-energy`); if (!w) return null;
    const box = w.getBoundingClientRect();
    const discs = [...w.querySelectorAll('.iq-energy__n')].map((b) => { const r = b.getBoundingClientRect(); return { id: b.dataset.node, cx: r.x - box.x + r.width / 2, cy: r.y - box.y + r.height / 2, r: r.width / 2, cap: b.dataset.cap || '', outline: getComputedStyle(b).boxShadow, bg: getComputedStyle(b).backgroundImage, ring: !!b.querySelector('.iqv-ring') }; });
    const svg = w.querySelector('.iq-energy__lines'), sc = svg.getBoundingClientRect().width / (svg.viewBox.baseVal.width || 1);
    const con = [...w.querySelectorAll('.iqf')].map((g) => { const p = g.querySelector('.iqf__track'), n = p.getTotalLength(), pts = [];
      for (let i = 0; i <= 60; i++) { const q = p.getPointAtLength((n * i) / 60); pts.push([q.x * sc, q.y * sc]); }
      return { state: g.dataset.state, dir: g.dataset.dir, anim: g.dataset.anim, width: getComputedStyle(p).strokeWidth, d: p.getAttribute('d'), pts }; });
    return { variant: w.dataset.variant, arr: w.dataset.fitArr, box: { w: box.width, h: box.height }, discs, con, state: w.energy.getState(), text: w.textContent };
  }, id);
  const tidy = (s) => s.discs.every((a, i) => s.discs.every((b, j) => i >= j || Math.hypot(a.cx - b.cx, a.cy - b.cy) > a.r + b.r + 4))
    && s.discs.every((d) => d.cx - d.r >= -1 && d.cy - d.r >= -1 && d.cx + d.r <= s.box.w + 1 && d.cy + d.r <= s.box.h + 1);
  /** no connection passes through a circle other than its own two ends */
  const clearLines = (s) => s.con.every((c) => { const a = c.pts[0], z = c.pts[c.pts.length - 1];
    const ends = s.discs.filter((d) => [a, z].some((p) => Math.hypot(p[0] - d.cx, p[1] - d.cy) <= d.r + 6));
    return c.pts.slice(3, -3).every((p) => s.discs.every((d) => ends.includes(d) || Math.hypot(p[0] - d.cx, p[1] - d.cy) > d.r - 2)); });
  const n0 = services();

  // ---------------------------------------------------------------- Tesla Style: 3 · 4 · 7 nodes, compact, list
  await setItems([energy('t3', { variant: 'tesla', nodes: [S, G] }, lay(1, 1, 4, 5)), energy('t4', { variant: 'tesla', nodes: [S, G, BA] }, lay(5, 1, 4, 7)),
    energy('t7', { variant: 'tesla', nodes: SEVEN }, lay(9, 1, 4, 7)), energy('tc', { variant: 'tesla', nodes: [S, G, BA] }, lay(1, 8, 3, 6)), energy('tl', { variant: 'tesla', nodes: [S, G, BA] }, lay(4, 8, 3, 4)),
    energy('cc', { variant: 'circles', nodes: [S, G, BA] }, lay(6, 8, 4, 5))]);
  for (const [id, n] of [['t3', 3], ['t4', 4], ['t7', 8], ['tc', 4], ['cc', 4]]) await ready(id, n);
  await wait(900);
  const t3 = await st('t3'), t4 = await st('t4'), t7 = await st('t7'), tc = await st('tc'), tl = await st('tl'), cc = await st('cc');
  if (SHOTS) for (const id of ['t3', 't4', 't7', 'tc', 'tl', 'cc']) await (await page.$(`.ed-canvas [data-grid-id="${id}"]`)).screenshot({ path: path.join(SHOTS, `energy-${id}.png`) });
  const D = (s, id) => s.discs.find((d) => d.id === id);
  check('TESLA STYLE, Home + Solar + Grid: exactly three circles — Solar above, Grid on the left, Home on the right of the same row (the reference\'s structure); no placeholder',
    t3.variant === 'tesla' && t3.discs.length === 3 && D(t3, 'solar').cy < D(t3, 'grid').cy - 20 && D(t3, 'grid').cx < D(t3, 'solar').cx && D(t3, 'home').cx > D(t3, 'solar').cx
      && Math.abs(D(t3, 'grid').cy - D(t3, 'home').cy) < 2 && !/Battery|EV|Gas|Water/.test(t3.text), JSON.stringify(t3.discs));
  check('…+ Battery: four circles, the battery BELOW, Solar\'s name above its circle, the others\' below; Home the largest circle',
    t4.discs.length === 4 && D(t4, 'battery').cy > D(t4, 'home').cy + 20 && D(t4, 'solar').cap === 'above' && D(t4, 'grid').cap === 'below' && D(t4, 'battery').cap === 'below'
      && t4.discs.every((d) => d.id === 'home' || d.r <= D(t4, 'home').r), JSON.stringify(t4.discs));
  check('…SEVEN NODES (solar, grid, battery, EV, gas, water, low-carbon): all eight circles, gas straight above Home and water straight below it, EV right of Home',
    t7.discs.length === 8 && Math.abs(D(t7, 'gas').cx - D(t7, 'home').cx) < 2 && D(t7, 'gas').cy < D(t7, 'home').cy && Math.abs(D(t7, 'water').cx - D(t7, 'home').cx) < 2 && D(t7, 'water').cy > D(t7, 'home').cy
      && D(t7, 'ev').cx > D(t7, 'home').cx, JSON.stringify(t7.discs.map((d) => [d.id, Math.round(d.cx), Math.round(d.cy)])));
  check('NO OVERLAP and NO CONNECTION THROUGH A CIRCLE (3 · 4 · 7 nodes and the compact 3 × 6 tile): every circle inside the widget, apart, every line from its node to its target only',
    [t3, t4, t7, tc].every((s) => tidy(s) && clearLines(s)), JSON.stringify([t3, t4, t7, tc].map((s) => [tidy(s), clearLines(s)])));
  check('THE LOOK: thin coloured outlines (2 px) on a dark plain interior; thin lines (1.6 px) with moving dots; the battery level written in the circle (no thick ring)',
    t4.discs.every((d) => /2px/.test(d.outline) && d.bg === 'none' && !d.ring) && t4.con.every((c) => c.width === '1.6px' && c.anim === 'dots') && /Charging · 72%/.test(t4.text), JSON.stringify({ d: t4.discs.map((d) => [d.outline, d.bg, d.ring]), c: t4.con.map((c) => c.width) }));
  check('CONNECTED CIRCLES stays its own design (its glowing discs, the battery ring, 2.4 px soft lines) — the two presets are immediately different',
    cc.variant === 'circles' && cc.discs.some((d) => d.ring) && cc.con.every((c) => c.width === '2.4px') && D(cc, 'home').bg !== 'none' && cc.discs.every((d) => !d.cap), JSON.stringify(cc.discs.map((d) => [d.id, d.bg.slice(0, 30), d.ring])));
  check('DIRECTIONS (the same rules): solar generating flows towards Home, grid −1,000 W exports (away), battery +800 W charges (away)',
    t4.state.nodes.solar.direction === 'forward' && t4.state.nodes.grid.direction === 'reverse' && t4.state.nodes.grid.words === 'Export' && t4.state.nodes.battery.words === 'Charging', JSON.stringify(t4.state.nodes));
  check('COMPACT: a narrow 3 × 6 tile still draws the diagram (a 3 × 4 tile is too low for three rows: the list); a 3 × 4 tile the summary list', tc.arr === 'diagram' && tl.arr === 'micro', JSON.stringify([tc.arr, tl.arr]));
  // live: zero and unavailable
  P('sensor.grid_power', 0, 'Grid power'); P('sensor.solar_power', 'unavailable', 'Solar power');
  await page.waitForFunction(() => { const x = document.querySelector('.ed-canvas [data-grid-id="t4"] .iq-energy')?.energy?.getState().nodes; return x && x.grid.flow === 'idle' && x.solar.na; }, null, { timeout: 20000 }).catch(() => {});
  const z = await st('t4');
  check('ZERO and UNAVAILABLE: the grid at 0 is still (Idle); the solar entity unavailable says so and its line is dashed — nothing invented',
    z.state.nodes.grid.flow === 'idle' && z.state.nodes.solar.text === 'Unavailable' && z.con.some((c) => c.state === 'unavailable') && z.con.some((c) => c.state === 'idle'), JSON.stringify(z.state.nodes));
  P('sensor.grid_power', -1000, 'Grid power'); P('sensor.solar_power', 3600, 'Solar power');

  // ---------------------------------------------------------------- Configure: both presets; switching keeps every node; save + reload
  await setItems([energy('e1', { variant: 'circles', nodes: [S, G, BA] }, lay(1, 1, 5, 6))]);
  await ready('e1', 4); await wait(400);
  await E(() => window.editor.setEditing(true)); await wait(300);
  await page.click('.ed-canvas [data-grid-id="e1"]', { position: { x: 10, y: 10 }, force: true }); await wait(200);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ef'); await wait(500);
  const opts = await E(() => [...document.querySelectorAll('dialog[open] .ef-field[data-key="variant"] option')].map((o) => [o.value, o.textContent]));
  check('CONFIGURE lists both presets by name, each with its persisted id: Connected Circles = "circles" (unchanged id), Tesla Style = "tesla"',
    opts.some(([v, l]) => v === 'circles' && l === 'Connected Circles') && opts.some(([v, l]) => v === 'tesla' && l === 'Tesla Style'), JSON.stringify(opts));
  await E(() => document.querySelectorAll('dialog[open] details.ef-group--acc').forEach((d) => { d.open = true; })); await wait(200);
  await page.selectOption('dialog[open] .ef-field[data-key="variant"] select', 'tesla'); await wait(700);
  const pv = await E(() => { const p = document.querySelector('dialog[open] .ecfg-pv .iq-energy'); return p ? { variant: p.dataset.variant, nodes: [...p.querySelectorAll('.iq-energy__n')].map((b) => b.dataset.node) } : null; });
  check('…the LIVE PREVIEW draws the chosen preset (Tesla Style) with the same nodes', pv && pv.variant === 'tesla' && JSON.stringify(pv.nodes.sort()) === JSON.stringify(['battery', 'grid', 'home', 'solar']), JSON.stringify(pv));
  await page.click('dialog[open] .ecfg-foot button:has-text("Apply")').catch(async () => { await page.click('dialog[open] .ecfg-foot .ecfg-btn--primary'); }); await wait(600);
  await E(() => window.editor.setEditing(false));
  check('SAVE', await E(() => window.editor.save()));
  await page.reload(); await page.waitForFunction(() => window.editor); await wait(1500);
  const saved = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'e1').config);
  check('SWITCHING PRESETS KEPT EVERYTHING: variant "tesla", the same three nodes with the same entities and level, the Home entity', saved.variant === 'tesla' && saved.entity === 'sensor.home_power'
    && JSON.stringify(saved.nodes) === JSON.stringify([S, G, BA]), JSON.stringify(saved));
  await ready('e1', 4); await wait(500);
  check('RELOAD: the dashboard draws Tesla Style from the saved configuration', (await st('e1')).variant === 'tesla');
  check('NOTHING SENT to Home Assistant', services() === n0);
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
