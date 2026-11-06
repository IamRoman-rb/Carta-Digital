import { getDb } from '../../db/connection.js';
import { parseJson } from '../../core/utils.js';

const hydrate = (p) =>
  p && {
    ...p,
    tags: parseJson(p.tags, []),
    allergens: parseJson(p.allergens, []),
    combo_items: parseJson(p.combo_items, []),
    available: !!p.available,
    featured: !!p.featured,
    is_combo: !!p.is_combo,
    is_alcoholic: !!p.is_alcoholic,
    model_auto: !!p.model_auto,
  };

export const menuRepository = {
  // ---------- Categorías ----------
  categories({ onlyActive = false } = {}) {
    return getDb()
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL ${onlyActive ? 'AND p.available = 1' : ''}) AS product_count
         FROM categories c ${onlyActive ? 'WHERE c.active = 1' : ''} ORDER BY c.sort_order, c.name`,
      )
      .all()
      .map((c) => ({ ...c, active: !!c.active }));
  },
  createCategory({ name, icon, sort_order: sort, active }) {
    return Number(getDb().prepare('INSERT INTO categories (name, icon, sort_order, active) VALUES (?, ?, ?, ?)').run(name, icon, sort, active ? 1 : 0).lastInsertRowid);
  },
  updateCategory(id, { name, icon, sort_order: sort, active }) {
    return getDb().prepare('UPDATE categories SET name = ?, icon = ?, sort_order = ?, active = ? WHERE id = ?').run(name, icon, sort, active ? 1 : 0, id).changes;
  },
  deleteCategory(id) {
    return getDb().prepare('DELETE FROM categories WHERE id = ?').run(id).changes;
  },
  categoryInUse(id) {
    return getDb().prepare('SELECT COUNT(*) FROM products WHERE category_id = ? AND deleted_at IS NULL').pluck().get(id) > 0;
  },

  // ---------- Productos ----------
  products({ onlyAvailable = false } = {}) {
    const rows = getDb()
      .prepare(
        `SELECT p.* FROM products p JOIN categories c ON c.id = p.category_id
         WHERE p.deleted_at IS NULL ${onlyAvailable ? 'AND p.available = 1 AND c.active = 1' : ''}
         ORDER BY c.sort_order, p.sort_order, p.name`,
      )
      .all()
      .map(hydrate);
    const groups = this.modifierGroups(rows.map((r) => r.id));
    return rows.map((p) => ({ ...p, modifier_groups: groups.get(p.id) ?? [] }));
  },

  findProduct(id) {
    const p = hydrate(getDb().prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL').get(id));
    if (!p) return null;
    return { ...p, modifier_groups: this.modifierGroups([p.id]).get(p.id) ?? [] };
  },

  findProductsByIds(ids) {
    if (!ids.length) return [];
    const marks = ids.map(() => '?').join(',');
    const rows = getDb().prepare(`SELECT * FROM products WHERE deleted_at IS NULL AND id IN (${marks})`).all(...ids).map(hydrate);
    const groups = this.modifierGroups(rows.map((r) => r.id));
    return rows.map((p) => ({ ...p, modifier_groups: groups.get(p.id) ?? [] }));
  },

  modifierGroups(productIds) {
    const map = new Map();
    if (!productIds.length) return map;
    const marks = productIds.map(() => '?').join(',');
    const db = getDb();
    const groups = db.prepare(`SELECT * FROM modifier_groups WHERE product_id IN (${marks}) ORDER BY sort_order, id`).all(...productIds);
    const gIds = groups.map((g) => g.id);
    const options = gIds.length
      ? db.prepare(`SELECT * FROM modifier_options WHERE group_id IN (${gIds.map(() => '?').join(',')}) ORDER BY sort_order, id`).all(...gIds)
      : [];
    for (const g of groups) {
      const list = map.get(g.product_id) ?? [];
      list.push({ id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select, options: options.filter((o) => o.group_id === g.id).map(({ group_id: _g, sort_order: _s, ...o }) => o) });
      map.set(g.product_id, list);
    }
    return map;
  },

  saveProduct(id, data) {
    const db = getDb();
    const cols = {
      category_id: data.category_id,
      sku: data.sku || null,
      name: data.name,
      description: data.description,
      price: data.price,
      cost: data.cost,
      vat_rate: data.vat_rate,
      prep_minutes: data.prep_minutes,
      station: data.station,
      diameter_cm: data.diameter_cm ?? null,
      serves: data.serves || null,
      badge: data.badge || null,
      tags: JSON.stringify(data.tags),
      allergens: JSON.stringify(data.allergens),
      is_alcoholic: data.is_alcoholic ? 1 : 0,
      available: data.available ? 1 : 0,
      featured: data.featured ? 1 : 0,
      is_combo: data.is_combo ? 1 : 0,
      combo_items: JSON.stringify(data.combo_items ?? []),
      sort_order: data.sort_order ?? 0,
    };
    const keys = Object.keys(cols);
    if (id) {
      db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id`).run({ ...cols, id });
    } else {
      id = Number(db.prepare(`INSERT INTO products (${keys.join(', ')}) VALUES (${keys.map((k) => `@${k}`).join(', ')})`).run(cols).lastInsertRowid);
    }
    this.replaceModifierGroups(id, data.modifier_groups ?? []);
    return id;
  },

  replaceModifierGroups(productId, groups) {
    const db = getDb();
    db.prepare('DELETE FROM modifier_groups WHERE product_id = ?').run(productId);
    const insG = db.prepare('INSERT INTO modifier_groups (product_id, name, min_select, max_select, sort_order) VALUES (?, ?, ?, ?, ?)');
    const insO = db.prepare('INSERT INTO modifier_options (group_id, name, description, price_delta, sort_order) VALUES (?, ?, ?, ?, ?)');
    groups.forEach((g, gi) => {
      const gid = insG.run(productId, g.name, g.min_select, g.max_select, gi).lastInsertRowid;
      g.options.forEach((o, oi) => insO.run(gid, o.name, o.description ?? '', o.price_delta ?? 0, oi));
    });
  },

  setMedia(id, fields) {
    const keys = Object.keys(fields);
    getDb().prepare(`UPDATE products SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id`).run({ ...fields, id });
  },

  setAvailability(id, available) {
    return getDb().prepare("UPDATE products SET available = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND deleted_at IS NULL").run(available ? 1 : 0, id).changes;
  },

  softDelete(id) {
    return getDb().prepare("UPDATE products SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), available = 0, sku = NULL WHERE id = ? AND deleted_at IS NULL").run(id).changes;
  },

  bulkAdjust(percent, categoryId, roundTo) {
    const db = getDb();
    const rows = db.prepare(`SELECT id, price FROM products WHERE deleted_at IS NULL ${categoryId ? 'AND category_id = ?' : ''}`).all(...(categoryId ? [categoryId] : []));
    const upd = db.prepare("UPDATE products SET price = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?");
    for (const r of rows) {
      const raw = (r.price * (100 + percent)) / 100;
      upd.run(Math.max(0, Math.round(raw / roundTo) * roundTo), r.id);
    }
    return rows.length;
  },

  // ---------- Promociones ----------
  promotions() {
    return getDb().prepare('SELECT * FROM promotions ORDER BY active DESC, name').all().map((p) => ({ ...p, days: parseJson(p.days, []), active: !!p.active }));
  },
  savePromotion(id, d) {
    const db = getDb();
    const vals = [d.name, d.description, d.percent, d.target_type, d.target_type === 'all' ? null : d.target_id, JSON.stringify(d.days), d.start_time, d.end_time, d.active ? 1 : 0];
    if (id) {
      db.prepare('UPDATE promotions SET name=?, description=?, percent=?, target_type=?, target_id=?, days=?, start_time=?, end_time=?, active=? WHERE id = ?').run(...vals, id);
      return id;
    }
    return Number(db.prepare('INSERT INTO promotions (name, description, percent, target_type, target_id, days, start_time, end_time, active) VALUES (?,?,?,?,?,?,?,?,?)').run(...vals).lastInsertRowid);
  },
  deletePromotion(id) {
    return getDb().prepare('DELETE FROM promotions WHERE id = ?').run(id).changes;
  },
};
