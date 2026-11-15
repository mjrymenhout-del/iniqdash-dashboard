/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// RESPONSIVE: every widget × every variant × the MaisonFit tiers (micro < 110 ≤ compact < 190 ≤ normal < 330 ≤ large, by the SHORTER side)
// plus strips and towers. Structural checks only: no visible text / control outside the widget's own box, no two controls overlapping,
// and the fit classes follow the LOGICAL size — a CSS-scaled copy (the editor's zoom) gets exactly the same classes and layout.
import { start, check } from './lib/harness.mjs';
const T = await start([]);
const page = await T.page({ width: 1500, height: 1000 });
const only = process.argv.slice(2);
// the editor never makes a widget smaller than its constraints (grid minimum): the sizes tested are the minimum itself and larger
const COL = (1240 + 16) / 12, GAP = 16;
const SIZES = [[96, 64], [150, 100], [200, 150], [260, 200], [340, 260], [440, 340], [520, 130], [140, 340], [640, 420]];
const cases = await page.evaluate(() => {
  const R = window.MaisonRegistry, out = [];
  Object.entries(R.TYPES).forEach(([type, t]) => {
    if (t.isContainer || t.isFloating || t.hidden || ['popup', 'notification', 'radial'].includes(type)) return;
    const ids = t.variantsFor ? (t.variantsFor({}) || []) : (t.variants || []).map((v) => v.id);
    (ids.length ? ids : [null]).forEach((v) => out.push([type, v]));
  });
  return out;
});
const audit = () => page.evaluate(() => {
  const root = document.querySelector('#w > *'); if (!root) return { err: 'no root' };
  const r = root.getBoundingClientRect(), bad = [];
  const shown = (e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01 && e.getClientRects().length; };
  const inScroll = (e) => !!e.closest('.iq-elist__list, .ecfg-pv, [data-scroll]');
  const tol = 1.5, out = (b) => b.right > r.right + tol || b.bottom > r.bottom + tol || b.left < r.left - tol || b.top < r.top - tol;
  // visible text leaves + controls
  root.querySelectorAll('*').forEach((e) => {
    if (!shown(e) || inScroll(e) || e.closest('svg') && e.tagName !== 'svg') return;
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const ctl = e.matches('button, select, input, [role=slider], [role=switch]');
    if (!own && !ctl) return;
    const b = e.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) return;
    if (out(b)) bad.push(`${e.tagName.toLowerCase()}.${String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).split(' ')[0]} "${(e.textContent || '').trim().slice(0, 20)}" ${Math.round(b.left - r.left)},${Math.round(b.top - r.top)},${Math.round(b.right - r.left)},${Math.round(b.bottom - r.top)} in ${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  // overlapping controls
  const ctls = [...root.querySelectorAll('button, select, input[type=range], input[type=text], [role=slider]')].filter((e) => shown(e) && !inScroll(e) && !(e.type === 'range' && getComputedStyle(e).opacity === '0') && e.getBoundingClientRect().width > 1);
  for (let i = 0; i < ctls.length; i++) for (let j = i + 1; j < ctls.length; j++) {
    const a = ctls[i].getBoundingClientRect(), b = ctls[j].getBoundingClientRect();
    if (ctls[i].contains(ctls[j]) || ctls[j].contains(ctls[i])) continue;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 3 && h > 3) bad.push(`controls overlap: ${ctls[i].className || ctls[i].tagName} × ${ctls[j].className || ctls[j].tagName}`);
  }
  return { bad, fit: { w: root.dataset.fitW, h: root.dataset.fitH, tier: root.dataset.fitTier, shape: root.dataset.fitShape, arr: root.dataset.fitArr } };
});
let n = 0;
for (const [type, variant] of cases) {
  if (only.length && !only.includes(type)) continue;
  const bad = [];
  const min = await page.evaluate(([type, variant]) => {
    const R = window.MaisonRegistry, t = R.TYPES[type], c = R.fullConfig(type, variant ? { variant } : {});
    const u = (v) => (v && typeof v === 'object' ? v.desktop : v) || 1;
    const k0 = t.constraints ? t.constraints(c, 260) : {}, cols = u(k0.minW);
    const k = t.constraints ? t.constraints(c, cols * (1240 + 16) / 12 - 16) : {};      // the minimum height can depend on the width it is asked at
    return { cols, rows: u(k.minH) };
  }, [type, variant]);
  const mw = min.cols * COL - GAP, mh = min.rows * 56 - 16;
  const sizes = [[Math.round(mw), Math.round(mh)], ...SIZES.filter(([w, h]) => w >= mw && h >= mh)];
  for (const [w, h] of sizes) {
    await page.evaluate(({ type, variant, w, h }) => {
      document.getElementById('w')?.remove(); document.getElementById('w2')?.remove();
      const mk = (id, scale) => { const b = document.createElement('div'); b.id = id; b.style.cssText = `position:fixed;left:10px;top:10px;width:${w}px;height:${h}px;display:grid;z-index:99999;background:#222;${scale ? `transform:scale(${scale});transform-origin:0 0;left:700px` : ''}`; b.append(window.MaisonRegistry.build(type, variant ? { variant } : {})); document.body.append(b); };
      mk('w', 0); mk('w2', 0.5);
    }, { type, variant, w, h });
    await page.waitForTimeout(120);
    const a = await audit();
    // the scaled copy (editor zoom): same logical size → same fit classes
    const scaled = await page.evaluate(() => { const r = document.querySelector('#w2 > *'); return r ? { w: r.dataset.fitW, h: r.dataset.fitH, tier: r.dataset.fitTier, shape: r.dataset.fitShape, arr: r.dataset.fitArr } : null; });
    if (a.err) { bad.push(`${w}x${h}: ${a.err}`); continue; }
    if (JSON.stringify(a.fit) !== JSON.stringify(scaled)) bad.push(`${w}x${h}: fit classes differ when CSS-scaled ${JSON.stringify(a.fit)} vs ${JSON.stringify(scaled)}`);
    a.bad.slice(0, 3).forEach((m) => bad.push(`${w}x${h}: ${m}`));
  }
  n++;
  check(`${type}${variant ? `/${variant}` : ''}: structure at ${sizes.length} sizes (from its minimum) + zoom-independent`, bad.length === 0, '\n      ' + bad.slice(0, 6).join('\n      '));
}
check('no page errors', page.errors.length === 0, page.errors.slice(0, 3).join('|'));
await T.close();
