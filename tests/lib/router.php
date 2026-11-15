<?php
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * Copyright © 2026 Marcel Rymenhout and IniqDash contributors */
// Router for `php -S` in the tests: what .htaccess does on Apache — login.php / logout.php are reachable, everything else goes through gate.php.
$path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$root = dirname(__DIR__, 2);
if (in_array($path, ['/login.php', '/logout.php'], true)) {
    $_SERVER['SCRIPT_NAME'] = $path;
    require $root . $path;
    return true;
}
$_SERVER['SCRIPT_NAME'] = '/gate.php';   // Apache sets this through the rewrite; the built-in server would use the request path
require $root . '/gate.php';
