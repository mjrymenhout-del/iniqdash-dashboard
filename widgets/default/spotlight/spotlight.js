/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Event spotlight V1 — the next few calendar events, ONE AT A TIME, large: a picture, an icon, the event's category with a "Reminder"
   chip, its title, when ("Today · All day", "Tomorrow · 18:00"), a note, and "1 of 3" with previous / next, dots and an optional
   automatic advance. Rules choose the picture, icon and category from words in the title ("waste" → a bin, "birthday" → a cake), so a
   waste-collection or birthdays calendar looks right without per-event configuration. Read only.

   MaisonSpotlight.create(config) → HTMLElement (.iq-spot), with el.spotlight = { getState(), setState(patch), index() }
   config = { id, name, events: [{ title, start, end?, allDay?, location?, description? }] (LINKED: the calendar's; UNLINKED: demo),
     max (1–10, default 3), rules: [{ match, category?, icon?, image? }] (first match wins; match = words separated by commas),
     image (the default picture), icon (the default icon, 'mdi:…'), category (the default category), chip ('Reminder'; '' hides it),
     auto (seconds between events, 0 = off), button: { label, icon?, popup?, page? } (the top-right chip), available, message, now? (demo clock) }
   ========================================================================== */
(function (global) {
  'use strict';
  const SAFE_IMG = /^(?!.*\.\.)((assets|widgets\/(default|custom))\/[A-Za-z0-9._\/-]+|api\/asset\.php\?id=[0-9a-f]{32})$/;
  const MDI = /^mdi:[a-z0-9-]{1,64}$/;
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const at = (days, hm) => { const d = new Date(); d.setDate(d.getDate() + days); if (hm) { const [h, m] = hm.split(':'); d.setHours(+h, +m, 0, 0); } else d.setHours(0, 0, 0, 0); return d; };
  const DEMO = () => [
    { title: 'General waste', start: at(0), allDay: true, description: 'Put the bin out tonight' },
    { title: "Léa's birthday", start: at(1), allDay: true, description: 'Dinner at 19:00' },
    { title: 'Recycling', start: at(3), allDay: true, description: 'Blue bags' }];
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  const toDate = (v) => (v instanceof Date ? v : v ? new Date(v) : null);
  /** "Today · All day", "Tomorrow · 18:00", "Fri 15 Nov · 09:30" */
  function when(e, now) {
    const s = toDate(e.start); if (!s) return '';
    const diff = Math.round((day(s) - day(now)) / 86400000);
    const d = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : s.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    return `${d} · ${e.allDay ? 'All day' : s.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  /** the first rule whose words appear in the title */
  function ruleFor(rules, title) {
    const t = String(title || '').toLowerCase();
    return (Array.isArray(rules) ? rules : []).find((r) => r && String(r.match || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean).some((w) => t.includes(w))) || null;
  }
  const PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const EXPAND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  function create(config) {
    let s = { max: 3, chip: 'Reminder', auto: 0, available: true, ...(config || {}) };
    let idx = 0, timer = 0;
    const root = el('article', 'iq-spot', { role: 'group', 'aria-roledescription': 'carousel' });
    root.innerHTML = `<div class="iq-spot__pic" aria-hidden="true"></div><div class="iq-spot__shade" aria-hidden="true"></div>
      <div class="iq-spot__top"><span class="iq-spot__count"></span><span class="iq-spot__nav"><button type="button" class="iq-spot__btn" data-k="prev" aria-label="Previous event">${PREV}</button><button type="button" class="iq-spot__btn" data-k="next" aria-label="Next event">${NEXT}</button><button type="button" class="iq-spot__chipbtn" data-k="chip"></button></span></div>
      <div class="iq-spot__body" aria-live="polite"><span class="iq-spot__ic" aria-hidden="true"></span><div class="iq-spot__cat"><span class="iq-spot__catt"></span><span class="iq-spot__tag"></span></div>
        <h3 class="iq-spot__title"></h3><div class="iq-spot__when">${CLOCK}<span></span></div><p class="iq-spot__note"></p></div>
      <div class="iq-spot__foot"><span class="iq-spot__dots"></span><button type="button" class="iq-spot__btn iq-spot__exp" data-k="expand" aria-label="Open the calendar">${EXPAND}</button></div>`;
    const $ = (q) => root.querySelector(q);
    const events = () => {
      const now = s.now ? toDate(s.now) : new Date(), src = Array.isArray(s.events) && (s.events.length || s.entity) ? s.events : s.entity ? [] : DEMO();
      return src.map((e) => ({ ...e, start: toDate(e.start), end: toDate(e.end) })).filter((e) => e.start && (e.end ? e.end > now : day(e.start) >= day(now)))
        .sort((a, b) => a.start - b.start).slice(0, Math.max(1, Math.min(10, Number(s.max) || 3)));
    };
    const go = (d) => { const n = events().length; if (!n) return; idx = (idx + d + n) % n; render(); restart(); };
    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-k]'); if (!b) return; ev.stopPropagation();
      if (b.dataset.k === 'prev') go(-1); else if (b.dataset.k === 'next') go(1);
      else if (b.dataset.k === 'chip') { const c = s.button || {}, action = c.popup ? { type: 'popup', popup: c.popup } : c.page ? { type: 'navigate', page: c.page } : null;
        if (action) root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action, meta: { source: 'link' }, widget: 'spotlight' } })); }
      else if (b.dataset.k === 'expand' && s.entity) root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action: { type: 'details', entity: s.entity, info: [], label: s.name || 'Calendar' }, meta: { source: 'more' }, widget: 'details' } }));
    });
    root.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowLeft') { go(-1); ev.preventDefault(); } else if (ev.key === 'ArrowRight') { go(1); ev.preventDefault(); } });
    function restart() { clearInterval(timer); const a = Number(s.auto) || 0; if (a >= 3) timer = setInterval(() => { if (!root.isConnected) { clearInterval(timer); return; } if (!root.matches(':hover, :focus-within')) go(1); }, a * 1000); }
    function render() {
      const list = events(), n = list.length, now = s.now ? toDate(s.now) : new Date();
      if (idx >= n) idx = 0;
      const e = list[idx] || null, r = e ? ruleFor(s.rules, e.title) : null;
      root.dataset.empty = e ? 'false' : 'true';
      $('.iq-spot__count').innerHTML = n ? `<b>${idx + 1}</b> of ${n}` : '';
      $('.iq-spot__count').hidden = n < 2;
      root.querySelectorAll('[data-k="prev"], [data-k="next"]').forEach((b) => { b.hidden = n < 2; });
      const c = s.button || {}, cb = $('[data-k="chip"]');
      cb.hidden = !(c.label && (c.popup || c.page));
      cb.innerHTML = ''; if (c.icon && MDI.test(c.icon)) cb.append(el('span', 'iq-spot__chipic', { 'data-mdi': c.icon, 'aria-hidden': 'true' }));
      cb.append(document.createTextNode(c.label || ''));
      const img = (r && r.image) || s.image, pic = $('.iq-spot__pic');
      pic.style.backgroundImage = img && SAFE_IMG.test(img) ? `url("${img}")` : '';
      root.dataset.pic = img && SAFE_IMG.test(img) ? 'true' : 'false';
      const icon = (r && r.icon) || s.icon || 'mdi:calendar-star';
      const ic = $('.iq-spot__ic'); ic.innerHTML = ''; ic.append(el('span', '', { 'data-mdi': MDI.test(icon) ? icon : 'mdi:calendar-star' }));
      $('.iq-spot__catt').textContent = String((r && r.category) || s.category || s.name || 'Calendar').toUpperCase();
      const tag = $('.iq-spot__tag'); tag.textContent = s.chip || ''; tag.hidden = !s.chip || !e;
      $('.iq-spot__title').textContent = e ? e.title : (s.message || (s.available === false ? 'Calendar unavailable' : 'Nothing coming up'));
      $('.iq-spot__when span').textContent = e ? when(e, now) : '';
      $('.iq-spot__when').hidden = !e;
      const note = $('.iq-spot__note'); note.textContent = e ? (e.description || e.location || '') : ''; note.hidden = !note.textContent;
      $('.iq-spot__dots').replaceChildren(...list.map((_, i) => el('span', i === idx ? 'is-on' : '')));
      $('[data-k="expand"]').hidden = !s.entity;
      root.setAttribute('aria-label', e ? `${s.name || 'Calendar'}: ${e.title}, ${when(e, now)}${n > 1 ? ` (${idx + 1} of ${n})` : ''}` : (s.name || 'Calendar'));
      if (global.IniqIcons) global.IniqIcons.fill(root);
    }
    render(); restart();
    root.tabIndex = 0;
    root.spotlight = { getState: () => ({ ...s }), index: () => idx, setState(patch) { s = { ...s, ...(patch || {}) }; render(); restart(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 4 }; }
  global.MaisonSpotlight = { create, constraints, ruleFor, when };
})(window);
