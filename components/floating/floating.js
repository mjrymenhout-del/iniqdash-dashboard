/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Free surface V1 — precise (pixel) placement for the Floating Container and for popups.
   The dashboard itself stays on MaisonGrid; a free surface is a LOCAL design area.

   MaisonFree.resolve(items, key, width) → Map(id → { x, y, w, h })   (px, relative to the surface)
     items = [{ id, frame?, layout? }]   frame = { desktop?, tablet?, mobile? } — whole px
     A breakpoint without its own frame borrows one, deterministically (never stored until edited):
       tablet ← desktop (pulled inside the width) · desktop ← tablet · mobile ← a vertical stack
       (full width, in item order) · nothing at all ← a stack sized from the item's grid layout.
   MaisonFree.surface({ key, items: [{ id, frame, node, cols? }], width? }) → HTMLElement (.mf)
     each child sits in a .mf__item (data-grid-id) at left/top/width/height = its frame. A child that is
     a container gets --d-w / --t-w / --m-w = its width in columns, so its nested grid (MaisonGrid
     inherit + bp) has a sensible column count.
     el.free = { key, frames: Map, place(id, frame) }
   MaisonFree.bounds(frames) → { w, h }   the area the frames occupy (Fit Content popups)
   MaisonFree.colsFor(px) → columns for a container that is px wide
   MaisonFree.overlap(a, b)   true when two frames overlap (touching edges is allowed)
   ========================================================================== */
(function (global) {
  'use strict';

  const GAP = 12, COL = 96;
  const int = (v) => Math.round(Number(v) || 0);
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const colsFor = (px) => Math.max(1, Math.min(12, Math.round((px + GAP) / COL)));
  /** a frame sized from the item's grid layout (first time an item lands on a free surface) */
  function fromLayout(it, key) {
    const L = (it.layout && (it.layout[key] || it.layout.desktop || it.layout.tablet || it.layout.mobile)) || { w: 4, h: 4 };
    return { w: Math.max(40, int((L.w || 4) * COL - GAP)), h: Math.max(40, int((L.h || 4) * 52 - GAP)) };
  }

  function resolve(items, key, width) {
    const out = new Map();
    const W = Math.max(80, int(width) || 1200);
    let stackY = 0;
    const stack = (size) => { const f = { x: 0, y: stackY, w: Math.min(W, size.w), h: size.h }; stackY += size.h + GAP; return f; };
    items.forEach((it) => {
      const F = it.frame || {};
      let f = F[key];
      if (f) f = { ...f };
      else if (key === 'tablet' && F.desktop) f = { ...F.desktop };
      else if (key === 'desktop' && F.tablet) f = { ...F.tablet };
      else if (key === 'mobile') f = stack(F.desktop || F.tablet || fromLayout(it, 'mobile'));
      else f = stack(fromLayout(it, key));
      if (!(F[key])) {                     // a borrowed frame is pulled inside the surface width
        f.w = Math.min(f.w, W); f.x = Math.max(0, Math.min(f.x, W - f.w));
      }
      out.set(it.id, { x: int(f.x), y: int(f.y), w: Math.max(8, int(f.w)), h: Math.max(8, int(f.h)) });
    });
    return out;
  }

  function bounds(frames) {
    let w = 0, h = 0;
    frames.forEach((f) => { w = Math.max(w, f.x + f.w); h = Math.max(h, f.y + f.h); });
    return { w, h };
  }

  function setVars(el, f) {
    Object.assign(el.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
    const c = colsFor(f.w);
    ['d', 't', 'm'].forEach((k) => el.style.setProperty(`--${k}-w`, String(c)));
  }

  function surface({ key, items = [], width } = {}) {
    const root = document.createElement('div');
    root.className = 'mf';
    root.dataset.bp = key;
    const frames = resolve(items, key, width);
    items.forEach((it) => {
      const el = document.createElement('div');
      el.className = 'mf__item';
      el.dataset.gridId = it.id;
      setVars(el, frames.get(it.id));
      if (it.node) el.append(it.node);
      root.append(el);
    });
    const b = bounds(frames);
    root.style.setProperty('--mf-content-h', `${b.h}px`);
    root.free = {
      key, frames,
      place(id, f) {
        const el = root.querySelector(`:scope > .mf__item[data-grid-id="${CSS.escape(id)}"]`);
        if (!el) return;
        frames.set(id, { ...f }); setVars(el, f);
        root.style.setProperty('--mf-content-h', `${bounds(frames).h}px`);
      },
    };
    return root;
  }

  global.MaisonFree = { resolve, surface, bounds, overlap, colsFor, GAP };
})(window);
