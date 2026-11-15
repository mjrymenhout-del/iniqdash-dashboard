<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// php tests/checkmodel.php < model.json — the SERVER's structural validation of a dashboard (what a save would accept). Exit 1 if refused.
declare(strict_types=1);
require dirname(__DIR__) . '/server/Dashboards.php';
$m = json_decode((string) stream_get_contents(STDIN), false);
$why = null;
$ok = Dashboards::checkModel($m, $why);
echo $ok ? "ok\n" : "refused: $why\n";
exit($ok ? 0 : 1);
