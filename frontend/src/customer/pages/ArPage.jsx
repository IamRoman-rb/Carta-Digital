/**
 * Realidad Aumentada: el comensal ve el plato apoyado sobre SU mesa con la cámara del celular.
 *  1. AR nativo (preferido): <model-viewer> abre WebXR en Android/Chrome (detecta la superficie de la mesa
 *     con hit-test), Scene Viewer en Android o AR Quick Look en iPhone (genera el USDZ al vuelo).
 *     ar-scale="fixed" garantiza el tamaño real 1:1.
 *  2. Respaldo universal: cámara trasera de fondo + plato 3D encima orientado según la inclinación del
 *     celular (CameraPlate), para dispositivos o navegadores sin AR nativo.
 * Este módulo (y three.js) se descarga solo al entrar a esta pantalla.
 */
import '@google/model-viewer';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { Box, Camera, Pause, Play, RotateCcw, Ruler, ScanLine, ShoppingBag } from 'lucide-react';
import { mediaUrl } from '../../lib/media.js';
import { money } from '../../lib/format.js';
import { TAG_LABELS } from '../../lib/legal.js';
import { notify } from '../../lib/notify.js';
import { Badge, Button, Chip, EmptyState, IconButton, QuantityStepper, Spinner } from '../../ui/index.jsx';
import { cartActions, useMenu } from '../store.js';
import { requestOrientationPermission } from '../../lib/device.js';

const CameraPlate = lazy(() => import('../components/CameraPlate.jsx'));

export default function ArPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { data, loading } = useMenu();
  const viewer = useRef(null);
  const [qty, setQty] = useState(1);
  const [rotate, setRotate] = useState(true);
  const [progress, setProgress] = useState(0);
  const [canAr, setCanAr] = useState(null);
  const [cameraMode, setCameraMode] = useState(false);
  const [arActive, setArActive] = useState(false);

  const products = data?.products.filter((p) => p.model) ?? [];
  const product = products.find((p) => p.id === Number(id)) ?? products[0];

  useEffect(() => {
    const el = viewer.current;
    if (!el) return undefined;
    const onProgress = (e) => setProgress(e.detail.totalProgress);
    const onLoad = () => setCanAr(!!el.canActivateAR);
    const onStatus = (e) => {
      const { status } = e.detail;
      setArActive(status === 'session-started' || status === 'object-placed');
      // Si el AR nativo falla, se pasa al modo cámara para que igual vea el plato sobre la mesa.
      if (status === 'failed') setCameraMode(true);
    };
    el.addEventListener('progress', onProgress);
    el.addEventListener('load', onLoad);
    el.addEventListener('ar-status', onStatus);
    return () => {
      el.removeEventListener('progress', onProgress);
      el.removeEventListener('load', onLoad);
      el.removeEventListener('ar-status', onStatus);
    };
  }, [product?.id]);

  if (loading || !data) return <Spinner />;
  if (!product) return <EmptyState icon={Box} title="Todavía no hay platos en 3D" text="Pronto vas a poder proyectar nuestros platos en tu mesa." />;

  const needsChoice = product.modifier_groups.some((g) => g.min_select > 0);

  /** "Ver en mi mesa": AR nativo si el celular lo soporta; si no, cámara + plato 3D. */
  async function viewOnTable() {
    const el = viewer.current;
    if (el?.canActivateAR) {
      try {
        await el.activateAR();
        return;
      } catch {
        /* se usa el modo cámara */
      }
    }
    await requestOrientationPermission();
    setCameraMode(true);
  }

  function add() {
    setCameraMode(false);
    if (needsChoice) return navigate(`/plato/${product.id}`);
    cartActions.add({ product_id: product.id, name: product.name, unit_price: product.final_price, quantity: qty, modifiers: [], modifierNames: [], notes: '' });
    notify.toast(`${qty}x ${product.name} agregado`);
    setQty(1);
  }

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <section className="relative overflow-hidden rounded-card-lg bg-gradient-to-b from-surface-container to-surface-high shadow-base" aria-label={`Modelo 3D de ${product.name}`}>
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
          <span className="hud flex items-center gap-2 rounded-full px-3 py-1.5 text-label font-semibold text-white">
            <span className="size-2 rounded-full bg-secondary-container" aria-hidden="true" /> Escala física real 1:1
          </span>
          {product.diameter_cm && (
            <span className="flex items-center gap-1.5 self-start rounded-full bg-surface-lowest/90 px-3 py-1 text-label font-semibold">
              <Ruler className="size-3.5" aria-hidden="true" /> Ø {product.diameter_cm} cm
            </span>
          )}
        </div>
        <model-viewer
          ref={viewer}
          key={product.id}
          src={mediaUrl(product.model)}
          alt={`Modelo 3D de ${product.name}`}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="fixed"
          ar-placement="floor"
          camera-controls
          touch-action="pan-y"
          auto-rotate={rotate}
          camera-orbit="0deg 55deg auto"
          shadow-intensity="1"
          exposure="1.05"
          interaction-prompt="none"
          loading="eager"
          style={{ width: '100%', height: 'min(62dvh, 520px)', '--poster-color': 'transparent' }}
        >
          {/* Botón propio fuera del visor: el slot por defecto se oculta. */}
          <span slot="ar-button" hidden />
          {/* Indicaciones dentro de la sesión WebXR mientras se detecta la superficie de la mesa. */}
          <div slot="ar-prompt" className="hud flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white">
            <ScanLine className="size-5 text-secondary-container" aria-hidden="true" /> Mové el celular despacio apuntando a tu mesa
          </div>
          {arActive && (
            <div className="absolute inset-x-0 top-4 flex justify-center">
              <span className="hud rounded-full px-4 py-2 text-label font-semibold text-white">Arrastrá para mover · pellizcá para girar</span>
            </div>
          )}
          {progress < 1 && (
            <div slot="progress-bar" className="absolute inset-x-10 top-1/2 h-1.5 overflow-hidden rounded-full bg-surface-dim">
              <div className="h-full bg-primary-container transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </model-viewer>
        <div className="absolute inset-x-3 bottom-20 flex justify-center">
          <Button size="lg" icon={Camera} onClick={viewOnTable} className="shadow-glow">
            Ver en mi mesa
          </Button>
        </div>
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2">
          <IconButton label={rotate ? 'Pausar giro' : 'Girar 360°'} icon={rotate ? Pause : Play} variant="dark" onClick={() => setRotate((r) => !r)} />
          <IconButton
            label="Centrar vista"
            icon={RotateCcw}
            variant="dark"
            onClick={() => {
              viewer.current.cameraOrbit = '0deg 55deg auto';
              viewer.current.jumpCameraToGoal?.();
            }}
          />
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-3 rounded-card bg-secondary-fixed/70 p-4 text-sm text-on-secondary-container">
          <Camera className="size-5 shrink-0" aria-hidden="true" />
          {canAr === false
            ? 'Tocá “Ver en mi mesa”, permití la cámara y apuntá a tu mesa: el plato aparece apoyado sobre ella. En este dispositivo el tamaño es aproximado.'
            : 'Tocá “Ver en mi mesa”, permití la cámara y mové el celular despacio apuntando a la mesa: el plato aparece apoyado en su tamaño real.'}
        </p>

        <section aria-labelledby="otros">
          <h2 id="otros" className="label-caps mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-primary"><Box className="size-4" aria-hidden="true" /> Proyectar otro plato</span>
            <span>{products.length} en 3D</span>
          </h2>
          <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
            {products.map((p) => (
              <Chip key={p.id} active={p.id === product.id} onClick={() => navigate(`/ar/${p.id}`, { replace: true })}>
                {p.name}
              </Chip>
            ))}
          </div>
        </section>

        <article className="card flex flex-col gap-3 p-5">
          <div className="flex flex-wrap gap-1.5">
            {product.serves && <Badge tone="honey">{product.serves}</Badge>}
            {product.tags.map((t) => <Badge key={t} tone="sage">{TAG_LABELS[t]}</Badge>)}
          </div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-headline text-headline-md font-bold">{product.name}</h1>
            <span className="text-right">
              <span className="label-caps block">Precio</span>
              <span className="font-headline text-headline-md font-bold text-primary">{money(product.final_price)}</span>
            </span>
          </div>
          <p className="line-clamp-3 text-sm text-on-surface-variant">{product.description}</p>
          <div className="flex items-center gap-3 pt-1">
            {!needsChoice && <QuantityStepper value={qty} onChange={setQty} />}
            <Button size="lg" icon={ShoppingBag} className="flex-1" onClick={add}>
              {needsChoice ? 'Elegir y agregar' : 'Agregar a mi pedido'}
            </Button>
          </div>
        </article>
      </div>

      {cameraMode && (
        <Suspense fallback={<div className="fixed inset-0 z-[60] grid place-items-center bg-black"><Spinner className="!text-white" label="Abriendo la cámara…" /></div>}>
          <CameraPlate product={product} onClose={() => setCameraMode(false)} onAdd={add} />
        </Suspense>
      )}
    </div>
  );
}
