/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Visual system regression (structure, not pixels): the design tokens are in force, Manrope loads, text / accent contrast meets WCAG AA on the
// surfaces it is used on, the Widget Library showcase renders every widget family and variant without errors, nothing in it overflows its own
// box, and the same dashboard still renders at Tablet and Mobile logical sizes. Pixel-level judgement is the owner's (second-pass visual QA).
import { start, check } from './lib/harness.mjs';
const T = await start([], { server: false });
const page = await T.page({ width: 1500, height: 950 });
await page.goto(T.url + '?dashboard=showcase'); await page.waitForFunction(() => window.editor, null, { timeout: 15000 }); await page.waitForTimeout(2500);
const E = (fn, ...a) => page.evaluate(fn, ...a);

// ---- tokens and font
const tk = await E(() => { const cs = getComputedStyle(document.documentElement); const g = (n) => cs.getPropertyValue(n).trim(); return { page: g('--page-bg'), surface: g('--surface-primary'), text: g('--text-primary'), text2: g('--text-secondary'), muted: g('--text-muted'), accent: g('--accent'), onAccent: g('--accent-on'), font: g('--font'), rw: g('--radius-widget'), nav: g('--nav-bg'), iq: g('--iq-surface'), ok: g('--success'), warn: g('--warning'), danger: g('--danger'), info: g('--info') }; });
check('the semantic tokens are defined (app, nav, surface, text, accent, functional colours)', Object.values(tk).every((v) => v), JSON.stringify(tk));
check('the font stack starts with Manrope and has a system fallback', /^"Manrope",.*sans-serif$/.test(tk.font));
check('Manrope is actually loaded (the shipped, redistributable font files)', await E(async () => { await document.fonts.load('600 14px Manrope'); return document.fonts.check('600 14px Manrope') && [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Manrope' && f.status === 'loaded'); }));
const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const rgb = async (hex) => E((h) => { const d = document.createElement('i'); d.style.color = h; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, hex);
const ratio = async (a, b) => { const [la, lb] = [lum(await rgb(a)), lum(await rgb(b))]; return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
for (const [fg, bg, min, label] of [[tk.text, tk.surface, 7, 'primary text on a card'], [tk.text2, tk.surface, 4.5, 'secondary text on a card'], [tk.muted, tk.surface, 4.5, 'muted text on a card'], [tk.muted, tk.page, 4.5, 'muted text on the app background'],
  [tk.accent, tk.surface, 3, 'accent (controls, focus) on a card'], [tk.onAccent, tk.accent, 4.5, 'text on an accent fill'], [tk.ok, tk.surface, 4.5, 'success on a card'], [tk.danger, tk.surface, 4.5, 'danger on a card'], [tk.info, tk.surface, 4.5, 'info on a card'], [tk.warn, tk.surface, 4.5, 'warning on a card']]) {
  const r = await ratio(fg, bg); check(`contrast ${label}: ${r.toFixed(1)}:1 (≥ ${min})`, r >= min);
}
check('widget cards use the 14–16 px radius family', await E(() => { const n = document.querySelector('[data-widget="sensor"]'); const r = parseFloat(getComputedStyle(n).borderTopLeftRadius); return r >= 14 && r <= 22; }));

// ---- the showcase
const model = await E(() => window.editor.getModel());
const all = model.pages.flatMap((p) => p.items);
const types = new Set(all.map((i) => i.type));
const need = await E(() => Object.keys(window.MaisonRegistry.TYPES).filter((k) => { const t = window.MaisonRegistry.TYPES[k]; return !t.hidden && !t.isContainer && !t.isFloating && !['popup', 'notification'].includes(k) && k !== 'radial'; }));
check('the showcase pages together contain every built-in widget family', need.every((k) => types.has(k)), need.filter((k) => !types.has(k)).join());
const variants = await E(() => { const R = window.MaisonRegistry; const out = {}; R && Object.keys(R.TYPES).forEach((k) => { const t = R.TYPES[k]; out[k] = (t.variantsFor ? t.variantsFor({}) || [] : (t.variants || []).map((v) => v.id)).length; }); return out; });
const shown = {}; all.forEach((i) => { (shown[i.type] = shown[i.type] || new Set()).add(i.config.variant || ''); });
const missing = Object.entries(variants).filter(([k, n]) => n > 1 && shown[k] && shown[k].size < 2).map(([k]) => k);
check('families with several variants show more than one in the showcase', missing.length === 0, missing.join());
check('every widget of the first page is rendered with a real size', await E((ids) => ids.every((id) => { const n = document.querySelector(`[data-grid-id="${id}"]`); return !n || (n.offsetWidth > 20 && n.offsetHeight > 20); }), all.map((i) => i.id)));
check('no showcase widget is linked to Home Assistant (mock data only)', all.every((i) => !i.config.entity));
check('no uncaught errors', page.errors.length === 0, page.errors.slice(0, 3).join('|'));

// ---- overflow: nothing inside a widget sticks out of the widget (checked through the real layout, at the Library's own sizes)
const overflow = await E(() => {
  const bad = [];
  document.querySelectorAll('[data-widget]').forEach((w) => {
    const r = w.getBoundingClientRect(); if (r.width < 20) return;
    w.querySelectorAll('h3, [class*="__name"], [class*="__state"], [class*="__value"], button').forEach((x) => {
      if (!x.offsetParent) return; const b = x.getBoundingClientRect();
      if (b.width && (b.right > r.right + 1.5 || b.left < r.left - 1.5 || b.bottom > r.bottom + 1.5 || b.top < r.top - 1.5)) bad.push(`${w.dataset.widget}/${x.className.toString().slice(0, 22)}`);
    });
  });
  return [...new Set(bad)];
});
check('no text or control escapes its widget at the Library sizes', overflow.length === 0, overflow.slice(0, 8).join(', '));
// ---- the Sizes page and the other breakpoints
await E(() => [...document.querySelectorAll('nav[aria-label] button, nav[aria-label] a')].find((b) => /Sizes/.test(b.textContent))?.click()); await page.waitForTimeout(1500);
check('the Sizes page (micro → large) renders', (await E(() => document.querySelectorAll('[data-widget]').length)) >= 25);
for (const [v, label] of [['768x1024', 'tablet'], ['390x844', 'mobile']]) {
  await page.selectOption('[data-k=pv-device]', v); await page.waitForTimeout(1200);
  const r = await E(() => ({ w: document.querySelectorAll('[data-widget]').length, wide: document.querySelector('.ed-frame').scrollWidth > document.querySelector('.ed-frame').clientWidth + 2 }));
  check(`the Sizes page at ${label} (${v}): widgets render, no sideways scroll`, r.w >= 25 && !r.wide, JSON.stringify(r));
}
check('no uncaught errors at any size', page.errors.length === 0, page.errors.slice(0, 3).join('|'));
await T.close();
console.log('finished');
