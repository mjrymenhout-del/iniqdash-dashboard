/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// THEME — DASHBOARD BACKGROUND IMAGES through the real Theme Studio, real PHP server, FAKE Home Assistant (tests/lib/live.mjs — not a
// real Home Assistant): the shared image picker (a built-in background, then an UPLOADED image — the protected IniqDash User Assets,
// stored as a reference), fit / position / opacity / overlay / blur / scroll-fixed, drawn behind the cards at desktop, tablet and
// mobile sizes, the layout untouched (every grid item's box identical with and without the image), Remove, saved and reloaded, and
// the export carries only the reference (no path, no credential).
import path from 'node:path';
import fs from 'node:fs';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(1200);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const boxes = () => E(() => [...document.querySelectorAll('.ed-canvas [data-grid-id]')].map((n) => { const r = n.getBoundingClientRect(); return `${n.dataset.gridId}:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`; }).join(' '));
  const geo0 = await boxes();
  const canvasBg = () => E(() => { const c = document.querySelector('.ed-canvas'), b = getComputedStyle(c, '::before'), a = getComputedStyle(c, '::after'); return { img: b.backgroundImage, size: b.backgroundSize, pos: b.backgroundPosition, op: b.opacity, filter: b.filter, attach: b.backgroundAttachment, overlay: a.backgroundColor, content: b.content }; });

  // the Studio: a new theme → Background image section
  await E(() => window.editor.openThemes()); await page.waitForSelector('dialog[open] [data-k="theme-new"]');
  await page.click('dialog[open] [data-k="theme-new"]'); await page.waitForSelector('dialog[open] .tst'); await wait(800);
  await page.click('dialog[open] details[data-group="image"] > summary'); await wait(300);
  const tiles = await E(() => [...document.querySelectorAll('dialog[open] [data-key="background.image"] .ef-art__t')].map((t) => t.getAttribute('aria-label')));
  check('THE SHARED IMAGE PICKER: None, the built-in backgrounds and Upload', tiles.includes('None') && tiles.includes('Dusk') && tiles.includes('Morning mist') && tiles.includes('Upload'), JSON.stringify(tiles));
  await page.click('dialog[open] [data-key="background.image"] [aria-label="Dusk"]'); await wait(500);
  const pv = await E(() => getComputedStyle(document.querySelector('dialog[open] .tst-canvas'), '::before').backgroundImage);
  check('A BUILT-IN BACKGROUND shows at once in the Studio preview (and on the dashboard, live)', /assets\/themes\/dusk\.svg/.test(pv) && /dusk\.svg/.test((await canvasBg()).img), pv);
  // upload my own image
  await page.setInputFiles('dialog[open] input[data-upload="background.image"]', 'assets/img/media/artwork-tide.jpg'); await wait(1800);
  const ref = await E(() => { const t = document.querySelector('dialog[open] [data-key="background.image"] .ef-art__t[aria-pressed="true"]'); return t && t.dataset.value; });
  const bgUp = await canvasBg();
  check('UPLOAD: the image goes to the protected IniqDash User Assets and the theme keeps only its reference (api/asset.php?id=…)', /^api\/asset\.php\?id=[0-9a-f]{32}$/.test(ref || '') && bgUp.img.includes(ref), JSON.stringify({ ref, img: bgUp.img }));
  // the options
  const pick = async (key, value) => { await E(([k, v]) => { const s = document.querySelector(`dialog[open] [data-key="${k}"] select`); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, [key, value]); await wait(250); };
  const num = async (key, value) => { await E(([k, v]) => { const n = document.querySelector(`dialog[open] [data-key="${k}"] input[type=number]`); n.value = String(v); n.dispatchEvent(new Event('input', { bubbles: true })); }, [key, value]); await wait(250); };
  const fits = {};
  for (const f of ['cover', 'contain', 'original', 'stretch']) { await pick('background.fit', f); fits[f] = (await canvasBg()).size; }
  check('FIT: Cover · Contain · Original · Stretch', fits.cover === 'cover' && fits.contain === 'contain' && fits.original === 'auto' && fits.stretch === '100% 100%', JSON.stringify(fits));
  await pick('background.fit', 'cover'); await pick('background.position', 'top-right'); await num('background.opacity', 60); await num('background.blur', 6);
  await E(() => { const f = document.querySelector('dialog[open] [data-key="background.overlay"]'); f.closest('details').open = true; });
  const setColour = async (key, v) => { await E(([k, val]) => { const f = document.querySelector(`dialog[open] [data-key="${k}"]`); const i = f.querySelector('input[type=color]') || f.querySelector('input[type=text]'); i.value = val; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, [key, v]); await wait(250); };
  await setColour('background.overlay', '#000000'); await num('background.overlayAlpha', 35);
  let bg = await canvasBg();
  check('POSITION · OPACITY · BLUR · OVERLAY: top right, 60 %, 6 px blur, a 35 % black tint over it', bg.pos === '100% 0%' && bg.op === '0.6' && /blur\(6px\)/.test(bg.filter) && /rgba\(0, 0, 0, 0\.35\)/.test(bg.overlay), JSON.stringify(bg));
  await pick('background.attach', 'fixed'); bg = await canvasBg();
  check('FIXED: the image stays put (no blur with a fixed image)', bg.attach === 'fixed' && bg.filter === 'none', JSON.stringify(bg));
  await pick('background.attach', 'scroll');
  check('THE LAYOUT IS UNTOUCHED: every grid item has exactly the same box with the background image', (await boxes()) === geo0);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'ts-background-studio.png') });
  // save & apply, then the dashboard at three sizes
  await page.click('dialog[open] [data-k="apply-def"]'); await wait(700);
  const applied = await E(() => window.editor.getModel().app.theme);
  check('SAVE & APPLY: the dashboard theme carries the background (reference + options only)', applied && applied.background && applied.background.image === ref && applied.background.position === 'top-right' && applied.background.overlayAlpha === 35, JSON.stringify(applied && applied.background));
  check('…and the layout is still untouched', (await boxes()) === geo0);
  for (const [bp, size] of [['desktop', { width: 1500, height: 1000 }], ['tablet', { width: 900, height: 1100 }], ['mobile', { width: 420, height: 880 }]]) {
    await page.setViewportSize(size); await wait(900);
    const r = await E(() => { const c = document.querySelector('.ed-canvas'), cr = c.getBoundingClientRect(), b = getComputedStyle(c, '::before'); return { w: Math.round(cr.width), h: Math.round(cr.height), img: b.backgroundImage !== 'none', content: b.content }; });
    check(`${bp.toUpperCase()}: the image covers the whole dashboard canvas`, r.img && r.content !== 'none' && r.w > 100, JSON.stringify(r));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `ts-background-${bp}.png`) });
  }
  await page.setViewportSize({ width: 1500, height: 1000 }); await wait(600);
  check('SAVE (the server accepts the background)', await E(() => window.editor.save()));
  await page.reload(); await page.waitForFunction(() => window.editor); await wait(1500);
  check('RELOAD: the background is kept and drawn', (await canvasBg()).img.includes(ref));
  // export: only the reference
  const t = await E(() => window.editor.getModel().app.themes[0]);
  const [dl] = await Promise.all([page.waitForEvent('download'), E(() => window.editor.themeStudio().exportTheme(window.editor.getModel().app.themes[0]))]);
  const file = await dl.path(); const text = fs.readFileSync(file, 'utf8');
  check('EXPORT: the file carries the image REFERENCE only — no server path, no host, no credential', text.includes(ref) && !/\/home\/|\/var\/|https?:\/\/|password|secret|bearer|access_token/i.test(text) && JSON.parse(text).theme.background.image === ref, text.slice(0, 300));
  // remove
  await E((id) => window.editor.themeStudio().openEditor(id), t.id); await page.waitForSelector('dialog[open] .tst'); await wait(600);
  await page.click('dialog[open] details[data-group="image"] > summary'); await wait(200);
  await page.click('dialog[open] [data-key="background.image"] [data-k="art-remove"]'); await wait(300);
  await page.click('dialog[open] [data-k="apply-def"]'); await wait(600);
  bg = await canvasBg();
  check('REMOVE: no image any more (the overlay setting stays harmless)', !(await E(() => window.editor.getModel().app.theme.background || {})).image && (bg.content === 'none' || bg.img === 'none'), JSON.stringify(bg));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
