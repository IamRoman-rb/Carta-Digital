/**
 * Procesamiento de medios optimizado para datos móviles:
 * - Fotos -> WebP (960px y 480px) con nombres con hash (caché inmutable).
 * - Textura JPEG cuadrada para el modelo 3D automático.
 * - Validación de modelos .glb subidos.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import { env } from '../../config/env.js';
import { badRequest } from '../../core/errors.js';
import { buildPlateGlb } from './glbPlateBuilder.js';

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

const dir = (sub) => {
  const d = path.join(env.uploadDir, sub);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

const hash = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);

export const mediaService = {
  async saveProductImage(productId, buffer, mimetype) {
    if (!IMAGE_MIME.has(mimetype)) throw badRequest('Formato de imagen no soportado (JPG, PNG o WebP)');
    const meta = await sharp(buffer).metadata().catch(() => null);
    if (!meta?.width) throw badRequest('La imagen está dañada o no es válida');
    const base = `p${productId}-${hash(buffer)}`;
    const images = dir('images');
    const pipeline = sharp(buffer).rotate();
    await pipeline.clone().resize({ width: 960, withoutEnlargement: true }).webp({ quality: 72 }).toFile(path.join(images, `${base}.webp`));
    await pipeline.clone().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 68 }).toFile(path.join(images, `${base}-sm.webp`));
    await pipeline.clone().resize(512, 512, { fit: 'cover' }).jpeg({ quality: 78 }).toFile(path.join(images, `${base}-tex.jpg`));
    return `images/${base}.webp`;
  },

  async saveProductModel(productId, buffer) {
    if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) {
      throw badRequest('El archivo no es un modelo glTF binario (.glb) válido');
    }
    const name = `p${productId}-${hash(buffer)}.glb`;
    fs.writeFileSync(path.join(dir('models'), name), buffer);
    return `models/${name}`;
  },

  /** Genera el modelo 3D automático (plato a escala real) a partir de la foto. */
  generatePlateModel(product) {
    if (!product.image_path || !product.diameter_cm) return null;
    const texture = path.join(env.uploadDir, product.image_path.replace(/\.webp$/, '-tex.jpg'));
    if (!fs.existsSync(texture)) return null;
    const glb = buildPlateGlb({ diameterCm: product.diameter_cm, textureJpeg: fs.readFileSync(texture), name: product.name });
    const name = `p${product.id}-auto-${hash(glb)}.glb`;
    fs.writeFileSync(path.join(dir('models'), name), glb);
    return `models/${name}`;
  },

  removeImage(relPath) {
    if (!relPath) return;
    for (const suffix of ['.webp', '-sm.webp', '-tex.jpg']) this.remove(relPath.replace(/\.webp$/, suffix));
  },

  remove(relPath) {
    if (!relPath) return;
    const full = path.join(env.uploadDir, relPath);
    if (full.startsWith(env.uploadDir)) fs.rm(full, { force: true }, () => {});
  },
};
