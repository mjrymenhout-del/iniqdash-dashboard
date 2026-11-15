/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Neon Temperature Gauge — CUSTOM widget package (widgets/custom/neon-temperature-gauge/, type
   "custom.neon-temperature-gauge"). A dark circular thermostat-style dial: a thick dark ring, an
   illuminated cyan → turquoise → green → pink/red arc up to the value, subtle outer ticks, min / mid /
   max labels, the value with a small caption in a raised centre, and a two-column information panel.
   Derived from the factory Gauge (basedOn: gauge) but sharing NO code or CSS with it.

   IniqNeonTemperatureGauge.create(config) → HTMLElement (.ntg), with el.gauge = { getState(), setState(patch) }
   config = {
     name                    friendly name (identity, accessible name)
     label                   caption under the value ('' → the name)
     value                   number | numeric string | text state ('unavailable', 'unknown', …)
     unit                    '' → none (Home Assistant: the entity's unit unless overridden)
     min, max                optional; missing → automatic (10 – 30 °C, 50 – 86 °F, 0 – 100 %, …)
     autoMin / autoMax       the entity's own range when it has one (input_number / number)
     deviceClass             HA device class, only used for the automatic range
     decimals                0 – 2 (missing → as received, at most 1)
     showTicks, showMinMax, showPanel   booleans (default true)
     leftValue, leftLabel, rightValue, rightLabel    the information panel (plain text)
     available               true
   }
   Home Assistant: this package contains NO Home Assistant code. widget.json declares "ha": { "binding": "gauge",
   "deviceClasses": ["temperature"] }: the shared, read-only 'gauge' binding of the IniqHA layer, so it implements that binding's state contract:
   el.gauge.setState({ value, unit, deviceClass, autoMin, autoMax }).
   Responsive: arrangements come from the widget's OWN box (MaisonFit), never from the screen.
   Styling: neon-temperature-gauge.css, every rule scoped to [data-widget="custom.neon-temperature-gauge"]
   (this element carries that attribute itself, also outside the registry).
   ========================================================================== */
(function (global) {
  'use strict';

  const TYPE = 'custom.neon-temperature-gauge';
  const NS = 'http://www.w3.org/2000/svg';
  const finite = (v) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---- dial geometry (viewBox 260 × 260): 280° sweep, gap at the bottom, the mid value at the top */
  const CX = 130, CY = 132, R = 86, A0 = -140, SWEEP = 280;
  const TICK_IN = 107, TICK_OUT = 113, TICK_MAJOR_OUT = 116, TICK_STEP = 7;
  const pt = (deg, r = R) => { const a = ((deg - 90) * Math.PI) / 180; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };
  const f2 = (n) => n.toFixed(2);
  function arc(d0, d1, r = R) {
    const [x0, y0] = pt(d0, r), [x1, y1] = pt(d1, r);
    return `M${f2(x0)} ${f2(y0)}A${r} ${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${f2(x1)} ${f2(y1)}`;
  }

  /* ---- the colour of the scale at a fraction (0 = minimum … 1 = maximum): cold blue → cyan → turquoise →
     green → pink → red. Fixed to the scale, so the colour of the arc's end tells the temperature. */
  const STOPS = [[0, [47, 107, 255]], [0.2, [34, 176, 255]], [0.38, [24, 214, 205]], [0.52, [62, 222, 140]], [0.6, [92, 222, 128]], [0.74, [255, 92, 160]], [0.88, [255, 70, 120]], [1, [255, 58, 82]]];
  function colorAt(t) {
    t = clamp(t, 0, 1);
    let i = 0; while (i < STOPS.length - 2 && t > STOPS[i + 1][0]) i++;
    const [ta, a] = STOPS[i], [tb, b] = STOPS[i + 1], k = (t - ta) / (tb - ta || 1);
    const m = a.map((v, j) => Math.round(v + (b[j] - v) * k));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  }

  /** a "nice" upper bound: 1, 2, 2.5, 5 × 10^n */
  function nice(v) {
    if (!(v > 0)) return 10;
    const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  /** a temperature in degrees (shown as "20°"): its unit says so, or it has no unit and HA calls it a temperature */
  const isTemp = (u, dc) => u === '°C' || u === '°F' || (!u && dc === 'temperature');
  /** automatic range when min / max are not configured: the entity's own range, else a comfortable range for a
      room temperature (widened in steps of 5 when the value is outside it), else 0 … a round number */
  function autoRange(s, v) {
    if (finite(s.autoMin) && finite(s.autoMax) && Number(s.autoMax) > Number(s.autoMin)) return [Number(s.autoMin), Number(s.autoMax)];
    const u = String(s.unit || '').trim(), dc = s.deviceClass || '';
    if (isTemp(u, dc)) {
      let [lo, hi] = u === '°F' ? [50, 86] : [10, 30];
      if (v !== null && v < lo) lo = Math.floor(v / 5) * 5;
      if (v !== null && v > hi) hi = Math.ceil(v / 5) * 5;
      return [lo, hi];
    }
    if (u === '%') return [0, 100];
    const a = Math.abs(v ?? 0), top = nice(Math.max(a * 1.25, 1));
    return [v !== null && v < 0 ? -top : 0, top];
  }

  let seq = 0;
  function create(config) {
    let s = { label: 'Temperature', unit: '°C', showTicks: true, showMinMax: true, showPanel: true, available: true, ...(config || {}) };
    const uid = `ntg${++seq}`;
    const root = document.createElement('article');
    root.className = 'ntg';
    root.dataset.widget = TYPE;                       // the CSS scope, also when created outside the registry
    root.dataset.widgetSource = 'custom';
    root.setAttribute('role', 'meter');
    root.innerHTML = `
      <div class="ntg__in">
        <div class="ntg__dial">
          <svg class="ntg__svg" viewBox="0 -2 260 248" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
            <defs>
              <radialGradient id="${uid}-face" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#3a3d46"/><stop offset=".55" stop-color="#2a2c33"/><stop offset="1" stop-color="#1f2126"/></radialGradient>
              <linearGradient id="${uid}-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
              <radialGradient id="${uid}-halo" cx="50%" cy="50%" r="50%"><stop offset=".62" stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
              <linearGradient id="${uid}-knob" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#454852"/><stop offset="1" stop-color="#202227"/></linearGradient>
              <filter id="${uid}-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation="4.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              <filter id="${uid}-lift" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#000" flood-opacity=".6"/></filter>
            </defs>
            <circle class="ntg__halo" cx="${CX}" cy="${CY + 6}" r="122" fill="url(#${uid}-halo)"/>
            <g class="ntg__ticks"></g>
            <circle class="ntg__track" cx="${CX}" cy="${CY}" r="${R}" fill="none"/>
            <circle class="ntg__track-rim" cx="${CX}" cy="${CY}" r="${R + 13}" fill="none"/>
            <path class="ntg__path" d="${arc(A0, A0 + SWEEP)}" fill="none"/>
            <g class="ntg__ghost"></g>
            <g class="ntg__fill" filter="url(#${uid}-glow)"></g>
            <circle class="ntg__face" cx="${CX}" cy="${CY}" r="71" fill="url(#${uid}-face)" filter="url(#${uid}-lift)"/>
            <circle class="ntg__face-rim" cx="${CX}" cy="${CY}" r="70.5" fill="none" stroke="url(#${uid}-rim)"/>
            <g class="ntg__knob"><circle class="ntg__knob-b" r="9.5" fill="url(#${uid}-knob)"/><circle class="ntg__knob-c" r="3"/></g>
            <text class="ntg__lim ntg__lim--min" text-anchor="middle"></text>
            <text class="ntg__lim ntg__lim--mid" text-anchor="middle"></text>
            <text class="ntg__lim ntg__lim--max" text-anchor="middle"></text>
            <text class="ntg__val" x="${CX}" y="${CY + 9}" text-anchor="middle"><tspan class="ntg__num"></tspan><tspan class="ntg__unit"></tspan></text>
            <text class="ntg__cap" x="${CX}" y="${CY + 34}" text-anchor="middle"></text>
          </svg>
        </div>
        <div class="ntg__panel">
          <div class="ntg__cell ntg__cell--l"><b class="ntg__pv"></b><span class="ntg__pl"></span></div>
          <i class="ntg__sep" aria-hidden="true"></i>
          <div class="ntg__cell ntg__cell--r"><b class="ntg__pv"></b><span class="ntg__pl"></span></div>
        </div>
      </div>`;
    const $ = (q) => root.querySelector(q);

    // ticks: generated once along the sweep (every 7°; the ends and the middle are major)
    const ticks = $('.ntg__ticks');
    const nTicks = Math.round(SWEEP / TICK_STEP);
    for (let i = 0; i <= nTicks; i++) {
      const d = A0 + i * TICK_STEP, major = i === 0 || i === nTicks || i * 2 === nTicks;
      const [x0, y0] = pt(d, TICK_IN), [x1, y1] = pt(d, major ? TICK_MAJOR_OUT : TICK_OUT);
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', f2(x0)); l.setAttribute('y1', f2(y0)); l.setAttribute('x2', f2(x1)); l.setAttribute('y2', f2(y1));
      l.setAttribute('class', `ntg__tick${major ? ' ntg__tick--major' : ''}${i % 2 ? ' ntg__tick--odd' : ''}`);
      l.dataset.f = (i / nTicks).toFixed(4);
      ticks.append(l);
    }
    // limit labels: under the two ends of the sweep, and the middle value at the top
    const [ex0, ey0] = pt(A0, R), [ex1, ey1] = pt(A0 + SWEEP, R);
    const place = (q, x, y) => { $(q).setAttribute('x', f2(x)); $(q).setAttribute('y', f2(y)); };
    place('.ntg__lim--min', ex0 - 6, ey0 + 36);
    place('.ntg__lim--max', ex1 + 6, ey1 + 36);
    place('.ntg__lim--mid', CX, CY - TICK_MAJOR_OUT - 6);

    /** the arc between two fractions of the scale, as short segments in the scale colour (an SVG stroke has no
        gradient along its path); round ends; each segment overlaps the next a little, so no seams show */
    function segments(g, f0, f1, cls) {
      const out = [];
      const d0 = A0 + SWEEP * f0, d1 = A0 + SWEEP * f1;
      if (d1 - d0 < 0.05) return g.replaceChildren();
      const n = Math.max(1, Math.ceil((d1 - d0) / 3));
      const step = (d1 - d0) / n;
      const cap = (d, f) => { const [x, y] = pt(d); const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', f2(x)); c.setAttribute('cy', f2(y)); c.setAttribute('r', '3.6'); c.setAttribute('fill', colorAt(f)); c.setAttribute('class', `${cls}-cap`); return c; };
      out.push(cap(d0, f0));
      for (let i = 0; i < n; i++) {
        const a = d0 + i * step, b = Math.min(d1, a + step + (i < n - 1 ? 0.8 : 0));
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', arc(a, b)); p.setAttribute('fill', 'none'); p.setAttribute('class', cls);
        p.setAttribute('stroke', colorAt(f0 + ((f1 - f0) * (i + 0.5)) / n));
        out.push(p);
      }
      out.push(cap(d1, f1));
      g.replaceChildren(...out);
    }

    const fmt = (v, d) => {
      const dec = finite(d) ? clamp(Math.round(Number(d)), 0, 2) : Math.min(1, (String(v).split('.')[1] || '').length);
      return Number(v).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    };
    const fmtLim = (v) => (Math.abs(v) >= 1000 ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(Math.round(v * 10) / 10));
    const plain = (v, max) => (v === null || v === undefined ? '' : String(v).slice(0, max));

    function render() {
      const raw = s.value;
      const na = s.available === false || String(raw).toLowerCase() === 'unavailable';
      const unknown = !na && (raw === null || raw === undefined || raw === '' || String(raw).toLowerCase() === 'unknown');
      const numeric = !na && !unknown && finite(raw);
      const v = numeric ? Number(raw) : null;
      const unit = String(s.unit || '').trim();
      const [aLo, aHi] = autoRange(s, v);
      const lo = finite(s.min) ? Number(s.min) : aLo;
      const hi = finite(s.max) && Number(s.max) > lo ? Number(s.max) : (aHi > lo ? aHi : lo + 1);
      const frac = numeric ? clamp((v - lo) / (hi - lo), 0, 1) : 0;     // the arc is clamped; the number is not
      const deg = isTemp(unit, s.deviceClass);
      const limU = deg ? '°' : '';

      root.dataset.state = na ? 'unavailable' : unknown ? 'unknown' : numeric ? 'ok' : 'text';
      root.dataset.out = numeric && (v < lo || v > hi) ? (v < lo ? 'below' : 'above') : '';
      root.dataset.showTicks = String(s.showTicks !== false);
      root.dataset.showMinMax = String(s.showMinMax !== false);
      const left = [plain(s.leftValue, 24), plain(s.leftLabel, 32)], right = [plain(s.rightValue, 24), plain(s.rightLabel, 32)];
      const hasPanel = s.showPanel !== false && (left.some(Boolean) || right.some(Boolean));
      root.dataset.panel = String(hasPanel);
      root.style.setProperty('--ntg-frac', frac.toFixed(4));
      root.style.setProperty('--ntg-tone', numeric ? colorAt(frac) : 'transparent');

      // arc: the active part glows; the rest of the colour scale stays faintly visible ahead of it
      segments($('.ntg__fill'), 0, numeric ? Math.max(frac, 0.003) : 0, 'ntg__seg');
      segments($('.ntg__ghost'), numeric ? frac : 0, 1, 'ntg__gseg');
      const [kx, ky] = pt(A0 + SWEEP * frac);
      $('.ntg__knob').setAttribute('transform', `translate(${f2(kx)} ${f2(ky)})`);
      $('.ntg__knob').style.display = numeric ? '' : 'none';
      ticks.querySelectorAll('.ntg__tick').forEach((t) => t.classList.toggle('is-on', numeric && Number(t.dataset.f) <= frac + 1e-6));

      // value + caption
      const text = na ? '—' : unknown ? '—' : numeric ? fmt(raw, s.decimals) : String(raw);
      $('.ntg__num').textContent = numeric ? text : text.length > 9 ? `${text.slice(0, 8)}…` : text;
      // a temperature reads "20°" (as on a thermostat); other units follow the number in small type
      $('.ntg__unit').textContent = numeric ? (deg ? '°' : unit ? ` ${unit}` : '') : '';
      $('.ntg__unit').classList.toggle('ntg__unit--deg', deg);
      // outside a configured range: the arc stops at its end, the caption says so (the number stays the real value)
      const out = root.dataset.out;
      $('.ntg__cap').textContent = na ? 'Unavailable' : unknown ? 'Unknown' : out ? `${out === 'below' ? 'Below' : 'Above'} ${fmtLim(out === 'below' ? lo : hi)}${limU || (unit ? ` ${unit}` : '')}` : plain(s.label || s.name || '', 40);
      $('.ntg__lim--min').textContent = `${fmtLim(lo)}${limU}`;
      $('.ntg__lim--max').textContent = `${fmtLim(hi)}${limU}`;
      $('.ntg__lim--mid').textContent = `${fmtLim((lo + hi) / 2)}${limU}`;

      const cells = [[$('.ntg__cell--l'), left], [$('.ntg__cell--r'), right]];
      cells.forEach(([c, [pv, pl]]) => { c.querySelector('.ntg__pv').textContent = pv; c.querySelector('.ntg__pl').textContent = pl; c.hidden = !pv && !pl; });
      $('.ntg__sep').hidden = !(left.some(Boolean) && right.some(Boolean));

      const full = unit ? `${text} ${unit}` : text;
      root.setAttribute('aria-label', `${s.name || s.label || 'Temperature'}: ${numeric ? `${full} (range ${fmtLim(lo)} to ${fmtLim(hi)}${unit ? ` ${unit}` : ''})` : na ? 'unavailable' : unknown ? 'unknown' : text}`);
      if (numeric) { root.setAttribute('aria-valuenow', String(v)); root.setAttribute('aria-valuemin', String(lo)); root.setAttribute('aria-valuemax', String(hi)); }
      else ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'].forEach((a) => root.removeAttribute(a));
      root.title = numeric ? full : '';
    }

    /** the internal arrangement for the widget's own box (w × h in layout px) */
    function arrange(w, h) {
      const panel = root.dataset.panel === 'true';
      if (w < 150 || h < 140) return 'mini';
      if (panel && w >= 300 && h >= 150 && w >= h * 1.45) return 'side';
      if (panel) return w >= 250 && h >= 330 ? 'full' : w >= 170 && h >= 235 ? 'compact' : 'small';
      return w >= 250 && h >= 250 ? 'full' : w >= 170 && h >= 170 ? 'compact' : 'small';
    }

    render();
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange });
    // the shared 'gauge' state contract (IniqHA binding, demo pages)
    root.gauge = {
      getState: () => ({ value: s.value, state: root.dataset.state, frac: Number(root.style.getPropertyValue('--ntg-frac')) }),
      setState(patch) {
        const panelBefore = root.dataset.panel;
        s = { ...s, ...(patch || {}) }; render();
        if (root.dataset.panel !== panelBefore && global.MaisonFit?.refresh) global.MaisonFit.refresh(root);
      },
    };
    return root;
  }

  /** Smallest usable area: 2 × 2 (the value inside a plain ring). */
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }; }

  /** The registry entry for this custom type, built with the shared field vocabulary (kit.F).
      Stored configuration: plain JSON — the entity id at most, never anything about the connection. */
  function define({ F }) {
    const ui = (key, label, extra = {}) => F.text(key, label, 'appearance', { maxLength: 24, ...extra });
    return {
      label: 'Neon Temperature Gauge',
      description: 'Custom · a dark thermostat-style dial with an illuminated cyan-to-red ring, the value in a raised centre and a two-value information panel.',
      glyph: '<circle cx="12" cy="12.5" r="8.5"/><circle cx="12" cy="12.5" r="4.2"/><path d="M6.4 18.6a8.5 8.5 0 0 1 2-12.6"/>',
      size: { w: 3, h: 8 },
      defaults: { name: 'Living Room', label: 'Temperature', value: 20, unit: '°C', decimals: 0, showTicks: true, showMinMax: true, showPanel: true,
        leftValue: '69m²', leftLabel: 'First floor', rightValue: '46m', rightLabel: 'Time', available: true },
      fields: [
        F.name('Display name'),
        { ...F.entity('gauge', (c) => { c.unit = ''; delete c.min; delete c.max; }),
          help: 'A temperature entity (device class temperature). Linked: its live value; unit and range come from Home Assistant unless set below.' },
        F.text('label', 'Caption', 'identity', { maxLength: 40, placeholder: 'Temperature', help: 'The small text under the value (empty: the display name)' }),
        { key: 'value', type: 'number', label: 'Value (demo)', group: 'data', step: 0.1, optional: true, when: (c) => !c.entity },
        F.text('unit', 'Unit', 'appearance', { optional: false, maxLength: 12, placeholder: 'Auto', help: 'Linked: empty = the entity’s own unit; anything typed here overrides it' }),
        F.num('min', 'Minimum', 'data', { step: 0.5, placeholder: 'Auto', help: 'Empty = automatic (10 – 30 °C for a room temperature)' }),
        F.num('max', 'Maximum', 'data', { step: 0.5, placeholder: 'Auto' }),
        { key: 'decimals', type: 'number', label: 'Decimals', group: 'appearance', optional: true, min: 0, max: 2, integer: true },
        { key: 'showTicks', type: 'boolean', label: 'Show tick marks', group: 'appearance' },
        { key: 'showMinMax', type: 'boolean', label: 'Show scale labels', group: 'appearance' },
        { key: 'showPanel', type: 'boolean', label: 'Show information panel', group: 'appearance' },
        ui('leftValue', 'Left value', { when: (c) => c.showPanel !== false, placeholder: 'e.g. 69m²' }),
        ui('leftLabel', 'Left label', { when: (c) => c.showPanel !== false, maxLength: 32 }),
        ui('rightValue', 'Right value', { when: (c) => c.showPanel !== false, placeholder: 'e.g. 46m' }),
        ui('rightLabel', 'Right label', { when: (c) => c.showPanel !== false, maxLength: 32 }),
        F.available(),
      ],
      validate(c) {
        const n = (v) => typeof v === 'number' && Number.isFinite(v);
        return n(c.min) && n(c.max) && c.max <= c.min ? [{ key: 'max', message: 'Maximum must be above minimum' }] : [];
      },
    };
  }

  global.IniqNeonTemperatureGauge = { create, constraints, define, autoRange, colorAt };
})(window);
