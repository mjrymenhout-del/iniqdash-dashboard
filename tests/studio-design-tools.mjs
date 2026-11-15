/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET STUDIO — DESIGN TOOLS, driven through the VISIBLE UI only (fields, handles, keyboard, buttons, the file chooser); the editor state
// is read only to check what the UI did. Real PHP server, sessions, CSRF (tests/lib/live.mjs).
//   canvas size (fields · the canvas grip · fit to content) · rotation (field → rendered transform) · undo / redo (buttons and keys)
//   copy / paste (keys, fresh ids, offset) · duplicate widget · save → reopen (canvas, rotation kept) · export → import (a new definition,
//   same design) · delete (refused while a dashboard uses it, naming it; allowed when unused)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

let L, B;
try {
  L = await live({ configureHa: false });
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  const S = 'dialog.wst[open]', P = `${S} .wst__props`;
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const state = () => E((S) => document.querySelector(S).studio.state(), S);
  const wait = (ms = 250) => page.waitForTimeout(ms);
  const num = async (k, v) => { await page.fill(`${P} [data-k=${k}]`, String(v)); await page.press(`${P} [data-k=${k}]`, 'Tab'); await wait(300); };
  const libList = async () => E(async () => (await (await fetch('api/studio_widgets.php', { credentials: 'same-origin' })).json()).widgets);
  const keys = async (combo) => { await page.focus(`${S} [data-k=wst-layer]`); await page.keyboard.press(combo); await wait(400); };

  await E(() => window.IniqStudioLibrary.createCollection('Design tools'));
  await E(() => window.editor.setEditing(true)); await wait(400);
  await page.click('[data-k=studio]'); await page.waitForSelector(S);
  await page.click(`${S} [data-k=wst-new-empty]`); await wait(300);

  // ---- CANVAS SIZE: the fields (Widget panel), the grip, fit to content
  await num('wst-canvas-w', 640); await num('wst-canvas-h', 300);
  let st = await state();
  const board = await E((S) => { const b = document.querySelector(`${S} [data-k=wst-board]`); return { w: b.style.width, h: b.style.height }; }, S);
  check('CANVAS SIZE by its fields: 640 × 300 (the board follows)', st.def.canvas.w === 640 && st.def.canvas.h === 300 && board.w === '640px' && board.h === '300px', JSON.stringify({ c: st.def.canvas, board }));
  await num('wst-canvas-w', 5000);
  st = await state();
  check('…limited to the server\'s range (2000 logical px)', st.def.canvas.w === 2000, JSON.stringify(st.def.canvas));
  await num('wst-canvas-w', 640);
  const grip = await page.locator(`${S} [data-k=wst-canvas-grip]`).boundingBox();
  const z = Number(await E((S) => document.querySelector(`${S} [data-k=wst-board]`).dataset.zoom, S));
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 80 * z, grip.y + grip.height / 2 + 40 * z, { steps: 6 }); await page.mouse.up(); await wait(400);
  st = await state();
  check('CANVAS GRIP: dragging the corner resizes the canvas by the drag (+80, +40 → snapped to the 8 px grid)', st.def.canvas.w === 720 && st.def.canvas.h % 8 === 0 && Math.abs(st.def.canvas.h - 340) <= 8, JSON.stringify(st.def.canvas));

  // ---- an element: exact box and ROTATION through the Layout fields; the dashboard renderer draws the rotation
  await page.click(`${S} [data-k=wst-add][data-type=shape]`); await wait(300);
  const id = (await state()).sel;
  await num('wst-x', 100); await num('wst-y', 60); await num('wst-w', 200); await num('wst-h', 120); await num('wst-rotate', 30);
  st = await state();
  const c1 = st.def.components.find((x) => x.id === id);
  const tf = await E(({ S, id }) => document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"]`).style.transform, { S, id });
  check('ELEMENT BOX + ROTATION by the Layout fields: 100, 60, 200 × 120, rotated 30° (drawn by the shared runtime)', c1.x === 100 && c1.y === 60 && c1.w === 200 && c1.h === 120 && c1.rotate === 30 && /rotate\(30deg\)/.test(tf), JSON.stringify({ c1, tf }));

  // ---- UNDO / REDO: the buttons and the keys
  await page.click(`${S} [data-k=wst-undo]`); await wait(400);
  st = await state();
  check('UNDO (button): the rotation is undone', !st.def.components.find((x) => x.id === id).rotate, JSON.stringify(st.def.components));
  await keys('Control+Shift+Z');
  st = await state();
  check('REDO (Ctrl + Shift + Z): rotated again', st.def.components.find((x) => x.id === id).rotate === 30);
  await keys('Control+Z'); await keys('Control+Z');
  st = await state();
  check('UNDO twice (Ctrl + Z): rotation and height back (120 → the earlier height)', !st.def.components.find((x) => x.id === id).rotate && st.def.components.find((x) => x.id === id).h !== 120, JSON.stringify(st.def.components.find((x) => x.id === id)));
  await keys('Control+Y'); await keys('Control+Y');
  st = await state();
  check('REDO (Ctrl + Y) twice: back to 200 × 120 at 30°', st.def.components.find((x) => x.id === id).h === 120 && st.def.components.find((x) => x.id === id).rotate === 30);

  // ---- COPY / PASTE (keys): a new element with a fresh id and name, offset 16 px, the same design
  await keys('Control+C'); await keys('Control+V');
  st = await state();
  const pasted = st.def.components.filter((x) => x.type === 'shape' && x.id !== id);
  check('COPY / PASTE (Ctrl + C / V): a second shape — fresh id and name, 16 px further, same rotation and configuration', pasted.length === 1 && pasted[0].x === 116 && pasted[0].y === 76 && pasted[0].rotate === 30
    && JSON.stringify(pasted[0].config) === JSON.stringify(c1.config) && pasted[0].name !== c1.name, JSON.stringify(pasted));
  await page.click(`${S} [data-k=wst-board]`, { position: { x: 3, y: 3 } }).catch(() => {}); await wait(200);   // nothing selected: the Widget panel
  await E((S) => document.querySelector(S).studio.select(null), S); await wait(300);
  await page.click(`${P} [data-k=wst-canvas-fit]`); await wait(400);
  st = await state();
  check('FIT TO CONTENT: the canvas fits the elements with the same margin on both sides', st.def.canvas.w > 300 && st.def.canvas.w < 720 && st.def.canvas.h < 340, JSON.stringify(st.def.canvas));
  const fitted = { ...st.def.canvas };

  // ---- C3 STYLING (Properties of a fresh shape, through the forms): conic fill with 3 colour stops, per-corner radius, an inner shadow;
  //      and the ELEMENT STYLE every element has: opacity, blend, glow (a shadow that follows the outline), clip with corner radii
  const F = (k) => `${P} .ef-field[data-key="${k}"]`;
  const rng = async (k, v, root = P) => { await page.fill(`${root} .ef-field[data-key="${k}"] input.ef-range__n`, String(v)); await page.press(`${root} .ef-field[data-key="${k}"] input.ef-range__n`, 'Enter'); await wait(250); };
  const ED = '[data-k=item-editor][open]';
  const addItem = async (col, fill) => { await page.click(`${P} [data-col="${col}"] [data-k=col-add]`); await page.waitForSelector(ED, { timeout: 8000 }); await fill(); await page.click(`${ED} [data-k=sub-save]`); await wait(300); };
  await page.click(`${S} [data-k=wst-add][data-type=shape]`); await wait(300);
  const sid = (await state()).sel;
  await page.selectOption(`${F('fillMode')} select`, 'conic'); await wait(300);
  for (const tok of ['info', 'purple', 'danger']) await addItem('stops', async () => { await page.click(`${ED} .ef-field[data-key="color"] .ef-icon[data-value="${tok}"]`); await wait(150); });
  await rng('radiusTL', 4);
  await addItem('innerShadows', async () => { await rng('y', 2, ED); await rng('blur', 6, ED); });
  await rng('style.opacity', 60);
  await page.selectOption(`${F('style.blend')} select`, 'screen'); await wait(250);
  await addItem('style.shadows', async () => { await rng('x', 0, ED); await rng('y', 0, ED); await rng('blur', 18, ED); await page.click(`${ED} .ef-field[data-key="color"] .ef-icon[data-value="info"]`); await wait(150); });
  await page.click(`${F('style.clip')} button[role=switch]`); await wait(250);
  await rng('style.radius', 20);
  st = await state();
  const sh = st.def.components.find((x) => x.id === sid);
  const css = await E(({ S, id }) => { const box = document.querySelector(`${S} [data-k=wst-board] .stw__c[data-cid="${id}"]`), s0 = getComputedStyle(box.querySelector('.iqel-shape__s'));
    return { bg: s0.backgroundImage, r: s0.borderTopLeftRadius, r2: s0.borderTopRightRadius, sh: s0.boxShadow, op: box.style.opacity, blend: box.style.mixBlendMode, filter: box.style.filter, clip: box.style.overflow, br: box.style.borderRadius }; }, { S, id: sid });
  check('FILL: a conic gradient with three colour stops (added in the stop list editor)', sh.config.fillMode === 'conic' && sh.config.stops.length === 3 && /conic-gradient/.test(css.bg), JSON.stringify({ cfg: sh.config.stops, bg: css.bg.slice(0, 120) }));
  check('PER-CORNER RADIUS: top-left 4 px, the others the shape radius', css.r === '4px' && css.r2 === '16px', `${css.r} ${css.r2}`);
  check('INNER SHADOW: drawn inside the shape', /inset/.test(css.sh), css.sh);
  check('ELEMENT STYLE: opacity 60 %, blend Screen, a glow that follows the outline (drop-shadow), clipped with a 20 px radius',
    css.op === '0.6' && css.blend === 'screen' && /drop-shadow/.test(css.filter) && css.clip === 'hidden' && /20px/.test(css.br) && sh.style.opacity === 60 && sh.style.shadows.length === 1, JSON.stringify({ css, style: sh.style }));
  await keys('Control+Z');
  st = await state();
  check('…and UNDO takes back the last style change (the clip radius)', (st.def.components.find((x) => x.id === sid).style || {}).radius !== 20, JSON.stringify(st.def.components.find((x) => x.id === sid).style));
  await keys('Control+Y');
  await E(({ S, id }) => document.querySelector(S).studio.select(id), { S, id: sid }); await wait(200);
  await page.focus(`${S} [data-k=wst-layer]`); await page.keyboard.press('Control+X'); await wait(300);
  st = await state();
  check('CUT (Ctrl + X): the styled shape leaves the canvas (in the clipboard)', !st.def.components.some((x) => x.id === sid));
  await keys('Control+V');
  st = await state();
  const back2 = st.def.components.find((x) => x.type === 'shape' && x.style && x.style.blend === 'screen');
  check('…PASTE brings it back with its whole style (fill stops, corners, inner shadow, element style)', !!back2 && back2.config.stops.length === 3 && back2.config.innerShadows.length === 1 && back2.style.clip === true, JSON.stringify(back2 && back2.style));

  // ---- SAVE → REOPEN: canvas and rotation kept
  await page.fill(`${S} [data-k=wst-name]`, 'Tilted cards');
  await page.click(`${S} [data-k=wst-save]`); await wait(1500);
  st = await state();
  const savedId = st.defId;
  const srv = (await libList()).find((w) => w.id === savedId);
  check('SAVE: stored with its canvas, the rotations and the styled shape (server-validated)', !!srv && srv.definition.canvas.w === fitted.w && srv.definition.components.filter((x) => x.rotate === 30).length === 2 && srv.definition.components.some((x) => x.style && x.style.blend === 'screen' && x.config.stops.length === 3), JSON.stringify(srv && srv.definition.canvas));
  await page.click(`${S} [data-k=wst-close]`); await wait(300);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await wait(300);
  await page.selectOption(`${S} [data-k=wst-widget]`, `def:${savedId}`); await wait(500);
  st = await state();
  check('REOPEN (the widget list): the same canvas, elements, rotation and styles', st.def.canvas.w === fitted.w && st.def.components.length === 3 && st.def.components.filter((x) => x.rotate === 30).length === 2 && st.def.components.some((x) => x.style && x.style.clip) && !st.dirty, JSON.stringify({ c: st.def.canvas, n: st.def.components.length }));

  // ---- EXPORT (the download) → IMPORT (the file chooser): a NEW definition with the same design
  await E((S) => document.querySelector(S).studio.select(null), S); await wait(300);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${P} [data-k=wst-file-export]`)]);
  const file = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('EXPORT: an IniqDash widget file with the design and its collection (by name)', file.format === 'iniqdash-studio-widgets' && file.widgets.length === 1 && file.widgets[0].collection === 'Design tools'
    && file.widgets[0].definition.canvas.w === fitted.w, JSON.stringify(file).slice(0, 200));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iq-studio-')), tmp = path.join(tmpDir, 'widget.json'); fs.writeFileSync(tmp, JSON.stringify(file));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${P} [data-k=wst-file-import]`)]);
  await chooser.setFiles(tmp); await wait(1500); fs.rmSync(tmpDir, { recursive: true, force: true });
  const lib = (await libList());
  const copies = lib.filter((w) => w.definition.meta.name === 'Tilted cards');
  st = await state();
  check('IMPORT: a second definition (a new id), the same canvas and components; Studio opens it', copies.length === 2 && copies.every((w) => JSON.stringify(w.definition.components) === JSON.stringify(srv.definition.components)) && st.defId !== savedId,
    JSON.stringify(copies.map((w) => w.id)));
  const importedId = st.defId;

  // ---- DUPLICATE (the Widget panel): a copy, unsaved, named "… copy"
  await E((S) => document.querySelector(S).studio.select(null), S); await wait(300);
  await page.click(`${P} [data-k=wst-file-duplicate]`); await wait(400);
  st = await state();
  check('DUPLICATE WIDGET: an unsaved copy "Tilted cards copy" with the same design', st.def.name === 'Tilted cards copy' && st.defId === null && st.def.components.length === 3 && st.dirty, JSON.stringify({ n: st.def.name, id: st.defId }));

  // ---- DELETE: refused while a dashboard places a copy (named); allowed when unused
  await page.click(`${S} [data-k=wst-close]`); await wait(300);
  await E((id) => { const m = window.editor.getModel(); m.pages[0].items.push({ id: 'tilted', type: 'studio', parent: null, config: { definition: id, entities: {} }, layout: { desktop: { x: 1, y: 1, w: 4, h: 4 }, tablet: { x: 1, y: 1, w: 4, h: 4 }, mobile: { w: 4, h: 4 } } });
    const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join()); }, savedId);
  await E(() => window.editor.save()); await wait(800);
  await page.click('[data-k=studio]'); await page.waitForSelector(S); await wait(300);
  await page.selectOption(`${S} [data-k=wst-widget]`, `def:${savedId}`); await wait(500);
  await E((S) => document.querySelector(S).studio.select(null), S); await wait(300);
  await page.click(`${P} [data-k=wst-file-delete]`); await wait(200); await page.click(`${P} [data-k=wst-file-delete]`); await wait(1200);
  const msg = await page.textContent(`${P} [data-k=wst-file-msg]`);
  const still = (await libList()).some((w) => w.id === savedId);
  check('DELETE (confirmed): REFUSED while a dashboard uses it — the dashboard is named, the definition stays', still && /Not deleted: it is placed on/.test(msg), msg);
  await page.selectOption(`${S} [data-k=wst-widget]`, `def:${importedId}`); await wait(500);
  await E((S) => document.querySelector(S).studio.select(null), S); await wait(300);
  await page.click(`${P} [data-k=wst-file-delete]`); await wait(200); await page.click(`${P} [data-k=wst-file-delete]`); await wait(1200);
  const gone = !(await libList()).some((w) => w.id === importedId);
  check('DELETE an unused widget: removed from the library (and the widget list)', gone && !(await E(({ S, id }) => [...document.querySelectorAll(`${S} [data-k=wst-widget] option`)].some((o) => o.value === `def:${id}`), { S, id: importedId })));
  check('no page error', B.errors.length === 0, B.errors.slice(0, 3).join(' | '));
} catch (e) {
  check('studio-design-tools test ran', false, e.stack);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
