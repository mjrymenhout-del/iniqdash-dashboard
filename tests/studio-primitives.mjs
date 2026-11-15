/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO PRIMITIVES — the Dial (gauge) and Value / Text primitives, and a thermostat COMPOSED from them in the REAL Widget Studio
// (real PHP server, sessions, CSRF, the server-side HA layer, a FAKE Home Assistant — tests/lib/live.mjs, not a real Home Assistant).
//   1. DIAL PRIMITIVE (IniqGauge, in the page): one numeric input, no text; range; start / sweep / direction; thickness; track; value arc;
//      ticks (off · major · major + minor, position, length, thickness, colour); marker (off · dot · line · triangle, position, size);
//      face styles; effects; presets (fill the same properties, editable after); no clipping
//   2. VALUE / TEXT (IniqText): static, value, prefix / suffix / decimals / fallback, typography, alignment, background
//   3. REAL UI: three visibly different dials from the same primitive; resize (normal / Shift); editor zoom. Screenshots: $SHOTS (optional).
//      (A thermostat composed from these primitives with widget properties and source groups: tests/studio-v2.mjs.)
import fs from 'node:fs';
import path from 'node:path';
import { live, liveBrowser, ENTITIES, RAW } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
{
  const g = code('components/gauge/gauge.js');
  // the only text a dial draws is its SCALE LABELS (the designer's own label list: 10° · 20° · 30°) — never a value, a unit or a state word
  const g0 = g.replace(/const t = el\('text', \{[^\n]*class: 'iqg__label' \}\);[^\n]*\n[^\n]*t\.textContent = String\(lb\.text[^\n]*/, '');
  check('DIAL primitive source: no domain (climate, thermostat, temperature, HVAC, heating) and no text it draws except its scale labels (no textContent / <text> elsewhere)', !/climate|thermostat|temperature|hvac|heating/i.test(g) && /iqg__label/.test(g) && !/textContent|createElementNS\([^)]*'text'|['"]text['"]\s*\)/.test(g0));
  check('the built-in Climate dial (components/dial IniqDial.create) is untouched by the primitive: Climate still draws IniqDial', /IniqDial\.create\(/.test(code('widgets/default/climate/climate.js')) && !/IniqGauge/.test(code('widgets/default/climate/climate.js')));
}

Object.assign(ENTITIES, {
  'sensor.stove_temperature': ['65', { name: 'Stove temperature', unit: '°C', dc: 'temperature' }],
  'sensor.other_stove_temperature': ['40', { name: 'Other stove temperature', unit: '°C', dc: 'temperature' }],
  'sensor.living_room_temperature': ['21.5', { name: 'Living room temperature', unit: '°C', dc: 'temperature' }],
  'sensor.bedroom_temperature': ['18.25', { name: 'Bedroom temperature', unit: '°C', dc: 'temperature' }],
  'climate.lr': ['heat', { name: 'Living room climate', f: 1, cur: 21.5, target: 22.5, min: 7, max: 30, step: 0.5, modes: ['heat', 'auto', 'off'] }],
  'climate.br': ['off', { name: 'Bedroom climate', f: 1, cur: 18, target: 19, min: 7, max: 30, step: 0.5, modes: ['heat', 'auto', 'off'] }],
});
const rawClimate = (id) => { const [st, p] = ENTITIES[id]; RAW[id] = { entity_id: id, state: st, last_changed: '2026-10-23T10:00:00+00:00', last_updated: `2026-10-23T10:${String(Math.round(p.target * 10) % 60).padStart(2, '0')}:00+00:00`,
  attributes: { hvac_modes: p.modes, min_temp: p.min, max_temp: p.max, current_temperature: p.cur, temperature: p.target, friendly_name: p.name } }; };
['climate.lr', 'climate.br'].forEach(rawClimate);

let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);

  // ================================================================ 1. DIAL PRIMITIVE (the renderer itself)
  const G = await E(() => {
    const IG = window.IniqGauge, IC = window.IniqComponents, S = 200;
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:200px'; document.body.append(host);
    const draw = (c, v = 50) => { host.replaceChildren(IG.create(c, { value: v }, { w: S, h: S })); return host.firstElementChild; };
    const q = (el, s) => [...el.querySelectorAll(s)];
    const rad = (x, y) => Math.hypot(x - S / 2, y - S / 2);
    const endOf = (d) => { const m = d.match(/(-?[\d.]+) (-?[\d.]+)$/); return m ? [Number(m[1]), Number(m[2])] : null; };
    const inBox = (el) => { const b = el.querySelector('svg').getBBox(); return b.x >= -0.6 && b.y >= -0.6 && b.x + b.width <= S + 0.6 && b.y + b.height <= S + 0.6; };
    const base = { ...IG.PRESETS.minimal, preset: 'custom', min: 0, max: 100, thickness: 10, ticks: 'off', marker: true, markerStyle: 'dot', markerSize: 12, face: 'none' };
    const out = {};
    const decl = IC.get('dial').compose;
    out.inputs = Object.keys(decl.inputs); out.actions = !!decl.actions;
    let el = draw(base, 65);
    out.noText = el.textContent === '' && !el.querySelector('text, foreignObject') && el.getAttribute('aria-valuenow') === '65';
    // range: 50 of 0–100 on a 270° scale from 225° → the arc ends at 12 o'clock
    el = draw({ ...base, start: 225, sweep: 270 }, 50); const e50 = endOf(el.querySelector('.iqg__value path').getAttribute('d'));
    out.mid = Math.abs(e50[0] - 100) < 0.6 && e50[1] < 100;
    el = draw({ ...base, min: 50, max: 150 }, 100); const e2 = endOf(el.querySelector('.iqg__value path').getAttribute('d'));
    out.range = Math.abs(e2[0] - 100) < 0.6 && el.getAttribute('aria-valuemin') === '50';
    el = draw({ ...base }, 200); out.clamp = !!el.querySelector('.iqg__value path');
    el = draw({ ...base }, null); out.empty = !el.querySelector('.iqg__value') && !el.querySelector('.iqg__marker') && el.dataset.empty === 'true';
    // direction: start 0, a full circle, 25 % → 3 o'clock clockwise, 9 o'clock counter-clockwise
    const mk = (c) => { const m = draw(c, 25).querySelector('.iqg__marker'); return [Number(m.getAttribute('cx')), Number(m.getAttribute('cy'))]; };
    const cw = mk({ ...base, start: 0, sweep: 360, direction: 'cw' }), ccw = mk({ ...base, start: 0, sweep: 360, direction: 'ccw' });
    out.dir = cw[0] > 150 && Math.abs(cw[1] - 100) < 1 && ccw[0] < 50 && Math.abs(ccw[1] - 100) < 1;
    el = draw({ ...base, start: 0, sweep: 360 }, 100); out.full = (el.querySelector('.iqg__track').getAttribute('d').match(/A/g) || []).length === 2;
    el = draw({ ...base, start: 270, sweep: 180 }, 50); const half = endOf(el.querySelector('.iqg__value path').getAttribute('d'));
    out.semi = Math.abs(half[0] - 100) < 0.6 && half[1] < 50;          // 270° → 90° clockwise over the top: 50 % at 12 o'clock
    // thickness · arc ends
    el = draw({ ...base, thickness: 3 }); out.thin = el.querySelector('.iqg__track').getAttribute('stroke-width') === '3';
    el = draw({ ...base, thickness: 40, ends: 'flat' }); out.thick = el.querySelector('.iqg__track').getAttribute('stroke-width') === '40' && el.querySelector('.iqg__value path').getAttribute('stroke-linecap') === 'butt';
    // track
    el = draw({ ...base, trackShow: false }); out.trackOff = !el.querySelector('.iqg__track');
    el = draw({ ...base, trackColor: '#123456', trackOpacity: 40, trackThickness: 4, trackStyle: 'soft' }); const tr = el.querySelector('.iqg__track');
    out.track = tr.style.stroke === 'rgb(18, 52, 86)' && tr.getAttribute('opacity') === '0.4' && tr.getAttribute('stroke-width') === '4' && !!tr.getAttribute('filter');
    // value arc: solid colour · gradient · thickness · opacity · glow · off
    el = draw({ ...base, arcColor: '#ff0000', arcThickness: 6, arcOpacity: 50 }); const ap = el.querySelector('.iqg__value path');
    out.arc = ap.style.stroke === 'rgb(255, 0, 0)' && ap.getAttribute('stroke-width') === '6' && el.querySelector('.iqg__arc').getAttribute('opacity') === '0.5';
    el = draw({ ...base, arcGradient: true, arcColor: '#0000ff', arcColor2: '#ff0000' }, 100); const segs = q(el, '.iqg__value path');
    out.grad = segs.length > 10 && segs[0].style.stroke !== segs[segs.length - 1].style.stroke;
    el = draw({ ...base, arcGlow: 60 }); out.glow = !!el.querySelector('.iqg__glow[filter]') && !!el.querySelector('filter feGaussianBlur');
    el = draw({ ...base, arcShow: false }); out.arcOff = !el.querySelector('.iqg__arc') && !!el.querySelector('.iqg__marker');
    // ticks
    el = draw({ ...base, ticks: 'off' }); out.ticksOff = !el.querySelector('.iqg__tick');
    el = draw({ ...base, ticks: 'major', tickCount: 10 }); out.major = q(el, '.iqg__tick--major').length === 10 && q(el, '.iqg__tick').length === 10;
    el = draw({ ...base, ticks: 'minor', tickCount: 11, tickMinor: 4 }); out.minor = q(el, '.iqg__tick--major').length === 11 && q(el, '.iqg__tick').length === 11 + 10 * 4;
    const radii = (c) => { const e = draw({ ...base, ticks: 'major', tickCount: 6, ...c }); const g0 = IG.geometry(IG.resolved({ ...base, ticks: 'major', tickCount: 6, ...c }), S);
      return { R: g0.R, t: g0.ring, r: q(e, '.iqg__tick').flatMap((l) => [rad(+l.getAttribute('x1'), +l.getAttribute('y1')), rad(+l.getAttribute('x2'), +l.getAttribute('y2'))]), el: e }; };
    const ti = radii({ tickPos: 'inside', tickLen: 8, tickOffset: 2 }), to = radii({ tickPos: 'outside', tickLen: 8, tickOffset: 2 }), tc = radii({ tickPos: 'center', tickLen: 8 });
    out.tickPos = ti.r.every((x) => x <= ti.R - ti.t / 2 + 0.01) && to.r.every((x) => x >= to.R + to.t / 2 - 0.01) && tc.r.every((x) => Math.abs(x - tc.R) <= 4.01) && inBox(to.el);
    el = draw({ ...base, ticks: 'minor', tickCount: 3, tickMinor: 1, tickLen: 12, tickMinorLen: 5, tickWidth: 3, tickMinorWidth: 1, tickColor: '#00ff00', tickMinorColor: '#0000ff', tickOpacity: 30 });
    const mj = el.querySelector('.iqg__tick--major'), mn = el.querySelector('.iqg__tick:not(.iqg__tick--major)'), len = (l) => Math.hypot(l.getAttribute('x2') - l.getAttribute('x1'), l.getAttribute('y2') - l.getAttribute('y1'));
    out.tickLook = Math.abs(len(mj) - 12) < 0.05 && Math.abs(len(mn) - 5) < 0.05 && mj.getAttribute('stroke-width') === '3' && mn.getAttribute('stroke-width') === '1'
      && mj.style.stroke === 'rgb(0, 255, 0)' && mn.style.stroke === 'rgb(0, 0, 255)' && el.querySelector('.iqg__ticks').getAttribute('opacity') === '0.3';
    // marker
    el = draw({ ...base, marker: false }); out.markerOff = !el.querySelector('.iqg__marker');
    out.markerStyles = ['dot', 'line', 'triangle'].map((m) => draw({ ...base, markerStyle: m }).querySelector('.iqg__marker').tagName).join() === 'circle,line,polygon';
    const mpos = (p) => { const c = { ...base, start: 0, sweep: 360, markerPos: p, markerSize: 10 }, m = draw(c, 25).querySelector('.iqg__marker'), g0 = IG.geometry(IG.resolved(c), S); return [rad(+m.getAttribute('cx'), +m.getAttribute('cy')), g0.R, g0.ring]; };
    const [pi, R1, t1] = mpos('inside'), [pc, R2] = mpos('center'), [po, R3, t3] = mpos('outside');
    out.markerPos = pi < R1 - t1 / 2 && Math.abs(pc - R2) < 0.05 && po > R3 + t3 / 2;
    el = draw({ ...base, markerSize: 30, markerColor: '#ff00ff', markerOutline: '#000000', markerOutlineWidth: 2, markerGlow: 50 }); const m30 = el.querySelector('.iqg__marker');
    out.markerLook = m30.getAttribute('r') === '15' && m30.style.fill === 'rgb(255, 0, 255)' && m30.getAttribute('stroke-width') === '2' && !!m30.getAttribute('filter') && inBox(el);
    // face
    out.faces = ['none', 'solid', 'soft', 'glass', 'deep'].map((f) => { const e = draw({ ...base, face: f, faceColor: '#334455', faceBorder: 2, faceDepth: 'raised' }); return f === 'none' ? !e.querySelector('.iqg__face') : e.querySelector('.iqg__face').dataset.style === f && !!e.querySelector('.iqg__border') && !!e.querySelector('.iqg__face[filter]'); }).every(Boolean);
    // presets: the SAME properties; editing after a preset is just another property value
    out.presets = Object.entries(IG.PRESETS).map(([k, p]) => { const e = draw({ ...p, preset: k }); return e.className === 'iqg' && inBox(e); }).every(Boolean) && Object.keys(IG.PRESETS).join() === 'spectrum,minimal,arc,full,digital';
    el = draw({ ...IG.PRESETS.spectrum, preset: 'spectrum', thickness: 24 }); out.afterPreset = el.querySelector('.iqg__track').getAttribute('stroke-width') === '24';
    // no clipping at extremes
    out.noClip = [{ ...base, thickness: 60, ticks: 'minor', tickPos: 'outside', tickLen: 20, markerPos: 'outside', markerSize: 24 }, { ...base, inset: 0, thickness: 1 }, { ...IG.PRESETS.full, preset: 'full' }].every((c) => inBox(draw(c, 77)));
    host.remove();
    return out;
  });
  check('DIAL: ONE numeric input (value), no actions — and no text, no label, no "Now", no target inside it', JSON.stringify(G.inputs) === JSON.stringify(['value']) && !G.actions && G.noText, JSON.stringify(G));
  check('DIAL range: 50 of 0–100 on 225° + 270° sits at 12 o\'clock; 100 of 50–150 likewise; beyond the maximum is clamped; no value → no arc and no marker', G.mid && G.range && G.clamp && G.empty);
  check('DIAL geometry: clockwise / counter-clockwise (25 % of a full circle from 12 o\'clock: 3 vs 9 o\'clock); a full circle (two arcs); a semi-circle (270° + 180°)', G.dir && G.full && G.semi);
  check('DIAL thickness (3 px · 40 px) and arc ends (flat → butt)', G.thin && G.thick);
  check('DIAL track: off; colour, opacity, own thickness, soft style', G.trackOff && G.track);
  check('DIAL value arc: colour, thickness, opacity; gradient (start → end colour); glow; off (the marker stays)', G.arc && G.grad && G.glow && G.arcOff);
  check('DIAL ticks: off · major only (10) · major + minor (11 + 10 × 4); inside / centred / outside the ring (never clipped); lengths, thicknesses, colours, opacity', G.ticksOff && G.major && G.minor && G.tickPos && G.tickLook, JSON.stringify(G));
  check('DIAL marker: off · dot · line · triangle; inside / centred / outside; size, colour, outline, glow (never clipped)', G.markerOff && G.markerStyles && G.markerPos && G.markerLook);
  check('DIAL face: none · solid · soft · glass · deep, with a border and a raised shadow', G.faces);
  check('DIAL presets: Spectrum ring · Minimal ring · State arc · Full dial · Digital ring — one renderer; a property edited after a preset (thickness 24) is honoured; nothing clipped at the extremes', G.presets && G.afterPreset && G.noClip);

  // ================================================================ 2. VALUE / TEXT (the renderer)
  const T = await E(() => {
    const IT = window.IniqText, host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:160px;height:50px'; document.body.append(host);
    const draw = (c, d = {}) => { host.replaceChildren(IT.create(c, d, { w: 160, h: 50 })); return host.firstElementChild; };
    const st = (e) => getComputedStyle(e);
    const o = {};
    o.static = draw({ mode: 'static', text: 'Room' }, { value: 99 }).textContent === 'Room';
    o.value = draw({ mode: 'value' }, { value: 21.5 }).textContent === '21.5';
    o.fmt = draw({ mode: 'value', prefix: 'Target', suffix: '°', decimals: 0 }, { value: 22.6 }).textContent === 'Target 23°' && draw({ mode: 'value', decimals: 2 }, { value: '18.5' }).textContent === '18.50';
    o.text = draw({ mode: 'value', suffix: '' }, { value: 'heat' }).textContent === 'heat';
    o.fallback = draw({ mode: 'value', fallback: 'n/a' }, { value: null, status: 'unavailable' }).textContent === 'n/a' && draw({ mode: 'value' }, { value: 5, status: 'missing' }).textContent === '—';
    let e = draw({ mode: 'static', text: 'X', fontSize: 30, fontWeight: 700, color: '#ff0000', opacity: 50, align: 'right', valign: 'bottom', lineHeight: 1.5, letterSpacing: 2 });
    o.typo = st(e).fontSize === '30px' && st(e).fontWeight === '700' && st(e).color === 'rgb(255, 0, 0)' && st(e).opacity === '0.5' && st(e).justifyContent === 'flex-end' && st(e).alignItems === 'flex-end' && st(e).lineHeight === '45px' && st(e).letterSpacing === '2px';
    e = draw({ mode: 'static', text: 'X' }); o.transparent = st(e).backgroundColor === 'rgba(0, 0, 0, 0)' && st(e).justifyContent === 'center';
    e = draw({ mode: 'static', text: 'X', background: 'solid', bgColor: '#00ff00', bgOpacity: 100, padding: 4, radius: 10 }); o.bg = /0, 255, 0|srgb 0 1 0/.test(st(e).backgroundColor) && st(e).padding === '4px' && st(e).borderRadius === '10px';
    host.remove();
    return o;
  });
  check('VALUE / TEXT: static text; a value; prefix + suffix + decimals ("Target 23°", "18.50"); a text value; fallback when unavailable / not found', T.static && T.value && T.fmt && T.text && T.fallback, JSON.stringify(T));
  check('VALUE / TEXT appearance: font size, weight, colour, opacity, alignment (horizontal / vertical), line height, letter spacing; transparent by default; a solid background with padding and radius', T.typo && T.transparent && T.bg, JSON.stringify(T));

  // ================================================================ 3. REAL UI — three visibly different dials from ONE primitive (the composed thermostat: tests/studio-v2.mjs)
  const S = 'dialog.wst[open]', P = `${S} .wst__props`, F = (k) => `${P} .ef-field[data-key="${k}"]`;
  const state = () => E((S) => document.querySelector(S).studio.state(), S);
  const comp = async (id) => (await state()).def.components.find((c) => c.id === id);
  const add = async (t) => { await page.click(`${S} [data-k=wst-add][data-type=${t}]`); await page.waitForTimeout(250); return (await state()).sel; };
  const select = async (id) => { await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id }); await page.waitForTimeout(200); };
  const box = async (k, v) => { await page.fill(`${P} [data-k=wst-${k}]`, String(v)); await page.press(`${P} [data-k=wst-${k}]`, 'Tab'); await page.waitForTimeout(150); };
  const place = async (x, y, w, h) => { await box('w', w); await box('h', h); await box('x', x); await box('y', y); };
  const setSel = async (k, v) => { await page.selectOption(`${F(k)} select`, v); await page.waitForTimeout(250); };
  const setNum = async (k, v) => { const i = `${F(k)} input.ef-range__n`; await page.fill(i, String(v)); await page.press(i, 'Enter'); await page.waitForTimeout(150); };
  const setPlain = async (k, v) => { await page.fill(`${F(k)} input`, String(v)); await page.waitForTimeout(200); };
  const setCol = async (k, v) => { await page.click(`${F(k)} .ef-icon[data-value="${v}"]`); await page.waitForTimeout(150); };
  const toggle = async (k) => { await page.click(`${F(k)} .ef-switch`); await page.waitForTimeout(150); };
  const until = async (fn, arg, ms = 8000) => { try { await page.waitForFunction(fn, arg, { timeout: ms }); return true; } catch (e) { return false; } };
  const settledAll = () => until(({ S }) => document.querySelector(S).studio.state().def.components.every((x) => !x.binding || !x.binding.auto), { S });
  const pick = async (root, id) => { await page.click(`${root} [data-k=iqp-choose]`); await page.waitForTimeout(250); await page.fill(`${root} .iqp__search`, id); await page.waitForTimeout(250);
    await page.click(`${root} .iqp__item[data-entity="${id}"]`); await page.waitForTimeout(400); };
  const node = (id) => `${S} [data-k=wst-board] .stw__c[data-cid="${id}"]`;
  const gauge = (id) => E((sel) => { const g = document.querySelector(sel + ' .iqg'); if (!g) return null; const b = g.querySelector('svg').getBBox(), S0 = g.offsetWidth;
    return { now: g.getAttribute('aria-valuenow'), text: g.textContent, w: g.offsetWidth, h: g.offsetHeight, l: g.offsetLeft, t: g.offsetTop, sw: g.querySelector('.iqg__track')?.getAttribute('stroke-width'),
      ticks: g.querySelectorAll('.iqg__tick').length, marker: g.querySelector('.iqg__marker')?.tagName || null, mr: g.querySelector('.iqg__marker')?.getAttribute('r') || null,
      inside: b.x >= -0.6 && b.y >= -0.6 && b.x + b.width <= S0 + 0.6 && b.y + b.height <= S0 + 0.6 }; }, node(id));
  const shot = async (sel, name) => { if (SHOTS) await (await page.$(sel)).screenshot({ path: path.join(SHOTS, name) }); };

  await E(() => window.IniqStudioLibrary.createCollection('Robin'));
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S);
  await page.click(`${S} [data-k=wst-new-empty]`); await page.waitForTimeout(300);
  await page.click(`${S} [data-k=wst-snap-smart]`);                      // grid snap only: predictable numbers
  await select(null); await setPlain('name', 'Dial designs'); await setSel('category', 'sensors');
  const A = await add('dial'); await place(8, 8, 112, 112);
  await setSel('preset', 'minimal'); await setNum('thickness', 2); await setSel('ticks', 'off'); await setNum('markerSize', 6); await setNum('start', 210); await setNum('sweep', 300);
  const Bd = await add('dial'); await place(128, 8, 112, 112);
  await setSel('preset', 'full'); await setNum('thickness', 16); await setSel('ticks', 'minor'); await setSel('tickPos', 'outside'); await setNum('markerSize', 20); await setSel('markerStyle', 'dot'); await setSel('face', 'deep');
  const C = await add('dial'); await place(248, 8, 112, 112);
  await setSel('preset', 'arc'); await setNum('start', 270); await setNum('sweep', 180); await setSel('ends', 'flat'); await setSel('ticks', 'major'); await setPlain('tickCount', 7); await setSel('face', 'none');
  for (const [id, v] of [[A, 30], [Bd, 72], [C, 55]]) { await select(id); await setPlain('data.value', v); }
  await select(null); await shot(`${S} .wst__board`, 'dial-designs.png');
  const designs = {};
  for (const id of [A, Bd, C]) designs[id] = { cfg: (await comp(id)).config, g: await gauge(id), cls: await E((s) => document.querySelector(s + ' > *').className, node(id)) };
  check('THREE DESIGNS from the SAME Dial primitive: A thin minimal ring (2 px, no ticks, small marker, 300° opening) · B heavy instrument (16 px, major + minor outside ticks, large marker, deep face) · C semi-circle (180°, flat ends, major ticks, no face)',
    Object.values(designs).every((d) => d.cls === 'iqg' && d.g.inside) && designs[A].g.sw === '2' && designs[A].g.ticks === 0 && designs[A].g.mr === '3'
      && designs[Bd].g.sw === '16' && designs[Bd].g.ticks > 40 && designs[Bd].g.mr === '10' && designs[Bd].cfg.face === 'deep'
      && designs[C].cfg.sweep === 180 && designs[C].cfg.ends === 'flat' && designs[C].g.ticks === 7 && designs[C].cfg.face === 'none', JSON.stringify(designs));
  // resize each (normal: geometry follows the box; set sizes stay) — and Shift (set sizes scale)
  const rs = {};
  for (const id of [A, Bd, C]) { await select(id); const x = await comp(id); await box('w', 96); await box('h', 96); rs[id] = await gauge(id); await box('w', x.w); await box('h', x.h); }
  check('RESIZE each dial 112 → 96: the geometry follows the box (96), set thickness / marker / tick count stay, value mapping unchanged, nothing clipped',
    Object.entries(rs).every(([id, g]) => g.w === 96 && g.sw === designs[id].g.sw && g.mr === designs[id].g.mr && g.ticks === designs[id].g.ticks && g.now === designs[id].g.now && g.inside), JSON.stringify(rs));
  // Shift resize: drag the corner with Shift
  await select(Bd);
  const scr = (x, y) => E(({ S, x, y }) => { const b = document.querySelector(`${S} [data-k=wst-board]`), r = b.getBoundingClientRect(), c = document.querySelector(S).studio.state().def.canvas; return { x: r.left + x * r.width / c.w, y: r.top + y * r.height / c.h }; }, { S, x, y });
  const bx = await comp(Bd), a0 = await scr(bx.x + bx.w, bx.y + bx.h), a1 = await scr(bx.x + bx.w + 28, bx.y + bx.h + 28);
  await page.mouse.move(a0.x, a0.y); await page.mouse.down(); await page.keyboard.down('Shift'); await page.mouse.move(a1.x, a1.y, { steps: 5 }); await page.mouse.up(); await page.keyboard.up('Shift'); await page.waitForTimeout(300);
  const sh = await comp(Bd), k = sh.w / 112;
  check(`SHIFT resize (112 → ${sh.w}, snapped to the grid): the set sizes scale by the same factor k = ${k.toFixed(3)} — thickness 16 → ${Math.round(16 * k)}, marker 20 → ${Math.round(20 * k)}, tick length 9 → ${Math.round(9 * k)}`,
    k > 1.1 && sh.h === sh.w && sh.config.thickness === Math.round(16 * k) && sh.config.markerSize === Math.round(20 * k) && sh.config.tickLen === Math.round(9 * k) && (await gauge(Bd)).sw === String(Math.round(16 * k)), JSON.stringify(sh));
  // the editor's ZOOM (a smaller window scales the canvas) changes no logical value
  const cfgZ = JSON.stringify((await state()).def.components);
  await page.setViewportSize({ width: 1100, height: 800 }); await page.waitForTimeout(500);
  const zoomed = { cfg: JSON.stringify((await state()).def.components), g: await gauge(Bd) };
  await page.setViewportSize({ width: 1600, height: 1000 }); await page.waitForTimeout(400);
  check('EDITOR ZOOM: a smaller window scales the canvas on screen; the logical boxes, configuration and the gauge\'s logical size stay', zoomed.cfg === cfgZ && zoomed.g.w === sh.w, JSON.stringify(zoomed.g));
  await page.click(`${S} [data-k=wst-save]`); await page.waitForTimeout(1200);
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
