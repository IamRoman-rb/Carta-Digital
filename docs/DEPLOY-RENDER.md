# Despliegue en Render (directo desde GitHub)

El repositorio incluye un **Blueprint** (`render.yaml`) que crea todo automáticamente:
un servicio web Node que sirve la API, las fotos/modelos 3D y la carta compilada en el mismo dominio,
con un **disco persistente** para la base SQLite y los archivos subidos.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/IamRoman-rb/Carta-Digital)

## Pasos

1. Subí estos archivos al repo (`render.yaml`, `scripts/`, `.gitattributes`).
2. En Render: **New → Blueprint** → conectá GitHub → elegí `Carta-Digital` (o usá el botón de arriba).
3. Render pide los valores marcados como secretos:
   - `ADMIN_USERNAME`, `ADMIN_NAME`, `ADMIN_PASSWORD` (mín. 8 caracteres con letras y números; se pide cambiarla al primer ingreso).
4. **Apply**. El primer despliegue tarda unos minutos. La carta queda en `https://carta-digital.onrender.com`
   y el panel del personal en `/staff`.
5. Entrá al panel, completá *Ajustes → Negocio y fiscal* e imprimí los QR desde *Ajustes → Salón y QR*
   (los QR llevan la dirección desde la que abrís el panel).

Cada `git push` a `main` vuelve a desplegar solo. Las migraciones de base se aplican al arrancar.

## Qué hace cada pieza

| Archivo | Función |
|---|---|
| `render.yaml` | Servicio, plan, región, disco `/var/data`, variables de entorno y health check `/api/health` |
| `scripts/render-build.sh` | `npm ci` del backend (solo producción) y build del frontend |
| `scripts/render-start.sh` | Seed idempotente (roles, ajustes, admin; demo opcional) y arranque del servidor |

- `JWT_SECRET` lo genera Render (aleatorio); no está en el repo.
- `PUBLIC_APP_URL` y `CORS_ORIGINS` se toman de `RENDER_EXTERNAL_URL`. Con dominio propio, definilos en *Environment*.
- `SEED_DEMO=true` carga mesas, carta y usuarios de demostración **solo si la base está vacía**; las contraseñas
  temporales de esos usuarios aparecen una vez en los *Logs* del despliegue.

## Prueba gratuita (sin tarjeta)

`render-demo.yaml` despliega en el plan gratuito, sin disco: **New → Blueprint →** repo → en *Blueprint Path* escribí
`render-demo.yaml`. La base se borra en cada reinicio o suspensión (≈15 min sin visitas) y la demo se vuelve a cargar;
sirve para mostrar la carta, el QR y el AR, no para operar.

## Costos y límites

- El disco persistente **requiere un plan pago** (Starter o superior). En el plan gratuito el disco se borra en cada
  despliegue o reinicio y el servicio se suspende sin tráfico, así que no sirve para producción.
- Un servicio con disco no admite varias instancias ni despliegues sin corte: hay unos segundos de reinicio en cada deploy.
- Render toma *snapshots* diarios del disco. Para un backup propio: *Shell* →
  `sqlite3 /var/data/menu.sqlite ".backup /var/data/backup.sqlite"` (o descargalo con `scp` desde la pestaña *Shell/SSH*).
- La región `virginia` es la más cercana a Argentina entre las disponibles; cambiala en `render.yaml` si preferís otra.
- Si los límites por IP (login, carta pública) agrupan a todos los clientes, ajustá `TRUST_PROXY` según los proxies de Render.
