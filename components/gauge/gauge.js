/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqGauge — Widget Studio's DIAL PRIMITIVE (docs/WIDGET-STUDIO-POC.md, "Dial primitive"): ONE numeric value drawn on a circular
   scale — a track, a value arc, ticks, a marker and a face. Nothing else: no value text, no label, no "Now", no target, no state words,
   no domain. Text around it is composed in Studio from separate Value / Text components (which may sit on top of it).
   One renderer and one model: every look ("Spectrum ring", "Minimal ring", "State arc", "Full dial", "Digital ring") is a PRESET — a
   starting configuration written into the same properties, all editable afterwards.

   (The built-in Climate widget keeps its own thermostat dial — components/dial — unchanged.)

   IniqGauge.create(config, value, box) → <div class="iqg"> ; IniqGauge.update(el, config, value, box)
     value: a number, or null (nothing to show: no arc, no marker) · box: { w, h } logical px (the gauge is the box's largest centred circle)
   CONFIG (every key optional — DEFAULTS below; px are LOGICAL px; a dimension left unset is AUTO: proportional to the gauge's size)
     min · max                          the scale (configuration — never a binding)
     start (° clockwise from 12 o'clock) · sweep (°, 10–360) · direction 'cw' | 'ccw' · inset (px) · thickness (px) · ends 'round' | 'flat'
     trackShow · trackColor · trackOpacity (%) · trackThickness (px) · trackStyle 'solid' | 'soft'
     arcShow · arcColor · arcGradient · arcColor2 · arcThickness (px) · arcOpacity (%) · arcGlow (0–100)
     ticks 'off' | 'major' | 'minor' · tickCount · tickMinor (per major) · tickPos 'inside' | 'center' | 'outside' · tickLen · tickMinorLen ·
       tickWidth · tickMinorWidth · tickOffset (px) · tickColor · tickMinorColor · tickOpacity (%)
     marker · markerStyle 'dot' | 'line' | 'triangle' · markerPos 'inside' | 'center' | 'outside' · markerSize (px) · markerColor ·
       markerOutline (colour, '' none) · markerOutlineWidth (px) · markerGlow (0–100)
     face 'none' | 'solid' | 'soft' | 'glass' | 'deep' · faceColor · faceOpacity (%) · faceBorder (px) · faceBorderColor · faceDepth 'none' | 'soft' | 'raised'
     trackStyle 'dots' (+ trackColor2 · dotCount · dotSize · dotEndSize · dotsFollow) · segments [{ from, to, follow, color, color2, thickness, opacity,
       glow, ends }] · labels [{ value, text, color }] (+ labelSize · labelOffset · labelColor) · markers [{ at 'fixed' | 'value', value, size, offset,
       color, outline, outlineWidth, glow, icon, iconColor, iconScale }]
     colours: a design token name ('accent', 'accent-hot', …) or '#rrggbb'
   ========================================================================== */
(function (global) {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const HEX = /^#[0-9a-fA-F]{6}$/, TOKENS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];
  const colour = (v, fb) => (typeof v === 'string' ? (HEX.test(v) ? v.toLowerCase() : TOKENS.includes(v) ? `var(--${v})` : fb) : fb);
  const n = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  /** the base configuration (what an unset key means) */
  const DEFAULTS = { min: 0, max: 100, start: 225, sweep: 270, direction: 'cw', ends: 'round',
    trackShow: true, trackColor: 'neutral', trackOpacity: 22, trackStyle: 'solid',
    arcShow: true, arcColor: 'accent-hot', arcGradient: false, arcColor2: 'info', arcOpacity: 100, arcGlow: 0,
    ticks: 'off', tickCount: 11, tickMinor: 4, tickPos: 'outside', tickColor: 'neutral', tickMinorColor: 'neutral', tickOpacity: 70,
    marker: true, markerStyle: 'dot', markerPos: 'center', markerColor: '#ffffff', markerOutline: '', markerGlow: 0,
    face: 'none', faceColor: 'neutral', faceOpacity: 100, faceBorder: 0, faceBorderColor: 'neutral', faceDepth: 'none' };
  /** AUTO dimensions: a share of the gauge's size (so an unset one follows a resize; a set one stays exactly as set) */
  const AUTO = { inset: 0.02, thickness: 0.06, tickLen: 0.045, tickMinorLen: 0.025, tickWidth: 0.012, tickMinorWidth: 0.007, tickOffset: 0.015, markerSize: 0.075, markerOutlineWidth: 0.01, faceBorder: 0 };
  /** PRESETS: starting configurations of the SAME properties (sizes for the 180 px default box) — every one stays editable */
  const P0 = { ...DEFAULTS, inset: undefined, thickness: undefined, trackThickness: undefined, arcThickness: undefined, tickLen: undefined, tickMinorLen: undefined, tickWidth: undefined,
    tickMinorWidth: undefined, tickOffset: undefined, markerSize: undefined, markerOutlineWidth: undefined };
  const PRESETS = {
    spectrum: { ...P0, thickness: 10, arcGradient: true, arcColor: 'info', arcColor2: 'accent-hot', arcGlow: 35, ticks: 'minor', tickCount: 10, tickMinor: 4, tickPos: 'outside', tickLen: 6, tickMinorLen: 3, tickOpacity: 55,
      markerStyle: 'dot', markerSize: 14, markerColor: '#ffffff', markerOutline: 'accent-hot', markerOutlineWidth: 3, face: 'deep', faceColor: '#16171c', faceDepth: 'soft' },
    minimal: { ...P0, thickness: 4, trackOpacity: 16, arcColor: 'accent', ticks: 'off', markerStyle: 'dot', markerSize: 10, markerColor: '#ffffff', face: 'none' },
    arc: { ...P0, thickness: 14, ends: 'round', trackOpacity: 14, arcColor: 'accent-hot', arcGlow: 50, ticks: 'off', marker: false, face: 'none' },
    full: { ...P0, start: 210, sweep: 300, thickness: 8, arcColor: 'accent-hot', ticks: 'minor', tickCount: 11, tickMinor: 4, tickPos: 'inside', tickLen: 9, tickMinorLen: 5, tickWidth: 2, tickMinorWidth: 1,
      markerStyle: 'line', markerPos: 'center', markerSize: 18, markerColor: '#ffffff', face: 'solid', faceColor: 'accent-hot', faceOpacity: 85, faceDepth: 'raised' },
    digital: { ...P0, thickness: 3, trackOpacity: 30, arcColor: 'accent', ticks: 'major', tickCount: 12, tickPos: 'inside', tickLen: 4, tickWidth: 1, tickOpacity: 40,
      markerStyle: 'dot', markerSize: 9, face: 'glass', faceColor: '#1b1d23', faceBorder: 1, faceBorderColor: 'neutral', faceDepth: 'soft' },
  };
  const PRESET_NAMES = [['spectrum', 'Spectrum ring'], ['minimal', 'Minimal ring'], ['arc', 'State arc'], ['full', 'Full dial'], ['digital', 'Digital ring']];
  /** the configuration as drawn: defaults ← (an older Studio dial: its design as a preset) ← its own keys */
  function resolved(c = {}, d = {}) {
    // an older Studio dial (before presets): its design, as the preset it now is (Spectrum ring when it had none)
    const legacy = c.preset === undefined ? PRESETS[PRESETS[c.design] ? c.design : 'spectrum'] : {};
    const own = {}; Object.entries(c).forEach(([k, v]) => { if (v !== undefined) own[k] = v; });
    const r = { ...DEFAULTS, ...legacy, ...own };
    // an older Studio dial kept its range in its preview data
    if (c.min === undefined && typeof d.min === 'number') r.min = d.min;
    if (c.max === undefined && typeof d.max === 'number') r.max = d.max;
    return r;
  }

  let uid = 0;
  const el = (tag, attrs = {}) => { const x = document.createElementNS(SVGNS, tag); Object.entries(attrs).forEach(([k, v]) => { if (v !== undefined && v !== null) x.setAttribute(k, String(v)); }); return x; };
  const f2 = (v) => Math.round(v * 100) / 100;

  /** the geometry for a size S (px): radius, thickness, angles — everything the drawing needs */
  function geometry(c, S) {
    const A = (k, lo, hi) => n(c[k], lo, hi, AUTO[k] * S);
    const t = A('thickness', 1, 120), tt = n(c.trackThickness, 1, 120, t), at = n(c.arcThickness, 1, 120, t), ring = Math.max(t, tt, at);
    const ticks = pick(c.ticks, ['off', 'major', 'minor'], 'off'), tpos = pick(c.tickPos, ['inside', 'center', 'outside'], 'outside');
    const tl = A('tickLen', 1, 120), tml = A('tickMinorLen', 1, 120), toff = A('tickOffset', 0, 80);
    const ms = A('markerSize', 2, 120), mpos = pick(c.markerPos, ['inside', 'center', 'outside'], 'center'), mow = c.markerOutline ? A('markerOutlineWidth', 0, 20) : 0;
    // the ring's radius leaves room for everything OUTSIDE it (outside ticks, an outside marker): nothing is clipped
    let out = ring / 2;
    if (ticks !== 'off' && tpos === 'outside') out = Math.max(out, ring / 2 + toff + Math.max(tl, ticks === 'minor' ? tml : 0));
    if (ticks !== 'off' && tpos === 'center') out = Math.max(out, Math.max(tl, tml) / 2);
    if (c.marker !== false) out = Math.max(out, mpos === 'outside' ? ring / 2 + 2 + ms + mow : mpos === 'center' ? ms / 2 + mow : 0);
    const inset = A('inset', 0, S / 3), R = Math.max(2, S / 2 - inset - out);
    const sweep = n(c.sweep, 10, 360, 270), dir = c.direction === 'ccw' ? -1 : 1, start = ((n(c.start, -360, 720, 225) % 360) + 360) % 360;
    return { S, R, t, tt, at, ring, ticks, tpos, tl, tml, toff, ms, mpos, mow, sweep, dir, start, cx: S / 2, cy: S / 2 };
  }
  /** a point at angle a (° clockwise from 12 o'clock) on radius r */
  const at = (g, r, a) => { const rad = ((a - 90) * Math.PI) / 180; return [g.cx + r * Math.cos(rad), g.cy + r * Math.sin(rad)]; };
  /** an arc from scale fraction p0 to p1 (0…1) on radius r — a full circle is drawn as two halves */
  function arcD(g, r, p0, p1) {
    if (p1 - p0 <= 0.0005) return '';
    const a0 = g.start + g.dir * g.sweep * p0, a1 = g.start + g.dir * g.sweep * p1, span = g.sweep * (p1 - p0);
    if (span >= 359.99) { const m = g.start + g.dir * 180; const [x0, y0] = at(g, r, a0), [xm, ym] = at(g, r, m); const sw = g.dir > 0 ? 1 : 0;
      return `M${f2(x0)} ${f2(y0)}A${f2(r)} ${f2(r)} 0 1 ${sw} ${f2(xm)} ${f2(ym)}A${f2(r)} ${f2(r)} 0 1 ${sw} ${f2(x0)} ${f2(y0)}`; }
    const [x0, y0] = at(g, r, a0), [x1, y1] = at(g, r, a1);
    return `M${f2(x0)} ${f2(y0)}A${f2(r)} ${f2(r)} 0 ${span > 180 ? 1 : 0} ${g.dir > 0 ? 1 : 0} ${f2(x1)} ${f2(y1)}`;
  }

  /** draw everything for config c, value v, size S into a fresh <svg> */
  function draw(c, v, S, id) {
    const g = geometry(c, S), svg = el('svg', { class: 'iqg__svg', viewBox: `0 0 ${f2(S)} ${f2(S)}`, width: f2(S), height: f2(S), 'aria-hidden': 'true' });
    const defs = el('defs'); svg.append(defs);
    const lo = Number(c.min), hi = Number(c.max) > lo ? Number(c.max) : lo + 1;
    const p = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : null;
    const cap = c.ends === 'flat' ? 'butt' : 'round';
    // TRACK COLOUR STOPS (2+): the track's colour along the scale (a hue ring: red → yellow → green → … → red)
    const tstops = (Array.isArray(c.trackStops) ? c.trackStops : []).map((x) => x && colour(x.color, '')).filter(Boolean).slice(0, 12);
    const stopAt = (q) => { if (tstops.length < 2) return null; const t = Math.max(0, Math.min(1, q)) * (tstops.length - 1), i = Math.min(tstops.length - 2, Math.floor(t)), f = t - i;
      return f < 0.001 ? tstops[i] : `color-mix(in srgb, ${tstops[i + 1]} ${Math.round(f * 100)}%, ${tstops[i]})`; };
    const glow = (key, strength) => { const fid = `${id}-${key}`, f = el('filter', { id: fid, x: '-50%', y: '-50%', width: '200%', height: '200%' }); f.append(el('feGaussianBlur', { stdDeviation: f2(Math.max(0.5, (strength / 100) * S * 0.035)) })); defs.append(f); return `url(#${fid})`; };
    // FACE — a visual surface only (never text)
    const face = pick(c.face, ['none', 'solid', 'soft', 'glass', 'deep'], 'none');
    if (face !== 'none') {
      const fr = Math.max(1, g.R - g.ring / 2), fc = colour(c.faceColor, 'var(--neutral)'), op = n(c.faceOpacity, 0, 100, 100) / 100, grp = el('g', { class: 'iqg__face', 'data-style': face, opacity: f2(op) });
      const depth = pick(c.faceDepth, ['none', 'soft', 'raised'], 'none');
      if (depth !== 'none') { const fid = `${id}-depth`, f = el('filter', { id: fid, x: '-30%', y: '-30%', width: '160%', height: '160%' }); f.append(el('feDropShadow', { dx: 0, dy: f2(S * (depth === 'raised' ? 0.03 : 0.012)), stdDeviation: f2(S * (depth === 'raised' ? 0.035 : 0.018)), 'flood-color': '#000', 'flood-opacity': depth === 'raised' ? 0.6 : 0.4 })); defs.append(f); grp.setAttribute('filter', `url(#${fid})`); }
      let fill = fc;
      if (face !== 'solid') {
        const gid = `${id}-fg`, rg = el('radialGradient', { id: gid, cx: '.5', cy: face === 'deep' ? '.4' : '.35', r: '.7' });
        const stops = face === 'soft' ? [[0, fc, 0.9], [1, fc, 0.35]] : face === 'glass' ? [[0, fc, 0.55], [1, fc, 0.2]] : [[0, `color-mix(in srgb, ${fc} 70%, #fff)`, 1], [1, `color-mix(in srgb, ${fc} 55%, #000)`, 1]];
        stops.forEach(([o, col, so]) => { const s = el('stop', { offset: o }); s.setAttribute('style', `stop-color:${col};stop-opacity:${so}`); rg.append(s); });
        defs.append(rg); fill = `url(#${gid})`;
      }
      const disc = el('circle', { class: 'iqg__facefill', cx: f2(g.cx), cy: f2(g.cy), r: f2(fr) }); disc.style.fill = fill; grp.append(disc);
      if (face === 'glass') { const sh = el('ellipse', { class: 'iqg__shine', cx: f2(g.cx), cy: f2(g.cy - fr * 0.45), rx: f2(fr * 0.7), ry: f2(fr * 0.4) }); sh.style.fill = 'rgba(255,255,255,.08)'; grp.append(sh); }
      const fb = n(c.faceBorder, 0, 20, 0);
      if (fb > 0) { const b = el('circle', { class: 'iqg__border', cx: f2(g.cx), cy: f2(g.cy), r: f2(fr - fb / 2), fill: 'none', 'stroke-width': f2(fb) }); b.style.stroke = colour(c.faceBorderColor, 'var(--neutral)'); grp.append(b); }
      svg.append(grp);
    }
    // TRACK — the whole scale, inactive
    if (c.trackShow !== false && c.trackStyle === 'dots') {
      // a DOTTED track: separate dots along the scale, coloured from the track colour to the second colour; the end dots their own size;
      // "Dots follow the value": the dots past the value are drawn at the track opacity, the others fully
      const N = Math.round(n(c.dotCount, 3, 180, 40)), ds = n(c.dotSize, 0.5, 40, Math.max(1.5, g.tt * 0.55)), de = n(c.dotEndSize, 0.5, 60, ds);
      const c1 = colour(c.trackColor, 'var(--neutral)'), c2 = c.trackColor2 ? colour(c.trackColor2, c1) : c1, op = n(c.trackOpacity, 0, 100, 22) / 100;
      const grp = el('g', { class: 'iqg__dots' });
      for (let i = 0; i < N; i++) {
        const q = g.sweep >= 360 ? i / N : i / Math.max(1, N - 1), [x, y] = at(g, g.R, g.start + g.dir * g.sweep * q), end = g.sweep < 360 && (i === 0 || i === N - 1);
        const d = el('circle', { class: 'iqg__dot', cx: f2(x), cy: f2(y), r: f2((end ? de : ds) / 2), opacity: f2(c.dotsFollow && p !== null && q > p + 1e-6 ? op : c.dotsFollow ? 1 : op) });
        d.style.fill = stopAt(q) || (c2 === c1 ? c1 : `color-mix(in srgb, ${c2} ${Math.round(q * 100)}%, ${c1})`);
        grp.append(d);
      }
      svg.append(grp);
    } else if (c.trackShow !== false && tstops.length >= 2) {
      const grp = el('g', { class: 'iqg__track', opacity: f2(n(c.trackOpacity, 0, 100, 22) / 100), 'data-style': 'stops' }), N = 90;
      for (let i = 0; i < N; i++) { const q0 = i / N, q1 = Math.min(1, (i + 1) / N + 0.004), pa = el('path', { d: arcD(g, g.R, q0, q1), fill: 'none', 'stroke-width': f2(g.tt), 'stroke-linecap': 'butt' });
        pa.style.stroke = stopAt((q0 + q1) / 2); grp.append(pa); }
      if (cap === 'round' && g.sweep < 360) [[0, stopAt(0)], [1, stopAt(1)]].forEach(([q, col]) => { const [x, y] = at(g, g.R, g.start + g.dir * g.sweep * q), d = el('circle', { cx: f2(x), cy: f2(y), r: f2(g.tt / 2) }); d.style.fill = col; grp.append(d); });
      svg.append(grp);
    } else if (c.trackShow !== false) {
      const tr = el('path', { class: 'iqg__track', d: arcD(g, g.R, 0, 1), fill: 'none', 'stroke-width': f2(g.tt), 'stroke-linecap': cap, opacity: f2(n(c.trackOpacity, 0, 100, 22) / 100), 'data-style': c.trackStyle === 'soft' ? 'soft' : 'solid' });
      tr.style.stroke = colour(c.trackColor, 'var(--neutral)');
      if (c.trackStyle === 'soft') tr.setAttribute('filter', glow('soft', 18));
      svg.append(tr);
    }
    // TICKS — major (+ minor), inside / centred on / outside the ring
    if (g.ticks !== 'off') {
      const majors = Math.round(n(c.tickCount, 2, 120, 11)), minors = g.ticks === 'minor' ? Math.round(n(c.tickMinor, 0, 20, 4)) : 0;
      const intervals = g.sweep >= 360 ? majors : majors - 1, steps = intervals * (minors + 1);
      const grp = el('g', { class: 'iqg__ticks', opacity: f2(n(c.tickOpacity, 0, 100, 70) / 100), 'data-pos': g.tpos });
      const mw = n(c.tickWidth, 0.2, 20, AUTO.tickWidth * S), nw = n(c.tickMinorWidth, 0.2, 20, AUTO.tickMinorWidth * S);
      for (let i = 0; i <= steps; i++) {
        if (g.sweep >= 360 && i === steps) break;
        const major = i % (minors + 1) === 0, len = major ? g.tl : g.tml, a = g.start + g.dir * g.sweep * (i / steps);
        const r0 = g.tpos === 'inside' ? g.R - g.ring / 2 - g.toff - len : g.tpos === 'outside' ? g.R + g.ring / 2 + g.toff : g.R - len / 2, r1 = r0 + len;
        const [x0, y0] = at(g, r0, a), [x1, y1] = at(g, r1, a);
        const ln = el('line', { class: major ? 'iqg__tick iqg__tick--major' : 'iqg__tick', x1: f2(x0), y1: f2(y0), x2: f2(x1), y2: f2(y1), 'stroke-width': f2(major ? mw : nw), 'stroke-linecap': cap });
        ln.style.stroke = colour(major ? c.tickColor : c.tickMinorColor, 'var(--neutral)');
        grp.append(ln);
      }
      svg.append(grp);
    }
    // SEGMENTS — more arcs on the scale (from / to scale values; an end may follow the value), each its own colour, gradient, thickness,
    // opacity and glow: e.g. a cold and a warm range on one dial
    const frac = (x) => Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
    (Array.isArray(c.segments) ? c.segments : []).slice(0, 8).filter((x) => x && typeof x === 'object').forEach((sg, si) => {
      let q0 = frac(n(sg.from, -1e9, 1e9, lo)), q1 = frac(n(sg.to, -1e9, 1e9, hi));
      if (sg.follow === 'from' && p !== null) q0 = p; if (sg.follow === 'to' && p !== null) q1 = p;
      if (q1 < q0) [q0, q1] = [q1, q0];
      if (q1 - q0 < 0.001) return;
      const w = n(sg.thickness, 0.5, 120, g.at), s1 = colour(sg.color, 'var(--accent)'), s2 = sg.color2 ? colour(sg.color2, s1) : s1, sc = sg.ends === 'flat' ? 'butt' : cap;
      const grp = el('g', { class: 'iqg__seg', opacity: f2(n(sg.opacity, 0, 100, 100) / 100) }), N = s2 === s1 ? 1 : Math.max(2, Math.ceil(48 * (q1 - q0)));
      const draw1 = (target) => { for (let i = 0; i < N; i++) { const a0 = q0 + ((q1 - q0) * i) / N, a1 = Math.min(q1, q0 + ((q1 - q0) * (i + 1)) / N + (N > 1 ? 0.003 : 0)), mid = N > 1 ? (i + 0.5) / N : 0;
        const pa = el('path', { d: arcD(g, g.R, a0, a1), fill: 'none', 'stroke-width': f2(w), 'stroke-linecap': N > 1 ? 'butt' : sc }); pa.style.stroke = N > 1 ? `color-mix(in srgb, ${s2} ${Math.round(mid * 100)}%, ${s1})` : s1; target.append(pa); }
        if (N > 1 && sc === 'round') [[q0, s1], [q1, s2]].forEach(([q, col]) => { const [x, y] = at(g, g.R, g.start + g.dir * g.sweep * q), d = el('circle', { cx: f2(x), cy: f2(y), r: f2(w / 2) }); d.style.fill = col; target.append(d); }); };
      const gl = n(sg.glow, 0, 100, 0);
      if (gl > 0) { const gg = el('g', { filter: glow(`seg${si}`, gl), opacity: f2(0.35 + gl / 160) }); draw1(gg); grp.append(gg); }
      draw1(grp); svg.append(grp);
    });
    // SCALE LABELS — texts at scale values, outside (or inside) the ring
    const labels = (Array.isArray(c.labels) ? c.labels : []).slice(0, 24).filter((x) => x && typeof x === 'object');
    if (labels.length) {
      const lsz = n(c.labelSize, 4, 60, Math.max(6, S * 0.06)), loff = n(c.labelOffset, -200, 200, g.ring / 2 + lsz * 0.9), grp = el('g', { class: 'iqg__labels' });
      labels.forEach((lb) => { const [x, y] = at(g, g.R + loff, g.start + g.dir * g.sweep * frac(n(lb.value, -1e9, 1e9, lo)));
        const t = el('text', { x: f2(x), y: f2(y + lsz * 0.35), 'text-anchor': 'middle', 'font-size': f2(lsz), class: 'iqg__label' }); t.style.fill = colour(lb.color || c.labelColor, 'var(--text-muted)');
        t.textContent = String(lb.text ?? '').replace(/[\x00-\x1f<>]/g, '').slice(0, 16); grp.append(t); });
      svg.append(grp);
    }
    // VALUE ARC — from the start to the value
    if (c.arcShow !== false && p !== null && p > 0) {
      const grp = el('g', { class: 'iqg__arc', opacity: f2(n(c.arcOpacity, 0, 100, 100) / 100) }), c1 = colour(c.arcColor, 'var(--accent-hot)'), c2 = colour(c.arcColor2, 'var(--info)');
      const glowS = n(c.arcGlow, 0, 100, 0);
      const strokes = [];
      if (c.arcGradient) {
        const N = Math.max(2, Math.ceil(48 * p));
        for (let i = 0; i < N; i++) {
          const q0 = (p * i) / N, q1 = Math.min(p, (p * (i + 1)) / N + 0.003), mid = (q0 + q1) / 2;
          strokes.push([arcD(g, g.R, q0, q1), `color-mix(in srgb, ${c2} ${Math.round(mid * 100)}%, ${c1})`, 'butt']);
        }
        if (cap === 'round') { [[0, c1], [p, `color-mix(in srgb, ${c2} ${Math.round(p * 100)}%, ${c1})`]].forEach(([q, col]) => { const [x, y] = at(g, g.R, g.start + g.dir * g.sweep * q); strokes.push([null, col, 'dot', x, y]); }); }
      } else strokes.push([arcD(g, g.R, 0, p), c1, cap]);
      const paint = (target) => strokes.forEach(([d, col, cp, x, y]) => {
        const s = d === null ? el('circle', { cx: f2(x), cy: f2(y), r: f2(g.at / 2) }) : el('path', { d, fill: 'none', 'stroke-width': f2(g.at), 'stroke-linecap': cp });
        if (d === null) s.style.fill = col; else s.style.stroke = col;
        target.append(s);
      });
      if (glowS > 0) { const gl = el('g', { class: 'iqg__glow', filter: glow('arcglow', glowS), opacity: f2(0.35 + glowS / 160) }); paint(gl); grp.append(gl); }
      const main = el('g', { class: 'iqg__value' }); paint(main); grp.append(main);
      svg.append(grp);
    }
    // MARKER — the SAME value, at its place on the scale
    if (c.marker !== false && p !== null) {
      const a = g.start + g.dir * g.sweep * p, style = pick(c.markerStyle, ['dot', 'line', 'triangle'], 'dot'), ms = g.ms;
      const r = g.mpos === 'inside' ? g.R - g.ring / 2 - 2 - ms / 2 : g.mpos === 'outside' ? g.R + g.ring / 2 + 2 + ms / 2 : g.R;
      const [x, y] = at(g, r, a), col = colour(c.markerColor, '#ffffff');
      let m;
      if (style === 'dot') m = el('circle', { cx: f2(x), cy: f2(y), r: f2(ms / 2) });
      else if (style === 'line') { const [x0, y0] = at(g, r - ms / 2, a), [x1, y1] = at(g, r + ms / 2, a); m = el('line', { x1: f2(x0), y1: f2(y0), x2: f2(x1), y2: f2(y1), 'stroke-width': f2(Math.max(1.5, ms / 4)), 'stroke-linecap': cap }); }
      else {
        // a triangle pointing AT the ring (outside: inwards · inside: outwards · centred: inwards)
        const inward = g.mpos !== 'inside', tip = inward ? r - ms / 2 : r + ms / 2, base = inward ? r + ms / 2 : r - ms / 2, half = (ms / 2) * (360 / (2 * Math.PI * Math.max(1, base)));
        const [tx, ty] = at(g, tip, a), [bx0, by0] = at(g, base, a - half), [bx1, by1] = at(g, base, a + half);
        m = el('polygon', { points: `${f2(tx)},${f2(ty)} ${f2(bx0)},${f2(by0)} ${f2(bx1)},${f2(by1)}`, 'stroke-linejoin': 'round' });
      }
      m.setAttribute('class', 'iqg__marker'); m.dataset.style = style;
      if (style === 'line') m.style.stroke = col; else m.style.fill = col;
      if (c.markerOutline && g.mow > 0 && style !== 'line') { m.style.stroke = colour(c.markerOutline, 'transparent'); m.setAttribute('stroke-width', f2(g.mow)); m.setAttribute('paint-order', 'stroke'); }
      const mg = n(c.markerGlow, 0, 100, 0);
      if (mg > 0) m.setAttribute('filter', `url(#${(() => { const fid = `${id}-mglow`, f = el('filter', { id: fid, x: '-100%', y: '-100%', width: '300%', height: '300%' }); const b = el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: f2(Math.max(0.5, (mg / 100) * ms * 0.5)), result: 'b' }); const mrg = el('feMerge'); mrg.append(el('feMergeNode', { in: 'b' }), el('feMergeNode', { in: 'SourceGraphic' })); f.append(b, mrg); defs.append(f); return fid; })()})`);
      svg.append(m);
    }
    // MORE MARKERS — knobs at fixed scale values, or at the value, each with its own size, colours, outline, glow and an optional icon
    const extra = [];
    (Array.isArray(c.markers) ? c.markers : []).slice(0, 8).filter((x) => x && typeof x === 'object').forEach((mk, mi) => {
      const q = mk.at === 'value' ? p : frac(n(mk.value, -1e9, 1e9, lo));
      if (q === null) return;
      const a = g.start + g.dir * g.sweep * q, ms = n(mk.size, 2, 120, g.ms), [x, y] = at(g, g.R + n(mk.offset, -200, 200, 0), a);
      const m = el('circle', { class: 'iqg__xmarker', cx: f2(x), cy: f2(y), r: f2(ms / 2) }); m.style.fill = colour(mk.color, '#ffffff');
      const ow = n(mk.outlineWidth, 0, 20, 0); if (mk.outline && ow > 0) { m.style.stroke = colour(mk.outline, 'transparent'); m.setAttribute('stroke-width', f2(ow)); }
      const gl = n(mk.glow, 0, 100, 0); if (gl > 0) m.setAttribute('filter', `url(#${(() => { const fid = `${id}-xm${mi}`, f = el('filter', { id: fid, x: '-100%', y: '-100%', width: '300%', height: '300%' }); const b = el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: f2(Math.max(0.5, (gl / 100) * ms * 0.3)) }); const mg = el('feMerge'); mg.append(el('feMergeNode'), el('feMergeNode', { in: 'SourceGraphic' })); f.append(b, mg); defs.append(f); return fid; })()})`);
      svg.append(m);
      if (typeof mk.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(mk.icon)) extra.push({ x: x / S, y: y / S, size: ms * n(mk.iconScale, 20, 100, 60) / 100, icon: mk.icon, color: colour(mk.iconColor, 'var(--text-primary)') });
    });
    return { svg, g, p, extra };
  }

  /** the gauge in its box: the largest centred circle (the box IS the gauge — a normal resize resizes the geometry, not the set sizes) */
  function paint(root, config, data, box) {
    const c = resolved(config, data), v = typeof data.value === 'number' ? data.value : typeof data.value === 'string' && data.value.trim() !== '' && Number.isFinite(Number(data.value)) ? Number(data.value) : null;
    const w = Math.max(1, Number(box && box.w) || 120), h = Math.max(1, Number(box && box.h) || 120), S = Math.max(1, Math.min(w, h));
    Object.assign(root.style, { position: 'absolute', width: `${f2(S)}px`, height: `${f2(S)}px`, left: `${f2((w - S) / 2)}px`, top: `${f2((h - S) / 2)}px` });
    const { svg, p, extra } = draw(c, v, S, root.dataset.gid);
    root.replaceChildren(svg);
    // the markers' ICONS: the shared MDI icons (IniqIcons), placed over their knobs
    extra.forEach((x) => { const i = document.createElement('span'); i.className = 'iqg__icon'; i.dataset.mdi = x.icon;
      Object.assign(i.style, { position: 'absolute', left: `${f2(x.x * 100)}%`, top: `${f2(x.y * 100)}%`, width: `${f2(x.size)}px`, height: `${f2(x.size)}px`, transform: 'translate(-50%, -50%)', color: x.color, pointerEvents: 'none', display: 'grid', placeItems: 'center' });
      root.append(i); });
    if (extra.length && global.IniqIcons) global.IniqIcons.fill(root);
    root.dataset.empty = String(p === null);
    root.setAttribute('aria-valuemin', String(c.min)); root.setAttribute('aria-valuemax', String(c.max));
    if (p === null) root.removeAttribute('aria-valuenow'); else root.setAttribute('aria-valuenow', String(v));
    root.setAttribute('aria-label', typeof config.label === 'string' && config.label ? config.label : 'Gauge');
    root.dataset.unavailable = String(!!(data && data.unavailable));
  }
  function create(config = {}, data = {}, box = null) {
    const root = document.createElement('div');
    root.className = 'iqg';
    root.setAttribute('role', 'meter');
    root.dataset.gid = `iqg${++uid}`;
    paint(root, config, data || {}, box);
    return root;
  }

  /* ---------------------------------------------------------------- the PROPERTIES (Widget Studio's form: plain field descriptions) */
  const opts = (l) => l.map(([value, label]) => ({ value, label }));
  const COLORS = TOKENS;
  /** fields for the gauge's configuration (Studio's property sheet): RANGE · ARC (preset, geometry, track, value arc) · TICKS · MARKER · FACE (effects live with what they affect) */
  function fields() {
    const val = (k) => (o) => (o[k] !== undefined ? o[k] : resolved(o)[k]);
    const set = (k) => (o, v) => { if (v === undefined || v === null || v === '') delete o[k]; else o[k] = v; };
    const F = (k, x) => ({ key: k, get: val(k), set: set(k), ...x });
    const R = (k, label, group, min, max, step = 1, unit = 'px', extra = {}) => F(k, { type: 'range', label, group, min, max, step, unit, ...extra });
    const auto = (k) => ({ auto: 'Automatic', get: (o) => (o[k] !== undefined ? o[k] : o.preset === undefined ? resolved(o)[k] : undefined) });
    const B = (k, label, group, when) => ({ key: k, type: 'boolean', label, group, half: true, get: (o) => resolved(o)[k] !== false, set: (o, v) => { o[k] = !!v; }, ...(when ? { when } : {}) });
    const C = (k, label, group, when) => F(k, { type: 'color', label, group, custom: true, options: COLORS, ...(when ? { when } : {}) });
    const S = (k, label, group, list, when) => F(k, { type: 'select', label, group, half: true, options: opts(list), ...(when ? { when } : {}) });
    const on = (k) => (o) => resolved(o)[k] !== false, tk = (o) => resolved(o).ticks !== 'off', fc = (o) => resolved(o).face !== 'none';
    return [
      F('min', { type: 'number', label: 'Minimum', group: 'range', half: true }), F('max', { type: 'number', label: 'Maximum', group: 'range', half: true }),
      { key: 'preset', type: 'select', label: 'Preset', group: 'arc', options: opts([['custom', 'Custom'], ...PRESET_NAMES]),
        get: (o) => (o.preset !== undefined ? (PRESETS[o.preset] ? o.preset : 'custom') : PRESETS[o.design] ? o.design : 'spectrum'),
        set: (o, v) => { if (!PRESETS[v]) { const r = resolved(o); Object.keys(DEFAULTS).forEach((k) => { if (o[k] === undefined) o[k] = r[k]; }); delete o.design; o.preset = 'custom'; return; } const keep = { min: o.min, max: o.max, label: o.label }; Object.keys(o).forEach((k) => { if (k !== 'data' && k !== 'binding') delete o[k]; });
          Object.entries({ ...PRESETS[v], ...keep }).forEach(([k, x]) => { if (x !== undefined) o[k] = x; }); o.preset = v; },
        help: 'A starting design: it fills in the properties below — every one stays editable.' },
      R('start', 'Start angle', 'arc', 0, 359, 1, '°'), R('sweep', 'Sweep', 'arc', 10, 360, 1, '°'),
      S('direction', 'Direction', 'arc', [['cw', 'Clockwise'], ['ccw', 'Counter-clockwise']]), S('ends', 'Arc ends', 'arc', [['round', 'Round'], ['flat', 'Flat']]),
      R('thickness', 'Ring thickness', 'arc', 1, 80, 1, 'px', auto('thickness')), R('inset', 'Ring inset', 'arc', 0, 80, 1, 'px', auto('inset')),
      B('trackShow', 'Show track', 'arc'), C('trackColor', 'Track colour', 'arc', on('trackShow')), R('trackOpacity', 'Track opacity', 'arc', 0, 100, 1, '%', { when: on('trackShow') }),
      R('trackThickness', 'Track thickness', 'arc', 1, 80, 1, 'px', { auto: 'Ring thickness', when: on('trackShow') }), S('trackStyle', 'Track style', 'arc', [['solid', 'Solid'], ['soft', 'Soft'], ['dots', 'Dots']], on('trackShow')),
      ...(() => { const dots = (o) => resolved(o).trackShow !== false && resolved(o).trackStyle === 'dots';
        return [{ key: 'trackStops', type: 'collection', label: 'Track colours along the scale (2 or more: e.g. a hue ring)', group: 'arc', max: 12, itemLabel: 'colour', addLabel: '+ Add a track colour',
          get: (o) => (Array.isArray(o.trackStops) ? o.trackStops : []), set: (o, l) => { if (l.length) o.trackStops = l; else delete o.trackStops; }, when: on('trackShow'),
          create: () => ({ color: '#ff3b30' }), summary: (x) => ({ title: x.color || '—' }), fields: [{ key: 'color', type: 'color', label: 'Colour', custom: true, options: COLORS }] },
          C('trackColor2', 'Second colour (along the scale)', 'arc', on('trackShow')), F('dotCount', { type: 'number', label: 'Dots', group: 'arc', half: true, min: 3, max: 180, integer: true, when: dots, get: (o) => o.dotCount ?? 40 }),
          R('dotSize', 'Dot size', 'arc', 0.5, 40, 0.5, 'px', { auto: 'Automatic', when: dots }), R('dotEndSize', 'End dot size', 'arc', 0.5, 60, 0.5, 'px', { auto: 'Same', when: dots }),
          { key: 'dotsFollow', type: 'boolean', label: 'Dots follow the value (the rest dimmed)', group: 'arc', when: dots, get: (o) => o.dotsFollow === true, set: (o, v) => { if (v) o.dotsFollow = true; else delete o.dotsFollow; } }]; })(),
      B('arcShow', 'Show value arc', 'arc'), C('arcColor', 'Arc colour', 'arc', on('arcShow')), B('arcGradient', 'Gradient', 'arc', on('arcShow')),
      C('arcColor2', 'Gradient end colour', 'arc', (o) => resolved(o).arcShow !== false && !!resolved(o).arcGradient),
      R('arcThickness', 'Arc thickness', 'arc', 1, 80, 1, 'px', { auto: 'Ring thickness', when: on('arcShow') }), R('arcOpacity', 'Arc opacity', 'arc', 0, 100, 1, '%', { when: on('arcShow') }),
      R('arcGlow', 'Arc glow', 'arc', 0, 100, 1, '%', { when: on('arcShow') }),
      { key: 'segments', type: 'collection', label: 'More arcs (segments of the scale)', group: 'arc', max: 8, itemLabel: 'arc segment', addLabel: '+ Add an arc segment',
        get: (o) => (Array.isArray(o.segments) ? o.segments : []), set: (o, l) => { if (l.length) o.segments = l; else delete o.segments; },
        create: () => ({ from: 0, to: 50, color: 'info' }), summary: (x) => ({ title: `${x.follow === 'from' ? 'value' : x.from ?? '—'} → ${x.follow === 'to' ? 'value' : x.to ?? '—'} · ${x.color || ''}${x.color2 ? ` → ${x.color2}` : ''}` }),
        fields: [{ key: 'from', type: 'number', label: 'From (scale value)', half: true }, { key: 'to', type: 'number', label: 'To (scale value)', half: true },
          { key: 'follow', type: 'select', label: 'Follows the value', options: opts([['none', 'No'], ['from', 'Its start'], ['to', 'Its end']]), get: (x) => x.follow || 'none', set: (x, v) => { if (!v || v === 'none') delete x.follow; else x.follow = v; } },
          { key: 'color', type: 'color', label: 'Colour', custom: true, options: COLORS }, { key: 'color2', type: 'color', label: 'Gradient end colour', custom: true, options: COLORS, optional: true },
          { key: 'thickness', type: 'range', label: 'Thickness', min: 0.5, max: 120, step: 0.5, unit: 'px', optional: true, auto: 'Arc thickness' },
          { key: 'opacity', type: 'range', label: 'Opacity', min: 0, max: 100, step: 1, unit: '%', optional: true, auto: 'Opaque', autoValue: 100 },
          { key: 'glow', type: 'range', label: 'Glow', min: 0, max: 100, step: 1, unit: '%', optional: true, auto: 'None', autoValue: 0 },
          { key: 'ends', type: 'select', label: 'Ends', options: opts([['round', 'Round'], ['flat', 'Flat']]), get: (x) => x.ends || 'round', set: (x, v) => { if (v === 'flat') x.ends = 'flat'; else delete x.ends; } }] },
      S('ticks', 'Ticks', 'ticks', [['off', 'Off'], ['major', 'Major only'], ['minor', 'Major + minor']]), S('tickPos', 'Position', 'ticks', [['inside', 'Inside'], ['center', 'Centred'], ['outside', 'Outside']], tk),
      F('tickCount', { type: 'number', label: 'Major ticks', group: 'ticks', half: true, min: 2, max: 120, integer: true, when: tk }),
      F('tickMinor', { type: 'number', label: 'Minor per major', group: 'ticks', half: true, min: 0, max: 20, integer: true, when: (o) => resolved(o).ticks === 'minor' }),
      R('tickLen', 'Major length', 'ticks', 1, 60, 1, 'px', { ...auto('tickLen'), when: tk }), R('tickMinorLen', 'Minor length', 'ticks', 1, 60, 1, 'px', { ...auto('tickMinorLen'), when: (o) => resolved(o).ticks === 'minor' }),
      R('tickWidth', 'Major thickness', 'ticks', 0.5, 12, 0.5, 'px', { ...auto('tickWidth'), when: tk }), R('tickMinorWidth', 'Minor thickness', 'ticks', 0.5, 12, 0.5, 'px', { ...auto('tickMinorWidth'), when: (o) => resolved(o).ticks === 'minor' }),
      R('tickOffset', 'Distance from ring', 'ticks', 0, 40, 1, 'px', { ...auto('tickOffset'), when: tk }),
      { key: 'labels', type: 'collection', label: 'Scale labels (e.g. 10° · 20° · 30°)', group: 'ticks', max: 24, itemLabel: 'label', addLabel: '+ Add a scale label',
        get: (o) => (Array.isArray(o.labels) ? o.labels : []), set: (o, l) => { if (l.length) o.labels = l; else delete o.labels; },
        create: () => ({ value: 0, text: '0' }), summary: (x) => ({ title: `${x.text ?? ''} at ${x.value ?? '—'}` }),
        fields: [{ key: 'value', type: 'number', label: 'At (scale value)', half: true }, { key: 'text', type: 'text', label: 'Text', maxLength: 16, half: true },
          { key: 'color', type: 'color', label: 'Own colour', custom: true, options: COLORS, optional: true }] },
      R('labelSize', 'Label size', 'ticks', 4, 60, 0.5, 'px', { auto: 'Automatic', when: (o) => Array.isArray(o.labels) && o.labels.length > 0 }),
      R('labelOffset', 'Label distance from the ring', 'ticks', -200, 200, 1, 'px', { auto: 'Automatic', when: (o) => Array.isArray(o.labels) && o.labels.length > 0 }),
      C('labelColor', 'Label colour', 'ticks', (o) => Array.isArray(o.labels) && o.labels.length > 0),
      C('tickColor', 'Major colour', 'ticks', tk), C('tickMinorColor', 'Minor colour', 'ticks', (o) => resolved(o).ticks === 'minor'), R('tickOpacity', 'Tick opacity', 'ticks', 0, 100, 1, '%', { when: tk }),
      B('marker', 'Show marker', 'marker'), S('markerStyle', 'Style', 'marker', [['dot', 'Dot'], ['line', 'Line'], ['triangle', 'Triangle']], on('marker')),
      S('markerPos', 'Position', 'marker', [['inside', 'Inside'], ['center', 'Centred'], ['outside', 'Outside']], on('marker')), R('markerSize', 'Size', 'marker', 2, 80, 1, 'px', { ...auto('markerSize'), when: on('marker') }),
      C('markerColor', 'Colour', 'marker', on('marker')), C('markerOutline', 'Outline', 'marker', on('marker')),
      R('markerOutlineWidth', 'Outline thickness', 'marker', 0, 12, 0.5, 'px', { ...auto('markerOutlineWidth'), when: (o) => resolved(o).marker !== false && !!resolved(o).markerOutline }),
      R('markerGlow', 'Marker glow', 'marker', 0, 100, 1, '%', { when: on('marker') }),
      { key: 'markers', type: 'collection', label: 'More markers (knobs, with an icon)', group: 'marker', max: 8, itemLabel: 'marker', addLabel: '+ Add a marker',
        get: (o) => (Array.isArray(o.markers) ? o.markers : []), set: (o, l) => { if (l.length) o.markers = l; else delete o.markers; },
        create: () => ({ at: 'fixed', value: 0, size: 18, color: '#ffffff' }), summary: (x) => ({ title: `${x.at === 'value' ? 'at the value' : `at ${x.value ?? '—'}`}${x.icon ? ` · ${x.icon}` : ''}` }),
        fields: [{ key: 'at', type: 'select', label: 'Where', options: opts([['fixed', 'At a scale value'], ['value', 'At the value']]), get: (x) => x.at || 'fixed', set: (x, v) => { if (v === 'value') x.at = 'value'; else delete x.at; } },
          { key: 'value', type: 'number', label: 'Scale value', when: (x) => x.at !== 'value' },
          { key: 'size', type: 'range', label: 'Size', min: 2, max: 120, step: 1, unit: 'px', optional: true, auto: 'Marker size' },
          { key: 'offset', type: 'range', label: 'Distance from the ring', min: -200, max: 200, step: 1, unit: 'px', optional: true, auto: 'On the ring', autoValue: 0 },
          { key: 'color', type: 'color', label: 'Colour', custom: true, options: COLORS }, { key: 'outline', type: 'color', label: 'Outline', custom: true, options: COLORS, optional: true },
          { key: 'outlineWidth', type: 'range', label: 'Outline thickness', min: 0, max: 20, step: 0.5, unit: 'px', optional: true },
          { key: 'glow', type: 'range', label: 'Glow', min: 0, max: 100, step: 1, unit: '%', optional: true, auto: 'None', autoValue: 0 },
          { key: 'icon', type: 'mdi', label: 'Icon', optional: true }, { key: 'iconColor', type: 'color', label: 'Icon colour', custom: true, options: COLORS, optional: true },
          { key: 'iconScale', type: 'range', label: 'Icon size (of the knob)', min: 20, max: 100, step: 1, unit: '%', optional: true, auto: '60 %' }] },
      S('face', 'Face', 'face', [['none', 'None (transparent)'], ['solid', 'Solid'], ['soft', 'Soft'], ['glass', 'Glass'], ['deep', 'Deep']]), C('faceColor', 'Face colour', 'face', fc),
      R('faceOpacity', 'Face opacity', 'face', 0, 100, 1, '%', { when: fc }), R('faceBorder', 'Border', 'face', 0, 20, 0.5, 'px', { when: fc }),
      C('faceBorderColor', 'Border colour', 'face', (o) => fc(o) && Number(resolved(o).faceBorder) > 0), S('faceDepth', 'Shadow / depth', 'face', [['none', 'None'], ['soft', 'Soft'], ['raised', 'Raised']], fc),
    ];
  }
  /** what Shift + resize scales in proportion: the SET sizes only (an Automatic one already follows the gauge's size) */
  const SCALE = { thickness: [1, 120], trackThickness: [1, 120], arcThickness: [1, 120], inset: [0, 200], tickLen: [1, 120], tickMinorLen: [1, 120], tickWidth: [0.5, 20], tickMinorWidth: [0.5, 20],
    tickOffset: [0, 80], markerSize: [2, 120], markerOutlineWidth: [0, 20], faceBorder: [0, 20] };

  global.IniqGauge = Object.freeze({ create, update: (root, c, d, box) => paint(root, c || {}, d || {}, box), resolved, geometry, fields, PRESETS, PRESET_NAMES, DEFAULTS, AUTO, SCALE });
})(window);
