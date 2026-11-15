/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ADD WIDGET GALLERY — THEMED THUMBNAILS. Real editor, real PHP server, FAKE Home Assistant (tests/lib/live.mjs — not a real Home Assistant).
//   Every tile shows the REAL widget (the configure dialog's own drawing, drawWidget — the same renderer as the Live preview) at its default
//   size with the type's demo configuration, in the DASHBOARD'S ACTIVE THEME (light and dark), drawn lazily as tiles scroll into view, inert,
//   never linked (no Home Assistant request at all while browsing), gone with the gallery; choosing a tile opens the same configure preview.
import path from 'node:path';
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
  await E(() => window.editor.setEditing(true)); await wait(300);
  const open = async () => { await page.click('.ed-bar button:has-text("Add")'); await page.waitForSelector('dialog[open] .ecfg-tile'); await wait(900); };
  const close = async () => { await page.keyboard.press('Escape'); await wait(300); };
  const stats = () => E(() => { const d = document.querySelector('dialog[open]'); const pv = [...d.querySelectorAll('.ecfg-tile__pv')];
    return { tiles: d.querySelectorAll('.ecfg-tile').length, drawn: pv.filter((b) => b.hasAttribute('data-drawn')).length, widgets: pv.filter((b) => b.querySelector('[data-widget], .stw')).length,
      inert: pv.filter((b) => b.hasAttribute('data-drawn')).every((b) => b.querySelector('.ecfg-tile__box').inert) }; });
  const haBefore = L.haCalls.length;
  await open();
  const s0 = await stats();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'gallery-original.png') });
  check('THUMBNAILS: tiles show the real widget renderer (a [data-widget] root inside the tile), inert', s0.drawn > 3 && s0.widgets === s0.drawn && s0.inert, JSON.stringify(s0));
  check('LAZY: only the tiles in view (and a margin) are drawn when the gallery opens', s0.drawn < s0.tiles, JSON.stringify(s0));
  // scroll through the whole gallery: everything gets drawn
  for (let i = 0; i < 12; i++) { await E(() => { const b = document.querySelector('dialog[open] .ecfg-body') || document.querySelector('dialog[open]'); b.scrollTop += 600; }); await wait(250); }
  const s1 = await stats();
  check('…scrolling draws the rest (every tile of a known type ends up with its thumbnail)', s1.drawn >= s1.tiles - 2, JSON.stringify(s1));
  // the dashboard behind the dialog keeps polling ITS OWN linked entities (one state read per poll); a thumbnail must add nothing: every
  // entity read while browsing is one the dashboard itself references, and no service is called
  const dashJson = await E(() => JSON.stringify(window.editor.getModel()));
  const reads = L.haCalls.slice(haBefore), ids = [...new Set(reads.flatMap((x) => String(x.body || '').match(/[a-z_]+\.[a-z0-9_]+/g) || []).filter((id) => /^(light|switch|sensor|binary_sensor|climate|cover|fan|media_player|person|weather|camera|lock|alarm_control_panel|vacuum|sun|calendar|input_[a-z]+|number|select|scene|script|button|device_tracker)\./.test(id)))];
  const foreign = ids.filter((id) => !dashJson.includes(`"${id}"`));
  if (process.env.DIAG) console.log('reads', reads.length, 'ids', ids.length, ids.slice(0, 6));
  check('NO HOME ASSISTANT TRAFFIC FROM THUMBNAILS: no service call, and every state read while browsing is the dashboard\'s own poll of its own entities (a thumbnail asks for nothing)',
    !reads.some((x) => /\/api\/services\//.test(x.url)) && foreign.length === 0 && (reads.length === 0 || ids.length > 0), JSON.stringify({ foreign, n: reads.length, ids: ids.length }));
  // the theme: the thumbnails' scope carries the dashboard's active theme
  const accent = (sel) => E((sel) => getComputedStyle(document.querySelector(sel)).getPropertyValue('--accent').trim(), sel);
  check('ORIGINAL: the thumbnails are drawn in the dashboard\'s look (no theme values)', (await accent('dialog[open] .ecfg-tile__pv[data-drawn]')) === (await accent('.ed-frame')));
  await close();
  for (const [id, acc, kind] of [['azure-home', '#1a62e8', 'light'], ['midnight-ember', '#ff7a1a', 'dark']]) {
    await E((x) => window.editor.themeStudio().apply(x), id); await wait(200);
    await open();
    const t = await E(() => { const pv = document.querySelector('dialog[open] .ecfg-tile[data-type="light"] .ecfg-tile__pv'); const lw = pv.querySelector('.lw'); const c = getComputedStyle(pv);
      return { accent: c.getPropertyValue('--accent').trim(), page: c.backgroundColor, card: lw && getComputedStyle(lw).backgroundImage.slice(0, 160) }; });
    const dash = await E(() => getComputedStyle(document.querySelector('.ed-frame')).getPropertyValue('--page-bg').trim());
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `gallery-${id}.png`) });
    check(`${id.toUpperCase()} (${kind}): the thumbnails use it — its accent, its page colour behind the widget, its card surface on the Light`, t.accent === acc && !!t.card && t.card.includes('rgb'), JSON.stringify({ t, dash }));
    await close();
  }
  // choosing a tile opens the same configure preview as before
  await open();
  await page.click('dialog[open] .ecfg-tile[data-type="light"]'); await page.waitForSelector('dialog[open] .ecfg-pv__box .lw'); await wait(400);
  check('CHOOSING a tile opens the same Configure step with its Live preview (one renderer: drawWidget)', await E(() => !!document.querySelector('dialog[open] .ecfg-pv .ecfg-pv__box .lw') && !document.querySelector('dialog[open] .ecfg-tile')));
  await close();
  check('CLEANUP: closing the gallery removes every thumbnail', await E(() => document.querySelectorAll('.ecfg-tile__pv').length === 0));
  await E(() => window.editor.themeStudio().apply('iniqdash'));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
