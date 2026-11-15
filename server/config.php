<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */

declare(strict_types=1);

/**
 * IniqDash server settings. NOT secret (no passwords, no tokens): those live in the private
 * folder outside the web root (see server/Paths.php and server/setup.php).
 *
 * Deployment-specific overrides (e.g. require_https => false for a local test server) go in
 * server/local.php, which server/setup.php writes and which is never committed.
 */
return [
    'app_name'         => 'IniqDash',
    // Internet-facing installation: plain HTTP is redirected (pages) or refused (everything else).
    'require_https'    => true,
    // Sessions: signed out after this much inactivity, and in any case after the absolute lifetime.
    'idle_timeout'     => 12 * 3600,
    'absolute_timeout' => 7 * 24 * 3600,
    // Login attempts: per address, then per account name (catches attempts spread over addresses).
    'login_max_per_ip'      => 5,
    'login_max_per_account' => 20,
    'login_window'          => 15 * 60,
];
