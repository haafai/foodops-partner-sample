# Sync a menu

At the end of this page you have listed a restaurant's outlets, fetched a menu with your prices, and re-checked it
without downloading it again.

> These steps were checked against the mock in this repository. The real API follows
> [`CONTRACT.md`](../../CONTRACT.md).

## Before you start

- The mock running: [Run the demo locally](01-Run-the-demo-locally.md), steps 1 and 2.
- A key with the `menu.read` scope: [Get and store your key](02-Get-and-store-your-key.md). The commands below
  use the mock's full-access test key.

## Steps

1. Set two shell variables so the commands stay short.

   ```bash
   export BASE=http://127.0.0.1:4010/api/external/v1/partner
   export KEY=hbk_test_mockfull0001_fullscopes
   ```

2. List the outlets.

   ```bash
   curl -s $BASE/outlets -H "Authorization: Bearer $KEY"
   ```

   ```text
   [{"outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","name":"Marine Drive","address":"Boduthakurufaanu Magu, Malé","phone":"+960 330 0001","acceptingOrders":true,"acceptTimeoutMinutes":10},
    {"outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c02","name":"Lagoon Kiosk","address":"Lagoon Road, Hulhumalé","phone":"+960 330 0002","acceptingOrders":false,"acceptTimeoutMinutes":15}]
   ```

   `acceptingOrders` is true only while the outlet can take an order now. `acceptTimeoutMinutes` is how long a new
   order waits for the restaurant before it is rejected automatically. You only see the outlets that take your
   orders.

3. Fetch one outlet's menu, and print the response headers with it.

   ```bash
   export OUTLET=3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01
   curl -s -i $BASE/outlets/$OUTLET/menu -H "Authorization: Bearer $KEY"
   ```

   ```text
   HTTP/1.1 200 OK
   etag: "28182f7144cee3edea7279908d97f75aab367e7da1c83b34deaac14578b8f700"
   cache-control: private, max-age=60
   content-type: application/json; charset=utf-8

   {"outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","currency":"MVR","pricesIncludeTax":true,
    "partnerPriceList":{"id":"b7d2a9e4-5c1f-4e8a-9d3b-2f6c8a1e4d05","name":"Partner +15%"},
    "categories":[{"id":"7a0e5b10-0000-4000-8000-000000000001","name":"Burgers","sortOrder":1,"items":[
      {"productId":"7a0e5b10-0000-4000-8000-000000000010","name":"Classic Burger", ... ,
       "variants":[{"variantId":"7a0e5b10-0000-4000-8000-000000000101","name":"Regular","price":95,"available":true}, ... ],
       "modifierGroups":[ ... ]}, ... ]}, ... ],
    "version":"28182f7144cee3edea7279908d97f75aab367e7da1c83b34deaac14578b8f700"}
   ```

   Read these fields before you show a price:

   - `partnerPriceList`: the price list the restaurant set for you. When it is `null` you are seeing list prices.
   - `pricesIncludeTax`: whether each `price` already includes tax.
   - `currency`: the currency of every `price` on this menu.
   - `variantId`: what you order. An item has one or more variants, each with its own price.
   - `modifierGroups`: optional or required extras, each with a `min` and a `max` number of choices.

4. Keep the `ETag` header. It is the menu's `version` in quotes.

   ```bash
   export ETAG=$(curl -s -D - -o /dev/null $BASE/outlets/$OUTLET/menu -H "Authorization: Bearer $KEY" | grep -i '^etag:' | sed 's/^[^:]*: //' | tr -d '\r')
   echo $ETAG
   ```

   ```text
   "28182f7144cee3edea7279908d97f75aab367e7da1c83b34deaac14578b8f700"
   ```

5. Ask again, sending the value back as `If-None-Match`.

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" $BASE/outlets/$OUTLET/menu -H "Authorization: Bearer $KEY" -H "If-None-Match: $ETAG"
   ```

   ```text
   304
   ```

   A `304` has no body: your copy is current. This is the call to repeat on a timer.

6. Change a price in the mock, to see the other answer. This is a simulator route, not part of the API.

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X PUT http://127.0.0.1:4010/_mock/prices -H "Content-Type: application/json" -d '{"variantId":"7a0e5b10-0000-4000-8000-000000000101","price":99}'
   curl -s -o /dev/null -w "%{http_code}\n" $BASE/outlets/$OUTLET/menu -H "Authorization: Bearer $KEY" -H "If-None-Match: $ETAG"
   ```

   ```text
   204
   200
   ```

   The second call answers `200` with the new menu and a new `ETag`. Store both.

## Items that are unavailable

A variant with `"available": false` stays on the menu so that you can show it as sold out. In the mock, the Fish
Burger's "Double" variant (`7a0e5b10-0000-4000-8000-000000000302`) is one. Ordering it is refused with
`422 invalid_line`; see [Place and track an order](04-Place-and-track-an-order.md).

## Prices

The restaurant's prices are the ones that count. Yours are a copy, and the restaurant can change them at any time.
Keep the copy fresh with the timer in step 5, and send what you charged as `partnerTotal` when you order. Prices
are JSON numbers; carry them in a decimal type in your own code.

## How often to ask

The real API rebuilds a menu at most once a minute, so asking more often than every 60 seconds per outlet gains
nothing. With a working webhook you can slow down to every 10 minutes and re-fetch when a `menu.updated` event
arrives. The full table is in the [integration guide, section 6](../integration-guide.md#6-webhooks-with-polling-as-the-backstop).

The mock has no such one-minute copy: a price change shows on the next request.

## Check it worked

Step 5 printed `304` and the second command of step 6 printed `200`.

To put the mock's prices back, restart it or run `curl -s -X POST http://127.0.0.1:4010/_mock/reset`. A reset also
removes every order and webhook in the mock.

## Next

- [Place and track an order](04-Place-and-track-an-order.md)
- [Set up webhooks](05-Set-up-webhooks.md) to be told when a menu changes.
