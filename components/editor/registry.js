/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Component registry — the one place that maps a dashboard item TYPE to the existing component
   and DESCRIBES its configuration. Used by the editor, the gallery and model validation.
   It implements no widget; every visual comes from the component itself.

   MaisonRegistry.TYPES[type] = {
     label, group, description, glyph (editor picker icon, static markup),
     create(config[, content]) → HTMLElement          the real component
     constraints(config, widthPx) → { minW, minH, … } span-dependent minimums resolved from the width
     defaults   demo configuration (plain JSON)
     size       { w, h } default desktop size (grid units)
     fields     configuration schema — see FIELD below
     validate?  (config) → [{ key, message }]         cross-field rules (min < max, …)
     normalize? (config) → config                     upgrade legacy shorthands before editing
     isContainer?
   }

   FIELD = {
     key       config path, dot-separated ('name', 'capabilities.speed', 'labels.open')
     type      'text' | 'number' | 'boolean' | 'select' | 'range' | 'icon' | 'image' | 'list'
     label, help?, placeholder?
     group     'identity'  — what is this?
               'capability'— what can it do / show? (switches whole controls on or off)
               'data'      — demo values / state (later: supplied by Home Assistant)
               'appearance'— how it looks
     required?, min?, max?, step?, integer?, maxLength?
     options?  [value] or [{ value, label }]  (select, icon, list-with-options)
     optionsFrom? (config) → options          e.g. the preset select lists the configured presets
     icons?    () → { name: svgMarkup }        icon previews (static component-owned markup)
     picks?    [path]                          suggested images (image fields)
     when?     (config) → boolean              shown/validated only when true — a control for a
                                               capability the component does not have is never shown
     optional? true → an empty value REMOVES the key (the component then hides that element)
     get?/set? adapters when the form value is not stored as-is (e.g. appliance actions)
   }
   Layout (x/y/w/h) is never a field: it belongs to the Grid.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---- widget packages: widgets/<source>/<folder>/ with a widget.json manifest (schema 1, see server/WidgetPackages.php):
       { schema, id, name, source, version, entry, style, assets, api, basedOn?, ha? } (+ path).
     · FACTORY widgets: widgets/index.js (built from widgets/default/ by server/build-widget-index.php), loaded before
       this registry; the pages load their entry and style files explicitly.
     · CUSTOM widgets: discovered by the SERVER on every page load (gate.php) from widgets/custom/ — the validated list
       arrives as a JSON data block (#iniqdash-custom-widgets) and their scripts / stylesheets are already on the page.
       Installing one = copying its folder; no core file names an installed custom widget.
     This registry stays the single authority on widget TYPES: a type's id = its package id = the item.type stored in
     dashboards. A widget's implementation is the API object its manifest names (api), defined by its entry script. */
  const CUSTOM_ID = /^custom\.[a-z][a-z0-9-]{0,39}$/;
  const customData = (() => {
    try {
      const el = typeof document !== 'undefined' && document.getElementById('iniqdash-custom-widgets');
      const d = el ? JSON.parse(el.textContent || '{}') : {};
      return { packages: Array.isArray(d.packages) ? d.packages : [], collections: Array.isArray(d.collections) ? d.collections : [], rejected: Array.isArray(d.rejected) ? d.rejected : [] };
    } catch (err) { return { packages: [], collections: [], rejected: [{ folder: 'widgets/custom/', error: `package list unreadable (${err.message})` }] }; }
  })();
  /* COLLECTIONS (organisational metadata only — never part of a widget's type id or of dashboard data):
     'iniqdash' = IniqDash's own widgets (the factory widgets and the first-party packages), 'general' = standalone custom widgets you
     installed, else a discovered collection.json, or a collection you created in Widget Studio (components/studio/library.js).
     A widget's SOURCE (built-in · installed · user) is separate provenance, never shown as a collection. */
  const COLL_ID = /^[a-z][a-z0-9-]{0,39}$/;
  const COLLECTIONS = (Array.isArray(customData.collections) ? customData.collections : [])
    .filter((c) => c && COLL_ID.test(c.id) && !['all', 'general', 'built-in', 'iniqdash'].includes(c.id) && typeof c.name === 'string' && /^widgets\/custom\/[a-z][a-z0-9-]{0,39}\/$/.test(c.path))
    .map((c) => Object.freeze({ id: c.id, name: c.name, description: typeof c.description === 'string' ? c.description : '', path: c.path }));
  const COLL = Object.fromEntries(COLLECTIONS.map((c) => [c.id, c]));
  // the server validated them; the browser still only accepts the shape it expects (id, location, file names):
  // widgets/custom/<folder>/ (General) or <its collection's folder><folder>/
  const CUSTOM = customData.packages.filter((m) => m && m.source === 'custom' && CUSTOM_ID.test(m.id)
    && m.path === (m.collection == null ? 'widgets/custom/' : COLL[m.collection] ? COLL[m.collection].path : '\0') + `${m.id.slice(7)}/`
    && /^[a-z0-9][a-z0-9._-]*\.js$/.test(m.entry) && /^[A-Z][A-Za-z0-9]{0,40}$/.test(m.api)).map((m) => Object.freeze({ ...m }));
  /* CATEGORIES (the gallery headings, in this order): WHAT a widget does — independent of its COLLECTION (design /
     distribution family) and of its VARIANT (presentation). A custom widget may declare one in widget.json "category"
     (the same table as server/WidgetPackages.php); the ids of the earlier provisional grouping still work (LEGACY_CATEGORY).
     An unknown — but valid — id becomes its own heading. A category with no widget is simply not shown in the gallery.
     Containers are layout infrastructure, listed last on their own. */
  const CATEGORIES = { controls: 'Controls', climate: 'Climate & Environment', security: 'Security', media: 'Media', sensors: 'Sensors & Data',
    energy: 'Energy', appliances: 'Appliances & Robots', people: 'People', time: 'Time & Calendar', navigation: 'Navigation & Content',
    containers: 'Containers', custom: 'Custom' };
  /** provisional category ids custom packages may already declare → their final category (nothing to change in a package) */
  const LEGACY_CATEGORY = { lighting: 'controls', information: 'sensors', environment: 'climate', actions: 'navigation', content: 'navigation' };
  const finalCategory = (id) => LEGACY_CATEGORY[id] || id;
  const CAT_OF_GROUP = Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [v, k]));
  const categoryLabel = (id) => CATEGORIES[id] || String(id).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  /* ---- VARIANTS: ONE shared presentation system for every widget type (factory and custom).
     A variant is a PRESENTATION of the same widget — never another type: switching it keeps the type, the id, the entity,
     Information lines, interactions, visibility, every other setting and the grid placement (nothing is resized).
       type definition:  variants: [{ id: 'standard', label: 'Standard', default: true }, { id: 'value', label: 'Value' }]
                         stable lowercase ids, a label, exactly ONE default (otherwise the first one is the default)
       saved:            config.variant = '<id>' — only once the user chose one; a dashboard without it shows the default
       unknown id:       an obsolete / foreign id renders the default and is dropped when the config is normalised
       runtime:          the widget receives the resolved id as config.variant and its root carries data-variant="<id>";
                         its OWN size (MaisonFit) still decides the layout inside the variant (a small Dial, a large Dial…)
       no variants:      exactly as before (no field, no attribute; a type's own "variant" setting — e.g. Container's
                         Primary / Secondary / Bare — is not touched)
       preview?:         { w, h } — a REPRESENTATIVE EDITOR PREVIEW shape for the variant, in grid units of a 24-column desktop
                         reference (the configure dialog converts it to the real grid). Editor only: it never sizes, moves or
                         resizes the widget on the dashboard (its w / h stay the dashboard's). */
  const VARIANT_ID = /^[a-z][a-z0-9-]{0,23}$/;
  function cleanVariants(list) {
    if (!Array.isArray(list)) return null;
    const out = [], seen = new Set();
    list.forEach((v) => {
      const label = v && typeof (v.label ?? v.name) === 'string' ? String(v.label ?? v.name).trim().slice(0, 32) : '';
      if (v && typeof v === 'object' && VARIANT_ID.test(v.id) && !seen.has(v.id) && label && !/[<>]/.test(label)) {
        seen.add(v.id);
        const p = v.preview, ok = (n, hi) => Number.isInteger(n) && n >= 1 && n <= hi;
        out.push({ id: v.id, label, default: v.default === true, ...(p && ok(p.w, 24) && ok(p.h, 30) ? { preview: Object.freeze({ w: p.w, h: p.h }) } : {}) });
      }
    });
    if (out.length < 2) return null;                                   // one presentation is not a choice
    const d = out.findIndex((v) => v.default);
    out.forEach((v, i) => { v.default = i === (d < 0 ? 0 : d); });   // exactly one default
    return Object.freeze(out.map((v) => Object.freeze(v)));
  }
  /* A factory type whose presentations depend on WHAT it is linked to may add variantsFor(config) → [variant id…]: the
     variants that make sense for this config (e.g. Number & Select: a number entity gets Slider / Stepper / Compact, a select
     entity Options / Compact). The editor offers only those; one that does not apply resolves to the first applicable one
     (the type's default when it applies) and is dropped on normalise, exactly like an unknown id. Without it: all of them. */
  function variantsAllowed(t, c) {
    const v = t && t.variants;
    if (!v) return null;
    if (typeof t.variantsFor !== 'function') return v;
    const ids = t.variantsFor(c || {});
    if (Array.isArray(ids) && !ids.length) return null;                 // [] = no presentations for this config (no field, no data-variant)
    const out = Array.isArray(ids) ? v.filter((x) => ids.includes(x.id)) : v;
    return out.length ? out : v;
  }
  /** the variant a config resolves to (null: the type has no variants) */
  function variantOf(type, c) {
    const t = typeof type === 'string' ? TYPES[type] : type, v = variantsAllowed(t, c);
    if (!v) return null;
    return (v.find((x) => x.id === c?.variant) || v.find((x) => x.default) || v[0]).id;
  }
  /** the representative editor preview shape of the variant a config resolves to ({ w, h } in 24-column reference units) or null */
  function variantPreview(type, c) {
    const t = typeof type === 'string' ? TYPES[type] : type, id = variantOf(t, c), v = id && variantsAllowed(t, c).find((x) => x.id === id);
    return v && v.preview ? { ...v.preview } : null;
  }
  /** an unknown / obsolete (or, with variantsFor, not applicable) variant id is dropped (the default applies) */
  function variantNormalize(t, c) {
    const v = variantsAllowed(t, c);
    if (v && c && c.variant !== undefined && !v.some((x) => x.id === c.variant)) delete c.variant;
    return c;
  }
  /** search tags: a few lowercase words that make the gallery search useful ("thermostat", "blind", "washer"…) */
  const cleanTags = (list) => (Array.isArray(list) ? [...new Set(list.filter((x) => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9][a-z0-9 &-]{0,23}$/.test(x)))].slice(0, 16) : []);
  const PACKAGES = (Array.isArray(global.IniqWidgetPackages) ? global.IniqWidgetPackages.filter((m) => m.source === 'default') : []).map((m) => Object.freeze({ ...m })).concat(CUSTOM);
  const PKG = Object.fromEntries(PACKAGES.map((m) => [m.id, m]));
  customData.rejected.forEach((r) => { if (typeof console !== 'undefined') console.warn(`Custom widget skipped — ${r.folder}: ${r.error}`); });
  /** the implementation of a widget type, through its package manifest */
  function impl(type) {
    const m = PKG[type], api = m && global[m.api];
    if (!api) throw new Error(m ? `Widget package "${type}" (${m.path}${m.entry}) is not loaded on this page` : `No widget package for "${type}" (widgets/index.js not loaded?)`);
    return api;
  }

  const span = (px) => (px >= 480 ? 'wide' : px >= 260 ? 'standard' : undefined);
  const NOW = '2026-10-14T09:30:00+02:00';
  const at = (d, hm) => `2026-10-${String(d).padStart(2, '0')}T${hm}:00+02:00`;
  const C_ICONS = () => global.DEMO_ICON || {};
  const keysOf = (o) => (o ? Object.keys(o).filter((k) => k !== 'generic') : []);

  /* ---- continuous visual quantities (the shared Slider + Number): the numbers the former coarse choices were drawn with ---- */
  const TEXT_SIZES = { s: 15, m: 22, l: 30, xl: 42 }, TEXT_HEADING = { s: 21, m: 30, l: 40, xl: 54 };   // = widgets/default/text/text.css --tx-size
  const clampNum = (v, lo, hi, step = 1) => Math.min(hi, Math.max(lo, Math.round(v / step) * step));
  const scaleNum = (v) => clampNum(v, 60, 160);
  /** a stored size: a number within [lo, hi] (rounded), a legacy name mapped by `legacy`, else undefined (automatic) */
  const sizeOf = (v, lo, hi, legacy = {}) => (typeof v === 'number' && Number.isFinite(v) ? clampNum(v, lo, hi) : typeof v === 'string' && legacy[v] !== undefined ? legacy[v] : undefined);

  /** TABBED CONTAINER appearance: [key, label, min, max, default] (px — the defaults are the look tabs had before these settings) and the
      discrete choices [key, label, [[value, label]…] (the first is the default), half] — components/tabs reads them (MaisonTabs.create look) */
  const TAB_RANGES = [['textSize', 'Text size', 10, 36, 14], ['iconSize', 'Icon size', 10, 56, 18], ['tabHeight', 'Tab height', 26, 100, 40], ['padX', 'Horizontal padding', 2, 60, 18], ['tabGap', 'Gap', 0, 40, 8]];
  const TAB_CHOICES = [
    ['align', 'Alignment', [['center', 'Centre'], ['start', 'Left'], ['end', 'Right']], true],
    ['distribute', 'Distribution', [['content', 'Content'], ['equal', 'Equal'], ['fill', 'Fill']], true],
    ['shape', 'Style', [['pill', 'Pill'], ['rounded', 'Rounded'], ['minimal', 'Minimal']], true],
    ['barPos', 'Tab bar', [['top', 'Top'], ['bottom', 'Bottom']], true],
    ['active', 'Selected tab', [['outline', 'Outline'], ['soft', 'Soft'], ['filled', 'Filled']], true],
    ['inactive', 'Other tabs', [['surface', 'Surface'], ['outline', 'Outline'], ['minimal', 'Minimal']], true],
    ['badgeStyle', 'Badges', [['accent', 'Accent'], ['subtle', 'Subtle']], true],
  ];

  /* ---- reusable field builders (shared vocabulary across components) ---- */
  const F = {
    /** the shared ACTION BUTTON configuration (ActionButtonConfig — CONTROL.button): capability-driven, for a package's own buttons */
    button: (o) => CONTROL.button(o),
    name: (label = 'Name') => ({ key: 'name', type: 'text', label, group: 'identity', required: true, maxLength: 60 }),
    subtitle: () => ({ key: 'subtitle', type: 'text', label: 'Subtitle', group: 'identity', optional: true, maxLength: 60, placeholder: 'e.g. Kitchen' }),
    cap: (key, label, help) => ({ key: `capabilities.${key}`, type: 'boolean', label, group: 'capability', help, demo: true }),
    state: (options, label = 'State') => ({ key: 'state', type: 'select', label, group: 'data', options, demo: true }),
    pct: (key, label, when) => ({ key, type: 'range', label, group: 'data', min: 0, max: 100, step: 1, when, demo: true }),
    text: (key, label, group = 'data', extra = {}) => ({ key, type: 'text', label, group, optional: true, maxLength: 80, ...extra }),
    num: (key, label, group = 'data', extra = {}) => ({ key, type: 'number', label, group, optional: true, ...extra }),
    image: (key, label, picks) => ({ key, type: 'image', label, group: 'appearance', optional: true, picks }),
    /** ARTWORK — the shared Image / Artwork picker (form field type 'artwork'): one visual selector None · the widget's built-in
        artworks · Upload (the secure IniqDash User Assets), and — when None is chosen — an optional FALLBACK ICON from the shared MDI
        picker with the shared icon colour and icon animation. A widget DECLARES its choices; the configurator renders them:
          F.artwork(key, label, { builtins: [{ value: '<package asset path>', label: 'Pendant' }…], upload: true, fallback: 'fallbackIcon',
                                  group: 'images', when: (c) => bool })   → [the picker, its fallback icon fields]
        Stored: config[key] = a built-in's path · an uploaded asset ('api/asset.php?id=…') · 'none' (literally no image — never "the
        default"); config[fallback] = { icon: 'mdi:…', color?: <token>, animation?: <kind>, animateWhen?: 'active' | 'always' } or absent.
        The widget decides how (and whether) its variant presents the image or the icon. Paths are never shown to the owner. */
    artwork: (key, label, { builtins = [], upload = true, fallback = 'fallbackIcon', group = 'images', when = null, help = null, iconSize = null } = {}) => {
      const list = builtins.filter((b) => b && typeof b.value === 'string' && /^(assets|widgets\/(default|custom))\/[A-Za-z0-9._\/-]+$/.test(b.value) && !b.value.includes('..') && typeof b.label === 'string').map((b) => ({ value: b.value, label: b.label.slice(0, 24) }));
      const isNone = (c) => { const v = c[key]; return v === 'none' || v === undefined || v === null || v === ''; };
      const on = (c) => !when || when(c);
      const fb = (c) => (c[fallback] && typeof c[fallback] === 'object' && !Array.isArray(c[fallback]) ? c[fallback] : {});
      const put = (c, k, v) => { const o = { ...fb(c) }; if (v === undefined || v === '' || v === null) delete o[k]; else o[k] = v; if (!o.icon) { delete o.color; delete o.background; delete o.animation; delete o.animateWhen; delete o.size; }
        if (o.background === 'subtle' || (o.background !== undefined && !ICON_BGS.some((x) => x.value === o.background))) delete o.background;
        if (!o.animation || o.animation === 'none') { delete o.animation; delete o.animateWhen; } if (Object.keys(o).length) c[fallback] = o; else delete c[fallback]; };
      const picker = { key, type: 'artwork', label, group, optional: true, upload: !!upload, builtins: list, picks: list.map((b) => b.value), when: when || undefined,
        get: (c) => (isNone(c) ? 'none' : c[key]), set: (c, v) => { c[key] = v === undefined || v === '' || v === null ? 'none' : v; }, ...(help ? { help } : {}) };
      if (!fallback) return [picker];
      const iconOn = (c) => on(c) && isNone(c), styled = (c) => iconOn(c) && !!fb(c).icon;
      return [picker,
        { key: `${fallback}.icon`, type: 'mdi', label: 'Fallback icon', group, optional: true, when: iconOn, get: (c) => fb(c).icon || '', set: (c, v) => put(c, 'icon', v) },
        // iconSize { min, max, autoValue? } (opt-in): the GLYPH size in px — a background never shrinks it (it grows around the glyph)
        ...(iconSize ? [{ key: `${fallback}.size`, type: 'range', label: 'Icon size', group, unit: 'px', min: iconSize.min, max: iconSize.max, step: 1, auto: 'Automatic',
          ...(iconSize.autoValue !== undefined ? { autoValue: iconSize.autoValue } : {}), when: styled, get: (c) => (typeof fb(c).size === 'number' ? fb(c).size : undefined),
          set: (c, v) => put(c, 'size', typeof v === 'number' && Number.isFinite(v) ? clampNum(v, iconSize.min, iconSize.max) : undefined),
          help: iconSize.help || 'The size of the icon itself. Automatic: the widget sizes it for its space.' }] : []),
        { key: `${fallback}.color`, type: 'color', label: 'Icon colour', group, optional: true, options: INFO_COLORS, when: styled, get: (c) => fb(c).color, set: (c, v) => put(c, 'color', v) },
        { key: `${fallback}.background`, type: 'select', label: 'Icon background', group, half: true, options: ICON_BGS, when: styled, get: (c) => fb(c).background || 'subtle', set: (c, v) => put(c, 'background', v) },
        { key: `${fallback}.animation`, type: 'select', label: 'Icon animation', group, half: true, options: ICON_ANIMS, when: styled, get: (c) => fb(c).animation || 'none', set: (c, v) => put(c, 'animation', v) },
        { key: `${fallback}.animateWhen`, type: 'select', label: 'Animate when', group, half: true, options: ANIMATE_WHEN_OPTS, when: (c) => styled(c) && !!fb(c).animation,
          get: (c) => fb(c).animateWhen || 'active', set: (c, v) => put(c, 'animateWhen', v) }];
    },
    /** APPEARANCE choices of a widget (the Room / Light reference pattern, docs/WIDGET-REFERENCE.md): semantic select fields in the
        Appearance group, each shown only for the variants it means something for. api() → { LOOK: { key: [values…] (first = default) },
        LOOK_FOR: { variant: [keys…] } }; variant(c) → the resolved variant id; rows: [key, label, [option labels…], help?]. Values are
        allow-listed — the widget's normalize drops anything else and the default (never stored). */
    /** TITLE SIZE as a continuous quantity (the shared Slider + Number, %): a scale of the widget's own title size (which MaisonFit
        chooses for its box); absent = Automatic (100 %). legacy: the former choices → their scale, e.g. { small: 80, medium: 92, large: 120 } —
        an older configuration keeps its look; once moved, the number is stored. when(c): the variants that offer it. */
    titleScale: (legacy, when) => ({ key: 'titleSize', type: 'range', label: 'Title size', group: 'appearance', unit: '%', min: 60, max: 160, step: 1, auto: 'Automatic', autoValue: 100,
      get: (c) => (typeof c.titleSize === 'number' ? c.titleSize : legacy[c.titleSize]), ...(when ? { when } : {}),
      help: 'A scale of the title size the widget chooses for its own size. Automatic: 100 %.' }),
    looks: (api, variant, rows) => rows.map(([key, label, labels, help]) => ({
      key, type: 'select', label, group: 'appearance', ...(help ? { help } : {}),
      optionsFrom: () => ((api() && api().LOOK[key]) || []).map((v, i) => ({ value: v, label: labels[i] || v })),
      get: (c) => { const L = api() && api().LOOK[key]; return L && L.includes(c[key]) ? c[key] : L ? L[0] : undefined; },
      when: (c) => { const A = api(); return !!(A && A.LOOK_FOR[variant(c)] && A.LOOK_FOR[variant(c)].includes(key)); },
    })),
    // (an image field with upload: true also offers "Upload image" — IniqDash User Assets — for widgets that can show one)
    available: () => ({ key: 'available', type: 'boolean', label: 'Available', group: 'data', help: 'Off shows the unavailable state', demo: true }),
    /** Home Assistant entity (IniqHA): only offered when the page is served by the IniqDash server.
        The config stores the entity id only — never anything about the connection. */
    entity: (type, onPick) => ({ key: 'entity', type: 'entity', label: 'Home Assistant entity', group: 'identity', optional: true,
      domains: global.IniqHA?.domainsFor?.(type) || null,
      help: 'Linked: the widget shows and controls this entity live. Not linked: demo data below.',
      when: () => !!global.IniqHA?.enabled?.(),
      // picking an entity replaces the demo identity: its name, and its Home Assistant area as the subtitle (never the demo text)
      onPick: (c, e) => { c.name = String(e.name).slice(0, 60).replace(/[<>]/g, ''); if (c.subtitle !== undefined) c.subtitle = e.area ? String(e.area).slice(0, 60).replace(/[<>]/g, '') : ''; if (onPick) onPick(c, e); } }),
    /* ---- COMMON widget capabilities (components/widget-kit/widget-kit.js renders / runs them; a widget opts in by
       using these fields and calling the kit). Stored in the widget's own config: corners, interactions, visibility. */
    /** per-corner shape: { tl, tr, bl, br } × { shape: normal | concave, r }. Absent = the widget's legacy radius
        (fallbackKey, e.g. 'radius'), so existing items render exactly as before until a corner is changed. */
    corners: (fallback = 'radius', group = 'appearance', extra = {}) => ({ key: 'corners', type: 'corners', label: 'Corners', group, optional: true,
      // what the corner editor starts from: a config key holding the legacy radius, a number of px, or (config) → px
      ...(typeof fallback === 'string' ? { fallbackKey: fallback } : { fallback: typeof fallback === 'function' ? fallback : () => Number(fallback) || 0 }),
      help: 'Each corner: normal (rounded) or concave (cut inwards, transparent), with its own radius. Not set: the widget’s own corners.', ...extra }),
    /** EXPANDABLE LIST (components/expandlist — shared by list widgets): config.list = { mode, count, expanded, control }; absent =
        the list as it always was ("Show all", scrolling inside the widget). Expanding never resizes the widget or its grid cell. */
    expandList: (group = 'appearance') => {
      const on = (c) => !!(c.list && c.list.mode === 'expand');
      return [
        { key: 'list.mode', type: 'select', label: 'Long lists', group, get: (c) => (on(c) ? 'expand' : 'all'), set: (c, v) => { if (v === 'expand') c.list = { ...(c.list || {}), mode: 'expand' }; else delete c.list; },
          options: [{ value: 'all', label: 'Show all (scrolls inside the widget)' }, { value: 'expand', label: 'Expandable — the first rows, then Show more' }] },
        { key: 'list.count', type: 'range', label: 'Rows shown collapsed', group, unit: '', min: 1, max: 20, step: 1, when: on, get: (c) => (c.list && typeof c.list.count === 'number' ? c.list.count : 3) },
        { key: 'list.control', type: 'select', label: 'Show more control', group, half: true, when: on, get: (c) => (c.list && c.list.control) || 'button',
          options: [{ value: 'button', label: 'Button' }, { value: 'text', label: 'Text' }, { value: 'arrow', label: 'Arrow' }] },
        { key: 'list.expanded', type: 'boolean', label: 'Start expanded', group, half: true, when: on, get: (c) => !!(c.list && c.list.expanded) },
      ];
    },
    expandListClean: (c) => {
      if (c.list === undefined) return c;
      const l = c.list && typeof c.list === 'object' && !Array.isArray(c.list) && c.list.mode === 'expand' ? c.list : null;
      if (!l) { delete c.list; return c; }
      const o = { mode: 'expand' };
      if (typeof l.count === 'number' && Number.isFinite(l.count) && Math.round(l.count) !== 3) o.count = clampNum(Math.round(l.count), 1, 20);
      if (['text', 'arrow'].includes(l.control)) o.control = l.control;
      if (l.expanded === true) o.expanded = true;
      c.list = o; return c;
    },
    /** WIDGET SURFACE (common capability, every widget — components/widget-kit surface()): the OUTER surface only (never its content).
        Background: Theme (as it is) · Transparent · Custom opacity (0–100 %). Hover: Default (none) · None · Surface (reveals / strengthens
        the surface) · Glow · Lift · Surface + Lift — opacity, colour, glow strength, lift (px, visual only) and transition (ms). */
    widgetSurface: (group = 'appearance') => {
      const hv = (c) => c.hover || 'default', has = (c, ...k) => k.includes(hv(c)), keep = (k) => (c, v) => { if (typeof v === 'number' && Number.isFinite(v)) c[k] = v; else delete c[k]; };
      const K = () => global.IniqWidgetKit || {};
      const bgm = (c) => c.widgetBg || 'theme', is = (...m) => (c) => m.includes(bgm(c));
      const COLORS = [...INFO_COLORS];
      const bgDrop = ['widgetBgOpacity', 'bgColor', 'bgFrom', 'bgVia', 'bgTo', 'bgAngle', 'bgShape', 'bgImage', 'bgFit', 'bgPos', 'bgOverlay', 'bgOverlayMode'];
      return [
        // APPEARANCE PRESETS: one choice sets several settings below (each can be changed afterwards)
        { key: 'appearancePreset', type: 'select', label: 'Card style preset', group, get: () => '', set: (c, v) => { if (v && K().applyAppearancePreset) K().applyAppearancePreset(c, v); },
          options: [{ value: '', label: 'Choose a preset…' }, ...Object.entries((global.IniqWidgetKit || {}).APPEARANCE_PRESETS || {}).map(([value, p]) => ({ value, label: p.label }))],
          help: 'Applies a professional card style in one step: background, border, shadow and glow. Every setting stays editable below.' },
        { key: 'widgetBg', type: 'select', label: 'Card background', group, half: true, get: bgm,
          set: (c, v) => { const keep2 = { opacity: ['widgetBgOpacity'], solid: ['widgetBgOpacity', 'bgColor'], gradient: ['widgetBgOpacity', 'bgFrom', 'bgVia', 'bgTo', 'bgAngle', 'bgShape'], image: ['widgetBgOpacity', 'bgImage', 'bgFit', 'bgPos', 'bgOverlay', 'bgOverlayMode'] }[v] || [];
            bgDrop.filter((k) => !keep2.includes(k)).forEach((k) => delete c[k]);
            if (['transparent', 'opacity', 'solid', 'gradient', 'image'].includes(v)) c.widgetBg = v; else delete c.widgetBg; },
          options: [{ value: 'theme', label: 'Theme' }, { value: 'transparent', label: 'Transparent' }, { value: 'opacity', label: 'Theme, custom opacity' }, { value: 'solid', label: 'Solid colour' },
            { value: 'gradient', label: 'Gradient' }, { value: 'image', label: 'Image' }],
          help: 'The card behind the widget only — its controls, dial, tiles and pictures keep their own looks.' },
        { key: 'widgetBgOpacity', type: 'range', label: 'Background opacity', group, unit: '%', min: 0, max: 100, step: 1, get: (c) => (typeof c.widgetBgOpacity === 'number' ? c.widgetBgOpacity : 100), set: keep('widgetBgOpacity'),
          when: is('opacity', 'solid', 'gradient', 'image'), help: '100 %: fully painted · lower values let the dashboard show through (glass).' },
        { key: 'bgColor', type: 'color', label: 'Background colour', group, custom: true, options: COLORS, when: is('solid') },
        { key: 'bgFrom', type: 'color', label: 'Gradient start', group, custom: true, options: COLORS, when: is('gradient') },
        { key: 'bgVia', type: 'color', label: 'Gradient middle', group, optional: true, custom: true, options: COLORS, when: is('gradient'), help: 'Optional: a third colour in the middle.' },
        { key: 'bgTo', type: 'color', label: 'Gradient end', group, custom: true, options: COLORS, when: is('gradient') },
        { key: 'bgShape', type: 'select', label: 'Gradient shape', group, half: true, get: (c) => c.bgShape || 'linear', set: (c, v) => { if (v === 'radial') c.bgShape = v; else delete c.bgShape; },
          options: [{ value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial (light from the top left)' }], when: is('gradient') },
        { key: 'bgAngle', type: 'range', label: 'Gradient direction', group, unit: '°', min: 0, max: 360, step: 5, get: (c) => (typeof c.bgAngle === 'number' ? c.bgAngle : 160), set: keep('bgAngle'),
          when: (c) => bgm(c) === 'gradient' && c.bgShape !== 'radial' },
        ...F.artwork('bgImage', 'Background image', { builtins: CARD_IMAGES, upload: true, fallback: null, group, when: is('image'), help: 'A built-in scene or your own uploaded picture. It fills the card; the darkening keeps the text readable.' }),
        { key: 'bgFit', type: 'select', label: 'Image sizing', group, half: true, get: (c) => c.bgFit || 'cover', set: (c, v) => { if (v === 'contain') c.bgFit = v; else delete c.bgFit; },
          options: [{ value: 'cover', label: 'Fill the card (crop)' }, { value: 'contain', label: 'Whole image' }], when: is('image') },
        { key: 'bgPos', type: 'select', label: 'Image position', group, half: true, get: (c) => c.bgPos || 'center', set: (c, v) => { if (v && v !== 'center') c.bgPos = v; else delete c.bgPos; },
          options: [['center', 'Centre'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']].map(([value, label]) => ({ value, label })), when: is('image') },
        { key: 'bgOverlay', type: 'range', label: 'Image darkening', group, unit: '%', min: 0, max: 90, step: 1, get: (c) => (typeof c.bgOverlay === 'number' ? c.bgOverlay : 35), set: keep('bgOverlay'), when: is('image') },
        { key: 'bgOverlayMode', type: 'select', label: 'Darkening', group, half: true, get: (c) => c.bgOverlayMode || 'even', set: (c, v) => { if (v === 'bottom' || v === 'top') c.bgOverlayMode = v; else delete c.bgOverlayMode; },
          options: [{ value: 'even', label: 'Even' }, { value: 'bottom', label: 'Stronger at the bottom' }, { value: 'top', label: 'Stronger at the top' }], when: is('image') },
        // border, shadow, glow (every background mode)
        { key: 'borderWidth', type: 'range', label: 'Border width', group, unit: 'px', min: 0, max: 4, step: 1, get: (c) => (typeof c.borderWidth === 'number' ? c.borderWidth : 0), set: keep('borderWidth') },
        { key: 'borderColor', type: 'color', label: 'Border colour', group, optional: true, custom: true, options: COLORS, when: (c) => c.borderWidth > 0, help: 'Default: the theme’s border colour.' },
        { key: 'borderStyle', type: 'select', label: 'Border style', group, half: true, get: (c) => c.borderStyle || 'solid', set: (c, v) => { if (v === 'dashed' || v === 'dotted') c.borderStyle = v; else delete c.borderStyle; },
          options: [{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }], when: (c) => c.borderWidth > 0 },
        { key: 'bgBlur', type: 'range', label: 'Glass blur', group, unit: 'px', min: 0, max: 24, step: 1, get: (c) => (typeof c.bgBlur === 'number' ? c.bgBlur : 0), set: keep('bgBlur'),
          help: 'Blurs whatever is behind the card (the page background or a picture) — with a see-through background (lower opacity or Transparent) it gives a frosted-glass card.' },
        { key: 'contentScale', type: 'range', label: 'Content size', group, unit: '%', min: 80, max: 130, step: 5, get: (c) => (typeof c.contentScale === 'number' ? c.contentScale : 100), set: keep('contentScale'),
          help: 'Everything inside the card — text, icons, controls — larger or smaller; the card keeps its place and size on the grid.' },
        { key: 'shadow', type: 'select', label: 'Shadow', group, half: true, get: (c) => c.shadow || 'theme', set: (c, v) => { if (['none', 'soft', 'strong', 'inner'].includes(v)) c.shadow = v; else delete c.shadow; },
          options: [{ value: 'theme', label: 'Theme' }, { value: 'none', label: 'None' }, { value: 'soft', label: 'Soft' }, { value: 'strong', label: 'Strong' }, { value: 'inner', label: 'Inner (recessed)' }] },
        { key: 'cardGlow', type: 'range', label: 'Card glow', group, unit: '%', min: 0, max: 100, step: 1, get: (c) => (typeof c.cardGlow === 'number' ? c.cardGlow : 0), set: keep('cardGlow'), help: 'A soft light around the card, e.g. for an active device.' },
        { key: 'cardGlowColor', type: 'color', label: 'Card glow colour', group, optional: true, custom: true, options: COLORS, when: (c) => c.cardGlow > 0, help: 'Default: the accent colour.' },
        // the CONTENT's colours on this card
        { key: 'textTone', type: 'select', label: 'Text colour', group, half: true, get: (c) => c.textTone || 'auto', set: (c, v) => { if (v === 'light' || v === 'dark') c.textTone = v; else delete c.textTone; },
          options: [{ value: 'auto', label: 'Automatic (theme)' }, { value: 'light', label: 'Light text' }, { value: 'dark', label: 'Dark text' }],
          help: 'Light text on a dark picture or a deep gradient, dark text on a bright card.' },
        { key: 'accentColor', type: 'color', label: 'Accent colour', group, optional: true, custom: true, options: COLORS.filter((x) => x !== 'accent'),
          help: 'The widget’s icons, active states and highlights on this card. Default: the theme’s accent.' },
        { key: 'hover', type: 'select', label: 'Hover effect', group, half: true, get: hv, set: (c, v) => { if (['none', 'surface', 'glow', 'lift', 'surface-lift'].includes(v)) c.hover = v; else delete c.hover; },
          options: [{ value: 'default', label: 'Default' }, { value: 'none', label: 'None' }, { value: 'surface', label: 'Surface' }, { value: 'glow', label: 'Glow' }, { value: 'lift', label: 'Lift' }, { value: 'surface-lift', label: 'Surface + Lift' }],
          help: 'Decoration only, with a mouse or trackpad — never needed to use the widget.' },
        { key: 'hoverOpacity', type: 'range', label: 'Hover surface opacity', group, unit: '%', min: 0, max: 100, step: 1, get: (c) => (typeof c.hoverOpacity === 'number' ? c.hoverOpacity : 30), set: keep('hoverOpacity'), when: (c) => has(c, 'surface', 'surface-lift') },
        { key: 'hoverColor', type: 'color', label: 'Hover colour', group, optional: true, custom: true, options: INFO_COLORS, when: (c) => has(c, 'surface', 'surface-lift', 'glow'), help: 'Default: the theme’s.' },
        { key: 'hoverGlow', type: 'range', label: 'Glow strength', group, unit: '%', min: 0, max: 100, step: 1, get: (c) => (typeof c.hoverGlow === 'number' ? c.hoverGlow : 40), set: keep('hoverGlow'), when: (c) => has(c, 'glow') },
        { key: 'hoverLift', type: 'range', label: 'Lift amount', group, unit: 'px', min: 0, max: 12, step: 1, get: (c) => (typeof c.hoverLift === 'number' ? c.hoverLift : 4), set: keep('hoverLift'), when: (c) => has(c, 'lift', 'surface-lift'),
          help: 'Visual only: the widget’s place and size on the dashboard never change.' },
        { key: 'hoverMs', type: 'range', label: 'Transition duration', group, unit: 'ms', min: 0, max: 600, step: 10, get: (c) => (typeof c.hoverMs === 'number' ? c.hoverMs : 180), set: keep('hoverMs'), when: (c) => !has(c, 'default', 'none') },
      ];
    },
    /** Tap / Double tap / Long press → an action. entity: the widget offers toggle / turn on / turn off of its entity.
        defaults: the action of a gesture the config does not mention, e.g. { tap: 'toggle' }. */
    interactions: ({ entity = false, details = false, defaults = {}, group = 'interactions' } = {}) => {
      const opts = [{ value: 'none', label: 'Nothing' },
        ...(entity ? [{ value: 'toggle', label: 'Toggle entity' }, { value: 'turn_on', label: 'Turn on' }, { value: 'turn_off', label: 'Turn off' }] : []),
        ...(details ? [{ value: 'details', label: 'Open entity details' }] : []),
        { value: 'popup', label: 'Open popup' }, { value: 'navigate', label: 'Navigate to page' }, { value: 'url', label: 'Open a web address (new tab)' }];
      return [['tap', 'Tap'], ['doubleTap', 'Double tap'], ['longPress', 'Long press']].flatMap(([g, label]) => {
        const act = (c) => c.interactions?.[g]?.action ?? defaults[g] ?? 'none';
        return [
          { key: `interactions.${g}.action`, type: 'select', label, group, options: opts, get: act },
          { key: `interactions.${g}.popup`, type: 'select', label: `${label}: popup`, group, required: true, help: 'A popup defined under Popups',
            optionsFrom: () => ctxPopups().map((p) => ({ value: p.id, label: p.name })), when: (c) => act(c) === 'popup' },
          { key: `interactions.${g}.page`, type: 'select', label: `${label}: page`, group, required: true, help: 'An internal dashboard page',
            optionsFrom: () => ctxPages().map((p) => ({ value: p.id, label: p.name })), when: (c) => act(c) === 'navigate' },
          { key: `interactions.${g}.url`, type: 'text', label: `${label}: web address`, group, required: true, maxLength: 500, placeholder: 'https://…', when: (c) => act(c) === 'url',
            help: 'Opens in a new tab. Only http:// and https:// addresses.', accept: (v) => /^https?:\/\/[^\s"'<>`]{1,500}$/.test(String(v || '')) },
        ];
      });
    },
    /** one Home Assistant entity condition: show (or hide) the widget while entity <is | is not> value */
    /** INFORMATION (common capability): up to 3 extra REAL values from other Home Assistant entities, chosen here (no roles
        guessed, no calculations). Stored as info: [{ id, label?, entity, value: 'state' | <information key> }]. Shown only
        while the widget itself is linked (the values are live; a demo widget has no live entity to add to). */
    /** HOME ASSISTANT AREA (HA's own area registry): the area id is stored, HA's name is shown. context: true (default) makes it the form's
        AREA CONTEXT — every entity list of the form opens on that area first ("Show all entities" leaves it): a convenience, never a filter. */
    area: (group = 'identity', { key = 'area', label = 'Home Assistant Area', context = true, help = 'Entity lists open on this area first; any other entity stays available.' } = {}) => ({ key, type: 'area', label, group, optional: true, context,
      empty: 'No area', when: () => !!global.IniqHA?.enabled?.(), help }),
    info: (group = 'information', { max = 3, when = null, icons = null, colors = false, rowLabel = null, addLabel = null, own = false, sizes = false } = {}) => (own ? infoCollection(group, { max, when, icons, colors, addLabel, sizes }) : { key: 'info', type: 'infoslots', label: 'Information', group, optional: true, max,
      ...(rowLabel ? { rowLabel } : {}), ...(addLabel ? { addLabel } : {}),
      when: when || ((c) => linkedTo(c)),
      // OPT-IN presentation per line (a custom package's common.info): an icon from the package's own set, a colour from INFO_COLORS
      ...(icons ? { icons: () => icons } : {}), ...(colors ? { colors: INFO_COLORS } : {}),
      help: 'Extra real values from other Home Assistant entities — e.g. a phone battery, a plug’s power, a door contact. The label is your own text; the value comes from Home Assistant.' }),
    /** the optional ⋮ button (common capability, OFF by default): opens Entity Details of the linked entity */
    more: (group = 'interactions') => ({ key: 'moreButton', type: 'boolean', label: '⋮ Details button', group, when: (c) => linkedTo(c),
      help: 'A small ⋮ button on the card that opens Entity Details: live Home Assistant information, history and activity. It never runs a card action.' }),
    visibility: (group = 'visibility') => {
      const on = (c) => !!c.visibility?.entity;
      return [
        { key: 'visibility.entity', type: 'entity', label: 'Entity', group, optional: true, domains: null,
          empty: 'No condition — always shown', help: 'Optional. Without an entity the widget is always shown.', when: () => !!global.IniqHA?.enabled?.() },
        { key: 'visibility.op', type: 'select', label: 'Condition', group, options: [{ value: 'eq', label: 'is' }, { value: 'ne', label: 'is not' }], get: (c) => c.visibility?.op ?? 'eq', when: on },
        { key: 'visibility.value', type: 'text', label: 'Value', group, required: true, maxLength: 60, placeholder: 'e.g. on', help: 'The entity state, e.g. on, off, home', when: on },
        { key: 'visibility.mode', type: 'select', label: 'Result', group, options: [{ value: 'show', label: 'Show when the condition matches' }, { value: 'hide', label: 'Hide when the condition matches' }],
          get: (c) => c.visibility?.mode ?? 'show', help: 'Unavailable, unknown or missing entity, or Home Assistant unreachable: the widget is shown', when: on },
      ];
    },
  };
  /** tidy the common capability keys of a config (absent keys: nothing happens) */
  /** INFORMATION as a CONFIG COLLECTION (a package's own "Information" section, common.info): compact rows, one line edited at a time
      (entity · what to show · label · icon · icon colour). The stored lines are exactly the Information capability's (config.info). */
  function infoCollection(group, { max, when, icons, colors, addLabel, sizes }) {
    const S = () => global.IniqHA?.slots;
    const sources = (c) => {
      const o = S() ? S().sources(c.entity && global.IniqHA.get ? global.IniqHA.get(c.entity) : null) : [{ value: 'state', label: 'State' }];
      return c.value && !o.some((x) => x.value === c.value) ? [...o, { value: c.value, label: `${c.value.replace(/_/g, ' ')} (not reported now)` }] : o;
    };
    const f = { key: 'info', type: 'collection', label: 'Information', group, optional: true, max, srLabel: true, itemLabel: 'information', addLabel: addLabel || '+ Add information',
      when: when || ((c) => linkedTo(c)),
      get: (c) => (Array.isArray(c.info) ? c.info : []), set: (c, l) => { if (l.length) c.info = l; else delete c.info; },
      entityOf: (x) => (x && typeof x.entity === 'string' && x.entity) || null,
      create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`i${k}`)) k++; return { id: `i${k}`, entity: '', value: 'state' }; },
      // the item editor's sections (the INFORMATION EDITOR ORGANISATION shared with the Popup's hero information): Content · Presentation · Icon
      ...(sizes ? { groups: INFO_GROUPS.filter((g) => g[0] !== 'position') } : {}),
      // the fields: the SHARED Information item definitions (infoItemFields) with this collection's own defaults; a package's own icon set
      // (not MDI) keeps its own icon list
      fields: [
        ...infoItemFields(['entity', 'value', ...(sizes ? ['showLabel'] : []), 'label'], { sources, over: {
          showLabel: { half: null, set: (c, v) => { if (v) delete c.showLabel; else { c.showLabel = false; delete c.labelSize; } } },
          label: { half: true, placeholder: 'e.g. Temperature', when: sizes ? (c) => c.showLabel !== false : null } } }),
        ...(sizes ? infoItemFields(['valueSize', 'labelSize', 'iconSize', 'iconBg'], { over: {
          valueSize: { autoValue: 16, help: 'Automatic: the size the card chooses for its own size.' }, labelSize: { autoValue: 13 }, iconSize: { autoValue: 26 },
          iconBg: { half: null, set: (c, v) => { if (v === 'subtle' || v === 'accent') c.iconBg = v; else delete c.iconBg; } } } }) : []),
        ...(icons === 'mdi' ? infoItemFields(['icon', 'animation', 'animateWhen'], { over: { icon: { help: null }, animation: { when: sizes ? (c) => !!c.icon : null } } })
          : icons ? [{ key: 'icon', type: 'icon', label: 'Icon', optional: true, options: () => ['', ...Object.keys(icons)], icons: () => icons, group: 'content' }] : []),
        ...(colors ? infoItemFields(['color'], { over: { color: { when: sizes ? (c) => !!c.icon : null } } }) : []),
      ],
      // the row: the line's own icon and colour, its label (else HA's name), the entity, and the value now (the shared formatter: HA's words + unit)
      summary: (x, i, ha) => {
        const e = x.entity ? ha.get(x.entity) : null, it = x.entity && S() ? S().item(x, e, ha.known(x.entity)) : null;
        return { icon: icons === 'mdi' ? (typeof x.icon === 'string' && /^mdi:/.test(x.icon) ? x.icon : null) : icons && x.icon ? icons[x.icon] : null, color: colors && INFO_COLORS.includes(x.color) ? x.color : null,
          title: (typeof x.label === 'string' && x.label.trim()) || ha.name(x.entity) || x.entity || `Information ${i + 1}`, sub: x.entity || '',
          value: it ? (it.state === 'ready' ? it.text : it.state === 'missing' ? 'Not found' : '') : '' };
      },
      ...(icons ? { icons: () => icons } : {}), ...(colors ? { colors: INFO_COLORS } : {}),
      check: (v, label) => infoErrors({ ...f, max, sizes }, v, label),
    };
    return f;
  }
  /** the INFORMATION item's CONFIGURATION (InformationConfig, components/info) — ONE definition per property, shared by every Information
      editor (Room's lines, the Popup hero, Climate): a context picks the properties it EXPOSES (keys, in its order) and its own defaults
      (over: { key: { …field overrides } }). sources(item) → the values the entity reports. Each definition is built only when asked for. */
  function infoItemFields(keys, { sources, over = {}, custom = false } = {}) {
    const icon = (c) => !!c.icon;
    const D = {
      entity: () => ({ key: 'entity', type: 'entity', label: 'Entity', group: 'content', required: true, domains: null, clear: false, empty: 'Choose an entity' }),
      value: () => ({ key: 'value', type: 'select', label: 'Show', group: 'content', half: true, get: (c) => c.value || 'state', optionsFrom: sources }),
      showLabel: () => ({ key: 'showLabel', type: 'boolean', label: 'Show label', group: 'content', half: true, get: (c) => c.showLabel !== false, set: (c, v) => { if (v) delete c.showLabel; else c.showLabel = false; } }),
      label: () => ({ key: 'label', type: 'text', label: 'Label', group: 'content', optional: true, maxLength: 24, placeholder: 'Home Assistant’s name', when: (c) => c.showLabel !== false }),
      icon: () => ({ key: 'icon', type: 'mdi', label: 'Icon', group: 'content', optional: true, help: 'None: no icon (and no space for one).' }),
      style: () => ({ key: 'style', type: 'select', label: 'Style', group: 'presentation', half: true, get: (c) => c.style || 'card', options: HERO_STYLES }),
      align: () => ({ key: 'align', type: 'select', label: 'Text alignment', group: 'presentation', half: true, options: [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'Right' }] }),
      valueSize: () => ({ key: 'valueSize', type: 'range', label: 'Value size', group: 'presentation', unit: 'px', min: 10, max: 120, step: 1, auto: 'Automatic' }),
      labelSize: () => ({ key: 'labelSize', type: 'range', label: 'Label size', group: 'presentation', unit: 'px', min: 8, max: 48, step: 1, auto: 'Automatic', when: (c) => c.showLabel !== false }),
      labelPos: () => ({ key: 'labelPos', type: 'select', label: 'Label place', group: 'presentation', when: (c) => c.showLabel !== false, get: (c) => c.labelPos || 'below', options: [{ value: 'below', label: 'Below the value' }, { value: 'above', label: 'Above the value' }] }),
      iconSize: () => ({ key: 'iconSize', type: 'range', label: 'Icon size', group: 'icon', unit: 'px', min: 12, max: 120, step: 1, auto: 'Automatic', when: icon }),
      iconPos: () => ({ key: 'iconPos', type: 'select', label: 'Icon placement', group: 'icon', half: true, when: icon, get: (c) => c.iconPos || 'start', options: [{ value: 'start', label: 'Beside the value' }, { value: 'top', label: 'Above the value' }] }),
      iconBg: () => ({ key: 'iconBg', type: 'select', label: 'Icon background', group: 'icon', half: true, when: icon, get: (c) => c.iconBg || 'none', options: ICON_BGS }),
      color: () => ({ key: 'color', type: 'color', label: 'Icon colour', group: 'icon', optional: true, when: icon, options: INFO_COLORS, ...(custom ? { custom: true } : {}) }),
      valueColor: () => ({ key: 'valueColor', type: 'select', label: 'Value colour', group: 'icon', when: (c) => !!c.icon && !!c.color, get: (c) => c.valueColor || 'default', options: [{ value: 'default', label: 'Default' }, { value: 'icon', label: 'Same as the icon' }] }),
      animation: () => ({ key: 'animation', type: 'select', label: 'Icon animation', group: 'icon', half: true, when: icon, options: ICON_ANIMS, get: (c) => c.animation || 'none',
        set: (c, v) => { if (v && v !== 'none') c.animation = v; else { delete c.animation; delete c.animateWhen; } } }),
      animateWhen: () => ({ key: 'animateWhen', type: 'select', label: 'Animate when', group: 'icon', half: true, options: ANIMATE_WHEN_OPTS, get: (c) => c.animateWhen || 'active', when: (c) => !!c.icon && !!c.animation && c.animation !== 'none' }),
    };
    // an override of null REMOVES that property (a definition's own null — e.g. domains: null, any entity — stays)
    return keys.map((k) => { const o = over[k] || {}, f = { ...D[k](), ...o }; Object.keys(o).forEach((x) => { if (o[x] === null) delete f[x]; }); return f; });
  }
  /** the INFORMATION EDITOR ORGANISATION (Room Information, Popup hero information): what is shown · how its text appears · how its
      optional icon appears (a section that has nothing to show — no icon — disappears) · where it is placed */
  /** the numeric sizes an Information line may carry (px): [min, max] */
  const INFO_SIZE_RANGE = { iconSize: [12, 120], valueSize: [10, 120], labelSize: [8, 48] };
  const INFO_GROUPS = [['content', 'Content', ''], ['presentation', 'Presentation', ''], ['icon', 'Icon', ''], ['position', 'Position', '']];
  /** icon animations an Information line may use (= IniqIcons.ANIMATIONS, drawn by components/icons/icons.css) and when they run */
  const ICON_ANIMS = [['none', 'None'], ['rotate', 'Rotate'], ['pulse', 'Pulse'], ['breathe', 'Breathe'], ['shake', 'Shake'], ['bounce', 'Bounce'], ['swing', 'Swing'], ['flash', 'Flash']].map(([value, label]) => ({ value, label }));
  /** a fallback icon's own surface (IniqIcons.background, components/icons/icons.css): absent = Subtle (icons saved before the choice) */
  const ICON_BGS = [{ value: 'none', label: 'None' }, { value: 'subtle', label: 'Subtle' }, { value: 'accent', label: 'Accent' }];
  const ANIMATE_WHEN_OPTS = [{ value: 'active', label: 'Entity active' }, { value: 'always', label: 'Always' }];
  /** the colours an Information line's icon may use: design-token NAMES only (the widget draws var(--<name>) — never a CSS value) */
  const INFO_COLORS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];
  /** the built-in BACKGROUND IMAGES of the shared Appearance (original IniqDash artwork, assets/img/scenes/ — tools/artwork) */
  /** Event spotlight: the bundled pictures (photos — see THIRD-PARTY-NOTICES.md) and what a picture may be */
  const SPOT_IMAGES = [['spot-bin', 'Waste bin'], ['spot-cake', 'Birthday cake'], ['spot-recycling', 'Recycling']].map(([id, label]) => ({ value: `assets/img/photos/${id}.jpg`, label }));
  const SPOT_IMAGE_RE = /^(?!.*\.\.)(assets\/[A-Za-z0-9._\/-]+\.(jpe?g|png|webp|svg)|api\/asset\.php\?id=[0-9a-f]{32})$/;
  const ROOM_PHOTOS = [['living', 'Living room'], ['kitchen', 'Kitchen'], ['dining', 'Dining room'], ['bedroom', 'Bedroom'], ['bathroom', 'Bathroom'], ['office', 'Office'], ['garden', 'Garden']]
    .map(([id, label]) => ({ value: `assets/img/photos/room-${id}.jpg`, label }));
  const DEVICE_IMAGES = [];   // device pictures to offer (none bundled yet — an uploaded picture works)
  const CARD_IMAGES = [['living', 'Living room'], ['kitchen', 'Kitchen'], ['bedroom', 'Bedroom'], ['bathroom', 'Bathroom'], ['office', 'Office'], ['garden', 'Garden'],
    ['house', 'House at dusk'], ['lights', 'Evening lights'], ['fireplace', 'Fireplace']].map(([id, label]) => ({ value: `assets/img/scenes/${id}.jpg`, label }));

  /* ---- STUDIO WIDGET model (components placed inside the widget — never dashboard placement): sanitised here, the only place it is read.
     A component instance is { id, type (a COMPOSABLE registered component), x, y, w, h (logical px inside the canvas), config, data }; its
     config / data are plain JSON values (each component's own renderer validates what it uses; image locations are checked by the model). */
  const STUDIO_CANVAS = { w: 360, h: 240, min: [120, 80], max: [1200, 1200] };
  const STUDIO_MAX = 40, STUDIO_ID = /^[a-z][a-z0-9-]{0,40}-[0-9]{1,4}$/;
  const plainJson = (v, depth = 0) => {
    if (depth > 6) return undefined;
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string') return v.length <= 400 ? v.replace(/[<>]/g, '') : undefined;
    if (Array.isArray(v)) return v.slice(0, 24).map((x) => plainJson(x, depth + 1)).filter((x) => x !== undefined);
    if (typeof v === 'object') { const o = {}; Object.keys(v).slice(0, 60).forEach((k) => { if (/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) { const x = plainJson(v[k], depth + 1); if (x !== undefined) o[k] = x; } }); return o; }
    return undefined;
  };
  function studioClean(c) {
    // a dashboard INSTANCE of a Widget Studio definition: the reference (the definition is the source of truth for its components) and THIS
    // copy's ENTITY assignments — { <slot id>: entity } for the definition's entity slots. An instance saved before entity slots existed
    // (no `entities` at all) keeps the entities it showed then: its definition's former entities, now that definition's slot previews.
    if (typeof c.definition === 'string' && /^w[0-9a-f]{16}$/.test(c.definition)) {
      const L = global.IniqStudioLibrary, legacy = !c.entities || typeof c.entities !== 'object';
      const src = legacy ? Object.fromEntries(((L && L.model(c.definition) || {}).slots || []).filter((x) => x.preview).map((x) => [x.id, x.preview])) : c.entities;
      const entities = {};
      Object.entries(src || {}).slice(0, 24).forEach(([k, v]) => { if (/^s[0-9a-f]{8}$/.test(k) && typeof v === 'string' && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(v) && v.length <= 120) entities[k] = v; });
      // COPY SETTINGS: this copy's own values for the definition's exposed component keys (checked again when drawn: MaisonStudioWidget)
      const settings = {};
      if (c.settings && typeof c.settings === 'object' && !Array.isArray(c.settings)) Object.entries(c.settings).slice(0, 24).forEach(([k, v]) => {
        if (!/^k[0-9a-f]{8}$/.test(k)) return;
        if (typeof v === 'string' && v.length <= 400 && !/[<>]/.test(v)) settings[k] = v;
        else if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') settings[k] = v;
      });
      // the shared STYLE (widget background, corners, hover — common capabilities) stays with the copy, as on any widget
      return { definition: c.definition, entities, ...(Object.keys(settings).length ? { settings } : {}), ...styleOf(c) };
    }
    delete c.definition;
    const int = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
    const cv = c.canvas && typeof c.canvas === 'object' ? c.canvas : {};
    const W = int(cv.w, STUDIO_CANVAS.min[0], STUDIO_CANVAS.max[0], STUDIO_CANVAS.w), H = int(cv.h, STUDIO_CANVAS.min[1], STUDIO_CANVAS.max[1], STUDIO_CANVAS.h);
    c.canvas = { w: W, h: H };
    const IC = global.IniqComponents, used = new Set();
    c.components = (Array.isArray(c.components) ? c.components : []).slice(0, STUDIO_MAX).filter((x) => x && typeof x === 'object' && IC && IC.get(x.type) && IC.get(x.type).compose).map((x) => {
      const def = IC.get(x.type).compose;
      let id = typeof x.id === 'string' && STUDIO_ID.test(x.id) && !used.has(x.id) ? x.id : null;
      if (!id) { let k = 1; while (used.has(`${x.type}-${k}`)) k++; id = `${x.type}-${k}`; }
      used.add(id);
      const w = int(x.w, def.min.w, W, def.box.w), h = int(x.h, def.min.h, H, def.box.h);
      const binding = global.IniqBinding && x.binding ? global.IniqBinding.clean(x.binding, def) : undefined;   // declarative only (entities, reads, an action name)
      return { id, type: x.type, x: int(x.x, 0, W - w, 0), y: int(x.y, 0, H - h, 0), w, h, config: plainJson(x.config && typeof x.config === 'object' ? x.config : {}) || {}, data: plainJson(x.data && typeof x.data === 'object' ? x.data : {}) || {},
        ...(binding && (binding.source === 'ha' || binding.inputs || binding.action) ? { binding } : {}),
        ...(x.locked === true ? { locked: true } : {}), ...(x.hidden === true ? { hidden: true } : {}),      // Widget Studio's Layers: lock, visibility
        ...(typeof x.group === 'string' && /^g[0-9]{1,4}$/.test(x.group) ? { group: x.group } : {}) };      // a Studio group (moves / aligns together)
    });
    if (typeof c.name !== 'string' || !c.name.trim()) c.name = 'Studio widget';
    return c;
  }

  /* ---- CONTROLS (docs/WIDGET-REFERENCE.md, "Control widgets"): the configuration of the shared control primitives (components/controls —
     IniqControls.button / .segmented). Field lists for a collection's item editor (keys relative to the item), their sections and their
     normalisers. Generic: a widget passes its own ranges, its own themed styles and what an option may do; what an option DOES (and when
     it is selected) stays the widget's. */
  const HEXC = /^#[0-9a-fA-F]{6}$/;
  const ctrlColour = (v) => (typeof v === 'string' && (HEXC.test(v) || INFO_COLORS.includes(v)) ? (HEXC.test(v) ? v.toLowerCase() : v) : undefined);
  const opts = (list) => list.map(([value, label]) => ({ value, label }));
  /** a show / hide switch stored only when OFF (config.show = { key: false }) */
  const setShow = (c, k, v) => { const o = { ...(c.show || {}) }; if (v) delete o[k]; else o[k] = false; if (Object.keys(o).length) c.show = o; else delete c.show; };
  const CONTROL = {
    /** a control BUTTON: Button (style · shape · size · colour · state appearance) and Icon (icon · size · colour) — ONE look for every
        variant (the shared renderer draws it). styles: the widget's own extra style values ([value, label], the first the default);
        noShape: styles without a shape choice (a switch is always a track). k: a prefix for the field KEYS only (several controls in one
        item editor), the item's own properties are unprefixed. when(item): the controls this applies to. groups: [button, icon] sections. */
    button({ size = [28, 120], icon = [12, 72], styles = [], noShape = ['switch'], defaultIcon = 'the standard icon', k = '', when = null, groups = ['look', 'icon'],
      fields = ['style', 'shape', 'size', 'color', 'stateLook', 'icon', 'iconSize', 'iconColor'], exclude = [], shapes = [['circle', 'Circle'], ['rounded', 'Rounded'], ['pill', 'Pill']],
      over = {}, showLabelDefault = true } = {}) {
      // CAPABILITY-DRIVEN: the owner says which properties it EXPOSES (fields, in its order — e.g. a Room scene adds showLabel and has no
      // state look), its own style list (styles first; exclude drops shared ones), its shapes (the first: the default) and its own field
      // details (over: { prop: { …overrides } }, null removes one). The same ActionButtonConfig for every owner.
      const on = (c) => !when || when(c), styleOf = (c) => c.style || (styles[0] ? styles[0][0] : 'filled');
      const f = (prop, x) => ({ key: `${k}${prop}`, get: (c) => c[prop], set: (c, v) => { if (v === undefined || v === '' || v === null) delete c[prop]; else c[prop] = v; }, ...x, when: x.when ? (c) => on(c) && x.when(c) : on });
      const D = {
        style: () => ({ type: 'select', label: 'Style', group: groups[0], half: true, options: opts([...styles, ['filled', 'Filled'], ['soft', 'Soft'], ['outline', 'Outline'], ['bare', 'Bare'], ['switch', 'Switch']].filter(([v], i, a) => a.findIndex(([w]) => w === v) === i && !exclude.includes(v))), get: styleOf }),
        shape: () => ({ type: 'select', label: 'Shape', group: groups[0], half: true, options: opts(shapes), get: (c) => c.shape || shapes[0][0], when: (c) => !noShape.includes(styleOf(c)) }),
        size: () => ({ type: 'range', label: 'Button size', group: groups[0], unit: 'px', min: size[0], max: size[1], step: 1, auto: 'Automatic',
          help: 'Honoured where the card has room for it; a small card caps it (the look stays). A switch: its height.' }),
        color: () => ({ type: 'color', label: 'Button colour', group: groups[0], optional: true, custom: true, options: INFO_COLORS, help: 'Default: automatic (the control’s own colour).' }),
        stateLook: () => ({ type: 'select', label: 'State appearance', group: groups[0], get: (c) => c.stateLook || 'auto',
          options: opts([['auto', 'Automatic — on in colour, off restrained'], ['fixed', 'Fixed — the same colours; on ringed, off dimmed']]) }),
        // Show label: an owner whose label shows by default (a Room scene) stores only "off"; the shared button's label is opt-in (stores "on")
        showLabel: () => (showLabelDefault ? { type: 'boolean', label: 'Show label', group: groups[0], get: (c) => c.showLabel !== false, set: (c, v) => { if (v) delete c.showLabel; else c.showLabel = false; } }
          : { type: 'boolean', label: 'Show label', group: groups[0], get: (c) => c.showLabel === true, set: (c, v) => { if (v) c.showLabel = true; else delete c.showLabel; } }),
        label: () => ({ type: 'text', label: 'Label', group: groups[0], optional: true, maxLength: 24, help: 'The button’s name (screen readers, tooltips) — and its visible label when shown.' }),
        labelSize: () => ({ type: 'range', label: 'Label size', group: groups[0], unit: 'px', min: 8, max: 72, step: 1, auto: 'Automatic', when: (c) => c.showLabel === true }),
        labelGap: () => ({ type: 'range', label: 'Icon–label gap', group: groups[0], unit: 'px', min: 0, max: 40, step: 1, auto: 'Automatic', when: (c) => c.showLabel === true }),
        icon: () => ({ type: 'mdi', label: 'Icon', group: groups[1], optional: true, get: (c) => c.icon || '', help: `None: ${defaultIcon}` }),
        iconSize: () => ({ type: 'range', label: 'Icon size', group: groups[1], unit: 'px', min: icon[0], max: icon[1], step: 1, auto: 'Automatic',
          help: 'The icon itself — independent of the button size (the button is its surface; it never shrinks the icon).' }),
        iconColor: () => ({ type: 'color', label: 'Icon colour', group: groups[1], optional: true, custom: true, options: INFO_COLORS }),
      };
      return fields.map((prop) => { const o = over[prop] || {}, x = { ...D[prop](), ...o }; Object.keys(o).forEach((y) => { if (o[y] === null) delete x[y]; }); return f(prop, x); });
    },
    /** PLACEMENT of a control (structured, never coordinates): Automatic (the variant decides) or one of nine regions — the shared 3 × 3
        selector. prop: the item's property ('place', "<row>-<column>"); initial: the region chosen first; k: a key prefix. */
    placement({ prop = 'place', k = '', label = 'Position', initial = 'bottom-right', auto = 'Automatic — where the variant puts it', when = null, group = 'place' } = {}) {
      const on = (c) => !when || when(c), chosen = (c) => typeof c[prop] === 'string' && c[prop] !== '';
      return [
        { key: `${k}${prop}Mode`, type: 'select', label: 'Placement', group, when: on, options: opts([['auto', auto], ['chosen', 'Chosen position']]),
          get: (c) => (chosen(c) ? 'chosen' : 'auto'), set: (c, v) => { if (v === 'chosen') { if (!chosen(c)) c[prop] = initial; } else delete c[prop]; } },
        { key: `${k}${prop}`, type: 'place9', label, group, when: (c) => on(c) && chosen(c), get: (c) => c[prop], set: (c, v) => { c[prop] = v; },
          help: 'Controls in the same place form a group, in the list’s order.' },
      ];
    },
    /** the PLACEMENT OFFSET (PlacementConfig ox / oy — the runtime is IniqControls.nudge): a small nudge from the structured place, logical px,
        kept inside the card. keys: the two field keys; props: the item's two properties; range: ± px; 0 is not stored. */
    offset({ keys = ['ox', 'oy'], props = ['ox', 'oy'], range = 120, group = 'place', when = null, help = '0: exactly at its place. Kept inside the card.' } = {}) {
      return [['Horizontal offset', 0], ['Vertical offset', 1]].map(([label, i]) => ({ key: keys[i], type: 'range', label, group, half: true, unit: 'px', min: -range, max: range, step: 1,
        auto: 'None', autoValue: 0, ...(when ? { when } : {}), get: (c) => c[props[i]],
        set: (c, v) => { const n = sizeOf(v, -range, range); if (n === undefined || n === 0) delete c[props[i]]; else c[props[i]] = n; }, help: i === 0 ? help : '' }));
    },
    PLACES: ['top', 'center', 'bottom'].flatMap((r) => ['left', 'center', 'right'].map((col) => `${r}-${col}`)),
    BUTTON_GROUPS: [['look', 'Button', 'Its surface'], ['icon', 'Icon', 'The glyph']],
    normButton(o, { size = [28, 120], icon = [12, 72], styles: own = [] } = {}) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
      const out = {}, styles = [...own.map(([v]) => v), 'filled', 'soft', 'outline', 'bare', 'switch'];
      if (styles.includes(o.style) && o.style !== styles[0]) out.style = o.style;
      if (CONTROL.PLACES.includes(o.place)) out.place = o.place;
      if (['rounded', 'pill'].includes(o.shape)) out.shape = o.shape;
      if (typeof o.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(o.icon)) out.icon = o.icon;
      const sz = sizeOf(o.size, size[0], size[1]), is = sizeOf(o.iconSize, icon[0], icon[1]);
      if (sz !== undefined) out.size = sz; if (is !== undefined) out.iconSize = is;
      if (ctrlColour(o.color)) out.color = ctrlColour(o.color); if (ctrlColour(o.iconColor)) out.iconColor = ctrlColour(o.iconColor);
      if (o.stateLook === 'fixed') out.stateLook = 'fixed';
      return out;
    },
    /** a SEGMENTED control's appearance (one section, 'look') */
    segmented({ height = [28, 100], icon = [12, 56], gap = [0, 24], padX = [0, 40] } = {}, when = null) {
      const w = when || undefined;
      return [
        { key: 'height', type: 'range', label: 'Control height', group: 'look', unit: 'px', min: height[0], max: height[1], step: 1, auto: 'Automatic', autoValue: 44, when: w },
        { key: 'iconSize', type: 'range', label: 'Icon size', group: 'look', unit: 'px', min: icon[0], max: icon[1], step: 1, auto: 'Automatic', when: w, help: 'The icons themselves — independent of the control height.' },
        { key: 'gap', type: 'range', label: 'Option gap', group: 'look', unit: 'px', min: gap[0], max: gap[1], step: 1, auto: 'Automatic', autoValue: 4, when: w },
        { key: 'padX', type: 'range', label: 'Horizontal padding', group: 'look', unit: 'px', min: padX[0], max: padX[1], step: 1, auto: 'Automatic', when: w, help: 'Inside each option, beside its icon and label.' },
        { key: 'style', type: 'select', label: 'Selected option', group: 'look', half: true, options: opts([['soft', 'Soft'], ['filled', 'Filled'], ['outline', 'Outline'], ['minimal', 'Minimal']]), get: (c) => c.style || 'soft', when: w },
        { key: 'shape', type: 'select', label: 'Shape', group: 'look', half: true, options: opts([['pill', 'Pill'], ['rounded', 'Rounded']]), get: (c) => c.shape || 'pill', when: w },
        { key: 'inactive', type: 'select', label: 'Other options', group: 'look', half: true, options: opts([['surface', 'Surface'], ['soft', 'Soft'], ['minimal', 'Minimal']]), get: (c) => c.inactive || 'surface', when: w },
        { key: 'color', type: 'color', label: 'Active colour', group: 'look', optional: true, custom: true, options: INFO_COLORS, when: w, help: 'The selected option. Default: each option’s own colour, else automatic.' },
      ];
    },
    normSegmented(o, { height = [28, 100], icon = [12, 56], gap = [0, 24], padX = [0, 40] } = {}) {
      const out = {};
      [['height', height], ['iconSize', icon], ['gap', gap], ['padX', padX]].forEach(([k, [lo, hi]]) => { const n = sizeOf(o[k], lo, hi); if (n !== undefined) out[k] = n; });
      if (['filled', 'outline', 'minimal'].includes(o.style)) out.style = o.style;
      if (o.shape === 'rounded') out.shape = 'rounded';
      if (['soft', 'minimal'].includes(o.inactive)) out.inactive = o.inactive;
      if (ctrlColour(o.color)) out.color = ctrlColour(o.color);
      return out;
    },
    /** one OPTION of a segmented control, section k: label · show label · icon · what it does (sets(item, context) → [{ value, label }]; the
        widget's own extra fields — e.g. its value — follow `set`) · its own active colour */
    option(k, { sets, extra = [], when = null } = {}) {
      const on = (c) => !when || when(c), o = (c) => (c[k] && typeof c[k] === 'object' ? c[k] : {});
      return [
        { key: `${k}.icon`, type: 'mdi', label: 'Icon', group: k, optional: true, when: on, get: (c) => o(c).icon || '' },
        { key: `${k}.label`, type: 'text', label: 'Label', group: k, optional: true, maxLength: 20, half: true, when: on, get: (c) => o(c).label },
        { key: `${k}.showLabel`, type: 'boolean', label: 'Show label', group: k, half: true, when: on, get: (c) => o(c).showLabel !== false },
        { key: `${k}.set`, type: 'select', label: 'Does', group: k, when: on, optionsFrom: (c, ctx) => sets(c, ctx), get: (c) => o(c).set },
        ...extra.map((f) => ({ ...f, group: k, when: (c, ctx) => on(c) && (!f.when || f.when(o(c), ctx)), get: f.get ? (c) => f.get(o(c)) : (c) => o(c)[f.key.split('.').pop()] })),
        { key: `${k}.color`, type: 'color', label: 'Active colour', group: k, optional: true, custom: true, options: INFO_COLORS, when: on, help: 'When this option is selected. Default: automatic.' },
      ];
    },
    normOption(o) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
      const out = {};
      if (typeof o.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(o.icon)) out.icon = o.icon;
      if (typeof o.label === 'string' && o.label.trim()) out.label = o.label.trim().slice(0, 20).replace(/[<>]/g, '');
      if (o.showLabel === false) out.showLabel = false;
      if (ctrlColour(o.color)) out.color = ctrlColour(o.color);
      return out;
    },
  };
  function commonNormalize(c) {
    if (!c || typeof c !== 'object') return c;
    const K = global.IniqWidgetKit;
    if (c.visibility !== undefined && !(c.visibility && typeof c.visibility === 'object' && typeof c.visibility.entity === 'string' && c.visibility.entity)) delete c.visibility;
    if (K && c.interactions && typeof c.interactions === 'object') K.cleanInteractions(c.interactions);
    if (c.info !== undefined && !(Array.isArray(c.info) && c.info.length)) delete c.info;
    if (c.moreButton !== undefined && c.moreButton !== true) delete c.moreButton;
    if (K && K.cleanSurface) K.cleanSurface(c);                                   // the WIDGET SURFACE (background · hover)
    // a widget's own theme override: invalid tokens fall back to the dashboard / default values
    if (c.theme !== undefined) { const th = global.MaisonTheme && global.MaisonTheme.clean(c.theme); if (th && th.tokens) c.theme = th; else delete c.theme; }
    return c;
  }
  /** what a Button / Action press does to a Home Assistant entity (fixed per domain, see server/ha/HaService::TRIGGER) */
  const TRIGGER_TEXT = (d) => `On press: ${({ scene: 'activate this scene', script: 'run this script', button: 'press this button', input_button: 'press this button',
    cover: 'open / close it (toggle)' })[d] || 'switch it on / off (toggle)'}`;
  /* ---- linked to a real Home Assistant entity: the configuration follows what THAT entity can do (IniqHA.capabilities — the
     same capability truth the live widget is built from). Field flags:
       demo: true | (config) → bool   a demo value / switch: hidden while an entity is linked (Home Assistant decides it)
       live: (config) → bool           while linked, shown only when this returns true (instead of `when`)
     Hidden values are never deleted: unlinking, or picking an entity that supports them, shows them again unchanged. */
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const linkedTo = (c) => !!(c && c.entity) && !!global.IniqHA?.enabled?.();
  /** Appliance PROFILE (what kind of appliance): 'generic' unless the config says 'washer' — no key = Generic, exactly as before */
  const applianceProfile = (c) => (c && c.profile === 'washer' ? 'washer' : 'generic');
  const isWasher = (c) => applianceProfile(c) === 'washer';
  const WASHER_ROLES = ['program', 'remaining', 'progress', 'power', 'door', 'start', 'pause', 'programSelect'];
  const WASHER_CONCEPTS = ['off', 'idle', 'running', 'washing', 'rinsing', 'spinning', 'paused', 'finished', 'error'];
  const WASHER_LABEL = { off: 'Off', idle: 'Idle / ready', running: 'Running', washing: 'Washing', rinsing: 'Rinsing', spinning: 'Spinning', paused: 'Paused', finished: 'Finished', error: 'Error' };
  /** one typed Washing Machine mapping: an entity field of the allowed domains only, offered once the primary is linked */
  const washerMap = (role, label, group, domains, help, extra = {}) => ({ key: `mappings.${role}`, type: 'entity', label, group, optional: true, domains, help,
    empty: 'Not mapped', when: (c) => isWasher(c) && !!global.IniqHA?.enabled?.() && !!c.entity,
    related: (c) => (c.entity && global.IniqHA?.related ? global.IniqHA.related(c.entity) : Promise.resolve([])), ...extra });
  /** typed mappings (config.mappings = { role: entity id }): only known roles, each a well-formed entity id of an allowed domain — anything else
      (a hand-edited or imported file) is dropped, so a widget never subscribes to an entity it was not meant to read */
  /** the Camera PTZ preset's mappable roles → the entity domains each accepts */
  const PTZ_MAP = { tiltUp: ['button', 'input_button'], tiltDown: ['button', 'input_button'], panLeft: ['button', 'input_button'], panRight: ['button', 'input_button'], zoomIn: ['button', 'input_button'],
    zoomOut: ['button', 'input_button'], preset: ['select', 'input_select'], spotlight: ['light', 'switch'], privacy: ['switch'] };
  function cleanMappings(c, allowed) {
    if (c.mappings !== undefined && !(c.mappings && typeof c.mappings === 'object' && !Array.isArray(c.mappings))) delete c.mappings;
    if (c.mappings) Object.keys(c.mappings).forEach((k) => {
      const id = c.mappings[k];
      if (!allowed[k] || typeof id !== 'string' || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(id) || id.length > 120 || !allowed[k].includes(id.split('.')[0])) delete c.mappings[k];
    });
    if (c.mappings && !Object.keys(c.mappings).length) delete c.mappings;
    return c;
  }
  /* ---- ENERGY FLOW: explicit typed mappings (config.mappings = { role: entity id }) and sign conventions (config.signs) */
  const ENERGY_ROLES = ['solar', 'grid', 'gridImport', 'gridExport', 'battery', 'batteryLevel', 'ev', 'evLevel', 'solarToday', 'gridImportToday', 'gridExportToday', 'homeToday', 'evToday'];
  const ENERGY_SIGNS = { solar: ['positive', 'negative'], grid: ['import', 'export'], battery: ['charge', 'discharge'], ev: ['positive', 'negative'] };
  const ENERGY_SCENARIOS = {
    sunny: { demoHome: 1800, demoSolar: 3600, demoGrid: -1000, demoBattery: 800, demoLevel: 72, demoEv: 0, demoEvLevel: 63 },
    evening: { demoHome: 2300, demoSolar: 0, demoGrid: 1400, demoBattery: -900, demoLevel: 41, demoEv: 0, demoEvLevel: 63 },
    ev: { demoHome: 650, demoSolar: 0, demoGrid: 7900, demoBattery: 0, demoLevel: 20, demoEv: 7400, demoEvLevel: 38 },
  };
  /** a picker remark when an entity does not look like the expected kind of value (never hidden: integrations vary) */
  const energyNote = (kind) => (e) => {
    const u = e.unit || '', dc = e.dc || '';
    if (kind === 'power') return dc === 'power' || /^(m|k|M)?W$/.test(u) ? '' : 'Not a power value (W / kW)';
    if (kind === 'level') return u === '%' ? '' : 'Not a percentage';
    return dc === 'energy' || /^(k|M)?Wh$/.test(u) ? '' : 'Not an energy total (kWh)';
  };
  const energyMap = (role, label, group, kind, when = null) => ({ key: `mappings.${role}`, type: 'entity', label, group, optional: true, domains: ['sensor'], empty: 'Not mapped',
    note: energyNote(kind), when: (c) => linkedTo(c) && !energyDyn(c) && (!when || when(c)),
    related: (c) => (c.entity && global.IniqHA?.related ? global.IniqHA.related(c.entity) : Promise.resolve([])),
    help: kind === 'power' ? 'Its current power, shown with Home Assistant’s unit; the sign only sets the direction.' : kind === 'level' ? 'A percentage, shown as a ring.' : 'A total Home Assistant already keeps (e.g. kWh today) — shown as reported, never calculated.' });
  const energySign = (key, label, group, options, dflt, when = null) => ({ key: `signs.${key}`, type: 'select', label, group, options: options.map(([value, l]) => ({ value, label: l })),
    get: (c) => c.signs?.[key] || dflt, when: (c) => linkedTo(c) && !energyDyn(c) && !!c.mappings?.[key] && (!when || when(c)),
    set: (c, v) => { if (v === dflt) { if (c.signs) { delete c.signs[key]; if (!Object.keys(c.signs).length) delete c.signs; } } else setPath(c, `signs.${key}`, v); },
    help: 'Integrations differ: choose what a positive value means for this entity. Only the direction depends on it.' });
  /* ENERGY FLOW — DYNAMIC NODES (presets Circles / Node cards). The list is the user's: a node exists only when added (no placeholder).
     Opening it on a configuration from before nodes shows the nodes its mapped roles / demo values already give (MaisonEnergy.nodesOf);
     the first save stores that list as its own. Direction: the user's "a positive value flows towards / away" — never guessed. */
  const energyDyn = (c) => c.variant === 'circles' || c.variant === 'tesla' || c.variant === 'nodes' || c.variant === 'house' || c.variant === 'system';
  const NODE_TYPE_OPTS = [['solar', 'Solar / PV'], ['grid', 'Grid'], ['battery', 'Battery'], ['ev', 'EV charger'], ['inverter', 'Inverter'], ['circuit', 'Electrical circuit'], ['appliance', 'Appliance'],
    ['heatpump', 'Heat pump'], ['gas', 'Gas'], ['water', 'Water'], ['co2', 'CO₂'], ['custom', 'Measurement / custom']];
  const nodeType = (x) => global.MaisonEnergy?.NODE_TYPES?.[x && x.type] || global.MaisonEnergy?.NODE_TYPES?.custom || { label: 'Node', positive: 'toward', words: {} };
  const ENERGY_NODES_FIELD = { key: 'nodes', type: 'collection', label: 'Nodes', group: 'efnodes', max: 12, itemLabel: 'node', addLabel: '+ Add a node', when: (c) => energyDyn(c),
    get: (c) => (global.MaisonEnergy?.nodesOf ? global.MaisonEnergy.nodesOf(c) : []),
    set: (c, l) => { c.nodes = l; },
    create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`n${k}`)) k++; return { id: `n${k}`, type: 'circuit' }; },
    context: (c) => ({ linked: linkedTo(c), nodes: (global.MaisonEnergy?.nodesOf ? global.MaisonEnergy.nodesOf(c) : []).map((n) => ({ id: n.id, label: n.label || nodeType(n).label })) }),
    entityOf: (x) => (x && typeof x.entity === 'string' && x.entity) || null,
    previewFocus: (x) => (x && x.id ? `[data-node="${String(x.id).replace(/["\\]/g, '')}"]` : null),
    groups: [['what', '', ''], ['data', 'Home Assistant', 'What it shows — Home Assistant’s own values'], ['flow', 'Connection', 'Where it connects and which way a positive value flows'],
      ['look', 'Appearance', ''], ['demo', 'Demo', 'Shown while the widget is not linked']],
    fields: [
      { key: 'type', type: 'select', label: 'Type', group: 'what', options: opts(NODE_TYPE_OPTS), get: (x) => x.type || 'custom' },
      { key: 'label', type: 'text', label: 'Label', group: 'what', optional: true, maxLength: 24, placeholder: 'The type’s name' },
      { key: 'entity', type: 'entity', label: 'Value', group: 'data', optional: true, domains: ['sensor', 'input_number', 'number'], empty: 'Not mapped', when: (x, ctx) => !ctx || ctx.linked,
        help: 'Its current value, shown with Home Assistant’s unit (W, kW, m³/h, ppm…). Never converted or calculated.' },
      { key: 'exportEntity', type: 'entity', label: 'Export value (separate entity)', group: 'data', optional: true, domains: ['sensor'], empty: 'Not mapped', when: (x, ctx) => x.type === 'grid' && (!ctx || ctx.linked),
        help: 'When your integration reports export as its own entity: the Value is then import. Both are shown — never netted.' },
      { key: 'level', type: 'entity', label: 'Level (%)', group: 'data', optional: true, domains: ['sensor'], empty: 'Not mapped', when: (x, ctx) => ['battery', 'ev'].includes(x.type) && (!ctx || ctx.linked), help: 'Shown as a ring round the node.' },
      { key: 'secondary', type: 'entity', label: 'Secondary information', group: 'data', optional: true, domains: ['sensor', 'input_number', 'number'], empty: 'None', when: (x, ctx) => !ctx || ctx.linked,
        help: 'A second value under its name — e.g. a total Home Assistant keeps for today.' },
      { key: 'unit', type: 'text', label: 'Unit (when Home Assistant gives none)', group: 'data', optional: true, maxLength: 8 },
      // (shown in the item editor, which knows the other nodes; the stored link is sanitised by the widget — an unknown one joins Home)
      { key: 'link', type: 'select', label: 'Connects to', group: 'flow', when: (x, ctx) => !!ctx, get: (x) => x.link || 'home',
        optionsFrom: (x, ctx) => [{ value: 'home', label: 'Home' }, ...((ctx && ctx.nodes) || []).filter((n) => n.id !== x.id).map((n) => ({ value: n.id, label: n.label }))],
        set: (x, v) => { if (!v || v === 'home') delete x.link; else x.link = v; }, help: 'E.g. Solar → Inverter → Home. Two steps at most.' },
      { key: 'positive', type: 'select', label: 'A positive value flows', group: 'flow', get: (x) => x.positive || nodeType(x).positive,
        options: opts([['toward', 'Towards what it connects to (Home)'], ['away', 'Away from it']]),
        set: (x, v) => { if (v === nodeType(x).positive) delete x.positive; else x.positive = v; },
        help: 'Integrations differ (a battery may report charging as positive or negative): choose what YOUR entity means. 0 → no flow.' },
      { key: 'icon', type: 'mdi', label: 'Icon', group: 'look', optional: true, help: 'None: the type’s icon' },
      { key: 'color', type: 'color', label: 'Colour', group: 'look', optional: true, custom: true, options: INFO_COLORS, help: 'Default: the type’s colour' },
      { key: 'size', type: 'select', label: 'Size', group: 'look', half: true, get: (x) => x.size || 'm', options: opts([['s', 'Small'], ['m', 'Normal'], ['l', 'Large']]), set: (x, v) => { if (v === 'm') delete x.size; else x.size = v; } },
      { key: 'hidden', type: 'boolean', label: 'Hidden', group: 'look', half: true, get: (x) => x.hidden === true, set: (x, v) => { if (v) x.hidden = true; else delete x.hidden; }, help: 'Kept in the list, not drawn.' },
      { key: 'demo', type: 'number', label: 'Demo value', group: 'demo', optional: true, step: 'any', when: (x, ctx) => ctx && !ctx.linked },
      { key: 'demoLevel', type: 'number', label: 'Demo level %', group: 'demo', optional: true, min: 0, max: 100, when: (x, ctx) => ctx && !ctx.linked && ['battery', 'ev'].includes(x.type) },
    ],
    summary: (x, i, ha) => ({ icon: (typeof x.icon === 'string' && x.icon) || nodeType(x).icon || null, title: x.label || nodeType(x).label, sub: `${(NODE_TYPE_OPTS.find((o) => o[0] === x.type) || ['', 'Measurement'])[1]}${x.entity ? ` · ${(ha && ha.name ? ha.name(x.entity) : '') || x.entity}` : ''}${x.link ? ` · → ${x.link}` : ''}${x.hidden ? ' · hidden' : ''}` }),
  };
  /* CHART SERIES: added series (config.traces) — each an entity, a label, a colour, what to show from the statistics, and an optional
     presentation sign (e.g. export drawn below zero). Nothing is computed from them: each is drawn as Home Assistant reports it. */
  const CHART_STATS = [['auto', 'Automatic: consumption for a total, average for a measurement'], ['change', 'Consumption per period (a total: kWh, m³…)'], ['mean', 'Average'], ['min', 'Minimum'], ['max', 'Maximum']];
  const CHART_TRACES = { key: 'traces', type: 'collection', label: 'More series', group: 'series', max: 6, itemLabel: 'series', addLabel: '+ Add a series',
    get: (c) => (Array.isArray(c.traces) ? c.traces : []), set: (c, l) => { if (l.length) c.traces = l; else delete c.traces; },
    create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`s${k}`)) k++; return { id: `s${k}`, entity: '' }; },
    context: (c) => ({ stats: c.source === 'statistics' }),
    entityOf: (x) => (x && typeof x.entity === 'string' && x.entity) || null,
    fields: [
      { key: 'entity', type: 'entity', label: 'Entity', domains: ['sensor', 'input_number', 'number', 'counter'], empty: 'Choose an entity', note: (e) => NOT_NUMERIC(e) },
      { key: 'label', type: 'text', label: 'Label', optional: true, maxLength: 24, placeholder: 'Home Assistant’s name' },
      { key: 'color', type: 'color', label: 'Colour', optional: true, custom: true, options: [...INFO_COLORS, 'solar'] },
      { key: 'stat', type: 'select', label: 'Value', when: (x, ctx) => !!(ctx && ctx.stats), get: (x) => x.stat || 'auto', options: opts(CHART_STATS), set: (x, v) => { if (v === 'auto') delete x.stat; else x.stat = v; } },
      { key: 'invert', type: 'boolean', label: 'Draw below zero', get: (x) => x.invert === true, set: (x, v) => { if (v) x.invert = true; else delete x.invert; },
        help: 'Presentation only — e.g. grid export under the line, import above. The value Home Assistant reports is not changed.' },
    ],
    summary: (x, i, ha) => ({ icon: null, color: INFO_COLORS.includes(x.color) ? x.color : null, title: x.label || (ha && ha.name ? ha.name(x.entity) : '') || x.entity || `Series ${i + 2}`,
      sub: `${x.entity || 'No entity'}${x.stat ? ` · ${x.stat}` : ''}${x.invert ? ' · below zero' : ''}` }),
    itemErrors: (x) => (x && typeof x.entity === 'string' && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: 'entity', message: 'Choose an entity' }]) };
  /** Number & Select: what it sets — a linked entity's domain decides (select / input_select → select); a demo its own kind */
  const numselKind = (c) => {
    const d = c && typeof c.entity === 'string' && c.entity.includes('.') ? c.entity.split('.')[0] : null;
    if (d) return ['select', 'input_select'].includes(d) ? 'select' : 'number';
    return c && c.kind === 'select' ? 'select' : 'number';
  };
  /** while linked: shown only once the entity's state is known AND test(effectiveConfig, entity) holds */
  const liveIf = (type, test) => (c) => { const fx = global.IniqHA?.capabilities?.(type, c); return !!(fx && fx.state === 'ready' && test(fx.config, fx.entity)); };
  /** entity picker note (Gauge / Chart): its state now is not a number (unknown / unavailable is not judged) */
  const NOT_NUMERIC = (e) => (num(e.state) === null && !e.unit && !['unknown', 'unavailable', ''].includes(String(e.state).toLowerCase()) ? 'Not numeric right now' : '');
  /** list of distinct, trimmed, non-empty strings */
  const distinct = (list) => [...new Set((list || []).map((s) => String(s).trim()).filter(Boolean))];

  const G = {   // static editor glyphs for the type picker (24px stroke icons)
    light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    climate: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/>',
    sensor: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    switch: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><circle cx="16.5" cy="12" r="3"/>',
    sunmoon: '<circle cx="9" cy="10" r="3.5"/><path d="M9 3.5v1.5M9 15v1.5M2.5 10H4M14 10h1.5M4.4 5.4l1 1M12.6 13.6l1 1M4.4 14.6l1-1M12.6 6.4l1-1"/><path d="M20.5 15.5A5.5 5.5 0 0 1 14 9.5a5.5 5.5 0 1 0 6.5 6z"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 3h5M12 3v3"/>',
    datetime: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
    entitylist: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><circle cx="4" cy="6.5" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="17.5" r="1"/>',
    roomtile: '<rect x="3" y="3.5" width="18" height="17" rx="3.5"/><rect x="6" y="14" width="4" height="4" rx="1.2"/><path d="M12 15h6M12 17.5h4M7 7h3M15 7h2"/>',
    readings: '<path d="M5 6v5M5 15v4"/><path d="M9 8h6M9 17h7"/><path d="M13 3.5v17"/>',
    batteries: '<rect x="7" y="4" width="10" height="17" rx="2"/><path d="M10 2h4"/><path d="M10 15h4M10 11h4"/>',
    climategroup: '<path d="M8 14.5V5a2 2 0 1 1 4 0v9.5a3.5 3.5 0 1 1-4 0z"/><path d="M15 8h5M15 12h5M15 16h5"/>',
    homebattery: '<rect x="6" y="4.5" width="12" height="16" rx="2.4"/><path d="M10 2.6h4M9 15h6M9 11.5h6"/><path d="M12.4 6.8 10.6 10h2.8l-1.8 3.2"/>',
    solar: '<circle cx="16.5" cy="7" r="2.6"/><path d="M16.5 2v1.2M21.5 7h-1.2M20 3.5l-.8.8"/><path d="M3 20l2.2-8h10l2.2 8z"/><path d="M4.1 16h14.6M8.5 12l-.9 8M12.5 12l.4 8"/>',
    todo: '<path d="M5 6.5l1.5 1.5L9 5.5M5 12.5l1.5 1.5L9 11.5M5 18.5l1.5 1.5L9 17.5"/><path d="M12 7h7M12 13h7M12 19h7"/>',
    updates: '<path d="M12 4v10M8 10l4 4 4-4"/><path d="M5 17v2h14v-2"/>',
    humidifier: '<path d="M12 3c3.5 4.4 6 7.7 6 11a6 6 0 0 1-12 0c0-3.3 2.5-6.6 6-11z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
    countdown: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M9.5 3h5"/>',
    vehicle: '<path d="M4 16v-3.5l1.8-4.3A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.8 1.2L20 12.5V16"/><path d="M3 16h18v2.5H3z"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/><path d="m12.5 9-1.5 2.5h2L11.5 14"/>',
    devicetile: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><rect x="12" y="6.5" width="6" height="3.4" rx="1.7"/><circle cx="12" cy="15" r="2.6"/>',
    activitylog: '<path d="M5 4v16"/><circle cx="5" cy="7" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="5" cy="17" r="1.6"/><path d="M9.5 7h10M9.5 12h8M9.5 17h9"/>',
    spotlight: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="14.5" r="2.5"/><path d="M13 13.5h5M13 16.5h3.5M8 8h8"/>',
    presence: '<circle cx="8" cy="9" r="3"/><circle cx="16.5" cy="9" r="3"/><path d="M2.5 19c.6-3 2.7-4.6 5.5-4.6s4.9 1.6 5.5 4.6M12.8 15.2c1-.6 2.2-.8 3.7-.8 2.8 0 4.9 1.6 5.5 4.6"/>',
    activity: '<rect x="3" y="4" width="18" height="5" rx="2.5"/><rect x="3" y="10.5" width="18" height="5" rx="2.5"/><rect x="3" y="17" width="12" height="4" rx="2"/>',
    robot: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6"/><path d="M5.8 6.2A8.5 8.5 0 0 1 12 3.5"/>',
    energy: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="3.5" r="1.5"/><circle cx="3.5" cy="12" r="1.5"/><circle cx="20.5" cy="12" r="1.5"/><circle cx="12" cy="20.5" r="1.5"/><path d="M12 5v4M5 12h4M15 12h4M12 15v4"/>',
    numsel: '<path d="M4 8h16M4 16h16"/><circle cx="15" cy="8" r="2.4"/><circle cx="8" cy="16" r="2.4"/>',
    fan: '<circle cx="12" cy="12" r="2"/><path d="M12 10c0-5 1.5-7 4-7s3 3 0 6M14 12c5 0 7 1.5 7 4s-3 3-6 0M12 14c0 5-1.5 7-4 7s-3-3 0-6M10 12c-5 0-7-1.5-7-4s3-3 6 0"/>',
    cover: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 8h16M4 12h16M4 16h16"/>',
    media: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 5 3-5 3z"/>',
    action: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    appliance: '<rect x="4" y="2.5" width="16" height="19" rx="2"/><circle cx="12" cy="13.5" r="4.5"/><path d="M8 6h2"/>',
    weather: '<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/>',
    person: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    container: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 8h18"/>',
    tabs: '<rect x="3" y="8" width="18" height="13" rx="3"/><path d="M3 11V6.5A1.5 1.5 0 0 1 4.5 5h4l1.5 3M10 8l1.5-3h4l1.5 3"/>',
    inbox: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    radial: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3v5.8M12 15.2V21M3 12h5.8M15.2 12H21"/>',
    button: '<rect x="3" y="7" width="18" height="10" rx="5"/><path d="M8 12h8"/>',
    camera: '<path d="M3.5 7.5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z"/><path d="m16.5 11 5-3v8l-5-3"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    alarm: '<path d="M12 3.2 19 6v5.5c0 4.4-2.9 8-7 9.3-4.1-1.3-7-4.9-7-9.3V6z"/>',
    gauge: '<path d="M4.5 17.5a8.5 8.5 0 1 1 15 0"/><path d="m12 13 4-4"/><circle cx="12" cy="13" r="1.2"/>',
    chart: '<path d="M3.5 20.5h17"/><path d="m4.5 16 4.5-5 4 3 6.5-8"/>',
    text: '<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>',
    image: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5.5-5.5 4 4 2.5-2.5 4.5 4.5"/>',
    studio: '<rect x="3" y="4" width="18" height="16" rx="3"/><rect x="6" y="7" width="5" height="5" rx="1"/><circle cx="16" cy="9.5" r="2"/><path d="M6 16h12"/>',
    floating: '<rect x="3" y="3" width="18" height="18" rx="3"/><rect x="6.5" y="7" width="6" height="4.5" rx="1"/><rect x="11" y="13" width="6.5" height="5" rx="1"/>',
  };

  /* ---- Radial Action Menu: one action object per segment (8 are always kept; `count` shows 4/6/8) ---- */
  const RADIAL_TYPES = [
    { value: 'demo', label: 'Demo action' },
    { value: 'navigate', label: 'Navigate to dashboard page' },
    { value: 'toggle', label: 'Local toggle (not Home Assistant)' },
    { value: 'popup', label: 'Open popup' },
  ];
  const RADIAL_DEFAULT = [
    { label: 'Lights', icon: 'bulb', type: 'toggle' }, { label: 'Scene', icon: 'star', type: 'demo' },
    { label: 'Night', icon: 'moon', type: 'demo', confirm: true }, { label: 'Lock', icon: 'lock', type: 'demo', confirm: true },
    { label: 'Music', icon: 'music', type: 'toggle' }, { label: 'Climate', icon: 'thermo', type: 'demo' },
    { label: 'Garage', icon: 'garage', type: 'demo', confirm: true }, { label: 'Power', icon: 'power', type: 'toggle' },
  ];
  /** a complete action object: missing keys come from a NEUTRAL base (never from the demo defaults,
      so a label the designer removed does not come back) */
  const radialAction = (a = {}) => ({ icon: 'star', type: 'demo', enabled: true, confirm: false, keepOpen: false, ...a });
  /** pages the application currently has (set by the editor / model validation): [{ id, name }] */
  const ctxPages = () => (MaisonRegistryRef.context && Array.isArray(MaisonRegistryRef.context.pages) ? MaisonRegistryRef.context.pages : []);
  /** popups / notification templates the application currently has: [{ id, name }] */
  const ctxPopups = () => (MaisonRegistryRef.context && Array.isArray(MaisonRegistryRef.context.popups) ? MaisonRegistryRef.context.popups : []);
  const ctxTemplates = () => (MaisonRegistryRef.context && Array.isArray(MaisonRegistryRef.context.templates) ? MaisonRegistryRef.context.templates : []);
  const MaisonRegistryRef = { context: { pages: [] } };
  function radialFields() {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const k = (f) => `actions.${i}.${f}`, sec = `Action ${i + 1}`, shown = (c) => i < Number(c.count || 8);
      out.push(
        { key: k('label'), type: 'text', label: 'Label', group: 'actions', section: sec, optional: true, maxLength: 24, placeholder: 'Optional — icon only', when: shown },
        { key: k('icon'), type: 'icon', label: 'Icon', group: 'actions', section: sec, options: () => keysOf(C_ICONS()), icons: C_ICONS, when: shown },
        { key: k('type'), type: 'select', label: 'Action', group: 'actions', section: sec, options: RADIAL_TYPES, when: shown },
        { key: k('page'), type: 'select', label: 'Page', group: 'actions', section: sec, required: true, help: 'An internal dashboard page',
          optionsFrom: () => ctxPages().map((p) => ({ value: p.id, label: p.name })), when: (c) => shown(c) && c.actions?.[i]?.type === 'navigate' },
        { key: k('popup'), type: 'select', label: 'Popup', group: 'actions', section: sec, required: true, help: 'A popup defined under Popups',
          optionsFrom: () => ctxPopups().map((p) => ({ value: p.id, label: p.name })), when: (c) => shown(c) && c.actions?.[i]?.type === 'popup' },
        { key: k('on'), type: 'boolean', label: 'Starts on', group: 'actions', section: sec, when: (c) => shown(c) && c.actions?.[i]?.type === 'toggle' },
        { key: k('enabled'), type: 'boolean', label: 'Enabled', group: 'actions', section: sec, when: shown },
        { key: k('confirm'), type: 'boolean', label: 'Requires confirmation', group: 'actions', section: sec, help: 'First press arms, second press runs', when: shown },
        { key: k('keepOpen'), type: 'boolean', label: 'Keep the menu open', group: 'actions', section: sec, when: shown },
      );
    }
    return out;
  }

  /* LIGHT — its CONTROLS (docs/WIDGET-REFERENCE.md, "Light"): Power (a control button) and an ordered list of the controls it presents —
     brightness · colour temperature · colour · effects (each only when the light has it) and optional TOGGLES (a segmented control whose
     options set real values of the light). */
  const LIGHT_KINDS = ['brightness', 'colorTemp', 'color', 'effect'];
  const LIGHT_POWER = { size: [28, 120], icon: [12, 72], noShape: ['theme', 'switch'], styles: [['theme', 'Automatic — the variant’s own (Standard: a switch; others: a button)'], ['round', 'Theme button'], ['switch', 'Theme switch']] };
  const LIGHT_LINES = ['top', 'center', 'bottom'];
  const LIGHT_HUES = [[0, 'Red'], [30, 'Orange'], [55, 'Yellow'], [120, 'Green'], [180, 'Cyan'], [220, 'Blue'], [275, 'Purple'], [320, 'Pink']];
  /** what the light can do: linked — what Home Assistant reports (nothing while that is not known yet); demo — its demo switches */
  const lightCaps = (c) => {
    if (linkedTo(c)) { const fx = global.IniqHA?.capabilities?.('light', c); return fx && fx.state === 'ready' ? (fx.config.capabilities || {}) : {}; }
    const k = c.capabilities || {};
    return { brightness: !!(k.brightness ?? c.dimmable), colorTemp: !!k.colorTemp, color: !!k.color, effect: false };
  };
  const lightRange = (c) => { if (linkedTo(c)) { const fx = global.IniqHA?.capabilities?.('light', c); return fx?.config?.colorTempRange || null; } return c.colorTempRange || { min: 2200, max: 6500 }; };
  /** what a toggle option may set — only what the light can do (no context: everything; the runtime still gates) */
  const LIGHT_SETS = [['on', 'Turn the light on', null], ['off', 'Turn the light off', null], ['brightness', 'Set a brightness', 'brightness'], ['colorTemp', 'Set a colour temperature', 'colorTemp'], ['color', 'Set a colour', 'color']];
  const lightSets = (c, ctx) => LIGHT_SETS.filter(([, , cap]) => !cap || !ctx || ctx.caps[cap] || (c && c.set === cap)).map(([value, label]) => ({ value, label }));
  function lightOption(o) {
    const out = CONTROL.normOption(o), set = LIGHT_SETS.some(([v]) => v === o?.set) ? o.set : 'on';
    out.set = set;
    if (set === 'brightness') out.brightness = clampNum(Number(o.brightness) || 100, 1, 100);
    if (set === 'colorTemp') out.kelvin = clampNum(Number(o.kelvin) || 2700, 1500, 9000, 50);
    if (set === 'color') out.hue = LIGHT_HUES.some(([h]) => h === Number(o.hue)) ? Number(o.hue) : 30;
    return out;
  }
  /** a light's controls list, normalised (an older { brightness: false… } becomes the list); absent = every control it has, in this order */
  function lightControls(v) {
    let out;
    if (v && typeof v === 'object' && !Array.isArray(v)) out = LIGHT_KINDS.map((type) => (v[type] === false ? { type, show: false } : { type }));
    else if (!Array.isArray(v)) return null;
    else {
      const seen = new Set();
      out = [];
      v.forEach((x) => {
        if (!x || typeof x !== 'object') return;
        if (x.type === 'toggle') {
          if (out.filter((y) => y.type === 'toggle').length >= 2) return;
          const t = { type: 'toggle', ...(typeof x.name === 'string' && x.name.trim() ? { name: x.name.trim().slice(0, 24).replace(/[<>]/g, '') } : {}), a: lightOption(x.a), b: lightOption(x.b), ...CONTROL.normSegmented(x),
            ...(CONTROL.PLACES.includes(x.place) ? { place: x.place } : {}) };
          out.push(t); return;
        }
        if (!(x.type === 'power' || LIGHT_KINDS.includes(x.type)) || seen.has(x.type)) return;
        seen.add(x.type);
        const t = { type: x.type };                                  // (Power's look and place are config.power; here only its order)
        if (x.show === false && x.type !== 'power') t.show = false;
        if (x.type === 'brightness') {
          const tr = sizeOf(x.track, 6, 64), hd = sizeOf(x.handle, 8, 40);
          if (tr !== undefined) t.track = tr; if (hd !== undefined) t.handle = hd; if (ctrlColour(x.color)) t.color = ctrlColour(x.color);
          if (LIGHT_LINES.includes(x.place)) t.place = x.place;
        }
        out.push(t);
      });
    }
    if (!out.some((x) => x.type === 'power')) out.unshift({ type: 'power' });       // Power is always one of the controls (first unless moved)
    return out;
  }
  const lightDefault = (list) => Array.isArray(list) && list.length === LIGHT_KINDS.length + 1 && list.every((x, i) => x.type === ['power', ...LIGHT_KINDS][i] && Object.keys(x).length === 1);
  /** the rows the configurator shows (Power with its look and place): the stored order, then any control the light has that is not listed
      yet; only what it has */
  function lightRows(c) {
    const caps = lightCaps(c), list = lightControls(c.controls) || [{ type: 'power' }];
    const rows = list.filter((x) => x.type === 'toggle' || x.type === 'power' || caps[x.type]).map((x) => (x.type === 'power' ? { ...(c.power || {}), type: 'power' } : x));
    LIGHT_KINDS.forEach((k) => { if (caps[k] && !list.some((x) => x.type === k)) rows.push({ type: k }); });
    return rows;
  }
  const LIGHT_STYLE = { theme: 'Automatic', switch: 'Theme switch', round: 'Theme button', filled: 'Filled', soft: 'Soft', outline: 'Outline', bare: 'Bare' };
  const placeName = (v) => (v ? v.replace('center-center', 'centre').replace('center', 'centre').replace('-', ' ') : '');
  const LIGHT_ROW = { brightness: ['mdi:brightness-6', 'Brightness', 'Slider'], colorTemp: ['mdi:thermometer', 'Colour temperature', 'Warm to cool white'], color: ['mdi:palette', 'Colour', 'Colour buttons'], effect: ['mdi:auto-fix', 'Effects', 'The light’s effects'] };
  const LIGHT_DOES = { on: 'On', off: 'Off', brightness: 'Brightness', colorTemp: 'Colour temperature', color: 'Colour' };
  function lightToggleDefault(ctx) {
    const caps = (ctx && ctx.caps) || {};
    if (caps.colorTemp) return { type: 'toggle', name: 'White', a: { icon: 'mdi:weather-sunset', label: 'Warm', set: 'colorTemp', kelvin: 2700 }, b: { icon: 'mdi:snowflake', label: 'Cool', set: 'colorTemp', kelvin: 6000 } };
    if (caps.brightness) return { type: 'toggle', name: 'Level', a: { icon: 'mdi:brightness-4', label: 'Dim', set: 'brightness', brightness: 30 }, b: { icon: 'mdi:brightness-7', label: 'Bright', set: 'brightness', brightness: 100 } };
    return { type: 'toggle', name: 'Power', a: { icon: 'mdi:lightbulb-on', label: 'On', set: 'on' }, b: { icon: 'mdi:lightbulb-off', label: 'Off', set: 'off' } };
  }
  const hasImage = (c) => typeof c.image === 'string' && c.image !== '' && c.image !== 'none';

  /* CLIMATE — its CONTROLS (docs/WIDGET-REFERENCE.md, "Climate"): an ordered list of what the ENTITY can do — the thermostat dial, the HVAC
     mode, − / +, Power, fan / preset / swing, target humidity, the target range — each with its look and its place. */
  const CLIMATE_KINDS = ['dial', 'mode', 'minus', 'plus', 'power', 'fan', 'preset', 'swing', 'humidity', 'range'];
  const CLIMATE_MODES = ['heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'off'];
  const CLIMATE_MODE_LABEL = { heat: 'Heat', cool: 'Cool', heat_cool: 'Heat/Cool', auto: 'Auto', dry: 'Dry', fan_only: 'Fan', off: 'Off' };
  const CLIMATE_BTN = { size: [28, 120], icon: [12, 72], styles: [['theme', 'Theme']] };
  const CLIMATE_ROW = { dial: ['mdi:thermostat', 'Thermostat dial'], mode: ['mdi:sun-snowflake-variant', 'HVAC mode'], minus: ['mdi:minus', 'Decrease temperature'], plus: ['mdi:plus', 'Increase temperature'],
    power: ['mdi:power', 'Power'], fan: ['mdi:fan', 'Fan mode'], preset: ['mdi:leaf', 'Preset'], swing: ['mdi:arrow-oscillating', 'Swing'], humidity: ['mdi:water-percent', 'Target humidity'], range: ['mdi:arrow-expand-horizontal', 'Target range'] };
  /** the shared SLIDER's configuration (IniqComponents.editor('slider')): ONE set of field definitions for every owner — Light's brightness
      and a composed widget. o = { k: key prefix, when, group, label: true → its accessible name too (a composed slider has no owner to
      name it), words: the owner's help for the same settings } */
  const SLIDER_WORDS = { handle: 'Automatic: sized from the track.', color: 'Default: the accent colour.' };
  const LIGHT_SLIDER_WORDS = { handle: 'Automatic: a slim marker; a size: a round handle.', color: 'Default: the light’s own colour.' };
  function sliderFields({ k = '', when = null, group = 'slider', label = false, look = false, words = {} } = {}) {
    const W = { ...SLIDER_WORDS, ...words }, on = when || (() => true);
    return [
      ...(label ? [{ key: `${k}label`, type: 'text', label: 'Name', group, optional: true, maxLength: 24, when: on, get: (x) => x.label, set: (x, v) => { if (v === undefined || v === '' || v === null) delete x.label; else x.label = v; }, help: 'Its accessible name.' }] : []),
      ...[['track', { type: 'range', label: 'Track thickness', unit: 'px', min: 6, max: 64, step: 1, auto: 'Automatic' }],
        ['handle', { type: 'range', label: 'Handle size', unit: 'px', min: 8, max: 40, step: 1, auto: 'Automatic', help: W.handle }],
        ['color', { type: 'color', label: 'Accent colour', optional: true, custom: true, options: INFO_COLORS, help: W.color }]]
        .map(([prop, f]) => ({ key: `${k}${prop}`, group, ...f, when: on,
          get: (x) => x[prop], set: (x, v) => { if (v === undefined || v === '' || v === null) delete x[prop]; else x[prop] = v; } })),
      // a composed slider's own presentation (Widget Studio): the unfilled track, the handle, the corners — an owner with its own skin has none
      ...(look ? [['trackColor', { type: 'color', label: 'Track colour', optional: true, custom: true, options: INFO_COLORS, help: 'Default: a soft light track.' }],
        ['handleColor', { type: 'color', label: 'Handle colour', optional: true, custom: true, options: INFO_COLORS, help: 'Default: white.' }],
        ['radius', { type: 'range', label: 'Track corner radius', unit: 'px', min: 0, max: 32, step: 1, auto: 'Automatic' }],
        ['handleShape', { type: 'select', label: 'Handle shape', options: opts([['round', 'Round'], ['square', 'Square']]) }]]
        .map(([prop, f]) => ({ key: `${k}${prop}`, group, ...f, when: on,
          get: (x) => (prop === 'handleShape' ? x[prop] || 'round' : x[prop]), set: (x, v) => { if (v === undefined || v === '' || v === null || (prop === 'handleShape' && v === 'round')) delete x[prop]; else x[prop] = v; } })) : []),
    ];
  }
  /** the five designs of the shared DIAL (components/dial) */
  const DIAL_DESIGN = [['spectrum', 'Spectrum ring'], ['minimal', 'Minimal ring'], ['arc', 'State arc'], ['full', 'Full dial'], ['digital', 'Digital ring'], ['knob', 'Knob (raised, gradient ring)']];
  const CLIMATE_DESIGN = DIAL_DESIGN;
  /** the shared DIAL's configuration (IniqComponents.editor('dial')): ONE set of field definitions for every owner — Climate's thermostat
      and a composed widget — filtered by capability. o = { k: key prefix, when: (config) → its fields apply, groups: [main, details,
      colours], fields: the owner's optional ones ('size' — a dial that sizes itself in its owner's layout; 'primary' — which value is the
      big one), words: the owner's words for the same settings (a thermostat says 'Target', 'Room temperature', 'Heating colour'…) } */
  const DIAL_WORDS = { valueSize: 'Value size', primary: [['target', 'Setpoint'], ['current', 'Current value']], placeholder: 'Value', current: 'Show current value',
    action: 'Show the state text', marker: 'Setpoint marker', designHelp: 'A presentation of the same value — its box and its data stay.', sizeHelp: '',
    ringHelp: 'Default: the state colour (warm · cool · idle).', arcHelp: 'Off: a thin continuous ring in the state colour. On: the ring shows where the setpoint sits.',
    colours: [['warmColor', 'Warm colour'], ['coolColor', 'Cool colour'], ['idleColor', 'Idle colour']] };
  const CLIMATE_DIAL_WORDS = { valueSize: 'Target value size', primary: [['target', 'Target'], ['current', 'Room temperature']], placeholder: 'Target', current: 'Show room temperature',
    action: 'Show what it is doing', marker: 'Target marker', designHelp: 'A presentation of the same thermostat — its size, place and values stay.',
    sizeHelp: 'Automatic: the room the layout leaves it. A size: honoured up to the card itself (move the other controls with their position / offset); a Micro / Compact card caps it.',
    ringHelp: 'Default: the state colour (heating · cooling · idle).', arcHelp: 'Off: a thin continuous ring in the state colour. On: the ring shows where the target sits.',
    colours: [['heatColor', 'Heating colour'], ['coolColor', 'Cooling colour'], ['idleColor', 'Idle colour']] };
  function dialFields({ k = '', when = null, groups = ['dial', 'dialx', 'dialc'], fields = [], words = {} } = {}) {
    const W = { ...DIAL_WORDS, ...words }, [GM, GX, GC] = groups, isD = when || (() => true), des = (x) => x.design || 'spectrum';
    const f = (prop, x) => ({ key: `${k}${prop}`, get: (o) => o[prop], set: (o, v) => { if (v === undefined || v === '' || v === null) delete o[prop]; else o[prop] = v; }, ...x, when: x.when ? (o) => isD(o) && x.when(o) : isD });
    const b = (prop, label, group, w) => ({ key: `${k}${prop}`, type: 'boolean', label, group, half: true, get: (o) => o[prop] !== false, set: (o, v) => { if (v === false) o[prop] = false; else delete o[prop]; }, when: w ? (o) => isD(o) && w(o) : isD });
    return [
      f('design', { type: 'select', label: 'Dial design', group: GM, options: opts(DIAL_DESIGN), get: (o) => o.design || 'spectrum', help: W.designHelp }),
      ...(fields.includes('size') ? [f('size', { type: 'range', label: 'Dial size', group: GM, unit: 'px', min: 80, max: 600, step: 1, auto: 'Automatic', ...(W.sizeHelp ? { help: W.sizeHelp } : {}) })] : []),
      f('valueSize', { type: 'range', label: W.valueSize, group: GM, unit: 'px', min: 16, max: 160, step: 1, auto: 'Automatic' }),
      ...(fields.includes('primary') ? [f('primary', { type: 'select', label: 'Central value', group: GM, half: true, options: opts(W.primary), get: (o) => o.primary || 'target' })] : []),
      b('showLabel', 'Show label', GM),
      f('label', { type: 'text', label: 'Label', group: GM, optional: true, maxLength: 24, placeholder: W.placeholder, when: (o) => o.showLabel !== false }),
      f('labelSize', { type: 'range', label: 'Label size', group: GM, unit: 'px', min: 8, max: 40, step: 1, auto: 'Automatic', when: (o) => o.showLabel !== false }),
      b('showCurrent', W.current, GX),
      b('showAction', W.action, GX),
      b('ticks', 'Tick marks', GX, (o) => ['spectrum', 'full'].includes(des(o))),
      { key: `${k}dticks`, type: 'boolean', label: 'Tick marks (minimal)', group: GX, half: true, when: (o) => isD(o) && des(o) === 'digital', get: (o) => o.ticks === true, set: (o, v) => { if (v) o.ticks = true; else delete o.ticks; } },
      { key: `${k}activeArc`, type: 'boolean', label: 'Active arc', group: GX, half: true, when: (o) => isD(o) && des(o) === 'digital', get: (o) => o.activeArc === true, set: (o, v) => { if (v) o.activeArc = true; else delete o.activeArc; },
        help: W.arcHelp },
      f('ringColor', { type: 'color', label: 'Ring colour', group: GX, optional: true, custom: true, options: INFO_COLORS, when: (o) => des(o) === 'digital', help: W.ringHelp }),
      f('surface', { type: 'select', label: 'Face', group: GX, half: true, options: opts([['clean', 'Clean'], ['soft', 'Soft'], ['glass', 'Glass'], ['deep', 'Deep']]), get: (o) => o.surface || 'clean', when: (o) => des(o) === 'digital' }),
      f('depth', { type: 'select', label: 'Depth', group: GX, half: true, options: opts([['soft', 'Soft'], ['flat', 'Flat'], ['raised', 'Raised']]), get: (o) => o.depth || 'soft', when: (o) => des(o) === 'digital' }),
      b('minmax', 'Min / max', GX, (o) => !['minimal', 'digital'].includes(des(o))),
      f('ring', { type: 'select', label: 'Ring', group: GX, half: true, options: opts([['state', 'State colour'], ['gradient', 'Gradient (cool → warm)']]), get: (o) => o.ring || 'state', when: (o) => des(o) === 'spectrum' }),
      f('thickness', { type: 'range', label: 'Ring thickness', group: GX, unit: 'px', min: 1, max: 16, step: 1, auto: 'Automatic', when: (o) => ['minimal', 'digital'].includes(des(o)) }),
      b('marker', W.marker, GX, (o) => des(o) === 'minimal'),
      f('arc', { type: 'select', label: 'Arc', group: GX, half: true, options: opts([['solid', 'Solid'], ['glow', 'Glow']]), get: (o) => o.arc || 'solid', when: (o) => des(o) === 'arc' }),
      f('density', { type: 'select', label: 'Tick density', group: GX, half: true, options: opts([['detailed', 'Detailed'], ['simple', 'Simple']]), get: (o) => o.density || 'detailed', when: (o) => des(o) === 'full' }),
      f('face', { type: 'select', label: 'Face', group: GX, half: true, options: opts([['filled', 'Filled in the state colour'], ['dark', 'Dark']]), get: (o) => o.face || 'filled', when: (o) => des(o) === 'full' }),
      ...W.colours.map(([prop, label]) => f(prop, { type: 'color', label, group: GC, optional: true, custom: true, options: INFO_COLORS })),
    ];
  }
  /** the discrete controls that take a small OFFSET from their place (a line / stepper does not) */
  const CLIMATE_NUDGE = ['power', 'minus', 'plus', 'mode', 'fan', 'preset', 'swing'];
  const CLIMATE_DSLOTS = [['top', 'Top'], ['upper-left', 'Upper left'], ['upper-right', 'Upper right'], ['lower-left', 'Lower left'], ['lower-right', 'Lower right'], ['bottom', 'Bottom']];
  /** an offset (px, −120…120) — 0 is the exact place (not stored) */
  const nudgeOf = (v) => { const n = sizeOf(v, -120, 120); return n === undefined || n === 0 ? undefined : n; };
  /* the INFORMATION LAYOUT of a collection (Climate first): Individual (absent — each item at its own structured place) or Bar (the items,
     in their order, as one structured row: IniqInfo.bar — layout only, every item keeps its own look) */
  const hasInfo = (c) => Array.isArray(c.info) && c.info.length > 0;
  const BAR_OPTS = { barPosition: ['top'], barWidth: ['content', 'custom'], barAlign: ['left', 'center', 'right', 'between'], barBackground: ['soft', 'surface'] };
  const BAR_NUM = { barOx: [-40, 40], barOy: [-40, 40], barWidthPct: [20, 100], barDividerOpacity: [0, 100], barGap: [0, 48] };
  function climateBarClean(c) {
    if (c.infoLayout !== undefined && c.infoLayout !== 'bar') delete c.infoLayout;
    Object.entries(BAR_OPTS).forEach(([k, l]) => { if (c[k] !== undefined && !l.includes(c[k])) delete c[k]; });
    Object.entries(BAR_NUM).forEach(([k, [lo, hi]]) => { if (c[k] !== undefined) { const n = sizeOf(c[k], lo, hi); if (n === undefined || ((k === 'barOx' || k === 'barOy') && n === 0)) delete c[k]; else c[k] = n; } });
    if (c.barWidthPct !== undefined && c.barWidth !== 'custom') delete c.barWidthPct;
    if (c.barDividers !== undefined && c.barDividers !== false) delete c.barDividers;
    if (c.barTopDivider !== undefined && c.barTopDivider !== true) delete c.barTopDivider;
    if (c.barDividerOpacity !== undefined && c.barDividers === false && c.barTopDivider !== true) delete c.barDividerOpacity;
    return c;
  }
  const isBar = (c) => hasInfo(c) && c.infoLayout === 'bar';
  const barSel = (key, label, list, half = true) => ({ key, type: 'select', label, group: 'information', half, when: isBar, options: opts(list), get: (c) => c[key] || list[0][0],
    set: (c, v) => { if (v === list[0][0] || !v) delete c[key]; else c[key] = v; } });
  const barNum = (key, label, unit, min, max, x = {}) => ({ key, type: 'range', label, group: 'information', unit, min, max, step: 1, when: isBar, ...x });
  const CLIMATE_BAR_FIELDS = [
    { key: 'infoLayout', type: 'select', label: 'Information layout', group: 'information', when: hasInfo, get: (c) => (c.infoLayout === 'bar' ? 'bar' : 'individual'),
      options: opts([['individual', 'Individual — each item at its own position'], ['bar', 'Bar — the items, in order, in one row']]),
      set: (c, v) => { if (v === 'bar') c.infoLayout = 'bar'; else delete c.infoLayout; }, help: 'Bar: one structured row on the card’s first or last row. Each item keeps its own look; the dial never moves.' },
    barSel('barPosition', 'Bar position', [['bottom', 'Bottom'], ['top', 'Top']]),
    barSel('barWidth', 'Bar width', [['full', 'Full'], ['content', 'Content'], ['custom', 'Custom']]),
    barNum('barWidthPct', 'Bar width', '%', 20, 100, { auto: 'Full', autoValue: 100, when: (c) => isBar(c) && c.barWidth === 'custom' }),
    barSel('barAlign', 'Bar alignment', [['equal', 'Equal'], ['between', 'Space between'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]),
    barNum('barGap', 'Item gap', 'px', 0, 48, { auto: 'Automatic', autoValue: 12 }),
    { key: 'barDividers', type: 'boolean', label: 'Dividers', group: 'information', half: true, when: isBar, get: (c) => c.barDividers !== false, set: (c, v) => { if (v === false) c.barDividers = false; else delete c.barDividers; } },
    { key: 'barTopDivider', type: 'boolean', label: 'Top divider', group: 'information', half: true, when: isBar, get: (c) => c.barTopDivider === true, set: (c, v) => { if (v) c.barTopDivider = true; else delete c.barTopDivider; } },
    barNum('barDividerOpacity', 'Divider opacity', '%', 0, 100, { auto: 'Automatic', autoValue: 14, when: (c) => isBar(c) && (c.barDividers !== false || c.barTopDivider === true) }),
    barSel('barBackground', 'Bar background', [['none', 'None'], ['soft', 'Soft'], ['surface', 'Surface']], false),
    ...CONTROL.offset({ keys: ['barOx', 'barOy'], props: ['barOx', 'barOy'], range: 40, group: 'information', when: isBar, help: 'Moves the whole bar a little — kept inside the card.' }),
  ];
  const climateDesign = (c) => { const d = (Array.isArray(c.controls) ? c.controls : []).find((x) => x && x.type === 'dial'); return d && typeof d.design === 'string' ? d.design : 'spectrum'; };
  /** the climate as the widget will see it: linked — Home Assistant's (nothing while unknown); demo — its own demo values */
  const climateNow = (c) => {
    let x = c;
    if (linkedTo(c)) { const fx = global.IniqHA?.capabilities?.('climate', c); x = fx && fx.state === 'ready' ? fx.config : null; }
    if (!x) return null;
    return { capabilities: { targetTemperature: true, hvacMode: true, ...(x.capabilities || {}) }, hvacModes: (x.hvacModes || ['heat', 'off']).filter((m) => CLIMATE_MODES.includes(m)),
      fanModes: x.fanModes, presets: x.presets, swingModes: x.swingModes, humidityTarget: x.humidityTarget, targetRange: x.targetRange };
  };
  const climateCan = (c) => { const x = climateNow(c), M = global.MaisonClimate; return Object.fromEntries(CLIMATE_KINDS.map((k) => [k, !!(x && M && M.supported(k, x))])); };
  /** a climate's controls list, normalised (allow-listed values only; defaults not stored) */
  function climateControls(v) {
    if (!Array.isArray(v)) return null;
    const seen = new Set(), out = [];
    const S = (o, k, list) => { if (list.includes(o[k])) return o[k]; return undefined; };
    v.forEach((x) => {
      if (!x || typeof x !== 'object' || !CLIMATE_KINDS.includes(x.type) || seen.has(x.type)) return;
      seen.add(x.type);
      const t = { type: x.type };
      if (x.show === false && x.type !== 'dial') t.show = false;
      if (x.type === 'power' && x.show === undefined) t.show = true;               // (Power is hidden unless asked for: keep the choice explicit)
      if (CONTROL.PLACES.includes(x.place)) t.place = x.place;
      if (x.type === 'dial' || CLIMATE_NUDGE.includes(x.type)) { const ox = nudgeOf(x.ox), oy = nudgeOf(x.oy); if (ox !== undefined) t.ox = ox; if (oy !== undefined) t.oy = oy; }
      if (x.type === 'dial') {
        if (['minimal', 'arc', 'full', 'digital', 'knob'].includes(x.design)) t.design = x.design;
        if (x.design === 'digital') {
          if (x.ticks === true) t.ticks = true;                                     // (the Digital ring has none unless asked)
          if (x.activeArc === true) t.activeArc = true;
          if (ctrlColour(x.ringColor)) t.ringColor = ctrlColour(x.ringColor);
          if (['soft', 'glass', 'deep'].includes(x.surface)) t.surface = x.surface;
          if (['flat', 'raised'].includes(x.depth)) t.depth = x.depth;
        }
        [['size', 80, 600], ['valueSize', 16, 160], ['labelSize', 8, 40], ['thickness', 1, 16]].forEach(([k, lo, hi]) => { const n = sizeOf(x[k], lo, hi); if (n !== undefined) t[k] = n; });
        ['showLabel', 'ticks', 'minmax', 'showCurrent', 'showAction', 'marker'].forEach((k) => { if (x[k] === false) t[k] = false; });
        if (typeof x.label === 'string' && x.label.trim()) t.label = x.label.trim().slice(0, 24).replace(/[<>]/g, '');
        if (x.primary === 'current') t.primary = 'current';
        const r = S(x, 'ring', ['gradient']), a = S(x, 'arc', ['glow']), d = S(x, 'density', ['simple']), f = S(x, 'face', ['dark']);
        if (r) t.ring = r; if (a) t.arc = a; if (d) t.density = d; if (f) t.face = f;
        ['heatColor', 'coolColor', 'idleColor'].forEach((k) => { if (ctrlColour(x[k])) t[k] = ctrlColour(x[k]); });
      }
      if (['power', 'minus', 'plus'].includes(x.type)) Object.assign(t, CONTROL.normButton(x, CLIMATE_BTN));
      if (['mode', 'fan', 'preset', 'swing'].includes(x.type)) {
        if (['segmented', 'select'].includes(x.present)) t.present = x.present;
        Object.assign(t, CONTROL.normSegmented(x));
      }
      if (x.type === 'mode') {
        if (x.labels === true) t.labels = true;
        if (x.modes && typeof x.modes === 'object') {
          const m = {};
          CLIMATE_MODES.forEach((k) => { const o = x.modes[k]; if (!o || typeof o !== 'object') return; const n = CONTROL.normOption(o); delete n.showLabel; if (Object.keys(n).length) m[k] = n; });
          if (Object.keys(m).length) t.modes = m;
        }
      }
      out.push(t);
    });
    CLIMATE_KINDS.forEach((k) => { if (!out.some((x) => x.type === k)) out.push(k === 'power' ? { type: k, show: false } : { type: k }); });
    return out.map((x) => (x.type === 'power' && x.show === true ? (() => { const { show, ...r } = x; return r; })() : x));
  }
  const climateDefault = (l) => Array.isArray(l) && l.length === CLIMATE_KINDS.length && l.every((x, i) => x.type === CLIMATE_KINDS[i] && Object.keys(x).length === (x.type === 'power' ? 2 : 1) && (x.type !== 'power' || x.show === false));
  /** the rows the configurator shows: the stored order, only what the entity can do */
  function climateRows(c) {
    const can = climateCan(c), list = climateControls(c.controls || []) || [];
    return list.filter((x) => can[x.type]);
  }

  const TYPES = {
    light: {
      label: 'Light', group: 'Controls', size: { w: 3, h: 4 }, glyph: G.light,
      // presentations of the SAME light (widgets/default/light): Standard keeps the id 'artwork' it has had since 1.0 (the fixture card);
      // Artwork (image-led) is 'image'. preview = each variant's representative EDITOR preview shape (never the dashboard size).
      variants: [{ id: 'artwork', label: 'Standard', default: true, preview: { w: 8, h: 6 } }, { id: 'compact', label: 'Compact', preview: { w: 7, h: 2 } },
        { id: 'slider', label: 'Slider', preview: { w: 4, h: 7 } }, { id: 'image', label: 'Artwork', preview: { w: 8, h: 7 } }],
      description: 'On/off with brightness, colour temperature and colour as the light supports them — as a fixture lamp, a compact row, a brightness slider or an image-led card.',
      defaults: { name: 'Living Room', state: 'on', brightness: 70, capabilities: { power: true, brightness: true }, image: 'widgets/default/light/assets/pendant-dome.png', imageRatio: 480 / 436 },
      normalize(c) {   // legacy shorthand 'dimmable' → capabilities.brightness; the retired 'tile' presentation → Standard; Appearance: allow-listed values only
        if (c.dimmable !== undefined) { c.capabilities = { ...(c.capabilities || {}), brightness: !!c.dimmable }; delete c.dimmable; }
        if (c.variant === 'tile') delete c.variant;
        const L = global.MaisonLight && global.MaisonLight.LOOK;
        if (L) Object.keys(L).forEach((k) => { if (k === 'titleSize' && typeof c[k] === 'number') return; if (c[k] !== undefined && (!L[k].includes(c[k]) || c[k] === L[k][0])) delete c[k]; });
        if (typeof c.titleSize === 'number') c.titleSize = scaleNum(c.titleSize);                // the title size as a scale (%), 60–160
        // one ARTWORK for every variant (the shared picker): the Artwork variant's former own picture becomes it
        if (c.artwork !== undefined) { if (c.variant === 'image' && typeof c.artwork === 'string' && c.artwork) c.image = c.artwork; delete c.artwork; }
        if (c.image === '' || c.image === null) c.image = 'none';
        // a demo light with a colour temperature needs a range to slide in (a linked one gets Home Assistant's)
        if (c.capabilities?.colorTemp && !(c.colorTempRange && Number(c.colorTempRange.max) > Number(c.colorTempRange.min))) c.colorTempRange = { min: 2200, max: 6500 };
        // POWER: its look (the shared control button); an older "Power control" choice becomes its theme style (the same look)
        { const p = { ...(c.power && typeof c.power === 'object' && !Array.isArray(c.power) ? c.power : {}) };
          // (the Slider never offered it: there an older value had no effect, and still has none)
          if (c.powerStyle !== undefined) { if (!p.style && c.variant !== 'slider' && c.powerStyle === 'switch') p.style = 'switch'; if (!p.style && c.variant !== 'slider' && c.powerStyle === 'button') p.style = 'round'; delete c.powerStyle; }
          const n = CONTROL.normButton(p, LIGHT_POWER); if (Object.keys(n).length) c.power = n; else delete c.power; }
        // CONTROLS: the ordered list (an older { brightness: false… } becomes it); the default list is not stored
        if (c.controls !== undefined) { const l = lightControls(c.controls); if (l && l.length && !lightDefault(l)) c.controls = l; else delete c.controls; }
        if (c.controlAlign !== undefined && !['center', 'right'].includes(c.controlAlign)) delete c.controlAlign;
        if (c.titlePlace !== undefined && !CONTROL.PLACES.includes(c.titlePlace)) delete c.titlePlace;
        if (c.controlGap !== undefined) { const n = sizeOf(c.controlGap, 0, 40); if (n === undefined) delete c.controlGap; else c.controlGap = n; }
        if (c.fallbackIcon && typeof c.fallbackIcon === 'object' && c.fallbackIcon.size !== undefined) {
          const n = sizeOf(c.fallbackIcon.size, 16, 160); if (n === undefined) { c.fallbackIcon = { ...c.fallbackIcon }; delete c.fallbackIcon.size; } else c.fallbackIcon = { ...c.fallbackIcon, size: n };
        }
        return c;
      },
      // the LIGHT's own sections (docs/WIDGET-REFERENCE.md — "Light"): what it is · what it presents · the card's gestures · how it looks ·
      // its picture / icon · when it is shown. Empty sections are not shown.
      groups: [['identity', 'Light', 'Its name and the Home Assistant light'],
        ['controls', 'Controls', 'What the card lets you change — only what the light supports'],
        ['interactions', 'Interactions', 'Tap, double tap and long press ON THE CARD — the power button, the sliders and the colour buttons are the light’s own controls and never run a card action'],
        ['appearance', 'Appearance', 'How it is presented'],
        ['images', 'Images', 'Artwork, or a fallback icon'],
        ['visibility', 'Visibility', 'Show or hide from a Home Assistant state']],
      fields: [
        F.name(),
        F.entity('light'),
        // CONTROLS — a demo light says what it can do (linked: Home Assistant decides); then which of the light's REAL controls the card
        // presents. Power is always there. A control the light cannot do is never offered (no fake control).
        { ...F.cap('brightness', 'Dimmable', 'Demo light: it has a brightness'), group: 'controls', half: true },
        { ...F.cap('colorTemp', 'Colour temperature', 'Demo light: warm to cool white'), group: 'controls', half: true },
        { ...F.cap('color', 'Colour', 'Demo light: coloured light'), group: 'controls', half: true },
        { ...F.state(['on', 'off']), group: 'controls', half: true },
        { ...F.pct('brightness', 'Brightness %', (c) => c.capabilities?.brightness), group: 'controls' },
        // CONTROLS, in the order the card presents them: POWER (always there — the shared control button; it can be moved, not removed) and
        // what the light has — brightness · colour temperature · colour · effects — and optional TOGGLES. Each: its look and its PLACE.
        { key: 'controls', type: 'collection', label: 'Controls', group: 'controls', itemLabel: 'control', addLabel: '+ Add toggle control', max: 7,
          get: (c) => lightRows(c),
          set: (c, n) => {
            const caps = lightCaps(c), kept = (lightControls(c.controls) || []).filter((x) => x.type !== 'toggle' && x.type !== 'power' && !caps[x.type]);
            const pr = n.find((x) => x.type === 'power');
            if (pr) { const { type, ...look } = pr; const p = CONTROL.normButton(look, LIGHT_POWER); if (Object.keys(p).length) c.power = p; else delete c.power; }
            const l = lightControls([...n.map((x) => (x.type === 'power' ? { type: 'power' } : x)), ...kept]);
            if (l && l.length && !lightDefault(l)) c.controls = l; else delete c.controls;
          },
          removable: (x) => x.type === 'toggle', canAdd: (list) => list.filter((x) => x.type === 'toggle').length < 2,
          previewFocus: (x) => ({ power: '.lw__power', brightness: '.lw__dim', colorTemp: '.iq-light-ct', color: '.iq-light-sw' }[x.type] || null),
          context: (c) => ({ caps: lightCaps(c), range: lightRange(c) }), create: (list, c) => lightToggleDefault({ caps: lightCaps(c || {}) }),
          summary: (x) => (x.type === 'power' ? { icon: x.icon || 'mdi:power', title: 'Power', sub: [LIGHT_STYLE[x.style || 'theme'], x.size ? `${x.size} px` : '', x.place ? placeName(x.place) : ''].filter(Boolean).join(' · ') }
            : x.type === 'toggle'
              ? { icon: x.a?.icon || 'mdi:toggle-switch-outline', title: x.name || 'Toggle', sub: [`2 options · ${[x.a, x.b].map((o) => o?.label || LIGHT_DOES[o?.set] || '—').join(' / ')}`, x.place ? placeName(x.place) : ''].filter(Boolean).join(' · ') }
              : { icon: LIGHT_ROW[x.type][0], title: LIGHT_ROW[x.type][1], sub: x.show === false ? 'Not shown' : [LIGHT_ROW[x.type][2], x.place ? `${x.place === 'center' ? 'centre' : x.place} line` : ''].filter(Boolean).join(' · ') }),
          groups: [['show', '', ''], ['pbtn', 'Button', 'Its surface'], ['picon', 'Icon', 'The glyph'], ['bright', 'Appearance', 'The slider'], ['a', 'Option A', ''], ['b', 'Option B', ''],
            ['look', 'Appearance', 'The whole control'], ['place', 'Placement', 'Where it sits on the card — the variant keeps its composition around it']],
          fields: [
            { key: 'show', type: 'boolean', label: 'Show on the card', group: 'show', when: (x) => x.type !== 'toggle' && x.type !== 'power', get: (x) => x.show !== false, set: (x, v) => { if (v === false) x.show = false; else delete x.show; },
              help: 'Off: the card does not offer it (the light keeps it).' },
            { key: 'name', type: 'text', label: 'Name', group: 'show', optional: true, maxLength: 24, placeholder: 'e.g. White', when: (x) => x.type === 'toggle', help: 'Read out to screen readers; shown in this list.' },
            // POWER: one look for every variant (the shared control button)
            ...CONTROL.button({ ...LIGHT_POWER, k: 'power.', when: (x) => x.type === 'power', groups: ['pbtn', 'picon'], defaultIcon: 'the standard power / bulb icon' }),
            ...CONTROL.placement({ k: 'power.', when: (x) => x.type === 'power', initial: 'bottom-right' }),
            // BRIGHTNESS: its look, and its line (it is a linear control: a line across the card, not a corner)
            ...sliderFields({ k: 'dim.', group: 'bright', when: (x) => x.type === 'brightness' && x.show !== false, words: LIGHT_SLIDER_WORDS }),
            { key: 'dim.place', type: 'select', label: 'Line', group: 'place', when: (x) => x.type === 'brightness' && x.show !== false,
              options: opts([['auto', 'Automatic — where the variant puts it'], ['top', 'Top'], ['center', 'Centre'], ['bottom', 'Bottom']]),
              get: (x) => x.place || 'auto', set: (x, v) => { if (LIGHT_LINES.includes(v)) x.place = v; else delete x.place; }, help: 'A line across the card (the Slider: the whole card is its brightness).' },
            ...['a', 'b'].flatMap((k) => CONTROL.option(k, { when: (x) => x.type === 'toggle', sets: (x, ctx) => lightSets(x[k], ctx),
              extra: [
                { key: `${k}.brightness`, type: 'range', label: 'Brightness', unit: '%', min: 1, max: 100, step: 1, when: (o) => o.set === 'brightness' },
                { key: `${k}.kelvin`, type: 'range', label: 'Colour temperature', unit: 'K', min: 1500, max: 9000, step: 50, when: (o) => o.set === 'colorTemp',
                  help: 'Kept within the light’s own range when it is used.' },
                { key: `${k}.hue`, type: 'select', label: 'Colour', options: LIGHT_HUES.map(([value, label]) => ({ value: String(value), label })), when: (o) => o.set === 'color',
                  get: (o) => (o.hue === undefined ? undefined : String(o.hue)), set: (x, v) => { x[k] = { ...(x[k] || {}), hue: Number(v) }; } },
              ] })),
            ...CONTROL.segmented({}, (x) => x.type === 'toggle'),
            ...CONTROL.placement({ k: 'toggle.', when: (x) => x.type === 'toggle', initial: 'top-left', auto: 'Automatic — with the brightness' }),
          ],
          itemErrors: (x) => (x.type === 'toggle' && !(x.a?.icon || x.a?.label) ? [{ key: 'a.icon', message: 'Option A needs an icon or a label' }] : [])
            .concat(x.type === 'toggle' && !(x.b?.icon || x.b?.label) ? [{ key: 'b.icon', message: 'Option B needs an icon or a label' }] : []) },
        { key: 'controlAlign', type: 'select', label: 'Line alignment', group: 'controls', half: true, options: opts([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]), get: (c) => c.controlAlign || 'left',
          when: (c) => lightRows(c).some((x) => x.type === 'toggle'), help: 'The controls that share the brightness line.' },
        { key: 'controlGap', type: 'range', label: 'Control gap', group: 'controls', unit: 'px', min: 0, max: 40, step: 1, auto: 'Automatic', autoValue: 10,
          when: (c) => lightRows(c).some((x) => x.type === 'toggle' || x.place) || !!c.titlePlace, help: 'Between controls that share a place or a line.' },
        // ARTWORK: the shared Image / Artwork picker — None (no image; an optional fallback icon) · Pendant · Dining room · Upload
        ...F.artwork('image', 'Artwork', { group: 'images', builtins: [{ value: 'widgets/default/light/assets/pendant-dome.png', label: 'Pendant' }, { value: 'widgets/default/light/assets/artwork-pendant.svg', label: 'Dining room' }],
          iconSize: { min: 16, max: 160, help: 'The size of the icon itself — a background grows around it, never shrinks it. Automatic: sized for the card; never larger than the space it has.' } }),
        // APPEARANCE (semantic, offered per variant — MaisonLight.LOOK_FOR)
        ...F.looks(() => global.MaisonLight, (c) => variantOf('light', c), [
          ['align', 'Content alignment', ['Left', 'Centre', 'Right']],
          ['imageTreatment', 'Image treatment', ['Natural', 'Dark', 'Dim', 'Soft'], 'The light state always shows: off is the dimmed, grey picture.'],
          ['glow', 'Light glow', ['Natural', 'Subtle', 'Strong']],
        ]).map((f) => (f.key === 'imageTreatment' ? { ...f, when: (c) => f.when(c) && hasImage(c) } : f)),   // a treatment of the picture: only with one
        // the TITLE's place (as the controls': Automatic = where the variant puts it)
        ...CONTROL.placement({ prop: 'titlePlace', label: 'Title position', initial: 'top-left', group: 'appearance' }).map((f, i) => (i === 0 ? { ...f, label: 'Title placement' } : f)),
        F.titleScale({ small: 80, medium: 92, large: 120 }, (c) => { const A = global.MaisonLight; return !!(A && A.LOOK_FOR[variantOf('light', c)] && A.LOOK_FOR[variantOf('light', c)].includes('titleSize')); }),
      ],
      create: (c) => impl('light').create(c),
      constraints: (c) => impl('light').constraints(c),
    },
    climate: {
      label: 'Climate', group: 'Climate & Environment', size: { w: 4, h: 7 }, glyph: G.climate,
      // compositions of the SAME thermostat (the ids it has had since 1.0): Thermostat ('dial': the dial as the centrepiece — portrait or
      // landscape), Horizontal (the dial beside its controls), Compact (no ring: the value with − / +), Minimal (a read-only readout)
      variants: [{ id: 'dial', label: 'Thermostat', default: true, preview: { w: 6, h: 9 } }, { id: 'horizontal', label: 'Horizontal', preview: { w: 10, h: 6 } },
        { id: 'compact', label: 'Compact', preview: { w: 6, h: 3 } }, { id: 'minimal', label: 'Minimal', preview: { w: 5, h: 3 } }],
      description: 'A thermostat: target temperature, HVAC mode, power and what the climate entity supports — a dial in four designs, controls and information placed where you choose.',
      defaults: { name: 'Living Room', currentTemperature: 20.8, showCurrent: true, targetTemperature: 22, minTemperature: 5, maxTemperature: 30, temperatureStep: 0.5, unit: '°C', hvacMode: 'heat', hvacModes: ['heat', 'off'], capabilities: { targetTemperature: true, hvacMode: true } },
      normalize(c) {
        if (c.controls !== undefined) { const l = climateControls(c.controls); if (l && !climateDefault(l)) c.controls = l; else delete c.controls; }
        if (c.info !== undefined) { const l = heroInfoClean(c.info, { hex: true }); if (l && l.length) c.info = l.slice(0, 10); else delete c.info; }
        if (c.titlePlace !== undefined && !CONTROL.PLACES.includes(c.titlePlace)) delete c.titlePlace;
        ['controlGap', 'infoGap'].forEach((k) => { if (c[k] !== undefined) { const n = sizeOf(c[k], 0, 40); if (n === undefined) delete c[k]; else c[k] = n; } });
        climateBarClean(c);
        if (c.imageTreatment !== undefined && !['dim', 'dark', 'grayscale'].includes(c.imageTreatment)) delete c.imageTreatment;
        if (c.overlay !== undefined && !['none', 'light', 'strong'].includes(c.overlay)) delete c.overlay;
        if (c.stateImage !== undefined && c.stateImage !== false) delete c.stateImage;
        if (c.image === '' || c.image === null) c.image = 'none';
        return c;
      },
      // the CLIMATE's own sections: what it is · what it lets you change · what it shows · the card's gestures · how it looks · its picture ·
      // when it is shown. Empty sections are not shown.
      groups: [['identity', 'Climate', 'Its name and the Home Assistant climate entity'],
        ['controls', 'Controls', 'What the card lets you change — only what the entity supports — with their look and place'],
        ['information', 'Information', 'Values from Home Assistant, each placed where you choose'],
        ['interactions', 'Interactions', 'Tap, double tap and long press ON THE CARD — the dial, the buttons and the mode selector are its own controls and never run a card action'],
        ['appearance', 'Appearance', 'How it is presented'],
        ['images', 'Images', 'A background picture (the Climate image library)'],
        ['visibility', 'Visibility', 'Show or hide from a Home Assistant state']],
      fields: [
        F.name(),
        F.entity('climate'),
        { key: 'showCurrent', type: 'boolean', label: 'Show room temperature', group: 'identity', help: 'Off for a device whose own room reading is unusable (e.g. a stove that measures its flue)' },
        // the DEMO climate (linked: Home Assistant decides all of it)
        { ...F.cap('targetTemperature', 'Target temperature', 'Demo: a single set point'), group: 'controls', half: true },
        { ...F.cap('hvacMode', 'HVAC modes', 'Demo: a mode selector'), group: 'controls', half: true },
        { key: 'hvacModes', type: 'list', label: 'HVAC modes', group: 'controls', options: () => CLIMATE_MODES, when: (c) => c.capabilities?.hvacMode, required: true, demo: true },
        { key: 'hvacMode', type: 'select', label: 'Mode', group: 'controls', half: true, optionsFrom: (c) => (c.hvacModes?.length ? c.hvacModes : ['heat', 'off']), demo: true },
        { key: 'state', type: 'select', label: 'Doing now', group: 'controls', half: true, demo: true, options: opts([['', 'Not reported'], ['heating', 'Heating'], ['cooling', 'Cooling'], ['idle', 'Idle']]),
          help: 'Demo: what it is DOING (Home Assistant’s action) — not its mode. Heat mode can be idle.' },
        { key: 'minTemperature', type: 'number', label: 'Minimum', group: 'controls', half: true, required: true, step: 0.5, live: liveIf('climate', (x, e) => x.capabilities?.targetTemperature && e.attrs?.min_temp == null) },
        { key: 'maxTemperature', type: 'number', label: 'Maximum', group: 'controls', half: true, required: true, step: 0.5, live: liveIf('climate', (x, e) => x.capabilities?.targetTemperature && e.attrs?.max_temp == null) },
        { key: 'temperatureStep', type: 'number', label: 'Step', group: 'controls', half: true, required: true, step: 0.1, min: 0.1, max: 5, live: liveIf('climate', (x, e) => x.capabilities?.targetTemperature && e.attrs?.target_temp_step == null),
          help: 'Linked: used because Home Assistant reports no step for this entity' },
        { key: 'targetTemperature', type: 'number', label: 'Target', group: 'controls', half: true, step: 0.5, when: (c) => c.capabilities?.targetTemperature, demo: true },
        { key: 'currentTemperature', type: 'number', label: 'Room temperature', group: 'controls', half: true, step: 0.1, optional: true, when: (c) => c.showCurrent !== false, demo: true },
        // CONTROLS — in the order the card presents them; each with its look and its place (the shared controls)
        { key: 'controls', type: 'collection', label: 'Controls', group: 'controls', itemLabel: 'control', max: CLIMATE_KINDS.length,
          get: (c) => climateRows(c),
          set: (c, n) => { const can = climateCan(c), kept = (climateControls(c.controls || []) || []).filter((x) => !can[x.type]);
            const l = climateControls([...n.map((x) => (x.type === 'power' && x.show === undefined ? { ...x, show: true } : x)), ...kept]);
            if (l && !climateDefault(l)) c.controls = l; else delete c.controls; },
          removable: () => false, canAdd: () => false,
          context: (c) => { const x = climateNow(c); return { modes: x ? x.hvacModes : CLIMATE_MODES }; },
          // the item editor draws the configuration's Live preview with the unsaved control; this is the control inside the card
          previewFocus: (x) => (x.type === 'dial' ? '.iqdl' : `[data-k="${x.type}"]`),
          summary: (x) => { const r = CLIMATE_ROW[x.type], where = x.place ? ` · ${x.place.replace('center-center', 'centre').replace(/center/g, 'centre').replace('-', ' ')}` : '';
            const sub = x.type === 'dial' ? (CLIMATE_DESIGN.find(([v]) => v === (x.design || 'spectrum')) || [])[1] : x.show === false ? 'Not shown' : x.type === 'mode' ? (x.present === 'select' ? 'Select' : 'Segmented') : ['power', 'minus', 'plus'].includes(x.type) ? (x.style && x.style !== 'theme' ? x.style[0].toUpperCase() + x.style.slice(1) : 'Theme') + (x.size ? ` · ${x.size} px` : '') : 'Shown';
            return { icon: x.type === 'power' || x.type === 'minus' || x.type === 'plus' ? x.icon || r[0] : r[0], title: r[1], sub: x.show === false ? 'Not shown' : `${sub}${where}` }; },
          groups: [['show', '', ''], ['dial', 'Dial', 'The thermostat'], ['dialx', 'Details', 'What the design shows'], ['dialc', 'State colours', 'Heating · cooling · idle — from what it is DOING'],
            ['btn', 'Button', 'Its surface'], ['bicon', 'Icon', 'The glyph'], ['present', 'Presentation', ''],
            ...CLIMATE_MODES.map((m) => [`m_${m}`, CLIMATE_MODE_LABEL[m], '']), ['look', 'Appearance', 'The whole control'], ['place', 'Placement', 'Where it sits — the variant keeps its composition around it']],
          fields: [
            { key: 'show', type: 'boolean', label: 'Show on the card', group: 'show', when: (x) => x.type !== 'dial', get: (x) => x.show !== false, set: (x, v) => { if (v === false) x.show = false; else if (x.type === 'power') x.show = true; else delete x.show; },
              help: 'Off: the card does not offer it (the entity keeps it).' },
            // THE DIAL: its design and its look (one renderer: the same target, limits, step, mode and action for every design)
            ...dialFields({ k: 'dial.', when: (x) => x.type === 'dial', groups: ['dial', 'dialx', 'dialc'], fields: ['size', 'primary'], words: CLIMATE_DIAL_WORDS }),
            // POWER · − · + : the shared control button (Theme: the state colour)
            ...['power', 'minus', 'plus'].flatMap((t) => CONTROL.button({ ...CLIMATE_BTN, k: `${t}.`, when: (x) => x.type === t, groups: ['btn', 'bicon'],
              defaultIcon: t === 'power' ? 'mdi:power' : t === 'minus' ? 'mdi:minus' : 'mdi:plus' })),
            // MODE / FAN / PRESET / SWING: the shared segmented control (2–4 options), or a select
            { key: 'present', type: 'select', label: 'Presentation', group: 'present', when: (x) => ['mode', 'fan', 'preset', 'swing'].includes(x.type), get: (x) => x.present || 'auto',
              options: opts([['auto', 'Automatic — segmented for up to 4 options, else a select'], ['segmented', 'Segmented'], ['select', 'Select']]), set: (x, v) => { if (v === 'segmented' || v === 'select') x.present = v; else delete x.present; } },
            { key: 'labels', type: 'boolean', label: 'Show labels', group: 'present', when: (x) => x.type === 'mode' && x.present !== 'select', get: (x) => x.labels === true, set: (x, v) => { if (v) x.labels = true; else delete x.labels; } },
            ...CLIMATE_MODES.flatMap((m) => {
              const on = (x, ctx) => x.type === 'mode' && x.present !== 'select' && (!ctx || !ctx.modes || ctx.modes.includes(m));
              const g = (x) => (x.modes && x.modes[m]) || {};
              const put = (x, k, v) => { const all = { ...(x.modes || {}) }, o = { ...(all[m] || {}) }; if (v === undefined || v === '' || v === null) delete o[k]; else o[k] = v; if (Object.keys(o).length) all[m] = o; else delete all[m]; if (Object.keys(all).length) x.modes = all; else delete x.modes; };
              return [
                { key: `modes.${m}.icon`, type: 'mdi', label: 'Icon', group: `m_${m}`, optional: true, when: on, get: (x) => g(x).icon || '', set: (x, v) => put(x, 'icon', v), help: 'None: the default icon' },
                { key: `modes.${m}.color`, type: 'color', label: 'Active colour', group: `m_${m}`, optional: true, custom: true, options: INFO_COLORS, when: on, get: (x) => g(x).color, set: (x, v) => put(x, 'color', v) },
                { key: `modes.${m}.label`, type: 'text', label: 'Label', group: `m_${m}`, optional: true, maxLength: 20, placeholder: CLIMATE_MODE_LABEL[m], when: on, get: (x) => g(x).label, set: (x, v) => put(x, 'label', v) },
              ];
            }),
            ...CONTROL.segmented({}, (x) => ['mode', 'fan', 'preset', 'swing'].includes(x.type) && x.present !== 'select'),
            // PLACEMENT (structured): the dial, and every other control
            ...CONTROL.placement({ k: 'dial.', when: (x) => x.type === 'dial', initial: 'center-center' }),
            ...CONTROL.placement({ when: (x) => x.type !== 'dial' && x.show !== false, initial: 'top-right' }),
            // a small OFFSET from that place (logical px; kept inside the card) — the dial and the discrete controls only
            ...CONTROL.offset({ keys: ['nudge.ox', 'nudge.oy'], when: (x) => (x.type === 'dial' || CLIMATE_NUDGE.includes(x.type)) && x.show !== false }),
          ] },
        { key: 'controlGap', type: 'range', label: 'Control gap', group: 'controls', unit: 'px', min: 0, max: 40, step: 1, auto: 'Automatic', autoValue: 10, help: 'Between controls that share a place.' },
        // INFORMATION (the shared collection — inserted below, after its builder) and its gap
        { key: 'infoGap', type: 'range', label: 'Information gap', group: 'information', unit: 'px', min: 0, max: 40, step: 1, auto: 'Automatic', autoValue: 10, when: (c) => hasInfo(c) && c.infoLayout !== 'bar',
          help: 'Between information items that share a place.' },
        // the collection's LAYOUT: each item at its own place, or all of them (in order) as one structured Information Bar
        ...CLIMATE_BAR_FIELDS,
        // APPEARANCE
        { key: 'unit', type: 'select', label: 'Unit', group: 'appearance', half: true, options: ['°C', '°F'], live: () => !['°C', '°F'].includes(global.IniqHA?.status?.().temperatureUnit) },
        ...CONTROL.placement({ prop: 'titlePlace', label: 'Title position', initial: 'top-left', group: 'appearance' }).map((f, i) => (i === 0 ? { ...f, label: 'Title placement' } : f)),
        { key: 'imageTreatment', type: 'select', label: 'Image treatment', group: 'appearance', half: true, when: hasImage, get: (c) => c.imageTreatment || 'natural', options: opts([['natural', 'Natural'], ['dim', 'Dim'], ['dark', 'Dark'], ['grayscale', 'Grayscale']]) },
        { key: 'overlay', type: 'select', label: 'Overlay strength', group: 'appearance', half: true, when: hasImage, get: (c) => c.overlay || 'medium', options: opts([['none', 'None'], ['light', 'Light'], ['medium', 'Medium'], ['strong', 'Strong']]) },
        { key: 'stateImage', type: 'boolean', label: 'Picture follows what it is doing', group: 'appearance', when: hasImage, get: (c) => c.stateImage !== false, set: (c, v) => { if (v === false) c.stateImage = false; else delete c.stateImage; },
          help: 'Heating warms the picture, cooling cools it, idle / off rests it — from Home Assistant’s action, never from the mode alone.' },
        // IMAGES: the shared picker, scoped to the Climate image library
        ...F.artwork('image', 'Background', { group: 'images', fallback: null,
          builtins: [{ value: 'widgets/default/climate/assets/fireplace.svg', label: 'Fireplace' }, { value: 'widgets/default/climate/assets/cool-air.svg', label: 'Cool room' }] }),
      ],
      validate(c) {
        const e = [];
        if (Number(c.minTemperature) >= Number(c.maxTemperature)) e.push({ key: 'maxTemperature', message: 'Maximum must be higher than minimum' });
        if (c.capabilities?.targetTemperature && c.targetTemperature !== undefined && (c.targetTemperature < c.minTemperature || c.targetTemperature > c.maxTemperature)) e.push({ key: 'targetTemperature', message: 'Target must be between minimum and maximum' });
        if (c.capabilities?.hvacMode && c.hvacModes && !c.hvacModes.includes(c.hvacMode)) e.push({ key: 'hvacMode', message: 'Mode must be one of the HVAC modes' });
        return e;
      },
      create: (c) => impl('climate').create(c.showCurrent === false ? { ...c, currentTemperature: null } : c),
      constraints: (c) => impl('climate').constraints(c),
    },
    sensor: {
      label: 'Sensor', group: 'Sensors & Data', size: { w: 2, h: 3 }, glyph: G.sensor,
      // presentations (shared variant system): Standard = the readout as it always was; Value = the value alone, large
      variants: [{ id: 'standard', label: 'Standard', default: true }, { id: 'value', label: 'Value' }, { id: 'status', label: 'Status' }, { id: 'level', label: 'Level' }, { id: 'graph', label: 'Mini Graph' }],
      description: 'A value with unit, status, tone, trend and a secondary reading — as a readout, a status, a level bar or a mini graph.',
      defaults: { name: 'Temperature', icon: 'temperature', value: 20.8, unit: '°C', precision: 1, status: 'Comfortable', tone: 'normal' },
      fields: [
        F.name(),
        // picking an entity clears only the built-in DEMO status text; your own status / secondary text and the (hidden) trend are kept
        F.entity('sensor', (c, e) => { if (c.status === undefined || c.status === 'Comfortable') c.status = ''; c.tone = 'neutral'; if (e.unit) c.unit = String(e.unit).slice(0, 12); const icons = global.MaisonSensor?.ICONS || {}; if (e.dc && icons[e.dc]) c.icon = e.dc; }),
        { key: 'icon', type: 'mdi', label: 'Icon', group: 'appearance', builtins: () => [...keysOf(global.MaisonSensor?.ICONS), 'generic'], help: 'Any Material Design icon (or one of the built-in sensor icons).' },
        { key: 'value', type: 'text', label: 'Value', group: 'data', placeholder: '20.8 or a text state', maxLength: 30, numeric: true, demo: true },
        F.text('unit', 'Unit', 'appearance', { maxLength: 12, demo: true }),
        { key: 'precision', type: 'number', label: 'Decimals', group: 'appearance', optional: true, min: 0, max: 3, integer: true, live: liveIf('sensor', (x, e) => e.domain !== 'binary_sensor' && (num(e.state) !== null || !!e.unit)) },
        F.text('status', 'Caption', 'data', { help: 'Your own fixed text under the value — not read from Home Assistant' }),
        { key: 'tone', type: 'select', label: 'Tone', group: 'appearance', options: () => global.MaisonSensor?.TONES || ['neutral'] },
        // a fixed arrow, not derived from Home Assistant data: never shown for a linked entity
        { key: 'trend', type: 'select', label: 'Trend', group: 'data', options: ['none', 'up', 'down', 'stable'], demo: true },
        // INLINE HISTORY: the linked entity's real Home Assistant history inside the card (nothing is requested when Off).
        // What can be drawn follows the entity: a measured value → line / area; on/off and other states → a state timeline.
        { key: 'history.mode', type: 'select', label: 'Inline history', group: 'capability', when: (c) => linkedTo(c),
          get: (c) => c.history?.mode || 'off',
          set: (c, v) => { if (v === 'off' || !v) delete c.history; else c.history = { range: '6h', position: 'bottom', ...(c.history || {}), mode: v }; },
          optionsFrom: (c) => {
            const all = { off: 'Off', auto: 'Automatic', line: 'Line', area: 'Area', timeline: 'State timeline' };
            const fx = global.IniqHA?.capabilities?.('sensor', c);
            const kind = fx && fx.state === 'ready' ? global.IniqHA.historyKind(fx.entity) : null;
            const keys = kind === 'numeric' ? ['off', 'auto', 'line', 'area'] : kind === 'states' ? ['off', 'auto', 'timeline'] : Object.keys(all);
            const cur = c.history?.mode;
            return [...keys.map((k) => ({ value: k, label: all[k] })), ...(cur && !keys.includes(cur) && all[cur] ? [{ value: cur, label: `${all[cur]} (not for this entity: automatic is used)` }] : [])];
          },
          help: 'Real history from Home Assistant, drawn small behind the value. Off: no history is requested.' },
        // Level: the range of the bar when neither a percentage nor the entity's own range gives one
        { key: 'levelMin', type: 'number', label: 'Level: minimum', group: 'capability', optional: true, step: 'any', when: (c) => c.variant === 'level',
          help: 'The bar is drawn from here. Used only when the value is not a percentage and Home Assistant reports no range for the entity. Without a range no bar is drawn.' },
        { key: 'levelMax', type: 'number', label: 'Level: maximum', group: 'capability', optional: true, step: 'any', when: (c) => c.variant === 'level' },
        // Mini Graph: the period of the real history it draws (linked only — a demo sensor has no history)
        { key: 'graphRange', type: 'select', label: 'Graph period', group: 'capability', when: (c) => c.variant === 'graph' && linkedTo(c), get: (c) => c.graphRange || '6h',
          set: (c, v) => { if (v === '6h') delete c.graphRange; else c.graphRange = v; },
          options: [{ value: '1h', label: 'Last hour' }, { value: '6h', label: 'Last 6 hours' }, { value: '24h', label: 'Last 24 hours' }],
          help: 'Real history from Home Assistant. A demo sensor has none, so nothing is drawn.' },
        { key: 'history.range', type: 'select', label: 'History period', group: 'capability', when: (c) => linkedTo(c) && !!c.history?.mode,
          get: (c) => c.history?.range || '6h', options: [{ value: '1h', label: 'Last hour' }, { value: '6h', label: 'Last 6 hours' }, { value: '24h', label: 'Last 24 hours' }] },
        { key: 'history.position', type: 'select', label: 'History position', group: 'capability', when: (c) => linkedTo(c) && !!c.history?.mode,
          get: (c) => c.history?.position || 'bottom', options: [{ value: 'bottom', label: 'Along the bottom' }, { value: 'background', label: 'Background' }] },
        // a fixed second reading would look live next to a linked value: shown (and editable) only without an entity
        F.text('secondary.label', 'Secondary label', 'data', { demo: true, help: 'Demo second line (your own fixed text and value) — not shown when linked to Home Assistant', set: (c, v) => { if (String(v ?? '').trim()) setPath(c, 'secondary.label', String(v)); else delete c.secondary; } }),
        { key: 'secondary.value', type: 'number', label: 'Secondary value', group: 'data', optional: true, step: 0.1, when: (c) => !!c.secondary?.label, demo: true },
        F.text('secondary.unit', 'Secondary unit', 'data', { when: (c) => !!c.secondary?.label, maxLength: 12, demo: true }),
      ],
      normalize(c) {
        if (c.graphRange !== undefined && !['1h', '24h'].includes(c.graphRange)) delete c.graphRange;
        ['levelMin', 'levelMax'].forEach((k) => { if (c[k] !== undefined && !Number.isFinite(Number(c[k]))) delete c[k]; });
        if (c.history !== undefined && !(c.history && typeof c.history === 'object' && ['auto', 'line', 'area', 'timeline'].includes(c.history.mode))) delete c.history;
        else if (c.history) Object.keys(c.history).forEach((k) => { if (!['mode', 'range', 'position'].includes(k)) delete c.history[k]; });
        return c;
      },
      create: (c) => impl('sensor').create(c),
      constraints: (c, px) => impl('sensor').constraints(c, { span: span(px) }),
    },
    switch: {
      label: 'Switch', group: 'Controls', size: { w: 2, h: 3 }, glyph: G.switch,
      description: 'A simple on/off device with icon or artwork.',
      defaults: { name: 'Kitchen Extractor', subtitle: 'Kitchen', icon: 'extractor', state: 'on' },
      fields: [
        F.name(), F.subtitle(),
        F.entity('switch'),
        { key: 'icon', type: 'icon', label: 'Icon', group: 'appearance', options: () => keysOf(global.MaisonSwitch?.ICONS), icons: () => global.MaisonSwitch?.ICONS },
        { ...F.image('image', 'Device artwork (on)', ['widgets/default/switch/assets/smart-plug-on.png']), upload: true },
        { ...F.image('imageOff', 'Device artwork (off)', ['widgets/default/switch/assets/smart-plug-off.png']), upload: true },
        F.state(['on', 'off']),
        F.text('secondaryStatus', 'Caption', 'data', { demo: true, help: 'Your own fixed text after the state — not shown when linked to Home Assistant, so it cannot look like a live status' }),
        F.available(),
      ],
      create: (c) => impl('switch').create(c),
      constraints: (c, px) => impl('switch').constraints(c, { span: span(px) }),
    },
    fan: {
      label: 'Fan', group: 'Controls', size: { w: 4, h: 4 }, glyph: G.fan,
      description: 'Power, with optional speed steps and presets.',
      defaults: { name: 'Ceiling Fan', subtitle: 'Bedroom', state: 'on', speed: 60, speedStep: 20, preset: 'Normal', presets: ['Normal', 'Quiet', 'Boost'], capabilities: { power: true, speed: true, preset: true } },
      fields: [
        F.name(), F.subtitle(),
        F.entity('fan'),
        F.cap('speed', 'Speed', 'Shows the speed control'),
        { key: 'speedStep', type: 'number', label: 'Speed step %', group: 'capability', min: 1, max: 100, step: 1, required: true, help: '33.33 → 3 speeds, 20 → 5 speeds', when: (c) => c.capabilities?.speed, demo: true },
        F.cap('preset', 'Presets', 'Shows the preset chips'),
        { key: 'presets', type: 'list', label: 'Preset names', group: 'capability', when: (c) => c.capabilities?.preset, required: true, demo: true },
        F.state(['on', 'off']),
        F.pct('speed', 'Speed %', (c) => c.capabilities?.speed),
        { key: 'preset', type: 'select', label: 'Active preset', group: 'data', optionsFrom: (c) => c.presets || [], when: (c) => c.capabilities?.preset && c.presets?.length, demo: true },
        F.available(),
      ],
      validate(c) {
        const e = [];
        if (c.capabilities?.speed && !(Number(c.speedStep) > 0 && Number(c.speedStep) <= 100)) e.push({ key: 'speedStep', message: 'Speed step must be more than 0 and at most 100' });
        return e;
      },
      create: (c) => impl('fan').create(c),
      constraints: (c, px) => impl('fan').constraints(c, { span: span(px) }),
    },
    numsel: {
      label: 'Number & Select', group: 'Controls', size: { w: 3, h: 2 }, glyph: G.numsel,
      description: 'Set a value or choose an option — number, input_number, select and input_select entities.',
      defaults: { name: 'Charge Limit', subtitle: 'Car', kind: 'number', value: 80, min: 50, max: 100, step: 5, unit: '%', option: 'Eco', options: ['Eco', 'Comfort', 'Boost'] },
      // ONE widget for both: its presentations follow what it sets (variantsFor — the shared Variant system)
      variants: [{ id: 'slider', label: 'Slider', default: true }, { id: 'stepper', label: 'Stepper' }, { id: 'options', label: 'Options' }, { id: 'compact', label: 'Compact' }],
      variantsFor: (c) => (numselKind(c) === 'select' ? ['options', 'compact'] : ['slider', 'stepper', 'compact']),
      fields: [
        F.name(), F.subtitle(),
        // linked: the kind comes from the entity's domain (and Home Assistant supplies the range / options — no fields for them)
        F.entity('numsel', (c, e) => { c.kind = ['select', 'input_select'].includes(e.domain) ? 'select' : 'number'; }),
        { key: 'kind', type: 'select', label: 'Demo kind', group: 'data', options: [{ value: 'number', label: 'Number (a value in a range)' }, { value: 'select', label: 'Select (one of several options)' }],
          get: (c) => numselKind(c), demo: true, help: 'Demo only — a linked entity decides this itself.' },
        { key: 'value', type: 'number', label: 'Demo value', group: 'data', step: 'any', required: true, when: (c) => numselKind(c) === 'number', demo: true },
        { key: 'min', type: 'number', label: 'Demo minimum', group: 'data', step: 'any', required: true, when: (c) => numselKind(c) === 'number', demo: true },
        { key: 'max', type: 'number', label: 'Demo maximum', group: 'data', step: 'any', required: true, when: (c) => numselKind(c) === 'number', demo: true },
        { key: 'step', type: 'number', label: 'Demo step', group: 'data', step: 'any', optional: true, when: (c) => numselKind(c) === 'number', demo: true },
        F.text('unit', 'Demo unit', 'data', { maxLength: 12, placeholder: 'e.g. %', when: (c) => numselKind(c) === 'number', demo: true }),
        { key: 'options', type: 'list', label: 'Demo options', group: 'data', required: true, when: (c) => numselKind(c) === 'select', demo: true },
        { key: 'option', type: 'select', label: 'Demo current option', group: 'data', optionsFrom: (c) => c.options || [], when: (c) => numselKind(c) === 'select' && c.options?.length, demo: true },
        F.available(),
      ],
      validate(c) {
        const e = [];
        if (numselKind(c) !== 'number' || c.entity) return e;
        const lo = num(c.min), hi = num(c.max), v = num(c.value), st = num(c.step);
        if (lo !== null && hi !== null && lo >= hi) e.push({ key: 'max', message: 'The maximum must be more than the minimum' });
        if (v !== null && lo !== null && hi !== null && (v < lo || v > hi)) e.push({ key: 'value', message: 'The value must be between the minimum and the maximum' });
        if (c.step !== undefined && !(st > 0)) e.push({ key: 'step', message: 'The step must be more than 0' });
        return e;
      },
      create: (c) => impl('numsel').create({ ...c, kind: numselKind(c) }),
      constraints: (c, px) => impl('numsel').constraints({ ...c, kind: numselKind(c) }, { span: span(px) }),
    },
    cover: {
      label: 'Cover', group: 'Controls', size: { w: 4, h: 3 }, glyph: G.cover,
      // presentations of the SAME cover: Window = the picture as always; Garage / Gate, Compact and Slider are their own blocks
      variants: [{ id: 'window', label: 'Window', default: true }, { id: 'garage', label: 'Garage / Gate' }, { id: 'compact', label: 'Compact' }, { id: 'slider', label: 'Slider' }],
      description: 'Shutters, blinds, garage doors, gates: open / stop / close and position — as a window, a garage / gate, a row or a slider.',
      defaults: { name: 'Living Room Shutter', subtitle: 'South façade', state: 'open', position: 40, capabilities: { open: true, close: true, stop: true, position: true } },
      fields: [
        F.name(), F.subtitle(),
        // a garage / gate device class (as Home Assistant reports it) picks the Garage / Gate presentation; any other class is left alone
        F.entity('cover', (c, e) => { if (['garage', 'gate'].includes(e.dc) && !c.variant) c.variant = 'garage'; }),
        { key: 'kind', type: 'select', label: 'Garage / Gate picture', group: 'appearance', demo: true, optional: true, when: (c) => c.variant === 'garage',
          options: [{ value: '', label: 'Neutral door' }, { value: 'garage', label: 'Garage door' }, { value: 'gate', label: 'Gate' }, { value: 'door', label: 'Door' }],
          set: (c, v) => { if (v) c.kind = v; else delete c.kind; }, help: 'A linked cover is drawn from the device class Home Assistant reports (garage, gate, door); anything else is a neutral door.' },
        F.cap('open', 'Open'), F.cap('stop', 'Stop'), F.cap('close', 'Close'),
        F.cap('position', 'Position', 'Shows the position slider'),
        F.text('labels.open', 'Open button label', 'appearance', { placeholder: 'Open', maxLength: 16, when: (c) => c.capabilities?.open !== false, live: liveIf('cover', (x) => !!x.capabilities?.open) }),
        F.text('labels.close', 'Close button label', 'appearance', { placeholder: 'Close', maxLength: 16, when: (c) => c.capabilities?.close !== false, live: liveIf('cover', (x) => !!x.capabilities?.close) }),
        F.state(['open', 'closed', 'opening', 'closing', 'stopped']),
        F.pct('position', 'Position % open', (c) => c.capabilities?.position),
        F.available(),
      ],
      normalize(c) { if (c.kind !== undefined && !['garage', 'gate', 'door'].includes(c.kind)) delete c.kind; return c; },
      validate(c) {
        const k = c.capabilities || {};
        return k.open === false && k.close === false && k.stop === false && !k.position ? [{ key: 'capabilities.open', message: 'A cover needs at least one control' }] : [];
      },
      create: (c) => impl('cover').create(c),
      constraints: (c, px) => impl('cover').constraints(c, { span: span(px) }),
    },
    media: {
      label: 'Media player', group: 'Media', size: { w: 4, h: 4 }, glyph: G.media,
      // presentations of the SAME player: Artwork = the card as always; Compact (one row) and Mini Bar (a thin bar) are their own blocks
      variants: [{ id: 'artwork', label: 'Artwork', default: true }, { id: 'compact', label: 'Compact' }, { id: 'minibar', label: 'Mini Bar' }],
      description: 'Now playing with artwork, play/pause, volume and source — as a card, a row or a thin bar. Progress, shuffle, repeat and power appear only when the player reports them.',
      defaults: { name: 'Living Room', subtitle: 'Speaker', icon: 'speaker', state: 'playing', title: 'Evening Tide', artist: 'Demo Artist', artwork: 'assets/img/media/artwork-tide.jpg', volume: 35, source: 'Radio', sources: ['Radio', 'Spotify', 'TV'], capabilities: { playPause: true, volume: true, source: true } },
      fields: [
        F.name(), F.subtitle(),
        F.entity('media'),
        F.cap('playPause', 'Play / pause'),
        F.cap('volume', 'Volume', 'Shows the volume slider'),
        F.cap('source', 'Source', 'Shows the source selector'),
        { key: 'sources', type: 'list', label: 'Sources', group: 'capability', when: (c) => c.capabilities?.source, required: true, demo: true },
        { key: 'icon', type: 'icon', label: 'Icon (no artwork)', group: 'appearance', options: () => keysOf(global.MaisonMedia?.ICONS), icons: () => global.MaisonMedia?.ICONS },
        { ...F.image('artwork', 'Artwork', ['assets/img/media/artwork-tide.jpg', 'assets/img/media/artwork-dusk.jpg']), demo: true },
        F.state(['playing', 'paused', 'idle', 'off']),
        F.text('title', 'Media title', 'data', { demo: true }), F.text('artist', 'Artist', 'data', { demo: true }),
        F.pct('volume', 'Volume %', (c) => c.capabilities?.volume),
        { key: 'source', type: 'select', label: 'Active source', group: 'data', optionsFrom: (c) => c.sources || [], when: (c) => c.capabilities?.source && c.sources?.length, demo: true },
        F.available(),
      ],
      create: (c) => impl('media').create(c),
      constraints: (c, px) => impl('media').constraints(c, { span: px >= 560 ? 'wide' : undefined }),
    },
    action: {
      label: 'Action', group: 'Controls', size: { w: 2, h: 2 }, glyph: G.action,
      description: 'Runs a scene or script; optional confirmation step.',
      defaults: { name: 'Good Night', icon: 'moon', run: 'demo' },
      fields: [
        F.name(), F.subtitle(),
        { key: 'icon', type: 'mdi', label: 'Icon', group: 'appearance', builtins: () => keysOf(global.MaisonAction?.ICONS), help: 'Any Material Design icon (or one of the built-in action icons).' },
        { key: 'look', type: 'select', label: 'Look', group: 'appearance', get: (c) => (c.look === 'scene' || c.look === 'pill' ? c.look : 'button'), options: opts([['button', 'Button'], ['scene', 'Scene card (round coloured icon)'], ['pill', 'Pill (round coloured icon + name)']]),
          set: (c, v) => { if (v === 'scene' || v === 'pill') c.look = v; else { delete c.look; delete c.iconColor; } } },
        { key: 'iconColor', type: 'select', label: 'Icon colour', group: 'appearance', when: (c) => c.look === 'scene' || c.look === 'pill', get: (c) => c.iconColor || 'orange',
          options: opts([['orange', 'Orange'], ['pink', 'Pink'], ['yellow', 'Yellow'], ['green', 'Green'], ['blue', 'Blue'], ['purple', 'Purple']]) },
        { key: 'requiresConfirmation', type: 'boolean', label: 'Requires confirmation', group: 'capability', help: 'A second deliberate press is needed' },
        { key: 'run', type: 'select', label: 'When pressed', group: 'capability',
          optionsFrom: () => [{ value: 'demo', label: 'Demo action' }, { value: 'popup', label: 'Open popup' }, { value: 'ha', label: global.IniqHA?.enabled?.() ? 'Home Assistant (scene, script, button…)' : 'Home Assistant (on the IniqDash server only)' }],
          help: 'Home Assistant: the entity below is triggered — it does not create or edit scenes or scripts.' },
        { ...F.entity('action'), group: 'capability', when: (c) => c.run === 'ha' && !!global.IniqHA?.enabled?.(), required: true, help: 'What this press triggers in Home Assistant.', describe: TRIGGER_TEXT },
        { key: 'popup', type: 'select', label: 'Popup', group: 'capability', required: true, optionsFrom: () => ctxPopups().map((p) => ({ value: p.id, label: p.name })), when: (c) => c.run === 'popup' },
        { ...F.available(), demo: (c) => c.run === 'ha' },
      ],
      normalize(c) { if (c.run !== 'popup') delete c.popup; if (c.run !== 'ha') delete c.entity;
        if (c.look !== undefined && c.look !== 'scene' && c.look !== 'pill') delete c.look; if (!c.look || !['orange', 'pink', 'yellow', 'green', 'blue', 'purple'].includes(c.iconColor)) delete c.iconColor; return c; },
      /** the widget REPORTS a press; the application's shared action dispatcher runs it and answers
          through respond(ok) → setState({ status }) */
      create: (c) => {
        const el = impl('action').create({
          ...c,
          // a Home Assistant binding (IniqHA) supplies its own onActivate; otherwise the app dispatcher
          onActivate: c.onActivate || ((req, meta) => el.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: {
            action: c.run === 'popup' ? { type: 'popup', popup: c.popup, label: c.name } : { type: 'demo', label: c.name },
            meta, widget: 'action',
            respond: (ok) => el.action.setState({ status: ok ? 'done' : 'failed' }),
          } }))),
        });
        return el;
      },
      constraints: (c) => impl('action').constraints(c),
    },
    camera: {
      label: 'Camera', group: 'Security', size: { w: 4, h: 4 }, glyph: G.camera,
      // Doorbell is a PRESENTATION of the same camera (chips for a mapped doorbell / motion / lock / battery), never another widget type
      variants: [{ id: 'picture', label: 'Picture', default: true }, { id: 'doorbell', label: 'Doorbell' }, { id: 'ptz', label: 'PTZ camera', preview: { w: 8, h: 8 } }],
      description: 'A camera picture that refreshes, with an enlarged view — optionally presented as a doorbell with its ring, motion, lock and battery status. No recordings or timeline.',
      defaults: { name: 'Garden', image: 'widgets/default/camera/assets/demo-garden.svg', state: 'idle', fit: 'cover', refresh: 10, showName: true },
      fields: [
        F.name(),
        F.entity('camera'),
        { key: 'fit', type: 'select', label: 'Picture fit', group: 'appearance', options: [{ value: 'cover', label: 'Cover (fill, may crop)' }, { value: 'contain', label: 'Contain (whole picture)' }] },
        { key: 'showName', type: 'boolean', label: 'Name over the picture', group: 'appearance' },
        { key: 'expandable', type: 'boolean', label: 'Enlarge button', group: 'capability', get: (c) => c.expandable !== false, set: (c, v) => { if (v) delete c.expandable; else c.expandable = false; },
          help: 'A button that opens the picture larger; it refreshes there every 3 seconds while open.' },
        // Doorbell: explicitly mapped entities (nothing is guessed from names); each shows ONLY what Home Assistant says
        ...[['ring', 'Doorbell', ['binary_sensor', 'event'], 'A doorbell binary sensor (on = pressed), or an event entity: its last event time is shown, and “just now” for a minute.'],
          ['motion', 'Motion', ['binary_sensor'], 'A motion / occupancy binary sensor: shown in Home Assistant’s own words (Detected / Clear).'],
          ['lock', 'Door lock', ['lock'], 'Its state (Locked / Unlocked…) — display only: the widget never locks or unlocks.'],
          ['battery', 'Battery', ['sensor'], 'A battery percentage sensor.']].map(([role, label, domains, help]) => ({ key: `mappings.${role}`, type: 'entity', label, group: 'doorbell', optional: true, domains, empty: 'Not mapped', help,
          when: (c) => c.variant === 'doorbell' && linkedTo(c), related: (c) => (c.entity && global.IniqHA?.related ? global.IniqHA.related(c.entity) : Promise.resolve([])) })),
        // PTZ: every control is an EXPLICITLY MAPPED entity of the camera's own integration (Home Assistant has no universal PTZ service):
        // a control exists only once its entity is mapped; nothing is guessed, no service is invented
        ...[['tiltUp', 'Tilt up', ['button', 'input_button']], ['tiltDown', 'Tilt down', ['button', 'input_button']], ['panLeft', 'Pan left', ['button', 'input_button']], ['panRight', 'Pan right', ['button', 'input_button']],
          ['zoomIn', 'Zoom in', ['button', 'input_button']], ['zoomOut', 'Zoom out', ['button', 'input_button']], ['preset', 'Position presets', ['select', 'input_select']],
          ['spotlight', 'Spotlight / light', ['light', 'switch']], ['privacy', 'Privacy mode', ['switch']], ['motion', 'Motion', ['binary_sensor']]].map(([role, label, domains]) => ({
          key: `mappings.${role}`, type: 'entity', label, group: 'ptz', optional: true, domains, empty: 'Not mapped',
          help: role === 'preset' ? 'A select entity whose options are the camera\'s positions (e.g. ONVIF / Reolink presets).' : role === 'privacy' ? 'A switch the integration provides; turning it on needs a second press.'
            : role === 'motion' ? 'Shown as an indicator — never an action.' : role === 'spotlight' ? 'A light or switch of the camera.' : 'A button entity the camera\'s integration provides for this move.',
          when: (c) => c.variant === 'ptz' && linkedTo(c), related: (c) => (c.entity && global.IniqHA?.related ? global.IniqHA.related(c.entity) : Promise.resolve([])) })),
        { key: 'demoRing', type: 'boolean', label: 'Demo: doorbell ringing', group: 'data', demo: true, when: (c) => c.variant === 'doorbell' },
        { key: 'refresh', type: 'number', label: 'Refresh every (s)', group: 'capability', min: 3, max: 300, integer: true, required: true, help: 'Home Assistant cameras: a new picture this often, only while visible' },
        { ...F.image('image', 'Demo picture', ['widgets/default/camera/assets/demo-garden.svg', 'assets/img/cameras/garden.jpg', 'assets/img/cameras/living.jpg']), demo: true },
        F.state(['idle', 'streaming', 'recording']),
        F.available(),
      ],
      normalize(c) {
        cleanMappings(c, { ring: ['binary_sensor', 'event'], motion: ['binary_sensor'], lock: ['lock'], battery: ['sensor'], ...PTZ_MAP });
        if (c.expandable !== undefined && c.expandable !== false) delete c.expandable;
        return c;
      },
      create: (c) => impl('camera').create(c.entity || !c.demoRing || c.variant !== 'doorbell' ? c : { ...c, chips: [{ key: 'ring', label: 'Doorbell', text: 'Ringing', tone: 'alert' }] }),
      constraints: () => impl('camera').constraints(),
    },
    lock: {
      label: 'Lock', group: 'Security', size: { w: 2, h: 4 }, glyph: G.lock,
      description: 'Locked / unlocked / jammed; lock and unlock (unlock asks for a second press).',
      defaults: { name: 'Front Door', state: 'locked', confirmUnlock: true, capabilities: { lock: true, unlock: true, open: false } },
      fields: [
        F.name(), F.subtitle(),
        F.entity('lock'),
        { key: 'confirmUnlock', type: 'boolean', label: 'Confirm unlock', group: 'capability', help: 'Unlock / Open need a second, deliberate press' },
        F.cap('open', 'Open (unlatch)', 'Only for locks that can unlatch the door'),
        F.state(['locked', 'unlocked', 'locking', 'unlocking', 'jammed']),
        F.available(),
      ],
      create: (c) => impl('lock').create(c),
      constraints: () => impl('lock').constraints(),
    },
    alarm: {
      label: 'Alarm', group: 'Security', size: { w: 4, h: 4 }, glyph: G.alarm,
      description: 'Alarm panel state with its supported arm modes and disarm.',
      // PRESETS (the shared Variant system): Standard is the look every existing Alarm widget keeps
      variants: [{ id: 'standard', label: 'Standard', default: true }, { id: 'keypad', label: 'Full security keypad', preview: { w: 7, h: 12 } }, { id: 'compact', label: 'Compact alarm', preview: { w: 8, h: 3 } },
        { id: 'status', label: 'Security status', preview: { w: 5, h: 4 } }, { id: 'modern', label: 'Modern alarm panel', preview: { w: 8, h: 8 } }],
      defaults: { name: 'House Alarm', state: 'disarmed', modes: ['arm_home', 'arm_away', 'arm_night'], confirmDisarm: true },
      fields: [
        F.name(), F.subtitle(),
        F.entity('alarm'),
        { key: 'modes', type: 'list', label: 'Arm modes (demo)', group: 'capability', options: () => global.MaisonAlarm?.ORDER || ['arm_home', 'arm_away'], help: 'With Home Assistant, the panel’s own supported modes are used', demo: true },
        // with a code prompt the code already is the deliberate step: the setting then does nothing (not shown)
        { key: 'confirmDisarm', type: 'boolean', label: 'Confirm disarm', group: 'capability', help: 'A second press (when Home Assistant does not ask for a code)', live: liveIf('alarm', (x, e) => !e.attrs?.code_to_disarm) },
        F.state(['disarmed', 'armed_home', 'armed_away', 'armed_night', 'armed_vacation', 'pending', 'arming', 'triggered']),
        F.available(),
      ],
      create: (c) => impl('alarm').create(c),
      constraints: () => impl('alarm').constraints(),
    },
    gauge: {
      label: 'Gauge', group: 'Sensors & Data', size: { w: 3, h: 4 }, glyph: G.gauge,
      description: 'One numeric value as an arc, a bar or a meter — temperature, humidity, battery, power, CO₂, pressure… with optional colour thresholds.',
      defaults: { name: 'Living Room', value: 21.6, unit: '°C', style: 'arc', showValue: true, showUnit: true, showMinMax: true, thresholds: 'none' },
      fields: [
        F.name(),
        { ...F.entity('gauge', (c) => { c.unit = ''; delete c.min; delete c.max; delete c.decimals; }), note: NOT_NUMERIC, help: 'A numeric entity (sensor, number, input_number, counter). Linked: its live value; unit and range come from Home Assistant unless set below.' },
        { key: 'style', type: 'select', label: 'Display', group: 'appearance', options: [{ value: 'arc', label: 'Arc gauge' }, { value: 'hbar', label: 'Horizontal bar' }, { value: 'vbar', label: 'Vertical bar' }, { value: 'value', label: 'Value with meter line' }] },
        { key: 'value', type: 'number', label: 'Value (demo)', group: 'data', step: 0.1, optional: true, when: (c) => !c.entity },
        // not optional: clearing the field stores '' (= Auto), so the demo unit cannot come back from the defaults
        F.text('unit', 'Unit', 'appearance', { optional: false, maxLength: 12, placeholder: 'Auto', help: 'Linked: empty = the entity’s own unit (Auto); anything typed here overrides it' }),
        F.num('min', 'Minimum', 'data', { step: 0.1, placeholder: 'Auto', help: 'Empty = automatic (the entity’s range, or a normal range for its unit)' }),
        F.num('max', 'Maximum', 'data', { step: 0.1, placeholder: 'Auto' }),
        { key: 'decimals', type: 'number', label: 'Decimals', group: 'appearance', optional: true, min: 0, max: 3, integer: true },
        { key: 'showValue', type: 'boolean', label: 'Show value', group: 'appearance' },
        { key: 'showUnit', type: 'boolean', label: 'Show unit', group: 'appearance' },
        { key: 'showMinMax', type: 'boolean', label: 'Show min / max labels', group: 'appearance' },
        { key: 'thresholds', type: 'select', label: 'Colour thresholds', group: 'capability', help: 'Presentation only: they colour the gauge, nothing else',
          options: [{ value: 'none', label: 'None' }, { value: 'rising', label: 'Higher is worse (e.g. power, CO₂)' }, { value: 'falling', label: 'Lower is worse (e.g. battery)' }] },
        F.num('warning', 'Warning from', 'capability', { step: 0.1, when: (c) => c.thresholds === 'rising' || c.thresholds === 'falling' }),
        F.num('critical', 'Critical from', 'capability', { step: 0.1, when: (c) => c.thresholds === 'rising' || c.thresholds === 'falling' }),
        F.available(),
      ],
      validate(c) {
        const e = [];
        const n = (v) => typeof v === 'number' && Number.isFinite(v);
        if (n(c.min) && n(c.max) && c.max <= c.min) e.push({ key: 'max', message: 'Maximum must be above minimum' });
        if ((c.thresholds === 'rising' || c.thresholds === 'falling') && !n(c.warning) && !n(c.critical)) e.push({ key: 'warning', message: 'Set a warning or a critical value (or choose no thresholds)' });
        if (c.thresholds === 'rising' && n(c.warning) && n(c.critical) && c.critical <= c.warning) e.push({ key: 'critical', message: 'Higher is worse: critical must be above warning' });
        if (c.thresholds === 'falling' && n(c.warning) && n(c.critical) && c.critical >= c.warning) e.push({ key: 'critical', message: 'Lower is worse: critical must be below warning' });
        return e;
      },
      normalize(c) { if (c.thresholds !== 'rising' && c.thresholds !== 'falling') { delete c.warning; delete c.critical; } return c; },
      create: (c) => impl('gauge').create(c),
      constraints: () => impl('gauge').constraints(),
    },
    chart: {
      label: 'Chart', group: 'Sensors & Data', size: { w: 6, h: 5 }, glyph: G.chart,
      description: 'History of one numeric value from Home Assistant (line, area or bar; 1 hour to 7 days). Demo data without Home Assistant.',
      defaults: { name: 'Living Room Temperature', unit: '°C', kind: 'line', range: '24h', showMinMax: true, showAxes: true },
      fields: [
        F.name(),
        { ...F.entity('chart', (c) => { c.unit = ''; delete c.decimals; }), note: NOT_NUMERIC, help: 'A numeric entity. Its history comes from Home Assistant’s recorder; IniqDash stores none.' },
        { key: 'kind', type: 'select', label: 'Chart type', group: 'appearance', options: [{ value: 'line', label: 'Line' }, { value: 'area', label: 'Area' }, { value: 'bar', label: 'Bar' }] },
        // WHERE THE POINTS COME FROM: recent history (the recorder, up to 7 days) or Home Assistant's long-term statistics (hourly … yearly)
        { key: 'source', type: 'select', label: 'Data', group: 'capability', get: (c) => (c.source === 'statistics' ? 'statistics' : 'history'),
          options: opts([['history', 'Recent history (last hour … 7 days)'], ['statistics', 'Long-term statistics (hourly … yearly)']]),
          set: (c, v) => { if (v === 'statistics') { c.source = 'statistics'; if (!c.period) c.period = 'day'; } else { delete c.source; delete c.period; } },
          help: 'Statistics: Home Assistant’s own hourly / daily / weekly / monthly values (entities with a state class). A total (kWh, m³) shows its consumption per period; a power (W) its average — never summed into kWh.' },
        { key: 'range', type: 'select', label: 'Period', group: 'capability', when: (c) => c.source !== 'statistics', options: [{ value: '1h', label: 'Last hour' }, { value: '6h', label: 'Last 6 hours' }, { value: '12h', label: 'Last 12 hours' }, { value: '24h', label: 'Last 24 hours' }, { value: '7d', label: 'Last 7 days' }] },
        { key: 'period', type: 'select', label: 'Period', group: 'capability', when: (c) => c.source === 'statistics', get: (c) => c.period || 'day',
          options: opts([['hour', 'Hourly — last 48 hours'], ['day', 'Daily — last 30 days'], ['week', 'Weekly — last 12 weeks'], ['month', 'Monthly — last 12 months'], ['year', 'Yearly — last 5 years (totals only)']]) },
        { key: 'count', type: 'number', label: 'Show only the last …', group: 'capability', optional: true, min: 2, max: 60, integer: true, when: (c) => c.source === 'statistics',
          placeholder: 'All', help: 'Periods, e.g. 7 days of the 30 daily values. Empty: every period Home Assistant returns.' },
        { key: 'stat', type: 'select', label: 'Value', group: 'capability', when: (c) => c.source === 'statistics', get: (c) => c.stat || 'auto', options: opts(CHART_STATS),
          set: (c, v) => { if (v === 'auto') delete c.stat; else c.stat = v; } },
        { key: 'color', type: 'color', label: 'Colour', group: 'appearance', optional: true, custom: true, options: [...INFO_COLORS, 'solar'], help: 'Default: the accent' },
        // MORE SERIES (e.g. home · solar · grid import / export, or three phases): each its own entity, label, colour; shown together
        { key: 'seriesLabel', type: 'text', label: 'Name of the first series', group: 'series', optional: true, maxLength: 24, placeholder: 'The title', when: (c) => Array.isArray(c.traces) && c.traces.length > 0 },
        CHART_TRACES,
        { key: 'legend', type: 'select', label: 'Legend', group: 'series', get: (c) => (c.legend === true ? 'on' : c.legend === false ? 'off' : 'auto'),
          options: opts([['auto', 'Automatic (with several series)'], ['on', 'Always'], ['off', 'Never']]), set: (c, v) => { if (v === 'on') c.legend = true; else if (v === 'off') c.legend = false; else delete c.legend; } },
        F.text('unit', 'Unit', 'appearance', { optional: false, maxLength: 12, placeholder: 'Auto', help: 'Linked: empty = the entity’s own unit' }),
        { key: 'decimals', type: 'number', label: 'Decimals', group: 'appearance', optional: true, min: 0, max: 3, integer: true },
        { key: 'showMinMax', type: 'boolean', label: 'Show min / max of the period', group: 'appearance' },
        { key: 'showAxes', type: 'boolean', label: 'Show axes', group: 'appearance', help: 'Drawn when the chart is large enough' },
        // CHART STYLE: how the marks are drawn (each optional; unset = the standard look)
        { key: 'colorTo', type: 'color', label: 'Gradient to', group: 'appearance', optional: true, custom: true, options: [...INFO_COLORS, 'solar'],
          help: 'A second colour: bars fade from the colour to this one; an area fades towards it. Empty: one colour.' },
        { key: 'lineWidth', type: 'range', label: 'Line thickness', group: 'appearance', unit: 'px', min: 1, max: 6, step: 0.5, get: (c) => c.lineWidth ?? 2, when: (c) => c.kind !== 'bar' },
        { key: 'smooth', type: 'boolean', label: 'Smooth curve', group: 'appearance', when: (c) => c.kind !== 'bar' },
        { key: 'fillOpacity', type: 'range', label: 'Area fill', group: 'appearance', unit: '%', min: 0, max: 100, step: 1, get: (c) => c.fillOpacity ?? 32, when: (c) => c.kind === 'area' },
        { key: 'barWidth', type: 'range', label: 'Bar width', group: 'appearance', unit: '%', min: 20, max: 100, step: 1, get: (c) => c.barWidth ?? 62, when: (c) => c.kind === 'bar',
          help: 'Of each period’s slot' },
        { key: 'barRadius', type: 'range', label: 'Bar corners', group: 'appearance', unit: 'px', min: 0, max: 16, step: 1, get: (c) => c.barRadius ?? 3, when: (c) => c.kind === 'bar' },
        { key: 'barOpacity', type: 'range', label: 'Earlier bars', group: 'appearance', unit: '%', min: 10, max: 100, step: 1, get: (c) => c.barOpacity ?? 50, when: (c) => c.kind === 'bar',
          help: 'The current period is always drawn at full strength' },
        { key: 'glow', type: 'boolean', label: 'Glow', group: 'appearance', help: 'A soft glow around the line (or the current bar)' },
        F.available(),
      ],
      normalize(c) {
        const rng = (k, a, b) => { if (c[k] !== undefined && !(typeof c[k] === 'number' && c[k] >= a && c[k] <= b)) delete c[k]; };
        rng('lineWidth', 1, 6); rng('fillOpacity', 0, 100); rng('barWidth', 20, 100); rng('barRadius', 0, 16); rng('barOpacity', 10, 100);
        ['smooth', 'glow'].forEach((k) => { if (c[k] !== undefined && typeof c[k] !== 'boolean') delete c[k]; });
        if (c.colorTo !== undefined && !(typeof c.colorTo === 'string' && /^(#[0-9a-fA-F]{6}|[a-z][a-z0-9-]{1,30})$/.test(c.colorTo))) delete c.colorTo;
        if (c.source !== undefined && c.source !== 'statistics') delete c.source;
        if (c.source !== 'statistics' || !(Number.isInteger(c.count) && c.count >= 2 && c.count <= 60)) delete c.count;
        if (c.source === 'statistics') { if (!['hour', 'day', 'week', 'month', 'year'].includes(c.period)) c.period = 'day'; } else delete c.period;
        if (c.stat !== undefined && !['change', 'mean', 'min', 'max'].includes(c.stat)) delete c.stat;
        if (c.legend !== undefined && typeof c.legend !== 'boolean') delete c.legend;
        if (c.traces !== undefined) {
          c.traces = Array.isArray(c.traces) ? c.traces.slice(0, 6).filter((x) => x && typeof x === 'object' && !Array.isArray(x)).map((x, i) => {
            const t = { id: typeof x.id === 'string' && /^[a-z][a-z0-9_-]{0,15}$/.test(x.id) ? x.id : `s${i + 1}`, entity: typeof x.entity === 'string' ? x.entity : '' };
            if (typeof x.label === 'string' && x.label.trim()) t.label = x.label.trim().slice(0, 24);
            if (typeof x.color === 'string' && /^(#[0-9a-fA-F]{6}|[a-z][a-z0-9-]{1,30})$/.test(x.color)) t.color = x.color;
            if (['change', 'mean', 'min', 'max'].includes(x.stat)) t.stat = x.stat;
            if (x.invert === true) t.invert = true;
            return t; }) : [];
          if (!c.traces.length) delete c.traces;
        }
        return c;
      },
      create: (c) => impl('chart').create(c),
      constraints: () => impl('chart').constraints(),
    },
    text: {
      label: 'Text / Label', group: 'Navigation & Content', size: { w: 4, h: 2 }, glyph: G.text,
      variants: [{ id: 'text', label: 'Text', default: true }, { id: 'heading', label: 'Heading' }],
      description: 'A heading or label (plain text), or a live line from any Home Assistant entity: name, state, unit or a simple attribute.',
      defaults: { primary: 'Living Room', secondary: 'Ground floor', align: 'left', size: 'm', emphasis: 'strong', surface: false },
      fields: [
        F.text('primary', 'Primary text', 'identity', { maxLength: 300, help: 'Linked: empty = the entity’s name. Without an entity it may hold live values: {{ value(\'sensor.outside\') }} · {{ \'Open\' if is(\'binary_sensor.door\', \'on\') else \'Closed\' }} · {{ num(\'sensor.power\') / 1000 | round(1) }} kW · updated {{ since(\'sensor.outside\') }}.',
          accept: (v) => !global.IniqTemplate || global.IniqTemplate.valid(v).ok, acceptMessage: 'this template cannot be read — check the quotes, brackets and function names' }),
        F.text('secondary', 'Secondary text', 'identity', { maxLength: 300, when: (c) => !c.entity, help: 'May hold live values too, e.g. {{ name(\'person.mia\') }} is {{ state(\'person.mia\') }}.',
          accept: (v) => !global.IniqTemplate || global.IniqTemplate.valid(v).ok, acceptMessage: 'this template cannot be read — check the quotes, brackets and function names' }),
        { ...F.entity('text'), domains: null, help: 'Optional: show a live value from any entity.', onPick: (c, e) => { if (!c.primary) c.primary = String(e.name).slice(0, 80).replace(/[<>]/g, ''); } },
        { key: 'show', type: 'select', label: 'Show', group: 'identity', when: (c) => !!c.entity && !!global.IniqHA?.enabled?.(),
          options: [{ value: 'name_state', label: 'Name, then state' }, { value: 'state_name', label: 'State, then name' }, { value: 'state', label: 'State only' }, { value: 'name_attribute', label: 'Name, then an attribute' }] },
        { key: 'attribute', type: 'select', label: 'Attribute', group: 'identity', required: true, when: (c) => !!c.entity && c.show === 'name_attribute',
          options: () => (global.IniqHA?.TEXT_ATTRS || []).map((a) => ({ value: a, label: a.replace(/_/g, ' ') })) },
        { key: 'showUnit', type: 'boolean', label: 'Show unit', group: 'identity', when: (c) => !!c.entity },
        { key: 'decimals', type: 'number', label: 'Decimals', group: 'identity', optional: true, min: 0, max: 3, integer: true, when: (c) => !!c.entity },
        { key: 'align', type: 'select', label: 'Alignment', group: 'appearance', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }] },
        // TEXT SIZE (the shared Slider + Number): the text's size at the widget's reference box — MaisonFit scales it with the widget's own size.
        // An older Small / Medium / Large / Extra large reads as the number it was drawn with (per variant); the number is stored once moved.
        { key: 'size', type: 'range', label: 'Text size', group: 'appearance', unit: 'px', min: 10, max: 80, step: 1,
          get: (c) => (typeof c.size === 'number' ? c.size : (c.variant === 'heading' ? TEXT_HEADING : TEXT_SIZES)[['s', 'm', 'l', 'xl'].includes(c.size) ? c.size : 'm']),
          help: 'At the widget’s reference size; the text follows the widget’s own size.' },
        { key: 'emphasis', type: 'select', label: 'Emphasis', group: 'appearance', options: [{ value: 'strong', label: 'Strong' }, { value: 'normal', label: 'Normal' }, { value: 'muted', label: 'Muted' }] },
        { key: 'surface', type: 'boolean', label: 'Card background', group: 'appearance', help: 'Off: the text sits directly on the dashboard' },
      ],
      validate(c) { return !c.entity && !String(c.primary || '').trim() ? [{ key: 'primary', message: 'Primary text is required (or link an entity)' }] : []; },
      normalize(c) { delete c.name; if (!c.entity) { delete c.show; delete c.attribute; } else if (c.show !== 'name_attribute') delete c.attribute; return c; },
      create: (c) => impl('text').create(c),
      constraints: () => impl('text').constraints(),
    },
    /* STUDIO WIDGET (Widget Studio POC, docs/WIDGET-STUDIO-POC.md): a widget composed in Widget Studio from the shared components — its
       configuration is a COMPONENT MODEL (never HTML), reconstructed at runtime by widgets/default/studio from the component registry.
       Created and edited in Widget Studio (not in Add). */
    studio: {
      label: 'Studio widget', group: 'Navigation & Content', size: { w: 4, h: 5 }, glyph: G.studio, hidden: true,
      description: 'A widget you composed in Widget Studio from IniqDash’s shared components.',
      defaults: { name: 'Studio widget', canvas: { w: STUDIO_CANVAS.w, h: STUDIO_CANVAS.h }, components: [] },
      // a placed copy of a reusable definition: HOME ASSISTANT — one entity per entity SLOT of the definition (its friendly names, the
      // entities its components can use), then the shared Appearance / Visibility; an older inline Studio widget: its name
      groups: [['ha', 'Home Assistant', 'The entities this copy uses'], ['copy', 'This copy', 'What this copy shows differently (empty: the widget’s own)'], ['identity', 'Identity', 'What it is']],
      fields: [
        { key: 'entities', type: 'entityslots', label: 'Entities', group: 'ha',
          slots: (c) => (c.definition && global.IniqStudioLibrary ? global.IniqStudioLibrary.slots(c.definition) : []),
          warn: (c, slotId, entity) => (global.IniqBinding && global.IniqStudioLibrary && c.definition && entity ? global.IniqBinding.slotWarning((global.IniqStudioLibrary.get(c.definition) || {}).definition, slotId, entity) : ''),
          when: (c) => !!c.definition && !!global.IniqStudioLibrary && global.IniqStudioLibrary.slots(c.definition).length > 0 },
        { key: 'settings', type: 'copysettings', label: 'Settings', group: 'copy',
          fields: (c) => (c.definition && global.IniqStudioLibrary && global.MaisonStudioWidget ? global.MaisonStudioWidget.settingFields(global.IniqStudioLibrary.model(c.definition)) : []),
          when: (c) => !!c.definition && !!global.IniqStudioLibrary && !!global.MaisonStudioWidget && ((global.IniqStudioLibrary.model(c.definition) || {}).settings || []).length > 0 },
        { ...F.name('Widget name'), group: 'identity', when: (c) => !c.definition }],
      /** while configuring a copy (Add / Edit): every slot needs its entity — a placed copy is never silently left unbound */
      validate(c, o = {}) {
        if (!o.form || !c.definition || !global.IniqStudioLibrary) return [];
        const miss = global.IniqStudioLibrary.slots(c.definition).filter((x) => x.required && !(c.entities && c.entities[x.id]));
        return miss.length ? [{ key: 'entities', message: `Choose an entity for ${miss.map((x) => x.label).join(', ')}` }] : [];
      },
      normalize: (c) => studioClean(c),
      create: (c) => impl('studio').create(c),
      constraints: (c) => impl('studio').constraints(c),
    },
    image: {
      label: 'Image', group: 'Navigation & Content', size: { w: 4, h: 4 }, glyph: G.image,
      description: 'A picture: a local or https image, or a Home Assistant image / person picture (through IniqDash). Cover or contain.',
      defaults: { name: 'Our house', src: 'widgets/default/image/assets/demo-house.svg', fit: 'cover', position: 'center', caption: false, surface: true },
      fields: [
        F.name('Name / description'),
        { ...F.entity('image'), help: 'Optional: an image.* entity or a person’s picture. Shown through IniqDash, never with Home Assistant’s address or token.' },
        { key: 'src', type: 'image', label: 'Picture', group: 'appearance', required: true, upload: true, when: (c) => !c.entity, picks: ['widgets/default/image/assets/demo-house.svg', 'widgets/default/camera/assets/demo-garden.svg', 'assets/img/media/artwork-dusk.jpg'] },
        { key: 'fit', type: 'select', label: 'Fit', group: 'appearance', options: [{ value: 'cover', label: 'Cover (fill, may crop)' }, { value: 'contain', label: 'Contain (whole picture)' }] },
        { key: 'position', type: 'select', label: 'Position', group: 'appearance', options: [{ value: 'center', label: 'Centre' }, { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
        { key: 'caption', type: 'boolean', label: 'Name over the picture', group: 'appearance' },
        { key: 'surface', type: 'boolean', label: 'Card background', group: 'appearance' },
        { key: 'slides', type: 'collection', label: 'Photo frame: more pictures', group: 'content', max: 30, itemLabel: 'picture', addLabel: '+ Add a picture', when: (c) => !c.entity,
          help: 'Shown in turn after the first picture, with a cross-fade. Local pictures (uploaded to the library) or https addresses.',
          get: (c) => (Array.isArray(c.slides) ? c.slides.map((src, i) => ({ id: `s${i + 1}`, src })) : []), set: (c, l) => { const v = l.map((x) => x && x.src).filter(Boolean); if (v.length) c.slides = v; else delete c.slides; },
          create: (list) => ({ id: `s${list.length + 1}`, src: '' }),
          fields: [{ key: 'src', type: 'image', label: 'Picture', required: true, upload: true, picks: ['widgets/default/image/assets/demo-house.svg', 'widgets/default/camera/assets/demo-garden.svg', 'assets/img/media/artwork-dusk.jpg', 'assets/img/media/artwork-tide.jpg'] }],
          summary: (x, i) => ({ icon: 'mdi:image', title: `Picture ${i + 2}`, sub: String(x.src || '').split('/').pop() }) },
        { key: 'interval', type: 'range', label: 'Change every', group: 'content', unit: 's', min: 5, max: 300, step: 5, when: (c) => !c.entity && Array.isArray(c.slides) && c.slides.length > 0,
          get: (c) => Number(c.interval) || 10, set: (c, v) => { const n = Math.round(Number(v)); if (n >= 5 && n !== 10) c.interval = Math.min(3600, n); else delete c.interval; } },
        { key: 'shuffle', type: 'boolean', label: 'Shuffle', group: 'content', when: (c) => !c.entity && Array.isArray(c.slides) && c.slides.length > 0, get: (c) => c.shuffle === true, set: (c, v) => { if (v) c.shuffle = true; else delete c.shuffle; } },
        F.available(),
      ],
      normalize(c) {
        if (c.slides !== undefined) { if (!Array.isArray(c.slides)) delete c.slides; else { c.slides = c.slides.filter((x) => typeof x === 'string' && x).slice(0, 30); if (!c.slides.length) delete c.slides; } }
        if (c.interval !== undefined) { const n = Math.round(Number(c.interval)); if (n >= 5 && n <= 3600) c.interval = n; else delete c.interval; }
        if (c.shuffle !== undefined && c.shuffle !== true) delete c.shuffle;
        return c;
      },
      create: (c) => impl('image').create(c),
      constraints: () => impl('image').constraints(),
    },
    energy: {
      label: 'Energy Flow', group: 'Energy', size: { w: 5, h: 5 }, glyph: G.energy,
      description: 'Solar, grid, home, battery and EV power flow — exactly what your mapped Home Assistant entities report.',
      defaults: { name: 'Energy', ...ENERGY_SCENARIOS.sunny },
      variants: [{ id: 'flow', label: 'Flow', default: true }, { id: 'compact', label: 'Compact' }, { id: 'circles', label: 'Connected Circles' }, { id: 'tesla', label: 'Tesla Style' }, { id: 'nodes', label: 'Node cards' }, { id: 'system', label: 'System (house at the centre)', preview: { w: 8, h: 8 } }, { id: 'house', label: 'House', preview: { w: 12, h: 7 } }],
      fields: [
        F.name('Title'), F.subtitle(),
        // ---- DYNAMIC NODES (Circles · Node cards): the diagram is built from exactly the nodes listed here
        ENERGY_NODES_FIELD,
        // the connection shape: each preset has its own default (Tesla Style: rounded right angles; the others: smooth curves) — only a choice is stored
        { key: 'lineShape', type: 'select', label: 'Connections', group: 'efnodes', half: true, when: energyDyn, get: (c) => c.lineShape || (c.variant === 'tesla' ? 'elbow' : 'curve'),
          options: opts([['curve', 'Smooth curves'], ['straight', 'Straight'], ['elbow', 'Right angles (rounded)'], ['arc', 'Arcs']]),
          set: (c, v) => { if (v === (c.variant === 'tesla' ? 'elbow' : 'curve')) delete c.lineShape; else c.lineShape = v; } },
        { key: 'flowStyle', type: 'select', label: 'Flow animation', group: 'efnodes', half: true, when: energyDyn, get: (c) => c.flowStyle || 'dots',
          options: opts([['dots', 'Moving dots'], ['arrows', 'Moving arrows'], ['dashes', 'Moving dashes'], ['pulse', 'Neon pulse'], ['none', 'None (a direction chevron)']]),
          set: (c, v) => { if (v === 'dots') delete c.flowStyle; else c.flowStyle = v; }, help: 'Moves only while Home Assistant reports a flow; 0 → still; reduced motion → still with a chevron.' },
        { key: 'glow', type: 'boolean', label: 'Neon glow', group: 'efnodes', half: true, when: energyDyn, get: (c) => c.glow === true, set: (c, v) => { if (v) c.glow = true; else delete c.glow; } },
        ...F.artwork('houseImage', 'Picture of the house', { builtins: [{ value: 'assets/img/photos/house-night.jpg', label: 'House at night' }], fallback: null, group: 'efnodes', when: (c) => c.variant === 'house' || c.variant === 'system' }),
        // ---- SYSTEM: the look of one integrated system (lines, motion, glow, nodes) and what it shows
        { key: 'routes', type: 'boolean', label: 'Routes between solar, battery and grid', group: 'efnodes', when: (c) => c.variant === 'system', get: (c) => c.routes !== false, set: (c, v) => { if (v) delete c.routes; else c.routes = false; },
          help: 'Solar → battery, solar → grid, grid → battery, battery → grid, worked out from the signed totals (solar first feeds the house, then the battery, then the grid). Shown only while solar, grid and battery all report power.' },
        { key: 'selfSufficiency', type: 'boolean', label: 'Self-powered percentage', group: 'efnodes', half: true, when: (c) => c.variant === 'system', get: (c) => c.selfSufficiency !== false, set: (c, v) => { if (v) delete c.selfSufficiency; else c.selfSufficiency = false; } },
        { key: 'lineWidth', type: 'range', label: 'Line thickness', group: 'efnodes', half: true, min: 1, max: 8, step: 1, when: (c) => c.variant === 'system', get: (c) => (typeof c.lineWidth === 'number' ? c.lineWidth : 3) },
        { key: 'flowSpeed', type: 'select', label: 'Animation speed', group: 'efnodes', half: true, when: (c) => c.variant === 'system', options: opts([['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']]),
          get: (c) => c.flowSpeed || 'normal', set: (c, v) => { if (v === 'normal') delete c.flowSpeed; else c.flowSpeed = v; }, help: 'The speed also follows the power: more watts, faster.' },
        { key: 'glowLevel', type: 'range', label: 'Glow', group: 'efnodes', half: true, min: 0, max: 100, step: 5, when: (c) => c.variant === 'system', get: (c) => (typeof c.glowLevel === 'number' ? c.glowLevel : 25) },
        { key: 'nodeSize', type: 'select', label: 'Node size', group: 'efnodes', half: true, when: (c) => c.variant === 'system', options: opts([['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]),
          get: (c) => c.nodeSize || 'm', set: (c, v) => { if (v === 'm') delete c.nodeSize; else c.nodeSize = v; } },
        { key: 'spacing', type: 'range', label: 'Spacing (%)', group: 'efnodes', half: true, min: 60, max: 160, step: 5, when: (c) => c.variant === 'system', get: (c) => (typeof c.spacing === 'number' ? c.spacing : 100),
          help: 'The distance between the house and the nodes. The whole composition is always sized to fit the card.' },
        { key: 'layout', type: 'select', label: 'Layout', group: 'efnodes', half: true, when: (c) => c.variant === 'system', options: opts([['compact', 'Compact'], ['expanded', 'Expanded']]),
          get: (c) => c.layout || 'compact', set: (c, v) => { if (v === 'expanded') c.layout = v; else delete c.layout; } },
        { key: 'showLabels', type: 'boolean', label: 'Labels', group: 'efnodes', half: true, when: (c) => c.variant === 'system', get: (c) => c.showLabels !== false, set: (c, v) => { if (v) delete c.showLabels; else c.showLabels = false; } },
        { key: 'showValues', type: 'boolean', label: 'Values', group: 'efnodes', half: true, when: (c) => c.variant === 'system', get: (c) => c.showValues !== false, set: (c, v) => { if (v) delete c.showValues; else c.showValues = false; } },
        { key: 'arrows', type: 'boolean', label: 'Direction arrows', group: 'efnodes', half: true, when: (c) => c.variant === 'system', get: (c) => c.arrows !== false, set: (c, v) => { if (v) delete c.arrows; else c.arrows = false; },
          help: 'A chevron on each line that carries power, pointing the way it flows.' },
        { key: 'lineColor', type: 'color', label: 'Line colour', group: 'efnodes', optional: true, custom: true, options: INFO_COLORS, when: (c) => c.variant === 'system', help: 'Default: each line in its source’s colour.' },
        { key: 'decimals', type: 'select', label: 'Decimals (kW)', group: 'efnodes', half: true, when: (c) => c.variant === 'system', options: opts([['', 'Automatic'], ['0', '0'], ['1', '1'], ['2', '2']]),
          get: (c) => (typeof c.decimals === 'number' ? String(c.decimals) : ''), set: (c, v) => { if (v === '') delete c.decimals; else c.decimals = Number(v); } },
        { key: 'homeLabel', type: 'text', label: 'Home label', group: 'efnodes', half: true, optional: true, maxLength: 24, placeholder: 'Home', when: energyDyn },
        // Home power: the central value (and the widget's primary entity). Never derived from the other values.
        { ...F.entity('energy'), label: 'Home power', onPick: () => {}, note: energyNote('power'),
          help: 'The home’s current power use, as Home Assistant reports it. Required to link the widget; it is never calculated from solar, grid or battery.' },
        // demo (unlinked): a few situations to look at, or your own values (W; a node shows only when it has a value)
        { key: 'demoScenario', type: 'select', label: 'Demo situation', group: 'data', demo: true, when: (c) => !(energyDyn(c) && Array.isArray(c.nodes)),
          options: [{ value: 'sunny', label: 'Sunny: solar, battery charging, exporting' }, { value: 'evening', label: 'Evening: no solar, battery discharging, importing' },
            { value: 'ev', label: 'EV charging from the grid' }, { value: 'custom', label: 'My own demo values' }],
          get: (c) => Object.entries(ENERGY_SCENARIOS).find(([, v]) => Object.keys(v).every((k) => c[k] === v[k]))?.[0] || 'custom',
          set: (c, v) => { if (ENERGY_SCENARIOS[v]) Object.assign(c, ENERGY_SCENARIOS[v]); } },
        ...[['demoHome', 'Demo home (W)'], ['demoSolar', 'Demo solar (W)'], ['demoGrid', 'Demo grid (W, + import / − export)'], ['demoBattery', 'Demo battery (W, + charging / − discharging)'],
          ['demoLevel', 'Demo battery level %'], ['demoEv', 'Demo EV (W)'], ['demoEvLevel', 'Demo EV level %']].map(([key, label]) => F.num(key, label, 'data', { step: 'any', demo: true,
          ...(/Level$/.test(key) ? { min: 0, max: 100 } : {}), when: (c) => !linkedTo(c) && (key === 'demoHome' || !(energyDyn(c) && Array.isArray(c.nodes))) })),
        // ---- linked: explicit mappings (each filtered; a remark when an entity does not look like the kind of value expected)
        energyMap('solar', 'Solar power', 'efsolar', 'power'),
        energySign('solar', 'Solar sign', 'efsolar', [['positive', 'Positive means generating'], ['negative', 'Negative means generating']], 'positive'),
        energyMap('solarToday', 'Solar today', 'efsolar', 'energy'),
        { key: 'gridMode', type: 'select', label: 'Grid', group: 'efgrid', when: (c) => linkedTo(c) && !energyDyn(c), get: (c) => (c.gridMode === 'separate' ? 'separate' : 'signed'),
          set: (c, v) => { if (v === 'separate') c.gridMode = 'separate'; else delete c.gridMode; },
          options: [{ value: 'signed', label: 'One signed power entity' }, { value: 'separate', label: 'Separate import and export entities' }],
          help: 'How your integration reports the grid. Chosen by you — never guessed from entity names.' },
        energyMap('grid', 'Grid power', 'efgrid', 'power', (c) => c.gridMode !== 'separate'),
        energySign('grid', 'Grid sign', 'efgrid', [['import', 'Positive means importing'], ['export', 'Positive means exporting']], 'import', (c) => c.gridMode !== 'separate'),
        energyMap('gridImport', 'Grid import power', 'efgrid', 'power', (c) => c.gridMode === 'separate'),
        energyMap('gridExport', 'Grid export power', 'efgrid', 'power', (c) => c.gridMode === 'separate'),
        energyMap('gridImportToday', 'Imported today', 'efgrid', 'energy'),
        energyMap('gridExportToday', 'Exported today', 'efgrid', 'energy'),
        energyMap('battery', 'Battery power', 'efbattery', 'power'),
        energySign('battery', 'Battery sign', 'efbattery', [['charge', 'Positive means charging'], ['discharge', 'Positive means discharging']], 'charge'),
        energyMap('batteryLevel', 'Battery level', 'efbattery', 'level'),
        energyMap('ev', 'EV power', 'efev', 'power'),
        energySign('ev', 'EV sign', 'efev', [['positive', 'Positive means charging'], ['negative', 'Negative means charging']], 'positive'),
        energyMap('evLevel', 'EV level', 'efev', 'level'),
        energyMap('evToday', 'EV today', 'efev', 'energy'),
        energyMap('homeToday', 'Home today', 'efhome', 'energy'),
      ],
      normalize(c) {
        if (c.houseImage !== undefined && ((c.variant !== 'house' && c.variant !== 'system') || !(typeof c.houseImage === 'string' && (c.houseImage === 'none' || SPOT_IMAGE_RE.test(c.houseImage))))) delete c.houseImage;
        if (c.gridMode !== undefined && c.gridMode !== 'separate') delete c.gridMode;
        if (c.layout !== undefined && c.layout !== 'expanded') delete c.layout;
        ['showLabels', 'showValues', 'arrows'].forEach((k) => { if (c[k] !== undefined && c[k] !== false) delete c[k]; });
        if (c.lineColor !== undefined && !(typeof c.lineColor === 'string' && (INFO_COLORS.includes(c.lineColor) || /^#[0-9a-f]{6}$/i.test(c.lineColor)))) delete c.lineColor;
        if (c.mappings !== undefined && !(c.mappings && typeof c.mappings === 'object' && !Array.isArray(c.mappings))) delete c.mappings;
        if (c.mappings) Object.keys(c.mappings).forEach((k) => { if (!ENERGY_ROLES.includes(k) || typeof c.mappings[k] !== 'string' || !c.mappings[k]) delete c.mappings[k]; });
        if (c.mappings && !Object.keys(c.mappings).length) delete c.mappings;
        if (c.signs !== undefined && !(c.signs && typeof c.signs === 'object' && !Array.isArray(c.signs))) delete c.signs;
        if (c.signs) Object.keys(c.signs).forEach((k) => { if (!(ENERGY_SIGNS[k] || []).includes(c.signs[k])) delete c.signs[k]; });
        if (c.signs && !Object.keys(c.signs).length) delete c.signs;
        if (c.nodes !== undefined) { if (Array.isArray(c.nodes) && global.MaisonEnergy?.nodesOf) c.nodes = global.MaisonEnergy.nodesOf({ nodes: c.nodes }); else if (!Array.isArray(c.nodes)) delete c.nodes; }
        if (c.lineShape !== undefined && !['curve', 'straight', 'elbow', 'arc'].includes(c.lineShape)) delete c.lineShape;
        if (c.flowStyle !== undefined && !['arrows', 'dashes', 'pulse', 'none'].includes(c.flowStyle)) delete c.flowStyle;
        if (c.glow !== undefined && c.glow !== true) delete c.glow;
        if (c.homeLabel !== undefined && !(typeof c.homeLabel === 'string' && c.homeLabel.trim())) delete c.homeLabel; else if (c.homeLabel) c.homeLabel = c.homeLabel.trim().slice(0, 24);
        // SYSTEM style (kept only inside its limits)
        const intIn = (k, a, b) => { if (c[k] !== undefined && !(Number.isInteger(c[k]) && c[k] >= a && c[k] <= b)) delete c[k]; };
        intIn('lineWidth', 1, 8); intIn('glowLevel', 0, 100); intIn('spacing', 60, 160); intIn('decimals', 0, 2);
        if (c.flowSpeed !== undefined && !['slow', 'fast'].includes(c.flowSpeed)) delete c.flowSpeed;
        if (c.nodeSize !== undefined && !['s', 'l'].includes(c.nodeSize)) delete c.nodeSize;
        if (c.routes !== undefined && c.routes !== false) delete c.routes;
        if (c.selfSufficiency !== undefined && c.selfSufficiency !== false) delete c.selfSufficiency;
        return c;
      },
      create: (c) => impl('energy').create(c),
      constraints: (c) => impl('energy').constraints(c),
    },
    appliance: {
      label: 'Appliance', group: 'Appliances & Robots', size: { w: 4, h: 3 }, glyph: G.appliance,
      description: 'Washing machine, oven, dishwasher…: state, programme, progress (demo); a Home Assistant entity for its real state.',
      defaults: { name: 'Washing Machine', subtitle: 'Utility room', icon: 'washer', state: 'running', programme: 'Cotton 40°', remaining: 42, progress: 65, image: 'widgets/default/appliance/assets/washing-machine.png', imageRatio: 300 / 360 },
      // PROFILE (what kind of appliance) is not a VARIANT (how it is presented): only a profile with presentations has variants
      variants: [{ id: 'artwork', label: 'Artwork', default: true }, { id: 'compact', label: 'Compact' }],
      variantsFor: (c) => (applianceProfile(c) === 'washer' ? ['artwork', 'compact'] : []),
      fields: [
        F.name(), F.subtitle(),
        { key: 'profile', type: 'select', label: 'Profile', group: 'identity', options: [{ value: 'generic', label: 'Generic' }, { value: 'washer', label: 'Washing Machine' }],
          get: (c) => applianceProfile(c),
          // the demo state follows into the other profile's vocabulary (a washing phase is not a Generic state, and back)
          set: (c, v) => { if (v === 'washer') { c.profile = 'washer'; if (!WASHER_CONCEPTS.includes(c.state)) c.state = 'washing'; } else { delete c.profile; if (!['running', 'paused', 'finished', 'idle', 'off', 'heating', 'error'].includes(c.state)) c.state = 'running'; } },
          help: 'What kind of appliance this is. Washing Machine: a drum that turns with the real state, and typed Home Assistant entities for programme, time left, progress… Generic: as before.' },
        { ...F.entity('appliance'), help: 'Linked: the appliance’s real Home Assistant state, in Home Assistant’s words. Programme, time left or progress are never guessed — add them as Information lines from the entities that report them.', when: (c) => !!global.IniqHA?.enabled?.() && !isWasher(c) },
        { ...F.entity('appliance'), label: 'Appliance state entity', help: 'The washing machine’s main state (Running, Spin…), in Home Assistant’s words. Required to link the mappings below; without it the widget shows demo data.', when: (c) => !!global.IniqHA?.enabled?.() && isWasher(c) },
        // ---- Generic (exactly as before)
        { key: 'actions', type: 'list', label: 'Actions', group: 'capability', optional: true, help: 'Only add actions the device really supports', demo: true, when: (c) => !isWasher(c),
          get: (c) => (c.actions || []).map((a) => a.label),
          set: (c, v) => { const L = distinct(v); if (L.length) c.actions = L.map((label) => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'action', label })); else delete c.actions; } },
        { key: 'icon', type: 'icon', label: 'Icon', group: 'appearance', options: () => keysOf(global.MaisonAppliance?.ICONS), icons: () => global.MaisonAppliance?.ICONS, when: (c) => !isWasher(c) },
        { ...F.image('image', 'Device artwork', ['widgets/default/appliance/assets/washing-machine.png']), upload: true, when: (c) => !isWasher(c) },
        { ...F.state(['running', 'paused', 'finished', 'idle', 'off', 'heating', 'error']), when: (c) => !isWasher(c) },
        // ---- Washing Machine demo (a manual preview of each visual state; never shown when linked)
        { ...F.state(['off', 'idle', 'running', 'washing', 'rinsing', 'spinning', 'paused', 'finished', 'error'].map((v) => ({ value: v, label: WASHER_LABEL[v] })), 'Demo state'), when: (c) => isWasher(c) },
        // demo values: never shown when linked (Home Assistant supplies the state; extra real values come from Information lines)
        F.text('programme', 'Programme', 'data', { demo: true }),
        F.num('remaining', 'Remaining (min)', 'data', { min: 0, max: 1440, integer: true, demo: true }),
        F.num('progress', 'Progress %', 'data', { min: 0, max: 100, integer: true, demo: true }),
        F.text('secondary', 'Secondary info', 'data', { demo: true, when: (c) => !isWasher(c) }),
        F.text('demoPower', 'Demo power', 'data', { demo: true, maxLength: 16, placeholder: 'e.g. 780 W', when: (c) => isWasher(c) }),
        { key: 'demoDoor', type: 'select', label: 'Demo door', group: 'data', optional: true, demo: true, when: (c) => isWasher(c),
          options: [{ value: '', label: 'Not shown' }, { value: 'closed', label: 'Closed' }, { value: 'open', label: 'Open' }], set: (c, v) => { if (v) c.demoDoor = v; else delete c.demoDoor; } },
        F.available(),
        // ---- Washing Machine: typed mappings — chosen explicitly by the owner (same-device entities are offered first, as suggestions)
        washerMap('program', 'Programme', 'wminfo', ['sensor', 'select', 'input_select', 'input_text'], 'The programme now running (Cotton, Eco 40–60…), shown as Home Assistant reports it.'),
        washerMap('remaining', 'Time left', 'wminfo', ['sensor'], 'A duration (minutes…), an end time (timestamp) or a text state — shown as reported, never estimated.'),
        washerMap('progress', 'Progress', 'wminfo', ['sensor', 'number', 'input_number'], 'A percentage (unit %) is drawn as the progress ring. Without a %, no ring is drawn.',
          { note: (e) => (e.unit && e.unit !== '%' ? `Unit ${e.unit}, not %: no ring` : '') }),
        washerMap('power', 'Power', 'wminfo', ['sensor'], 'Its real power reading (W / kW), as secondary information.',
          { note: (e) => (e.dc && e.dc !== 'power' ? 'Not a power sensor' : !e.dc && e.unit && !/^(m|k|M)?W$/.test(e.unit) ? 'Not a power unit' : '') }),
        washerMap('door', 'Door', 'wminfo', ['binary_sensor'], 'A door / opening contact. "Open" is only said when Home Assistant’s device class means a door or opening.'),
        washerMap('start', 'Start', 'wmctl', ['button', 'input_button', 'switch'], 'A Start button appears ONLY with this: a button is pressed, a switch is turned on. Nothing else is sent.'),
        washerMap('pause', 'Pause', 'wmctl', ['button', 'input_button', 'switch'], 'A Pause button appears ONLY with this: a button is pressed, a switch is turned on.'),
        washerMap('programSelect', 'Programme select', 'wmctl', ['select', 'input_select'], 'Choose the programme from the widget — only one of the options Home Assistant reports. Without it the programme is display-only.'),
        // ---- Washing Machine: state mapping — which REAL states mean which visual state (the profile's suggestions apply after these)
        ...['washing', 'rinsing', 'spinning', 'running', 'paused', 'finished', 'error', 'idle', 'off'].map((k) => ({
          key: `stateMap.${k}`, type: 'list', label: WASHER_LABEL[k], group: 'wmstate', optional: true, when: (c) => isWasher(c),
          help: `Home Assistant states shown as “${WASHER_LABEL[k]}” (case does not matter). Already understood without mapping: ${(global.MaisonAppliance?.PROFILES?.washer?.suggest?.[k] || []).join(', ') || '—'}. Any other state is shown in its own words with a neutral picture.`,
          set: (c, v) => { const L = distinct(v); if (L.length) setPath(c, `stateMap.${k}`, L); else if (c.stateMap) { delete c.stateMap[k]; if (!Object.keys(c.stateMap).length) delete c.stateMap; } } })),
      ],
      normalize(c) {
        if (c.profile !== undefined && c.profile !== 'washer') delete c.profile;
        if (c.mappings !== undefined && !(c.mappings && typeof c.mappings === 'object' && !Array.isArray(c.mappings))) delete c.mappings;
        if (c.mappings) Object.keys(c.mappings).forEach((k) => { if (!WASHER_ROLES.includes(k) || typeof c.mappings[k] !== 'string' || !c.mappings[k]) delete c.mappings[k]; });
        if (c.mappings && !Object.keys(c.mappings).length) delete c.mappings;
        if (c.stateMap !== undefined && !(c.stateMap && typeof c.stateMap === 'object' && !Array.isArray(c.stateMap))) delete c.stateMap;
        if (c.stateMap) Object.keys(c.stateMap).forEach((k) => { if (!WASHER_CONCEPTS.includes(k) || !Array.isArray(c.stateMap[k]) || !c.stateMap[k].length) delete c.stateMap[k]; });
        if (c.stateMap && !Object.keys(c.stateMap).length) delete c.stateMap;
        return c;
      },
      create: (c) => impl('appliance').create(c),
      constraints: (c, px) => impl('appliance').constraints(c, { span: span(px) }),
    },
    robot: {
      label: 'Robot', group: 'Appliances & Robots', size: { w: 4, h: 3 }, glyph: G.robot,
      description: 'A robot vacuum or mower: its real state and battery, and only the controls the entity supports. No maps.',
      defaults: { name: 'Vacuum', subtitle: 'Living room', profile: 'vacuum', state: 'docked', demoBattery: 82, capabilities: { start: true, pause: true, stop: true, dock: true, locate: false, spot: false, fanSpeed: false } },
      variants: [{ id: 'standard', label: 'Standard', default: true }, { id: 'compact', label: 'Compact' }, { id: 'status', label: 'Status' }],
      fields: [
        F.name(), F.subtitle(),
        { key: 'profile', type: 'select', label: 'Profile', group: 'identity', options: [{ value: 'vacuum', label: 'Vacuum' }, { value: 'mower', label: 'Mower' }],
          get: (c) => (c.profile === 'mower' ? 'mower' : 'vacuum'), demo: true,
          set: (c, v) => { c.profile = v === 'mower' ? 'mower' : 'vacuum'; c.state = 'docked'; if (v === 'mower') { c.capabilities = { ...(c.capabilities || {}), locate: false, spot: false, fanSpeed: false }; } },
          help: 'A linked widget follows the entity: a vacuum.* entity is a vacuum, a lawn_mower.* entity is a mower.' },
        { ...F.entity('robot', (c, e) => { c.profile = e.domain === 'lawn_mower' ? 'mower' : 'vacuum'; }), help: 'A vacuum.* or lawn_mower.* entity. Linked: its real state, and only the controls it supports.' },
        // demo (unlinked): look at each state; the controls offered follow the switches below
        { key: 'state', type: 'select', label: 'Demo state', group: 'data', demo: true,
          optionsFrom: (c) => (c.profile === 'mower' ? ['docked', 'mowing', 'paused', 'returning', 'error'] : ['docked', 'cleaning', 'paused', 'returning', 'idle', 'error']) },
        F.num('demoBattery', 'Demo battery %', 'data', { min: 0, max: 100, integer: true, demo: true }),
        ...['start', 'pause', 'stop', 'dock'].map((k) => F.cap(k, { start: 'Start / resume', pause: 'Pause', stop: 'Stop', dock: 'Return to dock' }[k], 'Demo: a control is offered only when the entity supports it')),
        { ...F.cap('locate', 'Locate'), when: (c) => c.profile !== 'mower' }, { ...F.cap('spot', 'Spot clean'), when: (c) => c.profile !== 'mower' },
        { key: 'mappings.battery', type: 'entity', label: 'Battery sensor', group: 'settings', optional: true, domains: ['sensor'], empty: 'Not mapped',
          help: 'Newer Home Assistant versions report a robot’s battery as its own sensor. Map it to show the level; without it the battery is shown only when the robot entity itself reports one.',
          note: (e) => (e.unit === '%' || e.dc === 'battery' ? '' : 'Not a percentage'), when: (c) => linkedTo(c),
          related: (c) => (c.entity && global.IniqHA?.related ? global.IniqHA.related(c.entity) : Promise.resolve([])) },
      ],
      normalize(c) {
        if (c.profile !== undefined && c.profile !== 'mower' && c.profile !== 'vacuum') delete c.profile;
        return cleanMappings(c, { battery: ['sensor'] });
      },
      create: (c) => impl('robot').create({ ...c, battery: c.entity || c.demoBattery === undefined ? c.battery : { state: 'ok', value: Number(c.demoBattery), source: 'demo' } }),
      constraints: (c) => impl('robot').constraints(c),
    },
    entitylist: {
      label: 'Entity List', group: 'Controls', size: { w: 4, h: 5 }, glyph: G.entitylist,
      description: 'A list of Home Assistant entities: each row shows its state in Home Assistant’s words, with a control only where the entity has an obvious one (switch, cover, scene, script, button).',
      defaults: { name: 'Entities', subtitle: '', demoRows: [{ name: 'Kitchen light', text: 'On', control: 'toggle', on: true }, { name: 'Front door', text: 'Closed' }, { name: 'Living room', text: '21.5 °C' }, { name: 'Good night', text: 'Last activated 22:10', control: 'run' }] },
      fields: [
        F.name('Title'), F.subtitle(),
        // the rows: the Information-line editor (entity · your optional label · what to show), up to 20
        { key: 'rows', type: 'infoslots', label: 'Entities', group: 'data', optional: true, max: 20, rowLabel: 'Entity', addLabel: 'Add an entity', when: () => !!global.IniqHA?.enabled?.(),
          help: 'Each row: the entity, your own optional label (otherwise Home Assistant’s name), and what to show — its state, or one of the values it reports. A control appears only for switches, lights, fans, covers, scenes, scripts and buttons, and only when you show the state.' },
        F.text('emptyText', 'Empty text', 'appearance', { placeholder: 'No entities yet', maxLength: 80 }),
        ...F.expandList('appearance'),
      ],
      normalize(c) {
        if (c.rows !== undefined && !(Array.isArray(c.rows) && c.rows.length)) delete c.rows;
        F.expandListClean(c);
        return c;
      },
      // the shape of the rows is checked whether or not Home Assistant is available here (an imported file must be well-formed)
      validate(c) {
        const out = [];
        (Array.isArray(c.rows) ? c.rows : []).forEach((x, i) => {
          if (!x || typeof x !== 'object' || typeof x.entity !== 'string' || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(x.entity) || x.entity.length > 120) out.push({ key: `rows.${i}`, message: `Entity ${i + 1}: not a Home Assistant entity id` });
          else if (x.label !== undefined && (typeof x.label !== 'string' || x.label.length > 24 || /[<>]/.test(x.label))) out.push({ key: `rows.${i}`, message: `Entity ${i + 1}: the label is at most 24 characters of plain text` });
        });
        if (Array.isArray(c.rows) && c.rows.length > 20) out.push({ key: 'rows.max', message: 'At most 20 entities' });
        return out;
      },
      create: (c) => impl('entitylist').create(c),
      constraints: (c) => impl('entitylist').constraints(c),
    },
    /* LIVE ACTIVITY (widgets/default/activity): what is ACTIVE right now — entities you map, each active by Home Assistant's own rule for
       its kind (light on, climate heating, media playing…) or by a condition you set; their look per entity > per type > default. */
    presence: {
      label: "Who's home", group: 'Controls', size: { w: 5, h: 3 }, glyph: G.presence,
      description: "The household at a glance: several people side by side — each an avatar with a ring in their presence colour (home, away, in a zone), their name and status, and how many are home. A tap opens the person's details.",
      variants: [{ id: 'row', label: 'Avatars in a row', default: true }, { id: 'list', label: 'List' }],
      defaults: { name: "Who's home" },
      fields: [
        F.name('Title'),
        { key: 'people', type: 'collection', label: 'People', group: 'data', srLabel: true, max: 8, itemLabel: 'person', addLabel: '+ Add a person', when: () => !!global.IniqHA?.enabled?.(),
          get: (c) => (Array.isArray(c.people) ? c.people : []), set: (c, l) => { if (l.length) c.people = l; else delete c.people; },
          create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`p${k}`)) k++; return { id: `p${k}`, entity: '' }; },
          entityOf: (x) => (x && typeof x.entity === 'string' && x.entity) || null,
          fields: [
            { key: 'entity', type: 'entity', label: 'Person', required: true, clear: false, empty: 'Choose a person', domains: ['person', 'device_tracker'] },
            { key: 'label', type: 'text', label: 'Name', optional: true, maxLength: 24, placeholder: "Home Assistant's name" },
          ],
          summary: (x, i, ha) => ({ icon: 'mdi:account', title: x.label || ha.name(x.entity) || x.entity || `Person ${i + 1}`, sub: x.entity || 'No person' }),
          itemErrors: (x) => (x && typeof x.entity === 'string' && /^(person|device_tracker)\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: 'entity', message: 'Choose a person' }]),
          help: 'Their pictures and presence come from Home Assistant (person or device tracker entities).' },
        { key: 'showCount', type: 'boolean', label: 'Show how many are home', group: 'appearance', get: (c) => c.showCount !== false, set: (c, v) => { if (v === false) c.showCount = false; else delete c.showCount; } },
        { key: 'showStatus', type: 'boolean', label: 'Show each status', group: 'appearance', get: (c) => c.showStatus !== false, set: (c, v) => { if (v === false) c.showStatus = false; else delete c.showStatus; } },
      ],
      normalize(c) {
        if (c.people !== undefined) { if (!Array.isArray(c.people)) delete c.people; else { c.people = c.people.filter((x) => x && typeof x === 'object' && typeof x.entity === 'string').slice(0, 8).map((x) => ({ id: typeof x.id === 'string' ? x.id.slice(0, 12) : 'p1', entity: x.entity, ...(typeof x.label === 'string' && x.label ? { label: x.label.slice(0, 24) } : {}) })); if (!c.people.length) delete c.people; } }
        return c;
      },
      validate(c) { return (Array.isArray(c.people) ? c.people : []).flatMap((x, i) => (/^(person|device_tracker)\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: `people.${i}`, message: `Person ${i + 1}: not a person or device tracker` }])); },
      create: (c) => impl('presence').create(c),
      constraints: (c) => impl('presence').constraints(c),
    },
    roomtile: {
      label: 'Room tile', group: 'Navigation & Content', size: { w: 3, h: 4 }, glyph: G.roomtile,
      description: 'A room as a photo card: humidity and lights on in chips, the temperature large, an icon in the room’s colour, its name and what it has, a chevron. Tap opens the room (set Interactions → Tap → Open popup).',
      defaults: { name: 'Living room', subtitle: 'Lights · Climate', icon: 'mdi:sofa-outline', color: 'purple', image: 'assets/img/photos/room-living.jpg' },
      fields: [
        F.name('Room'), F.subtitle(),
        { key: 'temperature', type: 'entity', label: 'Temperature', group: 'data', optional: true, domains: ['sensor', 'climate'], help: 'A temperature sensor (or a thermostat: its current temperature).' },
        { key: 'humidity', type: 'entity', label: 'Humidity', group: 'data', optional: true, domains: ['sensor'] },
        { key: 'lights', type: 'entity', label: 'Lights on (a counting sensor)', group: 'data', optional: true, domains: ['sensor'], help: 'A sensor counting the room’s lights that are on (e.g. a template sensor “1/3”). Or list the lights below and IniqDash counts them.' },
        { key: 'lightList', type: 'collection', label: 'Lights to count', group: 'data', max: 24, itemLabel: 'light', addLabel: '+ Add a light', when: (c) => !c.lights,
          help: 'The chip shows how many of these are on (e.g. 2/3), live.',
          get: (c) => (Array.isArray(c.lightList) ? c.lightList.map((id, i) => ({ id: `l${i + 1}`, entity: id })) : []), set: (c, l) => { const ids = l.map((x) => x && x.entity).filter(Boolean); if (ids.length) c.lightList = ids; else delete c.lightList; },
          create: (list) => ({ id: `l${list.length + 1}`, entity: '' }), entityOf: (x) => (x && x.entity) || null,
          fields: [{ key: 'entity', type: 'entity', label: 'Light', required: true, clear: false, empty: 'Choose a light', domains: ['light', 'switch'] }],
          summary: (x, i, ha) => ({ icon: 'mdi:lightbulb-outline', title: ha.name(x.entity) || x.entity || `Light ${i + 1}`, sub: x.entity || '' }),
          itemErrors: (x) => (x && typeof x.entity === 'string' && /^(light|switch)\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: 'entity', message: 'Choose a light' }]) },
        { key: 'icon', type: 'mdi', label: 'Icon', group: 'appearance', optional: true },
        { key: 'color', type: 'select', label: 'Icon colour', group: 'appearance', options: opts([['purple', 'Purple'], ['orange', 'Orange'], ['green', 'Green'], ['pink', 'Pink'], ['blue', 'Blue'], ['yellow', 'Yellow']]) },
        ...F.artwork('image', 'Room photo', { builtins: ROOM_PHOTOS, fallback: null }),
      ],
      normalize(c) {
        ['temperature', 'humidity', 'lights'].forEach((k) => { if (c[k] !== undefined && !(typeof c[k] === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(c[k]))) delete c[k]; });
        if (c.lightList !== undefined) { if (!Array.isArray(c.lightList)) delete c.lightList; else { c.lightList = [...new Set(c.lightList.filter((x) => typeof x === 'string' && /^(light|switch)\.[a-z0-9_]+$/.test(x)))].slice(0, 24); if (!c.lightList.length) delete c.lightList; } }
        if (c.color !== undefined && !['purple', 'orange', 'green', 'pink', 'blue', 'yellow'].includes(c.color)) delete c.color;
        if (c.icon !== undefined && !(typeof c.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(c.icon))) delete c.icon;
        if (c.image !== undefined && c.image !== 'none' && !(typeof c.image === 'string' && SPOT_IMAGE_RE.test(c.image))) delete c.image;
        return c;
      },
      create: (c) => impl('roomtile').create(c),
      constraints: (c) => impl('roomtile').constraints(c),
    },
    readings: {
      label: 'Readings', group: 'Sensors & Data', size: { w: 4, h: 3 }, glyph: G.readings,
      description: 'A few values side by side in one card — each with a coloured bar, its value large with its unit and a label (indoor and outdoor temperature, humidity, wind…).',
      defaults: { name: 'Readings', columns: 2 },
      fields: [
        F.name('Name'),
        { key: 'items', type: 'collection', label: 'Values', group: 'data', srLabel: true, max: 8, itemLabel: 'value', addLabel: '+ Add a value', when: () => !!global.IniqHA?.enabled?.(),
          get: (c) => (Array.isArray(c.items) ? c.items : []), set: (c, l) => { if (l.length) c.items = l; else delete c.items; },
          create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`v${k}`)) k++; return { id: `v${k}`, entity: '', color: 'accent' }; },
          entityOf: (x) => (x && typeof x.entity === 'string' && x.entity) || null,
          fields: [
            { key: 'entity', type: 'entity', label: 'Entity', required: true, clear: false, empty: 'Choose a sensor', domains: ['sensor', 'number', 'input_number'] },
            { key: 'label', type: 'text', label: 'Label', optional: true, maxLength: 24, placeholder: "Home Assistant's name" },
            { key: 'color', type: 'select', label: 'Bar colour', options: opts([['danger', 'Red'], ['warning', 'Orange'], ['yellow', 'Yellow'], ['success', 'Green'], ['info', 'Blue'], ['purple', 'Purple'], ['accent', 'Accent']]) },
            { key: 'decimals', type: 'number', label: 'Decimals', optional: true, min: 0, max: 3, integer: true },
          ],
          summary: (x, i, ha) => ({ icon: 'mdi:gauge', title: x.label || ha.name(x.entity) || x.entity || `Value ${i + 1}`, sub: x.entity || 'No entity' }),
          itemErrors: (x) => (x && typeof x.entity === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: 'entity', message: 'Choose a sensor' }]),
          help: 'Each value is Home Assistant’s own, with its unit.' },
        { key: 'columns', type: 'range', label: 'Columns', group: 'appearance', min: 1, max: 4, step: 1, get: (c) => (typeof c.columns === 'number' ? c.columns : 2) },
      ],
      normalize(c) {
        if (c.columns !== undefined && !(Number.isInteger(c.columns) && c.columns >= 1 && c.columns <= 4)) delete c.columns;
        if (c.items !== undefined) { if (!Array.isArray(c.items)) delete c.items; else { c.items = c.items.filter((x) => x && typeof x === 'object' && typeof x.entity === 'string').slice(0, 8).map((x, i) => ({ id: typeof x.id === 'string' ? x.id.slice(0, 12) : `v${i + 1}`, entity: x.entity,
          ...(typeof x.label === 'string' && x.label ? { label: x.label.slice(0, 24) } : {}), color: ['danger', 'warning', 'yellow', 'success', 'info', 'purple', 'accent'].includes(x.color) ? x.color : 'accent',
          ...(Number.isInteger(x.decimals) && x.decimals >= 0 && x.decimals <= 3 ? { decimals: x.decimals } : {}) })); if (!c.items.length) delete c.items; } }
        return c;
      },
      create: (c) => impl('readings').create(c),
      constraints: (c) => impl('readings').constraints(c),
    },
    batteries: {
      label: 'Batteries', group: 'Sensors & Data', size: { w: 4, h: 5 }, glyph: G.batteries,
      description: 'Every battery of the home in one card, the emptiest first: a level bar, the percentage and the device — red when low. Finds every battery sensor by itself, or shows the ones you choose.',
      defaults: { name: 'Batteries', low: 20, max: 8, only: 'all' },
      fields: [
        F.name('Name'),
        { key: 'auto', type: 'boolean', label: 'Find every battery sensor', group: 'data', get: (c) => c.auto !== false, set: (c, v) => { if (v) delete c.auto; else c.auto = false; },
          help: 'On: every sensor Home Assistant marks as a battery. Off: only the ones chosen below.' },
        { key: 'chosen', type: 'collection', label: 'Batteries', group: 'data', srLabel: true, max: 30, itemLabel: 'battery', addLabel: '+ Add a battery', when: (c) => c.auto === false && !!global.IniqHA?.enabled?.(),
          get: (c) => (Array.isArray(c.chosen) ? c.chosen : []), set: (c, l) => { if (l.length) c.chosen = l; else delete c.chosen; },
          create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`b${k}`)) k++; return { id: `b${k}`, entity: '' }; },
          entityOf: (x) => (x && typeof x.entity === 'string' && x.entity) || null,
          fields: [{ key: 'entity', type: 'entity', label: 'Battery sensor', required: true, clear: false, empty: 'Choose a battery sensor', domains: ['sensor'] }],
          summary: (x, i, ha) => ({ icon: 'mdi:battery-50', title: ha.name(x.entity) || x.entity || `Battery ${i + 1}`, sub: x.entity || 'No entity' }),
          itemErrors: (x) => (x && typeof x.entity === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: 'entity', message: 'Choose a battery sensor' }]) },
        { key: 'low', type: 'range', label: 'Low below (%)', group: 'data', min: 5, max: 50, step: 5, get: (c) => (typeof c.low === 'number' ? c.low : 20) },
        { key: 'only', type: 'select', label: 'Show', group: 'data', options: opts([['all', 'Every battery'], ['low', 'Only the low ones']]) },
        { key: 'max', type: 'range', label: 'Rows shown', group: 'appearance', min: 1, max: 30, step: 1, get: (c) => (typeof c.max === 'number' ? c.max : 8) },
      ],
      normalize(c) {
        if (c.auto !== undefined && c.auto !== false) delete c.auto;
        if (c.low !== undefined && !(Number.isInteger(c.low) && c.low >= 5 && c.low <= 50)) delete c.low;
        if (c.max !== undefined && !(Number.isInteger(c.max) && c.max >= 1 && c.max <= 30)) delete c.max;
        if (c.only !== undefined && !['all', 'low'].includes(c.only)) delete c.only;
        if (c.chosen !== undefined) { if (!Array.isArray(c.chosen)) delete c.chosen; else { c.chosen = c.chosen.filter((x) => x && typeof x === 'object' && typeof x.entity === 'string').slice(0, 30).map((x, i) => ({ id: typeof x.id === 'string' ? x.id.slice(0, 12) : `b${i + 1}`, entity: x.entity })); if (!c.chosen.length) delete c.chosen; } }
        return c;
      },
      create: (c) => impl('batteries').create(c),
      constraints: (c) => impl('batteries').constraints(c),
    },
    climategroup: {
      label: 'Climate group', group: 'Climate & Environment', size: { w: 4, h: 8 }, glyph: G.climategroup,
      description: 'Several thermostats or air-conditioning units in one card: the average temperature, one target for all of them, the modes and fan speeds they all support, and each unit with its own controls. A control is offered only when Home Assistant says the units support it.',
      defaults: { name: 'Climate' },
      fields: [
        F.name('Title'),
        { key: 'units', type: 'collection', label: 'Thermostats / units', group: 'data', max: 8, itemLabel: 'unit', addLabel: '+ Add a thermostat',
          help: 'climate.* entities. The shared target is sent to each unit within its own range and step; shared modes and fan speeds are only the ones every unit offers. No unit: a demo.',
          get: (c) => (Array.isArray(c.units) ? c.units.map((id, i) => ({ id: `u${i + 1}`, entity: id })) : []), set: (c, l) => { const ids = l.map((x) => x && x.entity).filter(Boolean); if (ids.length) c.units = ids; else delete c.units; },
          create: (list) => ({ id: `u${list.length + 1}`, entity: '' }), entityOf: (x) => (x && x.entity) || null,
          fields: [{ key: 'entity', type: 'entity', label: 'Thermostat', required: true, clear: false, empty: 'Choose a thermostat', domains: ['climate'] }],
          summary: (x, i, ha) => ({ icon: 'mdi:thermostat', title: ha.name(x.entity) || x.entity || `Unit ${i + 1}`, sub: x.entity || '' }),
          itemErrors: (x) => (x && typeof x.entity === 'string' && /^climate\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: 'entity', message: 'Choose a thermostat' }]) },
      ],
      normalize(c) {
        if (c.units !== undefined) { if (!Array.isArray(c.units)) delete c.units; else { c.units = [...new Set(c.units.filter((x) => typeof x === 'string' && /^climate\.[a-z0-9_]+$/.test(x)))].slice(0, 8); if (!c.units.length) delete c.units; } }
        return c;
      },
      create: (c) => impl('climategroup').create(c),
      constraints: (c) => impl('climategroup').constraints(c),
    },
    homebattery: {
      label: 'Home battery', group: 'Energy', size: { w: 4, h: 5 }, glyph: G.homebattery,
      description: 'A home storage battery: charge level, energy left, charging or discharging power, an estimate of the time to full or to the reserve, health, temperature and today’s in / out. Every value is an entity you choose (any integration).',
      defaults: { name: 'Home battery' },
      fields: [
        F.name('Title'),
        ...[['level', 'Charge level (%)'], ['power', 'Battery power (W / kW)'], ['capacityEntity', 'Usable capacity sensor (kWh, optional)'], ['runtime', 'Time remaining sensor (optional)'], ['health', 'State of health (%)'],
          ['temp', 'Temperature'], ['inToday', 'Charged today (kWh)'], ['outToday', 'Discharged today (kWh)']].map(([k, label]) => ({ key: `map.${k}`, type: 'entity', label, group: 'data', optional: k !== 'level', domains: ['sensor', 'number', 'input_number'] })),
        { key: 'positive', type: 'select', label: 'A positive power means', group: 'data', options: opts([['charge', 'Charging'], ['discharge', 'Discharging']]), get: (c) => c.positive || 'charge', set: (c, v) => { if (v === 'discharge') c.positive = v; else delete c.positive; },
          help: 'Integrations differ: choose what a positive value means for yours. The direction is never guessed.' },
        { key: 'capacity', type: 'number', label: 'Usable capacity (kWh) — when there is no sensor', group: 'data', optional: true, min: 0.1, max: 1000 },
        { key: 'reserve', type: 'range', label: 'Backup reserve (%)', group: 'data', min: 0, max: 80, step: 5, get: (c) => (typeof c.reserve === 'number' ? c.reserve : 0), help: 'Shown on the battery; "time to reserve" counts down to it.' },
      ],
      normalize(c) {
        const KEYS = ['level', 'power', 'capacityEntity', 'runtime', 'health', 'temp', 'inToday', 'outToday'];
        if (c.map !== undefined) { if (!c.map || typeof c.map !== 'object' || Array.isArray(c.map)) delete c.map; else { Object.keys(c.map).forEach((k) => { if (!KEYS.includes(k) || typeof c.map[k] !== 'string' || !/^(sensor|number|input_number)\.[a-z0-9_]+$/.test(c.map[k])) delete c.map[k]; }); if (!Object.keys(c.map).length) delete c.map; } }
        if (c.positive !== undefined && c.positive !== 'discharge') delete c.positive;
        if (c.capacity !== undefined && !(typeof c.capacity === 'number' && c.capacity > 0 && c.capacity <= 1000)) delete c.capacity;
        if (c.reserve !== undefined && !(Number.isInteger(c.reserve) && c.reserve >= 0 && c.reserve <= 80)) delete c.reserve;
        return c;
      },
      create: (c) => impl('homebattery').create(c),
      constraints: (c) => impl('homebattery').constraints(c),
    },
    solar: {
      label: 'Solar', group: 'Energy', size: { w: 4, h: 5 }, glyph: G.solar,
      description: 'Solar panels now and today: power now (and % of the system size), produced today against the forecast, what is still expected, tomorrow’s forecast and where the power goes. Works with any forecast integration (Forecast.Solar, Solcast…): every value is an entity you choose.',
      defaults: { name: 'Solar' },
      fields: [
        F.name('Title'),
        ...[['power', 'Solar power now (W / kW)', ['sensor']], ['today', 'Produced today (kWh)', ['sensor']], ['forecast', 'Forecast today (kWh)', ['sensor']], ['remaining', 'Forecast still to come today (kWh)', ['sensor']],
          ['tomorrow', 'Forecast tomorrow (kWh)', ['sensor']], ['toHouse', 'Solar to the house (W)', ['sensor']], ['toBattery', 'Solar to the battery (W)', ['sensor']], ['toGrid', 'Solar to the grid (W)', ['sensor']]]
          .map(([k, label, doms]) => ({ key: `map.${k}`, type: 'entity', label, group: 'data', optional: k !== 'power', domains: doms })),
        { key: 'capacity', type: 'number', label: 'System size (kWp, optional)', group: 'data', optional: true, min: 0.1, max: 10000, help: 'For the "% of the system size" figure.' },
      ],
      normalize(c) {
        const KEYS = ['power', 'today', 'forecast', 'remaining', 'tomorrow', 'toHouse', 'toBattery', 'toGrid'];
        if (c.map !== undefined) { if (!c.map || typeof c.map !== 'object' || Array.isArray(c.map)) delete c.map; else { Object.keys(c.map).forEach((k) => { if (!KEYS.includes(k) || typeof c.map[k] !== 'string' || !/^sensor\.[a-z0-9_]+$/.test(c.map[k])) delete c.map[k]; }); if (!Object.keys(c.map).length) delete c.map; } }
        if (c.capacity !== undefined && !(typeof c.capacity === 'number' && c.capacity > 0 && c.capacity <= 10000)) delete c.capacity;
        return c;
      },
      create: (c) => impl('solar').create(c),
      constraints: (c) => impl('solar').constraints(c),
    },
    todo: {
      label: 'To-do list', group: 'Time & Calendar', size: { w: 4, h: 8 }, glyph: G.todo,
      description: 'One or several Home Assistant to-do lists (shopping list, Local To-do, …): tick and untick items, add new ones, and see what is due. Adding and ticking are offered only when the list supports them.',
      defaults: { name: 'To-do' },
      fields: [
        F.name('Title'),
        { key: 'lists', type: 'collection', label: 'Lists', group: 'data', max: 6, itemLabel: 'list', addLabel: '+ Add a list',
          help: 'todo.* entities. Several lists: tabs on the card. A list that cannot be loaded says so; the others keep working. No list: a demo.',
          get: (c) => (Array.isArray(c.lists) ? c.lists.map((id, i) => ({ id: `l${i + 1}`, entity: id })) : []), set: (c, l) => { const ids = l.map((x) => x && x.entity).filter(Boolean); if (ids.length) c.lists = ids; else delete c.lists; },
          create: (list) => ({ id: `l${list.length + 1}`, entity: '' }), entityOf: (x) => (x && x.entity) || null,
          fields: [{ key: 'entity', type: 'entity', label: 'To-do list', required: true, clear: false, empty: 'Choose a list', domains: ['todo'] }],
          summary: (x, i, ha) => ({ icon: 'mdi:format-list-checks', title: ha.name(x.entity) || x.entity || `List ${i + 1}`, sub: x.entity || '' }),
          itemErrors: (x) => (x && typeof x.entity === 'string' && /^todo\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: 'entity', message: 'Choose a to-do list' }]) },
        { key: 'showDone', type: 'select', label: 'Completed items', group: 'behaviour', options: opts([['fold', 'Folded away (tap to show)'], ['show', 'Always shown'], ['hide', 'Hidden']]),
          get: (c) => c.showDone || 'fold', set: (c, v) => { if (v === 'show' || v === 'hide') c.showDone = v; else delete c.showDone; } },
      ],
      normalize(c) {
        if (c.lists !== undefined) { if (!Array.isArray(c.lists)) delete c.lists; else { c.lists = [...new Set(c.lists.filter((x) => typeof x === 'string' && /^todo\.[a-z0-9_]+$/.test(x)))].slice(0, 6); if (!c.lists.length) delete c.lists; } }
        if (c.showDone !== undefined && !['show', 'hide'].includes(c.showDone)) delete c.showDone;
        return c;
      },
      create: (c) => impl('todo').create(c),
      constraints: (c) => impl('todo').constraints(c),
    },
    updates: {
      label: 'Updates', group: 'Sensors & Data', size: { w: 4, h: 6 }, glyph: G.updates,
      description: 'The update entities you choose: which have an update waiting (installed → latest version), release notes, an install in progress, and what is already up to date. Installing always asks a second time; a backup first is offered when the update supports it.',
      defaults: { name: 'Updates' },
      fields: [
        F.name('Title'),
        { key: 'units', type: 'collection', label: 'Update entities', group: 'data', max: 20, itemLabel: 'update', addLabel: '+ Add an update entity',
          help: 'update.* entities (Home Assistant, add-ons, device firmware, …). No entity: a demo.',
          get: (c) => (Array.isArray(c.units) ? c.units.map((id, i) => ({ id: `u${i + 1}`, entity: id })) : []), set: (c, l) => { const ids = l.map((x) => x && x.entity).filter(Boolean); if (ids.length) c.units = ids; else delete c.units; },
          create: (list) => ({ id: `u${list.length + 1}`, entity: '' }), entityOf: (x) => (x && x.entity) || null,
          fields: [{ key: 'entity', type: 'entity', label: 'Update entity', required: true, clear: false, empty: 'Choose an update entity', domains: ['update'] }],
          summary: (x, i, ha) => ({ icon: 'mdi:package-up', title: ha.name(x.entity) || x.entity || `Update ${i + 1}`, sub: x.entity || '' }),
          itemErrors: (x) => (x && typeof x.entity === 'string' && /^update\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: 'entity', message: 'Choose an update entity' }]) },
        { key: 'upToDate', type: 'select', label: 'Up-to-date entities', group: 'behaviour', options: opts([['fold', 'Folded away (tap to show)'], ['show', 'Always shown'], ['hide', 'Hidden']]),
          get: (c) => c.upToDate || 'fold', set: (c, v) => { if (v === 'show' || v === 'hide') c.upToDate = v; else delete c.upToDate; } },
      ],
      normalize(c) {
        if (c.units !== undefined) { if (!Array.isArray(c.units)) delete c.units; else { c.units = [...new Set(c.units.filter((x) => typeof x === 'string' && /^update\.[a-z0-9_]+$/.test(x)))].slice(0, 20); if (!c.units.length) delete c.units; } }
        if (c.upToDate !== undefined && !['show', 'hide'].includes(c.upToDate)) delete c.upToDate;
        return c;
      },
      create: (c) => impl('updates').create(c),
      constraints: (c) => impl('updates').constraints(c),
    },
    humidifier: {
      label: 'Humidifier', group: 'Climate & Environment', size: { w: 4, h: 7 }, glyph: G.humidifier,
      description: 'A humidifier or dehumidifier: on / off, current and target humidity with −/+ inside the device’s own range, and its modes (only those it reports).',
      defaults: { name: '' },
      fields: [
        { ...F.name('Title'), required: false, optional: true, placeholder: 'The device name' },
        { key: 'unit', type: 'entity', label: 'Humidifier', group: 'data', domains: ['humidifier'], empty: 'Choose a humidifier (none: a demo)' },
        { key: 'step', type: 'range', label: 'Target step', group: 'behaviour', unit: '%', min: 1, max: 10, step: 1, get: (c) => Number(c.step) || 1, set: (c, v) => { if (Number(v) > 1) c.step = Math.round(Number(v)); else delete c.step; } },
      ],
      normalize(c) {
        if (c.unit !== undefined && !(typeof c.unit === 'string' && /^humidifier\.[a-z0-9_]+$/.test(c.unit))) delete c.unit;
        if (c.step !== undefined) { const n = Math.round(Number(c.step)); if (n >= 2 && n <= 10) c.step = n; else delete c.step; }
        return c;
      },
      create: (c) => impl('humidifier').create(c),
      constraints: (c) => impl('humidifier').constraints(c),
    },
    countdown: {
      label: 'Countdown', group: 'Time & Calendar', size: { w: 4, h: 4 }, glyph: G.countdown,
      description: 'The days, hours and minutes left until a moment: a date you type, or an entity whose state is a date or time stamp (a timestamp sensor, an input_datetime). Once it has passed: the time since, or a text of your own.',
      defaults: { name: 'Holiday' },
      fields: [
        F.name('Title'),
        { key: 'source', type: 'entity', label: 'Date from an entity (optional)', group: 'data', optional: true, domains: ['sensor', 'input_datetime'], empty: 'None: the date below',
          help: 'An entity whose STATE is a date or a time stamp. Anything else shows "—".' },
        { key: 'target', type: 'text', label: 'Date', group: 'data', optional: true, maxLength: 16, placeholder: 'YYYY-MM-DD or YYYY-MM-DDTHH:MM', when: (c) => !c.source,
          accept: (v) => v === '' || /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v), acceptMessage: 'Write the date as 2027-07-14 or 2027-07-14T18:30',
          help: 'Without a time: counts to the start of that day (in the screen’s time zone). Empty: a demo date.' },
        { key: 'after', type: 'select', label: 'When it has passed', group: 'behaviour', options: opts([['since', 'Show the time since'], ['text', 'Show a text']]),
          get: (c) => c.after || 'since', set: (c, v) => { if (v === 'text') c.after = v; else delete c.after; } },
        { key: 'afterText', type: 'text', label: 'Text', group: 'behaviour', optional: true, maxLength: 40, placeholder: 'Now!', when: (c) => c.after === 'text' },
      ],
      normalize(c) {
        if (c.source !== undefined && !(typeof c.source === 'string' && /^(sensor|input_datetime)\.[a-z0-9_]+$/.test(c.source))) delete c.source;
        if (c.target !== undefined && !(typeof c.target === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(c.target))) delete c.target;
        if (c.after !== undefined && c.after !== 'text') delete c.after;
        return c;
      },
      create: (c) => impl('countdown').create(c),
      constraints: (c) => impl('countdown').constraints(c),
    },
    vehicle: {
      label: 'Vehicle', group: 'Energy', size: { w: 4, h: 6 }, glyph: G.vehicle,
      description: 'An electric vehicle of any brand: its picture, battery and range, charging (animated, with power and time to full), the target charge and its plug, lock and climate. Several vehicles in one card. Every value comes from the entities you choose; a control appears only for an entity that supports it.',
      defaults: { name: 'Vehicle' },
      fields: [
        F.name('Title'),
        { key: 'variant', type: 'select', label: 'Layout', group: 'appearance', options: opts([['hero', 'Picture, battery and status'], ['compact', 'Compact (no picture)']]),
          get: (c) => c.variant || 'hero', set: (c, v) => { if (v === 'compact') c.variant = v; else delete c.variant; } },
        { key: 'vehicles', type: 'collection', label: 'Vehicles', group: 'data', max: 6, itemLabel: 'vehicle', addLabel: '+ Add a vehicle',
          help: 'Works with any vehicle integration: choose its entities by hand (a field left empty is simply not shown). The target charge can be changed only when it is a number entity; locking and climate only with a lock / switch / climate / button entity. No vehicle: a demo.',
          get: (c) => (Array.isArray(c.vehicles) ? c.vehicles : []), set: (c, l) => { if (l.length) c.vehicles = l; else delete c.vehicles; },
          create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`v${k}`)) k++; return { id: `v${k}`, name: `Vehicle ${k}`, battery: '' }; },
          entityOf: (x) => (x && typeof x.battery === 'string' && x.battery) || null,
          groups: [['main', 'Vehicle', ''], ['charge', 'Charging', ''], ['state', 'Status and controls', '']],
          fields: [
            { key: 'name', type: 'text', label: 'Name', group: 'main', required: true, maxLength: 40 },
            { key: 'image', type: 'image', label: 'Picture (blank: IniqDash’s own drawing)', group: 'main', optional: true },
            { key: 'battery', type: 'entity', label: 'Battery level (%)', group: 'main', required: true, clear: false, empty: 'Choose the battery sensor', domains: ['sensor'] },
            { key: 'range', type: 'entity', label: 'Range', group: 'main', optional: true, domains: ['sensor'] },
            { key: 'mileage', type: 'entity', label: 'Odometer', group: 'main', optional: true, domains: ['sensor'] },
            { key: 'charging', type: 'entity', label: 'Charging (on / off or a charging state)', group: 'charge', optional: true, domains: ['binary_sensor', 'sensor'] },
            { key: 'power', type: 'entity', label: 'Charging power', group: 'charge', optional: true, domains: ['sensor'] },
            { key: 'remaining', type: 'entity', label: 'Time to full (minutes or hours)', group: 'charge', optional: true, domains: ['sensor'] },
            { key: 'target', type: 'entity', label: 'Target charge (%)', group: 'charge', optional: true, domains: ['number', 'input_number', 'sensor'] },
            { key: 'charge', type: 'entity', label: 'Charging on / off switch', group: 'charge', optional: true, domains: ['switch', 'input_boolean'] },
            { key: 'plug', type: 'entity', label: 'Plugged in', group: 'state', optional: true, domains: ['binary_sensor', 'sensor'] },
            { key: 'lock', type: 'entity', label: 'Doors locked', group: 'state', optional: true, domains: ['lock', 'binary_sensor'] },
            { key: 'climate', type: 'entity', label: 'Climate / pre-conditioning', group: 'state', optional: true, domains: ['climate', 'switch', 'input_boolean', 'button'] },
          ],
          summary: (x, i, ha) => ({ icon: 'mdi:car-electric', title: x.name || `Vehicle ${i + 1}`, sub: x.battery || 'No battery sensor' }),
          itemErrors: (x) => [...(x && typeof x.battery === 'string' && /^sensor\.[a-z0-9_]+$/.test(x.battery) ? [] : [{ key: 'battery', message: 'Choose the battery sensor' }]),
            ...(x && typeof x.name === 'string' && x.name.trim() ? [] : [{ key: 'name', message: 'Name the vehicle' }])] },
        { key: 'show.range', type: 'boolean', label: 'Range', group: 'appearance', get: (c) => !(c.show && c.show.range === false), set: (c, v) => setShow(c, 'range', v) },
        { key: 'show.charging', type: 'boolean', label: 'Charging line', group: 'appearance', get: (c) => !(c.show && c.show.charging === false), set: (c, v) => setShow(c, 'charging', v) },
        { key: 'show.target', type: 'boolean', label: 'Target charge', group: 'appearance', get: (c) => !(c.show && c.show.target === false), set: (c, v) => setShow(c, 'target', v) },
        { key: 'show.status', type: 'boolean', label: 'Plug, lock and climate', group: 'appearance', get: (c) => !(c.show && c.show.status === false), set: (c, v) => setShow(c, 'status', v) },
      ],
      normalize(c) {
        const ID = /^[a-z_]+\.[a-z0-9_]+$/, KEYS = { battery: ['sensor'], range: ['sensor'], mileage: ['sensor'], charging: ['binary_sensor', 'sensor'], power: ['sensor'], remaining: ['sensor'],
          target: ['number', 'input_number', 'sensor'], charge: ['switch', 'input_boolean'], plug: ['binary_sensor', 'sensor'], lock: ['lock', 'binary_sensor'], climate: ['climate', 'switch', 'input_boolean', 'button'] };
        if (c.variant !== undefined && c.variant !== 'compact') delete c.variant;
        if (c.vehicles !== undefined) {
          if (!Array.isArray(c.vehicles)) delete c.vehicles;
          else {
            c.vehicles = c.vehicles.filter((x) => x && typeof x === 'object').slice(0, 6).map((x, i) => {
              const o = { id: typeof x.id === 'string' && /^[a-z0-9]{1,12}$/i.test(x.id) ? x.id : `v${i + 1}`, name: typeof x.name === 'string' && x.name.trim() ? x.name.replace(/[<>]/g, '').trim().slice(0, 40) : `Vehicle ${i + 1}` };
              if (typeof x.image === 'string' && SAFE_URL.test(x.image)) o.image = x.image;
              Object.entries(KEYS).forEach(([k, doms]) => { if (typeof x[k] === 'string' && ID.test(x[k]) && doms.includes(x[k].split('.')[0])) o[k] = x[k]; });
              return o;
            });
            if (!c.vehicles.length) delete c.vehicles;
          }
        }
        if (c.show !== undefined) {
          if (c.show && typeof c.show === 'object') { const o = {}; ['range', 'charging', 'target', 'status'].forEach((k) => { if (c.show[k] === false) o[k] = false; }); if (Object.keys(o).length) c.show = o; else delete c.show; }
          else delete c.show;
        }
        return c;
      },
      create: (c) => impl('vehicle').create(c),
      constraints: (c) => impl('vehicle').constraints(c),
    },
    devicetile: {
      label: 'Device tile', group: 'Controls', size: { w: 2, h: 3 }, glyph: G.devicetile,
      description: 'One device as a square tile: what it is doing in one word (On, Heat, Playing, Off), a switch, its icon and name, and for how long. Active, the tile fills with its colour. Lights, switches, fans, heating and speakers.',
      defaults: { name: 'Light', icon: 'mdi:lightbulb', color: 'yellow', state: 'on' },
      fields: [
        F.name(),
        { ...F.entity('devicetile'), help: 'A light, switch, fan, heating (climate) or speaker (media player). The switch turns it on or off (a speaker: play / pause).' },
        { key: 'icon', type: 'mdi', label: 'Icon', group: 'appearance', optional: true },
        { key: 'color', type: 'select', label: 'Colour when active', group: 'appearance', options: opts([['yellow', 'Warm yellow'], ['orange', 'Orange'], ['blue', 'Blue'], ['green', 'Green'], ['pink', 'Pink'], ['purple', 'Purple']]) },
        ...F.artwork('image', 'Device picture', { builtins: DEVICE_IMAGES, fallback: null }),
        { key: 'state', type: 'select', label: 'Demo state', group: 'settings', options: opts([['on', 'On'], ['off', 'Off']]), demo: true, when: (c) => !c.entity },
      ],
      normalize(c) {
        if (c.color !== undefined && !['yellow', 'orange', 'blue', 'green', 'pink', 'purple'].includes(c.color)) delete c.color;
        if (c.icon !== undefined && !(typeof c.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(c.icon))) delete c.icon;
        if (c.image !== undefined && !(typeof c.image === 'string' && SPOT_IMAGE_RE.test(c.image))) delete c.image;
        return c;
      },
      create: (c) => impl('devicetile').create(c),
      constraints: (c) => impl('devicetile').constraints(c),
    },
    activitylog: {
      label: 'Activity log', group: 'Controls', size: { w: 4, h: 7 }, glyph: G.activitylog,
      description: 'What happened lately, as a timeline: each followed entity’s latest change in plain words (Motion detected, Door closed, Unlocked), its name and area, and when — newest first.',
      defaults: { name: 'Activity', max: 6 },
      fields: [
        F.name('Title'),
        { key: 'entries', type: 'collection', label: 'Followed entities', group: 'data', srLabel: true, max: 20, itemLabel: 'entity', addLabel: '+ Add an entity', when: () => !!global.IniqHA?.enabled?.(),
          get: (c) => (Array.isArray(c.entries) ? c.entries : []), set: (c, l) => { if (l.length) c.entries = l; else delete c.entries; },
          create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`e${k}`)) k++; return { id: `e${k}`, entity: '' }; },
          entityOf: (x) => (x && typeof x.entity === 'string' && x.entity) || null,
          fields: [
            { key: 'entity', type: 'entity', label: 'Entity', required: true, clear: false, empty: 'Choose an entity', domains: ['binary_sensor', 'lock', 'light', 'switch', 'fan', 'input_boolean', 'alarm_control_panel', 'cover', 'person', 'device_tracker'] },
            { key: 'label', type: 'text', label: 'Name', optional: true, maxLength: 32, placeholder: "Home Assistant's name" },
          ],
          summary: (x, i, ha) => ({ icon: 'mdi:history', title: x.label || ha.name(x.entity) || x.entity || `Entity ${i + 1}`, sub: x.entity || 'No entity' }),
          itemErrors: (x) => (x && typeof x.entity === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: 'entity', message: 'Choose an entity' }]),
          help: 'Each row is the entity’s latest change (Home Assistant’s last changed time). Doors, windows, motion, leaks, locks, lights, the alarm, people.' },
        { key: 'max', type: 'range', label: 'Rows', group: 'appearance', min: 1, max: 20, step: 1, get: (c) => (typeof c.max === 'number' ? c.max : 6) },
        { key: 'recent', type: 'range', label: 'Highlight changes newer than', group: 'appearance', unit: 'min', min: 1, max: 120, step: 1, get: (c) => (typeof c.recent === 'number' ? c.recent : 10) },
        { key: 'link.label', type: 'text', label: 'Header link', group: 'appearance', optional: true, maxLength: 24, placeholder: 'e.g. Notifications', get: (c) => (c.link && c.link.label) || '',
          set: (c, v) => { const l = { ...(c.link || {}) }; if (v) l.label = String(v).slice(0, 24); else delete l.label; if (Object.keys(l).length) c.link = l; else delete c.link; } },
        { key: 'link.popup', type: 'select', label: 'The link opens', group: 'appearance', when: (c) => !!(c.link && c.link.label), get: (c) => (c.link && c.link.popup) || '',
          optionsFrom: () => [{ value: '', label: 'Nothing' }, ...ctxPopups().map((p) => ({ value: p.id, label: `Popup · ${p.name}` }))],
          set: (c, v) => { const l = { ...(c.link || {}) }; if (v) l.popup = v; else delete l.popup; c.link = l; } },
      ],
      normalize(c) {
        if (c.entries !== undefined) { if (!Array.isArray(c.entries)) delete c.entries; else { c.entries = c.entries.filter((x) => x && typeof x === 'object' && typeof x.entity === 'string').slice(0, 20).map((x, i) => ({ id: typeof x.id === 'string' ? x.id.slice(0, 12) : `e${i + 1}`, entity: x.entity, ...(typeof x.label === 'string' && x.label ? { label: x.label.slice(0, 32) } : {}) })); if (!c.entries.length) delete c.entries; } }
        ['max', 'recent'].forEach((k) => { if (c[k] !== undefined && !(typeof c[k] === 'number' && c[k] >= 1 && c[k] <= (k === 'max' ? 20 : 120))) delete c[k]; });
        if (c.link !== undefined) { const l = c.link && typeof c.link === 'object' ? c.link : {}, o = {}; if (typeof l.label === 'string' && l.label) o.label = l.label.slice(0, 24); if (typeof l.popup === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(l.popup)) o.popup = l.popup; if (typeof l.page === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(l.page)) o.page = l.page; if (Object.keys(o).length) c.link = o; else delete c.link; }
        return c;
      },
      validate(c) { return (Array.isArray(c.entries) ? c.entries : []).flatMap((x, i) => (/^[a-z_]+\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: `entries.${i}`, message: `Entity ${i + 1}: not an entity` }])); },
      create: (c) => impl('activitylog').create(c),
      constraints: (c) => impl('activitylog').constraints(c),
    },
    spotlight: {
      label: 'Event spotlight', group: 'Time & Calendar', size: { w: 4, h: 9 }, glyph: G.spotlight,
      description: 'The next few events of a calendar, one at a time and large: a picture and icon chosen from words in the title (waste → a bin, birthday → a cake), the category, the title, when, “1 of 3” with previous / next.',
      defaults: { name: 'Household', max: 3, chip: 'Reminder', rules: [{ id: 'r1', match: 'waste, recycling, bin', category: 'Household waste', icon: 'mdi:trash-can-outline' }, { id: 'r2', match: 'birthday', category: 'Birthday', icon: 'mdi:cake-variant' }] },
      fields: [
        F.name('Category (default)'),
        { ...F.entity('spotlight'), help: 'A calendar (for example waste collection or birthdays). Its next events, read-only.' },
        { key: 'max', type: 'range', label: 'Events', group: 'settings', min: 1, max: 10, step: 1, get: (c) => (typeof c.max === 'number' ? c.max : 3) },
        { key: 'auto', type: 'range', label: 'Advance automatically', group: 'settings', unit: 's', min: 0, max: 60, step: 1, auto: 'Off', autoValue: 0, get: (c) => (typeof c.auto === 'number' ? c.auto : 0),
          help: 'Pauses while the pointer or the keyboard is in the widget.' },
        { key: 'chip', type: 'text', label: 'Tag', group: 'appearance', optional: true, maxLength: 16, placeholder: 'Reminder', get: (c) => (typeof c.chip === 'string' ? c.chip : 'Reminder'), set: (c, v) => { c.chip = String(v || '').slice(0, 16); } },
        ...F.artwork('image', 'Default picture', { builtins: SPOT_IMAGES, fallback: null }),
        { key: 'rules', type: 'collection', label: 'Pictures by title', group: 'images', srLabel: true, max: 8, itemLabel: 'rule', addLabel: '+ Add a rule',
          get: (c) => (Array.isArray(c.rules) ? c.rules : []), set: (c, l) => { if (l.length) c.rules = l; else delete c.rules; },
          create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`r${k}`)) k++; return { id: `r${k}`, match: '' }; },
          fields: [
            { key: 'match', type: 'text', label: 'When the title contains', required: true, maxLength: 60, placeholder: 'e.g. birthday, anniversary' },
            { key: 'category', type: 'text', label: 'Category', optional: true, maxLength: 24 },
            { key: 'icon', type: 'mdi', label: 'Icon', optional: true },
            { key: 'image', type: 'select', label: 'Picture', optional: true, options: [{ value: '', label: 'The default picture' }, ...SPOT_IMAGES] },
          ],
          summary: (x, i) => ({ icon: typeof x.icon === 'string' && /^mdi:/.test(x.icon) ? x.icon : 'mdi:image-outline', title: x.match || `Rule ${i + 1}`, sub: x.category || '' }),
          itemErrors: (x) => (x && String(x.match || '').trim() ? [] : [{ key: 'match', message: 'Words to look for' }]),
          help: 'The first rule whose words appear in an event’s title gives it its picture, icon and category.' },
        { key: 'button.label', type: 'text', label: 'Corner button', group: 'appearance', optional: true, maxLength: 16, placeholder: 'e.g. Room', get: (c) => (c.button && c.button.label) || '',
          set: (c, v) => { const b = { ...(c.button || {}) }; if (v) b.label = String(v).slice(0, 16); else delete b.label; if (Object.keys(b).length) c.button = b; else delete c.button; } },
        { key: 'button.popup', type: 'select', label: 'The button opens', group: 'appearance', when: (c) => !!(c.button && c.button.label), get: (c) => (c.button && c.button.popup) || '',
          optionsFrom: () => [{ value: '', label: 'Nothing' }, ...ctxPopups().map((p) => ({ value: p.id, label: `Popup · ${p.name}` }))],
          set: (c, v) => { const b = { ...(c.button || {}) }; if (v) b.popup = v; else delete b.popup; c.button = b; } },
      ],
      normalize(c) {
        if (c.max !== undefined && !(typeof c.max === 'number' && c.max >= 1 && c.max <= 10)) delete c.max;
        if (c.auto !== undefined && !(typeof c.auto === 'number' && c.auto >= 0 && c.auto <= 60)) delete c.auto;
        if (c.chip !== undefined && typeof c.chip !== 'string') delete c.chip;
        if (c.rules !== undefined) { if (!Array.isArray(c.rules)) delete c.rules; else { c.rules = c.rules.filter((x) => x && typeof x === 'object').slice(0, 8).map((x, i) => {
          const o = { id: typeof x.id === 'string' ? x.id.slice(0, 12) : `r${i + 1}`, match: String(x.match || '').slice(0, 60) };
          if (typeof x.category === 'string' && x.category) o.category = x.category.slice(0, 24);
          if (typeof x.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(x.icon)) o.icon = x.icon;
          if (typeof x.image === 'string' && SPOT_IMAGE_RE.test(x.image)) o.image = x.image;
          return o; }); if (!c.rules.length) delete c.rules; } }
        if (c.image !== undefined && !(typeof c.image === 'string' && SPOT_IMAGE_RE.test(c.image))) delete c.image;
        if (c.button !== undefined) { const b = c.button && typeof c.button === 'object' ? c.button : {}, o = {}; if (typeof b.label === 'string' && b.label) o.label = b.label.slice(0, 16); if (typeof b.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(b.icon)) o.icon = b.icon; if (typeof b.popup === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(b.popup)) o.popup = b.popup; if (typeof b.page === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(b.page)) o.page = b.page; if (Object.keys(o).length) c.button = o; else delete c.button; }
        return c;
      },
      create: (c) => impl('spotlight').create(c),
      constraints: (c) => impl('spotlight').constraints(c),
    },
    activity: {
      label: 'Live Activity', group: 'Controls', size: { w: 4, h: 7 }, glyph: G.activity,
      description: 'A stack of activity cards: the entities you choose that are active right now (lights on, heating, alerts…), each in Home Assistant\'s own words, styled per entity or per type.',
      groups: [['identity', 'Content', 'Its title'], ['data', 'Entities', 'What is followed, and when each one counts as active'], ['types', 'Look per type', 'A colour, icon or background for every entity of a kind'],
        ['appearance', 'Appearance', 'Order, how many, the default look'], ['visibility', 'Visibility', 'Show or hide from a Home Assistant state']],
      accordion: true,
      defaults: { name: 'Live activity', demoItems: [
        { id: 'd1', entity: 'climate.demo', domain: 'climate', name: 'Pellet stove', text: 'Heating', detail: 'Demo', active: true, state: 'ready', demo: true },
        { id: 'd2', entity: 'light.demo_kitchen', domain: 'light', name: 'Kitchen light', text: 'On · 80 %', active: true, state: 'ready', demo: true },
        { id: 'd3', entity: 'binary_sensor.demo', domain: 'binary_sensor', name: 'Back door', text: 'Open', active: true, state: 'ready', demo: true }] },
      fields: [
        F.name('Title'), F.subtitle(),
        { key: 'entries', type: 'collection', label: 'Entities', group: 'data', srLabel: true, max: 20, itemLabel: 'entity', addLabel: '+ Add an entity', when: () => !!global.IniqHA?.enabled?.(),
          get: (c) => (Array.isArray(c.entries) ? c.entries : []), set: (c, l) => { if (l.length) c.entries = l; else delete c.entries; },
          create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`a${k}`)) k++; return { id: `a${k}`, entity: '', when: 'auto' }; },
          entityOf: (x) => (x && typeof x.entity === 'string' && x.entity) || null,
          fields: [
            { key: 'entity', type: 'entity', label: 'Entity', required: true, clear: false, empty: 'Choose an entity' },
            { key: 'label', type: 'text', label: 'Label', optional: true, maxLength: 24, placeholder: 'Home Assistant\'s name' },
            { key: 'when', type: 'select', label: 'Active when', options: [{ value: 'auto', label: 'Home Assistant says it is active (on, heating, playing…)' }, { value: 'state', label: 'Its state is…' }, { value: 'above', label: 'Its value is above…' }, { value: 'below', label: 'Its value is below…' }],
              get: (x) => x.when || 'auto', help: 'Automatic: lights / switches / fans on, climate heating or cooling, media playing, binary sensors on, … — Home Assistant\'s own states.' },
            { key: 'is', type: 'text', label: 'State (Home Assistant\'s word)', required: true, maxLength: 40, placeholder: 'e.g. open, home, cleaning', when: (x) => x.when === 'state', help: 'Several: separate with commas.' },
            { key: 'limit', type: 'number', label: 'Value', required: true, when: (x) => x.when === 'above' || x.when === 'below' },
            { key: 'icon', type: 'mdi', label: 'Icon (this entity)', optional: true },
            { key: 'color', type: 'color', label: 'Colour (this entity)', optional: true, options: INFO_COLORS, custom: true },
            { key: 'background', type: 'select', label: 'Card (this entity)', options: [{ value: '', label: 'As its type / the default' }, { value: 'tint', label: 'Tinted' }, { value: 'solid', label: 'Solid colour' }, { value: 'surface', label: 'Plain surface' }], get: (x) => x.background || '' , set: (x, v) => { if (v) x.background = v; else delete x.background; } },
            { key: 'badge', type: 'text', label: 'Badge', optional: true, maxLength: 12, placeholder: 'e.g. Lights' },
          ],
          summary: (x, i, ha) => ({ icon: typeof x.icon === 'string' && /^mdi:/.test(x.icon) ? x.icon : null, color: INFO_COLORS.includes(x.color) ? x.color : null, title: x.label || ha.name(x.entity) || x.entity || `Entity ${i + 1}`,
            sub: `${x.entity || 'No entity'} · ${x.when === 'state' ? `active when ${x.is || '…'}` : x.when === 'above' ? `active above ${x.limit ?? '…'}` : x.when === 'below' ? `active below ${x.limit ?? '…'}` : 'active as Home Assistant says'}` }),
          itemErrors: (x) => (x && typeof x.entity === 'string' && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: 'entity', message: 'Choose an entity' }]) },
        { key: 'types', type: 'collection', label: 'Look per type', group: 'types', srLabel: true, max: 12, itemLabel: 'type', addLabel: '+ Add a type',
          get: (c) => (Array.isArray(c.types) ? c.types : []), set: (c, l) => { if (l.length) c.types = l; else delete c.types; },
          create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`t${k}`)) k++; return { id: `t${k}`, domain: 'light' }; },
          fields: [
            { key: 'domain', type: 'select', label: 'Type', options: ['light', 'switch', 'fan', 'climate', 'binary_sensor', 'sensor', 'media_player', 'cover', 'lock', 'alarm_control_panel', 'vacuum', 'input_boolean', 'person', 'water_heater'].map((d) => ({ value: d, label: d.replace(/_/g, ' ') })) },
            { key: 'icon', type: 'mdi', label: 'Icon', optional: true },
            { key: 'color', type: 'color', label: 'Colour', optional: true, options: INFO_COLORS, custom: true },
            { key: 'background', type: 'select', label: 'Card', options: [{ value: '', label: 'As the default' }, { value: 'tint', label: 'Tinted' }, { value: 'solid', label: 'Solid colour' }, { value: 'surface', label: 'Plain surface' }], get: (x) => x.background || '', set: (x, v) => { if (v) x.background = v; else delete x.background; } },
            { key: 'badge', type: 'text', label: 'Badge', optional: true, maxLength: 12 },
          ],
          summary: (x) => ({ icon: typeof x.icon === 'string' && /^mdi:/.test(x.icon) ? x.icon : null, color: INFO_COLORS.includes(x.color) ? x.color : null, title: String(x.domain || '').replace(/_/g, ' '), sub: [x.color, x.background, x.badge].filter(Boolean).join(' · ') || 'Default look' }),
          help: 'Every entity of this type takes this look — unless the entity has its own.' },
        { key: 'show', type: 'select', label: 'Show', group: 'appearance', half: true, get: (c) => c.show || 'active', options: [{ value: 'active', label: 'Only what is active' }, { value: 'all', label: 'All (inactive dimmed)' }] },
        { key: 'order', type: 'select', label: 'Order', group: 'appearance', half: true, get: (c) => c.order || 'list', options: [{ value: 'list', label: 'Your order' }, { value: 'recent', label: 'Most recent change first' }] },
        { key: 'max', type: 'range', label: 'At most', group: 'appearance', unit: '', min: 1, max: 20, step: 1, get: (c) => (typeof c.max === 'number' ? c.max : 6) },
        { key: 'style.color', type: 'color', label: 'Default colour', group: 'appearance', optional: true, options: INFO_COLORS, custom: true },
        { key: 'style.background', type: 'select', label: 'Default card', group: 'appearance', get: (c) => (c.style && c.style.background) || 'tint', options: [{ value: 'tint', label: 'Tinted' }, { value: 'solid', label: 'Solid colour' }, { value: 'surface', label: 'Plain surface' }] },
        F.text('emptyText', 'When nothing is active', 'appearance', { placeholder: 'Nothing active right now.', maxLength: 60 }),
        ...F.expandList('appearance'),
      ],
      normalize(c) {
        const col = (v) => (INFO_COLORS.includes(v) || (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) ? v : undefined);
        const bg = (v) => (['tint', 'solid', 'surface'].includes(v) ? v : undefined);
        const look = (x, o) => { const ic = typeof x.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(x.icon) ? x.icon : undefined; if (ic) o.icon = ic; if (col(x.color)) o.color = col(x.color); if (bg(x.background)) o.background = bg(x.background);
          if (typeof x.badge === 'string' && x.badge.trim()) o.badge = x.badge.replace(/[<>]/g, '').slice(0, 12); return o; };
        if (c.entries !== undefined) {
          c.entries = (Array.isArray(c.entries) ? c.entries : []).filter((x) => x && typeof x === 'object').slice(0, 20).map((x, i) => {
            const o = { id: typeof x.id === 'string' && /^a[0-9]{1,3}$/.test(x.id) ? x.id : `a${i + 1}`, entity: typeof x.entity === 'string' ? x.entity : '' };
            if (typeof x.label === 'string' && x.label.trim()) o.label = x.label.replace(/[<>]/g, '').slice(0, 24);
            if (['state', 'above', 'below'].includes(x.when)) o.when = x.when;
            if (o.when === 'state' && typeof x.is === 'string') o.is = x.is.replace(/[<>]/g, '').slice(0, 40);
            if ((o.when === 'above' || o.when === 'below') && typeof x.limit === 'number' && Number.isFinite(x.limit)) o.limit = x.limit;
            return look(x, o);
          });
          if (!c.entries.length) delete c.entries;
        }
        if (c.types !== undefined) { c.types = (Array.isArray(c.types) ? c.types : []).filter((x) => x && typeof x.domain === 'string' && /^[a-z_]{2,30}$/.test(x.domain)).slice(0, 12).map((x, i) => look(x, { id: typeof x.id === 'string' && /^t[0-9]{1,3}$/.test(x.id) ? x.id : `t${i + 1}`, domain: x.domain })); if (!c.types.length) delete c.types; }
        if (c.style !== undefined) { const o = look(c.style || {}, {}); if (Object.keys(o).length) c.style = o; else delete c.style; }
        if (c.show !== undefined && c.show !== 'all') delete c.show;
        if (c.order !== undefined && c.order !== 'recent') delete c.order;
        if (c.max !== undefined) { if (typeof c.max === 'number' && Number.isFinite(c.max)) c.max = clampNum(c.max, 1, 20); else delete c.max; }
        F.expandListClean(c);
        return c;
      },
      create: (c) => impl('activity').create(c),
      constraints: (c) => impl('activity').constraints(c),
    },
    inbox: {
      label: 'Notification centre', group: 'Navigation & Content', size: { w: 1, h: 1 }, glyph: G.inbox,
      description: 'This dashboard\'s notifications — every notification it has shown, in this browser: a Bell with an unread counter that opens them, or a List on the dashboard itself — to read, dismiss or clear.',
      variants: [{ id: 'bell', label: 'Bell', default: true }, { id: 'list', label: 'List (on the dashboard)' }],
      defaults: { name: 'Notifications', showLabel: false },
      fields: [
        F.text('name', 'Label', 'identity', { maxLength: 40, placeholder: 'Notifications' }),
        { key: 'showLabel', type: 'boolean', label: 'Show the label beside the bell', group: 'identity', when: (c) => c.variant !== 'list' },
        { key: 'max', type: 'number', label: 'Notifications shown', group: 'appearance', optional: true, min: 1, max: 20, integer: true, placeholder: '6', when: (c) => c.variant === 'list',
          help: 'The most recent ones; the bell (another Notification centre) shows them all.' },
        { key: 'seed', type: 'collection', label: 'Starting notifications (demo)', group: 'data', max: 30, itemLabel: 'notification', addLabel: '+ Add a starting notification',
          help: 'Added once, the first time this dashboard\'s inbox is opened in a browser — marked "demo". Real notifications are added as the dashboard shows them.',
          get: (c) => (Array.isArray(c.seed) ? c.seed : []), set: (c, l) => { if (l.length) c.seed = l; else delete c.seed; },
          create: () => ({ title: 'Notification', tone: 'info', ago: 5 }),
          fields: [
            { key: 'title', type: 'text', label: 'Title', required: true, maxLength: 80 },
            { key: 'message', type: 'text', label: 'Message', optional: true, maxLength: 240 },
            { key: 'icon', type: 'mdi', label: 'Icon', optional: true },
            { key: 'tone', type: 'select', label: 'Tone', options: [{ value: 'info', label: 'Information' }, { value: 'success', label: 'Good news' }, { value: 'warning', label: 'Attention' }, { value: 'danger', label: 'Alert' }] },
            { key: 'category', type: 'text', label: 'Category', optional: true, maxLength: 24, placeholder: 'e.g. Energy' },
            { key: 'ago', type: 'number', label: 'Minutes ago', min: 0, max: 10080, step: 1 },
            { key: 'read', type: 'boolean', label: 'Already read' },
          ],
          summary: (x, i) => ({ title: x.title || `Notification ${i + 1}`, sub: [x.category, x.tone, `${x.ago || 0} min ago`].filter(Boolean).join(' · ') }) },
        { key: 'resetOn', type: 'entity', label: 'Reset to the starting notifications when this changes', group: 'data', optional: true, empty: 'Never',
          help: 'E.g. a "reset" button entity: when it is pressed, the inbox returns to its starting notifications.' },
      ],
      normalize(c) { if (c.variant !== 'list') delete c.max; else if (c.max !== undefined && !(Number.isInteger(c.max) && c.max >= 1 && c.max <= 20)) delete c.max; return c; },
      create: (c) => impl('inbox').create(c),
      constraints: (c) => impl('inbox').constraints(c),
    },
    datetime: {
      label: 'Date & Time', group: 'Time & Calendar', size: { w: 3, h: 2 }, glyph: G.datetime,
      description: 'The clock of the device showing the dashboard (or of a time zone you choose) — digital, analogue or just the date. No server, no Home Assistant.',
      variants: [{ id: 'digital', label: 'Digital', default: true }, { id: 'analogue', label: 'Analogue' }, { id: 'date', label: 'Date' }],
      defaults: { showSeconds: false, showDate: true, dateStyle: 'long' },
      fields: [
        F.text('name', 'Label', 'identity', { maxLength: 40, placeholder: 'e.g. Amsterdam' }),
        { key: 'timeZone', type: 'text', label: 'Time zone', group: 'settings', optional: true, maxLength: 60, placeholder: 'Device time zone',
          help: 'An IANA name such as Europe/Amsterdam or America/New_York. Empty: the time zone of the device that shows the dashboard.' },
        { key: 'hour12', type: 'select', label: 'Clock', group: 'settings', options: [{ value: 'auto', label: 'Device default' }, { value: '12', label: '12-hour' }, { value: '24', label: '24-hour' }], when: (c) => c.variant !== 'date',
          get: (c) => (c.hour12 === true ? '12' : c.hour12 === false ? '24' : 'auto'), set: (c, v) => { if (v === '12') c.hour12 = true; else if (v === '24') c.hour12 = false; else delete c.hour12; } },
        { key: 'showSeconds', type: 'boolean', label: 'Seconds', group: 'settings', when: (c) => c.variant !== 'date', help: 'Digital: the seconds · analogue: a second hand' },
        { key: 'showDate', type: 'boolean', label: 'Show the date', group: 'settings', when: (c) => c.variant !== 'date' },
        { key: 'dateStyle', type: 'select', label: 'Date style', group: 'settings', options: [{ value: 'long', label: 'Thursday 23 October 2026' }, { value: 'medium', label: 'Thu 23 Oct 2026' }, { value: 'short', label: '23/10/2026 (locale order)' }], when: (c) => c.variant !== 'date' && c.showDate !== false },
        { key: 'numerals', type: 'boolean', label: 'Numerals (12 · 3 · 6 · 9)', group: 'appearance', when: (c) => c.variant === 'analogue' },
      ],
      normalize(c) {
        if (c.timeZone !== undefined && (typeof c.timeZone !== 'string' || !c.timeZone.trim())) delete c.timeZone;
        if (c.hour12 !== undefined && typeof c.hour12 !== 'boolean') delete c.hour12;
        if (c.dateStyle !== undefined && !['long', 'medium', 'short'].includes(c.dateStyle)) delete c.dateStyle;
        return c;
      },
      validate(c) { return c.timeZone && !global.MaisonDateTime?.validZone(c.timeZone) ? [{ key: 'timeZone', message: `“${String(c.timeZone).slice(0, 40)}” is not a time zone name (e.g. Europe/Amsterdam)` }] : []; },
      create: (c) => impl('datetime').create(c),
      constraints: (c) => impl('datetime').constraints(c),
    },
    timer: {
      label: 'Timer', group: 'Time & Calendar', size: { w: 3, h: 4 }, glyph: G.timer,
      description: 'A Home Assistant timer: its state and time left, with Start / Pause / Cancel.',
      variants: [{ id: 'ring', label: 'Ring', default: true }, { id: 'compact', label: 'Compact' }],
      defaults: { name: 'Kitchen timer', state: 'active', duration: 600, remaining: 240 },
      fields: [
        F.name(), F.subtitle(),
        F.entity('timer'),
        // demo (unlinked): look at each state
        { ...F.state(['idle', 'active', 'paused'], 'Demo state'), get: (c) => c.state || 'idle' },
        F.num('duration', 'Demo duration (s)', 'data', { min: 1, max: 86399, integer: true, demo: true }),
        F.num('remaining', 'Demo time left (s)', 'data', { min: 0, max: 86399, integer: true, demo: true, when: (c) => c.state !== 'idle' }),
        F.available(),
      ],
      create: (c) => {
        // a demo timer that is ACTIVE counts down from its demo time left (its own, never presented as Home Assistant data)
        const x = !c.entity && c.state === 'active' && Number.isFinite(Number(c.remaining)) ? { ...c, finishesAt: Date.now() + Number(c.remaining) * 1000 } : c;
        return impl('timer').create(x);
      },
      constraints: (c) => impl('timer').constraints(c),
    },
    sunmoon: {
      label: 'Sun & Moon', group: 'Climate & Environment', size: { w: 4, h: 4 }, glyph: G.sunmoon,
      description: 'The sun as Home Assistant reports it — above or below the horizon, where it is, the next sunrise, sunset and more — and the moon phase only from entities you map.',
      variants: [{ id: 'sky', label: 'Sky', default: true }, { id: 'times', label: 'Times' }, { id: 'minimal', label: 'Minimal' }, { id: 'horizon', label: 'Horizon' },
        { id: 'atmospheric', label: 'Atmospheric' }, { id: 'detail', label: 'Solar detail' }, { id: 'moon', label: 'Sun & Moon' }, { id: 'arc', label: 'Sun arc' }],
      defaults: { name: 'Sun & Moon' },
      fields: [
        F.name('Title'), F.subtitle(),
        F.entity('sunmoon'),
        { key: 'mappings.moon', type: 'entity', label: 'Moon phase', group: 'moon', optional: true, domains: ['sensor'], empty: 'Not mapped', when: (c) => linkedTo(c),
          help: 'A sensor whose state is the moon phase (Home Assistant’s Moon integration: new_moon … waning_crescent). Shown in its own words. Without it there is no moon.' },
        { key: 'mappings.moonrise', type: 'entity', label: 'Moonrise', group: 'moon', optional: true, domains: ['sensor'], empty: 'Not mapped', when: (c) => linkedTo(c), note: (e) => (e.dc === 'timestamp' ? '' : 'Not a timestamp sensor'),
          help: 'A timestamp sensor with the next moonrise — shown in local time, as reported. Nothing is calculated.' },
        { key: 'mappings.moonset', type: 'entity', label: 'Moonset', group: 'moon', optional: true, domains: ['sensor'], empty: 'Not mapped', when: (c) => linkedTo(c), note: (e) => (e.dc === 'timestamp' ? '' : 'Not a timestamp sensor'),
          help: 'A timestamp sensor with the next moonset.' },
        { key: 'demoMoon', type: 'select', label: 'Demo moon phase', group: 'data', optional: true, demo: true, options: [{ value: '', label: 'No moon' }, ...['new_moon', 'waxing_crescent', 'first_quarter', 'waxing_gibbous', 'full_moon', 'waning_gibbous', 'last_quarter', 'waning_crescent'].map((v) => ({ value: v, label: v.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()) }))],
          set: (c, v) => { if (v) c.demoMoon = v; else delete c.demoMoon; } },
        // the SUN PATH presets' look (minimal · horizon · atmospheric · detail · moon)
        ...(() => { const arcV = (c) => ['minimal', 'horizon', 'atmospheric', 'detail', 'moon', 'arc'].includes(c.variant); return [
          { key: 'showNow', type: 'boolean', label: 'Current time under the sun', group: 'appearance', half: true, when: (c) => c.variant === 'arc', get: (c) => c.showNow !== false,
            set: (c, v) => { if (v) delete c.showNow; else c.showNow = false; } },
          { key: 'showElevation', type: 'boolean', label: 'Elevation', group: 'appearance', half: true, when: (c) => c.variant === 'arc', get: (c) => c.showElevation === true,
            set: (c, v) => { if (v) c.showElevation = true; else delete c.showElevation; }, help: 'Home Assistant’s current sun elevation, in degrees, beside the sun.' },
          { key: 'arcWidth', type: 'range', label: 'Path thickness', group: 'appearance', unit: 'px', min: 1, max: 8, step: 0.5, auto: 'Auto', autoValue: 2.5, when: (c) => arcV(c) && c.variant !== 'arc' },
          { key: 'glow', type: 'boolean', label: 'Sun glow', group: 'appearance', half: true, when: arcV, get: (c) => c.glow !== false, set: (c, v) => { if (v) delete c.glow; else c.glow = false; } },
          { key: 'showHorizon', type: 'boolean', label: 'Horizon line', group: 'appearance', half: true, when: (c) => arcV(c) && c.variant !== 'arc', get: (c) => c.showHorizon !== false, set: (c, v) => { if (v) delete c.showHorizon; else c.showHorizon = false; } },
          { key: 'showLabels', type: 'boolean', label: 'Sunrise / sunset labels', group: 'appearance', when: arcV, get: (c) => c.showLabels !== false, set: (c, v) => { if (v) delete c.showLabels; else c.showLabels = false; },
            help: 'Home Assistant\'s NEXT sunrise and sunset. Nothing is calculated: no golden hour, no day length.' },
          { key: 'sunColor', type: 'color', label: 'Sun colour', group: 'appearance', optional: true, options: INFO_COLORS, when: arcV },
          { key: 'arcColor', type: 'color', label: 'Path colour', group: 'appearance', optional: true, options: INFO_COLORS, when: arcV },
        ]; })(),
        { key: 'southern', type: 'boolean', label: 'Southern hemisphere', group: 'moon', when: (c) => !!c.mappings?.moon || !!c.demoMoon, help: 'Draws the lit side of the moon flipped. Home Assistant does not say where you are.' },
      ],
      normalize(c) {
        cleanMappings(c, { moon: ['sensor'], moonrise: ['sensor'], moonset: ['sensor'] });
        if (c.southern !== undefined && c.southern !== true) delete c.southern;
        if (c.arcWidth !== undefined) { if (typeof c.arcWidth === 'number' && Number.isFinite(c.arcWidth)) c.arcWidth = clampNum(c.arcWidth, 1, 8, 0.5); else delete c.arcWidth; }
        ['glow', 'showHorizon', 'showLabels'].forEach((k) => { if (c[k] !== undefined && c[k] !== false) delete c[k]; });
        ['sunColor', 'arcColor'].forEach((k) => { if (c[k] !== undefined && !INFO_COLORS.includes(c[k])) delete c[k]; });
        return c;
      },
      create: (c) => {
        if (c.entity) return impl('sunmoon').create(c);
        // an unlinked DEMO: a sample sun relative to now (never presented as Home Assistant data — the registry tags it Demo on a live server)
        const h = 3600000, t = Date.now();
        return impl('sunmoon').create({ ...c, sun: { state: 'above_horizon', elevation: 31, azimuth: 205, events: { rising: t + 14 * h, setting: t + 5 * h, noon: t + 23 * h, dawn: t + 13 * h, dusk: t + 6 * h, midnight: t + 11 * h } },
          moon: c.demoMoon ? { state: 'ready', available: true, phase: c.demoMoon, text: c.demoMoon.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()) } : null });
      },
      constraints: (c) => impl('sunmoon').constraints(c),
    },
    weather: {
      label: 'Weather', group: 'Climate & Environment', size: { w: 4, h: 3 }, glyph: G.weather,
      description: 'Current conditions, details and a short forecast (demo); a Home Assistant weather entity for live current conditions.',
      // PRESETS (the shared Variant system): Standard is the look every existing Weather widget keeps
      variants: [{ id: 'standard', label: 'Standard', default: true }, { id: 'current', label: 'Current conditions', preview: { w: 7, h: 4 } }, { id: 'daily', label: 'Daily forecast', preview: { w: 7, h: 9 } },
        { id: 'compact', label: 'Compact forecast', preview: { w: 10, h: 3 } }, { id: 'detailed', label: 'Detailed forecast', preview: { w: 8, h: 11 } }],
      defaults: { location: 'Home', condition: 'partly-cloudy', temperature: 14, feelsLike: 12, high: 16, low: 8, humidity: 72, wind: { speed: 14, unit: 'km/h', direction: 'SW' },
        forecast: [{ label: 'Thu', condition: 'showers', high: 13, low: 7, precipitation: 60 }, { label: 'Fri', condition: 'cloudy', high: 12, low: 6, precipitation: 20 }, { label: 'Sat', condition: 'partly-cloudy', high: 15, low: 8, precipitation: 10 }, { label: 'Sun', condition: 'clear', high: 17, low: 9, precipitation: 0 }] },
      fields: [
        { key: 'location', type: 'text', label: 'Location', group: 'identity', required: true, maxLength: 60 },
        { ...F.entity('weather', (c, e) => { c.location = String(e.name).slice(0, 60).replace(/[<>]/g, ''); delete c.name; }), help: 'A weather.* entity: its current conditions, live, and its forecast from Home Assistant (only the forecast types the entity supports).' },
        // linked: which Home Assistant forecast (weather.get_forecasts) — only the types this entity declares are offered
        { key: 'forecastType', type: 'select', label: 'Forecast', group: 'capability', when: (c) => linkedTo(c),
          get: (c) => c.forecastType || 'auto',
          set: (c, v) => { if (!v || v === 'auto') delete c.forecastType; else c.forecastType = v; },
          optionsFrom: (c) => {
            const all = { daily: 'Daily', twice_daily: 'Twice daily', hourly: 'Hourly' };
            const fx = global.IniqHA?.capabilities?.('weather', c);
            const sup = fx && fx.state === 'ready' ? global.IniqHA.forecastTypes(fx.entity) : Object.keys(all);
            const cur = c.forecastType;
            return [{ value: 'auto', label: 'Automatic' }, { value: 'off', label: 'Off' }, ...sup.map((k) => ({ value: k, label: all[k] })),
              ...(cur && all[cur] && !sup.includes(cur) ? [{ value: cur, label: `${all[cur]} (not supported by this entity: none is shown)` }] : [])];
          },
          help: 'Shown when the widget is wide enough. Automatic: the first forecast this entity supports. A forecast type the entity does not support is never filled in.' },
        { key: 'forecastRows', type: 'range', label: 'Forecast rows shown', group: 'appearance', optional: true, min: 1, max: 10, step: 1, unit: '', auto: 'Automatic', autoValue: 3,
          when: (c) => ['daily', 'detailed'].includes(c.variant), help: 'The list shows these first; its arrow reveals the rest (inside the widget — it never grows over its neighbours).' },
        { key: 'forecast', type: 'boolean', label: 'Forecast', group: 'capability', help: 'Shown when the widget is wide enough',
          get: (c) => Array.isArray(c.forecast) && c.forecast.length > 0,
          set: (c, v) => { if (v) { if (!c.forecast?.length) c.forecast = structuredClone(TYPES.weather.defaults.forecast); } else c.forecast = []; }, demo: true },
        // demo conditions: a linked weather entity supplies the real ones (these stay stored, hidden)
        { key: 'condition', type: 'select', label: 'Condition', group: 'data', options: () => global.MaisonWeather?.CONDITIONS || ['clear'], demo: true },
        { key: 'temperature', type: 'number', label: 'Temperature', group: 'data', required: true, step: 1, demo: true },
        F.num('feelsLike', 'Feels like', 'data', { step: 1, help: 'Empty = not shown', demo: true }),
        F.num('high', 'High', 'data', { step: 1, demo: true }),
        F.num('low', 'Low', 'data', { step: 1, demo: true }),
        F.num('humidity', 'Humidity %', 'data', { min: 0, max: 100, integer: true, demo: true }),
        { key: 'wind', type: 'text', label: 'Wind', group: 'data', optional: true, maxLength: 30, placeholder: '14 km/h SW', demo: true,
          get: (c) => (typeof c.wind === 'object' && c.wind ? [c.wind.speed, c.wind.unit, c.wind.direction].filter((x) => x !== undefined && x !== '').join(' ') : c.wind || ''),
          set: (c, v) => { if (String(v).trim()) c.wind = String(v).trim(); else delete c.wind; } },
        F.text('precipitation', 'Precipitation', 'data', { placeholder: '20%', maxLength: 20, demo: true }),
      ],
      validate(c) { return c.high !== undefined && c.low !== undefined && Number(c.low) > Number(c.high) ? [{ key: 'low', message: 'Low cannot be above high' }] : []; },
      create: (c) => impl('weather').create(c),
      constraints: (c) => impl('weather').constraints(c),
    },
    person: {
      label: 'Person', group: 'People', size: { w: 2, h: 2 }, glyph: G.person,
      // Portrait = the adaptive arrangement as always (a tall tile stacks, a wide one is a row); Row / Compact / Status force a presentation
      variants: [{ id: 'portrait', label: 'Portrait', default: true }, { id: 'row', label: 'Row' }, { id: 'compact', label: 'Compact' }, { id: 'status', label: 'Status' }],
      description: 'Presence: home, away or a named zone, with the device that tracks it (type and battery) — no coordinates, no history.',
      defaults: { name: 'Marcel', presence: 'home' },
      fields: [
        F.name(),
        { ...F.image('image', 'Avatar photo', ['widgets/default/person/assets/avatar-demo.jpg']), upload: true },
        F.text('initials', 'Initials', 'appearance', { maxLength: 3, help: 'Default: from the name' }),
        { key: 'icon', type: 'icon', label: 'Icon (no initials)', group: 'appearance', options: ['person', 'guest'] },
        { ...F.entity('person'), help: 'A person.* entity — or a device_tracker.* — : home, away or the zone Home Assistant reports, and the picture (through IniqDash).' },
        { key: 'showTracker', type: 'boolean', label: 'Show the tracking device', group: 'information', when: (c) => linkedTo(c),
          help: 'A line “Tracked by Pixel (GPS)” — the device_tracker Home Assistant says follows this person, how it tracks and (as a ring) its battery. Never a location.' },
        // demo values: Home Assistant supplies presence and zone; "Last seen" / "Secondary info" have no live source yet,
        // so a linked Person shows "<presence> since <time>" (HA's last_changed) instead
        { key: 'presence', type: 'select', label: 'Presence', group: 'data', options: ['home', 'away', 'zone', 'unknown'], demo: true },
        F.text('zone', 'Zone name', 'data', { when: (c) => c.presence === 'zone', required: true, demo: true }),
        F.text('lastSeen', 'Last seen (demo)', 'data', { placeholder: '18 min ago', demo: true }),
        F.text('secondary', 'Secondary info (demo)', 'data', { placeholder: 'Phone 64%', demo: true }),
        F.available(),
        // shared ProgressRing (components/widget-visuals): from ONE of the Information lines, only when Home Assistant
        // reports a percentage for it (a phone battery…). No line / not a percentage / loading → no ring.
        { key: 'ring', type: 'select', label: 'Level ring', group: 'information', optional: true,
          optionsFrom: (c) => [{ value: '', label: 'None' }, ...(linkedTo(c) ? [{ value: 'tracker', label: 'Tracker battery (when the device reports one)' }] : []), ...(Array.isArray(c.info) ? c.info : []).filter((x) => x && x.id).map((x, i) => ({ value: x.id, label: `Information ${i + 1}${x.label ? ` · ${x.label}` : ''} (${x.entity})` }))],
          when: (c) => linkedTo(c),
          help: 'A ring around the picture showing a percentage from one of the Information lines above — e.g. a phone battery. Drawn only from a real percentage; otherwise no ring.' },
      ],
      normalize(c) {
        if (c.ring !== undefined && c.ring !== 'tracker' && !(Array.isArray(c.info) && c.info.some((x) => x && x.id === c.ring))) delete c.ring;
        if (c.showTracker !== undefined && c.showTracker !== true) delete c.showTracker;
        return c;
      },
      create: (c) => impl('person').create(c),
      constraints: (c) => impl('person').constraints(c),
    },
    calendar: {
      label: 'Calendar', group: 'Time & Calendar', size: { w: 4, h: 4 }, glyph: G.calendar,
      description: 'One or several calendars in one card, each in its own colour: the next event and an agenda, or a list, day, week or month view with date navigation. A tap on an event shows its details.',
      defaults: { name: 'Family', now: NOW, view: 'agenda', demoSources: [{ key: 'a', label: 'Family', color: '#5b8def' }, { key: 'b', label: 'Work', color: '#e8697d' }], events: [
        { title: 'Design review', start: at(14, '10:00'), end: at(14, '11:00'), location: 'Studio', src: 'b' },
        { title: 'Lunch with Sam', start: at(14, '12:30'), end: at(14, '13:30'), src: 'a' },
        { title: 'Dentist', start: at(14, '16:15'), end: at(14, '16:45'), location: 'Town centre', src: 'a' },
        { title: 'Team call', start: at(14, '16:00'), end: at(14, '17:00'), src: 'b' },
        { title: 'Football training', start: at(15, '18:00'), end: at(15, '19:30'), src: 'a' },
      ] },
      fields: [
        F.name('Title'),
        { key: 'calendars', type: 'collection', label: 'Calendars', group: 'data', max: 12, itemLabel: 'calendar', addLabel: '+ Add a calendar',
          help: 'Every calendar.* entity you add is shown in the same card, merged by time — each in its own colour and with its own name. Read-only: nothing is created or changed in Home Assistant. One that cannot be loaded never hides the others. No calendar: demo events.',
          get: (c) => (Array.isArray(c.calendars) ? c.calendars : []), set: (c, l) => { if (l.length) c.calendars = l; else delete c.calendars; },
          create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`k${k}`)) k++; return { id: `k${k}`, entity: '' }; },
          entityOf: (x) => (x && typeof x.entity === 'string' && x.entity) || null,
          fields: [
            { key: 'entity', type: 'entity', label: 'Calendar', required: true, clear: false, empty: 'Choose a calendar', domains: ['calendar'] },
            { key: 'label', type: 'text', label: 'Name (blank: the calendar’s own)', optional: true, maxLength: 40 },
            { key: 'color', type: 'color', label: 'Colour', optional: true, options: INFO_COLORS, custom: true },
            { key: 'hidden', type: 'boolean', label: 'Hidden at first (a tap on its name shows it)' },
          ],
          summary: (x, i, ha) => ({ icon: 'mdi:calendar', title: x.label || ha.name(x.entity) || x.entity || `Calendar ${i + 1}`, sub: x.entity || 'No entity' }),
          itemErrors: (x) => (x && typeof x.entity === 'string' && /^calendar\.[a-z0-9_]+$/.test(x.entity) ? [] : [{ key: 'entity', message: 'Choose a calendar' }]) },
        { key: 'view', type: 'select', label: 'View', group: 'appearance', options: opts([['agenda', 'Next event and agenda'], ['list', 'List of days'], ['day', 'Day (hours)'], ['week', 'Week (hours)'], ['month', 'Month']]),
          get: (c) => c.view || 'agenda', set: (c, v) => { if (v && v !== 'agenda') c.view = v; else delete c.view; } },
        { key: 'days', type: 'range', label: 'Days in the list', group: 'appearance', min: 1, max: 62, step: 1, when: (c) => c.view === 'list', get: (c) => (typeof c.days === 'number' ? c.days : 14) },
        { key: 'weekStart', type: 'select', label: 'Week starts on', group: 'appearance', when: (c) => c.view === 'week' || c.view === 'month',
          options: opts([['', 'From the language'], ['1', 'Monday'], ['0', 'Sunday'], ['6', 'Saturday']]), get: (c) => c.weekStart || '', set: (c, v) => { if (v) c.weekStart = v; else delete c.weekStart; } },
        { key: 'dayStart', type: 'range', label: 'First hour shown', group: 'appearance', min: 0, max: 23, step: 1, when: (c) => c.view === 'day' || c.view === 'week', get: (c) => (typeof c.dayStart === 'number' ? c.dayStart : 7) },
        { key: 'dayEnd', type: 'range', label: 'Last hour shown', group: 'appearance', min: 1, max: 24, step: 1, when: (c) => c.view === 'day' || c.view === 'week', get: (c) => (typeof c.dayEnd === 'number' ? c.dayEnd : 22) },
        { key: 'legend', type: 'boolean', label: 'Calendar names (tap to show / hide one)', group: 'appearance', get: (c) => c.legend !== false, set: (c, v) => { if (v) delete c.legend; else c.legend = false; } },
        { key: 'hour12', type: 'boolean', label: '12-hour clock', group: 'appearance' },
        F.available(),
      ],
      normalize(c) {
        // a calendar made before several calendars were possible keeps its one calendar (it becomes the first of the list)
        if (typeof c.entity === 'string' && /^calendar\.[a-z0-9_]+$/.test(c.entity) && !Array.isArray(c.calendars)) c.calendars = [{ id: 'k1', entity: c.entity }];
        if (Array.isArray(c.calendars)) delete c.entity;
        if (c.calendars !== undefined) {
          if (!Array.isArray(c.calendars)) delete c.calendars;
          else {
            const seen = new Set();
            c.calendars = c.calendars.filter((x) => x && typeof x === 'object' && typeof x.entity === 'string').slice(0, 12).map((x, i) => {
              let id = typeof x.id === 'string' && /^[a-z0-9]{1,12}$/i.test(x.id) ? x.id : `k${i + 1}`; while (seen.has(id)) id = `${id}x`; seen.add(id);
              const o = { id, entity: x.entity };
              if (typeof x.label === 'string' && x.label.trim()) o.label = x.label.replace(/[<>]/g, '').trim().slice(0, 40);
              if (typeof x.color === 'string' && (INFO_COLORS.includes(x.color) || /^#[0-9a-f]{6}$/i.test(x.color))) o.color = x.color.toLowerCase();
              if (x.hidden === true) o.hidden = true;
              return o;
            });
            if (!c.calendars.length) delete c.calendars;
          }
        }
        if (c.view !== undefined && !['list', 'day', 'week', 'month'].includes(c.view)) delete c.view;
        if (c.days !== undefined && !(Number.isInteger(c.days) && c.days >= 1 && c.days <= 62)) delete c.days;
        if (c.weekStart !== undefined && !['1', '0', '6'].includes(c.weekStart)) delete c.weekStart;
        if (c.dayStart !== undefined && !(Number.isInteger(c.dayStart) && c.dayStart >= 0 && c.dayStart <= 23)) delete c.dayStart;
        if (c.dayEnd !== undefined && !(Number.isInteger(c.dayEnd) && c.dayEnd >= 1 && c.dayEnd <= 24)) delete c.dayEnd;
        if (c.dayStart !== undefined && c.dayEnd !== undefined && c.dayEnd <= c.dayStart) delete c.dayEnd;
        if (c.legend !== undefined && c.legend !== false) delete c.legend;
        return c;
      },
      create: (c) => impl('calendar').create(c),
      constraints: (c) => impl('calendar').constraints(c),
    },
    radial: {
      label: 'Radial menu', group: 'Navigation & Content', size: { w: 2, h: 3 }, glyph: G.radial,
      description: 'A centre control that opens a ring of 2 to 8 actions (pages, popups, demo actions, toggles); can float freely over the dashboard.',
      defaults: { name: 'Quick actions', count: 6, float: false, actions: RADIAL_DEFAULT.map((a) => radialAction(a)) },
      /** always 8 complete action objects (count only decides how many are shown) */
      normalize(c) {
        const list = Array.isArray(c.actions) ? c.actions : [];
        c.actions = Array.from({ length: 8 }, (_, i) => radialAction(list[i] && typeof list[i] === 'object' ? list[i] : { enabled: false }));
        if (!c.float || !['bottom-right', 'bottom-left', 'top-right', 'top-left'].includes(c.corner)) delete c.corner;
        if (!['compact', 'standard', 'wide'].includes(c.ring)) delete c.ring;
        c.actions.forEach((a) => { if (a.type !== 'navigate') delete a.page; if (a.type !== 'popup') delete a.popup; if (a.type !== 'toggle') delete a.on; if (!a.label) delete a.label; });
        return c;
      },
      fields: [
        F.name(),
        { key: 'count', type: 'select', label: 'Number of actions', group: 'capability', options: [2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: `${n} actions` })),
          get: (c) => String(c.count), set: (c, v) => { c.count = Number(v); } },
        { key: 'float', type: 'boolean', label: 'Float', group: 'capability', help: 'On: only the centre button, placed freely by X/Y over the dashboard (separate Desktop and Tablet positions; Mobile uses the normal layout). It scrolls with the dashboard.' },
        { key: 'ring', type: 'select', label: 'Ring size', group: 'capability', get: (c) => c.ring || '', set: (c, v) => { if (v) c.ring = v; else delete c.ring; },
          options: [{ value: '', label: 'Automatic — follows the widget’s size' }, { value: 'compact', label: 'Compact — icons only' }, { value: 'standard', label: 'Standard — icons and labels' }, { value: 'wide', label: 'Wide — larger, with labels' }],
          help: 'A small (e.g. floating) button can open a large ring with labels.' },
        { key: 'corner', type: 'select', label: 'Stay in a screen corner', group: 'capability', when: (c) => !!c.float,
          options: [{ value: '', label: 'No — placed by X / Y on the dashboard' }, { value: 'bottom-right', label: 'Bottom right' }, { value: 'bottom-left', label: 'Bottom left' }, { value: 'top-right', label: 'Top right' }, { value: 'top-left', label: 'Top left' }],
          get: (c) => c.corner || '', set: (c, v) => { if (v) c.corner = v; else delete c.corner; },
          help: 'While viewing, the button stays in that corner of the screen on every screen size (above a bottom navigation bar) and never scrolls away.' },
        ...radialFields(),
        F.available(),
      ],
      validate(c) {
        const e = [];
        if (!Number.isInteger(c.count) || c.count < 2 || c.count > 8) e.push({ key: 'count', message: 'Number of actions must be a whole number from 2 to 8' });
        (c.actions || []).slice(0, Number(c.count) || 8).forEach((a, i) => {
          ['enabled', 'confirm', 'keepOpen'].forEach((k) => { if (typeof a[k] !== 'boolean') e.push({ key: `actions.${i}.${k}`, message: `Action ${i + 1}: ${k} must be on or off` }); });
        });
        return e;
      },
      create: (c) => {
        const names = Object.fromEntries(ctxPages().map((p) => [p.id, p.name]));
        const pops = Object.fromEntries(ctxPopups().map((p) => [p.id, p.name]));
        const title = (a) => (a.label ? a.label : a.type === 'navigate' ? `Go to ${names[a.page] || 'page'}` : a.type === 'popup' ? `Open ${pops[a.popup] || 'popup'}` : a.type === 'toggle' ? `Local toggle: ${a.icon}` : `${a.icon} action`);
        const el = impl('radial').create({
          ...c, icons: C_ICONS(), actions: (c.actions || []).map((a) => ({ ...a, title: title(a) })),
          // the widget REPORTS; the application (MaisonApp actions) decides what the request means
          onAction: (request, meta) => el.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { ...request, meta, widget: 'radial', id: c.id } })),
        });
        return el;
      },
      constraints: () => impl('radial').constraints(),
    },
    button: (() => {
      const L = (...ls) => (c) => ls.includes(c.layout);
      return {
        label: 'Button', group: 'Navigation & Content', size: { w: 2, h: 2 }, glyph: G.button,
        description: 'A designable button: icon, image, text, value; four shapes, eight layouts; navigate, open a popup, toggle or a demo action.',
        defaults: { text: 'Button', secondary: '', value: '', unit: '', icon: 'star', image: '', shape: 'rect', layout: 'icon-left', action: 'demo', on: false, available: true },
        fields: [
          { key: 'text', type: 'text', label: 'Primary text', group: 'identity', optional: true, maxLength: 40, when: (c) => c.layout !== 'icon-only' },
          { key: 'secondary', type: 'text', label: 'Secondary text', group: 'identity', optional: true, maxLength: 60, when: L('centered', 'icon-top', 'icon-left', 'icon-right', 'image-top', 'background') },
          // linked to Home Assistant: the value layout shows the entity's real state (a static value would look live)
          { key: 'value', type: 'text', label: 'Value', group: 'identity', optional: true, maxLength: 12, numeric: true, when: L('value'), demo: (c) => c.action === 'ha' },
          { key: 'unit', type: 'text', label: 'Unit', group: 'identity', optional: true, maxLength: 8, when: L('value'), demo: (c) => c.action === 'ha' },
          { key: 'layout', type: 'select', label: 'Layout', group: 'appearance', options: [
            { value: 'centered', label: 'Centered' }, { value: 'icon-top', label: 'Icon above text' }, { value: 'icon-left', label: 'Icon left / text right' }, { value: 'icon-right', label: 'Icon right / text left' },
            { value: 'image-top', label: 'Image above text' }, { value: 'background', label: 'Background image' }, { value: 'value', label: 'Value focused' }, { value: 'icon-only', label: 'Icon only' }] },
          { key: 'shape', type: 'select', label: 'Shape', group: 'appearance', options: [{ value: 'rect', label: 'Rectangle' }, { value: 'square', label: 'Square' }, { value: 'round', label: 'Round' }, { value: 'pill', label: 'Pill' }] },
          { key: 'icon', type: 'icon', label: 'Icon', group: 'appearance', optional: true, options: () => ['', ...Object.keys(C_ICONS())], icons: C_ICONS, when: L('centered', 'icon-top', 'icon-left', 'icon-right', 'value', 'icon-only') },
          { key: 'image', type: 'image', label: 'Image', group: 'appearance', required: true, upload: true, picks: ['assets/img/media/artwork-dusk.jpg', 'assets/img/media/artwork-tide.jpg', 'widgets/default/light/assets/pendant-dome.png'], when: L('image-top', 'background') },
          { key: 'action', type: 'select', label: 'When pressed', group: 'capability',
            optionsFrom: () => [{ value: 'none', label: 'Nothing (display only)' }, { value: 'demo', label: 'Demo action' }, { value: 'popup', label: 'Open popup' }, { value: 'navigate', label: 'Navigate to page' }, { value: 'toggle', label: 'Toggle local state' },
              { value: 'ha', label: global.IniqHA?.enabled?.() ? 'Home Assistant action' : 'Home Assistant action (on the IniqDash server only)' }],
            help: 'What the press requests. The display state below is independent of it (except a Home Assistant toggle, which shows the real state).' },
          { ...F.entity('button'), group: 'capability', when: (c) => c.action === 'ha' && !!global.IniqHA?.enabled?.(), required: true, help: 'What this press triggers in Home Assistant.', describe: TRIGGER_TEXT, onPick: (c, e) => { if (!c.text) c.text = String(e.name).slice(0, 40).replace(/[<>]/g, ''); } },
          { key: 'popup', type: 'select', label: 'Popup', group: 'capability', required: true, optionsFrom: () => ctxPopups().map((p) => ({ value: p.id, label: p.name })), when: (c) => c.action === 'popup' },
          { key: 'page', type: 'select', label: 'Page', group: 'capability', required: true, optionsFrom: () => ctxPages().map((p) => ({ value: p.id, label: p.name })), when: (c) => c.action === 'navigate' },
          { key: 'on', type: 'boolean', label: 'Shown as active', group: 'data', help: 'Local demo state (a Toggle action flips it)', demo: (c) => c.action === 'ha' },
          F.available(),
        ],
        normalize(c) { if (c.action !== 'popup') delete c.popup; if (c.action !== 'navigate') delete c.page; if (c.action !== 'ha') delete c.entity; return c; },
        validate(c) { return c.layout === 'icon-only' && !c.icon ? [{ key: 'icon', message: 'Icon only needs an icon' }] : []; },
        create: (c) => {
          const el = impl('button').create({ ...c, icons: C_ICONS(),
            onPress: c.onPress || ((req, meta) => el.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action: req.action, active: req.on, meta, widget: 'button' } }))) });
          return el;
        },
        constraints: () => impl('button').constraints(),
      };
    })(),
    floating: {
      label: 'Floating container', group: 'Containers', size: { w: 6, h: 7 }, isContainer: true, isFloating: true, glyph: G.floating,
      description: 'A free design surface: its items are placed to the pixel (Desktop and Tablet), with alignment guides.',
      defaults: { title: 'Free area', subtitle: '', variant: 'primary', icon: '', mobile: 'structured' },
      fields: [
        { key: 'title', type: 'text', label: 'Title', group: 'identity', optional: true, maxLength: 60 },
        F.subtitle(),
        { key: 'mobile', type: 'select', label: 'Mobile behaviour', group: 'capability',
          options: [{ value: 'structured', label: 'Structured — the normal 4-column mobile layout' }, { value: 'hidden', label: 'Hidden on mobile' }, { value: 'floating', label: 'Keep floating — its own mobile composition' }],
          help: 'Desktop and Tablet are always free surfaces' },
        { key: 'variant', type: 'select', label: 'Variant', group: 'appearance', options: [{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }, { value: 'bare', label: 'Bare' }] },
        { key: 'icon', type: 'icon', label: 'Icon', group: 'appearance', optional: true, options: () => ['', ...Object.keys(C_ICONS())], icons: C_ICONS },
      ],
      /** content: the free surface (or, on mobile in Structured mode, the nested grid) */
      create: (c, content) => {
        const el = global.MaisonContainer.create({
          variant: c.variant, title: c.title || undefined, subtitle: c.subtitle || undefined, icon: C_ICONS()[c.icon] || undefined,
          layout: 'free', content: content ? [content] : [], fill: true,
        });
        el.classList.add('mc--floating');
        return el;
      },
      constraints: () => ({ minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }),
    },
    /* TABBED CONTAINER (components/tabs): a row of tabs, one nested grid of ordinary items per tab — a layout component like the
       Container (same places, same nesting rules), domain-agnostic: a tab is a label (+ icon, + badge), never a kind of content.
       Its items carry `tab` (model.js); the editor edits one tab at a time. */
    tabs: {
      label: 'Tabbed container', group: 'Containers', size: { w: 12, h: 10 }, isContainer: true, isTabs: true, glyph: G.tabs,
      description: 'Tabs, each with its own area of widgets — only the selected tab is shown.',
      groups: [['content', 'Tabs', 'Labels, icons and badges — in your order'], ['navigation', 'Navigation', 'Tabs, swipe, arrows, dots and how a tab changes. While editing the tabs are always shown.'],
        ['appearance', 'Appearance', 'How the tabs look'], ['visibility', 'Visibility', 'Show or hide from a Home Assistant state']],
      defaults: { title: 'Tabs', tabs: [{ id: 't1', label: 'Overview' }, { id: 't2', label: 'More' }], align: 'center', style: 'bare' },
      fields: [
        { key: 'title', type: 'text', label: 'Name', group: 'content', optional: true, maxLength: 60, help: 'For you in the editor (layers, targets) — not shown on the dashboard.' },
        { key: 'tabs', type: 'collection', label: 'Tabs', group: 'content', srLabel: true, max: 12, itemLabel: 'tab', addLabel: '+ Add tab',
          get: (c) => (Array.isArray(c.tabs) ? c.tabs : []), set: (c, l) => { c.tabs = l; },
          create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`t${k}`)) k++; return { id: `t${k}`, label: `Tab ${k}` }; },
          fields: [
            { key: 'label', type: 'text', label: 'Label', required: true, maxLength: 24, placeholder: 'e.g. Lights' },
            { key: 'icon', type: 'mdi', label: 'Icon', optional: true },
            { key: 'badge', type: 'text', label: 'Badge', optional: true, maxLength: 6, placeholder: 'e.g. 3', help: 'A short text shown next to the label.' },
          ],
          summary: (x, i) => ({ icon: typeof x.icon === 'string' && /^mdi:/.test(x.icon) ? x.icon : null, title: x.label || `Tab ${i + 1}`, sub: x.badge ? `Badge ${x.badge}` : '' }),
          itemErrors: (x) => (x.label && String(x.label).trim() ? [] : [{ key: 'label', message: 'A tab needs a label' }]),
          help: 'The items of each tab are placed on the dashboard: select the tab on the canvas, then add or move widgets into it. Removing a tab removes its items (Undo restores them).' },
        { key: 'hideEmpty', type: 'boolean', label: 'Hide empty tabs', group: 'content', get: (c) => c.hideEmpty !== false, set: (c, v) => { if (v === false) c.hideEmpty = false; else delete c.hideEmpty; },
          help: 'While viewing, a tab with no widgets is not shown (while editing every tab stays, so you can add widgets to it).' },
        // NAVIGATION (components/tabs nav): absent = static tabs, exactly as before
        { key: 'nav.mode', type: 'select', label: 'Navigation', group: 'navigation', get: (c) => (c.nav && c.nav.mode) || 'tabs',
          options: [{ value: 'tabs', label: 'Tabs' }, { value: 'swipe', label: 'Swipe' }, { value: 'both', label: 'Tabs + swipe' }],
          help: 'Swipe: drag a tab\'s area sideways (or up / down) to the next one. A slider, button or other control inside keeps its own gesture.' },
        { key: 'nav.showTabs', type: 'boolean', label: 'Show the tab row', group: 'navigation', when: (c) => !!c.nav && c.nav.mode && c.nav.mode !== 'tabs', get: (c) => !(c.nav && c.nav.showTabs === false),
          set: (c, v) => { c.nav = { ...(c.nav || {}) }; if (v) delete c.nav.showTabs; else c.nav.showTabs = false; }, help: 'Off: arrows, dots or the gesture only (the tab row returns for the keyboard).' },
        { key: 'nav.axis', type: 'select', label: 'Swipe direction', group: 'navigation', half: true, when: (c) => !!c.nav && c.nav.mode && c.nav.mode !== 'tabs', get: (c) => (c.nav && c.nav.axis) || 'x',
          options: [{ value: 'x', label: 'Left / right' }, { value: 'y', label: 'Up / down' }] },
        { key: 'nav.mouse', type: 'boolean', label: 'Mouse drag swipes too', group: 'navigation', half: true, when: (c) => !!c.nav && c.nav.mode && c.nav.mode !== 'tabs', get: (c) => !!(c.nav && c.nav.mouse) },
        { key: 'nav.transition', type: 'select', label: 'Transition', group: 'navigation', half: true, get: (c) => (c.nav && c.nav.transition) || 'none',
          options: [{ value: 'none', label: 'None' }, { value: 'slide', label: 'Slide' }, { value: 'flip', label: 'Flip' }, { value: 'fade', label: 'Fade' }], help: 'Reduced-motion settings always win.' },
        { key: 'nav.duration', type: 'range', label: 'Transition time', group: 'navigation', unit: 'ms', min: 100, max: 1500, step: 10, auto: 'Auto', autoValue: 300, when: (c) => !!c.nav && !!c.nav.transition && c.nav.transition !== 'none' },
        { key: 'nav.arrows', type: 'boolean', label: 'Arrows', group: 'navigation', half: true, get: (c) => !!(c.nav && c.nav.arrows) },
        { key: 'nav.dots', type: 'boolean', label: 'Page dots', group: 'navigation', half: true, get: (c) => !!(c.nav && c.nav.dots) },
        { key: 'nav.loop', type: 'boolean', label: 'Loop (last → first)', group: 'navigation', get: (c) => !!(c.nav && c.nav.loop) },
        { key: 'nav.auto', type: 'range', label: 'Advance automatically', group: 'navigation', unit: 's', min: 2, max: 120, step: 1, auto: 'Off', autoValue: 0,
          help: 'Off by default. Pauses while the pointer or the keyboard is in the container, and after any swipe / press.' },
        // APPEARANCE: continuous quantities with the shared Slider + Number; discrete choices with selects (theme tokens only — no colours)
        ...TAB_RANGES.map(([key, label, min, max, dflt]) => ({ key, type: 'range', label, group: 'appearance', unit: 'px', min, max, step: 1, get: (c) => (typeof c[key] === 'number' ? c[key] : dflt) })),
        ...TAB_CHOICES.map(([key, label, opts, half]) => ({ key, type: 'select', label, group: 'appearance', half, options: opts.map(([value, l]) => ({ value, label: l })), get: (c) => (opts.some((o) => o[0] === c[key]) ? c[key] : opts[0][0]) })),
        { key: 'style', type: 'select', label: 'Surface', group: 'appearance', options: [{ value: 'bare', label: 'None — the widgets are the cards' }, { value: 'panel', label: 'Panel' }] },
      ],
      normalize(c) {
        const seen = new Set();
        c.tabs = (Array.isArray(c.tabs) ? c.tabs : []).filter((t) => t && typeof t === 'object').slice(0, 12).map((t, i) => {
          let id = typeof t.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(t.id) && !seen.has(t.id) ? t.id : null;
          if (!id) { let k = i + 1; while (seen.has(`t${k}`)) k++; id = `t${k}`; }
          seen.add(id);
          const o = { id, label: typeof t.label === 'string' ? t.label.replace(/[<>]/g, '').slice(0, 24) : '' };
          if (typeof t.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(t.icon)) o.icon = t.icon;
          if (typeof t.badge === 'string' && t.badge.trim()) o.badge = t.badge.replace(/[<>]/g, '').slice(0, 6);
          return o;
        });
        if (!['center', 'start', 'end'].includes(c.align)) c.align = 'center';
        if (!['bare', 'panel'].includes(c.style)) c.style = 'bare';
        TAB_RANGES.forEach(([k, , lo, hi]) => { if (c[k] !== undefined) { if (typeof c[k] === 'number' && Number.isFinite(c[k])) c[k] = clampNum(c[k], lo, hi); else delete c[k]; } });
        TAB_CHOICES.forEach(([k, , opts]) => { if (k !== 'align' && c[k] !== undefined && !opts.some((o) => o[0] === c[k])) delete c[k]; });
        // navigation: allow-listed, only what differs from the static default is stored
        if (c.nav !== undefined) {
          const n = c.nav && typeof c.nav === 'object' && !Array.isArray(c.nav) ? c.nav : {}, o = {};
          if (['swipe', 'both'].includes(n.mode)) o.mode = n.mode;
          if (n.axis === 'y') o.axis = 'y';
          if (['slide', 'flip', 'fade'].includes(n.transition)) o.transition = n.transition;
          if (typeof n.duration === 'number' && Number.isFinite(n.duration) && o.transition) o.duration = clampNum(n.duration, 100, 1500);
          if (n.showTabs === false && o.mode) o.showTabs = false;
          ['mouse', 'arrows', 'dots', 'loop'].forEach((k) => { if (n[k] === true) o[k] = true; });
          if (typeof n.auto === 'number' && Number.isFinite(n.auto) && n.auto >= 2) o.auto = clampNum(n.auto, 2, 120);
          if (!o.mode) { delete o.axis; delete o.mouse; }
          if (Object.keys(o).length) c.nav = o; else delete c.nav;
        }
        return c;
      },
      validate: (c) => (Array.isArray(c.tabs) && c.tabs.length ? [] : [{ key: 'tabs', message: 'A tabbed container needs at least one tab' }]),
      /** content: { panes: { tabId: nested grid }, active, onSelect } — built by the editor / application */
      create: (c, content) => global.MaisonTabs.create({ tabs: c.tabs, panes: (content && content.panes) || {}, active: content && content.active, onSelect: content && content.onSelect, align: c.align, style: c.style,
        nav: c.nav || {}, editing: !!(content && content.editing),
        look: Object.fromEntries([...TAB_RANGES.map((r) => r[0]), ...TAB_CHOICES.map((r) => r[0])].filter((k) => k !== 'align' && c[k] !== undefined).map((k) => [k, c[k]])) }),
      constraints: () => ({ minW: { desktop: 3, tablet: 3, mobile: 2 }, minH: 3 }),
    },
    container: {
      label: 'Container', group: 'Containers', size: { w: 6, h: 6 }, isContainer: true, glyph: G.container,
      description: 'Groups items on its own nested grid.',
      defaults: { title: 'Room', subtitle: '', variant: 'primary', icon: 'home' },
      fields: [
        { key: 'title', type: 'text', label: 'Title', group: 'identity', optional: true, maxLength: 60 },
        F.subtitle(),
        { key: 'variant', type: 'select', label: 'Variant', group: 'appearance', options: [{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }, { value: 'bare', label: 'Bare' }] },
        { key: 'icon', type: 'icon', label: 'Icon', group: 'appearance', optional: true, options: () => ['', ...Object.keys(C_ICONS())], icons: C_ICONS },
        F.text('status', 'Status text', 'data', { maxLength: 40 }),
        // its OWN grid's rows and gaps (the items inside it): Automatic = the standard 40 px rows and compact gap
        { key: 'innerRow', type: 'range', label: 'Inner row height', group: 'appearance', unit: 'px', min: 8, max: 200, step: 1, auto: 'Automatic', autoValue: 40, optional: true },
        { key: 'innerGap', type: 'range', label: 'Inner gap', group: 'appearance', unit: 'px', min: 0, max: 48, step: 1, auto: 'Automatic', autoValue: 12, optional: true },
      ],
      /** content: the nested grid element (or nothing) — the container never inspects it; its own row height / gap are set on it */
      create: (c, content) => { innerGrid(c, content); return global.MaisonContainer.create({
        variant: c.variant, title: c.title || undefined, subtitle: c.subtitle || undefined, icon: C_ICONS()[c.icon] || undefined,
        status: c.status || undefined, layout: 'free', content: content ? [content] : [], fill: true,
      }); },
      constraints: () => ({ minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }),
    },
  };
  /** a container's own grid geometry (innerRow / innerGap, px): CSS variables on its nested grid (grid.css reads them there) */
  function innerGrid(c, content) {
    if (!content || !content.style) return;
    const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null);
    const r = num(c.innerRow, 8, 200), g = num(c.innerGap, 0, 48);
    if (r !== null) content.style.setProperty('--grid-row', `${r}px`); else content.style.removeProperty('--grid-row');
    if (g !== null) content.style.setProperty('--grid-gap-compact', `${g}px`); else content.style.removeProperty('--grid-gap-compact');
  }

  /* ==== CUSTOM WIDGET CONTRACT — common capabilities (what a package, or Widget Studio later, writes; no core edits) ====
     In define() → return { …, common: { … } }  — every key optional:
       corners:      true | { fallback: <px number> | '<config key holding the legacy radius>' }
                     → a "Corners" control (Appearance); the registry applies the per-corner shape to the widget's ROOT
                       element only when the user set it (otherwise the widget's own radius is untouched).
       interactions: true | { entity: true, defaults: { tap: 'toggle' | 'popup' | …, doubleTap, longPress } }
                     → an "Interactions" section (Tap / Double tap / Long press) and the gestures on the root. Actions:
                       Nothing · Open popup · Navigate; Toggle / Turn on / Turn off only with entity: true AND widget.json
                       declaring "ha": { "actions": ["turn_on", "turn_off"] } (server re-checked). The widget's own
                       buttons / inputs / ARIA controls never start a card gesture; mark any other clickable area
                       [data-iq-control].
       visibility:   true  → a "Visibility" section; the registry hides / shows the item (grid footprint kept).
       (nothing to declare) → every custom widget also gets the shared WIDGET SURFACE (Appearance: background Theme / Transparent /
                     Custom opacity, hover effect) on its root — components/widget-kit surface(); only its outer surface changes.
     Sections: fields use group 'identity' | 'settings' | 'appearance' | 'images' | 'icon' (image / icon fields are placed
       automatically); the configuration is shown in collapsible standard sections, empty ones are not shown.
       A package may still give its own `groups` (+ accordion: true), e.g. Light Switch.
     Image upload: a field { type: 'image', upload: true } offers "Upload image" (IniqDash User Assets, server-validated);
       the widget must then accept "api/asset.php?id=<32 hex>" as an image location.
     Light Switch (the first consumer) wires its fields and kit calls itself; both styles are supported.
     OWN SIZE (MaisonFit, components/fit — nothing to declare; every widget root gets it, existing packages are unaffected):
       the root element carries data-fit-w / data-fit-h (xs · s · m · l · xl), data-fit-shape (wide · square · tall),
       data-fit-tier (micro · compact · normal · large) and --fit-px-w / --fit-px-h, from its own LOGICAL size (never the
       screen breakpoint or the editor zoom); its direct children get the --fit / --fit-w / --fit-h scales (fit.css). A
       script reads root.fit or subscribes with MaisonFit.on(root, cb) → off; a package that wants its own arrangement
       names still calls MaisonFit.observe(root, { arrange }) itself. CSS can select on the attributes, or make the root a
       size container (container: <name> / size) and use container queries / cq units.
     INTERACTIVE VISUALS (IniqVisuals, components/widget-visuals — OPT-IN: nothing is injected into any widget):
       a trusted package may compose the shared primitives in its own create(): IniqVisuals.layers / stack (state-driven
       visual layers + the declarative animation vocabulary), ring (progress / status ring), badge (state badge),
       controlStrip (capability-filtered controls → onAction) and flyout (secondary choices). Every spec is data (cleaned,
       never evaluated). The primitives never call Home Assistant: a control only reports the user's intent; the package
       sends it through ITS declared action channel (config.haRequest — unchanged authority) and feeds the device
       visuals the state Home Assistant then reports (el.haEntity) — never an optimistic one. */
  /* ---- CUSTOM widget packages register through ONE generic path (no core file names a custom widget).
     The entry script defines the API object named in the manifest with create(config) (+ constraints) AND define(kit),
     which returns the same kind of type definition as the factory entries above (label, description, glyph, size,
     defaults, fields, validate?, normalize?), built with the shared field vocabulary (kit.F). The registry adds it to
     TYPES under the package id, in the "Custom" group of Add Widget (or the category its widget.json declares).
     OPTIONAL, opt-in (absent = exactly as before):
       variants  [{ id, label, default? }] — presentations of the SAME widget (see VARIANTS above): lowercase ids, exactly
                 one default (else the first). The configuration gets one "Variant" select; create() receives the resolved
                 id as config.variant and the root carries data-variant — the package styles it. No new authority.
       tags      a few lowercase search words for the Add Widget search.
     Home Assistant is declared in the MANIFEST (widget.json "ha"): { binding?, domains?, deviceClasses? }.
       binding  one of the SHARED, read-only bindings of the HA layer — 'entity' (default: the widget receives the
                normalised entity through el.haEntity(entity) and config.haEntity), or 'gauge' / 'sensor' / 'text'
                (the widget implements that binding's state contract, e.g. el.gauge.setState({ value, unit, … })).
       domains, deviceClasses   the entity picker's filters.
     The entity field comes from the package's fields (or is added); its filters always come from the manifest.
     ROLES binding ("ha": { "binding": "roles", "roles": {…}, "actionSlots": {…} }): several named entity roles + named action slots, declared in
       the manifest; the configuration fields are generated (roleFields), the mappings cleaned against the declaration (cleanRoles), the live
       states handed over by IniqHA.bindRoles (config.haState / el.haState) and a press sent as haRequest({ slot, index, action }). docs/CUSTOM-WIDGETS.md.
     No package brings HA code, credentials or service calls: it only reads states the IniqDash server serves. */
  const HA_SHARED = ['entity', 'gauge', 'sensor', 'text'];
  /* ACTION CHANNEL: a package may declare "ha": { "domains": [...], "actions": [...] } — the actions it may REQUEST
     (validated by the server, server/WidgetPackages.php; the same allow-list is mirrored here as a second check).
     Its widget then receives config.haRequest(action) through the shared 'entity' binding (components/ha/bindings.js). */
  const HA_ACTIONS = { light: ['turn_on', 'turn_off'], switch: ['turn_on', 'turn_off'], fan: ['turn_on', 'turn_off'], scene: ['trigger'], script: ['trigger'], button: ['trigger'], input_button: ['trigger'] };   // mirrors server/WidgetPackages.php ACTIONS
  const DEF_KEYS = ['label', 'description', 'glyph', 'size', 'defaults', 'fields', 'validate', 'normalize', 'groups', 'accordion', 'common', 'variants', 'tags'];
  /** a custom package's `common` request → the registry's form (see the CUSTOM WIDGET CONTRACT above) */
  function customCommon(c, haActions) {
    if (!c || typeof c !== 'object') return null;
    const out = {};
    if (c.corners) out.corners = { fallback: c.corners && typeof c.corners === 'object' && (typeof c.corners.fallback === 'string' || Number.isFinite(c.corners.fallback)) ? c.corners.fallback : 0 };
    if (c.interactions) {
      const d = c.interactions && typeof c.interactions === 'object' ? c.interactions : {};
      // entity actions only for a package whose widget.json DECLARES turn_on + turn_off (the server re-checks every request)
      const entity = !!d.entity && !!haActions && ['turn_on', 'turn_off'].every((a) => haActions.actions.includes(a));
      const G = ['tap', 'doubleTap', 'longPress'], A = entity ? ['none', 'toggle', 'turn_on', 'turn_off', 'popup', 'navigate'] : ['none', 'popup', 'navigate'];
      const defaults = Object.fromEntries(Object.entries(d.defaults && typeof d.defaults === 'object' ? d.defaults : {}).filter(([g, a]) => G.includes(g) && A.includes(a)));
      out.interactions = { entity, defaults };
    }
    if (c.visibility) out.visibility = true;
    // INFORMATION lines (the shared Information capability): up to `max` (1–8) REAL values from entities the owner adds, each with its own
    // label and — when the package offers them — an icon from its own set and a colour from INFO_COLORS. Live values reach a ROLES widget as
    // config.haState.info (components/ha/bindings.js bindRoles); without the IniqDash server there is nothing to show.
    if (c.info) {
      const d = c.info && typeof c.info === 'object' ? c.info : {};
      // icons: 'mdi' — any Material Design Icon (the shared picker); or the package's own { name: svg } set
      const icons = d.icons === 'mdi' ? 'mdi' : d.icons && typeof d.icons === 'object' && !Array.isArray(d.icons) ? Object.fromEntries(Object.entries(d.icons).filter(([k, v]) => /^[a-z][a-z0-9-]{0,23}$/.test(k) && typeof v === 'string')) : null;
      out.info = { max: Number.isInteger(d.max) && d.max >= 1 && d.max <= 8 ? d.max : 3, icons: icons === 'mdi' || (icons && Object.keys(icons).length) ? icons : null, colors: d.colors === true, sizes: d.sizes === true, when: () => !!global.IniqHA?.enabled?.(),
        rowLabel: 'Information', addLabel: '+ Add information', own: true };
    }
    return Object.keys(out).length ? out : null;
  }
  /* ---- the ROLES binding (widget.json "ha": { "binding": "roles", "roles": {…}, "actionSlots": {…} }): the configuration fields are GENERATED
     from the declaration — an entity selector per single role, up to `max` selectors for a multiple role, up to `max` per action slot.
     The values live in config.haRoles.<role> (an id, or a list) / config.haSlots.<slot> (a list, one entity per slot position).
     Nothing here names a widget, a role or a slot: the manifest does. */
  const ID_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;
  const listOf = (raw) => (Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.keys(raw).sort((a, b) => a - b).map((k) => raw[k]) : []);
  function roleFields(decl, groups) {
    const on = () => !!global.IniqHA?.enabled?.();
    const out = [];
    // the package may define its own configuration sections: put the generated fields in its "settings" / "actions" sections when it has them
    const ids = Array.isArray(groups) ? groups.map((g) => g[0]) : null;
    const gRole = !ids || ids.includes('capability') ? 'capability' : ids.includes('settings') ? 'settings' : ids[0];
    const gAct = !ids || ids.includes('actions') ? 'actions' : ids.includes('settings') ? 'settings' : ids[0];
    Object.entries(decl.roles || {}).forEach(([name, r]) => {
      if (r.area) return;   // an AREA role is filled from the widget's Home Assistant Area — no fields (its saved mapping stays the fallback)
      const n = r.multiple ? Math.max(2, Math.min(20, r.max || 8)) : 1;
      for (let i = 0; i < n; i++) {
        out.push({ key: r.multiple ? `haRoles.${name}.${i}` : `haRoles.${name}`, type: 'entity', label: n > 1 ? `${r.label} ${i + 1}` : r.label, group: gRole, optional: !r.required || i > 0,
          required: !!r.required && i === 0, domains: r.domains.slice(), deviceClasses: r.deviceClasses ? r.deviceClasses.slice() : null, empty: 'Not mapped', clear: 'Clear',
          help: i === 0 ? (r.multiple ? `${r.label}: the widget reads the state of each mapped entity.` : `${r.label}: the widget reads this entity's state.`) : undefined,
          when: (c) => on() && (i === 0 || !!listOf(c.haRoles && c.haRoles[name])[i - 1]) });
      }
    });
    Object.entries(decl.slots || {}).forEach(([name, sl]) => {
      const n = Math.max(1, Math.min(8, sl.max || 1));
      for (let i = 0; i < n; i++) {
        const sec = (sl.section || `${sl.label} {n}`).replace('{n}', String(i + 1));
        out.push({ key: `haSlots.${name}.${i}`, type: 'entity', label: `${sl.label}: Home Assistant entity`, group: gAct, section: sec, optional: !sl.required || i > 0, required: !!sl.required && i === 0,
          domains: sl.domains.slice(), empty: 'Not linked', clear: 'Clear', help: i === 0 ? `A press asks Home Assistant to ${sl.actions.join(' / ')} this entity — nothing else.` : undefined, when: on });
      }
    });
    return out;
  }
  /** the saved mappings, cleaned against the declaration (known roles / slots, well-formed ids of the declared domains, the declared cardinality) */
  function cleanRoles(c, decl) {
    const ok = (id, domains) => typeof id === 'string' && id.length <= 120 && ID_RE.test(id) && domains.includes(id.split('.')[0]);
    if (c.haRoles !== undefined) {
      const o = {};
      if (c.haRoles && typeof c.haRoles === 'object' && !Array.isArray(c.haRoles)) Object.entries(decl.roles || {}).forEach(([name, r]) => {
        const raw = c.haRoles[name];
        if (r.multiple) { const l = listOf(raw).filter((x) => ok(x, r.domains)).slice(0, r.max || 8); if (l.length) o[name] = l; } else if (ok(raw, r.domains)) o[name] = raw;
      });
      if (Object.keys(o).length) c.haRoles = o; else delete c.haRoles;
    }
    if (c.haSlots !== undefined) {
      const o = {};
      if (c.haSlots && typeof c.haSlots === 'object' && !Array.isArray(c.haSlots)) Object.entries(decl.slots || {}).forEach(([name, sl]) => {
        const max = sl.max || 1, raw = c.haSlots[name], arr = Array(max).fill(null);       // positions are kept: slot i is the widget's button i
        if (Array.isArray(raw)) raw.slice(0, max).forEach((v, i) => { arr[i] = v; }); else if (raw && typeof raw === 'object') Object.keys(raw).forEach((k) => { const i = Number(k); if (Number.isInteger(i) && i >= 0 && i < max) arr[i] = raw[k]; });
        const l = arr.map((x) => (ok(x, sl.domains) ? x : null));
        while (l.length && l[l.length - 1] === null) l.pop();
        if (l.length) o[name] = l;
      });
      if (Object.keys(o).length) c.haSlots = o; else delete c.haSlots;
    }
    return c;
  }
  CUSTOM.forEach((m) => {
    const api = global[m.api];
    // a broken package is skipped with a diagnostic; the editor and every other widget keep working
    const fail = (why) => { if (typeof console !== 'undefined') console.error(`Custom widget "${m.id}" (${m.path}) skipped: ${why}`); };
    if (!api) return fail(`its script ${m.entry} did not define ${m.api} (failed to load or threw)`);
    if (TYPES[m.id]) return fail('its id is already a widget type');
    if (typeof api.create !== 'function' || typeof api.define !== 'function') return fail(`${m.api} needs create() and define()`);
    let d;
    try { d = api.define({ F, glyphs: { ...G }, manifest: { ...m } }); } catch (err) { return fail(`define() failed: ${err.message}`); }
    if (!d || typeof d !== 'object' || !Array.isArray(d.fields) || !d.defaults || typeof d.defaults !== 'object') return fail('define() must return { defaults, fields, … }');
    const unknown = Object.keys(d).filter((k) => !DEF_KEYS.includes(k));
    if (unknown.length) return fail(`define(): unknown key(s) ${unknown.join(', ')} (Home Assistant is declared in widget.json "ha")`);
    const rolesDecl = m.ha && typeof m.ha === 'object' && m.ha.binding === 'roles' ? { roles: m.ha.roles || {}, slots: m.ha.actionSlots || {} } : null;
    const ha = rolesDecl ? { binding: 'roles', domains: null, deviceClasses: null }
      : m.ha && typeof m.ha === 'object' ? { binding: HA_SHARED.includes(m.ha.binding) ? m.ha.binding : 'entity', domains: m.ha.domains || null, deviceClasses: m.ha.deviceClasses || null } : null;
    let haActions = null;
    if (ha && !rolesDecl && m.ha.actions !== undefined) {
      const acts = Array.isArray(m.ha.actions) ? m.ha.actions : [];
      const ok = ha.binding === 'entity' && acts.length && Array.isArray(ha.domains) && ha.domains.length
        && ha.domains.every((d) => HA_ACTIONS[d] && acts.every((a) => HA_ACTIONS[d].includes(a)));
      if (!ok) return fail('widget.json ha.actions: not allowed (light / switch / fan: turn_on, turn_off; "entity" binding; domains required)');
      haActions = { actions: acts.slice(), domains: ha.domains.slice() };
    }
    // the entity field: filters from the manifest; without an HA declaration, no entity field at all
    // (only the widget's OWN entity field, key "entity": other entity fields — e.g. a visibility condition — keep their own filters)
    const own = (f) => f.type === 'entity' && f.key === 'entity';
    let fields = d.fields.filter((f) => f && (ha || !own(f)) && !(rolesDecl && own(f))).map((f) => (own(f)
      ? { ...f, domains: ha.domains || global.IniqHA?.domainsFor?.(ha.binding) || f.domains || null, deviceClasses: ha.deviceClasses || null } : f));
    if (rolesDecl) {
      // generated fields join the package's own: a slot's entity goes into the section the package already uses for that slot position
      // (same section name → one block in the form); anything without such a section is appended
      // an action slot edited by a CONFIG COLLECTION of the package (field type 'collection' with slot: '<name>') — the collection's item
      // editor holds that entity (its 'entity' field gets the slot's domains), so the slot gets no generated fields of its own
      const claimed = new Set();
      fields = fields.map((f) => {
        const sl = f && f.type === 'collection' && typeof f.slot === 'string' ? rolesDecl.slots[f.slot] : null;
        if (!sl) return f;
        claimed.add(f.slot);
        return { ...f, fields: (f.fields || []).map((x) => (x.type === 'entity' && x.key === 'entity'
          ? { ...x, domains: sl.domains.slice(), help: `A press asks Home Assistant to ${sl.actions.join(' / ')} this entity — nothing else.` } : x)) };
      });
      roleFields(rolesDecl, d.groups).forEach((g) => {
        if ([...claimed].some((n) => g.key.startsWith(`haSlots.${n}.`))) return;
        let at = -1;
        if (g.section) fields.forEach((f, i) => { if (f.section === g.section) at = i; });
        if (at < 0) { fields.push(g); return; }
        // …and is shown while the package's own fields of that section are (a package with a variable number of entries hides the rest)
        const own = fields.filter((f) => f.section === g.section), on = g.when;
        fields.splice(at + 1, 0, { ...g, when: (c) => on(c) && own.some((f) => !f.when || f.when(c)) });
      });
    }
    if (ha && !rolesDecl && !fields.some(own)) fields.splice(fields.length ? 1 : 0, 0, { ...F.entity(ha.binding), domains: ha.domains || global.IniqHA?.domainsFor?.(ha.binding) || null, deviceClasses: ha.deviceClasses || null });
    TYPES[m.id] = {
      label: String(d.label || m.name), custom: true,
      // gallery placement: the category the manifest declares (none: "Custom"), the collection it was installed in
      category: /^[a-z][a-z0-9-]{1,23}$/.test(m.category || '') ? finalCategory(m.category) : 'custom', group: categoryLabel(/^[a-z][a-z0-9-]{1,23}$/.test(m.category || '') ? finalCategory(m.category) : 'custom'),
      // OPT-IN presentation variants and search tags (define() "variants" / "tags"; absent: exactly as before)
      ...(cleanVariants(d.variants) ? { variants: cleanVariants(d.variants) } : {}), tags: cleanTags(d.tags),
      collection: m.collection == null ? (m.firstParty === true ? 'iniqdash' : 'general') : m.collection, source: m.firstParty === true ? 'built-in' : 'installed',
      description: String(d.description || ''), glyph: typeof d.glyph === 'string' ? d.glyph : (G[m.basedOn] || G.image),
      size: d.size && Number.isInteger(d.size.w) && Number.isInteger(d.size.h) ? { w: d.size.w, h: d.size.h } : { w: 3, h: 4 },
      defaults: structuredClone(d.defaults), fields,
      ...(typeof d.validate === 'function' ? { validate: d.validate } : {}),
      ...(typeof d.normalize === 'function' || rolesDecl ? { normalize: (c) => { const x = typeof d.normalize === 'function' ? d.normalize(c) || c : c; return rolesDecl ? cleanRoles(x, rolesDecl) : x; } } : {}),
      // the configuration form's sections (optional): [[id, title, hint], …] in order; accordion: collapsible sections
      ...(Array.isArray(d.groups) && d.groups.every((g) => Array.isArray(g) && typeof g[0] === 'string' && typeof g[1] === 'string')
        ? { groups: d.groups.map((g) => [g[0], g[1], typeof g[2] === 'string' ? g[2] : '']) } : {}),
      ...(d.accordion === true ? { accordion: true } : {}),
      common: customCommon(d.common, haActions) || {},                    // (the widget surface: every custom widget too)
      ha: ha ? ha.binding : null,                                         // the shared binding it uses (none: demo / static only)
      haDecl: rolesDecl,                                                  // the roles binding's declaration (roles + action slots), else null
      haActions,                                                          // the declared action channel (null: read-only)
      create: (c) => impl(m.id).create(c),
      constraints: (c, px) => (typeof api.constraints === 'function' ? impl(m.id).constraints(c, px) : { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }),
    };
  });

  /* ---- COMMON WIDGET CAPABILITIES (components/widget-kit): which factory types use which — the capability matrix.
     A type opts in with `common` (custom packages: in define(), see below); applyCommon() then adds the shared fields and
     the registry applies corners / interactions / visibility at runtime (bound()). Not listed = not offered:
       button, action, radial  — their own action model stays authoritative (no second, competing card action)
       button                  — its own shape model (rect / square / round / pill) on the inner button: no corners
       radial                  — a centre control with an overlay ring (and a free Float mode): no card corners
       container               — layout: corners + visibility; no card gestures (selection / drag / drop of children)
       floating                — free design surface (items may extend past its edge): sections only
     Entity actions (toggle / turn on / turn off) are offered only where the type's Home Assistant binding is an on/off
     entity (light, switch, input_boolean, fan — derived from the binding's domains, not listed per widget). */
  const CARD = { corners: { fallback: 22 }, interactions: {}, visibility: true, more: true };       // 22 px = --radius-device
  // INFORMATION slots: the widgets that show them (opt-in: a widget that can present extra lines declares info: true)
  const INFO = { ...CARD, info: true };
  const COMMON = {
    light: CARD, climate: CARD, sensor: INFO, switch: INFO, fan: CARD, cover: CARD, media: CARD, camera: INFO, lock: INFO, alarm: CARD,
    gauge: CARD, chart: CARD, image: CARD, appliance: INFO, weather: CARD, person: INFO, calendar: CARD, numsel: INFO, energy: INFO, robot: INFO, entitylist: { corners: { fallback: 22 }, visibility: true }, activity: { corners: { fallback: 22 }, visibility: true }, datetime: CARD, timer: CARD, sunmoon: CARD,
    text: { ...CARD, corners: { fallback: 22, when: (c) => c.surface !== false } },
    action: { corners: { fallback: 22 }, visibility: true, more: true },
    button: { visibility: true, more: true },
    presence: CARD,
    activitylog: CARD,
    devicetile: CARD,
    readings: CARD,
    batteries: CARD, vehicle: CARD, countdown: CARD, humidifier: CARD, updates: CARD, todo: CARD, solar: CARD, homebattery: CARD, climategroup: CARD,
    roomtile: { ...CARD, corners: { fallback: 22 } },
    spotlight: { ...CARD, corners: { fallback: 26 } },
    radial: { visibility: true, surface: false },
    inbox: { visibility: true, corners: { fallback: 22, when: (c) => c.variant === 'list' } },
    // layout items keep their own surfaces (a Container's own background settings): no widget surface
    container: { corners: { fallback: (c) => ({ primary: 26, secondary: 20, bare: 0 })[c.variant] ?? 26 }, visibility: true, surface: false },
    tabs: { visibility: true, surface: false },
    studio: { corners: { fallback: 22 }, visibility: true },
  };
  /** the standard configuration sections (collapsible; empty ones are not shown) */
  /* the CONFIGURATOR TAXONOMY (docs/WIDGET-REFERENCE.md): IDENTITY → CONTENT (information, collections) → CONTROLS (settings, actions)
     → INTERACTIONS → APPEARANCE (how it is presented) → IMAGES (what picture / icon it uses) → VISIBILITY. Empty sections are not shown. */
  const STANDARD_GROUPS = [
    ['identity', 'Identity', 'What it is'],
    ['information', 'Information', 'Extra real values from other Home Assistant entities'],
    ['settings', 'Settings', 'What it can do, and its values'],
    ['actions', 'Actions', 'One section per action'],
    ['interactions', 'Interactions', 'Tap, double tap and long press on the card'],
    ['appearance', 'Appearance', 'How it is presented'],
    ['images', 'Images', 'Pictures, artwork and fallback icon'],
    ['icon', 'Icon', 'The icon'],
    ['visibility', 'Visibility', 'Show or hide from a Home Assistant state'],
  ];
  const sectionOf = (f) => (f.section ? (f.group || 'data')                       // fields of a sub-section (e.g. a radial action) stay together
    : f.type === 'image' ? 'images' : f.type === 'icon' ? 'icon' : ['capability', 'data', undefined].includes(f.group) ? 'settings' : f.group);
  /** a factory type with a Home Assistant binding (it can show Entity Details of its linked entity) */
  const hasBinding = (type) => !!global.IniqHA?.bindings?.[type];
  const isToggleType = (type) => { const d = global.IniqHA?.domainsFor?.(type), T = global.IniqHA?.TOGGLE_DOMAINS || ['light', 'switch', 'input_boolean', 'fan']; return Array.isArray(d) && d.length > 0 && d.every((x) => T.includes(x)); };
  /** standard sections for every type (a type with its own `groups` keeps them) + the shared fields its `common` asks for */
  function applyCommon(t) {
    const com = t.common || null;
    if (!t.groups) { t.fields = t.fields.map((f) => (f && sectionOf(f) !== (f.group || 'data') ? { ...f, group: sectionOf(f) } : f)); t.groups = STANDARD_GROUPS; }
    t.accordion = true;
    if (!com) return;
    const extra = [];
    if (com.corners) extra.push(F.corners(com.corners.fallback ?? 22, 'appearance', com.corners.when ? { when: com.corners.when } : {}));
    if (com.surface !== false) extra.push(...F.widgetSurface());                    // every WIDGET (layout items opt out)
    if (com.interactions) extra.push(...F.interactions({ entity: !!com.interactions.entity, details: !!com.interactions.details, defaults: com.interactions.defaults || {} }));
    if (com.more) extra.push(F.more());
    if (com.info) extra.push(F.info('information', typeof com.info === 'object' ? com.info : {}));
    if (com.visibility) extra.push(...F.visibility());
    t.fields = [...t.fields, ...extra];
    // a type with its own sections (e.g. a custom package's define() "groups") that does not name the section of a shared field gets
    // the standard one (before Visibility) — a common capability it asked for is never left out of the form
    extra.forEach((f) => {
      if (t.groups.some((g) => g[0] === f.group)) return;
      const std = STANDARD_GROUPS.find((g) => g[0] === f.group), vis = t.groups.findIndex((g) => g[0] === 'visibility');
      if (std) t.groups = vis >= 0 && f.group !== 'visibility' ? [...t.groups.slice(0, vis), std, ...t.groups.slice(vis)] : [...t.groups, std];
    });
  }
  Object.entries(COMMON).forEach(([type, com]) => {
    if (!TYPES[type]) return;
    TYPES[type].common = { ...com, ...(com.interactions ? { interactions: { ...com.interactions, entity: isToggleType(type), details: hasBinding(type) } } : {}),
      ...(com.more && !hasBinding(type) ? { more: false } : {}) };
  });
  Object.values(TYPES).forEach((t) => applyCommon(t));
  // Energy Flow: one short section per node (each hides when nothing in it applies)
  if (TYPES.energy) {
    const g = TYPES.energy.groups.slice(), at = g.findIndex((x) => x[0] === 'settings') + 1;
    g.splice(at, 0, ['efnodes', 'Nodes', 'The equipment you have — the diagram is built from it'], ['efsolar', 'Solar', 'Its power, sign and total'], ['efgrid', 'Grid', 'One signed entity, or import and export'], ['efbattery', 'Battery', 'Power, sign and level'],
      ['efev', 'EV', 'Power, sign, level and total'], ['efhome', 'Home totals', 'Home energy today']);
    TYPES.energy.groups = g;
  }
  // Chart: the added series' own section
  if (TYPES.chart) {
    const g = TYPES.chart.groups.slice(), at = g.findIndex((x) => x[0] === 'appearance');
    g.splice(at < 0 ? g.length : at, 0, ['series', 'Series', 'More values in the same chart — each its own colour']);
    TYPES.chart.groups = g;
  }
  // Sun & Moon: the moon's own section (only what the owner maps)
  if (TYPES.sunmoon) {
    const g = TYPES.sunmoon.groups.slice(), at = g.findIndex((x) => x[0] === 'settings') + 1;
    g.splice(at, 0, ['moon', 'Moon', 'Only from entities you map — Home Assistant’s sun entity has no moon data']);
    TYPES.sunmoon.groups = g;
  }
  // Camera: the Doorbell presentation's own section (empty — and so not shown — for the Picture presentation)
  if (TYPES.camera) {
    const g = TYPES.camera.groups.slice(), at = g.findIndex((x) => x[0] === 'settings') + 1;
    g.splice(at, 0, ['doorbell', 'Doorbell', 'Real Home Assistant entities for the doorbell, motion, lock and battery chips'],
      ['ptz', 'PTZ controls', 'Each control is an entity the camera\'s own integration provides (buttons for moves, a select for presets) — only mapped controls are shown']);
    TYPES.camera.groups = g;
  }
  // Appliance: the Washing Machine profile's own sections (empty — and so not shown — for Generic)
  if (TYPES.appliance) {
    const g = TYPES.appliance.groups.slice(), at = g.findIndex((x) => x[0] === 'settings') + 1;
    g.splice(at, 0, ['wminfo', 'Washing machine information', 'Real Home Assistant entities for its programme, time left, progress, power and door'],
      ['wmctl', 'Controls', 'Only entities you map here become buttons'], ['wmstate', 'State mapping', 'Which real states mean washing, rinsing, spinning…']);
    TYPES.appliance.groups = g;
  }
  /* search tags of the factory widgets (the gallery search reads label, description, category and these) */
  const TAGS = {
    light: ['lamp', 'lighting', 'dimmer', 'brightness'], switch: ['plug', 'socket', 'relay', 'outlet', 'toggle'], fan: ['ventilation', 'extractor', 'speed'],
    cover: ['blind', 'shutter', 'curtain', 'garage', 'gate', 'awning', 'window'], action: ['scene', 'script', 'run', 'automation', 'button'],
    climate: ['thermostat', 'heating', 'cooling', 'temperature', 'hvac', 'heat pump'], weather: ['forecast', 'temperature', 'rain', 'wind'],
    lock: ['door', 'security'], alarm: ['security', 'arm', 'disarm', 'panel'], camera: ['security', 'doorbell', 'video', 'cctv'],
    media: ['music', 'speaker', 'tv', 'player', 'audio'],
    sensor: ['temperature', 'humidity', 'battery', 'power', 'energy', 'status', 'binary', 'value'], gauge: ['dial', 'meter', 'level', 'power', 'battery'],
    chart: ['history', 'graph', 'trend', 'statistics'],
    appliance: ['washer', 'washing machine', 'dryer', 'dishwasher', 'oven', 'fridge', 'device'], person: ['presence', 'home', 'away', 'family'],
    calendar: ['events', 'agenda', 'schedule'], button: ['navigation', 'shortcut', 'link', 'popup'], radial: ['menu', 'actions', 'quick'],
    text: ['label', 'heading', 'title', 'section'], image: ['picture', 'photo', 'artwork'],
    datetime: ['clock', 'time', 'date', 'watch', 'timezone', 'world clock', 'calendar day'],
    timer: ['countdown', 'timer', 'alarm', 'kitchen', 'minutes', 'pomodoro'],
    sunmoon: ['sun', 'moon', 'sunrise', 'sunset', 'dawn', 'dusk', 'daylight', 'lunar', 'astronomy'],
    robot: ['vacuum', 'mower', 'lawn', 'roomba', 'cleaner', 'robot', 'dock'],
    energy: ['solar', 'grid', 'battery', 'ev', 'power', 'import', 'export', 'inverter', 'pv', 'flow'],
    numsel: ['number', 'slider', 'stepper', 'select', 'dropdown', 'option', 'mode', 'setpoint', 'limit', 'input', 'helper'],
  };
  Object.entries(TAGS).forEach(([k, v]) => { if (TYPES[k]) TYPES[k].tags = cleanTags(v); });
  /* the shared Variant field (first in Appearance) for every type that declares variants — the same configuration
     framework, one select; "how it is presented", never the widget's size (that is the grid) */
  Object.values(TYPES).forEach((t) => {
    if (!t.custom && t.variants) t.variants = cleanVariants(t.variants) || undefined;   // factory: the same rules
    if (!t.variants || t.fields.some((f) => f && f.key === 'variant')) return;
    const group = (t.groups || []).some((g) => g[0] === 'appearance') ? 'appearance' : (t.groups && t.groups[0] ? t.groups[0][0] : 'appearance');
    t.fields = [{ key: 'variant', type: 'select', label: 'Variant', group, get: (c) => variantOf(t, c), when: (c) => !!variantsAllowed(t, c),
      ...(typeof t.variantsFor === 'function' ? { optionsFrom: (c) => variantsAllowed(t, c).map((v) => ({ value: v.id, label: v.label })) } : { options: t.variants.map((v) => ({ value: v.id, label: v.label })) }),
      help: 'How this widget is presented. The same widget, entity and settings — its size stays as it is.' }, ...t.fields];
  });

  /* ---- every type knows what it is: a WIDGET (from a widget package) or LAYOUT (Container, Floating Container:
     the grid / free-surface infrastructure itself, not a widget package). The registry and the package list
     must agree; a mismatch is reported in the console (it never silently drops a type). */
  Object.entries(TYPES).forEach(([id, t]) => {
    if (!t.custom) { t.collection = 'iniqdash'; t.source = 'built-in'; t.category = CAT_OF_GROUP[t.group] || 'custom'; }   // factory: its existing group
    t.kind = t.isContainer ? 'layout' : 'widget';
    t.pkg = t.kind === 'widget' ? (PKG[id] || null) : null;
    if (t.kind === 'widget' && !t.pkg && typeof console !== 'undefined') console.error(`Widget "${id}" has no package (widgets/index.js)`);
  });
  PACKAGES.forEach((m) => { if (m.source === 'default' && !TYPES[m.id] && typeof console !== 'undefined') console.warn(`Widget package "${m.id}" (${m.path}) has no registry definition`); });

  /** A dashboard item whose CUSTOM widget is not installed (folder removed, or skipped as broken) keeps its place and its
      configuration: it gets a "not installed" stand-in type (not offered in Add Widget). Re-installing the folder brings
      the widget back with the same configuration. Returns the type, or null for anything that is not a custom id. */
  function placeholder(type) {
    if (TYPES[type]) return TYPES[type];
    if (typeof type !== 'string' || !CUSTOM_ID.test(type)) return null;
    TYPES[type] = {
      label: `${type.slice(7)} (not installed)`, group: 'Custom', category: 'custom', collection: null, custom: true, hidden: true, missing: true, kind: 'widget', pkg: null, ha: null,
      description: 'This custom widget is not installed (widgets/custom/).', glyph: G.image, size: { w: 3, h: 3 }, defaults: {}, fields: [],
      create: () => {
        const el = document.createElement('div');
        el.className = 'iq-missing-widget';
        el.setAttribute('role', 'note');
        el.style.cssText = 'display:grid;place-items:center;height:100%;padding:10px;box-sizing:border-box;text-align:center;border-radius:16px;border:1px dashed rgba(255,255,255,.18);color:#9aa0ab;font:500 12px/1.4 var(--font, sans-serif)';
        el.textContent = `Custom widget "${type.slice(7)}" is not installed`;
        return el;
      },
      constraints: () => ({ minW: { desktop: 1, tablet: 1, mobile: 1 }, minH: 1 }),
    };
    if (typeof console !== 'undefined') console.warn(`Dashboard uses custom widget "${type}", which is not installed: shown as a placeholder (its configuration is kept)`);
    return TYPES[type];
  }

  /* ---- application definitions edited with the same schema forms (not dashboard widgets) ---- */
  const ANIMS = [{ value: 'none', label: 'None' }, { value: 'fade', label: 'Fade' }, { value: 'scale', label: 'Scale + fade' },
    { value: 'slide-up', label: 'Slide up' }, { value: 'slide-down', label: 'Slide down' }, { value: 'slide-left', label: 'Slide left' }, { value: 'slide-right', label: 'Slide right' }];
  const SPEEDS = [{ value: 'fast', label: 'Fast' }, { value: 'normal', label: 'Normal' }, { value: 'slow', label: 'Slow' }];
  const DEF_GROUPS = (names) => names;
  /** the header icon of an older popup (a name from the demo icon set) shown as its Material Design equivalent in the shared MDI picker;
      the stored name stays until the owner picks another icon (the popup draws either) */
  const LEGACY_MDI = { bulb: 'mdi:lightbulb', lamp: 'mdi:lamp', power: 'mdi:power', moon: 'mdi:weather-night', sun: 'mdi:weather-sunny', star: 'mdi:star', sofa: 'mdi:sofa',
    music: 'mdi:music', home: 'mdi:home', bed: 'mdi:bed', door: 'mdi:door', thermo: 'mdi:thermometer', drop: 'mdi:water-percent', leaf: 'mdi:leaf', bolt: 'mdi:flash',
    lock: 'mdi:lock', shield: 'mdi:shield-home', gear: 'mdi:cog', garage: 'mdi:garage', gate: 'mdi:gate', camera: 'mdi:cctv', chart: 'mdi:chart-line', bell: 'mdi:bell',
    alert: 'mdi:alert', info: 'mdi:information', check: 'mdi:check', play: 'mdi:play', pot: 'mdi:pot-steam', plus: 'mdi:plus', more: 'mdi:dots-horizontal' };
  const legacyMdi = (v) => (typeof v === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(v) ? v : typeof v === 'string' && LEGACY_MDI[v] ? LEGACY_MDI[v] : undefined);
  /** one header button's own look (only while it is shown): its icon (the shared MDI picker; none = the built-in one), its region, its colour */
  /* each header button's own presentation (only while it is shown): icon, BUTTON SIZE and ICON SIZE (independent — the shared Slider + Number),
     style (bare · subtle · outline · filled), shape (circle · rounded), treatment (normal · accent: theme tokens), region, icon colour.
     Unset, a button keeps the look older popups had: their former shared button style / size (buttonStyle / buttonSize) — see btnDefault. */
  const buttonLook = (b, Label, shown, place, section) => [
    { key: `${b}Icon`, type: 'mdi', label: 'Icon', group: 'behaviour', section, optional: true, when: shown, help: 'None: the standard icon.' },
    { key: `${b}Size`, type: 'range', label: 'Button size', group: 'behaviour', section, unit: 'px', min: 28, max: 120, step: 1, when: shown, get: (c) => (typeof c[`${b}Size`] === 'number' ? c[`${b}Size`] : btnDefault(c).size) },
    { key: `${b}IconSize`, type: 'range', label: 'Icon size', group: 'behaviour', section, unit: 'px', min: 12, max: 72, step: 1, when: shown, get: (c) => (typeof c[`${b}IconSize`] === 'number' ? c[`${b}IconSize`] : btnDefault(c).icon) },
    { key: `${b}Style`, type: 'select', label: 'Style', group: 'behaviour', section, half: true, when: shown, get: (c) => c[`${b}Style`] || btnDefault(c).style, options: BTN_STYLES },
    { key: `${b}Shape`, type: 'select', label: 'Shape', group: 'behaviour', section, half: true, when: shown, get: (c) => c[`${b}Shape`] || btnDefault(c).shape, options: [{ value: 'circle', label: 'Circle' }, { value: 'rounded', label: 'Rounded' }] },
    { key: `${b}Tone`, type: 'select', label: 'Treatment', group: 'behaviour', section, half: true, when: shown, get: (c) => c[`${b}Tone`] || 'normal', options: [{ value: 'normal', label: 'Normal' }, { value: 'accent', label: 'Accent' }] },
    { key: `${b}Place`, type: 'select', label: 'Region', group: 'behaviour', section, half: true, when: shown, get: (c) => c[`${b}Place`] || place, options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
    { key: `${b}Color`, type: 'color', label: 'Icon colour', group: 'behaviour', section, optional: true, when: shown, options: INFO_COLORS },
  ];
  const BTN_STYLES = [{ value: 'bare', label: 'Bare' }, { value: 'subtle', label: 'Subtle' }, { value: 'outline', label: 'Outline' }, { value: 'filled', label: 'Filled' }];
  /** a header button's look before it is set (= what popups looked like with the former shared buttonStyle / buttonSize) — = components/popup btnDefault */
  function btnDefault(c) {
    const pic = c.heroShow !== false && typeof c.image === 'string' && !!c.image && c.image !== 'none';
    const st = c.buttonStyle && c.buttonStyle !== 'auto' ? c.buttonStyle : pic ? 'glass' : 'solid';
    const look = st === 'plain' ? { style: 'bare', shape: 'rounded' } : st === 'glass' ? { style: 'subtle', shape: 'circle' } : { style: 'filled', shape: 'rounded' };
    const sz = c.buttonSize === 'small' ? [36, 16] : c.buttonSize === 'large' ? [60, 24] : pic ? [52, 20] : [44, 18];
    return { ...look, size: sz[0], icon: sz[1] };
  }
  /* HERO INFORMATION (popup config.heroInfo): a CONFIG COLLECTION (the shared editor Room uses for its Information: compact rows, Add /
     Edit one line at a time, reorder, remove). A line = an entity · what to show of it · label · icon (shared MDI picker), icon colour,
     icon background, icon animation · its slot (left / centre / right) and presentation (card / emphasis / minimal). The popup reads the
     value through the shared Home Assistant layer; nothing here knows a domain. */
  const HERO_SLOTS = [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }];
  const HERO_STYLES = [{ value: 'card', label: 'Card' }, { value: 'emphasis', label: 'Emphasis' }, { value: 'minimal', label: 'Minimal' }];
  const HERO_ROWS = [{ value: 'top', label: 'Top' }, { value: 'center', label: 'Centre' }, { value: 'bottom', label: 'Bottom' }];
  /** an item's sizes / alignment when it has not chosen them: its presentation's own (= components/popup STYLE_DEFAULT) */
  const HERO_DFLT = { card: { a: 'start', vpx: 18, lpx: 12, ipx: 30 }, minimal: { a: 'start', vpx: 18, lpx: 12, ipx: 30 }, emphasis: { a: 'center', vpx: 56, lpx: 14, ipx: 40 } };
  /** the former Small / Medium / Large / XL item sizes → the px they were drawn with (= components/popup) */
  const HERO_LEGACY = { valueSize: { s: 15, m: 18, l: 30, xl: 56 }, labelSize: { s: 12, m: 14, l: 16 }, iconSize: { s: 20, m: 30, l: 40, xl: 56 } };
  const HERO_RANGE = { valueSize: [10, 120], labelSize: [8, 48], iconSize: [12, 120] };
  const heroDflt = (c) => HERO_DFLT[c && HERO_DFLT[c.style] ? c.style : 'card'];
  const HERO_MAX = 8;
  function heroInfoField({ key = 'heroInfo', group = 'information', max = HERO_MAX, vslot = null, custom = false, when = null, extra = [], context = null, placeWhen = null } = {}) {
    const S = () => global.IniqHA?.slots;
    const sources = (c) => {
      const o = S() ? S().sources(c.entity && global.IniqHA.get ? global.IniqHA.get(c.entity) : null) : [{ value: 'state', label: 'State' }];
      return c.value && !o.some((x) => x.value === c.value) ? [...o, { value: c.value, label: `${c.value.replace(/_/g, ' ')} (not reported now)` }] : o;
    };
    const lbl = (list, v) => (list.find((o) => o.value === v) || list[0]).label;
    /** where it sits: "Centre" (the middle), else e.g. "Top left", "Centre right", "Bottom centre" */
    const place = (x) => { const r = x.vslot || 'center', c = x.slot || 'left'; return r === 'center' && c === 'center' ? 'Centre' : `${lbl(HERO_ROWS, r)} ${lbl(HERO_SLOTS, c).toLowerCase()}`; };
    return { key, type: 'collection', label: 'Information', group, optional: true, srLabel: true, max, itemLabel: 'information', addLabel: '+ Add information', ...(when ? { when } : {}),
      previewFocus: (x) => (x && x.id ? `[data-fact="${String(x.id).replace(/["\\]/g, '')}"]` : null), ...(context ? { context } : {}),
      get: (c) => (Array.isArray(c[key]) ? c[key] : []), set: (c, l) => { if (l.length) c[key] = l; else delete c[key]; },
      entityOf: (x) => (x && typeof x.entity === 'string' && x.entity) || null,
      create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`h${k}`)) k++; return { id: `h${k}`, entity: '', value: 'state', slot: 'left', ...(vslot ? { vslot } : {}), style: 'card' }; },
      // the INFORMATION EDITOR ORGANISATION (shared with Room): CONTENT (what is shown) · PRESENTATION (how its text appears) · ICON (only with an
      // icon) · POSITION (the 3 × 3 placement selector — stored as slot + vslot). A control appears only while it means something.
      groups: INFO_GROUPS,
      fields: [
        // the SHARED Information item definitions (infoItemFields): every property, the presentation's own automatic sizes
        ...infoItemFields(['entity', 'value', 'showLabel', 'label', 'icon', 'style', 'align', 'valueSize', 'labelSize', 'labelPos', 'iconSize', 'iconPos', 'iconBg', 'color', 'valueColor', 'animation', 'animateWhen'],
          { sources, custom, over: { align: { get: (c) => c.align || heroDflt(c).a }, valueSize: { autoValue: (c) => heroDflt(c).vpx }, labelSize: { autoValue: (c) => heroDflt(c).lpx },
            iconSize: { autoValue: (c) => heroDflt(c).ipx }, iconBg: { half: true }, color: { half: null }, animateWhen: {} } }),
        ...extra,
        { key: 'place', type: 'place9', label: 'Position', group: 'position', srLabel: false, ...(placeWhen ? { when: placeWhen } : {}),
          get: (c) => `${['top', 'bottom'].includes(c.vslot) ? c.vslot : 'center'}-${['center', 'right'].includes(c.slot) ? c.slot : 'left'}`,
          set: (c, v) => { const [r, h] = String(v).split('-'); c.slot = ['left', 'center', 'right'].includes(h) ? h : 'left'; if (r === 'top' || r === 'bottom') c.vslot = r; else delete c.vslot; } },
      ],
      // the row: its icon and colour, its label (else HA's name), the entity and what it shows, where and how — and the value now
      summary: (x, i, ha) => {
        const e = x.entity ? ha.get(x.entity) : null, it = x.entity && S() ? S().item(x, e, ha.known(x.entity)) : null;
        const what = (x.value || 'state') === 'state' ? 'state' : x.value.replace(/_/g, ' ');
        return { icon: typeof x.icon === 'string' && /^mdi:/.test(x.icon) ? x.icon : null, color: INFO_COLORS.includes(x.color) ? x.color : null,
          title: (typeof x.label === 'string' && x.label.trim()) || ha.name(x.entity) || x.entity || `Information ${i + 1}`,
          sub: `${x.entity || 'No entity'} • ${what} · ${place(x)} · ${lbl(HERO_STYLES, x.style)}`,
          value: it ? (it.state === 'ready' ? it.text : it.state === 'missing' ? 'Not found' : '') : '' };
      },
      colors: INFO_COLORS,
      itemErrors: (x) => (x && typeof x.entity === 'string' && x.entity ? [] : [{ key: 'entity', message: 'Choose an entity' }]),
    };
  }
  /** stored hero information lines: allow-listed values only, defaults not stored, unique ids (deterministic) */
  function heroInfoClean(list, { hex = false } = {}) {
    if (!Array.isArray(list)) return undefined;
    const used = new Set(), ANIM = ICON_ANIMS.map((o) => o.value);
    const out = list.slice(0, HERO_MAX).filter((x) => x && typeof x === 'object' && !Array.isArray(x)).map((x) => {
      const o = { ...x };
      let id = typeof o.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(o.id) && !used.has(o.id) ? o.id : null;
      if (!id) { let k = 1; while (used.has(`h${k}`)) k++; id = `h${k}`; }
      used.add(id); o.id = id;
      if (o.slot !== undefined && !['left', 'center', 'right'].includes(o.slot)) delete o.slot;
      if (o.style !== undefined && !['card', 'emphasis', 'minimal'].includes(o.style)) delete o.style;
      if (o.labelPos !== undefined && o.labelPos !== 'above') delete o.labelPos;
      if (o.vslot !== undefined && !['top', 'bottom'].includes(o.vslot)) delete o.vslot;            // centre: the default (not stored)
      if (o.showLabel !== undefined && o.showLabel !== false) delete o.showLabel;
      if (o.showLabel === false) { delete o.labelPos; delete o.labelSize; }
      if (o.align !== undefined && !['start', 'center', 'end'].includes(o.align)) delete o.align;
      Object.entries(HERO_RANGE).forEach(([k, [lo, hi]]) => { if (o[k] !== undefined) { o[k] = sizeOf(o[k], lo, hi, HERO_LEGACY[k]); if (o[k] === undefined) delete o[k]; } });
      if (typeof o.label === 'string' && !o.label.trim()) delete o.label;
      if (o.icon !== undefined && !(typeof o.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(o.icon))) delete o.icon;
      if (!o.icon) ['iconPos', 'iconBg', 'iconSize', 'color', 'valueColor', 'animation', 'animateWhen'].forEach((k) => delete o[k]);
      if (o.iconPos !== undefined && o.iconPos !== 'top') delete o.iconPos;
      if (o.iconBg !== undefined && !['subtle', 'accent'].includes(o.iconBg)) delete o.iconBg;
      if (o.color !== undefined && !INFO_COLORS.includes(o.color) && !(hex && typeof o.color === 'string' && HEXC.test(o.color))) delete o.color;
      if (o.inDial !== undefined && o.inDial !== true) delete o.inDial;                     // (Climate's Digital ring: the item inside the dial)
      if (o.dialSlot !== undefined && (!o.inDial || !CLIMATE_DSLOTS.some(([v]) => v === o.dialSlot) || o.dialSlot === 'bottom')) delete o.dialSlot;
      if (o.valueColor !== undefined && (o.valueColor !== 'icon' || !o.color)) delete o.valueColor;
      if (o.animation !== undefined && (o.animation === 'none' || !ANIM.includes(o.animation))) { delete o.animation; delete o.animateWhen; }
      if (o.animateWhen !== undefined && (!o.animation || o.animateWhen !== 'always')) delete o.animateWhen;
      return o;
    });
    return out.length ? out : undefined;
  }  // CLIMATE: its Information is the same shared collection (here, the HERO builder's fields — the 3 × 3 position included — with custom colours)
  if (TYPES.climate) {
    const at = TYPES.climate.fields.findIndex((f) => f.key === 'infoGap');
    const digital = (x, ctx) => !ctx || ctx.digital;
    TYPES.climate.fields.splice(at < 0 ? TYPES.climate.fields.length : at, 0, heroInfoField({ key: 'info', group: 'information', max: 10, vslot: 'bottom', custom: true,
      context: (c) => ({ digital: climateDesign(c) === 'digital', bar: c.infoLayout === 'bar' }),
      placeWhen: (x, ctx) => !(x.inDial === true && digital(x, ctx)) && !(ctx && ctx.bar),
      extra: [
        { key: 'inDial', type: 'boolean', label: 'Inside the Digital ring', group: 'position', when: digital, get: (x) => x.inDial === true, set: (x, v) => { if (v) x.inDial = true; else { delete x.inDial; delete x.dialSlot; } },
          help: 'Shown inside the dial (a small, structured place) instead of on the card.' },
        { key: 'dialSlot', type: 'select', label: 'Place in the dial', group: 'position', when: (x, ctx) => digital(x, ctx) && x.inDial === true, options: opts(CLIMATE_DSLOTS), get: (x) => x.dialSlot || 'bottom' },
      ] }));
  }

  /** NOTIFICATION APPEARANCE PRESETS — starting configurations of the ONE notification renderer (config.design), not separate
      notifications: choosing one replaces the design with the preset's values; every value can then be changed. Standard = no design
      (the notification as it always was). Image / Hero use the chosen picture (a built-in one when none is chosen yet). */
  const NOTE_PRESETS = [
    { id: 'standard', label: 'Standard', design: {} },
    { id: 'minimal', label: 'Minimal', design: { shadow: 'soft', corners: 'slight', padding: 10, titleSize: 13, msgSize: 12, iconSize: 16, borderWidth: 1 } },
    { id: 'glass', label: 'Glass', design: { bgColor: '#1d2129', bgAlpha: 45, blur: 14, borderColor: 'neutral', borderWidth: 1, shadow: 'soft', corners: 'rounded' } },
    { id: 'banner', label: 'Banner', design: { width: 1600, padding: 18, titleSize: 18, titleWeight: '700', msgSize: 14, iconSize: 26, corners: 'slight', shadow: 'strong' } },
    { id: 'image', label: 'Image', design: { imageLayout: 'left', sideWidth: 96, width: 400, corners: 'rounded' }, image: true },
    { id: 'hero', label: 'Hero', design: { imageLayout: 'hero', heroHeight: 140, width: 380, corners: 'rounded', titleSize: 16 }, image: true },
  ];
  const NOTE_IMAGE = 'assets/img/media/artwork-dusk.jpg';
  function applyNotePreset(c, id) {
    const p = NOTE_PRESETS.find((x) => x.id === id) || NOTE_PRESETS[0];
    if (p.id === 'standard') { delete c.design; return c; }
    c.design = { ...structuredClone(p.design), preset: p.id };
    if (p.image && !(typeof c.image === 'string' && c.image && c.image !== 'none')) c.image = NOTE_IMAGE;
    return c;
  }
  const DEFS = {
    /* POPUP (V2): a configurable mini-dashboard SURFACE — a header (title, subtitle, Back / Menu / Close), an optional background
       picture over its top (the hero: the items placed there are ordinary widgets), and its content (ordinary items, containers,
       tabbed containers). The popup understands no Home Assistant domain. Rendered by components/popup (host) and the editor. */
    popup: {
      label: 'Popup',
      // the same configurator as every widget (Room is the reference): collapsible sections, the first open
      accordion: true,
      groups: DEF_GROUPS([['identity', 'Identity', 'Its name, title and subtitle'], ['hero', 'Hero', 'The header area: title, buttons and what it shows'],
        ['information', 'Information', 'Values you add to the header, in your order'], ['appearance', 'Appearance', 'How the header and the picture are presented'],
        ['images', 'Images', 'The background picture of the header area'], ['size', 'Size & layout', 'Per device: Desktop, Tablet, Mobile'],
        ['behaviour', 'Interactions', 'Header buttons, what they do, and how it closes'], ['animation', 'Animation', 'Reduced-motion settings always win']]),
      defaults: { title: '', icon: '', size: 'custom', custom: { desktop: { w: 560, h: 420 }, tablet: { w: 520, h: 420 } }, closeButton: true, backdrop: true, outsideClose: true, escClose: true, enter: 'scale', exit: 'fade', speed: 'normal' },
      fields: [
        { key: 'title', type: 'text', label: 'Title', group: 'identity', optional: true, maxLength: 60, placeholder: 'Optional' },
        { key: 'subtitle', type: 'text', label: 'Subtitle', group: 'identity', optional: true, maxLength: 80, placeholder: 'Optional — e.g. Media • Lights • Climate' },
        // HERO: the structure of the header area (the information lines are their own section)
        { key: 'heroShow', type: 'boolean', label: 'Show the hero', group: 'hero', get: (c) => c.heroShow !== false, set: (c, v) => { if (v) delete c.heroShow; else c.heroShow = false; },
          help: 'The header picture and the information row. Off hides both; their settings are kept.' },
        { key: 'showTitle', type: 'boolean', label: 'Show the title', group: 'hero', half: true, get: (c) => c.showTitle !== false, set: (c, v) => { if (v) delete c.showTitle; else c.showTitle = false; } },
        { key: 'showSubtitle', type: 'boolean', label: 'Show the subtitle', group: 'hero', half: true, get: (c) => c.showSubtitle !== false, set: (c, v) => { if (v) delete c.showSubtitle; else c.showSubtitle = false; } },
        { key: 'headerAlign', type: 'select', label: 'Title position', group: 'hero', half: true, get: (c) => c.headerAlign || 'left', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }] },
        { key: 'icon', type: 'mdi', label: 'Title icon', group: 'hero', optional: true, get: (c) => legacyMdi(c.icon) },
        { key: 'actionGap', type: 'range', label: 'Action gap', group: 'hero', unit: 'px', min: 0, max: 40, step: 1, get: (c) => (typeof c.actionGap === 'number' ? c.actionGap : 10),
          help: 'The space between the buttons of a region. Each button (size, icon, style, shape) is set in Interactions.' },
        { key: 'buttonOrder', type: 'select', label: 'Order in a region', group: 'hero', get: (c) => c.buttonOrder || 'menu-close',
          options: [{ value: 'menu-close', label: 'Back · Menu · Close' }, { value: 'close-menu', label: 'Back · Close · Menu' }] },
        heroInfoField(),
        // APPEARANCE: how it is presented (the picture itself is chosen in Images)
        { key: 'hero', type: 'select', label: 'Picture height', group: 'appearance', when: (c) => !!c.image && c.image !== 'none', get: (c) => c.hero || 'medium',
          options: [{ value: 'small', label: 'Small — the header' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }, { value: 'full', label: 'Whole popup' }],
          help: 'How far down the picture reaches behind the header, the information and the content.' },
        { key: 'imageTreatment', type: 'select', label: 'Image treatment', group: 'appearance', half: true, when: (c) => !!c.image && c.image !== 'none', get: (c) => c.imageTreatment || 'natural',
          options: [{ value: 'natural', label: 'Natural' }, { value: 'dark', label: 'Dark' }, { value: 'dim', label: 'Dim' }, { value: 'soft', label: 'Soft' }] },
        { key: 'overlay', type: 'select', label: 'Overlay strength', group: 'appearance', half: true, when: (c) => !!c.image && c.image !== 'none', get: (c) => c.overlay || 'medium',
          options: [{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }, { value: 'strong', label: 'Strong' }], help: 'The shading that keeps the header and the content readable over the picture.' },
        { key: 'titleSize', type: 'range', label: 'Title size', group: 'appearance', unit: 'px', min: 12, max: 60, step: 1, auto: 'Automatic', autoValue: 16,
          get: (c) => (typeof c.titleSize === 'number' ? c.titleSize : c.titleSize === 'large' ? 30 : undefined) },
        // IMAGES: the header picture — the shared Image / Artwork picker (popup images are the popups' own library — IMAGE OWNERSHIP = TYPE)
        ...F.artwork('image', 'Header picture', { group: 'images', fallback: null, builtins: [{ value: 'assets/img/popups/demo-dining.svg', label: 'Dining room' }] }),
        // SIZE & LAYOUT: the preset, then one row per breakpoint (width · height)
        { key: 'size', type: 'select', label: 'Size', group: 'size', options: [{ value: 'full', label: 'Full screen' }, { value: 'custom', label: 'Custom size' }, { value: 'fit', label: 'Fit content' }] },
        { key: 'custom.desktop.w', type: 'number', label: 'Desktop width (px)', group: 'size', half: true, min: 200, max: 1600, integer: true, required: true, when: (c) => c.size === 'custom' },
        { key: 'custom.desktop.h', type: 'number', label: 'Desktop height (px)', group: 'size', half: true, min: 120, max: 1200, integer: true, required: true, when: (c) => c.size === 'custom' },
        { key: 'custom.tablet.w', type: 'number', label: 'Tablet width (px)', group: 'size', half: true, min: 200, max: 1000, integer: true, required: true, when: (c) => c.size === 'custom' },
        { key: 'custom.tablet.h', type: 'number', label: 'Tablet height (px)', group: 'size', half: true, min: 120, max: 1200, integer: true, required: true, when: (c) => c.size === 'custom',
          help: 'Mobile: always a full-width sheet from the bottom (at most 90% of the screen height; Full screen: the whole screen).' },
        // INTERACTIONS: each header button — shown or not, then (only when shown) its icon, place, colour and what it does
        { key: 'closeButton', type: 'boolean', label: 'Close button', group: 'behaviour', section: 'Close button', help: 'Always closes the popup.' },
        ...buttonLook('close', 'Close', (c) => !!c.closeButton, 'right', 'Close button'),
        { key: 'backButton', type: 'boolean', label: 'Back button', group: 'behaviour', section: 'Back button', get: (c) => !!c.backButton },
        { key: 'backAction', section: 'Back button', type: 'select', label: 'Back does', group: 'behaviour', when: (c) => !!c.backButton, get: (c) => c.backAction || 'history',
          options: [{ value: 'history', label: 'Back to the previous popup (else close)' }, { value: 'popup', label: 'Opens a popup' }, { value: 'navigate', label: 'Opens a page' }],
          help: 'Previous popup: the popup this one was opened from; opened from the dashboard, Back closes it.' },
        { key: 'backPopup', section: 'Back button', type: 'select', label: 'Back opens popup', group: 'behaviour', required: true, when: (c) => !!c.backButton && c.backAction === 'popup', optionsFrom: () => ctxPopups().map((p) => ({ value: p.id, label: p.name })) },
        { key: 'backPage', section: 'Back button', type: 'select', label: 'Back opens page', group: 'behaviour', required: true, when: (c) => !!c.backButton && c.backAction === 'navigate', optionsFrom: () => ctxPages().map((p) => ({ value: p.id, label: p.name })) },
        ...buttonLook('back', 'Back', (c) => !!c.backButton, 'left', 'Back button'),
        { key: 'menuShow', type: 'boolean', label: 'Menu button', group: 'behaviour', section: 'Menu button', get: (c) => !!c.menu && c.menu !== 'none',
          set: (c, v) => { if (v) c.menu = c.menu === 'navigate' ? 'navigate' : 'popup'; else { c.menu = 'none'; delete c.menuPopup; delete c.menuPage; } } },
        { key: 'menu', section: 'Menu button', type: 'select', label: 'Menu does', group: 'behaviour', when: (c) => !!c.menu && c.menu !== 'none', get: (c) => (c.menu === 'navigate' ? 'navigate' : 'popup'),
          options: [{ value: 'popup', label: 'Opens a popup' }, { value: 'navigate', label: 'Opens a page' }] },
        { key: 'menuPopup', section: 'Menu button', type: 'select', label: 'Menu opens popup', group: 'behaviour', required: true, when: (c) => c.menu === 'popup', optionsFrom: () => ctxPopups().map((p) => ({ value: p.id, label: p.name })) },
        { key: 'menuPage', section: 'Menu button', type: 'select', label: 'Menu opens page', group: 'behaviour', required: true, when: (c) => c.menu === 'navigate', optionsFrom: () => ctxPages().map((p) => ({ value: p.id, label: p.name })) },
        ...buttonLook('menu', 'Menu', (c) => !!c.menu && c.menu !== 'none', 'right', 'Menu button'),
        { key: 'backdrop', type: 'boolean', label: 'Backdrop', group: 'behaviour', section: 'Closing', help: 'Dims the dashboard behind the popup' },
        { key: 'outsideClose', type: 'boolean', label: 'Click outside closes', group: 'behaviour', section: 'Closing', help: 'For the popup on the dashboard (configuration dialogs never close this way).' },
        { key: 'escClose', type: 'boolean', label: 'Escape closes', group: 'behaviour', section: 'Closing' },
        { key: 'enter', type: 'select', label: 'Entry animation', group: 'animation', options: ANIMS },
        { key: 'exit', type: 'select', label: 'Exit animation', group: 'animation', options: ANIMS },
        { key: 'speed', type: 'select', label: 'Speed', group: 'animation', options: SPEEDS },
      ],
      normalize(c) {
        // a popup without the V2 settings (older dashboards) stays exactly as it was: no picture, no Back / Menu, no information
        if (typeof c.titleSize === 'number') c.titleSize = clampNum(c.titleSize, 12, 60);                // a number (px) — or the former normal / large
        ['back', 'menu', 'close'].forEach((b) => {
          if (c[`${b}Size`] !== undefined) c[`${b}Size`] = sizeOf(c[`${b}Size`], 28, 120); if (c[`${b}Size`] === undefined) delete c[`${b}Size`];
          if (c[`${b}IconSize`] !== undefined) c[`${b}IconSize`] = sizeOf(c[`${b}IconSize`], 12, 72); if (c[`${b}IconSize`] === undefined) delete c[`${b}IconSize`];
          [[`${b}Style`, ['bare', 'subtle', 'outline', 'filled']], [`${b}Shape`, ['circle', 'rounded']], [`${b}Tone`, ['normal', 'accent']]].forEach(([k, ok]) => { if (c[k] !== undefined && !ok.includes(c[k])) delete c[k]; });
          if (c[`${b}Tone`] === 'normal') delete c[`${b}Tone`];
        });
        if (c.actionGap !== undefined) { c.actionGap = sizeOf(c.actionGap, 0, 40); if (c.actionGap === undefined) delete c.actionGap; }
        const allow = { hero: ['small', 'medium', 'large', 'full'], imageTreatment: ['natural', 'dark', 'dim', 'soft'], overlay: ['light', 'medium', 'strong'], headerAlign: ['left', 'center'], titleSize: ['normal', 'large'], menu: ['none', 'popup', 'navigate'], buttonOrder: ['menu-close', 'close-menu'],
          buttonStyle: ['auto', 'glass', 'solid', 'plain'], buttonSize: ['small', 'medium', 'large'], backAction: ['history', 'popup', 'navigate'], backPlace: ['left', 'right'], menuPlace: ['left', 'right'], closePlace: ['left', 'right'] };
        const dflt = { hero: 'medium', imageTreatment: 'natural', overlay: 'medium', headerAlign: 'left', titleSize: 'normal', menu: 'none', buttonOrder: 'menu-close', buttonStyle: 'auto', buttonSize: 'medium', backAction: 'history', backPlace: 'left', menuPlace: 'right', closePlace: 'right' };
        Object.keys(allow).forEach((k) => { if (k === 'titleSize' && typeof c[k] === 'number') return; if (c[k] !== undefined && (!allow[k].includes(c[k]) || c[k] === dflt[k])) delete c[k]; });
        if (c.image === '' || c.image === null || c.image === 'none') delete c.image;
        if (c.subtitle === '') delete c.subtitle;
        ['backButton'].forEach((k) => { if (c[k] === false) delete c[k]; });
        ['heroShow', 'showTitle', 'showSubtitle'].forEach((k) => { if (c[k] !== false) delete c[k]; });
        if (c.menu !== 'popup') delete c.menuPopup;
        if (c.menu !== 'navigate') delete c.menuPage;
        if (c.backAction !== 'popup') delete c.backPopup;
        if (c.backAction !== 'navigate') delete c.backPage;
        // a hidden button keeps nothing of its own (its icon, place, colour, action disappear with it)
        const own = { back: !!c.backButton, menu: !!c.menu && c.menu !== 'none', close: !!c.closeButton };
        Object.keys(own).forEach((b) => {
          if (!own[b]) { [`${b}Icon`, `${b}Place`, `${b}Color`, `${b}Size`, `${b}IconSize`, `${b}Style`, `${b}Shape`, `${b}Tone`].forEach((k) => delete c[k]); if (b === 'back') { delete c.backAction; delete c.backPopup; delete c.backPage; } }
          if (c[`${b}Icon`] !== undefined && !(typeof c[`${b}Icon`] === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(c[`${b}Icon`]))) delete c[`${b}Icon`];
          if (c[`${b}Color`] !== undefined && !INFO_COLORS.includes(c[`${b}Color`])) delete c[`${b}Color`];
        });
        if (c.icon === '') delete c.icon;
        c.heroInfo = heroInfoClean(c.heroInfo);
        if (!c.heroInfo) delete c.heroInfo;
        return c;
      },
      validate(c) {
        const e = [];
        if (!c.closeButton && !c.escClose && !c.outsideClose) e.push({ key: 'closeButton', message: 'A popup needs at least one way to close it (close button, Escape or click outside)' });
        return e;
      },
    },
    /* THEME (Theme Studio — components/theme): a theme of the dashboard's library { tokens }, edited with the shared colour control
       (a token: Default = the look of tokens.css, or a colour). Built lazily: the theme module loads after the registry. */
    theme: {
      label: 'Theme',
      accordion: true,
      /* the Theme Studio's property sections (components/editor/themestudio.js shows them beside the live preview) */
      groups: [
        ['identity', 'Theme', 'Its name and whether it is a dark or a light theme.'],
        ['page', 'Dashboard background', 'The colour (or gradient) behind the cards. Click the preview\'s background to come here.'],
        ['image', 'Background image', 'An image of your own (uploaded to IniqDash — never an outside address). It never changes the layout.'],
        ['nav', 'Navigation', 'The dock: sidebar, top or bottom bar, and the selected page.'],
        ['surfaces', 'Cards & panels', 'Device cards, panels and containers.'],
        ['borders', 'Borders, corners & shadow', 'The card edge, its corner radius and its depth.'],
        ['text', 'Typography', 'Font, weight, size and the text colours.'],
        ['accent', 'Accent', 'Primary buttons, active controls, sliders and the selected page.'],
        ['controls', 'Controls', 'Buttons, toggles, sliders and keyboard focus.'],
        ['status', 'Status', 'Semantic state colours — never replaced by the accent.'],
        ['light', 'Light and heat', 'The glow of lights and the heating colours.'],
        ['effects', 'Effects', 'Subtle effects — kept light for readability and speed.'],
      ],
      defaults: { tokens: {} },
      get fields() {
        const T = global.MaisonTheme; if (!T) return [];
        if (this._fields) return this._fields;
        const tok = (t, group) => ({ key: `tokens.${t}`, type: 'color', label: T.LABEL[t] || t, group, optional: true, options: [], custom: true, half: true, accept: (v) => T.isColour(v), help: T.USES[t] });
        const tokensIn = (g) => ((T.GROUPS.find(([id]) => id === g) || [])[2] || []).map((t) => tok(t, g));
        // built-in backgrounds (assets/themes) — or upload your own (IniqDash User Assets: a reference, never a path)
        const BG_ART = [['dusk', 'Dusk'], ['mist', 'Morning mist'], ['leaves', 'Leaves'], ['peach', 'Peach light']].map(([f, label]) => ({ value: `assets/themes/${f}.svg`, label }));
        const AUTO = { 'look.pagePad': 20, 'look.pageMargin': 0, 'look.pageRadius': 20, 'look.surfaceAlpha': 100, 'look.radius': 16, 'look.borderWidth': 1, 'look.shadowStrength': 100, 'look.blur': 0, 'look.textScale': 1, 'look.glow': 0, 'background.opacity': 100, 'background.blur': 0, 'background.overlayAlpha': 0 };
        const rng = (key, label, group, min, max, step, unit, help) => ({ key, type: 'range', label, group, optional: true, min, max, step, unit, auto: 'Theme default', autoValue: AUTO[key], help });
        const sel = (key, label, group, options, help) => ({ key, type: 'select', label, group, optional: true, options: [{ value: '', label: 'Theme default' }, ...options], half: true, help,
          get: (c) => { const v = getPath(c, key); return v === undefined ? '' : String(v); }, set: (c, v) => setPath(c, key, v === '' ? undefined : (/^\d+$/.test(v) && key !== 'look.font' ? Number(v) : v)) });
        const bg = (c) => c.background || {};
        const hasImg = (c) => !!bg(c).image;
        const grad = (c) => bg(c).gradient;
        const setGrad = (c, k, v) => { const g = { ...(grad(c) || {}) }; if (v === undefined || v === '') delete g[k]; else g[k] = v; setPath(c, 'background.gradient', Object.keys(g).length ? g : undefined); };
        this._fields = [
          { key: 'dark', type: 'select', label: 'Classification', group: 'identity', optional: true, options: [{ value: '', label: 'Automatic (from the background)' }, { value: 'dark', label: 'Dark theme' }, { value: 'light', label: 'Light theme' }],
            get: (c) => (c.dark === true ? 'dark' : c.dark === false ? 'light' : ''), set: (c, v) => { if (v === 'dark') c.dark = true; else if (v === 'light') c.dark = false; else delete c.dark; } },
          ...tokensIn('page'),
          { key: 'bgGradient', type: 'boolean', label: 'Gradient', group: 'page', help: 'Two colours blending across the dashboard (over the background colour).',
            get: (c) => !!grad(c), set: (c, v) => setPath(c, 'background.gradient', v ? { from: (c.tokens && c.tokens['page-bg']) || '#18181b', to: (c.tokens && c.tokens['page-bg-lighter']) || '#2a2a31', angle: 160 } : undefined) },
          { key: 'bgFrom', type: 'color', label: 'Gradient from', group: 'page', optional: true, options: [], custom: true, half: true, accept: (v) => T.isColour(v), when: (c) => !!grad(c), get: (c) => (grad(c) || {}).from, set: (c, v) => setGrad(c, 'from', v) },
          { key: 'bgTo', type: 'color', label: 'Gradient to', group: 'page', optional: true, options: [], custom: true, half: true, accept: (v) => T.isColour(v), when: (c) => !!grad(c), get: (c) => (grad(c) || {}).to, set: (c, v) => setGrad(c, 'to', v) },
          { key: 'bgAngle', type: 'range', label: 'Gradient angle', group: 'page', optional: true, min: 0, max: 360, step: 5, unit: '°', auto: 'Theme default', autoValue: 180, when: (c) => !!grad(c), get: (c) => (grad(c) || {}).angle, set: (c, v) => setGrad(c, 'angle', v) },
          { key: 'background.image', type: 'artwork', label: 'Image', group: 'image', optional: true, upload: true, builtins: BG_ART, picks: BG_ART.map((b) => b.value),
            get: (c) => bg(c).image || 'none', set: (c, v) => setPath(c, 'background.image', !v || v === 'none' ? undefined : v) },
          { ...sel('background.fit', 'Fit', 'image', [{ value: 'cover', label: 'Cover (fill, may crop)' }, { value: 'contain', label: 'Contain (whole image)' }, { value: 'original', label: 'Original size' }, { value: 'stretch', label: 'Stretch' }]), when: hasImg },
          { ...sel('background.position', 'Position', 'image', Object.keys(T.POSITIONS).map((p) => ({ value: p, label: p === 'center' ? 'Centre' : p.split('-').map((x) => x[0].toUpperCase() + x.slice(1)).join(' ') }))), when: hasImg },
          { ...rng('background.opacity', 'Image opacity', 'image', 0, 100, 1, '%'), when: hasImg },
          { ...rng('background.blur', 'Image blur', 'image', 0, 20, 1, 'px', 'Not with a fixed image.'), when: hasImg },
          { ...sel('background.attach', 'Scrolling', 'image', [{ value: 'scroll', label: 'Scrolls with the dashboard' }, { value: 'fixed', label: 'Fixed (stays put)' }]), when: hasImg },
          { key: 'background.overlay', type: 'color', label: 'Overlay colour', group: 'image', optional: true, options: [], custom: true, half: true, accept: (v) => T.isColour(v), help: 'A tint over the image to keep text readable.' },
          rng('background.overlayAlpha', 'Overlay strength', 'image', 0, 100, 1, '%'),
          ...tokensIn('nav'),
          ...tokensIn('surfaces'),
          rng('look.surfaceAlpha', 'Card opacity', 'surfaces', 40, 100, 1, '%', 'Lower = see-through cards (the background shows through).'),
          rng('look.blur', 'Background blur behind cards', 'surfaces', 0, 20, 1, 'px', 'Frosted cards. Costs some speed on older tablets.'),
          { key: 'look.glass', type: 'boolean', label: 'Glass', group: 'surfaces', help: 'See-through frosted cards with a light edge.', get: (c) => !!(c.look && c.look.glass), set: (c, v) => setPath(c, 'look.glass', v ? true : undefined) },
          ...tokensIn('borders'),
          // the PAGE's own frame (a dashboard's design: edge to edge, or a panel with a padding, a margin and corners)
          sel('look.pageFrame', 'Page frame', 'page', [{ value: 'flat', label: 'Flat (edge to edge)' }, { value: 'panel', label: 'Panel (a rounded surface)' }]),
          rng('look.pagePad', 'Page padding', 'page', 0, 48, 1, 'px', 'The room between the page edge and the widgets.'),
          rng('look.pageMargin', 'Page margin', 'page', 0, 48, 1, 'px', 'The room around the page frame.'),
          rng('look.pageRadius', 'Page corner radius', 'page', 0, 40, 1, 'px'),
          rng('look.borderWidth', 'Card border width', 'borders', 0, 3, 1, 'px'),
          rng('look.radius', 'Corner radius', 'borders', 0, 32, 1, 'px', 'Cards, panels and containers.'),
          sel('look.shadow', 'Shadow', 'borders', Object.entries(T.SHADOWS).map(([v, x]) => ({ value: v, label: x.label }))),
          rng('look.shadowStrength', 'Shadow intensity', 'borders', 0, 150, 5, '%'),
          sel('look.font', 'Font', 'text', Object.entries(T.FONTS).filter(([v]) => v !== 'default').map(([v, x]) => ({ value: v, label: x.label })), 'Fonts already on the device — nothing is downloaded.'),
          sel('look.titleWeight', 'Title weight', 'text', [500, 600, 700, 800].map((w) => ({ value: String(w), label: { 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold' }[w] }))),
          rng('look.textScale', 'Text size', 'text', 0.9, 1.15, 0.05, '×'),
          ...tokensIn('text'),
          ...tokensIn('accent'),
          ...tokensIn('controls'),
          ...tokensIn('status'),
          ...tokensIn('light'),
          rng('look.glow', 'Accent glow', 'effects', 0, 100, 5, '%', 'A soft glow around the selected page and controls that are on.'),
        ];
        return this._fields;
      },
      normalize(c) { const T = global.MaisonTheme; const t = T ? T.clean({ ...c, tokens: c.tokens || {} }) : null; const out = { tokens: (t && t.tokens) || {} }; ['look', 'background', 'dark'].forEach((k) => { if (t && t[k] !== undefined) out[k] = t[k]; }); return out; },
      validate(c) { const T = global.MaisonTheme; return T ? T.check({ tokens: c.tokens || {}, ...(c.look ? { look: c.look } : {}), ...(c.background ? { background: c.background } : {}), ...(c.dark !== undefined ? { dark: c.dark } : {}) }, 'theme').map((m) => ({ key: /background/.test(m) ? 'background.image' : 'tokens', message: m })) : []; },
    },
    notification: {
      label: 'Notification template',
      accordion: true,           // the same collapsible sections as a widget's configuration (the first open)
      groups: DEF_GROUPS([['identity', 'Content', 'What it says. Plain text only.'], ['position', 'Position', 'Corner and edge notifications stack; centre notifications queue (one at a time). Always within the visible screen.'],
        ['behaviour', 'Behaviour', 'Timed or persistent.'], ['appearance', 'Appearance', 'A starting look (preset), then any property below. Standard: the notification as it always was.'],
        ['size', 'Size', 'Auto: the Standard size. Never larger than the visible screen — longer content scrolls inside.'], ['background', 'Background & border', 'Transparency affects the background only — never the text, icon or buttons.'],
        ['corners', 'Corners'], ['text', 'Text & icon'], ['image', 'Image', 'The picture and how it is laid out. Uploaded images are served by IniqDash (never a path or an embedded image).'],
        ['animation', 'Animation', 'Reduced-motion settings always win.']]),
      defaults: { title: 'Notification', message: '', icon: 'bell', image: '', position: 'top-right', persistent: false, duration: 5, closeButton: true, tone: 'info', style: 'card', enter: 'slide-left', exit: 'fade', speed: 'normal' },
      fields: (() => {
        const D = (k) => `design.${k}`, dv = (c, k) => (c.design && typeof c.design === 'object' ? c.design[k] : undefined);
        const hasImg = (c) => typeof c.image === 'string' && c.image !== '' && c.image !== 'none';
        const layoutOf = (c) => (hasImg(c) ? dv(c, 'imageLayout') || 'thumb' : 'none');
        const COLS = INFO_COLORS;
        const range = (k, label, group, min, max, extra = {}) => ({ key: D(k), type: 'range', label, group, unit: 'px', min, max, step: 1, auto: 'Auto', ...extra });
        const color = (k, label, group, extra = {}) => ({ key: D(k), type: 'color', label, group, optional: true, options: COLS, custom: true, ...extra });
        const choice = (k, label, group, options, dflt, extra = {}) => ({ key: D(k), type: 'select', label, group, get: (c) => dv(c, k) || dflt,
          set: (c, v) => setPath(c, D(k), v === dflt ? undefined : v), options: options.map(([value, l]) => ({ value, label: l })), ...extra });
        return [
          { key: 'title', type: 'text', label: 'Title', group: 'identity', required: true, maxLength: 80 },
          { key: 'message', type: 'text', label: 'Message', group: 'identity', optional: true, maxLength: 240, multiline: true },
          // the shared MDI icon picker (as widgets and popups); an older template's built-in icon name shows as its MDI equivalent and
          // keeps drawing until another icon is chosen
          { key: 'icon', type: 'mdi', label: 'Icon', group: 'identity', optional: true, get: (c) => legacyMdi(c.icon) },
          { key: 'position', type: 'select', label: 'Position', group: 'position', options: [{ value: 'top-left', label: 'Top left' }, { value: 'top-center', label: 'Top centre' }, { value: 'top-right', label: 'Top right' }, { value: 'center', label: 'Center' },
            { value: 'bottom-left', label: 'Bottom left' }, { value: 'bottom-center', label: 'Bottom centre' }, { value: 'bottom-right', label: 'Bottom right' }] },
          range('margin', 'Distance from the screen edges', 'position', 0, 96, { autoValue: 12, help: 'Auto: 12 px.' }),
          { key: 'persistent', type: 'boolean', label: 'Persistent', group: 'behaviour', help: 'Stays until it is closed' },
          { key: 'duration', type: 'number', label: 'Duration (seconds)', group: 'behaviour', min: 1, max: 120, integer: true, required: true, when: (c) => !c.persistent },
          { key: 'closeButton', type: 'boolean', label: 'Close button', group: 'behaviour' },
          // APPEARANCE: the preset fills the properties below — each can then be changed (the preset is only a starting point)
          { key: D('preset'), type: 'select', label: 'Preset', group: 'appearance', get: (c) => dv(c, 'preset') || 'standard',
            options: NOTE_PRESETS.map((p) => ({ value: p.id, label: p.label })), set: (c, v) => applyNotePreset(c, v),
            help: 'Fills Size, Background, Corners, Text and Image with a starting look. Anything can be changed afterwards.' },
          { key: 'tone', type: 'select', label: 'Tone', group: 'appearance', half: true, options: [{ value: 'neutral', label: 'Neutral' }, { value: 'info', label: 'Info' }, { value: 'success', label: 'Success' }, { value: 'warning', label: 'Warning' }, { value: 'danger', label: 'Danger' }] },
          { key: 'style', type: 'select', label: 'Style', group: 'appearance', half: true, options: [{ value: 'card', label: 'Card' }, { value: 'compact', label: 'Compact' }, { value: 'solid', label: 'Solid colour' }] },
          // SIZE
          range('width', 'Width', 'size', 160, 1600, { autoValue: 360, help: 'Auto: 360 px (420 px in the centre; the full width on a narrow screen).' }),
          range('height', 'Height', 'size', 48, 1200, { autoValue: 64, help: 'Auto: as tall as its content.' }),
          { key: D('maxWidth'), type: 'range', label: 'Maximum width', group: 'size', unit: '%', min: 20, max: 100, step: 1, auto: 'Auto', autoValue: 100, help: 'Of the screen width (minus the edge distance).' },
          range('padding', 'Padding', 'size', 0, 48, { autoValue: 12 }),
          choice('align', 'Content alignment', 'size', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], 'left'),
          // BACKGROUND & BORDER
          color('bgColor', 'Background colour', 'background'),
          { key: D('bgAlpha'), type: 'range', label: 'Background opacity', group: 'background', unit: '%', min: 0, max: 100, step: 1, auto: 'Auto', autoValue: 100, help: '0 %: no background at all; the text stays fully visible.' },
          { key: D('blur'), type: 'range', label: 'Background blur', group: 'background', unit: 'px', min: 0, max: 30, step: 1, auto: 'None', autoValue: 0, help: 'Blurs what is behind a see-through background.' },
          color('borderColor', 'Border colour', 'background'),
          range('borderWidth', 'Border thickness', 'background', 0, 8, { autoValue: 1 }),
          choice('shadow', 'Shadow', 'background', [['medium', 'Standard'], ['none', 'None'], ['soft', 'Soft'], ['strong', 'Strong']], 'medium'),
          // CORNERS
          choice('corners', 'Corner style', 'corners', [['standard', 'Standard'], ['square', 'Square'], ['slight', 'Slightly rounded'], ['rounded', 'Rounded'], ['full', 'Fully rounded'], ['custom', 'Custom radius']], 'standard'),
          // Custom: the SHARED corner control (each corner normal / concave with its own radius — the same as a widget's corners)
          { key: D('radii'), type: 'corners', label: 'Corners', group: 'corners', max: 80, when: (c) => dv(c, 'corners') === 'custom', fallback: (c) => (typeof dv(c, 'radius') === 'number' ? dv(c, 'radius') : 18),
            help: 'Each corner: normal (rounded) or concave, with its own radius. "Use one radius" goes back to 18 px on every corner.' },
          // TEXT & ICON
          color('titleColor', 'Title colour', 'text'),
          range('titleSize', 'Title size', 'text', 10, 48, { autoValue: 14 }),
          choice('titleWeight', 'Title weight', 'text', [['', 'Standard'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Extra bold']], ''),
          color('msgColor', 'Message colour', 'text'),
          range('msgSize', 'Message size', 'text', 9, 32, { autoValue: 12.5 }),
          choice('msgWeight', 'Message weight', 'text', [['', 'Standard'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold']], ''),
          choice('textAlign', 'Text alignment', 'text', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], 'left'),
          { key: D('iconShow'), type: 'boolean', label: 'Show the icon', group: 'text', when: (c) => !!c.icon, get: (c) => dv(c, 'iconShow') !== false, set: (c, v) => setPath(c, D('iconShow'), v ? undefined : false) },
          range('iconSize', 'Icon size', 'text', 12, 72, { autoValue: 20, when: (c) => !!c.icon && dv(c, 'iconShow') !== false }),
          color('iconColor', 'Icon colour', 'text', { when: (c) => !!c.icon && dv(c, 'iconShow') !== false }),
          // IMAGE: the shared Image / Artwork picker (built-ins · this type's uploads · Upload — the secure IniqDash User Assets)
          ...F.artwork('image', 'Image', { group: 'image', fallback: null, builtins: [{ value: 'assets/img/media/artwork-dusk.jpg', label: 'Dusk' }, { value: 'widgets/default/person/assets/avatar-demo.jpg', label: 'Person' }, { value: 'widgets/default/appliance/assets/washing-machine.png', label: 'Washing machine' }] }),
          { key: D('imageLayout'), type: 'select', label: 'Image layout', group: 'image', when: hasImg, get: layoutOf, set: (c, v) => setPath(c, D('imageLayout'), v === 'thumb' ? undefined : v),
            options: [{ value: 'none', label: 'None — text only' }, { value: 'thumb', label: 'Thumbnail (Standard)' }, { value: 'background', label: 'Background' }, { value: 'hero', label: 'Hero — across the top' }, { value: 'left', label: 'Left of the content' }, { value: 'right', label: 'Right of the content' }] },
          choice('imageFit', 'Image fit', 'image', [['cover', 'Cover'], ['contain', 'Contain']], 'cover', { half: true, when: (c) => ['background', 'hero', 'left', 'right'].includes(layoutOf(c)) }),
          choice('imagePos', 'Image position', 'image', [['center', 'Centre'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']], 'center', { half: true, when: (c) => ['background', 'hero', 'left', 'right'].includes(layoutOf(c)) }),
          { key: D('imageOpacity'), type: 'range', label: 'Image opacity', group: 'image', unit: '%', min: 0, max: 100, step: 1, auto: 'Auto', autoValue: 100, when: (c) => ['background', 'hero', 'left', 'right'].includes(layoutOf(c)) },
          range('heroHeight', 'Image height', 'image', 48, 400, { autoValue: 120, when: (c) => layoutOf(c) === 'hero', help: 'At most half of the notification when its height is fixed.' }),
          range('sideWidth', 'Image width', 'image', 32, 320, { autoValue: 96, when: (c) => ['left', 'right'].includes(layoutOf(c)), help: 'At most 38 % of the notification, so the text keeps its room on a small screen.' }),
          color('overlayColor', 'Overlay colour', 'image', { when: (c) => layoutOf(c) === 'background' }),
          { key: D('overlayAlpha'), type: 'range', label: 'Overlay opacity', group: 'image', unit: '%', min: 0, max: 100, step: 1, auto: 'Auto', autoValue: 45, when: (c) => layoutOf(c) === 'background', help: 'Keeps the text readable over the picture.' },
          { key: 'enter', type: 'select', label: 'Entry animation', group: 'animation', options: ANIMS },
          { key: 'exit', type: 'select', label: 'Exit animation', group: 'animation', options: ANIMS },
          { key: 'speed', type: 'select', label: 'Speed', group: 'animation', options: SPEEDS },
        ];
      })(),
      normalize(c) {
        // an older template (no design) stays exactly as it was; the design is allow-listed (components/notify cleanDesign)
        if (c.image === 'none' || c.image === null) c.image = '';
        const clean = global.MaisonNotify && global.MaisonNotify.cleanDesign;
        if (c.design !== undefined) { const d = clean ? clean(c.design) : c.design; if (d) c.design = d; else delete c.design; }
        if (c.design && c.design.corners !== 'custom') { delete c.design.radius; delete c.design.radii; }
        if (c.design && !Object.keys(c.design).length) delete c.design;
        return c;
      },
      validate(c) {
        const e = [];
        if (c.persistent && !c.closeButton) e.push({ key: 'closeButton', message: 'A persistent notification needs a close button' });
        return e;
      },
    },
  };
  /** demo event sources (V1). Later a Home Assistant source emits ha.* events through the same
      rule engine — rules only store the event id. */
  const EVENTS = [
    { id: 'demo.front_door_open', label: 'Front door opened' },
    { id: 'demo.doorbell', label: 'Doorbell pressed' },
    { id: 'demo.washing_done', label: 'Washing machine finished' },
    { id: 'demo.water_leak', label: 'Water leak detected' },
    { id: 'demo.low_battery', label: 'Sensor battery low' },
  ];
  const schemaOf = (type) => TYPES[type] || DEFS[type];

  /* ---- config access by path ---- */
  const getPath = (o, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);
  function setPath(o, path, value) {
    const ks = path.split('.'); let cur = o;
    ks.slice(0, -1).forEach((k) => { if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; });
    if (value === undefined) delete cur[ks[ks.length - 1]]; else cur[ks[ks.length - 1]] = value;
    for (let i = ks.length - 1; i > 0; i--) {             // drop parents left empty (e.g. labels: {})
      const holder = i === 1 ? o : getPath(o, ks.slice(0, i - 1).join('.')), obj = holder && holder[ks[i - 1]];
      if (obj && typeof obj === 'object' && !Array.isArray(obj) && !Object.keys(obj).length) delete holder[ks[i - 1]];
    }
  }
  const optionsOf = (f, c, ctx) => {
    const raw = f.optionsFrom ? f.optionsFrom(c, ctx) : typeof f.options === 'function' ? f.options() : (f.options || []);
    return raw.map((o) => (typeof o === 'object' ? o : { value: o, label: o === '' ? 'None' : String(o) }));
  };
  const fieldValue = (f, c) => (f.get ? f.get(c) : getPath(c, f.key));
  const isShown = (f, c, ctx) => {   // ctx: a collection item editor's context (f.context of its collection) — absent elsewhere
    if (linkedTo(c)) {
      if (typeof f.demo === 'function' ? f.demo(c) : f.demo) return false;
      if (f.live) return !!f.live(c);
    }
    return !f.when || !!f.when(c, ctx);
  };
  /* image locations a configuration may use: a shared asset (assets/…), a widget package asset
     (widgets/default|custom/[<collection>/]<id>/assets/…), an uploaded user image (api/asset.php?id=<32 hex>), an https
     address or an embedded image — never with “..” */
  const SAFE_URL = /^(?!.*\.\.)(assets\/[A-Za-z0-9._\/-]+|widgets\/(default|custom)\/[a-z0-9][a-z0-9-]*\/(?:[a-z0-9][a-z0-9-]*\/)?assets\/[A-Za-z0-9._\/-]+|api\/asset\.php\?id=[0-9a-f]{32}|https:\/\/[^\s"'<>()]+|data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+)$/;

  /** an uploaded user image (server/UserAssets.php): the reference a dashboard stores — never a path or the image itself */
  const USER_ASSET = /^api\/asset\.php\?id=[0-9a-f]{32}$/;

  /** The full config the component receives: defaults + item config (normalised). */
  function fullConfig(type, config) {
    const t = schemaOf(type);
    let c = { ...structuredClone(t.defaults), ...structuredClone(config || {}) };
    if (config?.capabilities) c.capabilities = { ...(t.defaults.capabilities || {}), ...config.capabilities };
    if (t.normalize) c = t.normalize(c);
    return variantNormalize(t, commonNormalize(c));
  }

  /**
   * Validate a COMPLETE config (as stored in the model) against its type's schema.
   * Fields hidden by `when` (a capability that is off) are not validated.
   * @returns [{ key, message }]
   */
  /** Information lines (infoslots, and the Information collection): shape only — what HA reports is checked at runtime */
  function infoErrors(f, v, label) {
    const errs = [];
    // shape only (what HA reports for the entity is checked at runtime): ids, entity ids, a short plain label, a source key
    if (!Array.isArray(v) || v.length > (f.max || 3)) return [{ key: f.key, message: `${label}: at most ${f.max || 3} lines` }];
    const ids = new Set(), keys = ['id', 'label', 'entity', 'value', ...(f.icons ? ['icon'] : []), ...(f.icons === 'mdi' || (f.icons && f.icons() === 'mdi') ? ['animation', 'animateWhen'] : []), ...(f.colors ? ['color'] : []), ...(f.sizes ? [...Object.keys(INFO_SIZE_RANGE), 'showLabel', 'iconBg'] : [])];
    v.forEach((x, i) => {
      const n = `${label} ${i + 1}`;
      if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some((k) => !keys.includes(k))) { errs.push({ key: f.key, message: `${n}: not a valid information line` }); return; }
      if (x.icon !== undefined && !(f.icons() === 'mdi' ? typeof x.icon === 'string' && /^mdi:[a-z0-9-]{1,64}$/.test(x.icon) : Object.prototype.hasOwnProperty.call(f.icons(), x.icon))) errs.push({ key: f.key, message: `${n}: not an available icon` });
      if (x.animation !== undefined && !ICON_ANIMS.some((o) => o.value === x.animation)) errs.push({ key: f.key, message: `${n}: not an available animation` });
      if (x.animateWhen !== undefined && !ANIMATE_WHEN_OPTS.some((o) => o.value === x.animateWhen)) errs.push({ key: f.key, message: `${n}: not an available animation trigger` });
      if (x.color !== undefined && !f.colors.includes(x.color)) errs.push({ key: f.key, message: `${n}: not an available colour` });
      if (x.showLabel !== undefined && x.showLabel !== false) errs.push({ key: f.key, message: `${n}: invalid label setting` });
      if (x.iconBg !== undefined && !['subtle', 'accent'].includes(x.iconBg)) errs.push({ key: f.key, message: `${n}: not an available icon background` });
      Object.entries(INFO_SIZE_RANGE).forEach(([k, [lo, hi]]) => { if (x[k] !== undefined && !(typeof x[k] === 'number' && x[k] >= lo && x[k] <= hi)) errs.push({ key: f.key, message: `${n}: ${k.replace('Size', '')} size is ${lo}–${hi} px` }); });
      if (typeof x.id !== 'string' || !/^i[a-z0-9]{1,12}$/.test(x.id) || ids.has(x.id)) errs.push({ key: f.key, message: `${n}: invalid id` });
      ids.add(x.id);
      if (typeof x.entity !== 'string' || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(x.entity) || x.entity.length > 120) errs.push({ key: f.key, message: `${n}: choose a Home Assistant entity (or remove the line)` });
      if (x.label !== undefined && (typeof x.label !== 'string' || x.label.length > 24 || /[<>]/.test(x.label))) errs.push({ key: f.key, message: `${n}: the label is at most 24 characters of plain text` });
      if (x.value !== undefined && (typeof x.value !== 'string' || !/^[a-z_]{1,40}$/.test(x.value))) errs.push({ key: f.key, message: `${n}: invalid source` });
    });
    return errs;
  }
  function validateConfig(type, config, opts = {}) {   // opts.form: the configuration form asks (a placed copy's required entities)
    const t = type && typeof type === 'object' ? type : schemaOf(type); if (!t) return [{ key: '', message: `Unknown type "${type}"` }];   // a definition object: a collection item
    let c = structuredClone(config || {});
    if (t.normalize) c = t.normalize(c);
    c = variantNormalize(t, commonNormalize(c));
    const errs = [];
    t.fields.forEach((f) => {
      if (!isShown(f, c)) return;
      const v = fieldValue(f, c), label = f.label;
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
      if (empty) { if (f.required) errs.push({ key: f.key, message: `${label} is required` }); return; }
      switch (f.type) {
        case 'text':
          if (typeof v !== 'string' && !(f.numeric && typeof v === 'number')) errs.push({ key: f.key, message: `${label} must be text` });
          else if (typeof v === 'string' && f.required && !v.trim()) errs.push({ key: f.key, message: `${label} is required` });
          else if (typeof v === 'string' && f.maxLength && v.length > f.maxLength) errs.push({ key: f.key, message: `${label}: at most ${f.maxLength} characters` });
          else if (typeof v === 'string' && /[<>]/.test(v)) errs.push({ key: f.key, message: `${label} cannot contain < or >` });
          else if (typeof f.accept === 'function' && v !== '' && v !== undefined && !f.accept(v)) errs.push({ key: f.key, message: `${label}: ${f.acceptMessage || 'only an http:// or https:// address'}` });
          break;
        case 'number': case 'range':
          if (typeof v !== 'number' || !Number.isFinite(v)) errs.push({ key: f.key, message: `${label} must be a number` });
          else if (f.min !== undefined && v < f.min) errs.push({ key: f.key, message: `${label} must be at least ${f.min}` });
          else if (f.max !== undefined && v > f.max) errs.push({ key: f.key, message: `${label} must be at most ${f.max}` });
          else if (f.integer && !Number.isInteger(v)) errs.push({ key: f.key, message: `${label} must be a whole number` });
          break;
        case 'boolean': if (typeof v !== 'boolean') errs.push({ key: f.key, message: `${label} must be on or off` }); break;
        case 'area': if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(v)) errs.push({ key: f.key, message: `${label}: not a Home Assistant area` }); break;
        case 'entity':
          if (typeof v !== 'string' || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(v) || v.length > 120) errs.push({ key: f.key, message: `${label}: not a Home Assistant entity id` });
          else if (f.domains && !f.domains.includes(v.split('.')[0])) errs.push({ key: f.key, message: `${label}: a ${f.domains.join(' / ')} entity is needed` });
          break;
        case 'select': case 'icon': {
          const ok = optionsOf(f, c).some((o) => o.value === v);
          if (!ok) errs.push({ key: f.key, message: `${label}: "${v}" is not an available option` });
          break;
        }
        case 'infoslots': errs.push(...infoErrors(f, v, label)); break;
        case 'mdi': if (typeof v !== 'string' || !(/^mdi:[a-z0-9-]{1,64}$/.test(v) || (typeof f.builtins === 'function' && f.builtins().includes(v)))) errs.push({ key: f.key, message: `${label}: not a Material Design Icon (mdi:…)` }); break;
        case 'color': if (!(f.options || []).includes(v) && !(f.custom && typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) && !(typeof f.accept === 'function' && f.accept(v))) errs.push({ key: f.key, message: `${label}: not an available colour` }); break;
        case 'collection': {
          // the list (its limit), every item against the item's own fields, and the collection's own rules
          if (!Array.isArray(v) || v.length > (f.max || 8)) { errs.push({ key: f.key, message: `${label}: at most ${f.max || 8}` }); break; }
          const noun = f.itemLabel ? f.itemLabel[0].toUpperCase() + f.itemLabel.slice(1) : label, def = { fields: f.fields };
          v.forEach((x, i) => {
            if (!x || typeof x !== 'object' || Array.isArray(x)) { errs.push({ key: f.key, message: `${noun} ${i + 1}: not valid` }); return; }
            [...validateConfig(def, x), ...((f.itemErrors && f.itemErrors(x)) || [])].forEach((e) => errs.push({ key: f.key, message: `${noun} ${i + 1}: ${e.message}` }));
          });
          if (f.check) errs.push(...f.check(v, label));
          break;
        }
        case 'corners': {
          const K = ['tl', 'tr', 'bl', 'br'];
          const ok = v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every((k) => K.includes(k)) && K.every((k) => {
            const x = v[k];
            return x && typeof x === 'object' && Object.keys(x).every((q) => q === 'shape' || q === 'r') && ['normal', 'concave'].includes(x.shape)
              && typeof x.r === 'number' && Number.isFinite(x.r) && x.r >= 0 && x.r <= 200;
          });
          if (!ok) errs.push({ key: f.key, message: `${label}: each corner needs a shape (normal / concave) and a radius of 0–200` });
          break;
        }
        case 'artwork':
          if (v === 'none') break;                                          // literally no image
          if (typeof v !== 'string' || !SAFE_URL.test(v)) errs.push({ key: f.key, message: `${label}: choose None, a built-in artwork or an uploaded image` });
          else if (USER_ASSET.test(v) && !f.upload) errs.push({ key: f.key, message: `${label}: this widget cannot show uploaded images` });
          break;
        case 'image':
          if (typeof v !== 'string' || !SAFE_URL.test(v)) errs.push({ key: f.key, message: `${label}: use a path under assets/ (or a widget’s own assets), an https:// address or an embedded image` });
          // an uploaded user image (api/asset.php?id=…) only where the widget declares it can show one (field upload: true)
          else if (USER_ASSET.test(v) && !f.upload) errs.push({ key: f.key, message: `${label}: this widget cannot show uploaded images` });
          break;
        case 'list': {
          if (!Array.isArray(v)) { errs.push({ key: f.key, message: `${label} must be a list` }); break; }
          if (v.some((x) => typeof x !== 'string' || !x.trim() || /[<>]/.test(x) || x.length > 40)) errs.push({ key: f.key, message: `${label}: every entry must be short plain text` });
          else if (new Set(v.map((x) => x.trim().toLowerCase())).size !== v.length) errs.push({ key: f.key, message: `${label}: duplicate entries` });
          const opts = f.options ? optionsOf(f, c).map((o) => o.value) : null;
          if (opts && v.some((x) => !opts.includes(x))) errs.push({ key: f.key, message: `${label}: unknown entry` });
          break;
        }
        default: break;
      }
    });
    // a type's own checks about a field that is not shown (a demo value while linked…) do not apply
    if (t.validate) errs.push(...t.validate(c, opts).filter((e) => { const f = t.fields.find((x) => x.key === e.key); return !f || isShown(f, c); }));
    return errs;
  }

  /** A DRAFT shown in a live preview may still be invalid while typing: image fields that are not
      a safe location are left out, so the preview never requests an unsafe URL. */
  function previewSafe(type, config) {
    const c = structuredClone(config || {});
    (schemaOf(type)?.fields || []).forEach((f) => {
      if (f.type !== 'image') return;
      const v = getPath(c, f.key);
      if (v !== undefined && (typeof v !== 'string' || !SAFE_URL.test(v))) setPath(c, f.key, undefined);
    });
    return c;
  }

  /** Gallery / sparse configs: defaults + the given overrides. */
  function build(type, config, content) {
    if (!TYPES[type]) throw new Error(`Unknown component type: ${type}`);
    return bound(type, fullConfig(type, config), content);
  }
  /** A widget linked to a Home Assistant entity (config.entity) on a page served by the IniqDash
      server is created through the shared IniqHA binding; otherwise exactly as before (demo data). */
  function bound(type, c, content) {
    const t = TYPES[type];
    // every widget's root element carries its package identity (data-widget="<id>", data-widget-source):
    // the hook a package's CSS can scope itself to — e.g. a future custom copy styling only itself
    const make = (cc) => {
      const v = variantOf(t, cc);                                         // VARIANT: the resolved presentation (null: none)
      const el = t.create(v ? { ...cc, variant: v } : cc, content);
      if (v && el && el.dataset) el.dataset.variant = v;
      if (t.pkg && el && el.dataset) { el.dataset.widget = t.pkg.id; el.dataset.widgetSource = t.pkg.source; }
      if (el && t.common) commonRuntime(type, t, el, cc);
      if (el && cc.theme && global.MaisonTheme) global.MaisonTheme.apply(el, cc.theme);
      // OWN SIZE (MaisonFit): every widget's root carries its own-size classes — never a layout container's
      if (el && el.dataset && t.kind !== 'layout' && global.MaisonFit) global.MaisonFit.ensure(el);
      return el;
    };
    // the HA binding: a factory widget's own (same name as its type), a custom widget's shared binding (t.ha) or none
    const binding = t.custom ? t.ha : type;
    // a custom widget with the ROLES binding: its declared roles / action slots are bound together (generic: the declaration is the package's)
    // (its Information lines too, when it offers them: decl.info = how many)
    const rdecl = t.custom && t.haDecl ? { ...t.haDecl, widget: type, info: t.common && t.common.info ? t.common.info.max : 0 } : null;
    if (rdecl && c && global.IniqHA?.enabled?.() && global.IniqHA.bindRoles && (global.IniqHA.rolesWanted ? global.IniqHA.rolesWanted(c, rdecl) : global.IniqHA.rolesIds?.(c, rdecl).length)) return visible(global.IniqHA.bindRoles(c, make, rdecl), c);
    // a widget of MANY entities (Entity List) has no primary entity: its rows are bound together
    // several entities (a list) — or entities the binding DISCOVERS itself (Batteries: every battery sensor) unless the config chose them
    const discovers = !!global.IniqHA?.bindings?.[binding]?.discover && c && c.auto !== false;
    if (binding && c && !c.entity && global.IniqHA?.enabled?.() && global.IniqHA.bindMany && (global.IniqHA.manyOf?.(binding, c).length || discovers)) return visible(global.IniqHA.bindMany(binding, c, make), c);
    if (binding && c && c.entity && global.IniqHA?.enabled?.() && global.IniqHA.bind) {
      // a custom package's declared action channel (its id goes along so the server can check the declaration)
      const opts = t.custom && t.haActions ? { widget: type, actions: t.haActions.actions, domains: t.haActions.domains } : null;
      return visible(global.IniqHA.bind(binding, c, make, opts), c);
    }
    const el = make(c);
    return visible(demoMarker && !t.custom && DEMO_DATA.includes(type) && global.IniqHA?.enabled?.() ? demoMarked(el) : el, c);
  }
  /* widgets whose unlinked content is DEMO data (values, states, events…). On the live IniqDash server — where linked
     widgets show real Home Assistant data — such a widget carries a small "Demo" tag, so its demo values are never
     mistaken for live data. Never on a linked widget, never in a local / demo page (no server), nothing is stored. */
  let demoMarker = false;            // switched on by the live dashboard (assets/js/editor-demo.js on the server) only
  const DEMO_DATA = ['light', 'switch', 'climate', 'cover', 'fan', 'media', 'camera', 'lock', 'alarm', 'sensor', 'gauge', 'chart', 'weather', 'person', 'appliance', 'calendar', 'numsel', 'energy', 'robot', 'entitylist', 'timer', 'sunmoon'];
  function demoMarked(el) {
    if (!el) return el;
    const wrap = document.createElement('div');
    wrap.className = 'iqdemo';
    const tag = document.createElement('span');
    tag.className = 'iqdemo__tag';
    tag.textContent = 'Demo';
    tag.title = 'Demo data — not linked to Home Assistant';
    wrap.append(el, tag);
    return wrap;
  }
  /** COMMON capabilities on the widget's own root (every time it is created — also when a binding rebuilds it):
      corners (only when configured: otherwise the widget's own radius is untouched) and card interactions. */
  function commonRuntime(type, t, el, c) {
    const K = global.IniqWidgetKit, com = t.common;
    if (!K || !c) return;
    if (com.corners && c.corners && (!com.corners.when || com.corners.when(c))) K.corners(el, c.corners);
    if (com.surface !== false && K.surface) K.surface(el, c);
    const label = () => String(c.name || c.primary || c.text || c.location || t.label || '');
    const linked = !t.custom && !!c.entity && !!global.IniqHA?.enabled?.() && hasBinding(type);
    if (com.interactions) {
      const verb = (action) => () => entityRequest(type, el, action);
      K.interactions(el, {
        get: () => c.interactions, defaults: com.interactions.defaults || {}, widget: type, label,
        verbs: { ...(com.interactions.entity ? { toggle: verb('toggle'), turn_on: verb('turn_on'), turn_off: verb('turn_off') } : {}),
          ...(linked ? { details: () => requestDetails(el, c, label()) } : {}) },
      });
    }
    // the optional ⋮ button (off unless the owner switched it on): one of the widget's OWN controls (never a card gesture)
    if (com.more && linked && c.moreButton === true && el && !el.querySelector(':scope > .iq-more')) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'iq-more'; b.dataset.iqControl = '';
      b.setAttribute('aria-label', `Details: ${label() || c.entity}`);
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="18.5" r="1.8"/></svg>';
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); requestDetails(el, c, label(), 'more'); });
      el.classList.add('iq-more-host');
      el.append(b);
    }
  }
  /** ENTITY DETAILS of the widget's linked entity: a request to the application (the same dispatcher as popup / navigate),
      which opens the system Details surface — refused in the configuration preview, inert while editing. Read-only. */
  function requestDetails(el, c, label, source = 'interaction') {
    el.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: {
      action: { type: 'details', entity: c.entity, info: Array.isArray(c.info) ? c.info.map((x) => ({ ...x })) : [], label },
      meta: { source }, widget: 'details' } }));
  }
  /** a card interaction's entity action: linked → the binding's secure request (IniqHA, server-planned; refused in the
      configuration preview); not linked (demo) → the widget's own local state, through its public setState */
  function entityRequest(type, el, action) {
    const w = el.closest && el.closest('.iqha');
    if (w && w.iqha && typeof w.iqha.request === 'function') return w.iqha.request(action);
    const api = el[type];
    if (!api || typeof api.getState !== 'function' || typeof api.setState !== 'function') return null;
    const on = api.getState().state === 'on';
    api.setState({ state: (action === 'toggle' ? !on : action === 'turn_on') ? 'on' : 'off' });
    return null;
  }
  /** a visibility condition (common capability) follows its entity live; the item keeps its grid footprint */
  const visible = (el, c) => (c && c.visibility && c.visibility.entity && global.IniqWidgetKit ? global.IniqWidgetKit.visibility(el, c.visibility) : el);
  /** Editor: the model stores COMPLETE configs (materialised from the defaults when an item is
      created or a file is loaded), so the component receives exactly what is stored — a value the
      designer removed does not come back from the defaults. */
  function instantiate(type, config, content) {
    const t = TYPES[type];
    if (!t) throw new Error(`Unknown component type: ${type}`);
    let c = structuredClone(config || {});
    if (t.normalize) c = t.normalize(c);
    return bound(type, variantNormalize(t, commonNormalize(c)), content);
  }

  /* ---- Copy / Paste STYLE (foundation). A widget's style is only what every widget shares and nothing functional:
     the corner radii (types that offer them) and the theme override. Entity, mappings, labels, variant (type specific),
     interactions, visibility and layout are never part of it, so a style can be pasted onto ANY other widget. */
  const SURFACE_KEYS = ['widgetBg', 'widgetBgOpacity', 'hover', 'hoverOpacity', 'hoverColor', 'hoverGlow', 'hoverLift', 'hoverMs'];
  const STYLE_KEYS = ['corners', 'theme', ...SURFACE_KEYS];
  function styleOf(config) {
    const c = config || {}, out = {};
    STYLE_KEYS.forEach((k) => { if (c[k] !== undefined) out[k] = structuredClone(c[k]); });
    return out;
  }
  /** the config with the style pasted over its style keys (absent in the style → removed; corners only where the type has them) */
  function withStyle(type, config, style) {
    const t = schemaOf(type), c = structuredClone(config || {}), st = style || {};
    STYLE_KEYS.forEach((k) => {
      if (k === 'corners' && !(t && t.common && t.common.corners)) return;
      if (SURFACE_KEYS.includes(k) && !(t && t.common && t.common.surface !== false)) return;     // (layout items have no widget surface)
      if (st[k] === undefined) delete c[k]; else c[k] = structuredClone(st[k]);
    });
    return fullConfig(type, c);
  }

  /** icon names usable for pages (and anything else using the shared icon set) */
  const pageIcons = () => keysOf(C_ICONS());
  /** widget packages (read-only copies of their manifests) */
  const packages = () => PACKAGES.map((m) => ({ ...m }));
  const packageOf = (type) => (PKG[type] ? { ...PKG[type] } : null);
  /** a file in a widget package's assets folder, as the pages reference it (e.g. widgets/default/light/assets/x.png) */
  const assetUrl = (type, file) => (PKG[type] && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file) ? `${PKG[type].path}${PKG[type].assets}${file}` : null);
  const rejectedPackages = () => customData.rejected.map((r) => ({ ...r }));
  /** the gallery's collection choices (Built-in, General, then the discovered collections) and category headings */
  /* COLLECTION = a user-facing ORGANISATIONAL group (IniqDash · an installed collection · one you created in Studio, e.g. Maison);
     CATEGORY = what kind of widget it is; SOURCE (built-in · installed · user) = where it comes from, kept apart (T.source). None of the
     three changes what a widget does. "General" (standalone packages you installed) is listed only while there is one. */
  const userCollections = () => (global.IniqStudioLibrary && global.IniqStudioLibrary.collections ? global.IniqStudioLibrary.collections() : []);
  const collections = () => [{ id: 'iniqdash', name: 'IniqDash', virtual: true, description: 'IniqDash’s own widgets' },
    ...userCollections().map((c) => ({ id: c.id, name: c.name, user: true })), ...COLLECTIONS.map((c) => ({ ...c })),
    ...(Object.values(TYPES).some((t) => t.collection === 'general' && !t.hidden) ? [{ id: 'general', name: 'General', virtual: true }] : [])];
  const collectionName = (id) => (id === 'iniqdash' ? 'IniqDash' : id === 'general' ? 'General' : COLL[id] ? COLL[id].name : (userCollections().find((c) => c.id === id) || {}).name || '');
  /** the gallery's entries for the Widget Studio definitions: each one a gallery tile that adds an INSTANCE of it (a "studio" item
      referencing the definition) — in ITS collection and category, with its gallery icon; source: user */
  const library = () => (global.IniqStudioLibrary ? global.IniqStudioLibrary.list() : []).map((w) => {
    const m = w.definition.meta, cat = CATEGORIES[m.category] ? m.category : 'custom';
    return [`my:${w.id}`, { label: m.name, description: m.description || '', collection: typeof m.collection === 'string' && m.collection ? m.collection : 'iniqdash', source: 'user', category: cat, group: categoryLabel(cat), icon: m.icon, glyph: G.studio,
      tags: ['studio'], size: TYPES.studio.size, instance: { type: 'studio', config: { definition: w.id, entities: {} } } }];   // a new copy: its own (empty) entities
  });
  /* the FOUNDATION's configuration builders (components/foundation): each shared component's editor, capability-driven — the same
     builders the widgets use (a future Widget Studio's property panel reads them from IniqComponents.editor(id)) */
  if (global.IniqComponents) {
    const IC = global.IniqComponents, ALL_INFO = ['entity', 'value', 'showLabel', 'label', 'icon', 'style', 'align', 'valueSize', 'labelSize', 'labelPos', 'iconSize', 'iconPos', 'iconBg', 'color', 'valueColor', 'animation', 'animateWhen'];
    IC.editor('button', (o = {}) => CONTROL.button(o));
    IC.editor('toggle', (o = {}) => CONTROL.button({ fields: ['style', 'size', 'color', 'stateLook', 'icon', 'iconSize', 'iconColor'], ...o }));
    // a segmented control's OPTIONS as a collection (a host that owns its options: a composed widget) + its look
    IC.editor('segmented', (o = {}) => [
      ...(o.label ? [{ key: 'label', type: 'text', label: 'Name', group: 'content', optional: true, maxLength: 24, help: 'Its accessible name.' }] : []),
      ...(o.options ? [{ key: 'options', type: 'collection', label: 'Options', group: 'content', srLabel: true, max: 6, itemLabel: 'option', addLabel: '+ Add option',
        get: (c) => (Array.isArray(c.options) ? c.options : []), set: (c, l) => { c.options = l; },
        create: (list) => { const used = new Set(list.map((x) => x && x.id)); let k = 1; while (used.has(`o${k}`)) k++; return { id: `o${k}`, label: `Option ${k}` }; },
        // OPTION: label · value · icon, then its style — an option has NO action of its own: it only means something through its control's
        // Property (matched against the property's value, and sent through it when chosen); without a property it is display only
        fields: [{ key: 'label', type: 'text', label: 'Label', optional: true, maxLength: 20 },
          { key: 'value', type: 'text', label: 'Value', optional: true, maxLength: 60, help: 'Matched against the control\u2019s Property and sent through it when chosen — only once the control has a Property. Empty: its id.' },
          { key: 'icon', type: 'mdi', label: 'Icon', optional: true },
          { key: 'showLabel', type: 'boolean', label: 'Show label', get: (c) => c.showLabel !== false, set: (c, v) => { if (v) delete c.showLabel; else c.showLabel = false; } },
          { key: 'color', type: 'color', label: 'Active colour', optional: true, custom: true, options: INFO_COLORS }],
        summary: (x, i) => ({ icon: typeof x.icon === 'string' && /^mdi:/.test(x.icon) ? x.icon : null, title: x.label || x.id || `Option ${i + 1}`, sub: x.id || '' }) }] : []),
      // its look: the shared fields — the Control height only where the host does not size it (a composed control's height is its box),
      // a Text size only where the host asks for one (opt-in: Light's and Climate's editors are unchanged)
      ...(o.text ? [{ key: 'textSize', type: 'range', label: 'Text size', group: 'look', unit: 'px', min: 8, max: 48, step: 1, auto: 'Automatic', help: 'The option labels — independent of the control’s height.' }] : []),
      ...CONTROL.segmented({}, o.when || null).filter((f) => !(o.height === false && f.key === 'height'))]);
    IC.editor('regions', (o = {}) => [...CONTROL.placement(o), ...CONTROL.offset(o)]);
    IC.editor('information', (o = {}) => infoItemFields(o.fields || ALL_INFO, o));
    IC.editor('icon', (o = {}) => infoItemFields(o.fields || ['icon', 'iconSize', 'color', 'iconBg', 'animation', 'animateWhen'], o));
    IC.editor('information-bar', () => CLIMATE_BAR_FIELDS.slice());
    IC.editor('dial', (o = {}) => dialFields(o));
    IC.editor('slider', (o = {}) => sliderFields(o));
    IC.editor('surface', () => F.widgetSurface());
    // an IMAGE: the shared artwork picker — the HOST says whose image library it is (its widget type: scope) and its built-in artworks
    IC.editor('image', (o = {}) => [
      ...F.artwork('image', 'Image', { group: 'image', builtins: o.builtins || [], fallback: null }),
      { key: 'fit', type: 'select', label: 'Fit', group: 'image', half: true, get: (c) => c.fit || 'cover', options: opts([['cover', 'Cover'], ['contain', 'Contain']]) },
      { key: 'radius', type: 'range', label: 'Corner radius', group: 'image', unit: 'px', min: 0, max: 80, step: 1, auto: 'Automatic', autoValue: 12 },
      { key: 'opacity', type: 'range', label: 'Opacity', group: 'image', unit: '%', min: 0, max: 100, step: 1, auto: 'Automatic', autoValue: 100 },
      // CROP: which part of the picture stays in view, and how far in
      { key: 'focusX', type: 'range', label: 'Crop: horizontal focus', group: 'image', unit: '%', min: 0, max: 100, step: 1, auto: 'Centre', autoValue: 50, optional: true },
      { key: 'focusY', type: 'range', label: 'Crop: vertical focus', group: 'image', unit: '%', min: 0, max: 100, step: 1, auto: 'Centre', autoValue: 50, optional: true },
      { key: 'zoom', type: 'range', label: 'Crop: zoom', group: 'image', unit: '%', min: 100, max: 400, step: 5, auto: 'None', autoValue: 100, optional: true }]);
  }

  const API = { styleOf, withStyle, STYLE_KEYS, linkedTo, demoMarker: (on) => { demoMarker = !!on; }, USER_ASSET, packages, packageOf, placeholder, rejectedPackages, collections, collectionName, library, categoryLabel, CATEGORIES, assetUrl, TYPES, DEFS, EVENTS, ANIMS, schemaOf, build, instantiate, previewSafe, span, fullConfig, validateConfig, getPath, setPath, optionsOf, fieldValue, isShown, distinct, SAFE_URL, pageIcons, icons: C_ICONS, RADIAL_TYPES, variantOf, variantPreview, LEGACY_CATEGORY };
  /** application context for schema rules that refer to it: { pages, popups, templates: [{ id, name }] } — set by the
      editor (live pages) and by model validation (the pages of the file being checked) */
  Object.defineProperty(API, 'context', { get: () => MaisonRegistryRef.context, set: (v) => { MaisonRegistryRef.context = v || { pages: [], popups: [], templates: [] }; }, enumerable: true });
  global.MaisonRegistry = API;
})(window);
