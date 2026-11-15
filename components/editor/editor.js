/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Dashboard Editor V2 — a visual dashboard designer layered OVER the existing system.
   The dashboard is rendered by MaisonGrid + MaisonContainer + the widgets (MaisonRegistry);
   the editor only changes the model (MaisonModel v1) and calls MaisonGrid.update(itemEl, patch).
   There is no second grid: every geometry comes from the Grid, every breakpoint from
   MaisonGrid.breakpointOf().

   MaisonEditor.create({ mount, initial, demo, store, status, breakpoint }) → api
     initial  validated model        demo  () → demo model (Reset)
     store    { load, save, clear, loadDraft, saveDraft, clearDraft }  (MaisonModel.LocalStore — or, on the IniqDash
              server, IniqServerStore: async load / save, server-authoritative, revision-checked)
     dashboards  (server only) { list, get, create, rename, duplicate, remove, message, open(id) } — Dashboards… dialog
     legacy      (server only) [{ key, label, text }] dashboards saved in THIS browser before server storage
     onSaved(entry) / onRenamed(entry)   the host updates its header / URL

   Model changes all go through mutate(label, fn): one completed operation (a whole drag, a whole
   resize, an Apply, a duplicate…) = one history entry (MaisonHistory). Undo/redo restore exact
   model snapshots. "Unsaved changes" = the model differs from the last saved (or loaded) text.
   Unsaved edits are mirrored to a RECOVERY DRAFT (never to the saved configuration).

   Breakpoints: the canvas is a frame per breakpoint (desktop 1200–1280 · tablet 740–780 · mobile
   320–390); wide frames are scaled (CSS transform — breakpointOf() reads the layout width, so the
   scale never changes the breakpoint). A NESTED grid has its own breakpoint (its container's width).
   Only the layout entry of the breakpoint being edited is written; other breakpoints that were
   borrowing from it are frozen first.

   Collision policy: REJECT. A drop/resize that would overlap snaps back with a message.
   Cross-grid drag: drag a widget onto a container → into its nested grid; drag a nested widget
   outside its container → onto the dashboard. Containers stay on the dashboard (one nesting level).
   ========================================================================== */
(function (global) {
  'use strict';

  const G = global.MaisonGrid, R = global.MaisonRegistry, M = global.MaisonModel;
  const KEYS = ['desktop', 'tablet', 'mobile'];
  const COLS = { desktop: 12, tablet: 8, mobile: 4 };
  const BP_LABEL = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };
  // frame width range per breakpoint: the frame takes the available width within the range (so a
  // phone shows the mobile layout at 100%); wider-than-available frames are scaled down
  const FRAME = { desktop: [1200, 1280], tablet: [740, 780], mobile: [320, 390] };
  const EST_W = { desktop: 1200, tablet: 748, mobile: 358 };   // typical grid widths (size estimates)
  /* preview devices (exact CSS viewports). These are PREVIEW sizes, not breakpoints: the breakpoint is
     always derived from the real grid width at that size, exactly as on the device. */
  const DEVICES = {
    desktop: [{ name: 'Desktop 1920', w: 1920, h: 1080 }, { name: 'Laptop 1366', w: 1366, h: 768 }],
    tablet: [{ name: 'Tablet 1280', w: 1280, h: 800 }, { name: 'Tablet 1024', w: 1024, h: 768 }, { name: 'Tablet 960', w: 960, h: 600 }, { name: 'Tablet 768 portrait', w: 768, h: 1024 }, { name: 'Tablet 600 portrait', w: 600, h: 960 }],
    mobile: [{ name: 'Phone 430', w: 430, h: 932 }, { name: 'Phone 390', w: 390, h: 844 }, { name: 'Phone 360', w: 360, h: 800 }],
  };
  const MULTI_DEFAULT = [{ name: 'Tablet landscape', w: 1024, h: 768 }, { name: 'Tablet portrait', w: 768, h: 1024 }, { name: 'Mobile', w: 390, h: 844 }];
  const PREFS_KEY = 'iniqdash.editor.preview';      // per-viewer editor preferences — never part of a dashboard
  const keyForWidth = (w) => (w >= 960 ? 'desktop' : w >= 560 ? 'tablet' : 'mobile');   // = MaisonGrid thresholds
  const orientOf = (w, h) => (w >= h ? 'landscape' : 'portrait');

  const h = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => c !== null && c !== undefined && n.append(c));
    return n;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const pickC = (c, key) => (c && typeof c === 'object' ? c[key] : c);
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const sameCell = (a, b) => a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const typing = (t) => !!(t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]'));

  function create(opts) {
    const store = opts.store;
    const A = global.MaisonApp;
    let app = opts.initial;                    // the whole application configuration (version 2: pages)
    let model = null;                          // the page being shown / edited (an object inside app.pages)
    let savedText = opts.unsaved ? '' : M.serialize(app);   // the last saved / loaded / baseline configuration ('' : opened unsaved, e.g. repaired)
    /* dashboard grid geometry (app.grid): null = the legacy grid (no CSS variables at all — exactly the grid as it
       always was). It applies to the PAGE grid only: containers' nested grids and popups keep the legacy geometry. */
    const gridGeo = () => {
      const g = app && app.app && app.app.grid;
      return g ? Object.fromEntries(KEYS.map((k) => [k, { ...G.LEGACY[k], ...(g[k] || {}) }])) : null;
    };
    /** app.grid.popups 'page': the nested grids inside POPUPS share the page rows and gaps (null: their legacy rows) */
    const popupGrid = () => { const g = app && app.app && app.app.grid; return g && g.popups === 'page' ? gridGeo() : null; };
    /** the geometry of the grid that holds items of `pid` (null = a page) — null for nested grids and popups */
    /** a CONTAINER's (or tabbed container's) span in columns per breakpoint = its nested grid's columns (find: the item lookup; top:
        the geometry of the grid it sits on when it has no parent) */
    const nestable = (x) => !!x && (x.type === 'container' || x.type === 'tabs');
    function spansOf(it, find = byId, top = !designingPopup() ? gridGeo() : null, depth = 0) {
      const par = it.parent ? find(it.parent) : null;
      const g = par ? (nestable(par) && depth < 8 ? G.spanGeo(spansOf(par, find, top, depth + 1)) : null) : top;
      return Object.fromEntries(['desktop', 'tablet', 'mobile'].map((bp) => [bp, G.resolve({ layout: it.layout || {}, constraints: {} }, bp, g).w]));
    }
    /** the PAGE geometry a container's nested grid shares (its rows and gaps — app.grid.nested 'page'): a container / tabbed container
        on a page grid (directly, or inside such a container) of a dashboard with a dashboard grid; null = the legacy nested grid
        (legacy dashboards, popups, a container on a Floating Container's free surface). page: the item belongs to a page (not a popup). */
    function boxRows(box, find = byId, page = !designingPopup()) {
      const g = page ? gridGeo() : popupGrid();
      if (!g) return null;
      let p = box;
      for (let d = 0; p && d < 9; d++) { if (!nestable(p)) return null; if (!p.parent) return g; p = find(p.parent); }
      return null;
    }
    /** the geometry an item is placed on: the page grid (top level) · a container's nested grid (its span as columns, the page's rows —
        G1) · legacy */
    const geoOf = (pid) => { if (!pid) return !designingPopup() ? gridGeo() : null; const p = byId(pid); return nestable(p) ? G.spanGeo(spansOf(p), boxRows(p)) : null; };
    /** a layout's rows written for the grid of `fromPid` → rows of the grid of `toPid` (same physical height) */
    const convertSizes = (sizes, fromPid, toPid) => {
      const a = geoOf(fromPid), b = geoOf(toPid);
      if (a === b || (!a && !b)) return sizes;
      return Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, { ...v, h: G.convertRows(v.h, k, a, b) }]));
    };
    /** page-grid columns at a breakpoint */
    const colsOf = (k) => { const g = gridGeo(); return g ? g[k].cols : COLS[k]; };
    let editing = false;
    let cornerLayer = null;                   // the fixed layer of the radials pinned to a screen corner (viewing only)
    // the application's viewing mode (opts.viewer) and how its Edit control appears ('corner' | 'always' — the application setting)
    const viewer = !!opts.viewer;
    let editButton = opts.editButton === 'always' ? 'always' : 'corner';
    let frameBp = opts.breakpoint || 'desktop';
    let selected = null;
    // MULTI-SELECTION (Shift / Ctrl / ⌘ + click): extra items of the SAME grid as the selected one, worked on together (align, distribute,
    // same size, move with the arrow keys, remove) — always at the screen size being edited, as one undo step
    const msel = new Set();
    let scale = 1;
    /* preview state (editor-only, stored in this browser, never in the dashboard):
       mode 'auto' = the classic breakpoint frame that fits the editor (Desktop / Tablet / Mobile buttons);
       mode 'exact' = an exact CSS viewport w × h (presets, Custom, scrubber). zoom: 'fit' | 0.5 | 0.75 | 1. */
    const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { return {}; } };
    const prefs0 = loadPrefs();
    let pv = { mode: 'auto', w: 1024, h: 768, name: '', zoom: 'fit', ...(prefs0.pv && prefs0.pv.mode === 'exact' && !opts.breakpointForced ? prefs0.pv : {}), ...(prefs0.pv ? { zoom: prefs0.pv.zoom || 'fit' } : {}) };
    /** "Current browser window" (formerly labelled "Current screen"): the browser viewport this editor runs in, in CSS px (window.innerWidth × innerHeight) —
        what a dashboard opened full-window in this browser gets. Not the monitor resolution, not the browser's
        outer size, never the scaled preview. The ONE definition shared by the Current screen preview size and
        Full screen › Use current screen. */
    const screenSize = () => ({ w: Math.round(window.innerWidth), h: Math.round(window.innerHeight) });
    if (pv.mode === 'exact' && pv.screen) pv = { ...pv, ...screenSize(), name: 'Current browser window' };      // remembered choice → re-detected
    let userPresets = Array.isArray(prefs0.presets) ? prefs0.presets.filter((p) => p && typeof p.name === 'string' && p.w > 0 && p.h > 0) : [];
    let multiOn = !!prefs0.multi, minis = Array.isArray(prefs0.minis) && prefs0.minis.length ? prefs0.minis : MULTI_DEFAULT.map((d) => ({ ...d }));
    let fs = null;                   // Full-Screen TEST mode: { kind: 'preview' | 'screen', w, h, … } (see enterFullScreen)
    let scrubbing = null;            // { scale } while the width scrubber is dragged (the zoom is held still)
    /* design aids (editor preferences of this browser — never part of a dashboard or its export):
       grid = the dot grid, snap = Snap to Grid, guides = crosshair + X / Y / W / H + alignment guides */
    const aid = { grid: true, snap: true, guides: true, ...(prefs0.aids && typeof prefs0.aids === 'object' ? Object.fromEntries(['grid', 'snap', 'guides'].filter((k) => typeof prefs0.aids[k] === 'boolean').map((k) => [k, prefs0.aids[k]])) : {}) };
    function savePrefs() {
      try { localStorage.setItem(PREFS_KEY, JSON.stringify({ pv, presets: userPresets, multi: multiOn, minis, aids: aid })); } catch (e) { /* storage unavailable */ }
    }
    let drag = null;
    let clipboard = null;                      // editor-internal copy (no system clipboard needed)
    let styleClip = null;                      // Copy style: { type, style } — corners + theme only (R.styleOf)
    const history = global.MaisonHistory.create({ limit: 100 });
    const recs = new Map();                    // id → { id, item (model), el (.mg__item), gridRoot, nested? }

    /* ================================================================== pages: ONE navigator for everything
       The Navigation Dock, a Radial Action Menu "navigate" segment and the editor's page picker all
       call nav.go(pageId, source); onChange shows that page. The active page is editor/app state
       only — it is never saved. */
    const pageById = (id) => app.pages.find((p) => p.id === id);
    const popupById = (id) => (app.popups || []).find((p) => p.id === id);
    const allItems = () => [...app.pages.flatMap((p) => p.items), ...(app.popups || []).flatMap((p) => p.items)];
    const nav = A.createNavigator({ pages: () => app.pages, start: app.app.startPage, onChange: (id, prev, source) => showPage(id, source) });
    /** what the canvas designs: the current page, or a popup's content (same item model) */
    let design = { kind: 'page' };
    const designingPopup = () => design.kind === 'popup' && !!popupById(design.id);
    function bindPage() {
      if (!pageById(nav.current())) nav.reset(app.app.startPage);
      if (design.kind === 'popup' && !popupById(design.id)) design = { kind: 'page' };
      model = designingPopup() ? popupById(design.id) : pageById(nav.current());
      // schema rules that refer to application definitions (navigate / open popup targets…)
      R.context = { pages: app.pages.map((p) => ({ id: p.id, name: p.name })), popups: (app.popups || []).map((p) => ({ id: p.id, name: p.name })), templates: ((app.notifications || {}).templates || []).map((t) => ({ id: t.id, name: t.name })) };
    }
    bindPage();
    /* ================================================================== application runtime: the shared
       action dispatcher, the popup host and the notification system, all on ONE screen layer that covers
       the (simulated) device screen — the preview frame, scaled like it. */
    let screen = null, noteScreen = null, popupHost = null, detailsHost = null, notes = null, events = null, rulesEngine = null;
    const actions = A.createActions({ navigator: nav, notify: (t) => say(t), openPopup: (id) => openPopupById(id) });
    /* ENTITY DETAILS (system surface): a widget asks { type: 'details', entity, info, label } — through the same dispatcher, so the
       configuration preview and edit mode never open it. It is shown by its OWN host instance on the same screen layer, ABOVE
       any user popup (which stays open underneath), and is generated from the entity: never stored, exported or listed. */
    actions.register('details', (a) => openDetails(a));
    function openDetails(a) {
      if (!a || typeof a.entity !== 'string' || !global.IniqHA?.enabled?.() || !global.IniqHADetails || !detailsHost) { say('Entity details need a linked Home Assistant entity'); return false; }
      const e = global.IniqHA.get(a.entity);
      return detailsHost.open({ id: 'iq-details', name: 'Entity details', payload: a, config: {
        title: (e && e.name) || a.label || a.entity, size: 'custom', custom: { desktop: { w: 620, h: 760 }, tablet: { w: 560, h: 760 } },
        closeButton: true, backdrop: true, outsideClose: true, escClose: true, enter: 'scale', exit: 'fade', speed: 'fast' } });
    }
    const closeDetails = () => { if (detailsHost && detailsHost.current()) detailsHost.close('api'); };
    function openPopupById(id) {
      const def = popupById(id);
      if (!def || !popupHost) return false;
      return popupHost.open({ ...def, config: R.fullConfig('popup', def.config) });
    }

    /* ================================================================== DOM: toolbar */
    const status = h('span', { class: 'ed-status', role: 'status', 'aria-live': 'polite' });
    // Edit → (editing) Done: Done SAVES the dashboard and then leaves edit mode (a failed save keeps you editing)
    const btnEdit = h('button', { type: 'button', class: 'ed-btn ed-btn--edit', 'aria-pressed': 'false', title: 'Edit this dashboard', onclick: () => (editing ? done() : setEditing(true)) }, [svg('pen'), h('span', { text: 'Edit' })]);
    const bpGroup = h('div', { class: 'ed-seg', role: 'group', 'aria-label': 'Breakpoint being previewed and edited' },
      KEYS.map((k) => h('button', { type: 'button', class: 'ed-seg__b', 'data-bp': k, 'aria-pressed': 'false', 'aria-label': `${BP_LABEL[k]} · ${colsOf(k)} columns`, onclick: () => setBreakpoint(k) }, [svg(k), h('span', { text: BP_LABEL[k] })])));
    const pageSel = h('select', { class: 'ed-page-sel', 'aria-label': 'Page being shown and edited', onchange: (e) => nav.go(e.target.value, 'editor') });
    const btnPages = h('button', { type: 'button', class: 'ed-btn ed-btn--pages', title: 'Pages and navigation', onclick: () => openPages() }, [svg('pages'), h('span', { text: 'Pages' })]);
    const pageBox = h('div', { class: 'ed-pagebox', role: 'group', 'aria-label': 'Pages' }, [pageSel, btnPages]);
    const btnAdd = h('button', { type: 'button', class: 'ed-btn ed-btn--primary ed-only-edit', onclick: () => openAdd() }, [svg('plus'), h('span', { text: 'Add' })]);
    const btnUndo = h('button', { type: 'button', class: 'ed-btn ed-btn--icon ed-only-edit', 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', onclick: () => undo() }, svg('undo'));
    const btnRedo = h('button', { type: 'button', class: 'ed-btn ed-btn--icon ed-only-edit', 'aria-label': 'Redo', title: 'Redo (Ctrl+Shift+Z)', onclick: () => redo() }, svg('redo'));
    const btnGrid = h('button', { type: 'button', class: 'ed-seg__b ed-btn--aid', 'aria-pressed': 'true', 'aria-label': 'Show grid', title: 'Show grid — the dots mark the design grid', 'data-k': 'aid-grid', onclick: () => toggleOverlay() }, [svg('dots'), h('span', { text: 'Grid' })]);
    const btnSnap = h('button', { type: 'button', class: 'ed-seg__b ed-btn--aid', 'aria-pressed': 'true', 'aria-label': 'Snap to grid', title: 'Snap to Grid — on: items jump from cell to cell; off: they follow the pointer freely and land on the nearest cell (hold Alt to switch while dragging)', 'data-k': 'aid-snap', onclick: () => setAid('snap', !aid.snap) }, [svg('magnet'), h('span', { text: 'Snap' })]);
    const btnGuides = h('button', { type: 'button', class: 'ed-seg__b ed-btn--aid', 'aria-pressed': 'true', 'aria-label': 'Position guides', title: 'Position guides — crosshair, X / Y / W / H and alignment with nearby items while moving or resizing', 'data-k': 'aid-guides', onclick: () => setAid('guides', !aid.guides) }, [svg('cross'), h('span', { text: 'Guides' })]);
    const aidBox = h('div', { class: 'ed-seg ed-aidbox ed-only-edit', role: 'group', 'aria-label': 'Design aids' }, [btnGrid, btnSnap, btnGuides]);
    const btnSettings = h('button', { type: 'button', class: 'ed-btn ed-btn--icon', 'aria-label': 'Dashboard settings', title: 'Dashboard settings', onclick: () => openSettings() }, svg('gear'));
    // Save keeps you editing; the dot / colour on it and the status text show unsaved changes
    const btnSave = h('button', { type: 'button', class: 'ed-btn ed-btn--save', title: 'Save the dashboard and keep editing', onclick: () => save() }, [svg('save'), h('span', { text: 'Save' })]);
    // Revert = back to the LAST SAVED dashboard (unsaved changes are discarded: confirmed when there are any)
    const btnLoad = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'revert', title: 'Discard unsaved changes and go back to the last saved dashboard',
      onclick: () => (isDirty() ? confirmStep(btnLoad, 'Discard changes?', load) : load()) }, h('span', { text: 'Revert to last save' }));
    // Reset = back to the BUILT-IN dashboard; it also erases the copy saved in this browser (always confirmed)
    const btnReset = store.server
      // server storage: the built-in sample only REPLACES what the editor shows (not saved; nothing is erased)
      ? h('button', { type: 'button', class: 'ed-btn ed-btn--danger', 'data-k': 'reset', title: 'Replace what you see with the built-in sample dashboard. Nothing is saved or deleted until you press Save.',
        onclick: () => confirmStep(btnReset, 'Confirm: replace with sample', reset) }, h('span', { text: 'Replace with built-in sample…' }))
      : h('button', { type: 'button', class: 'ed-btn ed-btn--danger', 'data-k': 'reset', title: 'Replace everything with the built-in dashboard and erase the copy saved in this browser',
        onclick: () => confirmStep(btnReset, 'Confirm: erase and reset', reset) }, h('span', { text: 'Reset to built-in dashboard…' }));
    const btnExport = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'export', onclick: openExport }, h('span', { text: 'Export…' }));
    const btnPopups = h('button', { type: 'button', class: 'ed-btn ed-btn--popups', onclick: () => openPopups() }, h('span', { text: 'Popups' }));
    const btnNotes = h('button', { type: 'button', class: 'ed-btn ed-btn--notes', onclick: () => openNotifications() }, h('span', { text: 'Notifications' }));
    // WIDGET STUDIO (proof of concept): compose a widget from the shared components (components/studio)
    const btnStudio = h('button', { type: 'button', class: 'ed-btn ed-btn--studio ed-only-edit', 'data-k': 'studio', title: 'Widget Studio — compose a widget from IniqDash components', onclick: () => openStudio() }, h('span', { text: 'Widget Studio' }));
    const btnImport = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'import', onclick: openImport }, h('span', { text: 'Import…' }));
    // server storage: all dashboards on this IniqDash server (new, open, rename, duplicate, delete)
    const btnDash = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'dashboards', title: 'Your dashboards on this IniqDash server: new, open, rename, duplicate, delete', onclick: () => openDashboards() }, h('span', { text: 'Dashboards…' }));
    // Settings → Home Assistant connection (server-side settings; only when IniqDash runs on its server)
    const onServer = document.querySelector('meta[name="iniqdash-server"]')?.content === '1';
    const btnHa = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'ha-settings', title: 'Settings: the Home Assistant address and access token (stored on the server)', onclick: () => openHaSettings() }, h('span', { text: 'Home Assistant connection…' }));
    const btnAbout = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'about', title: 'About INIQDASH: version, licence, documentation', onclick: () => openAbout() }, h('span', { text: 'About INIQDASH…' }));
    const draftBar = h('div', { class: 'ed-draft', role: 'region', 'aria-label': 'Recovery draft', hidden: true });

    /* ---- Preview Studio bar ---- */
    const pvDevice = h('select', { class: 'ed-pv__device', 'aria-label': 'Preview device', 'data-k': 'pv-device', onchange: (e) => pickDevice(e.target.value) });
    const pvW = h('input', { type: 'number', min: '240', max: '3840', step: '1', class: 'ed-pv__num', 'aria-label': 'Viewport width (CSS px)', 'data-k': 'pv-w', onchange: () => setViewport(Number(pvW.value), Number(pvH.value), 'Custom') });
    const pvH = h('input', { type: 'number', min: '240', max: '3840', step: '1', class: 'ed-pv__num', 'aria-label': 'Viewport height (CSS px)', 'data-k': 'pv-h', onchange: () => setViewport(Number(pvW.value), Number(pvH.value), 'Custom') });
    const pvRotate = h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'pv-rotate', 'aria-label': 'Rotate (portrait / landscape)', title: 'Swap width and height', onclick: () => rotate() }, h('span', { text: 'Rotate' }));
    const pvZoom = h('div', { class: 'ed-seg ed-pv__zoom', role: 'group', 'aria-label': 'Preview zoom (visual only)' }, [['fit', 'Fit'], [0.5, '50%'], [0.75, '75%'], [1, '100%']].map(([z, l]) => h('button', {
      type: 'button', class: 'ed-seg__b', 'data-zoom': String(z), 'aria-pressed': 'false', onclick: () => setZoom(z) }, h('span', { text: l }))));
    const pvScrub = h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'pv-scrub', 'aria-pressed': 'false', title: 'Drag the width continuously to find where a layout breaks', onclick: () => toggleScrub() }, h('span', { text: 'Width scrubber' }));
    const pvRange = h('input', { type: 'range', min: '320', max: '1920', step: '1', class: 'ed-pv__range', 'aria-label': 'Preview width (CSS px)', 'data-k': 'pv-range', hidden: true,
      oninput: () => setViewport(Number(pvRange.value), pv.h, 'Scrubbed', { live: true }), onchange: () => savePrefs() });
    const pvMulti = h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'pv-multi', 'aria-pressed': 'false', onclick: () => setMulti(!multiOn) }, h('span', { text: 'Multi preview' }));
    const pvSave = h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'pv-save', onclick: () => openPresetDialog() }, h('span', { text: 'Save preset…' }));
    const pvInfo = h('p', { class: 'ed-pv__info', role: 'status', 'aria-live': 'polite', 'data-k': 'pv-info' });
    // Full-Screen TEST mode: the dashboard alone, to use it as a user would (no editing)
    const fsMenu = h('div', { class: 'ed-fsmenu', id: 'ed-fs-menu', role: 'menu', hidden: true }, [
      h('button', { type: 'button', role: 'menuitem', class: 'ed-fsmenu__b', 'data-k': 'fs-preview', onclick: () => enterFullScreen('preview') }, [h('b', { text: 'Selected preview size' }), h('small', { 'data-k': 'fs-preview-size' })]),
      h('button', { type: 'button', role: 'menuitem', class: 'ed-fsmenu__b', 'data-k': 'fs-screen', onclick: () => enterFullScreen('screen') }, [h('b', { text: 'Use this browser window' }), h('small', { text: 'Its current size (the visible page area)' })]),
    ]);
    const pvFs = h('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--fs', 'data-k': 'pv-fs', 'aria-expanded': 'false', 'aria-controls': 'ed-fs-menu', title: 'Test the dashboard full screen (no editing)',
      onclick: () => setFsMenu(fsMenu.hidden) }, h('span', { text: 'Full screen' }));
    const fsWrap = h('div', { class: 'ed-fswrap' }, [pvFs, fsMenu]);
    function setFsMenu(open) {
      fsMenu.hidden = !open; pvFs.setAttribute('aria-expanded', String(open));
      if (open) { fsMenu.querySelector('[data-k="fs-preview-size"]').textContent = `${parseFloat(frame.style.width)} × ${parseFloat(frame.style.height)} — scaled to fit`; fsMenu.querySelector('button').focus(); }
    }
    document.addEventListener('pointerdown', (e) => { if (!fsMenu.hidden && !fsWrap.contains(e.target)) setFsMenu(false); });
    fsMenu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setFsMenu(false); pvFs.focus(); } });
    const pbar = h('div', { class: 'ed-pv', role: 'region', 'aria-label': 'Responsive preview' }, [
      h('span', { class: 'ed-pv__label', text: 'Preview' }), pvDevice,
      h('span', { class: 'ed-pv__size' }, [pvW, h('span', { 'aria-hidden': 'true', text: '×' }), pvH]), pvRotate, pvZoom, pvScrub, pvRange, pvMulti, pvSave, fsWrap, pvInfo,
    ]);

    // occasional dashboard-file operations live in "More"; the destructive Reset is last, apart
    const btnThemes = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'themes', title: 'Create, edit, apply, export and import themes', onclick: () => openThemes() }, h('span', { text: 'Themes…' }));
    const moreMenu = h('div', { class: 'ed-more__menu', id: 'ed-more-menu', role: 'menu' }, [...(opts.dashboards ? [btnDash, h('span', { class: 'ed-more__sep', 'aria-hidden': 'true' })] : []), btnThemes, h('span', { class: 'ed-more__sep', 'aria-hidden': 'true' }), btnLoad, btnExport, btnImport, ...(onServer ? [h('span', { class: 'ed-more__sep', 'aria-hidden': 'true' }), btnHa] : []), h('span', { class: 'ed-more__sep', 'aria-hidden': 'true' }), btnReset, h('span', { class: 'ed-more__sep', 'aria-hidden': 'true' }), btnAbout]);
    const btnMore = h('button', { type: 'button', class: 'ed-btn ed-more__btn', 'data-k': 'more', 'aria-expanded': 'false', 'aria-controls': 'ed-more-menu', title: 'Revert, export, import, reset', onclick: () => setMore(btnMore.getAttribute('aria-expanded') !== 'true') }, [h('span', { text: 'More' }), svg('down')]);
    const more = h('div', { class: 'ed-more' }, [btnMore, moreMenu]);
    function setMore(open) {
      btnMore.setAttribute('aria-expanded', String(open)); more.classList.toggle('is-open', open);
      if (open) (moreMenu.querySelector('button:not([hidden])') || moreMenu.firstChild).focus();
    }
    // a click closes the menu — except one that only armed a confirmation (Revert with changes, Reset)
    moreMenu.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !b.classList.contains('is-armed')) setMore(false); });
    document.addEventListener('pointerdown', (e) => { if (more.classList.contains('is-open') && !more.contains(e.target)) setMore(false); });
    more.addEventListener('keydown', (e) => { if (e.key === 'Escape' && more.classList.contains('is-open')) { e.preventDefault(); e.stopPropagation(); setMore(false); btnMore.focus(); } });
    const bar = h('div', { class: 'ed-bar' }, [
      h('div', { class: 'ed-bar__main' }, [btnEdit, bpGroup, pageBox, btnAdd, h('span', { class: 'ed-bar__sep ed-only-edit', 'aria-hidden': 'true' }),
        h('span', { class: 'ed-bar__hist ed-only-edit', role: 'group', 'aria-label': 'History' }, [btnUndo, btnRedo]), aidBox]),   // Undo + Redo never wrap apart
      h('div', { class: 'ed-bar__file', role: 'group', 'aria-label': 'Dashboard configuration' }, [status, btnSave, btnSettings, btnPopups, btnNotes, btnStudio, more]),
    ]);

    /* ================================================================== DOM: canvas, layer, panel */
    const title = h('h2', { class: 'ed-dash-title' });
    const subtitle = h('p', { class: 'ed-dash-sub' });
    const slot = h('div', { class: 'ed-slot' });
    const designBar = h('div', { class: 'ed-designbar', hidden: true });
    const canvas = h('div', { class: 'ed-canvas' }, [h('header', { class: 'ed-dash-head' }, [title, subtitle, designBar]), slot]);
    // the application shell: Navigation Dock on its configured edge, the dashboard in the rest
    const dock = A.createDock({ label: 'Dashboard pages', onNavigate: (id) => nav.go(id, 'dock') });
    const shell = A.createShell({ dock, content: canvas, navigation: app.app.navigation });
    const frame = h('div', { class: 'ed-frame' }, [shell]);
    // a Studio widget's element with "On tap: open page" (widgets/default/studio): switch pages — on the dashboard, never while editing it
    frame.addEventListener('iq-studio-navigate', (e) => { if (!editing && e.detail && typeof e.detail.page === 'string') nav.go(e.detail.page, 'widget'); });
    const frameLabel = h('span', { class: 'ed-frame-label', 'aria-hidden': 'true' });
    /* the selection: outline, name tag, a move grip and 8 resize handles (corners: width + height; edges: one dimension).
       They live in the unscaled overlay layer, so they keep the same on-screen size at every preview zoom. */
    const HANDLES = { nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize' };
    const HANDLE_NAME = { nw: 'top-left', n: 'top', ne: 'top-right', e: 'right', se: 'bottom-right', s: 'bottom', sw: 'bottom-left', w: 'left' };
    const selBox = h('div', { class: 'ed-sel', hidden: true }, [
      h('span', { class: 'ed-sel__tag' }),
      h('button', { type: 'button', class: 'ed-sel__move', 'aria-label': 'Drag to move', tabindex: '-1' }, svg('move')),
      ...Object.keys(HANDLES).map((dir) => h('button', { type: 'button', class: `ed-sel__h ed-sel__h--${dir}`, 'data-dir': dir, 'aria-label': `Drag to resize (${HANDLE_NAME[dir]})`, title: `Resize (${HANDLE_NAME[dir]})`, tabindex: '-1', style: `cursor: ${HANDLES[dir]}` })),
    ]);
    // position aids while moving / resizing (overlay layer, never under the pointer): crosshair + X / Y / W / H
    const crossH = h('div', { class: 'ed-cross ed-cross--h', hidden: true }), crossV = h('div', { class: 'ed-cross ed-cross--v', hidden: true });
    const dims = h('div', { class: 'ed-dims', hidden: true });
    const parentBox = h('div', { class: 'ed-parent', hidden: true });
    const targetBox = h('div', { class: 'ed-target', hidden: true }, h('span', { class: 'ed-target__tag' }));
    const ghost = h('div', { class: 'ed-ghost', hidden: true });
    const toast = h('p', { class: 'ed-toast', role: 'alert', hidden: true });
    const aids = h('div', { class: 'ed-aids', 'aria-hidden': 'true' });     // alignment guides + conflict marks while dragging
    const layer = h('div', { class: 'ed-layer' }, [parentBox, targetBox, crossH, crossV, aids, ghost, selBox, dims]);
    const fold = h('div', { class: 'ed-fold', 'aria-hidden': 'true', hidden: true }, h('span', {}));
    frame.append(fold);
    const scrubHandle = h('button', { type: 'button', class: 'ed-scrub', hidden: true, 'aria-label': 'Drag to change the preview width', title: 'Drag to change the preview width' }, h('span', {}));
    const stage = h('div', { class: 'ed-stage' }, [frameLabel, frame, scrubHandle, layer, toast]);

    const panel = h('aside', { class: 'ed-panel ed-only-edit', 'aria-label': 'Inspector' });
    const multi = h('section', { class: 'ed-multi', 'aria-label': 'Multi preview (live, read-only)', hidden: true });
    const root = h('div', { class: 'ed', 'data-bp': frameBp }, [bar, pbar, draftBar, h('div', { class: 'ed-body' }, [h('div', { class: 'ed-main' }, [stage, multi]), panel])]);
    opts.mount.appendChild(root);
    /* SIMULATED HOME (app.simulated): Home Assistant requests are answered by the server's fictional home (server/ha/SimHa.php), never by
       the configured Home Assistant. Set before any widget subscribes; a visible badge says so at all times (viewing and editing). */
    // the badge is a button: what the simulation is, and the way to a real home (connect Home Assistant) or to editing — never forced
    const simBadge = h('button', { type: 'button', class: 'ed-sim-badge', 'data-k': 'sim-badge', hidden: true, 'aria-haspopup': 'dialog',
      title: 'This dashboard uses a simulated home: no Home Assistant is contacted, and controls change only the simulation. Click for more.', onclick: () => openSimInfo() },
      [h('span', { class: 'ed-sim-badge__dot', 'aria-hidden': 'true' }), h('span', { text: 'Simulated home' })]);
    root.appendChild(simBadge);
    const applySimulated = () => {
      const on = !!(app && app.app && app.app.simulated === true);
      if (global.IniqHA && global.IniqHA.setSimulated) global.IniqHA.setSimulated(on);
      simBadge.hidden = !on;
    };
    applySimulated();

    /* ================================================================== helpers */
    const byId = (id) => model.items.find((i) => i.id === id);
    /* TABBED CONTAINERS (components/tabs): a child belongs to one tab (item.tab; absent = the first tab). The editor edits ONE tab of
       a tabbed container at a time (editTab: editor state only, never stored): its children are "the items of the container" for
       every editing operation (placement, collisions, add, move, paste), so the tabs never collide with each other. */
    const editTab = new Map();
    const isBox = (it) => !!(it && (it.type === 'container' || it.type === 'tabs'));
    const tabsCfg = (it) => R.fullConfig('tabs', it.config).tabs;
    const tabOf = (i, tabs) => (tabs.some((t) => t.id === i.tab) ? i.tab : (tabs[0] && tabs[0].id) || null);
    /** the tab being edited of a tabbed container (a valid one: the remembered choice, else the first) */
    const curTab = (pid) => { const p = byId(pid), tabs = p ? tabsCfg(p) : []; const t = editTab.get(pid); return tabs.some((x) => x.id === t) ? t : (tabs[0] && tabs[0].id) || null; };
    /** every child of an item, whatever its tab */
    const allItemsOf = (pid) => model.items.filter((i) => (i.parent || null) === (pid || null));
    const itemsOf = (pid) => {
      const list = allItemsOf(pid), p = pid && byId(pid);
      if (!p || p.type !== 'tabs') return list;
      const tabs = tabsCfg(p), cur = curTab(pid);
      return list.filter((i) => tabOf(i, tabs) === cur);
    };
    /** an item that joins `pid`: in a tabbed container it joins the tab being edited; anywhere else it has no tab */
    const joinTab = (it, pid) => { const p = pid && byId(pid); if (p && p.type === 'tabs') it.tab = curTab(pid); else delete it.tab; };
    const nameOf = (it) => { const c = it.config || {}; return c.title || c.name || c.location || R.TYPES[it.type].label; };
    const labelOf = (it) => (it ? `${R.TYPES[it.type].label} · ${nameOf(it)}` : '');
    const keyOf = (gridRoot) => (isSurface(gridRoot) ? gridRoot.dataset.bp : G.breakpointOf(gridRoot));   // the ONE breakpoint source
    const isSurface = (n) => !!(n && n.classList && n.classList.contains('mf'));           // a free (px) surface
    const isFloating = (it) => !!(it && it.type === 'floating');
    /** a radial menu set to Float: on Desktop / Tablet its centre button sits on the page's float layer
        (px, scrolls with the dashboard, never takes grid cells); on Mobile it falls back to the grid */
    // (wherever it is placed — page, container or floating container — a Float radial is lifted onto the
    // page's float layer: zero grid footprint, no grid drag, no collision)
    const isFloatRadial = (it) => !!(it && it.type === 'radial' && it.config && it.config.float && design.kind === 'page');
    // a Float radial set to a SCREEN CORNER floats on every screen size; while viewing it stays in that corner of the screen (fixed)
    const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    const cornerOf = (it) => isFloatRadial(it) && CORNERS.includes(it.config.corner) ? it.config.corner : null;
    const floatsNow = (it) => (frameBp !== 'mobile' && isFloatRadial(it)) || !!cornerOf(it);
    /** the items a grid / surface holds at the visible breakpoint (Float radials live on the float layer) */
    const kidsOf = (pid) => itemsOf(pid).filter((x) => !floatsNow(x));
    const FLOAT_DEFAULT = { x: 24, y: 24, w: 88, h: 88 };
    const floatMode = (it) => (it.config && it.config.mobile) || 'structured';
    /** does `pid` (null = the canvas root) hold its children on a free surface at the visible breakpoint? */
    const freeParent = (pid) => isSurface(gridOf(pid));

    function metrics(gridRoot) {
      const inner = gridRoot.firstElementChild, cs = getComputedStyle(inner);
      const cols = parseInt(cs.getPropertyValue('--mg-cols'), 10) || 4;
      const gap = parseFloat(cs.columnGap) || 0, rgap = parseFloat(cs.rowGap) || 0;
      const row = parseFloat(cs.gridAutoRows) || 40;
      return { cols, gap, rgap, row, colStep: (inner.clientWidth + gap) / cols, rowStep: row + rgap, key: keyOf(gridRoot) };
    }
    function cellOf(el, m) {
      return {
        x: Math.round(el.offsetLeft / m.colStep) + 1, y: Math.round(el.offsetTop / m.rowStep) + 1,
        w: Math.round((el.offsetWidth + m.gap) / m.colStep), h: Math.round((el.offsetHeight + m.gap) / m.rowStep),
      };
    }
    /** placement columns of a grid at a breakpoint: the page's 12/8/4, or — inside a container — the
        container's own span at that breakpoint (same rule as .mg--inherit in grid.css) */
    function colsFor(pid, key) {
      const p = pid && byId(pid);
      if (!p) return (geoOf(null) && geoOf(null)[key].cols) || COLS[key];
      if (p.parent && isFloating(byId(p.parent)) || (designingPopup() && !p.parent && key !== 'mobile')) {
        const r = recs.get(pid); if (r && r.free && r.el) return global.MaisonFree.colsFor(frameOfEl(r.el).w);
        const f = (p.frame && (p.frame[key] || p.frame.desktop)) || pxSize(p, key); return global.MaisonFree.colsFor(f.w);
      }
      const pc = colsOf(key);
      const r = G.resolve({ layout: p.layout, constraints: consFor(p, EST_W[key] * (p.layout[key]?.w || pc) / pc) }, key, geoOf(p.parent));
      return clamp(r.w || pc, 1, pc);
    }
    const consFor = (it, px) => R.TYPES[it.type].constraints(R.fullConfig(it.type, it.config), px);
    /** clamp a candidate size to the component's constraints at THAT width (spans change minimums) */
    function clampSize(it, key, m, cand) {
      let note = '';
      const lim = (w) => {
        const c = consFor(it, w * m.colStep - m.gap);
        const geo = geoOf(it.parent);
        return { minW: Math.min(pickC(c.minW, key) || 1, m.cols), maxW: Math.min(pickC(c.maxW, key) || m.cols, m.cols),
          minH: pickC(c.minH, key) ? G.rowsFor(pickC(c.minH, key), key, geo) : 1, maxH: G.rowsFor(pickC(c.maxH, key) || 80, key, geo) };
      };
      let w = cand.w, l = lim(w);
      const maxByX = key === 'mobile' || !cand.x ? m.cols : m.cols - cand.x + 1;
      if (w < l.minW) { w = l.minW; note = `${R.TYPES[it.type].label} needs at least ${w} columns here`; l = lim(w); }
      if (w > Math.min(l.maxW, maxByX)) { w = Math.min(l.maxW, maxByX); note = l.maxW < maxByX ? `${R.TYPES[it.type].label} is at most ${w} columns wide` : 'No more columns available'; l = lim(w); }
      let hh = cand.h;
      if (hh < l.minH) { hh = l.minH; note = `${R.TYPES[it.type].label} needs at least ${hh} rows at this width`; }
      if (hh > l.maxH) { hh = l.maxH; note = `${R.TYPES[it.type].label} is at most ${hh} rows tall`; }
      return { cell: { ...cand, w, h: hh }, note };
    }
    const gridItems = (gridRoot) => [...gridRoot.firstElementChild.children].filter((el) => el.classList.contains('mg__item'));
    /** the cells of a grid's items at this breakpoint — an item HIDDEN at this screen size takes no room here (it never blocks a move) */
    function cellsIn(gridRoot, m, exceptEl) {
      const hk = `data-hide-${{ mobile: 'm', tablet: 't', desktop: 'd' }[m.key]}`;
      return gridItems(gridRoot).filter((el) => el !== exceptEl && !el.hasAttribute(hk)).map((el) => ({ id: el.dataset.gridId, ...cellOf(el, m) }));
    }
    const blocker = (cell, others) => others.find((o) => overlap(cell, o));
    /** nearest free cell to `from` (by distance), scanning a generous area */
    function nearestFree(others, cols, from, w, hh) {
      w = Math.min(w, cols);
      const maxY = Math.max(from.y, ...others.map((o) => o.y + o.h)) + hh + 1;
      let best = null, bd = Infinity;
      for (let y = 1; y <= maxY; y++) for (let x = 1; x <= cols - w + 1; x++) {
        const c = { x, y, w, h: hh };
        if (others.some((o) => overlap(c, o))) continue;
        const d = Math.abs(x - from.x) + Math.abs(y - from.y) * 1.01;
        if (d < bd) { bd = d; best = c; }
      }
      return best || { x: 1, y: maxY, w, h: hh };
    }
    function firstFree(others, cols, w, hh) {
      w = Math.min(w, cols);
      for (let y = 1; y < 500; y++) for (let x = 1; x <= cols - w + 1; x++) { const c = { x, y, w, h: hh }; if (!others.some((o) => overlap(c, o))) return c; }
      return { x: 1, y: 1, w, h: hh };
    }

    /* ---------------- free surfaces (px) ---------------- */
    const FREE_SNAP = 6;                                   // px (surface units) within which guides snap
    const pxOf = (el, k) => Math.round(parseFloat(el.style[k]) || 0);
    const frameOfEl = (el) => ({ x: pxOf(el, 'left'), y: pxOf(el, 'top'), w: pxOf(el, 'width'), h: pxOf(el, 'height') });
    const freeItems = (surface) => [...surface.children].filter((el) => el.classList.contains('mf__item'));
    function framesIn(surface, exceptEl) { return freeItems(surface).filter((el) => el !== exceptEl).map((el) => ({ id: el.dataset.gridId, ...frameOfEl(el) })); }
    const surfaceSize = (surface) => ({ w: Math.round(surface.clientWidth), h: Math.round(surface.clientHeight) });
    /** smallest sensible px size: the component's own minimum (grid units → px at the dashboard geometry) */
    function minPx(it) {
      if (isFloatRadial(it)) return { w: 48, h: 48 };
      const c = consFor(it, 400), minW = pickC(c.minW, frameBp) || 1, minH = pickC(c.minH, frameBp) || 1;
      return { w: Math.max(48, Math.min(minW, 4) * 80 - 12), h: Math.max(40, minH * 40 + (minH - 1) * 12) };
    }
    /** write a free frame at `key`; the paired desktop/tablet frame that was borrowing it is frozen first */
    function writeFrame(it, key, f) {
      it.frame = it.frame || {};
      const pair = key === 'desktop' ? 'tablet' : key === 'tablet' ? 'desktop' : null;
      if (pair && !it.frame[pair] && isFloatRadial(it) && !it.frame[key]) it.frame[pair] = { ...FLOAT_DEFAULT };   // what it showed there
      else if (pair && !it.frame[pair]) {        // the other breakpoint keeps what it showed (it was borrowing)
        const surf0 = recs.get(it.id) && recs.get(it.id).gridRoot;
        const sib = itemsOf(it.parent).filter((x) => x === it || x.frame), surf = isSurface(surf0) ? surf0 : gridOf(it.parent), w = isSurface(surf) ? surfaceSize(surf).w : 1000;
        const was = global.MaisonFree.resolve(sib, pair, w).get(it.id);
        if (was) it.frame[pair] = was;
      }
      it.frame[key] = { x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.w), h: Math.round(f.h) };
    }
    /** before an edit on a free surface: every item gets an explicit frame at this breakpoint (as shown) */
    function pinFree(surface) {
      const key = surface.dataset.bp;
      freeItems(surface).forEach((el) => {
        const it = byId(el.dataset.gridId);
        if (it && !(it.frame && it.frame[key])) writeFrame(it, key, frameOfEl(el));
      });
    }
    /** a free spot for a w × h frame: near `from` if given, else the first one (top-left, 8px steps) */
    function freeSpot(others, size, w, hh, from) {
      const W = Math.max(w, size.w), H = Math.max(size.h, ...others.map((o) => o.y + o.h), 0) + hh + 16;
      let best = null, bd = Infinity;
      for (let y = 0; y <= H; y += 8) for (let x = 0; x + w <= W; x += 8) {
        const c = { x, y, w, h: hh };
        if (others.some((o) => overlap(c, o))) continue;
        if (!from) return c;
        const d = Math.abs(x - from.x) + Math.abs(y - from.y);
        if (d < bd) { bd = d; best = c; }
      }
      return best || { x: 0, y: H, w, h: hh };
    }
    /** grid size (layout) → a px frame size, for an item arriving on a free surface */
    function pxSize(it, key) {
      const r = G.resolve({ layout: it.layout || {}, constraints: {} }, key === 'mobile' ? 'mobile' : key);
      return { w: Math.max(48, Math.round(r.w * 96 - 12)), h: Math.max(40, Math.round(r.h * 52 - 12)) };
    }

    /** before writing layout[key]: other breakpoints that borrow from it get their own entry */
    function freezeOthers(it, key, cons) {
      KEYS.forEach((k) => {
        if (k === key || it.layout[k]) return;
        const r = G.resolve({ layout: it.layout, constraints: cons || {} }, k, geoOf(it.parent));
        it.layout[k] = k === 'mobile' ? { w: r.w, h: r.h } : (r.x && r.y ? { x: r.x, y: r.y, w: r.w, h: r.h } : { w: r.w, h: r.h });
      });
    }
    function writeLayout(rec, key, cell) {
      const it = rec.item;
      freezeOthers(it, key, rec.el.mgItem.constraints);
      const prev = it.layout[key] || {};
      it.layout[key] = key === 'mobile' ? { ...(prev.x && prev.y ? { x: prev.x, y: prev.y } : {}), w: cell.w, h: cell.h } : { x: cell.x, y: cell.y, w: cell.w, h: cell.h };
      applyItem(rec);
    }
    function applyItem(rec) { G.update(rec.el, { layout: structuredClone(rec.item.layout) }); refreshConstraints(rec); }
    function refreshConstraints(rec) {
      if (rec.free || !rec.el || !rec.el.mgItem) return;
      const c = consFor(rec.item, rec.el.offsetWidth);
      if (JSON.stringify(c) !== JSON.stringify(rec.el.mgItem.constraints)) G.update(rec.el, { constraints: c });
    }
    /** desktop/tablet: give every item of a grid explicit x/y for this breakpoint (as rendered) */
    function pinGrid(gridRoot) {
      const m = metrics(gridRoot);
      if (m.key === 'mobile') return m;
      [...recs.values()].filter((r) => r.gridRoot === gridRoot).forEach((r) => {
        if (r.item.layout[m.key] && r.item.layout[m.key].hide) return;    // hidden at this size: not drawn, its stored layout stays as it is
        const c = cellOf(r.el, m), own = r.item.layout[m.key];
        if (own && sameCell(own, c)) return;
        freezeOthers(r.item, m.key, r.el.mgItem.constraints);
        r.item.layout[m.key] = c;
        G.update(r.el, { layout: structuredClone(r.item.layout) });
      });
      return m;
    }
    /** CSS-grid sparse auto-placement, for breakpoints that are not on screen (model-level) */
    function simulate(items, key, cols = colsOf(key), geo = null) {
      const occ = [], out = new Map();
      const free = (c) => c.x + c.w - 1 <= cols && !occ.some((o) => overlap(c, o));
      const resolved = items.map((it) => ({ it, r: G.resolve({ layout: it.layout, constraints: recs.get(it.id)?.el?.mgItem?.constraints || consFor(it, EST_W[key]) }, key, geo || geoOf(it.parent)) }));
      resolved.filter(({ r }) => r.x && r.y).forEach(({ it, r }) => { occ.push(r); out.set(it.id, r); });
      let row = 1, col = 1;
      resolved.filter(({ r }) => !(r.x && r.y)).forEach(({ it, r }) => {
        const w = Math.min(r.w, cols);
        for (let guard = 0; guard < 5000; guard++) {
          if (col + w - 1 > cols) { row += 1; col = 1; continue; }
          const c = { x: col, y: row, w, h: r.h };
          if (free(c)) { occ.push(c); out.set(it.id, c); col += w; break; }
          col += 1;
        }
      });
      return out;
    }
    /** keep the model overlap-free at breakpoints that are not on screen: an explicitly placed
        item that now overlaps a sibling there becomes auto-placed at that breakpoint */
    function settleOffscreen(it) {
      if ((it.parent && isFloating(byId(it.parent))) || (designingPopup() && !it.parent)) return;   // free surfaces: frames, not grid cells
      ['desktop', 'tablet'].forEach((k) => {
        const own = it.layout[k];
        if (!own || !own.x || !own.y) return;
        const sib = itemsOf(it.parent).filter((s) => s !== it);
        const pos = simulate(sib, k, colsFor(it.parent, k), geoOf(it.parent));
        const me = G.resolve({ layout: it.layout, constraints: consFor(it, EST_W[k]) }, k, geoOf(it.parent));
        if ([...pos.values()].some((o) => overlap(me, o))) it.layout[k] = { w: own.w, h: own.h };
      });
    }
    /** sizes for a new item (all breakpoints), clamped to its constraints at typical widths */
    function defaultLayout(type, config, size, pid = null) {
      const T = R.TYPES[type], L = {};
      const geo = geoOf(pid);                              // a page grid with a dashboard geometry, or null (legacy)
      KEYS.forEach((k) => {
        const cols = geo ? geo[k].cols : COLS[k];
        // a type's default size is written for the legacy grid: same share of the width, same physical height
        const scaleW = (n) => (geo ? Math.max(1, Math.round(n * cols / COLS[k])) : n);
        let w = Math.min(size && size[k] ? size[k].w : scaleW(T.size.w), cols);
        if (k === 'mobile' && !(size && size[k])) w = scaleW(T.size.w >= 4 ? 4 : 2);
        const px = w * (EST_W[k] + 16) / cols - 16;
        const c = T.constraints(R.fullConfig(type, config), px);
        w = clamp(w, Math.min(pickC(c.minW, k) || 1, cols), cols);
        const minH = pickC(c.minH, k) ? G.rowsFor(pickC(c.minH, k), k, geo) : 1;
        L[k] = { w, h: Math.max(size && size[k] ? size[k].h : G.rowsFor(T.size.h, k, geo), minH) };
      });
      return L;
    }
    function uniqueId(base) {
      const slug = String(base).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
      let id = slug, n = 2;
      const taken = new Set(allItems().map((i) => i.id));      // item ids are unique across ALL pages
      while (taken.has(id)) id = `${slug.replace(/-\d+$/, '')}-${n++}`;
      return id;
    }
    let topRoot = null;                                   // the canvas root: the page grid, or a popup's surface / grid
    const gridOf = (pid) => (pid ? recs.get(pid)?.nested : topRoot);

    /* ================================================================== model mutation + history */
    const snap = () => M.serialize(app);
    /** one completed operation = one history entry (it remembers the page it happened on) */
    function mutate(label, fn, { rerender = false, before } = {}) {
      const b = before ?? snap();
      const page = nav.current(), target = { ...design };
      const result = fn();
      if (rerender) render();
      const a = snap();
      if (history.record(label, b, a, { page, design: target })) afterChange();
      else refreshChrome();
      return result;
    }
    /** restore a snapshot; undo / redo show the page the change was made on */
    function restoreText(text, page, target) {
      app = JSON.parse(text);
      if (page && pageById(page)) nav.reset(page);
      if (target) design = { ...target };
      bindPage();
      render();
    }
    function undo() {
      if (drag) return;
      const e = history.undo();
      if (!e) return say('Nothing to undo');
      restoreText(e.before, e.meta && e.meta.page, e.meta && e.meta.design); afterChange(); say(`Undone: ${e.label}`);
    }
    function redo() {
      if (drag) return;
      const e = history.redo();
      if (!e) return say('Nothing to redo');
      restoreText(e.after, e.meta && e.meta.page, e.meta && e.meta.design); afterChange(); say(`Redone: ${e.label}`);
    }
    function afterChange() {
      refreshChrome();
      scheduleMinis();
      // recovery draft: only while there are unsaved changes; never touches the saved configuration
      if (isDirty()) store.saveDraft && store.saveDraft(JSON.stringify({ version: M.VERSION, savedAt: new Date().toISOString(), model: app }));
      else store.clearDraft && store.clearDraft();
    }
    const isDirty = () => snap() !== savedText;
    let saveError = false;                     // the last save attempt failed (cleared by a successful save)
    function refreshChrome() {
      const dirty = isDirty();
      root.classList.toggle('is-dirty', dirty);
      root.classList.toggle('is-save-error', dirty && saveError);
      if (dirty && saveError) status.textContent = 'Save failed · unsaved changes';
      else if (dirty) status.textContent = 'Unsaved changes';
      else if (!status.dataset.clean) status.textContent = 'No unsaved changes';
      else status.textContent = status.dataset.clean;
      const u = history.peekUndo(), r = history.peekRedo();
      btnUndo.disabled = !u; btnRedo.disabled = !r;
      btnUndo.title = u ? `Undo ${u.label} (Ctrl+Z)` : 'Nothing to undo';
      btnRedo.title = r ? `Redo ${r.label} (Ctrl+Shift+Z)` : 'Nothing to redo';
      btnUndo.setAttribute('aria-label', u ? `Undo ${u.label}` : 'Undo');
      btnRedo.setAttribute('aria-label', r ? `Redo ${r.label}` : 'Redo');
    }
    function setClean(text) { status.dataset.clean = text; savedText = snap(); store.clearDraft && store.clearDraft(); refreshChrome(); }

    /* ================================================================== render */
    /** a floating container's content at the visible breakpoint: a free surface, the structured
        nested grid (mobile · structured) or — while editing — a 'hidden on mobile' placeholder */
    function floatingContent(it, rec) {
      const key = frameBp;
      if (key === 'mobile' && floatMode(it) === 'structured') return G.create({ id: `${it.id}--grid`, nested: true, inherit: true, items: kidsOf(it.id).map(gridItem) });
      if (key === 'mobile' && floatMode(it) === 'hidden') { rec.hiddenMobile = true; return h('div', { class: 'mf-hidden', text: 'Hidden on mobile · its items are not shown on phones' }); }
      return freeSurface(kidsOf(it.id), key, (EST_W[key] + 16) * (G.resolve({ layout: it.layout, constraints: {} }, key, geoOf(it.parent)).w || 6) / colsOf(key) - 40);
    }
    /** a free surface of items (Floating Container content / popup content); every child gets a rec */
    function freeSurface(items, key, width) {
      return global.MaisonFree.surface({ key, width, items: items.map((k) => {
        const rec = { id: k.id, item: byId(k.id) || k, free: true };
        let node;
        if (k.type === 'container') {
          rec.nested = G.create({ id: `${k.id}--grid`, nested: true, inherit: true, bp: key, items: kidsOf(k.id).map(gridItem) });
          node = R.instantiate('container', k.config, rec.nested);
        } else if (k.type === 'tabs') node = tabsNode(k, rec, key);
        else node = R.instantiate(k.type, k.config);
        recs.set(k.id, rec);
        return { id: k.id, frame: k.frame, layout: k.layout, node };
      }) });
    }
    /** a Tabbed Container: one nested grid per tab (each the same kind of grid as a Container's). While editing, only the tab being
        edited is built (its grid is the container's grid for every operation); a tab pressed on the canvas becomes the edited tab.
        Viewing: every tab is built and the component switches between them itself, at once. */
    /** VIEWING: the tabs that hold something (config.hideEmpty, default on) — an empty tab is hidden, never left selected; while
        EDITING every tab stays (its empty grid is where widgets are added). All tabs empty: all are shown (nothing is hidden). */
    function shownTabs(it, tabs, kidsOfTab) {
      if (editing || (it.config && it.config.hideEmpty === false)) return tabs;
      const full = tabs.filter((t) => kidsOfTab(t.id).length);
      return full.length ? full : tabs;
    }
    function tabsNode(it, rec, bp) {
      const tabs0 = tabsCfg(it), panes = {};
      const tabs = shownTabs(it, tabs0, (tid) => allItemsOf(it.id).filter((i) => tabOf(i, tabs0) === tid && !floatsNow(i)));
      let cur = curTab(it.id); if (!tabs.some((t) => t.id === cur)) cur = tabs[0] && tabs[0].id;
      tabs.forEach((t) => {
        if (editing && t.id !== cur) return;
        const kids = allItemsOf(it.id).filter((i) => tabOf(i, tabs0) === t.id && !floatsNow(i));
        const g = G.create({ id: `${it.id}--${t.id}`, nested: true, inherit: true, spans: spansOf(it), ...(bp ? { bp } : { rows: boxRows(it) }), ownRows: designingPopup(), items: kids.map(gridItem) });
        if (editing && !kids.length) g.classList.add('ed-tabs-empty');
        panes[t.id] = g;
        if (t.id === cur) rec.nested = g;
      });
      return R.instantiate('tabs', tabs === tabs0 ? it.config : { ...it.config, tabs }, { panes, active: cur, editing, onSelect: (tid) => {
        editTab.set(it.id, tid);
        if (editing) { if (selected && byId(selected) && byId(selected).parent === it.id) selected = it.id; render(); say(`Editing tab: ${(tabs.find((t) => t.id === tid) || {}).label || tid}`); }
      } });
    }
    /** the user's ARRANGEMENT of the Add-widget gallery (own categories, "not wanted"): an application setting on the server — every
        dashboard of this installation — or, without a server, this browser's storage */
    function galleryStore() {
      const D = opts.dashboards && typeof opts.dashboards.settings === 'function' ? opts.dashboards : null;
      const KEY = 'iniqdash.gallery';
      if (D) return { get: () => (D.settings() || {}).gallery || null, set: (g) => D.setSettings({ gallery: g }) };
      return { get: () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
        set: (g) => { try { localStorage.setItem(KEY, JSON.stringify(g)); return true; } catch (e) { return false; } } };
    }
    /** the column ruler: one cell per column of the page grid, numbered (every column, or every 2nd / 4th on a fine grid) */
    function columnRuler(cols) {
      const step = cols > 32 ? 4 : cols > 16 ? 2 : 1;
      return h('div', { class: 'ed-ruler', 'aria-hidden': 'true', 'data-k': 'ruler' }, Array.from({ length: cols }, (_, i) => h('i', { text: i % step === 0 || i === cols - 1 ? String(i + 1) : '' })));
    }
    /** where a corner-pinned radial is drawn while editing: that corner of the FIRST screen (frame size), in px of the page slot */
    function cornerFrame(corner) {
      const S = FLOAT_DEFAULT.w, m = 24, W = slot.clientWidth || 1200;
      const fh = parseFloat(frame.style.height) || 800, top = slotTop();
      return { x: /right/.test(corner) ? Math.max(m, W - S - m) : m, y: /^bottom/.test(corner) ? Math.max(m, Math.round(fh - top - S - m)) : m, w: S, h: S };
    }
    /** the slot's top within the frame's scrolled content, in layout px (the frame is the scrolling screen) */
    function slotTop() {
      const f = frame.getBoundingClientRect(), r = slot.getBoundingClientRect();
      return (r.top - f.top) / (scale || 1) + frame.scrollTop;
    }
    /** FIT TO SCREEN (viewing, ?fit=screen — a wall tablet): the page is scaled down (never up) so all of it is on the screen without
        scrolling. CSS zoom on the page canvas: its layout shrinks with it, the widgets keep their own layout at the size they get. */
    let fitScreen = false;
    function applyFit() {
      const on = fitScreen && fs && fs.kind === 'view' && !designingPopup();
      if (!on) { if (canvas.style.zoom) canvas.style.zoom = ''; delete canvas.dataset.fit; return; }
      canvas.style.zoom = '';
      const avail = frame.clientHeight;
      const measure = () => canvas.getBoundingClientRect().height;
      let z = 1;
      for (let i = 0; i < 3; i++) {          // a narrower zoomed layout can grow taller (reflow): settle in a few steps
        const h = measure();
        if (!(h > 0) || h <= avail + 1) break;
        z = Math.max(0.4, z * (avail / h) * 0.995);
        canvas.style.zoom = String(z);
      }
      canvas.dataset.fit = z < 1 ? String(Math.round(z * 100)) : '';
    }
    /** SCREEN LIMITS (editing): a marked line where each screen of the chosen size ends as the page scrolls */
    const screens = h('div', { class: 'ed-screens', 'aria-hidden': 'true', 'data-k': 'screens', hidden: true });
    function drawScreens(fw, fh) {
      const on = editing && !designingPopup() && !fs && fh > 0;
      screens.hidden = !on;
      if (!on) return;
      if (screens.parentElement !== slot) slot.append(screens);
      const top = slotTop(), total = Math.max(slot.scrollHeight, slot.offsetHeight);
      const lines = [];
      for (let k = 1; k <= 12; k++) {
        const y = k * fh - top;
        if (y > total + 8) break;
        if (y < 0) continue;
        lines.push(h('div', { class: 'ed-screen-end', style: `top:${Math.round(y)}px` }, h('span', { text: k === 1 ? `End of the first screen · ${fw} × ${fh}` : `End of screen ${k}` })));
      }
      screens.replaceChildren(...lines);
    }
    function gridItem(it) {
      const rec = { id: it.id, item: it };
      let content;
      if (it.type === 'floating') {
        rec.nested = floatingContent(it, rec);
        content = R.instantiate('floating', it.config, rec.nested);
      } else if (it.type === 'container') {
        // inherit: the container's grid follows the PAGE breakpoint (Desktop edits layout.desktop even
        // when the container is narrow); its column count = the container's span at that breakpoint
        rec.nested = G.create({ id: `${it.id}--grid`, nested: true, inherit: true, spans: spansOf(it), rows: boxRows(it), ownRows: designingPopup(), items: kidsOf(it.id).map(gridItem) });
        content = R.instantiate('container', it.config, rec.nested);
      } else if (it.type === 'tabs') content = tabsNode(it, rec, null);
      else content = R.instantiate(it.type, it.config);
      recs.set(it.id, rec);
      const w = (it.layout[frameBp] || it.layout.desktop || it.layout.tablet || {}).w || 4;
      const cons = consFor(it, w * (EST_W[frameBp] + 16) / (it.parent ? COLS[frameBp] : colsOf(frameBp)) - 16);
      const layout = structuredClone(it.layout);
      if (it.parent && byId(it.parent)) {
        // a container child never renders wider than the container's columns at a breakpoint
        // (render-time only; the saved model is not rewritten)
        const maxW = {};
        KEYS.forEach((k) => {
          const span = colsFor(it.parent, k);
          maxW[k] = Math.min(pickC(cons.maxW, k) || span, span);
          const L = layout[k];
          if (L && L.x) L.x = clamp(L.x, 1, Math.max(1, span - Math.min(L.w || 1, span) + 1));
        });
        return { id: it.id, layout, constraints: { ...cons, maxW }, content };
      }
      return { id: it.id, layout, constraints: cons, content };
    }
    /** the dashboard theme (app.theme): its token values on the dashboard surface and on the popup / notification layer */
    function applyAppTheme() {
      const T = global.MaisonTheme; if (!T) return;
      T.setActive(app.app.theme || null, [frame, screen && screen.layer, noteScreen && noteScreen.layer]);   // + every preview scope
    }
    function render() {
      recs.forEach((r) => { const w = r.el && r.el.firstElementChild; if (w && w.radial) w.radial.destroy(); });   // no open ring outlives its tile
      recs.clear();
      bindPage();
      applyAppTheme();
      if (typeof syncHaEvents === 'function' && events) syncHaEvents();
      title.textContent = model.name;
      subtitle.textContent = model.subtitle || '';
      subtitle.hidden = !model.subtitle;
      canvas.dataset.head = model.header === false && !designingPopup() ? 'off' : 'on';      // a page may hide its title row (viewing)
      canvas.dataset.bg = model.background || 'default';
      canvas.dataset.page = designingPopup() ? nav.current() : model.id;
      canvas.dataset.design = design.kind;
      renderPages();
      designBar.hidden = !designingPopup();
      if (designingPopup()) {
        designBar.replaceChildren(
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'back-to-page', onclick: () => designPage() }, [svg('left'), h('span', { text: `Back to ${pageById(nav.current()).name}` })]),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'popup-settings', onclick: () => openPopupSettings(model.id) }, h('span', { text: 'Popup settings' })),
          h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'popup-preview', onclick: () => openPopupById(model.id) }, h('span', { text: 'Preview' })),
        );
        title.textContent = `Popup · ${model.name}`;
        subtitle.textContent = 'Designing the popup content. It opens over the dashboard; the page behind is not shown here.';
        subtitle.hidden = false;
        slot.classList.remove('ed-slot--corner');
        slot.replaceChildren(popupStage());
      } else {
        // a floating container hidden on mobile is not rendered on phones (it stays visible while editing)
        const floats = model.items.filter(floatsNow);
        const tops = itemsOf(null).filter((it) => !floats.includes(it) && !(frameBp === 'mobile' && isFloating(it) && floatMode(it) === 'hidden' && !editing));
        topRoot = G.create({ id: 'dashboard', items: tops.map(gridItem), geo: gridGeo() });
        slot.replaceChildren(topRoot);
        if (editing) topRoot.append(columnRuler(colsOf(frameBp)));      // numbered columns above the page grid (editing only; after the grid: code reads the grid as the first child)
        // an empty page says what to do next (editing only; not part of the dashboard)
        if (!model.items.length) {
          slot.append(h('div', { class: 'ed-empty ed-only-edit', role: 'note' }, [
            h('p', { class: 'ed-empty__t', text: 'This page is empty' }),
            h('p', { class: 'ed-empty__h', text: 'Add a widget or a container, then drag it into place.' }),
            h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'empty-add', onclick: () => openAdd(null) }, [svg('plus'), h('span', { text: 'Add widget' })]),
          ]));
        }
        // while VIEWING, a radial pinned to a screen corner leaves the page for a fixed layer of its own (it never scrolls away and
        // never takes grid cells; placed above a bottom dock)
        if (cornerLayer) { cornerLayer.remove(); cornerLayer = null; }
        const pinned = editing ? [] : floats.filter(cornerOf);
        const inPage = floats.filter((it) => !pinned.includes(it));
        if (inPage.length) {
          // the float layer: a free surface over the whole dashboard, inside the canvas (so it scrolls with it)
          // while EDITING, a radial pinned to a screen corner is shown in that corner of the first screen (not over the first widget)
          const at = (it) => (editing && cornerOf(it) ? { ...it, frame: { [frameBp]: cornerFrame(cornerOf(it)) } }
            : it.frame && (it.frame[frameBp] || it.frame.desktop || it.frame.tablet) ? it : { ...it, frame: { [frameBp]: { ...FLOAT_DEFAULT } } });
          const layerEl = freeSurface(inPage.map(at), frameBp, 1200);
          layerEl.classList.add('ed-floatlayer');
          slot.append(layerEl);
        }
        // room under the page for a button pinned to a bottom corner: the last row of widgets is never hidden behind it
        slot.classList.toggle('ed-slot--corner', pinned.some((it) => /^bottom/.test(cornerOf(it))));
        if (pinned.length) {
          cornerLayer = freeSurface(pinned.map((it) => ({ ...it, frame: { [frameBp]: { ...FLOAT_DEFAULT } } })), frameBp, 1200);
          cornerLayer.classList.add('ed-cornerlayer');
          cornerLayer.querySelectorAll('.mf__item').forEach((el) => { const it = byId(el.dataset.gridId); if (it) el.dataset.corner = cornerOf(it); });
          cornerLayer.dataset.dock = (app.app.navigation && app.app.navigation[frameBp]) || 'bottom';
          document.body.append(cornerLayer);
          if (global.MaisonTheme && global.MaisonTheme.scope) global.MaisonTheme.scope(cornerLayer);   // outside the frame: the dashboard theme follows it
        }
      }
      canvas.querySelectorAll('.mg__item').forEach((el) => {
        const rec = recs.get(el.dataset.gridId);
        if (!rec) return;
        rec.el = el;
        rec.gridRoot = el.parentElement.parentElement;
        el.dataset.edType = rec.item.type;
      });
      [...canvas.querySelectorAll('.mf__item'), ...(cornerLayer ? cornerLayer.querySelectorAll('.mf__item') : [])].forEach((el) => {
        const rec = recs.get(el.dataset.gridId);
        if (!rec) return;
        rec.el = el; rec.gridRoot = el.parentElement; rec.free = true;
        el.dataset.edType = rec.item.type;
      });
      if (selected && !recs.has(selected)) selected = null;
      recs.forEach(refreshConstraints);
      decorate();
      layout();
      renderPanel();
      scheduleMinis();
    }
    /** popup design: the popup panel at its size for the visible breakpoint, holding its content —
        a free surface (Desktop / Tablet) or the structured grid (Mobile, where a popup is a sheet) */
    let popupDraft = null;                                // the popup settings being edited (live in the design stage; never stored)
    let uidSeq = 0, stageInfo = null;                     // stageInfo: the design stage's information row (its Home Assistant follow-ups stop on redraw)
    function popupStage() {
      const pp = model, cfg = R.fullConfig('popup', popupDraft && popupDraft.id === pp.id ? popupDraft.config : pp.config), key = frameBp, icons = R.icons();
      // the same header, picture and information row as the real popup (components/popup chrome) — its buttons are pictures here
      if (stageInfo && stageInfo.stop) stageInfo.stop();
      const ch = global.MaisonPopup.chrome(cfg, { name: pp.name, icons, design: true });
      stageInfo = ch.info;
      const body = h('div', { class: 'mpop__body' });
      const panelEl = h('section', { class: `mpop__panel ed-popstage__panel${ch.hero ? ' has-hero' : ''}`, 'data-size': cfg.size }, [ch.hero, ch.head, ch.info, body]);
      const stageEl = h('div', { class: 'ed-popstage', 'data-bp': key, 'data-size': cfg.size }, [panelEl]);
      const frameW = Math.min(FRAME[key][1], 1280) - 48;
      if (key === 'mobile') {
        topRoot = G.create({ id: `${pp.id}--grid`, items: itemsOf(null).map(gridItem) });
        body.append(topRoot);
        panelEl.style.width = '100%';
      } else {
        const sz = cfg.size === 'custom' ? (cfg.custom[key] || cfg.custom.desktop) : null;
        const w = cfg.size === 'custom' ? sz.w : cfg.size === 'full' ? frameW : null;
        topRoot = freeSurface(itemsOf(null), key, (w || 640) - 32);
        body.append(topRoot);
        if (cfg.size === 'custom') { panelEl.style.width = `${sz.w}px`; panelEl.style.height = `${sz.h}px`; }
        else if (cfg.size === 'full') { panelEl.style.width = `${frameW}px`; panelEl.style.height = '720px'; }
        else {           // fit content: the surface takes the bounds of its items (+ room to add more while editing)
          const b = global.MaisonFree.bounds(topRoot.free.frames);
          topRoot.style.width = `${Math.max(200, b.w)}px`; topRoot.style.height = `${Math.max(120, b.h)}px`;
          body.classList.add('is-fit');
        }
        if (cfg.size === 'custom') {
          const grip = h('button', { type: 'button', class: 'ed-popstage__size ed-only-edit', 'aria-label': 'Drag to resize the popup', title: `Drag to resize (${BP_LABEL[key]} size)` }, svg('resize'));
          grip.addEventListener('pointerdown', (e) => beginPopupResize(e, grip, panelEl));
          panelEl.append(grip);
        }
      }
      stageEl.append(h('p', { class: 'ed-popstage__note', text: key === 'mobile' ? 'Mobile: a full-width sheet with the structured 4-column layout.' : `${cfg.size === 'custom' ? `Custom · ${BP_LABEL[key]} ${cfg.custom[key].w} × ${cfg.custom[key].h} px` : cfg.size === 'full' ? 'Full screen' : 'Fit content'} · items are placed to the pixel` }));
      return stageEl;
    }
    /** drag the custom size of the popup at the visible breakpoint (one history entry) */
    function beginPopupResize(e, grip, panelEl) {
      e.preventDefault(); e.stopPropagation();
      const pp = model, key = frameBp, before = snap();
      const cfg = pp.config, start = { ...cfg.custom[key] }, sx = e.clientX, sy = e.clientY;
      grip.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        const w = clamp(Math.round(start.w + (ev.clientX - sx) / scale), 200, key === 'desktop' ? 1600 : 1000);
        const hh = clamp(Math.round(start.h + (ev.clientY - sy) / scale), 120, 1200);
        panelEl.style.width = `${w}px`; panelEl.style.height = `${hh}px`;
        cfg.custom[key] = { w, h: hh };
        stage.style.height = `${frame.offsetHeight * scale + 24}px`;
      };
      const up = () => {
        grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
        const now = { ...cfg.custom[key] };
        if (now.w === start.w && now.h === start.h) return;
        cfg.custom[key] = start;                    // record the change as ONE operation
        mutate('popup size', () => { cfg.custom[key] = now; }, { rerender: true, before });
        say(`${BP_LABEL[key]} size ${now.w} × ${now.h} px`);
      };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    }
    /** edit-mode affordances on grid items (attributes only; the Grid's own model is untouched) */
    function decorate() {
      recs.forEach((rec) => {
        const el = rec.el;
        if (!el) return;                            // not drawn at this breakpoint
        const widget = el.firstElementChild;
        if (editing) {
          el.tabIndex = 0;
          el.setAttribute('role', 'button');
          el.setAttribute('aria-pressed', String(rec.id === selected));
          el.setAttribute('aria-label', `${labelOf(rec.item)}${rec.item.parent ? ` (in ${nameOf(byId(rec.item.parent))})` : ''} — select to edit`);
          if (!isBox(rec.item) && widget) widget.inert = true;
        } else {
          el.removeAttribute('tabindex'); el.removeAttribute('role'); el.removeAttribute('aria-pressed'); el.removeAttribute('aria-label');
          if (widget) widget.inert = false;
        }
        el.classList.toggle('is-selected', editing && rec.id === selected);
        el.classList.toggle('is-msel', editing && msel.size > 1 && msel.has(rec.id));
      });
    }
    /** rebuild one item's component (config preview / after Apply) — the grid item stays */
    /** page picker + Navigation Dock + dock edges, from the page configuration (the one source of truth) */
    function renderPages() {
      const icons = R.icons();
      const cur = nav.current();
      const sig = JSON.stringify([app.pages.map((p) => [p.id, p.name, p.nav, p.icon]), app.app.startPage, cur]);
      if (pageSel.dataset.sig !== sig) {
        pageSel.replaceChildren(...app.pages.map((p) => h('option', { value: p.id, text: `${p.name}${p.id === app.app.startPage ? ' · start' : ''}${p.nav ? '' : ' · not in dock'}` })));
        pageSel.dataset.sig = sig;
      }
      pageSel.value = cur;
      dock.dock.setState({ items: app.pages.filter((p) => p.nav).map((p) => ({ id: p.id, label: p.name, icon: icons[p.icon] || '' })), active: cur });
      shell.shell.setNavigation(app.app.navigation);
      shell.shell.setDockVisible(app.pages.some((p) => p.nav));
    }
    /** the navigator switched pages (dock, radial segment, page picker) */
    function showPage(id, source) {
      if (drag || fdrag) cancelDrag();
      if (popupHost && popupHost.current()) popupHost.close('api');
      closeDetails();
      if (design.kind === 'popup') design = { kind: 'page' };
      selected = null;
      bindPage();
      render();
      afterNav();
      // a new page starts at the top of its screen
      if (source === 'dock' || source === 'radial') frame.scrollTop = 0;
      if (editing) say(`Editing page: ${model.name}`);
    }
    function afterNav() {
      // a switch is not a model change: no history entry, nothing becomes "unsaved"
      refreshChrome();
      requestAnimationFrame(layout);
    }

    function rebuildItem(rec, config) {
      const old = rec.el.firstElementChild;
      if (old && old.radial) old.radial.destroy();
      const cfg = config || rec.item.config;
      const node = R.TYPES[rec.item.type].isContainer ? R.instantiate(rec.item.type, cfg, rec.nested) : R.instantiate(rec.item.type, cfg);
      rec.el.replaceChildren(node);
      if (!rec.free) { const c = R.TYPES[rec.item.type].constraints(R.fullConfig(rec.item.type, cfg), rec.el.offsetWidth); G.update(rec.el, { constraints: c }); }
      decorate();
      layout();
    }

    /* ================================================================== frame + overlay layer */
    /** where notifications are placed: a simulated device's screen, or the visible browser window (see noteScreen) */
    const noteTarget = () => (fs ? (fs.kind === 'preview' ? 'device' : 'window') : pv.mode === 'exact' && !pv.screen ? 'device' : 'window');
    function layout() {
      const avail = stage.clientWidth;
      let fw, fh = null;
      // The SCREEN (viewport) is always a fixed w × h — never derived from the dashboard's height.
      //   device preset: its own w × h.
      //   "fit the editor" (Desktop / Tablet / Mobile buttons): the width the stage allows (within the
      //   breakpoint's range) × the window height available under the toolbar — only the window can
      //   change it, never the content, a drag, the grid's row count or scrollHeight.
      if (fs) { const sc = screenSize(), real = fs.kind === 'screen' || fs.kind === 'view'; fw = real ? sc.w : fs.w; fh = real ? sc.h : fs.h; }   // test mode / viewing mode: see enterFullScreen(), enterView()
      else if (pv.mode === 'exact') { fw = pv.w; fh = pv.h; }
      else { const [lo, hi] = FRAME[frameBp]; fw = clamp(avail, lo, hi); fh = Math.round(deviceRoom()); }
      // 1 · the frame IS the viewport. A device preview is a SIMULATED SCREEN: exactly w × h CSS px,
      //     the dashboard scrolls INSIDE it (the frame is the scroll container); it never grows with
      //     the content. The classic Desktop / Tablet / Mobile previews keep the long canvas.
      const device = true;                       // every preview is a fixed screen; the content scrolls inside it
      frame.classList.toggle('is-device', device);
      frame.style.width = `${fw}px`;
      frame.style.height = device ? `${fh}px` : '';
      frame.style.minHeight = '';
      // 2 · the breakpoint follows the real grid width at that size (never the zoom)
      if (pv.mode === 'exact' || fs) syncKey();
      // 3 · zoom: a visual transform only — layout widths, container queries, breakpointOf() and every
      //     grid / widget measurement stay at the real CSS size
      // Fit: the WHOLE screen — all four edges — inside the stage width and the window height left
      // under the sticky toolbar. Presentation only: a transform, layout stays fw × fh.
      const fit = device ? Math.min(1, avail / fw, (deviceRoom() - sheetReserve()) / fh) : Math.min(1, avail / fw);
      scale = scrubbing ? scrubbing.scale : pv.zoom === 'fit' ? fit : Number(pv.zoom) || fit;
      // test mode: the WHOLE logical screen scaled to the physical one (it may grow), centred both ways
      if (fs) scale = fs.kind === 'screen' || fs.kind === 'view' ? 1 : Math.min(innerWidth / fw, innerHeight / fh);
      frame.style.transform = scale !== 1 ? `scale(${scale})` : '';
      frame.style.marginLeft = `${Math.max(0, ((fs ? innerWidth : avail) - fw * scale) / 2)}px`;
      frame.style.marginTop = fs ? `${Math.max(0, (innerHeight - fh * scale) / 2)}px` : '';
      sizeStage();
      stage.classList.toggle('is-wide', fw * scale > avail + 1);          // 100% of a big viewport: the stage scrolls sideways
      fold.hidden = !fh || device;               // a device screen IS its boundary: no fold line needed
      if (fh && !device) { fold.style.top = `${fh}px`; fold.firstChild.textContent = `${fw} × ${fh} · viewport bottom`; }
      scrubHandle.hidden = !(pv.mode === 'exact' && pbar.classList.contains('is-scrub'));
      if (!scrubHandle.hidden) Object.assign(scrubHandle.style, { left: `${parseFloat(frame.style.marginLeft) + fw * scale - stage.scrollLeft}px`, top: `${24 + 48}px` });
      stickDock();
      const top = topRoot;
      frameLabel.textContent = `${pv.mode === 'exact' ? `${pv.name ? `${pv.name} · ` : ''}${fw} × ${fh} ${orientOf(fw, fh)}` : `${BP_LABEL[frameBp]} · fit the editor · ${fw} × ${fh}`} · ${BP_LABEL[frameBp]} breakpoint · ${Math.round(scale * 100)}%${designingPopup() ? ` · popup ${model.name}` : top && top.isConnected && !isSurface(top) ? ` · grid ${colsOf(keyOf(top))} col${gridGeo() ? ` · ${gridGeo()[keyOf(top)].row}px rows` : ''}` : ''}`;
      refreshPreviewBar(fw, fh);
      drawScreens(fw, fh);
      applyFit();
      clipLayer();
      if (screen) screen.update();
      if (noteScreen) { noteScreen.layer.dataset.target = noteTarget(); noteScreen.update(); }
      drawSelection();
    }
    /** bring the whole simulated screen into the window (just under the sticky toolbar) */
    function showScreen() {
      if (pv.mode !== 'exact') return;
      const under = stuckUnder() + 8, pt = pbar.getBoundingClientRect().top, f = frame.getBoundingClientRect();
      if (pt < under || f.bottom > innerHeight - 8) window.scrollBy(0, pt - under);   // preview bar just under the toolbar
    }
    /* ---------------- Full-Screen TEST mode ----------------
       'preview': the selected logical screen (W × H stays authoritative), scaled to fit the display.
       'screen':  the real browser / fullscreen viewport of this device, at 100 %.
       Editing is off; nothing in the dashboard model changes. Esc or the exit control returns. */
    const fsExit = h('button', { type: 'button', class: 'ed-fs-exit', 'data-k': 'fs-exit', 'aria-label': 'Exit full screen (Esc)', title: 'Exit full screen (Esc)', onclick: () => exitFullScreen() }, [svg('close'), h('span', { text: 'Exit' })]);
    function enterFullScreen(kind) {
      if (fs || scrubbing) return;
      setFsMenu(false);
      fs = { kind, w: parseFloat(frame.style.width), h: parseFloat(frame.style.height), wasEditing: editing, scrollY, bp: frameBp, mode: pv.mode };
      if (editing) setEditing(false);
      root.classList.add('ed--fs');
      document.documentElement.classList.add('iq-fs');
      stage.append(fsExit);
      frame.scrollTop = 0;
      // browser fullscreen when allowed; the test mode works without it too
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      layout();
      say(kind === 'screen' ? `Full screen · this screen ${innerWidth} × ${innerHeight} — Esc to return` : `Full screen · ${fs.w} × ${fs.h} — Esc to return`);
      fsExit.focus({ preventScroll: true });
    }
    /* ---------------- VIEWING MODE (the application's normal mode — opts.viewer) ----------------
       The dashboard at this window's own size and 100 % (the same path as the 'screen' test mode), the editor's chrome out of sight,
       no browser fullscreen, no Exit button — instead the discreet Edit control (IniqEditAccess). Edit leaves it for the editor;
       Done (save) returns to it. Nothing in the dashboard changes. */
    let access = null;
    function enterView() {
      if (fs || !viewer) return;
      fs = { kind: 'view', w: 0, h: 0, wasEditing: false, scrollY: 0, bp: frameBp, mode: pv.mode };
      root.classList.add('ed--fs', 'ed--view');
      document.documentElement.classList.add('iq-fs', 'iq-view');
      frame.scrollTop = 0;
      if (!access && global.IniqEditAccess) { access = global.IniqEditAccess.create({ mode: editButton, onEdit: () => setEditing(true) }); document.body.prepend(access.el); }
      if (access) access.el.hidden = false;
      layout();
    }
    function leaveView() {
      if (!fs || fs.kind !== 'view') return;
      fs = null;
      root.classList.remove('ed--fs', 'ed--view');
      document.documentElement.classList.remove('iq-fs', 'iq-view');
      if (access) { access.hide(); access.el.hidden = true; }
      layout();
    }
    function exitFullScreen() {
      if (!fs || fs.kind === 'view') return;
      const was = fs;
      fs = null;
      root.classList.remove('ed--fs');
      document.documentElement.classList.remove('iq-fs');
      fsExit.remove();
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      if (was.mode === 'auto' && frameBp !== was.bp) setBreakpoint(was.bp, true);
      layout();
      if (was.wasEditing) setEditing(true);
      requestAnimationFrame(() => { window.scrollTo(0, was.scrollY); layout(); });
      pvFs.focus({ preventScroll: true });
    }
    // Esc returns to the editor — after any open popup, radial ring or dialog has had its own Esc.
    // (In browser fullscreen the browser takes Esc itself; leaving it ends the test mode too.)
    document.addEventListener('keydown', (e) => {
      if (!fs || fs.kind === 'view' || e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('dialog[open]') || document.querySelector('.rm-overlay .rm-ring') || (popupHost && popupHost.current && popupHost.current()) || (detailsHost && detailsHost.current && detailsHost.current())) return;
      e.preventDefault();
      exitFullScreen();
    });
    document.addEventListener('fullscreenchange', () => { if (fs && fs.kind !== 'view' && !document.fullscreenElement) exitFullScreen(); else if (fs) layout(); });
    function sizeStage() { stage.style.height = fs ? '' : `${frame.offsetHeight * scale + 24 + 12}px`; }
    /** window height available for a device screen under the sticky toolbar (Fit uses it) */
    //  The preview bar stays in view too, so Zoom / Rotate are at hand while the whole screen is visible.
    const stuckUnder = () => { const cs = getComputedStyle(bar); return cs.position === 'sticky' ? (parseFloat(cs.top) || 0) + bar.offsetHeight : 0; };
    /** below 1400px the inspector is a bottom sheet over the window while editing: Fit keeps the whole
        screen above it. A fixed allowance (its max height), so selecting items never rescales the view. */
    function sheetReserve() {
      if (!editing) return 0;
      const cs = getComputedStyle(panel);
      if (cs.position !== 'sticky' || cs.bottom === 'auto') return 0;
      return panel.classList.contains('is-collapsed') ? 40 : Math.round(innerHeight * 0.4);
    }
    function deviceRoom() {
      const above = stage.getBoundingClientRect().top + 24 - pbar.getBoundingClientRect().top;   // preview bar + label
      return Math.max(160, innerHeight - stuckUnder() - 8 - above - 16);                         // − margins and the bezel
    }
    /** the selection overlay never draws outside a device screen (its content scrolls inside it) */
    function clipLayer() {
      const f = rectIn(frame), sw = stage.scrollWidth, sh = stage.offsetHeight;
      layer.style.clipPath = `inset(${Math.max(0, f.top)}px ${Math.max(0, sw - f.left - f.width)}px ${Math.max(0, sh - f.top - f.height)}px ${Math.max(0, f.left)}px)`;
    }
    /** how far the dashboard has scrolled, in screen px: inside the device screen, or the page */
    const scrollPos = () => frame.scrollTop * scale;
    /** exact mode: the active breakpoint is whatever the grid computes at this viewport — read from the
        slot's real (untransformed) width; the canvas padding depends on the breakpoint, so settle twice */
    function syncKey() {
      const was = frameBp;
      for (let i = 0; i < 2; i++) {
        const k = keyForWidth(slot.clientWidth);
        if (k === frameBp) break;
        frameBp = k; root.dataset.bp = k;
      }
      if (frameBp !== was) breakpointChanged();
    }
    let bpQueued = false;
    function breakpointChanged() {
      bpGroup.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(pv.mode === 'auto' && b.dataset.bp === frameBp)));
      if (bpQueued) return;
      bpQueued = true;
      queueMicrotask(() => {               // after this layout pass (no re-entrant render)
        bpQueued = false;
        if (designingPopup() || model.items.some((it) => isFloating(it) || isFloatRadial(it))) { selected = null; render(); }
        recs.forEach(refreshConstraints); renderPanel(); layout();
      });
    }

    /* ---------------- Preview Studio ---------------- */
    const devKey = (d) => `${d.w}x${d.h}`;
    function allDevices() {
      return [...Object.entries(DEVICES).flatMap(([g, list]) => list.map((d) => ({ ...d, group: g }))), ...userPresets.map((d) => ({ ...d, group: 'saved' }))];
    }
    function refreshPreviewBar(fw, fh) {
      const cur = pv.mode === 'auto' ? `auto:${frameBp}` : devKey(pv);
      const sc = screenSize();
      const sig = JSON.stringify([userPresets, cur, pv.mode, sc]);
      if (pvDevice.dataset.sig !== sig) {
        const opt = (value, text) => h('option', { value, text });
        const groups = [['This browser', [opt('screen', `Current browser window · ${sc.w} × ${sc.h}`)]],
          ['Fit the editor', ['desktop', 'tablet', 'mobile'].map((k) => opt(`auto:${k}`, `${BP_LABEL[k]} · fit the editor`))],
          ...Object.entries(DEVICES).map(([g, list]) => [BP_LABEL[g], list.map((d) => opt(devKey(d), `${d.name} · ${d.w} × ${d.h}`))]),
          ...(userPresets.length ? [['My presets', userPresets.map((d) => opt(`saved:${d.name}`, `${d.name} · ${d.w} × ${d.h}`))]] : [])];
        pvDevice.replaceChildren(...groups.map(([label, opts]) => h('optgroup', { label }, opts)), h('option', { value: 'custom', text: 'Custom…' }));
        pvDevice.dataset.sig = sig;
      }
      const saved = pv.mode === 'exact' && userPresets.find((d) => d.name === pv.name && d.w === pv.w && d.h === pv.h);
      pvDevice.value = pv.mode === 'auto' ? `auto:${frameBp}` : pv.screen ? 'screen' : saved ? `saved:${saved.name}` : allDevices().some((d) => d.group !== 'saved' && devKey(d) === devKey(pv)) ? devKey(pv) : 'custom';
      if (document.activeElement !== pvW) pvW.value = String(fw);
      if (document.activeElement !== pvH) pvH.value = String(fh || Math.round(innerHeight));
      if (document.activeElement !== pvRange) pvRange.value = String(fw);
      pvZoom.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zoom === String(pv.zoom))));
      bpGroup.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(pv.mode === 'auto' && b.dataset.bp === frameBp)));   // the classic buttons light up only in their own mode
      pvInfo.textContent = `${fw} × ${fh || 'auto'} · ${BP_LABEL[frameBp]} · ${Math.round(scale * 100)}%${pv.zoom === 'fit' ? ' (fit)' : ''}`;
      pvInfo.dataset.bp = frameBp;
    }
    function pickDevice(v) {
      if (v === 'custom') { setViewport(Number(pvW.value) || 1024, Number(pvH.value) || 768, 'Custom'); pvW.focus(); return; }
      if (v === 'screen') { const sc = screenSize(); setViewport(sc.w, sc.h, 'Current browser window', { screen: true }); return; }
      if (v.startsWith('auto:')) return setBreakpoint(v.slice(5));
      if (v.startsWith('saved:')) { const d = userPresets.find((x) => x.name === v.slice(6)); if (d) setViewport(d.w, d.h, d.name); return; }
      const d = allDevices().find((x) => devKey(x) === v); if (d) setViewport(d.w, d.h, d.name);
    }
    /** an exact CSS viewport. Never touches the dashboard (no history, nothing unsaved). */
    function setViewport(w, hh, name, { live = false, screen = false } = {}) {
      w = clamp(Math.round(Number(w) || 1024), 240, 3840); hh = clamp(Math.round(Number(hh) || 768), 240, 3840);
      pv = { ...pv, mode: 'exact', w, h: hh, name: name || '', screen: !!screen };
      layout();
      if (!live) { savePrefs(); requestAnimationFrame(() => { layout(); showScreen(); }); }
      return { w, h: hh, breakpoint: frameBp };
    }
    function rotate() {
      const fw = pv.mode === 'exact' ? pv.w : parseFloat(frame.style.width), fh = pv.mode === 'exact' ? pv.h : parseFloat(frame.style.height);
      setViewport(fh, fw, pv.name ? `${pv.name.replace(/ \(rotated\)$/, '')}${pv.name.endsWith('(rotated)') ? '' : ' (rotated)'}` : 'Custom');
    }
    function setZoom(z) { pv = { ...pv, zoom: z === 'fit' ? 'fit' : Number(z) }; layout(); savePrefs(); }
    function toggleScrub(on) {
      const want = on ?? !pbar.classList.contains('is-scrub');
      if (want && pv.mode !== 'exact') setViewport(parseFloat(frame.style.width), parseFloat(frame.style.height), 'Scrubbed');
      pbar.classList.toggle('is-scrub', want);
      pvScrub.setAttribute('aria-pressed', String(want));
      pvRange.hidden = !want;
      layout();
    }
    // drag the right edge of the preview: the width follows the pointer continuously (zoom held still)
    scrubHandle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      scrubHandle.setPointerCapture(e.pointerId);
      scrubbing = { scale, x: e.clientX, w: pv.w };
      root.classList.add('is-scrubbing');
      const mv = (ev) => setViewport(scrubbing.w + (ev.clientX - scrubbing.x) / scrubbing.scale, pv.h, 'Scrubbed', { live: true });
      const up = () => {
        scrubHandle.removeEventListener('pointermove', mv); scrubHandle.removeEventListener('pointerup', up); scrubHandle.removeEventListener('pointercancel', up);
        scrubbing = null; root.classList.remove('is-scrubbing'); layout(); savePrefs(); scheduleMinis();
      };
      scrubHandle.addEventListener('pointermove', mv); scrubHandle.addEventListener('pointerup', up); scrubHandle.addEventListener('pointercancel', up);
    });
    stage.addEventListener('scroll', () => { layout(); });
    function openPresetDialog() {
      const fw = pv.mode === 'exact' ? pv.w : parseFloat(frame.style.width), fh = pv.mode === 'exact' ? pv.h : parseFloat(frame.style.height);
      const name = h('input', { type: 'text', maxlength: '40', value: pv.name && !/^(Custom|Scrubbed)$/.test(pv.name) ? pv.name : '', placeholder: 'e.g. Wall Tablet', 'data-k': 'preset-name' });
      const list = h('ul', { class: 'ed-presets' });
      const err = h('p', { class: 'ef-err', role: 'alert', hidden: true });
      const fill = () => list.replaceChildren(...(userPresets.length ? userPresets.map((d) => h('li', {}, [
        h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'aria-label': `Use ${d.name}`, onclick: () => { setViewport(d.w, d.h, d.name); dlg.close(); } }, h('span', { text: `${d.name} · ${d.w} × ${d.h} · ${d.orientation}` })),
        h('button', { type: 'button', class: 'ed-mini-btn ed-mini-btn--danger', 'aria-label': `Delete preset ${d.name}`, onclick: () => { userPresets = userPresets.filter((x) => x !== d); savePrefs(); fill(); layout(); } }, svg('trash')),
      ])) : [h('li', { class: 'ed-hint', text: 'No saved presets yet.' })]));
      fill();
      let dlg;
      const save = () => {
        const v = name.value.trim();
        const bad = !v ? 'A name is required' : /[<>]/.test(v) ? 'Names cannot contain < or >' : '';
        if (bad) { err.hidden = false; err.textContent = bad; name.focus(); return; }
        userPresets = [...userPresets.filter((d) => d.name !== v), { name: v, w: fw, h: fh, orientation: orientOf(fw, fh) }];
        setViewport(fw, fh, v); savePrefs(); dlg.close(); say(`Saved preset ${v} · ${fw} × ${fh}`);
      };
      dlg = dialog('ed-dlg--presets', 'Device presets', [
        h('p', { class: 'ed-hint', text: `Save the current preview size (${fw} × ${fh}, ${orientOf(fw, fh)}) as a device. Presets are preview sizes kept in this browser — they never change the dashboard or its layouts.` }),
        field('Name', name), err, h('h4', { class: 'ed-sub', text: 'My presets' }), list,
      ], [h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'preset-save', onclick: save }, h('span', { text: 'Save preset' }))]);
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    }

    /* ---------------- Multi Preview: live, read-only views of the same page (not editors) ---------------- */
    function setMulti(on) {
      multiOn = !!on; multi.hidden = !multiOn; pvMulti.setAttribute('aria-pressed', String(multiOn)); savePrefs();
      if (multiOn) renderMinis(); else multi.replaceChildren();
    }
    let miniT = 0;
    function scheduleMinis() { if (!multiOn) return; clearTimeout(miniT); miniT = setTimeout(renderMinis, 120); }
    /** the same page, rendered by the same components at another viewport — static nodes, no editor records */
    function staticPage(page, key, slotW) {
      const items = page.items;
      const findIn = (id) => items.find((x) => x.id === id) || null;
      const floatsHere = (it) => key !== 'mobile' && it.type === 'radial' && it.config && it.config.float;
      const kids = (pid) => items.filter((i) => (i.parent || null) === pid && !floatsHere(i));
      const sid = (id) => `${id}--pv`;
      const nodeOf = (it, forcedBp) => {
        if (it.type === 'floating') {
          const mode = it.config.mobile || 'structured';
          const content = key === 'mobile' && mode === 'structured'
            ? G.create({ nested: true, inherit: true, items: kids(it.id).map((k) => gi(k)) })
            : global.MaisonFree.surface({ key, width: 600, items: kids(it.id).map((k) => ({ id: sid(k.id), frame: k.frame, layout: k.layout, node: nodeOf(k, key) })) });
          return R.instantiate('floating', it.config, content);
        }
        if (it.type === 'container') return R.instantiate('container', it.config, G.create({ nested: true, inherit: true, bp: forcedBp, spans: spansOf(it, findIn, gridGeo()), rows: forcedBp ? null : boxRows(it, findIn, true), items: kids(it.id).map((k) => gi(k)) }));
        if (it.type === 'tabs') return staticTabs(it, items, (k) => gi(k), sid(it.id), forcedBp);
        return R.instantiate(it.type, it.config);
      };
      const gi = (it) => ({ id: sid(it.id), layout: structuredClone(it.layout), constraints: consFor(it, 400), content: nodeOf(it) });
      const tops = kids(null).filter((it) => !(key === 'mobile' && it.type === 'floating' && (it.config.mobile || 'structured') === 'hidden'));
      const out = [G.create({ id: `${page.id}--pv`, items: tops.map(gi), geo: gridGeo() })];
      const floats = items.filter(floatsHere);
      if (floats.length) {
        const fl = global.MaisonFree.surface({ key, width: slotW, items: floats.map((it) => ({ id: sid(it.id), layout: it.layout, node: nodeOf(it), frame: it.frame && (it.frame[key] || it.frame.desktop || it.frame.tablet) ? it.frame : { [key]: { ...FLOAT_DEFAULT } } })) });
        fl.classList.add('ed-floatlayer');
        out.push(fl);
      }
      return out;
    }
    function renderMinis() {
      if (!multiOn) return;
      const page = pageById(nav.current());
      if (!page) return;
      const icons = R.icons();
      multi.replaceChildren(h('header', { class: 'ed-multi__head' }, [h('h3', { class: 'ed-sub', text: 'Multi preview' }),
        h('p', { class: 'ed-hint', text: `Live, read-only views of ${page.name}. The main canvas stays the editable one; these follow every change.` })]));
      const row = h('div', { class: 'ed-multi__row' });
      multi.append(row);
      const later = [];
      minis.forEach((d, i) => {
        const sel = h('select', { 'aria-label': `Preview ${i + 1} device`, 'data-k': `mini-device-${i}`, onchange: (e) => { const x = allDevices().find((q) => (q.group === 'saved' ? `saved:${q.name}` : devKey(q)) === e.target.value); if (x) { minis[i] = { name: x.name, w: x.w, h: x.h }; savePrefs(); renderMinis(); } } },
          allDevices().map((q) => { const v = q.group === 'saved' ? `saved:${q.name}` : devKey(q); return h('option', { value: v, text: `${q.name} · ${q.w} × ${q.h}`, selected: q.w === d.w && q.h === d.h && (q.group !== 'saved' || q.name === d.name) }); }));
        const view = h('div', { class: 'ed-mini__view' });
        const card = h('article', { class: 'ed-mini', 'data-mini': String(i) }, [
          h('div', { class: 'ed-mini__top' }, [sel, h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': `mini-edit-${i}`, onclick: () => setViewport(d.w, d.h, d.name) }, h('span', { text: 'Edit at this size' }))]),
          h('p', { class: 'ed-mini__info', 'data-k': `mini-info-${i}` }), view]);
        row.append(card);
        // the same shell + dock + canvas markup as the real preview, at the exact CSS size
        const title = h('h2', { class: 'ed-dash-title', text: page.name });
        const sub = page.subtitle ? h('p', { class: 'ed-dash-sub', text: page.subtitle }) : null;
        const mslot = h('div', { class: 'ed-mslot' });
        const mcanvas = h('div', { class: 'ed-mcanvas', 'data-bg': page.background || 'default' }, [h('header', { class: 'ed-dash-head' }, [title, sub]), mslot]);
        const mdock = A.createDock({ label: 'Pages (preview)', items: app.pages.filter((p) => p.nav).map((p) => ({ id: p.id, label: p.name, icon: icons[p.icon] || '' })), active: page.id });
        const mshell = A.createShell({ dock: mdock, content: mcanvas, navigation: app.app.navigation });
        mshell.shell.setDockVisible(app.pages.some((p) => p.nav));
        const mframe = global.MaisonTheme.scope(h('div', { class: 'ed-mframe' }, [mshell]));   // the dashboard's active theme, like the main frame
        mframe.style.width = `${d.w}px`; mframe.style.minHeight = `${d.h}px`;
        const sizer = h('div', { class: 'ed-mini__sizer' });
        view.append(sizer, mframe);
        let key = 'desktop';
        for (let k = 0; k < 2; k++) { mcanvas.dataset.bp = key; key = keyForWidth(mslot.clientWidth); }
        mcanvas.dataset.bp = key;
        mslot.append(...staticPage(page, key, mslot.clientWidth));
        card.dataset.bp = key;
        later.push(() => {                   // scale once every card has its final width
          const s = Math.min(1, view.clientWidth / d.w);
          mframe.style.transform = `scale(${s})`;
          view.style.height = `${Math.round(d.h * s)}px`;      // the view is the device SCREEN; the page scrolls inside it
          sizer.style.height = `${Math.round(mframe.offsetHeight * s)}px`;
          card.querySelector('.ed-mini__info').textContent = `${d.w} × ${d.h} ${orientOf(d.w, d.h)} · ${BP_LABEL[key]} breakpoint · ${Math.round(s * 100)}%`;
        });
        mframe.inert = true;                 // a view, not a second editor
      });
      later.forEach((f) => f());
    }
    new ResizeObserver(() => scheduleMinis()).observe(multi);
    /** the sticky dock rests just below the sticky editor toolbar (frame coordinates: divided by the scale).
        The toolbar height and the host's sticky header (--ed-sticky-top) can change at any time. */
    function stickDock() {
      const v = '12px';                                // the dock sticks to the top of its own screen (the screen scrolls)
      if (shell.style.getPropertyValue('--msh-sticky-top') !== v) shell.style.setProperty('--msh-sticky-top', v);
    }
    new ResizeObserver(stickDock).observe(bar);
    window.addEventListener('scroll', stickDock, { passive: true });
    function rectIn(el) {
      const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { left: r.left - s.left + stage.scrollLeft, top: r.top - s.top + stage.scrollTop, width: r.width, height: r.height };
    }
    const place = (box, r) => Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    function drawSelection(invalid) {
      const rec = editing && selected && recs.get(selected);
      selBox.hidden = !rec; parentBox.hidden = true;
      if (!rec || !rec.el || !rec.el.isConnected) { selBox.hidden = true; return; }
      const r = restingRect(rec.el);
      place(selBox, r);
      selBox.classList.toggle('is-small', r.width < 100 || r.height < 100);   // the move grip gives way on small (scaled) items
      selBox.classList.toggle('is-tiny', r.width < 44 || r.height < 44);       // too small for edge handles: corners only
      selBox.classList.toggle('is-container', !!R.TYPES[rec.item.type].isContainer);   // a container / panel, not a widget
      selBox.classList.toggle('is-nested', !!rec.item.parent);
      if (rec.free) {
        const f = frameOfEl(rec.el);
        selBox.classList.toggle('is-invalid', !!invalid); selBox.classList.remove('is-flow'); selBox.classList.remove('is-away');
        selBox.classList.remove('is-flow');
        selBox.querySelector('.ed-sel__tag').textContent = invalid ? `Overlaps ${labelOf(byId(invalid.id))} — will snap back` : `${labelOf(rec.item)}  ·  x${f.x} y${f.y} · ${f.w}×${f.h} px`;
        const p = rec.item.parent && recs.get(rec.item.parent);
        if (p && p.el) { parentBox.hidden = false; place(parentBox, rectIn(p.el)); }
        return;
      }
      const m = metrics(rec.gridRoot), c = drag && drag.started && drag.rec === rec && !drag.cross ? drag.cur : cellOf(rec.el, m);
      selBox.classList.toggle('is-invalid', !!invalid);
      selBox.classList.toggle('is-flow', m.key === 'mobile');
      selBox.classList.toggle('is-away', !!(drag && drag.cross));
      selBox.querySelector('.ed-sel__tag').textContent = invalid && drag ? `Can't place here — ${blockedText(drag).replace(/^./, (x) => x.toLowerCase())}`
        : `${labelOf(rec.item)}  ·  ${m.key === 'mobile' ? '' : `x${c.x} y${c.y} · `}w${c.w} h${c.h}`;
      if (rec.item.parent) {
        const p = recs.get(rec.item.parent);
        if (p) { parentBox.hidden = false; place(parentBox, rectIn(p.el)); }
      }
    }
    let toastT, sheetChosen = false;
    function say(text, tone) {
      // just below the toolbars as they are on screen now (under an app header, or stuck to the top): never over a control
      const under = Math.max(bar.getBoundingClientRect().bottom, pbar.offsetParent ? pbar.getBoundingClientRect().bottom : 0);
      toast.style.top = `${Math.max(8, Math.min(Math.round(under) + 10, innerHeight - 60))}px`;
      toast.textContent = text; toast.hidden = false; toast.dataset.tone = tone || 'info';
      clearTimeout(toastT); toastT = setTimeout(() => { toast.hidden = true; }, 2600);
    }

    /* ================================================================== modes */
    function setEditing(on) {
      if (on && fs && fs.kind === 'view') leaveView();
      if (!on && drag) cancelDrag();
      // phones: the inspector sheet starts minimised, so the dashboard being edited stays visible (its grip opens it;
      // once the user has opened or closed it themselves, that choice is kept)
      if (on && !editing && !sheetChosen && window.matchMedia && matchMedia('(max-width: 699px)').matches) panel.classList.add('is-collapsed');
      editing = on;
      if (on) closeDetails();                // editing: no system surface stays open over the widgets being arranged
      root.classList.toggle('ed--editing', on);
      btnEdit.setAttribute('aria-pressed', String(on));
      btnEdit.querySelector('span').textContent = on ? 'Done' : 'Edit';
      btnEdit.title = on ? 'Save and finish editing' : 'Edit this dashboard';
      if (!on) selected = null;
      // a tabbed container builds only its edited tab while editing, every tab while viewing: rebuild when the mode flips
      if (model.items.some((it) => it.type === 'tabs' || cornerOf(it)) || (frameBp === 'mobile' && model.items.some((it) => isFloating(it) && floatMode(it) === 'hidden'))) render();
      decorate();
      renderPanel();
      requestAnimationFrame(layout);
      if (!on && viewer && !fs) { enterView(); if (access) requestAnimationFrame(() => access.edit.blur()); }   // finished editing: back to the dashboard
      else if (on && viewer) requestAnimationFrame(() => btnEdit.focus({ preventScroll: true }));                 // keyboard users land on Done
    }
    function setBreakpoint(k, keepPreview) {
      const changed = frameBp !== k;
      if (!keepPreview && pv.mode !== 'auto') { pv = { ...pv, mode: 'auto' }; savePrefs(); }
      frameBp = k;
      root.dataset.bp = k;
      bpGroup.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.bp === k)));
      // free surfaces (floating containers, popup design) are laid out per breakpoint by the editor
      if (changed && (designingPopup() || model.items.some((it) => isFloating(it) || isFloatRadial(it)))) { selected = null; render(); }
      layout();
      recs.forEach(refreshConstraints);
      requestAnimationFrame(() => { recs.forEach(refreshConstraints); layout(); renderPanel(); });
    }
    function toggleOverlay(on) { setAid('grid', on ?? !aid.grid); }
    /** a design aid on / off (remembered in this browser) */
    function setAid(k, on) {
      aid[k] = !!on;
      applyAids();
      savePrefs();
      if (drag || fdrag) return;
      if (k !== 'grid') say(`${k === 'snap' ? 'Snap to Grid' : 'Position guides'} ${aid[k] ? 'on' : 'off'}`);
    }
    function applyAids() {
      root.classList.toggle('ed--nogrid', !aid.grid);
      root.classList.toggle('ed--nosnap', !aid.snap);
      root.classList.toggle('ed--noguides', !aid.guides);
      [[btnGrid, 'grid'], [btnSnap, 'snap'], [btnGuides, 'guides']].forEach(([b, n]) => b.setAttribute('aria-pressed', String(aid[n])));
    }
    function select(id, focus, keepMulti) {
      selected = id || null;
      if (!keepMulti) msel.clear();
      decorate();
      drawSelection();
      renderPanel();
      if (focus && id) { const el = recs.get(id)?.el; el?.focus({ preventScroll: true }); reveal(id); }
    }
    /** scroll an item into the part of the window not covered by the sticky bar / bottom sheet */
    function reveal(id) {
      const el = recs.get(id)?.el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const f = frame.getBoundingClientRect();         // scroll inside the screen, never the page
      if (r.top < f.top + 8) frame.scrollTop += (r.top - f.top - 8) / scale;
      else if (r.bottom > f.bottom - 8) frame.scrollTop += Math.min(r.top - f.top - 8, r.bottom - f.bottom + 8) / scale;
    }

    /* ================================================================== layout operations */
    /** keyboard / buttons on a free surface: nudge or resize by `step` px; a fixed frame can be typed in */
    function freeChange(rec, f, label) {
      const surface = rec.gridRoot, others = framesIn(surface, rec.el), mn = minPx(rec.item);
      const cand = { x: Math.max(0, Math.round(f.x)), y: Math.max(0, Math.round(f.y)), w: Math.max(mn.w, Math.round(f.w)), h: Math.max(mn.h, Math.round(f.h)) };
      const b = isFloatRadial(rec.item) ? null : others.find((o) => overlap(cand, o));
      if (b) { say(`Blocked by ${labelOf(byId(b.id))} — items cannot overlap`, 'warn'); renderPanel(); return false; }
      const key = surface.dataset.bp;
      mutate(label, () => { pinFree(surface); writeFrame(rec.item, key, cand); surface.free.place(rec.id, cand); if (!isFloatRadial(rec.item)) growFree(rec.item.parent); });
      after();
      return true;
    }
    function move(rec, dx, dy, step = 1) {
      if (rec.free) { const f = frameOfEl(rec.el); return freeChange(rec, { ...f, x: f.x + dx * step, y: f.y + dy * step }, 'move'); }
      const m = metrics(rec.gridRoot);
      if (m.key === 'mobile') return reorder(rec, dx + dy);
      const c = cellOf(rec.el, m);
      const cand = { ...c, x: clamp(c.x + dx, 1, m.cols - c.w + 1), y: Math.max(1, c.y + dy) };
      if (sameCell(cand, c)) return say(dy < 0 ? 'Already in the top row' : 'Already at the edge of the grid');
      keyReflow(rec, m, cand, { x: Math.sign(dx), y: Math.sign(dy) }, c, 'move');
    }
    /** keyboard / inspector buttons: the same smart reflow as a drag — the items in the way move, ONE undo step for all */
    function keyReflow(rec, m, cand, dir, from, label, note) {
      const others = cellsIn(rec.gridRoot, m, rec.el);
      const r = m.key === 'mobile' ? { ok: true, moved: [], cells: new Map() }
        : global.MaisonReflow.resolve({ active: { id: rec.id, ...cand }, items: others, cols: m.cols, maxRows: rowsAvailable(rec.gridRoot, m, others), dir, vacated: label === 'move' ? from : null });
      if (!r.ok) {
        const p = rec.item.parent && byId(rec.item.parent), b = byId(r.id);
        return say(p ? `No room in ${nameOf(p)} for ${b ? nameOf(b) : 'the items in the way'} — make it larger first` : `No valid spot for ${b ? nameOf(b) : 'the items in the way'}`, 'warn');
      }
      const peers = r.moved.map((id) => recs.get(id)).filter(Boolean);
      flip([rec.el, ...peers.map((p) => p.el)], () => mutate(label, () => {
        pinGrid(rec.gridRoot);
        writeLayout(rec, m.key, cand);
        peers.forEach((p) => writeLayout(p, m.key, r.cells.get(p.id)));
        if (rec.item.parent) growToFit(rec.item.parent);
      }));
      if (peers.length) say(`${peers.length} item${peers.length > 1 ? 's' : ''} moved out of the way`);
      else if (note) say(note);
      after();
    }
    function resize(rec, dw, dh, step = 1) {
      if (rec.free) { const f = frameOfEl(rec.el); return freeChange(rec, { ...f, w: f.w + dw * step, h: f.h + dh * step }, 'resize'); }
      const m = metrics(rec.gridRoot);
      const c = cellOf(rec.el, m);
      const { cell, note } = clampSize(rec.item, m.key, m, { ...c, w: c.w + dw, h: c.h + dh });
      if (sameCell(cell, c)) return say(note || 'Size unchanged');
      keyReflow(rec, m, cell, { x: Math.sign(dw), y: Math.sign(dh) }, c, 'resize', note);
    }
    /** mobile (auto-flow): move = change the reading order among siblings. Other breakpoints that
        are auto-placed are frozen first (their positions would otherwise follow the new order). */
    function reorder(rec, dir) {
      const sib = itemsOf(rec.item.parent);
      const i = sib.indexOf(rec.item), j = i + (dir < 0 ? -1 : 1);
      if (j < 0 || j >= sib.length) return say(dir < 0 ? 'Already first' : 'Already last');
      mutate('reorder', () => {
        ['desktop', 'tablet'].forEach((k) => {
          const pos = simulate(sib, k, colsFor(rec.item.parent, k));
          sib.forEach((it) => {
            const own = it.layout[k];
            if (own && own.x && own.y) return;
            const p = pos.get(it.id);
            freezeOthers(it, k, recs.get(it.id)?.el?.mgItem?.constraints);
            it.layout[k] = { x: p.x, y: p.y, w: p.w, h: p.h };
          });
        });
        const a = model.items.indexOf(sib[i]), b = model.items.indexOf(sib[j]);
        [model.items[a], model.items[b]] = [model.items[b], model.items[a]];
      }, { rerender: true });
      say(`Moved ${dir < 0 ? 'earlier' : 'later'} in the order`);
    }
    function after() { drawSelection(); renderPanel(); }

    /** insert a new item (add / duplicate / paste) into `pid`'s grid at a free spot of the visible
        breakpoint (near `from` when given); other breakpoints get sizes only (auto-placed). */
    function insert(it, pid, from, label) {
      joinTab(it, pid);
      const gridRoot = gridOf(pid);
      const key = keyOf(gridRoot);
      if (isSurface(gridRoot)) {                       // a free surface: a px frame at a free spot
        const size = pxSize(it, key), others = framesIn(gridRoot);
        const spot = freeSpot(others, surfaceSize(gridRoot), Math.min(size.w, Math.max(48, surfaceSize(gridRoot).w)), size.h, from && from.frame);
        mutate(label, () => {
          pinFree(gridRoot);
          writeFrame(it, key, spot);
          const sib = itemsOf(pid);
          const anchor = from && from.after ? model.items.indexOf(from.after) + 1 : (sib.length ? model.items.indexOf(sib[sib.length - 1]) + 1 : (pid ? model.items.indexOf(byId(pid)) + 1 : model.items.length));
          model.items.splice(anchor, 0, it);
          growFloating(pid, spot.y + spot.h);
          render();
        });
        select(it.id, true);
        return;
      }
      if (key !== 'mobile') {
        const m = metrics(gridRoot);
        const L = it.layout[key];
        const spot = from ? nearestFree(cellsIn(gridRoot, m), m.cols, from, L.w, L.h) : firstFree(cellsIn(gridRoot, m), m.cols, L.w, L.h);
        it.layout[key] = spot;
      }
      mutate(label, () => {
        if (key !== 'mobile') pinGrid(gridRoot);
        const sib = itemsOf(pid);
        const anchor = from && from.after ? model.items.indexOf(from.after) + 1 : (sib.length ? model.items.indexOf(sib[sib.length - 1]) + 1 : (pid ? model.items.indexOf(byId(pid)) + 1 : model.items.length));
        model.items.splice(anchor, 0, it);
        render();
        growToFit(pid);
      });
      select(it.id, true);
    }
    function addItem(type, config, pid) {
      const T = R.TYPES[type];
      pid = pid || null;
      // nesting: floating containers sit on the page; a normal container may go on the page or into a
      // floating container; widgets anywhere
      if (T.isFloating || (T.isContainer && !(pid && isFloating(byId(pid))))) pid = null;
      if (designingPopup() && T.isFloating) { say('A popup is already a free surface — add a container or widgets instead', 'warn'); return; }
      const it = { id: uniqueId(T.isContainer ? (config.title || 'group') : (config.name || config.location || type)), type, parent: pid, config: structuredClone(config), layout: defaultLayout(type, config, null, pid) };
      insert(it, pid, null, `add ${T.label}`);
      say(`Added ${T.label}${pid ? ` to ${nameOf(byId(pid))}` : ''}`);
    }
    function duplicate(rec) {
      if (rec.free) {
        const src = rec.item, f = frameOfEl(rec.el);
        const it = { id: uniqueId(src.id), type: src.type, parent: src.parent || null, config: structuredClone(src.config), layout: structuredClone(src.layout), frame: structuredClone(src.frame || {}) };
        insert(it, it.parent, { frame: { x: f.x + 16, y: f.y + 16 }, after: src }, `duplicate ${R.TYPES[src.type].label}`);
        say(`Duplicated ${labelOf(src)}${isBox(src) ? ' (container only, without its items)' : ''}`);
        return;
      }
      const src = rec.item, m = metrics(rec.gridRoot), c = cellOf(rec.el, m);
      const size = {};
      KEYS.forEach((k) => { const r = G.resolve({ layout: src.layout, constraints: rec.el.mgItem.constraints }, k, geoOf(src.parent)); size[k] = { w: r.w, h: r.h }; });
      const it = { id: uniqueId(src.id), type: src.type, parent: src.parent || null, config: structuredClone(src.config), layout: structuredClone(size) };
      insert(it, it.parent, { x: c.x, y: c.y, after: src }, `duplicate ${R.TYPES[src.type].label}`);
      say(`Duplicated ${labelOf(src)}${isBox(src) ? ' (container only, without its items)' : ''}`);
    }
    function copy(rec) {
      const size = {};
      KEYS.forEach((k) => { const r = G.resolve({ layout: rec.item.layout, constraints: (rec.el.mgItem && rec.el.mgItem.constraints) || {} }, k, geoOf(rec.item.parent)); size[k] = { w: r.w, h: r.h }; });
      clipboard = { type: rec.item.type, config: structuredClone(rec.item.config), size, from: rec.item.id, fromParent: rec.item.parent || null };
      say(`Copied ${labelOf(rec.item)}`);
      renderPanel();
    }
    function paste() {
      if (!clipboard) return say('Nothing copied yet');
      const sel = selected && byId(selected);
      let pid = sel ? (R.TYPES[sel.type].isContainer ? sel.id : sel.parent) : null;
      if (R.TYPES[clipboard.type].isFloating || (R.TYPES[clipboard.type].isContainer && !(pid && isFloating(byId(pid))))) pid = null;
      if (designingPopup() && R.TYPES[clipboard.type].isFloating) return say('A popup cannot hold a floating container', 'warn');
      const it = { id: uniqueId(clipboard.from), type: clipboard.type, parent: pid || null, config: structuredClone(clipboard.config), layout: convertSizes(structuredClone(clipboard.size), clipboard.fromParent || null, pid || null) };
      insert(it, pid || null, null, `paste ${R.TYPES[it.type].label}`);
      say(`Pasted ${labelOf(it)}${pid ? ` into ${nameOf(byId(pid))}` : ''}`);
    }
    function remove(rec) {
      const ids = new Set([rec.id]);
      let grew = true;
      while (grew) { grew = false; model.items.forEach((i) => { if (i.parent && ids.has(i.parent) && !ids.has(i.id)) { ids.add(i.id); grew = true; } }); }   // all descendants
      const label = labelOf(rec.item);
      mutate(`remove ${R.TYPES[rec.item.type].label}`, () => { model.items = model.items.filter((i) => !ids.has(i.id)); selected = null; }, { rerender: true });
      say(`Removed ${label}${ids.size > 1 ? ` and ${ids.size - 1} item${ids.size > 2 ? 's' : ''} inside it` : ''} — Undo restores it`);
    }
    /** move an item into a container (or back onto the dashboard). Its sizes are kept (clamped to the
        new grid); it lands at `cell` (drag) or the first free spot of the visible breakpoint. */
    function reparent(rec, pid, cell, before) {
      pid = pid || null;
      if ((rec.item.parent || null) === pid) return;
      const it = rec.item;
      const sizes = {};
      KEYS.forEach((k) => { const r = G.resolve({ layout: it.layout, constraints: (rec.el.mgItem && rec.el.mgItem.constraints) || {} }, k, geoOf(it.parent)); sizes[k] = { w: Math.min(r.w, colsOf(k)), h: r.h }; });
      Object.assign(sizes, convertSizes(sizes, it.parent || null, pid));      // rows of the grid it leaves → rows of the one it joins
      const target = gridOf(pid);
      if (!target) return say('That place is not shown at this breakpoint', 'warn');
      if (isSurface(target)) {                         // onto a free surface: keep the px size when it had one
        const key = target.dataset.bp, size = rec.free ? frameOfEl(rec.el) : pxSize({ layout: sizes }, key);
        const spot = freeSpot(framesIn(target, rec.el), surfaceSize(target), Math.min(size.w, Math.max(48, surfaceSize(target).w)), size.h);
        mutate(pid ? `move into ${nameOf(byId(pid))}` : 'move onto the popup', () => {
          pinFree(target);
          model.items.splice(model.items.indexOf(it), 1);
          const sib = itemsOf(pid);
          const at = sib.length ? model.items.indexOf(sib[sib.length - 1]) + 1 : (pid ? model.items.indexOf(byId(pid)) + 1 : model.items.length);
          it.parent = pid; it.layout = sizes; it.frame = {}; joinTab(it, pid);
          writeFrame(it, key, spot);
          model.items.splice(at, 0, it);
          growFloating(pid, spot.y + spot.h);
          render();
        }, { before });
        select(it.id);
        say(`Moved into ${pid ? nameOf(byId(pid)) : 'the popup'}`);
        return;
      }
      const key = keyOf(target), m = metrics(target);
      let spot = null;
      if (key !== 'mobile') {
        const others = cellsIn(target, m, rec.el);
        const L = clampSize(it, key, m, { x: 1, y: 1, ...sizes[key], w: Math.min(sizes[key].w, m.cols) }).cell;
        spot = cell && !blocker({ ...cell, w: L.w, h: L.h }, others) && cell.x + L.w - 1 <= m.cols ? { x: cell.x, y: cell.y, w: L.w, h: L.h } : (cell ? nearestFree(others, m.cols, cell, L.w, L.h) : firstFree(others, m.cols, L.w, L.h));
      }
      mutate(pid ? `move into ${nameOf(byId(pid))}` : 'move onto dashboard', () => {
        if (key !== 'mobile') pinGrid(target);
        model.items.splice(model.items.indexOf(it), 1);
        const sib = itemsOf(pid);
        const at = sib.length ? model.items.indexOf(sib[sib.length - 1]) + 1 : (pid ? model.items.indexOf(byId(pid)) + 1 : model.items.length);
        it.parent = pid; it.layout = sizes; delete it.frame; joinTab(it, pid);    // a frame only means something on a free surface
        if (spot) it.layout[key] = spot;
        model.items.splice(at, 0, it);
        render();
        growToFit(pid);
      }, { before });
      select(it.id);
      say(pid ? `Moved into ${nameOf(byId(pid))}` : 'Moved onto the dashboard');
    }
    /** a container's grid that no longer fits its area would clip items: grow the container (at the
        visible breakpoint) when the rows below it are free; otherwise say so */
    /** a container on a free surface whose grid outgrew its frame: grow the frame (if the room below is free) */
    function growFree(pid) {
      const rec = pid && recs.get(pid);
      if (!rec || !rec.free || !rec.nested || isSurface(rec.nested)) return;
      const content = rec.nested.parentElement, need = Math.ceil(rec.nested.offsetHeight - content.clientHeight);
      if (need <= 1) return;
      const f = frameOfEl(rec.el), cand = { ...f, h: f.h + need };
      if (framesIn(rec.gridRoot, rec.el).some((o) => overlap(cand, o))) { say(`${nameOf(rec.item)} is too small to show everything — make it taller`, 'warn'); return; }
      writeFrame(rec.item, rec.gridRoot.dataset.bp, cand); rec.gridRoot.free.place(rec.id, cand);
      say(`${nameOf(rec.item)} grew by ${need}px to fit its items`);
    }
    /** an item placed into a Floating Container below its visible area: the container (a grid item) grows
        by whole rows at the visible breakpoint when the rows below it are free — otherwise say so */
    function growFloating(pid, bottomPx) {
      const rec = pid && recs.get(pid);
      if (!rec || !isFloating(rec.item) || !isSurface(rec.nested) || rec.free) return;
      const need = Math.ceil(bottomPx - rec.nested.clientHeight);
      if (need <= 0) return;
      const m = metrics(rec.gridRoot), c = cellOf(rec.el, m), cand = { ...c, h: c.h + Math.ceil(need / m.rowStep) };
      if (m.key !== 'mobile' && blocker(cand, cellsIn(rec.gridRoot, m, rec.el))) { say(`${nameOf(rec.item)} is too small to show it — make it taller`, 'warn'); return; }
      pinGrid(rec.gridRoot); writeLayout(rec, m.key, cand);
      say(`${nameOf(rec.item)} grew to show its new item`);
    }
    function growToFit(pid) {
      const rec = pid && recs.get(pid);
      if (!rec) return;
      if (rec.free) return growFree(pid);
      if (!rec.nested || isSurface(rec.nested) || !rec.nested.parentElement) return;   // a floating container never grows by itself
      const content = rec.nested.parentElement, need = rec.nested.offsetHeight - content.clientHeight;
      if (need <= 1) return;
      const m = metrics(rec.gridRoot), c = cellOf(rec.el, m);
      const extra = Math.ceil(need / m.rowStep);
      const cand = m.key === 'mobile' ? { ...c, h: c.h + extra } : { ...c, h: c.h + extra };
      if (m.key !== 'mobile' && blocker(cand, cellsIn(rec.gridRoot, m, rec.el))) { say(`${nameOf(rec.item)} is too small to show everything — make it taller`, 'warn'); return; }
      pinGrid(rec.gridRoot);
      writeLayout(rec, m.key, cand);
      say(`${nameOf(rec.item)} grew by ${extra} row${extra > 1 ? 's' : ''} to fit its items`);
    }
    /** after a configuration change: the component may need more rows (capabilities) — keep the
        layout valid and overlap-free (visible breakpoint: move to the nearest free spot if needed;
        other breakpoints: auto-place where it would now overlap) */
    function fitAfterConfig(it) {
      KEYS.forEach((k) => {
        const L = it.layout[k]; if (!L) return;
        const geo = geoOf(it.parent), cols = geo ? geo[k].cols : COLS[k];
        const px = L.w * (EST_W[k] + 16) / cols - 16;
        const c = consFor(it, px);
        L.w = clamp(L.w, Math.min(pickC(c.minW, k) || 1, cols), cols);
        L.h = Math.max(L.h, pickC(c.minH, k) ? G.rowsFor(pickC(c.minH, k), k, geo) : 1);
      });
      render();
      const rec = recs.get(it.id); if (!rec) return;
      if (rec.free) { render(); if (it.parent) { growToFit(it.parent); render(); } return; }
      const m = metrics(rec.gridRoot);
      if (m.key !== 'mobile') {
        const c = cellOf(rec.el, m), others = cellsIn(rec.gridRoot, m, rec.el);
        if (blocker(c, others)) { pinGrid(rec.gridRoot); writeLayout(rec, m.key, nearestFree(others, m.cols, c, c.w, c.h)); say('It needed more room and was moved to the nearest free spot'); }
        else if (!sameCell(it.layout[m.key], c)) { freezeOthers(it, m.key, rec.el.mgItem.constraints); it.layout[m.key] = c; }
      }
      settleOffscreen(it);
      render();
      if (it.parent) { growToFit(it.parent); render(); }
    }

    /* ================================================================== pointer: select, drag, resize, cross-grid */
    ['selectstart', 'dragstart'].forEach((t) => canvas.addEventListener(t, (e) => { if (editing) e.preventDefault(); }));
    canvas.addEventListener('pointerdown', (e) => {
      if (!editing || drag || fdrag) return;
      if (e.target.closest('.ed-popstage__size')) return;
      const el = e.target.closest('.mg__item, .mf__item');
      if (!el || !canvas.contains(el) || !recs.get(el.dataset.gridId)) { select(null); return; }       // empty dashboard space deselects
      if (e.target.closest('.mtabs__tab')) return;                    // a tab of a tabbed container: its press selects the tab to edit
      const id = el.dataset.gridId;
      // Shift / Ctrl / ⌘ + click: add to (or take out of) the selection — items of the same grid only
      if ((e.shiftKey || e.ctrlKey || e.metaKey) && selected && id !== selected || (e.shiftKey || e.ctrlKey || e.metaKey) && msel.size > 1 && msel.has(id)) {
        e.preventDefault();
        return toggleMulti(id);
      }
      if (id !== selected || msel.size > 1) select(id);
      if (e.pointerType === 'mouse' && e.button === 0) (recs.get(id).free ? beginFree : beginDrag)('move', recs.get(id), e, canvas, true);
    });
    selBox.querySelector('.ed-sel__move').addEventListener('pointerdown', (e) => { e.preventDefault(); const r = recs.get(selected); (r && r.free ? beginFree : beginDrag)('move', r, e, e.currentTarget); });
    selBox.querySelectorAll('.ed-sel__h').forEach((hd) => hd.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = recs.get(selected);
      (r && r.free ? beginFree : beginDrag)('size', r, e, e.currentTarget, false, hd.dataset.dir);
    }));

    /* ---------------- free drag: px, smooth, guides + snapping, overlap rejected ---------------- */
    let fdrag = null;
    function beginFree(kind, rec, e, captureEl, deferred, dir = 'se') {
      if (!rec || !rec.el) return;
      fdrag = { kind, dir, rec, captureEl, id: e.pointerId, sx: e.clientX, sy: e.clientY, deferred, started: false };
      captureEl.setPointerCapture(e.pointerId);
      if (!deferred) startFree();
    }
    function startFree() {
      const d = fdrag;
      d.started = true; d.before = snap();
      d.surface = d.rec.gridRoot; d.key = d.surface.dataset.bp;
      d.start = frameOfEl(d.rec.el); d.cur = { ...d.start };
      d.others = framesIn(d.surface, d.rec.el); d.size = surfaceSize(d.surface); d.min = minPx(d.rec.item);
      d.overlay = isFloatRadial(d.rec.item);          // an overlay: may cover anything, never collides
      d.k = (d.rec.el.getBoundingClientRect().width / (d.start.w || 1)) || scale;     // screen px per surface px
      d.open = designingPopup() && !d.rec.item.parent && R.fullConfig('popup', model.config).size === 'fit';   // a Fit popup grows with its content
      d.rec.el.classList.add('is-floating');
      root.classList.add('is-dragging');
      root.dataset.drag = d.kind === 'move' ? 'move' : d.dir;
      selBox.dataset.active = d.kind === 'move' ? 'move' : d.dir;
    }
    /** snap one axis: the candidate's points (offsets from its start) against target lines */
    function snapAxis(pos, len, targets, mode) {
      const pts = mode === 'move' ? [0, len / 2, len] : [len];
      let best = null;
      pts.forEach((o) => targets.forEach((t) => { const dlt = t - (pos + o); if (Math.abs(dlt) <= FREE_SNAP && (!best || Math.abs(dlt) < Math.abs(best))) best = dlt; }));
      return best || 0;
    }
    function freeMove(e) {
      const d = fdrag;
      if (!d || e.pointerId !== d.id) return;
      if (!d.started) { if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return; startFree(); }
      const dx = (e.clientX - d.sx) / d.k, dy = (e.clientY - d.sy) / d.k;
      const S = d.size, s0 = d.start;
      let c;
      const tx = [0, S.w / 2, S.w, ...d.others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
      const ty = [0, S.h / 2, ...(d.open ? [] : [S.h]), ...d.others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
      const snapping = snapOn(e);                      // Snap to Grid off (or Alt held): no magnetic edges
      if (d.kind === 'move') {
        c = { ...s0, x: s0.x + dx, y: s0.y + dy };
        if (snapping) { c.x += snapAxis(c.x, c.w, tx, 'move'); c.y += snapAxis(c.y, c.h, ty, 'move'); }
        c.x = clamp(Math.round(c.x), 0, Math.max(0, (d.open ? 4000 : S.w) - c.w));
        c.y = clamp(Math.round(c.y), 0, Math.max(0, (d.open ? 20000 : S.h) - c.h));
      } else {
        // 8 handles: an edge changes one dimension, a corner both; the opposite edges stay where they are
        const D = d.dir, W = d.open ? 4000 : S.w, H = d.open ? 20000 : S.h, r0 = s0.x + s0.w, b0 = s0.y + s0.h;
        c = { ...s0 };
        if (D.includes('e')) { c.w = s0.w + dx; if (snapping) c.w += snapAxis(c.x, c.w, tx, 'size'); c.w = clamp(Math.round(c.w), d.min.w, Math.max(d.min.w, W - c.x)); }
        if (D.includes('w')) { let x = s0.x + dx; if (snapping) x += snapAxis(x, 0, tx, 'size'); x = clamp(Math.round(x), 0, r0 - d.min.w); c.x = x; c.w = r0 - x; }
        if (D.includes('s')) { c.h = s0.h + dy; if (snapping) c.h += snapAxis(c.y, c.h, ty, 'size'); c.h = clamp(Math.round(c.h), d.min.h, Math.max(d.min.h, H - c.y)); }
        if (D.includes('n')) { let y = s0.y + dy; if (snapping) y += snapAxis(y, 0, ty, 'size'); y = clamp(Math.round(y), 0, b0 - d.min.h); c.y = y; c.h = b0 - y; }
      }
      d.cur = c;
      d.surface.free.place(d.rec.id, c);
      d.conflicts = d.overlay ? [] : d.others.filter((o) => overlap(c, o));
      d.block = d.conflicts[0] || null;
      showFreeAids(d, c);
      drawSelection(d.block);
    }
    function showFreeAids(d, c) {
      ghost.hidden = true;
      aids.replaceChildren();
      const sr = d.surface.getBoundingClientRect(), st = stage.getBoundingClientRect(), k = d.k;
      const toStage = (f) => ({ left: sr.left - st.left + stage.scrollLeft + f.x * k, top: sr.top - st.top + stage.scrollTop + f.y * k, width: f.w * k, height: f.h * k });
      d.conflicts.forEach((o) => { const b = h('div', { class: 'ed-conflict' }); place(b, toStage(o)); aids.append(b); });
      const seen = new Set();
      const line = (vertical, pos, cls) => {
        const key = `${vertical}${Math.round(pos)}`; if (seen.has(key)) return; seen.add(key);
        const g = h('div', { class: `ed-guide ed-guide--${vertical ? 'v' : 'h'}${cls ? ` ${cls}` : ''}` });
        const ox = sr.left - st.left + stage.scrollLeft, oy = sr.top - st.top + stage.scrollTop;
        place(g, vertical ? { left: ox + pos * k - 1, top: oy, width: 2, height: sr.height } : { left: ox, top: oy + pos * k - 1, width: sr.width, height: 2 });
        aids.append(g);
      };
      if (aid.guides) {
        const R0 = toStage(c), D = d.kind === 'move' ? '' : d.dir;
        crosshair(R0, D.includes('e') ? 'r' : D.includes('w') ? 'l' : 'c', D.includes('s') ? 'b' : D.includes('n') ? 't' : 'c');
        showDims(R0, `X ${c.x} · Y ${c.y} · W ${c.w} · H ${c.h}`, d.block ? 'Overlaps another item' : 'px · free surface', !!d.block);
      } else { crossH.hidden = crossV.hidden = dims.hidden = true; }
      if (!aid.guides) return;
      const S = d.size, xs = [c.x, c.x + c.w / 2, c.x + c.w], ys = [c.y, c.y + c.h / 2, c.y + c.h];
      // (an odd width can only centre to within half a px: whole-px frames)
      if (Math.abs(c.x + c.w / 2 - S.w / 2) <= 0.5) line(true, S.w / 2, 'ed-guide--centre');
      if (Math.abs(c.y + c.h / 2 - S.h / 2) <= 0.5) line(false, S.h / 2, 'ed-guide--centre');
      d.others.forEach((o) => {
        [o.x, o.x + o.w / 2, o.x + o.w].forEach((v) => { if (xs.some((x) => Math.abs(x - v) <= 0.5)) line(true, v); });
        [o.y, o.y + o.h / 2, o.y + o.h].forEach((v) => { if (ys.some((y) => Math.abs(y - v) <= 0.5)) line(false, v); });
      });
    }
    function freeUp(e) {
      const d = fdrag;
      if (!d || e.pointerId !== d.id) return;
      fdrag = null;
      root.classList.remove('is-dragging');
      delete root.dataset.drag; delete selBox.dataset.active;
      try { d.captureEl.releasePointerCapture(d.id); } catch (err) { /* already released */ }
      if (!d.started) return;
      d.rec.el.classList.remove('is-floating');
      clearAids();
      const same = sameCell(d.cur, d.start);
      if (e.type === 'pointercancel' || d.block || same) {
        d.surface.free.place(d.rec.id, d.start);
        if (d.block) say(`Can't place it there — it would overlap ${d.conflicts.map((o) => labelOf(byId(o.id))).join(', ')}`, 'warn');
        else if (e.type === 'pointercancel') say('The browser interrupted the drag — nothing was changed', 'warn');
        after();
        return;
      }
      const c = d.cur, key = d.key, surface = d.surface, it = d.rec.item;
      mutate(d.kind === 'move' ? 'move' : 'resize', () => { pinFree(surface); writeFrame(it, key, c); if (!isFloatRadial(it)) growFree(it.parent); if (d.open) render(); }, { before: d.before });
      after();
    }

    /* ---------------- grid drag: move / resize (8 handles) with SMART REFLOW ----------------
       While a drag runs the model does not change (only the grid's cells are pinned, undone on cancel). Every time the
       pointer reaches another cell, MaisonReflow resolves the collision LOCALLY from the positions at drag start: the
       items in the way are previewed where they would go (animated), the landing cell is shown as a ghost. The drop
       commits the dragged item AND every displaced item as ONE history entry; Escape / a refused spot restores all. */
    const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    /** Snap to Grid for this gesture (Alt inverts the toolbar choice while it is held) */
    const snapOn = (e) => aid.snap !== !!(e && e.altKey);
    // displaced items stay within the model's y limit — 95% of it, for THIS grid's geometry (fine rows reach as far down as coarse ones)
    const pageRows = (key) => Math.max(1, Math.floor(0.95 * (M.gridLimits ? M.gridLimits(gridGeo(), key).y : 400)));
    /** rows a container's grid holds without growing: displaced items must stay inside it (the page grid grows freely) */
    function rowsAvailable(gridRoot, m, others) {
      if (gridRoot === topRoot || !gridRoot.parentElement) return pageRows(m.key);
      const content = gridRoot.parentElement, inner = gridRoot.firstElementChild;
      const pad = parseFloat(getComputedStyle(content).paddingBottom) || 0;
      const px = (content.getBoundingClientRect().bottom - inner.getBoundingClientRect().top) / scale - pad;
      return Math.max(1, Math.floor((px + m.rgap) / m.rowStep), ...others.map((o) => o.y + o.h - 1));
    }
    /** Snap to Grid, magnetic alignment: is position `p` (an item `len` cells long) lined up with a nearby item on this axis
        (left / right / centre, top / bottom / middle)? Such a cell holds the item longer (see step) — local candidates only. */
    function aligned(p, len, others, ax, fo) {
      return others.some((o) => {
        const op = ax === 'x' ? o.x : o.y, ol = ax === 'x' ? o.w : o.h;
        if (ax === 'x' ? Math.abs(o.y - fo) > 10 : Math.abs(o.x - fo) > 12) return false;
        return p === op || p + len === op + ol || 2 * p + len === 2 * op + ol;
      });
    }
    /** an item's rectangle where it RESTS — without the transient translate of a FLIP move animation (rectIn of a moving item is where
        it is drawn this frame: the selection would be left on the cell it came from, labelled with the cell it went to) */
    function restingRect(el) {
      const r = rectIn(el);
      const t = getComputedStyle(el).transform;
      if (!t || t === 'none') return r;
      const mx = new DOMMatrixReadOnly(t), dx = mx.m41 * scale, dy = mx.m42 * scale;
      return { ...r, left: r.left - dx, top: r.top - dy, x: r.left - dx, y: r.top - dy };
    }
    /** animate elements from where they are drawn now to where `fn` puts them (FLIP; nothing under reduced motion) */
    function flip(els, fn) {
      els = els.filter(Boolean);
      if (reduced() || !els.length) { fn(); return; }
      const first = els.map((el) => el.getBoundingClientRect());
      fn();
      const moves = els.map((el, i) => { const l = el.getBoundingClientRect(); return [el, (first[i].left - l.left) / scale, (first[i].top - l.top) / scale]; })
        .filter(([, x, y]) => Math.abs(x) > 0.5 || Math.abs(y) > 0.5);
      moves.forEach(([el, x, y]) => { el.style.transition = 'none'; el.style.transform = `translate(${x}px, ${y}px)`; });
      if (!moves.length) return;
      void document.body.offsetWidth;                         // one forced layout for the whole batch
      moves.forEach(([el]) => { el.classList.add('is-shifting'); el.style.transition = ''; el.style.transform = ''; });
      // when they have arrived: the overlays (selection, parent outline) are drawn on the cells again
      clearTimeout(flip.t); flip.t = setTimeout(() => { moves.forEach(([el]) => el.classList.remove('is-shifting')); drawSelection(); }, 240);
    }
    function beginDrag(kind, rec, e, captureEl, deferred, dir = 'se') {
      if (!rec) return;
      const m = metrics(rec.gridRoot);
      const r = rec.el.getBoundingClientRect();
      drag = { kind, dir, rec, captureEl, id: e.pointerId, sx: e.clientX, sy: e.clientY + scrollPos(), deferred, started: false, flow: m.key === 'mobile',
        grabCol: Math.max(0, Math.floor((e.clientX - r.left) / (m.colStep * scale))), grabRow: Math.max(0, Math.floor((e.clientY - r.top) / (m.rowStep * scale))) };
      captureEl.setPointerCapture(e.pointerId);
      if (!deferred) startDrag();
    }
    function startDrag() {
      const d = drag;
      d.started = true;
      d.before = snap();                     // history: the whole drag (with everything it displaces) is one operation
      d.m = pinGrid(d.rec.gridRoot);
      d.start = cellOf(d.rec.el, d.m);
      d.others = cellsIn(d.rec.gridRoot, d.m, d.rec.el);
      d.recOf = new Map(d.others.map((o) => [o.id, recs.get(o.id)]));
      d.orig = new Map(d.others.map((o) => [o.id, o]));
      d.shown = new Map(d.others.map((o) => [o.id, o]));   // where each other item is drawn now (preview)
      d.content = Math.max(d.start.y + d.start.h - 1, ...d.others.map((o) => o.y + o.h - 1), 0);   // last used row
      d.maxY = d.content + 12;                 // the workspace extends well below the content (bounded: no runaway)
      d.rows = rowsAvailable(d.rec.gridRoot, d.m, d.others);
      d.isTop = d.rec.gridRoot === topRoot;
      d.cur = { ...d.start }; d.sig = `${d.start.x},${d.start.y},${d.start.w},${d.start.h}`; d.moved = []; d.result = null; d.block = null;
      d.px = { w: d.rec.el.offsetWidth, h: d.rec.el.offsetHeight };
      d.minCell = clampSize(d.rec.item, d.m.key, d.m, { ...d.start, w: 1, h: 1 }).cell;
      d.others.forEach((o) => d.recOf.get(o.id)?.el?.classList.add('is-peer'));
      d.rec.el.classList.add(d.kind === 'move' ? 'is-floating' : 'is-resizing');
      root.classList.add('is-dragging');
      root.dataset.drag = d.kind === 'move' ? 'move' : d.dir;
      selBox.dataset.active = d.kind === 'move' ? 'move' : d.dir;
    }
    /** which grid would receive the item at this pointer position? Containers are hit-tested where they were when the drag
        started: a reflow preview that pushes a container aside must never move the drop target away from the pointer. */
    function dropTarget(e) {
      const d = drag, it = d.rec.item;
      if (d.kind !== 'move' || isBox(it)) return null;
      if (!d.boxes) {
        d.boxes = itemsOf(null).filter((x) => isBox(x) && x.id !== it.parent && x.id !== it.id).map((x) => recs.get(x.id)).filter((r) => r && r.el && r.nested && !r.free);
      }
      const inRect = (r) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      const inner = d.rec.gridRoot.firstElementChild.getBoundingClientRect(), m = d.m;
      for (const b of d.boxes) {
        const o = d.orig && d.orig.get(b.id);
        const r = o ? { left: inner.left + (o.x - 1) * m.colStep * scale, top: inner.top + (o.y - 1) * m.rowStep * scale, right: inner.left + ((o.x - 1 + o.w) * m.colStep - m.gap) * scale, bottom: inner.top + ((o.y - 1 + o.h) * m.rowStep - m.rgap) * scale }
          : b.el.getBoundingClientRect();
        if (inRect(r)) {
          if (o) previewOthers(null);                     // the container returns to its place, under the pointer
          return { pid: b.id, rec: b, grid: b.nested };
        }
      }
      if (it.parent) {
        const p = recs.get(it.parent).el.getBoundingClientRect();
        const hits = document.elementsFromPoint(e.clientX, e.clientY);
        if (!inRect(p) && hits.some((n) => n === canvas || canvas.contains(n))) return { pid: null, rec: null, grid: topRoot };
      }
      return null;
    }
    /** while dragging near the top / bottom of the visible area, scroll the page (rAF loop) */
    let autoT = 0, lastEv = null;
    function edgeScroll() {
      autoT = 0;
      if (!drag || !lastEv || !drag.started) return;
      // zones: within 24px of the screen's own top / bottom edge — the dashboard scrolls inside the screen
      const fr = frame.getBoundingClientRect();
      const top = fr.top + 24, bottom = fr.bottom - 24;
      const y = lastEv.clientY;
      const dir = y < top ? -1 : y > bottom ? 1 : 0;
      if (!dir) { edgeSince = 0; return; }
      const now = performance.now();
      if (!edgeSince) edgeSince = now;
      if (now - edgeSince < 350) { autoT = requestAnimationFrame(edgeScroll); return; }   // deliberate dwell first
      const before = scrollPos();
      const stepPx = dir * Math.min(18, 4 + (now - edgeSince - 350) / 40);
      frame.scrollTop += stepPx / scale;
      if (scrollPos() === before) return;            // at the end of the dashboard (the item cannot grow it: see maxY)
      onMove(lastEv, true);
      autoT = requestAnimationFrame(edgeScroll);
    }
    let edgeSince = 0, moveRaf = 0, moveEv = null;
    /** pointer moves are coalesced to one update per animation frame */
    function onMove(e, fromScroll) {
      if (fdrag) return freeMove(e);
      const d = drag;
      if (!d || e.pointerId !== d.id) return;
      if (!fromScroll) { lastEv = e; if (!autoT) autoT = requestAnimationFrame(edgeScroll); }
      if (!d.started) { if (Math.hypot(e.clientX - d.sx, e.clientY + scrollPos() - d.sy) < 5) return; startDrag(); }
      moveEv = e;
      if (fromScroll) { step(e, true); return; }
      if (!moveRaf) moveRaf = requestAnimationFrame(() => { moveRaf = 0; if (drag && drag.started && moveEv) step(moveEv); });
    }
    /** hysteresis: the landing cell changes only once the pointer is well into the next cell (no flicker on a boundary) */
    const HYST = 0.65, HYST_ALIGNED = 0.85;
    const settleTo = (f, cur, hold = HYST) => (Math.abs(f - cur) < hold ? cur : Math.round(f));
    function step(e, force) {
      const d = drag, m = d.m;
      // cross-grid (into / out of a container)
      const tgt = dropTarget(e);
      if (tgt) { if (!d.cross) { clearIntent(d); d.active = null; d.block = null; d.moved = []; d.result = null; previewOthers(null); } return crossMove(e, tgt); }
      if (d.cross) endCross();
      if (d.kind === 'move' && d.flow) { d.rec.el.style.transform = ''; drawSelection(); return; }   // mobile flow: structured (order buttons)
      const snapping = snapOn(e);
      if (snapping !== d.snapping) { d.snapping = snapping; d.painted = false; }
      const dx = (e.clientX - d.sx) / scale, dy = (e.clientY + scrollPos() - d.sy) / scale;   // logical px (zoom never counts)
      let cand, dirv;
      if (d.kind === 'move') {
        const fx = d.start.x + dx / m.colStep, fy = d.start.y + dy / m.rowStep;
        // Snap to Grid: a cell lined up with a nearby item is magnetic — it holds the item a little longer
        const hx = snapping && aligned(d.cur.x, d.start.w, d.others, 'x', fy) ? HYST_ALIGNED : HYST;
        const hy = snapping && aligned(d.cur.y, d.start.h, d.others, 'y', fx) ? HYST_ALIGNED : HYST;
        const x = settleTo(fx, d.cur.x, hx), y = settleTo(fy, d.cur.y, hy);
        cand = { ...d.start, x: clamp(x, 1, m.cols - d.start.w + 1), y: clamp(y, 1, d.maxY) };
        // the gesture's intention: its dominant axis (a slight sideways drift does not count)
        const ax = Math.abs(dx) / m.colStep, ay = Math.abs(dy) / m.rowStep;
        dirv = { x: ax >= ay * 0.5 ? Math.sign(cand.x - d.start.x) : 0, y: ay >= ax * 0.5 ? Math.sign(cand.y - d.start.y) : 0 };
      } else {
        const D = d.dir, fc = dx / m.colStep, fr = dy / m.rowStep;
        // the edge's current offset (in cells) from its start, with the same hysteresis as a move
        const curC = D.includes('w') ? d.cur.x - d.start.x : d.cur.w - d.start.w, curR = D.includes('n') ? d.cur.y - d.start.y : d.cur.h - d.start.h;
        const ec = settleTo(fc, curC), er = settleTo(fr, curR);
        const r1 = d.start.x + d.start.w - 1, b1 = d.start.y + d.start.h - 1;          // the opposite edges stay put
        let x = d.start.x, y = d.start.y, w = d.start.w, hh = d.start.h;
        if (!d.flow && D.includes('w')) { x = clamp(d.start.x + ec, 1, r1); w = r1 - x + 1; } else if (D.includes('e')) w = Math.max(1, d.start.w + ec);
        if (!d.flow && D.includes('n')) { y = clamp(d.start.y + er, 1, b1); hh = b1 - y + 1; } else if (D.includes('s')) hh = Math.max(1, Math.min(d.start.h + er, d.maxY - d.start.y + 1));
        const c = clampSize(d.rec.item, m.key, m, { x, y, w, h: hh });
        cand = c.cell; d.note = c.note;
        if (!d.flow && D.includes('w')) { cand.x = clamp(r1 - cand.w + 1, 1, m.cols - cand.w + 1); }
        if (!d.flow && D.includes('n')) { cand.y = Math.max(1, b1 - cand.h + 1); }
        dirv = { x: D.includes('e') ? 1 : D.includes('w') ? -1 : 0, y: D.includes('s') ? 1 : D.includes('n') ? -1 : 0 };
      }
      const sig = `${cand.x},${cand.y},${cand.w},${cand.h}`, changed = sig !== d.sig;
      if (changed) {
        d.sig = sig; d.cur = cand;
        intend(d, dirv);
      }
      // resize with Snap on: the item itself takes the candidate cell; Snap off: it keeps its start cell (stretched below)
      if (d.kind !== 'move') {
        const want = snapping || d.flow ? d.cur : d.start, ws = `${want.x},${want.y},${want.w},${want.h}`;
        if (d.applied !== ws) { d.applied = ws; const L = structuredClone(d.rec.item.layout); L[m.key] = m.key === 'mobile' ? { w: want.w, h: want.h } : want; G.update(d.rec.el, { layout: L }); }
      }
      const el = d.rec.el;
      if (d.kind === 'move') {
        // Snap on: the item itself steps from cell to cell; off: it follows the pointer exactly (it lands on the nearest cell)
        el.classList.toggle('is-snapping', snapping);
        el.style.transform = snapping ? `translate(${(d.cur.x - d.start.x) * m.colStep}px, ${(d.cur.y - d.start.y) * m.rowStep}px)` : `translate(${dx}px, ${dy}px)`;
      } else if (!snapping && !d.flow) {
        // free resize: the item keeps its start cell and is stretched to the pointer, never below its minimum
        const D = d.dir, minW = d.minCell.w * m.colStep - m.gap, minH = d.minCell.h * m.rowStep - m.rgap;
        const maxW = D.includes('w') ? (d.start.x + d.start.w - 1) * m.colStep - m.gap : (m.cols - d.start.x + 1) * m.colStep - m.gap;
        const maxH = D.includes('n') ? (d.start.y + d.start.h - 1) * m.rowStep - m.rgap : Infinity;
        const W = D.includes('e') || D.includes('w') ? clamp(d.px.w + (D.includes('w') ? -dx : dx), minW, maxW) : d.px.w;
        const H = D.includes('n') || D.includes('s') ? clamp(d.px.h + (D.includes('n') ? -dy : dy), minH, maxH) : d.px.h;
        el.style.width = `${W}px`; el.style.height = `${H}px`;
        el.style.transform = `translate(${D.includes('w') ? d.px.w - W : 0}px, ${D.includes('n') ? d.px.h - H : 0}px)`;
      } else { el.style.width = ''; el.style.height = ''; el.style.transform = ''; }
      if (changed && d.isTop) expandCanvas(Math.max(d.cur.y + d.cur.h - 1, ...(d.result ? [...d.result.values()].map((c) => c.y + c.h - 1) : [])), d.content);
      // the aids only change with the landing cell (or when the screen scrolled); the item itself follows every frame
      if (changed || force || d.painted !== true) { paintAids(d); d.painted = true; }
      drawSelection(d.block);
    }
    /* ---- REFLOW INTENT: neighbours only make room when the user MEANS it ----
       The landing cell follows the pointer at once (and the reflow is resolved at once — free space, a shrink or a refused
       spot show immediately). But when items would have to MOVE, they stay where they are until the candidate cell has
       stayed the same for REFLOW_INTENT_MS: passing over a widget on the way somewhere else never rearranges the dashboard.
       Stability = the candidate CELL (Snap on: the stepped cell; Snap off: the landing cell, whose hysteresis already
       absorbs a trembling pointer) — not pixel stillness. Once reflow is active, a next cell that still pushes one of the
       SAME items applies at once (no new wait for every row of a growing resize); a conflict with other items starts a new
       wait. A drop during the wait is explicit intent: the reflow resolves immediately (onUp). One timer per drag; it is
       cleared on every candidate change, entering a container, Escape, cancel and drop — nothing can move later. */
    const REFLOW_INTENT_MS = 300;
    function clearIntent(d) { if (!d) return; if (d.intentT) clearTimeout(d.intentT); d.intentT = 0; d.waiting = null; }
    function applyReflow(d, r, hits) { d.active = hits; d.block = null; d.result = r.cells; d.moved = r.moved; previewOthers(r.cells); }
    function intend(d, dirv) {
      clearIntent(d);
      if (d.flow) { d.block = null; d.moved = []; d.result = null; return; }
      const r = global.MaisonReflow.resolve({ active: { id: d.rec.id, ...d.cur }, items: d.others, cols: d.m.cols, maxRows: d.rows, dir: dirv, vacated: d.kind === 'move' ? d.start : null });
      if (!r.ok) { d.active = null; d.block = { id: r.id, reason: r.reason }; d.result = null; d.moved = []; previewOthers(null); return; }
      if (!r.moved.length) { d.active = null; d.block = null; d.result = r.cells; d.moved = []; previewOthers(r.cells); return; }
      const hits = d.others.filter((o) => overlap(o, d.cur)).map((o) => o.id);   // the items the candidate lands on
      if (d.active && hits.some((id) => d.active.includes(id))) { applyReflow(d, r, hits); return; }   // the same push, continued
      // a new conflict: everything stays where it was while the user decides
      d.active = null; d.block = null; d.result = null; d.moved = []; previewOthers(null);
      d.waiting = { sig: d.sig, r, hits };
      d.intentT = setTimeout(() => {
        d.intentT = 0;
        if (drag !== d || !d.waiting || d.waiting.sig !== d.sig || d.cross) return;   // stale: the gesture moved on
        const w = d.waiting; d.waiting = null;
        applyReflow(d, w.r, w.hits);
        paintAids(d); drawSelection(d.block);
      }, REFLOW_INTENT_MS);
    }
    /** draw the other items of the grid at `cells` (null = where they were at drag start) */
    function previewOthers(cells) {
      const d = drag, key = d.m.key, list = [];
      d.others.forEach((o) => {
        const want = (cells && cells.get(o.id)) || o;
        if (!sameCell(want, d.shown.get(o.id))) list.push([o.id, want]);
      });
      if (!list.length) return;
      flip(list.map(([id]) => d.recOf.get(id)?.el), () => list.forEach(([id, c]) => {
        const rec = d.recOf.get(id);
        d.shown.set(id, c);
        if (!rec || !rec.el) return;
        const L = structuredClone(rec.item.layout); L[key] = c;
        G.update(rec.el, { layout: L });
        rec.el.classList.toggle('is-displaced', !sameCell(c, d.orig.get(id)));
      }));
    }
    /* ---- drag aids: landing ghost, refused spot, alignment guides, crosshair, X / Y / W / H (screen space, overlay layer) ---- */
    function cellRect(gridRoot, m, c) {
      const inner = gridRoot.firstElementChild.getBoundingClientRect(), s = stage.getBoundingClientRect();
      return { left: inner.left - s.left + stage.scrollLeft + (c.x - 1) * m.colStep * scale, top: inner.top - s.top + stage.scrollTop + (c.y - 1) * m.rowStep * scale, width: (c.w * m.colStep - m.gap) * scale, height: (c.h * m.rowStep - m.rgap) * scale };
    }
    function paintAids(d) {
      const gridRoot = d.rec.gridRoot, m = d.m, cand = d.cur, flow = d.flow;
      const R0 = flow ? rectIn(d.rec.el) : cellRect(gridRoot, m, cand);
      ghost.hidden = flow;
      if (!flow) place(ghost, R0);
      ghost.classList.toggle('is-invalid', !!d.block);
      ghost.classList.toggle('is-quiet', !!d.snapping && !d.block && !d.waiting);      // the item itself sits on the landing cell: outline only
      ghost.classList.toggle('is-waiting', !!d.waiting);                  // it conflicts: hold to make room (reflow intent)
      aids.replaceChildren();
      if (d.block) { const b = d.recOf.get(d.block.id); if (b && b.el) { const x = h('div', { class: 'ed-conflict' }); place(x, rectIn(b.el)); aids.append(x); } }
      if (d.waiting) d.waiting.hits.forEach((id) => { const b = d.recOf.get(id); if (b && b.el) { const x = h('div', { class: 'ed-conflict ed-conflict--wait' }); place(x, rectIn(b.el)); aids.append(x); } });
      if (!aid.guides) { crossH.hidden = crossV.hidden = dims.hidden = true; return; }
      if (!flow) alignGuides(gridRoot, m, cand, [...d.shown.entries()].map(([id, c]) => ({ id, ...c })));
      const D = d.kind === 'move' ? '' : d.dir;
      crosshair(R0, D.includes('e') ? 'r' : D.includes('w') ? 'l' : 'c', D.includes('s') ? 'b' : D.includes('n') ? 't' : 'c');
      const px = `${Math.round(flow ? d.rec.el.offsetWidth : cand.w * m.colStep - m.gap)} × ${Math.round(flow ? d.rec.el.offsetHeight : cand.h * m.rowStep - m.rgap)} px`;
      showDims(R0, flow ? `W ${cand.w} · H ${cand.h}` : `X ${cand.x} · Y ${cand.y} · W ${cand.w} · H ${cand.h}`,
        d.block ? blockedText(d) : d.waiting ? `${px} · hold to make room` : `${px}${d.moved.length ? ` · ${d.moved.length} moved` : ''}`, !!d.block);
    }
    /** alignment with nearby items: per kind (left, centre, right / top, middle, bottom) only the NEAREST match is drawn */
    function alignGuides(gridRoot, m, cand, others) {
      const R = cellRect(gridRoot, m, cand), best = new Map();
      const cx = (c) => 2 * c.x + c.w, cy = (c) => 2 * c.y + c.h;
      const dist = (o) => Math.abs(cx(o) - cx(cand)) + Math.abs(cy(o) - cy(cand));
      others.forEach((o) => {
        if (overlap(o, cand)) return;
        const kinds = [['vl', cand.x === o.x], ['vc', cx(cand) === cx(o)], ['vr', cand.x + cand.w === o.x + o.w], ['ht', cand.y === o.y], ['hm', cy(cand) === cy(o)], ['hb', cand.y + cand.h === o.y + o.h]];
        kinds.forEach(([k, hit]) => { if (hit && (!best.has(k) || dist(o) < dist(best.get(k)))) best.set(k, o); });
      });
      const seen = new Set(), marked = new Set();
      best.forEach((o, k) => {
        const O = cellRect(gridRoot, m, o), v = k[0] === 'v';
        const pos = v ? (k === 'vl' ? R.left : k === 'vr' ? R.left + R.width : R.left + R.width / 2) : (k === 'ht' ? R.top : k === 'hb' ? R.top + R.height : R.top + R.height / 2);
        const key = `${k[0]}${Math.round(pos)}`; if (seen.has(key)) return; seen.add(key);
        const a = v ? Math.min(R.top, O.top) - 8 : Math.min(R.left, O.left) - 8, b2 = v ? Math.max(R.top + R.height, O.top + O.height) + 8 : Math.max(R.left + R.width, O.left + O.width) + 8;
        const g = h('div', { class: `ed-guide ed-guide--${v ? 'v' : 'h'}${k[1] === 'c' || k[1] === 'm' ? ' ed-guide--mid' : ''}` });
        place(g, v ? { left: pos - 1, top: a, width: 2, height: b2 - a } : { left: a, top: pos - 1, width: b2 - a, height: 2 });
        aids.append(g);
        if (!marked.has(o.id)) { marked.add(o.id); const t = h('div', { class: 'ed-guide__mark' }); place(t, O); aids.append(t); }   // the item it lines up with
      });
    }
    /** crosshair through the active item (its centre, or the edge being dragged) across the visible screen */
    function crosshair(R0, vx, hy) {
      const F = rectIn(frame);
      const x = vx === 'l' ? R0.left : vx === 'r' ? R0.left + R0.width : R0.left + R0.width / 2;
      const y = hy === 't' ? R0.top : hy === 'b' ? R0.top + R0.height : R0.top + R0.height / 2;
      crossV.hidden = crossH.hidden = false;
      place(crossV, { left: x - 0.5, top: F.top, width: 1, height: F.height });
      place(crossH, { left: F.left, top: y - 0.5, width: F.width, height: 1 });
    }
    /** the X / Y / W / H indicator: just below the landing area (above it near the bottom of the screen), never over it */
    function showDims(R0, main, sub, bad) {
      const F = rectIn(frame);
      dims.hidden = false;
      dims.classList.toggle('is-invalid', !!bad);
      dims.replaceChildren(h('b', { text: main }), h('span', { text: sub }));
      const below = R0.top + R0.height + 8, w = dims.offsetWidth || 160, hh = dims.offsetHeight || 34;
      const top = below + hh > F.top + F.height - 4 && R0.top - hh - 8 > F.top ? R0.top - hh - 8 : Math.min(below, F.top + F.height - hh - 4);
      Object.assign(dims.style, { left: `${clamp(R0.left, F.left + 4, Math.max(F.left + 4, F.left + F.width - w - 4))}px`, top: `${top}px` });
    }
    function blockedText(d) {
      const p = d.rec.item.parent && byId(d.rec.item.parent), b = byId(d.block.id);
      return p ? `No room in ${nameOf(p)} for ${b ? nameOf(b) : 'the items in the way'} — make it larger first` : `No valid spot for ${b ? nameOf(b) : 'the items in the way'}`;
    }
    function clearAids() { aids.replaceChildren(); ghost.hidden = true; ghost.classList.remove('is-invalid', 'is-quiet'); crossH.hidden = crossV.hidden = dims.hidden = true; }
    /** the dashboard is a workspace: while an item travels below the content, the canvas grows with it */
    function expandCanvas(bottomRow, contentRows) {
      const extra = Math.max(3, bottomRow - contentRows + 4);
      slot.style.setProperty('--ed-extra', String(extra));
    }
    function crossMove(e, tgt) {
      const d = drag;
      clearIntent(d);
      if (!d.cross) { d.cur = { ...d.start }; d.sig = ''; d.block = null; aids.replaceChildren(); ghost.classList.remove('is-invalid'); crossH.hidden = crossV.hidden = dims.hidden = true; }
      d.rec.el.classList.remove('is-snapping');
      d.rec.el.style.transform = `translate(${(e.clientX - d.sx) / scale}px, ${(e.clientY + scrollPos() - d.sy) / scale}px)`;   // still follows the pointer
      d.cross = tgt;
      const gm = metrics(tgt.grid), inner = tgt.grid.firstElementChild.getBoundingClientRect();
      const size = G.resolve({ layout: d.rec.item.layout, constraints: d.rec.el.mgItem.constraints }, gm.key, geoOf(d.rec.item.parent));
      size.h = G.convertRows(size.h, gm.key, geoOf(d.rec.item.parent), tgt.grid.mgGeo || null);   // into a grid with another row unit
      const L = clampSize(d.rec.item, gm.key, gm, { x: 1, y: 1, w: Math.min(size.w, gm.cols), h: size.h }).cell;
      let cell = null, why = '';
      if (gm.key !== 'mobile') {
        // the cell under the pointer, keeping (within the new size) the cell the item was grabbed by
        const pc = Math.floor((e.clientX - inner.left) / (gm.colStep * scale)) + 1, pr = Math.floor((e.clientY - inner.top) / (gm.rowStep * scale)) + 1;
        const x = clamp(pc - Math.min(d.grabCol, L.w - 1), 1, gm.cols - L.w + 1);
        const y = Math.max(1, pr - Math.min(d.grabRow, L.h - 1));
        const want = { x, y, w: L.w, h: L.h };
        const others = cellsIn(tgt.grid, gm);
        cell = blocker(want, others) ? nearestFree(others, gm.cols, want, L.w, L.h) : want;
        if (!sameCell(cell, want)) why = ' · nearest free spot';
      }
      if (gm.key === 'mobile') why = ' · added after its items';
      d.crossCell = cell;
      // feedback: target outline (editor colour) + landing ghost
      targetBox.hidden = false;
      place(targetBox, rectIn(tgt.rec ? tgt.rec.el : canvas));
      targetBox.classList.remove('is-invalid');
      targetBox.querySelector('.ed-target__tag').textContent = tgt.pid ? `Drop into ${nameOf(byId(tgt.pid))}${why}` : `Drop onto the dashboard${why}`;
      if (cell) { ghost.hidden = false; place(ghost, cellRect(tgt.grid, gm, cell)); } else ghost.hidden = true;
      drawSelection();
    }
    function endCross() { clearIntent(drag); drag.active = null; drag.cross = null; drag.sig = ''; drag.painted = false; targetBox.hidden = true; clearAids(); drawSelection(); }
    /** end of any drag: the object drops back into the grid (the commit, if any, moves its grid cell) */
    function settle(d, animateBack) {
      const el = d.rec.el;
      el.classList.remove('is-snapping');
      if (animateBack && (el.style.transform || el.style.width) && !reduced()) {
        el.classList.add('is-returning'); el.style.transform = ''; el.style.width = ''; el.style.height = '';
        setTimeout(() => el.classList.remove('is-returning'), 220);
      } else { el.style.transform = ''; el.style.width = ''; el.style.height = ''; }
      el.classList.remove('is-floating', 'is-resizing');
      d.others.forEach((o) => { const r = d.recOf.get(o.id); if (r && r.el) r.el.classList.remove('is-peer', 'is-displaced'); });
      clearAids(); targetBox.hidden = true;
      slot.style.removeProperty('--ed-extra');
      delete root.dataset.drag; delete selBox.dataset.active;
    }
    function onUp(e) {
      if (fdrag) return freeUp(e);
      const d = drag;
      if (!d || e.pointerId !== d.id) return;
      if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; if (d.started && moveEv && e.type !== 'pointercancel') step(moveEv); }
      // a drop while the reflow intent is still pending IS the intent: resolve it now (no waiting after release)
      const pend = d.waiting && d.waiting.sig === d.sig && !d.cross && e.type !== 'pointercancel' ? d.waiting : null;
      clearIntent(d);
      if (pend) applyReflow(d, pend.r, pend.hits);
      drag = null; cancelAnimationFrame(autoT); autoT = 0; lastEv = null; edgeSince = 0; moveEv = null;
      root.classList.remove('is-dragging');
      try { d.captureEl.releasePointerCapture(d.id); } catch (err) { /* already released */ }
      targetBox.hidden = true; ghost.hidden = true;
      if (!d.started) return;
      if (e.type === 'pointercancel') { settle(d, false); restoreText(d.before); say('The browser interrupted the drag — nothing was changed', 'warn'); return; }
      if (d.cross) {
        settle(d, false);
        const tgt = d.cross;
        restoreText(d.before);                                      // undo the pin of the source grid
        const rec = recs.get(d.rec.id);
        return reparent(rec, tgt.pid, d.crossCell, d.before);
      }
      if (d.block) {
        const text = blockedText(d);
        settle(d, true);
        setTimeout(() => restoreText(d.before), 230);               // after the return animation
        say(`Can't place it there — ${text.charAt(0).toLowerCase()}${text.slice(1)}`, 'warn');
        return;
      }
      if (!sameCell(d.cur, d.start) || d.moved.length) {
        const el = d.rec.el, key = d.m.key, moved = d.moved.slice(), cells = d.result;
        const label = d.kind === 'move' ? 'move' : 'resize';
        flip([el], () => {
          el.style.transition = 'none';
          settle(d, false);
          mutate(label, () => {
            writeLayout(d.rec, key, d.cur);
            moved.forEach((id) => { const r = recs.get(id); if (r) writeLayout(r, key, cells.get(id)); });
            if (d.rec.item.parent) growToFit(d.rec.item.parent);
          }, { before: d.before });
          el.style.transition = '';
        });
        if (moved.length) say(`${label === 'move' ? 'Moved' : 'Resized'} · ${moved.length} item${moved.length > 1 ? 's' : ''} moved out of the way — Undo restores all`);
        else if (d.note) say(d.note);
      } else { settle(d, false); if (snap() !== d.before) restoreText(d.before); }   // nothing changed: drop the pin
      after();
    }
    function cancelDrag() {
      if (fdrag) { const d = fdrag; fdrag = null; root.classList.remove('is-dragging'); delete root.dataset.drag; delete selBox.dataset.active; if (d.started) { d.rec.el.classList.remove('is-floating'); d.surface.free.place(d.rec.id, d.start); clearAids(); } say('Drag cancelled'); return; }
      const d = drag; if (!d) return;
      clearIntent(d);
      drag = null; cancelAnimationFrame(autoT); autoT = 0; lastEv = null; edgeSince = 0; cancelAnimationFrame(moveRaf); moveRaf = 0; moveEv = null;
      root.classList.remove('is-dragging');
      try { d.captureEl.releasePointerCapture(d.id); } catch (err) { /* already released */ }
      targetBox.hidden = true; ghost.hidden = true;
      if (d.started) { settle(d, true); restoreText(d.before); }
      say('Drag cancelled — the layout is unchanged');
    }
    const handleEls = [...selBox.querySelectorAll('.ed-sel__h')];
    [canvas, selBox.querySelector('.ed-sel__move'), ...handleEls].forEach((n) => {
      n.addEventListener('pointermove', onMove);
      n.addEventListener('pointerup', onUp);
      n.addEventListener('pointercancel', onUp);
    });

    /* ================================================================== keyboard */
    let keepDeselected = false;               // Escape: focus returns to the item without selecting it again
    canvas.addEventListener('focusin', (e) => {
      if (!editing || keepDeselected) return;
      const el = e.target.closest?.('.mg__item');
      if (el && el === e.target && el.dataset.gridId !== selected) select(el.dataset.gridId);
    });
    document.addEventListener('keydown', (e) => {
      if (!editing || e.defaultPrevented || document.querySelector('dialog[open]')) return;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      // history shortcuts — never while typing in a field
      if (mod && !typing(e.target) && (k === 'z' || k === 'y')) {
        e.preventDefault();
        if (k === 'y' || (k === 'z' && e.shiftKey)) redo(); else undo();
        return;
      }
      if (!root.contains(e.target) && e.target !== document.body) return;
      if (typing(e.target)) return;
      const rec = selected && recs.get(selected);
      if (e.key === 'Escape') {
        if (drag || fdrag) { e.preventDefault(); cancelDrag(); return; }
        if (msel.size > 1) { e.preventDefault(); select(selected); return; }
        if (rec) { e.preventDefault(); const id = selected; select(null); keepDeselected = true; try { recs.get(id)?.el.focus(); } finally { keepDeselected = false; } }
        return;
      }
      // Ctrl / ⌘ + A: every item of the selected item's grid (or of the page grid)
      if (mod && k === 'a' && canvas.contains(e.target)) { e.preventDefault(); selectAllInGrid(); return; }
      if (msel.size > 1 && (e.key === 'Delete' || e.key === 'Backspace') && (canvas.contains(e.target) || panel.contains(e.target))) { e.preventDefault(); removeMulti(); return; }
      if (msel.size > 1 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && (canvas.contains(e.target) || panel.contains(e.target) || e.target === document.body) && !e.shiftKey && !/^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) {
        e.preventDefault();
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        groupApply(`move ${msel.size} items`, (cells) => new Map([...cells].map(([id, c]) => [id, { ...c, x: c.x + d[0], y: c.y + d[1] }])));
        return;
      }
      if (mod && k === 'c' && rec && !String(window.getSelection())) { e.preventDefault(); copy(rec); return; }
      if (mod && k === 'v' && clipboard) { e.preventDefault(); paste(); return; }
      const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (!rec || !dirs[e.key] || !canvas.contains(e.target)) return;
      e.preventDefault();
      const [dx, dy] = dirs[e.key];
      if (rec.free) { const step = e.altKey ? 10 : 1; if (e.shiftKey) resize(rec, dx, dy, step); else move(rec, dx, dy, step); }   // px; Alt = 10 px
      else if (e.shiftKey) resize(rec, dx, dy); else move(rec, dx, dy);
      recs.get(rec.id)?.el.focus({ preventScroll: true });
    });

    /* ================================================================== multi-selection (one grid, the edited screen size) */
    const gridItemRec = (id) => { const r = recs.get(id); return r && r.el && !r.free && r.gridRoot ? r : null; };
    function toggleMulti(id) {
      const a = gridItemRec(selected), b = gridItemRec(id);
      if (!a || !b) return say('Only items placed on a grid can be selected together', 'warn');
      if (a.gridRoot !== b.gridRoot) return say('Select items of the same grid (the page, or the same container) together', 'warn');
      if (!msel.size) msel.add(selected);
      if (msel.has(id)) { msel.delete(id); if (id === selected) selected = [...msel][0] || null; } else msel.add(id);
      if (msel.size < 2) { const only = [...msel][0] || selected; msel.clear(); select(only, false); return; }
      decorate(); drawSelection(); renderPanel();
      say(`${msel.size} items selected`);
    }
    function selectAllInGrid() {
      const base = gridItemRec(selected);
      const root = base ? base.gridRoot : topRoot;
      const ids = [...recs.values()].filter((r) => r.el && !r.free && r.gridRoot === root && r.el.isConnected && getComputedStyle(r.el).display !== 'none').map((r) => r.id);
      if (ids.length < 2) return;
      selected = ids.includes(selected) ? selected : ids[0];
      msel.clear(); ids.forEach((i) => msel.add(i));
      decorate(); drawSelection(); renderPanel(); say(`${ids.length} items selected`);
    }
    /** the selected items' cells at the edited screen size (their grid's metrics) */
    function multiCells() {
      const rs = [...msel].map(gridItemRec).filter(Boolean);
      if (rs.length < 2) return null;
      const m = metrics(rs[0].gridRoot);
      return { rs, m, cells: new Map(rs.map((r) => [r.id, cellOf(r.el, m)])) };
    }
    /** apply new cells to the selection — refused (nothing changes) when one would leave the grid or overlap another item */
    function groupApply(label, compute) {
      const g = multiCells();
      if (!g) return;
      if (g.m.key === 'mobile') return say('On phones items follow each other in order — align and distribute on Tablet or Desktop', 'warn');
      const next = compute(g.cells, g.m);
      const others = cellsIn(g.rs[0].gridRoot, g.m).filter((o) => !msel.has(o.id));
      const all = [...next.entries()];
      for (const [id, c] of all) {
        if (c.x < 1 || c.y < 1 || c.w < 1 || c.h < 1 || c.x + c.w - 1 > g.m.cols) return say(`${nameOf(byId(id))} would leave the grid — nothing was changed`, 'warn');
        const hit = others.find((o) => overlap(o, c)) || all.find(([j, d]) => j !== id && overlap(d, c));
        if (hit) return say(`${nameOf(byId(id))} would overlap ${nameOf(byId(hit.id || hit[0]))} — nothing was changed`, 'warn');
      }
      if (all.every(([id, c]) => sameCell(c, g.cells.get(id)))) return say('Already like that');
      flip(g.rs.map((r) => r.el), () => mutate(label, () => {
        pinGrid(g.rs[0].gridRoot);
        g.rs.forEach((r) => writeLayout(r, g.m.key, next.get(r.id)));
        const par = g.rs[0].item.parent; if (par) growToFit(par);
      }));
      render(); decorate(); drawSelection(); renderPanel();
      say(`${label[0].toUpperCase()}${label.slice(1)}`);
    }
    /** align / distribute / same size: the first-selected item is the reference for sizes; the selection's bounds for edges */
    function arrange(kind) {
      const label = { left: 'align left', center: 'align centres', right: 'align right', top: 'align top', middle: 'align middles', bottom: 'align bottom',
        hspace: 'distribute horizontally', vspace: 'distribute vertically', width: 'same width', height: 'same height', size: 'same size' }[kind];
      groupApply(label, (cells) => {
        const list = [...cells.values()], ref = cells.get(selected) || list[0];
        const L = Math.min(...list.map((c) => c.x)), Rr = Math.max(...list.map((c) => c.x + c.w)), T = Math.min(...list.map((c) => c.y)), B = Math.max(...list.map((c) => c.y + c.h));
        const out = new Map();
        const ordered = (axis) => [...cells.entries()].sort((a, b) => a[1][axis] - b[1][axis]);
        if (kind === 'hspace' || kind === 'vspace') {
          const ax = kind === 'hspace' ? 'x' : 'y', sz = kind === 'hspace' ? 'w' : 'h', lo = kind === 'hspace' ? L : T, hi = kind === 'hspace' ? Rr : B;
          const o = ordered(ax), total = o.reduce((n, [, c]) => n + c[sz], 0), free = hi - lo - total, gaps = o.length - 1;
          let pos = lo;
          o.forEach(([id, c], i) => { out.set(id, { ...c, [ax]: pos }); pos += c[sz] + Math.floor(free / gaps) + (i < free % gaps ? 1 : 0); });
          return out;
        }
        cells.forEach((c, id) => {
          const n = { ...c };
          if (kind === 'left') n.x = L; if (kind === 'right') n.x = Rr - c.w; if (kind === 'center') n.x = Math.round((L + Rr - c.w) / 2);
          if (kind === 'top') n.y = T; if (kind === 'bottom') n.y = B - c.h; if (kind === 'middle') n.y = Math.round((T + B - c.h) / 2);
          if (kind === 'width' || kind === 'size') n.w = ref.w;
          if (kind === 'height' || kind === 'size') n.h = ref.h;
          out.set(id, n);
        });
        return out;
      });
    }
    function removeMulti() {
      const ids = new Set(msel);
      let grew = true;
      while (grew) { grew = false; model.items.forEach((i) => { if (i.parent && ids.has(i.parent) && !ids.has(i.id)) { ids.add(i.id); grew = true; } }); }
      const n = msel.size;
      mutate(`remove ${n} items`, () => { model.items = model.items.filter((i) => !ids.has(i.id)); selected = null; msel.clear(); }, { rerender: true });
      renderPanel();
      say(`Removed ${n} items — Undo restores them`);
    }
    /** the inspector while several items are selected */
    function multiPanel() {
      const g = multiCells();
      const mobile = g && g.m.key === 'mobile';
      const b = (k, text, title) => h('button', { type: 'button', class: 'ed-btn', 'data-k': `msel-${k}`, title, disabled: mobile || ((k === 'hspace' || k === 'vspace') && msel.size < 3), onclick: () => arrange(k) }, h('span', { text }));
      return [h('div', { class: 'ed-panel__sec ed-msel', 'data-k': 'msel-panel' }, [
        h('h3', { class: 'ed-panel__title', text: `${msel.size} items selected` }),
        h('p', { class: 'ed-hint', text: `${g ? BP_LABEL[g.m.key] : ''} layout · ${[...msel].map((id) => nameOf(byId(id))).join(', ')}. Shift / Ctrl + click adds or removes an item; arrow keys move them together; Esc deselects.` }),
        h('h4', { class: 'ed-sub', text: 'Align' }),
        h('div', { class: 'ed-multi__row' }, [b('left', 'Left'), b('center', 'Centre'), b('right', 'Right'), b('top', 'Top'), b('middle', 'Middle'), b('bottom', 'Bottom')]),
        h('h4', { class: 'ed-sub', text: 'Spacing and size' }),
        h('div', { class: 'ed-multi__row' }, [b('hspace', 'Distribute across', 'Equal gaps from left to right (3 or more items)'), b('vspace', 'Distribute down', 'Equal gaps from top to bottom (3 or more items)'),
          b('width', 'Same width', 'Every item as wide as the first one selected'), b('height', 'Same height', 'Every item as tall as the first one selected'), b('size', 'Same size')]),
        mobile ? h('p', { class: 'ed-hint', text: 'Phones: items follow each other in order — switch to Tablet or Desktop to align them.' }) : null,
        h('div', { class: 'ed-multi__row' }, [
          h('button', { type: 'button', class: 'ed-btn ed-btn--danger', 'data-k': 'msel-remove', onclick: () => { if (global.confirm && !global.confirm(`Remove ${msel.size} items? Undo restores them.`)) return; removeMulti(); } }, h('span', { text: `Remove ${msel.size} items` })),
          h('button', { type: 'button', class: 'ed-btn ed-btn--ghost', 'data-k': 'msel-clear', onclick: () => select(selected) }, h('span', { text: 'Deselect' })),
        ]),
      ])];
    }

    /* ================================================================== inspector */
    function renderPanel() {
      const a = document.activeElement, keep = panel.contains(a) && (a.getAttribute('aria-label') || a.dataset.k);
      panel.replaceChildren();
      if (!editing) return;
      const rec = selected && recs.get(selected);
      const grip = h('button', { type: 'button', class: 'ed-panel__grip', 'aria-expanded': String(!panel.classList.contains('is-collapsed')), 'aria-label': panel.classList.contains('is-collapsed') ? 'Show the inspector' : 'Minimise the inspector',
        onclick: () => { sheetChosen = true; panel.classList.toggle('is-collapsed'); renderPanel(); requestAnimationFrame(layout); } }, h('span', { class: 'ed-panel__grip-bar' }));
      panel.append(grip, ...(msel.size > 1 ? multiPanel() : rec ? itemPanel(rec) : [dashPanel()]), layersPanel());
      if (keep) {
        const b = [...panel.querySelectorAll('[aria-label], [data-k]')].find((n) => (n.getAttribute('aria-label') || n.dataset.k) === keep);
        if (b && !b.disabled) b.focus({ preventScroll: true });
      }
    }
    const field = (label, input) => h('label', { class: 'ed-field' }, [h('span', { text: label }), input]);
    const glyphOf = (type) => { const s = svg(''); s.innerHTML = R.TYPES[type].glyph; return s; };
    function dashPanel() {
      const d = model;
      if (designingPopup()) {
        const cfg = R.fullConfig('popup', d.config);
        return h('section', { class: 'ed-sec' }, [
          h('div', { class: 'ed-sec__top' }, [h('div', {}, [h('h3', { class: 'ed-sec__h', text: `Popup · ${d.name}` }), h('p', { class: 'ed-id', text: `${d.items.length} items · ${cfg.size === 'custom' ? 'custom size' : cfg.size === 'full' ? 'full screen' : 'fit content'} · id ${d.id}` })]),
            h('button', { type: 'button', class: 'ed-btn', 'data-k': 'popup-settings-panel', onclick: () => openPopupSettings(d.id) }, h('span', { text: 'Settings' }))]),
          h('div', { class: 'ed-actions' }, [
            h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'add-dash', onclick: () => openAdd(null) }, [svg('plus'), h('span', { text: 'Add widget' })]),
            h('button', { type: 'button', class: 'ed-btn', 'data-k': 'preview-panel', onclick: () => openPopupById(d.id) }, h('span', { text: 'Preview' })),
            h('button', { type: 'button', class: 'ed-btn', 'data-k': 'back-panel', onclick: () => designPage() }, h('span', { text: 'Back to the page' })),
            clipboard ? h('button', { type: 'button', class: 'ed-btn', 'data-k': 'paste', onclick: paste }, h('span', { text: `Paste ${R.TYPES[clipboard.type].label}` })) : null,
          ]),
          h('p', { class: 'ed-hint', text: 'Popup content is a free surface on Desktop and Tablet (place items to the pixel; drag the corner handle to resize a Custom size) and the structured 4-column layout on Mobile.' }),
        ]);
      }
      return h('section', { class: 'ed-sec' }, [
        h('div', { class: 'ed-sec__top' }, [h('div', {}, [h('h3', { class: 'ed-sec__h', text: `Page · ${d.name}` }), h('p', { class: 'ed-id', text: `${model.items.length} items · page ${app.pages.indexOf(model) + 1} of ${app.pages.length}${d.id === app.app.startPage ? ' · start page' : ''}${d.nav ? '' : ' · not in the dock'}` })]),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'settings', onclick: openSettings }, h('span', { text: 'Settings' }))]),
        h('div', { class: 'ed-actions' }, [
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'pages', onclick: () => openPages() }, [svg('pages'), h('span', { text: 'Manage pages' })]),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'add-page', onclick: () => addPage() }, [svg('plus'), h('span', { text: 'New page' })]),
        ]),
        h('div', { class: 'ed-actions' }, [
          h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'add-dash', onclick: () => openAdd(null) }, [svg('plus'), h('span', { text: 'Add widget' })]),
          clipboard ? h('button', { type: 'button', class: 'ed-btn', 'data-k': 'paste', onclick: paste }, h('span', { text: `Paste ${R.TYPES[clipboard.type].label}` })) : null,
        ]),
        h('p', { class: 'ed-hint', text: 'Select an item on the canvas or in the list. Mouse: drag to move, drag onto a container to put it inside. Touch: use the handles or the buttons. Arrow keys move, Shift + arrows resize, Ctrl+Z / Ctrl+Shift+Z undo / redo.' }),
        screenSection(),
      ]);
    }
    /* ---- SCREEN LAYOUTS: every screen size keeps its OWN layout (layout.desktop / .tablet / .mobile) — changing one never touches the
       others. The page panel says how the screen size being edited gets its layout, copies another screen's layout onto it (converted to
       its columns and rows: places and sizes kept as closely as the grid allows), or makes it automatic again. One undo step each. */
    const BP_ORDER = ['desktop', 'tablet', 'mobile'];
    function screenState(bp) {
      const items = model.items.filter((i) => !isFloating(i) && (!i.parent || nestable(byId(i.parent))));
      const own = items.filter((i) => i.layout && i.layout[bp]).length;
      return { items: items.length, own };
    }
    /** copy the page's layouts of screen `from` onto screen `to` (every item of the page grid and of its containers) */
    function copyScreen(from, to) {
      const geo = gridGeo(), pitch = (bp) => { const g = geo ? geo[bp] : G.LEGACY[bp]; return g.row + g.gap; };
      const nestPitch = (bp) => { const g = geo ? geo[bp] : G.NESTED_LEGACY[bp]; return g.row + g.gap; };
      const c1 = colsOf(from), c2 = colsOf(to);
      const order = [];
      mutate(`copy the ${BP_LABEL[from]} layout to ${BP_LABEL[to]}`, () => {
        model.items.forEach((it) => {
          if (isFloating(it) || (it.parent && !nestable(byId(it.parent)))) return;
          const L = it.layout && (it.layout[from] || (from !== 'desktop' && it.layout.desktop));
          if (!L) return;
          const inBox = !!it.parent;
          const rows = G.remap(Number.isInteger(L.y) ? L.y : 1, L.h || 1, inBox ? nestPitch(from) : pitch(from), inBox ? nestPitch(to) : pitch(to));
          if (to === 'mobile') { it.layout.mobile = { w: Math.max(1, Math.min(4, Math.round((L.w || 1) * 4 / c1))) >= 3 ? 4 : 2, h: rows.size }; if (!it.parent) order.push([L.y || 0, L.x || 0, it]); return; }
          const cols = G.remap(Number.isInteger(L.x) ? L.x : 1, L.w || 1, 1 / c1, 1 / c2);
          const w = Math.min(Math.max(1, cols.size), c2);
          it.layout[to] = { x: Math.max(1, Math.min(cols.start, c2 - w + 1)), y: rows.start, w, h: rows.size, ...(it.layout[to] && it.layout[to].hide ? { hide: true } : {}) };
        });
        // phones show the page grid's items one after another in the page's order: reading order of the copied layout
        if (to === 'mobile' && order.length) {
          const tops = order.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
          const rest = model.items.filter((i) => !tops.includes(i));
          model.items = [...tops, ...rest];
        }
      }, { rerender: true });
      say(`${BP_LABEL[to]} now has the ${BP_LABEL[from]} layout (converted to its grid) — Undo restores the previous one`);
    }
    /** a screen size back to AUTOMATIC: Tablet follows Desktop's sizes and fills its rows in order; Mobile stacks in order */
    function autoScreen(bp) {
      mutate(`make the ${BP_LABEL[bp]} layout automatic`, () => {
        model.items.forEach((it) => { if (it.layout && it.layout[bp] && !isFloating(it)) { const hide = it.layout[bp].hide; delete it.layout[bp]; if (hide) it.layout[bp] = { ...(bp === 'mobile' ? { w: 4, h: 4 } : { w: 4, h: 4 }), hide: true }; } });
      }, { rerender: true });
      say(`${BP_LABEL[bp]} layout is automatic again — Undo restores your own`);
    }
    function screenSection() {
      if (designingPopup()) return null;
      const bp = frameBp, st = screenState(bp);
      const what = bp === 'desktop' ? `Desktop: ${st.own} of ${st.items} items placed`
        : st.own === 0 ? `${BP_LABEL[bp]}: automatic — ${bp === 'tablet' ? 'follows the Desktop sizes, in order' : 'one column, in page order'}`
          : `${BP_LABEL[bp]}: its own layout for ${st.own} of ${st.items} items${st.own < st.items ? ` (the others ${bp === 'tablet' ? 'follow Desktop' : 'stack in order'})` : ''}`;
      const ask = (btn, q, fn) => confirmStep(btn, q, fn);
      const from = BP_ORDER.filter((x) => x !== bp && (x === 'desktop' || screenState(x).own > 0) && x !== 'mobile');
      return h('div', { class: 'ed-screen', 'data-k': 'screen-section' }, [
        h('h4', { class: 'ed-sub', text: 'Screen layout' }),
        h('p', { class: 'ed-hint', 'data-k': 'screen-state', text: `${what}. Each screen size keeps its own layout; changing one never changes the others.` }),
        h('div', { class: 'ed-actions' }, [
          ...from.map((f) => h('button', { type: 'button', class: 'ed-btn', 'data-k': `screen-copy-${f}`, onclick: (e) => ask(e.currentTarget, `Replace the ${BP_LABEL[bp]} layout of this page with the ${BP_LABEL[f]} layout?`, () => copyScreen(f, bp)) }, h('span', { text: `Copy from ${BP_LABEL[f]}` }))),
          bp !== 'desktop' && st.own ? h('button', { type: 'button', class: 'ed-btn ed-btn--ghost', 'data-k': 'screen-auto', onclick: (e) => ask(e.currentTarget, `Make the ${BP_LABEL[bp]} layout of this page automatic? Your own ${BP_LABEL[bp]} positions are removed (Undo brings them back).`, () => autoScreen(bp)) }, h('span', { text: 'Make automatic' })) : null,
        ]),
      ]);
    }
    /** where an item can be placed (the "Placed in" choices) */
    function placeOptions(it) {
      const T = R.TYPES[it.type];
      if (T.isFloating) return null;
      const top = designingPopup() ? 'The popup (free surface)' : 'Dashboard (top level)';
      const conts = model.items.filter((i) => i.id !== it.id && (isFloating(i) || (isBox(i) && !isBox(it))));
      return [{ value: '', label: top }, ...conts.map((ct) => ({ value: ct.id, label: `${isFloating(ct) ? 'Floating' : 'Container'} · ${nameOf(ct)}${ct.parent ? ` (in ${nameOf(byId(ct.parent))})` : ''}` }))];
    }
    function itemPanel(rec) {
      const it = rec.item, T = R.TYPES[it.type];
      if (rec.free || !rec.gridRoot || !rec.gridRoot.isConnected) return freePanel(rec);
      const m = metrics(rec.gridRoot), c = cellOf(rec.el, m);
      const flow = m.key === 'mobile';
      const where = it.parent ? `${nameOf(byId(it.parent))} grid` : 'Dashboard grid';
      const del = h('button', { type: 'button', class: 'ed-btn ed-btn--danger', 'data-k': 'remove' }, h('span', { text: isBox(it) && allItemsOf(it.id).length ? `Remove with ${allItemsOf(it.id).length} items` : 'Remove' }));
      del.addEventListener('click', () => confirmStep(del, isBox(it) && allItemsOf(it.id).length ? `Confirm: remove with ${allItemsOf(it.id).length} items` : 'Confirm remove', () => remove(rec)));
      const head = h('section', { class: 'ed-sec ed-sec--item' }, [
        h('div', { class: 'ed-sec__top' }, [
          h('div', { class: 'ed-item-id' }, [h('span', { class: 'ed-glyph' }, glyphOf(it.type)), h('div', {}, [h('h3', { class: 'ed-sec__h', text: nameOf(it) }), h('p', { class: 'ed-id', text: `${T.label} · id ${it.id}` })])]),
          h('button', { type: 'button', class: 'ed-btn ed-btn--ghost', 'data-k': 'deselect', onclick: () => select(null) }, h('span', { text: 'Deselect' })),
        ]),
        h('div', { class: 'ed-actions' }, [
          h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'edit-config', onclick: () => openEdit(rec) }, [svg('pen'), h('span', { text: isBox(it) ? `Edit ${R.TYPES[it.type].label.toLowerCase()}` : 'Edit configuration' })]),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'duplicate', onclick: () => duplicate(rec) }, h('span', { text: 'Duplicate' })),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'copy', onclick: () => copy(rec) }, h('span', { text: 'Copy' })),
          isBox(it) ? null : h('button', { type: 'button', class: 'ed-btn', 'data-k': 'copy-style', title: 'Copy only the look (corners, theme) — never the entity, settings or layout', onclick: () => { styleClip = { type: it.type, style: R.styleOf(it.config) }; say(`Copied the style of ${labelOf(it)}`); renderPanel(); } }, h('span', { text: 'Copy style' })),
          isBox(it) || !styleClip ? null : h('button', { type: 'button', class: 'ed-btn', 'data-k': 'paste-style', onclick: () => { mutate('paste style', () => { it.config = R.withStyle(it.type, it.config, styleClip.style); }, { rerender: true }); select(it.id); say(`Pasted the style onto ${labelOf(it)}`); } }, h('span', { text: 'Paste style' })),
          del,
        ]),
      ]);
      const po = placeOptions(it);
      if (po) head.append(field('Placed in', h('select', { 'data-k': 'parent', onchange: (e) => reparent(rec, e.target.value) }, po.map((o) => h('option', { value: o.value, text: o.label, selected: (it.parent || '') === o.value })))));
      const B = (label, aria, fn, disabled) => h('button', { type: 'button', class: 'ed-step', 'aria-label': aria, title: aria, disabled: !!disabled, onclick: fn }, label);
      const lay = h('section', { class: 'ed-sec ed-sec--layout' }, [
        h('h4', { class: 'ed-sub', text: 'Layout' }),
        h('p', { class: 'ed-pos__where' }, [h('b', { text: where }), ` · ${BP_LABEL[m.key]} · ${m.cols} columns`]),
        h('p', { class: 'ed-pos__read', text: flow ? `order ${itemsOf(it.parent).indexOf(it) + 1} of ${itemsOf(it.parent).length} · w ${c.w} · h ${c.h}` : `x ${c.x} · y ${c.y} · w ${c.w} · h ${c.h}` }),
        h('div', { class: 'ed-pos__row' }, flow ? [
          B(svg('up'), 'Move earlier', () => reorder(rec, -1)), B(svg('down'), 'Move later', () => reorder(rec, 1)),
        ] : [
          B(svg('left'), 'Move left', () => move(rec, -1, 0), c.x <= 1), B(svg('up'), 'Move up', () => move(rec, 0, -1), c.y <= 1),
          B(svg('down'), 'Move down', () => move(rec, 0, 1)), B(svg('right'), 'Move right', () => move(rec, 1, 0), c.x + c.w > m.cols),
        ]),
        h('div', { class: 'ed-pos__row' }, [
          B(h('span', { text: 'W−' }), 'Narrower', () => resize(rec, -1, 0)), B(h('span', { text: 'W+' }), 'Wider', () => resize(rec, 1, 0)),
          B(h('span', { text: 'H−' }), 'Shorter', () => resize(rec, 0, -1)), B(h('span', { text: 'H+' }), 'Taller', () => resize(rec, 0, 1)),
        ]),
        // EXACT position and size (grid units of this breakpoint): typed, then the same reflow as a move / resize (the items in the way move)
        h('div', { class: 'ed-pos__row ed-pos__exact' }, (flow ? [['w', 'W'], ['h', 'H']] : [['x', 'X'], ['y', 'Y'], ['w', 'W'], ['h', 'H']]).map(([k, label]) => h('label', { class: 'ed-pos__num' }, [h('span', { text: label }),
          h('input', { type: 'number', min: '1', step: '1', value: String(c[k]), 'data-k': `pos-${k}`, 'aria-label': `${label} (grid units)`, onchange: (e) => {
            const v = Math.round(Number(e.target.value)); if (!Number.isFinite(v) || v < 1) { e.target.value = String(c[k]); return; }
            const want = { ...c, [k]: v }, sized = clampSize(rec.item, m.key, m, want).cell, cand = { ...sized, x: flow ? c.x : clamp(want.x, 1, m.cols - sized.w + 1), y: flow ? c.y : Math.max(1, want.y) };
            if (sameCell(cand, c)) { e.target.value = String(c[k]); return; }
            keyReflow(rec, m, cand, { x: Math.sign(cand.x - c.x || cand.w - c.w), y: Math.sign(cand.y - c.y || cand.h - c.h) }, c, k === 'x' || k === 'y' ? 'move' : 'resize');
          } })]))),
        // HIDE at this screen size (e.g. a tablet sidebar on a phone, where the dock navigates): kept in the other layouts
        h('label', { class: 'ed-check' }, [h('input', { type: 'checkbox', 'data-k': 'pos-hide', checked: !!(it.layout && it.layout[m.key] && it.layout[m.key].hide),
          onchange: (e) => { const on = e.target.checked; mutate(on ? 'hide at this size' : 'show at this size', () => { it.layout = it.layout || {}; const L = it.layout[m.key] || { w: c.w, h: c.h };
            if (on) L.hide = true; else delete L.hide; it.layout[m.key] = L; }, { rerender: true }); } }), h('span', { text: `Hide on ${BP_LABEL[m.key].toLowerCase()} screens` })]),
        h('p', { class: 'ed-hint', text: flow ? `${BP_LABEL[m.key]} flows in reading order: no x / y. Only this breakpoint changes.` : `Only the ${m.key} layout of this item changes.` }),
      ]);
      const out = [head, lay];
      if (R.TYPES[it.type].isContainer) out.push(contentsPanel(rec));
      return out;
    }
    /** the common head of the inspector (identity + actions + placement) */
    function headPanel(rec) {
      const it = rec.item, T = R.TYPES[it.type];
      const kids = model.items.filter((i) => i.parent === it.id).length;
      const del = h('button', { type: 'button', class: 'ed-btn ed-btn--danger', 'data-k': 'remove' }, h('span', { text: T.isContainer && kids ? `Remove with ${kids} items` : 'Remove' }));
      del.addEventListener('click', () => confirmStep(del, T.isContainer && kids ? `Confirm: remove with ${kids} items` : 'Confirm remove', () => remove(rec)));
      const head = h('section', { class: 'ed-sec ed-sec--item' }, [
        h('div', { class: 'ed-sec__top' }, [
          h('div', { class: 'ed-item-id' }, [h('span', { class: 'ed-glyph' }, glyphOf(it.type)), h('div', {}, [h('h3', { class: 'ed-sec__h', text: nameOf(it) }), h('p', { class: 'ed-id', text: `${T.label} · id ${it.id}` })])]),
          h('button', { type: 'button', class: 'ed-btn ed-btn--ghost', 'data-k': 'deselect', onclick: () => select(null) }, h('span', { text: 'Deselect' })),
        ]),
        h('div', { class: 'ed-actions' }, [
          h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'edit-config', onclick: () => openEdit(rec) }, [svg('pen'), h('span', { text: T.isContainer ? `Edit ${T.label.toLowerCase()}` : 'Edit configuration' })]),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'duplicate', onclick: () => duplicate(rec) }, h('span', { text: 'Duplicate' })),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'copy', onclick: () => copy(rec) }, h('span', { text: 'Copy' })),
          del,
        ]),
      ]);
      const po = placeOptions(it);
      if (po) head.append(field('Placed in', h('select', { 'data-k': 'parent', onchange: (e) => reparent(rec, e.target.value) }, po.map((o) => h('option', { value: o.value, text: o.label, selected: (it.parent || '') === o.value })))));
      return head;
    }
    /** an item on a free surface: exact px position / size (typed or nudged) */
    function freePanel(rec) {
      const it = rec.item;
      const head = headPanel(rec);
      if (rec.hiddenMobile || !rec.el || !rec.free) {
        return [head, h('section', { class: 'ed-sec' }, [h('p', { class: 'ed-hint', text: 'This floating container is hidden on mobile. Switch its Mobile behaviour (Edit) to Structured or Keep floating to design it here.' })])];
      }
      const f = frameOfEl(rec.el), key = rec.gridRoot.dataset.bp;
      const num = (k, label) => h('label', { class: 'ed-field ed-field--num' }, [h('span', { text: label }), h('input', { type: 'number', step: '1', min: k === 'w' || k === 'h' ? '8' : '0', value: String(f[k]), 'data-k': `frame-${k}`, 'aria-label': `${label} (px)`,
        onchange: (e) => { const v = Math.round(Number(e.target.value)); if (!Number.isFinite(v)) return renderPanel(); freeChange(rec, { ...frameOfEl(rec.el), [k]: v }, k === 'w' || k === 'h' ? 'resize' : 'move'); } })]);
      const B = (label, aria, fn) => h('button', { type: 'button', class: 'ed-step', 'aria-label': aria, title: aria, onclick: fn }, label);
      const surfaceName = isFloatRadial(it) ? 'Dashboard float layer (overlay)' : it.parent ? nameOf(byId(it.parent)) : 'Popup';
      const lay = h('section', { class: 'ed-sec ed-sec--layout' }, [
        h('h4', { class: 'ed-sub', text: 'Free placement' }),
        h('p', { class: 'ed-pos__where' }, [h('b', { text: `${surfaceName} · free surface` }), ` · ${BP_LABEL[key]} · px`]),
        h('div', { class: 'ed-pos__px' }, [num('x', 'X'), num('y', 'Y'), num('w', 'Width'), num('h', 'Height')]),
        h('div', { class: 'ed-pos__row' }, [
          B(svg('left'), 'Nudge left 1px', () => move(rec, -1, 0)), B(svg('up'), 'Nudge up 1px', () => move(rec, 0, -1)),
          B(svg('down'), 'Nudge down 1px', () => move(rec, 0, 1)), B(svg('right'), 'Nudge right 1px', () => move(rec, 1, 0)),
        ]),
        h('p', { class: 'ed-hint', text: `Coordinates are relative to the ${it.parent ? 'floating container' : 'popup'}, in px. Only the ${BP_LABEL[key]} placement changes${key === 'mobile' ? '' : ' (Desktop and Tablet are independent)'}. Drag snaps to the centre lines and to the edges / centres of other items within ${FREE_SNAP}px — hold Alt to place without snapping. Arrows nudge 1px (Alt+arrows 10px), Shift+arrows resize. Items cannot overlap.` }),
      ]);
      const out = [head, lay];
      if (isBox(it)) out.push(contentsPanel(rec));
      return out;
    }
    /** the items inside a selected container: select, move out, remove, add */
    function contentsPanel(rec) {
      const kids = itemsOf(rec.id);
      const list = h('ul', { class: 'ed-contents' });
      kids.forEach((k) => {
        const del = h('button', { type: 'button', class: 'ed-mini-btn ed-mini-btn--danger', 'aria-label': `Remove ${nameOf(k)}` }, svg('trash'));
        del.addEventListener('click', () => confirmStep(del, '', () => remove(recs.get(k.id) || { id: k.id, item: k }), true));
        list.append(h('li', {}, [
          h('button', { type: 'button', class: 'ed-contents__name', 'aria-label': `Select ${nameOf(k)}`, disabled: !recs.get(k.id), onclick: () => select(k.id, true) }, [h('span', { class: 'ed-layer-t', text: R.TYPES[k.type].label }), h('span', { class: 'ed-layer-n', text: nameOf(k) })]),
          recs.get(k.id) ? h('button', { type: 'button', class: 'ed-mini-btn', 'aria-label': `Move ${nameOf(k)} out to the dashboard`, title: 'Move out to the dashboard', onclick: () => reparent(recs.get(k.id), null) }, svg('out')) : null,
          del,
        ]));
      });
      // a tabbed container: which tab is being edited (the canvas shows that tab; its items are the ones listed / added here)
      const tabPick = rec.item.type === 'tabs' ? (() => {
        const tabs = tabsCfg(rec.item), cur = curTab(rec.id);
        const sel = h('select', { 'data-k': 'edit-tab', 'aria-label': 'Tab being edited', onchange: (e) => { editTab.set(rec.id, e.target.value); render(); select(rec.id); } },
          tabs.map((t) => { const n = allItemsOf(rec.id).filter((i) => tabOf(i, tabs) === t.id).length; return h('option', { value: t.id, text: `${t.label || t.id} · ${n} item${n === 1 ? '' : 's'}`, selected: t.id === cur }); }));
        return h('label', { class: 'ed-field' }, [h('span', { text: 'Editing tab' }), sel]);
      })() : null;
      return h('section', { class: 'ed-sec ed-sec--contents' }, [
        tabPick,
        h('h4', { class: 'ed-sub', text: `Contents${rec.item.type === 'tabs' ? ' of this tab' : ''} · ${kids.length} item${kids.length === 1 ? '' : 's'}` }),
        kids.length ? list : h('p', { class: 'ed-hint', text: isFloating(rec.item) ? 'Empty. Add a widget or container here, or move one in with "Placed in".' : 'Empty. Add a widget, or drag one onto this container.' }),
        h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'add-into', onclick: () => openAdd(rec.id) }, [svg('plus'), h('span', { text: 'Add widget here' })]),
      ]);
    }
    let layersUl;
    function layersPanel() {
      layersUl = h('ul', { class: 'ed-layers' });
      const row = (it, depth) => h('li', { class: depth ? `is-child${depth > 1 ? ' is-grandchild' : ''}` : '' }, h('button', {
        type: 'button', class: 'ed-layer-b', 'data-item': it.id, 'aria-pressed': String(it.id === selected), onclick: () => select(it.id, true),
      }, [h('span', { class: 'ed-layer-t', text: R.TYPES[it.type].label }), h('span', { class: 'ed-layer-n', text: nameOf(it) })]));
      const walk = (pid, depth) => itemsOf(pid).forEach((it) => { layersUl.append(row(it, depth)); if (R.TYPES[it.type].isContainer) walk(it.id, depth + 1); });
      walk(null, 0);
      return h('section', { class: 'ed-sec ed-sec--layers' }, [h('h3', { class: 'ed-sec__h', text: 'All items' }), layersUl]);
    }

    /** two-step confirmation for destructive buttons (icon buttons: armed state via class only) */
    function confirmStep(btn, text, fn, iconOnly) {
      const span = btn.querySelector('span');
      if (btn.dataset.armed === '1') {          // confirmed: put the button back as it was, then run
        btn.dataset.armed = ''; clearTimeout(btn._t); btn.classList.remove('is-armed');
        if (span && !iconOnly && btn.dataset.text !== undefined) span.textContent = btn.dataset.text;
        if (iconOnly && btn.dataset.label) btn.setAttribute('aria-label', btn.dataset.label);
        fn(); return;
      }
      const old = span && span.textContent;
      btn.dataset.text = old || '';
      btn.dataset.armed = '1'; if (span && !iconOnly) span.textContent = text; btn.classList.add('is-armed');
      if (iconOnly) { btn.dataset.label = btn.getAttribute('aria-label'); btn.setAttribute('aria-label', `Confirm: ${btn.dataset.label}`); }
      btn._t = setTimeout(() => {
        btn.dataset.armed = ''; if (span && !iconOnly) span.textContent = old; btn.classList.remove('is-armed');
        if (iconOnly) btn.setAttribute('aria-label', btn.dataset.label);
      }, 4000);
    }

    /* ================================================================== add / edit (shared schema dialog) */
    const targets = () => [{ value: '', label: designingPopup() ? 'The popup (free surface)' : 'Dashboard (top level)' }, ...model.items.filter((i) => R.TYPES[i.type].isContainer).map((c) => ({ value: c.id, label: `${isFloating(c) ? 'Floating' : c.type === 'tabs' ? 'Tabs' : 'Container'} · ${nameOf(c)}${c.type === 'tabs' ? ` › ${(tabsCfg(c).find((t) => t.id === curTab(c.id)) || {}).label || ''}` : ''}${c.parent ? ` (in ${nameOf(byId(c.parent))})` : ''}`, floating: isFloating(c) }))];
    function openAdd(target) {
      if (!editing) setEditing(true);
      const sel = selected && byId(selected);
      const t = target !== undefined ? target : (sel ? (R.TYPES[sel.type].isContainer ? sel.id : sel.parent) : null);
      global.MaisonConfigure.open({ mount: root, mode: 'add', targets: targets(), target: t || '', noFloating: designingPopup(), gallery: galleryStore(), onApply: ({ type, config, target: pid }) => addItem(type, config, pid) });
    }
    function openEdit(rec) {
      const rows = rec.free ? (() => { const f = frameOfEl(rec.el); return { w: global.MaisonFree.colsFor(f.w), h: Math.max(1, Math.round((f.h + 12) / 52)) }; })() : cellOf(rec.el, metrics(rec.gridRoot));
      global.MaisonConfigure.open({
        // the item's LOGICAL size (layout px — the zoom never counts): the preview's "Current" shows it exactly
        mount: root, mode: 'edit', type: rec.item.type, config: rec.item.config, size: { w: rows.w, h: rows.h, px: { w: rec.el.offsetWidth, h: rec.el.offsetHeight } },
        // the grid's logical units (the preview's own size choices use them — editor geometry only, never the item's)
        grid: rec.free ? null : (() => { const m = metrics(rec.gridRoot); return { cols: m.cols, colStep: m.colStep, rowStep: m.rowStep, gap: m.gap, rgap: m.rgap }; })(),
        onPreview: (cfg) => { try { rebuildItem(rec, R.previewSafe(rec.item.type, cfg)); } catch (err) { /* invalid draft: keep the last good preview */ } },
        onCancel: () => { rebuildItem(rec); drawSelection(); },
        onApply: ({ config }) => {
          // the stored config is complete AND normalised (e.g. a radial segment switched to "popup" drops its page)
          let dropped = 0;
          mutate(`edit ${R.TYPES[rec.item.type].label}`, () => {
            rec.item.config = R.fullConfig(rec.item.type, config); fitAfterConfig(rec.item);
            // a tab removed from a tabbed container takes its items with it (one history entry: Undo restores the tab AND its items)
            if (rec.item.type === 'tabs') {
              const ids = new Set(tabsCfg(rec.item).map((t) => t.id)), first = [...ids][0];
              const gone = new Set(allItemsOf(rec.item.id).filter((i) => (i.tab ? !ids.has(i.tab) : !first)).map((i) => i.id));
              dropped = gone.size;
              if (gone.size) model.items = model.items.filter((i) => !gone.has(i.id) && !gone.has(i.parent));
            }
          });
          if (dropped) say(`Removed ${dropped} item${dropped === 1 ? '' : 's'} with the removed tab — Undo restores them`);
          select(rec.item.id);
          say(`Applied ${labelOf(rec.item)}`);
        },
      });
    }

    /* ================================================================== dashboard settings */
    /** a segmented single choice (radiogroup) */
    function segChoice(label, values, cur, onPick, text = (v) => v[0].toUpperCase() + v.slice(1)) {
      let val = cur;
      const seg = h('div', { class: 'ed-seg', role: 'radiogroup', 'aria-label': label }, values.map((v) => h('button', {
        type: 'button', class: 'ed-seg__b', role: 'radio', 'aria-checked': String(v === cur), 'data-v': v,
        onclick: (e) => { val = v; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === e.currentTarget))); if (onPick) onPick(v); },
      }, h('span', { text: text(v) }))));
      seg.value = () => val;
      return seg;
    }
    const iconSelect = (cur, label) => h('select', { 'aria-label': label }, [h('option', { value: '', text: 'No icon', selected: !cur }), ...R.pageIcons().map((k) => h('option', { value: k, text: k, selected: k === cur }))]);
    const plainName = (v) => (!v ? 'A name is required' : v.length > 80 ? 'At most 80 characters' : /[<>]/.test(v) ? 'Names cannot contain < or >' : '');

    /** this page (name, icon, subtitle, background, dock, start) + the Navigation Dock edges */
    function openSettings() {
      const d = model;
      const t = h('input', { type: 'text', value: d.name || '', maxlength: '80', required: true, 'data-k': 'page-name' });
      const st = h('input', { type: 'text', value: d.subtitle || '', maxlength: '80', placeholder: 'Optional' });
      const ic = iconSelect(d.icon, 'Page icon');
      const bg = segChoice('Background', M.BACKGROUNDS, d.background || 'default', (b) => { canvas.dataset.bg = b; });
      const inDock = h('input', { type: 'checkbox', checked: d.nav !== false });
      const isStart = h('input', { type: 'checkbox', checked: app.app.startPage === d.id, disabled: app.app.startPage === d.id });
      const showHead = h('input', { type: 'checkbox', 'data-k': 'page-header', checked: d.header !== false });
      const pos = {};
      // each breakpoint: the edge as a segmented choice, beside a small live picture of where the dock sits on that screen
      const dockPic = (k) => { const pic = h('span', { class: `ed-dockpic ed-dockpic--${k}`, 'aria-hidden': 'true', 'data-edge': app.app.navigation[k] }, [h('i', { class: 'ed-dockpic__bar' }), h('i', { class: 'ed-dockpic__page' })]); return pic; };
      const pics = {};
      const navSecs = KEYS.map((k) => { pics[k] = dockPic(k); pos[k] = segChoice(`${BP_LABEL[k]} dock position`, M.DOCK[k], app.app.navigation[k], (v) => { pics[k].dataset.edge = v; }, (v) => (v === 'none' ? 'None (own navigation)' : v[0].toUpperCase() + v.slice(1)));
        return h('div', { class: 'ed-field ed-field--dock' }, [h('span', { text: BP_LABEL[k] }), h('div', { class: 'ed-field__row' }, [pics[k], pos[k]])]); });
      /* ---- Grid: the whole dashboard's page grid (all pages). Off = the legacy grid (nothing stored). */
      const LIM = M.GRID_LIMITS, cur = gridGeo(), start = cur || structuredClone(G.LEGACY);
      const gOn = h('input', { type: 'checkbox', checked: !!cur, 'data-k': 'grid-custom' });
      const gIn = {};
      const num = (k, f, lo, hi) => h('input', { type: 'number', min: lo, max: hi, step: 1, value: start[k][f] ?? 0, 'data-k': `grid-${k}-${f}`, 'aria-label': `${BP_LABEL[k]} ${f === 'cols' ? 'columns' : f === 'row' ? 'row height (px)' : f === 'gap' ? 'gap (px)' : 'page edge (px)'}`, oninput: () => syncGrid() });
      KEYS.forEach((k) => { gIn[k] = { cols: num(k, 'cols', ...LIM.cols[k]), row: num(k, 'row', ...LIM.row), gap: num(k, 'gap', ...LIM.gap), pad: num(k, 'pad', ...LIM.pad) }; });
      const PRESETS = [{ value: 'coarse', label: 'Coarse · 40px rows', row: 40 }, { value: 'normal', label: 'Normal · 20px rows', row: 20 }, { value: 'fine', label: 'Fine · 10px rows', row: 10 }, { value: 'custom', label: 'Custom' }];
      const density = h('select', { 'aria-label': 'Grid density', 'data-k': 'grid-density', onchange: () => {
        const pr = PRESETS.find((x) => x.value === density.value);
        if (pr && pr.row) KEYS.forEach((k) => { gIn[k].row.value = pr.row; });
        syncGrid();
      } }, PRESETS.map((x) => h('option', { value: x.value, text: x.label })));
      // COLUMN density: the column counts of the three screen sizes in one step (each can still be changed below)
      const CPRESETS = [{ value: 'standard', label: 'Standard · 12 / 8 / 4 columns', cols: { desktop: 12, tablet: 8, mobile: 4 } }, { value: 'fine', label: 'Fine · 24 / 16 / 8 columns', cols: { desktop: 24, tablet: 16, mobile: 8 } },
        { value: 'xfine', label: 'Extra fine · 48 / 32 / 16 columns', cols: { desktop: 48, tablet: 32, mobile: 16 } }, { value: 'custom', label: 'Custom' }];
      const cdensity = h('select', { 'aria-label': 'Column density', 'data-k': 'grid-cdensity', onchange: () => {
        const pr = CPRESETS.find((x) => x.value === cdensity.value);
        if (pr && pr.cols) KEYS.forEach((k) => { gIn[k].cols.value = pr.cols[k]; });
        syncGrid();
      } }, CPRESETS.map((x) => h('option', { value: x.value, text: x.label })));
      // the resulting CELL per screen size, in px at a typical width (the current preview width for the shown screen size): what a
      // grid step means on screen
      const cellOut = Object.fromEntries(KEYS.map((k) => [k, h('output', { class: 'ed-gridset__cell', 'data-k': `grid-${k}-cell` })]));
      const TYPICAL = { desktop: 1280, tablet: 834, mobile: 390 };
      const gTable = h('div', { class: 'ed-gridset ed-gridset--cells', role: 'group', 'aria-label': 'Grid geometry per breakpoint' }, [
        h('span'), h('b', { text: 'Columns' }), h('b', { text: 'Row height (px)' }), h('b', { text: 'Gap (px)' }), h('b', { text: 'Page edge (px)' }), h('b', { text: 'One step on screen' }),
        ...KEYS.flatMap((k) => [h('span', { text: BP_LABEL[k] }), gIn[k].cols, gIn[k].row, gIn[k].gap, gIn[k].pad, cellOut[k]]),
      ]);
      const gNote = h('p', { class: 'ed-hint ed-gridset__note', 'data-k': 'grid-note', role: 'status' });
      // KEEP SIZES (default): a grid change converts every layout so each widget keeps its place and size on screen
      const gKeep = h('input', { type: 'checkbox', checked: true, 'data-k': 'grid-keep', onchange: () => syncGrid() });
      const gKeepRow = h('label', { class: 'ed-check' }, [gKeep, h('span', { text: 'Keep every widget\'s size and place on screen (convert the layouts)' })]);
      const gBody = h('div', { class: 'ed-gridset__body' }, [h('div', { class: 'ed-field' }, [h('span', { text: 'Columns' }), cdensity]), h('div', { class: 'ed-field' }, [h('span', { text: 'Row height' }), density]), gTable, gKeepRow, gNote]);
      gOn.addEventListener('change', () => syncGrid());
      /** the values in the form (validated) → { geo, error } ; geo null = the legacy grid */
      function readGrid() {
        if (!gOn.checked) return { geo: null, error: '' };
        const geo = {};
        for (const k of KEYS) {
          geo[k] = {};
          for (const [f, [lo, hi]] of [['cols', LIM.cols[k]], ['row', LIM.row], ['gap', LIM.gap], ['pad', LIM.pad]]) {
            const v = Number(gIn[k][f].value);
            if (!Number.isInteger(v) || v < lo || v > hi) return { geo: null, error: `${BP_LABEL[k]} ${f === 'cols' ? 'columns' : f === 'row' ? 'row height' : f === 'gap' ? 'gap' : 'page edge'}: a whole number ${lo}–${hi}` };
            if (f !== 'pad' || v) geo[k][f] = v;     // no edge = nothing stored
          }
        }
        return { geo, error: '' };
      }
      const pageItems = () => app.pages.flatMap((pg) => pg.items.filter((i) => !i.parent));
      /** items whose layout no longer fits fewer columns (they are narrowed / pulled back on Apply) */
      const tooWide = (geo) => pageItems().filter((it) => KEYS.some((k) => { const L = it.layout[k], cols = geo ? geo[k].cols : COLS[k]; return L && ((L.w || 1) > cols || (L.x && L.x + (L.w || 1) - 1 > cols)); }));
      function syncGrid() {
        gBody.hidden = !gOn.checked;
        const pr = PRESETS.find((x) => x.row && KEYS.every((k) => Number(gIn[k].row.value) === x.row));
        density.value = pr ? pr.value : 'custom';
        const cp = CPRESETS.find((x) => x.cols && KEYS.every((k) => Number(gIn[k].cols.value) === x.cols[k]));
        cdensity.value = cp ? cp.value : 'custom';
        // one grid step on screen: a column's width (+ its gap) and a row's height (+ its gap) at a typical width of that screen size
        KEYS.forEach((k) => {
          const c = Number(gIn[k].cols.value), r = Number(gIn[k].row.value), g = Number(gIn[k].gap.value), pd = Number(gIn[k].pad.value) || 0;
          const W = k === frameBp ? Math.round(parseFloat(frame.style.width) || TYPICAL[k]) : TYPICAL[k];
          const col = (W - 2 * pd - (c - 1) * g) / c;
          cellOut[k].textContent = !(c > 0) || !Number.isFinite(col) ? '—' : `${Math.max(0, Math.round(col))} × ${r} px${g > col ? ' · gap wider than a column' : ''}`;
          cellOut[k].title = `At ${W} px wide: columns of ${Math.round(col)} px, rows of ${r} px, ${g} px between them — a widget moves in steps of ${Math.round(col + g)} × ${r + g} px`;
          cellOut[k].classList.toggle('is-warn', g > col);
        });
        const { geo, error } = readGrid(), was = cur || G.LEGACY, now = geo || G.LEGACY;
        if (error) { gNote.textContent = error; gNote.classList.add('is-warn'); return; }
        const changed = KEYS.filter((k) => ['cols', 'row', 'gap', 'pad'].some((f) => (was[k][f] || 0) !== (now[k][f] || 0)));
        const n = pageItems().length;
        const wide = tooWide(geo).length;
        gNote.classList.toggle('is-warn', !!changed.length && n > 0);
        gNote.textContent = !changed.length ? (geo ? 'Custom grid for every page of this dashboard. Containers use the same rows and gaps; their columns are the columns they span.' : 'The standard grid: 12 / 8 / 4 columns, 40px rows, 16 / 16 / 12px gaps.')
          : !n ? `Changes the grid of ${changed.map((k) => BP_LABEL[k]).join(', ')}.`
            : gKeep.checked ? `Changes the grid of ${changed.map((k) => BP_LABEL[k]).join(', ')}. Every widget (inside containers too) is converted to the new grid and keeps its place and size on screen, as closely as the new cells allow.`
              : `Changes the grid of ${changed.map((k) => BP_LABEL[k]).join(', ')}. Existing widgets keep their grid units (x, y, w, h), so their size on screen changes`
                + `${KEYS.some((k) => was[k].row !== now[k].row) ? ` — with other row heights they become taller or shorter` : ''}.${wide ? ` ${wide} widget${wide > 1 ? 's are' : ' is'} wider than the new column count and will be narrowed.` : ''}`;
      }
      /* ---- application settings (this installation — the server; not part of the dashboard or its undo history) */
      const D = opts.dashboards && typeof opts.dashboards.settings === 'function' ? opts.dashboards : null;
      const appSet = D ? D.settings() : { default: null, editButton: editButton };
      const defSel = D ? h('select', { 'aria-label': 'Default dashboard', 'data-k': 'default-dashboard' }, [h('option', { value: '', text: 'The one opened last on this device' })]) : null;
      if (defSel) D.list().then((r) => { if (!r || !r.ok) return; r.dashboards.forEach((x) => defSel.append(h('option', { value: x.id, text: x.name }))); defSel.value = appSet.default || ''; });
      const editVis = segChoice('Edit button', ['corner', 'always'], appSet.editButton || editButton, null, (v) => (v === 'corner' ? 'Hidden until the corner is used' : 'Always visible'));
      editVis.dataset.k = 'edit-button';
      // the SIMULATED HOME for this dashboard (app.simulated): design and try it without Home Assistant — every widget reads and acts on the
      // server's fictional home (server/ha/SimHa.php); a badge says so at all times
      const simChk = h('input', { type: 'checkbox', checked: app.app.simulated === true, 'data-k': 'set-simulated' });
      const aidChecks = [['grid', 'Show the design grid while editing'], ['snap', 'Snap to the grid'], ['guides', 'Position guides']].map(([k, label]) => {
        const c = h('input', { type: 'checkbox', checked: !!aid[k], 'data-k': `aid-${k}-pref` });
        return { k, c, el: h('label', { class: 'ed-check' }, [c, h('span', { text: label })]) };
      });
      const W = app.app.wall || {};
      const wNum = (k, max) => h('input', { type: 'number', min: '0', max: String(max), step: '1', value: String(W[k] || 0), 'data-k': `wall-${k}`, class: 'ed-input' });
      const wSaver = wNum('saver', 240), wHome = wNum('returnHome', 240), wPop = wNum('popupClose', 600);
      const wStyle = h('select', { 'data-k': 'wall-saverStyle', class: 'ed-input' }, [h('option', { value: 'clock', text: 'A dim clock that moves a little every minute' }), h('option', { value: 'black', text: 'Black screen' })]);
      wStyle.value = W.saverStyle || 'clock';
      const err = h('p', { class: 'ef-err', role: 'alert', hidden: true });
      let applied = false, dlg;
      const apply = () => {
        const name = t.value.trim(), sub = st.value.trim();
        const gr = readGrid();
        const bad = plainName(name) || (/[<>]/.test(sub) ? 'The subtitle cannot contain < or >' : '') || gr.error;
        if (bad) { err.hidden = false; err.textContent = bad; t.focus(); return; }
        applied = true;
        mutate('dashboard settings', () => {
          model.name = name;
          if (sub) model.subtitle = sub; else delete model.subtitle;
          if (bg.value() !== 'default') model.background = bg.value(); else delete model.background;
          if (ic.value) model.icon = ic.value; else delete model.icon;
          if (showHead.checked) delete model.header; else model.header = false;
          model.nav = inDock.checked;
          if (isStart.checked) app.app.startPage = model.id;
          if (simChk.checked) app.app.simulated = true; else delete app.app.simulated;
          const wall = {}, clampN = (el, max) => Math.max(0, Math.min(max, Math.round(Number(el.value) || 0)));
          if (clampN(wSaver, 240)) { wall.saver = clampN(wSaver, 240); if (wStyle.value === 'black') wall.saverStyle = 'black'; }
          if (clampN(wHome, 240)) wall.returnHome = clampN(wHome, 240);
          if (clampN(wPop, 600)) wall.popupClose = clampN(wPop, 600);
          if (Object.keys(wall).length) app.app.wall = wall; else delete app.app.wall;
          KEYS.forEach((k) => { app.app.navigation[k] = pos[k].value(); });
          // grid: the legacy grid is stored as NOTHING; a custom grid as app.grid (every breakpoint complete)
          const same = (a, b) => KEYS.every((k) => ['cols', 'row', 'gap', 'pad'].every((f) => (a[k][f] || 0) === (b[k][f] || 0)));
          const before = app.app.grid ? structuredClone(app.app.grid) : null;
          const after = !gr.geo || same(gr.geo, G.LEGACY) ? null : { ...gr.geo, nested: 'page', ...(before && before.popups === 'page' ? { popups: 'page' } : {}) };
          // keep sizes: every layout is converted from the old geometry to the new one (page items: columns and rows; container items: rows)
          if (gKeep.checked && !same(before || G.LEGACY, after || G.LEGACY)) M.rescale(app, before, after);
          else if (gKeep.checked && !!before !== !!after) M.rescale(app, before, after);   // same numbers, but containers switch between their own rows and the page's
          if (!after) delete app.app.grid; else app.app.grid = after;
          // fewer columns: page items that no longer fit are narrowed / pulled back (the model must stay valid)
          tooWide(gridGeo()).forEach((it) => KEYS.forEach((k) => {
            const L = it.layout[k], cols = colsOf(k); if (!L) return;
            if ((L.w || 1) > cols) L.w = cols;
            if (L.x && L.x + L.w - 1 > cols) L.x = Math.max(1, cols - L.w + 1);
          }));
          tidyPageKeys(model);
        }, { rerender: true });
        applySimulated();
        aidChecks.forEach(({ k, c }) => { if (!!aid[k] !== c.checked) setAid(k, c.checked); });
        // the application settings: only what changed, through the server
        if (D) {
          const patch = {};
          if (defSel && (defSel.value || null) !== (appSet.default || null)) patch.default = defSel.value || null;
          if (editVis.value() !== (appSet.editButton || 'corner')) patch.editButton = editVis.value();
          if (Object.keys(patch).length) D.setSettings(patch).then((r) => { if (!r || !r.ok) say('The application settings could not be saved', 'warn'); else say('Settings applied'); });
        } else if (editVis.value() !== editButton) { editButton = editVis.value(); if (access) access.setMode(editButton); }
        dlg.close();
      };
      /* the sections (tabs): General · Appearance · Navigation · Grid & layout · Editing — every setting has one place */
      const TABS = [
        ['general', 'General', [
          h('p', { class: 'ed-hint ed-tabsec__lead', text: `This page: ${d.name}` }),
          field('Page name', t), field('Subtitle', st), field('Icon', ic),
          h('label', { class: 'ed-check' }, [showHead, h('span', { text: 'Show the page title and subtitle (viewing)' })]),
          h('label', { class: 'ed-check' }, [isStart, h('span', { text: app.app.startPage === d.id ? 'This page is shown first' : 'Show this page first (the start page)' })]),
          h('h4', { class: 'ed-sub', text: 'Data' }),
          h('label', { class: 'ed-check' }, [simChk, h('span', { text: 'Use the simulated home (demo data — Home Assistant is not contacted)' })]),
          ...(defSel ? [h('h4', { class: 'ed-sub', text: 'Default dashboard' }), field('Opens after signing in', defSel),
            h('p', { class: 'ed-hint', text: 'For everyone on this IniqDash. If it is deleted, the dashboard opened last is used.' })] : []),
        ]],
        ['appearance', 'Appearance', [
          h('div', { class: 'ed-field' }, [h('span', { text: 'Page background' }), bg]),
          h('div', { class: 'ed-field' }, [h('span', { text: 'Theme' }), h('button', { type: 'button', class: 'ed-btn', 'data-k': 'settings-themes', onclick: () => { dlg.close(); openThemes(); } }, h('span', { text: 'Open Theme Studio…' }))]),
          h('p', { class: 'ed-hint', text: 'The theme colours every page and widget of this dashboard.' }),
        ]],
        ['navigation', 'Navigation', [
          h('label', { class: 'ed-check' }, [inDock, h('span', { text: 'Show this page in the Navigation Dock' })]),
          h('h4', { class: 'ed-sub', text: 'Dock position' }),
          ...navSecs,
          h('p', { class: 'ed-hint', text: 'Phones offer top or bottom only. The dock lists the pages that are shown in it, in page order.' }),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'settings-pages', onclick: () => { dlg.close(); openPages(); } }, h('span', { text: 'Page order and visibility…' })),
        ]],
        ['grid', 'Grid & layout', [
          h('label', { class: 'ed-check' }, [gOn, h('span', { text: 'Custom grid for this dashboard' })]),
          h('p', { class: 'ed-hint', text: 'Columns, row height and gap per screen size, for every page. Editing, snapping and resizing use it.' }),
          gBody,
        ]],
        ['wall', 'Wall tablet', [
          h('p', { class: 'ed-hint', text: 'For a screen mounted on a wall. Only while viewing — never while editing. 0 turns a setting off. One screen can override these in its address: ?saver=5, ?return=10, ?popupclose=30.' }),
          h('label', { class: 'ed-field' }, [h('span', { text: 'Screensaver after (minutes)' }), wSaver]),
          h('label', { class: 'ed-field' }, [h('span', { text: 'Screensaver' }), wStyle]),
          h('label', { class: 'ed-field' }, [h('span', { text: 'Back to the start page after (minutes without a touch)' }), wHome]),
          h('label', { class: 'ed-field' }, [h('span', { text: 'Close popups after (seconds without a touch)' }), wPop]),
          h('p', { class: 'ed-hint', text: 'Saving this dashboard on another screen updates every screen that shows it, within about 15 seconds.' }),
        ]],
        ['editing', 'Editing', [
          h('div', { class: 'ed-field' }, [h('span', { text: 'Edit button' }), editVis]),
          h('p', { class: 'ed-hint', text: 'Hidden: rest the pointer in the top-right corner for 2 seconds, or press and hold it on a touch screen. Tab or Shift + E always reach it.' }),
          h('h4', { class: 'ed-sub', text: 'Editor aids (this device)' }),
          ...aidChecks.map((x) => x.el),
        ]],
      ];
      const tabBar = h('div', { class: 'ed-tabs', role: 'tablist', 'aria-label': 'Settings sections' });
      const panels = TABS.map(([id, label, kids], i) => {
        const tab = h('button', { type: 'button', class: 'ed-tabs__t', role: 'tab', id: `ed-set-${id}`, 'aria-controls': `ed-setp-${id}`, 'aria-selected': String(i === 0), tabindex: i === 0 ? '0' : '-1', 'data-k': `settings-tab-${id}`,
          onclick: () => show(id) }, h('span', { text: label }));
        tabBar.append(tab);
        return h('section', { class: 'ed-tabsec', role: 'tabpanel', id: `ed-setp-${id}`, 'aria-labelledby': `ed-set-${id}`, 'data-tab': id, hidden: i !== 0 }, kids);
      });
      function show(id) {
        tabBar.querySelectorAll('[role=tab]').forEach((b) => { const on = b.id === `ed-set-${id}`; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
        panels.forEach((p) => { p.hidden = p.dataset.tab !== id; });
      }
      // arrow keys move between the tabs (the tablist pattern)
      tabBar.addEventListener('keydown', (e) => {
        const tabs = [...tabBar.querySelectorAll('[role=tab]')], i = tabs.indexOf(document.activeElement);
        if (i < 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (/Right|Down/.test(e.key) ? 1 : -1) + tabs.length) % tabs.length;
        tabs[n].focus(); show(TABS[n][0]);
      });
      dlg = dialog('ed-dlg--settings', 'Dashboard settings', [h('div', { class: 'ed-settings' }, [tabBar, h('div', { class: 'ed-settings__panels' }, [...panels, err])])],
        [h('button', { type: 'button', class: 'ed-btn', onclick: () => dlg.close() }, h('span', { text: 'Cancel' })), h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'apply-settings', onclick: apply }, h('span', { text: 'Apply' }))]);
      // a validation problem shows its tab
      const showErr = () => { const tab = err.textContent && /columns|row height|gap/.test(err.textContent) ? 'grid' : 'general'; show(tab); };
      new MutationObserver(() => { if (!err.hidden) showErr(); }).observe(err, { attributes: true, attributeFilter: ['hidden'], childList: true });
      dlg.addEventListener('close', () => { if (!applied) canvas.dataset.bg = model.background || 'default'; });
      syncGrid();
    }
    /** canonical key order for a page (keeps saved text stable) */
    function tidyPageKeys(p) {
      const { id, name, icon, subtitle, background, header, nav: inNav, items } = p;
      Object.keys(p).forEach((k) => delete p[k]);
      Object.assign(p, { id, name, ...(icon ? { icon } : {}), ...(subtitle ? { subtitle } : {}), ...(background ? { background } : {}), ...(header === false ? { header: false } : {}), nav: inNav !== false, items });
    }

    /* ================================================================== page management (each = one history entry) */
    function uniquePageId(base) {
      const slug = String(base).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page';
      let id = slug, n = 2;
      while (pageById(id)) id = `${slug.replace(/-\d+$/, '')}-${n++}`;
      return id;
    }
    function addPage(name) {
      let n = app.pages.length + 1;
      while (app.pages.some((p) => p.name === `Page ${n}`)) n++;
      const label = name || `Page ${n}`;
      const p = { id: uniquePageId(label), name: label, icon: 'home', nav: true, items: [] };
      mutate('add page', () => { app.pages.splice(app.pages.indexOf(model) + 1, 0, p); });
      nav.go(p.id, 'editor');
      say(`Added ${p.name}`);
      return p.id;
    }
    function renamePage(id, name) {
      const p = pageById(id), v = String(name || '').trim();
      if (!p || v === p.name) return true;
      const bad = plainName(v);
      if (bad) { say(bad, 'warn'); return false; }
      mutate('rename page', () => { p.name = v; }, { rerender: true });
      return true;
    }
    /** a full copy: new page id, new item ids (parents remapped), same configuration and layouts */
    function duplicatePage(id) {
      const src = pageById(id); if (!src) return null;
      const copy = structuredClone(src);
      copy.id = uniquePageId(`${src.id}-copy`);
      copy.name = `${src.name} copy`.slice(0, 80);
      const taken = new Set(allItems().map((i) => i.id)), map = {};
      copy.items.forEach((it) => {
        const base = it.id.replace(/-copy(-\d+)?$/, '').slice(0, 52) + '-copy';
        let nid = base, n = 2;
        while (taken.has(nid)) nid = `${base}-${n++}`;
        taken.add(nid); map[it.id] = nid; it.id = nid;
      });
      copy.items.forEach((it) => { if (it.parent) it.parent = map[it.parent]; });
      mutate('duplicate page', () => { app.pages.splice(app.pages.indexOf(src) + 1, 0, copy); });
      nav.go(copy.id, 'editor');
      say(`Duplicated ${src.name}`);
      return copy.id;
    }
    function deletePage(id) {
      const p = pageById(id);
      if (!p) return false;
      if (app.pages.length <= 1) { say('The last page cannot be deleted', 'warn'); return false; }
      const i = app.pages.indexOf(p);
      let fixed = 0;
      mutate('delete page', () => {
        app.pages.splice(i, 1);
        if (app.app.startPage === id) app.app.startPage = app.pages[0].id;
        // navigation targets must stay valid: every link that opened the page is made harmless (the shared finder)
        fixed = unlink('page', id).length;
        if (nav.current() === id) nav.reset(app.pages[Math.min(i, app.pages.length - 1)].id);
      }, { rerender: true });
      afterNav();
      say(`Deleted ${p.name}${fixed ? ` · ${fixed} link${fixed > 1 ? 's' : ''} that opened it now do${fixed > 1 ? '' : 'es'} nothing` : ''}`);
      return true;
    }
    function movePage(id, dir) {
      const p = pageById(id), i = app.pages.indexOf(p), j = i + dir;
      if (!p || j < 0 || j >= app.pages.length) return false;
      mutate('reorder pages', () => { app.pages.splice(i, 1); app.pages.splice(j, 0, p); }, { rerender: true });
      return true;
    }
    function setStartPage(id) {
      if (!pageById(id) || app.app.startPage === id) return false;
      mutate('start page', () => { app.app.startPage = id; }, { rerender: true });
      return true;
    }
    function setPageIcon(id, icon) {
      const p = pageById(id); if (!p || (p.icon || '') === icon) return false;
      mutate('page icon', () => { if (icon) p.icon = icon; else delete p.icon; tidyPageKeys(p); }, { rerender: true });
      return true;
    }
    function setPageNav(id, on) {
      const p = pageById(id); if (!p || p.nav === on) return false;
      mutate(on ? 'show page in dock' : 'hide page from dock', () => { p.nav = on; }, { rerender: true });
      return true;
    }
    function setDock(bp, edge) {
      if (!M.DOCK[bp] || !M.DOCK[bp].includes(edge) || app.app.navigation[bp] === edge) return false;
      mutate('dock position', () => { app.app.navigation[bp] = edge; }, { rerender: true });
      return true;
    }

    /** the Pages dialog: every page operation in one place; changes apply at once (and can be undone) */
    function openPages() {
      const list = h('ol', { class: 'ed-pages' });
      const fill = () => {
        list.replaceChildren(...app.pages.map((p, i) => {
          const name = h('input', { type: 'text', value: p.name, maxlength: '80', class: 'ed-pages__name', 'aria-label': `Name of page ${i + 1}`,
            onchange: (e) => { if (!renamePage(p.id, e.target.value)) e.target.value = p.name; else fill(); } });
          name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
          const ic = iconSelect(p.icon, `Icon of ${p.name}`);
          ic.addEventListener('change', () => { setPageIcon(p.id, ic.value); fill(); });
          const del = h('button', { type: 'button', class: 'ed-mini-btn ed-mini-btn--danger', 'aria-label': `Delete ${p.name}`, title: app.pages.length > 1 ? 'Delete (press twice)' : 'The last page cannot be deleted', disabled: app.pages.length <= 1 }, svg('trash'));
          del.addEventListener('click', () => confirmStep(del, '', () => { deletePage(p.id); fill(); }, true));
          const B = (icon, label, fn, disabled) => h('button', { type: 'button', class: 'ed-mini-btn', 'aria-label': label, title: label, disabled: !!disabled, onclick: () => { fn(); fill(); } }, svg(icon));
          return h('li', { class: `ed-pages__row${p.id === model.id ? ' is-current' : ''}`, 'data-page': p.id }, [
            h('button', { type: 'button', class: 'ed-pages__go', 'aria-pressed': String(p.id === model.id), 'aria-label': `Edit ${p.name}`, title: 'Show / edit this page', onclick: () => { nav.go(p.id, 'editor'); fill(); } }, h('span', { text: String(i + 1) })),
            name, ic,
            h('label', { class: 'ed-check ed-pages__dock' }, [h('input', { type: 'checkbox', checked: p.nav, 'aria-label': `Show ${p.name} in the dock`, onchange: (e) => { setPageNav(p.id, e.target.checked); fill(); } }), h('span', { text: 'Dock' })]),
            h('label', { class: 'ed-check ed-pages__start' }, [h('input', { type: 'radio', name: 'ed-start', checked: app.app.startPage === p.id, 'aria-label': `Start with ${p.name}`, onchange: () => { setStartPage(p.id); fill(); } }), h('span', { text: 'Start' })]),
            h('span', { class: 'ed-pages__btns' }, [
              B('up', `Move ${p.name} earlier`, () => movePage(p.id, -1), i === 0),
              B('down', `Move ${p.name} later`, () => movePage(p.id, 1), i === app.pages.length - 1),
              B('copy', `Duplicate ${p.name}`, () => duplicatePage(p.id)),
              del,
            ]),
          ]);
        }));
      };
      fill();
      const add = h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'pages-add', onclick: () => { addPage(); fill(); } }, [svg('plus'), h('span', { text: 'Add page' })]);
      // a page built from one Home Assistant AREA (its devices as standard widgets)
      const areaSel = h('select', { 'data-k': 'pages-area', 'aria-label': 'Area', hidden: true, onchange: () => { if (areaSel.value) addAreaPage(areaSel, areaNote).then(fill); } });
      const areaNote = h('span', { class: 'ed-hint', role: 'status', 'data-k': 'pages-area-note' });
      const addArea = global.IniqGenerate ? h('button', { type: 'button', class: 'ed-btn', 'data-k': 'pages-add-area', onclick: () => addAreaPage(areaSel, areaNote) }, [svg('plus'), h('span', { text: 'Page for an area…' })]) : null;
      dialog('ed-dlg--pages', 'Pages', [
        h('p', { class: 'ed-hint', text: 'Order = Navigation Dock order. "Dock" shows the page in the dock (a page left out can still be opened from a Radial menu or this list). "Start" is the page shown first. Every change can be undone.' }),
        list,
      ], [h('button', { type: 'button', class: 'ed-btn', 'data-k': 'dock-settings', onclick: () => { document.querySelector('dialog.ed-dlg--pages')?.close(); openSettings(); } }, h('span', { text: 'Dock position…' })), areaNote, areaSel, addArea, add]);
    }

    /* ================================================================== popups: content (runtime) */
    /** a popup's live content — the same registry components / containers, no editor records */
    function staticNode(it, items, key) {
      if (it.type === 'container') {
        const kids = items.filter((i) => i.parent === it.id);
        return R.instantiate('container', it.config, G.create({ id: `${it.id}--live`, nested: true, inherit: true, bp: key, spans: spansOf(it, (id) => items.find((x) => x.id === id) || null, null), rows: popupGrid(), ownRows: true, items: kids.map((k) => staticGridItem(k, items, key)) }));
      }
      if (it.type === 'tabs') return staticTabs(it, items, (k) => staticGridItem(k, items, key), `${it.id}--live`, key);
      return R.instantiate(it.type, it.config);
    }
    /** a Tabbed Container outside the editor's own records (popup runtime, multi preview): every tab, switched by the component */
    function staticTabs(it, items, gi, sid, bp) {
      const tabs = tabsCfg(it), panes = {};
      const find = (id) => items.find((x) => x.id === id) || null, live = /--live$/.test(sid);
      const spans = spansOf(it, find, live ? null : gridGeo());   // a popup's grid is legacy
      const rows = live ? popupGrid() : bp ? null : boxRows(it, find, true);
      const shown = shownTabs(it, tabs, (tid) => items.filter((i) => i.parent === it.id && tabOf(i, tabs) === tid));
      shown.forEach((t) => { panes[t.id] = G.create({ id: `${sid}-${t.id}`, nested: true, inherit: true, spans, ...(bp ? { bp } : {}), ...(rows ? { rows, ownRows: live } : {}), items: items.filter((i) => i.parent === it.id && tabOf(i, tabs) === t.id).map(gi) }); });
      return R.instantiate('tabs', shown === tabs ? it.config : { ...it.config, tabs: shown }, { panes, active: shown[0] && shown[0].id });
    }
    function staticGridItem(it, items, key) { return { id: it.id, layout: structuredClone(it.layout), constraints: consFor(it, 400), content: staticNode(it, items, key) }; }
    function buildPopupContent(def, key) {
      const items = def.items, tops = items.filter((i) => !i.parent), cfg = def.config, vp = screen.size();
      if (key === 'mobile') return G.create({ id: `${def.id}--live`, items: tops.map((it) => staticGridItem(it, items, key)) });
      const width = cfg.size === 'custom' ? (cfg.custom[key] || cfg.custom.desktop).w - 32 : cfg.size === 'full' ? vp.w - 80 : 4000;
      const surf = global.MaisonFree.surface({ key, width, items: tops.map((it) => ({ id: it.id, frame: it.frame, layout: it.layout, node: staticNode(it, items, key) })) });
      const b = global.MaisonFree.bounds(surf.free.frames);
      surf.style.setProperty('--mf-w', `${b.w}px`); surf.style.setProperty('--mf-h', `${b.h}px`);
      return surf;
    }

    /* ================================================================== popups: management (each change = one history entry) */
    function uniqueDefId(list, base) {
      const slug = String(base).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
      let id = slug, n = 2;
      while (list.some((x) => x.id === id)) id = `${slug.replace(/-\d+$/, '')}-${n++}`;
      return id;
    }
    function designPopup(id) {
      if (!popupById(id)) return;
      if (drag || fdrag) cancelDrag();
      if (popupHost.current()) popupHost.close('api');
      closeDetails();
      design = { kind: 'popup', id }; selected = null;
      if (!editing) setEditing(true);
      render(); afterNav();
      say(`Designing popup: ${popupById(id).name}`);
    }
    function designPage() {
      if (design.kind === 'page') return;
      if (drag || fdrag) cancelDrag();
      design = { kind: 'page' }; selected = null;
      render(); afterNav();
    }
    function createPopup(name) {
      app.popups = app.popups || [];
      let n = app.popups.length + 1;
      while (app.popups.some((p) => p.name === `Popup ${n}`)) n++;
      const label = name || `Popup ${n}`;
      const pp = { id: uniqueDefId(app.popups, label), name: label, config: R.fullConfig('popup', { title: label }), items: [] };
      mutate('add popup', () => { app.popups.push(pp); });
      say(`Added ${label}`);
      return pp.id;
    }
    function renamePopup(id, name) {
      const pp = popupById(id), v = String(name || '').trim();
      if (!pp || v === pp.name) return true;
      const bad = plainName(v); if (bad) { say(bad, 'warn'); return false; }
      mutate('rename popup', () => { pp.name = v; }, { rerender: true });
      return true;
    }
    /** EVERY link to a popup / page that is being deleted is made harmless (MaisonModel.references — the one finder: widget
        interactions Tap / Double tap / Long press, Action and Button widgets, radial segments, a popup's Back / Menu); returns
        where, so the user is told. Before, only Action widgets and radial segments were repaired: a Room's Tap → popup survived
        the popup's deletion, was saved, and the dashboard no longer opened. */
    function unlink(kind, id) {
      const hit = M.references(app).filter((r) => r.kind === kind && r.ref === id);
      hit.forEach((r) => r.clear());
      return hit;
    }
    function deletePopup(id) {
      const pp = popupById(id); if (!pp) return false;
      let fixed = [];
      mutate('delete popup', () => {
        app.popups.splice(app.popups.indexOf(pp), 1);
        fixed = unlink('popup', id);
        if (design.kind === 'popup' && design.id === id) design = { kind: 'page' };
      }, { rerender: true });
      if (popupHost.current() === id) popupHost.close('api');
      say(`Deleted ${pp.name}${fixed.length ? ` · ${fixed.length} link${fixed.length > 1 ? 's' : ''} that opened it now do nothing (${[...new Set(fixed.map((r) => r.name))].slice(0, 3).join(', ')})` : ''}`);
      return true;
    }
    /** the in-editor repair (Save found links to something the dashboard no longer has): the same view as for a saved dashboard */
    function openRepair() {
      if (!global.IniqRepair) return say('Not saved: some links point at a popup or page that no longer exists.', 'warn');
      let d = null;
      const view = global.IniqRepair.view({ model: app, title: 'Before saving: repair links',
        intro: 'These links point at something this dashboard no longer has, so it cannot be saved as it is. Choose for each one.',
        applyText: 'Repair', cancelText: 'Cancel',
        onCancel: () => d.close(),
        onApply: (fixed) => {
          mutate('repair links', () => { app.pages = fixed.pages; app.popups = fixed.popups; app.notifications = fixed.notifications; }, { rerender: true });
          d.close(); say('Links repaired — Save stores the repaired dashboard');
        } });
      d = dialog('ed-dlg--repair', 'Repair links', [view]);
    }
    /** a schema form dialog for an application definition (popup settings, notification template): the SHARED configuration modal
        (MaisonConfigure.modal — the same shell, sections, footer and dismissal rule as a widget's configuration); its name is the first
        field of the Identity section; `extra` is its live preview, beside the form like a widget's */
    function defDialog({ cls, titleText, kind, config, name, extra, onChange, onApply, previewer = null }) {
      const nameId = `def-name-${++uidSeq}`;
      const nameIn = name !== undefined ? h('input', { type: 'text', id: nameId, value: name, maxlength: '80', 'data-k': 'def-name' }) : null;
      const form = global.MaisonForm.create({ type: kind, config, previewer, onChange: (c) => onChange && onChange(c) });
      const err = h('p', { class: 'ef-err', role: 'alert', hidden: true });
      if (nameIn) {
        const row = h('div', { class: 'ef-field ef-field--text', 'data-key': 'name' }, [h('label', { class: 'ef-label', for: nameId, text: 'Name' }), nameIn,
          h('p', { class: 'ef-help', text: 'Its name in the editor’s lists.' })]);
        const g = form.el.querySelector('[data-group="identity"]');
        const at = g && (g.querySelector(':scope > .ef-hint') || g.querySelector(':scope > summary'));
        if (at) at.after(row); else form.el.prepend(row);
      }
      let shell;
      const apply = () => {
        const e = form.errors(), nm = nameIn ? nameIn.value.trim() : null, bad = nameIn ? plainName(nm) : '';
        if (bad) { err.hidden = false; err.textContent = bad; const g = nameIn.closest('details'); if (g) g.open = true; nameIn.focus(); return; }
        if (e.length) { form.el.querySelectorAll('details.ef-group--acc').forEach((d) => { if (e.some((x) => d.querySelector(`[data-key="${CSS.escape(x.key)}"]`))) d.open = true; }); form.showErrors(e); return; }
        const T = R.schemaOf(kind), v = form.value();
        onApply(T && T.normalize ? T.normalize(v) : v, nm);      // stored tidy: no default, nothing of a hidden option
        shell.close(false);
      };
      shell = global.MaisonConfigure.modal({ mount: root, cls: `is-edit ed-dlg--def ${cls}`, title: titleText });
      shell.body.append(h('div', { class: `ecfg-split${extra ? '' : ' is-single'}` }, [h('div', { class: 'ecfg-form' }, [err, form.el]), extra || null]));
      shell.foot.append(h('button', { type: 'button', class: 'ed-btn', 'data-k': 'def-cancel', onclick: () => shell.close(true) }, h('span', { text: 'Cancel' })),
        h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'apply-def', onclick: apply }, h('span', { text: 'Apply' })));
      if (onChange) onChange(form.value());
      return shell.dlg;
    }
    /** the live preview of a popup's settings in its settings dialog: the popup's real header, picture and information row
        (components/popup chrome, buttons inert) at its Desktop size, scaled to the pane — the content is designed on the canvas */
    function popupSettingsPreview(pp) {
      const stage = global.MaisonTheme.scope(h('div', { class: 'ecfg-pv__stage ed-poppv' }));   // the dashboard's active theme
      const note = h('p', { class: 'ecfg-pv__note' });
      let info = null, last = null;
      /** ONE drawing of the popup for a configuration (the real chrome: header, picture, information) at its logical desktop size —
          the Live preview, and the item editors' preview of the same configuration */
      const panelOf = (c) => {
        const cfg = R.fullConfig('popup', c);
        const ch = global.MaisonPopup.chrome(cfg, { name: pp.name, icons: R.icons(), design: true });
        const w = cfg.size === 'custom' ? cfg.custom.desktop.w : 860, hh = cfg.size === 'custom' ? cfg.custom.desktop.h : 640;
        const panel = h('section', { class: `mpop__panel ed-poppv__panel${ch.hero ? ' has-hero' : ''}`, 'data-k': 'popup-preview' },
          [ch.hero, ch.head, ch.info, h('div', { class: 'mpop__body' }, h('div', { class: 'ed-poppv__content', text: 'Content: tabs and widgets are placed on the canvas' }))]);
        Object.assign(panel.style, { width: `${w}px`, height: `${hh}px` });
        return { panel, info: ch.info, w, hh };
      };
      const draw = () => {
        if (!last) return;
        if (info && info.stop) info.stop();
        const { panel, w, hh, info: i0 } = panelOf(last);
        info = i0;
        stage.replaceChildren(panel);
        const s = Math.min(1, (stage.clientWidth - 2) / w);
        panel.style.transform = s < 1 ? `scale(${s})` : '';
        stage.style.height = `${hh * s + 2}px`;
        note.textContent = `Desktop · ${w} × ${hh} px${s < 1 ? ` · shown at ${Math.round(s * 100)}%` : ''}`;
      };
      let raf = 0;
      const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
      ro.observe(stage);
      return {
        el: h('div', { class: 'ecfg-pv' }, [h('div', { class: 'ecfg-pv__head' }, [h('span', { class: 'ed-sub', text: 'Live preview' })]), stage, note]),
        show: (c) => { last = c; cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); },
        /** the item editors' preview: the same drawing, scaled to `avail` × `maxH` (its information stops with it) */
        view: (c, avail, maxH = Infinity) => {
          const { panel, info: i0, w, hh } = panelOf(c), s = Math.min(1, Math.max(0.05, avail) / w, maxH / hh);
          const box = h('div', { class: 'ecfg-pv__box' }, panel);
          Object.assign(box.style, { width: `${w}px`, height: `${hh}px`, transform: s < 1 ? `scale(${s})` : '' });
          box.stop = () => { if (i0 && i0.stop) i0.stop(); };
          return { el: box, height: hh * s };
        },
        stop: () => { ro.disconnect(); if (info && info.stop) info.stop(); },
      };
    }
    function openPopupSettings(id) {
      const pp = popupById(id); if (!pp) return;
      // live: while the settings are open, the popup's design stage shows them (header, picture, size) — nothing is stored until Apply
      const pv = popupSettingsPreview(pp);
      const live = (cfg) => { pv.show(cfg); popupDraft = { id, config: cfg }; if (designingPopup() && model.id === id) render(); };
      const dlg = defDialog({ cls: 'ed-dlg--popup', titleText: `Popup settings · ${pp.name}`, kind: 'popup', config: R.fullConfig('popup', pp.config), name: pp.name, onChange: live, extra: pv.el, previewer: pv.view,
        onApply: (cfg, nm) => { popupDraft = null; mutate('popup settings', () => { pp.config = cfg; if (nm) pp.name = nm; }, { rerender: true }); say(`Applied ${pp.name}`); } });
      dlg.addEventListener('close', () => { pv.stop(); if (!popupDraft) return; popupDraft = null; if (designingPopup()) render(); });   // Cancel: the stage shows the stored settings again
    }
    function openPopups() {
      setMore(false);
      app.popups = app.popups || [];
      const list = h('ol', { class: 'ed-pages ed-popups' });
      const fill = () => {
        list.replaceChildren(...app.popups.map((pp, i) => {
          const cfg = R.fullConfig('popup', pp.config);
          const name = h('input', { type: 'text', value: pp.name, maxlength: '80', class: 'ed-pages__name', 'aria-label': `Name of popup ${i + 1}`,
            onchange: (e) => { if (!renamePopup(pp.id, e.target.value)) e.target.value = pp.name; else fill(); } });
          name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
          const del = h('button', { type: 'button', class: 'ed-mini-btn ed-mini-btn--danger', 'aria-label': `Delete ${pp.name}`, title: 'Delete (press twice)' }, svg('trash'));
          del.addEventListener('click', () => confirmStep(del, '', () => { deletePopup(pp.id); fill(); }, true));
          const B = (label, k, fn) => h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': k, 'aria-label': `${label} ${pp.name}`, onclick: fn }, h('span', { text: label }));
          return h('li', { class: 'ed-pages__row ed-popups__row', 'data-popup': pp.id }, [
            name,
            h('span', { class: 'ed-popups__meta', text: `${cfg.size === 'custom' ? `${cfg.custom.desktop.w}×${cfg.custom.desktop.h}` : cfg.size === 'full' ? 'Full screen' : 'Fit content'} · ${pp.items.length} item${pp.items.length === 1 ? '' : 's'}` }),
            h('span', { class: 'ed-pages__btns' }, [
              B('Design', 'design', () => { document.querySelector('dialog.ed-dlg--popups')?.close(); designPopup(pp.id); }),
              B('Settings', 'settings', () => openPopupSettings(pp.id)),
              B('Preview', 'preview', () => openPopupById(pp.id)),
              del,
            ]),
          ]);
        }));
        if (!app.popups.length) list.replaceChildren(h('li', { class: 'ed-hint', text: 'No popups yet. A popup is a designed surface (widgets and containers) that an Action button or a Radial segment can open.' }));
      };
      fill();
      const add = h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'popups-add', onclick: () => { createPopup(); fill(); } }, [svg('plus'), h('span', { text: 'New popup' })]);
      dialog('ed-dlg--popups', 'Popups', [h('p', { class: 'ed-hint', text: 'Popups belong to the application, not to a widget. Anything set to "Open popup" opens one: an Action or Button widget, a Radial menu segment, or a widget’s Tap / Double tap / Long press (Interactions). Design opens its content on the canvas.' }), list], [add]);
    }

    /* ================================================================== THEME STUDIO: the dashboard's theme library (app.themes)
       Create (from a starting preset), name, duplicate, edit, apply, export and import themes. A theme is only token VALUES
       (components/theme): everything that uses the tokens follows it — the dashboard, popups, notifications; a widget's own theme
       (config.theme) still wins for that widget. Editing shows the change on real widgets in the Live preview AND on the dashboard
       itself; Cancel puts everything back. Nothing is stored until Apply (and Save). */
    let studio = null;
    const themeStudio = () => studio || (studio = global.IniqThemeStudio.create({
      root, app: () => app.app, mutate, applyAppTheme, say, R, svg, confirmStep, uniqueId: (list, name) => uniqueDefId(list, name),
      surfaces: () => [frame, screen && screen.layer, noteScreen && noteScreen.layer],
      // widget-level overrides (config.theme): listed in the gallery, each with Use Theme Default
      overrides: () => [...app.pages.map((p) => [p, `Page “${p.name || p.id}”`]), ...(app.popups || []).map((p) => [p, `Popup “${p.name || p.id}”`])]
        .flatMap(([p, where]) => p.items.filter((i) => i.config && i.config.theme).map((i) => ({ id: i.id, name: i.config.name || i.config.title || i.config.text || i.type, page: where }))),
      clearOverride: (id) => { const it = allItems().find((i) => i.id === id); if (it && it.config) mutate('use theme default', () => { delete it.config.theme; }, { rerender: true }); },
    }));
    const openThemes = () => { setMore(false); return themeStudio().openGallery(); };
    const importTheme = (text) => themeStudio().importTheme(text);

    /* ================================================================== notifications: templates + rules */
    const NOTES = () => { app.notifications = app.notifications || { templates: [], rules: [] }; return app.notifications; };
    function createTemplate() {
      const N = NOTES();
      let n = N.templates.length + 1;
      while (N.templates.some((t) => t.name === `Notification ${n}`)) n++;
      const t = { id: uniqueDefId(N.templates, `notification-${n}`), name: `Notification ${n}`, config: R.fullConfig('notification', { title: `Notification ${n}` }) };
      mutate('add notification template', () => { N.templates.push(t); }, { rerender: true });
      return t.id;
    }
    function deleteTemplate(id) {
      const N = NOTES(), t = N.templates.find((x) => x.id === id); if (!t) return;
      const used = N.rules.filter((r) => r.template === id).length;
      mutate('delete notification template', () => { N.templates.splice(N.templates.indexOf(t), 1); N.rules = N.rules.filter((r) => r.template !== id); }, { rerender: true });
      say(`Deleted ${t.name}${used ? ` and ${used} rule${used > 1 ? 's' : ''} using it` : ''}`);
    }
    /* SHOW IT: a notification shown from an editor dialog (Test, Test on screen, Fire) must be SEEN where it really appears — the
       dialogs step aside (see-through: no panel, no backdrop dimming, nothing clickable but the notification and one "Back to the
       editor" button), the dialogs and their unsaved values stay open. They return when the shown notifications are gone, on
       "Back to the editor" or on Escape. */
    let peek = null;
    function unpeek() {
      if (!peek) return;
      const p = peek; peek = null;
      clearInterval(p.timer); document.removeEventListener('keydown', p.key, true);
      p.dialogs.forEach((d) => d.classList.remove('is-peek'));
      p.bar.remove();
      if (p.focus && p.focus.isConnected) p.focus.focus({ preventScroll: true });
    }
    function showOnScreen(nids, cfg) {
      const dialogs = [...root.querySelectorAll('dialog[open]')];
      if (!dialogs.length || !nids.length) return;
      if (peek) { peek.nids.push(...nids); return; }
      const top = dialogs[dialogs.length - 1];
      const btn = h('button', { type: 'button', class: 'ed-btn ed-btn--primary ed-btn--sm', 'data-k': 'peek-back', onclick: () => unpeek() }, h('span', { text: 'Back to the editor' }));
      const bar = h('div', { class: 'ed-peek', 'data-k': 'peek', role: 'status', 'data-at': String((cfg && cfg.position) || '').startsWith('bottom') ? 'top' : 'bottom' },
        [h('span', { text: 'Showing the notification where it appears' }), btn]);
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); unpeek(); } };
      peek = { dialogs, bar, nids: [...nids], focus: document.activeElement, key,
        timer: setInterval(() => { const live = new Set(notes.active().map((a) => a.nid)); if (peek && !peek.nids.some((n) => live.has(n))) unpeek(); }, 250) };
      dialogs.forEach((d) => d.classList.add('is-peek'));
      top.append(bar);
      document.addEventListener('keydown', key, true);
      btn.focus({ preventScroll: true });
    }
    function testTemplate(id) {
      const t = NOTES().templates.find((x) => x.id === id);
      if (!t) return;
      const cfg = R.fullConfig('notification', t.config);
      showOnScreen([notes.show(cfg, { template: t.id, source: 'test' })], cfg);
    }
    /** the LIVE PREVIEW of a notification template — the SAME panel as a widget's or a popup's configuration (.ecfg-pv: "Live preview",
        its view choice, the stage, a note): the screen notifications appear on (noteScreen — the browser window, or the simulated
        device), drawn by the ONE renderer and placed by the ONE stack layout (MaisonNotify.createCenter) from the UNSAVED values,
        redrawn on every change. Actual size: the notification at 100 % (the view follows it). Whole screen: where it sits. */
    function notePreview() {
      const box = h('div', { class: 'ed-notepv', 'data-k': 'note-preview', role: 'img', 'aria-label': 'Notification preview' });
      const layer = h('div', { class: 'ed-notepv__screen' });
      box.append(layer);
      const stage = global.MaisonTheme.scope(h('div', { class: 'ecfg-pv__stage ed-notepv__stage' }, box));   // the dashboard's active theme
      const note = h('p', { class: 'ecfg-pv__note', 'data-k': 'note-preview-size' });
      const center = global.MaisonNotify.createCenter({ layer, icons: R.icons() });
      let mode = 'actual';
      const view = h('select', { class: 'ecfg-pv__mode', 'data-k': 'note-pv-view', 'aria-label': 'Preview view', onchange: () => { mode = view.value; draw(); } },
        [h('option', { value: 'actual', text: 'Actual size' }), h('option', { value: 'screen', text: 'Whole screen' })]);
      const test = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'test-draft' }, h('span', { text: 'Test on screen' }));
      const wrap = h('div', { class: 'ecfg-pv ed-notepv-panel' }, [h('div', { class: 'ecfg-pv__head' }, [h('span', { class: 'ed-sub', text: 'Live preview' }), view]), stage, note, test]);
      let last = null;
      const draw = () => {
        if (!last) return;
        const sc0 = noteScreen ? noteScreen.size() : { w: 1280, h: 800 }, w = Math.max(240, sc0.w), hh = Math.max(240, sc0.h);
        const where = noteScreen && noteScreen.layer.dataset.target === 'device' ? 'the simulated device' : 'this browser window';
        const avail = Math.max(160, (stage.clientWidth || wrap.clientWidth || 340) - 2);
        Object.assign(layer.style, { width: `${w}px`, height: `${hh}px`, transform: '' });
        center.clear();
        center.show({ ...R.fullConfig('notification', last), persistent: true, enter: 'none', exit: 'none' });
        const n = layer.querySelector('.mnote:not(.is-leaving)');
        if (mode === 'screen' || !n) {
          const s = Math.min(1, avail / w, 360 / hh);
          layer.style.transform = `scale(${s})`;
          Object.assign(box.style, { width: `${Math.round(w * s)}px`, height: `${Math.round(hh * s)}px` });
          note.textContent = `whole screen · ${where} · ${w} × ${hh} · ${Math.round(s * 100)} %`;
          return;
        }
        const lr = layer.getBoundingClientRect(), nr = n.getBoundingClientRect(), pad = 16;
        const nx = nr.left - lr.left, ny = nr.top - lr.top, vw = Math.min(avail, w), vh = Math.min(440, Math.round(nr.height + 2 * pad));
        const tx = Math.max(0, Math.min(w - vw, nx + nr.width / 2 - vw / 2)), ty = Math.max(0, Math.min(hh - vh, ny + nr.height / 2 - vh / 2));
        layer.style.transform = `translate(${-Math.round(tx)}px, ${-Math.round(ty)}px)`;
        Object.assign(box.style, { width: `${vw}px`, height: `${vh}px` });
        note.textContent = `actual size · on ${where} (${w} × ${hh})${nr.width > vw ? ' · wider than this pane: see Whole screen' : ''}`;
      };
      const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
      if (ro) ro.observe(stage);
      return { el: wrap, test, show: (c) => { last = c; draw(); }, stop: () => { if (ro) ro.disconnect(); center.clear(); } };
    }
    function openTemplate(id) {
      const N = NOTES(), t = N.templates.find((x) => x.id === id); if (!t) return;
      const pv = notePreview();
      let draft = R.fullConfig('notification', t.config);
      // Test on screen: the CURRENT (unsaved) configuration where it really appears — the same renderer and placement as any
      // notification — and the dialogs step aside so it is seen (showOnScreen)
      pv.test.addEventListener('click', () => { const cfg = R.fullConfig('notification', draft); showOnScreen([notes.show(cfg, { template: t.id, source: 'test' })], cfg); });
      const dlg = defDialog({ cls: 'ed-dlg--note', titleText: `Notification template · ${t.name}`, kind: 'notification', config: draft, name: t.name, extra: pv.el,
        onChange: (c) => { draft = c; pv.show(c); },
        onApply: (cfg, nm) => { mutate('edit notification template', () => { t.config = cfg; if (nm) t.name = nm; }, { rerender: true }); say(`Applied ${t.name}`); } });
      if (dlg) dlg.addEventListener('close', () => { unpeek(); pv.stop(); }, { once: true });
    }
    function addRule() {
      const N = NOTES();
      if (!N.templates.length) { say('Create a notification template first', 'warn'); return null; }
      const r = { id: uniqueDefId(N.rules, 'rule'), event: R.EVENTS[0].id, template: N.templates[0].id, enabled: true };
      mutate('add notification rule', () => { N.rules.push(r); });
      return r.id;
    }
    function setRule(id, patch, label) {
      const r = NOTES().rules.find((x) => x.id === id); if (!r) return;
      mutate(label || 'edit notification rule', () => Object.assign(r, patch));
    }
    /** FIRE a demo event through the real path: event → rule(s) → template → notification. Returns what happened, in words the
        Notifications dialog shows: the notifications shown, or exactly why none was (no rule for the event · its rules are off). */
    function fireReport(id) {
      const N = NOTES(), label = (R.EVENTS.find((e) => e.id === id) || { label: id }).label;
      const before = rulesEngine.log.length;
      events.emit(id, { source: 'demo' });
      const shown = rulesEngine.log.slice(before);
      const all = N.rules.filter((r) => r.event === id), on = all.filter((r) => r.enabled !== false);
      const name = (tid) => (N.templates.find((t) => t.id === tid) || { name: tid }).name;
      let text, state;
      if (shown.length) { state = 'shown'; text = `“${label}” → ${shown.map((x) => `“${name(x.template)}”`).join(', ')}: shown on the screen.`; }
      else if (!all.length) { state = 'no-rule'; text = `No matching rule — no notification shown. “${label}”: no rule uses this event. Add a rule (New rule: this event → a template), or use Test on a template to see it without a rule.`; }
      else { state = 'rule-off'; text = `No matching rule — no notification shown. “${label}”: ${all.length === 1 ? 'its rule is' : `its ${all.length} rules are`} turned off.`; }
      return { event: id, state, text, rules: all.length, enabled: on.length, nids: shown.map((x) => x.nid), shown: shown.length };
    }
    function fireEvent(id) {
      const r = fireReport(id);
      say(r.text, r.shown ? undefined : 'warn');
      return r.shown;
    }
    function openNotifications() {
      setMore(false);
      const N = NOTES();
      const tplList = h('ol', { class: 'ed-pages ed-notes' }), ruleList = h('ol', { class: 'ed-pages ed-rules' });
      const evName = (id) => (R.EVENTS.find((e) => e.id === id) || { label: id }).label;
      const fill = () => {
        tplList.replaceChildren(...N.templates.map((t) => {
          const c = R.fullConfig('notification', t.config);
          const del = h('button', { type: 'button', class: 'ed-mini-btn ed-mini-btn--danger', 'aria-label': `Delete ${t.name}`, title: 'Delete (press twice)' }, svg('trash'));
          del.addEventListener('click', () => confirmStep(del, '', () => { deleteTemplate(t.id); fill(); }, true));
          return h('li', { class: 'ed-pages__row ed-notes__row', 'data-template': t.id }, [
            h('span', { class: 'ed-notes__name' }, [h('b', { text: t.name }), h('span', { class: 'ed-popups__meta', text: `${c.position.replace('-', ' ')} · ${c.persistent ? 'persistent' : `${c.duration}s`} · ${c.tone}` })]),
            h('span', { class: 'ed-pages__btns' }, [
              h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'test', 'aria-label': `Test ${t.name}`, onclick: () => testTemplate(t.id) }, h('span', { text: 'Test' })),
              h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'edit', 'aria-label': `Edit ${t.name}`, onclick: () => openTemplate(t.id) }, h('span', { text: 'Edit' })),
              del,
            ]),
          ]);
        }));
        if (!N.templates.length) tplList.replaceChildren(h('li', { class: 'ed-hint', text: 'No templates yet.' }));
        ruleList.replaceChildren(...N.rules.map((r) => {
          const evOpts = R.EVENTS.some((e) => e.id === r.event) ? R.EVENTS : [...R.EVENTS, { id: r.event, label: r.event }];
          const del = h('button', { type: 'button', class: 'ed-mini-btn ed-mini-btn--danger', 'aria-label': `Delete rule ${r.id}`, title: 'Delete (press twice)' }, svg('trash'));
          del.addEventListener('click', () => confirmStep(del, '', () => { mutate('delete notification rule', () => { N.rules = N.rules.filter((x) => x.id !== r.id); }); fill(); }, true));
          return h('li', { class: 'ed-pages__row ed-rules__row', 'data-rule': r.id }, [
            h('label', { class: 'ed-check' }, [h('input', { type: 'checkbox', checked: r.enabled !== false, 'aria-label': `Rule ${r.id} enabled`, onchange: (e) => { setRule(r.id, { enabled: e.target.checked }, e.target.checked ? 'enable rule' : 'disable rule'); fill(); } }), h('span', { text: 'On' })]),
            h('select', { 'aria-label': `Event of rule ${r.id}`, 'data-k': 'rule-event', onchange: (e) => { setRule(r.id, { event: e.target.value }); fill(); } }, evOpts.map((e) => h('option', { value: e.id, text: e.label, selected: e.id === r.event }))),
            h('span', { class: 'ed-rules__arrow', 'aria-hidden': 'true', text: '→' }),
            h('select', { 'aria-label': `Template of rule ${r.id}`, 'data-k': 'rule-template', onchange: (e) => { setRule(r.id, { template: e.target.value }); fill(); } }, N.templates.map((t) => h('option', { value: t.id, text: t.name, selected: t.id === r.template }))),
            h('span', { class: 'ed-pages__btns' }, [del]),
          ]);
        }));
        if (!N.rules.length) ruleList.replaceChildren(h('li', { class: 'ed-hint', text: 'No rules yet. A rule shows a template when an event happens.' }));
        evList.replaceChildren(...R.EVENTS.map((e) => {
          const n = N.rules.filter((r) => r.event === e.id && r.enabled !== false).length;
          return h('li', { class: 'ed-events__row' }, [h('span', {}, [h('b', { text: e.label }), h('code', { text: e.id })]), h('span', { class: 'ed-popups__meta', text: `${n} rule${n === 1 ? '' : 's'}` }),
            h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'fire', 'data-event': e.id, 'aria-label': `Fire ${e.id}`, onclick: () => {
              const r = fireReport(e.id);
              fired.dataset.state = r.state; fired.dataset.event = r.event; fired.textContent = r.text; fired.hidden = false;
              if (r.nids.length) { const t = N.templates.find((x) => x.id === (N.rules.find((q) => q.event === e.id && q.enabled !== false) || {}).template); showOnScreen(r.nids, t && R.fullConfig('notification', t.config)); }
            } }, h('span', { text: 'Fire' }))]);
        }));
      };
      const evList = h('ul', { class: 'ed-events' });
      // what the last Fire did — always said here, in the dialog (never only in a toast behind it)
      const fired = h('p', { class: 'ed-fired', 'data-k': 'fire-result', role: 'status', 'aria-live': 'polite', hidden: true });
      fill();
      const nd = dialog('ed-dlg--notes', 'Notifications', [
        h('p', { class: 'ed-hint', text: 'Event → Rule → Template → notification. Templates are the design; rules decide which event shows which template. Today the events are demo events; later Home Assistant events plug into the same rules.' }),
        h('h4', { class: 'ed-sub', text: 'Templates' }), tplList,
        h('button', { type: 'button', class: 'ed-btn', 'data-k': 'add-template', onclick: () => { const id = createTemplate(); fill(); openTemplate(id); } }, [svg('plus'), h('span', { text: 'New template' })]),
        h('h4', { class: 'ed-sub', text: 'Rules' }), ruleList,
        h('button', { type: 'button', class: 'ed-btn', 'data-k': 'add-rule', onclick: () => { addRule(); fill(); } }, [svg('plus'), h('span', { text: 'New rule' })]),
        h('h4', { class: 'ed-sub', text: 'Demo events' }),
        h('p', { class: 'ed-hint', text: 'Fire runs a demo event through your rules (event → rule → template), exactly as a Home Assistant event will. Test on a template shows that template directly, without a rule.' }),
        evList, fired,
      ], [h('button', { type: 'button', class: 'ed-btn', 'data-k': 'clear-notes', onclick: () => notes.clear() }, h('span', { text: 'Clear notifications' }))]);
      nd.addEventListener('close', () => unpeek());
    }

    /* ================================================================== persistence */
    /** Save the dashboard. Returns (a promise of) true only when it is really stored: the browser store is read back;
        the server store answers with the new revision. On failure nothing is marked saved — the unsaved state, the work
        and edit mode all stay as they are. A server 'conflict' (another device saved a newer version) never
        overwrites that version: the conflict bar offers to reload it. */
    let saving = null;
    function save() {
      if (saving) return saving;
      saving = (async () => {
        const text = snap();
        // NOTHING INVALID IS STORED: the same validation that opens a dashboard runs before it is saved. A link to a popup / page /
        // template the dashboard no longer has opens the repair (the user chooses; nothing is changed silently).
        const v = M.validate(JSON.parse(text), R);
        if (!v.ok) {
          saveError = true; refreshChrome();
          if (M.brokenReferences(app).length || M.layoutIssues(app, R).length) openRepair();
          else say(`Not saved: ${v.errors[0]} Your changes are still here.`, 'warn');
          return false;
        }
        let res;
        try { res = await store.save(text); } catch (e) { res = false; }
        const ok = typeof res === 'boolean' || res === undefined ? res !== false && store.load() === text : !!(res && res.ok);
        if (!ok) {
          saveError = true; refreshChrome();
          if (res && res.error === 'conflict') showConflict();
          else say(res && res.message ? `Not saved: ${res.message} Your changes are still here.` : 'Not saved: this browser refused to store the dashboard. Your changes are still here — try again, or Export them.', 'warn');
          return false;
        }
        saveError = false;
        store.clearDraft && store.clearDraft();
        draftBar.hidden = true;
        const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        setClean(store.server ? `Saved on the server · ${time}` : `Saved · ${time}`);
        if (snap() !== text) { savedText = text; refreshChrome(); }      // edited while saving: those edits stay unsaved
        if (res && res.entry && opts.onSaved) opts.onSaved(res.entry, !!res.created);
        if (res && res.entry) liveSync.saved(res.entry);
        say(res && res.created ? `Saved on the server as “${res.entry.name}”` : 'Saved');
        return true;
      })();
      saving.finally(() => { saving = null; });
      return saving;
    }
    /** Done: save (when there is anything to save) and leave edit mode — never leaves when the save failed */
    async function done() {
      if (isDirty() && !(await save())) return false;
      setEditing(false);
      return true;
    }
    async function load() {
      let text = store.load();
      if (text && typeof text.then === 'function') text = await text;
      if (text && typeof text === 'object') return say(text.message || 'The saved dashboard could not be loaded', 'warn');   // server error: nothing replaced
      if (!text) return say(store.server ? 'This dashboard is not saved on the server yet' : 'Nothing saved in this browser yet');
      const r = M.parse(text, R);
      if (!r.ok) return say('The saved dashboard is not valid and was not loaded', 'warn');
      saveError = false;
      replaceModel(r.model, store.server ? 'Loaded the latest saved version from the server' : 'Reverted to the last saved dashboard');
      setClean(store.server ? 'Latest server version loaded' : 'Last save restored');
    }
    function reset() {
      setMore(false);
      if (store.server) {                        // never erases anything on the server: the sample is just shown, unsaved
        replaceModel(opts.demo(), 'Replaced with the built-in sample — not saved (Save to keep it, Revert to undo)');
        refreshChrome();
        return;
      }
      store.clear(); store.clearDraft && store.clearDraft();
      replaceModel(opts.demo(), 'Reset to the built-in dashboard');
      setClean('Built-in dashboard · not saved');
    }
    /* ================================================================== LIVE SYNC (wall tablets): a screen that shows a server dashboard
       and is NOT being edited picks up a save made on another screen by itself — no manual refresh.
         · every 15 s while the page is visible (and at once when it becomes visible again) it asks the server for the dashboard's
           REVISION only (api/dashboards.php?rev=<id>: a few bytes, the dashboard file is not read whole) — nothing while hidden;
         · other tabs of the SAME browser are told at once on save (BroadcastChannel), so they check without waiting;
         · a newer revision is loaded only while nothing here is unsaved and the editor is closed; the page shown stays the same when it
           still exists (an open popup closes);
         · when the APPLICATION itself was updated (its files replaced: the build id changes) the page reloads, again only when idle. */
    /* WALL TABLET (viewing only, never while editing): app.app.wall { saver (min), saverStyle, returnHome (min), popupClose (s) }; the
       address can override one screen: ?saver=N ?return=N ?popupclose=N. The screensaver is a full-screen layer (a dim clock moved a
       little each minute against burn-in, or black); a touch wakes the screen and that touch never reaches a widget. */
    const wall = (() => {
      const q = new URLSearchParams(location.search);
      const num = (k) => { const v = q.get(k); return v !== null && /^\d{1,4}$/.test(v) ? Number(v) : null; };
      let last = Date.now(), wokeAt = -1e9, layer = null, tick = 0;   // wokeAt: no wake yet (a click right after loading is never swallowed)
      const cfg = () => { const W = (app && app.app && app.app.wall) || {}; return { saver: num('saver') ?? W.saver ?? 0, returnHome: num('return') ?? W.returnHome ?? 0, popupClose: num('popupclose') ?? W.popupClose ?? 0, style: W.saverStyle || 'clock' }; };
      const touch = () => { last = Date.now(); };
      ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, touch, { capture: true, passive: true }));
      // the click that follows the waking touch would land on a widget: swallowed
      addEventListener('click', (e) => { if (performance.now() - wokeAt < 700) { e.preventDefault(); e.stopPropagation(); } }, true);
      function sleep(style) {
        if (layer) return;
        layer = h('div', { class: `iq-saver iq-saver--${style}`, role: 'presentation', 'data-k': 'screensaver' }, h('div', { class: 'iq-saver__clk' }, [h('div', { class: 'iq-saver__t' }), h('div', { class: 'iq-saver__d' })]));
        const wake = (e) => { e.preventDefault(); e.stopPropagation(); wokeAt = performance.now(); touch(); stopSaver(); };
        layer.addEventListener('pointerdown', wake); layer.addEventListener('keydown', wake);
        document.body.append(layer);
        const paint = () => {
          if (!layer) return;
          const d = new Date();
          layer.querySelector('.iq-saver__t').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          layer.querySelector('.iq-saver__d').textContent = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
          const c = layer.querySelector('.iq-saver__clk'); c.style.left = `${30 + Math.random() * 40}%`; c.style.top = `${30 + Math.random() * 40}%`;
        };
        paint(); tick = setInterval(paint, 60000);
      }
      function stopSaver() { clearInterval(tick); if (layer) { layer.remove(); layer = null; } }
      setInterval(() => {
        if (editing) { stopSaver(); return; }
        const c = cfg(), idle = (Date.now() - last) / 1000;
        if (c.popupClose && idle >= c.popupClose && popupHost && popupHost.current()) popupHost.close('idle');
        if (c.returnHome && idle >= c.returnHome * 60 && app.app.startPage && nav.current() !== app.app.startPage) { if (popupHost && popupHost.current()) popupHost.close('idle'); nav.go(app.app.startPage, 'idle'); }
        if (c.saver && idle >= c.saver * 60) sleep(c.style);
      }, 1000);
      return { sleeping: () => !!layer, idleFor: (s) => { last = Date.now() - s * 1000; }, stop: stopSaver };
    })();

    const liveSync = (() => {
      const EVERY = Math.max(5, Math.min(600, Number(new URLSearchParams(location.search).get('sync')) || 15)) * 1000;
      let timer = 0, build = null, busy = false, chan = null;
      const cur = () => (store && store.server && store.current ? store.current() : null);
      const idle = () => !editing && !isDirty() && !saving;
      async function check() {
        const c = cur();
        if (!c || busy || document.hidden) return;
        busy = true;
        try {
          const r = await fetch(`api/dashboards.php?rev=${encodeURIComponent(c.id)}`, { credentials: 'same-origin', cache: 'no-store' }).then((x) => x.json()).catch(() => null);
          if (!r) return;
          if (r.build) { if (build && r.build !== build && idle()) { location.reload(); return; } build = r.build; }
          if (r.ok && Number.isInteger(r.revision) && r.revision !== c.revision && idle()) await pull();
        } finally { busy = false; }
      }
      async function pull() {
        const page = nav.current();
        let text = await store.load();
        if (!text || typeof text === 'object') return;
        const r = M.parse(text, R);
        if (!r.ok) return;
        replaceModel(r.model);
        setClean('Updated from another screen');
        if (page && app.pages.some((p) => p.id === page) && nav.current() !== page) nav.go(page, 'api');
        root.dataset.synced = String(Date.now());
      }
      const loop = () => { clearTimeout(timer); timer = setTimeout(async () => { await check(); loop(); }, EVERY); };
      function start() {
        if (!cur()) return;
        try { chan = new BroadcastChannel('iniqdash-dashboards'); chan.onmessage = (ev) => { const c = cur(); if (ev.data && c && ev.data.id === c.id && ev.data.revision !== c.revision) check(); }; } catch (e) { chan = null; }
        document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
        check(); loop();
      }
      return { start, check, saved: (entry) => { try { chan && chan.postMessage({ id: entry.id, revision: entry.revision }); } catch (e) { /* closed */ } } };
    })();

    /** a save was refused because another device saved a newer version: say so, offer to load it (never merge) */
    function showConflict() {
      draftBar.replaceChildren(
        h('p', {}, [h('b', { text: 'Not saved — this dashboard was changed on another device.' }), ' Reload the latest version before saving. Your changes are still here (Export them first if you want to keep a copy).']),
        h('div', { class: 'ed-draft__btns' }, [
          h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'conflict-reload', onclick: (e) => confirmStep(e.currentTarget, 'Confirm: discard my changes', () => { draftBar.hidden = true; load(); }) }, h('span', { text: 'Reload the latest version' })),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'conflict-export', onclick: () => openExport() }, h('span', { text: 'Export my changes' })),
          h('button', { type: 'button', class: 'ed-btn', onclick: () => { draftBar.hidden = true; } }, h('span', { text: 'Keep editing' })),
        ]),
      );
      draftBar.setAttribute('aria-label', 'Save conflict');
      draftBar.hidden = false;
    }
    /** whole-dashboard replacement (load / reset / import / draft restore): one deliberate operation,
        history starts fresh — undo never resurrects a different dashboard */
    function replaceModel(m, message) {
      app = m; selected = null; history.clear(); draftBar.hidden = true;
      applySimulated();
      design = { kind: 'page' };
      if (popupHost && popupHost.current()) popupHost.close('api');
      closeDetails();
      nav.reset(app.app.startPage);
      render(); afterChange();
      if (message) say(message);
    }

    /* ================================================================== WIDGET STUDIO: it edits MY WIDGETS definitions (reusable, stored
       server-side — components/studio/library.js); the gallery adds them to any dashboard as INSTANCES (a "studio" item referencing the
       definition). An older Studio widget (an item of type "studio" holding its own components — the proof of concept) can be opened;
       saving it makes it a definition and turns that item into an instance of it (one undoable change, then the dashboard is saved). */
    function studioLegacy() {
      return app.pages.flatMap((pg) => pg.items.filter((i) => i.type === 'studio' && i.config && !i.config.definition).map((i) => ({ id: i.id, page: pg.id, name: i.config.name, config: structuredClone(i.config) })));
    }
    async function studioAdopt(itemId, defId) {
      const it = app.pages.flatMap((pg) => pg.items).find((i) => i.id === itemId && i.type === 'studio');
      if (!it) return { ok: false };
      mutate('Studio widget → reusable widget', () => { it.config = R.fullConfig('studio', { definition: defId }); }, { rerender: true });
      const ok = await save();
      return { ok: ok !== false };
    }
    function openStudio() {
      if (!global.IniqStudio) return say('Widget Studio is not loaded', 'warn');
      global.IniqStudio.open({ mount: root, library: global.IniqStudioLibrary, legacy: studioLegacy, adopt: studioAdopt, scope: 'studio',
        categories: Object.entries(R.CATEGORIES).filter(([k]) => !['containers', 'custom'].includes(k)),
        // the collections a widget may belong to (IniqDash's, installed ones, the user's) — and a new one, created from Studio
        collections: () => R.collections().filter((c) => c.id !== 'general').map((c) => ({ id: c.id, name: c.name, user: !!c.user })),
        createCollection: global.IniqStudioLibrary ? (n) => global.IniqStudioLibrary.createCollection(n) : null,
        builtins: [{ value: 'widgets/default/studio/assets/landscape.svg', label: 'Landscape' }, { value: 'widgets/default/studio/assets/room.svg', label: 'Room' }] });
    }

    /* ================================================================== dialogs: export / import */
    /** ABOUT: the version, what INIQDASH is, its licence and founder — and, discreetly, how to support the project */
    function openAbout() {
      const ver = document.querySelector('meta[name="iniqdash-version"]')?.content || '';
      dialog('ed-dlg--about', 'About INIQDASH', [
        h('p', {}, [h('strong', { text: 'INIQDASH' }), document.createTextNode(ver ? ` ${ver}` : '')]),
        h('p', { class: 'ed-hint', text: 'A customizable, open-source Home Assistant dashboard with visual editing, reusable widgets and a dashboard generator.' }),
        h('p', { class: 'ed-hint', text: 'Free software under the Mozilla Public License 2.0. Copyright © 2026 Marcel Rymenhout and IniqDash contributors. Founded and originally developed by Marcel Rymenhout. Third-party material keeps its own licence (THIRD-PARTY-NOTICES.md). Not affiliated with Home Assistant or the Open Home Foundation.' }),
        h('div', { class: 'ed-about__support', 'data-k': 'about-support' }, [
          h('p', { class: 'ed-hint', text: 'Enjoying INIQDASH? You can support its development:' }),
          bmcButton(),
        ]),
      ]);
    }
    /** the Buy Me a Coffee button, in the service's own colours (yellow, black). Drawn here — a local cup and text, no image, script or
     *  request to another site; only a click leaves INIQDASH, in a new tab without access to this page (noopener) */
    function bmcButton() {
      const NS = 'http://www.w3.org/2000/svg';
      const el = (tag, attrs) => { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
      const cup = el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', class: 'ed-bmc__cup' });
      cup.append(el('path', { d: 'M6.2 8.5h11.6l-1.5 12.2a1.5 1.5 0 0 1-1.5 1.3H9.2a1.5 1.5 0 0 1-1.5-1.3z', class: 'ed-bmc__body' }),
        el('path', { d: 'M7.4 13.5h9.2l-.9 7.1a.6.6 0 0 1-.6.5H8.9a.6.6 0 0 1-.6-.5z', class: 'ed-bmc__fill' }),
        el('path', { d: 'M6.6 4.8h10.8l.9 3.7H5.7z', class: 'ed-bmc__lid' }),
        el('path', { d: 'M8.6 2h6.8l.8 2.8H7.8z', class: 'ed-bmc__lid' }));
      return h('a', { class: 'ed-bmc', href: 'https://buymeacoffee.com/iniqdash', target: '_blank', rel: 'noopener noreferrer',
        title: 'Support INIQDASH on Buy Me a Coffee (opens in a new tab)' }, [cup, h('span', { text: 'Buy me a coffee' })]);
    }
    function dialog(cls, titleText, body, foot) {
      const d = h('dialog', { class: `ed-dlg ${cls}`, 'aria-label': titleText }, [
        h('div', { class: 'ed-dlg__head' }, [h('h3', { text: titleText }), h('button', { type: 'button', class: 'ed-btn ed-btn--ghost', onclick: () => d.close() }, h('span', { text: 'Close' }))]),
        h('div', { class: 'ed-dlg__body' }, body),
        foot ? h('div', { class: 'ed-dlg__foot' }, foot) : null,
      ]);
      d.addEventListener('close', () => d.remove());
      // GLOBAL DISMISSAL RULE: an editor modal closes only by its own buttons or Escape — never by a click outside it
      global.MaisonConfigure.guard(d);
      root.append(d);
      d.showModal();
      return d;
    }
    function openExport() {
      const text = snap();
      const ta = h('textarea', { class: 'ed-code', readonly: true, rows: '14', 'aria-label': 'Dashboard configuration JSON' });
      ta.value = text;
      const copyBtn = h('button', { type: 'button', class: 'ed-btn' }, h('span', { text: 'Copy' }));
      copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(text); copyBtn.querySelector('span').textContent = 'Copied'; }
        catch (e) { ta.focus(); ta.select(); copyBtn.querySelector('span').textContent = 'Selected — press Ctrl/Cmd + C'; }
      });
      const dl = h('button', { type: 'button', class: 'ed-btn ed-btn--primary', onclick: () => {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = h('a', { href: url, download: `${app.app.id || 'dashboard'}.json` });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } }, h('span', { text: 'Download .json' }));
      dialog('ed-dlg--export', 'Export configuration', [h('p', { class: 'ed-hint', text: `Version ${app.version} · ${app.pages.length} page${app.pages.length > 1 ? 's' : ''} · ${allItems().length} items · configuration only (no active page, selection, history or editor state)` }), ta], [copyBtn, dl]);
    }
    function openImport() {
      const ta = h('textarea', { class: 'ed-code', rows: '12', placeholder: 'Paste a dashboard configuration (JSON)…', 'aria-label': 'Configuration to import' });
      const errs = h('ul', { class: 'ed-errors', 'aria-live': 'polite' });
      const file = h('input', { type: 'file', accept: '.json,application/json', class: 'ed-file' });
      const showErrs = (list) => errs.replaceChildren(...list.map((t) => h('li', { text: t })));
      file.addEventListener('change', () => {
        const f = file.files[0];
        if (!f) return;
        if (f.size > 1024 * 1024) { showErrs(['The file is larger than 1 MB.']); return; }
        f.text().then((t) => { ta.value = t; showErrs([]); });
      });
      let d;
      const nameIn = opts.dashboards ? h('input', { type: 'text', maxlength: '60', 'data-k': 'import-name', placeholder: 'e.g. Imported dashboard' }) : null;
      const go = h('button', { type: 'button', class: 'ed-btn ed-btn--primary', onclick: async () => {
        const r = M.parse(ta.value, R);
        if (!r.ok) { showErrs(['Not imported:', ...r.errors]); return; }
        if (opts.dashboards) {          // server: the import becomes a NEW server dashboard (never overwrites one)
          const name = (nameIn.value.trim() || 'Imported dashboard').slice(0, 60);
          const c = await opts.dashboards.create(name, r.model, { unique: true });
          if (!c.ok) { showErrs(['Not imported:', opts.dashboards.message(c)]); return; }
          d.close();
          say(`Imported as “${c.entry.name}” — opening it…`);
          opts.dashboards.open(c.entry.id);
          return;
        }
        d.close();
        const n = r.model.pages.reduce((t, p) => t + p.items.length, 0);
        replaceModel(r.model, `Imported ${r.model.pages.length} page${r.model.pages.length > 1 ? 's' : ''}, ${n} items${r.migrated ? ` (upgraded from version ${r.migrated})` : ''} — not saved yet`);
      } }, h('span', { text: 'Import' }));
      d = dialog('ed-dlg--import', 'Import configuration', [
        h('p', { class: 'ed-hint', text: 'The configuration is validated first (version, types, ids, parents, layout numbers, breakpoints and every widget setting). Nothing in it is executed; invalid files are rejected and the current dashboard stays as it is. Importing starts a fresh undo history.' }),
        ...(nameIn ? [h('p', { class: 'ed-hint', text: 'On this server an import becomes a NEW dashboard (no existing dashboard is changed).' }), field('Name of the new dashboard', nameIn)] : []),
        field('JSON file', file), ta, errs,
      ], [go]);
    }

    /* ================================================================== Settings → Home Assistant connection
       The URL and the long-lived token live on the SERVER (private folder, api/ha_settings.php). The saved token is never
       sent here: the form only knows whether one is configured. A blank token field = keep the saved one (the server
       uses it for the test — only with the saved address; a changed address needs the token again). Save is possible only after a successful test of exactly what is in the form, and the
       server tests again before it writes. The token typed here is kept only in this field, never stored in the browser. */
    const HA_MSG = {
      url_missing: 'Enter the Home Assistant address.',
      url_scheme: 'The address must start with http:// or https://.',
      url_invalid: 'This is not a valid address. Example: http://192.168.1.50:8123',
      token_missing: 'Enter a long-lived access token.',
      token_required: 'You changed the address: paste the long-lived access token again (the saved token is only ever sent to the saved address).',
      token_invalid: 'This does not look like a long-lived access token (at least 20 characters, no spaces).',
      auth: 'Home Assistant rejected the token. Create a new long-lived access token and try again.',
      unreachable: 'Could not reach Home Assistant at this address. Check the address and port, and that Home Assistant is running.',
      dns: 'This host name could not be found. Check the address.',
      tls: 'The secure (https) connection failed: certificate or TLS problem. Check the address, or use the http:// local address.',
      timeout: 'Connection timed out. Check the address, the port and the network.',
      not_home_assistant: 'Something answered at this address, but it is not Home Assistant. Check the address and port.',
      http: 'Home Assistant answered with an error. Check the address.',
      too_large: 'Home Assistant answered with an unexpected response. Check the address.',
      storage_unavailable: 'The server has no private settings folder for IniqDash. Run the setup tool (server/setup.php) once.',
      write_failed: 'The settings could not be saved on the server (its private folder is not writable). Nothing was changed.',
      signed_out: 'Your session has expired — sign in again, then try again.',
      network: 'The IniqDash server did not answer. Check your connection and try again.',
      bad_request: 'The request was not understood. Reload the page and try again.',
    };
    async function haSettingsCall(method, body) {
      let res;
      try {
        res = await fetch('api/ha_settings.php', { method, credentials: 'same-origin', cache: 'no-store',
          headers: method === 'POST' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="iniqdash-csrf"]')?.content || '' } : {},
          ...(body ? { body: JSON.stringify(body) } : {}) });
      } catch (e) { return { ok: false, error: 'network' }; }
      if (res.status === 401 || res.status === 403) return { ok: false, error: 'signed_out' };
      try { return await res.json(); } catch (e) { return { ok: false, error: 'network' }; }
    }
    /** the "Simulated home" badge: what is simulated, and what to do next (connect Home Assistant · edit this dashboard) */
    function openSimInfo() {
      const d = dialog('ed-dlg--sim', 'This is a simulated home', [
        h('p', { text: 'Everything on this dashboard comes from a simulated home on your IniqDash server. Lights, climate, energy, the alarm and the locks all respond, but nothing reaches a real device. Your changes to the simulation are yours alone (this browser session), and "Reset demo" on the Security page starts it over.' }),
        h('p', { text: 'To use your own home: connect Home Assistant, then create a dashboard (Edit → More → Dashboards) or change the entities of this one. Every widget here is a standard IniqDash widget you can edit.' }),
      ], [
        ...(onServer ? [h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'sim-connect', onclick: () => { d.close(); openHaSettings(); } }, h('span', { text: 'Connect Home Assistant…' }))] : []),
        h('button', { type: 'button', class: 'ed-btn', 'data-k': 'sim-edit', onclick: () => { d.close(); setEditing(true); } }, h('span', { text: 'Edit this dashboard' })),
      ]);
    }
    function openHaSettings() {
      setMore(false);
      const state = h('p', { class: 'ed-has__state', role: 'status' });
      const live = h('p', { class: 'ed-has__live', role: 'status', 'aria-live': 'polite' });
      const url = h('input', { type: 'url', inputmode: 'url', spellcheck: 'false', autocomplete: 'off', placeholder: 'http://homeassistant.local:8123', 'data-k': 'ha-url', maxlength: '300' });
      const token = h('input', { type: 'password', spellcheck: 'false', autocomplete: 'new-password', 'data-k': 'ha-token', maxlength: '2048' });
      const show = h('button', { type: 'button', class: 'ed-btn ed-has__show', 'data-k': 'ha-show', 'aria-pressed': 'false', disabled: true,
        onclick: () => { const on = token.type === 'password'; token.type = on ? 'text' : 'password'; show.setAttribute('aria-pressed', String(on)); show.querySelector('span').textContent = on ? 'Hide' : 'Show'; } },
        h('span', { text: 'Show' }));
      const result = h('div', { class: 'ed-has__result', role: 'status', 'aria-live': 'polite', hidden: true });
      const testBtn = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'ha-test' }, h('span', { text: 'Test connection' }));
      const saveBtn = h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'ha-save', disabled: true, title: 'Test the connection first' }, h('span', { text: 'Save' }));
      let tokenSaved = false, testedSig = null, busy = false;
      const sig = () => `${url.value.trim()}\n${token.value.trim()}`;
      const showResult = (r, saved) => {
        result.hidden = false;
        result.dataset.tone = r.ok ? 'ok' : 'bad';
        result.textContent = r.ok
          ? `${saved ? 'Saved. ' : ''}Connected to Home Assistant${r.version ? ` · version ${r.version}` : ''}${Number.isInteger(r.entities) ? ` · ${r.entities} entities` : ''}${saved ? '' : ' — not saved yet.'}`
          : (HA_MSG[r.error] || 'The connection test failed.');
      };
      const paint = (st) => {
        tokenSaved = !!st.tokenConfigured;
        state.textContent = st.configured ? `Configured · ${st.url}` : st.url ? `Not working with the saved settings · ${st.url}` : 'Not configured';
        state.dataset.tone = st.configured ? 'ok' : 'bad';
        token.placeholder = tokenSaved ? '•••••••••••• Token configured — leave empty to keep it' : 'Paste a long-lived access token';
        tokenHelp.textContent = tokenSaved
          ? 'A token is saved on the server (it is never shown). To replace it, paste a new one, then Test connection and Save.'
          : 'Create a long-lived access token in your Home Assistant profile (Security tab).';
      };
      const tokenHelp = h('p', { class: 'ed-hint' });
      const sync = () => {
        show.disabled = !token.value;
        if (!token.value && token.type === 'text') { token.type = 'password'; show.setAttribute('aria-pressed', 'false'); show.querySelector('span').textContent = 'Show'; }
        const tested = testedSig !== null && testedSig === sig();
        saveBtn.disabled = busy || !tested;
        saveBtn.title = tested ? 'Save these settings on the server' : 'Test the connection first';
        testBtn.disabled = busy;
      };
      const edited = () => { if (testedSig !== null && testedSig !== sig()) { testedSig = null; result.hidden = true; } sync(); };
      url.addEventListener('input', edited); token.addEventListener('input', edited);
      const run = async (action) => {
        busy = true; sync();
        result.hidden = false; result.dataset.tone = 'busy'; result.textContent = action === 'save' ? 'Saving…' : 'Testing the connection…';
        const s0 = sig();
        const r = await haSettingsCall('POST', { action, url: url.value.trim(), ...(token.value.trim() ? { token: token.value.trim() } : {}) });
        busy = false;
        testedSig = r.ok && action === 'test' && s0 === sig() ? s0 : null;
        showResult(r, action === 'save' && r.ok);
        if (r.settings) paint(r.settings);
        if (action === 'save' && r.ok) {
          token.value = ''; token.type = 'password'; testedSig = null;
          if (r.settings && r.settings.url) url.value = r.settings.url;
          say('Home Assistant connection saved');
          try { global.IniqHA?.entities?.({ fresh: true }); } catch (e) { /* the next poll picks it up */ }
          liveCheck();
        }
        sync();
      };
      testBtn.addEventListener('click', () => run('test'));
      saveBtn.addEventListener('click', () => run('save'));
      // a live check of the SAVED connection (labelled as such: the form's values are only tested on request)
      async function liveCheck() {
        live.textContent = 'Checking the saved connection…'; live.dataset.tone = '';
        let d = null;
        try { const r = await fetch('api/ha_status.php', { credentials: 'same-origin', cache: 'no-store' }); d = r.ok ? await r.json() : null; } catch (e) { d = null; }
        if (!d) { live.textContent = ''; return; }
        live.dataset.tone = d.connected ? 'ok' : 'bad';
        live.textContent = !d.configured ? '' : d.connected ? `Right now: connected${d.version ? ` · Home Assistant ${d.version}` : ''}` : `Right now: not connected — ${HA_MSG[d.error] || 'Home Assistant is not reachable.'}`;
      }
      const d = dialog('ed-dlg--ha', 'Settings · Home Assistant connection', [
        state, live,
        field('Home Assistant URL', url),
        h('p', { class: 'ed-hint', text: 'For example http://192.168.1.50:8123, http://homeassistant.local:8123 or your https address (e.g. Nabu Casa).' }),
        h('label', { class: 'ed-field' }, [h('span', { text: 'Long-lived access token' }), h('span', { class: 'ed-has__tok' }, [token, show])]),
        tokenHelp,
        result,
      ], [testBtn, saveBtn]);
      d.addEventListener('close', () => { token.value = ''; });           // nothing typed outlives the dialog
      state.textContent = 'Loading…';
      sync();
      haSettingsCall('GET').then((st) => {
        if (!st.ok) { state.textContent = HA_MSG[st.error] || 'The settings could not be loaded.'; state.dataset.tone = 'bad'; return; }
        url.value = st.url || '';
        paint(st);
        if (!st.storage) { result.hidden = false; result.dataset.tone = 'bad'; result.textContent = HA_MSG.storage_unavailable; }
        sync();
        if (st.configured) liveCheck();
        (st.url ? token : url).focus();
      });
    }

    /* ================================================================== Dashboards (server storage)
       One dialog: New · and per dashboard Open · Rename · Duplicate · Delete (named confirmation). Names are user text:
       always rendered with textContent. Opening another dashboard reloads the editor on it (?d=<id>). */
    /* ---- GENERATE (Home Assistant areas → a dashboard / a page). Discovery is the server's (api/ha_entities.php: HA's own areas and each
       entity's area); the layout is IniqGenerate's. "Use the simulated home" reads the fictional home instead (the result is then a
       simulated dashboard). Nothing in Home Assistant is changed. */
    async function discover(simulated) {
      try {
        const r = await fetch('api/ha_entities.php?fresh=1', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(simulated ? { 'X-IniqDash-Simulated': '1' } : {}) } });
        const d = await r.json().catch(() => null);
        return d && d.ok ? d : { ok: false, error: (d && d.error) || `http_${r.status}` };
      } catch (e) { return { ok: false, error: 'server_unreachable' }; }
    }
    /** THE GENERATOR'S FORM (rooms, devices, pages, look, live preview): used by "Generate a dashboard" and by the first-run wizard.
        onState(ok) → whether a valid dashboard can be made right now. build() → { model, g, name } | { error } — nothing is created here. */
    function genForm(onState = () => {}) {
      const body = h('div', { class: 'ed-gen', 'data-k': 'gen-body' });
      const name = h('input', { type: 'text', maxlength: '60', value: 'My home', 'data-k': 'gen-name', 'aria-label': 'Name of the new dashboard' });
      let found = null, sim = false, template = null;
      // the official demo dashboard: its theme and grid are the generated dashboard's design (read once; without it: the default look)
      const demoTpl = () => template || fetch('assets/demo/iniqdash-demo.json', { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((t) => { template = t; return t; });
      const chk = (k, label, on = true, extra = {}) => h('label', { class: 'ed-check' }, [h('input', { type: 'checkbox', 'data-k': k, ...(on ? { checked: true } : {}), ...extra }), h('span', { text: label })]);
      const val = (k) => { const x = body.querySelector(`[data-k="${k}"]`); return x ? (x.type === 'checkbox' ? x.checked : x.value) : null; };
      const load = async (simulated) => {
        sim = simulated; body.replaceChildren(h('p', { class: 'ed-hint', text: 'Reading your Home Assistant areas…' })); onState(false);
        const [d] = await Promise.all([discover(simulated), demoTpl()]);
        if (!d.ok || d.configured === false || d.connected === false) {
          body.replaceChildren(h('p', { class: 'ed-hint', text: d.configured === false ? 'Home Assistant is not connected yet (Settings → Home Assistant). You can try the generator with the simulated home.' : `Home Assistant could not be reached (${d.error || 'no answer'}). You can try the generator with the simulated home.` }),
            h('button', { type: 'button', class: 'ed-btn', 'data-k': 'gen-sim', onclick: () => load(true) }, h('span', { text: 'Use the simulated home' })));
          return;
        }
        found = d;
        const sum = global.IniqGenerate.summary(d);
        const withSome = sum.areas.filter((a) => a.count);
        if (!withSome.length && !sum.unassigned) { body.replaceChildren(h('p', { class: 'ed-hint', text: 'No lights, climate, switches, covers, media players or sensors were found.' })); return; }
        const TD = global.IniqGenerateDemo;
        // each room: a checkbox, and its devices (Home Assistant's own area) to leave out one by one
        const rows = withSome.map((a) => {
          const devs = (d.entities || []).filter((e) => e.areaId === a.id && (!TD || TD.tabOf(e)));
          return h('div', { class: 'ed-gen__area' }, [
            h('label', { class: 'ed-check' }, [h('input', { type: 'checkbox', checked: true, value: a.id, 'data-k': 'gen-area' }), h('span', { text: `${a.name} · ${a.count} device${a.count === 1 ? '' : 's'}` })]),
            devs.length ? h('details', { class: 'ed-gen__devs' }, [h('summary', { text: 'Devices…' }), h('div', { class: 'ed-gen__devlist' }, devs.slice(0, 200).map((e) => h('label', { class: 'ed-check' },
              [h('input', { type: 'checkbox', checked: true, value: e.id, 'data-k': 'gen-dev' }), h('span', { text: `${e.name}${TD ? ` — ${({ lights: 'Lights', heating: 'Heating', media: 'Media', security: 'Security', sensors: 'Sensors', devices: 'Active' })[TD.tabOf(e)] || ''}` : ''}` })])))]) : null].filter(Boolean));
        });
        const empty = sum.areas.filter((a) => !a.count).map((a) => a.name);
        const style = h('select', { 'data-k': 'gen-style', class: 'ed-input' }, [h('option', { value: 'demo', text: 'The demo design — Home, Lights, Climate, Rooms (rooms open a popup with tabs), Energy, Security' }), h('option', { value: 'simple', text: 'Simple — Home and a page per room' })]);
        const unassigned = h('select', { 'data-k': 'gen-unassigned', class: 'ed-input' }, [h('option', { value: 'skip', text: 'Leave them out' }), h('option', { value: 'page', text: 'A page “Unassigned” with lists by kind' })]);
        const look = h('select', { 'data-k': 'gen-look', class: 'ed-input' }, [h('option', { value: 'demo', text: 'The demo’s charcoal theme' }), h('option', { value: 'default', text: 'IniqDash’s default theme' })]);
        const preview = h('div', { class: 'ed-gen__preview', 'data-k': 'gen-preview', role: 'status', 'aria-live': 'polite' });
        const demoOpts = h('div', { class: 'ed-gen__opts', 'data-k': 'gen-demo-opts' }, [
          h('p', { class: 'ed-sub', text: 'Pages' }),
          h('div', { class: 'ed-gen__row' }, [chk('gen-p-lights', 'Lights'), chk('gen-p-climate', 'Climate'), chk('gen-p-energy', 'Energy'), chk('gen-p-security', 'Security')]),
          h('div', { class: 'ed-gen__row' }, [chk('gen-notify', 'Notification centre'), chk('gen-radial', 'Radial menu'), chk('gen-photos', 'Room photos (where the room’s name matches)')]),
          h('label', { class: 'ed-field' }, [h('span', { text: `Devices in no area (${sum.unassigned})` }), unassigned]),
          h('label', { class: 'ed-field' }, [h('span', { text: 'Look' }), look]),
        ]);
        body.replaceChildren(...[
          h('p', { class: 'ed-hint', text: `${sim ? 'The simulated home' : 'Home Assistant'}: ${sum.areas.length} area${sum.areas.length === 1 ? '' : 's'}${sum.people ? `, ${sum.people} ${sum.people === 1 ? 'person' : 'people'}` : ''}${sum.weather ? ', weather' : ''}. Nothing is changed in Home Assistant; a new dashboard is created and every part of it stays editable.` }),
          h('label', { class: 'ed-field' }, [h('span', { text: 'Design' }), style]),
          h('p', { class: 'ed-sub', text: 'Rooms' }),
          h('div', { class: 'ed-gen__areas', role: 'group', 'aria-label': 'Areas' }, rows),
          empty.length ? h('p', { class: 'ed-hint', text: `Areas with nothing to show are left out: ${empty.join(', ')}.` }) : null,
          demoOpts,
          sum.unassigned ? h('label', { class: 'ed-check', 'data-k': 'gen-other-row' }, [h('input', { type: 'checkbox', 'data-k': 'gen-other' }), h('span', { text: `Also a page "Other" for the ${sum.unassigned} device${sum.unassigned === 1 ? '' : 's'} not in any area` })]) : null,
          h('div', { class: 'ed-field' }, [h('span', { text: 'Name' }), name]),
          preview].filter(Boolean));
        const sync = () => {
          const demo = style.value === 'demo';
          demoOpts.hidden = !demo;
          const o = body.querySelector('[data-k=gen-other-row]'); if (o) o.hidden = demo;
          const g = plan();
          if (!g) return;
          if (g.error) { preview.replaceChildren(h('p', { class: 'ef-err', text: g.error })); onState(false); return; }
          onState(true);
          if (!demo) { preview.replaceChildren(h('p', { class: 'ed-hint', text: `Preview: ${g.pages} pages, ${g.widgets} widgets.` })); return; }
          const S = g.summary;
          preview.replaceChildren(h('p', { class: 'ed-sub', text: 'What will be created' }),
            h('p', { class: 'ed-hint', text: `${S.pages.length} pages — ${S.pages.map((p) => `${p.name} (${p.widgets})`).join(' · ')}; ${S.rooms.length} room${S.rooms.length === 1 ? '' : 's'} as cards, each opening a popup with tabs; ${S.widgets} widgets in all.${S.excluded ? ` ${S.excluded} device${S.excluded === 1 ? '' : 's'} left out.` : ''}` }),
            h('ul', { class: 'ed-gen__rooms' }, S.rooms.slice(0, 40).map((r) => h('li', { text: `${r.name}: ${Object.entries(r.counts).filter(([, n]) => n).map(([k, n]) => `${({ active: 'Active', lights: 'Lights', heating: 'Heating', media: 'Media', security: 'Security', sensors: 'Sensors' })[k]} ${n}`).join(' · ') || 'empty tabs (they say so)'}` }))));
        };
        body.addEventListener('change', sync);
        sync();
      };
      /** the generation itself (also the preview): nothing is created here */
      function plan() {
        if (!found) return null;
        const areas = [...body.querySelectorAll('[data-k=gen-area]:checked')].map((c) => c.value);
        const exclude = [...body.querySelectorAll('[data-k=gen-dev]')].filter((c) => !c.checked).map((c) => c.value);
        if (val('gen-style') === 'simple') {
          const other = !!val('gen-other');
          if (!areas.length && !other) return { error: 'Choose at least one room.' };
          try { const g = global.IniqGenerate.dashboard(found, R, { areas, other }); return { ...g, simple: true }; } catch (err) { return { error: err.message }; }
        }
        if (!areas.length) return { error: 'Choose at least one room.' };
        try {
          const g = global.IniqGenerateDemo.build(found, R, { areas, exclude, template, theme: val('gen-look'), photos: !!val('gen-photos'), notify: !!val('gen-notify'), radial: !!val('gen-radial'), unassigned: val('gen-unassigned'),
            pages: { lights: !!val('gen-p-lights'), climate: !!val('gen-p-climate'), energy: !!val('gen-p-energy'), security: !!val('gen-p-security') } });
          return { ...g, pages: g.summary.pages.length, widgets: g.summary.widgets };
        } catch (err) { return { error: err.message }; }
      }
      /** the dashboard to create, validated as a whole (the generator conforms every widget; what still cannot be made valid is refused) */
      function build() {
        const g = plan();
        if (!g || g.error) return { error: g ? g.error : 'Home Assistant has not been read yet.' };
        if (sim) g.dashboard.app.simulated = true;
        const v = M.validate(g.dashboard, R);
        if (!v.ok) return { error: `The dashboard could not be generated (nothing was created): ${v.errors.slice(0, 2).join('; ')}` };
        if (JSON.stringify(v.model).length > 1900 * 1024) return { error: 'That is too much for one dashboard — choose fewer rooms (nothing was created).' };
        return { model: v.model, g, name: name.value.trim() || 'My home', pages: g.pages, widgets: g.widgets };
      }
      return { body, name, load, plan, build, simulated: () => sim };
    }
    function openGenerate() {
      const DS = opts.dashboards;
      const msg = h('p', { class: 'ed-dash__msg', role: 'status', 'aria-live': 'polite', 'data-k': 'gen-msg' });
      const go = h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'gen-create', disabled: true }, [svg('plus'), h('span', { text: 'Create the dashboard' })]);
      const F = genForm((ok) => { go.disabled = !ok; });
      go.addEventListener('click', async () => {
        const b = F.build();
        if (b.error) { msg.textContent = b.error; return; }
        go.disabled = true; msg.textContent = 'Creating…';
        const r = await DS.create(b.name, b.model, { unique: true });
        if (!r.ok) { go.disabled = false; msg.textContent = DS.message(r); return; }
        msg.textContent = `Created “${r.entry.name}” — ${b.pages} pages, ${b.widgets} widgets. Opening it…`;
        DS.open(r.entry.id, true);
      });
      dialog('ed-dlg--gen', 'Generate a dashboard from Home Assistant', [F.body, msg], [go]);
      F.load(false);
    }
    /* ================================================================== FIRST-RUN WIZARD, steps 2–4 (step 1, the account, is login.php)
       Opened only while the server says a browser setup is unfinished (meta iniqdash-setup; server/Setup.php). 2 · connect Home
       Assistant (the same test / save as Settings; or the demo instead) · 3 · the generator's own form (genForm) · 4 · summary, then
       "Finish & create dashboard": ONE server request creates it, makes it the default and marks setup done — or nothing remains. */
    function openSetupWizard() {
      const root = h('div', { class: 'ed-setup', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ed-setup-t', 'data-k': 'setup' });
      const bar = h('p', { class: 'ed-setup__steps', 'aria-hidden': 'true' }, [1, 2, 3, 4].map((n) => h('span', { 'data-n': String(n) })));
      const title = h('h2', { id: 'ed-setup-t', class: 'ed-setup__title' });
      const lead = h('p', { class: 'ed-setup__lead' });
      const body = h('div', { class: 'ed-setup__body' });
      const msg = h('p', { class: 'ed-setup__msg', role: 'status', 'aria-live': 'polite', 'data-k': 'setup-msg' });
      const foot = h('div', { class: 'ed-setup__foot' });
      root.append(h('div', { class: 'ed-setup__card' }, [bar, title, lead, body, msg, foot]));
      document.body.append(root);
      const btn = (k, text, primary, onclick) => h('button', { type: 'button', class: `ed-btn${primary ? ' ed-btn--primary' : ''}`, 'data-k': k, onclick }, h('span', { text }));
      const post = async (body) => {
        try {
          const r = await fetch('api/setup.php', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="iniqdash-csrf"]')?.content || '' }, body: JSON.stringify(body) });
          if (r.status === 401 || r.status === 403) return { ok: false, error: 'signed_out' };
          return await r.json().catch(() => ({ ok: false, error: 'network' }));
        } catch (e) { return { ok: false, error: 'network' }; }
      };
      const SETUP_MSG = { not_pending: 'Setup was already completed.', invalid: 'The dashboard did not pass the server\'s check. Nothing was created — go back and try fewer rooms.', name_invalid: 'Choose another name.',
        too_large: 'That dashboard is too large. Go back and choose fewer rooms.', write_failed: 'The server could not save it. Nothing was created; try again.', storage_unavailable: 'The server has no storage for dashboards.', signed_out: 'Your session has expired — sign in again.', network: 'The IniqDash server did not answer. Try again.' };
      const go = (id) => { location.href = `./${id ? `?d=${encodeURIComponent(id)}` : ''}`; };
      async function demo() {
        msg.textContent = 'Installing the demo…';
        const r = await post({ action: 'demo' });
        if (!r.ok) { msg.textContent = SETUP_MSG[r.error] || 'The demo could not be installed.'; return; }
        go(r.entry.id);
      }
      let F = null, built = null, haOk = false;
      function step(n) {
        bar.dataset.at = String(n); msg.textContent = '';
        bar.querySelectorAll('span').forEach((x) => { x.dataset.on = String(Number(x.dataset.n) <= n); });
        if (n === 2) {
          title.textContent = 'Connect Home Assistant';
          lead.textContent = 'Your Home Assistant address and a long-lived access token (Home Assistant → your profile → Security → Long-lived access tokens). The token is kept on this server only — never in the browser, never shown again.';
          const url = h('input', { type: 'url', inputmode: 'url', spellcheck: 'false', autocomplete: 'off', placeholder: 'http://homeassistant.local:8123', 'data-k': 'setup-url', maxlength: '300' });
          const token = h('input', { type: 'password', spellcheck: 'false', autocomplete: 'new-password', 'data-k': 'setup-token', maxlength: '2048' });
          const result = h('p', { class: 'ed-setup__result', role: 'status', 'aria-live': 'polite', 'data-k': 'setup-result' });
          const next = btn('setup-next', 'Continue', true, async () => {
            next.disabled = true; msg.textContent = 'Saving the connection…';
            const r = await haSettingsCall('POST', { action: 'save', url: url.value.trim(), token: token.value.trim() });
            if (!r.ok) { next.disabled = false; msg.textContent = HA_MSG[r.error] || 'The connection could not be saved.'; return; }
            token.value = ''; step(3);
          });
          next.disabled = !haOk;
          const test = btn('setup-test', 'Test connection', false, async () => {
            test.disabled = true; result.textContent = 'Testing…'; result.dataset.state = '';
            const r = await haSettingsCall('POST', { action: 'test', url: url.value.trim(), token: token.value.trim() });
            test.disabled = false; haOk = !!r.ok; next.disabled = !haOk;
            result.dataset.state = r.ok ? 'ok' : 'error';
            result.textContent = r.ok ? `Connected${r.version ? ` to Home Assistant ${r.version}` : ''}${Number.isFinite(r.entities) ? ` — ${r.entities} entities` : ''}.` : (HA_MSG[r.error] || 'The connection failed.');
          });
          [url, token].forEach((x) => x.addEventListener('input', () => { haOk = false; next.disabled = true; result.textContent = ''; }));
          body.replaceChildren(h('label', { class: 'ed-field' }, [h('span', { text: 'Home Assistant address' }), url]), h('label', { class: 'ed-field' }, [h('span', { text: 'Long-lived access token' }), token]), result,
            h('div', { class: 'ed-setup__alt' }, [h('span', { text: 'No Home Assistant yet?' }), btn('setup-demo', 'Explore the demo instead', false, demo)]));
          foot.replaceChildren(test, next);
          url.focus();
        }
        if (n === 3) {
          title.textContent = 'Choose your dashboard';
          lead.textContent = 'IniqDash reads your Home Assistant areas and builds Home, Lights, Climate, Rooms, Energy and Security pages — rooms as photo cards that open a popup with tabs. Everything stays editable afterwards.';
          const next = btn('setup-review', 'Continue', true, () => { built = F.build(); if (built.error) { msg.textContent = built.error; return; } step(4); });
          next.disabled = true;
          if (!F) { F = genForm((ok) => { next.disabled = !ok; }); F.load(false); } else { next.disabled = !!F.build().error; }
          F.onState = null;
          body.replaceChildren(F.body);
          foot.replaceChildren(btn('setup-back', 'Back', false, () => step(2)), next);
        }
        if (n === 4) {
          title.textContent = 'Ready to create';
          lead.textContent = 'Check the summary, then create your dashboard. It becomes the dashboard this installation opens with.';
          const S = built.g.summary;
          body.replaceChildren(h('dl', { class: 'ed-setup__sum', 'data-k': 'setup-summary' }, [
            h('dt', { text: 'Name' }), h('dd', { text: built.name }),
            h('dt', { text: 'Pages' }), h('dd', { text: S.pages.map((p) => p.name).join(' · ') }),
            h('dt', { text: 'Rooms' }), h('dd', { text: `${S.rooms.length} — ${S.rooms.slice(0, 12).map((r) => r.name).join(', ')}${S.rooms.length > 12 ? '…' : ''}` }),
            h('dt', { text: 'Widgets' }), h('dd', { text: String(S.widgets) }),
          ]));
          const fin = btn('setup-finish', 'Finish & create dashboard', true, async () => {
            fin.disabled = true; msg.textContent = 'Creating your dashboard…';
            const r = await post({ action: 'finish', name: built.name, dashboard: built.model });
            if (!r.ok) { fin.disabled = false; msg.textContent = SETUP_MSG[r.error] || 'The dashboard could not be created. Nothing was saved — try again.'; return; }
            msg.textContent = 'Done. Opening your dashboard…';
            go(r.entry.id);
          });
          foot.replaceChildren(btn('setup-back', 'Back', false, () => step(3)), fin);
        }
      }
      step(2);
    }
    /** ADD A PAGE FOR AN AREA (Pages dialog): one Home Assistant area as a new page of THIS dashboard (one undo step) */
    async function addAreaPage(sel, note) {
      const sim = app.app.simulated === true;
      const d = await discover(sim);
      if (!d.ok || d.connected === false || d.configured === false) { note.textContent = d.configured === false ? 'Home Assistant is not connected.' : 'Home Assistant could not be reached.'; return; }
      const sum = global.IniqGenerate.summary(d).areas.filter((a) => a.count);
      if (!sel.value) {
        sel.replaceChildren(h('option', { value: '', text: sum.length ? 'Choose an area…' : 'No area with devices' }), ...sum.map((a) => h('option', { value: a.id, text: `${a.name} (${a.count})` })));
        sel.hidden = false; sel.focus(); note.textContent = ''; return;
      }
      const ids = new Set(app.pages.flatMap((pg) => pg.items.map((i) => i.id)).concat((app.popups || []).flatMap((pp) => pp.items.map((i) => i.id))));
      let res;
      try { res = global.IniqGenerate.areaPage(d, sel.value, R, ids, new Set(app.pages.map((pg) => pg.id))); } catch (err) { note.textContent = err.message; return; }
      if (!res) return;
      // the page joins THIS dashboard only when the dashboard stays valid with it (nothing half-added)
      const trial = structuredClone(app); trial.pages.push(res.page);
      const tv = M.validate(trial, R);
      if (!tv.ok) { note.textContent = `The page could not be added: ${tv.errors[0]}`; return; }
      mutate(`add the page ${res.page.name}`, () => { app.pages.push(res.page); });
      nav.go(res.page.id, 'editor'); render();
      note.textContent = `Added the page “${res.page.name}” (${res.page.items.length} widgets)`;
      sel.value = ''; sel.hidden = true;
    }
    function openDashboards() {
      setMore(false);
      const DS = opts.dashboards;
      const cur = () => (store.current ? store.current() : null);
      const list = h('ul', { class: 'ed-dash__list', 'aria-label': 'Dashboards on this server' });
      const msg = h('p', { class: 'ed-dash__msg', role: 'status', 'aria-live': 'polite' });
      const tell = (t, bad) => { msg.textContent = t || ''; msg.dataset.tone = bad ? 'bad' : ''; };
      const newName = h('input', { type: 'text', maxlength: '60', 'data-k': 'dash-new-name', placeholder: 'Name of the new dashboard', 'aria-label': 'Name of the new dashboard' });
      const leave = (fn, btn, what) => (isDirty() ? confirmStep(btn, `Discard unsaved changes and ${what}?`, fn) : fn());
      const createBtn = h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'dash-create', onclick: async (e) => {
        const name = newName.value.trim();
        if (!name) { tell('Enter a name for the new dashboard.', true); newName.focus(); return; }
        const btn = e.currentTarget;
        leave(async () => {
          const r = await DS.create(name, DS.empty());
          if (!r.ok) { tell(DS.message(r), true); return; }
          tell(`Created “${r.entry.name}” — opening it…`);
          DS.open(r.entry.id, true);
        }, btn, 'create it');
      } }, [svg('plus'), h('span', { text: 'New dashboard' })]);
      const when = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };
      async function fill(focusId) {
        const r = await DS.list();
        if (!r.ok) { list.replaceChildren(); tell(DS.message(r), true); return; }
        const c = cur();
        if (!r.dashboards.length) list.replaceChildren(h('li', { class: 'ed-dash__empty', text: 'No dashboards saved on this server yet. Create one above, or Save the dashboard you are editing.' }));
        else list.replaceChildren(...r.dashboards.map((x) => row(x, c && c.id === x.id)));
        if (focusId) list.querySelector(`[data-id="${focusId}"] .ed-dash__name`)?.focus();
      }
      function row(x, isCur) {
        const li = h('li', { class: `ed-dash__row${isCur ? ' is-current' : ''}`, 'data-id': x.id });
        const name = h('b', { class: 'ed-dash__name', tabindex: '-1', text: x.name });           // text, never markup
        const meta = h('small', { class: 'ed-dash__meta', text: `${isCur ? 'Open now · ' : ''}saved ${when(x.updated)}` });
        const B = (k, label, fn, cls = 'ed-btn') => h('button', { type: 'button', class: cls, 'data-k': `dash-${k}`, onclick: fn }, h('span', { text: label }));
        const actions = h('div', { class: 'ed-dash__btns' }, [
          ...(isCur ? [] : [B('open', 'Open', (e) => leave(() => DS.open(x.id), e.currentTarget, 'open this dashboard'), 'ed-btn ed-btn--primary')]),
          B('rename', 'Rename', () => renaming()),
          B('duplicate', 'Duplicate', async () => {
            const r = await DS.duplicate(x.id);
            if (!r.ok) { tell(DS.message(r), true); return; }
            tell(`Duplicated as “${r.entry.name}”.`); fill(r.entry.id);
          }),
          B('delete', 'Delete', () => deleting(), 'ed-btn ed-btn--danger'),
        ]);
        li.append(h('div', { class: 'ed-dash__id' }, [name, meta]), actions);
        function renaming() {
          const inp = h('input', { type: 'text', maxlength: '60', value: x.name, 'data-k': 'dash-rename-input', 'aria-label': `New name for ${x.name}` });
          const ok = async () => {
            const r = await DS.rename(x.id, inp.value);
            if (!r.ok) { tell(DS.message(r), true); inp.focus(); return; }
            tell(`Renamed to “${r.entry.name}”.`);
            if (isCur) { store.setName && store.setName(r.entry.name); if (opts.onRenamed) opts.onRenamed(r.entry); }
            fill(x.id);
          };
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fill(x.id); } });
          actions.replaceChildren(inp, B('rename-ok', 'Save name', ok, 'ed-btn ed-btn--primary'), B('rename-cancel', 'Cancel', () => fill(x.id)));
          inp.focus(); inp.select();
        }
        function deleting() {
          actions.replaceChildren(
            h('p', { class: 'ed-dash__confirm', role: 'alert' }, [`Delete “`, h('b', { text: x.name }), `”? The saved dashboard is removed from this server for every device.${isCur ? ' It is the one open now.' : ''} Uploaded images, widgets and the Home Assistant connection are kept.`]),
            B('delete-ok', `Delete “${x.name.length > 24 ? `${x.name.slice(0, 23)}…` : x.name}”`, async () => {
              const r = await DS.remove(x.id);
              if (!r.ok) { tell(DS.message(r), true); return; }
              if (isCur) { tell(`Deleted “${x.name}” — opening another dashboard…`); DS.afterDeleteCurrent(); return; }
              tell(`Deleted “${x.name}”.`); fill();
            }, 'ed-btn ed-btn--danger'),
            B('delete-cancel', 'Cancel', () => fill(x.id)),
          );
          actions.querySelector('[data-k=dash-delete-cancel]').focus();
        }
        return li;
      }
      const c0 = cur();
      dialog('ed-dlg--dash', 'Dashboards', [
        h('p', { class: 'ed-hint', text: c0 ? 'Saved on this IniqDash server: every device signed in here sees the same dashboards. Pages are inside a dashboard (Pages).' : 'The dashboard you are editing is not saved on the server yet — Save stores it here. Every device signed in here sees the same dashboards.' }),
        h('div', { class: 'ed-dash__new' }, [newName, createBtn]),
        // the MAISON DEMO (assets/demo/maison-demo.json, data fetched on demand): five pages bound to the SIMULATED home — added as a NEW dashboard
        // (a unique name; nothing existing is replaced), then opened. It never touches Home Assistant (app.simulated).
        // the INIQDASH DEMO (assets/demo/iniqdash-demo.json): the official demonstration dashboard — Home · Lights · Energy · Rooms · Security,
        // its popups, notifications and radial menu — of the same SIMULATED home; added as a NEW dashboard, never replacing one
        ...(DS ? [h('div', { class: 'ed-dash__demo' }, [
          h('p', { class: 'ed-hint', text: 'Try IniqDash without Home Assistant: the INIQDASH demo is a six-page dashboard (Home, Lights, Climate, Rooms, Energy, Security) of a simulated home. Every value is simulated and nothing reaches a real device. It is added as a new dashboard — nothing is replaced; delete it like any dashboard.' }),
          h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'dash-add-iniqdash-demo', onclick: (e) => leave(async () => {
            const model = window.IniqDemoPackage ? await window.IniqDemoPackage.load('assets/demo/iniqdash-demo') : null;
            if (!model) { tell('The INIQDASH demo could not be loaded from this server.', true); return; }
            const r = await DS.create('INIQDASH demo', model, { unique: true });
            if (!r.ok) { tell(DS.message(r), true); return; }
            tell(`Added “${r.entry.name}” — opening it…`);
            DS.open(r.entry.id, true);
          }, e.currentTarget, 'add the INIQDASH demo') }, [svg('plus'), h('span', { text: 'Add the INIQDASH demo (simulated home)' })])])] : []),
        // GENERATE from Home Assistant's areas (components/editor/generate.js): a NEW dashboard, never replacing one
        ...(DS && global.IniqGenerate ? [h('div', { class: 'ed-dash__demo' }, [
          h('p', { class: 'ed-hint', text: 'Start from your home: IniqDash reads your Home Assistant areas and builds a new dashboard — a page per room with its lights, climate, covers, media and sensors, and a Home page. It is an ordinary dashboard to change as you like.' }),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'dash-generate', onclick: (e) => leave(() => { document.querySelector('dialog.ed-dlg--dash')?.close(); openGenerate(); }, e.currentTarget, 'generate a dashboard') }, [svg('plus'), h('span', { text: 'Generate from Home Assistant…' })])])] : []),
        msg, list,
      ]);
      newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); createBtn.click(); } });
      fill();
    }
    /** dashboards saved in THIS browser before server storage: offer to copy each to the server once (never automatic,
        never over an existing server dashboard; the browser copy itself is left as it was) */
    function offerLegacy() {
      const L = (opts.legacy || []).filter(Boolean);
      if (!L.length || !opts.dashboards) return;
      const x = L[0];
      const bar = h('div', { class: 'ed-draft ed-legacy', role: 'region', 'aria-label': 'Dashboard saved in this browser' }, [
        h('p', {}, [h('b', { text: 'A dashboard saved in this browser was found' }), ` (“${x.label}”, saved before dashboards were stored on the server). Copy it to the server to use it on every device — the copy in this browser is kept.`]),
        h('div', { class: 'ed-draft__btns' }, [
          h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'legacy-copy', onclick: async (e) => {
            e.currentTarget.disabled = true;
            const r = await opts.dashboards.create(x.label, x.model, { unique: true });
            if (!r.ok) { e.currentTarget.disabled = false; say(`Not copied: ${opts.dashboards.message(r)}`, 'warn'); return; }
            opts.dashboards.markLegacy(x.key, r.entry.id);
            say(`Copied to the server as “${r.entry.name}” — opening it…`);
            opts.dashboards.open(r.entry.id, true);
          } }, h('span', { text: 'Copy it to the server' })),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'legacy-later', onclick: () => { opts.dashboards.markLegacy(x.key, 'later'); bar.remove(); } }, h('span', { text: 'Not now' })),
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'legacy-ignore', onclick: () => { opts.dashboards.markLegacy(x.key, 'ignored'); bar.remove(); say('It will not be offered again (it stays in this browser)'); } }, h('span', { text: 'Don’t ask again' })),
        ]),
      ]);
      draftBar.after(bar);
    }

    /* ================================================================== recovery draft */
    function offerDraft() {
      if (!store.loadDraft) return;
      const text = store.loadDraft();
      if (!text) return;
      let data; try { data = JSON.parse(text); } catch (e) { store.clearDraft(); return; }
      const r = data && M.validate(data.model, R);
      if (!r || !r.ok || M.serialize(r.model) === savedText) { store.clearDraft(); return; }
      const when = data.savedAt ? new Date(data.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'an earlier session';
      draftBar.replaceChildren(
        h('p', {}, [h('b', { text: 'Unsaved changes found' }), ` from ${when} (recovery draft — your saved configuration is unchanged).`]),
        h('div', { class: 'ed-draft__btns' }, [
          h('button', { type: 'button', class: 'ed-btn ed-btn--primary', onclick: () => { replaceModel(r.model, 'Restored the unsaved changes (not saved yet)'); } }, h('span', { text: 'Restore unsaved changes' })),
          h('button', { type: 'button', class: 'ed-btn', onclick: () => { store.clearDraft(); draftBar.hidden = true; say('Draft discarded'); } }, h('span', { text: 'Discard draft' })),
        ]),
      );
      draftBar.hidden = false;
    }

    /* ================================================================== start */
    new ResizeObserver(() => layout()).observe(stage);
    new ResizeObserver(() => root.style.setProperty('--ed-bar-h', `${bar.offsetHeight}px`)).observe(bar);
    new ResizeObserver(() => { sizeStage(); drawSelection(); }).observe(frame);
    /* ---- runtime: screen layer, popup host, notifications ---- */
    screen = A.createScreen({ box: () => {
      const r = frame.getBoundingClientRect();
      // the popup layer covers exactly the screen (w × h, scaled)
      return { left: r.left, top: r.top, width: r.width, height: r.height, scale };
    } });
    /* NOTIFICATIONS — their own screen layer with an EXPLICIT coordinate system (docs/NOTIFICATIONS.md · noteTarget()):
         'device'  a SIMULATED DEVICE (the Responsive Preview set to a device / a size; full-screen test of that size): the device's
                   logical screen, scaled with it — only its part inside the browser window (MaisonApp.createScreen --scr-vis-*)
         'window'  everything else — the dashboard fitted to the editor, "Current browser window", full screen of this window: the
                   VISIBLE BROWSER VIEWPORT, 1 : 1. "Top right" is the top right of what the user sees, never of the editor's canvas. */
    noteScreen = A.createScreen({ box: () => {
      if (noteTarget() === 'device') { const r = frame.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, scale }; }
      const de = document.documentElement;
      return { left: 0, top: 0, width: de.clientWidth || innerWidth, height: de.clientHeight || innerHeight, scale: 1 };
    } });
    noteScreen.el.classList.add('mscr--notes');
    noteScreen.layer.dataset.target = noteTarget();
    window.addEventListener('scroll', () => { screen.update(); noteScreen.update(); }, { passive: true });
    applyAppTheme();
    // While a press / drag that started inside the screen is in progress (and briefly after the drop,
    // while the dashboard and inspector re-render), the EDITOR PAGE must not move: the browser would
    // otherwise scroll it to "reveal" the focused widget, or clamp it while the inspector is rebuilt.
    // The screen is its own scroller; the page stays where the user put it.
    let pageLock = null, lockT = 0;
    const holdPage = () => { if (pageLock && (scrollX !== pageLock[0] || scrollY !== pageLock[1])) window.scrollTo(pageLock[0], pageLock[1]); };
    frame.addEventListener('pointerdown', () => { clearTimeout(lockT); pageLock = [scrollX, scrollY]; }, true);
    const unlock = () => { if (!pageLock) return; clearTimeout(lockT); lockT = setTimeout(() => { pageLock = null; }, 500); };
    window.addEventListener('pointerup', unlock, true);
    window.addEventListener('pointercancel', unlock, true);
    frame.addEventListener('focusin', holdPage);
    window.addEventListener('scroll', holdPage, { passive: true });
    // a device screen scrolls inside itself: the overlays follow its content
    frame.addEventListener('scroll', () => { drawSelection(); clipLayer(); if (screen) screen.update(); if (noteScreen) noteScreen.update(); }, { passive: true });
    window.addEventListener('resize', () => layout());
    // Current screen follows the browser viewport when the window is resized (not while testing full screen)
    let scT = 0;
    window.addEventListener('resize', () => {
      clearTimeout(scT);
      scT = setTimeout(() => {
        if (fs || pv.mode !== 'exact' || !pv.screen) return refreshPreviewBar(pv.mode === 'exact' ? pv.w : parseFloat(frame.style.width), pv.mode === 'exact' ? pv.h : parseFloat(frame.style.height));
        const sc = screenSize(); if (sc.w !== pv.w || sc.h !== pv.h) setViewport(sc.w, sc.h, 'Current browser window', { screen: true });
      }, 150);
    });
    popupHost = global.MaisonPopup.createHost({ layer: screen.layer, build: buildPopupContent, key: () => frameBp, viewport: () => screen.size(), icons: R.icons(),
      run: (a) => actions.run(a, { source: 'popup' }) });                 // the header Menu button: the shared dispatcher
    // the system Entity Details host: the same popup infrastructure (overlay, Escape, outside click, mobile sheet), its own
    // instance so a user popup underneath is never replaced; content from the shared builder (components/ha/details.js)
    detailsHost = global.MaisonPopup.createHost({ layer: screen.layer, build: (def) => global.IniqHADetails.build(def.payload || {}), key: () => frameBp, viewport: () => screen.size(), icons: R.icons() });
    notes = global.MaisonNotify.createCenter({ layer: noteScreen.layer, icons: R.icons() });
    events = global.MaisonNotify.createEvents();
    rulesEngine = global.MaisonNotify.createRules({
      bus: events, center: notes,
      rules: () => (app.notifications || {}).rules || [],
      templates: () => ((app.notifications || {}).templates || []).map((t) => ({ ...t, config: R.fullConfig('notification', t.config) })),
    });
    // the dashboard's NOTIFICATION INBOX (widgets/default/inbox — the Notification centre widget reads it): every notification the
    // dashboard SHOWS is recorded there (a template tested from the editor is not)
    {
      const show0 = notes.show.bind(notes);
      notes.show = (config, meta = {}) => {
        const nid = show0(config, meta);
        if (meta.source !== 'test' && global.MaisonInbox && config) {
          const tone = ['info', 'success', 'warning', 'danger'].includes(config.tone) ? config.tone : 'info';
          global.MaisonInbox.current().add({ title: config.title, message: config.message, icon: /^mdi:[a-z0-9-]{1,64}$/.test(config.icon || '') ? config.icon : 'mdi:bell-outline', tone,
            category: config.category || '' });
        }
        return nid;
      };
    }
    /* HOME ASSISTANT STATE EVENTS for notification rules: a rule whose event is "ha.<domain>.<object id>.<state>" fires when that entity
       CHANGES to that state (never for the state it already has when the dashboard opens). Only the entities the rules name are followed. */
    let haWatch = new Map();                       // entity → off
    function syncHaEvents() {
      const HA = global.IniqHA;
      const want = new Set();
      if (HA && HA.enabled && HA.enabled()) ((app.notifications || {}).rules || []).forEach((r) => { const m = r && r.enabled !== false && typeof r.event === 'string' && /^ha\.([a-z_]+\.[a-z0-9_]+)\.[a-z0-9_]+$/.exec(r.event); if (m) want.add(m[1]); });
      haWatch.forEach((off, e) => { if (!want.has(e)) { off(); haWatch.delete(e); } });
      want.forEach((e) => {
        if (haWatch.has(e)) return;
        let prev;
        haWatch.set(e, HA.subscribe(e, (s) => {
          const st = s && typeof s.state === 'string' ? s.state.toLowerCase().replace(/[^a-z0-9_]/g, '_') : null;
          if (st && prev !== undefined && st !== prev) events.emit(`ha.${e}.${st}`, { source: 'ha', entity: e, state: st });
          if (st) prev = st;
        }));
      });
    }
    // an open modal dialog sits in the browser's top layer: the screen layer follows it there, so a
    // popup preview or a test notification opened from a dialog is visible above it
    new MutationObserver(() => {
      const dl = [...root.querySelectorAll('dialog[open]')].pop();
      const host = dl || document.body;
      if (screen.el.parentElement !== host) host.append(screen.el);
      // notifications follow the topmost EDITOR dialog (Notifications, a template, a widget's configuration) — not an item editor
      // inside one, where nothing shows a notification
      const nl = [...root.querySelectorAll('dialog[open]:not(.ef-sub)')].pop() || document.body;
      if (noteScreen.el.parentElement !== nl) nl.append(noteScreen.el);
    }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });

    applyAids();
    setBreakpoint(frameBp, true);          // (an exact preview device remembered from last time stays)
    render();
    status.dataset.clean = opts.status || 'No unsaved changes';
    refreshChrome();
    offerDraft();
    offerLegacy();
    window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

    /* widget requests (e.g. a Radial Action Menu segment) → the application's action dispatcher.
       A preview inside a dialog never runs anything. While editing, widgets are inert anyway. */
    document.addEventListener('maison:action', (e) => {
      const d = e.detail || {};
      const t = e.target;
      const onScreen = screen && screen.el.contains(t);
      const inCorner = !!(cornerLayer && cornerLayer.contains(t));      // a radial pinned to a screen corner (its own fixed layer on the body)
      if (!root.contains(t) && !onScreen && !inCorner) return;          // not ours
      const respond = (ok) => { if (typeof d.respond === 'function') d.respond(ok); };
      if (t.closest && t.closest('dialog') && !onScreen) { say(`Preview: "${d.action?.label || d.action?.type}" would run here`); respond(true); return; }
      if (editing && !onScreen) return;
      respond(actions.run(d.action, { source: d.meta?.source, active: d.active, widget: d.widget }) !== false);
    });
    // the application opens VIEWING its dashboard (the editor is one Edit away)
    if (viewer && !editing) enterView();

    liveSync.start();
    if (onServer && document.querySelector('meta[name="iniqdash-setup"][content="pending"]')) openSetupWizard();
    return {
      /** the application's viewing mode: whether it is shown now; the Edit control's appearance ('corner' | 'always') */
      viewing: () => !!(fs && fs.kind === 'view'),
      setEditButton: (m) => { editButton = m === 'always' ? 'always' : 'corner'; if (access) access.setMode(editButton); },
      editAccess: () => access,
      /** Save / Done exactly as the toolbar buttons (promises of true / false) */
      save: () => save(), done: () => done(),
      /** the server dashboard being edited ({ id, name, revision }) — null for an unsaved sample or browser storage */
      dashboard: () => (store.current ? store.current() : null),
      /** the whole application configuration (version 2) */
      getModel: () => structuredClone(app),
      /** the page currently shown / edited */
      getPage: () => structuredClone(model),
      setModel: (m) => { const r = M.validate(m, R); if (!r.ok) return r; replaceModel(r.model); return r; },
      /** the shared page switch (same function the dock and radial menus use) */
      go: (id) => nav.go(id, 'api'),
      /** the shared request dispatcher (what Action widgets and Radial segments call) */
      run: (action) => actions.run(action, { source: 'api' }),
      popups: () => ({ current: popupHost.current(), log: popupHost.log.slice() }),
      openPopup: (id) => openPopupById(id), closePopup: () => popupHost.close('api'),
      /** Entity Details (system surface): what is open, and its open / close log */
      details: () => ({ current: detailsHost.current(), log: detailsHost.log.slice() }), openDetails: (entity) => openDetails({ entity }), closeDetails,
      designPopup, designPage, design: () => ({ ...design }), openStudio,
      fire: (id) => fireEvent(id), fireReport: (id) => fireReport(id), openThemes: () => openThemes(), importTheme: (text) => importTheme(text), themeStudio: () => themeStudio(),
      /** where notifications are placed now: 'window' (the visible browser window) or 'device' (the simulated device screen) */
      notificationTarget: () => noteTarget(),
      notifications: () => ({ active: notes.active(), queued: notes.queued(), log: notes.log.slice(), rules: rulesEngine.log.slice() }),
      notify: (config) => notes.show(R.fullConfig('notification', config), { source: 'api' }),
      clearNotifications: () => notes.clear(),
      navigation: () => ({ current: nav.current(), log: nav.log.slice() }),
      syncNow: () => liveSync.check(),
      wall: () => wall,
      setEditing, setBreakpoint: (k) => setBreakpoint(k), select,
      /** fit the page on the screen while viewing (?fit=screen): no scrolling, scaled down when needed */
      setFit: (on) => { fitScreen = !!on; applyFit(); setTimeout(applyFit, 600); },
      /** preview studio (editor-only; never changes the dashboard) */
      setViewport: (w, hh, name) => setViewport(w, hh, name), setZoom, rotate, setMulti, toggleScrub,
      enterFullScreen: (k) => enterFullScreen(k === 'screen' ? 'screen' : 'preview'), exitFullScreen: () => exitFullScreen(), fullScreen: () => (fs ? { kind: fs.kind } : null),
      preview: () => ({ ...pv, breakpoint: frameBp, scale, width: parseFloat(frame.style.width), presets: userPresets.map((d) => ({ ...d })), multi: multiOn, minis: minis.map((d) => ({ ...d })) }), reveal, undo, redo, toggleOverlay,
      isDirty, history: () => history.size(),
      /** Save keeps editing; Done saves then leaves edit mode (both false when the save failed) */
      save: () => save(), done: () => done(),
      /** preview the current browser viewport (Current screen) */
      currentScreen: () => pickDevice('screen'), screenSize,
      breakpointOf: (id) => (id ? keyOf(recs.get(id).gridRoot) : keyOf(topRoot)),
    };
  }

  /* small UI icons for the editor chrome (not widget artwork) */
  function svg(name) {
    const P = {
      pen: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      close: '<path d="M7 7l10 10M17 7 7 17"/>',
      save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
      desktop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
      tablet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>',
      mobile: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
      move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
      resize: '<path d="M20 11v9h-9M20 20 12 12"/>',
      left: '<path d="m15 6-6 6 6 6"/>', right: '<path d="m9 6 6 6-6 6"/>', up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
      undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
      redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
      grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
      dots: '<g fill="currentColor" stroke="none"><circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/></g>',
      magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 8h4M14 8h4M10 4v8a2 2 0 0 0 4 0V4"/>',
      cross: '<path d="M12 2v6M12 16v6M2 12h6M16 12h6"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
      trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
      out: '<path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
      pages: '<rect x="7" y="3" width="13" height="15" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h10"/>',
      copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    };
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = P[name] || '';   // static, editor-owned markup only
    return s;
  }

  global.MaisonEditor = { create };
})(window);
