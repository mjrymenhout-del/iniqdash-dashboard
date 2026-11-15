/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqControls — the shared CONTROL primitives of IniqDash widgets (docs/WIDGET-REFERENCE.md, "Control widgets").
   They know nothing of Home Assistant, entities or what a widget controls: a widget creates them, tells them how they LOOK and
   what is CURRENTLY true, and is told when they are used. Light is the first user; any widget (or a future standalone widget)
   uses the same primitives — never a copy.

   IniqControls.button({ label, icon, onPress }) → <button class="iqc-btn">, with el.control.update(look, state)
     look  = { icon: 'mdi:…', size: px, iconSize: px, style: 'filled' | 'soft' | 'outline' | 'bare' | 'switch' (a track with the icon on its knob;
               size = its height), shape: 'circle' | 'rounded' | 'pill' (not for a switch), finish: 'glow' (a lit, radial surface),
               color: <token> | '#rrggbb', iconColor: <token> | '#rrggbb', stateLook: 'auto' | 'fixed',
               showLabel: true (opt-in: a VISIBLE label beside the icon — absent: icon only, as every existing button), label (its text; else
               the accessible name), labelSize, labelGap (px) }   (absent → automatic)
     state = { on: bool, disabled: bool, label: 'aria label' }
     ON / OFF is always visible: 'auto' — ON in its colour, OFF restrained; 'fixed' — the same colours, ON ringed and its icon full,
     OFF without the ring and its icon dimmed. The glyph keeps its own size whatever the button size / style (the button is its surface).

   IniqControls.segmented({ label, onSelect }) → <div class="iqc-seg" role="radiogroup">, with el.control.update(look, state)
     look  = { options: [{ id, icon: 'mdi:…', label, showLabel, color, auto: 'rgb(…)' | 'hsl(…)' (the widget's computed colour) }], height, iconSize, gap, padX,
               textSize (px, opt-in: absent → in proportion to the height, as before) (px; absent → automatic),
               style: 'soft' | 'filled' | 'outline' | 'minimal' (the SELECTED option), shape: 'pill' | 'rounded',
               color (the selected colour), inactive: 'surface' | 'soft' | 'minimal' (the control and the other options) }
     state = { selected: id | null (none is selected while nothing true matches), disabled }
     onSelect(id) — the widget decides what an option does (and whether it is now selected: the selection is never assumed).

   colour(v) → a CSS colour for an allow-listed design-token NAME or a '#rrggbb' — anything else → '' (never other CSS).
   Every element the user presses carries data-iq-control: the widget kit never runs a card gesture from it.
   ========================================================================== */
(function (global) {
  'use strict';

  const HEX = /^#[0-9a-fA-F]{6}$/;
  const TOKENS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];
  const MDI = /^mdi:[a-z0-9-]{1,64}$/;
  const AUTO = /^(rgb|hsl)\([0-9 .%,]{3,40}\)$/;      // an automatic colour a WIDGET computes (never from a configuration)
  const BUTTON_STYLES = ['filled', 'soft', 'outline', 'bare', 'switch'], BUTTON_SHAPES = ['circle', 'rounded', 'pill'];
  const SEG_STYLES = ['soft', 'filled', 'outline', 'minimal'], SEG_SHAPES = ['pill', 'rounded'], SEG_INACTIVE = ['surface', 'soft', 'minimal'];
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);
  const pick = (v, list) => (list.includes(v) ? v : list[0]);
  function colour(v) { return typeof v === 'string' ? (HEX.test(v) ? v.toLowerCase() : TOKENS.includes(v) ? `var(--${v})` : '') : ''; }
  function setVar(el, k, v) { if (v === '' || v === null || v === undefined) el.style.removeProperty(k); else el.style.setProperty(k, v); }
  function icon(el, name) {
    const v = MDI.test(name || '') ? name : '';
    if ((el.dataset.mdi || '') === v) return;
    if (v) el.dataset.mdi = v; else delete el.dataset.mdi;
    el.replaceChildren();
    if (v && global.IniqIcons) global.IniqIcons.fill(el);
  }

  /* ---------------------------------------------------------------- the control BUTTON */
  // role 'switch': an on / off switch (aria-checked) · 'action': a momentary button (− / +: no pressed state; on = drawn in its colour)
  function button({ label = '', icon: ic = '', onPress, role = '' } = {}) {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'iqc-btn'; el.dataset.iqControl = '';
    // the knob (a box only for the switch style — otherwise layout-transparent) holds the glyph
    const k = document.createElement('span'); k.className = 'iqc-btn__k'; k.setAttribute('aria-hidden', 'true');
    const i = document.createElement('span'); i.className = 'iqc-btn__i';
    k.append(i); el.append(k);
    if (role === 'switch') el.setAttribute('role', 'switch');
    if (label) el.setAttribute('aria-label', label);
    if (typeof onPress === 'function') el.addEventListener('click', () => onPress());
    let text = null;                                            // the VISIBLE label (opt-in): created only when shown — never for an icon-only button
    function update(look = {}, state = {}) {
      icon(i, look.icon || ic);
      const words = typeof look.label === 'string' && look.label.trim() ? look.label.trim() : (state.label || label || '');
      if (look.showLabel === true && words) {
        if (!text) { text = document.createElement('span'); text.className = 'iqc-btn__l'; el.append(text); }
        text.textContent = words; el.dataset.labelled = '';
      } else if (text) { text.remove(); text = null; delete el.dataset.labelled; }
      const ls = num(look.labelSize, 8, 72), lg = num(look.labelGap, 0, 40);
      setVar(el, '--iqc-lsize', ls ? `${ls}px` : ''); setVar(el, '--iqc-lgap', lg !== null ? `${lg}px` : '');
      el.dataset.style = pick(look.style, BUTTON_STYLES); el.dataset.shape = pick(look.shape, BUTTON_SHAPES);
      el.dataset.look = look.stateLook === 'fixed' ? 'fixed' : 'auto';
      if (look.finish === 'glow') el.dataset.finish = 'glow'; else delete el.dataset.finish;   // a lit, radial surface (filled · switch)
      el.dataset.on = state.on ? 'true' : 'false';
      if (role !== 'action') el.setAttribute(role === 'switch' ? 'aria-checked' : 'aria-pressed', String(!!state.on));
      el.disabled = !!state.disabled;
      const sz = num(look.size, 20, 240), is = num(look.iconSize, 8, 120);
      setVar(el, '--iqc-size', sz ? `${sz}px` : ''); setVar(el, '--iqc-icon', is ? `${is}px` : '');
      setVar(el, '--iqc-color', colour(look.color)); setVar(el, '--iqc-icolor', colour(look.iconColor));
      custom(el, look);
      if (state.label) el.setAttribute('aria-label', state.label);
    }
    el.control = { update };
    update();
    return el;
  }

  /** a control's OWN COLOURS (optional, every one a checked token / #rrggbb): its surface off / on, its text, a border, a glow when on, and a
      switch's track and knob off / on — each a custom property plus a data attribute the shared stylesheet applies (never CSS from outside) */
  const CUSTOM = [['bg', '--iqc-bg'], ['bgOn', '--iqc-bg-on'], ['fg', '--iqc-fg'], ['fgOn', '--iqc-fg-on'], ['borderColor', '--iqc-bd'], ['track', '--iqc-track'], ['trackOn', '--iqc-track-on'],
    ['knob', '--iqc-knob'], ['knobOn', '--iqc-knob-on'], ['glowColor', '--iqc-glowc']];
  function custom(el, look) {
    CUSTOM.forEach(([k, v]) => { const c = colour(look[k]); setVar(el, v, c); el.toggleAttribute(`data-c-${k.toLowerCase()}`, !!c); });
    const bw = num(look.borderWidth, 0, 12), gl = num(look.glow, 0, 80);
    setVar(el, '--iqc-bw', bw ? `${bw}px` : ''); el.toggleAttribute('data-c-border', !!bw);
    setVar(el, '--iqc-glow', gl ? `${gl}px` : ''); el.toggleAttribute('data-c-glow', !!gl);
    const sw = num(look.switchWidth, 120, 300); setVar(el, '--iqc-sw', sw ? String(sw / 100) : '');
    const wd = num(look.width, 20, 600); setVar(el, '--iqc-w', wd ? `${wd}px` : ''); el.toggleAttribute('data-c-width', !!wd);
  }
  /** the extra LOOK fields of a control button / toggle (Widget Studio) */
  const lookColour = (key, label, when) => ({ key, type: 'color', label, group: 'look', optional: true, custom: true, options: TOKENS, ...(when ? { when } : {}) });
  const isSwitch = (c) => c.style === 'switch' || (c.style === undefined && c.__role === 'switch');
  function buttonExtras(role) {
    const sw = (c) => (c.style || (role === 'switch' ? 'switch' : 'filled')) === 'switch';
    return [lookColour('bg', 'Surface (off)', (c) => !sw(c)), lookColour('bgOn', 'Surface (on)', (c) => !sw(c)), lookColour('fg', 'Icon and text (off)'), lookColour('fgOn', 'Icon and text (on)'),
      lookColour('track', 'Track (off)', sw), lookColour('trackOn', 'Track (on)', sw), lookColour('knob', 'Knob (off)', sw), lookColour('knobOn', 'Knob (on)', sw),
      { key: 'switchWidth', type: 'range', label: 'Switch length', group: 'look', min: 120, max: 300, step: 5, unit: '%', optional: true, auto: '170 %', when: sw },
      lookColour('borderColor', 'Border colour'), { key: 'borderWidth', type: 'range', label: 'Border width', group: 'look', min: 0, max: 12, step: 0.5, unit: 'px', optional: true, auto: 'None', autoValue: 0 },
      { key: 'width', type: 'range', label: 'Width (a button with a label)', group: 'look', min: 20, max: 600, step: 1, unit: 'px', optional: true, auto: 'Its content', when: (c) => c.showLabel === true },
      { key: 'glow', type: 'range', label: 'Glow when on', group: 'look', min: 0, max: 80, step: 1, unit: 'px', optional: true, auto: 'None', autoValue: 0 }, lookColour('glowColor', 'Glow colour')];
  }
  void isSwitch;

  /* ---------------------------------------------------------------- the SEGMENTED control (2+ mutually exclusive options) */
  function segmented({ label = '', onSelect } = {}) {
    const el = document.createElement('div');
    el.className = 'iqc-seg'; el.setAttribute('role', 'radiogroup');
    if (label) el.setAttribute('aria-label', label);
    let sig = '', ids = [];
    el.addEventListener('keydown', (e) => {   // arrow keys move between the options (and choose), like any radio group
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const bs = [...el.querySelectorAll('.iqc-seg__o:not(:disabled)')], j = bs.indexOf(document.activeElement);
      if (j < 0) return;
      e.preventDefault();
      const n = bs[(j + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + bs.length) % bs.length];
      n.focus(); n.click();
    });
    function build(options) {
      ids = options.map((o) => o.id);
      el.replaceChildren(...options.map((o) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'iqc-seg__o'; b.setAttribute('role', 'radio'); b.dataset.iqControl = ''; b.dataset.id = o.id;
        const i = document.createElement('span'); i.className = 'iqc-seg__i'; i.setAttribute('aria-hidden', 'true');
        const t = document.createElement('span'); t.className = 'iqc-seg__l';
        b.append(i, t);
        b.addEventListener('click', () => { if (typeof onSelect === 'function') onSelect(o.id); });
        return b;
      }));
    }
    function update(look = {}, state = {}) {
      const options = (Array.isArray(look.options) ? look.options : []).filter((o) => o && o.id);
      const s = JSON.stringify(options.map((o) => o.id));
      if (s !== sig) { sig = s; build(options); }
      el.dataset.style = pick(look.style, SEG_STYLES); el.dataset.shape = pick(look.shape, SEG_SHAPES); el.dataset.inactive = pick(look.inactive, SEG_INACTIVE);
      const h = num(look.height, 20, 120), is = num(look.iconSize, 8, 72), gap = num(look.gap, 0, 40), px = num(look.padX, 0, 60), ts = num(look.textSize, 8, 48);
      setVar(el, '--iqc-text', ts ? `${ts}px` : '');
      setVar(el, '--iqc-h', h ? `${h}px` : ''); setVar(el, '--iqc-icon', is ? `${is}px` : ''); setVar(el, '--iqc-gap', gap !== null ? `${gap}px` : ''); setVar(el, '--iqc-padx', px !== null ? `${px}px` : '');
      setVar(el, '--iqc-color', colour(look.color));
      // its OWN layout and colours (optional): a column, icon above / label below, the option surfaces and texts, the well, a wheel emphasis
      el.dataset.dir = look.direction === 'column' ? 'column' : 'row';
      el.dataset.olayout = pick(look.optionLayout, ['inline', 'stacked', 'below'], 'inline');
      el.dataset.emphasis = look.emphasis === 'wheel' ? 'wheel' : 'none';
      [['activeBg', '--iqc-abg'], ['activeFg', '--iqc-afg'], ['optionBg', '--iqc-obg'], ['optionFg', '--iqc-ofg'], ['wellBg', '--iqc-wbg'], ['activeBorder', '--iqc-abd'], ['optionBorder', '--iqc-obd']]
        .forEach(([k, v]) => { const c = colour(look[k]); setVar(el, v, c); el.toggleAttribute(`data-c-${k.toLowerCase()}`, !!c); });
      el.toggleAttribute('data-c-nowell', look.well === false);
      const orad = num(look.optionRadius, 0, 200), ib = num(look.iconBox, 12, 160), ag = num(look.activeGlow, 0, 60);
      setVar(el, '--iqc-orad', orad !== null ? `${orad}px` : ''); el.toggleAttribute('data-c-orad', orad !== null);
      setVar(el, '--iqc-ib', ib ? `${ib}px` : ''); setVar(el, '--iqc-aglow', ag ? `${ag}px` : ''); el.toggleAttribute('data-c-aglow', !!ag);
      let anyLabel = false;
      [...el.children].forEach((b, k) => {
        const o = options[k], lbl = typeof o.label === 'string' ? o.label : '', show = o.showLabel !== false && !!lbl;
        icon(b.querySelector('.iqc-seg__i'), o.icon);
        const t = b.querySelector('.iqc-seg__l'); t.textContent = show ? lbl : ''; t.hidden = !show;     // no label: no space kept for one
        anyLabel = anyLabel || show;
        b.dataset.icon = o.icon && MDI.test(o.icon) ? 'true' : 'false';
        setVar(b, '--iqc-ocolor', colour(o.color));
        setVar(b, '--iqc-oauto', typeof o.auto === 'string' && AUTO.test(o.auto) ? o.auto : '');   // the widget's own computed colour for it
        const on = state.selected !== null && state.selected !== undefined && o.id === state.selected;
        b.setAttribute('aria-checked', String(on)); b.tabIndex = on || (!ids.includes(state.selected) && k === 0) ? 0 : -1;
        b.setAttribute('aria-label', lbl || o.id);
        b.disabled = !!state.disabled;
      });
      el.dataset.labels = anyLabel ? 'true' : 'false';
      el.setAttribute('aria-disabled', String(!!state.disabled));
    }
    el.control = { update };
    return el;
  }

  /* ---------------------------------------------------------------- REGIONS: a structured composition (never coordinates) — nine regions
     (top / centre / bottom × left / centre / right), three full-width LINES (after the top, centre and bottom rows) and two EDGE lines (the
     very first and last rows — a collection-level presentation such as an information bar). A widget puts its nodes in places ("top-left"
     … "bottom-right", "line:top" | "line:center" | "line:bottom" | "line:edge-top" | "line:edge-bottom"), in its own order; several nodes in one place
     form a group (--iqc-rgap apart, never overlapping), and a region takes the room its empty neighbours leave. The widget decides what
     goes where (its defaults, the owner's choices, its own small-size rules); this only lays it out.
     IniqControls.regions() → { el, place({ where: [node…] }) } */
  const PLACES = ['top', 'center', 'bottom'].flatMap((r) => ['left', 'center', 'right'].map((c) => `${r}-${c}`)), LINES = ['top', 'center', 'bottom', 'edge-top', 'edge-bottom'];
  function regions() {
    const el = document.createElement('div');
    el.className = 'iqc-regions';
    const z = {}, ln = {};
    PLACES.forEach((p) => { const d = document.createElement('div'); d.className = 'iqc-region'; d.dataset.place = p; z[p] = d; });
    LINES.forEach((p) => { const d = document.createElement('div'); d.className = 'iqc-line'; d.dataset.line = p; ln[p] = d; });
    el.append(...PLACES.map((p) => z[p]), ...LINES.map((p) => ln[p]));
    function place(map = {}) {
      PLACES.forEach((p) => z[p].replaceChildren(...(map[p] || []).filter(Boolean)));
      LINES.forEach((p) => ln[p].replaceChildren(...(map[`line:${p}`] || []).filter(Boolean)));
      ['top', 'center', 'bottom'].forEach((r) => {
        const [L, M, R] = ['left', 'center', 'right'].map((c) => z[`${r}-${c}`]), has = (d) => d.childElementCount > 0;
        [L, M, R].forEach((d) => d.style.removeProperty('grid-column'));
        if (has(M)) { if (!has(L) || !has(R)) M.style.gridColumn = `${has(L) ? 2 : 1} / ${has(R) ? 3 : 4}`; }
        else if (has(L)) L.style.gridColumn = `1 / ${has(R) ? 3 : 4}`;
        else if (has(R)) R.style.gridColumn = '1 / 4';
      });
    }
    return { el, place, PLACES, LINES };
  }

  /* ---------------------------------------------------------------- PLACEMENT OFFSET (PlacementConfig: anchor → region, then ox / oy):
     a small nudge of a PLACED node from its structured place, in LOGICAL px (layout px — never the browser or the editor zoom), kept
     inside the content box (only as much as needed). The node keeps its layout position (a translate), so its neighbours never move.
     IniqControls.nudge(node, ox, oy, box) → { x, y } the offset applied (0 / 0: none — the translate is removed)
       box = { W, H, left, top } the content box (W × H) and the node's own place in it (rect(node) from the caller's layout pass) */
  function nudge(node, ox, oy, box) {
    const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    ox = n(ox); oy = n(oy);
    if ((!ox && !oy) || !node || !node.offsetParent || !box) { if (node) node.style.removeProperty('translate'); return { x: 0, y: 0 }; }
    const w = node.offsetWidth, h = node.offsetHeight;
    const x = Math.max(-box.left, Math.min(box.W - box.left - w, ox)), y = Math.max(-box.top, Math.min(box.H - box.top - h, oy));
    node.style.translate = `${x}px ${y}px`;
    return { x, y };
  }

  /** NUMBER STEPPER: − value + — the two buttons ARE the shared control button (its styles, sizes, colours); the value between them.
      stepper({ label, onChange(value) }) → <div class="iqc-step" role="group">, with el.control.update(look, { value, min, max, step, unit,
      decimals?, unavailable? }). A press moves by one step inside min…max and reports the new value (the owner decides what it means). */
  function stepper({ label = 'Value', onChange } = {}) {
    const el = document.createElement('div');
    el.className = 'iqc-step'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', label);
    let view = { value: 0, min: 0, max: 100, step: 1 }, look0 = {};
    const val = document.createElement('output'); val.className = 'iqc-step__v'; val.setAttribute('aria-live', 'polite');
    const dec = (s) => (String(s).split('.')[1] || '').length;
    const fin = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const bump = (dir) => {
      const step = fin(view.step, 1) > 0 ? fin(view.step, 1) : 1, lo = fin(view.min, -Infinity), hi = fin(view.max, Infinity);
      const v = Math.min(hi, Math.max(lo, Number((fin(view.value, lo === -Infinity ? 0 : lo) + dir * step).toFixed(Math.max(dec(step), 0)))));
      if (v === view.value) return;
      view = { ...view, value: v }; paint();
      if (typeof onChange === 'function') onChange(v);
    };
    const minus = button({ label: `Decrease ${label}`, onPress: () => bump(-1) }), plus = button({ label: `Increase ${label}`, onPress: () => bump(1) });
    el.append(minus, val, plus);
    el.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); bump(1); } if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); bump(-1); } });
    function paint() {
      const lo = fin(view.min, -Infinity), hi = fin(view.max, Infinity), v = fin(view.value, null), off = !!view.unavailable;
      minus.control.update({ ...look0, icon: 'mdi:minus' }, { on: false, disabled: off || (v !== null && v <= lo) });
      plus.control.update({ ...look0, icon: 'mdi:plus' }, { on: false, disabled: off || (v !== null && v >= hi) });
      const d = typeof view.decimals === 'number' ? view.decimals : dec(fin(view.step, 1));
      val.textContent = off ? '—' : v === null ? '—' : `${v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}${view.unit ? ` ${view.unit}` : ''}`;
    }
    el.control = { update(look = {}, v = {}) { look0 = look; view = { ...view, ...v }; paint(); }, value: () => view.value };
    paint();
    return el;
  }
  /** SELECT / DROPDOWN: the native select (its keyboard, its accessibility) in the shared control look.
      select({ label, onSelect(value) }) → <div class="iqc-sel">, with el.control.update({ label, showLabel, options: [{ id, label, value? }] },
      { selected (an option's id, value or label), unavailable? }) — a choice is reported as the option's value (else its id) */
  function select({ label = 'Choose', onSelect } = {}) {
    const el = document.createElement('div');                   // (not a <label>: its native `control` getter is taken)
    el.className = 'iqc-sel';
    const t = document.createElement('span'); t.className = 'iqc-sel__l'; t.setAttribute('aria-hidden', 'true');
    const s = document.createElement('select'); s.className = 'iqc-sel__s'; s.setAttribute('aria-label', label);
    el.append(t, s);
    let opts = [], sig = '';
    s.addEventListener('change', () => { const o = opts.find((x) => x.id === s.value); if (typeof onSelect === 'function') onSelect(o && typeof o.value === 'string' && o.value ? o.value : s.value); });
    el.control = { update(c = {}, d = {}) {
      opts = (Array.isArray(c.options) ? c.options : []).filter((o) => o && typeof o.id === 'string').slice(0, 40);
      const nsig = JSON.stringify(opts.map((o) => [o.id, o.label]));
      if (nsig !== sig) { sig = nsig; s.replaceChildren(...opts.map((o) => { const op = document.createElement('option'); op.value = o.id; op.textContent = o.label || o.id; return op; })); }
      const want = d.selected === null || d.selected === undefined ? '' : String(d.selected).toLowerCase();
      const m = opts.find((o) => o.id === d.selected) || opts.find((o) => [o.value, o.id, o.label].some((y) => typeof y === 'string' && y.toLowerCase() === want));
      if (m) s.value = m.id; else s.selectedIndex = -1;
      t.textContent = c.label || ''; t.hidden = c.showLabel === false || !c.label;
      s.setAttribute('aria-label', c.label || label);
      s.disabled = !!d.unavailable;
    } };
    return el;
  }

  /** the extra LOOK fields of a segmented control (Widget Studio) */
  const SEG_EXTRAS = () => [
    { key: 'direction', type: 'select', label: 'Direction', group: 'look', half: true, options: [{ value: 'row', label: 'Side by side' }, { value: 'column', label: 'Stacked (a column)' }], get: (c) => c.direction || 'row', set: (c, v) => { if (v === 'column') c.direction = v; else delete c.direction; } },
    { key: 'optionLayout', type: 'select', label: 'Icon and label', group: 'look', half: true, options: [{ value: 'inline', label: 'Side by side' }, { value: 'stacked', label: 'Icon above the label' }, { value: 'below', label: 'Label below a round icon' }],
      get: (c) => c.optionLayout || 'inline', set: (c, v) => { if (v && v !== 'inline') c.optionLayout = v; else delete c.optionLayout; } },
    { key: 'emphasis', type: 'select', label: 'Emphasis', group: 'look', options: [{ value: 'none', label: 'None' }, { value: 'wheel', label: 'Wheel (the selected one large, the others faded)' }],
      get: (c) => c.emphasis || 'none', set: (c, v) => { if (v === 'wheel') c.emphasis = v; else delete c.emphasis; } },
    { key: 'well', type: 'boolean', label: 'Background behind the options', group: 'look', get: (c) => c.well !== false, set: (c, v) => { if (v) delete c.well; else c.well = false; } },
    lookColour('wellBg', 'Background colour', (c) => c.well !== false), lookColour('activeBg', 'Selected: surface'), lookColour('activeFg', 'Selected: icon and text'), lookColour('activeBorder', 'Selected: border'),
    lookColour('optionBg', 'Others: surface'), lookColour('optionFg', 'Others: icon and text'), lookColour('optionBorder', 'Others: border'),
    { key: 'optionRadius', type: 'range', label: 'Option corner radius', group: 'look', min: 0, max: 200, step: 1, unit: 'px', optional: true, auto: 'Automatic' },
    { key: 'iconBox', type: 'range', label: 'Round icon size', group: 'look', min: 12, max: 160, step: 1, unit: 'px', optional: true, auto: 'Automatic', when: (c) => c.optionLayout === 'below' },
    { key: 'activeGlow', type: 'range', label: 'Selected: glow', group: 'look', min: 0, max: 60, step: 1, unit: 'px', optional: true, auto: 'None', autoValue: 0 }];
  global.IniqControls = Object.freeze({ button, segmented, stepper, select, regions, nudge, PLACES, colour, TOKENS, BUTTON_STYLES, BUTTON_SHAPES, SEG_STYLES, SEG_SHAPES, SEG_INACTIVE });
  // the foundation registry: what these primitives are (docs/COMPONENT-FOUNDATION.md)
  const R = global.IniqComponents;
  if (R) {
    const BUTTON = { icon: "'mdi:…'", size: 'px', iconSize: 'px (the glyph — never shrunk by the surface)', style: BUTTON_STYLES.join(' | '), shape: BUTTON_SHAPES.join(' | '),
      color: "token | '#rrggbb'", iconColor: "token | '#rrggbb'", stateLook: "'auto' | 'fixed'", finish: "'glow'" };
    /* the COMPOSE contract of the shared control button — ONE for the Action button and the Toggle (a switch-role button: the same
       renderer as Light's and Climate's Power), neutral by default: no property, no action until the designer gives them one */
    const composeButton = ({ role, defaults, nameBase, editor, press }) => ({ defaults, data: { on: false }, nameBase, box: { w: 72, h: 72 }, min: { w: 28, h: 28 },
        editor,
        // CENTRE: the button keeps its own size, centred in its box (a normal resize changes the box only); a presentation that outgrows
        // its box grows the box (never shrinks it)
        resize: { mode: 'center', aspect: 'square',
          toBox: (c, p, b) => { if (c.size === p.size && c.shape === p.shape) return null; const s = typeof c.size === 'number' ? c.size : 44, w = Math.round(c.shape === 'pill' ? s * 1.6 : s);
            return w > b.w || s > b.h ? { w: Math.max(b.w, w), h: Math.max(b.h, s) } : null; } },
        // SCALE (Shift + resize): the button, its icon, and — with a visible label — the label and its gap, in proportion
        scale: { props: { size: [28, 240], iconSize: [8, 120], labelSize: [8, 72], labelGap: [0, 40] },
          base: (c) => { const s = typeof c.size === 'number' ? c.size : 44;
            return { size: s, iconSize: typeof c.iconSize === 'number' ? c.iconSize : Math.round(s * 0.46),
              ...(c.showLabel === true ? { labelSize: typeof c.labelSize === 'number' ? c.labelSize : Math.max(11, Math.round(s * 0.3)), labelGap: typeof c.labelGap === 'number' ? c.labelGap : Math.round(s * 0.16) } : {}) }; } },
        dataFields: [{ key: 'data.on', type: 'boolean', label: 'On (preview)', group: 'data', help: 'Preview state — later from Home Assistant.' }],
        // BINDING (a host may feed `on` / handle the press — the button knows no entity)
        inputs: { on: { label: 'On', kind: 'boolean', primary: true } },
        actions: { press: { label: press, kind: 'press' } },
        extraFields: () => buttonExtras(role),
        render: (c, d, ctx = {}) => { const b = button({ label: c.label, role, onPress: () => ctx.onAction && ctx.onAction('press') }); b.control.update(c, { on: !!(d && d.on), label: c.label }); return b; },
        // the VIEW path: the same element, its new look / state (no new element)
        update: (el, c, d) => { el.control.update(c, { on: !!(d && d.on), label: c.label }); return true; } });
    R.define('button', { name: 'Action button', category: 'controls', module: 'IniqControls.button', render: (look, { label, onPress, role = 'action', state } = {}) => { const b = button({ label, onPress, role }); b.control.update(look, state); return b; },
      contract: BUTTON, capabilities: ['icon', 'size', 'style', 'shape', 'colour', 'icon colour', 'state look', 'action (the owner’s onPress)'], state: '{ on, disabled, label }',
      // standalone (a composed widget): the look is the configuration, `on` the view; a press is reported to the host (onAction)
      compose: composeButton({ role: 'action', nameBase: 'Button', press: 'A press', defaults: { label: 'Button', icon: 'mdi:gesture-tap-button', style: 'filled', shape: 'circle', size: 64 },
        editor: { fields: ['label', 'showLabel', 'labelSize', 'labelGap', 'icon', 'style', 'shape', 'size', 'color', 'stateLook', 'iconSize', 'iconColor'], exclude: ['switch'], k: '', size: [28, 240], icon: [12, 120], showLabelDefault: false } }) });
    R.define('toggle', { name: 'Toggle', category: 'controls', module: "IniqControls.button({ role: 'switch' })", render: (look, { label, onPress, state } = {}) => { const b = button({ label, onPress, role: 'switch' }); b.control.update(look, state); return b; },
      contract: { ...BUTTON, style: "any button style, or 'switch' (a track with the icon on its knob)" }, capabilities: ['on / off (aria-checked)', 'the button’s look'], state: '{ on, disabled, label } — the CONFIRMED state the owner passes',
      compose: composeButton({ role: 'switch', nameBase: 'Toggle', press: 'A toggle press', defaults: { label: 'Toggle', icon: 'mdi:toggle-switch-outline', style: 'switch', size: 56 },
        editor: { fields: ['label', 'style', 'size', 'color', 'stateLook', 'icon', 'iconSize', 'iconColor'], k: '', size: [28, 240], icon: [12, 120] } }) });
    R.define('segmented', { name: 'Segmented control', category: 'controls', module: 'IniqControls.segmented', render: (look, { label, onSelect, state } = {}) => { const g = segmented({ label, onSelect }); g.control.update(look, state); return g; },
      contract: { options: '[{ id, icon, label, showLabel, color }]', height: 'px', iconSize: 'px', gap: 'px', padX: 'px', style: SEG_STYLES.join(' | '), shape: SEG_SHAPES.join(' | '), inactive: SEG_INACTIVE.join(' | '), color: "token | '#rrggbb'" },
      capabilities: ['options', 'icons', 'labels', 'colours', 'keyboard (arrow keys)'], state: '{ selected, disabled }',
      // standalone: the options and look are the configuration, the selected option the view; choosing one selects it here (a preview —
      // the owner decides when a host binds it) and is reported to the host (onAction)
      compose: { nameBase: 'Segmented', defaults: { label: 'Options', options: [{ id: 'option-1', label: 'Option 1' }, { id: 'option-2', label: 'Option 2' }],
          textSize: 14, iconSize: 18, gap: 4, padX: 10 },
        data: { selected: 'option-1' }, box: { w: 260, h: 48 }, min: { w: 80, h: 24 }, editor: { options: true, label: true, text: true, height: false }, extraFields: SEG_EXTRAS,
        // FILL: the control IS its box — its width shared by the options, its height the box's; its text, icons, gaps and padding stay
        // their own sizes (a normal resize gives them room, never a bigger font)
        resize: { mode: 'fill', aspect: 'free' },
        // SCALE (Shift + resize): text, icons, gaps and padding in proportion (the height follows the box)
        scale: { props: { textSize: [8, 48], iconSize: [8, 72], gap: [0, 24], padX: [0, 60] },
          base: (c) => ({ textSize: typeof c.textSize === 'number' ? c.textSize : 14, iconSize: typeof c.iconSize === 'number' ? c.iconSize : 18,
            gap: typeof c.gap === 'number' ? c.gap : 4, padX: typeof c.padX === 'number' ? c.padX : 10 }) },
        dataFields: [{ key: 'data.selected', type: 'select', label: 'Selected (preview)', group: 'data', optionsFrom: (c) => (Array.isArray(c.options) ? c.options : []).filter((o) => o && o.id).map((o) => ({ value: o.id, label: o.label || o.id })) }],
        // BINDING (a host may feed the view / handle the event — the control knows no entity): `selected` may name an option by its
        // value, id or label (case-insensitive); a choice is reported as the option's value (else its id)
        inputs: { selected: { label: 'Selected option', kind: 'option', primary: true } },
        actions: { select: { label: 'Choosing an option', kind: 'option', control: true } },
        render: (c, d, ctx = {}) => {
          let sel = d && d.selected, look = null;
          const optionsOf = (cc) => (Array.isArray(cc.options) ? cc.options : []).filter((o) => o && o.id);
          const match = (cc, v) => { if (v === null || v === undefined || v === '') return null; const t = String(v).toLowerCase();
            const o = optionsOf(cc).find((x) => x.id === v) || optionsOf(cc).find((x) => [x.value, x.id, x.label].some((y) => typeof y === 'string' && y.toLowerCase() === t)); return o ? o.id : null; };
          let cur = c;
          const g = segmented({ label: c.label || 'Options', onSelect: (id) => { sel = id; g.control.update(look, { selected: sel }); const o = optionsOf(cur).find((x) => x.id === id);
            if (ctx.onAction) ctx.onAction('select', o && typeof o.value === 'string' && o.value ? o.value : id); } });
          g.dataset.fill = '';                                    // composed: it fills its box (the control's own fill capability)
          g.compose = { set: (cc, dd, cx) => { cur = cc; sel = match(cc, dd && dd.selected); look = { ...cc, height: cx && cx.box ? Math.max(20, Math.min(400, cc.direction === 'column' ? cx.box.h : cx.box.h)) : cc.height,
            options: optionsOf(cc).map((o) => ({ ...o, showLabel: o.showLabel !== false })) }; g.control.update(look, { selected: sel, disabled: !!(dd && dd.unavailable) }); } };
          g.compose.set(c, d, ctx);
          return g;
        },
        update: (el, c, d, ctx) => { if (!el.compose) return false; el.compose.set(c, d, ctx); return true; } } });
    R.define('regions', { name: 'Structured placement', category: 'layout', module: 'IniqControls.regions + IniqControls.nudge', render: () => regions().el,
      contract: { place: `${PLACES.join(' | ')} | line:top | line:center | line:bottom | line:edge-top | line:edge-bottom`, ox: 'px (logical, kept inside)', oy: 'px (logical, kept inside)' },
      capabilities: ['3 × 3 anchor', 'full-width lines', 'edge rows', 'X / Y offset'], state: 'place({ where: [node…] }) · nudge(node, ox, oy, box)' });
  }
})(window);
