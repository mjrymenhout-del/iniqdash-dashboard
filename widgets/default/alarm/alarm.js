/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Alarm / Security Widget V1 — the state of an alarm panel and its supported arm / disarm modes.
   No alarm configuration, sensors or automations: Home Assistant stays responsible for those.

   MaisonAlarm.create(config) → HTMLElement (.al), with el.alarm = { getState(), setState(patch) }
   config = {
     id, name, subtitle
     state:          'disarmed' | 'armed_home' | 'armed_away' | 'armed_night' | 'armed_vacation'
                     | 'armed_custom_bypass' | 'pending' | 'arming' | 'disarming' | 'triggered'
                     | 'unavailable' | 'unknown'
     available:      true
     modes:          ['arm_home', 'arm_away', 'arm_night', …]   — only what the panel supports
                     (disarm is always offered)
     confirmDisarm:  true      Disarm needs a second press (when no code is asked for it)
     confirmTimeout: 4000
     onRequest:      (request: 'disarm' | 'arm_home' | …, { source, code? }) => void   — HA layer decides
     variant:        'standard' (as always) | 'keypad' (Full Security Keypad) | 'compact' | 'status' (Security Status: the state only,
                     no control) | 'modern' (Modern Alarm Panel) — the registry's shared Variant system resolves it
     codeRequired:   the KEYPAD preset: whether this panel asks for a code (linked: Home Assistant's code_format; demo: true)
   }
   KEYPAD: digits typed on the widget's own keypad are kept ONLY in memory and shown as dots (never an input field, never storage, never
   the dashboard). A mode button SUBMITS the request with the code to the secure alarm action (onRequest — the HA layer's own path, which
   asks for no second code then); the code is cleared right after, on Cancel, after 30 s without a key, when the tab is hidden and when the
   widget is removed. Nothing is claimed: the state shown is Home Assistant's (Arming… / Disarming… until it reports the result).
   A request shows 'arming' / 'disarming' at once; the real state comes back via setState().
   Responsive (MaisonFit): when a mode button would get too little room for its label, icons only.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d, w = 1.9) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const SHIELD = S('<path d="M12 3.2 19 6v5.5c0 4.4-2.9 8-7 9.3-4.1-1.3-7-4.9-7-9.3V6z"/>');
  const ICON = {
    disarm: S('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/>'),
    arm_home: S('<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/>'),
    arm_away: S('<path d="M5 20.5V4.5h9v16"/><path d="M14 4.5l5 2v14l-5-1"/><path d="M18 12h3.5m-1.5-2 2 2-2 2"/>'),
    arm_night: S('<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>'),
    arm_vacation: S('<path d="M4 20h16"/><path d="M8 20c0-6 2-10 7-13"/><path d="M15 7c-3-1-6 0-8 2 3-.5 6 0 8-2zM15 7c1 3 0 6-2 8 .5-3 0-6 2-8z"/>'),
    arm_custom_bypass: S('<path d="M12 3.2 19 6v5.5c0 4.4-2.9 8-7 9.3-4.1-1.3-7-4.9-7-9.3V6z"/><path d="M9 12h6"/>'),
  };
  const MODE_LABEL = { disarm: 'Disarm', arm_home: 'Home', arm_away: 'Away', arm_night: 'Night', arm_vacation: 'Vacation', arm_custom_bypass: 'Custom' };
  const STATE_LABEL = { disarmed: 'Disarmed', armed_home: 'Armed · Home', armed_away: 'Armed · Away', armed_night: 'Armed · Night', armed_vacation: 'Armed · Vacation',
    armed_custom_bypass: 'Armed · Custom', pending: 'Pending…', arming: 'Arming…', disarming: 'Disarming…', triggered: 'ALARM TRIGGERED', unavailable: 'Unavailable', unknown: 'Unknown' };
  const ORDER = ['arm_home', 'arm_away', 'arm_night', 'arm_vacation', 'arm_custom_bypass'];

  function stateOf(s) {
    if (s.available === false) return 'unavailable';
    const v = String(s.state ?? '').toLowerCase();
    return STATE_LABEL[v] ? v : 'unknown';
  }
  const tone = (st) => (st === 'disarmed' ? 'off' : st.startsWith('armed_') ? 'armed' : st === 'triggered' ? 'alarm' : ['pending', 'arming', 'disarming'].includes(st) ? 'busy' : 'na');

  const VARIANTS = ['standard', 'keypad', 'compact', 'status', 'modern'];
  const IDLE_MS = 30000;
  function create(config) {
    let s = { state: 'disarmed', available: true, modes: ['arm_home', 'arm_away'], confirmDisarm: true, confirmTimeout: 4000, ...(config || {}) };
    const variant = VARIANTS.includes(s.variant) ? s.variant : 'standard';
    const modes = ORDER.filter((m) => (s.modes || []).includes(m));
    const root = document.createElement('article');
    root.className = 'al';
    root.dataset.variant = variant;
    if (s.id) root.dataset.alarmId = s.id;
    root.innerHTML = `
      <div class="al__in">
        <div class="al__head"><span class="al__shield">${SHIELD}</span><div class="al__id"><h3 class="al__name"></h3><p class="al__state" aria-live="polite"></p></div></div>
        <p class="al__hint" aria-live="polite"></p>
        ${variant === 'keypad' ? '<div class="al__pad" role="group" aria-label="Alarm code"><p class="al__code" aria-live="polite"></p><div class="al__keys"></div></div>' : ''}
        <div class="al__modes" role="group"></div>
      </div>`;
    const $ = (q) => root.querySelector(q);
    let armed = false, tArm = 0;
    // THE KEYPAD's code: memory only (never an input, never stored); cleared after a submit, Cancel, 30 s idle, a hidden tab, removal
    let code = '', tIdle = 0;
    const clearCode = () => { code = ''; clearTimeout(tIdle); if ($('.al__code')) render(); };   // the code display and the hint
    const paintCode = () => { const c = $('.al__code'); if (!c) return; c.textContent = code ? '•'.repeat(code.length) : (keypadNeeded() ? 'Enter the code' : 'No code needed'); c.dataset.filled = String(!!code); };
    const keypadNeeded = () => variant === 'keypad' && s.codeRequired !== false;
    if (variant === 'keypad') {
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'cancel', '0', 'back'];
      keys.forEach((k) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = `al__key al__key--${/\d/.test(k) ? 'digit' : k}`; b.dataset.key = k;
        b.textContent = k === 'back' ? '⌫' : k === 'cancel' ? 'Clear' : k;
        b.setAttribute('aria-label', k === 'back' ? 'Backspace' : k === 'cancel' ? 'Clear the code' : k);
        b.addEventListener('click', () => {
          if (stateOf(s) === 'unavailable') return;
          if (k === 'back') code = code.slice(0, -1); else if (k === 'cancel') code = ''; else if (code.length < 16) code += k;
          clearTimeout(tIdle); if (code) tIdle = setTimeout(clearCode, IDLE_MS);
          paintCode(); render();
        });
        $('.al__keys').appendChild(b);
      });
      // a hidden tab or the widget's removal clears the code; both watchers let go once the widget is gone (nothing keeps it alive)
      let seen = false;
      const onVis = () => { if (document.hidden) clearCode(); if (seen && !root.isConnected) { document.removeEventListener('visibilitychange', onVis); } };
      document.addEventListener('visibilitychange', onVis);
      const mo = new MutationObserver(() => { if (root.isConnected) { seen = true; return; } if (seen) { clearCode(); mo.disconnect(); document.removeEventListener('visibilitychange', onVis); } });
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
    const btns = {};
    (variant === 'status' ? [] : ['disarm', ...modes]).forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `al__btn al__btn--${m}`;
      b.dataset.request = m;
      b.innerHTML = `${ICON[m]}<span>${MODE_LABEL[m]}</span>`;
      b.addEventListener('click', () => press(m, 'user'));
      btns[m] = b;
      $('.al__modes').appendChild(b);
    });

    function press(m, source) {
      const st = stateOf(s);
      if (st === 'unavailable' || !btns[m]) return false;
      if (keypadNeeded()) {
        // the keypad preset: the mode button SUBMITS the typed code (no code: nothing is sent)
        if (!code) { $('.al__hint').textContent = 'Enter the code first'; return false; }
        const c = code; clearCode();
        s = { ...s, state: m === 'disarm' ? 'disarming' : 'arming' };
        render();
        if (typeof s.onRequest === 'function') s.onRequest(m, { source, code: c });
        return true;
      }
      if (m === 'disarm' && s.confirmDisarm !== false && !armed && variant !== 'keypad') {
        armed = true; clearTimeout(tArm);
        tArm = setTimeout(() => { armed = false; render(); }, s.confirmTimeout);
        render();
        return 'confirm';
      }
      armed = false; clearTimeout(tArm);
      s = { ...s, state: m === 'disarm' ? 'disarming' : 'arming' };
      render();
      if (typeof s.onRequest === 'function') s.onRequest(m, { source });
      return true;
    }

    function render() {
      const st = stateOf(s);
      root.dataset.state = st;
      root.dataset.tone = tone(st);
      $('.al__name').textContent = [s.name || 'Alarm', s.subtitle].filter(Boolean).join(' · ');
      $('.al__state').textContent = STATE_LABEL[st];
      $('.al__hint').textContent = armed ? 'Press Disarm again to confirm' : keypadNeeded() && code ? 'Choose the action to send with this code' : '';
      paintCode();
      const ok = st !== 'unavailable';
      const busy = ['arming', 'disarming', 'pending'].includes(st);
      Object.entries(btns).forEach(([m, b]) => {
        const active = m === 'disarm' ? st === 'disarmed' : st === m.replace('arm_', 'armed_');
        b.setAttribute('aria-pressed', String(active));
        b.disabled = !ok || active || (busy && m !== 'disarm');
        b.classList.toggle('is-armed', m === 'disarm' && armed);
        b.setAttribute('aria-label', m === 'disarm' ? (armed ? 'Press again to disarm' : 'Disarm') : `Arm: ${MODE_LABEL[m]}`);
      });
    }

    render();
    // labelled buttons wrap onto more rows (never cut off); icons only when no labelled button fits
    // on a row (or only one, unless the box is tall enough for one per row), or when the rows they
    // need do not fit the widget's height. A long strip puts the state and the buttons on one line.
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => {
      const n = modes.length + 1;
      if (variant === 'keypad' || variant === 'modern' || variant === 'status') return 'full';   // their own layouts (CSS)
      if (variant === 'compact') return 'compact';
      if (h < 240 && w >= h * 2.4 && w - 280 >= n * 110) return 'strip';
      const perRow = Math.floor((w - 24) / 122), rows = Math.ceil(n / Math.max(1, perRow));
      return perRow < 1 || (perRow < 2 && h < 380) || rows * 46 > h - 104 ? 'compact' : 'full';
    } });
    root.alarm = {
      getState: () => ({ state: stateOf(s), confirming: armed, codeLength: code.length }),
      /** the panel's real state (Home Assistant / demo). Never calls onRequest. */
      setState(patch) { s = { ...s, ...patch }; render(); },
      press: (m) => press(m, 'api'),
    };
    return root;
  }

  /** Smallest usable area: 2 columns × 3 rows (state + icon buttons). */
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 3 }; }

  global.MaisonAlarm = { create, constraints, MODE_LABEL, STATE_LABEL, ORDER, VARIANTS };
})(window);
