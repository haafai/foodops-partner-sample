# Use the mock server

At the end of this page you can drive the mock's simulated restaurant by hand: change an order's status, change a
price, close an outlet and inject failures. You also know where the mock differs from the real API.

## Before you start

- The repository installed: [Run the demo locally](01-Run-the-demo-locally.md), step 1.
- Port 4010 free.

Run the mock on your own machine and nowhere else. It is a development tool and must not be deployed.

## Steps

1. Start the mock, from the repository root.

   ```bash
   npm run mock
   ```

   It listens on `http://127.0.0.1:4010`. To use another port, set the `PORT` environment variable, for example
   `PORT=4011 npm run mock`. The mock does not read `.env`.

2. Set the shell variables used below.

   ```bash
   export BASE=http://127.0.0.1:4010/api/external/v1/partner
   export KEY=hbk_test_mockfull0001_fullscopes
   export MOCK=http://127.0.0.1:4010/_mock
   ```

3. Create an order to work with, and keep its id.

   ```bash
   export ORDER=$(curl -s -X POST $BASE/orders -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -H "Idempotency-Key: $(node -e "console.log(crypto.randomUUID())")" \
     -d '{"outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","partnerReference":"PX-3001","lines":[{"variantId":"7a0e5b10-0000-4000-8000-000000000401","quantity":1}]}' \
     | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).id")
   ```

4. Accept it as the restaurant, then move it one step on.

   ```bash
   curl -s -X POST $MOCK/orders/$ORDER/accept
   curl -s -X POST $MOCK/orders/$ORDER/advance
   ```

   Each answers the order as `GET orders/{orderId}` would. After the second, `"status":"preparing"`.

5. Change a price.

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X PUT $MOCK/prices -H "Content-Type: application/json" -d '{"variantId":"7a0e5b10-0000-4000-8000-000000000101","price":99}'
   ```

   It prints `204`. The menu's `version` and `ETag` change at once, and a registered webhook is sent
   `menu.updated`.

6. Read everything the mock holds.

   ```bash
   curl -s $MOCK/state
   ```

   The answer lists the outlets with their `open` and `acceptingOnline` flags, every order, any queued faults, the
   autopilot setting and the price overrides.

## Built-in keys

The mock knows exactly these four keys. They are fixtures, printed when the mock starts, and work nowhere else.
Any other key answers `401 invalid_api_key`.

| Key | Scopes | Use it to see |
|---|---|---|
| `hbk_test_mockfull0001_fullscopes` | `menu.read`, `orders.write`, `partner.webhook` | Everything working. |
| `hbk_test_mockmenu0001_menuonly` | `menu.read` | `403 insufficient_scope` on order and webhook calls. |
| `hbk_test_mockunbd0001_unbound` | all three, but not bound to a delivery partner | `403 partner_key_required` on every call. |
| `hbk_test_mockfull0002_secondkey` | `menu.read`, `orders.write`, `partner.webhook` | `404 not_found` for the first key's orders. |

## Built-in restaurant

| Outlet | `outletId` | Starts | Prices |
|---|---|---|---|
| Marine Drive | `3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01` | open, accepting orders, `acceptTimeoutMinutes` 10 | price list "Partner +15%" |
| Lagoon Kiosk | `3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c02` | closed, `acceptTimeoutMinutes` 15 | list prices (`partnerPriceList` is `null`) |

Both serve the same eight items. Useful variants: Classic Burger, Regular `7a0e5b10-0000-4000-8000-000000000101`
(optional "Extras" group, at most 3); Chicken Burger, Regular `7a0e5b10-0000-4000-8000-000000000201` (required
"Spice level" group, exactly 1); Fish Burger, Double `7a0e5b10-0000-4000-8000-000000000302` (unavailable); Veggie
Burger, Regular `7a0e5b10-0000-4000-8000-000000000401` (no modifiers).

## Simulator routes

All are under `http://127.0.0.1:4010/_mock/`. They need no key and are not part of the API. The demo's "Restaurant
simulator" box calls the order routes for you.

| Method and route | Body | Effect |
|---|---|---|
| `GET state` | | Everything the mock holds. |
| `POST reset` | | Back to the starting state: no orders, no webhooks, original prices, outlet flags, no faults. `204`. |
| `POST orders/{orderId}/accept` | | `pending` to `accepted`. |
| `POST orders/{orderId}/advance` | | `accepted` to `preparing` to `ready` to `picked_up`, one step per call. |
| `POST orders/{orderId}/reject` | `{"reason":"Too busy"}` | `pending` to `rejected` with that reason. |
| `POST orders/{orderId}/timeout` | | `pending` to `rejected` with reason `timeout`. |
| `POST orders/{orderId}/restaurant-cancel` | `{"reason":"Kitchen closed early"}` | Any open order to `cancelled`, `cancelledBy` `restaurant`. |
| `PUT prices` | `{"variantId":"…","price":99}` | Sets that variant's price. `204`. |
| `PUT outlets/{outletId}` | `{"open":false}` or `{"acceptingOnline":false}` | Closes the till, or pauses online ordering. `204`. |
| `POST faults` | `{"responses":[{"status":429,"retryAfterSeconds":2},{"status":503}]}` | The next API calls answer these, one each, in order. `204`. |
| `PUT autopilot` | `{"enabled":true,"stepSeconds":5}` | New orders are accepted after one step and advance one status per step. `204`. |

A status change the order cannot make answers `409` with the mock-only code `invalid_transition`, for example
`{"error":"invalid_transition","message":"Cannot go from rejected to rejected."}`.

What the outlet flags do to `POST orders`: `{"open":false}` gives `409 outlet_closed`, and
`{"acceptingOnline":false}` gives `422 outlet_not_accepting`. Either makes `acceptingOrders` false in
`GET outlets`.

A queued `429` is answered as `rate_limited` with a `Retry-After` header, and a `503` as `auth_unavailable`. Any
other status from 400 to 599 is answered as plain text, which is how a failing proxy in front of an API looks.

## Where the mock deliberately differs from the real API

| Area | The mock | The real API |
|---|---|---|
| Webhook URL | Also accepts `http` or `https` to `localhost`, `127.0.0.1` or `[::1]` on any port. Does not look host names up; only refuses a private address written as a literal. | `https`, port 443, and every address the host resolves to must be public. |
| Webhook owner | One webhook per key. | One per restaurant and delivery partner, shared by all your keys there. |
| Order visibility and duplicates | Per key: the second full-access key cannot see the first key's orders. | The contract says "visible to this key" and does not say more. Ask the restaurant how two of your keys relate. |
| Outlet-restricted keys | None exist, so `403 outlet_restricted_key` never happens. | A restricted key cannot register a webhook. |
| Accept timeout | Never fires by itself. Use `POST orders/{orderId}/timeout`. | Fires after `acceptTimeoutMinutes`. |
| Limits | No rate limit, no quota, no IP allow-list. `429` and `503` appear only when you queue them. | `429 rate_limited`, `402 quota_exceeded`, `403 ip_not_allowed`. |
| Codes never produced | `endpoint_not_available`, `outlet_not_configured`, and the delivery outcome `blocked_address`. | All can occur. |
| Menu copy | Rebuilt on every request, so a price change shows at once. | A built menu is served for up to 60 seconds. |
| Price change | Applies to that variant at both outlets, so two `menu.updated` events are sent. Only variant prices can change. | Whatever the restaurant changes. |
| Totals | Tax is 8% included in the price; `serviceCharge` is always 0; `imageUrl` is always `null`. | The restaurant's own rules. |
| Times | Always three fractional digits. | Up to seven, trailing zeros dropped. |
| Browser calls | Allowed from any page origin. | May not be allowed at all. |
| Memory | Everything is lost on restart or `POST reset`. | Persistent. |
| Mock-only codes | `409 invalid_transition` on simulator routes, `500 mock_failure` if the mock itself breaks. | Not part of the contract. |

Everything else follows [`CONTRACT.md`](../../CONTRACT.md).

## Check it worked

Step 6 printed your order with `"status":"preparing"` and a `priceOverrides` list holding the variant from step 5.

Put the mock back to its starting state when you are done:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST $MOCK/reset
```

## Next

- [Run the scenarios](08-Run-the-scenarios.md), which use these routes to test what a real restaurant must do by hand.
- [Point at a real restaurant](07-Point-at-a-real-restaurant.md)
