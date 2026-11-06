/**
 * Leyendas exigidas por la normativa argentina para cartas de establecimientos gastronómicos.
 */
export const LEGAL = {
  prices: 'Precios finales en pesos argentinos, IVA incluido (Ley 24.240 de Defensa del Consumidor y Res. SCI 7/2002).',
  salt: 'El consumo excesivo de sodio es perjudicial para la salud. Hay opciones sin sal agregada; consultá al personal (Ley 26.905).',
  celiac: 'Ofrecemos opciones sin TACC (Ley 26.588 y modif. 27.196). Consultá por la manipulación para evitar contaminación cruzada.',
  alcohol: 'Prohibida la venta de bebidas alcohólicas a menores de 18 años (Ley 24.788). Beber con moderación.',
  allergens: 'Alérgenos declarados según el Código Alimentario Argentino (art. 235 séptimo). Ante dudas, consultá al personal.',
  consumer: 'Ante cualquier reclamo podés solicitar el Libro de Quejas o dirigirte a Defensa del Consumidor.',
};

export const TAG_LABELS = {
  vegano: 'Vegano',
  vegetariano: 'Vegetariano',
  sin_tacc: 'Sin TACC',
  sin_sal_agregada: 'Sin sal agregada',
  sin_lactosa: 'Sin lactosa',
  picante: 'Picante',
};

export const ALLERGEN_LABELS = {
  gluten: 'Gluten (TACC)',
  crustaceos: 'Crustáceos',
  huevo: 'Huevo',
  pescado: 'Pescado',
  mani: 'Maní',
  soja: 'Soja',
  leche: 'Leche',
  frutos_secos: 'Frutos secos',
  sulfitos: 'Sulfitos',
};

export const STATION_LABELS = {
  cocina: 'Cocina',
  parrilla: 'Parrilla',
  horno: 'Horno',
  frios: 'Fríos',
  barra: 'Barra',
  cafeteria: 'Cafetería',
  pasteleria: 'Pastelería',
};

export const PAYMENT_LABELS = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  qr: 'QR / Billetera',
  transferencia: 'Transferencia',
};

export const IVA_LABELS = {
  consumidor_final: 'Consumidor Final',
  responsable_inscripto: 'Responsable Inscripto',
  monotributo: 'Monotributo',
  exento: 'Exento',
};

export const ITEM_STATUS = {
  pendiente: { label: 'En cola', tone: 'bg-surface-high text-on-surface-variant' },
  preparando: { label: 'En fuegos', tone: 'bg-secondary-fixed text-on-secondary-container' },
  listo: { label: 'Listo', tone: 'bg-tertiary-fixed text-tertiary' },
  entregado: { label: 'Servido', tone: 'bg-tertiary/10 text-tertiary' },
  anulado: { label: 'Anulado', tone: 'bg-error-container text-on-error-container' },
};
