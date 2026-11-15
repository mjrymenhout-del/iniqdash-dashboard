<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * GET api/ha_cam.php?entity=camera.x[&t=…] → the camera's current snapshot (image bytes).
 * The server fetches /api/camera_proxy/<entity> from Home Assistant with the token; the browser
 * never sees the token, HA's address or the camera's access token. Only camera entities.
 * Refresh pacing is done by the shared IniqHA layer (one request at a time, only when visible).
 */
require dirname(__DIR__) . '/server/ha/endpoint.php';

$id = is_string($_GET['entity'] ?? null) ? $_GET['entity'] : '';
$client = iq_ha_client();                      // the simulated home's client when this is a simulated dashboard's request
$img = $client !== null && HaService::validId($id) && str_starts_with($id, 'camera.')
    ? $client->image('/api/camera_proxy/' . rawurlencode($id))
    : null;
if ($img === null) {
    header('Content-Type: text/plain; charset=utf-8');
    http_response_code(404);
    echo "No image\n";
    exit;
}
header('Content-Type: ' . $img['type']);
header('Cache-Control: no-store');
header('Content-Length: ' . strlen($img['body']));
echo $img['body'];
