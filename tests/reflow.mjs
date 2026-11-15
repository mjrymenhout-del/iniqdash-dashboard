/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Smart Grid reflow (pure module, no browser): deterministic, never overlaps, never leaves the grid, the active item never moves,
// distant items stay put, refusal is explicit. Randomised over many boards.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { check } from './lib/harness.mjs';
const win = {}; vm.runInNewContext(readFileSync(new URL('../components/editor/reflow.js', import.meta.url), 'utf8'), { window: win, globalThis: win });
const R = win.MaisonReflow; check('MaisonReflow is loaded', !!R && typeof R.resolve === 'function');
let seed = 20260101; const rnd = (n) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return Math.floor((seed / 4294967296) * n); };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
let boards = 0, bad = [];
for (let t = 0; t < 600; t++) {
  const cols = [4, 8, 12][rnd(3)], items = [];
  for (let i = 0; i < 2 + rnd(7); i++) {   // a legal, non-overlapping board
    const w = 1 + rnd(Math.min(4, cols)), h = 1 + rnd(4); const c = { id: `i${i}`, x: 1 + rnd(cols - w + 1), y: 1 + rnd(12), w, h };
    if (!items.some((o) => overlap(o, c))) items.push(c);
  }
  if (items.length < 2) continue;
  const act = items[rnd(items.length)], rest = items.filter((i) => i !== act);
  const w = Math.max(1, Math.min(cols, act.w + rnd(3) - 1)), h = Math.max(1, act.h + rnd(3) - 1);
  const moved = { id: act.id, x: 1 + rnd(cols - w + 1), y: 1 + rnd(14), w, h };
  const dir = { x: rnd(3) - 1, y: rnd(3) - 1 };
  const args = () => ({ active: { ...moved }, items: rest.map((i) => ({ ...i })), cols, maxRows: Infinity, dir, vacated: { x: act.x, y: act.y, w: act.w, h: act.h } });
  const a = R.resolve(args()), b = R.resolve(args()); boards++;
  const ser = (r) => JSON.stringify(r.ok ? [...r.cells].sort() : r);
  if (ser(a) !== ser(b)) { bad.push(['nondeterministic', t]); continue; }
  if (!a.ok) { if (!a.reason) bad.push(['refusal without reason', t]); continue; }
  const cells = [{ ...moved }, ...rest.map((i) => ({ id: i.id, ...a.cells.get(i.id) }))];
  if (cells.some((c, i) => cells.slice(i + 1).some((d) => overlap(c, d)))) bad.push(['overlap', t]);
  if (cells.some((c) => c.x < 1 || c.y < 1 || c.x + c.w - 1 > cols)) bad.push(['outside the grid', t]);
  const untouched = rest.filter((i) => !overlap(i, moved) && !a.moved.includes(i.id));
  if (untouched.some((i) => { const c = a.cells.get(i.id); return c.x !== i.x || c.y !== i.y; })) bad.push(['unrelated item moved', t]);
  if (rest.some((i) => { const c = a.cells.get(i.id); return c.w !== i.w || c.h !== i.h; })) bad.push(['size changed', t]);
}
check(`${boards} random boards: deterministic, no overlap, inside the grid, no unrelated movement`, bad.length === 0, JSON.stringify(bad.slice(0, 5)));
// an impossible request is refused rather than half-applied
const full = R.resolve({ active: { id: 'a', x: 1, y: 1, w: 2, h: 2 }, items: [{ id: 'b', x: 3, y: 1, w: 2, h: 2 }], cols: 4, maxRows: 2, dir: { x: 1, y: 0 }, vacated: null });
check('no room left → refused (ok:false), nothing half-applied', full.ok === false || ![...full.cells.values()].some((c) => c.x + c.w - 1 > 4 || c.y + c.h - 1 > 2));
console.log('finished');
