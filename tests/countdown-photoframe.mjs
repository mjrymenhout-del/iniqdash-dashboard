/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// COUNTDOWN and the IMAGE widget's PHOTO FRAME (real server, the SIMULATED home):
//   1  Countdown from a typed date: days / hours / min; a date without a time says it counts to the start of that day
//   2  Countdown from an entity whose state is a time stamp (12 days 5 hours ahead); an entity that is not a date shows no numbers
//   3  a passed moment: "ago" (time since), or the own text
//   4  Photo frame: three pictures change in turn (cross-fade layer), the shown one is a real picture; one picture: no rotation
//   5  the configurations: wrong dates / entities / intervals dropped; saved and reloaded
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y: y * 2, w: 6, h }, mobile: { w: 4, h } });
const inYear = `${new Date().getFullYear() + 1}-07-14`;
const dash = { version: 3, app: { id: 'g', startPage: 'p', navigation: {}, simulated: true }, pages: [{ id: 'p', name: 'P', nav: true, items: [
  { id: 'c1', type: 'countdown', config: { name: 'Summer', target: inYear }, layout: lay(1, 1, 4, 5) },
  { id: 'c2', type: 'countdown', config: { name: 'Holiday', source: 'sensor.demo_next_holiday' }, layout: lay(5, 1, 4, 5) },
  { id: 'c3', type: 'countdown', config: { name: 'Wrong', source: 'sensor.living_temperature' }, layout: lay(9, 1, 4, 5) },
  { id: 'c4', type: 'countdown', config: { name: 'Gone', target: '2020-01-01T10:00' }, layout: lay(1, 7, 4, 5) },
  { id: 'c5', type: 'countdown', config: { name: 'Party', target: '2020-01-01', after: 'text', afterText: 'Party time' }, layout: lay(5, 7, 4, 5) },
  { id: 'pf', type: 'image', config: { name: 'Frame', src: 'widgets/default/image/assets/demo-house.svg', slides: ['widgets/default/camera/assets/demo-garden.svg', 'assets/img/media/artwork-dusk.jpg'], interval: 5, fit: 'cover', position: 'center', caption: false, surface: true }, layout: lay(9, 7, 4, 5) },
  { id: 'p1', type: 'image', config: { name: 'One', src: 'widgets/default/image/assets/demo-house.svg', fit: 'cover', position: 'center', caption: false, surface: true }, layout: lay(1, 13, 4, 5) }] }] };

let L, B;
try {
  L = await live({ configureHa: false });
  const me = L.client(); await me.login();
  const id = (await (await me.post('/api/dashboards.php', { action: 'create', name: 'Countdown', dashboard: dash })).json()).entry.id;
  B = await liveBrowser(L, { viewport: { width: 1300, height: 1000 } });
  const p = B.page, E = (fn, a) => p.evaluate(fn, a), wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${L.base}/?d=${id}`); await p.waitForFunction(() => window.editor && window.IniqHA.simulated(), null, { timeout: 20000 });
  await p.waitForFunction(() => document.querySelectorAll('[data-grid-id="c2"] .iq-cd__part').length > 0, null, { timeout: 15000 }).catch(() => {});
  await wait(800);
  const cd = (k) => E((k) => { const r = document.querySelector(`[data-grid-id="${k}"] .iq-cd`); return { parts: [...r.querySelectorAll('.iq-cd__part')].map((x) => `${x.querySelector('b').textContent} ${x.querySelector('i').textContent}`),
    note: r.querySelector('.iq-cd__note').textContent, done: r.querySelector('.iq-cd__done')?.textContent || '', state: r.dataset.state, when: r.querySelector('.iq-cd__when').textContent }; }, k);
  const [a, b, c, d, e] = [await cd('c1'), await cd('c2'), await cd('c3'), await cd('c4'), await cd('c5')];
  check('1 · a typed date: days / hours / min, and "until the start of that day"', a.parts.length === 3 && / days?$/.test(a.parts[0]) && /min$/.test(a.parts[2]) && /start of that day/.test(a.note), JSON.stringify(a));
  check('2 · from a time-stamp entity: 12 days 5 hours ahead; a temperature sensor shows no numbers ("No date to count to")', b.parts[0] === '12 days' && /^(4|5) hours$/.test(b.parts[1]) && c.parts.length === 0 && /No date/.test(c.note), JSON.stringify({ b, c }));
  check('3 · passed: the time since ("ago"), or the own text "Party time"', d.state === 'past' && d.note === 'ago' && d.parts.length === 3 && e.done === 'Party time', JSON.stringify({ d, e }));
  const pf = () => E(() => { const f = document.querySelector('[data-grid-id="pf"] .im'), o = document.querySelector('[data-grid-id="p1"] .im'); return { frame: f.dataset.frame, src: f.image.getState().src, count: f.image.getState().count, img: f.dataset.img, one: o.dataset.frame }; });
  const f1 = await pf();
  await wait(7500);
  const f2 = await pf();
  check('4 · photo frame: three pictures, the picture changes after the interval (cross-fade), loaded; a single picture does not rotate',
    f1.frame === 'true' && f1.count === 3 && f2.src !== f1.src && f2.img === 'ok' && f1.one === 'false', JSON.stringify({ f1, f2 }));
  await p.goto(`${L.base}/editor.html?d=${id}`); await p.waitForFunction(() => window.editor, null, { timeout: 20000 }); await wait(500);
  const n = await E(() => ({ c: window.MaisonRegistry.fullConfig('countdown', { target: '14/07/2027', source: 'light.x', after: 'x' }), i: window.MaisonRegistry.fullConfig('image', { src: 'widgets/default/image/assets/demo-house.svg', slides: ['a.svg', 5, ''], interval: 2, shuffle: 'yes' }),
    bad: window.MaisonRegistry.validateConfig ? window.MaisonRegistry.validateConfig('image', { name: 'x', src: 'widgets/default/image/assets/demo-house.svg', fit: 'cover', position: 'center', slides: ['javascript:alert(1)'] }) : null }));
  const saved = await E(() => { const md = window.editor.getModel(); md.pages[0].items[5].config.shuffle = true; md.pages[0].items[0].config.target = '2031-01-01T08:00'; window.editor.setModel(md); return window.editor.save(); });
  await p.reload(); await p.waitForFunction(() => window.editor, null, { timeout: 20000 });
  const back = await E(() => window.editor.getModel().pages[0].items.map((x) => x.config));
  check('5 · normalised (bad date / entity / option dropped; slides cleaned; interval 2 s dropped); an unsafe picture address refused; saved and reloaded',
    n.c.target === undefined && n.c.source === undefined && n.c.after === undefined && JSON.stringify(n.i.slides) === '["a.svg"]' && n.i.interval === undefined && n.i.shuffle === undefined
    && (n.bad === null || (Array.isArray(n.bad) ? n.bad.length > 0 : n.bad && n.bad.ok === false)) && saved && back[5].shuffle === true && back[0].target === '2031-01-01T08:00', JSON.stringify({ n, back: [back[0], back[5]] }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('countdown-photoframe test ran', false, e.stack || e.message);
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
console.log('finished');
