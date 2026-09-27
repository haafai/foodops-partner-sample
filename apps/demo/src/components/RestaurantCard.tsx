import { Link } from 'react-router-dom';
import type { PartnerOutlet } from '@foodops-partner/client';
import { outletImageFor } from '../images/catalog';
import { DishImage } from './DishImage';

/** One restaurant on the home page. The whole card is the link to its menu. */
export function RestaurantCard({ outlet }: { outlet: PartnerOutlet }) {
  return (
    <article className="card overflow-hidden transition hover:-translate-y-0.5">
      <Link to={`/outlets/${outlet.outletId}/menu`} className="block focus:outline-none focus-visible:ring-4 focus-visible:ring-mustard">
        <DishImage src={outletImageFor(outlet)} name={outlet.name} className="aspect-[4/3] w-full text-4xl" />
        <div className="space-y-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 truncate text-lg font-semibold" title={outlet.name}>{outlet.name}</h2>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${outlet.acceptingOrders ? 'bg-leaf text-white' : 'bg-sand text-navy'}`}>
              {outlet.acceptingOrders ? 'Open · Accepting orders' : 'Closed · Not accepting orders'}
            </span>
          </div>
          <p className="truncate text-sm text-muted">{[outlet.address, outlet.phone].filter(Boolean).join(' · ')}</p>
          <p className="text-xs text-muted">Auto-reject after {outlet.acceptTimeoutMinutes} min without an answer</p>
        </div>
      </Link>
    </article>
  );
}
