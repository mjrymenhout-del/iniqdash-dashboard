<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * GET api/ha_related.php?entity=<id> → { ok, connected, error, entities: [<id>…] }
 * Entities on the SAME Home Assistant device as <id> (for a person: the device of the tracker it uses now). Only entity ids
 * — suggestions for the Information picker; IniqDash never assigns them a role. Read-only, signed-in session (gate.php).
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$ha = iq_ha();
if ($ha === null) {
    iq_json(['ok' => true, 'configured' => false, 'connected' => false, 'error' => 'not_configured', 'entities' => []]);
}
$id = is_string($_GET['entity'] ?? null) ? $_GET['entity'] : '';
iq_json(['ok' => true, 'configured' => true] + $ha->related($id));
