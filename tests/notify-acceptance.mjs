/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// NOTIFICATIONS — ACCEPTANCE through the real editor UI (fake Home Assistant: tests/lib/live.mjs — not a real Home Assistant).
//   1–3  placement: the coordinate system is EXPLICIT — the visible browser window ('window': the dashboard fitted to the editor, the
//        current browser window, full screen of this window) or a simulated device ('device': the Responsive Preview set to a device)
//   4    Test while the Notifications dialog (and the template dialog) is open: the dialogs step aside, the notification is SEEN
//   5–7  the five demo Fire buttons: event → rule → template; with no / an off / a matching rule — always said in the dialog
//   8    the template editor is the widget configuration's editor (sections, shared controls, Live preview panel) and its preview
//        follows the unsaved values
//   9    Cancel · Apply + Save · reload        10  an older template keeps working
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1440, height: 900 } }); const page = B.page;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };
  const services = () => L.haCalls.filter((x) => /\/api\/services\//.test(x.url)).length;
  const n0 = services();
  const LIST = 'dialog[open].ed-dlg--notes', D = 'dialog[open].ed-dlg--note', F = (k) => `${D} .ef-field[data-key="${k}"]`;
  /** the live notifications on the real screen, in viewport px; the frame (simulated device screen) */
  const shown = () => E(() => [...document.querySelectorAll('.mscr--notes .mnote:not(.is-leaving)')].map((n) => { const r = n.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy); return { title: n.querySelector('.mnote__title').textContent, pos: n.dataset.position, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, seen: !!hit && n.contains(hit) }; }));
  const frame = () => E(() => { const r = document.querySelector('.ed-frame').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  const win = () => E(() => ({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }));
  const clear = async () => { await E(() => window.editor.clearNotifications()); await wait(300); };
  const set = async (key, kind, v) => {
    await E((s) => { const d = document.querySelector(s)?.closest('details'); if (d && !d.open) d.querySelector(':scope > summary').click(); }, F(key));
    if (kind === 'select') await page.selectOption(`${F(key)} select`, v);
    else if (kind === 'color') await page.click(`${F(key)} .ef-icon[data-value="${v}"]`);
    else await page.fill(`${F(key)} :is(input, textarea)`, String(v));
    await wait(250);
  };
  const near = (a, b, t = 1.5) => Math.abs(a - b) <= t;

  await E(() => window.editor.setEditing(true)); await wait(400);
  await page.click('.ed-btn--notes'); await page.waitForSelector(LIST); await wait(300);

  // ---------------------------------------------------------------- 5 · every Fire, no rule yet: nothing shown — and the dialog says why
  const fires = [];
  for (const ev of ['demo.front_door_open', 'demo.doorbell', 'demo.washing_done', 'demo.water_leak', 'demo.low_battery']) {
    await page.click(`${LIST} [data-k=fire][data-event="${ev}"]`); await wait(250);
    fires.push(await E((LIST) => { const f = document.querySelector(`${LIST} [data-k=fire-result]`); return { ev: f.dataset.event, state: f.dataset.state, text: f.textContent, visible: !f.hidden && f.offsetHeight > 0 }; }, LIST));
  }
  await shot('acc-5-fire-no-rule.png');
  check('5 · FIRE (all five demo events, 0 rules): no notification, and the Notifications dialog itself says why — "no rule uses this event", with what to do',
    fires.length === 5 && fires.every((f) => f.state === 'no-rule' && f.visible && /^No matching rule — no notification shown/.test(f.text) && /no rule uses this event/.test(f.text) && /New rule/.test(f.text)) && (await shown()).length === 0, JSON.stringify(fires.map((f) => [f.ev, f.state])));

  // ---------------------------------------------------------------- 8 · the template editor: the widget configuration's editor
  await page.click(`${LIST} [data-k=add-template]`); await page.waitForSelector(D); await wait(700);
  const ed = await E((D) => { const d = document.querySelector(D), pv = d.querySelector('.ecfg-split > .ecfg-pv');
    return { split: !!d.querySelector('.ecfg-split'), pv: !!pv, pvHead: pv && pv.querySelector('.ecfg-pv__head .ed-sub')?.textContent, acc: d.querySelectorAll('details.ef-group--acc').length, open: [...d.querySelectorAll('details.ef-group--acc')].filter((x) => x.open).map((x) => x.dataset.group),
      icon: !!d.querySelector('.ef-field[data-key="icon"] [data-k=icon-field]'), color: !!d.querySelector('.ef-field[data-key="design.bgColor"] .ef-colors'), image: !!d.querySelector('.ef-field[data-key="image"] .ef-artwork'),
      apply: !!d.querySelector('[data-k=apply-def]'), cancel: !!d.querySelector('[data-k=def-cancel]') }; }, D);
  check('8 · the template editor IS the widget configuration editor: the same dialog and split, collapsible sections (the first open), the same "Live preview" panel, the shared icon picker, colour swatches and image picker, Cancel / Apply',
    ed.split && ed.pv && ed.pvHead === 'Live preview' && ed.acc >= 9 && ed.open.join() === 'identity' && ed.icon && ed.color && ed.image && ed.apply && ed.cancel, JSON.stringify(ed));
  await set('title', 'text', 'Front door'); await set('message', 'text', 'The front door is open');
  const pvShot = async () => (await page.$(`${D} .ed-notepv`)).screenshot();
  const p0 = await pvShot();
  await set('design.bgColor', 'color', 'danger'); const p1 = await pvShot();
  await set('design.corners', 'select', 'custom');
  await E((s) => { const r = document.querySelector(s); r.value = '0'; r.dispatchEvent(new Event('input', { bubbles: true })); }, `${F('design.radii')} input[data-corner="tl"][data-part="r"]`); await wait(250);
  const p2 = await pvShot();
  const tl = await E((D) => getComputedStyle(document.querySelector(`${D} .ed-notepv .mnote:not(.is-leaving)`)).borderTopLeftRadius, D);
  await page.click(`${F('icon')} [data-k=icon-field]`); await page.fill(`${F('icon')} .iqi__search`, 'door'); await wait(300);
  await page.click(`${F('icon')} .iqi__opt[data-icon="mdi:door"]`); await wait(400);
  const p3 = await pvShot();
  const ic = await E((D) => document.querySelector(`${D} .ed-notepv .mnote:not(.is-leaving) .mnote__icon`)?.dataset.mdi, D);
  await shot('acc-8-editor.png');
  check('8 · the Live preview follows the UNSAVED values at once: background red, the shared corner control (top-left 0 px), the shared icon picker (mdi:door) — each changes the preview\'s pixels',
    Buffer.compare(p0, p1) !== 0 && Buffer.compare(p1, p2) !== 0 && Buffer.compare(p2, p3) !== 0 && tl === '0px' && ic === 'mdi:door', JSON.stringify({ tl, ic }));

  // ---------------------------------------------------------------- 1 · desktop, Top right, Test while both dialogs are open
  check('the coordinate system: the dashboard fitted to the editor → notifications use the VISIBLE BROWSER WINDOW', (await E(() => window.editor.notificationTarget())) === 'window');
  await page.click(`${D} [data-k=test-draft]`); await wait(600);
  let w = await win(), s = await shown();
  const peek = await E(() => ({ dialogs: document.querySelectorAll('dialog[open].is-peek').length, bar: !!document.querySelector('[data-k=peek-back]') }));
  await shot('acc-1-desktop-top-right.png');
  check('1/4 · DESKTOP 1440 × 900, Top right, Test while the Notifications and template dialogs are open: the notification is at the top right of the visible window (12 px from both edges), fully visible and SEEN — the dialogs step aside (both open, "Back to the editor")',
    s.length === 1 && near(s[0].r, w.w - 12) && near(s[0].t, 12) && s[0].seen && s[0].title === 'Front door' && peek.dialogs === 2 && peek.bar, JSON.stringify({ s, w, peek }));
  await page.click('[data-k=peek-back]'); await wait(300);
  const back = await E((D) => ({ dlg: !!document.querySelector(D), peek: !!document.querySelector('.is-peek'), title: document.querySelector(`${D} .ef-field[data-key="title"] input`).value }), D);
  check('4 · "Back to the editor": both dialogs return with the unsaved values', back.dlg && !back.peek && back.title === 'Front door', JSON.stringify(back));
  await clear();

  // ---------------------------------------------------------------- 2 · bottom right and centre
  for (const [p, name] of [['bottom-right', 'bottom-right'], ['center', 'center']]) {
    await set('position', 'select', p);
    await page.click(`${D} [data-k=test-draft]`); await wait(600);
    w = await win(); s = await shown();
    const ok = s.length === 1 && s[0].seen && (p === 'center' ? near((s[0].l + s[0].r) / 2, w.w / 2) && near((s[0].t + s[0].b) / 2, w.h / 2) : near(s[0].r, w.w - 12) && near(s[0].b, w.h - 12));
    await shot(`acc-2-${name}.png`);
    check(`2 · ${p === 'center' ? 'CENTRE: centred in the visible window' : 'BOTTOM RIGHT: 12 px from the window\'s right and bottom edges'} — fully visible and seen`, ok, JSON.stringify({ s, w }));
    await page.click('[data-k=peek-back]'); await wait(250); await clear();
  }

  // ---------------------------------------------------------------- 3 · mobile device preview (a simulated device): its own screen
  await set('position', 'select', 'top-right');
  await page.click(`${D} [data-k=apply-def]`); await wait(400);
  await page.click(`${LIST} .ed-dlg__head button`); await wait(300);                       // close the Notifications dialog
  await E(() => window.editor.setViewport(390, 844, 'iPhone')); await wait(700);
  const tgt = await E(() => window.editor.notificationTarget());
  await page.click('.ed-btn--notes'); await page.waitForSelector(LIST); await wait(300);
  await page.click(`${LIST} [data-template] [data-k=test]`); await wait(600);
  const f = await frame(); s = await shown();
  const sc = await E(() => window.editor.preview().scale);
  await shot('acc-3-mobile-preview.png');
  check('3 · MOBILE PREVIEW 390 × 844 (a simulated device): notifications use the DEVICE\'s screen — top right of the phone (12 px × its scale), fully visible and seen; Test from the template list',
    tgt === 'device' && s.length === 1 && s[0].seen && near(s[0].r, f.r - 12 * sc) && near(s[0].t, Math.max(f.t, 0) + 12 * sc) && s[0].l >= f.l, JSON.stringify({ tgt, s, f, sc }));
  await page.click('[data-k=peek-back]'); await wait(250); await clear();
  await page.click(`${LIST} .ed-dlg__head button`); await wait(300);
  await E(() => window.editor.setBreakpoint('desktop')); await wait(700);

  // ---------------------------------------------------------------- 6 / 7 · rules: no matching rule · rule off · matching rule
  await page.click('.ed-btn--notes'); await page.waitForSelector(LIST); await wait(300);
  await page.click(`${LIST} [data-k=add-template]`); await page.waitForSelector(D); await wait(600);
  await set('title', 'text', 'Doorbell'); await set('message', 'text', 'Someone is at the door'); await set('position', 'select', 'top-center');
  await page.click(`${D} [data-k=apply-def]`); await wait(400);
  const tids = await E(() => window.editor.getModel().notifications.templates.map((t) => [t.id, t.config.title]));
  await page.click(`${LIST} [data-k=add-rule]`); await wait(300);                             // rule 1: front door → Front door
  await page.click(`${LIST} [data-k=add-rule]`); await wait(300);                             // rule 2: doorbell → Doorbell
  await page.selectOption(`${LIST} [data-rule]:nth-child(2) [data-k=rule-event]`, 'demo.doorbell'); await wait(200);
  await page.selectOption(`${LIST} [data-rule]:nth-child(2) [data-k=rule-template]`, tids[1][0]); await wait(200);
  await page.click(`${LIST} [data-k=fire][data-event="demo.water_leak"]`); await wait(300);
  const r6 = await E((LIST) => { const x = document.querySelector(`${LIST} [data-k=fire-result]`); return { state: x.dataset.state, text: x.textContent }; }, LIST);
  check('6 · FIRE an event NO rule matches (water leak; rules exist for other events): no notification — "no rule uses this event"', r6.state === 'no-rule' && (await shown()).length === 0, JSON.stringify(r6));
  await page.click(`${LIST} [data-rule]:nth-child(2) input[type=checkbox]`); await wait(200);                    // doorbell rule off
  await page.click(`${LIST} [data-k=fire][data-event="demo.doorbell"]`); await wait(300);
  const rOff = await E((LIST) => document.querySelector(`${LIST} [data-k=fire-result]`).dataset.state, LIST);
  check('6 · FIRE an event whose rule is turned off: no notification — "its rule is turned off"', rOff === 'rule-off' && (await shown()).length === 0, rOff);
  await page.click(`${LIST} [data-rule]:nth-child(2) input[type=checkbox]`); await wait(200);                    // on again
  await page.click(`${LIST} [data-k=fire][data-event="demo.doorbell"]`); await wait(600);
  w = await win(); s = await shown();
  const r7 = await E((LIST) => { const x = document.querySelector(`${LIST} [data-k=fire-result]`); return { state: x.dataset.state, text: x.textContent }; }, LIST);
  await shot('acc-7-fire-matching-rule.png');
  check('7 · FIRE "Doorbell pressed" with its rule: event → rule → template "Doorbell" shown at Top centre of the window, seen (the dialog steps aside); the dialog says what was shown',
    r7.state === 'shown' && /Doorbell/.test(r7.text) && s.length === 1 && s[0].title === 'Doorbell' && s[0].pos === 'top-center' && near((s[0].l + s[0].r) / 2, w.w / 2) && near(s[0].t, 12) && s[0].seen, JSON.stringify({ r7, s }));
  await page.click('[data-k=peek-back]'); await wait(250); await clear();
  // all five events with a rule each: each Fire shows its template
  const evs = ['demo.front_door_open', 'demo.doorbell', 'demo.washing_done', 'demo.water_leak', 'demo.low_battery'];
  for (let i = 2; i < 5; i++) { await page.click(`${LIST} [data-k=add-rule]`); await wait(200); await page.selectOption(`${LIST} [data-rule]:nth-child(${i + 1}) [data-k=rule-event]`, evs[i]); await page.selectOption(`${LIST} [data-rule]:nth-child(${i + 1}) [data-k=rule-template]`, tids[i % 2][0]); await wait(150); }
  const all = [];
  for (const [i, ev] of evs.entries()) {
    await page.click(`${LIST} [data-k=fire][data-event="${ev}"]`); await wait(500);
    s = await shown();
    all.push({ ev, state: await E((LIST) => document.querySelector(`${LIST} [data-k=fire-result]`).dataset.state, LIST), titles: s.map((x) => x.title), seen: s.every((x) => x.seen), want: tids[i % 2][1] });
    await page.click('[data-k=peek-back]'); await wait(200); await clear();
  }
  check('5/7 · all five demo Fire buttons, each with a rule: each shows its rule\'s template on the screen, seen', all.every((x) => x.state === 'shown' && x.titles.length === 1 && x.titles[0] === x.want && x.seen), JSON.stringify(all));

  // ---------------------------------------------------------------- 9 · Cancel · Apply + Save · reload
  await page.click(`${LIST} [data-template="${tids[0][0]}"] [data-k=edit]`); await page.waitForSelector(D); await wait(500);
  await set('title', 'text', 'Not kept'); await page.click(`${D} [data-k=def-cancel]`); await wait(300);
  const cancelled = await E((id) => window.editor.getModel().notifications.templates.find((t) => t.id === id).config.title, tids[0][0]);
  await page.click(`${LIST} [data-template="${tids[0][0]}"] [data-k=edit]`); await page.waitForSelector(D); await wait(500);
  await set('title', 'text', 'Front door (saved)'); await set('design.bgColor', 'color', 'success');
  await page.click(`${D} [data-k=apply-def]`); await wait(400);
  await page.click(`${LIST} .ed-dlg__head button`); await wait(300);
  const saved = await E(() => window.editor.save()); await wait(800);
  await page.reload(); await wait(1500);
  const re = await E((id) => window.editor.getModel().notifications.templates.find((t) => t.id === id).config, tids[0][0]);
  const rules = await E(() => window.editor.getModel().notifications.rules.length);
  await E(() => window.editor.setEditing(true)); await wait(400);
  await page.click('.ed-btn--notes'); await page.waitForSelector(LIST); await wait(300);
  await page.click(`${LIST} [data-template="${tids[0][0]}"] [data-k=edit]`); await page.waitForSelector(D); await wait(600);
  const reUi = await E((D) => ({ title: document.querySelector(`${D} .ef-field[data-key="title"] input`).value, pvTitle: document.querySelector(`${D} .ed-notepv .mnote:not(.is-leaving) .mnote__title`)?.textContent,
    pvBg: document.querySelector(`${D} .ed-notepv .mnote:not(.is-leaving)`)?.style.getPropertyValue('--mnote-bg') }), D);
  check('9 · CANCEL discards ("Not kept" never stored) · APPLY + SAVE persist · after a RELOAD the editor and its live preview show the saved template; the rules are kept',
    cancelled === 'Front door' && saved && re.title === 'Front door (saved)' && re.design && re.design.bgColor === 'success' && rules === 5 && reUi.title === 'Front door (saved)' && reUi.pvTitle === 'Front door (saved)' && /success/.test(reUi.pvBg), JSON.stringify({ cancelled, re, rules, reUi }));
  await page.click(`${D} [data-k=def-cancel]`); await wait(300);
  await page.click(`${LIST} .ed-dlg__head button`); await wait(300);

  // ---------------------------------------------------------------- 10 · an older template (built-in icon name, no design) keeps working
  await E(() => { const m = window.editor.getModel(); m.notifications.templates.push({ id: 'legacy-door', name: 'Legacy door', config: { title: 'Legacy', message: 'An older template', icon: 'door', tone: 'warning', position: 'top-right' } });
    m.notifications.rules.push({ id: 'legacy-rule', event: 'demo.front_door_open', template: 'legacy-door', enabled: true }); window.editor.setModel(m); }); await wait(400);
  await page.click('.ed-btn--notes'); await page.waitForSelector(LIST); await wait(300);
  await page.click(`${LIST} [data-template="legacy-door"] [data-k=test]`); await wait(600);
  const leg = await E(() => { const n = [...document.querySelectorAll('.mscr--notes .mnote:not(.is-leaving)')].pop(); return n && { designed: n.dataset.designed || null, icon: !!n.querySelector('.mnote__icon svg'), title: n.querySelector('.mnote__title').textContent, w: Math.round(n.getBoundingClientRect().width) }; });
  await shot('acc-10-legacy.png');
  await page.click('[data-k=peek-back]'); await wait(250); await clear();
  await page.click(`${LIST} [data-template="legacy-door"] [data-k=edit]`); await page.waitForSelector(D); await wait(600);
  const legEd = await E((D) => ({ errs: document.querySelectorAll(`${D} .ef-err:not([hidden])`).length, pv: !!document.querySelector(`${D} .ed-notepv .mnote .mnote__icon svg`) }), D);
  await page.click(`${D} [data-k=apply-def]`); await wait(400);
  const legCfg = await E(() => window.editor.getModel().notifications.templates.find((t) => t.id === 'legacy-door').config);
  check('10 · an OLDER template (built-in icon "door", no design): Test draws it as before (Standard look, its icon, 360 px); it opens in the editor without errors (its icon previewed) and Apply keeps it as it was',
    leg && !leg.designed && leg.icon && leg.title === 'Legacy' && leg.w === 360 && legEd.errs === 0 && legEd.pv && legCfg.icon === 'door' && !legCfg.design, JSON.stringify({ leg, legEd, legCfg }));
  await page.click(`${LIST} .ed-dlg__head button`); await wait(300);

  // ---------------------------------------------------------------- view mode: the dashboard (not editing) — the visible window
  await E(() => window.editor.setEditing(false)); await wait(500);
  await E(() => window.editor.fire('demo.front_door_open')); await wait(600);
  w = await win(); s = await shown();
  await shot('acc-view-mode-fire.png');
  check('VIEW MODE (the dashboard, not editing): firing "Front door opened" shows both matching templates at the top right of the visible window, stacked, all visible',
    s.length === 2 && s.every((x) => near(x.r, w.w - 12) && x.t >= 0 && x.b <= w.h && x.seen) && near(Math.min(...s.map((x) => x.t)), 12), JSON.stringify({ s, w }));
  await clear();

  check('NO Home Assistant service call', services() === n0, String(services() - n0));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
