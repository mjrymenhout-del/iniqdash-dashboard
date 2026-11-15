# The dashboard generator

The generator builds a complete, editable dashboard from your Home Assistant: it reads your **areas**, **devices** and **entities**
and lays them out with INIQDASH's own design — the same design as the demo. Everything it makes is a normal dashboard of standard
widgets: change, move or remove anything afterwards.

**Where:** step 3 of the installation wizard, or **Edit → More → Dashboards… → Generate from Home Assistant…**. A new dashboard is
created each time; existing dashboards are never overwritten.

## What you choose

- **Rooms** — the Home Assistant areas to include (each becomes a room card and a room popup).
- **Pages** — Home, Lights, Climate, Rooms, Energy, Security (pages without matching devices are not made).
- Options for photos, the notification centre, the radial menu and a page for entities that belong to no area.

## The pages

| Page | Contents |
|---|---|
| **Home** | who is home, weather, heating (all thermostats together), the living rooms' temperatures, lights that are on, energy now, the alarm, open doors and windows, your devices, the playing media player, notifications, scenes |
| **Lights** | every light as a compact card (the room name is added when a light's name alone is ambiguous), with scenes on top |
| **Climate** | the main thermostat (the living room's) as a dial, the other thermostats, fans and humidifiers in "My devices", unavailable units as one compact "Not responding" list, room temperatures and humidity |
| **Rooms** | a photographic card per room (temperature, humidity, lights on); a tap opens the room popup |
| **Energy** | the house energy flow (solar, grid, battery; gas and water when flow-rate sensors exist), power use per device, energy charts |
| **Security** | the alarm, doors, windows, leaks and motion, locks, cameras, recent activity |

**Room popups** show only the tabs the room needs — Active (what is on, other switchable devices), Lights, Heating, Media, Security,
Sensors — in a compact layout on computers, tablets and phones.

## Which entities are used

A single appliance can expose dozens of entities (firmware, signal strength, child lock, LED, identify button…). The generator shows your
**devices and the readings that matter**, not everything that exists:

- **Left out:** entities Home Assistant marks as *diagnostic* or *configuration*, entities you **hid** in Home Assistant, a device's
  settings (a speaker's bass, a thermostat's child lock), technical sensors (signal, voltage, firmware, uptime), service integrations,
  robot-vacuum maps, and light or switch **groups** whose members are already shown.
- **Unavailable devices:** left out, except important ones — heating, locks, the alarm, smoke and leak sensors — which stay visible so
  you notice them.
- **Room readings:** temperature, humidity, light level, air quality, power and energy of a room's own devices. A meter without a
  control (an inverter, a utility meter) belongs on the Energy page, not in a room.
- **Counts:** rooms count **devices**, not entities.

When Home Assistant's registry cannot be read (an older version, or a user without access), the same rules work from entity types and
names. Whatever was left out stays available in the editor: every widget lets you pick any entity.

## Getting improvements later

A generated dashboard is saved as it was generated. When a new version of INIQDASH improves the generator, generate a new dashboard
to get the improvements; your existing dashboards stay as they are.

## Not yet perfect (beta)

- The choices are made from Home Assistant's data and from names; check the result and adjust it — that is what the editor is for.
- Tested with simulated installations of up to 18 areas and 330 entities. Please report what the generator gets wrong for your home.
