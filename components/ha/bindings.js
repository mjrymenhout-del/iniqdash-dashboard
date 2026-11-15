/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* ==========================================================================
   IniqHA bindings — connect a widget to ONE Home Assistant entity through the shared IniqHA layer.
   The widget itself is unchanged: a binding only
     · builds its config from the entity's real state AND capabilities (no assumptions: a light
       without brightness gets no brightness bar, a climate without a set point gets no dial knob),
     · pushes later HA states into the widget (el.<widget>.setState — never calls onChange),
     · turns the widget's onChange (a user action) into an IniqHA.call (the server picks the service).

   IniqHA.bind(type, config, create) → HTMLElement
     Used by MaisonRegistry when config.entity is set AND the page is served by the IniqDash
     server. Otherwise the registry creates the widget as before (demo data).
   The widget sits in a wrapper (.iqha) that also shows "unavailable" / "Home Assistant
   unreachable" without the widget having to know, and is rebuilt only if the entity's
   capabilities change (e.g. the first real state arrives).
   ========================================================================== */
(function (global) {
  'use strict';

  const HA = () => global.IniqHA;
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

  /* ==========================================================================
     SHARED INFORMATION — ONE place that turns a normalised entity into truthful, readable information
     (widgets, Settings and, later, Entity Details use this; no widget parses Home Assistant itself).

     IniqHA.format.state(e)  → item for the entity's own state
     IniqHA.info(e)          → { state, since, updated, reported, items: [item…] }   (items: domain information that
                               HA reports for THIS entity — only what is there; nothing invented)
     item = { key, label, value, text, unit, kind, fraction?, tone?, available, since?, origin }
       kind:   number · percent · onoff · state · enum · timestamp · date · duration · text · color
       origin: 'ha' (as reported) · 'derived' (calculated by IniqDash from real HA values) · 'user' (typed by you)
     ========================================================================== */
  /** binary_sensor device classes: Home Assistant's documented wording for on / off (no device class → On / Off) */
  const BINARY = {
    battery: ['Low', 'Normal'], battery_charging: ['Charging', 'Not charging'], carbon_monoxide: ['Detected', 'Clear'], cold: ['Cold', 'Normal'],
    connectivity: ['Connected', 'Disconnected'], door: ['Open', 'Closed'], garage_door: ['Open', 'Closed'], gas: ['Detected', 'Clear'],
    glass_break: ['Glass break detected', 'Clear'], heat: ['Hot', 'Normal'], light: ['Light detected', 'No light'], lock: ['Unlocked', 'Locked'],
    moisture: ['Wet', 'Dry'], motion: ['Detected', 'Clear'], moving: ['Moving', 'Not moving'], occupancy: ['Detected', 'Clear'], opening: ['Open', 'Closed'],
    plug: ['Plugged in', 'Unplugged'], power: ['On', 'Off'], presence: ['Home', 'Away'], problem: ['Problem', 'OK'], running: ['Running', 'Not running'],
    safety: ['Unsafe', 'Safe'], smoke: ['Detected', 'Clear'], sound: ['Detected', 'Clear'], tamper: ['Tampering detected', 'Clear'],
    update: ['Update available', 'Up-to-date'], vibration: ['Detected', 'Clear'], window: ['Open', 'Closed'],
  };
  /** "on" is a warning for these classes (a problem, smoke, a low battery…): a tone for presentations that want it */
  const BINARY_ALERT = ['battery', 'carbon_monoxide', 'cold', 'gas', 'glass_break', 'heat', 'moisture', 'problem', 'safety', 'smoke', 'tamper'];
  /** "washing_machine_running" → "Washing machine running" (a reported option / state, cleaned up — not translated) */
  const clean = (v) => { const t = String(v ?? '').replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const DAY = 86400000;
  const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  /** a real moment, shown in local time: "14:05" (today) · "Yesterday 22:10" · "Tomorrow 07:00" · "Mon 14:05" (this week)
      · "3 Oct 14:05" · "3 Oct 2025 14:05". Absolute on purpose: it never goes stale on a wall display. */
  function when(v, now = Date.now()) {
    const t = typeof v === 'number' ? v : Date.parse(String(v ?? ''));
    if (!Number.isFinite(t)) return '';
    const d = new Date(t), hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const days = Math.round((dayStart(t) - dayStart(now)) / DAY);
    if (days === 0) return hm;
    if (days === -1) return `Yesterday ${hm}`;
    if (days === 1) return `Tomorrow ${hm}`;
    if (Math.abs(days) < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${hm}`;
    return `${d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })} ${hm}`;
  }
  /** a date-only state ("2026-10-22") as a local date, without inventing a time */
  function dateText(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? '').trim());
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  }
  /** a duration in its HA unit (d / h / min / s / ms) → "1 h 05 min", "42 min", "35 s" (never more precise than given) */
  function duration(v, unit) {
    const n = num(v), f = { d: 86400, h: 3600, min: 60, s: 1, ms: 0.001 }[unit];
    if (n === null || !f) return '';
    const sec = Math.round(Math.abs(n) * f), neg = n < 0 ? '−' : '';
    if (sec < 60) return `${neg}${sec} s`;
    if (sec < 3600) return `${neg}${Math.floor(sec / 60)} min`;
    if (sec < 86400) return `${neg}${Math.floor(sec / 3600)} h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')} min`;
    return `${neg}${Math.floor(sec / 86400)} d ${Math.floor((sec % 86400) / 3600)} h`;
  }
  const numText = (n, unit, d = null) => {
    const t = n.toLocaleString(undefined, d !== null ? { minimumFractionDigits: d, maximumFractionDigits: d } : { maximumFractionDigits: 2 });
    return unit ? (unit === '%' ? `${t}%` : `${t} ${unit}`) : t;
  };
  const item = (key, label, o) => ({ key, label, value: null, text: '', unit: null, kind: 'text', available: true, origin: 'ha', ...o });
  const STATELESS = ['scene', 'button', 'input_button'];
  /** weather conditions: Home Assistant's documented wording */
  const WEATHER = { 'clear-night': 'Clear, night', cloudy: 'Cloudy', exceptional: 'Exceptional', fog: 'Fog', hail: 'Hail', lightning: 'Lightning',
    'lightning-rainy': 'Lightning, rainy', partlycloudy: 'Partly cloudy', pouring: 'Pouring', rainy: 'Rainy', snowy: 'Snowy', 'snowy-rainy': 'Snowy, rainy',
    sunny: 'Sunny', windy: 'Windy', 'windy-variant': 'Windy, cloudy' };
  const DEMO_CAPTION = 'Comfortable';                  // the Sensor widget's built-in demo caption (registry defaults)
  /** the entity's own state as truthful text */
  function stateItem(e) {
    if (!e) return null;
    const dc = e.attrs?.device_class || null, st = String(e.state ?? '');
    const base = { value: e.state, since: e.changed || null };
    if (STATELESS.includes(e.domain)) {     // their state IS the moment they were last activated / pressed ("unknown": never)
      const t = when(st);
      return item('state', e.domain === 'scene' ? 'Last activated' : 'Last pressed', { ...base, kind: 'timestamp', text: t || 'Never', available: st.toLowerCase() !== 'unavailable' });
    }
    if (!e.available) return item('state', 'State', { ...base, kind: 'state', text: st.toLowerCase() === 'unknown' ? 'Unknown' : 'Unavailable', available: false });
    if (e.domain === 'binary_sensor') {
      const on = st === 'on', w = BINARY[dc] || ['On', 'Off'];
      return item('state', 'State', { ...base, kind: 'onoff', text: on ? w[0] : st === 'off' ? w[1] : clean(st), tone: on ? (BINARY_ALERT.includes(dc) ? 'warning' : 'on') : 'off' });
    }
    if (e.domain === 'weather') return item('state', 'Condition', { ...base, kind: 'state', text: WEATHER[st] || clean(st) });
    // a select's state IS one of its options: shown exactly as Home Assistant reports it (never re-cased)
    if (e.domain === 'select' || e.domain === 'input_select') return item('state', 'Option', { ...base, kind: 'enum', text: st });
    // a calendar entity is "on" while one of its events is in progress (Home Assistant's definition)
    if (e.domain === 'calendar') return item('state', 'State', { ...base, kind: 'onoff', text: st === 'on' ? 'Event in progress' : st === 'off' ? 'No event now' : clean(st), tone: st === 'on' ? 'on' : 'off' });
    // presence: HA's own words (home → Home, not_home → Away); a zone keeps its own name
    if (e.domain === 'person' || e.domain === 'device_tracker') return item('state', 'Presence', { ...base, kind: 'state', text: st === 'home' ? 'Home' : st === 'not_home' ? 'Away' : st });
    if (dc === 'timestamp') { const t = when(st); return item('state', 'State', { ...base, kind: 'timestamp', text: t || clean(st) }); }
    if (dc === 'date') { const t = dateText(st); return item('state', 'State', { ...base, kind: 'date', text: t || clean(st) }); }
    const n = num(st);
    if (dc === 'duration' && n !== null && duration(n, e.unit)) return item('state', 'State', { ...base, value: n, kind: 'duration', unit: e.unit, text: duration(n, e.unit) });
    if (n !== null) {
      const pct = e.unit === '%';
      return item('state', 'State', { ...base, value: n, unit: e.unit || null, kind: pct ? 'percent' : 'number', text: numText(n, e.unit),
        ...(pct ? { fraction: Math.max(0, Math.min(1, n / 100)) } : {}) });
    }
    return item('state', 'State', { ...base, kind: dc === 'enum' ? 'enum' : 'state', text: clean(st) });
  }
  /** domain information HA reports for this entity (only values that are present) */
  function domainItems(e) {
    const a = e.attrs || {}, out = [];
    const add = (key, label, value, o = {}) => { if (value === null || value === undefined || value === '') return; out.push(item(key, label, { value, text: String(value), ...o })); };
    const pct = (key, label, v) => { const n = num(v); if (n !== null) add(key, label, n, { kind: 'percent', unit: '%', text: `${Math.round(n)}%`, fraction: Math.max(0, Math.min(1, n / 100)) }); };
    const val = (key, label, v, unit) => { const n = num(v); if (n !== null) add(key, label, n, { kind: 'number', unit: unit || null, text: numText(n, unit) }); };
    const word = (key, label, v) => { if (typeof v === 'string' && v) add(key, label, v, { kind: 'state', text: clean(v) }); };
    const tu = HA()?.status?.().temperatureUnit || '';
    switch (e.domain) {
      case 'light':
        if (e.state === 'on') {
          pct('brightness', 'Brightness', a.brightness_pct);
          if (Array.isArray(a.rgb_color)) add('color', 'Colour', a.rgb_color, { kind: 'color', text: `rgb(${a.rgb_color.join(', ')})` });
          val('color_temp', 'Colour temperature', a.color_temp_kelvin, 'K');
          if (typeof a.effect === 'string' && a.effect && a.effect.toLowerCase() !== 'none') add('effect', 'Effect', a.effect, { kind: 'state' });
          word('color_mode', 'Colour mode', a.color_mode);
        }
        if (Array.isArray(a.supported_color_modes) && a.supported_color_modes.length) add('supported_color_modes', 'Colour modes', a.supported_color_modes, { kind: 'text', text: a.supported_color_modes.map(clean).join(', ') });
        break;
      case 'climate':
        val('current_temperature', 'Room temperature', a.current_temperature, tu);
        val('target_temperature', 'Target', a.target_temperature, tu);
        if (num(a.target_temp_low) !== null && num(a.target_temp_high) !== null) add('target_range', 'Target range', [a.target_temp_low, a.target_temp_high], { kind: 'text', text: `${numText(num(a.target_temp_low), tu)} – ${numText(num(a.target_temp_high), tu)}` });
        pct('current_humidity', 'Humidity', a.current_humidity);
        pct('target_humidity', 'Target humidity', a.target_humidity);
        word('hvac_action', 'Action', a.hvac_action);
        word('preset_mode', 'Preset', a.preset_mode);
        word('fan_mode', 'Fan mode', a.fan_mode);
        word('swing_mode', 'Swing mode', a.swing_mode);
        break;
      case 'cover':
        pct('position', 'Position', a.position);
        pct('tilt_position', 'Tilt', a.tilt_position);
        word('device_class', 'Type', a.device_class);
        break;
      case 'fan':
        if (e.state === 'on') pct('percentage', 'Speed', a.percentage);
        word('preset_mode', 'Preset', a.preset_mode);
        if (typeof a.oscillating === 'boolean') add('oscillating', 'Oscillating', a.oscillating, { kind: 'onoff', text: a.oscillating ? 'Yes' : 'No' });
        word('direction', 'Direction', a.direction);
        break;
      case 'media_player': {
        add('title', 'Title', a.title);
        add('artist', 'Artist', a.artist);
        add('album', 'Album', a.album);
        add('source', 'Source', a.source);
        if (num(a.volume) !== null) pct('volume', 'Volume', a.volume);
        if (typeof a.muted === 'boolean') add('muted', 'Muted', a.muted, { kind: 'onoff', text: a.muted ? 'Yes' : 'No' });
        const p = mediaProgress(e);
        if (p) out.push(p);
        if (typeof a.shuffle === 'boolean') add('shuffle', 'Shuffle', a.shuffle, { kind: 'onoff', text: a.shuffle ? 'On' : 'Off' });
        word('repeat', 'Repeat', a.repeat);
        word('content_type', 'Type', a.content_type);
        break;
      }
      case 'lock':
      case 'alarm_control_panel':
        add('changed_by', 'Changed by', a.changed_by);          // only what the integration reports — never a code
        break;
      case 'weather':
        val('temperature', 'Temperature', a.temperature, a.temperature_unit);
        val('apparent_temperature', 'Feels like', a.apparent_temperature, a.temperature_unit);
        pct('humidity', 'Humidity', a.humidity);
        if (num(a.wind_speed) !== null) add('wind', 'Wind', a.wind_speed, { kind: 'number', unit: a.wind_speed_unit || null, text: `${numText(num(a.wind_speed), a.wind_speed_unit)}${a.wind_bearing !== null && a.wind_bearing !== undefined ? ` ${typeof a.wind_bearing === 'number' ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((a.wind_bearing % 360) + 360) % 360 / 45) % 8] : a.wind_bearing}` : ''}` });
        val('pressure', 'Pressure', a.pressure, a.pressure_unit);
        val('dew_point', 'Dew point', a.dew_point, a.temperature_unit);
        val('uv_index', 'UV index', a.uv_index);
        val('visibility', 'Visibility', a.visibility, a.visibility_unit);
        pct('cloud_coverage', 'Cloud cover', a.cloud_coverage);
        break;
      case 'sun':
        val('elevation', 'Elevation', a.elevation, '°');
        val('azimuth', 'Azimuth', a.azimuth, '°');
        [['next_rising', 'Next sunrise'], ['next_setting', 'Next sunset'], ['next_noon', 'Next solar noon'], ['next_dawn', 'Next dawn'], ['next_dusk', 'Next dusk'], ['next_midnight', 'Next midnight']]
          .forEach(([k, l]) => { if (a[k]) add(k, l, a[k], { kind: 'timestamp', text: when(a[k]) }); });
        break;
      case 'timer':
        if (num(a.duration) !== null) add('duration', 'Duration', a.duration, { kind: 'duration', unit: 's', text: duration(a.duration, 's') });
        if (num(a.remaining) !== null) add('remaining', 'Time left (paused)', a.remaining, { kind: 'duration', unit: 's', text: duration(a.remaining, 's') });
        if (a.finishes_at) add('finishes_at', 'Finishes at', a.finishes_at, { kind: 'timestamp', text: when(a.finishes_at) });
        break;
      case 'vacuum':
        pct('battery', 'Battery', a.battery);
        word('fan_speed', 'Suction', a.fan_speed);
        break;
      case 'lawn_mower':
        pct('battery', 'Battery', a.battery);
        break;
      case 'device_tracker':
        word('source_type', 'Tracked by', a.source_type === 'bluetooth_le' ? 'Bluetooth LE' : a.source_type === 'gps' ? 'GPS' : a.source_type);
        pct('battery', 'Battery', a.battery);
        break;
      case 'person':
        add('source', 'Tracked by', a.source);                 // the tracker's entity id — never coordinates
        break;
      case 'number':
      case 'input_number':
        if (num(a.min) !== null && num(a.max) !== null) add('range', 'Range', [a.min, a.max], { kind: 'text', text: `${numText(num(a.min), e.unit)} – ${numText(num(a.max), e.unit)}` });
        val('step', 'Step', a.step, e.unit);
        word('mode', 'Mode', a.mode);
        break;
      case 'select':
      case 'input_select':
        if (Array.isArray(a.options)) add('options', 'Options', a.options.length, { kind: 'number', text: a.options.length > 6 ? `${a.options.length} options` : a.options.join(', ') });
        break;
      case 'script':
        if (a.last_triggered) add('last_triggered', 'Last run', a.last_triggered, { kind: 'timestamp', text: when(a.last_triggered) || 'Never' });
        break;
      default: break;
    }
    return out;
  }
  /** playback progress DERIVED from real HA values only: position as of position_updated_at, moving only while playing */
  function mediaProgress(e, now = Date.now()) {
    const a = e?.attrs || {}, pos = num(a.position), dur = num(a.duration);
    if (!e || !e.available || pos === null || dur === null || dur <= 0) return null;
    const at = Date.parse(a.position_updated_at || '');
    const cur = Math.max(0, Math.min(dur, pos + (e.state === 'playing' && Number.isFinite(at) ? Math.max(0, (now - at) / 1000) : 0)));
    const mm = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
    return item('progress', 'Progress', { value: cur, unit: 's', kind: 'percent', fraction: cur / dur, text: `${mm(cur)} / ${mm(dur)}`, origin: 'derived' });
  }
  /* ---- INFORMATION SLOTS: extra REAL values from other HA entities, chosen by the dashboard owner in Settings.
     config.info = [{ id, label?, entity, value: 'state' | <an information key of that entity> }]   (at most 3)
     Each is resolved here, through the SAME shared poll and the SAME formatter, into a read-only item the widget only shows:
       { id, label, labelOrigin: 'user', entity, source, state: 'loading' | 'ready' | 'absent' | 'missing',
         value, text, unit, kind, fraction?, available, origin: 'ha' | 'derived', line }
     line = ready-made text ("Phone 64%", "Door Closed"); '' while loading (never a demo value). The label is YOUR text;
     the value is Home Assistant's. An unavailable slot never makes the widget itself unavailable. */
  /** ACTIVE (generic): is the entity "doing its thing" right now, in Home Assistant's own state words — the states that mean active per
      domain. Unavailable / unknown / not loaded → not active; a domain not listed here → never active (an "Always" choice is the
      owner's, elsewhere). Used e.g. to run a configured icon animation only while the entity is active. */
  const ACTIVE_STATES = { fan: ['on'], light: ['on'], switch: ['on'], input_boolean: ['on'], binary_sensor: ['on'], media_player: ['playing'],
    vacuum: ['cleaning'], lawn_mower: ['mowing'] };
  /** a climate is ACTIVE while it is doing something (its hvac_action: heating, cooling…) — never because of its mode (heat ≠ heating) */
  const CLIMATE_ACTIVE = ['heating', 'cooling', 'drying', 'fan', 'preheating', 'defrosting'];
  const isActive = (e) => !!(e && e.available !== false && (e.domain === 'climate' ? CLIMATE_ACTIVE.includes(String(e.attrs?.hvac_action))
    : ACTIVE_STATES[e.domain] && ACTIVE_STATES[e.domain].includes(String(e.state))));
  const SLOT_MAX = 3;
  const SLOT_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
  /** ROLES MAP (config.map = { <role>: entity id }): the entities of a widget's named roles, and their live values as { value, unit, ok }
      (ok: Home Assistant reports a number); a role whose entity does not exist → { ok: false, missing: true }; not mapped → null */
  const roleMany = (keys) => (c) => keys.map((k) => c && c.map && c.map[k]).filter((id) => typeof id === 'string' && SLOT_ID.test(id));
  const roleItems = (keys) => (c, vals, known) => Object.fromEntries(keys.map((k) => {
    const id = c && c.map && c.map[k];
    if (!id) return [k, null];
    const e = vals[id];
    if (!e) return [k, known[id] ? { ok: false, missing: true } : null];
    return [k, { value: e.state, unit: e.unit || '', ok: e.available !== false && e.state !== '' && e.state !== null && Number.isFinite(Number(e.state)) }];
  }));
  const slotsOf = (c) => (Array.isArray(c?.info) ? c.info.filter((x) => x && typeof x.entity === 'string' && SLOT_ID.test(x.entity)).slice(0, SLOT_MAX) : []);
  function slotItem(slot, e, known) {
    const label = typeof slot.label === 'string' ? slot.label.trim() : '';
    const base = { id: slot.id, label, labelOrigin: 'user', entity: slot.entity, source: slot.value || 'state', value: null, text: '', unit: null, kind: 'text', available: false, origin: 'ha', line: '' };
    if (!e) return { ...base, state: known ? 'missing' : 'loading', line: known ? `${label || slot.entity}: not found` : '' };
    const inf = info(e);
    const it = base.source === 'state' ? inf.state : inf.items.find((x) => x.key === base.source);
    if (!it) return { ...base, state: 'absent' };                     // that information is not reported right now
    const ok = e.available !== false && it.available !== false;
    const text = ok ? it.text : (String(e.state).toLowerCase() === 'unknown' ? 'Unknown' : 'Unavailable');
    return { ...base, state: 'ready', value: it.value, text, unit: it.unit ?? null, kind: it.kind, ...(it.fraction !== undefined ? { fraction: it.fraction } : {}),
      available: ok, origin: it.origin || 'ha', line: label ? `${label} ${ok ? text : text.toLowerCase()}` : text };
  }
  /** the information a slot can show for an entity: its state, or one of the items IniqHA.info() reports (no raw attributes) */
  function slotSources(e) {
    if (!e) return [{ value: 'state', label: 'State' }];
    return [{ value: 'state', label: 'State' }, ...info(e).items.filter((x) => x.key !== 'state').map((x) => ({ value: x.key, label: x.label }))];
  }

  /* ---- ENTITY LIST rows: validated entity ids, at most LIST_MAX; a row's value is slotItem() (the shared information formatter) */
  const LIST_MAX = 20;
  const activityRows = (c) => (Array.isArray(c?.entries) ? c.entries.filter((x) => x && typeof x.entity === 'string' && SLOT_ID.test(x.entity)).slice(0, LIST_MAX) : []);
  const LIST_RUN = { scene: 'Activate', script: 'Run', button: 'Press', input_button: 'Press' };
  const listRows = (c) => (Array.isArray(c?.rows) ? c.rows.filter((x) => x && typeof x.entity === 'string' && SLOT_ID.test(x.entity)).slice(0, LIST_MAX) : []);
  /** the one obvious, safe control of an entity (null: a status row). Chosen by domain + capability; lock / alarm / climate… have none here. */
  function listControl(e) {
    if (!e || !e.available) return null;
    if (['light', 'switch', 'input_boolean', 'fan'].includes(e.domain)) return { type: 'toggle', on: e.state === 'on' };
    if (e.domain === 'cover' && e.caps?.open && e.caps?.close) return { type: 'move', verb: ['open', 'opening'].includes(e.state) ? 'close' : 'open' };
    return LIST_RUN[e.domain] ? { type: 'run', label: LIST_RUN[e.domain] } : null;
  }
  function listItem(row, e, known) {
    const it = slotItem(row, e, known);
    return { id: row.id, entity: row.entity, name: it.label || (e && e.name) || row.entity, text: it.text, kind: it.kind, state: it.state, available: it.available,
      control: it.state === 'ready' && it.source === 'state' ? listControl(e) : null };
  }

  /* ---- HISTORY (shared): which kind of history an entity has, and a state timeline in Home Assistant's own words.
     Used by Sensor inline history now, by Entity Details later; Chart keeps asking for numeric history. */
  const HIST_NUMERIC_DOMAINS = ['sensor', 'input_number', 'number', 'counter'];
  /** 'numeric' for a measured value (its state is a number), 'states' for on/off and other states (a timeline) */
  function historyKind(e) {
    if (!e) return null;
    if (e.domain === 'binary_sensor' || !HIST_NUMERIC_DOMAINS.includes(e.domain)) return 'states';
    const si = stateItem(e);
    if (si && ['number', 'percent', 'duration'].includes(si.kind)) return 'numeric';
    return num(e.state) !== null || (e.attrs?.state_class && e.unit) ? 'numeric' : 'states';
  }
  /** HA state periods → timeline segments with the same wording the widget shows (door → Open / Closed); unavailable /
      unknown are gaps (never a normal state) */
  function timeline(e, segments) {
    const dc = e?.attrs?.device_class || null;
    return (segments || []).map(([t, st]) => {
      const low = String(st).toLowerCase();
      if (low === 'unavailable' || low === 'unknown' || low === '') return { t, state: st, tone: 'gap', word: low === 'unknown' ? 'Unknown' : 'Unavailable' };
      const it = stateItem({ ...(e || {}), state: st, available: true, attrs: { ...(e?.attrs || {}), device_class: dc } });
      const tone = it.kind === 'onoff' ? it.tone : (low === 'on' ? 'on' : low === 'off' ? 'off' : 'state');
      return { t, state: st, tone, word: it.text };
    });
  }
  /** ONE IntersectionObserver for every history layer (not one per widget) */
  const onScreen = (() => {
    let io = null; const cbs = new Map();
    return (el, cb) => {
      if (typeof IntersectionObserver !== 'function') { cb(true); return () => {}; }
      if (!io) io = new IntersectionObserver((en) => en.forEach((x) => { const f = cbs.get(x.target); if (f) f(x.isIntersecting); }));
      cbs.set(el, cb); io.observe(el);
      return () => { io.unobserve(el); cbs.delete(el); };
    };
  })();
  const HIST_RANGES = ['1h', '6h', '24h'];
  const HIST_MODES = ['auto', 'line', 'area', 'timeline'];

  /** everything truthful IniqDash knows about this entity (Batch 1: primary entity only) */
  function info(e) {
    if (!e) return null;
    const ts = (key, label, v) => (v ? item(key, label, { value: v, kind: 'timestamp', text: when(v) }) : null);
    return { state: stateItem(e), since: ts('since', 'Since', e.changed), updated: ts('updated', 'Updated', e.updated), reported: ts('reported', 'Last report', e.reported), items: domainItems(e) };
  }

  /* ---- APPLIANCE · Washing Machine profile: typed mappings (config.mappings = { role: entity id }) chosen by the owner.
     Each role accepts only its own domains (never guessed from names); a mapped entity is resolved here, through the shared
     formatter, into what the widget shows: { state: 'loading' | 'missing' | 'ready', entity, available, text, … }. */
  const WASHER_DOMAINS = { program: ['sensor', 'select', 'input_select', 'input_text'], remaining: ['sensor'], progress: ['sensor', 'number', 'input_number'],
    power: ['sensor'], door: ['binary_sensor'], start: ['button', 'input_button', 'switch'], pause: ['button', 'input_button', 'switch'], programSelect: ['select', 'input_select'] };
  const DOOR_CLASSES = ['door', 'opening', 'window', 'garage_door'];
  const APP_MAPPED = new WeakMap();      // a bound config → { vals: { id: entity|null }, known: { id: true } }
  function washerIds(c) {
    const m = c && c.mappings && typeof c.mappings === 'object' ? c.mappings : {};
    return Object.fromEntries(Object.entries(WASHER_DOMAINS).map(([role, doms]) => {
      const id = m[role];
      return [role, typeof id === 'string' && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(id) && doms.includes(id.split('.')[0]) ? id : null];
    }));
  }
  /** the primary entity as the profile needs it: its raw state, HA's words for it, availability, domain, device class */
  const washerPrimary = (e) => ({ state: e.state, text: e.available ? stateItem(e).text : '', available: !!e.available, domain: e.domain, dc: e.attrs?.device_class || null });
  function washerRole(role, e) {
    const base = { state: 'ready', entity: e.id, available: !!e.available };
    if (!e.available) { const w = String(e.state).toLowerCase() === 'unknown' ? 'unknown' : 'unavailable'; return { ...base, text: role === 'door' ? `Door ${w}` : w, value: null, open: null }; }
    const si = stateItem(e), n = num(e.state), dc = e.attrs?.device_class || null;
    switch (role) {
      case 'remaining': {
        if (dc === 'timestamp') { const t = when(e.state); return { ...base, text: t ? `Ends ${t}` : si.text }; }
        const d = n !== null && e.unit ? duration(n, e.unit) : '';
        return { ...base, text: d ? `${d} left` : si.text };
      }
      case 'progress':
        // a ring only for a real percentage; another unit is not turned into one
        return { ...base, value: n !== null && e.unit === '%' ? Math.max(0, Math.min(100, n)) : null, text: si.text };
      case 'door': {
        const known = DOOR_CLASSES.includes(dc);
        return { ...base, open: known ? e.state === 'on' : null, text: known ? (e.state === 'on' ? 'Door open' : e.state === 'off' ? 'Door closed' : `Door ${si.text}`) : `Door ${si.text}` };
      }
      case 'programSelect': return { ...base, value: e.state, options: Array.isArray(e.attrs?.options) ? e.attrs.options.slice() : [], text: e.state };
      default: return { ...base, text: si.text };
    }
  }
  function washerMapped(c) {
    const ids = washerIds(c), store = APP_MAPPED.get(c), out = {};
    Object.entries(ids).forEach(([role, id]) => {
      if (!id) { out[role] = null; return; }
      if (!store || !store.known[id]) { out[role] = { state: 'loading', entity: id }; return; }
      const e = store.vals[id];
      out[role] = e ? washerRole(role, e) : { state: 'missing', entity: id };
    });
    return out;
  }
  function washerConfig(c, e) {
    const ids = washerIds(c);
    return { ...c, ha: washerPrimary(e), mapped: washerMapped(c), available: !!e.available,
      controls: { start: !!ids.start, pause: !!ids.pause, program: !!ids.programSelect },
      programme: undefined, remaining: undefined, progress: undefined, demoPower: undefined, demoDoor: undefined, secondary: undefined, actions: [] };
  }

  /* ---- ROBOT: the battery — the owner's mapped sensor wins; otherwise the entity's own battery attribute (when HA reports one) */
  function robotBattery(c, e) {
    const id = c?.mappings?.battery;
    if (typeof id === 'string' && /^sensor\.[a-z0-9_]+$/.test(id)) {
      const st = APP_MAPPED.get(c);
      if (!st || !st.known[id]) return { state: 'loading' };
      const m = st.vals[id];
      if (!m) return { state: 'missing' };
      const n = m.available ? num(m.state) : null;
      return n !== null && n >= 0 && n <= 100 ? { state: 'ok', value: Math.round(n), source: 'entity' } : { state: 'na' };
    }
    const n = num(e?.attrs?.battery);
    return n !== null ? { state: 'ok', value: n, source: 'attribute' } : null;
  }

  /* ---- CAMERA · Doorbell presentation: chips from explicitly mapped entities (config.mappings = { ring, motion, lock, battery }).
     Only what Home Assistant says, in its own words: a doorbell binary sensor, or an event entity's last event (state = its timestamp). */
  const DOORBELL = { ring: ['binary_sensor', 'event'], motion: ['binary_sensor'], lock: ['lock'], battery: ['sensor'] };
  const DOORBELL_LABEL = { ring: 'Doorbell', motion: 'Motion', lock: 'Door', battery: 'Battery' };
  const doorbellIds = (c) => Object.fromEntries(Object.keys(DOORBELL).map((r) => { const id = c?.mappings?.[r]; return [r, typeof id === 'string' && SLOT_ID.test(id) && DOORBELL[r].includes(id.split('.')[0]) ? id : null]; }));
  function doorbellChips(c, now = Date.now()) {
    const ids = doorbellIds(c), store = APP_MAPPED.get(c), out = [];
    Object.entries(ids).forEach(([role, id]) => {
      if (!id || !store || !store.known[id]) return;                       // not mapped / not answered yet: nothing is shown
      const e = store.vals[id];
      let label = DOORBELL_LABEL[role], text, tone = null;
      if (!e) text = 'not found';
      else if (!e.available) text = String(e.state).toLowerCase() === 'unknown' ? 'unknown' : 'unavailable';
      else if (e.domain === 'event') {                                      // an event entity: its state is the moment of the last event
        const t = Date.parse(e.state);
        label = 'Last ring';
        text = Number.isFinite(t) ? (now - t < 60000 && now >= t - 5000 ? 'just now' : when(t, now)) : 'never';
        if (Number.isFinite(t) && now - t < 60000 && now >= t - 5000) tone = 'alert';
      } else {
        text = stateItem(e).text;
        if (role === 'ring' || role === 'motion') tone = e.state === 'on' ? 'alert' : null;
        if (role === 'battery' && num(e.state) !== null && num(e.state) <= 15) tone = 'alert';
      }
      out.push({ key: role, label, text, tone });
    });
    return out;
  }

  /** Person · the tracking device: { name, sourceType, battery } from the tracker entity (null: none reported / not answered yet) */
  function personTracker(e, store) {
    const t = e.domain === 'device_tracker' ? e : (typeof e.attrs?.source === 'string' && store && store.vals[e.attrs.source]) || null;
    if (!t) return null;
    return { name: t.name, sourceType: t.attrs?.source_type || null, battery: num(t.attrs?.battery) };
  }

  /* ---- CAMERA · PTZ presentation: controls from explicitly mapped entities (config.mappings = { tiltUp, tiltDown, panLeft, panRight, zoomIn,
     zoomOut: button / input_button · preset: select / input_select · spotlight: light / switch · privacy: switch · motion: binary_sensor }).
     Home Assistant has no universal PTZ service: only entities the camera's own integration provides are used, through the generic secure
     actions (press, select an option, turn on / off) the server plans from the entity's domain. */
  const PTZ = { tiltUp: ['button', 'input_button'], tiltDown: ['button', 'input_button'], panLeft: ['button', 'input_button'], panRight: ['button', 'input_button'],
    zoomIn: ['button', 'input_button'], zoomOut: ['button', 'input_button'], preset: ['select', 'input_select'], spotlight: ['light', 'switch'], privacy: ['switch'], motion: ['binary_sensor'] };
  const ptzIds = (c) => Object.fromEntries(Object.keys(PTZ).map((r) => { const id = c?.mappings?.[r]; return [r, typeof id === 'string' && SLOT_ID.test(id) && PTZ[r].includes(id.split('.')[0]) ? id : null]; }));
  /** the PTZ view: which controls exist (mapped) and what Home Assistant says of the stateful ones (presets, spotlight, privacy, motion) */
  function ptzView(c) {
    const ids = ptzIds(c), store = APP_MAPPED.get(c), val = (id) => (store && id ? store.vals[id] : null), out = { controls: {} };
    Object.entries(ids).forEach(([r, id]) => { if (id) out.controls[r] = true; });
    const pe = val(ids.preset);
    if (ids.preset) out.preset = { options: (pe && Array.isArray(pe.attrs?.options) ? pe.attrs.options : []).slice(0, 40), value: pe ? pe.state : null, available: !!(pe && pe.available) };
    ['spotlight', 'privacy', 'motion'].forEach((r) => { if (ids[r]) { const e = val(ids[r]); out[r] = e ? (e.available ? e.state === 'on' : null) : null; } });
    return out;
  }

  /* ---- SUN & MOON: the sun.sun entity is the primary; the moon is ONLY what the owner maps (config.mappings = { moon, moonrise, moonset }, sensors) */
  const MOON_ROLES = ['moon', 'moonrise', 'moonset'];
  const moonIds = (c) => Object.fromEntries(MOON_ROLES.map((r) => { const id = c?.mappings?.[r]; return [r, typeof id === 'string' && /^sensor\.[a-z0-9_]+$/.test(id) ? id : null]; }));
  const MOON_PHASES = ['new_moon', 'waxing_crescent', 'first_quarter', 'waxing_gibbous', 'full_moon', 'waning_gibbous', 'last_quarter', 'waning_crescent'];
  function sunMoonMapped(c) {
    const ids = moonIds(c), store = APP_MAPPED.get(c), out = {};
    MOON_ROLES.forEach((role) => {
      const id = ids[role];
      if (!id) { out[role] = null; return; }
      if (!store || !store.known[id]) { out[role] = { state: 'loading' }; return; }
      const e = store.vals[id];
      if (!e) { out[role] = { state: 'missing' }; return; }
      const st = String(e.state);
      if (role === 'moon') out[role] = { state: 'ready', available: !!e.available, phase: MOON_PHASES.includes(st.toLowerCase()) ? st.toLowerCase() : null, text: e.available ? clean(st) : st };
      else { const t = e.available ? Date.parse(st) : NaN; out[role] = { state: 'ready', ts: Number.isFinite(t) ? t : null, text: e.available ? clean(st) : (st.toLowerCase() === 'unknown' ? 'unknown' : 'unavailable') }; }
    });
    return out;
  }
  const sunData = (e) => {
    const a = e.attrs || {}, t = (v) => (v ? Date.parse(v) : null);
    return { state: e.available ? e.state : (String(e.state).toLowerCase() === 'unknown' ? 'unknown' : 'unavailable'), elevation: num(a.elevation), azimuth: num(a.azimuth),
      events: { rising: t(a.next_rising), setting: t(a.next_setting), noon: t(a.next_noon), dawn: t(a.next_dawn), dusk: t(a.next_dusk), midnight: t(a.next_midnight) } };
  };

  /* ---- ENERGY FLOW: the Home power entity is the primary; every other role is an explicitly mapped sensor (config.mappings),
     resolved here into { state, entity, available, value, unit, text } — a number and HA's own unit, nothing calculated. */
  const ENERGY_ROLES = ['solar', 'grid', 'gridImport', 'gridExport', 'battery', 'batteryLevel', 'ev', 'evLevel', 'solarToday', 'gridImportToday', 'gridExportToday', 'homeToday', 'evToday'];
  const energyIds = (c) => Object.fromEntries(ENERGY_ROLES.map((r) => { const id = c?.mappings?.[r]; return [r, typeof id === 'string' && /^sensor\.[a-z0-9_]+$/.test(id) ? id : null]; }));
  const energyValue = (e) => (!e.available ? { state: 'ready', entity: e.id, available: false, value: null, unit: e.unit || '', text: String(e.state).toLowerCase() === 'unknown' ? 'unknown' : 'unavailable' }
    : { state: 'ready', entity: e.id, available: true, value: num(e.state), unit: e.unit || '', text: stateItem(e).text });
  function energyMapped(c) {
    const ids = energyIds(c), store = APP_MAPPED.get(c), out = {};
    // grid: only the entities of the chosen mode take part
    const sep = c.gridMode === 'separate';
    Object.entries(ids).forEach(([role, id]) => {
      if (!id || (sep && role === 'grid') || (!sep && (role === 'gridImport' || role === 'gridExport'))) { out[role] = null; return; }
      if (!store || !store.known[id]) { out[role] = { state: 'loading', entity: id }; return; }
      const e = store.vals[id];
      out[role] = e ? energyValue(e) : { state: 'missing', entity: id };
    });
    return out;
  }
  /** the dynamic nodes' entities (MaisonEnergy.nodeEntities — exactly what the user added), resolved the same way */
  function energyNodeVals(c) {
    const ids = global.MaisonEnergy && global.MaisonEnergy.nodeEntities ? global.MaisonEnergy.nodeEntities(c) : [], store = APP_MAPPED.get(c), out = {};
    ids.forEach((id) => { if (!store || !store.known[id]) out[id] = { state: 'loading', entity: id }; else out[id] = store.vals[id] ? energyValue(store.vals[id]) : { state: 'missing', entity: id }; });
    return out;
  }

  /** Light colour: the kelvin range the light reports (a colour-temperature control needs both ends), the current kelvin / hue
      (only in the colour mode that makes them true) */
  function lightColour(e) {
    const a = e.attrs || {}, k = e.caps || {};
    const lo = num(a.min_color_temp_kelvin), hi = num(a.max_color_temp_kelvin);
    const range = k.color_temp && lo !== null && hi !== null && hi > lo ? { min: lo, max: hi } : null;
    const colourMode = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(a.color_mode);
    return { range, kelvin: range && a.color_mode === 'color_temp' ? num(a.color_temp_kelvin) : null, hue: k.color && colourMode ? num(a.hue) : null };
  }

  /** Sensor · Level: the range a value is drawn in — a percentage (0–100), the entity's own range (number / input_number), or the owner's
      levelMin / levelMax. Nothing else: no range → null → no bar. */
  function sensorLevel(c, e, numeric) {
    if (!numeric) return null;
    if (e.unit === '%') return { min: 0, max: 100 };
    const a = e.attrs || {};
    if (num(a.min) !== null && num(a.max) !== null && Number(a.max) > Number(a.min)) return { min: Number(a.min), max: Number(a.max) };
    return num(c.levelMin) !== null && num(c.levelMax) !== null && Number(c.levelMax) > Number(c.levelMin) ? { min: Number(c.levelMin), max: Number(c.levelMax) } : null;
  }

  /* ---- one entry per widget type: which domains, config from an entity, live update, actions */
  const B = {
    sensor: {
      domains: ['sensor', 'binary_sensor', 'input_number', 'number', 'weather', 'sun'],
      config(c, e) {
        if (!e) return c;
        const v = num(e.state);
        const icons = global.MaisonSensor?.ICONS || {};
        // linked: the unit is the entity's own (none → none, never a stale demo unit); the configured trend arrow and the
        // static secondary reading are your own fixed values, not Home Assistant data: never shown for a linked entity.
        // A non-numeric state is shown in Home Assistant's own words (door → Open / Closed, a timestamp → 14:05…).
        const si = stateItem(e);
        const numeric = e.available && v !== null && si.kind !== 'duration';
        // Status variant: the tone comes from Home Assistant's own meaning of the state (an alert class that is on), never invented
        const stTone = c.variant === 'status' && e.available ? (si.tone === 'warning' ? 'warning' : si.tone === 'on' ? 'normal' : 'neutral') : null;
        return { ...c, level: sensorLevel(c, e, numeric), ...(stTone ? { tone: stTone } : {}), value: !e.available ? e.state : numeric ? v : si.text, unit: numeric ? (e.unit || '') : '', trend: 'none', secondary: null,
          // the built-in DEMO caption ("Comfortable", the widget's default) is never shown next to a live value; your own caption is
          status: c.status === DEMO_CAPTION ? '' : c.status,
          ...(c.icon === undefined && icons[e.attrs?.device_class] ? { icon: e.attrs.device_class } : {}) };
      },
      update(el, e, c) { const x = this.config(c, e); el.sensor?.setState({ value: x.value, unit: x.unit, level: x.level, ...(x.variant === 'status' ? { tone: x.tone } : {}) }); },
      caps: () => '',
      /** INLINE HISTORY (optional, config.history = { mode, range, position }): the PRIMARY entity's real HA history drawn
          inside the widget (IniqWidgetKit.historyLayer). Nothing is requested unless it is switched on; it loads only while
          the widget is on screen and the tab is visible, and refreshes at the server's history pace (1 h: 1 min · 6 h: 2 min
          · 24 h: 5 min — never the 2-second state poll), on the clock, so every sensor refreshes in the same batch. */
      start({ wrap, widget, ha, id, config, last }) {
        // the Mini Graph variant IS the history: it draws the real history of the entity (range: config.graphRange)
        const H = config.history || (config.variant === 'graph' ? { mode: 'area', range: HIST_RANGES.includes(config.graphRange) ? config.graphRange : '6h', position: 'bottom' } : null);
        const K = global.IniqWidgetKit;
        if (!H || !HIST_MODES.includes(H.mode) || !K || !K.historyLayer) return null;
        const range = HIST_RANGES.includes(H.range) ? H.range : '6h';
        const pos = H.position === 'background' ? 'background' : 'bottom';
        let layer = null, t = 0, stopped = false, every = 60000, visible = true;
        const unSee = onScreen(wrap, (v) => { const was = visible; visible = v; if (v && !was) tick(300); });
        async function load() {
          const e = last(), w = widget();
          if (!e || !w || !w.sensor) return false;                    // not built yet (first state not arrived)
          const kind = historyKind(e);
          const style = kind === 'states' ? 'timeline' : H.mode === 'area' ? 'area' : 'line';   // an invalid choice for this entity falls back
          if (!layer || layer.host !== w) { if (layer) layer.destroy(); layer = K.historyLayer(w, { position: pos }); }
          const d = await ha.history(id, range, kind);
          if (stopped) return true;
          if (layer.host !== widget()) return false;
          wrap.dataset.historyKind = kind;
          if (d.ok) {
            every = Math.max(30, Number(d.refresh) || 60) * 1000;
            if (kind === 'states') {
              const segs = timeline(e, d.segments);
              layer.set(segs.some((x) => x.tone !== 'gap') ? { style, segments: segs, start: d.from ?? d.start, end: d.end } : { style, empty: true });
            } else {
              const pts = (d.points || []).map((q) => [q[0], q[1]]);
              layer.set(pts.some((q) => q[1] !== null) ? { style, points: pts, start: d.start, end: d.end, step: d.step } : { style, empty: true });
            }
          } else {
            every = 20000;                                            // retry a failure sooner; the last drawn history stays
            if (!layer.has()) layer.clear();
          }
          return true;
        }
        function tick(delay) {
          clearTimeout(t);
          // on the clock: the next multiple of the refresh time (+ a little), so sensors refresh together → one batch
          const wait = delay !== undefined ? delay : every - (Date.now() % every) + 150;
          t = setTimeout(async () => {
            if (stopped) return;
            if (!visible || document.hidden || !wrap.isConnected) return tick();
            const done = await load();
            if (!done) return tick(500);                               // waiting for the widget's first real state
            tick();
          }, wait);
        }
        const vis = () => { if (!document.hidden && visible) tick(300); };
        document.addEventListener('visibilitychange', vis);
        tick(0);
        return () => { stopped = true; clearTimeout(t); unSee(); document.removeEventListener('visibilitychange', vis); if (layer) layer.destroy(); };
      },
    },
    light: {
      domains: ['light'],
      config(c, e) {
        if (!e) return c;
        const dim = !!e.caps?.brightness;
        const br = num(e.attrs?.brightness_pct);
        const x = lightColour(e);
        return { ...c, state: e.state === 'on' ? 'on' : 'off', available: e.available !== false, capabilities: { ...(c.capabilities || {}), power: true, brightness: dim, colorTemp: !!x.range, color: !!e.caps?.color, effect: !!e.caps?.effect },
          effects: e.caps?.effect ? e.attrs.effect_list : undefined, effect: e.caps?.effect ? (e.attrs.effect ?? undefined) : undefined,
          colorTempRange: x.range || undefined, colorTempK: x.kelvin ?? undefined, hue: x.hue ?? undefined, ...(dim && br !== null ? { brightness: Math.max(1, br) } : {}) };
      },
      update(el, e) {
        const br = num(e.attrs?.brightness_pct), x = lightColour(e);
        el.light?.setState({ state: e.state === 'on' ? 'on' : 'off', available: e.available !== false, colorTempK: x.kelvin ?? null, hue: x.hue ?? null, effect: e.caps?.effect ? (e.attrs.effect ?? null) : null, ...(e.caps?.brightness && br !== null ? { brightness: Math.max(1, br) } : {}) });
      },
      caps: (e) => (e ? `b${e.caps?.brightness ? 1 : 0}${e.caps?.color ? 'c' : ''}${e.caps?.effect ? JSON.stringify(e.attrs.effect_list) : ''}${lightColour(e).range ? JSON.stringify(lightColour(e).range) : ''}` : ''),
      view: (e) => ({ state: e.state === 'on' ? 'on' : 'off', brightness: num(e.attrs?.brightness_pct), dim: !!e.caps?.brightness, colorTempK: lightColour(e).kelvin ?? null, hue: lightColour(e).hue ?? null, effect: e.attrs?.effect ?? null }),
      // compared with what Home Assistant has / was last asked (the widget already shows a drag while it happens)
      actions(next, v, meta = {}) {
        const out = [];
        // a TOGGLE option that sets a value of a light that is off: the value itself turns it on (every value call is light.turn_on)
        if (meta.source === 'toggle' && next.state === 'on' && v.state !== 'on') {
          if (meta.sets === 'colorTemp' && next.colorTempK != null) out.push(['color_temp', next.colorTempK]);
          else if (meta.sets === 'color' && next.hue != null) out.push(['hue', next.hue]);
          else if (meta.sets === 'brightness' && v.dim && next.brightness != null) out.push(['brightness', next.brightness]);
          if (out.length) return out;
        }
        if ((next.state === 'on') !== (v.state === 'on')) return next.state === 'on' ? [['turn_on']] : [['turn_off']];
        if (next.state === 'on' && v.dim && next.brightness !== v.brightness) out.push(['brightness', next.brightness]);
        if (next.colorTempK != null && next.colorTempK !== v.colorTempK) out.push(['color_temp', next.colorTempK]);
        else if (next.hue != null && next.hue !== v.hue) out.push(['hue', next.hue]);
        if (next.effect != null && next.effect !== '' && next.effect !== v.effect) out.push(['effect', next.effect]);
        return out;
      },
    },
    switch: {
      domains: ['switch', 'input_boolean'],
      // linked: your own caption is not shown next to the live state (it would read like a live status)
      config(c, e) { return e ? { ...c, state: e.state, available: e.available, secondaryStatus: '' } : c; },
      update(el, e) { el.switch?.setState({ state: e.state, available: e.available }); },
      caps: () => '',
      view: (e) => ({ state: e.state }),
      actions(next, v) { return next.state !== v.state ? [[next.state === 'on' ? 'turn_on' : 'turn_off']] : []; },
    },
    climate: {
      domains: ['climate'],
      config(c, e) {
        if (!e) return c;
        const a = e.attrs || {};
        const known = Object.keys(global.MaisonClimate?.MODES || {});
        const modes = (e.caps?.hvac_modes || []).filter((m) => known.includes(m));
        const tgt = num(a.target_temperature);
        const action = a.hvac_action === 'preheating' ? 'heating' : a.hvac_action;
        const unit = HA()?.status().temperatureUnit;
        return {
          ...c,
          // 'Show room temperature' off: some devices report an unusable value (a stove's flue sensor…)
          currentTemperature: c.showCurrent === false ? null : num(a.current_temperature),
          ...(tgt !== null ? { targetTemperature: tgt } : {}),
          minTemperature: num(a.min_temp) ?? c.minTemperature, maxTemperature: num(a.max_temp) ?? c.maxTemperature,
          temperatureStep: num(a.target_temp_step) || (c.temperatureStep ?? 0.5),
          ...(unit === '°C' || unit === '°F' ? { unit } : {}),
          hvacModes: modes.length ? modes : [e.state].filter((m) => known.includes(m)),
          hvacMode: e.state,
          state: e.state === 'off' ? 'off' : (action || undefined),
          // extras: only what the entity reports (a list AND its feature bit); humidity and the target range are read-only
          presets: e.caps?.preset_mode ? a.preset_modes : [], preset: a.preset_mode ?? undefined, fanModes: e.caps?.fan_mode ? a.fan_modes : [], fanMode: a.fan_mode ?? undefined,
          humidity: num(a.current_humidity), targetRange: tgt === null && num(a.target_temp_low) !== null && num(a.target_temp_high) !== null ? { low: num(a.target_temp_low), high: num(a.target_temp_high) } : null,
          swingModes: e.caps?.swing_mode ? a.swing_modes : [], swingMode: a.swing_mode ?? undefined,
          humidityTarget: e.caps?.target_humidity && num(a.target_humidity) !== null ? { value: num(a.target_humidity), min: num(a.min_humidity), max: num(a.max_humidity) } : undefined,
          capabilities: { targetTemperature: !!e.caps?.target_temperature && tgt !== null, hvacMode: modes.length > 1, preset: !!e.caps?.preset_mode, fanMode: !!e.caps?.fan_mode,
            swingMode: !!e.caps?.swing_mode, targetHumidity: !!e.caps?.target_humidity && num(a.target_humidity) !== null,
            targetRange: !!e.caps?.target_range && tgt === null && num(a.target_temp_low) !== null && num(a.target_temp_high) !== null },
        };
      },
      update(el, e, c) {
        const x = this.config(c, e);
        el.climate?.setState({ currentTemperature: x.currentTemperature, ...(x.targetTemperature !== undefined ? { targetTemperature: x.targetTemperature } : {}), hvacMode: x.hvacMode, state: x.state || null,
        preset: x.preset, fanMode: x.fanMode, swingMode: x.swingMode, humidityTarget: x.humidityTarget, humidity: x.humidity, targetRange: x.targetRange });
      },
      caps: (e) => (e ? JSON.stringify([!!e.caps?.target_temperature && num(e.attrs?.target_temperature) !== null, e.caps?.hvac_modes, e.attrs?.min_temp, e.attrs?.max_temp, e.attrs?.target_temp_step, e.caps?.preset_mode && e.attrs?.preset_modes, e.caps?.fan_mode && e.attrs?.fan_modes, e.caps?.swing_mode && e.attrs?.swing_modes, e.caps?.target_humidity && [e.attrs?.min_humidity, e.attrs?.max_humidity, num(e.attrs?.target_humidity) !== null], e.caps?.target_range && num(e.attrs?.target_temp_low) !== null]) : ''),
      view: (e) => ({ hvacMode: e.state, targetTemperature: num(e.attrs?.target_temperature), canTarget: !!e.caps?.target_temperature, preset: e.attrs?.preset_mode ?? undefined, fanMode: e.attrs?.fan_mode ?? undefined, swingMode: e.attrs?.swing_mode ?? undefined,
        humidityTarget: num(e.attrs?.target_humidity) ?? undefined, range: num(e.attrs?.target_temp_low) !== null && num(e.attrs?.target_temp_high) !== null ? { low: num(e.attrs.target_temp_low), high: num(e.attrs.target_temp_high) } : undefined }),
      actions(next, v) {
        const out = [];
        if (next.hvacMode !== v.hvacMode) out.push(['set_hvac_mode', next.hvacMode]);
        if (v.canTarget && next.targetTemperature !== v.targetTemperature) out.push(['set_temperature', next.targetTemperature]);
        if (next.preset !== undefined && next.preset !== v.preset) out.push(['set_preset_mode', next.preset]);
        if (next.fanMode !== undefined && next.fanMode !== v.fanMode) out.push(['set_fan_mode', next.fanMode]);
        if (next.swingMode !== undefined && next.swingMode !== v.swingMode) out.push(['set_swing_mode', next.swingMode]);
        if (next.targetHumidity !== undefined && next.targetHumidity !== v.humidityTarget) out.push(['set_humidity', next.targetHumidity]);
        if (next.range && v.range && (next.range.low !== v.range.low || next.range.high !== v.range.high)) out.push(['set_temperature_range', `${next.range.low}:${next.range.high}`]);
        return out;
      },
    },
  };

  /* ---- Phase 2 */
  const TRIGGER_DOMAINS = ['scene', 'script', 'button', 'input_button', 'switch', 'light', 'fan', 'input_boolean', 'cover'];
  const mediaState = (st) => ({ on: 'idle', standby: 'off', buffering: 'playing' }[st] || st);
  Object.assign(B, {
    cover: {
      domains: ['cover'],
      config(c, e) {
        if (!e) return c;
        const p = num(e.attrs?.position);
        // the Garage / Gate picture is drawn from Home Assistant's device class only (never from the name)
        const dc = e.attrs?.device_class;
        return { ...c, state: e.state, available: e.available, kind: ['garage', 'gate', 'door'].includes(dc) ? dc : null, ...(p !== null ? { position: p } : {}),
          capabilities: { open: !!e.caps?.open, close: !!e.caps?.close, stop: !!e.caps?.stop, position: !!e.caps?.position } };
      },
      update(el, e) { const p = num(e.attrs?.position); el.cover?.setState({ state: e.state, available: e.available, ...(p !== null ? { position: p } : {}) }); },
      caps: (e) => (e ? JSON.stringify([e.caps?.open, e.caps?.close, e.caps?.stop, e.caps?.position]) : ''),
      view: (e) => ({ state: e.state, position: num(e.attrs?.position) }),
      actions(next) {
        if (next.request === 'position') return [['position', next.position]];
        return ['open', 'close', 'stop'].includes(next.request) ? [[next.request]] : [];
      },
    },
    fan: {
      domains: ['fan'],
      config(c, e) {
        if (!e) return c;
        const a = e.attrs || {};
        const step = num(a.percentage_step);
        const pct = num(a.percentage);
        return { ...c, state: e.state, available: e.available,
          ...(e.caps?.speed ? { speed: pct ?? c.speed, speedStep: step && step >= 10 ? step : 10 } : {}),
          ...(e.caps?.preset ? { presets: a.preset_modes, preset: a.preset_mode || a.preset_modes[0] } : {}),
          oscillating: e.caps?.oscillate ? a.oscillating : undefined, direction: e.caps?.direction ? a.direction : undefined,
          capabilities: { power: true, speed: !!e.caps?.speed, preset: !!e.caps?.preset } };
      },
      update(el, e, c) { const x = this.config(c, e); el.fan?.setState({ state: x.state, available: x.available, speed: x.speed, preset: x.preset, oscillating: x.oscillating, direction: x.direction }); },
      caps: (e) => (e ? JSON.stringify([e.caps?.speed, e.caps?.preset, e.attrs?.preset_modes, e.attrs?.percentage_step]) : ''),
      view: (e) => ({ state: e.state, speed: num(e.attrs?.percentage), preset: e.attrs?.preset_mode ?? null }),
      actions(next, v) {
        if (next.state !== v.state) return next.state === 'on' && next.speed !== null && next.speed !== v.speed ? [['percentage', next.speed]] : [[next.state === 'on' ? 'turn_on' : 'turn_off']];
        const out = [];
        if (next.state === 'on' && next.speed !== null && next.speed !== v.speed) out.push(['percentage', next.speed]);
        if (next.preset !== null && next.preset !== v.preset) out.push(['preset', next.preset]);
        return out;
      },
    },
    media: {
      domains: ['media_player'],
      config(c, e) {
        if (!e) return c;
        const a = e.attrs || {}, k = e.caps || {};
        return { ...c, state: mediaState(e.state), available: e.available,
          title: a.title || '', artist: [a.artist, a.album].filter(Boolean).join(' · ') || (a.app || ''), artwork: a.artwork || '',
          volume: a.volume ?? c.volume, muted: !!a.muted, source: a.source ?? undefined, sources: a.sources || [],
          // playback position as of when HA reported it (real values only — the widget advances it while playing)
          position: num(a.position), duration: num(a.duration), positionUpdatedAt: a.position_updated_at ? Date.parse(a.position_updated_at) : null,
          shuffle: typeof a.shuffle === 'boolean' ? a.shuffle : undefined, repeat: a.repeat ?? undefined,
          capabilities: { playPause: !!(k.play || k.pause || k.stop), volume: !!k.volume, mute: !!k.mute, source: !!k.source, previous: !!k.previous, next: !!k.next,
            shuffle: !!k.shuffle && typeof a.shuffle === 'boolean', repeat: !!k.repeat && !!a.repeat, power: !!k.power } };
      },
      update(el, e, c) { const x = this.config(c, e); el.media?.setState({ state: x.state, available: x.available, title: x.title, artist: x.artist, artwork: x.artwork, volume: x.volume, muted: x.muted, source: x.source,
        position: x.position, duration: x.duration, positionUpdatedAt: x.positionUpdatedAt, shuffle: x.shuffle, repeat: x.repeat }); },
      caps: (e) => (e ? JSON.stringify([e.caps, e.attrs?.sources]) : ''),
      view: (e) => ({ state: mediaState(e.state), volume: num(e.attrs?.volume), source: e.attrs?.source ?? null, muted: !!e.attrs?.muted, shuffle: e.attrs?.shuffle ?? null, repeat: e.attrs?.repeat ?? null }),
      actions(next, v, meta) {
        switch (meta.source) {
          case 'previous': return [['previous']];
          case 'next': return [['next']];
          case 'playPause': return [[next.state === 'playing' ? 'play' : 'pause']];
          case 'volume': return next.volume !== v.volume ? [['volume', next.volume]] : [];
          case 'mute': return [['mute', !!next.muted]];
          case 'power': return [['power', !!next.power]];
          case 'shuffle': return [['shuffle', !!next.shuffle]];
          case 'repeat': return next.repeat ? [['repeat', next.repeat]] : [];
          case 'source': return next.source && next.source !== v.source ? [['source', next.source]] : [];
          default: return [];
        }
      },
    },
    /* Action widget: a press triggers the entity (scene → activate, script → run, button → press,
       switch / light / fan / cover → toggle). Fixed server-side per domain — no free service calls. */
    action: {
      domains: TRIGGER_DOMAINS,
      config(c, e) { return e ? { ...c, available: e.available, status: e.available ? 'ready' : 'unavailable' } : c; },
      update(el, e) { el.action?.setState({ available: e.available, ...(e.available ? {} : { status: 'unavailable' }) }); },
      caps: () => '',
      hooks: ({ run, widget }) => ({
        onActivate: async () => { const ok = await run([['trigger']]); widget()?.action?.setState({ status: ok ? 'done' : 'failed' }); },
      }),
    },
    button: {
      domains: TRIGGER_DOMAINS,
      // linked: the static Value / Unit and the local "active" state are replaced by the entity's real state
      config(c, e) { return e ? { ...c, available: e.available, on: isOn(e), value: stateItem(e)?.text || '', unit: '' } : c; },
      update(el, e) { el.button?.setState({ available: e.available, on: isOn(e), value: stateItem(e)?.text || '', unit: '' }); },
      caps: () => '',
      hooks: ({ run }) => ({ onPress: () => { run([['trigger']]); } }),
    },
  });
  /** the "active" look of a Button follows the real state of a toggleable entity */
  function isOn(e) { return ['on', 'open', 'opening', 'playing'].includes(e.state); }

  /* ---- Phase 3: camera, lock, alarm */
  const MSG = { code_rejected: 'Code refused by Home Assistant', code_locked: 'Too many wrong codes — try again later', code_required: 'A code is needed', bad_code: 'That code format is not accepted', unavailable: 'Unavailable' };

  /** Ask for a lock / alarm code for ONE action. Returns the code (string) or null (cancelled).
      Nothing is remembered: the dialog and its value are discarded after the answer. */
  /** the masked code prompt (alarm panels, locks): the code goes straight to the secure action and is never kept — cleared on OK, Cancel,
      Escape and after `idleMs` without a key (default 30 s: a half-typed code never waits on screen); one answer only (no double submit) */
  function askCode({ title = 'Enter code', kind = 'number', idleMs = 30000 } = {}) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'iqcode';
      d.setAttribute('aria-label', title);
      const keys = kind === 'number' ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'ok'] : [];
      d.innerHTML = `<form method="dialog" class="iqcode__f"><p class="iqcode__t"></p>
        <input class="iqcode__in" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" ${kind === 'number' ? 'inputmode="numeric" pattern="[0-9]*"' : ''} aria-label="Code" maxlength="32">
        ${keys.length ? `<div class="iqcode__pad">${keys.map((k) => `<button type="button" class="iqcode__k" data-k="${k}">${k === 'clear' ? '⌫' : k === 'ok' ? 'OK' : k}</button>`).join('')}</div>` : ''}
        <div class="iqcode__row"><button type="button" class="iqcode__b" data-act="cancel">Cancel</button><button type="submit" class="iqcode__b iqcode__b--ok" data-act="ok">OK</button></div></form>`;
      d.querySelector('.iqcode__t').textContent = title;
      const input = d.querySelector('input');
      let done = false, idle = 0;
      const finish = (v) => { if (done) return; done = true; clearTimeout(idle); input.value = ''; d.close(); d.remove(); resolve(v); };
      const touch = () => { clearTimeout(idle); idle = setTimeout(() => finish(null), Math.max(1000, Number(idleMs) || 30000)); };
      d.addEventListener('keydown', touch, true); d.addEventListener('pointerdown', touch, true); d.addEventListener('input', touch, true);
      touch();
      d.querySelectorAll('.iqcode__k').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.k;
        if (k === 'clear') input.value = input.value.slice(0, -1);
        else if (k === 'ok') finish(input.value || null);
        else if (input.value.length < 32) input.value += k;
        input.focus();
      }));
      d.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(null));
      d.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); finish(input.value || null); });
      d.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
      // inside full-screen test mode the dialog must be in the fullscreen element to be visible
      document.body.appendChild(d);
      d.showModal();
      input.focus();
    });
  }

  Object.assign(B, {
    camera: {
      domains: ['camera'],
      config(c, e) {
        if (!e) return { ...c, image: '' };
        return { ...c, state: e.state, available: e.available, chips: c.variant === 'doorbell' ? doorbellChips(c) : undefined, ptz: c.variant === 'ptz' ? ptzView(c) : undefined,
          image: e.available && e.attrs?.image ? `${e.attrs.image}&t=${Date.now()}` : '' };
      },
      update(el, e) {
        const cam = el.camera; if (!cam) return;
        const first = e.available && !cam.getState().image && !cam.busy();   // the first picture as soon as the state is known
        cam.setState({ state: e.state, available: e.available, ...(first ? { image: `${e.attrs.image}&t=${Date.now()}` } : {}) });
      },
      caps: () => '',
      /** the picture refreshes from the shared layer (not the widget): one request at a time,
          only while the widget is on screen, the tab is visible and Home Assistant is reachable */
      start({ wrap, widget, ha, last, config }) {
        // Doorbell: the mapped entities join the shared poll; the chips are re-evaluated every 15 s too ("just now" ages out)
        const offs = [];
        if (config.variant === 'doorbell') {
          const store = { vals: {}, known: {} };
          APP_MAPPED.set(config, store);
          const push = () => { const w = widget(); if (w && w.camera) w.camera.setState({ chips: doorbellChips(config) }); };
          [...new Set(Object.values(doorbellIds(config)).filter(Boolean))].forEach((id) => offs.push(ha.subscribe(id, (m) => { store.vals[id] = m; store.known[id] = true; push(); })));
          const ageT = setInterval(() => { if (!document.hidden) push(); }, 15000);
          offs.push(() => clearInterval(ageT));
        }
        // PTZ: the mapped stateful entities (presets, spotlight, privacy, motion) join the shared poll; their state is what the controls show
        if (config.variant === 'ptz') {
          const store = { vals: {}, known: {} };
          APP_MAPPED.set(config, store);
          const push = () => { const w = widget(); if (w && w.camera) w.camera.setState({ ptz: ptzView(config) }); };
          const ids = ptzIds(config);
          // every mapped entity joins the poll: the stateful ones for what they show, the buttons for their availability (a press needs it)
          [...new Set(Object.values(ids).filter(Boolean))].forEach((id) => offs.push(ha.subscribe(id, (m) => { store.vals[id] = m; store.known[id] = true; push(); })));
        }
        const every = Math.min(300, Math.max(3, Number(config.refresh) || 10)) * 1000;
        let t = 0, onScreen = true, stopped = false;
        const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((en) => { const was = onScreen; onScreen = en.some((x) => x.isIntersecting); if (onScreen && !was) tick(300); }) : null;
        if (io) io.observe(wrap);
        const ready = () => !stopped && onScreen && !document.hidden && ha.status().state === 'connected' && last()?.available && wrap.isConnected;
        /* LONG-TERM STATISTICS (hour · day · week · month · year): HA's own. A TOTAL (has a sum: kWh, m³…) shows its CHANGE per period —
           the consumption; a MEASUREMENT (has a mean: W, °C…) its MEAN (or min / max). Asked for a change of a measurement (W is never
           a kWh total) or a mean of a total: the series says so instead of showing anything. A bucket HA has no row for is a gap. */
        async function loadStats(w) {
          const d = await ha.statistics(list.map((t) => t.entity), config.period || 'day');
          const lastN = Number.isInteger(config.count) && config.count > 0 ? config.count : 0;
          if (stopped) return;
          if (!d.ok) { every = 20000; w?.chart?.setState({ status: 'error', message: STAT_MSG[d.error] || `Statistics could not be loaded (${d.error || 'error'})`, ...(had ? {} : { series: [] }) }); return; }
          had = true; every = Math.max(60, Number(d.refresh) || 300) * 1000;
          const series = list.map((t, i) => {
            const r = (d.results || {})[t.entity] || { error: 'no_statistics' };
            const base = { id: t.entity, name: t.label || (i ? t.entity : config.name), color: t.color, unit: r.unit || '', points: [] };
            if (r.error) return { ...base, error: STAT_MSG[r.error] || 'No statistics' };
            const want = t.stat && t.stat !== 'auto' ? t.stat : r.hasSum ? 'change' : r.hasMean ? 'mean' : null;
            if (want === 'change' && !r.hasSum) return { ...base, error: 'Not a total — no consumption per period' };
            if (want !== 'change' && !r.hasMean) return { ...base, error: want === null ? 'No statistics' : 'No average kept for it' };
            const k = { change: 1, mean: 2, min: 3, max: 4 }[want];
            const pts = (r.points || []).map((p) => [p[0], sign(t, p[k] ?? null), null, null]);
            return { ...base, stat: want, points: lastN > 0 ? pts.slice(-lastN) : pts };
          });
          // config.count: only the most recent periods (e.g. 7 of the 30 daily values) — the time axis starts at the first one shown
          const first = lastN > 0 ? Math.min(...series.filter((s) => s.points.length).map((s) => s.points[0][0])) : NaN;
          w?.chart?.setState({ series, start: Number.isFinite(first) ? first : d.start, end: d.end, status: 'ok', message: '', period: config.period || 'day', count: lastN || null });
        }
        function tick(delay = every) {
          clearTimeout(t);
          t = setTimeout(() => {
            const w = widget();
            if (!ready() || !w?.camera) return tick();
            if (w.camera.busy()) return tick(1000);
            w.camera.setState({ image: `${last().attrs.image}&t=${Date.now()}` });
            tick();
          }, delay);
        }
        const vis = () => { if (!document.hidden) tick(300); };
        document.addEventListener('visibilitychange', vis);
        tick();
        return () => { stopped = true; clearTimeout(t); if (io) io.disconnect(); document.removeEventListener('visibilitychange', vis); offs.forEach((o) => o()); };
      },
      /** PTZ: a control press → ONE secure call on THAT mapped entity (press · select an option · turn on / off); never in a preview */
      hooks: ({ last, preview, resync, config }) => (config && config.variant === 'ptz' ? {
        haAction: async (role, value) => {
          const ha = HA(), id = ptzIds(config)[role];
          if (!id || role === 'motion' || !last()) return { ok: false, error: 'not_supported' };
          const e = ha.get(id);
          if (!e) return { ok: false, error: 'unknown_entity' };
          if (!e.available) return { ok: false, error: 'unavailable' };
          let action, v;
          if (role === 'preset') { if (!(e.attrs?.options || []).includes(value)) return { ok: false, error: 'not_an_option' }; action = 'select_option'; v = value; }
          else if (role === 'spotlight' || role === 'privacy') action = e.state === 'on' ? 'turn_off' : 'turn_on';
          else action = 'trigger';                                  // a move / zoom button: press
          if (preview()) { resync(); return { ok: false, error: 'preview' }; }
          return ha.call(id, action, v);
        },
      } : {}),
    },
    lock: {
      domains: ['lock'],
      config(c, e) {
        if (!e) return c;
        return { ...c, state: e.state, available: e.available, capabilities: { lock: !!e.caps?.lock, unlock: !!e.caps?.unlock, open: !!e.caps?.open } };
      },
      update(el, e) { el.lock?.setState({ state: e.state, available: e.available }); },
      caps: (e) => (e ? JSON.stringify([e.caps?.lock, e.caps?.unlock, e.caps?.open]) : ''),
      hooks: ({ run, widget, last, preview }) => ({
        onRequest: async (req) => {
          const e = last();
          let code;
          if (e?.attrs?.code && !preview()) {
            code = await askCode({ title: `${req === 'lock' ? 'Lock' : req === 'open' ? 'Open' : 'Unlock'} · ${e.name} — code`, kind: e.attrs.code });
            if (code === null) { widget()?.lock?.setState({ state: e.state }); return; }   // cancelled: back to the real state
          }
          await run([[req]], code);
          code = null;
        },
      }),
    },
    alarm: {
      domains: ['alarm_control_panel'],
      config(c, e) {
        if (!e) return c;
        const k = e.caps || {};
        return { ...c, state: e.state, available: e.available, modes: ['arm_home', 'arm_away', 'arm_night', 'arm_vacation', 'arm_custom_bypass'].filter((m) => k[m]),
          codeRequired: !!(e.attrs?.code_to_disarm || e.attrs?.code_to_arm),          // the keypad preset: Home Assistant's own code rule
          // a code prompt is already a deliberate step: no extra second press then
          confirmDisarm: e.attrs?.code_to_disarm ? false : c.confirmDisarm !== false };
      },
      update(el, e) { el.alarm?.setState({ state: e.state, available: e.available }); },
      caps: (e) => (e ? JSON.stringify([e.caps, e.attrs?.code_to_disarm]) : ''),
      hooks: ({ run, widget, last, preview }) => ({
        onRequest: async (req, opts = {}) => {
          const e = last();
          const needs = req === 'disarm' ? e?.attrs?.code_to_disarm : e?.attrs?.code_to_arm;
          let code;
          // the KEYPAD preset typed the code on the widget itself: it is handed straight to this same secure action (never kept)
          if (needs && !preview() && typeof opts.code === 'string' && /^[0-9A-Za-z]{1,32}$/.test(opts.code)) code = opts.code;
          else if (needs && !preview()) {
            const label = req === 'disarm' ? 'Disarm' : `Arm ${(global.MaisonAlarm?.MODE_LABEL?.[req] || '').toLowerCase()}`;
            code = await askCode({ title: `${label} · ${e.name} — code`, kind: e.attrs.code });
            if (code === null) { widget()?.alarm?.setState({ state: e.state }); return; }
          }
          await run([[req]], code);
          code = null;
        },
      }),
    },
  });

  /* ---- Phase 4: gauge, chart, text, image */
  const NUMERIC = ['sensor', 'input_number', 'number', 'counter'];
  /** the state a numeric widget shows: a number, or the text state (unavailable / unknown / …) */
  const numState = (e) => (!e.available ? (String(e.state).toLowerCase() === 'unknown' ? 'unknown' : 'unavailable') : (num(e.state) ?? e.state));
  const HIST_MSG = { not_numeric: 'This entity has no numeric history', too_much_history: 'Too much history for this period — choose a shorter range', not_configured: 'Home Assistant is not configured',
    unreachable: 'Home Assistant unreachable — history not loaded', timeout: 'Home Assistant did not answer in time', auth: 'Home Assistant refused the request', server_unreachable: 'IniqDash server unreachable' };
  const STAT_MSG = { no_statistics: 'Home Assistant keeps no long-term statistics for it', not_configured: 'Home Assistant is not connected', unreachable: 'Home Assistant cannot be reached',
    timeout: 'Home Assistant did not answer in time', auth: 'Home Assistant refused the connection', ha_refused: 'Home Assistant refused the request', too_large: 'Too many statistics to show',
    bad_period: 'Unknown period', demo: 'Demo' };
  /** Text widget: human form of a state ("running" → "Running", 12.4 + °C → "12.4 °C") */
  function stateText(e, c) {
    if (!e.available) return String(e.state).toLowerCase() === 'unknown' ? 'Unknown' : 'Unavailable';
    const si = stateItem(e);
    if (si && !['number', 'percent'].includes(si.kind)) return si.text;     // HA's wording (on/off by device class, timestamps…)
    const n = num(e.state);
    if (n !== null) {
      const d = Number.isInteger(c.decimals) ? c.decimals : null;
      const t = d !== null ? n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
      return c.showUnit !== false && e.unit ? `${t} ${e.unit}` : t;
    }
    const t = String(e.state).replace(/_/g, ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  /** attributes a Text widget may show: plain values the server already picked (never URLs / the raw attribute bag) */
  const TEXT_ATTRS = ['device_class', 'state_class', 'brightness_pct', 'current_temperature', 'target_temperature', 'hvac_action', 'preset_mode', 'position', 'percentage',
    'title', 'artist', 'source', 'volume', 'changed_by', 'min', 'max'];
  function attrText(e, key) {
    if (!TEXT_ATTRS.includes(key)) return '';
    const v = e.attrs?.[key];
    if (v === null || v === undefined || typeof v === 'object') return '—';
    return typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v).replace(/_/g, ' ');
  }

  Object.assign(B, {
    gauge: {
      domains: NUMERIC,
      config(c, e) {
        if (!e) return { ...c, value: null };
        // unit: an override in the configuration wins, otherwise HA's unit (Auto)
        return { ...c, value: numState(e), unit: c.unit ? c.unit : (e.unit || ''), deviceClass: e.attrs?.device_class || undefined,
          autoMin: num(e.attrs?.min) ?? undefined, autoMax: num(e.attrs?.max) ?? undefined };
      },
      update(el, e, c) { const x = this.config(c, e); el.gauge?.setState({ value: x.value, unit: x.unit, deviceClass: x.deviceClass, autoMin: x.autoMin, autoMax: x.autoMax }); },
      caps: () => '',
    },
    chart: {
      domains: NUMERIC,
      config(c, e) {
        return { ...c, demo: false, series: [], status: 'loading', value: e ? numState(e) : null, unit: c.unit ? c.unit : (e?.unit || ''), period: c.source === 'statistics' ? (c.period || 'day') : undefined };
      },
      update(el, e, c) { el.chart?.setState({ value: numState(e), unit: c.unit ? c.unit : (e.unit || '') }); },
      caps: () => '',
      /** History is NOT part of the 2-second state poll: it is asked once, then again only after the
          server's refresh time for the range (1 min for 1 h … 15 min for 7 days), only while the chart
          is on screen and the tab is visible. IniqHA.history shares one answer between charts. */
      start({ wrap, widget, ha, id, config }) {
        const range = config.range || '24h';
        let t = 0, onScreen = true, stopped = false, every = 60000, had = false;
        const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((en) => { const was = onScreen; onScreen = en.some((x) => x.isIntersecting); if (onScreen && !was) tick(500); }) : null;
        if (io) io.observe(wrap);
        // the SERIES: the widget's own entity, then every added one (config.traces) — each its label, colour and (statistics) value kind
        const traces = (Array.isArray(config.traces) ? config.traces : []).filter((t) => t && typeof t.entity === 'string' && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(t.entity)).slice(0, 6);
        const many = traces.length > 0;
        const list = [{ entity: id, label: many ? (config.seriesLabel || config.name) : config.name, color: config.color, stat: config.stat, invert: false }, ...traces];
        const sign = (t, v) => (v === null || v === undefined ? null : t.invert ? -v : v);
        const follow = traces.map((t) => ha.subscribe(t.entity, () => {}));          // their units / names known (the shared poll)
        async function load() {
          const w = widget();
          if (config.source === 'statistics') return loadStats(w);
          const all = await Promise.all(list.map((t) => (t.entity === id ? ha.history(id, range) : ha.history(t.entity, range))));
          if (stopped) return;
          const d = all[0];
          if (d.ok) {
            had = true;
            every = Math.max(30, Number(d.refresh) || 60) * 1000;
            const series = list.map((t, i) => { const r = all[i]; return { id: t.entity, name: t.label || (i ? t.entity : config.name), color: t.color, unit: i ? (ha.get(t.entity)?.unit || '') : undefined,
              error: r.ok ? null : (HIST_MSG[r.error] || 'No history'), points: r.ok ? (r.points || []).map((p) => [p[0], sign(t, p[1]), sign(t, t.invert ? p[3] : p[2]), sign(t, t.invert ? p[2] : p[3])]) : [] }; });
            w?.chart?.setState({ series, start: d.start, end: d.end, status: 'ok', message: '' });
          } else {
            every = 20000;                                  // retry a failure sooner (still not on every poll)
            w?.chart?.setState({ status: 'error', message: HIST_MSG[d.error] || `History could not be loaded (${d.error || 'error'})`, ...(had ? {} : { series: [] }) });
          }
        }
        /* LONG-TERM STATISTICS (hour · day · week · month · year): HA's own. A TOTAL (has a sum: kWh, m³…) shows its CHANGE per period —
           the consumption; a MEASUREMENT (has a mean: W, °C…) its MEAN (or min / max). Asked for a change of a measurement (W is never
           a kWh total) or a mean of a total: the series says so instead of showing anything. A bucket HA has no row for is a gap. */
        async function loadStats(w) {
          const d = await ha.statistics(list.map((t) => t.entity), config.period || 'day');
          const lastN = Number.isInteger(config.count) && config.count > 0 ? config.count : 0;
          if (stopped) return;
          if (!d.ok) { every = 20000; w?.chart?.setState({ status: 'error', message: STAT_MSG[d.error] || `Statistics could not be loaded (${d.error || 'error'})`, ...(had ? {} : { series: [] }) }); return; }
          had = true; every = Math.max(60, Number(d.refresh) || 300) * 1000;
          const series = list.map((t, i) => {
            const r = (d.results || {})[t.entity] || { error: 'no_statistics' };
            const base = { id: t.entity, name: t.label || (i ? t.entity : config.name), color: t.color, unit: r.unit || '', points: [] };
            if (r.error) return { ...base, error: STAT_MSG[r.error] || 'No statistics' };
            const want = t.stat && t.stat !== 'auto' ? t.stat : r.hasSum ? 'change' : r.hasMean ? 'mean' : null;
            if (want === 'change' && !r.hasSum) return { ...base, error: 'Not a total — no consumption per period' };
            if (want !== 'change' && !r.hasMean) return { ...base, error: want === null ? 'No statistics' : 'No average kept for it' };
            const k = { change: 1, mean: 2, min: 3, max: 4 }[want];
            const pts = (r.points || []).map((p) => [p[0], sign(t, p[k] ?? null), null, null]);
            return { ...base, stat: want, points: lastN > 0 ? pts.slice(-lastN) : pts };
          });
          // config.count: only the most recent periods (e.g. 7 of the 30 daily values) — the time axis starts at the first one shown
          const first = lastN > 0 ? Math.min(...series.filter((s) => s.points.length).map((s) => s.points[0][0])) : NaN;
          w?.chart?.setState({ series, start: Number.isFinite(first) ? first : d.start, end: d.end, status: 'ok', message: '', period: config.period || 'day', count: lastN || null });
        }
        function tick(delay = every) {
          clearTimeout(t);
          t = setTimeout(async () => {
            if (stopped) return;
            if (!widget()?.chart) return tick(400);         // still waiting for the entity's first state (no widget yet)
            if (!onScreen || document.hidden || !wrap.isConnected) return tick();
            await load();
            tick();
          }, delay);
        }
        const vis = () => { if (!document.hidden) tick(300); };
        document.addEventListener('visibilitychange', vis);
        tick(0);
        return () => { stopped = true; clearTimeout(t); if (io) io.disconnect(); document.removeEventListener('visibilitychange', vis); follow.forEach((o) => o()); };
      },
    },
    text: {
      domains: null,                       // any entity: name, state, unit, a simple attribute
      // TEMPLATES (no entity of its own): every entity its {{ … }} reads joins the shared poll; rendered by IniqTemplate (safe, no code)
      many: (c) => (c && !c.entity && global.IniqTemplate ? [...global.IniqTemplate.ids(c.primary), ...global.IniqTemplate.ids(c.secondary)] : []),
      items: (c, vals) => { const T = global.IniqTemplate, get = (id) => vals[id] || null; return { primary: T.render(c.primary || '', get), secondary: T.render(c.secondary || '', get) }; },
      request() { return []; },
      config(c, e) {
        if (!e) return c;
        const label = c.primary || e.name, st = stateText(e, c);
        const show = c.show || 'name_state';
        const pair = show === 'state_name' ? [st, label] : show === 'state' ? [st, ''] : show === 'name_attribute' ? [label, attrText(e, c.attribute)] : [label, st];
        return { ...c, primary: pair[0], secondary: pair[1], tone: e.available ? 'none' : 'unavailable' };
      },
      update(el, e, c) { const x = this.config(c, e); el.text?.setState({ primary: x.primary, secondary: x.secondary, tone: x.tone }); },
      caps: () => '',
    },
    image: {
      domains: ['image', 'person'],
      config(c, e) { return e ? { ...c, src: e.attrs?.image || '', available: e.available || e.domain === 'person' } : { ...c, src: '' }; },
      update(el, e, c) { const x = this.config(c, e); el.image?.setState({ src: x.src, available: x.available }); },
      caps: () => '',
    },
  });

  /* ---- Weather (current conditions) and Person (presence) */
  /** Home Assistant weather conditions → the Weather widget's condition keys */
  const WX = { sunny: 'clear', 'clear-night': 'clear-night', partlycloudy: 'partly-cloudy', cloudy: 'cloudy', fog: 'fog', rainy: 'rain', pouring: 'rain',
    lightning: 'thunder', 'lightning-rainy': 'thunder', snowy: 'snow', 'snowy-rainy': 'sleet', hail: 'sleet', windy: 'wind', 'windy-variant': 'wind' };
  const compass = (b) => { const n = num(b); return n === null ? (typeof b === 'string' ? b : '') : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((n % 360) + 360) % 360 / 45) % 8]; };

  /* ---- FORECAST (shared by the Weather widget and Entity Details): ONE source — IniqHA.forecast (weather.get_forecasts through
     api/ha_forecast.php), lazily fetched and cached; never the state poll. Only the types the entity declares are offered. */
  const FORECAST_TYPES = ['daily', 'twice_daily', 'hourly'];
  const FORECAST_LABEL = { daily: 'Daily', twice_daily: 'Twice daily', hourly: 'Hourly' };
  /** the forecast types this weather entity supports (its supported_features, normalised by the server) */
  const forecastTypes = (e) => (e && e.domain === 'weather' ? FORECAST_TYPES.filter((t) => !!e.caps?.[`forecast_${t}`]) : []);
  /** HA's forecast answer → entries the presentations show: { t, label, condition (HA), widgetCondition, temperature?, templow?,
      precipitation?, precipitation_probability?, wind_speed?, wind_bearing?, humidity?, is_daytime? } — what has passed is dropped */
  function forecastEntries(d, type, now = Date.now()) {
    if (!d || !d.ok || !Array.isArray(d.forecast)) return [];
    const today = dayStart(now);
    return d.forecast.filter((x) => Number.isFinite(x.t) && (type === 'daily' ? dayStart(x.t) >= today : type === 'hourly' ? x.t > now - 3600000 : x.t > now - 43200000))
      .map((x) => {
        const dt = new Date(x.t);
        const day = dayStart(x.t) === today ? 'Today' : dt.toLocaleDateString([], { weekday: 'short' });
        const label = type === 'hourly' ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : type === 'twice_daily' && x.is_daytime === false ? `${day} night` : day;
        return { ...x, label, widgetCondition: WX[x.condition] || 'unknown' };
      });
  }
  /** which forecast the Weather widget shows: config.forecastType ('auto' | 'off' | a type) against what the entity supports */
  function widgetForecastType(c, e) {
    const sup = forecastTypes(e), want = c.forecastType || 'auto';
    if (want === 'off') return { type: null, note: '' };
    if (want === 'auto') return { type: sup[0] || null, note: '' };
    return sup.includes(want) ? { type: want, note: '' } : { type: null, note: `${FORECAST_LABEL[want] || 'This'} forecast not available` };
  }
  const FC_MSG = { type_not_supported: 'Forecast type not available', forecast_refused: 'Forecast not available from this Home Assistant', unavailable: 'Forecast unavailable',
    no_forecast: 'No forecast reported', not_configured: 'Home Assistant not configured', signed_out: 'Signed out' };
  const forecastMessage = (d) => (!d ? 'Loading forecast…' : FC_MSG[d.error] || 'Forecast unavailable');
  /** the widget's forecast part, from the shared cache only (peek — never fetches; start() asks for it) */
  function forecastView(c, e, now = Date.now()) {
    const { type, note } = widgetForecastType(c, e);
    if (!type) return { forecast: [], forecastNote: note, high: undefined, low: undefined };
    const d = HA().peek('forecast', e.id, type);
    if (!d || !d.ok) return { forecast: [], forecastNote: forecastMessage(d), high: undefined, low: undefined };
    const list = forecastEntries(d, type, now);
    // today's high / low: only from a DAILY entry that is today
    const first = type === 'daily' && list[0] && list[0].label === 'Today' ? list[0] : null;
    return {
      forecast: list.map((x) => ({ label: x.label, condition: x.widgetCondition, ...(type === 'hourly' ? { temperature: x.temperature } : { high: x.temperature, low: x.templow }),
        // the entry's own DATE (from Home Assistant's timestamp — the list shows it under the day; never invented)
        ...(type !== 'hourly' && Number.isFinite(x.t) ? { date: new Date(x.t).toLocaleDateString([], { day: 'numeric', month: 'short' }) } : {}),
        precipitation: x.precipitation_probability })),
      forecastNote: list.length ? '' : 'No forecast reported', high: first ? num(first.temperature) ?? undefined : undefined, low: first ? num(first.templow) ?? undefined : undefined,
    };
  }

  /* ---- CALENDAR EVENTS (shared by the Calendar widget and Entity Details): ONE source — IniqHA.calendar (api/ha_calendar.php),
     lazily fetched and cached; never the state poll. Read-only. */
  /** a calendar DATE ("2026-10-22") → that day's local midnight (an all-day event has no time; none is invented) */
  const localDate = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  /** the server's events → { title, start: Date, end: Date|null, allDay, location? } (timed: the real instant, shown in local time) */
  function calendarEvents(list) {
    return (Array.isArray(list) ? list : []).map((x) => {
      const start = x.allDay ? localDate(x.start) : new Date(x.start), end = x.end ? (x.allDay ? localDate(x.end) : new Date(x.end)) : null;
      if (!start || Number.isNaN(start.getTime())) return null;
      return { title: x.title || '(No title)', allDay: !!x.allDay, start, end: end && !Number.isNaN(end.getTime()) ? end : null, ...(x.location ? { location: x.location } : {}),
        ...(typeof x.description === 'string' && x.description ? { description: x.description } : {}) };
    }).filter(Boolean);
  }
  const CAL_MSG = { unknown_entity: 'Calendar not found in Home Assistant', unreachable: 'Home Assistant unreachable — events not loaded', timeout: 'Home Assistant did not answer in time',
    auth: 'Home Assistant refused the request', too_many_events: 'Too many events to show', not_configured: 'Home Assistant not configured', server_unreachable: 'IniqDash server unreachable', signed_out: 'Signed out' };
  const calendarMessage = (d) => (!d ? 'Loading events…' : d.ok ? '' : CAL_MSG[d.error] || 'Events could not be loaded');

  /** a lazily loaded layer of a bound widget (calendar events, forecast): loads only while the widget is on screen and the tab
      is visible, refreshes on the clock at the server's refresh time (and at the next boundary next(d) asks for, e.g. an event
      starting or ending) — one timer per widget, never the state poll.
      load() → undefined (widget not built yet: retry soon) | null (nothing to load) | the answer */
  function lazyLayer(wrap, { load, apply, next }) {
    let t = 0, stopped = false, visible = true, d = null;
    const unSee = onScreen(wrap, (v) => { const was = visible; visible = v; if (v && !was) tick(300); });
    const wait = () => {
      const every = (d && d.ok ? Math.max(30, Number(d.refresh) || 300) : d ? 20 : 300) * 1000;
      const w = every - (Date.now() % every) + 150;
      const b = next ? next(d) : null;
      return b !== null && b !== undefined ? Math.max(1000, Math.min(w, b - Date.now() + 500)) : w;
    };
    function tick(delay) {
      clearTimeout(t);
      t = setTimeout(async () => {
        if (stopped) return;
        if (!visible || document.hidden || !wrap.isConnected) return tick();
        const r = await load();
        if (stopped) return;
        if (r === undefined) return tick(500);
        d = r;
        apply();
        tick();
      }, delay !== undefined ? delay : wait());
    }
    const vis = () => { if (!document.hidden && visible) tick(300); };
    document.addEventListener('visibilitychange', vis);
    tick(0);
    return () => { stopped = true; clearTimeout(t); unSee(); document.removeEventListener('visibilitychange', vis); };
  }

  Object.assign(B, {
    weather: {
      domains: ['weather'],
      config(c, e) {
        if (!e) return c;
        const a = e.attrs || {};
        const ws = num(a.wind_speed);
        // the forecast comes from weather.get_forecasts (shared cache, see forecastView) — only a type this entity supports;
        // the demo forecast / high / low are never shown when linked
        return { ...c, available: e.available && num(a.temperature) !== null, condition: WX[e.state] || 'unknown',
          temperature: num(a.temperature), feelsLike: num(a.apparent_temperature) ?? undefined, humidity: num(a.humidity) ?? undefined,
          wind: ws !== null ? { speed: Math.round(ws), unit: a.wind_speed_unit || 'km/h', direction: compass(a.wind_bearing) } : undefined,
          precipitation: undefined, ...forecastView(c, e),
          extraStats: [num(a.pressure) !== null && ['Pressure', numText(num(a.pressure), a.pressure_unit)], num(a.uv_index) !== null && ['UV index', numText(num(a.uv_index))]].filter(Boolean) };
      },
      update(el, e, c) { const x = this.config(c, e); el.weather?.setState(x); },
      caps: () => '',
      start({ wrap, widget, ha, id, config, last }) {
        return lazyLayer(wrap, {
          load: async () => {
            const e = last(), w = widget();
            if (!e || !w || !w.weather) return undefined;
            const { type } = widgetForecastType(config, e);
            return type ? ha.forecast(id, type) : null;
          },
          apply: () => { const e = last(), w = widget(); if (e && w && w.weather) w.weather.setState(B.weather.config(config, e)); },
        });
      },
    },
    /* CALENDAR: ONE or SEVERAL calendar.* entities (config.calendars) merged in one card. Each calendar's events come from the same
       lazy, cached, read-only source as before (IniqHA.calendar, never the state poll); the widget asks for the days it shows
       (onRange → a window). A calendar that fails is reported on its own chip and never hides the others. */
    calendar: {
      domains: ['calendar'],
      many: (c) => (Array.isArray(c?.calendars) ? c.calendars.map((x) => x && x.entity).filter((id) => typeof id === 'string' && /^calendar\.[a-z0-9_]+$/.test(id)).slice(0, 12) : []),
      items(c, vals, known) {
        const win = c && c.win ? `${c.win.from}/${c.win.days}` : '';
        const cals = (Array.isArray(c?.calendars) ? c.calendars : []).filter((x) => x && typeof x.entity === 'string' && /^calendar\.[a-z0-9_]+$/.test(x.entity)).slice(0, 12);
        const events = [], sources = [];
        let loading = false;
        cals.forEach((x, i) => {
          const e = vals[x.entity] ?? null, d = HA().peek('calendar', x.entity, win);
          const color = typeof x.color === 'string' ? (/^#/.test(x.color) ? x.color : `var(--${x.color})`) : undefined;
          const missing = known[x.entity] && !e, off = e && e.available === false;
          const ok = !missing && !off && (!d || d.ok);
          if (!d && !missing && !off) loading = true;
          sources.push({ key: x.id || `k${i + 1}`, label: x.label || (e && e.name) || x.entity, color, ok, hidden: x.hidden === true,
            message: missing ? 'not found' : off ? 'unavailable' : d && !d.ok ? (CAL_MSG[d.error] || 'could not be loaded') : '' });
          if (ok && d && d.ok) calendarEvents(d.events).forEach((ev) => events.push({ ...ev, src: x.id || `k${i + 1}` }));
        });
        const anyOk = sources.some((x) => x.ok);
        return { sources, events, available: anyOk || !sources.length, message: loading && !events.length ? 'Loading events…' : !anyOk && sources.length ? 'No calendar could be loaded' : '' };
      },
      /** the lazy layer of EVERY calendar of the card (one timer for the card) — refreshed at the server's refresh time and when an event
          starts or ends; a new window (the widget's date navigation) loads at once */
      start({ wrap, ha, config, setCfg, refresh }) {
        let win = null;
        const ids = () => B.calendar.many(config);
        const stop = lazyLayer(wrap, {
          load: async () => { const list = ids(); if (!list.length) return null; const all = await Promise.all(list.map((id) => ha.calendar(id, win || undefined))); return { ok: all.some((d) => d && d.ok), refresh: Math.min(...all.map((d) => Number(d && d.refresh) || 300)), all }; },
          apply: () => refresh(),
          next: (d) => {
            if (!d || !d.all) return null;
            const now = Date.now();
            const ts = d.all.filter((x) => x && x.ok).flatMap((x) => calendarEvents(x.events)).flatMap((x) => [x.start, x.end]).filter(Boolean).map((x) => x.getTime()).filter((x) => x > now);
            return ts.length ? Math.min(...ts) : null;
          },
        });
        return { stop, onRange: (w) => { win = w; setCfg({ win: w }); refresh(); const list = ids(); Promise.all(list.map((id) => ha.calendar(id, w || undefined))).then(() => refresh()); } };
      },
      request() { return []; },
    },
    /* EVENT SPOTLIGHT: a calendar's next events (the same lazy, cached source as the Calendar widget — never the state poll) */
    spotlight: {
      domains: ['calendar'],
      config(c, e) {
        if (!e) return c;
        const d = HA().peek('calendar', e.id);
        if (!e.available) return { ...c, events: [], available: false, message: '' };
        return { ...c, available: !d || d.ok, events: d && d.ok ? calendarEvents(d.events) : [], message: d && d.ok ? 'Nothing coming up' : calendarMessage(d) };
      },
      update(el, e, c) { el.spotlight?.setState(this.config(c, e)); },
      caps: () => '',
      start({ wrap, widget, ha, id, config, last }) {
        return lazyLayer(wrap, {
          load: async () => { const e = last(), w = widget(); if (!e || !w || !w.spotlight) return undefined; return ha.calendar(id); },
          apply: () => { const e = last(), w = widget(); if (e && w && w.spotlight) w.spotlight.setState(B.spotlight.config(config, e)); },
          next: (d) => {
            if (!d || !d.ok) return null;
            const now = Date.now(), ts = calendarEvents(d.events).flatMap((x) => [x.start, x.end]).filter(Boolean).map((x) => x.getTime()).filter((x) => x > now);
            return ts.length ? Math.min(...ts) : null;
          },
        });
      },
    },
    /* Appliance: the linked entity's REAL state, in Home Assistant's words. The widget's tone (running / paused / finished…)
       only where HA's own state word is that state (or a binary "running" sensor); anything else is shown neutrally. The demo
       programme, remaining time, progress, secondary text and actions are never shown when linked — extra real values come
       from the Information slots. */
    appliance: {
      domains: ['sensor', 'binary_sensor', 'switch', 'input_boolean', 'select', 'input_select', 'vacuum', 'lawn_mower', 'water_heater'],
      config(c, e) {
        if (!e) return c;
        if (c.profile === 'washer') return washerConfig(c, e);
        const low = String(e.state).toLowerCase();
        const st = !e.available ? (low === 'unknown' ? 'unknown' : 'unavailable')
          : APPLIANCE_STATES.includes(low) ? low
            : e.domain === 'binary_sensor' && e.attrs?.device_class === 'running' ? (low === 'on' ? 'running' : 'off') : 'other';
        return { ...c, state: st, available: st !== 'unavailable', status: e.available ? stateItem(e).text : undefined,
          programme: undefined, remaining: undefined, progress: undefined, secondary: undefined, actions: [] };
      },
      update(el, e, c) {
        if (c.profile === 'washer') { el.appliance?.setState({ ha: washerPrimary(e) }); return; }
        const x = this.config(c, e); el.appliance?.setState({ state: x.state, available: x.available, status: x.status });
      },
      caps: () => '',
      /* Washing Machine: the explicitly MAPPED entities join the same shared poll (IniqHA.subscribe) — nothing fetches on its own */
      start({ widget, config, ha }) {
        if (!config || config.profile !== 'washer') return null;
        const ids = washerIds(config), store = { vals: {}, known: {} };
        APP_MAPPED.set(config, store);
        const push = () => { const w = widget(); if (w && w.appliance) w.appliance.setState({ mapped: washerMapped(config) }); };
        const offs = [...new Set(Object.values(ids).filter(Boolean))].map((id) => ha.subscribe(id, (e) => { store.vals[id] = e; store.known[id] = true; push(); }));
        return () => offs.forEach((o) => o());
      },
      hooks: ({ last, preview, resync, config }) => (config && config.profile === 'washer' ? {
        /** Start / Pause / Programme: ONLY on the entity the owner mapped for that role, through the secure channel. The server
            plans the service from that entity's domain (button / input_button → press, switch → turn on, select → one of ITS options). */
        haAction: async (role, value) => {
          const ha = HA(), id = washerIds(config)[role === 'program' ? 'programSelect' : role];
          if (!id || !last()) return { ok: false, error: 'not_supported' };
          const e = ha.get(id);
          if (!e) return { ok: false, error: 'unknown_entity' };
          if (!e.available) return { ok: false, error: 'unavailable' };
          let action;
          if (role === 'program') {
            if (!NUMSEL_SELECT.includes(e.domain) || !(e.attrs?.options || []).includes(value)) return { ok: false, error: 'not_an_option' };
            action = 'select_option';
          } else action = e.domain === 'switch' ? 'turn_on' : ['button', 'input_button'].includes(e.domain) ? 'trigger' : null;
          if (!action) return { ok: false, error: 'not_supported' };
          if (preview()) { resync(); return { ok: false, error: 'preview' }; }
          return ha.call(id, action, role === 'program' ? value : undefined);
        },
      } : {}),
    },
    energy: {
      domains: ['sensor'],
      config(c, e) {
        if (!e) return c;
        // linked: Home Assistant's values only — every demo value is cleared
        return { ...c, ha: energyValue(e), mapped: energyMapped(c), nodeVals: energyNodeVals(c), demoHome: undefined, demoSolar: undefined, demoGrid: undefined, demoBattery: undefined,
          demoLevel: undefined, demoEv: undefined, demoEvLevel: undefined };
      },
      update(el, e) { el.energy?.setState({ ha: energyValue(e) }); },
      caps: () => '',
      // every mapped entity joins the same shared poll (IniqHA.subscribe) — no loop per node
      start({ widget, config, ha }) {
        const store = { vals: {}, known: {} };
        APP_MAPPED.set(config, store);
        const push = () => { const w = widget(); if (w && w.energy) w.energy.setState({ mapped: energyMapped(config), nodeVals: energyNodeVals(config) }); };
        const nodeIds = global.MaisonEnergy && global.MaisonEnergy.nodeEntities ? global.MaisonEnergy.nodeEntities(config) : [];
        const offs = [...new Set([...Object.values(energyIds(config)).filter(Boolean), ...nodeIds])].map((id) => ha.subscribe(id, (e) => { store.vals[id] = e; store.known[id] = true; push(); }));
        return () => offs.forEach((o) => o());
      },
    },
    /* ROBOT (vacuum.* / lawn_mower.*): the state in HA's words, the battery (the entity's attribute when HA still reports one, or the
       sensor the owner maps under config.mappings.battery), and only the controls the entity's feature bits allow. */
    robot: {
      domains: ['vacuum', 'lawn_mower'],
      config(c, e) {
        if (!e) return c;
        const k = e.caps || {}, a = e.attrs || {};
        return { ...c, profile: e.domain === 'lawn_mower' ? 'mower' : 'vacuum', state: e.state, available: e.available, battery: robotBattery(c, e),
          fanSpeed: a.fan_speed ?? undefined, fanSpeeds: a.fan_speeds || [],
          capabilities: { start: !!k.start, pause: !!k.pause, stop: !!k.stop, dock: !!k.dock, locate: !!k.locate, spot: !!k.spot, fanSpeed: !!k.fan_speed } };
      },
      update(el, e, c) { const x = this.config(c, e); el.robot?.setState({ state: x.state, available: x.available, battery: x.battery, fanSpeed: x.fanSpeed, fanSpeeds: x.fanSpeeds }); },
      caps: (e) => (e ? JSON.stringify([e.domain, e.caps, e.attrs?.fan_speeds]) : ''),
      view: (e) => ({ state: e.state }),
      hooks: ({ run }) => ({ onRequest: (req, value) => { run([value === undefined ? [req] : [req, value]]); } }),
      start({ widget, config, ha, last }) {
        const id = config?.mappings?.battery;
        if (typeof id !== 'string' || !/^sensor\.[a-z0-9_]+$/.test(id)) return null;
        const store = { vals: {}, known: {} };
        APP_MAPPED.set(config, store);
        return ha.subscribe(id, (m) => { store.vals[id] = m; store.known[id] = true; const w = widget(), e = last(); if (w && w.robot && e) w.robot.setState({ battery: robotBattery(config, e) }); });
      },
    },
    /* ENTITY LIST: many entities, no primary one. config.rows = [{ id, label?, entity, value }] (the Information-line shape: what to show
       is the entity's state or one of its reported values). Each row's control is fixed by the entity's DOMAIN and capabilities — never a free
       service call. See bindMany(). */
    entitylist: {
      domains: null,
      many: (c) => listRows(c).map((r) => r.entity),
      items: (c, vals, known) => listRows(c).map((r) => listItem(r, vals[r.entity] ?? null, !!known[r.entity])),
      request(entity, ctl) { return ctl.type === 'toggle' ? [[ctl.on ? 'turn_off' : 'turn_on']] : ctl.type === 'move' ? [[ctl.verb]] : ctl.type === 'run' ? [['trigger']] : []; },
    },
    /* WHO'S HOME: many people (config.people = [{ id, entity, label? }]), read only. Presence in Home Assistant's own terms: home, not_home
       (away), a zone's name, unknown / unavailable; the person's picture (entity_picture, through IniqDash's own image endpoint). */
    presence: {
      domains: null,
      many: (c) => (Array.isArray(c?.people) ? c.people.filter((x) => x && typeof x.entity === 'string' && SLOT_ID.test(x.entity)).slice(0, 8) : []).map((x) => x.entity),
      items: (c, vals, known) => (Array.isArray(c?.people) ? c.people.filter((x) => x && typeof x.entity === 'string' && SLOT_ID.test(x.entity)).slice(0, 8) : []).map((x) => {
        const e = vals[x.entity] ?? null, st = e ? String(e.state) : '';
        const presence = !known[x.entity] ? 'unknown' : !e || e.available === false ? (st.toLowerCase() === 'unknown' ? 'unknown' : 'unavailable') : st === 'home' ? 'home' : st === 'not_home' ? 'away' : 'zone';
        return { id: x.id, entity: x.entity, name: x.label || (e && e.name) || x.entity, picture: e && e.attrs && typeof e.attrs.image === 'string' ? e.attrs.image : undefined,
          presence, zone: presence === 'zone' ? st : undefined, since: e && e.changed ? when(e.changed) : '' };
      }),
      request() { return []; },
    },
    /* ROOM TILE: up to three entities of a room (temperature, humidity, lights on), no primary one — each Home Assistant's own value */
    roomtile: {
      domains: null,
      many: (c) => [...['temperature', 'humidity', 'lights'].map((k) => c && c[k]), ...(c && !c.lights && Array.isArray(c.lightList) ? c.lightList.slice(0, 24) : [])].filter((x) => typeof x === 'string' && SLOT_ID.test(x)),
      items: (c, vals) => {
        const one = (k) => { const id = c[k], e = id ? vals[id] : null; if (!e || e.available === false) return null;
          const raw = k === 'temperature' && e.domain === 'climate' ? e.attrs?.current_temperature : e.state, n = Number(raw);
          return { text: Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: k === 'temperature' ? 1 : 0, maximumFractionDigits: k === 'temperature' ? 1 : 0 }) : String(raw), unit: e.unit || (k === 'temperature' ? '°' : '') }; };
        const lights = c.lights && vals[c.lights] ? (() => { const e = vals[c.lights], m = /^of (\d+)$/.exec(String(e.unit || '')); return e.available === false ? null : { text: m ? `${e.state}/${m[1]}` : String(e.state) }; })() : null;
        // a LIST of lights (no counting sensor): how many of those Home Assistant reports on, live — "2/3"; none readable → nothing shown
        const list = !c.lights && Array.isArray(c.lightList) ? c.lightList.filter((id) => vals[id] && vals[id].available !== false) : [];
        const counted = list.length ? { text: `${list.filter((id) => vals[id].state === 'on').length}/${list.length}` } : null;
        return { temperature: one('temperature'), humidity: one('humidity'), lights: lights || counted };
      },
      request() { return []; },
    },
    /* READINGS: several values (config.items) in one card — each Home Assistant's own value and unit (decimals as configured) */
    readings: {
      domains: null,
      many: (c) => (Array.isArray(c?.items) ? c.items.filter((x) => x && typeof x.entity === 'string' && SLOT_ID.test(x.entity)).slice(0, 8) : []).map((x) => x.entity),
      items: (c, vals, known) => (Array.isArray(c?.items) ? c.items.filter((x) => x && typeof x.entity === 'string' && SLOT_ID.test(x.entity)).slice(0, 8) : []).map((x) => {
        const e = vals[x.entity] ?? null, n = e ? Number(e.state) : NaN;
        const value = !e ? '…' : Number.isFinite(n) ? n.toLocaleString(undefined, Number.isInteger(x.decimals) ? { minimumFractionDigits: x.decimals, maximumFractionDigits: x.decimals } : { maximumFractionDigits: 2 }) : String(e.state);
        return { id: x.id, entity: x.entity, label: x.label || (e && e.name) || x.entity, color: x.color, value, unit: e ? e.unit || '' : '', available: !known[x.entity] || (!!e && e.available !== false) };
      }),
      request() { return []; },
    },
    /* BATTERIES: every battery of the home (auto: each sensor whose device class is battery, found by discovery — HA's own list, nothing
       guessed from a name) or the chosen ones (config.entities); the widget sorts them, emptiest first */
    batteries: {
      domains: null,
      many: (c) => (c && c.auto === false && Array.isArray(c.chosen) ? c.chosen.map((x) => x && x.entity).filter((id) => typeof id === 'string' && SLOT_ID.test(id)).slice(0, 60) : []),
      discover: (c, ha) => (c && c.auto === false ? null : ha.entities().then((list) => (list || []).filter((e) => e && e.domain === 'sensor' && e.dc === 'battery').map((e) => e.id).slice(0, 60)).catch(() => [])),
      items: (c, vals, known) => (c && c.auto === false ? (Array.isArray(c.chosen) ? c.chosen.map((x) => x && x.entity) : []) : (c && c.found) || []).filter((id) => typeof id === 'string' && SLOT_ID.test(id)).map((id) => {
        const e = vals[id] ?? null, n = e ? Number(e.state) : NaN;
        const label = e && e.name ? String(e.name).replace(/\s+battery(\s+level)?$/i, '') : id;
        return { id, entity: id, label, level: e && Number.isFinite(n) ? n : null, available: !known[id] || (!!e && e.available !== false) };
      }),
      request() { return []; },
    },
    /* CLIMATE GROUP: several climate.* entities; each unit's controls only from what HA reports (caps); the group's shared modes / fan speeds are
       computed by the widget from these lists; every request is ONE secure call per unit (the server re-checks range, step and mode) */
    climategroup: {
      domains: null,
      many: (c) => (Array.isArray(c?.units) ? c.units.filter((id) => typeof id === 'string' && /^climate\.[a-z0-9_]+$/.test(id)).slice(0, 8) : []),
      items: (c, vals, known) => (Array.isArray(c?.units) ? c.units : []).filter((id) => typeof id === 'string' && SLOT_ID.test(id)).map((id) => {
        const e = vals[id] ?? null, a = (e && e.attrs) || {}, k = (e && e.caps) || {};
        return { entity: id, name: (e && e.name) || id, available: !!e && e.available !== false, mode: e ? String(e.state) : null, action: a.hvac_action || null, current: num(a.current_temperature),
          target: num(a.target_temperature), min: num(a.min_temp), max: num(a.max_temp), step: num(a.target_temp_step), modes: Array.isArray(k.hvac_modes) ? k.hvac_modes : Array.isArray(a.hvac_modes) ? a.hvac_modes : [],
          canTarget: !!k.target_temperature, canFan: !!k.fan_mode, fanModes: Array.isArray(a.fan_modes) ? a.fan_modes : [], fan: a.fan_mode || null, known: !!known[id] };
      }),
      request(entity, ctl) {
        if (!ctl) return [];
        if (ctl.target !== undefined) return [['set_temperature', ctl.target]];
        if (ctl.mode) return [['set_hvac_mode', ctl.mode]];
        if (ctl.fan) return [['set_fan_mode', ctl.fan]];
        return [];
      },
    },
    /* HOME BATTERY / SOLAR: named roles (config.map), each one entity of any integration; read only */
    homebattery: { domains: null, many: roleMany(['level', 'power', 'capacityEntity', 'runtime', 'health', 'temp', 'inToday', 'outToday']), items: roleItems(['level', 'power', 'capacityEntity', 'runtime', 'health', 'temp', 'inToday', 'outToday']), request() { return []; } },
    solar: { domains: null, many: roleMany(['power', 'today', 'forecast', 'remaining', 'tomorrow', 'toHouse', 'toBattery', 'toGrid']), items: roleItems(['power', 'today', 'forecast', 'remaining', 'tomorrow', 'toHouse', 'toBattery', 'toGrid']), request() { return []; } },
    /* TO-DO: one or several todo.* lists. The items are not part of the state poll: todo.get_items, asked lazily (IniqHA.todo) and
       asked again whenever a list's state (its count of open items) changes — after a tick or an add, from here or anywhere else. */
    todo: {
      domains: ['todo'],
      many: (c) => (Array.isArray(c?.lists) ? c.lists.filter((id) => typeof id === 'string' && /^todo\.[a-z0-9_]+$/.test(id)).slice(0, 6) : []),
      items: (c, vals, known) => B.todo.many(c).map((id) => {
        const e = vals[id] ?? null, d = HA().peek('todo', id), off = known[id] && (!e || e.available === false);
        return { entity: id, name: (e && e.name) || id, available: !off && (!d || d.ok), canAdd: !!e?.caps?.add, canUpdate: !!e?.caps?.update, loading: !d,
          message: off ? (e ? 'This list is unavailable' : 'List not found') : d && !d.ok ? 'This list could not be loaded' : '', items: d && d.ok && Array.isArray(d.items) ? d.items : [] };
      }),
      start({ wrap, ha, config, refresh }) {
        const ids = B.todo.many(config), seen = {};
        const stop = lazyLayer(wrap, { load: async () => { if (!ids.length) return null; const all = await Promise.all(ids.map((id) => ha.todo(id))); return { ok: all.some((d) => d && d.ok), refresh: 300 }; }, apply: () => refresh() });
        const offs = ids.map((id) => ha.subscribe(id, (e) => {
          const st = e ? String(e.state) : null;
          if (id in seen && seen[id] !== st) ha.todo(id, true).then(() => refresh());
          seen[id] = st;
        }));
        return { stop: () => { stop(); offs.forEach((o) => o()); } };
      },
      request(entity, ctl) {
        if (!ctl) return [];
        if (typeof ctl.add === 'string') return [['add_item', ctl.add]];
        if (ctl.complete) return [['complete_item', ctl.complete]];
        if (ctl.reopen) return [['reopen_item', ctl.reopen]];
        return [];
      },
    },
    /* UPDATES: update.* entities; "on" = an update is waiting. Install is a request the widget sends only after a second confirming
       tap; the server installs only an entity that supports it, has an update waiting and is not already installing. */
    updates: {
      domains: ['update'],
      many: (c) => (Array.isArray(c?.units) ? c.units.filter((id) => typeof id === 'string' && /^update\.[a-z0-9_]+$/.test(id)).slice(0, 20) : []),
      items: (c, vals, known) => B.updates.many(c).map((id) => {
        const e = vals[id] ?? null, a = (e && e.attrs) || {}, k = (e && e.caps) || {};
        const off = !e || e.available === false || ['unknown', 'unavailable'].includes(String(e.state));
        return { entity: id, name: a.title || (e && e.name) || id, available: !(known[id] && off) && !!e, pending: !!e && e.state === 'on', installed: a.installed_version || null, latest: a.latest_version || null,
          url: a.release_url || null, canInstall: !!k.install, canBackup: !!k.backup, inProgress: !!a.in_progress, pct: num(a.update_percentage) };
      }),
      request(entity, ctl) { return ctl && ctl.install ? [['install', ctl.backup ? 'backup' : '']] : []; },
    },
    /* HUMIDIFIER: one humidifier.* entity (config.unit — bound like a list of one, so its controls go through request()); the target is kept inside the entity's own min / max (the server checks again) */
    humidifier: {
      domains: ['humidifier'],
      many: (c) => (typeof c?.unit === 'string' && /^humidifier\.[a-z0-9_]+$/.test(c.unit) ? [c.unit] : []),
      items: (c, vals, known) => B.humidifier.many(c).map((id) => {
        const e = vals[id] ?? null, a = (e && e.attrs) || {}, k = (e && e.caps) || {};
        const off = !e || e.available === false || ['unknown', 'unavailable'].includes(String(e.state));
        return { entity: id, name: (e && e.name) || id, available: e ? !off : !known[id], on: !!e && e.state === 'on', current: num(a.current_humidity), target: num(a.target_humidity),
          min: num(a.min_humidity), max: num(a.max_humidity), mode: a.mode || null, modes: k.modes && Array.isArray(a.available_modes) ? a.available_modes : [], action: a.action || null };
      }),
      request(entity, ctl) {
        if (!ctl) return [];
        if (ctl.power !== undefined) return [[ctl.power ? 'turn_on' : 'turn_off']];
        if (ctl.target !== undefined) return [['set_humidity', ctl.target]];
        if (ctl.mode) return [['set_mode', ctl.mode]];
        return [];
      },
    },
    /* COUNTDOWN: an entity whose state is a date / time stamp (config.source); the widget counts down on its own */
    countdown: {
      domains: ['sensor', 'input_datetime'],
      many: (c) => (typeof c?.source === 'string' && /^(sensor|input_datetime)\.[a-z0-9_]+$/.test(c.source) ? [c.source] : []),
      items: (c, vals, known) => B.countdown.many(c).map((id) => { const e = vals[id] ?? null; return { entity: id, value: e ? String(e.state) : null, available: e ? e.available !== false : !known[id] }; }),
      request() { return []; },
    },
    /* VEHICLE: one or several vehicles (config.vehicles), each a set of entities of ANY integration (no brand assumed). Every value is
       what its entity says (unit kept); an unavailable one is null. A control is offered only for an entity that can do it: the target
       charge for a number entity (inside its own min / max / step), lock / unlock for a lock, on / off for a switch / climate, press
       for a button — the server checks each against the entity again. */
    vehicle: {
      domains: null,
      many: (c) => (Array.isArray(c?.vehicles) ? c.vehicles.flatMap((v) => ['battery', 'range', 'mileage', 'charging', 'power', 'remaining', 'target', 'charge', 'plug', 'lock', 'climate'].map((k) => v && v[k])) : [])
        .filter((id) => typeof id === 'string' && SLOT_ID.test(id)).slice(0, 80),
      items(c, vals) {
        const E = (id) => (id ? vals[id] ?? null : null);
        const ok = (e) => e && e.available !== false && !['unknown', 'unavailable', ''].includes(String(e.state));
        const n = (e) => (ok(e) ? num(e.state) : null);
        const q = (e) => { const v = n(e); return v === null ? null : { value: v, unit: e.unit || '' }; };
        const on = (e, yes, no) => { if (!ok(e)) return null; const st = String(e.state).toLowerCase(); if (e.domain === 'binary_sensor') return st === 'on'; if (no.test(st)) return false; if (yes.test(st)) return true; return null; };
        return (Array.isArray(c?.vehicles) ? c.vehicles : []).map((v, i) => {
          const bat = E(v.battery), tgt = E(v.target), rem = E(v.remaining), lk = E(v.lock), cl = E(v.climate), ch = E(v.charge), pw = q(E(v.power));
          let remaining = n(rem);
          if (remaining !== null) { const u = String(rem.unit || 'min').toLowerCase(); remaining = u.startsWith('h') ? remaining * 60 : u === 's' ? remaining / 60 : u === 'd' ? remaining * 1440 : remaining; }
          if (rem && ok(rem) && remaining === null && rem.attrs && rem.attrs.device_class === 'timestamp') { const t = Date.parse(rem.state); if (Number.isFinite(t)) remaining = Math.max(0, (t - Date.now()) / 60000); }
          let charging = v.charging ? on(E(v.charging), /^(charging|on|true|yes|in progress)$|^charging/, /^(not|no|off|false|dis|stop|complete|finished|idle|ready|connected|disconnected|unplugged)/) : null;
          if (charging === null && pw && Math.abs(pw.value) > 0.05 && v.charging === undefined) charging = true;
          const locked = !v.lock || !ok(lk) ? null : lk.domain === 'lock' ? (lk.state === 'locked' ? true : lk.state === 'unlocked' || lk.state === 'open' ? false : null) : lk.state === 'off';
          const clim = !v.climate || !ok(cl) ? null : cl.domain === 'climate' ? cl.state !== 'off' : cl.domain === 'button' ? false : cl.state === 'on';
          const tAttrs = tgt && tgt.attrs ? tgt.attrs : {};
          const settable = tgt && ok(tgt) && ['number', 'input_number'].includes(tgt.domain) && num(tAttrs.min) !== null && num(tAttrs.max) !== null;
          return { key: v.id || `v${i + 1}`, name: v.name || `Vehicle ${i + 1}`, image: v.image || '', level: n(bat), range: q(E(v.range)), mileage: q(E(v.mileage)),
            target: n(tgt), targetCtl: settable ? { entity: v.target, min: num(tAttrs.min), max: num(tAttrs.max), step: num(tAttrs.step) || 1 } : null,
            charging, power: pw, remaining, plugged: v.plug ? on(E(v.plug), /^(on|true|yes|plugged|connected|plugged_in|charging)/, /^(off|false|no|unplugged|disconnected|not)/) : null,
            locked, lockEntity: lk && lk.domain === 'lock' && ok(lk) ? v.lock : '', climate: clim, climateEntity: cl && ok(cl) ? v.climate : '', climateKind: cl ? cl.domain : '',
            charge: v.charge && ok(ch) ? ch.state === 'on' : null, chargeEntity: ch && ok(ch) ? v.charge : '', available: !!bat && bat.available !== false };
        });
      },
      request(entity, ctl) {
        const d = String(entity || '').split('.')[0];
        if (!ctl) return [];
        if (ctl.target !== undefined && ['number', 'input_number'].includes(d)) return [['set_value', ctl.target]];
        if (ctl.lock && d === 'lock') return [[ctl.lock === 'unlock' ? 'unlock' : 'lock']];
        if (ctl.climate) return d === 'button' ? [['trigger']] : ['climate', 'switch', 'input_boolean'].includes(d) ? [['toggle']] : [];
        if (ctl.charge && ['switch', 'input_boolean'].includes(d)) return [['toggle']];
        return [];
      },
    },
    /* DEVICE TILE: one device of any of these kinds — its word (HA's state, a climate's mode, a speaker's playing / idle), whether it is
       ACTIVE (on · heating or any mode but off · playing), since when; the switch asks for toggle (a speaker: play / pause). */
    devicetile: {
      domains: ['light', 'switch', 'fan', 'input_boolean', 'climate', 'media_player'],
      config(c, e) {
        if (!e) return c;
        const st = String(e.state), d = e.domain;
        const active = d === 'climate' ? st !== 'off' : d === 'media_player' ? st === 'playing' : st === 'on';
        const label = d === 'climate' ? (st === 'off' ? 'Off' : st.replace(/_/g, ' ')) : d === 'media_player' ? (st === 'playing' ? 'Playing' : st === 'paused' ? 'Paused' : 'Idle') : (st === 'on' ? 'On' : 'Off');
        return { ...c, state: st, active, label, available: e.available !== false, since: e.changed ? Date.parse(e.changed) || 0 : 0 };
      },
      update(el, e, c) { el.devicetile?.setState(this.config(c, e)); },
      caps: () => '',
      view: (e) => ({ state: e.state, domain: e.domain }),
      actions(next, v) { return next && next.toggle ? [[v.domain === 'media_player' ? 'play_pause' : 'toggle']] : []; },
    },
    /* ACTIVITY LOG: many entities (config.entries), no primary one — each row is the entity's LATEST change (Home Assistant's own
       last_changed), its state as reported; the widget words it ("Door closed"). Read only: a tap opens Entity Details. */
    activitylog: {
      domains: null,
      many: (c) => (Array.isArray(c?.entries) ? c.entries.filter((x) => x && typeof x.entity === 'string' && SLOT_ID.test(x.entity)).slice(0, 20) : []).map((x) => x.entity),
      items: (c, vals, known) => (Array.isArray(c?.entries) ? c.entries.filter((x) => x && typeof x.entity === 'string' && SLOT_ID.test(x.entity)).slice(0, 20) : [])
        .filter((x) => known[x.entity]).map((x) => {
          const e = vals[x.entity] ?? null;
          return { id: x.id, entity: x.entity, domain: x.entity.split('.')[0], dc: e && e.attrs ? e.attrs.device_class || null : null, name: x.label || (e && e.name) || x.entity,
            area: e && e.area ? String(e.area) : '', state: e ? String(e.state) : '', available: !!e && e.available !== false, changed: e && e.changed ? Date.parse(e.changed) || 0 : 0 };
        }),
      request() { return []; },
    },
    /* LIVE ACTIVITY: many entities (config.entries), no primary one. Each is ACTIVE by Home Assistant's own rule for its kind (isActive —
       the same rule the app uses everywhere) or by the condition its owner set (its state is one of…, its value above / below…). The text is
       Home Assistant's own (the shared information formatter). Read only: a tap opens Entity Details; no service is ever called here. */
    activity: {
      domains: null,
      many: (c) => activityRows(c).map((r) => r.entity),
      items: (c, vals, known) => activityRows(c).map((r) => {
        const e = vals[r.entity] ?? null, it = slotItem({ id: r.id, entity: r.entity, label: r.label, value: 'state' }, e, !!known[r.entity]);
        let active = false;
        if (e && e.available !== false) {
          if (r.when === 'state') active = String(r.is || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).includes(String(e.state).toLowerCase());
          else if (r.when === 'above' || r.when === 'below') { const v = Number(e.state); active = Number.isFinite(v) && typeof r.limit === 'number' && (r.when === 'above' ? v > r.limit : v < r.limit); }
          else active = isActive(e);
        }
        const area = e && e.area ? String(e.area) : '';
        return { id: r.id, entity: r.entity, domain: r.entity.split('.')[0], name: r.label || (e && e.name) || r.entity, text: it.state === 'ready' ? it.text : '', detail: area,
          active, changed: e && e.changed ? Date.parse(e.changed) || 0 : 0, state: it.state, available: it.available };
      }),
      request() { return []; },
    },
    /* TIMER (timer.*): HA's state, its configured duration, the time left while paused, the finish moment while active.
       Start / Pause / Cancel through the secure channel (the server plans the fixed service). */
    timer: {
      domains: ['timer'],
      config(c, e) {
        if (!e) return c;
        const a = e.attrs || {};
        return { ...c, state: e.state, available: e.available, duration: num(a.duration), remaining: num(a.remaining), finishesAt: a.finishes_at ? Date.parse(a.finishes_at) : null };
      },
      update(el, e, c) { const x = this.config(c, e); el.timer?.setState({ state: x.state, available: x.available, duration: x.duration, remaining: x.remaining, finishesAt: x.finishesAt }); },
      caps: () => '',
      view: (e) => ({ state: e.state }),
      hooks: ({ run }) => ({ onRequest: (req) => { if (['start', 'pause', 'cancel'].includes(req)) run([[req]]); } }),
    },
    sunmoon: {
      domains: ['sun'],
      config(c, e) { return e ? { ...c, sun: sunData(e), ...sunMoonMapped(c) } : c; },
      update(el, e, c) { el.sunmoon?.setState({ sun: sunData(e), ...sunMoonMapped(c) }); },
      caps: () => '',
      start({ widget, config, ha, last }) {
        const store = { vals: {}, known: {} };
        APP_MAPPED.set(config, store);
        const push = () => { const w = widget(); if (w && w.sunmoon) w.sunmoon.setState(sunMoonMapped(config)); };
        const offs = [...new Set(Object.values(moonIds(config)).filter(Boolean))].map((id) => ha.subscribe(id, (m) => { store.vals[id] = m; store.known[id] = true; push(); }));
        return () => offs.forEach((o) => o());
      },
    },
    person: {
      domains: ['person', 'device_tracker'],
      config(c, e) {
        if (!e) return c;
        const st = String(e.state);
        const presence = !e.available ? (st.toLowerCase() === 'unknown' ? 'unknown' : 'unavailable') : st === 'home' ? 'home' : st === 'not_home' ? 'away' : 'zone';
        // "Home since 14:02": when the presence last CHANGED (HA's last_changed) — not "last seen" (that would be the
        // tracker's last report, another entity). The demo "Last seen" / secondary text are never shown when linked.
        const since = e.available && ['home', 'away', 'zone'].includes(presence) ? when(e.changed) : '';
        return { ...c, presence, zone: presence === 'zone' ? st : undefined, image: e.attrs?.image || c.image || undefined, available: e.available || st.toLowerCase() === 'unknown',
          since, lastSeen: undefined, secondary: '', tracker: personTracker(e, APP_MAPPED.get(c)) };
      },
      update(el, e, c) {
        const x = this.config(c, e);
        el.person?.setState({ presence: x.presence, zone: x.zone, image: x.image, available: x.available, since: x.since, lastSeen: undefined, secondary: '', tracker: x.tracker });
      },
      caps: () => '',
      /** the device tracker Home Assistant says follows this person (person.source) joins the shared poll — read-only: its name, how it
          tracks (GPS / router / Bluetooth) and its battery; never coordinates, accuracy or history. A device_tracker widget is its own tracker. */
      start({ widget, config, ha, last }) {
        const e0 = last();
        const id = e0 && e0.domain === 'person' && typeof e0.attrs?.source === 'string' && SLOT_ID.test(e0.attrs.source) ? e0.attrs.source : null;
        const store = { vals: {}, known: {} };
        APP_MAPPED.set(config, store);
        let off = null, cur = id;
        const sub = (tid) => { if (off) off(); off = null; cur = tid; if (tid) off = ha.subscribe(tid, (t) => { store.vals[tid] = t; store.known[tid] = true; const w = widget(), e = last(); if (w && w.person && e) w.person.setState({ tracker: personTracker(e, store) }); }); };
        sub(id);
        // the tracker can change (HA switches it): follow it when the person's state says so
        const unP = ha.subscribe(config.entity, (e) => { const n = e && e.domain === 'person' && typeof e.attrs?.source === 'string' && SLOT_ID.test(e.attrs.source) ? e.attrs.source : null; if (n !== cur) sub(n); });
        return () => { if (off) off(); unP(); };
      },
    },
  });

  const APPLIANCE_STATES = ['running', 'paused', 'finished', 'idle', 'off', 'heating', 'error'];

  /* ---- Generic binding for CUSTOM widgets ('entity'): the widget receives the normalised entity exactly as the server
     serves it — { id, domain, name, state, available, unit, changed, attrs } — as config.haEntity when it is created and
     through el.haEntity(entity) on every change, and interprets it itself. The shared layer never knows which widget uses it.
     ACTION CHANNEL: when the package's widget.json declares "ha": { "actions": [...] } (validated by the server), the widget
     also receives config.haActions (the declared list) and config.haRequest(action) → Promise<{ ok, error? }>:
       · only a declared action, only on an entity of a declared domain, only while it is available;
       · sent through the existing secure path (IniqHA.call → api/ha_call.php: session, CSRF, same origin), naming the
         package, so the server re-checks the declaration; the server picks the HA service (no service names here);
       · inside the configuration preview (a dialog) it never reaches HA: { ok: false, error: 'preview' };
       · no optimistic state: the widget shows what HA reports next (on failure it is re-sent HA's current state). */
  const entityView = (e) => (e ? Object.freeze({ id: e.id, domain: e.domain, name: e.name, state: e.state, available: !!e.available, unit: e.unit ?? null,
    changed: e.changed ?? null, updated: e.updated ?? null, reported: e.reported ?? null, attrs: Object.freeze({ ...(e.attrs || {}) }) }) : null);
  Object.assign(B, {
    entity: {
      domains: null,
      config(c, e) { return e ? { ...c, haEntity: entityView(e) } : c; },
      update(el, e) { if (typeof el.haEntity === 'function') el.haEntity(entityView(e)); },
      caps: () => '',
      hooks: ({ run, last, preview, resync, error, opts }) => {
        const acts = opts && Array.isArray(opts.actions) ? opts.actions.slice() : [];
        const doms = opts && Array.isArray(opts.domains) ? opts.domains.slice() : [];
        if (!acts.length || !opts.widget) return {};                         // read-only package
        return {
          haActions: Object.freeze(acts),
          haRequest: async (action) => {
            if (!acts.includes(action)) return { ok: false, error: 'not_declared' };
            const e = last();
            if (!e) return { ok: false, error: 'unknown_entity' };
            if (!doms.includes(e.domain)) return { ok: false, error: 'domain_not_declared' };
            if (!e.available) return { ok: false, error: 'unavailable' };
            if (preview()) { resync(); return { ok: false, error: 'preview' }; }
            return (await run([[action]], undefined, opts.widget)) ? { ok: true } : { ok: false, error: error() || 'failed' };
          },
        };
      },
    },
  });

  /* ---- NUMBER & SELECT: set a value (number / input_number) or choose an option (select / input_select). The range, step,
     unit and options are Home Assistant's (never configured, never guessed); the widget asks through haSet(value) — the same
     secure channel (IniqHA.call → api/ha_call.php, session + CSRF + same origin), which sends only { entity, action, value }:
     the server re-reads the entity, checks the value against ITS range / step / options and picks the service. */
  const NUMSEL_NUMBER = ['number', 'input_number'], NUMSEL_SELECT = ['select', 'input_select'];
  Object.assign(B, {
    numsel: {
      domains: [...NUMSEL_NUMBER, ...NUMSEL_SELECT],
      config(c, e) {
        if (!e) return c;
        const a = e.attrs || {}, k = e.caps || {};
        if (NUMSEL_SELECT.includes(e.domain)) {
          return { ...c, kind: 'select', state: e.state, available: e.available, option: e.available ? e.state : null,
            options: Array.isArray(a.options) ? a.options.slice() : [], readonly: !k.select_option };
        }
        return { ...c, kind: 'number', state: e.state, available: e.available, value: e.available ? num(a.value ?? e.state) : null,
          min: num(a.min), max: num(a.max), step: num(a.step), unit: e.unit || '', readonly: !k.set_value };
      },
      update(el, e, c) {
        const x = this.config(c, e);
        el.numsel?.setState(x.kind === 'select' ? { state: x.state, available: x.available, option: x.option } : { state: x.state, available: x.available, value: x.value });
      },
      // a new range / step / unit / option list rebuilds the widget (its controls are built from them)
      caps: (e) => (e ? JSON.stringify([e.domain, e.caps, e.unit, e.attrs?.min, e.attrs?.max, e.attrs?.step, e.attrs?.options]) : ''),
      hooks: ({ run, last, preview, resync, error }) => ({
        haSet: async (value) => {
          const e = last();
          if (!e) return { ok: false, error: 'unknown_entity' };
          if (!e.available) return { ok: false, error: 'unavailable' };
          const select = NUMSEL_SELECT.includes(e.domain);
          // checked here too (the server decides): only a real option, only a number inside HA's range
          if (select ? !(e.attrs?.options || []).includes(value) : !(typeof value === 'number' && Number.isFinite(value) && value >= e.attrs?.min && value <= e.attrs?.max)) {
            return { ok: false, error: select ? 'not_an_option' : 'out_of_range' };
          }
          if (preview()) { resync(); return { ok: false, error: 'preview' }; }
          return (await run([[select ? 'select_option' : 'set_value', value]])) ? { ok: true } : { ok: false, error: error() || 'failed' };
        },
      }),
    },
  });

  /** entities a card interaction may switch on / off (the server's plan() supports turn_on / turn_off for these) */
  const TOGGLE_DOMAINS = ['light', 'switch', 'input_boolean', 'fan'];
  const LOST = { ha_unavailable: 'Home Assistant unreachable', offline: 'IniqDash server unreachable', not_configured: 'Home Assistant not configured', signed_out: 'Signed out' };

  /* bound widgets that left the page (editor re-render, page switch) stop being polled */
  const live = new Map();          // wrap → cleanup
  let mo = null, sweepT = 0;
  function watch() {
    if (mo) return;
    mo = new MutationObserver(() => { clearTimeout(sweepT); sweepT = setTimeout(sweep, 300); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  function sweep() {
    const now = Date.now();
    live.forEach((rec, w) => {
      if (w.isConnected) { rec.seen = true; return; }
      // detached for good (a closed dialog preview, a removed item…) — or never shown at all
      if (rec.seen || now - rec.born > 5000) { rec.cleanup(); live.delete(w); }
    });
    if (live.size) { clearTimeout(sweepT); sweepT = setTimeout(sweep, 5000); }
  }

  function bind(type, config, create, opts = null) {
    const b = B[type];
    const ha = HA();
    if (!b || !ha || !ha.enabled() || !config || !config.entity) return create(config);

    const id = config.entity;
    const wrap = document.createElement('div');
    wrap.className = 'iqha';
    wrap.dataset.entity = id;
    const badge = document.createElement('span');
    badge.className = 'iqha__badge';
    badge.setAttribute('role', 'status');
    let el = null, sig = null, last = ha.get(id), known = ha.known ? ha.known(id) : last !== null;
    let view = last && b.view ? b.view(last) : null;   // HA's state as the widget sees it (+ what was just asked)

    /** send actions to HA (through IniqHA). A widget inside a dialog is a configuration PREVIEW:
        it never operates the real device — its view simply returns to HA's state. */
    let lastError = null;
    const resync = () => setTimeout(() => { const cur = ha.get(id); if (cur && el) { b.update(el, cur, config); if (b.view) view = b.view(cur); } }, 600);
    async function run(acts, code, via) {
      lastError = null;
      if (!acts.length) return true;
      if (wrap.closest('dialog')) {
        setTimeout(() => { const cur = ha.get(id); if (cur && el) { b.update(el, cur, config); if (b.view) view = b.view(cur); } }, 600);
        return true;
      }
      let all = true;
      for (const [action, value] of acts) {
        const r = await ha.call(id, action, value, code, via);
        if (!r.ok) {
          all = false;
          lastError = r.error || 'failed';
          if (MSG[r.error]) flash(MSG[r.error]);
          wrap.dataset.error = r.error;              // brief visual hint; the next HA state restores the truth
          setTimeout(() => { delete wrap.dataset.error; }, 2500);
          const cur = ha.get(id); if (cur && el) { b.update(el, cur, config); if (b.view) view = b.view(cur); }
        }
      }
      return all;
    }
    const onChange = (next, prev, meta) => {
      if (!b.actions || (meta && meta.source === 'external')) return;
      const acts = b.actions(next, view || { ...prev, dim: true, canTarget: true }, meta || {});
      if (view) view = { ...view, ...next };
      run(acts);
    };
    let flashT = 0, flashText = '';
    function flash(text) { flashText = text; clearTimeout(flashT); flashT = setTimeout(() => { flashText = ''; paint(); }, 3500); paint(); }
    const hooks = b.hooks ? b.hooks({ run, widget: () => el, last: () => last, preview: () => !!wrap.closest('dialog'), resync, error: () => lastError, opts, config }) : { onChange };
    /* NEVER demo values for a linked entity: until Home Assistant's first answer for it, the widget is not created at all —
       a neutral placeholder (the configured name only) stands in. Then the real widget, from HA's state. */
    function build(e) {
      if (!e) {
        const ph = document.createElement('div');
        ph.className = 'iqha__wait';
        ph.setAttribute('aria-busy', 'true');
        const n = document.createElement('span');
        n.className = 'iqha__wait-n';
        n.textContent = String(config.name || config.title || config.location || config.text || config.primary || '');
        ph.append(n);
        sig = null;
        if (el) el.replaceWith(ph); else wrap.prepend(ph);
        el = ph;
        return;
      }
      sig = b.caps(e);
      const node = create({ ...b.config(config, e), ...hooks, ...(slots.length ? { infoItems: infoItems.slice() } : {}) });
      if (el) el.replaceWith(node); else wrap.prepend(node);
      el = node;
    }
    function paint() {
      const st = ha.status().state;
      const lost = LOST[st] || null;
      const na = !lost && last && !last.available;
      const missing = !lost && st === 'connected' && known && last === null;   // HA has no such entity
      const waiting = !lost && !missing && last === null;                       // no answer from HA yet: neutral, never demo data
      wrap.dataset.ha = lost ? 'lost' : na ? 'unavailable' : missing ? 'missing' : waiting ? 'loading' : 'ok';
      // the dimmed widget takes no input — not from the pointer (CSS) and not from the keyboard either (inert: out of the tab order)
      if (wrap.firstElementChild) wrap.firstElementChild.inert = !!(lost || na || missing);
      // a widget that already says it is unavailable / unknown in its own words gets no second pill with the same word
      const word = na ? (last.state === 'unknown' ? 'Unknown' : 'Unavailable') : '';
      const said = !!word && !!el && new RegExp(`\\b${word}\\b`, 'i').test(el.textContent || '');
      badge.textContent = flashText || lost || (na ? (said ? '' : word) : missing ? `Not found: ${id}` : waiting ? 'Loading…' : '');
      badge.hidden = !badge.textContent;
    }
    /* information slots: every slot entity joins the SAME shared poll (IniqHA.subscribe); nothing fetches on its own */
    const slots = slotsOf(config);
    let infoItems = slots.map((sl) => slotItem(sl, ha.get(sl.entity), ha.known ? ha.known(sl.entity) : false));
    const pushInfo = () => { const api = el && el[type]; if (api && typeof api.setState === 'function') api.setState({ infoItems: infoItems.slice() }); };
    build(last);
    wrap.append(badge);
    paint();

    const slotUnsubs = slots.map((sl, i) => ha.subscribe(sl.entity, (e) => { infoItems[i] = slotItem(sl, e, true); pushInfo(); }));

    const unsub = ha.subscribe(id, (e) => {
      last = e; known = true;
      if (e && b.view) view = b.view(e);
      if (e && (sig === null || b.caps(e) !== sig)) build(e); else if (e && el) b.update(el, e, config);
      paint();
    });
    const unStatus = ha.onStatus(paint);
    const stop = b.start ? b.start({ wrap, widget: () => el, id, config, ha, last: () => last }) : null;
    live.set(wrap, { born: Date.now(), seen: false, cleanup: () => { unsub(); unStatus(); slotUnsubs.forEach((u) => u()); if (stop) stop(); } });
    watch();
    /* COMMON INTERACTIONS (card Tap / Double tap / Long press → toggle / turn on / turn off, components/widget-kit):
       the same secure path as the widget's own controls — IniqHA.call → api/ha_call.php (session, CSRF, same origin;
       the server plans the service). Only on/off entities (light, switch, input_boolean, fan); a toggle is resolved from
       the state Home Assistant last reported (never optimistic). A custom package goes through its DECLARED action
       channel (its id is sent; the server re-checks the declaration). In the configuration preview nothing is sent. */
    async function request(action) {
      if (!['toggle', 'turn_on', 'turn_off'].includes(action)) return { ok: false, error: 'not_supported' };
      const e = last;
      if (!e) return { ok: false, error: 'unknown_entity' };
      if (!TOGGLE_DOMAINS.includes(e.domain)) return { ok: false, error: 'not_supported' };
      if (!e.available) return { ok: false, error: 'unavailable' };
      const act = action === 'toggle' ? (e.state === 'on' ? 'turn_off' : 'turn_on') : action;
      if (wrap.closest('dialog')) { resync(); return { ok: false, error: 'preview' }; }
      const via = opts && opts.widget ? opts.widget : undefined;
      if (via && !((opts.actions || []).includes(act) && (opts.domains || []).includes(e.domain))) return { ok: false, error: 'not_declared' };
      return (await run([[act]], undefined, via)) ? { ok: true } : { ok: false, error: lastError || 'failed' };
    }
    wrap.iqha = { entity: id, widget: () => el, last: () => last, request };
    return wrap;
  }

  /** a widget of MANY entities (Entity List): every entity joins the SAME shared poll; a press is one secure IniqHA.call (the server plans
      the service from the entity's domain and capabilities). In a configuration preview nothing is sent. */
  function bindMany(type, config, create) {
    const b = B[type], ha = HA();
    if (!b || !b.many || !ha || !ha.enabled() || !config) return create(config);
    const wrap = document.createElement('div');
    wrap.className = 'iqha';
    const badge = document.createElement('span');
    badge.className = 'iqha__badge';
    badge.setAttribute('role', 'status');
    const vals = {}, known = {};
    let el = null, flashT = 0, flashText = '', cfg = config;
    const items = () => b.items(cfg, vals, known);
    const paint = () => {
      const st = ha.status().state, lost = LOST[st] || null;
      wrap.dataset.ha = lost ? 'lost' : 'ok';
      if (wrap.firstElementChild) wrap.firstElementChild.inert = !!lost;
      badge.textContent = flashText || lost || '';
      badge.hidden = !badge.textContent;
    };
    const flash = (t) => { flashText = t; clearTimeout(flashT); flashT = setTimeout(() => { flashText = ''; paint(); }, 3500); paint(); };
    async function onRequest(entity, ctl) {
      if (wrap.closest('dialog')) { setTimeout(() => el?.[type]?.setState({ items: items() }), 400); return; }
      for (const [action, value] of b.request(entity, ctl)) {
        const r = await ha.call(entity, action, value);
        if (!r.ok) { if (MSG[r.error]) flash(MSG[r.error]); else flash('Home Assistant refused that'); el?.[type]?.setState({ items: items() }); }
      }
    }
    // an optional LAZY layer (b.start): data that is not part of the state poll (calendar events) — it refreshes the widget itself;
    // the widget may ask for another range (onRange, e.g. a calendar's week / month) through it
    let lazyCtl = null;
    const refresh = () => el?.[type]?.setState({ items: items() });
    const onRange = (w) => { if (lazyCtl && lazyCtl.onRange) lazyCtl.onRange(w); };
    el = create({ ...config, items: items(), onRequest, ...(b.start ? { onRange } : {}) });
    wrap.append(el, badge);
    paint();
    if (b.start) lazyCtl = b.start({ wrap, ha, config, setCfg: (patch) => { cfg = { ...cfg, ...patch }; }, refresh });
    const ids = [...new Set(b.many(config))];
    const sub = (id) => ha.subscribe(id, (e) => { vals[id] = e; known[id] = true; el?.[type]?.setState({ items: items() }); });
    const offs = ids.map(sub);
    // DISCOVERED entities (b.discover → Promise<[id]>): found after the widget is drawn — config.found holds them, each joins the same poll
    let gone = false;
    const found = b.discover ? b.discover(config, ha) : null;
    if (found && typeof found.then === 'function') found.then((list) => {
      if (gone || !Array.isArray(list)) return;
      cfg = { ...config, found: list };
      list.filter((id) => !ids.includes(id)).forEach((id) => offs.push(sub(id)));
      el?.[type]?.setState({ items: items() });
    });
    const unStatus = ha.onStatus(paint);
    live.set(wrap, { born: Date.now(), seen: false, cleanup: () => { gone = true; offs.forEach((o) => o()); unStatus(); clearTimeout(flashT); if (lazyCtl && lazyCtl.stop) lazyCtl.stop(); } });
    watch();
    return wrap;
  }

  /* ---- GENERIC ROLES BINDING for CUSTOM widgets ("ha": { "binding": "roles", "roles": {…}, "actionSlots": {…} } in widget.json).
     The package DECLARES named entity roles (one entity or several, with allowed domains / device classes) and named action slots
     (allowed domains + fixed actions); the owner maps entities in the configuration (config.haRoles / config.haSlots, generated from the
     declaration). This layer knows no role or slot name. It hands the widget:
       · config.haState / el.haState(state) = { roles: { <role>: entry | [entry…] | null }, slots: { <slot>: [entry | null…] }, info?: [line…] }
         (info: only when the package offers Information lines — each the shared slotItem() of config.info[i] + the entity's name / device class)
         entry = { entity, status: 'loading' | 'missing' | 'ready', state: { id, domain, name, state, available, unit, changed, updated, reported, attrs } | null }
         (the normalised entity exactly as the server serves it — no token, no connection detail). Every mapped entity joins the SAME shared poll.
       · config.haRequest({ slot, index, action }) → Promise<{ ok, error? }>: the widget names a slot and an index, NEVER an entity, domain or
         service. Only a declared slot, an index inside its configured entities, an action the slot declares, only while the entity is available;
         sent through IniqHA.call → api/ha_call.php (session, CSRF, same origin, the package id) where the server re-checks the declaration and
         plans the fixed service. No optimistic state; in the configuration preview (a dialog) nothing is sent. */
  const ROLE_MAXDEF = 8;
  /** a slot list keeps its POSITIONS (the form may hold { 0: …, 3: … }): position i is the widget's button i */
  const asSlots = (raw, max) => { const out = Array(max).fill(null); if (Array.isArray(raw)) raw.slice(0, max).forEach((v, i) => { out[i] = v; }); else if (raw && typeof raw === 'object') Object.keys(raw).forEach((k) => { const i = Number(k); if (Number.isInteger(i) && i >= 0 && i < max) out[i] = raw[k]; }); return out; };
  const asList = (raw) => (Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.keys(raw).sort((a, b) => a - b).map((k) => raw[k]) : []);
  /** the configured entity ids, cleaned against the DECLARATION (domain, cardinality); anything else a hand-edited file holds is dropped */
  /** the widget's Home Assistant AREA (config.area: HA's area id), if any */
  const areaOf = (config) => (config && typeof config.area === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(config.area) ? config.area : null);
  /* AREA ROLES ("area": true): with config.area set, the role is EVERY entity of its domains HA places in that area (own or device area —
     IniqHA.areaEntitiesNow, the discovery answer; no count limit); pending while that answer is not known yet. Without an area (or when HA
     cannot tell areas) the role's own mapping (config.haRoles) is used, as before. opts.noArea: the fallback. */
  function rolesOf(config, decl, opts = {}) {
    const okId = (id, domains) => (typeof id === 'string' && id.length <= 120 && SLOT_ID.test(id) && domains.includes(id.split('.')[0]) ? id : null);
    const roles = {}, slots = {}, pending = [], ha = HA();
    Object.entries(decl.roles || {}).forEach(([name, r]) => {
      const area = r.area && r.multiple && !opts.noArea ? areaOf(config) : null;
      if (area && ha && ha.enabled()) {
        const now = ha.areaEntitiesNow ? ha.areaEntitiesNow(area, r.domains) : null;
        if (now) { roles[name] = now.filter((x) => okId(x, r.domains)); return; }
        roles[name] = []; pending.push(name); return;
      }
      const raw = config && config.haRoles ? config.haRoles[name] : undefined;
      roles[name] = r.multiple ? asList(raw).map((x) => okId(x, r.domains)).filter(Boolean).slice(0, r.max || ROLE_MAXDEF) : (okId(raw, r.domains) || null);
    });
    Object.entries(decl.slots || {}).forEach(([name, sl]) => {
      const raw = config && config.haSlots ? config.haSlots[name] : undefined;
      slots[name] = asSlots(raw, sl.max || 1).map((x) => okId(x, sl.domains));
    });
    return { roles, slots, pending };
  }
  /** the widget's Information lines (the shared capability, config.info) when its declaration offers them (decl.info = at most how many) */
  const infoOf = (config, decl) => (decl && decl.info > 0 && Array.isArray(config && config.info) ? config.info.filter((x) => x && typeof x.entity === 'string' && SLOT_ID.test(x.entity) && x.entity.length <= 120).slice(0, Math.min(8, decl.info)) : []);
  const idsOf = (r, lines) => [...new Set([...Object.values(r.roles).flat(), ...Object.values(r.slots).flat(), ...lines.map((x) => x.entity)].filter(Boolean))];
  const rolesIds = (config, decl) => idsOf(rolesOf(config, decl), infoOf(config, decl));
  /** a widget that has something to bind: a mapped entity, or an area role with an area (its entities may still be loading) */
  const rolesWanted = (config, decl) => rolesIds(config, decl).length > 0 || (!!areaOf(config) && Object.values((decl && decl.roles) || {}).some((r) => r.area && r.multiple));
  function bindRoles(config, create, decl) {
    const ha = HA();
    if (!ha || !ha.enabled() || !config || !decl || !decl.widget || !rolesWanted(config, decl)) return create(config);
    let map = rolesOf(config, decl);
    const lines = infoOf(config, decl);
    const wrap = document.createElement('div');
    wrap.className = 'iqha';
    const badge = document.createElement('span');
    badge.className = 'iqha__badge';
    badge.setAttribute('role', 'status');
    const vals = {}, known = {};
    const entry = (id) => (id ? { entity: id, status: known[id] ? (vals[id] ? 'ready' : 'missing') : 'loading', state: vals[id] ? entityView(vals[id]) : null } : null);
    const state = () => Object.freeze({
      roles: Object.freeze(Object.fromEntries(Object.entries(map.roles).map(([n, v]) => [n, Array.isArray(v) ? v.map(entry) : entry(v)]))),
      slots: Object.freeze(Object.fromEntries(Object.entries(map.slots).map(([n, v]) => [n, v.map(entry)]))),
      // Information lines: the shared formatter's item (value in HA's words + its unit; 'loading' | 'missing' | 'absent' | 'ready'), with the
      // entity's own name and device class (HA's, for a label fallback / the widget's summary) — by line id, in the owner's order
      ...(map.pending.length ? { pending: Object.freeze(map.pending.slice()) } : {}),   // area roles whose entities are not known yet
      ...(decl.info > 0 ? { info: Object.freeze(lines.map((x) => Object.freeze({ ...slotItem(x, vals[x.entity], known[x.entity]), active: isActive(vals[x.entity]), name: vals[x.entity] ? vals[x.entity].name || '' : '', dc: vals[x.entity] && vals[x.entity].attrs ? vals[x.entity].attrs.device_class || null : null }))) } : {}),
    });
    let el = null, flashT = 0, flashText = '';
    const paint = () => {
      const st = ha.status().state, lost = LOST[st] || null;
      wrap.dataset.ha = lost ? 'lost' : 'ok';
      if (wrap.firstElementChild) wrap.firstElementChild.inert = !!lost;
      badge.textContent = flashText || lost || '';
      badge.hidden = !badge.textContent;
    };
    const flash = (t) => { flashText = t; clearTimeout(flashT); flashT = setTimeout(() => { flashText = ''; paint(); }, 3500); paint(); };
    const push = () => { if (el && typeof el.haState === 'function') el.haState(state()); };
    async function haRequest(req) {
      const slot = req && typeof req === 'object' ? decl.slots && decl.slots[req.slot] : null;
      if (!slot || !Number.isInteger(req.index) || req.index < 0 || typeof req.action !== 'string') return { ok: false, error: 'not_declared' };
      if (!(slot.actions || []).includes(req.action)) return { ok: false, error: 'not_declared' };
      const id = (map.slots[req.slot] || [])[req.index];
      if (!id) return { ok: false, error: 'unknown_entity' };
      const e = vals[id];
      if (!e) return { ok: false, error: known[id] ? 'unknown_entity' : 'loading' };
      if (!(slot.domains || []).includes(e.domain)) return { ok: false, error: 'domain_not_declared' };
      if (!e.available) return { ok: false, error: 'unavailable' };
      if (wrap.closest('dialog')) { setTimeout(push, 400); return { ok: false, error: 'preview' }; }
      const r = await ha.call(id, req.action, undefined, undefined, decl.widget);
      if (!r.ok) { if (MSG[r.error]) flash(MSG[r.error]); else flash('Home Assistant refused that'); push(); return { ok: false, error: r.error || 'failed' }; }
      return { ok: true };
    }
    // every bound entity joins the shared poll (an area role's entities join once HA's area answer is known)
    const offs = new Map();
    const follow = () => idsOf(map, lines).forEach((id) => {
      if (offs.has(id)) return;
      vals[id] = ha.get(id); known[id] = ha.known ? ha.known(id) : vals[id] !== null;
      offs.set(id, () => {}); offs.set(id, ha.subscribe(id, (e) => { vals[id] = e; known[id] = true; push(); }));
    });
    follow();
    el = create({ ...config, haState: state(), haRequest });
    wrap.append(el, badge);
    paint();
    if (map.pending.length) {
      const area = areaOf(config);
      ha.areaEntities(area).then(() => {
        // HA could not tell its areas → the roles' own mappings (as without an area)
        map = rolesOf(config, decl, ha.areaEntitiesNow(area) ? {} : { noArea: true });
        follow(); push();
      });
    }
    const unStatus = ha.onStatus(paint);
    live.set(wrap, { born: Date.now(), seen: false, cleanup: () => { offs.forEach((o) => o()); unStatus(); clearTimeout(flashT); } });
    watch();
    return wrap;
  }

  /* ---- WHAT THE LINKED ENTITY CAN DO — for the configuration form (Settings), from the SAME config() the widget is built
     with (one capability truth; the server's normalised caps). summary(): three lists for the read-only summary
       supports  — what Home Assistant reports for this entity
       available — what IniqDash's widget offers for it now
       missing   — reported by HA, not implemented in IniqDash yet (shown, never faked)
     and an optional note. */
  const has = (list) => list.filter(([, on]) => on).map(([label]) => label);
  const SUMMARY = {
    light(e) {
      const k = e.caps || {};
      const supports = has([['On/Off', true], ['Brightness', k.brightness], ['Colour temperature', k.color_temp], ['Colour', k.color], ['White', k.white], ['Effects', k.effect]]);
      const ct = !!lightColour(e).range;
      return { supports, available: has([['On/Off', true], ['Brightness', k.brightness], ['Colour temperature', ct], ['Colour (hue swatches)', k.color], ['Effects', k.effect]]),
        missing: has([['Colour temperature', k.color_temp && !ct], ['White', k.white]]),
        note: k.color_temp && !ct ? 'Home Assistant reports no colour-temperature range for this light: the control is not offered.' : '' };
    },
    switch: () => ({ supports: ['On/Off'], available: ['On/Off'], missing: [] }),
    climate(e, x) {
      const k = e.caps || {}, a = e.attrs || {};
      const modes = (k.hvac_modes || []).map((m) => global.MaisonClimate?.MODES?.[m]?.label || m);
      return {
        supports: has([['Room temperature', a.current_temperature !== null && a.current_temperature !== undefined], ['Target temperature', k.target_temperature], ['Target range (low / high)', k.target_range],
          [`HVAC modes (${modes.join(', ')})`, modes.length > 1], ['Fan modes', k.fan_mode], ['Presets', k.preset_mode], ['Swing', k.swing_mode], ['Target humidity', k.target_humidity]]),
        available: has([['Room temperature', a.current_temperature !== null && a.current_temperature !== undefined], ['Target temperature', x.capabilities?.targetTemperature], ['HVAC mode', x.capabilities?.hvacMode],
          ['Preset', x.capabilities?.preset], ['Fan mode', x.capabilities?.fanMode], ['Swing mode', x.capabilities?.swingMode], ['Room humidity', num(a.current_humidity) !== null], ['Target humidity', x.capabilities?.targetHumidity], ['Target range (low / high)', x.capabilities?.targetRange]]),
        missing: has([['Target humidity', k.target_humidity && !x.capabilities?.targetHumidity], ['Swing mode', k.swing_mode && !x.capabilities?.swingMode]]),
        note: k.target_temperature && !x.capabilities?.targetTemperature ? 'No single target temperature is reported in the current mode.' : '',
      };
    },
    cover(e) {
      const k = e.caps || {};
      return { supports: has([['Open', k.open], ['Close', k.close], ['Stop', k.stop], ['Position', k.position], ['Tilt', k.tilt]]),
        available: has([['Open', k.open], ['Close', k.close], ['Stop', k.stop], ['Position', k.position]]), missing: has([['Tilt', k.tilt]]) };
    },
    fan(e) {
      const k = e.caps || {};
      return { supports: has([['On/Off', true], ['Speed', k.speed], ['Presets', k.preset], ['Oscillation', k.oscillate], ['Direction', k.direction]]),
        available: has([['On/Off', true], ['Speed', k.speed], ['Presets', k.preset], ['Oscillation (shown only)', k.oscillate], ['Direction (shown only)', k.direction]]), missing: [] };
    },
    media(e) {
      const k = e.caps || {};
      const pp = k.play || k.pause || k.stop;
      return { supports: has([['Play / pause', pp], ['Previous', k.previous], ['Next', k.next], ['Volume', k.volume], ['Mute', k.mute], ['Source', k.source], ['Power', k.power], ['Seek', k.seek], ['Shuffle', k.shuffle], ['Repeat', k.repeat]]),
        available: has([['Play / pause', pp], ['Previous', k.previous], ['Next', k.next], ['Volume', k.volume], ['Mute', k.mute], ['Source', k.source], ['Power', k.power], ['Shuffle', k.shuffle && typeof e.attrs?.shuffle === 'boolean'], ['Repeat', k.repeat && !!e.attrs?.repeat]]),
        missing: has([['Seek', k.seek]]) };
    },
    camera(e, x) {
      const k = e.caps || {};
      const ids = Object.values(doorbellIds(x || {})).filter(Boolean).length;
      return { supports: has([['Picture', true], ['Live stream', k.stream], ['Turn on/off', k.on_off]]), available: ['Picture (refreshed)', 'Enlarged picture', ...(x && x.variant === 'doorbell' && ids ? [`Doorbell chips (${ids})`] : [])], missing: has([['Live stream', k.stream], ['Turn on/off', k.on_off]]) };
    },
    lock(e) {
      const k = e.caps || {};
      const l = has([['Lock', k.lock], ['Unlock', k.unlock], ['Open (unlatch)', k.open]]);
      return { supports: l, available: l, missing: [], note: e.attrs?.code ? 'Home Assistant asks for a code: IniqDash asks for it for each action and never stores it.' : '' };
    },
    alarm(e, x) {
      const k = e.caps || {};
      const label = (m) => global.MaisonAlarm?.MODE_LABEL?.[m] || m;
      const arm = ['arm_home', 'arm_away', 'arm_night', 'arm_vacation', 'arm_custom_bypass'].filter((m) => k[m]).map((m) => `Arm ${label(m).toLowerCase()}`);
      return { supports: ['Disarm', ...arm, ...(k.alarm_trigger ? ['Trigger'] : [])], available: ['Disarm', ...(x.modes || []).map((m) => `Arm ${label(m).toLowerCase()}`)],
        missing: k.alarm_trigger ? ['Trigger'] : [], note: e.attrs?.code ? 'Home Assistant asks for a code: IniqDash asks for it for each action and never stores it.' : '' };
    },
  };
  /** numeric display widgets: what the entity gives, and a warning when it is not a number */
  function numericSummary(what) {
    return (e) => {
      const n = num(e.state) !== null, unit = e.unit ? ` (${e.unit})` : '';
      if (n) return { supports: [`Numeric value${unit}`], available: [`Numeric value${unit}`], missing: [] };
      if (!e.available) return { supports: [], available: [], missing: [], note: `The entity is ${String(e.state).toLowerCase() === 'unknown' ? 'unknown' : 'unavailable'} right now — its kind of value cannot be read.` };
      return { supports: ['Text state'], available: [], missing: [], note: `Its state (“${String(e.state).slice(0, 40)}”) is not a number: ${what}` };
    };
  }
  SUMMARY.gauge = numericSummary('a gauge cannot show it as a value.');
  SUMMARY.chart = numericSummary('Home Assistant keeps no numeric history to chart for it.');
  SUMMARY.sensor = (e) => {
    const n = num(e.state) !== null;
    const kind = e.domain === 'binary_sensor' ? 'On/off state' : n ? `Numeric value${e.unit ? ` (${e.unit})` : ''}` : e.available ? 'Text state' : 'Value (unavailable right now)';
    return { supports: [kind], available: [kind], missing: [] };
  };
  SUMMARY.weather = (e) => {
    const l = ['Current conditions', ...forecastTypes(e).map((t) => `${FORECAST_LABEL[t]} forecast`)];
    return { supports: l, available: l, missing: [], note: forecastTypes(e).length ? '' : 'This weather entity reports no forecast: none is shown.' };
  };
  SUMMARY.numsel = (e) => {
    const a = e.attrs || {}, k = e.caps || {};
    if (NUMSEL_SELECT.includes(e.domain)) {
      const n = (a.options || []).length;
      return { supports: n ? [`Choose an option (${n})`] : [], available: k.select_option ? [`Choose an option (${n})`] : [],
        missing: [], note: n ? '' : 'Home Assistant reports no options for this entity: nothing can be chosen.' };
    }
    const r = num(a.min) !== null && num(a.max) !== null ? ` (${a.min} – ${a.max}${num(a.step) !== null ? `, step ${a.step}` : ''}${e.unit ? ` ${e.unit}` : ''})` : '';
    return { supports: [`Set a value${r}`], available: k.set_value ? [`Set a value${r}`] : [], missing: [],
      note: k.set_value ? '' : 'Home Assistant reports no usable range for this entity: the value is shown, not set.' };
  };
  SUMMARY.energy = (e, x) => {
    const ids = energyIds(x), on = Object.entries(ids).filter(([, v]) => v).map(([k]) => k);
    return { supports: ['Home power'], available: ['Home power', ...on.map((k) => ({ solar: 'Solar', grid: 'Grid (signed)', gridImport: 'Grid import', gridExport: 'Grid export', battery: 'Battery', batteryLevel: 'Battery level',
      ev: 'EV', evLevel: 'EV level', solarToday: 'Solar today', gridImportToday: 'Imported today', gridExportToday: 'Exported today', homeToday: 'Home today', evToday: 'EV today' })[k])], missing: [],
      note: e.available && num(e.state) === null ? `Home power is “${String(e.state).slice(0, 30)}” — not a number right now.` : '' };
  };
  SUMMARY.sunmoon = (e, x) => {
    const a = e.attrs || {}, m = moonIds(x || {});
    const ev = [['Sunrise', a.next_rising], ['Sunset', a.next_setting], ['Solar noon', a.next_noon], ['Dawn', a.next_dawn], ['Dusk', a.next_dusk], ['Midnight', a.next_midnight]].filter(([, v]) => v).map(([l]) => l);
    return { supports: ['Above / below the horizon', ...(num(a.elevation) !== null ? ['Elevation'] : []), ...(num(a.azimuth) !== null ? ['Azimuth'] : []), ...ev],
      available: ['Above / below the horizon', ...(num(a.elevation) !== null && num(a.azimuth) !== null ? ['Sky plot'] : []), ...ev, ...(m.moon ? ['Moon phase'] : []), ...(m.moonrise ? ['Moonrise'] : []), ...(m.moonset ? ['Moonset'] : [])], missing: [],
      note: 'The moon is shown only from the entities you map below — Home Assistant’s sun entity has no moon data, and nothing is calculated here.' };
  };
  SUMMARY.timer = (e) => ({ supports: ['State', 'Start / resume', 'Pause', 'Cancel'], available: ['State', 'Duration', ...(e.attrs?.finishes_at ? ['Time left (counted to the finish moment)'] : []), 'Start / resume', 'Pause', 'Cancel'], missing: [],
    note: e.state === 'active' && !e.attrs?.finishes_at ? 'Home Assistant reports no finish moment for this running timer: no countdown is shown.' : '' });
  SUMMARY.robot = (e, x) => {
    const k = e.caps || {};
    const L = [['Start / resume', k.start], ['Pause', k.pause], ['Stop', k.stop], ['Return to dock', k.dock], ['Locate', k.locate], ['Spot clean', k.spot], ['Suction level', k.fan_speed]];
    const mapped = typeof x?.mappings?.battery === 'string' && x.mappings.battery;
    return { supports: ['State', ...has(L)], available: ['State', ...has(L), ...(mapped || e.attrs?.battery != null ? ['Battery'] : [])], missing: [],
      note: !mapped && e.attrs?.battery == null ? 'Home Assistant reports no battery on this entity: map a battery sensor to show one.' : '' };
  };
  SUMMARY.calendar = () => ({ supports: ['Upcoming events'], available: ['Upcoming events (read-only)'], missing: [] });
  SUMMARY.appliance = (e, x) => (x && x.profile === 'washer' ? {
    supports: ['State'], available: ['State (in Home Assistant’s words)', ...['Programme', 'Time left', 'Progress', 'Power', 'Door', 'Start', 'Pause', 'Programme select']
      .filter((l, i) => washerIds(x)[Object.keys(WASHER_DOMAINS)[i]])], missing: [],
    note: (() => { const c = global.MaisonAppliance?.PROFILES?.washer?.concept?.(e.state, x.stateMap, { domain: e.domain, dc: e.attrs?.device_class }) || 'other';
      return e.available ? `Home Assistant reports “${String(e.state).slice(0, 40)}” now — ${c === 'other' ? 'not mapped: shown in its own words with a still drum (map it under State mapping)' : `shown as ${c}`}.` : ''; })(),
  } : { supports: ['State'], available: ['State (in Home Assistant’s words)'], missing: [],
    note: 'Programme, time left and progress are only shown from Home Assistant through Information lines — never guessed.' });
  const coverToggle = (e) => (e.domain === 'cover' && !(e.caps?.open && e.caps?.close)
    ? { supports: [], available: [], missing: [], note: 'This cover cannot both open and close, so a press cannot toggle it (Home Assistant would refuse).' } : null);
  SUMMARY.action = coverToggle;
  SUMMARY.button = coverToggle;

  /** The linked entity's capabilities for a widget configuration (null: not linked / no HA / no binding).
      state: loading (no answer yet) · lost (HA / server unreachable before any answer) · missing (no such entity) · ready */
  function capabilities(type, c) {
    const b = B[type], ha = HA();
    if (!b || !ha || !ha.enabled() || !c || !c.entity) return null;
    const e = ha.get(c.entity);
    if (!e) {
      const lost = LOST[ha.status().state] || null;
      return { state: ha.known && ha.known(c.entity) && !lost ? 'missing' : lost ? 'lost' : 'loading', message: lost };
    }
    const x = b.config(structuredClone(c), e);
    const sum = SUMMARY[type] ? SUMMARY[type](e, x) : null;
    return { state: 'ready', entity: e, config: x, summary: sum };
  }

  if (global.IniqHA) Object.assign(global.IniqHA, { bind, bindMany, bindRoles, rolesIds, rolesWanted, isActive, ACTIVE_STATES, manyOf: (type, c) => (B[type] && B[type].many ? B[type].many(c) : []), bindings: B, askCode, TEXT_ATTRS, TOGGLE_DOMAINS, capabilities, domainsFor: (type) => B[type]?.domains || null,
    info, format: Object.freeze({ state: stateItem, when, date: dateText, duration, clean, binary: BINARY, mediaProgress }),
    slots: Object.freeze({ max: SLOT_MAX, of: slotsOf, item: slotItem, sources: slotSources }),
    historyKind, timeline,
    calendarEvents, calendarMessage, forecastTypes, forecastEntries, forecastMessage, FORECAST_LABEL });
})(window);
