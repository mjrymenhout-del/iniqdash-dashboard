/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// SHARED APPEARANCE through the REAL configuration interface (components/widget-kit surface() + the Appearance fields of every widget):
// for a Climate, a Chart, a Light and a Sensor — open Configure, choose a card style preset, change the background (gradient · image from the
// built-in scenes), border, glow, glow colour and text colour with the visible controls, Apply, Save, RELOAD, reopen: every choice is still
// shown and still rendered; RESIZE with the keyboard: the card style follows the new size and the size is saved; a widget made before these
// settings existed is unchanged. Real PHP server, no Home Assistant needed (demo values).
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const CFG = 'dialog.ed-dlg--cfg[open]';
const L1 = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y, w: Math.min(w, 8), h }, mobile: { w: 4, h } });
let L, B;
try {
  L = await live({ configureHa: false });
  const c = L.client(); await c.login();
  const model = { version: 3, app: { id: 'appearance', startPage: 'p', navigation: {} }, pages: [{ id: 'p', name: 'Appearance', nav: true, items: [
    { id: 'cl', type: 'climate', parent: null, config: { name: 'Living room', variant: 'dial' }, layout: L1(1, 1, 4, 7) },
    { id: 'ch', type: 'chart', parent: null, config: { name: 'Solar', unit: 'W', kind: 'area' }, layout: L1(5, 1, 4, 5) },
    { id: 'li', type: 'light', parent: null, config: { name: 'Pendant', variant: 'slider' }, layout: L1(9, 1, 4, 3) },
    { id: 'se', type: 'sensor', parent: null, config: { name: 'Indoor', value: 21.4, unit: '°C' }, layout: L1(9, 4, 2, 3) },
    { id: 'old', type: 'sensor', parent: null, config: { name: 'Older widget', value: 18, unit: '°C', widgetBg: 'opacity', widgetBgOpacity: 60 }, layout: L1(11, 4, 2, 3) },
    { id: 'bar', type: 'chart', parent: null, config: { name: 'Daily', unit: 'kWh', kind: 'bar' }, layout: L1(1, 12, 4, 5) },
    { id: 'rm', type: 'custom.room-scene', parent: null, config: { name: 'Kitchen', variant: 'card' }, layout: L1(5, 12, 4, 5) },
    { id: 'en', type: 'energy', parent: null, config: { name: 'Energy', variant: 'circles' }, layout: L1(9, 12, 4, 5) },
    { id: 'pr', type: 'presence', parent: null, config: { name: 'Who is home', variant: 'row' }, layout: L1(1, 17, 5, 3) }] }] };
  const id = (await (await c.post('/api/dashboards.php', { action: 'create', name: 'Appearance test', dashboard: model })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  const E = (fn, a) => page.evaluate(fn, a);
  const openEditor = async () => { await page.goto(`${L.base}/editor.html?d=${id}`); await page.waitForFunction(() => window.editor, null, { timeout: 20000 }); await page.waitForTimeout(800); await E(() => window.editor.setEditing(true)); await page.waitForTimeout(800); };
  const open = async (wid) => { await page.click(`.ed-canvas [data-grid-id="${wid}"]`, { position: { x: 10, y: 10 }, force: true }); await page.waitForTimeout(150);
    await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector(`${CFG} .ef`);
    await E((CFG) => document.querySelectorAll(`${CFG} details.ef-group--acc`).forEach((d) => { d.open = true; }), CFG); await page.waitForTimeout(500); };
  const sel = async (key, v) => { await page.selectOption(`${CFG} .ef-field[data-key="${key}"] select`, v); await page.waitForTimeout(350); };
  const num = async (key, v) => { const q = `${CFG} .ef-field[data-key="${key}"] input.ef-range__n`; await page.fill(q, String(v)); await page.press(q, 'Enter'); await page.waitForTimeout(300); };
  const swatch = async (key, v) => { await page.click(`${CFG} .ef-field[data-key="${key}"] .ef-icon[data-value="${v}"]`); await page.waitForTimeout(300); };
  const apply = async () => { await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(600); };
  const shownValue = (key) => E(({ CFG, key }) => { const f = document.querySelector(`${CFG} .ef-field[data-key="${key}"]`); if (!f || f.closest('[hidden]')) return null;
    const s = f.querySelector('select'), n = f.querySelector('input.ef-range__n'), on = f.querySelector('[aria-pressed="true"], [aria-checked="true"]');
    return s ? s.value : n ? Number(n.value) : on ? on.dataset.value : null; }, { CFG, key });
  const close = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };
  const rendered = (wid) => E((wid) => { const g = document.querySelector(`.ed-canvas [data-grid-id="${wid}"]`); const w = g && g.querySelector('.iq-wsurf'); if (!w) return null;
    const lay = w.querySelector(':scope > .iq-wsurf__layer'), lr = lay && lay.getBoundingClientRect(), wr = w.getBoundingClientRect();
    return { bg: lay ? getComputedStyle(lay).backgroundImage : '', border: lay ? getComputedStyle(lay).borderTopWidth + ' ' + getComputedStyle(lay).borderTopStyle : '', shadow: getComputedStyle(w).boxShadow,
      text: w.dataset.iqText || '', fits: !!lr && Math.abs(lr.width - wr.width) < 2 && Math.abs(lr.height - wr.height) < 2, w: Math.round(wr.width), h: Math.round(wr.height) }; }, wid);

  await openEditor();
  const before = await E(() => [...document.querySelectorAll('.ed-canvas [data-grid-id="old"] .iq-wsurf')].length);
  // ---- Climate: preset "Midnight gradient", then glow 40 % in the info colour, border 2 px
  await open('cl');
  const ui = await E((CFG) => ['appearancePreset', 'widgetBg', 'borderWidth', 'shadow', 'cardGlow', 'textTone', 'accentColor'].filter((k) => !document.querySelector(`${CFG} .ef-field[data-key="${k}"]`)), CFG);
  check('the Appearance section offers: card style preset, card background, border, shadow, glow, text colour, accent colour', ui.length === 0, JSON.stringify(ui));
  await sel('appearancePreset', 'midnight');
  check('a preset fills in the settings it stands for (Midnight gradient → Gradient, start / end colours shown)', await shownValue('widgetBg') === 'gradient' && await shownValue('bgAngle') === 160);
  await num('cardGlow', 40); await swatch('cardGlowColor', 'info'); await num('borderWidth', 2);
  await apply();
  // ---- Chart: gradient by hand (start / end swatches, 90°), shadow strong
  await open('ch');
  await sel('widgetBg', 'gradient'); await swatch('bgFrom', 'purple'); await swatch('bgTo', 'info'); await num('bgAngle', 90); await sel('shadow', 'strong');
  await apply();
  // ---- Light: an image from the built-in scenes, darkening 60 % at the bottom, light text
  await open('li');
  await sel('widgetBg', 'image');
  await page.click(`${CFG} .ef-field[data-key="bgImage"] .ef-art__t--builtin[data-value="assets/img/scenes/living.jpg"]`); await page.waitForTimeout(400);
  await num('bgOverlay', 60); await sel('bgOverlayMode', 'bottom'); await sel('textTone', 'light');
  await apply();
  // ---- Sensor: preset "Ember" (warm, active)
  await open('se'); await sel('appearancePreset', 'ember'); await apply();
  const saved = await E(() => window.editor.save());
  check('saved on the server', !!saved);

  // ---- RELOAD: stored, rendered, and shown again in the settings
  await openEditor();
  const cfg = await E(() => Object.fromEntries(window.editor.getModel().pages[0].items.map((i) => [i.id, i.config])));
  check('stored after reload — Climate: gradient (Midnight), glow 40 % info, border 2 px', cfg.cl.widgetBg === 'gradient' && cfg.cl.bgFrom === '#1c2438' && cfg.cl.cardGlow === 40 && cfg.cl.cardGlowColor === 'info' && cfg.cl.borderWidth === 2, JSON.stringify(cfg.cl));
  check('…Chart: gradient purple → info at 90°, strong shadow', cfg.ch.widgetBg === 'gradient' && cfg.ch.bgFrom === 'purple' && cfg.ch.bgTo === 'info' && cfg.ch.bgAngle === 90 && cfg.ch.shadow === 'strong', JSON.stringify(cfg.ch));
  check('…Light: the living-room scene, 60 % darkening at the bottom, light text', cfg.li.widgetBg === 'image' && cfg.li.bgImage === 'assets/img/scenes/living.jpg' && cfg.li.bgOverlay === 60 && cfg.li.bgOverlayMode === 'bottom' && cfg.li.textTone === 'light', JSON.stringify(cfg.li));
  check('…Sensor: Ember (gradient, glow, light text, white accent)', cfg.se.widgetBg === 'gradient' && cfg.se.cardGlow === 45 && cfg.se.textTone === 'light' && cfg.se.accentColor === '#ffffff', JSON.stringify(cfg.se));
  const r = { cl: await rendered('cl'), ch: await rendered('ch'), li: await rendered('li'), se: await rendered('se') };
  check('rendered after reload: gradients, the scene image, borders, shadows and glows on the card — not on the content',
    /linear-gradient/.test(r.cl.bg) && r.cl.border.startsWith('2px') && /0px 0px \d+px/.test(r.cl.shadow) && /linear-gradient\(90deg/.test(r.ch.bg) && /scenes\/living\.jpg/.test(r.li.bg) && r.li.text === 'light' && /linear-gradient/.test(r.se.bg),
    JSON.stringify(r).slice(0, 600));
  check('the card style covers each widget exactly', Object.values(r).every((x) => x.fits), JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.fits]))));
  await open('cl');
  const re = { bg: await shownValue('widgetBg'), glow: await shownValue('cardGlow'), gc: await shownValue('cardGlowColor'), bw: await shownValue('borderWidth') };
  check('reopened, the Climate settings show what was chosen (Gradient · glow 40 · info · border 2)', re.bg === 'gradient' && re.glow === 40 && re.gc === 'info' && re.bw === 2, JSON.stringify(re));
  await close();
  await open('li');
  const reL = { bg: await shownValue('widgetBg'), img: await E((CFG) => document.querySelector(`${CFG} .ef-field[data-key="bgImage"] .ef-art__t--builtin[aria-pressed="true"]`)?.dataset.value, CFG), ov: await shownValue('bgOverlay'), tt: await shownValue('textTone') };
  check('…and the Light settings (Image · the living-room scene selected · 60 · light text)', reL.bg === 'image' && reL.img === 'assets/img/scenes/living.jpg' && reL.ov === 60 && reL.tt === 'light', JSON.stringify(reL));
  await close();

  // ---- RESIZE with the keyboard (the editor's own resize): the style follows, the size is saved, the neighbours stay
  const before2 = await rendered('cl');
  const neighbour = await E(() => JSON.stringify(window.editor.getModel().pages[0].items.find((i) => i.id === 'ch').layout.desktop));
  await page.click('.ed-canvas [data-grid-id="cl"]', { position: { x: 10, y: 10 }, force: true }); await page.waitForTimeout(200);
  for (let i = 0; i < 2; i++) { await page.keyboard.press('Shift+ArrowDown'); await page.waitForTimeout(250); }
  await page.waitForTimeout(800);
  const after = await rendered('cl');
  check('resized taller with the keyboard: the card style follows the new size exactly', after.h > before2.h && after.fits && /linear-gradient/.test(after.bg), JSON.stringify({ before: before2.h, after: after.h, fits: after.fits }));
  await E(() => window.editor.save());
  await openEditor();
  const lay = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'cl').layout.desktop);
  const nb2 = await E(() => JSON.stringify(window.editor.getModel().pages[0].items.find((i) => i.id === 'ch').layout.desktop));
  check('…the new size is saved and reloaded; the neighbouring widget did not move', lay.h === 9 && nb2 === neighbour, JSON.stringify({ lay, neighbour, nb2 }));
  // ---- an older widget (made before these settings): unchanged, its old setting still works
  const old = await rendered('old');
  check('a widget made before these settings existed keeps its look (custom opacity 60 %, no new keys added)', before === 1 && old && !old.text && Object.keys(cfg.old).every((k) => ['name', 'value', 'unit', 'widgetBg', 'widgetBgOpacity', 'icon', 'precision', 'status', 'tone'].includes(k)), JSON.stringify(cfg.old));
  // ---- MORE WIDGETS through the same dialog: the Chart's own style (bars), a Room card, the Energy flow, the new Who's home widget
  await open('bar'); await num('barRadius', 10); await num('barWidth', 80); await swatch('colorTo', 'info'); await sel('appearancePreset', 'glass'); await apply();
  await open('rm'); await sel('appearancePreset', 'aurora'); await apply();
  await open('en'); await sel('widgetBg', 'solid'); await swatch('bgColor', 'purple'); await num('borderWidth', 1); await apply();
  await open('pr'); await sel('appearancePreset', 'sunlit'); await apply();
  check('more widgets saved', !!(await E(() => window.editor.save())));
  await openEditor();
  const cfg2 = await E(() => Object.fromEntries(window.editor.getModel().pages[0].items.map((i) => [i.id, i.config])));
  const barRx = await E(() => Number(document.querySelector('.ed-canvas [data-grid-id="bar"] .ch__data--bar rect')?.getAttribute('rx')));
  check('Chart style through the dialog: bar corners 10, width 80 %, gradient to info — stored, and the bars are drawn with round corners',
    cfg2.bar.barRadius === 10 && cfg2.bar.barWidth === 80 && cfg2.bar.colorTo === 'info' && cfg2.bar.widgetBg === 'opacity' && barRx > 3, JSON.stringify({ c: cfg2.bar, barRx }));
  const r2 = { rm: await rendered('rm'), en: await rendered('en'), pr: await rendered('pr') };
  check('Room card (Aurora), Energy flow (solid purple, border) and Who\'s home (Sunlit): stored and drawn on the card after reload',
    cfg2.rm.widgetBg === 'gradient' && cfg2.rm.bgShape === 'radial' && cfg2.en.widgetBg === 'solid' && cfg2.en.bgColor === 'purple' && cfg2.en.borderWidth === 1 && cfg2.pr.textTone === 'light'
    && /radial-gradient/.test(r2.rm?.bg || '') && /1px solid/.test(r2.en?.border || '') && /linear-gradient/.test(r2.pr?.bg || '') && Object.values(r2).every((x) => x && x.fits), JSON.stringify(r2).slice(0, 500));
  await open('bar');
  check('reopened, the Chart shows its style (corners 10 · width 80)', await shownValue('barRadius') === 10 && await shownValue('barWidth') === 80);
  await close();
  check('no page error', B.errors.length === 0, B.errors.slice(0, 3).join(' | '));
} catch (e) {
  check('appearance test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
