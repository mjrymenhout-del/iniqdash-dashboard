/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// POPUP V2 + TABBED CONTAINER: a popup is a configurable mini-dashboard surface (header, subtitle, picture, Back / Menu / Close) whose
// content is ordinary items — here the reference room popup (tests/lib/room-popup.mjs) with a Tabbed Container of ordinary widgets.
// The Tabbed Container is a reusable layout component: the same on a page. Real editor + real PHP server (save / reload) + fake HA.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';
import { roomPopup, roomCard, POPUP_ID, DEMO_ENTITIES } from './lib/room-popup.mjs';

const TABS = ['active', 'lights', 'heating', 'media', 'security', 'sensors'];
let L, B;
try {
  L = await live();
  Object.entries(DEMO_ENTITIES).forEach(([k, v]) => L.setEntity(k, v[0], v[1]));
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const haCalls = () => L.haCalls.filter((x) => /\/api\/services\//.test(x.url)).length;

  // ---- the reference popup is plain data: it validates and loads
  const loaded = await E(({ pp, card }) => { const m = window.editor.getModel(); m.popups = [...(m.popups || []), pp]; m.pages[0].items.push(card); const r = window.editor.setModel(m); return r.ok ? 'ok' : r.errors; }, { pp: roomPopup(), card: roomCard });
  check('the reference room popup (ordinary widgets + a Tabbed Container) validates and loads', loaded === 'ok', JSON.stringify(loaded));

  // ---- runtime: open, header, picture, tabs
  await E((id) => window.editor.openPopup(id), POPUP_ID); await page.waitForTimeout(1200);
  const head = await E(() => { const p = document.querySelector('.mpop__panel'); return { title: p.querySelector('.mpop__title')?.textContent, sub: p.querySelector('.mpop__subtitle')?.textContent, hero: !!p.querySelector('.mpop__hero img[src]'),
    back: !!p.querySelector('button.mpop__back'), close: !!p.querySelector('button.mpop__close'), menu: !!p.querySelector('.mpop__menu'), w: p.getBoundingClientRect().width }; });
  check('opens: title, subtitle, header picture, Back, Menu and Close', head.title === 'Salle à manger' && head.sub === 'Media • Lights • Climate' && head.hero && head.back && head.close && head.menu, JSON.stringify(head));
  const visible = () => E(() => [...document.querySelectorAll('.mpop .mtabs__pane:not([hidden]) .mg__item[data-grid-id]')].map((x) => x.dataset.gridId));
  const byTab = { active: ['sam-a-light', 'sam-a-stove', 'sam-a-tv'], lights: ['sam-l-light'], heating: ['sam-h-stove'], media: ['sam-m-tv'], security: ['sam-s-alarm', 'sam-s-occ', 'sam-s-door'], sensors: ['sam-n-temp', 'sam-n-hum'] };
  const seen = {};
  for (const t of TABS) { await page.click(`.mpop .mtabs__tab[data-tab="${t}"]`); await page.waitForTimeout(150); seen[t] = (await visible()).sort().join(); }
  check('each tab shows exactly its own widgets (Active · Lights · Heating · Media · Security · Sensors)', TABS.every((t) => seen[t] === byTab[t].slice().sort().join()), JSON.stringify(seen));
  check('the hero information (popup settings, values from Home Assistant) stays visible whatever the tab', (await E(() => [...document.querySelectorAll('.mpop .mpop__fact')].filter((f) => f.offsetParent).length === 3)));
  check('tab semantics: tablist / tab / tabpanel, the selected one aria-selected', await E(() => { const r = document.querySelector('.mpop .mtabs'); return !!r.querySelector('[role=tablist]') && r.querySelectorAll('[role=tab]').length === 6 && r.querySelector('[role=tab][aria-selected="true"]').dataset.tab === 'sensors' && r.querySelectorAll('[role=tabpanel]').length === 6; }));
  await E(() => document.querySelector('.mpop .mtabs__tab[data-tab="sensors"]').focus());
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(100);
  check('keyboard: Left selects the previous tab', (await E(() => document.querySelector('.mpop .mtabs__tab[aria-selected="true"]').dataset.tab)) === 'security');
  await page.keyboard.press('Home'); await page.waitForTimeout(100);
  check('keyboard: Home selects the first tab', (await E(() => document.querySelector('.mpop .mtabs__tab[aria-selected="true"]').dataset.tab)) === 'active');
  await page.click('.mpop .mtabs__tab[data-tab="heating"]'); await page.waitForTimeout(200);
  const scroll = await E(() => { const pane = document.querySelector('.mpop .mtabs__pane:not([hidden])'), body = document.querySelector('.mpop__body'); return { pane: getComputedStyle(pane).overflowY, docScroll: document.scrollingElement.scrollHeight <= innerHeight + 2, bodyOv: getComputedStyle(body).overflowY }; });
  check('content scrolls inside the popup (never the page behind)', scroll.pane === 'auto' && scroll.bodyOv === 'auto', JSON.stringify(scroll));
  check('a widget inside a tab answers its own size (MaisonFit)', await E(() => !!document.querySelector('.mpop [data-grid-id="sam-h-stove"] [data-fit-tier]') || !!document.querySelector('.mpop [data-grid-id="sam-h-stove"] [data-fit]')));
  // Back: returns to the popup this one replaced; Menu runs its request
  await E((id) => { const m = window.editor.getModel(); m.popups.push({ id: 'pp-other', name: 'Other', config: { title: 'Other', closeButton: true, backButton: true, menu: 'popup', menuPopup: id }, items: [] }); window.editor.setModel(m); }, POPUP_ID);
  await E((id) => window.editor.openPopup(id), POPUP_ID); await page.waitForTimeout(400);
  await E(() => window.editor.openPopup('pp-other')); await page.waitForTimeout(400);
  check('Menu (⋮) appears when configured', await E(() => !!document.querySelector('.mpop:not(.is-leaving) button.mpop__menu')));
  await page.click('.mpop:not(.is-leaving) button.mpop__back'); await page.waitForTimeout(500);
  check('Back returns to the popup this one was opened from', (await E(() => window.editor.popups().current)) === POPUP_ID);
  await page.click('.mpop:not(.is-leaving) button.mpop__back'); await page.waitForTimeout(500);
  check('Back with nothing to return to closes the popup', (await E(() => window.editor.popups().current)) === null);
  await E(() => window.editor.openPopup('pp-other')); await page.waitForTimeout(400);
  await page.click('.mpop:not(.is-leaving) button.mpop__menu'); await page.waitForTimeout(500);
  check('Menu runs its configured request (opens the room popup)', (await E(() => window.editor.popups().current)) === POPUP_ID);
  await page.click('.mpop:not(.is-leaving) button.mpop__close'); await page.waitForTimeout(500);
  check('Close closes', (await E(() => window.editor.popups().current)) === null);
  // the Room card opens it (an ordinary Room widget, its Tap interaction)
  await page.click('[data-grid-id="sam-room"] .iq-room__name'); await page.waitForTimeout(600);
  check('a Room widget opens the popup through its Tap interaction (separate components)', (await E(() => window.editor.popups().current)) === POPUP_ID);
  await E(() => window.editor.closePopup()); await page.waitForTimeout(400);

  // ---- older popups: unchanged (no picture, no Back / Menu)
  const old = await E(() => { const R = window.MaisonRegistry, c = R.fullConfig('popup', { title: 'Old', size: 'custom', custom: { desktop: { w: 560, h: 420 }, tablet: { w: 520, h: 420 } }, closeButton: true }); return { keys: Object.keys(c).filter((k) => ['image', 'hero', 'backButton', 'menu', 'subtitle'].includes(k)), errs: R.validateConfig('popup', c).length }; });
  check('an older popup configuration loads unchanged (no new keys, valid)', old.keys.length === 0 && old.errs === 0, JSON.stringify(old));
  await E(() => window.editor.openPopup('pp-other')); await page.waitForTimeout(300);
  check('a popup without a picture has no hero', await E(() => !document.querySelector('.mpop:not(.is-leaving) .mpop__hero')));
  await E(() => window.editor.closePopup()); await page.waitForTimeout(300);

  // ---- the model rules for tabs
  const rules = await E((pp) => {
    const v = (mut) => { const m = window.editor.getModel(); m.popups = m.popups.filter((p) => p.id !== pp.id); const p = structuredClone(pp); mut(p); m.popups.push(p); const r = window.MaisonModel.validate(m, window.MaisonRegistry); return r.ok ? 'ok' : r.errors.join(' | '); };
    return { badTab: v((p) => { p.items.find((i) => i.id === 'sam-l-light').tab = 'nope'; }), tabOnWidget: v((p) => { p.items.find((i) => i.id === 'sam-tabs').tab = 'lights'; }),
      boxInTabs: v((p) => { p.items.push({ id: 'x-box', type: 'container', parent: 'sam-tabs', tab: 'lights', config: {}, layout: { desktop: { w: 4, h: 4 } } }); }),
      noTab: v((p) => { delete p.items.find((i) => i.id === 'sam-l-light').tab; }) };
  }, roomPopup());
  check('model: an unknown tab is refused', /no tab "nope"/.test(rules.badTab), rules.badTab);
  check('model: only a Tabbed Container\'s items have a tab', /tab/.test(rules.tabOnWidget) && rules.tabOnWidget !== 'ok', rules.tabOnWidget);
  check('model: a tabbed container holds no container', /cannot hold another container/.test(rules.boxInTabs), rules.boxInTabs);
  check('model: an item without a tab belongs to the first tab (valid)', rules.noTab === 'ok', rules.noTab);

  // ---- save / reload / export keep everything (structured data, never the DOM)
  const saved = await E(() => window.editor.save());
  await page.reload(); await page.waitForTimeout(1500);
  const back = await E((id) => { const pp = window.editor.getModel().popups.find((p) => p.id === id); return pp ? { tabs: pp.items.find((i) => i.id === 'sam-tabs').config.tabs.map((t) => t.id).join(), members: pp.items.filter((i) => i.tab).map((i) => `${i.id}:${i.tab}`).sort().join(), img: pp.config.image, sub: pp.config.subtitle } : null; }, POPUP_ID);
  check('Save / reload keep the popup, its tabs and which tab each widget is in', saved === true && back && back.tabs === TABS.join() && back.members.includes('sam-h-stove:heating') && back.members.includes('sam-s-door:security') && back.img === 'assets/img/popups/demo-dining.svg' && back.sub === 'Media • Lights • Climate', JSON.stringify(back));
  const rt = await E(() => { const t = window.MaisonModel.serialize(window.editor.getModel()); const r = window.MaisonModel.parse(t, window.MaisonRegistry); return r.ok && JSON.stringify(r.model.popups) === JSON.stringify(window.editor.getModel().popups); });
  check('export → import round-trip preserves popups and tabs', rt);

  // ---- editing: design the popup, edit one tab at a time, add a widget into the selected tab, undo
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await E((id) => window.editor.designPopup(id), POPUP_ID); await page.waitForTimeout(800);
  const calls0 = haCalls();
  await page.click('.ed-canvas [data-grid-id="sam-tabs"] .mtabs__tab[data-tab="media"]'); await page.waitForTimeout(600);
  const ed = await E(() => ({ shown: [...document.querySelectorAll('.ed-canvas [data-grid-id="sam-tabs"] .mtabs__pane:not([hidden]) .mg__item[data-grid-id]')].map((x) => x.dataset.gridId), active: document.querySelector('.ed-canvas [data-grid-id="sam-tabs"] .mtabs__tab[aria-selected="true"]').dataset.tab }));
  check('editor: pressing a tab on the canvas edits that tab (its widgets only)', ed.active === 'media' && ed.shown.join() === 'sam-m-tv', JSON.stringify(ed));
  check('editor: switching tabs never runs a Home Assistant action', haCalls() === calls0);
  await page.click('.ed-canvas [data-grid-id="sam-tabs"]', { position: { x: 8, y: 8 }, force: true }); await page.waitForTimeout(200);
  check('editor: the panel says which tab is edited', (await E(() => document.querySelector('[data-k="edit-tab"]')?.value)) === 'media');
  await E(() => document.querySelector('[data-k="add-into"]').click());
  await page.waitForSelector('.ecfg-tile[data-type="switch"]'); await page.click('.ecfg-tile[data-type="switch"]'); await page.waitForTimeout(400);
  await page.click('dialog[open] .ecfg-foot button:has-text("Next")'); await page.waitForTimeout(200);
  await page.click('dialog[open] .ecfg-add'); await page.waitForTimeout(600);
  const added = await E((id) => window.editor.getModel().popups.find((p) => p.id === id).items.filter((i) => i.parent === 'sam-tabs' && !i.id.startsWith('sam-')).map((i) => i.tab), POPUP_ID);
  check('editor: a widget added "here" joins the edited tab', added.length === 1 && added[0] === 'media', JSON.stringify(added));
  await E(() => window.editor.undo()); await page.waitForTimeout(400);
  check('undo removes it again (the shared history)', (await E((id) => window.editor.getModel().popups.find((p) => p.id === id).items.filter((i) => i.parent === 'sam-tabs' && !i.id.startsWith('sam-')).length, POPUP_ID)) === 0);
  // removing a tab in its configuration removes its widgets — one undo restores both
  await E((id) => { const m = window.editor.getModel(); const t = m.popups.find((p) => p.id === id).items.find((i) => i.id === 'sam-tabs'); return t; }, POPUP_ID);
  await page.click('.ed-canvas [data-grid-id="sam-tabs"]', { position: { x: 8, y: 8 }, force: true }); await page.waitForTimeout(200);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ef');
  await E(() => document.querySelectorAll('dialog[open] details').forEach((d) => { d.open = true; }));
  const rows = page.locator('dialog[open] [data-col="tabs"] .ef-col__row');
  check('the tabs are edited in the shared collection editor (6 rows)', (await rows.count()) === 6);
  await rows.nth(5).locator('[data-k=col-menu]').click().catch(() => {});
  const removed = await rows.nth(5).locator('[data-cmd=remove]').click({ timeout: 3000 }).then(() => true).catch(() => false);
  if (removed) {
    await page.waitForTimeout(200);
    await page.click('dialog[open] .ecfg-foot button:has-text("Apply")'); await page.waitForTimeout(500);
    const after = await E((id) => { const pp = window.editor.getModel().popups.find((p) => p.id === id); return { tabs: pp.items.find((i) => i.id === 'sam-tabs').config.tabs.length, sensors: pp.items.filter((i) => i.tab === 'sensors').length }; }, POPUP_ID);
    check('removing a tab removes its widgets', after.tabs === 5 && after.sensors === 0, JSON.stringify(after));
    await E(() => window.editor.undo()); await page.waitForTimeout(400);
    const und = await E((id) => { const pp = window.editor.getModel().popups.find((p) => p.id === id); return { tabs: pp.items.find((i) => i.id === 'sam-tabs').config.tabs.length, sensors: pp.items.filter((i) => i.tab === 'sensors').length }; }, POPUP_ID);
    check('…one Undo restores the tab and its widgets', und.tabs === 6 && und.sensors === 2, JSON.stringify(und));
  } else check('removing a tab (collection ⋮ → Remove) is available', false, 'no remove control found');
  await E(() => window.editor.designPage()); await page.waitForTimeout(300);

  // ---- the SAME component on a page (not popup-specific): view mode switches at once, without rebuilding the page
  await E(() => { const m = window.editor.getModel(); m.pages[0].items.push({ id: 'pg-tabs', type: 'tabs', parent: null, config: { title: 'Floors', tabs: [{ id: 'g', label: 'Ground floor' }, { id: 'u', label: 'Upstairs', icon: 'mdi:stairs' }] }, layout: { desktop: { x: 1, y: 50, w: 8, h: 8 }, tablet: { x: 1, y: 50, w: 8, h: 8 }, mobile: { w: 4, h: 8 } } },
    { id: 'pg-g', type: 'sensor', parent: 'pg-tabs', tab: 'g', config: { name: 'Ground temp' }, layout: { desktop: { x: 1, y: 1, w: 3, h: 3 } } }, { id: 'pg-u', type: 'sensor', parent: 'pg-tabs', tab: 'u', config: { name: 'Upstairs temp' }, layout: { desktop: { x: 1, y: 1, w: 3, h: 3 } } }); window.editor.setModel(m); });
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(600);
  const before = await E(() => { window.__mark = document.querySelector('[data-grid-id="pg-g"]'); return !!window.__mark?.offsetParent && !document.querySelector('[data-grid-id="pg-u"]')?.offsetParent; });
  await page.click('[data-grid-id="pg-tabs"] .mtabs__tab[data-tab="u"]'); await page.waitForTimeout(150);
  const after = await E(() => ({ u: !!document.querySelector('[data-grid-id="pg-u"]')?.offsetParent, g: !!document.querySelector('[data-grid-id="pg-g"]')?.offsetParent, same: window.__mark === document.querySelector('[data-grid-id="pg-g"]') }));
  check('on a page: a Tabbed Container works too — switching is immediate (no rebuild)', before && after.u && !after.g && after.same, JSON.stringify(after));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
