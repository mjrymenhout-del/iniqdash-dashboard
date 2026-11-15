<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/** GET api/ha_status.php → { ok, configured, connected, error, version, temperature_unit } */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$ha = iq_ha();
if ($ha === null) {
    iq_json(['ok' => true, 'simulated' => false, 'configured' => false, 'connected' => false, 'error' => 'not_configured']);
}
iq_json(['ok' => true, 'configured' => true, 'simulated' => iq_simulated()] + $ha->status());
