/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// A REALISTIC (fictional) Home Assistant installation for the generator tests — the shape of a real home, not a tidy demo:
//   18 areas, French and English names, accents, one very long name; appliances that expose dozens of entities (a pellet stove, a solar
//   inverter that sits in the dining room, smart plugs, a speaker, a robot vacuum whose maps are camera entities); light groups next to
//   their members; unavailable devices (a disconnected stove, garden lights); a freezer temperature; unassigned entities; calendars.
//   Every entity carries what discovery reports: registry data (device, category, hidden, integration) on most of them — some technical
//   entities are deliberately left WITHOUT a category, as integrations often do, so the name / class rules are exercised too.
// Run: node tests/fixtures/make-realistic-home.mjs  →  tests/fixtures/ha-realistic-home.json (deterministic)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AREAS = [['salon', 'Salon'], ['salle_a_manger', 'Salle à manger'], ['cuisine', 'Cuisine'], ['master_bedroom', 'Master bedroom'],
  ['chambre_enfant', "Chambre d'enfant"], ['bureau', 'Bureau'], ['salle_de_bain', 'Salle de bain'], ['toilettes', 'Toilettes'], ['entree', 'Entrée'],
  ['garage', 'Garage'], ['buanderie', 'Buanderie'], ['cave', 'Cave'], ['grenier', 'Grenier'], ['jardin', 'Jardin'], ['terrasse_piscine', 'Terrasse piscine'],
  ['home_office_up', 'Home office upstairs above the garage'], ['abri_jardin', 'Abri de jardin'], ['utility', 'Utility room']];
const E = [];
const devices = {};
let dn = 0;
/** add(id, state, { name, unit, dc, sc, area, dev, cat, hidden, pl, members, service }) */
const add = (id, state, o = {}) => E.push({ id, domain: id.split('.')[0], name: o.name || id, state: String(state), unit: o.unit || null, dc: o.dc || null,
  area: o.area ? AREAS.find((a) => a[0] === o.area)[1] : null, areaId: o.area || null,
  ...(o.sc ? { sc: o.sc } : {}), ...(o.members ? { members: o.members } : {}), reg: true,
  ...(o.dev ? { device: o.dev, deviceName: devices[o.dev].name, ...(devices[o.dev].service ? { service: true } : {}) } : {}),
  ...(o.cat ? { cat: o.cat } : {}), ...(o.hidden ? { hidden: true } : {}), ...(o.pl ? { platform: o.pl } : {}) });
const dev = (name, extra = {}) => { const id = `dev${String(++dn).padStart(3, '0')}`; devices[id] = { name, ...extra }; return id; };

// ---- a multisensor in most rooms: temperature, humidity, illuminance, battery + technical extras (some without category)
const temps = { salon: 21.4, salle_a_manger: 20.6, cuisine: 22.1, master_bedroom: 19.2, chambre_enfant: 20.1, bureau: 21.8, salle_de_bain: 23.4, entree: 18.9, grenier: 15.2, buanderie: 17.6 };
Object.entries(temps).forEach(([a, t], i) => {
  const d = dev(`Multisensor ${a}`);
  add(`sensor.${a}_temperature`, t, { name: `${AREAS.find((x) => x[0] === a)[1]} température`, unit: '°C', dc: 'temperature', sc: 'measurement', area: a, dev: d, pl: 'zha' });
  add(`sensor.${a}_humidity`, 45 + i * 2, { name: `${AREAS.find((x) => x[0] === a)[1]} humidité`, unit: '%', dc: 'humidity', sc: 'measurement', area: a, dev: d, pl: 'zha' });
  if (i % 2 === 0) add(`sensor.${a}_illuminance`, 120 + i * 10, { name: `${AREAS.find((x) => x[0] === a)[1]} luminosité`, unit: 'lx', dc: 'illuminance', sc: 'measurement', area: a, dev: d, pl: 'zha' });
  add(`sensor.${a}_multisensor_battery`, 80 - i * 6, { name: 'Multisensor battery', unit: '%', dc: 'battery', sc: 'measurement', area: a, dev: d, pl: 'zha', cat: 'diagnostic' });
  add(`sensor.${a}_multisensor_rssi`, -60 - i, { name: 'Multisensor RSSI', unit: 'dBm', dc: 'signal_strength', area: a, dev: d, pl: 'zha', cat: i % 3 ? 'diagnostic' : undefined });
  add(`sensor.${a}_multisensor_lqi`, 120, { name: 'Multisensor LQI', area: a, dev: d, pl: 'zha' });                  // no category, no class: the name rule
  add(`update.${a}_multisensor_firmware`, 'off', { name: 'Multisensor firmware', area: a, dev: d, pl: 'zha', cat: 'config' });
});

// ---- lights: rooms with several lights, one light group per big room (its members are lights too), unavailable garden lights
const L = (a, key, name, st = 'off') => { const d = dev(name); add(`light.${key}`, st, { name, area: a, dev: d, pl: 'hue' }); add(`sensor.${key}_zigbee_signal`, -70, { name: `${name} signal`, unit: 'dBm', area: a, dev: d, pl: 'hue' }); return `light.${key}`; };
const salon = [L('salon', 'salon_plafonnier', 'Plafonnier', 'on'), L('salon', 'salon_lampadaire', 'Lampadaire', 'on'), L('salon', 'salon_led_strip', 'LED strip TV')];
add('light.salon_toutes', 'on', { name: 'Salon toutes les lumières', area: 'salon', members: salon, pl: 'group' });
const sam = [L('salle_a_manger', 'sam_suspension', 'Suspension', 'on'), L('salle_a_manger', 'sam_appliques', 'Appliques')];
add('light.salle_a_manger_groupe', 'on', { name: 'Salle à manger', area: 'salle_a_manger', members: sam, pl: 'group' });
L('cuisine', 'cuisine_spots', 'Spots cuisine', 'on'); L('cuisine', 'cuisine_comptoir', 'Comptoir'); L('cuisine', 'cuisine_sous_meuble', 'Sous-meuble');
L('master_bedroom', 'mb_ceiling', 'Ceiling light'); L('master_bedroom', 'mb_bedside_l', 'Bedside left'); L('master_bedroom', 'mb_bedside_r', 'Bedside right');
L('chambre_enfant', 'enfant_veilleuse', 'Veilleuse', 'on'); L('chambre_enfant', 'enfant_plafonnier', 'Plafonnier');
L('bureau', 'bureau_lampe', 'Lampe de bureau'); L('salle_de_bain', 'sdb_miroir', 'Miroir'); L('salle_de_bain', 'sdb_plafond', 'Plafond');
L('entree', 'entree_plafonnier', 'Plafonnier entrée'); L('garage', 'garage_neon', 'Néon garage'); L('home_office_up', 'office_up_desk', 'Desk lamp with an unusually long descriptive name for testing');
['spot_1', 'spot_2', 'guirlande'].forEach((k, i) => { const d = dev(`Garden ${k}`); add(`light.jardin_${k}`, 'unavailable', { name: ['Spot jardin 1', 'Spot jardin 2', 'Guirlande'][i], area: 'jardin', dev: d, pl: 'tuya' }); });
L('terrasse_piscine', 'piscine_spot', 'Spot piscine');

// ---- the PELLET STOVE in the dining room: one climate + 24 entities, currently disconnected (cloud lost)
{ const d = dev('Poêle salle à manger', { model: 'Pellet stove' }); const a = 'salle_a_manger', pl = 'pellet_cloud';
  add('climate.poele_a_pellets', 'unavailable', { name: 'Poêle salle à manger', area: a, dev: d, pl });
  ['exhaust_temperature', 'room_temperature_probe', 'smoke_temperature', 'board_temperature'].forEach((k) => add(`sensor.poele_${k}`, 'unavailable', { name: `Poêle ${k.replace(/_/g, ' ')}`, unit: '°C', dc: 'temperature', sc: 'measurement', area: a, dev: d, pl }));
  add('sensor.poele_status', 'unavailable', { name: 'Poêle état', dc: 'enum', area: a, dev: d, pl });
  add('sensor.poele_pellet_level', 'unavailable', { name: 'Poêle niveau pellets', unit: '%', area: a, dev: d, pl });
  add('sensor.poele_ignition_count', 'unavailable', { name: 'Poêle allumages', sc: 'total_increasing', area: a, dev: d, pl, cat: 'diagnostic' });
  add('sensor.poele_firmware_version', 'unavailable', { name: 'Poêle version', area: a, dev: d, pl, cat: 'diagnostic' });
  add('sensor.poele_wifi_signal', 'unavailable', { name: 'Poêle signal Wi-Fi', unit: '%', area: a, dev: d, pl });
  add('binary_sensor.poele_cloud_connection', 'off', { name: 'Poêle connexion cloud', dc: 'connectivity', area: a, dev: d, pl, cat: 'diagnostic' });
  add('binary_sensor.poele_alarm', 'unavailable', { name: 'Poêle alarme', dc: 'problem', area: a, dev: d, pl });
  ['power_level', 'fan_speed', 'mode'].forEach((k) => add(`select.poele_${k}`, 'unavailable', { name: `Poêle ${k.replace(/_/g, ' ')}`, area: a, dev: d, pl, cat: 'config' }));
  ['target_eco', 'target_comfort'].forEach((k) => add(`number.poele_${k}`, 'unavailable', { name: `Poêle ${k.replace(/_/g, ' ')}`, unit: '°C', area: a, dev: d, pl }));
  ['silent_mode', 'chrono', 'eco_mode'].forEach((k) => add(`switch.poele_${k}`, 'unavailable', { name: `Poêle ${k.replace(/_/g, ' ')}`, area: a, dev: d, pl }));
  add('button.poele_reset_alarm', 'unknown', { name: 'Poêle reset alarme', area: a, dev: d, pl });
  add('button.poele_restart', 'unknown', { name: 'Poêle restart', area: a, dev: d, pl, cat: 'config' });
  add('sensor.poele_last_update', '2026-11-13T07:10:00+00:00', { name: 'Poêle dernière mise à jour', dc: 'timestamp', area: a, dev: d, pl });
  add('sensor.poele_runtime', 'unavailable', { name: 'Poêle temps de fonctionnement', unit: 'h', dc: 'duration', area: a, dev: d, pl });
}
// ---- the SOLAR INVERTER, also assigned to the dining room (where it hangs on the wall): ~30 technical entities
{ const d = dev('Onduleur solaire', { model: 'Inverter' }); const a = 'salle_a_manger', pl = 'inverter_modbus';
  add('sensor.inverter_ac_power', 2450, { name: 'Onduleur puissance AC', unit: 'W', dc: 'power', sc: 'measurement', area: a, dev: d, pl });
  add('sensor.inverter_energy_total', 18627, { name: 'Onduleur énergie totale', unit: 'kWh', dc: 'energy', sc: 'total_increasing', area: a, dev: d, pl });
  ['dc_voltage_1', 'dc_voltage_2', 'ac_voltage_l1', 'ac_voltage_l2', 'ac_voltage_l3'].forEach((k) => add(`sensor.inverter_${k}`, 238, { name: `Onduleur ${k.replace(/_/g, ' ')}`, unit: 'V', dc: 'voltage', sc: 'measurement', area: a, dev: d, pl }));
  ['dc_current_1', 'dc_current_2', 'ac_current'].forEach((k) => add(`sensor.inverter_${k}`, 5.1, { name: `Onduleur ${k.replace(/_/g, ' ')}`, unit: 'A', dc: 'current', sc: 'measurement', area: a, dev: d, pl }));
  ['heatsink_temperature', 'internal_temperature'].forEach((k) => add(`sensor.inverter_${k}`, 41, { name: `Onduleur ${k.replace(/_/g, ' ')}`, unit: '°C', dc: 'temperature', sc: 'measurement', area: a, dev: d, pl }));
  add('sensor.inverter_frequency', 50.01, { name: 'Onduleur fréquence', unit: 'Hz', dc: 'frequency', sc: 'measurement', area: a, dev: d, pl });
  add('sensor.inverter_status', 'MPPT', { name: 'Onduleur état', dc: 'enum', area: a, dev: d, pl });
  add('sensor.inverter_status_code', 4, { name: 'Onduleur status code', area: a, dev: d, pl, cat: 'diagnostic' });
  add('sensor.inverter_error_code', 0, { name: 'Onduleur error code', area: a, dev: d, pl });
  ['active_power_limit', 'reactive_power', 'power_factor_setpoint'].forEach((k) => add(`number.inverter_${k}`, 100, { name: `Onduleur ${k.replace(/_/g, ' ')}`, area: a, dev: d, pl, cat: 'config' }));
  add('switch.inverter_export_limit', 'off', { name: 'Onduleur export limit', area: a, dev: d, pl, cat: 'config' });
  add('sensor.inverter_firmware', '4.12', { name: 'Onduleur firmware', area: a, dev: d, pl, cat: 'diagnostic' });
  add('sensor.inverter_ip_address', '192.0.2.40', { name: 'Onduleur IP address', area: a, dev: d, pl });
  add('binary_sensor.inverter_connected', 'on', { name: 'Onduleur connected', dc: 'connectivity', area: a, dev: d, pl });
}
// ---- the cloud integration of a speaker brand + the dining-room speaker (bass / treble / loudness …)
{ const d = dev('Enceinte salle à manger'); const a = 'salle_a_manger', pl = 'speaker';
  add('media_player.enceinte_sam', 'idle', { name: 'Enceinte salle à manger', area: a, dev: d, pl });
  ['bass', 'treble'].forEach((k) => add(`number.enceinte_sam_${k}`, 0, { name: `Enceinte salle à manger ${k}`, area: a, dev: d, pl, cat: 'config' }));
  ['loudness', 'crossfade', 'night_sound'].forEach((k) => add(`switch.enceinte_sam_${k}`, 'off', { name: `Enceinte salle à manger ${k.replace(/_/g, ' ')}`, area: a, dev: d, pl, cat: 'config' }));
  add('sensor.enceinte_sam_audio_input_format', 'unknown', { name: 'Enceinte salle à manger audio input format', area: a, dev: d, pl, cat: 'diagnostic' });
}
{ const d = dev('Kitchen speaker'); add('media_player.kitchen_speaker', 'playing', { name: 'Kitchen speaker', area: 'cuisine', dev: d, pl: 'speaker' }); }
{ const d = dev('TV salon'); add('media_player.tv_salon', 'off', { name: 'TV salon', area: 'salon', dev: d, pl: 'tv' }); add('remote.tv_salon', 'off', { name: 'TV salon remote', area: 'salon', dev: d, pl: 'tv' }); }
{ const d = dev('Old speaker'); add('media_player.old_speaker', 'unavailable', { name: 'Old speaker', area: 'grenier', dev: d, pl: 'speaker' }); }
// a duplicate media player exposed by a second integration (DLNA) for the kitchen speaker: hidden by the user
add('media_player.kitchen_speaker_dlna', 'idle', { name: 'Kitchen speaker (DLNA)', area: 'cuisine', hidden: true, pl: 'dlna_dmr' });

// ---- thermostats (several), a heat pump, a humidifier, fans
[['salon', 'Thermostat salon', 'heat', 20], ['master_bedroom', 'Thermostat chambre', 'heat', 19], ['chambre_enfant', 'Thermostat enfant', 'off', 18], ['bureau', 'Thermostat bureau', 'heat', 21], ['salle_de_bain', 'Sèche-serviettes', 'heat', 23]]
  .forEach(([a, n, st], i) => { const d = dev(n); add(`climate.${a}_thermostat`, st, { name: n, area: a, dev: d, pl: 'tado' }); add(`sensor.${a}_thermostat_battery`, 'ok', { name: `${n} batterie`, area: a, dev: d, pl: 'tado', cat: 'diagnostic' }); add(`binary_sensor.${a}_thermostat_window_open`, 'off', { name: `${n} fenêtre ouverte`, dc: 'window', area: a, dev: d, pl: 'tado' }); add(`switch.${a}_thermostat_child_lock`, 'off', { name: `${n} child lock`, area: a, dev: d, pl: 'tado' }); add(`sensor.${a}_thermostat_heating`, 30 + i, { name: `${n} heating`, unit: '%', sc: 'measurement', area: a, dev: d, pl: 'tado' }); });
{ const d = dev('Extracteur'); add('fan.extracteur_sdb', 'off', { name: 'Extracteur', area: 'salle_de_bain', dev: d, pl: 'shelly' }); }
{ const d = dev('Humidificateur'); add('humidifier.humidificateur_enfant', 'on', { name: 'Humidificateur', area: 'chambre_enfant', dev: d, pl: 'xiaomi' }); }
{ const d = dev('Ventilateur bureau'); add('fan.ventilateur_bureau', 'unavailable', { name: 'Ventilateur bureau', area: 'bureau', dev: d, pl: 'xiaomi' }); }

// ---- smart plugs: switch + power + energy + voltage + current + LED + child lock + overheat
[['cuisine', 'plug_cafe', 'Machine à café'], ['buanderie', 'plug_lave_linge', 'Lave-linge'], ['buanderie', 'plug_seche_linge', 'Sèche-linge'], ['bureau', 'plug_pc', 'PC bureau'], ['salon', 'plug_tv', 'Meuble TV'], ['garage', 'plug_congelateur', 'Congélateur']]
  .forEach(([a, k, n], i) => { const d = dev(n); const pl = 'shelly';
    add(`switch.${k}`, i % 2 ? 'on' : 'off', { name: n, area: a, dev: d, pl });
    add(`sensor.${k}_power`, i % 2 ? 120 + i * 30 : 0, { name: `${n} puissance`, unit: 'W', dc: 'power', sc: 'measurement', area: a, dev: d, pl });
    add(`sensor.${k}_energy`, 120 + i, { name: `${n} énergie`, unit: 'kWh', dc: 'energy', sc: 'total_increasing', area: a, dev: d, pl });
    add(`sensor.${k}_voltage`, 231, { name: `${n} tension`, unit: 'V', dc: 'voltage', sc: 'measurement', area: a, dev: d, pl, cat: i % 2 ? 'diagnostic' : undefined });
    add(`sensor.${k}_current`, 0.4, { name: `${n} courant`, unit: 'A', dc: 'current', sc: 'measurement', area: a, dev: d, pl, cat: 'diagnostic' });
    add(`switch.${k}_led`, 'on', { name: `${n} LED`, area: a, dev: d, pl });
    add(`switch.${k}_child_lock`, 'off', { name: `${n} child lock`, area: a, dev: d, pl, cat: 'config' });
    add(`binary_sensor.${k}_overheating`, 'off', { name: `${n} overheating`, dc: 'problem', area: a, dev: d, pl, cat: 'diagnostic' });
    add(`button.${k}_identify`, 'unknown', { name: `${n} identify`, area: a, dev: d, pl, cat: 'diagnostic' }); });
// the freezer's own temperature probe (garage) — NOT a room temperature
{ const d = dev('Sonde congélateur'); add('sensor.congelateur_temperature', -18.4, { name: 'Congélateur température', unit: '°C', dc: 'temperature', sc: 'measurement', area: 'garage', dev: d, pl: 'zha' }); }
add('sensor.cave_temperature', 12.4, { name: 'Cave température', unit: '°C', dc: 'temperature', sc: 'measurement', area: 'cave', pl: 'zha' });

// ---- security: doors, windows, motion, leak, smoke, an alarm panel, locks, cameras — and the robot vacuum's MAPS (camera / image entities)
[['entree', 'porte_entree', 'Porte d\'entrée', 'door', 'off'], ['salon', 'fenetre_salon', 'Fenêtre salon', 'window', 'on'], ['master_bedroom', 'fenetre_chambre', 'Fenêtre chambre', 'window', 'off'],
  ['garage', 'porte_garage', 'Porte garage', 'garage_door', 'off'], ['salle_a_manger', 'mouvement_sam', 'Mouvement salle à manger', 'motion', 'on'], ['entree', 'mouvement_entree', 'Mouvement entrée', 'motion', 'off'],
  ['buanderie', 'fuite_buanderie', 'Fuite d\'eau buanderie', 'moisture', 'off'], ['cuisine', 'fumee_cuisine', 'Détecteur de fumée cuisine', 'smoke', 'off'], ['cave', 'fuite_cave', 'Fuite cave', 'moisture', 'unavailable'],
  ['salle_a_manger', 'presence_sam', 'Présence salle à manger', 'occupancy', 'on']]
  .forEach(([a, k, n, dc, st]) => { const d = dev(n); add(`binary_sensor.${k}`, st, { name: n, dc, area: a, dev: d, pl: 'zha' }); add(`sensor.${k}_battery`, 64, { name: `${n} batterie`, unit: '%', dc: 'battery', sc: 'measurement', area: a, dev: d, pl: 'zha', cat: 'diagnostic' }); add(`binary_sensor.${k}_tamper`, 'off', { name: `${n} sabotage`, dc: 'tamper', area: a, dev: d, pl: 'zha', cat: 'diagnostic' }); });
add('alarm_control_panel.maison', 'disarmed', { name: 'Alarme maison', area: 'entree', pl: 'alarmo' });
{ const d = dev('Serrure entrée'); add('lock.porte_entree', 'locked', { name: 'Serrure entrée', area: 'entree', dev: d, pl: 'nuki' }); add('sensor.serrure_battery', 71, { name: 'Serrure batterie', unit: '%', dc: 'battery', area: 'entree', dev: d, pl: 'nuki', cat: 'diagnostic' }); }
{ const d = dev('Caméra jardin'); add('camera.jardin', 'idle', { name: 'Caméra jardin', area: 'jardin', dev: d, pl: 'onvif' }); add('binary_sensor.camera_jardin_motion', 'off', { name: 'Caméra jardin mouvement', dc: 'motion', area: 'jardin', dev: d, pl: 'onvif' }); }
{ const d = dev('Sonnette'); add('camera.sonnette', 'idle', { name: 'Sonnette', area: 'entree', dev: d, pl: 'doorbell' }); }
{ const d = dev('Robot aspirateur'); const pl = 'robot';
  add('vacuum.robot', 'docked', { name: 'Robot aspirateur', area: 'salon', dev: d, pl });
  add('camera.robot_current_map', 'idle', { name: 'Current Map', area: 'salon', dev: d, pl });
  add('camera.robot_saved_map_1', 'idle', { name: 'My Saved Map 1', area: 'salon', dev: d, pl });
  add('image.robot_map', '2026-11-13T07:00:00+00:00', { name: 'Robot map', area: 'salon', dev: d, pl });
  add('sensor.robot_battery', 100, { name: 'Robot batterie', unit: '%', dc: 'battery', area: 'salon', dev: d, pl });
  add('sensor.robot_filter_left', 80, { name: 'Robot filtre restant', unit: 'h', dc: 'duration', area: 'salon', dev: d, pl, cat: 'diagnostic' });
  add('select.robot_fan_speed', 'standard', { name: 'Robot puissance', area: 'salon', dev: d, pl }); }

// ---- energy (house level, unassigned): grid signed (+ import), solar, house, battery, gas, water
add('sensor.grid_power', 352, { name: 'Réseau puissance', unit: 'W', dc: 'power', sc: 'measurement', pl: 'p1_meter' });
add('sensor.solar_power', 2450, { name: 'Solaire puissance', unit: 'W', dc: 'power', sc: 'measurement', pl: 'inverter_modbus' });
add('sensor.house_consumption', 2802, { name: 'Consommation maison', unit: 'W', dc: 'power', sc: 'measurement', pl: 'template' });
add('sensor.grid_import_energy', 2.62, { name: 'Réseau énergie importée', unit: 'kWh', dc: 'energy', sc: 'total_increasing', pl: 'p1_meter' });
add('sensor.grid_export_energy', 0, { name: 'Réseau énergie exportée', unit: 'kWh', dc: 'energy', sc: 'total_increasing', pl: 'p1_meter' });
add('sensor.gas_consumption', 0, { name: 'Gaz', unit: 'm³', dc: 'gas', sc: 'total_increasing', pl: 'p1_meter' });
add('sensor.water_consumption', 29609.1, { name: 'Eau compteur', unit: 'L', dc: 'water', sc: 'total_increasing', pl: 'water_meter' });
add('sensor.p1_meter_wifi_ssid', 'home', { name: 'P1 meter Wi-Fi SSID', pl: 'p1_meter', cat: 'diagnostic' });

// ---- house-level things: people, weather, sun, calendars, scenes, a cloud service, updates, unassigned odds and ends
['Alex', 'Sam', 'Robin', 'Charlie'].forEach((n, i) => add(`person.${n.toLowerCase()}`, i < 2 ? 'home' : 'not_home', { name: n }));
{ const d = dev('Forecast', { service: true }); add('weather.home', 'cloudy', { name: 'Forecast', dev: d, pl: 'met' }); }
add('sun.sun', 'above_horizon', { name: 'Sun', pl: 'sun' });
add('calendar.famille', 'off', { name: 'Famille', pl: 'caldav' }); add('calendar.dechets', 'on', { name: 'Collecte déchets', pl: 'waste' });
['evening', 'dinner', 'good_night', 'away'].forEach((k) => add(`scene.${k}`, 'unknown', { name: { evening: 'Soirée', dinner: 'Dîner', good_night: 'Bonne nuit', away: 'Absent' }[k] }));
{ const d = dev('Speaker cloud', { service: true }); add('sensor.speaker_cloud_status', 'connected', { name: 'Speaker cloud status', area: 'salle_a_manger', dev: d, pl: 'speaker' }); add('binary_sensor.speaker_cloud_connected', 'on', { name: 'Speaker cloud connected', dc: 'connectivity', area: 'salle_a_manger', dev: d, pl: 'speaker' }); }
['core', 'supervisor', 'os', 'zha_firmware', 'hacs'].forEach((k) => add(`update.${k}`, 'off', { name: `Update ${k}` }));
add('sensor.processor_use', 7, { name: 'Processor use', unit: '%', sc: 'measurement', pl: 'systemmonitor' });
add('sensor.memory_use_percent', 41, { name: 'Memory use (percent)', unit: '%', sc: 'measurement', pl: 'systemmonitor' });
add('input_boolean.mode_vacances', 'off', { name: 'Mode vacances' });
add('switch.arrosage', 'off', { name: 'Arrosage', pl: 'gardena' });
add('sensor.outdoor_temperature', 3.3, { name: 'Température extérieure', unit: '°C', dc: 'temperature', sc: 'measurement', area: 'jardin', pl: 'zha' });
add('cover.volet_salon', 'open', { name: 'Volet salon', area: 'salon', pl: 'somfy' });
add('cover.porte_garage_motor', 'closed', { name: 'Porte de garage', dc: 'garage', area: 'garage', pl: 'myq' });

const out = { ok: true, configured: true, connected: true, error: null, entities: E.sort((a, b) => a.id.localeCompare(b.id)),
  areas: AREAS.map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)) };
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ha-realistic-home.json');
fs.writeFileSync(dest, `${JSON.stringify(out, null, 1)}\n`);
console.log(`${E.length} entities, ${AREAS.length} areas, ${dn} devices → ${path.relative(process.cwd(), dest)}`);
