/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CLIMATE — the reference CLIMATE CONTROL widget, through the REAL editor (real PHP server, fake Home Assistant — no real HA): its sections;
// controls gated by the entity's real capabilities; the thermostat DIAL in four designs over ONE model (same target, limits, step, mode,
// action) — live sizes and colours; the HVAC MODE as the shared segmented control (icons, colours, size, place; selection from HA;
// A → B through real HA calls); POWER and − / + as the shared control button (icon, sizes, style, shape, colours, place; ON / OFF truthful;
// the step from HA; never a card gesture); INFORMATION (the shared items: icons, sizes, colours, backgrounds, truthful animations,
// positions, reorder / remove); MODE vs ACTION; the picture (Climate's own library, state-aware); landscape and portrait compositions
// (references B and A) through configuration; designs × portrait / landscape × MaisonFit; persistence / export; older configs; the modal rule.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const CFG = 'dialog.ed-dlg--cfg[open]', ED = `${CFG} [data-k=item-editor]`, PV = `${CFG} .ecfg-pv .cw`;
const DESIGNS = ['spectrum', 'minimal', 'arc', 'full'];
const SALON = { name: 'Salon', f: 1 | 8 | 16, cur: 21.4, target: 22.5, min: 7, max: 30, step: 0.5, modes: ['heat', 'cool', 'off'], action: 'heating', fm: 'low', fml: ['low', 'high', 'auto'], preset: 'eco', pml: ['eco', 'comfort', 'away', 'boost', 'sleep'], hum: 46 };
let L, B;
try {
  L = await live();
  const salon = (state, x = {}) => L.setEntity('climate.salon', state, { ...SALON, ...x });
  salon('heat');
  L.setEntity('climate.basic', 'heat', { name: 'Basic', f: 1, cur: 20, target: 21, min: 5, max: 30, step: 1, modes: ['heat', 'off'], action: 'idle' });
  L.setEntity('climate.big', 'auto', { name: 'Big', f: 1, cur: 22, target: 22, min: 16, max: 30, step: 1, modes: ['heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'off'] });
  L.setEntity('fan.exhaust', 'on', { name: 'Exhaust' });
  L.setEntity('sensor.stove_power', '3', { name: 'Stove power' });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const calls = () => L.haCalls.filter((x) => /\/api\/services\//.test(x.url));
  const body = (k) => JSON.parse(k.body || '{}');
  const shown = (key) => E(({ CFG, key }) => { const n = document.querySelector(`${CFG} .ef-field[data-key="${key}"]`); return !!n && !n.hidden && !n.closest('[hidden]'); }, { CFG, key });
  const eShown = (key) => E(({ ED, key }) => { const n = document.querySelector(`${ED} .ef-field[data-key="${key}"]`); return !!n && !n.hidden && !n.closest('[hidden]'); }, { ED, key });
  const eNum = async (key, v) => { const q = `${ED} .ef-field[data-key="${key}"] input.ef-range__n`; await page.fill(q, String(v)); await page.press(q, 'Enter'); await page.waitForTimeout(150); };
  const eSel = async (key, v) => { await page.selectOption(`${ED} .ef-field[data-key="${key}"] select`, v); await page.waitForTimeout(150); };
  const eIcon = async (key, n) => { await page.click(`${ED} .ef-field[data-key="${key}"] [data-k=icon-field]`); await page.fill(`${ED} .ef-field[data-key="${key}"] .iqi__search`, n); await page.click(`${ED} .ef-field[data-key="${key}"] .iqi__opt[data-icon="mdi:${n}"]`); await page.waitForTimeout(150); };
  const eHex = (key, hex) => E(({ ED, key, hex }) => { const p = document.querySelector(`${ED} .ef-field[data-key="${key}"] [data-k=color-pick]`); p.value = hex; p.dispatchEvent(new Event('input', { bubbles: true })); }, { ED, key, hex });
  const eToken = async (key, t) => { await page.click(`${ED} .ef-field[data-key="${key}"] .ef-icon[data-value="${t}"]`); await page.waitForTimeout(120); };
  const eSwitch = async (key) => { await page.click(`${ED} .ef-field[data-key="${key}"] button[role=switch]`); await page.waitForTimeout(150); };
  const ePlace = async (key, p) => { await page.click(`${ED} .ef-field[data-key="${key}"] .ef-place__c[data-place="${p}"]`); await page.waitForTimeout(150); };
  const eSave = async () => { await page.click(`${ED} [data-k=sub-save]`); await page.waitForTimeout(250); };
  const openAll = () => E((CFG) => document.querySelectorAll(`${CFG} details.ef-group--acc`).forEach((d) => { d.open = true; }), CFG);
  const cfgOf = (id) => E((id) => structuredClone(window.editor.getModel().pages[0].items.find((i) => i.id === id).config), id);
  const add = (id, c, y, w = 6, h = 9) => E(({ id, c, y, w, h }) => { const m = window.editor.getModel(); m.pages[0].items.push({ id, type: 'climate', parent: null, config: c, layout: { desktop: { x: 1, y, w, h }, tablet: { x: 1, y, w: 6, h }, mobile: { w: 4, h } } }); const r = window.editor.setModel(m); return r.ok ? 'ok' : JSON.stringify(r.errors); }, { id, c, y, w, h });
  const open = async (id) => { await page.click(`.ed-canvas [data-grid-id="${id}"]`, { position: { x: 12, y: 12 }, force: true }); await page.waitForTimeout(150); await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector(`${CFG} .ef`); await openAll(); await page.waitForTimeout(500); };
  const apply = async () => { await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(400); };
  const cancel = async () => { await page.click(`${CFG} .ecfg-foot button:has-text("Cancel")`); await page.waitForTimeout(250); };
  const rowsOf = (col) => E(({ CFG, col }) => [...document.querySelectorAll(`${CFG} [data-col="${col}"] .ef-col__row`)].map((r) => r.querySelector('.ef-col__t').textContent), { CFG, col });
  const editRow = async (title) => { const i = (await rowsOf('controls')).indexOf(title); await E(({ CFG, i }) => document.querySelector(`${CFG} [data-col="controls"] [data-index="${i}"] [data-k=col-edit]`).click(), { CFG, i }); await page.waitForSelector(ED); };
  const pvSize = async (w, h) => { await page.fill(`${CFG} [data-k=pv-w]`, String(w)); await page.fill(`${CFG} [data-k=pv-h]`, String(h)); await page.press(`${CFG} [data-k=pv-h]`, 'Tab'); await page.waitForTimeout(500); };
  const zoneOf = (scope, sel) => E(({ scope, sel }) => { const n = document.querySelector(`${scope} ${sel}`); return n ? n.closest('.iqc-region')?.dataset.place || (n.closest('.iqc-line') ? `line:${n.closest('.iqc-line').dataset.line}` : null) : null; }, { scope, sel });
  const btnLook = (scope, k) => E(({ scope, k }) => { const b = document.querySelector(`${scope} .cw__btn[data-k=${k}]`); if (!b) return null; const cs = getComputedStyle(b), i = b.querySelector('.iqc-btn__i');
    return { cls: b.className, w: cs.width, g: getComputedStyle(i).width, bg: cs.backgroundColor, color: cs.color, style: b.dataset.style, shape: b.dataset.shape, radius: cs.borderTopLeftRadius, icon: b.querySelector('[data-mdi]')?.dataset.mdi, checked: b.getAttribute('aria-checked'), zone: b.closest('.iqc-region')?.dataset.place }; }, { scope, k });
  const pageNow = () => E(() => (window.editor.navigation ? window.editor.navigation().current : window.editor.getPage().id));

  // ---------------------------------------------------------------- older configurations
  const legacy = await E(() => { const R = window.MaisonRegistry; const a = R.fullConfig('climate', { name: 'Old', entity: 'climate.x', variant: 'horizontal' }), b = R.fullConfig('climate', { name: 'Old 2', showCurrent: false, variant: 'compact' });
    return { a, b, errs: [a, b].map((x) => R.validateConfig('climate', x).length), variants: R.TYPES.climate.variants.map((v) => v.id).join() }; });
  check('older climates load unchanged and valid (variants dial · horizontal · compact · minimal kept; no controls / info invented)', legacy.errs.every((n) => n === 0) && legacy.a.variant === 'horizontal' && !('controls' in legacy.a) && !('info' in legacy.a) && legacy.variants === 'dial,horizontal,compact,minimal', JSON.stringify(legacy));

  // ---------------------------------------------------------------- the configurator: sections, controls gated by the entity
  check('a linked climate on the dashboard', (await add('cc', { name: 'Salon', entity: 'climate.salon' }, 60)) === 'ok');
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(500);
  await open('cc');
  const secs = await E((CFG) => [...document.querySelectorAll(`${CFG} details.ef-group--acc`)].filter((d) => !d.hidden).map((d) => `${d.dataset.group}:${d.querySelector('.ef-acc__t').textContent}`), CFG);
  check('sections: Climate · Controls · Information · Interactions · Appearance · Images · Visibility', secs.join() === 'identity:Climate,controls:Controls,information:Information,interactions:Interactions,appearance:Appearance,images:Images,visibility:Visibility', secs.join());
  check('Interactions are the CARD\'s; the dial, buttons and mode selector never run a card action', await E((CFG) => /ON THE CARD/.test(document.querySelector(`${CFG} details[data-group="interactions"] .ef-acc__hint`).textContent), CFG));
  check('the salon (heat / cool / off, fan, presets): dial · mode · − · + · Power (not shown by default) · fan · preset', (await rowsOf('controls')).join() === 'Thermostat dial,HVAC mode,Decrease temperature,Increase temperature,Power,Fan mode,Preset'
    && await E((CFG) => document.querySelector(`${CFG} [data-col="controls"] [data-index="4"] .ef-col__s`).textContent === 'Not shown', CFG), (await rowsOf('controls')).join());
  check('controls are reordered, never removed (they are the entity\'s); none can be added', await E((CFG) => { const b = document.querySelector(`${CFG} [data-col="controls"] [data-index="1"] [data-k=col-menu]`); b.click(); const r = !!document.querySelector(`${CFG} [data-col="controls"] [data-index="1"] [data-cmd=up]`) && !document.querySelector(`${CFG} [data-col="controls"] [data-index="1"] [data-cmd=remove]`); b.click(); return r && !document.querySelector(`${CFG} [data-col="controls"] [data-k=col-add]`); }, CFG));
  const pickEntity = async (id) => {
    await page.click(`${CFG} .ef-field[data-key="entity"] [data-k=iqp-choose]`); await page.waitForTimeout(250);
    await E(() => { const b = document.querySelector('dialog[open] [data-k=iqp-scope-btn]'); if (b && /all/i.test(b.textContent)) b.click(); }); await page.waitForTimeout(100);
    await page.click(`${CFG} .iqp__item[data-entity="${id}"]`); await page.waitForTimeout(900);
  };
  await pickEntity('climate.basic');
  check('a basic heat / off climate: no fan, no preset (nothing it cannot do)', (await rowsOf('controls')).join() === 'Thermostat dial,HVAC mode,Decrease temperature,Increase temperature,Power', (await rowsOf('controls')).join());
  await pickEntity('climate.big');
  await editRow('HVAC mode');
  const bigModes = await E((ED) => [...document.querySelectorAll(`${ED} fieldset.ef-group`)].filter((g) => !g.hidden).map((g) => g.querySelector('legend')?.textContent).join(), ED);
  check('7 modes: one icon / colour / label section per REPORTED mode', ['Heat', 'Cool', 'Heat/Cool', 'Auto', 'Dry', 'Fan', 'Off'].every((m) => bigModes.split(',').includes(m)), bigModes);
  await page.click(`${ED} [data-k=sub-cancel]`); await page.waitForTimeout(200);
  check('…and the preview presents 7 modes as a select, not a 7-way segmented control', await E((PV) => !!document.querySelector(`${PV} .cw__sel[data-k=mode]`) && !document.querySelector(`${PV} .iqc-seg[data-k=mode]`), PV));
  await pickEntity('climate.salon');
  await editRow('HVAC mode');
  const salonModes = await E((ED) => [...document.querySelectorAll(`${ED} fieldset.ef-group`)].filter((g) => !g.hidden).map((g) => g.querySelector('legend')?.textContent).join(), ED);
  check('the salon\'s mode editor: Heat, Cool and Off only', salonModes.includes('Heat') && salonModes.includes('Cool') && salonModes.includes('Off') && !salonModes.includes('Auto') && !salonModes.includes('Dry'), salonModes);

  // ---------------------------------------------------------------- MODE: the shared segmented control (custom icons, colours, size, place)
  // (the preview at a Normal size: a narrow Compact preview caps the controls and hides secondary information, by design)
  await page.click(`${ED} [data-k=sub-cancel]`); await page.waitForTimeout(200);
  await pvSize(12, 12);
  await editRow('HVAC mode');
  await eIcon('modes.heat.icon', 'radiator'); await eIcon('modes.cool.icon', 'air-conditioner');
  await eHex('modes.heat.color', '#ff7a1a'); await eHex('modes.cool.color', '#29b6f6');
  await eNum('height', 48); await eNum('iconSize', 24); await eSel('style', 'filled');
  await eSel('placeMode', 'chosen'); await ePlace('place', 'top-left');
  const seg = await E((PV) => { const g = document.querySelector(`${PV} .iqc-seg[data-k=mode]`), o = [...g.querySelectorAll('.iqc-seg__o')];
    return { shared: g.classList.contains('iqc-seg'), h: getComputedStyle(g).height, glyph: getComputedStyle(o[0].querySelector('.iqc-seg__i')).width, icons: o.map((x) => x.querySelector('[data-mdi]')?.dataset.mdi).join(), sel: o.find((x) => x.getAttribute('aria-checked') === 'true')?.dataset.id, bg: getComputedStyle(o[0]).backgroundColor, zone: g.closest('.iqc-region').dataset.place }; }, PV);
  check('MODE live (before Save): the SHARED segmented control — radiator / air-conditioner / power, 48 px, 24 px glyphs, top left; HA\'s heat selected in its orange',
    seg.shared && seg.h === '48px' && seg.glyph === '24px' && seg.icons === 'mdi:radiator,mdi:air-conditioner,mdi:power' && seg.sel === 'heat' && seg.bg === 'rgb(255, 122, 26)' && seg.zone === 'top-left', JSON.stringify(seg));
  await eSave();

  // ---------------------------------------------------------------- POWER: the shared control button (same infrastructure as Light)
  await editRow('Power');
  await eSwitch('show');
  await eSel('power.style', 'filled'); await eIcon('power.icon', 'fire-circle'); await eNum('power.size', 60); await eNum('power.iconSize', 28); await eSel('power.shape', 'rounded');
  await eHex('power.color', '#ff7043'); await eHex('power.iconColor', '#ffffff'); await eSel('placeMode', 'chosen');
  let pw = await btnLook(PV, 'power');
  check('POWER live: the shared button (iqc-btn) — fire-circle, 60 px rounded, 28 px glyph, #ff7043, white icon, top right; ON (heat)',
    /iqc-btn/.test(pw.cls) && pw.icon === 'mdi:fire-circle' && pw.w === '60px' && pw.g === '28px' && pw.shape === 'rounded' && pw.bg === 'rgb(255, 112, 67)' && pw.color === 'rgb(255, 255, 255)' && pw.zone === 'top-right' && pw.checked === 'true', JSON.stringify(pw));
  const glyphs = {};
  for (const st of ['soft', 'outline', 'bare', 'filled']) { await eSel('power.style', st); glyphs[st] = (await btnLook(PV, 'power')).g; }
  check('ICON SIZE RULE: the 28 px glyph stays 28 px with a filled / soft / outline surface or none', Object.values(glyphs).every((g) => g === '28px'), JSON.stringify(glyphs));
  await eSave();

  // ---------------------------------------------------------------- − / +: configured differently
  await editRow('Decrease temperature');
  await eIcon('minus.icon', 'chevron-down'); await eNum('minus.size', 52); await eNum('minus.iconSize', 26); await eSel('minus.style', 'outline'); await eToken('minus.color', 'info');
  await eSel('placeMode', 'chosen'); await ePlace('place', 'center-left'); await eSave();
  await editRow('Increase temperature');
  await eIcon('plus.icon', 'chevron-up'); await eNum('plus.size', 64); await eNum('plus.iconSize', 30); await eSel('plus.style', 'filled'); await eHex('plus.color', '#ff8a00');
  await eSel('placeMode', 'chosen'); await ePlace('place', 'center-right'); await eSave();
  const mn = await btnLook(PV, 'minus'), pl = await btnLook(PV, 'plus');
  check('− : chevron-down, 52 px, 26 px glyph, outline in the theme\'s info colour, centre left', mn.icon === 'mdi:chevron-down' && mn.w === '52px' && mn.g === '26px' && mn.style === 'outline' && mn.zone === 'center-left', JSON.stringify(mn));
  check('+ : chevron-up, 64 px, 30 px glyph, filled #ff8a00, centre right', pl.icon === 'mdi:chevron-up' && pl.w === '64px' && pl.g === '30px' && pl.style === 'filled' && pl.bg === 'rgb(255, 138, 0)' && pl.zone === 'center-right', JSON.stringify(pl));

  // ---------------------------------------------------------------- the DIAL: four designs over ONE model; live size / value size / colour
  const dialModel = () => E((PV) => { const r = document.querySelector(PV), d = r.querySelector('.iqdl'), k = d.querySelector('.iqdl__knob');
    return { design: d.dataset.design, target: d.querySelector('.iqdl__target').textContent, act: d.querySelector('.iqdl__act-t').textContent, room: d.querySelector('.iqdl__room').textContent,
      min: k.getAttribute('aria-valuemin'), max: k.getAttribute('aria-valuemax'), now: k.getAttribute('aria-valuenow'), mm: [...d.querySelectorAll('.iqdl__mm')].map((t) => t.textContent).join('/'), tone: r.dataset.tone, h: getComputedStyle(d).height }; }, PV);
  const dm = {};
  await editRow('Thermostat dial');
  for (const d of DESIGNS) { await eSel('dial.design', d); await page.waitForTimeout(250); dm[d] = await dialModel(); }
  check('the 4 designs show the SAME model: target 22.5, Heating, room 21.4, limits 7–30, value 22.5, heat tone', DESIGNS.every((d) => dm[d].design === d && dm[d].target === '22.5°' && dm[d].act === 'Heating' && /21\.4/.test(dm[d].room) && dm[d].min === '7' && dm[d].max === '30' && dm[d].now === '22.5' && dm[d].tone === 'heat'), JSON.stringify(dm));
  check('…min / max labels from HA (7° / 30°) where the design shows them (all but Minimal)', ['spectrum', 'arc', 'full'].every((d) => dm[d].mm === '7°/30°') && dm.minimal.mm === '', JSON.stringify(Object.fromEntries(DESIGNS.map((d) => [d, dm[d].mm]))));
  check('design-specific options only for their design (Full: tick density + face; not the Spectrum ring)', await eShown('dial.density') && await eShown('dial.face') && !(await eShown('dial.ring')) && !(await eShown('dial.thickness')));
  await eSel('dial.design', 'spectrum');
  check('Spectrum: ring State / Gradient offered (and not Full\'s options)', await eShown('dial.ring') && !(await eShown('dial.density')));
  // the preview has been re-rendered by the design changes above: wait until its dial has been measured and fitted (a fixed delay
  // was not enough on a loaded machine — the dial measured 0 px before its first layout). The values asserted below are unchanged.
  const fitted = (PV) => { const d = document.querySelector(`${PV} .iqdl`); return !!d && d.getBoundingClientRect().height > 0 && parseFloat(d.style.getPropertyValue('--cw-dfit')) > 0; };
  await page.waitForFunction(fitted, PV, { timeout: 8000 }).catch(() => {});
  const fit = await E((PV) => parseFloat(document.querySelector(`${PV} .iqdl`).style.getPropertyValue('--cw-dfit')) || 9999, PV);
  await eNum('dial.size', 300); await eNum('dial.valueSize', 64); await eHex('dial.heatColor', '#ff5500'); await page.waitForTimeout(200);
  await page.waitForFunction((PV) => { const d = document.querySelector(`${PV} .iqdl`); return !!d && d.getBoundingClientRect().height > 0 && getComputedStyle(d.querySelector('.iqdl__target')).fontSize !== '0px'; }, PV, { timeout: 8000 }).catch(() => {});
  const dl = await E((PV) => { const d = document.querySelector(`${PV} .iqdl`); return { h: getComputedStyle(d).height, fs: getComputedStyle(d.querySelector('.iqdl__target')).fontSize, act: getComputedStyle(d.querySelector('.iqdl__act')).stroke }; }, PV);
  check('DIAL live: size 300 px (or what the card fits), target value 64 px, the heating colour #ff5500 on the ring', dl.h === `${Math.min(300, fit)}px` && dl.fs === '64px' && dl.act === 'rgb(255, 85, 0)', JSON.stringify({ dl, fit }));
  await eSel('dial.design', 'full');
  await page.waitForFunction((PV) => { const d = document.querySelector(`${PV} .iqdl`); return !!d && d.getBoundingClientRect().height > 0 && getComputedStyle(d.querySelector('.iqdl__target')).fontSize !== '0px'; }, PV, { timeout: 8000 }).catch(() => {});
  check('changing the design keeps its size and value size (300 px / 64 px)', (await dialModel()).h === `${Math.min(300, fit)}px` && await E((PV) => getComputedStyle(document.querySelector(`${PV} .iqdl__target`)).fontSize === '64px', PV));
  await eSel('dial.design', 'spectrum');
  await eSave();
  await apply();
  let c = await cfgOf('cc');
  check('Apply stores the controls in order with their look and place (structured, no coordinates)', c.controls.map((x) => x.type).join() === 'dial,mode,minus,plus,power,fan,preset,swing,humidity,range'
    && c.controls[1].modes.heat.icon === 'mdi:radiator' && c.controls[1].place === 'top-left' && c.controls[4].icon === 'mdi:fire-circle' && c.controls[4].size === 60 && c.controls[0].size === 300 && c.controls[0].heatColor === '#ff5500', JSON.stringify(c.controls));

  // ---------------------------------------------------------------- runtime (view mode, real HA calls): mode, power, − / +, mode vs action
  await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'cc'); it.config.interactions = { tap: { action: 'navigate', page: 'lights' } }; window.editor.setModel(m); });
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(900);
  const home = await pageNow(), W = '[data-grid-id="cc"]';
  await page.locator(`${W} .cw`).scrollIntoViewIfNeeded();
  const selNow = () => E((W) => document.querySelector(`${W} .iqc-seg[data-k=mode] [aria-checked="true"]`)?.dataset.id || null, W);
  const waitFor = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 15000 }).then(() => true).catch(() => false);
  let n0 = calls().length;
  await page.click(`${W} .iqc-seg[data-k=mode] .iqc-seg__o[data-id="cool"]`); await page.waitForTimeout(800);
  let k = calls().slice(n0);
  check('mode Heat → Cool: one climate.set_hvac_mode cool for THIS climate; no card tap', k.length === 1 && /climate\/set_hvac_mode/.test(k[0].url) && body(k[0]).hvac_mode === 'cool' && body(k[0]).entity_id === 'climate.salon' && (await pageNow()) === home, JSON.stringify(k));
  check('…the selection waits for Home Assistant (still Heat)', (await selNow()) === 'heat');
  salon('cool', { action: 'cooling' });
  const gotCool = await waitFor((W) => document.querySelector(`${W} .iqc-seg[data-k=mode] [aria-checked="true"]`)?.dataset.id === 'cool', W);
  await page.waitForTimeout(400);
  check('HA confirms cool (cooling): Cool selected in its blue; the dial turns to the cooling tone', gotCool && await E((W) => getComputedStyle(document.querySelector(`${W} .iqc-seg__o[data-id="cool"]`)).backgroundColor === 'rgb(41, 182, 246)' && document.querySelector(`${W} .cw`).dataset.tone === 'cool', W));
  salon('heat', { action: 'idle' });
  await waitFor((W) => document.querySelector(`${W} .iqc-seg[data-k=mode] [aria-checked="true"]`)?.dataset.id === 'heat', W);
  await page.waitForTimeout(300);
  const mva = await E((W) => { const r = document.querySelector(`${W} .cw`); return { tone: r.dataset.tone, state: r.querySelector('.cw__state-t').textContent, act: r.querySelector('.iqdl__act-t').textContent }; }, W);
  check('MODE vs ACTION: heat mode but idle → idle tone (never shown as heating), "Idle · Heat"', mva.tone === 'idle' && mva.state === 'Idle · Heat' && mva.act === 'Idle', JSON.stringify(mva));
  salon('heat');
  await waitFor((W) => document.querySelector(`${W} .cw`)?.dataset.tone === 'heat', W);
  n0 = calls().length;
  await page.click(`${W} .cw__btn[data-k=power]`); await page.waitForTimeout(800);
  k = calls().slice(n0);
  check('POWER (on) → climate.set_hvac_mode off; no card tap', k.length === 1 && body(k[0]).hvac_mode === 'off' && (await pageNow()) === home, JSON.stringify(k));
  salon('off', { action: 'off' });
  const offOk = await waitFor((W) => document.querySelector(`${W} .cw__btn[data-k=power]`)?.getAttribute('aria-checked') === 'false', W);
  await page.waitForTimeout(400);
  pw = await btnLook(W, 'power');
  check('OFF from HA: Power reads off (restrained, not its colour); the dial says Off', offOk && pw.bg !== 'rgb(255, 112, 67)' && await E((W) => /Off/.test(document.querySelector(`${W} .iqdl__target`).textContent), W), JSON.stringify(pw));
  n0 = calls().length;
  await page.click(`${W} .cw__btn[data-k=power]`); await page.waitForTimeout(800);
  k = calls().slice(n0);
  check('POWER (off) → set_hvac_mode heat (the last mode it was on)', k.length === 1 && body(k[0]).hvac_mode === 'heat', JSON.stringify(k));
  salon('heat');
  await waitFor((W) => document.querySelector(`${W} .cw`)?.dataset.mode === 'heat' && document.querySelector(`${W} .cw`)?.dataset.tone === 'heat', W);
  n0 = calls().length;
  await page.click(`${W} .cw__btn[data-k=plus]`); await page.waitForTimeout(800);
  await page.click(`${W} .cw__btn[data-k=minus]`); await page.waitForTimeout(800);
  k = calls().slice(n0);
  check('+ then − : set_temperature 23 then 22.5 (HA\'s 0.5 step); no card tap', k.length === 2 && body(k[0]).temperature === 23 && body(k[1]).temperature === 22.5 && (await pageNow()) === home, JSON.stringify(k));
  // the dial: keyboard on its handle → the same target model
  n0 = calls().length;
  await page.focus(`${W} .iqdl__knob`); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(800);
  k = calls().slice(n0);
  check('the dial\'s handle (keyboard ↑) → set_temperature +0.5 (the same target model)', k.length === 1 && /set_temperature/.test(k[0].url), JSON.stringify(k));
  const tapAt = await page.$eval(`${W} .cw__name`, (e) => { const b = e.getBoundingClientRect(); return { x: b.left + 6, y: b.top + b.height / 2 }; });
  n0 = calls().length;
  await page.mouse.click(tapAt.x, tapAt.y); await page.waitForTimeout(700);
  check('a tap on the card itself runs the CARD\'s action (navigate) — no climate call', (await pageNow()) === 'lights' && calls().length === n0, String(await pageNow()));
  await E((p) => window.editor.go(p), home); await page.waitForTimeout(500);

  // ---------------------------------------------------------------- a new target: every design represents it
  salon('heat', { target: 24 });
  await waitFor((W) => document.querySelector(`${W} .iqdl__knob`)?.getAttribute('aria-valuenow') === '24', W);
  const after = await E(() => {
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999;display:flex;width:2000px'; document.body.append(host);
    const live = window.editor.getModel().pages[0].items.find((i) => i.id === 'cc').config;
    const st = document.querySelector('[data-grid-id="cc"] .cw').climate.getState();
    const out = ['spectrum', 'minimal', 'arc', 'full'].map((d) => { const b = document.createElement('div'); b.style.cssText = 'width:380px;height:460px;display:grid'; host.append(b);
      b.append(window.MaisonRegistry.build('climate', { ...live, entity: undefined, targetTemperature: st.targetTemperature, currentTemperature: 21.4, hvacModes: ['heat', 'cool', 'off'], hvacMode: 'heat', state: 'heating', minTemperature: 7, maxTemperature: 30, temperatureStep: 0.5, controls: live.controls.map((x) => (x.type === 'dial' ? { ...x, design: d } : x)) }));
      return b; });
    return new Promise((res) => setTimeout(() => { const r = out.map((b) => { const d = b.querySelector('.iqdl'); return { design: d.dataset.design, target: d.querySelector('.iqdl__target').textContent, now: d.querySelector('.iqdl__knob').getAttribute('aria-valuenow') }; }); host.remove(); res({ r, st }); }, 900)); });
  check('HA reports 24.0: the card follows, and every design represents 24.0 the same way', after.st.targetTemperature === 24 && after.r.every((x) => x.target === '24.0°' && x.now === '24'), JSON.stringify(after));

  // ---------------------------------------------------------------- INFORMATION: the shared items (icons, sizes, colours, backgrounds, animations, positions)
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  await open('cc');
  await pvSize(12, 12);
  const addInfo = async (entity, fill) => {
    await E((CFG) => document.querySelector(`${CFG} [data-col="info"] [data-k=col-add]`).click(), CFG); await page.waitForSelector(ED);
    await page.click(`${ED} [data-k=iqp-choose]`); await page.waitForTimeout(250);
    await E(() => { const b = document.querySelector('[data-k=item-editor] [data-k=iqp-scope-btn]'); if (b && /all/i.test(b.textContent)) b.click(); }); await page.waitForTimeout(100);
    await page.click(`${ED} .iqp__item[data-entity="${entity}"]`); await page.waitForTimeout(300);
    await fill(); await eSave();
  };
  let tempKey = '';
  await addInfo('climate.salon', async () => {
    tempKey = await E((ED) => [...document.querySelectorAll(`${ED} .ef-field[data-key="value"] option`)].map((o) => o.value).find((v) => /current/.test(v)) || '', ED);
    if (tempKey) await eSel('value', tempKey);
    await page.fill(`${ED} .ef-field[data-key="label"] input`, 'Room now'); await eIcon('icon', 'home-thermometer'); await eSel('style', 'emphasis'); await eNum('valueSize', 30); await eNum('labelSize', 12);
    await eToken('color', 'accent-hot'); await ePlace('place', 'bottom-left');
    const live1 = await E((PV) => { const f = document.querySelector(`${PV} .cw__fact`); return f ? { v: getComputedStyle(f.querySelector('.iqf__v')).fontSize, zone: f.closest('.iqc-region')?.dataset.place } : null; }, PV);
    check('INFORMATION live in the preview before Save (value 30 px, bottom left)', !!live1 && live1.v === '30px' && live1.zone === 'bottom-left', JSON.stringify(live1));
  });
  check('Room now: the climate\'s own current temperature (an attribute of the same entity)', !!tempKey, tempKey);
  await addInfo('fan.exhaust', async () => {
    await page.fill(`${ED} .ef-field[data-key="label"] input`, 'Exhaust'); await eIcon('icon', 'fan'); await eNum('iconSize', 22); await eSel('iconBg', 'subtle'); await eHex('color', '#4dd0e1');
    await eSel('animation', 'rotate'); await ePlace('place', 'bottom-right');
  });
  await addInfo('sensor.stove_power', async () => { await page.fill(`${ED} .ef-field[data-key="label"] input`, 'Power'); await eIcon('icon', 'flash'); await ePlace('place', 'bottom-center'); });
  await addInfo('climate.salon', async () => {
    const actKey = await E((ED) => [...document.querySelectorAll(`${ED} .ef-field[data-key="value"] option`)].map((o) => o.value).find((v) => /hvac_action|action/.test(v)) || 'state', ED);
    await eSel('value', actKey); await page.fill(`${ED} .ef-field[data-key="label"] input`, 'Heating'); await eIcon('icon', 'fire'); await eSel('animation', 'pulse'); await eToken('color', 'warning'); await ePlace('place', 'bottom-center');
  });
  check('four information items listed in order', (await rowsOf('info')).join() === 'Room now,Exhaust,Power,Heating', (await rowsOf('info')).join());
  const facts = () => E((PV) => [...document.querySelectorAll(`${PV} .cw__fact`)].map((f) => ({ id: f.dataset.fact, zone: f.closest('.iqc-region')?.dataset.place, label: f.querySelector('.iqf__l')?.textContent, g: getComputedStyle(f.querySelector('.iqf__ic') || f).width, bg: f.querySelector('.iqf__ic')?.dataset.iqiBg || 'none', anim: f.querySelector('.iqf__ic')?.dataset.iqiAnim || '' })), PV);
  let fx = await facts();
  check('placed by their 3 × 3 position: Room now bottom left · Exhaust bottom right · Power + Heating bottom centre (a group, in order)',
    fx.map((f) => `${f.label}@${f.zone}`).join() === 'Room now@bottom-left,Power@bottom-center,Heating@bottom-center,Exhaust@bottom-right', JSON.stringify(fx));
  const ex = fx.find((f) => f.label === 'Exhaust');
  check('Exhaust: the fan icon at 22 px with a subtle background (the glyph unchanged), rotating while the fan is ON', ex.g === '22px' && ex.bg === 'subtle' && ex.anim === 'rotate', JSON.stringify(ex));
  check('Heating: pulses while the climate is HEATING (its action)', fx.find((f) => f.label === 'Heating').anim === 'pulse', JSON.stringify(fx));
  // (the dial has a MANUAL size here — honoured up to the card by design, the other parts movable; its geometry: tests/climate-placement.mjs)
  const ov = await E((PV) => { const els = [...document.querySelectorAll(`${PV} .cw__fact, ${PV} .cw__btn, ${PV} .iqc-seg, ${PV} .cw__id`)].filter((n) => n.offsetParent); let o = null;
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { if (els[i].contains(els[j]) || els[j].contains(els[i])) continue; const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect(); if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) o = `${els[i].className}×${els[j].className}`; }
    return o; }, PV);
  check('no overlap: information, buttons, mode control, title', ov === null, ov);
  await E((CFG) => { document.querySelector(`${CFG} [data-col="info"] [data-index="3"] [data-k=col-menu]`).click(); document.querySelector(`${CFG} [data-col="info"] [data-index="3"] [data-cmd=up]`).click(); }, CFG); await page.waitForTimeout(250);
  fx = await facts();
  check('reorder: Heating moved above Power → the bottom-centre group follows (Heating, Power)', fx.filter((f) => f.zone === 'bottom-center').map((f) => f.label).join() === 'Heating,Power', JSON.stringify(fx));
  await E((CFG) => { document.querySelector(`${CFG} [data-col="info"] [data-index="3"] [data-k=col-menu]`).click(); document.querySelector(`${CFG} [data-col="info"] [data-index="3"] [data-cmd=remove]`).click(); }, CFG); await page.waitForTimeout(250);
  check('remove: Power gone from the list and the preview', (await rowsOf('info')).join() === 'Room now,Exhaust,Heating' && !(await facts()).some((f) => f.label === 'Power'), (await rowsOf('info')).join());
  // the PICTURE: Climate's built-in artwork, state-aware
  await page.click(`${CFG} .ef-field[data-key="image"] [data-k=art-builtin][data-value*="fireplace"]`); await page.waitForTimeout(300);
  check('Fireplace (Climate\'s own built-in): shown, its treatment / overlay / state-aware options appear', await E((PV) => /fireplace\.svg/.test(document.querySelector(`${PV} .cw__img`).getAttribute('src') || '') && document.querySelector(PV).hasAttribute('data-image'), PV) && await shown('imageTreatment') && await shown('overlay') && await shown('stateImage'));
  check('…the picture follows the ACTION (heating: warmed)', await E((PV) => { const r = document.querySelector(PV); return r.dataset.react === 'on' && r.dataset.tone === 'heat'; }, PV));
  await apply();
  // animation truth on the dashboard: the fan stops → the icon stops; the climate goes idle → the pulse stops
  L.setEntity('fan.exhaust', 'off', { name: 'Exhaust' }); salon('heat', { target: 24, action: 'idle' });
  const stopped = await waitFor(() => { const r = document.querySelector('.ed-canvas [data-grid-id="cc"] .cw'); if (!r) return false; const f = [...r.querySelectorAll('.cw__fact')]; return f.length === 3 && f.every((x) => !x.querySelector('.iqf__ic')?.dataset.iqiAnim); });
  check('fan off → no rotation; idle → no pulse (animations follow Home Assistant, never faked)', stopped);
  L.setEntity('fan.exhaust', 'on', { name: 'Exhaust' }); salon('heat', { target: 24 });

  // ---------------------------------------------------------------- uploads: Climate A → Climate B, never Light / Room
  await open('cc');
  await page.setInputFiles(`${CFG} input[data-upload="image"]`, 'assets/img/media/artwork-dusk.jpg'); await page.waitForTimeout(1600);
  const up = await E((PV) => document.querySelector(`${PV} .cw__img`).getAttribute('src'), PV);
  await apply();
  check('a second climate', (await add('cd', { name: 'Hall', entity: 'climate.basic', variant: 'compact' }, 80, 6, 3)) === 'ok');
  await open('cd');
  const libB = await E((CFG) => [...document.querySelectorAll(`${CFG} .ef-field[data-key="image"] [data-k=art-lib]`)].map((t) => t.dataset.value), CFG);
  const scoped = await E(async () => { const g = async (s) => (await (await fetch(`api/asset_library.php?scope=${s}`, { credentials: 'same-origin' })).json()).items.map((x) => x.ref); return { climate: await g('climate'), light: await g('light'), room: await g('custom.room-scene') }; });
  check('uploaded in Climate A: in Climate B\'s library, not in Light\'s or Room\'s (served through the secure route)', /^api\/asset\.php\?id=[0-9a-f]{32}$/.test(up) && libB.includes(up) && scoped.climate.includes(up) && !scoped.light.includes(up) && !scoped.room.includes(up), JSON.stringify({ up, libB, scoped }));
  check('Light / Room built-ins are not offered in Climate', await E((CFG) => ![...document.querySelectorAll(`${CFG} .ef-field[data-key="image"] [data-k=art-builtin]`)].some((t) => /light\/|room-scene/.test(t.dataset.value)), CFG));
  // the modal rule: a click outside the configurator or an item editor closes nothing; Escape cancels
  await E((CFG) => document.querySelector(`${CFG} [data-col="controls"] [data-index="0"] [data-k=col-edit]`).click(), CFG); await page.waitForSelector(ED);
  await page.mouse.click(6, 6); await page.waitForTimeout(200);
  check('modal rule: a click outside the dial editor closes neither it nor the configurator', await E(({ ED, CFG }) => !!document.querySelector(`${ED}[open]`) && !!document.querySelector(CFG), { ED, CFG }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('Escape cancels the item editor only', await E(({ ED, CFG }) => !document.querySelector(`${ED}[open]`) && !!document.querySelector(CFG), { ED, CFG }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  check('…and then the configurator (Cancel, never Apply)', !(await E((CFG) => !!document.querySelector(CFG), CFG)));

  // ---------------------------------------------------------------- LANDSCAPE (reference B) and PORTRAIT (reference A) — the same architecture, configured
  const compose = (cfg, w, h) => E(({ cfg, w, h }) => {
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999'; document.body.append(host);
    const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;display:grid`; host.append(b);
    b.append(window.MaisonRegistry.build('climate', cfg));
    return new Promise((res) => setTimeout(() => {
      const r = b.querySelector('.cw'), rr = r.getBoundingClientRect(), z = (sel) => r.querySelector(sel)?.closest('.iqc-region')?.dataset.place || null;
      const els = [...r.querySelectorAll('.cw__fact, .iqdl, .cw__btn, .iqc-seg, .cw__id')].filter((n) => n.offsetParent);
      let ov = null;
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { if (els[i].contains(els[j]) || els[j].contains(els[i])) continue; const a = els[i].getBoundingClientRect(), q = els[j].getBoundingClientRect(); if (a.left < q.right - 1 && q.left < a.right - 1 && a.top < q.bottom - 1 && q.top < a.bottom - 1) ov = `${els[i].className.split(' ')[0]}×${els[j].className.split(' ')[0]}`; }
      const out = { arr: r.dataset.fitArr, land: r.dataset.land, minusLine: r.querySelector('.cw__btn[data-k=minus]')?.closest('.iqc-line')?.dataset.line || null, plusLine: r.querySelector('.cw__btn[data-k=plus]')?.closest('.iqc-line')?.dataset.line || null, mode: z('.iqc-seg[data-k=mode]'), power: z('.cw__btn[data-k=power]'), minus: z('.cw__btn[data-k=minus]'), plus: z('.cw__btn[data-k=plus]'), dial: r.querySelector('.iqdl')?.dataset.place || z('.iqdl'), title: z('.cw__id'),
        facts: [...r.querySelectorAll('.cw__fact')].map((f) => f.closest('.iqc-region')?.dataset.place), image: r.hasAttribute('data-image'), ov,
        inside: els.every((n) => { const q = n.getBoundingClientRect(); return q.left >= rr.left - 1 && q.right <= rr.right + 1 && q.top >= rr.top - 1 && q.bottom <= rr.bottom + 1; }), dialPx: Math.round(r.querySelector('.iqdl').getBoundingClientRect().height) };
      host.remove(); res(out); }, 1200)); }, { cfg, w, h });
  const base = { name: 'Poêle', currentTemperature: 21.4, targetTemperature: 22.5, minTemperature: 7, maxTemperature: 30, temperatureStep: 0.5, hvacMode: 'heat', hvacModes: ['heat', 'cool', 'off'], state: 'heating', capabilities: { targetTemperature: true, hvacMode: true }, image: 'widgets/default/climate/assets/fireplace.svg',
    info: [{ id: 'h1', entity: 'sensor.stove_power', label: 'Power', style: 'card', slot: 'left', vslot: 'bottom' }, { id: 'h2', entity: 'climate.salon', value: tempKey || 'state', label: 'Room now', style: 'card', slot: 'center', vslot: 'bottom' }, { id: 'h3', entity: 'fan.exhaust', label: 'Exhaust', icon: 'mdi:fan', animation: 'rotate', slot: 'right', vslot: 'bottom' }] };
  const landCfg = { ...base, controls: [{ type: 'dial', place: 'center-center' }, { type: 'mode', place: 'top-left' }, { type: 'minus', place: 'center-left', size: 56 }, { type: 'plus', place: 'center-right', size: 56 }, { type: 'power', place: 'top-right', size: 56 }] };
  const land = await compose(landCfg, 900, 520);
  check('LANDSCAPE (ref. B): mode top left · Power top right · dial centre · − centre left · + centre right · title under the dial · information along the bottom · fireplace',
    land.land === 'true' && land.mode === 'top-left' && land.power === 'top-right' && land.dial === 'center-center' && land.minus === 'center-left' && land.plus === 'center-right' && land.title === 'bottom-center'
    && land.facts.join() === 'bottom-left,bottom-center,bottom-right' && land.image, JSON.stringify(land));
  check('…no overlap, everything inside, a dominant dial (truly centred: the same room kept above and below)', !land.ov && land.inside && land.dialPx >= 220, JSON.stringify(land));
  const portCfg = { ...base, controls: [{ type: 'dial' }, { type: 'mode', place: 'top-right', labels: false }, { type: 'minus' }, { type: 'plus' }] };
  const port = await compose(portCfg, 420, 760);
  check('PORTRAIT (ref. A): title top left · mode top right · a large dial in the centre · − / + their own places (bottom left / right) · information at the bottom · fireplace',
    port.land === 'false' && port.title === 'top-left' && port.mode === 'top-right' && port.dial === 'center-center' && port.minus === 'bottom-left' && port.plus === 'bottom-right'
    && port.facts.length === 3 && port.facts.every((z) => z.startsWith('bottom-')) && port.image, JSON.stringify(port));
  check('…no overlap, everything inside, the dial dominates (≥ 60 % of the width)', !port.ov && port.inside && port.dialPx >= 250, JSON.stringify(port));
  const small = [];
  for (const [w, h] of [[150, 140], [260, 260], [300, 170]]) small.push({ w, h, ...(await compose(landCfg, w, h)) });
  check('the same compositions at Micro / Compact: simplified (no secondary information), nothing overlaps or leaves the card', small.every((x) => !x.ov && x.inside && x.facts.length === 0), JSON.stringify(small));

  // ---------------------------------------------------------------- every DESIGN × portrait / landscape × Micro / Compact / Normal / Large
  const mx = await E(() => {
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999;display:flex;flex-wrap:wrap;gap:8px;width:2800px'; document.body.append(host);
    const sizes = [[150, 140], [250, 260], [360, 470], [620, 560], [300, 170], [560, 300], [880, 470]], out = [];
    ['spectrum', 'minimal', 'arc', 'full'].forEach((d) => sizes.forEach(([w, h]) => {
      const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;display:grid`; host.append(b);
      b.append(window.MaisonRegistry.build('climate', { name: 'Typography gypqj', currentTemperature: 21.4, targetTemperature: 22.5, minTemperature: 7, maxTemperature: 30, temperatureStep: 0.5, hvacMode: 'heat', hvacModes: ['heat', 'cool', 'off'], state: 'heating', capabilities: { targetTemperature: true, hvacMode: true }, controls: [{ type: 'dial', design: d }, { type: 'power', show: true }] }));
    }));
    return new Promise((res) => setTimeout(() => {
      host.querySelectorAll('.cw').forEach((r) => {
        const rr = r.getBoundingClientRect(), vis = (n) => { if (!n) return false; for (let a = n; a && a !== r; a = a.parentElement) if (getComputedStyle(a).display === 'none') return false; const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
        const els = [...r.querySelectorAll('.iqdl, .cw__btn, .iqc-seg, .cw__id')].filter(vis);
        const inside = els.every((n) => { const q = n.getBoundingClientRect(); return q.left >= rr.left - 1 && q.right <= rr.right + 1 && q.top >= rr.top - 1 && q.bottom <= rr.bottom + 1; });
        let ov = null;
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i].getBoundingClientRect(), q = els[j].getBoundingClientRect(); if (a.left < q.right - 1 && q.left < a.right - 1 && a.top < q.bottom - 1 && q.top < a.bottom - 1) ov = `${els[i].className.split(' ')[0]}×${els[j].className.split(' ')[0]}`; }
        const ticks = r.querySelector('.iqdl__ticks'), n = r.querySelector('.cw__name'), fs = parseFloat(getComputedStyle(n).fontSize), nb = n.getBoundingClientRect();
        let clip = null;
        for (let a = n; a && a !== r.parentElement; a = a.parentElement) { const s = getComputedStyle(a); if (['hidden', 'clip', 'auto', 'scroll'].includes(s.overflowY) && a.getBoundingClientRect().bottom < nb.top + (nb.height - fs) / 2 + fs * 1.02 - 0.5) { clip = a.className; break; } }
        out.push({ d: r.querySelector('.iqdl').dataset.design, arr: r.dataset.fitArr, land: r.dataset.land, inside, ov, value: r.querySelector('.iqdl__target').textContent, ticks: ticks ? vis(ticks) : null, knob: vis(r.querySelector('.iqdl__knob')), clip });
      });
      host.remove(); res(out);
    }, 1500));
  });
  check('4 designs × 7 shapes: every MaisonFit size met, portrait and landscape', ['micro', 'compact', 'normal', 'large'].every((a) => mx.some((x) => x.arr === a)) && mx.some((x) => x.land === 'true') && mx.some((x) => x.land === 'false'), JSON.stringify(mx.map((x) => `${x.d}/${x.arr}/${x.land}`)));
  check('…the SAME target (22.5°) in every design and size; nothing overlaps or leaves the card', mx.every((x) => x.value === '22.5°' && x.inside && !x.ov), JSON.stringify(mx.filter((x) => !(x.value === '22.5°' && x.inside && !x.ov))));
  check('Micro simplifies: no tiny ticks, no handle (the temperature and its state ring only)', mx.filter((x) => x.arr === 'micro').every((x) => !x.ticks && !x.knob), JSON.stringify(mx.filter((x) => x.arr === 'micro')));
  check('Normal / Large keep the design\'s detail (ticks where the design has them)', mx.filter((x) => ['normal', 'large'].includes(x.arr) && ['spectrum', 'full'].includes(x.d)).every((x) => x.ticks), JSON.stringify(mx.filter((x) => x.arr === 'normal')));
  check('the title\'s descenders are never clipped ("Typography gypqj")', mx.every((x) => !x.clip), JSON.stringify(mx.filter((x) => x.clip)));

  // ---------------------------------------------------------------- persistence: save / reload / export → import
  c = await cfgOf('cc');
  const saved = await E(() => window.editor.save());
  await page.reload(); await page.waitForTimeout(1800);
  const rt = await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'cc'); const t = window.MaisonModel.serialize(m), r = window.MaisonModel.parse(t, window.MaisonRegistry); return { c: it.config, rt: r.ok && JSON.stringify(r.model.pages[0].items.find((i) => i.id === 'cc').config) === JSON.stringify(it.config) }; });
  check('save / reload / export → import keep entity, controls (order, icons, colours, styles, shapes, sizes, placements, dial design / size / colours), information (order, look, positions), image, interactions',
    saved === true && rt.rt && JSON.stringify(rt.c) === JSON.stringify(c) && rt.c.info.length === 3 && /^api\/asset\.php/.test(rt.c.image), JSON.stringify({ before: c, after: rt.c }));
  // the editor zoom never changes the classification
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(500);
  const a1 = await E(() => document.querySelector('.ed-canvas [data-grid-id="cc"] .cw').dataset.fitArr);
  await page.click('[data-zoom="0.5"]'); await page.waitForTimeout(600);
  const a2 = await E(() => document.querySelector('.ed-canvas [data-grid-id="cc"] .cw').dataset.fitArr);
  await page.click('[data-zoom="fit"]'); await page.waitForTimeout(300);
  check('editor zoom 50 % does not change the Climate\'s MaisonFit size', a1 === a2, `${a1} → ${a2}`);
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
