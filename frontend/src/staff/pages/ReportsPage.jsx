import { useState } from 'react';
import { Clock, Download, Lightbulb, Percent, Puzzle, ReceiptText, Star, Timer, TrendingDown, TrendingUp, UsersRound, Wallet, Wheat, XCircle } from 'lucide-react';
import { api } from '../../lib/api.js';
import { money, ymd } from '../../lib/format.js';
import { PAYMENT_LABELS } from '../../lib/legal.js';
import { notify } from '../../lib/notify.js';
import { useAsync } from '../../lib/hooks.js';
import { Badge, Button, EmptyState, Input, PageHeader, Spinner, StatCard, Tabs, cx } from '../../ui/index.jsx';

// ------------------------------------------------------------------ Gráfico de barras (una serie)
function BarChart({ data, label, valueOf, format, xLabel, height = 220, tooltipExtra }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map(valueOf));
  const w = 100 / data.length;
  const peak = data.reduce((best, d, i) => (valueOf(d) > valueOf(data[best]) ? i : best), 0);
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="absolute inset-0 size-full" role="img" aria-label={label}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1="0" x2="100" y1={height - f * (height - 20)} y2={height - f * (height - 20)} stroke="var(--color-outline-variant)" strokeOpacity="0.35" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {data.map((d, i) => {
            const v = valueOf(d);
            const h = (v / max) * (height - 20);
            return (
              <g key={i}>
                <rect x={i * w} y="0" width={w} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
                {v > 0 && (
                  <rect
                    x={i * w + w * 0.18}
                    y={height - h}
                    width={w * 0.64}
                    height={h}
                    rx="0.8"
                    fill={hover === i ? 'var(--color-primary)' : 'var(--color-primary-container)'}
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })}
        </svg>
        {data[peak] && valueOf(data[peak]) > 0 && hover == null && (
          <span className="pointer-events-none absolute -translate-x-1/2 rounded-full bg-on-surface px-2 py-0.5 text-micro font-bold text-surface" style={{ left: `${(peak + 0.5) * w}%`, top: Math.max(0, height - (valueOf(data[peak]) / max) * (height - 20) - 24) }}>
            Pico {format(valueOf(data[peak]))}
          </span>
        )}
        {hover != null && (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-2xl bg-on-surface px-3 py-2 text-label text-surface shadow-overlay" style={{ left: `${Math.min(88, Math.max(12, (hover + 0.5) * w))}%`, top: 4 }}>
            <p className="font-bold">{xLabel(data[hover])}</p>
            <p>{format(valueOf(data[hover]))}</p>
            {tooltipExtra?.(data[hover])}
          </div>
        )}
      </div>
      <div className="flex justify-between text-micro text-on-surface-variant" aria-hidden="true">
        {data.map((d, i) => (
          <span key={i} className="w-0 flex-1 text-center">{data.length <= 12 || i % 3 === 0 ? xLabel(d) : ''}</span>
        ))}
      </div>
      <details className="text-label">
        <summary className="cursor-pointer font-semibold text-primary">Ver datos en tabla</summary>
        <table className="mt-2 w-full">
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="border-b border-outline-variant/30"><th className="py-1 text-left font-normal">{xLabel(d)}</th><td className="text-right">{format(valueOf(d))}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Barras horizontales (parte de un total), una sola serie. */
function ShareBars({ rows }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="font-semibold">{r.label}</span>
            <span className="text-on-surface-variant">{r.value} · <strong className="text-on-surface">{r.share}%</strong></span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-high" title={`${r.label}: ${r.share}%`}>
            <div className="h-full rounded-full bg-primary-container" style={{ width: `${Math.max(2, r.share)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const QUADRANTS = {
  estrella: { title: 'Platos estrella', hint: 'Alta demanda · alto margen', action: 'Mantener y destacar en la portada AR.', icon: Star, tone: 'sage' },
  caballo: { title: 'Caballos de batalla', hint: 'Alta demanda · margen bajo', action: 'Revisar costos o porción; subir precio con cuidado.', icon: Wheat, tone: 'honey' },
  puzzle: { title: 'Oportunidades', hint: 'Baja demanda · alto margen', action: 'Potenciar: foto, modelo 3D y lugar destacado.', icon: Puzzle, tone: 'primary' },
  perro: { title: 'Para retrabajar', hint: 'Baja demanda · margen bajo', action: 'Reformular o retirar de la carta.', icon: XCircle, tone: 'danger' },
};

function presetRange(preset) {
  const today = new Date();
  if (preset === 'today') return { from: ymd(today), to: ymd(today) };
  if (preset === 'week') {
    const d = new Date(today);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return { from: ymd(d), to: ymd(today) };
  }
  return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
}

function insightsOf(r) {
  const out = [];
  const peak = r.by_hour.reduce((a, b) => (b.revenue > a.revenue ? b : a), r.by_hour[0]);
  if (peak?.revenue) out.push({ title: `Pico de facturación a las ${peak.hour}:00 h`, text: `Concentrá personal de salón y cocina en esa franja; considerá una promo para horarios valle.` });
  const puzzle = r.products.find((p) => p.quadrant === 'puzzle');
  if (puzzle) out.push({ title: `Potenciá “${puzzle.name}”`, text: `Tiene ${puzzle.margin_pct}% de margen pero baja demanda. Destacalo con foto y modelo 3D en la carta.` });
  const horse = r.products.find((p) => p.quadrant === 'caballo');
  if (horse) out.push({ title: `Revisá el costo de “${horse.name}”`, text: `Se vende mucho con ${horse.margin_pct}% de margen. Un ajuste de porción o proveedor impacta fuerte.` });
  if (r.kitchen.cancelled_pct > 5) out.push({ title: 'Anulaciones elevadas', text: `${r.kitchen.cancelled_pct}% de los ítems se anularon. Revisá stock y comunicación salón-cocina.` });
  return out;
}

export default function ReportsPage() {
  const [preset, setPreset] = useState('today');
  const [custom, setCustom] = useState(presetRange('month'));
  const range = preset === 'custom' ? custom : presetRange(preset);
  const report = useAsync(() => api.get(`/reports/summary?from=${range.from}&to=${range.to}`), [range.from, range.to]);

  async function exportCsv() {
    try {
      const res = await api.raw(`/reports/export.csv?from=${range.from}&to=${range.to}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `informe_${range.from}_${range.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify.error(err);
    }
  }

  const r = report.data;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Inteligencia de negocio"
        title="Informes y métricas"
        description="Rentabilidad, ingeniería de menú, desempeño del equipo y tiempos de cocina."
        actions={<Button variant="dark" icon={Download} onClick={exportCsv}>Exportar Excel (CSV)</Button>}
      />
      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={preset} onChange={setPreset} tabs={[{ value: 'today', label: 'Hoy' }, { value: 'week', label: 'Esta semana' }, { value: 'month', label: 'Mes en curso' }, { value: 'custom', label: 'Personalizado' }]} />
        {preset === 'custom' && (
          <>
            <Input label="Desde" type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <Input label="Hasta" type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </>
        )}
      </div>

      {!r ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label="Facturación"
              value={money(r.kpis.revenue)}
              hint={r.kpis.revenue_change_pct == null ? 'Sin período previo' : `${r.kpis.revenue_change_pct > 0 ? '+' : ''}${r.kpis.revenue_change_pct}% vs período anterior`}
              icon={r.kpis.revenue_change_pct < 0 ? TrendingDown : TrendingUp}
              tone="sage"
            />
            <StatCard label="Ticket promedio" value={money(r.kpis.avg_ticket)} hint={`${r.kpis.tickets} cuentas cerradas`} icon={ReceiptText} />
            <StatCard label="Margen bruto" value={`${r.kpis.gross_margin_pct}%`} hint={`${r.kpis.items_sold} ítems vendidos`} icon={Percent} />
            <StatCard label="Comensales" value={r.kpis.guests} hint={`${money(r.kpis.avg_per_guest)} por persona · ${r.kpis.avg_stay_minutes} min de permanencia`} icon={UsersRound} />
            <StatCard label="Propinas" value={money(r.kpis.tips)} icon={Wallet} tone="honey" />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
            <section className="card p-5" aria-labelledby="hora">
              <h2 id="hora" className="font-headline text-headline-sm font-bold">Facturación por franja horaria</h2>
              <p className="mb-4 text-label text-on-surface-variant">Cobros registrados por hora (hora local). Pasá el cursor para ver mesas abiertas.</p>
              {r.kpis.revenue ? (
                <BarChart
                  data={r.by_hour.filter((h) => h.hour >= 7 || h.revenue > 0)}
                  label="Facturación por hora"
                  valueOf={(d) => d.revenue}
                  format={money}
                  xLabel={(d) => `${d.hour}h`}
                  tooltipExtra={(d) => <p className="text-surface/70">{d.tables} mesas abiertas</p>}
                />
              ) : (
                <EmptyState icon={Clock} title="Sin cobros en el período" />
              )}
            </section>
            <section className="card flex flex-col gap-4 p-5" aria-labelledby="medios">
              <h2 id="medios" className="font-headline text-headline-sm font-bold">Medios de pago</h2>
              {r.by_method.length ? (
                <ShareBars rows={r.by_method.map((m) => ({ label: PAYMENT_LABELS[m.method], value: money(m.amount), share: m.share }))} />
              ) : (
                <p className="text-sm text-on-surface-variant">Sin cobros.</p>
              )}
              {r.by_category.length > 0 && (
                <>
                  <h3 className="label-caps mt-2">Ventas por categoría</h3>
                  <ShareBars rows={r.by_category.slice(0, 6).map((c) => ({ label: c.name, value: money(c.amount), share: c.share }))} />
                </>
              )}
            </section>
          </div>

          {r.by_day.length > 1 && (
            <section className="card p-5" aria-labelledby="dias">
              <h2 id="dias" className="mb-4 font-headline text-headline-sm font-bold">Facturación diaria</h2>
              <BarChart data={r.by_day} label="Facturación diaria" valueOf={(d) => d.amount} format={money} xLabel={(d) => d.day.slice(8)} height={180} />
            </section>
          )}

          <section className="card p-5" aria-labelledby="bcg">
            <h2 id="bcg" className="font-headline text-headline-sm font-bold">Matriz de rentabilidad y popularidad (ingeniería de menú)</h2>
            <p className="mb-4 text-label text-on-surface-variant">Clasificación Kasavana &amp; Smith: popularidad ≥ 70% de la media y contribución unitaria vs. la media ponderada.</p>
            {r.products.length === 0 ? (
              <EmptyState icon={Star} title="Sin ventas en el período" />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(QUADRANTS).map(([key, q]) => {
                  const items = r.products.filter((p) => p.quadrant === key);
                  return (
                    <article key={key} className="flex flex-col gap-3 rounded-card bg-surface-low p-4">
                      <header className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <q.icon className="size-5 text-primary" aria-hidden="true" />
                          <div>
                            <h3 className="font-semibold">{q.title}</h3>
                            <p className="label-caps">{q.hint}</p>
                          </div>
                        </div>
                        <Badge tone={q.tone}>{items.length}</Badge>
                      </header>
                      <ul className="flex flex-col gap-1.5">
                        {items.slice(0, 5).map((p) => (
                          <li key={p.name} className="flex items-center justify-between gap-2 rounded-2xl bg-surface-lowest px-3 py-2 text-sm">
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{p.name}</span>
                              <span className="text-label text-on-surface-variant">{p.quantity} vendidos · {money(p.revenue)}</span>
                            </span>
                            <span className="shrink-0 text-label font-bold">{p.margin_pct}% margen</span>
                          </li>
                        ))}
                        {items.length === 0 && <li className="text-sm text-on-surface-variant">Ningún plato.</li>}
                      </ul>
                      <p className="mt-auto text-label"><strong>Acción sugerida:</strong> {q.action}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="card p-5" aria-labelledby="equipo">
              <h2 id="equipo" className="mb-3 font-headline text-headline-sm font-bold">Rendimiento del equipo de salón</h2>
              {r.waiters.length === 0 ? (
                <p className="text-sm text-on-surface-variant">Sin datos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead><tr className="label-caps text-left"><th className="py-2">Mozo</th><th className="text-right">Mesas</th><th className="text-right">Facturado</th><th className="text-right">Ticket prom.</th><th className="text-right">Propinas</th></tr></thead>
                    <tbody className="divide-y divide-outline-variant/30">
                      {r.waiters.map((w) => (
                        <tr key={w.id}><td className="py-2 font-semibold">{w.name}</td><td className="text-right">{w.tables}</td><td className="text-right font-semibold">{money(w.revenue)}</td><td className="text-right">{money(w.avg_ticket)}</td><td className="text-right">{money(w.tips)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="card p-5" aria-labelledby="kds">
              <h2 id="kds" className="mb-3 font-headline text-headline-sm font-bold">Métricas de cocina</h2>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <StatCard label="Despacho promedio" value={r.kitchen.avg_prep_minutes != null ? `${r.kitchen.avg_prep_minutes} min` : '—'} icon={Timer} />
                <StatCard label="Anulados" value={`${r.kitchen.cancelled_pct}%`} hint={`${r.kitchen.cancelled_items} ítems`} icon={XCircle} tone={r.kitchen.cancelled_pct > 5 ? 'alert' : 'neutral'} />
              </div>
              <h3 className="label-caps mb-2">Platos con mayor demora</h3>
              <ul className="flex flex-col gap-1.5">
                {r.kitchen.slowest.map((p) => (
                  <li key={p.name} className="flex justify-between rounded-2xl bg-surface-low px-3 py-2 text-sm"><span>{p.name}</span><strong>{p.avg_prep_minutes} min</strong></li>
                ))}
                {r.kitchen.slowest.length === 0 && <li className="text-sm text-on-surface-variant">Sin datos.</li>}
              </ul>
            </section>
          </div>

          {insightsOf(r).length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="ins">
              <h2 id="ins" className="flex items-center gap-2 font-headline text-headline-sm font-bold"><Lightbulb className="size-5 text-secondary" aria-hidden="true" /> Sugerencias automáticas</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {insightsOf(r).map((i) => (
                  <article key={i.title} className={cx('card p-5')}>
                    <h3 className="font-semibold">{i.title}</h3>
                    <p className="mt-1 text-sm text-on-surface-variant">{i.text}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
