<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * Shared start of every api/ha_*.php endpoint. They are only reachable through gate.php, which
 * has already checked the session (and, for POST, the CSRF token + same origin).
 */

if (!defined('IQ_GATED')) {
    http_response_code(404);
    exit;
}
require __DIR__ . '/HaClient.php';
require __DIR__ . '/HaService.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function iq_json(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/** null when Home Assistant is not configured on this server (IniqDash then shows demo data). */
/**
 * SIMULATED HOME: a dashboard marked app.simulated sends "X-IniqDash-Simulated: 1" with its Home Assistant requests (pictures:
 * "sim=1" in the URL the server itself wrote). Those requests are answered by SimHaClient — the fictional home — and NEVER reach
 * the configured Home Assistant: its URL and token are not even read. Everything else is unchanged.
 */
function iq_simulated(): bool
{
    return ($_SERVER['HTTP_X_INIQDASH_SIMULATED'] ?? '') === '1' || ($_GET['sim'] ?? '') === '1';
}

/** the Home Assistant client of this request: the simulated home, or the configured one (null when none is configured) */
function iq_ha_client(): ?HaClient
{
    if (iq_simulated()) {
        require_once __DIR__ . '/SimHa.php';
        return new SimHaClient();
    }
    $cfg = HaClient::config();
    return $cfg === null ? null : new HaClient($cfg);
}

function iq_ha(): ?HaService
{
    $c = iq_ha_client();
    return $c === null ? null : new HaService($c);
}
