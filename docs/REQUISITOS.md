# Especificación de requisitos (estructura ISO/IEC/IEEE 29148)

## 1. Propósito y alcance
Sistema para establecimientos gastronómicos que permite a los comensales consultar la carta desde su celular
(incluida la visualización 3D/AR de platos a escala real), pedir y solicitar la cuenta, y al personal gestionar
salón, cocina, caja, carta, equipo e informes.

## 2. Partes interesadas
Comensal · Mozo · Cocina/barra · Cajero · Encargado/maître · Dueño/administrador.

## 3. Requisitos funcionales
| ID | Requisito |
|---|---|
| RF-01 | El comensal consulta la carta libremente, sin registrarse. |
| RF-02 | La carta muestra precios finales con IVA, promociones vigentes, alérgenos y características. |
| RF-03 | Con la cámara del celular el comensal ve el plato apoyado sobre su mesa: AR nativo a escala 1:1 (WebXR / Scene Viewer / Quick Look) y, en equipos sin AR, cámara + modelo 3D orientado por la inclinación del celular (tamaño aproximado). |
| RF-04 | Para pedir, llamar al mozo o pedir la cuenta el comensal debe escanear el QR de su mesa (desde la carta o con la cámara del teléfono). El escaneo genera un pase firmado que vence a las `table_checkin_hours` horas, al liberarse la mesa o al regenerar su QR. Solo se puede pedir si el personal abrió la mesa. |
| RF-05 | El comensal ve el estado de sus platos, llama al mozo y pide la cuenta indicando medio de pago, propina y división. |
| RF-06 | El personal se autentica con usuario y contraseña; debe cambiar la contraseña inicial. |
| RF-07 | Arrastrar una mesa sobre otra las une y fusiona sus cuentas (consumos, pagos, comensales). |
| RF-08 | Cocina ve comandas por estación y orden de llegada, con alertas configurables de demora. |
| RF-09 | Caja registra pagos parciales por distintos medios, calcula vuelto y aplica descuentos con motivo. |
| RF-10 | Al cerrar la cuenta se emite un comprobante con los datos exigidos en Argentina y se liberan las mesas. |
| RF-11 | Se administran platos, costos, modificadores, combos, promociones horarias, fotos y modelos 3D. |
| RF-12 | Los informes muestran facturación, márgenes, ingeniería de menú, equipo y cocina, exportables a CSV. |
| RF-13 | Los permisos de cada rol son configurables y toda acción crítica queda auditada. |

## 4. Requisitos no funcionales
| ID | Requisito |
|---|---|
| RNF-01 | Carga inicial de la carta ≤ 100 KB gzip de JavaScript; imágenes WebP adaptativas. |
| RNF-02 | La carta sigue disponible sin conexión una vez visitada (PWA). |
| RNF-03 | Contraseñas con bcrypt; ningún secreto en el código fuente. |
| RNF-04 | Diseño responsive de 360 px a escritorio, sin desplazamiento horizontal. |
| RNF-05 | Accesibilidad WCAG 2.1 AA (Ley 26.653). |
| RNF-06 | Actualización en vivo del salón, cocina y caja (< 1 s en red local). |
| RNF-07 | Desplegable en hosting DonWeb (Cloud Server o hosting con Node.js). |

## 5. Verificación
- Pruebas de integración de la API: `backend/tests/api.test.js` (RF-04, 06, 07, 09, 10, 13, RNF-03).
- Recorrido E2E en navegador real (Chromium) del comensal y del staff, ejecutado durante el desarrollo.
