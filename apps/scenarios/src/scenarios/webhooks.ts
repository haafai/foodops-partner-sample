import assert from 'node:assert/strict';
import { PartnerApiError, decodeWebhookSecret, isMenuEvent, isOrderEvent, newIdempotencyKey } from '@foodops-partner/client';
import type { PartnerWebhookEventName, PartnerWebhookRegistration, WebhookEnvelope } from '@foodops-partner/client';
import { startReceiver } from '@foodops-partner/webhook-receiver';
import type { ReceiverHandle } from '@foodops-partner/webhook-receiver';
import { simpleLine } from '../context';
import { SkipScenario } from '../scenario';
import type { Scenario, ScenarioContext } from '../scenario';
import { expectApiError } from './auth';

/** How long a scenario waits for an event. The API sends about a second after the change; allow for a slow tunnel. */
export const EVENT_WAIT_MS = 20_000;
/** A URL the mock accepts and nothing listens on: the discard port on this machine. */
export const MOCK_DEAD_WEBHOOK_URL = 'http://127.0.0.1:9/webhooks/foodops';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A key has ONE webhook per restaurant. These scenarios set and remove it, so they refuse to run when one is
 * already there: pointing the runner at a restaurant must never unhook that restaurant from a real receiver.
 */
async function claim(ctx: ScenarioContext): Promise<void> {
  let existing;
  try {
    existing = await ctx.client.getWebhook();
  } catch (error) {
    if (error instanceof PartnerApiError && error.code === 'insufficient_scope') throw new SkipScenario('this key does not carry the partner.webhook scope');
    throw error;
  }
  if (existing) throw new SkipScenario(`a webhook is already registered for this key (${new URL(existing.url).host}); not replacing it`);
}

/** PUT, or skip when the target has no webhook endpoints at all (an older API, or the feature switched off). */
async function register(ctx: ScenarioContext, url: string, events?: PartnerWebhookEventName[]): Promise<PartnerWebhookRegistration> {
  try {
    return await ctx.client.setWebhook(url, events);
  } catch (error) {
    if (error instanceof PartnerApiError && error.status === 404) throw new SkipScenario('this API does not offer webhooks');
    throw error;
  }
}

async function remove(ctx: ScenarioContext): Promise<void> {
  try {
    await ctx.client.deleteWebhook();
  } catch (error) {
    console.error(`cleanup: could not remove the scenario's webhook (${error instanceof PartnerApiError ? `${error.status} ${error.code}` : String(error)})`);
  }
}

async function waitForEvent(receiver: ReceiverHandle, match: (event: WebhookEnvelope) => boolean, what: string): Promise<WebhookEnvelope> {
  const deadline = Date.now() + EVENT_WAIT_MS;
  for (;;) {
    const found = receiver.state.eventsAfter(0).find((e) => match(e.event));
    if (found) return found.event;
    if (Date.now() >= deadline) {
      const rejection = receiver.state.lastRejection;
      assert.fail(`no ${what} arrived within ${EVENT_WAIT_MS / 1000} s`
        + (rejection ? `; the receiver refused ${receiver.state.rejected} delivery(ies), last reason ${rejection.reason}` : '; nothing reached the receiver at all'));
    }
    await sleep(100);
  }
}

export const webhookRegister: Scenario = {
  name: 'webhook.register',
  requires: ['webhook-url'],
  async run(ctx) {
    await claim(ctx);
    const url = ctx.webhookUrl ?? MOCK_DEAD_WEBHOOK_URL;
    // Menu events only: nothing in this scenario changes a menu, so nothing is sent to the URL while it runs.
    const first = await register(ctx, url, ['menu']);
    try {
      assert.equal(first.url, url);
      assert.deepEqual(first.events, ['menu']);
      assert.ok(decodeWebhookSecret(first.secret), 'PUT must return a whsec_ secret holding 32 bytes');
      const read = await ctx.client.getWebhook();
      assert.ok(read, 'GET must return the endpoint that was just set');
      assert.equal(read.url, url);
      assert.deepEqual(read.events, ['menu']);
      assert.equal(read.consecutiveFailures, 0);
      assert.ok(!('secret' in read), 'GET must never return the secret');
      const second = await register(ctx, url);
      assert.notEqual(second.secret, first.secret, 'every PUT must issue a new secret');
      assert.deepEqual(second.events, ['order', 'menu'], 'events left out means both, in contract order');
      assert.equal(second.createdAt, first.createdAt, 'replacing the endpoint keeps the same registration');
    } finally {
      await remove(ctx);
    }
    assert.equal(await ctx.client.getWebhook(), null, 'after DELETE, GET must answer 404');
    await ctx.client.deleteWebhook();
  },
};

export const webhookInvalidUrl: Scenario = {
  name: 'webhook.invalid-url',
  requires: [],
  async run(ctx) {
    await claim(ctx);
    try {
      const probe = await ctx.client.setWebhook('http://partner.example.com/hooks/foodops').catch((e: unknown) => e);
      if (probe instanceof PartnerApiError && probe.status === 404) throw new SkipScenario('this API does not offer webhooks');
      assert.ok(probe instanceof PartnerApiError && probe.status === 400 && probe.code === 'invalid_webhook_url',
        `plain http on a public host must be refused with 400 invalid_webhook_url, got ${probe instanceof PartnerApiError ? `${probe.status} ${probe.code}` : 'a success'}`);
      await expectApiError(ctx.client.setWebhook('https://user:secret@example.com/hooks/foodops'), 400, 'invalid_webhook_url');
      await expectApiError(ctx.client.setWebhook('https://example.com:8443/hooks/foodops'), 400, 'invalid_webhook_url');
      await expectApiError(ctx.client.setWebhook('https://10.0.0.1/hooks/foodops'), 400, 'invalid_webhook_url');
      await expectApiError(ctx.client.setWebhook('https://example.com/hooks/foodops', []), 400, 'invalid_events');
      await expectApiError(ctx.client.setWebhook('https://example.com/hooks/foodops', ['orders' as PartnerWebhookEventName]), 400, 'invalid_events');
      assert.equal(await ctx.client.getWebhook(), null, 'a refused PUT must register nothing');
    } finally {
      // Only reached with something registered if the API wrongly accepted one of the URLs above.
      if (await ctx.client.getWebhook().catch(() => null)) await remove(ctx);
    }
  },
};

export const webhookOrderEvent: Scenario = {
  name: 'webhook.order-event',
  requires: ['webhook-listener'],
  async run(ctx) {
    await claim(ctx);
    const receiver = await startReceiver({ webhookPort: ctx.webhookListenPort ?? 0 });
    let registered = false;
    try {
      const hook = await register(ctx, ctx.webhookUrl ?? receiver.webhookUrl, ['order']);
      registered = true;
      receiver.state.secret = hook.secret;
      const outlet = await ctx.pickOutlet();
      const line = simpleLine(await ctx.pickMenu(outlet.outletId));
      const partnerReference = ctx.reference('webhook');
      const created = await ctx.client.createOrder({ outletId: outlet.outletId, partnerReference, lines: [line] }, newIdempotencyKey());
      ctx.track(created.id);
      await ctx.client.cancelOrder(created.id, 'scenario webhook check', newIdempotencyKey());

      const event = await waitForEvent(receiver, (e) => isOrderEvent(e) && e.data.orderId === created.id && e.type === 'order.cancelled', `order.cancelled for ${created.id}`);
      assert.match(event.id, /^evt_[0-9A-HJKMNP-TV-Z]{26}$/, 'the event id must be evt_ plus a ULID');
      assert.ok(Math.abs(Date.now() - Date.parse(event.createdAt)) < 5 * 60_000, `createdAt ${event.createdAt} is not near now`);
      assert.deepEqual(
        { ...event.data, reason: undefined },
        { orderId: created.id, partnerReference, outletId: outlet.outletId, status: 'cancelled', cancelledBy: 'partner', reason: undefined },
      );
      assert.ok(String(event.data.reason).includes('scenario webhook check'), `reason should carry the text, got ${String(event.data.reason)}`);
      assert.equal(receiver.state.rejected, 0, `the receiver refused a delivery: ${receiver.state.lastRejection?.reason}`);
      const pending = receiver.state.eventsAfter(0).find((e) => e.event.type === 'order.pending');
      assert.equal(pending, undefined, 'pending must never be announced');

      // The API records the attempt after our 200 has travelled back, so give it a moment.
      const deadline = Date.now() + 5_000;
      let last = await ctx.client.getWebhook();
      while (last?.lastDelivery?.outcome !== 'delivered' && Date.now() < deadline) {
        await sleep(250);
        last = await ctx.client.getWebhook();
      }
      assert.equal(last?.lastDelivery?.outcome, 'delivered', 'GET webhook must show the delivery as delivered');
      assert.equal(last?.lastDelivery?.httpStatus, 200);
      assert.equal(last?.consecutiveFailures, 0);
    } finally {
      if (registered) await remove(ctx);
      await receiver.close();
    }
  },
};

export const webhookMenuEvent: Scenario = {
  name: 'webhook.menu-event',
  requires: ['mock-control', 'webhook-listener'],
  async run(ctx) {
    await claim(ctx);
    const receiver = await startReceiver({ webhookPort: ctx.webhookListenPort ?? 0 });
    let registered = false;
    let restore: (() => Promise<void>) | undefined;
    try {
      const outlet = await ctx.pickOutlet();
      const before = await ctx.client.getMenu(outlet.outletId);
      assert.ok(before.modified, 'first read must return the menu');
      const variant = before.menu.categories.flatMap((c) => c.items).flatMap((i) => i.variants)[0];
      assert.ok(variant, 'the menu has no variant to reprice');

      const hook = await register(ctx, ctx.webhookUrl ?? receiver.webhookUrl, ['menu']);
      registered = true;
      receiver.state.secret = hook.secret;
      restore = () => ctx.mock!.setPrice(variant.variantId, variant.price);
      await ctx.mock!.setPrice(variant.variantId, variant.price + 1);

      const event = await waitForEvent(receiver, (e) => isMenuEvent(e) && e.data.outletId === outlet.outletId, `menu.updated for ${outlet.outletId}`);
      const after = await ctx.client.getMenu(outlet.outletId, { ifNoneMatch: before.etag });
      assert.ok(after.modified, 'the menu must have changed after the event');
      assert.deepEqual(event.data, { outletId: outlet.outletId, version: after.menu.version }, 'the event carries the version GET menu now returns');
      assert.notEqual(after.menu.version, before.menu.version);
      assert.equal(receiver.state.rejected, 0, `the receiver refused a delivery: ${receiver.state.lastRejection?.reason}`);
    } finally {
      if (registered) await remove(ctx);
      if (restore) await restore();
      await receiver.close();
    }
  },
};
