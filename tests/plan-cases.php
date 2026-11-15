<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// ROBOT
$vac = ent('vacuum.rocky', 'docked', ['f' => 8192 | 4 | 8 | 16 | 32 | 512, 'bat' => 77, 'fs' => 'Quiet', 'fsl' => ['Quiet', 'Turbo']]);
expect_plan('vacuum start', $vac, 'start', null, 'vacuum.start');
expect_plan('vacuum dock', $vac, 'dock', null, 'vacuum.return_to_base');
expect_plan('vacuum locate', $vac, 'locate', null, 'vacuum.locate');
expect_plan('vacuum spot (not supported)', $vac, 'spot', null, null, 'not_supported');
expect_plan('vacuum fan speed', $vac, 'fan_speed', 'Turbo', 'vacuum.set_fan_speed');
expect_plan('vacuum fan speed not in list', $vac, 'fan_speed', 'Warp', null, 'not_supported');
expect_plan('vacuum unknown action', $vac, 'explode', null, null, 'action_not_allowed');
$mow = ent('lawn_mower.mo', 'mowing', ['f' => 1 | 2 | 4]);
expect_plan('mower start', $mow, 'start', null, 'lawn_mower.start_mowing');
expect_plan('mower pause', $mow, 'pause', null, 'lawn_mower.pause');
expect_plan('mower dock', $mow, 'dock', null, 'lawn_mower.dock');
expect_plan('mower stop (no such)', $mow, 'stop', null, null, 'action_not_allowed');
$mow2 = ent('lawn_mower.m2', 'docked', ['f' => 4]);
expect_plan('mower without start feature', $mow2, 'start', null, null, 'not_supported');

// CLIMATE
$clim = ent('climate.hall', 'heat', ['f' => 1 | 8 | 16, 'modes' => ['heat', 'off'], 'fml' => ['low', 'high'], 'pml' => ['eco', 'comfort'], 'min' => 5, 'max' => 30]);
expect_plan('climate preset', $clim, 'set_preset_mode', 'eco', 'climate.set_preset_mode');
expect_plan('climate preset not in list', $clim, 'set_preset_mode', 'boost', null, 'not_supported');
expect_plan('climate fan mode', $clim, 'set_fan_mode', 'high', 'climate.set_fan_mode');
$clim2 = ent('climate.nofan', 'heat', ['f' => 1, 'modes' => ['heat'], 'fml' => ['low']]);
expect_plan('climate fan mode without the feature bit', $clim2, 'set_fan_mode', 'low', null, 'not_supported');

// LIGHT
$li = ent('light.l', 'on', ['f' => 0, 'scm' => ['color_temp', 'hs'], 'br' => 200, 'ckmin' => 2000, 'ckmax' => 6500, 'hs' => [30.2, 80]]);
expect_plan('light colour temperature', $li, 'color_temp', 3000, 'light.turn_on');
expect_plan('light colour temperature below range', $li, 'color_temp', 1500, null, 'out_of_range');
expect_plan('light hue', $li, 'hue', 120, 'light.turn_on');
$lw = ent('light.w', 'on', ['f' => 0, 'scm' => ['brightness'], 'br' => 100]);
expect_plan('light without colour temp', $lw, 'color_temp', 3000, null, 'not_supported');
expect_plan('light without colour', $lw, 'hue', 120, null, 'not_supported');
$lr = ent('light.r', 'on', ['f' => 0, 'scm' => ['color_temp'], 'br' => 100]);
expect_plan('colour temp without a reported range', $lr, 'color_temp', 3000, null, 'not_supported');

// COVER
$cv = ent('cover.gate', 'closed', ['f' => 1 | 2 | 8, 'dc' => 'gate']);
expect_plan('cover open', $cv, 'open', null, 'cover.open_cover');
expect_plan('cover stop', $cv, 'stop', null, 'cover.stop_cover');
expect_plan('cover position without the feature', $cv, 'position', 50, null, 'not_supported');
$cp = ent('cover.blind', 'open', ['f' => 1 | 2 | 4, 'pos' => 40]);
expect_plan('cover position', $cp, 'position', 50, 'cover.set_cover_position');
expect_plan('cover position out of range', $cp, 'position', 150, null, 'out_of_range');
expect_plan('cover stop not supported', $cp, 'stop', null, null, 'not_supported');

// MEDIA
$mp = ent('media_player.k', 'playing', ['f' => 1 | 4 | 16 | 32 | 16384 | 32768 | 262144 | 128 | 256, 'vol' => 0.4]);
expect_plan('media shuffle', $mp, 'shuffle', true, 'media_player.shuffle_set');
expect_plan('media repeat one', $mp, 'repeat', 'one', 'media_player.repeat_set');
expect_plan('media repeat bad value', $mp, 'repeat', 'sometimes', null, 'not_supported');
expect_plan('media power off', $mp, 'power', false, 'media_player.turn_off');
$mn = ent('media_player.n', 'playing', ['f' => 1]);
expect_plan('media shuffle without the feature', $mn, 'shuffle', true, null, 'not_supported');
expect_plan('media power without the feature', $mn, 'power', true, null, 'not_supported');

// TIMER
$tm = ent('timer.t', 'active', ['dur' => '0:05:00', 'rem' => null, 'fin' => '2026-10-23T12:10:00+00:00']);
expect_plan('timer start', $tm, 'start', null, 'timer.start');
expect_plan('timer cancel', $tm, 'cancel', null, 'timer.cancel');
expect_plan('timer change (not offered)', $tm, 'change', 60, null, 'action_not_allowed');
global $fail;
$ok = $tm['attrs']['duration'] === 300.0 && $tm['attrs']['remaining'] === null && $tm['attrs']['finishes_at'] !== null;
echo ($ok ? 'ok   ' : 'FAIL ') . "timer attributes parsed\n"; if (!$ok) { $fail++; }
$ok = HaService::hms('1 day, 0:00:30') === 86430.0 && HaService::hms('0:00:07.5') === 7.5 && HaService::hms('soon') === null;
echo ($ok ? 'ok   ' : 'FAIL ') . "hms parser\n"; if (!$ok) { $fail++; }

// PERSON / DEVICE TRACKER: only a fixed source type and a battery are passed on — never coordinates
$dt = ent('device_tracker.phone', 'home', ['stt' => 'gps', 'bat' => 64, 'lat' => 52.1, 'gps' => 10]);
$ok = $dt['attrs']['source_type'] === 'gps' && $dt['attrs']['battery'] === 64 && !isset($dt['attrs']['latitude']) && strpos(json_encode($dt), '52.1') === false;
echo ($ok ? 'ok   ' : 'FAIL ') . "device_tracker: source type + battery only, no coordinates\n"; if (!$ok) { $fail++; }
$dt2 = ent('device_tracker.x', 'not_home', ['stt' => 'weird<script>', 'bat' => 400]);
$ok = $dt2['attrs']['source_type'] === null && $dt2['attrs']['battery'] === null;
echo ($ok ? 'ok   ' : 'FAIL ') . "device_tracker: unknown source type / absurd battery dropped\n"; if (!$ok) { $fail++; }

// SUN
$sun = ent('sun.sun', 'above_horizon', ['el' => 33.4, 'az' => 191.2, 'ri' => false, 'ns' => '2026-10-23T16:30:00+00:00', 'nr' => '2026-10-24T06:10:00+00:00', 'nd' => '2026-10-24T05:40:00+00:00']);
$ok = $sun['attrs']['azimuth'] === 191.2 && $sun['attrs']['elevation'] === 33.4 && $sun['attrs']['next_dawn'] !== null && $sun['attrs']['next_dusk'] === null;
echo ($ok ? 'ok   ' : 'FAIL ') . "sun: azimuth, elevation and next events as reported\n"; if (!$ok) { $fail++; }

// CAPABILITY COMPLETION: light effects, climate swing / humidity / range
$lf = ent('light.fx', 'on', ['f' => 4, 'scm' => ['hs'], 'br' => 100, 'fxl' => ['Rainbow', 'Pulse']]);
expect_plan('light effect from the list', $lf, 'effect', 'Pulse', 'light.turn_on');
expect_plan('light effect not in the list', $lf, 'effect', 'Disco', null, 'not_supported');
expect_plan('light effect: bad value type', $lf, 'effect', ['x'], null, 'not_supported');
expect_plan('light effect without the feature bit', ent('light.nf', 'on', ['f' => 0, 'scm' => ['hs'], 'fxl' => ['Rainbow']]), 'effect', 'Rainbow', null, 'not_supported');
expect_plan('light effect: feature bit without a list', ent('light.nl', 'on', ['f' => 4, 'scm' => ['hs']]), 'effect', 'Rainbow', null, 'not_supported');
$cl = ent('climate.c', 'heat_cool', ['f' => 2 | 4 | 32, 'modes' => ['heat_cool', 'off'], 'min' => 10, 'max' => 30, 'step' => 0.5, 'sml' => ['off', 'vertical'], 'hmin' => 30, 'hmax' => 70, 'thum' => 50, 'tlo' => 19, 'thi' => 24]);
expect_plan('climate swing mode', $cl, 'set_swing_mode', 'vertical', 'climate.set_swing_mode');
expect_plan('climate swing mode not listed', $cl, 'set_swing_mode', 'sideways', null, 'not_supported');
expect_plan('climate swing without the bit', ent('climate.s', 'heat', ['f' => 1, 'sml' => ['off']]), 'set_swing_mode', 'off', null, 'not_supported');
expect_plan('climate humidity in range', $cl, 'set_humidity', 55, 'climate.set_humidity');
expect_plan('climate humidity out of range', $cl, 'set_humidity', 80, null, 'out_of_range');
expect_plan('climate humidity without a reported range', ent('climate.h', 'heat', ['f' => 4, 'thum' => 40]), 'set_humidity', 50, null, 'not_supported');
expect_plan('climate range ok', $cl, 'set_temperature_range', '19:24', 'climate.set_temperature');
expect_plan('climate range low >= high', $cl, 'set_temperature_range', '24:19', null, 'out_of_range');
expect_plan('climate range equal', $cl, 'set_temperature_range', '20:20', null, 'out_of_range');
expect_plan('climate range below min', $cl, 'set_temperature_range', '5:20', null, 'out_of_range');
expect_plan('climate range above max', $cl, 'set_temperature_range', '20:35', null, 'out_of_range');
expect_plan('climate range malformed', $cl, 'set_temperature_range', '19;24', null, 'bad_value');
expect_plan('climate range not supported', ent('climate.n', 'heat', ['f' => 1, 'min' => 5, 'max' => 30]), 'set_temperature_range', '19:24', null, 'not_supported');
$p = HaService::plan($cl, 'set_temperature_range', '19.2:24.4');
$ok = ($p['data']['target_temp_low'] ?? null) === 19.0 && ($p['data']['target_temp_high'] ?? null) === 24.5;
echo ($ok ? 'ok   ' : 'FAIL ') . "climate range snaps to the entity's step\n"; if (!$ok) { $fail++; }
