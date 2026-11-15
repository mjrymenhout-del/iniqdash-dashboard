/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// TAB PANEL NAVIGATION — swipe, arrows, dots, transitions, loop, automatic advance on the EXISTING Tabbed Container; every tab stays a real
// nested grid of its own widgets. Real editor UI (the container's configuration), real touch input (Chrome touch events), real PHP server,
// FAKE Home Assistant (tests/lib/live.mjs — not a real Home Assistant).
//   ARBITRATION  a horizontal drag on a widget's slider moves the slider, never the tab; a vertical drag stays scrolling; a swipe never
//                presses what it started on; editing: no gesture navigation (widget drag / resize), the tab row always shown
//   DEFAULT      a Tabbed Container without navigation settings is the static tabs it always was
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
let L, B;
try {
  L = await live();
  L.setEntity('light.desk', 'on', { name: 'Desk', f: 0, br: 128, cm: 'brightness', scm: ['brightness'] });
  B = await liveBrowser(L, { viewport: { width: 1280, height: 900 } }); const page = B.page;
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const touchDrag = async (x0, y0, x1, y1, steps = 10) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }] }); await wait(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(450);
  };
  const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y, w: 8, h }, mobile: { w: 4, h } });
  await E((ls) => { const m = window.editor.getModel(); m.pages[0].items = [
    { id: 'scenes', type: 'tabs', parent: null, config: { title: 'Scenes', tabs: [{ id: 'a', label: 'Lights' }, { id: 'b', label: 'Scenes' }, { id: 'c', label: 'Sensors' }] }, layout: ls[0] },
    { id: 'desk', type: 'light', parent: 'scenes', tab: 'a', config: { name: 'Desk', entity: 'light.desk', variant: 'slider' }, layout: { desktop: { x: 1, y: 1, w: 6, h: 3 } } },
    { id: 'evening', type: 'button', parent: 'scenes', tab: 'b', config: { text: 'Evening', action: 'demo' }, layout: { desktop: { x: 1, y: 1, w: 3, h: 2 } } },
    { id: 'temp', type: 'sensor', parent: 'scenes', tab: 'c', config: { name: 'Temperature' }, layout: { desktop: { x: 1, y: 1, w: 3, h: 3 } } },
    { id: 'static', type: 'tabs', parent: null, config: { title: 'Static', tabs: [{ id: 's1', label: 'One' }, { id: 's2', label: 'Two' }] }, layout: ls[1] }];
    const r = window.editor.setModel(m); if (!r.ok) throw new Error(r.errors.join('; ')); }, [lay(1, 1, 8, 7), lay(1, 9, 6, 5)]);
  await wait(800);

  // ---------------------------------------------------------------- configure through the container's real configuration dialog
  await E(() => window.editor.setEditing(true)); await wait(300);
  await page.click('.ed-canvas [data-grid-id="scenes"] .mtabs__bar', { position: { x: 4, y: 4 }, force: true }); await wait(250);
  await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector('dialog[open] .ef'); await wait(400);
  const D = 'dialog[open]', F = (k) => `${D} .ef-field[data-key="${k}"]`;
  await E((D) => document.querySelectorAll(`${D} details.ef-group--acc`).forEach((d) => { d.open = true; }), D);
  await page.selectOption(`${F('nav.mode')} select`, 'both'); await wait(200);
  await page.selectOption(`${F('nav.transition')} select`, 'slide'); await wait(200);
  await page.click(`${F('nav.arrows')} button[role=switch]`); await page.click(`${F('nav.dots')} button[role=switch]`); await wait(200);
  const fieldsShown = await E((D) => ['nav.mode', 'nav.showTabs', 'nav.axis', 'nav.mouse', 'nav.transition', 'nav.duration', 'nav.arrows', 'nav.dots', 'nav.loop', 'nav.auto'].filter((k) => { const f = document.querySelector(`${D} .ef-field[data-key="${k}"]`); return f && !f.hidden; }), D);
  await page.click(`${D} .ecfg-foot button:has-text("Apply")`); await wait(600);
  const cfg = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'scenes').config.nav);
  check('CONFIGURE (the container\'s own dialog, a Navigation section): Tabs + swipe, Slide, arrows and dots are stored — and only what differs from the static default',
    cfg && cfg.mode === 'both' && cfg.transition === 'slide' && cfg.arrows === true && cfg.dots === true && Object.keys(cfg).length === 4 && fieldsShown.length === 10, JSON.stringify({ cfg, fieldsShown }));

  // ---------------------------------------------------------------- editing: the tab row is there, a drag never navigates
  const tabEd = await E(() => document.querySelector('.ed-canvas [data-grid-id="scenes"] .mtabs').tabs.current());
  const pr = await (await page.$('.ed-canvas [data-grid-id="scenes"] .mtabs__panes')).boundingBox();
  await touchDrag(pr.x + pr.width * 0.8, pr.y + pr.height * 0.8, pr.x + pr.width * 0.2, pr.y + pr.height * 0.8);
  const edAfter = await E(() => { const m = document.querySelector('.ed-canvas [data-grid-id="scenes"] .mtabs'); return { cur: m.tabs.current(), bar: m.querySelector('.mtabs__bar').getBoundingClientRect().width > 20, swipe: m.tabs.nav().swipe }; });
  check('EDITING: the tab row is shown and a touch drag over the tab never changes the tab (no gesture navigation while editing)', edAfter.cur === tabEd && edAfter.bar && edAfter.swipe === false, JSON.stringify(edAfter));

  // ---------------------------------------------------------------- view mode: swipe, slider arbitration, scrolling, arrows, dots
  await E(() => window.editor.setEditing(false)); await wait(700);
  const M = '[data-grid-id="scenes"] .mtabs';
  const cur = () => E((M) => document.querySelector(M).tabs.current(), M);
  const panes = async () => (await page.$(`${M} .mtabs__panes`)).boundingBox();
  let pb = await panes();
  const sliderBox = await E((M) => { const s = document.querySelector(`${M} [role="slider"], ${M} input[type=range]`); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, v: s.getAttribute('aria-valuenow') || s.value }; }, M);
  const n0 = L.haCalls.length;
  if (sliderBox) await touchDrag(sliderBox.x + sliderBox.w * 0.2, sliderBox.y + sliderBox.h / 2, sliderBox.x + sliderBox.w * 0.8, sliderBox.y + sliderBox.h / 2, 12);
  const sliderAfter = await E((M) => { const s = document.querySelector(`${M} [role="slider"], ${M} input[type=range]`); return s && (s.getAttribute('aria-valuenow') || s.value); }, M);
  check('SLIDER WINS: a horizontal touch drag along the Light\'s brightness slider moves the slider (its value changes) and the tab stays "Lights"',
    !!sliderBox && sliderAfter !== sliderBox.v && (await cur()) === 'a', JSON.stringify({ sliderBox, sliderAfter, calls: L.haCalls.length - n0 }));
  // swipe on the tab's empty area (below the widget)
  pb = await panes();
  await touchDrag(pb.x + pb.width * 0.85, pb.y + pb.height * 0.85, pb.x + pb.width * 0.25, pb.y + pb.height * 0.85);
  const anim = await E((M) => document.querySelector(M).querySelectorAll('.mtabs__pane').length, M);
  check('SWIPE (touch, right → left): the next tab, "Scenes" — a real nested grid with its own widget (the Evening button), slid in',
    (await cur()) === 'b' && await E(() => !!document.querySelector('[data-grid-id="evening"]')?.offsetParent) && anim === 3);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'b1-swipe.png') });
  // vertical drag: no tab change
  await touchDrag(pb.x + pb.width * 0.5, pb.y + pb.height * 0.9, pb.x + pb.width * 0.52, pb.y + pb.height * 0.3);
  check('VERTICAL DRAG on a horizontal swiper: not a swipe (it stays page scrolling) — still "Scenes"', (await cur()) === 'b');
  // a swipe that starts ON the button: no press
  const btn = await (await page.$('[data-grid-id="evening"]')).boundingBox();
  const svc = () => L.haCalls.filter((x) => /\/api\/services\//.test(x.url)).length; const calls0 = svc();
  await touchDrag(btn.x + btn.width * 0.8, btn.y + btn.height / 2, btn.x + btn.width * 0.8 - 260, btn.y + btn.height / 2);
  const pressed = await E(() => (window.editor.actionsLog ? window.editor.actionsLog().length : null));
  check('A SWIPE STARTING ON A BUTTON (a carousel of scene buttons): the next tab ("Sensors") — and it is not a press: nothing sent to Home Assistant', (await cur()) === 'c' && svc() === calls0, String(pressed));
  // swipe back twice (left → right) — measured again: the vertical drag scrolled the page
  pb = await panes();
  await touchDrag(pb.x + pb.width * 0.2, pb.y + pb.height * 0.85, pb.x + pb.width * 0.8, pb.y + pb.height * 0.85);
  await touchDrag(pb.x + pb.width * 0.2, pb.y + pb.height * 0.85, pb.x + pb.width * 0.8, pb.y + pb.height * 0.85);
  check('SWIPE (left → right) twice: back to the first tab, "Lights"', (await cur()) === 'a');
  // first tab, no loop: a swipe back does nothing; the previous arrow is disabled
  pb = await panes();
  await touchDrag(pb.x + pb.width * 0.2, pb.y + pb.height * 0.85, pb.x + pb.width * 0.8, pb.y + pb.height * 0.85);
  const prevDis = await E((M) => document.querySelector(`${M} [data-k=tabs-prev]`).disabled, M);
  check('FIRST TAB without Loop: swiping back stays on "Lights"; the previous arrow is disabled', (await cur()) === 'a' && prevDis);
  await page.click(`${M} [data-k=tabs-next]`); await wait(450);
  await page.click(`${M} .mtabs__dot[data-tab="c"]`); await wait(450);
  const dots = await E((M) => [...document.querySelectorAll(`${M} .mtabs__dot`)].map((d) => d.getAttribute('aria-current')).join(), M);
  check('ARROWS and DOTS: next → "Scenes", the third dot → "Sensors" (its dot current)', (await cur()) === 'c' && dots === 'false,false,true', dots);
  // a mouse drag does not swipe unless allowed
  await page.mouse.move(pb.x + pb.width * 0.85, pb.y + pb.height * 0.85); await page.mouse.down(); await page.mouse.move(pb.x + pb.width * 0.2, pb.y + pb.height * 0.85, { steps: 10 }); await page.mouse.up(); await wait(400);
  check('MOUSE DRAG (not allowed by default): no swipe', (await cur()) === 'c');
  // keyboard on the tab row
  await page.focus(`${M} .mtabs__tab[data-tab="c"]`); await page.keyboard.press('ArrowLeft'); await wait(400);
  check('KEYBOARD: Left on the tab row → "Scenes"', (await cur()) === 'b');
  // the static container: unchanged by default
  const st = await E(() => { const m = document.querySelector('[data-grid-id="static"] .mtabs'); return { nav: m.dataset.nav, arrows: !!m.querySelector('.mtabs__arrow'), dots: !!m.querySelector('.mtabs__dots'), swipe: m.tabs.nav().swipe, transition: m.tabs.nav().transition, overflow: getComputedStyle(m.querySelector('.mtabs__panes')).overflow }; });
  check('DEFAULT: a Tabbed Container without navigation settings is the static tabs it was (no arrows, no dots, no swipe, no transition)', st.nav === 'tabs' && !st.arrows && !st.dots && !st.swipe && st.transition === 'none' && st.overflow === 'visible', JSON.stringify(st));

  // ---------------------------------------------------------------- loop, vertical, hidden tab row, mouse, automatic advance
  await E(() => { const m = window.editor.getModel(); const t = m.pages[0].items.find((i) => i.id === 'scenes'); t.config.nav = { mode: 'swipe', axis: 'y', transition: 'fade', duration: 200, showTabs: false, mouse: true, loop: true, dots: true, auto: 2 }; window.editor.setModel(m); });
  await wait(900);
  const hid = await E((M) => { const m = document.querySelector(M); return { bar: m.querySelector('.mtabs__bar').getBoundingClientRect().width, dots: m.querySelector('.mtabs__dots').getBoundingClientRect().width > 20 }; }, M);
  check('TAB ROW HIDDEN (gesture + dots only): the row is not shown (1 px, still there for the keyboard), the dots are', hid.bar <= 1 && hid.dots, JSON.stringify(hid));
  pb = await panes();
  const c0 = await cur();
  await page.mouse.move(pb.x + pb.width * 0.5, pb.y + pb.height * 0.85); await page.mouse.down(); await page.mouse.move(pb.x + pb.width * 0.5, pb.y + pb.height * 0.15, { steps: 12 }); await page.mouse.up(); await wait(350);
  const c1 = await cur();
  check('VERTICAL + MOUSE DRAG allowed: dragging up → the next tab', c1 !== c0, `${c0} → ${c1}`);
  await E((M) => document.querySelector(M).tabs.select('c'), M); await page.mouse.move(5, 5); await wait(100);
  await page.mouse.move(pb.x + pb.width * 0.5, pb.y + pb.height * 0.85); await page.mouse.down(); await page.mouse.move(pb.x + pb.width * 0.5, pb.y + pb.height * 0.15, { steps: 12 }); await page.mouse.up(); await wait(350);
  check('LOOP: from the last tab the next is the first', (await cur()) === 'a');
  await page.mouse.move(2, 2); await wait(9000);                                             // a user action pauses the automatic advance (8 s)
  const t0 = await cur(); await wait(2600);
  const t1 = await cur();
  check('AUTOMATIC ADVANCE (2 s): advances on its own when nobody is interacting', t1 !== t0, `${t0} → ${t1}`);
  await page.hover(`${M} .mtabs__panes`); await wait(100); const h0 = await cur(); await wait(2600);
  check('…and pauses while the pointer is over it', (await cur()) === h0);
  await page.mouse.move(2, 2);

  // ---------------------------------------------------------------- reduced motion, save + reload
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await E((M) => document.querySelector(M).tabs.next(), M);
  const animsReduced = await E((M) => [...document.querySelectorAll(`${M} .mtabs__pane`)].reduce((n, p) => n + p.getAnimations().length, 0), M);
  check('REDUCED MOTION: the tab changes without any transition animation', animsReduced === 0, String(animsReduced));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  check('SAVE', await E(() => window.editor.save()));
  await page.reload(); await page.waitForFunction(() => window.editor); await wait(1200);
  const re = await E(() => window.editor.getModel().pages[0].items.find((i) => i.id === 'scenes').config.nav);
  check('RELOAD: the navigation settings are kept', JSON.stringify(re) === JSON.stringify({ mode: 'swipe', axis: 'y', transition: 'fade', duration: 200, showTabs: false, mouse: true, dots: true, loop: true, auto: 2 }), JSON.stringify(re));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
