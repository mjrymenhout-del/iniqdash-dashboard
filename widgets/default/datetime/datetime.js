/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Date & Time Widget V1 — the clock of the device showing the dashboard (its own clock and time zone), or of one IANA time
   zone you choose. No server, no Home Assistant: the browser's clock, formatted with Intl.

   MaisonDateTime.create(config) → HTMLElement (.iq-clock), with el.datetime = { getState(), setState(patch) }

   config = {
     id, name:        optional label ("Amsterdam"); without one a chosen time zone's city is shown
     variant:         'digital' (default) | 'analogue' | 'date'
     timeZone:        'Europe/Amsterdam' | undefined (the device's own time zone). An invalid name falls back to the device's.
     hour12:          true | false | undefined (the device's locale decides)
     showSeconds:     false       digital: seconds · analogue: a second hand
     showDate:        true        digital / analogue: the date under the time
     dateStyle:       'long' (default: Thursday 23 October 2026) | 'medium' (Thu 23 Oct 2026) | 'short' (23/10/2026, the locale's order)
     numerals:        false       analogue: 12 · 3 · 6 · 9
     locale:          undefined (the browser's)
   }
   ONE shared ticker for every clock on the page: it fires on the second (only while a second is shown) or on the minute, pauses
   while the tab is hidden, and forgets clocks that left the page. The layout follows the widget's OWN box (MaisonFit + container
   units), never the screen. Time is read from Date.now() at each tick — never accumulated, so it cannot drift.
   ========================================================================== */
(function (global) {
  'use strict';

  const clocks = new Set();
  let timer = 0;
  const needSeconds = () => [...clocks].some((c) => c.seconds());
  function schedule() {
    clearTimeout(timer); timer = 0;
    if (!clocks.size || document.hidden) return;
    const now = Date.now(), ms = needSeconds() ? 1000 - (now % 1000) : 60000 - (now % 60000);
    timer = setTimeout(tick, ms + 15);
  }
  function tick() {
    const now = new Date();
    clocks.forEach((c) => { if (!c.root.isConnected) { if (++c.gone > 2) { clocks.delete(c); return; } } else c.gone = 0; c.paint(now); });
    schedule();
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) { clocks.forEach((c) => c.paint(new Date())); } schedule(); });

  const validZone = (tz) => { if (!tz) return undefined; try { new Intl.DateTimeFormat(undefined, { timeZone: tz }); return tz; } catch (e) { return undefined; } };
  const city = (tz) => String(tz || '').split('/').pop().replace(/_/g, ' ');
  const NS = 'http://www.w3.org/2000/svg';

  function create(config) {
    let s = { variant: 'digital', showDate: true, dateStyle: 'long', ...(config || {}) };
    const variant = ['analogue', 'date'].includes(s.variant) ? s.variant : 'digital';
    const root = document.createElement('article');
    root.className = 'iq-clock';
    root.dataset.variant = variant;
    root.setAttribute('role', 'timer');
    root.setAttribute('aria-live', 'off');
    if (s.id) root.dataset.iqClockId = s.id;
    root.innerHTML = `<div class="iq-clock__in"><p class="iq-clock__label"></p>
      <div class="iq-clock__digital"><span class="iq-clock__time"></span><span class="iq-clock__ampm"></span></div>
      <div class="iq-clock__face"></div>
      <div class="iq-clock__date"><span class="iq-clock__wd"></span><b class="iq-clock__day"></b><span class="iq-clock__my"></span><span class="iq-clock__line"></span></div></div>`;
    const $ = (q) => root.querySelector(q);

    /* ---- analogue face (SVG, 100 × 100) ---- */
    let hands = null;
    if (variant === 'analogue') {
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'iq-clock__svg'); svg.setAttribute('aria-hidden', 'true');
      const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); parent.append(e); return e; };
      el('circle', { class: 'iq-clock__dial', cx: 50, cy: 50, r: 47 });
      for (let i = 0; i < 60; i++) {
        const a = (i * 6 * Math.PI) / 180, major = i % 5 === 0, r1 = major ? 39 : 43, r2 = 45;
        el('line', { class: major ? 'iq-clock__tick iq-clock__tick--major' : 'iq-clock__tick', x1: 50 + r1 * Math.sin(a), y1: 50 - r1 * Math.cos(a), x2: 50 + r2 * Math.sin(a), y2: 50 - r2 * Math.cos(a) });
      }
      if (s.numerals) [[12, 50, 28], [3, 72, 50], [6, 50, 72], [9, 28, 50]].forEach(([n, x, y]) => { const t = el('text', { class: 'iq-clock__num', x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central' }); t.textContent = String(n); });
      hands = { h: el('line', { class: 'iq-clock__hand iq-clock__hand--h', x1: 50, y1: 56, x2: 50, y2: 30 }), m: el('line', { class: 'iq-clock__hand iq-clock__hand--m', x1: 50, y1: 58, x2: 50, y2: 15 }),
        s: el('line', { class: 'iq-clock__hand iq-clock__hand--s', x1: 50, y1: 62, x2: 50, y2: 11 }) };
      el('circle', { class: 'iq-clock__pin', cx: 50, cy: 50, r: 2.4 });
      $('.iq-clock__face').append(svg);
    }

    const zone = () => validZone(s.timeZone);
    const fmt = (opts) => new Intl.DateTimeFormat(s.locale || undefined, { timeZone: zone(), ...opts });
    const parts = (d, opts) => Object.fromEntries(fmt(opts).formatToParts(d).map((p) => [p.type, p.value]));
    // 12 or 24 hours: your choice, else the locale's own
    const is12 = () => (typeof s.hour12 === 'boolean' ? s.hour12 : !!fmt({ hour: 'numeric' }).resolvedOptions().hour12);
    const hc = () => (is12() ? { hour12: true } : { hourCycle: 'h23' });

    function paint(d = new Date()) {
      const tz = zone(), sec = !!s.showSeconds, h12 = is12();
      const label = s.name || (tz ? city(tz) : '');
      $('.iq-clock__label').textContent = label; $('.iq-clock__label').hidden = !label;
      root.dataset.hasLabel = label ? 'true' : 'false';
      // the time (24 h: two-digit hours — 09:05)
      const tp = parts(d, { hour: h12 ? 'numeric' : '2-digit', minute: '2-digit', second: '2-digit', ...hc() });
      if (variant === 'digital') {
        const t = `${tp.hour}:${tp.minute}${sec ? `:${tp.second}` : ''}`;
        $('.iq-clock__time').textContent = t;
        $('.iq-clock__ampm').textContent = h12 ? (tp.dayPeriod || '') : '';
        root.style.setProperty('--iq-clock-chars', String(Math.max(4, t.length + (h12 && tp.dayPeriod ? 3 : 0))));
      }
      if (hands) {
        const H = Number(parts(d, { hour: 'numeric', hourCycle: 'h23' }).hour) % 24, M = Number(tp.minute), S = Number(tp.second);
        hands.h.setAttribute('transform', `rotate(${((H % 12) + M / 60) * 30} 50 50)`);
        hands.m.setAttribute('transform', `rotate(${(M + S / 60) * 6} 50 50)`);
        hands.s.setAttribute('transform', `rotate(${S * 6} 50 50)`);
        hands.s.style.display = sec ? '' : 'none';
      }
      // the date
      const style = ['long', 'medium', 'short'].includes(s.dateStyle) ? s.dateStyle : 'long';
      const line = fmt({ dateStyle: style === 'long' ? 'full' : style }).format(d);
      const dateLine = $('.iq-clock__line');
      if (variant === 'date') {
        const dp = parts(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        $('.iq-clock__wd').textContent = dp.weekday || ''; $('.iq-clock__day').textContent = dp.day || ''; $('.iq-clock__my').textContent = `${dp.month || ''} ${dp.year || ''}`.trim();
        dateLine.hidden = true;
      } else {
        dateLine.textContent = line; dateLine.hidden = !s.showDate;
        root.dataset.hasDate = s.showDate ? 'true' : 'false';
      }
      const spoken = variant === 'date' ? line : `${fmt({ hour: 'numeric', minute: '2-digit', second: sec ? '2-digit' : undefined, ...hc() }).format(d)}${s.showDate ? `, ${line}` : ''}`;
      root.setAttribute('aria-label', `${label ? `${label}: ` : ''}${spoken}`);
    }
    const inst = { root, gone: 0, seconds: () => !!s.showSeconds && variant !== 'date', paint: (d) => paint(d) };
    clocks.add(inst);
    paint();
    schedule();
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => (h < 90 || w < 120 ? 'micro' : 'full') });
    root.datetime = {
      getState: () => ({ text: root.getAttribute('aria-label'), timeZone: zone() || null }),
      setState(patch = {}) { s = { ...s, ...patch }; paint(); schedule(); },
    };
    return root;
  }

  function constraints(config) {
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: config && config.variant === 'analogue' ? 2 : 1 };
  }

  global.MaisonDateTime = { create, constraints, validZone };
})(window);
