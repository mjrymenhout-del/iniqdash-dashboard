/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqHA entity picker — choose a REAL Home Assistant entity for a widget.
   Reusable: the schema form uses it for any field of type 'entity'.

   IniqHA.picker({ domains, deviceClasses, value, onPick(entity|null), label }) → HTMLElement
     domains        the domains the widget can show (e.g. ['light']); chips narrow further
     deviceClasses  optional: only entities with one of these HA device classes (e.g. ['temperature'])
     value    the current entity id (or '')
   Lists what the connected Home Assistant reports (discovery through the IniqDash server):
   name, entity id, domain, area and current state. Search matches every word against name,
   entity id, area and domain ("living room", "light", "sensor kitchen", …).
   AREA CONTEXT (area: () → a Home Assistant area id | null, e.g. the Room's area): the list opens on the entities HA places in
   that area (their own area or their device's — HA's registry, never a name), search stays inside it, and "Show all entities"
   leaves it at any time (a context, never a restriction). An area with nothing suitable for this field opens on all entities.
   Domain chips are a secondary refinement behind "Filter by type".
   It only CHOOSES an entity: no device / integration / registry administration.
   ========================================================================== */
(function (global) {
  'use strict';

  const h = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => c !== null && c !== undefined && n.append(c));
    return n;
  };
  let uid = 0;
  const MAX = 150;

  function picker({ domains = null, deviceClasses = null, value = '', onPick, label = 'Home Assistant entity', describe = null, note = null, related = null, area = null, clear = 'Use demo data', empty = 'Not linked — the widget shows demo data' } = {}) {
    /* related() → Promise<[entity id…]>: entities on the same HA device, listed first under "From the same device" (a suggestion —
       nothing is selected or assumed). clear: the text of the clear button, or false for none. */
    /* note(entity) → '' | a short truthful remark shown next to an entity (e.g. Gauge / Chart: "Not numeric right now"); nothing is hidden */
    const HA = global.IniqHA;
    const id = `iqp-${++uid}`;
    let all = null, domain = '', current = value || '', near = [], scope = 'all', fellBack = false;
    const areaId = () => { const a = typeof area === 'function' ? area() : area; return typeof a === 'string' && a ? a : null; };
    const areaLabel = () => (HA.areaName && HA.areaName(areaId())) || areaId();
    /** the entities this field can use (its domains / device classes) that HA places in the context area */
    const inArea = () => (all || []).filter((e) => e.areaId === areaId() && (!domains || !domains.length || domains.includes(e.domain)));

    const cur = h('div', { class: 'iqp__cur' });
    const btnChoose = h('button', { type: 'button', class: 'iqp__btn', 'aria-expanded': 'false', 'aria-controls': `${id}-panel`, 'data-k': 'iqp-choose' }, h('span', { text: 'Choose…' }));
    const btnClear = h('button', { type: 'button', class: 'iqp__btn iqp__btn--quiet', 'data-k': 'iqp-clear' }, h('span', { text: clear || '' }));
    const search = h('input', { type: 'search', class: 'iqp__search', id: `${id}-q`, placeholder: 'Search — e.g. living room, light, kitchen', autocomplete: 'off', spellcheck: 'false', 'aria-label': `Search ${label}` });
    const chips = h('div', { class: 'iqp__chips', role: 'group', 'aria-label': 'Domain', hidden: true });
    const filterBtn = h('button', { type: 'button', class: 'iqp__link', 'data-k': 'iqp-filter', 'aria-expanded': 'false', hidden: true,
      onclick: () => { chips.hidden = !chips.hidden; filterBtn.setAttribute('aria-expanded', String(!chips.hidden)); if (chips.hidden && domain) { domain = ''; renderChips(); renderList(); } } }, h('span', { text: 'Filter by type' }));
    const scopeText = h('span', { class: 'iqp__scope-t', 'data-k': 'iqp-scope' });
    const scopeBtn = h('button', { type: 'button', class: 'iqp__link', 'data-k': 'iqp-scope-btn', onclick: () => { scope = scope === 'area' ? 'all' : 'area'; fellBack = false; domain = ''; renderChips(); renderList(); search.focus(); } });
    const scopeBar = h('div', { class: 'iqp__scope', hidden: true }, [scopeText, scopeBtn]);
    const tools = h('div', { class: 'iqp__tools' }, [scopeBar, filterBtn]);
    const info = h('p', { class: 'iqp__info', role: 'status' });
    const list = h('ul', { class: 'iqp__list', role: 'listbox', 'aria-label': label });
    const panel = h('div', { class: 'iqp__panel', id: `${id}-panel`, hidden: true }, [search, tools, chips, info, list]);
    const root = h('div', { class: 'iqp' }, [h('div', { class: 'iqp__row' }, [cur, btnChoose, btnClear]), panel]);

    function showCurrent() {
      const e = (all || []).find((x) => x.id === current) || (current && HA.get(current)) || null;
      cur.replaceChildren(current
        ? h('span', { class: 'iqp__sel' }, [h('b', { text: e?.name || current }), h('small', { text: `${current}${e ? ` · ${e.state}${e.unit ? ` ${e.unit}` : ''}` : ''}` }),
          describe ? h('small', { class: 'iqp__does', text: describe(current.split('.')[0]) }) : null,
          note && e && note(e) ? h('small', { class: 'iqp__note', text: note(e) }) : null])
        : h('span', { class: 'iqp__none', text: empty }));
      btnClear.hidden = !current || clear === false;
    }
    /** the entities in view: the context area's, or all */
    const base = () => (scope === 'area' && areaId() ? (all || []).filter((e) => e.areaId === areaId()) : (all || []));
    function renderChips() {
      const pool = base();
      const doms = domains && domains.length ? domains.filter((d) => pool.some((e) => e.domain === d)) : [...new Set(pool.map((e) => e.domain))].sort();
      chips.replaceChildren(...(doms.length > 1 ? ['', ...doms] : []).map((d) => h('button', { type: 'button', class: 'iqp__chip', 'aria-pressed': String(domain === d), 'data-domain': d, text: d || 'All',
        onclick: () => { domain = d; renderChips(); renderList(); } })));
      filterBtn.hidden = doms.length < 2;
      if (filterBtn.hidden) chips.hidden = true;
      // the area context bar: where the list is looking, and the way out (or back)
      const a = areaId(), has = a && all ? inArea().length > 0 : false;
      scopeBar.hidden = !a || !all || (scope === 'all' && !has);
      scopeText.textContent = scope === 'area' ? `In ${areaLabel()}` : fellBack ? `Nothing suitable in ${areaLabel()} — all entities` : 'All entities';
      scopeBtn.textContent = scope === 'area' ? 'Show all entities' : `Only ${areaLabel()}`;
      scopeBtn.hidden = scope === 'all' && !has;
    }
    /** opening the list: the context area first when it holds something this field can use, otherwise everything */
    function decideScope() {
      const a = areaId();
      scope = a && all && inArea().length ? 'area' : 'all';
      fellBack = !!a && !!all && scope === 'all';
      domain = '';
    }
    /** an empty result says what was searched for and which kinds of entity this field accepts */
    function noneText() {
      const kinds = domain ? [domain] : (domains && domains.length ? domains : null);
      const what = kinds ? `${kinds.join(' / ')} entities` : 'entities';
      const q = search.value.trim(), where = scope === 'area' && areaId() ? ` in ${areaLabel()}` : '';
      return q ? `No ${what}${where} match “${q.slice(0, 40)}”. ${where ? 'Try Show all entities, or another word.' : 'Try another word, or clear the search.'}` : `Home Assistant has no ${what}${where}.`;
    }
    function renderList() {
      const pool = HA.search(base(), search.value, domain ? [domain] : domains);
      info.textContent = !all ? 'Loading entities from Home Assistant…' : pool.length ? `${pool.length} entit${pool.length === 1 ? 'y' : 'ies'}${pool.length > MAX ? ` — showing the first ${MAX}, refine the search` : ''}` : noneText();
      // same-device suggestions first (when known), then every other entity — all remain available
      const first = near.length ? pool.filter((e) => near.includes(e.id)) : [];
      const rest = first.length ? pool.filter((e) => !near.includes(e.id)) : pool;
      const head = (text) => h('li', { role: 'presentation', class: 'iqp__group' }, h('span', { text }));
      const row = (e) => h('li', { role: 'option', 'aria-selected': String(e.id === current) }, h('button', { type: 'button', class: 'iqp__item', 'data-entity': e.id,
        onclick: () => pick(e) }, [
        h('span', { class: 'iqp__name', text: e.name }),
        h('span', { class: 'iqp__state', text: `${e.state}${e.unit ? ` ${e.unit}` : ''}` }),
        h('span', { class: 'iqp__meta', text: `${e.id}${e.area ? ` · ${e.area}` : ''}` }),
        note && note(e) ? h('span', { class: 'iqp__note', text: note(e) }) : null,
      ]));
      list.replaceChildren(...(first.length ? [head('From the same device'), ...first.map(row), head('Other entities')] : []), ...rest.slice(0, MAX).map(row));
    }
    function pick(e) {
      current = e ? e.id : '';
      open(false);
      showCurrent();
      onPick && onPick(e || null);
    }
    async function load(fresh) {
      info.textContent = 'Loading entities from Home Assistant…';
      try {
        all = await HA.entities({ fresh });
        if (related) { try { near = (await related()) || []; } catch (e) { near = []; } }
        if (Array.isArray(deviceClasses) && deviceClasses.length) all = all.filter((e) => deviceClasses.includes(e.dc));
        if (!panel.hidden) decideScope();
        renderChips(); renderList(); showCurrent();
        if (!all.length && HA.status().state === 'not_configured') info.textContent = 'Home Assistant is not configured on this server (php server/setup.php --ha).';
      } catch (err) {
        info.textContent = `Home Assistant did not answer (${err.message}). Try again in a moment.`;
      }
    }
    function open(on) {
      panel.hidden = !on;
      btnChoose.setAttribute('aria-expanded', String(on));
      if (on) { if (!all) load(false); else { decideScope(); renderChips(); renderList(); } search.focus(); }
    }

    btnChoose.addEventListener('click', () => open(panel.hidden));
    btnClear.addEventListener('click', () => pick(null));
    search.addEventListener('input', renderList);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); open(false); btnChoose.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); list.querySelector('button')?.focus(); }
      if (e.key === 'Enter') { e.preventDefault(); const first = list.querySelector('button'); if (first) first.click(); }
    });
    list.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      const bs = [...list.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
      e.preventDefault();
      (bs[i + (e.key === 'ArrowDown' ? 1 : -1)] || (e.key === 'ArrowUp' ? search : bs[i]))?.focus();
    });
    showCurrent();
    root.picker = { open: () => open(true), value: () => current };
    return root;
  }

  if (global.IniqHA) global.IniqHA.picker = picker;
})(window);
