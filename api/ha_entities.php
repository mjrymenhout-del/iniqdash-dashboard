<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/** GET api/ha_entities.php[?fresh=1] → { ok, connected, error, entities: [{ id, domain, name, state, unit, dc, area, areaId }], areas: [{ id, name }] } */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$ha = iq_ha();
if ($ha === null) {
    iq_json(['ok' => true, 'configured' => false, 'connected' => false, 'error' => 'not_configured', 'entities' => [], 'areas' => []]);
}
iq_json(['ok' => true, 'configured' => true] + $ha->discover(!empty($_GET['fresh'])));
