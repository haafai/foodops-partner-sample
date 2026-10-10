# Go-live checklist

At the end of this page you have checked, item by item, that your integration is ready for a live key.

## Before you start

- Your integration works against a test restaurant: [Point at a real restaurant](07-Point-at-a-real-restaurant.md).
- The scenarios pass against that test restaurant: [Run the scenarios](08-Run-the-scenarios.md).

Tick every item. The link after each one goes to the page that explains it. Items marked "webhooks" apply only if
you registered one.

## Secrets

- [ ] Each restaurant has its own key, stored in a server-side secret store.
      ([Get and store your key](02-Get-and-store-your-key.md))
- [ ] No key is in a repository, a client-side app, a URL or a log line. Logs show only the key's 12-character id.
- [ ] Live keys (`hbk_live_…`) are used only over https, and test keys only against test restaurants.
- [ ] Webhooks: each restaurant's signing secret is stored where its key is stored, and is written there before
      events are relied on. ([Set up webhooks](05-Set-up-webhooks.md#store-the-secret))
- [ ] No `.env` file and no `VITE_PARTNER_API_KEY` value is part of anything you deploy.

## Retries and idempotency

- [ ] Every `POST orders` and every cancel carries an `Idempotency-Key` minted before the first attempt and stored
      with the order. ([Place and track an order](04-Place-and-track-an-order.md#idempotency-keys))
- [ ] A retry sends the same key and the same body.
- [ ] Only a network failure, a timeout, a `429` or a `5xx` is retried. A `429` waits for `Retry-After`.
- [ ] Every request has a deadline. The sample client's default is 15 seconds.
- [ ] `partnerReference` is unique per customer order, and `409 duplicate_order` opens the existing order instead
      of showing an error.
- [ ] Each error code has a decision behind it: fix, wait, or stop and call the restaurant.
      ([Troubleshooting](Troubleshooting.md))

## Menus and prices

- [ ] Menu sync sends `If-None-Match` and runs no more than once a minute per outlet.
      ([Sync a menu](03-Sync-a-menu.md))
- [ ] A variant with `available: false` cannot be ordered from your app.
- [ ] `partnerTotal` is sent with every order, and `priceMismatch: true` in the answer is recorded and acted on.
      ([Place and track an order](04-Place-and-track-an-order.md#a-price-mismatch-is-flagged-not-refused))
- [ ] Money is carried in a decimal type, not a binary floating-point number.

## Polling backstop

- [ ] Every open order is polled on a timer and polling stops at `picked_up`, `rejected` or `cancelled`.
      ([Place and track an order](04-Place-and-track-an-order.md#how-often-to-ask-for-the-status))
- [ ] A `rejected` order with reason `timeout` is handled like any other rejection.
- [ ] Webhooks: polling is still running, at the slower rate. It is the only thing that recovers a lost event.

## Webhook handler

- [ ] The signature is verified over the raw body bytes, before the body is parsed.
      ([Set up webhooks](05-Set-up-webhooks.md#verify-a-signature))
- [ ] Signature tolerance: a timestamp more than five minutes from your clock is refused, and your servers' clocks
      are synchronised.
- [ ] Your verifier passes the test vector in [`CONTRACT.md`](../../CONTRACT.md#webhooks).
- [ ] Duplicate events: a repeated event `id` is ignored.
      ([Set up webhooks](05-Set-up-webhooks.md#handle-duplicates-and-out-of-order-events))
- [ ] An order event older than the last one applied to that order is ignored, and no order leaves a final status.
- [ ] An event type you do not know is answered `2xx` and ignored.
- [ ] The handler answers `2xx` within five seconds and does its slow work afterwards, from your own queue.
- [ ] On `menu.updated`, the menu is re-fetched with `If-None-Match`, and a `304` is tried once more a minute later.

## Webhook endpoint

- [ ] One URL per restaurant: each restaurant has its own URL, and the secret is looked up from the URL before
      verifying. ([FAQ](FAQ.md#can-one-url-serve-many-restaurants))
- [ ] The URL is https on port 443 and its host resolves only to public addresses.
      ([Expose your receiver](06-Expose-your-receiver.md#the-url-rules))
- [ ] Only the delivery route is reachable from the internet. No administration or control route shares its
      listener. ([Expose your receiver](06-Expose-your-receiver.md#never-tunnel-the-control-port))
- [ ] No tunnel address from development is still registered at any restaurant.

## Monitoring and rotation

- [ ] Failure-count monitoring: `GET webhook` is read on a timer for each restaurant, and you are alerted when
      `consecutiveFailures` is above `0` or `lastDelivery.outcome` is not `delivered`.
      ([Troubleshooting](Troubleshooting.md#consecutivefailures-keeps-climbing))
- [ ] While `consecutiveFailures` is above `0`, polling returns to the rate you use without a webhook.
- [ ] Secret rotation is rehearsed: `PUT webhook`, store the new secret, confirm the next delivery verifies. You
      know that events in the gap are lost and that polling covers them. ([FAQ](FAQ.md#how-do-i-rotate-the-secret))
- [ ] You know who to contact at each restaurant when a key stops working.

## Check it worked

Every box is ticked, and `npm run scenarios` against the test restaurant ends with `0 failed`.

## Next

- [Troubleshooting](Troubleshooting.md)
- [FAQ](FAQ.md)
