# Set up webhooks

At the end of this page the sample receiver is running, your webhook is registered, and a signed event for an
order has arrived, been verified and been recorded.

> The webhook steps were checked against the mock in this repository. The real API follows
> [`CONTRACT.md`](../../CONTRACT.md#webhooks), and it only accepts a public https URL: see
> [Expose your receiver](06-Expose-your-receiver.md).

## Before you start

- The mock running: [Run the demo locally](01-Run-the-demo-locally.md), steps 1 and 2.
- A key with the `partner.webhook` scope that is not restricted to some outlets:
  [Get and store your key](02-Get-and-store-your-key.md). The mock's full-access test key qualifies.
- Ports 4020 and 4021 free.

## What to expect from webhooks

- The restaurant's API sends an event when one of your orders changes status and when an outlet's menu changes for
  you. The event types and their `data` are in [`CONTRACT.md`, Webhooks](../../CONTRACT.md#webhooks).
- **Delivery is one attempt.** There is no retry and no ordering guarantee. An event can be lost, can arrive twice,
  and can arrive after a later one. Keep polling slowly as the backstop.
- There is **one webhook per restaurant**, not per key.
- **Every registering `PUT` issues a new signing secret, and the old one stops at once.**

## Steps

1. Start the receiver in its own terminal, from the repository root.

   ```bash
   npm run receiver
   ```

   ```text
   Webhook receiver listening on http://127.0.0.1:4020/webhooks/foodops
     This is the only port to put a tunnel or a proxy in front of: 4020
   Local control on http://127.0.0.1:4021/_receiver/state (this machine only; never expose port 4021)
   No signing secret yet: every delivery is answered 401 until one is registered.
   ```

2. Register the webhook and hand the secret to the receiver. Choose one of the two ways.

   **With the demo card.** Start the demo (`npm run dev`), open `http://localhost:5180/setup`, and save the key if
   you have not yet. In the Webhooks card, leave "Webhook URL the restaurant will call" at
   `http://127.0.0.1:4020/webhooks/foodops` and "Receiver control address (this machine)" at
   `http://127.0.0.1:4021`, and press **Register webhook**. The card then reads "Registered." followed by the URL,
   "Events: order, menu", and a line starting "Receiver:". The card made the `PUT` and passed the secret to the
   receiver for you; the secret is never shown.

   **By API.** These two commands do the same without printing the secret. The first keeps it in a shell variable;
   the second gives it to the receiver's control port.

   ```bash
   export BASE=http://127.0.0.1:4010/api/external/v1/partner
   export KEY=hbk_test_mockfull0001_fullscopes
   export SECRET=$(curl -s -X PUT $BASE/webhook -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"url":"http://127.0.0.1:4020/webhooks/foodops"}' | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).secret")
   curl -s -o /dev/null -w "%{http_code}\n" -X PUT http://127.0.0.1:4021/_receiver/secret -H "Content-Type: application/json" -d "{\"secret\":\"$SECRET\"}"
   ```

   ```text
   204
   ```

   To receive only one family of events, add `"events":["order"]` or `"events":["menu"]` to the `PUT` body.
   Leaving `events` out means both.

3. Read the registration back. `GET` never returns the secret.

   ```bash
   curl -s $BASE/webhook -H "Authorization: Bearer $KEY"
   ```

   ```text
   {"url":"http://127.0.0.1:4020/webhooks/foodops","events":["order","menu"],"createdAt":"2026-10-10T05:07:08.061Z","updatedAt":"2026-10-10T05:07:08.061Z","lastDelivery":null,"consecutiveFailures":0}
   ```

4. Cause an event: create an order, then accept it as the restaurant through the mock's simulator.

   ```bash
   export ORDER=$(curl -s -X POST $BASE/orders -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -H "Idempotency-Key: $(node -e "console.log(crypto.randomUUID())")" \
     -d '{"outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","partnerReference":"PX-2001","lines":[{"variantId":"7a0e5b10-0000-4000-8000-000000000101","quantity":1}]}' \
     | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).id")
   curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:4010/_mock/orders/$ORDER/accept
   ```

   ```text
   200
   ```

   Creating the order sends nothing: `pending` is never announced. Accepting it sends `order.accepted`.

5. Read what the receiver accepted.

   ```bash
   curl -s "http://127.0.0.1:4021/_receiver/events?after=0"
   ```

   ```text
   {"events":[{"seq":1,"receivedAt":"2026-10-10T05:07:08.845Z","event":{"id":"evt_01M4J3ACWGJ3VFTTXTZWFBYYX8","type":"order.accepted","createdAt":"2026-10-10T05:07:08.816Z","data":{"orderId":"ca2f630a-f9e1-43c0-87da-4dd7bda25c56","partnerReference":"PX-2001","outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","status":"accepted"}}}],"lastSeq":1,"hasSecret":true,"bootId":"268644df-30f8-44ac-bac4-e6c4d875edd7"}
   ```

## Check it worked

Ask the API how the delivery went:

```bash
curl -s $BASE/webhook -H "Authorization: Bearer $KEY"
```

`lastDelivery` now reads `{"at":"…","httpStatus":200,"outcome":"delivered"}` and `consecutiveFailures` is `0`.

In the demo, open an order's tracking page while the webhook is registered: the line under the status reads
"Live by webhook; checking every 60 s as a backstop."

## Store the secret

The `PUT` answer is the only place the secret ever appears. In your own integration:

1. Make the `PUT` from your server.
2. Write the `secret` to the same secret store as the key **before** you do anything else.
3. Only then rely on events. Events signed in the moment before you stored the new secret fail your check and are
   lost; your polling picks up what they would have told you.

Never log the secret, print it, or commit it.

The sample receiver keeps the secret in memory. If you restart it, it answers every delivery `401` until you
register again (which issues a new secret), or until you start it with the secret in `PARTNER_WEBHOOK_SECRET` in
`.env`.

## Verify a signature

Every delivery carries a `Hubits-Signature` header of the form `t=<unix seconds>,v1=<hex>`. The rule is in
[`CONTRACT.md`, Webhooks](../../CONTRACT.md#webhooks). The handler to copy is `createWebhookHandler` in
`packages/webhook-receiver/src/receiver.ts`, and it calls `verifyWebhookSignature` from `packages/client`. Three
things matter:

- Verify the body **as the bytes that arrived**. A body that was parsed and serialised again no longer matches.
- Refuse a timestamp more than five minutes from your clock.
- Answer `2xx` within five seconds, before you do any slow work. Put the event on your own queue first.

You can check any verifier against the contract's test vector. This runs the sample's, with the clock set to the
vector's timestamp, then with today's clock, then with a re-serialised body:

```bash
node --import tsx -e "
import('@foodops-partner/client').then(async ({ verifyWebhookSignature }) => {
  const rawBody = '{\"id\":\"evt_01JA0000000000000000000000\",\"type\":\"order.accepted\",\"createdAt\":\"2026-10-08T09:12:44Z\",\"data\":{\"orderId\":\"0b6f1c9e-2a4d-4e7b-9c31-5d8e7f6a1b02\",\"partnerReference\":\"PX-88213\",\"outletId\":\"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01\",\"status\":\"accepted\"}}';
  const input = { secret: 'whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8', header: 't=1791450764,v1=88cd927dacae4753a86afe380fd999d557b1a6f27cc3305226af8310435fbc86', rawBody };
  console.log(await verifyWebhookSignature({ ...input, now: 1791450764 }));
  console.log(await verifyWebhookSignature(input));
  console.log(await verifyWebhookSignature({ ...input, now: 1791450764, rawBody: JSON.stringify(JSON.parse(rawBody), null, 1) }));
});"
```

```text
{ ok: true, timestamp: 1791450764 }
{ ok: false, reason: 'timestamp_out_of_tolerance' }
{ ok: false, reason: 'signature_mismatch' }
```

The secret in that command is the contract's published test vector, not a real secret.

## Handle duplicates and out-of-order events

- **Duplicates.** Remember each event `id` you have handled and ignore one you have seen. The sample receiver
  answers a repeat `200` and does not record it again.
- **Out of order.** For each order, keep the `createdAt` of the last event you applied and ignore an event that
  is older. Never move an order out of a final status. The demo's version of this rule is `applyWebhookEvent` in
  `apps/demo/src/webhooks/applyEvent.ts`.
- **`menu.updated`.** The event carries only the outlet and the new `version`. Re-fetch that menu with
  `If-None-Match`, as in [Sync a menu](03-Sync-a-menu.md).

If you registered by API in step 2, you can watch the receiver ignore a repeat. This signs one made-up event with
your secret and posts it twice:

```bash
node --import tsx -e "
import('@foodops-partner/client').then(async ({ signWebhookPayload }) => {
  const body = JSON.stringify({ id: 'evt_01JA0000000000000000000000', type: 'order.ready', createdAt: new Date().toISOString(), data: { orderId: 'test-order', partnerReference: 'PX-TEST', outletId: 'test-outlet', status: 'ready' } });
  const signature = await signWebhookPayload(process.env.SECRET, Math.floor(Date.now() / 1000), body);
  for (let i = 0; i < 2; i++) {
    const res = await fetch('http://127.0.0.1:4020/webhooks/foodops', { method: 'POST', headers: { 'content-type': 'application/json', 'hubits-signature': signature }, body });
    console.log(res.status, await res.text());
  }
});"
```

```text
200 {"received":true}
200 {"received":true,"duplicate":true}
```

## The two ports

| Port | Setting | Serves | May be exposed? |
|---|---|---|---|
| 4020 | `WEBHOOK_PORT` | `POST /webhooks/foodops` and nothing else. Every request must carry a valid signature. | Yes, through your proxy or tunnel. |
| 4021 | `WEBHOOK_CONTROL_PORT` | `/_receiver/state`, `/_receiver/events`, `/_receiver/secret`. No login. | Never. This machine only. |

The control port answers only a request addressed to `localhost`, `127.0.0.1` or `[::1]`, and from a web page only
when that page's address is in `WEBHOOK_ALLOWED_ORIGINS` (by default `http://localhost:5180` and
`http://127.0.0.1:5180`). Why it must stay private is in [Expose your receiver](06-Expose-your-receiver.md).

## Limits of the sample receiver

- It serves one key, so it holds one secret. With many restaurants, give each its own URL and look the secret up
  from the URL before you verify: see the [FAQ](FAQ.md#can-one-url-serve-many-restaurants).
- It keeps the last 500 events and the last 5000 event ids in memory. A real integration writes to a database.

## Remove the webhook

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $BASE/webhook -H "Authorization: Bearer $KEY"
unset SECRET
```

It prints `204`, also when no webhook is set. In the demo, press **Remove webhook** on the card.

## Next

- [Expose your receiver](06-Expose-your-receiver.md) to receive from a real restaurant.
- [Go-live checklist](10-Go-live-checklist.md)
