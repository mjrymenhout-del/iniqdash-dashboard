/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqSlider — the shared linear SLIDER (docs/COMPONENT-FOUNDATION.md, "Slider"): a value between a minimum and a maximum, set by
   dragging or the keyboard. A native range input (its keyboard, focus and accessibility are the browser's), with a numeric contract. It
   knows no domain — no light, no brightness, no kelvin: its owner gives it numbers and words and is told what the user did.

   IniqSlider.create({ skin, label, onInput(value), onCommit(value) }) → <input type="range">
     skin: the class the input carries — its look in the owner's context (default 'iqsl__range', this component's own look; Light keeps
           its own skins: its brightness bar and its colour-temperature strip are the same slider)
     el.slider.update({ value, min, max, step, valueText, disabled }) — the VIEW: numbers in; the value is never moved under a focused
           thumb that already shows it. It sets --v (0…1: where the value sits) for a skin that fills the track.
   onInput while it moves, onCommit when it is released (or a key). The OWNER decides what the number means.
   ========================================================================== */
(function (global) {
  'use strict';

  const finite = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const HEX = /^#[0-9a-fA-F]{6}$/, TOKENS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];
  const colour = (v) => (typeof v === 'string' ? (HEX.test(v) ? v.toLowerCase() : TOKENS.includes(v) ? `var(--${v})` : '') : '');

  function create({ skin = 'iqsl__range', label = '', onInput = null, onCommit = null } = {}) {
    const el = document.createElement('input');
    el.type = 'range';
    el.className = skin;
    el.dataset.iqControl = '';                       // dragged: never a card gesture
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('input', () => { if (onInput) onInput(Number(el.value)); });
    el.addEventListener('change', () => { if (onCommit) onCommit(Number(el.value)); });
    let view = { min: 0, max: 100, step: 1 };
    el.slider = {
      update(v = {}) {
        view = { ...view, ...v };
        const min = finite(view.min) ? Number(view.min) : 0, max = finite(view.max) && Number(view.max) > min ? Number(view.max) : min + 1;
        el.min = String(min); el.max = String(max);
        if (finite(view.step) && Number(view.step) > 0) el.step = String(view.step);
        const value = finite(view.value) ? Number(view.value) : Math.round((min + max) / 2);
        if (document.activeElement !== el || el.value !== String(value)) el.value = String(value);
        el.style.setProperty('--v', String((Math.min(max, Math.max(min, value)) - min) / (max - min)));
        if (typeof view.valueText === 'string' && view.valueText) el.setAttribute('aria-valuetext', view.valueText); else el.removeAttribute('aria-valuetext');
        if (typeof view.label === 'string' && view.label) el.setAttribute('aria-label', view.label);
        el.disabled = !!view.disabled;
      },
      get value() { return Number(el.value); },
    };
    return el;
  }

  global.IniqSlider = Object.freeze({ create });

  /* ---------------------------------------------------------------- standalone (a composed widget: Widget Studio, a Studio widget)
     The configuration is its LOOK — { track (px), handle (px), color, label }; the DATA a neutral view — { value, min, max, step }. The
     composed slider is its own small owner: a drag moves it at once and is reported to the host (onAction('change', value)). */
  const TRACK = 8, handleOf = (c) => (typeof c.handle === 'number' ? c.handle : Math.max(18, (typeof c.track === 'number' ? c.track : TRACK) + 10));
  function look(wrap, c = {}) {
    const set = (k, x) => { if (x) wrap.style.setProperty(k, x); else wrap.style.removeProperty(k); };
    set('--iqsl-h', typeof c.track === 'number' ? `${Math.max(1, Math.min(64, c.track))}px` : '');
    set('--iqsl-thumb', typeof c.handle === 'number' ? `${Math.max(8, Math.min(40, c.handle))}px` : '');
    set('--iqsl-fill', colour(c.color));
    set('--iqsl-rest', colour(c.trackColor));
    set('--iqsl-thumb-c', colour(c.handleColor));
    set('--iqsl-r', typeof c.radius === 'number' ? `${Math.max(0, Math.min(32, c.radius))}px` : '');
    set('--iqsl-thumb-r', c.handleShape === 'square' ? '4px' : '');
    // its own extras: a gradient fill (to a second colour), a ring around the handle, a glow around the handle
    set('--iqsl-fill2', colour(c.color2));
    set('--iqsl-tb', typeof c.handleBorder === 'number' && c.handleBorder > 0 ? `${Math.min(10, c.handleBorder)}px` : '');
    set('--iqsl-tbc', colour(c.handleBorderColor));
    set('--iqsl-glow', typeof c.handleGlow === 'number' && c.handleGlow > 0 ? `0 0 ${Math.min(40, c.handleGlow)}px ${colour(c.handleGlowColor) || 'var(--iqsl-fill, var(--accent))'}` : '');
  }
  const viewOf = (c, d) => ({ value: d.value, min: d.min, max: d.max, step: d.step, label: typeof c.label === 'string' && c.label ? c.label : 'Value',
    valueText: finite(d.value) ? String(d.value) : '', disabled: !!d.unavailable });
  if (global.IniqComponents) {
    global.IniqComponents.define('slider', { name: 'Slider', category: 'controls', module: 'IniqSlider.create',
      render: (c = {}, { skin, label, onInput, onCommit, view } = {}) => { const el = create({ skin, label, onInput, onCommit }); el.slider.update(view || {}); return el; },
      contract: { skin: 'the class of its look (default: its own)', track: 'px', handle: 'px', color: "token | '#rrggbb'", trackColor: "token | '#rrggbb'", handleColor: "token | '#rrggbb'", radius: 'px', handleShape: "'round' | 'square'", label: 'its accessible name' },
      capabilities: ['a value in a range', 'step', 'drag · keyboard', 'accessible name and value text', 'skins (the owner’s look)'],
      state: '{ value, min, max, step, valueText, disabled } — the owner’s numbers',
      compose: { defaults: { label: 'Value' }, data: { value: 50, min: 0, max: 100, step: 1 }, box: { w: 220, h: 40 }, min: { w: 60, h: 20 },
        editor: { k: '', group: 'slider', label: true, look: true },
        dataFields: [{ key: 'data.value', type: 'number', label: 'Value (preview)', group: 'data', half: true, help: 'Preview data — later from Home Assistant.' },
          { key: 'data.step', type: 'number', label: 'Step', group: 'range', half: true },
          { key: 'data.min', type: 'number', label: 'Minimum', group: 'range', half: true }, { key: 'data.max', type: 'number', label: 'Maximum', group: 'range', half: true }],
        // FILL: the track is the box's width, centred in its height (a normal resize makes it longer); its thickness and handle are its own
        resize: { mode: 'fill', aspect: 'free',
          toBox: (c, p, b) => { const need = Math.max(typeof c.track === 'number' ? c.track : TRACK, handleOf(c)); return need > b.h ? { h: need } : null; } },
        // BINDING (a host may feed the view / handle the event — the slider knows no entity): numbers in, the released value out
        inputs: { value: { label: 'Value', kind: 'number', primary: true }, min: { label: 'Minimum', kind: 'number', range: true }, max: { label: 'Maximum', kind: 'number', range: true },
          step: { label: 'Step', kind: 'number', range: true } },
        actions: { change: { label: 'Releasing the slider', kind: 'number', control: true } },
        extraFields: () => [
          { key: 'color2', type: 'color', label: 'Fill: gradient to', group: 'slider', optional: true, custom: true, options: TOKENS },
          { key: 'handleBorder', type: 'range', label: 'Handle ring', group: 'slider', min: 0, max: 10, step: 0.5, unit: 'px', optional: true, auto: 'None', autoValue: 0 },
          { key: 'handleBorderColor', type: 'color', label: 'Handle ring colour', group: 'slider', optional: true, custom: true, options: TOKENS, when: (c) => (c.handleBorder || 0) > 0 },
          { key: 'handleGlow', type: 'range', label: 'Handle glow', group: 'slider', min: 0, max: 40, step: 1, unit: 'px', optional: true, auto: 'None', autoValue: 0 },
          { key: 'handleGlowColor', type: 'color', label: 'Glow colour', group: 'slider', optional: true, custom: true, options: TOKENS, when: (c) => (c.handleGlow || 0) > 0 }],
        // SCALE (Shift + resize): the track's thickness and the handle, in proportion
        scale: { props: { track: [1, 64], handle: [8, 40] }, base: (c) => ({ track: typeof c.track === 'number' ? c.track : TRACK, handle: handleOf(c) }) },
        render: (c, d = {}, ctx = {}) => {
          const wrap = document.createElement('div');
          wrap.className = 'iqsl';
          const input = create({ onInput: (v) => input.slider.update({ value: v, valueText: String(v) }),
            onCommit: (v) => { input.slider.update({ value: v, valueText: String(v) }); if (ctx.onAction) ctx.onAction('change', v); } });
          wrap.append(input); wrap.slider = input.slider;
          look(wrap, c); input.slider.update(viewOf(c, d));
          return wrap;
        },
        // the VIEW path: the same element, its new look and numbers
        update: (el, c, d = {}) => { look(el, c); el.slider.update(viewOf(c, d)); return true; } } });
  }
})(window);
