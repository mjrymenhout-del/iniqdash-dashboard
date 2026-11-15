/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqHA — the ONE Home Assistant layer in the browser. Widgets never talk to Home Assistant:

     Home Assistant ⇄ IniqDash server (server/ha, token stays there) ⇄ IniqHA ⇄ bindings ⇄ widgets

   It never sees a Home Assistant token or URL: it only calls IniqDash's own signed-in endpoints
   (api/ha_*.php) with the session cookie, and sends the page's CSRF token with actions.

   IniqHA.enabled()               true when the page is served by the IniqDash server (signed in);
                                  false for local demo files → every widget keeps its demo data
   IniqHA.status()                { state, error, version, temperatureUnit }
                                    state: 'demo' | 'connecting' | 'connected' | 'ha_unavailable'
                                         | 'offline' | 'not_configured' | 'signed_out'
   IniqHA.onStatus(cb)            → unsubscribe; cb(status)
   IniqHA.entities({ fresh })     → Promise<[{ id, domain, name, state, unit, dc, area, areaId }]> (discovery)
   IniqHA.areas({ fresh })        → Promise<[{ id, name }]> Home Assistant's areas (same answer as entities())
   IniqHA.areaEntities(area, domains) → Promise<[entity id…]> the entities HA places in an area (own or device area)
   IniqHA.related(id)             → Promise<[entity id…]> on the same HA device (suggestions only)
   IniqHA.inspect(id)             → Promise<{ ok, error, entity }> the COMPLETE current state + attributes of one entity
                                  (on demand, for the configuration inspector; see components/ha/inspector.js)
   IniqHA.search(list, text, domains) → filtered list (words match name, entity id, area, domain)
   IniqHA.get(id)                 last known normalised entity (or null)
   IniqHA.known(id)               HA has answered for it (get() null then means: no such entity)
   IniqHA.subscribe(id, cb)       → unsubscribe; cb(entity|null) now (if known) and on every change
   IniqHA.call(id, action, value) → Promise<{ ok, error? }>   e.g. ('light.x', 'toggle')
   IniqHA.history(id, range, kind) → Promise<{ ok, error, … }>   history from HA's recorder (range: 1h 6h 12h 24h 7d)
                                  kind 'numeric': { points: [[ms, mean, min, max]…], min, max, … }
                                  kind 'states':  { segments: [[ms, state]…], from, truncated, … }
                                  NOT part of the state poll: asked once, reused until its refresh time (shared by every
                                  widget), and requests within 60 ms are sent as ONE batch (one HA recorder request).
   IniqHA.calendar(id[, {from,days}]) → Promise<{ ok, error, events: [{ title, start, end, allDay, location? }…], … }>  upcoming events
   IniqHA.forecast(id, type)      → Promise<{ ok, error, type, supported, units, forecast: [{ t, … }…], … }>  (daily · hourly · twice_daily)
   IniqHA.peek('calendar' | 'forecast' | 'todo', id[, type]) → the last answer received (or null) — synchronous, never fetches
                                  Calendar events and forecasts are NOT part of the state poll either: asked lazily (a widget on
                                  screen, Entity Details open), ONE answer per entity (+ type) shared by widget and Details,
                                  reused until the server's refresh time (failures retried after 20 s).

   Live updates: the same method Maison uses with the real installation — the page asks the
   server for the states of the entities on screen (one request, one HA call) every 2 s while
   visible (10 s hidden), every 0.4 s for a few seconds after an action, and backs off to 15 s
   while Home Assistant or the server is unreachable. A change made anywhere (HA UI, automation,
   physical switch, another client) reaches the widget on the next poll.

   SIMULATED HOME: IniqHA.setSimulated(true) (a dashboard marked app.simulated) sends "X-IniqDash-Simulated: 1" with every request;
   the server then answers from its fictional home (server/ha/SimHa.php) and never contacts the configured Home Assistant.
   Switching clears every cache, so live and simulated entities are never mixed. IniqHA.simulated() → the current mode.

   Normalised entity (from the server): { id, domain, name, state, available, unit, changed,
     attrs: { …domain-specific }, caps: { …what it can do } }
   ========================================================================== */
(function (global) {
  'use strict';

  const API = { status: 'api/ha_status.php', entities: 'api/ha_entities.php', states: 'api/ha_states.php', call: 'api/ha_call.php', history: 'api/ha_history.php', statistics: 'api/ha_statistics.php' };
  const stats = new Map();          // 'ids|period' → { at, ttl, promise }  (long-term statistics answers)
  const histQ = new Map();           // 'range|kind' → { range, kind, waiters: Map<id, resolve[]> }  (the batching window)
  /** send one batch: every entity asked for within the window, one request (the server makes one HA call for the misses) */
  async function flushHistory(bk) {
    const b = histQ.get(bk);
    histQ.delete(bk);
    if (!b) return;
    const ids = [...b.waiters.keys()];
    const answer = (id, d) => (b.waiters.get(id) || []).forEach((r) => r(d));
    for (let i = 0; i < ids.length; i += 40) {                       // the server takes 40 per request
      const part = ids.slice(i, i + 40);
      let data = null, signed = false;
      try {
        const r = await getJson(`${API.history}?entities=${encodeURIComponent(part.join(','))}&range=${encodeURIComponent(b.range)}&kind=${encodeURIComponent(b.kind)}`);
        signed = !!r.signedOut; data = r.data;
      } catch (e) { data = null; }
      if (signed) { signedOut(); part.forEach((id) => answer(id, { ok: false, error: 'signed_out', points: [], segments: [] })); continue; }
      part.forEach((id) => {
        const one = data && data.results && data.results[id];
        if (!data) return answer(id, { ok: false, error: 'server_unreachable', points: [], segments: [] });
        if (data.configured === false) return answer(id, { ok: false, error: 'not_configured', points: [], segments: [] });
        if (!one) return answer(id, { ok: false, error: data.error || 'unreachable', points: [], segments: [] });
        answer(id, { ok: one.error === null || one.error === undefined, ...one });
      });
    }
  }
  const logs = new Map();            // 'id|range' → { at, promise }  activity (Entity Details)
  const lazy = new Map();            // 'kind|id|type' → { at, ttl, promise, data }  calendar events / forecasts (widget + Details)
  /** ONE lazily fetched, shared answer per key (calendar events, forecasts): reused within its refresh window */
  function lazyGet(key, url) {
    const now = Date.now(), c = lazy.get(key);
    if (c && now - c.at < c.ttl) return c.promise;
    const promise = getJson(url)
      .then((r) => {
        if (r.signedOut) { signedOut(); return { ok: false, error: 'signed_out' }; }
        const d = r.data;
        if (!d) return { ok: false, error: `http_${r.status}` };
        if (d.configured === false) return { ok: false, error: 'not_configured' };
        return { ...d, ok: !!d.ok };
      })
      .catch(() => ({ ok: false, error: 'server_unreachable' }))
      .then((d) => {
        lazy.set(key, { at: Date.now(), ttl: d.ok ? Math.max(30, Number(d.refresh) || 300) * 1000 : 20000, promise: Promise.resolve(d), data: d });
        return d;
      });
    lazy.set(key, { at: now, ttl: 20000, promise, data: c ? c.data : null });
    return promise;
  }
  const rel = new Map();             // id → { at, list }  same-device suggestions (Information picker)
  const hist = new Map();            // 'id|range' → { at, ttl, promise }  (history is fetched rarely, and shared)
  const T = { visible: 2000, hidden: 10000, fast: 400, fastFor: 4000, maxBackoff: 15000, timeout: 8000, pendingFor: 6000, histBatch: 60 };

  const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content || '';
  const enabled = () => meta('iniqdash-server') === '1';

  let status = { state: enabled() ? 'connecting' : 'demo', error: null, version: null, temperatureUnit: null };
  const statusSubs = new Set();
  const subs = new Map();            // id → Set<cb>
  const cache = new Map();           // id → entity|null
  const pending = new Map();         // id → { expect, until }  (an action waiting for HA to confirm)
  let timer = 0, inFlight = false, failures = 0, fastUntil = 0, started = false, list = null, listAt = 0, areaList = [];
  let simulated = false;            // the simulated home (a dashboard marked app.simulated) — see the header comment

  function setStatus(patch) {
    const next = { ...status, ...patch };
    if (next.state === status.state && next.error === status.error && next.version === status.version && next.temperatureUnit === status.temperatureUnit) return;
    status = next;
    statusSubs.forEach((cb) => { try { cb(status); } catch (e) { console.error(e); } });
  }

  async function getJson(url, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), T.timeout);
    try {
      const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}), ...(simulated ? { 'X-IniqDash-Simulated': '1' } : {}) }, signal: ctrl.signal });
      if (res.status === 401) return { signedOut: true };
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    } finally { clearTimeout(t); }
  }

  /* ---------------- polling ---------------- */
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(poll, ms); }
  function nextDelay() {
    if (failures) return Math.min(T.maxBackoff, T.visible * 2 ** (failures - 1));
    if (Date.now() < fastUntil || pending.size) return T.fast;
    return document.hidden ? T.hidden : T.visible;
  }
  async function poll() {
    if (!enabled() || inFlight) return;
    const ids = [...subs.keys()];
    inFlight = true;
    try {
      if (status.state === 'connecting' || status.version === null) await refreshStatus();
      if (!ids.length) return;
      const r = await getJson(`${API.states}?ids=${encodeURIComponent(ids.join(','))}`);
      if (r.signedOut) return signedOut();
      const d = r.data;
      if (!d || !d.ok) throw new Error('server');
      if (!d.configured) { failures = 0; setStatus({ state: 'not_configured', error: 'not_configured' }); return; }
      if (!d.connected) { failures++; setStatus({ state: 'ha_unavailable', error: d.error || 'unreachable' }); return; }
      failures = 0;
      setStatus({ state: 'connected', error: null });
      Object.entries(d.states || {}).forEach(([id, e]) => receive(id, e));
    } catch (e) {
      failures++;
      setStatus({ state: 'offline', error: 'server_unreachable' });
    } finally {
      inFlight = false;
      if (status.state !== 'signed_out') schedule(nextDelay());
    }
  }
  async function refreshStatus() {
    const r = await getJson(API.status);
    if (r.signedOut) return signedOut();
    const d = r.data;
    if (!d || !d.ok) throw new Error('server');
    if (!d.configured) return setStatus({ state: 'not_configured', error: 'not_configured' });
    setStatus({ state: d.connected ? 'connected' : 'ha_unavailable', error: d.error || null, version: d.version || null, temperatureUnit: d.temperature_unit || null });
  }
  function signedOut() {
    setStatus({ state: 'signed_out', error: 'signed_out' });
    clearTimeout(timer);
    // the session ended (expired or signed out elsewhere): back to the sign-in page, then here
    const here = location.pathname.split('/').pop() || 'index.html';
    location.href = `login.php?expired=1&next=${encodeURIComponent(here)}`;
  }

  /** a new state from HA. Right after an action, an answer in which HA has not moved yet is
      skipped (the widget keeps showing what was asked); anything new — the confirmation, or a
      change made elsewhere meanwhile — is shown at once. */
  const sigOf = (e) => (e ? JSON.stringify([e.state, e.changed, e.attrs]) : 'null');   // HA's last_changed tells "not moved yet" from "moved and moved back"
  function receive(id, e) {
    const p = pending.get(id);
    if (p) {
      const confirmed = e && Object.entries(p.expect).every(([k, v]) => (k in e ? e[k] : e.attrs?.[k]) === v);
      if (!confirmed && sigOf(e) === p.before && Date.now() < p.until) return;
      pending.delete(id);
    }
    const before = cache.get(id);
    cache.set(id, e);
    if (JSON.stringify(before) === JSON.stringify(e)) return;
    (subs.get(id) || []).forEach((cb) => { try { cb(e); } catch (err) { console.error(err); } });
  }

  function start() {
    if (started || !enabled()) return;
    started = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(0); });
    global.addEventListener('online', () => schedule(0));
    schedule(0);
  }

  /* ---------------- public ---------------- */
  const IniqHA = {
    enabled,
    simulated: () => simulated,
    /** answer from the server's simulated home (true) or the configured Home Assistant (false); a change drops everything known */
    setSimulated(on) {
      on = !!on;
      if (on === simulated) return;
      simulated = on;
      cache.clear(); pending.clear(); lazy.clear(); hist.clear(); stats.clear(); rel.clear(); list = null; listAt = 0; areaList = []; failures = 0;
      setStatus({ state: enabled() ? 'connecting' : 'demo', error: null, version: null });
      if (started) schedule(0);
    },
    status: () => ({ ...status }),
    onStatus(cb) { statusSubs.add(cb); return () => statusSubs.delete(cb); },
    get: (id) => cache.get(id) ?? null,
    /** true once Home Assistant has answered for this entity (get() then returns it — or null: no such entity) */
    known: (id) => cache.has(id),

    subscribe(id, cb) {
      if (!enabled() || !id) return () => {};
      if (!subs.has(id)) { subs.set(id, new Set()); schedule(started ? 50 : 0); }
      subs.get(id).add(cb);
      if (cache.has(id)) { try { cb(cache.get(id)); } catch (e) { console.error(e); } }
      start();
      return () => {
        const s = subs.get(id); if (!s) return;
        s.delete(cb);
        if (!s.size) { subs.delete(id); cache.delete(id); pending.delete(id); }
      };
    },

    /** @param code  a lock / alarm code for THIS action only — sent once, never kept
        @param via   the custom widget package making the request (action channel): the server checks its declaration */
    async call(id, action, value, code, via) {
      if (!enabled()) return { ok: false, error: 'demo' };
      try {
        const r = await getJson(API.call, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': meta('iniqdash-csrf') },
          body: JSON.stringify(via ? { entity: id, action, widget: via } : code ? { entity: id, action, value, code } : { entity: id, action, value }),
        });
        if (r.signedOut) { signedOut(); return { ok: false, error: 'signed_out' }; }
        const d = r.data || {};
        if (!d.ok) { fastUntil = Date.now() + T.fastFor; schedule(0); return { ok: false, error: d.error || `http_${r.status}` }; }
        if (d.expect && Object.keys(d.expect).length) pending.set(id, { expect: d.expect, before: sigOf(cache.get(id)), until: Date.now() + T.pendingFor });
        fastUntil = Date.now() + T.fastFor;
        schedule(T.fast);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: 'server_unreachable' };
      }
    },

    /** ONE shared history path (Chart, Sensor inline history, later Entity Details): per entity + range + kind one answer,
        shared by every widget that asks and reused until the server's refresh time; requests made within a short window are
        sent together (one browser request → one Home Assistant recorder request for all the entities not cached).
        kind: 'numeric' (time buckets) | 'states' (a state timeline). */
    history(id, range = '24h', kind = 'numeric') {
      if (!enabled()) return Promise.resolve({ ok: false, error: 'demo', points: [], segments: [] });
      const key = `${id}|${range}|${kind}`, now = Date.now(), c = hist.get(key);
      // valid within the same clock window of its refresh time (windows are aligned to the clock, like the server cache and
      // the widgets' refresh ticks, so one refresh moment = one batch, and an answer is never reused past its window)
      if (c && Math.floor(now / c.ttl) === Math.floor(c.at / c.ttl)) return c.promise;
      const promise = new Promise((resolve) => {
        const bk = `${range}|${kind}`;
        let b = histQ.get(bk);
        if (!b) { b = { range, kind, waiters: new Map() }; histQ.set(bk, b); setTimeout(() => flushHistory(bk), T.histBatch); }
        if (!b.waiters.has(id)) b.waiters.set(id, []);
        b.waiters.get(id).push(resolve);
      }).then((d) => {
        // a failure is retried sooner than a good answer is refreshed
        hist.set(key, { at: Date.now(), ttl: d.ok ? Math.max(30, Number(d.refresh) || 60) * 1000 : 20000, promise: Promise.resolve(d) });
        return d;
      });
      hist.set(key, { at: now, ttl: 20000, promise });
      return promise;
    },

    /** Home Assistant's LONG-TERM STATISTICS for up to 10 entities (period: hour · day · week · month · year) — one request, the answer
        shared until the server's refresh time. → { ok, error, start, end, refresh, results: { <id>: { error, unit, hasSum, hasMean, points } } } */
    statistics(ids, period = 'day') {
      if (!enabled()) return Promise.resolve({ ok: false, error: 'demo', results: {} });
      const list = [...new Set((ids || []).filter((x) => typeof x === 'string' && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(x)))].slice(0, 10);
      if (!list.length) return Promise.resolve({ ok: false, error: 'bad_entity', results: {} });
      const key = `${list.join(',')}|${period}`, now = Date.now(), c = stats.get(key);
      if (c && now - c.at < c.ttl) return c.promise;
      const promise = getJson(`${API.statistics}?entities=${encodeURIComponent(list.join(','))}&period=${encodeURIComponent(period)}`).then((r) => {
        if (r.signedOut) { signedOut(); return { ok: false, error: 'signed_out', results: {} }; }
        const d = r.data || { ok: false, error: 'server_unreachable', results: {} };
        stats.set(key, { at: Date.now(), ttl: d.ok ? Math.max(60, Number(d.refresh) || 300) * 1000 : 20000, promise: Promise.resolve(d) });
        return d;
      }).catch(() => ({ ok: false, error: 'server_unreachable', results: {} }));
      stats.set(key, { at: now, ttl: 20000, promise });
      return promise;
    },

    async entities({ fresh = false } = {}) {
      if (!enabled()) return [];
      if (list && !fresh && Date.now() - listAt < 30000) return list;
      const r = await getJson(`${API.entities}${fresh ? '?fresh=1' : ''}`);
      if (r.signedOut) { signedOut(); return []; }
      const d = r.data;
      if (!d || !d.ok) throw new Error('server_unreachable');
      if (!d.configured) { setStatus({ state: 'not_configured', error: 'not_configured' }); return []; }
      if (!d.connected) { setStatus({ state: 'ha_unavailable', error: d.error }); throw new Error(d.error || 'unreachable'); }
      list = d.entities || []; listAt = Date.now();
      areaList = Array.isArray(d.areas) ? d.areas.filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string') : [];
      return list;
    },
    /** Home Assistant's AREAS ({ id, name }, by name) — from the SAME discovery answer as entities() (one request, same cache). An entity's
        area (entities()[i].areaId) is the one HA resolves: its own, or its device's. [] when HA cannot tell (or without the server). */
    async areas({ fresh = false } = {}) {
      if (!enabled()) return [];
      await IniqHA.entities({ fresh });
      return areaList;
    },
    /** AREA ENTITIES (generic): the entity ids HA places in an area — the entity's own area or its device's, as the discovery answer
        resolved it (HaService::areaOf; never a name) — optionally only of some domains. areaEntitiesNow: synchronous, null until the
        discovery answer is known; areaEntities: loads it first ([] when HA cannot tell). */
    areaEntitiesNow: (areaId, domains = null) => (list && areaId ? list.filter((e) => e.areaId === areaId && (!domains || domains.includes(e.domain))).map((e) => e.id) : null),
    async areaEntities(areaId, domains = null) {
      if (!enabled() || !areaId) return [];
      try { await IniqHA.entities(); } catch (e) { return []; }
      return IniqHA.areaEntitiesNow(areaId, domains) || [];
    },
    /** the name HA gives an area id (from the last discovery answer), or null */
    areaName: (id) => (areaList.find((a) => a.id === id) || {}).name || null,

    /** read-only activity of ONE entity (HA logbook, through IniqDash) for Entity Details: { ok, entries: [{ t, state?,
        message?, cause? }…] } — cause only when HA names an automation / script; never a user. Cached 30 s per entity + range. */
    async logbook(id, range = '24h') {
      if (!enabled() || !id) return { ok: false, error: 'demo', entries: [] };
      const key = `${id}|${range}`, c = logs.get(key);
      if (c && Date.now() - c.at < 30000) return c.promise;
      const promise = getJson(`api/ha_logbook.php?entity=${encodeURIComponent(id)}&range=${encodeURIComponent(range)}`)
        .then((r) => (r.signedOut ? { ok: false, error: 'signed_out', entries: [] } : (r.data || { ok: false, error: `http_${r.status}`, entries: [] })))
        .catch(() => ({ ok: false, error: 'server_unreachable', entries: [] }))
        .then((d) => { if (!d.ok) logs.set(key, { at: Date.now() - 20000, promise: Promise.resolve(d) }); return d; });
      logs.set(key, { at: Date.now(), promise });
      return promise;
    },

    /** upcoming events of a calendar.* entity (api/ha_calendar.php — read-only; never part of the state poll) */
    calendar(id, win) {
      if (!enabled() || !id) return Promise.resolve({ ok: false, error: 'demo', events: [] });
      // win = { from: 'YYYY-MM-DD', days: 1–62 } (a week / month view, date navigation): its own cached answer
      const w = win && /^\d{4}-\d{2}-\d{2}$/.test(win.from) && win.days >= 1 && win.days <= 62 ? `${win.from}/${Math.round(win.days)}` : '';
      return lazyGet(`calendar|${id}|${w}`, `api/ha_calendar.php?entity=${encodeURIComponent(id)}${w ? `&from=${win.from}&days=${Math.round(win.days)}` : ''}`);
    },
    /** the items of a todo.* list (api/ha_todo.php → todo.get_items; never part of the state poll). fresh: drop the cached answer first
        (the list's state — its count of open items — changed, or an item was just added / ticked) */
    todo(id, fresh) {
      if (!enabled() || !id) return Promise.resolve({ ok: false, error: 'demo', items: [] });
      if (fresh) { const c = lazy.get(`todo|${id}|`); if (c && c.data) lazy.set(`todo|${id}|`, { ...c, at: 0, ttl: 0 }); else lazy.delete(`todo|${id}|`); }
      return lazyGet(`todo|${id}|`, `api/ha_todo.php?entity=${encodeURIComponent(id)}`);
    },
    /** the forecast of a weather.* entity (api/ha_forecast.php → weather.get_forecasts; never part of the state poll).
        A type the entity does not support answers { ok: false, error: 'type_not_supported' } — nothing is substituted. */
    forecast(id, type = 'daily') {
      if (!enabled() || !id) return Promise.resolve({ ok: false, error: 'demo', forecast: [] });
      return lazyGet(`forecast|${id}|${type}`, `api/ha_forecast.php?entity=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`);
    },
    /** the last calendar / forecast answer received for this key (null: none yet) — never fetches */
    peek(kind, id, type = '') { return lazy.get(`${kind}|${id}|${type}`)?.data ?? null; },

    /** entity ids on the SAME Home Assistant device as id (for a person: its tracker's device) — suggestions for the
        Information picker only, never a role. Cached for a minute; [] when HA cannot tell. */
    async related(id) {
      if (!enabled() || !id) return [];
      const c = rel.get(id);
      if (c && Date.now() - c.at < 60000) return c.list;
      try {
        const r = await getJson(`api/ha_related.php?entity=${encodeURIComponent(id)}`);
        const list = r.data && r.data.ok && Array.isArray(r.data.entities) ? r.data.entities.filter((x) => typeof x === 'string') : [];
        rel.set(id, { at: Date.now(), list });
        return list;
      } catch (e) { return []; }
    },

    /** the COMPLETE current Home Assistant state of ONE entity (every attribute HA reports, credentials withheld by the server)
        — for the configuration inspector only. On demand, never cached, never part of the state poll, never stored.
        → { ok, error, entity: null | { id, domain, state, last_changed, last_updated, attributes: [[name, value]…], count,
            redacted: [name…], truncated }, at }   ok + entity null = HA has no entity with this id */
    async inspect(id) {
      if (!enabled() || !id) return { ok: false, error: 'demo', entity: null };
      try {
        const r = await getJson(`api/ha_entity.php?entity=${encodeURIComponent(id)}`);
        if (r.signedOut) { signedOut(); return { ok: false, error: 'signed_out', entity: null }; }
        const d = r.data;
        if (!d || !d.ok) return { ok: false, error: 'server', entity: null };
        if (d.configured === false) return { ok: false, error: 'not_configured', entity: null };
        if (!d.connected || d.error) return { ok: false, error: d.error || 'unreachable', entity: null };
        return { ok: true, error: null, entity: d.entity && typeof d.entity === 'object' ? d.entity : null, at: d.at || null };
      } catch (e) { return { ok: false, error: 'offline', entity: null }; }
    },

    /** practical search: every word must appear in the name, entity id, area or domain */
    search(entities, text, domains) {
      const words = String(text || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
      return entities.filter((e) => {
        if (domains && domains.length && !domains.includes(e.domain)) return false;
        const hay = `${e.name} ${e.id} ${e.area || ''} ${e.domain} ${e.id.replace(/[._]/g, ' ')}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    },

    _debug: () => ({ subs: [...subs.keys()], pending: [...pending.keys()], failures, status }),
  };

  global.IniqHA = IniqHA;
})(window);
