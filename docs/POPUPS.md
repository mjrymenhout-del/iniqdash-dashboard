# Popups and the Tabbed Container

## Who owns what

| Part | Owns | Knows nothing about |
|---|---|---|
| **Home Assistant** | the state and the actions | — |
| **Popup** (`components/popup`) | the surface: size, backdrop, header (title, subtitle, icon), header picture, Back / Menu / Close, animation | Home Assistant domains, what its items show |
| **Tabbed Container** (`components/tabs`) | a row of tabs and one content region per tab | Home Assistant, popups, what its tabs hold |
| **Widgets** | their own content and their own Home Assistant entity | where they are placed |

A popup is a **configurable mini-dashboard surface**: its content is ordinary IniqDash items (widgets, Containers, Tabbed
Containers), placed with the same editor, the same grid and the same history as a page. Nothing in a popup is special-cased
for a room, a domain or a category.

## Structure

```
POPUP
├── HERO / HEADER          (the popup's settings)
│   ├── background picture
│   ├── buttons            left region · right region (Back · Menu · Close)
│   ├── title / subtitle
│   └── information        an ordered list of entity values in three slots: left · centre · right
└── CONTENT                (ordinary items, placed on the canvas)
    └── e.g. a Tabbed Container → tabs → ordinary widgets
```

The hero stays in place while the content below it changes (e.g. switching tabs).

## Popup settings (Popups → a popup → Popup settings)

The same configuration modal as every widget (Room is the reference): collapsible sections, the shared collection editor, the
shared searchable MDI icon picker, the shared image picker, a live preview beside the form and a pinned Apply / Cancel footer.

- **Identity**: name (editor lists), title, subtitle.
- **Hero**: show the hero (picture + information; off keeps their settings), show title / subtitle, title position (left /
  centre), title icon, **action gap** (the space between the buttons of a region, 0–40 px) and the order in a region (Back ·
  Menu · Close or Back · Close · Menu).
- **Information**: `+ Add information` — compact rows (`[icon] Label · entity • what · place · style`, Edit, ⋮ Move up /
  Move down / Remove); one line is edited at a time in a focused editor organised in four groups (the INFORMATION EDITOR
  ORGANISATION, shared with Room):
  - **Content** (what is shown): entity, what to show (its state or a value IniqDash reads for it), **Show label** (off: no label
    element and no space kept for one), label (absent: Home Assistant's name), MDI icon (None: no icon and no space);
  - **Presentation** (how its text appears): style (Card · Emphasis · Minimal — Minimal has no surface, e.g. a large value straight
    on the picture), text alignment, **value size** (10–120 px) and **label size** (8–48 px) — sliders with an exact number;
    Automatic follows the style (Card 18 / 12 px, Emphasis a responsive large value / 14 px) — label place;
  - **Icon** (only with an icon — the whole group disappears without one): **icon size** (12–120 px), placement, background,
    colour, value colour, animation, animate when (only with an animation);
  - **Position**: one **3 × 3 placement selector** (top / centre / bottom × left / centre / right) — stored as `slot` + `vslot`,
    never coordinates; several items in one cell sit side by side in list order.
  Every change shows in the live preview at once (the item editor previews before Save; Cancel restores). Sizes are
  independent of each other. Older lines saved with Small…XL read as the px they were drawn with.
  The information area lies below the title and the buttons (an item at top left / top right never runs under them). With a
  picture, each of its rows is at least a third of the area over the picture, so top / centre / bottom are genuinely different
  places; on a narrow popup each row reflows (its centre item on its own line, its left / right items below). Values come
  through the shared Home Assistant layer (the same poll as the widgets); without Home Assistant a value reads "—".
- **Appearance**: picture height, image treatment, overlay strength, title size.
- **Images**: the header picture — None, a built-in picture, or an upload (the popup image library; private uploads are served
  through the authenticated image route, never as paths).
- **Size & layout**: preset, then Desktop and Tablet width · height. Mobile is always a bottom sheet (90 % of the height at most;
  Full screen: the whole screen) with the structured 4-column layout.
- **Interactions**: one section per button — Close (always closes), Back, Menu — each with, while it is on: its icon (the shared
  MDI picker; none: the standard one), **button size** (28–120 px) and **icon size** (12–72 px) — independent sliders —, style
  (Bare · Subtle · Outline · Filled), shape (Circle · Rounded), treatment (Normal · Accent — theme tokens), region (left / right)
  and icon colour. Unset, a button keeps the look older popups had (their former shared button style / size). On a phone a button
  is at most 56 px so the title keeps its room. Back: back to the previous popup (else close), or open a popup / a page. Menu:
  open a popup or a page (the existing action dispatcher). Backdrop, click outside (the popup on the dashboard), Escape. At least
  one way to close is required.
- **Animation**: entry, exit, speed.

Everything is structured data (`config.heroInfo`, `backIcon`, `closePlace`, …): no raw HTML, CSS or coordinates. Colours are
design-token names; the accent follows the theme.

## Configuration modals: the dismissal rule

Every configuration / editor modal (widget Add / Edit — Room, Light, any widget —, Container and Tabbed Container settings, Popup
settings, notification templates, the item editor of a collection, the editor's other dialogs) closes **only** by an explicit
action: Apply (applies and closes), Cancel / Close (closes without applying), or Escape (= Cancel, never Apply). A click outside
it does nothing. Inside, a picker or an item editor is its own layer: using it, or clicking outside it, never closes the
configuration behind it. Enforced once, in the shared modal shell (`MaisonConfigure.modal` / `MaisonConfigure.guard`).

## The Tabbed Container

A layout item like the Container (Add → Containers → *Tabbed container*), usable on a page, inside a Floating Container,
or in a popup. Its configuration is a list of tabs (the shared collection editor: add, rename, reorder, remove), each with
a label, an optional MDI icon (the shared picker; no icon → no space for one) and an optional short badge.

Its **Appearance** (it belongs to the Tabbed Container — the same on a page, in a floating container or in a popup):
text size (10–36 px), icon size (10–56 px), tab height (26–100 px), horizontal padding (2–60 px), gap (0–40 px) — sliders with an
exact number —; alignment (left · centre · right), distribution (Content · Equal · Fill), style (Pill · Rounded · Minimal),
selected tab (Outline · Soft · Filled), other tabs (Surface · Outline · Minimal), badges (Accent · Subtle), tab bar (Top ·
Bottom) and the surface (none / panel). All colours are theme tokens — no colour pickers.

- Each tab is an ordinary nested grid of ordinary items (`item.tab` records the tab; an item without one belongs to the
  first tab). No free positioning, no per-domain tab types: "Active", "Lights" or "Upstairs" are just labels the owner chose.
- Viewing: switching tabs is immediate (every tab is built once; the component only shows and hides regions) and never
  moves an item.
- Editing: one tab is edited at a time. Press a tab on the canvas (or pick it in the panel's *Editing tab* menu); adding,
  pasting or moving into the container places items in that tab. Pressing a tab while editing never runs a Home Assistant
  action.
- Removing a tab removes its items (one Undo restores both). Duplicating or copying a Tabbed Container copies it with its
  tabs but without its items, like a Container.
- Accessibility: `tablist` / `tab` / `tabpanel` roles, `aria-selected`, Left / Right / Home / End move between tabs,
  Enter / Space select, a visible focus ring. A tab row wider than its container stays one row and scrolls sideways (touch,
  trackpad, mouse wheel); the selected tab is scrolled into view; the page never scrolls with it.

## Rooms and popups

The Room widget stays a separate widget. It can open a popup through its ordinary *Tap → Open popup* interaction; the
popup does not know it was opened by a room.

## Reference

`tests/lib/room-popup.mjs` builds a dining-room popup (header picture, Back / Menu / Close, three hero information lines —
humidity card left, large temperature centre, lights-on card right —, a Tabbed Container with Active / Lights / Heating / Media /
Security / Sensors tabs of ordinary widgets) purely as data, reading demo entities of the test's fake Home Assistant (no real
entity, no credential). `tests/popup-settings.mjs` configures the same hero through the real Popup Settings UI and verifies the
runtime, the responsive hero and the dismissal rule; `tests/popup-hero-info.mjs` measures label / icon visibility, the independent
sizes and the 3 × 3 placement; `tests/visual-sizing.mjs` drives every Slider + Number (hero information, hero buttons, tabs on a
popup and on a page, Room, Light, Text) and the 3 × 3 selector in the real UI; `tests/popup-v2.mjs` verifies the tabs end to end.

## Limitations

- Badges are static text (not computed from Home Assistant).
- Tabs cannot be individually hidden or duplicated; there is no per-tab visibility.
- A Tabbed Container cannot hold another Container or Tabbed Container (one level of nesting, as for Containers).
- Back keeps only the in-session chain of popups opened from popups.
- A hero information line shows one entity's value. A derived figure such as "0/1 lights on" comes from a Home Assistant entity
  that provides it (e.g. a template or group sensor) — the popup computes nothing.
- Inside a button region Back comes first; Menu and Close can be swapped.
- Per-tab icon size and per-tab colours are not offered (the icon size is the container's; colours are the theme's).
- Menu and Back actions are the existing dispatcher's popup / page requests.
