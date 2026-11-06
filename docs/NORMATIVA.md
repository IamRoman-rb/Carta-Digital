# Cumplimiento normativo (Argentina)

> Esta guía resume cómo el sistema contempla la normativa. No reemplaza el asesoramiento contable o legal:
> validá con tu contador los datos fiscales y el régimen de facturación que te corresponde.

## Facturación (ARCA, ex AFIP)
| Norma | Implementación |
|---|---|
| RG 1415/2003 | El comprobante incluye razón social, domicilio, CUIT, IIBB, inicio de actividades, condición IVA, letra, código, punto de venta (5 dígitos) y número (8 dígitos), fecha, receptor y detalle. |
| Letra del comprobante | Responsable Inscripto: **A** a RI y monotributistas (RG 5003/2021), **B** a consumidor final y exentos. Monotributo/exento: **C**. |
| Ley 27.743 (Transparencia Fiscal al Consumidor) | En comprobantes B se discrimina “IVA Contenido” y “Otros Impuestos Nacionales Indirectos”. |
| Factura A | Precios unitarios netos y discriminación de IVA por alícuota. |
| Identificación del consumidor final | Umbral configurable en *Ajustes* (se carga con el monto vigente; actualizalo si ARCA lo modifica). |
| RG 4291/2018 (QR) | Se genera el QR oficial cuando el comprobante tiene CAE. |
| Propina | Se registra aparte y no integra el comprobante. |

**Importante — CAE:** el proveedor fiscal incluido es `interno`: numera los comprobantes y los imprime como
**“DOCUMENTO NO VÁLIDO COMO FACTURA” (letra X)** indicando la factura que corresponde emitir. Nunca se simula un CAE.
Para emitir factura electrónica válida hay que agregar un adaptador ARCA (WSAA + WSFEv1) con el certificado digital
del contribuyente en `backend/src/modules/billing/fiscal/fiscalProviders.js`; el resto del sistema ya está preparado
(código de comprobante, QR, CAE y vencimiento). Alternativamente, usar un controlador fiscal homologado.

## Defensa del consumidor y alimentación
| Norma | Implementación |
|---|---|
| Ley 24.240 y Res. SCI 7/2002 | Precios finales en pesos con IVA incluido, visibles en la carta. |
| Ley 26.905 (sodio) | Leyenda sobre consumo excesivo de sodio y etiqueta “Sin sal agregada”. |
| Ley 26.588 / 27.196 (celiaquía) | Etiqueta y filtro “Sin TACC”; leyenda sobre contaminación cruzada. |
| Código Alimentario Argentino, art. 235 séptimo | Declaración de alérgenos por plato. |
| Ley 24.788 (alcohol) | Leyenda de prohibición de venta a menores de 18 en bebidas alcohólicas. |

## Datos personales y accesibilidad
| Norma | Implementación |
|---|---|
| Ley 25.326 | El comensal no se registra ni se le piden datos; solo datos fiscales si pide factura. Página `/legales` con derechos ARCO. Contraseñas con bcrypt; auditoría; acceso por roles. **Recordá inscribir las bases de datos en el Registro Nacional de Bases de Datos si corresponde.** |
| Ley 26.653 | Accesibilidad web WCAG 2.1 AA. |
