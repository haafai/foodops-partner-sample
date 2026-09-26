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
