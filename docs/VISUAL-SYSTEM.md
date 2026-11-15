# IniqDash visual system — first pass

The default **IniqDash Dark** theme. It is a presentation layer: widgets, MaisonFit, the editor architecture and every Home Assistant behaviour are unchanged.
**This is the coherent first-pass implementation, not the final design.** Pixel-level tuning is a separate second pass (list at the end).

## Where it lives

| What | File |
|---|---|
| All colour, radius, spacing, type and motion tokens (the default theme) | `assets/css/tokens.css` |
| Which tokens a *theme* may override (client and server validation) | `components/theme/theme.js`, `server/Dashboards.php` — the Theme Studio: docs/THEME-STUDIO.md |
| Font (Manrope, SIL OFL 1.1, variable weight, latin + latin-ext) | `assets/fonts/` (licence: `Manrope-OFL.txt`) |
| Widget Library showcase (visual QA, mock data only) | `assets/js/dashboards/showcase.js` → `editor.html?dashboard=showcase` |
| Structural visual regression test | `tests/visual.mjs` |

New CSS should read the semantic names (`--iq-bg-app`, `--iq-surface`, `--iq-text`, `--iq-accent`, `--iq-state-ok` …) or the base tokens they alias. A future theme only redefines base tokens.

## Tokens

- **Surfaces** (app → navigation → card → elevated → interactive → active): `--page-bg` #0b0b0d · `--nav-bg` #0e0e10 · `--surface-primary` #17171a (card) · `--surface-tertiary` #242428 (icon wells, chips) · `--surface-interactive` #2b2b30 · `--surface-active` = accent tint.
- **Text:** soft white `--text-primary` #f1f1f3 (15.9:1 on a card) · `--text-secondary` #a9aab3 (7.7:1) · `--text-muted` #878891 (5.1:1). `tests/visual.mjs` enforces WCAG AA on every pairing used.
- **Accent:** one warm orange `--accent` #ff7a1a (+ `--accent-hot`, `--accent-on`, `--accent-soft`, `--accent-line`): active primary controls, selected navigation, heating, identity. Not used as decoration.
- **Functional colours** (meaning only): success green (healthy, home, battery) · warning/solar yellow · danger red (alarm, critical, destructive) · info blue (water, selected information) · cool cyan (cooling) · purple (media, timer, EV, secondary) · neutral grey (idle, unavailable).
- **Radius:** xs 8 · sm 10 · md 12 (buttons, inputs) · lg 16 · xl 22 (dialogs) · widget 14 · device 16 · container 20 · pill. Circles stay circles where they mean something (power buttons, avatars).
- **Type:** Manrope with a system fallback; roles as weights (`--iq-fw-display/title/subtitle/control/status/caption`), sizes in the existing scale. No uppercase body text; the rare caption uses `--iq-ls-caps`.
- **Depth:** one restrained card shadow, a hairline edge highlight, no blur layers, no glow on every card.

## Conventions applied across the library

Cards use the surface tokens (the old hard-coded greys were replaced); status is never colour alone (text + icon + state word stay); controls: primary active = orange, inactive = elevated charcoal, danger red only for danger;
alarm: disarmed green · armed orange · triggered red; sensors tint the icon well by what is measured; Energy Flow: home orange, solar yellow, grid blue, battery green, EV purple; charts and gauges: orange primary series;
focus ring = accent, everywhere. The editor keeps its cool **blue** only for selection, resize handles, guides and drop targets, so editing chrome can never be mistaken for a widget; everything else active in the editor is orange.

## State-driven motion (and what is not animated)

All continuous motion goes through the shared `IniqVisuals` layers: stopped by `prefers-reduced-motion`, paused when off screen, CSS transform / opacity only, no JS loops.
Washing machine / dishwasher: drum rotates only in active phases (wash slow, rinse faster, spin fastest). Fan: blades follow the reported speed, off = still. Vacuum: side brush and a slight body sway while cleaning (slower while returning), still when docked / paused.
Mower: wheels turn and the body sways while mowing, still otherwise. Energy Flow: dots travel in the true direction, still at zero. Garage / gate / blind pictures follow the **actual position**. Timer and media progress follow real time / position.

## Imagery

No third-party artwork was added. Devices are drawn as inline SVG / CSS (robot, washer drum, fan, garage door, energy nodes) or use the repository's existing assets (light fixtures, media artwork, demo camera scene).
Placeholders to replace later: robot vacuum / mower drawings, person avatars (initial letter — no portrait photos), weather (gradient tint, no photography), room / scene imagery (there is no Room widget; it was not invented).

## For the owner's second-pass visual review

1. Every widget at micro / compact / normal / large on the **Sizes** page of the showcase — especially Appliance, Robot, Energy Flow, Climate and Media at micro.
2. Type scale: widget titles / values still use their old per-widget sizes; the new weight roles are defined but only partly applied (changing weights shifts text widths — re-run `tests/fit.mjs` after any change).
3. Light: orange slider fill vs. the amber lamp glow; Climate dial ticks and thumb; Person (no photos); Weather imagery; Camera overlay text over bright images.
4. Navigation: the dock is restyled, not redesigned — the reference's top pill bar with search / bell / profile is **not** built; header only has a brand mark.
5. Editor chrome: toolbar density, orange vs. blue balance, configuration dialog hierarchy (identity / mapping / variant / information / appearance / interaction).
6. Containers: card-in-card density on pages with nested secondary containers.
7. The login page uses the system font (it cannot load protected files) — decide whether to serve Manrope publicly.

## Pass 2 (fine-tuning) — what changed

Typography roles applied library-wide (weights from role tokens, 11px text floor, calmer caps tracking) · robot vacuum / mower artwork redrawn with depth and a size ladder · appliance long names wrap before they are cut (state and time never give way) ·
fan housing + blade highlights and a micro layout · person / lock / switch / cover / numsel / alarm micro arrangements · media artwork layout from 290px tall · camera doorbell bar wraps · sun & moon sky plot · chart bars slimmer with the current value emphasised · configuration dialog section titles de-emphasised from orange.
Still for the owner's eye: robot artwork taste, orange switch key strength, weather richness, Sizes page at real devices. The design is not final.

### Pass 2, second round — compositions, not reskins
Robot: stage composition (machine is the hero, state + battery under it) · Fan: wire grille over the blades and a pedestal · Cover: garage / gate / door drawn as architecture · Washer: brushed-metal cabinet, time left as the primary value ·
Weather: sky glow, stars at night, lit glyph · Person: lit monogram avatar · Climate: **cooling now uses the cool colour** (previously only heating was coloured) · Media: record-sleeve fallback without artwork · Entity List: domain glyphs.
Not redone: Light (reviewed, kept), Camera (overlay reviewed, doorbell bar only), Switch/Button/Action beyond the earlier calm key, Entity List row structure.
