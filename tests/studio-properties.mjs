/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO — WIDGET PROPERTIES: cleanup + the HA sensor / value property UX, through the REAL editor and the REAL IniqDash server
// with a FAKE Home Assistant (tests/lib/live.mjs — not a real Home Assistant):
//   CLEANUP   a saved "Robin Climate" carrying migrated junk: generated, unused properties ("Segmented control Value", "Entity 2") are gone;
//             a deliberate unused one ("Stove Temperature") is shown Unused and deletes at once; a used one asks first, then its
//             components go back to None (never deleted, never re-bound); Save → browser reload never brings a deleted property back
//   SENSOR    + New property → Sensor / State by default → a preview entity → its CURRENT PREVIEW VALUE (with HA's unit) in the editor;
//             a Value / Text and a Dial on the same property follow a live change independently
//   CLIMATE   Room / Target Temperature and HVAC Mode from ONE source "Climate", their friendly values and preview values
//   SHEET     a component shows only Property (+ Edit property) — the definition lives on the property; new components start with None
//   CONFIGURE one row per source (two sensors with their own sources: two rows; the same source: one)
import path from 'node:path';
import { live, liveBrowser, ENTITIES } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
Object.assign(ENTITIES, {
  'sensor.room_temperature': ['21.5', { name: 'Room temperature', unit: '°C', dc: 'temperature' }],
  'sensor.room_humidity': ['48', { name: 'Room humidity', unit: '%', dc: 'humidity' }],
  'sensor.broken': ['unavailable', { name: 'Broken sensor', unit: '°C' }],
  'climate.living_room': ['heat', { name: 'Living room', f: 1, cur: 21.5, target: 23, min: 7, max: 30, step: 0.5, modes: ['heat', 'auto', 'off'] }],
  'sensor.stove_temperature': ['65', { name: 'Stove temperature', unit: '°C', dc: 'temperature' }],
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
  const box = async (k, v) => { await page.fill(`${P} [data-k=wst-${k}]`, String(v)); await page.press(`${P} [data-k=wst-${k}]`, 'Tab'); await page.waitForTimeout(120); };
  const place = async (x, y, w, h) => { await box('w', w); await box('h', h); await box('x', x); await box('y', y); };
  const setSel = async (k, v) => { await page.selectOption(`${F(k)} select`, v); await page.waitForTimeout(250); };
  const setPlain = async (k, v) => { await page.fill(`${F(k)} input`, String(v)); await page.waitForTimeout(200); };
  const useProp = async (label) => { await page.selectOption(`${F('binding.property')} select`, { label }); await page.waitForTimeout(400); };
  const propOptions = () => E((k) => [...document.querySelectorAll(`${k} option`)].map((o) => o.textContent), `${F('binding.property')} select`);
  const until = async (fn, arg, ms = 8000) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };
  const pick = async (root, id) => { await page.click(`${root} [data-k=iqp-choose]`); await page.waitForTimeout(250); await page.fill(`${root} .iqp__search`, id); await page.waitForTimeout(250);
    await page.click(`${root} .iqp__item[data-entity="${id}"]`); await page.waitForTimeout(600); };
  const current = () => E((ED) => { const c = document.querySelector(`${ED} [data-k=wst-pe-current]`); return c ? `${c.dataset.status}: ${c.querySelector('b').textContent}` : null; }, ED);
  const rows = () => E((P) => [...document.querySelectorAll(`${P} [data-k=wst-prop]`)].map((p) => ({ name: p.dataset.prop, meta: p.querySelector('[data-k=wst-propmeta]').textContent, src: p.querySelector('[data-k=wst-propsource]').textContent,
    users: p.querySelector('[data-k=wst-propusers]').textContent, cur: p.querySelector('[data-k=wst-propcurrent]').textContent })), P);
  const node = (id) => `${S} [data-k=wst-board] .stw__c[data-cid="${id}"]`;
  const shot = async (sel, name) => { if (SHOTS) await (await page.$(sel)).screenshot({ path: path.join(SHOTS, name) }); };
  const stored = async () => E(async () => (await (await fetch('api/studio_widgets.php', { credentials: 'same-origin' })).json()));

  // ================================================================ CLEANUP — a saved Robin Climate carrying migrated junk
  const col = await E(async () => (await window.IniqStudioLibrary.createCollection('Robin')).collection.id);
  const robin = await E(async (col) => {
    const csrf = document.querySelector('meta[name="iniqdash-csrf"]').content;
    const g = (id, label, family, preview) => ({ id, label, family, ...(preview ? { preview } : {}) }), p = (id, name, group, read = 'state', attribute) => ({ id, name, group, read, ...(attribute ? { attribute } : {}) });
    const definition = { meta: { name: 'Robin Climate', collection: col, category: 'climate', description: '', icon: 'mdi:radiator' }, canvas: { w: 360, h: 240 },
      slots: [g('s11111111', 'Climate', 'climate', 'climate.living_room'), g('s22222222', 'Stove Temperature', 'sensor', 'sensor.stove_temperature'), g('s33333333', 'Segmented control', 'climate'), g('s44444444', 'Entity 2', 'sensor')],
      properties: [p('p00000001', 'Room Temperature', 's11111111', 'derived', 'current_temperature'), p('p00000002', 'Target Temperature', 's11111111', 'derived', 'target_temperature'), p('p00000003', 'HVAC Mode', 's11111111'),
        p('p00000004', 'Stove Temperature', 's22222222'), p('p00000005', 'Segmented control Value', 's33333333'), p('p00000006', 'Entity 2', 's44444444')],
      components: [{ id: 'dial-1', name: 'dialRoomTemp', type: 'dial', x: 80, y: 8, w: 200, h: 200, config: { preset: 'spectrum', min: 5, max: 35 }, data: {}, binding: { source: 'ha', property: 'p00000001' } },
        { id: 'text-1', name: 'txtRoomTemp', type: 'text', x: 120, y: 80, w: 120, h: 50, config: { mode: 'value', suffix: '°C', decimals: 1 }, data: {}, binding: { source: 'ha', property: 'p00000001' } },
        { id: 'text-2', name: 'txtTarget', type: 'text', x: 120, y: 140, w: 120, h: 30, config: { mode: 'value', prefix: 'Target' }, data: {}, binding: { source: 'ha', property: 'p00000002' } },
        { id: 'segmented-1', name: 'segMode', type: 'segmented', x: 20, y: 200, w: 320, h: 36, config: {}, data: {}, binding: { source: 'ha', property: 'p00000003' } }] };
    return (await (await fetch('api/studio_widgets.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ action: 'save', id: null, definition }) })).json()).widget.id;
  }, col);
  await page.reload(); await page.waitForTimeout(1800);
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(300);
  await page.selectOption(`${S} [data-k=wst-widget]`, `def:${robin}`); await page.waitForTimeout(700);
  await select(null);
  let r = await rows();
  check('CLEANUP on open: the generated, unused migration properties ("Segmented control Value", "Entity 2") are gone; the deliberate "Stove Temperature" stays — marked Unused',
    JSON.stringify(r.map((x) => [x.name, x.users])) === JSON.stringify([['Room Temperature', 'Used by: dialRoomTemp, txtRoomTemp'], ['Target Temperature', 'Used by: txtTarget'], ['HVAC Mode', 'Used by: segMode'], ['Stove Temperature', 'Unused']]), JSON.stringify(r));
  check('MANAGER rows: "Family · Value", "Source", the current preview value — e.g. Room Temperature: Climate · Current temperature, Source: Climate, Preview: 21.5 °',
    r[0].meta === 'Climate · Current temperature' && r[0].src === 'Source: Climate' && /^Preview: 21\.5 °/.test(r[0].cur) && r[2].meta === 'Climate · State (HVAC mode)' && /Preview: heat/.test(r[2].cur) && r[3].meta === 'Sensor · State', JSON.stringify(r));
  await page.click(`${P} [data-k=wst-prop][data-prop="Stove Temperature"] [data-k=wst-propdel]`); await page.waitForTimeout(200);
  await select('dial-1');
  check('DELETE an unused property: immediate — gone from the manager and from every Property dropdown (None, Room / Target Temperature… + New property)',
    !(await state()).def.properties.some((p) => p.name === 'Stove Temperature') && JSON.stringify(await propOptions()) === JSON.stringify(['None (preview data)', 'Room Temperature', 'Target Temperature', '+ New property…']), JSON.stringify(await propOptions()));
  await select('segmented-1');
  check('…the segmented\'s dropdown: None, HVAC Mode, + New property — no junk, no component names', JSON.stringify(await propOptions()) === JSON.stringify(['None (preview data)', 'HVAC Mode', '+ New property…']), JSON.stringify(await propOptions()));
  // a used property: asks first; confirmed → components back to None (kept, never re-bound)
  await select(null);
  await page.click(`${P} [data-k=wst-prop][data-prop="Target Temperature"] [data-k=wst-propdel]`); await page.waitForTimeout(200);
  const ask = await E((P) => document.querySelector(`${P} [data-k=wst-prop][data-prop="Target Temperature"] [data-k=wst-propconfirm]`).textContent, P);
  await page.click(`${P} [data-k=wst-prop][data-prop="Target Temperature"] [data-k=wst-propconfirm-ok]`); await page.waitForTimeout(300);
  let st = await state();
  check('DELETE a used property: "Target Temperature is used by 1 component (txtTarget)." → Remove property and unbind components → txtTarget stays, with Property None (not re-bound)',
    /Target Temperature is used by 1 component \(txtTarget\)\./.test(ask) && !st.def.properties.some((p) => p.name === 'Target Temperature') && st.def.components.some((c) => c.name === 'txtTarget' && !c.binding), ask);
  r = await E((S) => document.querySelector(S).studio.save(), S);
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);
  await page.reload(); await page.waitForTimeout(1800);
  const after = (await stored()).widgets.find((w) => w.id === robin).definition;
  check('SAVE → BROWSER RELOAD: the deleted properties stay deleted (stored: Room Temperature, HVAC Mode; one source "Climate"); txtTarget kept without a property',
    r.ok && JSON.stringify(after.properties.map((p) => p.name)) === JSON.stringify(['Room Temperature', 'HVAC Mode']) && JSON.stringify(after.slots.map((g) => g.label)) === JSON.stringify(['Climate'])
      && after.components.find((c) => c.name === 'txtTarget') && !after.components.find((c) => c.name === 'txtTarget').binding, JSON.stringify({ r, after: after.properties }));

  // ================================================================ SENSOR — + New property → Sensor / State → preview → current value
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(300);
  await page.click(`${S} [data-k=wst-new]`); await page.waitForTimeout(300);
  await select(null); await setPlain('name', 'Sensor Test'); await setSel('category', 'sensors');
  const INFO = await add('information');
  const infoLook = await E((s) => document.querySelector(s).textContent, node(INFO));
  check('NEW Information: Property None; generic design content ("Value" / "Label" — not a realistic 21.5 °C)', !(await comp(INFO)).binding && /Value/.test(infoLook) && /Label/.test(infoLook) && !/21\.5|°C|Temperature/.test(infoLook), infoLook);
  const D0 = await add('dial');
  check('NEW Dial: Property None, a 50 % preview', !(await comp(D0)).binding && await E((s) => document.querySelector(s + ' .iqg').getAttribute('aria-valuenow') === '50', node(D0)));
  const T = await add('text'); await place(20, 20, 140, 50);
  check('NEW Value / Text: Static "Text", no property', !(await comp(T)).binding && (await comp(T)).config.mode === 'static' && await E((s) => document.querySelector(s + ' .iqtx').textContent === 'Text', node(T)));
  await setSel('mode', 'value');
  const sheet = await E((P) => [...document.querySelectorAll(`${P} .ef-field[data-key]`)].filter((f) => !f.hidden && f.offsetParent).map((f) => f.dataset.key), P);
  check('COMPONENT SHEET: Data shows only Mode + Property — no family / value / source / preview fields on the component', sheet.includes('binding.property') && !sheet.some((k) => /family|source|preview|slot/i.test(k)), JSON.stringify(sheet));
  await setSel('binding.property', '+new');
  const defaults = await E((ED) => [document.querySelector(`${ED} [data-k=wst-pe-family]`).value, document.querySelector(`${ED} [data-k=wst-pe-value] option:checked`).textContent], ED);
  const none = await current();
  await page.fill(`${ED} [data-k=wst-pe-name]`, 'Test Temperature');
  const srcDefault = await E((ED) => [document.querySelector(`${ED} [data-k=wst-pe-source] option:checked`).textContent, document.querySelector(`${ED} [data-k=wst-pe-sname]`).value], ED);
  await pick(ED, 'sensor.room_temperature');
  const cur1 = await current();
  await shot(`${S} .wst__col--r`, 'v3-sensor-editor.png');
  check('+ NEW PROPERTY: Family Sensor and Value State by default; "No preview entity selected" until one is chosen; Source: a new one named after the property',
    JSON.stringify(defaults) === JSON.stringify(['sensor', 'State']) && none === 'none: No preview entity selected' && JSON.stringify(srcDefault) === JSON.stringify(['New source…', 'Test Temperature']), JSON.stringify({ defaults, none, srcDefault }));
  check('CURRENT PREVIEW VALUE in the editor: sensor.room_temperature → "21.5 °C" (the unit HA reports)', cur1 === 'ready: 21.5 °C', cur1);
  await page.click(`${ED} [data-k=wst-pe-save]`); await page.waitForTimeout(500);
  await setPlain('suffix', '°C'); await setSel('decimals', '1');
  check('VALUE / TEXT on Test Temperature (suffix °C, 1 decimal): the canvas shows "21.5°C" at once — the component\'s own formatting, not HA\'s unit', await until(({ s }) => document.querySelector(s + ' .iqtx')?.textContent === '21.5°C', { s: node(T) }));
  await select(D0); await place(180, 20, 150, 150); await useProp('Test Temperature'); await setPlain('min', 5); await setPlain('max', 35);
  check('DIAL on the SAME property (range 5–35): its arc and marker at 21.5 — no number inside it', await until(({ s }) => document.querySelector(s + ' .iqg')?.getAttribute('aria-valuenow') === '21.5' && document.querySelector(s + ' .iqg').textContent === '', { s: node(D0) }));
  // EDIT PROPERTY from the component: the ONE definition, with its live current value
  await page.click(`${P} [data-k=wst-propedit-here]`); await page.waitForTimeout(400);
  const editing = await E((ED) => [document.querySelector(`${ED} [data-k=wst-pe-name]`).value, document.querySelector(`${ED} [data-k=wst-pe-family]`).value], ED);
  ENTITIES['sensor.room_temperature'][0] = '22.1';
  const liveEd = await until(({ ED }) => document.querySelector(`${ED} [data-k=wst-pe-current] b`)?.textContent === '22.1 °C', { ED }, 10000);
  check('EDIT PROPERTY beside the dial\'s Property opens Test Temperature\'s editor; HA → 22.1: its current value follows ("22.1 °C")', JSON.stringify(editing) === JSON.stringify(['Test Temperature', 'sensor']) && liveEd, JSON.stringify(editing));
  await page.click(`${ED} [data-k=wst-pe-cancel]`); await page.waitForTimeout(300);
  check('…and BOTH controls follow on their own: text "22.1°C", dial 22.1', await until(({ t, d }) => document.querySelector(t + ' .iqtx')?.textContent === '22.1°C' && document.querySelector(d + ' .iqg')?.getAttribute('aria-valuenow') === '22.1', { t: node(T), d: node(D0) }, 10000));
  // an unavailable preview entity: named, not a number
  await select(null); await page.click(`${P} [data-k=wst-prop-add]`); await page.waitForTimeout(200);
  await page.fill(`${ED} [data-k=wst-pe-name]`, 'Broken'); await pick(ED, 'sensor.broken');
  check('PREVIEW STATUS: an unavailable entity reads "Unavailable"', (await current()) === 'unavailable: Unavailable', await current());
  await page.click(`${ED} [data-k=wst-pe-cancel]`); await page.waitForTimeout(200);

  // ================================================================ SOURCES — two sensors: two sources unless the designer shares one
  await page.click(`${P} [data-k=wst-prop-add]`); await page.waitForTimeout(200);
  await page.fill(`${ED} [data-k=wst-pe-name]`, 'Humidity'); await page.fill(`${ED} [data-k=wst-pe-sname]`, 'Humidity Sensor'); await pick(ED, 'sensor.room_humidity');
  const hum = await current();
  await page.click(`${ED} [data-k=wst-pe-save]`); await page.waitForTimeout(400);
  const H = await add('text'); await place(20, 90, 120, 40); await setSel('mode', 'value'); await useProp('Humidity');
  check('Humidity (Sensor · State, source "Humidity Sensor"): current value "48%"; a text on it shows 48', hum === 'ready: 48%' && await until(({ s }) => document.querySelector(s + ' .iqtx')?.textContent === '48', { s: node(H) }), hum);
  await select(null); await E((P) => document.querySelector(`${P} [data-k=wst-prop][data-prop="Test Temperature"] [data-k=wst-propedit]`).click(), P); await page.waitForTimeout(300);
  await page.fill(`${ED} [data-k=wst-pe-name]`, 'Room Temperature'); await page.waitForTimeout(100);
  await page.click(`${ED} [data-k=wst-pe-save]`); await page.waitForTimeout(400);
  const r1 = await E((S) => document.querySelector(S).studio.save(), S);
  const sensorId = (await state()).defId;
  const configure = async () => { await page.click(`${S} [data-k=wst-close]`).catch(() => {}); await page.waitForTimeout(300);
    await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click()); await page.waitForSelector('.ecfg-tile'); await page.waitForTimeout(200);
    await page.selectOption('dialog[open] [data-filter=collection]', 'all'); await page.selectOption('dialog[open] [data-filter=category]', 'all'); await page.click(`.ecfg-tile[data-type="my:${sensorId}"]`); await page.waitForTimeout(600);
    const out = await E(() => [...document.querySelectorAll('dialog[open] .ef-slot')].map((x) => `${x.dataset.slot} — ${x.querySelector('[data-k=slot-provides]')?.textContent || ''}`));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300); return out; };
  const two = await configure();
  check('CONFIGURE: two properties with their own sources → two independent rows ("Test Temperature" provides Room Temperature, "Humidity Sensor" provides Humidity)',
    r1.ok && JSON.stringify(two) === JSON.stringify(['Test Temperature — Provides: Room Temperature', 'Humidity Sensor — Provides: Humidity']), JSON.stringify(two));
  // the designer deliberately shares one source
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(300);
  await page.selectOption(`${S} [data-k=wst-widget]`, `def:${sensorId}`); await page.waitForTimeout(600);
  await select(null); await E((P) => document.querySelector(`${P} [data-k=wst-prop][data-prop="Humidity"] [data-k=wst-propedit]`).click(), P); await page.waitForTimeout(300);
  await page.selectOption(`${ED} [data-k=wst-pe-source]`, { label: 'Test Temperature' }); await page.waitForTimeout(200);
  await page.click(`${ED} [data-k=wst-pe-save]`); await page.waitForTimeout(400);
  await E((S) => document.querySelector(S).studio.save(), S);
  const one = await configure();
  check('…the designer puts Humidity in the same source → Configure asks ONCE ("Test Temperature" provides Room Temperature, Humidity) — never merged automatically before',
    JSON.stringify(one) === JSON.stringify(['Test Temperature — Provides: Room Temperature, Humidity']), JSON.stringify(one));
  // save / reload: a sensor property keeps everything
  await page.reload(); await page.waitForTimeout(1800);
  const sd = (await stored()).widgets.find((w) => w.id === sensorId).definition, rp = sd.properties.find((p) => p.name === 'Room Temperature'), rg = sd.slots.find((g) => g.id === rp.group);
  check('SAVE → RELOAD: Room Temperature keeps its id, family (sensor), value (state), source and preview entity; the text and the dial still reference it',
    /^p[0-9a-f]{8}$/.test(rp.id) && rp.read === 'state' && rg.family === 'sensor' && rg.label === 'Test Temperature' && rg.preview === 'sensor.room_temperature'
      && sd.components.filter((c) => c.binding && c.binding.property === rp.id).length === 2, JSON.stringify({ rp, rg }));

  // ================================================================ CLIMATE — one source, friendly values, visible preview values
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(300);
  await page.click(`${S} [data-k=wst-new]`); await page.waitForTimeout(300);
  await select(null); await setPlain('name', 'Climate Test'); await setSel('category', 'climate');
  const newClimate = async (name, value, first) => {
    await select(null); await page.click(`${P} [data-k=wst-prop-add]`); await page.waitForTimeout(200);
    await page.fill(`${ED} [data-k=wst-pe-name]`, name); await page.selectOption(`${ED} [data-k=wst-pe-family]`, 'climate'); await page.waitForTimeout(150);
    if (first) { await page.fill(`${ED} [data-k=wst-pe-sname]`, 'Climate'); await pick(ED, 'climate.living_room'); } else await page.selectOption(`${ED} [data-k=wst-pe-source]`, { label: 'Climate' });
    await page.selectOption(`${ED} [data-k=wst-pe-value]`, { label: value }); await page.waitForTimeout(500);
    const c = await current(), vals = await E((ED) => [...document.querySelectorAll(`${ED} [data-k=wst-pe-value] option`)].map((o) => o.textContent), ED);
    await page.click(`${ED} [data-k=wst-pe-save]`); await page.waitForTimeout(400); return { c, vals };
  };
  const c1 = await newClimate('Room Temperature', 'Current temperature', true), c2 = await newClimate('Target Temperature', 'Target temperature'), c3 = await newClimate('HVAC Mode', 'State (HVAC mode)');
  check('CLIMATE values are friendly (Current temperature · Target temperature · State (HVAC mode) · HVAC action · Preset · Current humidity · Last changed — no raw names)',
    JSON.stringify(c1.vals) === JSON.stringify(['Current temperature', 'Target temperature', 'State (HVAC mode)', 'HVAC action', 'Preset', 'Current humidity', 'Last changed (time)']), JSON.stringify(c1.vals));
  check('CLIMATE current preview values from ONE source (climate.living_room): Room 21.5 °, Target 23 °, HVAC Mode heat — the source\'s preview reused by each property',
    c1.c === 'ready: 21.5 °' && c2.c === 'ready: 23 °' && c3.c === 'ready: heat', JSON.stringify([c1.c, c2.c, c3.c]));
  const cd = await add('dial'); await place(80, 8, 200, 200); await useProp('Room Temperature');
  const ct = await add('text'); await place(120, 80, 120, 50); await setSel('mode', 'value'); await useProp('Room Temperature'); await setPlain('suffix', '°C'); await setSel('decimals', '1');
  const cg = await add('text'); await place(120, 140, 120, 30); await setSel('mode', 'value'); await useProp('Target Temperature'); await setPlain('prefix', 'Target');
  const cs = await add('segmented'); await place(20, 200, 320, 36); await useProp('HVAC Mode');
  check('CLIMATE controls: Dial and a text on Room Temperature (21.5, "21.5°C"), a text on Target Temperature ("Target 23"), the segmented on HVAC Mode (Heat) — options and the dial range prefilled from the preview',
    await until(({ d, t, g, sg }) => document.querySelector(d + ' .iqg')?.getAttribute('aria-valuenow') === '21.5' && document.querySelector(t + ' .iqtx')?.textContent === '21.5°C' && document.querySelector(g + ' .iqtx')?.textContent === 'Target 23'
      && document.querySelector(sg + ' [aria-checked="true"]')?.dataset.id === 'heat', { d: node(cd), t: node(ct), g: node(cg), sg: node(cs) }, 10000)
      && (await comp(cd)).config.min === 7 && JSON.stringify((await comp(cs)).config.options.map((o) => o.value)) === JSON.stringify(['heat', 'auto', 'off']));
  ENTITIES['climate.living_room'][1].cur = 22;
  check('LIVE: climate.living_room\'s current temperature → 22: the dial and the room text follow; the target text does not', await until(({ d, t, g }) => document.querySelector(d + ' .iqg')?.getAttribute('aria-valuenow') === '22' && document.querySelector(t + ' .iqtx')?.textContent === '22.0°C' && document.querySelector(g + ' .iqtx')?.textContent === 'Target 23', { d: node(cd), t: node(ct), g: node(cg) }, 10000));
  await select(null); await shot(`${S} .wst__col--r`, 'v3-climate-manager.png');
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
