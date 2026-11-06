/**
 * Escáner del QR de la mesa (se descarga solo cuando hace falta).
 * Usa BarcodeDetector nativo cuando el navegador lo trae y, si no, jsQR (liviano, sin workers).
 * No hay carga manual de códigos: para pedir hay que estar físicamente en la mesa y escanear su QR.
 */
import { useEffect, useRef, useState } from 'react';
import { CameraOff, CheckCircle2, QrCode, RefreshCw, X } from 'lucide-react';
import { Button, IconButton, Spinner } from '../../ui/index.jsx';
import { qrTokenFrom, scannerActions, tableActions } from '../store.js';

const SCAN_INTERVAL_MS = 160;
const MAX_SCAN_WIDTH = 640;

async function createDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      /* se usa jsQR */
    }
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const scale = Math.min(1, MAX_SCAN_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

function cameraErrorMessage(err) {
  if (!window.isSecureContext) return 'La cámara solo funciona en conexiones seguras (https).';
  if (err?.name === 'NotAllowedError') return 'No tenemos permiso para usar la cámara. Habilitalo en tu navegador o escaneá el QR con la app de cámara de tu celular.';
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return 'No encontramos una cámara en este dispositivo. Escaneá el QR de la mesa con la cámara de tu celular.';
  return 'No pudimos abrir la cámara. Escaneá el QR de la mesa con la app de cámara de tu celular.';
}

const cameraSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export default function TableScanner({ reason }) {
  const video = useRef(null);
  const [phase, setPhase] = useState(cameraSupported ? 'starting' : 'error'); // starting | scanning | checking | done | error
  const [message, setMessage] = useState(cameraSupported ? null : cameraErrorMessage());
  const [table, setTable] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stream;
    let timer;
    let cancelled = false;
    let busy = false;

    async function start() {
      setPhase('starting');
      setMessage(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (cancelled) return;
        const el = video.current;
        el.srcObject = stream;
        await el.play();
        const detect = await createDetector();
        if (cancelled) return;
        setPhase('scanning');
        const tick = async () => {
          if (cancelled) return;
          if (!busy && el.readyState >= 2 && el.videoWidth) {
            busy = true;
            try {
              const text = await detect(el);
              if (text) await handle(text);
            } catch {
              /* frame ilegible: se reintenta */
            } finally {
              busy = false;
            }
          }
          if (!cancelled) timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        tick();
      } catch (err) {
        if (!cancelled) {
          setPhase('error');
          setMessage(cameraErrorMessage(err));
        }
      }
    }

    async function handle(text) {
      const token = qrTokenFrom(text);
      if (!token) {
        setMessage('Ese código no es el QR de una mesa. Buscá el que está impreso en tu mesa.');
        return;
      }
      setPhase('checking');
      try {
        const info = await tableActions.checkin(token);
        cancelled = true;
        stream?.getTracks().forEach((t) => t.stop());
        navigator.vibrate?.(60);
        setTable(info);
        setPhase('done');
        setTimeout(() => scannerActions.done(info), 1200);
      } catch (err) {
        setMessage(err.status === 404 ? 'No reconocemos ese QR. Escaneá el de tu mesa.' : err.message);
        setPhase('scanning');
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    if (cameraSupported) start();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [attempt]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="scan-title" className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-black/45 [mask-image:radial-gradient(circle_at_50%_45%,transparent_34%,black_35%)]" aria-hidden="true" />

      <header className="relative flex items-start justify-between gap-3 p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div>
          <h2 id="scan-title" className="font-headline text-headline-sm font-bold">Escaneá el QR de tu mesa</h2>
          <p className="mt-1 max-w-sm text-sm text-white/80">{reason ?? 'Así sabemos a qué mesa llevar tu pedido.'}</p>
        </div>
        <IconButton label="Cancelar" icon={X} variant="dark" onClick={() => scannerActions.done(null)} />
      </header>

      <div className="relative flex flex-1 items-center justify-center">
        <div className="relative aspect-square w-[min(68vw,320px)]" aria-hidden="true">
          {['top-0 left-0 border-t-4 border-l-4 rounded-tl-3xl', 'top-0 right-0 border-t-4 border-r-4 rounded-tr-3xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl'].map((c) => (
            <span key={c} className={`absolute size-12 border-secondary-container ${c}`} />
          ))}
          {phase === 'scanning' && <span className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse bg-secondary-container/80" />}
        </div>

        {phase === 'starting' && <Spinner className="absolute !text-white" label="Abriendo la cámara…" />}
        {phase === 'checking' && <Spinner className="absolute rounded-full bg-black/60 !py-3 !text-white" label="Ubicando tu mesa…" />}
        {phase === 'done' && table && (
          <div className="absolute flex flex-col items-center gap-2 rounded-card-lg bg-surface px-8 py-6 text-center text-on-surface shadow-overlay" role="status">
            <CheckCircle2 className="size-12 text-tertiary" aria-hidden="true" />
            <p className="font-headline text-headline-md font-bold">Mesa {table.session?.tables?.join(' + ') ?? table.table.number}</p>
            <p className="text-sm text-on-surface-variant">{table.table.sector}</p>
          </div>
        )}
        {phase === 'error' && (
          <div className="absolute mx-6 flex max-w-sm flex-col items-center gap-3 rounded-card-lg bg-surface p-6 text-center text-on-surface shadow-overlay" role="alert">
            <CameraOff className="size-10 text-primary" aria-hidden="true" />
            <p className="text-sm">{message}</p>
            <Button icon={RefreshCw} onClick={() => setAttempt((a) => a + 1)}>Reintentar</Button>
          </div>
        )}
      </div>

      <footer className="relative p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <p className="mx-auto flex max-w-sm items-start gap-3 rounded-card bg-black/60 p-3 text-sm" aria-live="polite">
          <QrCode className="size-5 shrink-0 text-secondary-container" aria-hidden="true" />
          {phase === 'scanning' && message ? message : 'Encuadrá el código QR impreso en la mesa, donde figura su número.'}
        </p>
      </footer>
    </div>
  );
}
