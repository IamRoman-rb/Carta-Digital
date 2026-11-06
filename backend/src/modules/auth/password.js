import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../../config/env.js';

/** Política de contraseñas (ISO/IEC 27002 5.17): mínimo 8, letras y números. */
export const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(72, 'Máximo 72 caracteres (límite de bcrypt)')
  .regex(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/, 'Debe incluir letras')
  .regex(/\d/, 'Debe incluir números');

export const hashPassword = (plain) => bcrypt.hash(plain, env.BCRYPT_ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Hash ficticio para igualar tiempos cuando el usuario no existe (evita enumeración).
export const DUMMY_HASH = bcrypt.hashSync(`dummy-${Date.now()}`, env.BCRYPT_ROUNDS);
