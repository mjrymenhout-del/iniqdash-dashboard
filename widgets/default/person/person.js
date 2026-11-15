/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Person / Presence Widget V1 — shows supplied presence; no tracking, maps, GPS or distances.

   MaisonPerson.create(config) → HTMLElement (.pr), with el.person = { getState(), setState(patch) }

   config = {
     id, name:     'Marcel'
     image:        optional avatar image URL (a failure falls back to initials)
     initials:     optional ('MR'); default from the name.  icon: 'person' | 'guest' | raw SVG (used when
                   initials are empty)
     presence:     'home' | 'away' | 'zone' | 'unknown' | 'unavailable'
     zone:         'Office'   — a zone NAME, only shown for 'zone' (never coordinates)
     lastSeen:     '18 min ago' or a Date / ISO string (formatted relative to `now`)
     now:          optional Date/ISO for deterministic demos (default: the current time)
     secondary:    optional text ('Phone 64%')
     since:        linked to Home Assistant: the time the presence last changed ('14:02', from HA's last_changed) →
                   "Home since 14:02". When given (even ''), the demo lastSeen / secondary are not shown.
     available:    true
     infoItems:    linked to Home Assistant: resolved Information slots (other HA entities chosen in Settings), read-only:
                   [{ line: 'Phone 64%', … }] — shown as given, never interpreted here
     variant:      'portrait' (default: adapts to the box — a tall tile stacks the avatar over the name, a wide one puts them side by side) |
                   'row' (always avatar | text) | 'compact' (a small avatar and the name; the presence in words) | 'status' (no avatar: a dot, the name, the presence)
     tracker:      linked: { name, sourceType: 'gps' | 'router' | 'bluetooth' | 'bluetooth_le' | null, battery: 0…100 | null } — the device_tracker Home Assistant
                   says follows this person. Never coordinates. With showTracker the line "Tracked by Pixel (GPS)" is shown; ring: 'tracker' draws its battery.
     ring:         optional: the id of one Information slot ('i…') whose PERCENTAGE becomes a progress ring around the
                   picture (e.g. a phone battery). Only a real percentage from Home Assistant draws it — no slot, no
                   percentage, still loading → no ring (never a made-up value); unavailable → the empty track.
   }

   Composed from the shared visual primitives (components/widget-visuals): the presence BADGE and the progress RING
   are IniqVisuals primitives attached to the picture — neither knows the other, nor the picture.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    person: S('<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
    guest: S('<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/><path d="M17.5 3.5h4M19.5 1.5v4"/>'),
  };
  /* the presence badge: shared Badge rules (data) — home / away / a zone; unknown or unavailable → none */
  const BADGE_RULES = [
    { when: { state: 'home' }, icon: 'home', tone: 'success', label: 'Home' },
    { when: { state: 'zone' }, icon: 'zone', tone: 'accent', label: 'In a zone' },
    { when: { state: 'away' }, icon: 'away', tone: 'neutral', label: 'Away' },
  ];
  /** the ring's value: the chosen Information slot, only when Home Assistant reports a percentage for it */
  function ringOf(s) {
    if (s.ring === 'tracker') {                                      // the tracking device's own battery (only a real number)
      const b = s.tracker ? Number(s.tracker.battery) : NaN;
      return s.tracker && s.tracker.battery !== null && s.tracker.battery !== undefined && Number.isFinite(b) ? { value: b, available: true, label: 'Tracker battery' } : null;
    }
    if (!s.ring || !Array.isArray(s.infoItems)) return null;
    const it = s.infoItems.find((x) => x && x.id === s.ring);
    if (!it || it.state !== 'ready') return null;                    // loading / not reported / missing: no ring
    if (!it.available) return { value: null, available: false, label: it.label || 'Level' };
    const pct = it.fraction !== undefined && Number.isFinite(Number(it.fraction)) ? Number(it.fraction) * 100
      : it.unit === '%' && Number.isFinite(Number(it.value)) ? Number(it.value) : null;
    return pct === null ? null : { value: pct, available: true, label: it.label || 'Level' };
  }
  const LABEL = { home: 'Home', away: 'Away', zone: 'In a zone', unknown: 'Unknown', unavailable: 'Unavailable' };

  const presenceOf = (s) => {
    if (s.available === false) return 'unavailable';
    const v = String(s.presence ?? '').toLowerCase();
    return LABEL[v] ? v : v ? 'unknown' : 'unavailable';
  };
  function ago(v, now) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'string' && Number.isNaN(Date.parse(v))) return v;          // already a phrase
    const t = new Date(v).getTime(), n = now ? new Date(now).getTime() : Date.now();
    if (!Number.isFinite(t) || !Number.isFinite(n)) return '';
    const m = Math.max(0, Math.round((n - t) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
  }
  const initialsOf = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

  function create(config) {
    let s = { available: true, ...(config || {}) };
    const variant = ['row', 'compact', 'status'].includes(s.variant) ? s.variant : 'portrait';
    const root = document.createElement('article');
    root.className = 'pr';
    root.dataset.variant = variant;
    if (s.id) root.dataset.personId = s.id;
    root.innerHTML = `
      <div class="pr__in">
        <div class="pr__av"><span class="pr__ring"></span><span class="pr__face"><img alt="" decoding="async" draggable="false"><span class="pr__ini"></span></span></div>
        <div class="pr__id"><h3 class="pr__name"></h3><p class="pr__state"><i class="pr__dot" aria-hidden="true"></i><b class="pr__state-t"></b></p><p class="pr__more"></p></div>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const img = $('.pr__face img');
    img.addEventListener('error', () => { root.dataset.img = 'failed'; });
    // shared primitives on the picture: a progress ring around it, the presence badge on its edge
    const V = global.IniqVisuals;
    const av = $('.pr__av');
    const ring = V ? V.ring({ label: 'Level', thickness: 0.075, gap: 0.05, tone: 'neutral', tones: [{ when: { below: 15 }, tone: 'danger' }, { when: { below: 30 }, tone: 'warning' }] }) : null;
    if (ring) { ring.el.classList.add('pr__level'); av.prepend(ring.el); }
    const badge = V ? V.badge({ position: 'br', shape: 'circle', rules: BADGE_RULES }) : null;
    if (badge) { badge.el.classList.add('pr__badge'); badge.attach(av); }

    function render() {
      const p = presenceOf(s);
      root.dataset.presence = p;
      if (s.image) { if (img.getAttribute('src') !== s.image) { root.dataset.img = 'yes'; img.src = s.image; } }
      else { root.dataset.img = 'none'; img.removeAttribute('src'); }
      const ini = s.initials ?? initialsOf(s.name);
      $('.pr__ini').innerHTML = '';
      if (ini) $('.pr__ini').textContent = ini; else $('.pr__ini').innerHTML = ICONS[s.icon] || ICONS.person;
      if (badge) badge.update({ state: p, available: p !== 'unavailable' });
      const lv = ringOf(s);
      if (ring) ring.update(lv || {});
      root.dataset.ring = lv ? 'yes' : 'no';
      $('.pr__name').textContent = s.name || 'Person';
      const word = p === 'zone' && s.zone ? s.zone : LABEL[p];
      const linked = typeof s.since === 'string';         // Home Assistant: only real information, never the demo lines
      $('.pr__state-t').textContent = word;
      // linked: "Work" + "Since 14:02" (HA's last_changed: when the presence last changed) — the presence stays readable in a small tile
      const since = linked && s.since && p !== 'unavailable' && p !== 'unknown' ? `Since ${s.since}` : '';
      const extra = Array.isArray(s.infoItems) ? s.infoItems.map((x) => x && x.line).filter(Boolean) : [];
      // the Information lines you chose come first (they are what you asked to see), then "Since …"
      const more = p === 'unavailable' ? extra.join(' · ') : linked ? [...extra, since].filter(Boolean).join(' · ') : [p !== 'home' ? (ago(s.lastSeen, s.now) ? `Last seen ${ago(s.lastSeen, s.now)}` : '') : '', s.secondary || ''].filter(Boolean).join(' · ');
      const SRC = { gps: 'GPS', router: 'router', bluetooth: 'Bluetooth', bluetooth_le: 'Bluetooth LE' };
      const trk = s.showTracker && s.tracker && s.tracker.name && p !== 'unavailable' ? `Tracked by ${s.tracker.name}${s.tracker.sourceType && SRC[s.tracker.sourceType] ? ` (${SRC[s.tracker.sourceType]})` : ''}` : '';
      const more2 = [more, trk].filter(Boolean).join(' · ');
      $('.pr__more').textContent = more2;
      $('.pr__more').hidden = !more2;
      // the ring's value is also in words: the Information line it comes from is in "more" (never the ring alone)
      root.setAttribute('aria-label', `${s.name || 'Person'}: ${word}${more2 ? ', ' + more2.charAt(0).toLowerCase() + more2.slice(1) : ''}`);
    }

    render();
    root.person = {
      getState: () => ({ presence: presenceOf(s), zone: s.zone ?? null, ring: ringOf(s) }),
      /** External update (later: Home Assistant). */
      setState(patch) { s = { ...s, ...patch }; render(); },
    };
    return root;
  }

  /** minW 2, minH 2: avatar + name + presence on one line in a short tile; taller tiles stack. */
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }; }

  global.MaisonPerson = { create, constraints };
})(window);
