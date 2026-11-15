<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * GET api/ha_img.php?entity=image.x|person.y[&v=…] → the entity's picture (image bytes).
 * Fetched by the server from Home Assistant with the token (server/ha/HaService::entityPicture):
 * image.* through HA's image proxy, person.* only when its picture is a path on Home Assistant.
 * The browser never sees HA's address or a token. No arbitrary URLs: this is not a general proxy.
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$id = is_string($_GET['entity'] ?? null) ? $_GET['entity'] : '';
$client = iq_ha_client();                      // the simulated home's client when this is a simulated dashboard's request
$ha = $client !== null ? new HaService($client) : null;
$pic = $ha !== null ? $ha->entityPicture($id) : null;
$img = $pic !== null ? $client->image($pic) : null;
if ($img === null) {
    header('Content-Type: text/plain; charset=utf-8');
    http_response_code(404);
    echo "No image\n";
    exit;
}
header_remove('Cache-Control');
header('Content-Type: ' . $img['type']);
header('Cache-Control: private, max-age=60');
header('Content-Length: ' . strlen($img['body']));
echo $img['body'];
