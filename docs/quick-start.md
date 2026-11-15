# Quick start — the first ten minutes

You have installed INIQDASH ([installation.md](installation.md)) and finished the wizard. Here is what to do next.

## Look around

- **Pages** are in the navigation dock (left on a computer, at the bottom on a phone): Home, Lights, Climate, Rooms, Energy, Security.
- **Tap a room card** on the Rooms page: a popup opens with only the tabs that room needs (Active, Lights, Heating, Media, Security,
  Sensors). Lights switch, thermostats change, players play — the actions go to your Home Assistant.
- **The round button** in the corner opens the radial menu: quick jumps and actions.
- If you chose the demo, everything you see is a **simulated home** (a "Simulated home" badge says so). Nothing reaches a real
  Home Assistant; each signed-in browser gets its own simulated home.

## Change something

1. **Open the editor:** rest the pointer in the **top-right corner** for 2 seconds (on a touch screen, press and hold there), then
   choose **Edit**. (You can make the Edit button always visible in Dashboard settings → Editing.)
2. Click a widget to select it: **Edit configuration** changes what it shows and how it looks; drag it to move, drag a corner to resize.
3. **Add** opens the widget gallery: pick a widget, choose its entity, place it.
4. **Done** saves. **Undo** / **Redo** are always there while editing.

The editor in detail: [widget-editor.md](widget-editor.md).

## Connect Home Assistant later

If you started with the demo: **Edit → More → Home Assistant connection…**, enter the address and a long-lived access token
([home-assistant.md](home-assistant.md)), **Test connection**, **Save**. Then generate a dashboard of your own home:
**Edit → More → Dashboards… → Generate from Home Assistant…** ([dashboard-generator.md](dashboard-generator.md)).

## Make it yours

- **Appearance** of any widget (gradients, pictures, borders, glow): the widget's configuration → *Appearance*.
- **A theme** for the whole dashboard: **Edit → More → Themes…**.
- **Your own widget**: **Edit → Widget Studio** ([widget-studio.md](widget-studio.md)).
- **Several dashboards** (a wall tablet, a phone): **Edit → More → Dashboards…**.
