<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * GET api/ha_calendar.php?entity=calendar.<id>[&from=YYYY-MM-DD&days=1..62]
 *   → { ok, connected, error, entity, start, end, days, events: [{ title, start, end, allDay, location? }…], more, refresh }
 * Read-only upcoming events of ONE calendar entity (server/ha/HaService::calendar) — ONE path shared by the Calendar widget and
 * Entity Details. Signed-in session (gate.php); the entity id is validated on the server; no event is ever created, changed or
 * deleted. Not part of the state poll: the browser asks for it lazily and reuses it until its refresh time.
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$ha = iq_ha();
if ($ha === null) {
    iq_json(['ok' => true, 'configured' => false, 'connected' => false, 'error' => 'not_configured', 'events' => []]);
}
$id = is_string($_GET['entity'] ?? null) ? $_GET['entity'] : '';
// optional window (week / month views): ?from=YYYY-MM-DD&days=1..62 — validated by HaService
$from = is_string($_GET['from'] ?? null) ? $_GET['from'] : null;
$days = isset($_GET['days']) && is_string($_GET['days']) && ctype_digit($_GET['days']) ? (int) $_GET['days'] : (isset($_GET['days']) ? 0 : null);
$r = $ha->calendar($id, $from, $days);
$status = (int) ($r['status'] ?? 200);
unset($r['status']);
if ($r['error'] !== null && $r['error'] !== 'bad_entity') {
    $status = 200;                // HA unreachable / calendar unavailable: reported in the JSON, the widget says so
}
iq_json(['ok' => $r['error'] === null, 'configured' => true] + $r, $status);
