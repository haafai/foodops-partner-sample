import { describe, expect, it } from 'vitest';
import type { PartnerOrder, PartnerOrderStatus } from '@foodops-partner/client';
import { statusCopy, statusLabel, statusTone } from '../src/orders/statusCopy';

const order = (status: PartnerOrderStatus, reason: string | null = null, cancelledBy: PartnerOrder['cancelledBy'] = null) => ({ status, reason, cancelledBy });
const ALL: PartnerOrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'picked_up', 'rejected', 'cancelled'];

describe('statusCopy', () => {
  it.each(ALL)('has a title, a label and a tone for %s', (status) => {
    expect(statusCopy(order(status), 'Marine Drive').title).not.toBe('');
    expect(statusLabel(status)).toMatch(/^[A-Z][a-z ]+$/);
    expect(statusTone(status)).toMatch(/^bg-(mustard|leaf|navy|chili) /);
  });

  it('names the restaurant where the sentence needs it', () => {
    expect(statusCopy(order('pending'), 'Marine Drive')).toEqual({ title: 'Waiting for Marine Drive to accept', subtitle: 'Restaurants usually answer within a few minutes.' });
    expect(statusCopy(order('accepted'), 'Marine Drive')).toEqual({ title: 'Marine Drive accepted your order', subtitle: 'The kitchen has it.' });
    expect(statusCopy(order('rejected', 'Item unavailable'), 'Marine Drive')).toEqual({ title: 'Rejected by Marine Drive', subtitle: 'Item unavailable' });
  });

  it('says "the restaurant" when the order is not in this browser, or its name is blank', () => {
    expect(statusCopy(order('pending'), null).title).toBe('Waiting for the restaurant to accept');
    expect(statusCopy(order('accepted'), '   ').title).toBe('The restaurant accepted your order');
    expect(statusCopy(order('rejected', 'Too busy'), null).title).toBe('Rejected by the restaurant');
  });

  it('has fixed copy for the steps that need no name', () => {
    expect(statusCopy(order('preparing'), 'Marine Drive')).toEqual({ title: 'Being prepared', subtitle: 'You can no longer cancel from here.' });
    expect(statusCopy(order('ready'), 'Marine Drive')).toEqual({ title: 'Ready for pickup', subtitle: 'Your rider can collect it now.' });
    expect(statusCopy(order('picked_up'), 'Marine Drive')).toEqual({ title: 'Picked up', subtitle: 'Enjoy your meal.' });
  });

  it('explains a rejection by timeout, and one with no reason', () => {
    expect(statusCopy(order('rejected', 'timeout'), 'Marine Drive').subtitle).toBe('The restaurant did not answer in time.');
    expect(statusCopy(order('rejected', null), 'Marine Drive').subtitle).toBe('No reason was given.');
    expect(statusCopy(order('rejected', '  '), 'Marine Drive').subtitle).toBe('No reason was given.');
  });

  it('says who cancelled, and why', () => {
    expect(statusCopy(order('cancelled', 'Customer cancelled', 'partner'), 'Marine Drive')).toEqual({ title: 'Cancelled', subtitle: 'by you · Customer cancelled' });
    expect(statusCopy(order('cancelled', 'Kitchen closed early', 'restaurant'), 'Marine Drive').subtitle).toBe('by the restaurant · Kitchen closed early');
    expect(statusCopy(order('cancelled', null, 'partner'), 'Marine Drive').subtitle).toBe('by you');
    expect(statusCopy(order('cancelled'), 'Marine Drive').subtitle).toBe('');
  });

  it('survives a status it has never heard of', () => {
    const unknown = 'on_hold' as PartnerOrderStatus;
    expect(statusCopy(order(unknown), 'Marine Drive')).toEqual({ title: 'on_hold', subtitle: '' });
    expect(statusLabel('on_hold')).toBe('on_hold');
    expect(statusTone('on_hold')).toBe('bg-sand text-navy');
  });

  it('labels every status for a pill', () => {
    expect(ALL.map(statusLabel)).toEqual(['Waiting', 'Accepted', 'Preparing', 'Ready', 'Picked up', 'Rejected', 'Cancelled']);
  });
});
