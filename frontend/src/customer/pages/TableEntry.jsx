import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { QrCode } from 'lucide-react';
import { tableActions } from '../store.js';
import { Spinner } from '../../ui/index.jsx';

/** Destino del QR impreso en cada mesa (escaneado con la cámara del celular): hace el check-in y entra a la carta. */
export default function TableEntry() {
  const { token } = useParams();
  const [, navigate] = useLocation();
  const [error, setError] = useState(null);

  useEffect(() => {
    tableActions
      .checkin(token)
      .then(() => navigate('/', { replace: true }))
      .catch((err) => setError(err));
  }, [token, navigate]);

  if (!error) return <Spinner className="min-h-dvh" label="Ubicando tu mesa…" />;
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <QrCode className="size-14 text-primary" aria-hidden="true" />
        <h1 className="font-headline text-headline-md font-bold">No reconocimos este código</h1>
        <p className="text-on-surface-variant">{error.message}</p>
        <a href="/" className="mt-2 font-semibold text-primary underline">Ver la carta igualmente</a>
      </div>
    </main>
  );
}
