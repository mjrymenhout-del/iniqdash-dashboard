/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// NOTIFICATIONS — positioning and the visual designer, through the REAL editor UI, the REAL screen layer and the REAL IniqDash server
// with a FAKE Home Assistant (tests/lib/live.mjs — not a real Home Assistant). Placement is measured in the browser (DOM geometry of
// the rendered notification against the VISIBLE part of the screen it belongs to); the live preview is checked by its pixels.
//   POSITIONS   all seven positions in the dashboard view (desktop 1920 × 1080, tablet 1024 × 768, mobile 390 × 844), the editor's
//               scaled device preview (390 × 844 at 50 % and Fit), full-screen test mode, a scrolled page, a resized window, a
//               scrolled dashboard
//   STACKING    newest nearest the edge, 10 px apart, never more than fit the visible screen, dismissal
//   EXTREME     a notification larger than the screen stays inside it; its content scrolls
//   DESIGNER    every property through the template dialog: the live preview (the same renderer) changes — DOM and pixels; transparency
//               affects the background only; presets fill the properties and can be overridden; image layouts; upload
//   CANCEL/SAVE Cancel discards; Apply + Save persists across a reload; an older template (no design) renders exactly as Standard
//   TEST A–G    Test on screen with designed notifications at 1920 × 1080, 1024 × 768, 390 × 844, a scaled preview, full screen,
//               several at once, extreme dimensions
import fs from 'node:fs';
import path from 'node:path';
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const SHOTS = process.env.SHOTS || '';
const POS = ['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'];
let L, B;
try {
  L = await live();
  B = await liveBrowser(L, { viewport: { width: 1920, height: 1080 } }); const page = B.page;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(900);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const wait = (ms) => page.waitForTimeout(ms);
  const services = () => L.haCalls.filter((x) => /\/api\/services\//.test(x.url)).length;
  const n0 = services();
  const shot = async (name, sel) => { if (!SHOTS) return; if (sel) { const el = await page.$(sel); if (el) await el.screenshot({ path: path.join(SHOTS, name) }); } else await page.screenshot({ path: path.join(SHOTS, name) }); };

  /** the screen's VISIBLE region (viewport px), its scale, and every live notification on the real screen */
  const geo = () => E(() => {
    const scr = document.querySelector('.mscr--notes'), lay = scr.querySelector('.mscr__layer'), r = scr.getBoundingClientRect(), de = document.documentElement;
    const s = r.width / lay.offsetWidth;
    const R = { l: Math.max(r.left, 0), t: Math.max(r.top, 0), r: Math.min(r.right, de.clientWidth), b: Math.min(r.bottom, de.clientHeight) };
    const notes = [...lay.querySelectorAll('.mnote:not(.is-leaving)')].filter((n) => n.style.display !== 'none').map((n) => { const q = n.getBoundingClientRect(), m = n.querySelector('.mnote__main');
      return { pos: n.dataset.position, nid: n.dataset.nid, l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height, scroll: m.scrollHeight > m.clientHeight + 1 || m.scrollWidth > m.clientWidth + 1, margin: parseFloat(getComputedStyle(n).getPropertyValue('--mnote-m')) || 12 }; });
    return { R, s, narrow: lay.offsetWidth < 640, notes };
  });
  /** where a notification at `pos` belongs: the edge(s) at its margin (scaled) within the visible region; centred along the others */
  const placed = (g, n, tol = 1.6) => {
    const { R, s } = g, m = n.margin * s, cx = (n.l + n.r) / 2, cy = (n.t + n.b) / 2, ok = [];
    const inside = n.l >= R.l - 0.5 && n.t >= R.t - 0.5 && n.r <= R.r + 0.5 && n.b <= R.b + 0.5;
    if (n.pos.startsWith('top')) ok.push(Math.abs(n.t - (R.t + m)) <= tol);
    if (n.pos.startsWith('bottom')) ok.push(Math.abs(n.b - (R.b - m)) <= tol);
    if (n.pos === 'center') ok.push(Math.abs(cy - (R.t + R.b) / 2) <= tol);
    const full = g.narrow && n.pos !== 'center' && Math.abs(n.l - (R.l + m)) <= tol && Math.abs(n.r - (R.r - m)) <= tol;
    if (n.pos.endsWith('left')) ok.push(Math.abs(n.l - (R.l + m)) <= tol);
    else if (n.pos.endsWith('right')) ok.push(Math.abs(n.r - (R.r - m)) <= tol || full);
    else ok.push(Math.abs(cx - (R.l + R.r) / 2) <= tol || full);
    return inside && ok.every(Boolean);
  };
  const show = (cfg) => E((c) => window.editor.notify(c), { persistent: true, enter: 'none', exit: 'none', title: 'Notification', message: 'Measured on the screen', ...cfg });
  const clear = async () => { await E(() => window.editor.clearNotifications()); await wait(250); };
  /** every position, one at a time: placed where it belongs, entirely inside the visible screen */
  const allPositions = async (label) => {
    const bad = [];
    for (const p of POS) {
      await clear(); await show({ position: p }); await wait(200);
      const g = await geo(), n = g.notes[0];
      if (!n || !placed(g, n)) bad.push({ p, n: n && [n.l, n.t, n.r, n.b].map(Math.round), R: [g.R.l, g.R.t, g.R.r, g.R.b].map(Math.round), s: g.s });
    }
    await clear();
    check(`POSITIONS · ${label}: all seven positions where they belong (edge distance × scale) and entirely inside the visible screen`, bad.length === 0, JSON.stringify(bad));
  };
  const setView = async (w, h) => { await page.setViewportSize({ width: w, height: h }); await wait(700); };

  // ================================================================ POSITIONS
  await allPositions('dashboard view, desktop 1920 × 1080');
  await setView(1024, 768); await allPositions('dashboard view, tablet 1024 × 768');
  await setView(390, 844); await allPositions('dashboard view, mobile 390 × 844 (narrow: one full-width stack per edge)');
  await setView(1500, 900);
  await E(() => window.editor.setViewport(390, 844, 'Mobile')); await E(() => window.editor.setZoom(0.5)); await wait(600);
  await allPositions('Responsive Preview 390 × 844 at 50 % (anchored to the LOGICAL screen)');
  await E(() => window.editor.setZoom('fit')); await wait(600);
  await allPositions('Responsive Preview 390 × 844 at Fit');
  await E(() => window.editor.setZoom(1)); await wait(400); await E(() => window.scrollTo(0, 420)); await wait(500);
  await allPositions('Responsive Preview 390 × 844 at 100 %, editor page scrolled (the screen partly above the window)');
  await E(() => window.scrollTo(0, 0)); await wait(300);
  await E(() => window.editor.enterFullScreen('preview')); await wait(800);
  await allPositions('full-screen test mode (390 × 844 scaled to the display)');
  await E(() => window.editor.exitFullScreen()); await wait(600);
  await E(() => window.editor.enterFullScreen('screen')); await wait(800);
  await allPositions('full-screen test mode (this browser window)');
  await E(() => window.editor.exitFullScreen()); await wait(600);

  // resizing the window with notifications on screen: they follow the screen
  await E(() => window.editor.setViewport(1280, 800, 'Desktop')); await E(() => window.editor.setZoom('fit')); await wait(600);
  for (const p of ['top-right', 'bottom-left', 'center']) await show({ position: p });
  await wait(200);
  await setView(1200, 760); await E(() => window.dispatchEvent(new Event('resize'))); await wait(700);
  const rg = await geo();
  check('RESIZE: after the window is resized, the notifications already on screen are still where they belong', rg.notes.length === 3 && rg.notes.every((n) => placed(rg, n)), JSON.stringify(rg.notes.map((n) => [n.pos, Math.round(n.l), Math.round(n.t)])));
  // scrolling the DASHBOARD (inside the screen) never moves a screen-anchored notification
  const before = (await geo()).notes.map((n) => [Math.round(n.l), Math.round(n.t)]).join();
  await E(() => { const f = document.querySelector('.ed-frame'); f.scrollTop = 500; f.dispatchEvent(new Event('scroll')); }); await wait(400);
  const after = (await geo()).notes.map((n) => [Math.round(n.l), Math.round(n.t)]).join();
  check('SCROLL: scrolling the dashboard inside the screen leaves the notifications exactly where they are', before === after && !!before, `${before} → ${after}`);
  await E(() => { document.querySelector('.ed-frame').scrollTop = 0; }); await clear();

  // ================================================================ STACKING
  await setView(1500, 900); await E(() => window.editor.setViewport(1280, 800, 'Desktop')); await wait(600);
  for (let i = 0; i < 3; i++) await show({ position: 'top-right', title: `Stack ${i + 1}` });
  await wait(200);
  let sg = await geo();
  const st = sg.notes.filter((n) => n.pos === 'top-right').sort((a, b) => a.t - b.t);
  const gaps = st.slice(1).map((n, i) => n.t - st[i].b);
  const newestFirst = await E(() => [...document.querySelectorAll('.mscr--notes .mnote-stack--top-right .mnote')].map((n) => n.querySelector('.mnote__title').textContent).join());
  check('STACKING: three top-right notifications — newest nearest the edge, 10 px apart (× scale), none overlapping, all where they belong',
    st.length === 3 && newestFirst === 'Stack 3,Stack 2,Stack 1' && gaps.every((g) => Math.abs(g - 10 * sg.s) <= 1.2) && st.every((n) => placed(sg, n) || n !== st[0]) && placed(sg, st[0]), JSON.stringify({ newestFirst, gaps }));
  await page.click('.mscr--notes .mnote-stack--top-right .mnote:first-child .mnote__close'); await wait(500);
  sg = await geo();
  check('…dismissing the newest: the others move up to the edge', sg.notes.length === 2 && placed(sg, sg.notes.sort((a, b) => a.t - b.t)[0]));
  await clear();
  await E(() => window.editor.setViewport(390, 520, 'Small')); await wait(600);
  for (let i = 0; i < 4; i++) await show({ position: 'bottom-right', title: `Tall ${i + 1}`, design: { height: 150 } });
  await wait(300);
  sg = await geo();
  const kept = await E(() => [...document.querySelectorAll('.mscr--notes .mnote-stack--bottom-right .mnote:not(.is-leaving)')].filter((n) => n.style.display !== 'none').map((n) => n.querySelector('.mnote__title').textContent));
  check('STACKING respects the screen: four 150 px notifications on a 520 px tall screen — only those that fit stay (the newest always), all inside it',
    kept.length >= 1 && kept.length < 4 && kept[kept.length - 1] === 'Tall 4' && sg.notes.every((n) => n.t >= sg.R.t - 0.5 && n.b <= sg.R.b + 0.5), JSON.stringify(kept));
  await clear();

  // ================================================================ EXTREME
  await show({ position: 'top-left', title: 'Huge', message: 'A long message. '.repeat(80), design: { width: 1600, height: 1200 } }); await wait(300);
  sg = await geo();
  const xn = sg.notes[0];
  check('EXTREME: a 1600 × 1200 notification on a 390 × 520 screen stays entirely inside it, at its edge distance, and its content scrolls inside',
    xn && placed(sg, xn) && xn.scroll && xn.w <= sg.R.r - sg.R.l && xn.h <= sg.R.b - sg.R.t, JSON.stringify(xn));
  await clear();

  // ================================================================ DESIGNER (real UI)
  await E(() => window.editor.setViewport(1280, 800, 'Desktop')); await wait(500);
  await E(() => window.editor.setEditing(true)); await wait(400);
  const D = 'dialog[open].ed-dlg--note', PV = `${D} [data-k=note-preview]`, PN = `${PV} .mnote:not(.is-leaving)`;
  const F = (k) => `${D} .ef-field[data-key="${k}"]`;
  const set = async (key, kind, v) => {
    // the sections are the widget configuration's collapsible sections: open the field's own, as a user does
    await E((s) => { const d = document.querySelector(s)?.closest('details'); if (d && !d.open) d.querySelector(':scope > summary').click(); }, F(key));
    if (kind === 'select') await page.selectOption(`${F(key)} select`, v);
    else if (kind === 'range') { await page.fill(`${F(key)} input.ef-range__n`, String(v)); await page.press(`${F(key)} input.ef-range__n`, 'Enter'); }
    else if (kind === 'auto') await page.click(`${F(key)} [data-k=range-auto]`);
    else if (kind === 'switch') await page.click(`${F(key)} button[role=switch]`);
    else if (kind === 'color') await page.click(`${F(key)} .ef-icon[data-value="${v}"]`);
    else if (kind === 'hex') await E(({ s, v }) => { const p = document.querySelector(s); p.value = v; p.dispatchEvent(new Event('input', { bubbles: true })); }, { s: `${F(key)} [data-k=color-pick]`, v });
    else if (kind === 'corner') await E(({ s, v }) => { const r = document.querySelector(s); r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); }, { s: `${F(key)} input[data-corner="tl"][data-part="r"]`, v });
    else if (kind === 'art') await page.click(`${F(key)} .ef-art__t[data-value="${v}"]`);
    else await page.fill(`${F(key)} :is(input, textarea)`, String(v));
    await wait(250);
  };
  const pvPx = async () => { const el = await page.$(PV); return el ? el.screenshot() : null; };
  const pvStyle = () => E((PN) => { const n = document.querySelector(PN); if (!n) return null; const cs = getComputedStyle(n), t = n.querySelector('.mnote__title'), m = n.querySelector('.mnote__msg'), i = n.querySelector('.mnote__icon');
    return { w: Math.round(n.getBoundingClientRect().width), h: Math.round(n.getBoundingClientRect().height), bg: cs.backgroundColor, bgi: cs.backgroundImage, radius: cs.borderTopLeftRadius, opacity: cs.opacity,
      title: { color: getComputedStyle(t).color, size: getComputedStyle(t).fontSize, weight: getComputedStyle(t).fontWeight, align: getComputedStyle(n.querySelector('.mnote__txt')).textAlign, opacity: getComputedStyle(t).opacity },
      msg: m && { color: getComputedStyle(m).color, size: getComputedStyle(m).fontSize }, icon: i && { w: Math.round(i.getBoundingClientRect().width), color: getComputedStyle(i).color },
      lead: Math.round(n.querySelector('.mnote__main').firstElementChild.getBoundingClientRect().left - n.querySelector('.mnote__main').getBoundingClientRect().left),
      ring: getComputedStyle(n, '::after').boxShadow, shadow: cs.boxShadow, layout: n.dataset.layout, media: !!n.querySelector('.mnote__media, .mnote__bg'), pad: getComputedStyle(n.querySelector('.mnote__main')).paddingTop }; }, PN);

  await page.click('.ed-btn--notes'); await wait(300);
  await page.click('[data-k=add-template]'); await page.waitForSelector(D); await wait(600);
  await set('message', 'text', 'The front door has been open for 5 minutes');
  if (SHOTS) await shot('designer-0-standard.png', D);
  const st0 = await pvStyle();
  // each property through the UI: the PREVIEW (in the dialog — the same renderer) changes, pixels and style
  const steps = [
    ['design.width', 'range', 450, 'width 450 px', (s) => s.w === 450],
    ['design.height', 'range', 140, 'height 140 px', (s) => s.h === 140],
    ['design.height', 'auto', null, 'height Auto again', (s) => s.h < 140],
    ['design.padding', 'range', 24, 'padding 24 px', (s) => s.pad === '24px'],
    ['message', 'text', 'Door open', 'a short message', () => true],
    ['design.align', 'select', 'center', 'content centred (it really moves: the free space is no longer taken by the close button)', (s) => s.lead > 60],
    ['design.bgColor', 'color', 'danger', 'background red (danger)', (s) => /rgb\(/.test(s.bg) && s.bg !== st0.bg],
    ['design.bgAlpha', 'range', 50, 'background 50 % — the text stays opaque', (s) => /rgba?\(.*0\.5\)|\/ 0\.5\)/.test(s.bg) && s.opacity === '1' && s.title.opacity === '1' && !/, 0\.\d+\)$/.test(s.title.color)],
    ['design.borderColor', 'color', 'warning', 'border colour', () => true],
    ['design.borderWidth', 'range', 4, 'border 4 px', (s) => /4px/.test(s.ring)],
    ['design.shadow', 'select', 'none', 'no shadow', (s) => !/rgba\(0, 0, 0, 0\.85\)/.test(s.shadow)],
    ['design.corners', 'select', 'square', 'square corners', (s) => s.radius === '0px'],
    ['design.corners', 'select', 'full', 'fully rounded', (s) => parseFloat(s.radius) >= 100],
    ['design.corners', 'select', 'custom', 'custom radius (18)', (s) => s.radius === '18px'],
    ['design.radii', 'corner', 30, 'top-left corner 30 px (the shared corner control)', (s) => s.radius === '30px'],
    ['design.titleColor', 'color', 'success', 'title colour', (s) => s.title.color !== st0.title.color],
    ['design.titleSize', 'range', 22, 'title 22 px', (s) => s.title.size === '22px'],
    ['design.titleWeight', 'select', '800', 'title extra bold', (s) => s.title.weight === '800'],
    ['design.msgColor', 'color', 'info', 'message colour', (s) => s.msg.color !== st0.msg.color],
    ['design.msgSize', 'range', 16, 'message 16 px', (s) => s.msg.size === '16px'],
    ['design.textAlign', 'select', 'right', 'text right', (s) => s.title.align === 'right'],
    ['design.iconSize', 'range', 36, 'icon 36 px', (s) => s.icon && s.icon.w === 52],
    ['design.iconColor', 'color', 'purple', 'icon colour', (s) => s.icon && s.icon.color !== st0.icon.color],
    ['design.iconShow', 'switch', null, 'icon hidden', (s) => !s.icon],
    ['design.margin', 'range', 40, 'edge distance 40 px', () => true],
  ];
  const res = [];
  let prev = await pvPx();
  for (const [k, kind, v, what, ok] of steps) {
    await set(k, kind, v);
    const px = await pvPx(), s = await pvStyle();
    res.push({ what, pixels: !!(px && prev && Buffer.compare(px, prev) !== 0), style: !!(s && ok(s)) });
    prev = px;
  }
  if (SHOTS) await shot('designer-1-edited.png', D);
  const badSteps = res.filter((r) => !r.pixels || !r.style);
  check(`DESIGNER — ${res.length} property changes made in the template dialog, EACH immediately redrawn in its live preview (pixels and style): ${res.map((r) => r.what).join(' · ')}`, badSteps.length === 0, JSON.stringify(badSteps));
  // the preview IS the real notification renderer, positioned by the real stack layout of the current screen (Actual size follows the
  // notification, so a position change shows in the Whole screen view)
  await page.selectOption(`${D} [data-k=note-pv-view]`, 'screen'); await wait(300);
  const wsBefore = await pvPx();
  await set('position', 'select', 'bottom-center');
  const wsMoved = !!(await pvPx()) && Buffer.compare(await pvPx(), wsBefore) !== 0;
  const pvPlace = await E((PV) => { const box = document.querySelector(PV), lay = box.querySelector('.ed-notepv__screen'), n = box.querySelector('.mnote:not(.is-leaving)'); const b = lay.getBoundingClientRect(), r = n.getBoundingClientRect(), s = b.width / lay.offsetWidth;
    return { s, bottom: Math.round((b.bottom - r.bottom) / s), cx: Math.round(((r.left + r.right) / 2 - b.left) / s), w: lay.offsetWidth, h: lay.offsetHeight, nw: Math.round(r.width / s) }; }, PV);
  check('LIVE PREVIEW · Whole screen: Position Bottom centre redraws it; the dashboard\'s screen (1280 × 800, scaled) with the notification at Bottom centre, 40 px from the edge, 450 px wide — the real layout',
    wsMoved && pvPlace.w === 1280 && pvPlace.h === 800 && Math.abs(pvPlace.bottom - 40) <= 1 && Math.abs(pvPlace.cx - 640) <= 1 && pvPlace.nw === 450, JSON.stringify(pvPlace));
  if (SHOTS) await shot('designer-2-whole-screen.png', D);
  await page.selectOption(`${D} [data-k=note-pv-view]`, 'actual'); await wait(300);

  // TEST ON SCREEN uses the CURRENT (unsaved) values: same look (style) and the configured position on the real screen
  await page.click(`${D} [data-k=test-draft]`); await wait(500);
  const real = await E(() => { const n = [...document.querySelectorAll('.mscr--notes .mnote:not(.is-leaving)')].pop(); return n && { style: n.getAttribute('style'), pos: n.dataset.position }; });
  const pvS = await E((PN) => document.querySelector(PN).getAttribute('style'), PN);
  const tg = await geo();
  check('TEST ON SCREEN: the real screen shows the unsaved design (the same style as the preview) at Bottom centre, 40 px from the edge',
    real && real.style === pvS && real.pos === 'bottom-center' && tg.notes.some((n) => n.pos === 'bottom-center' && placed(tg, n)), JSON.stringify({ real, pvS }));
  await page.click('[data-k=peek-back]'); await wait(300); await clear();

  // CANCEL discards
  await page.click(`${D} [data-k=def-cancel]`); await wait(400);
  const afterCancel = await E(() => window.editor.getModel().notifications.templates[0].config);
  check('CANCEL: nothing of the edited design is stored (the template keeps its saved, Standard configuration)', !afterCancel.design && afterCancel.position === 'top-right', JSON.stringify(afterCancel));

  // PRESETS + overrides: Glass → orange background → 35 % → square corners → Apply
  await page.click(`[data-template] [data-k=edit]`); await page.waitForSelector(D); await wait(500);
  const presetPx = [];
  for (const p of ['minimal', 'glass', 'banner', 'image', 'hero', 'standard']) { await set('design.preset', 'select', p); presetPx.push([p, await pvPx(), await pvStyle()]); }
  const distinct = new Set(presetPx.map(([, px]) => px.toString('base64'))).size;
  check('PRESETS: Standard · Minimal · Glass · Banner · Image (side image) · Hero (image above) — each fills the editor and redraws the preview differently (Standard again: the Standard look with the chosen picture as its thumbnail)',
    distinct === 6 && presetPx.find(([p]) => p === 'image')[2].layout === 'left' && presetPx.find(([p]) => p === 'hero')[2].layout === 'hero' && presetPx.find(([p]) => p === 'standard')[2].layout === 'thumb' && !(presetPx.find(([p]) => p === 'standard')[2].media), String(distinct));
  await set('design.preset', 'select', 'glass');
  const glassF = await E((F) => document.querySelector(F).querySelector('input.ef-range__n').value, F('design.bgAlpha'));
  await set('design.bgColor', 'hex', '#ff7a1a'); await set('design.bgAlpha', 'range', 35); await set('design.corners', 'select', 'square');
  const ov = await pvStyle();
  if (SHOTS) await shot('designer-3-glass-override.png', D);
  await page.click(`${D} [data-k=apply-def]`); await wait(500);
  const saved = await E(() => window.editor.getModel().notifications.templates[0].config.design);
  check('PRESET OVERRIDE: Glass fills the editor (background 45 %), then orange · 35 % · square corners override it — preview and stored design agree',
    glassF === '45' && saved && saved.preset === 'glass' && saved.bgColor === '#ff7a1a' && saved.bgAlpha === 35 && saved.corners === 'square' && saved.blur === 14 && ov.radius === '0px' && /0\.35\)/.test(ov.bg), JSON.stringify({ glassF, saved, bg: ov.bg }));

  // IMAGE LAYOUTS (through the UI) + the secure upload
  await page.click(`[data-template] [data-k=edit]`); await page.waitForSelector(D); await wait(500);
  await set('design.preset', 'select', 'standard'); await set('image', 'art', 'assets/img/media/artwork-dusk.jpg');
  const lay = {};
  for (const l of ['thumb', 'background', 'hero', 'left', 'right', 'none']) {
    await set('design.imageLayout', 'select', l);
    lay[l] = await E((PN) => { const n = document.querySelector(PN), r = n.getBoundingClientRect(), m = n.querySelector('.mnote__media, .mnote__bg'), t = n.querySelector('.mnote__txt').getBoundingClientRect(), img = n.querySelector('img');
      const q = m && m.getBoundingClientRect(); return { layout: n.dataset.layout, h: Math.round(r.height), img: !!img, media: q && { l: Math.round(q.left - r.left), t: Math.round(q.top - r.top), w: Math.round(q.width), h: Math.round(q.height) }, txtL: Math.round(t.left - r.left), txtT: Math.round(t.top - r.top), w: Math.round(r.width) }; }, PN);
    if (SHOTS) await shot(`image-${l}.png`, PV);
  }
  check('IMAGE · Background: the picture covers the whole notification and does not set its height (Auto height stays the text\'s)',
    lay.background.media && lay.background.media.w === lay.background.w && lay.background.media.h === lay.background.h && Math.abs(lay.background.h - lay.none.h) <= 1, JSON.stringify({ bg: lay.background, none: lay.none }));
  check('IMAGE · Hero: across the top (full width, 120 px), the text below it', lay.hero.media && lay.hero.media.t === 0 && lay.hero.media.w === lay.hero.w && lay.hero.media.h === 120 && lay.hero.txtT >= 120, JSON.stringify(lay.hero));
  check('IMAGE · Left / Right: beside the title and message (96 px wide)', lay.left.media && lay.left.media.l === 0 && lay.left.media.w === 96 && lay.left.txtL > 96 && lay.right.media && lay.right.media.l === lay.right.w - 96 && lay.right.txtL < lay.right.w - 96, JSON.stringify({ l: lay.left, r: lay.right }));
  check('IMAGE · None: text only (no picture) · Thumbnail: the Standard small picture', !lay.none.img && lay.thumb.img && !lay.thumb.media, JSON.stringify({ n: lay.none, t: lay.thumb }));
  await set('design.imageLayout', 'select', 'hero'); await set('design.heroHeight', 'range', 200);
  const hh = await E((PN) => Math.round(document.querySelector(`${PN} .mnote__media`).getBoundingClientRect().height), PN);
  await set('design.imageLayout', 'select', 'left'); await set('design.sideWidth', 'range', 120); await set('design.imageFit', 'select', 'contain'); await set('design.imageOpacity', 'range', 60);
  const side = await E((PN) => { const m = document.querySelector(`${PN} .mnote__media`), i = m.querySelector('img'); return { w: Math.round(m.getBoundingClientRect().width), fit: getComputedStyle(i).objectFit, op: getComputedStyle(i).opacity }; }, PN);
  await set('design.imageLayout', 'select', 'background'); await set('design.overlayColor', 'color', 'accent'); await set('design.overlayAlpha', 'range', 70);
  const ovl = await E((PN) => getComputedStyle(document.querySelector(`${PN} .mnote__ov`)).backgroundColor, PN);
  check('IMAGE settings: hero height 200 · side width 120 · fit Contain · image opacity 60 % (the picture only) · overlay colour at 70 %',
    hh === 200 && side.w === 120 && side.fit === 'contain' && side.op === '0.6' && /0\.7\)/.test(ovl), JSON.stringify({ hh, side, ovl }));
  // upload: the protected IniqDash user assets (never a path or an embedded image in the configuration)
  const upPath = path.join(fs.mkdtempSync('/tmp/iqnote-'), 'note.jpg'); fs.copyFileSync(new URL('../assets/img/media/artwork-dusk.jpg', import.meta.url), upPath);
  await page.setInputFiles(`${F('image')} input[type=file]`, upPath); await wait(1500);
  const up = await E((PN) => { const i = document.querySelector(`${PN} img`); return i && { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 }; }, PN);
  check('UPLOAD: an uploaded image is stored as the protected asset reference (api/asset.php?id=…) and shown by the notification', up && /^api\/asset\.php\?id=[0-9a-f]{32}$/.test(up.src) && up.ok, JSON.stringify(up));
  await page.click(`${D} [data-k=apply-def]`); await wait(500);
  const cfgImg = await E(() => window.editor.getModel().notifications.templates[0].config);
  check('…stored: the reference only — no data: URL, no server path', /^api\/asset\.php\?id=/.test(cfgImg.image) && !JSON.stringify(cfgImg).includes('data:'), cfgImg.image);

  // SAVE + RELOAD
  const saveOk = await E(() => window.editor.save()); await wait(800);
  await page.reload(); await page.waitForTimeout(1500);
  const re = await E(() => window.editor.getModel().notifications.templates[0].config);
  await E(() => window.editor.setEditing(true)); await wait(400);
  await page.click('.ed-btn--notes'); await wait(300); await page.click(`[data-template] [data-k=edit]`); await page.waitForSelector(D); await wait(600);
  const reUi = await E((D) => ({ layout: document.querySelector(`${D} .ef-field[data-key="design.imageLayout"] select`).value, alpha: document.querySelector(`${D} .ef-field[data-key="design.overlayAlpha"] input.ef-range__n`).value,
    pv: document.querySelector(`${D} [data-k=note-preview] .mnote`)?.dataset.layout }), D);
  check('SAVE + RELOAD: the design is persisted on the server; reopened, the editor and its preview show the saved values',
    saveOk && re.design && re.design.imageLayout === 'background' && re.design.overlayAlpha === 70 && re.design.heroHeight === 200 && reUi.layout === 'background' && reUi.alpha === '70' && reUi.pv === 'background', JSON.stringify({ d: re.design, reUi }));
  await page.click(`${D} [data-k=def-cancel]`); await wait(300); await page.keyboard.press('Escape'); await wait(300);

  // OLDER TEMPLATE (no design): renders as the Standard notification — no design, the Standard values
  await clear();
  await show({ position: 'top-right', title: 'Legacy', message: 'An older template', tone: 'warning' }); await wait(200);
  const leg = await E(() => { const n = document.querySelector('.mscr--notes .mnote'); const cs = getComputedStyle(n); return { designed: n.dataset.designed || null, style: n.getAttribute('style'), w: Math.round(n.getBoundingClientRect().width / (document.querySelector('.mscr--notes').getBoundingClientRect().width / document.querySelector('.mscr--notes .mscr__layer').offsetWidth)), r: cs.borderTopLeftRadius, pad: getComputedStyle(n.querySelector('.mnote__main')).padding, ts: getComputedStyle(n.querySelector('.mnote__title')).fontSize }; });
  check('OLDER TEMPLATE: a notification without a design draws the Standard look (360 px, 12 / 10 / 12 / 14 padding, 14 px title, the theme radius)',
    !leg.designed && !leg.style && leg.w === 360 && leg.pad === '12px 10px 12px 14px' && leg.ts === '14px', JSON.stringify(leg));
  await clear();

  // ================================================================ TEST A–G (Test on screen with designed notifications)
  const openTpl = async () => { await page.click('.ed-btn--notes'); await wait(300); await page.click(`[data-template] [data-k=edit]`); await page.waitForSelector(D); await wait(500); };
  const testOnScreen = async () => { await page.click(`${D} [data-k=test-draft]`); await wait(500); const g = await geo(); await page.click('[data-k=peek-back]'); await wait(250); await page.click(`${D} [data-k=def-cancel]`); await wait(300); await page.keyboard.press('Escape'); await wait(200); return g; };
  await E(() => window.editor.setEditing(false)); await wait(300);
  // A — desktop 1920 × 1080: top right, custom width, background image
  await setView(1920, 1080); await E(() => window.editor.setEditing(true)); await wait(500);
  await E(() => window.editor.setViewport(1920, 1080, 'Desktop HD')); await E(() => window.editor.setZoom('fit')); await wait(500);
  await openTpl(); await set('position', 'select', 'top-right'); await set('design.width', 'range', 520); await set('design.imageLayout', 'select', 'background');
  let g = await testOnScreen(); let n = g.notes[0];
  check('TEST A · 1920 × 1080: a top-right notification, 520 px wide with a background image — entirely visible, aligned top right', n && placed(g, n) && Math.abs(n.w / g.s - 520) <= 1, JSON.stringify({ n, s: g.s }));
  if (SHOTS) await shot('test-a-desktop.png');
  await clear();
  // B — tablet 1024 × 768: bottom centre
  await setView(1024, 768); await E(() => window.editor.setViewport(1024, 768, 'Tablet')); await wait(500);
  await openTpl(); await set('position', 'select', 'bottom-center');
  g = await testOnScreen(); n = g.notes[0];
  check('TEST B · 1024 × 768: a bottom-centre notification where it belongs', n && n.pos === 'bottom-center' && placed(g, n), JSON.stringify(n));
  if (SHOTS) await shot('test-b-tablet.png');
  await clear();
  // C — mobile 390 × 844: left image, custom dimensions — designed in the dialog (Apply), shown on the phone's own screen (dashboard view)
  await openTpl(); await set('design.imageLayout', 'select', 'left'); await set('design.width', 'range', 340); await set('design.height', 'range', 150); await set('position', 'select', 'top-left');
  await page.click(`${D} [data-k=apply-def]`); await wait(400); await page.keyboard.press('Escape'); await wait(200);
  await setView(390, 844); await E(() => window.editor.currentScreen()); await E(() => window.editor.setEditing(false)); await wait(700);
  await show({ ...(await E(() => window.editor.getModel().notifications.templates[0].config)) }); await wait(300);
  g = await geo(); n = g.notes[0];
  check('TEST C · 390 × 844 (the phone\'s own screen, dashboard view): a left-image notification, 340 × 150 — entirely visible',
    n && placed(g, n) && n.l >= 0 && n.r <= 390 && n.t >= 0 && n.b <= 844 && Math.abs(n.h / g.s - 150) <= 1, JSON.stringify({ n, s: g.s }));
  if (SHOTS) await shot('test-c-mobile.png');
  await clear(); await E(() => window.editor.setEditing(true)); await wait(400);
  // D — Responsive Preview Studio, scaled
  await setView(1500, 900); await E(() => window.editor.setViewport(390, 844, 'iPhone')); await E(() => window.editor.setZoom(0.5)); await wait(600);
  await openTpl(); await set('position', 'select', 'bottom-right'); await set('design.margin', 'range', 24);
  g = await testOnScreen(); n = g.notes[0];
  check('TEST D · Responsive Preview 390 × 844 at 50 %: anchored to the logical screen (24 px × 0.5 from its edges) — no offset from the scaling', n && Math.abs(g.s - 0.5) < 0.01 && placed(g, n), JSON.stringify({ n, s: g.s }));
  if (SHOTS) await shot('test-d-scaled.png');
  await clear();
  // E — full-screen test mode (the template as saved: Test from the list uses the same renderer)
  const tplCfg = await E(() => window.editor.getModel().notifications.templates[0].config);
  await E(() => window.editor.enterFullScreen('preview')); await wait(800);
  await show({ ...tplCfg, position: 'top-center' }); await wait(300);
  g = await geo(); n = g.notes[0];
  check('TEST E · full-screen test mode: the designed notification at Top centre, where it belongs', n && placed(g, n), JSON.stringify({ n, s: g.s }));
  if (SHOTS) await shot('test-e-fullscreen.png');
  await clear(); await E(() => window.editor.exitFullScreen()); await wait(600);
  // F — several at once: stacking, spacing, visibility, dismissal
  await E(() => window.editor.setViewport(1280, 800, 'Desktop')); await E(() => window.editor.setZoom('fit')); await wait(500);
  for (const p of ['top-right', 'top-right', 'bottom-left', 'center', 'top-center']) await show({ ...tplCfg, position: p, title: `Several ${p}` });
  await wait(300); g = await geo();
  const overlap = g.notes.some((a, i) => g.notes.some((b, j) => i < j && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1));
  check('TEST F · five notifications (two top right, bottom left, centre, top centre): all visible, none overlapping', g.notes.length === 5 && !overlap && g.notes.every((x) => x.l >= g.R.l - 0.5 && x.r <= g.R.r + 0.5 && x.t >= g.R.t - 0.5 && x.b <= g.R.b + 0.5), JSON.stringify(g.notes.map((x) => [x.pos, Math.round(x.l), Math.round(x.t), Math.round(x.r), Math.round(x.b)])));
  if (SHOTS) await shot('test-f-several.png');
  await E(() => document.querySelector('.mscr--notes .mnote-stack--center .mnote__close').click()); await wait(400);
  check('…a close button dismisses its notification only', (await geo()).notes.length === 4);
  await clear();
  // G — extreme dimensions
  await openTpl(); await set('design.width', 'range', 1600); await set('design.height', 'range', 1200); await set('message', 'text', 'Long text. '.repeat(20)); await set('position', 'select', 'center');
  g = await testOnScreen(); n = g.notes[0];
  check('TEST G · 1600 × 1200 on a 1280 × 800 screen: constrained to the visible screen (edge distance kept) — never escaping it', n && placed(g, n) && n.w / g.s <= 1280 - 24 + 1 && n.h / g.s <= 800 - 24 + 1, JSON.stringify(n));
  if (SHOTS) await shot('test-g-extreme.png');
  await clear();

  check('NO Home Assistant service call from any of it', services() === n0, String(services() - n0));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
