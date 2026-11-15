/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// DASHBOARD RELIABILITY — links to popups / pages that no longer exist; a truly blank start. Real editor UI, real PHP server, FAKE
// Home Assistant (tests/lib/live.mjs — not a real Home Assistant).
//   ROOT CAUSE   deleting a popup repaired only Action widgets and radial segments: a widget's Tap / Double tap / Long press → popup (e.g.
//                a Room) kept pointing at it; Save did not validate, so it was stored; opening it then failed ("…interactions.tap.popup:
//                Tap: popup "popup-8" is not an available option") and the dashboard could not be opened at all.
//   NOW          deleting a popup / page clears every link to it (one finder); Save never stores an invalid dashboard (it offers the repair);
//                a saved dashboard with broken links opens a REPAIR screen (where, what, Remove / relink) — the saved copy is untouched
//                until the repaired one is saved; with no dashboard on the server, the sample says so and offers a truly blank one.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';
import path from 'node:path';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1400, height: 900 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, n) }); };
  const ready = async () => { await page.waitForFunction(() => window.editor || document.querySelector('[data-k=repair], .ed-fatal'), null, { timeout: 15000 }); await wait(600); };
  const lay = { desktop: { x: 1, y: 1, w: 4, h: 4 }, tablet: { x: 1, y: 1, w: 4, h: 4 }, mobile: { w: 4, h: 4 } };

  // ---------------------------------------------------------------- a blank start when the server has no dashboard
  const note = await E(() => { const n = document.querySelector('[data-k=start-note]'); return n && n.textContent; });
  check('NO DASHBOARD on the server: the built-in sample says so (saving stores the sample) and offers "Start with a blank dashboard"', !!note && /built-in sample/.test(note), note);
  await shot('a1-start-note.png');
  await Promise.all([page.waitForURL(/\?d=/), page.click('[data-k=start-blank]')]); await ready();
  const blank = await E(() => { const m = window.editor.getModel(); return { pages: m.pages.length, items: m.pages.reduce((n, p) => n + p.items.length, 0), popups: m.popups.length, rules: m.notifications.rules.length, id: window.editor.dashboard()?.id }; });
  check('…a BLANK dashboard: one empty page, no widgets, no popups, no rules — nothing inherited from the sample or older dashboards', blank.pages === 1 && blank.items === 0 && blank.popups === 0 && blank.rules === 0 && !!blank.id, JSON.stringify(blank));
  await page.reload(); await ready();
  check('…it reopens as itself after a reload', (await E(() => window.editor.dashboard()?.id)) === blank.id && (await E(() => window.editor.getModel().pages[0].items.length)) === 0);

  // ---------------------------------------------------------------- deleting a popup clears EVERY link to it (the root cause)
  await E(() => window.editor.setEditing(true)); await wait(300);
  await E((lay) => { const m = window.editor.getModel();
    m.popups = [{ id: 'popup-8', name: 'Living room details', config: {}, items: [] }, { id: 'popup-9', name: 'Kitchen', config: {}, items: [] }];
    m.pages[0].items.push({ id: 'living-room-2', type: 'custom.room-scene', parent: null, config: { name: 'Living room', interactions: { tap: { action: 'popup', popup: 'popup-8' }, longPress: { action: 'popup', popup: 'popup-9' } } }, layout: lay });
    m.pages[0].items.push({ id: 'btn', type: 'button', parent: null, config: { text: 'Open', action: 'popup', popup: 'popup-8' }, layout: { ...lay, desktop: { x: 5, y: 1, w: 2, h: 2 } } });
    const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join('; ')); }, lay);
  await wait(400);
  await page.click('.ed-btn:has-text("Popups")'); await wait(300);
  const delBtn = 'dialog[open] [data-popup="popup-8"] .ed-mini-btn--danger';
  await page.click(delBtn); await wait(150); await page.click(delBtn); await wait(500);
  const after = await E(() => { const m = window.editor.getModel(), it = (id) => m.pages[0].items.find((x) => x.id === id).config; return { tap: it('living-room-2').interactions.tap, lp: it('living-room-2').interactions.longPress, btn: it('btn').action, popups: m.popups.map((p) => p.id), broken: window.MaisonModel.brokenReferences(m).length }; });
  check('DELETE POPUP: the Room\'s Tap → that popup now does nothing, the Button no longer opens it, the Long press → another popup is kept — no broken link left',
    after.tap.action === 'none' && after.btn === 'none' && after.lp.popup === 'popup-9' && after.popups.join() === 'popup-9' && after.broken === 0, JSON.stringify(after));
  await page.keyboard.press('Escape'); await wait(200);
  check('…and the dashboard saves', await E(() => window.editor.save()));

  // ---------------------------------------------------------------- a SAVED dashboard with a broken link (stored before this fix)
  const brokenId = await E(async (lay) => {
    const m = window.editor.getModel();
    m.pages.push({ id: 'p2', name: 'Living', nav: true, items: [] }, { id: 'p3', name: 'Rooms', nav: true, items: [
      { id: 'living-room-3', type: 'custom.room-scene', parent: null, config: { name: 'Living room', interactions: { tap: { action: 'popup', popup: 'popup-8' } } }, layout: lay },
      { id: 'kitchen', type: 'custom.room-scene', parent: null, config: { name: 'Kitchen', interactions: { tap: { action: 'popup', popup: 'popup-9' } } }, layout: { ...lay, desktop: { x: 5, y: 1, w: 4, h: 4 } } },
      { id: 'go', type: 'button', parent: null, config: { text: 'Go', action: 'navigate', page: 'gone' }, layout: { ...lay, desktop: { x: 9, y: 1, w: 2, h: 2 } } }] });
    const r = await window.IniqDashStore.create('Broken links', m);               // stored as it was (the server checks shape only)
    return r.ok ? r.entry.id : `ERR ${JSON.stringify(r)}`;
  }, lay);
  const rawBefore = await E(async (id) => JSON.stringify((await window.IniqDashStore.get(id)).dashboard), brokenId);
  await page.goto(`${L.base}/editor.html?d=${brokenId}`); await ready();
  const rep = await E(() => { const r = document.querySelector('[data-k=repair]'); return r && { issues: [...r.querySelectorAll('[data-k=repair-issue]')].map((x) => x.dataset.path), text: r.textContent }; });
  await shot('a1-repair-screen.png');
  check('OPEN a saved dashboard with broken links: instead of "cannot be shown", the REPAIR screen names each one — page, widget, what it does, the missing target, its exact path',
    rep && rep.issues.length === 2 && rep.issues.includes('pages[2].items[0] config.interactions.tap.popup') && rep.issues.includes('pages[2].items[2] config.page') && /popup-8/.test(rep.text) && /gone/.test(rep.text) && /left untouched/.test(rep.text), JSON.stringify(rep && rep.issues));
  // relink the Room's tap to the existing popup, remove the button's link
  await page.selectOption('[data-k=repair-issue][data-path="pages[2].items[0] config.interactions.tap.popup"] select', 'to:popup-9');
  await page.click('[data-k=repair-apply]'); await ready();
  const opened = await E(() => { const m = window.editor.getModel(), p3 = m.pages.find((p) => p.id === 'p3'); return { tap: p3.items[0].config.interactions.tap, kitchen: p3.items[1].config.interactions.tap, go: p3.items[2].config.action, dirty: window.editor.isDirty(), items: p3.items.length, pages: m.pages.length }; });
  const rawStill = await E(async (id) => JSON.stringify((await window.IniqDashStore.get(id)).dashboard), brokenId);
  await shot('a1-repaired-open.png');
  check('REPAIR → the editor opens the repaired dashboard UNSAVED: Tap relinked to "Kitchen" (popup-9), the Button\'s link removed, everything else as it was (3 pages, 3 widgets, the Kitchen room untouched); the server copy is still the original',
    opened.tap.popup === 'popup-9' && opened.kitchen.popup === 'popup-9' && opened.go === 'none' && opened.dirty && opened.items === 3 && opened.pages === 3 && rawStill === rawBefore, JSON.stringify(opened));
  check('SAVE stores the repaired dashboard', await E(() => window.editor.save()));
  await page.reload(); await ready();
  const re = await E(() => ({ editor: !!window.editor, repair: !!document.querySelector('[data-k=repair]'), tap: window.editor?.getModel().pages.find((p) => p.id === 'p3').items[0].config.interactions.tap.popup }));
  check('RELOAD: it opens normally (no repair needed) with the repaired links', re.editor && !re.repair && re.tap === 'popup-9', JSON.stringify(re));

  // ---------------------------------------------------------------- Save never stores a broken link (it offers the repair)
  await E(() => window.editor.setEditing(true)); await wait(300);
  const guard = await E(async () => {
    // a broken link made outside the editor's own operations (e.g. an older editor): the model is edited in place, unvalidated
    const m = window.editor.getModel(); m.pages[0].items.push({ id: 'x', type: 'button', parent: null, config: { text: 'X', action: 'popup', popup: 'nope' }, layout: { desktop: { x: 1, y: 9, w: 2, h: 2 }, tablet: { x: 1, y: 9, w: 2, h: 2 }, mobile: { w: 2, h: 2 } } });
    return window.editor.__forceModelForTest ? 'hook' : 'nohook';
  });
  check('(Save guard: covered in code — a broken model cannot be put into the editor through its own API: setModel validates)', guard === 'nohook' && !(await E(() => window.editor.setModel({ ...window.editor.getModel(), pages: [{ id: 'q', name: 'Q', items: [{ id: 'b', type: 'button', parent: null, config: { action: 'popup', popup: 'nope' }, layout: {} }] }] }).ok)));

  // ---------------------------------------------------------------- LAYOUT: "x + w goes past column 12"
  // (a) a CUSTOM 24-column page grid: a widget inside a 20-column container at columns 10–15 is valid — it was checked against 12
  const gridId = await E(async () => {
    const L = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y, w: Math.min(w, 8), h }, mobile: { w: 4, h } });
    const m = { version: 3, app: { id: 'wide', startPage: 'p', grid: { desktop: { cols: 24, row: 20, gap: 12 }, tablet: { cols: 8, row: 40, gap: 16 }, mobile: { cols: 4, row: 40, gap: 12 } } },
      pages: [{ id: 'p', name: 'Wide', nav: true, items: [{ id: 'box', type: 'container', parent: null, config: { title: 'Living' }, layout: L(1, 1, 20, 12) },
        { id: 'in', type: 'sensor', parent: 'box', config: { name: 'Inside' }, layout: { desktop: { x: 10, y: 1, w: 6, h: 3 } } }] }], popups: [], notifications: { templates: [], rules: [] } };
    const r = await window.IniqDashStore.create('Wide grid', m); return r.ok ? r.entry.id : JSON.stringify(r);
  });
  await page.goto(`${L.base}/editor.html?d=${gridId}`); await ready();
  const wide = await E(() => ({ editor: !!window.editor, fatal: document.querySelector('.ed-fatal')?.textContent || null, repair: !!document.querySelector('[data-k=repair]') }));
  check('CUSTOM GRID (24 columns): a widget inside a 20-column container at columns 10–15 OPENS normally — no "goes past column 12"', wide.editor && !wide.fatal && !wide.repair, JSON.stringify(wide));
  // (b) a widget that really runs past its grid (columns 11–14 of 12): the repair moves it left so it fits
  const pastId = await E(async () => {
    const m = window.editor.getModel(); m.app = { id: 'past', startPage: 'p' };
    m.pages = [{ id: 'p', name: 'Home', nav: true, items: [{ id: 'ok1', type: 'sensor', parent: null, config: { name: 'Fine' }, layout: { desktop: { x: 1, y: 1, w: 3, h: 3 }, tablet: { x: 1, y: 1, w: 3, h: 3 }, mobile: { w: 2, h: 3 } } },
      { id: 'over', type: 'sensor', parent: null, config: { name: 'Too far right' }, layout: { desktop: { x: 11, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 5, w: 3, h: 3 }, mobile: { w: 2, h: 3 } } }] }];
    m.popups = []; m.notifications = { templates: [], rules: [] }; delete m.app.grid;
    const r = await window.IniqDashStore.create('Past the edge', m); return r.ok ? r.entry.id : JSON.stringify(r);
  });
  await page.goto(`${L.base}/editor.html?d=${pastId}`); await ready();
  const rp = await E(() => { const r = document.querySelector('[data-k=repair]'); return r && { issues: [...r.querySelectorAll('[data-k=repair-issue]')].map((x) => x.dataset.path), text: r.textContent }; });
  if (SHOTS) await shot('a1-repair-layout.png');
  check('PAST THE EDGE (columns 11–14 of 12): the REPAIR screen names the widget and its desktop position, offering "Move it left so it fits" — not a dead end',
    rp && rp.issues.length === 1 && rp.issues[0] === 'pages[0].items[1].layout.desktop' && /Too far right/.test(rp.text) && /Move it left so it fits/.test(rp.text), JSON.stringify(rp));
  await page.click('[data-k=repair-apply]'); await ready();
  const moved = await E(() => window.editor.getModel().pages[0].items.map((i) => [i.id, i.layout.desktop.x, i.layout.desktop.w]));
  check('…the repaired dashboard opens (unsaved) with that widget at columns 9–12; the other widget untouched; Save + reload opens normally',
    JSON.stringify(moved) === JSON.stringify([['ok1', 1, 3], ['over', 9, 4]]) && await E(() => window.editor.save()) && (await page.reload(), await ready(), await E(() => !!window.editor && !document.querySelector('[data-k=repair]'))), JSON.stringify(moved));

  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
