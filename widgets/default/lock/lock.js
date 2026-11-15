/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Lock Widget V1 — shows a lock's real state and asks to lock / unlock (/ open).
   No PIN or access-code management: Home Assistant stays responsible for that.

   MaisonLock.create(config) → HTMLElement (.lk), with el.lock = { getState(), setState(patch) }
   config = {
     id, name, subtitle
     state:          'locked' | 'unlocked' | 'locking' | 'unlocking' | 'jammed' | 'open' | 'opening'
                     | 'unavailable' | 'unknown'
     available:      true
     capabilities:   { lock: true, unlock: true, open: false }   (open = unlatch, only if supported)
     confirmUnlock:  true      Unlock / Open need a second, deliberate press (accidental-press guard)
     confirmTimeout: 4000      ms the confirmation stays armed
     onRequest:      (request: 'lock'|'unlock'|'open', { source }) => void   — the HA layer decides
   }
   A request shows 'locking' / 'unlocking' at once; the real result comes back via setState().
   Responsive (MaisonFit): row (shallow boxes, or a long strip ≥ 2.4 : 1 under 240px:
   glyph · state · button) or stacked (a tall / large stack centres a larger glyph, lock.css); sizes scale.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const GLYPH = {
    locked: S('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2"/>'),
    unlocked: S('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/><path d="M12 14.5v2"/>'),
    jammed: S('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 13.5v3M12 18.4v.1"/>'),
    open: S('<path d="M5 20.5V4.5h9v16"/><path d="M14 4.5l5 2v14l-5-1"/><path d="M11.5 12.5v.1"/>'),
  };
  const LABEL = { locked: 'Locked', unlocked: 'Unlocked', locking: 'Locking…', unlocking: 'Unlocking…', jammed: 'Jammed', open: 'Open', opening: 'Opening…', unavailable: 'Unavailable', unknown: 'Unknown' };
  const ACT = { lock: 'Lock', unlock: 'Unlock', open: 'Open' };

  function stateOf(s) {
    if (s.available === false) return 'unavailable';
    const v = String(s.state ?? '').toLowerCase();
    return LABEL[v] ? v : 'unknown';
  }

  function create(config) {
    let s = { state: 'locked', available: true, confirmUnlock: true, confirmTimeout: 4000, ...(config || {}) };
    const c = { lock: true, unlock: true, open: false, ...(s.capabilities || {}) };
    const root = document.createElement('article');
    root.className = 'lk';
    if (s.id) root.dataset.lockId = s.id;
    root.innerHTML = `
      <div class="lk__in">
        <div class="lk__glyph"></div>
        <div class="lk__id"><h3 class="lk__name"></h3><p class="lk__sub"></p></div>
        <p class="lk__state" aria-live="polite"><b></b><span class="lk__hint"></span></p>
        <p class="lk__info"></p>
        <div class="lk__ctrls" role="group"></div>
      </div>`;
    const $ = (q) => root.querySelector(q);
    let armed = null, tArm = 0;
    const btns = {};
    ['lock', 'unlock', 'open'].filter((k) => c[k]).forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `lk__btn lk__btn--${k}`;
      b.dataset.request = k;
      b.addEventListener('click', () => press(k, 'user'));
      btns[k] = b;
      $('.lk__ctrls').appendChild(b);
    });

    const needsConfirm = (k) => s.confirmUnlock !== false && (k === 'unlock' || k === 'open');
    function press(k, source) {
      const st = stateOf(s);
      if (st === 'unavailable' || !btns[k]) return false;
      if (needsConfirm(k) && armed !== k) {
        armed = k; clearTimeout(tArm);
        tArm = setTimeout(() => { armed = null; render(); }, s.confirmTimeout);
        render();
        return 'confirm';
      }
      armed = null; clearTimeout(tArm);
      s = { ...s, state: k === 'lock' ? 'locking' : k === 'unlock' ? 'unlocking' : 'opening' };
      render();
      if (typeof s.onRequest === 'function') s.onRequest(k, { source });
      return true;
    }

    function render() {
      const st = stateOf(s);
      root.dataset.state = st;
      root.dataset.armed = armed || '';
      $('.lk__glyph').innerHTML = GLYPH[st === 'jammed' ? 'jammed' : st === 'open' || st === 'opening' ? 'open' : st === 'locked' || st === 'locking' ? 'locked' : 'unlocked'];
      $('.lk__name').textContent = s.name || 'Lock';
      $('.lk__sub').textContent = s.subtitle || '';
      $('.lk__sub').hidden = !s.subtitle;
      $('.lk__state b').textContent = LABEL[st];
      // linked: Information slots (e.g. "Battery 80%", "Door Closed") — other HA entities, read-only
      const info = Array.isArray(s.infoItems) ? s.infoItems.map((x) => x && x.line).filter(Boolean).join(' · ') : '';
      $('.lk__info').textContent = info;
      $('.lk__info').hidden = !info;
      $('.lk__hint').textContent = armed ? `Press again to ${ACT[armed].toLowerCase()}` : '';
      const ok = st !== 'unavailable';
      // the useful action first: a locked door offers Unlock, an unlocked one Lock; jammed/unknown offer both
      const settled = st === 'locked' || st === 'unlocked' || st === 'open';
      Object.entries(btns).forEach(([k, b]) => {
        const relevant = !settled || (k === 'lock' ? st !== 'locked' : k === 'unlock' ? st === 'locked' : st !== 'open');
        b.hidden = !relevant;
        b.disabled = !ok || st.endsWith('ing');
        b.textContent = armed === k ? `Confirm ${ACT[k].toLowerCase()}` : ACT[k];
        b.setAttribute('aria-label', armed === k ? `Press again to ${ACT[k].toLowerCase()} ${s.name || 'the lock'}` : `${ACT[k]} ${s.name || 'the lock'}`);
        b.classList.toggle('is-armed', armed === k);
      });
    }

    render();
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => (h < 150 || (h < 240 && w >= h * 2.4) ? 'row' : 'stack') });
    root.lock = {
      getState: () => ({ state: stateOf(s), armed }),
      /** the lock's real state (Home Assistant / demo). Never calls onRequest. */
      setState(patch) { s = { ...s, ...patch }; render(); },
      press: (k) => press(k, 'api'),
    };
    return root;
  }

  /** Smallest usable area: 2 × 2 (row: glyph, state, one button). */
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }; }

  global.MaisonLock = { create, constraints, LABEL };
})(window);
