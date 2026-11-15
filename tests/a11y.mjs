/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ACCESSIBILITY (focused): every interactive element of every widget × variant has an accessible name, is keyboard reachable unless it is
// intentionally disabled, exposes its state (switch → aria-checked, toggle button → aria-pressed), decorative SVG is hidden from assistive
// tech, the widget as a whole has a text alternative where it is graphical, and every animation in a widget stylesheet has a
// prefers-reduced-motion guard. (Colour-only status is covered by the per-widget tests: every status also has words.)
import fs from 'node:fs';
import { start, check } from './lib/harness.mjs';
const T = await start([]);
const page = await T.page({ width: 1500, height: 1000 });
const only = process.argv.slice(2);
const cases = await page.evaluate(() => {
  const R = window.MaisonRegistry, out = [];
  Object.entries(R.TYPES).forEach(([type, t]) => {
    if (t.isContainer || t.isFloating || t.hidden || ['popup', 'notification', 'radial'].includes(type)) return;
    const ids = t.variantsFor ? (t.variantsFor({}) || []) : (t.variants || []).map((v) => v.id);
    (ids.length ? ids : [null]).forEach((v) => out.push([type, v]));
  });
  return out;
});
for (const [type, variant] of cases) {
  if (only.length && !only.includes(type)) continue;
  await page.evaluate(({ type, variant }) => {
    document.getElementById('w')?.remove();
    const b = document.createElement('div'); b.id = 'w'; b.style.cssText = 'position:fixed;left:10px;top:10px;width:420px;height:380px;display:grid;z-index:99999;background:#222';
    b.append(window.MaisonRegistry.build(type, variant ? { variant } : {})); document.body.append(b);
  }, { type, variant });
  await page.waitForTimeout(150);
  const bad = await page.evaluate(() => {
    const root = document.querySelector('#w > *'), out = [];
    const name = (e) => (e.getAttribute('aria-label') || '').trim() || (e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.textContent.trim()) || e.labels?.[0]?.textContent.trim() || (e.title || '').trim() || (e.textContent || '').trim();
    const shown = (e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length; };
    root.querySelectorAll('button, select, input, [role=button], [role=switch], [role=slider], [role=radio], a[href], [tabindex]').forEach((e) => {
      if (!shown(e) && !(e.type === 'range')) return;
      const id = `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`;
      if (!name(e)) out.push(`${id}: no accessible name`);
      if (e.getAttribute('role') === 'switch' && !e.hasAttribute('aria-checked')) out.push(`${id}: switch without aria-checked`);
      if (e.tagName === 'BUTTON' && e.hasAttribute('aria-pressed') && !['true', 'false', 'mixed'].includes(e.getAttribute('aria-pressed'))) out.push(`${id}: bad aria-pressed`);
      const roving = e.parentElement && [...e.parentElement.children].some((x) => x !== e && x.tabIndex === 0);   // a roving tabindex group: one stop, arrow keys inside
      if (!e.disabled && !roving && e.tabIndex < 0 && !e.hasAttribute('aria-hidden') && e.getAttribute('aria-disabled') !== 'true' && getComputedStyle(e).opacity !== '0') out.push(`${id}: not keyboard reachable (tabindex ${e.tabIndex})`);
    });
    // clickable non-controls
    root.querySelectorAll('svg').forEach((s) => { if (!s.closest('[aria-hidden=true]') && s.getAttribute('aria-hidden') !== 'true' && !s.getAttribute('role') && !s.getAttribute('aria-label') && !s.querySelector('title') && shown(s) && s.closest('button')?.getAttribute('aria-label') === null && !(s.closest('button')?.textContent || '').trim()) out.push(`svg in ${s.parentElement.className}: unlabeled graphic`); });
    if (!root.getAttribute('aria-label') && !root.getAttribute('role') && !(root.textContent || '').trim()) out.push('widget root: no text alternative at all');
    return [...new Set(out)];
  });
  check(`${type}${variant ? `/${variant}` : ''}: accessible names, keyboard, state`, bad.length === 0, '\n      ' + bad.slice(0, 6).join('\n      '));
}
// reduced motion: every widget stylesheet that animates also guards it
for (const f of fs.readdirSync('widgets/default')) {
  const p = `widgets/default/${f}/${f}.css`;
  if (!fs.existsSync(p)) continue;
  const css = fs.readFileSync(p, 'utf8');
  const animates = /(^|[;{\s])animation\s*:|@keyframes/.test(css);
  if (only.length && !only.includes(f)) continue;
  check(`${f}.css: animation ⇒ prefers-reduced-motion guard`, !animates || /prefers-reduced-motion/.test(css));
}
check('no page errors', page.errors.length === 0, page.errors.slice(0, 3).join('|'));
await T.close();
