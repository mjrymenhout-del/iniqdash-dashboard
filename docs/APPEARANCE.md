# Appearance — styling standard widgets

Every standard widget with a card has the same **Appearance** section in its configuration (Edit → select a widget → Configure →
Appearance). Nothing here needs code or Widget Studio: it is part of the widget's saved configuration, so it survives save, reload,
export and import, and works at every size and on every screen.

## Presets

**Preset** applies a ready-made look in one step. You can then change any single setting.

| Preset | Look |
|---|---|
| Glass | a translucent card with a fine white border |
| Midnight gradient | a deep blue-to-black gradient |
| Ember | a warm orange gradient with a glow and white text (for something that is on or active) |
| Sunlit | a yellow gradient with a glow and white text |
| Aurora | a radial blue gradient with a blue border and glow |
| Outline | no background, a border only |
| Photo card | a picture behind the content, darkened towards the bottom |
| Theme (reset) | removes every Appearance setting: the card follows the dashboard's theme again |

## Settings

| Group | Settings |
|---|---|
| **Background** | *Theme* (default) · *Transparent* · *Opacity* (the theme's card at 0–100 %) · *Solid colour* · *Gradient* (from / via / to colours, linear with an angle or radial) · *Image* |
| **Image** | a bundled picture (rooms, garden, house, lights, fireplace), an uploaded one, or a widget asset · *Fit* cover or contain · *Position* · *Overlay* 0–90 % darkening, even or towards the bottom / top |
| **Border** | width 0–4 px, colour, solid / dashed / dotted |
| **Shadow** | none, soft, strong, inner |
| **Glow** | strength 0–100 and colour |
| **Text** | *Light* or *dark* text on a coloured or pictured card |
| **Accent** | the colour the widget uses for its active parts (a slider's fill, a selected button) |
| **Hover** | the existing hover lift and highlight |

Corner radius, opacity of the whole card and the visibility rules are in their own existing sections.

## Widget-specific styling

Some widgets have more options of their own, also in their Appearance section:

| Widget | Options |
|---|---|
| **Chart** | line thickness, smooth curve, area fill strength, bar width and corner radius, strength of earlier bars, a second colour for a gradient, glow |
| **Climate** | dial design (spectrum, minimal, arc, full, digital, knob), size, heat / cool / idle colours, gradient ring, thickness, glow arc, ticks, value size |
| **Gauge** | style, thresholds, colours |
| **Tabbed container** | tab sizes, shapes, alignment, surface |
| **Room / Scene** | image treatment, overlay, information and scene styles, title size |

## New and improved widgets

- **Who's home** (`presence`, new): the people you choose (person or device-tracker entities) as avatars with a presence ring — green at home,
  blue in a zone, grey away — and "N of M home". Variants: a row of avatars, or a list. Without Home Assistant it shows demo people.
- **Notification centre** (`inbox`): a new **List** variant puts the notification centre on the dashboard itself (the newest entries,
  "N new", "Mark all as read"); the **Bell** variant is unchanged.
- **Chart**: the styling options above.
- **Activity log** (`activitylog`, new): a timeline of what changed last among the entities you choose — an icon, what happened ("Door
  opened", "Light turned on"), the name and area, and when; the newest are marked. An optional link opens a popup or a page.
- **Spotlight** (`spotlight`, new): the events of a calendar one at a time, large — "1 of 3", previous / next, automatic advance,
  a category chip, a picture per event chosen by simple rules (e.g. "waste" → a bin picture, "birthday" → a cake), a corner button.
- **Device tile** (`devicetile`, new): one light, switch, fan, thermostat or speaker as a square tile: its state in words, a switch,
  a coloured icon, the name and how long it has been in that state.
- **Readings** (`readings`, new): up to eight values in one card, each with a coloured bar, in one to four columns.
- **Room tile** (`roomtile`, new): a room as a photo card — humidity and lights-on chips, a large temperature, a coloured icon, the
  name and a subtitle; a tap opens its popup or a page.
- **Climate**: a new **knob** dial design (outer ticks, a cool-to-warm gradient arc).
- **Action**: two new looks, **Scene** (a large round icon) and **Pill** (a capsule), and an icon colour.
- **Energy flow**: a new **House** layout — a picture of the house in the middle, the sources on either side, joined by elbow connectors.

## Limits

- Colours are chosen per widget; there is no shared palette yet beyond the theme's tokens.
- Image backgrounds accept bundled pictures, uploaded pictures (User Assets) and widget assets — not arbitrary web addresses.
- Typography (font, sizes, weight) follows the theme and each widget's own size rules; the Appearance section sets light or dark text only.
- The appearance is the same on every screen size; a widget's own layout adapts to its size.

## Tests

`tests/appearance.mjs` changes the appearance of widgets **through the configuration dialog** (preset, gradient, picture, glow, border,
text tone), saves, reloads, reopens the dialog, resizes with the keyboard and checks that neighbours and an older widget are unchanged.
`tests/widget-surface.mjs` covers the background modes on every widget type.
