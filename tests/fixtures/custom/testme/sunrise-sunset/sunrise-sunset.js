/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Sunrise / Sunset — CUSTOM widget package (widgets/custom/sunrise-sunset/, type "custom.sunrise-sunset").
   A wide dark panel: a DAY / NIGHT badge with the current time, a thin sun path from lower left over the
   top to lower right, a glowing sun ON the path at the day's real progress, and the sunrise / sunset times.

   IniqSunriseSunset.create(config) → HTMLElement (.sns), with el.sun = { getState(), setState(patch) }
   config = {
     name                      identity (editor, accessible name)
     hour12                    12-hour clock (default true)
     sunState                  'above_horizon' | 'below_horizon'   (Home Assistant's sun.sun state)
     nextRising, nextSetting, nextNoon   ISO timestamps (sun.sun attributes next_rising / next_setting / next_noon)
     available                 true
     now                       optional fixed time (ms) — demo / tests; otherwise the clock
   }
   Without Home Assistant data the widget shows demo times (sunrise 08:12, sunset 18:41, today).

   Home Assistant: this package contains NO Home Assistant code. widget.json declares "ha": { "domains": ["sun"] }: the
   shared, read-only 'entity' binding of the IniqHA layer hands over the normalised entity (config.haEntity, then
   el.haEntity(entity) on every change); this widget reads its state and attrs.next_rising / next_setting / next_noon.

   Which times are shown:
     DAY   (sun above the horizon): sunset = next_setting (today). Today's sunrise has passed, so HA no longer
           reports it; it is derived from today's solar noon (sunrise and sunset are symmetric around it, within
           about a minute): sunrise = 2 × noon − sunset. Today's noon = next_noon, or next_noon − 24 h once noon
           has passed. (Without next_noon: next_rising − 24 h.)
     NIGHT (below the horizon): the coming day — sunrise = next_rising, sunset = next_setting. No sun on the arc.
   Progress (DAY) = (now − sunrise) / (sunset − sunrise), placed by ARC LENGTH on the drawn path.
   Responsive: the path is drawn in the arc box's own layout pixels (ResizeObserver, unaffected by the editor's
   visual zoom); arrangements come from the widget's own box (MaisonFit), never from the screen.
   ========================================================================== */
(function (global) {
  'use strict';

  const TYPE = 'custom.sunrise-sunset';
  const NS = 'http://www.w3.org/2000/svg';
  const DAY_MS = 86400000;
  const t = (v) => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(n) ? n : null; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** today's demo times (local): sunrise 08:12, sunset 18:41 — the reference's values */
  function demoTimes(now) {
    const d = new Date(now), at = (h, m) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
    return { rise: at(8, 12), set: at(18, 41) };
  }

  /** { day, rise, set, progress } from the HA attributes (or demo), for time `now` */
  function sunTimes(s, now) {
    const R = t(s.nextRising), S = t(s.nextSetting), N = t(s.nextNoon);
    if (R === null || S === null) {
      const { rise, set } = demoTimes(now);
      const day = now >= rise && now < set;
      return { day, rise, set, progress: day ? (now - rise) / (set - rise) : null, demo: true };
    }
    // HA's state decides day / night; without it, the order of the next events does (sunset first = it is day)
    const day = s.sunState === 'above_horizon' ? true : s.sunState === 'below_horizon' ? false : S < R;
    if (!day) return { day, rise: R, set: S > R ? S : S + DAY_MS, progress: null };
    let rise;
    if (N !== null) { const noon = N <= S ? N : N - DAY_MS; rise = 2 * noon - S; } else rise = R - DAY_MS;
    if (!(rise < S)) rise = S - 12 * 3600000;                      // never a negative day
    return { day, rise, set: S, progress: clamp((now - rise) / (S - rise), 0, 1) };
  }

  /** the normalised sun.sun entity (shared 'entity' binding) → this widget's state */
  const fromEntity = (e) => (e ? { available: e.available, sunState: e.state, nextRising: e.attrs.next_rising || null, nextSetting: e.attrs.next_setting || null, nextNoon: e.attrs.next_noon || null } : {});

  function create(config) {
    let s = { hour12: true, available: true, ...(config || {}), ...fromEntity(config && config.haEntity) };
    delete s.haEntity;
    const root = document.createElement('article');
    root.className = 'sns';
    root.dataset.widget = TYPE;                       // the CSS scope, also when created outside the registry
    root.dataset.widgetSource = 'custom';
    root.innerHTML = `
      <div class="sns__in">
        <p class="sns__badge"><b class="sns__phase"></b><span class="sns__sep" aria-hidden="true">·</span><span class="sns__now"></span></p>
        <div class="sns__sky">
          <svg class="sns__svg" aria-hidden="true" focusable="false">
            <defs>
              <radialGradient id="" class="sns__halo-g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffb547" stop-opacity=".55"/><stop offset=".45" stop-color="#ff9f2e" stop-opacity=".22"/><stop offset="1" stop-color="#ff9f2e" stop-opacity="0"/></radialGradient>
              <radialGradient id="" class="sns__sun-g" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#ffd27a"/><stop offset=".6" stop-color="#ffab33"/><stop offset="1" stop-color="#f58f16"/></radialGradient>
            </defs>
            <path class="sns__path" fill="none"/>
            <g class="sns__sun"><circle class="sns__halo"/><circle class="sns__disc"/></g>
          </svg>
        </div>
        <div class="sns__times">
          <p class="sns__t sns__t--rise"><span class="sns__l">Sunrise</span> <b class="sns__v"></b></p>
          <p class="sns__t sns__t--set"><span class="sns__l">Sunset</span> <b class="sns__v"></b></p>
        </div>
      </div>`;
    const $ = (q) => root.querySelector(q);
    // unique gradient ids per instance (several widgets on one page)
    const uid = `sns${Math.random().toString(36).slice(2, 8)}`;
    $('.sns__halo-g').id = `${uid}-halo`; $('.sns__sun-g').id = `${uid}-sun`;
    $('.sns__halo').setAttribute('fill', `url(#${uid}-halo)`); $('.sns__disc').setAttribute('fill', `url(#${uid}-sun)`);

    const svg = $('.sns__svg'), path = $('.sns__path'), sky = $('.sns__sky');
    let box = { w: 0, h: 0 }, last = null;

    const fmt = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: s.hour12 !== false });

    /** the sun path in the sky box's own pixels: lower left → top middle → lower right (a symmetric cubic) */
    function draw() {
      const { w, h } = box;
      if (!(w > 0 && h > 0)) return;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.setAttribute('width', w); svg.setAttribute('height', h);
      const r = clamp(Math.min(w * 0.03, h * 0.11), 5, 16);         // sun radius
      const pad = r * 1.6;                                           // room for the sun at both ends and the top
      const x0 = pad, x1 = w - pad, yb = h - pad * 0.9, yt = pad * 1.1;
      // a cubic with both control points at cy peaks at 0.75 of the way to cy: aim the peak at yt
      const cy = yb - (yb - yt) / 0.75, k = (x1 - x0) * 0.24;
      path.setAttribute('d', `M${x0.toFixed(1)} ${yb.toFixed(1)}C${(x0 + k).toFixed(1)} ${cy.toFixed(1)} ${(x1 - k).toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${yb.toFixed(1)}`);
      path.style.strokeWidth = `${clamp(r * 0.26, 1.6, 3)}px`;
      $('.sns__disc').setAttribute('r', r.toFixed(1));
      $('.sns__halo').setAttribute('r', (r * 2.9).toFixed(1));
      place();
    }
    /** the sun on the path at the day's progress (by arc length); hidden at night */
    function place() {
      const sun = $('.sns__sun');
      if (!last || !last.day || last.progress === null || !(box.w > 0)) { sun.style.display = 'none'; return; }
      const L = path.getTotalLength();
      if (!(L > 0)) { sun.style.display = 'none'; return; }
      const p = path.getPointAtLength(L * last.progress);
      sun.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      sun.style.display = '';
    }

    function render() {
      const now = Number.isFinite(s.now) ? s.now : Date.now();
      const na = s.available === false;
      last = na ? null : sunTimes(s, now);
      root.dataset.phase = na ? 'unavailable' : last.day ? 'day' : 'night';
      root.dataset.demo = String(!!(last && last.demo));
      $('.sns__phase').textContent = na ? 'Unavailable' : last.day ? 'Day' : 'Night';
      $('.sns__now').textContent = fmt(now);
      $('.sns__t--rise .sns__v').textContent = last ? fmt(last.rise) : '—';
      $('.sns__t--set .sns__v').textContent = last ? fmt(last.set) : '—';
      root.style.setProperty('--sns-progress', last && last.progress !== null ? last.progress.toFixed(4) : '');
      root.setAttribute('aria-label', na ? `${s.name || 'Sun'}: unavailable`
        : `${last.day ? 'Day' : 'Night'}, ${fmt(now)}. Sunrise ${fmt(last.rise)}, sunset ${fmt(last.set)}${last.day ? `, ${Math.round(last.progress * 100)} % of daylight passed` : ''}`);
      place();
    }

    // the sky box's LAYOUT size (not the editor's visual zoom)
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver((en) => {
        const b = en[0].contentBoxSize && en[0].contentBoxSize[0];
        const w = Math.round(b ? b.inlineSize : en[0].contentRect.width), h = Math.round(b ? b.blockSize : en[0].contentRect.height);
        if (w !== box.w || h !== box.h) { box = { w, h }; draw(); }
      }).observe(sky);
    }
    // the clock: the badge time and the sun move on their own (every 20 s); stops once the widget has left the page
    let seen = false, misses = 0;
    (function tick() {
      setTimeout(() => {
        if (root.isConnected) { seen = true; misses = 0; if (!Number.isFinite(s.now)) render(); } else if (seen || ++misses > 15) return;
        tick();
      }, 20000);
    }());

    render();
    if (global.MaisonFit) {
      global.MaisonFit.observe(root, {
        arrange: (w, h) => (h < 96 ? 'strip' : w < 230 || h < 128 ? 'compact' : 'full'),
      });
    }
    root.sun = {
      getState: () => ({ ...s, phase: root.dataset.phase, rise: last && last.rise, set: last && last.set, progress: last ? last.progress : null }),
      /** external update (Home Assistant through IniqHA's 'sun' binding, demo, tests) */
      setState(patch) { s = { ...s, ...(patch || {}) }; render(); },
    };
    root.haEntity = (e) => root.sun.setState(fromEntity(e));   // the shared 'entity' binding: every HA change
    return root;
  }

  /** Smallest usable area: 3 × 2. */
  function constraints() { return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 2 }; }

  /** The registry entry for this custom type. One job, minimal configuration. */
  function define({ F }) {
    return {
      label: 'Sunrise / Sunset',
      description: 'Custom · the sun’s path today: day or night with the time, the sun at its real place between sunrise and sunset (Home Assistant sun.sun).',
      glyph: '<path d="M3 17.5c3-7 15-7 18 0"/><circle cx="16.5" cy="12.6" r="2.2"/><path d="M3 20.5h18"/>',
      size: { w: 4, h: 3 },
      defaults: { name: 'Sun', entity: 'sun.sun', hour12: true },
      fields: [
        F.name(),
        { ...F.entity('entity'), help: 'The Home Assistant sun entity (sun.sun). Not linked: demo times.' },
        { key: 'hour12', type: 'boolean', label: '12-hour clock', group: 'appearance' },
      ],
    };
  }

  global.IniqSunriseSunset = { create, constraints, define, sunTimes };
})(window);
