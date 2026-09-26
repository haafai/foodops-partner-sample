import { describe, expect, it } from 'vitest';
import { PARTNER_ORDER_STATUSES, canCancel, isTerminal } from '../src/status';

describe('status', () => {
  it('lists the seven contract statuses in order', () => {
    expect(PARTNER_ORDER_STATUSES).toEqual(['pending', 'accepted', 'preparing', 'ready', 'picked_up', 'rejected', 'cancelled']);
  });
  it('picked_up, rejected and cancelled are terminal', () => {
    expect(PARTNER_ORDER_STATUSES.filter(isTerminal)).toEqual(['picked_up', 'rejected', 'cancelled']);
  });
  it('only pending and accepted can be cancelled by the partner', () => {
    expect(PARTNER_ORDER_STATUSES.filter(canCancel)).toEqual(['pending', 'accepted']);
  });
});
