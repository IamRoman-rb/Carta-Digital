-- Check-in de mesa por QR: momento en que la mesa quedó libre por última vez.
-- Un check-in emitido antes de esa fecha deja de servir (los próximos comensales deben escanear de nuevo).
ALTER TABLE dining_tables ADD COLUMN released_at TEXT;
