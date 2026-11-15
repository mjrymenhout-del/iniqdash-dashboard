/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// THE SHARED VISUAL SIZING SYSTEM (Slider + editable Number + unit, form.js rangeControl) through the REAL editor UI: Popup hero
// information (Content · Presentation · Icon · Position groups, the 3 × 3 placement selector, numeric sizes), the hero buttons (size,
// icon size, style, shape, treatment, gap, order), the Tabbed Container's Appearance (on a popup AND on a page), Room (Information
// sizes + grouping, title size) and the coarse size settings that were migrated (Light title size, Text size). Every change is measured
// in the live preview (while dragging / typing) and at runtime — never only in the stored values. Fake Home Assistant, demo entities.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';
import { roomPopup, POPUP_ID, DEMO_ENTITIES } from './lib/room-popup.mjs';

const D = 'dialog.ed-dlg--popup[open]', PV = `${D} [data-k=popup-preview]`, CFG = 'dialog.ed-dlg--cfg[open]';
const ED = (scope) => `${scope} [data-k=item-editor]`;
let L, B;
try {
  L = await live();
  Object.entries(DEMO_ENTITIES).forEach(([k, v]) => L.setEntity(k, v[0], v[1]));
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const css = (sel, prop) => E(({ sel, prop }) => { const n = document.querySelector(sel); return n ? parseFloat(getComputedStyle(n)[prop]) : null; }, { sel, prop });
  const setNum = async (scope, key, v) => { const s = `${scope} .ef-field[data-key="${key}"] input.ef-range__n`; await page.fill(s, String(v)); await page.press(s, 'Enter'); await page.waitForTimeout(120); };
  const shown = (scope, key) => E(({ scope, key }) => { const n = document.querySelector(`${scope} .ef-field[data-key="${key}"]`); return !!n && !n.hidden && n.offsetParent !== null; }, { scope, key });
  const openSec = (scope, g) => E(({ scope, g }) => { const d = document.querySelector(`${scope} details[data-group="${g}"]`); if (d && !d.open) d.open = true; }, { scope, g });
  /** drag a slider with the mouse from its current value to a fraction of its track; measure(…) is called in the MIDDLE of the drag */
  const drag = async (scope, key, to, measure) => {
    const loc = page.locator(`${scope} .ef-field[data-key="${key}"] input.ef-range__s`);
    await loc.scrollIntoViewIfNeeded(); await page.waitForTimeout(80);
    const box = await loc.boundingBox();
    const val = await E(({ scope, key }) => { const s = document.querySelector(`${scope} .ef-field[data-key="${key}"] input.ef-range__s`); return (s.value - s.min) / (s.max - s.min); }, { scope, key });
    const y = box.y + box.height / 2, x0 = box.x + 8 + val * (box.width - 16), x1 = box.x + 8 + to * (box.width - 16);
    await page.mouse.move(x0, y); await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / 12, y); await page.waitForTimeout(30); }
    const mid = await measure();
    for (let i = 7; i <= 12; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / 12, y); await page.waitForTimeout(30); }
    await page.mouse.up(); await page.waitForTimeout(150);
    return mid;
  };

  // ---------------------------------------------------------------- the shared control itself
  const rc = await E(async () => {
    const got = [];
    const r = window.MaisonForm.rangeControl({ label: 'Icon size', min: 12, max: 120, step: 2, unit: 'px', auto: 'Automatic', autoValue: () => 30, onInput: (v) => got.push(v) });
    document.body.append(r.el);
    const s = r.el.querySelector('.ef-range__s'), n = r.el.querySelector('.ef-range__n'), fire = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));
    const out = { unit: r.el.querySelector('.ef-range__u').textContent, autoSlider: s.value, autoPh: n.placeholder };
    s.value = '52'; fire(s, 'input'); out.afterSlide = [n.value, got.at(-1)];
    n.value = '64'; fire(n, 'input'); out.afterType = [s.value, got.at(-1)];
    const before = got.length; n.value = '5'; fire(n, 'input'); out.outOfRangeWhileTyping = got.length === before;
    fire(n, 'change'); out.clampedLow = [n.value, got.at(-1)];
    n.value = '999'; fire(n, 'change'); out.clampedHigh = [n.value, got.at(-1)];
    n.value = '33'; fire(n, 'change'); out.stepped = [n.value, got.at(-1)];
    const r2 = window.MaisonForm.rangeControl({ label: 'Gap', min: 0, max: 40, step: 1, unit: 'px', onInput: () => {} }); r2.set(10); document.body.append(r2.el);
    const n2 = r2.el.querySelector('.ef-range__n'); n2.value = ''; fire(n2, 'change'); out.invalid = n2.value; r2.el.remove();
    r.el.querySelector('[data-k=range-auto]').click(); out.auto = [got.at(-1), n.value, n.placeholder];
    r.el.remove();
    return out;
  });
  check('range: slider · number · unit; automatic shows its value as a placeholder', rc.unit === 'px' && rc.autoSlider === '30' && /Auto · 30/.test(rc.autoPh), JSON.stringify(rc));
  check('range: slider → number (live callback), number → slider (live callback)', rc.afterSlide[0] === '52' && rc.afterSlide[1] === 52 && rc.afterType[0] === '64' && rc.afterType[1] === 64, JSON.stringify(rc));
  check('range: out-of-range typing is not applied; on change it is clamped to min / max', rc.outOfRangeWhileTyping && rc.clampedLow[1] === 12 && rc.clampedHigh[1] === 120 && rc.clampedHigh[0] === '120', JSON.stringify(rc));
  check('range: step rounding, an empty / invalid entry restores the value (no Auto), Auto returns to automatic', rc.stepped[1] === 34 && rc.invalid === '10' && rc.auto[0] === undefined && rc.auto[1] === '', JSON.stringify(rc));

  // ---------------------------------------------------------------- load: the reference popup (+ a Room, a Light and a Text with OLD coarse sizes)
  const pp = roomPopup();
  pp.config.heroInfo[1].valueSize = 'xl';                                   // a hero item saved with the former S…XL names
  pp.config.buttonStyle = 'glass'; pp.config.buttonSize = 'large';           // the former shared button look
  const extra = [
    { id: 'vs-room', type: 'custom.room-scene', parent: null, config: { name: 'Salon', titleSize: 'large', info: [{ id: 'i1', entity: 'sensor.demo_dining_temperature', value: 'state', label: 'Temp', icon: 'mdi:thermometer' }] }, layout: { desktop: { x: 1, y: 60, w: 6, h: 6 }, tablet: { x: 1, y: 60, w: 4, h: 4 }, mobile: { w: 4, h: 4 } } },
    { id: 'vs-light', type: 'light', parent: null, config: { name: 'Lamp', titleSize: 'small' }, layout: { desktop: { x: 7, y: 60, w: 4, h: 4 }, tablet: { x: 5, y: 60, w: 4, h: 4 }, mobile: { w: 4, h: 4 } } },
    { id: 'vs-text', type: 'text', parent: null, config: { primary: 'Hello', size: 'l' }, layout: { desktop: { x: 1, y: 70, w: 4, h: 2 }, tablet: { x: 1, y: 70, w: 4, h: 2 }, mobile: { w: 4, h: 2 } } },
    { id: 'vs-tabs', type: 'tabs', parent: null, config: { title: 'Floors', tabs: [{ id: 'g', label: 'Ground' }, { id: 'u', label: 'Upstairs', icon: 'mdi:stairs', badge: '2' }] }, layout: { desktop: { x: 5, y: 70, w: 8, h: 6 }, tablet: { x: 1, y: 76, w: 8, h: 6 }, mobile: { w: 4, h: 6 } } },
  ];
  const loaded = await E(({ pp, extra }) => { const m = window.editor.getModel(); m.popups = [...(m.popups || []), pp]; m.pages[0].items.push(...extra); const r = window.editor.setModel(m); return r.ok ? 'ok' : r.errors; }, { pp, extra });
  check('older configurations (S…XL hero size, shared button style / size, Room / Light title size names, Text size name) load', loaded === 'ok', JSON.stringify(loaded));
  // legacy normalisation: the numbers reproduce the former look
  const leg = await E(() => {
    const R = window.MaisonRegistry, pp = window.editor.getModel().popups.find((p) => p.id === 'salle-a-manger'), c = R.fullConfig('popup', pp.config);
    const n = R.DEFS.popup.normalize(structuredClone(c));
    const f = (t, k, cfg) => R.fieldValue(R.schemaOf(t).fields.find((x) => x.key === k), cfg);
    const m = window.editor.getModel().pages[0].items, it = (id) => R.fullConfig(m.find((x) => x.id === id).type, m.find((x) => x.id === id).config);
    return { heroXl: n.heroInfo[1].valueSize, backSize: f('popup', 'backSize', c), backIcon: f('popup', 'backIconSize', c), backStyle: f('popup', 'backStyle', c), backShape: f('popup', 'backShape', c),
      room: f('custom.room-scene', 'titleSize', it('vs-room')), light: f('light', 'titleSize', it('vs-light')), text: f('text', 'size', it('vs-text')) };
  });
  check('legacy → numbers: XL value 56 px; glass + large buttons → Subtle Circle 60 / 24 px; Room "large" 120 %, Light "small" 80 %, Text "l" 30 px',
    leg.heroXl === 56 && leg.backSize === 60 && leg.backIcon === 24 && leg.backStyle === 'subtle' && leg.backShape === 'circle' && leg.room === 120 && leg.light === 80 && leg.text === 30, JSON.stringify(leg));
  check('legacy look unchanged at runtime: the Light still draws "small", the Text still "l"', await E(() => document.querySelector('[data-grid-id="vs-light"] .lw')?.dataset.title === 'small' && document.querySelector('[data-grid-id="vs-text"] .tx')?.dataset.size === 'l'));

  // ---------------------------------------------------------------- POPUP HERO INFORMATION
  await E(() => window.editor.setEditing(true));
  await E((id) => window.editor.designPopup(id), POPUP_ID); await page.waitForTimeout(700);
  await page.click('[data-k="popup-settings"]'); await page.waitForSelector(D);
  await openSec(D, 'information');
  await page.waitForFunction((PV) => document.querySelectorAll(`${PV} .mpop__fact[data-state="ready"]`).length === 3, PV, { timeout: 15000 }).catch(() => {});
  await page.click(`${D} [data-col="heroInfo"] [data-index="2"] [data-k=col-edit]`); await page.waitForSelector(ED(D));
  const groups = await E((s) => [...document.querySelectorAll(`${s} fieldset.ef-group`)].map((g) => `${g.querySelector('legend')?.textContent}:${[...g.querySelectorAll('.ef-field')].filter((f) => !f.hidden).map((f) => f.dataset.key).join('/')}`), ED(D));
  check('61.1–4 the information editor in four clear groups: CONTENT (what) · PRESENTATION (text) · ICON · POSITION', groups.length === 4 && /^Content:entity\/value\/showLabel\/label\/icon$/.test(groups[0]) && /^Presentation:style\/align\/valueSize\/labelSize\/labelPos$/.test(groups[1]) && /^Icon:iconSize\//.test(groups[2]) && /^Position:place$/.test(groups[3]), JSON.stringify(groups));
  check('61.5 one 3 × 3 placement selector (no separate horizontal / vertical dropdowns)', await E((s) => document.querySelectorAll(`${s} .ef-place__c[role=radio]`).length === 9 && !document.querySelector(`${s} .ef-field[data-key="slot"]`) && !document.querySelector(`${s} .ef-field[data-key="vslot"]`), ED(D)));
  const cellOf = () => E((PV) => document.querySelector(`${PV} .mpop__fact[data-fact="h3"]`)?.parentElement.dataset.cell, PV);
  await page.click(`${ED(D)} .ef-place__c[data-place="bottom-right"]`); await page.waitForTimeout(200);
  check('61.6–7 Bottom right: the preview moves it at once (before Save)', (await cellOf()) === 'bottom-right' && (await E((s) => document.querySelector(`${s} .ef-place__name`).textContent, ED(D))) === 'Bottom right');
  await page.click(`${ED(D)} .ef-place__c[data-place="center-center"]`); await page.waitForTimeout(200);
  check('61.8–9 Centre: it moves to the centre', (await cellOf()) === 'center-center');
  await page.click(`${ED(D)} .ef-place__c[data-place="center-right"]`); await page.waitForTimeout(150);
  // sizes: drag the icon slider (measured mid-drag), type exact values, check independence
  const F3 = `${PV} .mpop__fact[data-fact="h3"]`;
  const before = { ic: await css(`${F3} .mpop__fact-ic`, 'width'), v: await css(`${F3} .mpop__fact-v`, 'fontSize'), l: await css(`${F3} .mpop__fact-l`, 'fontSize') };
  const midIc = await drag(ED(D), 'iconSize', 0.5, () => css(`${F3} .mpop__fact-ic`, 'width'));
  const afterDrag = await css(`${F3} .mpop__fact-ic`, 'width');
  check('61.10 / 52 dragging the icon slider grows the icon WHILE dragging (live)', midIc > before.ic + 4 && afterDrag > midIc, JSON.stringify({ before, midIc, afterDrag }));
  await setNum(ED(D), 'iconSize', 64);
  const t1 = { ic: await css(`${F3} .mpop__fact-ic`, 'width'), v: await css(`${F3} .mpop__fact-v`, 'fontSize'), l: await css(`${F3} .mpop__fact-l`, 'fontSize') };
  check('61.11 an exact icon size typed (64 px) — value and label unchanged', t1.ic === 64 && t1.v === before.v && t1.l === before.l, JSON.stringify({ before, t1 }));
  await setNum(ED(D), 'valueSize', 42);
  const t2 = { ic: await css(`${F3} .mpop__fact-ic`, 'width'), v: await css(`${F3} .mpop__fact-v`, 'fontSize'), l: await css(`${F3} .mpop__fact-l`, 'fontSize') };
  await setNum(ED(D), 'labelSize', 15);
  const t3 = { ic: await css(`${F3} .mpop__fact-ic`, 'width'), v: await css(`${F3} .mpop__fact-v`, 'fontSize'), l: await css(`${F3} .mpop__fact-l`, 'fontSize') };
  check('61.12–14 value 42 px, then label 15 px — each independent of the others', t2.v === 42 && t2.ic === 64 && t2.l === before.l && t3.l === 15 && t3.v === 42 && t3.ic === 64, JSON.stringify({ t2, t3 }));
  await page.mouse.click(10, 600); await page.waitForTimeout(150);
  check('57 a click outside the information editor closes nothing', await E((s) => !!document.querySelector(s), ED(D)));
  await page.click(`${ED(D)} .ef-field[data-key="icon"] [data-k=icon-field]`); await page.waitForTimeout(150);
  await page.click(`${ED(D)} .ef-sub__head`); await page.waitForTimeout(150);
  check('59 a click outside the open MDI picker closes neither the item editor nor Popup Settings', await E((s) => !!document.querySelector(s) && !!document.querySelector('dialog.ed-dlg--popup[open]'), ED(D)));
  await E((s) => { const p = document.querySelector(`${s} .ef-field[data-key="icon"] .iqi__panel`); if (p && !p.hidden) document.querySelector(`${s} .ef-field[data-key="icon"] [data-k=icon-field]`).click(); }, ED(D));
  await page.click(`${ED(D)} [data-k=sub-save]`); await page.waitForTimeout(200);
  // label off / no icon (item 1)
  await page.click(`${D} [data-col="heroInfo"] [data-index="0"] [data-k=col-edit]`); await page.waitForSelector(ED(D));
  await page.click(`${ED(D)} .ef-field[data-key="showLabel"] button[role=switch]`); await page.waitForTimeout(100);
  check('61.15–16 label off: Label, Label size and Label place disappear', !(await shown(ED(D), 'label')) && !(await shown(ED(D), 'labelSize')) && !(await shown(ED(D), 'labelPos')));
  await page.click(`${ED(D)} .ef-field[data-key="icon"] [data-k=icon-field]`); await page.click(`${ED(D)} .ef-field[data-key="icon"] .iqi__opt[data-icon=""]`); await page.waitForTimeout(120);
  check('61.17–18 no icon: the whole ICON group disappears (no empty space)', await E((s) => { const g = [...document.querySelectorAll(`${s} fieldset.ef-group`)].find((x) => x.querySelector('legend')?.textContent === 'Icon'); return !!g && g.hidden && g.offsetHeight === 0; }, ED(D)));
  await page.click(`${ED(D)} [data-k=sub-save]`); await page.waitForTimeout(200);

  // ---------------------------------------------------------------- HERO BUTTONS (Interactions → per-button sections)
  await openSec(D, 'behaviour');
  await E((D) => document.querySelectorAll(`${D} details[data-group="behaviour"] details.ef-section`).forEach((d) => { d.open = true; }), D);
  const btnW = (b) => css(`${PV} .mpop__${b}`, 'width'), btnI = (b) => css(`${PV} .mpop__${b} svg`, 'width');
  const bw0 = await btnW('back');
  const midB = await drag(D, 'backSize', 0.7, () => btnW('back'));
  check('62.1 / 62.9 Back grows while its Button size slider is dragged (live)', midB > bw0 && (await btnW('back')) > midB, JSON.stringify({ bw0, midB }));
  await setNum(D, 'backSize', 58); await setNum(D, 'backIconSize', 24);
  await page.selectOption(`${D} .ef-field[data-key="backStyle"] select`, 'subtle'); await page.selectOption(`${D} .ef-field[data-key="backShape"] select`, 'circle');
  await setNum(D, 'closeSize', 68); await setNum(D, 'closeIconSize', 30);
  await page.selectOption(`${D} .ef-field[data-key="closeStyle"] select`, 'outline'); await page.selectOption(`${D} .ef-field[data-key="closeShape"] select`, 'circle'); await page.selectOption(`${D} .ef-field[data-key="closeTone"] select`, 'accent');
  await setNum(D, 'menuSize', 52); await setNum(D, 'menuIconSize', 22);
  await openSec(D, 'hero'); await setNum(D, 'actionGap', 18);
  const pvB = await E((PV) => { const g = (s) => document.querySelector(`${PV} ${s}`); const r = (s) => g(s).getBoundingClientRect(); const cs = (s) => getComputedStyle(g(s));
    return { back: [cs('.mpop__back').width, cs('.mpop__back svg').width, g('.mpop__back').dataset.style, g('.mpop__back').dataset.shape], close: [cs('.mpop__close').width, cs('.mpop__close svg').width, g('.mpop__close').dataset.style, g('.mpop__close').dataset.tone, cs('.mpop__close').borderRadius],
      menu: [cs('.mpop__menu').width, cs('.mpop__menu svg').width], gap: cs('.mpop__end').columnGap, overlap: r('.mpop__menu').right > r('.mpop__close').left }; }, PV);
  check('62.1–8 live: Back 58 / 24 Subtle Circle · Close 68 / 30 Outline Circle Accent · Menu 52 / 22 · gap 18 — sizes independent, no overlap',
    JSON.stringify(pvB.back) === '["58px","24px","subtle","circle"]' && pvB.close[0] === '68px' && pvB.close[1] === '30px' && pvB.close[2] === 'outline' && pvB.close[3] === 'accent' && pvB.close[4] === '50%'
    && pvB.menu[0] === '52px' && pvB.menu[1] === '22px' && pvB.gap === '18px' && !pvB.overlap, JSON.stringify(pvB));
  await page.selectOption(`${D} .ef-field[data-key="buttonOrder"] select`, 'close-menu'); await page.waitForTimeout(120);
  check('29 order in a region: Close · Menu', await E((PV) => { const e = document.querySelector(`${PV} .mpop__end`); return [...e.children].map((b) => b.classList[1]).join() === 'mpop__close,mpop__menu'; }, PV));
  await page.selectOption(`${D} .ef-field[data-key="buttonOrder"] select`, 'menu-close');
  await page.click(`${D} [data-k=apply-def]`); await page.waitForTimeout(400);
  const stored = await E((id) => window.editor.getModel().popups.find((p) => p.id === id).config, POPUP_ID);
  check('62.10 / 61.19 Apply stores numbers (not "px" strings) and the choices',
    stored.backSize === 58 && stored.backIconSize === 24 && stored.backStyle === 'subtle' && stored.closeSize === 68 && stored.closeTone === 'accent' && stored.menuSize === 52 && stored.actionGap === 18
    && stored.heroInfo[2].iconSize === 64 && stored.heroInfo[2].valueSize === 42 && stored.heroInfo[2].labelSize === 15 && stored.heroInfo[2].slot === 'right' && !('vslot' in stored.heroInfo[2])
    && stored.heroInfo[0].showLabel === false && !stored.heroInfo[0].icon && stored.heroInfo[1].valueSize === 56, JSON.stringify(stored));
  await page.click('[data-k="popup-settings"]'); await page.waitForSelector(D);
  await openSec(D, 'behaviour'); await E((D) => document.querySelectorAll(`${D} details.ef-section`).forEach((d) => { d.open = true; }), D);
  const re = await E((D) => ({ back: document.querySelector(`${D} .ef-field[data-key="backSize"] input.ef-range__n`).value, slider: document.querySelector(`${D} .ef-field[data-key="backSize"] input.ef-range__s`).value, close: document.querySelector(`${D} .ef-field[data-key="closeStyle"] select`).value }), D);
  await openSec(D, 'information'); await page.click(`${D} [data-col="heroInfo"] [data-index="2"] [data-k=col-edit]`); await page.waitForSelector(ED(D));
  const reI = await E((s) => ({ ic: document.querySelector(`${s} .ef-field[data-key="iconSize"] input.ef-range__n`).value, v: document.querySelector(`${s} .ef-field[data-key="valueSize"] input.ef-range__n`).value, place: document.querySelector(`${s} .ef-place__c[aria-checked="true"]`).dataset.place }), ED(D));
  check('62.11–12 / 61.20–21 reopened: the saved numbers and choices are shown', re.back === '58' && re.slider === '58' && re.close === 'outline' && reI.ic === '64' && reI.v === '42' && reI.place === 'center-right', JSON.stringify({ re, reI }));
  await page.click(`${ED(D)} [data-k=sub-cancel]`); await page.click(`${D} [data-k=def-cancel]`); await page.waitForTimeout(300);

  // runtime: sizes, actions still work
  await E(() => window.editor.designPage()); await E(() => window.editor.setEditing(false)); await page.waitForTimeout(300);
  await E((id) => window.editor.openPopup(id), POPUP_ID); await page.waitForTimeout(900);
  const run = await E(() => { const p = document.querySelector('.mpop:not(.is-leaving) .mpop__panel'), w = (s) => p.querySelector(s).getBoundingClientRect(); return { back: w('.mpop__back').width, close: w('.mpop__close').width, menu: w('.mpop__menu').width, closeAfterMenu: w('.mpop__close').left >= w('.mpop__menu').right, ic: w('.mpop__fact[data-fact="h3"] .mpop__fact-ic').width }; });
  check('runtime: Back 58 · Menu 52 · Close 68 px, no overlap, hero icon 64 px', run.back === 58 && run.menu === 52 && run.close === 68 && run.closeAfterMenu && run.ic === 64, JSON.stringify(run));
  await page.click('.mpop:not(.is-leaving) button.mpop__close'); await page.waitForTimeout(400);
  check('62 Close always closes', (await E(() => window.editor.popups().current)) === null);
  await E((id) => window.editor.openPopup(id), POPUP_ID); await page.waitForTimeout(500);
  await page.click('.mpop:not(.is-leaving) button.mpop__back'); await page.waitForTimeout(400);
  check('62 Back still works (opened from the dashboard: it closes)', (await E(() => window.editor.popups().current)) === null);
  await E((id) => window.editor.openPopup(id), POPUP_ID); await page.waitForTimeout(500);
  await page.click('.mpop:not(.is-leaving) button.mpop__menu'); await page.waitForTimeout(400);
  check('62 Menu still runs its action (opens its page, closes the popup)', (await E(() => window.editor.popups().current)) === null && (await E(() => window.editor.getPage && window.editor.getPage()?.id)) !== undefined);

  // ---------------------------------------------------------------- TABBED CONTAINER (in the popup)
  await E(() => window.editor.setEditing(true)); await E((id) => window.editor.designPopup(id), POPUP_ID); await page.waitForTimeout(600);
  const openTabs = async (sel) => { await page.click(sel, { position: { x: 8, y: 8 }, force: true }); await page.waitForTimeout(150); await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector(`${CFG} .ef`); await openSec(CFG, 'appearance'); await openSec(CFG, 'content'); };
  await openTabs('.ed-canvas [data-grid-id="sam-tabs"]');
  check('51 Tabbed Container settings: Tabs · Navigation · Appearance · Visibility', await E((CFG) => [...document.querySelectorAll(`${CFG} details.ef-group--acc`)].map((d) => d.dataset.group).join() === 'content,navigation,appearance,visibility', CFG));
  const TV = `${CFG} .ecfg-pv .mtabs`;
  const tabH0 = await css(`${TV} .mtabs__tab`, 'height');
  const midH = await drag(CFG, 'tabHeight', 0.5, () => css(`${TV} .mtabs__tab`, 'height'));
  check('63.5 / 52 the tab height grows while its slider is dragged (live preview)', midH > tabH0 && (await css(`${TV} .mtabs__tab`, 'height')) > midH, JSON.stringify({ tabH0, midH }));
  // an icon on a tab (the shared MDI picker in the tab's item editor)
  await page.click(`${CFG} [data-col="tabs"] [data-index="1"] [data-k=col-edit]`); await page.waitForSelector(ED(CFG));
  await page.click(`${ED(CFG)} [data-k=icon-field]`); await page.fill(`${ED(CFG)} .iqi__search`, 'lightbulb'); await page.click(`${ED(CFG)} .iqi__opt[data-icon="mdi:lightbulb"]`); await page.waitForTimeout(100);
  await page.mouse.click(10, 600); await page.waitForTimeout(120);
  check('57 a click outside the tab editor closes nothing', await E((s) => !!document.querySelector(s), ED(CFG)));
  await page.click(`${ED(CFG)} [data-k=sub-save]`); await page.waitForTimeout(200);
  // the reference-like look: larger, more spacing, centred, a stronger selected state
  for (const [k, v] of [['textSize', 18], ['iconSize', 22], ['tabHeight', 56], ['padX', 26], ['tabGap', 14]]) await setNum(CFG, k, v);
  for (const [k, v] of [['align', 'center'], ['distribute', 'content'], ['shape', 'pill'], ['active', 'filled'], ['inactive', 'outline'], ['badgeStyle', 'subtle'], ['barPos', 'top']]) await page.selectOption(`${CFG} .ef-field[data-key="${k}"] select`, v);
  await page.waitForTimeout(250);
  const look1 = await E((TV) => { const r = document.querySelector(TV), t = [...r.querySelectorAll('.mtabs__tab')], s = (n) => getComputedStyle(n), sel = r.querySelector('.mtabs__tab[aria-selected="true"]'), oth = t.find((x) => x !== sel);
    const lights = t[1]; return { fs: s(t[0]).fontSize, h: s(t[0]).height, pad: s(t[0]).paddingLeft, gap: s(r.querySelector('.mtabs__list')).columnGap, ic: lights.querySelector('.mtabs__ic') ? s(lights.querySelector('.mtabs__ic')).width : null,
      noIcon: !t[2].querySelector('.mtabs__ic'), selBg: s(sel).backgroundColor, accent: s(r).getPropertyValue('--accent').trim(), othShadow: s(oth).boxShadow, othBg: s(oth).backgroundColor, badgeBg: s(r.querySelector('.mtabs__badge')).backgroundColor, centred: Math.abs((r.querySelector('.mtabs__list').getBoundingClientRect().left + r.querySelector('.mtabs__list').getBoundingClientRect().right) / 2 - (t[0].getBoundingClientRect().left + t.at(-1).getBoundingClientRect().right) / 2) < 3 }; }, TV);
  check('63.1–14 reference look, live: 18 px text, 56 px tall, 26 px padding, 14 px gap, a 22 px MDI icon on "Lights" (none elsewhere — no empty space), filled selected tab, outlined others, subtle badge, centred',
    look1.fs === '18px' && look1.h === '56px' && look1.pad === '26px' && look1.gap === '14px' && look1.ic === '22px' && look1.noIcon && look1.selBg !== 'rgba(0, 0, 0, 0)' && /inset/.test(look1.othShadow) && look1.othBg === 'rgba(0, 0, 0, 0)' && look1.centred, JSON.stringify(look1));
  await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(300);
  const tcfg = await E(() => window.editor.getModel().popups.find((p) => p.id === 'salle-a-manger').items.find((i) => i.id === 'sam-tabs').config);
  check('63.17 Apply stores the appearance (numbers) and the tab icon', tcfg.textSize === 18 && tcfg.tabHeight === 56 && tcfg.padX === 26 && tcfg.tabGap === 14 && tcfg.iconSize === 22 && tcfg.active === 'filled' && tcfg.inactive === 'outline' && tcfg.badgeStyle === 'subtle' && tcfg.tabs[1].icon === 'mdi:lightbulb', JSON.stringify(tcfg));
  await openTabs('.ed-canvas [data-grid-id="sam-tabs"]');
  check('63.18–19 reopened: the saved values', (await page.inputValue(`${CFG} .ef-field[data-key="tabHeight"] input.ef-range__n`)) === '56' && (await page.inputValue(`${CFG} .ef-field[data-key="active"] select`)) === 'filled');
  // a substantially different look: smaller, left, minimal — and Equal / Fill / Bottom
  for (const [k, v] of [['textSize', 12], ['tabHeight', 30], ['padX', 10], ['tabGap', 4]]) await setNum(CFG, k, v);
  await page.selectOption(`${CFG} .ef-field[data-key="align"] select`, 'start'); await page.selectOption(`${CFG} .ef-field[data-key="shape"] select`, 'minimal'); await page.waitForTimeout(200);
  const look2 = await E((TV) => { const r = document.querySelector(TV), t = r.querySelectorAll('.mtabs__tab'), list = r.querySelector('.mtabs__list'), sel = r.querySelector('.mtabs__tab[aria-selected="true"]');
    return { fs: getComputedStyle(t[0]).fontSize, h: getComputedStyle(t[0]).height, left: Math.abs(t[0].getBoundingClientRect().left - list.getBoundingClientRect().left) < 2, underline: /inset/.test(getComputedStyle(sel).boxShadow), bg: getComputedStyle(t[1]).backgroundColor }; }, TV);
  check('64 a different look without code: 12 px, 30 px tall, left aligned, minimal (no surface, underline on the selected tab)', look2.fs === '12px' && look2.h === '30px' && look2.left && look2.underline && look2.bg === 'rgba(0, 0, 0, 0)', JSON.stringify(look2));
  await page.selectOption(`${CFG} .ef-field[data-key="distribute"] select`, 'equal'); await page.waitForTimeout(150);
  const eq = await E((TV) => [...document.querySelectorAll(`${TV} .mtabs__tab`)].map((t) => Math.round(t.getBoundingClientRect().width)), TV);
  await page.selectOption(`${CFG} .ef-field[data-key="distribute"] select`, 'fill'); await page.waitForTimeout(150);
  const fill = await E((TV) => { const r = document.querySelector(TV), t = [...r.querySelectorAll('.mtabs__tab')], bar = r.querySelector('.mtabs__bar').getBoundingClientRect(); return { span: t.at(-1).getBoundingClientRect().right - t[0].getBoundingClientRect().left, bar: bar.width }; }, TV);
  await page.selectOption(`${CFG} .ef-field[data-key="barPos"] select`, 'bottom'); await page.waitForTimeout(150);
  const bottom = await E((TV) => { const r = document.querySelector(TV); return r.querySelector('.mtabs__bar').getBoundingClientRect().top > r.querySelector('.mtabs__panes').getBoundingClientRect().top; }, TV);
  check('63.9 / 63.14 Equal: equal widths · Fill: the tabs fill the bar · Bottom: the bar below the content', new Set(eq).size === 1 && Math.abs(fill.span - fill.bar) < 12 && bottom, JSON.stringify({ eq, fill, bottom }));
  await page.click(`${CFG} .ecfg-foot button:has-text("Cancel")`); await page.waitForTimeout(250);
  check('Cancel keeps the applied reference look', (await E(() => window.editor.getModel().popups.find((p) => p.id === 'salle-a-manger').items.find((i) => i.id === 'sam-tabs').config.tabHeight)) === 56);
  await E(() => window.editor.designPage()); await E(() => window.editor.setEditing(false)); await page.waitForTimeout(300);
  await E((id) => window.editor.openPopup(id), POPUP_ID); await page.waitForTimeout(800);
  await page.click('.mpop .mtabs__tab[data-tab="heating"]'); await page.waitForTimeout(150);
  check('63.20 runtime: the configured tabs (56 px) still switch', (await css('.mpop .mtabs__tab', 'height')) === 56 && (await E(() => [...document.querySelectorAll('.mpop .mtabs__pane:not([hidden]) .mg__item[data-grid-id]')].map((x) => x.dataset.gridId).join())) === 'sam-h-stove');
  await E(() => window.editor.closePopup()); await page.waitForTimeout(300);

  // ---------------------------------------------------------------- TABBED CONTAINER OUTSIDE A POPUP (on the page) + overflow
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await openTabs('.ed-canvas [data-grid-id="vs-tabs"]');
  for (const [k, v] of [['textSize', 20], ['tabHeight', 64], ['tabGap', 20]]) await setNum(CFG, k, v);
  await page.selectOption(`${CFG} .ef-field[data-key="active"] select`, 'soft');
  await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(300);
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(400);
  const pg = await E(() => { const r = document.querySelector('[data-grid-id="vs-tabs"] .mtabs'); return { inPopup: !!r.closest('.mpop'), h: getComputedStyle(r.querySelector('.mtabs__tab')).height, fs: getComputedStyle(r.querySelector('.mtabs__tab')).fontSize, active: r.dataset.sel }; });
  check('65 on a page (no popup): the same appearance controls apply — 64 px tall, 20 px text, soft selected', !pg.inPopup && pg.h === '64px' && pg.fs === '20px' && pg.active === 'soft', JSON.stringify(pg));
  const ov = await E(() => {
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:220px;z-index:99999;display:flex';
    const tabs = ['Active', 'Lights', 'Heating', 'Media', 'Security', 'Sensors', 'Garden', 'Garage'].map((l, i) => ({ id: `t${i}`, label: l }));
    const el = window.MaisonTabs.create({ tabs, look: { textSize: 18, tabHeight: 52, padX: 22 } }); host.append(el); document.body.append(host);
    const bar = el.querySelector('.mtabs__bar'), t = [...el.querySelectorAll('.mtabs__tab')];
    const oneRow = t.every((x) => Math.abs(x.getBoundingClientRect().top - t[0].getBoundingClientRect().top) < 1), scrolls = bar.scrollWidth > bar.clientWidth;
    el.tabs.select('t7');
    const last = t[7].getBoundingClientRect(), b = bar.getBoundingClientRect(), visible = last.left >= b.left - 1 && last.right <= b.right + 1;
    bar.scrollLeft = 0; bar.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })); const wheel = bar.scrollLeft > 0;
    host.remove();
    return { oneRow, scrolls, visible, wheel, pageX: document.scrollingElement.scrollWidth <= innerWidth };
  });
  check('49 / 63.15 narrow: one row (no wrapping), the bar scrolls sideways (mouse wheel too), the selected tab is scrolled into view, the page does not scroll', ov.oneRow && ov.scrolls && ov.visible && ov.wheel && ov.pageX, JSON.stringify(ov));

  // ---------------------------------------------------------------- ROOM (Information sizes + grouping, title size)
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await page.click('.ed-canvas [data-grid-id="vs-room"]', { position: { x: 12, y: 12 }, force: true }); await page.waitForTimeout(150);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector(`${CFG} .ef`);
  await openSec(CFG, 'appearance');
  check('60.1 Room title size: the shared slider (%), the saved "large" shown as 120 %', (await page.inputValue(`${CFG} .ef-field[data-key="titleSize"] input.ef-range__n`)) === '120' && !!(await page.$(`${CFG} .ef-field[data-key="titleSize"] input.ef-range__s`)));
  const nameFs0 = await css(`${CFG} .ecfg-pv .iq-room__name`, 'fontSize');
  await setNum(CFG, 'titleSize', 150);
  const nameFs1 = await css(`${CFG} .ecfg-pv .iq-room__name`, 'fontSize');
  check('60.5 the Room preview title grows (120 % → 150 %)', nameFs1 > nameFs0 * 1.15, JSON.stringify({ nameFs0, nameFs1 }));
  await openSec(CFG, 'information');
  await E((CFG) => document.querySelector(`${CFG} [data-col="info"] [data-index="0"] [data-k=col-edit]`).click(), CFG); await page.waitForSelector(ED(CFG));
  const rg = await E((s) => [...document.querySelectorAll(`${s} fieldset.ef-group`)].filter((g) => !g.hidden).map((g) => `${g.querySelector('legend')?.textContent}:${[...g.querySelectorAll('.ef-field')].filter((f) => !f.hidden).map((f) => f.dataset.key).join('/')}`), ED(CFG));
  check('60.7 Room Information editor in the same groups: Content · Presentation · Icon (no Position — a Room has no placement)', rg.length === 3 && /^Content:entity\/value\/showLabel\/label\/icon/.test(rg[0]) && /^Presentation:valueSize\/labelSize/.test(rg[1]) && /^Icon:iconSize/.test(rg[2]), JSON.stringify(rg));
  const RS = `${CFG} .ecfg-pv .iq-room__stat[data-info="i1"]`;
  const r0 = { ic: await css(`${RS} .iq-room__sicon`, 'width'), v: await css(`${RS} .iq-room__sval`, 'fontSize'), l: await css(`${RS} .iq-room__slab`, 'fontSize') };
  const midR = await drag(ED(CFG), 'iconSize', 0.45, () => css(`${RS} .iq-room__sicon`, 'width'));
  check('60.2 / 60.5 dragging the Room information icon slider changes the Room preview while dragging', midR !== null && Math.abs(midR - r0.ic) > 4, JSON.stringify({ r0, midR }));
  await setNum(ED(CFG), 'iconSize', 40); await setNum(ED(CFG), 'valueSize', 30); await setNum(ED(CFG), 'labelSize', 11);
  const r1 = { ic: await css(`${RS} .iq-room__sicon`, 'width'), v: await css(`${RS} .iq-room__sval`, 'fontSize'), l: await css(`${RS} .iq-room__slab`, 'fontSize'), num: await page.inputValue(`${ED(CFG)} .ef-field[data-key="iconSize"] input.ef-range__n`), sl: await page.inputValue(`${ED(CFG)} .ef-field[data-key="iconSize"] input.ef-range__s`) };
  check('60.3–6 typed exact sizes: icon 40, value 30, label 11 px — slider and number in sync, each independent', r1.ic === 40 && r1.v === 30 && r1.l === 11 && r1.num === '40' && r1.sl === '40', JSON.stringify(r1));
  await page.click(`${ED(CFG)} [data-k=sub-save]`); await page.waitForTimeout(150);
  await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(300);
  const rc2 = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'vs-room').config);
  check('60.9–11 Apply stores numbers; the Room on the dashboard shows them', rc2.titleSize === 150 && rc2.info[0].iconSize === 40 && rc2.info[0].valueSize === 30 && rc2.info[0].labelSize === 11 && (await css('.ed-canvas [data-grid-id="vs-room"] .iq-room__stat .iq-room__sicon', 'width')) === 40, JSON.stringify(rc2));
  check('60.12 the Room still works: its name, its information value from Home Assistant', await E(() => { const r = document.querySelector('.ed-canvas [data-grid-id="vs-room"]'); return r.querySelector('.iq-room__name').textContent === 'Salon' && /22\.2/.test(r.querySelector('.iq-room__sval').textContent); }));

  // ---------------------------------------------------------------- the other migrated widgets: Light title size, Text size
  await page.click('.ed-canvas [data-grid-id="vs-light"]', { position: { x: 12, y: 12 }, force: true }); await page.waitForTimeout(150);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector(`${CFG} .ef`); await openSec(CFG, 'appearance');
  check('66 Light title size: the shared slider, "small" shown as 80 %', (await page.inputValue(`${CFG} .ef-field[data-key="titleSize"] input.ef-range__n`)) === '80');
  await setNum(CFG, 'titleSize', 130);
  check('66 Light preview follows (130 %)', await E((CFG) => { const l = document.querySelector(`${CFG} .ecfg-pv .lw`); return l.dataset.title === 'n' && l.style.getPropertyValue('--lw-ts') === '1.3'; }, CFG));
  await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(250);
  await page.click('.ed-canvas [data-grid-id="vs-text"]', { position: { x: 12, y: 12 }, force: true }); await page.waitForTimeout(150);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector(`${CFG} .ef`); await openSec(CFG, 'appearance');
  check('66 Text size: the shared slider, "l" shown as 30 px', (await page.inputValue(`${CFG} .ef-field[data-key="size"] input.ef-range__n`)) === '30');
  await setNum(CFG, 'size', 50);
  check('66 Text preview follows (50)', await E((CFG) => document.querySelector(`${CFG} .ecfg-pv .tx`).style.getPropertyValue('--tx-size') === '50', CFG));
  await page.mouse.click(8, 500); await page.waitForTimeout(150);
  check('57 a click outside the Text configuration closes nothing', await E((CFG) => !!document.querySelector(CFG), CFG));
  await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(250);
  const others = await E(() => { const m = window.editor.getModel().pages[0].items; return { light: m.find((i) => i.id === 'vs-light').config.titleSize, text: m.find((i) => i.id === 'vs-text').config.size }; });
  check('66 persisted as numbers (Light 130, Text 50)', others.light === 130 && others.text === 50, JSON.stringify(others));

  // ---------------------------------------------------------------- persistence / export
  const saved = await E(() => window.editor.save());
  await page.reload(); await page.waitForTimeout(1500);
  const back = await E(() => { const m = window.editor.getModel(), pp = m.popups.find((p) => p.id === 'salle-a-manger'), it = (id) => m.pages[0].items.find((i) => i.id === id).config;
    return { b: pp.config.backSize, h3: pp.config.heroInfo[2].iconSize, tab: pp.items.find((i) => i.id === 'sam-tabs').config.tabHeight, icon: pp.items.find((i) => i.id === 'sam-tabs').config.tabs[1].icon, room: it('vs-room').info[0].valueSize, light: it('vs-light').titleSize, page: it('vs-tabs').tabHeight,
      rt: (() => { const t = window.MaisonModel.serialize(m); const r = window.MaisonModel.parse(t, window.MaisonRegistry); return r.ok && JSON.stringify(r.model.popups) === JSON.stringify(m.popups); })() }; });
  check('67 save / reload / export round-trip keep every number and choice', saved === true && back.b === 58 && back.h3 === 64 && back.tab === 56 && back.icon === 'mdi:lightbulb' && back.room === 30 && back.light === 130 && back.page === 64 && back.rt, JSON.stringify(back));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
