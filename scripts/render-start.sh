#!/usr/bin/env bash
# Arranque en Render: prepara la base en el disco persistente y levanta el servidor.
# Las migraciones se aplican solas; el seed es idempotente (no pisa datos existentes).
set -euo pipefail
cd backend

if [ "${SEED_DEMO:-false}" = "true" ]; then
  node seed/seed.js --demo-if-empty
else
  node seed/seed.js
fi

exec node src/server.js
