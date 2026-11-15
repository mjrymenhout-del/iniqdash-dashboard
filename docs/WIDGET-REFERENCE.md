# Reference widget pattern

The Room / Scene package (`widgets/custom/room-scene/`) is the reference for how a widget is built; the built-in Light
(`widgets/default/light/`) is the second widget built on it. Five layers, each deciding one thing:

```
TYPE → VARIANT → MAISONFIT → APPEARANCE → STATE
```

| Layer | Decides | Where | Stored |
|---|---|---|---|
| **Type** | what the widget is: its content model (name, Information lines, scenes, picture, roles) | `define()` fields, `widget.json` roles | config |
| **Variant** | the presentation family (Room: Hero · Compact card · Status · Minimal) | `define().variants` → the generic *Variant* field; root `data-variant` | `config.variant` (default not stored) |
| **MaisonFit** | the composition for the widget's **own** box: micro · compact · normal · large, and how many lines / tiles fit | `arrangement(w, h, variant)`, `limits(…)`; root `data-fit-arr` | never (measured) |
| **Appearance** | semantic finish: alignment, image treatment, overlay, Information style, scene style, title size | allow-listed select fields in the *appearance* group, `when` = relevant for the variant; root `data-align`, `data-image`, … | config (allow-listed values only, never CSS; defaults not stored) |
| **State** | what Home Assistant reports right now | `haState` from the roles binding | never |

Every variant has a deliberate composition at every size — a variant is not a size, and a size is not a variant.

**Editor preview geometry ≠ dashboard geometry.** A variant may declare a representative editor preview shape
(`variants: [{ id, label, preview: { w, h } }]`, in units of a 24-column desktop; Room: Hero 14×9, Compact card 10×6, Status 9×6,
Minimal 8×4). The configure dialog opens on it and switches to it when the variant changes; *Preview size* (Variant preview ·
This widget's size · Custom W × H) lets the owner try any size, and MaisonFit adapts as usual. None of it is stored: the widget's
x / y / w / h stay the dashboard's.
"Automatic" Appearance values resolve per variant *and* size (`looks()`), so the CSS only knows concrete styles.

## The reference-widget standard (finalised with Room)

The order every widget's configurator follows — only the sections that apply to the widget appear, each an accordion section:

```
TYPE → VARIANT → MAISONFIT → CONTENT → CONTROLS → INTERACTIONS → APPEARANCE → IMAGES → VISIBILITY
```

Room's sections: **Room** (name, Area — identity only) · **Information** · **Scenes** · **Interactions** · **Appearance** ·
**Images** · **Visibility**.

- **Collections, never fixed slots** (Information, Scenes): compact rows (`[icon] title · sub · value`, Edit, ⋮ Move up / Move down /
  Remove) and ONE focused editor at a time (a modal over the configuration; every change shows in the live preview before Save;
  Cancel restores). Zero items leave no empty area.
- **An item editor is grouped**: Information = Content · Presentation · Icon · Position (Position only where the surface has a
  placement model — e.g. the popup hero's 3 × 3 selector; Room has none); an action item (a Room scene) = **Action** (what it runs) ·
  **Appearance** (how its button looks). A group with nothing to show (no icon → no Icon group) disappears.
- **Conditional fields**: a control appears only while it can have an effect (no picture → no image treatment / overlay; Style Bare →
  no button colour; label off → no label size; no icon → no icon size / colour / animation; animation None → no "Animate when").
- **Card gestures vs controls**: Interactions (Tap / Double tap / Long press) belong to the CARD; a widget's own buttons (scenes) run
  their own action and are never a card gesture. The section texts say so.
- **Continuous quantities** → the shared Slider + Number (below); **discrete choices** → selects / segmented controls;
  **positions** → a structured selector; **icons** → the shared searchable MDI picker; **images** → the shared picker, scoped to the
  widget TYPE's image library (IMAGES = what is shown; APPEARANCE = how).
- **Colour**: theme tokens by default. Only where colour IDENTIFIES something the owner chose (a Room scene button) may an item take a
  custom colour — the shared colour field with `custom: true` (tokens + a system colour picker → a validated `#rrggbb`, never other
  CSS). Panels, tabs and chrome stay on the theme.
- **Responsive truth**: an owner's numeric size is honoured where the widget has room (Normal / Large) and capped on Micro / Compact so
  the item stays inside the card; never a CSS transform; MaisonFit measures the widget's own logical box (never the editor zoom).
- **State truthfulness**: visual state (the lit picture, an icon animation "while active") follows only what Home Assistant reports;
  nothing is shown as Information unless the owner added it.

## Inside the widget: four separate concerns

* **Information** — what is shown as text: only the owner's lines (`config.info`), in their order; the size may show fewer (the first ones), never others, never placeholders. Missing / unavailable values are said as such.
* **Functional state** — what the room *knows* (`functionalState()`): e.g. its mapped lights (mapped / known / on / off / still resolving). Never shown as text.
* **Visual state** — how the artwork reacts to the functional state (`visualState()` → `applyVisual()`): today `data-lit` = `true | false | unknown | none`. It wins over Appearance: an image treatment may only darken, blur or desaturate, so *off* never looks lit.
  *Extension point:* future, deliberately mapped visual elements (an entity + an effect) add their own entries to `visualState()` and their own attribute — nothing is inferred from what an area contains.
* **Interactions** — what a press does: scenes go through the secure action channel (`haRequest({ slot, index, action })`); navigation is a `maison:action` event. A scene is shown active only while HA says so.

## Reusing it (Light, the second widget)

* Variants + representative preview shapes: `variants: [{ id, label, preview }]` on the type (Light: Standard `artwork` 8×6 ·
  Compact 7×2 · Slider 4×7 · Artwork `image` 8×7). Existing variant ids are kept for older dashboards (Light's fixture card stays
  `artwork`, now labelled Standard; the retired `tile` normalises to it).
* Appearance fields: `F.looks(api, variantOf, rows)` — the shared helper for semantic select fields in the Appearance group, each shown
  only for the variants listed in the widget's `LOOK_FOR`; the widget's `LOOK` lists the allowed values (first = default, never stored).
* The widget resolves "Automatic" per variant and size (`looks()`) and writes data attributes; its CSS is keyed on
  `data-variant` × `data-fit-arr` × those attributes. One DOM tree.

### Light (the reference CONTROL widget)

* **Sections** (its own `groups`): **Light** (name, Home Assistant light — the entity's capability summary under it) · **Controls** ·
  **Interactions** · **Appearance** · **Images** · **Visibility**. Empty sections are not shown.
* **Controls** — ONE ordered list (the shared collection editor; each row edited in a focused item editor): **Power** (always there:
  it can be moved, never removed) · Brightness · Colour temperature · Colour · Effects (each only when the linked — or demo — light has
  it; "Show on the card" off keeps it out of the card) · up to two optional **toggles**. Move up / down orders them (no coordinates).
  `config.controls` = `[{ type, show?, place?, … }]` (Power's entry is only its position in the order); absent = Power then every control
  the light has; an older `{ brightness: false… }` reads as the list.
  * **Power** — the shared control button, **one renderer for every variant and style** (VARIANT = composition; CONTROL CONFIGURATION =
    appearance + placement + behaviour; MAISONFIT = responsive caps). `config.power`: icon (MDI), button size (28–120 px), icon size
    (12–72 px), style — *Automatic* (the variant's own form: a switch in Standard, a button elsewhere, as Light always had), *Theme button*,
    *Theme switch* (shared looks with the glow finish in the light's colour), *Filled*, *Soft*, *Outline*, *Bare*, *Switch* —, shape (not
    for a switch), button / icon colour, state appearance, and its placement. The variant supplies only the automatic size and the place;
    an older Appearance "Power control" becomes the matching Theme style (never on the Slider, which never offered it).
  * **Brightness**: track thickness (6–64 px), handle size (8–40 px: a round handle), accent colour; its **line** (Automatic · Top · Centre ·
    Bottom) — a linear control is a line across the card, never a floating corner.
  * **Toggle** (the shared segmented control): Option A / Option B — icon, label, show label, **what it does** (turn on · turn off · set a
    brightness · a colour temperature · a colour — only what this light supports), its value, its active colour — Appearance (height,
    icon size, gap, padding, selected style, shape, other options, active colour) and its placement (Automatic: with the brightness).
    Selected = the option the CONFIRMED Home Assistant state matches (±150 K, ±3 %, ±12°), none while nothing matches. A value on an OFF
    light is sent as that value (light.turn_on with it). Shown at Normal / Large.
  * **Line alignment / Control gap** — the controls sharing a line; the gap also between controls sharing a place.
* **Placement** (structured, never X / Y): Power and each toggle — Automatic or one of nine regions (the shared 3 × 3 selector, `place:
  "<top|center|bottom>-<left|center|right>"`); the brightness — a line; the title — Appearance · Title position (`titlePlace`). With nothing
  placed the variant's own composition is used exactly as before. Once something is placed the card is composed in nine regions inside the
  variant's padding (which keeps clear of its lamp well / column), each row followed by a full-width line; whatever is not placed takes the
  VARIANT's default region, so switching variants keeps the intent. Several controls in one region form a group in the list's order,
  `controlGap` apart (never overlapping); a region takes the room its empty neighbours leave. Constrained sizes keep the intent: at Micro /
  Compact a line joins its row (the brightness beside the controls), and a card too short for three rows (a Compact row, a very low card)
  keeps left / centre / right in its middle row. Controls never shrink under a neighbouring title (the title ellipsizes).
* **Interactions** — Tap / Double tap / Long press are the *card's*. Power, the sliders, the colour buttons, the toggles and the lamp are
  the light's own controls (`data-iq-control`): pressing them never runs a card gesture.
* **Appearance** — per variant (`LOOK_FOR`): title size (Slider + Number, %), alignment, image treatment (only with a picture), glow.
* **Images** — the shared artwork picker scoped to the Light image library (Pendant · Dining room · uploads · None). None → an optional
  fallback MDI icon with Icon size (16–160 px), colour, background, animation. No image and no icon: nothing drawn, no space kept.
* **Icon background rule** — a glyph has one size; a surface (an icon background, the Power button, a toggle's selected option) is drawn
  around it and never shrinks it.
* **Responsive control sizing** — a configured Power / toggle size is honoured where the card has room (`--iqc-max`: 30 % of the card's
  smaller side, at most 120 px); Compact caps it at 56 px and the card's height; Micro at the variant's own power size. The whole control
  is capped (the glyph stays in proportion, never collapsing); the style, shape, colours and icon stay. Toggles appear at Normal / Large.
* **Titles** clip only sideways (`overflow: clip visible`): descenders are never cut.
* **Visual state** — lit only from the confirmed Home Assistant state; the glow is the light's own colour (hue, colour temperature, else
  warm white). A toggle option's automatic colour is the colour of what it sets (warm / cool white, its hue; off: neutral).
* Reference test: `tests/light-reference.mjs`.

### Climate (the reference CLIMATE CONTROL widget)

WIDGET → VARIANT (composition) → DIAL DESIGN (presentation of the target) → MAISONFIT. CONTROL → behaviour · appearance · placement.
INFORMATION → content · presentation · icon · position. Everything on the shared infrastructure below — Climate owns only HVAC semantics.

* **Sections**: Climate (name, entity, *Show room temperature*) · Controls · Information · Interactions · Appearance · Images · Visibility.
* **Controls** — ONE ordered list of what the ENTITY can do (`config.controls`; the Home Assistant binding decides — nothing is offered
  that cannot work): the **thermostat dial** · **HVAC mode** · **−** · **+** · **Power** (only with *off* and another mode; not shown by
  default) · **fan** · **preset** · **swing** · **target humidity** · **target range**. Reordered, shown / not shown, never removed.
  * Power, − and + are the shared control BUTTON (icon, button size, icon size, style *Theme* · Filled · Soft · Outline · Bare, shape,
    colours, state appearance, placement). Theme: Power filled with a glow in its mode's colour; − / + soft in the state colour. Power
    toggles between *off* and the last mode it was on (set_hvac_mode). − / + step by the entity's `target_temp_step`.
  * HVAC mode / fan / preset / swing are the shared SEGMENTED control for 2–4 options and a select beyond that (or as chosen). The mode
    has a per-mode icon, active colour and label (defaults: heat — fire, cool — snowflake, auto — thermostat-auto, dry, fan, off) and
    optional labels; its look is the segmented control's (height, icon size, gap, padding, selected style, shape, other options, colour).
    **Selected = what Home Assistant reports** (never assumed from a press).
  * The dial: **design** — *Spectrum ring* (default: a dark centre, an outer ring in the state colour or a cool → warm gradient, ticks,
    min / max), *Minimal ring* (thin open ring, large value, a big marker; ring thickness, marker), *State arc* (a horseshoe in the state
    colour, the action spoken; solid / glow), *Full dial* (a graphical face in the state colour or dark, dense ticks — detailed / simple —,
    the target and the room marked, the action icon) —; size (Slider + Number, px; Automatic: all the room its composition leaves it —
    measured, never overlapping), target value size, central value (target / room), label (on / text / size), room temperature, action,
    ticks, min / max, and the **heating / cooling / idle colours**. One renderer: every design draws the SAME model (target, room, min /
    max, step, mode, action) and shares one interaction (drag on the ring — touch only from the handle —, the keyboard handle
    `role=slider`). Changing the design keeps its size, value size and place.
  * Placement: Automatic (the variant's) or one of nine regions (the shared 3 × 3 selector) for every control, the dial and the title.
    **Anchor + small offset** (never X / Y coordinates): the dial and the discrete controls (Power, −, +, mode, fan, preset, swing) also take
    a horizontal / vertical offset (−120…120 px, Slider + Number; 0 = exactly at the anchor), in the widget's LOGICAL px (the editor zoom
    changes nothing), kept inside the card — reduced only as much as needed (Micro / Compact). An offset control is never relocated; two
    controls offset onto each other keep their places.
  * The ring dial is placed from ITS OWN anchor in an anchored layer over the card's content box (never derived from the rows or the
    − / + controls): the room the composition leaves it, a centre anchor reserving the same room on both sides so "Centre" is the card's
    true centre (in a small card where that would cost the dial over a fifth of its size, it is centred in the room it has); an automatic
    size leaves room for its own offset. − / + have their own places (portrait: bottom left / right; landscape: beside the dial).
  * **Digital ring** (the fifth design, the same model): a device face (Clean · Soft · Glass · Deep), depth (Flat · Soft · Raised), a THIN
    ring (thickness) in the action's colour or a chosen one, an optional active arc, minimal ticks (off by default), the room or the target
    as the primary value (the other as the secondary). Climate Information items can be shown **inside** it (*Inside the Digital ring*,
    then one of six structured places: top · upper left / right · lower left / right · bottom) — the same items, sizes, colours and truthful
    animations; by the dial's own size: large — all, medium — the first four, small — the first, tiny — none.
* **Information** — the shared collection (the Popup hero's builder: Content · Presentation · Icon · Position) under `config.info`:
  any entity's state or reported value (the climate's own attributes included), label, MDI icon, style, alignment, value / label / icon
  sizes, icon colour (token or custom), background (never shrinking the glyph), animation while the entity is ACTIVE (a climate: while
  its hvac_action says heating / cooling / …), the 3 × 3 position. Rendered by the shared `IniqInfo` items; several in one place form a
  group (`infoGap`).
* **Information layout** (`infoLayout`, collection level) — **Individual** (absent: each item at its own 3 × 3 position — unchanged) or
  **Bar**: the same items, in their order, as ONE structured row on the card's first or last row (`barPosition` Top · Bottom), with
  `barOx` / `barOy` (±40 px, kept inside the card), `barWidth` Full · Content · Custom (`barWidthPct` %), `barAlign` Equal · Space
  between · Left · Centre · Right, `barGap`, `barDividers` (on by default) + `barDividerOpacity`, `barTopDivider`, `barBackground`
  None · Soft · Surface. Layout only — every item keeps its own look. The bar is its own layer for the dial: the room it takes is reserved
  on both edges, so it never moves the dial's centre (adding, removing or reordering items never moves it). By the card's OWN size:
  Large / Normal — every item that fits (the first ones first); Compact — the first two, tighter, no labels; Micro — none. Items inside
  the Digital ring stay there (never twice). Independent of the widget background. Defaults are not stored.
* **Mode vs action** — the MODE (heat · cool · auto …) is what it is set to do; the ACTION (hvac_action: heating · cooling · idle …) is
  what it is doing now. The state colour, the dial's tone and the picture follow the ACTION; heat mode while idle is the idle colour,
  said as "Idle · Heat". No reported action → "<Mode> mode", never "heating".
* **Images** — the shared artwork picker on the Climate image library (built-ins: *Fireplace*, *Cool room*; uploads shared by Climate
  instances only); treatment (natural · dim · dark · grayscale), overlay strength, and *Picture follows what it is doing* (warmed while
  heating, cooled while cooling, rested while idle / off).
* **Variants** (the ids it has had): *Thermostat* `dial` (portrait: title top left, mode top right, the dial centre, − / + under it;
  landscape: mode top left, Power top right, − / + beside the dial, the title under it) · *Horizontal* (the dial at the left, − / + beside
  it) · *Compact* (no ring: the value with − / + beside it) · *Minimal* (read-only). **MaisonFit**: Micro keeps the temperature, its state
  ring, the title and Power; Compact adds the mode and − / +; secondary controls and Information from Normal; Large is the richest; a card
  too short for three rows keeps left / centre / right in its middle row. The dial simplifies (Compact: no minor ticks, min / max or label;
  Micro: no ticks, labels or handle) rather than shrinking detail.
* Reference test: `tests/climate-reference.mjs`; capabilities and HA actions: `tests/climate.mjs`.

## Widget surface (every widget — shared)

One common capability (registry `F.widgetSurface()`, added by `applyCommon` to every widget type — built-in and custom packages; layout
items — Container, Tabbed Container, the radial menu — keep their own surfaces), one runtime (`IniqWidgetKit.surface`, run by the
registry's common runtime on every build: editor preview, dashboard, popups, tabs, nested containers) and one CSS
(components/widget-kit/widget-kit.css). Only the OUTER surface — never the content (buttons, dials, segmented controls, information
tiles, sliders, pictures keep their own looks).

* **Widget background** (`widgetBg`): *Theme* (absent — the widget exactly as it is) · *Transparent* · *Custom opacity*
  (`widgetBgOpacity`, 0–100 %, Slider + Number). When it is not Theme — or a hover reveals the surface — the root's own surface (its
  background, read from its computed theme style and re-read when the widget changes state) is redrawn on `.iq-wsurf__layer` behind
  the content at that opacity, and the root's own paint (background, outer shadow, border colour, backdrop) is removed. The card shadow
  returns only for a mostly opaque surface (≥ 50 %). Corners, clipping and the widget's logical box are untouched: MaisonFit,
  interactions (tap / double tap / long press, controls), the editor's selection outline and handles work exactly as before.
* **Hover effect** (`hover`): *Default* (absent: none) · *None* · *Surface* (reveals / strengthens the surface — `hoverOpacity`) ·
  *Glow* (`hoverGlow`) · *Lift* (`hoverLift`, 0–12 px, a translate: no layout) · *Surface + Lift*; `hoverColor` (token or custom) and
  `hoverMs` (0–600 ms). Decoration only, on a real hover-capable pointer (never a sticky touch hover); never while editing (a widget
  does not lift under a drag); reduced motion: no lift, no transitions (the surface feedback stays). A control under the pointer keeps
  its own hover state — both coexist.
* Copy / Paste style carries it (with corners and the theme override); Duplicate and export / import keep it.
* Reference test: `tests/widget-surface.mjs`.

## Control widgets (the standard Light establishes)

Shared primitives in `components/controls/` (`IniqControls`), configured by shared field builders in the registry (`CONTROL`). They know
nothing of Home Assistant or of what a widget controls: a widget creates them, tells them how they look and what is currently true, and
is told when they are used. Room / Climate / Fan / Media / a standalone control widget use the same primitives — never a copy.

* **Control button** — `IniqControls.button({ label, icon, onPress, role })` → `el.control.update(look, { on, disabled, label })`.
  Look: icon (MDI) · button size · icon size (independent) · style (Filled · Soft · Outline · Bare · Switch — a track with the glyph on its
  sliding knob; its size is the height) · finish (`glow`: a lit, radial surface) · shape (Circle · Rounded · Pill — an icon-only pill is a
  wide capsule; not for a switch) · button colour · icon colour (theme token or custom `#rrggbb`) · state appearance (*Automatic*: on in
  colour, off restrained; *Fixed*: the same colours, on ringed, off dimmed — off is never indistinguishable from on). Configuration:
  `CONTROL.button({ size, icon, styles, noShape, k, when, groups })` (fields in the sections Button · Icon; `k` prefixes the field keys
  when several kinds of control share one item editor) + `CONTROL.normButton`. Placement: `CONTROL.placement({ prop, k, initial })` —
  Automatic or the shared 3 × 3 selector.
* **Segmented control** — `IniqControls.segmented({ label, onSelect })` → `el.control.update({ options: [{ id, icon, label, showLabel,
  color, auto }], height, iconSize, gap, padX, style, shape, inactive, color }, { selected, disabled })`. A radio group (arrow keys); no label
  → no label space; the selected option takes its own colour, else the control's, else the widget's automatic one. Configuration:
  `CONTROL.option(k, { sets, extra })` per option (the widget says what an option may do) + `CONTROL.segmented()` + `normOption` /
  `normSegmented`.
* **Regions** — `IniqControls.regions()` → `{ el, place({ "<row>-<col>": [nodes], "line:<row>": [nodes] }) }`: nine regions and three
  full-width lines; several nodes in one place form a group (`--iqc-rgap`), a region takes the room its empty neighbours leave. The
  widget decides what goes where (its defaults, the owner's placement, its small-size rules). Climate uses it; Light has the same model
  in its own CSS (it can move to this primitive).
* **Information item** — `IniqInfo.fact(item)` (components/info): one value from the shared HA layer with optional label and icon (style,
  alignment, sizes, colour, background, animation while the entity is active). Climate uses it; the Popup hero has the same model in its
  own renderer (it can move to this primitive).
* **Information bar** — `IniqInfo.bar()` (components/info): a collection-level presentation of information items in one row (width,
  alignment, gap, dividers, top divider, background; `fit(limit)` keeps the first items that fit its own width). Domain-free; placed by
  the widget on the shared regions' edge rows (`line:edge-top` / `line:edge-bottom`). Climate is the first user.
* **Momentary buttons** — `IniqControls.button({ role: 'action' })` (− / +): no pressed state; drawn in its colour.
* **Continuous quantity** → the shared Slider + Number (px / % / K). **Discrete choice** → a select or a segmented control.
* A widget may set `--iqc-auto` (its automatic colour) and `--iqc-max` (the largest control its current MaisonFit size allows).
* The collection editor supports controls lists: `removable(item)` / `movable(item)` → false (a fixed primary control), `canAdd(list)`, and
  `context(config)` — what the item editor may know of the configuration (e.g. the entity's capabilities) for its fields'
  `when(item, context)` / `optionsFrom(item, context)`.

## Configurator taxonomy (the rule for every widget)

| Section | Responsibility |
|---|---|
| **Identity** | what the widget IS / connects to: name, primary entity, an Area or profile when fundamental |
| **Content** | what data it displays: secondary entities, Information, mappings, lists |
| **Controls** | widget-specific functional options (brightness behaviour, climate / media controls) |
| **Interactions** | only tap · double tap · long press, navigation / popup |
| **Appearance** | HOW it is presented: variant, title size, alignment, styles, image treatment, overlay, corners |
| **Images** | WHAT picture / icon it uses: None · built-in · upload, fallback icon, its colour, background, animation |
| **Visibility** | conditional visibility |
| **Advanced** | only genuinely advanced options — never a dumping ground |

**Images = which visual asset / icon. Appearance = how it is presented.** Never mixed.
Order: Identity → Content → Controls → Interactions → Appearance → Images → Visibility → Advanced (the registry's
`STANDARD_GROUPS` follows it). Empty sections are not shown. A widget's major collections may be top-level sections of their own
(Room: Room · Information · Scenes · Interactions · Appearance · Images · Visibility; Light: Identity · Interactions · Appearance ·
Images · Visibility). Future widget upgrades adopt this; e.g. Media: Identity · Content · Controls · Interactions · Appearance ·
Images · Visibility.

## Artwork (the shared Image / Artwork picker)

A widget that shows a picture DECLARES its choices; the configurator renders one picker:
`...F.artwork('image', 'Artwork', { builtins: [{ value: '<package asset>', label: 'Pendant' }], group })`.
It offers **None** · the built-ins (thumbnail + name) · **Upload** (the secure IniqDash User Assets; Change / Remove once uploaded —
Remove only stops the widget using it). No path is ever shown. Stored: `image` = a built-in's path, an uploaded asset reference, or
`'none'` (literally no image — never "the default"); with None, an optional `fallbackIcon` `{ icon, color, animation, animateWhen }`
from the shared MDI picker, colour tokens, icon background (`background`: none · subtle · accent — absent = subtle; drawn by
`IniqIcons.background` / `[data-iqi-bg]` in components/icons/icons.css, the glyph alone animates inside it) and icon animation. The widget only decides HOW its variant shows the image, the icon or
nothing (`data-visual`), and closes up when there is nothing.

### IMAGE OWNERSHIP = WIDGET TYPE

An uploaded image is reusable by every instance of that widget type. Images are NOT owned by an individual widget instance, and
are NOT shared globally between unrelated widget types. The picker is generic (form type `artwork`); its image collection is
scoped by the widget type of the form (`light`, `custom.room-scene`, …): the upload records the image in that type's library
(`api/asset_upload.php` field `scope`), and `api/asset_library.php?scope=<type>` lists it for every instance of the type. Built-ins
come from the widget package's own declaration. Storage stays the secure IniqDash User Assets (references only; no paths, no
names). Images uploaded before libraries existed join their type's library when a saved dashboard (or an opened widget) of that
type uses them — nothing is re-uploaded. Applies to every future image-capable widget.

## Visual sizing (the rule for every configurator)

- **A continuous visual quantity → Slider + editable Number + unit** — the ONE shared control (`MaisonForm.rangeControl`, field
  type `range` with `unit`, `min`, `max`, `step`, optionally `auto` + `autoValue`): icon size, value / label / text / font size,
  button size, button icon size, tab height, padding, gap, title scale. The slider is for fast visual adjustment, the number for an
  exact value (typed without the unit); both stay in sync; min / max / step are enforced; the preview follows live while dragging
  and while typing. Numbers are stored (`iconSize: 52`, never `"52px"`). No Small / Medium / Large / XL for these, and no +/− buttons.
  `auto`: the value may stay unset — the widget's own (MaisonFit) size applies, shown as the slider position and "Auto · n".
- **A discrete presentation choice → select / segmented control / buttons**: alignment, style, shape, treatment, distribution,
  visibility, image treatment, animation.
- **A structured position → a structured selector**: e.g. the 3 × 3 placement selector (field type `place9`) instead of separate
  horizontal / vertical dropdowns; never X / Y coordinates.
- Older configurations keep their look: a former size name is read as the number it was drawn with (e.g. a Room title "large" =
  120 %, a Text size "l" = 30 px, a hero value "XL" = 56 px); the number is stored once the owner moves the control.

Migrated to the shared control: Room (title size %, Information icon / value / label size), Light (title size %), Text / Label
(text size), Popup (title size, hero information sizes, each header button's size and icon size, action gap), Tabbed Container
(text, icon, height, padding, gap). Light Switch (a custom package) already used `range` and now gets the number field too.

## Information editor organisation

An Information line (Room Information, Popup hero information) is edited in up to four groups: **Content** = what is displayed
(entity, what to show, label, icon) · **Presentation** = how its text / value appears (style, alignment, value size, label size) ·
**Icon** = how the optional icon appears (only with an icon) · **Position** = where it is placed (only where the surface has a
placement model — the popup hero's 3 × 3 selector). A field or a whole group appears only while it means something.

## Rules

* One DOM tree for all variants; CSS namespaced (`iq-room`, `--iq-room-*`), keyed on `data-variant` × `data-fit-arr` × the Appearance attributes.
* Shared capabilities are reused, not copied: Information collection (`F.info`), MDI icons and their animation (`IniqIcons.fill` / `IniqIcons.animate`, reduced motion in `icons.css`), the collection editor, the area context.
* Nothing is created for the owner: a new widget has no Information and no scenes until they add them.
