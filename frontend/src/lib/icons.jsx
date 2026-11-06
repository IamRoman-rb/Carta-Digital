/**
 * Íconos SVG (lucide) importados individualmente: solo se empaquetan los usados,
 * evitando descargar una fuente de íconos completa en datos móviles.
 */
import {
  Utensils, Coffee, Pizza, Beef, Salad, Sandwich, Soup, Wine, Beer, CupSoda, IceCreamCone, Cake, Croissant, Fish, Drumstick, Sparkles,
} from 'lucide-react';

const CATEGORY_ICONS = {
  utensils: Utensils, coffee: Coffee, pizza: Pizza, beef: Beef, salad: Salad, sandwich: Sandwich, soup: Soup, wine: Wine, beer: Beer,
  'cup-soda': CupSoda, 'ice-cream': IceCreamCone, cake: Cake, croissant: Croissant, fish: Fish, drumstick: Drumstick, sparkles: Sparkles,
};

export function CategoryIcon({ name, ...props }) {
  const Icon = CATEGORY_ICONS[name] ?? Utensils;
  return <Icon aria-hidden="true" {...props} />;
}

export const categoryIconNames = Object.keys(CATEGORY_ICONS);
