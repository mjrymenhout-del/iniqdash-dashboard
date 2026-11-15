/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqGenerateDemo — a dashboard IN THE OFFICIAL DEMO'S DESIGN, filled with the user's REAL Home Assistant entities.

   The same pages as the demo (Home · Lights · Climate · Rooms · Energy · Security — each only when it has something real to show), the
   demo's theme, grid, navigation, radial menu and notification centre, and — like the demo — ROOMS AS HERO CARDS: every chosen area is a
   photo card (temperature, humidity, lights on) whose tap opens the ROOM POPUP: the room's header and up to six tabs of ordinary widgets
   (Active · Lights · Heating · Media · Security · Sensors — only the tabs the room has something for; no empty tab is made). Every widget is a normal, editable standard widget.

   What goes where is decided from Home Assistant's own METADATA — the entity's domain, its device class, its area (or its device's) —
   never from its name (names are only used for the room photo / icon and, as an editable suggestion, the Energy flow's roles).
   Nothing is simulated: no demo value is ever shown as a reading; a missing reading stays empty.

   IniqGenerateDemo.build(discovered, R, opts) → { dashboard, summary }
     discovered = { entities: [{ id, domain, name, state, unit, dc, areaId }], areas: [{ id, name }] }   (api/ha_entities.php)
     opts = { name, areas: [area ids] (default every area with something), exclude: [entity ids], pages: { lights, climate, energy, security }
              (default true), notify (true), radial (true), unassigned: 'skip' | 'page' (default 'skip'), photos (true),
              template: the demo dashboard (its theme and grid are reused; without it: IniqDash's default look) }
   The result is not yet validated as a whole: the caller validates it and creates it in ONE call (nothing half-made).
   ========================================================================== */
(function (global) {
  'use strict';
  const G = () => global.IniqGenerate;
  const PH = (k) => `assets/img/photos/${k}.jpg`;
  const ID_OK = /^[a-z0-9_]+\.[a-z0-9_]+$/;

  /* ---- classification: domain + device class (Home Assistant's metadata) */
  const SEC_DC = ['door', 'window', 'garage_door', 'opening', 'motion', 'occupancy', 'presence', 'moisture', 'smoke', 'gas', 'safety', 'tamper', 'vibration', 'lock', 'carbon_monoxide'];
  const ATTN = { door: ['mdi:door-open', 'danger'], garage_door: ['mdi:garage-open', 'danger'], window: ['mdi:window-open-variant', 'warning'], opening: ['mdi:door-open', 'warning'],
    motion: ['mdi:walk', 'warning'], occupancy: ['mdi:account', 'warning'], presence: ['mdi:account', 'warning'], moisture: ['mdi:water-alert-outline', 'danger'], smoke: ['mdi:smoke-detector-alert', 'danger'],
    gas: ['mdi:gas-cylinder', 'danger'], carbon_monoxide: ['mdi:molecule-co', 'danger'], safety: ['mdi:alert', 'danger'], tamper: ['mdi:shield-alert-outline', 'warning'], vibration: ['mdi:vibrate', 'warning'], lock: ['mdi:lock-open', 'warning'] };
  const SENSOR_ICON = { temperature: 'mdi:thermometer', humidity: 'mdi:water-percent', illuminance: 'mdi:brightness-6', power: 'mdi:flash-outline', energy: 'mdi:lightning-bolt', battery: 'mdi:battery-50',
    pressure: 'mdi:gauge', co2: 'mdi:molecule-co2', pm25: 'mdi:blur', pm10: 'mdi:blur', voltage: 'mdi:sine-wave', current: 'mdi:current-ac', carbon_dioxide: 'mdi:molecule-co2', volatile_organic_compounds: 'mdi:air-filter',
    signal_strength: 'mdi:wifi', gas: 'mdi:fire', water: 'mdi:water' };
  /** which tab of a room an entity belongs in (null: not shown in a room) */
  function tabOf(e) {
    const d = e.domain;
    if (e.role === 'meter') return null;
    if (d === 'camera' && /map/i.test(`${e.id} ${e.name}`)) return null;   // a robot vacuum's map is not a security camera
    if (d === 'light') return 'lights';
    if (['climate', 'water_heater', 'humidifier', 'fan'].includes(d)) return 'heating';
    if (d === 'media_player') return 'media';
    if (['lock', 'camera', 'alarm_control_panel', 'siren'].includes(d)) return 'security';
    if (d === 'binary_sensor') return SEC_DC.includes(e.dc) ? 'security' : 'sensors';
    if (d === 'sensor') return e.dc === 'enum' || e.dc === 'timestamp' || e.dc === 'date' ? null : 'sensors';
    if (['switch', 'input_boolean', 'cover', 'vacuum', 'lawn_mower', 'valve'].includes(d)) return 'devices';
    return null;
  }
  const ACTIVE_DOMAINS = ['light', 'switch', 'input_boolean', 'fan', 'media_player', 'climate', 'cover', 'vacuum', 'lawn_mower', 'humidifier', 'water_heater'];

  /* ---- a room's look: a shipped photo / icon / colour from its NAME (only the look — never what goes in it) */
  const LOOKS = [
    [/living|lounge|salon|séjour|sejour|woon|wohn|family|tv/i, 'living', 'mdi:sofa-outline', 'purple'],
    [/kitchen|cuisine|keuken|küche|kuche|cocina|cucina/i, 'kitchen', 'mdi:stove', 'orange'],
    [/dining|salle à manger|salle a manger|eet|ess/i, 'dining', 'mdi:silverware-fork-knife', 'green'],
    [/bed|chambre|slaap|schlaf|dormitorio|camera da letto|nursery|kids|enfant/i, 'bedroom', 'mdi:bed-outline', 'purple'],
    [/bath|salle de bain|salle d.eau|badkamer|\bbad\b|baño|bagno|shower|douche|toilet|wc/i, 'bathroom', 'mdi:shower', 'blue'],
    [/office|bureau|kantoor|büro|buro|study|werk|desk/i, 'office', 'mdi:monitor', 'pink'],
    [/garden|jardin|tuin|garten|yard|terrace|terrasse|patio|outside|outdoor|buiten/i, 'garden', 'mdi:pine-tree', 'green'],
  ];
  const lookOf = (name, i) => { const m = LOOKS.find(([re]) => re.test(name)); return m ? { photo: m[1], icon: m[2], color: m[3] } : { photo: null, icon: 'mdi:door', color: ['purple', 'orange', 'green', 'pink', 'blue'][i % 5] }; };

  /* ---- WHICH ENTITIES ARE WORTH SHOWING. One appliance can expose dozens of entities (firmware, signal strength, child lock, LED,
     identify button…); a room must show its devices and its useful readings, not every entity that happens to share its area.
     Home Assistant's registry decides first (the server adds it when it can be read): hidden by the user, category config / diagnostic,
     a service rather than a physical device. Without the registry (or for what it does not mark) the domain, device class, state class
     and the entity's own id / name decide — conservatively: when in doubt, an entity is left out of the dashboard and stays available
     in the editor (and through "Include technical and unavailable entities"). Nothing in Home Assistant is changed. */
  const TECH_RE = /(^|[_\s.-])(rssi|linkquality|link_quality|lqi|signal|wi-?fi|ssid|firmware|fw|version|uptime|last_(restart|seen|boot|update|reset|changed)|ip(_address)?|mac(_address)?|cloud|connect(ed|ion|ivity)?|debug|diagnostic|restart|reboot|identify|ping|heap|cpu|processor|memory|ram|disk|swap|status_code|error(_code)?|ota|update_available|zigbee|zwave|z-wave|mqtt|api|token|latency|load|rx|tx|bssid|channel|node|protocol|reachab)/i;
  const CONFIG_RE = /(^|[_\s.-])(child_?lock|lock_child|led|indicator|beep|buzzer|sound|auto_?off|power_on|power_outage|calibration|sensitivity|config|setting|threshold|offset|delay|timeout|interval|duration|schedule|away_mode|eco_?temp|boost|window_detection|frost|keypad|backlight|brightness_level|do_not_disturb|loudness|crossfade|night_?(sound|mode)|surround|subwoofer|dialog|bass|treble|export_?limit|power_?limit|fan_speed|power_level)/i;
  const ROOM_SENSOR_DC = ['temperature', 'humidity', 'illuminance', 'carbon_dioxide', 'co2', 'pm25', 'pm10', 'pm1', 'volatile_organic_compounds', 'volatile_organic_compounds_parts', 'aqi', 'pressure', 'power', 'energy', 'moisture', 'battery', 'sound_pressure', 'nitrogen_dioxide', 'ozone'];
  const IMPORTANT_OFFLINE = ['climate', 'water_heater', 'alarm_control_panel', 'lock'];
  const SAFETY_DC = ['smoke', 'gas', 'moisture', 'carbon_monoxide', 'safety', 'heat'];
  const OFF = (e) => e.state === 'unavailable' || e.state === 'unknown';
  /** role of one entity → 'control' | 'reading' | 'security' | 'technical' | 'config' | 'service' | 'hidden' | 'offline' | 'other' */
  function roleOf(e) {
    if (e.hidden) return 'hidden';
    if (e.cat === 'diagnostic') return 'technical';
    if (e.cat === 'config') return 'config';
    const d = e.domain, text = `${e.id.split('.')[1]} ${e.name || ''}`;
    if (['update', 'button', 'number', 'select', 'text', 'input_number', 'input_select', 'input_text', 'input_datetime', 'input_button', 'event', 'image', 'device_tracker', 'remote', 'notify', 'tts', 'stt', 'conversation', 'wake_word', 'assist_satellite'].includes(d)) return 'technical';
    if (d === 'sensor' && ['signal_strength', 'timestamp', 'date', 'enum', 'data_rate', 'data_size', 'frequency', 'duration', 'voltage', 'current', 'power_factor', 'reactive_power', 'apparent_power'].includes(e.dc)) return 'technical';
    if (d === 'binary_sensor' && e.dc === 'tamper') return 'technical';
    if (d === 'sensor' && e.dc === 'temperature' && /(heatsink|internal|interne|board|cpu|chip|core|processor|module)/i.test(text)) return 'technical';
    if (d === 'sensor' && e.dc === 'battery') return Number(e.state) < 20 ? 'reading' : 'technical';   // a battery matters when it is low
    if (d === 'binary_sensor' && ['connectivity', 'update', 'problem', 'running', 'plug', 'power'].includes(e.dc) && !SAFETY_DC.includes(e.dc)) return 'technical';
    if (TECH_RE.test(text) && !['light', 'climate', 'media_player', 'lock', 'cover', 'alarm_control_panel', 'camera'].includes(d)) return 'technical';
    if (['switch', 'number', 'select'].includes(d) && CONFIG_RE.test(text)) return 'config';
    if (e.service && !['weather', 'sun', 'person', 'calendar', 'todo', 'zone'].includes(d)) return 'service';
    if (OFF(e) && !['scene', 'script', 'button', 'input_button', 'event'].includes(d)) {   // a scene / script is "unknown" until first used
      if (IMPORTANT_OFFLINE.includes(d) || (d === 'binary_sensor' && SAFETY_DC.includes(e.dc))) return d === 'binary_sensor' ? 'security' : 'control';
      return 'offline';
    }
    if (['light', 'climate', 'media_player', 'lock', 'cover', 'fan', 'humidifier', 'water_heater', 'vacuum', 'lawn_mower', 'valve', 'alarm_control_panel', 'switch', 'input_boolean', 'siren', 'camera', 'scene', 'script'].includes(d)) return 'control';
    if (d === 'binary_sensor') return SEC_DC.includes(e.dc) || SAFETY_DC.includes(e.dc) ? 'security' : (e.dc ? 'reading' : 'other');
    if (d === 'sensor') {
      return ROOM_SENSOR_DC.includes(e.dc) || ['gas', 'water'].includes(e.dc) ? 'reading' : 'other';
    }
    return ['weather', 'sun', 'person', 'calendar', 'todo', 'zone'].includes(d) ? 'control' : 'other';
  }
  /**
   * classify(entities, opts) → { kept, dropped: { role: count }, groupsDropped }
   *   kept: what the generator may use. opts.advanced: also technical / config / offline entities. opts.include: ids always kept.
   *   A group (a light / switch group listing its members) is left out when every member is kept anyway — one control per light.
   */
  function classify(list, opts = {}) {
    const inc = new Set(Array.isArray(opts.include) ? opts.include : []);
    const keepRoles = new Set(['control', 'reading', 'security', 'meter', ...(opts.advanced ? ['technical', 'config', 'offline', 'other', 'service'] : [])]);
    const dropped = {}, kept = [];
    // DEVICE STRUCTURE: a switch / select / number on a device whose main control is something else (a speaker's loudness, a
    // thermostat's child lock, a stove's eco mode) is a setting of that device; power / energy of a device with no control at all
    // (an inverter, a meter) belongs to the house's energy, not to the room the device happens to hang in
    const MAIN = ['light', 'climate', 'media_player', 'fan', 'vacuum', 'cover', 'humidifier', 'water_heater', 'lock', 'lawn_mower', 'camera', 'alarm_control_panel'];
    const devClimate = new Set(list.filter((e) => e.device && ['climate', 'water_heater'].includes(e.domain)).map((e) => e.device));
    const devMain = new Set(), devCtl = new Set(), roles = new Map(list.map((e) => [e.id, roleOf(e)]));
    list.forEach((e) => { if (!e.device || !['control', 'offline'].includes(roles.get(e.id))) return; if (MAIN.includes(e.domain)) devMain.add(e.device); if (MAIN.includes(e.domain) || ['switch', 'input_boolean', 'valve', 'siren'].includes(e.domain)) devCtl.add(e.device); });
    list.forEach((e) => {
      let r = roles.get(e.id);
      if (r === 'control' && e.device && devMain.has(e.device) && ['switch', 'select', 'number', 'input_boolean'].includes(e.domain)) r = 'config';
      if (r === 'reading' && ['power', 'energy', 'gas', 'water'].includes(e.dc) && !(e.device && devCtl.has(e.device))) r = 'meter';
      // a thermostat's own "open window detected" is its heating logic, not a window contact of the house
      if (r === 'security' && e.domain === 'binary_sensor' && ['window', 'opening', 'door'].includes(e.dc) && e.device && devClimate.has(e.device)) r = 'technical';
      if (inc.has(e.id) || keepRoles.has(r)) kept.push({ ...e, role: r });
      else dropped[r] = (dropped[r] || 0) + 1;
    });
    const ids = new Set(kept.map((e) => e.id));
    let groupsDropped = 0;
    const out = kept.filter((e) => {
      const m = Array.isArray(e.members) ? e.members.filter((x) => x !== e.id) : [];
      if (m.length >= 2 && m.every((x) => ids.has(x)) && !inc.has(e.id)) { groupsDropped++; return false; }
      return true;
    });
    return { kept: out, dropped, groupsDropped };
  }
  /** how many DEVICES a list of entities represents: distinct registry devices; an entity without a device counts once */
  function deviceCount(list) {
    const devs = new Set();
    let loose = 0;
    list.forEach((e) => { if (!['control', 'security', 'reading'].includes(e.role) || ['scene', 'script'].includes(e.domain)) return; if (e.device) devs.add(e.device); else loose++; });
    return devs.size + loose;
  }
  /** a ROOM temperature (not a freezer, a stove's exhaust, a pool or a CPU): the best-scored temperature sensor of the list */
  const NOT_ROOM_T = /(heatsink|internal|interne|freez|fridge|frigo|cong[eé]l|vriez|koel|exhaust|fum[eé]e|flue|smoke|boiler|chaudi|water|eau|pool|piscine|spa|cpu|chip|board|core|soil|probe|sonde|outdoor|outside|ext[eé]rieur|buiten|aussen|battery|batterie|inverter|onduleur|panel|motor|engine|oven|four)/i;
  function roomTemp(list, roomName) {
    const c = (list || []).filter((e) => e.domain === 'sensor' && e.dc === 'temperature' && !OFF(e) && !NOT_ROOM_T.test(`${e.id} ${e.name}`));
    const score = (e) => (roomName && fold(e.name).includes(fold(roomName)) ? 2 : 0) + (/room|pi[eè]ce|ambian|indoor|int[eé]rieur|binnen|thermo/i.test(e.name) ? 1 : 0) - (e.role === 'technical' ? 5 : 0);
    return c.sort((a, b) => score(b) - score(a))[0] || null;
  }
  const fold = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* ---- layout helpers (the demo's grid: desktop 24 columns · tablet 16 · phone 4; rows of 10 px + 18 px gaps) */
  const L = (d, t, m) => ({ desktop: { x: d[0], y: d[1], w: d[2], h: d[3] }, tablet: { x: t[0], y: t[1], w: t[2], h: t[3] }, mobile: { w: m[0], h: m[1] } });
  /** a flowing column layout: put(w, h) places the next item left to right, then on the next row */
  function flow(cols, y0) { let x = 1, y = y0, row = 0; return { put(w, h) { w = Math.min(w, cols); if (x + w - 1 > cols) { x = 1; y += row; row = 0; } const r = [x, y, w, h]; x += w; row = Math.max(row, h); return r; }, br() { if (x > 1) { x = 1; y += row; row = 0; } return y; }, at: () => y + row } ; }
  const fr = (x, y, w, h) => ({ x, y, w, h });
  // inside a room popup's tabs: a 9-column container (a tablet's 8), classic rows
  const TL = (x, y, w, h, mh = h) => { const a = Math.round((x - 1) * 8 / 9), z = Math.round((x - 1 + w) * 8 / 9); return { desktop: { x, y, w, h }, tablet: { x: a + 1, y, w: Math.max(1, z - a), h }, mobile: { w: 4, h: mh } }; };
  const popCfg = (title, subtitle, icon, w, h) => ({ title, subtitle, icon, heroShow: false, size: 'custom', custom: { desktop: { w, h }, tablet: { w: Math.min(w, 740), h } }, closeButton: true, backdrop: true, outsideClose: true, escClose: true, enter: 'scale', exit: 'fade', speed: 'normal' });
  const empty = (t, sub) => ({ variant: 'text', primary: t, secondary: sub, align: 'center', size: 18, emphasis: 'muted', surface: true });
  const clean = (v, n) => { const t = String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
  const slug = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'room';

  function build(discovered, R, opts = {}) {
    const ex = new Set(Array.isArray(opts.exclude) ? opts.exclude : []);
    const pool = classify(((discovered && discovered.entities) || []).filter((e) => e && ID_OK.test(e.id) && !ex.has(e.id)), opts);
    const all = pool.kept;
    const want = (k) => !(opts.pages && opts.pages[k] === false);
    const areasAll = ((discovered && discovered.areas) || []).filter((a) => a && a.id);
    const byArea = new Map();
    all.forEach((e) => { const a = e.areaId || null; if (!byArea.has(a)) byArea.set(a, []); byArea.get(a).push(e); });
    const roomish = (list) => (list || []).filter((e) => tabOf(e));
    // rooms in name order, utility spaces (cellar, garage, laundry, attic, outside) after the living spaces
    const UTIL_ROOM = /cave|cellar|kelder|garage|grenier|attic|zolder|buanderie|laundry|utility|abri|shed|cabane|remise|outdoor|outside|ext[ée]rieur|buiten|garden|jardin|tuin|terrasse|terrace|piscine|pool/i;
    const chosen = areasAll.filter((a) => roomish(byArea.get(a.id)).length && (!Array.isArray(opts.areas) || opts.areas.includes(a.id)))
      .sort((x, y) => (UTIL_ROOM.test(x.name) ? 1 : 0) - (UTIL_ROOM.test(y.name) ? 1 : 0));
    const dom = (d) => all.filter((e) => e.domain === d);
    const sens = (dc) => all.filter((e) => e.domain === 'sensor' && e.dc === dc);
    const pages = [], popups = [], usedPopups = new Set();
    let page = null;
    const newPage = (id, name, icon) => { page = { id, name, icon, nav: true, header: false, items: [] }; pages.push(page); };
    const add = (id, type, config, d, t, m) => page.items.push({ id, type, parent: null, config, layout: L(d, t, m) });
    const title = (id, text) => add(id, 'text', { variant: 'heading', primary: text, secondary: '', align: 'left', size: 'm', emphasis: 'strong', surface: false }, [1, 1, 12, 3], [1, 1, 16, 3], [4, 3]);
    const head = (id, text, sub, d, t) => add(id, 'text', { variant: 'text', primary: clean(text, 60), secondary: clean(sub || '', 60), align: 'left', size: 17, emphasis: 'strong', surface: false }, d, t, [4, 2]);
    const temps = sens('temperature'), hums = sens('humidity');
    const scenes = dom('scene').slice(0, 6);
    const people = dom('person').slice(0, 8), weather = dom('weather')[0], sun = all.find((e) => e.id === 'sun.sun');
    // cameras: real cameras only — a robot vacuum's maps (camera / image entities of the vacuum's device, or named "map") are not security
    const vacDevs = new Set(all.filter((e) => e.domain === 'vacuum' && e.device).map((e) => e.device));
    const isMap = (e) => /map|carte|kaart/i.test(`${e.id} ${e.name}`) || (e.device && vacDevs.has(e.device));
    const climates = dom('climate'), medias = dom('media_player').sort((x, y) => (y.state === 'playing') - (x.state === 'playing') || (OFF(x) - OFF(y))), alarms = dom('alarm_control_panel'), cameras = dom('camera').filter((e) => !isMap(e));
    const lights = dom('light');
    const notify = opts.notify !== false, radial = opts.radial !== false;
    const roomPid = new Map();
    chosen.forEach((a) => { let id = `p-room-${slug(a.name)}`, n = 2; while ([...roomPid.values()].includes(id)) id = `p-room-${slug(a.name)}-${n++}`; roomPid.set(a.id, id); });

    /* ---- the radial menu of every page: the demo's, pointing only at what exists */
    function radialOn(pid) {
      if (!radial) return;
      const off = { icon: 'star', type: 'demo', enabled: false, confirm: false, keepOpen: false };
      const acts = [{ label: 'Home', icon: 'home', type: 'navigate', page: 'home', enabled: true, confirm: false, keepOpen: false }];
      if (lights.length && want('lights')) acts.push({ label: 'Lights', icon: 'bulb', type: 'navigate', page: 'lights', enabled: true, confirm: false, keepOpen: false });
      if (chosen.length) acts.push({ label: 'Rooms', icon: 'sofa', type: 'navigate', page: 'rooms', enabled: true, confirm: false, keepOpen: false });
      if (scenes.length) { acts.push({ label: 'Scenes', icon: 'star', type: 'popup', popup: 'p-scenes', enabled: true, confirm: false, keepOpen: false }); usedPopups.add('p-scenes'); }
      if (notify) { acts.push({ label: 'Notifications', icon: 'bell', type: 'popup', popup: 'p-notify', enabled: true, confirm: false, keepOpen: false }); usedPopups.add('p-notify'); }
      while (acts.length < 8) acts.push(off);
      const n = Math.max(2, Math.min(8, acts.filter((x) => x.enabled).length));
      page.items.push({ id: `${pid}-radial`, type: 'radial', parent: null, config: { name: 'Menu', count: n, float: true, corner: 'bottom-right', ring: 'standard', actions: acts },
        layout: L([1, 300, 1, 4], [1, 300, 2, 4], [4, 4]), frame: { desktop: { x: 24, y: 24, w: 84, h: 84 }, tablet: { x: 24, y: 24, w: 84, h: 84 } } });
    }
    const POP = (id) => ({ interactions: { tap: { action: 'popup', popup: id } } });
    const tempOf = (list) => (list || []).find((e) => e.domain === 'sensor' && e.dc === 'temperature') || (list || []).find((e) => e.domain === 'climate');
    const humOf = (list) => (list || []).find((e) => e.domain === 'sensor' && e.dc === 'humidity');

    // the LIVING spaces first (living room, kitchen, dining, bedrooms…) — never the cellar, the garage, a freezer: their room temperatures
    // and humidities, and the order thermostats are chosen in (the main one is the living room's)
    const UTIL = UTIL_ROOM;
    const rankOf = (e) => { const a = areasAll.find((x) => x.id === e.areaId); const n = a ? a.name : ''; if (!n || UTIL.test(n)) return 20; const i = LOOKS.findIndex(([re]) => re.test(n)); return i < 0 ? 9 : i; };
    const byRank = (x, y) => rankOf(x) - rankOf(y);
    const livingTemps = chosen.filter((a) => !UTIL.test(a.name)).map((a) => roomTemp(byArea.get(a.id), a.name)).filter(Boolean).sort(byRank);
    const livingHums = chosen.filter((a) => !UTIL.test(a.name)).map((a) => humOf(byArea.get(a.id))).filter(Boolean).sort(byRank);
    const climatesRanked = [...climates].sort((x, y) => (OFF(x) ? 1 : 0) - (OFF(y) ? 1 : 0) || byRank(x, y));

    /* ================================================================== HOME — an OVERVIEW of what the house really has: presence, weather,
       climate, lights on, energy now, security, a "My devices" group, notifications and scenes. Only sections with real entities are made;
       they are packed into balanced columns (desktop 3 · tablet 2 · phone 1) so no column runs long while another stays empty. */
    newPage('home', 'Home', 'home');
    {
      const blocks = [];   // { top: item without layout, kids: [items], h: { d, t, m } }
      const blk = (id, type, config, d, t, m, kids = []) => blocks.push({ top: { id, type, parent: null, config }, kids, h: { d, t, m } });
      const box = (id, title, icon, kids, rowsD, rowsT, rowsM) => blk(id, 'container', { title, subtitle: '', variant: 'secondary', icon }, rowsD, rowsT, rowsM, kids);
      if (people.length) blk('h-who', 'presence', { variant: 'row', name: 'Who’s home', people: people.map((e, i) => ({ id: `p${i + 1}`, entity: e.id, label: clean(e.name, 24) })) }, 6, 6, 6);
      if (weather) blk('h-weather', 'weather', { variant: 'daily', location: 'Weather', entity: weather.id, forecastType: 'daily', forecastRows: 3 }, 10, 10, 10);
      // CLIMATE: several thermostats → one Climate group card (average, shared target, each unit); one → its compact card
      const cgH = (n) => 8 + Math.ceil(Math.min(6, n) * 2.1);
      if (climates.length > 1) blk('h-climate', 'climategroup', { name: 'Heating', units: climatesRanked.slice(0, 6).map((e) => e.id) }, cgH(climates.length), cgH(climates.length), cgH(climates.length) + 1);
      else if (climates[0]) blk('h-climate', 'climate', { variant: 'compact', name: clean(climates[0].name, 60), entity: climates[0].id }, 8, 8, 8);
      const inTemps = livingTemps.slice(0, 4);
      if (inTemps.length) blk('h-read', 'readings', { name: 'Indoor', columns: 2, items: inTemps.map((e, i) => ({ id: `v${i + 1}`, entity: e.id, label: clean((areasAll.find((x) => x.id === e.areaId) || e).name, 24), color: 'danger', decimals: 1 })) }, inTemps.length > 2 ? 7 : 4, inTemps.length > 2 ? 7 : 4, inTemps.length > 2 ? 7 : 4);
      // LIGHTS: the lights that are on (the card's own count), tap a row to switch it
      if (lights.length) blk('h-lights', 'activity', { name: 'Lights on', show: 'active', emptyText: 'All lights are off', max: 3, entries: lights.slice(0, 20).map((e) => ({ entity: e.id, icon: 'mdi:lightbulb-on', color: 'warning' })) }, 11, 11, 11);
      // ENERGY NOW: the house's power readings (never invented — only sensors that exist)
      const pw = sens('power'), pick = (re) => pw.find((e) => re.test(`${e.id} ${e.name}`));
      const eNow = [pick(/house|home|consumption|load|woning|maison/i), pick(/solar|pv|photovolta|zonne/i), pick(/grid|net|réseau|reseau|p1/i)].filter((e, i, l) => e && l.indexOf(e) === i);
      if (eNow.length) blk('h-energy', 'readings', { name: 'Energy now', columns: Math.min(3, eNow.length), items: eNow.map((e, i) => ({ id: `v${i + 1}`, entity: e.id, label: clean(e.name, 24), color: ['warning', 'yellow', 'info'][i] || 'warning' })) }, 4, 4, eNow.length > 2 ? 9 : 5);
      // SECURITY: the alarm, and the doors / windows / motion that are open or active (an empty list says all is calm)
      const secAll = all.filter((e) => e.domain === 'binary_sensor' && ['door', 'window', 'garage_door', 'opening', 'motion', 'moisture', 'smoke'].includes(e.dc));
      if (alarms[0]) blk('h-alarm', 'alarm', { variant: 'compact', name: clean(alarms[0].name, 60), entity: alarms[0].id, modes: ['arm_home', 'arm_away'], confirmDisarm: true }, 6, 6, 7);
      if (secAll.length) blk('h-open', 'activity', { name: 'Open & alerts', show: 'active', emptyText: 'Everything is closed and calm', max: 3, entries: secAll.slice(0, 20).map((e) => ({ entity: e.id, icon: (ATTN[e.dc] || ['mdi:alert'])[0], color: (ATTN[e.dc] || ['', 'warning'])[1] })) }, 11, 11, 11);
      // MY DEVICES: switchable devices that are not lights or thermostats, as tiles inside ONE container (editable like any container)
      const DI = { switch: ['mdi:power-socket-eu', 'blue'], fan: ['mdi:fan', 'blue'], media_player: ['mdi:volume-high', 'purple'], input_boolean: ['mdi:toggle-switch-outline', 'blue'] };   // what a Device tile can switch
      const devs = all.filter((e) => DI[e.domain]).slice(0, 4);
      if (devs.length) {
        const rowsN = Math.ceil(devs.length / 2), tileH = 6;
        const kids = devs.map((e, i) => ({ id: `h-d${i}`, type: 'devicetile', parent: 'h-devs', config: { name: clean(e.name, 60), entity: e.id, icon: DI[e.domain][0], color: DI[e.domain][1] },
          layout: { desktop: { x: 1 + (i % 2) * 4, y: 1 + Math.floor(i / 2) * tileH, w: 4, h: tileH }, tablet: { x: 1 + (i % 2) * 4, y: 1 + Math.floor(i / 2) * tileH, w: 4, h: tileH }, mobile: { w: 2, h: tileH } } }));
        box('h-devs', 'My devices', 'home', kids, 3 + rowsN * tileH, 3 + rowsN * tileH, 3 + rowsN * tileH);
      }
      if (medias[0]) blk('h-media', 'media', { variant: 'minibar', name: clean(medias[0].name, 60), entity: medias[0].id }, 4, 4, 5);
      if (notify) blk('h-notify', 'inbox', { variant: 'list', name: 'Notifications', max: 3 }, 6, 6, 6);
      // SCENES: up to four, as pills inside one container
      if (scenes.length) {
        const sc = scenes.slice(0, 4);
        const kids = sc.map((e, i) => ({ id: `h-sc${i}`, type: 'action', parent: 'h-scenes', config: { name: clean(e.name, 60), icon: 'mdi:palette-outline', run: 'ha', entity: e.id, look: 'pill', iconColor: ['orange', 'pink', 'green', 'blue'][i] },
          layout: { desktop: { x: 1 + (i % 2) * 4, y: 1 + Math.floor(i / 2) * 3, w: 4, h: 3 }, tablet: { x: 1 + (i % 2) * 4, y: 1 + Math.floor(i / 2) * 3, w: 4, h: 3 }, mobile: { w: 4, h: 3 } } }));   // a phone: one pill per row (whole names)
        box('h-scenes', 'Scenes', 'star', kids, 3 + Math.ceil(sc.length / 2) * 3, 3 + Math.ceil(sc.length / 2) * 3, 4 + sc.length * 3);
      }
      if (sun) blk('h-sun', 'sunmoon', { variant: 'arc', name: 'Sun', entity: sun.id }, 4, 5, 4);
      // PACK: each block into the shortest column (the order above is the priority)
      const pack = (cols, w, key) => { const hs = Array(cols).fill(1); return blocks.map((b) => { const c = hs.indexOf(Math.min(...hs)), y = hs[c]; hs[c] += b.h[key]; return { x: 1 + c * w, y, w, h: b.h[key] }; }); };
      const D = pack(3, 8, 'd'), T = pack(2, 8, 't');
      // phone rows are shorter (10 px + 12 px gap against 18 px): the same content needs ~1.27× the rows
      blocks.forEach((b, i) => { page.items.push({ ...b.top, layout: { desktop: D[i], tablet: T[i], mobile: { w: 4, h: Math.max(b.h.m, Math.ceil(b.h.d * 1.27)) } } }); b.kids.forEach((k) => page.items.push(k)); });
      if (!page.items.length) add('h-empty', 'text', empty('Your home', 'Nothing to show here yet — add widgets in Edit.'), [1, 1, 12, 4], [1, 1, 16, 4], [4, 4]);
      radialOn('h');
    }

    /* ================================================================== LIGHTS — every light as its own card, grouped room by room in ONE flowing
       grid (desktop 4 per row · tablet 2 · phone 2). No heading per room: the card's own name says which light it is, and the room is added
       to that name only when the light's name does not already contain it ("Bedroom · Ceiling light", but "Cave" stays "Cave"). */
    if (want('lights') && lights.length) {
      newPage('lights', 'Lights', 'bulb');
      title('l-title', 'Lights');
      let y = 4;
      if (scenes.length) { scenes.slice(0, 4).forEach((e, i) => add(`l-sc${i}`, 'action', { name: clean(e.name, 60), icon: 'mdi:palette-outline', run: 'ha', entity: e.id, look: 'pill', iconColor: ['orange', 'pink', 'green', 'blue'][i] }, [1 + i * 6, y, 6, 3], [1 + (i % 2) * 8, y + Math.floor(i / 2) * 3, 8, 3], [2, 4])); y += 4; }
      const ty0 = scenes.length ? y + 3 : y;
      const groups = [...chosen.map((a) => [a.name, (byArea.get(a.id) || []).filter((e) => e.domain === 'light')]), ['', (byArea.get(null) || []).filter((e) => e.domain === 'light' && opts.unassigned === 'page')]].filter(([, l]) => l.length);
      // the room goes in front of a light's name only when the name alone is ambiguous: used in several rooms, or a generic word
      const GENERIC = /^(plafonnier|plafond|ceiling( light)?|main( light)?|lamp|lampe|light|lumi[eè]re|spot|spots|led|pendant|suspension|applique|appliques|wall light|veilleuse|night light)$/i;
      const nameCount = new Map();
      groups.forEach(([, l]) => l.forEach((e) => { const k = fold(e.name); nameCount.set(k, (nameCount.get(k) || 0) + 1); }));
      const named = (room, e) => { const n = clean(e.name, 60); if (!room || fold(n).includes(fold(room))) return n; return nameCount.get(fold(e.name)) > 1 || GENERIC.test(n.trim()) ? clean(`${room} · ${n}`, 60) : n; };
      const cards = [], rest = [];
      groups.forEach(([room, list]) => list.forEach((e) => (cards.length < 48 ? cards.push([room, e]) : rest.push(e))));
      // compact light cards: the whole name stays readable at every width (a photo card is too narrow two-up on a phone)
      const CH = 4;
      cards.forEach(([room, e], i) => add(`l-${i}`, 'light', { variant: 'compact', name: named(room, e), entity: e.id },
        [1 + (i % 4) * 6, y + Math.floor(i / 4) * CH, 6, CH], [1 + (i % 2) * 8, ty0 + Math.floor(i / 2) * CH, 8, CH], [4, CH]));
      if (rest.length) add('l-more', 'entitylist', { name: 'More lights', rows: rest.slice(0, 20).map((e, i) => ({ id: `i${i + 1}`, entity: e.id })) },
        [1, y + Math.ceil(cards.length / 4) * CH, 12, 10], [1, ty0 + Math.ceil(cards.length / 2) * CH, 16, 10], [4, 10]);
      radialOn('l');
    }

    /* ================================================================== CLIMATE — the main thermostat as the dial; every other thermostat, fan,
       humidifier… grouped in ONE "My devices" container (a normal, editable container: thermostats as compact cards two by two, the other
       devices as tiles four by four); the indoor readings beside it */
    const heatList = all.filter((e) => ['climate', 'fan', 'humidifier', 'water_heater'].includes(e.domain));
    if (want('climate') && (climates.length || temps.length)) {
      newPage('climate', 'Climate', 'thermo');
      title('c-title', 'Climate');
      // the MAIN thermostat (the living room's, a working one first) as a dial of a sensible size — not most of the screen
      const main = climatesRanked[0];
      if (main) add('c-main', 'climate', { variant: 'dial', name: clean(main.name, 60), entity: main.id, image: PH('fire'), imageTreatment: 'dim', controls: [{ type: 'dial', design: 'knob', label: 'Temperature' }] }, [1, 4, 8, 16], [1, 4, 16, 16], [4, 17]);
      // working units as cards; a unit that does not respond (unavailable) as one compact row in a "Not responding" list — its status
      // stays visible without a large dark card
      const others = [...climatesRanked.slice(1).filter((e) => !OFF(e)), ...dom('humidifier')].slice(0, 8), small = dom('fan').filter((e) => !OFF(e)).slice(0, 8);
      const dead = [...climatesRanked.slice(1), ...dom('fan')].filter((e) => OFF(e)).slice(0, 6);
      const DI = { fan: ['mdi:fan', 'blue'] };
      let dy = 4, tdy = climates[0] ? 21 : 4;
      if (others.length || small.length || dead.length) {
        const kids = [], ch = 7, th = 5;
        others.forEach((e, i) => kids.push({ id: `c-${i}`, type: e.domain === 'humidifier' ? 'humidifier' : 'climate', parent: 'c-devs', config: e.domain === 'humidifier' ? { name: clean(e.name, 60), unit: e.id } : { variant: 'compact', name: clean(e.name, 60), entity: e.id },
          layout: { desktop: { x: 1 + (i % 2) * 8, y: 1 + Math.floor(i / 2) * ch, w: 8, h: ch }, tablet: { x: 1 + (i % 2) * 8, y: 1 + Math.floor(i / 2) * ch, w: 8, h: ch }, mobile: { w: 4, h: ch } } }));
        const y1 = 1 + Math.ceil(others.length / 2) * ch;
        small.forEach((e, i) => kids.push({ id: `c-s${i}`, type: 'devicetile', parent: 'c-devs', config: { name: clean(e.name, 60), entity: e.id, icon: DI[e.domain][0], color: DI[e.domain][1] },
          layout: { desktop: { x: 1 + (i % 4) * 4, y: y1 + Math.floor(i / 4) * th, w: 4, h: th }, tablet: { x: 1 + (i % 4) * 4, y: y1 + Math.floor(i / 4) * th, w: 4, h: th }, mobile: { w: 2, h: th } } }));
        const y2 = y1 + Math.ceil(small.length / 4) * th, dh = dead.length ? 3 + Math.ceil(dead.length * 1.9) : 0;
        if (dead.length) kids.push({ id: 'c-dead', type: 'entitylist', parent: 'c-devs', config: { name: 'Not responding', rows: dead.map((e, i) => ({ id: `i${i + 1}`, entity: e.id })) },
          layout: { desktop: { x: 1, y: y2, w: 16, h: dh }, tablet: { x: 1, y: y2, w: 16, h: dh }, mobile: { w: 4, h: dh + 1 } } });
        const hD = 3 + Math.ceil(others.length / 2) * ch + Math.ceil(small.length / 4) * th + dh;
        const hM = 3 + others.length * ch + Math.ceil(small.length / 2) * th + (dead.length ? dh + 1 : 0);
        page.items.push({ id: 'c-devs', type: 'container', parent: null, config: { title: 'My devices', subtitle: `${others.length + small.length + dead.length} device${others.length + small.length + dead.length === 1 ? '' : 's'}`, variant: 'secondary', icon: 'home' },
          layout: L([climates[0] ? 9 : 1, dy, 16, hD], [1, climates[0] ? 21 : 4, 16, hD], [4, hM]) });
        kids.forEach((k) => page.items.push(k));
        dy += hD; tdy += hD;
      }
      const reads = [...livingTemps.slice(0, 4), ...livingHums.slice(0, 2)];
      const areaName = (e) => clean((areasAll.find((x) => x.id === e.areaId) || e).name, 24);
      if (reads.length) add('c-read', 'readings', { name: 'Indoor', columns: 2, items: reads.map((e, i) => ({ id: `v${i + 1}`, entity: e.id, label: e.dc === 'humidity' ? clean(`${areaName(e)} · humidity`, 24) : areaName(e), color: e.dc === 'humidity' ? 'info' : 'danger', decimals: e.dc === 'humidity' ? 0 : 1 })) },
        climates[0] ? [1, 21, 8, reads.length > 4 ? 11 : 8] : [1, dy, 16, reads.length > 4 ? 11 : 8], [1, tdy, 16, reads.length > 4 ? 11 : 8], [4, reads.length > 4 ? 13 : 9]);
      radialOn('c');
    }

    /* ================================================================== ROOMS — hero cards; each opens its room popup */
    const roomsSummary = [];
    if (chosen.length) {
      newPage('rooms', 'Rooms', 'sofa');
      title('r-title', 'Rooms');
      chosen.forEach((a, i) => {
        const list = byArea.get(a.id) || [], look = lookOf(a.name, i), pid = roomPid.get(a.id);
        const t = roomTemp(list, a.name), hm = humOf(list), ls = list.filter((e) => e.domain === 'light').map((e) => e.id).slice(0, 24), nDev = deviceCount(list);
        const kinds = [ls.length && 'Lights', list.some((e) => tabOf(e) === 'heating') && 'Climate', list.some((e) => e.domain === 'media_player') && 'Media', list.some((e) => tabOf(e) === 'security') && 'Security'].filter(Boolean);
        add(`r-${i}`, 'roomtile', { name: clean(a.name, 60), subtitle: kinds.slice(0, 2).join(' · ') || `${nDev} device${nDev === 1 ? '' : 's'}`, icon: look.icon, color: look.color,
          image: opts.photos !== false && look.photo ? PH(`room-${look.photo}`) : 'none', ...(t ? { temperature: t.id } : {}), ...(hm ? { humidity: hm.id } : {}), ...(ls.length ? { lightList: ls } : {}), ...POP(pid) },
          [1 + (i % 4) * 6, 4 + Math.floor(i / 4) * 12, 6, 11], [1 + (i % 2) * 8, 4 + Math.floor(i / 2) * 11, 8, 10], [2, 9]);
      });
      radialOn('r');
    }

    /* ================================================================== ENERGY — a System energy flow when a house power sensor exists (roles SUGGESTED
       from names — check them in the widget), energy meters as charts */
    const power = sens('power'), energyMeters = sens('energy');
    if (want('energy') && (power.length || energyMeters.length)) {
      newPage('energy', 'Energy', 'bolt');
      title('e-title', 'Energy');
      const pick = (re) => power.find((e) => re.test(`${e.id} ${e.name}`));
      const house = pick(/house|home|consumption|load|woning|maison/i), solar = pick(/solar|pv|photovolta|zonne/i), grid = pick(/grid|net|meter|réseau|reseau/i), batt = pick(/battery|batterie|accu/i);
      // THE DEMO'S ENERGY DESIGN (house variant): the house picture in the middle, a card per utility around it, glowing elbow lines
      // that run in the direction the power flows. Only POWER sensors (W / kW) become power flows; gas / water join as flows only when a
      // real flow-RATE sensor exists (m³/h, L/min) — a meter total is never animated as a flow.
      const rate = (dc) => all.find((e) => e.domain === 'sensor' && e.dc === dc && /\/(h|min|s)$/i.test(e.unit || ''));
      const gasRate = rate('gas'), waterRate = rate('water');
      let ry = 4;
      if (house) {
        const nodes = [solar && { id: 'solar', type: 'solar', entity: solar.id }, grid && grid !== house && { id: 'grid', type: 'grid', entity: grid.id, positive: 'toward' },
          batt && { id: 'battery', type: 'battery', entity: batt.id }, gasRate && { id: 'gas', type: 'gas', entity: gasRate.id }, waterRate && { id: 'water', type: 'water', entity: waterRate.id }].filter(Boolean);
        add('e-flow', 'energy', { variant: 'house', name: 'Live flows', subtitle: nodes.map((n) => ({ solar: 'Solar', grid: 'Grid', battery: 'Battery', gas: 'Gas', water: 'Water' }[n.type])).join(' · '), entity: house.id,
          houseImage: PH('house-night'), lineShape: 'elbow', flowStyle: 'arrows', glow: true, nodes }, [1, 4, 24, 17], [1, 4, 16, 14], [4, nodes.length > 2 ? 22 : 18]);
        ry = 22;
      }
      // "power now": the DEVICES that use power (a plug, an appliance) — not a second meter of what the flow already shows (an inverter)
      const others = power.filter((e) => e !== house && e !== solar && e !== grid && e !== batt && e.role !== 'meter').slice(0, 6);
      // the house's own meters first (import / consumption before export / production), then device meters
      const mScore = (e) => (e.role === 'meter' ? 0 : 10) + (/import|consum|verbruik|bezug|total/i.test(`${e.id} ${e.name}`) ? 0 : /export|inject|teruglever|einspeis/i.test(`${e.id} ${e.name}`) ? 2 : 1);
      const meters = [...energyMeters].sort((x, y) => mScore(x) - mScore(y)).slice(0, 2);
      // below the flow: what uses power now (devices) beside the energy of the last seven days
      if (others.length) { const h = 3 + Math.ceil(others.length / 2) * 3; add('e-read', 'readings', { name: 'Power now', columns: 2, items: others.map((e, i) => ({ id: `v${i + 1}`, entity: e.id, label: clean(e.name, 24), color: 'warning' })) }, [1, ry, 8, h], [1, ry, 16, h], [4, h + 1]); }
      meters.forEach((e, i) => { add(`e-ch${i}`, 'chart', { name: clean(`${e.name} · 7 days`, 60), entity: e.id, seriesLabel: 'Used', kind: 'bar', source: 'statistics', period: 'day', count: 7, stat: 'change', unit: e.unit || 'kWh', color: i ? 'warning' : 'danger', legend: 'off', barRadius: 6, barWidth: 60, barOpacity: 60 },
        [others.length ? 9 + i * 8 : 1 + i * 12, ry, others.length ? 8 : 12, 11], [1 + i * 8, ry + (others.length ? 12 : 0), 8, 10], [4, 10]); });
      radialOn('e');
    }

    /* ================================================================== SECURITY */
    const secBin = all.filter((e) => e.domain === 'binary_sensor' && SEC_DC.includes(e.dc));
    const locks = dom('lock');
    if (want('security') && (alarms.length || locks.length || secBin.length || cameras.length)) {
      newPage('security', 'Security', 'shield');
      title('s-title', 'Security');
      if (alarms[0]) add('s-alarm', 'alarm', { variant: 'compact', name: clean(alarms[0].name, 60), entity: alarms[0].id, modes: ['arm_home', 'arm_away'], confirmDisarm: true,
        widgetBg: 'gradient', bgFrom: '#173a29', bgTo: '#1c1d24', bgAngle: 135, borderWidth: 1, borderColor: '#2f7d55', borderStyle: 'solid' }, [1, 4, 9, 6], [1, 4, 16, 6], [4, 8]);
      const rows = [...locks, ...secBin.filter((e) => ['door', 'window', 'garage_door', 'opening', 'moisture', 'smoke'].includes(e.dc))].slice(0, 20);
      if (rows.length) add('s-sum', 'entitylist', { name: 'Doors, windows & locks', rows: rows.map((e, i) => ({ id: `i${i + 1}`, entity: e.id })) }, [10, 4, 6, 14], [1, 12, 16, 12], [4, 12]);
      const tiles = ['door', 'motion', 'moisture'].map((dc) => secBin.find((e) => e.dc === dc)).filter(Boolean);
      const TC = { door: ['#132438', '#2a5f93', 'mdi:door'], motion: ['#3a2412', '#9a5a1e', 'mdi:walk'], moisture: ['#16301f', '#2f7d55', 'mdi:water-outline'] };
      tiles.forEach((e, i) => add(`s-t${i}`, 'sensor', { variant: 'status', name: clean(e.name, 60), entity: e.id, icon: TC[e.dc][2], widgetBg: 'gradient', bgFrom: TC[e.dc][0], bgTo: '#1c1d24', bgAngle: 160, borderWidth: 1, borderColor: TC[e.dc][1], borderStyle: 'solid' },
        [16 + i * 3, 4, 3, 6], [1 + i * 5, 24, i === 2 ? 6 : 5, 6], [2, 6]));
      cameras.slice(0, 4).forEach((e, i) => add(`s-cam${i}`, 'camera', { variant: 'picture', name: clean(e.name, 60), entity: e.id, fit: 'cover', refresh: 10, showName: true }, [1 + (i % 2) * 8, 18 + Math.floor(i / 2) * 11, 8, 11], [1 + (i % 2) * 8, 31 + Math.floor(i / 2) * 9, 8, 9], [4, 8]));
      const logged = [...secBin, ...locks, ...alarms].slice(0, 14);
      if (logged.length) add('s-log', 'activitylog', { name: 'Activity', max: 6, ...(notify ? { link: { label: 'Notifications', popup: 'p-notify' } } : {}), entries: logged.map((e, i) => ({ id: `e${i + 1}`, entity: e.id })) }, [17, 11, 8, 18], [1, 50, 16, 18], [4, 18]);
      if (notify) usedPopups.add('p-notify');
      radialOn('s');
    }

    /* ================================================================== UNASSIGNED (optional): one page of lists, by kind — never hundreds of widgets */
    const loose = (byArea.get(null) || []).filter((e) => tabOf(e));
    if (opts.unassigned === 'page' && loose.length) {
      newPage('unassigned', 'Unassigned', 'more');
      title('u-title', 'Not in any area');
      const KIND = [['Lights', ['light']], ['Climate', ['climate', 'fan', 'humidifier', 'water_heater']], ['Media', ['media_player']], ['Devices', ['switch', 'input_boolean', 'cover', 'vacuum', 'lawn_mower', 'valve']],
        ['Security', ['lock', 'alarm_control_panel', 'camera', 'binary_sensor']], ['Sensors', ['sensor']]];
      let k = 0;
      KIND.forEach(([name, doms]) => {
        const list = loose.filter((e) => doms.includes(e.domain)).slice(0, 20);
        if (!list.length) return;
        add(`u-${k}`, 'entitylist', { name, rows: list.map((e, i) => ({ id: `i${i + 1}`, entity: e.id })) }, [1 + (k % 3) * 8, 4 + Math.floor(k / 3) * 16, 8, 15], [1 + (k % 2) * 8, 4 + Math.floor(k / 2) * 16, 8, 15], [4, 14]);
        k++;
      });
      radialOn('u');
    }

    /* ================================================================== POPUPS */
    const popItem = (pp, id, type, config, desk, mob) => pp.items.push({ id, type, parent: null, config, frame: { desktop: desk, tablet: { ...desk, w: Math.min(desk.w, 708 - desk.x) } }, layout: { mobile: { w: mob[0], h: mob[1] } } });
    if (usedPopups.has('p-scenes')) {
      const pp = { id: 'p-scenes', name: 'Scenes', config: popCfg('Scenes', 'One press, the whole house', 'mdi:palette-outline', 760, 320 + Math.max(0, Math.ceil(scenes.length / 3) - 2) * 128), items: [] };
      scenes.forEach((e, i) => popItem(pp, `ps-${i}`, 'action', { name: clean(e.name, 60), icon: 'mdi:palette-outline', run: 'ha', entity: e.id }, fr(24 + (i % 3) * 228, 20 + Math.floor(i / 3) * 128, 212, 112), [2, 6]));
      popups.push(pp);
    }
    if (usedPopups.has('p-notify')) {
      const pp = { id: 'p-notify', name: 'Notifications', config: popCfg('Notifications', 'What happened at home', 'mdi:bell-outline', 560, 600), items: [] };
      popItem(pp, 'pn-list', 'inbox', { variant: 'list', name: 'Notifications', max: 8 }, fr(24, 12, 512, 500), [4, 18]);
      popups.push(pp);
    }
    // EACH ROOM: the shared compact room popup (IniqDesign.roomPopup — the same rules as the official demo): a 180 px header with the
    // room's temperature and humidity, only the tabs that hold something, compact cards on the popup's fine rows
    const SENS_ORDER = ['temperature', 'humidity', 'illuminance', 'carbon_dioxide', 'co2', 'pm25', 'pm10', 'volatile_organic_compounds', 'aqi', 'pressure', 'power', 'energy', 'moisture', 'battery'];
    chosen.forEach((a, ri) => {
      const list = (byArea.get(a.id) || []), look = lookOf(a.name, ri), pid = roomPid.get(a.id), rn = clean(a.name, 60);
      const t = roomTemp(list, a.name), hm = humOf(list);
      const photo = opts.photos !== false && look.photo ? PH(`room-${look.photo}`) : null;
      const ents = list.map((e) => ({ ...e, tab: tabOf(e) })).filter((e) => e.tab && !(e.tab === 'sensors' && e.role !== 'reading' && e.domain === 'sensor'));
      // readings: one per kind and device (a multisensor's temperature — not also its "feels like"), the most useful kinds first
      const seen = new Set();
      const sensors = ents.filter((e) => e.tab === 'sensors').sort((x, y) => (SENS_ORDER.indexOf(x.dc) + 99) % 99 - (SENS_ORDER.indexOf(y.dc) + 99) % 99)
        .filter((e) => { const key = `${e.device || e.id}|${e.dc}`; if (seen.has(key)) return false; seen.add(key); return true; });
      const roomEnts = [...ents.filter((e) => e.tab !== 'sensors'), ...sensors];
      const kinds = [roomEnts.some((e) => e.tab === 'media') && 'Media', roomEnts.some((e) => e.domain === 'light') && 'Lights', roomEnts.some((e) => e.tab === 'heating') && 'Climate'].filter(Boolean);
      const pp = global.IniqDesign.roomPopup({ id: pid, name: a.name, icon: look.icon, photo, subtitle: kinds.join(' · '), temp: t && t.id, hum: hm && hm.id, entities: roomEnts });
      const counts = {};
      ['active', 'lights', 'heating', 'media', 'security', 'sensors'].forEach((tb) => { counts[tb] = pp.items.filter((x) => x.tab === tb).length; });
      popups.push({ id: pp.id, name: pp.name, config: pp.config, items: pp.items });
      roomsSummary.push({ id: a.id, name: rn, popup: pid, counts, tabs: pp.tabs, photo: !!photo, devices: deviceCount(list), entities: (discovered.entities || []).filter((e) => e.areaId === a.id).length });
    });

    /* ---- every widget conformed to its schema (long names, special characters); a widget that cannot be made valid stops here */
    const ctx = { pages: pages.map((p) => p.id), popups: popups.map((p) => p.id) };
    pages.forEach((p) => { p.items = G().conformAll(R, p.items, p.name, ctx); });
    popups.forEach((p) => { p.items = G().conformAll(R, p.items, p.name, ctx); });

    const tpl = opts.template && opts.template.app ? opts.template.app : null;
    const dashboard = { version: 3,
      app: { id: 'generated', startPage: 'home', navigation: { desktop: 'left', tablet: 'bottom', mobile: 'bottom' },
        grid: { ...(tpl && tpl.grid ? tpl.grid : { desktop: { cols: 24, row: 10, gap: 18, pad: 24 }, tablet: { cols: 16, row: 10, gap: 16, pad: 20 }, mobile: { cols: 4, row: 10, gap: 12, pad: 14 }, nested: 'page' }), popups: 'page' },
        ...(tpl && tpl.theme && opts.theme !== 'default' ? { theme: tpl.theme } : {}) },
      pages, popups, notifications: { templates: [], rules: [] } };
    const summary = { pages: pages.map((p) => ({ id: p.id, name: p.name, widgets: p.items.length })), rooms: roomsSummary, popups: popups.length,
      widgets: pages.reduce((n, p) => n + p.items.length, 0) + popups.reduce((n, p) => n + p.items.length, 0),
      unassigned: loose.length, unassignedShown: opts.unassigned === 'page' ? loose.length : 0, excluded: ex.size, leftOut: pool.dropped, groupsLeftOut: pool.groupsDropped };
    return { dashboard, summary };
  }

  global.IniqGenerateDemo = Object.freeze({ build, tabOf, lookOf, classify, roleOf, deviceCount, roomTemp });
})(window);
