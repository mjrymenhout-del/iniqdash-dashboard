/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// DIAL + SLIDER — the shared components extracted from Climate (the dial) and Light (brightness · colour temperature), through the REAL
// editor (real PHP server, fake Home Assistant):
//   1. SHAREDNESS (source): the Dial knows no climate / temperature, the Slider no light / brightness / kelvin; Studio and the Studio
//      widget name neither; Climate draws its dial only through IniqDial, Light its sliders only through IniqSlider;
//   2. ONE editor each: Climate's dial fields and Light's brightness fields ARE the shared builders (IniqComponents.editor);
//   3. the components on their own: the view contract, the keyboard, accessible name / min / max / value, focus, drag → onInput / onCommit;
//   4. Widget Studio: palette; Studio's Dial is the GAUGE PRIMITIVE (components/gauge — one value, no text; tests/studio-primitives.mjs
//      covers it in depth): presets, normal resize (the geometry) and Shift + resize (its set sizes), move / snap, update in place,
//      Save → reload → runtime; the Slider; the runtime slider gesture changing its preview value (reported, never sent to a device).
import fs from 'node:fs';
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
// ---------------------------------------------------------------- 1. sharedness (static)
const dialJs = code('components/dial/dial.js'), sliderJs = code('components/slider/slider.js'), dialCss = code('components/dial/dial.css'), sliderCss = code('components/slider/slider.css');
const studioJs = code('components/studio/studio.js'), studioWidgetJs = code('widgets/default/studio/studio.js'), climateJs = code('widgets/default/climate/climate.js'), lightJs = code('widgets/default/light/light.js');
check('the Dial knows no domain: no climate, HVAC, thermostat, temperature, heating in its code or CSS', !/climate|hvac|thermostat|temperature|heating|celsius|\bcw[-_]/i.test(dialJs + dialCss), (dialJs + dialCss).match(/climate|hvac|thermostat|temperature|heating|celsius|\bcw[-_]/i)?.[0]);
check('the Slider knows no domain: no light, brightness, kelvin or colour temperature in its code or CSS', !/\blight\b(?!-)|bright|kelvin|colou?r.?temp|\blw[-_]/i.test(sliderJs + sliderCss), (sliderJs + sliderCss).match(/\blight\b(?!-)|bright|kelvin|colou?r.?temp|\blw[-_]/i)?.[0]);
check('the Dial and the Slider never call Home Assistant (no service, entity, fetch or HA layer)', !/callService|hass|entity_id|fetch\(|MaisonHA|IniqHA/.test(dialJs + sliderJs));
check('Widget Studio (host and runtime widget) names neither: no dial / slider branch, no IniqDial / IniqSlider',
  !/['"`](dial|slider)['"`]|IniqDial|IniqSlider|iqdl|iqsl/.test(studioJs + studioWidgetJs));
check('Climate draws its dial ONLY through the shared Dial (no ring, SVG, handle or drag code of its own)',
  /IniqDial\.create\(/.test(climateJs) && !/createElementNS|arcPath|polar\(|role', 'slider'|setPointerCapture|atan2/.test(climateJs));
check('Light draws brightness and colour temperature ONLY through the shared Slider (no range input of its own)',
  (lightJs.match(/IniqSlider\.create\(/g) || []).length === 2 && !/type=["']range|\.type\s*=\s*['"]range/.test(lightJs));
check('unique CSS namespaces: the Dial is .iqdl, the Slider .iqsl — no generic .dial / .slider / .ring / .track class',
  !/(^|[\s,}])\.(dial|slider|ring|track|knob|thumb)\b/m.test(dialCss + sliderCss) && /^\.iqdl\b/m.test(dialCss) && /^\.iqsl\b/m.test(sliderCss));

let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);

  // ---------------------------------------------------------------- 2. ONE editor each
  const eds = await E(() => {
    const R = window.MaisonRegistry, IC = window.IniqComponents;
    const col = (t, k) => R.schemaOf(t).fields.find((f) => f.key === k);
    const sig = (f, p) => `${f.key.slice(p.length)}|${f.type}|${f.min ?? ''}|${f.max ?? ''}`;
    const climate = col('climate', 'controls').fields.filter((f) => f.key.startsWith('dial.') && !['dial.place', 'dial.ox', 'dial.oy'].includes(f.key) && !f.key.startsWith('dial.place')).map((f) => sig(f, 'dial.'));
    const shared = IC.editor('dial')({ k: 'dial.', fields: ['size', 'primary'], words: { colours: [['heatColor', 'Heating'], ['coolColor', 'Cooling'], ['idleColor', 'Idle']] } }).map((f) => sig(f, 'dial.'));
    const studio = IC.get('dial').compose.fields().map((f) => sig(f, ''));
    const light = col('light', 'controls').fields.filter((f) => f.key.startsWith('dim.') && f.key !== 'dim.place').map((f) => sig(f, 'dim.'));
    const sl = IC.editor('slider')(IC.get('slider').compose.editor).map((f) => sig(f, ''));
    return { climate, shared, studio, light, sl };
  });
  check('ONE dial editor: Climate\'s dial fields ARE the shared Dial builder (same keys, types and ranges, in order — Climate names its state colours heat / cool / idle)', JSON.stringify(eds.climate) === JSON.stringify(eds.shared) && eds.climate.length > 20, JSON.stringify(eds));
  check('…Studio\'s Dial is NOT the thermostat: its Properties are the gauge primitive\'s (preset, range, geometry, track, arc, ticks, marker, face) — no value / label / target / state field',
    eds.studio[0].startsWith('min|number') && eds.studio[2].startsWith('preset|select') && ['start|', 'sweep|', 'thickness|', 'ticks|', 'markerStyle|', 'face|'].every((k) => eds.studio.some((x) => x.startsWith(k)))
      && !eds.studio.some((x) => /^(design|valueSize|label|showCurrent|showAction|showLabel|warmColor)\|/.test(x)), JSON.stringify(eds.studio));
  check('ONE slider editor: Light\'s brightness look (track · handle · colour) and Studio\'s Slider Properties are the shared Slider builder (Studio adds its name and the plain skin\'s track / handle colours, radius, handle shape)',
    JSON.stringify(eds.light) === JSON.stringify(eds.sl.filter((x) => !x.startsWith('label|') && !/^(trackColor|handleColor|radius|handleShape)\|/.test(x))) && eds.light.length === 3 && eds.sl[0].startsWith('label|'), JSON.stringify(eds));

  // ---------------------------------------------------------------- 3. the components on their own
  const unit = await E(async () => {
    const out = {}, seen = [];
    const d = window.IniqDial.create({ design: 'spectrum', onInput: (v, s) => seen.push(['in', v, s]), onCommit: (v, s, from) => seen.push(['commit', v, s, from ?? null]) });
    d.style.cssText = 'position:fixed;left:20px;top:20px;width:200px;height:200px;z-index:99999'; document.body.append(d);
    d.dial.update({ min: 0, max: 100, step: 1, value: 70, setpoint: 70, current: 65, unit: '', tone: 'warm', label: 'Value', interactive: true, name: 'Demo value', aria: '70' }, {});
    const k = d.dial.knob;
    out.aria = { role: k.getAttribute('role'), name: k.getAttribute('aria-label'), min: k.getAttribute('aria-valuemin'), max: k.getAttribute('aria-valuemax'), now: k.getAttribute('aria-valuenow'), text: k.getAttribute('aria-valuetext'), tab: k.tabIndex };
    out.tone = d.dataset.tone; k.focus(); out.focus = document.activeElement === k;
    k.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); k.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    out.keys = seen.splice(0);
    d.dial.update({ min: 0, max: 100, step: 1, value: 70, setpoint: 70, interactive: false }, {});
    k.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); out.locked = seen.splice(0);
    out.readout = d.querySelector('.iqdl__target').textContent;
    d.remove();
    const s = window.IniqSlider.create({ label: 'Demo level', onInput: (v) => seen.push(['in', v]), onCommit: (v) => seen.push(['commit', v]) });
    document.body.append(s);
    s.slider.update({ value: 30, min: 10, max: 50, step: 5, valueText: '30 units' });
    out.slider = { type: s.type, name: s.getAttribute('aria-label'), min: s.min, max: s.max, step: s.step, value: s.value, text: s.getAttribute('aria-valuetext'), v: s.style.getPropertyValue('--v'), cls: s.className };
    s.focus(); out.sfocus = document.activeElement === s;
    s.value = '35'; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); out.sEvents = seen.splice(0);
    s.slider.update({ value: 35, disabled: true }); out.sDisabled = s.disabled; s.remove();
    return out;
  });
  check('DIAL accessibility: the handle is a slider with an accessible name, min, max, value and value text, focusable',
    unit.aria.role === 'slider' && unit.aria.name === 'Demo value' && unit.aria.min === '0' && unit.aria.max === '100' && unit.aria.now === '70' && unit.aria.text === '70' && unit.aria.tab === 0 && unit.focus, JSON.stringify(unit));
  check('DIAL keyboard: ↑ → onCommit(71, keyboard), End → onCommit(100); not interactive → nothing; the owner decides what it means', JSON.stringify(unit.keys) === JSON.stringify([['commit', 71, 'keyboard', null], ['commit', 100, 'keyboard', null]]) && unit.locked.length === 0 && unit.readout === '70' && unit.tone === 'warm', JSON.stringify(unit));
  check('SLIDER numeric contract: a native range (min · max · step · value), its name and value text, --v = where the value sits; input → onInput, release → onCommit; disabled',
    unit.slider.type === 'range' && unit.slider.name === 'Demo level' && unit.slider.min === '10' && unit.slider.max === '50' && unit.slider.step === '5' && unit.slider.value === '30' && unit.slider.text === '30 units' && unit.slider.v === '0.5' && unit.slider.cls === 'iqsl__range'
      && unit.sfocus && JSON.stringify(unit.sEvents) === JSON.stringify([['in', 35], ['commit', 35]]) && unit.sDisabled, JSON.stringify(unit));
  // the dial dragged with a real pointer: onInput while it moves, onCommit at the end (with the value it started from)
  const dragSeen = await (async () => {
    await E(() => { window.__seen = []; const d = window.IniqDial.create({ design: 'arc', onInput: (v, s) => { window.__seen.push(['in', v, s]); d.dial.view({ min: 0, max: 100, setpoint: v, value: v, interactive: true }); }, onCommit: (v, s, from) => window.__seen.push(['commit', v, s, from]) });
      d.id = 'demo-dial'; d.style.cssText = 'position:fixed;left:40px;top:40px;width:200px;height:200px;z-index:99999'; document.body.append(d);
      d.dial.update({ min: 0, max: 100, step: 1, value: 50, setpoint: 50, interactive: true }, {}); });
    const r = await E(() => { const b = document.getElementById('demo-dial').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2 }; });
    // the ring at 12 o'clock is the middle of a 270° scale (50); move to 3 o'clock (≈ 83)
    await page.mouse.move(r.x, r.y - r.r * 0.8); await page.mouse.down(); await page.mouse.move(r.x + r.r * 0.8, r.y, { steps: 6 }); await page.mouse.up();
    const out = await E(() => window.__seen.splice(0)); await E(() => document.getElementById('demo-dial').remove()); return out;
  })();
  const last = dragSeen[dragSeen.length - 1] || [];
  check('DIAL drag: values reported while it moves (onInput), then one onCommit with the new value and the one it started from', dragSeen.filter((x) => x[0] === 'in').length >= 2 && last[0] === 'commit' && last[1] >= 80 && last[1] <= 86 && last[3] === 50, JSON.stringify(dragSeen));

  // ---------------------------------------------------------------- 4. Widget Studio
  const S = 'dialog.wst[open]', P = `${S} .wst__props`;
  const state = () => E((S) => document.querySelector(S).studio.state(), S);
  const comp = async (id) => (await state()).def.components.find((c) => c.id === id);
  const field = (key) => `${P} .ef-field[data-key="${key}"]`;
  const setNum = async (key, v) => { await page.fill(`${field(key)} input.ef-range__n`, String(v)); await page.press(`${field(key)} input.ef-range__n`, 'Enter'); await page.waitForTimeout(200); };
  const setPlain = async (key, v) => { await page.fill(`${field(key)} input`, String(v)); await page.waitForTimeout(250); };
  const setSel = async (key, v) => { await page.selectOption(`${field(key)} select`, v); await page.waitForTimeout(200); };
  const box = async (k, v) => { await page.fill(`${P} [data-k=wst-${k}]`, String(v)); await page.press(`${P} [data-k=wst-${k}]`, 'Tab'); await page.waitForTimeout(200); };
  const add = async (t) => { await page.click(`${S} [data-k=wst-add][data-type=${t}]`); await page.waitForTimeout(250); return (await state()).sel; };
  const select = async (id) => { await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id }); await page.waitForTimeout(150); };
  const scr = (x, y) => E(({ S, x, y }) => { const b = document.querySelector(`${S} [data-k=wst-board]`), r = b.getBoundingClientRect(), c = document.querySelector(S).studio.state().def.canvas; return { x: r.left + x * r.width / c.w, y: r.top + y * r.height / c.h }; }, { S, x, y });
  const gesture = async (from, to, { shift = false } = {}) => {
    const a = await scr(from.x, from.y), b = await scr(to.x, to.y);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); if (shift) await page.keyboard.down('Shift');
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 }); await page.mouse.move(b.x, b.y, { steps: 3 });
    await page.mouse.up(); if (shift) await page.keyboard.up('Shift'); await page.waitForTimeout(250);
  };
  const grip = async (id, dx, dy, o = {}) => { await select(id); const x = await comp(id); await gesture({ x: x.x + x.w, y: x.y + x.h }, { x: x.x + x.w + dx, y: x.y + x.h + dy }, o); return comp(id); };
  const node = (id) => `${S} [data-k=wst-board] .stw__c[data-cid="${id}"]`;
  const look = (id) => E((sel) => { const c = document.querySelector(sel).firstElementChild, q = (s) => c.querySelector(s), inp = c.matches('input') ? c : q('input');
    return { cls: c.className, design: c.dataset.design || null, w: c.offsetWidth, h: c.offsetHeight, l: c.offsetLeft, t: c.offsetTop, text: c.matches('.iqg') ? c.textContent : null,
      now: c.getAttribute('aria-valuenow'), arc: !!q('.iqg__value'), marker: !!q('.iqg__marker'), sw: q('.iqg__value path') ? q('.iqg__value path').getAttribute('stroke-width') : null,
      target: q('.iqdl__target') ? q('.iqdl__target').textContent : null, vfs: q('.iqdl__target') ? getComputedStyle(q('.iqdl__target')).fontSize : null,
      label: q('.iqdl__label') ? q('.iqdl__label').textContent : null, room: q('.iqdl__room') ? q('.iqdl__room').textContent : null,
      knob: q('.iqdl__knob') ? [q('.iqdl__knob').getAttribute('aria-valuemin'), q('.iqdl__knob').getAttribute('aria-valuemax'), q('.iqdl__knob').getAttribute('aria-valuenow')].join() : null,
      input: inp ? { w: inp.offsetWidth, value: inp.value, min: inp.min, max: inp.max, step: inp.step, name: inp.getAttribute('aria-label'), track: getComputedStyle(c).getPropertyValue('--iqsl-h'), thumb: getComputedStyle(c).getPropertyValue('--iqsl-thumb') } : null }; }, node(id));

  // a widget made in Studio belongs to a COLLECTION: one created up front (Studio then preselects it)
  await E(() => window.IniqStudioLibrary.createCollection('Studio tests'));
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S);
  const pal = await E((S) => [...document.querySelectorAll(`${S} [data-k=wst-add]`)].map((b) => `${b.dataset.type}:${b.querySelector('b').textContent}`), S);
  check('PALETTE: Dial and Slider appear (from IniqComponents.composable() — Studio gained no code for them)', pal.includes('dial:Dial') && pal.includes('slider:Slider'), JSON.stringify(pal));
  await page.click(`${S} [data-k=wst-new-empty]`); await page.waitForTimeout(300);
  await page.click(`${S} [data-k=wst-snap-smart]`); await page.waitForTimeout(100);       // grid only: predictable numbers

  // ---- DIAL — the gauge primitive
  const D = await add('dial');
  let dc = await comp(D), dv = await look(D);
  check('DIAL added: ONE generic preview value (50), the Spectrum ring PRESET written into its properties (0–100), drawn by the gauge primitive — no text inside',
    D === 'dial-1' && JSON.stringify(dc.data) === JSON.stringify({ value: 50 }) && dc.config.preset === 'spectrum' && dc.config.min === 0 && dc.config.max === 100 && dc.config.thickness === 10
      && dv.cls === 'iqg' && dv.text === '' && dv.now === '50' && dv.arc && dv.marker, JSON.stringify({ dc, dv }));
  const props = await E((P) => [...document.querySelectorAll(`${P} .ef-field[data-key]`)].map((f) => f.dataset.key), P);
  check('DIAL Properties: preset · range · geometry · track · arc · ticks · marker · face + ONE preview value — no target / label / state / value-size field',
    ['preset', 'min', 'max', 'start', 'sweep', 'thickness', 'trackShow', 'arcColor', 'ticks', 'markerStyle', 'face', 'data.value'].every((k) => props.includes(k))
      && !props.some((k) => /^(design|valueSize|label|data\.target|data\.state|data\.label|showCurrent)$/.test(k)), JSON.stringify(props));
  const presets = {};
  for (const d of ['minimal', 'arc', 'full', 'digital', 'spectrum']) { await setSel('preset', d); const c = (await comp(D)).config; presets[d] = { p: c.preset, t: c.thickness, el: (await look(D)).cls }; }
  check('DIAL presets (Minimal ring · State arc · Full dial · Digital ring · Spectrum ring): each fills in the SAME properties, one renderer',
    Object.entries(presets).every(([d, v]) => v.p === d && v.el === 'iqg') && new Set(Object.values(presets).map((v) => v.t)).size >= 4, JSON.stringify(presets));
  await E((sel) => { document.querySelector(sel).firstElementChild.__mark = true; }, node(D));
  await setNum('thickness', 18); await setPlain('data.value', 82);
  const inPlace = await E((sel) => { const c = document.querySelector(sel).firstElementChild; return { same: c.__mark === true, now: c.getAttribute('aria-valuenow'), w: c.querySelector('.iqg__value path')?.getAttribute('stroke-width') }; }, node(D));
  check('DIAL update / view: a property (thickness 18) and a preview value (82) update the SAME element; the preset is still editable afterwards', inPlace.same && inPlace.now === '82' && inPlace.w === '18' && (await comp(D)).config.preset === 'spectrum', JSON.stringify(inPlace));
  await setPlain('data.value', 70); await setSel('preset', 'spectrum');
  await box('x', 40); await box('y', 16); await box('w', 160); await box('h', 160);
  const cfg0 = JSON.stringify((await comp(D)).config);
  dc = await grip(D, 40, 24); dv = await look(D);
  check('DIAL — NORMAL resize: the box 160 → 200 × 184; the gauge is the box\'s circle (184, centred) — its geometry follows, its set sizes (thickness 10) stay',
    dc.w === 200 && dc.h === 184 && dv.w === 184 && dv.h === 184 && dv.l === 8 && dv.t === 0 && JSON.stringify(dc.config) === cfg0 && dv.sw === '10', JSON.stringify({ dc, dv }));
  await box('w', 160); await box('h', 160);
  dc = await grip(D, 40, 40, { shift: true }); dv = await look(D); let k = dc.w / 160;
  check('DIAL — SHIFT resize: one factor k (160 → 200): its set sizes in proportion — thickness 10 → 13 (rounded), marker 14 → 18, tick length 6 → 8 (= start × k)',
    Math.abs(k - 1.25) < 1e-9 && dc.h === 200 && dc.config.thickness === 13 && dc.config.markerSize === 18 && dc.config.tickLen === 8 && dv.w === 200 && dv.sw === '13', JSON.stringify({ dc, dv }));
  // move / snap (grid 8)
  dc = await comp(D); await gesture({ x: dc.x + dc.w / 2, y: dc.y + dc.h / 2 }, { x: dc.x + dc.w / 2 + 29.4, y: dc.y + dc.h / 2 + 3.2 });
  const moved = await comp(D);
  check('DIAL — MOVE snaps to the grid (logical px)', moved.x % 8 === 0 && moved.y % 8 === 0 && moved.x !== dc.x && moved.w === 200, JSON.stringify({ dc, moved }));
  await box('x', 8); await box('y', 8); await box('w', 160); await box('h', 160);

  // ---- SLIDER
  const Sl = await add('slider');
  let sc = await comp(Sl), sv = await look(Sl);
  check('SLIDER added: the neutral preview — value 50, 0–100, step 1; the shared slider (a native range: its name, min, max, value)',
    Sl === 'slider-1' && JSON.stringify(sc.data) === JSON.stringify({ value: 50, min: 0, max: 100, step: 1 }) && sv.cls === 'iqsl' && sv.input.value === '50' && sv.input.min === '0' && sv.input.max === '100' && sv.input.step === '1' && sv.input.name === 'Value', JSON.stringify({ sc, sv }));
  const sprops = await E((P) => [...document.querySelectorAll(`${P} .ef-field[data-key]`)].map((f) => f.dataset.key), P);
  check('SLIDER Properties: the shared Slider fields (name, track thickness, handle size, fill / track / handle colours, radius, handle shape) + its preview data', ['label', 'track', 'handle', 'color', 'trackColor', 'handleColor', 'radius', 'handleShape', 'data.value', 'data.min', 'data.max', 'data.step'].every((x) => sprops.includes(x)), JSON.stringify(sprops));
  await box('w', 160); await box('h', 40); await box('x', 176); await box('y', 40);
  await setPlain('data.value', 70);
  sv = await look(Sl);
  check('SLIDER preview data: value 70 through the view contract', sv.input.value === '70', JSON.stringify(sv));
  const scfg = JSON.stringify((await comp(Sl)).config);
  sc = await grip(Sl, 16, 0); sv = await look(Sl);
  check('SLIDER — NORMAL resize: the track gets longer (box 160 → 176 wide, the input with it); thickness and handle unchanged', sc.w === 176 && sc.h === 40 && sv.input.w === 176 && JSON.stringify(sc.config) === scfg && sv.input.track === '' && sv.input.thumb === '', JSON.stringify({ sc, sv }));
  await box('w', 160); await box('h', 40);
  sc = await grip(Sl, 16, 4, { shift: true }); k = sc.w / 160; sv = await look(Sl);
  check('SLIDER — SHIFT resize: one factor k (160 → 176): track thickness 8 → 9 and handle 18 → 20 (= start × k) — stored as configuration',
    Math.abs(k - 1.1) < 1e-9 && sc.h === 44 && sc.config.track === Math.round(8 * k) && sc.config.handle === Math.round(18 * k) && sv.input.track === `${Math.round(8 * k)}px` && sv.input.thumb === `${Math.round(18 * k)}px`, JSON.stringify({ sc, sv }));
  await setNum('track', 30);
  sc = await comp(Sl);
  check('SLIDER: a thicker track than its box grows the box (resize.toBox) — never shrinks it', sc.h >= 30, JSON.stringify(sc));
  await box('h', 44); await setNum('track', 9);
  sc = await comp(Sl); dc = await comp(D);

  // ---- save · reload · runtime
  await page.fill(`${S} [data-k=wst-name]`, 'Dial and slider');
  const def0 = (await state()).def;
  const studioLook = { d: await look(D), s: await look(Sl) };
  await page.click(`${S} [data-k=wst-save]`); await page.waitForTimeout(1500);
  const defId = (await state()).defId;
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.reload(); await page.waitForTimeout(1800);
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await page.waitForTimeout(400);
  const st = await state();
  const strip = (d) => JSON.stringify({ canvas: d.canvas, components: d.components });
  const reLook = { d: await look(D), s: await look(Sl) };
  check('SAVE → RELOAD: Studio reopens the dial and the slider identical (configuration, data, boxes, drawing)', /^w[0-9a-f]{16}$/.test(defId) && st.defId === defId && strip(st.def) === strip(def0) && JSON.stringify(reLook) === JSON.stringify(studioLook), JSON.stringify({ def0, def: st.def, studioLook, reLook }).slice(0, 900));
  await page.click(`${S} [data-k=wst-close]`); await page.waitForTimeout(300);
  // an INSTANCE of the definition, added through the normal gallery
  const ids0 = await E(() => window.editor.getModel().pages.flatMap((p) => p.items).map((i) => i.id));
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.waitForSelector(`.ecfg-tile[data-type="my:${defId}"]`); await page.click(`.ecfg-tile[data-type="my:${defId}"]`); await page.waitForTimeout(400);
  await page.click('dialog[open] .ecfg-foot button:has-text("Next")'); await page.waitForTimeout(200);
  await page.click('dialog[open] .ecfg-add'); await page.waitForTimeout(600);
  const itemId = (await E(() => window.editor.getModel().pages.flatMap((p) => p.items))).find((i) => !ids0.includes(i.id)).id;
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(1500);
  const RT = `[data-grid-id="${itemId}"] .stw`;
  await page.locator(RT).scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  const rt = await E(({ RT, D, Sl }) => { const r = document.querySelector(RT), q = (id) => r.querySelector(`.stw__c[data-cid="${id}"]`).firstElementChild;
    const d = q(D), s = q(Sl), inp = s.querySelector('input');
    return { d: { cls: d.className, w: d.offsetWidth, h: d.offsetHeight, l: d.offsetLeft, t: d.offsetTop, now: d.getAttribute('aria-valuenow'), text: d.textContent, sw: d.querySelector('.iqg__value path').getAttribute('stroke-width') },
      s: { cls: s.className, w: inp.offsetWidth, value: inp.value, track: getComputedStyle(s).getPropertyValue('--iqsl-h') }, chrome: r.closest('[data-grid-id]').querySelectorAll('[class*="wst"]').length }; }, { RT, D, Sl });
  check('RUNTIME: the dashboard rebuilds the Dial and the Slider from the model with the same renderers and sizes (no Studio chrome)',
    rt.d.cls === 'iqg' && rt.d.w === studioLook.d.w && rt.d.l === studioLook.d.l && rt.d.now === '70' && rt.d.text === '' && rt.d.sw === studioLook.d.sw
      && rt.s.cls === 'iqsl' && rt.s.w === studioLook.s.input.w && rt.s.value === '70' && rt.s.track === '9px' && rt.chrome === 0, JSON.stringify({ rt, studioLook }));
  // the runtime gestures: keyboard on each changes its preview value at once and is REPORTED (iq-studio-action) — nothing reaches a device
  await E((RT) => { window.__acts = []; document.querySelector(RT).addEventListener('iq-studio-action', (e) => window.__acts.push(e.detail)); }, RT);
  const haBefore = L.requests ? L.requests.length : 0;
  await page.focus(`${RT} .stw__c[data-cid="${Sl}"] input`); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
  const after = await E(({ RT, D, Sl }) => { const r = document.querySelector(RT); return { s: r.querySelector(`.stw__c[data-cid="${Sl}"] input`).value,
    dial: r.querySelector(`.stw__c[data-cid="${D}"] .iqg`).matches('[tabindex], :focus-within') || !!r.querySelector(`.stw__c[data-cid="${D}"] [tabindex]`), acts: window.__acts }; }, { RT, D, Sl });
  check('RUNTIME interaction: the slider (→ 71) changes its preview value and reports it (change event) — never a device call; the Dial is a display (no handle to focus)',
    after.s === '71' && !after.dial && JSON.stringify(after.acts) === JSON.stringify([{ kind: 'change', value: 71, component: Sl }]) && (L.requests ? L.requests.length === haBefore : true), JSON.stringify(after));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
