#!/usr/bin/env bash
# Build en Render: dependencias del backend (solo producción) y compilación de la carta.
# Nota: el disco persistente no está disponible durante el build; la base se prepara al arrancar.
set -euo pipefail

echo "→ Backend: instalando dependencias de producción"
npm ci --prefix backend --omit=dev

echo "→ Frontend: instalando dependencias y compilando"
# --include=dev: con NODE_ENV=production npm omitiría Vite y los plugins de compilación.
npm ci --prefix frontend --include=dev
npm run build --prefix frontend

echo "✔ Build listo (frontend/dist)"
