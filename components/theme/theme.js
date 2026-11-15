/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   Theme data model (Theme Studio — components/editor/editor.js draws the Studio).

   The semantic design tokens live in assets/css/tokens.css (--page-bg, --surface-*, --text-*, --accent, …). A theme is a set of
   VALUES for some of them, plus a few look choices and a dashboard background. Layers, lowest to highest priority:

     1. defaults        assets/css/tokens.css                       (always there: the fallback for everything — "IniqDash Original")
     2. dashboard       app.theme         { id, name?, tokens, look?, background?, dark?, base? }   applied on the dashboard surface
     3. widget type     (future)          not stored yet; MaisonTheme.resolve() already has the slot
     4. widget          item.config.theme { tokens }                applied on that widget's root element
     5. element         a widget's own explicit colours (its configuration) — always win over the theme

   A theme never carries CSS:
     tokens      allow-listed token NAMES with plain colour VALUES (#hex, rgb/rgba, hsl/hsla — numbers only; no url(), var(), calc())
     look        { font: one of FONTS (named, safe local font stacks), titleWeight 500–800, textScale .9–1.15, radius 0–32,
                   borderWidth 0–3, shadow: none | soft | standard | strong, shadowStrength 0–150 %, surfaceAlpha 40–100 %,
                   blur 0–20 px, glass: boolean, glow 0–100 % }
     background  { image: an asset reference (assets/…, a widget package asset, api/asset.php?id=<32 hex> — never an outside
                   address, never embedded data), fit: cover | contain | original | stretch, position: one of POSITIONS,
                   opacity 0–100 %, overlay: colour, overlayAlpha 0–100 %, blur 0–20 px, attach: scroll | fixed,
                   gradient: { from: colour, to: colour, angle 0–360 } }
     dark        true / false — the theme's classification (gallery); base: the built-in it started from (an id)
   Every number is checked and every CSS value apply() writes is built here from those numbers and fixed strings. Anything else is
   rejected by check() (import / save) and ignored by apply() (render), so a damaged theme falls back to the defaults.

     MaisonTheme.check(theme, path)      → [error text]   structural + value validation
     MaisonTheme.clean(theme)            → the same theme without invalid parts, or null when nothing valid is left
     MaisonTheme.resolve({ dashboard, type, widget }) → merged { token: value }
     MaisonTheme.apply(el, theme)        → number of tokens set on el (inline custom properties, valid ones only)
     MaisonTheme.clear(el, theme)        → removes what apply() set
     MaisonTheme.BUILTINS                → the read-only built-in themes (IniqDash Original first: no value at all)
   ========================================================================== */
(function (global) {
  'use strict';

  /** the colour tokens a theme may set (names without the leading --) */
  const TOKENS = [
    'page-bg', 'page-bg-darker', 'page-bg-lighter',
    'surface-primary', 'surface-primary-top', 'surface-secondary', 'surface-tertiary',
    'border-primary', 'border-subtle', 'edge-highlight',
    'text-primary', 'text-secondary', 'text-muted',
    'accent', 'accent-hot', 'accent-soft', 'accent-line', 'success', 'warning', 'danger', 'info', 'cool', 'purple', 'solar', 'neutral', 'nav-bg', 'surface-interactive',
    'light-warm', 'light-hot', 'heat-warm', 'heat-hot',
    'control-well', 'device-surface-solid', 'device-surface-top', 'device-surface-mid', 'device-surface-bottom', 'accent-on',
    // V2 — each has a CSS fallback equal to what that element showed before (so nothing changes until a theme sets it)
    'nav-active', 'nav-active-bg', 'nav-inactive', 'nav-indicator', 'text-heading', 'card-border', 'slider-track', 'slider-fill',
    'button-bg', 'button-fg', 'control-off-bg', 'control-off-fg', 'focus',
  ];
  /** the THEME STUDIO's categories (every token above in one of them) */
  const GROUPS = [
    ['page', 'Dashboard background', ['page-bg', 'page-bg-darker', 'page-bg-lighter']],
    ['nav', 'Navigation', ['nav-bg', 'nav-inactive', 'nav-active', 'nav-active-bg', 'nav-indicator']],
    ['surfaces', 'Cards & panels', ['device-surface-top', 'device-surface-mid', 'device-surface-bottom', 'device-surface-solid', 'surface-primary', 'surface-primary-top', 'surface-secondary', 'surface-tertiary', 'surface-interactive', 'control-well']],
    ['borders', 'Borders', ['card-border', 'border-primary', 'border-subtle', 'edge-highlight']],
    ['text', 'Text', ['text-heading', 'text-primary', 'text-secondary', 'text-muted']],
    ['accent', 'Accent', ['accent', 'accent-hot', 'accent-soft', 'accent-line', 'accent-on']],
    ['controls', 'Controls', ['button-bg', 'button-fg', 'control-off-bg', 'control-off-fg', 'slider-track', 'slider-fill', 'focus']],
    ['status', 'Status', ['success', 'warning', 'danger', 'info', 'neutral', 'cool', 'purple', 'solar']],
    ['light', 'Light and heat', ['light-warm', 'light-hot', 'heat-warm', 'heat-hot']],
  ];
  const LABEL = { 'page-bg': 'Page', 'page-bg-darker': 'Page (darker)', 'page-bg-lighter': 'Page (lighter)', 'nav-bg': 'Navigation', 'surface-primary': 'Card', 'surface-primary-top': 'Card (top)', 'surface-secondary': 'Inset',
    'surface-tertiary': 'Raised controls', 'surface-interactive': 'Hover / pressed', 'device-surface-top': 'Widget card (top)', 'device-surface-mid': 'Widget card (middle)', 'device-surface-bottom': 'Widget card (bottom)',
    'device-surface-solid': 'Widget card (solid)', 'control-well': 'Wells and tracks', 'border-primary': 'Border', 'border-subtle': 'Border (subtle)', 'edge-highlight': 'Top-edge highlight', 'text-primary': 'Primary text',
    'text-secondary': 'Secondary text', 'text-muted': 'Muted text', accent: 'Accent', 'accent-hot': 'Accent (strong)', 'accent-soft': 'Accent tint', 'accent-line': 'Accent line', 'accent-on': 'Text on accent', success: 'Good',
    warning: 'Warning', danger: 'Error', info: 'Information', neutral: 'Inactive / unavailable', cool: 'Cooling', purple: 'Secondary information', solar: 'Solar', 'light-warm': 'Light glow', 'light-hot': 'Bulb', 'heat-warm': 'Heating', 'heat-hot': 'Heating (strong)',
    'nav-active': 'Active page (text / icon)', 'nav-active-bg': 'Active page (background)', 'nav-inactive': 'Inactive pages', 'nav-indicator': 'Selected indicator', 'text-heading': 'Headings',
    'card-border': 'Card border', 'slider-track': 'Slider track', 'slider-fill': 'Slider fill', 'button-bg': 'Button surface', 'button-fg': 'Button text', 'control-off-bg': 'Control (off) surface',
    'control-off-fg': 'Control (off) icon', focus: 'Keyboard focus' };
  /** what a token is used for (the Studio's "Affects" line) */
  const USES = { 'page-bg': 'The dashboard behind the cards', 'page-bg-darker': 'A page whose background is set to Darker', 'page-bg-lighter': 'A page whose background is set to Lighter',
    'nav-bg': 'The navigation dock — sidebar, top or bottom bar', 'nav-inactive': 'Page names and icons that are not selected', 'nav-active': 'The selected page\'s name and icon',
    'nav-active-bg': 'The selected page\'s background', 'nav-indicator': 'The bar under the selected page', 'device-surface-top': 'Device cards (light, climate, room…): top of the gradient',
    'device-surface-mid': 'Device cards: middle of the gradient', 'device-surface-bottom': 'Device cards: bottom of the gradient', 'device-surface-solid': 'Places that need one solid card colour',
    'surface-primary': 'Panels, containers and buttons', 'surface-primary-top': 'Panels and containers: top of the gradient', 'surface-secondary': 'Inset areas inside cards', 'surface-tertiary': 'Raised controls (off)',
    'surface-interactive': 'Hover and pressed controls', 'control-well': 'Recessed tracks, wells and segment backgrounds', 'card-border': 'The fine border around device cards',
    'border-primary': 'Panel and container edges', 'border-subtle': 'Dividers and subtle outlines', 'edge-highlight': 'The light top edge of panels', 'text-heading': 'Dashboard and panel headings',
    'text-primary': 'Names, values and most text', 'text-secondary': 'Secondary labels and states', 'text-muted': 'Hints, units and captions', accent: 'Primary buttons, active controls, sliders, the selected page',
    'accent-hot': 'The accent\'s pressed / strong form', 'accent-soft': 'Accent tints behind active items', 'accent-line': 'Accent outlines', 'accent-on': 'Text and icons on the accent',
    'button-bg': 'The Button widget\'s surface', 'button-fg': 'The Button widget\'s text', 'control-off-bg': 'Round control buttons that are off', 'control-off-fg': 'Icons of control buttons that are off',
    'slider-track': 'The unfilled part of sliders', 'slider-fill': 'The filled part of sliders', focus: 'The keyboard focus ring', success: 'Active / good states', warning: 'Warnings', danger: 'Errors and alarms',
    info: 'Information', neutral: 'Inactive, idle and unavailable states', cool: 'Cooling', purple: 'Secondary information', solar: 'Solar production', 'light-warm': 'The glow of lights that are on',
    'light-hot': 'The bulb of lights that are on', 'heat-warm': 'Heating (start of the arc)', 'heat-hot': 'Heating (end of the arc)' };
  /** tokens.css defines these FROM other tokens; a custom property is resolved where it is declared, so a theme root declares
      them again (fixed strings — never configuration) and they follow the theme's values there */
  const DERIVED = {
    'device-surface': 'radial-gradient(120% 90% at 100% 0%, rgba(255, 255, 255, .03), transparent 60%), linear-gradient(165deg, var(--device-surface-top) 0%, var(--device-surface-mid) 55%, var(--device-surface-bottom) 100%)',
    'surface-active': 'var(--accent-soft)',
    'focus-ring': '2px solid var(--focus, var(--accent))',
    'device-shadow': 'inset 0 1px 0 rgba(255, 255, 255, .06), inset 0 0 0 1px var(--card-border), 0 12px 26px -16px rgba(0, 0, 0, .85)',
    'shadow-primary': '0 1px 0 var(--edge-highlight) inset, 0 14px 30px -18px rgba(0, 0, 0, .85), 0 1px 3px rgba(0, 0, 0, .35)',
    'shadow-secondary': '0 1px 3px rgba(0, 0, 0, .5) inset, 0 0 0 1px var(--border-subtle)',
  };
  /** THE BUILT-IN THEMES (read-only: duplicate one to customise it). IniqDash Original stores NO value at all — it IS tokens.css,
      so it is always exactly the original look. The others set a complete palette on the same shared tokens. */
  const PRESETS = [
    { id: 'iniqdash', name: 'IniqDash Original', dark: true, tokens: {} },
    { id: 'midnight-ember', name: 'Midnight Ember', dark: true,
      tokens: { 'page-bg': '#141416', 'page-bg-darker': '#0f0f11', 'page-bg-lighter': '#1a1a1d', 'nav-bg': '#18181b', 'nav-inactive': '#b3aca2', 'nav-active': '#ff8c3a', 'nav-active-bg': 'rgba(255, 122, 26, 0.14)', 'nav-indicator': '#ff7a1a',
        'device-surface-top': '#28272a', 'device-surface-mid': '#211f21', 'device-surface-bottom': '#1b1a1c', 'device-surface-solid': '#222023', 'surface-primary': '#232224', 'surface-primary-top': '#2a292c', 'surface-secondary': '#1c1b1d',
        'surface-tertiary': '#302e31', 'surface-interactive': '#3a383b', 'control-well': '#111012', 'card-border': 'rgba(255, 170, 110, 0.07)', 'border-primary': 'rgba(255, 255, 255, 0.08)', 'border-subtle': 'rgba(255, 255, 255, 0.05)',
        'text-heading': '#fff6ec', 'text-primary': '#f5f0e8', 'text-secondary': '#c7bfb3', 'text-muted': '#948c81', accent: '#ff7a1a', 'accent-hot': '#ff6200', 'accent-soft': 'rgba(255, 122, 26, 0.16)', 'accent-line': 'rgba(255, 122, 26, 0.42)', 'accent-on': '#1d0e02',
        'slider-track': 'rgba(255, 255, 255, 0.12)', 'slider-fill': '#ff7a1a', 'control-off-bg': '#302e31', 'control-off-fg': '#a49c91' },
      look: { radius: 18, shadow: 'standard', glow: 35, titleWeight: 700 },
      background: { gradient: { from: '#1d1512', to: '#121214', angle: 160 } } },
    { id: 'azure-home', name: 'Azure Home', dark: false,
      tokens: { 'page-bg': '#e8f1fd', 'page-bg-darker': '#dbe7f8', 'page-bg-lighter': '#f3f8ff', 'nav-bg': '#ffffff', 'nav-inactive': '#56657c', 'nav-active': '#1a5fdf', 'nav-active-bg': 'rgba(26, 98, 232, 0.12)', 'nav-indicator': '#1a62e8',
        'device-surface-top': '#ffffff', 'device-surface-mid': '#ffffff', 'device-surface-bottom': '#f7faff', 'device-surface-solid': '#ffffff', 'surface-primary': '#ffffff', 'surface-primary-top': '#ffffff', 'surface-secondary': '#f0f5fc',
        'surface-tertiary': '#e5edf8', 'surface-interactive': '#d9e4f5', 'control-well': '#e1e9f5', 'card-border': 'rgba(31, 74, 140, 0.09)', 'border-primary': 'rgba(20, 50, 100, 0.1)', 'border-subtle': 'rgba(20, 50, 100, 0.06)', 'edge-highlight': 'rgba(255, 255, 255, 0.9)',
        'text-heading': '#0b1626', 'text-primary': '#0f1b2d', 'text-secondary': '#435269', 'text-muted': '#5f6e84', accent: '#1a62e8', 'accent-hot': '#1254cc', 'accent-soft': 'rgba(26, 98, 232, 0.12)', 'accent-line': 'rgba(26, 98, 232, 0.35)', 'accent-on': '#ffffff',
        'slider-track': 'rgba(15, 27, 45, 0.12)', 'slider-fill': '#1a62e8', 'button-bg': '#ffffff', 'button-fg': '#0f1b2d', 'control-off-bg': '#e5edf8', 'control-off-fg': '#56657c',
        success: '#14965a', warning: '#d17f00', danger: '#e0393f', info: '#1a62e8', neutral: '#8592a5' },
      look: { radius: 20, shadow: 'soft', shadowStrength: 55, borderWidth: 1, titleWeight: 700 },
      background: { gradient: { from: '#e3eefd', to: '#f6f9ff', angle: 180 } } },
    { id: 'mint-garden', name: 'Mint Garden', dark: false,
      tokens: { 'page-bg': '#e3f3e9', 'page-bg-darker': '#d4ebdd', 'page-bg-lighter': '#eef8f2', 'nav-bg': '#1a6e44', 'nav-inactive': '#e2f6ea', 'nav-active': '#ffffff', 'nav-active-bg': 'rgba(255, 255, 255, 0.18)', 'nav-indicator': '#ffffff',
        'device-surface-top': '#ffffff', 'device-surface-mid': '#fbfefc', 'device-surface-bottom': '#f3faf5', 'device-surface-solid': '#ffffff', 'surface-primary': '#ffffff', 'surface-primary-top': '#ffffff', 'surface-secondary': '#edf7f0',
        'surface-tertiary': '#ddefe3', 'surface-interactive': '#cfe7d8', 'control-well': '#d9ebdf', 'card-border': 'rgba(20, 90, 55, 0.08)', 'border-primary': 'rgba(20, 80, 50, 0.1)', 'border-subtle': 'rgba(20, 80, 50, 0.06)', 'edge-highlight': 'rgba(255, 255, 255, 0.9)',
        'text-heading': '#0c3a23', 'text-primary': '#12261b', 'text-secondary': '#3c5848', 'text-muted': '#5d7768', accent: '#18864f', 'accent-hot': '#126f41', 'accent-soft': 'rgba(24, 134, 79, 0.14)', 'accent-line': 'rgba(24, 134, 79, 0.38)', 'accent-on': '#ffffff',
        'slider-track': 'rgba(18, 38, 27, 0.12)', 'slider-fill': '#18864f', 'button-bg': '#ffffff', 'button-fg': '#12261b', 'control-off-bg': '#ddefe3', 'control-off-fg': '#4f6a5b',
        success: '#16924f', warning: '#c97f06', danger: '#d23c45', info: '#2a7fbd', neutral: '#8a9e93' },
      look: { radius: 24, shadow: 'soft', shadowStrength: 60, font: 'rounded', titleWeight: 700 },
      background: { image: 'assets/themes/leaves.svg', fit: 'cover', opacity: 100 } },
    { id: 'slate-peach', name: 'Slate & Peach', dark: false,
      tokens: { 'page-bg': '#e4e2df', 'page-bg-darker': '#d9d6d2', 'page-bg-lighter': '#eceae7', 'nav-bg': '#383b42', 'nav-inactive': '#c4c7cd', 'nav-active': '#ffbe98', 'nav-active-bg': 'rgba(255, 180, 138, 0.16)', 'nav-indicator': '#f59a6b',
        'device-surface-top': '#fbfaf8', 'device-surface-mid': '#f7f5f2', 'device-surface-bottom': '#f1eee9', 'device-surface-solid': '#f8f6f3', 'surface-primary': '#faf9f7', 'surface-primary-top': '#fdfcfa', 'surface-secondary': '#eeebe6',
        'surface-tertiary': '#e5e1db', 'surface-interactive': '#dbd6cf', 'control-well': '#e1dcd5', 'card-border': 'rgba(60, 50, 40, 0.08)', 'border-primary': 'rgba(40, 35, 30, 0.1)', 'border-subtle': 'rgba(40, 35, 30, 0.06)', 'edge-highlight': 'rgba(255, 255, 255, 0.85)',
        'text-heading': '#23252b', 'text-primary': '#2b2d33', 'text-secondary': '#53575f', 'text-muted': '#666a72', accent: '#e9804f', 'accent-hot': '#d96c39', 'accent-soft': 'rgba(233, 128, 79, 0.16)', 'accent-line': 'rgba(233, 128, 79, 0.42)', 'accent-on': '#2a1307',
        'slider-track': 'rgba(43, 45, 51, 0.12)', 'slider-fill': '#e9804f', 'button-bg': '#faf9f7', 'button-fg': '#2b2d33', 'control-off-bg': '#e5e1db', 'control-off-fg': '#62666e',
        success: '#2f8f5c', warning: '#c27a12', danger: '#c8443d', info: '#4475b0', neutral: '#8b8e95' },
      look: { radius: 16, shadow: 'soft', shadowStrength: 75, titleWeight: 600 },
      background: { image: 'assets/themes/peach.svg', fit: 'cover', opacity: 100 } },
    { id: 'minimal-light', name: 'Minimal Light', dark: false,
      tokens: { 'page-bg': '#f4f4f5', 'page-bg-darker': '#ebebed', 'page-bg-lighter': '#fafafa', 'nav-bg': '#ffffff', 'nav-inactive': '#5f5f68', 'nav-active': '#111114', 'nav-active-bg': '#ececef', 'nav-indicator': '#111114',
        'device-surface-top': '#ffffff', 'device-surface-mid': '#ffffff', 'device-surface-bottom': '#ffffff', 'device-surface-solid': '#ffffff', 'surface-primary': '#ffffff', 'surface-primary-top': '#ffffff', 'surface-secondary': '#f6f6f7',
        'surface-tertiary': '#eeeef0', 'surface-interactive': '#e4e4e7', 'control-well': '#ebebee', 'card-border': 'rgba(0, 0, 0, 0.09)', 'border-primary': 'rgba(0, 0, 0, 0.09)', 'border-subtle': 'rgba(0, 0, 0, 0.06)', 'edge-highlight': '#ffffff',
        'text-heading': '#09090b', 'text-primary': '#111114', 'text-secondary': '#46464e', 'text-muted': '#63636c', accent: '#18181b', 'accent-hot': '#000000', 'accent-soft': 'rgba(24, 24, 27, 0.08)', 'accent-line': 'rgba(24, 24, 27, 0.28)', 'accent-on': '#ffffff',
        'slider-track': 'rgba(0, 0, 0, 0.1)', 'slider-fill': '#18181b', 'button-bg': '#ffffff', 'button-fg': '#111114', 'control-off-bg': '#eeeef0', 'control-off-fg': '#5f5f68',
        success: '#15803d', warning: '#b45309', danger: '#dc2626', info: '#2563eb', neutral: '#8b8b93' },
      look: { radius: 12, shadow: 'none', borderWidth: 1, font: 'system', titleWeight: 600 } },
  ];
  /** WCAG contrast ratio of two opaque colours (#rgb / #rrggbb / rgb()); null when one is not opaque or not readable */
  function contrast(a, b) {
    const rgb = (v) => {
      if (typeof v !== 'string') return null;
      let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
      if (m) { const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]; return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
      m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
      if (m && (m[4] === undefined || Number(m[4]) >= 1)) return [m[1], m[2], m[3]].map(Number);
      return null;
    };
    const L = (c) => { const [r, g, b2] = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b2; };
    const x = rgb(a), y = rgb(b);
    if (!x || !y) return null;
    const [h1, l1] = [L(x), L(y)].sort((p, q) => q - p);
    return Math.round(((h1 + 0.05) / (l1 + 0.05)) * 100) / 100;
  }
  const MAX_TOKENS = 60;
  const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const FN = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.]+%?(?:\s*[, ]\s*[0-9.]+%?){2}(?:\s*[,/]\s*[0-9.]+%?)?\s*\)$/;
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const colour = (v) => typeof v === 'string' && v.length <= 64 && (HEX.test(v) || FN.test(v));

  /* ---- LOOK: named choices and bounded numbers — the CSS is written here, never taken from the theme */
  const FONTS = {
    default: { label: 'IniqDash (Manrope)', stack: null },
    system: { label: 'System', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
    rounded: { label: 'Rounded', stack: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "Arial Rounded MT Bold", system-ui, sans-serif' },
    humanist: { label: 'Humanist', stack: '"Segoe UI", "Helvetica Neue", "Noto Sans", "Open Sans", Arial, sans-serif' },
    serif: { label: 'Serif', stack: 'ui-serif, Georgia, Cambria, "Times New Roman", serif' },
    mono: { label: 'Monospace', stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
    poppins: { label: 'Poppins', stack: '"Poppins", "Manrope", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
  };
  const SHADOWS = {
    none: { label: 'None', outer: [] },
    soft: { label: 'Soft', outer: [[0, 6, 16, -10, 0.45]] },
    standard: { label: 'Standard', outer: [[0, 12, 26, -16, 0.85]] },
    strong: { label: 'Strong', outer: [[0, 18, 36, -14, 0.9], [0, 2, 6, 0, 0.4]] },
  };
  const LOOK = {   // key: [min, max, step] for numbers; a list for named choices; 'bool'
    font: Object.keys(FONTS), titleWeight: [500, 800, 100], textScale: [0.9, 1.15, 0.05], radius: [0, 32, 1], borderWidth: [0, 3, 1],
    shadow: Object.keys(SHADOWS), shadowStrength: [0, 150, 5], surfaceAlpha: [40, 100, 1], blur: [0, 20, 1], glass: 'bool', glow: [0, 100, 5],
    // the PAGE FRAME (viewing): its padding, its outer margin, its corner radius, the page title size, the navigation's style (with labels
    // or icons only) and the frame itself (flat: one page colour · panel: the page is a panel on the navigation colour)
    pagePad: [0, 48, 1], pageMargin: [0, 48, 1], pageRadius: [0, 40, 1], titleSize: [14, 40, 1], headGap: [0, 64, 1], navStyle: ['labels', 'icons'], pageFrame: ['flat', 'panel'],
  };
  const FITS = { cover: 'cover', contain: 'contain', original: 'auto', stretch: '100% 100%' };
  const POSITIONS = { center: 'center', top: 'center top', bottom: 'center bottom', left: 'left center', right: 'right center', 'top-left': 'left top', 'top-right': 'right top', 'bottom-left': 'left bottom', 'bottom-right': 'right bottom' };
  const BACKGROUND = { image: 'image', fit: Object.keys(FITS), position: Object.keys(POSITIONS), opacity: [0, 100, 1], overlay: 'colour', overlayAlpha: [0, 100, 1], blur: [0, 20, 1], attach: ['scroll', 'fixed'], gradient: 'gradient' };
  /** a background image: a shared asset, a widget package asset or an uploaded IniqDash User Asset — never an outside address,
      never embedded data, never "..". The reference is all a theme (or its export) carries: no server path, no credential. */
  const IMAGE = /^(?!.*\.\.)(assets\/[A-Za-z0-9._\/-]{1,200}\.(?:png|jpe?g|webp|gif|svg)|widgets\/(default|custom)\/[a-z0-9][a-z0-9-]*\/(?:[a-z0-9][a-z0-9-]*\/)?assets\/[A-Za-z0-9._\/-]{1,200}\.(?:png|jpe?g|webp|gif|svg)|api\/asset\.php\?id=[0-9a-f]{32})$/;
  const isImage = (v) => typeof v === 'string' && v.length <= 300 && IMAGE.test(v);
  const inRange = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const okValue = (rule, v) => (rule === 'bool' ? typeof v === 'boolean' : rule === 'colour' ? colour(v) : rule === 'image' ? isImage(v)
    : rule === 'gradient' ? isObj(v) && Object.keys(v).every((k) => ['from', 'to', 'angle'].includes(k)) && colour(v.from) && colour(v.to) && (v.angle === undefined || inRange(v.angle, [0, 360]))
      : Array.isArray(rule) && typeof rule[0] === 'string' ? rule.includes(v) : inRange(v, rule));
  function checkPart(obj, rules, path) {
    if (!isObj(obj)) return [`${path}: must be an object`];
    const errors = [];
    Object.keys(obj).forEach((k) => {
      if (!Object.prototype.hasOwnProperty.call(rules, k)) errors.push(`${path}: "${String(k).slice(0, 30)}" is not a supported property`);
      else if (!okValue(rules[k], obj[k])) errors.push(`${path}.${k}: not an allowed value`);
    });
    return errors;
  }
  const cleanPart = (obj, rules) => { const out = {}; if (isObj(obj)) Object.keys(rules).forEach((k) => { if (obj[k] !== undefined && okValue(rules[k], obj[k])) out[k] = isObj(obj[k]) ? { ...obj[k] } : obj[k]; }); return out; };

  function check(theme, path = 'theme') {
    const errors = [];
    if (!isObj(theme)) return [`${path}: must be an object`];
    Object.keys(theme).forEach((k) => { if (!['id', 'name', 'tokens', 'look', 'background', 'dark', 'base'].includes(k)) errors.push(`${path}: unknown key "${String(k).slice(0, 30)}"`); });
    if (theme.id !== undefined && (typeof theme.id !== 'string' || !ID.test(theme.id))) errors.push(`${path}.id: lowercase letters, digits and - (max 40)`);
    if (theme.base !== undefined && (typeof theme.base !== 'string' || !ID.test(theme.base))) errors.push(`${path}.base: lowercase letters, digits and - (max 40)`);
    if (theme.name !== undefined && (typeof theme.name !== 'string' || theme.name.length > 60 || /[<>]/.test(theme.name))) errors.push(`${path}.name: text up to 60 characters, no < or >`);
    if (theme.dark !== undefined && typeof theme.dark !== 'boolean') errors.push(`${path}.dark: true or false`);
    if (theme.look !== undefined) errors.push(...checkPart(theme.look, LOOK, `${path}.look`));
    if (theme.background !== undefined) errors.push(...checkPart(theme.background, BACKGROUND, `${path}.background`));
    if (theme.tokens === undefined) return errors;
    if (!isObj(theme.tokens)) { errors.push(`${path}.tokens: must be an object`); return errors; }
    const names = Object.keys(theme.tokens);
    if (names.length > MAX_TOKENS) errors.push(`${path}.tokens: at most ${MAX_TOKENS} tokens`);
    names.slice(0, MAX_TOKENS).forEach((k) => {
      if (!TOKENS.includes(k)) errors.push(`${path}.tokens: "${String(k).slice(0, 30)}" is not a theme token`);
      else if (!colour(theme.tokens[k])) errors.push(`${path}.tokens.${k}: a plain colour (#rrggbb, rgb(), rgba(), hsl(), hsla())`);
    });
    return errors;
  }

  function clean(theme) {
    if (!isObj(theme)) return null;
    const tokens = {};
    if (isObj(theme.tokens)) Object.keys(theme.tokens).slice(0, MAX_TOKENS).forEach((k) => { if (TOKENS.includes(k) && colour(theme.tokens[k])) tokens[k] = theme.tokens[k]; });
    const out = {};
    if (typeof theme.id === 'string' && ID.test(theme.id)) out.id = theme.id;
    if (typeof theme.name === 'string' && theme.name.length <= 60 && !/[<>]/.test(theme.name)) out.name = theme.name;
    if (typeof theme.base === 'string' && ID.test(theme.base)) out.base = theme.base;
    if (typeof theme.dark === 'boolean') out.dark = theme.dark;
    if (Object.keys(tokens).length) out.tokens = tokens;
    const look = cleanPart(theme.look, LOOK), bg = cleanPart(theme.background, BACKGROUND);
    if (Object.keys(look).length) out.look = look;
    if (Object.keys(bg).length) out.background = bg;
    return out.tokens || out.look || out.background || out.id ? out : null;
  }

  /* ---- colours as numbers (contrast, transparency, classification) */
  function rgba(v) {
    if (typeof v !== 'string') return null;
    let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v.trim());
    if (m) { let x = m[1]; if (x.length <= 4) x = x.split('').map((c) => c + c).join(''); const n = [0, 2, 4, 6].map((i) => parseInt(x.slice(i, i + 2) || 'ff', 16)); return [n[0], n[1], n[2], n[3] / 255]; }
    m = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/i.exec(v.trim());
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1)];
    return null;
  }
  const luminance = (c) => { const [r, g, b] = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  /** a dark or a light theme — stored (dark) or judged from its page colour (no page colour: the original, dark) */
  function isDark(theme) {
    if (theme && typeof theme.dark === 'boolean') return theme.dark;
    const c = rgba(theme && theme.tokens && theme.tokens['page-bg']);
    return c ? luminance(c) < 0.25 : true;
  }
  const num = (x) => String(Math.round(x * 1000) / 1000);

  /** the CSS custom properties (and data attributes) a theme's LOOK and BACKGROUND set — built from checked numbers and fixed strings */
  const LOOK_PROPS = ['--page-head-gap', '--page-pad', '--page-margin', '--page-radius', '--page-title-size', '--font', '--iq-fw-title', '--iq-fw-display', '--fs-title', '--fs-title-secondary', '--fs-subtitle', '--fs-status', '--fs-body', '--radius-device', '--radius-widget', '--radius-container', '--radius-subcontainer',
    '--device-shadow', '--shadow-primary', '--theme-blur', '--theme-glow', '--theme-bg', '--theme-bg-image', '--theme-bg-size', '--theme-bg-position', '--theme-bg-opacity', '--theme-bg-blur', '--theme-bg-overlay', '--theme-bg-attach'];
  const SURFACES = ['device-surface-top', 'device-surface-mid', 'device-surface-bottom', 'surface-primary', 'surface-primary-top', 'button-bg'];
  const FS = { '--fs-title': 17, '--fs-title-secondary': 14.5, '--fs-subtitle': 12, '--fs-status': 11.5, '--fs-body': 13 };
  function lookProps(c, base) {
    const out = {}, attrs = {}, L = c.look || {}, G = c.background || {};
    if (L.font && FONTS[L.font].stack) out['--font'] = FONTS[L.font].stack;
    if (L.pagePad !== undefined) out['--page-pad'] = `${L.pagePad}px`;
    if (L.pageMargin !== undefined) out['--page-margin'] = `${L.pageMargin}px`;
    if (L.pageRadius !== undefined) out['--page-radius'] = `${L.pageRadius}px`;
    if (L.titleSize !== undefined) out['--page-title-size'] = `${L.titleSize}px`;
    if (L.headGap !== undefined) out['--page-head-gap'] = `${L.headGap}px`;
    if (L.navStyle === 'icons') attrs.themeNavIcons = '';
    if (L.pageFrame === 'panel') attrs.themeFramePanel = '';
    if (L.titleWeight) { out['--iq-fw-title'] = String(L.titleWeight); out['--iq-fw-display'] = String(L.titleWeight); }
    if (L.textScale && L.textScale !== 1) Object.entries(FS).forEach(([k, v]) => { out[k] = `${num(v * L.textScale)}px`; });
    if (L.radius !== undefined) { out['--radius-device'] = `${L.radius}px`; out['--radius-widget'] = `${Math.max(0, L.radius - 2)}px`; out['--radius-container'] = `${L.radius + 4}px`; out['--radius-subcontainer'] = `${L.radius}px`; }
    const glass = L.glass === true;
    const alpha = Math.min(L.surfaceAlpha !== undefined ? L.surfaceAlpha : 100, glass ? 62 : 100) / 100;
    const blur = Math.max(L.blur || 0, glass ? 14 : 0);
    if (L.shadow !== undefined || L.borderWidth !== undefined || L.shadowStrength !== undefined || glass) {
      const k = (L.shadowStrength !== undefined ? L.shadowStrength : 100) / 100, bw = L.borderWidth !== undefined ? L.borderWidth : 1;
      const outer = SHADOWS[L.shadow || 'standard'].outer.map(([x, y, b, s, a]) => `${x} ${y}px ${b}px ${s}px rgba(0, 0, 0, ${num(Math.min(1, a * k))})`);
      out['--device-shadow'] = [`inset 0 1px 0 ${glass ? 'rgba(255, 255, 255, .22)' : 'rgba(255, 255, 255, .06)'}`, bw ? `inset 0 0 0 ${bw}px ${glass && !(c.tokens && c.tokens['card-border']) ? 'rgba(255, 255, 255, .16)' : 'var(--card-border)'}` : null, ...outer].filter(Boolean).join(', ') || 'none';
      out['--shadow-primary'] = ['0 1px 0 var(--edge-highlight) inset', ...outer].join(', ');
    }
    if (blur > 0) { out['--theme-blur'] = `${blur}px`; attrs.themeBlur = ''; }
    if (L.glow) { out['--theme-glow'] = `0 0 ${num(4 + L.glow / 5)}px color-mix(in srgb, var(--accent) ${Math.round(L.glow * 0.6)}%, transparent)`; attrs.themeGlow = ''; }
    // card transparency: the surface colours themselves become translucent (everything drawn from them follows)
    const tokens = {};
    if (alpha < 1) SURFACES.forEach((t) => { const v = rgba((c.tokens && c.tokens[t]) || (base && base(t))); if (v) tokens[t] = `rgba(${v[0]}, ${v[1]}, ${v[2]}, ${num(v[3] * alpha)})`; });
    // background
    const grad = G.gradient;
    if (grad) out['--theme-bg'] = `linear-gradient(${grad.angle !== undefined ? grad.angle : 180}deg, ${grad.from}, ${grad.to})`;
    if (G.image) {
      out['--theme-bg-image'] = `url("${G.image}")`;
      out['--theme-bg-size'] = FITS[G.fit || 'cover']; out['--theme-bg-position'] = POSITIONS[G.position || 'center'];
      out['--theme-bg-opacity'] = num((G.opacity !== undefined ? G.opacity : 100) / 100);
      out['--theme-bg-blur'] = G.blur && G.attach !== 'fixed' ? `blur(${G.blur}px)` : 'none';
      out['--theme-bg-attach'] = G.attach === 'fixed' ? 'fixed' : 'scroll';
      attrs.themeBgImage = '';
    }
    if (G.overlay && G.overlayAlpha) { const v = rgba(G.overlay); if (v) { out['--theme-bg-overlay'] = `rgba(${v[0]}, ${v[1]}, ${v[2]}, ${num((G.overlayAlpha / 100) * v[3])})`; attrs.themeBgOverlay = ''; } }
    if (grad || G.image || attrs.themeBgOverlay !== undefined) attrs.themeBg = '';
    if (c.tokens && c.tokens['text-heading']) attrs.themeHeading = '';
    return { props: out, attrs, tokens };
  }

  /** defaults < dashboard < widget type (future) < widget: the merged token values (defaults are CSS, so not included) */
  function resolve({ dashboard, type, widget } = {}) {
    const out = {};
    [dashboard, type, widget].forEach((t) => { const c = clean(t); if (c && c.tokens) Object.assign(out, c.tokens); });
    return out;
  }

  /** a token's default value (tokens.css) — for the look's transparency of a surface the theme does not set */
  const defaultOf = (t) => { try { return getComputedStyle(document.documentElement).getPropertyValue(`--${t}`).trim(); } catch (e) { return ''; } };
  const ATTRS = ['themeBlur', 'themeGlow', 'themeBg', 'themeBgImage', 'themeBgOverlay', 'themeHeading', 'themeNavIcons', 'themeFramePanel'];
  function apply(el, theme) {
    const c = clean(theme); let n = 0;
    if (!el || !el.style || !c || (!c.tokens && !c.look && !c.background)) return 0;
    const L = lookProps(c, defaultOf);
    Object.entries({ ...(c.tokens || {}), ...L.tokens }).forEach(([k, v]) => { el.style.setProperty(`--${k}`, v); n++; });
    Object.entries(DERIVED).forEach(([k, v]) => el.style.setProperty(`--${k}`, v));     // they follow this theme's values here
    // an image reference is relative to the PAGE: a url() inside a custom property would otherwise resolve against the stylesheet that uses it
    if (L.props['--theme-bg-image'] && typeof document !== 'undefined') L.props['--theme-bg-image'] = `url("${new URL(c.background.image, document.baseURI).href}")`;
    Object.entries(L.props).forEach(([k, v]) => el.style.setProperty(k, v));               // the look (after DERIVED: a shadow preset wins)
    if (el.dataset) Object.keys(L.attrs).forEach((k) => { el.dataset[k] = ''; });
    if (c.id && el.dataset) el.dataset.theme = c.id;
    notify(el);
    return n;
  }
  function clear(el) {
    if (!el || !el.style) return;
    TOKENS.forEach((k) => el.style.removeProperty(`--${k}`));
    Object.keys(DERIVED).forEach((k) => el.style.removeProperty(`--${k}`));
    LOOK_PROPS.forEach((k) => el.style.removeProperty(k));
    if (el.dataset) { delete el.dataset.theme; ATTRS.forEach((k) => delete el.dataset[k]); }
    notify(el);
  }

  /* ---- THE ACTIVE DASHBOARD THEME — one authority for every place that draws the dashboard's widgets.
     setActive(theme, roots): the editor's applied (or live-previewed) dashboard theme, put on its roots (the dashboard frame, the popup
     and notification layers) AND on every registered SCOPE. scope(el): a preview host (the Add / configure Live preview, the item
     editors' preview, the Widget Studio canvas, the notification and popup previews) — it gets the active theme now and on every change,
     so a preview always looks like the dashboard it is for. A widget's own theme (config.theme) and its explicit colours still win
     inside it, exactly as on the dashboard.
     THEME READERS: the rare code that copies RESOLVED colours (the widget surface layer) marks its element data-theme-reads and gives it
     __iqThemeRefresh(); after a theme is put on / taken off a root, every such element inside it is asked to read again. Found in the DOM
     — no registry, so nothing keeps a removed widget alive. Custom properties themselves need nothing: CSS inheritance updates every
     element at once. Scopes are held weakly for the same reason. */
  let active = null;
  const scopes = new Set();                                  // WeakRef<HTMLElement>
  function notify(root) {
    if (!root || !root.querySelectorAll) return;
    const list = [...(root.matches && root.matches('[data-theme-reads]') ? [root] : []), ...root.querySelectorAll('[data-theme-reads]')];
    list.forEach((n) => { try { if (typeof n.__iqThemeRefresh === 'function') n.__iqThemeRefresh(); } catch (e) { /* a reader never breaks theming */ } });
  }
  const weak = typeof WeakRef === 'function';
  function prune() {
    const out = [];
    scopes.forEach((r) => { const n = weak ? r.deref() : r; if (!n) { scopes.delete(r); return; } if (n.isConnected) { n.__iqScopeSeen = true; out.push(n); } else if (n.__iqScopeSeen) scopes.delete(r); else out.push(n); });
    return out;
  }
  /** A THEME CHANGE IS ONE STEP: every element takes its new colours in the same frame. Widgets animate their OWN state changes
      (transition: background / colour / shadow); left running, a theme change would fade some parts through in-between colours while
      others snap (and a copy of resolved colours could capture an in-between value). For two frames the themed roots suspend
      transitions; their own animations (keyframes) are untouched. */
  let switching = [], switchRaf = 0;
  function suspendTransitions(nodes) {
    nodes.forEach((n) => { if (n && n.setAttribute) { n.setAttribute('data-theme-switching', ''); switching.push(n); } });
    if (typeof requestAnimationFrame !== 'function') return;
    cancelAnimationFrame(switchRaf);
    switchRaf = requestAnimationFrame(() => { switchRaf = requestAnimationFrame(() => { switching.forEach((n) => n.removeAttribute('data-theme-switching')); switching = []; }); });
  }
  let activeKey = 'null';
  function setActive(theme, roots = []) {
    const next = theme ? clean(theme) : null, key = JSON.stringify(next);
    const all = [...roots, ...prune()].filter(Boolean);
    if (key !== activeKey) suspendTransitions(all);        // only a real theme CHANGE (the editor re-applies on every render: no-op then)
    active = next; activeKey = key;
    all.forEach((n) => { clear(n); apply(n, active); });
  }
  function scope(el) {
    if (!el || !el.style) return el;
    if (el.setAttribute) el.setAttribute('data-theme-scope', '');
    scopes.add(weak ? new WeakRef(el) : el); clear(el); apply(el, active);
    return el;
  }
  const activeTheme = () => (active ? JSON.parse(JSON.stringify(active)) : null);

    /** a theme LIBRARY (app.themes): at most 20 themes, each { id, name, tokens } with a unique id */
  function checkLibrary(list, path = 'app.themes') {
    if (!Array.isArray(list)) return [`${path}: must be a list`];
    const errors = [], ids = new Set();
    if (list.length > 20) errors.push(`${path}: at most 20 themes`);
    list.slice(0, 20).forEach((t, i) => {
      errors.push(...check(t, `${path}[${i}]`));
      if (!isObj(t) || typeof t.id !== 'string') errors.push(`${path}[${i}].id: required`);
      else if (ids.has(t.id)) errors.push(`${path}[${i}].id: "${t.id}" is used twice`);
      else ids.add(t.id);
      if (isObj(t) && (typeof t.name !== 'string' || !t.name.trim())) errors.push(`${path}[${i}].name: required`);
    });
    return errors;
  }
  const BUILTINS = PRESETS;
  const API = { TOKENS, MAX_TOKENS, GROUPS, LABEL, USES, PRESETS, BUILTINS, DERIVED, FONTS, SHADOWS, LOOK, FITS, POSITIONS, BACKGROUND, check, checkLibrary, clean, resolve, apply, clear, setActive, scope, activeTheme, contrast, isColour: colour, isImage, isDark, rgba, lookProps };
  global.MaisonTheme = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
