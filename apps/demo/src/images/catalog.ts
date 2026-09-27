import type { PartnerMenuItem, PartnerOutlet } from '@foodops-partner/client';
import { AVAILABLE_IMAGES } from './manifest';

/** The dishes and outlets the sample has photos planned for, by slug. */
export const DISH_SLUGS: ReadonlySet<string> = new Set([
  'classic-burger', 'chicken-burger', 'fish-burger', 'veggie-burger', 'lime-juice', 'iced-coffee', 'fries', 'onion-rings',
]);
export const OUTLET_SLUGS: ReadonlySet<string> = new Set(['marine-drive', 'lagoon-kiosk']);
const HERO_PATH = '/images/hero.jpg';

/** "Hulhumalé Café" → "hulhumale-cafe". */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Up to two initials for the fallback tile. */
export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('');
}

function bundled(path: string, available: ReadonlySet<string>): string | null {
  return available.has(path) ? path : null;
}

/** The API's own image wins; else a bundled photo when one exists; else null, which renders a tile. */
export function dishImageFor(item: Pick<PartnerMenuItem, 'name' | 'imageUrl'>, available: ReadonlySet<string> = AVAILABLE_IMAGES): string | null {
  if (item.imageUrl) return item.imageUrl;
  const slug = slugify(item.name);
  return DISH_SLUGS.has(slug) ? bundled(`/images/dishes/${slug}.jpg`, available) : null;
}

export function outletImageFor(outlet: Pick<PartnerOutlet, 'name'>, available: ReadonlySet<string> = AVAILABLE_IMAGES): string | null {
  const slug = slugify(outlet.name);
  return OUTLET_SLUGS.has(slug) ? bundled(`/images/outlets/${slug}.jpg`, available) : null;
}

export function heroImage(available: ReadonlySet<string> = AVAILABLE_IMAGES): string | null {
  return bundled(HERO_PATH, available);
}
