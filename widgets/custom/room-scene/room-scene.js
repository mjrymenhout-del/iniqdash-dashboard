/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Room / Scene Widget — a room as one card: its title, its picture (reacting to the room's real lights), the Information the owner chose,
   the owner's scene /
   action buttons (as many as configured, up to MAX_SCENES) and the way into the room. A DISPLAY plus launcher: it knows nothing about Home Assistant services — a press
   asks the host through the declared action slot (haRequest → the secure IniqHA channel, which plans a fixed service).

   IniqRoomScene.create(config) → HTMLElement (.iq-room), with el.room = { getState(), setState(patch) }

   config = {
     id, name:      'Living Room'
     area:          the Home Assistant AREA this room represents (HA's area id): the editor's entity lists open on it, and the room's LIGHTS
                    are every light HA places in it (widget.json role "lights", "area": true — own or device area, never a name). Without an
                    area, an older Room's own light mapping (haRoles.lights) is used
     image:         the ARTWORK (the shared Image / Artwork picker): the bundled picture · an uploaded one (IniqDash User Assets
                    "api/asset.php?id=…") · 'none' / absent: no picture — then the fallback icon if one is chosen, else nothing
     fallbackIcon:  { icon: 'mdi:…', color?, background? ('none' | 'accent'; absent: subtle), animation?, animateWhen? } — the room's visual identity when it has no picture; it
                    animates (the shared IniqIcons animation) only as configured: "active" = one of the room's lights is on
     variant:       'scene' (default: the picture is the card) | 'status' (information / control card, no picture)
     page:          the dashboard page the chevron opens   devicesPage: the page the "Devices ›" chip opens (Large only)
     scenes:        [{ label?, icon? }]   the scene entries in order, up to MAX_SCENES (the Home Assistant entity of entry i is the owner's
                    mapping in config.haSlots.scenes[i] — same position). An entry with no label, icon or entity draws no button.
                    More entries than the card's own size can show: the last visible tile is "+N", which opens the scene panel (all scenes);
                    the Micro card has no scene row: its small "scenes" button opens the same panel.
     info:          [{ id, entity, label?, icon?, color?, value? }]   the INFORMATION the owner added, in display order (the shared Information
                    capability, define() common.info): each line is one entity's real value with the owner's label, icon and icon colour
                    (a design-token name). None added → no information strip.
     haState:       (from the generic ROLES binding, widget.json "ha") { roles: { lights: [entry…] }, slots: { scenes: [entry|null…] },
                    info: [line…] }, entry = { entity, status: 'loading'|'missing'|'ready', state: <normalised entity>|null },
                    line = the shared Information item (state 'loading'|'missing'|'absent'|'ready', text in HA's words with its unit, the
                    entity's name and device class); replaced through el.haState(state) on every change
     haRequest:     ({ slot: 'scenes', index, action: 'trigger' }) → Promise<{ ok, error? }>   (a slot and an index — never an entity or a service)
   }
   THREE SEPARATE THINGS (the reference split for widgets with real Home Assistant context):
     INFORMATION       what is SHOWN as text — ONLY config.info, the owner's lines, in their order (infoStats). Nothing else ever becomes
                       visible text: no summary line, no automatic light words, no promoted temperature. None added → no strip at all.
     FUNCTIONAL STATE  what the room KNOWS from HA (functionalState): its lights (the Area's, or an older Room's own mapping) — never text.
     VISUAL STATE      how the ARTWORK reacts to that real state (visualState → applyVisual): today the room light treatment (data-lit).
   The picture follows the MAPPED LIGHTS only (data-lit): any light reported on → full colour; every light reported off → the same
   picture desaturated and dimmed; a light Home Assistant does not report (loading / unavailable / unknown) → a neutral dimmed picture,
   never the lit one; no light mapped → the picture as it is.
   Card gestures (tap / double tap / long press) are the shared IniqDash Interactions (define() common.interactions, applied by the
   registry); the scene buttons, the chevron and the panel are the widget's own controls and never a card gesture.
   Nothing is invented: a value that is not mapped (or not reported) is simply not drawn. A scene is shown ACTIVE only when Home
   Assistant says so (a running script); otherwise a press is shown as press feedback for a moment — never as a remembered scene.
   Arrangements follow the widget's OWN box (MaisonFit, data-fit-arr): micro · compact · horizontal · normal · large (scene);
   status is always the information / control card.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  /** the icons a scene button can use (original stroke glyphs, one family) */
  const ICONS = {
    bulb: S('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
    movie: S('<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><path d="M8 4.5v15M16 4.5v15M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5M10.6 9.4l3.4 2.6-3.4 2.6z"/>'),
    lamp: S('<path d="M8.2 4h7.6l2.7 8.5h-13z"/><path d="M12 12.5V19M8.5 20h7"/>'),
    power: S('<path d="M12 3.5v8"/><path d="M6.6 6.8a7.5 7.5 0 1 0 10.8 0"/>'),
    moon: S('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
    sun: S('<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
    star: S('<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
    sofa: S('<path d="M5 11V8.5A2.5 2.5 0 0 1 7.5 6h9A2.5 2.5 0 0 1 19 8.5V11"/><path d="M3.5 12.5a1.8 1.8 0 0 1 3.6 0V15h9.8v-2.5a1.8 1.8 0 0 1 3.6 0V18H3.5z"/><path d="M6 18v1.5M18 18v1.5"/>'),
    music: S('<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.8" cy="17.5" r="2.2"/><circle cx="16.8" cy="15.5" r="2.2"/>'),
    home: S('<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/>'),
    bed: S('<path d="M3.5 18V6.5M3.5 14h17v4M20.5 14v-2.2A2.8 2.8 0 0 0 17.7 9H11v5"/><circle cx="7.4" cy="10.8" r="1.8"/>'),
    door: S('<path d="M6 20V4.5h8.5V20M4 20h16"/><circle cx="12" cy="12.4" r=".7" fill="currentColor"/>'),
    thermo: S('<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>'),
    leaf: S('<path d="M5 19c0-8 5-13.5 14-14 .4 8.6-4.6 14-12.5 14"/><path d="M5 19c2.5-4 5.5-6.5 9-8"/>'),
    chevron: S('<path d="m9 5.5 6.5 6.5L9 18.5"/>'),
    gear: S('<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>'),
  };
  /* ICONS of scenes and Information lines: Material Design Icons ("mdi:<name>", the shared IniqIcons layer and picker). Room 1.4 and
     earlier stored its own icon names: they are read as their MDI equivalents (LEGACY_ICONS) — nothing is lost. */
  const LEGACY_ICONS = {
    bulb: 'mdi:lightbulb', movie: 'mdi:movie-open', lamp: 'mdi:lamp', power: 'mdi:power', moon: 'mdi:weather-night', sun: 'mdi:weather-sunny',
    star: 'mdi:star', sofa: 'mdi:sofa', music: 'mdi:music', home: 'mdi:home', bed: 'mdi:bed', door: 'mdi:door', thermo: 'mdi:thermometer',
    drop: 'mdi:water-percent', leaf: 'mdi:leaf', wind: 'mdi:weather-windy', gauge: 'mdi:gauge', bolt: 'mdi:flash', battery: 'mdi:battery',
    window: 'mdi:window-closed-variant',
  };
  const MDI = /^mdi:[a-z0-9-]{1,64}$/;
  /** an icon value as an MDI id (an old Room icon name → its MDI equivalent), or null */
  const mdiOf = (v) => (typeof v !== 'string' ? null : MDI.test(v) ? v : LEGACY_ICONS[v] || null);
  /* the shared components through IniqDash's PUBLIC, versioned interface (components/foundation/public.js) — never a private global;
     an older IniqDash without it: the same modules by their names */
  const UI = (name) => (global.IniqDashUI && global.IniqDashUI[name]) || global[{ info: 'IniqInfo', icons: 'IniqIcons', controls: 'IniqControls' }[name]] || null;
  const fillIcons = (el) => { if (UI('icons')) UI('icons').fill(el); };
  const MAX_SCENES = 8;          // the action-slot contract's limit (widget.json "max", 1–8): a safety limit, never empty slots
  /** a list kept BY POSITION (entry i belongs to action slot i): an array, or the form's { 0: …, 3: … } shape */
  const posList = (raw) => {
    if (Array.isArray(raw)) return raw.slice(0, MAX_SCENES);
    const out = [];
    if (raw && typeof raw === 'object') Object.keys(raw).forEach((k) => { const i = Number(k); if (Number.isInteger(i) && i >= 0 && i < MAX_SCENES) out[i] = raw[k]; });
    return out;
  };
  /** the scene entries of a configuration, by position: [{ label?, icon? }…] (sanitised; never more than MAX_SCENES) */
  function sceneEntries(c) {
    const raw = posList(c.scenes), slots = posList(c.haSlots && c.haSlots.scenes);
    const n = Math.min(MAX_SCENES, Math.max(raw.length, slots.length));
    return Array.from({ length: n }, (_, i) => {
      const x = raw[i] && typeof raw[i] === 'object' ? raw[i] : {}, o = {};
      if (typeof x.label === 'string' && x.label.trim()) o.label = x.label.replace(/[<>]/g, '').slice(0, 16);
      const ic = mdiOf(x.icon); if (ic) o.icon = ic;
      Object.assign(o, sceneLook(x, !!ic));
      return o;
    });
  }
  /* A SCENE BUTTON'S OWN APPEARANCE (the scene editor's Appearance group): button colour and icon colour (a design-token name or a custom
     "#rrggbb" — never any other CSS), button size (28–120 px) and icon size (12–72 px), style (filled · soft · outline · bare), shape
     (rounded · circle · pill), showLabel (false: icon only — no label space). Absent: the theme's scene button for the variant and size
     (older Rooms keep their look). Sanitised here — the only place a scene's appearance is read. */
  const SCENE_STYLES = ['filled', 'soft', 'outline', 'bare'], SCENE_SHAPES = ['rounded', 'circle', 'pill'];
  const colorOk = (v) => typeof v === 'string' && (INFO_COLORS.includes(v) || /^#[0-9a-fA-F]{6}$/.test(v));
  const numIn = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined);
  function sceneLook(x, hasIcon) {
    const o = {};
    if (SCENE_STYLES.includes(x.style)) o.style = x.style;
    if (SCENE_SHAPES.includes(x.shape)) o.shape = x.shape;
    if (colorOk(x.color) && o.style !== 'bare') o.color = x.color.toLowerCase ? x.color.toLowerCase() : x.color;
    if (hasIcon && colorOk(x.iconColor)) o.iconColor = x.iconColor.toLowerCase();
    const sz = numIn(x.size, 28, 120); if (sz !== undefined) o.size = sz;
    const is = hasIcon ? numIn(x.iconSize, 12, 72) : undefined; if (is !== undefined) o.iconSize = is;
    if (x.showLabel === false) o.showLabel = false;
    return o;
  }
  const cssColor = (v) => (INFO_COLORS.includes(v) ? `var(--${v})` : /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);   // a token, or a validated #rrggbb
  /** how many of the owner's Information lines the strip shows for the card's own size — always the FIRST ones (the owner's order is the
      priority); Large and Status show the most, Normal a few, the smaller cards none. Nothing is ever shown instead of them. */
  function infoCapacity(arr, w, variant) {
    if (!(w > 0)) return MAX_INFO;
    if (variant === 'status') return Math.max(1, Math.min(MAX_INFO, Math.floor(w / 120)));
    if (arr === 'large') return Math.max(2, Math.min(MAX_INFO, Math.floor((w - 80) / 170)));
    if (arr === 'normal') return Math.max(1, Math.min(4, Math.floor((w - 40) / 140)));
    return 0;                                                            // compact · horizontal · micro: the title, the picture, the scenes
  }
  /** the scene tiles the card can show directly for its own size (the rest stay reachable through the "+N" tile / the panel) */
  function capacity(arr, w, h) {
    if (!(w > 0)) return MAX_SCENES;                                    // not measured yet
    const fit = (avail, tile, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(avail / tile)));
    switch (arr) {
      case 'micro': return 0;
      case 'compact': return fit(w * 0.6, 58, 2, 4);
      case 'horizontal': return fit(w - Math.min(230, h) - 150, 66, 2, 6);
      case 'large': return fit(w - 120, 120, 3, 7);
      default: return fit(w - 110, 76, 2, 6);                           // normal · status
    }
  }
  /** the design-token colours an Information line's icon may take */
  const INFO_COLORS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];   // = the registry's allow-list
  const MAX_INFO = 8;

  /* VARIANTS — the same Room, its own content and state, presented four ways (config.variant; the generic Variant field). Each has its own
     Micro · Compact · Normal · Large composition for the widget's OWN size (arrangement() + limits()); the CSS is keyed on
     data-variant × data-fit-arr. One DOM tree for all of them. */
  const VARIANTS = ['scene', 'card', 'status', 'minimal'];             // 'scene' = Hero (the original card: an older Room keeps its look)
  /* APPEARANCE — semantic choices, stored as these allow-listed values only (never CSS); the first value of each is the default (not
     stored). Only the choices that mean something for the variant are offered (LOOK_FOR); the others are ignored at runtime. */
  const LOOK = {
    align: ['left', 'center', 'right'],
    imageTreatment: ['natural', 'dark', 'dim', 'soft'],
    overlay: ['medium', 'light', 'strong'],
    infoStyle: ['auto', 'pills', 'clean', 'tiles'],
    sceneStyle: ['auto', 'buttons', 'icons', 'compact'],
    titleSize: ['auto', 'small', 'medium', 'large'],
  };
  const LOOK_FOR = {
    scene: ['align', 'imageTreatment', 'overlay', 'infoStyle', 'sceneStyle', 'titleSize'],
    card: ['align', 'imageTreatment', 'infoStyle', 'sceneStyle', 'titleSize'],
    status: ['align', 'infoStyle', 'sceneStyle', 'titleSize'],                  // the picture is only a faint backdrop: no treatment
    minimal: ['align', 'imageTreatment', 'sceneStyle', 'titleSize'],            // its one or two values are plain text
  };
  /** "Automatic" Information / scene style of a variant at a size (the Hero keeps its own strip and tiles: 'auto') */
  const AUTO_LOOK = {
    card: { micro: ['clean', 'icons'], compact: ['clean', 'icons'], normal: ['clean', 'buttons'], large: ['tiles', 'buttons'] },
    status: { micro: ['clean', 'icons'], compact: ['clean', 'icons'], normal: ['tiles', 'buttons'], large: ['tiles', 'buttons'] },
    minimal: { micro: ['clean', 'icons'], compact: ['clean', 'icons'], normal: ['clean', 'icons'], large: ['clean', 'icons'] },
  };
  const variantOf = (c) => (VARIANTS.includes(c && c.variant) ? c.variant : 'scene');
  /** the resolved presentation of a configuration for a variant at an arrangement: { align, image, overlay, title, info, scene } */
  function looks(c, variant, arr) {
    const pick = (k) => (LOOK_FOR[variant].includes(k) && LOOK[k].includes(c[k]) ? c[k] : LOOK[k][0]);
    const auto = (AUTO_LOOK[variant] && AUTO_LOOK[variant][arr]) || ['auto', 'auto'];
    const info = pick('infoStyle'), scene = pick('sceneStyle');
    return { align: pick('align'), image: pick('imageTreatment'), overlay: pick('overlay'), title: pick('titleSize'),
      info: variant === 'minimal' ? 'clean' : info !== 'auto' ? info : auto[0], scene: scene !== 'auto' ? scene : auto[1] };
  }
  /** what a variant shows at a size: how many of the owner's Information lines (always the FIRST ones), how many scene tiles (the last
      one becomes "+N" when there are more) and the tile columns of the Tiles style. Never more than fits; never anything else instead. */
  function limits(variant, arr, w, h, look) {
    const lk = look || { scene: 'auto', info: 'auto' };
    if (!(w > 0)) return { info: MAX_INFO, scenes: MAX_SCENES, perRow: 2 };
    const fit = (avail, tile, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(avail / tile)));
    const pad = 2 * Math.max(12, Math.min(24, w * 0.036));
    let info, row, button, hi;
    if (variant === 'scene') {
      info = infoCapacity(arr, w, variant);
      if (lk.scene === 'auto') return { info, scenes: capacity(arr, w, h), perRow: 4 };
      row = arr === 'compact' || arr === 'horizontal' ? w - Math.min(230, Math.max(92, w * 0.3)) - 60 : w - pad - 70;
      button = arr === 'large' ? 130 : 84; hi = arr === 'large' ? 7 : 6;
    } else if (variant === 'card') {
      const side = arr === 'compact' ? Math.max(96, Math.min(180, w * 0.34)) : arr === 'normal' ? Math.max(120, Math.min(200, w * 0.36)) : Math.max(220, Math.min(420, w * 0.38));
      row = w - side - pad;
      info = { micro: 1, compact: fit(row, 104, 1, 2), normal: 3, large: 4 }[arr];
      button = arr === 'large' ? 104 : 66; hi = arr === 'large' ? 6 : 4;
      if (arr === 'compact' && h < 150) hi = 0;                        // too short for a scene row: the scenes button instead
    } else if (variant === 'status') {
      row = w - pad;
      info = { micro: 1, compact: fit(row, 104, 1, 3), normal: 4, large: 6 }[arr];
      button = arr === 'large' ? 120 : 84; hi = arr === 'compact' ? 6 : arr === 'large' ? 7 : 5;
      if (arr === 'compact' && h < 160) hi = 0;
    } else {                                                            // minimal
      row = arr === 'compact' ? w - pad - Math.max(44, Math.min(72, h * 0.46)) - 12 : w - pad;
      info = { micro: 1, compact: 1, normal: 2, large: 3 }[arr];
      button = 84; hi = arr === 'large' ? 8 : arr === 'normal' ? 6 : 5;
      if (arr === 'compact' && h < 140) hi = 0;
    }
    const tile = lk.scene === 'icons' ? (arr === 'large' ? 58 : 50) : lk.scene === 'compact' ? 104 : button;
    const scenes = arr === 'micro' || !hi ? 0 : fit(row, tile, 1, hi);
    const perRow = Math.max(1, Math.floor(row / (arr === 'large' ? 170 : 130)));
    if (lk.info === 'tiles' && (arr === 'compact' || arr === 'micro')) info = Math.min(info, perRow);   // a short card: one row of tiles at most
    if (lk.info === 'tiles' && variant === 'status' && (arr === 'normal' || arr === 'large')) {
      // Status: as many rows of tiles as the height leaves under the name and above the scene row (never clipped)
      const tileH = arr === 'large' ? 112 : 78, below = scenes ? (arr === 'large' ? 120 : 76) : 0;
      info = Math.min(info, perRow * Math.max(1, Math.floor((h - pad - (arr === 'large' ? 52 : 40) - below) / tileH)));
    }
    return { info, scenes, perRow };
  }
  /** the Tiles style's columns for n shown lines: one row when they fit, else balanced rows (5 → 3 + 2, 6 → 3 + 3) */
  const tileCols = (n, perRow) => Math.max(1, n <= perRow ? n : Math.ceil(n / Math.ceil(n / perRow)));

  /** the Room's SKIN of the shared information item (IniqInfo.render): a line of its strip — its own element, class names and sizes
      (px, the shared Slider + Number; absent: the card's own sizes for its size and style); the icon colour is a token on the icon */
  const LINE_SKIN = {
    tag: 'li', root: 'iq-room__stat', ic: 'iq-room__sicon', txt: 'iq-room__stxt', v: 'iq-room__sval', vTag: 'b', l: 'iq-room__slab',
    decorate(li, x) {
      li.dataset.info = x.id;
      [['i', x.iconSize], ['v', x.valueSize], ['l', x.labelSize]].forEach(([k, n]) => { if (typeof n === 'number') { li.dataset[`${k}sz`] = ''; li.style.setProperty(`--iq-ri-${k}`, `${n}px`); } });
      if (x.icon && x.iconBg) li.dataset.ibg = '';
    },
    icon: (x) => ({ ...(x.color ? { color: x.color } : {}), ...(x.iconBg ? { background: x.iconBg } : {}) }),
    state(li, view) { li.classList.toggle('iq-room__stat--off', view.state !== 'ready'); },
  };

  function create(config) {
    let s = { variant: 'scene', ...(config || {}) };
    const variant = variantOf(s);
    const root = document.createElement('article');
    root.className = 'iq-room';
    root.dataset.variant = variant;
    root.setAttribute('role', 'group');
    if (s.id) root.dataset.iqRoomId = s.id;
    root.innerHTML = `
      <div class="iq-room__media" aria-hidden="true"><img class="iq-room__img" alt="" decoding="async" draggable="false"><span class="iq-room__fallback"></span><span class="iq-room__vicon"></span></div>
      <div class="iq-room__shade" aria-hidden="true"></div>
      <div class="iq-room__in">
        <header class="iq-room__head">
          <div class="iq-room__id"><h3 class="iq-room__name"></h3><span class="iq-room__badge" aria-hidden="true">${ICONS.bulb}</span></div>
          <div class="iq-room__corner"><button type="button" class="iq-room__devices"><span class="iq-room__devices-t">Devices</span><span class="iq-room__chev" aria-hidden="true">${ICONS.chevron}</span></button></div>
        </header>
        <ul class="iq-room__stats"></ul>
        <div class="iq-room__acts"><div class="iq-room__scenes" role="group"></div><button type="button" class="iq-room__go"><span class="iq-room__chev" aria-hidden="true">${ICONS.chevron}</span></button></div>
        <button type="button" class="iq-room__mscenes" aria-haspopup="true"><span aria-hidden="true">${ICONS.star}</span></button>
      </div>
      <div class="iq-room__panel" role="group" hidden><div class="iq-room__panel-h"><b class="iq-room__panel-t">Scenes</b><button type="button" class="iq-room__panel-x" aria-label="Close scenes">×</button></div><div class="iq-room__panel-l"></div></div>`;
    const $ = (q) => root.querySelector(q);
    const img = $('.iq-room__img'), scenesEl = $('.iq-room__scenes'), statsEl = $('.iq-room__stats'), goBtn = $('.iq-room__go'), devBtn = $('.iq-room__devices');
    const panel = $('.iq-room__panel'), panelList = $('.iq-room__panel-l'), mBtn = $('.iq-room__mscenes');
    let box = { w: 0, h: 0, arr: '' }, cap = MAX_SCENES, infoCap = MAX_INFO, perRow = 2;
    const linked = () => !!s.haState;
    const nameOf = () => s.name || 'Room';

    /* ---- the data: derived from the entity states the host supplies (haState) — nothing else is ever shown ---- */
    const reading = (e) => (e && e.status === 'ready' && e.state && e.state.available ? e.state : null);
    function data() {
      const st = s.haState;
      if (!st) return { fn: functionalState(null), info: [], scenes: [] };
      return {
        fn: functionalState(st),
        info: Array.isArray(st.info) ? st.info : [],   // the live values of the owner's Information lines (INFORMATION)
        scenes: ((st.slots && st.slots.scenes) || []).map((e) => { const x = e && e.status === 'ready' ? e.state : null; return e ? { mapped: true, available: !!(x && x.available), active: !!(x && x.available && x.domain === 'script' && x.state === 'on'), name: x && x.name ? String(x.name) : '' } : null; }),
      };
    }
    /** FUNCTIONAL STATE — what the room knows from Home Assistant, never shown as text: its lights (all mapped / known / on, and whether
        the Area's lights are still being resolved). Information lines are not part of it. */
    function functionalState(st) {
      if (!st) return { lights: { mapped: 0, known: 0, on: 0, off: 0, pending: false } };
      const mapped = Array.isArray(st.roles && st.roles.lights) ? st.roles.lights.filter(Boolean) : [];
      const lights = mapped.map(reading).filter(Boolean);
      return { lights: { mapped: mapped.length, known: lights.length, on: lights.filter((e) => e.state === 'on').length, off: lights.filter((e) => e.state === 'off').length,
        pending: Array.isArray(st.pending) && st.pending.includes('lights') } };
    }
    /** VISUAL STATE — how the artwork reacts to the functional state (only real HA state; never text). Today one effect: the room light
        treatment — any light on → lit; every light reported off → off; a light not reported / still resolving → unknown (dimmed, never
        lit); no light → none (the picture as it is). Future, deliberately mapped visual elements (an entity + an effect) add their own
        entries here; nothing is ever inferred from what the area contains. */
    function visualState(fn) {
      const L = fn.lights;
      return { lit: L.pending ? 'unknown' : !L.mapped ? 'none' : L.on > 0 ? 'true' : L.known === L.mapped && L.off === L.mapped ? 'false' : 'unknown' };
    }
    function applyVisual(v) { root.dataset.lit = v.lit; }
    /** the buttons: every entry with a label, an icon or a mapped entity — each keeps ITS position (= its action slot) */
    const sceneList = () => {
      const slots = posList(s.haSlots && s.haSlots.scenes);
      return sceneEntries(s).map((x, i) => ({ ...x, i, mapped: typeof slots[i] === 'string' && !!slots[i] })).filter((x) => x.label || x.icon || x.mapped);
    };
    /** INFORMATION — the ONLY visible data: the owner's lines (config.info) in their order; a value only when Home Assistant has answered (never a placeholder while
        loading). Not reported / unavailable / missing are said as such — the owner added the line, so it is not silently dropped. */
    function infoStats(d) {
      const lines = (Array.isArray(s.info) ? s.info : []).filter((x) => x && typeof x.entity === 'string' && x.entity).slice(0, MAX_INFO);
      return lines.map((x) => {
        const it = d.info.find((y) => y && y.id === x.id) || null;
        if (!it || it.state === 'loading') return null;
        const value = it.state === 'missing' ? 'Not found' : it.state === 'absent' ? 'Not reported' : it.text;
        const label = x.showLabel === false ? '' : (typeof x.label === 'string' && x.label.trim()) || it.name || x.entity;   // label off: none
        // the icon's animation: the owner's choice (none unless set), running always or only while HA reports the entity active
        const anim = x.icon && typeof x.animation === 'string' ? x.animation : 'none';
        const run = anim !== 'none' && (x.animateWhen === 'always' || (it.state === 'ready' && it.active === true));
        const px = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
        return { id: x.id, icon: mdiOf(x.icon), color: INFO_COLORS.includes(x.color) ? x.color : null, value, label, off: it.state !== 'ready' || !it.available, anim, run,
          iconSize: px(x.iconSize, 12, 120), valueSize: px(x.valueSize, 10, 120), labelSize: px(x.labelSize, 8, 48), iconBg: ['subtle', 'accent'].includes(x.iconBg) ? x.iconBg : null };
      }).filter(Boolean);
    }

    const pressedAt = new Map();
    let pressTimer = 0;
    function press(i) {
      if (!sceneList().some((x) => x.i === i)) return;
      pressedAt.set(i, Date.now());
      clearTimeout(pressTimer); pressTimer = setTimeout(() => { pressedAt.clear(); render(); }, 1400);
      const slot = s.haState && s.haState.slots && s.haState.slots.scenes && s.haState.slots.scenes[i];
      if (slot && typeof s.haRequest === 'function') s.haRequest({ slot: 'scenes', index: i, action: 'trigger' });
      render();
    }
    function go(kind) {
      const page = kind === 'devices' ? s.devicesPage : s.page;
      if (!page) return;
      root.dispatchEvent(new CustomEvent('maison:action', { bubbles: true, detail: { action: { type: 'navigate', page, label: kind === 'devices' ? 'Devices' : nameOf() }, meta: { source: 'room' }, widget: 'room' } }));
    }
    goBtn.addEventListener('click', (e) => { e.stopPropagation(); go('room'); });
    devBtn.addEventListener('click', (e) => { e.stopPropagation(); go('devices'); });
    goBtn.dataset.iqControl = ''; devBtn.dataset.iqControl = '';
    // the scene panel: every scene, reachable whatever the card's size (the "+N" tile, or the Micro card's scenes button)
    panel.dataset.iqControl = ''; mBtn.dataset.iqControl = '';
    const openPanel = (open) => { panel.hidden = !open; root.dataset.panel = open ? 'true' : 'false'; mBtn.setAttribute('aria-expanded', String(open)); if (open) { render(); const f = panelList.querySelector('button:not(:disabled)'); if (f) f.focus(); } };
    mBtn.addEventListener('click', (e) => { e.stopPropagation(); openPanel(panel.hidden); });
    $('.iq-room__panel-x').addEventListener('click', (e) => { e.stopPropagation(); openPanel(false); });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); openPanel(false); } });

    function render() {
      const d = data();
      // the VISUAL: the picture, else the fallback icon, else nothing (each variant closes up around what is there)
      const pic = typeof s.image === 'string' && s.image && s.image !== 'none' ? s.image : null;
      const fb = !pic && s.fallbackIcon && typeof s.fallbackIcon === 'object' && mdiOf(s.fallbackIcon.icon) ? s.fallbackIcon : null;
      root.dataset.hasImage = pic ? 'true' : 'false';
      root.dataset.visual = pic ? 'image' : fb ? 'icon' : 'none';
      if (pic) { if (img.getAttribute('src') !== pic) { img.onerror = () => { root.dataset.hasImage = 'false'; root.dataset.visual = 'none'; }; img.src = pic; } } else img.removeAttribute('src');
      const vic = $('.iq-room__vicon');
      // the fallback icon: the SHARED icon presentation (IconConfig) — its glyph, colour (a token name, never a CSS value), surface (the shared
      // none · subtle · accent; absent: subtle) and animation, running always or while one of the room's lights is on (the Room decides)
      if (global.IniqIcons) {
        if (fb) global.IniqIcons.present(vic, { icon: fb.icon, color: INFO_COLORS.includes(fb.color) ? fb.color : null, background: fb.background || 'subtle', animation: fb.animation },
          { run: fb.animateWhen === 'always' || d.fn.lights.on > 0 });
        else global.IniqIcons.present(vic, { icon: '', animation: 'none' });
      }
      $('.iq-room__name').textContent = nameOf();
      // APPEARANCE: the owner's semantic choices for this variant at this size (allow-listed values → data attributes the CSS reads)
      const lk = looks(s, variant, box.arr);
      root.dataset.align = lk.align; root.dataset.image = lk.image; root.dataset.overlay = lk.overlay; root.dataset.title = lk.title;
      // the title size as a scale (%, the shared Slider + Number): a number overrides the former Small / Medium / Large
      if (typeof s.titleSize === 'number' && LOOK_FOR[variant].includes('titleSize')) { root.dataset.title = 'n'; root.style.setProperty('--iq-room-ts', String(Math.min(160, Math.max(60, s.titleSize)) / 100)); }
      else root.style.removeProperty('--iq-room-ts');
      root.dataset.infoStyle = lk.info; root.dataset.sceneStyle = lk.scene;
      // the scene ROW (Appearance): alignment (absent: the content alignment) and gap (px) — each scene's own look is on the scene
      if (['left', 'center', 'right'].includes(s.sceneAlign)) root.dataset.scAlign = s.sceneAlign; else delete root.dataset.scAlign;
      if (typeof s.sceneGap === 'number') root.style.setProperty('--iq-room-sc-gap', `${Math.min(40, Math.max(0, s.sceneGap))}px`); else root.style.removeProperty('--iq-room-sc-gap');
      // VISUAL STATE on the artwork (and the Micro card's lit-bulb badge)
      applyVisual(visualState(d.fn));
      // the Information strip: the owner's lines in order; the card's own size decides how many are shown (the rest are hidden, never
      // squeezed); none added → no strip at all
      const stats = infoStats(d);
      statsEl.replaceChildren(...stats.map((x, i) => {
        // the SHARED information renderer (IniqInfo.render) in the Room's own skin (its line, its CSS); the values are the host binding's
        const li = UI('info').render({ ...x, animation: x.anim }, LINE_SKIN);
        li.hidden = i >= infoCap;
        // only the ICON moves (the shared icon animation); a line the card's size hides does not animate
        li.info.update({ value: x.value, label: x.label, state: x.off ? 'off' : 'ready', run: x.run && !li.hidden });
        return li;
      }));
      fillIcons(statsEl);
      statsEl.hidden = !stats.length || infoCap < 1;
      root.dataset.stats = String(stats.length);
      root.dataset.statsShown = String(Math.min(stats.length, infoCap));
      root.style.setProperty('--iq-room-info-cols', String(tileCols(Math.min(stats.length, infoCap), perRow)));
      // scenes: as many tiles as the card's own size shows; more → the last tile is "+N" (opens the panel with every scene)
      const list = sceneList();
      const button = (sc) => {
        const i = sc.i, b = document.createElement('button');
        b.type = 'button'; b.className = 'iq-room__scene'; b.dataset.iqControl = ''; b.dataset.icon = sc.icon || 'mdi:star'; b.dataset.index = String(i);
        const info = (d.scenes && d.scenes[i]) || null;
        const unavailable = !!info && info.mapped && info.available === false;
        const active = (info && info.active === true) || pressedAt.has(i);   // a running script, or a short press feedback — never a remembered scene
        b.dataset.active = active ? 'true' : 'false';
        b.disabled = unavailable;
        const label = sc.label || '';
        b.setAttribute('aria-label', label || (info && info.name) || 'Scene');
        if (info && info.active === true) b.setAttribute('aria-pressed', 'true');
        b.innerHTML = `<span class="iq-room__sc-i" data-mdi="${sc.icon || 'mdi:star'}"></span>${sc.showLabel === false ? '' : '<span class="iq-room__sc-l"></span>'}`;   // a validated mdi id
        if (sc.showLabel !== false) b.querySelector('.iq-room__sc-l').textContent = label;
        if (!label || sc.showLabel === false) b.classList.add('iq-room__scene--icon');
        // the scene's own appearance (colours: a token or #rrggbb; sizes in px) — over the theme's scene button; absent: unchanged
        if (sc.style || sc.color) b.dataset.scStyle = sc.style || 'soft';
        if (sc.shape) b.dataset.scShape = sc.shape;
        if (sc.color) b.style.setProperty('--sc-c', cssColor(sc.color));
        if (sc.iconColor) { b.dataset.scIc = ''; b.style.setProperty('--sc-ic', cssColor(sc.iconColor)); }
        if (sc.size) { b.dataset.scSize = ''; b.style.setProperty('--sc-size', `${sc.size}px`); }
        if (sc.iconSize) { b.dataset.scIsize = ''; b.style.setProperty('--sc-isize', `${sc.iconSize}px`); }
        b.addEventListener('click', (e) => { e.stopPropagation(); const inPanel = !!b.closest('.iq-room__panel'); press(i); if (inPanel) openPanel(false); });
        return b;
      };
      const shown = list.length > cap ? list.slice(0, Math.max(0, cap - 1)) : list;
      const tiles = shown.map(button);
      if (list.length > shown.length && cap > 0) {
        const more = document.createElement('button');
        more.type = 'button'; more.className = 'iq-room__scene iq-room__scene--more'; more.dataset.iqControl = ''; more.dataset.active = 'false';
        more.setAttribute('aria-label', `All scenes (${list.length - shown.length} more)`); more.setAttribute('aria-haspopup', 'true');
        more.innerHTML = `<span class="iq-room__sc-n"></span><span class="iq-room__sc-l">More</span>`;
        more.querySelector('.iq-room__sc-n').textContent = `+${list.length - shown.length}`;
        more.addEventListener('click', (e) => { e.stopPropagation(); openPanel(true); });
        tiles.push(more);
      }
      scenesEl.replaceChildren(...tiles);
      fillIcons(scenesEl);
      scenesEl.hidden = !list.length || cap < 1;
      root.dataset.scenes = String(list.length);
      root.dataset.scenesShown = String(shown.length);
      root.dataset.sceneTiles = String(tiles.length);                  // a lone tile or two never stretch across the card
      root.dataset.sceneRow = list.length && cap > 0 ? 'true' : 'false';
      mBtn.hidden = !list.length || cap > 0; mBtn.setAttribute('aria-label', `Scenes of ${nameOf()}`);
      if (!list.length && !panel.hidden) openPanel(false);
      if (!panel.hidden) { panelList.replaceChildren(...list.map(button)); fillIcons(panelList); }
      goBtn.hidden = !s.page; goBtn.setAttribute('aria-label', `Open ${nameOf()}`);
      devBtn.hidden = !s.devicesPage;
      root.dataset.hasGo = s.page ? 'true' : 'false';
      root.setAttribute('aria-label', nameOf());
    }

    // the arrangement for the card's OWN box — and how many scene tiles it shows (re-drawn once when that number changes)
    let queued = false;
    if (global.MaisonFit) global.MaisonFit.observe(root, { arrange: (w, h) => {
      const arr = arrangement(w, h, variant), lim = limits(variant, arr, w, h, looks(s, variant, arr));
      const changed = arr !== box.arr || lim.scenes !== cap || lim.info !== infoCap || lim.perRow !== perRow;
      box = { w, h, arr };
      if (changed) { cap = lim.scenes; infoCap = lim.info; perRow = lim.perRow; if (!queued) { queued = true; Promise.resolve().then(() => { queued = false; render(); }); } }
      return arr;
    } });
    render();
    root.haState = (st) => { s = { ...s, haState: st }; render(); };   // the generic roles binding pushes every change here
    root.room = {
      // what the card shows (name, Information, scenes) and — kept apart — what it knows (functional) and how the artwork reacts (visual)
      getState: () => { const d = data(); return { name: nameOf(), info: infoStats(d).map((x) => ({ label: x.label, value: x.value })), scenes: sceneList().length, functional: d.fn, visual: visualState(d.fn) }; },
      setState(patch = {}) { s = { ...s, ...patch }; render(); },
    };
    return root;
  }

  /** the composition for a w × h box (the widget's OWN size), per variant.
      Compact card · Status · Minimal: micro · compact · normal · large (see room-scene.css for each composition).
      Hero (scene):
        micro       the picture, a lit badge, the name and one short line
        compact     picture thumbnail · name · chevron · small scene tiles
        horizontal  wide and short: picture · name · scene icons · chevron
        normal      the picture is the card: name and (a few of) the owner's Information on top, scene tiles + chevron below
        large       as normal, with more Information and the Devices chip */
  function arrangement(w, h, variant) {
    if (variant === 'card') return w < 230 || h < 110 ? 'micro' : h < 200 || w < 340 ? 'compact' : w >= 600 && h >= 360 ? 'large' : 'normal';
    if (variant === 'status') return w < 200 || h < 130 ? 'micro' : h < 240 || w < 340 ? 'compact' : w >= 600 && h >= 380 ? 'large' : 'normal';
    if (variant === 'minimal') return w < 200 || h < 90 ? 'micro' : h < 200 || w < 300 ? 'compact' : w >= 560 && h >= 340 ? 'large' : 'normal';
    if (w < 170 || h < 120) return 'micro';
    if (w <= 270 && h <= 270 && w < 1.5 * h) return 'micro';            // a small, squarish tile is the Micro card
    if (h < 235) return w < 290 ? 'micro' : w >= 2.6 * h && w >= 480 ? 'horizontal' : 'compact';
    if (w >= 640 && h >= 400) return 'large';
    return 'normal';
  }

  function constraints() { return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 }; }

  /** the configuration (CUSTOM WIDGET CONTRACT: define({ F, manifest }) → the type definition the registry adds to Add Widget).
      widget.json declares the Home Assistant side (roles binding): the lights and the scene slots —
      the configuration fields for them are GENERATED by the generic custom-widget host (docs/CUSTOM-WIDGETS.md). This function only
      adds what is the widget's own: name, picture, pages and the scene labels / icons; Information is the shared capability (common.info). */
  function define({ F, manifest }) {
    const pages = () => (global.MaisonRegistry && global.MaisonRegistry.context && Array.isArray(global.MaisonRegistry.context.pages) ? global.MaisonRegistry.context.pages : []);
    const pageOptions = (none) => () => [{ value: '', label: none }, ...pages().map((p) => ({ value: p.id, label: p.name }))];
    /* SCENES: a CONFIG COLLECTION (the shared editor: compact rows, Add / Edit one scene at a time). Scene i is config.scenes[i] (label,
       icon) AND its Home Assistant entity config.haSlots.scenes[i] (the declared action slot "scenes": slot: 'scenes' gives the item editor's
       entity field the slot's domains) — read and written together, so a scene keeps its label, icon and entity in every reorder.
       The stored format is unchanged. MAX_SCENES is a safety limit, not empty slots. */
    const arrays = (c) => {
      const sc = sceneEntries(c), sl = posList(c.haSlots && c.haSlots.scenes);
      return { sc, sl: sc.map((_, i) => (typeof sl[i] === 'string' && sl[i] ? sl[i] : null)) };
    };
    const store = (c, sc, sl) => {
      c.scenes = sc;
      while (sl.length && !sl[sl.length - 1]) sl.pop();
      const hs = c.haSlots && typeof c.haSlots === 'object' && !Array.isArray(c.haSlots) ? { ...c.haSlots } : {};
      if (sl.length) hs.scenes = sl; else delete hs.scenes;
      if (Object.keys(hs).length) c.haSlots = hs; else delete c.haSlots;
    };
    const scenes = { key: 'scenes', type: 'collection', label: 'Scenes', group: 'actions', optional: true, srLabel: true, max: MAX_SCENES, slot: 'scenes',
      itemLabel: 'scene', addLabel: '+ Add scene',
      get: (c) => { const { sc, sl } = arrays(c); return sc.map((x, i) => (sl[i] ? { ...x, entity: sl[i] } : { ...x })); },
      set: (c, list) => store(c, list.map((x) => { const o = {}; if (x.label) o.label = x.label; if (x.icon) o.icon = x.icon; return Object.assign(o, sceneLook(x, !!x.icon)); }), list.map((x) => x.entity || null)),
      // the scene editor: ACTION (what it does) · APPEARANCE (how its button looks) — never the card's own Tap / Double tap / Long press
      groups: [['action', 'Action', ''], ['appearance', 'Appearance', '']],
      entityOf: (x) => x.entity || null,
      create: () => ({}),
      fields: [
        { key: 'label', type: 'text', label: 'Label', group: 'action', optional: true, maxLength: 16, placeholder: 'e.g. Relax' },
        { key: 'entity', type: 'entity', label: 'Home Assistant scene or script', group: 'action', optional: true, domains: ['scene', 'script', 'button', 'input_button'], clear: 'Clear', empty: 'Not linked',
          help: 'What this button runs. The card’s own Tap / Double tap / Long press are set in Interactions.' },
        // APPEARANCE: the shared ACTION BUTTON configuration (F.button — the same builder as Light's and Climate's buttons), with what a scene
        // exposes (a label to show or not; no state look — a scene is never "on"), its Theme style and its rounded shape
        ...(F.button ? F.button({ k: '', groups: ['appearance', 'appearance'], fields: ['icon', 'showLabel', 'style', 'shape', 'color', 'iconColor', 'size', 'iconSize'],
          styles: [['theme', 'Theme']], exclude: ['switch'], shapes: [['rounded', 'Rounded'], ['circle', 'Circle'], ['pill', 'Pill']], noShape: [],
          over: {
            icon: { get: null, help: null },
            showLabel: { help: 'Off: the icon only (the label stays the button’s name for screen readers).' },
            style: { get: (c) => c.style || 'theme', set: (c, v) => { if (SCENE_STYLES.includes(v)) c.style = v; else delete c.style; if (v === 'bare') delete c.color; } },
            color: { help: null, when: (c) => c.style !== 'bare' },
            iconColor: { when: (c) => !!c.icon },
            size: { autoValue: 56, help: 'Automatic: the card’s own size for its size and scene style.' },
            iconSize: { autoValue: 24, help: null, when: (c) => !!c.icon },
          } }) : []),
      ],
      summary: (x, i, ha) => ({ icon: mdiOf(x.icon) || 'mdi:star', title: x.label || (x.entity && ha.name(x.entity)) || `Scene ${i + 1}`, sub: x.entity || 'Not linked to Home Assistant' }),
      itemErrors: (x) => (x.label || x.icon || x.entity ? [] : [{ key: 'label', message: 'Give it a label, an icon or an entity' }]),
    };
    /* APPEARANCE: semantic choices (LOOK), each shown only for the variants it means something for; the preview follows live */
    const on = (k) => (c) => LOOK_FOR[variantOf(c)].includes(k);
    const opts = (k, labels) => LOOK[k].map((v, i) => ({ value: v, label: labels[i] }));
    const look = (key, label, labels, help) => ({ key, type: 'select', label, group: 'appearance', options: opts(key, labels), get: (c) => (LOOK[key].includes(c[key]) ? c[key] : LOOK[key][0]), when: on(key), ...(help ? { help } : {}) });
    // a picture's treatment / overlay mean nothing without a picture: they appear only with one
    const pictured = (c) => typeof c.image === 'string' && !!c.image && c.image !== 'none';
    const withPic = (f) => ({ ...f, when: (c) => f.when(c) && pictured(c) });
    const appearance = [
      look('align', 'Content alignment', ['Left', 'Centre', 'Right']),
      withPic(look('imageTreatment', 'Image treatment', ['Natural', 'Dark', 'Dim', 'Soft'], 'The light state still shows: all lights off is always the dimmed, grey picture.')),
      withPic(look('overlay', 'Overlay strength', ['Medium', 'Light', 'Strong'], 'The shading that keeps the text readable over the picture.')),
      look('infoStyle', 'Information style', ['Automatic', 'Pills', 'Clean', 'Tiles']),
      look('sceneStyle', 'Scene presentation', ['Automatic', 'Buttons', 'Icons', 'Compact']),
      // the scene ROW: alignment and gap (each scene's colour, size, style and shape are on the scene itself)
      { key: 'sceneAlign', type: 'select', label: 'Scene alignment', group: 'appearance', get: (c) => c.sceneAlign || 'auto',
        options: [{ value: 'auto', label: 'With the content' }, { value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }],
        set: (c, v) => { if (['left', 'center', 'right'].includes(v)) c.sceneAlign = v; else delete c.sceneAlign; } },
      { key: 'sceneGap', type: 'range', label: 'Scene gap', group: 'appearance', unit: 'px', min: 0, max: 40, step: 1, auto: 'Automatic', autoValue: 10 },
      // the title size: the shared Slider + Number (a scale of the card's own title size; Automatic = 100 %)
      F.titleScale({ small: 78, medium: 90, large: 120 }, on('titleSize')),
    ];
    return {
      label: 'Room / Scene',
      description: 'A room as one card: its title, its picture lit by its real lights, the information and scene buttons you add, and the way into the room.',
      glyph: '<rect x="3" y="4" width="18" height="16" rx="3.5"/><path d="M3 14h18"/><rect x="6" y="16" width="3" height="2.2" rx=".8"/><rect x="10.5" y="16" width="3" height="2.2" rx=".8"/><rect x="15" y="16" width="3" height="2.2" rx=".8"/>',
      size: { w: 5, h: 4 },
      tags: ['room', 'scene', 'scenes', 'lights', 'navigation'],
      // preview: each variant's REPRESENTATIVE editor preview shape (24-column reference units) — the configure dialog opens on it;
      // the widget's own dashboard size is never changed by a variant
      variants: [{ id: 'scene', label: 'Hero', default: true, preview: { w: 14, h: 9 } }, { id: 'card', label: 'Compact card', preview: { w: 10, h: 6 } },
        { id: 'status', label: 'Status', preview: { w: 9, h: 6 } }, { id: 'minimal', label: 'Minimal', preview: { w: 8, h: 4 } }],
      accordion: true,
      // CONFIGURE: the room (context + its functional lights) · the content you add · what the card does · how it looks
      groups: [
        ['identity', 'Room', 'Name and Home Assistant Area'],
        ['information', 'Information', 'Values you add, in your order'],
        ['actions', 'Scenes', 'Buttons you add, in your order — each runs its own scene or script'],
        ['interactions', 'Interactions', 'Tap, double tap, long press ON THE CARD — and where it leads'],
        ['appearance', 'Appearance', 'How it is presented'],
        ['images', 'Images', 'The room picture or a fallback icon'],
        ['visibility', 'Visibility', 'Show or hide from a Home Assistant state'],
      ],
      // a new Room starts EMPTY: no scenes, no information — the owner adds what they want
      defaults: { name: 'Living Room' },
      common: { interactions: {}, info: { max: MAX_INFO, icons: 'mdi', colors: true, sizes: true }, visibility: true },
      fields: [
        F.name('Room name'),
        // the room's Home Assistant Area: the context every entity list of this form opens on (never a restriction; optional)
        ...(F.area ? [F.area('identity', { help: 'Its lights light up the room picture; entity lists open on it first.' })] : []),
        // ARTWORK: the shared Image / Artwork picker — None (no picture; an optional fallback icon) · Living room · Upload
        ...(F.artwork ? F.artwork('image', 'Room picture', { group: 'images', builtins: [{ value: `${manifest.path}assets/demo-living-room.svg`, label: 'Living room' }] })
          : [{ key: 'image', type: 'image', label: 'Room picture', group: 'images', optional: true, upload: true, picks: [`${manifest.path}assets/demo-living-room.svg`] }]),
        { key: 'page', type: 'select', label: 'Chevron opens', group: 'interactions', optional: true, optionsFrom: pageOptions('Nothing (no chevron)') },
        { key: 'devicesPage', type: 'select', label: '“Devices” opens (Large)', group: 'interactions', optional: true, optionsFrom: pageOptions('Nothing (no Devices button)') },
        scenes,
        ...appearance,
      ],
      normalize(c) {
        // scenes BY POSITION (entry i ↔ action slot i): sanitised entries, kept even while still empty (the owner just added it); an
        // entity mapped beyond the stored entries gets its entry (older configurations), so no mapping is ever orphaned. Deterministic.
        if (c.scenes !== undefined || (c.haSlots && c.haSlots.scenes)) c.scenes = sceneEntries(c);
        // Room 1.2 and earlier: a fixed temperature / air-quality mapping (haRoles.temperature / .air_quality) with optional captions
        // (labels.temperature / .air). What was MAPPED becomes Information lines (same order, caption, icon and colour as it was drawn);
        // nothing is created for a value that was never mapped. Only when the configuration has no Information of its own. Deterministic.
        const r = c.haRoles && typeof c.haRoles === 'object' ? c.haRoles : {}, cap = (k) => (c.labels && typeof c.labels[k] === 'string' && c.labels[k].trim() ? c.labels[k].replace(/[<>]/g, '').slice(0, 24) : null);
        const okId = (v) => typeof v === 'string' && /^sensor\.[a-z0-9_]+$/.test(v) && v.length <= 120;
        if (c.info === undefined && (okId(r.temperature) || okId(r.air_quality))) {
          c.info = [];
          if (okId(r.temperature)) c.info.push({ id: 'i1', entity: r.temperature, value: 'state', label: cap('temperature') || 'Temperature', icon: 'thermo', color: 'accent-hot' });
          if (okId(r.air_quality)) c.info.push({ id: 'i2', entity: r.air_quality, value: 'state', label: cap('air') || 'Air quality', icon: 'leaf', color: 'success' });
        }
        if (c.haRoles && typeof c.haRoles === 'object') { delete c.haRoles.temperature; delete c.haRoles.air_quality; }
        delete c.labels;
        if (c.area !== undefined && !(typeof c.area === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(c.area))) delete c.area;
        // Information lines: only this package's icons and the allowed colours (the registry validates the rest of a line)
        if (Array.isArray(c.info)) c.info = c.info.slice(0, MAX_INFO).map((x) => {
          if (!x || typeof x !== 'object') return x;
          const o = { ...x };
          if (o.icon !== undefined) { const ic = mdiOf(o.icon); if (ic) o.icon = ic; else delete o.icon; }
          // icon animation: only the shared kinds and triggers; none / no icon → nothing stored (older lines have none: still)
          const ANIMS = (global.IniqIcons && global.IniqIcons.ANIMATIONS) || ['none'];
          if (o.animation !== undefined && (!o.icon || o.animation === 'none' || !ANIMS.includes(o.animation))) { delete o.animation; delete o.animateWhen; }
          if (o.animateWhen !== undefined && (!o.animation || !['active', 'always'].includes(o.animateWhen))) delete o.animateWhen;
          if (o.color !== undefined && !INFO_COLORS.includes(o.color)) delete o.color;
          // the line's sizes (px): numbers in range only; no icon → no icon size
          [['iconSize', 12, 120], ['valueSize', 10, 120], ['labelSize', 8, 48]].forEach(([k, lo, hi]) => { if (o[k] !== undefined) { if (typeof o[k] === 'number' && Number.isFinite(o[k])) o[k] = Math.min(hi, Math.max(lo, Math.round(o[k]))); else delete o[k]; } });
          if (!o.icon) { delete o.iconSize; delete o.iconBg; }
          if (o.showLabel !== undefined && o.showLabel !== false) delete o.showLabel;
          if (o.iconBg !== undefined && !['subtle', 'accent'].includes(o.iconBg)) delete o.iconBg;
          if (o.showLabel === false) delete o.labelSize;
          return o;
        });
        ['page', 'devicesPage'].forEach((k) => { if (c[k] === '' || typeof c[k] !== 'string') delete c[k]; });
        if (c.sceneAlign !== undefined && !['left', 'center', 'right'].includes(c.sceneAlign)) delete c.sceneAlign;
        if (c.sceneGap !== undefined) { const g = numIn(c.sceneGap, 0, 40); if (g === undefined) delete c.sceneGap; else c.sceneGap = g; }
        // Appearance: allow-listed values only; the default is not stored (a choice for another variant is kept — it applies again there)
        Object.keys(LOOK).forEach((k) => { if (k === 'titleSize' && typeof c[k] === 'number' && Number.isFinite(c[k])) { c[k] = Math.min(160, Math.max(60, Math.round(c[k]))); return; } if (c[k] !== undefined && (!LOOK[k].includes(c[k]) || c[k] === LOOK[k][0])) delete c[k]; });
        if (typeof c.image !== 'string' || !c.image) delete c.image;
        return c;
      },
      validate(c) { return !c.name || !String(c.name).trim() ? [{ key: 'name', message: 'A room needs a name' }] : []; },
    };
  }

  global.IniqRoomScene = { create, constraints, define, arrangement, capacity, infoCapacity, limits, looks, VARIANTS, LOOK, LOOK_FOR, sceneEntries, mdiOf, ICONS, LEGACY_ICONS, MAX_SCENES, MAX_INFO };
})(window);
