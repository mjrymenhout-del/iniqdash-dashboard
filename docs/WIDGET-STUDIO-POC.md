# Widget Studio — proof of concept

**Question:** can the shared component foundation (docs/COMPONENT-FOUNDATION.md) construct a widget dynamically, rather than only
support hand-coded widgets?

**Answer:** yes. Studio V2 works like a **VB6 form designer**: independent CONTROLS (each with a stable id and a unique Name) on a
canvas, a type-specific PROPERTY SHEET for the selected control, and named **WIDGET PROPERTIES** ("Room Temperature") the controls
reference — grouped in **SOURCE GROUPS** ("Climate": one Home Assistant entity a placed copy chooses). The widgets it makes are reusable
definitions, organised in collections and added from the normal gallery. This POC proves it and nothing more. Studio is not a product yet; see
*Not built* below.

## Pieces and responsibilities

| Piece | File | Responsibility |
|---|---|---|
| Component registry | `components/foundation/components.js` | What each component is. `compose` (optional) says how a host places it standalone: its default configuration, preview data, editor capabilities, first and minimum box, and `render(config, data, ctx)`. |
| Components | `components/controls`, `components/info`, `components/icons`, `components/artwork`, `components/dial`, `components/slider` | Draw themselves. They are the same renderers Room, Light, Climate and Popup use: the Dial is Climate's, the Slider Light's (the Image renderer is new). |
| Editors | `components/editor/registry.js` → `IniqComponents.editor(id)` | Each component's shared, capability-driven configuration fields. |
| **Studio (host)** | `components/studio/studio.js` | Palette, canvas, selection, box, Properties, save. Contains no code specific to any component. |
| **Studio widget (runtime)** | `widgets/default/studio/` (type `studio`) | Reconstructs a widget from its component model through the registry; attaches each component's binding. |
| **Definitions + collections** | `components/studio/library.js`, `server/StudioWidgets.php`, `api/studio_widgets.php` | The reusable definitions and the user's collections, stored server-side, on every page as data (`gate.php`). |
| **Home Assistant binding** | `components/ha/binding.js` (`IniqBinding`) | The HA families / values catalog; widget properties and source groups; a control's property reference expanded to the slot binding the runtime resolves; HA reads → view data; events → normalised actions; migration of older models. |
| Editor integration | `components/editor/editor.js`, `configure.js` | The *Widget Studio* entry (edit mode); definitions in Add to dashboard; adopting an older Studio item. |

Adding a component to Studio means registering it with `compose` and its editor builder. It then appears in the palette, Studio can
instantiate it, its shared editor drives Properties, and its shared renderer draws it. No Studio code changes.

## The model (what is saved): a reusable DEFINITION

A Studio widget is a **reusable definition**, saved server-side (`<private>/studio-widgets/<id>.json`), never a dashboard item and
never HTML:

```js
{ id: 'w3f9c0d7a1b2e4f60',                          // the server's: random, stable — renaming never changes it
  revision: 3,                                       // +1 per save (a stale save is refused: "conflict")
  definition: {
    meta: { name: 'Studio Climate Test', collection: 'c4e1f0a9b2c3d', category: 'climate', description: '…', icon: 'mdi:radiator' },   // LIBRARY metadata
    canvas: { w: 360, h: 240 },
    slots: [ { id: 's7f3a91c2', label: 'Climate', family: 'climate', preview: 'climate.studio_preview' },          // SOURCE GROUPS (preview: design only)
             { id: 's0b44e1d9', label: 'Outside', family: 'sensor' } ],
    properties: [ { id: 'p1c2d3e4f', name: 'Room Temperature', group: 's7f3a91c2', read: 'derived', attribute: 'current_temperature' },   // WIDGET PROPERTIES
                  { id: 'p2a3b4c5d', name: 'HVAC Mode', group: 's7f3a91c2', read: 'state' }, … ],
    components: [ { id: 'dial-1', name: 'dialRoomTemp', type: 'dial', x: 80, y: 8, w: 208, h: 208, config: { preset: 'spectrum', min: 7, max: 30, … }, data: { value: 65 },
                    binding: { source: 'ha', property: 'p1c2d3e4f' } },                                            // REFERENCES a property
                  { id: 'text-5', name: 'txtRoomTemp', type: 'text', …, config: { mode: 'value', suffix: '°C', decimals: 1, … }, binding: { source: 'ha', property: 'p1c2d3e4f' } },
                  { id: 'segmented-1', name: 'segMode', type: 'segmented', …, binding: { source: 'ha', property: 'p2a3b4c5d' } }, … ] } }

// a DASHBOARD INSTANCE (an ordinary item of type "studio"): the definition it places, and the entity THIS copy uses per source group
{ type: 'studio', config: { definition: 'w3f9c0d7a1b2e4f60', entities: { s7f3a91c2: 'climate.living_room', s0b44e1d9: 'sensor.outside' } }, layout: { … } }
```

- **A control is an independent object:** a stable `id` (`<type>-<n>`, never reused while it exists, never derived from the name), a
  **Name** (VB style: `Dial1`, `ValueText2`, `Button1`, `Segmented1` by default; renameable, unique in the widget — letters, digits, `_`),
  its `type`, box, layer (the list order: first = back), its own configuration and preview data, and an optional property reference.
  Duplicating makes a new id, a new name and an independent configuration. Overlap implies no relationship.
- **The box** (`x`, `y`, `w`, `h`) is in **logical px inside the widget's canvas**. Box vs appearance: changing one never rewrites the other.
- **`data`** is **preview data** (unmistakable placeholders such as "Value") through each component's normal view contract.
- **`properties`** — the widget's **named data** (WIDGET PROPERTIES): a stable id (`p` + 8 hex), a **name** (unique: *Room
  Temperature*), its **source group**, and **what it reads** from that group's entity (`read` / `attribute` — a friendly *value* of the
  group's HA family; see "Home Assistant: widget properties"). Never an entity.
- **`slots`** are the **SOURCE GROUPS** (internally entity slots — the name stays for compatibility): a stable id (`s` + 8 hex), a
  **name** (*Climate*), the **HA family** it expects, and an optional **preview** entity (design only). One placed copy chooses ONE entity
  per source group; every property in the group reads from it. Only groups that hold a property are saved.
- **`binding`** of a control: `{ source: 'ha', property }` (+ a button's `action`, an Information's `unit`) — a REFERENCE, never an
  entity, never another control. Declarative only.
- **Separate concepts:** Component (a control) · Name · Widget Property · Source Group · HA Family · Value · Preview Entity — and,
  unrelated to any of them, Collection (your grouping) and Category (the standard list) for the gallery.
- **Checked twice:** Studio validates names, properties, groups and each control's compatibility; the server checks the shape
  independently (`StudioWidgets::check`): known keys only, ids, names, families, property references, boxes, a category, an MDI icon,
  reads / attribute names, an action from the normalised list, no markup, no executable text, no credential-like key.

### Definition vs dashboard instance (chosen: A — the instance REFERENCES the definition live)

- Add to dashboard → the definition's tile adds an **instance**: an ordinary item of type `studio` whose configuration is
  `{ definition: '<id>', entities: { <source group id>: <entity> } }`.
- The **definition is the source of truth** for the controls, properties and source groups (Widget Studio: *what is this widget?*);
  the **instance owns its placement and its entities** (the dashboard's Configure: *which entity does THIS copy use per source group?*).
- Saving the definition again updates **every instance**, on screen at once (`IniqStudioLibrary.onChange`) and on every later load.
- **Entities are instance-level:** two copies of one definition can use different entities; changing one copy's assignment never
  touches the other copy or the definition. A copy never falls back to the designer's preview entities.
- Configure, the runtime resolution path and the actions: "Home Assistant: widget properties and source groups" below.
- A definition that no longer exists renders as "This widget is no longer available" (never an error). Deletion is not offered yet:
  it needs dependency handling first.

### Older Studio widgets (the proof of concept)

- An item of type `studio` with its own `components` still loads and renders exactly as before (`studioClean` keeps it).
- Older definitions are migrated to properties and source groups on load ("Migration" below); an instance saved before entity
  assignments existed (no `entities` at all) is migrated **once** into its own assignment — the entities it showed then;
  - a **new** copy always starts with no entity (`entities: {}`) and Configure asks: a designer's entity is never inherited.
- Studio lists such items under *Older Studio widgets on this dashboard*. Saving one makes it a definition and turns that item into an
  instance of it (one undoable change, then the dashboard is saved).

## Canvas and coordinates

- The canvas is drawn by the **runtime widget itself** (`MaisonStudioWidget.create(model)`), at exactly its logical design size.
- Studio's selection layer (outline, resize grip, a small tag with the control's Name) is a sibling of the widget, never inside it.
- The Studio zoom is a CSS scale on the board. Pointer positions are converted with the board's own size, so the zoom never changes a stored coordinate.
- **Move:** drag the component, or edit X / Y in Properties.
- **Resize:** drag the corner handle, or edit Width / Height. The component responds through its resize contract (below).
- **Clamping:** a component stays inside the canvas and is never resized because it reaches an edge.
- **Other actions:** click to select; Delete removes the selected component; Duplicate adds a copy offset 12 px with a new id and a new name.
- The grid, snapping and guides are described under *Canvas aids*.
- Undo / redo inside Studio is **not** built. The editor's undo covers each Studio save, as an item change.

## Canvas aids: grid, snapping, smart guides, keyboard (Studio only)

All of these are Studio editing aids, with Studio session preferences. Nothing about them is stored in the widget, and none of it
appears at runtime.

- **Grid:**
  - Shown by default, 8 logical px; sizes 4 / 8 / 12 / 16.
  - Drawn as a CSS background of the editor's selection layer, in logical px, so it scales with the canvas and adds no element per line.
- **Snap engine** (`IniqStudio.snapBox`): it works on component **boxes** only (`x`, `y`, `w`, `h` in logical px), so any composable component, including future ones, takes part without being known. Order for each axis:
  1. **Smart alignment.** The box's start, centre and end (when moving), or its right / bottom edge (when resizing), against the canvas edges and centres and the other boxes' edges and centres. The nearest line within **5 logical px** wins.
  2. **Grid.** Used only when no alignment applies.
  3. **Minimum size** (when resizing).
  4. **The canvas.**
- **Guides:** the lines the result is aligned on, shown only during the gesture.
- **Centre alignment uses the box's own centre:** a 60-wide box centred on 360 sits at x = 150.
- **Settings:**
  - *Snap: Grid / Components* toggles (both on by default).
  - Holding **Alt** while dragging disables snapping for that gesture.
- **Keyboard:**
  - Arrows move the selected component 1 logical px; **Shift + arrows** move it one grid step, inside the canvas.
  - The arrows are ignored while a field or control of the Properties (or the toolbars) has focus.
- **Numbers are exact:** X / Y / W / H typed in Properties are never snapped (x = 37 stays 37).
- **Logical coordinates throughout:** pointer position → logical px (from the board's own size) → proposed box → snap → clamp → model. The editor zoom never changes a coordinate.

## Resizing: two deliberate gestures

| Gesture | Meaning | What changes |
|---|---|---|
| **Drag the handle** (or type W / H) | Resize the **layout box** | x / y / w / h only. The presentation (button size, icon size, text sizes …) stays as configured; the component lays out in its new box by its own `resize.mode`. |
| **Shift + drag the handle** | **Scale** the designed object | The box and the component's scalable presentation, by **one uniform factor k**. The results are ordinary configuration: Properties show them, and they can be typed again. There is no hidden scale. |

- **Shift + resize is a scale session:**
  - At the start of the gesture Studio snapshots the box and `compose.scale.base(config)` (the effective values now).
  - On each move, every scalable property = **snapshot × k**, clamped to its `[min, max]`. It is never compounded.
  - Releasing Shift mid-gesture restores the snapshot (a normal resize).
- **k:**
  1. The proposed box (the box keeps its proportions, so circles stay circles) is snapped by the engine.
  2. k is taken from the **snapped** box (its width, or its height when only a horizontal line snapped).
  3. k is limited by the canvas and the component's minimum.
  4. The box = start × k, and the presentation is computed from that same k.
- **Shift elsewhere:** Shift + arrow keys still move one grid step (Shift has a meaning only during a handle drag).

| Component | `resize.mode` (normal resize) | `scale.props` (Shift + resize) |
|---|---|---|
| Action button | `center`: its own size, centred | size · iconSize · labelSize · labelGap (the label ones only with a visible label) |
| Segmented control | `fill`: its width and height are the box's; text / icons / gap / padding stay | textSize · iconSize · gap · padX |
| Information | `layout`: the box is layout room; its sizes stay | valueSize · labelSize · iconSize |
| Icon | `center`: its own Icon size, centred | iconSize (a background is padding around the glyph: ×1.44, never a smaller glyph) |
| Image | `fill`: the picture is the box | none: Shift + resize is a resize |
| Dial | `fill`, square: the dial is the circle of the box's limiting dimension, centred (its unset text sizes follow it) | valueSize · labelSize (the configured ones) |
| Slider | `fill`: the track is the box's width, centred in its height (a wider box = a longer track) | track · handle |

`resize.toBox(config, prev, box)` keeps a changed presentation inside its box. For example, typing a Button size larger than its box
grows the box; a box is never shrunk by it. Studio contains no per-component branch: it calls the contract.

## Primitives: Studio is a visual composer

Widget Studio is a **builder of widgets from generic primitives**, never a rearranger of finished widgets:
*primitives → configure appearance → position / resize → bind HA data / actions → compose → save a reusable widget → each placed copy
assigns its real entities*. A primitive provides ONE focused capability; the designer composes the rest. A thermostat is a **Dial**
(the ring) + **Value / Text** "21.5" + "°C" + "Room" + "Target 23°" + a **Segmented control** + a **Button** — the Dial is not a
thermostat, and nothing reserves room for the text: the texts are separate components placed on top of it (Studio allows overlap; the
list order is the layer order — *Send backward* / *Bring forward*).

### Dial (the gauge primitive — components/gauge, `IniqGauge`)

ONE numeric value drawn on a circular scale. It draws a track, a value arc, ticks, a marker and a face — **no text at all** (no value,
label, "Active", "Now", target or state words) and no domain: temperature, humidity, battery, power, a tank, a fan, a volume, a
percentage all look alike to it. *Component → its binding → the copy's entity → state / attribute → a number → the arc and the marker.*

| Group | Properties (every one editable; px are logical px; a size left *Automatic* follows the dial's size) |
|---|---|
| Dial | **Preset** (Custom · Spectrum ring · Minimal ring · State arc · Full dial · Digital ring) · **Minimum** · **Maximum** |
| Geometry | Start angle (° from 12 o'clock) · Sweep (10–360°: a full circle, a horseshoe, a semi-circle, a ¾ gauge) · Direction (clockwise / counter-clockwise) · Arc ends (round / flat) · Ring thickness · Ring inset |
| Track | Show · colour · opacity · own thickness (default: the ring's) · style (solid / soft) |
| Value arc | Show · colour · gradient (start → end colour) · thickness (default: the ring's) · opacity · glow |
| Ticks | Off / Major only / Major + minor · position (inside / centred / outside) · major count · minor per major · lengths · thicknesses · distance from the ring · colours · opacity |
| Marker | Show · dot / line / triangle · inside / centred / outside · size · colour · outline + thickness · glow |
| Face | None / Solid / Soft / Glass / Deep · colour · opacity · border + colour · shadow / depth (none / soft / raised) — a surface only, never text |

- **Presets are starting configurations:** choosing one writes its values into the SAME properties (`IniqGauge.PRESETS`); after that
  every property stays editable, and editing one does not lock or reset anything. One renderer and one model — no per-design code.
  The former *Digital ring* keeps its ring; its digits are now Value / Text components.
- **Range** (Minimum / Maximum) is configuration, prefilled from Home Assistant where it reports one (a climate's min / max
  temperature, 0–100 for a percentage) — never a binding.
- **Box:** the gauge is its box's largest centred circle. A normal resize changes the geometry, never a size that is set (thickness,
  marker, tick lengths, tick count); *Shift* + resize scales the set sizes by the same factor (`IniqGauge.SCALE`). The ring's radius
  leaves room for outside ticks and an outside marker, so nothing is clipped.
- **Effects** are restrained and static (arc glow, marker glow, face depth, a soft track); the gauge has no animation, so
  `prefers-reduced-motion` has nothing to stop.
- The **built-in Climate widget keeps its own thermostat dial** (components/dial, `IniqDial.create`) unchanged; an older Studio Dial
  (saved with a *design*) opens as that design's preset, its range from its old preview data, its target / state / drag dropped.

### Value / Text (components/text, `IniqText`)

ONE line of text in its box. **Mode: Static** (the words: "Room", "°C") **or Value** (one value — from its entity, else its preview
value). Formatting: prefix (a word gets a space: *Target* → "Target 23"), suffix ("°", "°C"), decimals (as reported / 0–3), fallback
(shown when there is no value — default "—"). Typography: font size (or automatic from the box), weight, colour, opacity, horizontal
and vertical alignment, line height, letter spacing. Background: none (transparent — the default, so it can sit on a Dial) · soft ·
solid, with colour, opacity, padding and corner radius. No icon, no label, no domain. (*Information* stays available unchanged for an
icon + label + value item.)

### The other primitives

- **Toggle:** the shared switch-role control button — the very renderer of Light's and Climate's Power — placeable on its own (label
  *Toggle*, the switch look, no property, Action None). Bound to a pressable property (a light, a switch…) its Action is chosen
  explicitly (Toggle / Turn on / Turn off); it shows the property's on / off.
- **Slider:** ONE number; the shared Slider editor (name, track thickness, handle size, fill colour — as Light's brightness) plus, for
  its own plain skin, track colour, handle colour, track corner radius and handle shape. Horizontal only (the native range input has no
  clean vertical form).
- **Segmented control:** generic options (its options collection — Heat / Auto / Off is only the preview data); filled from Home
  Assistant when bound. **Action button**, **Icon**, **Image:** their shared editors, unchanged.

### The property sheet (VB style)

No control selected: the **widget's** sheet — Collection, Name, Category, Description, Gallery icon, and **Data properties** (below).
One control selected: **that control's** sheet only, in collapsible sections (which ones are closed is remembered while Studio is open):

| Control | Sections |
|---|---|
| Dial | Identity · Data · Range · Arc (preset, geometry, track, value arc) · Ticks · Marker · Face · Preview value · Layout |
| Value / Text | Identity · Data (Mode: Static text / Home Assistant property; Property) · Content (Text — or Prefix, Suffix, Decimals, Fallback) · Text · Background · Preview value · Layout |
| Segmented control · Action button · Slider · Information | Identity · Data (Property; a button's Action; an Information's Unit) · its shared editor's sections · Preview value · Layout |
| Image · Icon | Identity · its shared editor's sections · Layout (no Data: static) |

- **Identity:** Name (validated: unique, letters / digits / `_`). **Layout:** X · Y · Width · Height, Send backward / Bring forward,
  Duplicate, Delete. Sections a control does not use are not shown (a Static text has no Data property, no formatting, no preview value).
- The header names the type and the control (*Dial · dialRoomTemp*); the canvas shows an outline, a resize grip and a small name tag on
  the selected control only.
- Every change re-renders that control in place. No internal terms (slot, binding id, component id, attribute path) appear.

```js
own    = compose.fields ? compose.fields() : IniqComponents.editor(type)({ ...compose.editor, builtins })
fields = [...own in 'ha' (a Value / Text's Mode), ...IniqBinding.fields(compose, ctx), ...the rest of own, ...compose.dataFields]
```

## Home Assistant: widget properties and source groups

```
Home Assistant ⇄ IniqDash server (token stays there) ⇄ IniqHA ⇄ IniqBinding ⇄ the component's view data (compose.update)
component event (ctx.onAction) → IniqBinding → IniqHA.call(entity, normalised action, value) → api/ha_call.php → HaService::plan → HA service
```

- **WIDGET PROPERTY** = the widget's semantic data requirement (*Room Temperature*, *Target Temperature*, *HVAC Mode*, *Brightness*).
  Not a control, not an entity, not another control. Controls REFERENCE properties; several controls may reference the same one, each
  independently (deleting one never affects another).
- **SOURCE GROUP** = ONE entity a placed copy chooses. Properties that come from the same entity share a group (*Climate*: Room
  Temperature · Target Temperature · HVAC Mode); a property gets its own group by default (named after it). Nothing is merged
  automatically — not even two properties of the same family.
- **HA FAMILY** of a group (`IniqBinding.FAMILIES`): Sensor · Binary sensor · Climate · Light · Switch · Cover · Fan · Media player ·
  Camera · Lock · Alarm · Person · Number · Select · Scene · Script · Button — each with its entity domains (they narrow the picker of a
  placed copy) and its friendly **values**, e.g. Climate: Current temperature · Target temperature · HVAC mode (state) · HVAC action ·
  Preset · Current humidity; Light: On / off · Brightness. Each value knows its kind (a number, an option…) and, where one exists, the
  control that sets it (Target temperature → set_temperature, HVAC mode → set_hvac_mode, Brightness → brightness). No raw paths.
- **Compatibility:** a control is offered only the properties it can use — a Dial a number, a Segmented control an option it can set,
  a Slider a number it can set, a Button a family it can press (its Action: Toggle / Turn on / Turn off…), a text anything.
- **The PROPERTY EDITOR** (create · edit — one definition per property): **Name**; HOME ASSISTANT — **Family** (Sensor first),
  **Value** (a sensor: *State* by default — `sensor.xxx.state`; a climate: Current temperature · Target temperature · State (HVAC mode)…),
  **Source** (an existing one of the family, or *New source…* named after the property), the source's **Preview entity** (*Used only
  while designing*) and, right under it, the **CURRENT PREVIEW VALUE** Studio receives — *21.5 °C*, *48%*, *heat*, *on*, or *No preview
  entity selected* · *Unavailable* · *Unknown* · *Not reported by …* — live (`IniqBinding.watchPreview`). It is design information,
  not a field. **Unit:** the one Home Assistant reports (a sensor's `unit_of_measurement`; a climate temperature: the system's
  temperature unit, "°" when unknown; `%` for percentages) — shown there, never forced into a control: a Value / Text decides its own
  suffix (*21.5*, *21.5°C*, *Room 21.5°C*).
- **Opening it:** on a control, *Property → + New property…* (only values that control can use; the control then uses it), or **Edit
  property** beside a bound control's Property; on the widget, *Data properties → + Add property* or a row's **Edit**. The family /
  value / source / preview fields exist only there — never duplicated on the components using the property.
- **Data properties** (the widget's sheet): one compact row per property — **Name**, *Family · Value*, *Source: …*, *Preview: 21.5 °C*,
  *Used by: dialRoomTemp, txtRoomTemp* or *Unused* — with **Edit** and **Delete**. An unused property deletes at once; a used one asks
  first (*"Room Temperature is used by 2 components (…)."* — Cancel · **Remove property and unbind components**): the property goes, its
  components stay with Property *None* (never deleted, never re-bound to something else). Deleted properties are gone from every
  dropdown and from the saved definition; a source left without properties goes with them.
- **The component's Property dropdown** lists only the widget's current properties that control can use: *None (preview data)* ·
  the properties · *+ New property…* — never a deleted property, an orphaned slot or a component name.
- **NO MAGIC — a new primitive has no Home Assistant meaning until the designer gives it one.** Every component's registered
  defaults are neutral: Dial (Property None, a 50 % preview), Information (*Value* / *Label*), Value / Text (Static *Text*), Slider
  (Property None), Action button (*Button*, a neutral icon, Action None), Segmented control (*Option 1* / *Option 2* — no values, no
  icons, no domain), Icon (a neutral star), Image (none). Preview values are design data only and never become a property or a
  requirement. Nothing is ever assigned automatically.
- **The Data section tells the truth:** without a property — *"Display only — not connected to Home Assistant: it shows its design
  preview and acts on nothing."*; with one — *"Shows “HVAC Mode” and sets it when an option is chosen."*, *"Pressing it: Toggle — …"*,
  *"Action: None — pressing it does nothing in Home Assistant."* (`IniqBinding.describe`). An unbound Segmented control showing
  Heat / Auto / Off is display only: choosing an option is a local preview choice; no Home Assistant call is made and Configure asks
  for nothing.
- **Segmented options** (Label · Value · Icon, then Show label · Active colour) have no action of their own: an option means something
  only through its control's Property — matched against the property's value and sent through it when chosen. Bound to a property
  with a preview entity, its options are prefilled from what Home Assistant offers (a climate's HVAC modes) — editable.
- **A Button's Action** starts as None even once it has a property; the designer chooses Toggle / Turn on / … explicitly.
- **Preview entity (design only):** set on a source group; every control using one of its properties renders it live in Studio, and a
  newly chosen property prefills the control's own configuration from it (a Dial's range, a Slider's range, a Segmented control's
  options). It is never a placed copy's entity.
- **Add to dashboard → Configure** asks ONCE per source group the controls use: *Climate \** (Provides: Room Temperature, Target
  Temperature, HVAC Mode) · *Outside \** (Provides: Outside Temperature) — the picker narrowed to the group's family (*Choose a climate
  entity…*), required, with a warning when the chosen entity cannot give what the properties read. The entities belong to the copy
  (`config.entities`, keyed by the group's id); two copies are independent and neither changes the definition.
- **Runtime resolution (exact):** dashboard copy → its `config.entities[<Climate group id>]` (`climate.living_room`) → the property
  *Room Temperature* (`derived: current_temperature`) → each control referencing it — `dialRoomTemp` and `txtRoomTemp` independently.
  In code: the runtime (widgets/default/studio/studio.js) expands each control's property reference (`IniqBinding.expandComponent`:
  property → its group's slot + what it reads + the control's action) → `IniqBinding.resolve` puts the copy's entity in → `attach`
  subscribes through the shared poll → the value, normalised for the control (`null` when not numeric) → the control's own
  `compose.update`. *Target Temperature* → `txtTarget`; *HVAC Mode* (state) → `segMode`, whose Heat / Auto / Off press becomes
  `set_hvac_mode` on the same entity through `IniqHA.call` → api/ha_call.php → the server's plan. No service name, data or credential
  ever comes from the browser or the definition.
- **Internally** the slot / binding backend is reused unchanged: a source group IS an entity slot (stable id, `config.entities`,
  `resolve`, `attach`, the action layer, compatibility warnings); the property layer only expands on top of it.
- **Live:** the components follow the shared poll; a change reaches each affected control through its own `update()`.
- **Unknown / unavailable / missing:** text shows the fallback ("—"), numbers become `null` (a Dial shows no arc and no marker; a Slider
  is disabled). Never `undefined` / `NaN`.
- **Save validation:** errors stop the save (an invalid or duplicate control name, a control on a missing or incompatible property, an
  unnamed or duplicate property / source group, an unknown component type). Home Assistant offline or a preview entity unavailable is a
  note only.

### Schema 2: one authority, one-way migration

- A definition saved by Studio carries **`schema: 2`**: Widget Properties + source groups are its ONLY semantics. In it, a component
  binding is a property reference or nothing: `IniqBinding.expandComponent` ignores any other binding, `migrate` drops it (`authority`),
  and the server refuses to store one. There is no second binding system.
- **Configure generation path:** gallery tile → `IniqStudioLibrary.slots(id)` → `IniqBinding.slotsOf(definition)` → `expand` (each
  component's PROPERTY reference → its source group) → one row per source group a property-bound component uses, with *Provides:* the
  used properties' names and the picker narrowed to the group's family. A component without a property adds nothing; a legacy slot
  binding adds nothing.
- An older definition (no `schema`) is **migrated once** on load (below) and written as schema 2 when Studio saves it; a schema-2
  definition is never migrated again and never cleaned by name, so a deleted property can never come back.

### Migration (older Studio definitions — on load; the file changes when Studio saves it again)

- **Direct entities** (the first model) → a source group per entity (the entity as its preview) and a property per value read.
- **Entity slots / "Same as" / "Entity 2"** (the previous models) → each slot a control uses becomes a **source group with the same id**
  (so every placed copy's `config.entities` stays valid — no data loss), its family from its preview entity's domain, else from what its
  controls ask of it, else from the values they read; each distinct value read from it becomes **one property**; every control on it —
  "Same as" ones included — now references its property. Deliberate names stay (*Stove Temperature*, *Heating*); a generated one
  (*Entity 2*, *Segmented control*) gives way to the preview entity's name or the value (*Living room*, *HVAC mode*). Unused slots are
  dropped, and a binding on a generated slot that never got a preview entity (an "Entity 3" created and abandoned) is an **orphan**: its
  component goes back to no property — no junk property is manufactured.
- **Mixed older definitions** (some properties plus a leftover slot binding — e.g. a dial still on a legacy *Stove Temperature* slot):
  the leftover becomes a property too (a meaningful, used binding survives — and the manager names its user, so it can be deleted with
  *Remove property and unbind components*).
- **Cleanup of already-migrated definitions:** a property nothing uses whose name was generated (*Entity 2*, *Segmented control
  Value*, *Dial 2*…) is dropped on load; a deliberate unused one stays, marked *Unused*, until the designer deletes it. Once saved, a
  deleted property never comes back (migration only runs on the older slot form, never on saved properties).
- Controls saved before names get VB-style names in layer order (`Dial1`, `Segmented1`, …).

## Gallery: collection, category, source

- **COLLECTION = a user-facing organisational group:** *IniqDash* (IniqDash's own widgets — the factory widgets and the first-party
  Room / Scene package, `WidgetPackages::FIRST_PARTY`), installed collections (`collection.json`), and **collections the user creates**
  (e.g. *Maison*, *Robin*). *General* (standalone packages you installed) is listed only while there is one.
- **CATEGORY = what kind of widget it is:** the standard list (Controls · Climate & Environment · Security · Media · Sensors & Data ·
  Energy · Appliances & Robots · People · Time & Calendar · Navigation & Content).
- **SOURCE = where a widget comes from** (`built-in` · `installed` · `user`, `T.source`): internal provenance, never shown as a collection.
- None of the three changes what a widget does: moving a widget to another collection or category leaves its components, entities,
  bindings, actions and look exactly as they were.
- **User collections** are stored server-side (`<private>/studio-widgets/collections.json`): a stable id (`c` + 12 hex, independent of
  the name) and a name (1–60, unique, not "IniqDash"). Renaming / deleting / reordering collections is not built yet.
- **Studio's Widget panel** (no component selected): *Collection* (required — an existing one, or **+ New**: name → Create, persisted at
  once, selected, and listed in the gallery at once; a new widget starts in the collection used last) · Name · Category · Description ·
  Gallery icon (the shared MDI picker).
- **Add to dashboard:** Collection (All · IniqDash · each installed and user collection, with counts) × Category × Search (name,
  description, category, collection). A definition is an ordinary gallery card (its gallery icon, name, description; its collection is
  shown under *All*).

## Runtime reconstruction

`widgets/default/studio/studio.js` builds the widget from its model:
- An instance resolves its definition (`IniqStudioLibrary.model(id)`); an older item uses its own components.
- For each component it calls `IniqComponents.get(type).compose.render(config, data, ctx)` (the same call Studio's canvas makes) and
  places the result in its box; a bound component's data then arrives through `compose.update`.
- The logical canvas is scaled to fit the widget's own box (centred), and never laid out again.
- Every event is reported as `iq-studio-action` (`{ kind, value, component }`) and, when bound, handed to the binding.

## Extension points (not built)

- **Responsive (Micro · Compact · Normal · Large):** per-size overrides beside each component's box, without changing the base model.
- **Widget packages:** a definition is declarative (metadata + components + bindings) and can later become a package to share / install.

## Templates: what exists and what is missing

*Create widget → Blank / Start from template* (e.g. Climate → Spectrum ring, opening as a Studio composition) is **not built**. Findings:

- A standard widget's preset is **configuration**, not a composition: Climate, Light and Room build their DOM in code from their
  config (variant, design, controls collection, places / offsets inside their own structured regions and CSS grids). There is no list of
  boxed components to export.
- Studio compositions are **absolute boxes** (`x / y / w / h` in logical px) of composable primitives with neutral configuration and
  property references. Translating a preset needs, per widget: (1) a layout pass that measures the card at a chosen size and records each
  element's box; (2) a mapping from each card element to a primitive and its config (most exist: the dial's look → the gauge's presets,
  power → Toggle, mode → Segmented, information → Information / Value / Text); (3) widget properties + sources from the card's entity
  (a Climate: Climate · Current temperature / Target temperature / HVAC mode).
- The pieces that exist: the shared renderers and look mappings (exported for previews), `IniqComponents.composable()`, schema-2
  definitions. Missing: the measuring pass and the per-widget mapping — the dedicated Widget Studio phase. The standard gallery stays the
  simplest way to use a standard widget.

## Not built (intentionally)

- Deleting a definition (dependency handling first), version history, export / import / packages / sharing
- Optional (non-required) source groups; raw / advanced attribute values beyond each family's catalog (no query language — lists and
  objects are not offered); changing a source group's HA family after creation (create a new group instead)
- A service-call or automation editor, templates, expressions, scripting
- Thumbnails (the gallery icon represents a definition)
- More components (charts, gauges, Energy Flow), a layers panel, multi-select, rulers, Studio undo / redo, responsive variants
