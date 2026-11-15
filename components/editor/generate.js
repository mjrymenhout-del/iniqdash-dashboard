/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   GENERATE A DASHBOARD FROM HOME ASSISTANT'S AREAS (window.IniqGenerate) — pure functions, no requests.

   Input: what the server discovered (api/ha_entities.php: entities [{ id, domain, name, state, unit, dc, area, areaId }] and areas
   [{ id, name }] — an entity's area is Home Assistant's own: its own area, else its device's; never guessed from a name).
   Output: an ordinary dashboard (version 3) made of STANDARD widgets — fully editable afterwards like any other:
     · Home: who is home (person.*), the weather (weather.*), and a tile per room that opens the room's page
     · a page per chosen area: its thermostats, lights, switches / fans, covers, locks, media players, cameras, robots, the alarm, and its
       sensors in lists (temperature and humidity also as readings)
     · optionally "Other": what has NO area (only when asked — an entity without an area is never put in a room)
   Only entities that exist are used; nothing is invented. Layout: the standard grid (12 / 8 / 4 columns), rows filled left to right.
   ========================================================================== */
(function (global) {
  'use strict';

  /** which widget each kind of entity becomes, in the order a room page lists them */
  const KINDS = [
    { k: 'climate', domains: ['climate'], type: 'climate', variant: 'dial' },
    { k: 'alarm', domains: ['alarm_control_panel'], type: 'alarm', variant: 'compact', size: { w: 4, h: 3 } },
    { k: 'light', domains: ['light'], type: 'light', variant: 'compact', size: { w: 3, h: 3 } },
    { k: 'tile', domains: ['switch', 'input_boolean', 'fan'], type: 'devicetile' },
    { k: 'cover', domains: ['cover'], type: 'cover' },
    { k: 'lock', domains: ['lock'], type: 'lock' },
    { k: 'media', domains: ['media_player'], type: 'media' },
    { k: 'robot', domains: ['vacuum', 'lawn_mower'], type: 'robot' },
    { k: 'camera', domains: ['camera'], type: 'camera' },
  ];
  const BY_DOMAIN = Object.fromEntries(KINDS.flatMap((x) => x.domains.map((d) => [d, x])));
  /** sensors worth showing in a room (device classes), and the binary sensors */
  const SENSOR_DC = ['temperature', 'humidity', 'illuminance', 'carbon_dioxide', 'pm25', 'power', 'energy', 'battery', 'pressure', 'moisture', 'volatile_organic_compounds'];
  const BINARY_DC = ['door', 'window', 'garage_door', 'opening', 'motion', 'occupancy', 'presence', 'moisture', 'smoke', 'gas', 'carbon_monoxide', 'lock', 'vibration'];
  const COLS = { desktop: 12, tablet: 8, mobile: 4 };
  const MAX_PER_PAGE = 60;

  const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'room';
  /** "Kitchen Ceiling light" in the area "Kitchen" → "Ceiling light" (a name that only repeats the room keeps it) */
  const shortName = (name, room) => {
    const n = String(name || '').trim(), r = String(room || '').trim();
    if (r && n.toLowerCase().startsWith(r.toLowerCase() + ' ') && n.length > r.length + 1) { const t = n.slice(r.length + 1).trim(); return t.charAt(0).toUpperCase() + t.slice(1); }
    return n;
  };
  const ROOM_ICON = [[/kitchen|keuken|cuisine/i, 'mdi:silverware-fork-knife'], [/bed|slaap|chambre/i, 'mdi:bed-outline'], [/bath|badkamer|salle de bain|toilet|wc/i, 'mdi:shower'],
    [/living|lounge|woon|salon|séjour/i, 'mdi:sofa-outline'], [/office|study|bureau|kantoor/i, 'mdi:desk'], [/garden|tuin|jardin|outside|outdoor|terrace|patio/i, 'mdi:flower-outline'],
    [/garage/i, 'mdi:garage'], [/hall|entrance|gang|entrée/i, 'mdi:door'], [/dining|eet/i, 'mdi:table-chair'], [/kid|child|nursery|kinder/i, 'mdi:teddy-bear'], [/laundry|wash|utility|bijkeuken/i, 'mdi:washing-machine']];
  const iconOf = (name) => (ROOM_ICON.find(([re]) => re.test(name)) || [null, 'mdi:home-outline'])[1];
  /** the dock icon of a room's page (the registry's page icons only) */
  const PAGE_ICON = [[/kitchen|keuken|cuisine/i, 'pot'], [/bed|slaap|chambre/i, 'moon'], [/bath|badkamer|toilet|wc/i, 'drop'], [/living|lounge|woon|salon/i, 'sofa'],
    [/garden|tuin|jardin|outside|outdoor|terrace|patio/i, 'sun'], [/garage/i, 'garage'], [/hall|entrance|gang|entrée/i, 'door']];
  const pageIcon = (R, name) => { const k = (PAGE_ICON.find(([re]) => re.test(name)) || [null, 'home'])[1]; const known = R && R.pageIcons ? R.pageIcons() : []; return known.includes(k) ? k : undefined; };
  const COLORS = ['orange', 'blue', 'green', 'purple', 'pink', 'yellow'];

  /** the supported entities grouped by area id (null: no area) */
  function byArea(entities) {
    const out = new Map();
    (entities || []).forEach((e) => {
      if (!e || typeof e.id !== 'string') return;
      const ok = BY_DOMAIN[e.domain] || (e.domain === 'sensor' && SENSOR_DC.includes(e.dc)) || (e.domain === 'binary_sensor' && BINARY_DC.includes(e.dc));
      if (!ok || e.state === 'unavailable' && e.domain !== 'camera') return;
      const k = e.areaId || null;
      if (!out.has(k)) out.set(k, []);
      out.get(k).push(e);
    });
    return out;
  }

  /** a page's widgets laid out row by row: [{ type, config, size: { w, h }, mobileW? }] → items with layouts */
  function packPage(pageId, widgets) {
    const cursor = { desktop: { x: 1, y: 1, rowH: 0 }, tablet: { x: 1, y: 1, rowH: 0 } };
    return widgets.map((wd, i) => {
      const layout = {};
      ['desktop', 'tablet'].forEach((bp) => {
        const C = COLS[bp], c = cursor[bp];
        const w = Math.min(C, bp === 'tablet' ? Math.min(C, Math.max(2, Math.round(wd.size.w * (wd.full ? 2 : 1.33)))) : wd.full ? C : wd.size.w);
        if (wd.full || c.x + w - 1 > C) { if (c.x > 1) { c.y += c.rowH; c.x = 1; c.rowH = 0; } }
        layout[bp] = { x: c.x, y: c.y, w, h: wd.size.h };
        c.x += w; c.rowH = Math.max(c.rowH, wd.size.h);
        if (wd.full) { c.y += c.rowH; c.x = 1; c.rowH = 0; }
      });
      layout.mobile = { w: wd.mobileW || 4, h: wd.size.h };
      return { id: `${pageId}-${i + 1}`, type: wd.type, config: wd.config, layout };
    });
  }


  /** the widgets of ONE area's page (its entities, in a sensible order) */
  function roomWidgets(area, list) {
    const out = [];   // the page shows its own name as its title
    const sorted = list.slice().sort((a, b) => a.name.localeCompare(b.name));
    KINDS.forEach((K) => sorted.filter((e) => K.domains.includes(e.domain)).forEach((e) => {
      const config = { name: shortName(e.name, area && area.name), entity: e.id, ...(K.variant ? { variant: K.variant } : {}) };
      out.push({ type: K.type, size: K.size || null, config, mobileW: K.k === 'tile' ? 2 : 4 });
    }));
    const temps = sorted.filter((e) => e.domain === 'sensor' && (e.dc === 'temperature' || e.dc === 'humidity'));
    if (temps.length) out.push({ type: 'readings', size: { w: 4, h: 3 }, config: { name: 'Climate', columns: Math.min(2, temps.length),
      items: temps.slice(0, 4).map((e, i) => ({ id: `v${i + 1}`, entity: e.id, label: shortName(e.name, area && area.name), color: e.dc === 'temperature' ? 'warning' : 'info', decimals: e.dc === 'temperature' ? 1 : 0 })) } });
    const sensors = sorted.filter((e) => e.domain === 'sensor' && !temps.includes(e));
    if (sensors.length) out.push({ type: 'entitylist', size: { w: 4, h: Math.min(10, 2 + sensors.length) }, config: { name: 'Sensors', rows: sensors.slice(0, 12).map((e, i) => ({ id: `i${i + 1}`, entity: e.id, label: shortName(e.name, area && area.name) })) } });
    const bins = sorted.filter((e) => e.domain === 'binary_sensor');
    if (bins.length) out.push({ type: 'entitylist', size: { w: 4, h: Math.min(10, 2 + bins.length) }, config: { name: 'Doors, windows & motion', rows: bins.slice(0, 12).map((e, i) => ({ id: `i${i + 1}`, entity: e.id, label: shortName(e.name, area && area.name) })) } });
    return out.slice(0, MAX_PER_PAGE);
  }

  /** size of each widget: its kind's own, else the registry's default size */
  const sized = (R, list) => list.map((w) => ({ ...w, size: w.size || (R && R.TYPES[w.type] && R.TYPES[w.type].size) || { w: 4, h: 4 } }));

  /* ---- CONFORM: every generated widget obeys its own widget's rules BEFORE it is placed (names come from Home Assistant and can be any
     length, contain any character, repeat…). Texts are cleaned (no < >, one space), a widget's own texts (name, subtitle, location) are cut to
     the length its schema allows (ending with "…"), and a LABEL that is too long for a row is left out — the row then shows Home Assistant's
     full name (a tooltip shows it whole when it is cut on screen), so nothing is lost and no entity has to be renamed. Then the widget is
     checked by the SAME validator that checks a dashboard when it is saved; one that still fails stops the generation with a clear message
     (nothing is created). */
  const LABEL_MAX = 24, TEXT_MAX = 60;
  const cleanText = (v) => String(v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  const clip = (v, n) => (v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v);
  function cleanDeep(v) {
    if (typeof v === 'string') return cleanText(v);
    if (Array.isArray(v)) return v.map(cleanDeep);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'entity' || k === 'id' || k === 'page' ? x : cleanDeep(x)]));
    return v;
  }
  /** the max length of a top-level text field in the widget's schema (the form's own limit), else 60 */
  const maxOf = (R, type, key) => { const T = R && (R.schemaOf ? R.schemaOf(type) : R.TYPES[type]); const f = T && Array.isArray(T.fields) && T.fields.find((x) => x && x.key === key && x.type === 'text'); return (f && f.maxLength) || TEXT_MAX; };
  /** one widget's errors, exactly as saving would report them (a one-item dashboard through MaisonModel.validate) */
  function errorsOf(M, R, type, config, pageIds = []) {
    if (!M || !M.validate) return [];
    // the other pages of the dashboard being generated exist too (a room tile opens its room's page)
    // pageIds: the page ids, or { pages, popups } (a generated dashboard's popups exist too: a room card opens its room popup)
    const pg = Array.isArray(pageIds) ? pageIds : (pageIds && pageIds.pages) || [], pops = Array.isArray(pageIds) ? [] : (pageIds && pageIds.popups) || [];
    const others = pg.filter((id) => id !== 'p').map((id) => ({ id, name: id, nav: true, items: [] }));
    const one = { version: 3, app: { id: 'check', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'P', nav: true, items: [{ id: 'w', type, config, layout: { desktop: { x: 1, y: 1, w: 4, h: 4 } } }] }, ...others],
      popups: pops.map((id) => ({ id, name: id, items: [] })), notifications: { templates: [], rules: [] } };
    const v = M.validate(one, R);
    return v.ok ? [] : v.errors.map((e) => String(e).replace(/^pages\[0\]\.items\[0\] "w" /, ''));
  }
  function conform(R, M, w, where, pageIds) {
    if (!R || !R.TYPES[w.type]) return { ok: false, error: `${where}: the widget type "${w.type}" is not available` };
    const c = cleanDeep(w.config);
    // EVERY text field the widget's schema limits (not only names): cut to its own maximum
    const textKeys = new Set(['name', 'subtitle', 'location', 'primary', 'secondary', ...((R.TYPES[w.type].fields || []).filter((f) => f && f.type === 'text' && typeof f.key === 'string' && !f.key.includes('.') && f.maxLength).map((f) => f.key))]);
    [...textKeys].forEach((k) => { if (typeof c[k] === 'string') { const n = maxOf(R, w.type, k); c[k] = clip(c[k], n); /* an empty text stays empty: deleting it would bring back the widget's default text */ } });
    // rows / items / people: a label longer than a row allows is left out (the row shows Home Assistant's own, complete name)
    Object.values(c).forEach((v) => { if (Array.isArray(v)) v.forEach((x) => { if (x && typeof x === 'object' && typeof x.label === 'string' && (x.label.length > LABEL_MAX || !x.label)) delete x.label; }); });
    let errs = errorsOf(M, R, w.type, c, pageIds);
    if (errs.length) {   // a second chance: every row label out (some widgets allow less than 24), then check again
      Object.values(c).forEach((v) => { if (Array.isArray(v)) v.forEach((x) => { if (x && typeof x === 'object') delete x.label; }); });
      errs = errorsOf(M, R, w.type, c, pageIds);
    }
    return errs.length ? { ok: false, error: `${where}: ${R.TYPES[w.type].label || w.type}${c.entity ? ` (${c.entity})` : ''} — ${errs[0]}` } : { ok: true, widget: { ...w, config: c } };
  }
  /** conform a page's widgets; throws a GenerateError (message for the user, every problem listed) when one cannot be made valid */
  function conformAll(R, list, where, pageIds = []) {
    const M = global.MaisonModel, out = [], bad = [];
    list.forEach((w) => { const r = conform(R, M, w, where, pageIds); if (r.ok) out.push(r.widget); else bad.push(r.error); });
    if (bad.length) { const e = new Error(`The dashboard could not be generated — ${bad.length} widget${bad.length === 1 ? '' : 's'} could not be made valid: ${bad.slice(0, 3).join('; ')}${bad.length > 3 ? '…' : ''}`); e.problems = bad; throw e; }
    return out;
  }

  /** the HOME page: who is home, the weather, and a tile per room (tap = that room's page) */
  function homeWidgets(entities, rooms) {
    const out = [];
    const people = (entities || []).filter((e) => e.domain === 'person').slice(0, 8);
    if (people.length) out.push({ type: 'presence', size: { w: 6, h: 3 }, config: { variant: 'row', name: 'Who’s home', people: people.map((e, i) => ({ id: `p${i + 1}`, entity: e.id, label: e.name })) } });
    const weather = (entities || []).find((e) => e.domain === 'weather');
    if (weather) out.push({ type: 'weather', size: { w: 6, h: 3 }, config: { variant: 'standard', location: weather.name, entity: weather.id } });
    rooms.forEach((r, i) => {
      const t = r.list.find((e) => e.domain === 'sensor' && e.dc === 'temperature'), hu = r.list.find((e) => e.domain === 'sensor' && e.dc === 'humidity');
      const n = r.list.length;
      out.push({ type: 'roomtile', size: { w: 3, h: 4 }, mobileW: 2, config: { name: r.area.name, subtitle: `${n} device${n === 1 ? '' : 's'}`, icon: iconOf(r.area.name), color: COLORS[i % COLORS.length],
        ...(t ? { temperature: t.id } : {}), ...(hu ? { humidity: hu.id } : {}), interactions: { tap: { action: 'navigate', page: r.pageId } } } });
    });
    return out;
  }

  /** what discovery offers: every area with the number of supported entities in it, and how many have no area */
  function summary(discovered) {
    const groups = byArea(discovered && discovered.entities);
    const areas = ((discovered && discovered.areas) || []).map((a) => ({ id: a.id, name: a.name, count: (groups.get(a.id) || []).length }));
    return { areas, unassigned: (groups.get(null) || []).length, people: ((discovered && discovered.entities) || []).filter((e) => e.domain === 'person').length,
      weather: ((discovered && discovered.entities) || []).some((e) => e.domain === 'weather') };
  }

  /** a PAGE for one area, for adding to an existing dashboard: { page } (ids prefixed so they never collide with the dashboard's) */
  function areaPage(discovered, areaId, R, usedIds = new Set(), usedPages = new Set()) {
    const area = ((discovered && discovered.areas) || []).find((a) => a.id === areaId);
    if (!area) return null;
    const list = byArea(discovered.entities).get(areaId) || [];
    let pid = slug(area.name), n = 2;
    while (usedPages.has(pid)) pid = `${slug(area.name)}-${n++}`;
    const items = packPage(pid, conformAll(R, sized(R, roomWidgets(area, list)), area.name));
    items.forEach((it) => { let id = it.id, k = 2; while (usedIds.has(id)) id = `${it.id}-${k++}`; it.id = id; usedIds.add(id); });
    const icon = pageIcon(R, area.name);
    return { page: { id: pid, name: clip(cleanText(area.name), 60) || pid, subtitle: 'From Home Assistant', ...(icon ? { icon } : {}), nav: true, items } };
  }

  /** the whole DASHBOARD: { dashboard, pages: n, widgets: n }. opts: { areas: [area ids] (default: every area with something in it),
      other: true (an "Other" page for what has no area), name } */
  function dashboard(discovered, R, opts = {}) {
    const groups = byArea(discovered && discovered.entities);
    const all = ((discovered && discovered.areas) || []).filter((a) => (groups.get(a.id) || []).length);
    const want = Array.isArray(opts.areas) ? all.filter((a) => opts.areas.includes(a.id)) : all;
    const usedPages = new Set(['home']);
    const rooms = want.map((a) => { let pid = slug(a.name), n = 2; while (usedPages.has(pid)) pid = `${slug(a.name)}-${n++}`; usedPages.add(pid); return { area: a, pageId: pid, list: groups.get(a.id) }; });
    const pages = [{ id: 'home', name: 'Home', icon: 'home', nav: true, items: packPage('home', conformAll(R, sized(R, homeWidgets(discovered.entities, rooms)), 'Home', [...usedPages])) }];
    rooms.forEach((r) => { const icon = pageIcon(R, r.area.name); pages.push({ id: r.pageId, name: clip(cleanText(r.area.name), 60) || r.pageId, subtitle: 'From Home Assistant', ...(icon ? { icon } : {}), nav: true, items: packPage(r.pageId, conformAll(R, sized(R, roomWidgets(r.area, r.list)), r.area.name)) }); });
    const loose = groups.get(null) || [];
    if (opts.other && loose.length) pages.push({ id: 'other', name: 'Other', subtitle: 'Not in any Home Assistant area', nav: true, items: packPage('other', conformAll(R, sized(R, roomWidgets(null, loose)), 'Other')) });
    const d = { version: 3, app: { id: 'generated', startPage: 'home', navigation: { desktop: 'left', tablet: 'bottom', mobile: 'bottom' } }, pages, popups: [], notifications: { templates: [], rules: [] } };
    return { dashboard: d, pages: pages.length, widgets: pages.reduce((n, p) => n + p.items.length, 0) };
  }

  global.IniqGenerate = Object.freeze({ summary, dashboard, areaPage, byArea, shortName, KINDS, conformAll });
})(window);
