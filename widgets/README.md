# Built-in widgets (inventory)

Source of truth: `components/editor/registry.js` (types, variants, fields) and `widgets/default/<id>/widget.json` (packages).
`widgets/index.js` is generated (`php server/build-widget-index.php`).

Architecture: **TYPE → VARIANT → MAISONFIT**. A variant is a presentation chosen in the configuration (`config.variant`); MaisonFit adapts
the layout to the widget's own logical box. Resizing never changes the variant; changing the variant never touches the entity, the size
or any other setting. A control exists only when the linked Home Assistant entity reports the capability.

Status columns — **implemented** (in the code) · **mock-tested** (browser tests against fixtures produced by the real `HaService`, and
server action tests; see `tests/README.md`) · **real HA** (what still needs a real Home Assistant, see the checklist at the end).

| Type (category) | Variants (default *) | Notes |
|---|---|---|
| Light (Controls) | Artwork*, Tile, Compact, Slider | on/off, brightness, colour temperature (reported kelvin range), hue swatches, effect (reported list) |
| Switch, Fan, Action, Lock, Alarm, Button | — | existing widgets |
| Number & Select (Controls) | Slider*, Stepper, Options, Compact (depends on the entity) | range / options from the entity |
| Entity List (Controls) | — | rows = entity + optional label + what to show; a control only for light / switch / fan / input_boolean, cover (open and close), scene / script / button |
| Cover (Controls) | Window*, Garage / Gate, Compact, Slider | garage / gate / door picture from the HA device class only |
| Climate (Climate & Environment) | Dial*, Horizontal, Compact, Minimal | preset, fan, swing, target humidity, low / high range — each only when reported |
| Sun & Moon (Climate & Environment) | Sky*, Times | sun.sun data; moon phase / moonrise / moonset ONLY from entities you map |
| Weather | — | existing |
| Sensor (Sensors & Data) | Standard*, Value, Status, Level, Mini Graph | Level needs a real range; Mini Graph = real HA history |
| Gauge, Chart | — | existing |
| Media player (Media) | Artwork*, Compact, Mini Bar | progress, shuffle, repeat, power only when reported |
| Camera (Security) | Picture*, Doorbell | Doorbell = chips from mapped doorbell / motion / lock / battery entities; enlarge dialog; no recording; no power control (a camera's HA state does not report on/off) |
| Energy Flow (Energy) | Flow*, Compact | display of mapped HA values only; nothing calculated |
| Appliance (Appliances & Robots) | Artwork*, Compact (Washing Machine profile) | profile ≠ variant |
| Robot (Appliances & Robots) | Standard*, Compact, Status | Vacuum / Mower profile from the entity domain; no maps |
| Person (People) | Portrait*, Row, Compact, Status | optional tracking device line + battery ring; never coordinates |
| Date & Time (Time & Calendar) | Digital*, Analogue, Date | the browser's clock or one IANA zone; no backend |
| Timer (Time & Calendar) | Ring*, Compact | time left = HA's finish moment |
| Calendar, Text, Image, Radial, Container, Floating | — | existing |

## Not implemented on purpose
Camera power; maps for robots; moon / sun calculations; energy balancing; anything that is Home Assistant's job.

## REAL Home Assistant verification still required
Nothing in this table has been run against a real Home Assistant; everything above is mock-tested at most.
Vacuum · Mower · Light colour / effects · Cover / garage / gate · Climate advanced capabilities · Media controls · Timer timing ·
Camera / Doorbell · Person / device_tracker · Washing Machine · Energy Flow · Sun & Moon mapped entities · Number & Select.
