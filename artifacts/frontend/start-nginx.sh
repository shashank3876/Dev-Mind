#!/bin/sh
set -eu
: "${API_SERVER_URL:?API_SERVER_URL is required}"
envsubst '${API_SERVER_URL}' \
  < /etc/nginx/default.conf.template \
  > /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
