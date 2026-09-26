# FoodOps delivery partner sample

A sample integration for the FoodOps delivery partner API, for developers at delivery platforms who
connect to restaurants running FoodOps. It contains:

| Part | What it is | Copy it? |
|---|---|---|
| `packages/client` | A dependency-free TypeScript client: five calls, one error type, a retry helper. | Yes, this is the point. |
| `packages/mock-server` | A mock of the API that follows the contract rule for rule, with a simulated restaurant under `/_mock/`. | Run it; do not ship it. |
| `apps/demo` | A small ordering app: outlets, menu with your prices, cart, checkout, live tracking, cancel. | Read it for the patterns. |
| `apps/scenarios` | Twenty-one named checks you can point at any base URL, including a real restaurant with a test key. | Run it before going live. |

The contract this targets is pinned in [`CONTRACT.md`](CONTRACT.md). The walkthrough is
[`docs/integration-guide.md`](docs/integration-guide.md).

## Five-minute start

Needs Node 22.

```bash
npm install
npm run mock            # the mock API on http://127.0.0.1:4010, with four built-in test keys
npm run dev             # the demo on http://localhost:5180
npm run scenarios -- --base-url http://127.0.0.1:4010 --key hbk_test_mockfull0001_fullscopes
```

In the demo's Setup screen, enter the mock URL and the key `hbk_test_mockfull0001_fullscopes`. Place an order,
then use the restaurant simulator on the tracking page to accept, advance, reject or time it out.

## Pointing at a real restaurant

The restaurant gives you a base URL and a key. Test keys start `hbk_test_`; live keys start `hbk_live_` and
only ever travel over https.

```bash
cp .env.example .env    # then edit PARTNER_API_BASE_URL and PARTNER_API_KEY
npm run scenarios       # reads .env; scenarios that need the simulator report as skipped
```

Run the scenarios against a test restaurant, never a live one: they place and cancel real orders.

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

const client = new PartnerClient({ baseUrl: process.env.PARTNER_API_BASE_URL!, apiKey: process.env.PARTNER_API_KEY! });
const [outlet] = await client.listOutlets();
const { menu } = await client.getMenu(outlet.outletId) as { modified: true; menu: PartnerMenu };

const key = newIdempotencyKey();          // mint BEFORE the first attempt…
const created = await withRetry(() =>     // …and reuse it on every retry
  client.createOrder({ outletId: outlet.outletId, partnerReference: 'PX-88213', lines: [{ variantId: menu.categories[0].items[0].variants[0].variantId, quantity: 1 }] }, key));
```
