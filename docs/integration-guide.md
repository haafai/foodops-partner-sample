# Integrating with a FoodOps restaurant

This guide walks through everything the sample code does, in the order you will need it. It names no
internal systems: everything you need is the base URL and the key the restaurant gives you, and the contract
in [`CONTRACT.md`](../CONTRACT.md).

## 1. The credential

Each restaurant issues you **one key** for that restaurant. It looks like `hbk_test_k3f7x2m4q6zt_…` or
`hbk_live_…`. Send it on every request as `Authorization: Bearer <key>`.

- The 12-character id after the environment is the only part you may log or show. The sample's `redactKey()`
  is what to call before anything reaches a log line or a screen.
- Never put the key in a URL, a client-side app, or a repository. The API refuses keys in the query string.
- `hbk_test_` keys work only against a test restaurant; `hbk_live_` keys only in production and only over https.
  The demo refuses to save a live key against a non-https or localhost URL.
- A key carries scopes: `menu.read`, `orders.write` and, for webhooks, `partner.webhook`. Ask the restaurant for the ones you need.
- A wrong, revoked or expired key answers `401 invalid_api_key`; a key without the right scope answers
  `403 insufficient_scope`; a key that is not bound to a delivery partner answers `403 partner_key_required`.
  All three mean "stop and talk to the restaurant", not "retry".

**About the demo app.** The demo keeps the key in the browser and calls the API from the page. It is a
development and demonstration tool only. A production integration calls the API from your server, where the
key lives in a secret store. Browser-to-API calls also require the API to allow the page's origin, which a
real restaurant API may not.

## 2. Menu sync

`GET outlets` lists the restaurant's outlets that take your orders, with `acceptingOrders` (a till is open
and online ordering is on) and `acceptTimeoutMinutes` (how long a new order waits for the kitchen before
it is rejected automatically).

`GET outlets/{outletId}/menu` returns the menu **with the prices this restaurant has set for you**. When
`partnerPriceList` is null you are seeing list prices. Prices include tax when `pricesIncludeTax` is true.

Sync cheaply: keep the `ETag` from the last response and send it back as `If-None-Match`. An unchanged menu
answers `304` with no body. The server rebuilds a menu at most once a minute, so polling every 60 seconds is
the right cadence. The sample's `getMenu(outletId, { ifNoneMatch })` returns `{ modified: false }` for a 304.

A variant with `available: false` is still listed so you can show it as sold out; ordering it is refused with
`422 invalid_line`. Modifier groups carry `min` and `max`; the demo's cart enforces them before an order is
sent, which is the same rule the API applies.

## 3. The order lifecycle

```
                 ┌──────────┐  accept   ┌──────────┐ start  ┌───────────┐ done  ┌───────┐ collect ┌───────────┐
  POST orders ─► │ pending  │ ────────► │ accepted │ ─────► │ preparing │ ────► │ ready │ ──────► │ picked_up │
                 └────┬─────┘           └────┬─────┘        └───────────┘       └───────┘         └───────────┘
       reject / timeout │            partner or restaurant cancel │
                        ▼                                         ▼
                 ┌──────────┐                              ┌───────────┐
                 │ rejected │                              │ cancelled │
                 └──────────┘                              └───────────┘
```

- `POST orders` answers `201` with the restaurant's totals and the order `pending`. The restaurant accepts or
  rejects it; if nobody answers within `acceptTimeoutMinutes`, it is rejected with reason `timeout`.
- **You may cancel while `pending` or `accepted`.** From `preparing` on, `POST orders/{id}/cancel` answers
  `409 cannot_cancel`: the kitchen has started. Cancelling an order that is already `cancelled` or `rejected`
  answers `200` with the order as it is.
- When you cancel, the order's `reason` comes back prefixed `Partner: `: cancel with `customer left` and read
  `Partner: customer left`.
- `picked_up`, `rejected` and `cancelled` are final. Stop polling.

## 4. Idempotency and retry

Both writes require an `Idempotency-Key` header. This is how a retry after a timeout replays the original
answer instead of placing a second order.

1. Mint the key **before** the first attempt (`newIdempotencyKey()` is a UUID).
2. Send the same key on every retry of that same request.
3. Never reuse a key with a different body: the API answers `409 idempotency_conflict`.

Retry only what can succeed on a second try: a transport failure, a timeout, a `429` (wait `Retry-After`) or
a `5xx`. Every other `4xx` is telling you something about the request; retrying it changes nothing. The
sample's `withRetry` encodes exactly this and is a wrapper, so you can see where the retry happens. It backs
off exponentially with a little random jitter, and never waits more than 60 seconds for a `Retry-After`.

Give every request a deadline. The client's `timeoutMs` option (default `15000`) aborts a request that has had
no answer by then and throws a `PartnerTimeoutError`, which `withRetry` retries with the same idempotency key:

```ts
const client = new PartnerClient({ baseUrl, apiKey, timeoutMs: 15_000 });
const key = newIdempotencyKey();
const created = await withRetry(() => client.createOrder(request, key));
```

The demo's checkout shows the key on screen, mints a new one whenever you change anything, and sends the same
one when you click "Try again with the same key".

## 5. Errors and what to do

| Code | What to do |
|---|---|
| `invalid_request` | Fix the field the message names. |
| `idempotency_key_required` | Add the header (section 4). |
| `invalid_webhook_url` | The URL must be https on a public host, port 443, with no user or password (section 6). |
| `invalid_events` | Send `["order"]`, `["menu"]`, both, or leave `events` out. |
| `invalid_api_key`, `partner_key_required`, `insufficient_scope`, `endpoint_not_available`, `ip_not_allowed`, `quota_exceeded` | A setup problem. Stop and talk to the restaurant. |
| `outlet_restricted_key` | A key restricted to some outlets cannot register a webhook. Ask the restaurant for a key without that restriction, or keep polling. |
| `not_found` | The outlet or order is not yours or no longer exists; refresh your outlet list. On `GET webhook` it means none is set, and on `PUT webhook` that this API does not offer webhooks. |
| `duplicate_order` | You already placed this reference at this outlet today; the body carries `orderId`. Open that order. |
| `outlet_closed` | The till is closed; nothing was queued. Tell the customer; try later. |
| `outlet_not_accepting` | Online ordering is paused at that outlet. |
| `outlet_not_configured` | The outlet cannot take delivery orders yet; tell the restaurant. |
| `invalid_line` | `line` says which (0-based: `0` is the first line you sent); `reason` says why. Refresh the menu and rebuild the order. |
| `cannot_cancel` | The kitchen has started. Call the restaurant. |
| `idempotency_conflict` | You reused a key with a different body. Mint a new key. |
| `rate_limited` | Wait `Retry-After` seconds. The limit is 10 requests per second per key, burst 30. |
| `auth_unavailable` | Temporary. Retry with the same idempotency key. |

## 6. Webhooks, with polling as the backstop

You can learn about changes in two ways, and a good integration uses both.

**Webhooks tell you quickly.** Register one URL per restaurant with `PUT webhook`
(`client.setWebhook('https://hooks.example.com/webhooks/foodops')`). The restaurant's API then posts a small signed
event there when one of your orders is accepted, started, ready, picked up, rejected or cancelled, and when an
outlet's menu changes for you. Your key needs the `partner.webhook` scope. A key restricted to some outlets cannot
register a webhook: `PUT` answers `403 outlet_restricted_key`. Each restaurant has its own secret, so when you
serve many, give each restaurant its own URL (a path segment you mint) and look the secret up from it; the sample
receiver serves one key and holds one secret.

1. **Store the secret from the `PUT` answer before anything else.** It is shown once. Every later `PUT` issues a
   new one and the old one stops at once, so a rotation is: `PUT`, store, done. Events signed with the new secret
   can arrive in the moment before you have stored it; they fail your check and are lost, which is one
   reason the backstop below exists. A replacing `PUT` keeps the endpoint's history (`createdAt`, `lastDelivery`,
   `consecutiveFailures`) and changes `url`, `events`, `updatedAt` and the secret.
2. **Verify every delivery.** Compute HMAC-SHA256 over `<t>.<raw body>` with the secret's 32 bytes and compare it,
   in constant time, with `v1` from the `Hubits-Signature` header. Use the bytes exactly as they arrived: a body that
   was parsed and serialised again no longer matches. Refuse a `t` more than five minutes from now. The sample's
   `verifyWebhookSignature` does all of this, and `CONTRACT.md` has a test vector to check your own code against.
3. **Answer `2xx` within five seconds, before doing the work.** There is one attempt and no retry. Put the event
   on your own queue and answer; do not call the API back or write to a slow store first.
4. **Ignore an `id` you have seen**, and **ignore an order event whose `createdAt` is older than the last one you
   applied to that order.** There is no ordering guarantee: events can arrive out of order and can repeat. Never
   move an order out of a final status. Times are ISO-8601 UTC with up to seven fractional digits and trailing
   zeros dropped, so parse both `2026-10-08T09:12:44Z` and `2026-10-08T09:12:44.1234567Z`.
5. **On `menu.updated`, re-fetch that outlet's menu with `If-None-Match`**, exactly as in section 2. The event carries
   only the outlet and the new `version`. Rarely, the answer is still your old version: the API served its
   one-minute copy. Ask once more a minute later.
6. **Keep the URL public and boring.** `https`, port 443, a host that resolves only to public addresses. Expose the
   one route that takes deliveries and nothing else; the sample receiver puts its own control routes on a second
   port for that reason.

**Polling tells you the truth.** An event can be lost: your endpoint was restarting, the restaurant's server was
restarting, the network dropped it. Nothing is sent twice. A webhook is a prompt, not a record. So keep polling, slowly:

| | Without a webhook | With a working webhook |
|---|---|---|
| One order | every 5 s for the first two minutes, then every 15 s | every 60 s |
| Many orders on one key | the open ones every 15 s | the open ones every 60 s |
| A menu | every 60 s with `If-None-Match` | every 10 minutes with `If-None-Match` |

Stop polling an order at a final status either way. `GET webhook` shows the last delivery and how many have failed
in a row; when that number climbs, your endpoint is the problem and polling is carrying you. Fall back to the
left-hand column until it is fixed. Check it on a timer, not only at start-up: an endpoint that is running and
holds a secret can still be unreachable. The demo re-reads `GET webhook` every minute while its webhook is
registered and calls the webhook working only while `consecutiveFailures` is `0`.

## 7. Your reference

`partnerReference` is your order id, 1–64 characters. The same reference at the same outlet within 24 hours
is refused as a duplicate, which protects you from double-placing when your own retry logic goes wrong.
Make it unique per customer order.

## 8. Prices and totals

The restaurant's totals are the ones that count. `partnerTotal` is what you charged the customer; send it so
the restaurant can check. A difference beyond 0.01 sets `priceMismatch: true` in the create response, and
the order still goes through, flagged for the restaurant's staff. Keep your menu copy fresh (section 2) and
mismatches will be rare.

Prices arrive as JSON numbers. A production integration should carry money in a decimal type; the sample
rounds to two decimals before it sends or compares anything.

## 9. Going live

- [ ] You have a `hbk_test_` key for a test restaurant and the scenarios pass against it
      (`npm run scenarios`; scenarios that need the restaurant to act will be skipped).
- [ ] Idempotency keys are minted before the first attempt and reused on retries.
- [ ] Menu sync sends `If-None-Match` and runs no more often than once a minute per outlet.
- [ ] Polling follows section 6 and stops at a final status.
- [ ] If you use webhooks: the signature is verified over the raw body, a stale timestamp is refused, a repeated
      `id` and an older `createdAt` are ignored, the handler answers before it works, and the slow poll is still running.
- [ ] The webhook secret lives where the key lives, and only the delivery route is reachable from the internet.
- [ ] The key lives in a server-side secret store, never in a client app or a URL, and only its id is logged.
- [ ] You have a `hbk_live_` key per restaurant, used only over https.
