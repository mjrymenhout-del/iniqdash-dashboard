/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Robot Widget V1 — a robot vacuum (Home Assistant vacuum.*) or a robot mower (lawn_mower.*): its state in Home Assistant's
   own words, the battery when one is reported, and ONLY the controls the entity supports. No maps.

   MaisonRobot.create(config) → HTMLElement (.iq-robot), with el.robot = { getState(), setState(patch) }

   config = {
     id, name, subtitle, variant: 'standard' (default) | 'compact' | 'status'
     profile:   'vacuum' | 'mower'                    (a linked widget: the entity's domain decides)
     state:     the entity's state, as reported       (cleaning · docked · idle · paused · returning · error · mowing …)
     available: true
     battery:   null | { state: 'ok', value: 0…100, source } | { state: 'loading' | 'missing' | 'na' }
     fanSpeed:  'Quiet' …  fanSpeeds: ['Quiet', 'Standard', …]        (vacuum, only when the entity reports a list)
     capabilities: { start, pause, stop, dock, locate, spot, fanSpeed }     (what the entity supports — nothing else is offered)
     onRequest: (request, value) => void             (linked: the secure HA channel; absent: the demo changes its own state)
     infoItems: Information lines (read-only)
   }
   Controls are offered by capability AND by what makes sense for the real state (no "Pause" while docked). Unavailable →
   no controls. A pressed control is marked pending until Home Assistant's next state (or a short timeout).
   The layout follows the widget's OWN box (MaisonFit): controls give way by priority as the box shrinks.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    vacuum: S('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6"/><path d="M5.8 6.2A8.5 8.5 0 0 1 12 3.5"/>'),
    mower: S('<path d="M4 15.5h13l2.5-5H8l-1 2.4"/><circle cx="7" cy="17.5" r="2.2"/><circle cx="16.5" cy="17.5" r="2.2"/><path d="M8 10.5 7 6h3"/>'),
    start: S('<path d="M8 5.5v13l10-6.5z"/>'), pause: S('<path d="M8.5 5.5v13M15.5 5.5v13"/>'), stop: S('<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>'),
    dock: S('<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/><path d="M12 18v-5M9.8 15.2 12 13l2.2 2.2"/>'),
    locate: S('<circle cx="12" cy="12" r="2.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="6.5"/>'),
    spot: S('<circle cx="12" cy="12" r="8.5" stroke-dasharray="2.5 3"/><circle cx="12" cy="12" r="3.2"/>'),
  };

  /* The device artwork (trusted inline SVG, themed through CSS variables on .iq-robot). Drawn from above (vacuum) / from the side (mower).
     Motion is state-driven (IniqVisuals layers: stopped by reduced motion, paused off screen) — see motion rules in create(). */
  let artSeq = 0;
  /** inline SVG per profile; gradient ids are unique per instance (a hidden twin must never break another's fill) */
  const art = (kind) => {
    const k = `r${++artSeq}`;
    return kind === 'vacuum' ? `<svg viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="${k}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4c54"/><stop offset=".55" stop-color="#2a2b30"/><stop offset="1" stop-color="#17171a"/></linearGradient>
        <radialGradient id="${k}t" cx=".38" cy=".3" r=".9"><stop offset="0" stop-color="#3a3b42"/><stop offset=".6" stop-color="#26272c"/><stop offset="1" stop-color="#1a1a1e"/></radialGradient>
        <radialGradient id="${k}l" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#4b4d57"/><stop offset="1" stop-color="#0d0d10"/></radialGradient>
      </defs>
      <ellipse cx="60" cy="106" rx="42" ry="6.5" fill="#000" opacity=".42"/>
      <g class="iq-robot__body">
        <circle cx="60" cy="58" r="53" fill="url(#${k}s)"/>
        <path d="M13 44a50 50 0 0 1 94 0" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M18 80a48 48 0 0 0 84 0" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="3" stroke-linecap="round"/>
        <path d="M30 20a50 50 0 0 1 60 0" fill="none" stroke="var(--iq-robot-ring)" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>
        <circle cx="60" cy="58" r="41" fill="url(#${k}t)"/><circle cx="60" cy="58" r="41" fill="none" stroke="rgba(255,255,255,.07)"/>
        <circle cx="60" cy="58" r="28" fill="none" stroke="rgba(0,0,0,.4)" stroke-width="1.5"/>
        <g stroke="rgba(255,255,255,.07)" stroke-width="1"><path d="M60 22v10M60 84v10M24 58h10M86 58h10"/></g>
        <circle cx="60" cy="58" r="13" fill="url(#${k}l)"/><circle cx="60" cy="58" r="13" fill="none" stroke="rgba(255,255,255,.16)"/>
        <ellipse cx="55" cy="53" rx="5" ry="3" fill="rgba(255,255,255,.2)"/>
        <rect x="46" y="86" width="28" height="5" rx="2.5" fill="rgba(0,0,0,.5)"/><rect x="50" y="87" width="20" height="3" rx="1.5" fill="var(--iq-robot-ring)"/>
        <g transform="translate(27 26)"><g class="iq-robot__brush"><circle r="3.2" fill="#0d0d10"/><path d="M0 0 11 -5M0 0 -10 -6M0 0 1 12" stroke="var(--iq-robot-ring)" stroke-width="2.6" stroke-linecap="round"/><path d="M0 0 11 -5M0 0 -10 -6M0 0 1 12" stroke="rgba(255,255,255,.25)" stroke-width=".8" stroke-linecap="round"/></g></g>
      </g></svg>` : `<svg viewBox="0 0 160 100" aria-hidden="true">
      <defs>
        <linearGradient id="${k}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a9098"/><stop offset=".5" stop-color="#565b63"/><stop offset="1" stop-color="#383b41"/></linearGradient>
        <linearGradient id="${k}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f3238"/><stop offset="1" stop-color="#17181b"/></linearGradient>
        <radialGradient id="${k}w" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#4a4d54"/><stop offset="1" stop-color="#0e0f11"/></radialGradient>
      </defs>
      <ellipse cx="80" cy="90" rx="62" ry="6" fill="#000" opacity=".45"/>
      <g class="iq-robot__body">
        <path d="M20 66c0-20 13-37 33-42l36-8c18-4 36 7 41 25l5 25H20z" fill="url(#${k}s)"/>
        <path d="M32 58c3-13 14-24 30-28l28-6c11-3 22 4 26 15" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-linecap="round"/>
        <path d="M22 70h116v6a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z" fill="url(#${k}d)"/>
        <path d="M36 62c16-3 36-4 52-3 18 1 32 4 42 8" fill="none" stroke="var(--iq-robot-ring)" stroke-width="3" stroke-linecap="round" opacity=".9"/>
        <rect x="72" y="30" width="26" height="11" rx="5.5" fill="url(#${k}d)"/><circle cx="80" cy="35.5" r="3" fill="var(--iq-robot-ring)"/><rect x="86" y="33.5" width="9" height="4" rx="2" fill="rgba(255,255,255,.18)"/>
        <g transform="translate(46 80)"><g class="iq-robot__wheel"><circle r="15" fill="url(#${k}w)"/><circle r="15" fill="none" stroke="rgba(255,255,255,.12)"/><circle r="9" fill="#2a2c31"/><path d="M0 -9V9M-9 0H9M-6.4 -6.4 6.4 6.4M-6.4 6.4 6.4 -6.4" stroke="rgba(255,255,255,.22)" stroke-width="1.6"/><circle r="2.6" fill="#8a9098"/></g></g>
        <g transform="translate(118 82)"><g class="iq-robot__wheel"><circle r="11" fill="url(#${k}w)"/><circle r="11" fill="none" stroke="rgba(255,255,255,.12)"/><circle r="6" fill="#2a2c31"/><path d="M0 -6V6M-6 0H6" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/><circle r="2" fill="#8a9098"/></g></g>
      </g></svg>`;
  };
  const ART = { get vacuum() { return art('vacuum'); }, get mower() { return art('mower'); } };
  const clean = (v) => { const t = String(v ?? '').replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const ACTIVE = ['cleaning', 'mowing'];
  /** what the state means for the controls (anything unknown stays neutral: only the supported, state-independent controls) */
  const phase = (st) => (ACTIVE.includes(st) ? 'active' : ['docked', 'idle', 'paused', 'returning', 'error'].includes(st) ? st : 'other');
  const DEFAULT_LABEL = { start: 'Start', resume: 'Resume', pause: 'Pause', stop: 'Stop', dock: 'Return to dock', locate: 'Locate', spot: 'Spot clean' };

  function create(config) {
    let s = { available: true, capabilities: {}, ...(config || {}) };
    const variant = ['compact', 'status'].includes(s.variant) ? s.variant : 'standard';
    const kind = () => (s.profile === 'mower' ? 'mower' : 'vacuum');
    const linked = () => typeof s.onRequest === 'function';
    const name = () => s.name || (kind() === 'mower' ? 'Mower' : 'Vacuum');

    const root = document.createElement('article');
    root.className = 'iq-robot';
    root.dataset.variant = variant;
    root.setAttribute('role', 'group');
    if (s.id) root.dataset.iqRobotId = s.id;
    root.innerHTML = `
      <div class="iq-robot__in">
        <header class="iq-robot__head"><h3 class="iq-robot__name"></h3><p class="iq-robot__sub"></p></header>
        <div class="iq-robot__main">
          <span class="iq-robot__art" aria-hidden="true"></span>
          <span class="iq-robot__icon"></span>
          <div class="iq-robot__st"><b class="iq-robot__state"></b><span class="iq-robot__note"></span></div>
          <div class="iq-robot__bat" role="img"><span class="iq-robot__bar"><i></i></span><b class="iq-robot__pct"></b></div>
        </div>
        <div class="iq-robot__ctl" role="group" aria-label="Controls"></div>
        <label class="iq-robot__fan"><span>Suction</span><select class="iq-robot__fan-sel"></select></label>
        <p class="iq-robot__info"></p>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const ctl = $('.iq-robot__ctl'), fanSel = $('.iq-robot__fan-sel'), fanBox = $('.iq-robot__fan');
    let pending = '', pendT = 0;
    const V = global.IniqVisuals;
    let artKind = '', motion = null;
    /** the artwork follows the profile (vacuum / mower); its motion rules are DATA for the shared visual layers */
    function paintArt() {
      if (artKind === kind()) return;
      artKind = kind();
      if (motion) { motion.destroy(); motion = null; }
      const art = $('.iq-robot__art');
      art.innerHTML = ART[artKind];
      if (!V) return;
      const on = { state: ['cleaning', 'mowing'] }, back = { state: 'returning' };
      motion = V.layers(artKind === 'vacuum' ? [
        { target: art.querySelector('.iq-robot__brush'), rules: [{ when: on, animate: { type: 'rotate', duration: 0.9 } }, { when: back, animate: { type: 'rotate', duration: 1.8 } }] },
        { target: art.querySelector('.iq-robot__body'), rules: [{ when: on, animate: { type: 'oscillate', duration: 3.2, intensity: 0.12 } }, { when: back, animate: { type: 'oscillate', duration: 4.5, intensity: 0.08 } }] },
      ] : [
        ...[...art.querySelectorAll('.iq-robot__wheel')].map((w) => ({ target: w, rules: [{ when: on, animate: { type: 'rotate', duration: 2.4 } }, { when: back, animate: { type: 'rotate', duration: 3.6 } }] })),
        { target: art.querySelector('.iq-robot__body'), rules: [{ when: on, animate: { type: 'oscillate', duration: 2.6, intensity: 0.05 } }] },
      ]);
    }

    /* ---- the controls that apply now: [request, label, icon, priority] — never one the entity does not support */
    function wanted() {
      const c = s.capabilities || {}, ph = phase(String(s.state ?? '').toLowerCase()), out = [];
      if (s.available === false || variant === 'status') return out;
      const st = String(s.state ?? '').toLowerCase();
      if (c.start && ph !== 'active') out.push(['start', st === 'paused' ? DEFAULT_LABEL.resume : (kind() === 'mower' ? 'Start mowing' : 'Start'), 'start', 1]);
      if (c.pause && (ph === 'active' || ph === 'returning')) out.push(['pause', DEFAULT_LABEL.pause, 'pause', 1]);
      if (c.dock && ph !== 'docked' && ph !== 'returning') out.push(['dock', kind() === 'mower' ? 'Dock' : DEFAULT_LABEL.dock, 'dock', 2]);
      if (c.stop && (ph === 'active' || ph === 'paused' || ph === 'returning')) out.push(['stop', DEFAULT_LABEL.stop, 'stop', 3]);
      if (c.spot && ph !== 'active' && ph !== 'returning') out.push(['spot', DEFAULT_LABEL.spot, 'spot', 4]);
      if (c.locate) out.push(['locate', DEFAULT_LABEL.locate, 'locate', 5]);
      return out;
    }
    function request(req, value) {
      if (s.available === false) return;
      pending = req; clearTimeout(pendT); pendT = setTimeout(() => { pending = ''; render(); }, 6000);
      if (linked()) s.onRequest(req, value);
      else {                                                   // an unlinked demo: it changes its own state (never Home Assistant)
        const next = { start: kind() === 'mower' ? 'mowing' : 'cleaning', pause: 'paused', stop: 'idle', dock: 'docked' }[req];
        if (next) s = { ...s, state: next };
        if (req === 'fan_speed') s = { ...s, fanSpeed: value };
        pending = '';
      }
      render();
    }
    fanSel.addEventListener('change', () => request('fan_speed', fanSel.value));
    fanSel.dataset.iqControl = '';

    function batteryText() {
      const b = s.battery;
      if (!b) return '';
      if (b.state === 'ok') return `${Math.round(b.value)}%`;
      return b.state === 'loading' ? '…' : b.state === 'missing' ? 'Battery entity not found' : 'Battery unavailable';
    }
    function render() {
      const st = String(s.state ?? ''), low = st.toLowerCase();
      const na = s.available === false || ['unavailable', 'unknown'].includes(low);
      root.dataset.kind = kind(); root.dataset.phase = na ? 'na' : phase(low); root.dataset.hasSub = s.subtitle ? 'true' : 'false';
      $('.iq-robot__name').textContent = name();
      $('.iq-robot__sub').textContent = s.subtitle || ''; $('.iq-robot__sub').hidden = !s.subtitle;
      $('.iq-robot__icon').innerHTML = ICONS[kind()];
      paintArt();
      if (motion) motion.update({ state: na ? 'still' : low, available: !na });
      $('.iq-robot__state').textContent = na ? (low === 'unknown' ? 'Unknown' : 'Unavailable') : clean(st);
      const b = s.battery, bt = batteryText();
      const bat = $('.iq-robot__bat');
      bat.hidden = !bt;
      bat.dataset.level = b && b.state === 'ok' ? (b.value <= 15 ? 'low' : 'ok') : 'na';
      $('.iq-robot__bar i').style.width = b && b.state === 'ok' ? `${Math.max(0, Math.min(100, b.value))}%` : '0%';
      $('.iq-robot__bar').hidden = !(b && b.state === 'ok');
      $('.iq-robot__pct').textContent = bt;
      bat.setAttribute('aria-label', bt ? `Battery ${bt}` : '');
      $('.iq-robot__note').textContent = variant === 'compact' ? name() : (s.fanSpeed && !na ? `Suction ${clean(s.fanSpeed)}` : '');
      // controls
      const list = wanted();
      ctl.replaceChildren(...list.map(([req, label, icon, prio]) => {
        const bt = document.createElement('button');
        bt.type = 'button'; bt.className = 'iq-robot__btn'; bt.dataset.req = req; bt.dataset.prio = String(prio); bt.dataset.iqControl = '';
        bt.innerHTML = `<span class="iq-robot__bi">${ICONS[icon]}</span><span class="iq-robot__bl"></span>`;
        bt.querySelector('.iq-robot__bl').textContent = label;
        bt.setAttribute('aria-label', label);
        if (pending === req) { bt.dataset.pending = 'true'; bt.setAttribute('aria-busy', 'true'); }
        bt.disabled = !!pending;
        bt.addEventListener('click', (e) => { e.stopPropagation(); request(req); });
        return bt;
      }));
      ctl.hidden = !list.length;
      const speeds = Array.isArray(s.fanSpeeds) ? s.fanSpeeds : [];
      const showFan = !!(s.capabilities && s.capabilities.fanSpeed) && speeds.length > 0 && !na && variant === 'standard';
      fanBox.hidden = !showFan;
      if (showFan) { fanSel.replaceChildren(...speeds.map((v) => { const o = document.createElement('option'); o.value = v; o.textContent = clean(v); return o; })); fanSel.value = s.fanSpeed ?? ''; fanSel.disabled = !!pending; }
      const info = Array.isArray(s.infoItems) ? s.infoItems.map((x) => x && x.line).filter(Boolean).join(' · ') : '';
      $('.iq-robot__info').textContent = info; $('.iq-robot__info').hidden = !info;
      root.setAttribute('aria-label', `${name()}: ${na ? 'unavailable' : clean(st)}${bt && s.battery && s.battery.state === 'ok' ? `, battery ${bt}` : ''}`);
      requestFit();
    }
    /* the controls give way by priority until they fit their row (the box is the widget's own) */
    let fitQ = false;
    const requestFit = () => { if (fitQ) return; fitQ = true; Promise.resolve().then(() => { fitQ = false; fitControls(); }); };
    function fitControls() {
      if (!root.isConnected || ctl.hidden || ctl.offsetParent === null) return;
      const bs = [...ctl.children];
      bs.forEach((b) => b.classList.remove('iq-robot__btn--cut'));
      root.classList.remove('iq-robot--icons');
      if (ctl.scrollWidth <= ctl.clientWidth + 1) return;
      root.classList.add('iq-robot--icons');                    // labels go first
      const order = bs.slice().sort((a, b) => Number(b.dataset.prio) - Number(a.dataset.prio));
      for (const b of order) { if (ctl.scrollWidth <= ctl.clientWidth + 1 || bs.filter((x) => !x.classList.contains('iq-robot__btn--cut')).length <= 1) break; b.classList.add('iq-robot__btn--cut'); }
    }
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => (h < 110 || w < 150 ? 'micro' : w >= h * 1.6 ? 'wide' : 'stack'), onChange: () => requestFit() });
    render();
    root.robot = {
      getState: () => ({ state: s.state, available: s.available !== false, battery: s.battery && s.battery.state === 'ok' ? s.battery.value : null, controls: wanted().map((x) => x[0]) }),
      /** External update (Home Assistant). Never sends anything. */
      setState(patch = {}) { s = { ...s, ...patch }; pending = ''; clearTimeout(pendT); render(); },
    };
    return root;
  }

  function constraints(config) {
    const v = config && config.variant;
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: v === 'status' || v === 'compact' ? 1 : 2 };
  }

  global.MaisonRobot = { create, constraints, ICONS };
})(window);
