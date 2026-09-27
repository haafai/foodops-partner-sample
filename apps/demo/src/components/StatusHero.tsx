import type { PartnerOrder } from '@foodops-partner/client';
import { statusCopy, statusTone } from '../orders/statusCopy';

const CROSS = 'M6 6l12 12M18 6 6 18';
const ICONS: Record<string, string | undefined> = {
  pending: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  accepted: 'M5 12.5l4.5 4.5L19 7.5',
  preparing: 'M4 12h16a8 8 0 0 1-16 0ZM9 8c0-1.5 1.5-1.5 1.5-3M13.5 8c0-1.5 1.5-1.5 1.5-3',
  ready: 'M5 8h14l-1.2 11H6.2ZM9 8V6a3 3 0 0 1 6 0v2',
  picked_up: 'M3 11.5 12 4l9 7.5M5 10v10h14V10M10 20v-5h4v5',
  rejected: CROSS,
  cancelled: CROSS,
};

/** The headline of the tracking page: where the order is, in a customer's words. */
export function StatusHero({ order, outletName }: { order: PartnerOrder; outletName: string | null }) {
  const copy = statusCopy(order, outletName);
  return (
    <div className="card flex items-center gap-4 p-5">
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${statusTone(order.status)}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d={ICONS[order.status] ?? ICONS.pending} />
        </svg>
      </span>
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-bold" data-testid="status-title">{copy.title}</h1>
        {copy.subtitle && <p className="break-words text-sm text-muted">{copy.subtitle}</p>}
        <p className="mt-1 text-xs text-muted">{order.reference} · your reference {order.partnerReference}</p>
      </div>
    </div>
  );
}
