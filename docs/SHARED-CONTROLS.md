# Shared controls — audit, public interface and migration plan

Rule: **the same function uses the same underlying component.** Visual presets differ by configuration, never by a copy of the code.
Home Assistant semantics (what a press does, which service) stay in the host binding (`components/ha`), never in a control.

## Public interface for every widget (built-in and custom)

`window.IniqDashUI` (`components/foundation/public.js`, **version 1**, frozen) exposes the very modules the built-in widgets use:
`controls` (IniqControls), `info` (IniqInfo), `text` (IniqText), `slider` (IniqSlider), `dial` (IniqDial), `gauge` (IniqGauge),
`visuals` (IniqVisuals), `icons` (IniqIcons), `flow` (IniqFlow), `sunArc` (IniqSunArc), `components` (IniqComponents) and `has(name)`.
A custom widget package uses these instead of building its own control or reaching for an internal global. The version is bumped only
when a listed module changes incompatibly. Room / Scene (`widgets/custom/room-scene`) now reaches the shared information item and icons
through it (with a fallback to the module names on an older IniqDash) — its drop-in architecture is unchanged; core still names no
custom widget.

## Audit (what each function uses today)

| Function | Shared component | Light | Climate | Room / Scene | Popups | Studio |
| --- | --- | --- | --- | --- | --- | --- |
| Power / toggle | `IniqControls.button` (role switch) | yes | yes | — | via widgets | Button / Toggle |
| Momentary / ± / action | `IniqControls.button` (role action) | — | yes (− / +) | **own scene buttons** | via widgets | Button |
| Segmented choice | `IniqControls.segmented` | options | modes / fan / preset / swing | — | via widgets | Segmented |
| Dropdown · stepper | `IniqControls.select` / `.stepper` | — | (select mode) | — | — | Select / Stepper |
| Slider | `IniqSlider` | brightness / temperature | — | — | via widgets | Slider |
| Dial | `IniqDial` (no Climate dependency) | — | the thermostat | — | via widgets | Dial |
| Value / information | `IniqInfo`, `IniqText` | information | information / bar | **information strip (shared, own skin)** | hero information | Value / Information |
| Gauge | `IniqGauge` | — | — | — | — | Arc gauge / Progress ring |

Popups contain ordinary widgets; their own hero information is the shared information item (`tests/popup-hero-info.mjs`). There is no
popup-specific control system.

## Known duplicates (not migrated — deliberately)

These still create their own `<button>` markup with an approved, pixel-tested look: Room / Scene scene buttons, Media transport,
Cover, Lock, Alarm keypad, Timer, Robot, Number & Select, Action, Radial menu, Calendar. Moving them onto `IniqControls.button` changes
their pixels, which the release rules forbid without a design decision. Plan, one widget at a time:

1. Add a *skin* option to `IniqControls.button` (the widget's own class names and CSS hooks on the shared element and behaviour) — the
   pattern `IniqInfo.render(item, SKIN)` already uses for the Room's information strip.
2. Move the widget onto it behind its existing visual tests (`*-reference.mjs`, `visual.mjs`); the pixels must stay identical.
3. Remove the widget's own button code.

Order proposed: Room scenes (closest to the button's options: style, shape, colour, sizes), Cover, Lock, Media, then the rest.

## Live element previews

Every collection item editor shows *Whole widget | This element* — the widget's **real renderer** with the unsaved values, inert (no Home
Assistant action), zoomed onto the edited element. Verified for the Climate dial and the Light power button (`tests/component-previews.mjs`).

## Element metadata for a future Studio flow

`IniqComponents.catalog()` returns, for every composable component, JSON-safe metadata for *Add Element → Select Element → Properties*:
identity and category, its Properties (keys, types, labels, groups, options), default configuration, preview data, the data a binding may
feed (`inputs`), what it reports (`actions`), its first and minimum box, how it resizes and what scales. The renderer stays
`IniqComponents.get(id).compose`. (`tests/shared-controls.mjs`.)
