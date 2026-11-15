# Custom (drop-in) widget packages — the contract

A custom widget is a folder. Copy it into `widgets/custom/` (standalone: `widgets/custom/<widget>/`, or inside a collection folder) and reload the editor: the server discovers it,
validates `widget.json`, the editor adds it to **Add Widget**, and it can be added, configured, saved and reloaded. **No core file names it.** Remove it by deleting the folder.
Custom widgets are *presentation code*: they never hold the Home Assistant token, never call Home Assistant, and never choose a service.

```
widgets/custom/<widget>/widget.json   manifest (schema 1)            ← validated by server/WidgetPackages.php, strictly
                        <entry>.js    defines the global named in "api": create(config), constraints(), define({ F, manifest })
                        <style>.css   the widget's own styles (namespace them: .iq-<name>, --iq-<name>-*, container names iq-*)
                        assets/       the package's own files (served under widgets/custom/…/assets/)
```

## Manifest (`widget.json`)
`schema` 1 · `id` `custom.<folder>` · `name` · `source` `"custom"` · `version` x.y.z · `entry` · `style` · `assets` `"assets/"` · `api` (global name) · `category`? · `basedOn`? · `ha`?
Unknown keys, wrong types, path tricks, symlinks, oversize files, duplicate ids / apis are refused with a reason; a rejected package never stops the others.

## Home Assistant — three ways to declare what the widget needs (`"ha"`)

### 1. No `ha`: a static / demo widget.

### 2. Single-entity bindings (unchanged, fully supported)
`"ha": { "binding": "entity" | "gauge" | "sensor" | "text", "domains": […], "deviceClasses": […], "actions": […] }`
The widget receives ONE normalised entity (`config.haEntity`, `el.haEntity(entity)`), and — when `actions` is declared — `config.haRequest(action)`.
Existing packages need no change.

### 3. Roles binding — several named entities and named action slots (new)
```json
"ha": {
  "binding": "roles",
  "roles": {
    "<role>": { "label": "Temperature", "domains": ["sensor"], "deviceClasses": ["temperature"], "required": false },
    "<role>": { "label": "Light", "domains": ["light"], "multiple": true, "max": 8 }
  },
  "actionSlots": {
    "<slot>": { "label": "Scene", "domains": ["scene", "script", "button", "input_button"], "actions": ["trigger"], "max": 5, "section": "Scene {n}" }
  }
}
```
* **Role names and slot names are the package's own** (`^[a-z][a-z0-9_]{0,29}$`, at most 12 roles / 6 slots, unique). The core knows none of them.
* **Cardinality:** a role is one entity (default) or `multiple` (2–20, `max`). A slot has `max` positions (1–8); position *i* is the widget's *i*-th control.
* **Constraints:** `domains` (required), `deviceClasses` (optional entity-picker filter), `required`, `label`. The configuration form is **generated**: one entity picker per single role,
  up to `max` pickers per multiple role (shown as the previous one is filled), one picker per slot position (placed in the package's own section when it uses `section` names).
  Values are stored in `config.haRoles.<role>` (an id, or a list) and `config.haSlots.<slot>` (a list; a gap stays a gap). They are cleaned against the declaration (known roles / slots,
  declared domains, declared cardinality) on every normalisation and validation.
* **Action slots** may only declare actions from the server's fixed table (`WidgetPackages::ACTIONS`): `light` / `switch` / `fan` → `turn_on`, `turn_off`; `scene` / `script` → `trigger`
  (→ `turn_on`), `button` / `input_button` → `trigger` (→ `press`). Every action must be allowed for *every* declared domain. Anything else is refused at discovery.

### Runtime (what the widget gets)
`config.haState` when it is created and `el.haState(state)` on every change (implement it on the root element):
```
{ roles: { <role>: entry | [entry…] | null }, slots: { <slot>: [entry | null …] } }
entry = { entity, status: 'loading' | 'missing' | 'ready', state: { id, domain, name, state, available, unit, changed, updated, reported, attrs } | null }
```
Every mapped entity joins the shared state poll — the widget never polls. **Aggregation is the widget's job** (a "3 of 5 lights on" summary is computed by the package from the lights' states; the core
has no idea what it means).
`config.haRequest({ slot, index, action })` → `Promise<{ ok, error? }>` — the widget names a slot, a position and a declared action; **never an entity, a domain or a service**.
The host checks: declared slot · position inside the configured entities · declared action · entity of a declared domain · entity available · not a configuration preview. The request goes
through the existing secure path (`IniqHA.call` → `api/ha_call.php`: session, CSRF, same origin, the package id); **the server re-checks the declaration** (`WidgetPackages::declares`) and plans the
fixed HA service (`HaService::plan`). There is no optimistic state: the widget shows what Home Assistant reports next.

## Security boundaries
* No token, credential, endpoint or filesystem path reaches package code; states are the normalised entity the server already serves to widgets.
* No arbitrary service call exists: the server's action table is the allow-list; a package can only *narrow* it per slot.
* A request is domain-level (the same granularity as the single-entity channel): a package that declares `scene → trigger` can trigger any scene the server lets its user reach, not only the configured ones.
* Custom widgets are **not sandboxed** (ordinary same-origin JavaScript). Do not install packages you do not trust. This contract does not make that better or worse; it adds no new authority.

## Compatibility
`binding: roles` is additive. Packages without it (e.g. the development examples Battery Status, Light Switch, Neon Temperature Gauge, Sunrise / Sunset in `tests/fixtures/custom/testme/` — a test fixture, not shipped) load and behave exactly as before; the single-entity action list
now also accepts the stateless `trigger` domains, which no existing package declares.

## Tests
`php tests/packages.php` (manifest validation, incl. every malformed roles / slot case and `declares()`), `node tests/custom-roles.mjs` (a fixture with unrelated roles + a switch slot:
generated fields, cleaning, live states, secure actions, server re-check, persistence), `node tests/room-dropin.mjs` (Room / Scene as the acceptance package: the full drop-in lifecycle with live mappings and actions).
