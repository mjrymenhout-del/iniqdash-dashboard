/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Calendar Widget V2 — one or SEVERAL calendars merged in one card, each with its own colour and name.

   MaisonCalendar.create(config) → HTMLElement (.ca), with el.calendar = { getState(), setState(patch) }

   config = {
     id, name:   'Family'
     view:       'agenda' (default: the next event large, then a short list) | 'list' (days grouped) | 'day' | 'week' | 'month'
     sources:    [{ key, label, color, ok (bool), message? }]   the calendars (LINKED: from the binding; DEMO: config.demoSources)
     events:     [{ title, start, end?, location?, description?, allDay?, src? }]   start/end: Date or ISO; src = a source key
                 (all-day: end is exclusive — the midnight after the last day; an event may span several days)
     items:      LINKED (bindMany) { sources, events, message } — merged into the state
     message:    a line shown instead of "No upcoming events" (e.g. "Loading events…")
     days:       days ahead in the list view (1–62, default 14)
     weekStart:  '' (from the language) | '1' Monday | '0' Sunday | '6' Saturday
     dayStart, dayEnd: first / last hour of the day and week views (0–23 / 1–24; default 7 → 22)
     legend:     true (default) — the calendars as chips; a tap shows / hides that calendar on this screen
     now:        optional Date/ISO (demo determinism)    locale: 'en-GB'    hour12: false    available: true
     onRange(w): LINKED — the widget asks for the days it shows: { from: 'YYYY-MM-DD', days: 1–62 } (null: the default window)
   }
   One calendar that fails never hides the others: its chip says so and the rest are shown. Overlapping timed events sit side by side
   in the day and week views. A tap on an event opens its details inside the card (Escape or the close button returns).
   ========================================================================== */
(function (global) {
  'use strict';

  const PALETTE = ['#5b8def', '#e8697d', '#3fb68b', '#f2a93b', '#a37cf0', '#36b9cc', '#ef7f4c', '#8aa0b8'];
  const toDate = (v) => { if (v === null || v === undefined || v === '') return null; const d = v instanceof Date ? new Date(v.getTime()) : new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const VIEWS = ['agenda', 'list', 'day', 'week', 'month'];
  const VIEW_LABEL = { agenda: 'Next', list: 'List', day: 'Day', week: 'Week', month: 'Month' };

  /** the first day of the week from the language (Intl weekInfo where the browser has it), else Monday */
  function autoWeekStart(locale) {
    try { const l = new Intl.Locale(locale); const w = l.weekInfo || (l.getWeekInfo && l.getWeekInfo()); if (w && w.firstDay) return w.firstDay % 7; } catch (e) { /* older browser */ }
    return 1;
  }

  /** timed events of ONE day → [{ e, lane, lanes }] — overlapping events share the width side by side */
  function lanes(list) {
    const out = [];
    let group = [], end = -Infinity;
    const flush = () => {
      const cols = [];
      group.forEach((x) => { let i = cols.findIndex((t) => t <= x.s); if (i < 0) { i = cols.length; cols.push(0); } cols[i] = x.f; x.lane = i; });
      group.forEach((x) => { x.lanes = cols.length; out.push(x); });
      group = []; end = -Infinity;
    };
    list.slice().sort((a, b) => a.s - b.s || b.f - a.f).forEach((x) => { if (x.s >= end) flush(); group.push(x); end = Math.max(end, x.f); });
    flush();
    return out;
  }

  /** LINKED (bindMany): config.items = { sources, events, message, available } replaces the demo agenda AND its fixed demo clock */
  function linkedPatch(p) {
    if (!p.items || typeof p.items !== 'object') return p;
    const o = { ...p, sources: p.items.sources, events: p.items.events, message: p.items.message, available: p.items.available !== false, now: undefined, demoSources: undefined };
    delete o.items;
    return o;
  }

  function create(config) {
    let s = linkedPatch({ available: true, locale: 'en-GB', hour12: false, events: [], view: 'agenda', legend: true, ...(config || {}) });
    const hidden = new Set();            // calendars hidden on THIS screen (legend chips); "hidden at first" from the configuration
    let anchor = null;                   // the day / week / month shown (null: around today)
    let detail = null;                   // the event whose details are open
    const root = document.createElement('article');
    root.className = 'ca';
    if (s.id) root.dataset.calendarId = s.id;
    root.innerHTML = `
      <div class="ca__in">
        <header class="ca__head"><span class="ca__leaf" aria-hidden="true"><b class="ca__leaf-m"></b><b class="ca__leaf-d"></b></span><span class="ca__cal"><span class="ca__cal-name"></span><span class="ca__cal-day"></span></span>
          <nav class="ca__nav" aria-label="Dates"><button type="button" class="ca__navb" data-go="-1" aria-label="Previous">‹</button><button type="button" class="ca__navb ca__today" data-go="0">Today</button><button type="button" class="ca__navb" data-go="1" aria-label="Next">›</button></nav>
        </header>
        <ul class="ca__legend" aria-label="Calendars"></ul>
        <div class="ca__body">
          <div class="ca__next"></div>
          <ol class="ca__list"></ol>
          <p class="ca__more"></p>
        </div>
        <div class="ca__grid" hidden></div>
        <section class="ca__detail" role="dialog" aria-modal="false" hidden><button type="button" class="ca__close" aria-label="Close details">×</button><p class="ca__d-cal"></p><h3 class="ca__d-title"></h3><p class="ca__d-when"></p><p class="ca__d-where"></p><p class="ca__d-desc"></p></section>
      </div>`;
    const $ = (q) => root.querySelector(q);
    const fmt = {};
    const f = (k, o) => (fmt[`${s.locale}|${k}`] ||= new Intl.DateTimeFormat(s.locale, o));
    const time = (d) => f(`t${s.hour12 ? 12 : 24}`, { hour: '2-digit', minute: '2-digit', hour12: !!s.hour12 }).format(d);
    const nowOf = () => toDate(s.now) || new Date();
    const view = () => (VIEWS.includes(s.view) ? s.view : 'agenda');
    function dayLabel(d, now) {
      const diff = Math.round((sod(d) - sod(now)) / 86400000);
      if (diff === 0) return 'Today';
      if (diff === 1) return 'Tomorrow';
      if (diff === -1) return 'Yesterday';
      return diff > 0 && diff < 7 ? f('wd', { weekday: 'long' }).format(d) : f('dm', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
    }
    const short = (d) => f('ds', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
    const lastDay = (e) => (e.end ? new Date(e.end.getTime() - (e.allDay ? 1 : 0)) : e.start);
    const multi = (e) => !!e.end && dayKey(e.start) !== dayKey(new Date(e.end.getTime() - 1));
    function when(e, now) {
      if (e.allDay) return multi(e) ? `All day · until ${dayLabel(lastDay(e), now)}` : 'All day';
      if (e.start <= now && e.end && e.end > now) return `Now · until ${dayKey(e.end) === dayKey(now) ? time(e.end) : `${dayLabel(e.end, now)} ${time(e.end)}`}`;
      if (!e.end) return time(e.start);
      return multi(e) ? `${time(e.start)} – ${short(e.end)} ${time(e.end)}` : `${time(e.start)} – ${time(e.end)}`;
    }
    function heroWhen(e, now) {
      if (e.start > now) return `${dayLabel(e.start, now)} · ${when(e, now)}`;
      if (e.allDay) return multi(e) ? `Until ${dayLabel(lastDay(e), now)}` : 'Today · All day';
      return when(e, now);
    }

    /* ---- the calendars and their events */
    function sources() {
      const list = Array.isArray(s.sources) && s.sources.length ? s.sources : Array.isArray(s.demoSources) ? s.demoSources : [];
      // a calendar without its own colour takes the next palette colour NOT already chosen for another calendar (no look-alike pair)
      const taken = new Set(list.map((x) => String(x.color || '').toLowerCase()).filter(Boolean)), free = PALETTE.filter((c) => !taken.has(c));
      let n = 0;
      const auto = () => (free.length ? free[n++ % free.length] : PALETTE[n++ % PALETTE.length]);
      return list.map((x, i) => ({ key: String(x.key ?? i), hiddenAtFirst: x.hidden === true, label: x.label || `Calendar ${i + 1}`, color: x.color || auto(), ok: x.ok !== false, message: x.message || '' }));
    }
    function allEvents() {
      const src = sources(), byKey = new Map(src.map((x) => [x.key, x]));
      return (s.events || [])
        .map((e) => ({ ...e, title: String(e.title ?? '').trim() || '(No title)', start: toDate(e.start), end: toDate(e.end), src: e.src !== undefined ? String(e.src) : (src[0] && src[0].key) }))
        .filter((e) => e.start && !hidden.has(e.src))
        .map((e) => (e.allDay && !e.end ? { ...e, end: new Date(new Date(e.start).setHours(24, 0, 0, 0)) } : e))
        .map((e) => ({ ...e, cal: byKey.get(e.src) || { label: '', color: PALETTE[0] } }))
        .sort((a, b) => a.start - b.start || (b.allDay - a.allDay) || a.title.localeCompare(b.title));
    }
    const upcoming = (now) => allEvents().filter((e) => (e.end || e.start) > now);
    /** events touching the day d (all-day by date, timed by their span) */
    const onDay = (ev, d) => { const a = sod(d), b = addDays(a, 1); return ev.filter((e) => e.start < b && (e.end ? e.end > a : e.start >= a)); };

    /* ---- the period a view shows, and the window it asks Home Assistant for */
    function period(now) {
      const v = view(), base = sod(anchor || now);
      if (v === 'day') return { from: base, days: 1 };
      if (v === 'week') { const ws = s.weekStart === '' || s.weekStart === undefined ? autoWeekStart(s.locale) : Number(s.weekStart); const off = (base.getDay() - ws + 7) % 7; return { from: addDays(base, -off), days: 7 }; }
      if (v === 'month') {
        const first = new Date(base.getFullYear(), base.getMonth(), 1), ws = s.weekStart === '' || s.weekStart === undefined ? autoWeekStart(s.locale) : Number(s.weekStart);
        return { from: addDays(first, -((first.getDay() - ws + 7) % 7)), days: 42, month: first.getMonth(), first };
      }
      if (v === 'list') return { from: anchor ? base : sod(now), days: Math.max(1, Math.min(62, Number(s.days) || 14)) };
      return null;   // agenda: the default window
    }
    let lastAsk = '';
    function ask(now) {
      if (typeof s.onRange !== 'function') return;
      const p = period(now);
      // a day either side: the server's window is in UTC days
      const w = p && (p.days > 14 || anchor || view() !== 'list') ? { from: ymd(addDays(p.from, -1)), days: Math.min(62, p.days + 2) } : null;
      const k = w ? `${w.from}/${w.days}` : '';
      if (k === lastAsk) return;
      lastAsk = k;
      s.onRange(w);
    }

    /* ---- the legend (the calendars, show / hide on this screen) */
    const seenSrc = new Set();
    function legend() {
      const ul = $('.ca__legend'), src = sources();
      src.forEach((x) => { if (!seenSrc.has(x.key)) { seenSrc.add(x.key); if (x.hiddenAtFirst) hidden.add(x.key); } });
      ul.hidden = s.legend === false || src.length < 2 && !(src[0] && !src[0].ok);
      ul.replaceChildren(...src.map((x) => {
        const li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button'; b.className = 'ca__chip'; b.style.setProperty('--c', x.color);
        b.dataset.src = x.key; b.dataset.ok = String(x.ok); b.setAttribute('aria-pressed', String(!hidden.has(x.key)));
        b.title = x.ok ? (hidden.has(x.key) ? `Show ${x.label}` : `Hide ${x.label}`) : `${x.label}: ${x.message || 'could not be loaded'}`;
        b.innerHTML = '<i aria-hidden="true"></i><span></span>';
        b.querySelector('span').textContent = x.ok ? x.label : `${x.label} — ${x.message || 'unavailable'}`;
        b.addEventListener('click', (ev) => { ev.stopPropagation(); if (hidden.has(x.key)) hidden.delete(x.key); else hidden.add(x.key); render(); });
        li.append(b); return li;
      }));
    }

    /* ---- an event as a tappable chip / row (details on tap) */
    function evButton(e, cls, text) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = cls; b.style.setProperty('--c', e.cal.color);
      b.textContent = text;
      b.title = `${e.title}${e.cal.label ? ` · ${e.cal.label}` : ''}`;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); detail = e; showDetail(); });
      return b;
    }
    function showDetail() {
      const d = $('.ca__detail'), now = nowOf();
      d.hidden = !detail;
      if (!detail) return;
      d.style.setProperty('--c', detail.cal.color);
      $('.ca__d-cal').textContent = detail.cal.label || '';
      $('.ca__d-title').textContent = detail.title;
      $('.ca__d-when').textContent = `${detail.allDay ? short(detail.start) : dayLabel(detail.start, now)} · ${when(detail, now)}`;
      $('.ca__d-where').textContent = detail.location || ''; $('.ca__d-where').hidden = !detail.location;
      $('.ca__d-desc').textContent = detail.description || ''; $('.ca__d-desc').hidden = !detail.description;
      $('.ca__close').focus({ preventScroll: true });
    }
    $('.ca__close').addEventListener('click', (ev) => { ev.stopPropagation(); detail = null; showDetail(); });
    root.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && detail) { ev.stopPropagation(); detail = null; showDetail(); } });
    root.querySelectorAll('.ca__navb').forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const go = Number(b.dataset.go), v = view(), now = nowOf(), base = sod(anchor || now);
      if (!go) anchor = null;
      else if (v === 'month') anchor = new Date(base.getFullYear(), base.getMonth() + go, 1);
      else anchor = addDays(base, go * (v === 'week' ? 7 : v === 'list' ? Math.max(1, Math.min(62, Number(s.days) || 14)) : 1));
      render();
    }));

    /* ---- AGENDA (the original look: the next event large, then as many rows as fit) */
    let rows = [];
    function agenda(now, ok) {
      const ev = ok ? upcoming(now) : [];
      root.dataset.count = String(ev.length);
      const next = $('.ca__next');
      next.replaceChildren();
      if (!ok || !ev.length) {
        const p = document.createElement('p'); p.className = 'ca__empty';
        p.textContent = typeof s.message === 'string' && s.message ? s.message : ok ? 'No upcoming events' : 'Calendar unavailable';
        next.append(p);
      } else {
        const e = ev[0];
        next.innerHTML = '<p class="ca__when"></p><h3 class="ca__title"></h3><p class="ca__where"></p>';
        next.style.setProperty('--c', e.cal.color);
        next.querySelector('.ca__when').textContent = `${heroWhen(e, now)}${sources().length > 1 && e.cal.label ? ` · ${e.cal.label}` : ''}`;
        const t = next.querySelector('.ca__title'); t.replaceChildren(evButton(e, 'ca__hero', e.title));
        next.querySelector('.ca__where').textContent = e.location || '';
        next.querySelector('.ca__where').hidden = !e.location;
        root.dataset.live = e.start <= now ? 'true' : 'false';
      }
      const list = $('.ca__list');
      list.replaceChildren();
      const shown = (e) => (e.start < now ? now : e.start);
      let prevDay = dayKey(ev[0] ? shown(ev[0]) : now);
      rows = ev.slice(1).map((e) => {
        const li = document.createElement('li');
        li.className = 'ca__row'; li.style.setProperty('--c', e.cal.color);
        const dk = dayKey(shown(e));
        li.innerHTML = '<span class="ca__row-t"></span><span class="ca__row-x"><b></b><span></span></span>';
        li.querySelector('.ca__row-t').textContent = e.allDay ? 'All day' : e.start <= now ? 'Now' : time(e.start);
        li.querySelector('b').replaceChildren(evButton(e, 'ca__ev', e.title));
        li.querySelector('.ca__row-x span').textContent = [dk !== prevDay ? dayLabel(shown(e), now) : '',
          multi(e) ? `until ${dayLabel(lastDay(e), now)}${e.allDay ? '' : ` ${time(e.end)}`}` : '', e.location || ''].filter(Boolean).join(' · ');
        prevDay = dk;
        list.appendChild(li);
        return li;
      });
      fit();
    }
    function fit() {
      const list = $('.ca__list'), more = $('.ca__more');
      rows.forEach((r) => { r.hidden = false; });
      more.textContent = '';
      if (view() !== 'agenda' || !rows.length || getComputedStyle(list).display === 'none') { more.hidden = true; return; }
      more.hidden = false; more.textContent = `+${rows.length} more`;
      const box = list.getBoundingClientRect();
      let shown = 0;
      rows.forEach((r) => { const b = r.getBoundingClientRect(); if (b.bottom <= box.bottom + .5) shown += 1; else r.hidden = true; });
      const left = rows.length - shown;
      more.textContent = left ? `+${left} more` : '';
      more.hidden = !left;
    }

    /* ---- LIST (days grouped) */
    function listView(now, ok, grid) {
      const p = period(now), ev = ok ? allEvents() : [];
      const wrap = document.createElement('div'); wrap.className = 'ca__days';
      let any = false;
      for (let i = 0; i < p.days; i++) {
        const d = addDays(p.from, i), day = onDay(ev, d).filter((e) => (e.end || e.start) > (i === 0 && !anchor ? now : d) || e.allDay);
        if (!day.length) continue;
        any = true;
        const sec = document.createElement('section'); sec.className = 'ca__day';
        const h = document.createElement('h4'); h.textContent = dayLabel(d, now); if (dayKey(d) === dayKey(now)) h.dataset.today = 'true';
        const ul = document.createElement('ul');
        day.forEach((e) => { const li = document.createElement('li'); li.className = 'ca__lrow'; li.style.setProperty('--c', e.cal.color);
          const t = document.createElement('span'); t.className = 'ca__lt'; t.textContent = e.allDay || (e.start < sod(d)) ? 'All day' : time(e.start);
          li.append(t, evButton(e, 'ca__ev', e.title)); if (e.location) { const w = document.createElement('span'); w.className = 'ca__lw'; w.textContent = e.location; li.append(w); } ul.append(li); });
        sec.append(h, ul); wrap.append(sec);
      }
      if (!any) { const e = document.createElement('p'); e.className = 'ca__empty'; e.textContent = typeof s.message === 'string' && s.message ? s.message : ok ? 'No events in these days' : 'Calendar unavailable'; wrap.append(e); }
      grid.replaceChildren(wrap);
    }

    /* ---- DAY / WEEK (all-day row, then hours; overlapping events side by side) */
    function timeGrid(now, ok, grid) {
      const p = period(now), ev = ok ? allEvents() : [];
      const h0 = Math.max(0, Math.min(23, Number.isFinite(Number(s.dayStart)) && s.dayStart !== '' && s.dayStart !== undefined ? Number(s.dayStart) : 7));
      const h1 = Math.max(h0 + 1, Math.min(24, Number.isFinite(Number(s.dayEnd)) && s.dayEnd !== '' && s.dayEnd !== undefined ? Number(s.dayEnd) : 22));
      const span = (h1 - h0) * 60;
      const g = document.createElement('div'); g.className = 'ca__tg'; g.style.setProperty('--cols', p.days); g.style.setProperty('--hrs', h1 - h0);
      const head = document.createElement('div'); head.className = 'ca__tg-head';
      const allday = document.createElement('div'); allday.className = 'ca__tg-all';
      const body = document.createElement('div'); body.className = 'ca__tg-body';
      const hours = document.createElement('div'); hours.className = 'ca__tg-hours';
      for (let h = h0; h < h1; h++) { const x = document.createElement('span'); x.textContent = time(new Date(2000, 0, 1, h)); x.style.top = `${((h - h0) * 60 / span) * 100}%`; hours.append(x); }
      head.append(document.createElement('span')); allday.append(Object.assign(document.createElement('span'), { className: 'ca__tg-alll', textContent: 'All day' }));
      body.append(hours);
      for (let i = 0; i < p.days; i++) {
        const d = addDays(p.from, i), day = onDay(ev, d);
        const hd = document.createElement('span'); hd.className = 'ca__tg-d'; hd.textContent = p.days === 1 ? f('full', { weekday: 'long', day: 'numeric', month: 'long' }).format(d) : f('wdd', { weekday: 'short', day: 'numeric' }).format(d);
        if (dayKey(d) === dayKey(now)) hd.dataset.today = 'true';
        head.append(hd);
        const ad = document.createElement('div'); ad.className = 'ca__tg-ad';
        day.filter((e) => e.allDay || multi(e)).forEach((e) => ad.append(evButton(e, 'ca__chipev', e.title)));
        allday.append(ad);
        const col = document.createElement('div'); col.className = 'ca__tg-col';
        if (dayKey(d) === dayKey(now)) { col.dataset.today = 'true'; const m = (now.getHours() * 60 + now.getMinutes()) - h0 * 60; if (m >= 0 && m <= span) { const line = document.createElement('i'); line.className = 'ca__now'; line.style.top = `${(m / span) * 100}%`; col.append(line); } }
        const timed = day.filter((e) => !e.allDay && !multi(e)).map((e) => {
          const a = (e.start.getHours() * 60 + e.start.getMinutes()) - h0 * 60, b = e.end ? (e.end.getHours() * 60 + e.end.getMinutes()) - h0 * 60 : a + 30;
          return { e, s: Math.max(0, a), f: Math.min(span, Math.max(b, a + 20)) };
        }).filter((x) => x.f > 0 && x.s < span);
        lanes(timed).forEach((x) => {
          const b = evButton(x.e, 'ca__blk', '');
          b.style.top = `${(x.s / span) * 100}%`; b.style.height = `${Math.max(2.5, ((x.f - x.s) / span) * 100)}%`;
          b.style.left = `${(x.lane / x.lanes) * 100}%`; b.style.width = `${100 / x.lanes}%`;
          b.innerHTML = '<b></b><small></small>'; b.querySelector('b').textContent = x.e.title; b.querySelector('small').textContent = `${time(x.e.start)}${x.e.location ? ` · ${x.e.location}` : ''}`;
          col.append(b);
        });
        body.append(col);
      }
      g.append(head, allday, body);
      grid.replaceChildren(g);
      if (!ok) { const e = document.createElement('p'); e.className = 'ca__empty ca__over'; e.textContent = 'Calendar unavailable'; grid.append(e); }
    }

    /* ---- MONTH (six weeks; up to as many chips as fit, then "+n") */
    function monthView(now, ok, grid) {
      const p = period(now), ev = ok ? allEvents() : [];
      const m = document.createElement('div'); m.className = 'ca__mo';
      for (let i = 0; i < 7; i++) { const x = document.createElement('span'); x.className = 'ca__mo-wd'; x.textContent = f('wds', { weekday: 'narrow' }).format(addDays(p.from, i)); m.append(x); }
      for (let i = 0; i < 42; i++) {
        const d = addDays(p.from, i), day = onDay(ev, d), cell = document.createElement('div');
        cell.className = 'ca__mo-c'; if (d.getMonth() !== p.month) cell.dataset.out = 'true'; if (dayKey(d) === dayKey(now)) cell.dataset.today = 'true';
        const n = document.createElement('span'); n.className = 'ca__mo-n'; n.textContent = String(d.getDate()); cell.append(n);
        day.slice(0, 3).forEach((e) => cell.append(evButton(e, 'ca__mo-ev', e.title)));
        if (day.length > 3) { const more = document.createElement('span'); more.className = 'ca__mo-more'; more.textContent = `+${day.length - 3}`; cell.append(more); }
        m.append(cell);
      }
      grid.replaceChildren(m);
    }

    function render() {
      const now = nowOf(), ok = s.available !== false, v = view();
      root.dataset.state = ok ? 'ok' : 'unavailable';
      root.dataset.view = v;
      const p = period(now);
      $('.ca__leaf-m').textContent = f('m', { month: 'short' }).format(now);
      $('.ca__leaf-d').textContent = String(now.getDate());
      $('.ca__cal-name').textContent = s.name || 'Calendar';
      $('.ca__cal-day').textContent = !p ? f('today', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
        : v === 'month' ? f('my', { month: 'long', year: 'numeric' }).format(p.first)
          : v === 'day' ? f('today', { weekday: 'long', day: 'numeric', month: 'long' }).format(p.from)
            : `${f('dmo', { day: 'numeric', month: 'short' }).format(p.from)} – ${f('dmo', { day: 'numeric', month: 'short' }).format(addDays(p.from, p.days - 1))}`;
      $('.ca__nav').hidden = v === 'agenda';
      $('.ca__today').disabled = !anchor;
      legend();
      $('.ca__body').hidden = v !== 'agenda';
      const grid = $('.ca__grid');
      grid.hidden = v === 'agenda';
      if (v === 'agenda') { grid.replaceChildren(); agenda(now, ok); }
      else { rows = []; root.dataset.count = String(ok ? allEvents().length : 0); if (v === 'list') listView(now, ok, grid); else if (v === 'month') monthView(now, ok, grid); else timeGrid(now, ok, grid); }
      if (detail && hidden.has(detail.src)) detail = null;
      showDetail();
      ask(now);
    }
    new ResizeObserver(() => fit()).observe(root);

    render();
    root.calendar = {
      getState: () => ({ upcoming: upcoming(nowOf()).length, available: s.available !== false, view: view(), sources: sources().map((x) => ({ ...x, hidden: hidden.has(x.key) })),
        shown: allEvents().length, anchor: anchor ? ymd(anchor) : null }),
      setState(patch) {
        const p = linkedPatch({ ...(patch || {}) });
        if (p.view !== undefined && p.view !== s.view) anchor = null;
        s = { ...s, ...p }; render();
      },
    };
    return root;
  }

  /** minW 2, minH 3 (agenda). The day / week / month views need room: they ask for more. */
  function constraints(c) {
    const v = c && c.view;
    if (v === 'week' || v === 'month') return { minW: { desktop: 5, tablet: 4, mobile: 4 }, minH: 6 };
    if (v === 'day' || v === 'list') return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 5 };
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 3 };
  }

  global.MaisonCalendar = { create, constraints, PALETTE, lanes };
})(window);
