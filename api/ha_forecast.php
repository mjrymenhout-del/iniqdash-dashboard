<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * GET api/ha_forecast.php?entity=weather.<id>&type=daily|hourly|twice_daily
 *   → { ok, connected, error, entity, type, supported: [type…], units: { temperature, precipitation, wind_speed },
 *       forecast: [{ t, condition?, temperature?, templow?, precipitation?, precipitation_probability?, wind_speed?, wind_bearing?,
 *                    humidity?, is_daytime? }…], refresh }
 * Read-only forecast of ONE weather entity through Home Assistant's weather.get_forecasts service (server/ha/HaService::forecast)
 * — ONE path shared by the Weather widget and Entity Details. Signed-in session (gate.php); entity and type are validated on the
 * server and a type the entity does not support is refused (error 'type_not_supported'), never substituted.
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$ha = iq_ha();
if ($ha === null) {
    iq_json(['ok' => true, 'configured' => false, 'connected' => false, 'error' => 'not_configured', 'forecast' => []]);
}
$id = is_string($_GET['entity'] ?? null) ? $_GET['entity'] : '';
$type = is_string($_GET['type'] ?? null) ? $_GET['type'] : 'daily';
$r = $ha->forecast($id, $type);
$status = (int) ($r['status'] ?? 200);
unset($r['status']);
if ($r['error'] !== null && !in_array($r['error'], ['bad_entity', 'bad_type'], true)) {
    $status = 200;                // HA unreachable / not supported / refused: reported in the JSON, the widget says so
}
iq_json(['ok' => $r['error'] === null, 'configured' => true] + $r, $status);
