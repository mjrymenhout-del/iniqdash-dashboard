<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

require_once __DIR__ . '/SimHome.php';

/**
 * A SIMULATED Home Assistant for dashboards marked "simulated" (app.simulated): it answers the same REST / WebSocket requests
 * HaService makes, from the fictional home in SimHome.php, so every widget, binding, normalisation, action plan and history
 * reduction runs exactly as with a real installation.
 *
 * It has NO network code: every public method of HaClient is overridden, the parent's cURL / socket code is never reached, and
 * the configured Home Assistant URL and token are never read. Actions change the simulated state only
 * (<private>/var/sim/s<hash>.json — one file per signed-in browser session: every visitor has a home of their own).
 */
final class SimHaClient extends HaClient
{
    /** CO₂ factors of the demo's estimate (stated on the sensor): grid electricity, kg per kWh; natural gas, kg per m³ */
    public const CO2_GRID = 0.18;
    public const CO2_GAS = 2.0;
    /** the demo home's daily TOTALS (their "today" sensor id → what they measure) */
    private const DEMO_TOTALS = ['sensor.demo_solar_energy_today' => 'solar', 'sensor.demo_house_energy_today' => 'house', 'sensor.demo_grid_import_today' => 'import',
        'sensor.demo_grid_export_today' => 'export', 'sensor.demo_water_today' => 'water', 'sensor.demo_gas_today' => 'gas', 'sensor.demo_co2_today' => 'co2'];

    public function __construct()
    {
        parent::__construct(['url' => 'sim://home', 'token' => '', 'verify_tls' => true, 'ca_file' => null]);
    }

    /* ------------------------------------------------------------------ state */

    /** the simulated state of THIS VISITOR: one file per signed-in browser session (<private>/var/sim/<hash of the session>.json), so
        one visitor's demo never changes another's and a reset only resets one's own. Without a session (CLI, tests of the class
        itself) a shared "state.json". Files untouched for a week are removed now and then. */
    private static function stateFile(): ?string
    {
        if (IQ_VAR === null) {
            return null;
        }
        $dir = IQ_VAR . '/sim';
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        $sid = session_status() !== PHP_SESSION_DISABLED ? (string) session_id() : '';
        if ($sid === '') {
            return $dir . '/state.json';
        }
        if (random_int(1, 200) === 1) {
            foreach (glob($dir . '/s*.json') ?: [] as $old) {
                if (@filemtime($old) < time() - 7 * 86400) {
                    @unlink($old);
                }
            }
        }
        return $dir . '/s' . substr(hash('sha256', 'iniqdash-sim|' . $sid), 0, 40) . '.json';
    }

    /** the simulated changes so far: id → { state, attributes (merged), changed (unix time) } */
    private static function overrides(): array
    {
        $f = self::stateFile();
        $j = $f !== null && is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
        return is_array($j) ? $j : [];
    }

    /** every entity now, in Home Assistant's REST shape (keyed by id), plus its area */
    private static function world(): array
    {
        $ov = self::overrides();
        $now = time();
        $out = [];
        foreach (SimHome::entities() as [$id, $state, $attrs, $area, $ago]) {
            $changed = $now - $ago;
            if (isset($ov[$id]) && is_array($ov[$id])) {
                $state = (string) ($ov[$id]['state'] ?? $state);
                $attrs = array_replace($attrs, is_array($ov[$id]['attributes'] ?? null) ? $ov[$id]['attributes'] : []);
                $changed = (int) ($ov[$id]['changed'] ?? $changed);
            }
            if ($state === 'unavailable') {
                $attrs = array_intersect_key($attrs, ['friendly_name' => 1, 'supported_features' => 1, 'supported_color_modes' => 1, 'device_class' => 1]);
            }
            $iso = gmdate('Y-m-d\TH:i:s', $changed) . '.000000+00:00';
            $out[$id] = ['entity_id' => $id, 'state' => $state, 'attributes' => $attrs, 'last_changed' => $iso, 'last_updated' => $iso,
                'last_reported' => $iso, '_area' => $area];
        }
        // template sensors of the home (what a Home Assistant user defines as template sensors), DERIVED from the lights above,
        // so they always agree with them: how many lights are on, their average brightness, how many are unavailable
        $lights = array_filter($out, static fn ($e) => str_starts_with($e['entity_id'], 'light.'));
        $on = array_filter($lights, static fn ($e) => $e['state'] === 'on');
        $avail = array_filter($lights, static fn ($e) => $e['state'] !== 'unavailable');
        $br = array_map(static fn ($e) => (int) round(((int) ($e['attributes']['brightness'] ?? 255)) / 2.55), $on);
        $iso = gmdate('Y-m-d\TH:i:s', $now - 60) . '.000000+00:00';
        $derived = [
            'sensor.lights_on' => [(string) count($on), ['friendly_name' => 'Lights on', 'unit_of_measurement' => 'of ' . count($avail), 'state_class' => 'measurement']],
            'sensor.lights_status' => ['of ' . count($avail) . ' · ' . (count($on) === 0 ? 'everything is off' : (count($on) === 1 ? '1 light is on' : count($on) . ' lights are on')),
                ['friendly_name' => 'Lights status']],
            'sensor.lights_unavailable' => [(string) (count($lights) - count($avail)), ['friendly_name' => 'Unavailable · hidden', 'state_class' => 'measurement']],
            'sensor.lights_brightness' => [$br === [] ? 'unknown' : (string) round(array_sum($br) / count($br)), ['friendly_name' => 'Average brightness', 'unit_of_measurement' => '%', 'state_class' => 'measurement']],
        ];
        // template sensors from the daily forecast (Home Assistant only gives a forecast through a service): today's low and the next three
        // days — state: the condition; attributes: label, high, low (what a weather card lists)
        $fc = SimHome::forecast('daily');
        $tz = new \DateTimeZone(SimHome::TZ);
        $derived['sensor.forecast_today_low'] = [(string) $fc[1]['templow'], ['friendly_name' => 'Today low', 'unit_of_measurement' => '°C', 'state_class' => 'measurement']];
        foreach ([0, 1, 2] as $i) {
            $d = new \DateTimeImmutable($fc[$i]['datetime']);
            $derived['sensor.forecast_day_' . ($i + 1)] = [ucfirst($fc[$i]['condition'] === 'partlycloudy' ? 'Partly cloudy' : $fc[$i]['condition']),
                ['friendly_name' => 'Forecast day ' . ($i + 1), 'label' => $i === 0 ? 'Tomorrow' : $d->setTimezone($tz)->format('l'), 'high' => $fc[$i]['temperature'], 'low' => $fc[$i]['templow'],
                    'condition' => $fc[$i]['condition'], 'precipitation_probability' => $fc[$i]['precipitation_probability']]];
        }
        $derived['sensor.day_length'] = ['9h31', ['friendly_name' => 'Day length']];
        $unav = array_values(array_filter($out, static fn ($e) => $e['state'] === 'unavailable'));
        $derived['sensor.alerts'] = [(string) (count($unav) + 4), ['friendly_name' => 'Alerts', 'latest' => 'Device unavailable · ' . ($unav ? ($unav[count($unav) - 1]['attributes']['friendly_name'] ?? 'device') : 'none')]];
        // per ROOM (area): how many of its lights are on, how many it has (total) and how many of those are available — e.g. "0/3"
        $byArea = [];
        foreach ($lights as $e) {
            if (is_string($e['_area'] ?? null)) {
                $byArea[$e['_area']][] = $e;
            }
        }
        ksort($byArea);
        foreach ($byArea as $area => $list) {
            $nOn = count(array_filter($list, static fn ($e) => $e['state'] === 'on'));
            $nAv = count(array_filter($list, static fn ($e) => $e['state'] !== 'unavailable'));
            $derived["sensor.{$area}_lights_on"] = [(string) $nOn, ['friendly_name' => ucfirst(str_replace('_', ' ', $area)) . ' lights on', 'unit_of_measurement' => 'of ' . count($list), 'total' => count($list), 'available' => $nAv,
                'state_class' => 'measurement', '_area' => $area]];
        }
        // ---- THE DEMO HOME: motion clears itself 90 s after it was seen; how many of its lights are on; its energy, LIVE from the time of day
        foreach (['binary_sensor.demo_garden_motion', 'binary_sensor.demo_hall_motion'] as $m) {
            if (($out[$m]['state'] ?? '') === 'on' && isset($ov[$m]['changed']) && $now - (int) $ov[$m]['changed'] > 90) {
                $out[$m]['state'] = 'off';
                $out[$m]['last_changed'] = $out[$m]['last_updated'] = gmdate('Y-m-d\TH:i:s', (int) $ov[$m]['changed'] + 90) . '.000000+00:00';
            }
        }
        $dl = array_filter($lights, static fn ($e) => str_starts_with($e['entity_id'], 'light.demo_'));
        $dOn = count(array_filter($dl, static fn ($e) => $e['state'] === 'on'));
        $open = array_filter(['binary_sensor.demo_front_door', 'binary_sensor.demo_back_door', 'binary_sensor.demo_living_window', 'binary_sensor.demo_bedroom_window', 'binary_sensor.demo_office_window'],
            static fn ($id) => ($out[$id]['state'] ?? '') === 'on');
        $derived['sensor.demo_open_contacts'] = [(string) count($open), ['friendly_name' => 'Open doors & windows', 'unit_of_measurement' => 'of 5', 'state_class' => 'measurement']];
        $derived['sensor.demo_lights_on'] = [(string) $dOn, ['friendly_name' => 'Lights on', 'unit_of_measurement' => 'of ' . count($dl), 'state_class' => 'measurement']];
        foreach (self::demoEnergy($now) as $id => $v) {
            $derived[$id] = $v;
        }
        // OCCASIONAL DEMO EVENTS of this visitor's demo: a fixed, short schedule from the moment the demo was first seen (at most six,
        // at least four minutes apart). The state is the LATEST event, so a notification rule fires once per event and a refresh
        // replays nothing; "Reset demo" starts the schedule again.
        $start = self::eventClock($ov, $now);
        $done = array_values(array_filter(self::DEMO_EVENTS, static fn ($e) => $now - $start >= $e[0]));
        $last = $done[count($done) - 1] ?? null;
        $evIso = $last !== null ? gmdate('Y-m-d\TH:i:s', $start + $last[0]) . '.000000+00:00' : $iso;
        // "energy_note" is decided by the moment it happened (never flips afterwards): strong sun, the evening, or the dishwasher
        $at = $last !== null ? $start + $last[0] : $now;
        $hour = (int) (new DateTimeImmutable('@' . $at))->setTimezone(new DateTimeZone(SimHome::TZ))->format('G');
        [$key, $title, $msg, $cat] = $last === null ? ['none', 'No events yet', '', 'info']
            : ($last[1] !== 'energy_note' ? array_slice($last, 1)
                : (self::power('solar', $at) > 1000 ? ['solar_peak', 'Solar is running strong', 'A good moment for the dishwasher.', 'energy']
                    : ($hour >= 17 ? ['evening_lights', 'Evening lighting', 'The hallway lights follow the evening schedule.', 'lights']
                        : ['dishwasher_done', 'Dishwasher finished', 'The eco cycle is done.', 'appliance'])));
        $derived['sensor.demo_event'] = [$key, ['friendly_name' => 'Demo event', 'title' => $title, 'message' => $msg, 'category' => $cat, 'count' => count($done),
            'of' => count(self::DEMO_EVENTS), 'simulated' => true, 'icon' => 'mdi:bell-ring-outline', '_changed' => $evIso]];
        if (count($done) >= 1 && !isset($ov['sensor.demo_washer_state'])) {
            $derived['sensor.demo_washer_state'] = ['Finished', ($out['sensor.demo_washer_state']['attributes'] ?? []) + ['_changed' => gmdate('Y-m-d\TH:i:s', $start + self::DEMO_EVENTS[0][0]) . '.000000+00:00']];
        }
        foreach ($derived as $id => [$state, $attrs]) {
            $area = $attrs['_area'] ?? ($out[$id]['_area'] ?? null);
            $at = $attrs['_changed'] ?? $iso;
            unset($attrs['_area'], $attrs['_changed']);
            $out[$id] = ['entity_id' => $id, 'state' => $state, 'attributes' => $attrs, 'last_changed' => $at, 'last_updated' => $at, 'last_reported' => $at, '_area' => $area];
        }
        return $out;
    }

    /** the occasional demo events: [seconds after the demo was first seen, key, title, message, category] ("energy_note" depends on the sun) */
    private const DEMO_EVENTS = [
        [150, 'washer_done', 'Washing machine finished', 'The 40° cycle is done — time to hang the laundry.', 'appliance'],
        [420, 'energy_note', '', '', 'energy'],
        [720, 'garden_motion', 'Motion in the garden', 'The garden camera saw movement near the shed.', 'security'],
        [1080, 'birthday', "It's Léa's birthday", 'Dinner at 19:00 — the cake is in the fridge.', 'family'],
        [1500, 'high_use', 'High energy use', 'The oven and the kettle draw 3.4 kW together.', 'energy'],
        [1980, 'window_reminder', 'Office window is open', 'It is 11 °C outside — close it when you leave.', 'climate'],
    ];

    /** when THIS visitor's demo was first seen (the start of its event schedule), stored with its simulated state; a reset clears it */
    private static function eventClock(array $ov, int $now): int
    {
        if (isset($ov['sensor.demo_event_clock']['changed'])) {
            return (int) $ov['sensor.demo_event_clock']['changed'];
        }
        $f = self::stateFile();
        if ($f === null || ($fh = @fopen($f, 'c+')) === false) {
            return $now;
        }
        flock($fh, LOCK_EX);
        $cur = json_decode((string) stream_get_contents($fh), true);
        $cur = is_array($cur) ? $cur : [];
        if (!isset($cur['sensor.demo_event_clock']['changed'])) {
            $cur['sensor.demo_event_clock'] = ['changed' => $now];
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, json_encode($cur, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        }
        flock($fh, LOCK_UN);
        fclose($fh);
        @chmod($f, 0600);
        return (int) $cur['sensor.demo_event_clock']['changed'];
    }

    /** a to-do list's items: as changed by this visitor, else the starting items */
    private static function todoList(string $id): array
    {
        $items = self::world()[$id]['attributes']['_items'] ?? null;
        return is_array($items) ? $items : SimHome::todo($id);
    }

    private static function rest(array $e): array
    {
        unset($e['_area']);
        unset($e['attributes']['_items']);
        return $e;
    }

    /** apply a change (state and / or attributes) to the simulated home, under a file lock */
    private static function change(array $changes): void
    {
        $f = self::stateFile();
        if ($f === null) {
            return;
        }
        $fh = @fopen($f, 'c+');
        if ($fh === false) {
            return;
        }
        flock($fh, LOCK_EX);
        $cur = json_decode((string) stream_get_contents($fh), true);
        $cur = is_array($cur) ? $cur : [];
        $w = self::world();
        foreach ($changes as $id => [$state, $attrs]) {
            $before = $w[$id]['state'] ?? null;
            $o = $cur[$id] ?? [];
            $o['attributes'] = array_replace(is_array($o['attributes'] ?? null) ? $o['attributes'] : [], $attrs);
            if ($state !== null) {
                $o['state'] = $state;
            }
            if ($state !== null && $state !== $before || !isset($o['changed'])) {
                $o['changed'] = time();
            }
            $cur[$id] = $o;
        }
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($cur, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        flock($fh, LOCK_UN);
        fclose($fh);
        @chmod($f, 0600);
    }

    /* ------------------------------------------------------------------ the HaClient surface (no network) */

    public function request(string $method, string $path, ?array $json = null, int $timeout = 6, int $maxBytes = 0): array
    {
        $ok = static fn ($body) => ['status' => 200, 'body' => $body, 'error' => null];
        $no = static fn (int $s = 404) => ['status' => $s, 'body' => null, 'error' => 'http'];
        [$p, $q] = array_pad(explode('?', $path, 2), 2, '');
        parse_str($q, $query);
        if ($method === 'GET' && $p === '/api/config') {
            return $ok(['version' => '2026.11.0', 'location_name' => 'Simulated home', 'time_zone' => SimHome::TZ,
                'unit_system' => ['temperature' => '°C', 'length' => 'km', 'mass' => 'kg', 'volume' => 'L', 'wind_speed' => 'km/h']]);
        }
        if ($method === 'GET' && $p === '/api/states') {
            return $ok(array_values(array_map([self::class, 'rest'], self::world())));
        }
        if ($method === 'GET' && preg_match('#^/api/states/([a-z0-9_]+\.[a-z0-9_]+)$#', $p, $m)) {
            $w = self::world();
            return isset($w[$m[1]]) ? $ok(self::rest($w[$m[1]])) : $no();
        }
        if ($method === 'POST' && $p === '/api/template') {
            $tpl = (string) ($json['template'] ?? '');
            if (str_contains($tpl, 'for a in areas()')) {           // discovery: entities + Home Assistant areas
                $rows = [];
                foreach (self::world() as $id => $e) {
                    $a = $e['attributes'];
                    $rows[] = [$id, $e['state'], $a['friendly_name'] ?? null, $a['unit_of_measurement'] ?? null, $a['device_class'] ?? null, null, $e['_area'], null, $a['state_class'] ?? null, $a['entity_id'] ?? null];
                }
                return $ok(['rows' => $rows, 'areas' => SimHome::AREAS]);
            }
            return $no(400);                                          // other templates: HaService uses its REST fallback
        }
        if ($method === 'GET' && preg_match('#^/api/history/period/#', $p)) {
            return $ok(self::history(explode(',', (string) ($query['filter_entity_id'] ?? '')), substr($p, strlen('/api/history/period/')), (string) ($query['end_time'] ?? '')));
        }
        if ($method === 'GET' && preg_match('#^/api/calendars/([a-z0-9_]+\.[a-z0-9_]+)$#', $p, $m)) {
            return isset(self::world()[$m[1]]) ? $ok(SimHome::events($m[1])) : $no();
        }
        if ($method === 'GET' && str_starts_with($p, '/api/logbook/')) {
            return $ok([]);
        }
        if ($method === 'POST' && $p === '/api/services/weather/get_forecasts') {
            $id = (string) ($json['entity_id'] ?? '');
            return $ok(['changed_states' => [], 'service_response' => [$id => ['forecast' => SimHome::forecast((string) ($json['type'] ?? 'daily'))]]]);
        }
        if ($method === 'POST' && $p === '/api/services/todo/get_items') {
            $id = (string) ($json['entity_id'] ?? '');
            return isset(self::world()[$id]) && str_starts_with($id, 'todo.') ? $ok(['changed_states' => [], 'service_response' => [$id => ['items' => self::todoList($id)]]]) : $no(400);
        }
        if ($method === 'POST' && preg_match('#^/api/services/([a-z_]+)/([a-z_]+)$#', $p, $m)) {
            return self::service($m[1], $m[2], is_array($json) ? $json : []) ? $ok([]) : $no(400);
        }
        return $no();
    }

    public function statesParallel(array $ids, int $timeout = 6): array
    {
        $w = self::world();
        $out = [];
        foreach ($ids as $id) {
            $out[$id] = isset($w[$id]) ? ['code' => 200, 'body' => self::rest($w[$id])] : ['code' => 404, 'body' => null];
        }
        return $out;
    }

    /** pictures (entity_picture / media art / camera): the simulated home has none */
    public function image(string $picture): ?array
    {
        return null;
    }

    /** the recorder's long-term statistics (the only WebSocket use of HaService) */
    public function ws(array $commands, int $timeout = 12, int $maxBytes = 8388608): array
    {
        $w = self::world();
        $results = [];
        $meta = [];
        foreach ($commands as $c) {
            $type = $c['type'] ?? '';
            if ($type === 'recorder/get_statistics_metadata') {
                $list = [];
                foreach ((array) ($c['statistic_ids'] ?? []) as $id) {
                    $a = $w[$id]['attributes'] ?? null;
                    if ($a === null || !isset($a['state_class'])) {
                        continue;
                    }
                    $sum = in_array($a['state_class'], ['total', 'total_increasing'], true);
                    $meta[$id] = $sum;
                    $list[] = ['statistic_id' => $id, 'source' => 'recorder', 'name' => $a['friendly_name'] ?? null, 'has_sum' => $sum, 'has_mean' => !$sum,
                        'mean_type' => $sum ? 0 : 1, 'statistics_unit_of_measurement' => $a['unit_of_measurement'] ?? '', 'unit_class' => null];
                }
                $results[] = ['success' => true, 'result' => $list];
            } elseif ($type === 'recorder/statistics_during_period') {
                $out = [];
                $start = strtotime((string) ($c['start_time'] ?? '')) ?: time() - 86400;
                $end = strtotime((string) ($c['end_time'] ?? '')) ?: time();
                foreach ((array) ($c['statistic_ids'] ?? []) as $id) {
                    if (isset($w[$id]['attributes']['state_class'])) {
                        $out[$id] = self::statistics($id, $w[$id], (string) ($c['period'] ?? 'hour'), $start, $end);
                    }
                }
                $results[] = ['success' => true, 'result' => $out];
            } else {
                $results[] = ['success' => false, 'error' => ['code' => 'unknown_command']];
            }
        }
        return ['error' => null, 'results' => $results];
    }

    /* ------------------------------------------------------------------ actions */

    /** apply one Home Assistant service call to the simulated home (the action was already planned and allow-listed by HaService) */
    private static function service(string $d, string $s, array $data): bool
    {
        $id = (string) ($data['entity_id'] ?? '');
        $w = self::world();
        if ($d === 'scene' && $s === 'turn_on' && isset($w[$id]) && is_array($w[$id]['attributes']['demo_targets'] ?? null)) {
            // a demo scene: every entity it lists takes the state and attributes it names (a light switched off loses its brightness)
            $set = [];
            foreach ($w[$id]['attributes']['demo_targets'] as $eid => [$st, $at]) {
                $set[$eid] = [$st, str_starts_with($eid, 'light.') && $st === 'off' ? ['brightness' => null, 'color_mode' => null] + $at : $at];
            }
            self::change($set + [$id => [gmdate('Y-m-d\TH:i:s\Z'), []]]);
            return true;
        }
        if ($d === 'button' && $s === 'press' && str_starts_with($id, 'button.demo_')) {
            return self::demoEvent($id, $w);
        }
        if ($d === 'scene' && $s === 'turn_on' && isset($w[$id])) {
            $set = [];
            foreach ((array) ($w[$id]['attributes']['entity_id'] ?? []) as $l) {
                $set[$l] = ['on', ['brightness' => 179]];
            }
            if ($id === 'scene.good_night') {
                foreach ($w as $k => $e) {
                    if (str_starts_with($k, 'light.') && $e['state'] === 'on') {
                        $set[$k] = ['off', ['brightness' => null]];
                    }
                }
            }
            self::change($set);
            return true;
        }
        if (!isset($w[$id]) || $w[$id]['state'] === 'unavailable') {
            return false;
        }
        $e = $w[$id];
        $on = $e['state'] === 'on';
        $c = null;
        switch ($d . '.' . $s) {
            case 'light.turn_on':
                $a = ['brightness' => isset($data['brightness_pct']) ? (int) round($data['brightness_pct'] * 2.55) : ($e['attributes']['brightness'] ?? 255) ?? 255];
                $modes = (array) ($e['attributes']['supported_color_modes'] ?? []);
                if ($modes === ['onoff']) {
                    $a = [];
                } elseif (isset($data['color_temp_kelvin'])) {
                    $a += ['color_mode' => 'color_temp', 'color_temp_kelvin' => (int) $data['color_temp_kelvin'], 'hs_color' => null];
                } elseif (isset($data['hs_color'])) {
                    $a += ['color_mode' => 'hs', 'hs_color' => $data['hs_color'], 'color_temp_kelvin' => null];
                } elseif (in_array('color_temp', $modes, true) || in_array('hs', $modes, true)) {
                    $a += ['color_mode' => $e['attributes']['color_mode'] ?? 'color_temp', 'color_temp_kelvin' => $e['attributes']['color_temp_kelvin'] ?? 2700];
                } else {
                    $a += ['color_mode' => 'brightness'];
                }
                if (isset($data['effect'])) {
                    $a['effect'] = $data['effect'];
                }
                $c = ['on', $a];
                break;
            case 'light.turn_off':
                $c = ['off', ['brightness' => null, 'color_mode' => null]];
                break;
            case 'light.toggle':
                return self::service('light', $on ? 'turn_off' : 'turn_on', ['entity_id' => $id]);
            case 'switch.turn_on': case 'input_boolean.turn_on': case 'fan.turn_on': case 'media_player.turn_on':
                $c = [$d === 'media_player' ? 'idle' : 'on', $d === 'fan' ? ['percentage' => $e['attributes']['percentage'] ?: 100] : []];
                break;
            case 'switch.turn_off': case 'input_boolean.turn_off': case 'fan.turn_off': case 'media_player.turn_off':
                $c = ['off', $d === 'fan' ? ['percentage' => 0] : []];
                break;
            case 'switch.toggle': case 'input_boolean.toggle': case 'fan.toggle':
                return self::service($d, $on ? 'turn_off' : 'turn_on', ['entity_id' => $id]);
            case 'fan.set_percentage':
                $p = (int) ($data['percentage'] ?? 0);
                $c = [$p > 0 ? 'on' : 'off', ['percentage' => $p]];
                break;
            case 'fan.set_preset_mode':
                $c = ['on', ['preset_mode' => $data['preset_mode'] ?? null]];
                break;
            case 'fan.oscillate':
                $c = [null, ['oscillating' => (bool) ($data['oscillating'] ?? false)]];
                break;
            case 'climate.set_temperature':
                $a = [];
                foreach (['temperature', 'target_temp_low', 'target_temp_high'] as $k) {
                    if (isset($data[$k])) {
                        $a[$k] = (float) $data[$k];
                    }
                }
                $c = [null, $a];
                break;
            case 'climate.turn_off': $c = ['off', ['hvac_action' => 'off']]; break;
            case 'climate.turn_on':
                $modes = array_values(array_filter((array) ($e['attributes']['hvac_modes'] ?? []), static fn ($m) => $m !== 'off'));
                $c = [$modes[0] ?? 'heat', ['hvac_action' => 'idle']];
                break;
            case 'climate.set_hvac_mode':
                $mode = (string) ($data['hvac_mode'] ?? 'off');
                $cur = (float) ($e['attributes']['current_temperature'] ?? 20);
                $target = (float) ($e['attributes']['temperature'] ?? 0);
                $c = [$mode, ['hvac_action' => $mode === 'off' ? 'off' : ($target > $cur ? 'heating' : 'idle')]];
                break;
            case 'climate.set_preset_mode': case 'climate.set_fan_mode': case 'climate.set_swing_mode':
                $k = substr($s, 4);
                $c = [null, [$k => $data[$k] ?? null]];
                break;
            case 'cover.open_cover': $c = ['open', ['current_position' => 100]]; break;
            case 'cover.close_cover': $c = ['closed', ['current_position' => 0]]; break;
            case 'cover.stop_cover': $c = [null, []]; break;
            case 'cover.set_cover_position':
                $pos = (int) ($data['position'] ?? 0);
                $c = [$pos > 0 ? 'open' : 'closed', ['current_position' => $pos]];
                break;
            case 'media_player.media_play': $c = ['playing', []]; break;
            case 'media_player.media_pause': $c = ['paused', []]; break;
            case 'media_player.media_stop': $c = ['idle', []]; break;
            case 'media_player.volume_set': $c = [null, ['volume_level' => (float) ($data['volume_level'] ?? 0.3)]]; break;
            case 'media_player.volume_mute': $c = [null, ['is_volume_muted' => (bool) ($data['is_volume_muted'] ?? false)]]; break;
            case 'vacuum.start': $c = ['cleaning', []]; break;
            case 'vacuum.pause': $c = ['paused', []]; break;
            case 'vacuum.stop': $c = ['idle', []]; break;
            case 'vacuum.return_to_base': $c = ['returning', []]; break;
            case 'lock.lock': $c = ['locked', []]; break;
            case 'lock.unlock': case 'lock.open': $c = ['unlocked', []]; break;
            case 'humidifier.turn_on': $c = ['on', []]; break;
            case 'humidifier.turn_off': $c = ['off', ['action' => 'off']]; break;
            case 'humidifier.toggle': return self::service('humidifier', $on ? 'turn_off' : 'turn_on', ['entity_id' => $id]);
            case 'humidifier.set_humidity': $c = [null, ['humidity' => (int) ($data['humidity'] ?? 45)]]; break;
            case 'humidifier.set_mode': $c = [null, ['mode' => (string) ($data['mode'] ?? 'normal')]]; break;
            case 'update.install':
                // the simulated install finishes at once: the latest version becomes the installed one
                $c = ['off', ['installed_version' => $e['attributes']['latest_version'] ?? null, 'in_progress' => false]];
                break;
            case 'todo.add_item': case 'todo.update_item':
                $items = self::todoList($id);
                if ($s === 'add_item') {
                    $items[] = ['uid' => substr(md5($id . microtime()), 0, 10), 'summary' => (string) ($data['item'] ?? ''), 'status' => 'needs_action'];
                } else {
                    $hit = false;
                    foreach ($items as &$it) {
                        if ($it['uid'] === ($data['item'] ?? null) || $it['summary'] === ($data['item'] ?? null)) {
                            $it['status'] = ($data['status'] ?? '') === 'completed' ? 'completed' : 'needs_action';
                            $hit = true;
                        }
                    }
                    unset($it);
                    if (!$hit) {
                        return false;
                    }
                }
                $open = count(array_filter($items, static fn ($it) => $it['status'] !== 'completed'));
                $c = [(string) $open, ['_items' => $items]];
                break;
            case 'number.set_value': case 'input_number.set_value': $c = [(string) ($data['value'] ?? ''), []]; break;
            case 'select.select_option': case 'input_select.select_option': $c = [(string) ($data['option'] ?? ''), []]; break;
            case 'script.turn_on': case 'button.press': case 'input_button.press':
                $c = [$d === 'script' ? 'off' : gmdate('Y-m-d\TH:i:s\Z'), []];
                break;
            default:
                if (str_starts_with($s, 'alarm_')) {
                    $c = [$s === 'alarm_disarm' ? 'disarmed' : 'armed_' . substr($s, 10), []];
                    break;
                }
                return true;                                  // allowed by HaService but without a simulated effect: accepted, nothing changes
        }
        self::change([$id => $c]);
        return true;
    }

    /** the demo home's energy NOW and TODAY, from the same power curves as its history (power()): today's totals are the integral of those
        curves from midnight (5-minute steps), so power, totals, ratios and costs always agree with each other and with the charts */
    public static function demoEnergy(int $now): array
    {
        $tz = new DateTimeZone(SimHome::TZ);
        $mid = (new DateTimeImmutable('@' . $now))->setTimezone($tz)->setTime(0, 0)->getTimestamp();
        $kwh = ['solar' => 0.0, 'house' => 0.0, 'import' => 0.0, 'export' => 0.0];
        $water = 0.0; $gas = 0.0;                                            // today: litres, m³
        for ($t = $mid; $t < $now; $t += 300) {
            $dt = min(300, $now - $t) / 3600;
            foreach ($kwh as $k => $_) {
                $kwh[$k] += self::power($k, $t + 150) * $dt / 1000;
            }
            $water += self::power('water', $t + 150) * $dt * 60;
            $gas += self::power('gas', $t + 150) * $dt;
        }
        $co2 = $kwh['import'] * self::CO2_GRID + $gas * self::CO2_GAS;
        $p = static fn (string $k) => (string) round(self::power($k, $now));
        $grid = round(self::power('house', $now) - self::power('solar', $now));
        $self = $kwh['solar'] > 0 ? round(100 * ($kwh['solar'] - $kwh['export']) / $kwh['solar']) : 0;
        $suff = $kwh['house'] > 0 ? round(100 * (1 - $kwh['import'] / $kwh['house'])) : 0;
        $cost = $kwh['import'] * SimHome::PRICE_IMPORT - $kwh['export'] * SimHome::PRICE_EXPORT;
        $W = static fn (string $n) => ['friendly_name' => $n, 'unit_of_measurement' => 'W', 'device_class' => 'power', 'state_class' => 'measurement'];
        $E = static fn (string $n) => ['friendly_name' => $n, 'unit_of_measurement' => 'kWh', 'device_class' => 'energy', 'state_class' => 'total_increasing'];
        return [
            'sensor.demo_house_power' => [$p('house'), $W('Home consumption')],
            'sensor.demo_solar_power' => [$p('solar'), $W('Solar production')],
            'sensor.demo_grid_power' => [(string) $grid, $W('Grid (import + / export −)')],
            'sensor.demo_grid_import_power' => [$p('import'), $W('Grid import')],
            'sensor.demo_grid_export_power' => [$p('export'), $W('Grid export')],
            'sensor.demo_house_energy_today' => [(string) round($kwh['house'], 2), $E('Consumed today')],
            'sensor.demo_solar_energy_today' => [(string) round($kwh['solar'], 2), $E('Solar today')],
            'sensor.demo_grid_import_today' => [(string) round($kwh['import'], 2), $E('Imported today')],
            'sensor.demo_grid_export_today' => [(string) round($kwh['export'], 2), $E('Exported today')],
            'sensor.demo_self_consumption_today' => [(string) $self, ['friendly_name' => 'Solar used at home', 'unit_of_measurement' => '%', 'state_class' => 'measurement']],
            'sensor.demo_self_sufficiency_today' => [(string) $suff, ['friendly_name' => 'Self-sufficiency', 'unit_of_measurement' => '%', 'state_class' => 'measurement']],
            'sensor.demo_energy_cost_today' => [(string) round($cost, 2), ['friendly_name' => 'Electricity cost today', 'unit_of_measurement' => 'EUR', 'device_class' => 'monetary', 'state_class' => 'total']],
            // WATER and GAS: flow now and today's total, from the same daily model as their history and statistics
            'sensor.demo_water_flow' => [(string) round(self::power('water', $now), 1), ['friendly_name' => 'Water flow', 'unit_of_measurement' => 'L/min', 'device_class' => 'volume_flow_rate', 'state_class' => 'measurement']],
            'sensor.demo_water_today' => [(string) round($water / 1000, 3), ['friendly_name' => 'Water today', 'unit_of_measurement' => 'm³', 'device_class' => 'water', 'state_class' => 'total_increasing', 'litres' => (int) round($water)]],
            'sensor.demo_gas_flow' => [(string) round(self::power('gas', $now), 2), ['friendly_name' => 'Gas flow', 'unit_of_measurement' => 'm³/h', 'device_class' => 'volume_flow_rate', 'state_class' => 'measurement']],
            'sensor.demo_gas_today' => [(string) round($gas, 2), ['friendly_name' => 'Gas today', 'unit_of_measurement' => 'm³', 'device_class' => 'gas', 'state_class' => 'total_increasing']],
            // CO₂ of today's imported electricity and gas — an ESTIMATE with stated factors (no savings are claimed)
            'sensor.demo_co2_today' => [(string) round($co2, 1), ['friendly_name' => 'CO₂ today (estimate)', 'unit_of_measurement' => 'kg', 'state_class' => 'total_increasing', 'icon' => 'mdi:molecule-co2',
                'assumption' => sprintf('grid electricity %.2f kg/kWh · natural gas %.2f kg/m³ · solar 0', self::CO2_GRID, self::CO2_GAS)]],
            'sensor.demo_gas_cost_today' => [(string) round($gas * SimHome::PRICE_GAS * 10.5, 2), ['friendly_name' => 'Gas cost today', 'unit_of_measurement' => 'EUR', 'device_class' => 'monetary', 'state_class' => 'total']],
        ];
    }

    /** a DEMO EVENT button of the demo home: simulated motion / a door opening (an armed alarm is then triggered), clearing them,
        or resetting the whole demo home to its initial state. Only this simulated home changes. */
    private static function demoEvent(string $id, array $w): bool
    {
        $alarm = $w['alarm_control_panel.demo_alarm']['state'] ?? 'disarmed';
        $armed = str_starts_with($alarm, 'armed_');
        $now = [gmdate('Y-m-d\TH:i:s\Z'), []];
        switch ($id) {
            case 'button.demo_simulate_motion':
                self::change(['binary_sensor.demo_garden_motion' => ['on', []], $id => $now] + ($alarm === 'armed_away' ? ['alarm_control_panel.demo_alarm' => ['triggered', []]] : []));
                return true;
            case 'button.demo_simulate_door':
                self::change(['binary_sensor.demo_back_door' => ['on', []], 'lock.demo_back_door' => ['unlocked', []], $id => $now]
                    + ($armed ? ['alarm_control_panel.demo_alarm' => ['triggered', []]] : []));
                return true;
            case 'button.demo_clear_events':
                self::change(['binary_sensor.demo_garden_motion' => ['off', []], 'binary_sensor.demo_back_door' => ['off', []], 'lock.demo_back_door' => ['locked', []], $id => $now]
                    + ($alarm === 'triggered' ? ['alarm_control_panel.demo_alarm' => ['disarmed', []]] : []));
                return true;
            case 'button.demo_reset':
                self::reset('demo_');
                self::change([$id => $now]);              // the reset itself is a change (a notification inbox following it resets too)
                return true;
        }
        return false;
    }

    /** forget every simulated change of the entities whose object id starts with $prefix (they return to their initial state) */
    private static function reset(string $prefix): void
    {
        $f = self::stateFile();
        if ($f === null || !is_file($f)) {
            return;
        }
        $fh = @fopen($f, 'c+');
        if ($fh === false) {
            return;
        }
        flock($fh, LOCK_EX);
        $cur = json_decode((string) stream_get_contents($fh), true);
        $cur = array_filter(is_array($cur) ? $cur : [], static fn ($k) => !str_contains((string) $k, '.' . $prefix), ARRAY_FILTER_USE_KEY);
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($cur, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        flock($fh, LOCK_UN);
        fclose($fh);
    }

    /* ------------------------------------------------------------------ history and statistics (deterministic, plausible) */

    /** hour of the day in the home's time zone (fractional) */
    private static function hourOf(int $t): float
    {
        $d = (new DateTimeImmutable('@' . $t))->setTimezone(new DateTimeZone(SimHome::TZ));
        return (int) $d->format('G') + (int) $d->format('i') / 60;
    }

    private static function noise(string $id, int $t): float
    {
        return (crc32($id . '|' . intdiv($t, 600)) % 1000) / 1000 - 0.5;   // −0.5 … 0.5, steady within ten minutes
    }

    /** solar / house power (W) at a moment: a daylight bell and a morning / evening household profile */
    private static function power(string $kind, int $t): float
    {
        $h = self::hourOf($t);
        $solar = max(0.0, sin(M_PI * ($h - 7.6) / 9.5)) * 2600;
        $house = 260 + 900 * exp(-(($h - 7.5) ** 2) / 1.2) + 1400 * exp(-(($h - 19) ** 2) / 2.5) + 120 * max(0, sin(M_PI * ($h - 11) / 4));
        // water (L/min): showers in the morning, cooking and dishes in the evening; gas (m³/h): heating, more at night and in the morning
        $water = 0.15 + 9 * exp(-(($h - 7.2) ** 2) / 0.25) + 4 * exp(-(($h - 12.5) ** 2) / 0.3) + 6 * exp(-(($h - 19.5) ** 2) / 0.4) + 3 * exp(-(($h - 21.5) ** 2) / 0.2);
        $gas = 0.10 + 0.32 * exp(-(($h - 6.5) ** 2) / 2.0) + 0.24 * exp(-(($h - 19) ** 2) / 4.0) + ($h < 6 || $h > 22 ? 0.06 : 0);
        return match ($kind) {
            'solar' => $solar,
            'house' => $house,
            'export' => max(0.0, $solar - $house),
            'import' => max(0.0, $house - $solar),
            'water' => $water,
            'gas' => $gas,
            default => 0.0,
        };
    }

    private static function history(array $ids, string $startIso, string $endIso): array
    {
        $start = strtotime(rawurldecode($startIso)) ?: time() - 86400;
        $end = strtotime(rawurldecode($endIso)) ?: time();
        $w = self::world();
        $step = max(300, intdiv($end - $start, 288));
        $out = [];
        foreach ($ids as $id) {
            if (!isset($w[$id])) {
                continue;
            }
            $e = $w[$id];
            $rows = [];
            $num = is_numeric($e['state']);
            $kind = ['sensor.solar_power' => 'solar', 'sensor.house_power' => 'house', 'sensor.grid_export_power' => 'export', 'sensor.grid_import_power' => 'import',
                'sensor.demo_solar_power' => 'solar', 'sensor.demo_house_power' => 'house', 'sensor.demo_grid_export_power' => 'export', 'sensor.demo_grid_import_power' => 'import',
                'sensor.demo_water_flow' => 'water', 'sensor.demo_gas_flow' => 'gas'][$id] ?? null;
            $demoTotal = isset(self::DEMO_TOTALS[$id]);
            for ($t = $start; $t <= $end; $t += $step) {
                if ($kind !== null) {
                    $v = in_array($kind, ['water', 'gas'], true) ? round(self::power($kind, $t), 2) : round(self::power($kind, $t));
                } elseif ($id === 'sensor.grid_power' || $id === 'sensor.demo_grid_power') {
                    $v = round(self::power('import', $t) - self::power('export', $t));
                } elseif ($demoTotal) {
                    // the demo home's "today" totals: what demoEnergy() reports at that moment (they restart at midnight)
                    $v = self::demoEnergy(min($t, time()))[$id][0];
                } elseif ($num) {
                    $base = (float) $e['state'];
                    $amp = str_contains((string) ($e['attributes']['device_class'] ?? ''), 'temperature') ? 0.8 : max(0.02 * abs($base), 0.5);
                    $v = round($base + $amp * sin(2 * M_PI * (self::hourOf($t) - 15) / 24) + $amp * 0.3 * self::noise($id, $t), 2);
                    if (($e['attributes']['state_class'] ?? '') === 'total_increasing') {
                        $v = round(max(0, $base * ($t - $start) / max(1, $end - $start)), 3);
                    }
                } else {
                    $v = $e['state'];
                }
                $iso = gmdate('Y-m-d\TH:i:s', $t) . '+00:00';
                $rows[] = $rows === [] ? ['entity_id' => $id, 'state' => (string) $v, 'last_changed' => $iso] : ['state' => (string) $v, 'last_changed' => $iso];
            }
            $out[] = $rows;
        }
        return $out;
    }

    /** one statistics row per period between start and end: change (sum entities) or mean / min / max */
    private static function statistics(string $id, array $e, string $period, int $start, int $end): array
    {
        $tz = new DateTimeZone(SimHome::TZ);
        $sum = in_array($e['attributes']['state_class'] ?? '', ['total', 'total_increasing'], true);
        $daily = static function (int $dayStart) use ($id): float {
            $f = 0.75 + (crc32($id . gmdate('Ymd', $dayStart)) % 500) / 1000;   // 0.75 … 1.25: one day differs from the next
            $kind = self::energyKind($id);
            return match ($kind) {
                'solar' => 10.9 * $f, 'import' => 3.04 * $f, 'export' => 7.30 * $f, 'house' => 6.64 * $f,
                'gas' => 2.6 * $f, 'water' => 0.38 * $f, default => 1.0 * $f,
            };
        };
        // the DEMO HOME's totals (sensor.demo_*_today): every day, home = solar − exported + imported; today = the live cards' values
        $demo = $sum && isset(self::DEMO_TOTALS[$id]) ? self::DEMO_TOTALS[$id] : null;
        $rows = [];
        $cursor = (new DateTimeImmutable('@' . $start))->setTimezone($tz);
        $cursor = match ($period) {
            'hour' => $cursor->setTime((int) $cursor->format('G'), 0),
            'day' => $cursor->setTime(0, 0),
            'week' => $cursor->modify('monday this week')->setTime(0, 0),
            default => $cursor->modify('first day of this month')->setTime(0, 0),
        };
        $stepOf = ['hour' => '+1 hour', 'day' => '+1 day', 'week' => '+1 week', 'month' => '+1 month'];
        $todayStart = (new DateTimeImmutable('today', $tz))->getTimestamp();
        for ($guard = 0; $cursor->getTimestamp() < $end && $guard < 400; $guard++) {
            $next = $cursor->modify($stepOf[$period] ?? '+1 month');
            $a = $cursor->getTimestamp();
            $b = min($next->getTimestamp(), $end);
            $row = ['start' => $a * 1000, 'end' => $next->getTimestamp() * 1000];
            if ($demo !== null) {
                $v = 0.0;
                if ($period === 'hour') {
                    $v = $a >= time() ? 0.0 : self::demoHour($demo, $a);
                } else {
                    for ($d = $a; $d < $b; $d += 86400) {
                        $v += self::demoDay($demo, $d);
                    }
                }
                $row['change'] = round($v, 3);
            } elseif ($sum) {
                if ($period === 'hour') {
                    $kind = self::energyKind($id);
                    $prof = in_array($kind, ['solar', 'import', 'export', 'house'], true) ? self::power($kind, $a + 1800) / 1000 : 0.0;
                    if ($kind === 'water') {
                        $h = self::hourOf($a);
                        $prof = in_array((int) $h, [7, 8, 12, 19, 21], true) ? 0.06 + 0.03 * self::noise($id, $a) : 0.004;
                    }
                    $scale = ['solar' => 10.9 / 15.9, 'import' => 3.04 / 6.3, 'export' => 7.30 / 13.6, 'house' => 6.64 / 13.1][$kind] ?? 1.0;
                    $v = $a >= $todayStart && $kind === 'gas' ? 0.0 : $prof * $scale;
                } else {
                    $v = 0.0;
                    for ($d = $a; $d < $b; $d += 86400) {
                        $v += ($d >= $todayStart && self::energyKind($id) === 'gas') ? 0.0 : $daily($d) * ($d >= $todayStart ? 0.85 : 1.0);
                    }
                }
                $row['change'] = round($v, 3);
            } else {
                $base = (float) $e['state'];
                $row += ['mean' => round($base + 0.6 * self::noise($id, $a), 2), 'min' => round($base - 1.1, 2), 'max' => round($base + 1.3, 2)];
            }
            $rows[] = $row;
            $cursor = $next;
        }
        return $rows;
    }

    /** one day of the demo home: [solar factor (a sunny or a cloudy day), household factor] — the same for every request */
    private static function dayFactors(int $t): array
    {
        $day = (new DateTimeImmutable('@' . $t))->setTimezone(new DateTimeZone(SimHome::TZ))->format('Ymd');
        $today = (new DateTimeImmutable('now', new DateTimeZone(SimHome::TZ)))->format('Ymd');
        if ($day === $today) {
            return [1.0, 1.0];                       // today: exactly the live sensors
        }
        return [0.35 + (crc32('sun' . $day) % 900) / 1000, 0.85 + (crc32('use' . $day) % 350) / 1000];
    }

    private static function demoPower(string $kind, int $t, array $f): float
    {
        $solar = self::power('solar', $t) * $f[0];
        $house = self::power('house', $t) * $f[1];
        return match ($kind) {
            'solar' => $solar, 'house' => $house, 'export' => max(0.0, $solar - $house), 'import' => max(0.0, $house - $solar),
            'water' => self::power('water', $t) * $f[1], 'gas' => self::power('gas', $t) * (0.7 + 0.6 * ($f[1] - 0.85) / 0.35), default => 0.0,
        };
    }

    /** one HOUR of a demo total (kWh · m³ · kg CO₂), starting at $a */
    private static function demoHour(string $kind, int $a): float
    {
        $f = self::dayFactors($a);
        return match ($kind) {
            'water' => self::demoPower('water', $a + 1800, $f) * 60 / 1000,
            'gas' => self::demoPower('gas', $a + 1800, $f),
            'co2' => self::demoPower('import', $a + 1800, $f) / 1000 * self::CO2_GRID + self::demoPower('gas', $a + 1800, $f) * self::CO2_GAS,
            default => self::demoPower($kind, $a + 1800, $f) / 1000,
        };
    }

    /** one DAY of a demo total — kWh (solar, house, import, export), m³ (water, gas), kg CO₂ — today: up to now, equal to the "today" sensors */
    private static function demoDay(string $kind, int $dayStart): float
    {
        static $cache = [];
        $tz = new DateTimeZone(SimHome::TZ);
        $mid = (new DateTimeImmutable('@' . $dayStart))->setTimezone($tz)->setTime(0, 0)->getTimestamp();
        if ($mid > time()) {
            return 0.0;
        }
        $key = "$kind|$mid";
        if (!isset($cache[$key])) {
            $todayMid = (new DateTimeImmutable('now', $tz))->setTime(0, 0)->getTimestamp();
            if ($mid === $todayMid) {
                $id = array_search($kind, self::DEMO_TOTALS, true);
                $cache[$key] = (float) self::demoEnergy(time())[$id][0];
            } elseif ($kind === 'co2') {
                $cache[$key] = self::demoDay('import', $mid) * self::CO2_GRID + self::demoDay('gas', $mid) * self::CO2_GAS;
            } else {
                $f = self::dayFactors($mid + 43200);
                $v = 0.0;
                for ($t = $mid; $t < $mid + 86400; $t += 900) {
                    $p = self::demoPower($kind, $t + 450, $f);
                    $v += match ($kind) { 'water' => $p * 15 / 1000, 'gas' => $p * 0.25, default => $p * 0.25 / 1000 };
                }
                $cache[$key] = $v;
            }
        }
        return $cache[$key];
    }

    private static function energyKind(string $id): string
    {
        return match (true) {
            str_contains($id, 'solar') => 'solar',
            str_contains($id, 'import') => 'import',
            str_contains($id, 'export') => 'export',
            str_contains($id, 'house') => 'house',
            str_contains($id, 'gas') => 'gas',
            str_contains($id, 'water') => 'water',
            default => 'other',
        };
    }
}
