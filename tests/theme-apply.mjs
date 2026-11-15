/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// THEME APPLICATION — a theme reaches EVERY inheriting widget at once, and every preview shows the dashboard's active theme. Real editor,
// real PHP server, FAKE Home Assistant (tests/lib/live.mjs — not a real Home Assistant).
//   The core check: right after a theme is applied (no resize, no re-render) each widget looks EXACTLY like the same widget rendered fresh
//   under that theme (every element's computed colours, backgrounds, borders, shadows, fills — and the widget surface layer that holds
//   resolved colours, the root cause of "resizing makes the theme appear"). Widgets: Light, Climate, Person, Room, Sun & Moon, Live
//   Activity, Entity List, Button, Switch, a Light nested in a container, a Light in an INACTIVE tab, widgets with a hover effect / custom
//   background opacity (the surface layer), a widget with its own theme and one with an explicit hover colour (both must stay theirs).
//   Sequence: Original → Midnight Ember → Azure Home → Add widget (gallery → configure preview) → added → configure preview → save / reload →
//   preview Mint + Cancel → Multi preview + Widget Studio canvas → mobile → back to Original.
import fs from 'node:fs';
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.waitForTimeout(1200);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const frames = (n = 3) => E((n) => new Promise((ok) => { let i = 0; const f = () => (++i >= n ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  const shot = async (n, el) => { if (!SHOTS) return; if (el) await (await page.$(el)).screenshot({ path: path.join(SHOTS, n) }); else await page.screenshot({ path: path.join(SHOTS, n) }); };
  const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y: y * 3 + x, w: Math.min(w, 8), h }, mobile: { w: 4, h } });
  await E((ls) => { const m = window.editor.getModel(); m.pages[0].items = [
    { id: 'l1', type: 'light', parent: null, config: { name: 'Desk lamp' }, layout: ls.l1 },
    { id: 'c1', type: 'climate', parent: null, config: { name: 'Living room', hover: 'surface' }, layout: ls.c1 },
    { id: 'p1', type: 'person', parent: null, config: { name: 'Marcel', presence: 'home', widgetBg: 'opacity', widgetBgOpacity: 80 }, layout: ls.p1 },
    { id: 'r1', type: 'custom.room-scene', parent: null, config: { name: 'Kitchen' }, layout: ls.r1 },
    { id: 's1', type: 'sunmoon', parent: null, config: { name: 'Sun & Moon', variant: 'sky' }, layout: ls.s1 },
    { id: 'a1', type: 'activity', parent: null, config: { name: 'Live Activity', hover: 'glow' }, layout: ls.a1 },
    { id: 'e1', type: 'entitylist', parent: null, config: { name: 'Entity List' }, layout: ls.e1 },
    { id: 'b1', type: 'button', parent: null, config: { text: 'Evening', action: 'none', hover: 'surface-lift', hoverColor: '#ff00aa' }, layout: ls.b1 },
    { id: 'sw1', type: 'switch', parent: null, config: { name: 'Terrace', state: 'on' }, layout: ls.sw1 },
    { id: 'own', type: 'sensor', parent: null, config: { name: 'Own accent', theme: { tokens: { accent: '#ff00aa', 'device-surface-mid': '#331133' } } }, layout: ls.own },
    { id: 'box', type: 'container', parent: null, config: { title: 'Nested' }, layout: ls.box },
    { id: 'nl', type: 'light', parent: 'box', config: { name: 'Nested lamp', hover: 'surface' }, layout: { desktop: { x: 1, y: 1, w: 12, h: 3 } } },
    { id: 'tb', type: 'tabs', parent: null, config: { title: 'Floors', tabs: [{ id: 'ta', label: 'Ground' }, { id: 'tbb', label: 'Upstairs' }] }, layout: ls.tb },
    { id: 'ts1', type: 'sensor', parent: 'tb', tab: 'ta', config: { name: 'Hall' }, layout: { desktop: { x: 1, y: 1, w: 4, h: 3 } } },
    { id: 'tl', type: 'light', parent: 'tb', tab: 'tbb', config: { name: 'Hidden lamp', hover: 'surface' }, layout: { desktop: { x: 1, y: 1, w: 6, h: 3 } } },
  ]; const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join('; ')); },
  { l1: lay(1, 1, 4, 3), c1: lay(5, 1, 4, 6), p1: lay(9, 1, 4, 3), r1: lay(9, 4, 4, 5), s1: lay(1, 4, 4, 4), a1: lay(1, 8, 4, 7), e1: lay(5, 7, 4, 5), b1: lay(9, 9, 4, 2), sw1: lay(9, 11, 4, 3),
    own: lay(5, 12, 4, 3), box: lay(1, 15, 6, 5), tb: lay(7, 15, 6, 7) });
  await wait(1500);
  const IDS = ['l1', 'c1', 'p1', 'r1', 's1', 'a1', 'e1', 'b1', 'sw1', 'own', 'nl', 'ts1', 'tl'];
  // what a widget LOOKS like: every element's computed paint + the surface layer's resolved copy (generated svg ids normalised)
  const sig = () => E((ids) => { const o = {}; ids.forEach((id) => { const g = document.querySelector(`.ed-canvas [data-grid-id="${id}"]`); const w = g && g.querySelector('[data-widget]'); if (!w) { o[id] = null; return; }
    o[id] = [w, ...w.querySelectorAll('*')].slice(0, 500).map((e) => { const c = getComputedStyle(e); return [c.color, c.backgroundColor, c.backgroundImage, c.borderTopColor, c.boxShadow, c.fill, c.stroke, c.getPropertyValue('--iq-theme-shadow'), e.classList && e.classList.contains('iq-wsurf__layer') ? `${e.style.backgroundImage}|${e.style.backgroundColor}` : ''].join('|'); }).join('\n').replace(/#[a-z]+\d+-/g, '#X-').replace(/iqdl\d+/g, 'iqdl'); }); return o; }, IDS);
  const boxes = () => E(() => { const c = document.querySelector('.ed-canvas').getBoundingClientRect(); return [...document.querySelectorAll('.ed-canvas [data-grid-id]')].filter((n) => n.getBoundingClientRect().width > 0).map((n) => { const r = n.getBoundingClientRect(); return `${n.dataset.gridId}:${Math.round(r.x - c.x)},${Math.round(r.y - c.y)},${Math.round(r.width)},${Math.round(r.height)}`; }).join(' '); });   // relative to the canvas (a screenshot may scroll the page)
  // a fresh render of the same dashboard under the same theme = the truth
  const fresh = async () => { await E(() => { const m = window.editor.getModel(); window.editor.setModel(m); }); await wait(1500); return sig(); };
  const resizes = () => E(() => window.__iqResizes);
  await E(() => { window.__iqResizes = 0; addEventListener('resize', () => { window.__iqResizes++; });
    const ro = new ResizeObserver((es) => { if (window.__iqRoReady) window.__iqResizes += es.length; }); document.querySelectorAll('.ed-canvas [data-grid-id]').forEach((n) => ro.observe(n)); setTimeout(() => { window.__iqRoReady = true; }, 300); });
  await wait(500);
  const sig0 = await sig(), geo0 = await boxes();
  const layerCount = await E(() => document.querySelectorAll('.ed-canvas .iq-wsurf__layer').length);
  check('SET-UP: 13 representative widgets render; 4 use the shared surface layer (hover effect / background opacity — the resolved-colour copy)', IDS.every((id) => sig0[id]) && layerCount >= 4, JSON.stringify({ missing: IDS.filter((id) => !sig0[id]), layerCount }));
  await shot('ta-0-original.png', '.ed-frame');

  const applyVia = async (id) => {      // the gallery's Apply button — the real UI
    await E(() => window.editor.openThemes()); await page.waitForSelector('dialog[open].ed-dlg--tgal');
    await page.click(`dialog[open].ed-dlg--tgal .tsg-card[data-theme="${id}"] [data-k=theme-apply]`);
    await frames(3);                    // two frames: the theme's CSS and the surface layers' re-read — no resize, no re-render
    const s = await sig();
    await page.click('dialog[open].ed-dlg--tgal .ecfg-foot button'); await wait(200);
    return s;
  };
  const same = (a, b, ids = IDS) => ids.filter((id) => a[id] !== b[id]);
  const changed = (a, b, ids) => ids.filter((id) => a[id] !== b[id]);
  const INHERIT = ['l1', 'c1', 'p1', 'r1', 's1', 'a1', 'e1', 'b1', 'sw1', 'nl', 'ts1', 'tl'];
  for (const [n, id] of [[1, 'midnight-ember'], [2, 'azure-home']]) {
    const r0 = await resizes();
    const now = await applyVia(id);
    const rz = (await resizes()) - r0;
    await shot(`ta-${n}-${id}.png`, '.ed-frame');
    const truth = await fresh();
    const stale = same(now, truth);
    if (process.env.DIAG) stale.forEach((x) => { const a = now[x].split('\n'), b = truth[x].split('\n'); const i = a.findIndex((v, k) => v !== b[k]); console.log('DIAG', x, i, a.length, b.length, '\n  now ', a[i], '\n  fresh', b[i]); });
    check(`APPLY ${id}: within two frames every widget looks exactly like a fresh render under the theme — including the surface layers, the nested Light and the Light in the inactive tab (stale: ${stale.join(', ') || 'none'})`, stale.length === 0, stale.join(', '));
    const g1 = await boxes(), d0 = geo0.split(' '), d1 = g1.split(' ');
    check(`…no resize happened (window or any grid item) and no position or size changed`, rz === 0 && g1 === geo0, JSON.stringify({ rz, diff: d1.filter((x, i) => x !== d0[i]).slice(0, 4), was: d0.filter((x, i) => x !== d1[i]).slice(0, 4) }));
    check(`…every inheriting widget actually changed`, changed(sig0, now, INHERIT).length === INHERIT.length, INHERIT.filter((x) => sig0[x] === now[x]).join(','));
  }
  const azure = await sig();
  const own = await E(() => { const w = document.querySelector('.ed-canvas [data-grid-id="own"] [data-widget]'); const b = document.querySelector('.ed-canvas [data-grid-id="b1"] [data-widget]'); return { accent: getComputedStyle(w).getPropertyValue('--accent').trim(), mid: getComputedStyle(w).getPropertyValue('--device-surface-mid').trim(), hover: b.style.getPropertyValue('--iq-hover-c') }; });
  check('EXPLICIT VALUES STAY: the widget with its own theme keeps its accent and card colour; the explicit hover colour stays', own.accent === '#ff00aa' && own.mid === '#331133' && own.hover === '#ff00aa', JSON.stringify(own));

  // ---------------------------------------------------------------- Add widget: the configure preview uses Azure Home
  const dashLw = await E(() => { const w = document.querySelector('.ed-canvas [data-grid-id="l1"] .lw'); const c = getComputedStyle(w); return { bg: c.backgroundImage, color: c.color, shadow: c.boxShadow }; });
  await E(() => window.editor.setEditing(true)); await wait(300);
  await page.click('.ed-bar button:has-text("Add")'); await page.waitForSelector('dialog[open] .ecfg-tile'); await wait(300);
  await shot('ta-3-gallery.png');
  await page.click('dialog[open] .ecfg-tile[data-type="light"]'); await page.waitForSelector('dialog[open] .ecfg-pv__box .lw'); await wait(600);
  const pvAdd = await E(() => { const d = document.querySelector('dialog[open]'), w = d.querySelector('.ecfg-pv__box .lw'), c = getComputedStyle(w), p = getComputedStyle(d.querySelector('.ecfg-pv'));
    return { bg: c.backgroundImage, color: c.color, shadow: c.boxShadow, accent: c.getPropertyValue('--accent').trim(), panel: p.backgroundColor }; });
  await shot('ta-4-add-preview.png');
  check('ADD WIDGET: the Live preview draws the Light in Azure Home — the same card surface, text colour and shadow as the Light on the dashboard, on the dashboard\'s page colour; nothing was applied or saved for it',
    pvAdd.bg === dashLw.bg && pvAdd.color === dashLw.color && pvAdd.shadow === dashLw.shadow && pvAdd.accent === '#1a62e8' && pvAdd.panel === 'rgb(232, 241, 253)', JSON.stringify({ pvAdd, dashLw }));
  const before = await E(() => window.editor.getModel().pages[0].items.map((i) => i.id));
  await page.click('dialog[open] .ecfg-foot button:has-text("Next")'); await wait(300);
  await page.click('dialog[open] .ecfg-add'); await wait(1200);
  const added = await E((before) => { const id = window.editor.getModel().pages[0].items.map((i) => i.id).find((x) => !before.includes(x)); const w = document.querySelector(`.ed-canvas [data-grid-id="${id}"] .lw`); const c = w && getComputedStyle(w); return { id, bg: c && c.backgroundImage, color: c && c.color }; }, before);
  check('ADDED: the new Light inherits Azure Home at once (no override stored)', added.bg === dashLw.bg && added.color === dashLw.color && !(await E((id) => window.editor.getModel().pages[0].items.find((i) => i.id === id).config.theme, added.id)), JSON.stringify(added));
  // its configuration: the same preview mechanism
  await page.click(`.ed-canvas [data-grid-id="${added.id}"]`, { position: { x: 12, y: 12 }, force: true }); await wait(250);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ecfg-pv__box .lw'); await wait(600);
  const pvCfg = await E(() => { const w = document.querySelector('dialog[open] .ecfg-pv__box .lw'), c = getComputedStyle(w); return { bg: c.backgroundImage, color: c.color }; });
  await shot('ta-5-configure-preview.png');
  check('CONFIGURE: its Live preview is in Azure Home too', pvCfg.bg === dashLw.bg && pvCfg.color === dashLw.color, JSON.stringify(pvCfg));
  await page.click('dialog[open] .ecfg-foot button:has-text("Cancel")'); await wait(300);
  await E(() => window.editor.setEditing(false)); await wait(300);

  // ---------------------------------------------------------------- save / reload
  check('SAVE', await E(() => window.editor.save()));
  await page.reload(); await page.waitForFunction(() => window.editor); await wait(2000);
  const reloaded = await sig();
  check('RELOAD: every widget looks as it did under Azure Home', same(azure, reloaded).length === 0, same(azure, reloaded).join(','));

  // ---------------------------------------------------------------- preview another theme, Cancel
  await E(() => window.editor.openThemes()); await page.waitForSelector('dialog[open].ed-dlg--tgal');
  await page.click('dialog[open].ed-dlg--tgal .tsg-card[data-theme="mint-garden"] [data-k=theme-preview]'); await page.waitForSelector('[data-k=theme-preview-cancel]'); await frames(3);
  const during = await sig();
  check('PREVIEW Mint Garden: every inheriting widget shows it at once', changed(reloaded, during, INHERIT).length === INHERIT.length, INHERIT.filter((x) => reloaded[x] === during[x]).join(','));
  await shot('ta-6-preview-mint.png', '.ed-frame');
  await page.click('[data-k=theme-preview-cancel]'); await frames(3);
  const back = await sig();
  check('CANCEL: Azure Home fully restored on every widget (surface layers included)', same(reloaded, back).length === 0, same(reloaded, back).join(','));
  await page.click('dialog[open].ed-dlg--tgal .ecfg-foot button'); await wait(200);

  // ---------------------------------------------------------------- the inactive tab, shown
  await page.click('.ed-canvas [data-grid-id="tb"] .mtabs__tab:nth-child(2), .ed-canvas [data-grid-id="tb"] [role=tab]:nth-of-type(2)').catch(() => {}); await wait(600);
  const tabShown = await E(() => { const w = document.querySelector('.ed-canvas [data-grid-id="tl"] .lw'); const r = w.getBoundingClientRect(); const layer = w.querySelector(':scope > .iq-wsurf__layer'); return { visible: r.width > 0, bg: getComputedStyle(layer || w).backgroundImage }; });
  check('THE LIGHT IN THE OTHER TAB (a hover-effect surface layer), shown: already in Azure Home', tabShown.visible && tabShown.bg === dashLw.bg, JSON.stringify(tabShown));

  // ---------------------------------------------------------------- the other previews: Multi preview, Widget Studio
  await E(() => window.editor.setEditing(true)); await wait(200);
  const multi = await E(async () => { const b = document.querySelector('[data-k="pv-multi"], [aria-label*="Multi preview"]') || [...document.querySelectorAll('button')].find((x) => /Multi preview/.test(x.textContent)); b.click(); await new Promise((r) => setTimeout(r, 1500));
    const f = document.querySelector('.ed-mframe'), w = f && f.querySelector('.lw'); return { accent: f && getComputedStyle(f).getPropertyValue('--accent').trim(), lw: w && getComputedStyle(w).backgroundImage }; });
  check('MULTI PREVIEW (desktop / tablet / mobile views): drawn in Azure Home', multi.accent === '#1a62e8' && multi.lw === dashLw.bg, JSON.stringify(multi));
  await shot('ta-7-multi.png');
  await E(() => { const b = [...document.querySelectorAll('button')].find((x) => /Multi preview/.test(x.textContent) && x.getAttribute('aria-pressed') === 'true'); if (b) b.click(); });
  await E(() => window.editor.openStudio()); await wait(1000);
  const studio = await E(() => { const b = document.querySelector('[data-k="wst-board"]'); return b && { scope: b.hasAttribute('data-theme-scope'), accent: getComputedStyle(b).getPropertyValue('--accent').trim() }; });
  check('WIDGET STUDIO: its canvas is a theme scope with the dashboard\'s active theme', studio && studio.scope && studio.accent === '#1a62e8', JSON.stringify(studio));
  await page.keyboard.press('Escape'); await wait(400);
  await E(() => window.editor.setEditing(false)); await wait(300);

  // ---------------------------------------------------------------- mobile size
  await page.setViewportSize({ width: 420, height: 900 }); await wait(1500);
  const m0 = await E(() => window.__iqResizes);
  await E(() => window.editor.themeStudio().apply('midnight-ember')); await frames(3);
  const mNow = await sig();
  await shot('ta-8-mobile-midnight.png');
  const mTruth = await fresh();
  check('MOBILE: Midnight Ember applied — every widget immediately equals a fresh render', same(mNow, mTruth).length === 0, same(mNow, mTruth).join(','));
  // ---------------------------------------------------------------- back to the original
  await page.setViewportSize({ width: 1500, height: 1100 }); await wait(1500);
  await E(() => window.editor.themeStudio().apply('iniqdash')); await frames(3);
  const o1 = await sig();
  const t1 = await fresh();
  check('BACK TO INIQDASH ORIGINAL: every widget immediately equals a fresh render with no theme', same(o1, t1).length === 0, same(o1, t1).join(','));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
  void m0; void fs;
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
