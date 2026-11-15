/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqFlow — the universal FLOW CONNECTOR: one animated connection between two points / nodes, for any flow diagram (energy today;
   water, heating, ventilation, irrigation… or a Widget Studio element later). It knows no widget, no entity and no kind of flow: a
   connection is geometry + appearance + an animation, and a NORMALISED reading decides whether (and which way) it moves.

   IniqFlow.connector(spec) → { el: SVGGElement, update(patch), flow(reading), geometry(), destroy() }
     The element goes into an <svg> the host owns (the host's own px coordinate space — so dots keep their shape at every size).
     spec = {
       from, to:  a POINT [x, y] or a NODE { x, y, w, h, shape: 'circle' | 'rect', side?: 'auto' | 'top' | 'bottom' | 'left' | 'right' |
                  'center', gap?: px, shift?: px along that side (connections meeting one side side by side) } — a node's anchor is computed (IniqFlow.anchor): a circle → the point of its edge facing the other
                  end; a rect → the middle of the side facing it (or the side asked for). Moving a node = update({ from: node }).
       geometry:  'straight' | 'elbow' (orthogonal; bend: 'auto' | 'hv' | 'vh', radius: corner px) | 'curve' (curvature 0–1) | 'arc'
                  (bulge −1…1: which side, how far) ; points?: [[x, y]…] intermediate points the line passes through
       color, width (px), opacity (0–1), line: 'solid' | 'dashed' | 'dotted', gradient?: [colour, colour] (along the connection),
       glow (0–1: a soft neon halo), arrow: 'none' | 'end' | 'start' | 'both', arrowStyle: 'chevron' | 'triangle',
       markers: { start: 'none' | 'dot' | 'ring', end: … },
       animation: { type: 'none' | 'dots' | 'arrows' | 'dashes' | 'pulse', speed (px/s), size (px), spacing (px), color, opacity, glow }
       mark:      'auto' (a static direction chevron in the middle when nothing moves or motion is reduced) | 'always' | 'never'
     }
     Colours are theme token names (var(--token)), '#rrggbb', or 'currentColor'. Geometry and markers are built with createElementNS —
     never markup from the configuration.

   IniqFlow.read(value, semantics) → reading — the DATA rule (pure; nothing inferred from names):
     value: a number (HA's own state, already a number) | null (unknown) | { unavailable: true }
     semantics = { positive: 'forward' | 'reverse' (what a POSITIVE value means along from → to — chosen by the user), deadband (|v| at or
                   below it = no flow; default 0), zero: 'still' | 'hide' | 'dim', unavailable: 'dashed' | 'hide' | 'dim',
                   speed?: { range: [lo, hi] (|v|), to: [slow px/s, fast px/s] } }
     reading = { state: 'flow' | 'idle' | 'unavailable', direction: 'forward' | 'reverse' | 'none', speed?: px/s, zero, unavailable }
   connector.flow(reading) applies it: flow → the animation runs that way (speed from the reading when given); idle → nothing moves (the
   line stays, dims or hides); unavailable → a dashed / dim / hidden line. Never a fabricated value: no reading = idle.

   IniqFlow.anchor(node, toward) → [x, y] · IniqFlow.route(spec) → { d, length, mid: [x, y], angle } (geometry only — for hosts / tests)

   Performance: every animation is CSS (stroke-dashoffset, or offset-distance along the connection for arrows) — no per-frame script.
   Off screen (IntersectionObserver on the host svg) → paused; prefers-reduced-motion → nothing moves (the static chevron shows the way);
   destroy() → removed, unobserved, no timer, no listener left.
   ========================================================================== */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const HEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
  const TOKEN = /^[a-z][a-z0-9-]{1,40}$/;
  const GEOMETRY = ['straight', 'elbow', 'curve', 'arc'];
  const LINES = ['solid', 'dashed', 'dotted'];
  const ANIMS = ['none', 'dots', 'arrows', 'dashes', 'pulse'];
  const ARROWS = ['none', 'end', 'start', 'both'];
  const MARKERS = ['none', 'dot', 'ring'];
  const SIDES = ['auto', 'top', 'bottom', 'left', 'right', 'center'];
  const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  /** a colour: '#hex' kept, 'currentColor', or a theme token → var(--token); anything else → the fallback */
  const colour = (v, fb) => (typeof v !== 'string' ? fb : HEX.test(v) ? v : v === 'currentColor' ? v : TOKEN.test(v) ? `var(--${v})` : fb);
  const pt = (p) => (Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [p[0], p[1]] : null);
  const isNode = (n) => n && typeof n === 'object' && !Array.isArray(n) && ['x', 'y', 'w', 'h'].every((k) => typeof n[k] === 'number' && Number.isFinite(n[k]));
  const centre = (e) => (isNode(e) ? [e.x + e.w / 2, e.y + e.h / 2] : pt(e) || [0, 0]);

  /* ------------------------------------------------------------------ anchors */
  /** where a connection meets a node: a circle's edge facing `toward`; a rect's side facing it (or the side asked for); a point is itself */
  function anchor(node, toward) {
    if (!isNode(node)) return pt(node) || [0, 0];
    const c = [node.x + node.w / 2, node.y + node.h / 2], gap = num(node.gap, 0, 200, 0), t = pt(toward) || c;
    let side = pick(node.side, SIDES, 'auto');
    if (side === 'center') return c;
    const dx = t[0] - c[0], dy = t[1] - c[1];
    if (node.shape === 'circle' && side === 'auto') {
      const r = Math.min(node.w, node.h) / 2 + gap, d = Math.hypot(dx, dy) || 1;
      return [c[0] + (dx / d) * r, c[1] + (dy / d) * r];
    }
    if (side === 'auto') side = Math.abs(dx) * node.h >= Math.abs(dy) * node.w ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
    // shift: px ALONG the side (several connections meeting one side, side by side) — x for top / bottom, y for left / right
    const sh = num(node.shift, -1e4, 1e4, 0);
    if (node.shape === 'circle') {                     // a circle with a side asked for: that point of its edge (shifted: still on the edge)
      const r = Math.min(node.w, node.h) / 2 + gap, k = Math.max(-r * 0.9, Math.min(r * 0.9, sh)), d = Math.sqrt(r * r - k * k);
      return { top: [c[0] + k, c[1] - d], bottom: [c[0] + k, c[1] + d], left: [c[0] - d, c[1] + k], right: [c[0] + d, c[1] + k] }[side];
    }
    return { top: [c[0] + sh, node.y - gap], bottom: [c[0] + sh, node.y + node.h + gap], left: [node.x - gap, c[1] + sh], right: [node.x + node.w + gap, c[1] + sh] }[side];
  }
  /** the direction a connection leaves a node (for curves / elbows): the outward normal of the side used, or null for a point */
  function normal(node, a) {
    if (!isNode(node)) return null;
    const c = [node.x + node.w / 2, node.y + node.h / 2];
    const dx = a[0] - c[0], dy = a[1] - c[1];
    if (node.shape === 'circle') { const d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; }
    return Math.abs(dx) / (node.w || 1) >= Math.abs(dy) / (node.h || 1) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
  }

  /* ------------------------------------------------------------------ geometry → segments (L / Q / C), a path string, samples */
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function at(seg, p0, t) {
    const u = 1 - t;
    if (seg.t === 'L') return lerp(p0, seg.p[0], t);
    if (seg.t === 'Q') { const [c, e] = seg.p; return [u * u * p0[0] + 2 * u * t * c[0] + t * t * e[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * e[1]]; }
    const [c1, c2, e] = seg.p;
    return [u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1]];
  }
  function segments(a, b, s, na, nb) {
    const pts = (Array.isArray(s.points) ? s.points.map(pt).filter(Boolean) : []).slice(0, 16);
    const geo = pick(s.geometry, GEOMETRY, 'curve');
    const all = [a, ...pts, b];
    if (geo === 'straight') return all.slice(1).map((p) => ({ t: 'L', p: [p] }));
    if (geo === 'elbow') {
      // orthogonal: each leg goes along one axis then the other (the first leg follows the start's side when there is one)
      const bend = pick(s.bend, ['auto', 'hv', 'vh'], 'auto');
      const corners = [a];
      for (let i = 1; i < all.length; i++) {
        const p = all[i - 1], q = all[i];
        let hFirst = bend === 'hv' ? true : bend === 'vh' ? false : (i === 1 && na ? Math.abs(na[0]) > Math.abs(na[1]) : Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1]));
        if (bend === 'auto' && i === all.length - 1 && nb && i > 1) hFirst = Math.abs(nb[1]) > Math.abs(nb[0]);
        if (p[0] !== q[0] && p[1] !== q[1]) {
          if (bend === 'auto' && i === 1 && na && nb && Math.abs(na[0]) > Math.abs(na[1]) && Math.abs(nb[0]) > Math.abs(nb[1])) {   // side → side: a Z through the middle
            const mx = (p[0] + q[0]) / 2; corners.push([mx, p[1]], [mx, q[1]]);
          } else if (bend === 'auto' && i === 1 && na && nb && Math.abs(na[1]) > Math.abs(na[0]) && Math.abs(nb[1]) > Math.abs(nb[0])) {
            const my = (p[1] + q[1]) / 2; corners.push([p[0], my], [q[0], my]);
          } else corners.push(hFirst ? [q[0], p[1]] : [p[0], q[1]]);
        }
        corners.push(q);
      }
      const r = num(s.radius, 0, 80, 10), out = [];
      let cur = corners[0];
      for (let i = 1; i < corners.length; i++) {
        const c = corners[i], n = corners[i + 1];
        if (!n || r === 0) { out.push({ t: 'L', p: [c] }); cur = c; continue; }
        const l1 = Math.hypot(c[0] - cur[0], c[1] - cur[1]), l2 = Math.hypot(n[0] - c[0], n[1] - c[1]), rr = Math.min(r, l1 / 2, l2 / 2);
        if (rr < 0.5) { out.push({ t: 'L', p: [c] }); cur = c; continue; }
        const p1 = lerp(c, cur, rr / (l1 || 1)), p2 = lerp(c, n, rr / (l2 || 1));
        out.push({ t: 'L', p: [p1] }, { t: 'Q', p: [c, p2] });
        cur = p2;
      }
      return out;
    }
    if (geo === 'arc') {
      // a bow over the chord: bulge −1…1 (sign: which side; 1 = half the chord away) — one cubic per leg
      const bulge = num(s.bulge, -1, 1, 0.35);
      return all.slice(1).map((q, i) => {
        const p = all[i], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, h = (bulge * L) / 2, nx = -dy / L, ny = dx / L, k = 4 / 3;
        return { t: 'C', p: [[p[0] + dx / 3 + nx * h * k * 0.75, p[1] + dy / 3 + ny * h * k * 0.75], [p[0] + (2 * dx) / 3 + nx * h * k * 0.75, p[1] + (2 * dy) / 3 + ny * h * k * 0.75], q] };
      });
    }
    // curve: smooth. Two ends → one cubic leaving / entering along the nodes' normals (or the dominant axis); with points → Catmull-Rom
    const k = num(s.curvature, 0, 1, 0.5);
    if (all.length === 2) {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const axis = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dy) || 1];
      const n1 = na || axis, n2 = nb || [-axis[0], -axis[1]], reach = L * k * 0.9;
      return [{ t: 'C', p: [[a[0] + n1[0] * reach, a[1] + n1[1] * reach], [b[0] + n2[0] * reach, b[1] + n2[1] * reach], b] }];
    }
    const out = [];
    for (let i = 0; i < all.length - 1; i++) {
      const p0 = all[i - 1] || all[i], p1 = all[i], p2 = all[i + 1], p3 = all[i + 2] || p2, f = k / 3 * 1.2;
      out.push({ t: 'C', p: [[p1[0] + (p2[0] - p0[0]) * f, p1[1] + (p2[1] - p0[1]) * f], [p2[0] - (p3[0] - p1[0]) * f, p2[1] - (p3[1] - p1[1]) * f], p2] });
    }
    return out;
  }
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  function pathOf(a, segs) {
    return `M${f1(a[0])} ${f1(a[1])}` + segs.map((s) => s.t + s.p.map((p) => `${f1(p[0])} ${f1(p[1])}`).join(' ')).join('');
  }
  /** the geometry of a spec: its path, its length (sampled — no DOM needed), its middle point and the direction there */
  function route(s) {
    const cf = centre(s.from), ct = centre(s.to);
    const pts = Array.isArray(s.points) ? s.points.map(pt).filter(Boolean) : [];
    const a = anchor(s.from, pts[0] || ct), b = anchor(s.to, pts[pts.length - 1] || cf);
    const segs = segments(a, b, s, normal(s.from, a), normal(s.to, b));
    const samples = [a];
    let p0 = a;
    segs.forEach((g) => { const N = g.t === 'L' ? 1 : 24; for (let i = 1; i <= N; i++) samples.push(at(g, p0, i / N)); p0 = g.p[g.p.length - 1]; });
    const acc = [0];
    for (let i = 1; i < samples.length; i++) acc.push(acc[i - 1] + Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]));
    const length = acc[acc.length - 1];
    let j = acc.findIndex((v) => v >= length / 2); if (j < 1) j = 1;
    const q = samples[j - 1], r = samples[j], t = (length / 2 - acc[j - 1]) / ((acc[j] - acc[j - 1]) || 1);
    return { d: pathOf(a, segs), length, start: a, end: b, mid: lerp(q, r, t), angle: (Math.atan2(r[1] - q[1], r[0] - q[0]) * 180) / Math.PI };
  }

  /* ------------------------------------------------------------------ the data rule */
  function read(value, sem = {}) {
    const zero = pick(sem.zero, ['still', 'hide', 'dim'], 'still'), unav = pick(sem.unavailable, ['dashed', 'hide', 'dim'], 'dashed');
    if (value && typeof value === 'object' && value.unavailable) return { state: 'unavailable', direction: 'none', zero, unavailable: unav };
    if (value === null || value === undefined || value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value))) return { state: 'unavailable', direction: 'none', zero, unavailable: unav };
    const v = Number(value), dead = num(sem.deadband, 0, 1e12, 0);
    if (Math.abs(v) <= dead) return { state: 'idle', direction: 'none', zero, unavailable: unav };
    const pos = pick(sem.positive, ['forward', 'reverse'], 'forward');
    const direction = (v > 0) === (pos === 'forward') ? 'forward' : 'reverse';
    const out = { state: 'flow', direction, zero, unavailable: unav };
    const sp = sem.speed;
    if (sp && Array.isArray(sp.range) && Array.isArray(sp.to)) {
      const [lo, hi] = sp.range.map(Number), [s0, s1] = sp.to.map(Number);
      if ([lo, hi, s0, s1].every(Number.isFinite) && hi > lo) { const f = Math.max(0, Math.min(1, (Math.abs(v) - lo) / (hi - lo))); out.speed = s0 + (s1 - s0) * f; }
    }
    return out;
  }

  /* ------------------------------------------------------------------ off-screen pausing (one observer for every host svg) */
  let io = null, observed = 0;
  const hosts = new WeakMap();    // svg → count of live connectors (weak: a host svg dropped without destroy() is not kept alive here)
  function watch(svg) {
    if (!svg || typeof IntersectionObserver !== 'function') return;
    if (!io) io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) delete e.target.dataset.iqfOff; else e.target.dataset.iqfOff = ''; }));
    const n = (hosts.get(svg) || 0) + 1;
    hosts.set(svg, n);
    if (n === 1) { io.observe(svg); observed++; }
  }
  function unwatch(svg) {
    if (!svg || !hosts.has(svg)) return;
    const n = hosts.get(svg) - 1;
    if (n > 0) { hosts.set(svg, n); return; }
    hosts.delete(svg); observed--; if (io) io.unobserve(svg);
    if (observed <= 0 && io) { io.disconnect(); io = null; observed = 0; }
  }

  /* ------------------------------------------------------------------ the connector */
  let seq = 0;
  const mk = (tag, attrs = {}, cls) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); if (cls) e.setAttribute('class', cls); return e; };
  const ARROW_D = { chevron: 'M1 1 L8 5 L1 9', triangle: 'M0 0 L10 5 L0 10 Z' };

  function connector(spec = {}) {
    const id = `iqf${++seq}`;
    let s = { ...spec }, reading = { state: 'flow', direction: 'forward' }, host = null, geo = null, arrows = [];
    const g = mk('g', { 'data-iqf': '' }, 'iqf');
    const defs = mk('defs');
    const track = mk('path', { fill: 'none' }, 'iqf__track');
    const flowP = mk('path', { fill: 'none' }, 'iqf__flow');
    const arrowsG = mk('g', {}, 'iqf__arrows');
    const mark = mk('path', { d: 'M-4 -5 L3 0 L-4 5', fill: 'none' }, 'iqf__mark');
    g.append(defs, track, flowP, arrowsG, mark);

    function markers() {
      defs.replaceChildren();
      const c = colour(s.color, 'var(--accent)');
      const arrow = pick(s.arrow, ARROWS, 'none'), style = pick(s.arrowStyle, ['chevron', 'triangle'], 'chevron');
      const m = (name, d, fill, open) => {
        const mm = mk('marker', { id: `${id}-${name}`, viewBox: '0 0 10 10', refX: name.startsWith('a') ? '8' : '5', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse', markerUnits: 'strokeWidth' });
        const p = mk('path', { d }); p.style.fill = open ? 'none' : fill; p.style.stroke = fill; p.style.strokeWidth = open ? '1.6' : '0'; p.style.strokeLinecap = 'round'; p.style.strokeLinejoin = 'round';
        mm.append(p); defs.append(mm); return `url(#${id}-${name})`;
      };
      const ends = { start: 'none', end: 'none' };
      if (arrow !== 'none') { const u = m('arrow', ARROW_D[style], c, style === 'chevron'); if (arrow === 'end' || arrow === 'both') ends.end = u; if (arrow === 'start' || arrow === 'both') ends.start = u; }
      const mk2 = s.markers || {};
      ['start', 'end'].forEach((w) => { const kind = pick(mk2[w], MARKERS, 'none'); if (kind !== 'none' && ends[w] === 'none') ends[w] = m(`m${w}`, kind === 'dot' ? 'M5 2 A3 3 0 1 1 4.99 2 Z' : 'M5 1.5 A3.5 3.5 0 1 1 4.99 1.5 Z', c, kind === 'ring'); });
      track.setAttribute('marker-start', ends.start); track.setAttribute('marker-end', ends.end);
      if (Array.isArray(s.gradient) && s.gradient.length === 2 && geo) {
        const lg = mk('linearGradient', { id: `${id}-grad`, gradientUnits: 'userSpaceOnUse', x1: f1(geo.start[0]), y1: f1(geo.start[1]), x2: f1(geo.end[0]), y2: f1(geo.end[1]) });
        s.gradient.forEach((col, i) => { const st = mk('stop', { offset: String(i) }); st.style.stopColor = colour(col, c); lg.append(st); });
        defs.append(lg);
        track.style.stroke = `url(#${id}-grad)`;
      } else track.style.stroke = c;
    }

    function paint() {
      geo = route(s);
      const d = geo.d, w = num(s.width, 0.5, 40, 2), A = s.animation || {};
      const type = pick(A.type, ANIMS, 'dots'), line = pick(s.line, LINES, 'solid');
      g.dataset.anim = type; g.dataset.line = line;
      [track, flowP].forEach((p) => p.setAttribute('d', d));
      track.style.strokeWidth = `${w}px`;
      track.style.opacity = String(num(s.opacity, 0, 1, 1));
      track.style.strokeDasharray = line === 'dashed' ? `${w * 4} ${w * 3}` : line === 'dotted' ? `0 ${w * 2.5}` : '';
      track.style.strokeLinecap = line === 'dotted' ? 'round' : 'round';
      const glow = num(s.glow, 0, 1, 0);
      track.style.filter = glow ? `drop-shadow(0 0 ${f1(2 + glow * 8)}px ${colour(s.color, 'var(--accent)')})` : '';
      markers();
      // the animated layer
      const ac = colour(A.color, colour(s.color, 'var(--accent)')), size = num(A.size, 1, 30, Math.max(3, w * 1.6)), spacing = num(A.spacing, 4, 400, Math.max(14, size * 4));
      const speed = num(reading.speed, 1, 4000, num(A.speed, 1, 4000, 40)), ag = num(A.glow, 0, 1, 0);
      g.style.setProperty('--iqf-c', ac);
      g.style.setProperty('--iqf-o', String(num(A.opacity, 0, 1, 1)));
      g.style.setProperty('--iqf-glow', ag ? `drop-shadow(0 0 ${f1(2 + ag * 10)}px ${ac})` : 'none');
      flowP.style.strokeWidth = `${type === 'dots' ? size : type === 'pulse' ? Math.max(w, size) : Math.max(1, Math.min(size, w * 1.4))}px`;
      if (type === 'dots' || type === 'dashes') {
        const dash = type === 'dots' ? 0 : size * 2;
        flowP.style.strokeDasharray = `${f1(dash)} ${f1(spacing)}`;
        flowP.removeAttribute('pathLength');
        g.style.setProperty('--iqf-step', `${f1(dash + spacing)}px`);
        g.style.setProperty('--iqf-dur', `${((dash + spacing) / speed).toFixed(3)}s`);
      } else if (type === 'pulse') {
        // one bright stretch travelling the whole connection (normalised length 100)
        flowP.setAttribute('pathLength', '100');
        const len = Math.max(6, Math.min(40, (size * 4 * 100) / (geo.length || 100)));
        flowP.style.strokeDasharray = `${f1(len)} ${f1(200)}`;
        g.style.setProperty('--iqf-pl', String(f1(len)));
        g.style.setProperty('--iqf-dur', `${((geo.length || 100) / speed).toFixed(3)}s`);
      } else { flowP.style.strokeDasharray = ''; flowP.removeAttribute('pathLength'); }
      // arrows: small chevrons travelling along the connection (CSS motion path), evenly spread
      arrows.forEach((a) => a.remove()); arrows = [];
      if (type === 'arrows' && geo.length > 0) {
        const count = Math.max(1, Math.min(24, Math.floor(geo.length / spacing))), dur = geo.length / speed;
        g.style.setProperty('--iqf-dur', `${dur.toFixed(3)}s`);
        for (let i = 0; i < count; i++) {
          const a = mk('path', { d: `M${f1(-size * 0.7)} ${f1(-size)} L${f1(size * 0.6)} 0 L${f1(-size * 0.7)} ${f1(size)}`, fill: 'none' }, 'iqf__arrow');
          a.style.offsetPath = `path('${d}')`;
          a.style.animationDelay = `${(-(i * dur) / count).toFixed(3)}s`;
          arrowsG.append(a); arrows.push(a);
        }
      }
      // the static direction mark (middle of the connection)
      const rot = reading.direction === 'reverse' ? geo.angle + 180 : geo.angle;
      mark.setAttribute('transform', `translate(${f1(geo.mid[0])} ${f1(geo.mid[1])}) rotate(${f1(rot)})`);
      g.dataset.mark = pick(s.mark, ['auto', 'always', 'never'], 'auto');
      apply();
    }
    function apply() {
      g.dataset.state = reading.state || 'flow';
      g.dataset.dir = reading.direction === 'reverse' ? 'reverse' : reading.direction === 'none' ? 'none' : 'forward';
      g.dataset.zero = reading.zero || 'still';
      g.dataset.unavailable = reading.unavailable || 'dashed';
    }

    const api = {
      el: g,
      /** the connection's geometry now (for hosts and tests) */
      geometry: () => geo,
      /** a changed part of the spec (a node moved, a colour, the animation…) — redrawn once */
      update(patch = {}) {
        s = { ...s, ...patch };
        if (!host && g.ownerSVGElement) { host = g.ownerSVGElement; watch(host); }
        paint();
        return api;
      },
      /** a reading (IniqFlow.read) → whether / which way it moves; the speed it carries (if any) */
      flow(r = {}) {
        const before = reading.speed;
        reading = { state: pick(r.state, ['flow', 'idle', 'unavailable'], 'idle'), direction: pick(r.direction, ['forward', 'reverse', 'none'], 'none'), speed: r.speed, zero: r.zero, unavailable: r.unavailable };
        if (before !== reading.speed || !geo) paint(); else {
          apply();
          const rot = reading.direction === 'reverse' ? geo.angle + 180 : geo.angle;
          mark.setAttribute('transform', `translate(${f1(geo.mid[0])} ${f1(geo.mid[1])}) rotate(${f1(rot)})`);
        }
        return api;
      },
      destroy() { if (host) unwatch(host); host = null; arrows = []; g.remove(); },
    };
    paint();
    return api;
  }
  /** attach a connector to its svg (so off-screen pausing follows that svg): host.append + update */
  function mount(svg, c) { svg.append(c.el); c.update(); return c; }

  global.IniqFlow = Object.freeze({ connector, mount, read, route, anchor, colour, GEOMETRY, ANIMS, LINES, ARROWS, MARKERS, SIDES,
    /** for tests: how many host svgs are observed now */ _observed: () => observed });
})(window);
