/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Sensor / Data Widget V1 — one read-only readout for any numeric (or text) value.

   MaisonSensor.create(config) → HTMLElement (.sw), with el.sensor = { getState(), setState(patch) }

   config = {
     id, name:     'living-temp', 'Living Room'
     icon:         'temperature' | 'humidity' | 'co2' | 'power' | 'solar' | 'energy' | 'battery' |
                   'illuminance' | 'pressure' | 'water' | 'gas' | 'signal' | 'generic'  (or raw SVG)
     value:        20.8 | '20.8' | 'unavailable' | 'unknown' | null | a text state ('Clear')
     unit:         '°C'  (display text only — nothing is converted)
     precision:    decimals to show (optional; default: as received, max 2)
     grouping:     true to show 1,260 instead of 1260 (default false)
     status:       'Comfortable'           (text, optional — decided by configuration / HA, not here)
     tone:         'normal' | 'positive' | 'warning' | 'critical' | 'neutral'   (default 'neutral')
     trend:        'up' | 'down' | 'stable' | 'none'                            (given, never inferred)
     secondary:    { label: 'Today', value: 14.2, unit: 'kWh', precision: 1 }  (optional; demo — not used when infoItems are given)
     infoItems:    linked to Home Assistant: resolved Information slots (other HA entities chosen in Settings), read-only:
                   [{ line: 'Phone 64%', … }] — shown as given, never interpreted here
     level:        { min, max }  the range the Level variant draws the value in (from Home Assistant — a %, or the entity's own
                   range — or from your own configuration); none → no bar is drawn, nothing is assumed
     locale:       'en'  (number formatting)
     onActivate:   optional (event, state) => void — makes the whole tile a button (future action);
                   without it the widget is purely informational and not focusable.
   }

   The component never interprets the value: thresholds, "low", "good", tones all come in config.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  /** UI icons (not device artwork). Add entries freely. */
  const ICONS = {
    temperature: S('<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>'),
    humidity: S('<path d="M12 3.5s-6 6.4-6 10.6a6 6 0 0 0 12 0c0-4.2-6-10.6-6-10.6z"/><path d="M9.2 14.6a2.9 2.9 0 0 0 2.8 2.6"/>'),
    co2: S('<path d="M7.5 18.5h9.2a3.8 3.8 0 0 0 .5-7.6 5.6 5.6 0 0 0-10.8 1.1A3.3 3.3 0 0 0 7.5 18.5z"/><path d="M10 13.6h4"/>'),
    power: S('<path d="M13 2.8 5.5 13.4h6l-1 7.8 7.5-10.6h-6z"/>'),
    solar: S('<path d="M4 15.5h16l-2-7H6z"/><path d="M8.7 8.5 8 15.5M15.3 8.5l.7 7M5 12h14"/><path d="M12 15.5V20M9 20h6"/>'),
    energy: S('<rect x="4" y="6.5" width="14" height="11" rx="2.4"/><path d="M18 10.5h2v3h-2"/><path d="m11.5 8.8-2.2 3.6h3.2l-2 3.4"/>'),
    battery: S('<rect x="3.5" y="7.5" width="15" height="9" rx="2.2"/><path d="M21 10.5v3"/><path d="M6.5 10.5v3"/>'),
    illuminance: S('<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>'),
    pressure: S('<circle cx="12" cy="12" r="8.2"/><path d="M12 12 15.6 8.6"/><path d="M7.6 15.5h8.8"/>'),
    water: S('<path d="M12 3.5s-6 6.4-6 10.6a6 6 0 0 0 12 0c0-4.2-6-10.6-6-10.6z"/>'),
    gas: S('<path d="M12.4 3c.3 2.7-1.3 4.2-2.7 5.6C8.3 10 7 11.5 7 14a5 5 0 0 0 10 0c0-1.8-.7-3.2-1.6-4.1-.2 1.1-.8 2-1.7 2.3.3-3-.4-6.4-1.3-9.2z"/>'),
    signal: S('<path d="M5 18.5v-2M9.6 18.5v-5M14.3 18.5v-8M19 18.5v-12"/>'),
    generic: S('<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l2.8 1.8"/>'),
  };
  const TREND = {
    up: { label: 'rising', svg: S('<path d="M12 18V6M6.5 11.5 12 6l5.5 5.5"/>', 'stroke-width="2.3"') },
    down: { label: 'falling', svg: S('<path d="M12 6v12M6.5 12.5 12 18l5.5-5.5"/>', 'stroke-width="2.3"') },
    stable: { label: 'stable', svg: S('<path d="M5.5 12h13M14 7.5l4.5 4.5-4.5 4.5"/>', 'stroke-width="2.3"') },
  };
  const TONES = ['normal', 'positive', 'warning', 'critical', 'neutral'];
  const UNAVAILABLE = new Set(['unavailable', 'unknown', 'none', 'null', 'undefined', 'nan', '']);

  /** → { kind: 'number'|'text'|'unavailable'|'unknown', text } — never "NaN", "null", "undefined". */
  function formatValue(v, { precision, grouping = false, locale = 'en' } = {}) {
    if (v === null || v === undefined) return { kind: 'unavailable', text: '—' };
    if (typeof v === 'string') {
      const t = v.trim();
      if (UNAVAILABLE.has(t.toLowerCase())) return { kind: t.toLowerCase() === 'unknown' ? 'unknown' : 'unavailable', text: '—' };
      if (t !== '' && !Number.isNaN(Number(t))) v = Number(t);
      else return { kind: 'text', text: t };
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) return { kind: 'unavailable', text: '—' };
    const opts = { useGrouping: !!grouping };
    if (precision !== undefined && precision !== null) { opts.minimumFractionDigits = precision; opts.maximumFractionDigits = precision; }
    else opts.maximumFractionDigits = 2;
    return { kind: 'number', text: new Intl.NumberFormat(locale, opts).format(v) };
  }

  function create(config) {
    let s = { tone: 'neutral', trend: 'none', ...(config || {}) };

    const root = document.createElement('article');
    root.className = 'sw';
    if (s.id) root.dataset.sensorId = s.id;
    root.innerHTML = `
      <div class="sw__in">
        <div class="sw__id"><span class="sw__icon"></span><h3 class="sw__name"></h3></div>
        <div class="sw__reading"><span class="sw__value"></span><span class="sw__unit"></span><span class="sw__trend"></span></div>
        <p class="sw__status"><i class="sw__dot" aria-hidden="true"></i><span class="sw__status-t"></span></p>
        <div class="sw__level" role="meter" hidden><i></i></div>
        <div class="sw__secondary"><span class="sw__sec-k"></span><span class="sw__sec-v"></span></div>
      </div>`;
    const $ = (c) => root.querySelector(c);

    if (typeof s.onActivate === 'function') {                // future action hook — not a fake control
      root.tabIndex = 0;
      root.setAttribute('role', 'button');
      root.addEventListener('click', (e) => s.onActivate(e, api.getState()));
      root.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.onActivate(e, api.getState()); } });
    }

    function render() {
      const v = formatValue(s.value, s);
      const avail = v.kind === 'unavailable' || v.kind === 'unknown' ? v.kind : 'ok';
      root.dataset.avail = avail;
      root.dataset.kind = v.kind;
      root.dataset.tone = avail === 'ok' && TONES.includes(s.tone) ? s.tone : 'neutral';

      root.dataset.icon = ICONS[s.icon] ? s.icon : 'generic';
      // an MDI icon (mdi:…) from the shared icon library; else one of the built-in icons
      const ico = $('.sw__icon');
      if (/^mdi:[a-z0-9-]+$/.test(String(s.icon || '')) && global.IniqIcons) { if (ico.dataset.mdi !== s.icon) { ico.innerHTML = ''; ico.dataset.mdi = s.icon; global.IniqIcons.fill(ico); } }
      else { delete ico.dataset.mdi; ico.innerHTML = ICONS[s.icon] || (String(s.icon || '').trim().startsWith('<svg') ? s.icon : ICONS.generic); }
      $('.sw__name').textContent = s.name || 'Sensor';
      $('.sw__name').title = s.name || '';
      $('.sw__value').textContent = v.text;
      $('.sw__unit').textContent = avail === 'ok' && v.kind === 'number' ? (s.unit || '') : '';
      $('.sw__unit').hidden = !$('.sw__unit').textContent;

      const tr = avail === 'ok' ? TREND[s.trend] : null;
      $('.sw__trend').innerHTML = tr ? tr.svg : '';
      $('.sw__trend').hidden = !tr;
      if (tr) $('.sw__trend').setAttribute('aria-label', `Trend: ${tr.label}`); else $('.sw__trend').removeAttribute('aria-label');
      if (tr) $('.sw__trend').setAttribute('role', 'img');
      $('.sw__trend').dataset.trend = tr ? s.trend : 'none';

      const statusText = avail === 'unavailable' ? 'Unavailable' : avail === 'unknown' ? 'Unknown' : (s.status || '');
      $('.sw__status-t').textContent = statusText;
      $('.sw__status').hidden = !statusText;
      root.dataset.hasStatus = statusText ? 'true' : 'false';

      // Level variant: the value inside its range (only a real numeric value inside a real range)
      const lv = $('.sw__level');
      // not given (a demo sensor): a % is 0–100, else the range you configured (levelMin / levelMax) — a linked widget is always given one (or null)
      const given = s.level !== undefined ? s.level : s.unit === '%' ? { min: 0, max: 100 } : { min: s.levelMin, max: s.levelMax };
      const L = given && given.min != null && given.max != null && Number.isFinite(Number(given.min)) && Number.isFinite(Number(given.max)) && Number(given.max) > Number(given.min) ? given : null;
      const frac = L && avail === 'ok' && v.kind === 'number' ? Math.max(0, Math.min(1, (Number(s.value) - Number(L.min)) / (Number(L.max) - Number(L.min)))) : null;
      lv.hidden = frac === null;
      root.dataset.hasLevel = frac === null ? 'false' : 'true';
      if (frac !== null) {
        lv.firstElementChild.style.width = `${(frac * 100).toFixed(1)}%`;
        lv.setAttribute('aria-valuemin', String(L.min)); lv.setAttribute('aria-valuemax', String(L.max)); lv.setAttribute('aria-valuenow', String(Number(s.value)));
        lv.setAttribute('aria-label', `${s.name || 'Sensor'} level`);
      }

      // linked: the secondary row shows real Information slot values ("Today 14.2 kWh" from its own HA entity)
      const items = Array.isArray(s.infoItems) ? s.infoItems.filter((x) => x && x.line) : null;
      const sec = !s.infoItems && s.secondary && (s.secondary.label || s.secondary.value !== undefined) ? s.secondary : null;
      root.dataset.hasSecondary = sec || (items && items.length) ? 'true' : 'false';
      $('.sw__secondary').hidden = !(sec || (items && items.length));
      if (items && items.length) {
        const one = items.length === 1 && items[0].label;
        $('.sw__sec-k').textContent = one ? items[0].label : '';
        $('.sw__sec-v').innerHTML = '';
        const b = document.createElement('b');
        b.textContent = one ? items[0].text : items.map((x) => x.line).join(' · ');
        $('.sw__sec-v').appendChild(b);
      } else if (sec) {
        const sv = formatValue(sec.value, { locale: s.locale, grouping: s.grouping, ...sec });
        $('.sw__sec-k').textContent = sec.label || '';
        $('.sw__sec-v').innerHTML = '';
        const num = document.createElement('b'); num.textContent = sv.text;
        $('.sw__sec-v').appendChild(num);
        if (sv.kind === 'number' && sec.unit) { const u = document.createElement('small'); u.textContent = sec.unit; $('.sw__sec-v').appendChild(u); }
      }

      // one accessible sentence for the readout
      const parts = [s.name, avail === 'ok' ? `${v.text}${v.kind === 'number' && s.unit ? ' ' + s.unit : ''}` : statusText, avail === 'ok' ? s.status : '', tr ? `trend ${tr.label}` : ''];
      root.setAttribute('aria-label', parts.filter(Boolean).join(', '));
      fitReading();
    }

    /** Scale the value + unit down (never up) when they do not fit their zone: --sw-shrink on .sw__reading. */
    function fitReading() {
      const r = $('.sw__reading');
      if (!r || !root.isConnected) return;
      r.style.removeProperty('--sw-shrink');
      const avail = r.clientWidth, need = r.scrollWidth;
      if (avail > 0 && need > avail + 1) r.style.setProperty('--sw-shrink', Math.max(.35, (avail - 1) / need).toFixed(3));
    }

    const api = {
      getState: () => ({ value: s.value, unit: s.unit, status: s.status, tone: s.tone, trend: s.trend, secondary: s.secondary, level: s.level || null }),
      /** New state from outside (later: Home Assistant). */
      setState(patch) { s = { ...s, ...patch }; render(); },
    };
    render();
    root.sensor = api;
    // Widget responsiveness: the arrangement follows the widget's own box (never the screen).
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: arrangement });
    // a long reading (many digits, a long unit) shrinks to its zone instead of running out of the widget
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitReading()).observe(root);
    return root;
  }

  /** Internal arrangement for a w × h box (MaisonFit) — the same steps sensor.css uses (by width AND height):
      wide (≥ 480 wide, < 240 tall: one instrument line) · hero (≥ 260 wide, ≥ 240 tall: the value is the poster)
      · standard (≥ 260 wide) · compact */
  function arrangement(w, h = 0) { return w >= 480 && h < 240 ? 'wide' : w >= 260 && h >= 240 ? 'hero' : w >= 260 ? 'standard' : 'compact'; }

  /** Smallest usable grid area: 2 × 2 everywhere. At h2 (≈ 92px) the widget shows name + value
      (MaisonFit drops the status line / secondary value by height); h3+ brings them back. */
  function constraints() {
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 };
  }

  global.MaisonSensor = { create, constraints, arrangement, formatValue, ICONS, TONES };
})(window);
