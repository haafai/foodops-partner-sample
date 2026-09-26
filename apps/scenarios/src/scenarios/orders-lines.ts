import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { newIdempotencyKey } from '@foodops-partner/client';
import type { CreatePartnerOrderLine } from '@foodops-partner/client';
import { groupWithMax, simpleLine, unavailableVariant } from '../context';
import { SkipScenario } from '../scenario';
import type { Scenario, ScenarioContext } from '../scenario';
import { expectApiError } from './auth';

async function expectInvalidLine(ctx: ScenarioContext, name: string, lines: CreatePartnerOrderLine[], badLine: number): Promise<void> {
  const outlet = await ctx.pickOutlet();
  const error = await expectApiError(
    ctx.client.createOrder({ outletId: outlet.outletId, partnerReference: ctx.reference(name), lines }, newIdempotencyKey()),
    422, 'invalid_line',
  );
  assert.equal(error.details?.line, badLine, `invalid_line must point at line ${badLine}`);
  assert.equal(typeof error.details?.reason, 'string', 'invalid_line must carry a reason');
}

export const orderInvalidLineUnknownVariant: Scenario = {
  name: 'order.invalid-line.unknown-variant',
  requires: [],
  async run(ctx) {
    await expectInvalidLine(ctx, 'unknown', [{ variantId: randomUUID(), quantity: 1 }], 0);
  },
};

export const orderInvalidLineUnavailableVariant: Scenario = {
  name: 'order.invalid-line.unavailable-variant',
  requires: [],
  async run(ctx) {
    const outlet = await ctx.pickOutlet();
    const menu = await ctx.pickMenu(outlet.outletId);
    const variant = unavailableVariant(menu);
    if (!variant) throw new SkipScenario('the menu has no unavailable variant');
    await expectInvalidLine(ctx, 'unavailable', [simpleLine(menu), { variantId: variant.variantId, quantity: 1 }], 1);
  },
};

export const orderInvalidLineModifierOverMax: Scenario = {
  name: 'order.invalid-line.modifier-over-max',
  requires: [],
  async run(ctx) {
    const outlet = await ctx.pickOutlet();
    const menu = await ctx.pickMenu(outlet.outletId);
    const found = groupWithMax(menu);
    if (!found) throw new SkipScenario('no modifier group on the menu has a maximum');
    const modifier = found.group.modifiers[0];
    await expectInvalidLine(ctx, 'overmax', [{ variantId: found.variant.variantId, quantity: 1, modifiers: [{ modifierId: modifier.modifierId, quantity: found.group.max + 1 }] }], 0);
  },
};
