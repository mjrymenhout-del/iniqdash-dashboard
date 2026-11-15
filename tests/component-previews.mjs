/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// LIVE PREVIEW INSIDE THE ITEM EDITOR — an element of a standard widget is edited in an item editor: a modal over the configuration that
// hides the configuration's Live preview. The item editor draws that same preview ITSELF (the host's previewer: the configure dialog's
// own drawing of the widget — the real renderer, its size; the Popup settings' own drawing of the popup) from the UNSAVED values, on every
// change, the edited element outlined. Verified through real UI interaction, property by property: the drawing INSIDE THE MODAL changes
// (DOM and pixels) and is exactly the configuration's own drawing; Cancel restores the saved configuration; Save + Apply persists; nothing
// reaches Home Assistant. Real editor, real PHP server, FAKE Home Assistant (tests/lib/live.mjs — not a real Home Assistant).
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';
import { roomPopup, POPUP_ID } from './lib/room-popup.mjs';

const SHOTS = process.env.SHOTS || '';
const CFG = 'dialog.ed-dlg--cfg[open]', ED = `${CFG} [data-k=item-editor]`, PV = `${ED} [data-k=item-preview]`, BG = `${CFG} .ecfg-pv`;
let L, B;
try {
  L = await live();
  L.setEntity('climate.salon', 'heat', { name: 'Salon', f: 1, cur: 21.4, target: 22.5, min: 7, max: 30, step: 0.5, modes: ['heat', 'cool', 'off'], action: 'heating' });
  L.setEntity('light.desk', 'on', { name: 'Desk', f: 0, br: 180, cm: 'brightness', scm: ['brightness'] });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.emulateMedia({ reducedMotion: 'reduce' });                  // still frames: a pixel difference is a real difference
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const services = () => L.haCalls.filter((x) => /\/api\/services\//.test(x.url)).length;
  const add = (id, type, config, y) => E(({ id, type, config, y }) => { const m = window.editor.getModel(); m.pages[0].items.push({ id, type, parent: null, config, layout: { desktop: { x: 1, y, w: 6, h: 9 }, tablet: { x: 1, y, w: 6, h: 9 }, mobile: { w: 4, h: 9 } } }); window.editor.setModel(m); }, { id, type, config, y });
  const open = async (id) => { await page.click(`.ed-canvas [data-grid-id="${id}"]`, { position: { x: 12, y: 12 }, force: true }); await page.waitForTimeout(150); await E(() => document.querySelector('[data-k="edit-config"]').click());
    await page.waitForSelector(`${CFG} .ef`); await E((CFG) => document.querySelectorAll(`${CFG} details.ef-group--acc`).forEach((d) => { d.open = true; }), CFG); await page.waitForTimeout(400); };
  const rowsOf = (col, D = CFG) => E(({ D, col }) => [...document.querySelectorAll(`${D} [data-col="${col}"] .ef-col__row`)].map((r) => r.querySelector('.ef-col__t').textContent), { D, col });
  const editRow = async (col, title) => { const i = (await rowsOf(col)).indexOf(title); await E(({ CFG, col, i }) => document.querySelector(`${CFG} [data-col="${col}"] [data-index="${i}"] [data-k=col-edit]`).click(), { CFG, col, i }); await page.waitForSelector(ED); await page.waitForTimeout(450); };
  const cfgOf = (id) => E((id) => structuredClone(window.editor.getModel().pages[0].items.find((i) => i.id === id).config), id);
  /** a UI change in the open item editor (select · range · switch · colour · text) */
  const set = async (ed, key, kind, v) => {
    const f = `${ed} .ef-field[data-key="${key}"]`;
    if (kind === 'select') await page.selectOption(`${f} select`, v);
    else if (kind === 'range') { await page.fill(`${f} input.ef-range__n`, String(v)); await page.press(`${f} input.ef-range__n`, 'Enter'); }
    else if (kind === 'switch') await page.click(`${f} button[role=switch]`);
    else if (kind === 'color') await page.click(`${f} .ef-icon[data-value="${v}"]`);
    else if (kind === 'icon') { await page.click(`${f} [data-k=icon-field]`); await page.fill(`${f} .iqi__search`, v); await page.click(`${f} .iqi__opt[data-icon="mdi:${v}"]`); }
    else await page.fill(`${f} input`, String(v));
    await page.waitForTimeout(450);
  };
  /** an element's DRAWING (its markup without per-instance ids), in the modal and in the configuration's own preview behind it */
  const sigOf = (root, sel) => E(({ root, sel }) => { const n = document.querySelector(`${root} ${sel}`); return n ? n.outerHTML.replace(/\s(id|aria-labelledby|aria-describedby|for)="[^"]*"/g, '').replace(/url\(#[^)]*\)|#iqdl\d+[^"' ]*|iqdl\d+-[a-z]+/g, '#') : null; }, { root, sel });
  const shot = async (sel) => { const h = await page.$(sel); return h ? h.screenshot() : null; };

  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await add('cl', 'climate', { entity: 'climate.salon', name: 'Salon' }, 1);
  await add('lt', 'light', { entity: 'light.desk', name: 'Desk' }, 11);
  await page.waitForTimeout(900);
  const n0 = services();

  // ================================================================ CLIMATE DIAL — every appearance property, one by one, inside the modal
  await open('cl');
  const saved0 = await cfgOf('cl');
  await page.selectOption(`${CFG} [data-k=pv-size]`, 'actual'); await page.waitForTimeout(400);   // the Live preview at this widget's own size (6 × 9)
  await editRow('controls', 'Thermostat dial');
  const first = { modal: await sigOf(PV, '.iqdl'), bg: await sigOf(BG, '.iqdl'), focus: await E((PV) => !!document.querySelector(`${PV} [data-k=item-preview-focus]`), PV),
    card: await E((PV) => !!document.querySelector(`${PV} .ecfg-pv__box .cw`), PV) };
  check('DIAL editor: its modal draws the ACTUAL Climate card (the widget\'s renderer — not a copy) with the dial outlined, identical to the configuration\'s Live preview behind it',
    first.card && first.focus && first.modal && first.modal === first.bg, JSON.stringify({ ...first, modal: !!first.modal }));
  if (SHOTS) await (await page.$(ED)).screenshot({ path: path.join(SHOTS, 'dial-0-before.png') });
  { // WHOLE WIDGET | THIS ELEMENT: the same real drawing, zoomed onto the edited dial
    const dialW = () => E((PV) => Math.round(document.querySelector(`${PV} .iqdl`).getBoundingClientRect().width), PV);
    const whole = await dialW(), modeShown = await E((ED) => !document.querySelector(`${ED} [data-k=item-preview-element]`).closest('[hidden]'), ED);
    await page.click(`${ED} [data-k=item-preview-element]`); await page.waitForTimeout(300);
    const zoomed = await dialW(), stageW = await E((PV) => document.querySelector(`${PV} .ef-sub__pv-stage`).clientWidth, PV);
    const sameDrawing = (await sigOf(PV, '.iqdl')) === (await sigOf(BG, '.iqdl'));
    await set(ED, 'dial.design', 'select', 'minimal');
    const stillZoomed = await E((PV) => document.querySelector(`${PV} .ef-sub__pv-stage`).dataset.zoom === 'element' && !!document.querySelector(`${PV} .iqdl`), PV);
    const followed = (await sigOf(PV, '.iqdl')) === (await sigOf(BG, '.iqdl'));
    if (SHOTS) await (await page.$(ED)).screenshot({ path: path.join(SHOTS, 'dial-element-zoom.png') });
    await set(ED, 'dial.design', 'select', 'spectrum');
    await page.click(`${ED} [data-k=item-preview-whole]`); await page.waitForTimeout(300);
    const back = await dialW();
    check('THIS ELEMENT: the item editor\'s preview can zoom onto the edited dial — the SAME real drawing (identical to the configuration\'s), now large; it keeps following every change; Whole widget returns',
      modeShown && zoomed > whole * 1.3 && zoomed <= stageW + 2 && sameDrawing && stillZoomed && followed && Math.abs(back - whole) <= 2, JSON.stringify({ modeShown, whole, zoomed, stageW, sameDrawing, stillZoomed, followed, back }));
  }
  const steps = [
    ['dial.valueSize', 'range', 44, 'value size 44 px'], ['dial.label', 'text', 'Living', 'label "Living"'], ['dial.labelSize', 'range', 16, 'label size 16 px'],
    ['dial.showCurrent', 'switch', null, 'room temperature off'], ['dial.showAction', 'switch', null, 'state text off'], ['dial.ticks', 'switch', null, 'tick marks off'],
    ['dial.minmax', 'switch', null, 'min / max off'], ['dial.ring', 'select', 'gradient', 'ring: gradient'], ['dial.heatColor', 'color', 'purple', 'heating colour purple'],
    ['dial.size', 'range', 150, 'dial size 150 px'], ['dial.design', 'select', 'minimal', 'design Minimal ring'], ['dial.thickness', 'range', 12, 'ring thickness 12'],
    ['dial.marker', 'switch', null, 'marker off'], ['dial.design', 'select', 'arc', 'design State arc'], ['dial.arc', 'select', 'glow', 'arc: glow'],
    ['dial.design', 'select', 'full', 'design Full dial'], ['dial.ticks', 'switch', null, 'tick marks on again'], ['dial.density', 'select', 'simple', 'tick density simple (ticks shown)'], ['dial.face', 'select', 'dark', 'face dark'],
    ['dial.design', 'select', 'digital', 'design Digital ring'], ['dial.ringColor', 'color', 'info', 'ring colour'], ['dial.surface', 'select', 'glass', 'face: glass'], ['dial.depth', 'select', 'raised', 'depth: raised'],
    ['dial.activeArc', 'switch', null, 'active arc on']];
  const results = [];
  let prev = first.modal, prevPx = await shot(`${PV} .ef-sub__pv-stage`);
  for (const [key, kind, v, what] of steps) {
    await set(ED, key, kind, v);
    const modal = await sigOf(PV, '.iqdl'), bg = await sigOf(BG, '.iqdl'), px = await shot(`${PV} .ef-sub__pv-stage`);
    if (SHOTS && px) (await import('node:fs')).writeFileSync(path.join(SHOTS, `dial-step-${results.length + 1}.png`), px);
    results.push({ what, changed: modal !== prev, same: modal === bg, pixels: !!(px && prevPx && Buffer.compare(px, prevPx) !== 0) });
    prev = modal; prevPx = px;
  }
  if (SHOTS) await (await page.$(ED)).screenshot({ path: path.join(SHOTS, 'dial-1-after.png') });
  const bad = results.filter((r) => !r.changed || !r.same || !r.pixels);
  check(`DIAL — ${results.length} appearance changes made through the editor, EACH visibly redrawn INSIDE THE MODAL at once (its drawing and its pixels change) and identical to the configuration's own drawing: ${results.map((r) => r.what).join(' · ')}`,
    bad.length === 0, JSON.stringify(bad));
  await page.click(`${ED} [data-k=sub-cancel]`); await page.waitForTimeout(500);
  const afterCancel = { cfg: await cfgOf('cl'), bg: await sigOf(BG, '.iqdl'), gone: await E((ED) => !document.querySelector(ED), ED) };
  await editRow('controls', 'Thermostat dial');
  const reopened = await sigOf(PV, '.iqdl');
  check('CANCEL: the editor closes; the configuration\'s preview shows the SAVED dial again; reopened, the modal draws the saved dial (Spectrum ring) — nothing persisted',
    afterCancel.gone && afterCancel.bg === first.bg && reopened === first.modal && JSON.stringify(afterCancel.cfg) === JSON.stringify(saved0), JSON.stringify({ bgSame: afterCancel.bg === first.bg, reopenSame: reopened === first.modal }));
  await set(ED, 'dial.design', 'select', 'full'); await set(ED, 'dial.heatColor', 'color', 'purple'); await set(ED, 'dial.valueSize', 'range', 40);
  const edited = await sigOf(PV, '.iqdl');
  await page.click(`${ED} [data-k=sub-save]`); await page.waitForTimeout(400);
  await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(600);
  const cfg1 = await cfgOf('cl'), dl = (cfg1.controls || []).find((x) => x.type === 'dial');
  await open('cl'); await page.selectOption(`${CFG} [data-k=pv-size]`, 'actual'); await page.waitForTimeout(400); await editRow('controls', 'Thermostat dial');
  const reread = await sigOf(PV, '.iqdl');
  await page.click(`${ED} [data-k=sub-cancel]`); await page.waitForTimeout(300);
  check('SAVE + APPLY: the dial\'s design (Full dial), heating colour (purple) and value size (40) are stored; reopened, the modal draws exactly what was saved',
    dl && dl.design === 'full' && dl.heatColor === 'purple' && dl.valueSize === 40 && reread === edited, JSON.stringify(dl));

  // ================================================================ CLIMATE — power, HVAC mode, an information item (the same mechanism)
  await editRow('controls', 'Power');
  await set(ED, 'show', 'switch', null);
  const p0 = await sigOf(PV, '[data-k="power"]');
  await set(ED, 'power.style', 'select', 'outline'); const p1 = await sigOf(PV, '[data-k="power"]');
  await set(ED, 'power.icon', 'icon', 'radiator'); const p2 = await sigOf(PV, '[data-k="power"]');
  await set(ED, 'power.size', 'range', 60); const p3 = await sigOf(PV, '[data-k="power"]');
  const pBg = await sigOf(BG, '[data-k="power"]'), pFocus = await E((PV) => !!document.querySelector(`${PV} [data-k=item-preview-focus]`), PV);
  await page.click(`${ED} [data-k=sub-cancel]`); await page.waitForTimeout(300);
  check('POWER: "Show on the card" puts it IN THE MODAL\'s card; style Outline, icon radiator, size 60 each redraw it there; identical to the configuration\'s drawing; outlined',
    p0 && p1 !== p0 && p2 !== p1 && p3 !== p2 && /data-style="outline"/.test(p3) && /radiator/.test(p3) && p3 === pBg && pFocus, JSON.stringify({ p0: !!p0, p3: (p3 || '').slice(0, 160) }));
  await editRow('controls', 'HVAC mode');
  const m0 = await sigOf(PV, '[data-k="mode"]'); await set(ED, 'labels', 'switch', null); const m1 = await sigOf(PV, '[data-k="mode"]');
  await page.click(`${ED} [data-k=sub-cancel]`); await page.waitForTimeout(300);
  check('HVAC MODE: "Show labels" redraws the mode control in the modal (Heat / Cool / Off labels appear)', m0 && m1 && m1 !== m0 && /Heat/.test(m1), JSON.stringify({ m0: !!m0, m1: !!m1 }));
  await E((CFG) => document.querySelector(`${CFG} [data-col="info"] [data-k=col-add]`).click(), CFG); await page.waitForSelector(ED); await page.waitForTimeout(400);
  const fx = `${ED} .ef-field[data-key="entity"]`;
  await page.click(`${fx} [data-k=iqp-choose]`); await page.waitForTimeout(200); await page.fill(`${fx} .iqp__search`, 'climate.salon'); await page.waitForTimeout(250);
  await page.click(`${fx} .iqp__item[data-entity="climate.salon"]`); await page.waitForTimeout(450);
  await set(ED, 'label', 'text', 'Humidity');
  const inf = await E((PV) => [...document.querySelectorAll(`${PV} [data-fact]`)].map((f) => f.textContent).join(' | '), PV);
  await page.click(`${ED} [data-k=sub-cancel]`); await page.waitForTimeout(300);
  check('INFORMATION (Climate): a new item (entity climate.salon) and its label "Humidity" appear in the modal\'s card as they are chosen; Cancel adds nothing', /Humidity/.test(inf) && !(await rowsOf('info')).length, inf);
  await page.click(`${CFG} .ecfg-foot button:has-text("Cancel")`); await page.waitForTimeout(400);

  // ================================================================ LIGHT — power
  await open('lt'); await editRow('controls', 'Power');
  const l0 = await sigOf(PV, '.lw__power'); await set(ED, 'power.style', 'select', 'soft'); const l1 = await sigOf(PV, '.lw__power'); const l1bg = await sigOf(BG, '.lw__power');
  await set(ED, 'power.color', 'color', 'success'); const l2 = await sigOf(PV, '.lw__power');
  // THIS ELEMENT on a button: the same drawing zoomed onto the power button, still following a change
  const pw = () => E((PV) => Math.round(document.querySelector(`${PV} .lw__power`).getBoundingClientRect().width), PV);
  const pw0 = await pw(); await page.click(`${ED} [data-k=item-preview-element]`); await page.waitForTimeout(400); const pw1 = await pw();
  await set(ED, 'power.style', 'select', 'outline'); const lz = await sigOf(PV, '.lw__power'), lzbg = await sigOf(BG, '.lw__power');
  check('THIS ELEMENT (a button): the Light power button zoomed in the modal (the same real drawing), still following a style change', pw1 > pw0 * 1.5 && /data-style="outline"/.test(lz) && lz === lzbg, JSON.stringify({ pw0, pw1 }));
  await page.click(`${ED} [data-k=sub-cancel]`); await page.waitForTimeout(300);
  check('LIGHT POWER: style Soft and colour Success each redraw the power button inside the modal\'s Light card, identical to the configuration\'s drawing', l0 && l1 !== l0 && /data-style="soft"/.test(l1) && l1 === l1bg && l2 !== l1, JSON.stringify({ l0: !!l0, l1: !!l1 }));
  await page.click(`${CFG} .ecfg-foot button:has-text("Cancel")`); await page.waitForTimeout(400);

  // ================================================================ POPUP — a hero information item (Popup settings: the same mechanism)
  const D = 'dialog.ed-dlg--popup[open]', PED = `${D} [data-k=item-editor]`, PPV = `${PED} [data-k=item-preview]`;
  await E((pp) => { const m = window.editor.getModel(); m.popups = [...(m.popups || []).filter((x) => x.id !== pp.id), pp]; window.editor.setModel(m); }, roomPopup());
  await E((id) => window.editor.designPopup(id), POPUP_ID); await page.waitForTimeout(700);
  await page.click('[data-k="popup-settings"]'); await page.waitForSelector(D);
  await E((D) => { const d = document.querySelector(`${D} details[data-group="information"]`); if (d && !d.open) d.querySelector('summary').click(); }, D); await page.waitForTimeout(300);
  await page.click(`${D} [data-col="heroInfo"] [data-index="0"] [data-k=col-edit]`); await page.waitForSelector(PED); await page.waitForTimeout(500);
  const f0 = await E((PPV) => { const p = document.querySelector(PPV); return p && !p.hidden ? { panel: !!p.querySelector('.mpop__panel'), facts: [...p.querySelectorAll('.mpop__fact')].map((f) => f.textContent) } : null; }, PPV);
  await set(PED, 'label', 'text', 'Battery level'); await set(PED, 'style', 'select', 'emphasis');
  const f1 = await E((PPV) => [...document.querySelectorAll(`${PPV} .mpop__fact`)].map((f) => `${f.dataset.style}:${f.textContent}`), PPV);
  await page.click(`${PED} [data-k=sub-cancel]`); await page.waitForTimeout(300);
  check('POPUP hero information: its modal draws the ACTUAL popup panel; label "Battery level" and style Emphasis appear there at once', f0 && f0.panel && f1.some((t) => t.startsWith('emphasis:') && /Battery level/.test(t)), JSON.stringify({ f0, f1 }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  check('NO Home Assistant service call from opening, editing, cancelling or saving any item editor', services() === n0, String(services() - n0));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
