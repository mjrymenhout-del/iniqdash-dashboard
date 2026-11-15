/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// COMPONENT FOUNDATION — the shared visual components are ONE implementation reused by Room, Light, Climate and Popup (not four copies
// that look alike): the registry describes them; the Information renderer draws Room's lines, Climate's items and the Popup hero's facts
// (each context its own skin and layout); one icon presentation (glyph · colour · background · animation) serves every context; one
// action button renders a scene-like, a Light Power, a Climate Power and a popup action from configuration alone; the renderers know no
// widget or Home Assistant domain and never read Home Assistant (the binding is separate); the editors are the shared, capability-driven
// builders; the placement offset is one helper. Real PHP server, fake Home Assistant.
import { live, liveBrowser } from './lib/live.mjs';
import { check } from './lib/harness.mjs';
import { roomPopup, POPUP_ID, DEMO_ENTITIES } from './lib/room-popup.mjs';

let L, B;
try {
  L = await live();
  Object.entries(DEMO_ENTITIES).forEach(([k, v]) => L.setEntity(k, v[0], v[1]));
  L.setEntity('light.salon', 'on', { name: 'Salon lamp', f: 0, area: 'salon' });
  L.setEntity('sensor.salon_temp', '21.4', { name: 'Salon temperature', unit: '°C', dc: 'temperature' });
  L.setEntity('fan.salon', 'on', { name: 'Salon fan' });
  L.setEntity('climate.stove', 'heat', { name: 'Pellet stove', f: 1 | 16, cur: 21.4, target: 22.5, min: 5, max: 35, step: 0.5, modes: ['heat', 'off'], action: 'heating', preset: 'eco', pml: ['eco', 'comfort'] });
  B = await liveBrowser(L, { viewport: { width: 1500, height: 1200 } }); const page = B.page;
  await page.waitForTimeout(800);
  const E = (fn, ...a) => page.evaluate(fn, ...a);

  // ---------------------------------------------------------------- the registry
  const reg = await E(() => { const R = window.IniqComponents; return { ids: R.ids(), cats: R.CATEGORIES, defs: R.list().map((d) => ({ id: d.id, cat: d.category, contract: Object.keys(d.contract).length, caps: d.capabilities.length, render: !!d.render, editor: !!R.editor(d.id) })) }; });
  const want = ['icon', 'information', 'information-bar', 'button', 'toggle', 'segmented', 'regions', 'surface', 'tabs'];
  check('the registry describes the shared components: icon, information, information bar, action button, toggle, segmented, structured placement, surface, tabs', want.every((id) => reg.ids.includes(id)), JSON.stringify(reg.ids));
  check('…each with a category (content · controls · data · visual · layout), a configuration contract and its capabilities', reg.defs.every((d) => reg.cats.includes(d.cat) && d.contract > 0 && d.caps > 0), JSON.stringify(reg.defs));
  check('…and its shared configuration builder (all but the tabbed container, configured by its own section)', reg.defs.filter((d) => d.id !== 'tabs').every((d) => d.editor), JSON.stringify(reg.defs.filter((d) => !d.editor)));
  // the renderers know no widget and no Home Assistant domain (their CODE, comments aside)
  const src = await E(async () => Object.fromEntries(await Promise.all(['components/info/info.js', 'components/controls/controls.js', 'components/icons/icons.js', 'components/foundation/components.js']
    .map(async (f) => [f, (await (await fetch(f)).text()).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')]))));
  const domain = Object.entries(src).map(([f, t]) => [f, (t.match(/(?<![\w-])(room|light|climate|popup|hvac|thermostat|scene|brightness)(?![\w-])/gi) || [])]).filter(([, m]) => m.length);
  check('the shared renderers name no widget and no domain (Room, Light, Climate, Popup, HVAC, scene … — comments aside)', domain.length === 0, JSON.stringify(domain));
  const haUse = src['components/info/info.js'].slice(0, src['components/info/info.js'].indexOf('function viewOf'));
  check('the Information RENDERER never reads Home Assistant (only its binding, IniqInfo.follow, does)', !/IniqHA/.test(haUse) && /IniqHA/.test(src['components/info/info.js']));

  // ---------------------------------------------------------------- Room · Climate · Popup on the dashboard (+ Light)
  const lay = (x, y, w, h) => ({ desktop: { x, y, w, h }, tablet: { x: 1, y, w: Math.min(8, w), h }, mobile: { w: 4, h } });
  const items = [
    { id: 'r1', type: 'custom.room-scene', parent: null, config: { name: 'Living Room', area: 'salon', variant: 'status', fallbackIcon: { icon: 'mdi:sofa', color: 'accent', animation: 'pulse', animateWhen: 'always' },
      info: [{ id: 'i1', entity: 'sensor.salon_temp', value: 'state', label: 'Temp', icon: 'mdi:thermometer', color: 'accent-hot', iconBg: 'subtle', iconSize: 30 }, { id: 'i2', entity: 'fan.salon', value: 'state', label: 'Fan', icon: 'mdi:fan', animation: 'rotate' }],
      scenes: [{ label: 'Relax', icon: 'mdi:sofa', style: 'filled', color: 'accent' }] }, layout: lay(1, 1, 8, 6) },
    { id: 'l1', type: 'light', parent: null, config: { name: 'Desk', state: 'on', brightness: 60, capabilities: { power: true, brightness: true }, controls: [{ type: 'power', show: true, style: 'filled', color: 'warning', size: 56 }] }, layout: lay(9, 1, 4, 5) },
    { id: 'c1', type: 'climate', parent: null, config: { name: 'Pellet stove', entity: 'climate.stove', controls: [{ type: 'dial' }, { type: 'power', show: true, style: 'filled', color: 'accent-hot' }, { type: 'minus', ox: 12 }],
      info: [{ id: 'h1', entity: 'sensor.salon_temp', label: 'Room', icon: 'mdi:thermometer', color: 'info', iconBg: 'accent', animation: 'pulse', animateWhen: 'always', slot: 'left', vslot: 'bottom' }] }, layout: lay(1, 7, 6, 12) },
  ];
  const ok = await E(({ items, pp }) => { const m = window.editor.getModel(); m.pages[0].items.push(...items); m.popups = [...(m.popups || []), pp]; const r = window.editor.setModel(m); return r.ok ? 'ok' : JSON.stringify(r.errors); }, { items, pp: roomPopup() });
  check('Room, Light, Climate and a Popup on the dashboard', ok === 'ok', ok);
  // count the SHARED icon presentation's work per context (IniqIcons is the one implementation)
  await E(() => { const I = window.IniqIcons, real = I.present; window.__present = []; I.present = function (el, cfg, o) { window.__present.push(el.className); return real.call(this, el, cfg, o); }; });
  await E(() => window.editor.setEditing(false)); await page.waitForTimeout(2200);
  await E((id) => window.editor.openPopup(id), POPUP_ID); await page.waitForTimeout(1800);
  const same = await E(() => {
    const room = document.querySelector('[data-grid-id="r1"] .iq-room__stat'), cl = document.querySelector('[data-grid-id="c1"] .cw__fact'), pop = document.querySelector('.mpop__fact');
    const fns = [room, cl, pop].map((n) => (n && n.info && typeof n.info.update === 'function' ? n.info.update.toString() : null));
    return { contexts: [room && room.tagName, cl && cl.className, pop && pop.className], same: fns.every((f) => f && f === fns[0]), present: [...new Set(window.__present)] };
  });
  check('ONE Information renderer: Room\'s line, Climate\'s item and the Popup hero\'s fact are drawn by the same IniqInfo.render (each in its own skin)', same.same && same.contexts[0] === 'LI', JSON.stringify(same));
  check('ONE icon presentation (IniqIcons.present) draws Room\'s lines and fallback icon, Climate\'s items and the Popup\'s facts',
    ['iq-room__sicon', 'iq-room__vicon', 'iqf__ic', 'mpop__fact-ic'].every((c) => same.present.includes(c)), JSON.stringify(same.present));
  const icons = await E(() => {
    const q = (s) => document.querySelector(s), sz = (n) => n && n.querySelector('svg') ? Math.round(n.querySelector('svg').getBoundingClientRect().width) : null;
    const room = q('[data-grid-id="r1"] .iq-room__stat[data-info="i1"] .iq-room__sicon'), fan = q('[data-grid-id="r1"] .iq-room__stat[data-info="i2"] .iq-room__sicon'), fb = q('[data-grid-id="r1"] .iq-room__vicon'), cl = q('[data-grid-id="c1"] .cw__fact .iqf__ic');
    return { room: { color: room.style.color, bg: room.dataset.iqiBg, svg: sz(room) }, fan: fan.dataset.iqiAnim, fb: { anim: fb.dataset.iqiAnim, bg: fb.dataset.iqiBg, color: fb.style.color },
      cl: (() => { const cs = getComputedStyle(cl), w = parseFloat(cs.width), pad = parseFloat(cs.paddingLeft), sv = parseFloat(getComputedStyle(cl.querySelector('svg')).width);   // CSS px (the pulse's scale aside)
        return { bg: cl.dataset.iqiBg, anim: cl.dataset.iqiAnim, pad, svg: sv, box: w }; })() };
  });
  check('icon: colour (token), background (never a smaller glyph: Room 30 px, Climate: the glyph fills its own box, the surface is padding around it), animation running only when the owner says',
    icons.room.color === 'var(--accent-hot)' && icons.room.bg === 'subtle' && icons.room.svg === 30 && icons.fan === 'rotate' && icons.fb.anim === 'pulse' && icons.fb.bg === 'subtle' && icons.fb.color === 'var(--accent)'
      && icons.cl.bg === 'accent' && icons.cl.anim === 'pulse' && Math.abs(icons.cl.svg - icons.cl.box) < 0.5 && icons.cl.pad > 0, JSON.stringify(icons));
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);

  // ---------------------------------------------------------------- one ACTION BUTTON: four owners, configuration only
  const btn = await E(() => {
    const R = window.IniqComponents.get('button'), host = document.createElement('div'); document.body.append(host);
    const owners = {
      scene: [{ icon: 'mdi:sofa', style: 'filled', shape: 'rounded', color: 'accent', size: 56, iconSize: 24 }, { label: 'Relax', role: 'action' }],
      lightPower: [{ icon: 'mdi:power', style: 'filled', shape: 'circle', color: 'warning', size: 60 }, { label: 'Desk power', role: 'switch', state: { on: true } }],
      climatePower: [{ icon: 'mdi:power', style: 'filled', finish: 'glow', color: 'accent-hot' }, { label: 'Pellet stove power', role: 'switch', state: { on: false } }],
      popupAction: [{ icon: 'mdi:close', style: 'bare', shape: 'circle', size: 36 }, { label: 'Close', role: 'action' }],
    };
    let pressed = 0;
    const out = Object.fromEntries(Object.entries(owners).map(([k, [look, b]]) => { const el = R.render(look, { ...b, onPress: () => { pressed++; } }); host.append(el); el.click();
      return [k, { cls: el.className, role: el.getAttribute('role'), name: el.getAttribute('aria-label'), checked: el.getAttribute('aria-checked'), style: el.dataset.style, shape: el.dataset.shape, size: el.style.getPropertyValue('--iqc-size'), color: el.style.getPropertyValue('--iqc-color'), icon: el.querySelector('[data-mdi]')?.dataset.mdi }]; }));
    host.remove();
    return { out, pressed };
  });
  check('one action button renders a scene-like button, a Light Power, a Climate Power and a popup Close — the behaviour is the owner\'s callback',
    Object.values(btn.out).every((b) => b.cls === 'iqc-btn') && btn.pressed === 4 && btn.out.lightPower.role === 'switch' && btn.out.lightPower.checked === 'true' && btn.out.climatePower.checked === 'false'
      && btn.out.scene.shape === 'rounded' && btn.out.scene.size === '56px' && btn.out.popupAction.style === 'bare' && btn.out.popupAction.name === 'Close' && btn.out.lightPower.color === 'var(--warning)', JSON.stringify(btn));
  const live1 = await E(() => {
    const l = document.querySelector('[data-grid-id="l1"] .iqc-btn'), c = document.querySelector('[data-grid-id="c1"] .cw__btn[data-k=power]');
    return { l: !!l && !!l.control, c: !!c && !!c.control, same: !!l && !!c && l.control.update.toString() === c.control.update.toString() };
  });
  check('Light\'s Power and Climate\'s Power are the same shared button at runtime', live1.l && live1.c && live1.same, JSON.stringify(live1));

  // ---------------------------------------------------------------- Information without a widget, without Home Assistant
  const bare = await E(() => {
    const HA = window.IniqHA; window.IniqHA = undefined;
    try {
      const el = window.IniqInfo.render({ id: 'x', icon: 'mdi:flash', color: '#ff8800', style: 'emphasis', valueSize: 30, animation: 'flash' });
      document.body.append(el); el.info.update({ value: '3.2 kW', label: 'Power', state: 'ready', run: true });
      const r = { cls: el.className, v: el.querySelector('.iqf__v').textContent, l: el.querySelector('.iqf__l').textContent, anim: el.querySelector('.iqf__ic').dataset.iqiAnim, vsz: getComputedStyle(el.querySelector('.iqf__v')).fontSize };
      el.info.update({ value: '0 kW', label: '', state: 'ready', run: false });
      r.after = { v: el.querySelector('.iqf__v').textContent, label: !!el.querySelector('.iqf__l'), anim: el.querySelector('.iqf__ic').dataset.iqiAnim || null };
      el.remove(); return r;
    } finally { window.IniqHA = HA; }
  });
  check('Information renders with no widget parent and no Home Assistant: data in (a view), element out; no label → no label element', bare.cls === 'iqf' && bare.v === '3.2 kW' && bare.l === 'Power' && bare.anim === 'flash' && bare.vsz === '30px'
    && bare.after.v === '0 kW' && !bare.after.label && bare.after.anim === null, JSON.stringify(bare));

  // ---------------------------------------------------------------- placement: one offset helper; editors are the shared builders
  const nud = await E(() => {
    const box = document.createElement('div'); box.style.cssText = 'position:relative;width:200px;height:100px'; const n = document.createElement('div'); n.style.cssText = 'width:40px;height:20px'; box.append(n); document.body.append(box);
    const a = window.IniqControls.nudge(n, 30, -10, { W: 200, H: 100, left: 150, top: 5 }), t = n.style.translate, b = window.IniqControls.nudge(n, 0, 0, { W: 200, H: 100, left: 0, top: 0 });
    box.remove(); return { a, t, b, after: n.style.translate };
  });
  check('placement offset (IniqControls.nudge): logical px, kept inside its box only as much as needed; 0 / 0 removes it', nud.a.x === 10 && nud.a.y === -5 && nud.t === '10px -5px' && nud.b.x === 0 && !nud.after, JSON.stringify(nud));
  check('Climate uses it: − nudged 12 px (its translate)', await E(() => { const m = document.querySelector('[data-grid-id="c1"] .cw__btn[data-k=minus]'); return !!m && m.dataset.ox === '12' && /^12px/.test(m.style.translate); }));
  const eds = await E(() => {
    const R = window.MaisonRegistry, IC = window.IniqComponents, keys = (l) => l.map((f) => f.key).join(',');
    const col = (t, k) => R.schemaOf(t).fields.find((f) => f.key === k);
    const climateInfo = col('climate', 'info').fields.filter((f) => !['inDial', 'dialSlot', 'place'].includes(f.key));
    const shared = IC.editor('information')({ fields: climateInfo.map((f) => f.key) });
    const scene = col('custom.room-scene', 'scenes').fields.filter((f) => !['label', 'entity'].includes(f.key));
    const sharedBtn = IC.editor('button')({ fields: scene.map((f) => f.key), k: '' });
    const roomInfo = col('custom.room-scene', 'info').fields, popInfo = col('popup', 'heroInfo').fields;
    return { climate: keys(climateInfo) === keys(shared) && climateInfo.every((f, i) => f.label === shared[i].label && f.type === shared[i].type),
      scene: keys(scene) === keys(sharedBtn) && scene.every((f, i) => f.label === sharedBtn[i].label && f.type === sharedBtn[i].type), sceneKeys: keys(scene),
      roomInfo: keys(roomInfo), popInfo: keys(popInfo) };
  });
  check('the editors are the shared builders: Climate\'s Information item fields = the shared Information editor; a Room scene\'s appearance = the shared Action Button editor', eds.climate && eds.scene, JSON.stringify(eds));
  check('…capability-driven: Room exposes its subset (no style / position), the Popup hero everything + its 3 × 3 position', /^entity,value,showLabel,label,valueSize/.test(eds.roomInfo) && !/style|place/.test(eds.roomInfo) && /style,align/.test(eds.popInfo) && /place$/.test(eds.popInfo), JSON.stringify(eds));
  // ---------------------------------------------------------------- the COMPOSE contract (formal) · the shared button's optional visible label
  const cc = await E(() => window.IniqComponents.list().map((d) => ({ id: d.id, composable: !!d.compose, ok: !d.compose || (typeof d.compose.render === 'function' && d.compose.box.w > 0 && d.compose.min.w > 0
    && ['center', 'fill', 'layout'].includes(d.compose.resize.mode) && (d.compose.scale === null || (Object.keys(d.compose.scale.props).length > 0 && typeof d.compose.scale.base === 'function'))
    && typeof window.IniqComponents.editor(d.id) === 'function') })));
  check('COMPOSE contract: Button, Toggle, Dial, Information, Value / Text, Icon, Segmented control, Slider, Image — and Widget Studio\'s toolbox elements (components/elements: chart, shape, line, spacer, badge, group panel, image overlay, progress bar / ring, arc gauge, status, label + value, battery, stepper, select) — are composable — each with renderer, box, minimum, resize mode, scale (or none) and editor; the others say they are not',
    JSON.stringify(cc.filter((d) => d.composable).map((d) => d.id).sort()) === JSON.stringify(['arc-gauge', 'badge', 'battery', 'button', 'chart', 'dial', 'flow-connector', 'icon', 'image', 'image-overlay', 'information', 'label-value', 'line', 'panel', 'progress-bar', 'progress-ring', 'segmented', 'select', 'shape', 'slider', 'spacer', 'status', 'stepper', 'sun-arc', 'text', 'toggle']) && cc.every((d) => d.ok)
      && cc.filter((d) => !d.composable).map((d) => d.id).sort().join() === 'information-bar,regions,surface,tabs', JSON.stringify(cc));
  const upd = await E(() => ['button', 'segmented', 'icon', 'dial', 'slider', 'information', 'image'].map((id) => [id, !!window.IniqComponents.get(id).compose.update]));
  check('UPDATE / VIEW: button, segmented control, icon, dial and slider update in place (their own update()); information and image are re-rendered alone', JSON.stringify(upd) === JSON.stringify([['button', true], ['segmented', true], ['icon', true], ['dial', true], ['slider', true], ['information', false], ['image', false]]), JSON.stringify(upd));
  const lbl = await E(() => {
    const b = window.IniqControls.button({ label: 'Heat' }); document.body.append(b);
    const icon0 = !b.querySelector('.iqc-btn__l') && !('labelled' in b.dataset);
    b.control.update({ icon: 'mdi:fire', showLabel: true, labelSize: 15, labelGap: 6 }, { label: 'Heat' });
    const on = { text: b.querySelector('.iqc-btn__l')?.textContent, ls: b.style.getPropertyValue('--iqc-lsize'), lg: b.style.getPropertyValue('--iqc-lgap'), name: b.getAttribute('aria-label'), w: b.offsetWidth > b.offsetHeight };
    b.control.update({ icon: 'mdi:fire' }, { label: 'Heat' });
    const off = !b.querySelector('.iqc-btn__l') && !('labelled' in b.dataset);
    b.remove();
    const live = [...document.querySelectorAll('[data-grid-id] .iqc-btn')];
    return { icon0, on, off, live: live.length, labels: live.filter((x) => x.querySelector('.iqc-btn__l') || 'labelled' in x.dataset).length };
  });
  check('ACTION BUTTON label: icon only by default (no label element); showLabel → a visible label (its size and gap), still its accessible name; off → icon only again',
    lbl.icon0 && lbl.on.text === 'Heat' && lbl.on.ls === '15px' && lbl.on.lg === '6px' && lbl.on.name === 'Heat' && lbl.on.w && lbl.off, JSON.stringify(lbl));
  check('…no Light or Climate button on the dashboard gained a label', lbl.live > 0 && lbl.labels === 0, JSON.stringify(lbl));
  check('no page errors', B.errors.length === 0, B.errors.join(' | '));
} finally {
  if (B) await B.close();
  if (L) await L.close();
}
