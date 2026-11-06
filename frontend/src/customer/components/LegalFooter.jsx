import { Link } from 'wouter';
import { LEGAL } from '../../lib/legal.js';

export default function LegalFooter({ hasAlcohol = true }) {
  return (
    <footer className="mt-10 flex flex-col gap-2 rounded-card bg-surface-low p-5 text-label text-on-surface-variant">
      <p>{LEGAL.prices}</p>
      <p className="font-semibold text-on-surface">{LEGAL.salt}</p>
      <p>{LEGAL.celiac}</p>
      {hasAlcohol && <p>{LEGAL.alcohol}</p>}
      <p>{LEGAL.allergens}</p>
      <Link href="/legales" className="mt-1 font-semibold text-primary underline underline-offset-2">
        Privacidad, accesibilidad y defensa del consumidor
      </Link>
    </footer>
  );
}
