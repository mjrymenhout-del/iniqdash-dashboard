/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO — the DIAL's new parts, driven through the VISIBLE UI only: two arc segments with gradients and glow (reference A's
// thermostat), scale labels outside the ring, more markers (a knob at the value with an icon, a knob at a fixed value), a DOTTED track
// coloured along the scale with larger end dots (reference C's air-conditioning ring); save → reopen; the dashboard renderer draws it.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

let L, B;
try {
  L = await live({ configureHa: false });
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  const S = 'dialog.wst[open]', P = `${S} .wst__props`, F = (k) => `${P} .ef-field[data-key="${k}"]`;
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const state = () => E((S) => document.querySelector(S).studio.state(), S);
  const wait = (ms = 250) => page.waitForTimeout(ms);
  const num = async (k, v) => { await page.fill(`${P} [data-k=${k}]`, String(v)); await page.press(`${P} [data-k=${k}]`, 'Tab'); await wait(250); };
  const rng = async (k, v, root = P) => { await page.fill(`${root} .ef-field[data-key="${k}"] input.ef-range__n`, String(v)); await page.press(`${root} .ef-field[data-key="${k}"] input.ef-range__n`, 'Enter'); await wait(200); };
  const fillNum = async (k, v, root) => { await page.fill(`${root} .ef-field[data-key="${k}"] input`, String(v)); await page.press(`${root} .ef-field[data-key="${k}"] input`, 'Tab'); await wait(120); };
  const sel = async (k, v, root = P) => { await page.selectOption(`${root} .ef-field[data-key="${k}"] select`, v); await wait(250); };
  const tok = async (k, t) => { await page.click(`${ED} .ef-field[data-key="${k}"] .ef-icon[data-value="${t}"]`); await wait(120); };
  const ED = '[data-k=item-editor][open]';
  const addItem = async (col, fill) => { await page.click(`${P} [data-col="${col}"] [data-k=col-add]`); await page.waitForSelector(ED, { timeout: 8000 }); await fill(); await page.click(`${ED} [data-k=sub-save]`); await wait(300); };
  const look = (id, scope = S) => E(({ scope, id }) => { const r = document.querySelector(`${scope} .stw__c[data-cid="${id}"] .iqg`); if (!r) return null;
    const q = (c) => [...r.querySelectorAll(c)];
    return { segs: q('.iqg__seg').map((g) => g.querySelectorAll('path').length), segGlow: q('.iqg__seg g[filter]').length, labels: q('.iqg__label').map((t) => t.textContent),
      xm: q('.iqg__xmarker').length, icons: q('.iqg__icon').map((i) => ({ mdi: i.dataset.mdi, svg: !!i.querySelector('svg') })), dots: q('.iqg__dot').map((d) => ({ r: +d.getAttribute('r'), fill: d.style.fill })), track: q('.iqg__track').length }; }, { scope, id });

  await E(() => window.IniqStudioLibrary.createCollection('Dials'));
  await E(() => window.editor.setEditing(true)); await wait(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S);
  await page.click(`${S} [data-k=wst-new-empty]`); await wait(300);
  await num('wst-canvas-w', 520); await num('wst-canvas-h', 280);

  // ---- THERMOSTAT (A15): two segments, labels, two more markers (one with an icon)
  await page.click(`${S} [data-k=wst-add][data-type=dial]`); await wait(300);
  const d1 = (await state()).sel;
  await num('wst-x', 10); await num('wst-y', 10); await num('wst-w', 240); await num('wst-h', 240);
  await fillNum('min', 0, P); await fillNum('max', 40, P); await fillNum('data.value', 20, P).catch(() => {});
  await addItem('segments', async () => { await fillNum('from', 5, ED); await fillNum('to', 20, ED); await tok('color', 'info'); await page.click(`${ED} .ef-field[data-key="color2"] .ef-icon[data-value="cool"]`); await wait(100); await rng('glow', 40, ED); });
  await addItem('segments', async () => { await fillNum('from', 24, ED); await fillNum('to', 35, ED); await tok('color', 'danger'); await page.click(`${ED} .ef-field[data-key="color2"] .ef-icon[data-value="purple"]`); await wait(100); });
  for (const [v, t] of [[10, '10°'], [20, '20°'], [30, '30°']]) await addItem('labels', async () => { await fillNum('value', v, ED); await page.fill(`${ED} .ef-field[data-key="text"] input`, t); await wait(80); });
  await addItem('markers', async () => { await sel('at', 'value', ED); await rng('size', 26, ED); await tok('color', 'info');
    await page.click(`${ED} .ef-field[data-key="icon"] [data-k=icon-field]`); await wait(300);
    await page.fill(`${ED} .ef-field[data-key="icon"] .iqi__search`, 'fan'); await page.waitForSelector(`${ED} .iqi__opt[data-icon="mdi:fan"]`, { timeout: 8000 });
    await page.click(`${ED} .iqi__opt[data-icon="mdi:fan"]`); await wait(200); });
  await addItem('markers', async () => { await fillNum('value', 30, ED); await rng('size', 14, ED); await tok('color', 'danger'); });
  let st = await state(), c1 = st.def.components.find((x) => x.id === d1).config;
  let g = await look(d1);
  check('ARC SEGMENTS (added in "More arcs"): two, 5 → 20 blue → teal with glow, 24 → 35 red → purple (gradient pieces)', c1.segments.length === 2 && g.segs.length === 2 && g.segs.every((x) => x > 1) && g.segGlow === 1,
    JSON.stringify({ seg: c1.segments, g: g.segs }));
  check('SCALE LABELS: 10° · 20° · 30° drawn around the ring', JSON.stringify(g.labels) === JSON.stringify(['10°', '20°', '30°']), JSON.stringify(g.labels));
  check('MORE MARKERS: a knob at the value and one at 30 (both drawn)', c1.markers.length === 2 && c1.markers[0].at === 'value' && c1.markers[1].value === 30 && g.xm === 2, JSON.stringify(c1.markers));
  await page.waitForFunction(({ S, id }) => !!document.querySelector(`${S} .stw__c[data-cid="${id}"] .iqg__icon svg`), { S, id: d1 }, { timeout: 8000 }).catch(() => {}); g = await look(d1);
  check('…the value knob carries the fan icon (shared MDI icons, over the knob)', c1.markers[0].icon === 'mdi:fan' && g.icons.length === 1 && g.icons[0].mdi === 'mdi:fan' && g.icons[0].svg, JSON.stringify(g.icons));

  // ---- DOTTED RING (C8): dots coloured from blue to orange, bigger end dots
  await page.click(`${S} [data-k=wst-add][data-type=dial]`); await wait(300);
  const d2 = (await state()).sel;
  await num('wst-x', 270); await num('wst-y', 10); await num('wst-w', 240); await num('wst-h', 240);
  await sel('trackStyle', 'dots');
  await page.click(`${F('trackColor')} .ef-icon[data-value="info"]`); await wait(150); await page.click(`${F('trackColor2')} .ef-icon[data-value="accent-hot"]`); await wait(150);
  await page.fill(`${F('dotCount')} input`, '36'); await page.press(`${F('dotCount')} input`, 'Tab'); await wait(200);
  await rng('dotSize', 5); await rng('dotEndSize', 11); await rng('trackOpacity', 100);
  g = await look(d2);
  check('DOTTED TRACK: 36 separate dots, coloured along the scale (blue → orange), the two end dots larger', g.track === 0 && g.dots.length === 36 && g.dots[0].r === 5.5 && g.dots[35].r === 5.5 && g.dots[10].r === 2.5
    && /info/.test(g.dots[0].fill) && /accent-hot/.test(g.dots[20].fill), JSON.stringify(g.dots.slice(0, 2)));

  // ---- SAVE → REOPEN → dashboard renderer
  await page.fill(`${S} [data-k=wst-name]`, 'Dial parts'); await page.click(`${S} [data-k=wst-save]`); await wait(1500);
  st = await state();
  const savedId = st.defId;
  check('SAVE: accepted by the server', !!savedId && !st.dirty, String(savedId));
  const dash = await E(async (id) => { const w = window.MaisonStudioWidget.create({ definition: id, entities: {} }); w.style.cssText = 'position:fixed;left:0;top:0;width:520px;height:280px'; document.body.append(w); await new Promise((ok) => setTimeout(ok, 300));
    const q = (c) => w.querySelectorAll(c).length, out = { segs: q('.iqg__seg'), labels: q('.iqg__label'), xm: q('.iqg__xmarker'), dots: q('.iqg__dot') }; w.remove(); return out; }, savedId);
  check('DASHBOARD renderer: the same segments, labels, markers and dots', dash.segs === 2 && dash.labels === 3 && dash.xm === 2 && dash.dots === 36, JSON.stringify(dash));
  check('no page error', B.errors.length === 0, B.errors.slice(0, 3).join(' | '));
} catch (e) {
  check('studio-gauge test ran', false, e.stack);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
