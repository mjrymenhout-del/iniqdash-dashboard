/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Weather Widget V1 — current conditions + optional details + optional short forecast.
   Data is supplied (later: a Home Assistant weather entity); the widget makes no requests.

   MaisonWeather.create(config) → HTMLElement (.wx), with el.weather = { getState(), setState(patch) }

   config = {
     id, location:   'Home'
     condition:      'clear' | 'clear-night' | 'partly-cloudy' | 'partly-cloudy-night' | 'cloudy' | 'fog' |
                     'rain' | 'showers' | 'thunder' | 'snow' | 'sleet' | 'wind'   (else: shown as unknown)
     conditionLabel: 'Partly cloudy'   (optional; default from the condition key)
     temperature:    14       unit: '°'      precision: 0
     feelsLike, high, low:     numbers (optional)
     humidity:       72        (%, optional)
     wind:           '12 km/h SW' or { speed: 12, unit: 'km/h', direction: 'SW' }   (optional)
     precipitation:  '20%' or { value: 20, unit: '%' }   (optional)
     forecast:       [{ label: 'Thu', condition: 'rain', high: 13, low: 7, precipitation: 60 }]   (optional)
                     (an hourly entry: { label: '14:00', condition, temperature, precipitation })
     forecastNote:   optional text shown in the forecast's place while there is none to show ("Loading forecast…",
                     "Forecast unavailable") — never replaced by made-up entries
     available:      true
     variant:        'standard' (as always) | 'current' (current conditions + details, no forecast) | 'daily' (the forecast as a LIST:
                     glyph · day + date · condition · rain chance · low / high) | 'compact' (current + the next 3 days) | 'detailed'
                     (current + details + the forecast list)   — the registry's shared Variant system resolves it
     forecastRows:   the list variants: rows shown before the shared Expandable List's arrow reveals the rest (1–10, default 3) —
                     the rest scrolls inside the widget's own box (never over its neighbours)
   }
   Forecast entries may carry `date` (a real date from Home Assistant's forecast — never invented): the list shows it under the day.
   ========================================================================== */
(function (global) {
  'use strict';

  /* weather glyphs: drawn from a few primitives in a 64×64 box (no image requests) */
  const P = {
    sun: (cx = 24, cy = 24, r = 10) => `<g class="wx-sun"><circle cx="${cx}" cy="${cy}" r="${r}"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const t = (a * Math.PI) / 180, r1 = r + 4, r2 = r + 9;
      return `<line x1="${(cx + r1 * Math.cos(t)).toFixed(1)}" y1="${(cy + r1 * Math.sin(t)).toFixed(1)}" x2="${(cx + r2 * Math.cos(t)).toFixed(1)}" y2="${(cy + r2 * Math.sin(t)).toFixed(1)}"/>`;
    }).join('')}</g>`,
    moon: (cx = 24, cy = 24) => `<path class="wx-moon" d="M${cx + 8} ${cy + 9}A13 13 0 1 1 ${cx - 2} ${cy - 13}a10 10 0 0 0 ${10} ${22}z"/>`,
    cloud: (dx = 0, dy = 0, cls = 'wx-cloud') => `<path class="${cls}" transform="translate(${dx} ${dy})" d="M20 48h26a10 10 0 0 0 1.5-19.9A13 13 0 0 0 22.4 25 11.5 11.5 0 0 0 20 48z"/>`,
    rain: (n = 3) => `<g class="wx-rain">${[22, 32, 42].slice(0, n).map((x) => `<line x1="${x}" y1="52" x2="${x - 3}" y2="60"/>`).join('')}</g>`,
    snow: () => `<g class="wx-snow">${[[22, 55], [32, 58], [42, 55]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2"/>`).join('')}</g>`,
    bolt: () => '<path class="wx-bolt" d="M33 46l-7 10h6l-3 8 9-12h-6l3-6z"/>',
    fog: () => `<g class="wx-fog">${[44, 51, 58].map((y, i) => `<line x1="${12 + i * 3}" y1="${y}" x2="${52 - i * 2}" y2="${y}"/>`).join('')}</g>`,
    wind: () => '<g class="wx-wind"><path d="M8 26h30a6 6 0 1 0-6-6"/><path d="M8 36h40a6 6 0 1 1-6 6"/><path d="M8 46h22"/></g>',
  };
  const GLYPH = {
    clear: () => P.sun(32, 32, 12),
    'clear-night': () => P.moon(32, 30),
    'partly-cloudy': () => P.sun(24, 22, 9) + P.cloud(4, 4),
    'partly-cloudy-night': () => P.moon(26, 22) + P.cloud(4, 6),
    cloudy: () => P.cloud(-6, -4, 'wx-cloud wx-cloud--back') + P.cloud(4, 4),
    fog: () => P.cloud(0, -8) + P.fog(),
    rain: () => P.cloud(0, -6) + P.rain(3),
    showers: () => P.sun(22, 18, 8) + P.cloud(4, -2) + P.rain(2),
    thunder: () => P.cloud(0, -8) + P.bolt(),
    snow: () => P.cloud(0, -8) + P.snow(),
    sleet: () => P.cloud(0, -8) + P.rain(2) + '<circle class="wx-snow" cx="42" cy="56" r="2.2"/>',
    wind: () => P.wind(),
    unknown: () => P.cloud(0, 0, 'wx-cloud wx-cloud--unknown'),
  };
  const LABEL = {
    clear: 'Clear', 'clear-night': 'Clear night', 'partly-cloudy': 'Partly cloudy', 'partly-cloudy-night': 'Partly cloudy',
    cloudy: 'Cloudy', fog: 'Fog', rain: 'Rain', showers: 'Showers', thunder: 'Thunderstorm', snow: 'Snow', sleet: 'Sleet', wind: 'Windy', unknown: 'Unknown',
  };
  const svg = (cond, cls) => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">${(GLYPH[cond] || GLYPH.unknown)()}</svg>`;
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

  const VARIANTS = ['standard', 'current', 'daily', 'compact', 'detailed'];
  const LIST = ['daily', 'detailed'];
  function create(config) {
    let s = { available: true, unit: '°', precision: 0, forecast: [], ...(config || {}) };
    const root = document.createElement('article');
    root.className = 'wx';
    if (s.id) root.dataset.weatherId = s.id;
    root.innerHTML = `
      <div class="wx__in">
        <div class="wx__now">
          <span class="wx__glyph"></span>
          <p class="wx__temp"></p>
          <p class="wx__cond"></p>
          <p class="wx__loc"></p>
        </div>
        <dl class="wx__stats"></dl>
        <ol class="wx__fc" aria-label="Forecast"></ol>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const t = (v) => { const n = num(v); return n === null ? null : `${n.toFixed(s.precision)}${s.unit}`; };

    function render() {
      const cond = GLYPH[s.condition] ? s.condition : 'unknown';
      const ok = s.available !== false && num(s.temperature) !== null;
      root.dataset.state = ok ? 'ok' : 'unavailable';
      root.dataset.condition = ok ? cond : 'unknown';
      $('.wx__glyph').innerHTML = svg(ok ? cond : 'unknown', 'wx__svg');
      const temp = ok ? t(s.temperature) : '—';
      $('.wx__temp').textContent = temp;
      $('.wx__cond').textContent = ok ? (s.conditionLabel || LABEL[cond]) : 'Weather unavailable';
      const hl = ok && (num(s.high) !== null || num(s.low) !== null) ? [num(s.high) !== null ? `H ${t(s.high)}` : '', num(s.low) !== null ? `L ${t(s.low)}` : ''].filter(Boolean).join(' · ') : '';
      $('.wx__loc').textContent = [s.location, hl].filter(Boolean).join(' · ');

      // details: only those supplied
      const windTxt = !ok || s.wind == null ? '' : typeof s.wind === 'string' ? s.wind
        : [num(s.wind.speed) !== null ? `${num(s.wind.speed)} ${s.wind.unit || 'km/h'}` : '', s.wind.direction || ''].filter(Boolean).join(' ');
      const precTxt = !ok || s.precipitation == null ? '' : typeof s.precipitation === 'string' ? s.precipitation
        : num(s.precipitation.value) !== null ? `${num(s.precipitation.value)}${s.precipitation.unit ?? ' mm'}` : '';
      const stats = ok ? [
        num(s.feelsLike) !== null && ['Feels like', t(s.feelsLike)],
        num(s.humidity) !== null && ['Humidity', `${Math.round(num(s.humidity))}%`],
        windTxt && ['Wind', windTxt],
        precTxt && ['Rain', precTxt],
        // linked: further details the weather entity itself reports (pressure, UV…) — supplied by the HA binding
        ...(Array.isArray(s.extraStats) ? s.extraStats.filter((x) => Array.isArray(x) && x.length === 2 && x[1] !== '') : []),
      ].filter(Boolean) : [];
      const dl = $('.wx__stats');
      dl.innerHTML = '';
      stats.forEach(([k, v]) => { const d = document.createElement('div'); d.className = 'wx__stat'; d.innerHTML = '<dt></dt><dd></dd>'; d.querySelector('dt').textContent = k; d.querySelector('dd').textContent = v; dl.appendChild(d); });
      root.dataset.hasStats = stats.length ? 'true' : 'false';

      // forecast: only entries with a usable label + temperature; the layout shows as many as fit
      const variant = VARIANTS.includes(s.variant) ? s.variant : 'standard', asList = LIST.includes(variant);
      root.dataset.variant = variant;
      const fc = $('.wx__fc');
      fc.innerHTML = '';
      fc.classList.toggle('wx__fc--list', asList);
      const entries = ok && variant !== 'current' ? (s.forecast || []).filter((f) => f && f.label && (num(f.high) !== null || num(f.temperature) !== null)) : [];
      if (asList) {
        // THE FORECAST LIST: one row per entry — glyph · day (+ its date when Home Assistant gave one) · condition · rain chance · low / high
        entries.forEach((f) => {
          const li = document.createElement('li');
          li.className = 'wx__row';
          const cond = GLYPH[f.condition] ? f.condition : 'unknown', hi = num(f.high) !== null ? f.high : f.temperature, pp = num(f.precipitation);
          li.innerHTML = `${svg(cond, 'wx__row-svg')}<span class="wx__row-d"><b></b><small></small></span><span class="wx__row-c"></span><span class="wx__row-p"></span><span class="wx__row-t"><b></b><small></small></span>`;
          li.querySelector('.wx__row-d b').textContent = f.label;
          li.querySelector('.wx__row-d small').textContent = typeof f.date === 'string' ? f.date : '';
          li.querySelector('.wx__row-c').textContent = LABEL[cond];
          li.querySelector('.wx__row-p').textContent = pp !== null ? `${Math.round(pp)}%` : '';
          li.querySelector('.wx__row-t b').textContent = t(hi) || '';
          li.querySelector('.wx__row-t small').textContent = num(f.low) !== null ? t(f.low) : '';
          li.setAttribute('aria-label', `${f.label}${f.date ? ` ${f.date}` : ''}: ${LABEL[cond]}, ${[t(hi), num(f.low) !== null ? t(f.low) : ''].filter(Boolean).join(' / ')}${pp !== null ? `, ${Math.round(pp)}% rain` : ''}`);
          fc.appendChild(li);
        });
      } else entries.forEach((f) => {
        const li = document.createElement('li');
        li.className = 'wx__day';
        li.innerHTML = `<span class="wx__day-k"></span>${svg(GLYPH[f.condition] ? f.condition : 'unknown', 'wx__day-svg')}<b class="wx__day-t"></b><span class="wx__day-p"></span>`;
        li.querySelector('.wx__day-k').textContent = f.label;
        const hi = num(f.high) !== null ? f.high : f.temperature;
        li.querySelector('.wx__day-t').textContent = [t(hi), num(f.low) !== null ? t(f.low) : ''].filter(Boolean).join(' / ');
        const pp = num(f.precipitation);
        li.querySelector('.wx__day-p').textContent = pp !== null ? `${Math.round(pp)}%` : '';
        li.setAttribute('aria-label', `${f.label}: ${LABEL[f.condition] || 'Unknown'}, ${li.querySelector('.wx__day-t').textContent}${pp !== null ? `, ${Math.round(pp)}% rain` : ''}`);
        fc.appendChild(li);
      });
      const note = ok && variant !== 'current' && !entries.length && typeof s.forecastNote === 'string' ? s.forecastNote : '';
      if (note) { const li = document.createElement('li'); li.className = 'wx__fc-note'; li.textContent = note; fc.appendChild(li); }
      root.dataset.hasForecast = entries.length || note ? 'true' : 'false';
      // the list variants: the first N rows, the shared Expandable List's arrow reveals the rest (inside the widget's own box)
      if (global.IniqExpand) global.IniqExpand.apply(fc, asList && entries.length ? { mode: 'expand', count: Math.max(1, Math.min(10, Math.round(num(s.forecastRows) || 3))), control: 'arrow' } : { mode: 'all' });
      root.setAttribute('aria-label', ok ? `${s.location || 'Weather'}: ${$('.wx__cond').textContent}, ${temp}` : `${s.location || 'Weather'}: unavailable`);
    }

    render();
    root.weather = {
      getState: () => ({ condition: s.condition ?? null, temperature: num(s.temperature), available: s.available !== false }),
      /** External update (later: Home Assistant). */
      setState(patch) { s = { ...s, ...patch }; render(); },
    };
    return root;
  }

  /** minW 2, minH 3 (glyph, temperature, condition, place). The forecast appears only from 480px wide
      and 140px tall; on smaller tiles it is simply not shown. */
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 3 }; }

  global.MaisonWeather = { create, constraints, CONDITIONS: Object.keys(LABEL), VARIANTS };
})(window);
