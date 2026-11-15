#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
# Copyright © 2026 Marcel Rymenhout and IniqDash contributors
# Every tracked PHP file must parse.
cd "$(dirname "$0")/.." || exit 1
bad=0
for f in $(git ls-files '*.php'); do php -l "$f" > /dev/null 2>&1 || { echo "FAIL $f does not parse"; bad=1; }; done
[ $bad = 0 ] && echo "ok   all $(git ls-files '*.php' | wc -l) PHP files parse"
exit $bad
