import type { PartnerOrder, PartnerOrderStatus } from '@foodops-partner/client';

const STEPS: Array<[PartnerOrderStatus, string]> = [['pending', 'Pending'], ['accepted', 'Accepted'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['picked_up', 'Picked up']];

export function StatusTimeline({ order }: { order: PartnerOrder }) {
  const reached = STEPS.findIndex(([s]) => s === order.status);
  return (
    <ol className="flex flex-wrap gap-2 text-xs" aria-label="Order progress">
      {STEPS.map(([status, label], i) => (
        <li key={status} className={`rounded px-2 py-1 ${i <= reached ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{label}</li>
      ))}
      {order.status === 'rejected' && <li className="rounded bg-red-600 px-2 py-1 text-white">Rejected</li>}
      {order.status === 'cancelled' && <li className="rounded bg-slate-700 px-2 py-1 text-white">Cancelled by {order.cancelledBy ?? 'unknown'}</li>}
    </ol>
  );
}
