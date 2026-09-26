import { beforeEach, describe, expect, it } from 'vitest';
import { listTracked, saveTracked, updateTracked } from '../src/orders/orderStore';
import type { TrackedOrder } from '../src/orders/orderStore';

const order: TrackedOrder = {
  id: 'a', reference: 'SO-1', partnerReference: 'DEMO-1', outletId: 'o', outletName: 'Marine Drive', createdAt: '2026-09-26T09:00:00.000Z',
  idempotencyKey: 'k', lastStatus: 'pending', priceMismatch: false, partnerTotal: 95, total: 95,
};

beforeEach(() => localStorage.clear());

describe('orderStore', () => {
  it('saves newest first, updates in place, and lists', () => {
    saveTracked(order);
    saveTracked({ ...order, id: 'b', reference: 'SO-2' });
    expect(listTracked().map((o) => o.id)).toEqual(['b', 'a']);
    updateTracked('a', { lastStatus: 'accepted' });
    expect(listTracked().find((o) => o.id === 'a')?.lastStatus).toBe('accepted');
    saveTracked({ ...order, reference: 'SO-1b' });
    expect(listTracked().map((o) => o.reference)).toEqual(['SO-1b', 'SO-2']);
  });
  it('treats corrupted storage as empty', () => {
    localStorage.setItem('partner-demo.orders', '{not json');
    expect(listTracked()).toEqual([]);
  });
});
