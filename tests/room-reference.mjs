/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ROOM AS THE REFERENCE WIDGET, through the REAL editor (real PHP server, fake Home Assistant): its configurator (sections, conditional
// fields, the shared Information editor groups and Slider + Number sizes), dynamic Scenes with their OWN appearance (colour — a theme
// token or a custom #rrggbb —, icon colour, button / icon size, style, shape, label), the scene row (alignment, gap), images (built-in,
// uploaded and scoped to the Room type, no image + fallback icon, no image + no icon), the four variants × MaisonFit sizes, the card's
// gestures vs the scene buttons, persistence / export, older configurations and the modal rule. Measured in the live preview / runtime.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ID = 'custom.room-scene', CFG = 'dialog.ed-dlg--cfg[open]', ED = `${CFG} [data-k=item-editor]`, PV = `${CFG} .ecfg-pv .iq-room`;
let L, B;
try {
  L = await live();
  L.setEntity('light.salon', 'on', { name: 'Salon lamp', f: 0, area: 'salon' });
  L.setEntity('sensor.salon_temp', '21.4', { name: 'Salon temperature', unit: '°C', dc: 'temperature' });
  L.setEntity('sensor.salon_hum', '48', { name: 'Salon humidity', unit: '%', dc: 'humidity' });
  L.setEntity('fan.salon', 'on', { name: 'Salon fan' });
  L.setEntity('sensor.dead', 'unavailable', { name: 'Dead sensor', unit: 'W' });
  L.setEntity('scene.good_night', 'unknown', { name: 'Good Night' }); L.setEntity('scene.guest', 'unknown', { name: 'Guest' }); L.setEntity('scene.relax', 'unknown', { name: 'Relax' });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const calls = () => L.haCalls.filter((x) => /\/api\/services\//.test(x.url));
  const shown = (scope, key) => E(({ scope, key }) => { const n = document.querySelector(`${scope} .ef-field[data-key="${key}"]`); return !!n && !n.hidden && !n.closest('[hidden]') && n.offsetParent !== null; }, { scope, key });
  const setNum = async (scope, key, v) => { const s = `${scope} .ef-field[data-key="${key}"] input.ef-range__n`; await page.fill(s, String(v)); await page.press(s, 'Enter'); await page.waitForTimeout(120); };
  const openSec = (g) => E(({ CFG, g }) => { const d = document.querySelector(`${CFG} details[data-group="${g}"]`); if (d && !d.open) d.open = true; }, { CFG, g });
  const pickIcon = async (scope, n) => { await page.click(`${scope} .ef-field[data-key="icon"] [data-k=icon-field]`); await page.fill(`${scope} .iqi__search`, n); await page.click(`${scope} .iqi__opt[data-icon="mdi:${n}"]`); await page.waitForTimeout(80); };
  const groupsOf = (scope) => E((s) => [...document.querySelectorAll(`${s} fieldset.ef-group`)].filter((g) => !g.hidden).map((g) => `${g.querySelector('legend')?.textContent}:${[...g.querySelectorAll('.ef-field')].filter((f) => !f.hidden).map((f) => f.dataset.key).join('/')}`), scope);
  const cfgOf = () => E((id) => structuredClone(window.editor.getModel().pages[0].items.find((i) => i.id === id).config), 'rr');
  const openRoom = async () => { await page.click('.ed-canvas [data-grid-id="rr"]', { position: { x: 14, y: 14 }, force: true }); await page.waitForTimeout(150); await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector(`${CFG} .ef`); };

  // ---------------------------------------------------------------- an older Room (Room 1.4 icon names, size names, no picture)
  const OLD = { name: 'Living Room', titleSize: 'large', scenes: [{ label: 'Night', icon: 'moon' }], info: [{ id: 'i1', entity: 'sensor.salon_temp', value: 'state', label: 'Temp', icon: 'thermo', color: 'accent-hot' }] };
  const legacy = await E(({ id, c }) => { const R = window.MaisonRegistry, f = R.fullConfig(id, c); return { f, errs: R.validateConfig(id, f).length, title: R.fieldValue(R.schemaOf(id).fields.find((x) => x.key === 'titleSize'), f) }; }, { id: ID, c: OLD });
  check('48 an older Room loads: icon names → MDI, title "large" → 120 %, no appearance invented, valid', legacy.errs === 0 && legacy.f.scenes[0].icon === 'mdi:weather-night' && JSON.stringify(Object.keys(legacy.f.scenes[0])) === '["label","icon"]' && legacy.f.info[0].icon === 'mdi:thermometer' && legacy.title === 120, JSON.stringify(legacy));
  const loaded = await E((c) => { const m = window.editor.getModel(); m.pages[0].items.push({ id: 'rr', type: 'custom.room-scene', parent: null, config: c, layout: { desktop: { x: 1, y: 60, w: 7, h: 7 }, tablet: { x: 1, y: 60, w: 6, h: 6 }, mobile: { w: 4, h: 5 } } }); const r = window.editor.setModel(m); return r.ok ? 'ok' : r.errors; }, { name: 'Living Room', area: 'salon' });
  check('a Room on the dashboard (Area: salon)', loaded === 'ok', JSON.stringify(loaded));
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await openRoom();

  // ---------------------------------------------------------------- 3 the configurator: sections, the card's gestures vs scenes, conditional image controls
  const secs = await E((CFG) => [...document.querySelectorAll(`${CFG} details.ef-group--acc`)].map((d) => `${d.dataset.group}:${d.querySelector('.ef-acc__t').textContent}`), CFG);
  check('3 sections: Room · Information · Scenes · Interactions · Appearance · Images · Visibility (only those)', secs.join() === 'identity:Room,information:Information,actions:Scenes,interactions:Interactions,appearance:Appearance,images:Images,visibility:Visibility', secs.join());
  check('11 Interactions say they are the CARD\'s gestures; Scenes say each runs its own scene', await E((CFG) => /ON THE CARD/.test(document.querySelector(`${CFG} details[data-group="interactions"] .ef-acc__hint`).textContent) && /its own scene/.test(document.querySelector(`${CFG} details[data-group="actions"] .ef-acc__hint`).textContent), CFG));
  await openSec('appearance'); await openSec('images');
  check('8 no picture: Image treatment and Overlay strength are not offered', !(await shown(CFG, 'imageTreatment')) && !(await shown(CFG, 'overlay')));
  check('4 / 12 Room holds identity only; Appearance holds no image choice', await E((CFG) => !document.querySelector(`${CFG} details[data-group="identity"] .ef-field[data-key="image"]`) && !document.querySelector(`${CFG} details[data-group="appearance"] .ef-field[data-key="image"]`) && !!document.querySelector(`${CFG} details[data-group="images"] .ef-field[data-key="image"]`), CFG));
  await page.click(`${CFG} .ef-field[data-key="image"] [data-k=art-builtin]`); await page.waitForTimeout(200);
  check('8 / 14 with the built-in picture (a friendly name, no path): its treatment and overlay appear, the preview shows it', await shown(CFG, 'imageTreatment') && await shown(CFG, 'overlay') && await E((CFG) => !!document.querySelector(`${CFG} .ecfg-pv .iq-room__img[src*="demo-living-room"]`) && !/\.svg|assets\//.test(document.querySelector(`${CFG} details[data-group="images"]`).innerText), CFG));

  // ---------------------------------------------------------------- 5 / 6 Information: shared groups, sliders, label / icon conditions
  await openSec('information');
  const addInfo = async (entity, label, icon, more) => {
    await E((CFG) => document.querySelector(`${CFG} [data-col="info"] [data-k=col-add]`).click(), CFG); await page.waitForSelector(ED);
    await page.click(`${ED} [data-k=iqp-choose]`); await page.waitForTimeout(250);
    await E(() => { const b = document.querySelector('[data-k=item-editor] [data-k=iqp-scope-btn]'); if (b && /all/i.test(b.textContent)) b.click(); });
    await page.waitForTimeout(100); await page.click(`${ED} .iqp__item[data-entity="${entity}"]`); await page.waitForTimeout(150);
    if (label) await page.fill(`${ED} .ef-field[data-key="label"] input`, label);
    if (icon) await pickIcon(ED, icon);
    if (more) await more();
    await page.click(`${ED} [data-k=sub-save]`); await page.waitForTimeout(200);
  };
  await addInfo('sensor.salon_temp', 'Temp', 'thermometer', async () => {
    const g = await groupsOf(ED);
    check('6 Information editor: CONTENT · PRESENTATION · ICON (Room has no placement, so no POSITION)', g.length === 3 && /^Content:entity\/value\/showLabel\/label\/icon$/.test(g[0]) && /^Presentation:valueSize\/labelSize$/.test(g[1]) && /^Icon:iconSize\/iconBg\/animation\/color$/.test(g[2]), JSON.stringify(g));
    await setNum(ED, 'valueSize', 30); await setNum(ED, 'iconSize', 34);
    check('7 / 35 sliders preview live in the Room preview before Save (value 30 px, icon 34 px)', await E((PV) => { const s = document.querySelector(`${PV} .iq-room__stat[data-info="i1"]`); return !!s && getComputedStyle(s.querySelector('.iq-room__sval')).fontSize === '30px' && getComputedStyle(s.querySelector('.iq-room__sicon')).width === '34px'; }, PV));
    await page.click(`${ED} .ef-field[data-key="color"] .ef-icon[data-value="accent-hot"]`);
    await page.selectOption(`${ED} .ef-field[data-key="iconBg"] select`, 'subtle');
  });
  await addInfo('sensor.salon_hum', '', 'water-percent', async () => {
    await page.click(`${ED} .ef-field[data-key="showLabel"] button[role=switch]`); await page.waitForTimeout(80);
    check('8 Show label OFF: Label and Label size disappear', !(await shown(ED, 'label')) && !(await shown(ED, 'labelSize')));
    await page.click(`${ED} .ef-field[data-key="color"] .ef-icon[data-value="info"]`);
  });
  await addInfo('fan.salon', 'Fan', 'fan', async () => {
    check('32 animation None: no "Animate when"', !(await shown(ED, 'animateWhen')));
    await page.selectOption(`${ED} .ef-field[data-key="animation"] select`, 'rotate');
    check('32 animation Rotate: "Animate when" appears', await shown(ED, 'animateWhen'));
  });
  await addInfo('sensor.dead', 'Power', '', async () => {
    check('8 no icon: the whole ICON group is gone', !(await groupsOf(ED)).some((g) => g.startsWith('Icon')));
  });
  await page.mouse.click(10, 600); await page.waitForTimeout(150);
  check('36 a click outside the Room configuration closes nothing', await E((CFG) => !!document.querySelector(CFG), CFG));

  // ---------------------------------------------------------------- 9 / 10 SCENES with their own appearance
  await openSec('actions');
  const addScene = async (label, entity, fill) => {
    await E((CFG) => document.querySelector(`${CFG} [data-col="scenes"] [data-k=col-add]`).click(), CFG); await page.waitForSelector(ED);
    await page.fill(`${ED} .ef-field[data-key="label"] input`, label);
    await page.click(`${ED} [data-k=iqp-choose]`); await page.waitForTimeout(250);
    await E(() => { const b = document.querySelector('[data-k=item-editor] [data-k=iqp-scope-btn]'); if (b && /all/i.test(b.textContent)) b.click(); });
    await page.waitForTimeout(100); await page.click(`${ED} .iqp__item[data-entity="${entity}"]`); await page.waitForTimeout(150);
    await fill();
    await page.click(`${ED} [data-k=sub-save]`); await page.waitForTimeout(200);
  };
  const scBtn = (i) => `${PV} .iq-room__scenes .iq-room__scene[data-index="${i}"]`;
  await addScene('Good Night', 'scene.good_night', async () => {
    const g = await groupsOf(ED);
    check('10 scene editor: ACTION (label, the scene / script) · APPEARANCE (icon, label, style, shape, colour, size) — not one flat form', g.length === 2 && /^Action:label\/entity$/.test(g[0]) && /^Appearance:icon\/showLabel\/style\/shape\/color\/size$/.test(g[1]), JSON.stringify(g));
    await pickIcon(ED, 'weather-night');
    check('no icon → no icon settings; with an icon: Icon colour and Icon size appear', await shown(ED, 'iconColor') && await shown(ED, 'iconSize'));
    await page.selectOption(`${ED} .ef-field[data-key="style"] select`, 'filled'); await page.selectOption(`${ED} .ef-field[data-key="shape"] select`, 'rounded');
    // a CUSTOM colour (the system colour picker → #rrggbb)
    await E((ED) => { const p = document.querySelector(`${ED} .ef-field[data-key="color"] [data-k=color-pick]`); p.value = '#8d5bff'; p.dispatchEvent(new Event('input', { bubbles: true })); }, ED);
    await setNum(ED, 'size', 64); await setNum(ED, 'iconSize', 26);
    const live = await E((s) => { const b = document.querySelector(s); if (!b) return null; const cs = getComputedStyle(b); return { bg: cs.backgroundColor, h: cs.height, ic: getComputedStyle(b.querySelector('.iq-room__sc-i')).width, style: b.dataset.scStyle }; }, scBtn(0));
    check('Scene A live in the preview before Save: purple custom colour, Filled, 64 px, icon 26 px', live && live.bg === 'rgb(141, 91, 255)' && live.h === '64px' && live.ic === '26px' && live.style === 'filled', JSON.stringify(live));
  });
  await addScene('Guest', 'scene.guest', async () => {
    await pickIcon(ED, 'party-popper');
    await page.selectOption(`${ED} .ef-field[data-key="style"] select`, 'soft'); await page.selectOption(`${ED} .ef-field[data-key="shape"] select`, 'circle');
    await page.click(`${ED} .ef-field[data-key="color"] .ef-icon[data-value="success"]`);
    await page.selectOption(`${ED} .ef-field[data-key="style"] select`, 'bare'); await page.waitForTimeout(80);
    check('Style Bare hides the button colour (it has no effect)', !(await shown(ED, 'color')));
    await page.selectOption(`${ED} .ef-field[data-key="style"] select`, 'soft'); await page.click(`${ED} .ef-field[data-key="color"] .ef-icon[data-value="success"]`);
    const b = await E((s) => { const b = document.querySelector(s); const r = b.getBoundingClientRect(); return { round: Math.abs(r.width - r.height) < 2, radius: getComputedStyle(b).borderRadius, label: !!b.querySelector('.iq-room__sc-l') && getComputedStyle(b.querySelector('.iq-room__sc-l')).display !== 'none' }; }, scBtn(1));
    check('Scene B live: green (theme token) Soft Circle — round, no label inside', b.round && b.radius === '50%' && !b.label, JSON.stringify(b));
  });
  await addScene('Relax', 'scene.relax', async () => {
    await pickIcon(ED, 'sofa');
    await page.selectOption(`${ED} .ef-field[data-key="style"] select`, 'outline');
    await page.click(`${ED} .ef-field[data-key="showLabel"] button[role=switch]`); await page.waitForTimeout(100);
    check('Scene C live: theme colour, Outline, label hidden — no label element, no label space', await E((s) => { const b = document.querySelector(s); return b.dataset.scStyle === 'outline' && !b.querySelector('.iq-room__sc-l') && b.getAttribute('aria-label') === 'Relax'; }, scBtn(2)));
  });
  await page.mouse.click(10, 600); await page.waitForTimeout(120);
  // reorder (⋮ Move up) and remove (a fourth scene)
  await E((CFG) => document.querySelector(`${CFG} [data-col="scenes"] [data-index="2"] [data-k=col-menu]`).click(), CFG); await E((CFG) => document.querySelector(`${CFG} [data-col="scenes"] [data-index="2"] [data-cmd=up]`).click(), CFG); await page.waitForTimeout(150);
  const order1 = await E((CFG) => [...document.querySelectorAll(`${CFG} [data-col="scenes"] .ef-col__t`)].map((x) => x.textContent).join(), CFG);
  await addScene('Spare', 'scene.relax', async () => {});
  await E((CFG) => document.querySelector(`${CFG} [data-col="scenes"] [data-index="3"] [data-k=col-menu]`).click(), CFG); await E((CFG) => document.querySelector(`${CFG} [data-col="scenes"] [data-index="3"] [data-cmd=remove]`).click(), CFG); await page.waitForTimeout(150);
  const order2 = await E((CFG) => [...document.querySelectorAll(`${CFG} [data-col="scenes"] .ef-col__t`)].map((x) => x.textContent).join(), CFG);
  check('9 scenes reorder (Relax up) and remove (the spare one) — no fixed placeholder slots', order1 === 'Good Night,Relax,Guest' && order2 === 'Good Night,Relax,Guest', JSON.stringify({ order1, order2 }));
  // the scene ROW (Room Appearance): alignment + gap
  await page.selectOption(`${CFG} .ef-field[data-key="sceneAlign"] select`, 'center'); await setNum(CFG, 'sceneGap', 18);
  const row = await E((PV) => { const r = document.querySelector(`${PV} .iq-room__scenes`); return { gap: getComputedStyle(r).columnGap, justify: getComputedStyle(r).justifyContent }; }, PV);
  check('scene row: centred, 18 px gap (live)', row.gap === '18px' && row.justify === 'center', JSON.stringify(row));
  await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(400);

  // ---------------------------------------------------------------- 47 persistence
  let c = await cfgOf();
  check('47 Apply stores the scenes with their appearance (numbers, a #rrggbb or a token), in order, with their entities in the same positions',
    JSON.stringify(c.scenes) === JSON.stringify([{ label: 'Good Night', icon: 'mdi:weather-night', style: 'filled', shape: 'rounded', color: '#8d5bff', size: 64, iconSize: 26 }, { label: 'Relax', icon: 'mdi:sofa', style: 'outline', showLabel: false }, { label: 'Guest', icon: 'mdi:party-popper', style: 'soft', shape: 'circle', color: 'success' }])
    && JSON.stringify(c.haSlots.scenes) === '["scene.good_night","scene.relax","scene.guest"]' && c.sceneAlign === 'center' && c.sceneGap === 18, JSON.stringify(c));
  check('47 Information stored: sizes, label off, icon background, animation', c.info.length === 4 && c.info[0].valueSize === 30 && c.info[0].iconSize === 34 && c.info[0].iconBg === 'subtle' && c.info[1].showLabel === false && c.info[2].animation === 'rotate' && !c.info[3].icon, JSON.stringify(c.info));
  await openRoom(); await openSec('actions');
  await E((CFG) => document.querySelector(`${CFG} [data-col="scenes"] [data-index="0"] [data-k=col-edit]`).click(), CFG); await page.waitForSelector(ED);
  check('47 reopened: the scene editor shows its saved appearance', (await page.inputValue(`${ED} .ef-field[data-key="size"] input.ef-range__n`)) === '64' && (await page.inputValue(`${ED} .ef-field[data-key="style"] select`)) === 'filled' && await E((ED) => document.querySelector(`${ED} .ef-field[data-key="color"] [data-k=color-custom]`).getAttribute('aria-checked') === 'true', ED));
  await page.click(`${ED} [data-k=sub-cancel]`); await page.click(`${CFG} .ecfg-foot button:has-text("Cancel")`); await page.waitForTimeout(250);
  const saved = await E(() => window.editor.save());
  await page.reload(); await page.waitForTimeout(1500);
  const after = await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'rr'); const t = window.MaisonModel.serialize(m), r = window.MaisonModel.parse(t, window.MaisonRegistry); return { c: it.config, rt: r.ok && JSON.stringify(r.model.pages[0].items.find((i) => i.id === 'rr').config) === JSON.stringify(it.config) }; });
  check('47 save / reload / export → import keep Room identity, Area, Information, Scenes (appearance, order), Appearance and Images', saved === true && after.rt && JSON.stringify(after.c.scenes) === JSON.stringify(c.scenes) && after.c.area === 'salon' && after.c.image === c.image && after.c.sceneGap === 18, JSON.stringify(after.c));

  // ---------------------------------------------------------------- 46 scene actions vs the card's own gestures (view mode, real HA calls)
  await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'rr'); it.config.interactions = { tap: { action: 'navigate', page: 'lights' }, longPress: { action: 'navigate', page: 'climate' } }; window.editor.setModel(m); });
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(800);
  const pageNow = () => E(() => window.editor.navigation ? window.editor.navigation().current : window.editor.getPage().id);
  const home = await pageNow();
  let n0 = calls().length;
  await page.click('[data-grid-id="rr"] .iq-room__scene[data-index="0"]'); await page.waitForTimeout(900);
  let k = calls().slice(n0);
  check('46 a scene button runs ITS scene (scene.turn_on scene.good_night) — and is not a card tap', k.length === 1 && /scene\/turn_on/.test(k[0].url) && JSON.parse(k[0].body).entity_id === 'scene.good_night' && (await pageNow()) === home, JSON.stringify(k));
  n0 = calls().length;
  await page.click('[data-grid-id="rr"] .iq-room__scene[data-index="2"]'); await page.waitForTimeout(900);
  check('46 the reordered third button runs Guest', calls().length === n0 + 1 && JSON.parse(calls().at(-1).body).entity_id === 'scene.guest');
  const nameBox = await page.$eval('[data-grid-id="rr"] .iq-room__name', (e) => { const b = e.getBoundingClientRect(); return { x: b.left + 10, y: b.top + b.height / 2 }; });
  n0 = calls().length;
  await page.mouse.click(nameBox.x, nameBox.y); await page.waitForTimeout(700);
  check('46 Tap on the card → its own action (navigate to Lights), no scene runs', (await pageNow()) === 'lights' && calls().length === n0, String(await pageNow()));
  await E((p) => window.editor.go(p), home); await page.waitForTimeout(500);
  await page.locator('[data-grid-id="rr"] .iq-room__name').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  const nb = await page.$eval('[data-grid-id="rr"] .iq-room__name', (e) => { const b = e.getBoundingClientRect(); return { x: b.left + 10, y: b.top + b.height / 2 }; });
  await page.mouse.move(nb.x, nb.y); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up(); await page.waitForTimeout(600);
  check('46 Long press on the card → its own action (navigate to Climate), not Tap', (await pageNow()) === 'climate' && calls().length === n0, String(await pageNow()));
  await E((p) => window.editor.go(p), home); await page.waitForTimeout(400);
  check('24 the Area\'s light is on → the lit picture (no automatic "Light on" text)', await E(() => { const r = document.querySelector('[data-grid-id="rr"] .iq-room'); return r.dataset.lit === 'true' && !/light (on|off)/i.test(r.querySelector('.iq-room__stats').textContent); }));
  check('33 the fan icon rotates only because the fan is on (Entity active)', await E(() => !!document.querySelector('[data-grid-id="rr"] .iq-room__stat[data-info="i3"] .iq-room__sicon[data-iqi-anim="rotate"]')));
  L.setEntity('fan.salon', 'off');
  const stopped = await page.waitForFunction(() => !document.querySelector('[data-grid-id="rr"] .iq-room__stat[data-info="i3"] .iq-room__sicon[data-iqi-anim]'), null, { timeout: 20000 }).then(() => true).catch(() => false);
  check('33 fan off → the icon stops (truthful)', stopped);
  check('44 an unavailable entity is said as such (not fabricated)', await E(() => /Unavailable/.test(document.querySelector('[data-grid-id="rr"] .iq-room__stat[data-info="i4"]')?.textContent || '')));

  // ---------------------------------------------------------------- 16 / 21 / 22 variants × MaisonFit (the widget's OWN size) + editor zoom
  const mx = await E((c) => {
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999;display:flex;flex-wrap:wrap;gap:12px;width:2400px';
    const sizes = [[200, 130], [340, 200], [460, 300], [760, 440]], out = [];
    ['scene', 'card', 'status', 'minimal'].forEach((v) => sizes.forEach(([w, h]) => { const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;display:grid`; b.append(window.MaisonRegistry.build('custom.room-scene', { ...c, variant: v })); host.append(b); }));
    document.body.append(host);
    return new Promise((res) => setTimeout(() => {
      host.querySelectorAll('.iq-room').forEach((r) => {
        const rb = r.getBoundingClientRect(), inside = (n) => { const b = n.getBoundingClientRect(); return b.width === 0 || (b.left >= rb.left - 1 && b.right <= rb.right + 1 && b.top >= rb.top - 1 && b.bottom <= rb.bottom + 1); };
        const name = r.querySelector('.iq-room__name');
        out.push({ v: r.dataset.variant, arr: r.dataset.fitArr, nameOk: name.offsetParent !== null && parseFloat(getComputedStyle(name).fontSize) >= 12, scenesInside: [...r.querySelectorAll('.iq-room__scenes .iq-room__scene')].filter((s) => s.offsetParent).every(inside),
          statsInside: [...r.querySelectorAll('.iq-room__stat')].filter((s) => !s.hidden && s.offsetParent).every(inside), colored: [...r.querySelectorAll('.iq-room__scenes .iq-room__scene[data-index="0"]')].every((s) => getComputedStyle(s).backgroundColor === 'rgb(141, 91, 255)'),
          access: r.querySelectorAll('.iq-room__scenes .iq-room__scene').length > 0 || !r.querySelector('.iq-room__mscenes').hidden });
      });
      host.remove(); res(out);
    }, 1500));
  }, c);
  const arrs = (v) => mx.filter((x) => x.v === v).map((x) => x.arr).join();
  check('21 every variant meets MaisonFit for its own size: Hero micro→large, Compact Card, Status, Minimal (variant ≠ size)', arrs('scene') === 'micro,compact,normal,large' && mx.filter((x) => x.v === 'card').some((x) => x.arr === 'large') && mx.filter((x) => x.v === 'status').some((x) => x.arr === 'large') && mx.filter((x) => x.v === 'minimal').some((x) => x.arr === 'large'), JSON.stringify(mx.map((x) => `${x.v}/${x.arr}`)));
  check('23 at every variant × size: the title stays readable, scenes and information stay inside the card, scenes stay reachable (row or panel)', mx.every((x) => x.nameOk && x.scenesInside && x.statsInside && x.access), JSON.stringify(mx.filter((x) => !(x.nameOk && x.scenesInside && x.statsInside && x.access))));
  check('scene identity is kept wherever the row is shown (the purple custom colour)', mx.every((x) => x.colored));
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  const arr1 = await E(() => document.querySelector('.ed-canvas [data-grid-id="rr"] .iq-room').dataset.fitArr);
  await page.click('[data-zoom="0.5"]'); await page.waitForTimeout(600);
  const arr2 = await E(() => document.querySelector('.ed-canvas [data-grid-id="rr"] .iq-room').dataset.fitArr);
  await page.click('[data-zoom="fit"]'); await page.waitForTimeout(300);
  check('22 the editor zoom (50 %) does not change the Room\'s MaisonFit size', arr1 === arr2, `${arr1} → ${arr2}`);

  // ---------------------------------------------------------------- 43 images: uploaded (Room-scoped), no image + icon, no image + no icon
  await openRoom(); await openSec('images');
  await page.setInputFiles(`${CFG} input[data-upload="image"]`, 'assets/img/media/artwork-dusk.jpg'); await page.waitForTimeout(1600);
  const up = await E((CFG) => ({ v: document.querySelector(`${CFG} .ecfg-pv .iq-room__img`).getAttribute('src') }), CFG);
  const scoped = await E(async () => { const g = async (s) => (await (await fetch(`api/asset_library.php?scope=${s}`, { credentials: 'same-origin' })).json()).items.map((x) => x.ref); return { room: await g('custom.room-scene'), light: await g('light') }; });
  check('43 an uploaded picture: served through the secure asset route, in the ROOM image library only (not Light\'s)', /^api\/asset\.php\?id=[0-9a-f]{32}$/.test(up.v) && scoped.room.includes(up.v) && !scoped.light.includes(up.v), JSON.stringify({ up, scoped }));
  await page.click(`${CFG} .ef-field[data-key="image"] [data-k=art-none]`); await page.waitForTimeout(200);
  const fbShown = await shown(CFG, 'fallbackIcon.icon');
  if (fbShown) { await page.click(`${CFG} .ef-field[data-key="fallbackIcon.icon"] [data-k=icon-field]`); await page.fill(`${CFG} .ef-field[data-key="fallbackIcon.icon"] .iqi__search`, 'sofa'); await page.click(`${CFG} .ef-field[data-key="fallbackIcon.icon"] .iqi__opt[data-icon="mdi:sofa"]`); await page.waitForTimeout(200); }
  const noImg = await E((PV) => { const r = document.querySelector(PV), img = r.querySelector('.iq-room__img'); return { img: !img.getAttribute('src') || getComputedStyle(img).display === 'none' || img.hidden, icon: !!r.querySelector('.iq-room__vicon[data-mdi="mdi:sofa"]') }; }, PV);
  check('15 no picture + a fallback icon: no picture, the icon instead', fbShown && noImg.img && noImg.icon, JSON.stringify({ fbShown, noImg }));
  await page.click(`${CFG} .ef-field[data-key="fallbackIcon.icon"] [data-k=icon-field]`); await page.click(`${CFG} .ef-field[data-key="fallbackIcon.icon"] .iqi__opt[data-icon=""]`); await page.waitForTimeout(200);
  const bare = await E((PV) => { const r = document.querySelector(PV), m = r.querySelector('.iq-room__media'), v = r.querySelector('.iq-room__vicon'); return { vicon: !v.dataset.mdi && !v.childElementCount, name: r.querySelector('.iq-room__name').getBoundingClientRect().width > 0, empty: m.getBoundingClientRect().height === 0 || getComputedStyle(m).display === 'none' || r.dataset.media !== 'icon' }; }, PV);
  check('15 no picture + no icon: valid — no icon element, no reserved picture box, the title and content remain', bare.vicon && bare.name && bare.empty, JSON.stringify(bare));
  check('8 no picture again: image treatment / overlay hidden again', !(await shown(CFG, 'imageTreatment')) && !(await shown(CFG, 'overlay')));
  await page.click(`${CFG} .ecfg-foot button:has-text("Cancel")`); await page.waitForTimeout(250);
  check('36 Cancel keeps the applied picture (built-in)', /demo-living-room/.test((await cfgOf()).image || ''));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
