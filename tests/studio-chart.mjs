/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO — the CHART element, driven through the VISIBLE UI only: bars with per-bar colours, the highest bar highlighted with a
// tooltip and an underline, coloured labels and a dashed grid (reference A's energy chart); outlined capsules with one filled (reference
// C's analysis chart); a smooth glowing area with a marker (reference B's electricity line); then bound to a widget property: the
// entity's LONG-TERM STATISTICS (a FAKE Home Assistant: tests/lib/live.mjs) replace the preview bars; tapping a bar highlights it;
// save → the dashboard renderer draws the same.
import { live, liveBrowser, ENTITIES, STATS } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

// a meter with daily statistics: the last 7 days' change (kWh)
const DAY = 86400000, today = new Date(); today.setHours(0, 0, 0, 0);
const CHANGES = [4.2, 6.8, 5.1, 9.6, 7.3, 3.9, 8.4];
Object.assign(ENTITIES, { 'sensor.house_energy': ['1520.4', { name: 'House energy', unit: 'kWh', dc: 'energy' }] });
STATS['sensor.house_energy'] = { meta: { has_sum: true, has_mean: false, statistics_unit_of_measurement: 'kWh' },
  rows: { day: CHANGES.map((c, i) => ({ start: today.getTime() - (CHANGES.length - 1 - i) * DAY, change: c, sum: 1500 + i * 3, mean: null, min: null, max: null })) } };

let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(900);
  const S = 'dialog.wst[open]', P = `${S} .wst__props`, F = (k) => `${P} .ef-field[data-key="${k}"]`;
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const state = () => E((S) => document.querySelector(S).studio.state(), S);
  const wait = (ms = 250) => page.waitForTimeout(ms);
  const num = async (k, v) => { await page.fill(`${P} [data-k=${k}]`, String(v)); await page.press(`${P} [data-k=${k}]`, 'Tab'); await wait(250); };
  const rng = async (k, v, root = P) => { await page.fill(`${root} .ef-field[data-key="${k}"] input.ef-range__n`, String(v)); await page.press(`${root} .ef-field[data-key="${k}"] input.ef-range__n`, 'Enter'); await wait(250); };
  const sel = async (k, v) => { await page.selectOption(`${F(k)} select`, v); await wait(300); };
  const sw = async (k) => { await page.click(`${F(k)} button[role=switch]`); await wait(250); };
  const ED = '[data-k=item-editor][open]';
  const addItem = async (col, fill) => { await page.click(`${P} [data-col="${col}"] [data-k=col-add]`); await page.waitForSelector(ED, { timeout: 8000 }); await fill(); await page.click(`${ED} [data-k=sub-save]`); await wait(300); };
  const svgOf = (id) => E(({ S, id }) => { const r = document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"] .iqch`); if (!r) return null;
    const q = (c) => [...r.querySelectorAll(c)];
    return { src: r.dataset.source, kind: r.dataset.kind, bars: q('.iqch__bar').map((b) => ({ fill: b.getAttribute('fill'), op: b.getAttribute('fill-opacity'), stroke: b.getAttribute('stroke'), h: +b.getAttribute('height') })),
      fills: q('.iqch__fill').length, xl: q('.iqch__xl').map((t) => ({ t: t.textContent, fill: t.getAttribute('fill'), w: t.getAttribute('font-weight') })), grid: q('.iqch__grid').map((g) => g.getAttribute('stroke-dasharray')),
      tip: (r.querySelector('.iqch__tip text') || {}).textContent || null, ul: q('.iqch__ul').length, line: (r.querySelector('.iqch__line') || { getAttribute: () => '' }).getAttribute('d'),
      lineFilter: (r.querySelector('.iqch__line') || { style: {} }).style.filter || '', area: q('.iqch__area').length, marker: q('.iqch__marker').length }; }, { S, id });

  await E(() => window.IniqStudioLibrary.createCollection('Charts'));
  await E(() => window.editor.setEditing(true)); await wait(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S);
  await page.click(`${S} [data-k=wst-new-empty]`); await wait(300);
  await num('wst-canvas-w', 420); await num('wst-canvas-h', 260);

  // ---- BARS (reference A): per-bar colours, the highest highlighted with a tooltip + underline, coloured labels, a dashed grid
  await page.click(`${S} [data-k=wst-add][data-type=chart]`); await wait(300);
  const ch = (await state()).sel;
  await num('wst-x', 10); await num('wst-y', 10); await num('wst-w', 400); await num('wst-h', 220);
  let g = await svgOf(ch);
  check('CHART from the Toolbox: five PREVIEW bars (design data) until a property gives real data', g && g.src === 'preview' && g.kind === 'bar' && g.bars.length === 5, JSON.stringify(g));
  for (const tok of ['warning', 'danger', 'purple', 'info', 'success']) await addItem('colors', async () => { await page.click(`${ED} .ef-field[data-key="color"] .ef-icon[data-value="${tok}"]`); await wait(120); });
  await rng('barWidth', 40); await rng('barRadius', 10);
  await sel('highlight', 'max'); await sw('tooltip'); await page.fill(`${F('unit')} input`, 'kWh'); await page.press(`${F('unit')} input`, 'Tab'); await wait(250); await sw('underline');
  await rng('grid', 4); await sw('gridDash'); await sw('labelsColoured');
  g = await svgOf(ch);
  check('PER-BAR COLOURS (five, added in the colour list) and LABELS in their bar\'s colour', ['warning', 'danger', 'purple', 'info', 'success'].every((t, i) => g.bars[i].fill.includes(t) && g.xl[i].fill.includes(t)), JSON.stringify(g.bars.map((b) => b.fill)));
  check('HIGHLIGHT the highest (Thu 22): a tooltip "22 kWh", its label bold and underlined; a dashed grid of 4 + 1 lines', g.tip === '22 kWh' && g.xl[3].w === '700' && g.ul === 1 && g.grid.length === 5 && g.grid.every((d) => d === '3 4'), JSON.stringify({ tip: g.tip, xl: g.xl[3], grid: g.grid }));

  // ---- CAPSULES (reference C): outlined, the highlighted one filled
  await sw('capsule'); await sel('barStyle', 'outline'); await sel('highlight', 'index'); await rng('highlightIndex', 3);
  g = await svgOf(ch);
  const full = g.bars.every((b) => Math.abs(b.h - g.bars[0].h) < 0.01);
  check('CAPSULES, OUTLINED: five full-height tracks, outlined; the chosen third one filled', full && g.bars.filter((b, i) => i !== 2).every((b) => !!b.stroke) && !g.bars[2].stroke && g.bars[2].fill.includes('purple'), JSON.stringify(g.bars));

  // ---- SMOOTH AREA with glow and a marker (reference B)
  await sel('kind', 'area'); await sw('smooth'); await rng('glow', 8); await sel('marker', 'last'); await rng('areaOpacity', 55);
  g = await svgOf(ch);
  check('AREA: a smooth curve (Bézier), a gradient area under it, a glow, a marker on the last point', g.kind === 'area' && /C/.test(g.line) && g.area === 1 && /drop-shadow/.test(g.lineFilter) && g.marker === 1, JSON.stringify({ line: g.line.slice(0, 40), f: g.lineFilter }));
  await sel('kind', 'bar'); await sw('capsule'); await sel('barStyle', 'filled');

  // ---- DATA: + New property (a sensor's State) → its preview entity → the chart shows that entity's daily statistics
  await rng('count', 7);
  await sel('binding.property', '+new');
  await page.fill(`${P} [data-k=wst-pe-name]`, 'Energy'); await page.selectOption(`${P} [data-k=wst-pe-family]`, 'sensor'); await wait(100);
  await page.fill(`${P} [data-k=wst-pe-sname]`, 'Meter'); await page.selectOption(`${P} [data-k=wst-pe-value]`, { label: 'State' }); await page.click(`${P} [data-k=wst-pe-save]`); await wait(400);
  await E((S) => document.querySelector(S).studio.select(null), S); await wait(200);
  await page.click(`${P} [data-k=wst-prop][data-prop="Energy"] [data-k=wst-propedit]`); await wait(250);
  const root = `${P} [data-k=wst-peditor]`;
  await page.click(`${root} [data-k=iqp-choose]`); await wait(250); await page.fill(`${root} .iqp__search`, 'sensor.house_energy'); await wait(250);
  await page.click(`${root} .iqp__item[data-entity="sensor.house_energy"]`); await wait(400); await page.click(`${root} [data-k=wst-pe-save]`); await wait(400);
  let live1 = false;
  try { await page.waitForFunction(({ S, id }) => { const r = document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"] .iqch`); return r && r.dataset.source === 'live'; }, { S, id: ch }, { timeout: 15000 }); live1 = true; } catch (e) { live1 = false; }
  g = await svgOf(ch);
  const hs = g.bars.map((b) => b.h);
  check('HOME ASSISTANT STATISTICS: bound to "Energy" (sensor.house_energy), the chart draws its 7 daily changes (kWh per day) — tallest on day 4',
    live1 && g.bars.length === 7 && hs.indexOf(Math.max(...hs)) === 3 && g.xl.length === 7, JSON.stringify({ src: g.src, n: g.bars.length, hs }));

  // ---- SELECTABLE: tap a bar → it is highlighted (tooltip with its value)
  await E((a) => document.querySelector(a.S).studio.select(a.id), { S, id: ch }); await wait(200);
  await sel('highlight', 'none'); await sw('selectable');
  await E(({ S, id }) => document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"] .iqch__hit[data-i="1"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })), { S, id: ch }); await wait(200);
  g = await svgOf(ch);
  check('TAP a bar (Selectable): the second day is highlighted, its tooltip shows 6.8 kWh', g.tip === '6.8 kWh' && g.xl[1].w === '700', JSON.stringify({ tip: g.tip }));

  // ---- SAVE → the dashboard renderer (a placed copy with its own entity) draws the same statistics
  await page.fill(`${S} [data-k=wst-name]`, 'Energy chart'); await page.click(`${S} [data-k=wst-save]`); await wait(1500);
  const st = await state(), savedId = st.defId;
  check('SAVE: accepted by the server', !!savedId && !st.dirty, String(savedId));
  const slot = st.def.slots[0].id;
  await page.click(`${S} [data-k=wst-close]`); await wait(300);
  const dash = await E(async ({ id, slot }) => { const w = window.MaisonStudioWidget.create({ definition: id, entities: { [slot]: 'sensor.house_energy' } }); w.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:260px'; document.body.append(w);
    for (let i = 0; i < 60; i++) { const r = w.querySelector('.iqch'); if (r && r.dataset.source === 'live') break; await new Promise((ok) => setTimeout(ok, 150)); }
    const r = w.querySelector('.iqch'), out = { src: r && r.dataset.source, bars: r ? r.querySelectorAll('.iqch__bar').length : 0 }; w.remove(); return out; }, { id: savedId, slot });
  check('DASHBOARD (a placed copy, its own entity): the same 7 bars from Home Assistant\'s statistics', dash.src === 'live' && dash.bars === 7, JSON.stringify(dash));
  check('no page error', B.errors.length === 0, B.errors.slice(0, 3).join(' | '));
} catch (e) {
  check('studio-chart test ran', false, e.stack);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
