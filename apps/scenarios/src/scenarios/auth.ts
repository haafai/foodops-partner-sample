import assert from 'node:assert/strict';
import { PartnerApiError, PartnerClient } from '@foodops-partner/client';
import type { Scenario } from '../scenario';

export async function expectApiError(promise: Promise<unknown>, status: number, code: string): Promise<PartnerApiError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof PartnerApiError, `expected a PartnerApiError, got ${String(error)}`);
    assert.equal(error.status, status, `expected ${status} ${code}, got ${error.status} ${error.code}: ${error.message}`);
    assert.equal(error.code, code, `expected ${status} ${code}, got ${error.status} ${error.code}: ${error.message}`);
    return error;
  }
  assert.fail(`expected ${status} ${code}, but the call succeeded`);
}

export const authWrongKey: Scenario = {
  name: 'auth.wrong-key',
  requires: [],
  async run(ctx) {
    const client = new PartnerClient({ baseUrl: ctx.baseUrl, apiKey: 'hbk_test_nobodyhome01_notasecret', fetch: ctx.fetchImpl });
    await expectApiError(client.listOutlets(), 401, 'invalid_api_key');
  },
};

export const authMenuOnlyKey: Scenario = {
  name: 'auth.menu-only-key',
  requires: ['menu-only-key'],
  async run(ctx) {
    const client = new PartnerClient({ baseUrl: ctx.baseUrl, apiKey: ctx.menuOnlyKey!, fetch: ctx.fetchImpl });
    const outlets = await client.listOutlets();
    assert.ok(outlets.length >= 1, 'menu.read must allow listing outlets');
    const outlet = outlets[0];
    await expectApiError(
      client.createOrder({ outletId: outlet.outletId, partnerReference: ctx.reference('menuonly'), lines: [{ variantId: 'any', quantity: 1 }] }, 'idem-menu-only'),
      403, 'insufficient_scope',
    );
  },
};

export const authUnboundKey: Scenario = {
  name: 'auth.unbound-key',
  requires: ['unbound-key'],
  async run(ctx) {
    const client = new PartnerClient({ baseUrl: ctx.baseUrl, apiKey: ctx.unboundKey!, fetch: ctx.fetchImpl });
    await expectApiError(client.listOutlets(), 403, 'partner_key_required');
  },
};
