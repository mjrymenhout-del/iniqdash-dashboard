<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * The SIMULATED HOME: a fictional household (synthetic names and entity ids, no real home) in Home Assistant's own REST format,
 * used by SimHaClient when a dashboard is marked simulated (app.simulated). Values are chosen to be consistent with each other:
 *
 *   power now     solar 2 380 W  =  house 480 W  +  grid export 1 900 W            (no battery: none is installed in this home)
 *   energy today  house 6.64 kWh =  solar 10.90  +  import 3.04 (T1 1.03 + T2 2.01)  −  export 7.30 (T1 1.30 + T2 6.00)
 *   costs today   import 3.04 × €0.181 = €0.55 · export 7.30 × €0.050 = €0.37 · net €0.18
 *                 solar used at home 10.90 − 7.30 = 3.60 kWh (33 %) · self-sufficiency 1 − 3.04 / 6.64 = 54 % · savings 3.60 × €0.181 = €0.65
 *
 * Every entity: [id, state, attributes, area, seconds since its last change]. Areas: [id, name].
 */
final class SimHome
{
    public const TZ = 'Europe/Paris';
    public const PRICE_IMPORT = 0.181;
    public const PRICE_EXPORT = 0.050;
    public const PRICE_GAS = 0.050;

    public const AREAS = [
        ['dining_room', 'Salle à manger'], ['living_room', 'Salon'], ['kitchen', 'Cuisine'], ['bathroom', 'Salle de bain'],
        ['bedroom', 'Chambre'], ['kids_room', 'Kids room'], ['study', 'Study'], ['garden', 'Jardin'], ['terrace', 'Terrasse piscine'],
        ['cellar', 'Cave'], ['roof', 'Roof'], ['outside', 'Outside'],
        // the INIQDASH DEMO home (assets/demo/iniqdash-demo.json): its own rooms, so its counts never mix with the Maison home's
        ['demo_living', 'Living room'], ['demo_kitchen', 'Kitchen'], ['demo_bedroom', 'Bedroom'], ['demo_bathroom', 'Bathroom'],
        ['demo_office', 'Office'], ['demo_garden', 'Garden'], ['demo_hall', 'Hallway'],
    ];

    /** the lights of the house (on / off, brightness 0–255), the colour light has a white range and colours */
    private static function lights(): array
    {
        $plain = ['supported_color_modes' => ['onoff'], 'color_mode' => null, 'supported_features' => 0];
        $dim = ['supported_color_modes' => ['brightness'], 'color_mode' => null, 'supported_features' => 0, 'brightness' => null];
        $color = ['supported_color_modes' => ['color_temp', 'hs'], 'color_mode' => null, 'supported_features' => 4, 'brightness' => null,
            'min_color_temp_kelvin' => 2200, 'max_color_temp_kelvin' => 6500, 'color_temp_kelvin' => null, 'hs_color' => null,
            'effect_list' => ['Colorloop', 'Candle'], 'effect' => null];
        $u = [];
        return [
            ['light.dining_ceiling', 'off', ['friendly_name' => 'Plafonnier'] + $dim, 'dining_room', 3720],
            ['light.living_ceiling', 'off', ['friendly_name' => 'Plafonnier salon'] + $dim, 'living_room', 5400],
            ['light.kitchen', 'off', ['friendly_name' => 'Cuisine'] + $dim, 'kitchen', 4100],
            ['light.kitchen_island', 'off', ['friendly_name' => 'Îlot'] + $dim, 'kitchen', 4100],
            ['light.kitchen_led', 'off', ['friendly_name' => 'LED cuisine'] + $color, 'kitchen', 8200],
            ['light.bathroom', 'off', ['friendly_name' => 'Lumière'] + $plain, 'bathroom', 2600],
            ['light.bedroom', 'off', ['friendly_name' => 'Chambre'] + $dim, 'bedroom', 30000],
            ['light.pool_spot', 'off', ['friendly_name' => 'Spot piscine'] + $plain, 'terrace', 52000],
            ['light.garden_spot', 'off', ['friendly_name' => 'Spot jardin'] + $plain, 'garden', 52000],
            ['light.parking', 'off', ['friendly_name' => 'Parking'] + $plain, 'garden', 52000],
            ['light.hallway', 'off', ['friendly_name' => 'Couloir'] + $plain, null, 9000],
            // the lounge (the Studio showcase dashboards): lights that are on
            ['light.lounge_led', 'on', ['friendly_name' => 'Lounge LED', 'color_mode' => 'hs', 'brightness' => 204, 'hs_color' => [32, 80]] + $color, 'living_room', 8340],
            ['light.reading_lamp', 'on', ['friendly_name' => 'Reading lamp', 'color_mode' => 'brightness', 'brightness' => 143] + $dim, 'living_room', 5100],
            ['light.ceiling_spots', 'on', ['friendly_name' => 'Ceiling spots', 'color_mode' => 'brightness', 'brightness' => 77] + $dim, 'living_room', 12600],
            ['light.desk_lamp', 'on', ['friendly_name' => 'Desk lamp', 'color_mode' => 'brightness', 'brightness' => 38] + $dim, 'study', 15600],
            // six lights that are not reachable right now (unplugged / out of range) — shown as unavailable, never as off
            ['light.attic', 'unavailable', ['friendly_name' => 'Grenier'] + $u, 'roof', 90000],
            ['light.cellar', 'unavailable', ['friendly_name' => 'Cave'] + $u, 'cellar', 90000],
            ['light.study_desk', 'unavailable', ['friendly_name' => 'Bureau'] + $u, 'study', 90000],
            ['light.kids_night', 'unavailable', ['friendly_name' => 'Veilleuse'] + $u, 'kids_room', 90000],
            ['light.terrace_string', 'unavailable', ['friendly_name' => 'Guirlande'] + $u, 'terrace', 90000],
            ['light.shed', 'unavailable', ['friendly_name' => 'Abri de jardin'] + $u, 'garden', 90000],
        ];
    }

    /** @return list<array{0:string,1:string,2:array,3:?string,4:int}> */
    public static function entities(): array
    {
        $t = static fn (string $fn, float|int|string $v, ?string $unit = null, ?string $dc = null, ?string $sc = 'measurement', array $x = []) =>
            [$v, array_filter(['friendly_name' => $fn, 'unit_of_measurement' => $unit, 'device_class' => $dc, 'state_class' => $sc], static fn ($a) => $a !== null) + $x];
        $s = static function (string $id, string $fn, float|int|string $v, ?string $unit, ?string $dc, ?string $area, int $ago = 600, ?string $sc = 'measurement', array $x = []) use ($t) {
            [$v2, $a] = $t($fn, $v, $unit, $dc, $sc, $x);
            return [$id, (string) $v2, $a, $area, $ago];
        };
        $now = new DateTimeImmutable('now', new DateTimeZone(self::TZ));
        $at = static fn (string $hm) => $now->setTime((int) substr($hm, 0, 2), (int) substr($hm, 3, 2))->format(DATE_ATOM);
        $climate = static fn (string $name, float $cur, ?float $target, string $state, array $modes, array $x = []) => [
            'friendly_name' => $name, 'current_temperature' => $cur, 'temperature' => $target, 'min_temp' => 7, 'max_temp' => 30, 'target_temp_step' => 0.5,
            'hvac_modes' => $modes, 'hvac_action' => $state === 'off' ? 'off' : 'idle', 'supported_features' => 1 | 128 | 256] + $x;
        $list = [
            // people (fictional)
            ['person.alex', 'home', ['friendly_name' => 'Alex', 'source' => 'device_tracker.alex_phone'], null, 7200],
            ['person.robin', 'home', ['friendly_name' => 'Robin', 'source' => 'device_tracker.robin_phone'], null, 5400],
            ['person.sam', 'unknown', ['friendly_name' => 'Sam'], null, 86400],
            ['person.kim', 'unknown', ['friendly_name' => 'Kim'], null, 86400],
            // weather, sun, calendars
            ['weather.home', 'sunny', ['friendly_name' => 'Home', 'temperature' => 10.2, 'apparent_temperature' => 9.1, 'humidity' => 62, 'pressure' => 1021,
                'wind_speed' => 10, 'wind_bearing' => 225, 'cloud_coverage' => 10, 'uv_index' => 1.4, 'temperature_unit' => '°C', 'wind_speed_unit' => 'km/h',
                'pressure_unit' => 'hPa', 'precipitation_unit' => 'mm', 'visibility_unit' => 'km', 'supported_features' => 3, 'attribution' => 'Weather forecast from met.no (simulated)'], 'outside', 1200],
            ['sun.sun', 'above_horizon', ['friendly_name' => 'Sun', 'next_rising' => $now->modify('+1 day')->setTime(7, 40)->format(DATE_ATOM),
                'next_setting' => $now->setTime(17, 9)->format(DATE_ATOM), 'next_dawn' => $now->modify('+1 day')->setTime(7, 4)->format(DATE_ATOM),
                'next_dusk' => $now->setTime(17, 44)->format(DATE_ATOM), 'next_noon' => $now->setTime(12, 23)->format(DATE_ATOM),
                'elevation' => 18.4, 'azimuth' => 214.0, 'rising' => false], null, 20000],
            ['calendar.waste_collection', 'on', ['friendly_name' => 'Waste collection', 'message' => 'PMC — blue bags', 'all_day' => true,
                'start_time' => $now->format('Y-m-d') . ' 00:00:00', 'end_time' => $now->modify('+1 day')->format('Y-m-d') . ' 00:00:00', 'description' => 'Recycle!'], 'outside', 40000],
            ['calendar.family', 'on', ['friendly_name' => 'Family', 'message' => 'Paper & cardboard', 'all_day' => false,
                'start_time' => $at('06:00'), 'end_time' => $at('16:00')], null, 30000],
            // climate: the pellet stove (living room, read-only status from the stove) and two bedroom thermostats
            ['climate.pellet_stove', 'off', $climate('Poêle à pellets', 21.8, 18.0, 'off', ['off', 'heat', 'auto']), 'dining_room', 4680],
            ['sensor.pellet_stove_status', 'Stufa spenta', ['friendly_name' => 'Pellet stove status'], 'dining_room', 4680],
            $s('sensor.pellet_stove_exhaust', 'Exhaust', 30.0, '°C', 'temperature', 'dining_room'),
            ['sensor.pellet_stove_power_level', '1', ['friendly_name' => 'Power level', 'state_class' => 'measurement'], 'dining_room', 4680],
            ['select.pellet_stove_mode', 'Auto', ['friendly_name' => 'Mode', 'options' => ['Auto', 'Manual', 'Eco']], 'dining_room', 4680],
            ['climate.bedroom_parents', 'off', $climate('Thermostat parents', 20.8, null, 'off', ['off', 'heat']), 'bedroom', 9000],
            ['climate.bedroom_kids', 'off', $climate('Thermostat kids', 16.6, null, 'off', ['off', 'heat']), 'kids_room', 9000],
            ['fan.bathroom_extractor', 'on', ['friendly_name' => 'Extracteur', 'supported_features' => 1 | 16 | 32, 'percentage' => 100, 'percentage_step' => 100], 'bathroom', 240],
            // indoor / outdoor climate values
            $s('sensor.indoor_temperature', 'Indoor temp', 21.8, '°C', 'temperature', 'dining_room'),
            $s('sensor.outdoor_temperature', 'Outdoor temp', 10.2, '°C', 'temperature', 'outside'),
            $s('sensor.indoor_humidity', 'Humidity', 62, '%', 'humidity', 'dining_room'),
            $s('sensor.wind_speed', 'Wind', 10, 'km/h', 'wind_speed', 'outside'),
            $s('sensor.bedroom_temperature', 'Chambre temperature', 20.8, '°C', 'temperature', 'bedroom'),
            $s('sensor.bedroom_humidity', 'Chambre humidity', 62, '%', 'humidity', 'bedroom'),
            $s('sensor.kids_room_temperature', 'Kids room temperature', 18.6, '°C', 'temperature', 'kids_room'),
            $s('sensor.kids_room_humidity', 'Kids room humidity', 59, '%', 'humidity', 'kids_room'),
            $s('sensor.study_temperature', 'Study temperature', 19.5, '°C', 'temperature', 'study'),
            $s('sensor.study_humidity', 'Study humidity', 65, '%', 'humidity', 'study'),
            $s('sensor.cellar_temperature', 'Cave temperature', 40.0, '°C', 'temperature', 'cellar'),
            $s('sensor.bathroom_temperature', 'Bathroom temperature', 21.7, '°C', 'temperature', 'bathroom'),
            $s('sensor.bathroom_humidity', 'Bathroom humidity', 78, '%', 'humidity', 'bathroom'),
            // media and devices
            ['media_player.living_room_speaker', 'idle', ['friendly_name' => 'Echo', 'volume_level' => 0.3, 'is_volume_muted' => false,
                'supported_features' => 1 | 4 | 8 | 16 | 32 | 128 | 256 | 4096 | 16384], 'living_room', 493000],
            ['switch.kitchen_light_group', 'off', ['friendly_name' => 'Light'], 'kitchen', 3720],
            ['switch.coffee_machine', 'unavailable', ['friendly_name' => 'Coffee'], 'kitchen', 7200],
            ['switch.rice_cooker', 'off', ['friendly_name' => 'Rice cooker'], 'kitchen', 26000],
            ['switch.holiday_lights', 'off', ['friendly_name' => 'Holiday lights'], 'living_room', 26000],
            ['binary_sensor.front_door', 'off', ['friendly_name' => 'Front door', 'device_class' => 'door'], 'outside', 18000],
            // the lounge (the Studio showcase dashboards): a speaker that is playing, an air conditioner, a robot vacuum, Wi-Fi, a scene selector
            ['media_player.lounge_speaker', 'playing', ['friendly_name' => 'Lounge speaker', 'volume_level' => 0.42, 'is_volume_muted' => false, 'media_title' => 'Night Drive',
                'media_artist' => 'Lumen Avenue', 'media_album_name' => 'Afterglow', 'media_content_type' => 'music', 'media_duration' => 257, 'media_position' => 136,
                'media_position_updated_at' => $now->format(DATE_ATOM), 'supported_features' => 1 | 2 | 4 | 8 | 16 | 32 | 4096 | 16384], 'living_room', 136],
            ['climate.living_ac', 'cool', array_merge($climate('Air conditioning', 24.5, 23.0, 'cool', ['off', 'cool', 'heat', 'fan_only', 'dry']), ['hvac_action' => 'cooling', 'current_humidity' => 36, 'min_temp' => 16, 'max_temp' => 30]), 'living_room', 5340],
            $s('sensor.ac_power', 'Air conditioning power', 3.7, 'kW', 'power', 'living_room', 60),
            $s('sensor.ac_timer', 'Air conditioning timer', 2, 'h', 'duration', 'living_room', 600),
            ['vacuum.robot', 'cleaning', ['friendly_name' => 'Robotic vacuum', 'battery_level' => 20, 'fan_speed' => 'standard', 'fan_speed_list' => ['quiet', 'standard', 'max'],
                'supported_features' => 4 | 8 | 16 | 32 | 512 | 8192], 'living_room', 1500],
            $s('sensor.robot_cleaned_area', 'Cleaned area', 25, 'm²', 'area', 'living_room', 120),
            $s('sensor.robot_time_left', 'Time left', 15, 'min', 'duration', 'living_room', 120),
            $s('sensor.robot_battery', 'Robot battery', 20, '%', 'battery', 'living_room', 120),
            ['switch.wifi_router', 'on', ['friendly_name' => 'Wi-Fi'], 'living_room', 86000],
            ['switch.camera', 'on', ['friendly_name' => 'Camera'], 'outside', 86000],
            ['switch.sound_bar', 'off', ['friendly_name' => 'Sound'], 'living_room', 14520],
            ['select.lighting_scene', 'Working', ['friendly_name' => 'Lighting scene', 'options' => ['Reading', 'Working', 'Romantic', 'Relax']], 'living_room', 3600],
            $s('sensor.lamp_energy_month', 'Modern small lamp', 82, 'kWh', 'energy', 'living_room', 3600, 'total_increasing'),
            $s('sensor.tv_energy_month', 'Smart television', 252, 'kWh', 'energy', 'living_room', 3600, 'total_increasing'),
            $s('sensor.floor_area', 'First floor', 69, 'm²', 'area', null, 86400),
            ['input_boolean.ac_schedule', 'on', ['friendly_name' => 'Air conditioning schedule'], 'bedroom', 86000],
            ['sensor.ac_schedule_from', $now->setTime(20, 0)->format('Y-m-d\\TH:i:s'), ['friendly_name' => 'Schedule from', 'device_class' => 'timestamp'], 'bedroom', 86000],
            ['sensor.ac_schedule_to', $now->setTime(23, 50)->format('Y-m-d\\TH:i:s'), ['friendly_name' => 'Schedule to', 'device_class' => 'timestamp'], 'bedroom', 86000],
            // scenes
            ['scene.evening', 'scening', ['friendly_name' => 'Evening', 'entity_id' => ['light.dining_ceiling', 'light.living_ceiling']], null, 86400],
            ['scene.dinner', 'scening', ['friendly_name' => 'Dinner', 'entity_id' => ['light.dining_ceiling', 'light.kitchen_island']], null, 86400],
            ['scene.outside', 'scening', ['friendly_name' => 'Outside', 'entity_id' => ['light.pool_spot', 'light.garden_spot', 'light.parking']], null, 86400],
            ['scene.good_night', 'scening', ['friendly_name' => 'Good night', 'entity_id' => []], null, 86400],
            // ENERGY (see the class comment): power now
            $s('sensor.solar_power', 'Solar', 2380, 'W', 'power', 'roof', 30),
            $s('sensor.grid_import_power', 'Grid import', 0, 'W', 'power', null, 30),
            $s('sensor.grid_export_power', 'Grid export', 1900, 'W', 'power', null, 30),
            $s('sensor.grid_power', 'Grid', -1900, 'W', 'power', null, 30),
            $s('sensor.house_power', 'House use', 480, 'W', 'power', null, 30),
            $s('sensor.water_flow', 'Water', 3.8, 'L/min', 'volume_flow_rate', null, 60),
            // energy today (reset at midnight) and the meters (total_increasing: Home Assistant's long-term statistics use these)
            $s('sensor.solar_energy_today', 'Solar produced', 10.90, 'kWh', 'energy', 'roof', 300, 'total_increasing'),
            $s('sensor.grid_import_t1_today', 'Import T1', 1.03, 'kWh', 'energy', null, 300, 'total_increasing'),
            $s('sensor.grid_import_t2_today', 'Import T2', 2.01, 'kWh', 'energy', null, 300, 'total_increasing'),
            $s('sensor.grid_export_t1_today', 'Export T1', 1.30, 'kWh', 'energy', null, 300, 'total_increasing'),
            $s('sensor.grid_export_t2_today', 'Export T2', 6.00, 'kWh', 'energy', null, 300, 'total_increasing'),
            $s('sensor.grid_import_today', 'Grid import', 3.04, 'kWh', 'energy', null, 300, 'total_increasing'),
            $s('sensor.grid_export_today', 'Grid export', 7.30, 'kWh', 'energy', null, 300, 'total_increasing'),
            $s('sensor.house_energy_today', 'House use', 6.64, 'kWh', 'energy', null, 300, 'total_increasing'),
            $s('sensor.solar_energy_total', 'Solar (meter)', 18422.7, 'kWh', 'energy', 'roof', 300, 'total_increasing'),
            $s('sensor.grid_import_total', 'Grid import (meter)', 9312.4, 'kWh', 'energy', null, 300, 'total_increasing'),
            $s('sensor.grid_export_total', 'Grid export (meter)', 12871.0, 'kWh', 'energy', null, 300, 'total_increasing'),
            $s('sensor.gas_today', 'Gas today', 0.000, 'm³', 'gas', null, 3000, 'total_increasing'),
            $s('sensor.gas_meter', 'Gas meter', 29609.1, 'm³', 'gas', null, 3000, 'total_increasing'),
            $s('sensor.water_today', 'Water today', 0.385, 'm³', 'water', null, 120, 'total_increasing'),
            $s('sensor.water_meter', 'Water meter', 1096.0, 'm³', 'water', null, 120, 'total_increasing'),
            // costs and ratios (what Home Assistant's energy settings / template sensors provide)
            $s('sensor.energy_import_cost_today', 'Import cost', 0.55, 'EUR', 'monetary', null, 300, 'total'),
            $s('sensor.energy_export_compensation_today', 'Export compensation', 0.37, 'EUR', 'monetary', null, 300, 'total'),
            $s('sensor.energy_net_cost_today', 'Net electricity cost', 0.18, 'EUR', 'monetary', null, 300, 'total'),
            $s('sensor.solar_savings_today', 'Solar savings (estimate)', 0.65, 'EUR', 'monetary', null, 300, 'total'),
            $s('sensor.gas_cost_today', 'Gas cost', 0.00, 'EUR', 'monetary', null, 300, 'total'),
            $s('sensor.self_sufficiency_today', 'Self-sufficiency', 54, '%', null, null, 300),
            $s('sensor.solar_self_consumption_today', 'Solar used at home', 33, '%', null, null, 300),
            // the alert counter of the notification centre (what is unavailable or needs attention)
            ['sensor.alerts', '20', ['friendly_name' => 'Alerts', 'state_class' => 'measurement'], null, 600],
        ];
        return array_merge($list, self::lights(), self::demoHome());
    }

    /**
     * THE INIQDASH DEMO HOME — a fictional, English-named home for the official demo dashboard (assets/demo/iniqdash-demo.json): six rooms
     * with their lights, thermostats and sensors, a security system, scenes and clearly labelled DEMO EVENT buttons. Its energy sensors
     * are not listed here: SimHaClient derives them live from the time of day (power now, and today's totals as the running integral of
     * the same curves — so every total, chart and cost agrees). Nothing here is a real device: SimHaClient never reaches Home Assistant.
     */
    private static function demoHome(): array
    {
        $dim = ['supported_color_modes' => ['brightness'], 'color_mode' => null, 'supported_features' => 0, 'brightness' => null];
        $white = ['supported_color_modes' => ['color_temp'], 'color_mode' => null, 'supported_features' => 0, 'brightness' => null,
            'min_color_temp_kelvin' => 2200, 'max_color_temp_kelvin' => 6500, 'color_temp_kelvin' => null];
        $rgb = ['supported_color_modes' => ['color_temp', 'hs'], 'color_mode' => null, 'supported_features' => 4, 'brightness' => null,
            'min_color_temp_kelvin' => 2200, 'max_color_temp_kelvin' => 6500, 'color_temp_kelvin' => null, 'hs_color' => null, 'effect_list' => ['Candle', 'Colorloop'], 'effect' => null];
        $plain = ['supported_color_modes' => ['onoff'], 'color_mode' => null, 'supported_features' => 0];
        $on = static fn (array $base, int $pct, array $x = []) => array_replace($base, ['brightness' => (int) round($pct * 2.55),
            'color_mode' => isset($x['hs_color']) ? 'hs' : (isset($x['color_temp_kelvin']) ? 'color_temp' : ($base['supported_color_modes'] === ['onoff'] ? 'onoff' : 'brightness'))], $x);
        $L = static fn (string $id, string $name, string $state, array $attrs, string $area, int $ago) => ["light.demo_$id", $state, ['friendly_name' => $name] + $attrs, "demo_$area", $ago];
        $climate = static fn (string $name, float $cur, float $target, string $state, string $action, int $hum) => ['friendly_name' => $name,
            'hvac_modes' => ['off', 'heat', 'cool', 'auto'], 'current_temperature' => $cur, 'temperature' => $target, 'hvac_action' => $action,
            'current_humidity' => $hum, 'min_temp' => 7, 'max_temp' => 30, 'target_temp_step' => 0.5, 'supported_features' => 385];
        $T = static fn (string $room, string $name, float $t, int $h, string $area) => [
            ["sensor.demo_{$room}_temperature", (string) $t, ['friendly_name' => "$name temperature", 'unit_of_measurement' => '°C', 'device_class' => 'temperature', 'state_class' => 'measurement'], "demo_$area", 900],
            ["sensor.demo_{$room}_humidity", (string) $h, ['friendly_name' => "$name humidity", 'unit_of_measurement' => '%', 'device_class' => 'humidity', 'state_class' => 'measurement'], "demo_$area", 900]];
        $B = static fn (string $id, string $name, string $state, string $dc, string $area, int $ago) => ["binary_sensor.demo_$id", $state, ['friendly_name' => $name, 'device_class' => $dc], "demo_$area", $ago];
        $all = ['living_ceiling', 'living_floor', 'living_strip', 'kitchen_main', 'kitchen_cabinet', 'bedroom_ceiling', 'bedside_left', 'bedside_right',
            'bathroom_mirror', 'bathroom_ceiling', 'office_desk', 'office_ceiling', 'garden_path', 'garden_spots', 'hall', 'dining_pendant'];
        $off = array_fill_keys(array_map(static fn ($l) => "light.demo_$l", $all), ['off', []]);
        $locked = ['lock.demo_front_door' => ['locked', []], 'lock.demo_back_door' => ['locked', []], 'lock.demo_garage' => ['locked', []]];
        // a scene: what it sets (applied by SimHaClient on scene.turn_on — every listed entity, its state and attributes)
        $scene = static fn (string $id, string $name, string $icon, array $targets) => ["scene.demo_$id", 'scening',
            ['friendly_name' => $name, 'icon' => $icon, 'entity_id' => array_keys($targets), 'demo_targets' => $targets], null, 86400];
        return [
            // ---- LIGHTS (7 of 15 on)
            $L('living_ceiling', 'Ceiling lights', 'on', $on($white, 70, ['color_temp_kelvin' => 3000]), 'living', 2400),
            $L('living_floor', 'Floor lamp', 'on', $on($dim, 45), 'living', 2400),
            $L('living_strip', 'Ambient LED strip', 'on', $on($rgb, 60, ['hs_color' => [28, 78]]), 'living', 2400),
            $L('kitchen_main', 'Main lights', 'off', $dim, 'kitchen', 5400),
            $L('kitchen_cabinet', 'Under-cabinet lights', 'on', $on($white, 80, ['color_temp_kelvin' => 4000]), 'kitchen', 3600),
            $L('bedroom_ceiling', 'Ceiling light', 'off', $white, 'bedroom', 30000),
            $L('bedside_left', 'Bedside lamp left', 'on', $on($rgb, 30, ['color_temp_kelvin' => 2400]), 'bedroom', 900),
            $L('bedside_right', 'Bedside lamp right', 'off', $rgb, 'bedroom', 30000),
            $L('bathroom_mirror', 'Mirror light', 'off', $white, 'bathroom', 7200),
            $L('bathroom_ceiling', 'Ceiling light', 'off', $dim, 'bathroom', 7200),
            $L('office_desk', 'Desk lamp', 'on', $on($white, 85, ['color_temp_kelvin' => 4500]), 'office', 10800),
            $L('office_ceiling', 'Ceiling light', 'off', $dim, 'office', 10800),
            $L('dining_pendant', 'Pendant', 'on', $on($white, 75, ['color_temp_kelvin' => 2700]), 'dining', 2400),
            $L('garden_path', 'Path lights', 'on', $on($plain, 100), 'garden', 1800),
            $L('garden_spots', 'Tree spotlights', 'off', $rgb, 'garden', 1800),
            $L('hall', 'Hallway light', 'off', $dim, 'hall', 4000),
            // ---- CLIMATE: four thermostats, temperature and humidity per room
            ['climate.demo_living', 'heat', $climate('Living room', 20.6, 21.5, 'heat', 'heating', 46), 'demo_living', 3000],
            ['climate.demo_bedroom', 'heat', $climate('Bedroom', 19.4, 19.0, 'heat', 'idle', 48), 'demo_bedroom', 9000],
            ['climate.demo_bathroom', 'heat', $climate('Bathroom', 22.4, 23.0, 'heat', 'heating', 63), 'demo_bathroom', 6000],
            ['climate.demo_office', 'heat', $climate('Office', 20.9, 21.0, 'heat', 'idle', 44), 'demo_office', 8000],
            // ---- HUMIDIFIER, UPDATES and TO-DO LISTS (fictional devices; the to-do items live in SimHome::todo())
            ['humidifier.demo_bedroom', 'on', ['friendly_name' => 'Bedroom humidifier', 'device_class' => 'humidifier', 'humidity' => 45, 'current_humidity' => 41, 'min_humidity' => 30,
                'max_humidity' => 70, 'mode' => 'normal', 'available_modes' => ['normal', 'eco', 'sleep', 'boost'], 'action' => 'humidifying', 'supported_features' => 1], 'demo_bedroom', 5400],
            ['update.demo_core', 'on', ['friendly_name' => 'Home core update', 'title' => 'Home core', 'installed_version' => '2026.10.4', 'latest_version' => '2026.11.1',
                'release_url' => 'https://example.com/releases/2026.11.1', 'in_progress' => false, 'update_percentage' => null, 'supported_features' => 1 | 4 | 8 | 16], null, 86400],
            ['update.demo_router', 'on', ['friendly_name' => 'Router firmware', 'title' => 'Router', 'installed_version' => '7.2.0', 'latest_version' => '7.3.1',
                'release_url' => null, 'in_progress' => false, 'update_percentage' => null, 'supported_features' => 1 | 4], null, 172800],
            ['update.demo_hallway_sensor', 'off', ['friendly_name' => 'Hallway sensor firmware', 'title' => 'Hallway sensor', 'installed_version' => '1.4.2', 'latest_version' => '1.4.2',
                'release_url' => null, 'in_progress' => false, 'update_percentage' => null, 'supported_features' => 1], 'demo_hall', 600000],
            ['todo.demo_shopping', '3', ['friendly_name' => 'Shopping list', 'supported_features' => 1 | 2 | 4], null, 3600],
            ['sensor.demo_next_holiday', gmdate('Y-m-d\\TH:00:00+00:00', time() + 12 * 86400 + 5 * 3600), ['friendly_name' => 'Next holiday', 'device_class' => 'timestamp'], null, 86400],
            ['todo.demo_chores', '2', ['friendly_name' => 'Chores', 'supported_features' => 1 | 2 | 4 | 16], null, 7200],
            ...$T('living', 'Living room', 20.6, 46, 'living'), ...$T('kitchen', 'Kitchen', 21.3, 52, 'kitchen'), ...$T('bedroom', 'Bedroom', 19.4, 48, 'bedroom'),
            ...$T('bathroom', 'Bathroom', 22.4, 63, 'bathroom'), ...$T('office', 'Office', 20.9, 44, 'office'), ...$T('garden', 'Garden', 10.2, 81, 'garden'), ...$T('dining', 'Dining room', 20.4, 49, 'dining'),
            // ---- SECURITY: the alarm, three locks, contacts and motion (motion clears itself after 90 seconds)
            ['alarm_control_panel.demo_alarm', 'disarmed', ['friendly_name' => 'House alarm', 'code_arm_required' => false, 'code_format' => null, 'supported_features' => 3], 'demo_hall', 14400],
            ['lock.demo_front_door', 'locked', ['friendly_name' => 'Front door', 'supported_features' => 0], 'demo_hall', 7200],
            ['lock.demo_back_door', 'locked', ['friendly_name' => 'Back door', 'supported_features' => 0], 'demo_kitchen', 18000],
            ['lock.demo_garage', 'locked', ['friendly_name' => 'Garage door', 'supported_features' => 0], 'demo_garden', 40000],
            $B('front_door', 'Front door', 'off', 'door', 'hall', 7300),
            $B('back_door', 'Back door', 'off', 'door', 'kitchen', 18100),
            $B('living_window', 'Living room window', 'off', 'window', 'living', 20000),
            $B('bedroom_window', 'Bedroom window', 'on', 'window', 'bedroom', 3300),
            $B('office_window', 'Office window', 'off', 'window', 'office', 25000),
            $B('hall_motion', 'Hallway motion', 'off', 'motion', 'hall', 1500),
            $B('living_motion', 'Living room motion', 'on', 'motion', 'living', 60),
            $B('garden_motion', 'Garden motion', 'off', 'motion', 'garden', 5400),
            // ---- SCENES: what each one sets
            $scene('evening', 'Evening', 'mdi:weather-sunset', ['light.demo_living_ceiling' => ['on', ['brightness' => 102, 'color_mode' => 'color_temp', 'color_temp_kelvin' => 2700]],
                'light.demo_living_floor' => ['on', ['brightness' => 153, 'color_mode' => 'brightness']], 'light.demo_living_strip' => ['on', ['brightness' => 128, 'color_mode' => 'hs', 'hs_color' => [28, 78], 'color_temp_kelvin' => null]],
                'light.demo_kitchen_cabinet' => ['on', ['brightness' => 153, 'color_mode' => 'color_temp', 'color_temp_kelvin' => 3000]], 'light.demo_garden_path' => ['on', ['brightness' => 255, 'color_mode' => 'onoff']]]),
            $scene('movie', 'Movie', 'mdi:movie-open-outline', ['light.demo_living_ceiling' => ['off', ['brightness' => null, 'color_mode' => null]], 'light.demo_living_floor' => ['off', ['brightness' => null, 'color_mode' => null]],
                'light.demo_living_strip' => ['on', ['brightness' => 51, 'color_mode' => 'hs', 'hs_color' => [235, 70], 'color_temp_kelvin' => null]], 'light.demo_kitchen_main' => ['off', ['brightness' => null, 'color_mode' => null]],
                'light.demo_kitchen_cabinet' => ['on', ['brightness' => 38, 'color_mode' => 'color_temp', 'color_temp_kelvin' => 2700]]]),
            $scene('all_off', 'All lights off', 'mdi:lightbulb-group-off-outline', $off),
            $scene('away', 'Away', 'mdi:home-export-outline', $off + $locked + ['alarm_control_panel.demo_alarm' => ['armed_away', []], 'climate.demo_living' => ['heat', ['temperature' => 17.0, 'hvac_action' => 'idle']]]),
            $scene('good_night', 'Good night', 'mdi:weather-night', array_replace($off, ['light.demo_bedside_left' => ['on', ['brightness' => 26, 'color_mode' => 'color_temp', 'color_temp_kelvin' => 2200]]]) + $locked
                + ['alarm_control_panel.demo_alarm' => ['armed_home', []], 'climate.demo_bedroom' => ['heat', ['temperature' => 18.5, 'hvac_action' => 'idle']]]),
            $scene('welcome', 'Welcome home', 'mdi:home-heart', ['light.demo_living_ceiling' => ['on', ['brightness' => 179, 'color_mode' => 'color_temp', 'color_temp_kelvin' => 3000]],
                'light.demo_kitchen_main' => ['on', ['brightness' => 204, 'color_mode' => 'brightness']], 'light.demo_hall' => ['on', ['brightness' => 153, 'color_mode' => 'brightness']],
                'alarm_control_panel.demo_alarm' => ['disarmed', []], 'climate.demo_living' => ['heat', ['temperature' => 21.5, 'hvac_action' => 'heating']]]),
            // ---- PEOPLE (fictional): two at home, one at work, one away
            ['calendar.demo_household', 'on', ['friendly_name' => 'Household', 'message' => 'General waste', 'all_day' => true], null, 21600],
            ['switch.demo_extractor', 'off', ['friendly_name' => 'Extractor fan', 'icon' => 'mdi:fan'], 'demo_bathroom', 5400],
            ['person.demo_mia', 'home', ['friendly_name' => 'Mia'], null, 7200],
            ['person.demo_noah', 'home', ['friendly_name' => 'Noah'], null, 3600],
            ['person.demo_lea', 'Work', ['friendly_name' => 'Lea'], null, 14400],
            ['person.demo_theo', 'not_home', ['friendly_name' => 'Theo'], null, 5400],
            // ---- MEDIA (fictional artists and titles)
            ['media_player.demo_living', 'playing', ['friendly_name' => 'Living room speaker', 'volume_level' => 0.35, 'is_volume_muted' => false, 'media_title' => 'Slow Harbour',
                'media_artist' => 'The Lanterns', 'media_album_name' => 'Evening Tides', 'media_content_type' => 'music', 'media_duration' => 244,
                'supported_features' => 1 | 2 | 4 | 8 | 16 | 32 | 4096 | 16384], 'demo_living', 120],
            ['media_player.demo_kitchen', 'idle', ['friendly_name' => 'Kitchen speaker', 'volume_level' => 0.25, 'is_volume_muted' => false,
                'supported_features' => 1 | 2 | 4 | 8 | 16 | 32 | 4096 | 16384], 'demo_kitchen', 9000],
            // ---- A SECOND, FICTIONAL ENERGY SYSTEM with a battery (the Energy Flow "System" layout): balanced on purpose —
            //      solar 4 200 W = house 1 800 W + battery charging 1 500 W + grid export 900 W
            ['sensor.demo_energy_solar', '4200', ['friendly_name' => 'Demo solar power', 'unit_of_measurement' => 'W', 'device_class' => 'power', 'state_class' => 'measurement'], null, 30],
            ['sensor.demo_energy_grid', '-0.9', ['friendly_name' => 'Demo grid power', 'unit_of_measurement' => 'kW', 'device_class' => 'power', 'state_class' => 'measurement'], null, 30],
            ['sensor.demo_energy_battery', '1500', ['friendly_name' => 'Demo battery power', 'unit_of_measurement' => 'W', 'device_class' => 'power', 'state_class' => 'measurement'], null, 30],
            ['sensor.demo_energy_battery_level', '64', ['friendly_name' => 'Demo battery level', 'unit_of_measurement' => '%', 'device_class' => 'battery', 'state_class' => 'measurement'], null, 30],
            ['sensor.demo_energy_house', '1800', ['friendly_name' => 'Demo house power', 'unit_of_measurement' => 'W', 'device_class' => 'power', 'state_class' => 'measurement'], null, 30],
            ['sensor.demo_energy_heat_pump', '650', ['friendly_name' => 'Demo heat pump power', 'unit_of_measurement' => 'W', 'device_class' => 'power', 'state_class' => 'measurement'], null, 30],
            ['sensor.demo_energy_forecast_today', '24.6', ['friendly_name' => 'Demo solar forecast today', 'unit_of_measurement' => 'kWh', 'device_class' => 'energy'], null, 900],
            ['sensor.demo_energy_forecast_remaining', '7.9', ['friendly_name' => 'Demo solar forecast remaining today', 'unit_of_measurement' => 'kWh', 'device_class' => 'energy'], null, 900],
            ['sensor.demo_energy_forecast_tomorrow', '19.2', ['friendly_name' => 'Demo solar forecast tomorrow', 'unit_of_measurement' => 'kWh', 'device_class' => 'energy'], null, 900],
            ['sensor.demo_energy_battery_health', '97', ['friendly_name' => 'Demo battery health', 'unit_of_measurement' => '%'], null, 9000],
            ['sensor.demo_energy_battery_temperature', '22.5', ['friendly_name' => 'Demo battery temperature', 'unit_of_measurement' => '°C', 'device_class' => 'temperature'], null, 600],
            ['sensor.demo_energy_battery_in_today', '6.2', ['friendly_name' => 'Demo battery charged today', 'unit_of_measurement' => 'kWh', 'device_class' => 'energy', 'state_class' => 'total_increasing'], null, 600],
            ['sensor.demo_energy_battery_out_today', '3.1', ['friendly_name' => 'Demo battery discharged today', 'unit_of_measurement' => 'kWh', 'device_class' => 'energy', 'state_class' => 'total_increasing'], null, 600],
            ['sensor.demo_energy_solar_today', '18.4', ['friendly_name' => 'Demo solar today', 'unit_of_measurement' => 'kWh', 'device_class' => 'energy', 'state_class' => 'total_increasing'], null, 300],
            // ---- ELECTRIC VEHICLES (fictional): a car charging at home, a van parked away (the Vehicle widget)
            ['sensor.demo_car_battery', '68', ['friendly_name' => 'City car battery', 'unit_of_measurement' => '%', 'device_class' => 'battery', 'state_class' => 'measurement'], 'demo_garden', 300],
            ['sensor.demo_car_range', '312', ['friendly_name' => 'City car range', 'unit_of_measurement' => 'km', 'device_class' => 'distance'], 'demo_garden', 300],
            ['number.demo_car_charge_limit', '80', ['friendly_name' => 'City car charge limit', 'min' => 50, 'max' => 100, 'step' => 5, 'mode' => 'slider', 'unit_of_measurement' => '%'], 'demo_garden', 86400],
            ['binary_sensor.demo_car_charging', 'on', ['friendly_name' => 'City car charging', 'device_class' => 'battery_charging'], 'demo_garden', 1800],
            ['sensor.demo_car_charging_power', '7.4', ['friendly_name' => 'City car charging power', 'unit_of_measurement' => 'kW', 'device_class' => 'power', 'state_class' => 'measurement'], 'demo_garden', 60],
            ['sensor.demo_car_time_to_full', '85', ['friendly_name' => 'City car time to full', 'unit_of_measurement' => 'min', 'device_class' => 'duration'], 'demo_garden', 60],
            ['binary_sensor.demo_car_plugged', 'on', ['friendly_name' => 'City car plugged in', 'device_class' => 'plug'], 'demo_garden', 1900],
            ['lock.demo_car_doors', 'locked', ['friendly_name' => 'City car doors', 'supported_features' => 0], 'demo_garden', 4000],
            ['switch.demo_car_climate', 'off', ['friendly_name' => 'City car climate', 'icon' => 'mdi:car-defrost-front'], 'demo_garden', 9000],
            ['sensor.demo_car_odometer', '48210', ['friendly_name' => 'City car odometer', 'unit_of_measurement' => 'km', 'device_class' => 'distance', 'state_class' => 'total_increasing'], 'demo_garden', 9000],
            ['sensor.demo_van_battery', '41', ['friendly_name' => 'Van battery', 'unit_of_measurement' => '%', 'device_class' => 'battery', 'state_class' => 'measurement'], null, 3600],
            ['sensor.demo_van_range', '118', ['friendly_name' => 'Van range', 'unit_of_measurement' => 'km', 'device_class' => 'distance'], null, 3600],
            ['binary_sensor.demo_van_plugged', 'off', ['friendly_name' => 'Van plugged in', 'device_class' => 'plug'], null, 7200],
            // ---- BATTERIES of the battery-powered devices (the Batteries widget: the emptiest first)
            ['sensor.demo_front_door_battery', '18', ['friendly_name' => 'Front door lock battery', 'unit_of_measurement' => '%', 'device_class' => 'battery', 'state_class' => 'measurement'], 'demo_hall', 86400],
            ['sensor.demo_hall_motion_battery', '64', ['friendly_name' => 'Hallway motion battery', 'unit_of_measurement' => '%', 'device_class' => 'battery', 'state_class' => 'measurement'], 'demo_hall', 86400],
            ['sensor.demo_garden_motion_battery', '7', ['friendly_name' => 'Garden motion battery', 'unit_of_measurement' => '%', 'device_class' => 'battery', 'state_class' => 'measurement'], 'demo_garden', 86400],
            ['sensor.demo_bedroom_window_battery', '92', ['friendly_name' => 'Bedroom window sensor battery', 'unit_of_measurement' => '%', 'device_class' => 'battery', 'state_class' => 'measurement'], 'demo_bedroom', 86400],
            ['sensor.demo_kitchen_leak_battery', '41', ['friendly_name' => 'Kitchen leak sensor battery', 'unit_of_measurement' => '%', 'device_class' => 'battery', 'state_class' => 'measurement'], 'demo_kitchen', 86400],
            // ---- WATER LEAKS, light levels, room power (the room popups' Security and Sensors)
            $B('bathroom_leak', 'Bathroom leak', 'off', 'moisture', 'bathroom', 90000),
            $B('kitchen_leak', 'Kitchen leak', 'off', 'moisture', 'kitchen', 90000),
            ['sensor.demo_living_illuminance', '86', ['friendly_name' => 'Living room light level', 'unit_of_measurement' => 'lx', 'device_class' => 'illuminance', 'state_class' => 'measurement'], 'demo_living', 300],
            ['sensor.demo_living_power', '142', ['friendly_name' => 'Living room power', 'unit_of_measurement' => 'W', 'device_class' => 'power', 'state_class' => 'measurement'], 'demo_living', 60],
            ['sensor.demo_living_energy', '412.6', ['friendly_name' => 'Living room energy', 'unit_of_measurement' => 'kWh', 'device_class' => 'energy', 'state_class' => 'total_increasing'], 'demo_living', 600],
            ['sensor.demo_kitchen_power', '38', ['friendly_name' => 'Kitchen power', 'unit_of_measurement' => 'W', 'device_class' => 'power', 'state_class' => 'measurement'], 'demo_kitchen', 60],
            ['sensor.demo_bedroom_illuminance', '12', ['friendly_name' => 'Bedroom light level', 'unit_of_measurement' => 'lx', 'device_class' => 'illuminance', 'state_class' => 'measurement'], 'demo_bedroom', 300],
            ['sensor.demo_office_power', '96', ['friendly_name' => 'Office power', 'unit_of_measurement' => 'W', 'device_class' => 'power', 'state_class' => 'measurement'], 'demo_office', 60],
            // ---- APPLIANCES
            ['sensor.demo_washer_state', 'Running', ['friendly_name' => 'Washing machine', 'icon' => 'mdi:washing-machine'], 'demo_bathroom', 2400],
            // ---- DEMO EVENTS (buttons, clearly labelled — they only change this simulated home)
            ['button.demo_simulate_motion', 'unknown', ['friendly_name' => 'Simulate garden motion (demo)', 'icon' => 'mdi:motion-sensor'], 'demo_garden', 86400],
            ['button.demo_simulate_door', 'unknown', ['friendly_name' => 'Simulate back door opening (demo)', 'icon' => 'mdi:door-open'], 'demo_kitchen', 86400],
            ['button.demo_clear_events', 'unknown', ['friendly_name' => 'Clear demo events', 'icon' => 'mdi:broom'], null, 86400],
            ['button.demo_reset', 'unknown', ['friendly_name' => 'Reset the demo home', 'icon' => 'mdi:restore'], null, 86400],
        ];
    }

    /** upcoming calendar events, relative to today (HA's REST shape) */
    public static function events(string $id): array
    {
        $tz = new DateTimeZone(self::TZ);
        $d = static fn (int $days) => (new DateTimeImmutable('today', $tz))->modify("+{$days} day")->format('Y-m-d');
        $tm = static fn (int $days, string $hm) => (new DateTimeImmutable('today', $tz))->modify("+{$days} day")->setTime((int) substr($hm, 0, 2), (int) substr($hm, 3, 2))->format(DATE_ATOM);
        return match ($id) {
            'calendar.waste_collection' => [
                ['summary' => 'PMC — blue bags', 'start' => ['date' => $d(0)], 'end' => ['date' => $d(1)], 'description' => 'Recycle!'],
                ['summary' => 'Paper & cardboard', 'start' => ['date' => $d(7)], 'end' => ['date' => $d(8)]],
                ['summary' => 'PMC — blue bags', 'start' => ['date' => $d(14)], 'end' => ['date' => $d(15)]],
            ],
            'calendar.demo_household' => [
                ['summary' => 'General waste', 'start' => ['date' => $d(0)], 'end' => ['date' => $d(1)], 'description' => 'Put the bin out tonight'],
                ['summary' => 'Organic waste', 'start' => ['date' => $d(0)], 'end' => ['date' => $d(1)], 'description' => 'Green bin'],
                ['summary' => "Léa's birthday", 'start' => ['date' => $d(2)], 'end' => ['date' => $d(3)], 'description' => 'Dinner at 19:00'],
                ['summary' => 'Recycling', 'start' => ['date' => $d(5)], 'end' => ['date' => $d(6)], 'description' => 'Blue bags'],
            ],
            'calendar.family' => [
                ['summary' => 'Paper & cardboard', 'start' => ['dateTime' => $tm(0, '06:00')], 'end' => ['dateTime' => $tm(0, '16:00')]],
                ['summary' => 'Swimming lesson', 'start' => ['dateTime' => $tm(2, '17:30')], 'end' => ['dateTime' => $tm(2, '18:30')], 'location' => 'Sports centre'],
            ],
            default => [],
        };
    }

    /** the daily forecast (and an hourly one) of weather.home */
    public static function forecast(string $type): array
    {
        $tz = new DateTimeZone(self::TZ);
        if ($type === 'hourly') {
            $out = [];
            for ($h = 1; $h <= 24; $h++) {
                $t = (new DateTimeImmutable('now', $tz))->modify("+{$h} hour")->format('Y-m-d\TH:00:00P');
                $out[] = ['datetime' => $t, 'condition' => $h < 6 ? 'sunny' : 'cloudy', 'temperature' => round(10.2 - 0.25 * $h, 1), 'precipitation_probability' => min(80, 5 * $h)];
            }
            return $out;
        }
        $rows = [['cloudy', 8, 3, 30], ['cloudy', 9, 4, 10], ['cloudy', 9, 6, 20], ['rainy', 12, 7, 80], ['partlycloudy', 11, 5, 10], ['sunny', 13, 6, 0], ['cloudy', 10, 5, 30]];
        $out = [];
        foreach ($rows as $i => [$c, $hi, $lo, $p]) {
            $out[] = ['datetime' => (new DateTimeImmutable('today', $tz))->modify('+' . ($i + 1) . ' day')->format('Y-m-d\T12:00:00P'), 'condition' => $c,
                'temperature' => $hi, 'templow' => $lo, 'precipitation_probability' => $p, 'precipitation' => $p > 50 ? 3.2 : 0];
        }
        return $out;
    }

    /** the demo to-do lists' starting items (fictional) */
    public static function todo(string $id): array
    {
        $L = [
            'todo.demo_shopping' => [['Milk', 'needs_action'], ['Bread', 'needs_action'], ['Apples', 'needs_action'], ['Coffee beans', 'completed']],
            'todo.demo_chores' => [['Water the plants', 'needs_action'], ['Change the bed sheets', 'needs_action'], ['Take the bins out', 'completed']],
        ];
        $out = [];
        foreach ($L[$id] ?? [] as $i => [$sum, $st]) {
            $out[] = ['uid' => substr(md5($id), 0, 6) . '-' . ($i + 1), 'summary' => $sum, 'status' => $st];
        }
        return $out;
    }
}
