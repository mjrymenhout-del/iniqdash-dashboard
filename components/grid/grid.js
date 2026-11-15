/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Dashboard grid — placement model.

   MaisonGrid.create({ id, nested, inherit, items }) → HTMLElement (.mg)
     inherit (nested only, opt-in): the nested grid follows the PAGE breakpoint instead of its own width,
       and has as many columns as its container spans at that breakpoint (a 4-wide container → 4
       columns). Children are then placed with layout.desktop / .tablet / .mobile of the page. The
       widgets inside still respond to their own rendered width.
     bp (with inherit, opt-in): force the breakpoint ('desktop' | 'tablet' | 'mobile') when the grid has no
       parent grid to follow — a container placed on a free surface (Floating Container, popup). Its
       column count is still the span variables of the element that holds it.

   item = {
     id:      'climate',
     layout: {                                   // per breakpoint, 1-based grid units
       desktop: { x: 5, y: 1, w: 4, h: 6 },      // 12 columns
       tablet:  { x: 5, y: 1, w: 4, h: 7 },      //  8 columns
       mobile:  { w: 4, h: 5 },                  //  4 columns; x/y optional → reflow in order
     },
     constraints: {                              // optional; a number, or per breakpoint
       minW: { mobile: 4 }, minH: 3, maxW: …, maxH: …,
     },
     content: Node | containerConfig             // a widget node, or a MaisonContainer config
   }

   Rules applied by resolve():
   - a missing breakpoint borrows w/h from the nearest defined one and is auto-placed
     (desktop may also borrow tablet's x/y, which always fit in 12 columns);
     mobile without w takes the full 4 columns;
   - w is clamped to [minW, maxW] and to the column count; h to [minH, maxH]
     (minH is how a component reserves the height it needs — the grid's rows never stretch);
   - an x that would push the item past the last column is pulled back.

   Grid GEOMETRY (columns, row height, gap per breakpoint) is the legacy 12 / 8 / 4 columns, 40px rows and
   16 / 16 / 12px gaps, unless a page grid is created with a dashboard geometry (create({ geo })):
     geo = { desktop: { cols, row, gap }, tablet: {…}, mobile: {…} }   (complete; see LEGACY)
   Then that grid's CSS variables (--mgc-*, --mgr-*, --mgg-*) carry it, x / w clamp to its columns, and a
   component's minH / maxH — written in LEGACY rows (40px) — are converted to the grid's rows so the component
   keeps the same physical minimum height (rowsFor). A container's nested grid on such a page shares the page's ROWS and GAPS
   (create({ nested, spans, rows: geo }) — class mg--pagerows) and has as many columns as the container spans, so a widget keeps its
   height when it moves into or out of a container and the container's columns line up with the page's.

   Nothing here moves or resizes items interactively. The model (item.layout + constraints)
   is kept on each element (el.mgItem) so a future editor can read and rewrite it.
   ========================================================================== */
(function (global) {
  'use strict';

  const BREAKPOINTS = {
    desktop: { cols: 12, minWidth: 960, key: 'd' },
    tablet: { cols: 8, minWidth: 560, key: 't' },
    mobile: { cols: 4, minWidth: 0, key: 'm' },
  };
  /** the geometry every dashboard had before grids became configurable (and still has without app.grid) */
  const LEGACY = Object.freeze({
    desktop: Object.freeze({ cols: 12, row: 40, gap: 16 }),
    tablet: Object.freeze({ cols: 8, row: 40, gap: 16 }),
    mobile: Object.freeze({ cols: 4, row: 40, gap: 12 }),
  });
  /** a container's nested grid in the legacy geometry: 40px rows and the compact gap (--grid-gap-compact, 12px) at every breakpoint */
  const NESTED_LEGACY = Object.freeze(Object.fromEntries(Object.keys(LEGACY).map((bp) => [bp, Object.freeze({ ...LEGACY[bp], gap: 12 })])));
  /** the placement geometry of a container's nested grid: the container's span (columns) per breakpoint. rows (optional): the PAGE
      geometry whose row height and gap the nested grid shares (a dashboard grid — app.grid); without it the legacy nested rows. */
  function spanGeo(spans, rows) {
    return Object.fromEntries(Object.keys(BREAKPOINTS).map((bp) => { const n = Math.round(Number(spans && spans[bp]));
      const base = rows && rows[bp] ? { cols: LEGACY[bp].cols, row: rows[bp].row, gap: rows[bp].gap } : NESTED_LEGACY[bp];
      return [bp, { ...base, cols: Number.isFinite(n) && n >= 1 ? n : LEGACY[bp].cols }]; }));
  }
  /** map a span [start, start + size) of tracks with pitch `a` (px per track) onto tracks with pitch `b`, edge by edge (rounded): two
      items that did not overlap still do not, and an item keeps its place and size on screen as closely as the new tracks allow.
      start is 1-based. → { start, size } */
  function remap(start, size, a, b) {
    if (!(a > 0) || !(b > 0) || a === b) return { start, size };
    const s = Math.round((start - 1) * a / b), e = Math.round((start - 1 + size) * a / b);
    return { start: s + 1, size: Math.max(1, e - s) };
  }
  /** n rows of grid `from` (null = legacy) → the number of rows of grid `to` (null = legacy) that is at least as tall */
  function convertRows(n, bp, from, to) {
    const a = (from && from[bp]) || LEGACY[bp], b = (to && to[bp]) || LEGACY[bp];
    if (a.row === b.row && a.gap === b.gap) return n;
    const px = n * a.row + (n - 1) * a.gap;
    return Math.max(1, Math.ceil((px + b.gap) / (b.row + b.gap) - 1e-6));
  }
  /** a size written in legacy rows (component constraints, default sizes) → rows of the grid with geometry `geo`. A minimum is met
      to within a few px (at most 6px, and at most a tenth of it): 1 legacy row (40px) is 2 rows of a 10px / 18px-gap grid (38px), not 3
      (66px) — a strict round-up made every small widget a row taller than its layout and pushed it into its neighbour. */
  function rowsFor(n, bp, geo) {
    const b = (geo && geo[bp]) || LEGACY[bp], a = LEGACY[bp];
    if (a.row === b.row && a.gap === b.gap) return n;
    const px = n * a.row + (n - 1) * a.gap, slack = Math.min(6, px * 0.1);
    return Math.max(1, Math.ceil((px - slack + b.gap) / (b.row + b.gap) - 1e-6));
  }
  const FALLBACK = { desktop: ['tablet', 'mobile'], tablet: ['desktop', 'mobile'], mobile: ['tablet', 'desktop'] };

  const int = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(+v) ? undefined : Math.max(1, Math.round(+v)));
  const pick = (c, bp) => (c && typeof c === 'object' ? int(c[bp]) : int(c));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** Resolve one item's placement at one breakpoint → { x, y, w, h } (x/y undefined = auto).
      geo: the grid's dashboard geometry (null / undefined = legacy) */
  function resolve(item, bp, geo) {
    const cols = (geo && geo[bp] && geo[bp].cols) || BREAKPOINTS[bp].cols;
    const L = item.layout || {};
    const own = L[bp];
    let src;
    if (own) src = { ...own };
    else {
      const from = FALLBACK[bp].find((k) => L[k]);
      const f = from ? L[from] : {};
      src = { w: f.w, h: f.h };
      if (bp === 'desktop' && from === 'tablet') { src.x = f.x; src.y = f.y; }
    }
    const c = item.constraints || {};
    const minW = pick(c.minW, bp) || 1;
    const maxW = Math.min(pick(c.maxW, bp) || cols, cols);
    // constraints are written in legacy rows; an unset minimum stays 1 row of this grid
    const minH = pick(c.minH, bp) ? rowsFor(pick(c.minH, bp), bp, geo) : 1;
    const maxH = pick(c.maxH, bp) ? rowsFor(pick(c.maxH, bp), bp, geo) : Infinity;

    const w = clamp(int(src.w) || (bp === 'mobile' ? cols : Math.min(4, cols)), Math.min(minW, cols), maxW);
    const h = clamp(int(src.h) || rowsFor(4, bp, geo), minH, maxH);
    let x = int(src.x);
    if (x !== undefined) x = clamp(x, 1, cols - w + 1);
    const y = int(src.y);
    return { x, y, w, h };
  }

  /** Explicitly placed items that overlap at a breakpoint (auto-placed ones never overlap). */
  function collisions(items, bp, geo) {
    const placed = items.map((it) => ({ id: it.id, ...resolve(it, bp, geo) })).filter((r) => r.x && r.y);
    const out = [];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push([a.id, b.id]);
      }
    }
    return out;
  }

  function applyPlacement(el, item, geo) {
    Object.keys(BREAKPOINTS).forEach((bp) => {
      const k = BREAKPOINTS[bp].key;
      const r = resolve(item, bp, geo);
      el.style.setProperty(`--${k}-x`, r.x ?? 'auto');
      el.style.setProperty(`--${k}-y`, r.y ?? 'auto');
      el.style.setProperty(`--${k}-w`, r.w);
      el.style.setProperty(`--${k}-h`, r.h);
      // HIDDEN at this breakpoint (layout[bp].hide): the item is not shown at that screen size (it keeps its place elsewhere)
      el.toggleAttribute(`data-hide-${k}`, !!(item.layout && item.layout[bp] && item.layout[bp].hide === true));
    });
  }

  function createItem(item, geo) {
    const el = document.createElement('div');
    el.className = 'mg__item';
    if (item.id) el.dataset.gridId = item.id;
    el.mgItem = item;
    applyPlacement(el, item, geo);
    const c = item.content;
    if (c instanceof Node) el.appendChild(c);
    else if (c && typeof c === 'object' && global.MaisonContainer) el.appendChild(global.MaisonContainer.create({ ...c, fill: true }));
    return el;
  }

  function create(config = {}) {
    const root = document.createElement('div');
    root.className = 'mg' + (config.nested ? ' mg--nested' : '') + (config.nested && config.inherit ? ' mg--inherit' : '');
    if (config.nested && config.inherit && BREAKPOINTS[config.bp]) root.dataset.mgBp = config.bp;   // forced page breakpoint
    if (config.id) root.dataset.gridId = config.id;
    // a dashboard geometry (page grids only): CSS variables read by grid.css; none at all = the legacy grid
    const geo = !config.nested && config.geo ? config.geo : null;
    // a container's NESTED grid: its columns are the container's span at each breakpoint (the same value grid.css reads from --d-w /
    // --t-w / --m-w) — so a child placed at column 13 of a 16-column container stays there (never clamped to the legacy 12)
    // rows (nested only): the page geometry the nested grid shares — its rows and gaps follow the page grid (grid.css: .mg--pagerows)
    const place = geo || (config.nested && config.spans ? spanGeo(config.spans, config.rows) : null);
    if (place && !geo) root.mgGeo = place;
    if (config.nested && config.rows) root.classList.add('mg--pagerows');
    // ownRows: a nested grid OUTSIDE a page grid (a popup's container / tabbed container with app.grid.popups 'page') carries the
    // row and gap variables itself — there is no page grid above it to inherit them from
    if (config.nested && config.rows && config.ownRows) Object.keys(BREAKPOINTS).forEach((bp) => { const k = BREAKPOINTS[bp].key, g = config.rows[bp];
      if (g) { root.style.setProperty(`--mgr-${k}`, `${g.row}px`); root.style.setProperty(`--mgg-${k}`, `${g.gap}px`); } });
    if (geo) {
      root.mgGeo = geo;
      root.classList.add('mg--geo');
      Object.keys(BREAKPOINTS).forEach((bp) => {
        const k = BREAKPOINTS[bp].key, g = geo[bp];
        root.style.setProperty(`--mgc-${k}`, String(g.cols));
        root.style.setProperty(`--mgr-${k}`, `${g.row}px`);
        root.style.setProperty(`--mgg-${k}`, `${g.gap}px`);
        root.style.setProperty(`--mgp-${k}`, `${Number.isFinite(g.pad) ? g.pad : 0}px`);   // the page edge at this screen size
      });
    }
    const grid = document.createElement('div');
    grid.className = 'mg__grid';
    (config.items || []).forEach((it) => grid.appendChild(createItem(it, place)));
    root.appendChild(grid);
    root.mgItems = config.items || [];
    if (config.nested && typeof ResizeObserver !== 'undefined') autoHeight(root, grid);
    return root;
  }

  /** G3 · MOBILE AUTO HEIGHT: on a phone a container's children reflow (one under the other), so they need more rows than its desktop
      shape — the container's item GROWS to hold them (never shrinks below its own mobile height; other breakpoints keep their height). */
  function autoHeight(root, grid) {
    const fit = () => {
      const owner = root.closest('.mg__item'), host = owner && owner.parentElement && owner.parentElement.closest('.mg');
      if (!owner || !host || !owner.mgItem) return;
      const base = resolve(owner.mgItem, 'mobile', host.mgGeo || null).h;
      if (breakpointOf(host) !== 'mobile' || !grid.childElementCount) { if (owner.dataset.mgGrown) { owner.style.setProperty('--m-h', base); delete owner.dataset.mgGrown; } return; }
      const hs = getComputedStyle(owner.parentElement), row = parseFloat(hs.gridAutoRows) || 40, gap = parseFloat(hs.rowGap) || 0;
      const o = owner.getBoundingClientRect(), r = root.getBoundingClientRect(), g = grid.getBoundingClientRect();
      if (!o.height) return;
      const k = o.height / (owner.offsetHeight || o.height) || 1;                     // a scaled preview: measure in layout px
      const need = (r.top - o.top) / k + g.height / k + 16;                             // the chrome above the grid + its content + a bottom margin
      const rows = Math.max(base, Math.ceil((need + gap) / (row + gap) - 1e-6));
      if (String(rows) !== owner.style.getPropertyValue('--m-h').trim()) { owner.style.setProperty('--m-h', rows); if (rows > base) owner.dataset.mgGrown = ''; else delete owner.dataset.mgGrown; }
    };
    const ro = new ResizeObserver(() => { if (!root.isConnected) return; fit(); });
    ro.observe(grid);
  }

  /** Re-apply an item's placement after its layout changed (for a future editor). */
  function update(itemEl, patch) {
    itemEl.mgItem = { ...itemEl.mgItem, ...patch };
    const root = itemEl.parentElement && itemEl.parentElement.parentElement;     // .mg__item → .mg__grid → .mg
    applyPlacement(itemEl, itemEl.mgItem, (root && root.mgGeo) || null);
  }

  /** Which breakpoint a grid element is using now (same thresholds as grid.css).
      Uses the LAYOUT width (the size the container query sees), not the on-screen size, so a grid
      inside a CSS-transformed (scaled) preview still reports its real breakpoint. */
  function breakpointOf(gridRoot) {
    // an inheriting nested grid follows the PAGE breakpoint (its parent grid), not its own width;
    // one with a forced breakpoint (bp: no parent grid, e.g. on a free surface or in a popup) uses it
    if (gridRoot.classList.contains('mg--inherit') && BREAKPOINTS[gridRoot.dataset.mgBp]) return gridRoot.dataset.mgBp;
    if (gridRoot.classList.contains('mg--inherit')) { const up = gridRoot.parentElement && gridRoot.parentElement.closest('.mg'); if (up) return breakpointOf(up); }
    const w = parseFloat(getComputedStyle(gridRoot).width) || gridRoot.offsetWidth;
    return w >= BREAKPOINTS.desktop.minWidth ? 'desktop' : w >= BREAKPOINTS.tablet.minWidth ? 'tablet' : 'mobile';
  }

  global.MaisonGrid = { BREAKPOINTS, LEGACY, NESTED_LEGACY, remap, create, update, resolve, collisions, breakpointOf, rowsFor, convertRows, spanGeo };
})(window);
