#!/bin/sh
set -e
node /app/migrate.js
exec node /app/server.js
