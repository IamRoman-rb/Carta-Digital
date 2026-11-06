/**
 * Ticket imprimible (comandera térmica 80 mm) con los datos exigidos en Argentina:
 * RG 1415 (emisor, receptor, letra, código, punto de venta-número), Ley 27.743 (IVA contenido),
 * RG 4291 (QR, cuando hay CAE). Sin CAE se imprime como "Documento no válido como factura".
 */
import { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '../../lib/api.js';
import { moneyExact, pad } from '../../lib/format.js';
import { IVA_LABELS } from '../../lib/legal.js';
import { useAsync } from '../../lib/hooks.js';
import { Button, ErrorState, Spinner } from '../../ui/index.jsx';

const dt = (iso) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const d = (ymd) => (ymd ? ymd.split('-').reverse().join('/') : '');
const DOC = { 80: 'CUIT', 86: 'CUIL', 96: 'DNI', 99: 'Sin identificar' };

function Row({ label, value, bold }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? 'text-[14px] font-bold' : ''}`}>
      <span>{label}</span>
      <span className="text-right whitespace-nowrap">{value}</span>
    </div>
  );
}

const Sep = () => <div className="my-1.5 border-t border-dashed border-black" />;

function QrImage({ url }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    import('qrcode').then((QR) => QR.toDataURL(url, { margin: 0, width: 160 }).then(setSrc));
  }, [url]);
  return src ? <img src={src} alt="Código QR de verificación ARCA" className="mx-auto my-2 size-32" /> : null;
}

export default function TicketPage() {
  const { id } = useParams();
  const { data: t, error, loading, reload } = useAsync(() => api.get(`/billing/tickets/${id}`).then((r) => r.ticket), [id]);
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const isA = t.intended?.letter === 'A';
  const number = `${pad(t.pos, 5)}-${pad(t.number, 8)}`;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="no-print flex gap-2">
        <Button variant="muted" icon={ArrowLeft} onClick={() => history.back()}>Volver</Button>
        <Button icon={Printer} onClick={() => window.print()}>Imprimir</Button>
      </div>

      <article className="print-area w-[80mm] bg-white p-3 font-mono text-[11px] leading-tight text-black shadow-overlay" aria-label="Comprobante">
        <header className="text-center">
          <p className="text-[14px] font-bold">{t.issuer.business_name}</p>
          <p>{t.issuer.legal_name}</p>
          <p>{t.issuer.address}{t.issuer.city ? ` - ${t.issuer.city}` : ''}</p>
          <p>CUIT: {t.issuer.cuit}</p>
          <p>IIBB: {t.issuer.iibb} · Inicio act.: {d(t.issuer.activity_start)}</p>
          <p>{t.issuer.iva_condition_label ?? IVA_LABELS[t.issuer.iva_condition]}</p>
        </header>
        <Sep />
        <div className="flex items-center gap-2">
          <span className="grid size-10 shrink-0 place-items-center border-2 border-black text-[20px] font-bold">{t.letter}</span>
          <div className="flex-1">
            <p className="font-bold">{t.title}{t.code ? ` · Cód. ${pad(t.code, 3)}` : ''}</p>
            <p>N° {number}</p>
            <p>Fecha: {dt(t.issued_at)}</p>
          </div>
        </div>
        {t.legend && <p className="mt-1 text-center font-bold">{t.legend}</p>}
        {t.kind === 'comprobante' && !t.fiscal && (
          <p className="text-center text-[10px]">Comprobante fiscal a emitir: Factura {t.intended.letter} (Cód. {pad(t.intended.code, 3)})</p>
        )}
        <Sep />
        {t.receiver && (
          <>
            <p>Cliente: {t.receiver.name}</p>
            <p>{t.receiver.iva_condition_label}</p>
            {t.receiver.doc_number && t.receiver.doc_number !== '0' && <p>{DOC[t.receiver.doc_type]}: {t.receiver.doc_number}</p>}
            {t.receiver.address && <p>Domicilio: {t.receiver.address}</p>}
            <Sep />
          </>
        )}
        <p>Mesa {t.context.tables.join(' + ')} · {t.context.sector} · {t.context.guests} pax</p>
        {t.context.waiter && <p>Atendió: {t.context.waiter}</p>}
        <Sep />
        <div className="flex justify-between font-bold"><span>Cant. / Descripción</span><span>Importe</span></div>
        {t.lines.map((l, i) => (
          <div key={i} className="mt-1">
            <p>{l.quantity} x {moneyExact(isA ? l.unit_net : l.unit_price)}{isA ? ` (IVA ${l.vat_rate}%)` : ''}</p>
            <div className="flex justify-between gap-2">
              <span className="min-w-0">{l.description}{l.detail ? ` (${l.detail})` : ''}</span>
              <span className="whitespace-nowrap">{moneyExact(isA ? l.total_net : l.total)}</span>
            </div>
          </div>
        ))}
        <Sep />
        {t.totals.discount > 0 && (
          <>
            <Row label="Subtotal" value={moneyExact(t.totals.subtotal)} />
            <Row label={`Descuento ${t.totals.discount_pct}%`} value={`-${moneyExact(t.totals.discount)}`} />
          </>
        )}
        {isA && t.totals.vat_breakdown && (
          <>
            <Row label="Importe neto gravado" value={moneyExact(t.totals.net)} />
            {t.totals.vat_breakdown.map((v) => <Row key={v.rate} label={`IVA ${v.rate}%`} value={moneyExact(v.vat)} />)}
          </>
        )}
        <Row label="TOTAL" value={moneyExact(t.totals.total)} bold />
        {t.kind === 'precuenta' && t.totals.paid > 0 && (
          <>
            <Row label="Pagado" value={moneyExact(t.totals.paid)} />
            <Row label="Saldo" value={moneyExact(t.totals.balance)} bold />
          </>
        )}
        {t.transparency && (
          <>
            <Sep />
            <p className="font-bold">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</p>
            <Row label="IVA Contenido" value={moneyExact(t.transparency.vat_contained)} />
            <Row label="Otros Impuestos Nacionales Indirectos" value={moneyExact(t.transparency.other_national_indirect_taxes)} />
          </>
        )}
        {t.payments?.length > 0 && (
          <>
            <Sep />
            {t.payments.map((p, i) => (
              <div key={i}>
                <Row label={p.method} value={moneyExact(p.amount)} />
                {p.received ? <Row label="  Recibido / Vuelto" value={`${moneyExact(p.received)} / ${moneyExact(p.change)}`} /> : null}
              </div>
            ))}
            {t.tips > 0 && <Row label="Propina (no integra el comprobante)" value={moneyExact(t.tips)} />}
          </>
        )}
        {t.kind === 'precuenta' && t.tip_options && (
          <>
            <Sep />
            <p>Propina sugerida (voluntaria):</p>
            {t.tip_options.filter((p) => p > 0).map((p) => <Row key={p} label={`${p}%`} value={moneyExact(Math.round((t.totals.balance * p) / 100))} />)}
          </>
        )}
        {t.cae && (
          <>
            <Sep />
            <Row label="CAE N°" value={t.cae} />
            <Row label="Vto. CAE" value={d(t.cae_due)} />
            <QrImage url={t.qr_url} />
            <p className="text-center">Comprobante Autorizado</p>
          </>
        )}
        <Sep />
        <p className="text-center">Precios con IVA incluido. Moneda: Pesos argentinos (ARS).</p>
        {t.footer && <p className="mt-1 text-center font-bold">{t.footer}</p>}
      </article>
    </div>
  );
}
