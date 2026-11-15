/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO V2 — a VB6-style form designer: independent CONTROLS (stable id + unique Name) on a canvas, a type-specific PROPERTY SHEET,
// named WIDGET PROPERTIES ("Room Temperature": Climate · Current temperature) grouped in SOURCE GROUPS ("Climate": one entity a placed copy
// chooses), components REFERENCING properties — never each other. Through the REAL editor and the REAL IniqDash server (sessions, CSRF,
// private storage, the server-side HA layer) with a FAKE Home Assistant (tests/lib/live.mjs — not a real Home Assistant).
// The acceptance build: "Studio Climate Test" — dialRoomTemp, txtRoomTemp, lblRoom, txtTarget, segMode, txtOutside, btnPower — then
// preview, the shared-property test (delete txtRoomTemp, the dial keeps working), save / browser reload, Configure (ONE row per source
// group, what it provides), two placed copies with different entities, dashboard reload. Screenshots: $SHOTS (optional).
import fs from 'node:fs';
import path from 'node:path';
import { live, liveBrowser, ENTITIES, FAKE_TOKEN } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
{
  const st = code('components/studio/studio.js') + code('components/ha/binding.js');
  check('NO "Same as" / "Own entity" / "Entity N" / slot UX left in Studio or the binding layer', !/Same as|Own entity|Entity slot|New entity slot|Binding name/.test(st));
}

const climate = (name, st, cur, target) => [st, { name, f: 1, cur, target, min: 7, max: 30, step: 0.5, modes: ['heat', 'auto', 'off'] }];
Object.assign(ENTITIES, {
  'climate.studio_preview': climate('Studio preview climate', 'auto', 20, 22),
  'climate.lr': climate('Living room climate', 'heat', 21.5, 23), 'climate.br': climate('Bedroom climate', 'off', 18, 19),
  'sensor.outside_preview': ['9', { name: 'Preview outside', unit: '°C', dc: 'temperature' }],
  'sensor.outside_a': ['12.3', { name: 'Outside A', unit: '°C', dc: 'temperature' }], 'sensor.outside_b': ['4.1', { name: 'Outside B', unit: '°C', dc: 'temperature' }],
  'switch.boiler': ['off', { name: 'Boiler' }], 'switch.boiler2': ['off', { name: 'Boiler 2' }],
});

let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const S = 'dialog.wst[open]', P = `${S} .wst__props`, F = (k) => `${P} .ef-field[data-key="${k}"]`;
  const state = () => E((S) => document.querySelector(S).studio.state(), S);
  const comp = async (id) => (await state()).def.components.find((c) => c.id === id);
  const byName = async (n) => (await state()).def.components.find((c) => c.name === n);
  const add = async (t) => { await page.click(`${S} [data-k=wst-add][data-type=${t}]`); await page.waitForTimeout(250); return (await state()).sel; };
  const select = async (id) => { await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id }); await page.waitForTimeout(200); };
  const box = async (k, v) => { await page.fill(`${P} [data-k=wst-${k}]`, String(v)); await page.press(`${P} [data-k=wst-${k}]`, 'Tab'); await page.waitForTimeout(120); };
  const place = async (x, y, w, h) => { await box('w', w); await box('h', h); await box('x', x); await box('y', y); };
  const setSel = async (k, v) => { await page.selectOption(`${F(k)} select`, v); await page.waitForTimeout(250); };
  const setNum = async (k, v) => { const i = `${F(k)} input.ef-range__n`; await page.fill(i, String(v)); await page.press(i, 'Enter'); await page.waitForTimeout(120); };
  const setPlain = async (k, v) => { await page.fill(`${F(k)} input`, String(v)); await page.waitForTimeout(200); };
  const setCol = async (k, v) => { await page.click(`${F(k)} .ef-icon[data-value="${v}"]`); await page.waitForTimeout(120); };
  const rename = async (n) => { await page.fill(`${P} [data-k=wst-cname]`, n); await page.waitForTimeout(150); };
  const useProp = async (label) => { await page.selectOption(`${F('binding.property')} select`, { label }); await page.waitForTimeout(350); };
  const propOptions = () => E((k) => [...document.querySelectorAll(`${k} option`)].map((o) => o.textContent), `${F('binding.property')} select`);
  const until = async (fn, arg, ms = 8000) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };
  const pick = async (root, id) => { await page.click(`${root} [data-k=iqp-choose]`); await page.waitForTimeout(250); await page.fill(`${root} .iqp__search`, id); await page.waitForTimeout(250);
    await page.click(`${root} .iqp__item[data-entity="${id}"]`); await page.waitForTimeout(500); };
  const sheet = () => E((P) => [...document.querySelectorAll(`${P} details[data-group]`)].filter((d) => !d.hidden).map((d) => d.dataset.group), P);
  const visibleKeys = () => E((P) => [...document.querySelectorAll(`${P} .ef-field[data-key]`)].filter((f) => !f.hidden && f.offsetParent).map((f) => f.dataset.key), P);
  /** the widget's DATA PROPERTIES manager: + Add property → the creator */
  const newProperty = async ({ name, family, group, value, gname }) => {
    await page.click(`${P} [data-k=wst-prop-add]`); await page.waitForTimeout(200);
    await page.fill(`${P} [data-k=wst-pe-name]`, name);
    await page.selectOption(`${P} [data-k=wst-pe-family]`, family); await page.waitForTimeout(100);
    if (group) await page.selectOption(`${P} [data-k=wst-pe-source]`, { label: group }); else if (gname) await page.fill(`${P} [data-k=wst-pe-sname]`, gname);
    await page.selectOption(`${P} [data-k=wst-pe-value]`, { label: value }); await page.waitForTimeout(100);
    await page.click(`${P} [data-k=wst-pe-save]`); await page.waitForTimeout(300);
  };
  /** Edit a property from the widget's Data properties: its editor, a change, Save */
  const editProperty = async (name, fn) => { await select(null); await page.click(`${P} [data-k=wst-prop][data-prop="${name}"] [data-k=wst-propedit]`); await page.waitForTimeout(250); await fn(`${P} [data-k=wst-peditor]`); await page.click(`${P} [data-k=wst-pe-save]`); await page.waitForTimeout(400); };
  const node = (id) => `${S} [data-k=wst-board] .stw__c[data-cid="${id}"]`;
  const shot = async (sel, name) => { if (SHOTS) await (await page.$(sel)).screenshot({ path: path.join(SHOTS, name) }); };

  // ================================================================ the widget: metadata, collection, category
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S);
  await page.click(`${S} [data-k=wst-new-empty]`); await page.waitForTimeout(300);
  await page.click(`${S} [data-k=wst-snap-smart]`);
  await select(null);
  await setPlain('name', 'Studio Climate Test');
  await page.click(`${S} [data-k=wst-collection-new]`); await page.fill(`${S} [data-k=wst-collection-name]`, 'Studio Tests'); await page.click(`${S} [data-k=wst-collection-create]`); await page.waitForTimeout(600);
  await setSel('category', 'climate');
  const colId = (await state()).def.meta.collection;

  // ================================================================ WIDGET PROPERTIES + SOURCE GROUPS (the widget's Data properties)
  await newProperty({ name: 'Room Temperature', family: 'climate', gname: 'Climate', value: 'Current temperature' });
  await newProperty({ name: 'Target Temperature', family: 'climate', group: 'Climate', value: 'Target temperature' });
  await newProperty({ name: 'HVAC Mode', family: 'climate', group: 'Climate', value: 'State (HVAC mode)' });
  await newProperty({ name: 'Outside Temperature', family: 'sensor', gname: 'Outside', value: 'State' });
  await newProperty({ name: 'Boiler Power', family: 'switch', gname: 'Boiler', value: 'On / off (state)' });
  let st = await state();
  const G = Object.fromEntries(st.def.slots.map((g) => [g.label, g])), Pp = Object.fromEntries(st.def.properties.map((p) => [p.name, p]));
  check('PROPERTIES: five named properties with stable ids (p + 8 hex) — Room / Target Temperature and HVAC Mode in ONE source group "Climate" (family climate), Outside Temperature in "Outside" (sensor), Boiler Power in "Boiler" (switch)',
    st.def.properties.length === 5 && st.def.properties.every((p) => /^p[0-9a-f]{8}$/.test(p.id)) && st.def.slots.length === 3 && G.Climate.family === 'climate' && G.Outside.family === 'sensor' && G.Boiler.family === 'switch'
      && ['Room Temperature', 'Target Temperature', 'HVAC Mode'].every((n) => Pp[n].group === G.Climate.id) && Pp['Outside Temperature'].group === G.Outside.id
      && JSON.stringify([Pp['Room Temperature'].read, Pp['Room Temperature'].attribute, Pp['Target Temperature'].attribute, Pp['HVAC Mode'].read]) === JSON.stringify(['derived', 'current_temperature', 'target_temperature', 'state']), JSON.stringify(st.def));
  const mgr = await E((P) => [...document.querySelectorAll(`${P} [data-k=wst-prop]`)].map((p) => `${p.dataset.prop} | ${p.querySelector('[data-k=wst-propmeta]').textContent} | ${p.querySelector('[data-k=wst-propsource]').textContent}`), P);
  check('the Data properties manager: one compact row per property — "Family · Value" and its Source — no ids anywhere', JSON.stringify(mgr) === JSON.stringify(['Room Temperature | Climate · Current temperature | Source: Climate',
    'Target Temperature | Climate · Target temperature | Source: Climate', 'HVAC Mode | Climate · State (HVAC mode) | Source: Climate', 'Outside Temperature | Sensor · State | Source: Outside', 'Boiler Power | Switch · On / off (state) | Source: Boiler'])
    && !(await E((P) => /\b[sp][0-9a-f]{8}\b/.test(document.querySelector(P).textContent), P)), JSON.stringify(mgr));
  await shot(`${S} .wst__col--r`, 'v2-data-properties.png');

  // ================================================================ CONTROLS: independent, named, no automatic property
  const D = await add('dial');
  check('NEW CONTROL: Dial1 — a stable id (dial-1), the VB-style name "Dial1", and Property: None (nothing assigned automatically)',
    D === 'dial-1' && (await comp(D)).name === 'Dial1' && !(await comp(D)).binding && await E((k) => document.querySelector(`${k} select`).value === '', F('binding.property')));
  check('…its property list offers only what a Dial can show (numbers): Room / Target / Outside Temperature — not HVAC Mode or Boiler Power — and "+ New property"',
    JSON.stringify(await propOptions()) === JSON.stringify(['None (preview data)', 'Room Temperature', 'Target Temperature', 'Outside Temperature', '+ New property…']), JSON.stringify(await propOptions()));
  await rename('dialRoomTemp'); await place(80, 8, 208, 208); await useProp('Room Temperature');
  // the Dial: Spectrum ring, then visibly its own
  const preset0 = JSON.stringify((await comp(D)).config);
  await setNum('start', 240); await setNum('sweep', 240); await setNum('thickness', 7); await setCol('trackColor', 'info'); await setCol('arcColor', 'accent');
  await setPlain('tickCount', 9); await setPlain('tickMinor', 2); await setSel('tickPos', 'inside'); await setNum('tickLen', 9); await setNum('tickWidth', 2);
  await setSel('markerStyle', 'triangle'); await setNum('markerSize', 15); await setSel('face', 'glass');
  const dc = (await comp(D)).config;
  check('DIAL from the Spectrum ring preset, then edited: start 240°, sweep 240°, thickness 7, track / value colours, 9 major + 2 minor inside ticks (length 9, thickness 2), a triangle marker (15), a glass face',
    JSON.parse(preset0).preset === 'spectrum' && dc.start === 240 && dc.sweep === 240 && dc.thickness === 7 && dc.trackColor === 'info' && dc.arcColor === 'accent' && dc.tickCount === 9 && dc.tickMinor === 2
      && dc.tickPos === 'inside' && dc.tickLen === 9 && dc.tickWidth === 2 && dc.markerStyle === 'triangle' && dc.markerSize === 15 && dc.face === 'glass'
      && await E((s) => { const g = document.querySelector(s + ' .iqg'); return g.querySelectorAll('.iqg__tick').length === 9 + 8 * 2 && g.querySelector('.iqg__marker').tagName === 'polygon' && g.textContent === ''; }, node(D)), JSON.stringify(dc));
  const T1 = await add('text');
  check('NEW Value / Text: "ValueText1", Static by default — no property', (await comp(T1)).name === 'ValueText1' && !(await comp(T1)).binding && (await comp(T1)).config.mode === 'static');
  await rename('txtRoomTemp'); await place(124, 84, 120, 52);
  await setSel('mode', 'value'); await useProp('Room Temperature'); await setPlain('suffix', '°C'); await setSel('decimals', '1'); await setNum('fontSize', 34); await setSel('fontWeight', '700');
  const T2 = await add('text'); await rename('lblRoom'); await place(144, 136, 80, 22); await setPlain('text', 'Room'); await setNum('fontSize', 13); await setCol('color', 'neutral');
  const T3 = await add('text'); await rename('txtTarget'); await place(120, 160, 128, 24); await setSel('mode', 'value'); await useProp('Target Temperature');
  await setPlain('prefix', 'Target'); await setPlain('suffix', '°C'); await setSel('decimals', '0'); await setNum('fontSize', 14);
  const SG = await add('segmented'); await rename('segMode'); await place(16, 224, 328, 40);
  check('SEGMENTED property list: only what it can SET as an option — HVAC Mode', JSON.stringify(await propOptions()) === JSON.stringify(['None (preview data)', 'HVAC Mode', '+ New property…']), JSON.stringify(await propOptions()));
  await useProp('HVAC Mode');
  const T4 = await add('text'); await rename('txtOutside'); await place(280, 8, 72, 24); await setSel('mode', 'value'); await useProp('Outside Temperature'); await setPlain('suffix', '°C'); await setNum('fontSize', 13);
  const BT = await add('button'); await rename('btnPower'); await place(300, 160, 52, 52);
  check('BUTTON property list: only what it can press — the climate\'s state (HVAC Mode: on / off) and Boiler Power; never a temperature', JSON.stringify(await propOptions()) === JSON.stringify(['None (preview data)', 'HVAC Mode', 'Boiler Power', '+ New property…']), JSON.stringify(await propOptions()));
  await useProp('Boiler Power');
  check('…its DATA shows Property + Action — None until the designer chooses one (Toggle / Turn on / Turn off from the switch family)', JSON.stringify((await visibleKeys()).filter((k) => k.startsWith('binding'))) === JSON.stringify(['binding.property', 'binding.press'])
    && JSON.stringify(await E((k) => [...document.querySelectorAll(`${k} option`)].map((o) => o.textContent), `${F('binding.press')} select`)) === JSON.stringify(['None', 'Toggle', 'Turn on', 'Turn off'])
    && await E((k) => document.querySelector(`${k} select`).value === '', F('binding.press')));
  await setSel('binding.press', 'toggle');
  const INFO = await add('information');
  check('NEW Information: "Information1", Property None — never another control\'s data', (await comp(INFO)).name === 'Information1' && !(await comp(INFO)).binding);
  const IMG = await add('image'); await place(8, 8, 48, 48);
  const ICO = await add('icon'); await place(8, 64, 40, 40);

  // ================================================================ the PROPERTY SHEET per type
  const sheets = {};
  for (const [k, id] of [['dial', D], ['text', T1], ['static', T2], ['segmented', SG], ['button', BT], ['information', INFO], ['image', IMG], ['icon', ICO]]) { await select(id); sheets[k] = { groups: await sheet(), keys: await visibleKeys() }; }
  const none = (k, re) => !sheets[k].keys.some((x) => re.test(x));
  check('PROPERTY SHEET — Dial: Identity · Data · Range · Arc · Ticks · Marker · Face · Preview value · Element style · Each copy sets · When… · Layout — no text formatting', JSON.stringify(sheets.dial.groups) === JSON.stringify(['identity', 'ha', 'range', 'arc', 'ticks', 'marker', 'face', 'data', 'estyle', 'copy', 'when', 'layout'])
    && none('dial', /^(fontSize|prefix|suffix|decimals|align|background)$/), JSON.stringify(sheets.dial));
  check('PROPERTY SHEET — Value / Text (property): Identity · Data (Mode, Property) · Content (prefix, suffix, decimals, fallback) · Text · Background · Preview value · Element style · Each copy sets · When… · Layout — no dial ticks / marker / arc',
    JSON.stringify(sheets.text.groups) === JSON.stringify(['identity', 'ha', 'content', 'typo', 'surface', 'data', 'estyle', 'copy', 'when', 'layout']) && ['mode', 'binding.property', 'prefix', 'suffix', 'decimals', 'fallback', 'fontSize', 'background'].every((x) => sheets.text.keys.includes(x))
      && none('text', /^(tick|marker|arc|preset|start|sweep|face)/), JSON.stringify(sheets.text));
  check('PROPERTY SHEET — Value / Text (static): its Property and formatting disappear — Mode and Text remain', sheets.static.keys.includes('mode') && sheets.static.keys.includes('text') && none('static', /^(binding\.|prefix|suffix|decimals|fallback|data\.)/) && !sheets.static.groups.includes('data'), JSON.stringify(sheets.static));
  check('PROPERTY SHEET — Segmented / Button / Information / Image / Icon: each its own groups (Identity, Data where it takes data, its editor\'s groups, Layout) — no dial or text groups',
    ['segmented', 'button', 'information', 'image', 'icon'].every((k) => sheets[k].groups[0] === 'identity' && sheets[k].groups[sheets[k].groups.length - 1] === 'layout' && !sheets[k].groups.some((g) => ['ticks', 'marker', 'face', 'typo', 'range'].includes(g)))
      && sheets.segmented.groups.includes('ha') && sheets.button.groups.includes('ha') && sheets.information.groups.includes('ha') && !sheets.image.groups.includes('ha') && !sheets.icon.groups.includes('ha')
      && none('image', /^binding/) && none('icon', /^binding/), JSON.stringify(sheets));
  // no internal terms in the sheet
  await select(T1);
  const words = await E((P) => document.querySelector(P).textContent, P);
  check('PROPERTY SHEET language: no slot / binding id / component id / attribute path / IniqBinding / compose', !/\bslot\b|binding id|\b[sp][0-9a-f]{8}\b|text-1|IniqBinding|compose|entityOf|current_temperature/i.test(words), words.slice(0, 300));
  // names: unique, validated, renaming keeps the binding
  await rename('dialRoomTemp');
  const nameErr = await E((P) => { const e = document.querySelector(`${P} [data-k=wst-cname-err]`); return e.hidden ? '' : e.textContent; }, P);
  check('NAME validation: "dialRoomTemp" is taken → "Another component has this name"; the text keeps its own name', /Another component has this name/.test(nameErr) && (await comp(T1)).name === 'txtRoomTemp', nameErr);
  await rename('txtRoomTemp');
  await select(D); await rename('dialLiving'); await page.waitForTimeout(100);
  const dl = await comp(D); await rename('dialRoomTemp');
  check('RENAME a control (dialRoomTemp → dialLiving → back): same id, same property', dl.id === 'dial-1' && dl.name === 'dialLiving' && dl.binding.property === Pp['Room Temperature'].id && (await comp(D)).name === 'dialRoomTemp');
  // duplicate: a new id and name, independent configuration
  await select(T2); await page.click(`${P} [data-k=wst-dup]`); await page.waitForTimeout(250);
  const dup = (await state()).sel; await setPlain('text', 'Copy');
  check('DUPLICATE lblRoom: a NEW id and name (ValueText…), its own configuration — editing the copy leaves lblRoom alone', dup !== T2 && /^ValueText\d+$/.test((await comp(dup)).name) && (await comp(dup)).config.text === 'Copy' && (await comp(T2)).config.text === 'Room');
  await page.click(`${P} [data-k=wst-del]`); await page.waitForTimeout(200);
  await select(INFO); await page.click(`${P} [data-k=wst-del]`); await page.waitForTimeout(200);
  // overlap: the text inside the dial, above it, selected on its own
  const ov = await E(({ S, D, T1 }) => { const st0 = document.querySelector(S).studio.state().def.components, d = st0.find((x) => x.id === D), t = st0.find((x) => x.id === T1), order = st0.map((x) => x.id);
    return { inside: t.x > d.x && t.y > d.y && t.x + t.w < d.x + d.w && t.y + t.h < d.y + d.h, above: order.indexOf(T1) > order.indexOf(D) }; }, { S, D, T1 });
  const board = await page.$(`${S} [data-k=wst-board]`), bb = await board.boundingBox(), cw = (await state()).def.canvas.w, tt = await comp(T1);
  await page.mouse.click(bb.x + (tt.x + tt.w / 2) * bb.width / cw, bb.y + (tt.y + tt.h / 2) * bb.width / cw); await page.waitForTimeout(200);
  const hitText = (await state()).sel;
  await page.mouse.click(bb.x + (88) * bb.width / cw, bb.y + (112) * bb.width / cw); await page.waitForTimeout(200);
  const hitDial = (await state()).sel;
  check('OVERLAP: txtRoomTemp sits inside dialRoomTemp, above it; clicking the text selects the TEXT, clicking the ring selects the DIAL — overlap implies no relationship', ov.inside && ov.above && hitText === T1 && hitDial === D, JSON.stringify({ ov, hitText, hitDial }));
  const tag = await E((S) => document.querySelector(`${S} [data-k=wst-sel] .wst__tag`).textContent, S);
  check('SELECTION: an outline, a resize grip and a small NAME tag ("dialRoomTemp" — not its id)', tag === 'dialRoomTemp' && await E((S) => !!document.querySelector(`${S} [data-k=wst-sel] [data-k=wst-resize]`), S), tag);

  // ================================================================ PREVIEW (design only) through the source groups
  await select(null);
  await editProperty('Room Temperature', (ed) => pick(ed, 'climate.studio_preview'));
  const prevOk = await until(({ S }) => { const q = (c, s) => document.querySelector(`${S} .stw__c[data-cid="${c}"] ${s}`);
    return q('dial-1', '.iqg')?.getAttribute('aria-valuenow') === '20' && q('text-1', '.iqtx')?.textContent === '20.0°C' && q('text-3', '.iqtx')?.textContent === 'Target 22°C' && q('segmented-1', '[aria-checked="true"]')?.dataset.id === 'auto'; }, { S }, 10000);
  check('PREVIEW: Climate\'s preview entity (climate.studio_preview) → dialRoomTemp 20, txtRoomTemp "20.0°C", txtTarget "Target 22°C", segMode Auto — all through the Climate group\'s properties; the dial\'s range 7–30 and the segmented\'s Heat / Auto / Off from it',
    prevOk && (await comp(D)).config.min === 7 && (await comp(D)).config.max === 30 && JSON.stringify((await comp(SG)).config.options.map((o) => o.value)) === JSON.stringify(['heat', 'auto', 'off']),
    JSON.stringify({ prevOk, d: [(await comp(D)).config.min, (await comp(D)).config.max, (await comp(D)).binding], sg: [(await comp(SG)).config.options, (await comp(SG)).binding] }));
  const t4before = await E((s) => document.querySelector(s + ' .iqtx').textContent, node(T4));
  await editProperty('Outside Temperature', (ed) => pick(ed, 'sensor.outside_preview'));
  check('PREVIEW: Outside\'s preview entity → txtOutside "9°C" on its own (it showed its preview value before)', await until(({ s }) => document.querySelector(s + ' .iqtx')?.textContent === '9°C', { s: node(T4) }, 8000) && t4before !== '9°C', t4before);
  await select(null); await shot(`${S} .wst__board`, 'v2-studio-canvas.png');

  // ================================================================ THE SHARED-PROPERTY TEST
  await select(T1); await page.click(`${P} [data-k=wst-del]`); await page.waitForTimeout(300);
  st = await state();
  const dialStill = await E((s) => document.querySelector(s + ' .iqg')?.getAttribute('aria-valuenow'), node(D));
  check('DELETE txtRoomTemp: dialRoomTemp keeps working (20) — it references the PROPERTY Room Temperature, not the text; the property stays', dialStill === '20' && st.def.properties.some((p) => p.name === 'Room Temperature') && (await comp(D)).binding.property === Pp['Room Temperature'].id);
  await select(null);
  const users = await E((P) => [...document.querySelectorAll(`${P} [data-k=wst-prop]`)].map((p) => `${p.dataset.prop}: ${p.querySelector('[data-k=wst-propusers]').textContent}`), P);
  check('…the manager shows who uses each property: Room Temperature → dialRoomTemp', users.includes('Room Temperature: Used by: dialRoomTemp') && users.includes('HVAC Mode: Used by: segMode'), JSON.stringify(users));
  const T5 = await add('text'); await place(124, 84, 120, 52);
  check('RE-ADD a Value / Text: it starts with no property', !(await comp(T5)).binding);
  await rename('txtRoomTemp'); await setSel('mode', 'value'); await useProp('Room Temperature'); await setPlain('suffix', '°C'); await setSel('decimals', '1'); await setNum('fontSize', 34);
  check('…choose Room Temperature → it shows "20.0°C" at once (same property, independently)', await until(({ s }) => document.querySelector(s + ' .iqtx')?.textContent === '20.0°C', { s: node(T5) }, 8000));
  // property rename keeps the id and every reference; delete only when unused
  await editProperty('Room Temperature', (ed) => page.fill(`${ed} [data-k=wst-pe-name]`, 'Living Room Temperature'));
  st = await state();
  check('RENAME the property → "Living Room Temperature": same id, dialRoomTemp and txtRoomTemp still on it', st.def.properties.find((p) => p.id === Pp['Room Temperature'].id).name === 'Living Room Temperature'
    && st.def.components.filter((c) => c.binding && c.binding.property === Pp['Room Temperature'].id).map((c) => c.name).sort().join() === 'dialRoomTemp,txtRoomTemp');
  await select(null);
  await page.click(`${P} [data-k=wst-prop][data-prop="Living Room Temperature"] [data-k=wst-propdel]`); await page.waitForTimeout(200);
  const ask = await E((P) => { const c = document.querySelector(`${P} [data-k=wst-prop][data-prop="Living Room Temperature"] [data-k=wst-propconfirm]`); return c.hidden ? '' : c.textContent; }, P);
  await page.click(`${P} [data-k=wst-prop][data-prop="Living Room Temperature"] [data-k=wst-propconfirm-cancel]`); await page.waitForTimeout(150);
  const kept = (await state()).def.properties.some((p) => p.name === 'Living Room Temperature');
  await newProperty({ name: 'Spare', family: 'sensor', group: 'Outside', value: 'State' });
  await page.click(`${P} [data-k=wst-prop][data-prop="Spare"] [data-k=wst-propdel]`); await page.waitForTimeout(200);
  check('DELETE: a property in use asks first ("…is used by 2 components…" — Cancel keeps it); an unused one ("Spare") is deleted at once',
    /Living Room Temperature is used by 2 components/.test(ask) && /Remove property and unbind components/.test(ask) && kept && !(await state()).def.properties.some((p) => p.name === 'Spare'), ask);
  await shot(`${S} .wst__col--r`, 'v2-manager-after.png');

  // ================================================================ SAVE · CLOSE · BROWSER RELOAD · REOPEN
  const r = await E((S) => document.querySelector(S).studio.save(), S);
  const defId = (await state()).defId, before = (await state()).def;
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);
  await page.reload(); await page.waitForTimeout(1800);
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(300);
  await page.selectOption(`${S} [data-k=wst-widget]`, `def:${defId}`); await page.waitForTimeout(600);
  st = await state();
  const strip = (d) => JSON.stringify({ slots: d.slots, properties: d.properties, components: d.components.map((c) => ({ ...c, binding: c.binding ? { property: c.binding.property, action: c.binding.action } : null })) });
  check('SAVE → CLOSE → BROWSER RELOAD → REOPEN: component ids, Names, boxes, layer order, configuration, property references; properties (ids, names, values), source groups (names, families, previews) — all as saved',
    r.ok && strip(st.def) === strip(before) && JSON.stringify(st.def.components.map((c) => c.name)) === JSON.stringify(before.components.map((c) => c.name)), JSON.stringify({ r, a: strip(before).slice(0, 400), b: strip(st.def).slice(0, 400) }));
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);
  const saved = (await E(async () => (await (await fetch('api/studio_widgets.php', { credentials: 'same-origin' })).json()))).widgets.find((w) => w.id === defId).definition;
  check('STORED definition: components carry { source: ha, property } only — no entity, no slot; the preview entities live with the source groups (design only)',
    saved.components.filter((c) => c.binding).every((c) => Object.keys(c.binding).every((k) => ['source', 'property', 'action'].includes(k))) && !/"entity"/.test(JSON.stringify(saved.components)) && saved.slots.find((g) => g.label === 'Climate').preview === 'climate.studio_preview');

  // ================================================================ CONFIGURE — once per source group, what each provides
  const model = () => E(() => window.editor.getModel().pages.flatMap((p) => p.items));
  const openTile = async () => { await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click()); await page.waitForSelector('.ecfg-tile'); await page.waitForTimeout(200);
    await page.selectOption('dialog[open] [data-filter=collection]', colId); await page.selectOption('dialog[open] [data-filter=category]', 'climate'); await page.waitForTimeout(150);
    const tiles = await E(() => [...document.querySelectorAll('dialog[open] .ecfg-tile')].map((t) => t.dataset.type)); await page.click(`.ecfg-tile[data-type="my:${defId}"]`); await page.waitForTimeout(600); return tiles; };
  const tiles = await openTile();
  check('GALLERY: Studio Tests + Climate & Environment → Studio Climate Test (collection and category unchanged)', JSON.stringify(tiles) === JSON.stringify([`my:${defId}`]), JSON.stringify(tiles));
  const rows = await E(() => [...document.querySelectorAll('dialog[open] .ef-slot')].map((x) => ({ l: x.dataset.slot, req: x.classList.contains('is-required'), p: x.querySelector('[data-k=slot-provides]')?.textContent || '', empty: x.querySelector('.iqp')?.textContent || '' })));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'v2-configure.png') });
  check('CONFIGURE asks ONCE per source group: "Climate *" (provides Living Room Temperature, Target Temperature, HVAC Mode), "Outside *" (Outside Temperature), "Boiler *" (Boiler Power)',
    JSON.stringify(rows.map((x) => [x.l, x.req, x.p])) === JSON.stringify([['Climate', true, 'Provides: Living Room Temperature, Target Temperature, HVAC Mode'], ['Outside', true, 'Provides: Outside Temperature'], ['Boiler', true, 'Provides: Boiler Power']])
      && /Choose a climate entity/.test(rows[0].empty), JSON.stringify(rows));
  await page.click('dialog[open] .ef-slot[data-slot="Climate"] [data-k=iqp-choose]'); await page.waitForTimeout(200); await page.fill('dialog[open] .ef-slot[data-slot="Climate"] .iqp__search', 'outside'); await page.waitForTimeout(300);
  const narrowed = await E(() => document.querySelectorAll('dialog[open] .ef-slot[data-slot="Climate"] .iqp__item').length);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('FAMILY: the Climate picker offers climate entities only (searching "outside" finds no sensor there)', narrowed === 0, String(narrowed));
  if (await E(() => !document.querySelector('dialog[open] .ecfg-tile, dialog[open] .ef-slot'))) await openTile();
  const assign = async (label, ent) => { const row = `dialog[open] .ef-slot[data-slot="${label}"]`; if (!(await page.$(row))) await openTile(); await page.click(`${row} [data-k=iqp-choose]`); await page.waitForTimeout(200);
    await page.fill(`${row} .iqp__search`, ent); await page.waitForTimeout(250); await page.click(`${row} .iqp__item[data-entity="${ent}"]`); await page.waitForTimeout(350); };
  const place2 = async (list) => { const ids0 = (await model()).map((i) => i.id); for (const [l, e] of list) await assign(l, e);
    await page.click('dialog[open] .ecfg-foot button:has-text("Next")'); await page.waitForTimeout(300); await page.click('dialog[open] .ecfg-add'); await page.waitForTimeout(700); return (await model()).find((i) => !ids0.includes(i.id)); };
  const A = await place2([['Climate', 'climate.lr'], ['Outside', 'sensor.outside_a'], ['Boiler', 'switch.boiler']]);
  await openTile();
  const Bc = await place2([['Climate', 'climate.br'], ['Outside', 'sensor.outside_b'], ['Boiler', 'switch.boiler2']]);
  check('TWO COPIES store their own { source group → entity }: A climate.lr / sensor.outside_a / switch.boiler, B climate.br / sensor.outside_b / switch.boiler2 — three entities each, not five',
    JSON.stringify(Object.values(A.config.entities)) === JSON.stringify(['climate.lr', 'sensor.outside_a', 'switch.boiler']) && JSON.stringify(Object.values(Bc.config.entities)) === JSON.stringify(['climate.br', 'sensor.outside_b', 'switch.boiler2']), JSON.stringify({ A: A.config, B: Bc.config }));
  await E(() => window.editor.save && window.editor.save()); await page.waitForTimeout(800);
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(1500);
  const RT = (id) => `[data-grid-id="${id}"] .stw`;
  const read = (id) => E(({ r, t5 }) => { const q = (c, s) => document.querySelector(`${r} .stw__c[data-cid="${c}"] ${s}`);
    return [q('dial-1', '.iqg')?.getAttribute('aria-valuenow'), q(t5, '.iqtx')?.textContent, q('text-3', '.iqtx')?.textContent, q('segmented-1', '[aria-checked="true"]')?.dataset.id || null, q('text-4', '.iqtx')?.textContent, q('text-2', '.iqtx')?.textContent]; }, { r: RT(id), t5: T5 });
  await page.locator(RT(A.id)).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const want = { A: ['21.5', '21.5°C', 'Target 23°C', 'heat', '12.3°C', 'Room'], B: ['18', '18.0°C', 'Target 19°C', 'off', '4.1°C', 'Room'] };
  const runOk = await until(({ a, b, want, t5 }) => { const rd = (r) => { const q = (c, s) => document.querySelector(`${r} .stw__c[data-cid="${c}"] ${s}`);
    return [q('dial-1', '.iqg')?.getAttribute('aria-valuenow'), q(t5, '.iqtx')?.textContent, q('text-3', '.iqtx')?.textContent, q('segmented-1', '[aria-checked="true"]')?.dataset.id || null, q('text-4', '.iqtx')?.textContent, q('text-2', '.iqtx')?.textContent]; };
    return JSON.stringify(rd(a)) === JSON.stringify(want.A) && JSON.stringify(rd(b)) === JSON.stringify(want.B); }, { a: RT(A.id), b: RT(Bc.id), want, t5: T5 }, 12000);
  if (SHOTS) { await (await page.$(`[data-grid-id="${A.id}"]`)).screenshot({ path: path.join(SHOTS, 'v2-copy-a.png') }); await (await page.$(`[data-grid-id="${Bc.id}"]`)).screenshot({ path: path.join(SHOTS, 'v2-copy-b.png') }); }
  check('RUNTIME: copy A — dial 21.5 and txtRoomTemp "21.5°C" (ONE property, two controls), "Target 23°C", Heat, "12.3°C"; copy B — 18, "18.0°C", "Target 19°C", Off, "4.1°C"; the designer\'s preview entities (20 / Auto / 9) appear in neither',
    runOk, JSON.stringify({ A: await read(A.id), B: await read(Bc.id) }));
  ENTITIES['climate.br'][1].cur = 18.5;
  check('LIVE: climate.br\'s current temperature 18 → 18.5 moves copy B\'s dial AND its txtRoomTemp (each through Room Temperature); copy A unchanged',
    await until(({ b, t5 }) => document.querySelector(`${b} .stw__c[data-cid="dial-1"] .iqg`)?.getAttribute('aria-valuenow') === '18.5' && document.querySelector(`${b} .stw__c[data-cid="${t5}"] .iqtx`)?.textContent === '18.5°C', { b: RT(Bc.id), t5: T5 }, 10000)
      && (await read(A.id))[0] === '21.5');
  let n0 = L.haCalls.length;
  await page.click(`${RT(Bc.id)} .stw__c[data-cid="segmented-1"] [data-id="heat"]`); await page.waitForTimeout(900);
  await page.click(`${RT(A.id)} .stw__c[data-cid="button-1"] .iqc-btn`); await page.waitForTimeout(900);
  const calls = (re) => L.haCalls.filter((c, i) => i >= n0 && c.method === 'POST' && re.test(c.url)).map((c) => JSON.parse(c.body));
  const hv = calls(/\/climate\/set_hvac_mode$/), sw = calls(/\/switch\/turn_on$/);
  check('ACTIONS through the existing secure layer: segMode Heat on copy B → climate.set_hvac_mode for climate.br; btnPower (Toggle) on copy A → switch.turn_on for switch.boiler',
    hv.length === 1 && hv[0].entity_id === 'climate.br' && hv[0].hvac_mode === 'heat' && sw.length === 1 && sw[0].entity_id === 'switch.boiler', JSON.stringify({ hv, sw }));
  // change copy B only
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  const lib0 = await E((id) => JSON.stringify(window.IniqStudioLibrary.get(id)), defId);
  await page.click(`[data-grid-id="${Bc.id}"]`, { force: true }); await page.waitForTimeout(150);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ef'); await page.waitForTimeout(500);
  const row = 'dialog[open] .ef-slot[data-slot="Outside"]'; await page.click(`${row} [data-k=iqp-choose]`); await page.waitForTimeout(200); await page.fill(`${row} .iqp__search`, 'outside_a'); await page.waitForTimeout(250);
  await page.click(`${row} .iqp__item[data-entity="sensor.outside_a"]`); await page.waitForTimeout(300);
  await page.click('dialog[open] .ecfg-foot button:has-text("Apply")'); await page.waitForTimeout(600);
  const items = await model(), a2 = items.find((i) => i.id === A.id), b2 = items.find((i) => i.id === Bc.id);
  check('CHANGE copy B\'s Outside → sensor.outside_a: B only — copy A and the reusable definition untouched', b2.config.entities[saved.slots.find((g) => g.label === 'Outside').id] === 'sensor.outside_a'
    && JSON.stringify(a2.config) === JSON.stringify(A.config) && await E((id) => JSON.stringify(window.IniqStudioLibrary.get(id)), defId) === lib0);
  // dashboard save → reload → the copies' entities survive
  await E(() => window.editor.save && window.editor.save()); await page.waitForTimeout(1000);
  await page.reload(); await page.waitForTimeout(2200);
  const after = await model(), a3 = after.find((i) => i.id === A.id), b3 = after.find((i) => i.id === Bc.id);
  await page.locator(RT(Bc.id)).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  check('DASHBOARD SAVE → RELOAD: both copies keep their entity choices and render them (B\'s outside now 12.3°C)', JSON.stringify(a3.config) === JSON.stringify(a2.config) && JSON.stringify(b3.config) === JSON.stringify(b2.config)
    && await until(({ b }) => document.querySelector(`${b} .stw__c[data-cid="text-4"] .iqtx`)?.textContent === '12.3°C', { b: RT(Bc.id) }, 10000));
  const disk = fs.readdirSync(path.join(L.priv, 'studio-widgets')).map((f) => fs.readFileSync(path.join(L.priv, 'studio-widgets', f), 'utf8')).join('\n');
  check('SECURITY: no Home Assistant URL / token or service data in any stored definition', !disk.includes(FAKE_TOKEN) && !disk.includes(L.haUrl) && !/services\/|"service"|Bearer/i.test(disk));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
