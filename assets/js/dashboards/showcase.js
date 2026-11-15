/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
/* Widget Library — the visual-QA dashboard: every built-in widget family and variant on one page, then the same widgets at
   micro / compact / normal / large on a second page. MOCK DATA ONLY (the widgets' own demo values): nothing here is linked to a
   Home Assistant entity. Open it with  editor.html?dashboard=showcase  (local mode) — it is an ordinary version-3 dashboard.
   The layout is generated here (a simple shelf packer per breakpoint) so the groups stay easy to edit. */
(function () {
  'use strict';
  const IMG = 'widgets/default/light/assets/';
  const G = (label, items) => ({ label, items });
  const W = (type, w, h, config = {}) => ({ type, w, h, config });
  /* ---- the pages (each: groups of widgets; { label: '' } groups have no heading) ---- */
  const overview = [
    G('', [W('weather', 4, 4, { location: 'Maison' }), W('light', 3, 4, { name: 'Salon', variant: 'artwork', brightness: 70 }), W('light', 3, 4, { name: 'Cuisine', variant: 'artwork', brightness: 45 }), W('climate', 4, 7, { name: 'Living Room', variant: 'dial', hvacMode: 'heat', state: 'heating' }),
      W('sensor', 2, 3, { name: 'Indoor temp', icon: 'temperature', value: 20.8, unit: '°C', status: 'Salle à manger' }), W('sensor', 2, 3, { name: 'Humidity', icon: 'humidity', value: 58, unit: '%', precision: 0, status: 'Chambre' }),
      W('appliance', 4, 4, { name: 'Washing Machine', profile: 'washer', programme: 'Cotton 40°', state: 'running', remaining: 84, progress: 35 }), W('media', 4, 4, { name: 'Living Room', variant: 'artwork' }),
      W('alarm', 4, 4, { name: 'Home Alarm', state: 'disarmed' }), W('lock', 2, 4, { name: 'Front Door', state: 'locked' }), W('cover', 4, 4, { name: 'Garage Door', variant: 'garage', state: 'closed', position: 0 }),
      W('robot', 4, 4, { name: 'Vacuum', profile: 'vacuum', state: 'cleaning', demoBattery: 72 }), W('energy', 5, 5, { name: 'Energy Flow', variant: 'flow' }), W('entitylist', 4, 5, { name: 'Entity List' }), W('activity', 4, 7, { name: 'Live Activity' }), W('timer', 3, 4, { name: 'Kitchen Timer', state: 'active', duration: 900, remaining: 520 })]),
  ];
  const controls = [
    G('Light', [W('light', 4, 4, { name: 'Dining Light', variant: 'artwork' }), W('light', 3, 4, { name: 'Kitchen', variant: 'tile', brightness: 60 }), W('light', 3, 3, { name: 'Bedside', variant: 'compact', brightness: 40 }), W('light', 3, 5, { name: 'Bedside', variant: 'slider', brightness: 40 }), W('light', 3, 4, { name: 'Garden', variant: 'artwork', state: 'off' })]),
    G('Switch · Fan · Action · Button', [W('switch', 3, 4, { name: 'Kitchen Extractor', state: 'on' }), W('switch', 3, 4, { name: 'Terrace', state: 'off' }), W('fan', 4, 4, { name: 'Living Room', state: 'on', speed: 60 }), W('fan', 4, 4, { name: 'Bedroom', state: 'off', speed: 0 }), W('action', 2, 3, { name: 'Good Night' }), W('button', 4, 2, { text: 'Salle à manger', secondary: '2 lights · TV · Echo', icon: 'home', layout: 'icon-left', action: 'navigate', page: 'overview' }), W('button', 3, 3, { text: 'Movie', icon: 'star', layout: 'icon-top' })]),
    G('Cover', [W('cover', 4, 4, { name: 'Garage Door', variant: 'garage', state: 'closed', position: 0 }), W('cover', 4, 3, { name: 'Living Room', variant: 'window', position: 50 }), W('cover', 4, 2, { name: 'Terrace', variant: 'slider', position: 75 }), W('cover', 3, 2, { name: 'Living Room', variant: 'compact', position: 50 })]),
    G('Number & Select', [W('numsel', 4, 3, { name: 'EV Charge Limit', kind: 'number', variant: 'slider' }), W('numsel', 4, 3, { name: 'Charge Limit', kind: 'number', variant: 'stepper' }), W('numsel', 4, 3, { name: 'Charging Mode', kind: 'select' })]),
  ];
  const appliances = [
    G('Washing machine · dishwasher', [W('appliance', 4, 4, { name: 'Washing Machine', profile: 'washer', programme: 'Cotton 40°', state: 'running', remaining: 84, progress: 35 }), W('appliance', 4, 4, { name: 'Laundry Room Washer', profile: 'washer', programme: 'Eco', state: 'running', remaining: 135, progress: 20 }), W('appliance', 4, 4, { name: 'Washing Machine', profile: 'washer', programme: 'Delicates', state: 'paused', remaining: 40, progress: 60 }), W('appliance', 4, 4, { name: 'Washing Machine', profile: 'washer', programme: 'Cotton 40°', state: 'finished', remaining: 0, progress: 100 }), W('appliance', 4, 4, { name: 'Washing Machine', profile: 'washer', state: 'idle', remaining: 0, progress: 0 }), W('appliance', 4, 4, { name: 'Washing Machine', profile: 'washer', programme: 'Cotton 40°', state: 'error' })]),
  ];
  const energy = [
    G('Energy Flow', [W('energy', 6, 5, { name: 'Energy Flow', variant: 'flow' }), W('energy', 4, 3, { name: 'Energy Flow', variant: 'compact' })]),
  ];
  const security = [
    G('Alarm', [W('alarm', 4, 4, { name: 'Home Alarm', state: 'disarmed' }), W('alarm', 4, 4, { name: 'Home Alarm', state: 'armed_away' }), W('alarm', 4, 4, { name: 'Home Alarm', state: 'triggered' }), W('alarm', 4, 3, { name: 'Home Alarm', state: 'pending' })]),
    G('Locks', [W('lock', 2, 4, { name: 'Front Door', state: 'locked' }), W('lock', 2, 4, { name: 'Back Door', state: 'unlocked' }), W('lock', 2, 4, { name: 'Garage', state: 'jammed' })]),
    G('Camera · doorbell', [W('camera', 4, 4, { name: 'Front Door', variant: 'picture', state: 'streaming' }), W('camera', 3, 4, { name: 'Doorbell', variant: 'doorbell' }), W('camera', 3, 3, { name: 'Garden', variant: 'picture' })]),
    G('Empty state', [W('entitylist', 4, 3, { name: 'Cameras', demoRows: [] })]),
  ];
  const media = [
    G('Media player', [W('media', 5, 4, { name: 'Living Room TV', variant: 'artwork' }), W('media', 4, 2, { name: 'Kitchen Speaker', variant: 'compact' }), W('media', 4, 2, { name: 'Office', variant: 'minibar', state: 'paused' }), W('media', 4, 4, { name: 'Bedroom', variant: 'artwork', state: 'idle' })]),
    G('Camera', [W('camera', 4, 4, { name: 'Front Door', variant: 'picture', state: 'streaming' }), W('camera', 4, 3, { name: 'Garden', variant: 'picture' })]),
  ];
  const time = [
    G('Sun & Moon · Date & Time · Timer · Calendar', [W('sunmoon', 4, 4, { name: 'Sun & Moon', variant: 'sky' }), W('sunmoon', 4, 3, { name: 'Sun & Moon', variant: 'times' }), W('datetime', 4, 3, { variant: 'digital' }), W('datetime', 3, 3, { variant: 'analogue' }), W('timer', 3, 4, { name: 'Kitchen Timer', state: 'active', duration: 900, remaining: 520, variant: 'ring' }), W('timer', 3, 2, { name: 'Tea', state: 'paused', variant: 'compact' }), W('calendar', 4, 5, {}), W('inbox', 1, 1, { name: 'Notifications' }), W('inbox', 3, 1, { name: 'Notifications', showLabel: true }), W('inbox', 4, 5, { name: 'Notifications', variant: 'list' }), W('presence', 5, 3, { name: "Who's home" }), W('presence', 4, 5, { name: 'Family', variant: 'list' }), W('spotlight', 4, 9, { name: 'Household' }), W('activitylog', 4, 7, { name: 'Activity', link: { label: 'Notifications' } }), W('devicetile', 2, 3, { name: 'Light' }), W('readings', 4, 3, { name: 'Readings' }), W('batteries', 4, 5, { name: 'Batteries' }), W('vehicle', 4, 6, { name: 'Vehicle' }), W('roomtile', 3, 5, { name: 'Living room' }), W('devicetile', 2, 3, { name: 'Heating', icon: 'mdi:fire', color: 'orange', state: 'off' })]),
    G('Home battery · Solar · Climate group · Humidifier', [W('homebattery', 4, 6, { name: 'Home battery', capacity: 10, reserve: 20 }), W('solar', 4, 6, { name: 'Solar', capacity: 6 }),
      W('climategroup', 4, 8, { name: 'Heating' }), W('humidifier', 4, 7, { name: 'Bedroom humidifier' })]),
    G('To-do · Updates · Countdown', [W('todo', 4, 8, { name: 'To-do' }), W('updates', 4, 6, { name: 'Updates' }), W('countdown', 4, 4, { name: 'Holiday' })]),
    G('People', [W('person', 3, 3, { name: 'Marcel', presence: 'home', variant: 'portrait' }), W('person', 3, 3, { name: 'Emma', presence: 'away', variant: 'portrait' }), W('person', 4, 2, { name: 'Marcel', presence: 'home', variant: 'row' }), W('person', 2, 2, { name: 'Emma', presence: 'away', variant: 'compact' })]),
    G('Content', [W('text', 4, 2, { primary: 'Living Room', secondary: 'Ground floor', variant: 'heading' }), W('text', 4, 2, { primary: 'Note', secondary: 'Plain text with a surface', variant: 'text', surface: true }), W('image', 4, 4, { name: 'Image' })]),
  ];
  const sizes = [
    G('Sensor · micro → large', [W('sensor', 2, 2, {}), W('sensor', 3, 3, {}), W('sensor', 4, 4, {}), W('sensor', 6, 5, {})]),
    G('Light · micro → large', [W('light', 2, 2, { variant: 'artwork' }), W('light', 3, 3, { variant: 'artwork' }), W('light', 4, 4, { variant: 'artwork' }), W('light', 6, 5, { variant: 'artwork' })]),
    G('Climate · micro → large', [W('climate', 2, 3, { variant: 'dial' }), W('climate', 3, 4, { variant: 'dial' }), W('climate', 4, 7, { variant: 'dial' }), W('climate', 6, 8, { variant: 'dial' })]),
    G('Appliance · micro → large', [W('appliance', 2, 2, { profile: 'washer', state: 'running', remaining: 84, progress: 35 }), W('appliance', 3, 3, { profile: 'washer', state: 'running', remaining: 84, progress: 35 }), W('appliance', 4, 4, { profile: 'washer', state: 'running', remaining: 84, progress: 35 }), W('appliance', 6, 5, { profile: 'washer', state: 'running', remaining: 84, progress: 35 })]),
    G('Robot · micro → large', [W('robot', 2, 2, { state: 'cleaning', demoBattery: 72 }), W('robot', 3, 3, { state: 'cleaning', demoBattery: 72 }), W('robot', 4, 4, { state: 'cleaning', demoBattery: 72 }), W('robot', 6, 5, { state: 'cleaning', demoBattery: 72 })]),
    G('Weather · micro → large', [W('weather', 2, 2, {}), W('weather', 3, 3, {}), W('weather', 4, 4, {}), W('weather', 6, 6, {})]),
    G('Alarm · micro → large', [W('alarm', 2, 2, { state: 'disarmed' }), W('alarm', 3, 3, { state: 'armed_away' }), W('alarm', 4, 4, { state: 'disarmed' }), W('alarm', 6, 5, { state: 'triggered' })]),
    G('Person · fan · switch · micro → large', [W('person', 2, 2, { name: 'Marcel', presence: 'home' }), W('person', 3, 3, { name: 'Marcel', presence: 'home' }), W('person', 4, 4, { name: 'Marcel', presence: 'home' }), W('person', 6, 6, { name: 'Marcel', presence: 'home' }), W('fan', 2, 2, { name: 'Fan', state: 'on' }), W('fan', 3, 3, { name: 'Fan', state: 'on', speed: 60 }), W('fan', 4, 4, { name: 'Fan', state: 'on', speed: 60 }), W('switch', 2, 2, { name: 'Terrace', state: 'on' }), W('switch', 3, 3, { name: 'Terrace', state: 'on' }), W('switch', 4, 4, { name: 'Terrace', state: 'on' })]),
    G('Cover · camera · lock · micro → large', [W('cover', 2, 2, { name: 'Living Room', variant: 'window', position: 50 }), W('cover', 3, 3, { name: 'Living Room', variant: 'window', position: 50 }), W('cover', 4, 4, { name: 'Living Room', variant: 'window', position: 50 }), W('camera', 2, 2, { name: 'Garden', variant: 'picture' }), W('camera', 3, 3, { name: 'Garden', variant: 'picture' }), W('camera', 5, 4, { name: 'Garden', variant: 'picture', state: 'streaming' }), W('lock', 2, 2, { name: 'Front Door', state: 'locked' }), W('lock', 3, 3, { name: 'Front Door', state: 'locked' }), W('lock', 4, 4, { name: 'Front Door', state: 'locked' })]),
    G('Timer · gauge · chart · sun & moon · calendar · micro → large', [W('timer', 2, 2, { name: 'Tea', state: 'active', duration: 900, remaining: 520 }), W('timer', 3, 3, { name: 'Tea', state: 'active', duration: 900, remaining: 520 }), W('gauge', 2, 2, { name: 'Living Room', value: 21.6 }), W('gauge', 4, 4, { name: 'Living Room', value: 21.6 }), W('chart', 3, 3, { name: 'Solar power', unit: 'W', kind: 'area' }), W('chart', 6, 5, { name: 'Consumption', unit: 'kWh', kind: 'bar' }), W('sunmoon', 3, 3, { name: 'Sun & Moon', variant: 'sky' }), W('sunmoon', 4, 4, { name: 'Sun & Moon', variant: 'sky' }), W('calendar', 3, 3, {}), W('calendar', 4, 5, {})]),
    G('Long names', [W('appliance', 3, 3, { name: 'Master Bedroom Washing Machine Pro', profile: 'washer', programme: 'Cotton Eco 40° Extra Rinse', state: 'running', remaining: 84, progress: 35 }), W('robot', 3, 3, { name: 'Upstairs Hallway Robot Vacuum Cleaner', profile: 'vacuum', state: 'cleaning', battery: 64 }), W('person', 3, 3, { name: 'Marcel Rymenhout-Van Der Heyden', presence: 'home' }), W('switch', 3, 3, { name: 'Kitchen Extractor Fan Over The Island', state: 'on' }), W('cover', 3, 3, { name: 'Living Room Panoramic Window Blind', variant: 'window', position: 50 }), W('lock', 3, 3, { name: 'Front Door Smart Deadbolt', state: 'locked' }), W('sensor', 3, 3, { name: 'Living Room Temperature Sensor', value: 21.6, unit: '°C', tone: 'normal' })]),
    G('Mower · micro → large', [W('robot', 2, 2, { profile: 'mower', state: 'mowing', demoBattery: 65 }), W('robot', 3, 3, { profile: 'mower', state: 'mowing', demoBattery: 65 }), W('robot', 4, 4, { profile: 'mower', state: 'mowing', demoBattery: 65 }), W('robot', 6, 6, { profile: 'mower', state: 'mowing', demoBattery: 65 })]),
    G('Energy Flow · media · lists', [W('energy', 2, 2, {}), W('energy', 3, 3, {}), W('energy', 5, 5, {}), W('media', 2, 2, { variant: 'compact' }), W('media', 4, 4, { variant: 'artwork' }), W('entitylist', 2, 3, {}), W('entitylist', 4, 5, {})]),
  ];
  const states = [
    G('Climate — what it is doing vs. what it is set to', [W('climate', 4, 7, { name: 'Heating', variant: 'dial', hvacMode: 'heat', hvacModes: ['off', 'heat', 'cool'], state: 'heating', targetTemperature: 21, currentTemperature: 20 }), W('climate', 4, 7, { name: 'Cooling', variant: 'dial', hvacMode: 'cool', hvacModes: ['off', 'heat', 'cool'], state: 'cooling', targetTemperature: 21, currentTemperature: 24 }), W('climate', 4, 7, { name: 'Idle', variant: 'dial', hvacMode: 'heat', hvacModes: ['off', 'heat', 'cool'], state: 'idle', targetTemperature: 21, currentTemperature: 21 }), W('climate', 4, 7, { name: 'Heat mode, no action reported', variant: 'dial', hvacMode: 'heat', hvacModes: ['off', 'heat', 'cool'], targetTemperature: 21, currentTemperature: 20 }), W('climate', 4, 7, { name: 'Off', variant: 'dial', hvacMode: 'off', hvacModes: ['off', 'heat', 'cool'], targetTemperature: 21, currentTemperature: 20 })]),
    G('Light · switch · fan', [W('light', 3, 4, { name: 'On', variant: 'artwork' }), W('light', 3, 4, { name: 'Off', variant: 'artwork', state: 'off' }), W('switch', 3, 4, { name: 'On', state: 'on' }), W('switch', 3, 4, { name: 'Off', state: 'off' }), W('fan', 4, 4, { name: 'Running', state: 'on', speed: 80 }), W('fan', 4, 4, { name: 'Off', state: 'off', speed: 0 })]),
    G('Cover · lock · alarm', [W('cover', 4, 3, { name: 'Open', state: 'open', position: 100 }), W('cover', 4, 3, { name: 'Closing', state: 'closing', position: 30 }), W('cover', 4, 3, { name: 'Closed', state: 'closed', position: 0 }), W('lock', 2, 4, { name: 'Locked', state: 'locked' }), W('lock', 2, 4, { name: 'Unlocked', state: 'unlocked' }), W('lock', 2, 4, { name: 'Jammed', state: 'jammed' }), W('alarm', 4, 4, { name: 'Disarmed', state: 'disarmed' }), W('alarm', 4, 4, { name: 'Armed', state: 'armed_home' }), W('alarm', 4, 4, { name: 'Triggered', state: 'triggered' })]),
    G('Appliance · robot', [W('appliance', 4, 4, { name: 'Running', profile: 'washer', state: 'running', remaining: 84, progress: 35 }), W('appliance', 4, 4, { name: 'Paused', profile: 'washer', state: 'paused', remaining: 40, progress: 60 }), W('appliance', 4, 4, { name: 'Finished', profile: 'washer', state: 'finished', progress: 100 }), W('appliance', 4, 4, { name: 'Idle', profile: 'washer', state: 'idle' }), W('appliance', 4, 4, { name: 'Error', profile: 'washer', state: 'error' }), W('robot', 4, 4, { name: 'Cleaning', state: 'cleaning', demoBattery: 72 }), W('robot', 4, 4, { name: 'Docked', state: 'docked', demoBattery: 100 }), W('robot', 4, 4, { name: 'Paused', state: 'paused', demoBattery: 50 }), W('robot', 4, 4, { name: 'Returning', state: 'returning', demoBattery: 20 }), W('robot', 4, 4, { name: 'Error', state: 'error', demoBattery: 8 })]),
    G('Sensor tones · timer · person · media', [W('sensor', 3, 3, { name: 'Normal', tone: 'normal', status: 'Comfortable' }), W('sensor', 3, 3, { name: 'Positive', tone: 'positive', status: 'Good' }), W('sensor', 3, 3, { name: 'Warning', tone: 'warning', status: 'High' }), W('sensor', 3, 3, { name: 'Critical', tone: 'critical', status: 'Too high' }), W('sensor', 3, 3, { name: 'Neutral', tone: 'neutral', status: 'Idle' }),
      W('timer', 3, 4, { name: 'Active', state: 'active', duration: 900, remaining: 520 }), W('timer', 3, 4, { name: 'Paused', state: 'paused', duration: 900, remaining: 520 }), W('timer', 3, 4, { name: 'Idle', state: 'idle', duration: 900, remaining: 900 }),
      W('person', 3, 3, { name: 'Home', presence: 'home' }), W('person', 3, 3, { name: 'Away', presence: 'away' }), W('person', 3, 3, { name: 'Unknown', presence: 'unknown' }), W('media', 4, 3, { name: 'Playing', state: 'playing' }), W('media', 4, 3, { name: 'Paused', state: 'paused' }), W('media', 4, 3, { name: 'Idle', state: 'idle' })]),
    G('Not linked to Home Assistant', [W('entitylist', 4, 3, { name: 'No entities', demoRows: [] })]),
  ];
  const climate = [
    G('Dial — heating · cooling · mode only · off', [
      W('climate', 4, 7, { name: 'Living Room', variant: 'dial', hvacMode: 'heat', hvacModes: ['off', 'heat', 'cool', 'auto'], state: 'heating', targetTemperature: 21, currentTemperature: 20, humidity: 48, presets: ['eco', 'comfort'], preset: 'comfort', capabilities: { preset: true } }),
      W('climate', 4, 7, { name: 'Bedroom', variant: 'dial', hvacMode: 'cool', hvacModes: ['off', 'heat', 'cool', 'auto'], state: 'cooling', targetTemperature: 21, currentTemperature: 24 }),
      W('climate', 4, 7, { name: 'Office (mode only)', variant: 'dial', hvacMode: 'heat', hvacModes: ['off', 'heat', 'cool', 'auto'], targetTemperature: 21, currentTemperature: 20.8 }),
      W('climate', 4, 7, { name: 'Hallway', variant: 'dial', hvacMode: 'off', hvacModes: ['off', 'heat', 'cool', 'auto'], targetTemperature: 19, currentTemperature: 18.4 })]),
    G('Horizontal · compact · minimal', [
      W('climate', 7, 4, { name: 'Living Room', variant: 'horizontal', hvacMode: 'heat', hvacModes: ['off', 'heat', 'cool', 'auto'], state: 'heating', targetTemperature: 21, currentTemperature: 20, humidity: 48 }),
      W('climate', 4, 3, { name: 'Bedroom', variant: 'compact', hvacMode: 'cool', hvacModes: ['off', 'heat', 'cool'], state: 'cooling', targetTemperature: 21, currentTemperature: 24 }),
      W('climate', 3, 3, { name: 'Hallway', variant: 'minimal', hvacMode: 'heat', state: 'heating', targetTemperature: 21, currentTemperature: 20 })]),
  ];
  const robots = [
    G('Robot vacuum', [W('robot', 4, 4, { name: 'Vacuum', profile: 'vacuum', state: 'cleaning', demoBattery: 72 }), W('robot', 4, 4, { name: 'Vacuum', profile: 'vacuum', state: 'docked', demoBattery: 100 }), W('robot', 4, 4, { name: 'Vacuum', profile: 'vacuum', state: 'paused', demoBattery: 54 }), W('robot', 4, 4, { name: 'Vacuum', profile: 'vacuum', state: 'returning', demoBattery: 22 }), W('robot', 4, 2, { name: 'Vacuum', profile: 'vacuum', variant: 'status', state: 'cleaning', demoBattery: 72 })]),
    G('Robot mower', [W('robot', 4, 4, { name: 'Mower', profile: 'mower', subtitle: 'Garden', state: 'mowing', demoBattery: 65 }), W('robot', 4, 4, { name: 'Mower', profile: 'mower', subtitle: 'Garden', state: 'docked', demoBattery: 90 }), W('robot', 4, 4, { name: 'Mower', profile: 'mower', subtitle: 'Garden', state: 'error', demoBattery: 15 }), W('robot', 4, 2, { name: 'Mower', profile: 'mower', subtitle: 'Garden', variant: 'compact', state: 'mowing', demoBattery: 65 })]),
  ];
  const environment = [
    G('Weather', [W('weather', 5, 4, {}), W('weather', 3, 3, { condition: 'rain' }), W('weather', 3, 3, { condition: 'clear-night' })]),
    G('Weather presets', [W('weather', 4, 3, { variant: 'current' }), W('weather', 4, 9, { variant: 'daily' }), W('weather', 6, 3, { variant: 'compact' }), W('weather', 4, 11, { variant: 'detailed' })]),
    G('Alarm presets', [W('alarm', 4, 12, { name: 'Home Alarm', state: 'disarmed', variant: 'keypad' }), W('alarm', 5, 2, { name: 'Home Alarm', state: 'armed_home', variant: 'compact' }),
      W('alarm', 3, 4, { name: 'Home Alarm', state: 'armed_away', variant: 'status' }), W('alarm', 5, 8, { name: 'Home Alarm', state: 'disarmed', variant: 'modern', modes: ['arm_home', 'arm_away', 'arm_night', 'arm_vacation'] })]),
    G('Sensors', [W('sensor', 3, 4, { name: 'Temperature', value: 21.4, status: 'Comfortable', variant: 'standard' }), W('sensor', 3, 4, { name: 'Humidity', icon: 'humidity', value: 58, unit: '%', precision: 0, status: 'Normal', variant: 'level' }), W('sensor', 3, 4, { name: 'Air Quality', icon: 'co2', value: 28, unit: 'AQI', status: 'Good', tone: 'positive', variant: 'status' }), W('sensor', 3, 4, { name: 'Power', icon: 'power', value: 1.8, unit: 'kW', status: 'Right now', variant: 'graph' }), W('sensor', 2, 3, { name: 'Battery', icon: 'battery', value: 82, unit: '%', precision: 0, variant: 'value', tone: 'positive' }), W('sensor', 2, 3, { name: 'Solar', icon: 'solar', value: 2.8, unit: 'kW', precision: 1 })]),
    G('Gauges · charts', [W('gauge', 3, 4, { name: 'Living Room', value: 21.6 }), W('gauge', 3, 4, { name: 'Solar', value: 152, unit: 'W', style: 'hbar' }), W('chart', 6, 5, { name: 'Solar power', unit: 'W', kind: 'area' }), W('chart', 6, 5, { name: 'Grid import', unit: 'kW', kind: 'line' }), W('chart', 6, 5, { name: 'Consumption', unit: 'kWh', kind: 'bar' })]),
  ];
  let n = 0;
  function build(groups, pageId) {
    const items = [];
    const place = (cols, key) => {
      let y = 1;
      groups.forEach((g, gi) => {
        // the label, then the widgets on shelves
        if (g.label) { if (key === 'desktop' || key === 'tablet') items.find((i) => i.id === `${pageId}-l${gi}`).layout[key] = { x: 1, y, w: cols, h: 1 }; y += 1; }
        let x = 1, rowH = 0;
        g.items.forEach((it, wi) => {
          const w = Math.min(it.w, cols);
          if (x + w - 1 > cols) { y += rowH; x = 1; rowH = 0; }
          items.find((i) => i.id === `${pageId}-${gi}-${wi}`).layout[key] = { x, y, w, h: it.h };
          x += w; rowH = Math.max(rowH, it.h);
        });
        y += rowH;
      });
    };
    groups.forEach((g, gi) => {
      if (g.label) items.push({ id: `${pageId}-l${gi}`, type: 'text', parent: null, config: { primary: g.label, secondary: '', variant: 'heading', align: 'left', size: 's', emphasis: 'strong', surface: false }, layout: { mobile: { w: 4, h: 1 } } });
      g.items.forEach((it, wi) => { n++; items.push({ id: `${pageId}-${gi}-${wi}`, type: it.type, parent: null, config: { ...it.config }, layout: { mobile: { w: Math.min(it.w, 4), h: it.h } } }); });
    });
    place(12, 'desktop'); place(8, 'tablet');
    return items;
  }
  (window.IniqDashboards = window.IniqDashboards || {}).showcase = {
    version: 3,
    app: { id: 'widget-library', startPage: 'overview', navigation: { desktop: 'left', tablet: 'left', mobile: 'bottom' } },
    pages: [
      { id: 'overview', name: 'Overview', icon: 'home', nav: true, items: build(overview, 'ov') },
      { id: 'controls', name: 'Controls', icon: 'bulb', nav: true, items: build(controls, 'ct') },
      { id: 'climate', name: 'Climate', icon: 'thermo', nav: true, items: build(climate, 'cl') },
      { id: 'appliances', name: 'Appliances', icon: 'pot', nav: true, items: build(appliances, 'ap') },
      { id: 'robots', name: 'Robots', icon: 'garage', nav: true, items: build(robots, 'rb') },
      { id: 'energy', name: 'Energy', icon: 'bolt', nav: true, items: build(energy, 'en') },
      { id: 'security', name: 'Security', icon: 'shield', nav: true, items: build(security, 'sc') },
      { id: 'media', name: 'Media', icon: 'music', nav: true, items: build(media, 'md') },
      { id: 'environment', name: 'Environment', icon: 'drop', nav: true, items: build(environment, 'ev') },
      { id: 'time', name: 'Time', icon: 'sun', nav: true, items: build(time, 'tm') },
      { id: 'sizes', name: 'Sizes', icon: 'chart', nav: true, items: build(sizes, 'sz') },
      { id: 'states', name: 'States', icon: 'info', nav: true, items: build(states, 'st') },
    ],
    popups: [], notifications: { templates: [], rules: [] },
  };
})();
