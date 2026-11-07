import { describe, expect, it } from 'vitest';
import { PARTNER_ORDER_STATUSES, PARTNER_SETTABLE_STATUSES, canCancel, canReportStatus, isTerminal } from '../src/status';

describe('status', () => {
  it('lists the ten contract statuses in order', () => {
    expect(PARTNER_ORDER_STATUSES).toEqual([
      'pending', 'accepted', 'preparing', 'ready', 'picked_up', 'served', 'out_for_delivery', 'delivered', 'rejected', 'cancelled',
    ]);
  });
  it('delivered, rejected and cancelled are terminal; picked_up and served are not', () => {
    expect(PARTNER_ORDER_STATUSES.filter(isTerminal)).toEqual(['delivered', 'rejected', 'cancelled']);
  });
  it('only pending and accepted can be cancelled by the partner', () => {
    expect(PARTNER_ORDER_STATUSES.filter(canCancel)).toEqual(['pending', 'accepted']);
  });
  it('the partner reports only out_for_delivery and delivered', () => {
    expect(PARTNER_SETTABLE_STATUSES).toEqual(['out_for_delivery', 'delivered']);
  });
  it('out_for_delivery is reportable once accepted, and not after delivery', () => {
    expect(PARTNER_ORDER_STATUSES.filter((s) => canReportStatus(s, 'out_for_delivery')))
      .toEqual(['accepted', 'preparing', 'ready', 'picked_up', 'served']);
  });
  it('delivered is reportable once accepted, with or without out_for_delivery first', () => {
    expect(PARTNER_ORDER_STATUSES.filter((s) => canReportStatus(s, 'delivered')))
      .toEqual(['accepted', 'preparing', 'ready', 'picked_up', 'served', 'out_for_delivery']);
  });
});
