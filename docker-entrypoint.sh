#!/bin/sh
set -e
# node /app/migrate.js migrations are failing, have to do it manualy externally 
exec node /app/server.js
