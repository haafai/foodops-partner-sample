# FoodOps delivery partner sample

A sample integration for the FoodOps delivery partner API, for developers at delivery platforms who
connect to restaurants running FoodOps. It contains:

| Part | What it is | Copy it? |
|---|---|---|
| `packages/client` | A dependency-free TypeScript client: eight calls, one error type, a retry helper, and the webhook signature check. | Yes, this is the point. |
| `packages/webhook-receiver` | A small server that takes the restaurant's events: verifies each signature, answers at once, ignores repeats. | Yes: the handler is the part to copy. |
| `packages/mock-server` | A mock of the API that follows the contract rule for rule, with a simulated restaurant under `/_mock/`. | Run it; do not ship it. |
| `apps/demo` | A small ordering app: outlets, menu with your prices, cart, checkout, live tracking, cancel. | Read it for the patterns. |
| `apps/scenarios` | Twenty-five named checks you can point at any base URL, including a real restaurant with a test key. | Run it before going live. |

## What the demo is, and is not

The demo is a development and demonstration tool only: it keeps the key in the browser and calls the API
from the page. A production integration calls the API from your server, where the key lives in a secret store.
Browser-to-API calls also require the API to allow the page's origin, which a real restaurant API may not.

The demo wears a fictional brand, "Kaana", so that it reads as a consumer ordering app; no such company exists.
The pictures under `apps/demo/public/images` are AI-generated for this sample, and until they are generated
every picture is a tile with the item's initials.

The contract this targets is pinned in [`CONTRACT.md`](CONTRACT.md). The walkthrough is
[`docs/integration-guide.md`](docs/integration-guide.md).

## Five-minute start

Needs Node 22.

```bash
npm install
npm run mock            # the mock API on http://127.0.0.1:4010, with four built-in test keys
npm run receiver        # the webhook receiver: deliveries on :4020, local control on :4021
npm run dev             # the demo on http://localhost:5180
npm run scenarios -- --base-url http://127.0.0.1:4010 --key hbk_test_mockfull0001_fullscopes
```

In the demo's Setup screen, enter the mock URL and the key `hbk_test_mockfull0001_fullscopes`. Place an order,
then use the restaurant simulator on the tracking page to accept, advance, reject or time it out.

To see events instead of polling, press **Register webhook** on the Setup screen while the receiver is running.
The tracking page then says "Live by webhook" and each simulator button reaches it through a signed event.

The demo can also be pre-filled from `VITE_PARTNER_API_BASE_URL` and `VITE_PARTNER_API_KEY`. Vite inlines
`VITE_` variables into the built bundle, so `VITE_PARTNER_API_KEY` is for local development only: never set it
for a build anyone else can load.

## Pointing at a real restaurant

The restaurant gives you a base URL and a key. Test keys start `hbk_test_`; live keys start `hbk_live_` and
only ever travel over https.

The `.env` file lives at the repository root, next to `.env.example`; run the commands below from there.

```bash
cp .env.example .env    # then edit PARTNER_API_BASE_URL and PARTNER_API_KEY
npm run scenarios       # reads the root .env; scenarios that need the simulator report as skipped
```

Run the scenarios against a test restaurant, never a live one: they place and cancel real orders.

## Webhooks

The restaurant posts a signed event to a URL you register when one of your orders changes status or an outlet's
menu changes. Registering is one call with your key (`client.setWebhook(url)`); the answer carries the signing
secret, once. Every registration issues a new secret and the old one stops at once. A key restricted to some
outlets cannot register a webhook. There is no retry and no ordering guarantee, so a webhook is a prompt and a
slow poll stays as the backstop. The whole contract, with a test vector, is in [`CONTRACT.md`](CONTRACT.md#webhooks).

`packages/webhook-receiver` is the reference. It listens on two ports on purpose:

| Port | Serves | Who may reach it |
|---|---|---|
| 4020 | `POST /webhooks/foodops`, nothing else | The internet, through your proxy or tunnel. Every request must carry a valid signature. |
| 4021 | `/_receiver/*`: hand over the secret, read what arrived | This machine only. It has no login, so never expose it. |

A real restaurant's API only calls an `https` URL on a public host, port 443, and refuses anything that resolves
to a private address. To receive from one on your own machine, put a tunnel in front of port 4020 and register
the tunnel's `https` address with `/webhooks/foodops` on the end. The mock is the one exception: it accepts
`http://127.0.0.1:4020/webhooks/foodops` so the two can talk without a tunnel.

The receiver keeps the secret in memory. Restart it and it refuses every delivery until you register again
(which issues a new secret), or start it with `PARTNER_WEBHOOK_SECRET` set. In the demo the secret passes through
the page on its way from the API to the receiver, because the demo holds the key in the browser; in production
your server makes the `PUT` and the secret never leaves it.

## Development

```bash
npm test                # every unit test, all four parts
npm run typecheck && npm run lint
npm run ci:scenarios    # starts the mock and runs every scenario against it, as CI does
```

## Using the client

```ts
import { PartnerClient, newIdempotencyKey, withRetry } from '@foodops-partner/client';
import type { PartnerMenu } from '@foodops-partner/client';

const client = new PartnerClient({
  baseUrl: process.env.PARTNER_API_BASE_URL!,
  apiKey: process.env.PARTNER_API_KEY!,
  timeoutMs: 15_000,                      // the default: no answer in 15 s throws a PartnerTimeoutError, which withRetry retries
});
const [outlet] = await client.listOutlets();
const { menu } = await client.getMenu(outlet.outletId) as { modified: true; menu: PartnerMenu };

// The first available variant on an item with no required modifier group: a line the API will not refuse.
let variantId: string | undefined;
for (const item of menu.categories.flatMap((c) => c.items)) {
  if (item.modifierGroups.some((g) => g.min > 0)) continue;
  variantId = item.variants.find((v) => v.available)?.variantId;
  if (variantId) break;
}
if (!variantId) throw new Error('Nothing simple to order on this menu.');

const key = newIdempotencyKey();          // mint BEFORE the first attempt…
const created = await withRetry(() =>     // …and reuse it on every retry
  client.createOrder({ outletId: outlet.outletId, partnerReference: 'PX-88213', lines: [{ variantId, quantity: 1 }] }, key));
```

Receiving an event, in any server that gives you the raw body:

```ts
import { isOrderEvent, parseWebhookEnvelope, verifyWebhookSignature } from '@foodops-partner/client';

// rawBody: the bytes exactly as they arrived. Do NOT pass a parsed-and-re-serialised body.
const verdict = await verifyWebhookSignature({ secret: process.env.PARTNER_WEBHOOK_SECRET!, header: request.headers.get('hubits-signature'), rawBody });
if (!verdict.ok) return new Response(null, { status: 401 });
const event = parseWebhookEnvelope(rawBody);
if (!event) return new Response(null, { status: 400 });
if (!(await alreadySeen(event.id)) && isOrderEvent(event)) await queueStatusChange(event.data.orderId, event.data.status, event.createdAt);
return new Response(null, { status: 200 });   // answer first; do the slow work from your queue
```
