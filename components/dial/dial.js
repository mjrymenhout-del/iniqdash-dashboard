/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqDial — the shared DIAL (docs/COMPONENT-FOUNDATION.md, "Dial"): a value on a circular scale, with a settable value on the ring.
   One renderer, five designs over the same model — 'spectrum' (Spectrum ring) · 'minimal' (Minimal ring) · 'arc' (State arc) · 'full'
   (Full dial) · 'digital' (Digital ring) — plus 'bare' (a readout without a ring). It knows no domain: no entity, no thermostat, no
   temperature; its owner gives it a normalised VIEW and is told what the user did.

   IniqDial.create({ design, onInput(value, source), onCommit(value, source, from), onDrag(active, from) }) → <div class="iqdl"> with
     el.dial = { update(view, look), slots: { top, upper-left, upper-right, lower-left, lower-right, bottom } (digital), knob, geometry }
   VIEW (what is true — the owner's normalised data):
     { min, max, step, decimals (display), unit (shown after the value), value (the big number: a number, or null → '–'),
       valueText ('Off' style text instead of the number, or a range such as '20–24'), off (bool: the device is off),
       setpoint (the value the ring SETS and marks: number | null), current (a second value marked on the ring: number | null),
       range: { low, high } | null (a span instead of one setpoint), tone: 'warm' | 'cool' | 'idle' (its state colour),
       action (a short word above the value, '' none), label ('' none), secondary: { text, value } | null (e.g. a line "Now 21.4"),
       icon: 'mdi:…' (the Full dial's emblem, '' none), interactive (bool, or () → bool asked at the gesture: the setpoint may be dragged / keyed),
       name (the handle's accessible name), valueText for the handle: aria (e.g. '22.5 °C') }
   LOOK (how it looks — configuration): { ticks, minmax, ring: 'state' | 'gradient', arc: 'solid' | 'glow', density: 'detailed' | 'simple',
     face: 'filled' | 'dark', marker, thickness (1–16), surface: 'clean' | 'soft' | 'glass' | 'deep', depth: 'soft' | 'flat' | 'raised',
     activeArc, ringColor, warmColor, coolColor, idleColor (a token or #rrggbb), valueSize (16–160 px), labelSize (8–40 px), showCurrent,
     showAction, showLabel }
   INTERACTION: dragging along the ring (mouse / pen anywhere on it; touch only from the handle) or the handle's keys report the new
   setpoint — onInput while it moves, onCommit at the end (or a key). The OWNER decides what it means (and whether it is now true).
   ========================================================================== */
(function (global) {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const DESIGNS = ['spectrum', 'minimal', 'arc', 'full', 'digital', 'knob'];
  const SLOTS = ['top', 'upper-left', 'upper-right', 'lower-left', 'lower-right', 'bottom'];
  /** each design's scale: where it starts and how far it sweeps (degrees, clockwise from 3 o'clock) and its ring radius (of 200) */
  const GEOM = { spectrum: { start: 135, sweep: 270, r: 78 }, minimal: { start: 135, sweep: 270, r: 84 }, arc: { start: 135, sweep: 270, r: 82 }, full: { start: 120, sweep: 300, r: 79 }, digital: { start: 135, sweep: 270, r: 95 }, knob: { start: 135, sweep: 270, r: 68 } };
  const HEX = /^#[0-9a-fA-F]{6}$/, TOKENS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];
  const colour = (v) => (typeof v === 'string' ? (HEX.test(v) ? v.toLowerCase() : TOKENS.includes(v) ? `var(--${v})` : '') : '');
  let uid = 0;
  const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const svg = (tag, attrs = {}) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const polar = (r, deg) => { const a = (deg * Math.PI) / 180; return [100 + r * Math.cos(a), 100 + r * Math.sin(a)]; };
  const arcPath = (r, a0, a1) => {
    if (a1 - a0 < 0.05) return '';
    const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  const finite = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);

  /* ---------------------------------------------------------------- the dial's elements for a design */
  function build(design, id) {
    const G = GEOM[design];
    const wrap = h('div', 'iqdl');
    wrap.dataset.design = design;
    wrap.dataset.iqControl = '';                     // dragged to set its value: never a card gesture
    const g = svg('svg', { viewBox: '0 0 200 200', class: 'iqdl__svg', 'aria-hidden': 'true' });
    g.innerHTML = `<defs>
        <radialGradient id="${id}-plate" cx=".5" cy=".38" r=".7"><stop offset="0" style="stop-color:var(--iqdl-plate-hi)"/><stop offset="1" style="stop-color:var(--iqdl-plate-lo)"/></radialGradient>
        <radialGradient id="${id}-glow" cx=".5" cy=".5" r=".5"><stop offset=".55" style="stop-color:var(--iqdl-tone);stop-opacity:0"/><stop offset=".8" style="stop-color:var(--iqdl-tone);stop-opacity:.16"/><stop offset="1" style="stop-color:var(--iqdl-tone);stop-opacity:0"/></radialGradient>
        <radialGradient id="${id}-face" cx=".5" cy=".35" r=".75"><stop offset="0" style="stop-color:var(--iqdl-face-hi)"/><stop offset="1" style="stop-color:var(--iqdl-face-lo)"/></radialGradient>
        <radialGradient id="${id}-dface" cx=".5" cy=".4" r=".62"><stop offset="0" style="stop-color:var(--iqdl-dface-hi)"/><stop offset="1" style="stop-color:var(--iqdl-dface-lo)"/></radialGradient>
        <linearGradient id="${id}-drim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--iqdl-drim-hi)"/><stop offset="1" style="stop-color:var(--iqdl-drim-lo)"/></linearGradient>
        <linearGradient id="${id}-dglass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>`;
    const P = {};
    const add = (k, tag, attrs) => { P[k] = svg(tag, attrs); g.append(P[k]); return P[k]; };
    const ticks = (r0, r1, every, major, cls) => {
      const grp = svg('g', { class: cls });
      for (let a = 0, i = 0; a <= G.sweep + 0.01; a += every, i++) {
        const [x0, y0] = polar(r0 - (i % major === 0 ? 3 : 0), G.start + a), [x1, y1] = polar(r1, G.start + a);
        const t = svg('line', { x1: x0.toFixed(2), y1: y0.toFixed(2), x2: x1.toFixed(2), y2: y1.toFixed(2), class: i % major === 0 ? 'iqdl__tick iqdl__tick--major' : 'iqdl__tick' });
        t.dataset.a = String(a);
        grp.append(t);
      }
      g.append(grp); return grp;
    };
    if (design === 'spectrum') {
      add('glow', 'circle', { cx: 100, cy: 100, r: 98, fill: `url(#${id}-glow)`, class: 'iqdl__glow' });
      P.ticks = ticks(88, 94, 5, 9, 'iqdl__ticks');
      add('track', 'path', { d: arcPath(G.r, G.start, G.start + G.sweep), class: 'iqdl__track' });
      P.grad = svg('g', { class: 'iqdl__grad' }); g.append(P.grad);
      const N = 54;
      for (let i = 0; i < N; i++) {                         // the gradient ring: cool → neutral → warm along the scale (one arc each)
        const a0 = G.start + (G.sweep * i) / N, a1 = G.start + (G.sweep * (i + 1)) / N + 0.4, t = i / (N - 1);
        const col = t < 0.5 ? `color-mix(in srgb, var(--iqdl-cool) ${Math.round((1 - t * 2) * 100)}%, var(--iqdl-mid))` : `color-mix(in srgb, var(--iqdl-warm) ${Math.round((t - 0.5) * 200)}%, var(--iqdl-mid))`;
        const p = svg('path', { d: arcPath(G.r, a0, a1), class: 'iqdl__seg' }); p.style.stroke = col; p.dataset.t = String(t); P.grad.append(p);
      }
      add('act', 'path', { class: 'iqdl__act' });
      add('plate', 'circle', { cx: 100, cy: 100, r: 64, fill: `url(#${id}-plate)`, class: 'iqdl__plate' });
      add('rim', 'circle', { cx: 100, cy: 100, r: 64, class: 'iqdl__rim' });
      add('cur', 'circle', { r: 3, class: 'iqdl__cur' });
    } else if (design === 'minimal') {
      add('track', 'path', { d: arcPath(G.r, G.start, G.start + G.sweep), class: 'iqdl__track' });
      add('act', 'path', { class: 'iqdl__act' });
      add('cur', 'circle', { r: 2.6, class: 'iqdl__cur' });
    } else if (design === 'arc') {
      add('glow', 'circle', { cx: 100, cy: 100, r: 98, fill: `url(#${id}-glow)`, class: 'iqdl__glow' });
      add('track', 'path', { d: arcPath(G.r, G.start, G.start + G.sweep), class: 'iqdl__track' });
      add('act', 'path', { class: 'iqdl__act' });
      add('cur', 'circle', { r: 3, class: 'iqdl__cur' });
    } else if (design === 'knob') {                       // knob: a raised dark knob, a thin outer scale, a cool → warm ring lit up to the setpoint
      P.ticks = ticks(84, 90, 6.75, 5, 'iqdl__ticks');
      add('track', 'path', { d: arcPath(G.r, G.start, G.start + G.sweep), class: 'iqdl__track' });
      P.grad = svg('g', { class: 'iqdl__grad' }); g.append(P.grad);
      const N = 60;
      for (let i = 0; i < N; i++) {                         // cool (blue) → fresh (teal) → warm (red) along the scale
        const a0 = G.start + (G.sweep * i) / N, a1 = G.start + (G.sweep * (i + 1)) / N + 0.4, t = i / (N - 1);
        const col = t < 0.5 ? `color-mix(in srgb, var(--iqdl-mid-k) ${Math.round(t * 200)}%, var(--iqdl-cool))` : `color-mix(in srgb, var(--iqdl-warm-k) ${Math.round((t - 0.5) * 200)}%, var(--iqdl-mid-k))`;
        const p = svg('path', { d: arcPath(G.r, a0, a1), class: 'iqdl__seg' }); p.style.stroke = col; p.dataset.t = String(t); P.grad.append(p);
      }
      add('plate', 'circle', { cx: 100, cy: 100, r: 60, fill: `url(#${id}-plate)`, class: 'iqdl__plate' });
      add('rim', 'circle', { cx: 100, cy: 100, r: 60, class: 'iqdl__rim' });
      const [mx, my] = polar(97, G.start + G.sweep / 2);
      add('mid', 'text', { x: mx.toFixed(1), y: (my - 2).toFixed(1), class: 'iqdl__mm', 'text-anchor': 'middle' });
    } else if (design === 'digital') {                    // digital: a device face, a THIN ring in the state colour, a clean large value
      add('rim', 'circle', { cx: 100, cy: 100, r: 99, fill: `url(#${id}-drim)`, class: 'iqdl__drim' });
      add('face', 'circle', { cx: 100, cy: 100, r: 91.5, fill: `url(#${id}-dface)`, class: 'iqdl__dface' });
      add('glass', 'ellipse', { cx: 100, cy: 58, rx: 70, ry: 42, fill: `url(#${id}-dglass)`, class: 'iqdl__dglass' });
      P.ticks = ticks(84, 88, 11.25, 4, 'iqdl__ticks iqdl__ticks--sparse');
      add('ring', 'circle', { cx: 100, cy: 100, r: G.r, class: 'iqdl__dring' });
      add('act', 'path', { class: 'iqdl__act' });
    } else {                                               // full: a graphical face, dense perimeter ticks, marked setpoint and current
      add('face', 'circle', { cx: 100, cy: 100, r: 97, fill: `url(#${id}-face)`, class: 'iqdl__face' });
      P.ticks = ticks(70, 86, 2.5, 12, 'iqdl__ticks iqdl__ticks--dense');
      add('tmark', 'line', { class: 'iqdl__tmark' });
      add('cmark', 'line', { class: 'iqdl__cmark' });
      add('tlab', 'text', { class: 'iqdl__tlab', 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
      add('clab', 'text', { class: 'iqdl__clab', 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    }
    if (design !== 'minimal' && design !== 'digital') {   // the scale's ends
      const mr = design === 'full' ? 70 : design === 'knob' ? 99 : 96, ma = design === 'full' ? 3 : design === 'knob' ? 45 : 0;
      const [x0, y0] = polar(mr, G.start + ma), [x1, y1] = polar(mr, G.start + G.sweep - ma);
      add('min', 'text', { x: x0.toFixed(1), y: (y0 + (design === 'full' ? 0 : 8)).toFixed(1), class: 'iqdl__mm', 'text-anchor': 'middle' });
      add('max', 'text', { x: x1.toFixed(1), y: (y1 + (design === 'full' ? 0 : 8)).toFixed(1), class: 'iqdl__mm', 'text-anchor': 'middle' });
    }
    const ro = h('div', 'iqdl__ro');
    const act = h('span', 'iqdl__act-t'), val = h('span', 'iqdl__target'), lab = h('span', 'iqdl__label'), room = h('span', 'iqdl__room'), fico = h('span', 'iqdl__fico');
    fico.setAttribute('aria-hidden', 'true');
    ro.append(act, val, lab, room);
    const knob = h('div', 'iqdl__knob');
    knob.tabIndex = 0;
    knob.setAttribute('role', 'slider');
    // the Digital ring's content places (structured: never coordinates) — the owner fills them
    const slots = {};
    if (design === 'digital') {
      const box = h('div', 'iqdl__dinfo');
      SLOTS.forEach((k) => { const d = h('div', 'iqdl__dslot'); d.dataset.slot = k; slots[k] = d; box.append(d); });
      wrap.append(g, box, ro, fico, knob);
    } else wrap.append(g, ro, fico, knob);
    return { el: wrap, G, P, act, val, lab, room, fico, knob, ro, slots };
  }

  /* ---------------------------------------------------------------- the component */
  function create({ design = 'spectrum', onInput = null, onCommit = null, onDrag = null } = {}) {
    const bare = design === 'bare', id = `iqdl${++uid}`;
    const D = build(bare ? 'arc' : DESIGNS.includes(design) ? design : 'spectrum', id);
    if (bare) D.el.dataset.design = 'bare';
    const G = D.G;
    let v = { min: 0, max: 100, step: 1, decimals: 0 }, look = {};
    const span = () => Math.max(1e-9, v.max - v.min);
    const angleOf = (x) => G.start + (G.sweep * (Math.min(v.max, Math.max(v.min, x)) - v.min)) / span();
    const quant = (x) => +Math.min(v.max, Math.max(v.min, v.min + Math.round((x - v.min) / v.step) * v.step)).toFixed(6);
    const fmt = (x) => (finite(x) ? (+x).toFixed(v.decimals) : '–');
    const canDrag = () => (typeof v.interactive === 'function' ? !!v.interactive() : !!v.interactive) && !bare && finite(v.setpoint);

    /* ---- interaction: the same model for every design (drag on the ring, the keyboard handle) */
    D.knob.addEventListener('keydown', (e) => {
      if (!canDrag()) return;
      const map = { ArrowUp: v.step, ArrowRight: v.step, ArrowDown: -v.step, ArrowLeft: -v.step, PageUp: 1, PageDown: -1 };
      let x = null;
      if (e.key in map) x = v.setpoint + map[e.key];
      else if (e.key === 'Home') x = v.min;
      else if (e.key === 'End') x = v.max;
      if (x === null) return;
      e.preventDefault();
      if (onCommit) onCommit(quant(x), 'keyboard');
    });
    let drag = null;
    const valueAt = (e, prev) => {
      const r = D.el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      let rel = ((Math.atan2(dy, dx) * 180) / Math.PI - G.start + 720) % 360;
      if (rel > G.sweep) { const nearMax = prev !== undefined ? prev > (v.min + v.max) / 2 : rel < G.sweep + (360 - G.sweep) / 2; rel = nearMax ? G.sweep : 0; }
      return quant(v.min + (rel / G.sweep) * (v.max - v.min));
    };
    // touch only when the gesture starts on the handle (a swipe over the dial scrolls the page); mouse / pen: anywhere on the ring
    D.el.addEventListener('pointerdown', (e) => {
      if (!canDrag() || e.button > 0) return;
      const onKnob = e.target === D.knob;
      if (e.pointerType === 'touch' && !onKnob) return;
      const r = D.el.getBoundingClientRect();
      const dd = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / (r.width / 2);
      if (!onKnob && (dd < 0.58 || dd > 1.02)) return;
      e.preventDefault();
      D.el.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, from: v.setpoint };
      D.el.classList.add('is-dragging');
      if (onDrag) onDrag(true, drag.from);
      if (!onKnob && onInput) onInput(valueAt(e), 'dial');
      D.knob.focus({ preventScroll: true });
    });
    D.el.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) { const x = valueAt(e, v.setpoint); if (x !== v.setpoint && onInput) onInput(x, 'dial'); } });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const from = drag.from; drag = null; D.el.classList.remove('is-dragging');
      if (onDrag) onDrag(false, from);
      if (v.setpoint !== from && onCommit) onCommit(v.setpoint, 'dial-end', from);
    };
    D.el.addEventListener('pointerup', end);
    D.el.addEventListener('pointercancel', end);

    /* ---- update: the look (configuration), then the view (what is true) */
    const big = (x) => { const [ip, fp] = fmt(x).split('.'); return [h('span', 'iqdl__int', ip), h('span', 'iqdl__dec', fp !== undefined ? `.${fp}` : ''), h('span', 'iqdl__deg', v.unit || '')]; };
    function applyLook(L = {}) {
      look = L;
      const el = D.el, set = (k, x) => { if (x) el.style.setProperty(k, x); else el.style.removeProperty(k); };
      set('--iqdl-vsz', num(L.valueSize, 16, 160) !== null ? `${num(L.valueSize, 16, 160)}px` : '');
      set('--iqdl-lsz', num(L.labelSize, 8, 40) !== null ? `${num(L.labelSize, 8, 40)}px` : '');
      set('--iqdl-warm', colour(L.warmColor)); set('--iqdl-cool', colour(L.coolColor)); set('--iqdl-idle', colour(L.idleColor));
      const design0 = el.dataset.design;
      el.dataset.ticks = design0 === 'digital' ? (L.ticks === true ? 'on' : 'off') : L.ticks === false ? 'off' : 'on';   // the Digital ring: none unless asked
      el.dataset.minmax = L.minmax === false ? 'off' : 'on';
      el.dataset.ring = L.ring === 'gradient' ? 'gradient' : 'state';
      el.dataset.arc = L.arc === 'glow' ? 'glow' : 'solid';
      el.dataset.density = L.density === 'simple' ? 'simple' : 'detailed';
      el.dataset.face = L.face === 'dark' ? 'dark' : 'filled';
      el.dataset.marker = L.marker === false ? 'off' : 'on';
      set('--iqdl-thick', ['minimal', 'digital'].includes(design0) && num(L.thickness, 1, 16) !== null ? String(num(L.thickness, 1, 16)) : '');
      if (design0 === 'digital') {
        el.dataset.activeArc = L.activeArc === true ? 'on' : 'off';
        el.dataset.surface = ['soft', 'glass', 'deep'].includes(L.surface) ? L.surface : 'clean';
        el.dataset.depth = ['flat', 'raised'].includes(L.depth) ? L.depth : 'soft';
        set('--iqdl-dring', colour(L.ringColor));
      }
    }
    function applyView(view = {}) {
      v = { min: 0, max: 100, step: 1, decimals: 0, ...view };
      v.min = Number(v.min); v.max = Number(v.max) > v.min ? Number(v.max) : v.min + 1; v.step = Number(v.step) > 0 ? Number(v.step) : 1;
      const P = D.P, off = !!v.off, rangeOnly = !!(v.range && finite(v.range.low) && finite(v.range.high)) && !finite(v.setpoint);
      D.el.dataset.tone = ['warm', 'cool'].includes(v.tone) ? v.tone : 'idle';
      D.el.dataset.off = off ? 'true' : 'false';
      // the readout: the action, the big value (or its text), the label, the secondary line
      D.val.replaceChildren(...(off ? [h('span', 'iqdl__off', v.valueText || 'Off')] : typeof v.valueText === 'string' && v.valueText ? [h('span', 'iqdl__int', v.valueText), h('span', 'iqdl__deg', v.unit || '')]
        : finite(v.value) ? big(v.value) : [h('span', 'iqdl__int', '–')]));
      D.act.textContent = look.showAction !== false && v.action && !off ? v.action : '';
      D.act.hidden = !D.act.textContent;
      D.lab.textContent = off || look.showLabel === false ? '' : v.label || '';
      D.lab.hidden = !D.lab.textContent;
      D.room.replaceChildren();
      if (v.secondary && v.secondary.value !== undefined && v.secondary.value !== null) D.room.append(v.secondary.text || '', h('b', '', String(v.secondary.value)));
      D.room.hidden = !D.room.childNodes.length;
      D.fico.dataset.mdi = typeof v.icon === 'string' ? v.icon : '';
      D.fico.replaceChildren(); if (global.IniqIcons && v.icon) global.IniqIcons.fill(D.fico);
      D.fico.hidden = !(look.showAction !== false && D.el.dataset.design === 'full' && v.icon);
      // the ring: the setpoint (or the range) lit; the current value marked
      const t = v.setpoint, c = look.showCurrent === false ? null : v.current, hasT = finite(t), showSet = (hasT || rangeOnly) && !off;
      const a0 = rangeOnly ? angleOf(v.range.low) : G.start, a1 = rangeOnly ? angleOf(v.range.high) : angleOf(hasT ? t : v.min);
      if (P.act) P.act.setAttribute('d', showSet ? arcPath(G.r, a0, Math.max(a0 + 0.05, a1)) : '');
      if (P.grad) P.grad.querySelectorAll('.iqdl__seg').forEach((p) => { const segA = G.start + Number(p.dataset.t) * G.sweep; p.dataset.lit = showSet && segA >= a0 - 0.1 && segA <= a1 + 2.6 ? 'true' : 'false'; });
      if (P.cur) { if (finite(c) && !off) { const [x, y] = polar(G.r, angleOf(c)); P.cur.setAttribute('cx', x.toFixed(2)); P.cur.setAttribute('cy', y.toFixed(2)); P.cur.style.display = ''; } else P.cur.style.display = 'none'; }
      if (P.ticks) {
        const tt = hasT ? t : v.min, lo = Math.min(angleOf(finite(c) ? c : tt), angleOf(tt)) - G.start, hi = Math.max(angleOf(finite(c) ? c : tt), angleOf(tt)) - G.start;
        P.ticks.querySelectorAll('.iqdl__tick').forEach((tk) => { const a = Number(tk.dataset.a); tk.dataset.on = showSet && a <= angleOf(tt) - G.start + 0.01 ? 'true' : 'false'; tk.dataset.span = showSet && finite(c) && a >= lo - 0.01 && a <= hi + 0.01 ? 'true' : 'false'; });
      }
      if (P.tmark) {
        const mk = (line, labEl, x, r0, r1, rl, show) => {
          if (!show) { line.style.display = 'none'; labEl.style.display = 'none'; return; }
          const [x0, y0] = polar(r0, angleOf(x)), [x1, y1] = polar(r1, angleOf(x)), [lx, ly] = polar(rl, angleOf(x));
          line.setAttribute('x1', x0.toFixed(2)); line.setAttribute('y1', y0.toFixed(2)); line.setAttribute('x2', x1.toFixed(2)); line.setAttribute('y2', y1.toFixed(2));
          labEl.setAttribute('x', lx.toFixed(1)); labEl.setAttribute('y', ly.toFixed(1)); labEl.textContent = fmt(x);
          line.style.display = ''; labEl.style.display = '';
        };
        mk(P.tmark, P.tlab, t, 64, 90, 92.5, showSet && hasT);
        mk(P.cmark, P.clab, c, 70, 86, 92.5, !off && finite(c) && Math.abs(angleOf(c) - angleOf(hasT ? t : v.min)) > 9);
      }
      const whole = (x) => `${Math.round(x)}${v.scaleUnit ?? '°'}`;
      if (P.mid) P.mid.textContent = whole((v.min + v.max) / 2);
      if (P.min && D.el.dataset.design === 'knob') { const q = (v.max - v.min) / 6; P.min.textContent = whole(v.min + q); P.max.textContent = whole(v.max - q); }
      else if (P.min) { P.min.textContent = `${fmt(v.min).replace(/\.0+$/, '')}${v.scaleUnit ?? '°'}`; P.max.textContent = `${fmt(v.max).replace(/\.0+$/, '')}${v.scaleUnit ?? '°'}`; }
      // the handle (keyboard / drag), on the ring at the setpoint
      const ang = (angleOf(rangeOnly ? v.range.high : hasT ? t : v.min) * Math.PI) / 180;
      D.knob.style.left = `${50 + (G.r / 2) * Math.cos(ang)}%`;
      D.knob.style.top = `${50 + (G.r / 2) * Math.sin(ang)}%`;
      D.knob.hidden = !hasT || off;
      D.knob.setAttribute('aria-valuemin', String(v.min)); D.knob.setAttribute('aria-valuemax', String(v.max)); D.knob.setAttribute('aria-valuenow', String(hasT ? t : ''));
      D.knob.setAttribute('aria-valuetext', v.aria || `${fmt(t)}`);
      if (v.name) D.knob.setAttribute('aria-label', v.name);
      D.el.dataset.off = off ? 'true' : 'false';
    }
    D.el.dial = { update(view, L) { if (L) applyLook(L); applyView(view); }, look: applyLook, view: applyView, slots: D.slots, knob: D.knob, geometry: G };
    return D.el;
  }

  global.IniqDial = Object.freeze({ create, DESIGNS, SLOTS, GEOM });

  /* ---------------------------------------------------------------- standalone (a composed widget: Widget Studio, a Studio widget)
     Widget Studio's Dial is the GAUGE PRIMITIVE (components/gauge — IniqGauge): ONE numeric value on a circular scale, every look a preset
     of the same properties, no text of its own. This thermostat dial (IniqDial.create) stays the built-in Climate widget's. */
  const G = () => global.IniqGauge;
  if (global.IniqComponents) {
    global.IniqComponents.define('dial', { name: 'Dial', category: 'controls', module: 'IniqDial.create',
      render: (look, { design, view, onInput, onCommit } = {}) => { const el = create({ design: design || look.design, onInput, onCommit }); el.dial.update(view || {}, look || {}); return el; },
      contract: { design: `${DESIGNS.join(' | ')} | 'bare'`, valueSize: 'px', labelSize: 'px', thickness: '1–16 (Minimal / Digital ring)', ticks: 'bool', minmax: 'bool',
        ring: "'state' | 'gradient'", arc: "'solid' | 'glow'", density: "'detailed' | 'simple'", face: "'filled' | 'dark'", marker: 'bool', surface: "'clean' | 'soft' | 'glass' | 'deep'",
        depth: "'soft' | 'flat' | 'raised'", activeArc: 'bool', ringColor: "token | '#rrggbb'", warmColor: "token | '#rrggbb'", coolColor: "token | '#rrggbb'", idleColor: "token | '#rrggbb'",
        showCurrent: 'bool', showAction: 'bool', showLabel: 'bool', label: 'text' },
      capabilities: ['five designs', 'a settable value on the ring (drag · keyboard)', 'a second marked value', 'a range', 'state tone', 'content slots (Digital ring)'],
      state: '{ min, max, step, decimals, unit, value, valueText, off, setpoint, current, range, tone, action, label, secondary, icon, interactive, name, aria } — the owner’s normalised view',
      compose: { defaults: {}, initial: () => ({ preset: 'spectrum', ...G().PRESETS.spectrum }), data: { value: 50 }, box: { w: 180, h: 180 }, min: { w: 32, h: 32 },
        // its Properties are its own (IniqGauge.fields: preset · range · geometry · track · value arc · ticks · marker · face)
        fields: () => (G() ? G().fields() : []),
        dataFields: [{ key: 'data.value', type: 'number', label: 'Value (preview)', group: 'data', help: 'Preview data — Home Assistant supplies it once the dial has an entity.' }],
        // FILL: the gauge is its box's largest centred circle — a normal resize changes the geometry, never a size that is set
        resize: { mode: 'fill', aspect: 'square' },
        // BINDING: ONE number in — the value the arc and the marker show. Its range is configuration (prefilled from Home Assistant)
        inputs: { value: { label: 'Value', kind: 'number', primary: true } },
        range: ['min', 'max'],
        // SCALE (Shift + resize): every SET size in proportion (an Automatic one already follows the dial's size)
        scale: { props: G() ? G().SCALE : {}, base: (c) => { const out = {}; Object.keys(G() ? G().SCALE : {}).forEach((k) => { if (typeof c[k] === 'number') out[k] = c[k]; }); return out; } },
        render: (c, d = {}, ctx = {}) => G().create(c, d, ctx.box),
        update: (el, c, d = {}, ctx = {}) => { if (!el.classList.contains('iqg')) return false; G().update(el, c, d, ctx.box); return true; } } });
  }
})(window);
