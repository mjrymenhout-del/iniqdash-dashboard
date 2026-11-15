/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ENERGY CHARTS — the existing Chart widget with several series, Home Assistant's long-term statistics (hourly … yearly), a legend, a
// tooltip and signed values. Real editor, real PHP server (its HA WebSocket client — read-only), FAKE Home Assistant (tests/lib/live.mjs
// — REST history + a WebSocket recorder; not a real Home Assistant).
//   real-time: home + solar + grid power from the recorder history, each its colour; a history gap stays a gap; grid export below zero ·
//   statistics: daily import (consumption per day — HA's "change") and export drawn below zero; a day HA has no row for is NO bar (not 0) ·
//   W is never a kWh total: a power entity asked for "consumption" says so and draws nothing; automatic → its average ·
//   an entity without statistics says so · yearly = HA's monthly changes summed per year (gas, m³) · tooltip · Configure (series, data,
//   period) · save + reload · MaisonFit: a small chart is a sparkline · the server only asks HA's WebSocket API to read statistics.
import path from 'node:path';
import { live, liveBrowser, HISTORY, STATS } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  const P = (id, v, name, unit, dc = 'power') => L.setEntity(id, String(v), { name, unit, dc });
  P('sensor.home_power', 1800, 'Home power', 'W'); P('sensor.solar_power', 2600, 'Solar power', 'W'); P('sensor.grid_power', -800, 'Grid power', 'W');
  P('sensor.energy_import', 1234.5, 'Energy import', 'kWh', 'energy'); P('sensor.energy_export', 845.2, 'Energy export', 'kWh', 'energy');
  P('sensor.gas', 3210.4, 'Gas meter', 'm³', 'gas'); P('sensor.voltage_l1', 231, 'Voltage L1', 'V', 'voltage');
  const now = Date.now(), Hh = 3600000, D = 86400000;
  const iso = (t) => new Date(t).toISOString();
  // recorder history (24 h): home with a 2-hour unavailable gap; solar; grid negative in the afternoon (export)
  HISTORY['sensor.home_power'] = Array.from({ length: 24 }, (_, i) => [iso(now - (24 - i) * Hh), i === 10 || i === 11 ? 'unavailable' : 1500 + i * 20]);
  HISTORY['sensor.solar_power'] = Array.from({ length: 24 }, (_, i) => [iso(now - (24 - i) * Hh), Math.max(0, 3000 - Math.abs(i - 12) * 400)]);
  HISTORY['sensor.grid_power'] = Array.from({ length: 24 }, (_, i) => [iso(now - (24 - i) * Hh), 1500 - i * 120]);
  // long-term statistics: daily import (a missing day), export; hourly power mean; monthly gas over two calendar years
  const day0 = now - (now % D) - 10 * D;
  STATS['sensor.energy_import'] = { meta: { has_sum: true, has_mean: false, statistics_unit_of_measurement: 'kWh' }, rows: { day: [0, 1, 2, 4, 5, 6, 7, 8, 9].map((k) => ({ start: day0 + k * D, change: 8 + k })) } };
  STATS['sensor.energy_export'] = { meta: { has_sum: true, has_mean: false, statistics_unit_of_measurement: 'kWh' }, rows: { day: Array.from({ length: 10 }, (_, k) => ({ start: day0 + k * D, change: 3 + (k % 3) })) } };
  STATS['sensor.home_power'] = { meta: { has_sum: false, has_mean: true, statistics_unit_of_measurement: 'W' }, rows: { day: Array.from({ length: 10 }, (_, k) => ({ start: day0 + k * D, mean: 600 + k, min: 200, max: 3000 })) } };
  const y = new Date().getUTCFullYear();
  STATS['sensor.gas'] = { meta: { has_sum: true, has_mean: false, statistics_unit_of_measurement: 'm³' }, rows: { month: [...[9, 10, 11].map((m) => ({ start: Date.UTC(y - 1, m, 1), change: 50 })), ...[0, 1].map((m) => ({ start: Date.UTC(y, m, 1), change: 70 }))] } };
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1200 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const services = () => L.haCalls.filter((x) => x.method === 'POST' && /\/api\/services\//.test(x.url)).length;
  const lay = (x, yy, w, h) => ({ desktop: { x, y: yy, w, h }, tablet: { x: 1, y: yy, w: Math.min(w, 8), h }, mobile: { w: 4, h } });
  const setItems = (items) => E((items) => { const m = window.editor.getModel(); m.pages[0].items = items; const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join('; ')); }, items);
  const chart = (id, config, l) => ({ id, type: 'chart', parent: null, config: { kind: 'line', range: '24h', unit: '', ...config }, layout: l });   // unit '': as the entity picker leaves it
  const st = (id) => E((id) => { const w = document.querySelector(`.ed-canvas [data-grid-id="${id}"] .ch`); return w && w.chart ? { ...w.chart.getState(), legend: [...w.querySelectorAll('.ch__key')].map((k) => k.textContent),
    groups: w.querySelectorAll('.ch__data').length, bars: [...w.querySelectorAll('.ch__data')].map((g) => g.querySelectorAll('rect').length), zero: !!w.querySelector('.ch__zero'), arr: w.dataset.fitArr,
    strokes: [...w.querySelectorAll('.ch__data')].map((g) => getComputedStyle(g.querySelector('path, rect') || g).stroke || ''), msg: w.querySelector('.ch__msg').textContent } : null; }, id);
  const ready = (id, n) => page.waitForFunction(({ id, n }) => { const w = document.querySelector(`.ed-canvas [data-grid-id="${id}"] .ch`); const s = w && w.chart && w.chart.getState(); return s && s.status !== 'loading' && s.series.length === n && s.series.every((x) => x.points || x.error); }, { id, n }, { timeout: 20000 }).catch(() => {});
  const n0 = services();

  await setItems([
    chart('c1', { name: 'Power', entity: 'sensor.home_power', seriesLabel: 'Home', color: 'accent', traces: [{ id: 's1', entity: 'sensor.solar_power', label: 'Solar', color: 'solar' }, { id: 's2', entity: 'sensor.grid_power', label: 'Grid', color: 'info' }] }, lay(1, 1, 6, 5)),
    chart('c2', { name: 'Energy per day', entity: 'sensor.energy_import', kind: 'bar', source: 'statistics', period: 'day', seriesLabel: 'Import', color: 'info', traces: [{ id: 's1', entity: 'sensor.energy_export', label: 'Export', color: 'success', invert: true }] }, lay(7, 1, 6, 5)),
    chart('c3', { name: 'Power per day', entity: 'sensor.home_power', kind: 'bar', source: 'statistics', period: 'day', stat: 'change', traces: [{ id: 's1', entity: 'sensor.home_power', label: 'Average', stat: 'auto' }, { id: 's2', entity: 'sensor.voltage_l1', label: 'Voltage' }] }, lay(1, 6, 6, 5)),
    chart('c4', { name: 'Gas per year', entity: 'sensor.gas', kind: 'bar', source: 'statistics', period: 'year' }, lay(7, 6, 6, 5)),
    chart('c5', { name: 'Tiny', entity: 'sensor.home_power', traces: [{ id: 's1', entity: 'sensor.solar_power' }] }, lay(1, 11, 2, 2)),
  ]);
  for (const [id, n] of [['c1', 3], ['c2', 2], ['c3', 3], ['c4', 1], ['c5', 2]]) await ready(id, n);
  await wait(1200);
  const c1 = await st('c1'), c2 = await st('c2'), c3 = await st('c3'), c4 = await st('c4'), c5 = await st('c5');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'energy-charts.png') });

  check('REAL-TIME, SEVERAL SERIES: Home + Solar + Grid power from Home Assistant\'s recorder — three coloured series (their own colours), a legend with each name',
    c1.series.length === 3 && c1.groups === 3 && JSON.stringify(c1.series.map((x) => x.color)) === JSON.stringify(['accent', 'solar', 'info']) && c1.legend.length === 3 && /^Home/.test(c1.legend[0]) && /^Solar/.test(c1.legend[1]) && /^Grid/.test(c1.legend[2]),
    JSON.stringify({ s: c1.series.map((x) => [x.name, x.color, x.points]), legend: c1.legend }));
  check('…a history GAP stays a gap (the 2 unavailable hours are empty buckets, never joined or zeroed) and the signed grid (import + / export −) gets a zero line',
    c1.series[0].values.some((v) => v === null) && c1.series[0].values.filter((v) => v === 0).length === 0 && c1.series[2].values.some((v) => v !== null && v < 0) && c1.zero, JSON.stringify(c1.series[0].values.slice(0, 30)));
  check('STATISTICS, DAILY: Home Assistant\'s consumption per day (change) for import — 8, 9, 10, then NO bar for the day HA has no row for (not 0) — and export drawn below zero (presentation only)',
    c2.period === 'day' && JSON.stringify(c2.series[0].values) === JSON.stringify([8, 9, 10, 12, 13, 14, 15, 16, 17]) && c2.bars[0] === 9 && c2.series[1].values.every((v) => v < 0) && c2.zero && c2.series[0].unit === 'kWh',
    JSON.stringify(c2.series.map((x) => [x.values, x.unit])));
  check('W IS NEVER A kWh TOTAL: a power entity asked for "consumption per period" draws nothing and says it is not a total; on Automatic it shows its daily AVERAGE (W); an entity without statistics says so',
    /Not a total/.test(c3.series[0].error || '') && c3.series[0].points === 0 && !c3.series[1].error && c3.series[1].unit === 'W' && c3.series[1].values[0] === 600
      && /no long-term statistics/.test(c3.series[2].error || '') && c3.legend.some((l) => /Not a total/.test(l)), JSON.stringify(c3.series));
  check('YEARLY: Home Assistant keeps no yearly period — the year is the SUM of its own monthly changes (last year 3 × 50 = 150 m³, this year 2 × 70 = 140 m³)',
    JSON.stringify(c4.series[0].values) === JSON.stringify([150, 140]) && c4.series[0].unit === 'm³', JSON.stringify(c4.series[0]));
  if (process.env.DIAG) { console.log('C5', JSON.stringify(c5)); console.log('HIT', await E(() => { const p = document.querySelector('.ed-canvas [data-grid-id="c2"] .ch__plot'), r = p.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width * 0.2, r.y + r.height / 2); return e && (e.className.baseVal ?? e.className) + ' ' + e.tagName + ' ' + (e.closest('.ch__plot') ? 'inplot' : 'out'); }));
    console.log('C5G', c5.groups, c5.arr, c5.legend);
    console.log('MAN', await E(() => { const p = document.querySelector('.ed-canvas [data-grid-id="c2"] .ch__plot'), r = p.getBoundingClientRect(); p.dispatchEvent(new PointerEvent('pointermove', { clientX: r.x + r.width * 0.2, clientY: r.y + r.height / 2, bubbles: true }));
      const t = p.querySelector('.ch__tip'); return [t.hidden, t.textContent, p.clientWidth, r.width, getComputedStyle(p).pointerEvents]; })); }
  check('SMALL (2 × 2): a sparkline — no legend, no axes, still both series', c5.arr === 'mini' && c5.groups === 2 && (await E(() => getComputedStyle(document.querySelector('.ed-canvas [data-grid-id="c5"] .ch__legend')).display)) === 'none', JSON.stringify({ arr: c5.arr }));

  // tooltip
  const box = await (await page.$('.ed-canvas [data-grid-id="c2"] .ch__plot')).boundingBox();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2); await wait(200);
  const tip = await E(() => { const t = document.querySelector('.ed-canvas [data-grid-id="c2"] .ch__tip'); return { shown: !t.hidden, text: t.textContent }; });
  check('TOOLTIP: the bucket under the pointer — its date and BOTH series there (Import kWh, Export −kWh)', tip.shown && /Import: \d+ kWh/.test(tip.text) && /Export: −?-?\d+ kWh/.test(tip.text), JSON.stringify(tip));
  if (SHOTS) await (await page.$('.ed-canvas [data-grid-id="c2"]')).screenshot({ path: path.join(SHOTS, 'energy-chart-tooltip.png') });
  await page.mouse.move(5, 5);

  // the server asked Home Assistant's WebSocket API for nothing but authentication and recorder statistics (read-only)
  const ws = [...new Set(L.haCalls.filter((x) => x.method === 'WS').map((x) => x.url))].sort();
  check('READ-ONLY: over the WebSocket the server only authenticated and read recorder statistics (no other command); no service was called',
    JSON.stringify(ws) === JSON.stringify(['auth', 'recorder/get_statistics_metadata', 'recorder/statistics_during_period']) && services() === n0, JSON.stringify(ws));

  // Configure: data source, period, series — and persistence
  await E(() => window.editor.setEditing(true)); await wait(300);
  await page.click('.ed-canvas [data-grid-id="c2"]', { position: { x: 10, y: 10 }, force: true }); await wait(200);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ef'); await wait(500);
  await E(() => document.querySelectorAll('dialog[open] details.ef-group--acc').forEach((d) => { d.open = true; }));
  const cfg = await E(() => { const d = document.querySelector('dialog[open]'); const v = (k) => d.querySelector(`.ef-field[data-key="${k}"] select`)?.value;
    return { source: v('source'), period: v('period'), rows: [...d.querySelectorAll('[data-col="traces"] .ef-col__t')].map((t) => t.textContent), periods: [...d.querySelectorAll('.ef-field[data-key="period"] option')].map((o) => o.value) }; });
  check('CONFIGURE: Data = Long-term statistics, Period = Daily (Hourly · Daily · Weekly · Monthly · Yearly), the added series listed (Export)',
    cfg.source === 'statistics' && cfg.period === 'day' && JSON.stringify(cfg.periods) === JSON.stringify(['hour', 'day', 'week', 'month', 'year']) && JSON.stringify(cfg.rows) === JSON.stringify(['Export']), JSON.stringify(cfg));
  await page.selectOption('dialog[open] .ef-field[data-key="period"] select', 'week'); await wait(300);
  await page.click('dialog[open] .ecfg-foot button:has-text("Apply")').catch(async () => { await page.click('dialog[open] .ecfg-foot .ecfg-btn--primary'); }); await wait(600);
  await E(() => window.editor.setEditing(false));
  check('SAVE', await E(() => window.editor.save()));
  await page.reload(); await page.waitForFunction(() => window.editor); await wait(1500);
  const saved = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'c2').config);
  check('RELOAD: statistics, the new period (weekly), the series and its "below zero" kept', saved.source === 'statistics' && saved.period === 'week' && saved.traces.length === 1 && saved.traces[0].invert === true && saved.traces[0].entity === 'sensor.energy_export', JSON.stringify(saved));
  // an old chart configuration (one entity, no series) still draws exactly one series, no legend
  await setItems([chart('old', { name: 'Old', entity: 'sensor.home_power' }, lay(1, 1, 6, 5))]);
  await ready('old', 1); await wait(600);
  const old = await st('old');
  check('AN OLD CHART (one entity, nothing new configured): one series, no legend, recent history — as before', old.series.length === 1 && old.legend.length === 0 && !old.period, JSON.stringify(old));
  // INFORMATION TILES: the existing generic Gauge (one numeric value — any unit) is the smart-meter tile: signed grid power, a gas total,
  // a phase voltage — each just a configuration, no widget per measurement and no tariff names built in
  const gauge = (id, entity, name, extra, l) => ({ id, type: 'gauge', parent: null, config: { name, entity, unit: '', style: 'arc', showValue: true, showUnit: true, showMinMax: true, thresholds: 'none', ...extra }, layout: l });
  await setItems([gauge('g1', 'sensor.grid_power', 'Grid', { min: -5000, max: 5000 }, lay(1, 1, 3, 4)), gauge('g2', 'sensor.gas', 'Gas total', { style: 'value' }, lay(4, 1, 3, 4)),
    gauge('g3', 'sensor.voltage_l1', 'L1', { style: 'hbar', min: 200, max: 260 }, lay(7, 1, 3, 4))]);
  await page.waitForFunction(() => ['g1', 'g2', 'g3'].every((id) => /\d/.test(document.querySelector(`.ed-canvas [data-grid-id="${id}"] .gg`)?.textContent || '')), null, { timeout: 15000 }).catch(() => {});
  await wait(500);
  const tiles = await E(() => ['g1', 'g2', 'g3'].map((id) => document.querySelector(`.ed-canvas [data-grid-id="${id}"] .gg`).textContent.replace(/\s+/g, ' ').trim()));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'energy-tiles.png'), clip: { x: 200, y: 330, width: 1200, height: 400 } });
  check('INFORMATION TILES (the existing generic Gauge): signed grid power −800 W on a −5,000 … 5,000 W arc, the gas meter 3,210.4 m³, phase voltage 231 V on a bar — each HA\'s value and unit',
    /-800|−800/.test(tiles[0]) && /W/.test(tiles[0]) && /3,210\.4/.test(tiles[1]) && /m³/.test(tiles[1]) && /231/.test(tiles[2]) && /V/.test(tiles[2]), JSON.stringify(tiles));
  // the statistics endpoint: only for a signed-in session; strict input; the token never leaves the server
  { const anon = L.client(); const r0 = await anon.send('GET', '/api/ha_statistics.php?entities=sensor.energy_import&period=day');
    const c = L.client(); await c.login();
    const bad = await c.send('GET', '/api/ha_statistics.php?entities=sensor.energy_import&period=decade');
    const many = await c.send('GET', `/api/ha_statistics.php?entities=${Array.from({ length: 11 }, (_, i) => `sensor.x${i}`).join(',')}&period=day`);
    const ok = await c.send('GET', '/api/ha_statistics.php?entities=sensor.energy_import&period=day'); const body = await ok.text();
    check('STATISTICS ENDPOINT: refused without a session; an unknown period and more than 10 entities are refused (400); the answer never carries the Home Assistant token',
      [401, 302, 303].includes(r0.status) && bad.status === 400 && many.status === 400 && ok.status === 200 && !body.includes('fake-token') && JSON.parse(body).ok === true, JSON.stringify([r0.status, bad.status, many.status, ok.status])); }
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
