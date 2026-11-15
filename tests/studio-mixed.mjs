/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO — a MIXED-DOMAIN personal widget and the Toggle primitive, through the REAL Studio UI, the REAL Add-to-dashboard
// Configure and the REAL IniqDash server with a FAKE Home Assistant (tests/lib/live.mjs — not a real Home Assistant):
//   TOGGLE     the shared switch-role control button (Light's / Climate's Power renderer) is placeable — neutral: label "Toggle", no
//              property, no action, "Display only"
//   MIXED      one widget, three sources of three HA families — Climate (a dial + the HVAC mode selector), a Light (a Toggle, Action
//              Toggle), a Sensor (a Value / Text): Configure asks for each source once; every control acts on ITS source's entity
import { live, liveBrowser, ENTITIES } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

Object.assign(ENTITIES, {
  'climate.living_room': ['heat', { name: 'Living room', f: 1, cur: 21.5, target: 23, min: 7, max: 30, step: 0.5, modes: ['heat', 'cool', 'off'] }],
  'light.desk': ['off', { name: 'Desk', f: 0, br: 0, cm: 'brightness', scm: ['brightness'] }],
  'sensor.hum': ['47', { name: 'Humidity', unit: '%', dc: 'humidity' }],
});

let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const S = 'dialog.wst[open]', P = `${S} .wst__props`, F = (k) => `${P} .ef-field[data-key="${k}"]`, ED = `${P} [data-k=wst-peditor]`;
  const state = () => E((S) => document.querySelector(S).studio.state(), S);
  const comp = async (id) => (await state()).def.components.find((c) => c.id === id);
  const add = async (t) => { await page.click(`${S} [data-k=wst-add][data-type=${t}]`); await page.waitForTimeout(250); return (await state()).sel; };
  const select = async (id) => { await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id }); await page.waitForTimeout(200); };
  const box = async (k, v) => { await page.fill(`${P} [data-k=wst-${k}]`, String(v)); await page.press(`${P} [data-k=wst-${k}]`, 'Tab'); await page.waitForTimeout(100); };
  const place = async (x, y, w, h) => { await box('w', w); await box('h', h); await box('x', x); await box('y', y); };
  const setSel = async (k, v) => { await page.selectOption(`${F(k)} select`, v); await page.waitForTimeout(250); };
  const setPlain = async (k, v) => { await page.fill(`${F(k)} input`, String(v)); await page.waitForTimeout(200); };
  const useProp = async (label) => { await page.selectOption(`${F('binding.property')} select`, { label }); await page.waitForTimeout(400); };
  const pick = async (root, id) => { await page.click(`${root} [data-k=iqp-choose]`); await page.waitForTimeout(250); await page.fill(`${root} .iqp__search`, id); await page.waitForTimeout(250);
    await page.click(`${root} .iqp__item[data-entity="${id}"]`); await page.waitForTimeout(600); };
  const newProperty = async ({ name, family, value, source, newSource, preview }) => {
    await select(null); await page.click(`${P} [data-k=wst-prop-add]`); await page.waitForTimeout(200);
    await page.fill(`${ED} [data-k=wst-pe-name]`, name); await page.selectOption(`${ED} [data-k=wst-pe-family]`, family); await page.waitForTimeout(150);
    if (source) await page.selectOption(`${ED} [data-k=wst-pe-source]`, { label: source }); else if (newSource) await page.fill(`${ED} [data-k=wst-pe-sname]`, newSource);
    await page.selectOption(`${ED} [data-k=wst-pe-value]`, { label: value }); await page.waitForTimeout(150);
    if (preview) await pick(ED, preview);
    await page.click(`${ED} [data-k=wst-pe-save]`); await page.waitForTimeout(400);
  };
  const until = async (fn, arg, ms = 8000) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };
  const posts = (from) => L.haCalls.filter((c, i) => i >= from && c.method === 'POST' && /\/api\/services\//.test(c.url));

  await E(() => window.IniqStudioLibrary.createCollection('Mixed'));
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S);
  await page.click(`${S} [data-k=wst-new-empty]`); await page.waitForTimeout(300);
  await page.click(`${S} [data-k=wst-snap-smart]`);
  await select(null); await setPlain('name', 'Living Room Mix'); await setSel('category', 'climate');

  // ---- the TOGGLE primitive: neutral
  const T = await add('toggle'); await place(280, 8, 72, 72);
  const tg = await comp(T);
  const tgTruth = await E((P) => document.querySelector(`${P} [data-k=wst-truth]`)?.textContent || '', P);
  const tgEl = await E(({ S, T }) => { const b = document.querySelector(`${S} .stw__c[data-cid="${T}"] .iqc-btn`); return b ? { role: b.getAttribute('role'), style: b.dataset.style } : null; }, { S, T });
  check('TOGGLE (new primitive in the palette): "Toggle1" — the shared switch-role control button (role switch, the switch look), label "Toggle", NO property, NO action, "Display only"',
    tg.name === 'Toggle1' && !tg.binding && tg.config.label === 'Toggle' && tgEl && tgEl.role === 'switch' && tgEl.style === 'switch' && /Display only/.test(tgTruth), JSON.stringify({ tg, tgEl, tgTruth }));

  // ---- three sources, three HA families
  await newProperty({ name: 'Room Temperature', family: 'climate', value: 'Current temperature', newSource: 'Climate', preview: 'climate.living_room' });
  await newProperty({ name: 'HVAC Mode', family: 'climate', value: 'State (HVAC mode)', source: 'Climate' });
  await newProperty({ name: 'Desk Light', family: 'light', value: 'On / off (state)', newSource: 'Desk Lamp', preview: 'light.desk' });
  await newProperty({ name: 'Humidity', family: 'sensor', value: 'State', newSource: 'Humidity Sensor', preview: 'sensor.hum' });
  const D = await add('dial'); await place(8, 8, 120, 120); await useProp('Room Temperature');
  const SG = await add('segmented'); await place(8, 140, 260, 40); await useProp('HVAC Mode');
  const X = await add('text'); await place(140, 40, 120, 40); await setSel('mode', 'value'); await useProp('Humidity'); await setPlain('suffix', '%');
  await select(T); await useProp('Desk Light'); await setSel('binding.press', 'toggle');
  const tTruth = await E((P) => document.querySelector(`${P} [data-k=wst-truth]`)?.textContent || '', P);
  check('…bound deliberately: the Toggle to "Desk Light" (Light), Action Toggle — it says so ("Pressing it: Toggle — “Desk Light”\'s entity.")', /Pressing it: Toggle/.test(tTruth), tTruth);
  const r = await E((S) => document.querySelector(S).studio.save(), S);
  const id = (await state()).defId;
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);

  // ---- Configure: one row per source, three families
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click()); await page.waitForSelector('.ecfg-tile'); await page.waitForTimeout(200);
  await page.selectOption('dialog[open] [data-filter=collection]', 'all'); await page.selectOption('dialog[open] [data-filter=category]', 'all'); await page.click(`.ecfg-tile[data-type="my:${id}"]`); await page.waitForTimeout(700);
  const rows = await E(() => [...document.querySelectorAll('dialog[open] .ef-slot')].map((x) => `${x.dataset.slot} — ${x.querySelector('[data-k=slot-provides]')?.textContent || ''}`));
  check('CONFIGURE: three sources of three families, each once — Climate (Room Temperature, HVAC Mode) · Desk Lamp (Desk Light) · Humidity Sensor (Humidity)',
    r.ok && JSON.stringify(rows) === JSON.stringify(['Climate — Provides: Room Temperature, HVAC Mode', 'Desk Lamp — Provides: Desk Light', 'Humidity Sensor — Provides: Humidity']), JSON.stringify(rows));
  const ids0 = await E(() => window.editor.getModel().pages.flatMap((p) => p.items).map((i) => i.id));
  for (const [label, ent] of [['Climate', 'climate.living_room'], ['Desk Lamp', 'light.desk'], ['Humidity Sensor', 'sensor.hum']]) {
    const row = `dialog[open] .ef-slot[data-slot="${label}"]`; await page.click(`${row} [data-k=iqp-choose]`); await page.waitForTimeout(200);
    await page.fill(`${row} .iqp__search`, ent); await page.waitForTimeout(250); await page.click(`${row} .iqp__item[data-entity="${ent}"]`); await page.waitForTimeout(350);
  }
  await page.click('dialog[open] .ecfg-foot button:has-text("Next")'); await page.waitForTimeout(300); await page.click('dialog[open] .ecfg-add'); await page.waitForTimeout(700);
  const copy = (await E(() => window.editor.getModel().pages.flatMap((p) => p.items))).find((i) => !ids0.includes(i.id));
  await E(() => window.editor.save && window.editor.save()); await page.waitForTimeout(800);
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(1500);
  const RT = `[data-grid-id="${copy.id}"] .stw`;
  await page.locator(RT).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const shown = await until(({ RT, D, SG, X, T }) => { const q = (c, s) => document.querySelector(`${RT} .stw__c[data-cid="${c}"] ${s}`);
    return q(D, '.iqg')?.getAttribute('aria-valuenow') === '21.5' && q(SG, '[aria-checked="true"]')?.dataset.id === 'heat' && q(X, '.iqtx')?.textContent === '47%' && q(T, '.iqc-btn')?.getAttribute('aria-checked') === 'false'; }, { RT, D, SG, X, T }, 10000);
  check('RUNTIME: one widget, three domains — dial 21.5 and Heat (climate.living_room), "47%" (sensor.hum), the Toggle off (light.desk is off)', shown);
  const n0 = L.haCalls.length;
  await page.click(`${RT} .stw__c[data-cid="${T}"] .iqc-btn`); await page.waitForTimeout(900);
  await page.click(`${RT} .stw__c[data-cid="${SG}"] [data-id="cool"]`); await page.waitForTimeout(900);
  const calls = posts(n0).map((c) => [c.url.replace(/.*\/api\/services\//, ''), JSON.parse(c.body).entity_id]);
  check('ACTIONS through the existing secure layer, each on ITS source\'s entity: the Toggle → light.turn_on for light.desk; the HVAC selector → climate.set_hvac_mode for climate.living_room',
    JSON.stringify(calls) === JSON.stringify([['light/turn_on', 'light.desk'], ['climate/set_hvac_mode', 'climate.living_room']]), JSON.stringify(calls));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
