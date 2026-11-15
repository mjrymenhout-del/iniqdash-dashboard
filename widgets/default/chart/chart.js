/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Chart / History Widget V1 — draws numeric history. It stores and computes nothing about the
   home: with Home Assistant the points come from HA's recorder (through IniqHA.history → the
   IniqDash server); without it, clearly labelled demo data.

   MaisonChart.create(config) → HTMLElement (.ch), with el.chart = { getState(), setState(patch) }
   config = {
     id, name
     kind:       'line' | 'area' | 'bar'
     range:      '1h' | '6h' | '12h' | '24h' | '7d'         (label + time axis format)
     value:      current value (number | text state), unit, decimals (0–3, optional)
     showMinMax: true      min / max of the period under the chart
     showAxes:   true      value + time axes (when the widget is large enough)
     series:     [{ id, name, unit, color?, error?, points: [[ms, value|null, min|null, max|null], …] }]
                 one or more series (several: each its own colour, a legend, grouped bars, a tooltip for all of them)
     period:     'hour' | 'day' | 'week' | 'month' | 'year'   — long-term statistics (instead of range): bucket labels per period
     legend:     true | false | undefined (automatic: shown with more than one series)
                 A null point is a GAP (unavailable / unknown / no data) and is drawn as a gap:
                 lines are never joined across it and nothing is invented in between.
     start, end: ms (default: the first / last point)
     status:     'ok' | 'loading' | 'error' | 'empty'     message: text for error / empty
     demo:       true → "Demo data" label (no series given → demo series generated here)
     available:  true
   }
   Responsive: the SVG is drawn at the plot's real layout size (ResizeObserver: unaffected by the
   editor's zoom); axes, tick count, labels and the footer follow the widget's own box.
   ========================================================================== */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const RANGES = { '1h': ['Last hour', 3600e3], '6h': ['Last 6 hours', 21600e3], '12h': ['Last 12 hours', 43200e3], '24h': ['Last 24 hours', 86400e3], '7d': ['Last 7 days', 604800e3] };
  const COUNT = { '1h': 60, '6h': 72, '12h': 72, '24h': 96, '7d': 84 };
  const PERIODS = { hour: ['Last 48 hours · hourly', 3600e3, 48], day: ['Last 30 days · daily', 86400e3, 30], week: ['Last 12 weeks · weekly', 604800e3, 12],
    month: ['Last 12 months · monthly', 2629800e3, 12], year: ['Last 5 years · yearly', 31557600e3, 5] };
  const HEX = /^#[0-9a-fA-F]{6}$/, TOKEN = /^[a-z][a-z0-9-]{1,30}$/;
  const colourOf = (v) => (typeof v !== 'string' ? null : HEX.test(v) ? v : TOKEN.test(v) ? `var(--${v})` : null);
  /** demo bars for a statistics period (only without Home Assistant): deterministic per name */
  function demoStats(period = 'day', name = 'Demo', end = Date.now()) {
    const [, step, n] = PERIODS[period] || PERIODS.day;
    let seed = [...String(name)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11);
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const start = end - step * n, points = [];
    for (let i = 0; i < n; i++) points.push([Math.round(start + i * step), Math.round((4 + rnd() * 9) * 100) / 100, null, null]);
    return { id: 'demo', name, unit: 'kWh', points, start, end };
  }
  /** "Last 30 days · daily" — or, showing only the last N periods, "Last 7 days · daily" */
  const UNIT = { hour: ['hour', 'hours'], day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'], year: ['year', 'years'] };
  const rangeLabel = (s) => (s.period && PERIODS[s.period]
    ? (Number.isInteger(s.count) && s.count > 0 && UNIT[s.period] ? PERIODS[s.period][0].replace(/^Last \d+ \w+/, `Last ${s.count} ${UNIT[s.period][1]}`) : PERIODS[s.period][0])
    : (RANGES[s.range] || RANGES['24h'])[0]);
  const finite = (v) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v));
  /** a smooth curve through the points (monotone in x: a Catmull-Rom spline as cubic Béziers, its control points kept between neighbours' y) */
  const smoothPath = (r) => {
    let d = `M${r[0][0].toFixed(1)} ${r[0][1].toFixed(1)}`;
    for (let i = 0; i < r.length - 1; i++) {
      const p0 = r[i - 1] || r[i], p1 = r[i], p2 = r[i + 1], p3 = r[i + 2] || p2;
      const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]), cl = (v) => Math.min(hi, Math.max(lo, v));
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, cl(p1[1] + (p2[1] - p0[1]) / 6)], c2 = [p2[0] - (p3[0] - p1[0]) / 6, cl(p2[1] - (p3[1] - p1[1]) / 6)];
      d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  const el = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };

  /** Demo history (only used without Home Assistant): a smooth daily curve with a gap, so the
      empty-period look is visible too. Deterministic per name + range. */
  function demoSeries(range = '24h', name = 'Demo', end = Date.now()) {
    const span = (RANGES[range] || RANGES['24h'])[1], n = COUNT[range] || 96, step = span / n;
    let seed = [...String(name)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const start = end - span;
    const points = [];
    for (let i = 0; i < n; i++) {
      const t = start + i * step;
      const hour = new Date(t).getHours() + new Date(t).getMinutes() / 60;
      const gap = i > n * 0.62 && i < n * 0.67;
      const v = 20.5 + 2.4 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + (rnd() - 0.5) * 0.5;
      points.push(gap ? [Math.round(t), null, null, null] : [Math.round(t), Math.round(v * 100) / 100, Math.round((v - 0.2) * 100) / 100, Math.round((v + 0.2) * 100) / 100]);
    }
    return { id: 'demo', name, unit: '°C', points, start, end };
  }

  /** 3–6 round ticks covering [lo, hi] */
  function ticks(lo, hi, want) {
    const span = hi - lo || 1;
    const raw = span / Math.max(1, want);
    const p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
    const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push((Math.round(v / step) * step) || 0);   // never "-0"
    return { list: out, step };
  }

  function create(config) {
    let s = { kind: 'line', range: '24h', showMinMax: true, showAxes: true, status: 'ok', available: true, ...(config || {}) };
    if (!Array.isArray(s.series) && s.demo !== false) {
      // demo: the main series and every added one (each labelled, each its own colour)
      const mk = (name) => (s.period ? demoStats(s.period, name) : demoSeries(s.range, name));
      const tr = Array.isArray(s.traces) ? s.traces.filter((t) => t && typeof t === 'object') : [];
      s.series = [mk(s.name), ...tr.map((t, i) => ({ ...mk(t.label || `Series ${i + 2}`), id: `demo${i + 2}`, name: t.label || `Series ${i + 2}`, color: t.color }))];
      if (tr.length) s.series[0] = { ...s.series[0], color: s.color, name: s.seriesLabel || s.name };
      else if (s.color) s.series[0] = { ...s.series[0], color: s.color };
      s.demo = true;
    }
    const root = document.createElement('article');
    root.className = 'ch';
    if (s.id) root.dataset.chartId = s.id;
    root.innerHTML = `
      <div class="ch__in">
        <header class="ch__head"><h3 class="ch__name"></h3><p class="ch__now"><b class="ch__val"></b><span class="ch__unit"></span></p></header>
        <ul class="ch__legend" hidden></ul>
        <div class="ch__plot"><svg class="ch__svg" aria-hidden="true"></svg><p class="ch__msg" role="status"></p><div class="ch__cur" hidden></div><div class="ch__tip" hidden></div></div>
        <footer class="ch__foot"><span class="ch__range"></span><span class="ch__mm"></span><span class="ch__demo">Demo data</span></footer>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const plot = $('.ch__plot'), svg = $('.ch__svg');
    let pw = 0, ph = 0, raf = 0;

    const dec = () => (finite(s.decimals) ? Math.max(0, Math.min(3, Number(s.decimals))) : null);
    const fmt = (v, d = dec()) => {
      const n = Number(v);
      const dd = d !== null ? d : Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2;
      return n.toLocaleString(undefined, { minimumFractionDigits: d !== null ? d : 0, maximumFractionDigits: dd });
    };
    const unitOf = () => (s.unit ?? s.series?.[0]?.unit ?? '') || '';

    function header() {
      const unit = unitOf();
      const v = s.value !== undefined ? s.value : (() => { const pts = s.series?.[0]?.points || []; for (let i = pts.length - 1; i >= 0; i--) if (pts[i][1] !== null) return pts[i][1]; return null; })();
      const na = s.available === false || String(v).toLowerCase() === 'unavailable';
      $('.ch__name').textContent = s.name || '';
      $('.ch__val').textContent = na ? 'Unavailable' : finite(v) ? fmt(v) : v === null || v === undefined || v === '' ? '—' : String(v) === 'unknown' ? 'Unknown' : String(v);
      $('.ch__unit').textContent = !na && finite(v) ? unit : '';
      root.dataset.now = na ? 'unavailable' : finite(v) ? 'ok' : 'none';
      $('.ch__range').textContent = rangeLabel(s);
      root.dataset.demo = String(!!s.demo);
      legend();
    }
    /** the legend: one chip per series (its colour, name, latest value — or why it has none) */
    function legend() {
      const list = (s.series || []).filter((x) => x && Array.isArray(x.points));
      const show = s.legend === true || (s.legend !== false && list.length > 1);
      const L = $('.ch__legend');
      L.hidden = !show; root.dataset.legend = String(show);
      if (!show) { L.replaceChildren(); return; }
      L.replaceChildren(...list.map((x, i) => {
        const li = document.createElement('li'); li.className = 'ch__key'; li.dataset.series = String(i);
        const c = colourOf(x.color); if (c) li.style.setProperty('--ch-line', c);
        const sw = document.createElement('span'); sw.className = 'ch__sw';
        const nm = document.createElement('span'); nm.className = 'ch__kn'; nm.textContent = x.name || `Series ${i + 1}`;
        const v = document.createElement('b'); v.className = 'ch__kv';
        let last = null; for (let k = x.points.length - 1; k >= 0; k--) if (x.points[k][1] !== null && Number.isFinite(x.points[k][1])) { last = x.points[k][1]; break; }
        v.textContent = x.error ? x.error : last === null ? '—' : `${fmt(last)}${x.unit ? ` ${x.unit}` : ''}`;
        if (x.error) li.dataset.error = 'true';
        li.append(sw, nm, v); return li;
      }));
    }

    function draw() {
      raf = 0;
      header();
      const series = (s.series || []).filter((x) => x && Array.isArray(x.points));
      const pts = series[0]?.points || [];
      const firstVals = pts.filter((p) => p[1] !== null && Number.isFinite(p[1]));
      // the value range covers every series (a series without data adds nothing)
      const vals = series.flatMap((x) => x.points.filter((p) => p[1] !== null && Number.isFinite(p[1])));
      const status = s.status === 'ok' && !vals.length ? 'empty' : s.status;
      root.dataset.status = status;
      $('.ch__msg').textContent = status === 'loading' && !vals.length ? 'Loading history…'
        : status === 'error' ? (s.message || 'History could not be loaded')
        : status === 'empty' ? (s.message || 'No numeric history in this period') : '';
      const unit = unitOf();
      if (firstVals.length) {
        const lo = Math.min(...firstVals.map((p) => (finite(p[2]) ? p[2] : p[1]))), hi = Math.max(...firstVals.map((p) => (finite(p[3]) ? p[3] : p[1])));
        $('.ch__mm').textContent = s.showMinMax === false ? '' : `Min ${fmt(lo)} · Max ${fmt(hi)}${unit ? ` ${unit}` : ''}`;
      } else $('.ch__mm').textContent = '';
      svg.replaceChildren();
      // APPEARANCE of the marks (all optional; the defaults draw exactly as before)
      const num = (v, a, b, d) => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
      root.style.setProperty('--ch-lw', String(num(s.lineWidth, 1, 6, 2)));
      root.style.setProperty('--ch-fill-a', String(num(s.fillOpacity, 0, 100, 32) / 100));
      root.style.setProperty('--ch-bar-o', String(num(s.barOpacity, 10, 100, 50) / 100));
      const to = colourOf(s.colorTo); if (to) root.style.setProperty('--ch-line-b', to); else root.style.removeProperty('--ch-line-b');
      root.toggleAttribute('data-ch-glow', s.glow === true);
      if (!(pw > 0 && ph > 0) || !vals.length) return;

      /* ---- geometry: axes only when there is room for them */
      // the same rule as the 'mini' arrangement (the widget's own layout box, not the editor zoom): a sparkline, no axes
      const mini = root.offsetWidth < 200 || root.offsetHeight < 130;
      const axisY = !mini && s.showAxes !== false && pw >= 170 && ph >= 80;
      const axisX = !mini && s.showAxes !== false && ph >= 90 && pw >= 140;
      const fs = Math.max(9.5, Math.min(12, ph / 14));
      const ref = series.find((x) => x.points.length) || series[0];
      const rp = ref.points;
      const t0 = finite(s.start) ? Number(s.start) : series[0].start ?? rp[0][0];
      // a bucket's length: the smallest gap between two points (statistics may skip a bucket HA has no row for)
      let step = s.period && PERIODS[s.period] ? PERIODS[s.period][1] : rp.length > 1 ? rp[1][0] - rp[0][0] : 60e3;
      if (!s.period && rp.length > 2) for (let i = 2; i < rp.length; i++) step = Math.min(step, rp[i][0] - rp[i - 1][0]) || step;
      const lastT = Math.max(...series.filter((x) => x.points.length).map((x) => x.points[x.points.length - 1][0]));
      const t1 = finite(s.end) ? Math.max(Number(s.end), s.period ? lastT + step : 0) : series[0].end ?? lastT + step;
      let lo = Math.min(...vals.map((p) => p[1])), hi = Math.max(...vals.map((p) => p[1]));
      if (s.kind === 'bar' && lo > 0) lo = 0;                           // bars stand on zero
      if (s.kind === 'bar' && hi < 0) hi = 0;                           // …negative bars hang from it
      if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
      const pad = (hi - lo) * 0.1; if (!(s.kind === 'bar' && lo === 0)) lo -= pad; hi += pad;
      const yt = ticks(lo, hi, Math.max(2, Math.min(5, Math.floor(ph / 42))));
      if (axisY) { lo = Math.min(lo, yt.list[0]); hi = Math.max(hi, yt.list[yt.list.length - 1]); }
      const yLabel = (v) => { const d = yt.step < 1 ? Math.min(2, Math.ceil(-Math.log10(yt.step))) : 0; return Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }); };
      const left = axisY ? Math.ceil(Math.max(...yt.list.map((v) => yLabel(v).length)) * fs * 0.62) + 8 : 2;
      const right = 6, top = 6, bottom = axisX ? fs + 10 : 4;
      const W = pw - left - right, H = ph - top - bottom;
      if (W < 20 || H < 16) return;
      const X = (t) => left + ((t - t0) / (t1 - t0)) * W;
      const Y = (v) => top + (1 - (v - lo) / (hi - lo)) * H;
      svg.setAttribute('viewBox', `0 0 ${pw} ${ph}`);
      svg.setAttribute('width', pw); svg.setAttribute('height', ph);

      /* ---- grid + axes */
      const g = el('g', { class: 'ch__grid' });
      (axisY ? yt.list : []).forEach((v) => {
        const y = Y(v);
        if (y < top - 0.5 || y > top + H + 0.5) return;
        g.append(el('line', { x1: left, x2: left + W, y1: y.toFixed(1), y2: y.toFixed(1) }));
        const tx = el('text', { x: left - 6, y: (y + fs * 0.35).toFixed(1), 'text-anchor': 'end', 'font-size': fs });
        tx.textContent = yLabel(v); g.append(tx);
      });
      if (axisX && s.period && PERIODS[s.period]) {
        // statistics: a label at a bucket's start, as many as fit (hour → 14:00 · day / week → 3 Nov · month → Nov · year → 2026)
        const fmtT = (t) => { const d = new Date(t); return s.period === 'hour' ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          : s.period === 'month' ? d.toLocaleDateString(undefined, { month: 'short' }) : s.period === 'year' ? String(d.getFullYear()) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
        const starts = [...new Set(series.flatMap((x) => x.points.map((p) => p[0])))].sort((a, b) => a - b);
        let lastRight = -Infinity;
        starts.forEach((t) => {
          const x = X(t + step / 2), text = fmtT(t), half = (text.length * fs * 0.56) / 2;
          if (x < left - 0.5 || x > left + W + 0.5) return;
          const cx = Math.max(left + half, Math.min(left + W - half, x));
          if (cx - half < lastRight + 8) return;
          lastRight = cx + half;
          const tx = el('text', { x: cx.toFixed(1), y: (top + H + fs + 5).toFixed(1), 'text-anchor': 'middle', 'font-size': fs });
          tx.textContent = text; g.append(tx);
        });
      } else if (axisX) {
        // round, local-time ticks (15 min, 1 h, 3 h … or whole days); labels never run off the plot
        const want = Math.max(2, Math.min(7, Math.floor(W / 78)));
        const long = t1 - t0 > 2 * 86400e3;
        const span = t1 - t0, MIN = 60e3;
        const steps = long ? [1, 2, 3, 7].map((d) => d * 1440 * MIN) : [5, 10, 15, 30, 60, 120, 180, 240, 360, 720, 1440].map((m) => m * MIN);
        const stepT = steps.find((x) => span / x <= want) || steps[steps.length - 1];
        const tz = (t) => new Date(t).getTimezoneOffset() * MIN;            // align to the local clock
        let first = Math.ceil((t0 - tz(t0)) / stepT) * stepT + tz(t0);
        const label = (t) => { const d = new Date(t); return long ? d.toLocaleDateString(undefined, { weekday: 'short' }) + (W > 420 ? ` ${d.getDate()}` : '') : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
        let lastRight = -Infinity;
        for (let t = first; t <= t1; t += stepT) {
          const lt = long ? (() => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); })() : t;   // DST-safe midnight
          const x = X(lt), text = label(lt), half = (text.length * fs * 0.56) / 2;
          if (x < left - 0.5 || x > left + W + 0.5) continue;
          const cx = Math.max(left + half, Math.min(left + W - half, x));
          if (cx - half < lastRight + 8) continue;                          // would touch the previous label
          lastRight = cx + half;
          g.append(el('line', { class: 'ch__tick', x1: x.toFixed(1), x2: x.toFixed(1), y1: top + H, y2: top + H + 3 }));
          const tx = el('text', { x: cx.toFixed(1), y: (top + H + fs + 5).toFixed(1), 'text-anchor': 'middle', 'font-size': fs });
          tx.textContent = text; g.append(tx);
        }
      }
      // signed values (e.g. import + / export −): the zero line
      if (lo < 0 && hi > 0) g.append(el('line', { class: 'ch__zero', x1: left, x2: left + W, y1: Y(0).toFixed(1), y2: Y(0).toFixed(1) }));
      svg.append(g);
      geo = { left, W, top, H, X, Y, t0, t1, step, series };

      /* ---- data: every series in its own group (its colour on the group; one series without a colour is drawn exactly as before) */
      const kind = ['line', 'area', 'bar'].includes(s.kind) ? s.kind : 'line';
      series.forEach((ser, si) => {
        const data = el('g', { class: `ch__data ch__data--${kind}` });
        const c = colourOf(ser.color); if (c) data.setAttribute('style', `--ch-line: ${c}`);
        if (series.length > 1) data.dataset.series = String(si);
        drawOne(data, ser.points, kind, si, series.length);
        svg.append(data);
      });
      function drawOne(data, pts, kind, si, n) {
      // a GRADIENT fill for the bars (colour → second colour, top to bottom), when a second colour is set
      let barFill = null;
      if (kind === 'bar' && to && si === 0) {
        const gid = `chb-${Math.random().toString(36).slice(2, 8)}`, defs = el('defs'), lg = el('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 });
        lg.append(el('stop', { offset: '0', class: 'ch__bstop-a' }), el('stop', { offset: '1', class: 'ch__bstop-b' }));
        defs.append(lg); svg.append(defs); barFill = `url(#${gid})`;
      }
      if (kind === 'bar') {
        // one bar per bucket (several series: side by side); neighbouring buckets are merged when the bars would be thinner than 3 px
        const per = s.period ? 1 : Math.max(1, Math.ceil(5 / Math.max(0.01, (W / Math.max(1, pts.length)) - 1)));
        for (let i = 0; i < pts.length; i += per) {
          const grp = pts.slice(i, i + per).filter((p) => p[1] !== null);
          if (!grp.length) continue;                                     // gap: no bar
          const v = grp.reduce((a, p) => a + p[1], 0) / grp.length;
          const xa = X(pts[i][0]), xb = s.period ? X(pts[i][0] + step) : X((pts[i + per]?.[0]) ?? t1);
          const base = Y(Math.max(lo, Math.min(hi, 0 >= lo && 0 <= hi ? 0 : lo)));
          const y = Y(v);
          const bw = Math.max(1, (xb - xa) * num(s.barWidth, 20, 100, 62) / 100), sw = bw / n;
          data.append(el('rect', { x: (xa + ((xb - xa) - bw) / 2 + si * sw).toFixed(1), width: Math.max(1, sw - (n > 1 ? 1 : 0)).toFixed(1), y: Math.min(y, base).toFixed(1), height: Math.max(1, Math.abs(base - y)).toFixed(1),
            rx: Math.min(num(s.barRadius, 0, 16, 3), sw / 2, Math.abs(base - y) / 2 + 0.5).toFixed(1), ...(barFill ? { style: `fill: ${barFill}` } : {}) }));
        }
        if (data.lastChild) data.lastChild.setAttribute('class', 'ch__bar-now');   // the current value is the emphasised bar
      } else {
        // runs of consecutive values; a null point — or a missing bucket — ends a run (a gap is never bridged)
        const runs = []; let cur = [], prevT = null;
        pts.forEach((p) => {
          if (p[1] === null || (prevT !== null && p[0] - prevT > step * 1.6)) { if (cur.length) runs.push(cur); cur = []; }
          if (p[1] !== null) cur.push([X(p[0] + step / 2), Y(p[1])]);
          prevT = p[0];
        });
        if (cur.length) runs.push(cur);
        if (kind === 'area') {
          const defs = el('defs'); const gid = `chg-${Math.random().toString(36).slice(2, 8)}`;
          const lg = el('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 });
          lg.append(el('stop', { offset: '0', class: 'ch__stop-a' }), el('stop', { offset: '1', class: 'ch__stop-b' }));
          defs.append(lg); svg.append(defs);
          runs.forEach((r) => {
            const a = r.length === 1 ? [[r[0][0] - 2, r[0][1]], [r[0][0] + 2, r[0][1]]] : r;
            const edge = s.smooth && a.length > 2 ? smoothPath(a).replace(/^M/, 'L') : a.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join('');
            data.append(el('path', { class: 'ch__area', fill: `url(#${gid})`, d: `M${a[0][0].toFixed(1)} ${(top + H).toFixed(1)}${edge}L${a[a.length - 1][0].toFixed(1)} ${(top + H).toFixed(1)}Z` }));
          });
        }
        runs.forEach((r) => {
          if (r.length === 1) data.append(el('circle', { class: 'ch__dot', cx: r[0][0].toFixed(1), cy: r[0][1].toFixed(1), r: 2.2 }));
          else data.append(el('path', { class: 'ch__line', fill: 'none', d: s.smooth ? smoothPath(r) : r.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') }));
        });
        const lastRun = runs[runs.length - 1];
        if (lastRun) { const [x, y] = lastRun[lastRun.length - 1]; data.append(el('circle', { class: 'ch__last', cx: x.toFixed(1), cy: y.toFixed(1), r: 3.4 })); }
      }
      }
    }
    /* THE TOOLTIP: the bucket under the pointer — its time and every series' value there (a gap says so) */
    let geo = null;
    const tip = $('.ch__tip'), cur = $('.ch__cur');
    function pointAt(clientX) {
      if (!geo || !geo.series.length) return null;
      const r = plot.getBoundingClientRect(), sx = r.width ? plot.clientWidth / r.width : 1, x = (clientX - r.left) * sx;
      if (x < geo.left || x > geo.left + geo.W) return null;
      const t = geo.t0 + ((x - geo.left) / geo.W) * (geo.t1 - geo.t0);
      const rows = geo.series.map((ser) => { let best = null; ser.points.forEach((p) => { if (p[0] <= t && t < p[0] + geo.step) best = p; }); return { ser, p: best }; });
      const at = rows.find((x) => x.p) ? rows.find((x) => x.p).p[0] : null;
      return at === null ? null : { t: at, x: geo.X(at + geo.step / 2), rows };
    }
    function showTip(e) {
      const hit = pointAt(e.clientX);
      if (!hit) { tip.hidden = true; cur.hidden = true; return; }
      const d = new Date(hit.t), long = s.period ? s.period !== 'hour' : (geo.t1 - geo.t0) > 2 * 86400e3;
      const when = s.period === 'month' ? d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : s.period === 'year' ? String(d.getFullYear())
        : long ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + (s.period ? '' : ` ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`) : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const head = document.createElement('b'); head.textContent = when;
      tip.replaceChildren(head, ...hit.rows.map(({ ser, p }) => {
        const row = document.createElement('span'); row.className = 'ch__tr';
        const c = colourOf(ser.color); if (c) row.style.setProperty('--ch-line', c);
        const v = p && p[1] !== null ? `${fmt(p[1])}${ser.unit ? ` ${ser.unit}` : ''}` : 'No data';
        row.textContent = geo.series.length > 1 ? `${ser.name || ''}: ${v}` : v; return row;
      }));
      tip.hidden = false; cur.hidden = false;
      cur.style.left = `${hit.x.toFixed(1)}px`; cur.style.top = `${geo.top}px`; cur.style.height = `${geo.H}px`;
      const w = tip.offsetWidth || 120;
      tip.style.left = `${Math.max(0, Math.min(plot.clientWidth - w, hit.x + 10 + w > plot.clientWidth ? hit.x - w - 10 : hit.x + 10)).toFixed(0)}px`;
      tip.style.top = `${geo.top}px`;
    }
    plot.addEventListener('pointermove', showTip);
    plot.addEventListener('pointerdown', showTip);
    plot.addEventListener('pointerleave', () => { tip.hidden = true; cur.hidden = true; });
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver((en) => {
        const b = en[0].contentBoxSize?.[0];
        const w = Math.round(b ? b.inlineSize : plot.clientWidth), h = Math.round(b ? b.blockSize : plot.clientHeight);   // layout size: zoom-independent
        if (w !== pw || h !== ph) { pw = w; ph = h; schedule(); }
      }).observe(plot);
    }
    root.setAttribute('role', 'img');
    draw();
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => (w < 200 || h < 130 ? 'mini' : h < 200 ? 'compact' : 'full') });
    root.chart = {
      getState: () => ({ status: root.dataset.status, points: (s.series?.[0]?.points || []).length, kind: s.kind, range: s.range, period: s.period || null, demo: !!s.demo,
        series: (s.series || []).map((x) => ({ name: x.name, unit: x.unit, color: x.color || null, error: x.error || null, points: (x.points || []).length, values: (x.points || []).map((p) => p[1]) })) }),
      /** external update (Home Assistant history / live value through IniqHA, or demo) */
      setState(patch) { s = { ...s, ...patch }; schedule(); header(); },
      redraw: draw,
    };
    root.setAttribute('aria-label', `${s.name || 'Chart'}: ${rangeLabel(s).toLowerCase()}`);
    return root;
  }

  /** Smallest usable area: 2 × 2 (header + sparkline). */
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }; }

  global.MaisonChart = { create, constraints, demoSeries, demoStats, RANGES, PERIODS };
})(window);
