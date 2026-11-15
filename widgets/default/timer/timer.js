/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Timer Widget V1 — a Home Assistant timer.* entity: its state, its time left and Start / Pause / Cancel.

   MaisonTimer.create(config) → HTMLElement (.iq-timer), with el.timer = { getState(), setState(patch) }

   config = {
     id, name, subtitle, variant: 'ring' (default) | 'compact'
     state:       'idle' | 'active' | 'paused'          (as Home Assistant reports it; anything else / available:false → unavailable)
     available:   true
     duration:    300         seconds — the timer's configured duration (HA attribute `duration`)
     remaining:   180         seconds — the time left while PAUSED (HA attribute `remaining`)
     finishesAt:  1760000000000   ms — the moment an ACTIVE timer finishes (HA attribute `finishes_at`)
     onRequest:   (request) => void        'start' | 'pause' | 'cancel'   — linked: the secure HA channel; absent: the demo runs by itself
   }
   TRUTH: the time left of an active timer is finishes_at − now (Home Assistant's own end moment, counted down on this screen's
   clock — it can differ by the clock difference between the two machines); a paused timer shows HA's `remaining`; an idle timer
   shows its configured duration as "Ready". No finish moment while active → "Running" with no countdown (nothing is invented).
   At zero the widget waits for Home Assistant (it says "Finishing…"); it never declares the timer finished itself.
   One 1-second interval per ACTIVE timer on screen, only while the tab is visible.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = { start: S('<path d="M8 5.5v13l10.5-6.5z"/>'), pause: S('<path d="M8.5 5.5v13M15.5 5.5v13"/>'), cancel: S('<rect x="6.5" y="6.5" width="11" height="11" rx="1.6"/>') };
  const fin = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? null : Number(v));
  const fmt = (sec) => { const t = Math.max(0, Math.ceil(sec - 1e-6)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
  const R = 44, CIRC = 2 * Math.PI * R;

  function create(config) {
    let s = { available: true, ...(config || {}) };
    const variant = s.variant === 'compact' ? 'compact' : 'ring';
    const linked = () => typeof s.onRequest === 'function';
    const root = document.createElement('article');
    root.className = 'iq-timer';
    root.dataset.variant = variant;
    root.setAttribute('role', 'timer');
    if (s.id) root.dataset.iqTimerId = s.id;
    root.innerHTML = `<div class="iq-timer__in">
      <header class="iq-timer__head"><h3 class="iq-timer__name"></h3><p class="iq-timer__sub"></p></header>
      <div class="iq-timer__dial"><svg viewBox="0 0 100 100" class="iq-timer__svg" aria-hidden="true"><circle class="iq-timer__track" cx="50" cy="50" r="${R}"/><circle class="iq-timer__arc" cx="50" cy="50" r="${R}" transform="rotate(-90 50 50)" stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="${CIRC.toFixed(2)}"/></svg>
        <div class="iq-timer__read"><b class="iq-timer__time"></b><span class="iq-timer__state"></span></div></div>
      <div class="iq-timer__ctl" role="group" aria-label="Timer controls"></div></div>`;
    const $ = (q) => root.querySelector(q);
    const arc = $('.iq-timer__arc'), ctl = $('.iq-timer__ctl');

    const stateOf = () => {
      if (s.available === false) return 'unavailable';
      const v = String(s.state ?? '').toLowerCase();
      return ['idle', 'active', 'paused'].includes(v) ? v : v === 'unknown' ? 'unknown' : 'unavailable';
    };
    /** seconds left, or null when Home Assistant gives nothing to count (never an invented value) */
    const left = (now = Date.now()) => {
      const st = stateOf();
      if (st === 'active') return fin(s.finishesAt) !== null ? Math.max(0, (Number(s.finishesAt) - now) / 1000) : null;
      if (st === 'paused') return fin(s.remaining);
      return null;
    };
    const total = () => (fin(s.duration) > 0 ? Number(s.duration) : null);

    let pending = '', pendT = 0;
    function request(req) {
      if (['unavailable', 'unknown'].includes(stateOf())) return;
      if (linked()) {
        pending = req; clearTimeout(pendT); pendT = setTimeout(() => { pending = ''; render(); }, 6000);
        s.onRequest(req);
      } else {                                                           // an unlinked demo runs by itself (never Home Assistant)
        const now = Date.now(), l = left(now) ?? fin(s.remaining) ?? total() ?? 0;
        if (req === 'start') s = { ...s, state: 'active', finishesAt: now + (stateOf() === 'paused' ? l : (total() ?? l)) * 1000, remaining: null };
        else if (req === 'pause') s = { ...s, state: 'paused', remaining: l, finishesAt: null };
        else s = { ...s, state: 'idle', remaining: null, finishesAt: null };
      }
      render();
    }
    function buttons(st) {
      const out = [];
      if (st === 'idle') out.push(['start', 'Start']);
      if (st === 'paused') out.push(['start', 'Resume']);
      if (st === 'active') out.push(['pause', 'Pause']);
      if (st === 'active' || st === 'paused') out.push(['cancel', 'Cancel']);
      return out;
    }

    function paint(now = Date.now()) {
      const st = stateOf(), l = left(now), t = total();
      root.dataset.state = st;
      const timeEl = $('.iq-timer__time'), stateEl = $('.iq-timer__state');
      let text, word;
      if (st === 'unavailable' || st === 'unknown') { text = '—'; word = st === 'unknown' ? 'Unknown' : 'Unavailable'; }
      else if (st === 'idle') { text = t !== null ? fmt(t) : '—'; word = t !== null ? 'Ready' : 'Idle'; }
      else if (st === 'active') { text = l === null ? 'Running' : fmt(l); word = l === null ? 'No end time reported' : l <= 0 ? 'Finishing…' : 'Running'; }
      else { text = l === null ? 'Paused' : fmt(l); word = 'Paused'; }
      timeEl.textContent = text; stateEl.textContent = word;
      root.dataset.noCount = l === null && st === 'active' ? 'true' : 'false';
      // the ring drains with the time left (only with both a time left and a duration); idle / unknown: an empty track
      const frac = (st === 'active' || st === 'paused') && l !== null && t !== null ? Math.max(0, Math.min(1, l / t)) : 0;
      arc.setAttribute('stroke-dashoffset', (CIRC * (1 - frac)).toFixed(2));
      root.style.setProperty('--iq-timer-frac', frac.toFixed(4));
      root.setAttribute('aria-label', `${s.name || 'Timer'}: ${word}${l !== null && st !== 'idle' ? `, ${fmt(l)} left` : t !== null && st === 'idle' ? `, ${fmt(t)}` : ''}`);
    }
    function render() {
      const st = stateOf();
      $('.iq-timer__name').textContent = s.name || 'Timer';
      $('.iq-timer__sub').textContent = s.subtitle || ''; $('.iq-timer__sub').hidden = !s.subtitle;
      const list = buttons(st);
      ctl.replaceChildren(...list.map(([req, label]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = `iq-timer__btn iq-timer__btn--${req}`; b.dataset.req = req; b.dataset.iqControl = '';
        b.innerHTML = `${ICON[req]}<span></span>`; b.querySelector('span').textContent = label; b.setAttribute('aria-label', `${label} ${s.name || 'timer'}`);
        b.disabled = !!pending; if (pending === req) b.setAttribute('aria-busy', 'true');
        b.addEventListener('click', (e) => { e.stopPropagation(); request(req); });
        return b;
      }));
      ctl.hidden = !list.length;
      paint();
      schedule();
    }
    let tick = 0;
    function schedule() {
      clearInterval(tick); tick = 0;
      if (stateOf() === 'active' && fin(s.finishesAt) !== null) tick = setInterval(() => { if (!root.isConnected) { clearInterval(tick); tick = 0; return; } if (!document.hidden) paint(); }, 1000);
    }
    // repaint when the tab comes back; the listener goes with the widget (it removes itself once the widget has left the page)
    const onVis = () => { if (!root.isConnected) { document.removeEventListener('visibilitychange', onVis); clearInterval(tick); tick = 0; return; } if (!document.hidden) paint(); };
    document.addEventListener('visibilitychange', onVis);
    render();
    root.timer = {
      getState: () => ({ state: stateOf(), left: left(), duration: total() }),
      /** External update (Home Assistant). Never sends anything. */
      setState(patch = {}) { s = { ...s, ...patch }; pending = ''; clearTimeout(pendT); render(); },
    };
    return root;
  }

  function constraints(config) {
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: config && config.variant === 'compact' ? 1 : 3 };
  }

  global.MaisonTimer = { create, constraints, fmt };
})(window);
