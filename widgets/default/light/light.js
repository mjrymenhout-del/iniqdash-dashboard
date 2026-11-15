/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Light widget — one component, four VARIANTS, each with its own Micro · Compact · Normal · Large composition for the widget's
   OWN box (MaisonFit). Built on the reference pattern of docs/WIDGET-REFERENCE.md:  TYPE → VARIANT → MAISONFIT → APPEARANCE → STATE.

   MaisonLight.create(config) → HTMLElement (.lw), with el.light = { getState(), setState(patch), getConfirmed() }

   config = {
     id, name,
     state:        'on' | 'off'                 available: false → unavailable (never lit, controls inert)
     brightness:   1…100                        (only with capabilities.brightness)
     capabilities: { power, brightness, colorTemp, color, effect }   — what the light REPORTS (the HA binding fills them);
                   a control exists only for a capability the light has — never a placeholder
     dimmable:     legacy shorthand for capabilities.brightness
     colorTempRange { min, max } kelvin · colorTempK · hue 0…359 · effects [] · effect
     image:        the ARTWORK (the shared Image / Artwork picker): a built-in (BUILTINS — the Pendant cut-out, the Dining room
                   illustration) · an uploaded image · 'none' (literally no image). Each variant presents it its own way (a hanging
                   fixture, a picture panel, a thumbnail, the whole card); none → the fallback icon if one is chosen, else nothing
                   (the layout closes up). A missing image is the same as none.
     fallbackIcon: { icon: 'mdi:…', color?: <token>, background?: 'none' | 'accent' (absent: subtle), animation?, animateWhen?: 'active' | 'always',
                   size?: 16…160 px (the GLYPH; absent: sized by the variant) } — shown only with no image; it animates (the shared IniqIcons
                   animation) only as configured, never while the light is unavailable. A background never shrinks the glyph: the
                   surface grows around it (and the glyph is never larger than the space the variant has).
     power:        the POWER control's look (the shared control button, components/controls): { style: 'theme' (default: the light's
                   own switch / round button, as the variant chooses) | 'switch' | 'round' | 'filled' | 'soft' | 'outline' | 'bare', icon: 'mdi:…',
                   size, iconSize (px), shape, color, iconColor (token | #rrggbb), stateLook: 'auto' | 'fixed' }. ON / OFF always shows.
     controls:     the other controls, IN THE ORDER the card presents them: [{ type: 'brightness', show?, track?, handle?, color? } ·
                   { type: 'colorTemp' | 'color' | 'effect', show? } · { type: 'toggle', name?, a: OPTION, b: OPTION, height?, iconSize?, gap?,
                   padX?, style?, shape?, inactive?, color? }] — absent: every control the light has. A control the light does not have is never
                   drawn. OPTION = { icon, label, showLabel, color, set: 'on' | 'off' | 'brightness' | 'colorTemp' | 'color', brightness | kelvin | hue }
                   — a TOGGLE (the shared segmented control) sets that value of the light; its selected option is the one the CONFIRMED state
                   matches (none while nothing matches). An older { brightness: false… } is read as the list.
     controlAlign: 'left' | 'center' | 'right' · controlGap: px — the controls row
     imageRatio:   width / height of a fixture cut-out
     onChange:     (next, prev, { source }) → the HA binding turns it into a secure call
     variant:      'artwork'  STANDARD — the fixture lamp, its light, power, brightness, colour (the id it has had since 1.0)
                   'compact'  COMPACT  — a row: lamp thumbnail · name · state · power (many lights on one page)
                   'slider'   SLIDER   — the card IS the brightness (horizontal, or vertical in a tall box)
                   'image'    ARTWORK  — the picture is the card; it lights up with the light
                   (an older 'tile' becomes Standard)
     Appearance (allow-listed, never CSS): titleSize · align · imageTreatment · glow — see LOOK (an older powerStyle is read as power.style)
   }

   Functional state = what HA reports (state, brightness, colour, availability). Visual state = how the lamp / picture reacts:
   lit with the CONFIRMED state only (data-lit + the shared glow layer), its glow colour from the reported colour / colour
   temperature (--lw-glow), its strength from the confirmed brightness (tastefully bounded). Unavailable → never lit.
   ========================================================================== */
(function (global) {
  'use strict';

  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.6"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
  /** the built-in artworks (the configurator offers them by name; a kind tells each variant how to present it). Anything else
      (an upload) is a photo. */
  const BUILTINS = [
    { value: 'widgets/default/light/assets/pendant-dome.png', label: 'Pendant', kind: 'fixture' },
    { value: 'widgets/default/light/assets/artwork-pendant.svg', label: 'Dining room', kind: 'scene' },
  ];
  const MDI = /^mdi:[a-z0-9-]{1,64}$/;
  const ICON_COLORS = ['accent', 'accent-hot', 'light-warm', 'warning', 'success', 'info', 'cool', 'danger', 'purple', 'neutral'];
  /** what the card shows as its visual: { kind: 'fixture' | 'scene' | 'photo' | 'icon' | 'none', src?, icon? } */
  function visualOf(s) {
    const v = s.image;
    if (typeof v === 'string' && v && v !== 'none') { const b = BUILTINS.find((x) => x.value === v); return { kind: b ? b.kind : 'photo', src: v }; }
    const f = s.fallbackIcon && typeof s.fallbackIcon === 'object' ? s.fallbackIcon : null;
    return f && MDI.test(f.icon) ? { kind: 'icon', icon: f.icon, color: ICON_COLORS.includes(f.color) ? f.color : null, anim: typeof f.animation === 'string' ? f.animation : 'none', when: f.animateWhen === 'always' ? 'always' : 'active', bg: f.background,
      size: typeof f.size === 'number' && Number.isFinite(f.size) ? Math.max(16, Math.min(160, Math.round(f.size))) : null } : { kind: 'none' };
  }

  const clampPct = (v) => Math.max(1, Math.min(100, Math.round(Number(v) || 0)));
  const VARIANTS = ['artwork', 'compact', 'slider', 'image'];
  const variantOf = (c) => (VARIANTS.includes(c && c.variant) ? c.variant : 'artwork');
  /* APPEARANCE — semantic choices; the first value of each is the default (not stored). Offered per variant (LOOK_FOR). */
  const LOOK = {
    titleSize: ['auto', 'small', 'medium', 'large'],
    align: ['left', 'center', 'right'],
    imageTreatment: ['natural', 'dark', 'dim', 'soft'],
    glow: ['natural', 'subtle', 'strong'],
  };
  const LOOK_FOR = {
    artwork: ['titleSize', 'glow'],
    compact: ['titleSize', 'glow'],
    slider: ['align', 'titleSize', 'glow'],
    image: ['align', 'imageTreatment', 'titleSize', 'glow'],
  };

  function normalise(cfg) {
    const caps = { power: true, brightness: false, ...(cfg.capabilities || {}) };
    if (cfg.dimmable !== undefined) caps.brightness = !!cfg.dimmable;
    const r = cfg.colorTempRange;
    caps.colorTemp = !!caps.colorTemp && !!r && Number(r.max) > Number(r.min);
    caps.effect = !!caps.effect && Array.isArray(cfg.effects) && cfg.effects.length > 0;
    caps.color = !!caps.color;
    return {
      ...cfg,
      capabilities: caps,
      state: cfg.state === 'on' ? 'on' : 'off',
      available: cfg.available !== false,
      brightness: caps.brightness ? clampPct(cfg.brightness ?? 100) : null,
      colorTempK: caps.colorTemp && Number.isFinite(Number(cfg.colorTempK)) && cfg.colorTempK !== null ? Number(cfg.colorTempK) : null,
      hue: caps.color && Number.isFinite(Number(cfg.hue)) && cfg.hue !== null ? ((Math.round(Number(cfg.hue)) % 360) + 360) % 360 : null,
      effect: caps.effect && typeof cfg.effect === 'string' ? cfg.effect : null,
    };
  }

  /** the colour of the light it gives (never the app accent): its reported hue, or its colour temperature, else a warm white */
  function glowOf(s) {
    if (s.hue !== null) return `hsl(${s.hue} 95% 66%)`;
    if (s.colorTempK !== null) {
      const k = Math.max(1800, Math.min(6500, s.colorTempK)), t = (k - 1800) / 4700;
      const mix = (a, b, f) => Math.round(a + (b - a) * f);
      const [r, g, b] = t < 0.5 ? [255, mix(170, 236, t * 2), mix(92, 205, t * 2)] : [mix(255, 214, (t - 0.5) * 2), mix(236, 230, (t - 0.5) * 2), mix(205, 255, (t - 0.5) * 2)];
      return `rgb(${r} ${g} ${b})`;
    }
    return 'rgb(255 190 112)';
  }

  /* ---------------------------------------------------------------- capability controls (one renderer each; rendered only
     for a capability the light has). render(ctx) → Node, update(node, state). */
  const CONTROLS = {
    brightness: {
      render(ctx) {
        const wrap = document.createElement('div');
        wrap.className = 'lw__dim';
        // the SHARED slider in Light's own skin (its brightness bar): Light says what the number means
        const range = global.IniqSlider.create({ skin: 'lw__range', label: `${ctx.name} brightness`,
          onInput: (v) => ctx.set({ brightness: clampPct(v), state: 'on' }, 'brightness', false),
          onCommit: (v) => ctx.set({ brightness: clampPct(v), state: 'on' }, 'brightness', true) });
        wrap.innerHTML = `<span class="lw__dim-icon">${SUN}</span><span class="lw__pct"></span>`;
        wrap.prepend(range);
        return wrap;
      },
      update(node, s) {
        node.querySelector('input').slider.update({ value: s.brightness, min: 1, max: 100, step: 1, valueText: `${s.brightness}%`, disabled: !s.available });
        node.querySelector('.lw__pct').textContent = `${s.brightness}%`;
      },
    },
    /** colour temperature: warm → cool inside the range the light reports (kelvin) */
    colorTemp: {
      render(ctx) {
        const wrap = document.createElement('div');
        wrap.className = 'iq-light-ct';
        wrap.innerHTML = '<span class="iq-light-ct__k">Warm</span><span class="iq-light-ct__k">Cool</span><b class="iq-light-ct__v"></b>';
        // the SHARED slider in Light's own skin (its warm → cool strip): Light says what the number means (kelvin)
        const range = global.IniqSlider.create({ skin: 'iq-light-ct__range', label: `${ctx.name} colour temperature`,
          onInput: (v) => ctx.set({ colorTempK: v, state: 'on' }, 'colorTemp', false),
          onCommit: (v) => ctx.set({ colorTempK: v, state: 'on' }, 'colorTemp', true) });
        wrap.firstElementChild.after(range);
        return wrap;
      },
      update(node, s) {
        const r = s.colorTempRange, v = s.colorTempK ?? Math.round((Number(r.min) + Number(r.max)) / 2);
        node.querySelector('input').slider.update({ value: v, min: r.min, max: r.max, step: 50, valueText: `${v} K`, disabled: !s.available });
        node.querySelector('.iq-light-ct__v').textContent = s.colorTempK === null ? '' : `${s.colorTempK} K`;
        node.dataset.unknown = s.colorTempK === null ? 'true' : 'false';        // no reading (the light is in a colour mode): the thumb is only a place to start
      },
    },
    /** colour: a few hues at full saturation (the light's own colour mode converts them) */
    color: {
      render(ctx) {
        const wrap = document.createElement('div');
        wrap.className = 'iq-light-sw';
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', `${ctx.name} colour`);
        HUES.forEach(([h, label]) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'iq-light-sw__b'; b.dataset.hue = String(h); b.dataset.iqControl = '';
          b.style.setProperty('--iq-light-hue', h);
          b.setAttribute('aria-label', label);
          b.addEventListener('click', () => ctx.set({ hue: h, state: 'on' }, 'color', true));
          wrap.append(b);
        });
        return wrap;
      },
      update(node, s) {
        node.querySelectorAll('.iq-light-sw__b').forEach((b) => { b.disabled = !s.available; b.setAttribute('aria-pressed', String(s.hue !== null && Math.abs(((s.hue - Number(b.dataset.hue) + 540) % 360) - 180) <= 12)); });
      },
    },
  };
  /** effects: exactly the list the light reports; the choice is sent back verbatim */
  CONTROLS.effect = {
    render(ctx) {
      const wrap = document.createElement('label');
      wrap.className = 'iq-light-fx';
      wrap.innerHTML = '<span class="iq-light-fx__k">Effect</span><select class="iq-light-fx__sel"></select>';
      const sel = wrap.querySelector('select');
      sel.dataset.iqControl = '';
      sel.setAttribute('aria-label', `${ctx.name} effect`);
      sel.addEventListener('change', () => ctx.set({ effect: sel.value, state: 'on' }, 'effect', true));
      return wrap;
    },
    update(node, s) {
      const sel = node.querySelector('select'), list = s.effects || [];
      const sig = JSON.stringify(list);
      if (sel.dataset.sig !== sig) { sel.dataset.sig = sig; sel.replaceChildren(...[''].concat(list).map((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v || '—'; return o; })); }
      sel.value = s.effect && list.includes(s.effect) ? s.effect : '';
      sel.disabled = !s.available;
    },
  };
  const HUES = [[0, 'Red'], [30, 'Orange'], [55, 'Yellow'], [120, 'Green'], [180, 'Cyan'], [220, 'Blue'], [275, 'Purple'], [320, 'Pink']];
  const CONTROL_ORDER = ['brightness', 'colorTemp', 'color', 'effect'];
  const EXTRA = ['colorTemp', 'color', 'effect'];

  /** the composition for the widget's OWN box, per variant: micro · compact · normal · large (Slider adds data-orient) */
  function arrangement(w, h, variant) {
    if (variant === 'compact') return w < 180 || h < 56 ? 'micro' : h < 200 ? 'compact' : w >= 600 && h >= 380 ? 'large' : 'normal';
    if (variant === 'slider') { const a = w * h; return Math.min(w, h) < 100 || a < 150 * 150 ? 'micro' : a < 300 * 220 ? 'compact' : a >= 600 * 380 ? 'large' : 'normal'; }
    if (Math.min(w, h) < 112 || (w < 170 && h < 170)) return 'micro';
    if (w < 300 || h < 220) return 'compact';
    return w >= 600 && h >= 380 ? 'large' : 'normal';
  }
  /** what a variant shows at a size: the brightness bar · the colour tools (inline, behind a "Colour" button, or not at all) ·
      the resolved power control. Only ever a subset of what the light reports. */
  const SHOW = {
    artwork: { micro: [0, 'none', 'button'], compact: [1, 'pop', 'switch'], normal: [1, 'pop', 'switch'], large: [1, 'inline', 'switch'] },
    compact: { micro: [0, 'none', 'button'], compact: [0, 'none', 'button'], normal: [1, 'pop', 'button'], large: [1, 'pop', 'button'] },
    slider: { micro: [1, 'none', 'button'], compact: [1, 'none', 'button'], normal: [1, 'pop', 'button'], large: [1, 'inline', 'button'] },
    image: { micro: [0, 'none', 'button'], compact: [0, 'pop', 'button'], normal: [1, 'pop', 'button'], large: [1, 'pop', 'button'] },
  };
  /** the POWER style: a Theme style (the light's own look, drawn as a shared look) or one of the shared control-button styles */
  const THEMED = ['theme', 'switch', 'round'], OWN = ['filled', 'soft', 'outline', 'bare'];
  function powerOf(c) {
    const p = c.power && typeof c.power === 'object' ? c.power : {};
    const legacy = c.variant === 'slider' ? 'theme' : c.powerStyle === 'switch' ? 'switch' : c.powerStyle === 'button' ? 'round' : 'theme';   // (Slider never offered it)
    return { ...p, style: [...THEMED, ...OWN].includes(p.style) ? p.style : legacy };
  }
  /** the POWER button's look (the shared control button): the Theme styles resolve to shared looks (form: the variant's 'switch' |
      'button'); everything else is exactly what is configured. One mapping, module-level. */
  function powerLook(pw, form) {
    const themed = THEMED.includes(pw.style);
    const style = pw.style === 'theme' ? (form === 'switch' ? 'switch' : 'filled') : pw.style === 'round' ? 'filled' : pw.style;
    return { icon: pw.icon || (style === 'switch' ? 'mdi:lightbulb' : 'mdi:power'), size: pw.size, iconSize: pw.iconSize, style, shape: pw.shape, color: pw.color, iconColor: pw.iconColor,
      stateLook: pw.stateLook, finish: themed ? 'glow' : '' };
  }
  function looks(c, variant, arr) {
    const pick = (k) => (LOOK_FOR[variant].includes(k) && LOOK[k].includes(c[k]) ? c[k] : LOOK[k][0]);
    const show = SHOW[variant][arr] || SHOW[variant].normal;
    const ps = powerOf(c).style;
    return { title: pick('titleSize'), align: pick('align'), image: pick('imageTreatment'), glow: pick('glow'), dim: !!show[0], extra: show[1],
      // toggles: where the card has room for a row of controls (Normal / Large) — never squeezed into Micro / Compact
      ctrls: arr === 'normal' || arr === 'large',
      // the power FORM: a switch or a button — the configured style decides; only Theme (Automatic) lets the variant choose (as it always has)
      power: ps === 'switch' ? 'switch' : ps !== 'theme' ? 'button' : arr === 'micro' ? 'button' : show[2] };
  }
  /** the controls list (the configurator normalises it; an older object form and junk are read safely here too) */
  const KINDS = ['brightness', 'colorTemp', 'color', 'effect'];
  function controlsOf(c) {
    const v = c.controls;
    let out;
    if (v && typeof v === 'object' && !Array.isArray(v)) out = KINDS.map((type) => (v[type] === false ? { type, show: false } : { type }));
    else if (!Array.isArray(v)) out = KINDS.map((type) => ({ type }));
    else {
      out = v.filter((x) => x && typeof x === 'object' && (x.type === 'toggle' || x.type === 'power' || KINDS.includes(x.type)));
      KINDS.forEach((k) => { if (!out.some((x) => x.type === k)) out.push({ type: k, show: false }); });   // a listed set: what it leaves out is not shown
    }
    if (!out.some((x) => x.type === 'power')) out.unshift({ type: 'power' });          // Power is always a control (first unless ordered)
    return out;
  }
  /* PLACEMENT (structured, never coordinates): a control or the title may name one of nine regions ("<top|center|bottom>-<left|center|right>");
     the brightness a line (top · center · bottom). With none named the variant's own composition is used as it always was; once one is
     named, the card is composed in the nine regions and everything not named takes the VARIANT's default region. */
  const PLACES = ['top', 'center', 'bottom'].flatMap((r) => ['left', 'center', 'right'].map((col) => `${r}-${col}`));
  const LINES = ['top', 'center', 'bottom'];
  const placeOf = (v) => (PLACES.includes(v) ? v : null);
  /** the variant's default regions at a size: title · power · the slider's big value · the brightness line */
  function defaults(variant, arr, tall, align) {
    if (variant === 'compact') return { title: 'center-left', power: 'center-right', big: null, line: 'center' };
    if (variant === 'slider') return { title: 'top-left', power: 'top-right', big: 'bottom-left', line: 'bottom' };
    if (variant === 'image') {
      if (align === 'center') return { title: 'bottom-center', power: 'bottom-center', big: null, line: 'bottom' };
      if (align === 'right') return { title: 'bottom-right', power: 'bottom-left', big: null, line: 'bottom' };
      return { title: 'bottom-left', power: 'bottom-right', big: null, line: 'bottom' };
    }
    if (arr === 'micro') return { title: 'bottom-left', power: 'top-left', big: null, line: 'bottom' };
    if (arr === 'large') return { title: 'top-left', power: 'top-right', big: null, line: 'center' };
    if (tall) return { title: 'bottom-left', power: 'bottom-right', big: null, line: 'bottom' };
    return { title: 'top-left', power: 'top-left', big: null, line: 'bottom' };
  }
  /** a toggle option's automatic colour: the colour of what it sets (warm / cool white, the hue, the light's own; off: neutral) */
  function optionAuto(o, s) {
    if (o.set === 'colorTemp') return glowOf({ hue: null, colorTempK: Number(o.kelvin) || 2700 });
    if (o.set === 'color') return `hsl(${Number(o.hue) || 0} 90% 62%)`;
    if (o.set === 'off') return 'rgb(138 143 155)';
    return glowOf(s);
  }

  /** a TOGGLE's options (only what the light can do: two of them, or it is not a choice) and its look */
  const toggleOptions = (x, caps) => [['a', x.a], ['b', x.b]].filter(([, o]) => o && typeof o === 'object' && (o.set === 'on' || o.set === 'off' || caps[o.set]));
  const toggleLook = (x, opts, s) => ({ options: opts.map(([id, o]) => ({ id, icon: o.icon, label: o.label, showLabel: o.showLabel, color: o.color, auto: optionAuto(o, s) })),
    height: x.height, iconSize: x.iconSize, gap: x.gap, padX: x.padX, style: x.style, shape: x.shape, inactive: x.inactive, color: x.color });
  /** what a toggle option asks of the light (the binding turns it into the Home Assistant call) */
  /** an option's colour temperature, within the light's own range */
  const kelvinOf = (o, r) => { const k = Number(o.kelvin) || 2700; return r && Number(r.max) > Number(r.min) ? Math.max(Number(r.min), Math.min(Number(r.max), k)) : k; };
  function optionPatch(o, r) {
    if (o.set === 'off') return { state: 'off' };
    if (o.set === 'brightness') return { state: 'on', brightness: clampPct(o.brightness ?? 100) };
    if (o.set === 'colorTemp') return { state: 'on', colorTempK: kelvinOf(o, r), hue: null };
    if (o.set === 'color') return { state: 'on', hue: Number(o.hue) || 0, colorTempK: null };
    return { state: 'on' };
  }
  /** is the light (its CONFIRMED state) what this option sets? */
  function matches(o, cf, r) {
    if (!cf.available) return false;
    if (o.set === 'off') return cf.state === 'off';
    if (cf.state !== 'on') return false;
    if (o.set === 'on') return true;
    if (o.set === 'brightness') return cf.brightness !== null && Math.abs(cf.brightness - clampPct(o.brightness ?? 100)) <= 3;
    if (o.set === 'colorTemp') return cf.colorTempK !== null && cf.colorTempK !== undefined && Math.abs(cf.colorTempK - kelvinOf(o, r)) <= 150;
    if (o.set === 'color') return cf.hue !== null && cf.hue !== undefined && Math.abs(((cf.hue - (Number(o.hue) || 0) + 540) % 360) - 180) <= 12;
    return false;
  }

  /* ---------------------------------------------------------------- component (ONE tree for every variant) */
  function create(config) {
    let s = normalise(config || {});
    const variant = variantOf(s);
    const caps = s.capabilities, name = () => s.name || 'Light';
    const C = global.IniqControls, list = controlsOf(s), pw = powerOf(s);
    // what the card PRESENTS: a control the light has, unless the owner chose not to show it (power always)
    const shows = (k) => !!caps[k] && list.some((x) => x.type === k && x.show !== false);
    const el = document.createElement('article');
    el.className = 'lw';
    el.dataset.variant = variant;
    el.dataset.lwVariant = variant;
    if (s.id) el.dataset.lightId = s.id;
    if (shows('brightness')) el.dataset.dimmable = '';   // (a slider presented: the Slider fills by brightness)
    el.dataset.caps = ['brightness', ...EXTRA].filter((k) => caps[k]).join(' ') || 'power';
    if (s.imageRatio) el.style.setProperty('--lw-art-ratio', s.imageRatio);

    el.innerHTML = `
      <div class="lw__media" aria-hidden="true"><img class="lw__photo" alt="" decoding="async" draggable="false"><span class="lw__tint"></span></div>
      <div class="lw__fill" aria-hidden="true"></div>
      <div class="lw__stage" aria-hidden="true"><div class="lw__wash"></div><div class="lw__beam"></div><img class="lw__art" alt="" decoding="async" draggable="false"><div class="lw__bloom"></div></div>
      <span class="lw__icon" aria-hidden="true"></span>
      <div class="lw__body">
        <div class="lw__id"><h3 class="lw__name"></h3><p class="lw__state"></p></div>
        <b class="lw__big" aria-hidden="true"></b>
      </div>`;
    const $ = (q) => el.querySelector(q);
    const stage = $('.lw__stage'), art = $('.lw__art'), photo = $('.lw__photo'), body = $('.lw__body'), idEl = $('.lw__id'), bigEl = $('.lw__big');
    stage.dataset.iqControl = '';                        // tapping the fixture toggles it (a convenience; the switch is the accessible control)
    // an image that does not load is shown as no image (never a broken-image symbol)
    art.addEventListener('error', () => { el.dataset.visual = 'none'; });
    photo.addEventListener('error', () => { el.dataset.visual = 'none'; });
    const iconEl = $('.lw__icon');
    stage.addEventListener('click', () => { if (s.available) set({ state: s.state === 'on' ? 'off' : 'on' }, 'artwork', true); });
    /* POWER — ONE renderer for every variant and every style: the shared control button (components/controls). The variant only says
       where it sits and its automatic size; its look (icon, sizes, style, shape, colours, state appearance) is the configured one. The
       Theme styles are shared looks too: the theme switch = the 'switch' style, the theme button = 'filled', both with the 'glow' finish
       in the light's own colour (--iqc-auto). */
    const toggleLight = () => set({ state: s.state === 'on' ? 'off' : 'on' }, 'power', true);
    const power = C ? C.button({ role: 'switch', label: `${name()} power`, onPress: toggleLight }) : Object.assign(document.createElement('button'), { type: 'button' });
    if (!C) { power.setAttribute('role', 'switch'); power.dataset.iqControl = ''; power.addEventListener('click', toggleLight); }
    power.classList.add('lw__power');
    body.append(power);

    const ctx = { name: name(), set: (patch, source, commit) => set(patch, source, commit) };
    const nodes = [];
    const mk = (k) => { const n = CONTROLS[k].render(ctx); nodes.push({ k, n }); return n; };
    /* the CONTROLS ROW: brightness and toggles in the configured order (the Slider's brightness is the card itself) */
    const ctrls = document.createElement('div');
    ctrls.className = 'lw__ctrls';
    body.append(ctrls);
    const toggles = [];
    let dimNode = null;
    list.forEach((x, i) => {
      if (x.type === 'brightness' && shows('brightness')) {
        const n = mk('brightness');
        dimNode = n;
        if (typeof x.track === 'number') el.style.setProperty('--lw-dh', `${Math.max(6, Math.min(64, x.track))}px`);
        if (x.track < 22) n.dataset.thin = '';
        if (typeof x.handle === 'number') { n.dataset.knob = ''; n.style.setProperty('--lw-hs', `${Math.max(8, Math.min(40, x.handle))}px`); }
        const bc = C && C.colour(x.color); if (bc) el.style.setProperty('--lw-bc', bc);
        (variant === 'slider' ? body : ctrls).append(n);
      }
      if (x.type === 'toggle' && C) {
        const opts = toggleOptions(x, caps);
        if (opts.length < 2) return;                                    // an option the light cannot do is not offered; one option is not a choice
        const seg = C.segmented({ label: `${name()} ${x.name || 'mode'}`, onSelect: (id) => { const o = x[id]; if (s.available && o) set(optionPatch(o, s.colorTempRange), 'toggle', true, { sets: o.set }); } });
        seg.dataset.ctrl = String(i);
        toggles.push({ x, seg, opts });
        ctrls.append(seg);
      }
    });
    // the colour tools: ONE set of controls, shown inline or as a small panel behind a "Colour" button (by variant and size)
    const kinds = list.map((x) => x.type).filter((k) => EXTRA.includes(k) && shows(k));
    let more = null, extra = null;
    if (kinds.length) {
      more = document.createElement('button');
      more.type = 'button'; more.className = 'iq-light-more'; more.dataset.iqControl = '';
      more.textContent = kinds.length === 1 && kinds[0] === 'effect' ? 'Effects' : kinds.includes('effect') ? 'Colour & effects' : 'Colour';
      more.setAttribute('aria-expanded', 'false');
      idEl.append(more);
      extra = document.createElement('div');
      extra.className = 'lw__extra iq-light-pop'; extra.dataset.iqControl = '';
      extra.innerHTML = '<button type="button" class="iq-light-pop__x" aria-label="Close colour">×</button>';
      kinds.forEach((k) => extra.append(mk(k)));
      body.append(extra);
      const toggle = (on) => { el.dataset.extraOpen = on ? 'true' : 'false'; more.setAttribute('aria-expanded', String(on)); };
      more.addEventListener('click', () => toggle(el.dataset.extraOpen !== 'true'));
      extra.querySelector('.iq-light-pop__x').addEventListener('click', () => { toggle(false); more.focus(); });
      extra.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); toggle(false); more.focus(); } });
    }
    /* the NINE REGIONS and three lines (only when something is placed): the variant's composition is the default for the rest */
    const brightItem = list.find((x) => x.type === 'brightness') || {};
    const zoned = !!(placeOf(s.titlePlace) || placeOf(pw.place) || LINES.includes(brightItem.place) || toggles.some(({ x }) => placeOf(x.place)));
    const zones = {}, lines = {};
    if (zoned) {
      el.dataset.zones = '';
      PLACES.forEach((p) => { const z = document.createElement('div'); z.className = 'lw__z'; z.dataset.z = p; zones[p] = z; });
      LINES.forEach((p) => { const z = document.createElement('div'); z.className = 'lw__ln'; z.dataset.ln = p; lines[p] = z; });
      body.prepend(...PLACES.map((p) => zones[p]), ...LINES.map((p) => lines[p]));
    }
    let laid = '';
    /** put the title, the big value and the controls in their regions — the configured ones, else the variant's — in the list's order */
    function compose(lk) {
      if (!zoned) return;
      const tall = variant === 'artwork' && box.h > 0 && box.w / box.h < 5 / 6;
      const d = defaults(variant, box.arr || 'normal', tall, lk.align);
      // a card too short for three rows of regions (a Compact row, a very low card): the horizontal intent is kept, all in the middle row
      const flat = (variant === 'compact' && (box.arr === 'micro' || box.arr === 'compact')) || (box.h > 0 && box.h < 100);
      const key = `${box.arr}|${tall}|${lk.align}|${lk.extra}|${el.dataset.orient}|${flat}`;
      if (key === laid) return;
      laid = key;
      const into = {};
      // a constrained card (Micro / Compact): a line joins its row (the brightness beside the controls there, not under them)
      const tight = box.arr === 'micro' || box.arr === 'compact';
      const put = (where, node) => {
        let w = flat && !where.startsWith('line:') ? `center-${where.split('-')[1]}` : flat ? 'line:center' : where;
        if (tight && w.startsWith('line:')) w = `${w.slice(5)}-center`;
        (into[w] = into[w] || []).push(node);
      };
      put(placeOf(s.titlePlace) || d.title, idEl);
      if (variant === 'slider') put(d.big, bigEl);
      const line = LINES.includes(brightItem.place) ? brightItem.place : d.line;
      list.forEach((x) => {
        if (x.type === 'power') put(placeOf(pw.place) || d.power, power);
        if (x.type === 'brightness' && dimNode && variant !== 'slider') put(`line:${line}`, dimNode);
        if (x.type === 'toggle') { const t = toggles.find((y) => y.x === x); if (t) put(placeOf(x.place) || `line:${line}`, t.seg); }
      });
      if (extra && lk.extra === 'inline') put(`line:${line}`, extra); else if (extra) body.append(extra);
      PLACES.forEach((p) => zones[p].replaceChildren(...(into[p] || [])));
      // in each row a region takes the room its empty neighbours leave (a long title does not squeeze another row's controls)
      ['top', 'center', 'bottom'].forEach((r) => {
        const [L, M, R] = ['left', 'center', 'right'].map((col) => zones[`${r}-${col}`]), has = (z) => z.childElementCount > 0;
        [L, M, R].forEach((z) => z.style.removeProperty('grid-column'));
        if (has(M)) { if (!has(L) || !has(R)) M.style.gridColumn = `${has(L) ? 2 : 1} / ${has(R) ? 3 : 4}`; }
        else if (has(L)) L.style.gridColumn = `1 / ${has(R) ? 3 : 4}`;
        else if (has(R)) R.style.gridColumn = '1 / 4';
      });
      LINES.forEach((p) => lines[p].replaceChildren(...(into[`line:${p}`] || [])));
    }
    // Slider without a brightness slider: nothing to slide — the whole card switches the light
    if (variant === 'slider' && !shows('brightness')) {
      const hit = document.createElement('button');
      hit.type = 'button'; hit.className = 'iq-light-alt__hit'; hit.dataset.iqControl = '';
      hit.setAttribute('aria-label', `${name()} power`);
      hit.addEventListener('click', () => set({ state: s.state === 'on' ? 'off' : 'on' }, 'power', true));
      el.append(hit);
    }

    /* VISUAL STATE: the shared glow layer (components/widget-visuals) follows the CONFIRMED state — Home Assistant's last report
       when linked, the light's own state as a demo; its intensity the confirmed brightness. */
    const V = global.IniqVisuals;
    const glow = V ? V.layers([{ target: el, rules: [{ when: { state: 'on' }, animate: { type: 'glow', intensity: { from: 'brightness', range: [1, 100], to: [0, 1] } } }] }]) : null;
    const linked = () => typeof s.onChange === 'function';
    let confirmed = { state: s.state, brightness: s.brightness, available: s.available, colorTempK: s.colorTempK, hue: s.hue };
    let box = { w: 0, h: 0, arr: '' };

    function stateText(cf) {
      if (!cf.available) return 'Unavailable';
      return cf.state === 'on' ? `On${caps.brightness && cf.brightness ? ` · ${cf.brightness}%` : ''}` : 'Off';
    }
    function render() {
      const cf = confirmed, on = cf.available && cf.state === 'on';
      const lk = looks(s, variant, box.arr || 'normal');
      el.dataset.state = s.available ? s.state : 'off';
      el.dataset.available = s.available ? 'true' : 'false';
      el.dataset.lit = on ? 'on' : cf.available ? 'off' : 'unavailable';
      el.dataset.title = lk.title; el.dataset.align = lk.align; el.dataset.image = lk.image; el.dataset.glow = lk.glow; el.dataset.power = lk.power;
      // the title size as a scale (%, the configurator's shared Slider + Number): a number overrides the former Small / Medium / Large
      if (typeof s.titleSize === 'number' && LOOK_FOR[variant].includes('titleSize')) { el.dataset.title = 'n'; el.style.setProperty('--lw-ts', String(Math.min(160, Math.max(60, s.titleSize)) / 100)); }
      else el.style.removeProperty('--lw-ts');
      el.dataset.dim = shows('brightness') && lk.dim ? 'true' : 'false';
      el.dataset.extra = kinds.length ? lk.extra : 'none';
      if (lk.extra !== 'pop' && el.dataset.extraOpen === 'true') el.dataset.extraOpen = 'false';
      el.style.setProperty('--b', caps.brightness ? (s.brightness / 100).toFixed(3) : (s.state === 'on' ? 1 : 0));
      el.style.setProperty('--lw-glow', glowOf(s));
      if (glow) glow.update({ state: on ? 'on' : 'off', available: cf.available, brightness: caps.brightness ? cf.brightness : 100 });
      $('.lw__name').textContent = name();
      const st = $('.lw__state'); st.textContent = stateText(cf);
      $('.lw__big').textContent = !cf.available ? '—' : caps.brightness ? (cf.state === 'on' ? `${cf.brightness}%` : 'Off') : (cf.state === 'on' ? 'On' : 'Off');
      // the power's look: the shared mapping (Theme styles → shared looks in the variant's form; anything else exactly as configured)
      if (power.control) power.control.update(powerLook(pw, lk.power), { on: s.state === 'on', disabled: !s.available, label: `${name()} power` });
      else { power.setAttribute('aria-checked', String(s.state === 'on')); power.disabled = !s.available; }
      compose(lk);
      // TOGGLES: the selected option is the one the CONFIRMED state matches — never assumed from a press
      const showT = lk.ctrls && toggles.length > 0;
      toggles.forEach(({ x, seg, opts }) => {
        seg.hidden = !showT;
        seg.control.update(toggleLook(x, opts, s),
        { selected: (opts.find(([, o]) => matches(o, cf, s.colorTempRange)) || [null])[0], disabled: !s.available });
      });
      el.dataset.ctrls = (lk.dim && shows('brightness') && variant !== 'slider') || showT ? 'true' : 'false';
      el.dataset.calign = ['center', 'right'].includes(s.controlAlign) ? s.controlAlign : 'left';
      if (typeof s.controlGap === 'number') el.style.setProperty('--lw-cgap', `${Math.max(0, Math.min(40, s.controlGap))}px`); else el.style.removeProperty('--lw-cgap');
      el.querySelectorAll('.iq-light-alt__hit').forEach((b) => { b.disabled = !s.available; b.setAttribute('aria-pressed', String(s.state === 'on')); });
      if (more) more.disabled = !s.available;
      // the VISUAL: the chosen artwork (each variant presents it its own way — light.css), else the fallback icon, else nothing
      const vis = visualOf(s);
      el.dataset.visual = vis.kind;
      if (vis.kind === 'fixture') { const src = s.state === 'off' && s.imageOff ? s.imageOff : vis.src; if (art.getAttribute('src') !== src) art.src = src; } else art.removeAttribute('src');
      if (vis.kind === 'scene' || vis.kind === 'photo') { if (photo.getAttribute('src') !== vis.src) photo.src = vis.src; } else photo.removeAttribute('src');
      if (vis.kind === 'icon') {
        if (iconEl.dataset.mdi !== vis.icon) { iconEl.dataset.mdi = vis.icon; iconEl.replaceChildren(); if (global.IniqIcons) global.IniqIcons.fill(iconEl); }
        if (global.IniqIcons) global.IniqIcons.background(iconEl, vis.bg);       // its surface: the shared none · subtle · accent
        if (vis.size) { iconEl.dataset.size = 'n'; el.style.setProperty('--lw-is', `${vis.size}px`); } else { delete iconEl.dataset.size; el.style.removeProperty('--lw-is'); }
        if (vis.color) iconEl.style.color = `var(--${vis.color})`; else iconEl.style.removeProperty('color');   // an allow-listed token name, never a CSS value
        if (global.IniqIcons) global.IniqIcons.animate(iconEl, vis.anim, vis.anim !== 'none' && cf.available && (vis.when === 'always' || on));
      } else { delete iconEl.dataset.mdi; iconEl.replaceChildren(); if (global.IniqIcons) global.IniqIcons.animate(iconEl, 'none', false); }
      nodes.forEach(({ k, n }) => CONTROLS[k].update(n, s));
      el.setAttribute('aria-label', `${name()}, ${stateText(cf)}`);
    }

    /** Local state change. commit=true marks the end of an interaction (onChange fires). */
    function set(patch, source = 'api', commit = true, meta = {}) {
      if (source !== 'external' && !s.available) return;                 // an unavailable light takes no input
      const pk = () => ({ state: s.state, brightness: s.brightness, colorTempK: s.colorTempK, hue: s.hue, effect: s.effect });
      const prev = pk();
      const next = { ...s, ...patch };
      next.state = next.state === 'on' ? 'on' : 'off';
      next.available = patch.available === undefined ? s.available : patch.available !== false;
      next.brightness = caps.brightness ? clampPct(next.brightness) : null;
      next.colorTempK = caps.colorTemp && Number.isFinite(Number(next.colorTempK)) && next.colorTempK !== null ? Number(next.colorTempK) : null;
      next.hue = caps.color && Number.isFinite(Number(next.hue)) && next.hue !== null ? ((Math.round(Number(next.hue)) % 360) + 360) % 360 : null;
      next.effect = caps.effect && typeof next.effect === 'string' ? next.effect : null;
      s = next;
      if (source === 'external' || !linked()) confirmed = { state: s.state, brightness: s.brightness, available: s.available, colorTempK: s.colorTempK, hue: s.hue };
      render();
      if (commit && linked()) s.onChange(pk(), prev, { ...meta, source });
    }

    render();
    // the composition follows the widget's OWN box (MaisonFit); a new arrangement re-draws once
    let queued = false;
    if (global.MaisonFit) global.MaisonFit.observe(el, { arrange: (w, h) => {
      const arr = arrangement(w, h, variant);
      el.dataset.orient = variant === 'slider' && h > w * 1.15 ? 'vertical' : 'horizontal';
      const shape = `${el.dataset.orient}|${w / h < 5 / 6}|${h < 100}`;
      if (arr !== box.arr || (zoned && shape !== box.shape)) { box = { w, h, arr, shape }; if (!queued) { queued = true; Promise.resolve().then(() => { queued = false; render(); }); } }
      box.w = w; box.h = h;
      return arr;
    } });
    el.light = {
      getState: () => ({ state: s.state, brightness: s.brightness, colorTempK: s.colorTempK, hue: s.hue, effect: s.effect, available: s.available }),
      setState: (patch) => set({ ...patch }, 'external', false),   // incoming Home Assistant state (the confirmed state)
      getConfirmed: () => ({ ...confirmed }),
    };
    return el;
  }

  /** The smallest grid area that keeps the widget usable (40px rows) — every variant has a Micro composition. */
  function constraints() {
    return { minW: { desktop: 2, tablet: 2, mobile: 2 }, minH: 2 };
  }

  global.MaisonLight = { create, constraints, arrangement, looks, glowOf, CONTROLS, CONTROL_ORDER, VARIANTS, LOOK, LOOK_FOR, BUILTINS, visualOf };
})(window);
