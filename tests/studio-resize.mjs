// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
// Copyright © 2026 Marcel Rymenhout and IniqDash contributors
//
// A STUDIO WIDGET IN A CELL OF ANOTHER SIZE (widgets/default/studio/studio.js — fill, geo, autoPin): like a standard widget it fills its
// cell — its full-size background stretches with the cell; the rest of the design moves as ONE block (centred across, kept at the top)
// so rows and groups never come apart; a larger cell scales it; an explicit pin wins; "Fit" keeps the old scaled-and-centred look.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const C = (id, type, x, y, w, h, config = {}, extra = {}) => ({ id, name: id, type, x, y, w, h, config, data: {}, ...extra });
const DEF = (fit) => ({ name: 'Resize test', canvas: { w: 300, h: 200, ...(fit ? { fit } : {}) }, properties: [], slots: [], components: [
  C('bg', 'shape', 0, 0, 300, 200, { shape: 'rounded', fill: '#2a2c33', fillOpacity: 100, radius: 16, fillMode: 'solid' }),
  C('title', 'text', 20, 14, 160, 30, { mode: 'static', text: 'Living room', fontSize: 18, color: '#ffffff' }),
  C('icon', 'shape', 30, 70, 60, 60, { shape: 'circle', fill: '#ff8a1a', fillOpacity: 100, fillMode: 'solid' }),
  C('label', 'text', 100, 80, 150, 40, { mode: 'static', text: 'Lamp', fontSize: 16, color: '#ffffff' }),
  C('menu', 'text', 250, 14, 36, 30, { mode: 'static', text: '…', fontSize: 18, color: '#ffffff' }, { pin: { h: 'right', v: 'top' } }),
] });

let L, B;
try {
  L = await live({ configureHa: false });
  B = await liveBrowser(L, { viewport: { width: 1400, height: 1000 } }); const page = B.page;
  const at = (def, w, h) => page.evaluate(async ([def, w, h]) => {
    document.body.innerHTML = ''; const box = document.createElement('div'); box.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;display:flex`;
    document.body.append(box); const el = window.MaisonStudioWidget.create(def); el.style.flex = '1'; box.append(el);
    await new Promise((r) => setTimeout(r, 500));
    const r = (id) => { const n = el.querySelector(`.stw__c[data-cid="${id}"]`).getBoundingClientRect(); return { x: Math.round(n.left), y: Math.round(n.top), w: Math.round(n.width), h: Math.round(n.height) }; };
    return Object.fromEntries(['bg', 'title', 'icon', 'label', 'menu'].map((k) => [k, r(k)]));
  }, [def, w, h]);
  const near = (a, b, t = 2) => Math.abs(a - b) <= t;
  for (const [mode, def] of [['default (fill)', DEF()], ['fill', DEF('fill')]]) {
    const wide = await at(def, 600, 200), tall = await at(def, 300, 400), big = await at(def, 450, 300);
    check(`${mode} · a wider cell: the background fills it (600 wide)`, near(wide.bg.w, 600) && near(wide.bg.x, 0), JSON.stringify(wide.bg));
    check(`${mode} · …the design moves as one block, centred (title, icon and label 150 px to the right, together)`,
      near(wide.title.x, 20 + 150) && near(wide.icon.x, 30 + 150) && near(wide.label.x, 100 + 150) && near(wide.icon.y, 70), JSON.stringify(wide));
    check(`${mode} · …an explicit pin wins (the menu stays at the right edge)`, near(wide.menu.x, 600 - 50), JSON.stringify(wide.menu));
    check(`${mode} · a taller cell: the background fills it; the design stays at the top, whole`, near(tall.bg.h, 400) && near(tall.title.y, 14) && near(tall.icon.y, 70) && near(tall.label.y, 80), JSON.stringify(tall));
    check(`${mode} · a larger cell of the same shape: everything scales (×1.5)`, near(big.bg.w, 450) && near(big.icon.w, 90) && near(big.label.x, 150) && near(big.title.y, 21), JSON.stringify(big));
  }
  const fit = await at(DEF('fit'), 600, 200);
  check('"Fit": the whole design scaled and centred, the background NOT stretched (the old look, on request)', near(fit.bg.w, 300) && near(fit.bg.x, 150), JSON.stringify(fit.bg));
  check('no page error', B.errors.length === 0, B.errors.slice(0, 3).join(' | '));
} catch (e) {
  check('studio-resize ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
