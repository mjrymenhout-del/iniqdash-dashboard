#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
# Copyright © 2026 Marcel Rymenhout and IniqDash contributors
# Copies the application (the committed files of the current Git commit, as a standalone install gets them) into ./app, the build
# context Home Assistant uses for this App. Leaves out what is not needed at runtime: tests/, docs/, dev/, packaging/, .github/.
set -e
here=$(cd "$(dirname "$0")" && pwd)
root=$(git -C "$here" rev-parse --show-toplevel)
rm -rf "$here/app" && mkdir "$here/app"
git -C "$root" archive HEAD | tar -x -C "$here/app"
rm -rf "$here/app/tests" "$here/app/docs" "$here/app/dev" "$here/app/packaging" "$here/app/.github" "$here/app/server/local.php"
echo "app/ prepared from $(git -C "$root" rev-parse --short HEAD)"
