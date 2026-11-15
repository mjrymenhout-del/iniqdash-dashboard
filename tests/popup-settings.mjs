/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// POPUP SETTINGS (V2 polish) + THE GLOBAL MODAL DISMISSAL RULE, through the REAL editor UI (real PHP server, fake Home Assistant).
// The reference "Salle à manger" hero is configured here with the generic Popup Settings only — title, subtitle, picture, Back / Menu /
// Close, three hero information lines (left · centre · right) — over the reference CONTENT (a Tabbed Container of ordinary widgets,
// tests/lib/room-popup.mjs). Then: runtime, responsive hero, save / reload, and the backdrop rule on Popup / Room / Light / Tabbed
// Container configuration (a click outside never closes; Cancel drops, Apply applies).
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';
import { roomPopup, POPUP_ID, DEMO_ENTITIES } from './lib/room-popup.mjs';

const D = 'dialog.ed-dlg--popup[open]';
const pickIcon = async (ed, n) => { await ed.locator('[data-k=icon-field]').first().click(); await ed.locator('.iqi__search').first().fill(n); await ed.locator(`.iqi__opt[data-icon="mdi:${n}"]`).first().click(); };
let L, B;
try {
  L = await live();
  Object.entries(DEMO_ENTITIES).forEach(([k, v]) => L.setEntity(k, v[0], v[1]));
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const cfgNow = () => E((id) => structuredClone(window.editor.getModel().popups.find((p) => p.id === id).config), POPUP_ID);
  const shown = (key) => E(({ D, key }) => { const n = document.querySelector(`${D} .ef-field[data-key="${key}"]`); return !!n && !n.hidden && !n.closest('[hidden]') && n.offsetParent !== null; }, { D, key });
  const section = async (g) => { await E(({ D, g }) => { const d = document.querySelector(`${D} details[data-group="${g}"]`); if (d && !d.open) d.querySelector('summary').click(); }, { D, g }); await page.waitForTimeout(80); };

  // the reference CONTENT with a plain popup (no hero yet): everything of the hero is set below in Popup Settings
  const base = roomPopup();
  base.config = { size: 'custom', custom: base.config.custom, closeButton: true, backdrop: true, outsideClose: true, escClose: true, enter: 'scale', exit: 'fade', speed: 'normal' };
  const extra = [
    { id: 'acc-room', type: 'custom.room-scene', parent: null, config: { name: 'Acceptance room' }, layout: { desktop: { x: 1, y: 60, w: 5, h: 4 }, tablet: { x: 1, y: 60, w: 4, h: 4 }, mobile: { w: 4, h: 4 } } },
    { id: 'acc-light', type: 'light', parent: null, config: { name: 'Acceptance light' }, layout: { desktop: { x: 7, y: 60, w: 4, h: 4 }, tablet: { x: 5, y: 60, w: 4, h: 4 }, mobile: { w: 4, h: 4 } } },
  ];
  const loaded = await E(({ pp, extra }) => { const m = window.editor.getModel(); m.popups = [...(m.popups || []), pp]; m.pages[0].items.push(...extra); const r = window.editor.setModel(m); return r.ok ? 'ok' : r.errors; }, { pp: base, extra });
  check('the reference content loads under a plain popup', loaded === 'ok', JSON.stringify(loaded));

  // ---- 1 Popup Settings opens: the shared configuration modal, Room's sections
  await E(() => window.editor.setEditing(true));
  await E((id) => window.editor.designPopup(id), POPUP_ID); await page.waitForTimeout(800);
  await page.click('[data-k="popup-settings"]'); await page.waitForSelector(D);
  const shell = await E((D) => { const d = document.querySelector(D); return { cfg: d.classList.contains('ed-dlg--cfg'), closedby: d.getAttribute('closedby'), groups: [...d.querySelectorAll('details.ef-group--acc')].map((x) => x.dataset.group), open: [...d.querySelectorAll('details.ef-group--acc[open]')].map((x) => x.dataset.group), footer: !!d.querySelector('.ecfg-foot [data-k=apply-def]'), split: !!d.querySelector('.ecfg-split > .ecfg-form') && !!d.querySelector('.ecfg-split > .ecfg-pv') }; }, D);
  check('1 Popup Settings opens as the shared configuration modal (Room\'s shell: form + live preview, pinned Apply / Cancel)', shell.cfg && shell.footer && shell.split, JSON.stringify(shell));
  check('3 accordion sections like Room: Identity · Hero · Information · Appearance · Images · Size & layout · Interactions · Animation (the first open)',
    shell.groups.join() === 'identity,hero,information,appearance,images,size,behaviour,animation' && shell.open.join() === 'identity', JSON.stringify(shell));
  const accSame = await E(() => { const a = document.querySelector('dialog.ed-dlg--popup .ef-acc__h'); const s = getComputedStyle(a); return a.classList.contains('ef-acc__h') && parseFloat(s.minHeight) === 44; });
  check('3 the section headers are Room\'s (the same accordion component)', accSame);
  check('the icons use the shared searchable MDI picker (no fixed icon grid)', await E((D) => !document.querySelector(`${D} .ef-icons:not(.ef-colors)`) && !!document.querySelector(`${D} .ef-field[data-key="icon"] .iqi`), D));

  // ---- 4 identity + 2 the backdrop rule (an unsaved change survives a click outside)
  await page.fill(`${D} .ef-field[data-key="title"] input`, 'Salle à manger');
  await page.fill(`${D} .ef-field[data-key="subtitle"] input`, 'Media • Lights • Climate');
  await page.mouse.click(10, 600); await page.waitForTimeout(250);
  await page.mouse.click(1490, 1090); await page.waitForTimeout(250);
  check('2 clicking outside Popup Settings does NOT close it — the unsaved title stays exactly as typed', await E((D) => !!document.querySelector(D) && document.querySelector(`${D} .ef-field[data-key="title"] input`).value === 'Salle à manger', D));
  check('4 identity: name, title and subtitle', await E((D) => ['name', 'title', 'subtitle'].every((k) => document.querySelector(`${D} details[data-group="identity"] .ef-field[data-key="${k}"]`)), D));
  check('preview: the live preview shows the typed title', await E((D) => document.querySelector(`${D} [data-k=popup-preview] .mpop__title`)?.textContent === 'Salle à manger', D));

  // ---- 5 hero
  await section('hero');
  check('5 Hero: show hero, title / subtitle visibility, title position, title icon, action gap and button order', await E((D) => ['heroShow', 'showTitle', 'showSubtitle', 'headerAlign', 'icon', 'actionGap', 'buttonOrder'].every((k) => document.querySelector(`${D} details[data-group="hero"] .ef-field[data-key="${k}"]`)), D));
  await page.click(`${D} .ef-field[data-key="showSubtitle"] button[role=switch]`); await page.waitForTimeout(150);
  check('5 hiding the subtitle hides it in the preview', await E((D) => !document.querySelector(`${D} [data-k=popup-preview] .mpop__subtitle`), D));
  await page.click(`${D} .ef-field[data-key="showSubtitle"] button[role=switch]`); await page.waitForTimeout(150);

  // ---- 12 images
  await section('images');
  await page.click(`${D} .ef-field[data-key="image"] [data-k=art-builtin]`); await page.waitForTimeout(200);
  check('12 the image picker (shared artwork tiles) sets the hero picture — no path is shown', await E((D) => !!document.querySelector(`${D} [data-k=popup-preview] .mpop__hero img`) && !/assets\//.test(document.querySelector(`${D} details[data-group="images"]`).innerText), D));

  // ---- 6–10 information collection
  await section('information');
  const ed = page.locator(`${D} [data-k=item-editor]`);
  const addInfo = async ({ entity, label, icon, color, slot, style, valueColor }) => {
    await page.click(`${D} [data-col="heroInfo"] [data-k=col-add]`); await ed.waitFor();
    await ed.locator('[data-k=iqp-choose]').click(); await page.waitForTimeout(250);
    await ed.locator(`.iqp__item[data-entity="${entity}"]`).click(); await page.waitForTimeout(200);
    await ed.locator('.ef-field[data-key="label"] input').fill(label);
    await ed.locator(`.ef-place__c[data-place="center-${slot}"]`).click();
    await ed.locator('.ef-field[data-key="style"] select').selectOption(style);
    if (icon) { await pickIcon(ed, icon); await page.waitForTimeout(100); }
    if (color) { await ed.locator(`.ef-field[data-key="color"] .ef-icon[data-value="${color}"]`).click(); await page.waitForTimeout(80); }
    if (valueColor) await ed.locator('.ef-field[data-key="valueColor"] select').selectOption(valueColor);
    await ed.locator('[data-k=sub-save]').click(); await page.waitForTimeout(200);
  };
  await page.click(`${D} [data-col="heroInfo"] [data-k=col-add]`); await ed.waitFor();
  const edFields = await E((D) => [...document.querySelectorAll(`${D} [data-k=item-editor] .ef-field`)].map((n) => n.dataset.key), D);
  await page.mouse.click(10, 600); await page.waitForTimeout(200);
  check('Y a click outside the information editor closes neither it nor Popup Settings', await E((D) => !!document.querySelector(`${D} [data-k=item-editor][open]`) && !!document.querySelector(D), D));
  await ed.locator('[data-k=sub-cancel]').click(); await page.waitForTimeout(150);
  check('7 Add information opens the focused editor: entity, show, label, position (3 × 3), style, label place, icon (+ its colour, background, animation when set)', ['entity', 'value', 'label', 'place', 'style', 'labelPos', 'icon'].every((k) => edFields.includes(k)), edFields.join());
  await addInfo({ entity: 'sensor.demo_dining_humidity', label: 'Humidity', icon: 'water-outline', color: 'info', slot: 'left', style: 'card' });
  await addInfo({ entity: 'sensor.demo_dining_temperature', label: 'Room temperature', slot: 'center', style: 'emphasis' });
  await addInfo({ entity: 'sensor.demo_dining_lights_on', label: 'Lights on', icon: 'lightbulb-outline', color: 'warning', slot: 'right', style: 'card', valueColor: 'icon' });
  const rowsOf = () => E((D) => [...document.querySelectorAll(`${D} [data-col="heroInfo"] .ef-col__row`)].map((r) => `${r.querySelector('.ef-col__t').textContent}|${r.querySelector('.ef-col__s')?.textContent || ''}`), D);
  let rows = await rowsOf();
  check('6/7 three compact rows: [icon] label · entity • what · position · style', rows.length === 3 && /^Humidity\|sensor\.demo_dining_humidity • state · Centre left · Card$/.test(rows[0]) && /Room temperature\|.*Centre · Emphasis/.test(rows[1]) && /Lights on\|.*Centre right · Card/.test(rows[2]), JSON.stringify(rows));
  await page.waitForFunction((D) => [...document.querySelectorAll(`${D} [data-k=popup-preview] .mpop__fact-v`)].map((x) => x.textContent).join('|') === '58%|22.2 °C|0/1', D, { timeout: 15000 }).catch(() => {});
  const pvFacts = await E((D) => [...document.querySelectorAll(`${D} [data-k=popup-preview] .mpop__slot:not([data-empty])`)].map((s) => `${s.dataset.slot}:${s.textContent}`), D);
  check('preview: the three values from Home Assistant, left · centre · right', pvFacts.join() === 'left:58%Humidity,center:22.2 °CRoom temperature,right:0/1Lights on', JSON.stringify(pvFacts));
  // 8 edit
  await page.click(`${D} [data-col="heroInfo"] [data-index="1"] [data-k=col-edit]`); await ed.waitFor();
  check('8 Edit shows the line as saved', (await ed.locator('.ef-field[data-key="label"] input').inputValue()) === 'Room temperature' && (await ed.locator('.ef-field[data-key="style"] select').inputValue()) === 'emphasis');
  await ed.locator('.ef-field[data-key="labelPos"] select').selectOption('below');
  await ed.locator('[data-k=sub-save]').click(); await page.waitForTimeout(150);
  // 9 reorder
  await page.click(`${D} [data-col="heroInfo"] [data-index="0"] [data-k=col-menu]`); await page.click(`${D} [data-col="heroInfo"] [data-index="0"] [data-cmd=down]`); await page.waitForTimeout(150);
  rows = await rowsOf();
  check('9 reorder (⋮ Move down)', /^Room temperature/.test(rows[0]) && /^Humidity/.test(rows[1]), JSON.stringify(rows));
  await page.click(`${D} [data-col="heroInfo"] [data-index="1"] [data-k=col-menu]`); await page.click(`${D} [data-col="heroInfo"] [data-index="1"] [data-cmd=up]`); await page.waitForTimeout(150);
  // 10 remove
  await addInfo({ entity: 'light.kitchen', label: 'Spare', slot: 'right', style: 'minimal' });
  check('a fourth line is added', (await rowsOf()).length === 4);
  await page.click(`${D} [data-col="heroInfo"] [data-index="3"] [data-k=col-menu]`); await page.click(`${D} [data-col="heroInfo"] [data-index="3"] [data-cmd=remove]`); await page.waitForTimeout(150);
  rows = await rowsOf();
  check('10 remove (⋮ Remove) — and the order is back: Humidity, Room temperature, Lights on', rows.length === 3 && /^Humidity/.test(rows[0]) && /^Room temperature/.test(rows[1]) && /^Lights on/.test(rows[2]), JSON.stringify(rows));

  // ---- 11 MDI picker on a button · 14 conditional interactions
  await section('behaviour');
  await E((D) => document.querySelectorAll(`${D} details[data-group="behaviour"] details.ef-section`).forEach((d) => { d.open = true; }), D);
  check('14 Back off: no Back settings', !(await shown('backAction')) && !(await shown('backIcon')));
  await page.click(`${D} .ef-field[data-key="backButton"] button[role=switch]`); await page.waitForTimeout(120);
  check('14 Back on: what it does, its icon, position and colour appear', await shown('backAction') && await shown('backIcon') && await shown('backPlace') && await shown('backColor'));
  check('14 Menu off: no Menu action', !(await shown('menu')) && !(await shown('menuPopup')) && !(await shown('menuPage')));
  await page.click(`${D} .ef-field[data-key="menuShow"] button[role=switch]`); await page.waitForTimeout(120);
  await page.selectOption(`${D} .ef-field[data-key="menu"] select`, 'navigate'); await page.waitForTimeout(80);
  check('14 Menu on: what it does (+ the page) appears', await shown('menu') && await shown('menuPage') && !(await shown('menuPopup')));
  await page.selectOption(`${D} .ef-field[data-key="menuPage"] select`, 'home');
  await pickIcon(page.locator(`${D} .ef-field[data-key="closeIcon"]`), 'close-circle-outline'); await page.waitForTimeout(120);
  check('11 the searchable MDI picker sets the Close icon (preview follows)', await E((D) => document.querySelector(`${D} [data-k=popup-preview] .mpop__close [data-mdi]`)?.dataset.mdi === 'mdi:close-circle-outline', D));
  await page.click(`${D} .ef-field[data-key="closeIcon"] [data-k=icon-field]`); await page.click(`${D} .ef-field[data-key="closeIcon"] .iqi__opt[data-icon=""]`); await page.waitForTimeout(100);
  check('11 …and clears it (the standard icon again)', await E((D) => !document.querySelector(`${D} [data-k=popup-preview] .mpop__close [data-mdi]`), D));

  // ---- 13 size · 15 animation · appearance
  await section('size');
  await page.fill(`${D} .ef-field[data-key="custom.desktop.w"] input`, '860');
  await page.fill(`${D} .ef-field[data-key="custom.desktop.h"] input`, '900');
  check('13 size & layout: Desktop and Tablet width · height side by side', await E((D) => { const a = document.querySelector(`${D} .ef-field[data-key="custom.desktop.w"]`).getBoundingClientRect(), b = document.querySelector(`${D} .ef-field[data-key="custom.desktop.h"]`).getBoundingClientRect(); return Math.abs(a.top - b.top) < 2 && b.left > a.left; }, D));
  await section('animation');
  await page.selectOption(`${D} .ef-field[data-key="enter"] select`, 'fade');
  check('15 animation settings', (await page.inputValue(`${D} .ef-field[data-key="enter"] select`)) === 'fade');
  await section('appearance');
  await page.fill(`${D} .ef-field[data-key="titleSize"] input.ef-range__n`, '30'); await page.press(`${D} .ef-field[data-key="titleSize"] input.ef-range__n`, 'Enter');

  // ---- 16 Apply saves and closes
  await page.click(`${D} [data-k=apply-def]`); await page.waitForTimeout(400);
  const applied = await cfgNow();
  check('16 Apply saves and closes', !(await E((D) => !!document.querySelector(D), D)) && applied.title === 'Salle à manger' && applied.subtitle === 'Media • Lights • Climate' && applied.backButton === true && applied.menu === 'navigate' && applied.menuPage === 'home'
    && applied.image === 'assets/img/popups/demo-dining.svg' && applied.custom.desktop.w === 860 && applied.enter === 'fade' && applied.titleSize === 30 && Array.isArray(applied.heroInfo) && applied.heroInfo.length === 3 && !('closeIcon' in applied), JSON.stringify(applied));
  check('persistence: structured hero information (entity, what, label, slot, style, icon, colour)', JSON.stringify(applied.heroInfo.map((x) => [x.entity, x.value, x.label, x.slot, x.style, x.icon || '', x.color || '', x.valueColor || ''])) === JSON.stringify([
    ['sensor.demo_dining_humidity', 'state', 'Humidity', 'left', 'card', 'mdi:water-outline', 'info', ''], ['sensor.demo_dining_temperature', 'state', 'Room temperature', 'center', 'emphasis', '', '', ''],
    ['sensor.demo_dining_lights_on', 'state', 'Lights on', 'right', 'card', 'mdi:lightbulb-outline', 'warning', 'icon']]), JSON.stringify(applied.heroInfo));
  check('the canvas design stage shows the hero (header + information)', await E(() => document.querySelectorAll('.ed-canvas .mpop__fact').length === 3 && document.querySelector('.ed-canvas .mpop__title')?.textContent === 'Salle à manger'));

  // ---- 17 Cancel / Escape close without applying · 18 reopen keeps everything
  await page.click('[data-k="popup-settings"]'); await page.waitForSelector(D);
  await page.fill(`${D} .ef-field[data-key="title"] input`, 'Changed then cancelled');
  await page.click(`${D} [data-k=def-cancel]`); await page.waitForTimeout(300);
  check('17 Cancel closes without applying', !(await E((D) => !!document.querySelector(D), D)) && (await cfgNow()).title === 'Salle à manger');
  await page.click('[data-k="popup-settings"]'); await page.waitForSelector(D);
  await page.fill(`${D} .ef-field[data-key="title"] input`, 'Changed then escaped');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('X Escape = Cancel (never Apply)', !(await E((D) => !!document.querySelector(D), D)) && (await cfgNow()).title === 'Salle à manger');
  await page.click('[data-k="popup-settings"]'); await page.waitForSelector(D);
  const re = await E((D) => ({ title: document.querySelector(`${D} .ef-field[data-key="title"] input`).value, rows: document.querySelectorAll(`${D} [data-col="heroInfo"] .ef-col__row`).length, back: document.querySelector(`${D} .ef-field[data-key="backButton"] button[role=switch]`).getAttribute('aria-checked') }), D);
  check('18 reopening shows the saved configuration', re.title === 'Salle à manger' && re.rows === 3 && re.back === 'true', JSON.stringify(re));
  const before = JSON.stringify(await cfgNow());
  await page.click(`${D} [data-k=apply-def]`); await page.waitForTimeout(300);
  { const now = JSON.stringify(await cfgNow()); check("Apply without a change keeps the configuration exactly", now === before, `${before} => ${now}`); }

  // ---- 19 runtime: the generic system reproduces the reference hero; 20 the Tabbed Container still works
  await E(() => window.editor.designPage()); await E(() => window.editor.setEditing(false)); await page.waitForTimeout(400);
  await E((id) => window.editor.openPopup(id), POPUP_ID); await page.waitForTimeout(1200);
  await page.waitForFunction(() => document.querySelectorAll('.mpop .mpop__fact[data-state="ready"]').length === 3, null, { timeout: 15000 }).catch(() => {});
  const run = await E(() => {
    const p = document.querySelector('.mpop:not(.is-leaving) .mpop__panel'), r = (n) => n && n.getBoundingClientRect();
    const slot = (k) => p.querySelector(`.mpop__slot[data-cell="center-${k}"]`);
    const pr = r(p);
    return { title: p.querySelector('.mpop__title').textContent, sub: p.querySelector('.mpop__subtitle')?.textContent, hero: !!p.querySelector('.mpop__hero img'),
      back: !!p.querySelector('.mpop__start button.mpop__back'), menu: !!p.querySelector('.mpop__end button.mpop__menu'), close: !!p.querySelector('.mpop__end button.mpop__close'),
      left: slot('left').textContent, center: slot('center').textContent, right: slot('right').textContent,
      centerStyle: slot('center').firstElementChild.dataset.style, leftStyle: slot('left').firstElementChild.dataset.style,
      order: r(slot('left')).left < r(slot('center')).left && r(slot('center')).left < r(slot('right')).left,
      big: parseFloat(getComputedStyle(slot('center').querySelector('.mpop__fact-v')).fontSize) > 2 * parseFloat(getComputedStyle(slot('left').querySelector('.mpop__fact-v')).fontSize),
      tabsBelow: r(p.querySelector('.mtabs__list')).top > r(p.querySelector('.mpop__info')).bottom - 1, inside: [...p.querySelectorAll('.mpop__fact')].every((f) => { const b = r(f); return b.left >= pr.left && b.right <= pr.right; }),
      backTop: r(p.querySelector('.mpop__back')).left < r(p.querySelector('.mpop__title')).left, closeRight: r(p.querySelector('.mpop__close')).left > r(p.querySelector('.mpop__menu')).left };
  });
  check('19 runtime: title, subtitle, header picture; Back top-left, Menu + Close top-right', run.title === 'Salle à manger' && run.sub === 'Media • Lights • Climate' && run.hero && run.back && run.menu && run.close && run.backTop && run.closeRight, JSON.stringify(run));
  check('19 runtime: left card (humidity) · large centre value (temperature) · right card (lights on), values from Home Assistant', run.left === '58%Humidity' && run.center === '22.2 °CRoom temperature' && run.right === '0/1Lights on' && run.leftStyle === 'card' && run.centerStyle === 'emphasis' && run.order && run.big, JSON.stringify(run));
  check('20 the Tabbed Container sits below the hero', run.tabsBelow && run.inside, JSON.stringify(run));
  await page.click('.mpop .mtabs__tab[data-tab="heating"]'); await page.waitForTimeout(200);
  const afterTab = await E(() => ({ facts: document.querySelectorAll('.mpop .mpop__fact').length, shown: [...document.querySelectorAll('.mpop .mtabs__pane:not([hidden]) .mg__item[data-grid-id]')].map((x) => x.dataset.gridId).join() }));
  check('20 switching tabs changes only the content: the hero stays', afterTab.facts === 3 && afterTab.shown === 'sam-h-stove', JSON.stringify(afterTab));
  L.setEntity('sensor.demo_dining_temperature', '23.4');
  const liveUpd = await page.waitForFunction(() => /23\.4/.test(document.querySelector('.mpop .mpop__slot[data-cell="center-center"] .mpop__fact-v')?.textContent || ''), null, { timeout: 25000 }).then(() => true).catch(() => false);
  check('a hero value follows Home Assistant (the shared poll)', liveUpd);
  await page.click('.mpop:not(.is-leaving) button.mpop__menu'); await page.waitForTimeout(500);
  check('Menu runs its configured action (opens a page) and the popup closes', (await E(() => window.editor.popups().current)) === null);

  // ---- responsive: a narrow popup puts the centre value on its own row, nothing collides or overflows
  const narrow = await E(() => {
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:360px;height:700px;z-index:99999';
    const R = window.MaisonRegistry, pp = window.editor.getModel().popups.find((p) => p.id === 'salle-a-manger'), ch = window.MaisonPopup.chrome(R.fullConfig('popup', pp.config), { name: pp.name, icons: R.icons(), design: true });
    const panel = document.createElement('section'); panel.className = 'mpop__panel has-hero'; panel.style.cssText = 'width:360px;height:700px';
    panel.append(ch.hero, ch.head, ch.info); host.append(panel); document.body.append(host);
    const r = (s) => panel.querySelector(s).getBoundingClientRect(), facts = [...panel.querySelectorAll('.mpop__fact')].map((f) => f.getBoundingClientRect());
    const overlap = facts.some((a, i) => facts.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
    const res = { centerFirst: r('.mpop__slot[data-cell="center-center"]').bottom <= r('.mpop__slot[data-cell="center-left"]').top + 1, overlap, fits: facts.every((b) => b.right <= 360 + 0.5 && b.left >= -0.5), btns: [...panel.querySelectorAll('.mpop__btn')].every((b) => b.getBoundingClientRect().right <= 360) };
    ch.info.stop(); host.remove();
    return res;
  });
  check('responsive: narrow — the centre value on its own row, the cards below, no collision, nothing outside', narrow.centerFirst && !narrow.overlap && narrow.fits && narrow.btns, JSON.stringify(narrow));

  // ---- AM the backdrop rule on Room, Light and Tabbed Container configuration (and Cancel / Apply)
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  const cfgOf = (id) => E((id) => { const f = (l) => l.find((i) => i.id === id); const m = window.editor.getModel(); return structuredClone((f(m.pages.flatMap((p) => p.items)) || f(m.popups.flatMap((p) => p.items))).config); }, id);
  const modalRule = async (label, open, field, value, id, key) => {
    await open(); await page.waitForSelector('dialog.ed-dlg--cfg[open] .ef');
    await E(() => document.querySelectorAll('dialog.ed-dlg--cfg[open] details.ef-group--acc').forEach((d) => { d.open = true; }));
    const old = (await cfgOf(id))[key];
    await page.fill(`dialog.ed-dlg--cfg[open] .ef-field[data-key="${field}"] input`, value);
    await page.mouse.click(8, 500); await page.waitForTimeout(200); await page.mouse.click(1492, 30); await page.waitForTimeout(200);
    const still = await E(({ field, value }) => !!document.querySelector('dialog.ed-dlg--cfg[open]') && document.querySelector(`dialog.ed-dlg--cfg[open] .ef-field[data-key="${field}"] input`).value === value, { field, value });
    check(`AM ${label}: a click outside does not close it — the unsaved change stays`, still);
    await page.click('dialog.ed-dlg--cfg[open] .ecfg-foot button:has-text("Cancel")'); await page.waitForTimeout(250);
    check(`AM ${label}: Cancel closes without applying (reopen shows the old value)`, !(await E(() => !!document.querySelector('dialog.ed-dlg--cfg[open]'))) && (await cfgOf(id))[key] === old);
    await open(); await page.waitForSelector('dialog.ed-dlg--cfg[open] .ef');
    await E(() => document.querySelectorAll('dialog.ed-dlg--cfg[open] details.ef-group--acc').forEach((d) => { d.open = true; }));
    check(`AM ${label}: reopened with the old value`, (await page.inputValue(`dialog.ed-dlg--cfg[open] .ef-field[data-key="${field}"] input`)) === String(old ?? ''));
    await page.fill(`dialog.ed-dlg--cfg[open] .ef-field[data-key="${field}"] input`, value);
    await page.click('dialog.ed-dlg--cfg[open] .ecfg-foot button:has-text("Apply")'); await page.waitForTimeout(300);
    check(`AM ${label}: Apply saves and closes`, !(await E(() => !!document.querySelector('dialog.ed-dlg--cfg[open]'))) && (await cfgOf(id))[key] === value);
  };
  const editOf = (sel) => async () => { await page.click(sel, { position: { x: 12, y: 12 }, force: true }); await page.waitForTimeout(150); await E(() => document.querySelector('[data-k="edit-config"]').click()); };
  await modalRule('Room configuration', editOf('.ed-canvas [data-grid-id="acc-room"]'), 'name', 'Acceptance room 2', 'acc-room', 'name');
  await modalRule('Light configuration', editOf('.ed-canvas [data-grid-id="acc-light"]'), 'name', 'Acceptance light 2', 'acc-light', 'name');
  await E((id) => window.editor.designPopup(id), POPUP_ID); await page.waitForTimeout(600);
  await modalRule('Tabbed Container configuration', async () => { await page.click('.ed-canvas [data-grid-id="sam-tabs"]', { position: { x: 8, y: 8 }, force: true }); await page.waitForTimeout(150); await E(() => document.querySelector('[data-k="edit-config"]').click()); }, 'title', 'Room tabs 2', 'sam-tabs', 'title');
  check('every editor modal carries the rule (closedby="closerequest")', await E(() => { const d = document.createElement('div'); return !!window.MaisonConfigure.guard && window.MaisonConfigure.guard(document.createElement('dialog')).getAttribute('closedby') === 'closerequest'; }));
  await E(() => window.editor.designPage());

  // ---- persistence: save / reload
  const saved = await E(() => window.editor.save());
  await page.reload(); await page.waitForTimeout(1500);
  const back = await E((id) => window.editor.getModel().popups.find((p) => p.id === id)?.config, POPUP_ID);
  check('save / reload keep the hero configuration', saved === true && back && back.heroInfo.length === 3 && back.title === 'Salle à manger' && back.menu === 'navigate' && back.backButton === true, JSON.stringify(back));
  // backward compatibility: an older popup (V1 / V2 settings, a demo-set icon) opens and applies unchanged
  const compat = await E(() => {
    const R = window.MaisonRegistry, old = { title: 'Old', icon: 'lamp', size: 'custom', custom: { desktop: { w: 560, h: 420 }, tablet: { w: 520, h: 420 } }, closeButton: true, backdrop: true, outsideClose: true, escClose: true, enter: 'scale', exit: 'fade', speed: 'normal' };
    const full = R.fullConfig('popup', old), f = window.MaisonForm.create({ type: 'popup', config: full });
    return { same: JSON.stringify(f.value()) === JSON.stringify(full), errs: R.validateConfig('popup', full).length, icon: R.fieldValue(R.DEFS.popup.fields.find((x) => x.key === 'icon'), full), keys: Object.keys(full).filter((k) => /^(heroInfo|heroShow|showTitle|buttonStyle|backAction)$/.test(k)) };
  });
  check('backward compatibility: an older popup opens in the new Settings and is unchanged (its icon shown as its MDI equivalent)', compat.same && compat.errs === 0 && compat.icon === 'mdi:lamp' && compat.keys.length === 0, JSON.stringify(compat));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
