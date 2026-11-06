/**
 * Catálogo de permisos del sistema (definición de dominio, no datos de negocio).
 * Las asignaciones rol→permiso viven en la base y se editan desde "Equipo de Sala".
 */
export const PERMISSIONS = Object.freeze([
  { code: 'salon.ver', grp: 'Salón', description: 'Ver plano de salón y mesas' },
  { code: 'salon.operar', grp: 'Salón', description: 'Abrir, unir, separar y reasignar mesas' },
  { code: 'salon.editar_plano', grp: 'Salón', description: 'Mover, crear y eliminar mesas del plano' },
  { code: 'pedidos.crear', grp: 'Pedidos', description: 'Tomar pedidos y enviarlos a cocina' },
  { code: 'pedidos.anular', grp: 'Pedidos', description: 'Anular ítems ya marchados' },
  { code: 'cocina.ver', grp: 'Cocina', description: 'Ver monitor de cocina (KDS)' },
  { code: 'cocina.operar', grp: 'Cocina', description: 'Cambiar estados de preparación' },
  { code: 'caja.ver', grp: 'Caja', description: 'Ver cuentas y caja' },
  { code: 'caja.cobrar', grp: 'Caja', description: 'Registrar cobros y emitir comprobantes' },
  { code: 'caja.descuentos', grp: 'Caja', description: 'Aplicar descuentos o invitaciones' },
  { code: 'caja.abrir_cerrar', grp: 'Caja', description: 'Apertura, arqueo y cierre de caja' },
  { code: 'carta.ver', grp: 'Carta', description: 'Ver gestión de carta' },
  { code: 'carta.editar', grp: 'Carta', description: 'Crear y editar platos, categorías y promociones' },
  { code: 'carta.precios', grp: 'Carta', description: 'Modificar precios (incluye ajuste masivo)' },
  { code: 'informes.ver', grp: 'Informes', description: 'Ver informes y métricas' },
  { code: 'equipo.ver', grp: 'Equipo', description: 'Ver equipo de sala' },
  { code: 'equipo.editar', grp: 'Equipo', description: 'Crear y editar usuarios' },
  { code: 'equipo.permisos', grp: 'Equipo', description: 'Editar matriz de permisos y ver auditoría' },
  { code: 'ajustes.editar', grp: 'Ajustes', description: 'Editar datos del negocio, fiscales y sectores' },
]);

const all = PERMISSIONS.map((p) => p.code);

export const DEFAULT_ROLES = Object.freeze([
  { code: 'admin', name: 'Dueño / Administrador', isSystem: true, permissions: all },
  {
    code: 'encargado',
    name: 'Maître / Encargado',
    isSystem: false,
    permissions: all.filter((c) => !['equipo.permisos', 'ajustes.editar'].includes(c)),
  },
  {
    code: 'mozo',
    name: 'Mozo / Moza',
    isSystem: false,
    permissions: ['salon.ver', 'salon.operar', 'pedidos.crear', 'cocina.ver', 'caja.ver', 'carta.ver'],
  },
  { code: 'cocina', name: 'Cocina / Barra', isSystem: false, permissions: ['cocina.ver', 'cocina.operar', 'carta.ver'] },
  {
    code: 'cajero',
    name: 'Cajero / Front',
    isSystem: false,
    permissions: ['salon.ver', 'caja.ver', 'caja.cobrar', 'caja.abrir_cerrar', 'pedidos.crear', 'carta.ver'],
  },
]);
