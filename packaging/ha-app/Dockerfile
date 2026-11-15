# DRAFT — never built in a supported Home Assistant environment. See README.md in this folder.
# Home Assistant builds an App with THIS folder as the build context (not the repository root), so the application files must be
# copied in first: run ./prepare.sh (it puts the SAME files a standalone install uses into ./app — no fork). BUILD_FROM is supplied by
# the Supervisor; the default only allows a local test build.
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}
# UNVERIFIED package names (the Alpine index could not be reached when this was written): JSON is built into PHP 8, so php83-json may
# not exist on the base image's Alpine release — check with `apk search -x` before the first build.
RUN apk add --no-cache nginx php83 php83-fpm php83-curl php83-session php83-mbstring php83-fileinfo php83-openssl php83-ctype \
 && rm -f /etc/nginx/http.d/default.conf
COPY app/ /var/www/iniqdash/
COPY nginx.conf /etc/nginx/http.d/iniqdash.conf
COPY run.sh /run.sh
RUN chmod a+x /run.sh && rm -f /var/www/iniqdash/server/local.php
CMD [ "/run.sh" ]
