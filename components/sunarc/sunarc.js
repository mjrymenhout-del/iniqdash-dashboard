/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqSunArc — the reusable SUN ARC: a smooth sunrise → sunset arc with a glowing golden sun at its REAL place in the day, the sunrise and
   sunset markers with their times, an optional elevation, and a clear night state. A pure renderer: it reads Home Assistant's sun data
   (the sun.sun entity, as components/ha/bindings.js reports it) and draws; it fetches nothing, knows no widget and can sit in Sun & Moon,
   Weather, Room, Energy or a Widget Studio widget.

   IniqSunArc.create(options) → { el, update(sun, now?), position(sun, now?), destroy() }
     options = { glow: true, showTimes: true, showElevation: false, sunColor: token, arcColor: token, labels: { rise: 'Sunrise', set: 'Sunset' } }
     sun = { state: 'above_horizon' | 'below_horizon' | 'unknown' | 'unavailable', elevation (°), events: { rising, setting, noon, midnight } (ms,
             Home Assistant's NEXT events), lastRising?: ms (today's sunrise, when the host saw it happen) }

   WHERE THE SUN IS (IniqSunArc.position — documented, no ephemeris):
     · Day (above the horizon): the arc runs from today's sunrise R to today's sunset S. S = HA's next_setting. R = the sunrise the host saw
       happen today (lastRising) when it has one; otherwise R = 2 × solar noon − S — solar noon is the middle of the day to within about a
       minute, and today's noon is HA's next_noon (morning) or next_noon − 24 h (afternoon; HA then reports tomorrow's). That derived
       sunrise is marked '≈'. The sun sits at f = (now − R) / (S − R) along the arc — by TIME, never by the clock face (noon is not
       assumed to be the middle unless HA's own times say so).
     · Night: the sun is below the horizon, off the arc — before sunrise (HA's next_midnight lies after next_rising) on the left, after
       sunset on the right — and the times shown are HA's next sunrise and sunset (labelled "Tomorrow" when they are).
     · Unknown / unavailable / no times: no sun is drawn and the times say so — nothing is invented.
   ========================================================================== */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const DAY = 86400000;
  const fin = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? null : Number(v));
  const TOKEN = /^[a-z][a-z0-9-]{1,30}$/, HEX = /^#[0-9a-fA-F]{6}$/;
  const colour = (v) => (typeof v !== 'string' ? null : HEX.test(v) ? v : TOKEN.test(v) ? `var(--${v})` : null);
  const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

  /** the sun's place in the day — see the header. → { phase: 'day' | 'before' | 'after' | 'na', f, rise, set, riseEstimated } */
  function position(sun, now = Date.now()) {
    const st = String((sun && sun.state) || '').toLowerCase(), ev = (sun && sun.events) || {};
    const rising = fin(ev.rising), setting = fin(ev.setting), noon = fin(ev.noon), midnight = fin(ev.midnight), last = fin(sun && sun.lastRising);
    if (st === 'above_horizon') {
      if (setting === null) return { phase: 'na', f: null, rise: null, set: null };
      let rise = null, est = false;
      if (last !== null && last < now && setting - last < DAY && setting > last) rise = last;
      else if (noon !== null) {
        const today = noon < setting ? noon : noon - DAY;                  // morning: today's noon; afternoon: HA already gives tomorrow's
        rise = 2 * today - setting; est = true;
      }
      if (rise === null || !(setting > rise)) return { phase: 'na', f: null, rise: null, set: setting };
      return { phase: 'day', f: Math.max(0, Math.min(1, (now - rise) / (setting - rise))), rise, set: setting, riseEstimated: est };
    }
    if (st === 'below_horizon') {
      // before sunrise (after midnight) or after sunset (before midnight): HA's next midnight comes after / before its next sunrise
      const before = midnight !== null && rising !== null ? midnight > rising : rising !== null ? rising - now < DAY / 4 : false;
      return { phase: before ? 'before' : 'after', f: before ? 0 : 1, rise: rising, set: setting };
    }
    return { phase: 'na', f: null, rise: rising, set: setting };
  }

  let seq = 0;
  /* THE DRAWING (the golden sun-path reference): drawn in the stage's REAL pixels (a ResizeObserver redraws it — the arc stretches with
     the box, the sun stays round). A wide, shallow, thin golden arc from the sunrise marker (left) to the sunset marker (right) over a
     faint dashed horizon; the times under the markers; a luminous sun (white-gold core, golden halo, a wide soft glow) ON the arc; under it
     a dashed line to the horizon and the current time. Night: the arc rests (dim), no glow — a quiet sun waits on the horizon's side. */
  function create(opts = {}) {
    const o = { glow: true, showTimes: true, showElevation: false, showNow: true, ...opts };
    const id = `iqsa${++seq}`;
    const root = document.createElement('div');
    root.className = 'iqsa';
    root.innerHTML = '<div class="iqsa__stage"></div>';
    const stage = root.querySelector('.iqsa__stage');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'iqsa__svg'); svg.setAttribute('aria-hidden', 'true');
    const mk = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); parent.append(e); return e; };
    const defs = mk('defs', {});
    const grad = mk('linearGradient', { id: `${id}-arc`, x1: '0', y1: '0', x2: '1', y2: '0' }, defs);
    [['0', '.55'], ['.5', '1'], ['1', '.55']].forEach(([off, op]) => { const st = mk('stop', { offset: off }, grad); st.style.stopColor = 'var(--iqsa-sun)'; st.style.stopOpacity = op; });
    const glowG = mk('radialGradient', { id: `${id}-glow` }, defs);
    [['0', '#fff', '.9'], ['.18', 'var(--iqsa-sun)', '.55'], ['.5', 'var(--iqsa-sun)', '.16'], ['1', 'var(--iqsa-sun)', '0']].forEach(([off, c, op]) => { const st = mk('stop', { offset: off }, glowG); st.style.stopColor = c; st.style.stopOpacity = op; });
    const coreG = mk('radialGradient', { id: `${id}-core`, cx: '.42', cy: '.38' }, defs);
    [['0', '#fffdf2'], ['.55', '#ffe7a3'], ['1', 'var(--iqsa-sun)']].forEach(([off, c]) => { const st = mk('stop', { offset: off }, coreG); st.style.stopColor = c; });
    const hz = mk('line', { class: 'iqsa__hz' });
    const arc = mk('path', { class: 'iqsa__arc', stroke: `url(#${id}-arc)` });
    const drop = mk('line', { class: 'iqsa__drop' });
    const nowDot = mk('circle', { class: 'iqsa__nowdot', r: 2.6 });
    const mRise = mk('circle', { class: 'iqsa__mk iqsa__mk--rise', r: 4 });
    const mSet = mk('circle', { class: 'iqsa__mk iqsa__mk--set', r: 4 });
    const tRise = mk('text', { class: 'iqsa__time', 'text-anchor': 'middle' });
    const tSet = mk('text', { class: 'iqsa__time', 'text-anchor': 'middle' });
    const tNow = mk('text', { class: 'iqsa__now', 'text-anchor': 'middle' });
    const glow = mk('circle', { class: 'iqsa__glow', fill: `url(#${id}-glow)` });
    const halo = mk('circle', { class: 'iqsa__halo' });
    const sunC = mk('circle', { class: 'iqsa__sun', fill: `url(#${id}-core)` });
    const tEl = mk('text', { class: 'iqsa__elev', 'text-anchor': 'start' });
    stage.append(svg);
    if (colour(o.sunColor)) root.style.setProperty('--iqsa-sun', colour(o.sunColor));
    if (colour(o.arcColor)) root.style.setProperty('--iqsa-arc', colour(o.arcColor));
    root.dataset.glow = String(o.glow !== false);
    let last = null, lastNow = null, geo = null, ro = null;

    /** the arc's geometry in the stage's pixels: ends on the horizon, a shallow bow (rise ≤ 30 % of its width) */
    function measure() {
      const W = Math.max(60, stage.clientWidth || 300), H = Math.max(40, stage.clientHeight || 120);
      const times = o.showTimes !== false && H >= 64;
      const pad = Math.max(14, Math.min(34, W * 0.06));
      const L = pad, R = W - pad, below = times ? 24 : 8;
      const coreR = Math.max(5, Math.min(10, H * 0.07, W * 0.03));
      // shallow: the bow rises at most ~a fifth of its width; a taller box centres the drawing instead of raising the arc
      const rise = Math.max(8, Math.min(H - below - coreR * 3, (W - 2 * pad) * 0.21));
      const spare = Math.max(0, H - below - rise - coreR * 3);
      const B = H - below - spare / 2;
      const P = B - rise, c = (8 * P - 2 * B) / 6, k = (R - L) * 0.24;
      return { W, H, L, R, B, P, c1: [L + k, c], c2: [R - k, c], coreR, times };
    }
    const at = (g, f) => { const u = 1 - f;
      return [u * u * u * g.L + 3 * u * u * f * g.c1[0] + 3 * u * f * f * g.c2[0] + f * f * f * g.R, u * u * u * g.B + 3 * u * u * f * g.c1[1] + 3 * u * f * f * g.c2[1] + f * f * f * g.B]; };
    const set = (e, a) => Object.entries(a).forEach(([k, v]) => e.setAttribute(k, typeof v === 'number' ? v.toFixed(1) : v));
    function draw() {
      const g = geo = measure();
      svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`); svg.setAttribute('width', g.W); svg.setAttribute('height', g.H);
      set(hz, { x1: g.L, y1: g.B, x2: g.R, y2: g.B });
      arc.setAttribute('d', `M${g.L.toFixed(1)} ${g.B.toFixed(1)}C${g.c1[0].toFixed(1)} ${g.c1[1].toFixed(1)} ${g.c2[0].toFixed(1)} ${g.c2[1].toFixed(1)} ${g.R.toFixed(1)} ${g.B.toFixed(1)}`);
      set(mRise, { cx: g.L, cy: g.B }); set(mSet, { cx: g.R, cy: g.B });
      // the times under their markers, never cut by the box: the sunrise time starts at its marker's left, the sunset time ends at its right
      set(tRise, { x: Math.max(2, g.L - 12), y: g.B + 18, 'text-anchor': 'start' }); set(tSet, { x: Math.min(g.W - 2, g.R + 12), y: g.B + 18, 'text-anchor': 'end' });
      [tRise, tSet].forEach((t) => { t.style.display = g.times ? '' : 'none'; });
      paint();
    }
    function paint() {
      if (!geo) return;
      const g = geo, sun = last, now = lastNow ?? Date.now();
      const p = position(sun, now), el = fin(sun && sun.elevation);
      root.dataset.phase = p.phase;
      const show = (e, v) => { e.style.display = v ? '' : 'none'; };
      if (p.phase === 'day') {
        const [x, y] = at(g, p.f);
        set(sunC, { cx: x, cy: y, r: g.coreR }); set(halo, { cx: x, cy: y, r: g.coreR * 1.9 }); set(glow, { cx: x, cy: y, r: g.coreR * 6.2 });
        set(drop, { x1: x, y1: y + g.coreR + 2, x2: x, y2: g.B }); set(nowDot, { cx: x, cy: g.B });
        const clock = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        tNow.textContent = clock; set(tNow, { x, y: g.B + 18 });
        // the current time only where it does not collide with the sunrise / sunset times
        const clear = g.times && x - g.L > 64 && g.R - x > 56;
        [sunC, halo].forEach((e) => show(e, true)); show(glow, o.glow !== false);
        show(drop, o.showNow !== false); show(nowDot, o.showNow !== false); show(tNow, o.showNow !== false && clear);
        tEl.textContent = o.showElevation && el !== null ? `${Math.round(el)}°` : ''; set(tEl, { x: x + g.coreR * 1.9 + 4, y: y + 4 }); show(tEl, !!tEl.textContent);
      } else if (p.phase === 'before' || p.phase === 'after') {
        const x = p.phase === 'before' ? g.L : g.R;
        set(sunC, { cx: x, cy: g.B, r: g.coreR * 0.75 });
        [halo, glow, drop, nowDot, tNow].forEach((e) => show(e, false)); show(sunC, true);
        tEl.textContent = o.showElevation && el !== null ? `${Math.round(el)}°` : ''; set(tEl, { x: g.W / 2, y: g.B - 6 }); tEl.setAttribute('text-anchor', 'middle'); show(tEl, !!tEl.textContent);
      } else { [sunC, halo, glow, drop, nowDot, tNow, tEl].forEach((e) => show(e, false)); }
      if (p.phase === 'day') tEl.setAttribute('text-anchor', 'start');
      tRise.textContent = p.rise !== null && p.rise !== undefined ? `${p.riseEstimated ? '≈ ' : ''}${clockOf(p.rise, now)}` : '—';
      tSet.textContent = p.set !== null && p.set !== undefined ? clockOf(p.set, now) : '—';
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', p.phase === 'day' ? `Sun up, ${Math.round(p.f * 100)} percent of the day past${el !== null ? `, elevation ${Math.round(el)} degrees` : ''}; sunrise ${tRise.textContent}, sunset ${tSet.textContent}`
        : p.phase === 'na' ? 'Sun position unavailable' : `Sun below the horizon; next sunrise ${tRise.textContent}, sunset ${tSet.textContent}`);
      return p;
    }
    function update(sun, now = Date.now()) {
      last = sun || null; lastNow = now;
      if (!ro && typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => draw()); ro.observe(stage); }
      draw();
      return position(sun, now);
    }
    return { el: root, update, position: (sun, now) => position(sun || last, now), geometry: () => geo, destroy() { if (ro) ro.disconnect(); ro = null; root.remove(); } };
  }
  /** the times under the markers: just the clock for today; "Tomorrow" is already said by the day / night state — a short weekday otherwise */
  function clockOf(ts, now) {
    const d = new Date(ts), hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const days = Math.round((dayStart(ts) - dayStart(now)) / DAY);
    return Math.abs(days) <= 1 ? hm : `${d.toLocaleDateString([], { weekday: 'short' })} ${hm}`;
  }

  global.IniqSunArc = Object.freeze({ create, position });
})(window);
