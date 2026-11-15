# Room / Scene widget (custom package)

`widgets/custom/room-scene/` — a drop-in custom widget package (id `custom.room-scene`). Install = copy that folder into `widgets/custom/` and reload; remove = delete it.
No core file names it (`tests/custom-roles.mjs` asserts that no production core file contains its id or folder). It is a *consumer* of the generic custom-widget contract: see [CUSTOM-WIDGETS.md](CUSTOM-WIDGETS.md).

* **Variants** (Appearance → Variant): *Hero* (default, the original card: large · normal · compact · horizontal · micro), *Compact card*, *Status*, *Minimal* — each with its own micro · compact · normal · large composition for the widget's own size (MaisonFit). Appearance choices: content alignment, image treatment, overlay strength (Hero), Information style, scene style, title size — offered per variant. Reference pattern: [WIDGET-REFERENCE.md](WIDGET-REFERENCE.md).
* **Home Assistant, declared in `widget.json`** (`"ha": { "binding": "roles", … }`):
  * role `lights` — several `light` entities (up to 8): the package derives `X / Y lights` and "X lights on" from their states;
  * role `temperature` — one `sensor` (device class temperature): shown with the entity's own state and unit;
  * role `air_quality` — one `sensor`: shown exactly as the entity reports it (`28 AQI`, or its own word) — nothing is invented;
  * action slot `scenes` — up to five `scene` / `script` / `button` / `input_button` entities, action `trigger` only. A press goes through the secure channel; the server plans the service.
* **A scene button is shown active only** while HA says its entity is a running script; otherwise a press is a short feedback (about 1.4 s) — never a remembered scene.
* **Package configuration:** room name, picture (IniqDash User Assets upload or the bundled demo; never base64), the page the chevron opens, an optional "Devices ›" page (Large), captions, scene labels and icons.
  The entity mappings and scene entities are generated from the manifest by the generic host.
* **Without Home Assistant** (local demo, no mappings) the card shows only what is configured: name, picture and scene buttons — no invented values.

## Configurator (the reference)

**Room** (name, Home Assistant Area) · **Information** (a collection; each line: Content — entity, what to show, Show label, label,
icon · Presentation — value size, label size · Icon — icon size, background, animation, colour; sizes are the shared Slider + Number,
Automatic = the card's own size) · **Scenes** (a collection — no fixed slots; each scene: **Action** — label, the scene / script /
button it runs · **Appearance** — icon, Show label, style Theme / Filled / Soft / Outline / Bare, shape Rounded / Circle / Pill, button
colour and icon colour (a theme colour or a custom colour), button size 28–120 px, icon size 12–72 px) · **Interactions** (the CARD's
Tap / Double tap / Long press — never a scene button) · **Appearance** (variant-relevant: content alignment, image treatment and
overlay (only with a picture), Information style, scene presentation, scene alignment, scene gap, title size %) · **Images** (None ·
built-in · the Room image library / upload; without a picture, an optional fallback icon) · **Visibility**.

A scene's own appearance is stored on the scene (`scenes[i] = { label, icon, style, shape, color, iconColor, size, iconSize,
showLabel }`, its entity stays in `haSlots.scenes[i]`); absent, the scene keeps the theme's button for the variant and size. Its
colour and style follow it into every arrangement and the scene panel; its size is honoured on Normal / Large and capped on Compact.
`tests/room-reference.mjs` drives all of it in the real editor.

## Opening a popup

A Room card can open a popup with its ordinary *Tap → Open popup* interaction. The popup (a configurable mini-dashboard surface, see [POPUPS.md](POPUPS.md)) stays separate: it does not know which room opened it, and the Room widget does not build popup content.
