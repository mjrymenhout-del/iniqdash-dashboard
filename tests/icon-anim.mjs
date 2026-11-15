/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ICON ANIMATION of an Information line (the shared IniqIcons.animate + components/icons/icons.css; IniqHA.isActive): only the icon
// moves; "Entity active" follows Home Assistant's state live; "Always" runs regardless; reduced motion stops it. Real PHP server + fake HA.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ID = 'custom.room-scene';
let L, B;
try {
  L = await live();
  L.setEntity('fan.stove', 'on', { name: 'Stove fan' }); L.setEntity('light.l', 'on', { name: 'Lamp', f: 0 }); L.setEntity('sensor.t', '21', { name: 'T', unit: '°C', dc: 'temperature' });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 900 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const line = (id, entity, icon, extra = {}) => ({ id: `i${id}`, entity, value: 'state', label: id, icon, color: 'cool', ...extra });
  const mount = (info) => E(({ id, info }) => {
    document.getElementById('rw')?.remove();
    const box = document.createElement('div'); box.id = 'rw'; box.style.cssText = 'position:fixed;left:10px;top:10px;width:1420px;height:560px;z-index:99999;display:grid';
    box.append(window.MaisonRegistry.build(id, { name: 'Room', info })); document.body.append(box);
  }, { id: ID, info });
  const anims = () => E(() => Object.fromEntries([...document.querySelectorAll('#rw .iq-room__stat')].map((li) => {
    const ic = li.querySelector('.iq-room__sicon'), cs = ic && getComputedStyle(ic);
    return [li.querySelector('.iq-room__slab').textContent, { kind: ic ? ic.dataset.iqiAnim || '' : '', name: cs ? cs.animationName : '', color: ic ? ic.style.color : '', svg: !!(ic && ic.querySelector('svg')),
      pill: getComputedStyle(li).animationName, text: getComputedStyle(li.querySelector('.iq-room__stxt')).animationName, strip: getComputedStyle(li.parentElement).animationName }];
  })));
  const wait = (label, kind) => page.waitForFunction(({ l, k }) => { const li = [...document.querySelectorAll('#rw .iq-room__stat')].find((x) => x.querySelector('.iq-room__slab').textContent === l); return li && (li.querySelector('.iq-room__sicon').dataset.iqiAnim || '') === k; }, { l: label, k: kind }, { timeout: 15000 });

  // ---- 1 / 2 / 3 / 16 / 17 / 18
  await mount([line('old', 'sensor.t', 'mdi:thermometer'), line('none', 'fan.stove', 'mdi:fan', { animation: 'none' }), line('fan', 'fan.stove', 'mdi:fan', { animation: 'rotate', animateWhen: 'active' }), line('lamp', 'light.l', 'mdi:lightbulb', { animation: 'pulse' })]);
  await wait('fan', 'rotate');
  await page.waitForFunction(() => document.querySelectorAll('#rw .iq-room__sicon svg').length === 4, null, { timeout: 15000 });   // the MDI library is loaded on demand
  let a = await anims();
  check('1 an older line (no animation set) stays still', a.old.kind === '' && a.old.name === 'none', JSON.stringify(a.old));
  check('2 animation None: still (even with the fan on)', a.none.kind === '' && a.none.name === 'none');
  check('3 fan on + mdi:fan + Rotate + Entity active → the icon rotates', a.fan.kind === 'rotate' && a.fan.name === 'iqi-rotate' && a.fan.svg, JSON.stringify(a.fan));
  check('7 light on + Pulse (Entity active by default) → pulses', a.lamp.kind === 'pulse' && a.lamp.name === 'iqi-pulse');
  check('16 the icon keeps its colour while animated', a.fan.color === 'var(--cool)');
  check('17 / 18 only the icon animates (pill, label / value, strip still)', [a.fan, a.lamp].every((x) => x.pill === 'none' && x.text === 'none' && x.strip === 'none'));
  // ---- 4 / 5 / 6 / 8 / 19: live HA state
  L.setEntity('fan.stove', 'off'); await wait('fan', '');
  check('4 / 19 fan turns off (live, no reload) → the icon stops', (await anims()).fan.name === 'none');
  L.setEntity('fan.stove', 'on'); await wait('fan', 'rotate');
  check('19 fan on again → rotates again', true);
  L.setEntity('fan.stove', 'unavailable'); await wait('fan', '');
  check('5 fan unavailable → still', true);
  L.setEntity('fan.stove', 'unknown'); await wait('fan', '');
  check('6 fan unknown → still', (await anims()).fan.kind === '');
  L.setEntity('light.l', 'off'); await wait('lamp', '');
  check('8 light off → still', true);
  // ---- 9: Always; 10–15: every kind
  const kinds = ['rotate', 'pulse', 'breathe', 'shake', 'bounce', 'swing', 'flash'];
  await mount(kinds.map((k) => line(k, 'light.l', 'mdi:bell', { animation: k, animateWhen: 'always' })));
  await wait('flash', 'flash');
  a = await anims();
  check('9 Always: runs although the light is off', a.pulse.kind === 'pulse');
  check('10–15 every animation runs on its icon: rotate pulse breathe shake bounce swing flash', kinds.every((k) => a[k].kind === k && a[k].name === `iqi-${k}`), JSON.stringify(Object.fromEntries(kinds.map((k) => [k, a[k].name]))));
  // ---- 20: reduced motion
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(100);
  a = await anims();
  check('20 prefers-reduced-motion: every icon still; icon, colour and value stay', kinds.every((k) => a[k].name === 'none' && a[k].svg && a[k].color === 'var(--cool)'), JSON.stringify(Object.fromEntries(kinds.map((k) => [k, a[k].name]))));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // a line the card's size hides does not animate
  await E(() => { document.getElementById('rw').style.width = '440px'; document.getElementById('rw').style.height = '400px'; });
  await page.waitForTimeout(800);
  const hidden = await E(() => [...document.querySelectorAll('#rw .iq-room__stat')].filter((li) => li.hidden).map((li) => li.querySelector('.iq-room__sicon').dataset.iqiAnim || ''));
  check('a line hidden at this size is not animated', hidden.length > 0 && hidden.every((x) => x === ''), JSON.stringify(hidden));
  await E(() => document.getElementById('rw').remove());

  // ---- 21 / 22 / 23 / 25: the Information editor
  await E(({ id, l }) => { const f = window.MaisonForm.create({ type: id, config: { name: 'R', info: [l] } }); f.el.id = 'cf'; window.__cf = f; document.body.prepend(f.el); f.el.querySelectorAll('details.ef-group').forEach((d) => { d.open = true; }); }, { id: ID, l: line('fan', 'fan.stove', 'mdi:fan', { animation: 'rotate', animateWhen: 'active' }) });
  const ed = page.locator('#cf [data-k=item-editor]');
  await page.click('#cf [data-col="info"] [data-k=col-edit]');
  check('22 Edit loads the animation settings', (await ed.locator('.ef-field[data-key="animation"] select').inputValue()) === 'rotate' && (await ed.locator('.ef-field[data-key="animateWhen"] select').inputValue()) === 'active');
  await ed.locator('.ef-field[data-key="animation"] select').selectOption('none');
  check('"Animate when" hides with None', await ed.locator('.ef-field[data-key="animateWhen"]').evaluate((x) => x.hidden));
  await ed.locator('[data-k=sub-cancel]').click();
  check('23 Cancel leaves the animation as it was', JSON.stringify((await E(() => window.__cf.value())).info[0]) === JSON.stringify(line('fan', 'fan.stove', 'mdi:fan', { animation: 'rotate', animateWhen: 'active' })));
  await page.click('#cf [data-col="info"] [data-k=col-add]');
  // a new line has no icon yet: the whole Icon section (animation included) appears once an icon is chosen; its animation is None
  check('a new line: no icon → no icon settings; with an icon: None, and no "Animate when"', await ed.locator('.ef-field[data-key="animation"]').evaluate((x) => x.hidden) && await ed.locator('.ef-field[data-key="animateWhen"]').evaluate((x) => x.hidden)
    && await (async () => { await ed.locator('[data-k=icon-field]').click(); await ed.locator('.iqi__search').fill('fan'); await ed.locator('.iqi__opt[data-icon="mdi:fan"]').click(); return (await ed.locator('.ef-field[data-key="animation"] select').inputValue()) === 'none' && await ed.locator('.ef-field[data-key="animateWhen"]').evaluate((x) => x.hidden); })());
  await ed.locator('[data-k=iqp-choose]').click(); await ed.locator('.iqp__item[data-entity="light.l"]').click(); await page.waitForTimeout(150);
  await ed.locator('[data-k=icon-field]').click(); await ed.locator('.iqi__search').fill('lightbulb'); await ed.locator('.iqi__opt[data-icon="mdi:lightbulb"]').click();
  check('25 the MDI picker still searches and chooses', (await ed.locator('.ef-field[data-key="icon"] .iqi__name').textContent()) === 'mdi:lightbulb');
  await ed.locator('.ef-field[data-key="animation"] select').selectOption('breathe');
  await ed.locator('.ef-field[data-key="animateWhen"] select').selectOption('always');
  await ed.locator('[data-k=sub-save]').click(); await page.waitForTimeout(150);
  const saved = (await E(() => window.__cf.value())).info[1];
  check('21 Add saves the animation with the line', saved.icon === 'mdi:lightbulb' && saved.animation === 'breathe' && saved.animateWhen === 'always', JSON.stringify(saved));
  check('the edited configuration validates', (await E(() => window.__cf.errors().length)) === 0, JSON.stringify(await E(() => window.__cf.errors())));
  check('an unknown animation name is refused / dropped', await E((id) => { const R = window.MaisonRegistry; return !('animation' in R.fullConfig(id, { name: 'X', info: [{ id: 'i1', entity: 'fan.stove', value: 'state', icon: 'mdi:fan', animation: 'explode' }] }).info[0]); }, ID));
  // ---- 24: older configuration
  check('24 an older line (no animation keys) loads and validates unchanged', await E((id) => { const R = window.MaisonRegistry, c = { name: 'X', info: [{ id: 'i1', entity: 'sensor.t', value: 'state', label: 'T', icon: 'mdi:thermometer', color: 'info' }] }; return JSON.stringify(R.fullConfig(id, c).info) === JSON.stringify(c.info) && R.validateConfig(id, c).length === 0; }, ID));
  check('the shared active rule (HA states): on / playing / cleaning / mowing; unavailable never', await E(() => { const A = window.IniqHA.isActive; return A({ domain: 'fan', state: 'on', available: true }) && A({ domain: 'media_player', state: 'playing', available: true }) && A({ domain: 'vacuum', state: 'cleaning', available: true }) && A({ domain: 'lawn_mower', state: 'mowing', available: true })
    && !A({ domain: 'fan', state: 'on', available: false }) && !A({ domain: 'sensor', state: 'on', available: true }) && !A(null); }));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
