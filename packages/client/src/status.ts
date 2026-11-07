/** The order statuses the partner API reports, in lifecycle order. */
export const PARTNER_ORDER_STATUSES = [
  'pending', 'accepted', 'preparing', 'ready', 'picked_up', 'served', 'out_for_delivery', 'delivered', 'rejected', 'cancelled',
] as const;

export type PartnerOrderStatus = (typeof PARTNER_ORDER_STATUSES)[number];

/** The statuses a partner may report itself, with `updateOrderStatus`: its own rider's progress. */
export const PARTNER_SETTABLE_STATUSES = ['out_for_delivery', 'delivered'] as const;

export type PartnerSettableStatus = (typeof PARTNER_SETTABLE_STATUSES)[number];

const TERMINAL: ReadonlySet<PartnerOrderStatus> = new Set(['delivered', 'rejected', 'cancelled']);
const CANCELLABLE: ReadonlySet<PartnerOrderStatus> = new Set(['pending', 'accepted']);

/** The statuses the API accepts each report from. The restaurant need not have marked every kitchen step. */
const REPORTABLE_FROM: Record<PartnerSettableStatus, ReadonlySet<PartnerOrderStatus>> = {
  out_for_delivery: new Set(['accepted', 'preparing', 'ready', 'picked_up', 'served']),
  delivered: new Set(['accepted', 'preparing', 'ready', 'picked_up', 'served', 'out_for_delivery']),
};

/**
 * True once the order will not change again: stop polling. `picked_up` and `served` are not final: the
 * order goes on to `out_for_delivery` and `delivered`, which you report yourself or the restaurant marks.
 */
export function isTerminal(status: PartnerOrderStatus): boolean {
  return TERMINAL.has(status);
}

/** True while the partner may still cancel: before the kitchen starts. */
export function canCancel(status: PartnerOrderStatus): boolean {
  return CANCELLABLE.has(status);
}

/**
 * True when `updateOrderStatus(target)` would move an order that is `current`: after the restaurant has
 * accepted it, never once it is over, never backwards. Reporting the status it already has is also safe
 * (the API answers 200 and changes nothing) but is not a move, so this answers false for it.
 */
export function canReportStatus(current: PartnerOrderStatus, target: PartnerSettableStatus): boolean {
  return REPORTABLE_FROM[target]?.has(current) ?? false;
}
