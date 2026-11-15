/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// WIDGET SURFACE — the SHARED background (Theme · Transparent · Custom opacity) and hover (Default · None · Surface · Glow · Lift ·
// Surface + Lift) of EVERY widget: one Appearance field set, one runtime (components/widget-kit surface()), one CSS — never per widget.
// Through the real editor (real PHP server, fake Home Assistant): the Pellet stove Climate card with its fireplace (Theme unchanged → Transparent
// → opacity 0–100 %, live), only the OUTER surface (controls, dial, tiles, picture untouched), no outer shadow, hover Surface + Lift (30 %,
// 4 px, 180 ms) at rest / hovered / left — no layout, MaisonFit or child-control change —; Room, Light, Sensor, Media and representative
// widgets; layout items excluded; editor selection; card gestures; a nested container; persistence (save / reload / export / duplicate /
// copy style); older configurations unchanged; reduced motion.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';

const CFG = 'dialog.ed-dlg--cfg[open]', PV = `${CFG} .ecfg-pv .cw`;
let L, B;
try {
  L = await live();
  L.setEntity('climate.stove', 'heat', { name: 'Pellet stove', f: 1 | 16, cur: 21.4, target: 22.5, min: 7, max: 30, step: 0.5, modes: ['heat', 'cool', 'off'], action: 'heating', preset: 'eco', pml: ['eco', 'comfort'] });
  L.setEntity('sensor.stove_power', '3', { name: 'Stove power' });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1150 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const cfgOf = (id) => E((id) => structuredClone(window.editor.getModel().pages[0].items.find((i) => i.id === id).config), id);
  const shown = (key) => E(({ CFG, key }) => { const n = document.querySelector(`${CFG} .ef-field[data-key="${key}"]`); return !!n && !n.hidden && !n.closest('[hidden]'); }, { CFG, key });
  const setNum = async (key, v) => { const q = `${CFG} .ef-field[data-key="${key}"] input.ef-range__n`; await page.fill(q, String(v)); await page.press(q, 'Enter'); await page.waitForTimeout(300); };
  const sel = async (key, v) => { await page.selectOption(`${CFG} .ef-field[data-key="${key}"] select`, v); await page.waitForTimeout(400); };
  const open = async (id) => { await page.click(`.ed-canvas [data-grid-id="${id}"]`, { position: { x: 12, y: 12 }, force: true }); await page.waitForTimeout(150); await E(() => document.querySelector('[data-k="edit-config"]').click()); await page.waitForSelector(`${CFG} .ef`);
    await E((CFG) => document.querySelectorAll(`${CFG} details.ef-group--acc`).forEach((d) => { d.open = true; }), CFG); await page.waitForTimeout(700); };
  const apply = async () => { await page.click(`${CFG} .ecfg-foot button:has-text("Apply")`); await page.waitForTimeout(600); };
  /** the root's OWN paint, its surface layer, and what the content looks like (all must be independent of the setting) */
  const look = (scope) => E((scope) => {
    const r = document.querySelector(scope); if (!r) return null;
    const cs = getComputedStyle(r), lay = r.querySelector(':scope > .iq-wsurf__layer'), q = (s) => r.querySelector(s), bgOf = (n) => (n ? getComputedStyle(n).backgroundColor + getComputedStyle(n).backgroundImage : '');
    return { bg: cs.backgroundImage, bgc: cs.backgroundColor, shadow: cs.boxShadow, layer: lay ? Number(getComputedStyle(lay).opacity) : null, layerBg: lay ? getComputedStyle(lay).backgroundImage.slice(0, 40) : '',
      translate: cs.translate, arr: r.dataset.fitArr, w: r.offsetWidth, h: r.offsetHeight, top: r.offsetTop,
      content: { power: bgOf(q('.cw__btn[data-k=power]')), mode: bgOf(q('.iqc-seg[data-k=mode] [aria-checked="true"]')), plus: bgOf(q('.cw__btn[data-k=plus]')), dial: getComputedStyle(q('.iqdl') || r).height, img: q('.cw__img') ? getComputedStyle(q('.cw__media')).display : '', preset: bgOf(q('[data-k=preset] [aria-checked="true"]')) },
      visible: ['.iqdl', '.iqc-seg[data-k=mode]', '.cw__btn[data-k=power]', '.cw__btn[data-k=minus]', '.cw__btn[data-k=plus]', '[data-k=preset]', '.cw__fact', '.cw__id'].map((s) => { const n = q(s); return !!n && n.offsetParent !== null && n.getBoundingClientRect().width > 0; }) };
  }, scope);

  // ---------------------------------------------------------------- the shared field: every widget, layout items excluded
  const fieldsOn = await E(() => { const R = window.MaisonRegistry; return Object.fromEntries(['light', 'climate', 'sensor', 'media', 'cover', 'camera', 'person', 'datetime', 'energy', 'custom.room-scene', 'text', 'button', 'container', 'tabs'].map((t) => [t, !!R.schemaOf(t)?.fields.some((f) => f.key === 'widgetBg' && f.group === 'appearance')])); });
  check('ONE shared Appearance field set on every widget — Light, Climate, Sensor, Media, Cover, Camera, Person, Date & Time, Energy, Room (a custom package), Text, Button', Object.entries(fieldsOn).filter(([k]) => !['container', 'tabs'].includes(k)).every(([, v]) => v), JSON.stringify(fieldsOn));
  check('…not on layout items (Container, Tabbed Container keep their own surfaces)', !fieldsOn.container && !fieldsOn.tabs, JSON.stringify(fieldsOn));
  const css = await E(async () => { const t = await (await fetch('components/widget-kit/widget-kit.css')).text(); const all = await Promise.all(['light', 'climate', 'sensor', 'media'].map(async (w) => (await (await fetch(`widgets/default/${w}/${w}.css`)).text()))); return { shared: /iq-wsurf/.test(t), perWidget: all.some((x) => /transparent|iq-wsurf|data-iq-bg|data-iq-hover/.test(x) && /iq-wsurf|data-iq-bg|data-iq-hover/.test(x)) }; });
  check('one shared implementation (components/widget-kit), no widget-specific transparency / hover CSS', css.shared && !css.perWidget, JSON.stringify(css));

  // ---------------------------------------------------------------- the Pellet stove Climate card (with its fireplace)
  const card = { name: 'Pellet stove', entity: 'climate.stove', image: 'widgets/default/climate/assets/fireplace.svg', controls: [{ type: 'dial' }, { type: 'mode' }, { type: 'minus' }, { type: 'plus' }, { type: 'power' }, { type: 'preset' }],
    info: [{ id: 'h1', entity: 'sensor.stove_power', label: 'Power', style: 'card', slot: 'left', vslot: 'top' }] };
  const added = await E((c) => { const m = window.editor.getModel(); m.pages[0].items.push({ id: 'mz', type: 'climate', parent: null, config: c, layout: { desktop: { x: 1, y: 60, w: 5, h: 13 }, tablet: { x: 1, y: 60, w: 5, h: 12 }, mobile: { w: 4, h: 10 } } }); const r = window.editor.setModel(m); return r.ok ? 'ok' : JSON.stringify(r.errors); }, card);
  check('the Pellet stove card on the dashboard', added === 'ok', added);
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(1200);
  const DASH = '.ed-canvas [data-grid-id="mz"] .cw';
  const base = await look(DASH);
  check('Theme (default): the card exactly as it was — its own surface and shadow, no layer, nothing stored', base.layer === null && (base.bg !== 'none' || !/rgba\(0, 0, 0, 0\)/.test(base.bgc)) && base.shadow !== 'none' && !('widgetBg' in (await cfgOf('mz'))) && await E((D) => !document.querySelector(D).classList.contains('iq-wsurf'), DASH), JSON.stringify(base));
  await open('mz');
  await page.fill(`${CFG} [data-k=pv-w]`, '9'); await page.fill(`${CFG} [data-k=pv-h]`, '13'); await page.press(`${CFG} [data-k=pv-h]`, 'Tab'); await page.waitForTimeout(700);
  check('Appearance: Widget background (Theme · Transparent · Custom opacity) and Hover effect', await shown('widgetBg') && await shown('hover') && !(await shown('widgetBgOpacity')) && !(await shown('hoverOpacity')));
  const pv0 = await look(PV);
  await sel('widgetBg', 'transparent');
  const pvT = await look(PV);
  check('TRANSPARENT (live): the outer card is gone — no fill, no outer shadow (the layer at 0)', pvT.layer === 0 && pvT.bg === 'none' && /rgba\(0, 0, 0, 0\)/.test(pvT.bgc) && pvT.shadow === 'none', JSON.stringify(pvT));
  check('…the dial, mode control, Power, − / +, Preset, information, title and the fireplace remain — unchanged', pvT.visible.every(Boolean) && JSON.stringify(pvT.content) === JSON.stringify(pv0.content), JSON.stringify({ before: pv0.content, after: pvT.content, visible: pvT.visible }));
  check('…the same logical size and MaisonFit size', pvT.w === pv0.w && pvT.h === pv0.h && pvT.arr === pv0.arr, JSON.stringify([pv0.arr, pvT.arr]));
  await sel('widgetBg', 'opacity');
  check('Custom opacity: Background opacity (Slider + Number, %)', await shown('widgetBgOpacity'));
  const ops = {};
  for (const v of [0, 25, 50, 75, 100]) { await setNum('widgetBgOpacity', v); const x = await look(PV); ops[v] = { layer: x.layer, shadow: x.shadow !== 'none' && !/^rgba\(0, 0, 0, 0\) 0px 0px 0px 0px/.test(x.shadow), arr: x.arr }; }
  check('opacity 0 · 25 · 50 · 75 · 100 % (live): the surface at exactly that opacity; the card shadow only when mostly opaque; MaisonFit unchanged',
    [0, 25, 50, 75, 100].every((v) => Math.abs(ops[v].layer - v / 100) < 0.01 && ops[v].arr === pv0.arr) && !ops[0].shadow && !ops[25].shadow && ops[50].shadow && ops[100].shadow, JSON.stringify(ops));
  // the hover treatment: Transparent + Surface + Lift, 30 %, 4 px, 180 ms
  await sel('widgetBg', 'transparent');
  await sel('hover', 'surface-lift');
  check('Surface + Lift: hover surface opacity, colour, lift and transition (no glow strength)', await shown('hoverOpacity') && await shown('hoverColor') && await shown('hoverLift') && await shown('hoverMs') && !(await shown('hoverGlow')));
  await setNum('hoverOpacity', 30); await setNum('hoverLift', 4); await setNum('hoverMs', 180);
  await apply();
  const c1 = await cfgOf('mz');
  check('stored: transparent · surface-lift · 30 % · 4 px · 180 ms (the background opacity, no longer applying, not kept)', c1.widgetBg === 'transparent' && c1.hover === 'surface-lift' && c1.hoverOpacity === 30 && c1.hoverLift === 4 && c1.hoverMs === 180 && !('widgetBgOpacity' in c1), JSON.stringify(c1));

  // ---------------------------------------------------------------- view mode: rest · hover · leave
  await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'mz'); it.config.interactions = { tap: { action: 'navigate', page: 'lights' } }; window.editor.setModel(m); });
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(1200);
  const W = '[data-grid-id="mz"] .cw';
  await page.locator(W).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await page.mouse.move(5, 5); await page.waitForTimeout(400);
  const rest = await look(W);
  check('REST: no outer card (surface at 0, no shadow), no lift', rest.layer === 0 && rest.shadow === 'none' && (rest.translate === 'none' || rest.translate === '0px'), JSON.stringify(rest));
  const bb = await page.locator(W).boundingBox();
  await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.92); await page.waitForTimeout(450);
  const hov = await look(W);
  check('HOVER: a subtle rounded surface appears (30 %) and the widget lifts 4 px — after its 180 ms transition', Math.abs(hov.layer - 0.3) < 0.01 && hov.translate === '0px -4px' && hov.shadow !== 'none', JSON.stringify(hov));
  check('…no layout movement, no MaisonFit change, the content unchanged (dial, − / +, Power, mode, Preset, fireplace)', hov.top === rest.top && hov.w === rest.w && hov.h === rest.h && hov.arr === rest.arr && JSON.stringify(hov.content) === JSON.stringify(rest.content), JSON.stringify({ rest, hov }));
  const midway = await E((W) => { const r = document.querySelector(W), lay = r.querySelector('.iq-wsurf__layer'); return { rt: getComputedStyle(r).transitionDuration, lt: getComputedStyle(lay).transitionDuration }; }, W);
  check('…the surface and the lift animate over the configured 180 ms (no layout transition)', midway.rt === '0.18s' && midway.lt === '0.18s', JSON.stringify(midway));
  // child-control hover coexists with the widget hover
  const pb = await page.locator(`${W} .cw__btn[data-k=power]`).boundingBox();
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await page.waitForTimeout(300);
  check('the widget\'s hover stays while the pointer is on Power (both coexist; Power keeps its own look)', Math.abs((await look(W)).layer - 0.3) < 0.01 && (await look(W)).content.power === rest.content.power);
  await page.mouse.move(5, 5); await page.waitForTimeout(450);
  const left = await look(W);
  check('LEAVE: smoothly back to transparent (surface 0, no lift)', left.layer === 0 && (left.translate === 'none' || left.translate === '0px'), JSON.stringify(left));
  // a transparent widget stays fully interactive
  const tb = await page.locator(`${W} .cw__name`).boundingBox();
  await page.mouse.click(tb.x + 6, tb.y + tb.height / 2); await page.waitForTimeout(700);
  check('a tap on the transparent card still runs its card action (navigate)', await E(() => (window.editor.navigation ? window.editor.navigation().current : window.editor.getPage().id)) === 'lights');
  await E(() => window.editor.go(window.editor.getModel().pages[0].id)); await page.waitForTimeout(600);
  // reduced motion: no lift
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(200);
  await page.locator(W).scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  const bb2 = await page.locator(W).boundingBox();
  await page.mouse.move(bb2.x + bb2.width * 0.5, bb2.y + bb2.height * 0.92); await page.waitForTimeout(300);
  const rm = await look(W);
  check('reduced motion: the surface still appears (feedback kept), no lift, no transition', Math.abs(rm.layer - 0.3) < 0.01 && (rm.translate === 'none' || rm.translate === '0px') && await E((W) => getComputedStyle(document.querySelector(`${W} .iq-wsurf__layer`)).transitionDuration === '0s', W), JSON.stringify(rm));
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.mouse.move(5, 5);

  // ---------------------------------------------------------------- editor: selection stays usable; no lift while editing
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(600);
  await page.click('.ed-canvas [data-grid-id="mz"]', { position: { x: 30, y: 30 }, force: true }); await page.waitForTimeout(250);
  const selo = await E(() => { const s = document.querySelector('.ed-sel'); return !!s && !s.hidden && getComputedStyle(s).boxShadow !== 'none' && s.getBoundingClientRect().width > 50; });
  await page.locator(DASH).scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  const bb3 = await page.locator(DASH).boundingBox();
  await page.mouse.move(bb3.x + bb3.width / 2, bb3.y + bb3.height * 0.92); await page.waitForTimeout(400);
  check('editor: the transparent widget is selected with its outline and handles; it never lifts under the pointer while editing', selo && ['none', '0px'].includes((await look(DASH)).translate), JSON.stringify({ selo, t: (await look(DASH)).translate }));

  // ---------------------------------------------------------------- Room, Light, Sensor, Media + representative widgets: the same shared behaviour
  const others = await E(() => {
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;z-index:9999;display:flex;flex-wrap:wrap;gap:12px;width:1800px;padding:20px'; document.body.append(host);
    const S = { widgetBg: 'transparent', hover: 'surface-lift', hoverOpacity: 30, hoverLift: 4 };
    const list = [['custom.room-scene', { name: 'Living Room' }], ['light', { name: 'Living', state: 'on', brightness: 70, capabilities: { power: true, brightness: true } }], ['sensor', { name: 'Temperature', value: 21.4, unit: '°C' }], ['media', { name: 'Speaker' }],
      ['cover', { name: 'Blind' }], ['camera', { name: 'Door' }], ['person', { name: 'Alex' }], ['datetime', { name: 'Clock' }], ['energy', { name: 'Energy' }], ['weather', { name: 'Weather' }], ['gauge', { name: 'Gauge' }]];
    const out = [];
    list.forEach(([t, c]) => [false, true].forEach((tr) => { const b = document.createElement('div'); b.style.cssText = 'width:320px;height:260px;display:grid'; host.append(b); out.push({ t, tr, b }); b.append(window.MaisonRegistry.build(t, tr ? { ...c, ...S } : c)); }));
    return new Promise((res) => setTimeout(() => { const r = out.map(({ t, tr, b }) => { const w = b.firstElementChild, root = w.classList.contains('iqdemo') ? w.firstElementChild : w, cs = getComputedStyle(root), lay = root.querySelector(':scope > .iq-wsurf__layer');
      const kids = [...root.children].filter((n) => !n.classList.contains('iq-wsurf__layer') && n.getBoundingClientRect().width > 0).length;
      return { t, tr, cls: root.className.split(' ')[0], own: cs.backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor), shadow: cs.boxShadow, layer: lay ? Number(getComputedStyle(lay).opacity) : null, layerHasSurface: lay ? (getComputedStyle(lay).backgroundImage !== 'none' || !/rgba\(0, 0, 0, 0\)/.test(getComputedStyle(lay).backgroundColor)) : null, kids, arr: root.dataset.fitArr || root.dataset.fitTier, w: root.offsetWidth, h: root.offsetHeight }; });
      host.remove(); res(r); }, 1800));
  });
  const pairs = {};
  others.forEach((x) => { (pairs[x.t] = pairs[x.t] || {})[x.tr ? 'T' : 'D'] = x; });
  const okOne = (p) => p.D.layer === null && p.D.own && p.T.layer === 0 && !p.T.own && p.T.shadow === 'none' && p.T.layerHasSurface && p.T.kids === p.D.kids && p.T.w === p.D.w && p.T.h === p.D.h && p.T.arr === p.D.arr;
  check('Room · Light · Sensor · Media · Cover · Camera · Person · Date & Time · Energy · Weather · Gauge: Theme untouched; Transparent removes ONLY the outer surface (its theme surface kept on the shared layer for hover), the content and MaisonFit unchanged',
    Object.values(pairs).every(okOne), JSON.stringify(Object.fromEntries(Object.entries(pairs).filter(([, p]) => !okOne(p)))));

  // ---------------------------------------------------------------- nested container: the same runtime
  const nested = await E(() => { const m = window.editor.getModel(); m.pages[0].items.push({ id: 'ct', type: 'container', parent: null, config: { name: 'Box' }, layout: { desktop: { x: 7, y: 60, w: 5, h: 6 }, tablet: { x: 1, y: 80, w: 5, h: 6 }, mobile: { w: 4, h: 6 } } },
    { id: 'sn', type: 'sensor', parent: 'ct', config: { name: 'Nested', value: 3, unit: 'kW', widgetBg: 'opacity', widgetBgOpacity: 40 }, layout: { desktop: { x: 1, y: 1, w: 4, h: 3 }, tablet: { x: 1, y: 1, w: 4, h: 3 }, mobile: { w: 4, h: 3 } } }); const r = window.editor.setModel(m); return r.ok ? 'ok' : JSON.stringify(r.errors); });
  await page.waitForTimeout(1500);
  check('inside a Container: the same shared surface (40 %); the Container keeps its own background', nested === 'ok' && await E(() => { const r = document.querySelector('[data-grid-id="sn"] .sw'), c = document.querySelector('[data-grid-id="ct"]'); const lay = r && r.querySelector('.iq-wsurf__layer'); return !!lay && Math.abs(Number(getComputedStyle(lay).opacity) - 0.4) < 0.01 && !c.querySelector(':scope > .iq-wsurf__layer'); }), nested);

  // ---------------------------------------------------------------- persistence: save / reload / export → import · duplicate · copy style
  const before = await cfgOf('mz');
  const saved = await E(() => window.editor.save());
  await page.reload(); await page.waitForTimeout(1800);
  const rt = await E(() => { const m = window.editor.getModel(), it = m.pages[0].items.find((i) => i.id === 'mz'); const t = window.MaisonModel.serialize(m), r = window.MaisonModel.parse(t, window.MaisonRegistry); return { c: it.config, rt: r.ok && JSON.stringify(r.model.pages[0].items.find((i) => i.id === 'mz').config) === JSON.stringify(it.config) }; });
  check('save / reload / export → import keep the background and hover settings', saved === true && rt.rt && JSON.stringify(rt.c) === JSON.stringify(before), JSON.stringify({ before, after: rt.c }));
  await E(() => window.editor.setEditing(true)); await page.waitForTimeout(600);
  const ids0 = await E(() => window.editor.getModel().pages[0].items.map((i) => i.id));
  await page.click('.ed-canvas [data-grid-id="mz"]', { position: { x: 30, y: 30 }, force: true }); await page.waitForTimeout(250);
  await page.click('[data-k=duplicate]'); await page.waitForTimeout(800);
  const dup = await E((ids0) => window.editor.getModel().pages[0].items.find((i) => !ids0.includes(i.id) && i.type === 'climate'), ids0);
  check('Duplicate keeps the background and hover', !!dup && dup.config.widgetBg === 'transparent' && dup.config.hover === 'surface-lift' && dup.config.hoverOpacity === 30, JSON.stringify(dup && dup.config));
  const other = await E(() => window.editor.getModel().pages[0].items.find((i) => i.type === 'sensor' && !i.parent && !i.config.widgetBg)?.id);
  await page.click('.ed-canvas [data-grid-id="mz"]', { position: { x: 30, y: 30 }, force: true }); await page.waitForTimeout(200);
  await page.click('[data-k=copy-style]'); await page.waitForTimeout(200);
  await page.click(`.ed-canvas [data-grid-id="${other}"]`, { force: true }); await page.waitForTimeout(200);
  await page.click('[data-k=paste-style]'); await page.waitForTimeout(700);
  const pasted = await cfgOf(other);
  check('Copy style → Paste style carries the widget surface to another widget (nothing functional)', pasted.widgetBg === 'transparent' && pasted.hover === 'surface-lift' && pasted.hoverLift === 4, JSON.stringify(pasted));
  // older configurations: unchanged
  const old = await E(() => { const R = window.MaisonRegistry; return ['light', 'climate', 'sensor', 'media'].map((t) => { const c = R.fullConfig(t, { name: 'Old' }); return !('widgetBg' in c) && !('hover' in c) && R.validateConfig(t, c).length === 0; }); });
  check('older widgets (no setting) stay Theme — nothing migrated, valid', old.every(Boolean), JSON.stringify(old));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
