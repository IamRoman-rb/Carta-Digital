# Arquitectura y diseño (ISO/IEC/IEEE 42010 · IEEE 1016)

## Vista general

```
[Celular comensal] ──QR──► Frontend (PWA, carta)  ─┐
[Tablet/PC staff]  ───────► Frontend (/staff)      ─┼─► /api (Express) ─► SQLite3 (WAL)
                    ◄── SSE (tiempo real) ──────────┘          └─► /uploads (WebP + GLB)
```

- **Backend y frontend separados**: se pueden desplegar en servidores distintos o en un solo proceso
  (`SERVE_FRONTEND_DIR`), ver [despliegue](DEPLOY-DONWEB.md).
- **Arquitectura en capas** por módulo (`backend/src/modules/*`): rutas (validación + autorización) → servicios (reglas de negocio)
  → repositorios (SQL con sentencias preparadas).

## Patrones de diseño aplicados

| Patrón | Dónde | Para qué |
|---|---|---|
| Singleton | `db/connection.js` | Una única conexión SQLite configurada (WAL, claves foráneas) |
| Repository | `*.repository.js` | Aislar SQL del negocio |
| Strategy | `billing/splitStrategies.js` | División de cuenta: única, partes iguales, ítem por ítem |
| Strategy | `menu/pricing.service.js` | Reglas de promoción (todo, categoría, producto, franja horaria) |
| Strategy / Adapter | `billing/fiscal/fiscalProviders.js` | Proveedor fiscal intercambiable (interno hoy, ARCA WSFE a futuro) |
| Factory Method | `billing/fiscal/ticketFactory.js` | Construcción de pre-cuenta y comprobante según condición IVA |
| Builder | `uploads/glbPlateBuilder.js` | Generación de modelos glTF binarios a escala real |
| Capability token | `public/checkin.service.js` | Pase de mesa firmado obtenido al escanear el QR; requisito para pedir |
| Observer | `core/eventBus.js` + `realtime` (SSE) + `staff/realtime.js` | Eventos de dominio a cocina, salón y caja en vivo |
| Chain of Responsibility | Middlewares Express | autenticación → permiso → validación → handler |
| Facade | `frontend/src/lib/notify.js` | SweetAlert2 detrás de una API simple y con carga diferida |
| Provider / Context | `staff/auth.jsx`, `staff/staffData.jsx` | Estado compartido de sesión, salón y caja |

## Decisiones relevantes (ADR resumidos)

1. **SQLite3 con `better-sqlite3`**: motor SQLite 3 embebido, sin servidor de base de datos (ideal para hosting DonWeb),
   transacciones síncronas atómicas (unión de mesas, cobros). Montos en **centavos enteros** para evitar errores de redondeo.
2. **JWT de acceso corto (15 min) en memoria + refresh token rotativo en cookie httpOnly** guardado *hasheado* en la base,
   con detección de reutilización. Evita guardar tokens en `localStorage`.
3. **SSE en lugar de WebSockets**: unidireccional, liviano y compatible con proxies; el comensal usa *polling* condicional
   solo con la pestaña visible para ahorrar datos y batería.
4. **Comprobantes inmutables**: triggers SQL impiden modificar o borrar tickets emitidos.
5. **Check-in por QR de mesa**: la carta es pública, pero `/api/public/table/*` exige la cabecera `X-Table-Pass`.
   El pase (HS256 con clave derivada de `JWT_SECRET`, separada de la del personal) se invalida al liberar la mesa
   (`dining_tables.released_at`), al regenerar el QR o al vencer. El escáner usa `BarcodeDetector` nativo o `jsQR` (carga diferida).
6. **AR**: `model-viewer` con WebXR (hit-test sobre la mesa), Scene Viewer o Quick Look; si el equipo no soporta AR o falla,
   `CameraPlate` muestra la cámara trasera con el plato 3D encima, inclinado según `DeviceOrientation` y dimensionado a ~45 cm.
7. **Rendimiento móvil**: carta inicial de ~85 KB gzip de JS; pantallas secundarias, panel staff y visor 3D en *chunks* aparte;
   fuentes autoalojadas (solo latin); imágenes WebP 480/960 px con `srcset`; API de carta cacheable; service worker
   (stale-while-revalidate para la carta, cache-first para imágenes y modelos con nombres con hash).

## Correspondencia con normas

| Norma | Aplicación |
|---|---|
| ISO/IEC 25010 (calidad de producto) | Mantenibilidad (capas, módulos), seguridad, usabilidad, eficiencia de desempeño |
| ISO/IEC 27001/27002 | Hash bcrypt, política de contraseñas, bloqueo por intentos, RBAC, auditoría, secretos fuera del código, cabeceras de seguridad (Helmet/CSP), *rate limiting* |
| OWASP ASVS / Top 10 | Validación de entradas (zod), SQL parametrizado, CORS restringido, cookies `httpOnly`/`SameSite` |
| ISO/IEC/IEEE 29148 | [Especificación de requisitos](REQUISITOS.md) |
| ISO/IEC/IEEE 12207 | Ciclo de vida: lint, pruebas automatizadas, migraciones versionadas |
| ISO/IEC 40500 (WCAG 2.x AA) | Navegación por teclado, `aria-*`, contraste, `prefers-reduced-motion`, tablas alternativas en gráficos |
| ISO 8601 / ISO 4217 | Fechas UTC ISO en la API; moneda ARS |
| IEEE 829 / ISO/IEC/IEEE 29119 | Pruebas de integración en `backend/tests` |
