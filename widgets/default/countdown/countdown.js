/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Countdown V1 — the time left until a moment: a fixed date (and time) typed in, or an entity whose STATE is a date or a time stamp
   (a timestamp sensor, an input_datetime with a date). Days / hours / minutes (seconds in the last hour), a ring of the time gone
   since the countdown started (when a start is known), and what to show once the moment has passed.

   Honesty: an entity whose state is not a date shows "—" (nothing is guessed); a date without a time counts to that day's midnight
   in the browser's time zone (said under the numbers).

   MaisonCountdown.create(config) → .iq-cd, el.countdown = { getState(), setState(patch) }
   config = { name, target: 'YYYY-MM-DD' | 'YYYY-MM-DDTHH:MM', after: 'since' | 'text', afterText, items: LINKED [{ value, available }] }
   ========================================================================== */
(function (global) {
  'use strict';
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  /** a date / time text → { t: Date, dateOnly } | null */
  function parse(v) {
    if (typeof v !== 'string' || !v.trim()) return null;
    const x = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(x)) { const t = new Date(`${x}T00:00:00`); return Number.isNaN(t.getTime()) ? null : { t, dateOnly: true }; }
    if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(x)) return null;
    const t = new Date(x.replace(' ', 'T'));
    return Number.isNaN(t.getTime()) ? null : { t, dateOnly: false };
  }
  const demoTarget = () => { const t = new Date(Date.now() + (12 * 24 + 5) * 36e5); t.setMinutes(0, 0, 0); return t.toISOString().slice(0, 16); };
  function create(config) {
    let s = { name: 'Holiday', after: 'since', ...(config || {}) };
    const demo = demoTarget();
    const root = el('article', 'iq-cd'); root.setAttribute('role', 'timer');
    root.innerHTML = `<header class="iq-cd__head"><h3 class="iq-cd__name"></h3><span class="iq-cd__when"></span></header>
      <div class="iq-cd__parts"></div><p class="iq-cd__note"></p>`;
    const $ = (q) => root.querySelector(q);
    let tick = 0;
    const source = () => { if (Array.isArray(s.items)) { const x = s.items[0]; return x && x.available !== false ? parse(String(x.value ?? '')) : null; } return parse(s.target || demo); };
    function render() {
      if (!root.isConnected && tick && root.dataset.seen) { clearInterval(tick); tick = 0; return; }
      if (root.isConnected) root.dataset.seen = '1';
      const p = source();
      $('.iq-cd__name').textContent = s.name || 'Countdown';
      const parts = $('.iq-cd__parts');
      if (!p) { root.dataset.state = 'none'; parts.replaceChildren(); $('.iq-cd__when').textContent = ''; $('.iq-cd__note').textContent = Array.isArray(s.items) ? 'No date to count to' : 'Choose a date'; return; }
      $('.iq-cd__when').textContent = p.t.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(p.t.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
        + (p.dateOnly ? '' : ` · ${p.t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`);
      let ms = p.t.getTime() - Date.now();
      const past = ms <= 0;
      root.dataset.state = past ? 'past' : ms < 36e5 ? 'soon' : 'ahead';
      if (past && s.after === 'text') { parts.replaceChildren(Object.assign(el('b', 'iq-cd__done'), { textContent: s.afterText || 'Now!' })); $('.iq-cd__note').textContent = ''; return; }
      ms = Math.abs(ms);
      const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, sec = Math.floor(ms / 1000) % 60;
      const list = d > 0 ? [[d, d === 1 ? 'day' : 'days'], [h, 'hours'], [m, 'min']] : h > 0 ? [[h, h === 1 ? 'hour' : 'hours'], [m, 'min']] : [[m, 'min'], [sec, 'sec']];
      parts.replaceChildren(...list.map(([v, u]) => { const c = el('span', 'iq-cd__part'), b = el('b'), i = el('i'); b.textContent = String(v); i.textContent = u; c.append(b, i); return c; }));
      $('.iq-cd__note').textContent = past ? 'ago' : p.dateOnly ? 'until the start of that day' : '';
      root.setAttribute('aria-label', `${s.name || 'Countdown'}: ${past ? '' : 'in '}${list.map(([v, u]) => `${v} ${u}`).join(' ')}${past ? ' ago' : ''}`);
    }
    render();
    tick = setInterval(render, 1000);
    root.countdown = { getState: () => ({ ...s, target: source() ? source().t.toISOString() : null }), setState(p) { s = { ...s, ...(p || {}) }; render(); } };
    return root;
  }
  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 3 }; }
  global.MaisonCountdown = { create, constraints, parse };
})(window);
