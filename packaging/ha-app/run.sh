#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
# Copyright © 2026 Marcel Rymenhout and IniqDash contributors
# DRAFT — never run in a Home Assistant App. The private folder lives in the App's persistent /data (outside the web root), so Home Assistant backups include it.
set -e
export INIQDASH_PRIVATE=/data/iniqdash-private
mkdir -p "$INIQDASH_PRIVATE" && chmod 700 "$INIQDASH_PRIVATE"
# ingress only (no exposed port): plain HTTP from Home Assistant's proxy — see README.md, open decision 2
if [ ! -f /var/www/iniqdash/server/local.php ]; then
  printf "<?php\nreturn ['private_dir' => '%s', 'require_https' => false];\n" "$INIQDASH_PRIVATE" > /var/www/iniqdash/server/local.php
fi
# first run: the admin account must be created (open decision 5) — until then the login page says the setup is missing
chown -R nobody:nobody "$INIQDASH_PRIVATE" 2>/dev/null || true
php-fpm83 -D
exec nginx -g 'daemon off;'
