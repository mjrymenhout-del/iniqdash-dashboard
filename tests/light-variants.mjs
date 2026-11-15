/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// LIGHT — variants on the Room reference architecture: Standard ('artwork') · Compact · Slider · Artwork ('image'), each with its own
// Micro / Compact / Normal / Large composition; the real HA state drives the lamp (live, unavailable never lit, the light's own colour);
// Appearance (allow-listed, per variant); the editor's representative variant preview never touches the dashboard geometry; card
// interactions vs inner controls; older configurations. Real PHP server + fake HA.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const VARIANTS = ['artwork', 'compact', 'slider', 'image'];
let L, B;
try {
  L = await live();
  L.setEntity('light.full', 'on', { name: 'Dining', f: 0, scm: ['color_temp', 'hs'], br: 184, cm: 'color_temp', ctk: 2700, ckmin: 2000, ckmax: 6500, hs: [30, 80] });
  L.setEntity('light.dim', 'on', { name: 'Bedside', f: 0, scm: ['brightness'], br: 128, cm: 'brightness' });
  L.setEntity('light.onoff', 'off', { name: 'Porch', f: 0, scm: ['onoff'] });
  L.setEntity('light.hue', 'on', { name: 'Strip', f: 0, scm: ['hs'], br: 255, cm: 'hs', hs: [220, 90] });
  B = await liveBrowser(L, { viewport: { width: 1700, height: 1000 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const calls = () => L.haCalls.filter((x) => /\/api\/services\//.test(x.url));
  const mount = async (items) => {
    await E((items) => {
      document.getElementById('lh')?.remove();
      const host = document.createElement('div'); host.id = 'lh'; host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;display:flex;flex-wrap:wrap;gap:8px;width:1700px';
      items.forEach(([w, h, c]) => { const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;display:grid`; b.append(window.MaisonRegistry.build('light', c)); host.append(b); });
      document.body.append(host);
    }, items);
    await page.waitForFunction((n) => [...document.querySelectorAll('#lh .lw')].filter((r) => r.dataset.fitArr).length === n, items.length, { timeout: 15000 });
    await page.waitForTimeout(500);
    return E(() => [...document.querySelectorAll('#lh .lw')].map((r) => {
      const vis = (el) => !!el && !!el.offsetParent && el.getBoundingClientRect().width > 0;
      const rr = r.getBoundingClientRect();
      const inside = [...r.querySelectorAll('.lw__name, .lw__state, .lw__power, .lw__dim, .iq-light-more, .lw__big')].filter(vis)
        .every((el) => { const b = el.getBoundingClientRect(); return b.left >= rr.left - 1 && b.right <= rr.right + 1 && b.top >= rr.top - 1 && b.bottom <= rr.bottom + 1; });
      return { variant: r.dataset.variant, arr: r.dataset.fitArr, lit: r.dataset.lit, state: r.querySelector('.lw__state').textContent, dim: vis(r.querySelector('.lw__range')) || (r.dataset.variant === 'slider' && !!r.querySelector('.lw__range')),
        power: vis(r.querySelector('.lw__power')), more: vis(r.querySelector('.iq-light-more')), extra: r.dataset.extra, glow: r.style.getPropertyValue('--lw-glow'), inside, trees: r.querySelectorAll('.lw__body').length,
        stage: vis(r.querySelector('.lw__stage')), photo: vis(r.querySelector('.lw__photo')), anim: r.dataset.iqvAnim || '', disabled: r.querySelector('.lw__power').disabled,
        look: { title: r.dataset.title, align: r.dataset.align, image: r.dataset.image, power: r.dataset.power, glow: r.dataset.glow } };
    }));
  };
  let r0;
  const SIZES = { micro: [150, 110], compact: [330, 170], normal: [440, 320], large: [760, 480] };

  // ---- the four variants × four sizes (a full light): each its own composition, one tree, everything inside the card
  const all = await mount(VARIANTS.flatMap((v) => Object.values(SIZES).map(([w, h]) => [w, h, { entity: 'light.full', variant: v }])));
  const at = (v, t) => all[VARIANTS.indexOf(v) * 4 + Object.keys(SIZES).indexOf(t)];
  check('every variant has a Micro / Compact / Normal / Large composition', VARIANTS.every((v) => Object.keys(SIZES).every((t) => at(v, t).variant === v && at(v, t).arr === t)), JSON.stringify(all.map((x) => `${x.variant}/${x.arr}`)));
  check('one DOM tree per card; everything visible inside it (16 compositions)', all.every((x) => x.trees === 1 && x.inside), JSON.stringify(all.filter((x) => !x.inside).map((x) => `${x.variant}/${x.arr}`)));
  check('the variants differ: the lamp hanging (Standard), in a well (Compact), large in the card (Artwork); the fill (Slider)', at('artwork', 'normal').stage && !at('artwork', 'normal').photo && at('compact', 'normal').stage && at('image', 'normal').stage && !at('slider', 'normal').stage && !at('slider', 'normal').photo);
  r0 = await mount([[440, 320, { entity: 'light.full', variant: 'image', image: 'widgets/default/light/assets/artwork-pendant.svg' }]]);
  check('Artwork with a picture: the picture is the card', r0[0].photo && !r0[0].stage);
  check('every composition keeps the power control (Slider: always)', all.every((x) => x.power));
  check('Micro: no brightness bar / colour tools squeezed in (Slider: the card itself)', VARIANTS.filter((v) => v !== 'slider').every((v) => !at(v, 'micro').dim && !at(v, 'micro').more));
  check('Large Standard: colour tools inline; Normal: behind "Colour"', at('artwork', 'large').extra === 'inline' && at('artwork', 'normal').more);
  check('the lit state is the reported one, its glow the light\'s own colour temperature (not the accent)', all.every((x) => x.lit === 'on' && x.anim === 'glow') && /^rgb\(255 /.test(at('artwork', 'normal').glow), at('artwork', 'normal').glow);

  // ---- capability gating: an on/off light shows no brightness / colour anywhere and still composes
  let r = await mount(VARIANTS.flatMap((v) => [[440, 320, { entity: 'light.onoff', variant: v }], [330, 170, { entity: 'light.onoff', variant: v }]]));
  check('on/off light: no brightness, no colour, no "%", every variant still complete', r.every((x) => !x.dim && !x.more && !/%/.test(x.state) && x.state === 'Off' && x.inside), JSON.stringify(r));
  r = await mount(VARIANTS.map((v) => [440, 320, { entity: 'light.dim', variant: v }]));
  check('dimmable light: brightness yes (the live value), colour no', r.every((x) => x.dim && !x.more && /On · 50%/.test(x.state)), JSON.stringify(r.map((x) => x.state)));
  r = await mount([[440, 320, { entity: 'light.hue', variant: 'artwork' }], [440, 320, { entity: 'light.hue', variant: 'image' }]]);
  check('a colour light in a colour mode glows in its own hue', r.every((x) => /^hsl\(220 /.test(x.glow)), JSON.stringify(r.map((x) => x.glow)));

  // ---- live HA state: off → unlit; brightness follows; unavailable → never lit, no input
  await mount(VARIANTS.map((v) => [440, 320, { entity: 'light.dim', variant: v }]));
  L.setEntity('light.dim', 'off', { name: 'Bedside', f: 0, scm: ['brightness'], cm: 'brightness' });
  await page.waitForFunction(() => [...document.querySelectorAll('#lh .lw')].every((x) => x.dataset.lit === 'off'), null, { timeout: 15000 });
  r = await E(() => [...document.querySelectorAll('#lh .lw')].map((x) => ({ s: x.querySelector('.lw__state').textContent, anim: x.dataset.iqvAnim || '' })));
  check('turned off in HA (live): every variant unlit, says Off', r.every((x) => x.s === 'Off' && x.anim !== 'glow'), JSON.stringify(r));
  L.setEntity('light.dim', 'on', { name: 'Bedside', f: 0, scm: ['brightness'], br: 51, cm: 'brightness' });
  await page.waitForFunction(() => [...document.querySelectorAll('#lh .lw')].every((x) => x.querySelector('.lw__state').textContent === 'On · 20%'), null, { timeout: 15000 });
  check('on again at 20 % (live): the state and the slider follow', await E(() => document.querySelector('#lh .lw[data-variant="slider"] .lw__big').textContent === '20%' && document.querySelector('#lh .lw[data-variant="artwork"] .lw__range').value === '20'));
  L.setEntity('light.dim', 'unavailable', { name: 'Bedside', f: 0, scm: ['brightness'] });
  await page.waitForFunction(() => [...document.querySelectorAll('#lh .lw')].every((x) => x.dataset.lit === 'unavailable'), null, { timeout: 15000 });
  r = await E(() => [...document.querySelectorAll('#lh .lw')].map((x) => ({ s: x.querySelector('.lw__state').textContent, anim: x.dataset.iqvAnim || '', off: x.querySelector('.lw__power').disabled, wrap: x.closest('.iqha')?.dataset.ha })));
  check('unavailable (live): never lit, says Unavailable, power disabled', r.every((x) => x.s === 'Unavailable' && x.anim !== 'glow' && x.off), JSON.stringify(r));
  L.setEntity('light.dim', 'on', { name: 'Bedside', f: 0, scm: ['brightness'], br: 128, cm: 'brightness' });

  // ---- actions through the existing secure channel
  await mount([[440, 320, { entity: 'light.onoff', variant: 'artwork' }]]);
  let n = calls().length;
  await page.click('#lh .lw__power'); await page.waitForTimeout(700);
  check('power → turn_on of THIS light', calls().length === n + 1 && /light\/turn_on/.test(calls().at(-1).url) && JSON.parse(calls().at(-1).body).entity_id === 'light.onoff', JSON.stringify(calls().at(-1)));

  // ---- card interactions vs inner controls
  await mount([[440, 320, { entity: 'light.dim', variant: 'artwork', interactions: { tap: { action: 'navigate', page: 'p-tap' } } }]]);
  await E(() => { window.__acts = []; document.addEventListener('maison:action', (e) => window.__acts.push(e.detail && e.detail.action && e.detail.action.page), { capture: true }); });
  n = calls().length;
  await page.click('#lh .lw__power'); await page.waitForTimeout(700);
  const range = await (await page.$('#lh .lw__range')).boundingBox();
  await page.mouse.click(range.x + range.width * 0.6, range.y + range.height / 2); await page.waitForTimeout(700);
  check('power and brightness act on the light — never the card tap', (await E(() => window.__acts.length)) === 0 && calls().length >= n + 2, JSON.stringify(await E(() => window.__acts)));
  await page.click('#lh .lw__name'); await page.waitForTimeout(500);
  check('a tap on the card itself runs the card interaction', (await E(() => window.__acts.join())) === 'p-tap', JSON.stringify(await E(() => window.__acts)));

  // ---- Appearance: semantic values → data attributes; only what the variant offers
  r = await mount([[440, 320, { entity: 'light.dim', variant: 'image', titleSize: 'large', align: 'center', imageTreatment: 'dark', powerStyle: 'switch', glow: 'subtle' }],
    [440, 320, { entity: 'light.dim', variant: 'slider', imageTreatment: 'dark', powerStyle: 'switch', align: 'right' }]]);
  check('Artwork: every choice reaches the card (an older powerStyle as the Power style)', JSON.stringify(r[0].look) === JSON.stringify({ title: 'large', align: 'center', image: 'dark', power: 'switch', glow: 'subtle' }), JSON.stringify(r[0].look));
  check('Slider: a choice it does not offer is ignored (image treatment, an older power style)', r[1].look.image === 'natural' && r[1].look.power === 'button' && r[1].look.align === 'right', JSON.stringify(r[1].look));
  const T = await E(() => {
    const R = window.MaisonRegistry, keys = ['variant', 'align', 'imageTreatment', 'titleSize', 'powerStyle', 'glow', 'image'];
    const shown = (c) => R.TYPES.light.fields.filter((f) => keys.includes(f.key) && (!f.when || f.when(c))).map((f) => f.key);
    return { variants: R.TYPES.light.variants.map((v) => `${v.id}:${v.label}`), std: shown({}), slider: shown({ variant: 'slider' }), image: shown({ variant: 'image', image: 'widgets/default/light/assets/artwork-pendant.svg' }), imageNone: shown({ variant: 'image', image: 'none' }), power: (() => { const f = R.TYPES.light.fields.find((x) => x.key === 'controls' && x.type === 'collection' && x.group === 'controls'); return !!f && f.get({ name: 'X' })[0].type === 'power'; })(),
      n: R.fullConfig('light', { variant: 'image', glow: 'strong', titleSize: 'auto', align: 'url(x)', powerStyle: 'button' }),
      old: R.fullConfig('light', { name: 'Old', entity: 'light.x', dimmable: true }), errs: R.validateConfig('light', { name: 'X', variant: 'image', glow: 'strong', artwork: 'widgets/default/light/assets/artwork-pendant.svg' }).length };
  });
  check('variants: Standard (default) · Compact · Slider · Artwork', T.variants.join() === 'artwork:Standard,compact:Compact,slider:Slider,image:Artwork', T.variants.join());
  check('Appearance per variant: Standard has no alignment / image treatment; Artwork all (Power is configured in Controls, not Appearance)', !T.std.includes('align') && !T.std.includes('imageTreatment') && !T.std.includes('powerStyle') && T.std.includes('image')
    && T.slider.includes('align') && ['align', 'imageTreatment', 'titleSize', 'glow', 'image'].every((k) => T.image.includes(k)) && !T.imageNone.includes('imageTreatment') && T.power, JSON.stringify(T));
  check('normalise: allow-listed values kept, defaults / unknown values dropped; an older powerStyle "button" → Power style Theme button', T.n.glow === 'strong' && T.n.power.style === 'round' && !('powerStyle' in T.n) && !('titleSize' in T.n) && !('align' in T.n), JSON.stringify(T.n));
  check('an older light (no variant, legacy "dimmable") stays Standard and valid', !('variant' in T.old) && T.old.capabilities.brightness === true && !('dimmable' in T.old) && T.errs === 0, JSON.stringify(T.old));

  // ---- the editor's representative variant preview: per variant, adjustable, never the widget's dashboard size
  await E(() => document.getElementById('lh')?.remove());
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(300);
  const model = async () => { await E(() => [...document.querySelectorAll('button')].find((b) => b.dataset.k === 'more').click()); await E(() => [...document.querySelectorAll('button')].find((b) => b.dataset.k === 'export').click()); await page.waitForSelector('textarea.ed-code'); const m = JSON.parse(await page.$eval('textarea.ed-code', (x) => x.value)); await page.keyboard.press('Escape'); await page.waitForTimeout(150); return m.pages.flatMap((p) => p.items); };
  const ids0 = (await model()).map((i) => i.id);
  await E(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add').click());
  await page.waitForSelector('.ecfg-tile[data-type="light"]'); await page.click('.ecfg-tile[data-type="light"]'); await page.waitForTimeout(400);
  await page.click('dialog[open] .ecfg-foot button:has-text("Next")'); await page.waitForTimeout(200);
  await page.click('dialog[open] .ecfg-add'); await page.waitForTimeout(600);
  const readModel = async () => (await model()).filter((i) => i.type === 'light' && !ids0.includes(i.id)).pop();
  const before = await readModel();
  const elSize = () => E((id) => { const el = document.querySelector(`[data-grid-id="${id}"]`); return `${el.offsetWidth}x${el.offsetHeight}`; }, before.id);
  const size0 = await elSize();
  await page.click(`[data-grid-id="${before.id}"]`, { force: true }); await page.waitForTimeout(150);
  await E(() => document.querySelector('[data-k="edit-config"]').click());
  await page.waitForSelector('dialog[open] .ef');
  await E(() => document.querySelectorAll('dialog[open] details').forEach((d) => { d.open = true; }));
  const pv = () => E(() => { const d = document.querySelector('dialog[open]'), box = d.querySelector('.ecfg-pv__box'), w = box && box.querySelector('.lw');
    return { mode: d.querySelector('[data-k=pv-size]').value, px: [Math.round(parseFloat(box.style.width)), Math.round(parseFloat(box.style.height))], variant: w && w.dataset.variant, arr: w && w.dataset.fitArr, orient: w && w.dataset.orient }; });
  const shapes = {};
  for (const v of VARIANTS) { await page.selectOption('dialog[open] .ef-field[data-key="variant"] select', v); await page.waitForTimeout(450); shapes[v] = await pv(); }
  check('variant preview: each variant opens on its own representative shape', VARIANTS.every((v) => shapes[v].mode === 'variant' && shapes[v].variant === v), JSON.stringify(shapes));
  check('…Compact a short row, Slider tall (vertical), Standard and Artwork medium cards', shapes.compact.px[1] < 110 && shapes.compact.px[0] > shapes.compact.px[1] * 3 && shapes.slider.orient === 'vertical' && shapes.slider.px[1] > shapes.slider.px[0] * 1.5
    && shapes.artwork.arr === 'normal' && shapes.image.arr === 'normal', JSON.stringify(shapes));
  check('switching variants never resized the widget on the canvas', (await elSize()) === size0);
  await page.fill('dialog[open] [data-k=pv-w]', '8'); await page.fill('dialog[open] [data-k=pv-h]', '9'); await page.waitForTimeout(400);
  const big = await pv();
  check('another preview size: MaisonFit adapts the variant (Artwork → Large)', big.mode === 'custom' && big.arr === 'large', JSON.stringify(big));
  await page.selectOption('dialog[open] .ef-field[data-key="glow"] select', 'strong'); await page.waitForTimeout(200);
  check('an Appearance change reaches the live preview at once', (await E(() => document.querySelector('dialog[open] .ecfg-pv__box .lw').dataset.glow)) === 'strong');
  await page.click('dialog[open] .ecfg-foot button:has-text("Apply")'); await page.waitForTimeout(400);
  const after = await readModel();
  check('Apply stores the variant + Appearance — the dashboard layout (x / y / w / h) is unchanged', after.config.variant === 'image' && after.config.glow === 'strong' && JSON.stringify(after.layout) === JSON.stringify(before.layout) && (await elSize()) === size0,
    `${JSON.stringify(before.layout)} → ${JSON.stringify(after.layout)} ${JSON.stringify(after.config)}`);
  check('no preview geometry stored in the configuration', !Object.keys(after.config).some((k) => /preview|^w$|^h$/i.test(k)), JSON.stringify(after.config));

  // ---- reduced motion: the light state stays, transitions stop
  await page.emulateMedia({ reducedMotion: 'reduce' });
  r = await mount([[440, 320, { entity: 'light.dim', variant: 'artwork' }]]);
  check('reduced motion: still lit, no transitions on the lamp', r[0].lit === 'on' && (await E(() => getComputedStyle(document.querySelector('#lh .lw__wash')).transitionDuration)) === '0s');
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
