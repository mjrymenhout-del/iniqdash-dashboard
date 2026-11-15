/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO — WIDGET PROPERTIES BACKEND: the component-side "+ New property" creator, controls (Slider · Segmented · Button) through
// the existing secure action layer, Configure's compatibility warning, the server's checks, and the MIGRATION of every older Studio model
// (direct entities · entity slots · "Same as" bindings · "Entity 2") into properties + source groups — through the REAL editor and the
// REAL IniqDash server with a FAKE Home Assistant (tests/lib/live.mjs — not a real Home Assistant). The composed thermostat acceptance
// build is tests/studio-v2.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { live, liveBrowser, ENTITIES, RAW, FAKE_TOKEN } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

// ---------------------------------------------------------------- architecture (static)
{
  const renderers = ['components/gauge/gauge.js', 'components/text/text.js', 'components/slider/slider.js', 'components/controls/controls.js', 'components/artwork/artwork.js'].map(code).join('\n');
  check('ARCHITECTURE: the composable renderers never reach Home Assistant and name no HA domain', !/IniqHA|IniqBinding|api\/ha_|callService|fetch\(/.test(renderers)
    && !/\b(climate|light|switch|cover|media_player)\./.test(code('components/gauge/gauge.js') + code('components/text/text.js') + code('components/slider/slider.js')));
  const studio = code('components/studio/studio.js') + code('widgets/default/studio/studio.js');
  check('Studio (host + runtime) names no component, no HA domain and no HA call', !/(===?|case|\.get\()\s*['"`](information|button|segmented|dial|slider|icon|image)['"`]/.test(studio) && !/(type\s*===?|case|\.get\()\s*['"`]text['"`]/.test(studio)
    && !/\b(climate|light|sensor|switch|cover|media_player)\./.test(studio) && !/IniqHA\.|api\/ha_/.test(studio));
  check('the binding layer uses the EXISTING HA layer only (subscribe / inspect / call)', /HA\(\)\.subscribe/.test(code('components/ha/binding.js')) && /HA\(\)\.call/.test(code('components/ha/binding.js')) && !/WebSocket|fetch\(|api\/ha_|services\//.test(code('components/ha/binding.js')));
}

Object.assign(ENTITIES, {
  'sensor.stove_temperature': ['65', { name: 'Stove temperature', unit: '°C', dc: 'temperature' }],
  'sensor.stove_mode': ['eco', { name: 'Stove mode' }],
  'climate.lr': ['heat', { name: 'Living room climate', f: 1, cur: 21.5, target: 22, min: 7, max: 30, step: 0.5, modes: ['heat', 'off'] }],
  'sensor.room_humidity': ['48', { name: 'Room humidity', unit: '%', dc: 'humidity' }],
});
RAW['climate.lr'] = { entity_id: 'climate.lr', state: 'heat', last_changed: '2026-10-23T10:00:00+00:00', last_updated: '2026-10-23T10:05:00+00:00', attributes: { hvac_modes: ['heat', 'off'], min_temp: 7, max_temp: 30, current_temperature: 21.5, temperature: 22, friendly_name: 'Living room climate' } };

let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const S = 'dialog.wst[open]', P = `${S} .wst__props`, F = (k) => `${P} .ef-field[data-key="${k}"]`;
  const state = () => E((S) => document.querySelector(S).studio.state(), S);
  const comp = async (id) => (await state()).def.components.find((c) => c.id === id);
  const add = async (t) => { await page.click(`${S} [data-k=wst-add][data-type=${t}]`); await page.waitForTimeout(250); return (await state()).sel; };
  const select = async (id) => { await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id }); await page.waitForTimeout(200); };
  const box = async (k, v) => { await page.fill(`${P} [data-k=wst-${k}]`, String(v)); await page.press(`${P} [data-k=wst-${k}]`, 'Tab'); await page.waitForTimeout(120); };
  const place = async (x, y, w, h) => { await box('w', w); await box('h', h); await box('x', x); await box('y', y); };
  const setSel = async (k, v) => { await page.selectOption(`${F(k)} select`, v); await page.waitForTimeout(250); };
  const until = async (fn, arg, ms = 8000) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };
  const pick = async (root, id) => { await page.click(`${root} [data-k=iqp-choose]`); await page.waitForTimeout(250); await page.fill(`${root} .iqp__search`, id); await page.waitForTimeout(250);
    await page.click(`${root} .iqp__item[data-entity="${id}"]`); await page.waitForTimeout(500); };
  const stored = async () => E(async () => (await (await fetch('api/studio_widgets.php', { credentials: 'same-origin' })).json()));
  const model = () => E(() => window.editor.getModel().pages.flatMap((p) => p.items));
  /** "+ New property" on the SELECTED component: the creator opens under its Property field; the component then uses the new property */
  const newHere = async ({ name, family, gname, value }) => {
    await setSel('binding.property', '+new');
    await page.fill(`${P} [data-k=wst-pe-name]`, name); await page.selectOption(`${P} [data-k=wst-pe-family]`, family); await page.waitForTimeout(100);
    if (gname) await page.fill(`${P} [data-k=wst-pe-sname]`, gname);
    await page.selectOption(`${P} [data-k=wst-pe-value]`, { label: value }); await page.click(`${P} [data-k=wst-pe-save]`); await page.waitForTimeout(400);
  };

  // ================================================================ CONTROLS made from the component itself (+ New property)
  await E(() => window.IniqStudioLibrary.createCollection('Backend'));
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S);
  await page.click(`${S} [data-k=wst-new-empty]`); await page.waitForTimeout(300);
  await select(null); await page.fill(`${F('name')} input`, 'Controls Test'); await setSel('category', 'controls');
  const SL = await add('slider'); await place(8, 8, 220, 40);
  await setSel('binding.property', '+new');
  const fams = await E((P) => [...document.querySelectorAll(`${P} [data-k=wst-pe-family] option`)].map((o) => o.value), P);
  const vals = async () => E((P) => [...document.querySelectorAll(`${P} [data-k=wst-pe-value] option`)].map((o) => o.textContent), P);
  await page.selectOption(`${P} [data-k=wst-pe-family]`, 'light'); await page.waitForTimeout(100);
  const lightVals = await vals();
  check('+ NEW PROPERTY from a Slider: the creator offers only families / values a slider can SET (light → Brightness; no sensor family)', fams.includes('light') && fams.includes('climate') && !fams.includes('sensor') && JSON.stringify(lightVals) === JSON.stringify(['Brightness']), JSON.stringify({ fams, lightVals }));
  await page.click(`${P} [data-k=wst-pe-cancel]`); await page.waitForTimeout(200);
  check('…Cancel: nothing created, the slider keeps no property', (await state()).def.properties.length === 0 && !(await comp(SL)).binding);
  await newHere({ name: 'Brightness', family: 'light', gname: 'Kitchen Light', value: 'Brightness' });
  let st = await state();
  check('…Create "Brightness" (light, group "Kitchen Light"): the slider now uses it — its source group, family and value stored, no entity',
    st.def.properties.length === 1 && st.def.properties[0].name === 'Brightness' && st.def.slots[0].label === 'Kitchen Light' && st.def.slots[0].family === 'light'
      && JSON.stringify((await comp(SL)).binding) === JSON.stringify({ source: 'ha', property: st.def.properties[0].id, auto: true }), JSON.stringify(st.def));
  const DL = await add('dial'); await place(240, 8, 100, 100);
  await newHere({ name: 'Stove Temperature', family: 'sensor', gname: 'Pellet Stove', value: 'State' });
  const SG = await add('segmented'); await place(8, 120, 220, 40);
  await newHere({ name: 'HVAC Mode', family: 'climate', gname: 'Climate', value: 'State (HVAC mode)' });
  const preview = async (prop, ent) => { await select(null); await page.click(`${P} [data-k=wst-prop][data-prop="${prop}"] [data-k=wst-propedit]`); await page.waitForTimeout(250);
    await pick(`${P} [data-k=wst-peditor]`, ent); await page.click(`${P} [data-k=wst-pe-save]`); await page.waitForTimeout(400); };
  await preview('HVAC Mode', 'climate.lr'); await preview('Brightness', 'light.kitchen');
  check('SETTLE: with preview entities, the segmented gets Heat / Off from climate.lr, the slider its 1–100 range — prefilled, editable configuration',
    await until(({ S }) => { const c = document.querySelector(S).studio.state().def.components; return c.every((x) => !x.binding || !x.binding.auto || x.type === 'dial'); }, { S })
      && JSON.stringify((await comp(SG)).config.options.map((o) => o.value)) === JSON.stringify(['heat', 'off']) && (await comp(SL)).data.min === 1 && (await comp(SL)).data.max === 100);
  const r1 = await E((S) => document.querySelector(S).studio.save(), S);
  const ctlId = (await state()).defId;
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);
  // Configure: a non-numeric sensor for the Dial's Pellet Stove group is NAMED
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click()); await page.waitForSelector('.ecfg-tile'); await page.waitForTimeout(200);
  await page.selectOption('dialog[open] [data-filter=collection]', 'all'); await page.selectOption('dialog[open] [data-filter=category]', 'all');
  await page.click(`.ecfg-tile[data-type="my:${ctlId}"]`); await page.waitForTimeout(600);
  const assign = async (label, ent) => { const row = `dialog[open] .ef-slot[data-slot="${label}"]`; await page.click(`${row} [data-k=iqp-choose]`); await page.waitForTimeout(200);
    await page.fill(`${row} .iqp__search`, ent); await page.waitForTimeout(250); await page.click(`${row} .iqp__item[data-entity="${ent}"]`); await page.waitForTimeout(350); };
  await assign('Pellet Stove', 'sensor.stove_mode');
  const warned = await until(() => /does not report a numeric state/.test(document.querySelector('dialog[open] .ef-slot[data-slot="Pellet Stove"] [data-k=slot-warning]')?.textContent || ''), null, 6000);
  await assign('Pellet Stove', 'sensor.stove_temperature'); await page.waitForTimeout(400);
  check('COMPATIBILITY: "Stove mode" (eco) for the Dial\'s Pellet Stove group is named ("…does not report a numeric state…"); a temperature sensor clears it',
    r1.ok && warned && await E(() => document.querySelector('dialog[open] .ef-slot[data-slot="Pellet Stove"] [data-k=slot-warning]').hidden));
  await assign('Kitchen Light', 'light.kitchen'); await assign('Climate', 'climate.lr');
  const ids0 = (await model()).map((i) => i.id);
  await page.click('dialog[open] .ecfg-foot button:has-text("Next")'); await page.waitForTimeout(300); await page.click('dialog[open] .ecfg-add'); await page.waitForTimeout(700);
  const cp = (await model()).find((i) => !ids0.includes(i.id));
  await E(() => window.editor.save && window.editor.save()); await page.waitForTimeout(800);
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(1500);
  const RT = `[data-grid-id="${cp.id}"] .stw`;
  await page.locator(RT).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const shown = await until(({ r }) => document.querySelector(`${r} .stw__c[data-cid="dial-1"] .iqg`)?.getAttribute('aria-valuenow') === '65' && document.querySelector(`${r} .stw__c[data-cid="slider-1"] input`)?.value === '39', { r: RT }, 10000);
  let n0 = L.haCalls.length;
  await page.focus(`${RT} .stw__c[data-cid="slider-1"] input`); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(900);
  await page.click(`${RT} .stw__c[data-cid="segmented-1"] [data-id="off"]`); await page.waitForTimeout(900);
  const calls = (re) => L.haCalls.filter((c, i) => i >= n0 && c.method === 'POST' && re.test(c.url)).map((c) => JSON.parse(c.body));
  const lt = calls(/\/light\/turn_on$/), hv = calls(/\/climate\/set_hvac_mode$/);
  check('RUNTIME CONTROLS: dial 65 (Stove Temperature), slider 39 (Brightness); the slider → light.turn_on { brightness_pct: 40 } for light.kitchen; the segmented → set_hvac_mode off for climate.lr — the existing secure layer',
    shown && lt.length === 1 && lt[0].entity_id === 'light.kitchen' && lt[0].brightness_pct === 40 && hv.length === 1 && hv[0].entity_id === 'climate.lr' && hv[0].hvac_mode === 'off', JSON.stringify({ lt, hv }));

  // ================================================================ SERVER checks
  const res = await E(async () => {
    const csrf = document.querySelector('meta[name="iniqdash-csrf"]').content, col = window.IniqStudioLibrary.collections()[0].id;
    const save = async (definition) => (await fetch('api/studio_widgets.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ action: 'save', id: null, definition }) })).status;
    const g = { id: 's0000abcd', label: 'Climate', family: 'climate' }, p = { id: 'p0000abcd', name: 'Room', group: 's0000abcd', read: 'derived', attribute: 'current_temperature' };
    const base = (o = {}) => ({ meta: { name: 'X', collection: col, category: 'controls', description: '', icon: 'mdi:home' }, canvas: { w: 360, h: 240 }, slots: [g], properties: [p],
      components: [{ id: 'dial-1', name: 'dialRoom', type: 'dial', x: 0, y: 0, w: 100, h: 100, config: {}, data: {}, binding: { source: 'ha', property: 'p0000abcd' } }], ...o });
    const c = (x) => base({ components: [{ ...base().components[0], ...x }] });
    return { ok: await save(base()), missingProp: await save(c({ binding: { source: 'ha', property: 'p1111abcd' } })), propEntity: await save(c({ binding: { source: 'ha', property: 'p0000abcd', entity: 'climate.lr' } })),
      dupProp: await save(base({ properties: [p, { ...p, id: 'p2222abcd' }] })), badGroup: await save(base({ properties: [{ ...p, group: 's9999abcd' }] })), badFamily: await save(base({ slots: [{ ...g, family: 'Climate!' }] })),
      badName: await save(c({ name: '1dial' })), dupName: await save(base({ components: [base().components[0], { ...base().components[0], id: 'dial-2' }] })), stateAttr: await save(base({ properties: [{ ...p, read: 'state' }] })) };
  });
  check('SERVER: a property definition is valid; refused — a binding to a missing property, an entity in a binding, two properties with one name, a property in a missing group, a malformed family, an invalid or duplicate component name, an attribute on a state read',
    res.ok === 200 && Object.entries(res).filter(([k]) => k !== 'ok').every(([, v]) => v === 400), JSON.stringify(res));

  // ================================================================ MIGRATION of every older Studio model
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  const old = await E(async () => {
    const csrf = document.querySelector('meta[name="iniqdash-csrf"]').content, col = window.IniqStudioLibrary.collections()[0].id;
    const save = async (definition) => (await (await fetch('api/studio_widgets.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ action: 'save', id: null, definition }) })).json()).widget.id;
    const meta = (name) => ({ name, collection: col, category: 'climate', description: '', icon: 'mdi:radiator' }), canvas = { w: 360, h: 240 };
    // the ENTITY-SLOT model: "Stove Temperature" (a dial), "Heating" (a segmented; preview climate.lr), and "Entity 2" — a dial and an
    // information "Same as" it (the same read: one property) plus a text on another read of it (a second property)
    const slotted = await save({ meta: meta('Robin Climate'), canvas, slots: [{ id: 's11111111', label: 'Stove Temperature', preview: 'sensor.stove_temperature' }, { id: 's22222222', label: 'Heating', preview: 'climate.lr' },
      { id: 's33333333', label: 'Entity 2', preview: 'climate.living_room' }, { id: 's44444444', label: 'Spare' }, { id: 's55555555', label: 'Entity 3' }],
      components: [{ id: 'dial-1', type: 'dial', x: 0, y: 0, w: 100, h: 100, config: { design: 'minimal' }, data: {}, binding: { source: 'ha', slot: 's11111111', inputs: { value: { read: 'state' } } } },
        { id: 'segmented-1', type: 'segmented', x: 110, y: 0, w: 200, h: 40, config: { options: [{ id: 'heat', label: 'Heat', value: 'heat' }, { id: 'off', label: 'Off', value: 'off' }] }, data: {}, binding: { source: 'ha', slot: 's22222222', inputs: { selected: { read: 'state' } }, action: { action: 'set_hvac_mode' } } },
        { id: 'dial-2', type: 'dial', x: 0, y: 110, w: 100, h: 100, config: {}, data: {}, binding: { source: 'ha', slot: 's33333333', inputs: { value: { read: 'attribute', attribute: 'current_temperature' } } } },
        { id: 'information-1', type: 'information', x: 110, y: 110, w: 150, h: 60, config: {}, data: {}, binding: { source: 'ha', slot: 's33333333', shared: true, inputs: { value: { read: 'attribute', attribute: 'current_temperature' } } } },
        { id: 'text-1', type: 'text', x: 110, y: 180, w: 150, h: 40, config: { mode: 'value' }, data: {}, binding: { source: 'ha', slot: 's33333333', shared: true, inputs: { value: { read: 'state' } } } },
        { id: 'information-2', type: 'information', x: 200, y: 0, w: 150, h: 60, config: {}, data: {}, binding: { source: 'ha', slot: 's55555555', inputs: { value: { read: 'state' } } } }] });
    const direct = await save({ meta: meta('Old Humidity'), canvas, components: [{ id: 'information-1', type: 'information', x: 10, y: 10, w: 170, h: 64, config: { label: 'Humidity' }, data: {}, binding: { source: 'ha', inputs: { value: { entity: 'sensor.room_humidity', read: 'state' } } } }] });
    return { slotted, direct };
  });
  await page.reload(); await page.waitForTimeout(1800);
  const mig = await E(({ slotted, direct }) => { const L0 = window.IniqStudioLibrary, a = L0.get(slotted).definition, b = L0.get(direct).definition;
    return { slots: a.slots, props: a.properties, binds: a.components.map((c) => c.binding), configure: L0.slots(slotted).map((x) => [x.label, x.provides]), direct: { slots: b.slots, props: b.properties, bind: b.components[0].binding } }; }, old);
  const pn = Object.fromEntries(mig.props.map((p) => [p.name, p]));
  check('MIGRATION (entity slots): deliberate names stay — "Stove Temperature" (sensor), "Heating" (climate, from its preview) — each slot id kept as its source group, preview kept',
    JSON.stringify(mig.slots.slice(0, 2).map((g) => [g.id, g.label, g.family, g.preview])) === JSON.stringify([['s11111111', 'Stove Temperature', 'sensor', 'sensor.stove_temperature'], ['s22222222', 'Heating', 'climate', 'climate.lr']])
      && pn['Stove Temperature'] && pn['Stove Temperature'].group === 's11111111' && pn.Heating && pn.Heating.group === 's22222222', JSON.stringify(mig));
  check('MIGRATION ("Entity 2" with a preview + "Same as"): the dial and the information that were "Same as" each other now REFERENCE one property ("Current temperature"); the text\'s other read is a second one ("HVAC mode") — in a source group named from its preview entity ("Living room"), never "Entity 2"',
    mig.binds[2].property === mig.binds[3].property && mig.binds[4].property !== mig.binds[2].property && mig.props.find((p) => p.id === mig.binds[2].property).name === 'Current temperature'
      && mig.props.find((p) => p.id === mig.binds[4].property).name === 'HVAC mode' && mig.slots[2].id === 's33333333' && mig.slots[2].label === 'Living room' && mig.slots[2].family === 'climate'
      && !mig.props.some((p) => /Entity \d|Value$/.test(p.name)) && mig.binds.slice(0, 5).every((b) => b.property && !b.slot && !b.shared), JSON.stringify(mig));
  check('MIGRATION CLEANUP: the never-completed "Entity 3" (a generated name, no preview) is an ORPHAN — its information goes back to no property, no junk property is made; the unused "Spare" is gone too',
    !mig.binds[5] && mig.props.length === 4 && !mig.slots.some((g) => /Entity|Spare/.test(g.label)) && mig.slots.length === 3, JSON.stringify(mig));
  check('MIGRATION → Configure: one row per source group, with what it provides', JSON.stringify(mig.configure) === JSON.stringify([['Stove Temperature', ['Stove Temperature']], ['Heating', ['Heating']], ['Living room', ['Current temperature', 'HVAC mode']]]), JSON.stringify(mig.configure));
  check('MIGRATION (direct entities): the entity → a source group (its preview only) and a property', mig.direct.slots.length === 1 && mig.direct.slots[0].preview === 'sensor.room_humidity' && mig.direct.slots[0].family === 'sensor'
    && mig.direct.props.length === 1 && mig.direct.bind.property === mig.direct.props[0].id, JSON.stringify(mig.direct));
  // an older COPY (its entities keyed by the slot ids) keeps working: the source groups kept those ids
  await E((id) => { const m = window.editor.getModel(), pg = m.pages[0], any = pg.items.find((i) => i.layout);
    pg.items.push({ id: 'old-copy', type: 'studio', parent: null, config: { definition: id, entities: { s11111111: 'sensor.stove_temperature', s22222222: 'climate.lr', s33333333: 'climate.lr' } }, layout: structuredClone(any.layout) }); window.editor.setModel(m); }, old.slotted);
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(1500);
  await page.locator('[data-grid-id="old-copy"]').scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const oc = await until(() => { const q = (c, s) => document.querySelector(`[data-grid-id="old-copy"] .stw__c[data-cid="${c}"] ${s}`);
    return q('dial-1', '.iqg')?.getAttribute('aria-valuenow') === '65' && q('dial-2', '.iqg')?.getAttribute('aria-valuenow') === '21.5' && q('segmented-1', '[aria-checked="true"]')?.dataset.id === 'heat' && q('text-1', '.iqtx')?.textContent === 'heat'; }, null, 10000);
  check('MIGRATION — an older placed COPY keeps its entities and renders through the migrated properties (no data loss): 65 · 21.5 · Heat · "heat"', oc,
    JSON.stringify(await E(() => ['dial-1', 'dial-2', 'segmented-1', 'text-1'].map((c) => document.querySelector(`[data-grid-id="old-copy"] .stw__c[data-cid="${c}"]`)?.textContent + '|' + document.querySelector(`[data-grid-id="old-copy"] .stw__c[data-cid="${c}"] .iqg`)?.getAttribute('aria-valuenow')))));
  // open it in Studio: names given, saved in the new form
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(300);
  await page.selectOption(`${S} [data-k=wst-widget]`, `def:${old.slotted}`); await page.waitForTimeout(600);
  st = await state();
  const r2 = await E((S) => document.querySelector(S).studio.save(), S);
  const saved = (await stored()).widgets.find((w) => w.id === old.slotted).definition;
  check('…opened in Studio: components get VB-style names (Dial1, Segmented1, Dial2, Information1, ValueText1, Information2); saved in the new form (properties + source groups, property references)',
    JSON.stringify(st.def.components.map((c) => c.name)) === JSON.stringify(['Dial1', 'Segmented1', 'Dial2', 'Information1', 'ValueText1', 'Information2']) && r2.ok
      && Array.isArray(saved.properties) && saved.properties.length === 4 && saved.components.slice(0, 5).every((c) => c.binding && c.binding.property && !c.binding.slot) && !saved.components[5].binding && JSON.stringify(saved.slots.map((g) => g.id)) === JSON.stringify(['s11111111', 's22222222', 's33333333']), JSON.stringify({ names: st.def.components.map((c) => c.name), r2 }));
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);
  const disk = fs.readdirSync(path.join(L.priv, 'studio-widgets')).map((f) => fs.readFileSync(path.join(L.priv, 'studio-widgets', f), 'utf8')).join('\n');
  check('SECURITY: no Home Assistant URL / token or service data in any stored definition', !disk.includes(FAKE_TOKEN) && !disk.includes(L.haUrl) && !/services\/|"service"|Bearer/i.test(disk));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
