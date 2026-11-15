/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// LIGHT — the reference CONTROL widget, through the REAL editor (real PHP server, fake Home Assistant): its sections (Light · Controls ·
// Interactions · Appearance · Images · Visibility); Controls gated by what the linked light REALLY supports (on/off, brightness, colour
// temperature, colour, combinations, unavailable); POWER (the shared control button: icon, button / icon size, style, shape, colours, state
// appearance — live, truthful, persisted); an optional TOGGLE (the shared segmented control: per-option icon / label / value / colour,
// selection from the confirmed HA state, A ⇄ B through real HA calls); BRIGHTNESS (track, handle, accent; drag → HA); the card's gestures vs
// the light's own controls; images (scoped to Light); the fallback icon rule; descender-safe titles at every variant × MaisonFit size; zoom;
// persistence / export; older configurations; the modal rule.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const CFG = 'dialog.ed-dlg--cfg[open]', PV = `${CFG} .ecfg-pv .lw`;
const VARIANTS = ['artwork', 'compact', 'slider', 'image'];
let L, B;
try {
  L = await live();
  L.setEntity('light.onoff', 'off', { name: 'Porch', f: 0, scm: ['onoff'] });
  L.setEntity('light.dim', 'on', { name: 'Bedside', f: 0, scm: ['brightness'], br: 128, cm: 'brightness' });
  L.setEntity('light.ct', 'on', { name: 'Desk', f: 0, scm: ['color_temp'], br: 200, cm: 'color_temp', ctk: 3000, ckmin: 2200, ckmax: 6500 });
  L.setEntity('light.rgb', 'on', { name: 'Strip', f: 0, scm: ['hs'], br: 255, cm: 'hs', hs: [220, 90] });
  L.setEntity('light.full', 'on', { name: 'Dining', f: 0, scm: ['color_temp', 'hs'], br: 184, cm: 'color_temp', ctk: 2700, ckmin: 2000, ckmax: 6500, hs: [30, 80] });
  L.setEntity('light.gone', 'unavailable', { name: 'Garage', f: 0, scm: ['brightness'] });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const calls = () => L.haCalls.filter((x) => /\/api\/services\//.test(x.url));
  const shown = (key) => E(({ CFG, key }) => { const n = document.querySelector(`${CFG} .ef-field[data-key="${key}"]`); return !!n && !n.hidden && !n.closest('[hidden]'); }, { CFG, key });
  const setNum = async (key, v) => { const s = `${CFG} .ef-field[data-key="${key}"] input.ef-range__n`; await page.fill(s, String(v)); await page.press(s, 'Enter'); await page.waitForTimeout(150); };
  const openAll = () => E((CFG) => document.querySelectorAll(`${CFG} details.ef-group--acc`).forEach((d) => { d.open = true; }), CFG);
  const cfgOf = (id) => E((id) => structuredClone(window.editor.getModel().pages[0].items.find((i) => i.id === id).config), id);
  const add = (id, c, y) => E(({ id, c, y }) => { const m = window.editor.getModel(); m.pages[0].items.push({ id, type: 'light', parent: null, config: c, layout: { desktop: { x: 1, y, w: 8, h: 6 }, tablet: { x: 1, y, w: 6, h: 6 }, mobile: { w: 4, h: 5 } } }); const r = window.editor.setModel(m); return r.ok ? 'ok' : JSON.stringify(r.errors); }, { id, c, y });
  const open = async (id) => { await page.click(`.ed-canvas [data-grid-id="${id}"]`, { position: { x: 12, y: 12 }, force: true }); await page.waitForTimeout(150); await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector(`${CFG} .ef`); await openAll(); };
  const apply = async () => { await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(300); };
  const cancel = async () => { await page.click(`${CFG} .ecfg-foot button:has-text("Cancel")`); await page.waitForTimeout(250); };
  const ED = `${CFG} [data-k=item-editor]`;
  const rowsOf = (col) => E(({ CFG, col }) => [...document.querySelectorAll(`${CFG} [data-col="${col}"] .ef-col__row`)].map((r) => r.querySelector('.ef-col__t').textContent), { CFG, col });
  const controlsShown = async () => (await rowsOf('controls')).filter((t) => t !== 'Power').join(',');
  const editRow = async (col, title) => { const i = (await rowsOf(col)).indexOf(title); await E(({ CFG, col, i }) => document.querySelector(`${CFG} [data-col="${col}"] [data-index="${i}"] [data-k=col-edit]`).click(), { CFG, col, i }); await page.waitForSelector(ED); };
  const eShown = (key) => E(({ ED, key }) => { const n = document.querySelector(`${ED} .ef-field[data-key="${key}"]`); return !!n && !n.hidden && !n.closest('[hidden]'); }, { ED, key });
  const eNum = async (key, v) => { const q = `${ED} .ef-field[data-key="${key}"] input.ef-range__n`; await page.fill(q, String(v)); await page.press(q, 'Enter'); await page.waitForTimeout(120); };
  const eSel = async (key, v) => { await page.selectOption(`${ED} .ef-field[data-key="${key}"] select`, v); await page.waitForTimeout(120); };
  const eIcon = async (key, n) => { await page.click(`${ED} .ef-field[data-key="${key}"] [data-k=icon-field]`); await page.fill(`${ED} .ef-field[data-key="${key}"] .iqi__search`, n); await page.click(`${ED} .ef-field[data-key="${key}"] .iqi__opt[data-icon="mdi:${n}"]`); await page.waitForTimeout(150); };
  const eHex = (key, hex) => E(({ ED, key, hex }) => { const p = document.querySelector(`${ED} .ef-field[data-key="${key}"] [data-k=color-pick]`); p.value = hex; p.dispatchEvent(new Event('input', { bubbles: true })); }, { ED, key, hex });
  const eToken = async (key, t) => { await page.click(`${ED} .ef-field[data-key="${key}"] .ef-icon[data-value="${t}"]`); await page.waitForTimeout(100); };
  const eSwitch = async (key) => { await page.click(`${ED} .ef-field[data-key="${key}"] button[role=switch]`); await page.waitForTimeout(150); };
  const eSave = async () => { await page.click(`${ED} [data-k=sub-save]`); await page.waitForTimeout(250); };
  // computed (unscaled) sizes and colours in the configuration's live preview
  const pvPower = () => E((PV) => { const b = document.querySelector(`${PV} .lw__power`), i = b.querySelector('.iqc-btn__i, .lw__pi, svg'), cs = getComputedStyle(b);
    return { cls: b.className, w: cs.width, h: cs.height, g: i ? getComputedStyle(i).width : '', bg: cs.backgroundColor, color: cs.color, style: b.dataset.style, shape: b.dataset.shape, on: b.dataset.on, radius: cs.borderTopLeftRadius, icon: b.querySelector('[data-mdi]')?.dataset.mdi }; }, PV);

  // ---------------------------------------------------------------- older configurations load
  const legacy = await E(() => { const R = window.MaisonRegistry; const a = R.fullConfig('light', { name: 'Old', dimmable: true, variant: 'tile', titleSize: 'large', artwork: 'x' });
    const b = R.fullConfig('light', { name: 'Old 2', variant: 'image', artwork: 'widgets/default/light/assets/artwork-pendant.svg' });
    const c = R.fullConfig('light', { name: 'Old 3', controls: { brightness: true, color: false, junk: 1 }, fallbackIcon: { icon: 'mdi:lamp', size: 999 } });
    return { a, b, c, errs: [a, b, c].map((x) => R.validateConfig('light', x).length) }; });
  check('older lights load: dimmable → capability, tile → Standard, artwork → image, title size name kept, valid', legacy.a.capabilities.brightness === true && !('variant' in legacy.a) && legacy.a.titleSize === 'large'
    && legacy.b.image === 'widgets/default/light/assets/artwork-pendant.svg' && legacy.errs.every((n) => n === 0), JSON.stringify(legacy));
  check('an older controls choice ({ color: false }) becomes the ordered list; an icon size is clamped to 16–160', JSON.stringify(legacy.c.controls) === '[{"type":"power"},{"type":"brightness"},{"type":"colorTemp"},{"type":"color","show":false},{"type":"effect"}]' && legacy.c.fallbackIcon.size === 160, JSON.stringify(legacy.c));
  const lp = await E(() => { const R = window.MaisonRegistry; return [R.fullConfig('light', { name: 'P', powerStyle: 'switch' }), R.fullConfig('light', { name: 'Q', powerStyle: 'button', variant: 'image' }), R.fullConfig('light', { name: 'R' })]; });
  check('an older "Power control" choice keeps its look as the Power style (Switch → Theme switch, Round button → Theme button); none stored by default', lp[0].power.style === 'switch' && lp[1].power.style === 'round' && !('powerStyle' in lp[0]) && !('power' in lp[2]), JSON.stringify(lp));

  // ---------------------------------------------------------------- the configurator: sections
  check('a linked full light on the dashboard', (await add('la', { name: 'Gym Lighting', entity: 'light.full' }, 60)) === 'ok');
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  await open('la');
  const secs = await E((CFG) => [...document.querySelectorAll(`${CFG} details.ef-group--acc`)].filter((d) => !d.hidden).map((d) => `${d.dataset.group}:${d.querySelector('.ef-acc__t').textContent}`), CFG);
  check('sections: Light · Controls · Interactions · Appearance · Images · Visibility (only those)', secs.join() === 'identity:Light,controls:Controls,interactions:Interactions,appearance:Appearance,images:Images,visibility:Visibility', secs.join());
  check('Interactions say they are the CARD\'s gestures and the light\'s own controls never run them', await E((CFG) => /ON THE CARD/.test(document.querySelector(`${CFG} details[data-group="interactions"] .ef-acc__hint`).textContent) && /never run a card action/.test(document.querySelector(`${CFG} details[data-group="interactions"] .ef-acc__hint`).textContent), CFG));
  check('linked: no demo switches (Home Assistant decides what the light can do)', !(await shown('capabilities.brightness')) && !(await shown('state')) && !(await shown('brightness')));

  // ---------------------------------------------------------------- Controls follow the REAL capabilities of the linked entity
  const pickEntity = async (id) => {
    await page.click(`${CFG} .ef-field[data-key="entity"] [data-k=iqp-choose]`); await page.waitForTimeout(250);
    await E(() => { const b = document.querySelector('dialog[open] [data-k=iqp-scope-btn]'); if (b && /all/i.test(b.textContent)) b.click(); }); await page.waitForTimeout(100);
    await page.click(`${CFG} .iqp__item[data-entity="${id}"]`); await page.waitForTimeout(700);
  };
  const gate = {};
  for (const id of ['light.onoff', 'light.dim', 'light.ct', 'light.rgb', 'light.full', 'light.gone']) { await pickEntity(id); gate[id] = { ctrls: await controlsShown(), pv: await E((PV) => { const r = document.querySelector(PV); return { dim: !!r.querySelector('.lw__range'), ct: !!r.querySelector('.iq-light-ct'), sw: !!r.querySelector('.iq-light-sw'), lit: r.dataset.lit }; }, PV) }; }
  check('Power is always a control (first by default): it can be moved, never removed', (await rowsOf('controls'))[0] === 'Power' && await E((CFG) => { const b = document.querySelector(`${CFG} [data-col="controls"] [data-index="0"] [data-k=col-menu]`); b.click(); const r = !!document.querySelector(`${CFG} [data-col="controls"] [data-index="0"] [data-cmd=down]`) && !document.querySelector(`${CFG} [data-col="controls"] [data-index="0"] [data-cmd=remove]`); b.click(); return r; }, CFG));
  check('on/off only: no brightness / colour control offered, none in the preview', gate['light.onoff'].ctrls === '' && !gate['light.onoff'].pv.dim && !gate['light.onoff'].pv.ct && !gate['light.onoff'].pv.sw, JSON.stringify(gate['light.onoff']));
  check('brightness: only the brightness slider', gate['light.dim'].ctrls === 'Brightness' && gate['light.dim'].pv.dim && !gate['light.dim'].pv.ct, JSON.stringify(gate['light.dim']));
  check('colour temperature: brightness + colour temperature (no colour buttons)', gate['light.ct'].ctrls === 'Brightness,Colour temperature' && gate['light.ct'].pv.ct && !gate['light.ct'].pv.sw, JSON.stringify(gate['light.ct']));
  check('RGB: brightness + colour buttons (no colour temperature)', gate['light.rgb'].ctrls === 'Brightness,Colour' && gate['light.rgb'].pv.sw && !gate['light.rgb'].pv.ct, JSON.stringify(gate['light.rgb']));
  check('colour temperature + RGB: all three', gate['light.full'].ctrls === 'Brightness,Colour temperature,Colour' && gate['light.full'].pv.ct && gate['light.full'].pv.sw, JSON.stringify(gate['light.full']));
  check('unavailable: its reported controls stay configurable, the preview is never lit', gate['light.gone'].pv.lit === 'unavailable', JSON.stringify(gate['light.gone']));
  await pickEntity('light.full');

  // ---------------------------------------------------------------- the owner's presented controls reach the preview at once, and Cancel restores
  await editRow('controls', 'Colour'); await eSwitch('show');
  const p1 = await E((PV) => { const r = document.querySelector(PV); return { ct: !!r.querySelector('.iq-light-ct'), sw: !!r.querySelector('.iq-light-sw') }; }, PV);
  check('Colour "Show on the card" off: the preview drops the colour buttons at once (before Save), colour temperature stays', p1.ct && !p1.sw, JSON.stringify(p1));
  await eSave();
  await editRow('controls', 'Colour temperature'); await eSwitch('show'); await eSave();
  check('…and colour temperature off: no colour tools at all (no empty "Colour" button); the rows say "Not shown"', await E((PV) => !document.querySelector(`${PV} .iq-light-more`) && !document.querySelector(`${PV} .lw__extra`), PV)
    && await E((CFG) => [...document.querySelectorAll(`${CFG} [data-col="controls"] .ef-col__s`)].filter((x) => x.textContent === 'Not shown').length === 2, CFG));
  check('Brightness / colour rows cannot be removed (only shown or not); a toggle can be added', await E((CFG) => { const b = document.querySelector(`${CFG} [data-col="controls"] [data-index="1"] [data-k=col-menu]`); b.click(); const r = !document.querySelector(`${CFG} [data-col="controls"] [data-index="1"] [data-cmd=remove]`); b.click(); return r && !!document.querySelector(`${CFG} [data-col="controls"] [data-k=col-add]`); }, CFG));
  await cancel();
  check('Cancel: nothing stored', !('controls' in (await cfgOf('la'))));

  // ---------------------------------------------------------------- Slider: brightness slider not presented → the whole card switches the light
  await open('la');
  await page.selectOption(`${CFG} .ef-field[data-key="variant"] select`, 'slider'); await page.waitForTimeout(300);
  check('Slider: Alignment offered; the former Appearance "Power control" is gone (Power has its own editor)', await shown('align') && !(await shown('powerStyle')));
  await editRow('controls', 'Brightness'); await eSwitch('show'); await eSave();
  check('Slider without the brightness slider: the card itself is the power button', await E((PV) => !!document.querySelector(`${PV} .iq-light-alt__hit`) && !document.querySelector(`${PV} .lw__range`), PV));
  await cancel();

  // ---------------------------------------------------------------- POWER A: custom icon · 68 px · 30 px icon · Circle · Filled · warm custom colour · white icon
  await open('la');
  await editRow('controls', 'Power');
  check('Power editor: Button · Icon · Placement; Automatic style: no shape (it may be a switch); colours, sizes, state appearance offered for every style', await eShown('power.style') && await eShown('power.icon') && !(await eShown('power.shape')) && await eShown('power.color') && await eShown('power.size') && await eShown('power.placeMode'));
  await eSel('power.style', 'filled');
  check('Filled: the shape too', await eShown('power.shape') && await eShown('power.color') && await eShown('power.iconColor') && await eShown('power.stateLook'));
  await eIcon('power.icon', 'ceiling-light');
  await eNum('power.size', 68); await eNum('power.iconSize', 30); await eSel('power.shape', 'circle');
  await eHex('power.color', '#ffb347'); await eHex('power.iconColor', '#ffffff'); await page.waitForTimeout(200);
  let pa = await pvPower();
  check('POWER A live in the preview (before Save): the chosen MDI icon, a 68 px circle, a 30 px glyph, warm amber, white icon', /iqc-btn/.test(pa.cls) && pa.icon === 'mdi:ceiling-light' && pa.w === '68px' && pa.h === '68px' && pa.g === '30px'
    && pa.bg === 'rgb(255, 179, 71)' && pa.color === 'rgb(255, 255, 255)' && pa.radius === '50%', JSON.stringify(pa));
  const glyphs = {};
  for (const st of ['filled', 'soft', 'outline', 'bare']) { await eSel('power.style', st); glyphs[st] = (await pvPower()).g; }
  check('ICON BACKGROUND RULE on Power: the 30 px glyph stays 30 px with a filled / soft / outline surface and with none (bare)', Object.values(glyphs).every((g) => g === '30px'), JSON.stringify(glyphs));
  await eSel('power.style', 'filled');
  await eNum('power.size', 100); const big = await pvPower(); await eNum('power.size', 68);
  const cap = await E((PV) => Math.round(Math.min(120, 0.3 * Math.min(document.querySelector(PV).clientWidth, document.querySelector(PV).clientHeight))), PV);
  check('button size and icon size are independent (button 100 px → glyph still 30 px); the button is honoured up to what the card fits (30 % of its smaller side)', big.w === `${Math.min(100, cap)}px` && big.g === '30px', JSON.stringify({ big, cap }));
  await eSave(); await apply();
  let c0 = await cfgOf('la');
  check('POWER A stored (normalised: circle is the default shape)', JSON.stringify(c0.power) === JSON.stringify({ style: 'filled', icon: 'mdi:ceiling-light', size: 68, iconSize: 30, color: '#ffb347', iconColor: '#ffffff' }), JSON.stringify(c0.power));
  const dashP = await E(() => { const b = document.querySelector('.ed-canvas [data-grid-id="la"] .lw__power'), cs = getComputedStyle(b); return { on: b.getAttribute('aria-checked'), role: b.getAttribute('role'), bg: cs.backgroundColor, w: cs.width }; });
  check('on the dashboard: an ON switch (role=switch, aria-checked) in its amber at 68 px', dashP.on === 'true' && dashP.role === 'switch' && dashP.bg === 'rgb(255, 179, 71)' && dashP.w === '68px', JSON.stringify(dashP));
  L.setEntity('light.full', 'off', { name: 'Dining', f: 0, scm: ['color_temp', 'hs'], ckmin: 2000, ckmax: 6500 });
  const offOk = await page.waitForFunction(() => document.querySelector('.ed-canvas [data-grid-id="la"] .lw__power')?.getAttribute('aria-checked') === 'false', null, { timeout: 15000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(500);
  const dashOff = await E(() => { const b = document.querySelector('.ed-canvas [data-grid-id="la"] .lw__power'); return getComputedStyle(b).backgroundColor; });
  check('OFF (from Home Assistant) is truthful: the amber goes (restrained surface), aria-checked false', offOk && dashOff !== 'rgb(255, 179, 71)', dashOff);
  L.setEntity('light.full', 'on', { name: 'Dining', f: 0, scm: ['color_temp', 'hs'], br: 184, cm: 'color_temp', ctk: 2700, ckmin: 2000, ckmax: 6500, hs: [30, 80] });
  await page.waitForFunction(() => document.querySelector('.ed-canvas [data-grid-id="la"] .lw__power')?.getAttribute('aria-checked') === 'true', null, { timeout: 15000 });
  // Fixed state appearance: the same colour off, the state still visible (ring on / dimmed icon off)
  const fixed = await E(() => { const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;width:440px;height:320px;display:grid;z-index:9999'; document.body.append(host);
    const mk = (state) => { const b = document.createElement('div'); b.style.cssText = 'width:440px;height:320px;display:grid'; b.append(window.MaisonRegistry.build('light', { name: 'F', state, power: { style: 'filled', color: '#ffb347', stateLook: 'fixed' } })); host.append(b); return b; };
    const on = mk('on'), off = mk('off'); const q = (b) => { const p = b.querySelector('.lw__power'), i = p.querySelector('.iqc-btn__i'), cs = getComputedStyle(p); return { bg: cs.backgroundColor, ring: cs.outlineStyle, op: getComputedStyle(i).opacity }; };
    const r = { on: q(on), off: q(off) }; host.remove(); return r; });
  check('State appearance Fixed: the colour stays ON and OFF, yet they differ (ON ringed; OFF dimmed icon)', fixed.on.bg === 'rgb(255, 179, 71)' && fixed.on.ring === 'solid' && fixed.off.ring !== 'solid' && Number(fixed.off.op) < 0.6, JSON.stringify(fixed));

  // ---------------------------------------------------------------- TOGGLE: add an optional two-option segmented control (colour temperature here)
  await open('la');
  await E((CFG) => document.querySelector(`${CFG} [data-col="controls"] [data-k=col-add]`).click(), CFG); await page.waitForSelector(ED);
  const tg = await E((ED) => [...document.querySelectorAll(`${ED} fieldset.ef-group`)].filter((g) => !g.hidden).map((g) => g.querySelector('legend')?.textContent || ''), ED);
  check('toggle editor: Option A · Option B · Appearance (options separate from the look)', tg.includes('Option A') && tg.includes('Option B') && tg.includes('Appearance'), JSON.stringify(tg));
  const doesA = await E((ED) => [...document.querySelectorAll(`${ED} .ef-field[data-key="a.set"] option`)].map((o) => o.value).join(), ED);
  check('an option can only set what this light supports (on · off · brightness · colour temperature · colour for a full light)', doesA === 'on,off,brightness,colorTemp,color', doesA);
  check('a colour-temperature light starts with Warm / Cool, each with its value', (await page.inputValue(`${ED} .ef-field[data-key="a.kelvin"] input.ef-range__n`)) === '2700' && (await page.inputValue(`${ED} .ef-field[data-key="b.kelvin"] input.ef-range__n`)) === '6000');
  await eIcon('a.icon', 'weather-sunny'); await eIcon('b.icon', 'weather-night');
  await eHex('a.color', '#ff8a00'); await eHex('b.color', '#3fa9ff');
  await eSel('style', 'filled'); await eNum('height', 56); await eNum('iconSize', 24); await page.waitForTimeout(200);
  const pvSeg = () => E((PV) => { const g = document.querySelector(`${PV} .iqc-seg`); if (!g) return null; const o = [...g.querySelectorAll('.iqc-seg__o')];
    return { h: getComputedStyle(g).height, sel: o.find((x) => x.getAttribute('aria-checked') === 'true')?.dataset.id || null, icons: o.map((x) => x.querySelector('[data-mdi]')?.dataset.mdi), glyph: getComputedStyle(o[0].querySelector('.iqc-seg__i')).width,
      labels: o.map((x) => (x.querySelector('.iqc-seg__l').hidden ? '' : x.querySelector('.iqc-seg__l').textContent)), bgA: getComputedStyle(o[0]).backgroundColor, bgB: getComputedStyle(o[1]).backgroundColor }; }, PV);
  let sg = await pvSeg();
  check('TOGGLE live in the preview (before Save): its icons, Warm / Cool labels, 56 px high, 24 px glyphs; the light is at 2700 K → A selected in A\'s orange', !!sg && sg.h === '56px' && sg.glyph === '24px' && sg.icons.join() === 'mdi:weather-sunny,mdi:weather-night'
    && sg.labels.join() === 'Warm,Cool' && sg.sel === 'a' && sg.bgA === 'rgb(255, 138, 0)', JSON.stringify(sg));
  await eSwitch('a.showLabel'); await eSwitch('b.showLabel');
  sg = await pvSeg();
  check('labels off: icon only — no label space kept', sg.labels.join() === ',' && await E((PV) => [...document.querySelectorAll(`${PV} .iqc-seg__l`)].every((l) => l.hidden && l.getBoundingClientRect().width === 0), PV), JSON.stringify(sg));
  await eSave(); await apply();
  c0 = await cfgOf('la');
  const T0 = c0.controls.find((x) => x.type === 'toggle');
  check('the toggle is stored with its options, values, icons, colours and look (after the light\'s own controls)', c0.controls.at(-1).type === 'toggle' && T0.a.set === 'colorTemp' && T0.a.kelvin === 2700 && T0.b.kelvin === 6000 && T0.a.icon === 'mdi:weather-sunny' && T0.b.color === '#3fa9ff'
    && T0.a.showLabel === false && T0.height === 56 && T0.iconSize === 24 && T0.style === 'filled', JSON.stringify(c0.controls));
  // reorder: the toggle before the brightness slider (structured order, no coordinates)
  await open('la');
  for (let k = 0; k < 3; k++) { const i = (await rowsOf('controls')).length - 1 - k; await E(({ CFG, i }) => { document.querySelector(`${CFG} [data-col="controls"] [data-index="${i}"] [data-k=col-menu]`).click(); document.querySelector(`${CFG} [data-col="controls"] [data-index="${i}"] [data-cmd=up]`).click(); }, { CFG, i }); await page.waitForTimeout(120); }
  check('Move up: the toggle is now right after Power in the controls list', (await rowsOf('controls'))[1] === 'White');
  check('…and first in the controls row of the preview (before the brightness slider)', await E((PV) => { const r = document.querySelector(`${PV} .lw__ctrls`); return r.firstElementChild.classList.contains('iqc-seg'); }, PV));
  await page.selectOption(`${CFG} .ef-field[data-key="controlAlign"] select`, 'center'); await setNum('controlGap', 20);
  check('control alignment and gap (live): centre, 20 px', await E((PV) => { const r = document.querySelector(`${PV} .lw__ctrls`), cs = getComputedStyle(r); return cs.justifyContent === 'center' && cs.columnGap === '20px'; }, PV));
  await apply();

  // ---------------------------------------------------------------- BRIGHTNESS appearance (track, handle, accent) — live
  await open('la');
  await editRow('controls', 'Brightness'); await eNum('dim.track', 12); await eNum('dim.handle', 24); await eToken('dim.color', 'cool');
  const br = await E((PV) => { const d = document.querySelector(`${PV} .lw__dim`), r = d.querySelector('.lw__range'); return { knob: d.hasAttribute('data-knob'), thin: d.hasAttribute('data-thin'), h: getComputedStyle(r).height, dh: getComputedStyle(document.querySelector(PV)).getPropertyValue('--lw-dh').trim(), bc: document.querySelector(PV).style.getPropertyValue('--lw-bc') }; }, PV);
  check('BRIGHTNESS live: a 12 px track with a 24 px round handle (the input as tall as the handle), the accent colour token', br.knob && br.thin && br.h === '24px' && br.dh === '12px' && br.bc === 'var(--cool)', JSON.stringify(br));
  await eSave(); await apply();
  // ---------------------------------------------------------------- ONE Power renderer: the SAME configured control in every variant
  await open('la');
  await editRow('controls', 'Power'); await eNum('power.size', 60); await eSave();
  const VARS = ['artwork', 'compact', 'slider', 'image'];
  const across = async () => { const o = {}; for (const v of VARS) { await page.selectOption(`${CFG} .ef-field[data-key="variant"] select`, v); await page.waitForTimeout(450); o[v] = { ...(await pvPower()), arr: await E((PV) => document.querySelector(PV).dataset.fitArr, PV) }; } return o; };
  let lk = await across();
  check('Power 60 px · 30 px · Filled · Circle · amber · white icon: the same icon, glyph, style, shape and colours in Standard, Compact, Slider and Artwork (one renderer)',
    VARS.every((v) => /iqc-btn/.test(lk[v].cls) && lk[v].icon === 'mdi:ceiling-light' && lk[v].g === '30px' && lk[v].style === 'filled' && lk[v].radius === '50%' && lk[v].bg === 'rgb(255, 179, 71)' && lk[v].color === 'rgb(255, 255, 255)'), JSON.stringify(lk));
  check('…its 60 px button honoured at Normal / Large; capped (whole control, glyph kept) only where the card is too small (the Compact row)',
    VARS.every((v) => (['normal', 'large'].includes(lk[v].arr) ? lk[v].w === '60px' : parseFloat(lk[v].w) >= 34 && parseFloat(lk[v].w) <= 60)), JSON.stringify(Object.fromEntries(VARS.map((v) => [v, `${lk[v].arr}:${lk[v].w}`]))));
  await editRow('controls', 'Power'); await eSel('power.style', 'round'); await eSave();
  lk = await across();
  check('the Theme button style is the same shared control too: the configured icon and 30 px glyph in every variant (never a variant default)', VARS.every((v) => /iqc-btn/.test(lk[v].cls) && lk[v].icon === 'mdi:ceiling-light' && lk[v].g === '30px' && lk[v].style === 'filled'), JSON.stringify(lk));
  await editRow('controls', 'Power'); await eSel('power.style', 'filled'); await eSave();
  const onOff = await E(() => { const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999;display:flex;flex-wrap:wrap;width:2000px'; document.body.append(host);
    const out = {}; ['artwork', 'compact', 'slider', 'image'].forEach((v) => ['on', 'off'].forEach((st) => { const b = document.createElement('div'); b.style.cssText = `width:${v === 'compact' ? 520 : 440}px;height:${v === 'compact' ? 150 : 330}px;display:grid`; host.append(b);
      b.append(window.MaisonRegistry.build('light', { name: 'P', variant: v, state: st, brightness: 60, capabilities: { power: true, brightness: true }, power: { style: 'filled', icon: 'mdi:ceiling-light', size: 60, iconSize: 30, color: '#ffb347', iconColor: '#ffffff' } })); }));
    return new Promise((res) => setTimeout(() => { host.querySelectorAll('.lw').forEach((r, i) => { const p = r.querySelector('.lw__power'); out[`${r.dataset.variant}:${i % 2 ? 'off' : 'on'}`] = { bg: getComputedStyle(p).backgroundColor, checked: p.getAttribute('aria-checked'), g: getComputedStyle(p.querySelector('.iqc-btn__i')).width }; }); host.remove(); res(out); }, 1200)); });
  check('ON and OFF truthful in every variant: ON amber, OFF restrained (never amber), aria-checked, the glyph unchanged', ['artwork', 'compact', 'slider', 'image'].every((v) => onOff[`${v}:on`].bg === 'rgb(255, 179, 71)' && onOff[`${v}:on`].checked === 'true'
    && onOff[`${v}:off`].bg !== 'rgb(255, 179, 71)' && onOff[`${v}:off`].checked === 'false' && onOff[`${v}:off`].g === '30px'), JSON.stringify(onOff));

  // ---------------------------------------------------------------- PLACEMENT: structured regions (never coordinates), independent of the look, live
  await page.selectOption(`${CFG} .ef-field[data-key="variant"] select`, 'artwork'); await page.waitForTimeout(300);
  const where = () => E((PV) => { const r = document.querySelector(PV), zp = (n) => (n ? n.parentElement.dataset.z || (n.parentElement.dataset.ln ? `line:${n.parentElement.dataset.ln}` : 'variant') : null);
    return { zones: r.hasAttribute('data-zones'), power: zp(r.querySelector('.lw__power')), seg: zp(r.querySelector('.iqc-seg')), dim: zp(r.querySelector('.lw__dim')), title: zp(r.querySelector('.lw__id')),
      order: r.querySelector('.lw__power').parentElement.dataset.z ? [...r.querySelector('.lw__power').parentElement.children].map((c) => (c.classList.contains('lw__power') ? 'power' : c.classList.contains('iqc-seg') ? 'toggle' : c.className.split(' ')[0])) : [] }; }, PV);
  check('nothing placed yet: the variant\'s own composition (no regions)', !(await where()).zones);
  await editRow('controls', 'Power');
  check('Power placement: Automatic by default; the shared 3 × 3 selector only once a position is chosen', (await page.inputValue(`${ED} .ef-field[data-key="power.placeMode"] select`)) === 'auto' && !(await eShown('power.place')));
  await eSel('power.placeMode', 'chosen');
  let w = await where();
  check('Power → Bottom right (live, before Save)', w.zones && w.power === 'bottom-right', JSON.stringify(w));
  const pBefore = await pvPower();
  await page.click(`${ED} .ef-field[data-key="power.place"] .ef-place__c[data-place="top-right"]`); await page.waitForTimeout(200);
  w = await where(); const pAfter = await pvPower();
  check('Power → Top right: it moves there at once — its look unchanged (60 px · 30 px glyph · amber)', w.power === 'top-right' && pAfter.w === pBefore.w && pAfter.g === pBefore.g && pAfter.bg === pBefore.bg, JSON.stringify({ w, pBefore, pAfter }));
  await eSave();
  await editRow('controls', 'White'); await eSel('toggle.placeMode', 'chosen');
  w = await where();
  check('Toggle → Top left (its own placement)', w.seg === 'top-left' && w.power === 'top-right', JSON.stringify(w));
  await page.click(`${ED} .ef-field[data-key="toggle.place"] .ef-place__c[data-place="bottom-left"]`); await page.waitForTimeout(200);
  w = await where();
  check('Toggle → Bottom left: it moves independently (Power stays top right)', w.seg === 'bottom-left' && w.power === 'top-right', JSON.stringify(w));
  await page.click(`${ED} .ef-field[data-key="toggle.place"] .ef-place__c[data-place="top-right"]`); await page.waitForTimeout(250);
  w = await where();
  const pair = await E((PV) => { const r = document.querySelector(PV), a = r.querySelector('.lw__power').getBoundingClientRect(), b = r.querySelector('.iqc-seg').getBoundingClientRect(), z = r.querySelector('.lw__power').parentElement;
    const k = parseFloat(getComputedStyle(z).columnGap); const scale = a.width / parseFloat(getComputedStyle(r.querySelector('.lw__power')).width);
    return { overlap: a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1, gap: Math.round(k), seen: Math.round(((b.left - a.right) / scale) * 10) / 10 }; }, PV);
  check('Power + Toggle in the SAME region: a group in the list\'s order (Power, then White), no overlap, the configured 20 px gap between them', w.power === 'top-right' && w.seg === 'top-right' && w.order.join() === 'power,toggle' && !pair.overlap && pair.gap === 20 && Math.abs(pair.seen - 20) < 1.5, JSON.stringify({ w, pair }));
  await eSave();
  // reorder: White before Power → the group follows the list
  await E((CFG) => { document.querySelector(`${CFG} [data-col="controls"] [data-index="1"] [data-k=col-menu]`).click(); document.querySelector(`${CFG} [data-col="controls"] [data-index="1"] [data-cmd=up]`).click(); }, CFG); await page.waitForTimeout(250);
  w = await where();
  check('Move White above Power: the shared region shows Toggle, then Power (deterministic)', (await rowsOf('controls')).slice(0, 2).join() === 'White,Power' && w.order.join() === 'toggle,power', JSON.stringify(w));
  // the brightness is a LINE (top · centre · bottom), never a floating corner
  await editRow('controls', 'Brightness');
  check('Brightness placement: a line (Automatic · Top · Centre · Bottom), not the 3 × 3 selector', !(await eShown('dim.placeMode')) && await E((ED) => [...document.querySelectorAll(`${ED} .ef-field[data-key="dim.place"] option`)].map((o) => o.value).join() === 'auto,top,center,bottom', ED));
  await eSel('dim.place', 'top');
  check('Brightness → Top line (live)', (await where()).dim === 'line:top', JSON.stringify(await where()));
  await eSave();
  // the title: its own placement (Appearance)
  await page.selectOption(`${CFG} .ef-field[data-key="variant"] select`, 'image'); await page.waitForTimeout(300);
  check('Artwork: the title sits where the variant puts it (bottom left) until placed', (await where()).title === 'bottom-left');
  await page.selectOption(`${CFG} .ef-field[data-key="titlePlaceMode"] select`, 'chosen'); await page.waitForTimeout(250);
  check('Title → Top left in Artwork (Appearance · Title position) — the lamp picture stays the centre', (await where()).title === 'top-left' && await E((PV) => document.querySelector(PV).dataset.visual === 'fixture' && getComputedStyle(document.querySelector(`${PV} .lw__stage`)).display !== 'none', PV), JSON.stringify(await where()));
  // placement intent survives every variant
  const keep = {};
  for (const v of VARS) { await page.selectOption(`${CFG} .ef-field[data-key="variant"] select`, v); await page.waitForTimeout(450); keep[v] = { ...(await where()), arr: await E((PV) => document.querySelector(PV).dataset.fitArr, PV) }; }
  check('Standard → Compact → Slider → Artwork: Power and Toggle stay top right, the title top left, the brightness on the top line (a too-short Compact row keeps the sides, in its middle row, the brightness beside them)',
    VARS.every((v) => { const k = keep[v], flat = v === 'compact' && ['micro', 'compact'].includes(k.arr); return k.power === (flat ? 'center-right' : 'top-right') && (k.seg === null || k.seg === k.power) && k.title === (flat ? 'center-left' : 'top-left') && (v === 'slider' || k.dim === null || k.dim === (flat ? 'center-center' : 'line:top')); }), JSON.stringify(keep));
  await page.selectOption(`${CFG} .ef-field[data-key="variant"] select`, 'artwork'); await page.waitForTimeout(250);
  await apply();
  c0 = await cfgOf('la');
  check('Apply stores the placement intent (structured, no coordinates): Power top right, toggle top right and first, brightness top line, title top left',
    c0.power.place === 'top-right' && c0.controls[0].type === 'toggle' && c0.controls[0].place === 'top-right' && c0.controls.find((x) => x.type === 'brightness').place === 'top' && c0.titlePlace === 'top-left'
    && !JSON.stringify(c0).match(/"(x|y|left|top)":\s*\d/), JSON.stringify(c0));
  const dashZ = await E(() => { const r = document.querySelector('.ed-canvas [data-grid-id="la"] .lw'); return { zones: r.hasAttribute('data-zones'), p: r.querySelector('.lw__power').parentElement.dataset.z }; });
  check('on the dashboard: the same composition (Power top right)', dashZ.zones && dashZ.p === 'top-right', JSON.stringify(dashZ));

  // ---------------------------------------------------------------- Images: built-in, no image + icon (size, background), no image + no icon
  await open('la');
  check('built-in picture: no fallback icon fields', !(await shown('fallbackIcon.icon')));
  await page.selectOption(`${CFG} .ef-field[data-key="variant"] select`, 'image'); await page.waitForTimeout(250);
  check('Artwork with a picture: Image treatment offered', await shown('imageTreatment'));
  await page.click(`${CFG} .ef-field[data-key="image"] [data-k=art-none]`); await page.waitForTimeout(250);
  check('no picture: Image treatment hidden; the fallback icon offered, its size / background only once an icon is chosen', !(await shown('imageTreatment')) && await shown('fallbackIcon.icon') && !(await shown('fallbackIcon.size')) && !(await shown('fallbackIcon.background')));
  await page.click(`${CFG} .ef-field[data-key="fallbackIcon.icon"] [data-k=icon-field]`); await page.fill(`${CFG} .ef-field[data-key="fallbackIcon.icon"] .iqi__search`, 'ceiling-light'); await page.click(`${CFG} .ef-field[data-key="fallbackIcon.icon"] .iqi__opt[data-icon="mdi:ceiling-light"]`); await page.waitForTimeout(250);
  check('icon chosen: Icon size, colour, background, animation appear', await shown('fallbackIcon.size') && await shown('fallbackIcon.color') && await shown('fallbackIcon.background') && await shown('fallbackIcon.animation'));
  const glyph = () => E((PV) => { const i = document.querySelector(`${PV} .lw__icon`), g = i.querySelector('svg'); return { g: Math.round(g.getBoundingClientRect().width * 10) / 10, box: Math.round(i.getBoundingClientRect().width * 10) / 10 }; }, PV);
  const rows = [];
  for (const size of [null, 30, 48]) {
    if (size) await setNum('fallbackIcon.size', size);
    const r = { size: size || 'auto' };
    for (const bg of ['none', 'subtle', 'accent']) { await page.selectOption(`${CFG} .ef-field[data-key="fallbackIcon.background"] select`, bg); await page.waitForTimeout(150); r[bg] = await glyph(); }
    rows.push(r);
  }
  check('ICON BACKGROUND RULE: the glyph is the same size with no background, Subtle and Accent (Automatic, 30, 48 px)', rows.every((r) => Math.abs(r.subtle.g - r.none.g) < 0.6 && Math.abs(r.accent.g - r.none.g) < 0.6), JSON.stringify(rows));
  check('…the surface grows AROUND the glyph; without one the element is the glyph', rows.every((r) => r.subtle.box > r.subtle.g + 2 && r.accent.box > r.accent.g + 2 && Math.abs(r.none.box - r.none.g) < 0.6), JSON.stringify(rows));
  check('the configured size drives the glyph (30 → 48 grow in proportion, live in the preview)', Math.abs(rows[2].none.g / rows[1].none.g - 48 / 30) < 0.03, JSON.stringify(rows));
  await apply();
  let c = await cfgOf('la');
  check('Apply stores: variant, no image, the icon with size and background', c.variant === 'image' && c.image === 'none' && c.fallbackIcon.icon === 'mdi:ceiling-light' && c.fallbackIcon.size === 48 && c.fallbackIcon.background === 'accent', JSON.stringify(c));
  const dash = await E(() => { const r = document.querySelector('.ed-canvas [data-grid-id="la"] .lw'); return { g: getComputedStyle(r.querySelector('.lw__icon')).width, seg: !!r.querySelector('.iqc-seg:not([hidden])') }; });
  check('on the dashboard (Artwork): a 48 px glyph; the toggle is kept', dash.g === '48px' && dash.seg, JSON.stringify(dash));
  await open('la');
  await page.click(`${CFG} .ef-field[data-key="fallbackIcon.icon"] [data-k=icon-field]`); await page.click(`${CFG} .ef-field[data-key="fallbackIcon.icon"] .iqi__opt[data-icon=""]`); await page.waitForTimeout(250);
  const bare = await E((PV) => { const r = document.querySelector(PV); return { vis: r.dataset.visual, icon: getComputedStyle(r.querySelector('.lw__icon')).display, name: r.querySelector('.lw__name').getBoundingClientRect().width > 0 }; }, PV);
  check('no picture + no icon: valid — no icon, no reserved space, the light remains (icon size / background hidden)', bare.vis === 'none' && bare.icon === 'none' && bare.name && !(await shown('fallbackIcon.size')) && !(await shown('fallbackIcon.background')), JSON.stringify(bare));

  // ---------------------------------------------------------------- uploads: Light A → Light B, never Room; served securely
  await page.setInputFiles(`${CFG} input[data-upload="image"]`, 'assets/img/media/artwork-dusk.jpg'); await page.waitForTimeout(1600);
  const up = await E((PV) => document.querySelector(`${PV} .lw__photo`).getAttribute('src'), PV);
  await apply();
  check('a second light on the dashboard', (await add('lb', { name: 'Hall', variant: 'compact' }, 80)) === 'ok');
  await open('lb');
  const libB = await E((CFG) => [...document.querySelectorAll(`${CFG} .ef-field[data-key="image"] [data-k=art-lib]`)].map((t) => t.dataset.value), CFG);
  const scoped = await E(async () => { const g = async (s) => (await (await fetch(`api/asset_library.php?scope=${s}`, { credentials: 'same-origin' })).json()).items.map((x) => x.ref); return { light: await g('light'), room: await g('custom.room-scene') }; });
  const served = await E(async (u) => { const r = await fetch(u, { credentials: 'same-origin' }), anon = await fetch(u, { credentials: 'omit' }); return { ok: r.ok, type: r.headers.get('content-type'), anon: anon.status }; }, up);
  check('uploaded in Light A: in Light B\'s image library, not in Room\'s', /^api\/asset\.php\?id=[0-9a-f]{32}$/.test(up) && libB.includes(up) && scoped.light.includes(up) && !scoped.room.includes(up), JSON.stringify({ up, libB, scoped }));
  check('served through the authenticated image route only (no path; anonymous refused)', served.ok && /^image\//.test(served.type) && served.anon >= 400, JSON.stringify(served));

  // ---------------------------------------------------------------- the demo light: what it can do decides its Controls
  check('demo light: Dimmable / Colour temperature / Colour switches, the presented controls follow them', await shown('capabilities.brightness') && await shown('capabilities.colorTemp') && (await controlsShown()) === 'Brightness');
  await page.click(`${CFG} .ef-field[data-key="capabilities.colorTemp"] button[role=switch]`); await page.waitForTimeout(250);
  check('demo colour temperature on: its control is offered and drawn (a default 2200–6500 K range)', (await controlsShown()) === 'Brightness,Colour temperature' && await E((PV) => { const r = document.querySelector(`${PV} .iq-light-ct__range`); return !!r && r.min === '2200' && r.max === '6500'; }, PV));
  await page.click(`${CFG} .ef-field[data-key="capabilities.brightness"] button[role=switch]`); await page.waitForTimeout(250);
  check('demo not dimmable: no brightness % field, no brightness slider offered', !(await shown('brightness')) && !(await controlsShown()).includes('Brightness'));
  await cancel();

  // ---------------------------------------------------------------- POWER B (a demo light, Compact): another icon · 48 px · 26 px icon · Rounded · Outline · a theme colour
  await open('lb');
  await editRow('controls', 'Power');
  await eSel('power.style', 'outline'); await eIcon('power.icon', 'lamp'); await eNum('power.size', 48); await eNum('power.iconSize', 26); await eSel('power.shape', 'rounded'); await eToken('power.color', 'info');
  const pb = await pvPower();
  check('POWER B live: the lamp icon, a 48 px rounded outline, a 26 px glyph, ringed in the theme\'s info colour', pb.icon === 'mdi:lamp' && pb.w === '48px' && pb.g === '26px' && pb.style === 'outline' && pb.shape === 'rounded' && Math.abs(parseFloat(pb.radius) - 14.4) < 0.6
    && await E((PV) => { const b = document.querySelector(`${PV} .lw__power`), info = getComputedStyle(document.documentElement).getPropertyValue('--info').trim(); return getComputedStyle(b).boxShadow.includes('2px') && b.style.getPropertyValue('--iqc-color') === 'var(--info)' && !!info; }, PV), JSON.stringify(pb));
  // the modal rule holds for the item editor too: a click outside it closes neither it nor the configuration
  await page.mouse.click(6, 6); await page.waitForTimeout(200);
  check('modal rule: a click outside the Power editor closes neither it nor the configurator', await E(({ ED, CFG }) => !!document.querySelector(`${ED}[open]`) && !!document.querySelector(CFG), { ED, CFG }));
  await eSave(); await apply();
  check('POWER B stored', JSON.stringify((await cfgOf('lb')).power) === JSON.stringify({ style: 'outline', shape: 'rounded', icon: 'mdi:lamp', size: 48, iconSize: 26, color: 'info' }), JSON.stringify((await cfgOf('lb')).power));
  const pbOn = await E(() => { const b = document.querySelector('.ed-canvas [data-grid-id="lb"] .lw__power'); return { on: b.getAttribute('aria-checked'), w: getComputedStyle(b).width }; });
  check('on the dashboard (Compact): Power B is ON, sized for the row (capped by its height, never overflowing)', pbOn.on === 'true' && parseFloat(pbOn.w) <= 48, JSON.stringify(pbOn));

  // ---------------------------------------------------------------- the modal rule
  await open('lb');
  const bb = await page.$eval(CFG, (d) => { const r = d.getBoundingClientRect(); return { x: r.left - 20, y: r.top + 40 }; });
  await page.mouse.click(Math.max(4, bb.x), bb.y); await page.waitForTimeout(250);
  const still = await E((CFG) => !!document.querySelector(CFG), CFG);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  check('modal rule: a click outside never closes the configurator; Escape cancels', still && !(await E((CFG) => !!document.querySelector(CFG), CFG)));

  // ---------------------------------------------------------------- TOGGLE at runtime: A ⇄ B through real HA calls; selected = what HA confirms
  await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'la'); it.config.interactions = { tap: { action: 'navigate', page: 'lights' } }; window.editor.setModel(m); });
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(900);
  const pageNow = () => E(() => (window.editor.navigation ? window.editor.navigation().current : window.editor.getPage().id));
  const home = await pageNow();
  const segSel = () => E(() => document.querySelector('[data-grid-id="la"] .iqc-seg [aria-checked="true"]')?.dataset.id || null);
  const FULL = (state, x) => L.setEntity('light.full', state, { name: 'Dining', f: 0, scm: ['color_temp', 'hs'], ckmin: 2000, ckmax: 6500, ...(state === 'on' ? { br: 184, cm: 'color_temp', ...x } : {}) });
  const waitSel = (id) => page.waitForFunction((id) => (document.querySelector('[data-grid-id="la"] .iqc-seg [aria-checked="true"]')?.dataset.id || null) === id, id, { timeout: 15000 }).then(() => true).catch(() => false);
  await page.locator('[data-grid-id="la"] .iqc-seg').scrollIntoViewIfNeeded();
  check('runtime: the light reports 2700 K → option A (Warm) is selected', (await segSel()) === 'a');
  let n0 = calls().length;
  await page.click('[data-grid-id="la"] .iqc-seg__o[data-id="b"]'); await page.waitForTimeout(800);
  let k = calls().slice(n0);
  check('A → B: one light.turn_on with colour_temp_kelvin 6000 for THIS light; no card tap', k.length === 1 && /light\/turn_on/.test(k[0].url) && JSON.parse(k[0].body).entity_id === 'light.full' && JSON.parse(k[0].body).color_temp_kelvin === 6000 && (await pageNow()) === home, JSON.stringify(k));
  check('…the selection is not assumed from the press (still A until Home Assistant confirms)', (await segSel()) === 'a');
  FULL('on', { ctk: 6000 });
  const gotB = await waitSel('b'); await page.waitForTimeout(500);
  check('HA confirms 6000 K → B selected, in B\'s own blue', gotB && await E(() => getComputedStyle(document.querySelector('[data-grid-id="la"] .iqc-seg__o[data-id="b"]')).backgroundColor === 'rgb(63, 169, 255)'));
  n0 = calls().length;
  await page.click('[data-grid-id="la"] .iqc-seg__o[data-id="a"]'); await page.waitForTimeout(800);
  k = calls().slice(n0);
  check('B → A: light.turn_on colour_temp_kelvin 2700', k.length === 1 && JSON.parse(k[0].body).color_temp_kelvin === 2700, JSON.stringify(k));
  FULL('on', { ctk: 2700 });
  check('HA confirms 2700 K → A selected again', await waitSel('a'));
  FULL('off');
  check('light off → no option selected (nothing true matches)', await waitSel(null));
  n0 = calls().length;
  await page.click('[data-grid-id="la"] .iqc-seg__o[data-id="b"]'); await page.waitForTimeout(800);
  k = calls().slice(n0);
  check('a light that is OFF: Cool turns it on AT 6000 K (one value call, not a bare turn_on)', k.length === 1 && /light\/turn_on/.test(k[0].url) && JSON.parse(k[0].body).color_temp_kelvin === 6000, JSON.stringify(k));
  FULL('on', { ctk: 2700 });
  await waitSel('a');

  // ---------------------------------------------------------------- interactions: the card vs the light's own controls (view mode, real HA calls)
  await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'la'); it.config = { name: 'Gym Lighting', entity: 'light.dim', controls: [{ type: 'brightness', track: 12, handle: 24 }], interactions: { tap: { action: 'navigate', page: 'lights' }, doubleTap: { action: 'navigate', page: 'climate' } } }; window.editor.setModel(m); });
  await page.waitForTimeout(900);
  await page.locator('[data-grid-id="la"] .lw__range').scrollIntoViewIfNeeded();
  const rb = await (await page.$('[data-grid-id="la"] .lw__range')).boundingBox();
  n0 = calls().length;
  await page.mouse.move(rb.x + rb.width * 0.2, rb.y + rb.height / 2); await page.mouse.down(); await page.mouse.move(rb.x + rb.width * 0.55, rb.y + rb.height / 2, { steps: 6 }); await page.mouse.move(rb.x + rb.width * 0.85, rb.y + rb.height / 2, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(900);
  const bc = calls().slice(n0);
  check('brightness (12 px track, 24 px handle): dragging → light.turn_on with the new brightness, never the card tap', bc.length >= 1 && /light\/turn_on/.test(bc.at(-1).url) && JSON.parse(bc.at(-1).body).brightness_pct > 60 && (await pageNow()) === home, JSON.stringify(bc));
  await page.locator('[data-grid-id="la"] .lw__power').scrollIntoViewIfNeeded();
  n0 = calls().length;
  await page.click('[data-grid-id="la"] .lw__power'); await page.waitForTimeout(900);
  check('power → light.turn_off of THIS light, never the card tap', calls().length === n0 + 1 && /light\/turn_off/.test(calls().at(-1).url) && JSON.parse(calls().at(-1).body).entity_id === 'light.dim' && (await pageNow()) === home, JSON.stringify(calls().slice(n0)));
  const nb = await page.$eval('[data-grid-id="la"] .lw__name', (e) => { const b = e.getBoundingClientRect(); return { x: b.left + 8, y: b.top + b.height / 2 }; });
  n0 = calls().length;
  await page.mouse.click(nb.x, nb.y); await page.waitForTimeout(800);
  check('Tap on the card → its own action (navigate), no light call', (await pageNow()) === 'lights' && calls().length === n0, String(await pageNow()));
  await E((p) => window.editor.go(p), home); await page.waitForTimeout(500);
  await page.locator('[data-grid-id="la"] .lw__name').scrollIntoViewIfNeeded();
  const nb2 = await page.$eval('[data-grid-id="la"] .lw__name', (e) => { const b = e.getBoundingClientRect(); return { x: b.left + 8, y: b.top + b.height / 2 }; });
  await page.mouse.dblclick(nb2.x, nb2.y); await page.waitForTimeout(900);
  check('Double tap on the card → its double-tap action', (await pageNow()) === 'climate' && calls().length === n0, String(await pageNow()));
  await E((p) => window.editor.go(p), home); await page.waitForTimeout(400);

  // ---------------------------------------------------------------- persistence: save / reload / export → import
  await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'lb'); it.config = { ...it.config, variant: 'slider', align: 'center', titleSize: 130, glow: 'strong', controls: [{ type: 'brightness', show: false }, { type: 'toggle', name: 'Power', a: { icon: 'mdi:lightbulb-on', label: 'On', set: 'on' }, b: { icon: 'mdi:lightbulb-off', label: 'Off', set: 'off', showLabel: false }, style: 'outline', shape: 'rounded', inactive: 'soft', height: 40, place: 'bottom-left' }, { type: 'power' }], power: { ...it.config.power, place: 'bottom-right' }, titlePlace: 'top-center', controlAlign: 'right', controlGap: 16, image: 'none', fallbackIcon: { icon: 'mdi:lamp', size: 40, background: 'none', color: 'info' }, interactions: { longPress: { action: 'navigate', page: 'lights' } }, visibility: { entity: 'light.dim', op: 'eq', value: 'on', mode: 'show' } }; window.editor.setModel(m); });
  c = await cfgOf('lb');
  const saved = await E(() => window.editor.save());
  await page.reload(); await page.waitForTimeout(1500);
  const after = await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'lb'); const t = window.MaisonModel.serialize(m), r = window.MaisonModel.parse(t, window.MaisonRegistry); return { c: it.config, rt: r.ok && JSON.stringify(r.model.pages[0].items.find((i) => i.id === 'lb').config) === JSON.stringify(it.config) }; });
  check('save / reload / export → import keep name, variant, Power (icon, sizes, style, shape, colour, placement), controls (order, toggle options / icons / labels / values, look, placement), title placement, layout, interactions, appearance, image, icon, visibility', saved === true && after.rt && JSON.stringify(after.c) === JSON.stringify(c), JSON.stringify({ before: c, after: after.c }));

  // ---------------------------------------------------------------- variants × MaisonFit: descenders never clipped, power always reachable, everything inside
  const mx = await E(() => {
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999;display:flex;flex-wrap:wrap;gap:10px;width:2600px';
    const sizes = [[150, 100], [300, 170], [440, 320], [760, 480]], names = ['Living', 'Lighting', 'Playing', 'Gym', 'Typography gypqj'], out = [];
    ['artwork', 'compact', 'slider', 'image'].forEach((v) => sizes.forEach(([w, h], si) => [undefined, 150].forEach((ts, ti) => {
      const b = document.createElement('div'); b.style.cssText = `width:${v === 'compact' ? w + 60 : w}px;height:${v === 'compact' && si < 2 ? Math.round(h * 0.55) : h}px;display:grid`;
      b.append(window.MaisonRegistry.build('light', { name: names[(si * 2 + ti) % names.length], variant: v, state: 'on', brightness: 60, capabilities: { power: true, brightness: true, colorTemp: true, color: true }, colorTempK: 2700, ...(ts ? { titleSize: ts } : {}),
        power: { style: 'filled', icon: 'mdi:ceiling-light', size: 100, iconSize: 36, color: '#ffb347' },
        controls: [{ type: 'brightness' }, { type: 'toggle', a: { icon: 'mdi:weather-sunny', label: 'Warm', set: 'colorTemp', kelvin: 2700 }, b: { icon: 'mdi:weather-night', label: 'Cool', set: 'colorTemp', kelvin: 6000 } }, { type: 'colorTemp' }, { type: 'color' }] })); host.append(b);
    })));
    document.body.append(host);
    return new Promise((res) => setTimeout(() => {
      host.querySelectorAll('.lw').forEach((r) => {
        const rr = r.getBoundingClientRect(), vis = (el) => !!el && !!el.offsetParent && el.getBoundingClientRect().width > 0;
        const inside = (el) => { const b = el.getBoundingClientRect(); return b.left >= rr.left - 1 && b.right <= rr.right + 1 && b.top >= rr.top - 1 && b.bottom <= rr.bottom + 1; };
        const n = r.querySelector('.lw__name'), cs = getComputedStyle(n), fs = parseFloat(cs.fontSize), nb = n.getBoundingClientRect(), need = nb.top + (nb.height - fs) / 2 + fs * 1.02;
        let clipper = null;
        for (let a = n; a && a !== r.parentElement; a = a.parentElement) { const s = getComputedStyle(a); if (['hidden', 'clip', 'auto', 'scroll'].includes(s.overflowY) && a.getBoundingClientRect().bottom < need - 0.5) { clipper = a.className; break; } }
        const power = r.querySelector('.lw__power'), hit = r.querySelector('.iq-light-alt__hit');
        out.push({ v: r.dataset.variant, arr: r.dataset.fitArr, name: n.textContent, fs, clipper, shown: vis(n), ellipsis: cs.textOverflow, power: (vis(power) && inside(power)) || vis(hit) || (r.dataset.variant === 'slider' && vis(r.querySelector('.lw__range'))),
          inside: [...r.querySelectorAll('.lw__name, .lw__state, .lw__power, .lw__dim, .iq-light-more, .lw__big, .iqc-seg')].filter(vis).every(inside),
          seg: vis(r.querySelector('.iqc-seg')), pw: power.getBoundingClientRect().width,
          slider: vis(r.querySelector('.lw__range')) ? r.querySelector('.lw__range').getBoundingClientRect().width : 0 });
      });
      host.remove(); res(out);
    }, 1500));
  });
  const bad = mx.filter((x) => x.shown && x.clipper);
  check('no title descender is clipped — 4 variants × 4 sizes × 2 title sizes (Living, Lighting, Playing, Gym, Typography gypqj)', mx.length === 32 && bad.length === 0, JSON.stringify(bad));
  check('the title clips only sideways (an ellipsis), and is never unreadably small', mx.every((x) => x.ellipsis === 'ellipsis' && x.fs >= 11), JSON.stringify(mx.filter((x) => x.fs < 11)));
  check('every variant × size: power reachable, everything inside the card', mx.every((x) => x.power && x.inside), JSON.stringify(mx.filter((x) => !(x.power && x.inside))));
  check('Micro never squeezes in a miniature brightness slider (Slider: the card itself is the slider)', mx.filter((x) => x.arr === 'micro' && x.v !== 'slider').every((x) => x.slider === 0), JSON.stringify(mx.filter((x) => x.arr === 'micro')));
  check('the toggle appears only where there is room (Normal / Large), never squeezed into Micro / Compact', mx.every((x) => x.seg === (x.arr === 'normal' || x.arr === 'large')), JSON.stringify(mx.map((x) => `${x.v}/${x.arr}:${x.seg}`)));
  check('a 100 px Power is honoured where it fits and capped where it does not (Micro ≤ 44 px), its style kept', mx.filter((x) => x.arr === 'micro').every((x) => x.pw <= 44.5) && mx.some((x) => x.arr === 'large' && x.pw >= 99), JSON.stringify(mx.map((x) => `${x.v}/${x.arr}:${Math.round(x.pw)}`)));
  check('every variant meets Micro · Compact · Normal · Large', VARIANTS.every((v) => ['micro', 'compact', 'normal', 'large'].every((a) => mx.some((x) => x.v === v && x.arr === a))), JSON.stringify(mx.map((x) => `${x.v}/${x.arr}`)));

  // ---------------------------------------------------------------- placement × variant × MaisonFit: no overlap, inside the card, Power reachable
  const pm = await E(() => {
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999;display:flex;flex-wrap:wrap;gap:10px;width:2600px';
    const sizes = [[150, 100], [300, 170], [440, 320], [760, 480]], out = [];
    ['artwork', 'compact', 'slider', 'image'].forEach((v) => sizes.forEach(([w, h], si) => [['bottom-right', 'top-left'], ['bottom-right', 'bottom-right'], ['top-center', 'center-left']].forEach(([pp, tp]) => {
      const b = document.createElement('div'); b.style.cssText = `width:${v === 'compact' ? w + 60 : w}px;height:${v === 'compact' && si < 2 ? Math.round(h * 0.55) : h}px;display:grid`;
      b.append(window.MaisonRegistry.build('light', { name: 'Typography gypqj', variant: v, state: 'on', brightness: 60, capabilities: { power: true, brightness: true, colorTemp: true }, colorTempK: 2700, titlePlace: 'top-left',
        power: { style: 'filled', icon: 'mdi:ceiling-light', size: 60, iconSize: 30, color: '#ffb347', place: pp },
        controls: [{ type: 'power' }, { type: 'brightness', place: 'bottom' }, { type: 'toggle', a: { icon: 'mdi:weather-sunny', set: 'colorTemp', kelvin: 2700 }, b: { icon: 'mdi:weather-night', set: 'colorTemp', kelvin: 6000 }, place: tp }, { type: 'colorTemp' }] })); host.append(b);
    })));
    document.body.append(host);
    return new Promise((res) => setTimeout(() => {
      host.querySelectorAll('.lw').forEach((r) => {
        const rr = r.getBoundingClientRect(), vis = (n) => !!n && !!n.offsetParent && n.getBoundingClientRect().width > 0;
        const inside = (n) => { const b = n.getBoundingClientRect(); return b.left >= rr.left - 1 && b.right <= rr.right + 1 && b.top >= rr.top - 1 && b.bottom <= rr.bottom + 1; };
        const els = [...r.querySelectorAll('.lw__power, .iqc-seg, .lw__id, .lw__big')].concat(r.dataset.variant === 'slider' ? [] : [...r.querySelectorAll('.lw__dim')]).filter(vis);
        let ov = null;
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect(); if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) ov = `${els[i].className.split(' ')[0]}×${els[j].className.split(' ')[0]}`; }
        out.push({ v: r.dataset.variant, arr: r.dataset.fitArr, p: r.querySelector('.lw__power').parentElement.dataset.z, ov, inside: els.every(inside), power: vis(r.querySelector('.lw__power')) && inside(r.querySelector('.lw__power')) });
      });
      host.remove(); res(out);
    }, 1500));
  });
  check('placement × 4 variants × 4 sizes × 3 compositions: nothing overlaps, everything inside the card, Power always reachable', pm.length === 48 && pm.every((x) => !x.ov && x.inside && x.power), JSON.stringify(pm.filter((x) => x.ov || !x.inside || !x.power)));

  // ---------------------------------------------------------------- editor zoom never changes the classification
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(400);
  const a1 = await E(() => document.querySelector('.ed-canvas [data-grid-id="la"] .lw').dataset.fitArr);
  await page.click('[data-zoom="0.5"]'); await page.waitForTimeout(600);
  const a2 = await E(() => document.querySelector('.ed-canvas [data-grid-id="la"] .lw').dataset.fitArr);
  await page.click('[data-zoom="fit"]'); await page.waitForTimeout(300);
  check('editor zoom 50 % does not change the Light\'s MaisonFit size', a1 === a2, `${a1} → ${a2}`);
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
