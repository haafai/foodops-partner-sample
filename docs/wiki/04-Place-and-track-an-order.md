# Place and track an order

At the end of this page you have created an order that is safe to retry, read its status, and cancelled it.

> These steps were checked against the mock in this repository. The real API follows
> [`CONTRACT.md`](../../CONTRACT.md).

## Before you start

- The mock running: [Run the demo locally](01-Run-the-demo-locally.md), steps 1 and 2.
- A key with the `orders.write` scope: [Get and store your key](02-Get-and-store-your-key.md).
- An outlet id and a variant id from a menu: [Sync a menu](03-Sync-a-menu.md). The commands below use the mock's
  Marine Drive outlet and its Classic Burger, Regular, priced 95.

## Steps

1. Set the shell variables.

   ```bash
   export BASE=http://127.0.0.1:4010/api/external/v1/partner
   export KEY=hbk_test_mockfull0001_fullscopes
   ```

2. Mint an idempotency key **before** the first attempt. Any unique string works; a UUID is the usual choice.

   ```bash
   export IDEM=$(node -e "console.log(crypto.randomUUID())")
   ```

3. Create the order. `partnerReference` is your own order id; `partnerTotal` is what you charged the customer.

   ```bash
   curl -s -i -X POST $BASE/orders -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Idempotency-Key: $IDEM" \
     -d '{"outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","partnerReference":"PX-1001","lines":[{"variantId":"7a0e5b10-0000-4000-8000-000000000101","quantity":1}],"partnerTotal":95}'
   ```

   ```text
   HTTP/1.1 201 Created
   location: /api/external/v1/partner/orders/6da7dd03-216b-45d3-9339-eb26ec5d94b6
   content-type: application/json; charset=utf-8

   {"id":"6da7dd03-216b-45d3-9339-eb26ec5d94b6","reference":"SO-10001","status":"pending","totals":{"subtotal":95,"tax":7.04,"serviceCharge":0,"total":95},"priceMismatch":false,"partnerTotal":95}
   ```

   `id` is the order id for every later call (yours will differ). `reference` is the restaurant's own number for
   the order. `totals` are the restaurant's and are the ones that count.

4. Send exactly the same request again, with the same `Idempotency-Key`, as a retry after a timeout would. This
   command also keeps the order id in a variable.

   ```bash
   export ORDER=$(curl -s -X POST $BASE/orders -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Idempotency-Key: $IDEM" \
     -d '{"outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","partnerReference":"PX-1001","lines":[{"variantId":"7a0e5b10-0000-4000-8000-000000000101","quantity":1}],"partnerTotal":95}' \
     | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).id")
   echo $ORDER
   ```

   It prints the same `id` as step 3. The API replayed the first answer and created nothing new.

5. Read the order.

   ```bash
   curl -s $BASE/orders/$ORDER -H "Authorization: Bearer $KEY"
   ```

   ```text
   {"id":"6da7dd03-216b-45d3-9339-eb26ec5d94b6","reference":"SO-10001","partnerReference":"PX-1001","status":"pending","reason":null,"cancelledBy":null,"createdAt":"2026-10-10T05:06:43.592Z","updatedAt":"2026-10-10T05:06:43.592Z","totals":{"subtotal":95,"tax":7.04,"serviceCharge":0,"total":95}}
   ```

6. Play the restaurant: accept the order through the mock's simulator. A real restaurant does this on its own
   screen.

   ```bash
   curl -s -X POST http://127.0.0.1:4010/_mock/orders/$ORDER/accept
   ```

   The answer is the order with `"status":"accepted"`. Repeat step 5 and you read the same.

7. Cancel the order. A cancel is a write, so it needs its own new idempotency key.

   ```bash
   curl -s -X POST $BASE/orders/$ORDER/cancel -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -H "Idempotency-Key: $(node -e "console.log(crypto.randomUUID())")" -d '{"reason":"customer left"}'
   ```

   ```text
   {"id":"6da7dd03-216b-45d3-9339-eb26ec5d94b6","reference":"SO-10001","partnerReference":"PX-1001","status":"cancelled","reason":"Partner: customer left","cancelledBy":"partner", ... }
   ```

   Your reason comes back prefixed `Partner: `.

## Idempotency keys

Both writes (`POST orders` and `POST orders/{orderId}/cancel`) require an `Idempotency-Key` header.

- Mint the key once per request, before the first attempt, and store it with the order you are about to place.
- Send the same key on every retry of that same request.
- Never reuse a key with a different body. That answers `409 idempotency_conflict`.
- Retry only a network failure, a timeout, a `429` (wait for `Retry-After`) or a `5xx`. Any other `4xx` will fail
  the same way again.

The client's `withRetry` and `newIdempotencyKey` do this; the
[integration guide, section 4](../integration-guide.md#4-idempotency-and-retry) explains the rule.

Your `partnerReference` protects you a second time: the same reference at the same outlet within 24 hours answers
`409 duplicate_order`, and the body carries the `orderId` of the order that already exists.

## Statuses

An order starts `pending` and moves `accepted`, `preparing`, `ready`, `picked_up`. It can instead end `rejected`
or `cancelled`. `picked_up`, `rejected` and `cancelled` are final: stop asking about the order once you read one of
them. The full rules are in [`CONTRACT.md`, Statuses](../../CONTRACT.md#statuses).

## Cancelling

You may cancel while the order is `pending` or `accepted`. Once the kitchen has started, the API refuses:

```text
{"error":"cannot_cancel","message":"The order is preparing; the kitchen has started it. Call the restaurant."}
```

That is a `409`. Cancelling an order that is already `cancelled` or `rejected` answers `200` with the order as it
is, so a repeated cancel is harmless.

## The accept timeout

If the restaurant neither accepts nor rejects a `pending` order within the outlet's `acceptTimeoutMinutes`, the
order becomes `rejected` with `"reason":"timeout"`. Tell your customer and refund them as you would for any
rejection.

The mock does not run this clock. To see the result, create an order and call
`curl -s -X POST http://127.0.0.1:4010/_mock/orders/$ORDER/timeout` while it is `pending`.

## A price mismatch is flagged, not refused

Send a `partnerTotal` that differs from the restaurant's total by more than 0.01 and the order is still created:

```bash
curl -s -X POST $BASE/orders -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(node -e "console.log(crypto.randomUUID())")" \
  -d '{"outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","partnerReference":"PX-1003","lines":[{"variantId":"7a0e5b10-0000-4000-8000-000000000101","quantity":1}],"partnerTotal":90}'
```

```text
{"id":"5562d2e8-c144-44cc-bf0c-2855b476b2bd","reference":"SO-10002","status":"pending","totals":{"subtotal":95,"tax":7.04,"serviceCharge":0,"total":95},"priceMismatch":true,"partnerTotal":90}
```

`priceMismatch` is `true`, the status is `201`, and the restaurant's `totals` stand. Treat the flag as a sign that
your menu copy is stale: re-sync the menu ([Sync a menu](03-Sync-a-menu.md)) and decide what to do about the
difference with your customer. The flag is only in this create answer, so record it when you receive it.

## How often to ask for the status

Without a webhook, read an open order every 5 seconds for its first two minutes and every 15 seconds after that.
With a working webhook, every 60 seconds is enough. Stop at a final status. If an answer is `429`, wait for the
number of seconds in its `Retry-After` header. The table for many orders on one key is in the
[integration guide, section 6](../integration-guide.md#6-webhooks-with-polling-as-the-backstop).

## Check it worked

Step 4 printed the same id as step 3, and step 7 answered with `"status":"cancelled"` and
`"cancelledBy":"partner"`.

## Next

- [Set up webhooks](05-Set-up-webhooks.md) to hear about status changes without asking.
- [Troubleshooting](Troubleshooting.md) for each error code an order call can answer.
