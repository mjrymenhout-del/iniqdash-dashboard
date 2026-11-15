/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Smart grid reflow — LOCAL collision resolution for the dashboard editor (pure: no DOM, no model).

   MaisonReflow.resolve({ active, items, cols, maxRows, dir, vacated }) →
     { ok: true,  cells: Map<id, { x, y, w, h }>, moved: [id…] }   every item's resulting cell (moved or not)
     { ok: false, id, reason }                                       no valid resolution (the caller keeps the old layout)

     active   { id, x, y, w, h }  the item being moved / resized — it has priority and never moves
     items    [{ id, x, y, w, h }] the OTHER items of the same grid, at their positions BEFORE the operation
              (always the original positions: every call starts from them, so a preview never drifts)
     cols     the grid's columns; maxRows: the last usable row (Infinity on a page; a container's own rows)
     dir      { x: -1 | 0 | 1, y: -1 | 0 | 1 } the intention of the gesture (drag direction / growing edge)
     vacated  the cell the active item left (a move), or null (a resize)

   Rules (deterministic — the same input always gives the same layout):
     · only items that overlap the active item move; then only items those land on (a cascade), nothing else.
       Empty space elsewhere is never collapsed and distant items never move (this is NOT global packing);
     · each displaced item takes the cheapest valid candidate:
         push past the obstacle → in the gesture's direction, the opposite one, or the perpendicular ones,
         or the space the active item left (a swap);
       cost = cells travelled + 2 × the other items it would land on (cascade) − a small bonus for following the
       gesture (0.75) or filling the vacated space (1, up to 4 when the active item covers it entirely: a swap beats a push then); ties keep the candidate order above, then x / y;
     · an item, once placed, is not moved again (guarantees termination and a stable result);
     · candidates must stay inside the grid (1…cols, 1…maxRows) and never overlap a placed item;
     · when an item has no valid candidate the whole operation is refused ({ ok: false }).
   ========================================================================== */
(function (global) {
  'use strict';

  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

  function resolve({ active, items, cols, maxRows = Infinity, dir = { x: 0, y: 0 }, vacated = null, lookahead = true }) {
    const A = { id: active.id, x: active.x, y: active.y, w: active.w, h: active.h };
    const inside = (c) => c.x >= 1 && c.y >= 1 && c.x + c.w - 1 <= cols && c.y + c.h - 1 <= maxRows;
    // the active item itself may reach below a container's rows (the container grows to fit); only displaced items may not
    if (A.x < 1 || A.y < 1 || A.x + A.w - 1 > cols) return { ok: false, id: A.id, reason: 'outside' };
    const orig = new Map(items.map((i) => [i.id, { x: i.x, y: i.y, w: i.w, h: i.h }]));
    const order = new Map(items.map((i, n) => [i.id, n]));
    const dx = sign(dir.x), dy = sign(dir.y);

    /* the resolution state: where every item is, which are placed for good (fixed), the work queue */
    const fresh = () => ({ cell: new Map([...orig].map(([k, v]) => [k, { ...v }])), fixed: [A], settled: new Set([A.id]), moved: [], queue: [] });
    const clone = (st) => ({ cell: new Map(st.cell), fixed: st.fixed.slice(), settled: new Set(st.settled), moved: st.moved.slice(), queue: st.queue.slice() });
    /** unsettled items overlapping `c`, the largest overlap first (then reading order) */
    const hitsOf = (st, c, exceptId) => items.filter((o) => o.id !== exceptId && !st.settled.has(o.id) && overlap(st.cell.get(o.id), c))
      .sort((a, b) => area(st.cell.get(b.id), c) - area(st.cell.get(a.id), c) || st.cell.get(a.id).y - st.cell.get(b.id).y || st.cell.get(a.id).x - st.cell.get(b.id).x || order.get(a.id) - order.get(b.id));
    const blocked = (st, c) => st.fixed.some((f) => overlap(c, f));
    /** how many unsettled items `c` would land on (no allocation: the hot path of the cost) */
    const countHits = (st, c, exceptId) => { let n = 0; for (const o of items) if (o.id !== exceptId && !st.settled.has(o.id) && overlap(st.cell.get(o.id), c)) n++; return n; };
    /** total movement of a finished resolution: cells travelled by every moved item + 1 per moved item */
    const total = (st) => st.moved.reduce((n, id) => { const a = orig.get(id), b = st.cell.get(id); return n + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + 1; }, 0);

    /** slide `c` along one axis (away from every placed item it touches) until it is free; null when it leaves the grid */
    function slide(st, c, ax, s) {
      const p = { ...c };
      for (let guard = 0; guard < 2000; guard++) {
        const hit = st.fixed.filter((f) => overlap(p, f));
        if (!hit.length) return inside(p) ? p : null;
        if (ax === 'x') p.x = s > 0 ? Math.max(...hit.map((f) => f.x + f.w)) : Math.min(...hit.map((f) => f.x)) - p.w;
        else p.y = s > 0 ? Math.max(...hit.map((f) => f.y + f.h)) : Math.min(...hit.map((f) => f.y)) - p.h;
        if (!inside(p)) return null;
      }
      return null;
    }
    /** the valid candidate cells for item `id`, each with its gesture / swap bonus and its rank (tie-break order) */
    function candidates(st, id) {
      const b = st.cell.get(id), out = [];
      const add = (c, bonus, rank) => {
        if (!c || !inside(c) || blocked(st, c)) return;
        const same = out.find((o) => o.c.x === c.x && o.c.y === c.y);       // one cell reached two ways keeps its best bonus
        if (same) { same.bonus = Math.max(same.bonus, bonus); same.rank = Math.min(same.rank, rank); } else out.push({ c, bonus, rank });
      };
      // pushes: the gesture's own direction first, then the others (each slid until clear of every placed item)
      const pushes = [];
      if (dx) pushes.push(['x', dx]);
      if (dy) pushes.push(['y', dy]);
      [['x', 1], ['y', 1], ['x', -1], ['y', -1]].forEach((p) => { if (!pushes.some((q) => q[0] === p[0] && q[1] === p[1])) pushes.push(p); });
      // following the gesture counts most for the items the active one hits itself (3.5), less down a cascade (0.75)
      const follow = overlap(orig.get(id), A) ? 3.5 : 0.75;
      pushes.forEach(([ax, s], i) => add(slide(st, b, ax, s), (ax === 'x' ? dx === s : dy === s) && s !== 0 ? follow : 0, i));
      // the space the active item left: a swap (aligned to its corners, or keeping the item's own row / column)
      if (vacated) {
        // the more of this item the active one now covers, the more a swap is what the gesture means
        const cover = area(b, A) / (b.w * b.h);
        const vx = [vacated.x, vacated.x + vacated.w - b.w].map((x) => Math.min(Math.max(1, x), cols - b.w + 1));
        const spots = [[vx[0], vacated.y], [vx[1], vacated.y], [b.x, vacated.y], [vx[0], b.y], [vx[0], vacated.y + vacated.h - b.h]];
        spots.forEach(([x, y], i) => add({ x, y, w: b.w, h: b.h }, 1 + 3 * cover, 10 + i));
      }
      return out;
    }
    /** lowest cost wins; a tie keeps the candidate order (rank), then the higher row, then the left column */
    const better = (cost, k, best, bestCost) => !best || cost < bestCost - 1e-9
      || (Math.abs(cost - bestCost) <= 1e-9 && (k.rank < best.rank || (k.rank === best.rank && (k.c.y < best.c.y || (k.c.y === best.c.y && k.c.x < best.c.x)))));
    function settle(st, id, c) {
      const b = st.cell.get(id);
      st.cell.set(id, c); st.settled.add(id); st.fixed.push({ id, ...c });
      if (c.x !== b.x || c.y !== b.y) st.moved.push(id);
      hitsOf(st, c, id).forEach((o) => { if (!st.queue.includes(o.id)) st.queue.push(o.id); });
    }
    /** work the queue: every item still in the way of a placed one takes its best candidate.
        deep = true: a candidate is judged by FINISHING the resolution with it (one-step lookahead: the whole cascade it
        causes counts), otherwise by its own travel + 2 per item it lands on. */
    function run(st, deep) {
      let guard = 0;
      while (st.queue.length) {
        if (++guard > items.length * 8 + 50) return { ok: false, id: st.queue[0], reason: 'too_complex' };
        const id = st.queue.shift();
        if (st.settled.has(id)) continue;
        if (!blocked(st, st.cell.get(id))) continue;          // already clear (an earlier move freed it)
        work++;
        const b = st.cell.get(id), cand = candidates(st, id);
        let best = null, bestCost = Infinity;
        // the lookahead is spent where it matters: on the items the active one hits itself, within a time budget
        const look = deep && overlap(orig.get(id), A) && work < WORK;
        cand.forEach((k) => {
          let cost;
          if (look) {
            const s2 = clone(st);
            settle(s2, id, k.c);
            const r = run(s2, false);
            cost = r.ok ? total(s2) - k.bonus : Infinity;
          } else cost = Math.abs(k.c.x - b.x) + Math.abs(k.c.y - b.y) + 2 * countHits(st, k.c, id) - k.bonus;
          if (cost < Infinity && better(cost, k, best, bestCost)) { best = k; bestCost = cost; }
        });
        if (!best) return { ok: false, id, reason: 'no_room' };
        settle(st, id, best.c);
      }
      return { ok: true };
    }

    // a WORK budget (counted, never timed: the result must not depend on the machine's speed) for the lookahead
    const WORK = 300;
    let work = 0;
    const st = fresh();
    st.queue = hitsOf(st, A, A.id).map((o) => o.id);
    const r = run(st, lookahead);
    return r.ok ? { ok: true, cells: st.cell, moved: st.moved } : r;
  }

  global.MaisonReflow = { resolve, overlap };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.MaisonReflow;
})(typeof window !== 'undefined' ? window : globalThis);
