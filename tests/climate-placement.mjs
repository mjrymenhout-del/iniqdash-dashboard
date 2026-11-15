/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// CLIMATE — composition: the ring dial is placed from ITS OWN anchor (a centre anchor is the card's true centre — never derived from the
// rows or the − / + controls), with a small logical-px OFFSET; − / + (and the other discrete controls) have their own position and offset;
// offsets survive dial-design changes, are kept inside the card, ignore the editor zoom and persist (save / reload / export). Then the
// DIGITAL RING: the same climate model, a thin state ring (the ACTION's colour), the primary / secondary temperatures, chosen Information
// items inside the dial (structured places, their own icon sizes and truthful animations), simplified by the dial's size; portrait /
// landscape. Real PHP server, fake Home Assistant (no real HA).
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const CFG = 'dialog.ed-dlg--cfg[open]', ED = `${CFG} [data-k=item-editor]`, PV = `${CFG} .ecfg-pv .cw`;
const STOVE = { name: 'Pellet stove', f: 1 | 16, cur: 21.4, target: 22.5, min: 7, max: 30, step: 0.5, modes: ['heat', 'cool', 'off'], action: 'heating', preset: 'eco', pml: ['eco', 'comfort'] };
let L, B;
try {
  L = await live();
  const stove = (state, x = {}) => L.setEntity('climate.stove', state, { ...STOVE, ...x });
  stove('heat');
  L.setEntity('sensor.outside', '30', { name: 'Outside', unit: '°C', dc: 'temperature' });
  L.setEntity('sensor.hum', '80', { name: 'Humidity', unit: '%', dc: 'humidity' });
  L.setEntity('fan.exhaust', 'on', { name: 'Exhaust' });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1150 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const eShown = (key) => E(({ ED, key }) => { const n = document.querySelector(`${ED} .ef-field[data-key="${key}"]`); return !!n && !n.hidden && !n.closest('[hidden]'); }, { ED, key });
  const eNum = async (key, v) => { const q = `${ED} .ef-field[data-key="${key}"] input.ef-range__n`; await page.fill(q, String(v)); await page.press(q, 'Enter'); await page.waitForTimeout(250); };
  const eSel = async (key, v) => { await page.selectOption(`${ED} .ef-field[data-key="${key}"] select`, v); await page.waitForTimeout(250); };
  const eHex = (key, hex) => E(({ ED, key, hex }) => { const p = document.querySelector(`${ED} .ef-field[data-key="${key}"] [data-k=color-pick]`); p.value = hex; p.dispatchEvent(new Event('input', { bubbles: true })); }, { ED, key, hex });
  const eSwitch = async (key) => { await page.click(`${ED} .ef-field[data-key="${key}"] button[role=switch]`); await page.waitForTimeout(200); };
  const ePlace = async (key, p) => { await page.click(`${ED} .ef-field[data-key="${key}"] .ef-place__c[data-place="${p}"]`); await page.waitForTimeout(250); };
  const eSave = async () => { await page.click(`${ED} [data-k=sub-save]`); await page.waitForTimeout(300); };
  const cfgOf = (id) => E((id) => structuredClone(window.editor.getModel().pages[0].items.find((i) => i.id === id).config), id);
  const rowsOf = (col) => E(({ CFG, col }) => [...document.querySelectorAll(`${CFG} [data-col="${col}"] .ef-col__row`)].map((r) => r.querySelector('.ef-col__t').textContent), { CFG, col });
  const editRow = async (col, title) => { const i = (await rowsOf(col)).indexOf(title); await E(({ CFG, col, i }) => document.querySelector(`${CFG} [data-col="${col}"] [data-index="${i}"] [data-k=col-edit]`).click(), { CFG, col, i }); await page.waitForSelector(ED); };
  const open = async (id) => { await page.click(`.ed-canvas [data-grid-id="${id}"]`, { position: { x: 12, y: 12 }, force: true }); await page.waitForTimeout(150); await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector(`${CFG} .ef`);
    await E((CFG) => document.querySelectorAll(`${CFG} details.ef-group--acc`).forEach((d) => { d.open = true; }), CFG); await page.waitForTimeout(600); };
  const apply = async () => { await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(500); };
  const pvSize = async (w, h) => { await page.fill(`${CFG} [data-k=pv-w]`, String(w)); await page.fill(`${CFG} [data-k=pv-h]`, String(h)); await page.press(`${CFG} [data-k=pv-h]`, 'Tab'); await page.waitForTimeout(600); };
  /** LOGICAL geometry (layout px — unaffected by the preview's scale or the editor zoom): the card's content box, the dial and a control */
  const geo = (scope) => E((scope) => {
    const r = document.querySelector(scope), inn = r.querySelector('.cw__in'), cs = getComputedStyle(inn), pl = parseFloat(cs.paddingLeft), pt = parseFloat(cs.paddingTop);
    const W = inn.clientWidth - pl - parseFloat(cs.paddingRight), H = inn.clientHeight - pt - parseFloat(cs.paddingBottom), d = r.querySelector('.iqdl');
    const ctl = (k) => { const n = r.querySelector(`.cw__btn[data-k=${k}]`); if (!n) return null; const t = (n.style.translate || '0px 0px').split(' ').map(parseFloat); return { x: n.offsetLeft - pl + (t[0] || 0), y: n.offsetTop - pt + (t[1] || 0), w: n.offsetWidth, place: n.closest('.iqc-region')?.dataset.place, ox: Number(n.dataset.ox || 0), oy: Number(n.dataset.oy || 0) }; };
    return { W, H, dial: { x: d.offsetLeft, y: d.offsetTop, s: d.offsetWidth, cx: d.offsetLeft + d.offsetWidth / 2, cy: d.offsetTop + d.offsetHeight / 2, place: d.dataset.place, ox: Number(d.dataset.ox), oy: Number(d.dataset.oy), design: d.dataset.design, centred: d.dataset.centred },
      minus: ctl('minus'), plus: ctl('plus'), power: ctl('power') }; }, scope);

  // ---------------------------------------------------------------- the card described: Pellet stove · mode + Power top right · Preset at the bottom
  const cfg0 = { name: 'Pellet stove', entity: 'climate.stove', controls: [{ type: 'dial' }, { type: 'mode' }, { type: 'minus' }, { type: 'plus' }, { type: 'power' }, { type: 'preset' }] };
  const added = await E((c) => { const m = window.editor.getModel(); m.pages[0].items.push({ id: 'mz', type: 'climate', parent: null, config: c, layout: { desktop: { x: 1, y: 60, w: 5, h: 13 }, tablet: { x: 1, y: 60, w: 5, h: 12 }, mobile: { w: 4, h: 10 } } }); const r = window.editor.setModel(m); return r.ok ? 'ok' : JSON.stringify(r.errors); }, cfg0);
  check('the Pellet stove card on the dashboard', added === 'ok', added);
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(1200);
  const DASH = '.ed-canvas [data-grid-id="mz"] .cw';
  let g = await geo(DASH);
  check('1 the dial is CENTRED in the card (Centre, no offset): its centre is the content box\'s centre (±1 px)', g.dial.place === 'center-center' && g.dial.centred === 'card' && Math.abs(g.dial.cx - g.W / 2) <= 1 && Math.abs(g.dial.cy - g.H / 2) <= 1, JSON.stringify(g));
  check('…the title, mode / Power and Preset keep their places; − / + have their own (bottom left / bottom right), not the dial\'s', await E((D) => { const r = document.querySelector(D), z = (s) => r.querySelector(s)?.closest('.iqc-region, .iqc-line'); return z('.cw__id').dataset.place === 'top-left' && z('[data-k=mode]').dataset.place === 'top-right' && z('.cw__btn[data-k=power]').dataset.place === 'top-right' && z('[data-k=preset]').dataset.line === 'bottom'; }, DASH)
    && g.minus.place === 'bottom-left' && g.plus.place === 'bottom-right', JSON.stringify({ minus: g.minus, plus: g.plus }));

  // ---------------------------------------------------------------- the DIAL: position + offset (live)
  await open('mz');
  await pvSize(5, 13);
  g = await geo(PV);
  check('preview: centred the same way', Math.abs(g.dial.cx - g.W / 2) <= 1 && Math.abs(g.dial.cy - g.H / 2) <= 1, JSON.stringify(g.dial));
  const base = g;
  await editRow('controls', 'Thermostat dial');
  check('dial placement: Automatic, a 3 × 3 position, and its X / Y offsets (Slider + Number, px)', await eShown('dial.placeMode') && await eShown('nudge.ox') && await eShown('nudge.oy'));
  await eSel('dial.placeMode', 'chosen');
  check('Dial position → Centre (chosen): unchanged', (await geo(PV)).dial.place === 'center-center' && Math.abs((await geo(PV)).dial.cx - g.W / 2) <= 1);
  await eNum('nudge.ox', 30); await eNum('nudge.oy', -15);
  g = await geo(PV);
  check('2 Dial X +30, Y −15: it moves at once by exactly (+30, −15) logical px', g.dial.ox === 30 && g.dial.oy === -15 && Math.abs(g.dial.cx - base.dial.cx - 30) <= 1 && Math.abs(g.dial.cy - base.dial.cy + 15) <= 1, JSON.stringify({ before: base.dial, after: g.dial }));
  check('…− and + did not move', JSON.stringify([g.minus.x, g.minus.y, g.plus.x, g.plus.y]) === JSON.stringify([base.minus.x, base.minus.y, base.plus.x, base.plus.y]), JSON.stringify({ base: [base.minus, base.plus], now: [g.minus, g.plus] }));
  // its offset survives every DESIGN (size, position and offset unchanged)
  const ds = {};
  for (const d of ['minimal', 'arc', 'full', 'digital', 'spectrum']) { await eSel('dial.design', d); ds[d] = await geo(PV); }
  check('3 Spectrum → Minimal → Arc → Full → Digital: the SAME anchor, offset, size and centre for every design', Object.values(ds).every((x) => x.dial.place === 'center-center' && x.dial.ox === 30 && x.dial.oy === -15 && x.dial.s === g.dial.s && Math.abs(x.dial.cx - g.dial.cx) <= 1 && Math.abs(x.dial.cy - g.dial.cy) <= 1),
    JSON.stringify(Object.fromEntries(Object.entries(ds).map(([k, x]) => [k, x.dial]))));
  await eSave();

  // ---------------------------------------------------------------- − and + : their own position + offset, independently
  await editRow('controls', 'Decrease temperature');
  check('Decrease: its own position and X / Y offsets', await eShown('placeMode') && await eShown('nudge.ox'));
  await eSel('placeMode', 'chosen'); await ePlace('place', 'center-left'); await eNum('nudge.ox', 20); await eNum('nudge.oy', 30); await eSave();
  await editRow('controls', 'Increase temperature');
  await eSel('placeMode', 'chosen'); await ePlace('place', 'center-right'); await eNum('nudge.ox', -20); await eNum('nudge.oy', -10); await eSave();
  g = await geo(PV);
  check('4 Decrease: centre left (+20, +30) · Increase: centre right (−20, −10)', g.minus.place === 'center-left' && g.minus.ox === 20 && g.minus.oy === 30 && g.plus.place === 'center-right' && g.plus.ox === -20 && g.plus.oy === -10, JSON.stringify({ minus: g.minus, plus: g.plus }));
  const s1 = g;
  await editRow('controls', 'Increase temperature'); await eNum('nudge.oy', 25); await page.waitForTimeout(200);
  g = await geo(PV);
  check('move ONLY Increase (Y −10 → +25): Decrease and the dial unchanged', g.plus.oy === 25 && Math.abs(g.plus.y - s1.plus.y - 35) <= 1 && g.minus.x === s1.minus.x && g.minus.y === s1.minus.y && g.dial.cx === s1.dial.cx && g.dial.cy === s1.dial.cy, JSON.stringify({ s1, g }));
  await eSave();
  const s2 = g;
  await editRow('controls', 'Thermostat dial'); await eNum('nudge.ox', -25); await page.waitForTimeout(200);
  g = await geo(PV);
  check('move ONLY the dial (X +30 → −25): Increase and Decrease unchanged', g.dial.ox === -25 && g.minus.x === s2.minus.x && g.minus.y === s2.minus.y && g.plus.x === s2.plus.x && g.plus.y === s2.plus.y, JSON.stringify({ s2: [s2.minus, s2.plus], g: [g.minus, g.plus] }));
  check('a dial position (centre left) never moves − / +', await (async () => { await eSel('dial.placeMode', 'chosen'); await ePlace('dial.place', 'center-left'); const x = await geo(PV); await ePlace('dial.place', 'center-center'); return x.dial.place === 'center-left' && x.minus.x === s2.minus.x && x.plus.x === s2.plus.x; })());
  await eNum('nudge.ox', 30); await eSave();
  // Power, mode, preset also take an offset (discrete controls); the title does not
  await editRow('controls', 'Power');
  check('Power has an offset too (a discrete control)', await eShown('nudge.ox'));
  await page.click(`${ED} [data-k=sub-cancel]`); await page.waitForTimeout(200);
  await editRow('controls', 'Preset');
  check('Preset (a discrete control on its line) has an offset; the title has none', await eShown('nudge.ox') && !(await E((CFG) => !!document.querySelector(`${CFG} details[data-group="appearance"] .ef-field[data-key*="ox"]`), CFG)));
  await page.click(`${ED} [data-k=sub-cancel]`); await page.waitForTimeout(200);
  await apply();
  const c1 = await cfgOf('mz');
  check('stored as anchor + offset (no coordinates): dial centre +30/−15, Decrease centre left +20/+30, Increase centre right −20/+25',
    JSON.stringify(c1.controls.filter((x) => ['dial', 'minus', 'plus'].includes(x.type)).map((x) => [x.type, x.place, x.ox, x.oy])) === JSON.stringify([['dial', 'center-center', 30, -15], ['minus', 'center-left', 20, 30], ['plus', 'center-right', -20, 25]]), JSON.stringify(c1.controls));

  // ---------------------------------------------------------------- responsive: offsets are clamped (only as much as needed) to keep everything inside
  const clamp = await E((c) => {
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999;display:flex;gap:8px'; document.body.append(host);
    const mk = (w, h) => { const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;display:grid`; host.append(b); b.append(window.MaisonRegistry.build('climate', { ...c, entity: undefined, hvacModes: ['heat', 'cool', 'off'], capabilities: { targetTemperature: true, hvacMode: true },
      controls: c.controls.map((x) => (x.type === 'dial' || x.type === 'power' ? { ...x, ox: 120, oy: 120 } : x)) })); return b; };
    const bs = [mk(150, 140), mk(260, 260), mk(420, 640)];
    return new Promise((res) => setTimeout(() => { const out = bs.map((b) => { const r = b.querySelector('.cw'), rr = r.getBoundingClientRect(); const inside = [...r.querySelectorAll('.iqdl, .cw__btn, .iqc-seg')].filter((n) => n.offsetParent).every((n) => { const q = n.getBoundingClientRect(); return q.left >= rr.left - 1 && q.right <= rr.right + 1 && q.top >= rr.top - 1 && q.bottom <= rr.bottom + 1; });
      const d = r.querySelector('.iqdl'); return { arr: r.dataset.fitArr, inside, dox: Number(d.dataset.ox), place: d.dataset.place }; }); host.remove(); res(out); }, 1200));
  }, c1);
  check('6 an offset that would push the dial / Power out is reduced only as needed: everything stays inside, the anchor kept (Micro · Compact · Normal)', clamp.every((x) => x.inside && x.place === 'center-center' && x.dox >= 0 && x.dox <= 120) && clamp.some((x) => x.dox < 120), JSON.stringify(clamp));
  // the editor zoom never changes the logical placement
  const z1 = await geo(DASH);
  await page.click('[data-zoom="0.5"]'); await page.waitForTimeout(700);
  const z2 = await geo(DASH);
  await page.click('[data-zoom="fit"]'); await page.waitForTimeout(400);
  check('the editor zoom (50 %) leaves the logical placement unchanged (dial, − / +)', JSON.stringify([z1.dial.x, z1.dial.y, z1.dial.s, z1.minus.x, z1.minus.y, z1.plus.x, z1.plus.y]) === JSON.stringify([z2.dial.x, z2.dial.y, z2.dial.s, z2.minus.x, z2.minus.y, z2.plus.x, z2.plus.y]), JSON.stringify({ z1, z2 }));

  // ---------------------------------------------------------------- DIGITAL RING (the same climate, the same entity)
  await open('mz');
  await pvSize(10, 13);
  await editRow('controls', 'Thermostat dial');
  await eSel('dial.design', 'digital');
  check('Digital ring options: ring thickness, active arc, ring colour, face, depth, minimal ticks (off by default) — not the other designs\' options',
    await eShown('dial.thickness') && await eShown('dial.activeArc') && await eShown('dial.ringColor') && await eShown('dial.surface') && await eShown('dial.depth') && await eShown('dial.dticks') && !(await eShown('dial.ring')) && !(await eShown('dial.density')) && !(await eShown('dial.minmax')));
  await eSel('dial.primary', 'current'); await eNum('dial.thickness', 4); await eHex('dial.heatColor', '#ff7a1a'); await eHex('dial.coolColor', '#29b6f6');
  await eNum('nudge.ox', 0); await eNum('nudge.oy', 0);
  const dg = () => E((PV) => { const r = document.querySelector(PV), d = r.querySelector('.iqdl'), ring = d.querySelector('.iqdl__dring'), t = d.querySelector('.iqdl__target');
    return { design: d.dataset.design, ring: getComputedStyle(ring).strokeWidth, stroke: getComputedStyle(ring).stroke, ticks: getComputedStyle(d.querySelector('.iqdl__ticks')).display, value: t.textContent, room: d.querySelector('.iqdl__room').textContent, vfs: parseFloat(getComputedStyle(t).fontSize), tone: r.dataset.tone, dsize: d.dataset.dsize }; }, PV);
  let dd = await dg();
  check('DIGITAL (live): a 4 px ring in the heating colour (#ff7a1a — the climate is HEATING), no ticks; the ROOM temperature primary (21.4 °C), the target secondary',
    dd.design === 'digital' && dd.ring === '4px' && dd.stroke === 'rgb(255, 122, 26)' && dd.ticks === 'none' && dd.value === '21.4°C' && /Target 22\.5/.test(dd.room) && dd.tone === 'heat', JSON.stringify(dd));
  await eSave();
  // Information items inside the dial: chosen per item, a structured place, their own sizes
  const addInfo = async (entity, label, icon, slot, more) => {
    await E((CFG) => document.querySelector(`${CFG} [data-col="info"] [data-k=col-add]`).click(), CFG); await page.waitForSelector(ED);
    await page.click(`${ED} [data-k=iqp-choose]`); await page.waitForTimeout(250);
    await E(() => { const b = document.querySelector('[data-k=item-editor] [data-k=iqp-scope-btn]'); if (b && /all/i.test(b.textContent)) b.click(); }); await page.waitForTimeout(100);
    await page.click(`${ED} .iqp__item[data-entity="${entity}"]`); await page.waitForTimeout(300);
    if (label === null) await eSwitch('showLabel'); else await page.fill(`${ED} .ef-field[data-key="label"] input`, label);
    await page.click(`${ED} .ef-field[data-key="icon"] [data-k=icon-field]`); await page.fill(`${ED} .ef-field[data-key="icon"] .iqi__search`, icon); await page.click(`${ED} .ef-field[data-key="icon"] .iqi__opt[data-icon="mdi:${icon}"]`); await page.waitForTimeout(150);
    await eSel('style', 'minimal'); await eNum('valueSize', 15); await eNum('iconSize', 16);
    check(`"Inside the Digital ring" offered for ${entity} (the dial is the Digital ring)`, await eShown('inDial'));
    await eSwitch('inDial'); await eSel('dialSlot', slot);
    check('…then its place in the dial (and no 3 × 3 card position)', await eShown('dialSlot') && !(await eShown('place')));
    if (more) await more();
    await eSave();
  };
  await addInfo('sensor.outside', null, 'home-thermometer', 'lower-left');
  await addInfo('sensor.hum', null, 'water', 'lower-right');
  await addInfo('fan.exhaust', null, 'fan', 'bottom', async () => { await eSel('animation', 'rotate'); });
  const din = () => E((PV) => { const d = document.querySelector(`${PV} .iqdl`), t = d.querySelector('.iqdl__target').getBoundingClientRect();
    return [...d.querySelectorAll('.iqdl__dinfo .cw__fact')].map((f) => { const b = f.getBoundingClientRect(), shown = getComputedStyle(f).display !== 'none' && b.width > 0;
      return { slot: f.parentElement.dataset.slot, shown, g: getComputedStyle(f.querySelector('.iqf__ic')).width, anim: f.querySelector('.iqf__ic')?.dataset.iqiAnim || '', hitsValue: shown && b.left < t.right - 1 && t.left < b.right - 1 && b.top < t.bottom - 1 && t.top < b.bottom - 1 }; }); }, PV);
  let fx = await din();
  check('three Information items INSIDE the dial, in their places (lower left · lower right · bottom), none on the card', fx.map((f) => f.slot).join() === 'lower-left,lower-right,bottom' && fx.every((f) => f.shown) && await E((PV) => !document.querySelector(`${PV} .cw__in .cw__fact`), PV), JSON.stringify(fx));
  check('…their icons keep the configured 16 px; none collides with the temperature, which stays dominant', fx.every((f) => f.g === '16px' && !f.hitsValue) && (await dg()).vfs >= 15 * 2.5, JSON.stringify({ fx, dd: await dg() }));
  check('…the fan icon rotates while the fan is ON', fx.find((f) => f.slot === 'bottom').anim === 'rotate');
  await apply();
  const c2 = await cfgOf('mz');
  check('stored: the design and its options; the items marked for the dial with their places', c2.controls[0].design === 'digital' && c2.controls[0].thickness === 4 && c2.controls[0].primary === 'current' && c2.info.filter((x) => x.inDial).map((x) => x.dialSlot || 'bottom').join() === 'lower-left,lower-right,bottom', JSON.stringify({ dial: c2.controls[0], info: c2.info }));
  // the ring follows the ACTION (truthful), animations follow Home Assistant
  const ringOf = () => E((D) => getComputedStyle(document.querySelector(`${D} .iqdl__dring`)).stroke, DASH);
  const waitFor = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 15000 }).then(() => true).catch(() => false);
  check('on the dashboard: the ring in the heating colour (heating)', (await ringOf()) === 'rgb(255, 122, 26)');
  stove('cool', { action: 'cooling' });
  await waitFor((D) => document.querySelector(D)?.dataset.tone === 'cool', DASH); await page.waitForTimeout(600);
  check('cooling → the ring in the cooling colour (#29b6f6)', (await ringOf()) === 'rgb(41, 182, 246)', await ringOf());
  stove('heat', { action: 'idle' });
  await waitFor((D) => document.querySelector(D)?.dataset.tone === 'idle', DASH); await page.waitForTimeout(600);
  check('heat MODE but IDLE → the idle colour (never shown as heating)', !['rgb(255, 122, 26)', 'rgb(41, 182, 246)'].includes(await ringOf()), await ringOf());
  L.setEntity('fan.exhaust', 'off', { name: 'Exhaust' });
  check('fan off → its icon in the dial stops', await waitFor((D) => { const i = [...document.querySelectorAll(`${D} .iqdl__dinfo .iqf__ic`)].find((x) => x.dataset.mdi === 'mdi:fan'); return !!i && !i.dataset.iqiAnim; }, DASH));
  L.setEntity('fan.exhaust', 'on', { name: 'Exhaust' }); stove('heat');
  // simplification by the DIAL's size; portrait and landscape
  const sizes = await E((c) => {
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999;display:flex;flex-wrap:wrap;gap:8px;width:2400px'; document.body.append(host);
    const out = [];
    [[150, 140], [270, 270], [420, 640], [900, 520], [640, 560]].forEach(([w, h]) => { const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;display:grid`; host.append(b);
      b.append(window.MaisonRegistry.build('climate', { ...c, controls: c.controls.map(({ ox, oy, ...x }) => x), entity: undefined, currentTemperature: 21.4, targetTemperature: 22.5, minTemperature: 7, maxTemperature: 30, temperatureStep: 0.5, hvacMode: 'heat', hvacModes: ['heat', 'cool', 'off'], state: 'heating', capabilities: { targetTemperature: true, hvacMode: true, preset: true }, presets: ['eco', 'comfort'], preset: 'eco' })); out.push(b); });
    return new Promise((res) => setTimeout(() => { const r = out.map((b) => { const cw = b.querySelector('.cw'), d = cw.querySelector('.iqdl'), rr = cw.getBoundingClientRect(), dr = d.getBoundingClientRect(), t = d.querySelector('.iqdl__target').getBoundingClientRect();
      const facts = [...d.querySelectorAll('.iqdl__dinfo .cw__fact')].filter((f) => getComputedStyle(f).display !== 'none' && getComputedStyle(f.closest('.iqdl__dinfo')).display !== 'none' && f.getBoundingClientRect().width > 0);
      const els = [...cw.querySelectorAll('.iqdl, .cw__btn, .iqc-seg, .cw__id')].filter((n) => n.offsetParent);
      let ov = null; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i].getBoundingClientRect(), q = els[j].getBoundingClientRect(); if (a.left < q.right - 1 && q.left < a.right - 1 && a.top < q.bottom - 1 && q.top < a.bottom - 1) ov = `${els[i].className.split(' ')[0]}×${els[j].className.split(' ')[0]}`; }
      return { arr: cw.dataset.fitArr, land: cw.dataset.land, dsize: d.dataset.dsize, facts: facts.length, round: Math.abs(dr.width - dr.height) <= 1, inside: dr.left >= rr.left - 1 && dr.right <= rr.right + 1 && dr.top >= rr.top - 1 && dr.bottom <= rr.bottom + 1,
        collide: facts.some((f) => { const b = f.getBoundingClientRect(); return b.left < t.right - 1 && t.left < b.right - 1 && b.top < t.bottom - 1 && t.top < b.bottom - 1; }), ov }; }); host.remove(); res(r); }, 1500));
  }, c2);
  check('Digital ring simplifies with its size: tiny — none; small — one; larger — the chosen items; always round, inside, never colliding with the temperature or the controls',
    sizes.every((x) => x.round && x.inside && !x.collide && !x.ov) && sizes.every((x) => x.facts === ({ xs: 0, s: 1, m: 3, l: 3 })[x.dsize]) && sizes.some((x) => x.dsize === 'xs' || x.arr === 'micro'), JSON.stringify(sizes));
  check('…portrait and landscape both composed', sizes.some((x) => x.land === 'true') && sizes.some((x) => x.land === 'false'), JSON.stringify(sizes.map((x) => x.land)));

  // ---------------------------------------------------------------- DIAL SIZE: Automatic unchanged; a manual size honoured up to the card itself
  const autoNow = await E(() => {
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999;display:flex;flex-wrap:wrap;gap:14px;width:1700px'; document.body.append(host);
    const base = { name: 'Pellet stove', currentTemperature: 21.4, targetTemperature: 22.5, minTemperature: 7, maxTemperature: 30, temperatureStep: 0.5, hvacMode: 'heat', hvacModes: ['heat', 'cool', 'off'], state: 'heating', capabilities: { targetTemperature: true, hvacMode: true, preset: true }, presets: ['eco', 'comfort'], preset: 'eco',
      controls: [{ type: 'dial' }, { type: 'mode' }, { type: 'minus' }, { type: 'plus' }, { type: 'power', show: true }, { type: 'preset' }] };
    const out = [[420, 520], [560, 520], [380, 640], [900, 520]].map(([w, h]) => { const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;display:grid`; b.append(window.MaisonRegistry.build('climate', base)); host.append(b); return b; });
    return new Promise((res) => setTimeout(() => { const r = out.map((b) => b.querySelector('.iqdl').offsetWidth); host.remove(); res(r); }, 1500)); });
  check('11 Automatic: the same sizes as before this change (286 · 246 · 349 · 256 px on the four reference cards)', JSON.stringify(autoNow) === JSON.stringify([286, 246, 349, 256]), JSON.stringify(autoNow));
  await open('mz');
  await pvSize(9, 11);
  await editRow('controls', 'Thermostat dial');
  await eSel('dial.design', 'spectrum'); await eNum('nudge.ox', 0); await eNum('nudge.oy', 0);
  await page.click(`${ED} .ef-field[data-key="dial.size"] [data-k=range-auto]`).catch(() => {}); await page.waitForTimeout(300);
  g = await geo(PV);
  const autoS = g.dial.s, Wc = g.W, Hc = g.H;
  check('the editor offers 80 – 600 px (slider + editable number)', await E((ED) => { const s = document.querySelector(`${ED} .ef-field[data-key="dial.size"] input.ef-range__s`); return s.min === '80' && s.max === '600'; }, ED));
  const grow = [];
  for (const v of [240, 300, 360, 420]) { await eNum('dial.size', v); g = await geo(PV); grow.push({ v, s: g.dial.s, cx: g.dial.cx, cy: g.dial.cy }); }
  check('1–4 manual 240 → 300 → 360 → 420: live, honoured up to the card itself (not the automatic reservation) — larger than Automatic', grow.every((x) => x.s === Math.min(x.v, Math.floor(Wc), Math.floor(Hc))) && grow.at(-1).s > autoS && grow.every((x, i) => !i || x.s >= grow[i - 1].s),
    JSON.stringify({ autoS, Wc, Hc, grow }));
  await eNum('dial.size', 360); g = await geo(PV);
  check('Centre at 0 / 0: the 360 px dial is centred in the card', g.dial.s === Math.min(360, Math.floor(Wc), Math.floor(Hc)) && Math.abs(g.dial.cx - Wc / 2) <= 1 && Math.abs(g.dial.cy - Hc / 2) <= 1, JSON.stringify(g.dial));
  const s360 = g.dial.s;
  await eNum('nudge.ox', 20); await eNum('nudge.oy', -15); g = await geo(PV);
  check('a large dial with X +20 / Y −15 keeps its size (only the offset is kept inside the card)', g.dial.s === s360 && g.dial.ox >= 0 && g.dial.ox <= 20 && g.dial.oy <= 0 && g.dial.oy >= -15 && g.dial.x + g.dial.s <= Wc + 0.5 && g.dial.y >= -0.5, JSON.stringify(g.dial));
  const five = {};
  for (const d of ['spectrum', 'minimal', 'arc', 'full', 'digital']) { await eSel('dial.design', d); const x = await geo(PV); five[d] = await E((PV) => { const dd = document.querySelector(`${PV} .iqdl`), svg = dd.querySelector('.iqdl__svg').getBoundingClientRect(), k = dd.querySelector('.iqdl__knob'), kb = k.getBoundingClientRect(), t = dd.querySelector('.iqdl__target').getBoundingClientRect(), b = dd.getBoundingClientRect();
    return { s: dd.offsetWidth, round: Math.abs(svg.width - svg.height) < 1, centred: Math.abs((t.left + t.width / 2) - (b.left + b.width / 2)) < b.width * 0.06 }; }, PV); five[d].ss = x.dial.s; }
  check('6 all five designs at 360 px: the same outer footprint, circular, the value centred', Object.values(five).every((x) => x.s === s360 && x.round && x.centred), JSON.stringify(five));
  check('the Digital ring\'s thickness is real px at any size (a thin ring stays thin)', await E((PV) => getComputedStyle(document.querySelector(`${PV} .iqdl__dring`)).vectorEffect === 'non-scaling-stroke', PV));
  await eSave(); await apply();
  // a LARGE Digital ring with several items inside (the dial's own size decides how many)
  await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'mz'); it.layout.desktop = { ...it.layout.desktop, w: 8, h: 16 }; it.config.info = [...it.config.info,
    { id: 'h8', entity: 'sensor.outside', label: 'Outside', icon: 'mdi:weather-partly-cloudy', style: 'minimal', valueSize: 14, iconSize: 18, inDial: true, dialSlot: 'top' },
    { id: 'h9', entity: 'sensor.hum', label: 'Humidity', icon: 'mdi:water-percent', style: 'minimal', valueSize: 14, iconSize: 18, inDial: true, dialSlot: 'upper-left' }];
    it.config.controls = it.config.controls.map((x) => { if (x.type !== 'dial') return x; const { ox, oy, ...d } = x; return { ...d, size: 560 }; }); const r = window.editor.setModel(m); return r.ok ? 'ok' : JSON.stringify(r.errors); }).then((r) => check('a large Pellet stove card with a 560 px Digital ring and five in-dial items', r === 'ok', r));
  await page.waitForTimeout(1500);
  const big = await E((D) => { const r = document.querySelector(D), d = r.querySelector('.iqdl'), t = d.querySelector('.iqdl__target').getBoundingClientRect(), facts = [...d.querySelectorAll('.iqdl__dinfo .cw__fact')].filter((f) => getComputedStyle(f).display !== 'none' && f.getBoundingClientRect().width > 0);
    const rs = facts.map((f) => f.getBoundingClientRect()); let clash = false;
    for (let i = 0; i < rs.length; i++) { const a = rs[i]; if (a.left < t.right - 1 && t.left < a.right - 1 && a.top < t.bottom - 1 && t.top < a.bottom - 1) clash = true; for (let j = i + 1; j < rs.length; j++) { const q = rs[j]; if (a.left < q.right - 1 && q.left < a.right - 1 && a.top < q.bottom - 1 && q.top < a.bottom - 1) clash = true; } }
    return { s: d.offsetWidth, dsize: d.dataset.dsize, items: facts.length, clash, vfs: parseFloat(getComputedStyle(d.querySelector('.iqdl__target')).fontSize), arr: r.dataset.fitArr }; }, DASH);
  check('7 a large Digital ring (560 px wanted): large, every in-dial item shown (5), none colliding with each other or the dominant temperature', big.s >= 480 && big.dsize === 'l' && big.items === 5 && !big.clash && big.vfs >= 100, JSON.stringify(big));
  // Micro / Compact: a giant manual size never makes the widget unusable
  const tiny = await E((c) => {
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999;display:flex;gap:8px'; document.body.append(host);
    const bs = [[150, 140], [260, 250]].map(([w, h]) => { const b = document.createElement('div'); b.style.cssText = `width:${w}px;height:${h}px;display:grid`; host.append(b); b.append(window.MaisonRegistry.build('climate', { ...c, controls: c.controls.map(({ ox, oy, ...x }) => x), entity: undefined, hvacModes: ['heat', 'cool', 'off'], capabilities: { targetTemperature: true, hvacMode: true } })); return b; });
    return new Promise((res) => setTimeout(() => { const r = bs.map((b) => { const cw = b.querySelector('.cw'), rr = cw.getBoundingClientRect(), els = [...cw.querySelectorAll('.iqdl, .cw__btn, .iqc-seg, .cw__id')].filter((n) => n.offsetParent);
      let ov = null; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i].getBoundingClientRect(), q = els[j].getBoundingClientRect(); if (a.left < q.right - 1 && q.left < a.right - 1 && a.top < q.bottom - 1 && q.top < a.bottom - 1) ov = `${els[i].className.split(' ')[0]}×${els[j].className.split(' ')[0]}`; }
      return { arr: cw.dataset.fitArr, s: cw.querySelector('.iqdl').offsetWidth, inside: els.every((n) => { const q = n.getBoundingClientRect(); return q.left >= rr.left - 1 && q.right <= rr.right + 1 && q.top >= rr.top - 1 && q.bottom <= rr.bottom + 1; }), ov }; }); host.remove(); res(r); }, 1200));
  }, await cfgOf('mz'));
  check('9 Micro / Compact: the 560 px wish is capped to the usable room — inside the card, nothing overlapping', tiny.every((x) => ['micro', 'compact'].includes(x.arr) && x.inside && !x.ov && x.s < 200), JSON.stringify(tiny));

  // ---------------------------------------------------------------- persistence: save / reload / export → import
  const before = await cfgOf('mz');
  const saved = await E(() => window.editor.save());
  await page.reload(); await page.waitForTimeout(1800);
  const rt = await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'mz'); const t = window.MaisonModel.serialize(m), r = window.MaisonModel.parse(t, window.MaisonRegistry); return { c: it.config, rt: r.ok && JSON.stringify(r.model.pages[0].items.find((i) => i.id === 'mz').config) === JSON.stringify(it.config) }; });
  check('save / reload / export → import keep the dial / − / + positions and offsets, the Digital ring and its in-dial information', saved === true && rt.rt && JSON.stringify(rt.c) === JSON.stringify(before), JSON.stringify({ before, after: rt.c }));
  await page.waitForTimeout(800);
  g = await geo('[data-grid-id="mz"] .cw');
  check('after reload the card is composed the same (dial at its anchor + offset; − / + at theirs)', g.dial.design === 'digital' && g.dial.place === 'center-center' && g.minus.place === 'center-left' && g.plus.place === 'center-right', JSON.stringify(g));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
