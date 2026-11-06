import { z } from 'zod';
import { badRequest, forbidden, notFound, conflict } from '../../core/errors.js';
import { eventBus, Events } from '../../core/eventBus.js';
import { audit } from '../../core/utils.js';
import { menuRepository } from './menu.repository.js';
import { pricingService } from './pricing.service.js';
import { mediaService } from '../uploads/media.service.js';
import { STATIONS, DIETARY_TAGS, ALLERGENS, CATEGORY_ICONS } from './menu.constants.js';

// ---------------- Esquemas de validación ----------------
const money = z.coerce.number().int().min(0).max(1_000_000_000);

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(40),
  icon: z.enum(CATEGORY_ICONS),
  sort_order: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

const optionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(120).default(''),
  price_delta: z.coerce.number().int().min(0).max(100_000_000).default(0),
});

const groupSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    min_select: z.coerce.number().int().min(0).max(10),
    max_select: z.coerce.number().int().min(1).max(10),
    options: z.array(optionSchema).min(1).max(20),
  })
  .refine((g) => g.min_select <= g.max_select && g.max_select <= g.options.length, 'Mínimo/máximo de selección inconsistente');

export const productSchema = z.object({
  category_id: z.coerce.number().int().positive(),
  sku: z.string().trim().max(30).optional().default(''),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).default(''),
  price: money,
  cost: money.default(0),
  vat_rate: z.coerce.number().refine((v) => [0, 2.5, 5, 10.5, 21, 27].includes(v), 'Alícuota de IVA inválida'),
  prep_minutes: z.coerce.number().int().min(0).max(240).default(15),
  station: z.enum(STATIONS),
  diameter_cm: z.coerce.number().min(5).max(120).nullable().optional(),
  serves: z.string().trim().max(40).optional().default(''),
  badge: z.string().trim().max(30).optional().default(''),
  tags: z.array(z.enum(DIETARY_TAGS)).default([]),
  allergens: z.array(z.enum(ALLERGENS)).default([]),
  is_alcoholic: z.boolean().default(false),
  available: z.boolean().default(true),
  featured: z.boolean().default(false),
  is_combo: z.boolean().default(false),
  combo_items: z.array(z.object({ product_id: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(20) })).max(15).default([]),
  sort_order: z.coerce.number().int().min(0).default(0),
  modifier_groups: z.array(groupSchema).max(8).default([]),
});

export const promotionSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(200).default(''),
    percent: z.coerce.number().gt(0).lt(100),
    target_type: z.enum(['all', 'category', 'product']),
    target_id: z.coerce.number().int().positive().nullable().optional(),
    days: z.array(z.number().int().min(0).max(6)).min(1),
    start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    active: z.boolean().default(true),
  })
  .refine((p) => p.target_type === 'all' || p.target_id, { message: 'Elegí la categoría o el producto', path: ['target_id'] });

// ---------------- Vistas ----------------
let publicCache = { key: '', data: null };
eventBus.on('domain-event', (e) => {
  if (e.type === Events.MENU_CHANGED) publicCache = { key: '', data: null };
});

const mediaUrls = (p) => ({
  image: p.image_path ?? null,
  image_sm: p.image_path ? p.image_path.replace(/\.webp$/, '-sm.webp') : null,
  model: p.model_path ?? null,
});

function toPublicProduct(p, promos, byId) {
  const { finalPrice, promo } = pricingService.priceFor(p, promos);
  const combo = p.is_combo
    ? p.combo_items.map((ci) => ({ name: byId.get(ci.product_id)?.name ?? '—', quantity: ci.quantity }))
    : [];
  const regular = p.is_combo ? p.combo_items.reduce((s, ci) => s + (byId.get(ci.product_id)?.price ?? 0) * ci.quantity, 0) : null;
  return {
    id: p.id,
    category_id: p.category_id,
    name: p.name,
    description: p.description,
    price: p.price,
    final_price: finalPrice,
    promo,
    regular_price: regular && regular > finalPrice ? regular : null,
    prep_minutes: p.prep_minutes,
    diameter_cm: p.diameter_cm,
    serves: p.serves,
    badge: p.badge,
    tags: p.tags,
    allergens: p.allergens,
    is_alcoholic: p.is_alcoholic,
    featured: p.featured,
    is_combo: p.is_combo,
    combo,
    modifier_groups: p.modifier_groups,
    ...mediaUrls(p),
  };
}

const adminProduct = (id) => {
  const p = menuRepository.findProduct(id);
  return p && { ...p, ...pricingService.priceFor(p), ...mediaUrls(p) };
};

export const menuService = {
  /** Carta pública (cacheada por minuto, ya que las promos dependen del horario). */
  publicMenu() {
    const minuteKey = new Date().toISOString().slice(0, 16);
    if (publicCache.key === minuteKey && publicCache.data) return publicCache.data;
    const promos = pricingService.activePromotions();
    const all = menuRepository.products({ onlyAvailable: false });
    const byId = new Map(all.map((p) => [p.id, p]));
    const data = {
      categories: menuRepository.categories({ onlyActive: true }).filter((c) => c.product_count > 0).map(({ id, name, icon, product_count }) => ({ id, name, icon, count: product_count })),
      products: menuRepository.products({ onlyAvailable: true }).map((p) => toPublicProduct(p, promos, byId)),
      promotions: promos.map(({ id, name, description, percent, start_time, end_time }) => ({ id, name, description, percent, start_time, end_time })),
    };
    publicCache = { key: minuteKey, data };
    return data;
  },

  adminCatalog() {
    const promos = pricingService.activePromotions();
    const products = menuRepository.products().map((p) => ({ ...p, ...pricingService.priceFor(p, promos), ...mediaUrls(p) }));
    return {
      categories: menuRepository.categories(),
      products,
      promotions: menuRepository.promotions(),
      activePromotionIds: promos.map((p) => p.id),
      constants: { stations: STATIONS, tags: DIETARY_TAGS, allergens: ALLERGENS, icons: CATEGORY_ICONS },
    };
  },

  saveCategory(user, id, data) {
    if (id) {
      if (!menuRepository.updateCategory(id, data)) throw notFound('Categoría inexistente');
    } else id = menuRepository.createCategory(data);
    audit(user.id, id ? 'guardar_categoria' : 'crear_categoria', 'category', id, data);
    this.changed();
    return id;
  },

  deleteCategory(user, id) {
    if (menuRepository.categoryInUse(id)) throw conflict('La categoría tiene platos. Movelos o eliminalos primero.');
    if (!menuRepository.deleteCategory(id)) throw notFound('Categoría inexistente');
    audit(user.id, 'eliminar_categoria', 'category', id);
    this.changed();
  },

  saveProduct(user, id, data) {
    const current = id ? menuRepository.findProduct(id) : null;
    if (id && !current) throw notFound('Plato inexistente');
    const priceChanged = !current || current.price !== data.price || current.cost !== data.cost;
    if (priceChanged && !user.permissions.has('carta.precios')) throw forbidden('No tenés permiso para modificar precios');
    if (data.is_combo) {
      if (!data.combo_items.length) throw badRequest('Un combo debe incluir al menos un producto');
      const found = menuRepository.findProductsByIds(data.combo_items.map((c) => c.product_id));
      if (found.length !== new Set(data.combo_items.map((c) => c.product_id)).size) throw badRequest('El combo incluye productos inexistentes');
      if (found.some((p) => p.is_combo)) throw badRequest('Un combo no puede incluir otro combo');
    }
    const savedId = menuRepository.saveProduct(id, data);
    // Si cambió el diámetro y el modelo es automático, se regenera a la nueva escala.
    if (current && current.model_auto && current.diameter_cm !== data.diameter_cm) this.regenerateAutoModel(savedId);
    audit(user.id, id ? 'editar_plato' : 'crear_plato', 'product', savedId, { name: data.name, price: data.price });
    this.changed();
    return adminProduct(savedId);
  },

  setAvailability(user, id, available) {
    if (!menuRepository.setAvailability(id, available)) throw notFound('Plato inexistente');
    audit(user.id, available ? 'activar_plato' : 'pausar_plato', 'product', id);
    this.changed();
  },

  deleteProduct(user, id) {
    if (!menuRepository.softDelete(id)) throw notFound('Plato inexistente');
    audit(user.id, 'eliminar_plato', 'product', id);
    this.changed();
  },

  async setImage(user, id, file) {
    const p = menuRepository.findProduct(id);
    if (!p) throw notFound('Plato inexistente');
    if (!file) throw badRequest('Adjuntá una imagen');
    const imagePath = await mediaService.saveProductImage(id, file.buffer, file.mimetype);
    mediaService.removeImage(p.image_path);
    menuRepository.setMedia(id, { image_path: imagePath });
    if (!p.model_path || p.model_auto) this.regenerateAutoModel(id);
    audit(user.id, 'subir_imagen', 'product', id);
    this.changed();
    return adminProduct(id);
  },

  removeImage(user, id) {
    const p = menuRepository.findProduct(id);
    if (!p) throw notFound('Plato inexistente');
    mediaService.removeImage(p.image_path);
    const fields = { image_path: null };
    if (p.model_auto) {
      mediaService.remove(p.model_path);
      Object.assign(fields, { model_path: null, model_auto: 0 });
    }
    menuRepository.setMedia(id, fields);
    audit(user.id, 'quitar_imagen', 'product', id);
    this.changed();
  },

  async setModel(user, id, file) {
    const p = menuRepository.findProduct(id);
    if (!p) throw notFound('Plato inexistente');
    if (!file) throw badRequest('Adjuntá un modelo .glb');
    const modelPath = await mediaService.saveProductModel(id, file.buffer);
    mediaService.remove(p.model_path);
    menuRepository.setMedia(id, { model_path: modelPath, model_auto: 0 });
    audit(user.id, 'subir_modelo_3d', 'product', id);
    this.changed();
    return adminProduct(id);
  },

  /** Quita el modelo personalizado y vuelve al automático (si hay foto y diámetro). */
  resetModel(user, id) {
    const p = menuRepository.findProduct(id);
    if (!p) throw notFound('Plato inexistente');
    mediaService.remove(p.model_path);
    menuRepository.setMedia(id, { model_path: null, model_auto: 0 });
    this.regenerateAutoModel(id);
    audit(user.id, 'restablecer_modelo_3d', 'product', id);
    this.changed();
    return adminProduct(id);
  },

  regenerateAutoModel(id) {
    const p = menuRepository.findProduct(id);
    if (p.model_auto) mediaService.remove(p.model_path);
    const generated = mediaService.generatePlateModel(p);
    menuRepository.setMedia(id, { model_path: generated, model_auto: generated ? 1 : 0 });
  },

  bulkAdjust(user, { percent, category_id: categoryId, round_to: roundTo }) {
    const count = menuRepository.bulkAdjust(percent, categoryId, roundTo);
    audit(user.id, 'ajuste_masivo_precios', 'product', null, { percent, categoryId, count });
    this.changed();
    return count;
  },

  savePromotion(user, id, data) {
    const saved = menuRepository.savePromotion(id, data);
    audit(user.id, 'guardar_promocion', 'promotion', saved, data);
    this.changed();
    return saved;
  },

  deletePromotion(user, id) {
    if (!menuRepository.deletePromotion(id)) throw notFound('Promoción inexistente');
    audit(user.id, 'eliminar_promocion', 'promotion', id);
    this.changed();
  },

  changed() {
    eventBus.publish(Events.MENU_CHANGED);
  },
};
