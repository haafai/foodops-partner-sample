import { Link } from 'react-router-dom';
import type { PartnerOutlet } from '@foodops-partner/client';
import { outletImageFor } from '../images/catalog';
import { DishImage } from './DishImage';

/** One restaurant on the home page. The whole card is the link to its menu. */
export function RestaurantCard({ outlet }: { outlet: PartnerOutlet }) {
  const contact = [outlet.address, outlet.phone].filter(Boolean).join(' · ');
  return (
    <article className="card overflow-hidden transition hover:-translate-y-0.5">
      <Link to={`/outlets/${outlet.outletId}/menu`} className="block focus:outline-none focus-visible:ring-4 focus-visible:ring-mustard">
        <DishImage src={outletImageFor(outlet)} name={outlet.name} className="aspect-[4/3] w-full text-4xl" />
        <div className="space-y-1.5 p-4">
          <h2 className="truncate text-lg font-semibold" title={outlet.name}>{outlet.name}</h2>
          {/* On its own line: beside the name it left the name no room on narrow cards. */}
          <p>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${outlet.acceptingOrders ? 'bg-leaf text-white' : 'bg-sand text-navy'}`}>
              {outlet.acceptingOrders ? 'Open · Accepting orders' : 'Closed · Not accepting orders'}
            </span>
          </p>
          <p className="truncate text-sm text-muted" title={contact}>{contact}</p>
          <p className="text-xs text-muted">Auto-reject after {outlet.acceptTimeoutMinutes} min without an answer</p>
        </div>
      </Link>
    </article>
  );
}
