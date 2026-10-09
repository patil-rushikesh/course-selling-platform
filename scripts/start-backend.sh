#!/bin/sh
set -eu
# Startup remains inside the backend container; no migration/init container.
node scripts/wait-for-db.js
node node_modules/prisma/build/index.js migrate deploy
exec node index.js
