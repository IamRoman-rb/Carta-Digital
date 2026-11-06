-- Esquema inicial. Montos en centavos (INTEGER) – ISO 4217 ARS.
-- Fechas en ISO 8601 UTC (TEXT).

CREATE TABLE roles (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  is_system   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE permissions (
  code        TEXT PRIMARY KEY,
  grp         TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id         INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE sectors (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE users (
  id                   INTEGER PRIMARY KEY,
  name                 TEXT NOT NULL,
  username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash        TEXT NOT NULL,
  role_id              INTEGER NOT NULL REFERENCES roles(id),
  sector_id            INTEGER REFERENCES sectors(id) ON DELETE SET NULL,
  active               INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  failed_attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  last_login_at        TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE refresh_tokens (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE dining_tables (
  id         INTEGER PRIMARY KEY,
  sector_id  INTEGER NOT NULL REFERENCES sectors(id),
  number     INTEGER NOT NULL,
  label      TEXT,
  seats      INTEGER NOT NULL DEFAULT 4,
  shape      TEXT NOT NULL DEFAULT 'square' CHECK (shape IN ('round','square','rect')),
  pos_x      REAL NOT NULL DEFAULT 10,
  pos_y      REAL NOT NULL DEFAULT 10,
  qr_token   TEXT NOT NULL UNIQUE,
  active     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (sector_id, number)
);

CREATE TABLE table_sessions (
  id            INTEGER PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','billing','closed')),
  waiter_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guests        INTEGER NOT NULL DEFAULT 1,
  discount_pct  REAL NOT NULL DEFAULT 0,
  discount_reason TEXT,
  opened_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  opened_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  closed_at     TEXT,
  closed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  merged_into   INTEGER REFERENCES table_sessions(id)
);
CREATE INDEX ix_sessions_status ON table_sessions(status);

-- Relación N:M: una cuenta (sesión) puede abarcar varias mesas unidas.
CREATE TABLE session_tables (
  session_id INTEGER NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  table_id   INTEGER NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
  active     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (session_id, table_id)
);
CREATE UNIQUE INDEX ux_table_one_active_session ON session_tables(table_id) WHERE active = 1;

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  icon       TEXT NOT NULL DEFAULT 'utensils',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE products (
  id            INTEGER PRIMARY KEY,
  category_id   INTEGER NOT NULL REFERENCES categories(id),
  sku           TEXT UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  price         INTEGER NOT NULL CHECK (price >= 0),
  cost          INTEGER NOT NULL DEFAULT 0 CHECK (cost >= 0),
  vat_rate      REAL NOT NULL DEFAULT 21,
  prep_minutes  INTEGER NOT NULL DEFAULT 15,
  station       TEXT NOT NULL DEFAULT 'cocina',
  image_path    TEXT,
  model_path    TEXT,
  model_auto    INTEGER NOT NULL DEFAULT 0,
  diameter_cm   REAL,
  serves        TEXT,
  badge         TEXT,
  tags          TEXT NOT NULL DEFAULT '[]',
  allergens     TEXT NOT NULL DEFAULT '[]',
  is_alcoholic  INTEGER NOT NULL DEFAULT 0,
  available     INTEGER NOT NULL DEFAULT 1,
  featured      INTEGER NOT NULL DEFAULT 0,
  is_combo      INTEGER NOT NULL DEFAULT 0,
  combo_items   TEXT NOT NULL DEFAULT '[]',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  deleted_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_products_category ON products(category_id);

CREATE TABLE modifier_groups (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 0,
  max_select INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE modifier_options (
  id          INTEGER PRIMARY KEY,
  group_id    INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_delta INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE promotions (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  percent     REAL NOT NULL CHECK (percent > 0 AND percent < 100),
  target_type TEXT NOT NULL CHECK (target_type IN ('all','category','product')),
  target_id   INTEGER,
  days        TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
  start_time  TEXT NOT NULL DEFAULT '00:00',
  end_time    TEXT NOT NULL DEFAULT '23:59',
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('cliente','staff')),
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_orders_session ON orders(session_id);

CREATE TABLE order_items (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  unit_price    INTEGER NOT NULL,
  unit_cost     INTEGER NOT NULL DEFAULT 0,
  vat_rate      REAL NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  modifiers     TEXT NOT NULL DEFAULT '[]',
  notes         TEXT,
  station       TEXT NOT NULL,
  promo         TEXT,
  status        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (status IN ('pendiente','preparando','listo','entregado','anulado')),
  started_at    TEXT,
  ready_at      TEXT,
  delivered_at  TEXT,
  cancelled_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cancel_reason TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_items_status ON order_items(status);
CREATE INDEX ix_items_order ON order_items(order_id);

CREATE TABLE service_calls (
  id          INTEGER PRIMARY KEY,
  session_id  INTEGER REFERENCES table_sessions(id) ON DELETE CASCADE,
  table_id    INTEGER NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('mozo','cuenta')),
  detail      TEXT,
  status      TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','atendida')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  attended_at TEXT,
  attended_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE cash_sessions (
  id              INTEGER PRIMARY KEY,
  opened_by       INTEGER NOT NULL REFERENCES users(id),
  opened_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  opening_amount  INTEGER NOT NULL DEFAULT 0,
  closed_by       INTEGER REFERENCES users(id),
  closed_at       TEXT,
  expected_cash   INTEGER,
  counted_cash    INTEGER,
  notes           TEXT
);
CREATE UNIQUE INDEX ux_one_open_cash ON cash_sessions((1)) WHERE closed_at IS NULL;

CREATE TABLE payments (
  id              INTEGER PRIMARY KEY,
  session_id      INTEGER NOT NULL REFERENCES table_sessions(id),
  cash_session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
  method          TEXT NOT NULL CHECK (method IN ('efectivo','debito','credito','qr','transferencia')),
  amount          INTEGER NOT NULL CHECK (amount > 0),
  tip             INTEGER NOT NULL DEFAULT 0 CHECK (tip >= 0),
  received        INTEGER,
  change_given    INTEGER,
  reference       TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ix_payments_session ON payments(session_id);

-- Comprobantes emitidos: inmutables (no se editan ni borran).
CREATE TABLE tickets (
  id             INTEGER PRIMARY KEY,
  session_id     INTEGER NOT NULL REFERENCES table_sessions(id),
  kind           TEXT NOT NULL,          -- precuenta | comprobante
  cbte_tipo      INTEGER,                -- código ARCA (1=A, 6=B, 11=C) o NULL si interno
  letter         TEXT NOT NULL,          -- A | B | C | X
  pos_number     INTEGER NOT NULL,
  number         INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  cae            TEXT,
  cae_due        TEXT,
  payload        TEXT NOT NULL,          -- snapshot JSON completo
  issued_by      INTEGER REFERENCES users(id),
  issued_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (kind, letter, pos_number, number)
);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TRIGGER trg_tickets_no_update BEFORE UPDATE ON tickets
BEGIN SELECT RAISE(ABORT, 'Los comprobantes emitidos son inmutables'); END;
CREATE TRIGGER trg_tickets_no_delete BEFORE DELETE ON tickets
BEGIN SELECT RAISE(ABORT, 'Los comprobantes emitidos son inmutables'); END;
