/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO — NO MAGIC: a primitive has NO Home Assistant meaning until the designer gives it one; WIDGET PROPERTIES are the ONLY
// semantics. Through the REAL Studio UI, the REAL Add-to-dashboard Configure and the REAL IniqDash server with a FAKE Home Assistant
// (tests/lib/live.mjs — not a real Home Assistant):
//   CLEAN      a new widget with every primitive: Property None, no action, neutral content; its saved JSON names no domain; Configure
//              asks for nothing; pressing / choosing on a placed copy reaches no Home Assistant
//   DELIBERATE Climate (Room Temperature + HVAC Mode, one source) → Configure asks for Climate ONCE; the segmented's Heat / Auto / Off are
//              real only now: each choice → climate.set_hvac_mode through the existing secure layer, on THAT copy's entity
//   SENSOR     a read-only Temperature: no control can use it to act; Configure asks for the sensor
//   AUTHORITY  only properties create requirements: a stray legacy binding means nothing; a Robin-style definition migrates ONCE
//              (schema 2), its "Stove Temperature" deleted → gone from Studio, Configure and the stored JSON, never back after reload
import { live, liveBrowser, ENTITIES } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

Object.assign(ENTITIES, {
  'climate.living_room': ['heat', { name: 'Living room', f: 1, cur: 21.5, target: 23, min: 7, max: 30, step: 0.5, modes: ['heat', 'auto', 'off'] }],
  'climate.br': ['off', { name: 'Bedroom', f: 1, cur: 18, target: 19, min: 7, max: 30, step: 0.5, modes: ['heat', 'auto', 'off'] }],
  'sensor.temp_a': ['19.4', { name: 'Temperature A', unit: '°C', dc: 'temperature' }],
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
  const box = async (k, v) => { await page.fill(`${P} [data-k=wst-${k}]`, String(v)); await page.press(`${P} [data-k=wst-${k}]`, 'Tab'); await page.waitForTimeout(100); };
  const place = async (x, y, w, h) => { await box('w', w); await box('h', h); await box('x', x); await box('y', y); };
  const setSel = async (k, v) => { await page.selectOption(`${F(k)} select`, v); await page.waitForTimeout(250); };
  const setPlain = async (k, v) => { await page.fill(`${F(k)} input`, String(v)); await page.waitForTimeout(200); };
  const useProp = async (label) => { await page.selectOption(`${F('binding.property')} select`, { label }); await page.waitForTimeout(400); };
  const propOptions = () => E((k) => [...document.querySelectorAll(`${k} option`)].map((o) => o.textContent), `${F('binding.property')} select`);
  const truth = () => E((P) => document.querySelector(`${P} [data-k=wst-truth]`)?.textContent || '', P);
  const until = async (fn, arg, ms = 8000) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };
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
  const stored = async (id) => (await E(async () => (await (await fetch('api/studio_widgets.php', { credentials: 'same-origin' })).json()))).widgets.find((w) => w.id === id).definition;
  const model = () => E(() => window.editor.getModel().pages.flatMap((p) => p.items));
  const openTile = async (id) => { await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click()); await page.waitForSelector('.ecfg-tile'); await page.waitForTimeout(200);
    await page.selectOption('dialog[open] [data-filter=collection]', 'all'); await page.selectOption('dialog[open] [data-filter=category]', 'all'); await page.click(`.ecfg-tile[data-type="my:${id}"]`); await page.waitForTimeout(700); };
  const cfgRows = () => E(() => [...document.querySelectorAll('dialog[open] .ef-slot')].map((x) => `${x.dataset.slot} — ${x.querySelector('[data-k=slot-provides]')?.textContent || ''}`));
  const cfgText = () => E(() => document.querySelector('dialog[open]').textContent);
  const placeCopy = async (id, list) => {
    const ids0 = (await model()).map((i) => i.id); await openTile(id);
    for (const [label, ent] of list) { const row = `dialog[open] .ef-slot[data-slot="${label}"]`; await page.click(`${row} [data-k=iqp-choose]`); await page.waitForTimeout(200);
      await page.fill(`${row} .iqp__search`, ent); await page.waitForTimeout(250); await page.click(`${row} .iqp__item[data-entity="${ent}"]`); await page.waitForTimeout(350); }
    await page.click('dialog[open] .ecfg-foot button:has-text("Next")'); await page.waitForTimeout(300); await page.click('dialog[open] .ecfg-add'); await page.waitForTimeout(700);
    return (await model()).find((i) => !ids0.includes(i.id));
  };
  const posts = (from) => L.haCalls.filter((c, i) => i >= from && c.method === 'POST' && /\/api\/services\//.test(c.url));
  const DOMAIN = /Stove|Temperature|Climate|Heat|Auto\b|Brightness|Power|Humidity|Thermostat|"heat"|"auto"|"off"|mdi:fire|mdi:power|thermostat/;

  // ================================================================ CLEAN STUDIO TEST — every primitive, no configuration
  await E(() => window.IniqStudioLibrary.createCollection('Clean'));
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S);
  await page.click(`${S} [data-k=wst-new-empty]`); await page.waitForTimeout(300);
  await page.click(`${S} [data-k=wst-snap-smart]`);
  await select(null); await setPlain('name', 'Clean Studio Test'); await setSel('category', 'controls');
  const ids = {};
  for (const [t, x, y, w, h] of [['dial', 8, 8, 110, 110], ['information', 124, 8, 150, 52], ['text', 124, 64, 120, 40], ['segmented', 8, 124, 260, 40], ['slider', 8, 172, 220, 36], ['button', 280, 124, 64, 64]]) { ids[t] = await add(t); await place(x, y, w, h); }
  const look = {};
  for (const [t, id] of Object.entries(ids)) {
    await select(id);
    look[t] = { name: (await comp(id)).name, bound: !!(await comp(id)).binding, prop: await E((k) => document.querySelector(`${k} select`)?.value ?? null, F('binding.property')), truth: await truth(), cfg: (await comp(id)).config, data: (await comp(id)).data };
  }
  check('DROPPED Dial / Information / Slider: Property None — "Display only" / "Not connected to Home Assistant" says the Data section',
    ['dial', 'information', 'slider'].every((t) => !look[t].bound && look[t].prop === '' && /Not connected|Display only/.test(look[t].truth)) && look.dial.name === 'Dial1' && look.information.name === 'Information1' && look.slider.name === 'Slider1', JSON.stringify(look));
  check('DROPPED Value / Text: Static "Text", no property', !look.text.bound && look.text.cfg.mode === 'static' && look.text.cfg.text === 'Text' && look.text.name === 'ValueText1');
  check('DROPPED Action Button: "Button1", label "Button", a neutral icon, NO action — "Display only — not connected…"', look.button.name === 'Button1' && !look.button.bound && look.button.cfg.label === 'Button' && look.button.cfg.icon === 'mdi:gesture-tap-button' && /Display only/.test(look.button.truth), JSON.stringify(look.button));
  check('DROPPED Segmented control: neutral Option 1 / Option 2 — no Heat / Auto / Off, no values, no icons, no action', JSON.stringify(look.segmented.cfg.options) === JSON.stringify([{ id: 'option-1', label: 'Option 1' }, { id: 'option-2', label: 'Option 2' }])
    && !look.segmented.bound && /Display only/.test(look.segmented.truth), JSON.stringify(look.segmented.cfg));
  check('DROPPED Information: generic "Value" / "Label" content, no realistic data', look.information.cfg.label === 'Label' && look.information.data.value === 'Value');
  const r0 = await E((S) => document.querySelector(S).studio.save(), S);
  const cleanId = (await state()).defId;
  const clean = await stored(cleanId);
  const json = JSON.stringify(clean);
  check('SAVED CLEAN DEFINITION: schema 2, no properties, no sources, no component binding — and its JSON names no domain (no Stove / Temperature / Climate / Heat / Auto / Off / Brightness / Power…)',
    r0.ok && clean.schema === 2 && clean.properties.length === 0 && clean.slots.length === 0 && clean.components.every((c) => !c.binding) && !DOMAIN.test(json), (json.match(DOMAIN) || [''])[0]);
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);
  await openTile(cleanId);
  const cleanRows = await cfgRows();
  await page.click('dialog[open] .ecfg-foot button:has-text("Next")'); await page.waitForTimeout(300); const ids0 = (await model()).map((i) => i.id); await page.click('dialog[open] .ecfg-add'); await page.waitForTimeout(700);
  const cleanCopy = (await model()).find((i) => !ids0.includes(i.id));
  check('CONFIGURE (clean widget): asks for NOTHING — no source, no entity row: it has no Widget Property', cleanRows.length === 0 && JSON.stringify(cleanCopy.config.entities || {}) === '{}', JSON.stringify(cleanRows));
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(1200);
  const RTc = `[data-grid-id="${cleanCopy.id}"] .stw`;
  await page.locator(RTc).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  let n0 = L.haCalls.length;
  await page.click(`${RTc} .stw__c[data-cid="${ids.segmented}"] [data-id="option-2"]`); await page.waitForTimeout(500);
  await page.click(`${RTc} .stw__c[data-cid="${ids.button}"] .iqc-btn`); await page.waitForTimeout(500);
  await page.focus(`${RTc} .stw__c[data-cid="${ids.slider}"] input`); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(600);
  check('PLACED CLEAN WIDGET: choosing Option 2, pressing the button, moving the slider — NO Home Assistant call (unbound primitives act on nothing)', posts(n0).length === 0, JSON.stringify(posts(n0)));

  // ================================================================ DELIBERATE CLIMATE — only now do Heat / Auto / Off mean something
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(300);
  await page.selectOption(`${S} [data-k=wst-widget]`, `def:${cleanId}`); await page.waitForTimeout(600);
  await newProperty({ name: 'Room Temperature', family: 'climate', value: 'Current temperature', newSource: 'Climate', preview: 'climate.living_room' });
  await newProperty({ name: 'HVAC Mode', family: 'climate', value: 'State (HVAC mode)', source: 'Climate' });
  for (const t of ['dial', 'information']) { await select(ids[t]); await useProp('Room Temperature'); }
  await select(ids.text); await setSel('mode', 'value'); await useProp('Room Temperature');
  await select(ids.segmented);
  const segOpts = await propOptions();
  await useProp('HVAC Mode');
  const segTruth = await truth();
  await until(({ S, id }) => !document.querySelector(S).studio.state().def.components.find((c) => c.id === id).binding.auto, { S, id: ids.segmented });
  const sc = (await comp(ids.segmented)).config.options;
  await select(ids.button);
  const btnOpts = await propOptions();
  check('SEGMENTED property list offers only what it can SET as an option (HVAC Mode — not Room Temperature); bound, it says what it does: "Shows “HVAC Mode” and sets it when an option is chosen"',
    JSON.stringify(segOpts) === JSON.stringify(['None (preview data)', 'HVAC Mode', '+ New property…']) && /Shows “HVAC Mode” and sets it when an option is chosen/.test(segTruth), JSON.stringify({ segOpts, segTruth }));
  check('…its options become heat / auto / off ONLY now — from the HVAC Mode property\'s preview entity the designer chose (labels Heat / Auto / Off, values = the modes)',
    JSON.stringify(sc.map((o) => [o.label, o.value])) === JSON.stringify([['Heat', 'heat'], ['Auto', 'auto'], ['Off', 'off']]), JSON.stringify(sc));
  check('the BUTTON presses the climate entity (on / off): its list offers only the climate\'s STATE (HVAC Mode) — never Room Temperature', JSON.stringify(btnOpts) === JSON.stringify(['None (preview data)', 'HVAC Mode', '+ New property…']), JSON.stringify(btnOpts));
  const r1 = await E((S) => document.querySelector(S).studio.save(), S);
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);
  await openTile(cleanId);
  const climRows = await cfgRows(), climText = await cfgText();
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('CONFIGURE (from Widget Properties only): "Climate — Provides: Room Temperature, HVAC Mode", ONCE; no Stove Temperature, no Entity 2, no "Segmented control Value"',
    r1.ok && JSON.stringify(climRows) === JSON.stringify(['Climate — Provides: Room Temperature, HVAC Mode']) && !/Stove|Entity \d|Segmented control Value/.test(climText), JSON.stringify(climRows));
  const A = await placeCopy(cleanId, [['Climate', 'climate.living_room']]);
  const Bc = await placeCopy(cleanId, [['Climate', 'climate.br']]);
  await E(() => window.editor.save && window.editor.save()); await page.waitForTimeout(800);
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(1500);
  const RT = (id) => `[data-grid-id="${id}"] .stw`;
  await page.locator(RT(A.id)).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const shown = await until(({ a, b, ids }) => { const q = (r, c, s) => document.querySelector(`${r} .stw__c[data-cid="${c}"] ${s}`);
    return q(a, ids.dial, '.iqg')?.getAttribute('aria-valuenow') === '21.5' && /21\.5/.test(q(a, ids.information, '.iqf__v')?.textContent || '') && q(a, ids.text, '.iqtx')?.textContent === '21.5' && q(a, ids.segmented, '[aria-checked="true"]')?.dataset.id === 'heat'
      && q(b, ids.dial, '.iqg')?.getAttribute('aria-valuenow') === '18' && q(b, ids.segmented, '[aria-checked="true"]')?.dataset.id === 'off'; }, { a: RT(A.id), b: RT(Bc.id), ids }, 12000);
  check('RUNTIME: copy A (climate.living_room) — Dial 21.5, Information 21.5, Value / Text 21.5, segmented Heat; copy B (climate.br) — Dial 18, segmented Off', shown);
  n0 = L.haCalls.length;
  const segOf = (id, v) => `${RT(id)} .stw__c[data-cid="${ids.segmented}"] [data-id="${v}"]`;
  await page.click(segOf(A.id, 'auto')); await page.waitForTimeout(800);
  await page.click(segOf(A.id, 'off')); await page.waitForTimeout(800);
  await page.click(segOf(Bc.id, 'heat')); await page.waitForTimeout(800);
  const hv = posts(n0).filter((c) => /climate\/set_hvac_mode$/.test(c.url)).map((c) => JSON.parse(c.body));
  check('SEGMENTED ACTIONS through the existing secure layer (no service in the component): A Auto → set_hvac_mode auto, A Off → off (climate.living_room); B Heat → heat (climate.br)',
    JSON.stringify(hv.map((x) => [x.entity_id, x.hvac_mode])) === JSON.stringify([['climate.living_room', 'auto'], ['climate.living_room', 'off'], ['climate.br', 'heat']]), JSON.stringify(hv));

  // ================================================================ SENSOR ONLY — read-only: no control can act through it
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(300);
  await page.click(`${S} [data-k=wst-new]`); await page.waitForTimeout(300);
  await select(null); await setPlain('name', 'Sensor Display Test'); await setSel('category', 'sensors');
  await newProperty({ name: 'Temperature', family: 'sensor', value: 'State', newSource: 'Temperature Sensor', preview: 'sensor.temp_a' });
  const s = {};
  for (const [t, x, y, w, h] of [['dial', 8, 8, 110, 110], ['information', 124, 8, 150, 52], ['text', 124, 64, 120, 40], ['slider', 8, 130, 220, 36], ['segmented', 8, 172, 220, 40], ['button', 280, 124, 64, 64]]) { s[t] = await add(t); await place(x, y, w, h); }
  for (const t of ['dial', 'information']) { await select(s[t]); await useProp('Temperature'); }
  await select(s.text); await setSel('mode', 'value'); await useProp('Temperature');
  const lists = {};
  for (const t of ['slider', 'segmented', 'button']) { await select(s[t]); lists[t] = await propOptions(); }
  check('SENSOR (read-only): Slider, Segmented and Button are NOT offered "Temperature" — nothing can be set or pressed on a sensor',
    ['slider', 'segmented', 'button'].every((t) => JSON.stringify(lists[t]) === JSON.stringify(['None (preview data)', '+ New property…'])), JSON.stringify(lists));
  const r2 = await E((S) => document.querySelector(S).studio.save(), S);
  const sensorId = (await state()).defId;
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);
  await openTile(sensorId);
  const sRows = await cfgRows();
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('CONFIGURE (sensor widget): "Temperature Sensor — Provides: Temperature" only', r2.ok && JSON.stringify(sRows) === JSON.stringify(['Temperature Sensor — Provides: Temperature']), JSON.stringify(sRows));
  const SC = await placeCopy(sensorId, [['Temperature Sensor', 'sensor.temp_a']]);
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(1500);
  await page.locator(RT(SC.id)).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const sv = await until(({ r, s }) => { const q = (c, sel) => document.querySelector(`${r} .stw__c[data-cid="${c}"] ${sel}`); return q(s.dial, '.iqg')?.getAttribute('aria-valuenow') === '19.4' && /19\.4/.test(q(s.information, '.iqf__v')?.textContent || '') && q(s.text, '.iqtx')?.textContent === '19.4'; }, { r: RT(SC.id), s }, 10000);
  n0 = L.haCalls.length;
  await page.click(`${RT(SC.id)} .stw__c[data-cid="${s.button}"] .iqc-btn`); await page.waitForTimeout(400);
  await page.click(`${RT(SC.id)} .stw__c[data-cid="${s.segmented}"] [data-id="option-2"]`); await page.waitForTimeout(400);
  check('SENSOR RUNTIME: Dial / Information / Value / Text show 19.4 from sensor.temp_a; the unbound button and segmented reach NO Home Assistant', sv && posts(n0).length === 0, JSON.stringify(posts(n0)));

  // ================================================================ AUTHORITY + ONE-WAY MIGRATION — a Robin-style definition
  const auth = await E(() => {
    const IB = window.IniqBinding, g = { id: 's11111111', label: 'Stove Temperature', family: 'sensor', preview: 'sensor.stove_temperature' };
    // a schema-2 definition with a stray legacy slot binding: it means NOTHING (no requirement, no expansion)
    const d = { schema: 2, slots: [g], properties: [], components: [{ id: 'dial-1', type: 'dial', binding: { source: 'ha', slot: 's11111111', inputs: { value: { read: 'state' } } } }] };
    return { rows: IB.slotsOf(d), expanded: IB.expandComponent(d.components[0], d), migrated: IB.migrate(d) };
  });
  check('AUTHORITY: in today\'s form a stray legacy slot binding creates NO Configure requirement, expands to nothing and is dropped — only Widget Properties count',
    auth.rows.length === 0 && !auth.expanded.binding && !auth.migrated.components[0].binding && auth.migrated.slots.length === 0, JSON.stringify(auth));
  const refused = await E(async () => {
    const csrf = document.querySelector('meta[name="iniqdash-csrf"]').content, col = window.IniqStudioLibrary.collections()[0].id;
    const definition = { schema: 2, meta: { name: 'X', collection: col, category: 'controls', description: '', icon: 'mdi:home' }, canvas: { w: 360, h: 240 }, slots: [{ id: 's11111111', label: 'Stove Temperature' }], properties: [],
      components: [{ id: 'dial-1', name: 'Dial1', type: 'dial', x: 0, y: 0, w: 100, h: 100, config: {}, data: {}, binding: { source: 'ha', slot: 's11111111', inputs: { value: { read: 'state' } } } }] };
    return (await fetch('api/studio_widgets.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ action: 'save', id: null, definition }) })).status;
  });
  check('SERVER: a schema-2 definition with a non-property binding is refused (there is no second binding system)', refused === 400, String(refused));
  // a Robin-style OLDER definition (no schema): two properties from earlier work + a dial still on a legacy "Stove Temperature" slot, an
  // unused generated "Segmented control Value", and a segmented showing Heat / Auto / Off with NO binding
  const robin = await E(async () => {
    const csrf = document.querySelector('meta[name="iniqdash-csrf"]').content, col = window.IniqStudioLibrary.collections()[0].id;
    const definition = { meta: { name: 'Robin Climate', collection: col, category: 'climate', description: '', icon: 'mdi:radiator' }, canvas: { w: 360, h: 240 },
      slots: [{ id: 's22222222', label: 'Climate', family: 'climate', preview: 'climate.living_room' }, { id: 's11111111', label: 'Stove Temperature', preview: 'sensor.stove_temperature' }, { id: 's33333333', label: 'Segmented control', family: 'climate' }],
      properties: [{ id: 'p00000001', name: 'Room Temperature', group: 's22222222', read: 'derived', attribute: 'current_temperature' }, { id: 'p00000005', name: 'Segmented control Value', group: 's33333333', read: 'state' }],
      components: [{ id: 'dial-1', name: 'Dial1', type: 'dial', x: 8, y: 8, w: 150, h: 150, config: { preset: 'minimal', thickness: 6, arcColor: 'accent' }, data: {}, binding: { source: 'ha', slot: 's11111111', inputs: { value: { read: 'state' } } } },
        { id: 'information-1', name: 'Information1', type: 'information', x: 170, y: 8, w: 150, h: 60, config: { label: 'Room' }, data: {}, binding: { source: 'ha', property: 'p00000001' } },
        { id: 'segmented-1', name: 'Segmented1', type: 'segmented', x: 8, y: 180, w: 300, h: 40, config: { options: [{ id: 'heat', label: 'Heat', icon: 'mdi:fire' }, { id: 'auto', label: 'Auto' }, { id: 'off', label: 'Off' }], textSize: 15 }, data: {} }] };
    return (await (await fetch('api/studio_widgets.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ action: 'save', id: null, definition }) })).json()).widget.id;
  });
  await page.reload(); await page.waitForTimeout(1800);
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(300);
  await page.selectOption(`${S} [data-k=wst-widget]`, `def:${robin}`); await page.waitForTimeout(700);
  await select(null);
  const rowsOf = () => E((P) => [...document.querySelectorAll(`${P} [data-k=wst-prop]`)].map((p) => `${p.dataset.prop}: ${p.querySelector('[data-k=wst-propusers]').textContent}`), P);
  const m1 = await rowsOf();
  check('MIGRATION (once): the dial\'s legacy "Stove Temperature" slot becomes a property — its source is NAMED, with who uses it (Dial1); the unused generated "Segmented control Value" is gone',
    JSON.stringify(m1) === JSON.stringify(['Room Temperature: Used by: Information1', 'Stove Temperature: Used by: Dial1']), JSON.stringify(m1));
  await select('segmented-1');
  check('…the segmented showing Heat / Auto / Off has NO property: its Data says "Display only — not connected to Home Assistant"', /Display only/.test(await truth()) && !(await comp('segmented-1')).binding);
  await select(null);
  await page.click(`${P} [data-k=wst-prop][data-prop="Stove Temperature"] [data-k=wst-propdel]`); await page.waitForTimeout(200);
  const ask = await E((P) => document.querySelector(`${P} [data-k=wst-prop][data-prop="Stove Temperature"] [data-k=wst-propconfirm]`).textContent, P);
  await page.click(`${P} [data-k=wst-prop][data-prop="Stove Temperature"] [data-k=wst-propconfirm-ok]`); await page.waitForTimeout(300);
  const vis0 = (await state()).def.components.find((c) => c.id === 'dial-1');
  const r3 = await E((S) => document.querySelector(S).studio.save(), S);
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);
  await page.reload(); await page.waitForTimeout(1800);
  const after = await stored(robin);
  check('DELETE "Stove Temperature" (it names its user: "…used by 1 component (Dial1)") → saved as schema 2: the string is nowhere in the stored definition; Dial1 kept, styling intact, Property None',
    /Stove Temperature is used by 1 component \(Dial1\)/.test(ask) && r3.ok && after.schema === 2 && !/Stove/.test(JSON.stringify(after)) && !after.components.find((c) => c.id === 'dial-1').binding
      && vis0.config.preset === 'minimal' && after.components.find((c) => c.id === 'dial-1').config.thickness === 6 && after.components.find((c) => c.id === 'segmented-1').config.textSize === 15, ask);
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(300);
  await page.selectOption(`${S} [data-k=wst-widget]`, `def:${robin}`); await page.waitForTimeout(700);
  await select(null); const m2 = await rowsOf();
  await select('dial-1'); const dialOpts = await propOptions();
  const studioText = await E((S) => document.querySelector(S).textContent, S);
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);
  await openTile(robin);
  const mRows = await cfgRows(), mText = await cfgText();
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('AFTER RELOAD (never re-migrated): Studio lists only Room Temperature; the Dial\'s dropdown has no Stove Temperature; "Stove Temperature" appears nowhere in Studio or Configure; Configure asks for Climate only',
    JSON.stringify(m2) === JSON.stringify(['Room Temperature: Used by: Information1']) && JSON.stringify(dialOpts) === JSON.stringify(['None (preview data)', 'Room Temperature', '+ New property…'])
      && !/Stove/.test(studioText) && !/Stove/.test(mText) && JSON.stringify(mRows) === JSON.stringify(['Climate — Provides: Room Temperature']), JSON.stringify({ m2, dialOpts, mRows }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
