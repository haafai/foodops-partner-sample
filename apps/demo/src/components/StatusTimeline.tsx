import type { PartnerOrder } from '@foodops-partner/client';
import { statusLabel } from '../orders/statusCopy';

const STEPS = ['pending', 'accepted', 'preparing', 'ready', 'picked_up'];

/** The five steps of an order; one that was rejected or cancelled shows where it started and where it ended. */
export function StatusTimeline({ order }: { order: PartnerOrder }) {
  const stopped = order.status === 'rejected' || order.status === 'cancelled';
  const steps = stopped ? ['pending', order.status] : STEPS;
  const reached = steps.indexOf(order.status);
  const endTone = order.status === 'rejected' ? 'bg-chili text-white' : 'bg-navy text-white';
  return (
    <ol className="card flex items-start gap-1 p-4 text-center text-xs font-semibold" aria-label="Order progress">
      {steps.map((status, i) => {
        const done = i <= reached;
        const tone = stopped && i === reached ? endTone : done ? 'bg-leaf text-white' : 'bg-sand text-muted';
        return (
          <li key={status} aria-current={i === reached ? 'step' : undefined} className={`flex min-w-0 flex-1 flex-col items-center gap-1 ${done ? 'text-navy' : 'text-muted'}`}>
            <span aria-hidden="true" className={`flex h-7 w-7 items-center justify-center rounded-full ${tone}`}>{i + 1}</span>
            <span className="max-w-full truncate">{status === 'pending' ? 'Pending' : statusLabel(status)}</span>
          </li>
        );
      })}
    </ol>
  );
}
