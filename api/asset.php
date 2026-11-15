<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * GET api/asset.php?id=<32 hex>   — one uploaded user image (server/UserAssets.php), for <img> on IniqDash pages.
 * Reached only through gate.php (signed-in session; a normal <img> request carries the session cookie).
 * Served with its validated Content-Type, nosniff, no script context (CSP sandbox), private long-lived caching
 * (an id's content never changes). Unknown or malformed id → 404. No other parameter is read; no path is accepted.
 */
if (!defined('IQ_GATED')) {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/server/UserAssets.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$id = is_string($_GET['id'] ?? null) ? $_GET['id'] : '';
$found = ($method === 'GET' || $method === 'HEAD') ? UserAssets::find($id) : null;
if ($found === null) {
    http_response_code($method === 'GET' || $method === 'HEAD' ? 404 : 405);
    header('Cache-Control: no-store');
    header('Content-Type: text/plain; charset=utf-8');
    echo "Not found\n";
    exit;
}
[$file, $type] = $found;
$etag = '"' . $id . '"';
header('Content-Type: ' . $type);
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; sandbox");
header('Content-Disposition: inline; filename="' . basename($file) . '"');
header('Cache-Control: private, max-age=31536000, immutable');
header('ETag: ' . $etag);
if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}
header('Content-Length: ' . (string) filesize($file));
if ($method === 'GET') {
    readfile($file);
}
