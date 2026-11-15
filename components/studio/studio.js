/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Widget Studio — PROOF OF CONCEPT (docs/WIDGET-STUDIO-POC.md). A HOST: it composes a widget from the shared component foundation and
   knows no component itself.
     COMPONENTS  the palette: IniqComponents.composable() — every registered component a host can place (registry-driven)
     CANVAS      the INSIDE of one widget: a fixed logical design size; drawn by the widget RUNTIME itself (MaisonStudioWidget.create —
                 the same code the dashboard uses), with an editor-only selection layer on top (never part of the widget)
     PROPERTIES  the component's BOX (x · y · w · h, logical px — Studio's own) and its configuration: the SHARED editor builder of that
                 component (IniqComponents.editor(type)(compose.editor)) + its preview data fields, in the shared form (MaisonForm)
     HOME ASSISTANT  each component's own binding (IniqBinding.fields(compose) — built from what the component declares it can consume
                 and report; Studio names no component and no domain)
     WIDGET      the definition's LIBRARY metadata (name, collection — chosen or created here —, category, description, gallery icon) — shown while no
                 component is selected
   The model it edits is a MY WIDGETS DEFINITION (components/studio/library.js, server/StudioWidgets.php): { meta, canvas, components:
   [{ id, type, x, y, w, h, config, data, binding? }] } — saved server-side as a reusable definition (its stable id is the server's), then
   added to any dashboard from the gallery (in its collection and category). An older Studio widget saved as a dashboard item (the proof of
   concept) can still be opened: saving it makes it a definition and that item an instance of it (opts.adopt).

   IniqStudio.open({ mount, library (IniqStudioLibrary), categories: [[id, name]…], collections() → [{ id, name }] (the ones a widget may
     belong to), createCollection(name) → Promise<{ ok, collection }>, legacy() → [{ id, name, config }], adopt(itemId, defId),
     scope, builtins }) → { close(), save(), state(), select(id) }
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
  const GROUP_TITLE = { content: 'Content', presentation: 'Presentation', icon: 'Icon', look: 'Appearance', appearance: 'Appearance', image: 'Image', data: 'Preview value', item: 'Properties',
    widget: 'Widget', ha: 'Data', format: 'Value', range: 'Range', arc: 'Arc', ticks: 'Ticks', marker: 'Marker', face: 'Face', typo: 'Text', surface: 'Background', slider: 'Appearance' };
  const META0 = { collection: '', category: 'controls', description: '', icon: 'mdi:widgets' };
  const CANVAS = { w: 360, h: 240 };
  const CANVAS_LIMITS = { min: 40, max: 2000 };            // logical px (the server's limits)
  const CLIP = { items: null, from: null };                 // Studio's clipboard (this page): copied elements, and the design they came from
  const clone = (v) => structuredClone(v);

  /* ---------------------------------------------------------------- THE SNAP ENGINE (the canvas's — never a component's): it works on
     component BOXES only ({ x, y, w, h } in LOGICAL canvas px), so every composable component — today's and any future one — takes part
     without being known. Order: the proposed box (already logical) → SMART alignment (canvas edges / centres, other boxes' edges /
     centres: the nearest line within T logical px wins) → else the GRID → minimum size → the canvas. Guides: the lines the result is
     aligned on (editor-only, never stored).
       snapBox(box, { mode: 'move' | 'resize', others: [box…], canvas: { w, h }, grid: px, useGrid, useSmart, min: { w, h }, T })
         → { x, y, w, h, guides: [{ axis: 'x' | 'y', at }] }
       move:   the box's start / centre / end on each axis snap to a target line; resize: its right / bottom EDGE (the corner handle). */
  const SNAP_T = 5;
  function snapBox(box, { mode = 'move', others = [], canvas = CANVAS, grid = 8, useGrid = true, useSmart = true, min = { w: 1, h: 1 }, T = SNAP_T } = {}) {
    const b = { x: box.x, y: box.y, w: box.w, h: box.h };
    const axes = [['x', 'w', canvas.w], ['y', 'h', canvas.h]];
    const targets = (p, z, full) => (useSmart ? [0, full / 2, full, ...others.flatMap((o) => [o[p], o[p] + o[z] / 2, o[p] + o[z]])] : []);
    const nearest = (lines, ts) => { let best = null; lines.forEach((l) => ts.forEach((t) => { const d = t - l; if (Math.abs(d) <= T && (!best || Math.abs(d) < Math.abs(best))) best = d; })); return best; };
    const g = Math.max(1, grid);
    axes.forEach(([p, z, full]) => {
      const ts = targets(p, z, full), mn = z === 'w' ? min.w : min.h;
      if (mode === 'move') {
        const d = nearest([b[p], b[p] + b[z] / 2, b[p] + b[z]], ts);
        if (d !== null) b[p] += d; else if (useGrid) b[p] = Math.round(b[p] / g) * g;
        b[p] = Math.round(Math.max(0, Math.min(full - b[z], b[p])));            // inside the canvas — never resized by moving
      } else {
        const d = nearest([b[p] + b[z]], ts);
        if (d !== null) b[z] += d; else if (useGrid) b[z] = Math.round(b[z] / g) * g;
        b[z] = Math.round(Math.max(mn, Math.min(full - b[p], b[z])));            // its minimum, and inside the canvas
      }
    });
    // the guides: every target line the result is exactly on (its start / centre / end; resize: its moving edge)
    const guides = [];
    if (useSmart) axes.forEach(([p, z, full]) => {
      const lines = mode === 'move' ? [b[p], b[p] + b[z] / 2, b[p] + b[z]] : [b[p] + b[z]];
      [...new Set(targets(p, z, full))].forEach((t) => { if (lines.some((l) => Math.abs(l - t) <= 0.5)) guides.push({ axis: p, at: t }); });
    });
    return { ...b, guides };
  }

  function open({ mount, library = global.IniqStudioLibrary, categories = [], collections = () => [], createCollection = null, legacy = () => [], adopt = null, scope = 'studio', builtins = [] }) {
    let lastCollection = '';                                       // a new widget starts in the collection used last (else the user's first)
    const meta0 = () => ({ ...META0, collection: lastCollection || ((collections().find((c) => c.user) || {}).id || '') });
    const IC = global.IniqComponents, W = global.MaisonStudioWidget, Form = global.MaisonForm, BIND = global.IniqBinding;
    // src: what is open — a definition { kind: 'def', id, revision }, an older dashboard item { kind: 'item', id }, or null (new)
    let def = null, src = null, sel = null, dirty = false, widget = null, form = null, formFor = null;
    let multi = new Set();                                         // the SELECTION (sel: its primary — the one the Properties show)
    // an entity's state / attributes arrived: a component whose entity was just chosen takes its defaults (its binding layer's), the form
    // shows the entity's real values
    const offAttrs = BIND && BIND.onAttributes ? BIND.onAttributes(() => {
      // every component waiting for its slot's preview entity (mapped before the preview was known) settles now — not only the selected one
      let changed = false;
      list().forEach((x) => { if (x.binding && x.binding.auto && BIND.settle && BIND.settle(x, IC.get(x.type).compose)) { changed = true; updateNode(x); } });
      if (changed) { touch(); if (formFor) { formFor = null; drawProps(); } return; }
      if (form && formFor) form.refresh(); }) : null;
    // the canvas's EDITING aids (Studio session preferences — never part of the widget)
    const aids = { show: true, grid: 8, snapGrid: true, snapSmart: true };

    /* ---- chrome */
    const status = h('span', { class: 'wst__status', role: 'status', 'aria-live': 'polite', 'data-k': 'wst-status' });
    const pick = h('select', { class: 'wst__pick', 'aria-label': 'Open a widget', 'data-k': 'wst-widget', onchange: () => load(pick.value) });
    const msgs = h('div', { class: 'wst__msgs', 'data-k': 'wst-msgs', role: 'status', 'aria-live': 'polite', hidden: true });
    const nameIn = h('input', { type: 'text', class: 'wst__name', maxlength: '60', 'aria-label': 'Widget name', 'data-k': 'wst-name', oninput: () => { if (def) { def.name = nameIn.value; touch(); if (!sel) { formFor = null; drawProps(); } } } });
    const btnNew = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'wst-new', onclick: () => blank() }, h('span', { text: 'Create blank widget' }));
    const btnSave = h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'wst-save', onclick: () => doSave() }, h('span', { text: 'Save' }));
    const btnClose = h('button', { type: 'button', class: 'ed-btn ed-btn--ghost', 'data-k': 'wst-close', onclick: () => close() }, h('span', { text: 'Close' }));
    const btnUndo = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'wst-undo', title: 'Undo (Ctrl / ⌘ + Z)', 'aria-label': 'Undo', disabled: true, onclick: () => undo() }, h('span', { text: '↶ Undo' }));
    const btnRedo = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'wst-redo', title: 'Redo (Ctrl / ⌘ + Shift + Z)', 'aria-label': 'Redo', disabled: true, onclick: () => redo() }, h('span', { text: 'Redo ↷' }));
    const palette = h('div', { class: 'wst__palette', role: 'group', 'aria-label': 'Toolbox: click an element to add it, or drag it onto the canvas', 'data-k': 'wst-palette' });
    const find = h('input', { type: 'search', class: 'wst__find', placeholder: 'Find an element', 'aria-label': 'Find an element', 'data-k': 'wst-find', oninput: () => fillPalette() });
    const layers = h('ol', { class: 'wst__layers', 'data-k': 'wst-layers', 'aria-label': 'Layers (top first): click to select, Shift + click to add to the selection' });
    const board = h('div', { class: 'wst__board', 'data-k': 'wst-board' });
    if (global.MaisonTheme) global.MaisonTheme.scope(board);        // the widget drawn in the dashboard's active theme (components/theme)
    const layer = h('div', { class: 'wst__layer', 'data-k': 'wst-layer', tabindex: '-1', 'aria-label': 'Canvas: click a component to select it, Delete removes it' });
    const viewport = h('div', { class: 'wst__viewport' }, [board]);
    const selHost = h('div', { class: 'wst__selhost' }), guideHost = h('div', { class: 'wst__guides', 'data-k': 'wst-guides' });
    layer.append(selHost, guideHost);
    const tog = (k, label, on) => h('button', { type: 'button', class: 'wst__tg', 'data-k': k, 'aria-pressed': String(on), onclick: (e) => setAid(k, e.currentTarget) }, h('span', { text: label }));
    const tools = h('div', { class: 'wst__tools', role: 'group', 'aria-label': 'Canvas aids' }, [
      tog('wst-grid', 'Show grid', aids.show),
      h('span', { class: 'wst__seg', role: 'group', 'aria-label': 'Grid size (logical px)' }, [4, 8, 12, 16].map((n) => h('button', { type: 'button', class: 'wst__tg', 'data-k': 'wst-gsize', 'data-size': String(n), 'aria-pressed': String(n === aids.grid), onclick: () => setGrid(n) }, h('span', { text: String(n) })))),
      h('span', { class: 'wst__lbl', text: 'Snap' }), tog('wst-snap-grid', 'Grid', aids.snapGrid), tog('wst-snap-smart', 'Components', aids.snapSmart),
      h('span', { class: 'wst__lbl wst__lbl--hint', text: 'Alt: no snapping · arrows: 1 px · Shift + arrows: a grid step · Shift + click: add to the selection' })]);
    /* ARRANGE (the selection): align · distribute · stack · group — boxes only, never a component's configuration */
    const ARR = [['wst-align-left', 'Align left', '⇤', () => align('left')], ['wst-align-center', 'Align centres (horizontally)', '↔', () => align('center')], ['wst-align-right', 'Align right', '⇥', () => align('right')],
      ['wst-align-top', 'Align top', '⤒', () => align('top')], ['wst-align-middle', 'Align middles (vertically)', '↕', () => align('middle')], ['wst-align-bottom', 'Align bottom', '⤓', () => align('bottom')],
      ['wst-dist-h', 'Distribute horizontally (equal gaps)', '⋯', () => distribute('x')], ['wst-dist-v', 'Distribute vertically (equal gaps)', '⋮', () => distribute('y')],
      ['wst-stack-h', 'Stack in a row (one grid step apart)', '▤', () => stack('x')], ['wst-stack-v', 'Stack in a column (one grid step apart)', '▥', () => stack('y')],
      ['wst-group', 'Group (move and select together)', 'Group', () => group()], ['wst-ungroup', 'Ungroup', 'Ungroup', () => ungroup()],
      ['wst-copy', 'Copy the selection (Ctrl / ⌘ + C)', 'Copy', () => copySel()], ['wst-paste', 'Paste (Ctrl / ⌘ + V)', 'Paste', () => paste()]];
    const arrange = h('div', { class: 'wst__arrange', role: 'group', 'aria-label': 'Arrange the selection', 'data-k': 'wst-arrange' },
      ARR.map(([k, label, glyph, fn]) => h('button', { type: 'button', class: 'wst__tg wst__ar', 'data-k': k, title: label, 'aria-label': label, onclick: fn }, h('span', { text: glyph }))));

    function setAid(k, btn) {
      const key = { 'wst-grid': 'show', 'wst-snap-grid': 'snapGrid', 'wst-snap-smart': 'snapSmart' }[k];
      aids[key] = !aids[key]; btn.setAttribute('aria-pressed', String(aids[key])); paintGrid();
    }
    function setGrid(n) { aids.grid = n; tools.querySelectorAll('[data-k=wst-gsize]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.size) === n))); paintGrid(); }
    /** the grid: a CSS background of the selection layer, in LOGICAL px (it scales with the canvas) — no element per line */
    function paintGrid() { layer.dataset.grid = aids.show ? 'on' : 'off'; layer.style.setProperty('--wst-grid', `${aids.grid}px`); }
    paintGrid();
    const props = h('div', { class: 'wst__props', 'data-k': 'wst-props' });
    const dlg = h('dialog', { class: 'wst', 'aria-label': 'Widget Studio' }, [
      h('div', { class: 'wst__head' }, [h('h2', { class: 'wst__title', text: 'Widget Studio' }), pick, btnNew, nameIn, btnUndo, btnRedo, status, btnSave, btnClose]),
      msgs,
      h('div', { class: 'wst__body' }, [
        h('aside', { class: 'wst__col wst__col--l' }, [h('h3', { class: 'wst__h', text: 'Toolbox' }), find, palette, h('h3', { class: 'wst__h wst__h--layers', text: 'Arrange' }), arrange, h('h3', { class: 'wst__h wst__h--layers', text: 'Layers' }), layers]),
        h('main', { class: 'wst__col wst__col--c' }, [tools, viewport]),
        h('aside', { class: 'wst__col wst__col--r' }, [h('h3', { class: 'wst__h', text: 'Properties' }), props]),
      ]),
    ]);
    dlg.addEventListener('close', () => dlg.remove());
    if (global.MaisonConfigure && global.MaisonConfigure.guard) global.MaisonConfigure.guard(dlg);   // backdrop: nothing; Escape: close
    (mount || document.body).append(dlg);
    dlg.showModal();

    /* ---- the TOOLBOX: every COMPOSABLE registered component (nothing listed here by name), in the foundation's categories. Click adds
       one in the middle of the canvas; dragging one onto the canvas drops it there. */
    const TOOLBOX = [['visual', 'Visual'], ['content', 'Text'], ['data', 'Information'], ['controls', 'Controls'], ['layout', 'Layout']];
    function fillPalette() {
      const q = find.value.trim().toLowerCase();
      palette.replaceChildren(...TOOLBOX.map(([cat, title]) => {
        const items = IC.composable().filter((d) => d.category === cat && (!q || d.name.toLowerCase().includes(q)));
        if (!items.length) return null;
        return h('section', { class: 'wst__pgroup', 'data-cat': cat }, [h('h4', { class: 'wst__pgh', text: title }), h('div', { class: 'wst__pgrid' }, items.map((d) => h('button', {
          type: 'button', class: 'wst__add', 'data-k': 'wst-add', 'data-type': d.id, draggable: 'true', title: `${d.name} — click to add it, or drag it onto the canvas`, onclick: () => add(d.id),
          ondragstart: (e) => { e.dataTransfer.setData('text/x-iq-component', d.id); e.dataTransfer.effectAllowed = 'copy'; } },
          [h('b', { text: d.name }), h('small', { text: d.capabilities.slice(0, 2).join(' · ') })])))]);
      }).filter(Boolean));
      if (!palette.children.length) palette.append(h('p', { class: 'wst__hint', text: 'Nothing matches.' }));
    }
    fillPalette();

    /* ---- the model */
    const list = () => (def ? def.components : []);
    const byId = (id) => list().find((x) => x.id === id) || null;
    const touch = () => { dirty = true; status.textContent = 'Unsaved changes'; clearTimeout(hist.t); hist.t = setTimeout(commitHist, 250); };
    /* ---- UNDO / REDO: snapshots of the whole design (canvas, components, properties, settings…) — one per change; typing and a gesture
       coalesce (250 ms). Selection is not part of the design (restored when the element still exists). */
    const hist = { stack: [], at: -1, t: 0 };
    const snap = () => JSON.stringify({ name: def.name, meta: def.meta, canvas: def.canvas, slots: def.slots, properties: def.properties, settings: def.settings, components: def.components });
    function resetHist() { clearTimeout(hist.t); hist.stack = def ? [snap()] : []; hist.at = hist.stack.length - 1; paintHist(); }
    function commitHist() {
      clearTimeout(hist.t); if (!def) return;
      const s0 = snap(); if (s0 === hist.stack[hist.at]) return;
      hist.stack = hist.stack.slice(0, hist.at + 1); hist.stack.push(s0);
      if (hist.stack.length > 200) hist.stack.shift();
      hist.at = hist.stack.length - 1; paintHist();
    }
    function restore(state) {
      const o = JSON.parse(state);
      Object.assign(def, o); nameIn.value = def.name || '';
      if (!byId(sel)) sel = null; multi = new Set([...multi].filter((id) => byId(id)));
      dirty = true; formFor = null; draw(); drawProps();
    }
    function undo() { commitHist(); if (hist.at <= 0) return; hist.at -= 1; restore(hist.stack[hist.at]); status.textContent = 'Undone — unsaved changes'; paintHist(); }
    function redo() { commitHist(); if (hist.at >= hist.stack.length - 1) return; hist.at += 1; restore(hist.stack[hist.at]); status.textContent = 'Redone — unsaved changes'; paintHist(); }
    function paintHist() { btnUndo.disabled = !def || hist.at <= 0; btnRedo.disabled = !def || hist.at >= hist.stack.length - 1; }
    /** a NEW component id: one past the highest of its type (a deleted control's id is not handed straight to a newcomer) */
    function freshId(type) { const n = list().map((x) => (x.id.startsWith(`${type}-`) ? Number(x.id.slice(type.length + 1)) : 0)).filter(Number.isFinite); return `${type}-${Math.max(0, ...n) + 1}`; }
    /* COMPONENT NAMES (VB style: Dial1, ValueText2, Button1 — renameable, unique in the widget). The stable id (`dial-1`) never changes and
       never depends on the name: bindings, layers and saved copies all use the id. */
    const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
    const nameBase = (type) => { const D = IC.get(type); return ((D && D.compose && D.compose.nameBase) || (D ? D.name : type)).replace(/[^A-Za-z0-9]+(.)?/g, (m, c) => (c ? c.toUpperCase() : '')).replace(/^[^A-Za-z]+/, '') || 'Item'; };
    function freshName(type, taken = new Set(list().map((x) => String(x.name || '').toLowerCase()))) { const b = nameBase(type); let k = 1; while (taken.has(`${b}${k}`.toLowerCase())) k++; return `${b}${k}`; }
    /** components saved before names: each gets its type's next free name (in layer order) */
    function named(comps) {
      const taken = new Set(comps.map((x) => (NAME_RE.test(x.name || '') ? x.name.toLowerCase() : null)).filter(Boolean));
      comps.forEach((x) => { if (!NAME_RE.test(x.name || '')) { x.name = freshName(x.type, taken); taken.add(x.name.toLowerCase()); } });
      return comps;
    }
    function clamp(x) {
      const c = IC.get(x.type).compose, cw = def.canvas.w, ch = def.canvas.h;
      x.w = Math.round(Math.max(c.min.w, Math.min(cw, x.w))); x.h = Math.round(Math.max(c.min.h, Math.min(ch, x.h)));
      x.x = Math.round(Math.max(0, Math.min(cw - x.w, x.x))); x.y = Math.round(Math.max(0, Math.min(ch - x.h, x.y)));
      return x;
    }
    /* THE COMPONENT'S CONTRACT (Studio says only "this box changed" / "this presentation changed" / "scale this by k"):
       resize.toBox: a presentation that outgrows its box → the box it needs; scale: what scales in proportion (Shift + resize) */
    const composeOf = (x) => IC.get(x.type).compose;
    function looksChanged(x, prev) { const R = composeOf(x).resize; const p = R.toBox ? R.toBox(x.config, prev, { w: x.w, h: x.h }) : null; if (p) { Object.assign(x, p); clamp(x); return true; } return false; }
    /** a scaled presentation: every scalable property = its value at the START of the gesture × k (never compounded), in its range */
    function scaled(x, cfg0, base, k) {
      const S = composeOf(x).scale, c = clone(cfg0);
      Object.entries(base || {}).forEach(([p, v]) => { const [lo, hi] = S.props[p] || [0, Infinity]; c[p] = Math.round(Math.max(lo, Math.min(hi, v * k))); });
      return c;
    }
    /** one component brought up to date IN PLACE (the runtime's own update path: its view, else a fresh element for it alone) */
    function updateNode(x) { if (widget) widget.studio.update(x); }
    function blank() {
      def = { name: 'New widget', meta: meta0(), canvas: { ...CANVAS }, slots: [], properties: [], components: [] }; src = null; sel = null; multi = new Set(); dirty = true;
      status.textContent = 'New widget — not saved yet'; say([], []);
      refreshPick(); draw(); drawProps(); resetHist();
    }
    /** open a saved definition ('def:<id>') or an older Studio widget saved on this dashboard ('item:<id>') */
    /** a component's binding as its component declares it today (an older Dial's target / state / drag are no longer its inputs or actions) */
    const tidy = (list0) => list0.map((x) => { const D = IC.get(x.type); if (!x.binding || !BIND || !D || !D.compose) return x; const b = BIND.clean(x.binding, D.compose); return { ...x, binding: b }; });
    function load(key) {
      const [kind, id] = String(key || '').split(':');
      if (kind === 'def') {
        const w = library && library.get(id); if (!w) return;
        const d = BIND ? BIND.migrate(w.definition) : w.definition;      // an older definition's direct entities → entity slots (preview only)
        def = { slots: clone(d.slots || []), properties: clone(d.properties || []), settings: clone(d.settings || []), name: d.meta.name, meta: { collection: d.meta.collection || '', category: d.meta.category, description: d.meta.description || '', icon: d.meta.icon },
          canvas: clone(d.canvas), components: named(tidy(clone(d.components || []))) };
        src = { kind: 'def', id: w.id, revision: w.revision };
      } else if (kind === 'item') {
        const w = legacy().find((x) => x.id === id); if (!w || !w.config || w.config.definition) return;
        const m = BIND ? BIND.migrate({ components: clone(Array.isArray(w.config.components) ? w.config.components : []) }) : { components: clone(w.config.components || []) };
        def = { name: w.config.name || 'Studio widget', meta: meta0(), canvas: clone(w.config.canvas || CANVAS), slots: m.slots || [], properties: m.properties || [], components: named(tidy(m.components)) };
        src = { kind: 'item', id: w.id };
      } else return;
      sel = null; multi = new Set(); dirty = false; status.textContent = src.kind === 'item' ? 'An older Studio widget — Save makes it a reusable definition' : ''; say([], []);
      refreshPick(); draw(); drawProps(); resetHist();
    }
    function add(type, at = null) {
      if (!def) blank();
      const c = IC.get(type).compose, n = list().length;
      // a new component is INDEPENDENT: its own id and name, its own configuration, no property (nothing is ever assigned automatically);
      // dropped on the canvas it is centred on the drop point
      const x = clamp({ id: freshId(type), name: freshName(type), type, x: at ? Math.round(at.x - c.box.w / 2) : Math.round((def.canvas.w - c.box.w) / 2) + (n % 5) * 12 - 24,
        y: at ? Math.round(at.y - c.box.h / 2) : Math.round((def.canvas.h - c.box.h) / 2) + (n % 5) * 12 - 24,
        w: c.box.w, h: c.box.h, config: clone(c.initial ? c.initial() : c.defaults), data: clone(c.data) });
      def.components.push(x);                                  // a new component is on top (the list is the layer order)
      select(x.id); touch(); draw();
    }
    function duplicate() {
      const s = byId(sel); if (!s) return;
      const x = clamp({ ...clone(s), id: freshId(s.type), name: freshName(s.type), x: s.x + 12, y: s.y + 12 });
      delete x.group;                                          // a copy is on its own
      def.components.splice(def.components.indexOf(s) + 1, 0, x);
      select(x.id); touch(); draw();
    }
    /* ---- COPY / CUT / PASTE: the selected elements (with their configuration, preview data, rotation, rules), across widgets in this
       session. Pasted elements get fresh ids and names; a binding / rule / setting that names a property this widget does not have is
       dropped (never pointed at something else); a pasted group stays a group (a new one). */
    function copySel() {
      const xs = chosen(); if (!xs.length) return false;
      CLIP.items = clone(xs); CLIP.from = def; paintArrange(); status.textContent = `${xs.length} copied`; return true;
    }
    function paste() {
      if (!def || !CLIP.items || !CLIP.items.length) return;
      const props = new Set(props_().map((p) => p.id)), same = CLIP.from === def, groups = new Map(), out = [], ids = new Map();
      const usedG = list().map((x) => Number(String(x.group || '').slice(1)) || 0);
      let nextG = Math.max(0, ...usedG) + 1;
      CLIP.items.forEach((c) => {
        if (!IC.get(c.type) || !IC.get(c.type).compose) return;
        const x = clone(c);
        x.id = freshId(x.type); x.name = freshName(x.type);
        if (same) { x.x += 16; x.y += 16; }
        if (x.binding && !props.has(x.binding.property)) delete x.binding;
        if (x.showWhen && !x.showWhen.control && !props.has(x.showWhen.property)) delete x.showWhen;
        if (Array.isArray(x.when)) { x.when = x.when.filter((r) => r && props.has(r.property)); if (!x.when.length) delete x.when; }
        if (x.group) { if (!groups.has(x.group)) groups.set(x.group, `g${nextG++}`); x.group = groups.get(x.group); }
        delete x.locked;
        ids.set(c.id, x.id);
        def.components.push(clamp(x)); out.push(x.id);
      });
      if (!out.length) return;
      // CLIP TO: pasted together → the pasted partner; otherwise kept only while that element is in this widget
      out.forEach((id) => { const x = byId(id), to = x.style && x.style.clipTo; if (!to) return;
        if (ids.has(to)) x.style.clipTo = ids.get(to); else if (!same || !byId(to)) { delete x.style.clipTo; if (!Object.keys(x.style).length) delete x.style; } });
      multi = new Set(out); sel = out[out.length - 1]; formFor = null;
      touch(); draw(); drawProps(); status.textContent = `${out.length} pasted`;
    }
    function remove() {
      const gone = new Set(multi.size ? multi : [sel]); if (!gone.size || !byId(sel)) return;
      def.components = def.components.filter((x) => !gone.has(x.id));
      def.components.forEach((x) => { if (x.style && gone.has(x.style.clipTo)) { delete x.style.clipTo; if (!Object.keys(x.style).length) delete x.style; } });   // nothing clips to an element that is gone
      sel = null; multi = new Set(); touch(); draw(); drawProps();
    }
    function restack(d) {
      const s = byId(sel); if (!s) return;
      const a = def.components, i = a.indexOf(s), j = i + d;
      if (j < 0 || j >= a.length) return;
      [a[i], a[j]] = [a[j], a[i]]; touch(); draw();
    }
    /** select one (its GROUP comes with it), or — additive (Shift) — add / remove one to the selection */
    function select(id, additive = false) {
      const x = byId(id);
      if (additive && x) {
        const mates = x.group ? list().filter((y) => y.group === x.group).map((y) => y.id) : [id];
        if (multi.has(id)) { mates.forEach((m) => multi.delete(m)); sel = multi.size ? [...multi][multi.size - 1] : null; } else { mates.forEach((m) => multi.add(m)); sel = id; }
      } else {
        sel = x ? id : null;
        multi = new Set(x ? (x.group ? list().filter((y) => y.group === x.group).map((y) => y.id) : [id]) : []);
      }
      formFor = null; drawSel(); drawProps();
    }
    const chosen = () => list().filter((x) => multi.has(x.id));
    const bounds = (xs) => { const x0 = Math.min(...xs.map((x) => x.x)), y0 = Math.min(...xs.map((x) => x.y)); return { x: x0, y: y0, w: Math.max(...xs.map((x) => x.x + x.w)) - x0, h: Math.max(...xs.map((x) => x.y + x.h)) - y0 }; };
    function placed(xs) { xs.forEach((x) => { clamp(x); const node = widget && widget.studio.node(x.id); if (node) widget.studio.place(node, x); }); touch(); drawSel(); boxFields(); drawLayers(); }
    /** ALIGN: one element → on the canvas; several → on the selection's bounds (a locked element never moves) */
    function align(how) {
      const xs = chosen(); if (!xs.length) return;
      const b = xs.length === 1 ? { x: 0, y: 0, w: def.canvas.w, h: def.canvas.h } : bounds(xs);
      xs.filter((x) => !x.locked).forEach((x) => {
        if (how === 'left') x.x = b.x; else if (how === 'right') x.x = b.x + b.w - x.w; else if (how === 'center') x.x = Math.round(b.x + (b.w - x.w) / 2);
        else if (how === 'top') x.y = b.y; else if (how === 'bottom') x.y = b.y + b.h - x.h; else if (how === 'middle') x.y = Math.round(b.y + (b.h - x.h) / 2);
      });
      placed(xs);
    }
    /** DISTRIBUTE: the first and last stay; the ones between get equal gaps (three or more) */
    function distribute(axis) {
      const z = axis === 'x' ? 'w' : 'h', xs = chosen().sort((a, b) => a[axis] - b[axis]); if (xs.length < 3) return;
      const first = xs[0], last = xs[xs.length - 1], gap = (last[axis] + last[z] - first[axis] - xs.reduce((s, x) => s + x[z], 0)) / (xs.length - 1);
      let at = first[axis] + first[z] + gap;
      xs.slice(1, -1).forEach((x) => { if (!x.locked) x[axis] = Math.round(at); at += x[z] + gap; });
      placed(xs);
    }
    /** STACK: a row (x) or a column (y) — one grid step apart, from the first, aligned on its start */
    function stack(axis) {
      const z = axis === 'x' ? 'w' : 'h', other = axis === 'x' ? 'y' : 'x', xs = chosen().sort((a, b) => a[axis] - b[axis]); if (xs.length < 2) return;
      let at = xs[0][axis];
      xs.forEach((x) => { if (!x.locked) { x[axis] = at; x[other] = xs[0][other]; } at += x[z] + aids.grid; });
      placed(xs);
    }
    function group() { const xs = chosen(); if (xs.length < 2) return; const used = list().map((x) => Number(String(x.group || '').slice(1)) || 0); const g = `g${Math.max(0, ...used) + 1}`; xs.forEach((x) => { x.group = g; }); touch(); drawLayers(); drawProps(); }
    function ungroup() { chosen().forEach((x) => { delete x.group; }); touch(); drawLayers(); drawProps(); }
    function paintArrange() {
      const k = multi.size;
      arrange.querySelectorAll('button').forEach((b) => { const id = b.dataset.k;
        b.disabled = id === 'wst-paste' ? !def || !CLIP.items : !def || !k || (id.startsWith('wst-dist') && k < 3) || (id.startsWith('wst-stack') && k < 2) || (id === 'wst-group' && k < 2) || (id === 'wst-ungroup' && !chosen().some((x) => x.group)); });
    }
    /** the LAYERS panel (top first): select (Shift: add), Visible, Locked — the same model the canvas draws */
    /* the Layers panel's own two glyphs (Studio chrome, fixed paths — Studio uses no component module) */
    const GLYPHS = { 'mdi:eye-outline': 'M12 5C6.5 5 2.7 9.4 1.5 12c1.2 2.6 5 7 10.5 7s9.3-4.4 10.5-7C21.3 9.4 17.5 5 12 5zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9zm0-2.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z',
      'mdi:eye-off-outline': 'M3.3 2 2 3.3l3.2 3.2C3.3 7.9 2.1 9.8 1.5 12c1.2 2.6 5 7 10.5 7 1.8 0 3.4-.5 4.8-1.2l3.9 3.9 1.3-1.3L3.3 2zM12 16.5A4.5 4.5 0 0 1 7.5 12c0-.7.2-1.4.5-2l1.7 1.7a2.3 2.3 0 0 0 2.6 2.6L14 16c-.6.3-1.3.5-2 .5zM12 5c5.5 0 9.3 4.4 10.5 7-.6 1.4-1.7 3-3.2 4.3l-2.7-2.7c.3-.6.4-1.3.4-2.1A4.5 4.5 0 0 0 12 7.5c-.8 0-1.5.1-2.1.4L7.7 5.7C9 5.3 10.5 5 12 5z',
      'mdi:lock': 'M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z',
      'mdi:lock-open-variant-outline': 'M17 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-4V7a3 3 0 0 1 6 0v2h2V7a5 5 0 0 0-5-5zM6 12h12v8H6v-8z' };
    const mdi = (name) => { const s = h('span', { class: 'wst__mdi', 'aria-hidden': 'true' }); const v = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); v.setAttribute('viewBox', '0 0 24 24');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', GLYPHS[name] || ''); v.append(p); s.append(v); return s; };
    function drawLayers() {
      if (!def) { layers.replaceChildren(); return; }
      layers.replaceChildren(...[...list()].reverse().map((x) => {
        const row = h('li', { class: `wst__lyr${multi.has(x.id) ? ' is-sel' : ''}${x.id === sel ? ' is-primary' : ''}${x.hidden ? ' is-hidden' : ''}${x.locked ? ' is-locked' : ''}`, 'data-cid': x.id }, [
          h('button', { type: 'button', class: 'wst__lyr-eye', 'data-k': 'wst-layer-hide', 'aria-pressed': String(!x.hidden), title: x.hidden ? 'Hidden — show it' : 'Visible — hide it', 'aria-label': `${x.hidden ? 'Show' : 'Hide'} ${x.name}`,
            onclick: (e) => { e.stopPropagation(); if (x.hidden) delete x.hidden; else x.hidden = true; updateNode(x); touch(); drawLayers(); } }, mdi(x.hidden ? 'mdi:eye-off-outline' : 'mdi:eye-outline')),
          h('button', { type: 'button', class: 'wst__lyr-lock', 'data-k': 'wst-layer-lock', 'aria-pressed': String(!!x.locked), title: x.locked ? 'Locked — unlock it' : 'Unlocked — lock it (not moved on the canvas)', 'aria-label': `${x.locked ? 'Unlock' : 'Lock'} ${x.name}`,
            onclick: (e) => { e.stopPropagation(); if (x.locked) delete x.locked; else x.locked = true; touch(); drawLayers(); drawSel(); } }, mdi(x.locked ? 'mdi:lock' : 'mdi:lock-open-variant-outline')),
          h('button', { type: 'button', class: 'wst__lyr-name', 'data-k': 'wst-lyr', onclick: (e) => select(x.id, e.shiftKey), ondblclick: () => { const i = props.querySelector('[data-k=wst-cname]'); if (i) { i.focus(); i.select(); } } },
            [h('b', { text: x.name || x.id }), h('small', { text: `${(IC.get(x.type) || {}).name || x.type}${x.group ? ` · ${x.group.toUpperCase()}` : ''}` })])]);
        return row;
      }));
      if (!list().length) layers.append(h('li', { class: 'wst__hint', text: 'No elements yet.' }));
      paintArrange();
    }

    /* ---- the canvas: the widget RUNTIME draws it (the same component renderers as the dashboard); the selection layer is Studio's */
    function draw() {
      if (!def) { board.replaceChildren(h('div', { class: 'wst__empty' }, [h('p', { text: 'Create a blank widget, then add components to it.' }),
        h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'wst-new-empty', onclick: () => blank() }, h('span', { text: 'Create blank widget' }))])); return; }
      board.style.width = `${def.canvas.w}px`; board.style.height = `${def.canvas.h}px`;
      widget = W.create(def);
      widget.style.width = `${def.canvas.w}px`; widget.style.height = `${def.canvas.h}px`;
      board.replaceChildren(widget, layer, canvasGrip);
      zoom(); drawSel(); drawLayers();
    }
    function zoom() {
      if (!def) return;
      const r = viewport.getBoundingClientRect(), z = Math.max(0.5, Math.min(2.5, Math.min((r.width - 48) / def.canvas.w, (r.height - 48) / def.canvas.h))) || 1;
      board.style.transform = `scale(${z.toFixed(3)})`; board.dataset.zoom = z.toFixed(3); board.style.setProperty('--wst-z', z.toFixed(3));   // the selection chrome keeps its screen size
    }
    function drawSel() {
      selHost.replaceChildren();
      chosen().filter((x) => x.id !== sel).forEach((x) => { const o = h('div', { class: 'wst__sel wst__sel--also', 'data-cid': x.id });
        Object.assign(o.style, { left: `${x.x}px`, top: `${x.y}px`, width: `${x.w}px`, height: `${x.h}px` }); selHost.append(o); });
      const s = byId(sel); if (!s) { drawLayers(); return; }
      const one = multi.size <= 1 && !s.locked;
      const o = h('div', { class: `wst__sel${s.locked ? ' is-locked' : ''}`, 'data-k': 'wst-sel', 'data-cid': s.id }, [h('span', { class: 'wst__tag', text: `${s.name || s.id}${s.locked ? ' · locked' : ''}${multi.size > 1 ? ` · ${multi.size} selected` : ''}` }),
        one ? h('span', { class: 'wst__grip', 'data-k': 'wst-resize', 'aria-hidden': 'true' }) : null]);
      Object.assign(o.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px`, transform: s.rotate ? `rotate(${s.rotate}deg)` : '' });
      selHost.append(o);
      drawLayers();
    }
    /** the smart guides of the current gesture (temporary: removed when it ends) */
    function drawGuides(gs = []) {
      guideHost.replaceChildren(...gs.map((g) => { const l = h('span', { class: `wst__guide wst__guide--${g.axis}`, 'data-axis': g.axis, 'data-at': String(g.at) });
        l.style[g.axis === 'x' ? 'left' : 'top'] = `${g.at}px`; return l; }));
    }
    /** a pointer in LOGICAL canvas px (the board's own size: the zoom never changes a coordinate) */
    const logical = (e) => { const r = board.getBoundingClientRect(); return { x: (e.clientX - r.left) * def.canvas.w / r.width, y: (e.clientY - r.top) * def.canvas.h / r.height }; };
    let drag = null;
    layer.addEventListener('pointerdown', (e) => {
      if (!def || e.button > 0) return;
      layer.focus({ preventScroll: true });
      const p = logical(e), resize = !!e.target.closest('[data-k=wst-resize]');
      // a LOCKED element is not picked on the canvas (select it in Layers); Shift + click adds to / removes from the selection
      // an edge is hit within ~1.5 screen px (in logical px at the current zoom): a press on a corner never falls through to what is below
      const tol = 1.5 * def.canvas.w / (board.getBoundingClientRect().width || def.canvas.w);
      const hit = resize ? byId(sel) : [...list()].reverse().find((x) => !x.locked && p.x >= x.x - tol && p.x <= x.x + x.w + tol && p.y >= x.y - tol && p.y <= x.y + x.h + tol);
      if (!hit) { if (!e.shiftKey) select(null); return; }
      if (e.shiftKey && !resize) { select(hit.id, true); return; }
      if (!multi.has(hit.id)) select(hit.id); else if (hit.id !== sel) { sel = hit.id; formFor = null; drawSel(); drawProps(); }
      e.preventDefault(); layer.setPointerCapture(e.pointerId);
      // a resize keeps a SNAPSHOT of the presentation: a Shift-resize scales from it (base × k), a normal resize restores it
      const S = IC.get(hit.type).compose.scale;
      drag = { id: e.pointerId, mode: resize ? 'resize' : 'move', p, o: { x: hit.x, y: hit.y, w: hit.w, h: hit.h }, moved: false, cfg0: clone(hit.config), base: resize && S ? S.base(hit.config) : null,
        // the OTHER selected elements move with it (the same delta, kept inside the canvas together)
        mates: resize ? [] : chosen().filter((x) => x !== hit && !x.locked).map((x) => ({ x, o: { x: x.x, y: x.y } })) };
    });
    layer.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      // pointer → LOGICAL delta → the proposed box → the snap engine (smart → grid → minimum → canvas); Alt: no snapping
      const s = byId(sel), p = logical(e), dx = p.x - drag.p.x, dy = p.y - drag.p.y, free = e.altKey, o = drag.o, C = IC.get(s.type).compose;
      const snapOpts = { others: list().filter((x) => x !== s && !(drag.mates || []).some((m) => m.x === x)), canvas: def.canvas, grid: aids.grid, useGrid: aids.snapGrid && !free, useSmart: aids.snapSmart && !free, min: C.min };
      if (drag.mode === 'resize' && e.shiftKey && drag.base) {
        // SHIFT + RESIZE = SCALE: one uniform factor k (the box keeps its proportions; circles stay circles) — the proposed box snapped
        // first, k taken from the SNAPPED box, kept inside the canvas and over the minimum; the presentation = snapshot × k
        const k0 = Math.max(0.05, ((o.w + dx) / o.w + (o.h + dy) / o.h) / 2);
        const r = snapBox({ ...o, w: o.w * k0, h: o.h * k0 }, { ...snapOpts, mode: 'resize' });
        const byY = r.guides.some((g) => g.axis === 'y') && !r.guides.some((g) => g.axis === 'x');
        let k = byY ? r.h / o.h : r.w / o.w;
        k = Math.max(Math.max(C.min.w / o.w, C.min.h / o.h), Math.min(k, (def.canvas.w - o.x) / o.w, (def.canvas.h - o.y) / o.h));
        Object.assign(s, { w: Math.round(o.w * k), h: Math.round(o.h * k), config: scaled(s, drag.cfg0, drag.base, k) });
        drawGuides(r.guides.filter((g) => g.axis === (byY ? 'y' : 'x')));
      } else {
        // a MOVE, or a NORMAL RESIZE = the layout box only (the presentation as it was at the start)
        const proposed = drag.mode === 'move' ? { ...o, x: o.x + dx, y: o.y + dy } : { ...o, w: o.w + dx, h: o.h + dy };
        const r = snapBox(proposed, { ...snapOpts, mode: drag.mode });
        if (drag.mode === 'move' && drag.mates.length) {          // the whole selection inside the canvas: the delta limited by every member
          let ddx = r.x - o.x, ddy = r.y - o.y;
          drag.mates.forEach((m) => { ddx = Math.max(-m.o.x, Math.min(def.canvas.w - m.x.w - m.o.x, ddx)); ddy = Math.max(-m.o.y, Math.min(def.canvas.h - m.x.h - m.o.y, ddy)); });
          r.x = o.x + ddx; r.y = o.y + ddy;
          drag.mates.forEach((m) => { m.x.x = Math.round(m.o.x + ddx); m.x.y = Math.round(m.o.y + ddy); const nd = widget && widget.studio.node(m.x.id); if (nd) widget.studio.place(nd, m.x); });
        }
        Object.assign(s, { x: r.x, y: r.y, w: r.w, h: r.h });
        if (drag.mode === 'resize') s.config = clone(drag.cfg0);
        drawGuides(r.guides);
      }
      clamp(s); drag.moved = true;
      if (drag.mode === 'resize') updateNode(s);                       // the component's own response (its update / its renderer)
      else { const node = widget && widget.studio.node(s.id); if (node) widget.studio.place(node, s); }   // a move: the same box, no re-render
      drawSel(); boxFields();
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved, resized = drag.mode === 'resize'; drag = null;
      drawGuides([]);
      if (moved) { touch(); if (resized) { formFor = null; drawProps(); } }   // its Properties show the REAL values now (scaled ones included)
    };
    layer.addEventListener('pointerup', end); layer.addEventListener('pointercancel', end);
    // DROP from the toolbox: the element is placed where it is dropped
    layer.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('text/x-iq-component')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    layer.addEventListener('drop', (e) => { const t = e.dataTransfer && e.dataTransfer.getData('text/x-iq-component'); if (!t || !IC.get(t) || !IC.get(t).compose) return; e.preventDefault(); if (!def) blank(); add(t, logical(e)); });
    const ro = new ResizeObserver(() => zoom()); ro.observe(viewport);
    // the CANVAS GRIP (bottom-right corner of the board): drag to resize the canvas (Shift: keep its proportions); snapped to the grid
    const canvasGrip = h('span', { class: 'wst__cgrip', 'data-k': 'wst-canvas-grip', title: 'Drag to resize the canvas', 'aria-hidden': 'true' });
    let cdrag = null;
    canvasGrip.addEventListener('pointerdown', (e) => {
      if (!def || e.button > 0) return; e.preventDefault(); e.stopPropagation(); canvasGrip.setPointerCapture(e.pointerId);
      cdrag = { id: e.pointerId, x: e.clientX, y: e.clientY, w: def.canvas.w, h: def.canvas.h, z: Number(board.dataset.zoom) || 1 };
    });
    canvasGrip.addEventListener('pointermove', (e) => {
      if (!cdrag || e.pointerId !== cdrag.id) return;
      let w = cdrag.w + (e.clientX - cdrag.x) / cdrag.z, hh = cdrag.h + (e.clientY - cdrag.y) / cdrag.z;
      if (e.shiftKey) { const k = Math.max(w / cdrag.w, hh / cdrag.h); w = cdrag.w * k; hh = cdrag.h * k; }
      if (aids.snapGrid && !e.altKey) { w = Math.round(w / aids.grid) * aids.grid; hh = Math.round(hh / aids.grid) * aids.grid; }
      w = Math.round(Math.max(CANVAS_LIMITS.min, Math.min(CANVAS_LIMITS.max, w))); hh = Math.round(Math.max(CANVAS_LIMITS.min, Math.min(CANVAS_LIMITS.max, hh)));
      board.style.width = `${w}px`; board.style.height = `${hh}px`; cdrag.nw = w; cdrag.nh = hh; status.textContent = `Canvas ${w} × ${hh}`;
    });
    const cend = (e) => { if (!cdrag || e.pointerId !== cdrag.id) return; const d = cdrag; cdrag = null; if (d.nw) setCanvas(d.nw, d.nh); };
    canvasGrip.addEventListener('pointerup', cend); canvasGrip.addEventListener('pointercancel', cend);
    // keys on the canvas (never while a field or control of the Properties has focus): Delete removes; arrows move 1 logical px,
    // Shift + arrows one grid step — inside the canvas
    const FIELD = 'input, textarea, select, [contenteditable], .wst__props, [role=slider], [role=radiogroup], [role=listbox], [role=menu], .wst__tools, .wst__head';
    dlg.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey, typing = e.target.closest('input, textarea, select, [contenteditable]');
      if (mod && !typing && def) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); return; }
        if (k === 'c') { if (copySel()) e.preventDefault(); return; }
        if (k === 'x') { if (copySel()) { e.preventDefault(); remove(); } return; }
        if (k === 'v') { if (CLIP.items) { e.preventDefault(); paste(); } return; }
        if (k === 'd') { if (sel) { e.preventDefault(); duplicate(); } return; }
      }
      if (!sel || e.target.closest(FIELD)) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); select(null); return; }   // back to the widget's own settings (Escape again closes Studio)
      if (['Delete', 'Backspace'].includes(e.key)) { e.preventDefault(); remove(); return; }
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!step || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const n = e.shiftKey ? aids.grid : 1, xs = chosen().filter((x) => !x.locked);
      if (!xs.length) return;
      const b = bounds(xs), dx = Math.max(-b.x, Math.min(def.canvas.w - b.x - b.w, step[0] * n)), dy = Math.max(-b.y, Math.min(def.canvas.h - b.y - b.h, step[1] * n));
      xs.forEach((x) => { x.x += dx; x.y += dy; });
      placed(xs);
    });

    /* ---- properties: the BOX (Studio's) + the component's SHARED configuration editor and its preview data */
    const num = (key, label, get, set) => {
      const i = h('input', { type: 'number', step: '1', class: 'wst__num', 'data-k': `wst-${key}`, 'aria-label': label,
        onchange: () => { const s = byId(sel); if (!s || !Number.isFinite(Number(i.value))) return; set(s, Number(i.value)); clamp(s);
          touch(); updateNode(s); drawSel(); boxFields(); } });                   // exact numbers: a NORMAL (layout) change — never scaled
      i.dataset.get = key;
      return h('label', { class: 'wst__field' }, [h('span', { text: label }), i]);
    };
    function boxFields() {
      const s = byId(sel); if (!s) return;
      props.querySelectorAll('input[data-get]').forEach((i) => { if (document.activeElement !== i) i.value = String(s[i.dataset.get] ?? 0); });
    }
    /* ---- the PROPERTY SHEET (VB style): the selected component's own properties only — IDENTITY (its name) · DATA (the widget property
       it uses) · its own groups (from its editor) · PREVIEW VALUE · LAYOUT (its box, layer, duplicate, delete). Every section collapses;
       which ones are closed is remembered while Studio is open (editor state only). */
    const closed = new Set();
    const section = (g, title, kids) => {
      const d = h('details', { class: `ef-group ef-group--acc ef-group--${g}`, 'data-group': g, open: !closed.has(g) }, [h('summary', { class: 'ef-acc__h' }, [h('span', { class: 'ef-acc__t', text: title })]), ...kids]);
      return d;
    };
    const remember = (root) => root.querySelectorAll('details[data-group]').forEach((d) => { if (closed.has(d.dataset.group)) d.open = false;
      d.addEventListener('toggle', () => { if (d.open) closed.delete(d.dataset.group); else closed.add(d.dataset.group); }); });
    let editLink = null, truth = null, paintTruth = null;
    function drawProps() {
      const s = byId(sel);
      if (!def) { props.replaceChildren(h('p', { class: 'wst__hint', text: 'No widget open.' })); form = null; formFor = null; return; }
      if (!s) { drawWidgetProps(); return; }
      if (multi.size > 1) { drawMultiProps(); return; }
      if (formFor === s.id && form) { boxFields(); return; }
      unwatchRows.splice(0).forEach((f) => f());
      const D = IC.get(s.type), builder = IC.editor(s.type);
      // its own configuration (its editor) · its DATA (which widget property — from what it declares, Studio names nothing) · its preview value
      const own = [...(D.compose.fields ? D.compose.fields() : builder ? builder({ ...D.compose.editor, builtins }) : []), ...(D.compose.extraFields ? D.compose.extraFields() : [])];
      const bind = BIND ? BIND.fields(D.compose, bindCtx) : [], grp = (f) => f.group || 'item';
      const fields = [...own.filter((f) => grp(f) === 'ha'), ...bind, ...own.filter((f) => grp(f) !== 'ha'), ...D.compose.dataFields];
      const groups = [...new Set(fields.map(grp))].map((g) => [g, GROUP_TITLE[g] || g.replace(/^./, (c) => c.toUpperCase()), '']);
      form = Form.create({ type: { fields: fields.map((f) => ({ ...f, group: grp(f) })), groups, accordion: 'all' }, config: { ...clone(s.config), data: clone(s.data || {}), binding: clone(s.binding || {}) }, scope,
        onChange: (c) => { const x = byId(formFor); if (!x) return; const { data, binding, ...cfg } = c, prev = x.config; x.config = cfg; x.data = data || {};
          if (binding && binding.property) x.binding = binding; else delete x.binding;
          if (editLink) editLink.hidden = !(x.binding && x.binding.property);
          if (paintTruth) paintTruth();
          looksChanged(x, prev); touch(); updateNode(x); drawSel(); boxFields(); } });   // the changed component only
      formFor = s.id;
      // IDENTITY: its name (unique in the widget; the binding and the layer order never depend on it)
      const nmErr = h('p', { class: 'ef-err', 'data-k': 'wst-cname-err', hidden: true });
      const nm = h('input', { type: 'text', maxlength: '40', value: s.name || '', 'data-k': 'wst-cname', 'aria-label': 'Name', spellcheck: 'false',
        oninput: () => { const x = byId(sel), v = nm.value.trim(), dup = list().some((y) => y !== x && String(y.name || '').toLowerCase() === v.toLowerCase());
          const bad = !NAME_RE.test(v) ? 'Letters, digits and _ — starting with a letter' : dup ? 'Another component has this name' : '';
          nmErr.textContent = bad; nmErr.hidden = !bad;
          if (!bad && x) { x.name = v; touch(); title.textContent = v; drawSel(); } } });
      const title = h('span', { class: 'wst__pname', 'data-k': 'wst-pname', text: s.name || s.id });
      const identity = section('identity', 'Identity', [h('div', { class: 'ef-field ef-field--text', 'data-key': 'name' }, [h('label', { class: 'ef-label', text: 'Name' }), nm, nmErr])]);
      // LAYOUT: the box (logical px inside the widget), the layer, duplicate, delete
      const layout = section('layout', 'Layout', [
        h('div', { class: 'wst__box', role: 'group', 'aria-label': 'Component box (inside the widget)' }, [
          num('x', 'X', (o) => o.x, (o, v) => { o.x = v; }), num('y', 'Y', (o) => o.y, (o, v) => { o.y = v; }),
          num('w', 'Width', (o) => o.w, (o, v) => { o.w = v; }), num('h', 'Height', (o) => o.h, (o, v) => { o.h = v; }),
          num('rotate', 'Rotation °', (o) => o.rotate || 0, (o, v) => { const r = Math.max(-360, Math.min(360, Math.round(v))); if (r) o.rotate = r; else delete o.rotate; })]),
        // ON TAP: open a page of the dashboard (the pages of the dashboard being edited)
        h('label', { class: 'wst__field' }, [h('span', { text: 'On tap' }), (() => { const pages = (global.editor && global.editor.getModel ? global.editor.getModel().pages : []) || [];
          const t = h('select', { 'data-k': 'wst-tap', 'aria-label': 'On tap', onchange: () => { const x = byId(sel); if (!x) return; if (t.value) x.tap = { page: t.value }; else delete x.tap; touch(); } },
            [h('option', { value: '', text: 'Nothing' }), ...pages.map((p) => h('option', { value: p.id, text: `Open page: ${p.name || p.id}` })),
              ...(s.tap && !pages.some((p) => p.id === s.tap.page) ? [h('option', { value: s.tap.page, text: `Open page: ${s.tap.page} (not in this dashboard)` })] : [])]);
          t.value = (s.tap && s.tap.page) || ''; return t; })()]),
        // PINS: how it follows a dashboard cell of another shape (the widget set to "Fill the cell") and a canvas resize
        h('div', { class: 'wst__box', role: 'group', 'aria-label': 'Pins' }, [['h', 'Pin horizontally', [['left', 'Left'], ['right', 'Right'], ['stretch', 'Left and right (stretch)'], ['center', 'Centre'], ['scale', 'Scale']]],
          ['v', 'Pin vertically', [['top', 'Top'], ['bottom', 'Bottom'], ['stretch', 'Top and bottom (stretch)'], ['center', 'Centre'], ['scale', 'Scale']]]].map(([ax, label, opts]) => {
          const sel0 = h('select', { 'data-k': `wst-pin-${ax}`, 'aria-label': label, onchange: () => { const x = byId(sel); if (!x) return;
            const pin = { ...(x.pin || {}) }; if (!sel0.value) delete pin[ax]; else pin[ax] = sel0.value; if (Object.keys(pin).length) x.pin = pin; else delete x.pin; touch(); } },
          [['', ax === 'h' ? 'Automatic (centred with the rest)' : 'Automatic (at the top with the rest)'], ...opts].map(([v, t]) => h('option', { value: v, text: t })));
          sel0.value = (s.pin && s.pin[ax]) || '';
          return h('label', { class: 'wst__field' }, [h('span', { text: label }), sel0]); })),
        h('div', { class: 'wst__acts' }, [
          h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-back', onclick: () => restack(-1) }, h('span', { text: 'Send backward' })),
          h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-fwd', onclick: () => restack(1) }, h('span', { text: 'Bring forward' })),
          h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-dup', onclick: () => duplicate() }, h('span', { text: 'Duplicate' })),
          h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-visible', 'aria-pressed': String(!s.hidden), onclick: (e) => { const x = byId(sel); if (x.hidden) delete x.hidden; else x.hidden = true; e.currentTarget.setAttribute('aria-pressed', String(!x.hidden)); e.currentTarget.querySelector('span').textContent = x.hidden ? 'Show' : 'Hide'; updateNode(x); touch(); drawLayers(); } }, h('span', { text: s.hidden ? 'Show' : 'Hide' })),
          h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-lock', 'aria-pressed': String(!!s.locked), onclick: (e) => { const x = byId(sel); if (x.locked) delete x.locked; else x.locked = true; e.currentTarget.setAttribute('aria-pressed', String(!!x.locked)); e.currentTarget.querySelector('span').textContent = x.locked ? 'Unlock' : 'Lock'; touch(); drawSel(); } }, h('span', { text: s.locked ? 'Unlock' : 'Lock' })),
          h('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--danger', 'data-k': 'wst-del', onclick: () => remove() }, h('span', { text: 'Delete' }))])]);
      // SHOW WHEN: always, or only when a widget property has a source in the copy (e.g. a humidity chip only where there is a sensor)
      // …or only while a SEGMENTED control of this widget shows one of its options (tabs inside a widget: W / M / Y)
      const segs = list().filter((y) => { const C = IC.get(y.type) && IC.get(y.type).compose, acts = (C && C.actions) || {}; return y.id !== s.id && Object.values(acts).some((a) => a.kind === 'option') && Array.isArray((y.config || {}).options); });
      const showSel = h('select', { 'data-k': 'wst-showwhen', 'aria-label': 'Show',
        onchange: () => { const x = byId(sel); if (!x) return; const v = showSel.value;
          if (v.startsWith('c|')) { const [, control, is] = v.split('|'); x.showWhen = { control, is }; } else if (v) x.showWhen = { property: v }; else delete x.showWhen; touch(); updateNode(x); } },
        [h('option', { value: '', text: 'Always' }), ...props_().map((p) => h('option', { value: p.id, text: `Only when ${p.name} has a source` })),
          ...segs.flatMap((y) => y.config.options.filter((o) => o && o.id).map((o) => h('option', { value: `c|${y.id}|${o.id}`, text: `Only while ${y.name} shows “${o.label || o.id}”` })))]);
      showSel.value = s.showWhen && s.showWhen.control ? `c|${s.showWhen.control}|${s.showWhen.is}` : s.showWhen && props_().some((p) => p.id === s.showWhen.property) ? s.showWhen.property : '';
      layout.append(h('div', { class: 'ef-field ef-field--select', 'data-key': 'showWhen' }, [h('label', { class: 'ef-label', text: 'Show' }), showSel,
        h('p', { class: 'ef-help', text: 'A copy whose source group has no entity leaves this element out.' })]));
      // COPY SETTINGS: which of this component's own properties each placed copy may set differently (its text, picture, icon, colours…)
      const own2 = own.filter((f) => f && typeof f.key === 'string' && /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(f.key) && (global.MaisonStudioWidget ? global.MaisonStudioWidget.SETTABLE() : []).includes(f.type));
      const copyRows = own2.map((f) => {
        const on = () => settings_().find((st) => st.component === s.id && st.key === f.key);
        const b = h('button', { type: 'button', class: 'ef-switch', role: 'switch', 'data-k': 'wst-copyset', 'data-key': f.key, 'aria-checked': String(!!on()), 'aria-label': `Each copy sets ${f.label}`,
          onclick: () => { const cur = on();
            if (cur) def.settings = settings_().filter((st) => st !== cur);
            else settings_().push({ id: `k${hex8()}`, label: `${s.name || s.id} ${f.label}`.slice(0, 40), component: s.id, key: f.key });
            b.setAttribute('aria-checked', String(!cur)); touch(); } }, [h('span', { class: 'ef-switch__k' })]);
        return h('div', { class: 'ef-field ef-field--boolean ef-field--inline', 'data-key': `copy.${f.key}` }, [h('label', { class: 'ef-label', text: f.label }), b]);
      });
      // WHEN: up to 4 rules — while a property's current value passes a test, some of this element's own properties take other values
      const rulesBox = h('div', { class: 'wst__when', 'data-k': 'wst-when' });
      const drawRules = () => {
        const x = byId(sel); if (!x) return;
        const rules = Array.isArray(x.when) ? x.when : [];
        const keys = own2.map((f) => [f.key, f.label]);
        const commitRules = () => { const y = byId(sel); if (!y) return; const w = (y.when || []).filter(Boolean); if (w.length) y.when = w; else delete y.when; touch(); updateNode(y); };
        const row = (r, i) => {
          const pSel = h('select', { 'data-k': 'wst-when-prop', 'aria-label': 'Property', onchange: () => { r.property = pSel.value; commitRules(); } }, props_().map((p) => h('option', { value: p.id, text: p.name })));
          pSel.value = r.property;
          const tSel = h('select', { 'data-k': 'wst-when-test', 'aria-label': 'Test', onchange: () => { r.test = tSel.value; commitRules(); } },
            [['is', 'is'], ['not', 'is not'], ['above', 'is above'], ['below', 'is below']].map(([v, t]) => h('option', { value: v, text: t })));
          tSel.value = r.test;
          const vIn = h('input', { type: 'text', maxlength: '60', value: String(r.value ?? ''), 'data-k': 'wst-when-value', 'aria-label': 'Value',
            oninput: () => { const t = vIn.value.trim(); r.value = ['above', 'below'].includes(r.test) && t !== '' && Number.isFinite(Number(t)) ? Number(t) : t; commitRules(); } });
          const [k0, v0] = Object.entries(r.set || {})[0] || [keys[0] && keys[0][0], ''];
          const kSel = h('select', { 'data-k': 'wst-when-key', 'aria-label': 'Then set', onchange: () => { r.set = { [kSel.value]: sIn.value }; commitRules(); } }, keys.map(([k, l]) => h('option', { value: k, text: l })));
          kSel.value = k0 || '';
          const sIn = h('input', { type: 'text', maxlength: '400', value: String(v0 ?? ''), 'data-k': 'wst-when-set', 'aria-label': 'To',
            oninput: () => { const f = own2.find((y) => y.key === kSel.value), t = sIn.value.trim(); r.set = { [kSel.value]: f && ['range', 'number'].includes(f.type) && t !== '' ? Number(t) : f && f.type === 'boolean' ? t === 'true' : t }; commitRules(); } });
          const del = h('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--ghost', 'data-k': 'wst-when-del', onclick: () => { x.when.splice(i, 1); commitRules(); drawRules(); } }, h('span', { text: 'Remove' }));
          return h('div', { class: 'wst__rule', 'data-k': 'wst-when-rule' }, [h('span', { text: 'When' }), pSel, tSel, vIn, h('span', { text: 'set' }), kSel, h('span', { text: 'to' }), sIn, del]);
        };
        const add = h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-when-add', disabled: !props_().length || !keys.length || rules.length >= 4 || undefined,
          onclick: () => { const y = byId(sel); y.when = [...(y.when || []), { property: props_()[0].id, test: 'is', value: 'on', set: { [keys[0][0]]: '' } }]; drawRules(); } }, h('span', { text: '+ Add rule' }));
        rulesBox.replaceChildren(...rules.map(row), add, h('p', { class: 'ef-help', text: props_().length ? 'E.g. When Person is home set Border colour to #2fd36b. Values are checked like the property itself.' : 'Add a data property to the widget first.' }));
      };
      drawRules();
      const whenSec = section('when', 'When…', [rulesBox]);
      // ELEMENT STYLE (every element type): opacity, blend, blur, shadows / glow that follow its outline, clip with corner radii
      const P = global.IniqPaint, BL = (W && W.BLENDS) || ['normal'];
      const stKey = (k) => ({ get: (o) => (o.style || {})[k], set: (o, v) => { o.style = { ...(o.style || {}) }; if (v === undefined || v === null || v === '' || (k === 'blend' && v === 'normal') || (k === 'clip' && !v)) delete o.style[k]; else o.style[k] = v; if (!Object.keys(o.style).length) delete o.style; } });
      const styleFields = [
        { key: 'style.opacity', type: 'range', label: 'Element opacity', group: 'estyle', min: 0, max: 100, step: 1, unit: '%', auto: 'Opaque', autoValue: 100, optional: true, ...stKey('opacity') },
        { key: 'style.blend', type: 'select', label: 'Blend mode', group: 'estyle', options: BL.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1).replace('-', ' ') })), ...stKey('blend'), get: (o) => (o.style || {}).blend || 'normal' },
        { key: 'style.blur', type: 'range', label: 'Blur', group: 'estyle', min: 0, max: 40, step: 1, unit: 'px', auto: 'None', autoValue: 0, optional: true, ...stKey('blur') },
        ...(P ? [{ ...P.listField('style.shadows', 'Shadows and glow (follow the element’s outline; a glow: X 0, Y 0, a colour, a blur)', 'estyle', 'shadows', { spread: false }), group: 'estyle' }] : []),
        { key: 'style.clipTo', type: 'select', label: 'Clip to another element (its outline)', group: 'estyle', ...stKey('clipTo'), get: (o) => (o.style || {}).clipTo || '',
          options: [{ value: '', label: 'None' }, ...list().filter((y) => y.id !== s.id).map((y) => ({ value: y.id, label: y.name || y.id }))],
          help: 'E.g. a photo cut to a card with a tab: the photo shows only inside that card. Moving either keeps them together.' },
        { key: 'style.clip', type: 'boolean', label: 'Clip to its box', group: 'estyle', ...stKey('clip'), get: (o) => (o.style || {}).clip === true },
        { key: 'style.radius', type: 'range', label: 'Clip corner radius', group: 'estyle', min: 0, max: 400, step: 1, unit: 'px', auto: 'Square', autoValue: 0, optional: true, when: (o) => (o.style || {}).clip === true, ...stKey('radius') },
        ...[['radiusTL', 'Top-left'], ['radiusTR', 'Top-right'], ['radiusBR', 'Bottom-right'], ['radiusBL', 'Bottom-left']].map(([k, l]) => ({ key: `style.${k}`, type: 'range', label: `${l} corner`, group: 'estyle', half: true,
          min: 0, max: 400, step: 1, unit: 'px', optional: true, when: (o) => (o.style || {}).clip === true, ...stKey(k) }))];
      const styleForm = Form.create({ type: { fields: styleFields, groups: [['estyle', '', '']] }, config: { style: clone(s.style || {}) }, scope,
        onChange: (c) => { const x = byId(sel); if (!x) return; if (c.style && Object.keys(c.style).length) x.style = clone(c.style); else delete x.style; touch(); updateNode(x); } });
      const styleSec = section('estyle', 'Element style', [styleForm.el]);
      const copySec = copyRows.length ? section('copy', 'Each copy sets', [h('p', { class: 'ef-help', text: 'On: every placed copy of this widget can give its own value (e.g. a room name or photo); its Configure shows it under This copy.' }), ...copyRows]) : null;
      props.replaceChildren(...[h('div', { class: 'wst__ptitle' }, [h('b', { text: D.name }), title,
        h('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--ghost', 'data-k': 'wst-to-widget', title: 'The widget’s own settings (Escape)', onclick: () => select(null) }, h('span', { text: 'Widget' }))]), identity, form.el, styleSec, copySec, whenSec, layout].filter(Boolean));
      // EDIT beside its Property: the ONE definition of that property (family, value, source, preview entity) — the same editor as the widget's
      const pf = form.el.querySelector('.ef-field[data-key="binding.property"]');
      paintTruth = null;
      if (pf) {
        const back = () => { formFor = null; drawProps(); };
        editLink = h('button', { type: 'button', class: 'ed-btn ed-btn--sm wst__pedit', 'data-k': 'wst-propedit-here', onclick: () => {
          const x = byId(sel), p = x && x.binding && props_().find((y) => y.id === x.binding.property);
          if (!p || props.querySelector('[data-k=wst-peditor]')) return;
          pf.after(propertyEditor({ prop: p, compose: D.compose, onDone: back, onCancel: back }));
        } }, h('span', { text: 'Edit property' }));
        editLink.hidden = !(s.binding && s.binding.property);
        pf.append(editLink);
        // the TRUTH: what this control does with Home Assistant right now (nothing, without a property)
        truth = h('p', { class: 'wst__truth', 'data-k': 'wst-truth' });
        paintTruth = () => { const x = byId(sel), p = x && x.binding && bindCtx.properties().find((y) => y.id === x.binding.property); truth.textContent = BIND.describe(D.compose, p || null, x && x.binding); truth.dataset.bound = String(!!p); };
        paintTruth();
        pf.append(truth);
      }
      remember(props);
      boxFields();
    }

    /** SEVERAL elements selected: what they are, and the arrange tools (their own properties: select one) */
    function drawMultiProps() {
      unwatchRows.splice(0).forEach((f) => f()); form = null; formFor = null;
      const xs = chosen(), b = bounds(xs);
      const tool = (k) => { const src0 = arrange.querySelector(`[data-k="${k}"]`); return h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': `${k}-p`, disabled: src0.disabled || undefined, onclick: () => src0.click() }, h('span', { text: src0.title })); };
      props.replaceChildren(h('div', { class: 'wst__ptitle' }, [h('b', { text: 'Selection' }), h('span', { class: 'wst__pname', 'data-k': 'wst-pname', text: `${xs.length} elements` })]),
        section('selection', 'Selected', [h('ul', { class: 'wst__mlist' }, xs.map((x) => h('li', { text: `${x.name} · ${(IC.get(x.type) || {}).name || x.type}${x.locked ? ' · locked' : ''}` }))),
          h('p', { class: 'wst__hint', text: `Bounds ${b.x}, ${b.y} · ${b.w} × ${b.h} logical px. Select one element to edit its own properties.` })]),
        section('arrange', 'Arrange', [h('div', { class: 'wst__acts' }, ['wst-align-left', 'wst-align-center', 'wst-align-right', 'wst-align-top', 'wst-align-middle', 'wst-align-bottom'].map(tool)),
          h('div', { class: 'wst__acts' }, ['wst-dist-h', 'wst-dist-v', 'wst-stack-h', 'wst-stack-v'].map(tool)), h('div', { class: 'wst__acts' }, ['wst-group', 'wst-ungroup'].map(tool)),
          h('div', { class: 'wst__acts' }, [h('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--danger', 'data-k': 'wst-del', onclick: () => remove() }, h('span', { text: `Delete ${xs.length}` }))])]));
      remember(props);
    }
    /* ---- the WIDGET's library metadata (no component selected): how the finished widget is found — never what it does */
    function drawWidgetProps() {
      const fields = [
        { key: 'name', type: 'text', label: 'Name', group: 'widget', maxLength: 60, required: true },
        { key: 'category', type: 'select', label: 'Category', group: 'widget', options: categories.map(([value, label]) => ({ value, label })),
          help: 'Where it is listed in the gallery.' },
        { key: 'description', type: 'text', label: 'Description', group: 'widget', optional: true, maxLength: 200 },
        { key: 'icon', type: 'mdi', label: 'Gallery icon', group: 'widget', help: 'Shown in Add to dashboard.' }];
      form = Form.create({ type: { fields, groups: [['widget', 'Widget', `${def.canvas.w} × ${def.canvas.h} logical px · ${list().length} component${list().length === 1 ? '' : 's'} — select one on the canvas to edit it`]] },
        config: { name: def.name, ...def.meta }, scope,
        onChange: (c) => { if (!def) return; def.name = typeof c.name === 'string' ? c.name : def.name; def.meta = { ...def.meta, category: c.category, description: c.description || '', icon: c.icon || def.meta.icon };
          nameIn.value = def.name; touch(); } });
      formFor = null;
      // the COLLECTION: the organisational group the widget belongs to (required) — an existing one, or a new one created right here
      const sel0 = h('select', { class: 'wst__csel', 'data-k': 'wst-collection', 'aria-label': 'Collection',
        onchange: () => { def.meta.collection = sel0.value; lastCollection = sel0.value; touch(); } });
      const fill = () => { const list = collections();
        sel0.replaceChildren(...(def.meta.collection && list.some((c) => c.id === def.meta.collection) ? [] : [h('option', { value: '', text: 'Choose a collection…' })]),
          ...list.map((c) => h('option', { value: c.id, text: c.name })));
        sel0.value = list.some((c) => c.id === def.meta.collection) ? def.meta.collection : ''; };
      fill();
      const nameNew = h('input', { type: 'text', class: 'wst__cname', maxlength: '60', placeholder: 'Collection name — e.g. Maison', 'aria-label': 'New collection name', 'data-k': 'wst-collection-name' });
      const err = h('small', { class: 'wst__cerr', role: 'alert', 'data-k': 'wst-collection-err' });
      const create = async () => {
        const n = nameNew.value.trim();
        if (!n) { err.textContent = 'Give the collection a name'; nameNew.focus(); return; }
        if (!createCollection) { err.textContent = 'Collections can be created when IniqDash runs on its server'; return; }
        err.textContent = 'Creating…';
        const r = await createCollection(n);
        if (!r || !r.ok) { err.textContent = r && r.error === 'name_taken' ? 'A collection with this name exists — choose it above' : r && r.error === 'name_invalid' ? 'Use plain text, 1–60 characters' : 'Not created'; return; }
        def.meta.collection = r.collection.id; lastCollection = r.collection.id; touch();
        err.textContent = ''; nameNew.value = ''; adder.hidden = true; btnNewC.hidden = false; fill(); sel0.focus();
      };
      nameNew.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); adder.hidden = true; btnNewC.hidden = false; } });
      const adder = h('div', { class: 'wst__cnew', hidden: true }, [nameNew,
        h('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--primary', 'data-k': 'wst-collection-create', onclick: create }, h('span', { text: 'Create' })),
        h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-collection-cancel', onclick: () => { adder.hidden = true; btnNewC.hidden = false; err.textContent = ''; } }, h('span', { text: 'Cancel' }))]);
      const btnNewC = h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-collection-new', onclick: () => { adder.hidden = false; btnNewC.hidden = true; nameNew.focus(); } }, h('span', { text: '+ New' }));
      const coll = h('div', { class: 'wst__coll' }, [h('label', { class: 'wst__clabel', text: 'Collection' }), h('div', { class: 'wst__crow' }, [sel0, btnNewC]), adder, err,
        h('small', { class: 'wst__chelp', text: 'Your own grouping in Add to dashboard (e.g. Maison).' })]);
      props.replaceChildren(h('div', { class: 'wst__wmeta', 'data-k': 'wst-meta' }, [coll, form.el]), canvasSection(), libraryFile(), dataProperties(), ...[sourceGroups(), copySettings()].filter(Boolean));
      remember(props);
    }

    /* ---- the widget's DATA PROPERTIES (no component selected): one compact row per property — its name, "Family · Value", its source,
       its current preview value, who uses it — with Edit and Delete (a property in use: confirm, then its components go back to None). */
    let unwatchRows = [];
    function dataProperties() {
      const body = h('div', { class: 'wst__dprops', 'data-k': 'wst-dataprops' });
      const usersOf = (pid) => list().filter((x) => x.binding && x.binding.property === pid);
      const draw = () => {
        unwatchRows.splice(0).forEach((f) => f());
        const rows = props_().map((p) => {
          const g = groups().find((y) => y.id === p.group) || {}, fam = BIND.familyOf(g.family), users = usersOf(p.id);
          const cur = h('small', { class: 'wst__pcur', 'data-k': 'wst-propcurrent' });
          if (g.preview) unwatchRows.push(BIND.watchPreview(g.family, p, g.preview, (r) => { cur.textContent = `Preview: ${r.status === 'ready' ? r.text : r.text.toLowerCase()}`; cur.dataset.status = r.status; }));
          else { cur.textContent = 'No preview entity'; cur.dataset.status = 'none'; }
          const confirm = h('div', { class: 'wst__confirm', 'data-k': 'wst-propconfirm', hidden: true });
          const row = h('div', { class: 'wst__prop', 'data-k': 'wst-prop', 'data-prop': p.name }, [
            h('div', { class: 'wst__prow' }, [h('b', { class: 'wst__pn', text: p.name }),
              h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-propedit', onclick: () => { unwatchRows.splice(0).forEach((f) => f()); row.replaceWith(propertyEditor({ prop: p, onDone: () => { refreshUsers(p.id); draw(); }, onCancel: () => draw() })); } }, h('span', { text: 'Edit' })),
              h('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--ghost', 'data-k': 'wst-propdel', onclick: () => {
                const u = usersOf(p.id);
                if (!u.length) { deleteProperty(p.id); draw(); return; }
                confirm.replaceChildren(h('p', { text: `${p.name} is used by ${u.length} component${u.length === 1 ? '' : 's'} (${u.map((x) => x.name || x.id).join(', ')}).` }),
                  h('div', { class: 'wst__acts' }, [h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-propconfirm-cancel', onclick: () => { confirm.hidden = true; } }, h('span', { text: 'Cancel' })),
                    h('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--danger', 'data-k': 'wst-propconfirm-ok', onclick: () => { deleteProperty(p.id); draw(); } }, h('span', { text: 'Remove property and unbind components' }))]));
                confirm.hidden = false; } }, h('span', { text: 'Delete' }))]),
            h('small', { class: 'wst__pmeta', 'data-k': 'wst-propmeta', text: `${fam ? fam.label : g.family || '—'} · ${BIND.valueOf(g.family, p).label}` }),
            h('small', { class: 'wst__pmeta', 'data-k': 'wst-propsource', text: `Source: ${g.label || '—'}` }),
            cur,
            h('small', { class: `wst__users${users.length ? '' : ' is-unused'}`, 'data-k': 'wst-propusers', text: users.length ? `Used by: ${users.map((x) => x.name || x.id).join(', ')}` : 'Unused' }),
            confirm]);
          return row;
        });
        const add = h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-prop-add', onclick: () => { add.hidden = true; body.append(propertyEditor({ onDone: () => draw(), onCancel: () => draw() })); } }, h('span', { text: '+ Add property' }));
        body.replaceChildren(...(rows.length ? rows : [h('p', { class: 'wst__phelp', text: 'No data properties yet — add one (e.g. Room Temperature: a sensor\'s state), then choose it on a component.' })]), add);
      };
      draw();
      return section('dataprops', 'Data properties', [body]);
    }
    /** the CANVAS: the widget's own design size in logical px (a placed copy scales it to its cell). Shrinking keeps every element inside. */
    function setCanvas(w, h, why = 'Canvas resized') {
      const W0 = Math.round(Math.max(CANVAS_LIMITS.min, Math.min(CANVAS_LIMITS.max, w))), H0 = Math.round(Math.max(CANVAS_LIMITS.min, Math.min(CANVAS_LIMITS.max, h)));
      if (!def || (W0 === def.canvas.w && H0 === def.canvas.h)) return;
      // a widget that FILLS its cell: resizing the canvas moves / stretches the elements by their pins (what a cell of that shape shows)
      if (def.canvas.fit !== 'fit' && W && W.geo) list().forEach((x) => { const g = W.geo(x, { cw: def.canvas.w, ch: def.canvas.h, W: W0, H: H0 }, true); x.x = Math.round(g.x); x.y = Math.round(g.y); x.w = Math.round(g.w); x.h = Math.round(g.h); });
      def.canvas = { ...def.canvas, w: W0, h: H0 }; list().forEach((x) => clamp(x));
      touch(); draw(); status.textContent = `${why}: ${W0} × ${H0}`;
      props.querySelectorAll('[data-k=wst-canvas-w]').forEach((i) => { if (document.activeElement !== i) i.value = String(W0); });
      props.querySelectorAll('[data-k=wst-canvas-h]').forEach((i) => { if (document.activeElement !== i) i.value = String(H0); });
    }
    function canvasSection() {
      const field = (k, label, get) => { const i = h('input', { type: 'number', min: String(CANVAS_LIMITS.min), max: String(CANVAS_LIMITS.max), step: '1', class: 'wst__num', 'data-k': k, 'aria-label': label, value: String(get()),
        onchange: () => { const v = Number(i.value); if (Number.isFinite(v)) setCanvas(k === 'wst-canvas-w' ? v : def.canvas.w, k === 'wst-canvas-h' ? v : def.canvas.h); } });
        return h('label', { class: 'wst__field' }, [h('span', { text: label }), i]); };
      const fit = h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-canvas-fit', onclick: () => {
        if (!list().length) return; const b = bounds(list()); setCanvas(b.x + b.w + b.x, b.y + b.h + b.y, 'Canvas fitted to the content'); } }, h('span', { text: 'Fit to content' }));
      return section('canvas', 'Canvas size', [h('div', { class: 'wst__box' }, [field('wst-canvas-w', 'Width', () => def.canvas.w), field('wst-canvas-h', 'Height', () => def.canvas.h)]),
        h('div', { class: 'wst__acts' }, [fit]),
        h('label', { class: 'wst__field' }, [h('span', { text: 'In a dashboard cell' }), (() => { const m = h('select', { 'data-k': 'wst-canvas-mode', 'aria-label': 'In a dashboard cell',
          onchange: () => { if (m.value === 'fit') def.canvas = { ...def.canvas, fit: 'fit' }; else { const { fit: f0, ...rest } = def.canvas; void f0; def.canvas = rest; } touch(); draw(); } },
          [h('option', { value: 'fill', text: 'Fill the cell (like a standard widget; elements follow their pins)' }), h('option', { value: 'fit', text: 'Fit (whole design scaled, empty bands around it)' })]); m.value = def.canvas.fit === 'fit' ? 'fit' : 'fill'; return m; })()]),
        h('p', { class: 'ef-help', text: `Logical px, ${CANVAS_LIMITS.min}–${CANVAS_LIMITS.max}. Or drag the handle at the canvas's bottom-right corner. Fit: a placed copy scales the design into its cell. Fill: the design takes the cell's shape — each element keeps to its pins (Layout), and resizing the canvas here shows the same.` })]);
    }
    /** the WIDGET FILE: duplicate · delete (refused while dashboards use it) · export · import */
    function libraryFile() {
      const note = h('p', { class: 'ef-help', 'data-k': 'wst-file-msg', role: 'status' });
      const saved = src && src.kind === 'def' && library && library.get(src.id);
      const dupBtn = h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-file-duplicate', onclick: () => {
        // a copy of the design as it is now (unsaved changes included), not yet saved: a new widget named "… copy"
        const d = clone(def); d.name = `${(def.name || 'Widget').slice(0, 54)} copy`; def = d; src = null; sel = null; multi = new Set(); nameIn.value = def.name;
        status.textContent = 'A copy — not saved yet'; refreshPick(); draw(); drawProps(); resetHist(); touch(); } }, h('span', { text: 'Duplicate widget' }));
      const delBtn = h('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--danger', 'data-k': 'wst-file-delete', disabled: !saved || undefined, onclick: async () => {
        if (!saved) return;
        if (delBtn.dataset.armed !== '1') { delBtn.dataset.armed = '1'; delBtn.querySelector('span').textContent = 'Delete — click again to confirm'; return; }
        const r = await library.remove(src.id, src.revision);
        if (r.ok) { def = null; src = null; sel = null; multi = new Set(); status.textContent = 'Widget deleted'; refreshPick(); draw(); drawProps(); resetHist(); return; }
        delBtn.dataset.armed = ''; delBtn.querySelector('span').textContent = 'Delete widget';
        note.textContent = r.error === 'in_use' ? `Not deleted: it is placed on ${r.dashboards.map((d) => `“${d.name}”`).join(', ')}. Remove those copies first.`
          : r.error === 'conflict' ? 'Not deleted: it was changed elsewhere — reopen it first.' : `Not deleted (${r.error}).`; } }, h('span', { text: 'Delete widget' }));
      const expBtn = h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-file-export', disabled: !saved || undefined, onclick: () => {
        const file = library.exportFile([src.id]), url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }));
        const a = h('a', { href: url, download: `${String(def.name || 'widget').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60)}.iniqdash-widget.json` });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
        note.textContent = dirty ? 'Exported the SAVED version (save first to include the unsaved changes).' : 'Exported.'; } }, h('span', { text: 'Export…' }));
      const fileIn = h('input', { type: 'file', accept: '.json,application/json', 'data-k': 'wst-file-import-input', hidden: true, onchange: async () => {
        const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (!f) return;
        if (f.size > 2_000_000) { note.textContent = 'Not imported: the file is too large.'; return; }
        let data = null; try { data = JSON.parse(await f.text()); } catch (e) { note.textContent = 'Not imported: not a JSON file.'; return; }
        const r = await library.importFile(data, def && def.meta && def.meta.collection);
        if (r.error === 'not_a_studio_file') { note.textContent = 'Not imported: not an IniqDash widget file.'; return; }
        note.textContent = `${r.imported.length} imported${r.failed.length ? ` · ${r.failed.length} refused (${r.failed.map((x) => `${x.name}: ${x.error}`).join('; ')})` : ''}.`;
        refreshPick(); if (r.imported.length) load(`def:${r.imported[0].id}`); } });
      const impBtn = h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-file-import', onclick: () => fileIn.click() }, h('span', { text: 'Import…' }));
      // MANAGE WIDGETS: every collection and widget at once (rename, delete, move, delete several) — components/studio/manager.js
      const mgrBtn = global.IniqWidgetManager ? h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-manage', onclick: () => global.IniqWidgetManager.open({ mount: document.body, onChange: () => refreshPick() }) }, h('span', { text: 'Manage widgets…' })) : null;
      return section('file', 'Widget file', [h('div', { class: 'wst__acts' }, [dupBtn, expBtn, impBtn, delBtn, mgrBtn, fileIn]), note,
        h('p', { class: 'ef-help', text: 'Export makes a file another IniqDash can import. Import adds new widgets — nothing existing is replaced. Delete is refused while a dashboard uses the widget.' })]);
    }
    /** SOURCE GROUPS: required (every copy chooses an entity) or OPTIONAL (a copy may leave it empty — its elements with "Show only when…"
        are then left out) */
    function sourceGroups() {
      const gs = groups().filter((g) => props_().some((p) => p.group === g.id));
      if (!gs.length) return null;
      return section('sources', 'Source groups', gs.map((g) => {
        const b = h('button', { type: 'button', class: 'ef-switch', role: 'switch', 'data-k': 'wst-optional', 'data-group': g.label, 'aria-checked': String(g.optional === true), 'aria-label': `${g.label} is optional`,
          onclick: () => { if (g.optional) delete g.optional; else g.optional = true; b.setAttribute('aria-checked', String(g.optional === true)); touch(); } }, [h('span', { class: 'ef-switch__k' })]);
        return h('div', { class: 'ef-field ef-field--boolean ef-field--inline' }, [h('label', { class: 'ef-label', text: `${g.label}: optional in a copy` }), b]);
      }));
    }
    /** COPY SETTINGS (the widget's): their names as a placed copy's Configure shows them — rename, or remove */
    function copySettings() {
      const sts = settings_().filter((st) => list().some((x) => x.id === st.component));
      if (!sts.length) return null;
      return section('copysettings', 'Copy settings', sts.map((st) => {
        const x = byId(st.component);
        const inp = h('input', { type: 'text', maxlength: '40', value: st.label, 'data-k': 'wst-copyset-label', 'aria-label': 'Setting name', oninput: () => { st.label = inp.value; touch(); } });
        return h('div', { class: 'ef-field ef-field--text', 'data-k': 'wst-copyset-row' }, [h('label', { class: 'ef-label', text: `${x ? x.name || x.id : st.component} · ${st.key}` }), inp,
          h('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--ghost', 'data-k': 'wst-copyset-del', onclick: () => { def.settings = settings_().filter((y) => y !== st); touch(); drawProps(); } }, h('span', { text: 'Remove' }))]);
      }));
    }
    /** delete a property: the components using it go back to None (never deleted, never re-bound to something else) */
    function deleteProperty(pid) {
      list().filter((x) => x.binding && x.binding.property === pid).forEach((x) => { delete x.binding; updateNode(x); });
      list().filter((x) => x.showWhen && x.showWhen.property === pid).forEach((x) => { delete x.showWhen; updateNode(x); });
      def.properties = props_().filter((p) => p.id !== pid);
      def.slots = groups().filter((g) => props_().some((p) => p.group === g.id));
      touch();
    }
    /** the components on a source follow its preview entity: redrawn now; those still on their defaults (a range, options) prefill as soon
        as Home Assistant has reported the entity */
    function settleSource(gid) {
      const g = groups().find((x) => x.id === gid), on = () => list().filter((x) => x.binding && props_().some((p) => p.group === gid && p.id === x.binding.property));
      on().forEach((x) => updateNode(x));
      if (!g || !g.preview || !BIND.settle) return;
      BIND.whenReported(g.preview, () => { let changed = false; on().forEach((x) => { if (x.binding.auto && BIND.settle(x, IC.get(x.type).compose)) { changed = true; updateNode(x); } }); if (changed) { touch(); if (formFor) { formFor = null; drawProps(); } } });
    }
    function refreshUsers(pid) { list().filter((x) => x.binding && x.binding.property === pid).forEach((x) => updateNode(x)); }
    /** the PROPERTY EDITOR (create, or edit one): PROPERTY — its name; HOME ASSISTANT — family, value (a sensor: State), source (the entity
       a placed copy chooses — properties sharing a source share it; a new one is named after the property), the source's preview entity
       (design only) and, right there, the CURRENT PREVIEW VALUE Studio receives (with Home Assistant's unit). compose: the component it is
       made for (only values that component can use). */
    function propertyEditor({ prop = null, compose = null, onDone, onCancel }) {
      const editing = !!prop, g0 = prop ? groups().find((g) => g.id === prop.group) || null : null;
      let preview = g0 ? g0.preview || '' : '', previewTouched = false, srcNameTouched = false, unwatch = () => {};
      const err = h('p', { class: 'ef-err', 'data-k': 'wst-pe-err', hidden: true }), warn = h('p', { class: 'wst__pwarn', 'data-k': 'wst-pe-warn', hidden: true });
      const name = h('input', { type: 'text', maxlength: '40', 'data-k': 'wst-pe-name', placeholder: 'e.g. Room Temperature', 'aria-label': 'Property name', value: prop ? prop.name : '' });
      const fam = h('select', { 'data-k': 'wst-pe-family', 'aria-label': 'Family' }), val = h('select', { 'data-k': 'wst-pe-value', 'aria-label': 'Value' });
      const src = h('select', { 'data-k': 'wst-pe-source', 'aria-label': 'Source' }), srcName = h('input', { type: 'text', maxlength: '40', 'data-k': 'wst-pe-sname', 'aria-label': 'New source name' });
      const pickHost = h('div', { class: 'wst__pick' }), cur = h('div', { class: 'wst__pcurrent', 'data-k': 'wst-pe-current', role: 'status' });
      const usable = (f) => f.values.filter((v) => !compose || BIND.compatible(compose, f.id, { read: v.read.read, attribute: v.read.attribute }));
      fam.replaceChildren(...BIND.FAMILIES.filter((f) => usable(f).length).map((f) => h('option', { value: f.id, text: f.label })));
      if (g0 && [...fam.options].some((o) => o.value === g0.family)) fam.value = g0.family;
      const valueNow = () => { const f = BIND.familyOf(fam.value); return f && f.values.find((x) => x.id === val.value); };
      const field = (label, el, k) => h('label', { class: 'wst__pf', 'data-k': k }, [h('span', { text: label }), el]);
      const sourceLabel = () => (src.value ? (groups().find((g) => g.id === src.value) || {}).label : srcName.value.trim() || name.value.trim() || 'New source');
      const watch = () => {
        unwatch(); const v = valueNow();
        unwatch = BIND.watchPreview(fam.value, v ? { read: v.read.read, attribute: v.read.attribute } : {}, preview, (r) => {
          if (!box.isConnected && box.__shown) { unwatch(); return; }
          cur.replaceChildren(h('span', { class: 'wst__pcl', text: 'Current preview value' }), h('b', { text: r.status === 'ready' ? r.text : r.text }));
          cur.dataset.status = r.status;
        });
      };
      const drawPicker = () => {
        const pk = BIND.previewPicker({ label: sourceLabel(), family: fam.value, preview }, (id) => { preview = id || ''; previewTouched = true; watch(); });
        pickHost.replaceChildren(pk || h('small', { class: 'wst__phelp', text: 'A preview entity can be chosen when IniqDash runs on its server.' }));
      };
      const fill = (keepValue) => {
        const f = BIND.familyOf(fam.value), was = keepValue ? val.value : null;
        val.replaceChildren(...usable(f).map((v) => h('option', { value: v.id, text: v.label })));
        const mine = prop && g0 && g0.family === f.id ? BIND.valueOf(f.id, prop).id : null;
        val.value = [...val.options].some((o) => o.value === was) ? was : [...val.options].some((o) => o.value === mine) ? mine : (val.options[0] || {}).value || '';
        const keepSrc = src.value;
        src.replaceChildren(...groups().filter((g) => g.family === f.id).map((g) => h('option', { value: g.id, text: g.label })), h('option', { value: '', text: 'New source…' }));
        src.value = [...src.options].some((o) => o.value === keepSrc && keepSrc) ? keepSrc : g0 && g0.family === f.id ? g0.id : '';
        if (!previewTouched) preview = src.value ? (groups().find((g) => g.id === src.value) || {}).preview || '' : '';
        box.querySelector('[data-k=wst-pf-sname]').hidden = !!src.value;
        drawPicker(); watch(); warnUsers();
      };
      /** editing a property components use: say which ones cannot use the new value (the save then names them) */
      const warnUsers = () => {
        if (!editing) return;
        const v = valueNow(), bad = v ? list().filter((x) => x.binding && x.binding.property === prop.id && !BIND.compatible(IC.get(x.type).compose, fam.value, { read: v.read.read, attribute: v.read.attribute })) : [];
        warn.textContent = bad.length ? `${bad.map((x) => x.name || x.id).join(', ')} cannot use this value` : ''; warn.hidden = !bad.length;
      };
      fam.addEventListener('change', () => { previewTouched = false; fill(false); });
      val.addEventListener('change', () => { watch(); warnUsers(); });
      src.addEventListener('change', () => { previewTouched = false; fill(true); });
      name.addEventListener('input', () => { if (!srcNameTouched) srcName.value = name.value; });
      srcName.addEventListener('input', () => { srcNameTouched = true; });
      const ok = () => {
        const n = name.value.trim(), f = BIND.familyOf(fam.value), v = valueNow(), sn = src.value ? '' : (srcName.value.trim() || n);
        const bad = !n ? 'Give the property a name' : props_().some((p) => p !== prop && p.name.trim().toLowerCase() === n.toLowerCase()) ? 'A property with this name exists'
          : !v ? 'Choose a value' : !src.value && groups().some((g) => g.label.trim().toLowerCase() === sn.toLowerCase()) ? `A source "${sn}" exists — choose it` : '';
        err.textContent = bad; err.hidden = !bad;
        if (bad) return;
        let gid = src.value;
        if (!gid) { gid = uid('s', groups()); groups().push({ id: gid, label: sn.slice(0, 40), family: f.id }); }
        const g = groups().find((x) => x.id === gid);
        if (preview) g.preview = preview; else delete g.preview;                     // the SOURCE's preview entity (design only)
        const target = prop || { id: uid('p', props_()) };
        Object.assign(target, { name: n.slice(0, 40), group: gid, read: v.read.read });
        if (v.read.attribute) target.attribute = v.read.attribute; else delete target.attribute;
        if (!prop) props_().push(target);
        def.slots = groups().filter((x) => props_().some((p) => p.group === x.id));
        touch(); unwatch();
        // every component on this source follows its (new) preview entity at once
        settleSource(gid);
        onDone(target.id);
      };
      const box = h('div', { class: 'wst__peditor', 'data-k': 'wst-peditor', role: 'group', 'aria-label': editing ? `Edit property ${prop.name}` : 'New property' }, [
        h('b', { class: 'wst__ctitle', text: editing ? 'Edit property' : 'New property' }),
        field('Name', name, 'wst-pf-name'),
        h('span', { class: 'wst__psec', text: 'Home Assistant' }),
        h('div', { class: 'wst__prow' }, [field('Family', fam, 'wst-pf-family'), field('Value', val, 'wst-pf-value')]),
        field('Source', src, 'wst-pf-source'), field('New source name', srcName, 'wst-pf-sname'),
        h('small', { class: 'wst__phelp', text: 'Properties with the same source use ONE entity when the widget is placed.' }),
        h('div', { class: 'wst__pf' }, [h('span', { text: 'Preview entity' }), pickHost, h('small', { class: 'wst__phelp', text: 'Used only while designing.' })]),
        cur, warn, err,
        h('div', { class: 'wst__acts' }, [h('button', { type: 'button', class: 'ed-btn ed-btn--sm ed-btn--primary', 'data-k': 'wst-pe-save', onclick: ok }, h('span', { text: editing ? 'Save' : 'Create' })),
          h('button', { type: 'button', class: 'ed-btn ed-btn--sm', 'data-k': 'wst-pe-cancel', onclick: () => { unwatch(); onCancel(); } }, h('span', { text: 'Cancel' }))])]);
      if (!editing) srcName.value = '';
      fill(false);
      box.__shown = true;
      setTimeout(() => { if (!editing) name.focus(); }, 0);
      return box;
    }

    /* ---- save · the widget list */
    function refreshPick() {
      const defs = library ? library.list() : [], items = legacy().filter((w) => w.config && !w.config.definition);
      const cur = src ? `${src.kind}:${src.id}` : '';
      pick.replaceChildren(...(src ? [] : [h('option', { value: '', text: def ? `${def.name} (not saved)` : 'No widget' })]),
        h('optgroup', { label: 'Your widgets' }, defs.map((w) => h('option', { value: `def:${w.id}`, text: w.definition.meta.name }))),
        ...(items.length ? [h('optgroup', { label: 'Older Studio widgets on this dashboard' }, items.map((w) => h('option', { value: `item:${w.id}`, text: w.name || w.id })))] : []));
      pick.value = cur;
      nameIn.value = def ? def.name : ''; nameIn.disabled = !def; btnSave.disabled = !def;
    }
    function say(errors, warnings) {
      msgs.replaceChildren(...errors.map((t) => h('p', { class: 'wst__msg wst__msg--err', text: t })), ...warnings.map((t) => h('p', { class: 'wst__msg wst__msg--warn', text: t })));
      msgs.hidden = !errors.length && !warnings.length;
    }
    /* ---- WIDGET PROPERTIES + SOURCE GROUPS: the widget's named data ("Room Temperature": Climate · Current temperature) and the entities
       they come from ("Climate": one entity a placed copy chooses, several properties may share it). Components only REFERENCE a property —
       never another component. Internally a source group is an entity slot (stable id: a copy's config.entities key); ids never show. */
    const groups = () => (def ? (def.slots = def.slots || []) : []);
    const settings_ = () => (def ? (def.settings = def.settings || []) : []);
    const hex8 = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');
    const props_ = () => (def ? (def.properties = def.properties || []) : []);
    const uid = (k, list0) => { let id; do { id = `${k}${Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')}`; } while (list0.some((x) => x.id === id) || !/^[sp][0-9a-f]{8}$/.test(id)); return id; };
    const bindCtx = {
      /** the widget's properties as a component sees them: name, its group's family and preview entity */
      properties: () => props_().map((p) => { const g = groups().find((y) => y.id === p.group) || {}; return { ...p, family: g.family, preview: g.preview }; }),
      /** "+ New property" on the selected component: the property editor, right under its Property field; done → the component uses it */
      create(compose) {
        const cid = sel, at = props.querySelector('.ef-field[data-key="binding.property"]');
        if (!at || props.querySelector('[data-k=wst-peditor]')) return;
        const back = () => { formFor = null; drawProps(); };
        at.after(propertyEditor({ compose, onCancel: back, onDone: (pid) => {
          const x = byId(cid);
          if (x) { x.binding = { source: 'ha', property: pid, auto: true }; if (BIND.settle) BIND.settle(x, IC.get(x.type).compose); updateNode(x); }
          back();
        } }));
      },
    };
    /** what is saved: declarative only — the library metadata, the canvas, the SOURCE GROUPS that have a property (stable id, name, HA family,
        the designer's preview entity), the WIDGET PROPERTIES (stable id, name, group, what they read), each component's id / name / box /
        configuration / preview data / binding (a property reference — never an entity) */
    function definitionOf() {
      const live0 = groups().filter((g) => props_().some((p) => p.group === g.id));
      return { schema: BIND ? BIND.SCHEMA : 2, meta: { name: (def.name || '').trim(), collection: def.meta.collection, category: def.meta.category, description: (def.meta.description || '').trim(), icon: def.meta.icon || META0.icon }, canvas: { ...def.canvas },
        slots: live0.map((x) => ({ id: x.id, label: x.label.trim(), ...(x.family ? { family: x.family } : {}), ...(x.preview ? { preview: x.preview } : {}), ...(x.optional === true ? { optional: true } : {}) })),
        properties: props_().map((p) => ({ id: p.id, name: p.name.trim(), group: p.group, read: p.read || 'state', ...(p.read && p.read !== 'state' && p.attribute ? { attribute: p.attribute } : {}) })),
        components: list().map((x) => ({ id: x.id, name: x.name, type: x.type, x: x.x, y: x.y, w: x.w, h: x.h, config: clone(x.config || {}), data: clone(x.data || {}),
          ...(x.binding && BIND ? { binding: BIND.clean(x.binding, IC.get(x.type) && IC.get(x.type).compose) } : {}),
          ...(x.locked === true ? { locked: true } : {}), ...(x.hidden === true ? { hidden: true } : {}), ...(x.group ? { group: x.group } : {}),
          ...(typeof x.rotate === 'number' && x.rotate ? { rotate: Math.max(-360, Math.min(360, x.rotate)) } : {}),
          ...(x.tap && typeof x.tap.page === 'string' && x.tap.page ? { tap: { page: x.tap.page } } : {}),
          ...(x.pin && (x.pin.h || x.pin.v) ? { pin: { ...(x.pin.h ? { h: x.pin.h } : {}), ...(x.pin.v ? { v: x.pin.v } : {}) } } : {}),
          ...(x.style && typeof x.style === 'object' && Object.keys(x.style).length ? { style: clone(x.style) } : {}),
          ...(x.showWhen && props_().some((p) => p.id === x.showWhen.property) ? { showWhen: { property: x.showWhen.property } } : {}),
          ...(x.showWhen && x.showWhen.control && list().some((y) => y.id === x.showWhen.control) && typeof x.showWhen.is === 'string' ? { showWhen: { control: x.showWhen.control, is: x.showWhen.is } } : {}),
          ...((() => { const w = (Array.isArray(x.when) ? x.when : []).filter((r) => r && props_().some((p) => p.id === r.property) && r.set && Object.keys(r.set).length).slice(0, 4)
            .map((r) => ({ property: r.property, test: r.test, value: r.value, set: { ...r.set } })); return w.length ? { when: w } : {}; })()) })),
        settings: settings_().filter((st) => list().some((x) => x.id === st.component)).map((st) => ({ id: st.id, label: String(st.label || '').trim().slice(0, 40), component: st.component, key: st.key })) };
    }
    /** configuration errors stop a save; Home Assistant's current state (offline, an entity unavailable) is only a note */
    function validate() {
      const errors = [], warnings = [];
      if (!(def.name || '').trim()) errors.push('The widget needs a name');
      if (!def.meta.collection || !collections().some((c) => c.id === def.meta.collection)) errors.push('Choose a collection (or create one)');
      if (!categories.some(([c]) => c === def.meta.category)) errors.push('Choose a category');
      if (!/^mdi:[a-z0-9-]{1,64}$/.test(def.meta.icon || '')) errors.push('Choose a gallery icon');
      const names = new Set();
      list().forEach((x) => {
        const d = IC.get(x.type), who = x.name || x.id;
        if (!NAME_RE.test(x.name || '')) errors.push(`${who}: a component name uses letters, digits and _, starting with a letter`);
        else if (names.has(x.name.toLowerCase())) errors.push(`Two components are named ${x.name}`);
        names.add(String(x.name || '').toLowerCase());
        if (!d || !d.compose) { errors.push(`${who}: "${x.type}" is not an available component`); return; }
        if (!BIND || !x.binding) return;
        const p = bindCtx.properties().find((y) => y.id === x.binding.property);
        if (!p) { errors.push(`${who}: its property no longer exists — choose another (or none)`); return; }
        if (!BIND.compatible(d.compose, p.family, p)) { errors.push(`${who} cannot use ${p.name} (${BIND.valueOf(p.family, p).label})`); return; }
        const r = BIND.validate({ ...BIND.expandComponent(x, def), id: who }, d.compose, groups()); errors.push(...r.errors); warnings.push(...r.warnings);
      });
      const ps = props_(), gs = groups().filter((g) => ps.some((p) => p.group === g.id));
      if (ps.some((p) => !p.name.trim())) errors.push('Every property needs a name');
      if (new Set(ps.map((p) => p.name.trim().toLowerCase())).size !== ps.length) errors.push('Two properties have the same name');
      if (gs.some((g) => !g.label.trim())) errors.push('Every source group needs a name');
      const sts = settings_().filter((st) => list().some((x) => x.id === st.component));
      if (sts.some((st) => !String(st.label || '').trim())) errors.push('Every copy setting needs a name');
      if (new Set(sts.map((st) => String(st.label || '').trim().toLowerCase())).size !== sts.length) errors.push('Two copy settings have the same name');
      if (new Set(gs.map((g) => g.label.trim().toLowerCase())).size !== gs.length) errors.push('Two source groups have the same name — a dashboard could not tell them apart');
      return { errors, warnings };
    }
    async function doSave() {
      if (!def || !library) return { ok: false, error: 'no_library' };
      def.name = (nameIn.value || '').trim();
      const v = validate();
      say(v.errors, v.warnings);
      if (v.errors.length) { status.textContent = 'Not saved — fix the problems listed'; return { ok: false, error: 'invalid', errors: v.errors }; }
      status.textContent = 'Saving…';
      const was = src;
      const r = await library.save(src && src.kind === 'def' ? src.id : null, src && src.kind === 'def' ? src.revision : null, definitionOf());
      if (r && r.ok) {
        src = { kind: 'def', id: r.entry.id, revision: r.entry.revision }; dirty = false;
        if (was && was.kind === 'item' && adopt) await adopt(was.id, r.entry.id);       // the older dashboard item becomes an instance of it
        status.textContent = v.warnings.length ? 'Saved (see the notes)' : 'Saved — in Add to dashboard';
        refreshPick(); draw(); formFor = null; drawProps();
      } else status.textContent = r && r.error === 'conflict' ? 'Not saved — it was changed elsewhere; reopen it' : `Not saved${r && r.detail ? ` — ${r.detail}` : ''}`;
      return r && r.ok ? { ok: true, id: r.entry.id } : r;
    }
    function close() { ro.disconnect(); if (offAttrs) offAttrs(); if (dlg.open) dlg.close(); else dlg.remove(); }

    // opens on the most recently saved definition (or nothing: create one)
    const last = (library ? library.list() : []).sort((a, b) => String(b.updated).localeCompare(String(a.updated)))[0];
    if (last) load(`def:${last.id}`); else { refreshPick(); draw(); drawProps(); }
    const api = { close, save: doSave, state: () => ({ def: clone(def), defId: src && src.kind === 'def' ? src.id : null, revision: src && src.kind === 'def' ? src.revision : null, itemId: src && src.kind === 'def' ? src.id : null,
      source: src ? { ...src } : null, sel, dirty, aids: { ...aids } }), select, load, el: dlg };
    dlg.studio = api;
    return api;
  }

  global.IniqStudio = { open, snapBox, SNAP_T };
})(window);
