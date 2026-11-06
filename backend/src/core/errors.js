export class AppError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'No autenticado') => new AppError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'No tenés permiso para esta acción') => new AppError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Recurso no encontrado') => new AppError(404, msg, 'NOT_FOUND');
export const conflict = (msg) => new AppError(409, msg, 'CONFLICT');
