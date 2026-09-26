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
- A wrong, revoked or expired key answers `401 invalid_api_key`; a key without the right scope answers
  `403 insufficient_scope`; a key that is not bound to a delivery partner answers `403 partner_key_required`.
  All three mean "stop and talk to the restaurant", not "retry".

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
- `picked_up`, `rejected` and `cancelled` are final. Stop polling.

## 4. Idempotency and retry

Both writes require an `Idempotency-Key` header. This is how a retry after a timeout replays the original
answer instead of placing a second order.

1. Mint the key **before** the first attempt (`newIdempotencyKey()` is a UUID).
2. Send the same key on every retry of that same request.
3. Never reuse a key with a different body: the API answers `409 idempotency_conflict`.

Retry only what can succeed on a second try: a transport failure, a `429` (wait `Retry-After`) or a `5xx`.
Every other `4xx` is telling you something about the request; retrying it changes nothing. The sample's
`withRetry` encodes exactly this and is a wrapper, so you can see where the retry happens:

```ts
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
| `invalid_api_key`, `partner_key_required`, `insufficient_scope`, `endpoint_not_available`, `ip_not_allowed`, `quota_exceeded` | A setup problem. Stop and talk to the restaurant. |
| `not_found` | The outlet or order is not yours or no longer exists. Refresh your outlet list. |
| `duplicate_order` | You already placed this reference at this outlet today; the body carries `orderId`. Open that order. |
| `outlet_closed` | The till is closed; nothing was queued. Tell the customer; try later. |
| `outlet_not_accepting` | Online ordering is paused at that outlet. |
| `outlet_not_configured` | The outlet cannot take delivery orders yet; tell the restaurant. |
| `invalid_line` | `line` says which; `reason` says why. Refresh the menu and rebuild the order. |
| `cannot_cancel` | The kitchen has started. Call the restaurant. |
| `idempotency_conflict` | You reused a key with a different body. Mint a new key. |
| `rate_limited` | Wait `Retry-After` seconds. The limit is 10 requests per second per key, burst 30. |
| `auth_unavailable` | Temporary. Retry with the same idempotency key. |

## 6. Polling

Poll `GET orders/{orderId}` every **5 seconds while the restaurant is deciding**, then every **15 seconds**,
and stop at a final status. If you track many orders on one key, poll the open ones every 15 seconds and stay
under the rate limit. There are no webhooks in this version of the API.

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
- [ ] The key lives in a server-side secret store, never in a client app or a URL, and only its id is logged.
- [ ] You have a `hbk_live_` key per restaurant, used only over https.
