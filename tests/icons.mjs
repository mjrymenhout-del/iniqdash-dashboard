/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// The shared MDI icon layer and picker (components/icons/icons.js): a compact field, a searchable list only while choosing (never the
// whole library in the DOM), "mdi:<name>" values, No icon, the icon colour, older Room icon names still drawn. Real PHP server + fake HA.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const ID = 'custom.room-scene';
let L, B;
try {
  L = await live();
  L.setEntity('sensor.t', '21', { name: 'T', unit: '°C', dc: 'temperature' });
  B = await liveBrowser(L, { viewport: { width: 1200, height: 900 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  check('the library is not loaded before an icon is needed', !(await E(() => window.IniqIcons.loaded())));
  // a picker on its own (the same component the configuration uses)
  await E(() => { const box = document.createElement('div'); box.id = 'ip'; box.style.cssText = 'position:fixed;left:10px;top:10px;width:300px;z-index:99999;background:#111;padding:8px';
    window.__picked = []; box.append(window.IniqIcons.picker({ value: '', onPick: (v) => window.__picked.push(v) })); document.body.append(box); });
  check('compact: one field, the list closed', await E(() => document.querySelector('#ip .iqi__panel').hidden && /No icon/.test(document.querySelector('#ip .iqi__field').textContent)));
  await page.click('#ip [data-k=icon-field]');
  await page.waitForFunction(() => document.querySelectorAll('#ip .iqi__opt').length > 5, null, { timeout: 15000 });
  check('opening shows common icons + No icon — a handful, not the library', await E(() => document.querySelectorAll('#ip .iqi__opt').length <= 61 && !!document.querySelector('#ip .iqi__opt[data-icon=""]')));
  await page.fill('#ip .iqi__search', 'fan');
  const fans = await E(() => [...document.querySelectorAll('#ip .iqi__opt')].map((b) => b.dataset.icon));
  check('"fan" finds fan icons (mdi:fan first), each with its drawing and name', fans[0] === 'mdi:fan' && fans.every((x) => /fan/.test(x)) && fans.length >= 5
    && await E(() => [...document.querySelectorAll('#ip .iqi__opt')].every((b) => b.querySelector('svg path') && b.querySelector('.iqi__on').textContent)), fans.join());
  await page.fill('#ip .iqi__search', 'a');
  const many = await E(() => document.querySelectorAll('#ip .iqi__opt').length);
  check('a broad search never puts the whole library in the page (≤ 60 options of ~7,400)', many <= 60 && (await E(() => Object.keys(window.IniqIcons.search('a', 100000)).length)) > 1000, String(many));
  await page.fill('#ip .iqi__search', 'fan');
  await page.click('#ip .iqi__opt[data-icon="mdi:fan"]');
  check('choosing: the list closes, the field shows the icon and "mdi:fan", the value is reported', await E(() => document.querySelector('#ip .iqi__panel').hidden && document.querySelector('#ip .iqi__name').textContent === 'mdi:fan' && !!document.querySelector('#ip .iqi__prev svg') && window.__picked.at(-1) === 'mdi:fan'));
  await page.click('#ip [data-k=icon-field]'); await page.click('#ip .iqi__opt[data-icon=""]');
  check('No icon', await E(() => window.__picked.at(-1) === '' && document.querySelector('#ip .iqi__name').textContent === 'No icon'));
  await page.click('#ip [data-k=icon-field]'); await page.keyboard.press('Escape');
  check('Esc closes the list, focus back on the field', await E(() => document.querySelector('#ip .iqi__panel').hidden && document.activeElement.dataset.k === 'icon-field'));
  await E(() => document.getElementById('ip').remove());

  // in the Room configuration: Information and Scenes use it; no horizontal overflow (narrow)
  await page.setViewportSize({ width: 380, height: 800 });
  await E((id) => { const f = window.MaisonForm.create({ type: id, config: { name: 'R', info: [{ id: 'i1', entity: 'sensor.t', value: 'state', label: 'T', icon: 'thermo', color: 'cool' }], scenes: [{ label: 'Relax', icon: 'bulb' }] } }); f.el.id = 'cf'; f.el.style.width = '340px'; document.body.prepend(f.el); f.el.querySelectorAll('details.ef-group').forEach((d) => { d.open = true; }); }, ID);
  await page.waitForFunction(() => !!document.querySelector('#cf [data-col="info"] .ef-col__ic svg') && !!document.querySelector('#cf [data-col="scenes"] .ef-col__ic svg'), null, { timeout: 15000 });
  check('older icon names in the rows are drawn as their MDI icons (thermo, bulb)', await E(() => document.querySelector('#cf [data-col="info"] .ef-col__ic').dataset.mdi === 'mdi:thermometer' && document.querySelector('#cf [data-col="scenes"] .ef-col__ic').dataset.mdi === 'mdi:lightbulb'));
  for (const col of ['info', 'scenes']) {
    await page.click(`#cf [data-col="${col}"] [data-k=col-edit]`);
    const ed = page.locator('#cf [data-k=item-editor]');
    check(`${col}: the item editor's Icon is the shared MDI field`, (await ed.locator('.ef-field[data-key="icon"] [data-k=icon-field]').count()) === 1 && (await ed.locator('.ef-field[data-key="icon"] .ef-icons').count()) === 0);
    await ed.locator('[data-k=icon-field]').click(); await ed.locator('.iqi__search').fill('fan'); await page.waitForTimeout(100);
    const over = await E(() => { const d = document.querySelector('#cf [data-k=item-editor]'); const r = d.getBoundingClientRect(); return [...d.querySelectorAll('.iqi *')].filter((x) => x.getBoundingClientRect().right > r.right + 1).length + (d.scrollWidth > d.clientWidth + 1 ? 1 : 0); });
    check(`${col}: the open icon list causes no horizontal overflow (narrow)`, over === 0, String(over));
    await ed.locator('.iqi__opt[data-icon="mdi:fan"]').click();
    await ed.locator('[data-k=sub-save]').click(); await page.waitForTimeout(150);
  }
  await E(() => document.getElementById('cf').remove());
  // the card: the chosen MDI icon in the chosen colour; an older Room's icons still drawn
  await page.setViewportSize({ width: 1200, height: 900 });
  await E(({ id }) => { const box = document.createElement('div'); box.id = 'rw'; box.style.cssText = 'position:fixed;left:10px;top:10px;width:900px;height:560px;z-index:99999;display:grid';
    box.append(window.MaisonRegistry.build(id, { name: 'R', info: [{ id: 'i1', entity: 'sensor.t', value: 'state', label: 'T', icon: 'mdi:fan', color: 'cool' }, { id: 'i2', entity: 'sensor.t', value: 'state', label: 'Old', icon: 'thermo' }], scenes: [{ label: 'Relax', icon: 'bulb' }, { label: 'Fan', icon: 'mdi:fan' }] })); document.body.append(box); }, { id: ID });
  await page.waitForFunction(() => document.querySelectorAll('#rw .iq-room__sicon svg').length === 2 && document.querySelectorAll('#rw .iq-room__scenes .iq-room__sc-i svg').length === 2, null, { timeout: 15000 });
  const card = await E(() => { const s = [...document.querySelectorAll('#rw .iq-room__sicon')]; return { c: s[0].style.color, icons: s.map((x) => x.dataset.mdi), sc: [...document.querySelectorAll('#rw .iq-room__scene')].map((b) => b.dataset.icon) }; });
  check('the card draws the MDI icon in the chosen colour token', card.c === 'var(--cool)' && card.icons.join() === 'mdi:fan,mdi:thermometer', JSON.stringify(card));
  check('an older Room\'s scene icon still shows (bulb → mdi:lightbulb)', card.sc.join() === 'mdi:lightbulb,mdi:fan', JSON.stringify(card));
  check('the whole MDI library is searchable (> 5,000 icons contain an "e")', (await E(() => window.IniqIcons.search('e', 100000).length)) > 5000);
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
