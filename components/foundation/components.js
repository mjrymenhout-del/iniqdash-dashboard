/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqComponents — the REGISTRY of IniqDash's shared VISUAL COMPONENTS (docs/COMPONENT-FOUNDATION.md). Each shared component module
   (icons, information, controls, widget kit, tabs) describes itself here: what it is, what it renders, the configuration it reads and
   what it can do. Widgets keep using the modules directly; the registry only makes the foundation DISCOVERABLE (a future Widget Studio
   lists and builds from it). It holds no state, renders nothing and knows no widget, entity or Home Assistant domain.

   IniqComponents.define(id, def) → def        (once per id; later definitions of the same id are refused)
     def = { name, category: one of CATEGORIES, render: (config, bindings) → Element (a pure renderer: data in, element out),
             contract: { <config key>: '<what it is>' } (the component's own configuration — composable: a contract may name another
             component's contract, e.g. icon: 'icon'), capabilities: ['<what it can do>'], state: '<what its update() receives>',
             module: 'IniqControls.button' (where it lives) }
             compose?: what a HOST needs to place the component on its own inside a composed widget (Widget Studio, a Studio widget's
             runtime) — { defaults: config, data: the preview VIEW (mock data through the normal view contract — later a Home Assistant
             binding), dataFields: editor fields for that view (keys 'data.…'), box: { w, h } its first box, min: { w, h } its smallest box,
             editor: the capabilities passed to its editor builder, fields?() → its own Properties (instead of the shared builder — a
             component whose Studio form is not its owners' one), initial?() → the configuration a newly placed one starts with (defaults:
             what an unset key means), range?: [config keys] its own range (prefilled from Home Assistant), bindWhen?(config) → whether it
             takes an entity now (a Value / Text in Static mode does not), nameBase?: the stem of a placed control's default Name ("Button" → Button1;
             absent: the component's name without spaces),
             render(config, data, { onAction, box }) → Element (a fresh element; box: its { w, h } in logical px),
             update(el, config, data, ctx) → true | false (the VIEW path: the same element brought up to date — false / absent: the host
             renders a fresh one; never a whole-widget rebuild),
             resize: HOW IT LAYS OUT IN ITS BOX (a normal resize changes the box only) — { mode: 'center' (its own size, centred) | 'fill'
             (it is the box) | 'layout' (the box is layout room), aspect: 'square' | 'free', toBox(config, prev, box) → box patch | null
             (a presentation the user changed that outgrows its box → the box it needs) },
             scale: WHAT SCALES IN PROPORTION when the host scales it (Shift + resize) — { props: { <config key>: [min, max] }, base(config)
             → { <key>: its effective value now } } | null (nothing to scale). The host scales from a snapshot taken at the start of the
             gesture (base × factor, never compounded) and stores the results as ordinary configuration — no hidden scale,
             inputs?: WHAT VIEW DATA A BINDING MAY FEED — { <data key>: { label, kind: 'text' | 'number' | 'boolean' | 'option', primary?,
             unit?, bindOnly? } }, actions?: WHAT IT REPORTS through ctx.onAction — { <event>: { label, kind: 'press' | 'number' |
             'option' } } (components/ha/binding.js turns them into Home Assistant reads and normalised actions; the component never does) } }
   IniqComponents.editor(id, builder)          the CONFIGURATION builder of that component (the editor registers it: builder(caps) →
                                               field definitions — capability-driven: the caller says what it exposes)
   IniqComponents.composable()                 the components a host can place standalone (those with compose)
   IniqComponents.get(id) · list(category?) · ids() · CATEGORIES
   ========================================================================== */
(function (global) {
  'use strict';

  const CATEGORIES = ['content', 'controls', 'data', 'visual', 'layout'];
  const defs = new Map(), editors = new Map();
  const ID = /^[a-z][a-z0-9-]{1,40}$/;

  function define(id, def) {
    if (!ID.test(id) || !def || typeof def !== 'object') throw new Error(`IniqComponents: invalid definition ${id}`);
    if (defs.has(id)) return defs.get(id);
    if (!CATEGORIES.includes(def.category)) throw new Error(`IniqComponents: ${id} has no known category`);
    const d = Object.freeze({ id, name: def.name || id, category: def.category, render: typeof def.render === 'function' ? def.render : null,
      contract: Object.freeze({ ...(def.contract || {}) }), capabilities: Object.freeze([...(def.capabilities || [])]), state: def.state || '', module: def.module || '',
      compose: def.compose && typeof def.compose.render === 'function' ? Object.freeze({ defaults: {}, data: {}, dataFields: [], editor: {}, box: { w: 120, h: 60 }, min: { w: 24, h: 24 }, ...def.compose,
        resize: Object.freeze({ mode: 'layout', aspect: 'free', toBox: null, ...(def.compose.resize || {}) }),
        scale: def.compose.scale && def.compose.scale.props && typeof def.compose.scale.base === 'function' ? Object.freeze({ ...def.compose.scale }) : null,
        update: typeof def.compose.update === 'function' ? def.compose.update : null }) : null });
    defs.set(id, d);
    return d;
  }
  function editor(id, builder) {
    if (typeof builder === 'function') { editors.set(id, builder); return builder; }
    return editors.get(id) || null;
  }
  const get = (id) => defs.get(id) || null;
  const list = (category) => [...defs.values()].filter((d) => !category || d.category === category);

  /** ELEMENT METADATA for a future Studio flow (Add Element → Select Element → Properties): one JSON-safe entry per composable component —
      identity, category, its Properties (the editor builder's field keys / types / labels / groups), default configuration, preview data,
      what a binding may feed (inputs), what it reports (actions), its box and how it resizes / scales. The renderer stays get(id).compose. */
  function catalog() {
    const plain = (f) => ({ key: f.key, type: f.type, label: f.label || '', ...(f.group ? { group: f.group } : {}), ...(Array.isArray(f.options) ? { options: f.options.map((o) => (typeof o === 'object' ? o.value : o)) } : {}) });
    return list().filter((d) => d.compose).map((d) => {
      const c = d.compose, ed = editors.get(d.id);
      let fields = [];
      try { fields = (ed ? ed(c.editor || {}) : (typeof c.fields === 'function' ? c.fields() : [])).filter((f) => f && f.key).map(plain); } catch (e) { fields = []; }
      const init = typeof c.initial === 'function' ? c.initial() : {};
      return JSON.parse(JSON.stringify({ id: d.id, name: d.name, category: d.category, module: d.module, capabilities: d.capabilities, properties: fields,
        defaults: { ...c.defaults, ...init }, preview: c.data || {}, inputs: c.inputs || {}, actions: c.actions || {}, box: c.box, min: c.min,
        resize: { mode: c.resize.mode, aspect: c.resize.aspect }, scale: c.scale ? Object.keys(c.scale.props || {}) : [] }));
    });
  }
  global.IniqComponents = Object.freeze({ define, editor, get, list, ids: () => [...defs.keys()], composable: () => list().filter((d) => d.compose), catalog, CATEGORIES });
})(window);
