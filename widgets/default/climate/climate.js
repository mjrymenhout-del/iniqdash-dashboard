/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Climate widget — the reference CLIMATE CONTROL widget (docs/WIDGET-REFERENCE.md, "Climate"):
     WIDGET → VARIANT (composition) → DIAL DESIGN (presentation of the target) → MAISONFIT (the widget's OWN box)
   CONTROL → behaviour · appearance · placement (the shared control primitives, components/controls)
   INFORMATION → content · presentation · icon · position (the shared information item, components/info)

   MaisonClimate.create(config) → HTMLElement (.cw), with el.climate = { getState(), setState(patch) }

   config = {                                     (what Home Assistant reports — components/ha/bindings.js fills it when linked)
     id, name,
     currentTemperature, targetTemperature, minTemperature, maxTemperature, temperatureStep, unit ('°C' | '°F' — display only)
     hvacMode, hvacModes []                       the MODE: what it is set to do (heat · cool · auto …)
     state                                        the ACTION: what it is doing NOW (Home Assistant's hvac_action: heating · cooling · idle …)
                                                  — never inferred: heat mode is not "heating"
     capabilities { targetTemperature, hvacMode, preset, fanMode, swingMode, targetHumidity, targetRange }
     presets / preset · fanModes / fanMode · swingModes / swingMode (verbatim lists) · humidity (room %) · humidityTarget { value, min, max }
     targetRange { low, high }                    (a heat/cool device without a single set point)
     variant: 'dial' (Thermostat) | 'horizontal' | 'compact' | 'minimal' (read-only)
     controls: [{ type, show?, place?, …its look }] — IN ORDER (absent: every control the entity has, Power not shown):
       'dial'     the thermostat: design 'spectrum' | 'minimal' | 'arc' | 'full', size, valueSize, showLabel, label, labelSize, ticks, minmax,
                  showCurrent, showAction, primary 'target' | 'current', heatColor · coolColor · idleColor, ring 'state' | 'gradient'
                  (spectrum), thickness · marker (minimal), arc 'solid' | 'glow' (arc), density 'simple' | 'detailed' · face 'filled' | 'dark' (full)
       'power' · 'minus' · 'plus'    the shared control BUTTON (icon, size, iconSize, style, shape, color, iconColor, stateLook)
       'mode' · 'fan' · 'preset' · 'swing'   the shared SEGMENTED control (2–4 options; more, or present: 'select' → a select);
                  mode: modes { <mode>: { icon, color, label } }, labels (show the labels); the segmented look (height, iconSize …)
       'humidity' · 'range'          − value + steppers (the shared buttons)
       place: "<top|center|bottom>-<left|center|right>" — the shared 3 × 3 placement; absent = where the variant puts it
     info: [{ id, entity, value, label, icon, … slot, vslot }] — the shared INFORMATION items (components/info), placed in the regions
     infoLayout: 'individual' (absent: each item at its own place) | 'bar' (the items, in order, as ONE structured row — IniqInfo.bar —
                  on the card's first or last row; its own layer: it never moves the dial) with barPosition 'top' | 'bottom', barOx / barOy
                  (px, ±40), barWidth 'content' | 'full' | 'custom' (+ barWidthPct), barAlign 'left' | 'center' | 'right' | 'between' | 'equal',
                  barDividers, barDividerOpacity, barTopDivider, barBackground 'none' | 'soft' | 'surface', barGap
     titlePlace, controlGap, infoGap, image (the shared artwork picker: Climate's own library), imageTreatment, overlay, stateImage
     onChange: (next, prev, { source }) → the binding turns it into a secure Home Assistant call
   }
   Visual truth: the dial's state colour (and a state-aware picture) follows the reported ACTION — heating warm, cooling cool, otherwise
   the idle colour; a mode alone is never shown as heating. A segmented option is selected only when Home Assistant reports it.
   ========================================================================== */
(function (global) {
  'use strict';

  /** HVAC modes (Home Assistant's): their default label, MDI icon and colour token — defaults only (the owner may change them) */
  const MODES = {
    heat: { label: 'Heat', icon: 'mdi:fire', color: 'accent-hot' },
    cool: { label: 'Cool', icon: 'mdi:snowflake', color: 'info' },
    heat_cool: { label: 'Heat/Cool', icon: 'mdi:sun-snowflake-variant', color: 'accent' },
    auto: { label: 'Auto', icon: 'mdi:thermostat-auto', color: 'accent' },
    dry: { label: 'Dry', icon: 'mdi:water-percent', color: 'info' },
    fan_only: { label: 'Fan', icon: 'mdi:fan', color: 'success' },
    off: { label: 'Off', icon: 'mdi:power', color: 'neutral' },
  };
  /** what it is DOING (hvac_action): its words and its tone (the dial's state colour) */
  const ACTION = { heating: ['Heating', 'heat'], preheating: ['Preheating', 'heat'], cooling: ['Cooling', 'cool'], drying: ['Drying', 'cool'], defrosting: ['Defrosting', 'cool'],
    fan: ['Fan', 'idle'], idle: ['Idle', 'idle'], off: ['Off', 'idle'] };
  const ACTION_ICON = { heat: 'mdi:fire', cool: 'mdi:snowflake', idle: 'mdi:power' };
  const DESIGNS = ['spectrum', 'minimal', 'arc', 'full', 'digital', 'knob'];
  const KINDS = ['dial', 'mode', 'minus', 'plus', 'power', 'fan', 'preset', 'swing', 'humidity', 'range'];
  const PLACES = ['top', 'center', 'bottom'].flatMap((r) => ['left', 'center', 'right'].map((c) => `${r}-${c}`));
  const HEX = /^#[0-9a-fA-F]{6}$/, MDI = /^mdi:[a-z0-9-]{1,64}$/;

  const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const decimalsOf = (x) => { const t = String(x); return t.includes('.') ? t.split('.')[1].length : 0; };
  const pretty = (v) => String(v).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const finite = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

  function normalise(cfg) {
    const caps = { targetTemperature: true, hvacMode: true, ...(cfg.capabilities || {}) };
    const min = Number(cfg.minTemperature ?? 5), max = Number(cfg.maxTemperature ?? 30);
    const step = Number(cfg.temperatureStep ?? 0.5) || 0.5;
    const modes = (cfg.hvacModes || ['heat', 'off']).filter((m) => MODES[m]);
    return {
      ...cfg, capabilities: caps, min, max: max > min ? max : min + 1, step,
      unit: cfg.unit === '°F' ? '°F' : '°C',
      hvacModes: modes.length ? modes : ['heat'],
      hvacMode: MODES[cfg.hvacMode] ? cfg.hvacMode : (modes[0] || 'heat'),
      currentTemperature: finite(cfg.currentTemperature) ? Number(cfg.currentTemperature) : null,
      targetTemperature: finite(cfg.targetTemperature) ? Number(cfg.targetTemperature) : (min + max) / 2,
      action: typeof cfg.state === 'string' && cfg.state ? cfg.state : null,
    };
  }
  /** the controls list (the configurator normalises it; read safely here too): the stored order, then whatever is missing — Power hidden */
  function controlsOf(c) {
    const out = (Array.isArray(c.controls) ? c.controls : []).filter((x) => x && typeof x === 'object' && KINDS.includes(x.type))
      .filter((x, i, a) => a.findIndex((y) => y.type === x.type) === i);
    KINDS.forEach((k) => { if (!out.some((x) => x.type === k)) out.push(k === 'power' ? { type: k, show: false } : { type: k }); });
    return out;
  }
  /** what the ENTITY can do (a control for anything else is never drawn) */
  function supported(k, s) {
    const C = s.capabilities, list = (v) => Array.isArray(v) && v.length > 0;
    switch (k) {
      case 'dial': return true;
      case 'mode': return !!C.hvacMode && s.hvacModes.length > 1;
      case 'minus': case 'plus': return !!C.targetTemperature;
      case 'power': return s.hvacModes.includes('off') && s.hvacModes.some((m) => m !== 'off');
      case 'fan': return !!C.fanMode && list(s.fanModes);
      case 'preset': return !!C.preset && list(s.presets);
      case 'swing': return !!C.swingMode && list(s.swingModes);
      case 'humidity': return !!C.targetHumidity && !!s.humidityTarget && finite(s.humidityTarget.value);
      case 'range': return !!C.targetRange && !!s.targetRange && finite(s.targetRange.low) && finite(s.targetRange.high);
      default: return false;
    }
  }

  /** the composition for the widget's OWN box: micro · compact · normal · large (each variant its own thresholds) */
  function arrangement(w, h, variant = 'dial') {
    if (variant === 'compact') return h < 90 || w < 180 ? 'micro' : h < 170 || w < 300 ? 'compact' : w >= 600 && h >= 300 ? 'large' : 'normal';
    if (variant === 'minimal') return Math.min(w, h) < 100 ? 'micro' : w < 260 || h < 150 ? 'compact' : w >= 560 && h >= 380 ? 'large' : 'normal';
    if (Math.min(w, h) < 125 || w * h < 160 * 160) return 'micro';
    if (w < 270 || h < 250) return 'compact';
    return w >= 560 && h >= 440 ? 'large' : 'normal';
  }
  /** where each part goes when the owner has not placed it — per variant, size and shape (null: not shown at this size) */
  function defaults(variant, arr, land) {
    const ex = 'line:bottom', D = { info: true };
    if (variant === 'minimal') return { title: 'top-left', dial: 'center-left', readOnly: true, info: arr === 'normal' || arr === 'large' };
    if (variant === 'compact') {
      Object.assign(D, { title: 'top-left', mode: 'top-right', power: 'top-right', dial: 'center-left', minus: 'center-right', plus: 'center-right', fan: ex, preset: ex, swing: ex, humidity: ex, range: ex });
      if (arr === 'micro') Object.assign(D, { title: null, mode: null, power: null, fan: null, preset: null, swing: null, humidity: null, range: null, info: false });
      if (arr === 'compact') Object.assign(D, { fan: null, preset: null, swing: null, humidity: null, range: null, info: false });
      return D;
    }
    if (variant === 'horizontal') Object.assign(D, { title: 'top-left', mode: 'top-right', power: 'top-right', dial: 'center-left', minus: 'center-right', plus: 'center-right', fan: 'bottom-right', preset: 'bottom-right', swing: 'bottom-right', humidity: 'bottom-right', range: 'bottom-right' });
    else if (land) Object.assign(D, { mode: 'top-left', power: 'top-right', title: 'bottom-center', dial: 'center-center', minus: 'center-left', plus: 'center-right', fan: ex, preset: ex, swing: ex, humidity: ex, range: ex });
    else Object.assign(D, { title: 'top-left', mode: 'top-right', power: 'top-right', dial: 'center-center', minus: 'bottom-left', plus: 'bottom-right', fan: ex, preset: ex, swing: ex, humidity: ex, range: ex });
    // small sizes simplify: Micro — the temperature, its state and Power (if shown); Compact — + the mode and − / +; never squeezed secondary controls
    if (arr === 'micro') Object.assign(D, { title: 'top-left', dial: 'center-center', mode: null, minus: null, plus: null, fan: null, preset: null, swing: null, humidity: null, range: null, info: false });
    if (arr === 'compact') Object.assign(D, { fan: null, preset: null, swing: null, humidity: null, range: null, info: false });
    return D;
  }

  /* ---------------------------------------------------------------- component */
  /* THE LOOK MAPPING of Climate's controls (a configured control item → what the shared renderers receive), in one place. */
  const themeOf = (k, x) => (!x.style || x.style === 'theme' ? (k === 'power' ? 'filled' : 'soft') : x.style);
  /** power / − / +: the shared control button's look */
  const buttonLook = (k, x) => ({ icon: x.icon || (k === 'minus' ? 'mdi:minus' : k === 'plus' ? 'mdi:plus' : 'mdi:power'), size: x.size, iconSize: x.iconSize, style: themeOf(k, x), shape: x.shape,
    color: x.color, iconColor: x.iconColor, stateLook: x.stateLook, finish: !x.style || x.style === 'theme' ? 'glow' : '' });
  /** the dial: its configured look with Climate's state colours as the dial's warm / cool / idle */
  const dialLook = (dl) => ({ ...dl, warmColor: dl.heatColor, coolColor: dl.coolColor, idleColor: dl.idleColor });
  /** one HVAC mode as a segmented option (its configured icon / label / colour, else the mode's own) */
  const modeOption = (v, x) => ({ id: v, icon: x.modes?.[v]?.icon || MODES[v].icon, label: x.modes?.[v]?.label || MODES[v].label, showLabel: x.labels === true, color: x.modes?.[v]?.color || MODES[v].color });
  /** the segmented control's look */
  const segLook = (x, options) => ({ options, height: x.height, iconSize: x.iconSize, gap: x.gap, padX: x.padX, style: x.style, shape: x.shape, inactive: x.inactive, color: x.color });

  function create(config) {
    let s = normalise(config || {});
    const C = global.IniqControls, variant = ['dial', 'horizontal', 'compact', 'minimal'].includes(s.variant) ? s.variant : 'dial';
    const list = controlsOf(s), item = (k) => list.find((x) => x.type === k) || { type: k };
    const dl = item('dial'), design = variant === 'compact' || variant === 'minimal' ? 'bare' : (DESIGNS.includes(dl.design) ? dl.design : 'spectrum');
    const shows = (k) => supported(k, s) && item(k).show !== false && (variant !== 'minimal' || k === 'dial');
    const dec = Math.max(1, decimalsOf(s.step));
    const fmt = (v) => (finite(v) ? (+v).toFixed(dec) : '–');
    const clampT = (v) => +Math.min(s.max, Math.max(s.min, s.min + Math.round((v - s.min) / s.step) * s.step)).toFixed(6);
    // the CONFIRMED state (Home Assistant's last report when linked; the widget's own state as a demo): what the controls show as selected
    const linked = () => typeof s.onChange === 'function';
    let confirmed = { hvacMode: s.hvacMode, preset: s.preset, fanMode: s.fanMode, swingMode: s.swingMode };
    let lastOn = s.hvacMode !== 'off' ? s.hvacMode : (s.hvacModes.find((m) => m === 'heat') || s.hvacModes.find((m) => m !== 'off'));

    const root = h('article', 'cw');
    root.dataset.variant = variant;
    root.dataset.design = design;
    if (s.id) root.dataset.climateId = s.id;
    // the configured colours (a token or #rrggbb — never other CSS) for the dial's states
    const col = (v) => (C ? C.colour(v) : '');
    [['heatColor', '--cw-heat'], ['coolColor', '--cw-cool'], ['idleColor', '--cw-idle']].forEach(([k, v]) => { const c = col(dl[k]); if (c) root.style.setProperty(v, c); });
    if (typeof s.controlGap === 'number') root.style.setProperty('--iqc-rgap', `${Math.max(0, Math.min(40, s.controlGap))}px`);
    if (typeof s.infoGap === 'number') root.style.setProperty('--cw-igap', `${Math.max(0, Math.min(40, s.infoGap))}px`);

    /* the picture (Climate's own image library), its treatment, and — when chosen — its state-aware light */
    const media = h('div', 'cw__media'), img = h('img', 'cw__img'), shade = h('span', 'cw__shade');
    img.alt = ''; img.decoding = 'async'; img.draggable = false;
    media.setAttribute('aria-hidden', 'true');
    media.append(img, shade);
    const pic = typeof s.image === 'string' && s.image && s.image !== 'none' ? s.image : null;
    if (pic) { img.src = pic; root.dataset.image = ''; }
    img.addEventListener('error', () => { delete root.dataset.image; });
    root.dataset.treatment = ['dim', 'dark', 'grayscale'].includes(s.imageTreatment) ? s.imageTreatment : 'natural';
    root.dataset.overlay = ['none', 'light', 'strong'].includes(s.overlay) ? s.overlay : 'medium';
    root.dataset.react = s.stateImage === false ? 'off' : 'on';
    root.append(media);

    /* title: the name and what it is doing (the ACTION) — and its MODE, distinct */
    const title = h('div', 'cw__id');
    const name = h('h3', 'cw__name', s.name || 'Climate');
    const chip = h('p', 'cw__state');
    const chipIc = h('span', 'cw__state-ic'), chipT = h('span', 'cw__state-t');
    chipIc.setAttribute('aria-hidden', 'true');
    chip.append(chipIc, chipT);
    title.append(name, chip);
    title.classList.add('iqc-fill');

    /* the dial: the SHARED dial (IniqDial) — Climate gives it the normalised view and decides what a new target means */
    const dialEl = global.IniqDial.create({ design,
      onInput: (v) => set({ targetTemperature: v }, 'dial', false),
      onCommit: (v, source, from) => (source === 'keyboard' ? set({ targetTemperature: v }, 'keyboard', true) : emit({ ...s, targetTemperature: from }, 'dial')),
      onDrag: (on) => root.classList.toggle('is-dragging', on) });
    const D = dialEl.dial;
    const dialOn = shows('dial');
    if (typeof dl.size === 'number') dialEl.style.setProperty('--cw-dsz', `${Math.max(80, Math.min(600, dl.size))}px`);
    D.look(dialLook(dl));

    /* the controls: the SHARED button / segmented control — Climate only says what they do and what is true */
    const nodes = {};
    const btn = (k, opts) => {
      const b = C ? C.button(opts) : Object.assign(h('button'), { type: 'button' });
      b.classList.add('cw__btn'); b.dataset.k = k;
      return b;
    };
    if (C && shows('power')) nodes.power = btn('power', { role: 'switch', label: `${s.name || 'Climate'} power`, onPress: () => set({ hvacMode: confirmedOn() ? 'off' : lastOn }, 'power', true) });
    if (C && shows('minus')) nodes.minus = btn('minus', { role: 'action', label: 'Decrease temperature', onPress: () => set({ targetTemperature: clampT(s.targetTemperature - s.step) }, 'minus', true) });
    if (C && shows('plus')) nodes.plus = btn('plus', { role: 'action', label: 'Increase temperature', onPress: () => set({ targetTemperature: clampT(s.targetTemperature + s.step) }, 'plus', true) });
    const confirmedOn = () => confirmed.hvacMode !== 'off';
    /** a CHOICE (mode · fan · preset · swing): the shared segmented control for 2–4 options; more (or chosen) → a select */
    const choices = {};
    const choice = (k, key, values, label) => {
      const x = item(k), many = values.length > 4, asSelect = x.present === 'select' || (x.present !== 'segmented' && many);
      if (asSelect || !C) {
        const wrap = h('label', 'cw__choice'), cap = h('span', 'cw__choice-k', label), sel = h('select', 'cw__sel cw__x-sel');
        values.forEach((v) => { const o = h('option', '', k === 'mode' ? (x.modes?.[v]?.label || MODES[v].label) : pretty(v)); o.value = v; sel.append(o); });
        sel.dataset.iqControl = ''; sel.dataset.k = k;
        sel.setAttribute('aria-label', `${s.name || 'Climate'} ${label.toLowerCase()}`);
        sel.addEventListener('change', () => set({ [key]: sel.value }, k, true));
        wrap.append(cap, sel); wrap.dataset.k = k;
        choices[k] = { el: wrap, sel, key, values };
        return wrap;
      }
      const seg = C.segmented({ label: `${s.name || 'Climate'} ${label.toLowerCase()}`, onSelect: (v) => set({ [key]: v }, k, true) });
      seg.classList.add('cw__seg'); seg.dataset.k = k;
      choices[k] = { el: seg, seg, key, values, x };
      return seg;
    };
    if (shows('mode')) nodes.mode = choice('mode', 'hvacMode', s.hvacModes, 'Mode');
    if (shows('fan')) nodes.fan = choice('fan', 'fanMode', s.fanModes, 'Fan');
    if (shows('preset')) nodes.preset = choice('preset', 'preset', s.presets, 'Preset');
    if (shows('swing')) nodes.swing = choice('swing', 'swingMode', s.swingModes, 'Swing');
    /* − value + steppers: the target humidity (inside HA's min / max) and the low / high target range (low below high, inside min / max) */
    const steppers = {};
    const stepper = (key, label, step, get, put) => {
      const g = h('span', 'cw__stp'); g.dataset.k = key;
      const k = h('span', 'cw__choice-k', label);
      const mk = (dir) => { const b = C ? C.button({ role: 'action', label: `${dir < 0 ? 'Decrease' : 'Increase'} ${label.toLowerCase()}`, icon: dir < 0 ? 'mdi:minus' : 'mdi:plus', onPress: () => put(get() + dir * step) }) : h('button'); b.classList.add('cw__stp-b'); return b; };
      const m = mk(-1), v = h('b', 'cw__stp-v'), p = mk(1);
      g.append(k, m, v, p); steppers[key] = { g, m, p, v };
      return g;
    };
    if (shows('humidity')) {
      nodes.humidity = stepper('humidity', 'Humidity', 1, () => Number(s.humidityTarget.value), (v) => {
        const hr = s.humidityTarget, n = Math.max(Number(hr.min ?? 0), Math.min(Number(hr.max ?? 100), Math.round(v)));
        if (n !== Number(hr.value)) set({ humidityTarget: { ...hr, value: n } }, 'humidity', true);
      });
    }
    if (shows('range')) {
      const rg = () => s.targetRange;
      const put = (which) => (v) => {
        const r = rg(), q = (x) => +(Math.round(x / s.step) * s.step).toFixed(6);
        const lo = which === 'low' ? Math.max(s.min, Math.min(q(v), Number(r.high) - s.step)) : Number(r.low);
        const hi = which === 'high' ? Math.min(s.max, Math.max(q(v), Number(r.low) + s.step)) : Number(r.high);
        if (lo !== Number(r.low) || hi !== Number(r.high)) set({ targetRange: { low: lo, high: hi } }, 'range', true);
      };
      const g = h('span', 'cw__range');
      g.append(stepper('low', 'Low', s.step, () => Number(rg().low), put('low')), stepper('high', 'High', s.step, () => Number(rg().high), put('high')));
      nodes.range = g;
    }
    Object.entries(nodes).forEach(([k, n]) => { n.dataset.ctrl = k; });

    /* INFORMATION: the shared information items, each in its own place */
    const inDial = (x) => design === 'digital' && x.inDial === true;
    const facts = (Array.isArray(s.info) ? s.info : []).filter((x) => x && typeof x === 'object').map((x) => {
      const f = global.IniqInfo ? global.IniqInfo.fact(x) : h('div', 'iqf');
      f.classList.add('cw__fact');
      return { x, el: f, place: `${['top', 'bottom'].includes(x.vslot) ? x.vslot : 'center'}-${['center', 'right'].includes(x.slot) ? x.slot : 'left'}` };
    });
    // the Digital ring's own information: the items chosen for it, in their structured places — ranked (the size shows the first ones)
    facts.filter((f) => inDial(f.x)).forEach((f, i) => { f.el.dataset.rank = String(i); (D.slots[global.IniqDial.SLOTS.includes(f.x.dialSlot) ? f.x.dialSlot : 'bottom'] || D.slots.bottom).append(f.el); });

    /* the INFORMATION BAR (Information layout = Bar): the same items, in their order, as ONE structured row (the shared bar) on the card's
       first or last row; the Digital ring's own items stay in the ring (never twice) */
    const IB = s.infoLayout === 'bar' && global.IniqInfo && global.IniqInfo.bar ? global.IniqInfo.bar() : null;
    const barAt = s.barPosition === 'top' ? 'top' : 'bottom';
    let barLimit = 0;
    if (IB) {
      IB.el.classList.add('cw__ibar'); IB.el.dataset.position = barAt;
      IB.el.setAttribute('aria-label', `${s.name || 'Climate'} information`);
      IB.set(facts.filter((f) => !inDial(f.x)).map((f) => f.el));
    }
    const barLook = (arr) => ({ width: s.barWidth, widthPct: s.barWidthPct, align: s.barAlign, dividers: s.barDividers !== false, dividerOpacity: s.barDividerOpacity,
      topDivider: s.barTopDivider === true, background: s.barBackground, gap: s.barGap, density: arr === 'compact' ? 'compact' : 'normal' });

    /* the REGIONS (shared): the composition */
    const R = C ? C.regions() : { el: h('div'), place() {} };
    R.el.classList.add('cw__in');
    root.append(R.el);
    let box = { w: 0, h: 0, arr: '' }, laid = '';
    /* the ring DIAL sits in its own ANCHORED LAYER over the card's content box — placed from its own anchor (never from the rows or the
       controls around it): its 3 × 3 position, the room the composition leaves it (a centre anchor reserves the same room on both sides, so
       "Centre" is the card's centre), then the owner's small OFFSET (logical px), kept inside the card. The bare readout (Compact / Minimal)
       stays in the regions like any other part. */
    const ringDial = design !== 'bare';
    const layer = h('div', 'cw__dlayer');
    if (ringDial) root.append(layer);
    let dialAt = 'center-center';
    function compose() {
      const arr = box.arr || 'normal', land = box.h > 0 && box.w / box.h >= 1.3, d = defaults(variant, arr, land);
      const flat = box.h > 0 && box.h < 110;                     // too short for three rows: the sides kept, all in the middle row
      const key = `${arr}|${land}|${flat}`;
      if (key === laid) { layout(); return; }
      laid = key;
      root.dataset.land = land ? 'true' : 'false';
      const map = {};
      const put = (where, node) => {
        if (!where || !node) return;
        let w = where;
        if (flat) w = w.startsWith('line:') ? 'center-center' : `center-${w.split('-')[1]}`;
        (map[w] = map[w] || []).push(node);
      };
      const at = (k) => (PLACES.includes(item(k).place) ? item(k).place : d[k]);
      const visible = (k) => d[k] !== null && d[k] !== undefined;     // hidden at this size (whatever its place)
      put(PLACES.includes(s.titlePlace) ? s.titlePlace : d.title, d.title === null ? null : title);
      list.forEach((x) => {
        const k = x.type;
        if (k === 'dial') {
          if (!dialOn) return;
          if (ringDial) { dialAt = PLACES.includes(at('dial')) ? at('dial') : 'center-center'; if (dialEl.parentElement !== layer) layer.append(dialEl); }
          else put(at('dial'), dialEl);
          return;
        }
        if (!nodes[k] || !visible(k) || d.readOnly) return;
        put(at(k), nodes[k]);
      });
      if (IB) {
        // the bar follows the card's OWN size: Large / Normal — every item that fits; Compact — the first two, tighter, no labels;
        // Micro (or a card too short for rows) — none (the first configured items always have priority)
        barLimit = flat || arr === 'micro' || !facts.some((f) => !inDial(f.x)) ? 0 : arr === 'compact' ? 2 : Infinity;
        IB.update(barLook(arr));
        if (barLimit) map[`line:edge-${barAt}`] = [IB.el];
      } else if (d.info) facts.filter((f) => !inDial(f.x)).forEach((f) => put(f.place, f.el));
      R.place(map);
      layout();
    }
    /** after layout: the dial's anchor box, size and offset; the controls' offsets (each kept inside the card) — logical px throughout
        (offsetLeft / offsetWidth: unaffected by the editor's zoom) */
    let layQ = 0;
    const OFFSET_KINDS = ['power', 'minus', 'plus', 'mode', 'fan', 'preset', 'swing'];
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-120, Math.min(120, v)) : 0);
    function layout() {
      if (layQ) return;
      layQ = requestAnimationFrame(() => {
        layQ = 0;
        if (!R.el.isConnected || !R.el.clientHeight) return;
        const cs = getComputedStyle(R.el), px = (v) => parseFloat(v) || 0;
        const pl = px(cs.paddingLeft), pt = px(cs.paddingTop);
        const W = R.el.clientWidth - pl - px(cs.paddingRight), H = R.el.clientHeight - pt - px(cs.paddingBottom), gap = 8;
        // where a node sits in the content box (its layout position — a translate does not move it)
        const rect = (n) => ({ l: n.offsetLeft - pl, t: n.offsetTop - pt, w: n.offsetWidth, h: n.offsetHeight });
        const zone = (sel) => R.el.querySelector(sel);
        const full = (n) => !!n && n.childElementCount > 0;
        // ---- the controls' offsets: a nudge from their place, never out of the card
        // (the shared placement offset: IniqControls.nudge — logical px, kept inside the card)
        const place = (n, ox, oy) => { const r = rect(n); return C.nudge(n, ox, oy, { W, H, left: r.l, top: r.t }); };
        OFFSET_KINDS.forEach((k) => {
          const n = nodes[k], x = item(k);
          if (!n) return;
          if ((!num(x.ox) && !num(x.oy)) || !n.offsetParent) { n.style.removeProperty('translate'); delete n.dataset.ox; delete n.dataset.oy; return; }
          const at = place(n, num(x.ox), num(x.oy));
          n.dataset.ox = String(Math.round(at.x)); n.dataset.oy = String(Math.round(at.y));
        });
        // ---- the information bar: as many items as its own width allows, then its small offset (kept inside the card)
        if (IB && barLimit) {
          IB.fit(barLimit);
          place(IB.el, Math.max(-40, Math.min(40, num(s.barOx))), Math.max(-40, Math.min(40, num(s.barOy))));
        }
        if (!ringDial || !dialOn || dialEl.parentElement !== layer) return;
        // ---- the dial's anchor box: the room the other rows (and its row's neighbours) leave it
        const [row, col] = dialAt.split('-');
        const all = (sels) => sels.flatMap((q) => [...R.el.querySelectorAll(q)]).filter(full);
        const bottomOf = (sels) => Math.max(0, ...all(sels).map((z) => { const r = rect(z); return r.t + r.h; }));
        const topOf = (sels) => Math.min(H, ...all(sels).map((z) => rect(z).t));
        const above = bottomOf(['.iqc-region[data-place^="top-"]', '.iqc-line[data-line="top"]']);
        const below = topOf(['.iqc-line[data-line="center"]', '.iqc-region[data-place^="bottom-"]', '.iqc-line[data-line="bottom"]']);
        // the INFORMATION BAR (an edge row) is its own layer for the dial: the room it takes is reserved on BOTH edges (eRow), so a bar —
        // whichever edge, whatever its items — never moves the dial's centre; the rows inside it (eTop / eBot) are measured without it
        const eTop = bottomOf(['.iqc-line[data-line="edge-top"]']), eBot = topOf(['.iqc-line[data-line="edge-bottom"]']);
        const et = eTop ? eTop + gap : 0, eb = eBot < H ? H - eBot + gap : 0, eRow = Math.max(et, eb);
        // the room between the rows; a CENTRE anchor reserves the same room above and below (the card's true centre) — unless that would
        // cost the dial too much (a small card), then it is centred in the room it has
        const ua = (above ? above + gap - et : 0) + eRow, ub = (below < H ? H - below + gap - eb : 0) + eRow;
        let y0 = row === 'top' ? eRow : ua, y1 = row === 'bottom' ? H - eRow : H - ub;
        // a neighbour's extent is what its CONTENT occupies (a region may span the empty columns beside it)
        const kids = (c) => { const z = zone(`.iqc-region[data-place="${row}-${c}"]`); return full(z) ? [...z.children].filter((n) => n.offsetParent).map(rect) : []; };
        const lk = col !== 'left' ? kids('left') : [], rk = col !== 'right' ? kids('right') : [];
        const lEdge = lk.length ? Math.max(...lk.map((r) => r.l + r.w)) + gap : 0, rEdge = rk.length ? W - Math.min(...rk.map((r) => r.l)) + gap : 0;
        let x0 = col === 'left' ? 0 : lEdge, x1 = col === 'right' ? W : W - rEdge;
        const want = typeof dl.size === 'number' ? Math.max(80, Math.min(600, dl.size)) : Infinity;
        const fits = (a0, a1, b0, b1) => Math.min(want, a1 - a0, b1 - b0);
        const sy = row === 'center' ? Math.max(ua, ub) : null, sx = col === 'center' ? Math.max(lEdge, rEdge) : null;
        const sym = fits(sx !== null ? sx : x0, sx !== null ? W - sx : x1, sy !== null ? sy : y0, sy !== null ? H - sy : y1), asym = fits(x0, x1, y0, y1);
        if (sym >= asym * 0.8) { if (sx !== null) { x0 = sx; x1 = W - sx; } if (sy !== null) { y0 = sy; y1 = H - sy; } }
        dialEl.dataset.centred = sym >= asym * 0.8 ? 'card' : 'room';
        // an automatic size leaves room for the owner's offset on a centre axis (the offset is honoured where the card allows it)
        const ox = num(dl.ox), oy = num(dl.oy);
        const roomX = col === 'center' && want === Infinity ? W - 2 * Math.abs(ox) : Infinity, roomY = row === 'center' && want === Infinity ? H - 2 * Math.abs(oy) : Infinity;
        // AUTOMATIC: the room the layout leaves it. A MANUAL size is an intentional choice: at Normal / Large it is honoured up to the card
        // itself (the other parts can be moved); a Micro / Compact card still caps it to the layout's room (the widget stays usable)
        const manual = want !== Infinity, roomy = box.arr === 'normal' || box.arr === 'large';
        const size = manual && roomy ? Math.max(56, Math.floor(Math.min(want, W, H))) : Math.max(56, Math.floor(Math.min(want, x1 - x0, y1 - y0, roomX, roomY)));
        let x = col === 'left' ? x0 : col === 'right' ? x1 - size : x0 + (x1 - x0 - size) / 2;
        let y = row === 'top' ? y0 : row === 'bottom' ? y1 - size : y0 + (y1 - y0 - size) / 2;
        x = Math.max(0, Math.min(W - size, x)); y = Math.max(0, Math.min(H - size, y));      // its anchored place, inside the card
        // the owner's offset (logical px), kept inside the card (only as much as needed)
        const fx = Math.max(-x, Math.min(W - size - x, ox)), fy = Math.max(-y, Math.min(H - size - y, oy));
        x += fx; y += fy;
        Object.assign(dialEl.style, { left: `${Math.round(x)}px`, top: `${Math.round(y)}px` });
        dialEl.style.setProperty('--cw-dpx', `${size}px`);
        dialEl.dataset.dsize = size < 120 ? 'xs' : size < 220 ? 's' : size < 320 ? 'm' : 'l';   // what fits INSIDE it (the Digital ring's information)
        dialEl.dataset.place = dialAt; dialEl.dataset.ox = String(Math.round(fx)); dialEl.dataset.oy = String(Math.round(fy));
      });
    }

    /* ---- render: everything that follows the state */
    function render() {
      const off = s.hvacMode === 'off';
      const actKey = off ? 'off' : s.action;                     // what it is DOING (none reported: its mode only — never inferred)
      const A = actKey && ACTION[actKey] ? ACTION[actKey] : null;
      const tone = A ? A[1] : 'idle';
      root.dataset.state = actKey || 'mode';
      root.dataset.mode = s.hvacMode;
      root.dataset.tone = tone;
      root.dataset.off = off ? 'true' : 'false';
      root.style.setProperty('--iqc-auto', 'var(--cw-tone)');
      // the title's state line: the ACTION (if reported) and the MODE — two different things, both said as they are
      const modeL = (item('mode').modes?.[s.hvacMode]?.label) || MODES[s.hvacMode].label;
      chipT.textContent = off ? 'Off' : A ? `${A[0]} · ${modeL}` : `${modeL} mode`;
      const modeIcon = item('mode').modes?.[s.hvacMode]?.icon || MODES[s.hvacMode].icon;
      chipIc.dataset.mdi = off ? 'mdi:power' : A && tone !== 'idle' ? ACTION_ICON[tone] : modeIcon;     // idle: its mode's icon (quiet)
      chipIc.replaceChildren(); if (global.IniqIcons) global.IniqIcons.fill(chipIc);

      // ---- the dial (the same model for every design)
      const hasT = !!s.capabilities.targetTemperature, c = s.currentTemperature, hasC = finite(c) && dl.showCurrent !== false;
      const rangeOnly = !hasT && s.targetRange && finite(s.targetRange.low) && finite(s.targetRange.high);
      const t = s.targetTemperature, primaryCurrent = dl.primary === 'current' && hasC;
      const lab = typeof dl.label === 'string' && dl.label.trim() ? dl.label.trim() : rangeOnly ? 'Target range' : primaryCurrent ? 'Room' : hasT ? 'Target' : '';
      D.view({ min: s.min, max: s.max, step: s.step, decimals: dec, unit: design === 'digital' && !rangeOnly ? s.unit : '°',
        value: primaryCurrent || !hasT ? c : t, valueText: rangeOnly && !off ? `${fmt(s.targetRange.low)}–${fmt(s.targetRange.high)}` : '', off,
        setpoint: hasT ? t : null, current: c, range: rangeOnly ? s.targetRange : null, tone: tone === 'heat' ? 'warm' : tone === 'cool' ? 'cool' : 'idle',
        action: A ? A[0] : '', label: lab,
        // the secondary value: the room temperature under a target (or the target under the room)
        secondary: !off && primaryCurrent && hasT ? { text: 'Target ', value: `${fmt(t)}°` } : hasC && (hasT || rangeOnly || off) ? { text: 'Room ', value: `${fmt(c)}°` } : null,
        icon: off ? 'mdi:power' : A && tone !== 'idle' ? ACTION_ICON[tone] : modeIcon,
        interactive: () => s.capabilities.targetTemperature && s.hvacMode !== 'off' && dialOn && root.dataset.fitArr !== 'micro',
        name: `${s.name || 'Climate'} target temperature`, aria: `${fmt(t)} ${s.unit}` });

      // ---- the controls (their look is the configured one; what is selected is what Home Assistant reports)
      const look = (k) => buttonLook(k, item(k));
      if (nodes.power) {
        const mc = MODES[lastOn] ? item('mode').modes?.[lastOn]?.color || MODES[lastOn].color : 'accent';
        nodes.power.style.setProperty('--iqc-auto', col(mc) || 'var(--cw-tone)');       // ON in its (last) mode's colour
        nodes.power.control.update(look('power'), { on: confirmedOn(), label: `${s.name || 'Climate'} power` });
      }
      if (nodes.minus) nodes.minus.control.update(look('minus'), { on: true, disabled: off || !hasT || t <= s.min });
      if (nodes.plus) nodes.plus.control.update(look('plus'), { on: true, disabled: off || !hasT || t >= s.max });
      Object.entries(choices).forEach(([k, ch]) => {
        const cur = confirmed[ch.key];
        if (ch.sel) { if (document.activeElement !== ch.sel) ch.sel.value = cur ?? ''; ch.sel.disabled = k !== 'mode' && off; return; }
        const x = item(k);
        const options = ch.values.map((v) => (k === 'mode' ? modeOption(v, x) : { id: v, label: pretty(v), showLabel: true }));
        ch.seg.control.update(segLook(x, options),
          { selected: ch.values.includes(cur) ? cur : null, disabled: k !== 'mode' && off });
      });
      if (steppers.humidity) { const hr = s.humidityTarget; steppers.humidity.v.textContent = `${Math.round(Number(hr.value))}%`;
        steppers.humidity.m.control?.update({ icon: 'mdi:minus', style: 'soft', size: 30 }, { on: true, disabled: off || Number(hr.value) <= Number(hr.min ?? 0) });
        steppers.humidity.p.control?.update({ icon: 'mdi:plus', style: 'soft', size: 30 }, { on: true, disabled: off || Number(hr.value) >= Number(hr.max ?? 100) }); }
      if (steppers.low) {
        const r = s.targetRange;
        steppers.low.v.textContent = `${fmt(r.low)}°`; steppers.high.v.textContent = `${fmt(r.high)}°`;
        steppers.low.m.control?.update({ icon: 'mdi:minus', style: 'soft', size: 30 }, { on: true, disabled: off || Number(r.low) <= s.min });
        steppers.low.p.control?.update({ icon: 'mdi:plus', style: 'soft', size: 30 }, { on: true, disabled: off || Number(r.low) + s.step >= Number(r.high) });
        steppers.high.m.control?.update({ icon: 'mdi:minus', style: 'soft', size: 30 }, { on: true, disabled: off || Number(r.high) - s.step <= Number(r.low) });
        steppers.high.p.control?.update({ icon: 'mdi:plus', style: 'soft', size: 30 }, { on: true, disabled: off || Number(r.high) >= s.max });
      }
      root.setAttribute('aria-label', `${s.name || 'Climate'}, ${chipT.textContent}${hasT && !off ? `, target ${fmt(t)} ${s.unit}` : ''}${finite(c) ? `, room ${fmt(c)} ${s.unit}` : ''}`);
      compose();
    }

    function emit(prevS, source) {
      if (!linked()) return;
      const pick = (x) => ({ hvacMode: x.hvacMode, targetTemperature: x.targetTemperature, preset: x.preset, fanMode: x.fanMode, swingMode: x.swingMode, targetHumidity: x.humidityTarget ? Number(x.humidityTarget.value) : undefined, range: x.targetRange ? { low: Number(x.targetRange.low), high: Number(x.targetRange.high) } : undefined });
      s.onChange(pick(s), pick(prevS), { source });
    }
    /** a local change; commit = the end of an interaction (onChange → Home Assistant). A demo light confirms itself. */
    function set(patch, source = 'api', commit = true) {
      const prev = s;
      s = { ...s, ...patch };
      if (patch.targetTemperature !== undefined) s.targetTemperature = clampT(patch.targetTemperature);
      if (!MODES[s.hvacMode]) s.hvacMode = prev.hvacMode;
      if (s.hvacMode !== 'off') lastOn = s.hvacMode;
      if (!linked()) confirmed = { hvacMode: s.hvacMode, preset: s.preset, fanMode: s.fanMode, swingMode: s.swingMode };
      render();
      if (commit && ['targetTemperature', 'hvacMode', 'preset', 'fanMode', 'swingMode'].some((k) => prev[k] !== s[k]) || (commit && (JSON.stringify(prev.humidityTarget) !== JSON.stringify(s.humidityTarget) || JSON.stringify(prev.targetRange) !== JSON.stringify(s.targetRange)))) emit(prev, source);
    }

    render();
    let queued = false;
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, hh) => {
      const arr = arrangement(w, hh, variant), shape = `${w / hh >= 1.3}|${hh < 110}`;
      if (arr !== box.arr || shape !== box.shape) { box = { w, h: hh, arr, shape }; if (!queued) { queued = true; Promise.resolve().then(() => { queued = false; render(); }); } }
      box.w = w; box.h = hh;
      layout();
      return arr;
    } });
    root.climate = {
      getState: () => ({ hvacMode: s.hvacMode, preset: s.preset ?? null, fanMode: s.fanMode ?? null, targetTemperature: s.targetTemperature, currentTemperature: s.currentTemperature, state: s.hvacMode === 'off' ? 'off' : s.action || 'mode' }),
      getConfirmed: () => ({ ...confirmed }),
      /** incoming Home Assistant state: the CONFIRMED state (never calls onChange) */
      setState(patch) {
        const p = { ...patch };
        if ('state' in p) { p.action = p.state || null; delete p.state; }
        s = { ...s, ...p };
        if (p.targetTemperature !== undefined && p.targetTemperature !== null) s.targetTemperature = clampT(p.targetTemperature);
        if (p.currentTemperature !== undefined) s.currentTemperature = finite(p.currentTemperature) ? Number(p.currentTemperature) : null;
        if (s.hvacMode !== 'off' && MODES[s.hvacMode]) lastOn = s.hvacMode;
        confirmed = { hvacMode: s.hvacMode, preset: s.preset, fanMode: s.fanMode, swingMode: s.swingMode };
        render();
      },
    };
    return root;
  }

  /** the smallest usable grid area: Micro keeps the temperature, its state and the primary action */
  function constraints(config) {
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: config && (config.variant === 'minimal' || config.variant === 'compact') ? 2 : 3 };
  }

  global.MaisonClimate = { create, constraints, arrangement, defaults, supported, controlsOf, MODES, ACTION, DESIGNS, KINDS };
})(window);
