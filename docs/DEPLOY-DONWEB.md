# Despliegue en DonWeb

Hay dos caminos. **Recomendado: Cloud Server (VPS)**, porque el monitor de cocina y el salón usan conexiones en vivo
(SSE) y los módulos nativos (`better-sqlite3`, `sharp`) se instalan sin restricciones.

## Opción A — DonWeb Cloud Server (Ubuntu) · recomendado

```bash
# 1. Node.js LTS, Nginx y PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx
sudo npm i -g pm2

# 2. Código
sudo mkdir -p /srv/mesaar && sudo chown $USER /srv/mesaar
cd /srv/mesaar && git clone <tu-repo> .

# 3. Backend
cd backend && npm ci --omit=dev
cp .env.example .env && nano .env
#   NODE_ENV=production, PORT=4000, TRUST_PROXY=1
#   JWT_SECRET=<node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))">
#   COOKIE_SECURE=true, COOKIE_SAMESITE=strict
#   CORS_ORIGINS=https://tudominio.com.ar  PUBLIC_APP_URL=https://tudominio.com.ar
#   DB_PATH=/var/lib/mesaar/menu.sqlite   UPLOAD_DIR=/var/lib/mesaar/uploads
#   ADMIN_USERNAME / ADMIN_NAME / ADMIN_PASSWORD (solo para el primer seed; luego borralos)
sudo mkdir -p /var/lib/mesaar && sudo chown $USER /var/lib/mesaar
npm run db:seed
pm2 start src/server.js --name mesaar-api && pm2 save && pm2 startup

# 4. Frontend
cd ../frontend && npm ci && cp .env.example .env   # VITE_API_URL=/api  VITE_UPLOADS_URL=/uploads
npm run build                                       # genera frontend/dist
```

`/etc/nginx/sites-available/mesaar`:

```nginx
server {
  server_name tudominio.com.ar;
  root /srv/mesaar/frontend/dist;
  gzip on; gzip_types text/css application/javascript application/json image/svg+xml model/gltf-binary;

  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
  location = /sw.js  { add_header Cache-Control "no-cache"; }
  location /api/realtime/ {               # SSE sin buffer
    proxy_pass http://127.0.0.1:4000; proxy_http_version 1.1;
    proxy_set_header Connection ''; proxy_buffering off; proxy_read_timeout 1h;
  }
  location /api/     { proxy_pass http://127.0.0.1:4000; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; client_max_body_size 20m; }
  location /uploads/ { proxy_pass http://127.0.0.1:4000; }
  location /         { try_files $uri /index.html; }
  # Cámara (QR de mesa y AR), WebXR y sensores de orientación
  add_header Permissions-Policy "camera=(self), xr-spatial-tracking=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self), microphone=(), geolocation=()" always;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mesaar /etc/nginx/sites-enabled/
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d tudominio.com.ar
```

## Opción B — Hosting DonWeb con cPanel “Setup Node.js App”

1. Compilá el frontend en tu PC (`npm run build`) y subí la carpeta `frontend/dist` junto con `backend/`.
2. En cPanel → *Setup Node.js App*: versión 20+, *Application root* = `backend`, *startup file* = `src/server.js`.
3. Cargá las variables de entorno del `.env.example` en el panel y agregá `SERVE_FRONTEND_DIR=../frontend/dist`
   (el backend sirve la carta y la API en el mismo dominio).
4. *Run NPM Install* y luego, desde la terminal de cPanel: `npm run db:seed`.
5. Activá SSL (AutoSSL) y poné `COOKIE_SECURE=true`.

Si tu plan bufferiza las respuestas (Passenger), el tiempo real puede demorarse; en ese caso preferí la opción A.

> **HTTPS es obligatorio**: los navegadores solo permiten la cámara (escáner de QR y AR) en sitios seguros.

## Operación

- **Backup** de la base (en caliente, consistente):
  `sqlite3 /var/lib/mesaar/menu.sqlite ".backup '/var/backups/mesaar-$(date +%F).sqlite'"` (cron diario) + carpeta `uploads/`.
- **Actualizar**: `git pull && cd backend && npm ci --omit=dev && pm2 restart mesaar-api && cd ../frontend && npm ci && npm run build`.
  Las migraciones de base se aplican solas al iniciar.
- **QR**: imprimilos desde *Ajustes → Salón y QR* una vez configurado el dominio definitivo.
