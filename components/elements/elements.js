/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqElements — the VISUAL BUILDING BLOCKS of Widget Studio's toolbox (docs/WIDGET-STUDIO-POC.md, "Toolbox"), registered in the shared
   component foundation (IniqComponents) like every other composable component: a pure renderer (configuration + view data in, an
   element out), its view path (update), its Properties (the shared form's field types) and what it may consume / report.

   Nothing here knows Home Assistant. A newly placed element has NO meaning: a shape, a line, a spacer and a panel never take data; an
   information element (progress, battery, status, label + value, badge) shows its PREVIEW data until the designer explicitly chooses a
   Widget Property for it (the only binding — components/ha/binding.js). Controls report their events to the host; the host decides.

   Colours are THEME TOKEN NAMES (var(--token): they follow the dashboard / widget theme at once, no re-render) or an explicit '#rrggbb'
   (kept as chosen). Geometry is predefined (CSS shapes, a clip-path triangle, SVG circles built with createElementNS) — never markup or
   SVG text from the configuration.

     shape · line · spacer · badge · panel (Group / container) · image-overlay      visual / layout
     progress-bar · progress-ring · arc-gauge · status · label-value · battery        information (arc gauge / ring: the shared IniqGauge)
     stepper · select                                                                 controls (shared: IniqControls.stepper / .select)
   ========================================================================== */
(function (global) {
  'use strict';
  const IC = global.IniqComponents;
  if (!IC) return;

  const HEX = /^#[0-9a-fA-F]{6}$/;
  /** the theme tokens a colour property offers (the shared colour control: swatches + Custom) */
  const COLOURS = ['accent', 'accent-hot', 'accent-soft', 'text-primary', 'text-secondary', 'text-muted', 'surface-primary', 'surface-secondary', 'surface-tertiary',
    'control-well', 'page-bg', 'border-primary', 'success', 'warning', 'danger', 'info', 'neutral', 'cool', 'purple', 'light-warm'];
  const colour = (v, fb) => (typeof v === 'string' ? (HEX.test(v) ? v.toLowerCase() : COLOURS.includes(v) ? `var(--${v})` : fb) : fb);
  const n = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const el = (tag, cls, kids = []) => { const e = document.createElement(tag); if (cls) e.className = cls; kids.forEach((k) => k && e.append(k)); return e; };
  const txt = (tag, cls, t) => { const e = el(tag, cls); e.textContent = t; return e; };
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const fmt = (v, dec) => (finite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—');
  const frac = (d) => { const lo = n(d.min, -1e9, 1e9, 0), hi = n(d.max, -1e9, 1e9, 100), v = Number(d.value); return finite(v) && hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 0; };
  const icons = () => global.IniqIcons;
  const glyph = (name, size) => { const s = el('span', 'iqel-ico'); s.style.setProperty('--iqel-ico', `${size}px`); if (icons() && name) icons().present(s, { icon: name }); else s.setAttribute('aria-hidden', 'true'); return s; };

  /* ================================================================ IniqPaint — FILLS and SHADOWS, shared by every surface (Studio elements and
     the element style of any Studio component). Values are checked colours (theme tokens or #rrggbb) and bounded numbers; the CSS is
     written here, never taken from the configuration.
       fill({ type: 'solid' | 'linear' | 'radial' | 'conic', angle, cx, cy, stops: [{ color, at (0–100 %), opacity (%) }] }) → CSS background
       shadows([{ x, y, blur, spread, color, opacity, inset? }], inset) → CSS box-shadow     dropShadows([…]) → CSS filter (follows the outline)
     ================================================================ */
  const mixA = (col, pct) => (pct >= 100 ? col : `color-mix(in srgb, ${col} ${pct}%, transparent)`);
  const STOP_MAX = 12, SHADOW_MAX = 6;
  const Paint = {
    stops(list) {
      return (Array.isArray(list) ? list : []).slice(0, STOP_MAX).filter((st) => st && typeof st === 'object')
        .map((st) => ({ c: mixA(colour(st.color, 'transparent'), n(st.opacity, 0, 100, 100)), at: n(st.at, 0, 100, null) }));
    },
    fill(spec, fallback = 'transparent') {
      const sp = spec && typeof spec === 'object' ? spec : {}, st = Paint.stops(sp.stops);
      const type = pick(sp.type, ['solid', 'linear', 'radial', 'conic'], 'solid');
      if (type === 'solid' || st.length < 2) return st[0] ? st[0].c : fallback;
      const list = st.map((x) => (x.at === null ? x.c : `${x.c} ${x.at}%`)).join(', ');
      const cx = n(sp.cx, 0, 100, 50), cy = n(sp.cy, 0, 100, 50);
      if (type === 'linear') return `linear-gradient(${n(sp.angle, 0, 360, 180)}deg, ${list})`;
      if (type === 'radial') return `radial-gradient(circle at ${cx}% ${cy}%, ${list})`;
      return `conic-gradient(from ${n(sp.angle, 0, 360, 0)}deg at ${cx}% ${cy}%, ${list})`;
    },
    shadow1(sh, inset) {
      return `${inset || sh.inset === true ? 'inset ' : ''}${n(sh.x, -100, 100, 0)}px ${n(sh.y, -100, 100, 0)}px ${n(sh.blur, 0, 200, 12)}px ${n(sh.spread, -60, 60, 0)}px ${mixA(colour(sh.color, '#000000'), n(sh.opacity, 0, 100, 40))}`;
    },
    shadows(list, inset = false) { return (Array.isArray(list) ? list : []).slice(0, SHADOW_MAX).filter((x) => x && typeof x === 'object').map((x) => Paint.shadow1(x, inset)).join(', '); },
    /** drop shadows that follow the element's OUTLINE (its painted pixels — text, icons, rings): CSS filter drop-shadow() */
    dropShadows(list) {
      return (Array.isArray(list) ? list : []).slice(0, SHADOW_MAX).filter((x) => x && typeof x === 'object')
        .map((x) => `drop-shadow(${n(x.x, -100, 100, 0)}px ${n(x.y, -100, 100, 0)}px ${n(x.blur, 0, 200, 12)}px ${mixA(colour(x.color, '#000000'), n(x.opacity, 0, 100, 40))})`).join(' ');
    },
    /** the form fields of a colour stop / a shadow (MaisonForm — every value visible and editable) */
    stopFields: () => [{ key: 'color', type: 'color', label: 'Colour', options: COLOURS, custom: true },
      { key: 'at', type: 'range', label: 'Position', optional: true, min: 0, max: 100, step: 1, unit: '%', auto: 'Even' },
      { key: 'opacity', type: 'range', label: 'Opacity', optional: true, min: 0, max: 100, step: 1, unit: '%', auto: 'Opaque', autoValue: 100 }],
    shadowFields: (withInset = false, withSpread = true) => [{ key: 'x', type: 'range', label: 'X', min: -100, max: 100, step: 1, unit: 'px', get: (o) => o.x ?? 0 },
      { key: 'y', type: 'range', label: 'Y', min: -100, max: 100, step: 1, unit: 'px', get: (o) => o.y ?? 0 },
      { key: 'blur', type: 'range', label: 'Blur', min: 0, max: 200, step: 1, unit: 'px', get: (o) => o.blur ?? 12 },
      ...(withSpread ? [{ key: 'spread', type: 'range', label: 'Spread', min: -60, max: 60, step: 1, unit: 'px', get: (o) => o.spread ?? 0 }] : []),
      { key: 'color', type: 'color', label: 'Colour', options: COLOURS, custom: true }, { key: 'opacity', type: 'range', label: 'Strength', min: 0, max: 100, step: 1, unit: '%', get: (o) => o.opacity ?? 40 },
      ...(withInset ? [{ key: 'inset', type: 'boolean', label: 'Inner shadow', get: (o) => o.inset === true, set: (o, v) => { if (v) o.inset = true; else delete o.inset; } }] : [])],
    /** a collection field (MaisonForm) for a list of colour stops / shadows at `key` (dotted: inside an object, e.g. style.shadows) */
    listField(key, label, group, kind, extra = {}) {
      const max = kind === 'stops' ? STOP_MAX : SHADOW_MAX;
      return { key, type: 'collection', label, group, max, itemLabel: kind === 'stops' ? 'colour stop' : 'shadow', addLabel: kind === 'stops' ? '+ Add a colour stop' : '+ Add a shadow',
        get: (c) => { const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), c); return Array.isArray(v) ? v : []; },
        set: (c, l) => { const ks = key.split('.'); let o = c; ks.slice(0, -1).forEach((k) => { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }); if (l.length) o[ks[ks.length - 1]] = l; else delete o[ks[ks.length - 1]]; },
        create: () => (kind === 'stops' ? { color: 'accent', opacity: 100 } : { x: 0, y: 8, blur: 24, color: '#000000', opacity: 40 }),
        summary: (x) => ({ title: kind === 'stops' ? `${x.color || '—'}${typeof x.at === 'number' ? ` at ${x.at}%` : ''}` : `${x.inset ? 'Inner · ' : ''}${x.x ?? 0}, ${x.y ?? 0} · blur ${x.blur ?? 12} · ${x.color || '#000000'}` }),
        fields: kind === 'stops' ? Paint.stopFields() : Paint.shadowFields(extra.inset === true, extra.spread !== false) };
    },
    /** OUTLINE of a parametric card shape, as an SVG / CSS path in the element's logical px.
     *  kind 'tab' (a raised tab on one edge), 'notch' (a cut-out in one edge), 'callout' (a pointer on one edge).
     *  side top | right | bottom | left; at = the feature's centre along that edge (%); width / depth px; slope = how far each side
     *  leans (px; a callout's sides meet at the tip); corners {tl,tr,br,bl} = the body's corner radii; join = the radius where the
     *  feature meets the edge (and of a tab's / notch's own corners); tip = a callout tip's radius. */
    outline(spec, W, H) {
      const sp = spec || {}, w = Math.max(1, +W || 1), h = Math.max(1, +H || 1);
      const kind = pick(sp.kind, ['tab', 'notch', 'callout'], 'tab'), side = pick(sp.side, ['top', 'right', 'bottom', 'left'], kind === 'callout' ? 'bottom' : 'top');
      const across = side === 'top' || side === 'bottom';
      const U = across ? w : h, V = across ? h : w;                       // U along the feature's edge, V across it
      const depth = Math.min(n(sp.depth, 0, 2000, kind === 'callout' ? 12 : 24), V * 0.9);
      const fw = Math.min(n(sp.width, 2, 4000, kind === 'callout' ? 20 : 96), U);
      const c = (U * n(sp.at, 0, 100, 50)) / 100, a = Math.max(0, Math.min(U - fw, c - fw / 2)), b = a + fw;
      const slope = kind === 'callout' ? fw / 2 : Math.min(n(sp.slope, 0, 400, 0), fw / 2);
      const join = n(sp.join, 0, 400, 8), tip = n(sp.tip, 0, 400, 3);
      // the outline in the feature's frame, with the feature on the FAR edge (v = V); `r` per point
      const far = kind === 'notch' ? V : V - depth;                      // the body's far edge
      let pts;
      if (kind === 'notch') pts = [[0, 0, 'c'], [U, 0, 'c'], [U, V, 'c'], [b, V, join], [b - slope, V - depth, join], [a + slope, V - depth, join], [a, V, join], [0, V, 'c']];
      else if (kind === 'callout') pts = [[0, 0, 'c'], [U, 0, 'c'], [U, far, 'c'], [b, far, join], [(a + b) / 2, V, tip], [a, far, join], [0, far, 'c']];
      else pts = [[0, 0, 'c'], [U, 0, 'c'], [U, far, 'c'], [b, far, join], [b - slope, V, join], [a + slope, V, join], [a, far, join], [0, far, 'c']];
      // the frame → the box: the feature's edge becomes `side`
      const map = { bottom: ([u, v]) => [u, v], top: ([u, v]) => [u, h - v], right: ([u, v]) => [v, u], left: ([u, v]) => [w - v, u] }[side];
      const cx = w / 2, cy = h / 2, cr = sp.corners || {};
      const P = pts.map((p) => { const [x, y] = map(p); let r = p[2];
        if (r === 'c') r = n(cr[`${y < cy ? 't' : 'b'}${x < cx ? 'l' : 'r'}`], 0, 2000, 16);
        return { x, y, r }; });
      const ox = +sp.ox || 0, oy = +sp.oy || 0, f = (v) => Math.round(v * 100) / 100;
      P.forEach((p) => { p.x += ox; p.y += oy; });
      let d = '';
      P.forEach((p, i) => {
        const A = P[(i + P.length - 1) % P.length], B = P[(i + 1) % P.length];
        const la = Math.hypot(A.x - p.x, A.y - p.y) || 1, lb = Math.hypot(B.x - p.x, B.y - p.y) || 1;
        const r = Math.min(p.r, la / 2, lb / 2);
        const p1 = [p.x + ((A.x - p.x) / la) * r, p.y + ((A.y - p.y) / la) * r], p2 = [p.x + ((B.x - p.x) / lb) * r, p.y + ((B.y - p.y) / lb) * r];
        d += `${i ? 'L' : 'M'}${f(p1[0])} ${f(p1[1])} Q${f(p.x)} ${f(p.y)} ${f(p2[0])} ${f(p2[1])} `;
      });
      return `${d}Z`;
    },
    /** a rectangle with corner radii [tl, tr, br, bl] at (x, y), as a path (the same rounding as outline) */
    rect(x, y, w, h, radii = [0, 0, 0, 0]) {
      const f = (v) => Math.round(v * 100) / 100, m = Math.min(w, h) / 2, [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(m, +r || 0)));
      return `M${f(x + tl)} ${f(y)} L${f(x + w - tr)} ${f(y)} Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + tr)} L${f(x + w)} ${f(y + h - br)} Q${f(x + w)} ${f(y + h)} ${f(x + w - br)} ${f(y + h)} `
        + `L${f(x + bl)} ${f(y + h)} Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - bl)} L${f(x)} ${f(y + tl)} Q${f(x)} ${f(y)} ${f(x + tl)} ${f(y)} Z`;
    },
    MAX: { stops: STOP_MAX, shadows: SHADOW_MAX },
  };
  global.IniqPaint = Paint;

  /* ---- shared field helpers (MaisonForm field definitions) */
  const opt = (list) => list.map(([value, label]) => ({ value, label }));
  const F = {
    colour: (key, label, group, help) => ({ key, type: 'color', label, group, optional: true, options: COLOURS, custom: true, half: true, ...(help ? { help } : {}) }),
    range: (key, label, group, min, max, step = 1, unit = 'px', autoValue) => ({ key, type: 'range', label, group, optional: true, min, max, step, unit, ...(autoValue !== undefined ? { auto: 'Automatic', autoValue } : {}) }),
    select: (key, label, group, list, d) => ({ key, type: 'select', label, group, half: true, get: (c) => c[key] || d, options: opt(list) }),
    text: (key, label, group, max = 40) => ({ key, type: 'text', label, group, optional: true, maxLength: max }),
    bool: (key, label, group, d = false) => ({ key, type: 'boolean', label, group, get: (c) => (c[key] === undefined ? d : !!c[key]) }),
    icon: (key, label, group) => ({ key, type: 'mdi', label, group, optional: true }),
  };
  const dataNum = (key, label, help) => ({ key: `data.${key}`, type: 'number', label, group: key === 'value' ? 'data' : 'range', half: true, ...(help ? { help } : {}) });
  const RANGE_DATA = [dataNum('value', 'Value (preview)', 'Design only — shown until a Widget Property gives it a value.'), dataNum('min', 'Minimum'), dataNum('max', 'Maximum')];
  const NUM_INPUTS = { value: { label: 'Value', kind: 'number', primary: true }, min: { label: 'Minimum', kind: 'number', range: true }, max: { label: 'Maximum', kind: 'number', range: true } };
  /** a composed element whose renderer draws into a stable root (render → root; update → the same root redrawn) */
  const drawn = (cls, paint) => ({
    render: (c, d = {}, ctx = {}) => { const root = el('div', `iqel ${cls}`); paint(root, c || {}, d || {}, ctx.box || {}); return root; },
    update: (root, c, d = {}, ctx = {}) => { if (!root.classList.contains(cls)) return false; paint(root, c || {}, d || {}, ctx.box || {}); return true; },
  });

  /* ================================================================ SHAPE — predefined geometry only */
  const SHAPES = [['rectangle', 'Rectangle'], ['rounded', 'Rounded rectangle'], ['square', 'Square'], ['circle', 'Circle'], ['ellipse', 'Ellipse'], ['pill', 'Pill / lozenge'], ['triangle', 'Triangle'],
    ['tab', 'Card with a tab'], ['notch', 'Card with a notch'], ['callout', 'Speech bubble (pointer)']];
  const PATHED = ['tab', 'notch', 'callout'];
  function paintShape(root, c, d, box = {}) {
    const shape = pick(c.shape, SHAPES.map((s) => s[0]), 'rounded');
    root.dataset.shape = shape;
    const fill = colour(c.fill, 'var(--accent)'), a = n(c.fillOpacity, 0, 100, 100), bw = n(c.borderWidth, 0, 24, 0);
    const mix = (col, pct) => (pct >= 100 ? col : `color-mix(in srgb, ${col} ${pct}%, transparent)`);
    // FILL: one colour, or a GRADIENT between two colours (linear at an angle, or radial from the centre) — both colours keep the fill opacity
    const mode = pick(c.fillMode, ['solid', 'linear', 'radial', 'conic'], 'solid');
    const f1 = mix(fill, a), f2 = mix(colour(c.fill2, 'var(--accent-hot)'), n(c.fill2Opacity, 0, 100, a));
    // MULTI-STOP gradients (two or more colour stops, any type) take precedence over the two-colour fill
    const multi = Array.isArray(c.stops) && c.stops.length >= 2 && mode !== 'solid';
    root.style.setProperty('--iqel-fill', multi ? Paint.fill({ type: mode, angle: c.angle, cx: c.centerX, cy: c.centerY, stops: c.stops })
      : mode === 'linear' ? `linear-gradient(${n(c.angle, 0, 360, 180)}deg, ${f1}, ${f2})` : mode === 'radial' ? `radial-gradient(circle at ${n(c.centerX, 0, 100, 50)}% ${n(c.centerY, 0, 100, 50)}%, ${f1}, ${f2})`
        : mode === 'conic' ? `conic-gradient(from ${n(c.angle, 0, 360, 0)}deg, ${f1}, ${f2}, ${f1})` : f1);
    // PER-CORNER radius (rounded rectangle): each corner its own, else the one radius
    const r0 = n(c.radius, 0, 400, 16), corner = (k) => `${n(c[k], 0, 400, r0)}px`;
    root.style.setProperty('--iqel-rc', ['radiusTL', 'radiusTR', 'radiusBR', 'radiusBL'].map(corner).join(' '));
    root.style.setProperty('--iqel-bs', pick(c.borderStyle, ['solid', 'dashed', 'dotted', 'double'], 'solid'));
    // SHADOW: none · the theme's card shadow · a custom one (offset, blur, colour, strength)
    const sh = c.shadow === true ? 'card' : pick(c.shadow, ['none', 'card', 'custom', 'list'], 'none');
    const outer = sh === 'card' ? 'var(--device-shadow)' : sh === 'custom'
      ? `${n(c.shadowX, -60, 60, 0)}px ${n(c.shadowY, -60, 60, 8)}px ${n(c.shadowBlur, 0, 120, 24)}px ${n(c.shadowSpread, -40, 40, 0)}px ${mix(colour(c.shadowColor, '#000000'), n(c.shadowOpacity, 0, 100, 45))}`
        : sh === 'list' ? Paint.shadows(c.shadows) : '';
    // INNER shadows (highlights / depth): any number, drawn inside the shape
    const inner = Paint.shadows(c.innerShadows, true);
    root.style.setProperty('--iqel-shadow', [outer, inner].filter(Boolean).join(', ') || 'none');
    // BACKDROP BLUR: what lies under the shape (a picture) is blurred — frosted glass
    root.style.setProperty('--iqel-blur', n(c.blur, 0, 40, 0) ? `blur(${n(c.blur, 0, 40, 0)}px)` : 'none');
    root.style.setProperty('--iqel-bc', colour(c.borderColor, 'var(--border-primary)'));
    root.style.setProperty('--iqel-bw', `${shape === 'triangle' ? 0 : bw}px`);
    root.style.setProperty('--iqel-r', `${n(c.radius, 0, 400, 16)}px`);
    root.style.setProperty('--iqel-rot', `${n(c.rotate, -180, 180, 0)}deg`);
    root.style.setProperty('--iqel-o', String(n(c.opacity, 0, 100, 100) / 100));
    if (!root.firstChild) root.append(el('div', 'iqel-shape__s'));
    // PARAMETRIC OUTLINES (tab, notch, callout): the fill is clipped to the outline; the border is the same outline drawn in SVG and
    // clipped too (so it lies inside, as a CSS border does); outer shadows follow the outline (drop-shadow on the element)
    const s0 = root.firstChild;
    let svg = root.querySelector('svg.iqel-shape__o');
    if (PATHED.includes(shape)) {
      const W = n(box.w, 1, 4000, root.clientWidth || 120), H = n(box.h, 1, 4000, root.clientHeight || 80);
      const d = Paint.outline({ kind: shape, side: c.featureSide, at: c.featureAt, width: c.featureWidth, depth: c.featureDepth, slope: c.featureSlope,
        join: c.joinRadius, tip: c.tipRadius, corners: { tl: n(c.radiusTL, 0, 400, r0), tr: n(c.radiusTR, 0, 400, r0), br: n(c.radiusBR, 0, 400, r0), bl: n(c.radiusBL, 0, 400, r0) } }, W, H);
      s0.style.clipPath = `path('${d}')`;
      if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'iqel-shape__o'); svg.append(document.createElementNS('http://www.w3.org/2000/svg', 'path')); root.append(svg); }
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.style.clipPath = `path('${d}')`;
      const pa = svg.firstChild, bs = pick(c.borderStyle, ['solid', 'dashed', 'dotted', 'double'], 'solid');
      pa.setAttribute('d', d); pa.setAttribute('fill', 'none'); pa.setAttribute('stroke', bw ? colour(c.borderColor, 'var(--border-primary)') : 'none');
      pa.setAttribute('stroke-width', String(bw * 2));
      pa.setAttribute('stroke-dasharray', bs === 'dashed' ? `${bw * 3} ${bw * 2}` : bs === 'dotted' ? `0.01 ${bw * 2.2}` : 'none'); pa.setAttribute('stroke-linecap', bs === 'dotted' ? 'round' : 'butt');
      root.style.setProperty('--iqel-bw', '0px');
      root.style.setProperty('--iqel-shadow', inner || 'none');
      const drop = sh === 'list' ? Paint.dropShadows(c.shadows) : sh === 'custom' ? Paint.dropShadows([{ x: c.shadowX ?? 0, y: c.shadowY ?? 8, blur: c.shadowBlur ?? 24, color: c.shadowColor, opacity: c.shadowOpacity ?? 45 }]) : sh === 'card' ? 'drop-shadow(0 8px 24px rgb(0 0 0 / 0.35))' : '';
      root.style.filter = drop;
    } else {
      s0.style.clipPath = ''; if (svg) svg.remove(); root.style.filter = '';
    }
  }
  function shapeOutline(c, box, ox, oy) {
    const shape = pick(c.shape, SHAPES.map((s) => s[0]), 'rounded'), W = n(box.w, 1, 4000, 120), H = n(box.h, 1, 4000, 80), r0 = n(c.radius, 0, 400, 16);
    const corners = ['radiusTL', 'radiusTR', 'radiusBR', 'radiusBL'].map((k) => n(c[k], 0, 400, r0));
    if (PATHED.includes(shape)) return Paint.outline({ kind: shape, side: c.featureSide, at: c.featureAt, width: c.featureWidth, depth: c.featureDepth, slope: c.featureSlope,
      join: c.joinRadius, tip: c.tipRadius, corners: { tl: corners[0], tr: corners[1], br: corners[2], bl: corners[3] }, ox, oy }, W, H);
    if (shape === 'triangle') return `M${ox + W / 2} ${oy} L${ox + W} ${oy + H} L${ox} ${oy + H} Z`;
    if (shape === 'square' || shape === 'circle') { const s = Math.min(W, H), x = ox + (W - s) / 2, y = oy + (H - s) / 2; return Paint.rect(x, y, s, s, Array(4).fill(shape === 'circle' ? s / 2 : 0)); }
    const r = shape === 'rectangle' ? [0, 0, 0, 0] : shape === 'pill' || shape === 'ellipse' ? Array(4).fill(Math.min(W, H) / 2) : corners;
    return Paint.rect(ox, oy, W, H, r);
  }
  IC.define('shape', { name: 'Shape', category: 'visual', module: 'IniqElements (shape)',
    render: (c, d, ctx) => drawn('iqel-shape', paintShape).render(c, d, ctx),
    contract: { shape: SHAPES.map((s) => s[0]).join(' | '), fillMode: "'solid' | 'linear' | 'radial'", fill: "token | '#rrggbb'", fill2: "token | '#rrggbb'", angle: '°', fillOpacity: '%', borderColor: "token | '#rrggbb'", borderWidth: 'px', radius: 'px (rounded rectangle)', rotate: '°', opacity: '%', shadow: "'none' | 'card' | 'custom' (+ shadowX/Y/Blur/Spread/Colour/Opacity)", blur: 'px (backdrop)' },
    capabilities: ['predefined geometry', 'fill + transparency', 'linear / radial gradient', 'custom shadow', 'backdrop blur', 'border', 'corner radius', 'rotation', 'theme colours'], state: 'none (visual only — never bound)',
    compose: { nameBase: 'Shape', defaults: {}, initial: () => ({ shape: 'rounded', fill: 'accent', fillOpacity: 100, radius: 16 }), data: {}, box: { w: 120, h: 80 }, min: { w: 4, h: 4 },
      fields: () => [
        F.select('shape', 'Shape', 'look', SHAPES, 'rounded'),
        { ...F.range('radius', 'Corner radius', 'look', 0, 200, 1, 'px', 16), when: (c) => !c.shape || c.shape === 'rounded' || PATHED.includes(c.shape) },
        ...[['radiusTL', 'Top-left corner'], ['radiusTR', 'Top-right corner'], ['radiusBR', 'Bottom-right corner'], ['radiusBL', 'Bottom-left corner']]
          .map(([k, l]) => ({ ...F.range(k, l, 'look', 0, 200, 1, 'px'), when: (c) => !c.shape || c.shape === 'rounded' || PATHED.includes(c.shape), half: true })),
        { ...F.select('featureSide', 'Tab / notch / pointer edge', 'look', [['top', 'Top'], ['right', 'Right'], ['bottom', 'Bottom'], ['left', 'Left']], 'top'), get: (c) => c.featureSide || (c.shape === 'callout' ? 'bottom' : 'top'), when: (c) => PATHED.includes(c.shape) },
        { ...F.range('featureAt', 'Position along the edge', 'look', 0, 100, 1, '%', 50), when: (c) => PATHED.includes(c.shape) },
        { ...F.range('featureWidth', 'Width', 'look', 2, 2000, 1, 'px'), when: (c) => PATHED.includes(c.shape), half: true },
        { ...F.range('featureDepth', 'Depth', 'look', 0, 1000, 1, 'px'), when: (c) => PATHED.includes(c.shape), half: true },
        { ...F.range('featureSlope', 'Side slope', 'look', 0, 400, 1, 'px', 0), when: (c) => c.shape === 'tab' || c.shape === 'notch', half: true },
        { ...F.range('joinRadius', 'Join radius', 'look', 0, 200, 1, 'px', 8), when: (c) => PATHED.includes(c.shape), half: true },
        { ...F.range('tipRadius', 'Tip radius', 'look', 0, 100, 1, 'px', 3), when: (c) => c.shape === 'callout', half: true },
        F.select('fillMode', 'Fill type', 'look', [['solid', 'One colour'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient'], ['conic', 'Conic gradient (sweep)']], 'solid'),
        F.colour('fill', 'Fill', 'look', 'A theme colour follows the dashboard theme; a custom colour stays as chosen.'), F.range('fillOpacity', 'Fill opacity', 'look', 0, 100, 1, '%', 100),
        { ...F.colour('fill2', 'Second colour', 'look'), when: (c) => c.fillMode === 'linear' || c.fillMode === 'radial' },
        { ...F.range('fill2Opacity', 'Second colour opacity', 'look', 0, 100, 1, '%', 100), when: (c) => c.fillMode === 'linear' || c.fillMode === 'radial' },
        { ...F.range('angle', 'Gradient angle', 'look', 0, 360, 1, '°', 180), when: (c) => c.fillMode === 'linear' || c.fillMode === 'conic' },
        ...['centerX', 'centerY'].map((k) => ({ ...F.range(k, k === 'centerX' ? 'Gradient centre X' : 'Gradient centre Y', 'look', 0, 100, 1, '%', 50), when: (c) => c.fillMode === 'radial' || c.fillMode === 'conic' })),
        { ...Paint.listField('stops', 'Colour stops (2 or more replace the two colours)', 'look', 'stops'), when: (c) => !!c.fillMode && c.fillMode !== 'solid' },
        { ...F.colour('borderColor', 'Border colour', 'look'), when: (c) => c.shape !== 'triangle' }, { ...F.range('borderWidth', 'Border width', 'look', 0, 24, 1, 'px', 0), when: (c) => c.shape !== 'triangle' },
        { ...F.select('borderStyle', 'Border style', 'look', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double']], 'solid'), when: (c) => c.shape !== 'triangle' },
        F.range('rotate', 'Rotation', 'look', -180, 180, 1, '°', 0), F.range('opacity', 'Opacity', 'look', 0, 100, 1, '%', 100),
        { key: 'shadow', type: 'select', label: 'Shadow', group: 'look', half: true, get: (c) => (c.shadow === true ? 'card' : c.shadow || 'none'), options: opt([['none', 'None'], ['card', 'Theme card shadow'], ['custom', 'Custom'], ['list', 'Several shadows']]) },
        { ...Paint.listField('shadows', 'Shadows', 'look', 'shadows'), when: (c) => c.shadow === 'list' },
        Paint.listField('innerShadows', 'Inner shadows (highlights and depth)', 'look', 'shadows'),
        ...[['shadowX', 'Shadow X', -60, 60, 0], ['shadowY', 'Shadow Y', -60, 60, 8], ['shadowBlur', 'Shadow blur', 0, 120, 24], ['shadowSpread', 'Shadow spread', -40, 40, 0], ['shadowOpacity', 'Shadow strength', 0, 100, 45]]
          .map(([k, l, lo, hi, d]) => ({ ...F.range(k, l, 'look', lo, hi, 1, k === 'shadowOpacity' ? '%' : 'px', d), when: (c) => c.shadow === 'custom' })),
        { ...F.colour('shadowColor', 'Shadow colour', 'look'), when: (c) => c.shadow === 'custom' },
        F.range('blur', 'Backdrop blur', 'look', 0, 40, 1, 'px', 0)],
      resize: { mode: 'fill', aspect: 'free' }, scale: { props: { radius: [0, 400], borderWidth: [0, 24] }, base: (c) => ({ radius: n(c.radius, 0, 400, 16), borderWidth: n(c.borderWidth, 0, 24, 0) }) },
      // its OUTLINE as a path at (ox, oy): what other elements can be clipped to (Element style → Clip to)
      outline: (c, box, ox = 0, oy = 0) => shapeOutline(c || {}, box || {}, ox, oy),
      ...drawn('iqel-shape', paintShape) } });

  /* ================================================================ LINE / DIVIDER */
  function paintLine(root, c) {
    root.dataset.orient = c.orient === 'v' ? 'v' : 'h';
    root.style.setProperty('--iqel-lw', `${n(c.thickness, 1, 24, 2)}px`);
    root.style.setProperty('--iqel-lc', colour(c.color, 'var(--border-primary)'));
    root.style.setProperty('--iqel-ls', pick(c.lineStyle, ['solid', 'dashed', 'dotted'], 'solid'));
    root.style.setProperty('--iqel-o', String(n(c.opacity, 0, 100, 100) / 100));
    if (!root.firstChild) root.append(el('div', 'iqel-line__l'));
  }
  IC.define('line', { name: 'Line / divider', category: 'visual', module: 'IniqElements (line)', render: (c) => drawn('iqel-line', paintLine).render(c),
    contract: { orient: "'h' | 'v'", thickness: 'px', color: "token | '#rrggbb'", lineStyle: "'solid' | 'dashed' | 'dotted'", opacity: '%' }, capabilities: ['horizontal / vertical', 'thickness', 'style', 'theme colour'], state: 'none',
    compose: { nameBase: 'Line', defaults: {}, initial: () => ({ orient: 'h', thickness: 2, color: 'border-primary' }), data: {}, box: { w: 200, h: 16 }, min: { w: 2, h: 2 },
      fields: () => [F.select('orient', 'Direction', 'look', [['h', 'Horizontal'], ['v', 'Vertical']], 'h'), F.range('thickness', 'Thickness', 'look', 1, 24, 1, 'px', 2),
        F.colour('color', 'Colour', 'look'), F.select('lineStyle', 'Style', 'look', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], 'solid'), F.range('opacity', 'Opacity', 'look', 0, 100, 1, '%', 100)],
      resize: { mode: 'fill', aspect: 'free' }, scale: null, ...drawn('iqel-line', paintLine) } });

  /* ================================================================ SPACER — empty room (outlined in Studio only) */
  IC.define('spacer', { name: 'Spacer', category: 'layout', module: 'IniqElements (spacer)', render: () => el('div', 'iqel iqel-spacer'),
    contract: { box: 'its own box only (no configuration)' }, capabilities: ['empty room (invisible on the dashboard)'], state: 'none',
    compose: { nameBase: 'Spacer', defaults: {}, data: {}, box: { w: 80, h: 40 }, min: { w: 2, h: 2 }, fields: () => [], resize: { mode: 'fill', aspect: 'free' }, scale: null,
      render: () => el('div', 'iqel iqel-spacer'), update: (r) => r.classList.contains('iqel-spacer') } });

  /* ================================================================ STATUS BADGE */
  function paintBadge(root, c, d) {
    const tone = colour(c.tone, 'var(--accent)'), style = pick(c.style, ['soft', 'filled', 'outline'], 'soft');
    root.dataset.style = style;
    root.style.setProperty('--iqel-c', tone);
    root.style.setProperty('--iqel-fs', `${n(c.textSize, 8, 40, 12)}px`);
    const t = d && d.text !== undefined && d.text !== null && d.text !== '' ? String(d.text) : (typeof c.text === 'string' ? c.text : 'Status');
    root.replaceChildren(...[c.icon ? glyph(c.icon, n(c.textSize, 8, 40, 12) + 2) : null, txt('span', 'iqel-badge__t', t)].filter(Boolean));
    root.dataset.state = d && d.unavailable ? 'unavailable' : '';
  }
  IC.define('badge', { name: 'Status badge', category: 'data', module: 'IniqElements (badge)', render: (c, d) => drawn('iqel-badge', paintBadge).render(c, d),
    contract: { text: 'text', icon: "'mdi:…'", tone: "token | '#rrggbb'", style: "'soft' | 'filled' | 'outline'", textSize: 'px' }, capabilities: ['text', 'icon', 'tone', 'style'], state: '{ text } — its preview, or its property',
    compose: { nameBase: 'Badge', defaults: {}, initial: () => ({ text: 'Online', tone: 'success', style: 'soft' }), data: {}, box: { w: 96, h: 28 }, min: { w: 24, h: 16 },
      fields: () => [F.text('text', 'Text', 'content'), F.icon('icon', 'Icon', 'content'), F.colour('tone', 'Tone', 'look'), F.select('style', 'Style', 'look', [['soft', 'Soft'], ['filled', 'Filled'], ['outline', 'Outline']], 'soft'),
        F.range('textSize', 'Text size', 'look', 8, 40, 1, 'px', 12)],
      inputs: { text: { label: 'Text', kind: 'text', primary: true, unit: true } },
      resize: { mode: 'center', aspect: 'free' }, scale: { props: { textSize: [8, 40] }, base: (c) => ({ textSize: n(c.textSize, 8, 40, 12) }) }, ...drawn('iqel-badge', paintBadge) } });

  /* ================================================================ PANEL — Group / container frame (a surface other elements sit on) */
  function paintPanel(root, c) {
    const style = pick(c.style, ['card', 'soft', 'outline', 'glass'], 'card');
    root.dataset.style = style;
    root.style.setProperty('--iqel-r', `${n(c.radius, 0, 200, 16)}px`);
    root.style.setProperty('--iqel-pbg', colour(c.fill, ''));
    root.style.setProperty('--iqel-o', String(n(c.opacity, 0, 100, 100) / 100));
    const title = typeof c.title === 'string' ? c.title.trim() : '';
    root.replaceChildren(...(title ? [txt('span', 'iqel-panel__t', title)] : []));
  }
  IC.define('panel', { name: 'Group / container', category: 'layout', module: 'IniqElements (panel)', render: (c) => drawn('iqel-panel', paintPanel).render(c),
    contract: { title: 'text', style: "'card' | 'soft' | 'outline' | 'glass'", fill: "token | '#rrggbb'", radius: 'px', opacity: '%' }, capabilities: ['a theme surface other elements sit on', 'title'], state: 'none',
    compose: { nameBase: 'Group', defaults: {}, initial: () => ({ style: 'card', radius: 16 }), data: {}, box: { w: 200, h: 140 }, min: { w: 16, h: 16 },
      fields: () => [F.text('title', 'Title', 'content'), F.select('style', 'Surface', 'look', [['card', 'Card (theme)'], ['soft', 'Soft'], ['outline', 'Outline'], ['glass', 'Glass']], 'card'),
        F.colour('fill', 'Fill (optional)', 'look', 'Empty: the theme’s card surface.'), F.range('radius', 'Corner radius', 'look', 0, 200, 1, 'px', 16), F.range('opacity', 'Opacity', 'look', 0, 100, 1, '%', 100)],
      resize: { mode: 'fill', aspect: 'free' }, scale: null, ...drawn('iqel-panel', paintPanel) } });

  /* ================================================================ PROGRESS BAR */
  function paintBar(root, c, d) {
    const f = frac(d), dec = n(c.decimals, 0, 4, 0), unit = typeof c.unit === 'string' ? c.unit : '%';
    root.style.setProperty('--iqel-c', colour(c.color, 'var(--accent)'));
    root.style.setProperty('--iqel-t', colour(c.trackColor, 'var(--control-well)'));
    root.style.setProperty('--iqel-h', `${n(c.thickness, 1, 60, 10)}px`);
    // a THUMB at the value (a dot, its own size, colour and glow) · a gradient fill (to a second colour)
    const th = n(c.thumb, 0, 40, 0);
    root.style.setProperty('--iqel-th', `${th}px`); root.toggleAttribute('data-thumb', th > 0);
    root.style.setProperty('--iqel-thc', colour(c.thumbColor, 'var(--iqel-c)'));
    root.style.setProperty('--iqel-thg', n(c.thumbGlow, 0, 40, 0) ? `0 0 ${n(c.thumbGlow, 0, 40, 0)}px var(--iqel-thc)` : 'none');
    root.style.setProperty('--iqel-c2', c.color2 ? colour(c.color2, 'var(--iqel-c)') : 'var(--iqel-c)');
    root.style.setProperty('--iqel-r', `${n(c.radius, 0, 30, 999)}px`);
    root.style.setProperty('--iqel-f', String(f));
    root.dataset.state = d.unavailable ? 'unavailable' : '';
    const show = c.showValue !== false;
    let track = root.querySelector('.iqel-bar__track');
    if (!track) { track = el('div', 'iqel-bar__track', [el('div', 'iqel-bar__fill')]); root.append(track); }
    let thumb = track.parentElement.querySelector('.iqel-bar__thumb');
    if (th > 0 && !thumb) { thumb = el('div', 'iqel-bar__thumb'); track.append(thumb); } else if (!th && thumb) thumb.remove();
    let v = root.querySelector('.iqel-bar__v');
    if (show && !v) { v = el('span', 'iqel-bar__v'); root.append(v); } else if (!show && v) { v.remove(); v = null; }
    if (v) v.textContent = d.unavailable ? 'Unavailable' : `${fmt(Number(d.value), dec)}${unit ? ` ${unit}`.replace(/^ %$/, '%') : ''}`;
    root.setAttribute('role', 'progressbar'); root.setAttribute('aria-valuemin', String(n(d.min, -1e9, 1e9, 0))); root.setAttribute('aria-valuemax', String(n(d.max, -1e9, 1e9, 100)));
    if (finite(Number(d.value))) root.setAttribute('aria-valuenow', String(Number(d.value))); else root.removeAttribute('aria-valuenow');
  }
  const RANGE_FIELDS = (unitDefault = '%') => [{ ...F.text('unit', 'Unit', 'format', 8), help: `Shown after the value (default ${unitDefault || 'none'}).` }, F.range('decimals', 'Decimals', 'format', 0, 4, 1, '', 0), F.bool('showValue', 'Show the value', 'format', true)];
  IC.define('progress-bar', { name: 'Progress bar', category: 'data', module: 'IniqElements (progress-bar)', render: (c, d) => drawn('iqel-bar', paintBar).render(c, d),
    contract: { color: "token | '#rrggbb'", trackColor: "token | '#rrggbb'", thickness: 'px', radius: 'px', showValue: 'bool', unit: 'text', decimals: '0–4' }, capabilities: ['a value in a range', 'theme colours'], state: '{ value, min, max }',
    compose: { nameBase: 'Progress', defaults: {}, initial: () => ({ color: 'accent', thickness: 10, unit: '%' }), data: { value: 62, min: 0, max: 100 }, box: { w: 220, h: 36 }, min: { w: 24, h: 6 },
      fields: () => [F.colour('color', 'Fill colour', 'look'), F.colour('trackColor', 'Track colour', 'look'), F.range('thickness', 'Thickness', 'look', 1, 60, 1, 'px', 10), F.range('radius', 'Corner radius', 'look', 0, 30, 1, 'px', 30),
        F.colour('color2', 'Fill: gradient to', 'look'), F.range('thumb', 'Thumb at the value', 'look', 0, 40, 1, 'px', 0), { ...F.colour('thumbColor', 'Thumb colour', 'look'), when: (c) => (c.thumb || 0) > 0 },
        { ...F.range('thumbGlow', 'Thumb glow', 'look', 0, 40, 1, 'px', 0), when: (c) => (c.thumb || 0) > 0 }, ...RANGE_FIELDS('%')],
      dataFields: RANGE_DATA, inputs: NUM_INPUTS, range: [],
      resize: { mode: 'fill', aspect: 'free' }, scale: { props: { thickness: [2, 60] }, base: (c) => ({ thickness: n(c.thickness, 2, 60, 10) }) }, ...drawn('iqel-bar', paintBar) } });

  /* ================================================================ PROGRESS RING · ARC GAUGE — the shared Dial primitive (IniqGauge) + the value text */
  const G = () => global.IniqGauge;
  const RING = { preset: 'custom', start: 0, sweep: 360, marker: false, ticks: 'off', face: 'none', trackColor: 'neutral', trackOpacity: 22, arcColor: 'accent', arcGlow: 0, thickness: 10, ends: 'round' };
  const ARC = { preset: 'custom', start: 240, sweep: 240, marker: false, ticks: 'off', face: 'none', trackColor: 'neutral', trackOpacity: 18, arcColor: 'accent', arcGlow: 30, thickness: 12, ends: 'round' };
  function gaugeEl(base) {
    const paint = (root, c, d, box) => {
      const gc = { ...base, ...c, min: n(d.min, -1e9, 1e9, 0), max: n(d.max, -1e9, 1e9, 100) };
      const v = finite(Number(d.value)) ? Number(d.value) : null;
      let g = root.querySelector(':scope > .iqg');
      if (!g) { g = G().create(gc, { value: v }, box); root.prepend(g); } else G().update(g, gc, { value: v }, box);   // the gauge reads data.value
      let t = root.querySelector(':scope > .iqel-gauge__v');
      if (c.showValue === false) { if (t) t.remove(); return; }
      if (!t) { t = el('div', 'iqel-gauge__v', [el('b'), el('small')]); root.append(t); }
      const s = Math.min(n(box.w, 1, 4000, 120), n(box.h, 1, 4000, 120));
      t.style.setProperty('--iqel-fs', `${n(c.textSize, 8, 160, Math.round(s * 0.22))}px`);
      t.style.setProperty('--iqel-tc', colour(c.textColor, 'var(--text-primary)'));
      t.firstChild.textContent = d.unavailable ? '—' : fmt(v, n(c.decimals, 0, 4, 0));
      t.lastChild.textContent = typeof c.unit === 'string' ? c.unit : '';
      t.lastChild.hidden = !t.lastChild.textContent;
    };
    return paint;
  }
  const gaugeFields = (preset) => () => [F.colour('arcColor', 'Value colour', 'look'), F.colour('trackColor', 'Track colour', 'look'), F.range('thickness', 'Thickness', 'look', 2, 60, 1, 'px', preset.thickness),
    F.range('trackOpacity', 'Track opacity', 'look', 0, 100, 1, '%', preset.trackOpacity), F.range('arcGlow', 'Glow', 'look', 0, 100, 5, '%', preset.arcGlow),
    ...(preset.sweep < 360 ? [F.range('sweep', 'Arc length', 'look', 90, 330, 5, '°', preset.sweep)] : []),
    F.colour('textColor', 'Value text colour', 'format'), F.range('textSize', 'Value text size', 'format', 8, 160, 1, 'px', undefined), ...RANGE_FIELDS('')];
  [['progress-ring', 'Progress ring', 'Ring', RING, { unit: '%' }], ['arc-gauge', 'Arc gauge', 'Gauge', ARC, { unit: '' }]].forEach(([id, name, base, preset, init]) => {
    const paint = gaugeEl(preset);
    IC.define(id, { name, category: 'data', module: 'IniqGauge (the Dial primitive) + value text', render: (c, d, ctx = {}) => drawn('iqel-gauge', paint).render(c, d, ctx),
      contract: { arcColor: "token | '#rrggbb'", trackColor: "token | '#rrggbb'", thickness: 'px', showValue: 'bool', unit: 'text', decimals: '0–4' }, capabilities: ['a value in a range (the shared gauge)', 'value text'], state: '{ value, min, max }',
      compose: { nameBase: base, defaults: {}, initial: () => ({ ...init }), data: { value: 62, min: 0, max: 100 }, box: { w: 140, h: 140 }, min: { w: 32, h: 32 },
        fields: gaugeFields(preset), dataFields: RANGE_DATA, inputs: NUM_INPUTS,
        resize: { mode: 'fill', aspect: 'square' }, scale: { props: { thickness: [2, 60], textSize: [8, 160] }, base: (c) => ({ thickness: n(c.thickness, 2, 60, preset.thickness), ...(finite(c.textSize) ? { textSize: c.textSize } : {}) }) },
        ...drawn('iqel-gauge', paint) } });
  });

  /* ================================================================ STATUS INDICATOR */
  function paintStatus(root, c, d) {
    const on = !!(d && d.on);
    root.dataset.on = String(on); root.dataset.state = d && d.unavailable ? 'unavailable' : '';
    root.style.setProperty('--iqel-c', on ? colour(c.onColor, 'var(--success)') : colour(c.offColor, 'var(--neutral)'));
    root.style.setProperty('--iqel-fs', `${n(c.textSize, 8, 40, 13)}px`);
    root.dataset.pulse = String(c.pulse === true && on);
    const word = d && d.unavailable ? 'Unavailable' : on ? (c.onText || 'On') : (c.offText || 'Off');
    root.replaceChildren(el('i', 'iqel-status__dot'), ...(c.showText === false ? [] : [txt('span', 'iqel-status__t', [c.label, word].filter(Boolean).join(' · '))]));
  }
  IC.define('status', { name: 'Status indicator', category: 'data', module: 'IniqElements (status)', render: (c, d) => drawn('iqel-status', paintStatus).render(c, d),
    contract: { label: 'text', onText: 'text', offText: 'text', onColor: "token | '#rrggbb'", offColor: "token | '#rrggbb'", pulse: 'bool', showText: 'bool' }, capabilities: ['on / off', 'words', 'semantic colours'], state: '{ on }',
    compose: { nameBase: 'Status', defaults: {}, initial: () => ({ label: '', onText: 'Active', offText: 'Inactive', onColor: 'success', offColor: 'neutral' }), data: { on: true }, box: { w: 140, h: 28 }, min: { w: 12, h: 12 },
      fields: () => [F.text('label', 'Label', 'content'), F.text('onText', 'Text when on', 'content'), F.text('offText', 'Text when off', 'content'), F.bool('showText', 'Show the text', 'content', true),
        F.colour('onColor', 'Colour when on', 'look'), F.colour('offColor', 'Colour when off', 'look'), F.bool('pulse', 'Pulse while on', 'look'), F.range('textSize', 'Text size', 'look', 8, 40, 1, 'px', 13)],
      dataFields: [{ key: 'data.on', type: 'boolean', label: 'On (preview)', group: 'data' }], inputs: { on: { label: 'On', kind: 'boolean', primary: true } },
      resize: { mode: 'layout', aspect: 'free' }, scale: { props: { textSize: [8, 40] }, base: (c) => ({ textSize: n(c.textSize, 8, 40, 13) }) }, ...drawn('iqel-status', paintStatus) } });

  /* ================================================================ LABEL + VALUE */
  function paintLV(root, c, d) {
    root.dataset.layout = c.layout === 'stack' ? 'stack' : 'row';
    root.dataset.state = d && d.unavailable ? 'unavailable' : '';
    root.style.setProperty('--iqel-lc', colour(c.labelColor, 'var(--text-secondary)'));
    root.style.setProperty('--iqel-vc', colour(c.valueColor, 'var(--text-primary)'));
    root.style.setProperty('--iqel-ls', `${n(c.labelSize, 8, 60, 13)}px`); root.style.setProperty('--iqel-vs', `${n(c.valueSize, 8, 120, 16)}px`);
    const v = d && d.unavailable ? 'Unavailable' : d && d.value !== undefined && d.value !== null && d.value !== '' ? String(d.value) : '—';
    const unit = typeof c.unit === 'string' && c.unit ? c.unit : '';
    root.replaceChildren(el('span', 'iqel-lv__l', [c.icon ? glyph(c.icon, n(c.labelSize, 8, 60, 13) + 4) : null, txt('span', '', typeof c.label === 'string' ? c.label : 'Label')]),
      el('span', 'iqel-lv__v', [txt('b', '', v), unit && d && !d.unit ? txt('small', '', ` ${unit}`) : null]));
  }
  IC.define('label-value', { name: 'Label + value', category: 'data', module: 'IniqElements (label-value)', render: (c, d) => drawn('iqel-lv', paintLV).render(c, d),
    contract: { label: 'text', icon: "'mdi:…'", layout: "'row' | 'stack'", unit: 'text', labelColor: "token | '#rrggbb'", valueColor: "token | '#rrggbb'", labelSize: 'px', valueSize: 'px' },
    capabilities: ['a labelled value', 'row or stacked', 'theme colours'], state: '{ value } — its preview, or its property (with its unit)',
    compose: { nameBase: 'LabelValue', defaults: {}, initial: () => ({ label: 'Label', layout: 'row' }), data: { value: '21.5' }, box: { w: 200, h: 32 }, min: { w: 24, h: 14 },
      fields: () => [F.text('label', 'Label', 'content'), F.icon('icon', 'Icon', 'content'), F.text('unit', 'Unit (preview)', 'content', 8), F.select('layout', 'Layout', 'look', [['row', 'Label left, value right'], ['stack', 'Label above value']], 'row'),
        F.colour('labelColor', 'Label colour', 'look'), F.colour('valueColor', 'Value colour', 'look'), F.range('labelSize', 'Label size', 'look', 8, 60, 1, 'px', 13), F.range('valueSize', 'Value size', 'look', 8, 120, 1, 'px', 16)],
      dataFields: [{ key: 'data.value', type: 'text', label: 'Preview value', group: 'data', maxLength: 40, help: 'Design only — shown until a Widget Property gives it a value.' }],
      inputs: { value: { label: 'Value', kind: 'text', primary: true, unit: true } },
      resize: { mode: 'layout', aspect: 'free' }, scale: { props: { labelSize: [8, 60], valueSize: [8, 120] }, base: (c) => ({ labelSize: n(c.labelSize, 8, 60, 13), valueSize: n(c.valueSize, 8, 120, 16) }) },
      ...drawn('iqel-lv', paintLV) } });

  /* ================================================================ BATTERY */
  function paintBattery(root, c, d) {
    const v = Number(d && d.value), ok = finite(v), p = ok ? Math.max(0, Math.min(100, v)) : 0;
    const auto = c.colorMode !== 'fixed';
    const tone = d && d.unavailable ? 'var(--neutral)' : auto ? (p <= n(c.low, 1, 99, 20) ? 'var(--danger)' : p <= n(c.mid, 1, 99, 50) ? 'var(--warning)' : 'var(--success)') : colour(c.color, 'var(--success)');
    root.style.setProperty('--iqel-c', tone); root.style.setProperty('--iqel-f', String(p / 100));
    root.dataset.orient = c.orient === 'v' ? 'v' : 'h'; root.dataset.state = d && d.unavailable ? 'unavailable' : '';
    root.dataset.charging = String(!!(d && d.charging));
    let body = root.querySelector('.iqel-batt__b');
    if (!body) { body = el('div', 'iqel-batt__b', [el('div', 'iqel-batt__fill'), el('span', 'iqel-batt__bolt')]); root.append(body, el('i', 'iqel-batt__cap')); }
    let t = root.querySelector('.iqel-batt__v');
    if (c.showValue !== false) { if (!t) { t = el('span', 'iqel-batt__v'); root.append(t); } t.textContent = d && d.unavailable ? '—' : ok ? `${Math.round(p)}%` : '—'; } else if (t) t.remove();
    root.setAttribute('aria-label', `Battery ${ok ? `${Math.round(p)}%` : 'unknown'}${d && d.charging ? ', charging' : ''}`); root.setAttribute('role', 'img');
  }
  IC.define('battery', { name: 'Battery indicator', category: 'data', module: 'IniqElements (battery)', render: (c, d) => drawn('iqel-batt', paintBattery).render(c, d),
    contract: { colorMode: "'auto' | 'fixed'", color: "token | '#rrggbb'", low: '%', mid: '%', orient: "'h' | 'v'", showValue: 'bool' }, capabilities: ['level', 'charging', 'semantic colours (low / mid / good)'], state: '{ value (%), charging }',
    compose: { nameBase: 'Battery', defaults: {}, initial: () => ({ colorMode: 'auto' }), data: { value: 72, charging: false }, box: { w: 110, h: 40 }, min: { w: 24, h: 12 },
      fields: () => [F.select('colorMode', 'Colour', 'look', [['auto', 'By level (red · amber · green)'], ['fixed', 'One colour']], 'auto'), { ...F.colour('color', 'Fixed colour', 'look'), when: (c) => c.colorMode === 'fixed' },
        { ...F.range('low', 'Low below', 'look', 1, 99, 1, '%', 20), when: (c) => c.colorMode !== 'fixed' }, { ...F.range('mid', 'Medium below', 'look', 1, 99, 1, '%', 50), when: (c) => c.colorMode !== 'fixed' },
        F.select('orient', 'Direction', 'look', [['h', 'Horizontal'], ['v', 'Vertical']], 'h'), F.bool('showValue', 'Show the percentage', 'format', true)],
      dataFields: [dataNum('value', 'Level (preview, %)'), { key: 'data.charging', type: 'boolean', label: 'Charging (preview)', group: 'data' }],
      inputs: { value: { label: 'Level (%)', kind: 'number', primary: true }, charging: { label: 'Charging', kind: 'boolean', bindOnly: true } },
      resize: { mode: 'fill', aspect: 'free' }, scale: null, ...drawn('iqel-batt', paintBattery) } });

  /* ================================================================ IMAGE OVERLAY — the shared image + a tint and a caption */
  function paintOverlay(root, c) {
    const A = global.IniqArtwork;
    const img = A ? A.render({ image: c.image, fit: c.fit, radius: n(c.radius, 0, 200, 16), opacity: 100, focusX: c.focusX, focusY: c.focusY, zoom: c.zoom }) : el('div', 'iqa');
    const tint = colour(c.tint, '#000000'), a = n(c.tintOpacity, 0, 100, 45);
    root.style.setProperty('--iqel-r', `${n(c.radius, 0, 200, 16)}px`);
    root.style.setProperty('--iqel-tint', c.gradient === false ? `color-mix(in srgb, ${tint} ${a}%, transparent)` : `linear-gradient(180deg, transparent ${n(c.tintFrom, 0, 95, 25)}%, color-mix(in srgb, ${tint} ${a}%, transparent))`);
    root.style.setProperty('--iqel-tc', colour(c.textColor, '#ffffff'));
    root.style.setProperty('--iqel-fs', `${n(c.textSize, 8, 80, 18)}px`);
    root.dataset.align = pick(c.align, ['bottom', 'center', 'top'], 'bottom');
    const cap = typeof c.caption === 'string' ? c.caption : '';
    root.replaceChildren(img, el('div', 'iqel-ov__tint'), ...(cap ? [txt('div', 'iqel-ov__t', cap)] : []));
  }
  IC.define('image-overlay', { name: 'Image overlay', category: 'layout', module: 'IniqArtwork.render + a tint and caption', render: (c) => drawn('iqel-ov', paintOverlay).render(c),
    contract: { image: 'an allowed image location (the shared image picker)', fit: "'cover' | 'contain'", tint: "token | '#rrggbb'", tintOpacity: '%', gradient: 'bool', caption: 'text', textColor: "token | '#rrggbb'" },
    capabilities: ['picture', 'readable tint', 'caption'], state: 'none',
    compose: { nameBase: 'ImageOverlay', defaults: { image: 'none', fit: 'cover' }, initial: () => ({ image: 'none', fit: 'cover', caption: 'Caption', tintOpacity: 45 }), data: {}, box: { w: 220, h: 140 }, min: { w: 24, h: 24 },
      editor: {}, resize: { mode: 'fill', aspect: 'free' }, scale: null, ...drawn('iqel-ov', paintOverlay) } });
  IC.editor('image-overlay', (o = {}) => [...((IC.editor('image') || (() => []))(o)).filter((f) => f.key !== 'opacity'),
    F.text('caption', 'Caption', 'content', 60), F.select('align', 'Caption position', 'content', [['bottom', 'Bottom'], ['center', 'Centre'], ['top', 'Top']], 'bottom'),
    F.colour('tint', 'Tint colour', 'look'), F.range('tintOpacity', 'Tint strength', 'look', 0, 100, 1, '%', 45), F.bool('gradient', 'Tint as a gradient', 'look', true),
    { ...F.range('tintFrom', 'Gradient starts at', 'look', 0, 95, 1, '%', 25), when: (c) => c.gradient !== false },
    F.colour('textColor', 'Caption colour', 'look'), F.range('textSize', 'Caption size', 'look', 8, 80, 1, 'px', 18)]);

  /** a stepper's DECIMALS (config.decimals '0'–'2'; 'auto' / unset: as many as its step has) */
  const stepDec = (c) => (/^[0-2]$/.test(String(c.decimals)) ? { decimals: Number(c.decimals) } : {});
  /* ================================================================ NUMBER STEPPER · SELECT — the shared controls (IniqControls.stepper / .select) */
  const C = () => global.IniqControls;
  const ctlLook = (c) => ({ style: pick(c.style, ['soft', 'filled', 'outline', 'bare'], 'soft'), shape: 'circle', size: n(c.size, 24, 96, 40), color: c.color || 'accent' });
  if (C() && C().stepper) IC.define('stepper', { name: 'Number stepper', category: 'controls', module: 'IniqControls.stepper',
    render: (c, d, ctx = {}) => { const s = C().stepper({ label: c.label || 'Value', onChange: (v) => ctx.onAction && ctx.onAction('change', v) }); s.control.update(ctlLook(c), { ...d, unit: c.unit }); return s; },
    contract: { label: 'text', unit: 'text', style: 'the shared button style', size: 'px', color: "token | '#rrggbb'", textSize: 'px' }, capabilities: ['− value +', 'min / max / step', 'hold to repeat', 'keyboard'], state: '{ value, min, max, step }',
    compose: { nameBase: 'Stepper', defaults: {}, initial: () => ({ label: 'Value', style: 'soft', size: 40 }), data: { value: 21, min: 0, max: 40, step: 0.5 }, box: { w: 200, h: 56 }, min: { w: 80, h: 28 },
      fields: () => [F.text('label', 'Label (accessible name)', 'content'), F.text('unit', 'Unit', 'content', 8), F.select('style', 'Button style', 'look', [['soft', 'Soft'], ['filled', 'Filled'], ['outline', 'Outline'], ['bare', 'Bare']], 'soft'),
        F.range('size', 'Button size', 'look', 24, 96, 1, 'px', 40), F.colour('color', 'Colour', 'look'), F.range('textSize', 'Value size', 'look', 10, 80, 1, 'px', 22),
        F.select('decimals', 'Decimals shown', 'look', [['auto', 'As the step'], ['0', '0 (23)'], ['1', '1 (23.0)'], ['2', '2 (23.00)']], 'auto')],
      dataFields: [...RANGE_DATA, { key: 'data.step', type: 'number', label: 'Step', group: 'range', half: true }],
      inputs: { ...NUM_INPUTS, step: { label: 'Step', kind: 'number', range: true } }, actions: { change: { label: 'Changing the value', kind: 'number', control: true } },
      resize: { mode: 'fill', aspect: 'free' }, scale: { props: { size: [24, 96], textSize: [10, 80] }, base: (c) => ({ size: n(c.size, 24, 96, 40), textSize: n(c.textSize, 10, 80, 22) }) },
      render: (c, d = {}, ctx = {}) => { const s = C().stepper({ label: c.label || 'Value', onChange: (v) => ctx.onAction && ctx.onAction('change', v) }); s.style.setProperty('--iqc-st-fs', `${n(c.textSize, 10, 80, 22)}px`); s.control.update(ctlLook(c), { ...d, unit: c.unit, ...stepDec(c) }); return s; },
      update: (s, c, d = {}) => { if (!s.control || !s.classList.contains('iqc-step')) return false; s.style.setProperty('--iqc-st-fs', `${n(c.textSize, 10, 80, 22)}px`); s.control.update(ctlLook(c), { ...d, unit: c.unit, ...stepDec(c) }); return true; } } });
  if (C() && C().select) IC.define('select', { name: 'Select / dropdown', category: 'controls', module: 'IniqControls.select',
    render: (c, d, ctx = {}) => { const s = C().select({ label: c.label || 'Choose', onSelect: (v) => ctx.onAction && ctx.onAction('select', v) }); s.control.update(c, d); return s; },
    contract: { label: 'text', options: '[{ id, label, value? }]', showLabel: 'bool' }, capabilities: ['one of a list', 'keyboard (the native select)'], state: '{ selected }',
    compose: { nameBase: 'Select', defaults: {}, initial: () => ({ label: 'Mode', showLabel: true, options: [{ id: 'option-1', label: 'Comfort' }, { id: 'option-2', label: 'Eco' }, { id: 'option-3', label: 'Away' }] }),
      data: { selected: 'option-1' }, box: { w: 200, h: 60 }, min: { w: 60, h: 28 }, editor: { options: true, label: true, text: false, height: false },
      fields: () => { const seg = IC.editor('segmented'); const own = seg ? seg({ options: true, label: true, text: false, height: false }).filter((f) => /^(label|options)$/.test(f.key)) : [];
        return [...own, F.bool('showLabel', 'Show the label', 'content', true)]; },
      dataFields: [{ key: 'data.selected', type: 'select', label: 'Selected (preview)', group: 'data', optionsFrom: (c) => (Array.isArray(c.options) ? c.options : []).filter((o) => o && o.id).map((o) => ({ value: o.id, label: o.label || o.id })) }],
      inputs: { selected: { label: 'Selected option', kind: 'option', primary: true } }, actions: { select: { label: 'Choosing an option', kind: 'option', control: true } },
      resize: { mode: 'fill', aspect: 'free' }, scale: null,
      render: (c, d = {}, ctx = {}) => { const s = C().select({ label: c.label || 'Choose', onSelect: (v) => ctx.onAction && ctx.onAction('select', v) }); s.control.update(c, d); return s; },
      update: (s, c, d = {}) => { if (!s.control || !s.classList.contains('iqc-sel')) return false; s.control.update(c, d); return true; } } });

  /* ================================================================ FLOW CONNECTOR — the universal flow connector (IniqFlow) inside its own box: from one
     edge / corner to another, any geometry, style and animation. A PREVIEW value (or, once the designer binds one, a Widget Property)
     decides whether and which way it moves — by the direction the designer chose for a positive value; never from a name. */
  const FX = () => global.IniqFlow;
  const ENDS = [['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom'], ['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']];
  const endAt = (k, w, h, pad) => ({ left: [pad, h / 2], right: [w - pad, h / 2], top: [w / 2, pad], bottom: [w / 2, h - pad], 'top-left': [pad, pad], 'top-right': [w - pad, pad],
    'bottom-left': [pad, h - pad], 'bottom-right': [w - pad, h - pad] })[k];
  function flowSpec(c, box) {
    const w = Math.max(4, n(box.w, 4, 4000, 200)), h = Math.max(4, n(box.h, 4, 4000, 80)), pad = Math.min(n(c.width, 1, 24, 3) * 2 + 4, w / 4, h / 4);
    const ends = ENDS.map((e) => e[0]);
    return { from: endAt(pick(c.from, ends, 'left'), w, h, pad), to: endAt(pick(c.to, ends, 'right'), w, h, pad), geometry: pick(c.geometry, ['straight', 'elbow', 'curve', 'arc'], 'curve'),
      bulge: n(c.bulge, -100, 100, 35) / 100, curvature: n(c.curvature, 0, 100, 50) / 100, radius: n(c.radius, 0, 80, 10), color: c.color || 'accent', width: n(c.width, 1, 24, 3),
      opacity: n(c.opacity, 0, 100, 100) / 100, line: pick(c.line, ['solid', 'dashed', 'dotted'], 'solid'), glow: n(c.glow, 0, 100, 0) / 100,
      arrow: pick(c.arrow, ['none', 'end', 'start', 'both'], 'none'), arrowStyle: pick(c.arrowStyle, ['chevron', 'triangle'], 'chevron'),
      markers: { start: pick(c.startMarker, ['none', 'dot', 'ring'], 'none'), end: pick(c.endMarker, ['none', 'dot', 'ring'], 'none') },
      animation: { type: pick(c.animation, ['none', 'dots', 'arrows', 'dashes', 'pulse'], 'dots'), speed: n(c.speed, 5, 600, 40), size: n(c.particle, 1, 30, 5), spacing: n(c.spacing, 4, 200, 18),
        color: c.flowColor || undefined, glow: n(c.flowGlow, 0, 100, 0) / 100 }, mark: 'auto', w, h };
  }
  function paintFlow(root, c, d, box) {
    if (!FX()) return;
    const sp = flowSpec(c, box);
    let svg = root.querySelector('svg');
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('aria-hidden', 'true'); root.append(svg); }
    svg.setAttribute('viewBox', `0 0 ${sp.w} ${sp.h}`);
    if (!root.iqFlow) { root.iqFlow = FX().connector(sp); svg.append(root.iqFlow.el); } else root.iqFlow.update(sp);
    const v = d && d.value !== undefined ? d.value : null;
    root.iqFlow.flow(FX().read(d && d.unavailable ? { unavailable: true } : v, { positive: c.positive === 'reverse' ? 'reverse' : 'forward', deadband: n(c.deadband, 0, 1e9, 0),
      zero: pick(c.zero, ['still', 'dim', 'hide'], 'still'), unavailable: pick(c.unavailableAs, ['dashed', 'dim', 'hide'], 'dashed') }));
  }
  if (FX()) IC.define('flow-connector', { name: 'Flow connector', category: 'visual', module: 'IniqFlow.connector',
    render: (c, d, ctx = {}) => drawn('iqel-flow', paintFlow).render(c, d, ctx),
    contract: { from: 'edge / corner', to: 'edge / corner', geometry: "'straight' | 'elbow' | 'curve' | 'arc'", color: "token | '#rrggbb'", width: 'px', line: "'solid' | 'dashed' | 'dotted'",
      arrow: "'none' | 'end' | 'start' | 'both'", animation: "'none' | 'dots' | 'arrows' | 'dashes' | 'pulse'", speed: 'px/s', positive: "'forward' | 'reverse' — what a positive value means" },
    capabilities: ['straight / elbow / curve / arc', 'arrowheads and end markers', 'glow', 'moving dots / arrows / dashes / pulse', 'direction from a signed value', 'zero / unavailable states'],
    state: '{ value } — a signed number (its sign: the direction; 0: no flow)',
    compose: { nameBase: 'Connector', defaults: {}, initial: () => ({ from: 'left', to: 'right', geometry: 'curve', color: 'accent', width: 3, animation: 'dots' }), data: { value: 1 },
      box: { w: 200, h: 80 }, min: { w: 16, h: 16 },
      fields: () => [
        F.select('from', 'From', 'content', ENDS, 'left'), F.select('to', 'To', 'content', ENDS, 'right'),
        F.select('geometry', 'Shape', 'content', [['straight', 'Straight'], ['elbow', 'Elbow (right angles)'], ['curve', 'Smooth curve'], ['arc', 'Arc']], 'curve'),
        { ...F.range('curvature', 'Curvature', 'content', 0, 100, 1, '%', 50), when: (c) => (c.geometry || 'curve') === 'curve' },
        { ...F.range('bulge', 'Arc bulge', 'content', -100, 100, 1, '%', 35), when: (c) => c.geometry === 'arc' },
        { ...F.range('radius', 'Corner radius', 'content', 0, 80, 1, 'px', 10), when: (c) => c.geometry === 'elbow' },
        F.colour('color', 'Colour', 'look'), F.range('width', 'Thickness', 'look', 1, 24, 1, 'px', 3), F.range('opacity', 'Opacity', 'look', 0, 100, 1, '%', 100),
        F.select('line', 'Line', 'look', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], 'solid'), F.range('glow', 'Glow', 'look', 0, 100, 1, '%', 0),
        F.select('arrow', 'Arrowheads', 'look', [['none', 'None'], ['end', 'At the end'], ['start', 'At the start'], ['both', 'Both ends']], 'none'),
        { ...F.select('arrowStyle', 'Arrowhead', 'look', [['chevron', 'Chevron'], ['triangle', 'Triangle']], 'chevron'), when: (c) => c.arrow && c.arrow !== 'none' },
        F.select('startMarker', 'Start marker', 'look', [['none', 'None'], ['dot', 'Dot'], ['ring', 'Ring']], 'none'), F.select('endMarker', 'End marker', 'look', [['none', 'None'], ['dot', 'Dot'], ['ring', 'Ring']], 'none'),
        F.select('animation', 'Animation', 'motion', [['none', 'None'], ['dots', 'Moving dots'], ['arrows', 'Moving arrows'], ['dashes', 'Moving dashes'], ['pulse', 'Neon pulse']], 'dots'),
        F.range('speed', 'Speed', 'motion', 5, 600, 1, 'px/s', 40), F.range('particle', 'Dot / dash size', 'motion', 1, 30, 1, 'px', 5), F.range('spacing', 'Spacing', 'motion', 4, 200, 1, 'px', 18),
        F.colour('flowColor', 'Animation colour', 'motion'), F.range('flowGlow', 'Animation glow', 'motion', 0, 100, 1, '%', 0),
        F.select('positive', 'A positive value flows', 'motion', [['forward', 'From → To'], ['reverse', 'To → From']], 'forward'),
        { key: 'deadband', type: 'number', label: 'No flow at or below', group: 'motion', optional: true, min: 0, help: 'A value this close to 0 (either sign) counts as no flow.' },
        F.select('zero', 'No flow', 'motion', [['still', 'The line stays, nothing moves'], ['dim', 'Dimmed'], ['hide', 'Hidden']], 'still'),
        F.select('unavailableAs', 'Unavailable', 'motion', [['dashed', 'Dashed line'], ['dim', 'Dimmed'], ['hide', 'Hidden']], 'dashed')],
      dataFields: [{ key: 'data.value', type: 'number', label: 'Value (preview)', group: 'data', help: 'Design only — its sign sets the direction, 0 stops it. A Widget Property replaces it.' }],
      inputs: { value: { label: 'Flow value', kind: 'number', primary: true } },
      resize: { mode: 'fill', aspect: 'free' }, scale: { props: { width: [1, 24], particle: [1, 30] }, base: (c) => ({ width: n(c.width, 1, 24, 3), particle: n(c.particle, 1, 30, 5) }) },
      ...drawn('iqel-flow', paintFlow) } });

  /* ================================================================ SUN ARC — the reusable sun arc (IniqSunArc) in its own box. Its data are the sun's
     state, elevation and Home Assistant's next sunrise / sunset / noon / midnight (timestamps, ISO or 'HH:MM' today for a preview). */
  const SA = () => global.IniqSunArc;
  const tsOf = (v) => { if (typeof v === 'number' && Number.isFinite(v)) return v; if (typeof v !== 'string' || !v) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim()); if (m) { const d = new Date(); d.setHours(Number(m[1]), Number(m[2]), 0, 0); return d.getTime(); }
    const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
  function paintSunArc(root, c, d) {
    if (!SA()) return;
    const sig = JSON.stringify([c.glow !== false, c.showTimes !== false, c.showElevation === true, c.sunColor || '', c.arcColor || '']);
    if (!root.iqSun || root.dataset.sig !== sig) { if (root.iqSun) root.iqSun.destroy();
      root.iqSun = SA().create({ glow: c.glow !== false, showTimes: c.showTimes !== false, showElevation: c.showElevation === true, sunColor: c.sunColor, arcColor: c.arcColor });
      root.replaceChildren(root.iqSun.el); root.dataset.sig = sig; }
    root.iqSun.update({ state: d.state, elevation: d.elevation, events: { rising: tsOf(d.rising), setting: tsOf(d.setting), noon: tsOf(d.noon), midnight: tsOf(d.midnight) } });
  }
  if (SA()) IC.define('sun-arc', { name: 'Sun arc', category: 'data', module: 'IniqSunArc.create',
    render: (c, d) => drawn('iqel-sun', paintSunArc).render(c, d),
    contract: { glow: 'bool', showTimes: 'bool', showElevation: 'bool', sunColor: 'token', arcColor: 'token' },
    capabilities: ['sun placed by time between today\'s sunrise and sunset', 'sunrise / sunset markers and times', 'elevation', 'night state'],
    state: "{ state: 'above_horizon' | 'below_horizon', elevation, rising, setting, noon, midnight } — Home Assistant's sun",
    compose: { nameBase: 'SunArc', defaults: {}, initial: () => ({ glow: true, showTimes: true }), data: { state: 'above_horizon', elevation: 32, rising: '07:10', setting: '19:40', noon: '13:25' },
      box: { w: 240, h: 130 }, min: { w: 80, h: 48 },
      fields: () => [F.bool('glow', 'Sun glow', 'look', true), F.bool('showTimes', 'Sunrise / sunset times', 'look', true), F.bool('showElevation', 'Elevation', 'look', false),
        F.colour('sunColor', 'Sun colour', 'look'), F.colour('arcColor', 'Arc colour', 'look')],
      dataFields: [{ key: 'data.state', type: 'select', label: 'Sun (preview)', group: 'data', options: opt([['above_horizon', 'Above the horizon'], ['below_horizon', 'Below the horizon']]) },
        { key: 'data.elevation', type: 'number', label: 'Elevation ° (preview)', group: 'data', half: true },
        { key: 'data.rising', type: 'text', label: 'Sunrise (preview, HH:MM)', group: 'data', half: true, maxLength: 30 }, { key: 'data.setting', type: 'text', label: 'Sunset (preview, HH:MM)', group: 'data', half: true, maxLength: 30 },
        { key: 'data.noon', type: 'text', label: 'Solar noon (preview, HH:MM)', group: 'data', half: true, maxLength: 30 }],
      inputs: { state: { label: 'Sun state', kind: 'text', primary: true }, elevation: { label: 'Elevation', kind: 'number' }, rising: { label: 'Next sunrise', kind: 'text' }, setting: { label: 'Next sunset', kind: 'text' },
        noon: { label: 'Next solar noon', kind: 'text' }, midnight: { label: 'Next solar midnight', kind: 'text' } },
      resize: { mode: 'fill', aspect: 'free' }, scale: null, ...drawn('iqel-sun', paintSunArc) } });

  // each element's configuration builder, registered like every shared component's (Widget Studio's Properties read it)
  ['shape', 'line', 'spacer', 'badge', 'panel', 'progress-bar', 'progress-ring', 'arc-gauge', 'status', 'label-value', 'battery', 'stepper', 'select', 'flow-connector', 'sun-arc'].forEach((id) => {
    const d = IC.get(id); if (d && d.compose && d.compose.fields && !IC.editor(id)) IC.editor(id, () => d.compose.fields());
  });
  global.IniqElements = Object.freeze({ COLOURS, SHAPES, colour });
})(window);
