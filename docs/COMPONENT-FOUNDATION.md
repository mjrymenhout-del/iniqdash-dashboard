# IniqDash component foundation

The shared **visual components** that IniqDash's own widgets are built from: Room, Light, Climate and the Popup.
They are the foundation a future **Widget Studio** will build widgets from. Nothing in this document is Studio itself: there is no
palette, canvas or property panel yet. The registry below only makes the components discoverable.

Home Assistant stays the brain. These components present data and report what the user did. What a press means is decided by the
widget, and Home Assistant performs it through the existing secure channel.

## Three concerns, kept apart

| Concern | Owner | Example (Light Power) |
|---|---|---|
| **Data / state** | the widget and its binding (`components/ha`) | the light is `on` (Home Assistant's confirmed state) |
| **Action / behaviour** | the widget (an `onPress` / `onSelect` callback → `onChange` → the secure HA call) | toggle this light |
| **Presentation** | the shared component | a 60 px circular filled button, orange, `mdi:power` |

A shared renderer receives normalised values, a look and callbacks. It never queries Home Assistant, never names an entity or a
domain, and never knows which widget it is in (`tests/component-foundation.mjs` checks the code for that).

## The registry — `components/foundation/components.js`

`IniqComponents.define(id, { name, category, render, contract, capabilities, state, module })` — each shared module describes itself.
`IniqComponents.editor(id, builder)` — the editor registers the component's configuration builder. Use `get(id)`, `list(category)` and
`ids()` to look components up. Categories: content · controls · data · visual · layout.

| id | Name | Category | Runtime | Configuration builder |
|---|---|---|---|---|
| `icon` | Icon | visual | `IniqIcons.present(el, IconConfig, { run })` | Information's icon fields |
| `information` | Information | data | `IniqInfo.render(item, skin)` + `IniqInfo.follow(el, item)` | `infoItemFields(keys, { over })` |
| `information-bar` | Information bar | layout | `IniqInfo.bar()` | the bar fields |
| `button` | Action button | controls | `IniqControls.button({ role: 'action' })` | `CONTROL.button(caps)` |
| `toggle` | Toggle | controls | `IniqControls.button({ role: 'switch' })` | `CONTROL.button(caps)` |
| `segmented` | Segmented control | controls | `IniqControls.segmented()` | `CONTROL.segmented()` · `CONTROL.option()` |
| `regions` | Structured placement | layout | `IniqControls.regions()` + `IniqControls.nudge()` | `CONTROL.placement()` + `CONTROL.offset()` |
| `surface` | Widget surface | visual | `IniqWidgetKit.surface(root, config)` | `F.widgetSurface()` |
| `tabs` | Tabbed container | layout | `MaisonTabs.create()` | the Tabbed Container's own section |
| `image` | Image | visual | `IniqArtwork.render()` | the shared artwork picker (the host's image library) |
| `dial` | Dial | controls | `IniqDial.create({ design, onInput, onCommit, onDrag })` → `el.dial.update(view, look)` (Climate's thermostat dial); composed (Widget Studio): the gauge primitive `IniqGauge.create(config, data, box)` | `dialFields(caps)` (Climate); Studio: `IniqGauge.fields()` |
| `text` | Value / Text | data | `IniqText.create(config, data, box)` — static text or one formatted value | `IniqText.fields()` |
| `slider` | Slider | controls | `IniqSlider.create({ skin, label, onInput, onCommit })` → `el.slider.update(view)` | `sliderFields(caps)` |

A definition may add `compose`: how a HOST places it standalone (its default configuration, preview data, editor capabilities, first and
minimum box, `render(config, data, ctx)`). Button, Dial, Information, Value / Text, Icon, Segmented control, Slider and Image have it — Widget Studio's palette is
`IniqComponents.composable()` (docs/WIDGET-STUDIO-POC.md).

Every `render` works without a widget parent: configuration in, element out.

## Namespaces (CSS)

- **Every package owns its class names.** A package is `widgets/default/<id>`, `widgets/custom/<id>` or `components/<id>`.
  - It owns a class **block** (the class without `__element` / `--modifier`) when its own JavaScript creates elements with it.
  - Choose a short, unused root for a new package (for example `.stw` for the Studio widget, `.wst` for the Studio host), and prefix every class with it.
- **A widget's stylesheet** styles only its own blocks, or a shared component's (`components/…`, for example a Climate rule on `.iqc-btn`, scoped by the widget's own root where it should not leak). It never styles another widget's.
- **State classes** (`is-…`, `has-…`) are not namespaces.
- **No generic names:** a shared component never uses a bare `.dial`, `.slider`, `.ring`, `.track`, `.knob` or `.thumb`. The Dial is `.iqdl`, the Slider `.iqsl`; the test checks both.
- `tests/css-namespace.mjs` enforces this. It exists because the Studio widget once used `.sw`, the Sensor widget's block, and its card background leaked onto every Sensor.

## The compose contract (composable components)

A component definition says whether it is **composable**, meaning a host such as Widget Studio can place it on its own. It is
composable when its definition has `compose`; components without it are not composable (today: toggle, structured placement,
information bar, surface, tabs).

| Key | Meaning |
|---|---|
| `defaults` | Its first configuration. |
| `data` / `dataFields` | Its preview **view** (mock data through its normal view contract), and the editor fields for it (keys `data.…`). |
| `box` / `min` | Its first and smallest box (logical px). |
| `editor` | The capabilities passed to its shared editor builder (`IniqComponents.editor(id)`). |
| `render(config, data, { onAction, box })` | A fresh element (`box`: its `{ w, h }`). |
| `update(el, config, data, ctx)` | **The view path:** brings the same element up to date and returns `true`. Absent or `false`: the host renders a fresh element **for that component alone** (never the whole widget). |
| `resize` | `{ mode: 'center' \| 'fill' \| 'layout', aspect, toBox }`: how it lays out in its box (a normal resize). |
| `scale` | `{ props: { key: [min, max] }, base(config) }` or `null`: what scales in proportion (Shift + resize). |

Not every helper has to be composable; only what a host should place on its own.

## The Home Assistant binding boundary

```
Home Assistant → the widget / domain binding (components/ha, a widget's own) → a normalised VIEW → the shared visual component
component interaction → a normalised ACTION / event (onPress, onSelect, onAction) → the owning widget / binding → Home Assistant
```

- **Components read no entity.** A generic visual component never fetches or subscribes to an entity, and never names a domain.
  - The one shared binding helper is separate from the renderer: `IniqInfo.follow` (render ≠ follow).
- **Widget Studio:** a composed component is bound by **`IniqBinding`** (`components/ha/binding.js`), never by itself:
  - The component **declares** in its compose block what view data it can consume (`inputs`) and what it reports (`actions`).
    It never names an entity or a domain.
  - The **component** maps to one of its widget's **entity slots**: `{ source: 'ha', slot, inputs: { <data key>: { read, attribute?, unit?, unitText? } }, action: { action } }`;
    each **dashboard copy** assigns the slot's entity (`config.entities`), and the runtime resolves the binding onto it. A widget has no
    domain; one widget can mix any (docs/WIDGET-STUDIO-POC.md, "Definition vs dashboard instance").
  - The binding reads through the shared layer (`IniqHA.subscribe`; raw attributes through `IniqHA.inspect`, re-read when HA reports the
    entity changed). It hands the component **the same view data as its preview data**, through `compose.update`.
  - An interaction (`ctx.onAction(event, value)`) becomes one **normalised** action (`IniqHA.call(entity, action, value)` →
    `api/ha_call.php` → `HaService::plan`, which checks it against the entity's real capabilities). The browser never names a service.
  - Details: docs/WIDGET-STUDIO-POC.md, "Home Assistant binding".

### Binding declarations (compose `inputs` / `actions`)

| Component | `inputs` (data key: kind) | `actions` (event: kind) |
|---|---|---|
| Information | `value`: text (primary, with unit handling) · `active`: boolean | — |
| Action button | `on`: boolean (primary) | `press`: press |
| Segmented control | `selected`: option (primary; matched to an option's value, id or label) | `select`: option (the option's value, else its id) |
| Dial (composed: the gauge primitive) | `value`: number (primary — the ONE value its arc and marker show; its range is configuration, `compose.range: ['min', 'max']`) | — (a display) |
| Value / Text | `value`: scalar (primary — a number or text as reported; Value mode only, `compose.bindWhen`) | — |
| Slider | `value`: number (primary) · `min` · `max` · `step`: number | `change`: number (the released value) |
| Icon · Image | — (static visual components need no binding) | — |

Kinds: `text` · `number` · `boolean` · `option` · `scalar` (a number when numeric, else the text) for inputs; `press` · `number` · `option` for actions. Flags (how a person binds it —
still no domain): `primary` (the input the ONE entity feeds), `extra: '<label>'` (an optional extra from the **same** entity: a Dial's
*Show target*, *State appearance*), `range: true` (the component's own range values, prefilled from the entity — never a binding),
`bindOnly: true` (its preview value is dropped once bound: a Dial bound to a sensor shows no invented target), and on an action
`control: true` (the value it shows IS what it sets: a Slider, a Segmented control — the Properties offer one *Control*).

## Contracts (composable, never one universal config)

- **IconConfig**: `icon` (`mdi:…`) · `color` (token or `#rrggbb`) · `background` (`none` · `subtle` · `accent`) · `animation` (`none`, `rotate`, `pulse`, `breathe`, `shake`, `bounce`, `swing`, `flash`).
  - `animateWhen` (`active` · `always`) is read by the **owner**, which passes `run`.
  - The size belongs to the layout context, set through its own custom property. A background is padding around the glyph and never shrinks it.
- **InformationConfig**:
  - Source: `entity`, `value`.
  - Content: `label`, `showLabel`, `icon` + IconConfig (`color`, `iconBg`, `animation`, `animateWhen`).
  - Presentation: `valueSize`, `labelSize`, `iconSize` (px) · `style` · `align` · `iconPos` · `labelPos` · `valueColor`.
  - Layout keys belong to the context, not to Information: `slot` / `vslot` (Climate, Popup), `inDial` / `dialSlot` (the Digital ring), and Climate's Bar settings.
- **ActionButtonConfig**: `icon`, `size`, `iconSize`, `style`, `shape`, `color`, `iconColor`, `stateLook`, `finish`, and an **optional visible label**: `showLabel: true` (opt-in; absent = icon only, as every existing button), `label` (its text, also its accessible name), `labelSize`, `labelGap`. State: `{ on, disabled, label }`. The behaviour is the owner's `onPress`.
- **SegmentedControlConfig** also takes an opt-in `textSize` (absent: in proportion to its height, as before).
- **SegmentedControlConfig**: `options[{ id, icon, label, showLabel, color }]`, `height`, `iconSize`, `gap`, `padX`, `style`, `shape`, `inactive`, `color`. State: `{ selected, disabled }`. The owner's `onSelect(id)` decides what an option does.
- **PlacementConfig**: `place` (one of the 3 × 3 regions, or a line `line:top`, `line:center`, `line:bottom`, `line:edge-top`, `line:edge-bottom`) · `ox` / `oy` (logical px, kept inside the card).
  - Placement is a wrapper around a component, never inside one: Information, Button and Icon have no position logic.
  - Component placement is not dashboard (grid) placement.
- **SurfaceConfig**: `widgetBg`, `widgetBgOpacity`, `hover`, `hoverOpacity`, `hoverColor`, `hoverGlow`, `hoverLift`, `hoverMs`.

## Information: content vs layout context

`IniqInfo.render(item, skin)` draws one item from a **view** `{ value, label, state, run }`.

The **skin** is the layout context's own element and class names, plus its decoration (sizes, style, colour). The structure, the label
rules (no label → no label element, no space) and the icon presentation are shared. CSS stays with the context.

| Context | Skin | Layout (owned by the context) | Values from |
|---|---|---|---|
| Climate | the default (`.iqf`) | individual 3 × 3 places, the Information Bar, inside the Digital ring | `IniqInfo.follow` |
| Popup hero | `FACT_SKIN` (`.mpop__fact`) | the hero's 3 × 3 cells | `IniqInfo.follow` |
| Room | `LINE_SKIN` (`li.iq-room__stat`) | the ordered strip; its size shows the first lines | the Room's host binding (`haState`) |

`IniqInfo.follow(el, item)` is the **binding**: it reads the shared HA layer (`IniqHA.slots.item` / `subscribe`, the same poll the
widgets use) and calls `el.info.update(view)`. A context that already receives values (Room) calls `update` itself, so no extra
subscriptions are added. `IniqInfo.fact(item)` = render + follow.

## Dial — `components/dial` (`.iqdl`)

One renderer for five designs: Spectrum ring, Minimal ring, State arc, Full dial and Digital ring (plus `bare`, a readout without a ring,
which Climate's Compact and Minimal variants use). It shows a value on a circular scale and lets the user set a value on the ring. **It
knows no domain:** no entity, no thermostat, no temperature, no Home Assistant.

This is the built-in **Climate** widget's thermostat dial. Widget Studio's composed *Dial* is a different, simpler primitive — the
**gauge** (`components/gauge`, `.iqg`): one value on a circular scale, no text, every look a preset of the same properties
(docs/WIDGET-STUDIO-POC.md, "Dial (the gauge primitive)").

```js
const el = IniqDial.create({ design, onInput(value, source), onCommit(value, source, from), onDrag(active, from) });
el.dial.update(view, look);   // or el.dial.view(view) · el.dial.look(look) · el.dial.slots · el.dial.knob
```

- **View (what is true, from the owner):** `min`, `max`, `step`, `decimals`, `unit`, `scaleUnit`, `value` (the big number), `valueText`
  (text instead of it, for example a range), `off`, `setpoint` (the value the ring sets and marks), `current` (a second marked value),
  `range`, `tone` (`warm` · `cool` · `idle`), `action`, `label`, `secondary` (`{ text, value }`), `icon` (the Full dial's emblem),
  `interactive` (a boolean, or a function asked when a gesture starts), `name` (the handle's accessible name), `aria` (its value text).
- **Look (configuration):** `ticks`, `minmax`, `ring`, `arc`, `density`, `face`, `marker`, `thickness`, `surface`, `depth`, `activeArc`,
  `ringColor`, `warmColor` / `coolColor` / `idleColor`, `valueSize`, `labelSize`, `showCurrent`, `showAction`, `showLabel`.
- **Actions:**
  - Dragging along the ring (mouse or pen anywhere on it; touch only from the handle) reports `onInput` while it moves, then one
    `onCommit(value, 'dial-end', from)`.
  - The handle's keys (arrows, Page Up / Down, Home / End) report `onCommit(value, 'keyboard')`.
  - The owner decides what the value means and whether it becomes true. The dial then shows whatever the next view says.
- **Accessibility:** the handle is `role="slider"`, focusable, with an accessible name, `aria-valuemin` / `max` / `now` and a value text.
- **Content slots (Digital ring):** `el.dial.slots` are `top`, `upper-left`, `upper-right`, `lower-left`, `lower-right` and `bottom`.
  The owner fills them; Climate puts its Information items there, ranked, and the dial's size shows the first ones.
- **Colours:** its own tokens `--iqdl-warm` / `--iqdl-cool` / `--iqdl-idle` and the tone from the view. Climate maps its heat / cool /
  idle colours onto them (`.cw .iqdl[data-design]`), so the climate tone and its configured colours are unchanged.
- **Climate as the owner:** Climate normalises its state into the view (target → `setpoint`, room → `current`, HVAC action → `action`
  and `tone`) and decides what a new setpoint means (a local preview while dragging, `onChange` → Home Assistant at the end). It still
  places the dial in its anchored layer (size, 3 × 3 place, offset).

## Slider — `components/slider` (`.iqsl`)

A native range input with a numeric contract, so its keyboard, focus and accessibility are the browser's. **It knows no domain:** no
light, brightness or kelvin.

```js
const el = IniqSlider.create({ skin, label, onInput(value), onCommit(value) });
el.slider.update({ value, min, max, step, valueText, disabled });
```

- `onInput` is reported while it moves, and `onCommit` on release (or a key).
- A focused thumb that already shows the value is never moved under the user.
- `--v` (0…1) says where the value sits, for a skin that fills its track.
- **Skins:** `skin` is the class the input carries. The default `iqsl__range` is the component's own look (`--iqsl-h` track, `--iqsl-thumb`
  handle, `--iqsl-fill` colour). Light passes its own skins (`lw__range` for the brightness bar, `iq-light-ct__range` for the warm → cool
  strip), so its look is unchanged.
- **Light as the owner:** brightness is `{ value: brightness, min: 1, max: 100, step: 1, valueText: 'N%' }`. Colour temperature is
  `{ value: kelvin, min / max: the light's range, step: 50, valueText: 'N K' }`. Light turns a value into `{ brightness }` or
  `{ colorTempK }` and its Home Assistant request.

## Shared editors (capability-driven)

The configuration UI is shared too: one definition per property, and the owner says which properties it exposes and their defaults.

- `infoItemFields(keys, { sources, over, custom })`:
  - Room exposes Content · Presentation (sizes) · Icon.
  - The Popup hero and Climate expose everything, plus their 3 × 3 position (and Climate the Digital ring keys).
- `CONTROL.button({ fields, styles, exclude, shapes, over, … })`:
  - Light and Climate expose style · shape · size · colour · state look · icon.
  - A Room scene exposes icon · show label · style (with Theme) · shape · colours · sizes, and no state look (a scene is never "on").
- `CONTROL.placement()` + `CONTROL.offset({ keys, props, range })`:
  - Climate's control offsets (±120 px) and its Information Bar offset (±40 px).
- `CONTROL.segmented()` / `CONTROL.option()`, and `F.widgetSurface()`.
- `dialFields({ k, when, groups, fields, words })` = `IniqComponents.editor('dial')`:
  - Climate's dial section uses `k: 'dial.'` and adds its own `size` (it sizes the dial in its layout) and `primary` (target or room).
    It also passes its words: Target, Room temperature, and its heat / cool / idle colour keys.
  - Widget Studio gets the same definitions without those two (a composed dial is its box).
- `sliderFields({ k, when, group, label, words })` = `IniqComponents.editor('slider')`:
  - Light's brightness look uses `k: 'dim.'` (track thickness, handle size, accent colour).
  - Widget Studio uses the same fields plus the slider's accessible name.

Continuous quantities use the shared Slider + Number (`type: 'range'`, px / % / ms). Previews stay live: the form applies every change
to the preview immediately, whichever builder made the field.

### Component previews in item editors

An element of a standard widget (a Climate control, a Light control, an information item) is edited in an **item editor** — a modal
over the configuration that hides the configuration's Live preview. The item editor therefore draws that **same preview itself**, from
the **unsaved** values, on every change (components/editor/form.js):

- **One drawing, the host's:** `MaisonForm.create({ …, previewer })` — `previewer(configuration, width, maxHeight) → { el, height }` is
  the host's own drawing of a whole configuration. The configure dialog passes `widgetView` (components/editor/configure.js) — the SAME
  function its Live preview uses: the registry's renderer (`reg.instantiate(type, reg.previewSafe(type, config))`) at the preview's
  logical size (the chosen *Preview size*), scaled down only for display. The Popup settings pass the popup panel's drawing
  (`popupSettingsPreview(…).view`, editor.js). No element-only or second visual implementation: every property the card reads — dial
  design, size, colours, labels, the card's own colour variables and arrangement — shows in the modal exactly as on the card.
- **The edited element outlined:** a collection field may declare `previewFocus(item) → selector`; the item editor outlines that element
  in the drawing (`[data-k=item-preview-focus]`) — Climate controls (`.iqdl`, `[data-k=power|mode|minus|plus…]`), Light controls
  (`.lw__power`, `.lw__dim`, `.iq-light-ct`, `.iq-light-sw`), information items (`[data-fact=id]`).
- **Unsaved values only, nothing stored:** the drawing is of the configuration with the edited item in place (a copy); the stage is
  `inert` (no press, no service call). Cancel discards (the configuration's preview behind returns to the saved item); Save + Apply
  persists. Without a host `previewer` a field may still declare `preview(item, configuration, context) → Element`.
- **Lifecycle and size:** the previous drawing is disposed (`dispose()` / `stop()`) when replaced and when the editor closes; the stage
  is at most 330 px tall and redraws when its width changes. What the widget itself hides at that size (e.g. a Compact Climate card
  hides min / max and information) is hidden in the modal too — exactly as in the Live preview.

Verified through the real UI (tests/component-previews.mjs, fake Home Assistant): 23 dial appearance changes one by one — each changes
the modal's drawing and pixels and equals the configuration's own drawing — Cancel / Save + Apply, Climate power / HVAC mode /
information, Light power, Popup hero information; no service call.

## How a widget consumes a component

```js
// Climate's Power: the DOMAIN decides state and action; the shared button presents it
const power = IniqControls.button({ role: 'switch', label: `${name} power`, onPress: () => set({ hvacMode: on ? 'off' : lastOn }) });
power.control.update(look('power'), { on: confirmedOn(), label: `${name} power` });

// Room's Information line: the shared renderer in Room's skin, the value from the Room's own binding
const li = IniqInfo.render(item, LINE_SKIN);
li.info.update({ value, label, state, run });
```

## Inventory

- **Shared control button, one compose contract:** the Action button and the **Toggle** (the switch-role button — Light's and Climate's
  Power) are both composable from one builder (`composeButton` in components/controls) — Widget Studio places either.
- **Already shared** (before this foundation):
  - the control button (Light and Climate Power, − / +, Light toggles)
  - the segmented control (Light, Climate)
  - the structured regions (Climate)
  - the Information item (Climate)
  - the Information bar
  - the MDI icons, picker and animations
  - the widget surface
  - the Tabbed Container
  - the artwork picker, with its per-widget-type image libraries (Room, Light and Climate keep their own library content; only the picker, storage and serving are shared)
  - interactions and visibility
- **Duplicated and equivalent — now consolidated**:
  - three Information renderers (Room's lines, the Popup hero's facts, `IniqInfo.fact`) → one `IniqInfo.render`
  - icon glyph / colour / background / animation code → `IniqIcons.present`
  - two Information editors → `infoItemFields`
  - Room's scene appearance fields → `CONTROL.button`
  - Climate's two offset implementations (controls, bar) → `IniqControls.nudge` and `CONTROL.offset`
- **Similar but different — deliberately kept separate**:
  - **Room's scene tiles**: a tile with a label under its icon, the `+N` tile and the scene panel, shaped by the Room's scene styles per size. They read the same ActionButtonConfig from the same editor, but keep the Room's renderer and CSS: moving them onto `.iqc-btn` would change the Room's look.
  - **Popup header buttons** (Back / Menu / Close): chrome buttons with their own style set (`subtle`, a tone) and the defaults of older popups.
- **Extracted from the reference widgets**:
  - Climate's dial and its five designs → the **Dial** (`IniqDial`). Climate keeps the target model, the HVAC mode and action, and what a new target means.
  - Light's brightness and colour-temperature sliders → the **Slider** (`IniqSlider`) in Light's own skins. They are different from the configurator's Slider + Number (an editor control).
- **Widget-specific**:
  - The Room's variants, capacities and light-reactive artwork.
  - Light's variants and its brightness / colour model.
  - The Popup host (opening, modal rules, header).

## Limitations relevant to Widget Studio

- **Dial and Slider in Studio:** in the Studio canvas a pointer selects, moves and resizes; the preview value is set in Properties
  (`data.value`). Studio's Dial is the gauge primitive (components/gauge — one value, no text, a display); at runtime the Slider changes
  its preview value at once and reports `onAction('change', value)` (`iq-studio-action`), or — bound — its normalised action
  (docs/WIDGET-STUDIO-POC.md, "Home Assistant binding").
- Room's scene tiles and the Popup's header buttons share the configuration, not the renderer (see above).
- The registry describes and builds components. Composing a whole widget from them (a template, a blank widget) is Studio's work and is not built.

In Widget Studio a placed control does not bind to an entity directly: it references one of the widget's named **properties**, which
come from **source groups** (docs/WIDGET-STUDIO-POC.md, "Home Assistant: widget properties and source groups"); the declarations above
decide which properties a control is offered (a number for a Dial, a settable option for a Segmented control, a pressable family for a
Button).
