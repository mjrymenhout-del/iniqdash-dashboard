/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// THEME COLLECTION — the six built-in themes on the real sample dashboard (the editor's built-in sample, no Home Assistant, a frozen
// clock): each one applied through the Theme Studio API at desktop, tablet and mobile sizes.
//   · NO GEOMETRY CHANGE: every grid item and dock button has exactly the same box under every theme (themes only paint)
//   · VISIBLY DIFFERENT: the six dashboards differ pixel-wise from one another
//   · READABLE: primary / secondary text on the cards and on the page, and text on the accent, are at least 4.5:1 (computed colours)
//   · BACK TO THE ORIGINAL: the same pixels as before any theme
// SHOTS=<dir> also writes the screenshots used in docs/THEME-STUDIO.md.
import path from 'node:path';
import { start, check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
const IDS = ['iniqdash', 'midnight-ember', 'azure-home', 'mint-garden', 'slate-peach', 'minimal-light'];
const S = await start([], { server: false });
try {
  for (const [bp, size] of [['desktop', { width: 1400, height: 1000 }], ['tablet', { width: 860, height: 1100 }], ['mobile', { width: 400, height: 860 }]]) {
    const page = await S.page(size, { time: new Date('2026-06-15T10:30:00Z') });
    await page.waitForTimeout(2000);
    const E = (fn, ...a) => page.evaluate(fn, ...a);
    // the dock's buttons are sized by their label: a theme that changes the FONT may change them by a pixel — the grid never moves
    const geo = (nav = true) => E((nav) => [...document.querySelectorAll(nav ? '.ed-canvas [data-grid-id], .mnav__b, .ed-canvas' : '.ed-canvas [data-grid-id], .ed-canvas')].map((n) => { const r = n.getBoundingClientRect(); return `${n.dataset.gridId || n.className}:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`; }).join(' '), nav);
    // differing pixels (a channel moving by more than 24 — the snapshot tool's rule: gradient dithering noise is ignored)
    const px = (a, b) => E(async ([x, y]) => { const load = (q) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = `data:image/png;base64,${q}`; });
      const [i, j] = await Promise.all([load(x), load(y)]); if (i.width !== j.width || i.height !== j.height) return 1e9;
      const d = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const A = d(i), Q = d(j); let n = 0; for (let p = 0; p < A.length; p += 4) if (Math.abs(A[p] - Q[p]) > 24 || Math.abs(A[p + 1] - Q[p + 1]) > 24 || Math.abs(A[p + 2] - Q[p + 2]) > 24) n++; return n; }, [a.toString('base64'), b.toString('base64')]);
    const snap = (extra = {}) => page.screenshot({ clip, animations: 'disabled', ...extra });
    const clip = await E(() => { const b = document.querySelector('.ed-frame').getBoundingClientRect(); return { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(b.width, innerWidth - Math.max(0, b.x)), height: Math.min(b.height, innerHeight - Math.max(0, b.y)) }; });
    const hide = () => E(() => document.querySelectorAll('.ed-toast').forEach((t) => { t.hidden = true; }));
    const g0 = await geo(), g0grid = await geo(false); await hide();
    const orig = await snap();
    const shots = {}, geos = {}, read = {};
    for (const id of IDS) {
      await E((x) => window.editor.themeStudio().apply(x), id); await page.waitForTimeout(500); await hide();
      const font = await E((x) => !!(window.MaisonTheme.BUILTINS.find((b) => b.id === x).look || {}).font, id);
      geos[id] = font ? (await geo(false)) === g0grid : (await geo()) === g0;
      shots[id] = await snap({ ...(SHOTS && bp !== 'tablet' ? { path: path.join(SHOTS, `theme-${id}-${bp}.png`) } : {}) });
      read[id] = await E(() => { const T = window.MaisonTheme, f = document.querySelector('.ed-frame'), c = getComputedStyle(f), v = (k) => c.getPropertyValue(`--${k}`).trim();
        const card = v('device-surface-mid'), page = v('page-bg');
        return { primaryCard: T.contrast(v('text-primary'), card), secondaryCard: T.contrast(v('text-secondary'), card), primaryPage: T.contrast(v('text-primary'), page), onAccent: T.contrast(v('accent-on'), v('accent')), mutedCard: T.contrast(v('text-muted'), card) }; });
    }
    check(`${bp.toUpperCase()} · NO GEOMETRY CHANGE: every grid item and the canvas keep exactly the same box under all six themes (and the dock buttons too, except where a theme's font changes a label's width)`, IDS.every((id) => geos[id]), IDS.filter((id) => !geos[id]).join(','));
    const distinct = new Set(IDS.map((id) => shots[id].toString('base64'))).size;
    check(`${bp.toUpperCase()} · SIX VISIBLY DIFFERENT dashboards`, distinct === 6, String(distinct));
    if (bp === 'desktop') {
      check('READABLE: primary text on cards and page, secondary text on cards and text on the accent ≥ 4.5:1 under every theme; muted text ≥ 3:1',
        IDS.every((id) => ['primaryCard', 'secondaryCard', 'primaryPage', 'onAccent'].every((k) => read[id][k] >= 4.5) && read[id].mutedCard >= 3), JSON.stringify(read));
    }
    await E(() => window.editor.themeStudio().apply('iniqdash')); await page.waitForTimeout(500); await hide();
    check(`${bp.toUpperCase()} · BACK TO INIQDASH ORIGINAL: the same pixels as before any theme`, (await px(orig, await snap())) === 0 && (await geo()) === g0);
    if (page.errors.length) check(`${bp} no page errors`, false, page.errors.join(' | '));
    await page.context().close();
  }
} finally { await S.close(); }
