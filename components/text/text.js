/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqText — Widget Studio's VALUE / TEXT PRIMITIVE (docs/WIDGET-STUDIO-POC.md, "Value / Text"): one line of text in its box — either
   STATIC text ("Room", "Target", "°C") or ONE value ("21.5", "48%") with its formatting (prefix · suffix · decimals · fallback) — and its
   typography and optional background. No icon, no label, no domain: a thermostat's "21.5", "°C", "Room" and "Target 23°" are four of
   these, placed by the designer (on top of a Dial if they like).

   IniqText.create(config, data, box) → <div class="iqtx"> ; IniqText.update(el, config, data, box) ; IniqText.format(config, data) → text
     data: { value (a number or text — the preview, or Home Assistant's), status: 'ready' | 'unavailable' | 'missing' | 'loading' }
   CONFIG  mode 'static' | 'value' · text · prefix · suffix · decimals (0–4; unset: as reported) · fallback ('—')
           fontSize (px; unset: from the box) · fontWeight · color · opacity (%) · align 'left' | 'center' | 'right' · valign 'top' | 'middle' | 'bottom'
           font ('theme': the dashboard theme's font; else a named theme font — MaisonTheme.FONTS, never a free CSS value) · wrap (up to 3
           lines, else one line with an ellipsis) · shadow (a soft dark text shadow, for text over a picture)
           lineHeight · letterSpacing (px) · background 'none' | 'soft' | 'solid' · bgColor · bgOpacity (%) · padding (px) · radius (px)
   ========================================================================== */
(function (global) {
  'use strict';

  const HEX = /^#[0-9a-fA-F]{6}$/, TOKENS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];
  const colour = (v, fb) => (typeof v === 'string' ? (HEX.test(v) ? v.toLowerCase() : TOKENS.includes(v) ? `var(--${v})` : fb) : fb);
  const n = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const plain = (v, max) => String(v ?? '').replace(/[\x00-\x1f]/g, '').slice(0, max);
  const RUN_MAX = 8;
  const numeric = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));

  /** the text it shows: static text, or prefix + the value (formatted) + suffix — the fallback when there is no value */
  /** a time in a chosen FORMAT (the viewer's language); relative: how long ago ("2hr 19min"); mmss: seconds as m:ss */
  const DATE = { weekday: { weekday: 'short' }, weekdayLong: { weekday: 'long' }, day: { day: 'numeric' }, month: { month: 'short' }, time: { hour: '2-digit', minute: '2-digit' },
    time12: { hour: 'numeric', minute: '2-digit', hour12: true }, date: { day: 'numeric', month: 'short' }, datetime: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
    dayDate: { weekday: 'short', month: 'short', day: 'numeric' }, longDate: { weekday: 'long', day: 'numeric', month: 'long' } };
  function when(fmt, t) {
    if (fmt === 'dotted') return `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}.${String(t.getFullYear()).slice(2)}`;
    if (fmt === 'relative') { const m = Math.max(0, Math.round((Date.now() - t.getTime()) / 60000)), h = Math.floor(m / 60), dd = Math.floor(h / 24);
      return dd >= 1 ? `${dd}d ${h % 24}hr` : h >= 1 ? `${h}hr ${m % 60}min` : `${m}min`; }
    return t.toLocaleString(undefined, DATE[fmt] || DATE.datetime);
  }
  const FORMATS = ['weekday', 'weekdayLong', 'day', 'month', 'time', 'time12', 'date', 'datetime', 'dayDate', 'longDate', 'dotted', 'relative'];
  function format(c = {}, d = {}) {
    if (c.mode === 'clock') { const pre = plain(c.prefix, 24), suf = plain(c.suffix, 24); return `${pre}${when(FORMATS.includes(c.date) ? c.date : 'time', new Date())}${suf}`; }
    if (c.mode !== 'value') return plain(c.text, 120);
    const fallback = typeof c.fallback === 'string' ? plain(c.fallback, 24) : '—';
    const v = d.value, bad = v === null || v === undefined || v === '' || ['unavailable', 'missing'].includes(d.status);
    if (bad) return fallback;
    let t;
    // a DATE / TIME value (an ISO timestamp — e.g. a calendar's start_time): shown as one part of it, in the viewer's language
    const at = FORMATS.includes(c.date) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(v.length === 10 ? `${v}T00:00:00` : v.replace(' ', 'T')) : null;
    if (at && !Number.isNaN(at.getTime())) t = when(c.date, at);
    else if (c.date === 'mmss' && numeric(v)) { const sec = Math.max(0, Math.round(Number(v))); t = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
    else if (numeric(v)) {
      const x = Number(v) * (typeof c.factor === 'number' && Number.isFinite(c.factor) && c.factor !== 0 ? c.factor : 1), dec = n(c.decimals, 0, 4, null);
      t = dec === null ? String(Math.round(x * 1e6) / 1e6) : x.toFixed(dec);
    } else t = plain(v, 60);
    const pre = plain(c.prefix, 24), suf = plain(c.suffix, 24);
    return `${pre}${pre && !/\s$/.test(pre) ? ' ' : ''}${t}${suf}`;
  }
  const FONTS = () => (global.MaisonTheme && global.MaisonTheme.FONTS) || {};
  /** a named font's stack ('theme' / unknown: inherited — the dashboard theme's font) */
  const fontOf = (k) => (typeof k === 'string' && k !== 'theme' && FONTS()[k] && FONTS()[k].stack ? FONTS()[k].stack : '');
  function paint(el, c = {}, d = {}, box = null) {
    el.__c = c; el.__d = d;
    const h = Math.max(1, Number(box && box.h) || 40);
    const span = el.firstElementChild;
    span.textContent = format(c, d);
    // RICH TEXT: more pieces after the text, each with its own colour, weight, size, italic and baseline (superscript m², "Energy Saving")
    (Array.isArray(c.runs) ? c.runs : []).slice(0, RUN_MAX).filter((r) => r && typeof r === 'object').forEach((r) => {
      const s2 = document.createElement('span');
      s2.className = 'iqtx__r'; s2.textContent = plain(r.text, 80);
      const base = pick(r.baseline, ['normal', 'super', 'sub'], 'normal'), size = n(r.size, 20, 400, base === 'normal' ? 100 : 60);
      Object.assign(s2.style, { color: r.color ? colour(r.color, '') : '', fontWeight: r.weight ? String(pick(Number(r.weight), [300, 400, 500, 600, 700, 800], 500)) : '',
        fontStyle: r.italic === true ? 'italic' : '', fontSize: size === 100 ? '' : `${size}%`, verticalAlign: base === 'normal' ? '' : base === 'super' ? 'super' : 'sub',
        lineHeight: base === 'normal' ? '' : '0' });
      span.append(s2);
    });
    const bg = pick(c.background, ['none', 'soft', 'solid'], 'none'), pad = n(c.padding, 0, 80, bg === 'none' ? 0 : 6);
    const auto = Math.max(6, Math.round((h - pad * 2) * 0.62));
    Object.assign(el.style, {
      position: 'absolute', inset: '0', display: 'flex', boxSizing: 'border-box', padding: `${pad}px`,
      justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[pick(c.align, ['left', 'center', 'right'], 'center')],
      alignItems: { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[pick(c.valign, ['top', 'middle', 'bottom'], 'middle')],
      textAlign: pick(c.align, ['left', 'center', 'right'], 'center'),
      fontSize: `${n(c.fontSize, 4, 400, auto)}px`, fontWeight: String(pick(Number(c.fontWeight), [300, 400, 500, 600, 700, 800], 500)), fontFamily: fontOf(c.font),
      fontStyle: c.italic === true ? 'italic' : '',
      textShadow: c.shadow === true ? '0 1px 3px rgba(0, 0, 0, .55), 0 0 12px rgba(0, 0, 0, .25)' : '',
      textTransform: { upper: 'uppercase', lower: 'lowercase', capitalize: 'capitalize' }[c.case] || '',
      lineHeight: String(n(c.lineHeight, 0.6, 3, 1.1)), letterSpacing: `${n(c.letterSpacing, -10, 40, 0)}px`,
      color: colour(c.color, 'var(--text-primary)'), opacity: String(n(c.opacity, 0, 100, 100) / 100),
      borderRadius: `${n(c.radius, 0, 200, bg === 'none' ? 0 : 8)}px`,
      background: bg === 'none' ? 'transparent' : `color-mix(in srgb, ${colour(c.bgColor, 'var(--neutral)')} ${bg === 'soft' ? Math.round(n(c.bgOpacity, 0, 100, 100) * 0.18) : n(c.bgOpacity, 0, 100, 100)}%, transparent)`,
    });
    el.dataset.wrap = c.wrap === true ? 'wrap' : '';
    el.dataset.mode = c.mode === 'value' ? 'value' : 'static';
    el.dataset.state = c.mode === 'value' && ['unavailable', 'missing'].includes(d.status) ? 'unavailable' : 'ready';
  }
  function create(c = {}, d = {}, box = null) {
    const el = document.createElement('div');
    el.className = 'iqtx';
    const span = document.createElement('span');
    span.className = 'iqtx__t';
    el.append(span);
    paint(el, c, d, box);
    // a CLOCK (or a relative time) keeps itself current while it is on the page
    const tick = setInterval(() => { if (!el.isConnected && el.__seen) { clearInterval(tick); return; } if (el.isConnected) el.__seen = true;
      const cc = el.__c || c; if (cc.mode === 'clock' || cc.date === 'relative') { const sp = el.firstElementChild; const runs = [...sp.querySelectorAll('.iqtx__r')]; sp.textContent = format(cc, el.__d || d); sp.append(...runs); } }, 20000);
    return el;
  }

  /* ---------------------------------------------------------------- the Properties (Widget Studio's form) */
  const opts = (l) => l.map(([value, label]) => ({ value, label }));
  const set = (k) => (o, v) => { if (v === undefined || v === null || v === '') delete o[k]; else o[k] = v; };
  const F = (k, x) => ({ key: k, get: (o) => o[k], set: set(k), ...x });
  const isV = (o) => o.mode === 'value', isVC = (o) => o.mode === 'value' || o.mode === 'clock';
  function fields() {
    return [
      { key: 'mode', type: 'select', label: 'Mode', group: 'ha', options: opts([['static', 'Static text'], ['value', 'Home Assistant property'], ['clock', 'Clock (the current date / time)']]), get: (o) => (['value', 'clock'].includes(o.mode) ? o.mode : 'static'),
        set: (o, v) => { if (v === 'value' || v === 'clock') o.mode = v; else o.mode = 'static'; if (v !== 'value') delete o.binding; if (v === 'clock' && !o.date) o.date = 'time'; } },
      F('text', { type: 'text', label: 'Text', group: 'content', maxLength: 120, optional: true, when: (o) => !isV(o) }),
      F('prefix', { type: 'text', label: 'Prefix', group: 'content', half: true, maxLength: 24, optional: true, when: isVC, placeholder: 'e.g. Target' }),
      F('suffix', { type: 'text', label: 'Suffix', group: 'content', half: true, maxLength: 24, optional: true, when: isVC, placeholder: 'e.g. °C' }),
      F('decimals', { type: 'select', label: 'Decimals', group: 'content', half: true, when: isV, options: opts([['', 'As reported'], ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']]),
        get: (o) => (typeof o.decimals === 'number' ? String(o.decimals) : ''), set: (o, v) => { if (v === '' || v === undefined) delete o.decimals; else o.decimals = Number(v); } }),
      F('factor', { type: 'number', label: 'Multiply by', group: 'content', half: true, when: isV, optional: true, help: 'E.g. 0.001 to show W as kW.' }),
      F('date', { type: 'select', label: 'Show a date / time as', group: 'content', half: true, when: isVC, get: (o) => o.date || (o.mode === 'clock' ? 'time' : 'none'), set: (o, v) => { if (!v || v === 'none') delete o.date; else o.date = v; },
        options: opts([['none', 'Not a date'], ['weekday', 'Weekday (Thu)'], ['weekdayLong', 'Weekday (Thursday)'], ['day', 'Day (5)'], ['month', 'Month (Nov)'], ['date', 'Date (5 Nov)'],
          ['dayDate', 'Day and date (Thu, Nov 5)'], ['longDate', 'Long date (Thursday 5 November)'], ['dotted', 'Short date (05.11.26)'], ['time', 'Time (06:00)'], ['time12', 'Time (6:00 AM)'],
          ['datetime', 'Date and time'], ['relative', 'Time ago (2hr 19min)'], ['mmss', 'Seconds as minutes (02:16)']]) }),
      F('fallback', { type: 'text', label: 'Fallback', group: 'content', half: true, maxLength: 24, optional: true, when: isV, placeholder: '—', help: 'Shown when there is no value.' }),
      F('font', { type: 'select', label: 'Font', group: 'typo', half: true, get: (o) => o.font || 'theme',
        set: (o, v) => { if (!v || v === 'theme') delete o.font; else o.font = v; },
        options: [{ value: 'theme', label: 'Dashboard theme' }, ...Object.entries(FONTS()).filter(([k]) => k !== 'default').map(([value, f]) => ({ value, label: f.label }))] }),
      F('fontSize', { type: 'range', label: 'Font size', group: 'typo', min: 6, max: 200, step: 1, unit: 'px', auto: 'From the box' }),
      F('fontWeight', { type: 'select', label: 'Weight', group: 'typo', half: true, options: opts([['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Heavy']]),
        get: (o) => String(o.fontWeight || 500), set: (o, v) => { o.fontWeight = Number(v); } }),
      F('align', { type: 'select', label: 'Alignment', group: 'typo', half: true, options: opts([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]), get: (o) => o.align || 'center' }),
      F('valign', { type: 'select', label: 'Vertical', group: 'typo', half: true, options: opts([['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]), get: (o) => o.valign || 'middle' }),
      F('color', { type: 'color', label: 'Colour', group: 'typo', custom: true, options: TOKENS }),
      F('opacity', { type: 'range', label: 'Opacity', group: 'typo', min: 0, max: 100, step: 1, unit: '%', get: (o) => o.opacity ?? 100 }),
      F('case', { type: 'select', label: 'Letter case', group: 'typo', half: true, get: (o) => o.case || 'none', set: (o, v) => { if (!v || v === 'none') delete o.case; else o.case = v; },
        options: opts([['none', 'As written'], ['capitalize', 'Capitalised'], ['upper', 'UPPERCASE'], ['lower', 'lowercase']]) }),
      F('italic', { type: 'boolean', label: 'Italic', group: 'typo', get: (o) => o.italic === true, set: (o, v) => { if (v) o.italic = true; else delete o.italic; } }),
      { key: 'runs', type: 'collection', label: 'More text after it (own colour, weight, size, superscript)', group: 'content', max: RUN_MAX, itemLabel: 'text piece', addLabel: '+ Add a text piece',
        get: (o) => (Array.isArray(o.runs) ? o.runs : []), set: (o, l) => { if (l.length) o.runs = l; else delete o.runs; },
        create: () => ({ text: ' text' }), summary: (r) => ({ title: `“${plain(r.text, 30)}”${r.baseline === 'super' ? ' · superscript' : r.baseline === 'sub' ? ' · subscript' : ''}` }),
        fields: [{ key: 'text', type: 'text', label: 'Text', maxLength: 80, help: 'Spaces count: start with a space to keep words apart.' },
          { key: 'color', type: 'color', label: 'Colour', custom: true, options: TOKENS, optional: true },
          { key: 'weight', type: 'select', label: 'Weight', half: true, options: opts([['', 'Same'], ['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Heavy']]),
            get: (r) => (r.weight ? String(r.weight) : ''), set: (r, v) => { if (!v) delete r.weight; else r.weight = Number(v); } },
          { key: 'size', type: 'range', label: 'Size', min: 20, max: 400, step: 5, unit: '%', optional: true, auto: 'Same' },
          { key: 'baseline', type: 'select', label: 'Position', half: true, options: opts([['normal', 'On the line'], ['super', 'Superscript'], ['sub', 'Subscript']]), get: (r) => r.baseline || 'normal',
            set: (r, v) => { if (!v || v === 'normal') delete r.baseline; else r.baseline = v; } },
          { key: 'italic', type: 'boolean', label: 'Italic', get: (r) => r.italic === true, set: (r, v) => { if (v) r.italic = true; else delete r.italic; } }] },
      F('wrap', { type: 'boolean', label: 'Wrap long text (up to 3 lines)', group: 'typo', get: (o) => o.wrap === true, set: (o, v) => { if (v) o.wrap = true; else delete o.wrap; } }),
      F('shadow', { type: 'boolean', label: 'Text shadow (over a picture)', group: 'typo', get: (o) => o.shadow === true, set: (o, v) => { if (v) o.shadow = true; else delete o.shadow; } }),
      F('lineHeight', { type: 'range', label: 'Line height', group: 'typo', min: 0.6, max: 3, step: 0.05, unit: '×', get: (o) => o.lineHeight ?? 1.1 }),
      F('letterSpacing', { type: 'range', label: 'Letter spacing', group: 'typo', min: -10, max: 40, step: 0.5, unit: 'px', get: (o) => o.letterSpacing ?? 0 }),
      F('background', { type: 'select', label: 'Background', group: 'surface', options: opts([['none', 'None (transparent)'], ['soft', 'Soft'], ['solid', 'Solid']]), get: (o) => o.background || 'none' }),
      F('bgColor', { type: 'color', label: 'Background colour', group: 'surface', custom: true, options: TOKENS, when: (o) => (o.background || 'none') !== 'none' }),
      F('bgOpacity', { type: 'range', label: 'Background opacity', group: 'surface', min: 0, max: 100, step: 1, unit: '%', get: (o) => o.bgOpacity ?? 100, when: (o) => (o.background || 'none') !== 'none' }),
      F('padding', { type: 'range', label: 'Padding', group: 'surface', min: 0, max: 80, step: 1, unit: 'px', auto: 'Automatic' }),
      F('radius', { type: 'range', label: 'Corner radius', group: 'surface', min: 0, max: 200, step: 1, unit: 'px', auto: 'Automatic' }),
    ];
  }

  global.IniqText = Object.freeze({ create, update: paint, format, fields });
  if (global.IniqComponents) {
    global.IniqComponents.define('text', { name: 'Value / Text', category: 'data', module: 'IniqText.create', render: (c, d) => create(c, d),
      contract: { mode: "'static' | 'value'", text: 'text', prefix: 'text', suffix: 'text', decimals: '0–4', fallback: 'text', font: "'theme' | a theme font name", wrap: 'bool', shadow: 'bool', italic: 'bool', runs: '[{ text, color, weight, size %, baseline, italic }] (≤ 8)', case: "'none' | 'capitalize' | 'upper' | 'lower'", factor: 'number (the value × factor)', date: "'weekday' | 'day' | 'month' | 'date' | 'time' | 'datetime' (a timestamp value)", fontSize: 'px', fontWeight: '300–800', color: "token | '#rrggbb'",
        opacity: '%', align: "'left' | 'center' | 'right'", valign: "'top' | 'middle' | 'bottom'", lineHeight: 'number', letterSpacing: 'px', background: "'none' | 'soft' | 'solid'", bgColor: "token | '#rrggbb'",
        bgOpacity: '%', padding: 'px', radius: 'px' },
      capabilities: ['static text', 'one value (prefix · suffix · decimals · fallback)', 'typography', 'background'],
      state: '{ value, status } — its preview, or its binding',
      compose: { defaults: {}, initial: () => ({ mode: 'static', text: 'Text' }), data: { value: 'Value' }, nameBase: 'ValueText', box: { w: 120, h: 40 }, min: { w: 12, h: 10 },
        dataFields: [{ key: 'data.value', type: 'text', label: 'Preview value', group: 'data', maxLength: 40, when: isV, help: 'Design only — shown until its property has a preview entity.' }],
        // LAYOUT: the box is the room the text sits in (aligned by its own alignment); its font size is its own unless left automatic
        resize: { mode: 'layout', aspect: 'free' },
        // SCALE (Shift + resize): the set font size, spacing, padding and radius in proportion
        scale: { props: { fontSize: [4, 400], padding: [0, 80], radius: [0, 200], letterSpacing: [-10, 40] },
          base: (c) => { const o = {}; ['fontSize', 'padding', 'radius', 'letterSpacing'].forEach((k) => { if (typeof c[k] === 'number' && c[k] !== 0) o[k] = c[k]; }); return o; } },
        // BINDING (Value mode only): ONE value — the state or a scalar attribute, as reported (its formatting is the text's own)
        inputs: { value: { label: 'Value', kind: 'scalar', primary: true } },
        bindWhen: isV,
        render: (c, d = {}, ctx = {}) => create(c, d, ctx.box),
        update: (el, c, d = {}, ctx = {}) => { if (!el.classList.contains('iqtx')) return false; paint(el, c, d, ctx.box); return true; } } });
    global.IniqComponents.editor('text', () => fields());            // its configuration builder (Widget Studio's Properties)
  }
})(window);
