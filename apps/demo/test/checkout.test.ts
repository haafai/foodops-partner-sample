import { describe, expect, it } from 'vitest';
import { lineFromSelection } from '../src/cart/cart';
import { newPartnerReference, requestFingerprint, toCreateRequest } from '../src/cart/checkout';
import { keyFor } from '../src/cart/idempotency';
import { CLASSIC } from './menu-fixture';

const line = lineFromSelection(CLASSIC, CLASSIC.variants[0], [{ modifierId: 'm-cheese', quantity: 1 }], 2, 'no onions');
const plain = lineFromSelection(CLASSIC, CLASSIC.variants[0], [], 1, '');
const form = { partnerReference: 'DEMO-1', customerName: ' Aishath ', customerPhone: '+9607771234', notes: '  ', expectedPickupAt: '' };

describe('toCreateRequest', () => {
  it('maps lines, modifiers, customer, and sends the estimate as partnerTotal', () => {
    const request = toCreateRequest('o-marine', [line, plain], form);
    expect(request).toEqual({
      outletId: 'o-marine', partnerReference: 'DEMO-1', customer: { name: 'Aishath', phone: '+9607771234' }, notes: null, expectedPickupAt: null,
      lines: [
        { variantId: 'v-classic-r', quantity: 2, note: 'no onions', modifiers: [{ modifierId: 'm-cheese', quantity: 1 }] },
        { variantId: 'v-classic-r', quantity: 1, note: null, modifiers: null },
      ],
      partnerTotal: 309,
    });
  });
  it('omits the customer when both fields are blank', () => {
    expect(toCreateRequest('o', [plain], { ...form, customerName: '', customerPhone: '' }).customer).toBeNull();
  });
  it('sends a local pickup time as UTC ISO-8601 with Z', () => {
    const local = '2026-09-26T18:30';
    const sent = toCreateRequest('o', [plain], { ...form, expectedPickupAt: local }).expectedPickupAt;
    expect(sent).toBe(new Date(local).toISOString());
    expect(sent).toMatch(/Z$/);
  });
});

describe('requestFingerprint and keyFor', () => {
  it('is stable across key order and changes with content', () => {
    const a = toCreateRequest('o', [plain], form);
    const b = { partnerTotal: a.partnerTotal, lines: a.lines, outletId: a.outletId, partnerReference: a.partnerReference, customer: a.customer, notes: a.notes, expectedPickupAt: a.expectedPickupAt };
    expect(requestFingerprint(b)).toBe(requestFingerprint(a));
    expect(requestFingerprint({ ...a, notes: 'x' })).not.toBe(requestFingerprint(a));
  });
  it('keeps the key while the fingerprint is unchanged and mints a new one when it changes', () => {
    const first = keyFor(null, 'fp1');
    expect(keyFor(first, 'fp1')).toBe(first);
    const second = keyFor(first, 'fp2');
    expect(second.key).not.toBe(first.key);
    expect(second.fingerprint).toBe('fp2');
  });
  it('newPartnerReference is DEMO- plus a timestamp', () => {
    expect(newPartnerReference(1_700_000_000_000)).toBe('DEMO-1700000000000');
  });
});
