/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// POPUP HERO INFORMATION — content visibility, independent sizes and the structured 3 × 3 placement, through the REAL Popup Settings
// UI (the Information collection's item editor) on the reference popup (tests/lib/room-popup.mjs, demo entities of the fake Home
// Assistant). Every change is measured in the live preview / the runtime (positions and sizes), not only in the stored values.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';
import { roomPopup, POPUP_ID, DEMO_ENTITIES, HERO_INFO } from './lib/room-popup.mjs';

const D = 'dialog.ed-dlg--popup[open]';
const PV = `${D} [data-k=popup-preview]`;
let L, B;
try {
  L = await live();
  Object.entries(DEMO_ENTITIES).forEach(([k, v]) => L.setEntity(k, v[0], v[1]));
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1100 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const loaded = await E(({ pp }) => { const m = window.editor.getModel(); m.popups = [...(m.popups || []), pp]; const r = window.editor.setModel(m); return r.ok ? 'ok' : r.errors; }, { pp: roomPopup() });
  check('the reference popup loads (hero information saved before these settings existed)', loaded === 'ok', JSON.stringify(loaded));

  // ---- backward compatibility: older items keep their look (centre row, the presentation's own sizes)
  const old = await E(() => { const R = window.MaisonRegistry, pp = window.editor.getModel().popups.find((p) => p.id === 'salle-a-manger'), c = R.fullConfig('popup', pp.config);
    const info = window.MaisonPopup.heroFacts(c.heroInfo, { hero: 'medium' }); const r = [...info.querySelectorAll('.mpop__fact')].map((f) => `${f.parentElement.dataset.cell}:${f.dataset.style}:${f.dataset.vsize}/${f.dataset.lsize}/${f.dataset.isize}:${f.querySelectorAll('.mpop__fact-l').length}`); info.stop();
    return { r, errs: R.validateConfig('popup', c).length, same: JSON.stringify(window.MaisonForm.create({ type: 'popup', config: c }).value().heroInfo) === JSON.stringify(c.heroInfo) }; });
  check('old items: centre row, presentation sizes (card m/s/m, emphasis xl/m/l), labels shown, valid and unchanged by the form', old.r.join() === 'center-left:card:m/s/m:1,center-center:emphasis:xl/m/l:1,center-right:card:m/s/m:1' && old.errs === 0 && old.same, JSON.stringify(old));

  await E(() => window.editor.setEditing(true));
  await E((id) => window.editor.designPopup(id), POPUP_ID); await page.waitForTimeout(700);
  await page.click('[data-k="popup-settings"]'); await page.waitForSelector(D);
  await E((D) => { const d = document.querySelector(`${D} details[data-group="information"]`); if (!d.open) d.querySelector('summary').click(); }, D);
  await page.waitForFunction((PV) => document.querySelectorAll(`${PV} .mpop__fact[data-state="ready"]`).length === 3, PV, { timeout: 15000 }).catch(() => {});
  const ed = page.locator(`${D} [data-k=item-editor]`);
  const shown = (key) => E(({ D, key }) => { const n = document.querySelector(`${D} [data-k=item-editor] .ef-field[data-key="${key}"]`); return !!n && !n.hidden && n.offsetParent !== null; }, { D, key });
  /** open item i in the information editor, apply changes there, Save */
  const edit = async (i, { sel = {}, toggle = [], icon, before } = {}) => {
    await page.click(`${D} [data-col="heroInfo"] [data-index="${i}"] [data-k=col-edit]`); await ed.waitFor();
    if (before) await before();
    for (const k of toggle) { await ed.locator(`.ef-field[data-key="${k}"] button[role=switch]`).click(); await page.waitForTimeout(60); }
    if (icon !== undefined) { await ed.locator('.ef-field[data-key="icon"] [data-k=icon-field]').click(); if (icon) await ed.locator('.iqi__search').fill(icon); await ed.locator(`.iqi__opt[data-icon="${icon ? `mdi:${icon}` : ''}"]`).first().click(); await page.waitForTimeout(80); }
    // the position is ONE 3 × 3 selector; the sizes are the shared Slider + Number (the former S…XL steps typed as their px)
    if (sel.slot || sel.vslot) {
      const cur = await ed.locator('.ef-place__c[aria-checked="true"]').getAttribute('data-place'), [r0, c0] = cur.split('-');
      await ed.locator(`.ef-place__c[data-place="${sel.vslot || r0}-${sel.slot || c0}"]`).click(); await page.waitForTimeout(60);
    }
    const PX = { valueSize: { s: 15, m: 18, l: 30, xl: 56 }, labelSize: { s: 12, m: 14, l: 16 }, iconSize: { s: 20, m: 30, l: 40, xl: 56 } };
    for (const [k, v] of Object.entries(sel)) {
      if (k === 'slot' || k === 'vslot') continue;
      if (PX[k]) { const n = ed.locator(`.ef-field[data-key="${k}"] input.ef-range__n`); await n.fill(String(PX[k][v])); await n.press('Enter'); await page.waitForTimeout(60); }
      else await ed.locator(`.ef-field[data-key="${k}"] select`).selectOption(v);
    }
    await ed.locator('[data-k=sub-save]').click(); await page.waitForTimeout(220);
  };
  const fact = (id, root = PV) => E(({ id, root }) => {
    const f = document.querySelector(`${root} .mpop__fact[data-fact="${id}"]`); if (!f) return null;
    const area = f.closest('.mpop__info').getBoundingClientRect(), r = f.getBoundingClientRect(), v = f.querySelector('.mpop__fact-v'), l = f.querySelector('.mpop__fact-l'), ic = f.querySelector('.mpop__fact-ic');
    return { cell: f.parentElement.dataset.cell, top: r.top - area.top, mid: (r.top + r.bottom) / 2 - area.top, left: r.left - area.left, right: area.right - r.right, h: r.height,
      v: parseFloat(getComputedStyle(v).fontSize), l: l ? parseFloat(getComputedStyle(l).fontSize) : null, labels: f.querySelectorAll('.mpop__fact-l').length, label: l ? l.textContent : null,
      ic: ic ? parseFloat(getComputedStyle(ic).width) : null, text: v.textContent, style: f.dataset.style, align: f.dataset.align };
  }, { id, root });

  // ---- 13 the editor is conditional: label off hides the label settings; no icon hides the icon settings; no animation hides "when"
  await page.click(`${D} [data-col="heroInfo"] [data-index="0"] [data-k=col-edit]`); await ed.waitFor();
  const keys = await E((D) => [...document.querySelectorAll(`${D} [data-k=item-editor] .ef-field`)].filter((n) => !n.hidden).map((n) => n.dataset.key), D);
  check('the information editor: content · presentation (style, value / label / icon size, alignment) · position (horizontal + vertical) · icon look',
    ['entity', 'value', 'showLabel', 'label', 'icon', 'style', 'valueSize', 'labelSize', 'iconSize', 'align', 'place', 'color', 'iconBg', 'animation'].every((k) => keys.includes(k)), keys.join());
  check('animation None: no "Animate when"', !(await shown('animateWhen')));
  await ed.locator('.ef-field[data-key="animation"] select').selectOption('pulse');
  check('animation on: "Animate when" appears', await shown('animateWhen'));
  await ed.locator('.ef-field[data-key="showLabel"] button[role=switch]').click(); await page.waitForTimeout(60);
  check('Show label OFF hides the label text, place and size', !(await shown('label')) && !(await shown('labelSize')) && !(await shown('labelPos')));
  await ed.locator('.ef-field[data-key="showLabel"] button[role=switch]').click(); await page.waitForTimeout(60);
  await page.mouse.click(10, 600); await page.waitForTimeout(200);
  check('a click outside the information editor closes neither it nor Popup Settings', await E((D) => !!document.querySelector(`${D} [data-k=item-editor][open]`) && !!document.querySelector(D), D));
  await ed.locator('[data-k=sub-cancel]').click(); await page.waitForTimeout(150);
  await page.click(`${D} [data-col="heroInfo"] [data-index="2"] [data-k=col-edit]`); await ed.waitFor();
  await ed.locator('.ef-field[data-key="icon"] [data-k=icon-field]').click(); await ed.locator('.iqi__opt[data-icon=""]').first().click(); await page.waitForTimeout(80);
  check('no icon: no icon size, placement, background, colour or animation', !(await shown('iconSize')) && !(await shown('iconPos')) && !(await shown('iconBg')) && !(await shown('color')) && !(await shown('animation')));
  await ed.locator('[data-k=sub-cancel]').click(); await page.waitForTimeout(150);

  // ---- 19 the reference: A left [icon] value, no label · B centre XL value + small label, no icon, bare · C right card icon/value/label
  const hA0 = await fact('h1');
  await edit(0, { toggle: ['showLabel'] });
  const A = await fact('h1');
  check('A Show label OFF: no label element at all, the item is shorter (no reserved space), [icon] 58% remains', A.labels === 0 && A.h < hA0.h - 4 && A.ic && A.text === '58%', JSON.stringify({ hA0, A }));
  await edit(1, { sel: { style: 'minimal' } });
  await edit(1, { sel: { valueSize: 'xl', labelSize: 's', align: 'center' } });
  const Bc = await fact('h2');
  check('B centre: XL value, small "Room temperature" label, no icon, bare (minimal) over the picture', Bc.cell === 'center-center' && Bc.style === 'minimal' && Bc.v >= 36 && Bc.l === 12 && Bc.ic === null && Bc.label === 'Room temperature', JSON.stringify(Bc));
  const C = await fact('h3');
  check('C right: a card with the light icon, 0/1 and "Lights on"', C.cell === 'center-right' && C.style === 'card' && C.ic > 0 && C.text === '0/1' && C.label === 'Lights on', JSON.stringify(C));

  // ---- 20 vertical placement: one item through top · centre · bottom (left column, then right column) — measured
  const vs = {};
  for (const v of ['top', 'center', 'bottom']) { await edit(0, { sel: { vslot: v } }); vs[`L-${v}`] = await fact('h1'); }
  check('20 left: top → centre → bottom genuinely move down (cells top-left / center-left / bottom-left)', vs['L-top'].cell === 'top-left' && vs['L-center'].cell === 'center-left' && vs['L-bottom'].cell === 'bottom-left'
    && vs['L-top'].mid + 20 < vs['L-center'].mid && vs['L-center'].mid + 20 < vs['L-bottom'].mid && Math.abs(vs['L-top'].left - vs['L-bottom'].left) < 2, JSON.stringify(vs));
  for (const v of ['top', 'bottom', 'center']) { await edit(2, { sel: { vslot: v } }); vs[`R-${v}`] = await fact('h3'); }
  check('20 right: top-right / center-right / bottom-right genuinely differ vertically, still on the right', vs['R-top'].cell === 'top-right' && vs['R-bottom'].cell === 'bottom-right' && vs['R-center'].cell === 'center-right'
    && vs['R-top'].mid + 20 < vs['R-center'].mid && vs['R-center'].mid + 20 < vs['R-bottom'].mid && Math.abs(vs['R-top'].right - vs['R-bottom'].right) < 2 && vs['R-top'].right < vs['R-top'].left, JSON.stringify(vs));
  await edit(1, { sel: { vslot: 'top' } }); const Bt = await fact('h2');
  await edit(1, { sel: { vslot: 'center' } }); const Bm = await fact('h2');
  check('20 centre column too: top-center sits above center-center', Bt.cell === 'top-center' && Bt.mid + 20 < Bm.mid, JSON.stringify({ Bt, Bm }));
  check('top placement stays BELOW the title and the buttons (never under them)', await E((PV) => { const p = document.querySelector(PV), head = p.querySelector('.mpop__head').getBoundingClientRect(); return [...p.querySelectorAll('.mpop__fact')].every((f) => f.getBoundingClientRect().top >= head.bottom - 1); }, PV));
  await edit(0, { sel: { vslot: 'center' } });

  // ---- 21 sizes are independent (item C, the card): value s → xl, icon s → xl, label s → l
  const series = async (key, vals) => { const out = []; for (const v of vals) { await edit(2, { sel: { [key]: v } }); out.push(await fact('h3')); } return out; };
  const val = await series('valueSize', ['s', 'm', 'l', 'xl']);
  check('21 value Small → Medium → Large → XL grows; the icon and the label do not change', val.every((x, i) => !i || x.v > val[i - 1].v) && val.every((x) => x.ic === val[0].ic && x.l === val[0].l), JSON.stringify(val.map((x) => [x.v, x.ic, x.l])));
  const ics = await series('iconSize', ['s', 'm', 'l', 'xl']);
  check('21 icon Small → Medium → Large → XL grows; the value and the label do not change', ics.every((x, i) => !i || x.ic > ics[i - 1].ic) && ics.every((x) => x.v === ics[0].v && x.l === ics[0].l), JSON.stringify(ics.map((x) => [x.ic, x.v, x.l])));
  const lbs = await series('labelSize', ['s', 'm', 'l']);
  check('21 label Small → Medium → Large grows; the value and the icon do not change', lbs.every((x, i) => !i || x.l > lbs[i - 1].l) && lbs.every((x) => x.v === lbs[0].v && x.ic === lbs[0].ic), JSON.stringify(lbs.map((x) => [x.l, x.v, x.ic])));
  await edit(2, { sel: { valueSize: 'm', iconSize: 'm', labelSize: 's' } });

  // ---- 8 several items in one cell: list order, side by side, no overlap
  await edit(0, { sel: { slot: 'right', vslot: 'top' } });
  await edit(2, { sel: { vslot: 'top' } });
  const same = await E((PV) => { const c = document.querySelector(`${PV} .mpop__slot[data-cell="top-right"]`), f = [...c.querySelectorAll('.mpop__fact')], r = f.map((x) => x.getBoundingClientRect());
    return { ids: f.map((x) => x.dataset.fact).join(), overlap: r[0] && r[1] && r[0].left < r[1].right && r[1].left < r[0].right && r[0].top < r[1].bottom && r[1].top < r[0].bottom }; }, PV);
  check('8 two items in the same cell (top right): list order, side by side, no overlap', same.ids === 'h1,h3' && same.overlap === false, JSON.stringify(same));
  await edit(0, { sel: { slot: 'left', vslot: 'center' } });
  await edit(2, { sel: { vslot: 'center' } });

  // ---- Apply · persistence · runtime
  await page.click(`${D} [data-k=apply-def]`); await page.waitForTimeout(400);
  const stored = await E((id) => window.editor.getModel().popups.find((p) => p.id === id).config.heroInfo, POPUP_ID);
  check('stored per item: label off, sizes, alignment, style, vertical position (defaults not stored)', stored[0].showLabel === false && !('vslot' in stored[0]) && !('labelSize' in stored[0])
    && stored[1].style === 'minimal' && stored[1].valueSize === 56 && stored[1].labelSize === 12 && stored[1].align === 'center' && !('vslot' in stored[1])
    && stored[2].valueSize === 18 && stored[2].iconSize === 30 && stored[2].labelSize === 12 && !('vslot' in stored[2]), JSON.stringify(stored));
  const saved = await E(() => window.editor.save());
  await page.reload(); await page.waitForTimeout(1500);
  const back = await E((id) => window.editor.getModel().popups.find((p) => p.id === id).config.heroInfo, POPUP_ID);
  check('save / reload keep every item setting', saved === true && JSON.stringify(back) === JSON.stringify(stored), JSON.stringify(back));
  await E((id) => window.editor.openPopup(id), POPUP_ID); await page.waitForTimeout(1200);
  await page.waitForFunction(() => document.querySelectorAll('.mpop .mpop__fact[data-state="ready"]').length === 3, null, { timeout: 15000 }).catch(() => {});
  const run = { A: await fact('h1', '.mpop'), B: await fact('h2', '.mpop'), C: await fact('h3', '.mpop') };
  check('runtime = preview: [icon] 58% (no label) left · XL 22.2 °C + small label centre · card right', run.A.labels === 0 && run.A.cell === 'center-left' && run.B.v >= 36 && run.B.l === 12 && run.B.cell === 'center-center' && run.C.cell === 'center-right' && run.C.style === 'card', JSON.stringify(run));
  await page.click('.mpop .mtabs__tab[data-tab="media"]'); await page.waitForTimeout(150);
  check('the tabs below still switch; the hero stays', (await E(() => document.querySelectorAll('.mpop .mpop__fact').length)) === 3 && (await E(() => document.querySelector('.mpop .mtabs__tab[aria-selected="true"]').dataset.tab)) === 'media');
  await E(() => window.editor.closePopup()); await page.waitForTimeout(300);

  // ---- 15 responsive: every cell used, at a narrow width — no overlap, nothing outside, vertical order kept
  const narrow = await E((list) => {
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:360px;z-index:99999';
    const R = window.MaisonRegistry, cells = ['top', 'center', 'bottom'].flatMap((v) => ['left', 'center', 'right'].map((s) => ({ vslot: v, slot: s })));
    const info = list.length ? null : null;
    const heroInfo = cells.map((c, i) => ({ id: `n${i}`, entity: 'sensor.demo_dining_temperature', value: 'state', label: 'Label', icon: 'mdi:thermometer', style: i % 2 ? 'card' : 'minimal', valueSize: i === 4 ? 'xl' : 'm', ...c }));
    const ch = window.MaisonPopup.chrome(R.fullConfig('popup', { title: 'A long popup title here', subtitle: 'Sub', image: 'assets/img/popups/demo-dining.svg', backButton: true, menu: 'navigate', menuPage: 'home', heroInfo }), { name: 'x', icons: R.icons(), design: true });
    const panel = document.createElement('section'); panel.className = 'mpop__panel has-hero'; panel.style.cssText = 'width:360px;height:760px';
    panel.append(ch.hero, ch.head, ch.info); host.append(panel); document.body.append(host);
    const f = [...panel.querySelectorAll('.mpop__fact')].map((x) => ({ r: x.getBoundingClientRect(), row: x.parentElement.dataset.row }));
    const overlap = f.some((a, i) => f.some((b, j) => i < j && a.r.left < b.r.right - 1 && b.r.left < a.r.right - 1 && a.r.top < b.r.bottom - 1 && b.r.top < a.r.bottom - 1));
    const top = (row) => Math.min(...f.filter((x) => x.row === row).map((x) => x.r.top)), bot = (row) => Math.max(...f.filter((x) => x.row === row).map((x) => x.r.bottom));
    const head = panel.querySelector('.mpop__head').getBoundingClientRect();
    const res = { overlap, inside: f.every((x) => x.r.left >= -0.5 && x.r.right <= 360.5), order: bot('top') <= top('center') + 1 && bot('center') <= top('bottom') + 1, belowHead: f.every((x) => x.r.top >= head.bottom - 1), btns: [...panel.querySelectorAll('.mpop__btn')].every((b) => b.getBoundingClientRect().right <= 360) };
    ch.info.stop(); host.remove();
    return res;
  }, []);
  check('15 narrow (360 px), all nine cells used: no overlap, nothing outside, top above centre above bottom, all below the header, buttons reachable', !narrow.overlap && narrow.inside && narrow.order && narrow.belowHead && narrow.btns, JSON.stringify(narrow));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
  void HERO_INFO;
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
