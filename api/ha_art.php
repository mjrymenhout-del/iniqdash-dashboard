<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * GET api/ha_art.php?entity=media_player.x[&v=…] → the player's current artwork (image bytes).
 * Fetched by the server (server/ha/HaClient::image): the browser never sees Home Assistant's
 * address or the access token in HA's picture URL. Only media players, only their CURRENT picture
 * — no arbitrary URLs.
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$id = is_string($_GET['entity'] ?? null) ? $_GET['entity'] : '';
$client = iq_ha_client();                      // the simulated home's client when this is a simulated dashboard's request
$ha = $client !== null ? new HaService($client) : null;
$pic = $ha !== null ? $ha->picture($id) : null;
$img = $pic !== null ? $client->image($pic) : null;
if ($img === null) {
    header('Content-Type: text/plain; charset=utf-8');
    http_response_code(404);
    echo "No artwork\n";
    exit;
}
header_remove('Cache-Control');
header('Content-Type: ' . $img['type']);
header('Cache-Control: private, max-age=300');
header('Content-Length: ' . strlen($img['body']));
echo $img['body'];
