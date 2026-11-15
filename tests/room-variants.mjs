/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ROOM VARIANTS + APPEARANCE: Hero (the original card) · Compact card · Status · Minimal — each with its own Micro / Compact / Normal /
// Large composition for the widget's own size; Information = the owner's lines only (in order, never invented); scenes explicit with
// "+N"; the lit / off / unknown picture in every variant (a treatment never makes OFF look lit); the shared icon animation everywhere;
// semantic Appearance choices (allow-listed, shown per variant, live). Real PHP server + fake HA.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ID = 'custom.room-scene';
const VARIANTS = ['scene', 'card', 'status', 'minimal'];
let L, B;
try {
  L = await live();
  L.setEntity('light.a', 'on', { name: 'Ceiling', f: 0 }); L.setEntity('light.b', 'off', { name: 'Lamp', f: 0 });
  L.setEntity('sensor.t', '21', { name: 'Temperature', unit: '°C', dc: 'temperature' }); L.setEntity('sensor.h', '58', { name: 'Humidity', unit: '%', dc: 'humidity' });
  L.setEntity('fan.f', 'on', { name: 'Fan' }); L.setEntity('sensor.p', '412', { name: 'Power', unit: 'W', dc: 'power' });
  ['relax', 'movie', 'evening', 'all_off', 'night'].forEach((x) => L.setEntity(`scene.${x}`, 'scening', { name: x }));
  B = await liveBrowser(L, { viewport: { width: 1600, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const INFO = [{ id: 'i1', entity: 'sensor.t', value: 'state', label: 'Temperature', icon: 'mdi:thermometer' }, { id: 'i2', entity: 'sensor.h', value: 'state', label: 'Humidity', icon: 'mdi:water-percent' },
    { id: 'i3', entity: 'fan.f', value: 'state', label: 'Fan', icon: 'mdi:fan', animation: 'rotate' }, { id: 'i4', entity: 'sensor.p', value: 'state', label: 'Power', icon: 'mdi:flash' }];
  const SC = [{ label: 'Relax', icon: 'mdi:lightbulb' }, { label: 'Movie', icon: 'mdi:movie-open' }, { label: 'Evening', icon: 'mdi:weather-night' }, { label: 'All Off', icon: 'mdi:power' }];
  const BASE = { name: 'Living Room', haRoles: { lights: ['light.a', 'light.b'] }, info: INFO, scenes: SC, haSlots: { scenes: ['scene.relax', 'scene.movie', 'scene.evening', 'scene.all_off'] } };
  const SIZES = { large: [900, 560], normal: [440, 400], compact: [360, 190], micro: [180, 160] };
  // every card side by side; returns what each one shows
  const mount = async (items) => {
    await E((items) => {
      document.getElementById('vh')?.remove();
      const host = document.createElement('div'); host.id = 'vh'; host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;display:flex;flex-wrap:wrap;gap:8px;width:1600px';
      items.forEach(([w, h, c]) => { const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;display:grid`; b.append(window.MaisonRegistry.build('custom.room-scene', c)); host.append(b); });
      document.body.append(host);
    }, items);
    await page.waitForFunction((n) => [...document.querySelectorAll('#vh .iq-room')].filter((r) => r.dataset.fitArr && r.dataset.stats).length === n, items.length, { timeout: 15000 });
    await page.waitForTimeout(400);
    return E(() => [...document.querySelectorAll('#vh .iq-room')].map((r) => {
      const vis = (el) => !!el && !!el.offsetParent && el.getBoundingClientRect().width > 0;
      const rr = r.getBoundingClientRect();
      const shown = [...r.querySelectorAll('.iq-room__stat')].filter(vis);
      const tiles = [...r.querySelectorAll('.iq-room__scenes .iq-room__scene')].filter(vis);
      const inside = [...r.querySelectorAll('.iq-room__name, .iq-room__stat, .iq-room__scenes .iq-room__scene, .iq-room__go, .iq-room__mscenes')].filter(vis)
        .every((el) => { const b = el.getBoundingClientRect(); return b.left >= rr.left - 1 && b.right <= rr.right + 1 && b.top >= rr.top - 1 && b.bottom <= rr.bottom + 1; });
      const img = r.querySelector('.iq-room__img');
      return { variant: r.dataset.variant, arr: r.dataset.fitArr, lit: r.dataset.lit, info: shown.map((li) => li.querySelector('.iq-room__slab').textContent), tiles: tiles.length,
        more: tiles.some((b) => b.classList.contains('iq-room__scene--more')), mbtn: vis(r.querySelector('.iq-room__mscenes')), name: vis(r.querySelector('.iq-room__name')), inside,
        filter: getComputedStyle(img).filter, mediaOpacity: getComputedStyle(r.querySelector('.iq-room__media')).opacity, badge: getComputedStyle(r.querySelector('.iq-room__badge')).display,
        infoStyle: r.dataset.infoStyle, sceneStyle: r.dataset.sceneStyle, align: r.dataset.align, image: r.dataset.image, overlay: r.dataset.overlay, title: r.dataset.title,
        trees: r.querySelectorAll('.iq-room__in').length, fan: (r.querySelector('[data-info="i3"] .iq-room__sicon') || {}).dataset?.iqiAnim || '', w: Math.round(rr.width) };
    }));
  };

  // ---- 1: four variants × four sizes — each its own composition, everything inside the card, one DOM tree
  const all = await mount(VARIANTS.flatMap((v) => Object.values(SIZES).map(([w, h]) => [w, h, { ...BASE, variant: v }])));
  const at = (v, s) => all[VARIANTS.indexOf(v) * 4 + Object.keys(SIZES).indexOf(s)];
  const expectArr = { scene: ['large', 'normal', 'compact', 'micro'], card: ['large', 'normal', 'compact', 'micro'], status: ['large', 'normal', 'compact', 'micro'], minimal: ['large', 'normal', 'compact', 'micro'] };
  check('the four variants render with their own data-variant', VARIANTS.every((v) => Object.keys(SIZES).every((s) => at(v, s).variant === v)), JSON.stringify(all.map((x) => x.variant)));
  check('every variant has a Micro / Compact / Normal / Large composition', VARIANTS.every((v) => Object.keys(SIZES).every((s, i) => at(v, s).arr === expectArr[v][i])), JSON.stringify(all.map((x) => `${x.variant}/${x.arr}`)));
  check('one DOM tree per card (no hidden duplicate layouts)', all.every((x) => x.trees === 1));
  check('every visible part stays inside its card (16 compositions)', all.every((x) => x.inside), JSON.stringify(all.filter((x) => !x.inside).map((x) => `${x.variant}/${x.arr}`)));
  check('every composition shows the name', all.every((x) => x.name));
  // INFORMATION: the owner's lines, first ones first (MaisonFit may show fewer, never others)
  const order = ['Temperature', 'Humidity', 'Fan', 'Power'];
  check('Information = the owner\'s lines in their order (a prefix), in every variant and size', all.every((x) => x.info.every((l, i) => l === order[i])), JSON.stringify(all.map((x) => x.info.length)));
  check('Micro shows at most one line; Large shows more than Micro (non-Hero variants)', all.filter((x) => x.arr === 'micro').every((x) => x.info.length <= 1)
    && ['card', 'status', 'minimal'].every((v) => at(v, 'large').info.length > at(v, 'micro').info.length));
  check('Status leads with Information (all four lines at Normal and Large)', at('status', 'normal').info.length === 4 && at('status', 'large').info.length === 4);
  check('Minimal stays minimal (≤ 3 lines, one at Compact / Micro)', ['large', 'normal'].every((s) => at('minimal', s).info.length <= 3) && at('minimal', 'compact').info.length === 1);
  // SCENES: explicit tiles; Micro uses the scenes button
  check('Micro: no scene row, the scenes button instead (every variant)', VARIANTS.every((v) => at(v, 'micro').tiles === 0 && at(v, 'micro').mbtn));
  check('Normal / Large: scene tiles in every variant', VARIANTS.every((v) => at(v, 'normal').tiles >= 2 && at(v, 'large').tiles >= 3), JSON.stringify(all.map((x) => x.tiles)));
  // the variants really differ: Automatic looks per variant
  check('the variants differ: Status tiles, Card clean / tiles, Minimal clean + icon scenes, Hero its own', at('status', 'normal').infoStyle === 'tiles' && at('card', 'normal').infoStyle === 'clean' && at('card', 'large').infoStyle === 'tiles'
    && at('minimal', 'normal').sceneStyle === 'icons' && at('scene', 'normal').infoStyle === 'auto');
  check('area-light badge next to the name in Card / Status / Minimal (lit)', ['card', 'status', 'minimal'].every((v) => at(v, 'normal').badge !== 'none' && at(v, 'normal').lit === 'true'));
  check('icon animation (shared IniqIcons) runs wherever the Fan line is shown', all.every((x) => (x.info.includes('Fan') ? x.fan === 'rotate' : x.fan === '')), JSON.stringify(all.map((x) => x.fan)));

  // ---- 2: zero Information / zero scenes / overflow / long name
  let r = await mount(VARIANTS.map((v) => [440, 400, { ...BASE, variant: v, info: [], scenes: [], haSlots: {} }]));
  check('zero Information and zero scenes: nothing invented, no tiles, no scenes button', r.every((x) => x.info.length === 0 && x.tiles === 0 && !x.mbtn), JSON.stringify(r));
  r = await mount(VARIANTS.map((v) => [440, 400, { ...BASE, variant: v, scenes: [...SC, { label: 'Night', icon: 'mdi:weather-night' }], haSlots: { scenes: [...BASE.haSlots.scenes, 'scene.night'] }, info: [...INFO, { id: 'i5', entity: 'sensor.t', value: 'state', label: 'Fifth' }] }]));
  check('5 scenes: either all five or "+N" (never silently dropped)', r.every((x) => x.tiles === 5 || x.more), JSON.stringify(r.map((x) => [x.tiles, x.more])));
  r = await mount(VARIANTS.map((v) => [440, 400, { ...BASE, variant: v, name: 'The Very Long Family Living Room Downstairs' }]));
  check('a long name stays inside the card in every variant', r.every((x) => x.inside && x.name));

  // ---- 3: lights — lit / off / unknown in every variant; a treatment never makes OFF look lit
  const looks = (x) => VARIANTS.map((v) => [440, 400, { ...BASE, variant: v, ...x }]);
  r = await mount(looks({}));
  check('lit (natural): the picture unfiltered in every variant', r.every((x) => x.lit === 'true' && x.filter === 'none'), JSON.stringify(r.map((x) => x.filter)));
  L.setEntity('light.a', 'off');
  await page.waitForFunction(() => [...document.querySelectorAll('#vh .iq-room')].every((r) => r.dataset.lit === 'false'), null, { timeout: 15000 });
  r = await mount(looks({ imageTreatment: 'dark' }).concat(looks({ imageTreatment: 'soft' })));
  check('all lights off: the grey, dimmed picture in every variant — also with Dark / Soft', r.every((x) => x.lit === 'false' && /grayscale\(0\.9\)/.test(x.filter)), JSON.stringify(r.map((x) => x.filter)));
  L.setEntity('light.a', 'unavailable'); L.setEntity('light.b', 'unavailable');
  await page.waitForFunction(() => [...document.querySelectorAll('#vh .iq-room')].every((r) => r.dataset.lit === 'unknown'), null, { timeout: 15000 });
  r = await E(() => [...document.querySelectorAll('#vh .iq-room')].map((x) => getComputedStyle(x.querySelector('.iq-room__img')).filter));
  check('not reported: neutral and dimmed, never the lit look', r.every((f) => /grayscale\(0\.55\)/.test(f)), JSON.stringify(r));
  L.setEntity('light.a', 'on'); L.setEntity('light.b', 'off');
  r = await mount(VARIANTS.map((v) => [440, 400, { name: 'R', variant: v }]));
  check('no light mapped: no badge, the picture as it is', r.every((x) => x.lit === 'none' && x.badge === 'none' && x.filter === 'none'));

  // ---- 4: Appearance — semantic values to data attributes, per variant
  r = await mount([[440, 400, { ...BASE, variant: 'scene', align: 'center', imageTreatment: 'dim', overlay: 'strong', infoStyle: 'tiles', sceneStyle: 'compact', titleSize: 'large' }],
    [440, 400, { ...BASE, variant: 'status', imageTreatment: 'dark', overlay: 'strong', infoStyle: 'pills' }], [440, 400, { ...BASE, variant: 'minimal', infoStyle: 'tiles', align: 'right' }]]);
  check('Hero: every choice reaches its data attribute', r[0].align === 'center' && r[0].image === 'dim' && r[0].overlay === 'strong' && r[0].infoStyle === 'tiles' && r[0].sceneStyle === 'compact' && r[0].title === 'large' && r[0].mediaOpacity === '0.5', JSON.stringify(r[0]));
  check('a choice that does not apply to the variant is ignored (Status: no image treatment / overlay)', r[1].image === 'natural' && r[1].overlay === 'medium' && r[1].infoStyle === 'pills');
  check('Minimal: its values stay plain (Information style not offered), alignment applies', r[2].infoStyle === 'clean' && r[2].align === 'right');
  const T = await E((id) => {
    const R = window.MaisonRegistry, keys = ['variant', 'align', 'imageTreatment', 'overlay', 'infoStyle', 'sceneStyle', 'titleSize'];
    const PIC = 'widgets/custom/room-scene/assets/demo-living-room.svg';   // image treatment / overlay are offered only with a picture
    const shown = (c) => R.TYPES[id].fields.filter((f) => keys.includes(f.key) && (!f.when || f.when(c))).map((f) => f.key);
    const n = R.fullConfig(id, { name: 'X', variant: 'card', align: 'left', overlay: 'medium', infoStyle: 'explode', titleSize: 'large', imageTreatment: 'url(x)' });
    return { variants: R.TYPES[id].variants.map((v) => `${v.id}:${v.label}`), scene: shown({ name: 'X', image: PIC }), status: shown({ variant: 'status', image: PIC }), minimal: shown({ variant: 'minimal', image: PIC }), card: shown({ variant: 'card', image: PIC }), noPic: shown({ name: 'X' }), n,
      group: R.TYPES[id].fields.filter((f) => keys.includes(f.key)).every((f) => f.group === 'appearance'),
      old: R.fullConfig(id, { name: 'Old', scenes: [{ label: 'A' }] }), errs: R.validateConfig(id, { name: 'X', variant: 'status', infoStyle: 'tiles', titleSize: 'small' }).length,
      bad: R.validateConfig(id, { name: 'X', variant: 'scene', overlay: 'heavy' }).length, badKept: 'overlay' in R.fullConfig(id, { name: 'X', overlay: 'heavy' }) };
  }, ID);
  check('variants: Hero (default) · Compact card · Status · Minimal', T.variants.join() === 'scene:Hero,card:Compact card,status:Status,minimal:Minimal', T.variants.join());
  check('Appearance fields sit in the Appearance group', T.group);
  check('Hero offers every choice; Overlay only for Hero; without a picture no image treatment / overlay', T.scene.join() === 'variant,align,imageTreatment,overlay,infoStyle,sceneStyle,titleSize' && !T.card.includes('overlay') && !T.status.includes('overlay') && !T.noPic.includes('overlay') && !T.noPic.includes('imageTreatment'), JSON.stringify(T));
  check('Status: no image treatment; Minimal: no Information style', !T.status.includes('imageTreatment') && !T.minimal.includes('infoStyle') && T.minimal.includes('sceneStyle'));
  check('normalise: defaults not stored, unknown / CSS-like values dropped, valid choices kept', T.n.variant === 'card' && !('align' in T.n) && !('overlay' in T.n) && !('infoStyle' in T.n) && !('imageTreatment' in T.n) && T.n.titleSize === 'large', JSON.stringify(T.n));
  check('an older Room (no variant, no Appearance) stays the Hero, unchanged', !('variant' in T.old) && !Object.keys(T.old).some((k) => ['align', 'imageTreatment', 'overlay', 'infoStyle', 'sceneStyle', 'titleSize'].includes(k)));
  check('valid choices validate; an unknown option is never kept (dropped on normalise)', T.errs === 0 && T.bad === 0 && !T.badKept, JSON.stringify(T));
  r = await mount([[440, 400, { ...BASE }]]);
  check('an older Room renders as the Hero (its own strip and tiles)', r[0].variant === 'scene' && r[0].infoStyle === 'auto' && r[0].sceneStyle === 'auto');

  // ---- 5: live preview — the configuration form's variant / appearance changes reach a rebuilt card
  await E((id) => { const f = window.MaisonForm.create({ type: id, config: { name: 'R' } }); f.el.id = 'cf'; window.__cf = f; document.body.prepend(f.el); f.el.querySelectorAll('details.ef-group').forEach((d) => { d.open = true; }); }, ID);
  const field = (k) => page.locator(`#cf .ef-field[data-key="${k}"]`);
  await field('variant').locator('select').selectOption('status');
  await page.waitForTimeout(150);
  check('switching to Status hides Image treatment and Overlay', await field('imageTreatment').evaluate((x) => x.hidden || !x.offsetParent) && await field('overlay').evaluate((x) => x.hidden || !x.offsetParent) && !(await field('infoStyle').evaluate((x) => x.hidden)));
  await field('infoStyle').locator('select').selectOption('pills');
  const v = await E(() => window.__cf.value());
  check('the form value carries the choices (what the live preview is built from)', v.variant === 'status' && v.infoStyle === 'pills', JSON.stringify(v));
  r = await mount([[440, 400, { ...BASE, ...v, name: 'R' }]]);
  check('…and the card built from it shows them', r[0].variant === 'status' && r[0].infoStyle === 'pills');
  // reduced motion: the shared rule stops the icon (still shown)
  await page.emulateMedia({ reducedMotion: 'reduce' });
  r = await mount(VARIANTS.map((v) => [900, 560, { ...BASE, variant: v, info: [INFO[2]] }]));
  const names = await E(() => [...document.querySelectorAll('#vh [data-info="i3"] .iq-room__sicon')].map((x) => getComputedStyle(x).animationName));
  check('prefers-reduced-motion: the Fan icon is still in every variant', names.length === 4 && names.every((n) => n === 'none'), names.join());
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // ---- 6: the EDITOR's variant preview geometry — representative per variant, adjustable, never the widget's dashboard size
  await E(() => { document.getElementById('vh')?.remove(); document.getElementById('cf')?.remove(); });
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.waitForSelector(`.ecfg-tile[data-type="${ID}"]`); await page.click(`.ecfg-tile[data-type="${ID}"]`); await page.waitForTimeout(500);
  await page.click('dialog[open] .ecfg-foot button:has-text("Next")'); await page.waitForTimeout(200);
  await page.click('dialog[open] .ecfg-add'); await page.waitForTimeout(600);
  const readModel = async () => { await E(() => [...document.querySelectorAll('button')].find((b) => b.dataset.k === 'more').click()); await E(() => [...document.querySelectorAll('button')].find((b) => b.dataset.k === 'export').click()); await page.waitForSelector('textarea.ed-code'); const m = JSON.parse(await page.$eval('textarea.ed-code', (x) => x.value)); await page.keyboard.press('Escape'); await page.waitForTimeout(150); return m.pages.flatMap((p) => p.items).filter((i) => i.type === ID).pop(); };
  const before = await readModel();
  const elSize = () => E((id) => { const el = document.querySelector(`[data-grid-id="${id}"]`); return `${el.offsetWidth}x${el.offsetHeight}`; }, before.id);
  const size0 = await elSize();
  await page.click(`[data-grid-id="${before.id}"]`, { force: true }); await page.waitForTimeout(150);
  await E(() => document.querySelector('[data-k="edit-config"]').click());
  await page.waitForSelector('dialog[open] .ef');
  await page.locator('dialog[open] .ef-acc__h', { hasText: 'Appearance' }).first().click().catch(() => {});
  const pvState = () => E(() => { const d = document.querySelector('dialog[open]'), box = d.querySelector('.ecfg-pv__box'), r = box && box.querySelector('.iq-room');
    return { mode: d.querySelector('[data-k=pv-size]').value, w: +d.querySelector('[data-k=pv-w]').value, h: +d.querySelector('[data-k=pv-h]').value, px: [parseFloat(box.style.width), parseFloat(box.style.height)], variant: r && r.dataset.variant, arr: r && r.dataset.fitArr }; });
  const shapes = {};
  for (const v of ['scene', 'card', 'status', 'minimal']) {
    await page.selectOption('dialog[open] .ef-field[data-key="variant"] select', v); await page.waitForTimeout(500);
    shapes[v] = await pvState();
  }
  check('variant preview: each variant opens on its own representative shape', shapes.scene.mode === 'variant' && Object.values(shapes).every((x, i, a) => x.variant === Object.keys(shapes)[i] && x.mode === 'variant')
    && shapes.scene.px[0] > shapes.card.px[0] && shapes.card.px[0] > shapes.minimal.px[0] && shapes.scene.px[1] > shapes.card.px[1] && shapes.card.px[1] > shapes.minimal.px[1], JSON.stringify(shapes));
  check('Hero previews image-led and Large, Minimal small and horizontal', shapes.scene.arr === 'large' && shapes.minimal.px[0] > shapes.minimal.px[1] * 1.6, JSON.stringify(shapes));
  check('the preview shapes are about 14×9 · 10×6 · 9×6 · 8×4 of a 24-column desktop', [[shapes.scene, 717, 488], [shapes.card, 507, 320], [shapes.status, 455, 320], [shapes.minimal, 403, 208]].every(([x, w, h]) => Math.abs(x.px[0] - w) < 60 && Math.abs(x.px[1] - h) < 2), JSON.stringify(shapes));
  check('switching variants never resized the widget on the canvas', (await elSize()) === size0, `${size0} → ${await elSize()}`);
  // trying another size: the preview's own size changes and MaisonFit follows (here: Minimal → Micro)
  await page.fill('dialog[open] [data-k=pv-w]', '2'); await page.waitForTimeout(400);
  let st = await pvState();
  check('the preview size can still be changed (custom W × H); MaisonFit adapts the variant', st.mode === 'custom' && st.w === 2 && st.variant === 'minimal' && st.arr === 'micro', JSON.stringify(st));
  await page.selectOption('dialog[open] [data-k=pv-size]', 'actual'); await page.waitForTimeout(400);
  st = await pvState();
  check('"This widget’s size" previews the widget at its real size', st.mode === 'actual' && Math.abs(st.px[0] - +size0.split('x')[0]) < 2, JSON.stringify(st) + size0);
  await page.selectOption('dialog[open] .ef-field[data-key="variant"] select', 'card'); await page.waitForTimeout(400);
  check('a variant switch returns to that variant’s representative shape', (await pvState()).mode === 'variant');
  await page.click('dialog[open] .ecfg-foot button:has-text("Apply")'); await page.waitForTimeout(400);
  const after = await readModel();
  check('Apply stores the variant only — the dashboard layout (x / y / w / h) is unchanged', after.config.variant === 'card' && JSON.stringify(after.layout) === JSON.stringify(before.layout) && (await elSize()) === size0, `${JSON.stringify(before.layout)} → ${JSON.stringify(after.layout)}`);
  check('no preview geometry is stored in the configuration', !Object.keys(after.config).some((k) => /preview|^w$|^h$/i.test(k)), JSON.stringify(after.config));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
