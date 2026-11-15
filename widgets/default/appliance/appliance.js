/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Appliance Widget V1 — status/control summary for appliances with an operating cycle
   (washer, dryer, dishwasher, oven, robot vacuum, coffee machine, generic).

   MaisonAppliance.create(config) → HTMLElement (.ap), with el.appliance = { getState(), setState(patch) }

   config = {
     id, name, subtitle
     icon:        'washer' | 'dryer' | 'dishwasher' | 'oven' | 'vacuum' | 'coffee' | 'generic' | raw SVG
     image, imageOff, imageRatio   optional PNG device artwork (replaces the icon when it loads)
     state:       'running' | 'paused' | 'finished' | 'idle' | 'off' | 'heating' | 'error' | 'unavailable' | 'unknown'
                  | 'other' (a live state without one of these meanings: neutral tone, the status text says what it is)
     available:   true
     status:      'Running'      — text shown; defaults to a label for the state
     programme:   'Cotton'       (optional)   remaining: 42 (minutes) or '42 min' (optional)
     progress:    0…100           (optional)   secondary: '40 °C · 1400 rpm' (optional text)
     actions:     [{ id: 'pause', label: 'Pause' }]   — ONLY what configuration provides
     infoItems:   linked to Home Assistant: resolved Information slots (other HA entities chosen in Settings), read-only:
                  [{ line: 'Door Closed', … }] — shown as given (instead of programme · remaining · secondary), never interpreted
     onAction:    (actionId, { source }) => void      — a request; the real state comes back via setState()
   }
   The widget shows supplied information; it contains no appliance-specific logic.

   PROFILES — WHAT kind of appliance it is (config.profile). Not a Variant: the Variant is HOW a profile is presented.
     generic (default; no profile key)   everything above, exactly as before
     washer  (Washing Machine)            createWasher() below — a layered machine (body · drum · door · effect) whose drum
                                          turns from the CONFIRMED state's visual concept; variants Artwork / Compact
   A profile maps the appliance's REAL state to a visual concept only through its own table (PROFILES.washer.suggest) and
   the owner's explicit state mapping (config.stateMap); anything else is 'other' — shown in Home Assistant's words with a
   neutral visual, never guessed into a phase.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    washer: S('<rect x="4.5" y="3" width="15" height="18" rx="2.5"/><path d="M4.5 7.5h15"/><circle cx="12" cy="14" r="4.2"/><circle cx="7.5" cy="5.3" r=".5" fill="currentColor"/>'),
    dryer: S('<rect x="4.5" y="3" width="15" height="18" rx="2.5"/><path d="M4.5 7.5h15"/><circle cx="12" cy="14" r="4.2"/><path d="M10.5 12.5c1 .5 2 .5 3 0M10.5 15.5c1 .5 2 .5 3 0"/>'),
    dishwasher: S('<rect x="4.5" y="3" width="15" height="18" rx="2.5"/><path d="M4.5 7.5h15M8 11h8M8 14.5h8M8 18h8"/>'),
    oven: S('<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 8h17"/><rect x="7" y="11" width="10" height="6.5" rx="1"/><circle cx="7" cy="5.8" r=".5" fill="currentColor"/><circle cx="10" cy="5.8" r=".5" fill="currentColor"/>'),
    vacuum: S('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v3"/>'),
    coffee: S('<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8.5 3.5c0 1.2 1 1.4 1 2.6M12 3.5c0 1.2 1 1.4 1 2.6"/>'),
    generic: S('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="12" r="3.5"/>'),
  };
  const ACTION_ICONS = {
    start: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.9l10-6.4a1 1 0 0 0 0-1.7l-10-6.4A1 1 0 0 0 8 5.6z"/></svg>',
    resume: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.9l10-6.4a1 1 0 0 0 0-1.7l-10-6.4A1 1 0 0 0 8 5.6z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  };
  const LABEL = { running: 'Running', paused: 'Paused', finished: 'Finished', idle: 'Idle', off: 'Off', heating: 'Heating', error: 'Error', other: 'On', unavailable: 'Unavailable', unknown: 'Unknown' };
  const ACTIVE = ['running', 'heating'];

  const stateOf = (s) => {
    if (s.available === false) return 'unavailable';
    const v = String(s.state ?? '').toLowerCase();
    return LABEL[v] ? v : v ? 'unknown' : 'unavailable';
  };
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  function remainingText(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'string') return v;
    const m = num(v); if (m === null) return '';
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`;
  }

  function create(config) {
    let s = { available: true, actions: [], ...(config || {}) };
    const root = document.createElement('article');
    root.className = 'ap';
    if (s.id) root.dataset.applianceId = s.id;
    root.innerHTML = `
      <div class="ap__in">
        <div class="ap__vis"><img alt="" decoding="async" draggable="false"><span class="ap__icon"></span></div>
        <div class="ap__id"><h3 class="ap__name"></h3><p class="ap__sub"></p></div>
        <p class="ap__status"><i class="ap__dot" aria-hidden="true"></i><b class="ap__status-t"></b></p>
        <p class="ap__meta"></p>
        <div class="ap__prog" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span class="ap__bar"><i></i></span><b class="ap__pct"></b></div>
        <div class="ap__acts"></div>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const img = $('.ap__vis img');
    img.addEventListener('error', () => { root.dataset.art = 'failed'; });

    // actions: only those configuration provides
    const acts = (s.actions || []).filter((a) => a && a.id).map((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ap__act';
      b.dataset.action = a.id;
      b.innerHTML = `${ACTION_ICONS[a.id] || ''}<span></span>`;
      b.querySelector('span').textContent = a.label || a.id;
      b.setAttribute('aria-label', `${a.label || a.id} ${s.name || 'appliance'}`);
      b.addEventListener('click', () => { if (typeof s.onAction === 'function' && !b.disabled) s.onAction(a.id, { source: 'user' }); });
      $('.ap__acts').appendChild(b);
      return b;
    });
    root.dataset.hasActions = acts.length ? 'true' : 'false';

    function render() {
      const st = stateOf(s), live = st !== 'unavailable' && st !== 'unknown';
      root.dataset.state = st;
      root.dataset.active = ACTIVE.includes(st) ? 'true' : 'false';
      root.dataset.hasSub = s.subtitle ? 'true' : 'false';
      $('.ap__icon').innerHTML = ICONS[s.icon] || (String(s.icon || '').trim().startsWith('<svg') ? s.icon : ICONS.generic);
      const src = (st === 'off' || st === 'idle') && s.imageOff ? s.imageOff : s.image;
      if (src) { if (img.getAttribute('src') !== src) { root.dataset.art = 'yes'; img.src = src; } }
      else { root.dataset.art = 'none'; img.removeAttribute('src'); }
      if (s.imageRatio) root.style.setProperty('--ap-art-ratio', s.imageRatio);

      $('.ap__name').textContent = s.name || 'Appliance';
      $('.ap__sub').textContent = s.subtitle || '';
      $('.ap__sub').hidden = !s.subtitle;
      $('.ap__status-t').textContent = live ? (s.status || LABEL[st]) : LABEL[st];

      const info = Array.isArray(s.infoItems) ? s.infoItems.map((x) => x && x.line).filter(Boolean) : null;
      const meta = info || (live ? [s.programme, remainingText(s.remaining), s.secondary].filter(Boolean) : []);
      $('.ap__meta').textContent = meta.join(' · ');
      $('.ap__meta').hidden = !meta.length;
      root.dataset.hasMeta = meta.length ? 'true' : 'false';

      const p = live ? num(s.progress) : null;
      const prog = $('.ap__prog');
      prog.hidden = p === null;
      root.dataset.hasProgress = p === null ? 'false' : 'true';
      if (p !== null) {
        const v = Math.max(0, Math.min(100, Math.round(p)));
        prog.style.setProperty('--ap-p', v / 100);
        prog.setAttribute('aria-valuenow', String(v));
        prog.setAttribute('aria-label', `${s.name || 'Appliance'} progress`);
        $('.ap__pct').textContent = `${v}%`;
      }
      acts.forEach((b) => { b.disabled = !live; });
    }

    render();
    root.appliance = {
      getState: () => ({ state: stateOf(s), status: s.status ?? null, programme: s.programme ?? null, progress: num(s.progress), remaining: s.remaining ?? null }),
      /** External update (later: Home Assistant). Never calls onAction. */
      setState(patch) { s = { ...s, ...patch }; render(); },
    };
    return root;
  }

  /** minW 2, minH 3 (icon/art, name, status, programme · remaining, progress bar fit a 144px tile).
      As a wide strip (≥ 480px) everything sits on one line: { span: 'wide' } → minH 2. */
  function constraints(config, opts = {}) {
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: opts.span === 'wide' ? 2 : 3 };
  }

  /* ==========================================================================
     PROFILE: WASHING MACHINE (config.profile = 'washer')

     config = {
       name, subtitle, variant: 'artwork' (default) | 'compact'
       LINKED (from the binding — Home Assistant only, never demo values):
         ha:       { state, text, available, domain, dc }   the PRIMARY entity: its raw state and HA's words for it
         stateMap: { washing: ['Wash', 'Main wash'], … }     the owner's explicit state mapping (case-insensitive)
         mapped:   { program, remaining, progress, power, door, start, pause, programSelect }  each null (not mapped) or
                   { state: 'loading' | 'missing' | 'ready', entity, available, text, … } — resolved by the binding
         controls: { start, pause, program }                 true only for an explicitly mapped, supported entity
         haAction(role, value) → Promise<{ ok, error? }>     the binding's secure request (start / pause / program)
       DEMO (unlinked): state (a visual concept), programme, remaining (min), progress, demoPower, demoDoor
       infoItems: Information lines (read-only)
     }
     ========================================================================== */
  const W_CONCEPTS = ['off', 'idle', 'running', 'washing', 'rinsing', 'spinning', 'paused', 'finished', 'error'];
  const W_LABEL = { off: 'Off', idle: 'Idle', running: 'Running', washing: 'Washing', rinsing: 'Rinsing', spinning: 'Spinning', paused: 'Paused',
    finished: 'Finished', error: 'Error', other: '', unavailable: 'Unavailable', unknown: 'Unknown' };
  /** suggestions only: common words, matched whole (case and _ / - ignored). The owner's mapping always wins. */
  const W_SUGGEST = {
    off: ['off'], idle: ['idle', 'ready', 'standby'], running: ['running', 'run', 'in progress'],
    washing: ['washing', 'wash', 'main wash', 'prewash', 'pre wash'], rinsing: ['rinsing', 'rinse'], spinning: ['spinning', 'spin'],
    paused: ['paused', 'pause'], finished: ['finished', 'complete', 'completed', 'done'], error: ['error', 'fault', 'failure'],
  };
  const W_ACTIVE = ['running', 'washing', 'rinsing', 'spinning'];
  const wKey = (v) => String(v ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  /** the visual concept of a REAL state: the owner's mapping, then the profile's suggestions, else 'other' (neutral) */
  function washerConcept(raw, stateMap, meta = {}) {
    const k = wKey(raw);
    if (!k) return 'other';
    if (stateMap && typeof stateMap === 'object') {
      for (const c of W_CONCEPTS) if (Array.isArray(stateMap[c]) && stateMap[c].some((x) => wKey(x) === k)) return c;
    }
    // a binary "running" sensor: Home Assistant's own semantics (on = running)
    if (meta.domain === 'binary_sensor' && meta.dc === 'running') return k === 'on' ? 'running' : k === 'off' ? 'off' : 'other';
    for (const c of W_CONCEPTS) if (W_SUGGEST[c].includes(k)) return c;
    return 'other';
  }

  /* ---- original artwork (IniqDash's own SVG geometry, theme tokens only), a graphite front-loader seen from the front:
          body (cabinet · control panel · chrome door ring · dark gasket)  →  drum (turns, behind the glass)  →  door glass (reflections)
     Every gradient id is unique per instance; layers share the porthole centre (50, 71) / radius 36 of the 100 × 120 body. ---- */
  let wUid = 0;
  const W_BODY = (id) => `<svg viewBox="0 0 100 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--apw-body-top)"/><stop offset=".55" stop-color="var(--apw-body)"/><stop offset="1" stop-color="var(--apw-body-low)"/></linearGradient>
      <linearGradient id="${id}e" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".12" stop-color="#fff" stop-opacity="0"/><stop offset=".88" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
      <linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--apw-panel-top)"/><stop offset="1" stop-color="var(--apw-panel)"/></linearGradient>
      <linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6fa"/><stop offset=".35" stop-color="#8f95a1"/><stop offset=".6" stop-color="#d9dde5"/><stop offset="1" stop-color="#4b4f58"/></linearGradient>
      <radialGradient id="${id}s" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="50" cy="117.4" rx="46" ry="3.4" fill="url(#${id}s)"/>
    <rect x="3" y="2" width="94" height="113" rx="9" fill="url(#${id}c)" stroke="var(--apw-edge)" stroke-width=".8"/>
    <rect x="3" y="2" width="94" height="113" rx="9" fill="url(#${id}e)"/>
    <path d="M6 3.2h88" stroke="#fff" stroke-opacity=".28" stroke-width=".8" stroke-linecap="round"/>
    <rect x="7" y="6" width="86" height="19" rx="5" fill="url(#${id}p)" stroke="#000" stroke-opacity=".35" stroke-width=".6"/>
    <rect class="apw__lcd" x="12" y="10" width="28" height="11" rx="2.6"/>
    <g class="apw__lcd-t"><rect x="15" y="13.2" width="9" height="1.8" rx=".9"/><rect x="15" y="16.6" width="17" height="1.4" rx=".7"/></g>
    <g fill="var(--apw-btn)"><circle cx="49" cy="15.5" r="2.2"/><circle cx="56" cy="15.5" r="2.2"/><circle cx="63" cy="15.5" r="2.2"/></g>
    <circle cx="82" cy="15.5" r="7" fill="var(--apw-knob-bg)" stroke="#000" stroke-opacity=".45" stroke-width=".8"/>
    <circle cx="82" cy="15.5" r="5.2" fill="none" stroke="var(--apw-knob)" stroke-opacity=".55" stroke-width=".5"/>
    <path d="M82 11.4v3.4" stroke="var(--apw-tone)" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="50" cy="71" r="39" fill="#0b0b0d" opacity=".55"/>
    <circle cx="50" cy="71" r="38" fill="none" stroke="url(#${id}r)" stroke-width="3.4"/>
    <circle cx="50" cy="71" r="35.2" fill="#0a0a0c" stroke="#000" stroke-opacity=".6" stroke-width=".6"/>
    <rect x="8" y="110" width="12" height="3.4" rx="1.4" fill="#000" opacity=".5"/><rect x="80" y="110" width="12" height="3.4" rx="1.4" fill="#000" opacity=".5"/></svg>`;
  const W_DRUM = (id) => `<svg viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="${id}d" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="var(--apw-drum-core)"/><stop offset=".5" stop-color="var(--apw-drum)"/><stop offset=".86" stop-color="var(--apw-drum-rim)"/><stop offset="1" stop-color="var(--apw-drum)"/></radialGradient>
    <radialGradient id="${id}v" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#${id}d)"/>
    ${[[41, 18, 1.9], [31, 14, 1.6], [21, 9, 1.3]].map(([r, n, h]) => `<g fill="var(--apw-hole)">${Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + (r % 2) * 0.2; return `<circle cx="${(50 + Math.cos(a) * r).toFixed(1)}" cy="${(50 + Math.sin(a) * r).toFixed(1)}" r="${h}"/>`; }).join('')}</g>`).join('')}
    <g fill="var(--apw-lifter)">${[0, 120, 240].map((d) => `<path d="M45.5 3h9l-1.8 14h-5.4z" transform="rotate(${d} 50 50)"/>`).join('')}</g>
    <g class="apw__laundry"><path d="M24 66c6-10 18-12 27-6 6 4 14 3 20-2 4 9 0 20-12 24-13 5-31-2-35-16z" fill="var(--apw-cloth-a)"/>
    <path d="M38 74c5-6 14-6 20-1-3 6-14 9-20 1z" fill="var(--apw-cloth-b)"/></g>
    <circle cx="50" cy="50" r="48" fill="url(#${id}v)"/></svg>`;
  const W_DOOR = (id) => `<svg viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="${id}g" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#cfe2ff" stop-opacity=".16"/><stop offset=".6" stop-color="#9fb4d4" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
    <linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <circle cx="50" cy="50" r="47" fill="url(#${id}g)"/>
    <circle cx="50" cy="50" r="45" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="3"/>
    <path d="M17 36a36 36 0 0 1 30-23c-14 5-24 14-30 23z" fill="url(#${id}h)" opacity=".75"/>
    <path d="M30 24a30 30 0 0 1 20-8" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2" stroke-linecap="round"/>
    <path d="M73 76a33 33 0 0 1-12 9" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  /** the mini porthole (Compact, very small Artwork): the same drum + door, no body (its own gradient ids) */
  const W_MINI = (id) => `<span class="apw__mini-drum">${W_DRUM(`${id}m`)}</span><span class="apw__mini-door">${W_DOOR(`${id}m`)}</span>`;

  function wRemaining(v) { return remainingText(v); }

  function createWasher(config) {
    let s = { available: true, ...(config || {}) };
    const V = global.IniqVisuals;
    const linked = () => !!s.ha;
    const variant = s.variant === 'compact' ? 'compact' : 'artwork';
    const name = () => s.name || 'Washing machine';
    const root = document.createElement('article');
    root.className = 'ap apw';
    root.dataset.profile = 'washer';
    if (s.id) root.dataset.applianceId = s.id;
    root.innerHTML = `
      <div class="apw__in">
        <div class="apw__art" aria-hidden="true"></div>
        <div class="apw__mini" aria-hidden="true">${W_MINI(`apw-i${++wUid}`)}</div>
        <div class="apw__id"><h3 class="apw__name"></h3><p class="apw__sub"></p></div>
        <p class="apw__state"><i class="apw__dot" aria-hidden="true"></i><b class="apw__state-t"></b><span class="apw__pct"></span></p>
        <p class="apw__meta"><span class="apw__rem"></span><span class="apw__prog"></span></p>
        <ul class="apw__more"></ul>
        <div class="apw__ctl"></div>
        <p class="apw__msg" role="status"></p>
      </div>`;
    const $ = (q) => root.querySelector(q);

    /* layers (shared framework): body → drum → door/glass → status effect, aligned on the porthole */
    const art = document.createElement('div');
    art.className = 'apw__frame';
    $('.apw__art').append(art);
    const st = V ? V.stack([
      { id: 'body', kind: 'svg', svg: W_BODY(`apw-b${++wUid}`), className: 'apw__body' },
      { id: 'drum', kind: 'svg', svg: W_DRUM(`apw-d${++wUid}`), className: 'apw__drum' },
      { id: 'door', kind: 'svg', svg: W_DOOR(`apw-g${++wUid}`), className: 'apw__door' },
      { id: 'effect', kind: 'overlay', className: 'apw__effect' },
    ]) : null;
    if (st) art.append(st.el);
    // progress: the shared ProgressRing around the porthole — only with a real (mapped or demo) percentage
    const ring = V ? V.ring({ label: `${name()} progress`, thickness: 0.03, gap: 0, tone: 'accent', tones: [{ when: { key: 'value', above: 99.5 }, tone: 'success' }] }) : null;
    if (ring) { ring.el.classList.add('apw__ring'); art.append(ring.el); }
    const miniRing = V ? V.ring({ label: `${name()} progress`, thickness: 0.1, gap: 0.04, tone: 'accent' }) : null;
    if (miniRing) { miniRing.el.classList.add('apw__mini-ring'); $('.apw__mini').prepend(miniRing.el); }
    // door open: a small badge on the porthole (the words are in the information lines too)
    const door = V ? V.badge({ position: 'tr', shape: 'rect', rules: [{ when: { key: 'door', equals: 'open' }, icon: 'alert', text: 'Door', tone: 'warning', label: 'Door open' }] }) : null;
    if (door) door.attach(art);
    // motion: ONLY from the confirmed state's concept (CSS animations through the shared layers; reduced motion and off-screen respected)
    const DRUM_RULES = [
      { when: { state: 'spinning' }, animate: { type: 'rotate', duration: 0.7 } },
      { when: { state: 'rinsing' }, animate: { type: 'rotate', duration: 2.4 } },
      { when: { state: ['washing', 'running'] }, animate: { type: 'rotate', duration: 5 } },
    ];
    const motion = V ? V.layers([
      ...(st ? [{ target: st.layer('drum'), rules: DRUM_RULES }, { target: st.layer('effect'), rules: [{ when: { state: 'finished' }, animate: { type: 'emphasis', on: 'state' } }] }] : []),
      { target: root.querySelector('.apw__mini-drum'), rules: DRUM_RULES },
    ]) : null;

    /* controls: ONLY explicitly mapped, supported entities (the binding decides; a demo has none) */
    const ctlCaps = { start: !!s.controls?.start, pause: !!s.controls?.pause, program: !!s.controls?.program };
    let strip = null;
    if (V && (ctlCaps.start || ctlCaps.pause || ctlCaps.program)) {
      strip = V.controlStrip({ name: name(), placement: 'inline', caps: ctlCaps, controls: [
        { id: 'program', kind: 'select', label: 'Programme', requires: ['program'], options: [], classes: { root: 'apw__sel', trigger: 'apw__pick', triggerKey: 'apw__pick-k', triggerValue: 'apw__pick-v' } },
        { id: 'start', kind: 'button', label: 'start', icon: 'play', requires: ['start'], text: { on: 'Start' }, classes: { root: 'apw__btn' } },
        { id: 'pause', kind: 'button', label: 'pause', icon: 'pause', requires: ['pause'], text: { on: 'Pause' }, classes: { root: 'apw__btn' } },
      ], onAction: (id, value) => act(id, value) });
      strip.el.dataset.mode = 'flyout';                       // programme lists are long: always the shared Flyout
      $('.apw__ctl').append(strip.el);
    }
    root.dataset.hasControls = strip ? 'true' : 'false';
    let pendT = 0, msgT = 0, message = '';
    function say(t, ms = 4500) { message = t || ''; clearTimeout(msgT); if (message) msgT = setTimeout(() => { message = ''; render(); }, ms); render(); }
    const MSG = { preview: 'Preview — nothing is sent', unavailable: 'Unavailable', not_supported: 'Not supported by this entity', not_an_option: 'Not one of the programmes',
      server_unreachable: 'IniqDash server unreachable', ha_unreachable: 'Home Assistant unreachable', ha_timeout: 'Home Assistant did not answer', ha_http: 'Refused by Home Assistant' };
    async function act(id, value) {
      if (!strip || typeof s.haAction !== 'function') return;
      strip.pending(id, true);
      clearTimeout(pendT);
      let r;
      try { r = await s.haAction(id, value); } catch (e) { r = { ok: false, error: 'server_unreachable' }; }
      if (!r || !r.ok) { strip.pending(id, false); render(); say(MSG[r && r.error] || 'Not accepted by Home Assistant'); return; }
      // accepted: the pending mark stays until Home Assistant reports a change (setState), at most 10 s
      pendT = setTimeout(() => { strip.update(ctlView(), { confirmed: true }); }, 10000);
    }

    /* ---- the view: everything shown, from Home Assistant (linked) or from the demo values (unlinked) ---- */
    function view() {
      if (linked()) {
        const h = s.ha, m = s.mapped || {};
        const avail = h.available !== false;
        const low = String(h.state ?? '').toLowerCase();
        const concept = !avail ? (low === 'unknown' ? 'unknown' : 'unavailable') : washerConcept(h.state, s.stateMap, { domain: h.domain, dc: h.dc });
        // a mapped entity Home Assistant does not know is said so (never left silently blank); still loading: nothing yet
        const line = (x, label) => (x && x.state === 'ready' ? x : x && x.state === 'missing' ? { text: `${label} not found`, available: true, missing: true, entity: null } : null);
        const pr = m.progress;
        return { concept, text: avail ? (h.text || String(h.state)) : W_LABEL[concept], program: line(m.program, 'Programme'), remaining: line(m.remaining, 'Time left'),
          power: line(m.power, 'Power'), door: line(m.door, 'Door'),
          progress: pr && pr.state === 'ready' ? { value: pr.available ? pr.value : null, available: pr.available, text: pr.text } : null,
          progressMissing: !!(pr && pr.state === 'missing'),
          select: m.programSelect && m.programSelect.state === 'ready' ? m.programSelect : null };
      }
      const concept = s.available === false ? 'unavailable' : (W_CONCEPTS.includes(s.state) ? s.state : 'other');
      const p = num(s.progress);
      const live = !['unavailable', 'off'].includes(concept);
      const T = (text) => (text ? { text, available: true } : null);
      return { concept, text: W_LABEL[concept] || String(s.state || ''), program: live ? T(s.programme) : null, remaining: live ? T(wRemaining(s.remaining)) : null,
        power: live ? T(s.demoPower) : null, door: s.demoDoor ? { text: s.demoDoor === 'open' ? 'Door open' : 'Door closed', open: s.demoDoor === 'open', available: true } : null,
        progress: p !== null && live ? { value: Math.max(0, Math.min(100, p)), available: true, text: `${Math.round(p)}%` } : null, select: null };
    }
    const ctlView = () => {
      const v = view(), ok = !['unavailable', 'unknown'].includes(v.concept);
      const m = s.mapped || {};
      return { available: ok && (!m.programSelect || m.programSelect.available !== false), start: true, pause: true, program: v.select ? v.select.value : null };
    };

    /* entity details of a MAPPED entity (the same system surface as the primary's ⋮): a line is then a small button */
    function details(entity, label) {
      root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action: { type: 'details', entity, info: [], label }, meta: { source: 'more' }, widget: 'details' } }));
    }
    function row(kind, label, x) {
      const li = document.createElement('li');
      li.className = `apw__row apw__row--${kind}`;
      const t = x.missing ? x.text : `${label ? `${label} ` : ''}${x.available === false && kind !== 'door' ? 'unavailable' : x.text}`;
      if (linked() && x.entity) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'apw__row-b'; b.dataset.iqControl = ''; b.textContent = t;
        b.setAttribute('aria-label', `${t}. Details`);
        b.addEventListener('click', (e) => { e.stopPropagation(); details(x.entity, label || name()); });
        li.append(b);
      } else li.textContent = t;
      if (x.available === false) li.dataset.na = '';
      return li;
    }

    function render() {
      const v = view();
      const live = !['unavailable', 'unknown'].includes(v.concept);
      root.dataset.state = v.concept;
      root.dataset.active = W_ACTIVE.includes(v.concept) ? 'true' : 'false';
      root.dataset.hasSub = s.subtitle ? 'true' : 'false';
      $('.apw__name').textContent = name();
      $('.apw__sub').textContent = s.subtitle || ''; $('.apw__sub').hidden = !s.subtitle;
      $('.apw__state-t').textContent = v.text;                       // always the real state, in words
      // progress: a textual value next to the state; the ring only for a real percentage
      const pv = v.progress;
      const pct = pv && pv.available !== false && pv.value !== null ? `${Math.round(pv.value)}%` : pv && pv.available === false ? 'Progress unavailable' : v.progressMissing ? 'Progress not found' : '';
      $('.apw__pct').textContent = pct; $('.apw__pct').hidden = !pct;
      root.dataset.hasProgress = pv && pv.value !== null && pv.available !== false ? 'true' : 'false';
      [ring, miniRing].forEach((r) => r && r.update(pv ? { value: pv.value, available: pv.available !== false } : {}));
      const rem = v.remaining, prog = v.program;
      $('.apw__rem').textContent = rem ? (rem.available === false ? 'Time left unavailable' : rem.text) : '';
      $('.apw__prog').textContent = prog ? (prog.available === false ? 'Programme unavailable' : prog.text) : '';
      $('.apw__rem').hidden = !rem; $('.apw__prog').hidden = !prog;
      $('.apw__meta').hidden = !rem && !prog;
      // secondary lines: power, door, Information lines (other entities, chosen by the owner)
      const more = $('.apw__more');
      more.replaceChildren();
      if (v.power) more.append(row('power', 'Power', v.power));
      if (v.door) more.append(row('door', '', v.door));
      (Array.isArray(s.infoItems) ? s.infoItems : []).filter((x) => x && x.line).forEach((x) => { const li = document.createElement('li'); li.className = 'apw__row apw__row--info'; li.textContent = x.line; more.append(li); });
      more.hidden = !more.children.length;
      root.dataset.door = v.door && v.door.open === true ? 'open' : v.door ? 'other' : 'none';
      // the art: the door's words are the accessible text; the badge is the glance
      if (door) door.update({ door: v.door && v.door.open === true ? 'open' : 'closed' });
      if (motion) motion.update({ state: live ? v.concept : 'still', available: live });
      if (strip) {
        strip.update(ctlView());
        if (v.select) { const f = strip.control('program')?.flyout; if (f) f.set({ options: (v.select.options || []).map((o) => ({ value: o, label: o })), value: v.select.value }); }
      }
      root.setAttribute('aria-label', `${name()}: ${v.text}${pct ? `, ${pct}` : ''}${rem && rem.available !== false ? `, ${rem.text}` : ''}${prog && prog.available !== false ? `, ${prog.text}` : ''}`);
      $('.apw__msg').textContent = message; $('.apw__msg').hidden = !message;
    }

    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => washerArrange(variant, w, h) });
    root.dataset.variant = variant;
    render();
    root.appliance = {
      getState: () => { const v = view(); return { profile: 'washer', state: v.concept, status: v.text, progress: v.progress ? v.progress.value : null }; },
      /** External update (Home Assistant: the primary entity's state, the mapped entities, Information lines). Never sends. */
      setState(patch = {}) {
        const truth = 'ha' in patch || 'mapped' in patch || 'state' in patch || 'available' in patch;
        s = { ...s, ...patch };
        if (truth && strip) { clearTimeout(pendT); strip.update(ctlView(), { confirmed: true }); }
        render();
      },
    };
    return root;
  }
  /** the arrangement inside the variant, from the widget's OWN box */
  function washerArrange(variant, w, h) {
    if (variant === 'compact') return h < 76 && w >= 300 ? 'strip' : w < 150 || h < 76 ? 'tiny' : w >= 340 ? 'wide' : 'small';
    if (Math.min(w, h) < 120 || (w < 200 && h < 170)) return 'micro';            // no room for the whole machine
    if (w >= 1.2 * h && w >= 240 && h >= 130) return h >= 300 ? 'side-l' : 'side';  // machine beside the information (a 280 × 200 card too: the machine is the point)
    if (w < 260 && h < 260) return 'small';
    return h >= 380 && w >= 260 ? 'stack-l' : 'stack';                           // machine above the information
  }

  function createAny(config) { return config && config.profile === 'washer' ? createWasher(config) : create(config); }
  function constraintsAny(config, opts = {}) {
    if (config && config.profile === 'washer') return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: config.variant === 'compact' ? 1 : 2 };
    return constraints(config, opts);
  }
  const PROFILES = Object.freeze({
    generic: Object.freeze({ id: 'generic', label: 'Generic' }),
    washer: Object.freeze({ id: 'washer', label: 'Washing Machine', concepts: Object.freeze([...W_CONCEPTS]), labels: Object.freeze({ ...W_LABEL }),
      suggest: Object.freeze(Object.fromEntries(Object.entries(W_SUGGEST).map(([k, v]) => [k, Object.freeze([...v])]))), concept: washerConcept }),
  });

  global.MaisonAppliance = { create: createAny, constraints: constraintsAny, ICONS, PROFILES };
})(window);
