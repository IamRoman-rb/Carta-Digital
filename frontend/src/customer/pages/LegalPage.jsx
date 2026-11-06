import { LEGAL } from '../../lib/legal.js';
import { useMenu } from '../store.js';

/** Información legal: privacidad (Ley 25.326), consumidor (Ley 24.240) y accesibilidad (Ley 26.653). */
export default function LegalPage() {
  const { data } = useMenu();
  const s = data?.settings;
  return (
    <article className="card mx-auto flex max-w-3xl flex-col gap-5 p-6 text-sm leading-relaxed">
      <h1 className="font-headline text-headline-lg font-bold">Información legal</h1>

      <section>
        <h2 className="mb-1 font-headline text-headline-sm">Protección de datos personales</h2>
        <p>
          Esta carta digital no requiere registrarte ni solicita datos personales para consultar, pedir o solicitar la cuenta.
          Tu pedido se guarda en tu propio dispositivo hasta que lo envías y luego queda asociado únicamente a la mesa.
          Si pedís una factura a tu nombre, los datos fiscales se usan solo para emitir el comprobante, conforme a la Ley 25.326 de Protección de Datos Personales.
          Podés ejercer tus derechos de acceso, rectificación y supresión ante el establecimiento
          {s?.address ? ` (${s.address}${s.phone ? `, tel. ${s.phone}` : ''})` : ''}.
          La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, atiende las denuncias por incumplimiento.
        </p>
        <p className="mt-2">Usamos almacenamiento local del navegador solo para recordar tu mesa (12 horas) y tu pedido sin enviar. No usamos cookies de seguimiento ni publicidad.</p>
      </section>

      <section>
        <h2 className="mb-1 font-headline text-headline-sm">Defensa del consumidor</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>{LEGAL.prices}</li>
          <li>{LEGAL.consumer}</li>
          <li>La propina es voluntaria y no forma parte del precio.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-1 font-headline text-headline-sm">Salud y alimentación</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>{LEGAL.salt}</li>
          <li>{LEGAL.celiac}</li>
          <li>{LEGAL.allergens}</li>
          <li>{LEGAL.alcohol}</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-1 font-headline text-headline-sm">Accesibilidad</h2>
        <p>
          Este sitio busca cumplir la Ley 26.653 de Accesibilidad de la Información en Páginas Web y las pautas WCAG 2.1 nivel AA
          (ISO/IEC 40500): navegación por teclado, textos alternativos, contraste suficiente y compatibilidad con lectores de pantalla.
          Si encontrás una barrera, avisale al personal.
        </p>
      </section>
    </article>
  );
}
