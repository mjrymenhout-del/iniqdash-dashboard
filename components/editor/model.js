/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Application configuration model (version 3) — pages, free-placement frames, popups,
   notification templates + rules, schema validation, migration, persistence.

   {
     "version": 3,
     "app": { "id", "startPage", "navigation": { "desktop", "tablet", "mobile" } },
     "pages": [ { "id", "name", "icon"?, "subtitle"?, "background"?, "header"? (false: no title row), "nav", "items": [ITEM…] } ],
     "popups": [ { "id", "name", "config": { POPUP SETTINGS (schema MaisonRegistry.DEFS.popup) }, "items": [ITEM…] } ],
     "notifications": {
       "templates": [ { "id", "name", "config": { TEMPLATE (schema DEFS.notification) } } ],
       "rules":     [ { "id", "name", "event", "template", "enabled" } ]
     }
   }
   ITEM = { id, type, parent, config, layout, frame?, tab? }
   - tab: only for a child of a Tabbed Container ("tabs"): the id of the tab it belongs to (one of the container's
     config.tabs[].id). Absent = the first tab. The tab owns nothing else: the item is an ordinary item of that container.
   - layout: Grid V1 placement per breakpoint (grid units).
   - frame (version 3): FREE placement in px, per breakpoint — { desktop?, tablet?, mobile? } each
     { x, y, w, h } (whole px, relative to the free surface's top-left corner). Only items placed on a
     free surface have one: the children of a Floating Container, and the top-level items of a popup.
     Their `layout.mobile` stays the structured (4-column) mobile placement.
   - parent: null or a container / floating container ON THE SAME PAGE (or popup). A Floating Container
     sits on the page grid; it can hold widgets and normal containers (whose own children are its
     grandchildren). A container directly on the page holds widgets only.
   - Item ids are unique across the WHOLE application (all pages and popups); popup / template / rule
     ids are unique among their kind. Names are plain text. Navigation, popup and template targets are
     ids only — never URLs or code.
   - Migrations: 1 → 2 one dashboard becomes the start page; 2 → 3 adds empty "popups" and
     "notifications" (nothing on screen changes).
   - Only the configuration is stored/exported: never the active page, selection, history, open
     popups, visible notifications or dialogs.
   ========================================================================== */
(function (global) {
  'use strict';

  const VERSION = 3;
  const BACKGROUNDS = ['default', 'darker', 'lighter'];   // dashboard backdrop presets (theme-based, no CSS)
  const BPS = { desktop: 12, tablet: 8, mobile: 4 };
  const DOCK = { desktop: ['left', 'right', 'top', 'bottom', 'none'], tablet: ['left', 'right', 'top', 'bottom', 'none'], mobile: ['top', 'bottom', 'none'] };   // none: the dashboard's own navigation (Studio)
  const DOCK_DEFAULT = { desktop: 'left', tablet: 'bottom', mobile: 'bottom' };
  /* Dashboard grid geometry (app.grid, optional). Absent = the legacy grid (12 / 8 / 4 columns, 40px rows,
     16 / 16 / 12px gaps — MaisonGrid.LEGACY), exactly as before grids were configurable; nothing is migrated.
     Present = { desktop: { cols, row, gap }, tablet: {…}, mobile: {…} }, every breakpoint complete, whole numbers. */
  const GRID_LIMITS = { cols: { desktop: [4, 96], tablet: [2, 64], mobile: [1, 32] }, row: [4, 200], gap: [0, 48], pad: [0, 48] };
  const GRID_LEGACY = { desktop: { cols: 12, row: 40, gap: 16 }, tablet: { cols: 8, row: 40, gap: 16 }, mobile: { cols: 4, row: 40, gap: 12 } };
  /** a theme (dashboard or widget): the theme module owns the rules; without it a stored theme cannot be verified, so it is refused */
  const checkTheme = (t, path) => (global.MaisonTheme ? global.MaisonTheme.check(t, path) : [`${path}: theme support is not loaded`]);
  function checkGrid(g, errors) {
    if (!isObj(g)) { errors.push('app.grid: must be an object'); return; }
    Object.keys(g).forEach((k) => { if (!BPS[k] && k !== 'nested' && k !== 'popups') errors.push(`app.grid: unknown breakpoint "${k}"`); });
    // popups: 'page' — the containers and tabbed containers INSIDE POPUPS also use the page grid's rows and gaps (fine rows: a compact
    // row, a 100 px tile); absent = their legacy 40 px rows (every dashboard made before this option keeps exactly its look)
    if (g.popups !== undefined && g.popups !== 'page') errors.push('app.grid.popups: "page" when present');
    // nested: 'page' — containers on the pages share the page grid's rows and gaps (set by the migration below; always present on a
    // dashboard saved by this version)
    if (g.nested !== undefined && g.nested !== 'page') errors.push('app.grid.nested: "page" when present');
    Object.keys(BPS).forEach((bp) => {
      const v = g[bp];
      if (!isObj(v)) { errors.push(`app.grid.${bp}: required { cols, row, gap }`); return; }
      Object.keys(v).forEach((k) => { if (!['cols', 'row', 'gap', 'pad'].includes(k)) errors.push(`app.grid.${bp}: unknown key "${k}"`); });
      // pad (optional): the room between the screen edge and the page's widgets at this screen size
      if (v.pad !== undefined && (!Number.isInteger(v.pad) || v.pad < GRID_LIMITS.pad[0] || v.pad > GRID_LIMITS.pad[1])) errors.push(`app.grid.${bp}.pad: a whole number of px, ${GRID_LIMITS.pad[0]}–${GRID_LIMITS.pad[1]}`);
      [['cols', GRID_LIMITS.cols[bp], 'columns'], ['row', GRID_LIMITS.row, 'px'], ['gap', GRID_LIMITS.gap, 'px']].forEach(([k, [lo, hi], unit]) => {
        if (!Number.isInteger(v[k]) || v[k] < lo || v[k] > hi) errors.push(`app.grid.${bp}.${k}: a whole number of ${unit}, ${lo}–${hi}`);
      });
    });
  }
  /** layout limits of a grid: its columns, and h / y limits that cover the same physical height as the legacy 80 / 400 rows */
  /** the column limits of a nested grid (inside a container): the page grid's column count when it is larger than the default, the
      containers' own (legacy) rows */
  function nestedGrid(g) {
    if (!g) return null;
    const pageRows = g.nested === 'page';
    return Object.fromEntries(Object.keys(BPS).map((bp) => { const v = isObj(g[bp]) ? g[bp] : {};
      return [bp, { cols: Math.max(BPS[bp], Number.isInteger(v.cols) ? v.cols : BPS[bp]),
        row: pageRows && Number.isInteger(v.row) ? v.row : GRID_LEGACY[bp].row, gap: pageRows && Number.isInteger(v.gap) ? v.gap : GRID_LEGACY[bp].gap }]; }));
  }
  /* ---- GRID CONVERSION (one geometry → another, keeping every item's place and size on screen)
     A dashboard grid (app.grid) used to stop at containers: their nested grids kept 40px rows and a 12px gap, so a widget changed
     height when it moved into a container and the container's rows never lined up with the page. Since app.grid.nested = 'page' the
     nested grids of page containers share the page's rows and gaps. rescale() converts layouts between two geometries; the migration
     (normalizeNested) uses it once for dashboards saved before; the editor uses it when the grid settings change. */
  const NESTED_LEGACY = Object.fromEntries(Object.keys(BPS).map((bp) => [bp, { row: 40, gap: 12 }]));
  const pitch = (g, bp) => (g && isObj(g[bp]) ? (g[bp].row || 0) + (g[bp].gap || 0) : 0);
  /** a span [start, start + size) of tracks of pitch a → tracks of pitch b, edge by edge (MaisonGrid.remap) */
  function remap(start, size, a, b) {
    if (!(a > 0) || !(b > 0) || a === b) return { start, size };
    const st = Math.round((start - 1) * a / b), en = Math.round((start - 1 + size) * a / b);
    return { start: st + 1, size: Math.max(1, en - st) };
  }
  /** the geometry (row, gap per breakpoint) of a page's nested grids under app.grid g (null = legacy) */
  const nestRows = (g) => (g && g.nested === 'page' ? g : NESTED_LEGACY);
  /** the items of a page whose layout sits on a container's nested grid (container / tabs, themselves on the page grid or another
      such container — not on a Floating Container's free surface) */
  function nestedOnPage(items) {
    const byId = new Map(items.map((it) => [it.id, it]));
    const onGrid = (id, depth = 0) => { const p = byId.get(id); if (!p || depth > 8) return false; if (!BOX.includes(p.type)) return false; return !p.parent || onGrid(p.parent, depth + 1); };
    return items.filter((it) => it.parent && onGrid(it.parent));
  }
  /** convert every page's layouts from geometry `from` to `to` (app.grid values or null = legacy), in place.
      Top-level items: columns and rows. Items inside containers: rows (their columns are the container's span, which scales with it). */
  function rescale(app, from, to) {
    const cols = (g, bp) => (g && isObj(g[bp]) && g[bp].cols) || BPS[bp];
    (app.pages || []).forEach((pg) => {
      const items = Array.isArray(pg.items) ? pg.items : [];
      const nested = new Set(nestedOnPage(items));
      items.forEach((it) => {
        if (!isObj(it.layout)) return;
        const inBox = nested.has(it);
        if (it.parent && !inBox) return;                       // a Floating Container's item: its frame is in px
        Object.keys(BPS).forEach((bp) => {
          const L = it.layout[bp]; if (!isObj(L)) return;
          const a = inBox ? pitch(nestRows(from), bp) : pitch(from || GRID_LEGACY, bp), b = inBox ? pitch(nestRows(to), bp) : pitch(to || GRID_LEGACY, bp);
          if (Number.isInteger(L.h)) { const r = remap(Number.isInteger(L.y) ? L.y : 1, L.h, a, b); L.h = r.size; if (Number.isInteger(L.y)) L.y = r.start; }
          // columns: the page grid's column count changed (a container's own columns follow its span — same ratio)
          const c1 = cols(from, bp), c2 = cols(to, bp);
          if (c1 !== c2 && Number.isInteger(L.w)) {
            const r = remap(Number.isInteger(L.x) ? L.x : 1, L.w, 1 / c1, 1 / c2);
            L.w = Math.min(Math.max(1, r.size), c2); if (Number.isInteger(L.x)) L.x = Math.max(1, Math.min(r.start, c2 - L.w + 1));
          }
        });
      });
    });
  }
  /** MIGRATION (once): a dashboard with a dashboard grid saved before nested grids shared the page rows — its container items were
      laid out in 40px rows; they are converted to the page rows (same size on screen) and the dashboard is marked nested = 'page'. */
  function normalizeNested(m) {
    const g = m && isObj(m.app) && isObj(m.app.grid) ? m.app.grid : null;
    if (!g || g.nested === 'page' || !Object.keys(BPS).every((bp) => isObj(g[bp]) && Number.isInteger(g[bp].row) && Number.isInteger(g[bp].gap))) return false;
    (m.pages || []).forEach((pg) => {
      const items = Array.isArray(pg.items) ? pg.items : [];
      nestedOnPage(items).forEach((it) => {
        if (!isObj(it.layout)) return;
        Object.keys(BPS).forEach((bp) => {
          const L = it.layout[bp]; if (!isObj(L) || !Number.isInteger(L.h)) return;
          const r = remap(Number.isInteger(L.y) ? L.y : 1, L.h, pitch(NESTED_LEGACY, bp), pitch(g, bp));
          L.h = r.size; if (Number.isInteger(L.y)) L.y = r.start;
        });
      });
    });
    g.nested = 'page';
    return true;
  }
  function gridLimits(g, bp) {
    if (!g || !isObj(g[bp]) || !Number.isInteger(g[bp].cols)) return { cols: BPS[bp], h: 80, y: 400 };
    const L = GRID_LEGACY[bp], pitch = Math.max(1, g[bp].row + g[bp].gap), scale = Math.max(1, (L.row + L.gap) / pitch);
    return { cols: g[bp].cols, h: Math.ceil(80 * scale), y: Math.ceil(400 * scale) };
  }
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
  const EVENT = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,4}$/;      // namespaced event ids: demo.front_door_open, later ha.state_changed…
  const URL_KEYS = new Set(['image', 'imageOff', 'artwork']);
  /* image locations a configuration may use: a shared asset (assets/…), a widget package asset
     (widgets/default|custom/<id>/assets/…), an https address or an embedded image — never with “..” */
  // the same allow-list as components/editor/registry.js SAFE_URL (a widget's own assets: widgets/<source>/[<collection>/]<widget>/assets/)
  const SAFE_URL = /^(?!.*\.\.)(assets\/[A-Za-z0-9._\/-]+|widgets\/(default|custom)\/[a-z0-9][a-z0-9-]*\/(?:[a-z0-9][a-z0-9-]*\/)?assets\/[A-Za-z0-9._\/-]+|api\/asset\.php\?id=[0-9a-f]{32}|https:\/\/[^\s"'<>()]+|data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+)$/;
  const PLAIN = (v, max) => typeof v === 'string' && v.length <= max && !/[<>]/.test(v);
  /** Images that moved into their widget package (widgets/default/<id>/assets/). A saved or imported
      dashboard that still names the old shared location is read with the new one — nothing else changes. */
  const MOVED_ASSETS = {
    'assets/img/lights/pendant-dome.png': 'widgets/default/light/assets/pendant-dome.png',
    'assets/img/switches/smart-plug-on.png': 'widgets/default/switch/assets/smart-plug-on.png',
    'assets/img/switches/smart-plug-off.png': 'widgets/default/switch/assets/smart-plug-off.png',
    'assets/img/appliances/washing-machine.png': 'widgets/default/appliance/assets/washing-machine.png',
    'assets/img/cameras/demo-garden.svg': 'widgets/default/camera/assets/demo-garden.svg',
    'assets/img/content/demo-house.svg': 'widgets/default/image/assets/demo-house.svg',
    'assets/img/people/avatar-demo.jpg': 'widgets/default/person/assets/avatar-demo.jpg',
  };
  /** rewrite moved image locations in place (image keys of item configs and notification templates) */
  function relocateAssets(v, depth = 0) {
    if (depth > 8 || v === null || typeof v !== 'object') return;
    Object.keys(v).forEach((k) => {
      const x = v[k];
      if (typeof x === 'string' && URL_KEYS.has(k) && MOVED_ASSETS[x]) v[k] = MOVED_ASSETS[x];
      else if (x && typeof x === 'object') relocateAssets(x, depth + 1);
    });
  }

  /** Older versions are upgraded step by step here. */
  const MIGRATIONS = {
    /** 1 → 2: the single dashboard becomes the one (start) page of an application. */
    1: (m) => {
      const d = (m.dashboard && typeof m.dashboard === 'object' && !Array.isArray(m.dashboard)) ? m.dashboard : {};
      const pageId = typeof d.id === 'string' && ID.test(d.id) ? d.id : 'home';
      const page = { id: pageId, name: typeof d.title === 'string' && d.title.trim() ? d.title : 'Home', nav: true, items: m.items };
      if (d.subtitle !== undefined) page.subtitle = d.subtitle;
      if (d.background !== undefined) page.background = d.background;
      return { version: 2, app: { id: pageId, startPage: pageId, navigation: { ...DOCK_DEFAULT } }, pages: [page], _legacy: Object.keys(d).filter((k) => !['id', 'title', 'subtitle', 'background'].includes(k)) };
    },
    /** 2 → 3: popups + notification templates/rules (none yet). Pages and items are untouched. */
    2: (m) => ({ ...m, version: 3, popups: Array.isArray(m.popups) ? m.popups : [], notifications: isObj(m.notifications) ? m.notifications : { templates: [], rules: [] } }),
  };

  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

  /** Deep check of config values: JSON types only, bounded size, no markup, safe image URLs. */
  function checkConfig(v, path, errors, depth = 0) {
    if (depth > 6) { errors.push(`${path}: nested too deeply`); return; }
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number') { if (!Number.isFinite(v)) errors.push(`${path}: not a finite number`); return; }
    if (typeof v === 'string') {
      if (v.length > 600) errors.push(`${path}: text too long`);
      if (/^\s*</.test(v) || /<\s*(script|svg|img|iframe|object)/i.test(v)) errors.push(`${path}: markup is not allowed`);
      const key = path.split('.').pop();
      if (URL_KEYS.has(key) && v !== '' && v !== 'none' && !SAFE_URL.test(v)) errors.push(`${path}: unsupported image location`);   // 'none' = literally no image
      return;
    }
    if (Array.isArray(v)) { if (v.length > 200) errors.push(`${path}: too many entries`); v.forEach((x, i) => checkConfig(x, `${path}[${i}]`, errors, depth + 1)); return; }
    if (isObj(v)) { Object.keys(v).forEach((k) => { if (k === '__proto__' || k === 'constructor' || k === 'prototype') errors.push(`${path}.${k}: reserved key`); else checkConfig(v[k], `${path}.${k}`, errors, depth + 1); }); return; }
    errors.push(`${path}: unsupported value`);
  }

  /** grid: the dashboard geometry when the item sits directly on a page grid (null = legacy limits) */
  function checkLayout(layout, path, errors, grid) {
    if (!isObj(layout)) { errors.push(`${path}: must be an object`); return; }
    Object.keys(layout).forEach((bp) => {
      if (!BPS[bp]) { errors.push(`${path}: unknown breakpoint "${bp}"`); return; }
      const { cols, h: hMax, y: yMax } = gridLimits(grid, bp);
      const p = layout[bp];
      if (!isObj(p)) { errors.push(`${path}.${bp}: must be an object`); return; }
      Object.keys(p).forEach((k) => { if (!['x', 'y', 'w', 'h', 'hide'].includes(k)) errors.push(`${path}.${bp}: unknown key "${k}"`); });
      if (p.hide !== undefined && p.hide !== true) errors.push(`${path}.${bp}.hide: true when present (not shown at this screen size)`);
      const int = (k, lo, hi, required) => {
        if (p[k] === undefined) { if (required) errors.push(`${path}.${bp}.${k}: required`); return; }
        if (!Number.isInteger(p[k]) || p[k] < lo || p[k] > hi) errors.push(`${path}.${bp}.${k}: must be a whole number ${lo}–${hi}`);
      };
      int('w', 1, cols, true); int('h', 1, hMax, true); int('x', 1, cols, false); int('y', 1, yMax, false);
      if (Number.isInteger(p.x) && Number.isInteger(p.w) && p.x + p.w - 1 > cols) errors.push(`${path}.${bp}: x + w goes past column ${cols}`);
    });
  }

  function checkFrame(frame, path, errors) {
    if (!isObj(frame)) { errors.push(`${path}: must be an object`); return; }
    Object.keys(frame).forEach((bp) => {
      if (!BPS[bp]) { errors.push(`${path}: unknown breakpoint "${bp}"`); return; }
      const f = frame[bp];
      if (!isObj(f)) { errors.push(`${path}.${bp}: must be an object`); return; }
      Object.keys(f).forEach((k) => { if (!['x', 'y', 'w', 'h'].includes(k)) errors.push(`${path}.${bp}: unknown key "${k}"`); });
      [['x', 0, 10000], ['y', 0, 20000], ['w', 8, 4000], ['h', 8, 4000]].forEach(([k, lo, hi]) => {
        if (!Number.isInteger(f[k]) || f[k] < lo || f[k] > hi) errors.push(`${path}.${bp}.${k}: required whole number of px ${lo}–${hi}`);
      });
    });
  }

  /** the item types that hold widgets on their own nested grid (a Container; a Tabbed Container — one grid per tab) */
  const BOX = ['container', 'tabs'];
  /** one surface's items (a page or a popup; structure only); ids are checked against the
      application-wide set. freeTop: the top-level items sit on a free surface (a popup). */
  function checkItems(items, at, registry, ids, errors, freeTop, grid) {
    if (!Array.isArray(items)) { errors.push(`${at}.items: must be an array`); return; }
    const local = new Set(), types = {};
    items.forEach((it, i) => {
      const p = `${at}.items[${i}]`;
      if (!isObj(it)) { errors.push(`${p}: must be an object`); return; }
      Object.keys(it).forEach((k) => { if (!['id', 'type', 'parent', 'config', 'layout', 'frame', 'tab'].includes(k)) errors.push(`${p}: unknown key "${k}"`); });
      if (it.tab !== undefined && (typeof it.tab !== 'string' || !ID.test(it.tab) || !it.parent)) errors.push(`${p}.tab: a tab id (only for an item inside a Tabbed Container)`);
      if (typeof it.id !== 'string' || !ID.test(it.id)) errors.push(`${p}.id: required, letters/digits/-/_ (max 64)`);
      else if (ids.has(it.id)) errors.push(`${p}.id: duplicate "${it.id}" (item ids are unique across all pages)`);
      else { ids.add(it.id); local.add(it.id); }
      if (typeof it.type === 'string' && !registry.TYPES[it.type] && registry.placeholder) registry.placeholder(it.type);   // a custom widget that is not installed
      if (typeof it.type !== 'string' || !registry.TYPES[it.type]) errors.push(`${p}.type: unknown component type "${it.type}"`);
      else types[it.id] = it.type;
      if (it.config !== undefined) { if (!isObj(it.config)) errors.push(`${p}.config: must be an object`); else { checkConfig(it.config, `${p}.config`, errors); if (it.config.theme !== undefined) errors.push(...checkTheme(it.config.theme, `${p}.config.theme`)); } }
      // an item INSIDE a container: its grid has as many columns as the container spans — with a custom page grid that can be more than
      // the default 12 (it was checked against 12, so a valid layout made in the editor was refused on opening). Its column limit is
      // the page grid's (never stricter than before); its rows stay the containers' own 40px grid.
      if (it.layout !== undefined) checkLayout(it.layout, `${p}.layout`, errors, !it.parent ? (!freeTop ? grid : null) : nestedGrid(grid));
      if (it.frame !== undefined) checkFrame(it.frame, `${p}.frame`, errors);
    });
    items.forEach((it, i) => {
      if (!isObj(it) || it.parent === undefined || it.parent === null) return;
      const p = `${at}.items[${i}].parent`;
      if (typeof it.parent !== 'string' || !local.has(it.parent)) errors.push(`${p}: no item "${it.parent}" on this page`);
      else if (!BOX.includes(types[it.parent]) && types[it.parent] !== 'floating') errors.push(`${p}: "${it.parent}" is not a container`);
      else if (it.parent === it.id) errors.push(`${p}: an item cannot contain itself`);
      else {
        const par = items.find((x) => x && x.id === it.parent);
        // nesting: page → (floating →) container → widget. A floating container is never nested;
        // a container may sit inside a floating container; nothing goes deeper.
        if (it.type === 'floating') errors.push(`${p}: a floating container cannot be placed inside another item`);
        else if (types[it.parent] === 'floating' && par && par.parent) errors.push(`${p}: a floating container must sit on the page`);
        else if (BOX.includes(types[it.parent]) && par && par.parent && (types[par.parent] !== 'floating' || BOX.includes(it.type) || it.type === 'floating')) errors.push(`${p}: containers can only be nested one level deep (or inside a floating container)`);
        else if (BOX.includes(types[it.parent]) && BOX.includes(it.type)) errors.push(`${p}: a container cannot hold another container`);
        // a Tabbed Container's child belongs to one of its tabs
        else if (types[it.parent] === 'tabs' && it.tab !== undefined && par && !(isObj(par.config) && Array.isArray(par.config.tabs) && par.config.tabs.some((t) => isObj(t) && t.id === it.tab))) errors.push(`${p}: no tab "${it.tab}" in "${it.parent}"`);
        if (it.tab !== undefined && types[it.parent] !== 'tabs') errors.push(`${at}.items[${i}].tab: only a Tabbed Container's items belong to a tab`);
      }
    });
    if (freeTop) items.forEach((it, i) => { if (isObj(it) && it.type === 'floating') errors.push(`${at}.items[${i}]: a popup is already a free surface — floating containers cannot be added to it`); });
  }

  /**
   * Validate (and migrate) a parsed configuration. Never trusts input; never executes anything.
   * @returns {{ ok: true, model, migrated? } | { ok: false, errors: string[] }}
   */
  function validate(input, registry) {
    const errors = [];
    if (!isObj(input)) return { ok: false, errors: ['The file is not a dashboard configuration (expected a JSON object).'] };
    let m = input;
    if (!Number.isInteger(m.version)) return { ok: false, errors: ['Missing or invalid "version".'] };
    if (m.version > VERSION) return { ok: false, errors: [`Version ${m.version} is newer than this editor understands (${VERSION}).`] };
    const from = m.version;
    if (from === 1) {   // version-1 structure is checked before migrating
      if (m.dashboard !== undefined && !isObj(m.dashboard)) return { ok: false, errors: ['"dashboard" must be an object.'] };
      if (!Array.isArray(m.items)) return { ok: false, errors: ['"items" must be an array.'] };
    }
    while (m.version < VERSION) {
      const step = MIGRATIONS[m.version];
      if (!step) return { ok: false, errors: [`No migration from version ${m.version}.`] };
      m = step(m);
    }
    relocateAssets(m);
    normalizeNested(m);
    (m._legacy || []).forEach((k) => errors.push(`dashboard: unknown key "${k}"`));
    Object.keys(m).forEach((k) => { if (!['version', 'app', 'pages', 'popups', 'notifications', '_legacy'].includes(k)) errors.push(`unknown key "${k}"`); });

    // application + navigation
    const A = m.app === undefined ? {} : m.app;
    if (!isObj(A)) return { ok: false, errors: ['"app" must be an object.'] };
    Object.keys(A).forEach((k) => { if (!['id', 'startPage', 'navigation', 'grid', 'theme', 'themes', 'simulated', 'wall'].includes(k)) errors.push(`app: unknown key "${k}"`); });
    // a dashboard of the simulated home (server/ha/SimHa.php): its widgets read and act on the simulation, never on Home Assistant
    if (A.simulated !== undefined && typeof A.simulated !== 'boolean') errors.push('app.simulated: true or false');
    // WALL TABLET (viewing only): screensaver after N minutes, back to the start page after N minutes, popups closed after N seconds
    if (A.wall !== undefined) {
      if (!isObj(A.wall)) errors.push('app.wall: must be an object');
      else Object.entries(A.wall).forEach(([k, v]) => {
        const lim = { saver: 240, returnHome: 240, popupClose: 600 }[k];
        if (k === 'saverStyle') { if (!['clock', 'black'].includes(v)) errors.push('app.wall.saverStyle: clock or black'); }
        else if (!lim) errors.push(`app.wall: unknown key "${k}"`);
        else if (!Number.isInteger(v) || v < 0 || v > lim) errors.push(`app.wall.${k}: a whole number from 0 to ${lim}`);
      });
    }
    if (A.theme !== undefined) errors.push(...checkTheme(A.theme, 'app.theme'));
    if (A.themes !== undefined) errors.push(...(global.MaisonTheme ? global.MaisonTheme.checkLibrary(A.themes, 'app.themes') : ['app.themes: theme support is not loaded']));
    if (A.grid !== undefined) checkGrid(A.grid, errors);
    const grid = A.grid !== undefined && isObj(A.grid) ? A.grid : null;
    if (A.id !== undefined && (typeof A.id !== 'string' || !ID.test(A.id))) errors.push('app.id: letters/digits/-/_ (max 64)');
    const N = A.navigation === undefined ? {} : A.navigation;
    if (!isObj(N)) errors.push('app.navigation: must be an object');
    else {
      Object.keys(N).forEach((k) => {
        if (!DOCK[k]) errors.push(`app.navigation: unknown breakpoint "${k}"`);
        else if (!DOCK[k].includes(N[k])) errors.push(`app.navigation.${k}: one of ${DOCK[k].join(', ')}`);
      });
    }

    // pages
    if (!Array.isArray(m.pages) || !m.pages.length) return { ok: false, errors: [...errors, '"pages" must be a list with at least one page.'] };
    if (m.pages.length > 50) errors.push('Too many pages (max 50).');
    const pageIds = new Set(), ids = new Set();
    let total = 0;
    m.pages.forEach((pg, i) => {
      const at = `pages[${i}]`;
      if (!isObj(pg)) { errors.push(`${at}: must be an object`); return; }
      Object.keys(pg).forEach((k) => { if (!['id', 'name', 'icon', 'subtitle', 'background', 'header', 'nav', 'items'].includes(k)) errors.push(`${at}: unknown key "${k}"`); });
      if (pg.header !== undefined && pg.header !== false) errors.push(`${at}.header: false (hide the page title), or absent`);
      if (typeof pg.id !== 'string' || !ID.test(pg.id)) errors.push(`${at}.id: required, letters/digits/-/_ (max 64)`);
      else if (pageIds.has(pg.id)) errors.push(`${at}.id: duplicate page "${pg.id}"`);
      else pageIds.add(pg.id);
      if (!PLAIN(pg.name, 80) || !pg.name.trim()) errors.push(`${at}.name: required plain text, at most 80 characters`);
      if (pg.subtitle !== undefined && !PLAIN(pg.subtitle, 80)) errors.push(`${at}.subtitle: plain text, at most 80 characters`);
      if (pg.background !== undefined && !BACKGROUNDS.includes(pg.background)) errors.push(`${at}.background: one of ${BACKGROUNDS.join(', ')}`);
      if (pg.icon !== undefined && pg.icon !== '') {
        const known = registry.pageIcons ? registry.pageIcons() : null;
        if (typeof pg.icon !== 'string' || !ID.test(pg.icon) || (known && !known.includes(pg.icon))) errors.push(`${at}.icon: unknown icon "${pg.icon}"`);
      }
      if (pg.nav !== undefined && typeof pg.nav !== 'boolean') errors.push(`${at}.nav: true or false`);
      checkItems(pg.items, at, registry, ids, errors, false, grid);
      if (Array.isArray(pg.items)) total += pg.items.length;
    });
    // popups: a named definition (settings) + its own items on a free surface
    const popups = m.popups === undefined ? [] : m.popups;
    const popupIds = new Set();
    if (!Array.isArray(popups)) errors.push('"popups" must be a list');
    else {
      if (popups.length > 50) errors.push('Too many popups (max 50).');
      popups.forEach((pp, i) => {
        const at = `popups[${i}]`;
        if (!isObj(pp)) { errors.push(`${at}: must be an object`); return; }
        Object.keys(pp).forEach((k) => { if (!['id', 'name', 'config', 'items'].includes(k)) errors.push(`${at}: unknown key "${k}"`); });
        if (typeof pp.id !== 'string' || !ID.test(pp.id)) errors.push(`${at}.id: required, letters/digits/-/_ (max 64)`);
        else if (popupIds.has(pp.id)) errors.push(`${at}.id: duplicate popup "${pp.id}"`);
        else popupIds.add(pp.id);
        if (!PLAIN(pp.name, 80) || !pp.name.trim()) errors.push(`${at}.name: required plain text, at most 80 characters`);
        if (pp.config !== undefined) { if (!isObj(pp.config)) errors.push(`${at}.config: must be an object`); else checkConfig(pp.config, `${at}.config`, errors); }
        checkItems(pp.items, at, registry, ids, errors, true);
        if (Array.isArray(pp.items)) total += pp.items.length;
      });
    }
    // notifications: templates (design) + rules (event → template)
    const N3 = m.notifications === undefined ? { templates: [], rules: [] } : m.notifications;
    const tplIds = new Set(), ruleIds = new Set();
    if (!isObj(N3)) errors.push('"notifications" must be an object');
    else {
      Object.keys(N3).forEach((k) => { if (!['templates', 'rules'].includes(k)) errors.push(`notifications: unknown key "${k}"`); });
      const T = N3.templates === undefined ? [] : N3.templates, RU = N3.rules === undefined ? [] : N3.rules;
      if (!Array.isArray(T)) errors.push('notifications.templates: must be a list');
      else T.forEach((t, i) => {
        const at = `notifications.templates[${i}]`;
        if (!isObj(t)) { errors.push(`${at}: must be an object`); return; }
        Object.keys(t).forEach((k) => { if (!['id', 'name', 'config'].includes(k)) errors.push(`${at}: unknown key "${k}"`); });
        if (typeof t.id !== 'string' || !ID.test(t.id)) errors.push(`${at}.id: required, letters/digits/-/_ (max 64)`);
        else if (tplIds.has(t.id)) errors.push(`${at}.id: duplicate template "${t.id}"`);
        else tplIds.add(t.id);
        if (!PLAIN(t.name, 80) || !t.name.trim()) errors.push(`${at}.name: required plain text, at most 80 characters`);
        if (t.config !== undefined) { if (!isObj(t.config)) errors.push(`${at}.config: must be an object`); else checkConfig(t.config, `${at}.config`, errors); }
      });
      if (!Array.isArray(RU)) errors.push('notifications.rules: must be a list');
      else RU.forEach((r, i) => {
        const at = `notifications.rules[${i}]`;
        if (!isObj(r)) { errors.push(`${at}: must be an object`); return; }
        Object.keys(r).forEach((k) => { if (!['id', 'name', 'event', 'template', 'enabled'].includes(k)) errors.push(`${at}: unknown key "${k}"`); });
        if (typeof r.id !== 'string' || !ID.test(r.id)) errors.push(`${at}.id: required, letters/digits/-/_ (max 64)`);
        else if (ruleIds.has(r.id)) errors.push(`${at}.id: duplicate rule "${r.id}"`);
        else ruleIds.add(r.id);
        if (r.name !== undefined && (!PLAIN(r.name, 80))) errors.push(`${at}.name: plain text, at most 80 characters`);
        if (typeof r.event !== 'string' || !EVENT.test(r.event)) errors.push(`${at}.event: an event id such as "demo.front_door_open"`);
        if (typeof r.template !== 'string') errors.push(`${at}.template: required`);
        if (r.enabled !== undefined && typeof r.enabled !== 'boolean') errors.push(`${at}.enabled: true or false`);
      });
      if (Array.isArray(RU)) RU.forEach((r, i) => { if (isObj(r) && typeof r.template === 'string' && !tplIds.has(r.template)) errors.push(`notifications.rules[${i}].template: no template "${r.template}"`); });
    }
    if (total > 1000) errors.push('Too many items (max 1000 across all pages and popups).');
    if (A.startPage !== undefined && (typeof A.startPage !== 'string' || !pageIds.has(A.startPage))) errors.push(`app.startPage: no page "${A.startPage}"`);
    if (errors.length) return { ok: false, errors: errors.slice(0, 30) };

    // configs are COMPLETE: a sparse (older / hand-written) config is materialised from the
    // component defaults — exactly what was rendered before — then checked against its schema.
    // Schema checks that refer to pages (e.g. a "navigate to page" action) see THIS file's pages.
    const pages = m.pages.map((pg) => ({ id: pg.id, name: pg.name }));
    const prevCtx = registry.context;
    registry.context = { ...(prevCtx || {}), pages, popups: popups.map((pp) => ({ id: pp.id, name: pp.name })), templates: (N3.templates || []).map((t) => ({ id: t.id, name: t.name })) };
    let out;
    try {
      const full = (it) => (registry.fullConfig ? registry.fullConfig(it.type, it.config) : structuredClone(it.config || {}));
      const configs = m.pages.map((pg) => pg.items.map(full));
      const pconfigs = popups.map((pp) => pp.items.map(full));
      const def = (kind, c) => (registry.fullConfig && registry.DEFS && registry.DEFS[kind] ? registry.fullConfig(kind, c) : structuredClone(c || {}));
      const popCfg = popups.map((pp) => def('popup', pp.config));
      const tplCfg = (N3.templates || []).map((t) => def('notification', t.config));
      if (registry.validateConfig) {
        m.pages.forEach((pg, pi) => pg.items.forEach((it, i) => registry.validateConfig(it.type, configs[pi][i]).forEach((e) => errors.push(`pages[${pi}].items[${i}] "${it.id}" config.${e.key}: ${e.message}`))));
        popups.forEach((pp, pi) => {
          pp.items.forEach((it, i) => registry.validateConfig(it.type, pconfigs[pi][i]).forEach((e) => errors.push(`popups[${pi}].items[${i}] "${it.id}" config.${e.key}: ${e.message}`)));
          if (registry.DEFS) registry.validateConfig('popup', popCfg[pi]).forEach((e) => errors.push(`popups[${pi}] "${pp.id}" config.${e.key}: ${e.message}`));
        });
        if (registry.DEFS) (N3.templates || []).forEach((t, ti) => registry.validateConfig('notification', tplCfg[ti]).forEach((e) => errors.push(`notifications.templates[${ti}] "${t.id}" config.${e.key}: ${e.message}`)));
      }
      if (errors.length) return { ok: false, errors: errors.slice(0, 30) };
      const itemOut = (it, c) => ({ id: it.id, type: it.type, parent: it.parent || null, config: c, layout: structuredClone(it.layout || {}), ...(it.frame ? { frame: structuredClone(it.frame) } : {}), ...(it.tab ? { tab: it.tab } : {}) });
      const first = m.pages[0].id;
      out = {
        version: VERSION,
        app: {
          id: String(A.id || first),
          startPage: A.startPage || first,
          navigation: { ...DOCK_DEFAULT, ...(isObj(N) ? N : {}) },
          ...(A.theme !== undefined && global.MaisonTheme && global.MaisonTheme.clean(A.theme) ? { theme: global.MaisonTheme.clean(A.theme) } : {}),
          ...(A.simulated === true ? { simulated: true } : {}),
          ...(isObj(A.wall) && Object.keys(A.wall).some((k) => A.wall[k]) ? { wall: Object.fromEntries(Object.entries(A.wall).filter(([, v]) => v)) } : {}),
          ...(Array.isArray(A.themes) && A.themes.length && global.MaisonTheme ? { themes: A.themes.map((t) => { const c = global.MaisonTheme.clean(t) || {}; return { ...c, id: t.id, name: t.name.trim(), tokens: c.tokens || {} }; }) } : {}),
          ...(grid ? { grid: { ...Object.fromEntries(Object.keys(BPS).map((bp) => [bp, { cols: grid[bp].cols, row: grid[bp].row, gap: grid[bp].gap, ...(grid[bp].pad ? { pad: grid[bp].pad } : {}) }])), nested: 'page', ...(grid.popups === 'page' ? { popups: 'page' } : {}) } } : {}),
        },
        pages: m.pages.map((pg, pi) => ({
          id: pg.id, name: pg.name.trim(),
          ...(pg.icon ? { icon: pg.icon } : {}),
          ...(pg.subtitle ? { subtitle: pg.subtitle } : {}),
          ...(pg.background && pg.background !== 'default' ? { background: pg.background } : {}),
          ...(pg.header === false ? { header: false } : {}),
          nav: pg.nav !== false,
          items: pg.items.map((it, i) => itemOut(it, configs[pi][i])),
        })),
        popups: popups.map((pp, pi) => ({ id: pp.id, name: pp.name.trim(), config: popCfg[pi], items: pp.items.map((it, i) => itemOut(it, pconfigs[pi][i])) })),
        notifications: {
          templates: (N3.templates || []).map((t, ti) => ({ id: t.id, name: t.name.trim(), config: tplCfg[ti] })),
          rules: (N3.rules || []).map((r) => ({ id: r.id, ...(r.name ? { name: r.name } : {}), event: r.event, template: r.template, enabled: r.enabled !== false })),
        },
      };
    } finally { registry.context = prevCtx; }
    return { ok: true, model: out, migrated: from < VERSION ? from : undefined };
  }

  /** Parse JSON text safely and validate. */
  function parse(text, registry) {
    let data;
    try { data = JSON.parse(String(text)); } catch (e) { return { ok: false, errors: [`Not valid JSON: ${e.message}`] }; }
    return validate(data, registry);
  }

  const serialize = (model) => JSON.stringify(model, null, 2);

  /** Browser-local persistence for the demo. Replace this object (same methods) with a server or
      Home Assistant storage adapter later; the editor only talks to this interface.
        load() / save(text) / clear()            the SAVED configuration (explicit Save only)
        loadDraft() / saveDraft(text) / clearDraft()   a RECOVERY DRAFT of unsaved edits — kept
                                                 separately, never replaces the saved configuration */
  const LocalStore = (key = 'maison.template.dashboard.v1') => {
    const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
    const del = (k) => { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } };
    return {
      load: () => get(key), save: (text) => set(key, text), clear: () => del(key),
      loadDraft: () => get(`${key}.draft`), saveDraft: (text) => set(`${key}.draft`, text), clearDraft: () => del(`${key}.draft`),
    };
  };

  /* ---------------------------------------------------------------- REFERENCES
     Every link from the dashboard to one of ITS OWN popups, pages or notification templates — ONE finder used by deleting a popup /
     page, by Save (nothing invalid is stored) and by the repair of a saved dashboard that no longer opens. Each reference:
       { kind: 'popup' | 'page' | 'template', ref, where: 'page' | 'popup' | 'popup-settings' | 'rule', ownerId, ownerName, item?, type?,
         name, label, path, set(id), clear() }
     set / clear change the model object the references were read from (call it on a copy). clear() is the harmless choice each
     place already uses: an interaction does nothing, an Action widget runs its demo action, a Button does nothing, a radial segment is
     switched off, a popup's Back closes it / its Menu is removed, a rule without its template is removed. */
  const GESTURE_LABEL = { tap: 'Tap', doubleTap: 'Double tap', longPress: 'Long press' };
  function references(m) {
    const out = [];
    if (!isObj(m)) return out;
    const nameOf = (it) => { const c = isObj(it.config) ? it.config : {}; return String(c.name || c.title || c.text || c.label || it.id || '').slice(0, 60); };
    const scan = (where, owner, list) => (Array.isArray(list) ? list : []).forEach((it, i) => {
      if (!isObj(it) || !isObj(it.config)) return;
      const c = it.config, base = { where, ownerId: owner.id, ownerName: owner.name || owner.id, item: it.id, type: it.type, name: nameOf(it), path: `${where === 'page' ? 'pages' : 'popups'}[${owner.index}].items[${i}]` };
      const add = (kind, label, key, get, set, clear) => { const ref = get(); if (typeof ref === 'string' && ref) out.push({ ...base, kind, label, ref, path: `${base.path} config.${key}`, set, clear }); };
      const ia = isObj(c.interactions) ? c.interactions : null;
      if (ia) Object.keys(GESTURE_LABEL).forEach((g) => {
        const x = ia[g]; if (!isObj(x)) return;
        if (x.action === 'popup') add('popup', `${GESTURE_LABEL[g]} opens a popup`, `interactions.${g}.popup`, () => x.popup, (v) => { x.popup = v; }, () => { ia[g] = { action: 'none' }; });
        if (x.action === 'navigate') add('page', `${GESTURE_LABEL[g]} opens a page`, `interactions.${g}.page`, () => x.page, (v) => { x.page = v; }, () => { ia[g] = { action: 'none' }; });
      });
      if (it.type === 'action' && c.run === 'popup') add('popup', 'Opens a popup', 'popup', () => c.popup, (v) => { c.popup = v; }, () => { c.run = 'demo'; delete c.popup; });
      if (it.type === 'button' && c.action === 'popup') add('popup', 'When pressed: opens a popup', 'popup', () => c.popup, (v) => { c.popup = v; }, () => { c.action = 'none'; delete c.popup; });
      if (it.type === 'button' && c.action === 'navigate') add('page', 'When pressed: opens a page', 'page', () => c.page, (v) => { c.page = v; }, () => { c.action = 'none'; delete c.page; });
      if (it.type === 'radial' && Array.isArray(c.actions)) c.actions.forEach((a, k) => {
        if (!isObj(a)) return;
        if (a.type === 'popup') add('popup', `Segment ${k + 1} opens a popup`, `actions.${k}.popup`, () => a.popup, (v) => { a.popup = v; }, () => { a.type = 'demo'; delete a.popup; a.enabled = false; });
        if (a.type === 'navigate') add('page', `Segment ${k + 1} opens a page`, `actions.${k}.page`, () => a.page, (v) => { a.page = v; }, () => { a.type = 'demo'; delete a.page; a.enabled = false; });
      });
    });
    (Array.isArray(m.pages) ? m.pages : []).forEach((pg, i) => { if (isObj(pg)) scan('page', { id: pg.id, name: pg.name, index: i }, pg.items); });
    (Array.isArray(m.popups) ? m.popups : []).forEach((pp, i) => {
      if (!isObj(pp)) return;
      scan('popup', { id: pp.id, name: pp.name, index: i }, pp.items);
      const c = isObj(pp.config) ? pp.config : null; if (!c) return;
      const base = { where: 'popup-settings', ownerId: pp.id, ownerName: pp.name || pp.id, item: null, type: 'popup', name: pp.name || pp.id };
      const add = (kind, label, key, get, set, clear) => { const ref = get(); if (typeof ref === 'string' && ref) out.push({ ...base, kind, label, ref, path: `popups[${i}] config.${key}`, set, clear }); };
      if (c.backButton && c.backAction === 'popup') add('popup', 'Back opens a popup', 'backPopup', () => c.backPopup, (v) => { c.backPopup = v; }, () => { c.backAction = 'history'; delete c.backPopup; });
      if (c.backButton && c.backAction === 'navigate') add('page', 'Back opens a page', 'backPage', () => c.backPage, (v) => { c.backPage = v; }, () => { c.backAction = 'history'; delete c.backPage; });
      if (c.menu === 'popup') add('popup', 'Menu opens a popup', 'menuPopup', () => c.menuPopup, (v) => { c.menuPopup = v; }, () => { c.menu = 'none'; delete c.menuPopup; });
      if (c.menu === 'navigate') add('page', 'Menu opens a page', 'menuPage', () => c.menuPage, (v) => { c.menuPage = v; }, () => { c.menu = 'none'; delete c.menuPage; });
    });
    const N = isObj(m.notifications) ? m.notifications : null;
    if (N && Array.isArray(N.rules)) N.rules.forEach((r, i) => {
      if (!isObj(r) || typeof r.template !== 'string') return;
      out.push({ where: 'rule', ownerId: r.id, ownerName: `Notification rule ${i + 1}`, item: null, type: 'rule', name: `Rule ${i + 1}`, kind: 'template', label: 'Shows a notification template',
        ref: r.template, path: `notifications.rules[${i}].template`, set: (v) => { r.template = v; }, clear: () => { N.rules = N.rules.filter((x) => x !== r); } });
    });
    return out;
  }
  /** LAYOUT that runs past the right edge of its grid ("x + w goes past column N"): found by the validator itself; fix() moves the item
      left so it fits (narrower only when it is wider than the grid). The kind of repair the editor's own reflow would make. */
  function layoutIssues(m, registry) {
    if (!isObj(m) || !registry) return [];
    const v = validate(structuredClone(m), registry);
    if (v.ok) return [];
    const out = [];
    v.errors.forEach((e) => {
      const r = /^(pages|popups)\[(\d+)\]\.items\[(\d+)\]\.layout\.(\w+): x \+ w goes past column (\d+)$/.exec(e);
      if (!r) return;
      const owner = (m[r[1]] || [])[Number(r[2])], it = owner && owner.items && owner.items[Number(r[3])], bp = r[4], cols = Number(r[5]);
      const L = it && isObj(it.layout) && isObj(it.layout[bp]) ? it.layout[bp] : null;
      if (!L) return;
      const c = isObj(it.config) ? it.config : {};
      out.push({ kind: 'layout', where: r[1] === 'pages' ? 'page' : 'popup', ownerId: owner.id, ownerName: owner.name || owner.id, item: it.id, type: it.type, name: String(c.name || c.title || c.text || it.id).slice(0, 60),
        label: `${bp[0].toUpperCase()}${bp.slice(1)} position`, ref: `columns ${L.x}–${L.x + L.w - 1} of ${cols}`, path: `${r[1]}[${r[2]}].items[${r[3]}].layout.${bp}`,
        fix: () => { if (L.w > cols) L.w = cols; L.x = Math.max(1, cols - L.w + 1); } });
    });
    return out;
  }
  /** the references whose target does not exist in this dashboard */
  function brokenReferences(m) {
    if (!isObj(m)) return [];
    const ids = (list) => new Set((Array.isArray(list) ? list : []).filter(isObj).map((x) => x.id));
    const P = ids(m.popups), G = ids(m.pages), T = ids(isObj(m.notifications) ? m.notifications.templates : []);
    return references(m).filter((r) => !(r.kind === 'popup' ? P : r.kind === 'page' ? G : T).has(r.ref));
  }

  global.MaisonModel = { GRID_LIMITS, GRID_LEGACY, gridLimits, rescale, normalizeNested, nestedOnPage, MOVED_ASSETS, VERSION, BACKGROUNDS, BREAKPOINTS: BPS, DOCK, DOCK_DEFAULT, ID, validate, parse, serialize, LocalStore, MIGRATIONS, references, brokenReferences, layoutIssues };
})(window);
