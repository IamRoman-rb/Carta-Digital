/**
 * "Plato en tu mesa" con la cámara del comensal, para celulares sin soporte AR nativo
 * (navegadores dentro de apps, Android sin ARCore, iPhone fuera de Safari, etc.).
 *
 * La cámara trasera se muestra de fondo y el modelo 3D se dibuja encima, apoyado sobre la mesa:
 *  - la inclinación del celular (DeviceOrientation) define el ángulo de vista del plato,
 *  - el tamaño inicial se estima para que el plato se vea a escala real a ~45 cm de distancia,
 *  - se puede arrastrar para ubicarlo y pellizcar para ajustar el tamaño.
 * Cuando el dispositivo soporta AR nativo (WebXR / Scene Viewer / Quick Look) se usa eso, que detecta
 * la superficie de la mesa y garantiza escala 1:1; este modo es el respaldo universal.
 */
import { useEffect, useRef, useState } from 'react';
import { CameraOff, Move, RotateCw, ShoppingBag, X } from 'lucide-react';
import { mediaUrl } from '../../lib/media.js';
import { money } from '../../lib/format.js';
import { Button, IconButton, Spinner } from '../../ui/index.jsx';

// Supuestos de la estimación de escala (cámara principal típica de celular).
const VIEW_DISTANCE_M = 0.45;
const CAMERA_LONG_SIDE_FOV_DEG = 65;
// Fracción del lienzo de <model-viewer> que ocupa el diámetro del plato con encuadre automático.
// Valor inicial; al cargar el modelo se calcula exacto con su tamaño, la distancia y el FOV de la cámara 3D.
const DEFAULT_PLATE_FILL = 0.72;
const DEFAULT_TILT = 60;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function realSizePx(diameterCm) {
  const longSide = Math.max(window.innerWidth, window.innerHeight);
  const visibleM = 2 * VIEW_DISTANCE_M * Math.tan(((CAMERA_LONG_SIDE_FOV_DEG / 2) * Math.PI) / 180);
  return ((diameterCm || 26) / 100) * (longSide / visibleM);
}

function cameraError(err) {
  if (!window.isSecureContext) return 'La cámara solo funciona con conexión segura (https).';
  if (err?.name === 'NotAllowedError') return 'No tenemos permiso para usar la cámara. Habilitalo en los ajustes del navegador y volvé a intentar.';
  return 'No pudimos abrir la cámara de este dispositivo.';
}

export default function CameraPlate({ product, onClose, onAdd }) {
  const video = useRef(null);
  const viewer = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [hint, setHint] = useState(true);
  const [fill, setFill] = useState(DEFAULT_PLATE_FILL);
  const orbit = useRef({ theta: 0, phi: DEFAULT_TILT });

  // Cámara trasera de fondo.
  useEffect(() => {
    let stream;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => setError(cameraError()));
      return undefined;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (s) => {
        stream = s;
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
        setReady(true);
      })
      .catch((err) => !cancelled && setError(cameraError(err)));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // La inclinación del celular define desde qué ángulo se ve el plato apoyado en la mesa.
  useEffect(() => {
    const apply = () => {
      const el = viewer.current;
      if (el) el.cameraOrbit = `${orbit.current.theta}deg ${orbit.current.phi}deg auto`;
    };
    const onTilt = (e) => {
      if (e.beta == null) return;
      // beta 0 = celular acostado (vista cenital), 90 = vertical (vista a ras de la mesa).
      orbit.current.phi = clamp(Math.abs(e.beta), 8, 82);
      apply();
    };
    window.addEventListener('deviceorientation', onTilt);
    return () => window.removeEventListener('deviceorientation', onTilt);
  }, []);

  // Proyección real del plato en el lienzo 3D: diámetro / ancho visible a la distancia de la cámara.
  useEffect(() => {
    const el = viewer.current;
    if (!el) return undefined;
    const measure = () => {
      const dims = el.getDimensions?.();
      const radius = el.getCameraOrbit?.().radius;
      const fov = el.getFieldOfView?.();
      if (!dims || !radius || !fov) return;
      const visible = 2 * radius * Math.tan(((fov / 2) * Math.PI) / 180);
      const ratio = Math.max(dims.x, dims.z) / visible;
      if (ratio > 0.1 && ratio < 1.5) setFill(ratio);
    };
    el.addEventListener('load', measure);
    return () => el.removeEventListener('load', measure);
  }, [error]);

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 6000);
    return () => clearTimeout(t);
  }, []);

  // Gestos: un dedo mueve el plato, dos dedos cambian el tamaño.
  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = null;
    setHint(false);
  }
  function onPointerMove(e) {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    if (map.size === 1) {
      setPos((p) => ({ x: p.x + next.x - prev.x, y: p.y + next.y - prev.y }));
    } else if (map.size === 2) {
      const [a, b] = [...map.values()];
      const other = a === prev ? b : a;
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 0) setZoom((z) => clamp(z * (after / before), 0.4, 3));
    }
    map.set(e.pointerId, next);
  }
  function onPointerUp(e) {
    pointers.current.delete(e.pointerId);
  }
  function onWheel(e) {
    setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.06 : 0.94), 0.4, 3));
  }
  function rotate() {
    orbit.current.theta = (orbit.current.theta + 45) % 360;
    if (viewer.current) viewer.current.cameraOrbit = `${orbit.current.theta}deg ${orbit.current.phi}deg auto`;
  }

  const size = (realSizePx(product.diameter_cm) / fill) * zoom;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${product.name} sobre tu mesa`} className="fixed inset-0 z-[60] overflow-hidden bg-black text-white">
      <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" aria-hidden="true" />

      {error ? (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-card-lg bg-surface p-6 text-center text-on-surface shadow-overlay" role="alert">
            <CameraOff className="size-10 text-primary" aria-hidden="true" />
            <p className="text-sm">{error}</p>
            <Button onClick={onClose}>Volver al 3D</Button>
          </div>
        </div>
      ) : (
        <div
          className="absolute inset-0 touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {!ready && <Spinner className="absolute inset-0 !text-white" label="Abriendo la cámara…" />}
          <model-viewer
            ref={viewer}
            src={mediaUrl(product.model)}
            alt={`${product.name} sobre la mesa`}
            camera-orbit={`0deg ${DEFAULT_TILT}deg auto`}
            interpolation-decay="120"
            shadow-intensity="1.2"
            shadow-softness="0.6"
            exposure="1.05"
            interaction-prompt="none"
            disable-tap
            loading="eager"
            style={{
              position: 'absolute',
              left: `calc(50% - ${size / 2}px + ${pos.x}px)`,
              top: `calc(58% - ${size / 2}px + ${pos.y}px)`,
              width: `${size}px`,
              height: `${size}px`,
              pointerEvents: 'none',
              background: 'transparent',
              '--poster-color': 'transparent',
            }}
          />
        </div>
      )}

      <header className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="min-w-0">
          <p className="truncate font-headline text-headline-sm font-bold">{product.name}</p>
          <p className="text-label text-white/80">{product.diameter_cm ? `Ø ${product.diameter_cm} cm · ` : ''}tamaño aproximado</p>
        </div>
        <IconButton label="Cerrar cámara" icon={X} variant="dark" onClick={onClose} />
      </header>

      {!error && hint && (
        <p className="pointer-events-none absolute inset-x-6 top-24 mx-auto flex max-w-sm items-start gap-2 rounded-card bg-black/60 p-3 text-sm" role="status">
          <Move className="size-5 shrink-0 text-secondary-container" aria-hidden="true" />
          Apuntá a tu mesa a unos 45 cm. Arrastrá el plato para ubicarlo y pellizcá para ajustar el tamaño.
        </p>
      )}

      {!error && (
        <footer className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/75 to-transparent p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <IconButton label="Girar el plato" icon={RotateCw} variant="dark" onClick={rotate} />
          <Button size="lg" icon={ShoppingBag} className="flex-1" onClick={onAdd}>
            Agregar · {money(product.final_price)}
          </Button>
        </footer>
      )}
    </div>
  );
}
