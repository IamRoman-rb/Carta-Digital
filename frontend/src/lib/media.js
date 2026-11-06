const UPLOADS = import.meta.env.VITE_UPLOADS_URL;
if (!UPLOADS) throw new Error('Falta VITE_UPLOADS_URL (ver frontend/.env.example)');

export const mediaUrl = (rel) => (rel ? `${UPLOADS}/${rel}` : null);
