# Troubleshooting

Find the message or behaviour you are seeing; each entry gives the cause and the fix. API errors arrive as a real
HTTP status with a body `{ "error": "<code>", "message": "<text>" }`. The full list of codes is in
[`CONTRACT.md`, Errors](../../CONTRACT.md#errors).

## API errors

### `401 invalid_api_key`

**Cause.** The key is missing, mistyped, revoked, expired, or for the other environment (a test key against a live
API or the reverse). The mock answers this for any key other than its four built-in ones, and for a key sent in the
query string.

**Fix.** Send the key as `Authorization: Bearer <key>` and nowhere else. Check that the whole key was copied and
that the base URL belongs to the same restaurant. If it still fails, ask the restaurant for a new key. Do not retry.

### `403 partner_key_required`

**Cause.** The key exists but is not bound to a delivery partner. In the mock, `hbk_test_mockunbd0001_unbound`
shows this.

**Fix.** Ask the restaurant to issue the key for you as their delivery partner. Do not retry.

### `403 endpoint_not_available`

**Cause.** The restaurant has not enabled partner ordering.

**Fix.** Ask the restaurant to enable it. Nothing on your side changes this.

### `403 insufficient_scope`

**Cause.** The key lacks the scope the call needs: `menu.read` for outlets and menus, `orders.write` for orders,
`partner.webhook` for the webhook. The message names the scope, for example "This key does not carry the
orders.write scope."

**Fix.** Ask the restaurant to add the scope. See [Get and store your key](02-Get-and-store-your-key.md).

### `403 ip_not_allowed`

**Cause.** The key has an IP allow-list and your call came from an address outside it.

**Fix.** Give the restaurant the public address your server calls from, or call from an address already on the list.

### `403 outlet_restricted_key`

**Cause.** You sent `PUT webhook` with a key that the restaurant restricted to some of its outlets. Such a key
cannot register a webhook.

**Fix.** Ask the restaurant for a key without the outlet restriction, or do without webhooks and keep polling at
the normal rate. Reading menus and placing orders with the restricted key is unaffected. The mock has no restricted
key, so you will only see this against a real API; the scenarios report it as a skip.

### `404 not_found`

**Cause.** It depends on the call:

| Call | Meaning |
|---|---|
| `GET outlets/{outletId}/menu`, `POST orders` | No outlet with that id takes your orders. |
| `GET orders/{orderId}`, `POST orders/{orderId}/cancel` | No order with that id is visible to this key. The API answers `404`, never `403`, for an order that is not yours. |
| `GET webhook` | No webhook is set. This is a normal answer, not a fault. |
| `PUT webhook` | This API does not offer webhooks. |

**Fix.** Refresh your outlet list with `GET outlets`. Check that you are using the key of the restaurant the order
belongs to. For `PUT webhook`, keep polling: there is nothing to register with.

### `409 duplicate_order`

**Cause.** You already created an order with this `partnerReference` at this outlet in the last 24 hours.

**Fix.** The body carries `orderId`: open that order instead of creating another. Make `partnerReference` unique
per customer order.

### `409 outlet_closed`

**Cause.** No till is open at the outlet. Nothing was queued. In the mock, Lagoon Kiosk starts closed.

**Fix.** Tell the customer and try later. Check `acceptingOrders` in `GET outlets` before you offer an outlet.

### `409 cannot_cancel`

**Cause.** The order is `preparing` or later: the kitchen has started.

**Fix.** You cannot cancel through the API any more. Call the restaurant.

### `409 idempotency_conflict`

**Cause.** You reused an `Idempotency-Key` with a different request body.

**Fix.** Mint a new key for the new request. Reuse a key only to retry the identical request. See
[Place and track an order](04-Place-and-track-an-order.md#idempotency-keys).

### `422 outlet_not_accepting`

**Cause.** The outlet has paused online ordering.

**Fix.** Tell the customer and try later. `acceptingOrders` in `GET outlets` is false while this lasts.

### `422 outlet_not_configured`

**Cause.** The outlet cannot take delivery orders yet.

**Fix.** Tell the restaurant; they need to finish setting the outlet up.

### `422 invalid_line`

**Cause.** A line names a variant that is unknown or unavailable, or its modifiers break a group's `min` or `max`.
The body adds `line` (counted from 0) and `reason`, for example
`{"error":"invalid_line","message":"Line 0: variant unavailable.","line":0,"reason":"variant unavailable"}`.

**Fix.** Your menu copy is stale. Re-fetch the menu ([Sync a menu](03-Sync-a-menu.md)) and rebuild the order.

### Other codes

| Answer | Fix |
|---|---|
| `400 invalid_request` | Fix the field named in `field`. |
| `400 idempotency_key_required` | Add the `Idempotency-Key` header to the write. |
| `400 invalid_webhook_url` | Follow the URL rules in [Expose your receiver](06-Expose-your-receiver.md#the-url-rules). |
| `400 invalid_events` | Send `["order"]`, `["menu"]`, both, or leave `events` out. |
| `402 quota_exceeded` | The key's quota is spent. Talk to the restaurant. |
| `429 rate_limited` | Wait the number of seconds in `Retry-After`, then retry. |
| `503 auth_unavailable` | Temporary. Retry, with the same idempotency key for a write. |

## Webhooks

### "No receiver is answering this page at http://127.0.0.1:4021"

**Cause.** The demo's Webhooks card could not read the receiver's control port. Either the receiver is not
running, or it refused the page: it answers a page it does not know with `403 origin_not_allowed`, and a browser
reports such a refusal as no answer at all. Nothing was changed at the restaurant.

**Fix.** Start the receiver with `npm run receiver`. If it is already running, look at the address in your
browser's address bar: if it is not `http://localhost:5180` or `http://127.0.0.1:5180`, follow
[the next entry](#the-demo-started-on-a-port-other-than-5180).

### The demo started on a port other than 5180

**Cause.** Port 5180 was taken when you ran `npm run dev`, so the demo printed, for example,
`Port 5180 is in use, trying another one...` and `Local:   http://localhost:5181/`. Ordering works from the new
address. The receiver's control port only allows pages on port 5180 by default, so the Webhooks card reports "No
receiver is answering this page".

**Fix.** Either stop whatever holds port 5180 and start the demo again, or allow the new address. Add this line to
`.env` in the repository root, with the address the demo printed, and restart the receiver:

```text
WEBHOOK_ALLOWED_ORIGINS=http://localhost:5180,http://127.0.0.1:5180,http://localhost:5181
```

You can confirm without a browser. This prints `200` when the address is allowed and `403` when it is not:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4021/_receiver/state -H "Origin: http://localhost:5181"
```

The key and the webhook addresses you saved in the demo are stored per address, so enter them again at the new one.

### Deliveries are refused: signature mismatch

**Symptom.** `GET webhook` shows `"outcome":"http_error"` with `"httpStatus":401`; the sample receiver answers
`{"error":"invalid_signature"}`; your own verifier rejects every event.

The sample receiver records why. Read it with `curl -s http://127.0.0.1:4021/_receiver/state` and look at
`lastRejection.reason`:

| `reason` | Cause | Fix |
|---|---|---|
| `signature_mismatch` | The body was changed before it was verified, or the secret is not the current one. | See the two cases below. |
| `timestamp_out_of_tolerance` | The `t` in the signature is more than five minutes from your clock. | Synchronise your server's clock. If you are replaying a captured delivery, that is the check working. |
| `no_secret` | The receiver holds no secret: it was restarted, or the secret was never handed over. | Register again, or start the receiver with `PARTNER_WEBHOOK_SECRET` set. |
| `missing_header`, `malformed_header` | The request has no usable `Hubits-Signature` header. | The request did not come from the API, or a proxy removed the header. |
| `bad_secret` | The stored secret is not a `whsec_` value. | Store the `secret` field of the `PUT` answer exactly as returned. |

**A re-serialised body.** The signature covers the bytes that arrived. If your framework parses the JSON and you
verify a string you built from the parsed object, the bytes differ and the check fails. Read the raw request body,
verify that, and parse it afterwards. [Set up webhooks](05-Set-up-webhooks.md#verify-a-signature) has a command
that shows the difference.

**The wrong secret after a rotating `PUT`.** Every `PUT webhook` issues a new secret and the old one stops at once.
If anyone registered again (a colleague, the demo's **Register again (new secret)** button, a deploy script), your
stored secret is now the old one. Make one more `PUT`, store its `secret` immediately, and make sure only one
system performs that call for each restaurant.

### `consecutiveFailures` keeps climbing

**Cause.** The API cannot deliver to your URL. `lastDelivery.outcome` in `GET webhook` says how it failed:

| `outcome` | Meaning | Fix |
|---|---|---|
| `http_error` | Your endpoint answered something other than `2xx`. `httpStatus` holds it. | `401`: see the signature entry above. `404`: the registered path is wrong. `5xx`: your handler failed. |
| `timeout` | No complete answer within five seconds. | Answer first, work afterwards. |
| `connection_failed` | Nothing accepted the connection. | Your endpoint or tunnel is down, or the host name no longer exists. |
| `blocked_address` | The host now resolves to a private address. | Point the host name at a public address. |

Nothing that failed is sent again. Fix the endpoint, then read the orders and menus you care about directly to
catch up, and poll at the rate you would use without a webhook until the count is back to `0`.

### A `304` after `menu.updated`

**Cause.** You received `menu.updated`, re-fetched the menu with `If-None-Match`, and got `304` or the version you
already had. The API serves a built menu for up to 60 seconds, and your request met that copy.

**Fix.** Ask once more a minute later. Compare the `version` you then hold with the `version` in the event. Your
regular menu poll would also pick the change up. The mock rebuilds the menu on every request, so you will not see
this against it.

### An event never arrived

**Cause.** Delivery is one attempt with no retry. The event was lost while your endpoint was down, restarting, or
between a `PUT` and the moment you stored the new secret. A new webhook also receives only what happens after it
was set.

**Fix.** Nothing to fix in the webhook. Your polling reads the current status; make sure it is running. See the
[FAQ](FAQ.md#what-happens-to-events-while-my-endpoint-is-down).

### The Webhooks card says "It has no secret (it was restarted). Register again."

**Cause.** The sample receiver keeps its secret in memory and was restarted.

**Fix.** Press **Register again (new secret)** on the card, or start the receiver with the current secret in
`PARTNER_WEBHOOK_SECRET`.

### "PARTNER_WEBHOOK_SECRET is not a whsec_ secret"

**Cause.** The receiver refused to start because the value in `.env` is not `whsec_` followed by 32 bytes in
base64url.

**Fix.** Remove the line, or paste the `secret` value from the `PUT webhook` answer exactly.

## Scenarios

### A webhook is still registered after a scenario failed to clean up

**Symptom.** A run printed `cleanup: the webhook this scenario registered could not be removed (...)`, or later
runs skip with "a webhook is already registered for this key (...); not replacing it".

**Cause.** The scenario registered a webhook and its `DELETE` failed after four attempts, usually because the API
or the network was failing at that moment. The registration is still there and the restaurant keeps posting to it.

**Fix.** Remove it yourself with the same key:

```bash
set -a; . ./.env; set +a
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$PARTNER_API_BASE_URL/api/external/v1/partner/webhook" -H "Authorization: Bearer $PARTNER_API_KEY"
```

Expect `204`. If the skip message names a host that is not your tunnel, the webhook is not the runner's: it is
someone's real receiver. Leave it alone. See [Run the scenarios](08-Run-the-scenarios.md#what-the-scenarios-leave-behind).

### "Need --base-url and --key, or PARTNER_API_BASE_URL and PARTNER_API_KEY."

**Cause.** The runner found neither flags nor a `.env` file in the directory you ran `npm` from.

**Fix.** Run from the repository root after `cp .env.example .env`, or pass both flags after `--`.

### Many scenarios fail with "This key does not carry the orders.write scope."

**Cause.** The key you are testing with lacks a scope the scenarios use.

**Fix.** Use a key with `menu.read` and `orders.write`. That is a key problem, not an API problem.

### A webhook scenario fails with `EADDRINUSE`

**Cause.** `--webhook-listen-port` names a port that is already taken, often by `npm run receiver` on 4020.

**Fix.** Stop the other process, or choose another port and point your tunnel at it.

## Demo

### Every call fails in the demo, but `curl` works

**Cause.** The demo calls the API from the browser, and the API does not allow the demo's page origin. A browser
blocks the answer before the page can read it.

**Fix.** None in the demo. Use `curl` and the scenarios against that API. See
[Point at a real restaurant](07-Point-at-a-real-restaurant.md#the-demos-browser-origin-limit).

### "A live key may only be used over https against a production host."

**Cause.** You entered a `hbk_live_…` key with a base URL that is not https or that is `localhost` or `127.0.0.1`.

**Fix.** Use a test key for development. The demo is not meant for live keys.

### The demo still shows "Mock" after you changed the base URL

**Cause.** The pill reads "Mock" whenever the simulator answers at the base URL, so the saved base URL is still the
mock's.

**Fix.** Open Setup, correct the Base URL, and press **Save and continue**.
