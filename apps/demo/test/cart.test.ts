import { describe, expect, it } from 'vitest';
import { estimateTotal, lineFromSelection, lineTotal, round2, selectionProblem } from '../src/cart/cart';
import { CHICKEN, CLASSIC } from './menu-fixture';

describe('selectionProblem', () => {
  it('needs a variant, and an available one', () => {
    expect(selectionProblem(CLASSIC, undefined, [])).toBe('Choose a size.');
    expect(selectionProblem(CLASSIC, CLASSIC.variants[1], [])).toMatch(/Large is not available/);
  });
  it('enforces a required group', () => {
    expect(selectionProblem(CHICKEN, CHICKEN.variants[0], [])).toBe('Spice level: choose at least 1.');
    expect(selectionProblem(CHICKEN, CHICKEN.variants[0], [{ modifierId: 'm-mild', quantity: 1 }])).toBeNull();
    expect(selectionProblem(CHICKEN, CHICKEN.variants[0], [{ modifierId: 'm-mild', quantity: 1 }, { modifierId: 'm-hot', quantity: 1 }])).toBe('Spice level: at most 1.');
  });
  it('enforces a maximum across quantities and rejects a modifier that left the menu', () => {
    expect(selectionProblem(CLASSIC, CLASSIC.variants[0], [{ modifierId: 'm-cheese', quantity: 2 }, { modifierId: 'm-bacon', quantity: 1 }])).toBeNull();
    expect(selectionProblem(CLASSIC, CLASSIC.variants[0], [{ modifierId: 'm-cheese', quantity: 2 }, { modifierId: 'm-bacon', quantity: 2 }])).toBe('Extras: at most 3.');
    expect(selectionProblem(CLASSIC, CLASSIC.variants[0], [{ modifierId: 'm-gone', quantity: 1 }])).toMatch(/Refresh the menu/);
  });
});

describe('lines and totals', () => {
  it('builds a line with named, priced modifiers and totals it', () => {
    const line = lineFromSelection(CLASSIC, CLASSIC.variants[0], [{ modifierId: 'm-cheese', quantity: 1 }], 2, 'no onions');
    expect(line).toMatchObject({ productId: 'p-classic', itemName: 'Classic Burger', variantId: 'v-classic-r', variantName: 'Regular', unitPrice: 95, quantity: 2, note: 'no onions' });
    expect(line.modifiers).toEqual([{ groupId: 'g-extras', groupName: 'Extras', modifierId: 'm-cheese', name: 'Cheese', price: 12, quantity: 1 }]);
    expect(line.lineId).toMatch(/^[0-9a-f-]{36}$/);
    expect(lineTotal(line)).toBe(214);
  });
  it('rounds money to two places', () => {
    expect(round2(29.970000000000002)).toBe(29.97);
    const cheap = { ...lineFromSelection(CLASSIC, { variantId: 'v', name: 'X', price: 9.99, available: true }, [], 1, ''), quantity: 1 };
    expect(estimateTotal([cheap, cheap, cheap])).toBe(29.97);
  });
});
