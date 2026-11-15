/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Light Switch — CUSTOM widget package (widgets/custom/light-switch/, type "custom.light-switch").
   ONE card for ONE light.* entity: state label (ON / OFF / UNAVAILABLE) top left, a toggle top right, the light icon in a
   circular halo, the lamp artwork (separate ON / OFF images, or one image for both), name and an optional secondary line.

   IniqLightSwitch.create(config) → HTMLElement (.ls)
   Home Assistant: NO Home Assistant code here. widget.json declares
     "ha": { "domains": ["light"], "actions": ["turn_on", "turn_off"] }
   · state: the shared 'entity' binding (config.haEntity at creation, then el.haEntity(entity) on every change);
   · control: config.haRequest('turn_on' | 'turn_off') — the generic action channel (server-checked; refused in the
     configuration preview). HA stays the source of truth: the card never flips on a click, it shows what HA reports
     next (after a failed request the binding re-sends HA's current state).
   Without an entity (demo / not linked) the toggle switches a local demo state.
   COMMON CAPABILITIES (components/widget-kit, IniqWidgetKit) — the first widget to use them:
   · interactions: the whole card responds to Tap / Double tap / Long press (default Tap = toggle the light); the small
     toggle stays a control of its own ([data-iq-control]: it never starts a card gesture, so one press = one request);
   · corners: per-corner normal / concave shape (absent: the legacy single "radius", unchanged);
   · visibility: applied by the registry around the widget (nothing to do here).
   Responsive: arrangements from the widget's OWN box (MaisonFit); sizes scale with --fit (layout size, not the zoom).
   ========================================================================== */
(function (global) {
  'use strict';

  const TYPE = 'custom.light-switch';
  const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  // image locations a configuration may use (the registry validates the same; the widget never sets anything else);
  // its own assets may live in a collection: widgets/custom/[<collection>/]<widget>/assets/
  const SAFE_IMG = /^(?!.*\.\.)(assets\/[A-Za-z0-9._/-]+|widgets\/(default|custom)\/[a-z0-9][a-z0-9-]*\/(?:[a-z0-9][a-z0-9-]*\/)?assets\/[A-Za-z0-9._/-]+|api\/asset\.php\?id=[0-9a-f]{32}|https:\/\/[^\s"'<>()]+|data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+)$/;
  const DEF = { onBg: '#f7bd2e', offBg: '#2a2c32' };
  const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const icons = () => global.DEMO_ICON || {};
  const DEFAULT_INTERACTIONS = { tap: 'toggle' };                     // a gesture the configuration does not mention



  function create(config) {
    const kit = global.IniqWidgetKit || null;                         // the common capabilities (optional: without it, as before)
    let s = { ...(config || {}) };
    let ent = s.haEntity || null;                     // the normalised HA entity (null: demo / not linked yet)
    let demoOn = s.demoState !== 'off';
    let busy = false;
    const root = document.createElement('article');
    root.className = 'ls';
    root.dataset.widget = TYPE;                       // the CSS scope, also when created outside the registry
    root.dataset.widgetSource = 'custom';
    root.innerHTML = `
      <div class="ls__glow" aria-hidden="true"></div>
      <div class="ls__art" aria-hidden="true"><img class="ls__img" alt="" draggable="false"></div>
      <span class="ls__state"></span>
      <button type="button" class="ls__toggle" role="switch" data-iq-control><span class="ls__thumb"></span></button>
      <div class="ls__halo" aria-hidden="true"><span class="ls__icon"></span></div>
      <div class="ls__text"><b class="ls__name"></b><span class="ls__sec"></span></div>`;
    const $ = (q) => root.querySelector(q);
    const toggle = $('.ls__toggle'), img = $('.ls__img');

    /** 'on' | 'off' | 'unavailable' — HA's state when linked, else the demo state */
    const phase = () => {
      if (s.entity && ent) return !ent.available ? 'unavailable' : ent.state === 'on' ? 'on' : ent.state === 'off' ? 'off' : 'unavailable';
      if (s.entity && !ent && typeof s.haRequest === 'function') return 'unavailable';    // linked, state not known yet
      return demoOn ? 'on' : 'off';
    };

    function render() {
      const p = phase(), on = p === 'on', na = p === 'unavailable';
      root.dataset.state = p;
      root.dataset.busy = String(busy);
      const st = root.style;
      st.setProperty('--ls-on-bg', HEX.test(s.onBg || '') ? s.onBg : DEF.onBg);
      st.setProperty('--ls-off-bg', HEX.test(s.offBg || '') ? s.offBg : DEF.offBg);
      st.setProperty('--ls-on-op', String(num(s.onOpacity, 100, 0, 100) / 100));
      st.setProperty('--ls-off-op', String(num(s.offOpacity, 55, 0, 100) / 100));
      st.setProperty('--ls-on-glow', String(num(s.onGlow, 80, 0, 100) / 100));
      st.setProperty('--ls-off-glow', String(num(s.offGlow, 12, 0, 100) / 100));
      st.setProperty('--ls-img-size', String(num(s.imageSize, 60, 20, 200)));
      st.setProperty('--ls-img-x', String(num(s.imageX, 60, -60, 120)));
      st.setProperty('--ls-img-y', String(num(s.imageY, 36, -60, 120)));
      st.setProperty('--ls-icon', String(num(s.iconSize, 22, 10, 64)));
      st.setProperty('--ls-toggle', String(num(s.toggleSize, 100, 50, 200) / 100));
      st.setProperty('--ls-state-fs', String(num(s.stateSize, 10, 7, 28)));
      st.setProperty('--ls-name-fs', String(num(s.nameSize, 16, 9, 40)));
      st.setProperty('--ls-sec-fs', String(num(s.secondarySize, 11, 7, 28)));
      st.setProperty('--ls-radius', `${num(s.radius, 26, 0, 60)}px`);
      root.dataset.fit = s.imageFit === 'cover' ? 'cover' : 'contain';
      // artwork: the ON / OFF image, or one image for both (then only opacity / brightness / glow change);
      // unavailable: its own image when one is set (otherwise the OFF / shared image, greyed out by the CSS)
      const src = na && s.imageUnavailable ? s.imageUnavailable : s.sameImage ? (s.imageOn || s.imageOff) : on ? s.imageOn : s.imageOff;
      if (src && SAFE_IMG.test(src)) { if (img.getAttribute('src') !== src) img.setAttribute('src', src); img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
      root.dataset.same = String(!!s.sameImage);
      root.dataset.naImage = String(!!(na && s.imageUnavailable && SAFE_IMG.test(s.imageUnavailable)));
      if (kit) kit.corners(root, s.corners);                       // per-corner shape (none: the legacy radius below applies)
      if (root.iqInteractions) root.iqInteractions.sync();
      const iconName = s.icon && icons()[s.icon] ? s.icon : 'bulb';
      $('.ls__icon').innerHTML = icons()[iconName] || '';         // shared, static icon markup (assets/js/demo-icons.js)
      const name = s.name || (ent && ent.name) || 'Light';
      $('.ls__state').textContent = na ? 'Unavailable' : on ? 'On' : 'Off';
      $('.ls__name').textContent = name;
      $('.ls__sec').textContent = s.secondary || '';
      toggle.setAttribute('aria-checked', String(on));
      toggle.setAttribute('aria-label', `${name}: ${na ? 'unavailable' : on ? 'on — turn off' : 'off — turn on'}`);
      toggle.disabled = na;
      root.setAttribute('aria-label', `${name}: ${na ? 'unavailable' : on ? 'on' : 'off'}`);
    }

    /** ONE request path for the toggle and for the card's interactions: turn_on / turn_off (a toggle is resolved from
        the state HA last reported) — never a generic HA toggle, never optimistic: HA's next state decides the look */
    async function request(want) {
      const p = phase();
      if (busy || p === 'unavailable') return;
      const action = want === 'toggle' ? (p === 'on' ? 'turn_off' : 'turn_on') : want;
      if (s.entity && typeof s.haRequest === 'function') {
        if ((action === 'turn_on' && p === 'on') || (action === 'turn_off' && p === 'off')) return;     // already so
        busy = true; render();
        try { await s.haRequest(action); }
        finally { busy = false; render(); }
      } else if (!s.entity) {
        demoOn = action === 'turn_on'; render();                             // demo card (no light linked)
      }
    }
    toggle.addEventListener('click', (ev) => { ev.stopPropagation(); request('toggle'); });
    // the card itself: Tap / Double tap / Long press (common interactions; default Tap = toggle)
    if (kit) {
      kit.interactions(root, {
        get: () => s.interactions, defaults: DEFAULT_INTERACTIONS, widget: TYPE, label: () => s.name || (ent && ent.name) || 'Light',
        verbs: { toggle: () => request('toggle'), turn_on: () => request('turn_on'), turn_off: () => request('turn_off') },
      });
    }

    render();
    if (global.MaisonFit) {
      global.MaisonFit.observe(root, {
        // full: everything · compact: no secondary line · mini: toggle, icon, state and name only (no artwork)
        arrange: (w, h) => (w < 130 || h < 96 ? 'mini' : w < 170 || h < 130 ? 'compact' : 'full'),
      });
    }
    root.haEntity = (e) => { ent = e || null; render(); };            // the shared 'entity' binding: every HA change
    root.lightSwitch = { getState: () => ({ phase: phase(), busy }), setConfig(patch) { s = { ...s, ...(patch || {}) }; render(); } };
    return root;
  }

  /** Smallest usable area: 2 × 2. */
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }; }

  /** The registry entry: the light, its artwork and the visual proportions (filters / actions come from widget.json).
      The form is organised in collapsible sections (accordion); Corners, Interactions and Visibility are the shared
      field sets of the common capabilities (F.corners / F.interactions / F.visibility). */
  function define({ F, manifest }) {
    const asset = (f) => `${manifest.path}assets/${f}`;             // the package's own folder: standalone or in a collection
    const picks = [asset('lamp-on.svg'), asset('lamp-off.svg')];
    const range = (key, label, min, max, step = 1, extra = {}) => ({ key, type: 'range', label, group: 'appearance', min, max, step, ...extra });
    // state images: packaged artwork (picks), an UPLOADED user image (upload: true → api/asset.php?id=…) or an https image
    const img = (key, label, extra = {}) => ({ ...F.image(key, label, picks), upload: true, group: 'images', ...extra });
    const color = (key, label) => F.text(key, label, 'appearance', { optional: false, maxLength: 7, placeholder: '#rrggbb', help: 'Hex colour, e.g. #f7bd2e' });
    return {
      label: 'Light Switch',
      description: 'Custom · one light: ON / OFF card with a toggle, a glowing icon halo and lamp artwork (separate ON and OFF images).',
      glyph: '<rect x="2.5" y="3.5" width="19" height="17" rx="5"/><circle cx="11" cy="12.5" r="3"/><rect x="13.5" y="6" width="5.5" height="3" rx="1.5"/>',
      size: { w: 2, h: 3 },
      accordion: true,
      groups: [
        ['identity', 'Identity', 'Name and the Home Assistant light'],
        ['settings', 'Settings', 'Secondary text and demo state'],
        ['appearance', 'Appearance', 'Colours, opacity, glow, corners, sizes'],
        ['images', 'Images', 'ON / OFF / unavailable artwork and its placement'],
        ['icon', 'Icon', 'The icon in the halo'],
        ['interactions', 'Interactions', 'Tap, double tap, long press on the card'],
        ['visibility', 'Visibility', 'Show or hide from a Home Assistant state'],
      ],
      defaults: {
        name: 'Light', secondary: '', icon: 'bulb',
        sameImage: false, imageOn: asset('lamp-on.svg'), imageOff: asset('lamp-off.svg'), imageFit: 'contain',
        imageSize: 60, imageX: 60, imageY: 36,
        onBg: DEF.onBg, offBg: DEF.offBg, onOpacity: 100, offOpacity: 55, onGlow: 80, offGlow: 12,
        iconSize: 22, toggleSize: 100, stateSize: 10, nameSize: 16, secondarySize: 11, radius: 26, demoState: 'on',
        interactions: { tap: { action: 'toggle' } },
      },
      fields: [
        F.name('Display name'),
        { ...F.entity('entity'), help: 'A Home Assistant light. Linked: its real state; the toggle and the card turn it on / off.' },
        F.text('secondary', 'Secondary text', 'settings', { maxLength: 40, placeholder: 'Optional, e.g. Living room' }),
        { key: 'demoState', type: 'select', label: 'Demo state', group: 'settings', options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], when: (c) => !c.entity },
        color('onBg', 'ON background'),
        color('offBg', 'OFF background'),
        range('onOpacity', 'ON image opacity (%)', 0, 100),
        range('offOpacity', 'OFF image opacity (%)', 0, 100),
        range('onGlow', 'ON glow intensity (%)', 0, 100),
        range('offGlow', 'OFF glow intensity (%)', 0, 100),
        F.corners('radius'),
        { ...range('radius', 'Corner radius', 0, 60), when: (c) => !c.corners },
        range('toggleSize', 'Toggle size (%)', 50, 200, 5),
        range('stateSize', 'State font size', 7, 28),
        range('nameSize', 'Name font size', 9, 40),
        range('secondarySize', 'Secondary font size', 7, 28),
        { key: 'sameImage', type: 'boolean', label: 'Same image for ON / OFF', group: 'images', help: 'One picture; only brightness, opacity and glow change' },
        img('imageOn', 'ON image'),
        img('imageOff', 'OFF image', { when: (c) => !c.sameImage }),
        img('imageUnavailable', 'Unavailable image', { help: 'Optional. Without it the ON / OFF artwork is shown greyed out' }),
        { key: 'imageFit', type: 'select', label: 'Image fit', group: 'images', options: [{ value: 'contain', label: 'Contain' }, { value: 'cover', label: 'Cover' }] },
        { ...range('imageSize', 'Image size (% of card height)', 20, 200), group: 'images' },
        { ...range('imageX', 'Image X (% from left)', -60, 120), group: 'images' },
        { ...range('imageY', 'Image Y (% from top)', -60, 120), group: 'images' },
        { key: 'icon', type: 'icon', label: 'Icon', group: 'icon', options: () => Object.keys(icons()), icons },
        { ...range('iconSize', 'Icon size', 10, 64), group: 'icon' },
        ...F.interactions({ entity: true, defaults: DEFAULT_INTERACTIONS }),
        ...F.visibility(),
      ],
      validate(c) {
        const e = [];
        ['onBg', 'offBg'].forEach((k) => { if (c[k] && !HEX.test(c[k])) e.push({ key: k, message: 'Use a hex colour such as #f7bd2e' }); });
        return e;
      },
    };
  }

  global.IniqLightSwitch = { create, constraints, define };
})(window);
