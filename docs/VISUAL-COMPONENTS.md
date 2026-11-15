# Visual components — architecture inventory and boundaries

This records what the repository *actually* contains (inspected for the "Reusable visual components, dynamic Energy Flow, Sun Arc,
energy charts" work), which shared component owns each functional element, and the rules new work follows.

## Layers

```
Home Assistant ── components/ha (ha.js: one shared poll / subscribe · bindings.js: per-widget view + secure actions · api/ha_*.php)
      │  normalised view data (numbers with HA's own unit, availability) — never a service name in a widget
      ▼
Shared components (components/…) — pure renderers: config + view → element; report intent through callbacks; know no entity
      ▼
Widgets (widgets/default/<type>, widgets/custom/<pkg>) — compose the shared components; registry (components/editor/registry.js)
      describes their configuration (fields, variants, normalize, constraints) for the shared editor (MaisonForm, components/editor/form.js)
      ▼
Containers / grid / popups / MaisonFit (components/fit: the ONE responsive engine — each widget arranges in its OWN box)
```

## Registry and discovery

| Piece | Where | Notes |
| --- | --- | --- |
| Widget types (built in) | `components/editor/registry.js` `TYPES` | label, group, size, fields, variants, normalize, validate, create, constraints |
| Custom widgets | `widgets/custom/<pkg>/widget.json` + `server/WidgetPackages.php` | roles contract v2; Room / Scene is one |
| Shared component registry | `components/foundation/components.js` (`IniqComponents`) | `define`, `editor`, `composable()` — Widget Studio's toolbox reads it |
| Studio elements | `components/elements/elements.js` (`IniqElements`) | shapes, lines, information, controls, **Flow connector** |

## Shared functional elements (one implementation, many uses)

| Element | Implementation | Used by |
| --- | --- | --- |
| Control button (power, −, +, actions) | `IniqControls.button` | Light (power), Climate (power / − / +), Studio Button |
| Segmented control | `IniqControls.segmented` | Light options, Climate modes / fan / preset / swing, Studio |
| Stepper · Select | `IniqControls.stepper` / `.select` | Studio elements |
| Slider | `IniqSlider` (components/slider) | Light brightness / colour temperature, Studio Slider |
| Dial (thermostat) | `IniqDial` (components/dial) — no Climate dependency | Climate, Studio Dial |
| Gauge (one value on an arc) | `IniqGauge` (components/gauge) | Gauge widget, Studio arc gauge / progress ring |
| Value / text | `IniqText` (components/text) | Studio Value / Text, information |
| Information item / bar | `IniqInfo` (components/info) | Climate, Room / Scene, popups (hero information), many widgets |
| Rings, badges, layered animation | `IniqVisuals` (components/widget-visuals) | Energy (battery / EV level), Fan, Appliance, Light |
| **Flow connector** (new) | `IniqFlow` (components/flow) | Energy Flow (dynamic nodes), Studio "Flow connector" element |
| **Sun arc** (new) | `IniqSunArc` (components/sunarc) | Sun & Moon (arc presentation), any host |
| Expandable list | `IniqExpand` (components/expandlist) | Weather forecast, lists |

Element metadata for a future Studio: every composable component declares `compose` — defaults, preview data, box / minimum box,
Properties (`fields`), what data a binding may feed (`inputs`), what it reports (`actions`), resize / scale behaviour and an `update`
(view) path. Serialization = its configuration object (JSON-safe, sanitised by the editor and the server); restoration = `render` with
it. Lifecycle: an element that observes or animates exposes `destroy()` (IniqFlow) or is released with its element (MaisonFit sweep).

Shape, background, content and interaction stay separate: a component draws *content* in a box; the box's *shape* (Studio `shape`
element / card corners) and its *background* (panel / card) are other elements; *interaction* is the component's own control (a
button) or the host's. Nothing assumes a rectangle beyond the layout box itself.

## Live previews inside configuration dialogs

- The configure dialog draws its Live preview with the widget's **real renderer** (`drawWidget` in `components/editor/configure.js`).
- Every collection **item editor** (a modal over the configuration — Climate dial / power / modes, Light controls, information items,
  popup hero information…) draws that same preview *itself*, with the UNSAVED item, on every change; the edited element is outlined.
  Cancel shows the saved configuration again; Save commits; the stage is `inert` (no gesture reaches the widget) and no Home Assistant
  service is ever called (`tests/component-previews.mjs`).
- **New:** *Whole widget | This element* — the same drawing zoomed onto the edited element (`previewFocus`), so a dial or a button is
  seen at a readable size while it is edited. Generic: every collection with `previewFocus` gets it.

## Known duplicates (documented, not migrated)

Several widgets still create their own `<button>`s (Media transport, Cover, Lock, Alarm keys, Room / Scene scene buttons, …). Each has
an approved, pixel-tested look; moving them onto `IniqControls.button` would change those designs, so they are left as they are and
listed here for a careful, per-widget migration later. New work never adds another implementation of an existing element.

## Responsive

MaisonFit (`components/fit`) is the only responsive engine: a widget arranges itself from its own box (`arrange(w, h)`), never from
the viewport or the preview scale. New components take their size from their host's box (IniqFlow: the host svg's px space; the sun
arc: its own box via MaisonFit).
