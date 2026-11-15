/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Switch Widget V1 — a persistent binary device: ON / OFF / UNAVAILABLE.
   (Not a button, script or scene: those trigger an action and have no lasting state.)

   MaisonSwitch.create(config) → HTMLElement (.xw), with el.switch = { getState(), setState(patch) }

   config = {
     id, name:          'extractor', 'Kitchen Extractor'
     subtitle:          'Kitchen'                     (optional)
     state:             'on' | 'off'                  (anything else → shown as unavailable/unknown)
     available:         true                          (false → unavailable, whatever state says)
     icon:              'extractor' | 'plug' | 'pump' | 'boiler' | 'power' | 'water' | 'valve' |
                        'socket' | 'generic', or raw SVG — supplied by configuration, never guessed
     image, imageOff:   optional PNG device artwork (+ optional off variant); optional imageRatio
     secondaryStatus:   'Running'                     (optional text, displayed as given)
     infoItems:    linked to Home Assistant: resolved Information slots (other HA entities chosen in Settings), read-only:
                   [{ line: 'Phone 64%', … }] — shown as given, never interpreted here
     onChange:          (next, prev, { source }) => void   — user interaction only
   }
   setState() is for external updates (later: Home Assistant) and never calls onChange.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    extractor: S('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="12" cy="12" r="1.6"/><path d="M12 10.4c0-2.2.9-3.9 2.6-4.2.9 1.9-.4 3.6-2.6 4.2zM13.6 12c2.2 0 3.9.9 4.2 2.6-1.9.9-3.6-.4-4.2-2.6zM12 13.6c0 2.2-.9 3.9-2.6 4.2-.9-1.9.4-3.6 2.6-4.2zM10.4 12c-2.2 0-3.9-.9-4.2-2.6 1.9-.9 3.6.4 4.2 2.6z"/>'),
    plug: S('<path d="M9 3.5v4M15 3.5v4"/><path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0z"/><path d="M12 16v4.5"/>'),
    socket: S('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="5.2"/><circle cx="10" cy="12" r=".6" fill="currentColor"/><circle cx="14" cy="12" r=".6" fill="currentColor"/>'),
    pump: S('<circle cx="10" cy="13" r="5.5"/><path d="M10 13l3.2-3.2"/><path d="M15.5 13h5M18 10v6M4.5 13H2.8M10 7.5V4.5M7.5 4.5h5"/>'),
    boiler: S('<rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M6 9h12"/><path d="M12.2 12.2c.2 1.4-.7 2.1-1.3 2.8-.5.5-.9 1.1-.9 2a2 2 0 0 0 4 0c0-.8-.3-1.3-.7-1.7 0 .6-.4 1-.8 1.1.2-1.4-.1-3-.3-4.2z"/><circle cx="9" cy="6" r=".6" fill="currentColor"/>'),
    power: S('<path d="M12 3.5v8"/><path d="M6.6 6.8a7.5 7.5 0 1 0 10.8 0"/>'),
    water: S('<path d="M12 3.5s-6 6.4-6 10.6a6 6 0 0 0 12 0c0-4.2-6-10.6-6-10.6z"/>'),
    valve: S('<path d="M3.5 9.5v6M20.5 9.5v6M3.5 12.5h4.5M16 12.5h4.5"/><path d="M8 9.5h8v6H8z"/><path d="M12 9.5V5.5M9 5.5h6"/>'),
    generic: S('<rect x="4" y="6.5" width="16" height="11" rx="5.5"/><circle cx="9.5" cy="12" r="3"/>'),
  };
  const POWER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><path d="M12 4v7.5"/><path d="M7 7.3a7 7 0 1 0 10 0"/></svg>';

  /** → 'on' | 'off' | 'unavailable' | 'unknown' — never anything else. */
  function stateOf(s) {
    if (s.available === false) return 'unavailable';
    const v = String(s.state ?? '').toLowerCase();
    if (v === 'on' || v === 'off') return v;
    if (v === 'unknown') return 'unknown';
    return 'unavailable';
  }
  const LABEL = { on: 'On', off: 'Off', unavailable: 'Unavailable', unknown: 'Unknown' };

  function create(config) {
    let s = { available: true, ...(config || {}) };
    const root = document.createElement('article');
    root.className = 'xw';
    if (s.id) root.dataset.switchId = s.id;
    root.innerHTML = `
      <div class="xw__in">
        <span class="xw__icon"></span>
        <div class="xw__art"><img alt="" decoding="async" draggable="false"></div>
        <div class="xw__id"><h3 class="xw__name"></h3><p class="xw__sub"></p></div>
        <p class="xw__state"><i class="xw__led" aria-hidden="true"></i><b class="xw__state-t"></b><span class="xw__sec"></span></p>
        <button type="button" class="xw__key" role="switch"><span class="xw__cap">${POWER}</span></button>
      </div>`;
    const $ = (c) => root.querySelector(c);
    const key = $('.xw__key'), img = $('.xw__art img');
    img.addEventListener('error', () => { root.dataset.art = 'failed'; });

    key.addEventListener('click', () => {
      const st = stateOf(s);
      if (st !== 'on' && st !== 'off') return;           // unavailable / unknown: no state change
      const prev = { state: st };
      s = { ...s, state: st === 'on' ? 'off' : 'on' };
      render();
      if (typeof s.onChange === 'function') s.onChange({ state: s.state }, prev, { source: 'user' });
    });

    function render() {
      const st = stateOf(s);
      const live = st === 'on' || st === 'off';
      root.dataset.state = st;
      root.dataset.hasSub = s.subtitle ? 'true' : 'false';
      $('.xw__icon').innerHTML = ICONS[s.icon] || (String(s.icon || '').trim().startsWith('<svg') ? s.icon : ICONS.generic);
      $('.xw__name').textContent = s.name || 'Switch';
      $('.xw__name').title = s.name || '';
      $('.xw__sub').textContent = s.subtitle || '';
      $('.xw__sub').hidden = !s.subtitle;
      $('.xw__state-t').textContent = LABEL[st];
      const info = Array.isArray(s.infoItems) ? s.infoItems.map((x) => x && x.line).filter(Boolean).join(' · ') : '';
      const sec = live ? (info || s.secondaryStatus || '') : info;
      $('.xw__sec').textContent = sec;
      $('.xw__sec').hidden = !sec;

      // artwork: optional; a failed image falls back to the icon-only layout
      const src = st === 'off' && s.imageOff ? s.imageOff : s.image;
      if (src) {
        if (img.getAttribute('src') !== src) { root.dataset.art = 'yes'; img.src = src; }   // 'failed' on error
        if (s.imageRatio) root.style.setProperty('--xw-art-ratio', s.imageRatio);
      } else root.dataset.art = 'none';

      key.setAttribute('aria-checked', String(st === 'on'));
      key.setAttribute('aria-label', `${s.name || 'Switch'}${s.subtitle ? ', ' + s.subtitle : ''}: ${LABEL[st]}`);
      key.disabled = !live;
      if (!live) key.setAttribute('aria-disabled', 'true'); else key.removeAttribute('aria-disabled');
    }

    render();
    root.switch = {
      getState: () => ({ state: stateOf(s), available: stateOf(s) !== 'unavailable' }),
      /** External update (later: Home Assistant). Never calls onChange. */
      setState(patch) { s = { ...s, ...patch }; render(); },
    };
    return root;
  }

  /** Smallest usable grid area: minW 2 everywhere (a 153–192px tile keeps a 48px key and a readable
      name); minH 3. Placed as a wide strip (≥ 480px) it reads on one line: pass { span: 'wide' } → h2. */
  function constraints(config, opts = {}) {
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: opts.span === 'wide' ? 2 : 3 };
  }

  global.MaisonSwitch = { create, constraints, ICONS };
})(window);
