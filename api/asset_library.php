<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * The IMAGE LIBRARY of one widget type (server/UserAssets.php): IMAGE OWNERSHIP = WIDGET TYPE.
 *   GET  api/asset_library.php?scope=<widget type>   → { ok, items: [{ ref }] }   the images uploaded for that type, plus the
 *        uploaded images the saved dashboards already use on widgets of that type (images uploaded before libraries existed)
 *   POST api/asset_library.php  { scope, ref }       → { ok }   records an ALREADY STORED image as that type's (e.g. an image a
 *        widget of that type already shows). Nothing is uploaded, moved or deleted here.
 * Reached only through gate.php (signed in; POST: CSRF + same origin). Answers carry references only — never a path or a name.
 */
if (!defined('IQ_GATED')) {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/server/UserAssets.php';
require_once dirname(__DIR__) . '/server/Dashboards.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function iq_lib_reply(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

const IQ_REF = '#^api/asset\.php\?id=([0-9a-f]{32})$#';

/** the uploaded images saved dashboards show on widgets of this type (config.image / imageOff) */
function iq_lib_in_use(string $scope): array
{
    $ids = [];
    $walk = static function (mixed $v) use (&$walk, &$ids, $scope): void {
        if (is_array($v)) {
            // a dashboard ITEM of that type (an item has a layout; a composed widget's own components are not items): its image locations,
            // at any depth of its configuration (a Studio widget's Image components)
            if (($v['type'] ?? null) === $scope && is_array($v['config'] ?? null) && array_key_exists('layout', $v)) {
                $find = static function (array $c) use (&$find, &$ids): void {
                    foreach ($c as $k => $x) {
                        if (is_array($x)) {
                            $find($x);
                        } elseif (in_array($k, ['image', 'imageOff'], true) && is_string($x) && preg_match(IQ_REF, $x, $m)) {
                            $ids[$m[1]] = true;
                        }
                    }
                };
                $find($v['config']);
            }
            foreach ($v as $x) {
                $walk($x);
            }
        }
    };
    foreach (Dashboards::list() as $d) {
        $e = Dashboards::get($d['id']);
        if ($e !== null) {
            $walk(json_decode(json_encode($e['dashboard']), true));
        }
    }
    // the reusable Widget Studio definitions belong to the "studio" type's library too: their Image components' images
    if ($scope === 'studio') {
        require_once dirname(__DIR__) . '/server/StudioWidgets.php';
        foreach (StudioWidgets::list() as $w) {
            $walk(['type' => 'studio', 'layout' => null, 'config' => json_decode(json_encode($w['definition']), true)]);
        }
    }
    return array_keys($ids);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET' || $method === 'HEAD') {
    $scope = is_string($_GET['scope'] ?? null) ? $_GET['scope'] : '';
    if (!preg_match(UserAssets::SCOPE, $scope)) {
        iq_lib_reply(['ok' => false, 'error' => 'bad_scope'], 400);
    }
    // the images uploaded before libraries existed join their widget type's library the first time it is listed
    foreach (iq_lib_in_use($scope) as $id) {
        UserAssets::addToLibrary($scope, $id);
    }
    iq_lib_reply(['ok' => true, 'items' => array_map(static fn ($id) => ['ref' => UserAssets::ref($id)], UserAssets::library($scope))]);
}
if ($method === 'POST') {
    $b = json_decode((string) file_get_contents('php://input'), true);
    $scope = is_array($b) && is_string($b['scope'] ?? null) ? $b['scope'] : '';
    $ref = is_array($b) && is_string($b['ref'] ?? null) ? $b['ref'] : '';
    if (!preg_match(UserAssets::SCOPE, $scope) || !preg_match(IQ_REF, $ref, $m)) {
        iq_lib_reply(['ok' => false, 'error' => 'bad_request'], 400);
    }
    iq_lib_reply(UserAssets::addToLibrary($scope, $m[1]) ? ['ok' => true] : ['ok' => false, 'error' => 'not_found'], 200);
}
iq_lib_reply(['ok' => false, 'error' => 'method_not_allowed'], 405);
