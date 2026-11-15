/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Gauge / Meter Widget V1 — ONE generic numeric widget (temperature, humidity, battery, power,
   CO2, pressure, water… are configurations, not separate widgets).

   MaisonGauge.create(config) → HTMLElement (.gg), with el.gauge = { getState(), setState(patch) }
   config = {
     id, name
     value:        number | numeric string | text state ('unavailable', 'unknown', 'on'…)
     unit:         '' → none                        (Home Assistant: its unit unless overridden)
     min, max:     numbers, optional               (missing → automatic, see autoRange)
     autoMin/autoMax  the entity's own range when it has one (input_number / number)
     deviceClass:  HA device class, only used for the automatic range
     decimals:     0–3, optional                    (missing → as received, max 2)
     style:        'arc' | 'hbar' | 'vbar' | 'value'
     showValue, showUnit, showMinMax:  booleans (default true)
     thresholds:   'none' | 'rising' (higher is worse) | 'falling' (lower is worse)
     warning, critical:  numbers                    PRESENTATION ONLY: they colour the gauge,
                                                    nothing else (no automation, no backend logic)
     available:    true
   }
   Responsive (MaisonFit): the arc is an SVG whose diameter follows the free area; stroke, labels
   and typography switch per arrangement (mini / full; bars: row / stack), never by screen size.
   ========================================================================== */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const STYLES = ['arc', 'hbar', 'vbar', 'value'];
  const finite = (v) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v));

  /** a "nice" upper bound: 1, 2, 2.5, 5 × 10^n */
  function nice(v) {
    if (!(v > 0)) return 10;
    const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  /** Automatic range when min / max are not configured: the entity's own range (input_number),
      else a range that is normal for its unit / device class, else 0 … a round number above the
      value. Always overridable in the configuration. */
  function autoRange(s, v) {
    if (finite(s.autoMin) && finite(s.autoMax) && Number(s.autoMax) > Number(s.autoMin)) return [Number(s.autoMin), Number(s.autoMax)];
    const u = String(s.unit || '').trim(), dc = s.deviceClass || '';
    if (u === '%') return [0, 100];
    if (u === '°C' || (dc === 'temperature' && u !== '°F')) return [-10, 40];
    if (u === '°F') return [14, 104];
    if (u === 'ppm' || dc === 'carbon_dioxide') return [400, 2000];
    if (u === 'hPa' || u === 'mbar') return [950, 1050];
    if (u === 'bar') return [0, 4];
    if (u === 'psi') return [0, 60];
    const a = Math.abs(finite(v) ? Number(v) : 0);
    const top = nice(Math.max(a * 1.25, 1));
    return [finite(v) && Number(v) < 0 ? -top : 0, top];
  }

  function create(config) {
    let s = { style: 'arc', unit: '', showValue: true, showUnit: true, showMinMax: true, thresholds: 'none', available: true, ...(config || {}) };
    const root = document.createElement('article');
    root.className = 'gg';
    if (s.id) root.dataset.gaugeId = s.id;
    root.innerHTML = `
      <div class="gg__in">
        <h3 class="gg__name"></h3>
        <div class="gg__body">
          <svg class="gg__arc" viewBox="0 0 200 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <path class="gg__track" fill="none"/><g class="gg__bands"></g><path class="gg__fill" fill="none"/>
            <text class="gg__val" x="100" y="100" text-anchor="middle"></text>
            <text class="gg__unit" x="100" y="124" text-anchor="middle"></text>
            <text class="gg__lim gg__lim--min" text-anchor="middle"></text><text class="gg__lim gg__lim--max" text-anchor="middle"></text>
          </svg>
          <div class="gg__readout"><b class="gg__num"></b><span class="gg__u"></span></div>
          <div class="gg__bar"><div class="gg__barbands"></div><div class="gg__barfill"></div></div>
          <div class="gg__lims"><span class="gg__lo"></span><span class="gg__hi"></span></div>
        </div>
        <p class="gg__note"></p>
      </div>`;
    const $ = (q) => root.querySelector(q);

    /* ---- arc geometry: 240° sweep, centre (100, 92), radius 74 */
    const CX = 100, CY = 92, R = 74, A0 = -210, SWEEP = 240;
    const pt = (deg) => { const r = (deg * Math.PI) / 180; return [CX + R * Math.cos(r), CY + R * Math.sin(r)]; };
    const arcPath = (f0, f1) => {
      const a = A0 + SWEEP * f0, b = A0 + SWEEP * f1;
      if (b - a < 0.01) return '';
      const [x0, y0] = pt(a), [x1, y1] = pt(b);
      return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    };
    $('.gg__track').setAttribute('d', arcPath(0, 1));
    const [mx0, my0] = pt(A0), [mx1, my1] = pt(A0 + SWEEP);
    Object.entries({ '.gg__lim--min': [mx0, my0], '.gg__lim--max': [mx1, my1] }).forEach(([q, [x, y]]) => { $(q).setAttribute('x', x.toFixed(1)); $(q).setAttribute('y', (y + 22).toFixed(1)); });

    const fmt = (v, d) => {
      const n = Number(v);
      const dec = finite(d) ? Math.max(0, Math.min(3, Number(d))) : Math.min(2, (String(v).split('.')[1] || '').length);
      return n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    };
    const fmtLim = (v) => (Math.abs(v) >= 1000 ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(Math.round(v * 100) / 100));

    /** the colour band a value falls in (presentation only) */
    function toneOf(v, lo, hi) {
      if (s.thresholds !== 'rising' && s.thresholds !== 'falling') return 'plain';
      const w = finite(s.warning) ? Number(s.warning) : null, c = finite(s.critical) ? Number(s.critical) : null;
      if (s.thresholds === 'rising') return c !== null && v >= c ? 'critical' : w !== null && v >= w ? 'warning' : 'normal';
      return c !== null && v <= c ? 'critical' : w !== null && v <= w ? 'warning' : 'normal';
    }
    /** threshold zones as fractions of the range: [[f0, f1, tone]] */
    function zones(lo, hi) {
      if (s.thresholds !== 'rising' && s.thresholds !== 'falling') return [];
      const f = (v) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
      const w = finite(s.warning) ? f(Number(s.warning)) : null, c = finite(s.critical) ? f(Number(s.critical)) : null;
      if (s.thresholds === 'rising') return [w !== null ? [w, c ?? 1, 'warning'] : null, c !== null ? [c, 1, 'critical'] : null].filter(Boolean);
      return [c !== null ? [0, c, 'critical'] : null, w !== null ? [c ?? 0, w, 'warning'] : null].filter(Boolean);
    }

    function render() {
      const style = STYLES.includes(s.style) ? s.style : 'arc';
      const raw = s.value;
      const na = s.available === false || String(raw).toLowerCase() === 'unavailable';
      const unknown = !na && (raw === null || raw === undefined || raw === '' || String(raw).toLowerCase() === 'unknown');
      const numeric = !na && !unknown && finite(raw);
      const v = numeric ? Number(raw) : null;
      const [aLo, aHi] = autoRange(s, v);
      const lo = finite(s.min) ? Number(s.min) : aLo;
      const hi = finite(s.max) && Number(s.max) > lo ? Number(s.max) : (aHi > lo ? aHi : lo + 1);
      const frac = numeric ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 0;
      const tone = numeric ? toneOf(v, lo, hi) : 'none';
      const unit = s.showUnit === false ? '' : String(s.unit || '');
      const text = na ? 'Unavailable' : unknown ? 'Unknown' : numeric ? fmt(raw, s.decimals) : String(raw);

      root.dataset.style = style;
      root.dataset.state = na ? 'unavailable' : unknown ? 'unknown' : numeric ? 'ok' : 'text';
      root.dataset.tone = tone;
      root.dataset.range = finite(s.min) || finite(s.max) ? 'set' : 'auto';
      root.dataset.out = numeric && (v < lo || v > hi) ? (v < lo ? 'below' : 'above') : '';
      root.dataset.showValue = String(s.showValue !== false);
      root.dataset.showMinMax = String(s.showMinMax !== false);
      root.style.setProperty('--gg-frac', frac.toFixed(4));
      $('.gg__name').textContent = s.name || '';
      $('.gg__name').hidden = !s.name;

      // arc
      $('.gg__fill').setAttribute('d', numeric ? arcPath(0, Math.max(frac, 0.004)) : '');
      $('.gg__bands').replaceChildren(...zones(lo, hi).map(([a, b, t]) => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', arcPath(a, b)); p.setAttribute('class', `gg__band gg__band--${t}`); p.setAttribute('fill', 'none');
        return p;
      }));
      $('.gg__val').textContent = numeric ? text : na ? '—' : text.length > 10 ? `${text.slice(0, 9)}…` : text;
      $('.gg__unit').textContent = numeric ? unit : na ? 'Unavailable' : unknown ? '' : '';
      $('.gg__lim--min').textContent = fmtLim(lo);
      $('.gg__lim--max').textContent = fmtLim(hi);
      // bars / value
      $('.gg__num').textContent = numeric ? text : na ? '—' : text;
      $('.gg__u').textContent = numeric ? unit : '';
      $('.gg__barbands').replaceChildren(...zones(lo, hi).map(([a, b, t]) => {
        const d = document.createElement('i');
        d.className = `gg__bb gg__bb--${t}`;
        d.style.setProperty('--a', a); d.style.setProperty('--b', b);
        return d;
      }));
      $('.gg__lo').textContent = fmtLim(lo);
      $('.gg__hi').textContent = fmtLim(hi);
      $('.gg__note').textContent = na ? 'Unavailable' : unknown ? 'Unknown' : !numeric ? 'Not a number' : root.dataset.out ? `Outside ${fmtLim(lo)} – ${fmtLim(hi)}` : '';
      root.setAttribute('aria-label', `${s.name || 'Gauge'}: ${numeric ? `${text}${unit ? ` ${unit}` : ''} (range ${fmtLim(lo)} to ${fmtLim(hi)})` : text}${tone === 'warning' || tone === 'critical' ? `, ${tone}` : ''}`);
    }

    root.setAttribute('role', 'meter');
    render();
    if (global.MaisonFit) {
      global.MaisonFit.observe(root, {
        arrange: (w, h) => {
          const st = STYLES.includes(s.style) ? s.style : 'arc';
          if (st === 'vbar') return w < 150 ? 'vbar-stack' : 'vbar-row';
          if (st === 'hbar') return h < 96 ? 'hbar-row' : 'hbar-stack';
          return w < 150 || h < 120 ? 'mini' : 'full';
        },
      });
    }
    root.gauge = {
      getState: () => ({ value: s.value, tone: root.dataset.tone, state: root.dataset.state }),
      /** external update (Home Assistant through IniqHA, or demo) */
      setState(patch) {
        const restyle = patch.style !== undefined && patch.style !== s.style;
        s = { ...s, ...patch }; render();
        if (restyle && global.MaisonFit?.refresh) global.MaisonFit.refresh(root);
      },
    };
    return root;
  }

  /** Smallest usable area: 2 × 2 (a value with a small arc or bar). */
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }; }

  global.MaisonGauge = { create, constraints, autoRange, STYLES };
})(window);
