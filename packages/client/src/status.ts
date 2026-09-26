/** The order statuses the partner API reports, in lifecycle order. */
export const PARTNER_ORDER_STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'picked_up', 'rejected', 'cancelled'] as const;

export type PartnerOrderStatus = (typeof PARTNER_ORDER_STATUSES)[number];

const TERMINAL: ReadonlySet<PartnerOrderStatus> = new Set(['picked_up', 'rejected', 'cancelled']);
const CANCELLABLE: ReadonlySet<PartnerOrderStatus> = new Set(['pending', 'accepted']);

/** True once the order will not change again: stop polling. */
export function isTerminal(status: PartnerOrderStatus): boolean {
  return TERMINAL.has(status);
}

/** True while the partner may still cancel: before the kitchen starts. */
export function canCancel(status: PartnerOrderStatus): boolean {
  return CANCELLABLE.has(status);
}
