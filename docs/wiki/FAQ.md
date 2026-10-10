# FAQ

Short answers. Each links to the page with the detail.

## Getting started

### Do I need a restaurant to try this?

No. The mock stands in for the API and comes with four test keys. Start with
[Run the demo locally](01-Run-the-demo-locally.md).

### Can I ship the demo or the mock?

No. The demo keeps the key in the browser, and the mock is a simulator. Copy the client (`packages/client`) and
the receiver's handler (`packages/webhook-receiver`). See [Home](Home.md#what-it-is-not).

### Do I need a separate key for each restaurant?

Yes. A key belongs to one restaurant and shows you nothing at another. See
[Get and store your key](02-Get-and-store-your-key.md).

### Which scopes should I ask for?

`menu.read` and `orders.write` to take orders, plus `partner.webhook` if you want events. See
[Get and store your key](02-Get-and-store-your-key.md#what-a-restaurant-gives-you).

## Menus and orders

### Why did my order's price differ?

The restaurant prices every order itself and never trusts yours. If `partnerTotal` differs from its total by more
than 0.01, the order is still created with `priceMismatch: true`. Your menu copy was probably stale. See
[Place and track an order](04-Place-and-track-an-order.md#a-price-mismatch-is-flagged-not-refused).

### How often may I fetch a menu?

Once a minute per outlet is enough, with `If-None-Match`, because the API rebuilds a menu at most that often. See
[Sync a menu](03-Sync-a-menu.md#how-often-to-ask).

### What happens if the restaurant never answers an order?

It is rejected automatically after the outlet's `acceptTimeoutMinutes`, with the reason `timeout`. See
[Place and track an order](04-Place-and-track-an-order.md#the-accept-timeout).

### Can I cancel an order?

While it is `pending` or `accepted`. From `preparing` on, the API answers `409 cannot_cancel`. See
[Place and track an order](04-Place-and-track-an-order.md#cancelling).

### Is it safe to retry a create that timed out?

Yes, if you send the same `Idempotency-Key` and the same body: the API replays the first answer. See
[Place and track an order](04-Place-and-track-an-order.md#idempotency-keys).

### Can I change an order after placing it?

The API has no call for that. The calls are listed in [`CONTRACT.md`, Endpoints](../../CONTRACT.md#endpoints).
Cancel while you still can and place a new order with a new `partnerReference`.

## Webhooks

### Do I still need to poll?

Yes. A webhook is a prompt, not a record. Delivery is one attempt, so an event can be lost. With a working webhook
you can poll an open order every 60 seconds and a menu every 10 minutes, instead of every few seconds. See
[Place and track an order](04-Place-and-track-an-order.md#how-often-to-ask-for-the-status).

### What happens to events while my endpoint is down?

They are lost. Each event is sent once; a failure is recorded and not sent again. `GET webhook` shows the last
outcome and counts consecutive failures. When you are back, read your open orders and your menus directly to catch
up. See [Troubleshooting](Troubleshooting.md#consecutivefailures-keeps-climbing).

### Can events arrive twice or out of order?

Yes to both. Ignore an event `id` you have already handled, and ignore an order event older than the last one you
applied to that order. See
[Set up webhooks](05-Set-up-webhooks.md#handle-duplicates-and-out-of-order-events).

### How do I rotate the secret?

Send `PUT webhook` again with the same URL. The answer carries a new secret, and the old one stops at once. Store
the new one immediately. Events signed in the gap fail your check and are lost; polling covers them. There is no
period in which both secrets work. See [Set up webhooks](05-Set-up-webhooks.md#store-the-secret).

### Can one URL serve many restaurants?

Not safely. Each restaurant issues its own secret, and an event does not say which restaurant sent it before you
have verified it. Give each restaurant its own URL, for example a path segment you mint such as
`/webhooks/foodops/7f3a9c`, and look the secret up from the URL before you verify. The sample receiver serves one
key and holds one secret. See [Set up webhooks](05-Set-up-webhooks.md#limits-of-the-sample-receiver).

### Can I have two webhooks at one restaurant, one for test and one for production?

No. There is one webhook per restaurant and delivery partner, not per key. Registering a second URL replaces the
first and stops its secret. See [Point at a real restaurant](07-Point-at-a-real-restaurant.md#webhooks-at-a-real-restaurant).

### Does rotating my API key remove my webhook?

No. The webhook belongs to you at that restaurant, not to the key. See
[`CONTRACT.md`, Webhooks](../../CONTRACT.md#webhooks).

### Why can I not register `http://localhost`?

A real API calls only a public https URL on port 443. The mock is the one exception. See
[Expose your receiver](06-Expose-your-receiver.md).

### Will I get events for orders placed before I registered?

Only for what happens after the webhook was set. An order that was already open sends its later status changes;
nothing earlier is replayed.

### Which events can I choose?

Two families: `order` and `menu`. Leave `events` out of the `PUT` for both. See
[Set up webhooks](05-Set-up-webhooks.md).

## Testing

### What do the scenarios do to a restaurant?

They place orders and cancel them, and they set and remove a webhook only when none is registered. Run them
against a test restaurant, never with a live key. See [Run the scenarios](08-Run-the-scenarios.md).

### Why were some scenarios skipped?

They need something the target does not offer, such as the mock's simulator or a closed outlet. A skip is not a
failure. See [Run the scenarios](08-Run-the-scenarios.md#read-the-result).

### Does the mock behave exactly like the real API?

No. The differences are listed in
[Use the mock server](09-Use-the-mock-server.md#where-the-mock-deliberately-differs-from-the-real-api).

### Something else is wrong.

Look for the message in [Troubleshooting](Troubleshooting.md).
