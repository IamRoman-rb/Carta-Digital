import { Link } from 'wouter';
import { UtensilsCrossed } from 'lucide-react';
import { EmptyState } from '../../ui/index.jsx';

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={UtensilsCrossed}
      title="Esta página no está en la carta"
      text="El enlace puede estar mal escrito o la página ya no existe."
      action={<Link href="/" className="font-semibold text-primary">Volver a la carta</Link>}
    />
  );
}
