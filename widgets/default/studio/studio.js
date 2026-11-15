/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Studio widget — a widget COMPOSED in Widget Studio (docs/WIDGET-STUDIO-POC.md): no code of its own. Its configuration is a component
   MODEL — never HTML — and it is RECONSTRUCTED from it by the shared component foundation: each component's registered renderer
   (IniqComponents.get(type).compose.render — the same Action Button, Information, Icon, Segmented control and Image as Room, Light,
   Climate and the Popup) draws it with its own configuration and its preview data, in its own box.

   MaisonStudioWidget.create(config) → HTMLElement (.stw), with el.studio = { node(id), canvas() }
   config = { definition: 'w…', entities: { <slot id>: 'domain.object' } }  a dashboard INSTANCE of a Widget Studio definition
              (components/studio/library.js) — it draws the definition's CURRENT version (and redraws when it is saved again); the instance
              owns its placement and the ENTITY each of the definition's slots uses in this copy
          | { name, canvas: { w, h } (the logical design size, px), components: [{ id, type, x, y, w, h, config, data, binding? }] (in layer
              order: the first at the back) }   an older Studio widget (inline), and Widget Studio's own canvas
   A component bound to Home Assistant references a WIDGET PROPERTY ({ source: 'ha', property }) — the ONLY semantic binding: it is
   expanded (IniqBinding.expandComponent) to the property's source group (this copy's entity) and value; anything else means nothing.
   It follows its entity through IniqBinding (the shared HA layer); its events become normalised actions; its data arrives through the
   component's own view path (compose.update).
   The canvas keeps its logical coordinates: the widget's own box (MaisonFit) only SCALES it to fit (centred) — a component is never moved
   or resized by the dashboard. A component the foundation does not know (any more) is left out, never guessed.

   COPY SETTINGS — what each placed copy may set differently: a definition lists them (settings: [{ id: 'k' + 8 hex, label, component,
   key }] — one configuration key of one component, e.g. the room card's name text, photo, icon, tile colours); a copy stores its values
   ({ definition, entities, settings: { <setting id>: value } }) and they replace that key in that component's configuration — nothing else
   changes, the definition stays the source of truth. A value is checked against the component's own field type (copySettingValue).
   WHEN (state-dependent appearance) — a component may change with a widget property's CURRENT value: when: [{ property, test: 'is' | 'not'
   | 'above' | 'below', value, set: { <its configuration key>: value } }] (up to 4 rules, later rules win); e.g. a person's ring green when
   'home', a tile blue when its fan is 'on'. Each set value is checked against that component's own field (copySettingValue).
   SHOW WHEN — a component may be shown only when a widget property has a source in THIS copy (showWhen: { property }): e.g. a humidity
   chip that only rooms with a humidity sensor show. A source group may be OPTIONAL (slots[].optional) so a copy can leave it empty.
   ========================================================================== */
(function (global) {
  'use strict';

  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const B = () => global.IniqBinding;

  /** one component in its box (a fresh element from the shared renderer); null when its type is not composable. Bound to Home
      Assistant (x.binding — the INSTANCE's binding), it follows its entities through IniqBinding and its events become normalised actions */
  function component(x, ctx) {
    const def = global.IniqComponents && global.IniqComponents.get(x && x.type);
    if (!def || !def.compose) return null;
    const box = document.createElement('div');
    box.className = 'stw__c';
    box.dataset.cid = String(x.id); box.dataset.ctype = def.id;
    box.__ext = ctx.ext || null;
    place(box, x);
    present(box, x, ctx);
    box.__x = x;
    let el = null;
    try { el = def.compose.render(cfgOf(def, x, box), dataOf(def, x, box), cctx(box, ctx, x)); } catch (e) { el = null; }
    if (el) box.append(el);
    // ON TAP: OPEN A PAGE of the dashboard (the host switches; a control inside keeps its own press)
    if (x.tap && typeof x.tap.page === 'string') {
      box.dataset.tap = ''; box.setAttribute('role', 'link'); box.tabIndex = 0;
      const go = (e) => { if (e.target.closest && e.target.closest('[data-iq-control]')) return; box.dispatchEvent(new CustomEvent('iq-studio-navigate', { bubbles: true, detail: { page: x.tap.page } })); };
      box.addEventListener('click', go); box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
    }
    bind(box, x, def, ctx);
    box.__whenFor = x.when || null;
    watchWhen(box, x, ctx);                                   // after its element exists: a first value redraws it in place
    return box;
  }
  /** the context one component gets: its box, and its events — reported to the host, and to its binding (if any) */
  const cctx = (node, ctx, x) => ({ ...ctx, box: (({ w, h }) => ({ w, h }))(geo(x, node.__ext)),
    onAction: (kind, value) => { if (ctx.onAction) ctx.onAction(kind, value, x.id); if (node.__bind) node.__bind.act(kind, value); } });
  const cfgOf = (def, x, node) => ({ ...def.compose.defaults, ...(x.config || {}), ...whenConfig(x, node && node.__whenVals) });
  /* ---------------------------------------------------------------- WHEN: appearance from a property's current value */
  const TESTS = {
    is: (v, t) => String(v).toLowerCase() === String(t).toLowerCase(),
    not: (v, t) => String(v).toLowerCase() !== String(t).toLowerCase(),
    above: (v, t) => Number.isFinite(Number(v)) && Number(v) > Number(t),
    below: (v, t) => Number.isFinite(Number(v)) && Number(v) < Number(t),
  };
  /** the configuration the matching rules set (each value checked against the component's own field; anything else is ignored) */
  function whenConfig(x, vals) {
    if (!x || !Array.isArray(x.when) || !vals) return {};
    const out = {};
    x.when.slice(0, 4).forEach((r) => {
      if (!r || !TESTS[r.test] || !(r.property in vals)) return;
      const v = vals[r.property];
      if (v === null || v === undefined || !TESTS[r.test](v, r.value)) return;
      Object.entries(r.set || {}).forEach(([k, val]) => { const f = fieldOf(x, k), ok = copySettingValue(f, val); if (ok !== null) out[k] = ok; });
    });
    return out;
  }
  /** follow the CURRENT value of every property a component's rules test (through the shared binding layer, like any bound value) */
  const VALUE_TYPE = 'text';                                   // any component whose primary input takes any value: used only to read
  function watchWhen(node, x, ctx) {
    (node.__whenW || []).forEach((h) => h && h.stop()); node.__whenW = [];
    const props = [...new Set((Array.isArray(x.when) ? x.when : []).map((r) => r && r.property).filter(Boolean))];
    if (!props.length || !B() || !ctx.model) return;
    node.__whenVals = node.__whenVals || {};
    const IC = global.IniqComponents, D = IC && IC.get(VALUE_TYPE);
    if (!D || !D.compose) return;
    props.forEach((pid) => {
      const ex = B().expandComponent({ id: x.id, type: VALUE_TYPE, config: { mode: 'value' }, binding: { source: 'ha', property: pid } }, ctx.model());
      const b = ex && ex.binding ? B().resolve(ex.binding, ex.binding.slot !== undefined && ctx.entityOf ? ctx.entityOf(ex.binding.slot) : null) : null;
      if (!b) return;
      let seen = false;
      node.__whenW.push(B().attach({ ...ex, binding: b }, D.compose, (patch) => {
        if (node.isConnected) seen = true; else if (seen) return;
        const v = patch && patch.status === 'ready' ? patch.value : null;
        if (node.__whenVals[pid] === v) return;
        node.__whenVals[pid] = v;
        refresh(node, node.__x, ctx, true);
      }));
    });
  }
  /** a component's own field for a configuration key (its editor's definition) */
  function fieldOf(x, key) { const sf = settingField({ component: x.id, key }, [x]); return sf ? sf.field : null; }
  const dataOf = (def, x, node) => { const preview = { ...def.compose.data, ...(x.data || {}) }; return B() && node && node.__bound ? B().data(node.__bx || x, def.compose, preview, node.__live) : preview; };
  /** (re)attach the component's binding when it changed — its data arrives through the SAME view path (compose.update). A binding on an
      ENTITY SLOT is resolved first: the slot's entity in THIS widget (ctx.entityOf — a dashboard copy's assignment; Studio's canvas: the
      slot's preview entity); a slot without one is not bound (the component shows its preview data) */
  function bind(node, x0, def, ctx) {
    // a WIDGET PROPERTY binding is first expanded (property → its source group's slot + what it reads); then the slot resolves as always
    const x = B() && x0.binding && ctx.model ? B().expandComponent(x0, ctx.model()) : x0;
    const b = B() && x.binding ? B().resolve(x.binding, x.binding.slot !== undefined && ctx.entityOf ? ctx.entityOf(x.binding.slot) : null) : null;
    const sig = JSON.stringify(b);
    if (node.__bsig === sig) return;
    node.__bsig = sig;
    if (node.__bind) { node.__bind.stop(); node.__bind = null; }
    node.__live = null;
    node.__bound = !!b;                                        // before attach: its first data may arrive at once
    if (!b) return;
    const bx = { ...x, binding: b };
    node.__bx = x;
    let seen = false;
    node.__bind = B().attach(bx, def.compose, (patch) => {
      if (node.isConnected) seen = true; else if (seen) { if (node.__bind) node.__bind.stop(); node.__bind = null; return; }   // gone: stop following
      node.__live = patch;
      refresh(node, node.__x, ctx, true);
    });
  }
  /** one component brought up to date IN PLACE (its box, then its view: the component's own update(), else a fresh element for it alone) */
  function refresh(node, x, ctx, fromBinding = false) {
    const def = global.IniqComponents && global.IniqComponents.get(x && x.type);
    if (!node || !def || !def.compose) return;
    node.__x = x;
    if (!fromBinding) { bind(node, x, def, ctx); if (JSON.stringify(x.when || null) !== JSON.stringify((node.__whenFor || null))) { node.__whenFor = x.when || null; watchWhen(node, x, ctx); } }
    place(node, x);
    present(node, x, ctx);
    const el = node.firstElementChild, cx = cctx(node, ctx, x);
    let done = false;
    if (el && def.compose.update) { try { done = def.compose.update(el, cfgOf(def, x, node), dataOf(def, x, node), cx) === true; } catch (e) { done = false; } }
    if (!done) { let fresh = null; try { fresh = def.compose.render(cfgOf(def, x, node), dataOf(def, x, node), cx); } catch (e) { fresh = null; } if (el) el.remove(); if (fresh) node.append(fresh); }
  }
  /** an element's box as DRAWN: its design box, moved / stretched by its PINS when the widget FILLS a cell of another shape than its
      canvas (ext: { cw, ch } the design canvas, { W, H } the canvas as drawn). Pins (x.pin = { h, v }): left · right · stretch (both
      edges) · center · scale (in proportion) — top · bottom · stretch · center · scale.
      UNPINNED (automatic): an element covering the whole canvas (the card's own background) stretches with the cell; all the others
      move together as one block, centred across and kept at the top — the design stays whole, like a standard widget in a larger cell.
      (start: Studio's own canvas resize, where an unpinned element simply stays where the designer put it: left / top.) */
  /** the AUTOMATIC pins of an unpinned element: ALL unpinned content moves together as one block — centred across, kept at the top
      (where a standard widget's content sits) — so rows and groups never come apart. An element inside an element with an explicit
      pin follows that pin instead (e.g. a label on a panel pinned to the bottom). */
  function autoPin(x, e, isFull) {
    const box = (c) => [num(c.x, 0), num(c.y, 0), num(c.w, 60), num(c.h, 40)];
    const inside = (a, b) => a[0] >= b[0] - 0.5 && a[1] >= b[1] - 0.5 && a[0] + a[2] <= b[0] + b[2] + 0.5 && a[1] + a[3] <= b[1] + b[3] + 0.5 && b[2] * b[3] > a[2] * a[3];
    const xb = box(x);
    let host = null;
    for (const c of e.comps || []) {
      if (c === x || c.id === x.id || isFull(c) || !(c.pin && (c.pin.h || c.pin.v))) continue;
      if (inside(xb, box(c)) && (!host || box(c)[2] * box(c)[3] < box(host)[2] * box(host)[3])) host = c;
    }
    const hp = host ? host.pin : {};
    return { h: hp.h && hp.h !== 'stretch' ? hp.h : 'center', v: hp.v && hp.v !== 'stretch' ? hp.v : 'top' };
  }
  function geo(x, e, start = false) {
    const X = num(x.x, 0), Y = num(x.y, 0), w = num(x.w, 60), h = num(x.h, 40);
    if (!e || (e.W === e.cw && e.H === e.ch)) return { x: X, y: Y, w, h };
    const p0 = (x.pin && typeof x.pin === 'object') ? x.pin : {};
    const isFull = (c) => num(c.x, 0) <= 1 && num(c.y, 0) <= 1 && num(c.x, 0) + num(c.w, 60) >= e.cw - 1 && num(c.y, 0) + num(c.h, 40) >= e.ch - 1;
    const full = isFull(x);
    const auto = autoPin(x, e, isFull);
    const p = { h: p0.h || (full ? 'stretch' : start ? null : auto.h), v: p0.v || (full ? 'stretch' : start ? null : auto.v) };
    const ax = (pos, size, full, full2, mode) => { const d = full2 - full;
      return mode === 'right' || mode === 'bottom' ? [pos + d, size] : mode === 'stretch' ? [pos, size + d] : mode === 'center' ? [pos + d / 2, size]
        : mode === 'scale' ? [(pos * full2) / full, (size * full2) / full] : [pos, size]; };
    const [x1, w1] = ax(X, w, e.cw, e.W, p.h), [y1, h1] = ax(Y, h, e.ch, e.H, p.v);
    return { x: Math.round(x1 * 100) / 100, y: Math.round(y1 * 100) / 100, w: Math.max(1, Math.round(w1 * 100) / 100), h: Math.max(1, Math.round(h1 * 100) / 100) };
  }
  function place(box, x) {
    const g = geo(x, box.__ext);
    box.style.left = `${g.x}px`; box.style.top = `${g.y}px`;
    box.style.width = `${g.w}px`; box.style.height = `${g.h}px`;
    // ROTATION about the element's centre (degrees; the box keeps its unrotated geometry — x / y / w / h)
    const r = num(x.rotate, 0);
    box.style.transform = r ? `rotate(${Math.max(-360, Math.min(360, r))}deg)` : '';
    elementStyle(box, x.style);
    box.__x = x;
    clipping(box);
    box.toggleAttribute('data-hidden', x.hidden === true);          // Visible = off (Widget Studio's Layers): not shown on the dashboard
  }

  /** ELEMENT STYLE (every element, whatever its type): opacity · blend mode · blur · drop shadows / glow that follow its outline · clipping to
      its box with a corner radius (per corner). Values are bounded; the CSS is written here (IniqPaint), never taken from the model. */
  const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
  function elementStyle(box, st0) {
    const st = st0 && typeof st0 === 'object' ? st0 : {}, P = global.IniqPaint, b = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
    const op = b(st.opacity, 0, 100, 100);
    box.style.opacity = op < 100 ? String(op / 100) : '';
    box.style.mixBlendMode = BLENDS.includes(st.blend) && st.blend !== 'normal' ? st.blend : '';
    const blur = b(st.blur, 0, 40, 0), drops = P ? P.dropShadows(st.shadows) : '';
    box.style.filter = [blur ? `blur(${blur}px)` : '', drops].filter(Boolean).join(' ');
    const clip = st.clip === true, r0 = b(st.radius, 0, 400, 0);
    box.style.overflow = clip ? 'hidden' : '';
    box.style.borderRadius = clip ? ['radiusTL', 'radiusTR', 'radiusBR', 'radiusBL'].map((k) => `${b(st[k], 0, 400, r0)}px`).join(' ') : '';
  }

  /** CLIP TO ANOTHER ELEMENT (style.clipTo = its id): this element is cut to that element's outline — a photo inside a card, a glow inside
      a panel. The outline is the other element's own (a shape's: its rounded, tab, notch or callout outline; any other: its box with its
      Element style corner radii). Unrotated boxes. Re-applied whenever either element is placed. */
  function clipping(box) {
    const stage = box.parentElement;
    if (!stage) return;
    const all = [...stage.children].filter((nd) => nd.__x), id = box.__x && box.__x.id;
    all.forEach((nd) => { const to = nd.__x.style && nd.__x.style.clipTo; if (nd === box || (to && to === id)) clipOne(nd, to ? all.find((m) => m.__x.id === to) : null); });
  }
  function clipOne(nd, t) {
    const x = nd.__x, P = global.IniqPaint;
    if (!t || !P || t === nd) { nd.style.clipPath = ''; return; }
    const gy = geo(t.__x, t.__ext), gx = geo(x, nd.__ext), y = t.__x, ox = gy.x - gx.x, oy = gy.y - gx.y, w = gy.w, h = gy.h;
    const D = global.IniqComponents && global.IniqComponents.get(y.type);
    let d = null;
    try { d = D && D.compose && D.compose.outline ? D.compose.outline(y.config || {}, { w, h }, ox, oy) : null; } catch (e) { d = null; }
    if (!d) { const st = y.style || {}, b = (v, dd) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(400, v)) : dd), r0 = st.clip === true ? b(st.radius, 0) : 0;
      d = P.rect(ox, oy, w, h, ['radiusTL', 'radiusTR', 'radiusBR', 'radiusBL'].map((k) => (st.clip === true ? b(st[k], r0) : 0))); }
    nd.style.clipPath = `path('${d}')`;
  }

  /** SHOW WHEN: a component that depends on a widget property is left out (data-absent) when that property's source group has no entity
      in this copy (Studio's canvas: no preview entity — Studio draws it faintly) */
  function present(box, x, ctx) {
    if (x && x.showWhen && x.showWhen.control) {           // while a segmented control of this widget shows that option
      const m = ctx.model ? ctx.model() : null, seg = m && Array.isArray(m.components) ? m.components.find((y) => y.id === x.showWhen.control) : null;
      const cur = ctx.vars && ctx.vars[x.showWhen.control] !== undefined ? ctx.vars[x.showWhen.control] : seg && seg.data ? seg.data.selected : undefined;
      const opt = seg && Array.isArray((seg.config || {}).options) ? seg.config.options.find((o) => o && o.id === x.showWhen.is) : null;
      box.toggleAttribute('data-absent', !(cur !== undefined && (cur === x.showWhen.is || (opt && (cur === opt.value || cur === opt.label)))));
      box.dataset.local = ''; return;
    }
    const pid = x && x.showWhen && x.showWhen.property, m = pid && ctx.model ? ctx.model() : null;
    const p = m && Array.isArray(m.properties) ? m.properties.find((y) => y.id === pid) : null;
    box.toggleAttribute('data-absent', !!pid && !(p && ctx.entityOf && ctx.entityOf(p.group)));
  }

  /* ---------------------------------------------------------------- COPY SETTINGS */
  const SETTING_ID = /^k[0-9a-f]{8}$/, HEX = /^#[0-9a-fA-F]{6}$/, TOKEN = /^[a-z][a-z0-9-]{1,40}$/;
  /** the component field a setting exposes (its own editor's definition), or null when it is gone / not a settable kind */
  const SETTABLE = () => Object.keys(KIND);
  function settingField(setting, components) {
    const x = (components || []).find((c) => c && c.id === setting.component), IC = global.IniqComponents;
    const D = x && IC && IC.get(x.type), ed = D && IC.editor && IC.editor(x.type);
    const own = D && D.compose ? [...(D.compose.fields ? D.compose.fields() : ed ? ed({ ...(D.compose.editor || {}) }) : []), ...(D.compose.extraFields ? D.compose.extraFields() : [])] : [];
    const f = own.find((y) => y && y.key === setting.key && SETTABLE().includes(y.type));
    return f ? { field: f, component: x } : null;
  }
  /** what a value must be, per FORM FIELD KIND of the exposed field (never per component) */
  const str = (v, max) => typeof v === 'string' && v.length <= max;
  const ACCEPT = {
    text: (f, v) => (str(v, f.maxLength || 120) && !/[<>\x00-\x1f]/.test(v) ? v : null),
    mdi: (f, v) => (str(v, 70) && /^mdi:[a-z0-9-]{1,64}$/.test(v) ? v : null),
    color: (f, v) => (str(v, 41) && (HEX.test(v) || TOKEN.test(v)) ? v : null),
    picture: (f, v) => (str(v, 400) && (v === 'none' || (global.IniqArtwork && global.IniqArtwork.SAFE.test(v))) ? v : null),
    select: (f, v) => ((typeof v === 'string' || typeof v === 'number') && String(v).length <= 60 ? v : null),
    number: (f, v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(f.min ?? -1e6, Math.min(f.max ?? 1e6, v)) : null),
    boolean: (f, v) => (typeof v === 'boolean' ? v : null),
  };
  const KIND = { text: 'text', mdi: 'mdi', color: 'color', artwork: 'picture', image: 'picture', select: 'select', range: 'number', number: 'number', boolean: 'boolean' };
  /** a copy's value for a setting, checked against the field's kind (null: not acceptable → the definition's own value stays) */
  function copySettingValue(f, v) {
    const k = f && KIND[f.type];
    return k ? ACCEPT[k](f, v) : null;
  }
  /** the components a copy draws: the definition's, each exposed key replaced by this copy's (accepted) value */
  function withSettings(components, settings, values) {
    if (!Array.isArray(settings) || !settings.length || !values || typeof values !== 'object') return components;
    return components.map((x) => {
      const mine = settings.filter((st) => st && st.component === x.id && SETTING_ID.test(st.id) && values[st.id] !== undefined);
      if (!mine.length) return x;
      const config = { ...(x.config || {}) };
      mine.forEach((st) => { const sf = settingField(st, components), v = copySettingValue(sf && sf.field, values[st.id]); if (v !== null) config[st.key] = v; });
      return { ...x, config };
    });
  }
  /** the Configure fields of a copy: one per setting — the component's own field (its kind, options, limits), keyed by the setting id */
  function settingFields(model) {
    const comps = (model && model.components) || [];
    return ((model && model.settings) || []).map((st) => {
      const sf = settingField(st, comps);
      if (!sf) return null;
      const { when, get, set, half, group, help, ...f } = sf.field; void when; void get; void set; void half; void group; void help;
      return { ...f, key: st.id, label: st.label, optional: true,
        placeholder: typeof sf.component.config?.[st.key] === 'string' ? sf.component.config[st.key] : f.placeholder };
    }).filter(Boolean);
  }

  /** the model an instance draws: a MY WIDGETS definition it references (live: the library's current version), or — an older Studio
      widget — its own inline components */
  function modelOf(config) {
    const L = global.IniqStudioLibrary;
    if (typeof config.definition === 'string') return L && L.model(config.definition);
    // Studio's own canvas (already in the property form — live, never copied) · an OLDER inline Studio item: migrated once to properties
    const m = { name: config.name, canvas: config.canvas, slots: config.slots, properties: config.properties, components: config.components };
    return Array.isArray(config.properties) || !global.IniqBinding ? m : global.IniqBinding.migrate(m);
  }

  function create(config = {}, { onAction = null } = {}) {
    const root = document.createElement('article');
    root.className = 'stw';
    root.setAttribute('role', 'group');
    const stage = document.createElement('div');
    stage.className = 'stw__stage';
    root.append(stage);
    // the slot → entity map of THIS widget: a dashboard copy's own assignments (config.entities); Studio's canvas (an inline model with
    // slots): each slot's preview entity. A copy never falls back to the designer's preview entity.
    let model = null;
    const modelNow = () => (typeof config.definition === 'string' || !Array.isArray(config.properties) ? model : config);
    const entityOf = (id) => (typeof config.definition === 'string' ? (config.entities && config.entities[id]) || null
      : (((modelNow() || {}).slots || []).find((x) => x.id === id) || {}).preview || null);
    const ctx = { ext: null, vars: {}, entityOf, model: modelNow, onAction: (kind, value, cid) => {
      // a choice in a segmented control of this widget: the elements shown only while it shows an option follow it
      if (kind === 'select' && cid) { ctx.vars[cid] = value; stage.querySelectorAll('.stw__c[data-local]').forEach((nd) => { if (nd.__x) present(nd, nd.__x, ctx); }); }
      root.dispatchEvent(new CustomEvent('iq-studio-action', { bubbles: true, detail: { kind, value, ...(cid ? { component: cid } : {}) } })); if (onAction) onAction(kind, value, cid); } };
    let cw = 360, ch = 240, box = { w: 0, h: 0 }, fill = false;
    /** draw the model (again: a definition saved meanwhile) — the nodes' bindings stop with them */
    function build() {
      model = modelOf(config);
      stage.querySelectorAll('.stw__c').forEach((n) => { if (n.__bind) n.__bind.stop(); n.__bind = null; (n.__whenW || []).forEach((h) => h && h.stop()); n.__whenW = []; });
      stage.replaceChildren();
      delete root.dataset.missing;
      root.querySelectorAll('.stw__missing').forEach((n) => n.remove());
      if (!model) {
        root.dataset.missing = '';
        root.setAttribute('aria-label', 'Widget not found');
        const p = document.createElement('p'); p.className = 'stw__missing'; p.textContent = 'This widget is no longer available.';
        root.replaceChildren(stage, p);
        return;
      }
      cw = Math.max(1, num(model.canvas && model.canvas.w, 360)); ch = Math.max(1, num(model.canvas && model.canvas.h, 240));
      // FILL the cell (the default): elements follow their pins (automatic: centred, a full-size background stretched). 'fit': the whole
      // design scaled and centred, empty bands around it where the cell has another shape.
      fill = !(model.canvas && model.canvas.fit === 'fit');
      ctx.ext = fill ? { cw, ch, W: cw, H: ch, comps: model.components || [] } : null;
      stage.style.width = `${cw}px`; stage.style.height = `${ch}px`;
      root.setAttribute('aria-label', typeof model.name === 'string' && model.name ? model.name : 'Widget');
      const comps = Array.isArray(model.components) ? model.components : [];
      // a COPY of a definition: its own settings replace the exposed configuration keys (the definition itself is never changed)
      (typeof config.definition === 'string' ? withSettings(comps, model.settings, config.settings) : comps).forEach((x) => { const b = component(x, ctx); if (b) stage.append(b); });
      stage.querySelectorAll('.stw__c').forEach((b) => { if (b.__x && b.__x.style && b.__x.style.clipTo) clipping(b); });
      if (box.w) fit(box.w, box.h);
    }
    // the logical canvas, scaled to the widget's own box (centred; never re-laid out)
    function fit(w, h) {
      box = { w, h };
      const s = Math.min(w / cw, h / ch) || 1;
      if (fill && ctx.ext) {
        // FILL: the canvas takes the cell's shape (the longer side grows); elements follow their pins — no empty bands
        const W = Math.max(cw, Math.round((w / s) * 100) / 100), H = Math.max(ch, Math.round((h / s) * 100) / 100), moved = W !== ctx.ext.W || H !== ctx.ext.H;
        ctx.ext.W = W; ctx.ext.H = H;
        stage.style.width = `${W}px`; stage.style.height = `${H}px`;
        stage.style.transform = `scale(${s})`;
        root.dataset.scale = s.toFixed(3); root.dataset.fill = '';
        if (moved) stage.querySelectorAll('.stw__c').forEach((nd) => { if (nd.__x) refresh(nd, nd.__x, ctx, true); });
        return;
      }
      stage.style.transform = `translate(${Math.round((w - cw * s) / 2)}px, ${Math.round((h - ch * s) / 2)}px) scale(${s})`;
      root.dataset.scale = s.toFixed(3);
    }
    build();
    // a referenced definition saved again (Widget Studio): every instance on screen follows it
    if (typeof config.definition === 'string' && global.IniqStudioLibrary) {
      let seen = false;
      const off = global.IniqStudioLibrary.onChange((id) => { if (root.isConnected) seen = true; else if (seen) { off(); return; } if (id === config.definition) build(); });
    }
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => { fit(w, h); return w < 200 || h < 120 ? 'compact' : 'normal'; } });
    const node = (id) => stage.querySelector(`.stw__c[data-cid="${CSS.escape(String(id))}"]`);
    root.studio = { node, canvas: () => ({ w: cw, h: ch }), stage, fit, place, update: (x) => refresh(node(x.id), x, ctx) };
    return root;
  }

  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 1 }; }

  global.MaisonStudioWidget = { create, component, constraints, modelOf, withSettings, settingFields, settingField, copySettingValue, SETTABLE, SETTING_ID, TESTS: Object.keys(TESTS), whenConfig, BLENDS, elementStyle, geo };
})(window);
