/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// The shared IMAGE / ARTWORK PICKER (registry F.artwork → form field type 'artwork'): one visual selector None · built-in artworks ·
// Upload (the secure IniqDash User Assets) — Change / Remove for an upload; None is literally no image; an optional fallback icon
// (the shared MDI picker, the shared icon colours and icon animation) — used by Room and Light; no internal path ever shown.
// Real PHP server + fake HA.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const PEND = 'widgets/default/light/assets/pendant-dome.png', ROOM = 'custom.room-scene', ROOMPIC = 'widgets/custom/room-scene/assets/demo-living-room.svg';
const PATHY = /widgets\/|assets\/|api\/asset|\.png|\.svg|\.jpg|asset\.php|[0-9a-f]{32}/;
let L, B;
try {
  L = await live();
  L.setEntity('light.a', 'on', { name: 'Ceiling', f: 0, scm: ['brightness'], br: 184, cm: 'brightness' });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  // a configuration dialog (the real one) with its live preview
  const open = async (type, cfg) => {
    await E(({ type, cfg }) => { document.querySelectorAll('dialog').forEach((d) => d.remove()); window.__applied = null;
      window.MaisonConfigure.open({ mount: document.body, mode: 'edit', type, config: window.MaisonRegistry.fullConfig(type, cfg), size: { w: 4, h: 6 }, onApply: (x) => { window.__applied = x.config; }, onCancel: () => {} }); }, { type, cfg });
    await page.waitForTimeout(700);
    await E(() => document.querySelectorAll('dialog[open] details').forEach((d) => { d.open = true; }));
  };
  const field = (k) => `dialog[open] .ef-field[data-key="${k}"]`;
  const shown = (k) => E((s) => { const x = document.querySelector(s); return !!x && !x.hidden && !!x.offsetParent; }, field(k));
  const state = () => E(() => {
    const t = [...document.querySelectorAll('dialog[open] .ef-field[data-key="image"] .ef-art__t')].filter((b) => !b.hidden);
    const pv = document.querySelector('dialog[open] .ecfg-pv__box > *'), w = pv && (pv.matches('.lw, .iq-room') ? pv : pv.querySelector('.lw, .iq-room'));
    return { tiles: t.map((b) => `${b.dataset.k}:${b.getAttribute('aria-pressed')}:${b.querySelector('.ef-art__l').textContent}`), text: document.querySelector('dialog[open] .ef-field[data-key="image"]').innerText,
      visual: w && w.dataset.visual, acts: !document.querySelector('dialog[open] .ef-field[data-key="image"] .ef-art__acts').hidden };
  });

  // ---- LIGHT: the picker, built-in selected (an older configuration's raw built-in path)
  await open('light', { name: 'Dining', entity: 'light.a', image: PEND });
  let s = await state();
  check('the shared picker renders: None · Pendant · Dining room · Upload', s.tiles.join() === 'art-none:false:None,art-builtin:true:Pendant,art-builtin:false:Dining room,art-upload:null:Upload', JSON.stringify(s.tiles));
  check('an older light\'s raw built-in path shows as "Pendant" — no path anywhere in the picker', !PATHY.test(s.text) && s.visual === 'fixture', s.text);
  check('built-in: no fallback-icon fields', !(await shown('fallbackIcon.icon')));
  check('tiles are buttons with names and a pressed state (not colour only: a ✓ badge)', await E(() => [...document.querySelectorAll('dialog[open] .ef-art__t:not([hidden])')].every((b) => b.tagName === 'BUTTON' && b.getAttribute('aria-label'))
    && getComputedStyle(document.querySelector('dialog[open] .ef-art__t[aria-pressed="true"] .ef-art__ok')).display !== 'none'));
  // ---- None: literally no image (the preview drops the lamp at once), the fallback icon is offered
  await page.click('dialog[open] .ef-field[data-key="image"] [data-k=art-none]'); await page.waitForTimeout(250);
  s = await state();
  check('None: the pendant disappears from the live preview immediately', s.visual === 'none' && s.tiles[0] === 'art-none:true:None', JSON.stringify(s));
  check('None offers the fallback icon (only the icon: no colour / animation yet)', (await shown('fallbackIcon.icon')) && !(await shown('fallbackIcon.color')) && !(await shown('fallbackIcon.animation')));
  // ---- the fallback icon: the shared searchable MDI picker, colour tokens, the shared animation
  await page.click(`${field('fallbackIcon.icon')} [data-k=icon-field]`); await page.fill('dialog[open] .iqi__search', 'lightbulb'); await page.waitForTimeout(150);
  await page.click('dialog[open] .iqi__opt[data-icon="mdi:lightbulb"]'); await page.waitForTimeout(250);
  s = await state();
  check('None + mdi:lightbulb: the icon appears in the preview immediately', s.visual === 'icon' && await E(() => document.querySelector('dialog[open] .ecfg-pv__box .lw__icon').dataset.mdi === 'mdi:lightbulb'));
  check('with an icon: colour and animation are offered, "Animate when" only with an animation', (await shown('fallbackIcon.color')) && (await shown('fallbackIcon.animation')) && !(await shown('fallbackIcon.animateWhen')));
  await page.click(`${field('fallbackIcon.color')} [aria-label="warning"]`); await page.waitForTimeout(200);
  check('icon colour: a design token reaches the preview', await E(() => document.querySelector('dialog[open] .ecfg-pv__box .lw__icon').style.color === 'var(--warning)'));
  await page.selectOption(`${field('fallbackIcon.animation')} select`, 'pulse'); await page.waitForTimeout(250);
  check('Pulse + Entity active (the light is on): the icon pulses (the shared IniqIcons animation)', (await shown('fallbackIcon.animateWhen')) && await E(() => document.querySelector('dialog[open] .ecfg-pv__box .lw__icon').dataset.iqiAnim === 'pulse'));
  await page.click('dialog[open] .ecfg-foot button:has-text("Apply")'); await page.waitForTimeout(250);
  let cfg = await E(() => window.__applied);
  check('stored: image "none" + fallbackIcon { icon, color, animation }', cfg.image === 'none' && JSON.stringify(cfg.fallbackIcon) === JSON.stringify({ icon: 'mdi:lightbulb', color: 'warning', animation: 'pulse' }), JSON.stringify(cfg));
  check('a None light stays None after normalising (never the default pendant)', await E((c) => window.MaisonRegistry.fullConfig('light', c).image === 'none' && window.MaisonRegistry.validateConfig('light', c).length === 0, cfg));
  // no icon: genuinely nothing; colour / animation controls hide
  await open('light', { name: 'Dining', entity: 'light.a', image: 'none', fallbackIcon: { icon: 'mdi:lightbulb' } });
  await page.click(`${field('fallbackIcon.icon')} [data-k=icon-field]`); await page.click('dialog[open] .iqi__opt[data-icon=""]'); await page.waitForTimeout(250);
  s = await state();
  check('None + no icon: no image, no icon; colour / animation hidden', s.visual === 'none' && !(await shown('fallbackIcon.color')) && !(await shown('fallbackIcon.animation')));
  // ---- Upload (the existing secure upload), Change, Remove-from-widget
  await page.setInputFiles('dialog[open] input[data-upload="image"]', 'assets/img/media/artwork-dusk.jpg'); await page.waitForTimeout(1500);
  s = await state();
  check('Upload: the uploaded image joins the Light images, selected, shown as "Uploaded image" — never its address (Upload stays offered)', s.tiles.includes('art-lib:true:Uploaded image') && s.tiles.some((t) => t.startsWith('art-upload')) && s.acts && !PATHY.test(s.text) && s.visual === 'photo', JSON.stringify(s));
  const first = await E(() => document.querySelector('dialog[open] .ecfg-pv__box .lw__photo').getAttribute('src'));
  check('the preview shows the uploaded image (an IniqDash asset reference)', /^api\/asset\.php\?id=[0-9a-f]{32}$/.test(first), first);
  await page.setInputFiles('dialog[open] input[data-upload="image"]', 'assets/img/media/artwork-tide.jpg'); await page.waitForTimeout(1500);
  const second = await E(() => document.querySelector('dialog[open] .ecfg-pv__box .lw__photo').getAttribute('src'));
  check('Change replaces it in one step (no Remove first)', second !== first && /^api\/asset\.php\?id=/.test(second) && (await E(() => !!document.querySelector('dialog[open] .ef-field[data-key="image"] [data-k=art-change]'))));
  await page.click('dialog[open] .ef-field[data-key="image"] [data-k=art-remove]'); await page.waitForTimeout(250);
  s = await state();
  check('Remove: the widget no longer uses the image (None), Upload is offered again', s.visual === 'none' && s.tiles[0] === 'art-none:true:None' && s.tiles.some((t) => t.startsWith('art-upload')) && !s.acts);
  check('Remove never deletes the stored asset (it is still served)', (await E(async (u) => (await fetch(u, { credentials: 'same-origin' })).status, second)) === 200);
  // ---- keyboard: Tab to a tile, Enter selects
  await E(() => document.querySelector('dialog[open] .ef-field[data-key="image"] [data-k=art-builtin]').focus());
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  check('keyboard: a focused tile selects with Enter', (await state()).tiles[1] === 'art-builtin:true:Pendant');

  // ---- LIGHT widgets: None never shows the pendant in any variant; the icon only animates as configured, never when unavailable
  const lights = (x) => E((x) => {
    document.getElementById('aw')?.remove();
    const host = document.createElement('div'); host.id = 'aw'; host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;display:flex;gap:6px';
    ['artwork', 'compact', 'slider', 'image'].forEach((v) => { const b = document.createElement('div'); b.style.cssText = 'width:440px;height:320px;display:grid'; b.append(window.MaisonRegistry.build('light', { name: 'L', entity: 'light.a', variant: v, ...x })); host.append(b); });
    document.body.append(host);
  }, x);
  const lw = () => E(() => [...document.querySelectorAll('#aw .lw')].map((r) => ({ v: r.dataset.visual, art: !!r.querySelector('.lw__art[src]') && !!r.querySelector('.lw__stage').offsetParent, photo: !!r.querySelector('.lw__photo').offsetParent,
    icon: !!r.querySelector('.lw__icon').offsetParent, anim: r.querySelector('.lw__icon').dataset.iqiAnim || '' })));
  await lights({ image: 'none' }); await page.waitForTimeout(500);
  let w = await lw();
  check('Light · None + no icon: no pendant, no picture, no icon in any variant', w.every((x) => x.v === 'none' && !x.art && !x.photo && !x.icon), JSON.stringify(w));
  await lights({ image: 'none', fallbackIcon: { icon: 'mdi:lightbulb' } }); await page.waitForTimeout(800);
  w = await lw();
  check('Light · None + icon: the icon, never the pendant; not animated unless configured', w.every((x) => x.v === 'icon' && !x.art && x.anim === '') && w.filter((x) => x.icon).length >= 3, JSON.stringify(w));
  await lights({ image: 'none', fallbackIcon: { icon: 'mdi:lightbulb', animation: 'pulse', animateWhen: 'always' } }); await page.waitForTimeout(500);
  check('…animated as configured', (await lw()).every((x) => x.anim === 'pulse'));
  L.setEntity('light.a', 'unavailable', { name: 'Ceiling', f: 0, scm: ['brightness'] });
  await page.waitForFunction(() => [...document.querySelectorAll('#aw .lw')].every((r) => r.dataset.lit === 'unavailable'), null, { timeout: 15000 });
  check('…never animated while the light is unavailable (even "Always")', (await lw()).every((x) => x.anim === ''));
  L.setEntity('light.a', 'on', { name: 'Ceiling', f: 0, scm: ['brightness'], br: 184, cm: 'brightness' });
  await lights({ image: PEND }); await page.waitForTimeout(500);
  check('Light · built-in Pendant: the fixture in Standard / Compact / Artwork', (await lw()).filter((x) => x.art).length === 3);
  await E(() => document.getElementById('aw')?.remove());

  // ---- ROOM: the SAME picker; an older Room (no image / the bundled picture) loads unchanged
  await open(ROOM, { name: 'Living Room', image: ROOMPIC });
  s = await state();
  check('Room uses the same shared picker: None · Living room · Upload', s.tiles.join() === 'art-none:false:None,art-builtin:true:Living room,art-upload:null:Upload' && !PATHY.test(s.text), JSON.stringify(s.tiles));
  await page.click('dialog[open] .ef-field[data-key="image"] [data-k=art-none]'); await page.waitForTimeout(250);
  check('Room · None: the default Room picture does not come back (no image in the preview)', (await state()).visual === 'none' && await E(() => !document.querySelector('dialog[open] .ecfg-pv__box .iq-room__img[src]')));
  await page.click(`${field('fallbackIcon.icon')} [data-k=icon-field]`); await page.fill('dialog[open] .iqi__search', 'sofa'); await page.waitForTimeout(150);
  await page.click('dialog[open] .iqi__opt[data-icon="mdi:sofa"]'); await page.waitForTimeout(400);
  check('Room · None + mdi:sofa: the sofa is the visual identity', (await state()).visual === 'icon' && await E(() => document.querySelector('dialog[open] .ecfg-pv__box .iq-room__vicon').dataset.mdi === 'mdi:sofa'));
  await open(ROOM, { name: 'Old room' });
  check('an older Room without a picture: None selected, nothing invented', (await state()).tiles[0] === 'art-none:true:None');
  const rooms = await E((pic) => {
    const out = [];
    ['scene', 'card', 'status', 'minimal'].forEach((v) => [{ image: pic }, { image: 'none' }, { image: 'none', fallbackIcon: { icon: 'mdi:sofa' } }, {}].forEach((x) => {
      const el = window.MaisonRegistry.build('custom.room-scene', { name: 'R', variant: v, ...x }); out.push(`${v}:${(el.matches('.iq-room') ? el : el.querySelector('.iq-room')).dataset.visual}`);
    }));
    return out;
  }, ROOMPIC);
  check('Room · every variant: built-in → image, None → none, None + icon → icon, an older config without one → none', rooms.join() === ['scene', 'card', 'status', 'minimal'].map((v) => `${v}:image,${v}:none,${v}:icon,${v}:none`).join(), rooms.join());
  check('the old Room picture path still validates', await E((pic) => window.MaisonRegistry.validateConfig('custom.room-scene', { name: 'R', image: pic }).length === 0, ROOMPIC));
  check('an address that is not an image is refused', await E(() => window.MaisonRegistry.validateConfig('custom.room-scene', { name: 'R', image: 'javascript:alert(1)' }).length === 1));

  // ---- CONFIGURATOR TAXONOMY: Images = what picture / icon; Appearance = how it is presented (Light and Room alike)
  for (const [type, cfg] of [['light', { name: 'L', entity: 'light.a' }], [ROOM, { name: 'R' }]]) {
    await open(type, cfg);
    const secs = await E(() => Object.fromEntries([...document.querySelectorAll('dialog[open] .ef-group')].filter((g) => !g.hidden).map((g) => [g.dataset.group, [...g.querySelectorAll('.ef-field')].map((f) => f.dataset.key)])));
    const order = Object.keys(secs);
    check(`${type}: the artwork and its fallback icon live in IMAGES, none in APPEARANCE`, secs.images && secs.images.includes('image') && secs.images.includes('fallbackIcon.background') && !secs.appearance.some((k) => /^image$|^fallbackIcon/.test(k)), JSON.stringify(secs));
    check(`${type}: section order follows the taxonomy (… Interactions → Appearance → Images → Visibility)`, order.indexOf('interactions') < order.indexOf('appearance') && order.indexOf('appearance') < order.indexOf('images') && order.indexOf('images') < order.indexOf('visibility'), order.join());
  }
  // ---- ICON BACKGROUND (shared): None · Subtle (default, also for icons saved before the choice) · Accent — live in the preview
  await open('light', { name: 'L', entity: 'light.a', variant: 'compact', image: 'none', fallbackIcon: { icon: 'mdi:lightbulb', color: 'info' } });
  const bg = () => E(() => { const i = document.querySelector('dialog[open] .ecfg-pv__box .lw__icon'), cs = getComputedStyle(i); return { k: i.dataset.iqiBg, bg: cs.backgroundColor, shadow: cs.boxShadow, color: i.style.color }; });
  let b = await bg();
  check('an icon saved without a background: Subtle (the rounded surface it always had)', b.k === 'subtle' && b.bg !== 'rgba(0, 0, 0, 0)' && (await E((s) => document.querySelector(`${s} select`).value, field('fallbackIcon.background'))) === 'subtle', JSON.stringify(b));
  await page.selectOption(`${field('fallbackIcon.background')} select`, 'none'); await page.waitForTimeout(250);
  b = await bg();
  check('Icon background None: the bare icon — no surface, no border (live)', b.k === 'none' && b.bg === 'rgba(0, 0, 0, 0)' && b.shadow === 'none', JSON.stringify(b));
  await page.selectOption(`${field('fallbackIcon.background')} select`, 'accent'); await page.waitForTimeout(250);
  b = await bg();
  check('Icon background Accent: an accent-tinted surface; the icon keeps its own colour', b.k === 'accent' && b.bg !== 'rgba(0, 0, 0, 0)' && b.color === 'var(--info)', JSON.stringify(b));
  await page.selectOption(`${field('fallbackIcon.animation')} select`, 'rotate'); await page.waitForTimeout(250);
  check('with a background only the glyph animates (never the surface)', await E(() => { const i = document.querySelector('dialog[open] .ecfg-pv__box .lw__icon'); return getComputedStyle(i).animationName === 'none' && getComputedStyle(i.querySelector('svg')).animationName === 'iqi-rotate'; }));
  await page.click('dialog[open] .ecfg-foot button:has-text("Apply")'); await page.waitForTimeout(250);
  cfg = await E(() => window.__applied);
  check('stored: background "accent" (allow-listed); Subtle is the default and never stored', cfg.fallbackIcon.background === 'accent' && await E(() => {
    const R = window.MaisonRegistry, F = (fb) => R.fullConfig('light', { name: 'x', image: 'none', fallbackIcon: fb }).fallbackIcon;
    return R.validateConfig('light', { name: 'x', image: 'none', fallbackIcon: { icon: 'mdi:fan', background: 'accent' } }).length === 0 && window.IniqIcons.BACKGROUNDS.join() === 'none,subtle,accent'; }), JSON.stringify(cfg));
  await open('light', { name: 'L', entity: 'light.a', image: 'none', fallbackIcon: { icon: 'mdi:lightbulb', background: 'none' } });
  await page.click(`${field('fallbackIcon.icon')} [data-k=icon-field]`); await page.click('dialog[open] .iqi__opt[data-icon=""]'); await page.waitForTimeout(250);
  check('no icon: colour, background and animation are hidden', !(await shown('fallbackIcon.color')) && !(await shown('fallbackIcon.background')) && !(await shown('fallbackIcon.animation')));
  await page.click('dialog[open] .ef-field[data-key="image"] [data-k=art-builtin]'); await page.waitForTimeout(250);
  check('a built-in artwork: no fallback-icon fields at all', !(await shown('fallbackIcon.icon')) && !(await shown('fallbackIcon.background')));
  const roomBg = await E(() => ['none', 'subtle', 'accent', undefined].map((k) => {
    const el = window.MaisonRegistry.build('custom.room-scene', { name: 'R', variant: 'minimal', image: 'none', fallbackIcon: { icon: 'mdi:sofa', ...(k ? { background: k } : {}) } });
    return (el.matches('.iq-room') ? el : el.querySelector('.iq-room')).querySelector('.iq-room__vicon').dataset.iqiBg;
  }));
  check('Room: the same shared background (none · subtle · accent; absent → subtle)', roomBg.join() === 'none,subtle,accent,subtle', roomBg.join());

  // ---- narrow configurator: the tiles wrap, no horizontal overflow
  await page.setViewportSize({ width: 400, height: 900 });
  await open('light', { name: 'Dining', entity: 'light.a' });
  check('narrow: the picker wraps without horizontal overflow', await E(() => { const f = document.querySelector('dialog[open] .ef-field[data-key="image"]'), r = f.getBoundingClientRect(); return [...f.querySelectorAll('.ef-art__t:not([hidden])')].every((t) => t.getBoundingClientRect().right <= r.right + 1) && f.scrollWidth <= f.clientWidth + 1; }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
