<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * GET api/ha_logbook.php?entity=<id>&range=1h|6h|12h|24h|7d
 *   → { ok, connected, error, entity, range, entries: [{ t, state?, message?, cause?: { kind: 'automation' | 'script', name } }…], more }
 * Read-only activity of ONE entity for Entity Details (server/ha/HaService::logbook). Signed-in session (gate.php); the entity
 * id and range are validated on the server; at most 50 entries; never a user id, never an invented actor.
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$ha = iq_ha();
if ($ha === null) {
    iq_json(['ok' => true, 'configured' => false, 'connected' => false, 'error' => 'not_configured', 'entries' => []]);
}
$id = is_string($_GET['entity'] ?? null) ? $_GET['entity'] : '';
$range = is_string($_GET['range'] ?? null) ? $_GET['range'] : '24h';
$r = $ha->logbook($id, $range);
$status = (int) ($r['status'] ?? 200);
unset($r['status']);
if ($r['error'] !== null && !in_array($r['error'], ['bad_entity', 'bad_range'], true)) {
    $status = 200;                // HA unreachable / logbook unavailable: reported in the JSON, Details keeps working
}
iq_json(['ok' => $r['error'] === null, 'configured' => true] + $r, $status);
