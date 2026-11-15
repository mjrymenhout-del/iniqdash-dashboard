/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO — PROOF OF CONCEPT, through the REAL editor (real PHP server, fake Home Assistant): the palette comes from the component
// registry; a blank widget; Button · Information · Icon · Segmented control · Image added, selected, moved (pointer drag, logical px),
// resized (handle + numbers), configured with the SHARED editors (live on the canvas), duplicated, deleted, two instances of a type kept
// independent; Save → a reusable Widget Studio definition (server-side) → reload → Studio reopens it identical; added from the gallery, the dashboard RUNTIME reconstructs it from the component model with the SAME
// shared renderers (no Studio chrome, no saved HTML); its segmented control works; the Studio's CSS is scoped; the modal rule holds.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const S = 'dialog.wst[open]', P = `${S} .wst__props`;
let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const state = () => E((S) => document.querySelector(S).studio.state(), S);
  const comp = async (id) => (await state()).def.components.find((c) => c.id === id);
  const field = (key) => `${P} .ef-field[data-key="${key}"]`;
  const setNum = async (key, v) => { await page.fill(`${field(key)} input.ef-range__n`, String(v)); await page.press(`${field(key)} input.ef-range__n`, 'Enter'); await page.waitForTimeout(200); };
  const setText = async (key, v) => { await page.fill(`${field(key)} input`, v); await page.waitForTimeout(200); };
  const setSel = async (key, v) => { await page.selectOption(`${field(key)} select`, v); await page.waitForTimeout(200); };
  const token = async (key, t) => { await page.click(`${field(key)} .ef-icon[data-value="${t}"]`); await page.waitForTimeout(150); };
  const flip = async (key) => { await page.click(`${field(key)} button[role=switch]`); await page.waitForTimeout(150); };
  const icon = async (key, n) => { await page.click(`${field(key)} [data-k=icon-field]`); await page.fill(`${field(key)} .iqi__search`, n); await page.click(`${field(key)} .iqi__opt[data-icon="mdi:${n}"]`); await page.waitForTimeout(200); };
  const box = async (k, v) => { await page.fill(`${P} [data-k=wst-${k}]`, String(v)); await page.press(`${P} [data-k=wst-${k}]`, 'Tab'); await page.waitForTimeout(200); };
  const add = async (t) => { await page.click(`${S} [data-k=wst-add][data-type=${t}]`); await page.waitForTimeout(250); return (await state()).sel; };
  /** a logical canvas point → the screen (the board's own scale) */
  const scr = (x, y) => E(({ S, x, y }) => { const b = document.querySelector(`${S} [data-k=wst-board]`), r = b.getBoundingClientRect(), c = document.querySelector(S).studio.state().def.canvas; return { x: r.left + x * r.width / c.w, y: r.top + y * r.height / c.h }; }, { S, x, y });
  const drag = async (from, to) => { const a = await scr(from.x, from.y), b = await scr(to.x, to.y); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(250); };
  const canvasNode = (id) => `${S} [data-k=wst-board] .stw__c[data-cid="${id}"]`;

  // ---------------------------------------------------------------- the entry · the palette (registry-driven) · a blank widget
  // a widget made in Studio belongs to a COLLECTION: one created up front (Studio then preselects it)
  await E(() => window.IniqStudioLibrary.createCollection('Studio tests'));
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  check('the editor has a Widget Studio entry', await page.isVisible('[data-k=studio]'));
  await page.click('[data-k=studio]'); await page.waitForSelector(S);
  const pal = await E((S) => ({ shown: [...document.querySelectorAll(`${S} [data-k=wst-add]`)].map((b) => b.dataset.type).sort(), reg: window.IniqComponents.composable().map((d) => d.id).sort(),
    names: [...document.querySelectorAll(`${S} [data-k=wst-add] b`)].map((b) => b.textContent) }), S);
  check('the palette IS the registry\'s composable components: Button, Toggle, Dial, Information, Value / Text, Icon, Segmented control, Slider, Image + the toolbox elements (components/elements)', JSON.stringify(pal.shown) === JSON.stringify(pal.reg) && JSON.stringify(pal.shown) === JSON.stringify(['arc-gauge', 'badge', 'battery', 'button', 'chart', 'dial', 'flow-connector', 'icon', 'image', 'image-overlay', 'information', 'label-value', 'line', 'panel', 'progress-bar', 'progress-ring', 'segmented', 'select', 'shape', 'slider', 'spacer', 'status', 'stepper', 'sun-arc', 'text', 'toggle']), JSON.stringify(pal));
  const src = await E(async () => (await (await fetch('components/studio/studio.js')).text()).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1'));
  check('Studio names no component: no per-component code (it hosts what the registry describes)', !/(===?|case)\s*['"](button|information|icon|segmented|image)['"]/.test(src) && !/IniqControls|IniqInfo\.|IniqIcons|IniqArtwork/.test(src));
  await page.click(`${S} [data-k=wst-new-empty]`); await page.waitForTimeout(300);
  let st = await state();
  check('Create blank widget: an empty widget at the logical design size (360 × 240), not saved yet', st.def.components.length === 0 && st.def.canvas.w === 360 && st.def.canvas.h === 240 && st.itemId === null && st.dirty, JSON.stringify(st));
  check('canvas aids by default: grid shown, 8 logical px, snap to grid and to components on', st.aids.show && st.aids.grid === 8 && st.aids.snapGrid && st.aids.snapSmart
    && await E((S) => { const l = document.querySelector(`${S} [data-k=wst-layer]`); return l.dataset.grid === 'on' && l.style.getPropertyValue('--wst-grid') === '8px'; }, S), JSON.stringify(st.aids));
  // (this first part checks free placement exactly as before: snapping off; the snapping part follows at the end)
  await page.click(`${S} [data-k=wst-snap-grid]`); await page.click(`${S} [data-k=wst-snap-smart]`); await page.waitForTimeout(100);

  // ---------------------------------------------------------------- add the five components
  const ids = {};
  for (const t of ['button', 'information', 'icon', 'segmented', 'image']) ids[t] = await add(t);
  st = await state();
  check('add Button · Information · Icon · Segmented control · Image: each an instance (type ≠ instance id), the newest on top and selected', JSON.stringify(st.def.components.map((c) => c.id)) === JSON.stringify(['button-1', 'information-1', 'icon-1', 'segmented-1', 'image-1']) && st.sel === 'image-1', JSON.stringify(st.def.components.map((c) => [c.id, c.type])));
  const kinds = await E((S) => { const q = (id, s) => !!document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"] ${s}`); return { b: q('button-1', '.iqc-btn'), i: q('information-1', '.iqf'), c: q('icon-1', '.iqi-solo'), s: q('segmented-1', '.iqc-seg'), m: q('image-1', '.iqa') }; }, S);
  check('the canvas draws each with its SHARED renderer (action button, information, icon, segmented control, image)', Object.values(kinds).every(Boolean), JSON.stringify(kinds));

  // ---------------------------------------------------------------- the composition: move (drag), resize (handle + numbers)
  // image: the back of the left half
  await E((S) => document.querySelector(S).studio.select('image-1'), S); await page.waitForTimeout(150);
  for (const [k, v] of [['x', 12], ['y', 12], ['w', 150], ['h', 150]]) await box(k, v);
  for (let i = 0; i < 4; i++) { await page.click(`${P} [data-k=wst-back]`); await page.waitForTimeout(80); }
  st = await state();
  check('numeric box: image at 12 / 12, 150 × 150; Send backward → behind the others', JSON.stringify((await comp('image-1'))) === JSON.stringify({ ...(await comp('image-1')), x: 12, y: 12, w: 150, h: 150 }) && st.def.components[0].id === 'image-1', JSON.stringify(st.def.components.map((c) => c.id)));
  // the others first (numbers), then the button is dragged to the top right
  await E((S) => document.querySelector(S).studio.select('icon-1'), S); await page.waitForTimeout(150);
  await box('w', 56); await box('h', 56); await box('x', 176); await box('y', 16);
  await E((S) => document.querySelector(S).studio.select('segmented-1'), S); await page.waitForTimeout(150);
  await box('w', 336); await box('h', 52); await box('x', 12); await box('y', 176);
  await E((S) => document.querySelector(S).studio.select('information-1'), S); await page.waitForTimeout(150);
  await box('x', 176); await box('y', 84);
  let b0 = await comp('button-1');
  await drag({ x: b0.x + b0.w / 2, y: b0.y + b0.h / 2 }, { x: 300, y: 50 });
  let b1 = await comp('button-1');
  check('DRAG moves the button in LOGICAL px (to its centre 300 / 50)', Math.abs(b1.x + b1.w / 2 - 300) <= 1 && Math.abs(b1.y + b1.h / 2 - 50) <= 1 && b1.w === b0.w && b1.h === b0.h, JSON.stringify({ b0, b1 }));
  await drag({ x: b1.x + b1.w / 2, y: b1.y + b1.h / 2 }, { x: 600, y: -100 });
  const b2 = await comp('button-1');
  check('…kept inside the canvas, never resized by the edge', b2.x === 360 - b2.w && b2.y === 0 && b2.w === b0.w, JSON.stringify(b2));
  await box('w', 60); await box('h', 60); await box('x', 292); await box('y', 12);
  // resize the information with its handle
  await E((S) => document.querySelector(S).studio.select('information-1'), S); await page.waitForTimeout(150);
  const i0 = await comp('information-1');
  await drag({ x: i0.x + i0.w, y: i0.y + i0.h }, { x: i0.x + i0.w + 6, y: i0.y + i0.h - 4 });
  const i1 = await comp('information-1');
  check('RESIZE with the handle: the box grows / shrinks (logical px); x / y stay', i1.w === i0.w + 6 && i1.h === i0.h - 4 && i1.x === i0.x && i1.y === i0.y, JSON.stringify({ i0, i1 }));
  await box('w', 6);
  check('a box never goes under the component\'s minimum (Information: 40 px wide)', (await comp('information-1')).w === 40);
  await box('w', 176); await box('h', 56);

  // ---------------------------------------------------------------- the SHARED properties, live
  await E((S) => document.querySelector(S).studio.select('button-1'), S); await page.waitForTimeout(250);
  const bKeys = await E((P) => [...document.querySelectorAll(`${P} .ef-field`)].filter((f) => !f.hidden).map((f) => f.dataset.key), P);
  const sharedBtn = await E(() => window.IniqComponents.editor('button')({ ...window.IniqComponents.get('button').compose.editor }).map((f) => f.key));
  check('Button properties = the SHARED Action Button editor (+ its preview state): label, show label, icon, style, shape, size, colour, state look, icon size, icon colour (label size / gap only with a visible label)', sharedBtn.filter((k) => !['labelSize', 'labelGap'].includes(k)).every((k) => bKeys.includes(k)) && bKeys.includes('data.on'), JSON.stringify({ bKeys, sharedBtn }));
  await setText('label', 'Heating power'); await icon('icon', 'fire'); await token('color', 'danger'); await setNum('size', 60); await setNum('iconSize', 30);
  const bLive = await E((n) => { const b = document.querySelector(`${n} .iqc-btn`); return { label: b.getAttribute('aria-label'), icon: b.querySelector('[data-mdi]').dataset.mdi, color: b.style.getPropertyValue('--iqc-color'), size: b.getBoundingClientRect().width / Number(document.querySelector('dialog.wst [data-k=wst-board]').dataset.zoom), is: b.style.getPropertyValue('--iqc-icon') }; }, canvasNode('button-1'));
  const bBox = await comp('button-1');
  check('LIVE: label, icon, colour, button size 60, icon size 30 — on the canvas at once (no save)', bLive.label === 'Heating power' && bLive.icon === 'mdi:fire' && bLive.color === 'var(--danger)' && Math.round(bLive.size) === 60 && bLive.is === '30px', JSON.stringify(bLive));
  check('the button\'s SIZE is its appearance — its box (x, y, w, h) did not change', bBox.x === 292 && bBox.y === 12 && bBox.w === 60 && bBox.h === 60, JSON.stringify(bBox));
  // information
  await E((S) => document.querySelector(S).studio.select('information-1'), S); await page.waitForTimeout(250);
  await setText('data.value', '21.5 °C'); await setText('label', 'Living room'); await icon('icon', 'thermometer');
  await token('color', 'info'); await setNum('iconSize', 34); await setSel('iconBg', 'subtle'); await setSel('animation', 'pulse'); await setNum('valueSize', 26); await setNum('labelSize', 13);
  const iLive = await E((n) => { const f = document.querySelector(`${n} .iqf`); const ic = f.querySelector('.iqf__ic'); return { v: f.querySelector('.iqf__v').textContent, l: f.querySelector('.iqf__l')?.textContent, icon: ic.dataset.mdi, c: f.style.getPropertyValue('--iqf-c'), i: f.style.getPropertyValue('--iqf-i'), bg: ic.dataset.iqiBg, anim: ic.dataset.iqiAnim, vs: getComputedStyle(f.querySelector('.iqf__v')).fontSize, ls: getComputedStyle(f.querySelector('.iqf__l')).fontSize, info: !!f.info }; }, canvasNode('information-1'));
  check('Information (the shared IniqInfo renderer, live): 21.5 °C · Living room · thermometer · info colour · icon 34 px on a subtle background · pulsing · value 26 · label 13',
    iLive.info && iLive.v === '21.5 °C' && iLive.l === 'Living room' && iLive.icon === 'mdi:thermometer' && iLive.c === 'var(--info)' && iLive.i === '34px' && iLive.bg === 'subtle' && iLive.anim === 'pulse' && iLive.vs === '26px' && iLive.ls === '13px', JSON.stringify(iLive));
  // icon
  await E((S) => document.querySelector(S).studio.select('icon-1'), S); await page.waitForTimeout(250);
  await icon('icon', 'lightbulb-on'); await setNum('iconSize', 44); await token('color', 'warning'); await setSel('iconBg', 'accent'); await setSel('animation', 'breathe');
  const cLive = await E((n) => { const e = document.querySelector(`${n} .iqi-solo`); return { icon: e.dataset.mdi, size: e.style.getPropertyValue('--iqi-size'), color: e.style.color, bg: e.dataset.iqiBg, anim: e.dataset.iqiAnim, svg: parseFloat(getComputedStyle(e.querySelector('svg')).width) }; }, canvasNode('icon-1'));
  check('Icon (IniqIcons.present, live): lightbulb-on · 44 px · warning · accent background (the glyph stays 44 px) · breathing', cLive.icon === 'mdi:lightbulb-on' && cLive.size === '44px' && cLive.color === 'var(--warning)' && cLive.bg === 'accent' && cLive.anim === 'breathe' && cLive.svg === 44, JSON.stringify(cLive));
  // segmented: the options are its configuration, the selected one its preview data
  await E((S) => document.querySelector(S).studio.select('segmented-1'), S); await page.waitForTimeout(250);
  await setSel('data.selected', 'option-2');
  const sLive = await E((n) => { const g = document.querySelector(`${n} .iqc-seg`); return { opts: [...g.querySelectorAll('.iqc-seg__o')].map((o) => `${o.dataset.id}:${o.querySelector('.iqc-seg__l').textContent}`), sel: g.querySelector('[aria-checked="true"]')?.dataset.id, ctl: !!g.control }; }, canvasNode('segmented-1'));
  check('Segmented control (the shared one, live): its NEUTRAL default options Option 1 | Option 2 (no domain), Option 2 selected', sLive.ctl && sLive.opts.join() === 'option-1:Option 1,option-2:Option 2' && sLive.sel === 'option-2', JSON.stringify(sLive));
  // image: the shared artwork picker, scoped to the Studio widget type's own library
  await E((S) => document.querySelector(S).studio.select('image-1'), S); await page.waitForTimeout(250);
  await page.click(`${field('image')} [data-k=art-builtin][aria-label="Landscape"]`); await page.waitForTimeout(250); await setNum('radius', 20);
  const mLive = await E((n) => { const a = document.querySelector(`${n} .iqa`); return { src: a.querySelector('img')?.getAttribute('src'), r: a.style.getPropertyValue('--iqa-r') }; }, canvasNode('image-1'));
  check('Image (the shared artwork picker → the shared image renderer): the Studio widget type\'s built-in Landscape, radius 20 — a location, never base64', mLive.src === 'widgets/default/studio/assets/landscape.svg' && mLive.r === '20px', JSON.stringify(mLive));

  // ---------------------------------------------------------------- two instances, duplicate, delete
  const b2id = await add('button');
  await setText('label', 'Second'); await icon('icon', 'fan'); await token('color', 'success');
  await box('w', 52); await box('h', 52); await box('x', 236); await box('y', 16);
  const i2id = await add('information');
  await setText('data.value', '48 %'); await setText('label', 'Humidity');
  await box('w', 176); await box('h', 28); await box('x', 176); await box('y', 142);
  const [ba, bb, ia, ib] = await Promise.all(['button-1', b2id, 'information-1', i2id].map(comp));
  check('two Buttons and two Information items, each its own configuration', b2id === 'button-2' && i2id === 'information-2' && ba.config.label === 'Heating power' && bb.config.label === 'Second' && ba.config.color === 'danger' && bb.config.color === 'success'
    && ia.data.value === '21.5 °C' && ib.data.value === '48 %' && ia.config.label === 'Living room' && ib.config.label === 'Humidity', JSON.stringify({ ba, bb, ia, ib }));
  await E((S) => document.querySelector(S).studio.select('icon-1'), S); await page.waitForTimeout(150);
  await page.click(`${P} [data-k=wst-dup]`); await page.waitForTimeout(250);
  const dupId = (await state()).sel, dup = await comp(dupId), orig = await comp('icon-1');
  check('DUPLICATE: a new instance id, the same configuration and size, offset 12 px', dupId === 'icon-2' && JSON.stringify(dup.config) === JSON.stringify(orig.config) && dup.w === orig.w && dup.h === orig.h && dup.x === orig.x + 12 && dup.y === orig.y + 12, JSON.stringify({ dup, orig }));
  await token('color', 'cool');
  check('…editing the duplicate leaves the original as it was', (await comp('icon-2')).config.color === 'cool' && (await comp('icon-1')).config.color === 'warning');
  await E((S) => document.querySelector(S).studio.select('icon-2'), S); await page.waitForTimeout(150);
  await page.click(`${P} [data-k=wst-del]`); await page.waitForTimeout(200);
  // a scratch image, selected by a click on the canvas, removed with the Delete key
  ids.scratch = await add('image'); await box('w', 40); await box('h', 40); await box('x', 300); await box('y', 190);
  const sc = await scr(320, 210); await page.mouse.click(sc.x, sc.y); await page.waitForTimeout(150);
  await page.keyboard.press('Delete'); await page.waitForTimeout(200);
  st = await state();
  check('DELETE (button, and the Delete key): only that instance — the types stay registered, the others untouched', !st.def.components.some((c) => c.id === 'icon-2' || c.id === ids.scratch) && st.def.components.length === 7 && (await E(() => !!window.IniqComponents.get('icon') && !!window.IniqComponents.get('image'))), JSON.stringify(st.def.components.map((c) => c.id)));

  // ---------------------------------------------------------------- modal rule; save; reload
  await page.mouse.click(5, 5); await page.waitForTimeout(250);
  check('a click on the backdrop does nothing (the Studio stays open)', await page.isVisible(S));
  await page.fill(`${S} [data-k=wst-name]`, 'Climate corner');
  const before = (await state()).def;
  await page.click(`${S} [data-k=wst-save]`); await page.waitForTimeout(1500);
  st = await state();
  /** a Widget Studio definition as the server stores it */
  const stored = (id) => E(async (id) => ((await (await fetch('api/studio_widgets.php', { credentials: 'same-origin' })).json()).widgets || []).find((w) => w.id === id) || null, id);
  /** an INSTANCE of a definition, added through the normal gallery (Add → its gallery tile → Next → Add) → its item id */
  const addInstance = async (defId) => {
    const ids0 = await E(() => window.editor.getModel().pages.flatMap((p) => p.items).map((i) => i.id));
    await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
    await page.waitForSelector(`.ecfg-tile[data-type="my:${defId}"]`); await page.click(`.ecfg-tile[data-type="my:${defId}"]`); await page.waitForTimeout(400);
    await page.click('dialog[open] .ecfg-foot button:has-text("Next")'); await page.waitForTimeout(200);
    await page.click('dialog[open] .ecfg-add'); await page.waitForTimeout(600);
    await E(() => window.editor.save && window.editor.save()); await page.waitForTimeout(600);
    return (await E(() => window.editor.getModel().pages.flatMap((p) => p.items))).find((i) => !ids0.includes(i.id)).id;
  };
  const saved1 = await stored(st.defId);
  const item = { id: null, config: saved1 && { name: saved1.definition.meta.name, canvas: saved1.definition.canvas, components: saved1.definition.components } };
  check('SAVE: a reusable Widget Studio definition (server-side, stable id) whose content is the COMPONENT MODEL (no HTML)', !!saved1 && /^w[0-9a-f]{16}$/.test(st.defId) && item.config.name === 'Climate corner' && item.config.components.length === 7
    && !/<|class=|iqc-btn|wst__/.test(JSON.stringify(saved1)) && st.dirty === false, JSON.stringify({ st: st.source, saved1 }).slice(0, 600));
  const strip = (d) => JSON.stringify({ canvas: d.canvas, components: d.components });
  check('…saved exactly as designed (order, configuration, data, boxes)', strip(item.config) === strip(before), JSON.stringify({ before, after: item.config }).slice(0, 600));
  const design = await E((S) => [...document.querySelectorAll(`${S} [data-k=wst-board] .stw__c`)].map((n) => `${n.dataset.cid}@${n.offsetLeft},${n.offsetTop},${n.offsetWidth}x${n.offsetHeight}`), S);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('Escape closes the Studio (Cancel / Close — never Apply)', !(await page.isVisible('dialog.wst')));
  await page.reload(); await page.waitForTimeout(1800);
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(400);
  st = await state();
  let design2 = await E((S) => [...document.querySelectorAll(`${S} [data-k=wst-board] .stw__c`)].map((n) => `${n.dataset.cid}@${n.offsetLeft},${n.offsetTop},${n.offsetWidth}x${n.offsetHeight}`), S);
  check('RELOAD: Studio reopens the saved widget identical — order, configuration, data, positions and sizes', st.defId === saved1.id && strip(st.def) === strip(before) && JSON.stringify(design2) === JSON.stringify(design) && st.def.name === 'Climate corner', JSON.stringify({ design, design2 }));
  // still editable
  await E((S) => document.querySelector(S).studio.select('button-1'), S); await page.waitForTimeout(250);
  await setNum('size', 56); await page.click(`${S} [data-k=wst-save]`); await page.waitForTimeout(1500);
  const b56 = (await stored(saved1.id)).definition.components.find((c) => c.id === 'button-1');
  check('…and editable: a change saved again — Button size 56 px (it fits its 60 × 60 box: the box stays)', b56.config.size === 56 && b56.w === 60 && b56.h === 60, JSON.stringify(b56));
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);

  // ---------------------------------------------------------------- the RUNTIME: the dashboard reconstructs it from the model
  item.id = await addInstance(saved1.id);
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(1500);
  const RT = `[data-grid-id="${item.id}"] .stw`;
  await page.locator(RT).scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  const rt = await E((RT) => {
    const r = document.querySelector(RT); if (!r) return null;
    const n = (id) => r.querySelector(`.stw__c[data-cid="${id}"]`);
    const geo = [...r.querySelectorAll('.stw__c')].map((x) => `${x.dataset.cid}@${x.offsetLeft},${x.offsetTop},${x.offsetWidth}x${x.offsetHeight}`);
    const lightBtn = window.IniqControls.button({ label: 'x' });
    return { geo, scale: Number(r.dataset.scale), chrome: r.querySelectorAll('[class*="wst"]').length + r.closest('[data-grid-id]').querySelectorAll('.wst__sel, .wst__grip, .wst__layer').length,
      btn: !!n('button-1').querySelector('.iqc-btn').control && n('button-1').querySelector('.iqc-btn').control.update.toString() === lightBtn.control.update.toString() && n('button-1').querySelector('.iqc-btn').getAttribute('aria-label') === 'Heating power',
      info: !!n('information-1').querySelector('.iqf').info && n('information-1').querySelector('.iqf__v').textContent === '21.5 °C' && n('information-2').querySelector('.iqf__v').textContent === '48 %',
      icon: n('icon-1').querySelector('.iqi-solo').dataset.mdi === 'mdi:lightbulb-on' && n('icon-1').querySelector('.iqi-solo').dataset.iqiAnim === 'breathe',
      seg: n('segmented-1').querySelector('[aria-checked="true"]').dataset.id === 'option-2', img: n('image-1').querySelector('.iqa img').getAttribute('src') };
  }, RT);
  check('RUNTIME: the saved widget is rendered on the dashboard from its component model — the same boxes (logical px) as in Studio', !!rt && JSON.stringify(rt.geo) === JSON.stringify(design2) && rt.scale > 0, JSON.stringify({ rt, design2 }));
  check('…by the SAME shared renderers: the action button (same update as any IniqControls button), IniqInfo, the icon, the segmented control, the image', rt.btn && rt.info && rt.icon && rt.seg && rt.img === 'widgets/default/studio/assets/landscape.svg', JSON.stringify(rt));
  check('…with no Studio chrome (selection, handle, layer, labels)', rt.chrome === 0, JSON.stringify(rt.chrome));
  await page.click(`${RT} .stw__c[data-cid="segmented-1"] .iqc-seg__o[data-id="option-1"]`); await page.waitForTimeout(250);
  check('the runtime segmented control works (Option 1 chosen — a local preview choice: it has no property, so nothing reaches Home Assistant)', await E((RT) => document.querySelector(`${RT} .stw__c[data-cid="segmented-1"] [aria-checked="true"]`).dataset.id === 'option-1', RT));
  await page.locator(RT).screenshot({ path: process.env.SHOT || '/tmp/widget-studio.png' }).catch(() => {});

  // ---------------------------------------------------------------- CSS isolation
  const css = await E(async () => { const t = await (await fetch('components/studio/studio.css')).text(); const w = await (await fetch('widgets/default/studio/studio.css')).text();
    const sel = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]+\{/g, '').split('}').map((r) => r.split('{')[0].trim()).filter((r) => r && !r.startsWith('@'));
    return { studio: sel(t).every((r) => r.split(',').every((p) => p.trim().startsWith('.wst'))), widget: sel(w).every((r) => r.split(',').every((p) => p.trim().startsWith('.stw'))), wstInWidget: /wst/.test(w) }; });
  check('CSS isolation: every Studio rule is scoped to .wst, every Studio-widget rule to .stw; the runtime CSS never needs the Studio', css.studio && css.widget && !css.wstInWidget, JSON.stringify(css));
  const clash = await E(async () => { const out = []; for (const p of window.IniqWidgetPackages) { if (p.id === 'studio' || !p.style) continue; const t = await (await fetch(`${p.path}${p.style}`)).text(); if (/\.(stw|wst)(__|[\s{.,:\[])/.test(t)) out.push(p.id); } return out; });
  check('…no other widget package uses the Studio namespaces (.stw / .wst)', clash.length === 0, JSON.stringify(clash));
  check('…no grid, no guides at runtime', await E((RT) => { const r = document.querySelector(RT), cs = getComputedStyle(r); return !r.querySelector('.wst__guide, [data-grid], .wst__layer') && !/radial-gradient\(circle/.test(cs.backgroundImage); }, RT));

  // ================================================================ GRID · SNAP · SMART GUIDES · KEYBOARD (the Studio canvas only)
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(300);
  await page.click(`${S} [data-k=wst-new]`); await page.waitForTimeout(300);
  st = await state();
  check('a new Studio session starts with the default aids again (session preferences, never in the widget)', st.aids.grid === 8 && st.aids.snapGrid && st.aids.snapSmart && !('aids' in st.def) && !('grid' in st.def), JSON.stringify(st.aids));
  // five components, placed by NUMBERS (exact — numbers are never snapped)
  const put = async (t, b) => { const id = await add(t); for (const [k, v] of [['w', b.w], ['h', b.h], ['x', b.x], ['y', b.y]]) await box(k, v); return id; };
  const I = await put('information', { x: 24, y: 24, w: 120, h: 48 }), Bt = await put('button', { x: 200, y: 100, w: 60, h: 60 }), Ic = await put('icon', { x: 284, y: 20, w: 40, h: 40 });
  const Sg = await put('segmented', { x: 20, y: 184, w: 200, h: 44 }), Im = await put('image', { x: 236, y: 168, w: 100, h: 60 });
  await E((S) => document.querySelector(S).studio.select(null), S);
  // the grid: size 4, hidden / shown
  await page.click(`${S} [data-k=wst-gsize][data-size="4"]`); await page.waitForTimeout(100);
  const g4 = await E((S) => document.querySelector(`${S} [data-k=wst-layer]`).style.getPropertyValue('--wst-grid'), S);
  await page.click(`${S} [data-k=wst-grid]`); await page.waitForTimeout(100);
  const hidden = await E((S) => { const l = document.querySelector(`${S} [data-k=wst-layer]`); return l.dataset.grid === 'off' && getComputedStyle(l).backgroundImage === 'none'; }, S);
  await page.click(`${S} [data-k=wst-grid]`); await page.waitForTimeout(100);
  check('GRID: 8 → 4 logical px; it can be hidden and shown (a CSS background of the editor layer — no element per line)', g4 === '4px' && hidden && (await state()).aids.grid === 4
    && await E((S) => document.querySelector(`${S} [data-k=wst-layer]`).dataset.grid === 'on' && document.querySelectorAll(`${S} [data-k=wst-layer] *`).length < 10, S));
  /** drag in LOGICAL px; the guides shown DURING the gesture; optional Alt held */
  const gesture = async (from, to, { alt = false, shift = false } = {}) => {
    const a = await scr(from.x, from.y), b = await scr(to.x, to.y);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    if (alt) await page.keyboard.down('Alt');
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 }); await page.mouse.move(b.x, b.y, { steps: 3 });
    const guides = await E((S) => [...document.querySelectorAll(`${S} .wst__guide`)].map((g) => `${g.dataset.axis}${g.dataset.at}`), S);
    await page.mouse.up(); if (alt) await page.keyboard.up('Alt'); if (shift) await page.keyboard.up('Shift'); await page.waitForTimeout(200);
    const after = await E((S) => document.querySelectorAll(`${S} .wst__guide`).length, S);
    return { guides, after };
  };
  const centre = (c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
  // grid snap alone (components off)
  await page.click(`${S} [data-k=wst-snap-smart]`);
  let b = await comp(Bt), c0 = centre(b);
  await gesture(c0, { x: c0.x + 13.3, y: c0.y - 9.4 });
  b = await comp(Bt);
  check('SNAP TO GRID (4): the button lands on the grid (213.3 → 212, 90.6 → 92)', b.x === 212 && b.y === 92 && b.w === 60, JSON.stringify(b));
  // resize snap (grid): the image selected (its handle)
  await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id: Im }); await page.waitForTimeout(150);
  const m0 = await comp(Im);
  await gesture({ x: m0.x + m0.w, y: m0.y + m0.h }, { x: m0.x + m0.w - 6.7, y: m0.y + m0.h - 5.2 });
  const m1 = await comp(Im);
  check('RESIZE snaps to the grid: 100 × 60 → 93.3 × 54.8 → 92 × 56 (x / y unchanged)', m1.w === 92 && m1.h === 56 && m1.x === m0.x && m1.y === m0.y, JSON.stringify({ m0, m1 }));
  await page.click(`${S} [data-k=wst-snap-grid]`);              // both off: free
  b = await comp(Bt); c0 = centre(b);
  await gesture(c0, { x: c0.x + 3.4, y: c0.y + 2.6 });
  b = await comp(Bt);
  check('snap can be switched off: free logical px (212 + 3.4 → 215, 92 + 2.6 → 95)', b.x === 215 && b.y === 95, JSON.stringify(b));
  await page.click(`${S} [data-k=wst-snap-grid]`); await page.click(`${S} [data-k=wst-snap-smart]`);   // both on again
  // canvas centre: a 60-wide button centred = x 150 (its OWN centre on 180), with the guide during the drag
  b = await comp(Bt); c0 = centre(b);
  let gst = await gesture(c0, { x: 182.6, y: c0.y });
  b = await comp(Bt);
  check('CANVAS CENTRE: the button\'s centre snaps to x 180 → x = 150 (not its left edge); the guide shows during the drag and is gone after', b.x === 150 && gst.guides.includes('x180') && gst.after === 0, JSON.stringify({ b, gst }));
  // Information's left edge to the button's left edge
  let i = await comp(I); c0 = centre(i);
  gst = await gesture(c0, { x: c0.x + (152.4 - i.x), y: c0.y + (130 - i.y) });
  i = await comp(I);
  check('COMPONENT LEFT EDGE: Information\'s left snaps to the button\'s (150) with its guide', i.x === 150 && gst.guides.includes('x150'), JSON.stringify({ i, gst }));
  // Icon's centre to Information's centre (210)
  let ic = await comp(Ic); c0 = centre(ic); i = await comp(I);
  gst = await gesture(c0, { x: i.x + i.w / 2 + 2.7, y: c0.y });
  ic = await comp(Ic);
  check('COMPONENT CENTRE: Icon\'s centre snaps to Information\'s centre (x 210 → icon x 190)', ic.x + ic.w / 2 === i.x + i.w / 2 && gst.guides.includes(`x${i.x + i.w / 2}`), JSON.stringify({ ic, i, gst }));
  // PRIORITY: grid would give 104, another component's left edge is 102 → 102
  await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id: I }); await page.waitForTimeout(150);
  await box('x', 102); await box('y', 120);
  check('numeric entry is exact (not snapped): Information x = 102 on a 4 px grid… and x = 37', (await comp(I)).x === 102);
  b = await comp(Bt); c0 = centre(b);
  await page.click(`${S} [data-k=wst-gsize][data-size="8"]`);
  gst = await gesture(c0, { x: c0.x + (104.6 - b.x), y: c0.y + (24.6 - b.y) });
  b = await comp(Bt);
  check('PRIORITY: grid 8 would give x 104; Information\'s left edge is 102 → smart alignment wins (102)', b.x === 102 && gst.guides.includes('x102'), JSON.stringify({ b, gst }));
  // ALT: no snapping while held
  b = await comp(Bt); c0 = centre(b);
  gst = await gesture(c0, { x: c0.x + 47.3, y: c0.y + 3.2 }, { alt: true });
  const bAlt = await comp(Bt);
  check('ALT held: free placement (102 + 47.3 → 149, y + 3.2 — no grid, no alignment, no guides)', bAlt.x === 149 && bAlt.y === Math.round(b.y + 3.2) && gst.guides.length === 0, JSON.stringify({ b, bAlt, gst }));
  // keyboard: arrows 1 px, Shift + arrows one grid step (8); never while a field has focus
  const bc = await scr(bAlt.x + 30, bAlt.y + 30); await page.mouse.click(bc.x, bc.y); await page.waitForTimeout(150);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
  const k1 = await comp(Bt);
  await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowUp'); await page.waitForTimeout(100);
  const k2 = await comp(Bt);
  check('KEYBOARD: arrow = 1 logical px (149 → 150, down 1); Shift + arrow = one grid step, 8 (→ 158, up 8)', k1.x === 150 && k1.y === bAlt.y + 1 && k2.x === 158 && k2.y === k1.y - 8, JSON.stringify({ bAlt, k1, k2 }));
  await page.focus(`${field('label')} input`); await page.keyboard.press('End'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
  await page.focus(`${P} [data-k=wst-x]`); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(100);
  check('…a text or number field keeps its own arrows (the component did not move)', JSON.stringify(await comp(Bt)) === JSON.stringify(k2));
  for (let n = 0; n < 30; n++) await (async () => { const sc = await scr(k2.x + 30, k2.y + 30); if (n === 0) { await page.mouse.click(sc.x, sc.y); } await page.keyboard.press('Shift+ArrowLeft'); })();
  check('…and never out of the canvas (x stays 0)', (await comp(Bt)).x === 0);
  // boundaries for snapped gestures: a far drag, an oversized and an undersized resize
  b = await comp(Bt); c0 = centre(b);
  await gesture(c0, { x: 900, y: 700 });
  b = await comp(Bt);
  const m2 = await comp(Im);
  await gesture({ x: m2.x + m2.w, y: m2.y + m2.h }, { x: 900, y: 900 });
  const m3 = await comp(Im);
  await gesture({ x: m3.x + m3.w, y: m3.y + m3.h }, { x: m3.x - 200, y: m3.y - 200 });
  const m4 = await comp(Im);
  check('BOUNDARIES: a far drag stays inside (not resized); a resize stops at the canvas edge and never under the minimum (16 × 16)',
    b.x === 360 - b.w && b.y === 240 - b.h && b.w === 60 && m3.x + m3.w === 360 && m3.y + m3.h === 240 && m4.w === 16 && m4.h === 16, JSON.stringify({ b, m3, m4 }));
  await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id: Im }); await page.waitForTimeout(150);
  await box('w', 100); await box('h', 60); await box('x', 236); await box('y', 168);
  await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id: Bt }); await page.waitForTimeout(150);
  await box('x', 37); await box('y', 13);
  check('a deliberately off-grid X (37) stays exact', (await comp(Bt)).x === 37);
  // the ENGINE on its own (logical boxes only — it knows no component type): every canvas line and every component line
  const eng = await E(() => {
    const f = window.IniqStudio.snapBox, cv = { w: 360, h: 240 }, A = { x: 24, y: 40, w: 80, h: 50 }, o = { canvas: cv, grid: 8, others: [A], min: { w: 16, h: 16 } };
    const mv = (b) => f({ w: 60, h: 30, ...b }, o);
    return {
      cLeft: mv({ x: 1, y: 150 }).x, cCentreX: mv({ x: 148, y: 150 }).x, cRight: mv({ x: 297, y: 150 }).x, cTop: mv({ x: 200, y: 4 }).y, cMiddle: mv({ x: 200, y: 107 }).y, cBottom: mv({ x: 200, y: 208 }).y,
      aLeft: mv({ x: 27, y: 150 }).x, aCentre: mv({ x: 37, y: 150 }).x, aRight: mv({ x: 47, y: 150 }).x, aTop: mv({ x: 200, y: 43 }).y, aMiddle: mv({ x: 200, y: 52 }).y, aBottom: mv({ x: 200, y: 62 }).y,
      grid: mv({ x: 203, y: 141 }), noSmart: f({ x: 26, y: 150, w: 60, h: 30 }, { ...o, useSmart: false }).x, free: f({ x: 26.4, y: 150, w: 60, h: 30 }, { ...o, useSmart: false, useGrid: false }).x,
      rRight: f({ x: 200, y: 150, w: 157, h: 30 }, { ...o, mode: 'resize' }).w, rGrid: f({ x: 201, y: 150, w: 103, h: 30 }, { ...o, mode: 'resize', useSmart: false }).w,
      guideLeft: mv({ x: 27, y: 150 }).guides.map((g) => `${g.axis}${g.at}`) };
  });
  check('ENGINE (logical boxes): canvas left 0 · centre x 150 (60 wide) · right 300 · top 0 · middle y 105 (30 high) · bottom 210',
    eng.cLeft === 0 && eng.cCentreX === 150 && eng.cRight === 300 && eng.cTop === 0 && eng.cMiddle === 105 && eng.cBottom === 210, JSON.stringify(eng));
  check('ENGINE: a component\'s left 24 · centre (64 → x 34) · right (104 → x 44) · top 40 · middle (65 → y 50) · bottom (90 → y 60)',
    eng.aLeft === 24 && eng.aCentre === 34 && eng.aRight === 44 && eng.aTop === 40 && eng.aMiddle === 50 && eng.aBottom === 60, JSON.stringify(eng));
  check('ENGINE: else the grid (203 / 141 → 200 / 144); grid only (26 → 24); free (26.4 → 26); resize to a line (right edge → 360: w 160) or to the grid (103 → 104); its guides',
    eng.grid.x === 200 && eng.grid.y === 144 && eng.noSmart === 24 && eng.free === 26 && eng.rRight === 160 && eng.rGrid === 104 && eng.guideLeft.includes('x24'), JSON.stringify(eng));
  // the editor zoom never changes a coordinate: a smaller window, the same logical drag → the same logical result
  const z1 = Number(await E((S) => document.querySelector(`${S} [data-k=wst-board]`).dataset.zoom, S));
  await page.setViewportSize({ width: 1100, height: 760 }); await page.waitForTimeout(500);
  const z2 = Number(await E((S) => document.querySelector(`${S} [data-k=wst-board]`).dataset.zoom, S));
  ic = await comp(Ic); c0 = centre(ic);
  await page.click(`${S} [data-k=wst-snap-smart]`);
  await gesture(c0, { x: c0.x + 33.2, y: c0.y + 0.4 });
  const icz = await comp(Ic);
  await page.click(`${S} [data-k=wst-snap-smart]`);
  check('ZOOM: at another editor scale the same logical drag gives the same logical result (190 + 33.2 → 224, 20 + 0.4 → 24 on the 8 grid)', z1 !== z2 && icz.x === 224 && icz.y === 24, JSON.stringify({ z1, z2, ic, icz }));
  await page.setViewportSize({ width: 1600, height: 1000 }); await page.waitForTimeout(400);
  // ================================================================ RESIZE MODES: NORMAL = the layout box · SHIFT = scale the designed object
  const studioSrc = await E(async () => (await (await fetch('components/studio/studio.js')).text()).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1'));
  check('Studio has no per-component resize / scale branch and names no presentation property — it applies each component\'s contract (scale.base / props, resize.toBox)',
    !/\b(iconSize|valueSize|labelSize|textSize|padX)\b|config\.(size|height)/.test(studioSrc) && !/(===?|case)\s*['"](button|information|icon|segmented|image)['"]/.test(studioSrc) && /scale\.props|S\.props/.test(studioSrc) && /\.base\(/.test(studioSrc));
  await page.click(`${S} [data-k=wst-snap-smart]`);              // grid only for these gestures (no alignment between them)
  const vis = (id) => E(({ S, id }) => { const n = document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"]`), c = n.firstElementChild, sv = c.querySelector('svg'), q = (s) => c.querySelector(s);
    return { w: c.offsetWidth, h: c.offsetHeight, l: c.offsetLeft, t: c.offsetTop, r: getComputedStyle(c).borderRadius, svg: sv ? parseFloat(getComputedStyle(sv).width) : null,
      v: q('.iqf__v') ? getComputedStyle(q('.iqf__v')).fontSize : null, fl: q('.iqf__l') ? getComputedStyle(q('.iqf__l')).fontSize : null, fi: q('.iqf__ic') ? q('.iqf__ic').offsetWidth : null,
      seg: q('.iqc-seg__l') ? getComputedStyle(q('.iqc-seg__l')).fontSize : null, segI: q('.iqc-seg__i') ? q('.iqc-seg__i').offsetWidth : null,
      fits: [...c.querySelectorAll('.iqc-seg__l')].every((l) => l.scrollWidth <= l.clientWidth + 1) }; }, { S, id });
  const grip = async (id, dx, dy, o = {}) => { await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id }); await page.waitForTimeout(150); const x = await comp(id); await gesture({ x: x.x + x.w, y: x.y + x.h }, { x: x.x + x.w + dx, y: x.y + x.h + dy }, o); return comp(id); };
  const shown = (key) => E(({ P, key }) => { const n = document.querySelector(`${P} .ef-field[data-key="${key}"] input.ef-range__n`); return n ? n.value : null; }, { P, key });
  // ACTION BUTTON
  await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id: Bt }); await page.waitForTimeout(150);
  await box('w', 60); await box('h', 60); await setNum('size', 56);
  let rb = await grip(Bt, 44, 44); const vB1 = await vis(Bt);
  check('BUTTON — NORMAL resize: the box 60 → 104 (layout room); the button keeps its 56 px, centred; nothing is rescaled', rb.w === 104 && rb.h === 104 && rb.config.size === 56 && !('iconSize' in rb.config) && vB1.w === 56 && vB1.l === 24 && vB1.t === 24, JSON.stringify({ rb, vB1 }));
  await box('w', 60); await box('h', 60);
  rb = await grip(Bt, 30, 30, { shift: true }); const vB2 = await vis(Bt); let k = rb.w / 60;
  check('BUTTON — SHIFT resize: one factor k (box 60 → 88, square): Button size 56 → 82 and Icon size 26 → 38 (= start × k), a circle', Math.abs(k - 88 / 60) < 1e-9 && rb.h === 88 && rb.config.size === Math.round(56 * k) && rb.config.iconSize === Math.round(26 * k)
    && vB2.w === rb.config.size && vB2.h === rb.config.size && vB2.r === '50%', JSON.stringify({ rb, vB2, k }));
  check('…Properties show the REAL values (82, 38) — no hidden scale', (await shown('size')) === String(rb.config.size) && (await shown('iconSize')) === String(rb.config.iconSize) && !/scale/i.test(JSON.stringify(rb)));
  await setNum('size', 70); rb = await comp(Bt);
  check('…and can be typed again (Button size 70: the button 70 px; the 88 box stays)', rb.config.size === 70 && (await vis(Bt)).w === 70 && rb.w === 88);
  // VISIBLE LABEL (the shared button's opt-in capability)
  await flip('showLabel'); await page.waitForTimeout(150);
  const lab = await E(({ S, id }) => { const b = document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"] .iqc-btn`), l = b.querySelector('.iqc-btn__l'); return { text: l && l.textContent, labelled: 'labelled' in b.dataset, name: b.getAttribute('aria-label'), icon: !!b.querySelector('[data-mdi]') }; }, { S, id: Bt });
  check('BUTTON LABEL: Show label → icon + visible label (its neutral default "Button"), still its accessible name; Label size / gap offered', lab.text === 'Button' && lab.labelled && lab.name === 'Button' && lab.icon && await E((P) => !!document.querySelector(`${P} .ef-field[data-key="labelSize"]`), P), JSON.stringify(lab));
  await flip('showLabel'); await page.waitForTimeout(150);
  check('…off → icon only again (no label element at all)', await E(({ S, id }) => { const b = document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"] .iqc-btn`); return !b.querySelector('.iqc-btn__l') && !('labelled' in b.dataset); }, { S, id: Bt }));
  // SEGMENTED CONTROL
  await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id: Sg }); await page.waitForTimeout(150);
  await box('w', 260); await box('h', 40);
  const vS0 = await vis(Sg);
  let sg = await grip(Sg, 56, 16); const vS1 = await vis(Sg);
  check('SEGMENTED — NORMAL resize: the control IS its box (260 × 40 → ≈ 316 × 56, on the grid) and its labels have room; text 14 px and icons 18 px stay (its neutral options have no icon by default)', sg.w % 8 === 0 && sg.w >= 312 && sg.w <= 320 && sg.h === 56 && vS1.w === sg.w && vS1.h === 56 && vS1.seg === '14px' && [0, 18].includes(vS1.segI) && vS0.seg === '14px' && vS1.fits
    && sg.config.textSize === 14 && sg.config.iconSize === 18, JSON.stringify({ sg, vS0, vS1 }));
  await box('w', 260); await box('h', 40);
  sg = await grip(Sg, 100, 20, { shift: true }); const vS2 = await vis(Sg); k = sg.w / 260;
  check('SEGMENTED — SHIFT resize (≈ 1.3, kept inside the canvas): text, icons, gap and padding scale (start × k); the labels stay whole', k > 1.25 && Math.abs(sg.h - Math.round(40 * k)) <= 1 && sg.config.textSize === Math.round(14 * k) && sg.config.iconSize === Math.round(18 * k)
    && sg.config.gap === Math.round(4 * k) && sg.config.padX === Math.round(10 * k) && vS2.seg === `${sg.config.textSize}px` && [0, sg.config.iconSize].includes(vS2.segI) && vS2.fits, JSON.stringify({ sg, vS2, k }));
  check('…Properties show them (Text size, Icon size)', (await shown('textSize')) === String(sg.config.textSize) && (await shown('iconSize')) === String(sg.config.iconSize));
  // INFORMATION
  await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id: I }); await page.waitForTimeout(150);
  await box('x', 102); await box('y', 64); await box('w', 120); await box('h', 48);
  const vI0 = await vis(I);
  let inf = await grip(I, 56, 16); const vI1 = await vis(I);
  check('INFORMATION — NORMAL resize: more layout room (120 × 48 → 176 × 64); value, label and icon keep their sizes', inf.w === 176 && inf.h === 64 && vI1.w === 176 && vI1.v === vI0.v && vI1.fl === vI0.fl && vI1.fi === vI0.fi && !('valueSize' in inf.config), JSON.stringify({ inf, vI0, vI1 }));
  await box('w', 120); await box('h', 48);
  inf = await grip(I, 60, 24, { shift: true }); const vI2 = await vis(I); k = inf.w / 120;
  check('INFORMATION — SHIFT resize: value / label / icon sizes scale (18 · 12 · 24 × k) — the value itself (its generic preview "Value") stays', k > 1.3 && inf.config.valueSize === Math.round(18 * k) && inf.config.labelSize === Math.round(12 * k) && inf.config.iconSize === Math.round(24 * k)
    && vI2.v === `${inf.config.valueSize}px` && inf.data.value === undefined || (inf.data.value || 'Value') === 'Value', JSON.stringify({ inf, vI2, k }));
  // ICON
  await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id: Ic }); await page.waitForTimeout(150);
  await box('x', 224); await box('y', 24); await box('w', 40); await box('h', 40); await setNum('iconSize', 40);
  let ic1 = await grip(Ic, 40, 40); const vic1 = await vis(Ic);
  check('ICON — NORMAL resize: box 40 → 80; the glyph keeps its Icon size (40)', ic1.w === 80 && ic1.config.iconSize === 40 && vic1.svg === 40, JSON.stringify({ ic1, vic1 }));
  await box('w', 40); await box('h', 40);
  ic1 = await grip(Ic, 32, 32, { shift: true }); const vic2 = await vis(Ic); k = ic1.w / 40;
  check('ICON — SHIFT resize: the Icon size scales (40 × k), the glyph with it', ic1.config.iconSize === Math.round(40 * k) && vic2.svg === ic1.config.iconSize && k > 1.5, JSON.stringify({ ic1, vic2, k }));
  await setSel('iconBg', 'accent'); ic1 = await comp(Ic); const vbg = await vis(Ic);
  check('…a background is padding AROUND the glyph (never a smaller glyph); the box grows to hold it', vbg.svg === ic1.config.iconSize && ic1.w >= Math.round(ic1.config.iconSize * 1.44) && Math.abs(vbg.w - Math.round(ic1.config.iconSize * 1.44)) <= 1, JSON.stringify({ ic1, vbg }));
  // IMAGE
  let im = await grip(Im, 16, 8); const vim = await vis(Im);
  check('IMAGE — NORMAL resize: the picture fills its box (100 × 60 → 120 × 72)', im.w === 120 && im.h === 72 && vim.w === 120 && vim.h === 72, JSON.stringify({ im, vim }));
  const imCfg = JSON.stringify(im.config);
  im = await grip(Im, -8, -8, { shift: true }); const vim2 = await vis(Im);
  check('IMAGE — SHIFT resize: nothing to scale — it stays a picture filling its box, its configuration unchanged', vim2.w === im.w && vim2.h === im.h && JSON.stringify(im.config) === imCfg && im.w === 112, JSON.stringify({ im, vim2 }));
  // the VIEW path: a property change updates THAT component in place; nothing else is rebuilt
  await E((S) => document.querySelectorAll(`${S} [data-k=wst-board] .stw__c > *`).forEach((n) => { n.__mark = true; }), S);
  await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id: Bt }); await page.waitForTimeout(150);
  await token('color', 'success');
  const marks = await E(({ S, ids }) => Object.fromEntries(ids.map((id) => [id, document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"] > *`).__mark === true])), { S, ids: [Bt, I, Ic, Sg, Im] });
  check('UPDATE / VIEW: a Button colour change updates that button IN PLACE (the same element, its own update()) — no other component rebuilt',
    Object.values(marks).every(Boolean) && await E(({ S, id }) => document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"] .iqc-btn`).style.getPropertyValue('--iqc-color') === 'var(--success)', { S, id: Bt }), JSON.stringify(marks));
  await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id: I }); await page.waitForTimeout(150);
  await token('color', 'warning');
  const marks2 = await E(({ S, ids }) => Object.fromEntries(ids.map((id) => [id, document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"] > *`).__mark === true])), { S, ids: [Bt, I, Ic, Sg, Im] });
  check('…a component without its own update() is re-rendered ALONE (Information: new element; the others untouched)', !marks2[I] && marks2[Bt] && marks2[Ic] && marks2[Sg] && marks2[Im], JSON.stringify(marks2));
  await page.click(`${S} [data-k=wst-snap-smart]`);
  const studioVis = {}; for (const id of [I, Bt, Ic, Sg, Im]) studioVis[id] = await vis(id);

  // save · reload · runtime
  await page.fill(`${S} [data-k=wst-name]`, 'Snap test');
  const snapDef = (await state()).def;
  await page.click(`${S} [data-k=wst-save]`); await page.waitForTimeout(1500);
  const snapDefId = (await state()).defId;
  const geoOf = (d) => JSON.stringify(d.components.map((c) => [c.id, c.x, c.y, c.w, c.h]));
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);
  const snapId = await addInstance(snapDefId);
  await page.reload(); await page.waitForTimeout(1800);
  const saved = (await stored(snapDefId)).definition;
  check('SAVE → RELOAD: every box exactly as placed (x 37 included); no grid / snap / guide data in the widget', geoOf(saved) === geoOf(snapDef) && !/grid|snap|guide|aids/i.test(JSON.stringify({ ...saved, meta: '' })), JSON.stringify({ saved: geoOf(saved), snapDef: geoOf(snapDef) }));
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(1200);
  const SR = `[data-grid-id="${snapId}"] .stw`;
  await page.locator(SR).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const rt2 = await E((SR) => { const r = document.querySelector(SR); return { geo: [...r.querySelectorAll('.stw__c')].map((x) => [x.dataset.cid, x.offsetLeft, x.offsetTop, x.offsetWidth, x.offsetHeight]), chrome: r.closest('[data-grid-id]').querySelectorAll('[class*="wst"], [data-grid="on"]').length }; }, SR);
  check('RUNTIME: the same boxes, no grid, no guides, no selection', JSON.stringify(rt2.geo) === geoOf(saved) && rt2.chrome === 0, JSON.stringify(rt2));
  const rtVis = await E(({ SR, ids }) => Object.fromEntries(ids.map((id) => { const c = document.querySelector(`${SR} .stw__c[data-cid="${id}"]`).firstElementChild, sv = c.querySelector('svg');
    const q = (s) => c.querySelector(s);
    return [id, { w: c.offsetWidth, h: c.offsetHeight, l: c.offsetLeft, t: c.offsetTop, r: getComputedStyle(c).borderRadius, svg: sv ? parseFloat(getComputedStyle(sv).width) : null,
      v: q('.iqf__v') ? getComputedStyle(q('.iqf__v')).fontSize : null, fl: q('.iqf__l') ? getComputedStyle(q('.iqf__l')).fontSize : null, fi: q('.iqf__ic') ? q('.iqf__ic').offsetWidth : null,
      seg: q('.iqc-seg__l') ? getComputedStyle(q('.iqc-seg__l')).fontSize : null, segI: q('.iqc-seg__i') ? q('.iqc-seg__i').offsetWidth : null,
      fits: [...c.querySelectorAll('.iqc-seg__l')].every((l) => l.scrollWidth <= l.clientWidth + 1) }]; })), { SR, ids: [I, Bt, Ic, Sg, Im] });
  check('RUNTIME = STUDIO: every component the same actual size and type sizes (button, scaled icon on its background, image, scaled segmented control, scaled information)', JSON.stringify(rtVis) === JSON.stringify(studioVis), JSON.stringify({ rtVis, studioVis }));
  void Sg;
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
