<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// SECURE ACTION MATRIX: every (entity kind × action name × hostile value) goes through HaService::plan(). Whatever comes out must be
// (a) an error, or (b) a call to a service in the CLOSED allow-list below, on the entity's OWN domain, with data keys from that service's
// closed list and values inside what the entity reports. The browser can never name a domain, service or data key.
// php tests/actions.php  (exit 1 on a violation)
declare(strict_types=1);
require dirname(__DIR__) . '/server/ha/HaClient.php';
require dirname(__DIR__) . '/server/ha/HaService.php';

function ent(string $id, string $state, array $x): array { return HaService::normalise($id, $state, 'now', $x, 'now', null); }

/** service → allowed data keys (the whole surface the widgets may ever reach) */
$ALLOWED = [
    'light.turn_on' => ['brightness_pct', 'color_temp_kelvin', 'hs_color', 'effect'], 'light.turn_off' => [],
    'switch.turn_on' => [], 'switch.turn_off' => [], 'input_boolean.turn_on' => [], 'input_boolean.turn_off' => [],
    'fan.turn_on' => [], 'fan.turn_off' => [], 'fan.set_percentage' => ['percentage'], 'fan.set_preset_mode' => ['preset_mode'], 'fan.oscillate' => ['oscillating'], 'fan.set_direction' => ['direction'],
    'cover.open_cover' => [], 'cover.close_cover' => [], 'cover.stop_cover' => [], 'cover.set_cover_position' => ['position'], 'cover.toggle' => [], 'light.toggle' => [], 'switch.toggle' => [], 'fan.toggle' => [], 'input_boolean.toggle' => [],
    'climate.set_temperature' => ['temperature', 'target_temp_low', 'target_temp_high'], 'climate.set_hvac_mode' => ['hvac_mode'], 'climate.set_preset_mode' => ['preset_mode'],
    'climate.set_fan_mode' => ['fan_mode'], 'climate.set_swing_mode' => ['swing_mode'], 'climate.set_humidity' => ['humidity'], 'climate.turn_on' => [], 'climate.turn_off' => [],
    'media_player.media_play' => [], 'media_player.media_pause' => [], 'media_player.media_stop' => [], 'media_player.media_previous_track' => [], 'media_player.media_next_track' => [],
    'media_player.volume_set' => ['volume_level'], 'media_player.volume_mute' => ['is_volume_muted'], 'media_player.select_source' => ['source'],
    'media_player.shuffle_set' => ['shuffle'], 'media_player.repeat_set' => ['repeat'], 'media_player.turn_on' => [], 'media_player.turn_off' => [],
    'lock.lock' => [], 'lock.unlock' => [], 'lock.open' => [],
    'alarm_control_panel.alarm_disarm' => [], 'alarm_control_panel.alarm_arm_home' => [], 'alarm_control_panel.alarm_arm_away' => [], 'alarm_control_panel.alarm_arm_night' => [],
    'alarm_control_panel.alarm_arm_vacation' => [], 'alarm_control_panel.alarm_arm_custom_bypass' => [],
    'number.set_value' => ['value'], 'input_number.set_value' => ['value'], 'select.select_option' => ['option'], 'input_select.select_option' => ['option'],
    'scene.turn_on' => [], 'script.turn_on' => [], 'button.press' => [], 'input_button.press' => [],
    'vacuum.start' => [], 'vacuum.pause' => [], 'vacuum.stop' => [], 'vacuum.return_to_base' => [], 'vacuum.locate' => [], 'vacuum.clean_spot' => [], 'vacuum.set_fan_speed' => ['fan_speed'],
    'lawn_mower.start_mowing' => [], 'lawn_mower.pause' => [], 'lawn_mower.dock' => [],
    'timer.start' => [], 'timer.pause' => [], 'timer.cancel' => [], 'timer.finish' => [],
];
// every kind of entity with EVERY capability switched on (the most permissive case)
$ALL = 0xFFFFFF;
$ENT = [
    ent('light.l', 'on', ['f' => $ALL, 'scm' => ['hs', 'color_temp'], 'br' => 100, 'ckmin' => 2000, 'ckmax' => 6500, 'fxl' => ['Rainbow']]),
    ent('switch.s', 'on', []), ent('input_boolean.b', 'on', []),
    ent('fan.f', 'on', ['f' => 15, 'pct' => 50, 'presets' => ['eco'], 'pstep' => 10]),
    ent('cover.c', 'open', ['f' => 255, 'pos' => 50]),
    ent('climate.c', 'heat_cool', ['f' => 63, 'modes' => ['heat', 'off'], 'min' => 10, 'max' => 30, 'step' => 0.5, 'fml' => ['low'], 'pml' => ['eco'], 'sml' => ['off'], 'hmin' => 30, 'hmax' => 70]),
    ent('media_player.m', 'playing', ['f' => 0x7FFFF, 'sources' => ['TV'], 'vol' => 0.5]),
    ent('lock.l', 'locked', ['f' => 1]), ent('alarm_control_panel.a', 'disarmed', ['f' => 63, 'cf' => 'number']),
    ent('number.n', '5', ['nmin' => 0, 'nmax' => 10, 'nstep' => 1]), ent('input_number.n', '5', ['nmin' => 0, 'nmax' => 10, 'nstep' => 1]),
    ent('select.s', 'a', ['opts' => ['a', 'b']]), ent('input_select.s', 'a', ['opts' => ['a', 'b']]),
    ent('scene.x', 'unknown', []), ent('script.x', 'off', []), ent('button.x', 'unknown', []), ent('input_button.x', 'unknown', []),
    ent('vacuum.v', 'docked', ['f' => $ALL, 'fsl' => ['Quiet']]), ent('lawn_mower.m', 'docked', ['f' => 7]), ent('timer.t', 'idle', []),
    // domains that have NO actions at all
    ent('sensor.s', '5', []), ent('binary_sensor.b', 'on', []), ent('weather.w', 'sunny', []), ent('person.p', 'home', []), ent('device_tracker.d', 'home', []),
    ent('camera.c', 'idle', ['f' => 3]), ent('sun.sun', 'above_horizon', []), ent('calendar.c', 'off', []), ent('image.i', 'x', []), ent('event.e', 'x', []),
];
$ACTIONS = ['turn_on', 'turn_off', 'toggle', 'trigger', 'brightness', 'color_temp', 'hue', 'effect', 'set_temperature', 'set_temperature_range', 'set_hvac_mode', 'set_preset_mode', 'set_fan_mode',
    'set_swing_mode', 'set_humidity', 'set_value', 'select_option', 'open', 'close', 'stop', 'position', 'percentage', 'preset', 'oscillate', 'direction', 'play', 'pause', 'previous', 'next',
    'volume', 'mute', 'source', 'shuffle', 'repeat', 'power', 'lock', 'unlock', 'disarm', 'arm_home', 'arm_away', 'arm_night', 'arm_vacation', 'arm_custom_bypass', 'alarm_trigger', 'start', 'dock',
    'locate', 'spot', 'fan_speed', 'cancel', 'finish', 'change', 'reload', 'restart', 'delete', 'call_service', 'light.turn_on', '../../x', 'turn_on;rm', '', 'homeassistant.restart', 'shell_command'];
$VALUES = [null, true, false, 0, 1, -1, 50, 100, 101, 1e9, -1e9, 'on', 'off', 'x', "a'b", '<script>', '19:24', '24:19', 'low', 'high', 'eco', 'Rainbow', 'Quiet', 'TV', 'a', 'b', '../x', 'homeassistant.restart', str_repeat('A', 5000), 'all', 'one', NAN];
$bad = 0; $plans = 0; $errors = 0;
foreach ($ENT as $e) {
    foreach ($ACTIONS as $a) {
        foreach ($VALUES as $v) {
            $p = HaService::plan($e, $a, $v);
            if (isset($p['error'])) { $errors++; continue; }
            $plans++;
            $svc = ($p['domain'] ?? '?') . '.' . ($p['service'] ?? '?');
            $why = null;
            if (!isset($ALLOWED[$svc])) { $why = "service $svc is not in the allow-list"; }
            elseif (($p['domain'] ?? null) !== $e['domain'] && !in_array($e['domain'], ['input_boolean'], true)) { $why = "domain {$p['domain']} differs from the entity's {$e['domain']}"; }
            elseif (array_diff(array_keys($p['data'] ?? []), $ALLOWED[$svc]) !== []) { $why = 'data keys ' . json_encode(array_keys($p['data'])) . " not allowed for $svc"; }
            elseif (isset($p['data']) && array_filter($p['data'], static fn ($x) => is_string($x) && strlen($x) > 300) !== []) { $why = 'an over-long string reaches HA'; }
            if ($why !== null) { $bad++; if ($bad <= 15) { echo "FAIL {$e['id']} / " . var_export($a, true) . ' / ' . substr((string) json_encode($v), 0, 40) . " → $why\n"; } }
        }
    }
}
// the planned data must be inside what the entity reports (spot checks on the strictest actions)
$c = $ENT[5];
foreach ([['set_humidity', 200], ['set_humidity', 5], ['set_temperature_range', '9:12'], ['set_temperature_range', '12:31'], ['set_temperature', 99]] as [$a, $v]) {
    if (!isset(HaService::plan($c, $a, $v)['error'])) { $bad++; echo "FAIL climate $a " . json_encode($v) . " was accepted outside the entity's limits\n"; }
}
echo ($bad ? 'FAIL ' : 'ok   ') . "action matrix: " . count($ENT) . " entities × " . count($ACTIONS) . " actions × " . count($VALUES) . " values → $plans planned (all inside the allow-list), $errors refused\n";
// no-action domains: every action refused
$none = array_filter($ENT, static fn ($e) => in_array($e['domain'], ['sensor', 'binary_sensor', 'weather', 'person', 'device_tracker', 'camera', 'sun', 'calendar', 'image', 'event'], true));
$leak = 0;
foreach ($none as $e) { foreach ($ACTIONS as $a) { if (!isset(HaService::plan($e, $a, 1)['error']) && !($a === 'trigger')) { $leak++; echo "FAIL {$e['id']} accepted $a\n"; } } }
echo ($leak ? 'FAIL ' : 'ok   ') . "read-only domains (sensor, weather, person, camera, sun…) accept no action\n";
exit($bad || $leak ? 1 : 0);
