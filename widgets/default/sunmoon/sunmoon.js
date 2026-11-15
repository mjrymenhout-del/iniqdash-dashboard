/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Sun & Moon Widget V1 — what Home Assistant's sun entity says (sun.sun): above / below the horizon, the sun's elevation and azimuth,
   and its next dawn · sunrise · noon · sunset · dusk · midnight — plus the moon phase and moonrise / moonset ONLY when you map an
   entity that reports them (the Moon integration's sensor, timestamp sensors). Nothing is calculated here: no ephemeris, no
   day length, no moon computation. Without a source the moon part is simply not there.

   MaisonSunMoon.create(config) → HTMLElement (.iq-sun), with el.sunmoon = { getState(), setState(patch) }

   config = {
     id, name, subtitle, variant: 'sky' (default: the sky plot, the next events, the moon) | 'times' (sunrise / sunset only, one line)
              | the SUN PATH presets: 'minimal' (a thin arc, a glowing sun, sunrise / sunset) · 'horizon' (a path through the horizon line, clean
              time labels) · 'atmospheric' (day / twilight / night sky from the REAL elevation, the sun's glint) · 'detail' (a larger arc with
              the real elevation and azimuth) · 'moon' (the mapped moon phase large, with the sun path) — one drawing, styled per preset
     arcWidth (1–8) · glow · showHorizon · showLabels · sunColor / arcColor (theme token names)   — the sun path's look
     sun:   { state: 'above_horizon' | 'below_horizon' | 'unavailable' | 'unknown', elevation, azimuth, events: { rising, setting, noon, dawn, dusk, midnight } (ms | null) }
     moon:  null | { state: 'loading' | 'missing' | 'ready', phase: 'new_moon' | … | null, text, available }      (mapped sensor, HA's words)
     moonrise / moonset:  null | { state: 'loading' | 'missing' | 'ready', ts: ms | null, text }                    (mapped timestamp sensors)
     southern:  false       draw the moon phase for the southern hemisphere (the lit side flips) — Home Assistant does not say which you are in
   }
   The sky plot: N at the top, the sun at its real azimuth, nearer the middle the higher it is; below the horizon it rests on the rim,
   hollow. Everything on it is also written in words. The layout follows the widget's OWN box (container queries).
   ========================================================================== */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = { sunrise: S('<path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 5v4M8.5 7.5 10 9M15.5 7.5 14 9"/><path d="m9.5 4.5 2.5-2 2.5 2"/>'),
    sunset: S('<path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 5v4M8.5 7.5 10 9M15.5 7.5 14 9"/><path d="m9.5 2.5 2.5 2 2.5-2"/>'), noon: S('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
    dawn: S('<path d="M4 18h16M7 18a5 5 0 0 1 10 0"/>'), dusk: S('<path d="M4 18h16M7 18a5 5 0 0 1 10 0"/>'), midnight: S('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>') };
  const EVENTS = [['rising', 'Sunrise', 'sunrise', 1], ['setting', 'Sunset', 'sunset', 1], ['noon', 'Solar noon', 'noon', 2], ['dawn', 'Dawn', 'dawn', 3], ['dusk', 'Dusk', 'dusk', 3], ['midnight', 'Midnight', 'midnight', 4]];
  const PHASE = { new_moon: 0, waxing_crescent: 0.125, first_quarter: 0.25, waxing_gibbous: 0.375, full_moon: 0.5, waning_gibbous: 0.625, last_quarter: 0.75, waning_crescent: 0.875 };
  const fin = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? null : Number(v));
  const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  /** a real moment in local time: "07:42" (today) · "Tomorrow 07:42" · "Sat 07:42" */
  function when(ts, now = Date.now()) {
    const d = new Date(ts), hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const days = Math.round((dayStart(ts) - dayStart(now)) / 86400000);
    return days === 0 ? hm : days === 1 ? `Tomorrow ${hm}` : days === -1 ? `Yesterday ${hm}` : `${d.toLocaleDateString([], { weekday: 'short' })} ${hm}`;
  }
  const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const compass = (az) => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8];
  /** the moon drawn for a named phase (northern hemisphere: waxing = lit on the right); flipped for the southern one */
  function moonSvg(phase, southern) {
    const f = PHASE[phase];
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 40 40'); svg.setAttribute('class', 'iq-sun__moonsvg'); svg.setAttribute('aria-hidden', 'true');
    const disc = document.createElementNS(NS, 'circle');
    disc.setAttribute('cx', 20); disc.setAttribute('cy', 20); disc.setAttribute('r', 16); disc.setAttribute('class', 'iq-sun__moondark');
    svg.append(disc);
    if (f === undefined) return svg;                                  // a phase name this widget does not know: a plain disc, the words say the rest
    const lit = document.createElementNS(NS, 'path');
    lit.setAttribute('class', 'iq-sun__moonlit');
    const r = 16, rx = (r * Math.abs(Math.cos(2 * Math.PI * f))).toFixed(2);
    let d = '';
    if (f === 0.5) d = `M20 ${20 - r}A${r} ${r} 0 1 1 20 ${20 + r}A${r} ${r} 0 1 1 20 ${20 - r}Z`;
    else if (f > 0 && f < 0.5) d = `M20 ${20 - r}A${r} ${r} 0 0 1 20 ${20 + r}A${rx} ${r} 0 0 ${f < 0.25 ? 0 : 1} 20 ${20 - r}Z`;
    else if (f > 0.5) d = `M20 ${20 - r}A${r} ${r} 0 0 0 20 ${20 + r}A${rx} ${r} 0 0 ${f < 0.75 ? 0 : 1} 20 ${20 - r}Z`;
    if (d) { lit.setAttribute('d', d); svg.append(lit); }
    if (southern) svg.style.transform = 'scaleX(-1)';
    return svg;
  }

  function create(config) {
    let s = { sun: null, moon: null, moonrise: null, moonset: null, ...(config || {}) };
    const ARC = ['minimal', 'horizon', 'atmospheric', 'detail', 'moon'];
    const variant = s.variant === 'times' ? 'times' : s.variant === 'arc' ? 'arc' : ARC.includes(s.variant) ? s.variant : 'sky';
    const root = document.createElement('article');
    root.className = 'iq-sun';
    root.dataset.variant = variant;
    root.setAttribute('role', 'group');
    if (s.id) root.dataset.iqSunId = s.id;
    root.innerHTML = `<div class="iq-sun__in">
      <header class="iq-sun__head"><h3 class="iq-sun__name"></h3><p class="iq-sun__sub"></p></header>
      <div class="iq-sun__sky"><svg viewBox="0 0 200 100" class="iq-sun__plot" aria-hidden="true"></svg></div>
      <div class="iq-sun__info"><p class="iq-sun__state"></p><p class="iq-sun__pos"></p><ul class="iq-sun__times"></ul>
        <div class="iq-sun__moon" hidden><span class="iq-sun__moonicon"></span><div class="iq-sun__moontxt"><b class="iq-sun__moonname"></b><span class="iq-sun__moonmore"></span></div></div></div></div>`;
    const $ = (q) => root.querySelector(q);
    const plot = $('.iq-sun__plot');
    const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); plot.append(e); return e; };
    // the sky as an arc over the horizon: east on the left, south in the middle, west on the right (the dot is the REAL azimuth / elevation)
    mk('path', { class: 'iq-sun__sky-bg', d: 'M8 88A92 80 0 0 1 192 88Z' });
    mk('path', { class: 'iq-sun__ring', d: 'M8 88A92 80 0 0 1 192 88' });
    mk('line', { class: 'iq-sun__axis', x1: 4, y1: 88, x2: 196, y2: 88 });
    [16, 100, 184].forEach((x) => mk('line', { class: 'iq-sun__tick', x1: x, y1: 88, x2: x, y2: 94 }));
    const dot = mk('circle', { class: 'iq-sun__dot', cx: 100, cy: 88, r: 6.5 });

    /* THE SUN PATH (the arc variants: minimal · horizon · atmospheric · detail · moon) — one drawing, styled per variant. The sun sits on
       the path at its REAL azimuth (east left, south middle, west right); above the horizon it glows, below it rests hollow under the
       line. The two labels are Home Assistant's NEXT sunrise and sunset. Nothing is computed (no golden hour, no day length). */
    const LOOK = { arcWidth: Math.min(8, Math.max(1, fin(s.arcWidth) ?? 2.5)), glow: s.glow !== false, horizon: s.showHorizon !== false, labels: s.showLabels !== false };
    let arc = null;
    if (ARC.includes(variant)) {
      const a = document.createElementNS(NS, 'svg');
      a.setAttribute('viewBox', '0 0 200 100'); a.setAttribute('class', 'iq-sun__arc'); a.setAttribute('aria-hidden', 'true');
      const ma = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); a.append(e); return e; };
      const H = variant === 'horizon' ? 62 : 74, PEAK = variant === 'detail' ? 10 : 18, L = 10, R = 190;
      // horizon: a wave through the horizon (the sun's day above, its night below); the others: a half-ellipse over the horizon
      const d = variant === 'horizon' ? `M0 90 C 40 90, 55 ${PEAK}, 100 ${PEAK} S 160 90, 200 90` : `M${L} ${H} A ${(R - L) / 2} ${H - PEAK} 0 0 1 ${R} ${H}`;
      const defs = document.createElementNS(NS, 'defs'); defs.innerHTML = `<radialGradient id="iqsg-${(s.id || 'x').replace(/[^a-z0-9-]/gi, '')}"><stop offset="0" stop-color="currentColor" stop-opacity=".55"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>`; a.append(defs);
      const gid = defs.firstChild.id;
      arc = { svg: a, H, PEAK, L, R, d,
        line: ma('line', { class: 'iq-sun__hz', x1: 0, y1: H, x2: 200, y2: H }),
        track: ma('path', { class: 'iq-sun__track', d, 'stroke-width': LOOK.arcWidth }),
        done: ma('path', { class: 'iq-sun__done', d, 'stroke-width': LOOK.arcWidth + 0.4 }),
        halo: ma('circle', { class: 'iq-sun__halo', r: 18, fill: `url(#${gid})` }),
        sun: ma('circle', { class: 'iq-sun__sun', r: variant === 'detail' ? 6 : 5.2 }),
        lRise: ma('text', { class: 'iq-sun__al', x: 4, y: 97, 'text-anchor': 'start' }),
        lSet: ma('text', { class: 'iq-sun__al', x: 196, y: 97, 'text-anchor': 'end' }) };
      if (!LOOK.horizon) arc.line.style.display = 'none';
      if (!LOOK.labels) { arc.lRise.style.display = 'none'; arc.lSet.style.display = 'none'; }
      if (!LOOK.glow) arc.halo.style.display = 'none';
      $('.iq-sun__sky').append(a);
      root.dataset.glow = String(LOOK.glow);
    }
    /* THE SUN ARC preset: the shared IniqSunArc (components/sunarc) — the sun placed by TIME between today's sunrise and sunset (HA's own
       times), its glow, the sunrise / sunset markers and times, the elevation; below the horizon it waits under the line. */
    let sunArc = null, seenRising = null, lastRising = null;
    if (variant === 'arc' && global.IniqSunArc) {
      sunArc = global.IniqSunArc.create({ glow: s.glow !== false, showTimes: s.showLabels !== false, showElevation: s.showElevation === true, showNow: s.showNow !== false, sunColor: s.sunColor, arcColor: s.arcColor });
      $('.iq-sun__sky').append(sunArc.el);
    }
    if (s.sunColor && /^[a-z-]{2,20}$/.test(s.sunColor)) root.style.setProperty('--iq-sun-c', `var(--${s.sunColor})`);
    if (s.arcColor && /^[a-z-]{2,20}$/.test(s.arcColor)) root.style.setProperty('--iq-sun-arc', `var(--${s.arcColor})`);
    /** the point of the path at x (sampled from the drawn path itself — the sun is always ON the line) */
    function onPath(x) {
      const p = arc.track; let lo = 0, hi = p.getTotalLength ? p.getTotalLength() : 0;
      if (!hi) return { x, y: arc.H };
      for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (p.getPointAtLength(m).x < x) lo = m; else hi = m; }
      const pt = p.getPointAtLength((lo + hi) / 2); return { x: pt.x, y: pt.y, len: (lo + hi) / 2 };
    }

    function render() {
      const sun = s.sun || {}, now = Date.now();
      const st = String(sun.state ?? '').toLowerCase();
      const above = st === 'above_horizon', below = st === 'below_horizon', na = !above && !below;
      root.dataset.phase = above ? 'above' : below ? 'below' : 'na';
      $('.iq-sun__name').textContent = s.name || 'Sun & Moon';
      $('.iq-sun__sub').textContent = s.subtitle || ''; $('.iq-sun__sub').hidden = !s.subtitle;
      const el = fin(sun.elevation), az = fin(sun.azimuth);
      // the plot: only with a real azimuth AND elevation; the dot rests on the rim (hollow) below the horizon
      const hasPos = !na && el !== null && az !== null;
      dot.style.display = hasPos ? '' : 'none';
      if (hasPos) {
        const x = Math.max(10, Math.min(190, 100 + ((az - 180) / 90) * 84)), y = el >= 0 ? 88 - (Math.min(90, el) / 90) * 72 : 88 + Math.min(8, (-el / 30) * 8);
        dot.setAttribute('cx', x.toFixed(2)); dot.setAttribute('cy', y.toFixed(2));
        dot.setAttribute('class', `iq-sun__dot${el < 0 ? ' iq-sun__dot--below' : ''}`);
      }
      if (arc) {
        root.dataset.sky = !hasPos ? 'na' : el >= 6 ? 'day' : el > -6 ? 'twilight' : 'night';
        arc.svg.style.visibility = hasPos ? '' : 'hidden';
        if (hasPos) {
          const x = Math.max(arc.L, Math.min(arc.R, 100 + ((az - 180) / 90) * 90));
          const pt = arc.svg.isConnected || arc.track.getTotalLength ? onPath(x) : { x, y: arc.H };
          const below2 = el < 0;
          // above: on the path; below: on the path's lower half (horizon wave) or just under the horizon line (the arcs)
          const y = below2 && variant !== 'horizon' ? arc.H + Math.min(10, 3 + (-el / 18) * 7) : pt.y;
          ['sun', 'halo'].forEach((k) => { arc[k].setAttribute('cx', pt.x.toFixed(2)); arc[k].setAttribute('cy', y.toFixed(2)); });
          arc.sun.setAttribute('class', `iq-sun__sun${below2 ? ' iq-sun__sun--below' : ''}`);
          arc.halo.style.opacity = below2 ? '0' : '';
          // the part of the path the sun has travelled today, brighter (only while it is up)
          const total = arc.track.getTotalLength ? arc.track.getTotalLength() : 0;
          if (total && pt.len !== undefined && !below2) { arc.done.style.strokeDasharray = `${pt.len.toFixed(1)} ${total.toFixed(1)}`; arc.done.style.display = ''; } else arc.done.style.display = 'none';
        }
      }
      if (sunArc) {
        // today's sunrise, seen happen: Home Assistant's next_rising moves on at sunrise — the value it leaves is today's sunrise
        const r = fin((sun.events || {}).rising);
        if (seenRising !== null && r !== null && r !== seenRising && seenRising <= now) lastRising = seenRising;
        if (r !== null) seenRising = r;
        sunArc.update({ ...sun, lastRising }, now);
      }
      $('.iq-sun__state').textContent = above ? 'Above the horizon' : below ? 'Below the horizon' : (st === 'unknown' ? 'Unknown' : 'Unavailable');
      $('.iq-sun__pos').textContent = hasPos ? `Elevation ${Math.round(el)}° · Azimuth ${Math.round(az)}° ${compass(az)}` : '';
      $('.iq-sun__pos').hidden = !hasPos;
      // the next events (as reported): chronological; the least important give way by the box (data-prio)
      const ev = sun.events || {};
      const rows = EVENTS.filter(([k]) => fin(ev[k]) !== null).map(([k, label, icon, prio]) => ({ k, label, icon, prio, ts: Number(ev[k]) })).sort((a, b) => a.ts - b.ts);
      $('.iq-sun__times').replaceChildren(...rows.map((r) => {
        const li = document.createElement('li');
        li.className = 'iq-sun__time'; li.dataset.prio = String(r.prio); li.dataset.k = r.k;
        li.innerHTML = `<span class="iq-sun__ti">${ICON[r.icon]}</span><span class="iq-sun__tl"></span><b class="iq-sun__tv"></b>`;
        li.querySelector('.iq-sun__tl').textContent = r.label; li.querySelector('.iq-sun__tv').textContent = when(r.ts, now);
        return li;
      }));
      root.dataset.hasTimes = rows.length ? 'true' : 'false';
      if (arc) {
        const r0 = rows.find((r) => r.k === 'rising'), s0 = rows.find((r) => r.k === 'setting');
        arc.lRise.textContent = r0 ? `↑ ${when(r0.ts, now)}` : ''; arc.lSet.textContent = s0 ? `${when(s0.ts, now)} ↓` : '';
      }
      // the moon: ONLY from the entities you mapped
      const m = s.moon, box = $('.iq-sun__moon');
      const mr = s.moonrise, ms = s.moonset;
      const part = (label, x) => (x && x.state === 'ready' ? `${label} ${x.ts !== null && x.ts !== undefined ? when(x.ts, now) : x.text}` : x && x.state === 'missing' ? `${label}: not found` : '');
      const more = [part('Moonrise', mr), part('Moonset', ms)].filter(Boolean).join(' · ');
      box.hidden = !(m || mr || ms);
      if (!box.hidden) {
        const ico = $('.iq-sun__moonicon'); ico.replaceChildren();
        if (m && m.state === 'ready' && m.available !== false) ico.append(moonSvg(m.phase, !!s.southern));
        $('.iq-sun__moonname').textContent = !m ? 'Moon' : m.state === 'loading' ? 'Moon…' : m.state === 'missing' ? 'Moon: not found' : m.available === false ? 'Moon unavailable' : m.text;
        $('.iq-sun__moonmore').textContent = more; $('.iq-sun__moonmore').hidden = !more;
      }
      root.dataset.hasMoon = box.hidden ? 'false' : 'true';
      // 'times' variant: the line is sunrise + sunset
      const sr = rows.find((r) => r.k === 'rising'), ss = rows.find((r) => r.k === 'setting');
      root.setAttribute('aria-label', `${s.name || 'Sun & Moon'}: ${$('.iq-sun__state').textContent}${hasPos ? `, elevation ${Math.round(el)} degrees, azimuth ${Math.round(az)} degrees ${compass(az)}` : ''}${sr ? `, sunrise ${when(sr.ts, now)}` : ''}${ss ? `, sunset ${when(ss.ts, now)}` : ''}${m && m.state === 'ready' ? `, moon ${m.text}` : ''}`);
    }
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => (w < 150 || h < 110 ? 'micro' : w >= h * 1.3 ? 'wide' : 'tall') });
    render();
    // "Tomorrow 07:42" ages with the day: refresh every 5 minutes while on screen (formatting only — no data is fetched)
    const t = setInterval(() => { if (!root.isConnected) clearInterval(t); else if (!document.hidden) render(); }, 300000);
    root.sunmoon = {
      getState: () => ({ phase: root.dataset.phase, moon: s.moon && s.moon.state === 'ready' ? s.moon.text : null, arc: sunArc ? sunArc.position({ ...(s.sun || {}), lastRising }) : null }),
      setState(patch = {}) { s = { ...s, ...patch }; render(); },
    };
    return root;
  }

  function constraints(config) {
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 };
  }

  global.MaisonSunMoon = { create, constraints, moonSvg };
})(window);
