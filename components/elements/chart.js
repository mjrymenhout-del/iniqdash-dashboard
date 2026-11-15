/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqChartElement — Widget Studio's CHART element (registered as 'chart' in IniqComponents): bars, capsules, a line or an area, drawn
   in SVG at the element's logical size. Every part has its own visible control: bar width, corner radius, per-bar colours, outlined
   bars, the highlighted bar (last · highest · a chosen one · tapped) with its tooltip and underline, the line's smoothing, width, glow,
   gradient area and marker, the grid, the axis labels (and their colours) and the value range.

   DATA. Bound to a widget property (Data → Property), the binding layer reads that entity's HISTORY (recorder: 1 h … 7 d) or its
   LONG-TERM STATISTICS (hour · day · week · month: the change of a total — kWh per day — or the mean of a measurement) and passes
   d.series = [[ms, value | null], …]. Unbound, it shows its PREVIEW BARS (config.points: label + value), marked as design data in
   Studio. Nothing here knows Home Assistant.

   CONFIG  kind 'bar' | 'line' | 'area' · source 'history' | 'statistics' · range · period · stat · count (the last N points)
           barWidth % · barRadius px · capsule · barStyle 'filled' | 'outline' · barColor · colors [{ color }] (cycled) · barOpacity %
           barGradient (fades to the bottom) · highlight 'none' | 'last' | 'max' | 'index' · highlightIndex · highlightColor · selectable
           tooltip · tooltipBg · tooltipColor · unit · decimals · underline
           lineColor · lineWidth · smooth · glow px · areaOpacity % · marker 'none' | 'last' | 'max' | 'highlight' · markerSize
           grid (lines) · gridColor · gridDash · yLabels · xLabels · labelColor · labelSize · labelsColoured · labelFormat · yMin · yMax
   ========================================================================== */
(function (global) {
  'use strict';
  const IC = global.IniqComponents, EL = () => global.IniqElements;
  if (!IC) return;
  const NS = 'http://www.w3.org/2000/svg';
  const n = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const colour = (v, fb) => (EL() ? EL().colour(v, fb) : fb);
  const plain = (v, max) => String(v ?? '').replace(/[\x00-\x1f<>]/g, '').slice(0, max);
  const POINT_MAX = 48;
  const s = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') e.setAttribute(k, String(v)); }); return e; };
  const f2 = (v) => Math.round(v * 100) / 100;

  /** the points it draws: { label, value } — from Home Assistant (d.series) or the preview bars (config.points) */
  function pointsOf(c, d) {
    const cnt = n(c.count, 1, POINT_MAX, 7);
    if (Array.isArray(d.series)) {
      const fmt = labelFormat(c);
      return d.series.filter((p) => Array.isArray(p)).slice(-cnt).map((p) => ({ label: fmt(p[0]), value: typeof p[1] === 'number' && Number.isFinite(p[1]) ? p[1] : null }));
    }
    return (Array.isArray(c.points) ? c.points : []).slice(0, POINT_MAX).filter((p) => p && typeof p === 'object')
      .map((p) => ({ label: plain(p.label, 16), value: typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : null, color: p.color }));
  }
  function labelFormat(c) {
    const auto = c.source === 'statistics' ? ({ hour: 'time', day: 'weekday', week: 'date', month: 'month' }[c.period] || 'weekday') : 'time';
    const k = c.labelFormat && c.labelFormat !== 'auto' ? c.labelFormat : auto;
    const O = { weekday: { weekday: 'short' }, day: { day: 'numeric' }, date: { day: 'numeric', month: 'short' }, month: { month: 'short' }, time: { hour: '2-digit', minute: '2-digit' } }[k];
    return (t) => (O && Number.isFinite(t) ? new Date(t).toLocaleString(undefined, O) : '');
  }
  const fmtV = (c, v) => (v === null ? '—' : `${typeof c.decimals === 'number' ? v.toFixed(n(c.decimals, 0, 3, 0)) : Math.round(v * 100) / 100}${c.unit ? ` ${plain(c.unit, 12)}` : ''}`);

  function paint(root, c = {}, d = {}, box = {}) {
    const W = n(box.w, 20, 4000, 300), H = n(box.h, 20, 4000, 160), kind = pick(c.kind, ['bar', 'line', 'area'], 'bar');
    const pts = pointsOf(c, d), vals = pts.map((p) => p.value).filter((v) => v !== null);
    root.dataset.kind = kind; root.dataset.source = Array.isArray(d.series) ? 'live' : 'preview';
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'iqch__svg', 'aria-hidden': 'true' });
    const defs = s('defs'); svg.append(defs);
    const lsize = n(c.labelSize, 6, 40, 10), xl = c.xLabels !== false, yl = c.yLabels === true;
    const padL = yl ? lsize * 3 : n(c.padX, 0, 200, 4), padR = n(c.padX, 0, 200, 4), padT = n(c.padTop, 0, 400, c.tooltip ? lsize * 2.8 : 6), padB = xl ? lsize * 2 : 4;
    const pw = Math.max(4, W - padL - padR), ph = Math.max(4, H - padT - padB);
    const lo = typeof c.yMin === 'number' ? c.yMin : kind === 'bar' ? Math.min(0, ...vals) : Math.min(...(vals.length ? vals : [0]));
    const hi0 = typeof c.yMax === 'number' ? c.yMax : Math.max(...(vals.length ? vals : [1]));
    const hi = hi0 > lo ? hi0 : lo + 1;
    const Y = (v) => padT + ph - ((v - lo) / (hi - lo)) * ph, N = Math.max(1, pts.length), slot = pw / N, X = (i) => padL + slot * (i + 0.5);
    // GRID: horizontal lines (and value labels)
    const gl = n(c.grid, 0, 12, 0), gcol = colour(c.gridColor, 'var(--border-primary)'), lcol = colour(c.labelColor, 'var(--text-muted)');
    for (let i = 0; i <= gl && gl; i++) {
      const v = lo + ((hi - lo) * i) / gl, y = f2(Y(v));
      svg.append(s('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: gcol, 'stroke-width': 1, 'stroke-dasharray': c.gridDash ? '3 4' : '', class: 'iqch__grid' }));
      if (yl) { const t = s('text', { x: padL - 4, y: y + lsize / 3, 'text-anchor': 'end', 'font-size': lsize, fill: lcol, class: 'iqch__yl' }); t.textContent = String(Math.round(v * 10) / 10); svg.append(t); }
    }
    // HIGHLIGHT: which point is emphasised (the tapped one wins while the element lives)
    const hmode = pick(c.highlight, ['none', 'last', 'max', 'index'], 'none');
    let hi_i = root.__tap ?? (hmode === 'last' ? pts.length - 1 : hmode === 'max' ? pts.reduce((b, p, i) => (p.value !== null && (b < 0 || p.value > pts[b].value) ? i : b), -1) : hmode === 'index' ? n(c.highlightIndex, 1, POINT_MAX, 1) - 1 : -1);
    if (hi_i >= pts.length) hi_i = -1;
    const palette = (Array.isArray(c.colors) ? c.colors : []).map((x) => x && x.color).filter(Boolean);
    const colOf = (i) => (pts[i].color ? colour(pts[i].color, '') : '') || (palette.length ? colour(palette[i % palette.length], 'var(--accent)') : colour(c.barColor, 'var(--accent)'));
    const hcol = colour(c.highlightColor, '');
    if (kind === 'bar') {
      const bw = Math.max(1, (slot * n(c.barWidth, 5, 100, 55)) / 100), rad = c.capsule ? bw / 2 : n(c.barRadius, 0, 200, 4);
      const outline = c.barStyle === 'outline', op = n(c.barOpacity, 0, 100, 100) / 100;
      pts.forEach((p, i) => {
        if (p.value === null) return;
        const col = i === hi_i && hcol ? hcol : colOf(i), x = X(i) - bw / 2, base = Y(lo <= 0 && hi >= 0 ? 0 : lo);
        let fill = col;
        if (c.barGradient) { const gid = `iqch-g${Math.random().toString(36).slice(2, 8)}`; const g = s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
          g.append(s('stop', { offset: '0%', 'stop-color': col }), s('stop', { offset: '100%', 'stop-color': col, 'stop-opacity': 0.15 })); defs.append(g); fill = `url(#${gid})`; }
        const sw = outline ? n(c.outlineWidth, 0.5, 8, 1.5) : 0;
        let r;
        if (c.capsule) {
          // a CAPSULE: a full-height track; the highlighted one is filled; the others show their value filling the track (filled style)
          r = s('rect', { x: f2(x), y: f2(padT), width: f2(bw), height: f2(ph), rx: f2(bw / 2), class: 'iqch__bar', 'data-i': i,
            fill: i === hi_i ? fill : outline ? col : fill, 'fill-opacity': i === hi_i ? op : outline ? 0.08 : op * 0.3, stroke: outline && i !== hi_i ? col : '', 'stroke-width': outline && i !== hi_i ? sw : '' });
          svg.append(r);
          if (i !== hi_i && !outline) { const vh = Math.max(bw, ((p.value - lo) / (hi - lo)) * ph); svg.append(s('rect', { x: f2(x), y: f2(padT + ph - vh), width: f2(bw), height: f2(vh), rx: f2(bw / 2), fill, 'fill-opacity': op, class: 'iqch__fill' })); }
        } else {
          const top = Y(p.value), yv = Math.min(top, base), hh = Math.max(1, Math.abs(base - top));
          r = s('rect', { x: f2(x), y: f2(yv), width: f2(bw), height: f2(hh), rx: f2(Math.min(rad, bw / 2, hh / 2)), class: 'iqch__bar', 'data-i': i,
            fill: outline && i !== hi_i ? 'transparent' : fill, 'fill-opacity': outline && i !== hi_i ? '' : op, stroke: outline && i !== hi_i ? col : '', 'stroke-width': outline && i !== hi_i ? sw : '' });
          svg.append(r);
        }
        if (c.glow) r.style.filter = `drop-shadow(0 0 ${n(c.glow, 0, 40, 0)}px ${col})`;
      });
    } else {
      const P = pts.map((p, i) => (p.value === null ? null : [X(i), Y(p.value)]));
      const segs = []; let cur = [];
      P.forEach((q) => { if (q) cur.push(q); else if (cur.length) { segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur);
      const path = (q) => { if (q.length < 2) return q.length ? `M${f2(q[0][0])} ${f2(q[0][1])}` : '';
        if (!c.smooth) return q.map((p, i) => `${i ? 'L' : 'M'}${f2(p[0])} ${f2(p[1])}`).join(' ');
        let dd = `M${f2(q[0][0])} ${f2(q[0][1])}`;                     // Catmull-Rom → cubic Bézier
        for (let i = 0; i < q.length - 1; i++) { const p0 = q[i - 1] || q[i], p1 = q[i], p2 = q[i + 1], p3 = q[i + 2] || p2;
          dd += ` C${f2(p1[0] + (p2[0] - p0[0]) / 6)} ${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)} ${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])} ${f2(p2[1])}`; }
        return dd; };
      const lc = colour(c.lineColor, 'var(--accent)');
      segs.forEach((q) => {
        if (kind === 'area' && q.length > 1) {
          const gid = `iqch-a${Math.random().toString(36).slice(2, 8)}`, g = s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
          g.append(s('stop', { offset: '0%', 'stop-color': lc, 'stop-opacity': n(c.areaOpacity, 0, 100, 40) / 100 }), s('stop', { offset: '100%', 'stop-color': lc, 'stop-opacity': 0 })); defs.append(g);
          svg.append(s('path', { d: `${path(q)} L${f2(q[q.length - 1][0])} ${f2(padT + ph)} L${f2(q[0][0])} ${f2(padT + ph)} Z`, fill: `url(#${gid})`, class: 'iqch__area' }));
        }
        const l = s('path', { d: path(q), fill: 'none', stroke: lc, 'stroke-width': n(c.lineWidth, 0.5, 16, 2.5), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'iqch__line' });
        if (c.glow) l.style.filter = `drop-shadow(0 0 ${n(c.glow, 0, 40, 0)}px ${lc})`;
        svg.append(l);
      });
      const mk = pick(c.marker, ['none', 'last', 'max', 'highlight'], 'none');
      const mi = mk === 'last' ? P.map((q, i) => (q ? i : -1)).filter((i) => i >= 0).pop() ?? -1 : mk === 'max' ? pts.reduce((b, p, i) => (p.value !== null && (b < 0 || p.value > pts[b].value) ? i : b), -1) : mk === 'highlight' ? hi_i : -1;
      if (mi >= 0 && P[mi]) { const ms = n(c.markerSize, 2, 30, 5); svg.append(s('circle', { cx: f2(P[mi][0]), cy: f2(P[mi][1]), r: ms, fill: colour(c.markerColor, 'var(--text-primary)'), stroke: lc, 'stroke-width': Math.max(1, ms / 2.5), class: 'iqch__marker' })); }
    }
    // X LABELS (each in its bar's colour, if chosen; the highlighted one in its colour / bold)
    if (xl) pts.forEach((p, i) => {
      const t = s('text', { x: f2(X(i)), y: f2(H - lsize * 0.5), 'text-anchor': 'middle', 'font-size': lsize, fill: c.labelsColoured && kind === 'bar' ? colOf(i) : i === hi_i && hcol ? hcol : lcol,
        'font-weight': i === hi_i ? 700 : 400, class: 'iqch__xl' });
      t.textContent = p.label; svg.append(t);
    });
    // HIGHLIGHT extras: an underline under its label; a tooltip with its value
    if (hi_i >= 0 && pts[hi_i]) {
      const x = X(hi_i), v = pts[hi_i].value;
      if (c.underline && xl) svg.append(s('line', { x1: f2(x - lsize), x2: f2(x + lsize), y1: f2(H - 1), y2: f2(H - 1), stroke: hcol || colOf(hi_i), 'stroke-width': 2, 'stroke-linecap': 'round', class: 'iqch__ul' }));
      if (c.tooltip && v !== null) {
        const text = fmtV(c, v), tw = text.length * lsize * 0.62 + lsize * 1.4, th = lsize * 2, ty = Math.max(1, (kind === 'bar' && !c.capsule ? Y(v) : kind === 'bar' ? padT : Y(v)) - th - 6);
        const tx = Math.max(1, Math.min(W - tw - 1, x - tw / 2)), g = s('g', { class: 'iqch__tip' });
        g.append(s('rect', { x: f2(tx), y: f2(ty), width: f2(tw), height: f2(th), rx: th / 2, fill: colour(c.tooltipBg, 'var(--surface-tertiary)') }));
        const t = s('text', { x: f2(tx + tw / 2), y: f2(ty + th * 0.68), 'text-anchor': 'middle', 'font-size': lsize, 'font-weight': 700, fill: colour(c.tooltipColor, 'var(--text-primary)') });
        t.textContent = text; g.append(t); svg.append(g);
      }
    }
    if (!pts.length) { const t = s('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', 'font-size': lsize, fill: lcol }); t.textContent = Array.isArray(d.series) ? 'No data' : 'Add preview bars'; svg.append(t); }
    root.replaceChildren(svg);
    // TAP a bar / point to highlight it (on the dashboard; a design choice: Selectable)
    if (c.selectable) pts.forEach((p, i) => svg.append(s('rect', { x: f2(padL + slot * i), y: 0, width: f2(slot), height: H, fill: 'transparent', 'data-i': i, class: 'iqch__hit' })));
    root.onclick = c.selectable ? (e) => { const tgt = e.target.closest && e.target.closest('[data-i]'), i = tgt ? Number(tgt.dataset.i) : NaN;
      if (Number.isFinite(i) && i >= 0 && i < pts.length) { root.__tap = i; paint(root, c, d, box); } } : null;
  }

  const opt = (l) => l.map(([value, label]) => ({ value, label }));
  const COL = () => (EL() ? EL().COLOURS : []);
  const set = (k) => (o, v) => { if (v === undefined || v === null || v === '') delete o[k]; else o[k] = v; };
  const fld = (key, x) => ({ key, get: (o) => o[key], set: set(key), ...x });
  const isBar = (o) => (o.kind || 'bar') === 'bar', isLine = (o) => o.kind === 'line' || o.kind === 'area';
  function fields() {
    return [
      fld('kind', { type: 'select', label: 'Chart type', group: 'chart', half: true, get: (o) => o.kind || 'bar', options: opt([['bar', 'Bars'], ['line', 'Line'], ['area', 'Area (line + fill)']]) }),
      fld('count', { type: 'range', label: 'Points shown (the last)', group: 'chart', min: 1, max: POINT_MAX, step: 1, unit: '', get: (o) => o.count ?? 7 }),
      fld('source', { type: 'select', label: 'Home Assistant data', group: 'chart', half: true, get: (o) => o.source || 'statistics', options: opt([['statistics', 'Statistics (per period)'], ['history', 'History (recorder)']]),
        help: 'Used when the chart has a Property (Data). Statistics: kWh per day, average °C per hour…' }),
      fld('period', { type: 'select', label: 'Period', group: 'chart', half: true, get: (o) => o.period || 'day', when: (o) => (o.source || 'statistics') === 'statistics', options: opt([['hour', 'Hour'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']]) }),
      fld('stat', { type: 'select', label: 'Value per period', group: 'chart', half: true, get: (o) => o.stat || 'auto', set: (o, v) => { if (!v || v === 'auto') delete o.stat; else o.stat = v; }, when: (o) => (o.source || 'statistics') === 'statistics',
        options: opt([['auto', 'Automatic (a total: its change; else its mean)'], ['change', 'Change (consumption)'], ['mean', 'Mean'], ['min', 'Minimum'], ['max', 'Maximum']]) }),
      fld('range', { type: 'select', label: 'History range', group: 'chart', half: true, get: (o) => o.range || '24h', when: (o) => o.source === 'history', options: opt([['1h', '1 hour'], ['6h', '6 hours'], ['12h', '12 hours'], ['24h', '24 hours'], ['7d', '7 days']]) }),
      { key: 'points', type: 'collection', label: 'Preview bars (design data, shown until a Property gives real data)', group: 'chart', max: POINT_MAX, itemLabel: 'preview point', addLabel: '+ Add a preview point',
        get: (o) => (Array.isArray(o.points) ? o.points : []), set: (o, l) => { if (l.length) o.points = l; else delete o.points; },
        create: () => ({ label: 'Mon', value: 10 }), summary: (p) => ({ title: `${plain(p.label, 16) || '—'} · ${p.value ?? '—'}` }),
        fields: [{ key: 'label', type: 'text', label: 'Label', maxLength: 16 }, { key: 'value', type: 'number', label: 'Value' }, { key: 'color', type: 'color', label: 'Own colour', options: COL(), custom: true, optional: true }] },
      // BARS
      fld('barWidth', { type: 'range', label: 'Bar width', group: 'bars', min: 5, max: 100, step: 1, unit: '%', when: isBar, get: (o) => o.barWidth ?? 55 }),
      fld('capsule', { type: 'boolean', label: 'Capsules (full height, the value fills them)', group: 'bars', when: isBar, get: (o) => o.capsule === true, set: (o, v) => { if (v) o.capsule = true; else delete o.capsule; } }),
      fld('barRadius', { type: 'range', label: 'Bar corner radius', group: 'bars', min: 0, max: 100, step: 1, unit: 'px', when: (o) => isBar(o) && !o.capsule, get: (o) => o.barRadius ?? 4 }),
      fld('barStyle', { type: 'select', label: 'Bar style', group: 'bars', half: true, when: isBar, get: (o) => o.barStyle || 'filled', options: opt([['filled', 'Filled'], ['outline', 'Outlined (the highlighted one filled)']]) }),
      fld('outlineWidth', { type: 'range', label: 'Outline width', group: 'bars', min: 0.5, max: 8, step: 0.5, unit: 'px', when: (o) => isBar(o) && o.barStyle === 'outline', get: (o) => o.outlineWidth ?? 1.5 }),
      fld('barColor', { type: 'color', label: 'Bar colour', group: 'bars', options: COL(), custom: true, optional: true, when: isBar }),
      { key: 'colors', type: 'collection', label: 'Bar colours (one per bar, repeated)', group: 'bars', max: 12, itemLabel: 'colour', addLabel: '+ Add a bar colour', when: isBar,
        get: (o) => (Array.isArray(o.colors) ? o.colors : []), set: (o, l) => { if (l.length) o.colors = l; else delete o.colors; },
        create: () => ({ color: 'accent' }), summary: (x) => ({ title: x.color || '—' }), fields: [{ key: 'color', type: 'color', label: 'Colour', options: COL(), custom: true }] },
      fld('barOpacity', { type: 'range', label: 'Bar opacity', group: 'bars', min: 0, max: 100, step: 1, unit: '%', when: isBar, get: (o) => o.barOpacity ?? 100 }),
      fld('barGradient', { type: 'boolean', label: 'Fade to the bottom', group: 'bars', when: isBar, get: (o) => o.barGradient === true, set: (o, v) => { if (v) o.barGradient = true; else delete o.barGradient; } }),
      // LINE
      fld('lineColor', { type: 'color', label: 'Line colour', group: 'line', options: COL(), custom: true, optional: true, when: isLine }),
      fld('lineWidth', { type: 'range', label: 'Line width', group: 'line', min: 0.5, max: 16, step: 0.5, unit: 'px', when: isLine, get: (o) => o.lineWidth ?? 2.5 }),
      fld('smooth', { type: 'boolean', label: 'Smooth curve', group: 'line', when: isLine, get: (o) => o.smooth === true, set: (o, v) => { if (v) o.smooth = true; else delete o.smooth; } }),
      fld('areaOpacity', { type: 'range', label: 'Area strength (fades down)', group: 'line', min: 0, max: 100, step: 1, unit: '%', when: (o) => o.kind === 'area', get: (o) => o.areaOpacity ?? 40 }),
      fld('marker', { type: 'select', label: 'Marker', group: 'line', half: true, when: isLine, get: (o) => o.marker || 'none', options: opt([['none', 'None'], ['last', 'Last point'], ['max', 'Highest point'], ['highlight', 'The highlighted point']]) }),
      fld('markerSize', { type: 'range', label: 'Marker size', group: 'line', min: 2, max: 30, step: 1, unit: 'px', when: (o) => isLine(o) && (o.marker || 'none') !== 'none', get: (o) => o.markerSize ?? 5 }),
      fld('markerColor', { type: 'color', label: 'Marker centre', group: 'line', options: COL(), custom: true, optional: true, when: (o) => isLine(o) && (o.marker || 'none') !== 'none' }),
      fld('glow', { type: 'range', label: 'Glow', group: 'chart', min: 0, max: 40, step: 1, unit: 'px', auto: 'None', autoValue: 0, optional: true }),
      // HIGHLIGHT
      fld('highlight', { type: 'select', label: 'Highlighted point', group: 'highlight', half: true, get: (o) => o.highlight || 'none', options: opt([['none', 'None'], ['last', 'The last'], ['max', 'The highest'], ['index', 'A chosen one']]) }),
      fld('highlightIndex', { type: 'range', label: 'Which (from the left)', group: 'highlight', min: 1, max: POINT_MAX, step: 1, unit: '', when: (o) => o.highlight === 'index', get: (o) => o.highlightIndex ?? 1 }),
      fld('highlightColor', { type: 'color', label: 'Highlight colour', group: 'highlight', options: COL(), custom: true, optional: true }),
      fld('selectable', { type: 'boolean', label: 'Tap a point to highlight it', group: 'highlight', get: (o) => o.selectable === true, set: (o, v) => { if (v) o.selectable = true; else delete o.selectable; } }),
      fld('tooltip', { type: 'boolean', label: 'Tooltip with its value', group: 'highlight', get: (o) => o.tooltip === true, set: (o, v) => { if (v) o.tooltip = true; else delete o.tooltip; } }),
      fld('tooltipBg', { type: 'color', label: 'Tooltip background', group: 'highlight', options: COL(), custom: true, optional: true, when: (o) => o.tooltip === true }),
      fld('tooltipColor', { type: 'color', label: 'Tooltip text', group: 'highlight', options: COL(), custom: true, optional: true, when: (o) => o.tooltip === true }),
      fld('unit', { type: 'text', label: 'Unit (tooltip)', group: 'highlight', half: true, maxLength: 12, optional: true, placeholder: 'e.g. kWh' }),
      fld('decimals', { type: 'select', label: 'Decimals', group: 'highlight', half: true, get: (o) => (typeof o.decimals === 'number' ? String(o.decimals) : ''), set: (o, v) => { if (v === '' || v === undefined) delete o.decimals; else o.decimals = Number(v); },
        options: opt([['', 'As it is'], ['0', '0'], ['1', '1'], ['2', '2']]) }),
      fld('underline', { type: 'boolean', label: 'Underline its label', group: 'highlight', get: (o) => o.underline === true, set: (o, v) => { if (v) o.underline = true; else delete o.underline; } }),
      // GRID + LABELS
      fld('grid', { type: 'range', label: 'Grid lines', group: 'axes', min: 0, max: 12, step: 1, unit: '', get: (o) => o.grid ?? 0 }),
      fld('gridColor', { type: 'color', label: 'Grid colour', group: 'axes', options: COL(), custom: true, optional: true, when: (o) => (o.grid || 0) > 0 }),
      fld('gridDash', { type: 'boolean', label: 'Dashed grid', group: 'axes', when: (o) => (o.grid || 0) > 0, get: (o) => o.gridDash === true, set: (o, v) => { if (v) o.gridDash = true; else delete o.gridDash; } }),
      fld('yLabels', { type: 'boolean', label: 'Value labels (left)', group: 'axes', get: (o) => o.yLabels === true, set: (o, v) => { if (v) o.yLabels = true; else delete o.yLabels; } }),
      fld('xLabels', { type: 'boolean', label: 'Point labels (below)', group: 'axes', get: (o) => o.xLabels !== false, set: (o, v) => { if (v) delete o.xLabels; else o.xLabels = false; } }),
      fld('labelFormat', { type: 'select', label: 'Label from the time', group: 'axes', half: true, get: (o) => o.labelFormat || 'auto', options: opt([['auto', 'Automatic'], ['weekday', 'Weekday (Mon)'], ['day', 'Day (5)'], ['date', 'Date (5 Nov)'], ['month', 'Month (Nov)'], ['time', 'Time (06:00)']]) }),
      fld('labelsColoured', { type: 'boolean', label: 'Labels in their bar’s colour', group: 'axes', when: isBar, get: (o) => o.labelsColoured === true, set: (o, v) => { if (v) o.labelsColoured = true; else delete o.labelsColoured; } }),
      fld('labelColor', { type: 'color', label: 'Label colour', group: 'axes', options: COL(), custom: true, optional: true }),
      fld('labelSize', { type: 'range', label: 'Label size', group: 'axes', min: 6, max: 40, step: 1, unit: 'px', get: (o) => o.labelSize ?? 10 }),
      fld('yMin', { type: 'number', label: 'Lowest value', group: 'axes', half: true, optional: true, help: 'Empty: automatic.' }),
      fld('yMax', { type: 'number', label: 'Highest value', group: 'axes', half: true, optional: true }),
      fld('padTop', { type: 'range', label: 'Room above', group: 'axes', min: 0, max: 400, step: 1, unit: 'px', auto: 'Automatic', optional: true }),
      fld('padX', { type: 'range', label: 'Room left / right', group: 'axes', min: 0, max: 200, step: 1, unit: 'px', auto: 'Automatic', optional: true }),
    ];
  }

  const drawn = (c, d, ctx) => { const root = document.createElement('div'); root.className = 'iqel iqch'; paint(root, c || {}, d || {}, (ctx && ctx.box) || {}); return root; };
  IC.define('chart', { name: 'Chart', category: 'data', module: 'IniqChartElement (SVG)', render: (c, d, ctx) => drawn(c, d, ctx),
    contract: { kind: "'bar' | 'line' | 'area'", source: "'statistics' | 'history'", period: "'hour' | 'day' | 'week' | 'month'", range: "'1h' … '7d'", points: '[{ label, value, color? }] (preview)' },
    capabilities: ['bars · capsules · line · area', 'per-bar colours, highlight, tooltip', 'history and statistics'], state: '{ series: [[ms, value]] } — from its property (history / statistics), else its preview bars',
    compose: { nameBase: 'Chart', defaults: {}, data: {}, box: { w: 280, h: 150 }, min: { w: 40, h: 30 },
      initial: () => ({ kind: 'bar', points: [['Mon', 12], ['Tue', 18], ['Wed', 9], ['Thu', 22], ['Fri', 15]].map(([label, value]) => ({ label, value })), barRadius: 6 }),
      fields, inputs: { series: { label: 'History', kind: 'series', primary: true } },
      resize: { mode: 'fill', aspect: 'free' },
      render: (c, d = {}, ctx = {}) => drawn(c, d, ctx),
      update: (root, c, d = {}, ctx = {}) => { if (!root.classList.contains('iqch')) return false; paint(root, c || {}, d || {}, ctx.box || {}); return true; } } });
  // its shared configuration builder (the same fields Widget Studio shows) — every composable component has one
  if (IC.editor) IC.editor('chart', () => fields());
  global.IniqChartElement = Object.freeze({ paint, pointsOf });
})(window);
