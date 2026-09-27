import type { PartnerOrder } from '@foodops-partner/client';

export interface StatusCopy { title: string; subtitle: string }

const LABELS: Record<string, string | undefined> = {
  pending: 'Waiting', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready',
  picked_up: 'Picked up', rejected: 'Rejected', cancelled: 'Cancelled',
};

const TONES: Record<string, string | undefined> = {
  pending: 'bg-mustard text-navy',
  accepted: 'bg-leaf text-white', preparing: 'bg-leaf text-white', ready: 'bg-leaf text-white',
  picked_up: 'bg-navy text-white',
  rejected: 'bg-chili text-white', cancelled: 'bg-chili text-white',
};

/** The short word for a status pill. A status this app has never heard of is shown as it came. */
export const statusLabel = (status: string): string => LABELS[status] ?? status;

/** Tailwind classes for a status pill or icon. */
export const statusTone = (status: string): string => TONES[status] ?? 'bg-sand text-navy';

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** What a customer reads for each status. `outletName` is null when the order was not placed from this browser. */
export function statusCopy(order: Pick<PartnerOrder, 'status' | 'reason' | 'cancelledBy'>, outletName: string | null): StatusCopy {
  const outlet = outletName?.trim() || 'the restaurant';
  const reason = order.reason?.trim() ?? '';
  switch (order.status) {
    case 'pending': return { title: `Waiting for ${outlet} to accept`, subtitle: 'Restaurants usually answer within a few minutes.' };
    case 'accepted': return { title: `${capitalise(outlet)} accepted your order`, subtitle: 'The kitchen has it.' };
    case 'preparing': return { title: 'Being prepared', subtitle: 'You can no longer cancel from here.' };
    case 'ready': return { title: 'Ready for pickup', subtitle: 'Your rider can collect it now.' };
    case 'picked_up': return { title: 'Picked up', subtitle: 'Enjoy your meal.' };
    case 'rejected': return {
      title: `Rejected by ${outlet}`,
      subtitle: reason === 'timeout' ? 'The restaurant did not answer in time.' : reason || 'No reason was given.',
    };
    case 'cancelled': {
      const who = order.cancelledBy === 'partner' ? 'by you' : order.cancelledBy === 'restaurant' ? 'by the restaurant' : '';
      return { title: 'Cancelled', subtitle: [who, reason].filter(Boolean).join(' · ') };
    }
    // A newer API may send a status this sample was not written for: show it, do not crash.
    default: return { title: String(order.status), subtitle: '' };
  }
}
