/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   ENTITY DETAILS — the ONE shared, domain-aware "More info" content for a linked Home Assistant entity.
   SYSTEM functionality: generated from the entity, never stored as dashboard content (not a user popup, no popup id).
   The application shows it in its own popup host (MaisonPopup.createHost) above any user popup.

   IniqHADetails.build({ entity, info, label }) → HTMLElement
     entity   the widget's primary entity id
     info     the widget's Information slots (Batch 2) — resolved from the SAME shared poll, never new entities of its own
   Everything shown comes from the shared HA layer:
     IniqHA.get / subscribe     live state (the existing poll)          IniqHA.info / format   Batch 1 wording
     IniqHA.slots               Information slots (Batch 2)             IniqHA.history         Batch 3 shared history
     IniqHA.logbook             read-only activity (api/ha_logbook.php: never a user id, a cause only when HA names one)
     IniqHA.calendar            a calendar's upcoming agenda   IniqHA.forecast   a weather entity's forecast (supported types only)
                                — the SAME lazily fetched, shared answers the Calendar / Weather widgets use (never the state poll)
   Never: coordinates, GPS accuracy, user ids, codes, tokens, raw attribute dumps. Nothing is invented: what HA does not
   report is simply not shown.
   ========================================================================== */
(function (global) {
  'use strict';

  const HA = () => global.IniqHA;
  const h = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => c !== null && c !== undefined && c !== false && n.append(c));
    return n;
  };
  const RANGES = [['1h', '1 h'], ['6h', '6 h'], ['24h', '24 h'], ['7d', '7 d']];
  const RANGE_TEXT = { '1h': 'Last hour', '6h': 'Last 6 hours', '24h': 'Last 24 hours', '7d': 'Last 7 days' };
  const TOGGLES = ['light', 'switch', 'fan', 'input_boolean', 'automation'];
  /** which history is useful for this entity (null: none — media, camera, weather, stateless entities) */
  function historyKindFor(e) {
    if (!e) return null;
    if (['media_player', 'camera', 'weather', 'scene', 'button', 'input_button', 'script', 'image', 'sun', 'calendar'].includes(e.domain)) return null;
    // climate: the HVAC mode timeline (its temperatures are attributes — not a numeric history HA's recorder serves by entity)
    if (e.domain === 'climate') return 'states';
    return HA().historyKind(e);
  }
  /** an activity entry in plain words, from HA's own state (shared formatter) — never an invented actor */
  function activityText(e, en) {
    const F = HA().format;
    if (typeof en.state === 'string') {
      const low = en.state.toLowerCase();
      if (low === 'unavailable') return 'Became unavailable';
      if (low === 'unknown') return 'Became unknown';
      if (TOGGLES.includes(e.domain) && (low === 'on' || low === 'off')) return low === 'on' ? 'Turned on' : 'Turned off';
      return F.state({ ...e, state: en.state, available: true }).text;
    }
    return en.message ? F.clean(en.message) : '';
  }

  function build({ entity, info = [], label = '' } = {}) {
    const ha = HA();
    const root = h('div', { class: 'iqd', 'data-entity': entity });
    if (!ha || !ha.enabled() || !entity) { root.append(h('p', { class: 'iqd__quiet', text: 'Entity details need Home Assistant on the IniqDash server.' })); return root; }
    const F = ha.format;
    const banner = h('p', { class: 'iqd__banner', role: 'status', hidden: true });
    const head = h('div', { class: 'iqd__head' });
    const media = h('div', { class: 'iqd__media', hidden: true });
    const facts = h('section', { class: 'iqd__sec iqd__facts', hidden: true }, [h('h3', { class: 'iqd__h', text: 'Information' }), h('dl', { class: 'iqd__dl' })]);
    const slotsSec = h('section', { class: 'iqd__sec iqd__slots', hidden: true }, [h('h3', { class: 'iqd__h', text: 'More information' }), h('dl', { class: 'iqd__dl' })]);
    const histSec = h('section', { class: 'iqd__sec iqd__hist', hidden: true });
    const actSec = h('section', { class: 'iqd__sec iqd__act' }, [h('h3', { class: 'iqd__h', text: 'Activity' }), h('ul', { class: 'iqd__list' }), h('p', { class: 'iqd__quiet', text: 'Loading activity…' })]);
    const lazySec = h('section', { class: 'iqd__sec iqd__lazy', hidden: true });        // calendar agenda / weather forecast
    root.append(banner, head, media, facts, slotsSec, histSec, lazySec, actSec);
    let lazyKind = null, fcType = null;

    let e = ha.get(entity), area = null, range = '24h', histKind = null, layer = null, camT = 0, lastImg = '';
    const slots = ha.slots ? ha.slots.of({ info }) : [];
    const unsubs = [];

    /* ---- header, state, information: from the live normalised entity (re-drawn on every change) */
    function renderLive() {
      e = ha.get(entity);
      const known = ha.known ? ha.known(entity) : !!e;
      head.replaceChildren();
      if (!e) {
        head.append(h('p', { class: 'iqd__quiet', text: known ? 'Home Assistant has no entity with this id.' : 'Reading from Home Assistant…' }),
          h('p', { class: 'iqd__id', text: entity }));
        facts.hidden = true; media.hidden = true;
        return;
      }
      const inf = ha.info(e), st = inf.state;
      const pic = (e.domain === 'person' || e.domain === 'image') && e.attrs?.image ? e.attrs.image : null;
      const big = h('div', { class: 'iqd__state' }, h('b', { class: 'iqd__value', text: st.text }));       // the formatted state (unit included)
      const when = [inf.since ? `Since ${inf.since.text}` : '',
        inf.updated && e.updated && e.changed && Math.abs(Date.parse(e.updated) - Date.parse(e.changed)) > 1000 ? `Updated ${inf.updated.text}` : ''].filter(Boolean).join(' · ');
      if (pic) head.append(h('img', { class: 'iqd__pic', src: pic, alt: '' }));     // (never append a placeholder: append(null) writes "null")
      head.append(
        h('div', { class: 'iqd__who' }, [
          big,
          h('p', { class: 'iqd__when', text: when }),
          h('p', { class: 'iqd__id', text: [area, entity].filter(Boolean).join(' · ') }),
        ]));
      // a larger picture: camera snapshot / media artwork (through IniqDash — never HA's address or token)
      const img = e.domain === 'camera' && e.available ? e.attrs?.image : e.domain === 'media_player' ? e.attrs?.artwork : null;
      media.hidden = !img;
      if (img && img !== lastImg) {
        lastImg = img;
        media.replaceChildren(h('img', { class: 'iqd__img', alt: e.domain === 'camera' ? `${e.name} — current picture` : 'Artwork', src: e.domain === 'camera' ? `${img}&t=${Date.now()}` : img }));
      }
      // domain information (Batch 1 normalised items — only what HA reports)
      const dl = facts.querySelector('dl');
      dl.replaceChildren(...inf.items.map((it) => [h('dt', { text: it.label }), h('dd', { 'data-key': it.key }, [
        it.kind === 'color' && Array.isArray(it.value) ? h('i', { class: 'iqd__swatch', style: `background: rgb(${it.value.map((x) => Math.max(0, Math.min(255, Number(x) || 0))).join(',')})` }) : null,
        h('span', { text: it.text }), it.origin === 'derived' ? h('small', { class: 'iqd__derived', text: ' (calculated from Home Assistant values)' }) : null])]).flat());
      facts.hidden = !inf.items.length;
      renderSlots();
      if (histKind === null && historyKindFor(e)) { histKind = historyKindFor(e); setupHistory(); }
      if (lazyKind === null && (e.domain === 'calendar' || e.domain === 'weather')) { lazyKind = e.domain; setupLazy(); }
    }
    /* ---- calendar agenda / weather forecast: the widget's own shared source (IniqHA.calendar / IniqHA.forecast) */
    const hm = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
    function dayName(d) {
      const n = Math.round((dayStart(d) - dayStart(Date.now())) / 86400000);
      return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    }
    const fmtN = (v, unit) => (Number.isFinite(Number(v)) ? `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit ? (unit === '%' ? '%' : ` ${unit}`) : ''}` : '');
    function setupLazy() {
      if (lazyKind === 'calendar') {
        lazySec.replaceChildren(h('h3', { class: 'iqd__h', text: 'Upcoming' }), h('ul', { class: 'iqd__list iqd__agenda' }), h('p', { class: 'iqd__quiet', text: 'Loading events…' }));
        lazySec.hidden = false;
        loadAgenda();
        return;
      }
      const types = ha.forecastTypes(e);
      fcType = types[0] || null;
      const bar = types.length > 1 ? h('div', { class: 'iqd__ranges', role: 'group', 'aria-label': 'Forecast type' }, types.map((t) => h('button', {
        type: 'button', class: 'iqd__range', 'data-type': t, 'aria-pressed': String(t === fcType),
        onclick: () => { fcType = t; bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === t))); loadForecast(); },
      }, h('span', { text: ha.FORECAST_LABEL[t] })))) : null;
      lazySec.replaceChildren(h('div', { class: 'iqd__hrow' }, [h('h3', { class: 'iqd__h', text: types.length === 1 ? `Forecast · ${ha.FORECAST_LABEL[fcType].toLowerCase()}` : 'Forecast' }), bar]),
        h('ul', { class: 'iqd__list iqd__fc' }), h('p', { class: 'iqd__quiet', text: types.length ? 'Loading forecast…' : 'This weather entity reports no forecast.' }));
      lazySec.hidden = false;
      loadForecast();
    }
    function reloadLazy() { if (lazyKind === 'calendar') loadAgenda(); else if (lazyKind === 'weather') loadForecast(); }
    async function loadAgenda() {
      const ul = lazySec.querySelector('ul'), q = lazySec.querySelector('.iqd__quiet');
      const d = await ha.calendar(entity);
      if (!root.isConnected) return;
      if (!d.ok) { ul.replaceChildren(); q.hidden = false; q.textContent = ha.calendarMessage(d); return; }
      const now = Date.now();
      const evs = ha.calendarEvents(d.events)
        .map((x) => (x.allDay && !x.end ? { ...x, end: new Date(dayStart(x.start) + 86400000) } : x))
        .filter((x) => (x.end || x.start).getTime() > now).sort((a, b) => a.start - b.start);
      const rows = [];
      let day = null;
      evs.forEach((x) => {
        const shown = x.start.getTime() < now ? new Date(now) : x.start;     // a running event belongs to today
        if (dayStart(shown) !== day) { day = dayStart(shown); rows.push(h('li', { class: 'iqd__day', text: dayName(shown) })); }
        const last = x.end ? new Date(x.end.getTime() - (x.allDay ? 1 : 0)) : x.start;
        const multi = x.end && dayStart(x.start) !== dayStart(new Date(x.end.getTime() - 1));
        const t = x.allDay ? 'All day' : x.start.getTime() <= now ? 'Now' : hm(x.start);
        const span = x.allDay ? (multi ? `Until ${dayName(last)}` : '')
          : x.end ? (multi ? `${x.start.getTime() <= now ? 'Started' : 'From'} ${F.when(x.start.getTime())} until ${F.when(x.end.getTime())}` : `Until ${hm(x.end)}`) : '';
        rows.push(h('li', { class: 'iqd__entry' }, [h('span', { class: 'iqd__t', text: t }), h('span', { class: 'iqd__what', text: x.title }),
          [span, x.location || ''].filter(Boolean).length ? h('span', { class: 'iqd__cause', text: [span, x.location || ''].filter(Boolean).join(' · ') }) : null]));
      });
      ul.replaceChildren(...rows);
      q.hidden = evs.length > 0 && !d.more;
      q.textContent = !evs.length ? `No events in the next ${d.days || 14} days.` : d.more ? 'More events than can be shown.' : '';
    }
    async function loadForecast() {
      const ul = lazySec.querySelector('ul'), q = lazySec.querySelector('.iqd__quiet');
      if (!fcType) { ul.replaceChildren(); return; }
      const want = fcType;
      const d = await ha.forecast(entity, want);
      if (want !== fcType || !root.isConnected) return;
      const list = ha.forecastEntries(d, want);
      if (!d.ok || !list.length) { ul.replaceChildren(); q.hidden = false; q.textContent = d.ok ? 'No forecast reported.' : ha.forecastMessage(d); return; }
      const u = d.units || {};
      ul.replaceChildren(...list.map((x) => {
        const temp = want === 'hourly' || x.templow === undefined ? fmtN(x.temperature, u.temperature) : `${fmtN(x.temperature, u.temperature)} / ${fmtN(x.templow, u.temperature)}`;
        const wind = x.wind_speed !== undefined ? `Wind ${fmtN(x.wind_speed, u.wind_speed)}${x.wind_bearing !== undefined ? ` ${typeof x.wind_bearing === 'number' ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((x.wind_bearing % 360) + 360) % 360 / 45) % 8] : x.wind_bearing}` : ''}` : '';
        const more = [x.precipitation_probability !== undefined ? `Rain ${fmtN(x.precipitation_probability, '%')}` : '', x.precipitation !== undefined ? fmtN(x.precipitation, u.precipitation) : '',
          wind, x.humidity !== undefined ? `Humidity ${fmtN(x.humidity, '%')}` : ''].filter(Boolean).join(' · ');
        return h('li', { class: 'iqd__entry' }, [h('span', { class: 'iqd__t', text: x.label }),
          h('span', { class: 'iqd__what', text: [x.condition ? F.state({ id: entity, domain: 'weather', state: x.condition, available: true, attrs: {} }).text : '', temp].filter(Boolean).join(' · ') }),
          more ? h('span', { class: 'iqd__cause', text: more }) : null]);
      }));
      q.hidden = true;
    }
    /* ---- Information slots (Batch 2): the same resolver; an unavailable one never makes the entity unavailable */
    function renderSlots() {
      if (!slots.length) { slotsSec.hidden = true; return; }
      const dl = slotsSec.querySelector('dl');
      dl.replaceChildren(...slots.map((sl) => {
        const it = ha.slots.item(sl, ha.get(sl.entity), ha.known ? ha.known(sl.entity) : false);
        const name = sl.label || ha.get(sl.entity)?.name || sl.entity;
        const text = it.state === 'loading' ? 'Reading…' : it.state === 'missing' ? 'Not found' : it.state === 'absent' ? 'Not reported now' : it.text;
        return [h('dt', { text: name }), h('dd', { 'data-slot': sl.id, 'data-state': it.available ? 'ok' : it.state === 'ready' ? 'unavailable' : it.state }, h('span', { text }))];
      }).flat());
      slotsSec.hidden = false;
    }
    /* ---- history (Batch 3 shared history; a period change re-asks only the history) */
    function setupHistory() {
      if (!histKind) return;
      const bar = h('div', { class: 'iqd__ranges', role: 'group', 'aria-label': 'History period' }, RANGES.map(([v, t]) => h('button', {
        type: 'button', class: 'iqd__range', 'data-range': v, 'aria-pressed': String(v === range), onclick: () => { range = v; bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === v))); loadHistory(); loadActivity(); },
      }, h('span', { text: t }))));
      const box = h('div', { class: `iqd__graph iqd__graph--${histKind}` });
      histSec.replaceChildren(h('div', { class: 'iqd__hrow' }, [h('h3', { class: 'iqd__h', text: 'History' }), bar]), box, h('p', { class: 'iqd__sum' }));
      histSec.hidden = false;
      layer = global.IniqWidgetKit.historyLayer(box, { position: 'background' });
      loadHistory();
    }
    async function loadHistory() {
      if (!histKind || !layer) return;
      const sum = histSec.querySelector('.iqd__sum');
      const want = range;
      sum.textContent = 'Loading history…';
      const d = await ha.history(entity, want, histKind);
      if (want !== range || !root.isConnected) return;
      if (!d.ok) {
        if (!layer.has()) layer.clear();
        sum.textContent = d.error === 'not_numeric' ? 'No numeric history for this entity.' : 'History is not available right now.';
        return;
      }
      const cur = ha.get(entity) || e;
      if (histKind === 'states') {
        const segs = ha.timeline(cur, d.segments);
        // distinct states get distinct shades (on / off keep their meaning); the legend says which is which
        const shades = new Map(); const alt = ['state', 'alt1', 'alt2', 'alt3'];
        segs.forEach((x) => { if (x.tone === 'state' && !shades.has(x.word)) shades.set(x.word, alt[shades.size % alt.length]); });
        const segs2 = segs.map((x) => (x.tone === 'state' ? { ...x, tone: shades.get(x.word) } : x));
        const drawn = segs2.filter((x) => x.tone !== 'gap');
        layer.set(drawn.length ? { style: 'timeline', segments: segs2, start: d.from ?? d.start, end: d.end } : { style: 'timeline', empty: true });
        const words = [...new Map(drawn.map((x) => [x.word, x.tone])).entries()];
        sum.replaceChildren(...(drawn.length ? [h('span', { text: `${RANGE_TEXT[want]} · ${d.changes} change${d.changes === 1 ? '' : 's'}${d.truncated ? ' (most recent shown)' : ''}` }),
          // a legend for the first few states (an entity with many different states would otherwise list them all)
          ...words.slice(0, 6).map(([w, tone]) => h('span', { class: 'iqd__key' }, [h('i', { class: `iqd__dot iq-hist__seg--${tone}` }), h('span', { text: w })])),
          ...(words.length > 6 ? [h('span', { class: 'iqd__key', text: `+${words.length - 6} more` })] : [])]
          : [h('span', { text: `No history in this period (${RANGE_TEXT[want].toLowerCase()}).` })]));
      } else {
        const pts = (d.points || []).map((q) => [q[0], q[1]]);
        const has = pts.some((q) => q[1] !== null);
        layer.set(has ? { style: 'area', points: pts, start: d.start, end: d.end, step: d.step } : { style: 'area', empty: true });
        // min / max: what the server found in the returned history (never calculated from anything else)
        const n = (v) => F.state({ ...cur, state: String(v), available: true }).text;      // the same number formatting as the value
        sum.textContent = has ? `${RANGE_TEXT[want]} · min ${n(d.min)} · max ${n(d.max)}` : `No history in this period (${RANGE_TEXT[want].toLowerCase()}).`;
      }
    }
    /* ---- activity (read-only logbook) — optional: a failure never breaks Details */
    async function loadActivity() {
      const ul = actSec.querySelector('ul'), q = actSec.querySelector('.iqd__quiet');
      const want = range;
      q.hidden = false; q.textContent = 'Loading activity…';
      const d = await ha.logbook(entity, want);
      if (want !== range || !root.isConnected) return;
      const cur = ha.get(entity) || e || { domain: entity.split('.')[0], attrs: {} };
      if (!d.ok) { ul.replaceChildren(); q.textContent = 'Activity is not available right now.'; return; }
      const rows = (d.entries || []).map((en) => {
        const text = activityText(cur, en);
        if (!text) return null;
        const cause = en.cause && en.cause.name ? `${en.cause.kind === 'script' ? 'by script' : 'by automation'} “${en.cause.name}”` : '';
        return h('li', { class: 'iqd__entry' }, [h('time', { class: 'iqd__t', datetime: new Date(en.t).toISOString(), text: F.when(en.t) }),
          h('span', { class: 'iqd__what', text }), cause ? h('span', { class: 'iqd__cause', text: cause }) : null]);
      }).filter(Boolean);
      ul.replaceChildren(...rows);
      q.hidden = rows.length > 0;
      q.textContent = rows.length ? '' : `No activity in this period (${RANGE_TEXT[want].toLowerCase()}).`;
    }
    /* ---- Home Assistant reachable? (the shared status; already drawn history stays) */
    const LOST = { ha_unavailable: 'Home Assistant is unreachable — showing the last known information.', offline: 'The IniqDash server is unreachable — showing the last known information.', not_configured: 'Home Assistant is not configured.' };
    function renderStatus(st) { const t = LOST[st.state] || ''; banner.textContent = t; banner.hidden = !t; }

    unsubs.push(ha.subscribe(entity, () => renderLive()));
    slots.forEach((sl) => unsubs.push(ha.subscribe(sl.entity, () => renderSlots())));     // already in the shared poll (the widget's)
    unsubs.push(ha.onStatus(renderStatus));
    renderStatus(ha.status());
    renderLive();
    loadActivity();
    ha.entities().then((list) => { const x = (list || []).find((y) => y.id === entity); if (x && x.area) { area = x.area; renderLive(); } }).catch(() => {});
    // a camera picture refreshes while Details is open (through IniqDash, one at a time)
    camT = setInterval(() => {
      const cur = ha.get(entity);
      if (cur && cur.domain === 'camera' && cur.available && ha.status().state === 'connected' && !document.hidden) { const im = media.querySelector('img'); if (im) im.src = `${cur.attrs.image}&t=${Date.now()}`; }
    }, 10000);
    // the surface has no explicit end: when it leaves the page, everything stops
    let seen = false;
    let beat = 0;
    const born = Date.now();
    const watch = setInterval(() => {
      // an open agenda / forecast re-reads the shared answer once a minute (the cache decides whether HA is asked)
      if (root.isConnected) { seen = true; if (lazyKind && ++beat % 40 === 0 && !document.hidden) reloadLazy(); return; }
      if (!seen && Date.now() - born < 5000) return;      // not attached yet — but one that was closed before the first look must not run forever
      clearInterval(watch); clearInterval(camT); unsubs.forEach((u) => { try { u(); } catch (x) { /* already gone */ } });
      if (layer) layer.destroy();
    }, 1500);
    root.details = { entity, range: () => range, reload: () => { loadHistory(); loadActivity(); reloadLazy(); } };
    return root;
  }

  global.IniqHADetails = { build, historyKindFor, activityText };
})(window);
