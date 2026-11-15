/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   MaisonFit — widget responsiveness, driven by the widget's OWN box.

   Two kinds of responsiveness are kept apart on purpose:
     · SCREEN  — the dashboard against the viewport (MaisonGrid: 12/8/4 columns, breakpoints).
     · WIDGET  — a widget against the width × height it was given (this module).
   A widget never reads the screen breakpoint to decide how it looks: a 2-column widget on a
   desktop and a 2-column widget on a phone are both "small", and are drawn as such.

   MaisonFit.observe(root, options) → info
     root      the widget's root element. It must be a CSS size container (container-type: size)
               so that fit.css can derive the --fit scale from its box.
     options = {
       arrange(w, h, info) → string   optional: name of the internal arrangement for this box,
                                      written to data-fit-arr (e.g. 'mini' | 'dial' | 'panel')
       onChange(info, prev)           optional: called whenever a class or the arrangement changes
     }
   Per box it writes on the root (all read by CSS, and available to JS as root.fit):
     data-fit-w      xs < 160 ≤ s < 260 ≤ m < 400 ≤ l < 560 ≤ xl          (width class)
     data-fit-h      xs < 110 ≤ s < 170 ≤ m < 260 ≤ l < 380 ≤ xl          (height class)
     data-fit-shape  wide (w ≥ 1.6 h) · tall (w ≤ .75 h) · square
     data-fit-arr    the arrangement returned by options.arrange
     data-fit-tier   micro < 110 ≤ compact < 190 ≤ normal < 330 ≤ large      (by the SHORTER side)
     --fit-px-w / --fit-px-h   its own width / height in px (for calc() in descendants)
   and fires a 'fitchange' event (detail = info) on the root.
   Hysteresis: once a box has a class, the class only changes when the size is HYST (6 px) past the threshold
   (for the shape: 4 % of the ratio) — a resize handle resting on a boundary never makes a layout flicker.

   EVERY widget gets it: the registry calls MaisonFit.ensure(root) for each widget it creates (factory and custom). A
   widget that calls observe() itself (with its own arrange / onChange) keeps its options; ensure() never replaces them.
   MaisonFit.on(root, cb) → off      cb(info) now (when known) and on every class / shape / tier / arrangement change
   MaisonFit.ensure(root)            observe with no options unless already observed (idempotent)
   Roots that left the page are released by a periodic sweep (off the page on two sweeps in a row, 10 s apart) —
   no observer keeps a removed widget alive.

   Zoom independence: sizes come from ResizeObserver's border-box size, which is the LAYOUT size.
   CSS transforms (the editor's Fit / Zoom, scaled multi-preview cards) do not change it, so a
   widget laid out at 400 × 240 and shown at 70 % still measures — and looks — 400 × 240.
   (getBoundingClientRect would return the transformed size; it is never used here.)

   MaisonFit.classify(w, h) is the pure function behind it (used by tests and by the editor).
   ========================================================================== */
(function (global) {
  'use strict';

  const W_STEPS = [['xs', 160], ['s', 260], ['m', 400], ['l', 560]];
  const H_STEPS = [['xs', 110], ['s', 170], ['m', 260], ['l', 380]];
  const T_STEPS = [['micro', 110], ['compact', 190], ['normal', 330]];
  const HYST = 6;
  /** the class of v; with the previous class `cur`, a threshold only counts once v is `tol` past it (hysteresis) */
  const step = (v, steps, last = 'xl', cur = null, tol = 0) => {
    const names = [...steps.map(([k]) => k), last], cuts = steps.map(([, lim]) => lim);
    let i = cuts.findIndex((c) => v < c); if (i < 0) i = cuts.length;
    const j = cur ? names.indexOf(cur) : -1;
    if (j >= 0 && i > j && v < cuts[i - 1] + tol) i = Math.max(j, i - 1);
    if (j >= 0 && i < j && v >= cuts[i] - tol) i = Math.min(j, i + 1);
    return names[i];
  };
  const shapeOf = (r, cur, tol) => {
    const raw = r >= 1.6 ? 'wide' : r <= 0.75 ? 'tall' : 'square';
    if (!cur || raw === cur) return raw;
    if (cur === 'wide' && r >= 1.6 - tol) return 'wide';
    if (cur === 'tall' && r <= 0.75 + tol) return 'tall';
    if (cur === 'square' && r < 1.6 + tol && r > 0.75 - tol) return 'square';
    return raw;
  };

  /** pure: the classes of a w × h box (prev: the classes it had, for hysteresis) */
  function classify(w, h, prev = null) {
    const r = h > 0 ? w / h : 1, p = prev || {};
    return { w, h, wc: step(w, W_STEPS, 'xl', p.wc, prev ? HYST : 0), hc: step(h, H_STEPS, 'xl', p.hc, prev ? HYST : 0),
      shape: shapeOf(r, p.shape, prev ? 0.04 * r : 0), tier: step(Math.min(w, h), T_STEPS, 'large', p.tier, prev ? HYST : 0) };
  }

  const opts = new WeakMap();

  function apply(root, w, h) {
    if (!(w > 0 && h > 0)) return;                 // detached / display:none: keep the last known box
    w = Math.round(w); h = Math.round(h);
    const o = opts.get(root) || {};
    const prev = root.fit || null;
    const info = classify(w, h, prev);
    info.arr = o.arrange ? String(o.arrange(w, h, info) || '') : '';
    root.fit = info;
    const ds = root.dataset;
    if (ds.fitW !== info.wc) ds.fitW = info.wc;
    if (ds.fitH !== info.hc) ds.fitH = info.hc;
    if (ds.fitShape !== info.shape) ds.fitShape = info.shape;
    if (ds.fitTier !== info.tier) ds.fitTier = info.tier;
    if (info.arr) { if (ds.fitArr !== info.arr) ds.fitArr = info.arr; } else if ('fitArr' in ds) delete ds.fitArr;
    root.style.setProperty('--fit-px-w', `${w}px`); root.style.setProperty('--fit-px-h', `${h}px`);
    const changed = !prev || prev.wc !== info.wc || prev.hc !== info.hc || prev.shape !== info.shape || prev.tier !== info.tier || prev.arr !== info.arr;
    if (changed) {
      if (o.onChange) o.onChange(info, prev);
      (subs.get(root) || []).forEach((cb) => { try { cb(info, prev); } catch (err) { console.error(err); } });
      root.dispatchEvent(new CustomEvent('fitchange', { detail: info }));
    }
  }
  const subs = new Map();                          // root → Set<cb>   (MaisonFit.on)
  const watched = new Map();                       // root → { born, seen }  (released by sweep())

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
    for (const e of entries) {
      const b = e.borderBoxSize && e.borderBoxSize[0];
      // borderBoxSize / contentRect are layout sizes: unaffected by CSS transforms (editor zoom)
      apply(e.target, b ? b.inlineSize : e.target.offsetWidth, b ? b.blockSize : e.target.offsetHeight);
    }
  }) : null;

  let sweepT = 0;
  function sweep() {
    const now = Date.now();
    watched.forEach((rec, root) => {
      if (root.isConnected) { rec.seen = true; rec.miss = 0; return; }
      // released only after two sweeps in a row off the page (a widget moved between parents stays observed)
      if ((rec.seen || now - rec.born > 10000) && ++rec.miss >= 2) unobserve(root);
    });
    clearTimeout(sweepT);
    if (watched.size) sweepT = setTimeout(sweep, 10000);
  }
  function observe(root, options = {}) {
    opts.set(root, options);
    root.setAttribute('data-fit', '');            // fit.css hooks the --fit scale to [data-fit] > *
    if (ro) ro.observe(root, { box: 'border-box' });
    if (!watched.has(root)) { watched.set(root, { born: Date.now(), seen: root.isConnected, miss: 0 }); clearTimeout(sweepT); sweepT = setTimeout(sweep, 10000); }
    if (root.isConnected && root.offsetWidth) apply(root, root.offsetWidth, root.offsetHeight);
    return root.fit || null;
  }
  /** observe with no options — unless the widget already observes itself (its arrange / onChange are kept) */
  function ensure(root) { if (root && !opts.has(root)) observe(root, {}); return root; }
  function on(root, cb) {
    ensure(root);
    if (!subs.has(root)) subs.set(root, new Set());
    subs.get(root).add(cb);
    if (root.fit) { try { cb(root.fit, null); } catch (err) { console.error(err); } }
    return () => { const s = subs.get(root); if (s) s.delete(cb); };
  }
  function unobserve(root) { if (ro) ro.unobserve(root); opts.delete(root); subs.delete(root); watched.delete(root); }
  /** re-evaluate now (e.g. after a config change that alters the arrangement rules) */
  function refresh(root) { if (root.isConnected) { root.fit = null; apply(root, root.offsetWidth, root.offsetHeight); } }

  global.MaisonFit = { observe, ensure, on, unobserve, refresh, classify, W_STEPS, H_STEPS, T_STEPS, HYST };
})(window);
