/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Cover Widget V1 — blinds, shutters, curtains, garage doors, gates: any "cover".

   MaisonCover.create(config) → HTMLElement (.vw), with el.cover = { getState(), setState(patch) }

   config = {
     id, name, subtitle
     state:        'open' | 'closed' | 'opening' | 'closing' | 'stopped' | 'unavailable' | 'unknown'
     available:    true
     position:     0…100 = how far OPEN (0 closed, 100 fully open) — the same convention as a Home
                   Assistant cover's current_position. Any device-specific meaning (inverted motors,
                   tilt, …) belongs in the mapping layer, not here.
     capabilities: { open: true, close: true, stop: true, position: false }
     labels:       optional { open: 'Up', close: 'Down' } — wording only (e.g. a gate: Open/Close)
     variant:      'window' (default: the window picture above) | 'garage' (Garage / Gate) | 'compact' | 'slider'
     kind:         'garage' | 'gate' | 'door' | null  — what the Garage / Gate picture draws: Home Assistant's device class (linked) or
                   your own choice (demo). Never guessed from the name; anything else draws a neutral door.
     onChange:     (next, prev, { source }) => void
                   next = { request: 'open'|'close'|'stop'|'position', position }, prev = { state, position }
   }
   User requests give immediate local feedback (opening / closing / stopped / the new position) and
   are reported through onChange. setState() is the device's real state coming back and never calls it.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = { open: S('<path d="m6 14.5 6-6 6 6"/>'), stop: S('<rect x="7.5" y="7.5" width="9" height="9" rx="1.6"/>'), close: S('<path d="m6 9.5 6 6 6-6"/>') };
  const STATES = ['open', 'closed', 'opening', 'closing', 'stopped'];

  const stateOf = (s) => {
    if (s.available === false) return 'unavailable';
    const v = String(s.state ?? '').toLowerCase();
    return STATES.includes(v) ? v : v === 'unknown' ? 'unknown' : 'unavailable';
  };
  const caps = (s) => ({ open: true, close: true, stop: true, position: false, ...(s.capabilities || {}) });
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v))));

  function create(config) {
    let s = { available: true, ...(config || {}) };
    const c = caps(s);
    const L = { open: 'Open', stop: 'Stop', close: 'Close', ...(s.labels || {}) };

    const root = document.createElement('article');
    root.className = 'vw';
    if (s.id) root.dataset.coverId = s.id;
    root.innerHTML = `
      <div class="vw__in">
        <div class="vw__win"><span class="vw__glass"></span><span class="vw__panel"><span class="vw__handle"></span></span><span class="vw__motion"></span></div>
        <div class="vw__id"><h3 class="vw__name"></h3><p class="vw__sub"></p><p class="vw__state"></p></div>
        <div class="vw__ctrls" role="group"></div>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const win = $('.vw__win'), ctrls = $('.vw__ctrls');
    ctrls.setAttribute('aria-label', `${s.name || 'Cover'} controls`);

    const buttons = {};
    ['open', 'stop', 'close'].filter((k) => c[k]).forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `vw__btn vw__btn--${k}`;
      b.innerHTML = `${ICON[k]}<span>${L[k]}</span>`;
      b.setAttribute('aria-label', `${L[k]} ${s.name || 'cover'}`);
      b.addEventListener('click', () => request(k));
      ctrls.appendChild(b);
      buttons[k] = b;
    });
    root.dataset.buttons = String(Object.keys(buttons).length);

    /* ---- the other presentations: their own block (the window picture above is the Window variant) ---- */
    const variant = ['garage', 'compact', 'slider'].includes(s.variant) ? s.variant : 'window';
    root.dataset.coverVariant = variant;
    const alt = variant === 'window' ? null : buildAlt();
    function buildAlt() {
      const a = document.createElement('div');
      a.className = `iq-cover-alt iq-cover-alt--${variant}`;
      const kind = ['garage', 'gate', 'door'].includes(s.kind) ? s.kind : 'other';
      const sliding = variant === 'slider' && c.position;
      a.innerHTML = `${variant === 'garage' ? `<div class="iq-cover-pic" data-kind="${kind}" aria-hidden="true"><span class="iq-cover-pic__frame"><span class="iq-cover-pic__leaf iq-cover-pic__leaf--a"></span><span class="iq-cover-pic__leaf iq-cover-pic__leaf--b"></span></span></div>` : ''}
        ${sliding ? '<div class="iq-cover-fill" aria-hidden="true"></div>' : ''}
        <div class="iq-cover-alt__id"><h3 class="iq-cover-alt__name"></h3><p class="iq-cover-alt__state"></p></div>
        ${variant === 'compact' && c.position ? '<span class="iq-cover-bar" aria-hidden="true"><i></i></span>' : ''}
        <div class="iq-cover-alt__ctl" role="group"></div>`;
      a.querySelector('.iq-cover-alt__ctl').setAttribute('aria-label', `${s.name || 'Cover'} controls`);
      const ctl = a.querySelector('.iq-cover-alt__ctl'), btns = {};
      const mk = (k, label) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = `iq-cover-btn iq-cover-btn--${k}`; b.dataset.iqControl = '';
        b.innerHTML = `${ICON[k]}<span></span>`; b.querySelector('span').textContent = label;
        b.setAttribute('aria-label', `${label} ${s.name || 'cover'}`);
        b.addEventListener('click', (e) => { e.stopPropagation(); request(k); });
        ctl.append(b); btns[k] = b;
      };
      ['open', 'stop', 'close'].filter((k) => c[k]).forEach((k) => mk(k, L[k]));
      let range = null;
      if (sliding) {
        range = document.createElement('input');
        range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1'; range.className = 'iq-cover-range'; range.dataset.iqControl = '';
        range.setAttribute('aria-label', `${s.name || 'Cover'} position (percent open)`);
        let from = null;
        range.addEventListener('input', () => { if (!live()) return; if (!from) from = pick(); local({ position: clamp(range.value) }); });
        range.addEventListener('change', () => { if (!live()) return; const f = from || pick(); from = null; if (f.position !== s.position) report('position', f, 'pointer'); });
        a.append(range);
      }
      return { root: a, btns, range };
    }
    if (alt) { root.querySelector('.vw__in').hidden = true; root.append(alt.root); }

    // position: the window itself is the slider (keyboard, mouse anywhere, touch only from its handle)
    if (c.position) {
      root.dataset.positionable = '';
      win.tabIndex = 0;
      win.setAttribute('role', 'slider');
      win.setAttribute('aria-label', `${s.name || 'Cover'} position (percent open)`);
      win.setAttribute('aria-valuemin', '0');
      win.setAttribute('aria-valuemax', '100');
      win.setAttribute('aria-orientation', 'vertical');
      const posAt = (y) => { const r = win.getBoundingClientRect(); return clamp(100 - ((y - r.top) / r.height) * 100); };
      let drag = null;
      win.addEventListener('pointerdown', (e) => {
        if (!live()) return;
        if (e.pointerType === 'touch' && !e.target.closest('.vw__handle')) return;   // a swipe over the window scrolls the page
        e.preventDefault();
        win.setPointerCapture(e.pointerId);
        drag = { from: pick() };
        local({ position: posAt(e.clientY) });
      });
      win.addEventListener('pointermove', (e) => { if (drag) local({ position: posAt(e.clientY) }); });
      const end = () => { if (!drag) return; const from = drag.from; drag = null; if (from.position !== s.position) report('position', from, 'pointer'); };
      win.addEventListener('pointerup', end);
      win.addEventListener('pointercancel', end);
      win.addEventListener('keydown', (e) => {
        if (!live()) return;
        const step = { ArrowUp: 10, ArrowRight: 10, ArrowDown: -10, ArrowLeft: -10, PageUp: 25, PageDown: -25 }[e.key];
        let v = null;
        if (step !== undefined) v = (s.position ?? 0) + step; else if (e.key === 'Home') v = 0; else if (e.key === 'End') v = 100;
        if (v === null) return;
        e.preventDefault();
        const from = pick();
        local({ position: clamp(v) });
        if (from.position !== s.position) report('position', from, 'keyboard');
      });
    }

    const live = () => !['unavailable', 'unknown'].includes(stateOf(s));
    const pick = () => ({ state: stateOf(s), position: c.position ? clamp(s.position ?? 0) : null });
    function local(patch) { s = { ...s, ...patch }; render(); }
    function report(request, prev, source) {
      if (typeof s.onChange === 'function') s.onChange({ request, position: request === 'position' ? s.position : null }, prev, { source });
    }
    function request(k) {
      if (!live()) return;
      const prev = pick();
      local({ state: k === 'open' ? 'opening' : k === 'close' ? 'closing' : 'stopped' });   // immediate feedback
      report(k, prev, 'button');
    }

    function render() {
      const st = stateOf(s);
      root.dataset.state = st;
      // what the picture shows: the real position, or (without one) a fair approximation of the state
      const shown = c.position && s.position !== undefined && s.position !== null ? clamp(s.position)
        : st === 'open' ? 100 : st === 'closed' ? 0 : 50;
      root.style.setProperty('--vw-open', shown / 100);
      $('.vw__name').textContent = s.name || 'Cover';
      $('.vw__sub').textContent = s.subtitle || '';
      $('.vw__sub').hidden = !s.subtitle;
      const pct = c.position && s.position !== undefined && s.position !== null ? clamp(s.position) : null;
      const word = {
        open: pct !== null && pct < 100 ? `${pct}% open` : 'Open',
        closed: 'Closed', opening: 'Opening', closing: 'Closing',
        stopped: pct !== null ? `Stopped · ${pct}%` : 'Stopped',
        unavailable: 'Unavailable', unknown: 'Unknown',
      }[st];
      $('.vw__state').textContent = word;
      $('.vw__motion').textContent = st === 'opening' ? '▲' : st === 'closing' ? '▼' : '';
      const ok = live();
      if (buttons.open) buttons.open.disabled = !ok || (pct === 100 && st !== 'closing');
      if (buttons.close) buttons.close.disabled = !ok || (pct === 0 && st !== 'opening');
      if (buttons.stop) buttons.stop.disabled = !ok;
      if (alt) {
        const a = alt.root;
        a.dataset.state = st;
        a.querySelector('.iq-cover-alt__name').textContent = s.name || 'Cover';
        a.querySelector('.iq-cover-alt__state').textContent = word;
        const bar = a.querySelector('.iq-cover-bar i'); if (bar) bar.style.width = `${pct ?? 0}%`;
        const fill = a.querySelector('.iq-cover-fill'); if (fill) fill.style.width = `${pct ?? 0}%`;
        if (alt.range) { if (document.activeElement !== alt.range) alt.range.value = String(pct ?? 0); alt.range.disabled = !ok; alt.range.setAttribute('aria-valuetext', `${pct ?? 0}% open`); }
        if (alt.btns.open) alt.btns.open.disabled = !ok || (pct === 100 && st !== 'closing') || (!c.position && st === 'open');
        if (alt.btns.close) alt.btns.close.disabled = !ok || (pct === 0 && st !== 'opening') || (!c.position && st === 'closed');
        if (alt.btns.stop) alt.btns.stop.disabled = !ok;
      }
      if (c.position) {
        win.setAttribute('aria-valuenow', String(pct ?? 0));
        win.setAttribute('aria-valuetext', `${pct ?? 0}% open`);
        win.setAttribute('aria-disabled', String(!ok));
        win.tabIndex = ok ? 0 : -1;
      } else win.setAttribute('aria-hidden', 'true');
    }

    render();
    root.cover = {
      getState: pick,
      /** The device's real state (later: Home Assistant). Never calls onChange. */
      setState(patch) { local(patch); },
    };
    return root;
  }

  /** Smallest usable area: three 40px buttons side by side need ~150px → minW 2 (a 153–192px tile).
      minH 3; a wide strip (≥ 480px) reads on one line: { span: 'wide' } → 2. */
  function constraints(config, opts = {}) {
    const v = config && config.variant;
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: v === 'compact' || v === 'slider' || opts.span === 'wide' ? 2 : 3 };
  }

  global.MaisonCover = { create, constraints };
})(window);
