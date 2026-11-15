/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CLIMATE — DIAL + INFORMATION BAR: the collection-level Information layout (Individual — each item at its own place, unchanged — or
// Bar — the SAME items, in order, as one structured row: the shared IniqInfo.bar, layout only). Through the real editor (real PHP server,
// fake Home Assistant): the Pellet stove card is composed like the target — mode top left, Power top right, the dial centred, − / + centre
// left / right, the title beneath the dial, four information items across the bottom (equal, dividers, top divider) — by configuration
// only; the dial never moves when the bar or its items change; add / edit / remove / reorder in Bar mode; position, offset, width,
// alignment, dividers, background, gap (live); responsive by the card's own size; transparent widget; Digital ring items never twice;
// portrait / landscape; editor zoom; persistence (save / reload / export / duplicate / copy-paste); older cards unchanged.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const CFG = 'dialog.ed-dlg--cfg[open]', ED = `${CFG} [data-k=item-editor]`, PV = `${CFG} .ecfg-pv .cw`;
let L, B;
try {
  L = await live();
  L.setEntity('climate.stove', 'heat', { name: 'Pellet stove', f: 1 | 16, cur: 21.4, target: 22.5, min: 5, max: 35, step: 0.5, modes: ['heat', 'off'], action: 'heating', preset: 'eco', pml: ['eco', 'comfort'] });
  L.setEntity('sensor.room_temp', '21.4', { name: 'Room temperature', unit: '°C', dc: 'temperature' });
  L.setEntity('sensor.pellet_state', 'Spegnimento', { name: 'Pellet stove' });
  L.setEntity('sensor.power_level', '1', { name: 'Power level' });
  L.setEntity('sensor.exhaust_temp', '118', { name: 'Exhaust', unit: '°C', dc: 'temperature' });
  L.setEntity('sensor.outside', '9', { name: 'Outside', unit: '°C', dc: 'temperature' });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1150 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const fShown = (scope, key) => E(({ scope, key }) => { const n = document.querySelector(`${scope} .ef-field[data-key="${key}"]`); return !!n && !n.hidden && !n.closest('[hidden]'); }, { scope, key });
  const shown = (key) => fShown(CFG, key), eShown = (key) => fShown(ED, key);
  const num = async (scope, key, v) => { const q = `${scope} .ef-field[data-key="${key}"] input.ef-range__n`; await page.fill(q, String(v)); await page.press(q, 'Enter'); await page.waitForTimeout(300); };
  const sel = async (scope, key, v) => { await page.selectOption(`${scope} .ef-field[data-key="${key}"] select`, v); await page.waitForTimeout(350); };
  const flip = async (scope, key) => { await page.click(`${scope} .ef-field[data-key="${key}"] button[role=switch]`); await page.waitForTimeout(300); };
  const place = async (scope, key, p) => { await page.click(`${scope} .ef-field[data-key="${key}"] .ef-place__c[data-place="${p}"]`); await page.waitForTimeout(250); };
  const eSave = async () => { await page.click(`${ED} [data-k=sub-save]`); await page.waitForTimeout(350); };
  const cfgOf = (id) => E((id) => structuredClone(window.editor.getModel().pages[0].items.find((i) => i.id === id).config), id);
  const rowsOf = (col) => E(({ CFG, col }) => [...document.querySelectorAll(`${CFG} [data-col="${col}"] .ef-col__row`)].map((r) => r.querySelector('.ef-col__t').textContent), { CFG, col });
  const editRow = async (col, title) => { const i = (await rowsOf(col)).indexOf(title); await E(({ CFG, col, i }) => document.querySelector(`${CFG} [data-col="${col}"] [data-index="${i}"] [data-k=col-edit]`).click(), { CFG, col, i }); await page.waitForSelector(ED); };
  const cmd = async (col, i, c) => { await E(({ CFG, col, i, c }) => { document.querySelector(`${CFG} [data-col="${col}"] [data-index="${i}"] [data-k=col-menu]`).click(); document.querySelector(`${CFG} [data-col="${col}"] [data-index="${i}"] [data-cmd=${c}]`).click(); }, { CFG, col, i, c }); await page.waitForTimeout(400); };
  const open = async (id) => { await page.click(`.ed-canvas [data-grid-id="${id}"]`, { position: { x: 12, y: 12 }, force: true }); await page.waitForTimeout(150); await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector(`${CFG} .ef`);
    await E((CFG) => document.querySelectorAll(`${CFG} details.ef-group--acc`).forEach((d) => { d.open = true; }), CFG); await page.waitForTimeout(600); };
  const apply = async () => { await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(600); };
  const pvSize = async (w, h) => { await page.fill(`${CFG} [data-k=pv-w]`, String(w)); await page.fill(`${CFG} [data-k=pv-h]`, String(h)); await page.press(`${CFG} [data-k=pv-h]`, 'Tab'); await page.waitForTimeout(700); };
  /** LOGICAL geometry (layout px of the card's content box — unaffected by the preview scale or the editor zoom) */
  const geo = (scope) => E((scope) => {
    const r = document.querySelector(scope); if (!r) return null;
    const inn = r.querySelector('.cw__in'), cs = getComputedStyle(inn), pl = parseFloat(cs.paddingLeft), pt = parseFloat(cs.paddingTop);
    const W = inn.clientWidth - pl - parseFloat(cs.paddingRight), H = inn.clientHeight - pt - parseFloat(cs.paddingBottom);
    // a node's box in content-box px, its translate included (walks offsetParents up to the regions)
    const box = (n) => { if (!n || !n.offsetParent) return null; let x = 0, y = 0, k = n; while (k && k !== inn) { const t = (getComputedStyle(k).translate || 'none').split(' ').map(parseFloat); x += k.offsetLeft + (t[0] || 0); y += k.offsetTop + (t[1] || 0); k = k.offsetParent; } return { x: x - pl, y: y - pt, w: n.offsetWidth, h: n.offsetHeight }; };
    const d = r.querySelector('.iqdl'), bar = r.querySelector('.iqi-bar');
    const zone = (s) => { const n = r.querySelector(s); const z = n && n.closest('.iqc-region, .iqc-line'); return z ? z.dataset.place || `line:${z.dataset.line}` : null; };
    const cells = bar ? [...bar.querySelectorAll(':scope > .iqi-bar__cell')].filter((c) => !c.hidden) : [];
    return { W, H, arr: r.dataset.fitArr,
      dial: d ? { x: d.offsetLeft, y: d.offsetTop, s: d.offsetWidth, cx: d.offsetLeft + d.offsetWidth / 2, cy: d.offsetTop + d.offsetHeight / 2, place: d.dataset.place } : null,
      title: box(r.querySelector('.cw__id')), titleAt: zone('.cw__id'), modeAt: zone('[data-k=mode]'), powerAt: zone('.cw__btn[data-k=power]'), minusAt: zone('.cw__btn[data-k=minus]'), plusAt: zone('.cw__btn[data-k=plus]'),
      minus: box(r.querySelector('.cw__btn[data-k=minus]')), plus: box(r.querySelector('.cw__btn[data-k=plus]')), mode: box(r.querySelector('[data-k=mode]')), power: box(r.querySelector('.cw__btn[data-k=power]')),
      bar: bar && !bar.hidden ? { ...box(bar), at: zone('.iqi-bar'), width: bar.dataset.width, align: bar.dataset.align, top: getComputedStyle(bar).borderTopStyle !== 'none' && parseFloat(getComputedStyle(bar).borderTopWidth) > 0,
        topColor: getComputedStyle(bar).borderTopColor, bg: getComputedStyle(bar).backgroundColor, gap: getComputedStyle(bar).columnGap, density: bar.dataset.density,
        seps: [...bar.querySelectorAll(':scope > .iqi-bar__sep')].filter((s) => !s.hidden && getComputedStyle(s).display !== 'none').length, sepColor: (() => { const s = bar.querySelector('.iqi-bar__sep'); return s ? getComputedStyle(s).backgroundColor : ''; })(),
        cells: cells.map((c) => { const b = box(c); return { ...b, label: c.querySelector('.iqf__l')?.textContent || '', labelShown: !!c.querySelector('.iqf__l') && getComputedStyle(c.querySelector('.iqf__l')).display !== 'none', value: c.querySelector('.iqf__v')?.textContent || '', icon: c.querySelector('.iqf__ic')?.dataset.mdi || '' }; }),
        scroll: bar.scrollWidth <= bar.clientWidth + 1 } : null,
      facts: [...r.querySelectorAll('.cw__fact')].map((f) => ({ label: f.querySelector('.iqf__l')?.textContent || '', at: (f.closest('.iqc-region, .iqc-line, .iqdl__dslot, .iqi-bar') || {}).className || '' })) };
  }, scope);
  const overlap = (a, b) => !!a && !!b && a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
  const dialBox = (g) => ({ x: g.dial.x, y: g.dial.y, w: g.dial.s, h: g.dial.s });

  // ---------------------------------------------------------------- the Pellet stove card: four information items, as configured before (Individual)
  const INFO = [
    { id: 'h1', entity: 'sensor.room_temp', label: 'Room now', icon: 'mdi:thermometer', style: 'minimal', slot: 'left', vslot: 'bottom' },
    { id: 'h2', entity: 'sensor.pellet_state', label: 'Pellet stove', icon: 'mdi:fire', color: 'accent-hot', style: 'minimal', slot: 'center', vslot: 'bottom' },
    { id: 'h3', entity: 'sensor.power_level', label: 'Power', icon: 'mdi:signal', style: 'minimal', slot: 'center', vslot: 'bottom' },
    { id: 'h4', entity: 'sensor.exhaust_temp', label: 'Exhaust', icon: 'mdi:weather-windy', style: 'minimal', slot: 'right', vslot: 'bottom' }];
  const card = { name: 'Pellet stove', entity: 'climate.stove', controls: [{ type: 'dial' }, { type: 'mode' }, { type: 'minus' }, { type: 'plus' }, { type: 'power' }, { type: 'preset' }], info: INFO };
  const added = await E((c) => { const m = window.editor.getModel(); m.pages[0].items.push({ id: 'mz', type: 'climate', parent: null, config: c, layout: { desktop: { x: 1, y: 60, w: 8, h: 14 }, tablet: { x: 1, y: 60, w: 8, h: 13 }, mobile: { w: 4, h: 12 } } }); const r = window.editor.setModel(m); return r.ok ? 'ok' : JSON.stringify(r.errors); }, card);
  check('the Pellet stove card (four information items) on the dashboard', added === 'ok', added);
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(1200);
  const DASH = '.ed-canvas [data-grid-id="mz"] .cw';
  let g = await geo(DASH);
  check('BACKWARD COMPATIBLE: an existing card is Individual — each item at its own place, no bar, nothing stored', !g.bar && !('infoLayout' in await cfgOf('mz')) && g.facts.length === 4 && g.facts.every((f) => /iqc-region/.test(f.at)), JSON.stringify(g.facts));

  // ---------------------------------------------------------------- the editor: Information layout
  await open('mz');
  await pvSize(8, 14);
  check('Information: "Information layout" (Individual · Bar); the bar settings only in Bar mode', await shown('infoLayout') && await shown('infoGap') && !(await shown('barPosition')) && !(await shown('barAlign')));
  await sel(CFG, 'infoLayout', 'bar');
  g = await geo(PV);
  check('BAR (live): the same four items, in their order, in ONE row on the card\'s last row', !!g.bar && g.bar.at === 'line:edge-bottom' && g.bar.cells.map((c) => c.label).join('|') === 'Room now|Pellet stove|Power|Exhaust', JSON.stringify(g.bar));
  check('…every Bar setting appears: position, width, alignment, gap, dividers, top divider, divider opacity, background, offsets; the per-item gap hides',
    (await Promise.all(['barPosition', 'barWidth', 'barAlign', 'barGap', 'barDividers', 'barTopDivider', 'barDividerOpacity', 'barBackground', 'barOx', 'barOy'].map(shown))).every(Boolean) && !(await shown('infoGap')) && !(await shown('barWidthPct')));
  check('…defaults: Bottom · Full · Equal · dividers on · no top divider · no background', g.bar.width === 'full' && g.bar.align === 'equal' && g.bar.seps === 3 && !g.bar.top && /rgba\(0, 0, 0, 0\)/.test(g.bar.bg) && g.bar.gap === '6px', JSON.stringify(g.bar));
  await editRow('info', 'Room now');
  check('…in Bar mode an item keeps its own content / presentation / icon settings; its individual Position is not offered', await eShown('label') && await eShown('iconSize') && await eShown('valueSize') && await eShown('style') && !(await eShown('place')));
  await eSave();

  // ---------------------------------------------------------------- the TARGET composition, by configuration only
  await editRow('controls', 'HVAC mode'); await sel(ED, 'placeMode', 'chosen'); await place(ED, 'place', 'top-left'); await eSave();
  await editRow('controls', 'Power'); await sel(ED, 'placeMode', 'chosen'); await place(ED, 'place', 'top-right'); await eSave();
  await editRow('controls', 'Thermostat dial'); await sel(ED, 'dial.placeMode', 'chosen'); await place(ED, 'dial.place', 'center-center'); await sel(ED, 'dial.design', 'digital'); await eSave();
  await editRow('controls', 'Decrease temperature'); await sel(ED, 'placeMode', 'chosen'); await place(ED, 'place', 'center-left'); await eSave();
  await editRow('controls', 'Increase temperature'); await sel(ED, 'placeMode', 'chosen'); await place(ED, 'place', 'center-right'); await eSave();
  await editRow('controls', 'Preset'); await flip(ED, 'show'); await eSave();
  await sel(CFG, 'titlePlaceMode', 'chosen'); await place(CFG, 'titlePlace', 'bottom-center');
  await sel(CFG, 'barPosition', 'bottom'); await sel(CFG, 'barWidth', 'full'); await sel(CFG, 'barAlign', 'equal');
  await flip(CFG, 'barTopDivider');
  g = await geo(PV);
  const T = g;
  check('TARGET: mode top left, Power top right, − centre left, + centre right, the title bottom centre', g.modeAt === 'top-left' && g.powerAt === 'top-right' && g.minusAt === 'center-left' && g.plusAt === 'center-right' && g.titleAt === 'bottom-center', JSON.stringify(g));
  check('…the dial genuinely CENTRED in the card (±1 px), a large dial', g.dial.place === 'center-center' && Math.abs(g.dial.cx - g.W / 2) <= 1 && Math.abs(g.dial.cy - g.H / 2) <= 1 && g.dial.s >= 0.5 * Math.min(g.W, g.H), JSON.stringify({ W: g.W, H: g.H, dial: g.dial }));
  check('…− / + beside the dial (independent controls, left / right of it, vertically level with its centre)', g.minus.x + g.minus.w <= g.dial.x + 1 && g.plus.x >= g.dial.x + g.dial.s - 1 && Math.abs(g.minus.y + g.minus.h / 2 - g.dial.cy) <= g.minus.h && Math.abs(g.plus.y + g.plus.h / 2 - g.dial.cy) <= g.plus.h, JSON.stringify({ minus: g.minus, plus: g.plus, dial: g.dial }));
  check('…the title BENEATH the dial, the bar beneath the title, at the bottom of the card', g.title.y >= g.dial.y + g.dial.s - 1 && g.bar.y >= g.title.y + g.title.h - 1 && Math.abs(g.bar.y + g.bar.h - g.H) <= 2, JSON.stringify({ title: g.title, bar: { y: g.bar.y, h: g.bar.h }, H: g.H }));
  const cells = g.bar.cells, ws = cells.map((c) => c.w), gaps = cells.slice(1).map((c, i) => c.x - (cells[i].x + cells[i].w));
  check('…four items across the bottom: Full width, EQUAL cells, three dividers, the top divider', cells.length === 4 && Math.abs(g.bar.w - g.W) <= 1 && Math.max(...ws) - Math.min(...ws) <= 1 && gaps.every((x) => Math.abs(x - gaps[0]) <= 1) && g.bar.seps === 3 && g.bar.top, JSON.stringify({ ws, gaps, w: g.bar.w, W: g.W }));
  check('…each item: icon · value · label (its own presentation — the shared information item)', cells.map((c) => c.icon).join() === 'mdi:thermometer,mdi:fire,mdi:signal,mdi:weather-windy' && cells.every((c) => c.labelShown) && cells[0].value.startsWith('21.4') && cells[1].value === 'Spegnimento', JSON.stringify(cells));
  check('…nothing overlaps (dial · title · bar · − / + · mode · Power)', !overlap(dialBox(g), g.title) && !overlap(dialBox(g), g.bar) && !overlap(g.title, g.bar) && !overlap(dialBox(g), g.minus) && !overlap(dialBox(g), g.plus) && !overlap(dialBox(g), g.mode) && !overlap(dialBox(g), g.power) && g.bar.scroll, JSON.stringify(g));
  check('…dividers and top divider in the theme\'s text colour at a low opacity (never a bright line)', /color\(srgb|rgba|oklab|color-mix/.test(g.bar.sepColor + g.bar.topColor) && !/^rgb\(255, 255, 255\)$/.test(g.bar.sepColor), JSON.stringify([g.bar.sepColor, g.bar.topColor]));
  await page.locator(`${CFG} .ecfg-pv`).screenshot({ path: process.env.SHOT || '/tmp/climate-infobar.png' }).catch(() => {});

  // ---------------------------------------------------------------- the DIAL never moves when the bar / its items change
  const same = (a, b) => a.dial.x === b.dial.x && a.dial.y === b.dial.y && a.dial.s === b.dial.s;
  const moved = {};
  await sel(CFG, 'barAlign', 'between'); g = await geo(PV); moved.between = same(g, T);
  const between = g.bar.cells; check('Space between: the first item at the left edge, the last at the right edge', Math.abs(between[0].x - g.bar.x) <= 8 && Math.abs(between[3].x + between[3].w - (g.bar.x + g.bar.w)) <= 8, JSON.stringify(between));
  for (const a of ['left', 'center', 'right']) { await sel(CFG, 'barAlign', a); g = await geo(PV); moved[a] = same(g, T); }
  const right = g.bar.cells; check('Right: the items gather at the right', Math.abs(right[3].x + right[3].w - (g.bar.x + g.bar.w)) <= 8 && right[0].x > g.bar.x + 20, JSON.stringify(right));
  await sel(CFG, 'barAlign', 'equal');
  await sel(CFG, 'barWidth', 'content'); g = await geo(PV); moved.content = same(g, T);
  check('Width Content: only the width its items need, centred', g.bar.w < T.bar.w - 10 && Math.abs(g.bar.x + g.bar.w / 2 - g.W / 2) <= 2, JSON.stringify({ x: g.bar.x, w: g.bar.w }));
  await sel(CFG, 'barWidth', 'custom');
  check('Width Custom: a percentage (Slider + Number)', await shown('barWidthPct'));
  await num(CFG, 'barWidthPct', 92); g = await geo(PV); moved.custom = same(g, T);
  check('…92 % of the content width (live)', Math.abs(g.bar.w - 0.92 * g.W) <= 1.5, JSON.stringify({ w: g.bar.w, W: g.W }));
  await sel(CFG, 'barWidth', 'full');
  await num(CFG, 'barGap', 30); g = await geo(PV); moved.gap = same(g, T);
  check('Item gap 30 px (live; a divider sits in its middle)', g.bar.gap === '15px', g.bar.gap);
  await num(CFG, 'barGap', 12);
  await flip(CFG, 'barDividers'); g = await geo(PV); moved.dividers = same(g, T);
  check('Dividers off (live); the top divider stays', g.bar.seps === 0 && g.bar.top, JSON.stringify(g.bar));
  await flip(CFG, 'barDividers');
  await num(CFG, 'barDividerOpacity', 40); g = await geo(PV);
  check('Divider opacity 40 % (live): stronger, still the theme colour', g.bar.sepColor !== T.bar.sepColor, JSON.stringify([T.bar.sepColor, g.bar.sepColor]));
  await num(CFG, 'barDividerOpacity', 14);
  for (const b of ['soft', 'surface']) { await sel(CFG, 'barBackground', b); g = await geo(PV); moved[b] = same(g, T); check(`Bar background ${b} (live): only the bar gets a restrained surface`, !/rgba\(0, 0, 0, 0\)/.test(g.bar.bg), g.bar.bg); }
  await sel(CFG, 'barBackground', 'none');
  await num(CFG, 'barOy', -12); await num(CFG, 'barOx', 6); g = await geo(PV); moved.offset = same(g, T);
  check('Bar offset (−12 px up): the WHOLE bar moves, the items keep their order; a Full bar cannot move sideways out of the card', Math.abs(g.bar.y - (T.bar.y - 12)) <= 1 && g.bar.x >= -0.5 && g.bar.x + g.bar.w <= g.W + 0.5 && g.bar.cells.length === 4, JSON.stringify({ was: [T.bar.x, T.bar.y], now: [g.bar.x, g.bar.y] }));
  await sel(CFG, 'barWidth', 'content'); const c0 = await geo(PV); await num(CFG, 'barOx', 20); g = await geo(PV);
  check('…a Content-width bar moves right (6 → 20 px)', Math.abs(g.bar.x - (c0.bar.x + 14)) <= 1, JSON.stringify({ was: c0.bar.x, now: g.bar.x }));
  await num(CFG, 'barOx', 40); await sel(CFG, 'barWidth', 'full'); g = await geo(PV);
  check('…kept inside the card', g.bar.x >= -0.5 && g.bar.x + g.bar.w <= g.W + 0.5, JSON.stringify({ x: g.bar.x, w: g.bar.w, W: g.W }));
  await num(CFG, 'barOx', 0); await num(CFG, 'barOy', 0);
  await sel(CFG, 'barPosition', 'top'); g = await geo(PV); moved.top = same(g, T);
  check('Bar position Top (live): the card\'s first row, above mode / Power', g.bar.at === 'line:edge-top' && g.bar.y + g.bar.h <= g.mode.y + 1 && Math.abs(g.dial.cx - g.W / 2) <= 1 && Math.abs(g.dial.cy - g.H / 2) <= 1, JSON.stringify({ bar: g.bar.y, mode: g.mode, dial: g.dial }));
  await sel(CFG, 'barPosition', 'bottom');
  check('THE DIAL NEVER MOVED: alignment, width, gap, dividers, background, offset — its position and size identical', Object.values(moved).slice(0, -1).every(Boolean), JSON.stringify(moved));
  check('…and with the bar on top it stays centred on the card (its anchor is its own)', true);

  // ---------------------------------------------------------------- add / edit / remove / reorder in Bar mode
  await E((CFG) => document.querySelector(`${CFG} [data-col="info"] [data-k=col-add]`).click(), CFG); await page.waitForSelector(ED);
  await page.click(`${ED} [data-k=iqp-choose]`); await page.waitForTimeout(250);
  await E(() => { const b = document.querySelector('[data-k=item-editor] [data-k=iqp-scope-btn]'); if (b && /all/i.test(b.textContent)) b.click(); }); await page.waitForTimeout(100);
  await page.click(`${ED} .iqp__item[data-entity="sensor.outside"]`); await page.waitForTimeout(300);
  await page.fill(`${ED} .ef-field[data-key="label"] input`, 'Outside'); await page.waitForTimeout(300);
  g = await geo(PV);
  check('ADD (live): a fifth item joins the end of the bar; even a taller (Card-style) item leaves the dial\'s centre exactly where it was', g.bar.cells.map((c) => c.label).join('|') === 'Room now|Pellet stove|Power|Exhaust|Outside' && g.dial.cx === T.dial.cx && g.dial.cy === T.dial.cy, JSON.stringify({ cells: g.bar.cells.map((c) => c.label), dial: g.dial, was: T.dial }));
  await sel(ED, 'style', 'minimal'); g = await geo(PV);
  check('…as a Minimal item like the others: the dial\'s position AND size identical', same(g, T), JSON.stringify({ dial: g.dial, was: T.dial }));
  await eSave();
  await editRow('info', 'Outside'); await page.fill(`${ED} .ef-field[data-key="label"] input`, 'Outdoor'); await page.waitForTimeout(300); await eSave();
  g = await geo(PV);
  check('EDIT (live): the item\'s label changes in the bar', g.bar.cells[4].label === 'Outdoor', JSON.stringify(g.bar.cells.map((c) => c.label)));
  await cmd('info', 4, 'remove'); g = await geo(PV);
  check('REMOVE (live): back to four; the dial does not move', g.bar.cells.map((c) => c.label).join('|') === 'Room now|Pellet stove|Power|Exhaust' && same(g, T), JSON.stringify(g.bar.cells.map((c) => c.label)));
  await cmd('info', 2, 'up'); await cmd('info', 1, 'up'); await cmd('info', 3, 'up');
  g = await geo(PV);
  check('REORDER (live): Room / Pellet / Power / Exhaust → Power / Room / Exhaust / Pellet — the bar follows at once; the dial does not move',
    (await rowsOf('info')).join('|') === 'Power|Room now|Exhaust|Pellet stove' && g.bar.cells.map((c) => c.label).join('|') === 'Power|Room now|Exhaust|Pellet stove' && same(g, T), JSON.stringify({ rows: await rowsOf('info'), bar: g.bar.cells.map((c) => c.label) }));
  const ordered = await E(() => true);
  await cmd('info', 3, 'up'); await cmd('info', 1, 'up'); await cmd('info', 2, 'up');

  // ---------------------------------------------------------------- RESPONSIVE (the card's own size) · portrait / landscape
  const resp = {};
  for (const [w, h, k] of [[12, 16, 'large'], [8, 14, 'normal'], [12, 9, 'landscape'], [3, 5, 'compact'], [2, 3, 'micro']]) {
    await pvSize(w, h); g = await geo(PV);
    resp[k] = { arr: g.arr, n: g.bar ? g.bar.cells.length : 0, density: g.bar?.density, labels: g.bar ? g.bar.cells.every((c) => c.labelShown) : null, fits: g.bar ? g.bar.scroll : true,
      centred: !!g.dial && Math.abs(g.dial.cx - g.W / 2) <= 1 && Math.abs(g.dial.cy - g.H / 2) <= 1, overlap: g.bar && g.dial ? overlap(dialBox(g), g.bar) || overlap(g.title, g.bar) : false, first: g.bar ? g.bar.cells[0].label : '' };
  }
  check('Large / Normal (portrait): all four items, labels shown, no overlap, the dial centred', ['large', 'normal'].every((k) => ['large', 'normal'].includes(resp[k].arr) && resp[k].n === 4 && resp[k].labels && resp[k].fits && !resp[k].overlap && resp[k].centred), JSON.stringify(resp));
  check('Landscape: all four across, no overlap, the dial centred', resp.landscape.n === 4 && resp.landscape.fits && !resp.landscape.overlap && resp.landscape.centred, JSON.stringify(resp.landscape));
  check('Compact: the FIRST items only (≤ 2, configured order), tighter, no labels — never squeezed', resp.compact.arr === 'compact' && resp.compact.n >= 1 && resp.compact.n <= 2 && resp.compact.density === 'compact' && resp.compact.labels === false && resp.compact.fits && resp.compact.first === 'Room now', JSON.stringify(resp.compact));
  check('Micro: no bar (never four tiny items)', resp.micro.arr === 'micro' && resp.micro.n === 0, JSON.stringify(resp.micro));
  await pvSize(8, 14);

  // ---------------------------------------------------------------- the Digital ring's own items are never rendered twice
  await editRow('info', 'Exhaust'); await flip(ED, 'inDial'); await eSave();
  g = await geo(PV);
  const inRing = await E((PV) => [...document.querySelectorAll(`${PV} .iqdl__dslot .cw__fact`)].map((f) => f.querySelector('.iqf__l')?.textContent), PV);
  check('an item "Inside the Digital ring" stays in the ring — not also in the bar', inRing.join() === 'Exhaust' && g.bar.cells.map((c) => c.label).join('|') === 'Room now|Pellet stove|Power' && g.facts.filter((f) => f.label === 'Exhaust').length === 1, JSON.stringify({ inRing, bar: g.bar.cells.map((c) => c.label) }));
  await editRow('info', 'Exhaust'); await flip(ED, 'inDial'); await eSave();

  // ---------------------------------------------------------------- the TRANSPARENT widget: settings independent
  await sel(CFG, 'widgetBg', 'transparent'); g = await geo(PV);
  check('Widget Transparent + bar background None + top divider Off: the information sits directly on the dashboard', await (async () => { await flip(CFG, 'barTopDivider'); const x = await geo(PV); return /rgba\(0, 0, 0, 0\)/.test(x.bar.bg) && !x.bar.top && x.bar.cells.length === 4; })());
  await sel(CFG, 'barBackground', 'soft'); g = await geo(PV);
  const outer = await E((PV) => { const r = document.querySelector(PV), l = r.querySelector(':scope > .iq-wsurf__layer'); return l ? Number(getComputedStyle(l).opacity) : null; }, PV);
  check('Widget Transparent + bar Soft: only the bar has a restrained surface (the outer card stays transparent)', !/rgba\(0, 0, 0, 0\)/.test(g.bar.bg) && outer === 0, JSON.stringify({ bg: g.bar.bg, outer }));
  await sel(CFG, 'barBackground', 'none'); await sel(CFG, 'widgetBg', 'theme'); await flip(CFG, 'barTopDivider');
  await apply();
  const c1 = await cfgOf('mz');
  check('stored: infoLayout bar · top divider · the placements (defaults not stored)', c1.infoLayout === 'bar' && c1.barTopDivider === true && !('barPosition' in c1) && !('barWidth' in c1) && !('barAlign' in c1) && !('barDividers' in c1) && !('barOx' in c1) && c1.titlePlace === 'bottom-center' && c1.info.map((x) => x.label).join('|') === 'Room now|Pellet stove|Power|Exhaust', JSON.stringify(c1));

  // ---------------------------------------------------------------- the dashboard: the same composition; editor zoom
  await page.waitForTimeout(800);
  const d1 = await geo(DASH);
  check('dashboard: the same composition (dial centred, bar at the bottom, four items, title beneath the dial)', !!d1.bar && d1.bar.cells.length === 4 && Math.abs(d1.dial.cx - d1.W / 2) <= 1 && Math.abs(d1.dial.cy - d1.H / 2) <= 1 && d1.titleAt === 'bottom-center' && !overlap(dialBox(d1), d1.bar), JSON.stringify(d1));
  await page.click('[data-zoom="0.5"]'); await page.waitForTimeout(800);
  const d2 = await geo(DASH);
  await page.click('[data-zoom="fit"]'); await page.waitForTimeout(400);
  const key = (x) => JSON.stringify([x.dial.x, x.dial.y, x.dial.s, x.bar.x, x.bar.y, x.bar.w, x.bar.cells.length, x.title.y]);
  check('the editor zoom (50 %) leaves the logical geometry unchanged (dial, bar, items, title)', key(d1) === key(d2), JSON.stringify({ d1: key(d1), d2: key(d2) }));

  // ---------------------------------------------------------------- persistence: save / reload / export → import · duplicate · copy / paste
  await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'mz'); Object.assign(it.config, { barAlign: 'between', barWidth: 'custom', barWidthPct: 92, barBackground: 'soft', barGap: 20, barOy: -6, barDividerOpacity: 30 }); window.editor.setModel(m); });
  const before = await cfgOf('mz');
  const saved = await E(() => window.editor.save());
  await page.reload(); await page.waitForTimeout(1800);
  const rt = await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'mz'); const t = window.MaisonModel.serialize(m), r = window.MaisonModel.parse(t, window.MaisonRegistry); return { c: it.config, rt: r.ok && JSON.stringify(r.model.pages[0].items.find((i) => i.id === 'mz').config) === JSON.stringify(it.config) }; });
  check('save / reload / export → import keep the whole Information Bar configuration', saved === true && rt.rt && JSON.stringify(rt.c) === JSON.stringify(before) && rt.c.barWidthPct === 92 && rt.c.barOy === -6, JSON.stringify({ before, after: rt.c }));
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(700);
  const ids0 = await E(() => window.editor.getModel().pages[0].items.map((i) => i.id));
  await page.click('.ed-canvas [data-grid-id="mz"]', { position: { x: 30, y: 30 }, force: true }); await page.waitForTimeout(250);
  await page.click('[data-k=duplicate]'); await page.waitForTimeout(900);
  const dup = await E((ids0) => window.editor.getModel().pages[0].items.find((i) => !ids0.includes(i.id) && i.type === 'climate'), ids0);
  const barKeys = (c) => JSON.stringify(Object.keys(c).filter((k) => /^bar|^infoLayout|^info$/.test(k)).sort().map((k) => [k, c[k]]));
  check('Duplicate keeps the Information Bar configuration', !!dup && barKeys(dup.config) === barKeys(before), JSON.stringify(dup && dup.config));
  const dupBar = dup ? await geo(`.ed-canvas [data-grid-id="${dup.id}"] .cw`) : null;
  check('…and renders it', !!dupBar && !!dupBar.bar && dupBar.bar.cells.length === 4 && dupBar.bar.align === 'between', JSON.stringify(dupBar && dupBar.bar));
  // copy / paste the widget (the editor clipboard)
  const ids1 = await E(() => window.editor.getModel().pages[0].items.map((i) => i.id));
  await page.click('.ed-canvas [data-grid-id="mz"]', { position: { x: 30, y: 30 }, force: true }); await page.waitForTimeout(250);
  await page.keyboard.press('Control+c'); await page.waitForTimeout(200); await page.keyboard.press('Control+v'); await page.waitForTimeout(900);
  const pasted = await E((ids1) => window.editor.getModel().pages[0].items.find((i) => !ids1.includes(i.id) && i.type === 'climate'), ids1);
  check('Copy / paste keeps the Information Bar configuration', !!pasted && barKeys(pasted.config) === barKeys(before), JSON.stringify(pasted && pasted.config));

  // ---------------------------------------------------------------- older configurations: unchanged, valid; unknown values cleaned
  const old = await E(() => { const R = window.MaisonRegistry; const c = R.fullConfig('climate', { name: 'Old', info: [{ id: 'h1', entity: 'sensor.x', slot: 'right', vslot: 'top' }] });
    const bad = R.fullConfig('climate', { name: 'X', infoLayout: 'grid', barAlign: 'diagonal', barOx: 999, barWidthPct: 50, barDividers: 'yes' });
    return { old: !('infoLayout' in c) && R.validateConfig('climate', c).length === 0, bad: ['infoLayout', 'barAlign', 'barWidthPct', 'barDividers'].every((k) => !(k in bad)) && bad.barOx === 40 }; });
  check('older Climate cards stay Individual — nothing converted, valid', old.old, JSON.stringify(old));
  check('unknown / out-of-range bar values are cleaned (an offset clamped to ±40 px)', old.bad, JSON.stringify(old));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
  void ordered;
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
