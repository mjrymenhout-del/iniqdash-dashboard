/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Configure dialog — the Add Widget flow and the Edit configuration flow share it.

   MaisonConfigure.open({
     mount,                 element to attach the <dialog> to
     mode: 'add' | 'edit',
     type, config,          edit: the item's type + current config (a copy is edited)
     size: { w, h, px? },   edit: current size in grid units (+ its logical px { w, h }: the preview starts there)
     grid: { cols, colStep, rowStep, gap, rgap }?   edit: the item's grid (logical px per unit) — the preview's units
     targets: [{ value, label, containers? }], target,   add: where it can go
     onPreview(config),     edit: live update of the real widget on the canvas (not the model)
     onApply({ type, config, target }),   commit
     onCancel()
   })
   Steps (add): 1 Type → 2 Configure → 3 Place.  Edit: Configure only, with Cancel / Apply.
   The preview is the REAL component (MaisonRegistry.instantiate) in a fixed frame, rebuilt on every
   change; nothing reaches the dashboard model until Apply.
   ========================================================================== */
(function (global) {
  'use strict';

  const R = () => global.MaisonRegistry;
  const COL = (1240 + 16) / 12, GAP = 16;           // a desktop dashboard column (preview geometry)
  /* preview shapes in GRID UNITS (desktop columns × 40 px rows), each a genuine own-size case for MaisonFit:
       compact   2 × 3   ≈ 193 × 152 px   a small tile   (tier "compact": shorter side 110–190 px)
       standard  4 × 5   ≈ 403 × 264 px   a normal tile  (tier "normal": 190–330 px)
       wide      6 × 3   ≈ 612 × 152 px   a strip        (shape "wide", 4 : 1)
     each raised to the widget's OWN minimum at that width (its constraints), so it is always a size the grid accepts.
     VARIANT PREVIEW: a type whose variants declare a representative preview shape (registry variantPreview) opens on it, and
     switching the variant switches to the new variant's shape; the owner can still try any size (W × H) or the widget's own.
     This is the EDITOR's preview geometry only: nothing of it reaches the widget's dashboard size / position. */
  const REF_COL = (1240 + 16) / 24;                  // the 24-column desktop reference the variant preview shapes are given in
  const pick = { collection: 'all', category: 'all', q: '' };   // the gallery filters (this page only, never saved)
  /* ORGANISE (the user's own arrangement of the gallery, for this installation — o.gallery = { get(), set(org) → Promise }):
       { categories: [{ id: 'u-…', name }], assign: { <widget key>: <category id> }, hidden: [<widget key>] }
     a widget moved to one of the user's categories is listed there; one marked "Not wanted" leaves the gallery (nothing is deleted: it
     is shown again with "Show not wanted", and Reset puts everything back). Export gives the list to tidy the code up later. */
  const ORG0 = () => ({ categories: [], assign: {}, hidden: [] });
  const cleanOrg = (g) => { const o = g && typeof g === 'object' ? g : {};
    const cats = Array.isArray(o.categories) ? o.categories.filter((c) => c && /^u-[a-z0-9]{1,24}$/.test(c.id) && typeof c.name === 'string' && c.name.trim()) : [];
    const ids = new Set(cats.map((c) => c.id));
    const assign = Object.fromEntries(Object.entries(o.assign && typeof o.assign === 'object' ? o.assign : {}).filter(([, v]) => ids.has(v)));
    return { categories: cats.map((c) => ({ id: c.id, name: c.name.trim().slice(0, 40) })), assign, hidden: Array.isArray(o.hidden) ? [...new Set(o.hidden.filter((k) => typeof k === 'string'))] : [] }; };
  const ui = { organise: false, showHidden: false };              // the gallery's organise mode (this page only)
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
  /** a gallery tile's picture: a Widget Studio definition's gallery ICON (MDI, the shared icon set), else the type's glyph */
  const tileGlyph = (T) => {
    const g = document.createElement('span'); g.className = 'ecfg-tile__g';
    if (T && T.icon && global.IniqIcons && global.IniqIcons.fill) { g.dataset.mdi = T.icon; global.IniqIcons.fill(g); if (g.firstElementChild) return g; }
    g.append(glyph(T.glyph)); return g;
  };
  const glyph = (markup) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = markup; return s; };

  /* ---- THE CONFIGURATION MODAL SHELL (shared by every configuration / editor modal: widget Add / Edit, Popup settings, notification
     templates…): a native modal <dialog> (focus trap, top layer) with a head (title + Cancel), a scrolling body and a pinned footer.
     GLOBAL DISMISSAL RULE: it closes ONLY by an explicit action — Apply, Cancel / Close, or Escape (= Cancel, never Apply). A click on
     the backdrop (outside the modal) does NOTHING: closedby="closerequest" tells the browser so, and a click on the dialog's own
     backdrop area is swallowed here, so no future default can close it either. A picker / item editor opened inside it is its own
     layer: using it, or clicking outside it, never closes this one. ---- */
  let seq = 0;
  function modal({ mount, cls = '', title = '', titles = null, cancelText = 'Cancel', onCancel } = {}) {
    const tid = `ecfg-title-${++seq}`;
    const t = titles ? null : h('h3', { id: tid, text: title });
    const dlg = h('dialog', { class: `ed-dlg ed-dlg--cfg ${cls}`.trim(), closedby: 'closerequest', 'aria-labelledby': titles ? (titles.querySelector('h3') || {}).id || tid : tid });
    const body = h('div', { class: 'ecfg-body' });
    const foot = h('div', { class: 'ed-dlg__foot ecfg-foot' });
    const close = (cancelled) => { if (!dlg.open) return; dlg.close(); if (cancelled && onCancel) onCancel(); };
    dlg.append(h('div', { class: 'ed-dlg__head' }, [titles || h('div', { class: 'ecfg-titles' }, t), h('button', { type: 'button', class: 'ed-btn ed-btn--ghost', 'data-k': 'dlg-cancel', onclick: () => close(true) }, h('span', { text: cancelText }))]), body, foot);
    guard(dlg);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(true); });   // Esc = Cancel
    dlg.addEventListener('close', () => dlg.remove());
    mount.append(dlg);
    dlg.showModal();
    return { dlg, body, foot, close, title: t };
  }
  /** the backdrop rule on any modal <dialog>: a press on the backdrop (the dialog element itself, outside its content box) is ignored */
  function guard(dlg) {
    if (!dlg.hasAttribute('closedby')) dlg.setAttribute('closedby', 'closerequest');
    const outside = (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { e.stopPropagation(); e.stopImmediatePropagation(); }
    };
    dlg.addEventListener('click', outside, true);
    dlg.addEventListener('pointerdown', outside, true);
    return dlg;
  }

  function open(o) {
    const reg = R();
    let type = o.type || null, form = null, draft = null, step = o.mode === 'edit' ? 2 : 1, entry = null;   // entry: the Widget Studio definition's gallery entry being added
    const title = h('h3', { id: 'ecfg-title' });
    const steps = h('ol', { class: 'ecfg-steps', 'aria-label': 'Steps' });
    const shell = modal({ mount: o.mount, cls: o.mode === 'edit' ? 'is-edit' : 'is-add', titles: h('div', { class: 'ecfg-titles' }, [title, steps]), cancelText: o.mode === 'edit' ? 'Cancel' : 'Close', onCancel: () => o.onCancel && o.onCancel() });
    const { dlg, body, foot } = shell;
    const close = (cancelled) => { if (cancelled) shell.close(true); else { if (dlg.open) dlg.close(); } };

    const btn = (label, cls, fn, extra = {}) => h('button', { type: 'button', class: `ed-btn ${cls || ''}`, onclick: fn, ...extra }, h('span', { text: label }));

    function render() {
      body.replaceChildren(); foot.replaceChildren();
      const T = type && (entry || reg.TYPES[type]);
      title.textContent = o.mode === 'edit' ? `Edit ${T.label}` : step === 1 ? 'Add to dashboard' : `Add ${T.label}`;
      steps.replaceChildren(...(o.mode === 'edit' ? [] : ['Type', 'Configure', 'Place'].map((s, i) => h('li', { class: i + 1 === step ? 'is-current' : i + 1 < step ? 'is-done' : '', 'aria-current': i + 1 === step ? 'step' : null, text: `${i + 1} ${s}` }))));
      if (step === 1) return renderPicker();
      if (step === 2) return renderConfigure();
      return renderPlace();
    }

    /* ---- step 1: type picker — Collection + Category + Search (they combine), tiles grouped under category headings.
       Filtering uses the registry the page already loaded (no rescan); the choice is remembered for this page only and
       never written into the dashboard. ---- */
    function renderPicker() {
      const allowedNow = () => [...Object.entries(reg.TYPES), ...(reg.library ? reg.library() : [])].filter(([k, T]) => {
        if (T.hidden) return false;                                 // e.g. a custom widget that is not installed
        // containers go on the dashboard, or into a floating container; floating containers on the dashboard only
        const tgt = (o.targets || []).find((t) => t.value === (o.target || ''));
        if (T.isContainer && o.target && o.target !== '' && !((k === 'container' || k === 'tabs') && tgt && tgt.floating)) return false;
        if (T.isFloating && o.noFloating) return false;
        return true;
      });
      const allowed = allowedNow();
      const colls = reg.collections ? reg.collections() : [];
      const count = (id) => allowed.filter(([, T]) => T.collection === id).length;
      if (pick.collection !== 'all' && !colls.some((c) => c.id === pick.collection)) pick.collection = 'all';
      const sel = (label, k, kids) => h('label', { class: 'ecfg-filter' }, [h('span', { text: label }), h('select', { 'aria-label': `${label} filter`, 'data-filter': k }, kids)]);
      const collSel = sel('Collection', 'collection', [h('option', { value: 'all', text: 'All' }),
        ...colls.map((c) => h('option', { value: c.id, text: `${c.name} (${count(c.id)})`, title: c.description || null }))]);
      const catSel = sel('Category', 'category', []);
      const search = h('input', { type: 'search', class: 'ecfg-search', placeholder: 'Search widgets…', 'aria-label': 'Search widget types', value: pick.q });
      const cSel = collSel.querySelector('select'), kSel = catSel.querySelector('select');
      cSel.value = pick.collection;
      let org = cleanOrg(o.gallery && o.gallery.get ? o.gallery.get() : null);
      const hiddenSet = () => new Set(org.hidden);
      const builtinCat = (T) => T.category || 'custom';
      /** the category a widget is listed under: the user's (when moved), else its own */
      const catOf = (k, T) => (org.assign[k] && org.categories.some((c) => c.id === org.assign[k]) ? org.assign[k] : builtinCat(T));
      const order = Object.keys(reg.CATEGORIES || {});
      // the user's categories first (in their order), then the built-in ones, "Custom" last; "Not wanted" at the very end
      const rank = (id) => (id === '_hidden' ? 2e3 : /^u-/.test(id) ? -100 + Math.max(0, org.categories.findIndex((c) => c.id === id)) : id === 'custom' ? 1e3 : order.includes(id) ? order.indexOf(id) : 500);
      const label = (id) => (id === '_hidden' ? 'Not wanted' : /^u-/.test(id) ? ((org.categories.find((c) => c.id === id) || {}).name || id) : reg.categoryLabel ? reg.categoryLabel(id) : id);
      const status = h('span', { class: 'ecfg-orgstatus', role: 'status', 'data-k': 'org-status' });
      /** keep the arrangement: the server (or this browser), then redraw */
      const save = (why) => {
        org = cleanOrg(org);
        fill(); cats();
        if (!(o.gallery && o.gallery.set)) { status.textContent = 'Not saved (no storage)'; return; }
        status.textContent = 'Saving…';
        Promise.resolve(o.gallery.set(org)).then((r) => { status.textContent = r === false || (r && r.ok === false) ? 'Could not save the arrangement' : `Saved · ${why}`; }, () => { status.textContent = 'Could not save the arrangement'; });
      };
      const newId = () => `u-${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
      const askName = (q, v = '') => { const n = (global.prompt ? global.prompt(q, v) : '') || ''; const t = n.trim().replace(/[<>]/g, '').slice(0, 40); return t || null; };
      const moveTo = (k, dest) => {
        if (dest === '__new') { const name = askName('Name of the new category'); if (!name) { fill(); return; } const id = newId(); org.categories.push({ id, name }); dest = id; }
        org.hidden = org.hidden.filter((x) => x !== k);
        if (dest === '_hidden') { org.hidden.push(k); delete org.assign[k]; }
        else if (/^u-/.test(dest)) org.assign[k] = dest;
        else delete org.assign[k];                                  // back to its own category
        save('moved');
      };
      /** the plain-text list of the arrangement (export / clipboard): every category with its widgets, then the ones not wanted */
      const exportText = () => {
        const byCat = {};
        allowed.forEach(([k, T]) => { const c = hiddenSet().has(k) ? '_hidden' : catOf(k, T); (byCat[c] ||= []).push(`${T.label} (${k})`); });
        return Object.keys(byCat).sort((x, y) => rank(x) - rank(y) || label(x).localeCompare(label(y)))
          .map((c) => `## ${label(c)}${/^u-/.test(c) ? ' (my category)' : ''}\n${byCat[c].sort().map((x) => `- ${x}`).join('\n')}`).join('\n\n');
      };
      const download = () => {
        const data = { kind: 'iniqdash-widget-arrangement', version: 1, exported: new Date().toISOString(), arrangement: org,
          widgets: allowed.map(([k, T]) => ({ key: k, name: T.label, category: hiddenSet().has(k) ? 'Not wanted' : label(catOf(k, T)), builtInCategory: label(builtinCat(T)) })) };
        const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })), download: 'iniqdash-widget-arrangement.json' });
        document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        if (navigator.clipboard) navigator.clipboard.writeText(exportText()).then(() => { status.textContent = 'Downloaded · the list is also on the clipboard'; }, () => {});
      };
      const orgBtn = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'org-toggle', 'aria-pressed': String(ui.organise), onclick: () => { ui.organise = !ui.organise; orgBtn.setAttribute('aria-pressed', String(ui.organise)); orgBar.hidden = !ui.organise; fill(); } }, h('span', { text: 'Organise' }));
      const hidBtn = h('button', { type: 'button', class: 'ed-btn', 'data-k': 'org-hidden', 'aria-pressed': String(ui.showHidden), onclick: () => { ui.showHidden = !ui.showHidden; hidBtn.setAttribute('aria-pressed', String(ui.showHidden)); fill(); } }, h('span', { 'data-k': 'org-hidden-label' }));
      const orgBar = h('div', { class: 'ecfg-orgbar', hidden: !ui.organise, 'data-k': 'org-bar' }, [
        h('p', { class: 'ed-hint', text: 'Move widgets into your own categories, or mark the ones you do not want ("Not wanted" hides them from this list — nothing is deleted). Export gives the list, so unwanted widgets can be cleaned up later.' }),
        h('div', { class: 'ecfg-orgbar__row' }, [
          h('button', { type: 'button', class: 'ed-btn ed-btn--primary', 'data-k': 'org-new', onclick: () => { const name = askName('Name of the new category'); if (!name) return; org.categories.push({ id: newId(), name }); save(`category "${name}" added`); } }, h('span', { text: 'New category' })),
          hidBtn,
          h('button', { type: 'button', class: 'ed-btn', 'data-k': 'org-export', onclick: download }, h('span', { text: 'Export list' })),
          h('button', { type: 'button', class: 'ed-btn ed-btn--ghost', 'data-k': 'org-reset', onclick: () => { if (global.confirm && !global.confirm('Put every widget back in its own category and show the hidden ones again?')) return; org = ORG0(); save('reset'); } }, h('span', { text: 'Reset' })),
          status,
        ]),
      ]);
      // the category choices: those present in the selected collection (derived from the loaded registry)
      const cats = () => {
        const ids = [...new Set(allowed.filter(([k, T]) => (pick.collection === 'all' || T.collection === pick.collection) && !hiddenSet().has(k)).map(([k, T]) => catOf(k, T)))];
        org.categories.forEach((c) => { if (!ids.includes(c.id)) ids.push(c.id); });
        ids.sort((x, y) => rank(x) - rank(y) || label(x).localeCompare(label(y)));
        if (pick.category !== 'all' && !ids.includes(pick.category)) pick.category = 'all';
        kSel.replaceChildren(h('option', { value: 'all', text: 'All' }), ...ids.map((id) => h('option', { value: id, text: label(id) })));
        kSel.value = pick.category;
      };
      const list = h('div', { class: 'ecfg-types' });
      /* THUMBNAILS: each tile shows the REAL widget (drawWidget — the same drawing as the Live preview) at its default size with the
         type's own demo configuration, in the dashboard's active theme; drawn only when the tile scrolls into view, never with an entity
         (no Home Assistant request or subscription), inert (a picture: no control answers). Removed with the gallery. */
      const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); drawThumb(e.target); } }), { rootMargin: '160px' }) : null;
      function thumbOf(k) { const b = h('span', { class: 'ecfg-tile__pv', 'aria-hidden': 'true', 'data-k': 'tile-preview' }); b.dataset.for = k;
        // a thumbnail is a picture drawn once while the gallery is open: the ACTIVE theme is put on it once (the same values a scope gets),
        // without registering a scope — hundreds of tiles never stay attached to the theme layer after the gallery closes
        if (global.MaisonTheme) global.MaisonTheme.apply(b, global.MaisonTheme.activeTheme()); if (io) io.observe(b); else drawThumb(b); return b; }
      function drawThumb(b) {
        const k = b.dataset.for; if (!b.isConnected) return;
        const ent = k.startsWith('my:') ? (reg.library ? reg.library() : []).map(([, T]) => T).find((T) => `my:${T.instance.config.definition}` === k) : null;
        const t = ent ? ent.instance.type : k; if (!reg.TYPES[t]) return;
        // a thumbnail is a PICTURE: the real renderer draws it once; once laid out it is swapped for a STATIC copy and the live widget
        // is let go — with any timer it started (a clock, a progress tick): nothing keeps running, nothing outlives the gallery
        const timers = [], si = global.setInterval;              // only the widget's own repeating timers (a clock, a tick)
        let v = null;
        try {
          const cfg = reg.fullConfig(t, ent ? ent.instance.config : {});
          if (cfg.entity) delete cfg.entity;                         // a picture: never linked
          global.setInterval = function (...a) { const id = si.apply(this, a); timers.push(id); return id; };
          v = drawWidget(t, cfg, defaultShape(t, cfg), b.clientWidth || 200, b.clientHeight || 96, { scope: false });
        } catch (e) { v = null; } finally { global.setInterval = si; }
        if (!v) return;                                              // no thumbnail: the glyph stays
        v.el.inert = true; v.el.classList.add('ecfg-tile__box');
        b.replaceChildren(v.el);
        // let the live widget go: its timers stop, and the shared fit layer no longer watches it (the static copy needs neither)
        const stop = () => { timers.forEach((id) => clearInterval(id)); if (global.MaisonFit) [v.el, ...v.el.querySelectorAll('*')].forEach((n) => global.MaisonFit.unobserve(n)); };
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (b.isConnected && v.el.isConnected) { const still = v.el.cloneNode(true); still.inert = true; v.el.replaceWith(still); b.dataset.drawn = ''; }
          stop();
        }));
      }
      const fill = () => {
        if (io) io.disconnect();                                     // the tiles of a previous filter are not watched any more
        const q = pick.q.trim().toLowerCase();
        list.replaceChildren();
        const groups = {}, hid = hiddenSet();
        const nHidden = allowed.filter(([k]) => hid.has(k)).length;
        hidBtn.querySelector('[data-k=org-hidden-label]').textContent = `${ui.showHidden ? 'Hide' : 'Show'} not wanted (${nHidden})`;
        allowed.forEach(([k, T]) => {
          if (pick.collection !== 'all' && T.collection !== pick.collection) return;
          const g = hid.has(k) ? '_hidden' : catOf(k, T);
          if (g === '_hidden' && !ui.showHidden) return;
          if (pick.category !== 'all' && g !== pick.category) return;
          // search: name, description, category, collection and the type's search tags (variants are presentations: never separate tiles)
          if (q && !`${T.label} ${T.description} ${T.group} ${label(g)} ${(T.tags || []).join(' ')} ${reg.collectionName ? reg.collectionName(T.collection) : ''}`.toLowerCase().includes(q)) return;
          (groups[g] ||= []).push([k, T]);
        });
        // organising: the user's empty categories are shown too (somewhere to move widgets to)
        if (ui.organise && pick.category === 'all' && !q) org.categories.forEach((c) => { groups[c.id] ||= []; });
        /** organise mode: the tile's "Move to" choice */
        const mover = (k, T) => {
          const cur = hid.has(k) ? '_hidden' : org.assign[k] || '';
          const sel = h('select', { class: 'ecfg-move', 'aria-label': `Move ${T.label} to`, 'data-k': 'org-move', 'data-for': k, onchange: () => moveTo(k, sel.value) }, [
            h('option', { value: '', text: `${label(builtinCat(T))} (its own)` }),
            ...org.categories.map((c) => h('option', { value: c.id, text: c.name })),
            h('option', { value: '__new', text: 'New category…' }),
            h('option', { value: '_hidden', text: 'Not wanted' }),
          ]);
          sel.value = cur;
          return h('label', { class: 'ecfg-tile__move' }, [h('span', { text: 'Move to' }), sel]);
        };
        /** organise mode: a heading of one of the user's categories can be renamed or deleted (its widgets go back to their own) */
        const headTools = (g) => (!ui.organise || !/^u-/.test(g) ? [] : [
          h('button', { type: 'button', class: 'ed-btn ed-btn--ghost ecfg-tgroup__b', 'data-k': 'org-rename', 'data-cat': g, onclick: () => { const c = org.categories.find((x) => x.id === g); const n = c && askName('New name of the category', c.name); if (!n) return; c.name = n; save('renamed'); } }, h('span', { text: 'Rename' })),
          h('button', { type: 'button', class: 'ed-btn ed-btn--ghost ecfg-tgroup__b', 'data-k': 'org-delete', 'data-cat': g, onclick: () => { org.categories = org.categories.filter((x) => x.id !== g); Object.keys(org.assign).forEach((k) => { if (org.assign[k] === g) delete org.assign[k]; }); save('category removed'); } }, h('span', { text: 'Delete category' })),
        ]);
        Object.keys(groups).sort((x, y) => rank(x) - rank(y) || label(x).localeCompare(label(y))).forEach((g) => list.append(h('section', { class: `ecfg-tgroup${/^u-/.test(g) ? ' ecfg-tgroup--mine' : ''}${g === '_hidden' ? ' ecfg-tgroup--hidden' : ''}`, 'data-category': g }, [
          h('div', { class: 'ecfg-tgroup__head' }, [h('h4', { class: 'ed-sub', text: `${label(g)}${ui.organise ? ` · ${groups[g].length}` : ''}` }), ...headTools(g)]),
          !groups[g].length ? h('p', { class: 'ed-hint ecfg-tgroup__empty', text: 'Empty — move widgets here with "Move to".' }) : null,
          h('div', { class: 'ecfg-tiles' }, groups[g].map(([k, T]) => {
            const kids = [thumbOf(k), tileGlyph(T), h('span', { class: 'ecfg-tile__t' }, [h('b', { text: T.label }), h('small', { text: T.description }),
              // which collection a custom widget comes from — only while all collections are shown
              ...(pick.collection === 'all' && (T.custom || T.instance) && reg.collectionName ? [h('span', { class: 'ecfg-tile__coll', text: reg.collectionName(T.collection) })] : [])])];
            // organising: a tile is not a button (it holds its own "Move to" control); adding a widget waits until organising ends
            return ui.organise ? h('div', { class: 'ecfg-tile ecfg-tile--org', 'data-type': k, 'data-collection': T.collection || '' }, [...kids, mover(k, T)])
              : h('button', { type: 'button', class: 'ecfg-tile', 'data-type': k, 'data-collection': T.collection || '', onclick: () => choose(k) }, kids);
          })),
        ])));
        if (!list.children.length) {
          // no result: say which filters are active and offer the way back to everything
          const on = [pick.collection !== 'all' && colls.find((c) => c.id === pick.collection)?.name, pick.category !== 'all' && label(pick.category), pick.q.trim() && `“${pick.q.trim()}”`].filter(Boolean);
          list.append(h('div', { class: 'ecfg-none' }, [
            h('p', { class: 'ed-hint', text: `No widget matches ${on.length ? on.join(' + ') : 'these filters'}.` }),
            h('button', { type: 'button', class: 'ed-btn', 'data-k': 'clear-filters', onclick: () => { pick.collection = 'all'; pick.category = 'all'; pick.q = ''; cSel.value = 'all'; search.value = ''; cats(); fill(); search.focus(); } }, h('span', { text: 'Show all widgets' })),
          ]));
        }
      };
      cSel.addEventListener('change', () => { pick.collection = cSel.value; cats(); fill(); });
      kSel.addEventListener('change', () => { pick.category = kSel.value; fill(); });
      search.addEventListener('input', () => { pick.q = search.value; fill(); });
      cats();
      fill();
      // closing the gallery lets its thumbnails go at once (a closed dialog the browser still holds on to carries no widget with it)
      dlg.addEventListener('close', () => { if (io) io.disconnect(); list.querySelectorAll('.ecfg-tile__pv').forEach((b) => b.replaceChildren()); }, { once: true });
      // MANAGE WIDGETS: the user's collections and Widget Studio widgets (rename, delete, move, delete several) — the gallery is redrawn after
      const manageBtn = global.IniqWidgetManager && document.querySelector('meta[name="iniqdash-server"]') ? h('button', { type: 'button', class: 'ed-btn', 'data-k': 'manage-widgets',
        onclick: () => global.IniqWidgetManager.open({ mount: o.mount, onChange: () => { if (step === 1 && dlg.open) render(); } }) }, h('span', { text: 'Manage widgets' })) : null;
      body.append(h('div', { class: 'ecfg-filters' }, [collSel, catSel, search, ...(o.gallery ? [orgBtn] : []), manageBtn]), ...(o.gallery ? [orgBar] : []), list);
      foot.append(btn('Cancel', '', () => close(true)));
      setTimeout(() => search.focus(), 0);
    }
    function choose(k) {
      // a MY WIDGETS entry adds an INSTANCE of its definition (a "studio" item that references it); anything else is a type
      entry = null;
      if (k.startsWith('my:')) { entry = (reg.library ? reg.library() : []).map(([, T]) => T).find((T) => `my:${T.instance.config.definition}` === k) || null; if (!entry) return; }
      type = entry ? entry.instance.type : k;
      draft = reg.fullConfig(type, entry ? entry.instance.config : {});
      form = null; step = 2;
      render();
    }

    /* ---- step 2: schema form + live preview ---- */
    function renderConfigure() {
      if (!form) {
        draft = draft || structuredClone(o.config);
        // previewer: the item editors (a modal over this dialog) draw THIS preview of the configuration as they edit it — the same widget
        // renderer, the same size — so a change is seen inside the editor itself
        form = reg.TYPES[type] && global.MaisonForm.create({ type, config: draft, previewer: (c, avail, maxH) => widgetView(c, avail, maxH),
          onChange: (c) => { draft = c; followVariant(); schedule(); if (o.onPreview) o.onPreview(c); } });
        draft = form.value();
        pv0.variant = reg.variantOf(type, draft); pv0.mode = variantShape() ? 'variant' : 'actual';
      }
      const pv = h('div', { class: 'ecfg-pv' });
      const stage = h('div', { class: 'ecfg-pv__stage' });
      if (global.MaisonTheme) global.MaisonTheme.scope(pv);      // the preview's backdrop is the dashboard's page colour
      const note = h('p', { class: 'ecfg-pv__note' });
      // the preview size (editor only): the variant's representative shape · the widget's own size · any W × H to try
      let size = null;
      if (hasVariantPreviews()) {
        const mode = h('select', { class: 'ecfg-pv__mode', 'data-k': 'pv-size', 'aria-label': 'Preview size', onchange: () => { pv0.mode = mode.value; if (pv0.mode === 'custom') pv0.custom = { w: +wIn.value, h: +hIn.value }; schedule(); } }, [
          h('option', { value: 'variant', text: 'Variant preview' }), h('option', { value: 'actual', text: o.mode === 'edit' ? 'This widget’s size' : 'Default size' }), h('option', { value: 'custom', text: 'Custom size' })]);
        const num = (k, label, max) => h('input', { type: 'number', class: 'ecfg-pv__n', 'data-k': k, min: '1', max: String(max), step: '1', 'aria-label': label,
          oninput: () => { const w = Math.round(+wIn.value), r = Math.round(+hIn.value); if (w >= 1 && r >= 1) { pv0.mode = 'custom'; pv0.custom = { w: Math.min(w, gridOf().cols), h: Math.min(r, 30) }; schedule(); } } });
        const wIn = num('pv-w', 'Preview width (grid columns)', gridOf().cols), hIn = num('pv-h', 'Preview height (grid rows)', 30);
        size = { mode, wIn, hIn };
      }
      pv.append(h('div', { class: 'ecfg-pv__head' }, [h('span', { class: 'ed-sub', text: 'Live preview' }),
        ...(size ? [h('span', { class: 'ecfg-pv__size' }, [size.mode, size.wIn, h('span', { class: 'ecfg-pv__x', text: '×' }), size.hIn])] : [])]), stage, note);
      body.append(h('div', { class: 'ecfg-split' }, [h('div', { class: 'ecfg-form' }, form.el), pv]));
      previewEls = { stage, note, size };
      draw();
      if (o.mode === 'edit') foot.append(btn('Cancel', '', () => close(true)), btn('Apply', 'ed-btn--primary', apply));
      else foot.append(btn('Back', '', () => { step = 1; render(); }), btn('Next: placement', 'ed-btn--primary', () => { const e = form.errors(); if (e.length) { form.showErrors(e); return; } step = 3; render(); }));
    }
    let previewEls = null, raf = 0;
    const pv0 = { mode: 'actual', custom: null, variant: null };      // the preview size (editor state only — never the widget's)
    const gridOf = () => { const g = o.grid || {}; return { cols: g.cols || 12, colStep: g.colStep || COL, rowStep: g.rowStep || 56, gap: g.gap ?? GAP, rgap: g.rgap ?? GAP }; };
    const hasVariantPreviews = () => { const T = reg.TYPES[type]; return !!(T && Array.isArray(T.variants) && T.variants.some((v) => v.preview) && reg.variantPreview); };
    const variantShape = () => (hasVariantPreviews() ? reg.variantPreview(type, draft) : null);
    /** a variant switch shows the new variant in its representative shape (the owner's own size choice before it gives way) */
    function followVariant() {
      const v = reg.variantOf(type, draft);
      if (v !== pv0.variant) { pv0.variant = v; if (variantShape()) pv0.mode = 'variant'; }
    }
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
    const unit = (v) => (v && typeof v === 'object' ? v.desktop : v) || 1;
    /** the preview's grid units + its LOGICAL px. Editing: the item's real px (any breakpoint, any grid — what MaisonFit sees on the
        canvas). Adding: the type's own default size, raised to the widget's minimum. There is no size choice: the widget's own box decides. */
    function shapeOf() {
      const T = reg.TYPES[type], g = gridOf();
      const units = (w, rows, kind) => ({ w, h: rows, px: w * g.colStep - g.gap, hpx: rows * g.rowStep - g.rgap, kind });
      const ref = pv0.mode === 'variant' ? variantShape() : null;
      if (ref) {   // the reference shape in THIS grid's units: about the same logical px, never wider than the grid
        return units(Math.max(1, Math.min(g.cols, Math.round((ref.w * REF_COL - GAP + g.gap) / g.colStep))), ref.h, 'variant');
      }
      if (pv0.mode === 'custom' && pv0.custom) return units(pv0.custom.w, pv0.custom.h, 'custom');
      if (o.size) {
        const p = o.size.px || {};
        return { w: o.size.w, h: o.size.h, px: p.w || o.size.w * COL - GAP, hpx: p.h || o.size.h * 40 + (o.size.h - 1) * GAP };
      }
      return defaultShape(type, draft);
    }
    /** the real component at its LOGICAL size (width AND height in px: MaisonFit / container queries respond exactly as on
        the canvas); only when that is wider than the pane is the box scaled down for display — presentation only. */
    /** ONE drawing of the widget for a configuration: the real component (the registry's renderer) at the preview's LOGICAL size, scaled
        down only for display (to `avail` px wide, `maxH` px high) — the Live preview, and the item editors' preview of the same configuration */
    function widgetView(config, avail, maxH = Infinity) { return drawWidget(type, config, shapeOf(), avail, maxH); }
    /** ONE DRAWING of a widget type for a configuration, at a logical size z ({ px, hpx }) scaled down to fit avail × maxH: the real
        renderer (registry instantiate, preview-safe configuration), in the dashboard's active theme. The Live preview, the item editors'
        preview and the gallery's thumbnails all draw through it. */
    function drawWidget(t, config, z, avail, maxH = Infinity, { scope = true } = {}) {
      const T = reg.TYPES[t], px = z.px, hpx = z.hpx;
      let node;
      try {
        const safe = reg.previewSafe(t, config);
        node = T.isContainer ? reg.instantiate(t, safe, h('div', { class: 'ecfg-pv__slot', text: 'Items in this container' })) : reg.instantiate(t, safe);
      } catch (err) { node = h('p', { class: 'ed-hint', text: 'Preview unavailable for this configuration.' }); }
      const box = h('div', { class: 'ecfg-pv__box' }, node);
      if (global.MaisonTheme && scope) global.MaisonTheme.scope(box);     // the dashboard's active theme (the one authority — components/theme)
      Object.assign(box.style, { width: `${px}px`, height: `${hpx}px` });
      const s = Math.min(1, Math.max(0.05, avail) / px, maxH / hpx);
      box.style.transform = s < 1 ? `scale(${s})` : '';
      return { el: box, height: hpx * s, scale: s, z };
    }
    /** a type's DEFAULT size for a configuration: its own size, raised to its minimum (adding — and the gallery's thumbnails) */
    function defaultShape(t, cfg) {
      const T = reg.TYPES[t], safe = reg.previewSafe(t, cfg), want = T.size || { w: 4, h: 4 };
      const c0 = T.constraints ? T.constraints(safe, want.w * COL - GAP) : {};
      const w = Math.max(want.w, unit(c0.minW));
      const c = T.constraints ? T.constraints(safe, w * COL - GAP) : {};
      const rows = Math.max(want.h, unit(c.minH));
      return { w, h: rows, px: w * COL - GAP, hpx: rows * 40 + (rows - 1) * GAP, raised: rows > want.h || w > want.w };
    }
    function draw() {
      if (!previewEls || !previewEls.stage.isConnected) return;
      const v = widgetView(draft, previewEls.stage.clientWidth - 2), z = v.z, w = z.w, rows = z.h, px = z.px, hpx = z.hpx, s = v.scale;
      previewEls.stage.replaceChildren(v.el);
      previewEls.stage.style.height = `${hpx * s + 2}px`;
      previewEls.note.textContent = `${w} × ${rows} grid units · ${Math.round(px)} × ${Math.round(hpx)} px${s < 1 ? ` · shown at ${Math.round(s * 100)}%` : ''}${z.raised ? ' · this widget’s minimum' : ''}`
        + (z.kind && o.mode === 'edit' ? ' · preview only: the widget keeps its size on the dashboard' : '');
      const sz = previewEls.size;
      if (sz) {
        sz.mode.value = z.kind || 'actual';
        sz.mode.querySelector('option[value="variant"]').disabled = !variantShape();
        if (document.activeElement !== sz.wIn) sz.wIn.value = String(w);
        if (document.activeElement !== sz.hIn) sz.hIn.value = String(rows);
        previewEls.stage.dataset.previewKind = z.kind || 'actual';
      }
    }
    new ResizeObserver(() => schedule()).observe(body);

    /* ---- step 3: placement ---- */
    function renderPlace() {
      const T = reg.TYPES[type];
      const opts = (o.targets || []).filter((t) => !T.isContainer || t.value === '' || (t.floating && !T.isFloating));   // a container may go into a floating container
      const sel = h('select', { id: 'ecfg-target' }, opts.map((t) => h('option', { value: t.value, text: t.label, selected: t.value === (T.isFloating ? '' : (o.target || '')) })));
      body.append(
        h('label', { class: 'ed-field', for: 'ecfg-target' }, [h('span', { text: 'Add to' }), sel]),
        h('p', { class: 'ed-hint', text: T.isFloating ? 'A floating container sits on the dashboard grid; its items are placed to the pixel.' : T.isContainer ? 'Containers sit on the dashboard grid, or inside a floating container.' : 'It is placed at the first free position of that grid, at its default size (or its minimum, when larger). You can move and resize it afterwards.' }),
        h('div', { class: 'ecfg-sum' }, [tileGlyph(entry || T), h('span', { text: entry ? entry.label : `${T.label} · ${draft.name || draft.title || draft.location || ''}` })]),
      );
      foot.append(btn('Back', '', () => { step = 2; render(); }), btn(`Add ${(entry || T).label}`, 'ed-btn--primary ecfg-add', () => { close(false); o.onApply({ type, config: draft, target: sel.value || null }); }));
      setTimeout(() => sel.focus(), 0);
    }

    function apply() {
      const e = form.errors();
      if (e.length) { form.showErrors(e); return; }
      close(false);
      o.onApply({ type, config: form.value() });
    }

    if (o.mode === 'edit') { draft = structuredClone(o.config); }
    render();
    return dlg;
  }

  global.MaisonConfigure = { open, modal, guard };
})(window);
