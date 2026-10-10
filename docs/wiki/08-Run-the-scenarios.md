# Run the scenarios

At the end of this page you have run the twenty-five scenarios against the mock or a test restaurant and can read
each pass, skip and fail.

## Before you start

- The repository installed: [Run the demo locally](01-Run-the-demo-locally.md), step 1.
- A target: the mock (`npm run mock`), or a **test** restaurant's base URL and test key
  ([Point at a real restaurant](07-Point-at-a-real-restaurant.md)).

Never run the scenarios with a live key. They place and cancel real orders.

## What the scenarios prove

Each scenario is a short script that calls the API through the sample client and asserts on the answer. Together
they show that the API you are pointed at behaves as [`CONTRACT.md`](../../CONTRACT.md) says, and that your key is
set up as you expect. They do not test your own code.

## Steps

1. Run them against the mock.

   ```bash
   npm run scenarios -- --base-url http://127.0.0.1:4010 --key hbk_test_mockfull0001_fullscopes
   ```

   ```text
   Target http://127.0.0.1:4010 · key hbk_test_mockfull0001_… · capabilities: mock-control, closed-outlet, menu-only-key, unbound-key, webhook-url, webhook-listener
   PASS  outlets.list
   PASS  menu.etag
   PASS  order.create
   ...
   PASS  webhook.order-event
   PASS  webhook.menu-event

   25 passed, 0 failed, 0 skipped
   ```

2. Or put the target in `.env` and leave the flags out.

   ```bash
   cp .env.example .env
   npm run scenarios
   ```

   A flag wins over the matching `.env` value.

3. Run a few by name while you work on one thing.

   ```bash
   npm run scenarios -- --only menu.etag,order.create
   ```

   ```text
   PASS  menu.etag
   PASS  order.create

   2 passed, 0 failed, 0 skipped
   ```

## Flags and settings

Flags go after `--`. Each setting is read from the environment or from `.env` in the repository root.

| Flag | Setting | What it does |
|---|---|---|
| `--base-url <url>` | `PARTNER_API_BASE_URL` | The API to test. Required. |
| `--key <key>` | `PARTNER_API_KEY` | The key to test with. Required. Only its id is printed. |
| `--only a,b` | | Run only the named scenarios. |
| `--json` | | Print the results as JSON instead of a table, and leave out the target line. |
| `--closed-outlet-id <id>` | | An outlet that is closed now, for `order.outlet-closed`. |
| `--menu-only-key <key>` | | A second key with `menu.read` only, for `auth.menu-only-key`. |
| `--unbound-key <key>` | | A key that is not bound to a delivery partner, for `auth.unbound-key`. |
| `--webhook-url <url>` | `PARTNER_WEBHOOK_URL` | A public https URL that forwards to the listen port on this machine. |
| `--webhook-listen-port <port>` | `PARTNER_WEBHOOK_LISTEN_PORT` | The local port the webhook scenarios listen on. |
| `--help` | | Print the usage text. |

Against the mock you need none of the last five rows: the runner finds the closed outlet and the extra keys
itself and listens on a free port.

Against a real API, the webhook scenarios need both webhook settings. Start a tunnel to the listen port as in
[Expose your receiver](06-Expose-your-receiver.md), and stop `npm run receiver` first if it uses the same port:
`webhook.order-event` starts its own receiver there.

`npm run ci:scenarios` starts the mock, runs every scenario against it with `--json`, and stops the mock. It uses
port 4010, or the port in the `PORT` environment variable.

## The scenarios

| Name | Checks | Needs |
|---|---|---|
| `outlets.list` | Outlets have every field, and at least one is accepting orders. | |
| `menu.etag` | A menu carries an `ETag`, and `If-None-Match` answers `304`. | |
| `order.create` | An order is created `pending` and can be read back. | |
| `order.idempotent-replay` | The same key and body replay the first answer. | |
| `order.idempotency-key-required` | A write without the header is `400 idempotency_key_required`. | |
| `order.duplicate-reference` | The same reference at the same outlet is `409 duplicate_order`. | |
| `order.invalid-line.unknown-variant` | An unknown variant is `422 invalid_line`. | |
| `order.invalid-line.unavailable-variant` | An unavailable variant is `422 invalid_line`. | An unavailable variant on the menu. |
| `order.invalid-line.modifier-over-max` | Too many modifiers in a group is `422 invalid_line`. | A modifier group on the menu. |
| `order.price-mismatch` | A wrong `partnerTotal` sets `priceMismatch` and the order stands. | |
| `order.outlet-closed` | An order at a closed outlet is `409 outlet_closed`. | `closed-outlet` |
| `order.foreign-ids` | Ids that are not yours answer `404 not_found`. | |
| `order.cancel-pending` | A pending order can be cancelled. | |
| `order.cancel-twice` | Cancelling a cancelled order answers `200`. | |
| `order.cancel-after-preparing` | A cancel from `preparing` is `409 cannot_cancel`. | `mock-control` |
| `order.rejected-reason` | A rejection carries the restaurant's reason. | `mock-control` |
| `order.timeout` | An unanswered order is rejected with reason `timeout`. | `mock-control` |
| `order.retry-through-faults` | The client's retry gets through a `429` and a `503`. | `mock-control` |
| `auth.wrong-key` | An unknown key is `401 invalid_api_key`. | |
| `auth.menu-only-key` | A key without `orders.write` is `403 insufficient_scope`. | `menu-only-key` |
| `auth.unbound-key` | A key not bound to a partner is `403 partner_key_required`. | `unbound-key` |
| `webhook.register` | Set, read, replace (new secret) and remove a webhook. | `webhook-url` |
| `webhook.invalid-url` | Bad URLs and bad `events` are refused, and nothing is registered. | |
| `webhook.order-event` | A signed `order.cancelled` event arrives and `GET webhook` shows `delivered`. | `webhook-listener` |
| `webhook.menu-event` | A price change sends `menu.updated` with the new version. | `mock-control`, `webhook-listener` |

The "Needs" column names a capability. The target line at the top of a run lists the ones this run has.
`mock-control` exists only against the mock. `webhook-url` comes from `--webhook-url`, and `webhook-listener` from
`--webhook-url` together with `--webhook-listen-port`.

## Read the result

| Label | Meaning | What to do |
|---|---|---|
| `PASS` | The API answered as the contract says. | Nothing. |
| `SKIP` | The scenario could not run here. The text after the name says why. | Usually nothing; see below. |
| `FAIL` | The API answered differently, or a call failed. The text is the assertion or the API's message. | Read the message; look the error code up in [Troubleshooting](Troubleshooting.md). |

The last line counts each. The command exits `0` when nothing failed, `1` when at least one scenario failed, and
`2` when the base URL or key is missing.

A skip is never a failure. The reasons you can see:

| Skip reason | Why |
|---|---|
| `needs mock-control` (or another capability) | The target is not the mock, or you did not pass the matching flag. |
| `the menu has no unavailable variant` | Nothing on this menu is sold out right now. |
| `no modifier group on the menu has a maximum` | This menu has no modifier group to overfill. |
| `this key does not carry the partner.webhook scope` | Ask the restaurant for the scope if you want webhooks. |
| `a webhook is already registered for this key (host); not replacing it` | See the guarantee below. |
| `this API does not offer webhooks` | The API answered `404` to `PUT webhook`. Keep polling. |
| `this key is restricted to some outlets, so it cannot register a webhook (403 outlet_restricted_key)` | See [Troubleshooting](Troubleshooting.md#403-outlet_restricted_key). |

A failure is often a key problem, not an API problem. Run with the mock's menu-only key and every order scenario
fails with "This key does not carry the orders.write scope."

## What the scenarios leave behind

**Orders.** After each scenario the runner cancels every order that scenario created and that can still be
cancelled. If a cancel fails it prints `cleanup: could not cancel order <id> (<status> <code>)`. Cancel that order
yourself, or tell the restaurant, because it is still waiting in their queue.

**Webhooks.** The runner never touches a webhook it did not create:

- Before a webhook scenario sets anything, it reads `GET webhook`. If a webhook is already registered, the scenario
  is skipped and the existing registration is left exactly as it was.
- A scenario that registers a webhook removes it when it ends, whether it passed or failed.

If that removal fails, the scenario is reported as `FAIL` and this is printed:

```text
cleanup: the webhook this scenario registered could not be removed (<status> <code>). It is still registered and the restaurant keeps posting to it: send DELETE webhook with this key yourself.
```

Do what it says, with the same key:

```bash
set -a; . ./.env; set +a
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$PARTNER_API_BASE_URL/api/external/v1/partner/webhook" -H "Authorization: Bearer $PARTNER_API_KEY"
```

Expect `204`. Then confirm with `GET` on the same URL, which answers `404 not_found` when none is set.

## Check it worked

The run ended with a summary line and no `FAIL`. Against the mock that line is `25 passed, 0 failed, 0 skipped`.

## Next

- [Point at a real restaurant](07-Point-at-a-real-restaurant.md)
- [Go-live checklist](10-Go-live-checklist.md)
