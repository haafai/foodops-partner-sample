# Contract pin

Pinned to the Hubits partner API contract dated **2026-09-25**, with the webhook addition dated **2026-10-08**. The client types, the mock server and the
scenario runner in this repository implement exactly this. When the contract changes, one commit updates
this file, `packages/client/src/types.ts`, the mock and the scenarios together.

## Credential

`Authorization: Bearer hbk_<env>_<id>_<secret>` on every request. `<env>` is `test` outside production and
`live` in it. `<id>` is 12 characters and is the only part that may be shown or logged. Keys travel in this
header only, never in a URL.

## Endpoints

Base path `/api/external/v1/partner`.

| Method | Route | Scope | Success |
|---|---|---|---|
| GET | `outlets` | `menu.read` | 200 `PartnerOutletDto[]` |
| GET | `outlets/{outletId}/menu` | `menu.read` | 200 `PartnerMenuDto` + `ETag`; 304 on `If-None-Match` |
| POST | `orders` | `orders.write` | 201 `PartnerOrderCreatedDto` + `Location`; `Idempotency-Key` required |
| GET | `orders/{orderId}` | `orders.write` | 200 `PartnerOrderDto` |
| POST | `orders/{orderId}/cancel` | `orders.write` | 200 `PartnerOrderDto`; `Idempotency-Key` required |
| PUT | `webhook` | `partner.webhook` | 200 `PartnerWebhookDto` with `secret`; sets or replaces; no `Idempotency-Key` |
| GET | `webhook` | `partner.webhook` | 200 `PartnerWebhookDto` without `secret`; 404 when none is set |
| DELETE | `webhook` | `partner.webhook` | 204, also when none is set |

## Wire shapes

camelCase JSON, decimals as JSON numbers, times ISO-8601 UTC with `Z`.

```text
PartnerOutletDto   { outletId, name, address|null, phone|null, acceptingOrders: bool, acceptTimeoutMinutes: int }
PartnerMenuDto     { outletId, currency, pricesIncludeTax: bool, partnerPriceList: {id,name}|null, version, categories: PartnerMenuCategoryDto[] }
PartnerMenuCategoryDto { id, name, sortOrder, items: PartnerMenuItemDto[] }
PartnerMenuItemDto { productId, name, description|null, imageUrl|null, variants: PartnerMenuVariantDto[], modifierGroups: PartnerModifierGroupDto[] }
PartnerMenuVariantDto { variantId, name, price, available: bool }
PartnerModifierGroupDto { id, name, min, max, modifiers: [{ modifierId, name, price }] }
CreatePartnerOrderRequest { outletId, partnerReference, customer:{name,phone}|null, notes|null, expectedPickupAt|null, lines:[{variantId, quantity, note|null, modifiers:[{modifierId, quantity}]|null}], partnerTotal|null }
PartnerOrderCreatedDto { id, reference, status, totals: PartnerTotalsDto, priceMismatch: bool, partnerTotal|null }
PartnerOrderDto    { id, reference, partnerReference, status, reason|null, cancelledBy: "partner"|"restaurant"|null, createdAt, updatedAt, totals: PartnerTotalsDto }
PartnerTotalsDto   { subtotal, tax, serviceCharge, total }
CancelPartnerOrderRequest { reason }
SetPartnerWebhookRequest { url, events?: ("order"|"menu")[] }
PartnerWebhookDto  { url, events: ("order"|"menu")[], createdAt, updatedAt, lastDelivery: { at, httpStatus|null, outcome }|null, consecutiveFailures: int, secret? }
WebhookEvent       { id: "evt_<26-character ULID>", type, createdAt, data }
```

Request limits: `partnerReference` 1–64 characters; `lines` 1–100; `quantity` integer 1–999; `customer.name` ≤ 100; `customer.phone` ≤ 32; `notes` ≤ 500; `partnerTotal` ≥ 0; cancel `reason` 1–200.

## Statuses

`pending` → `accepted` → `preparing` → `ready` → `picked_up`, or `rejected` (from pending; `reason` is the
restaurant's, `timeout` when it never answered), or `cancelled` (`cancelledBy` is `partner` or `restaurant`).
Terminal: `picked_up`, `rejected`, `cancelled`. The partner may cancel while `pending` or `accepted`; a
partner-initiated cancel's `reason` is returned prefixed `Partner: ` (sent `customer left`, read back
`Partner: customer left`).

## Errors

Body `{ "error": "<code>", "message": "<text>" }` on a real status code. Some codes add fields.

| Status | `error` | When |
|---|---|---|
| 400 | `invalid_request` | body fails validation (adds `field`) |
| 400 | `idempotency_key_required` | write without `Idempotency-Key` |
| 400 | `invalid_webhook_url` | the webhook `url` breaks a URL rule below |
| 400 | `invalid_events` | `events` is empty or names something other than `order` and `menu` |
| 401 | `invalid_api_key` | unknown, malformed, revoked, expired, wrong environment |
| 402 | `quota_exceeded` | the key's quota is spent |
| 403 | `partner_key_required` | org key not bound to a delivery partner |
| 403 | `endpoint_not_available` | the restaurant has not enabled partner ordering |
| 403 | `insufficient_scope` | missing `menu.read` / `orders.write` / `partner.webhook` |
| 403 | `ip_not_allowed` | caller IP outside the key's allow-list |
| 403 | `outlet_restricted_key` | `PUT webhook` with a key restricted to some outlets |
| 404 | `not_found` | outlet or order not visible to this key; no webhook set; webhooks not offered by this API |
| 409 | `duplicate_order` | same `partnerReference` at this outlet within 24 h (adds `orderId`) |
| 409 | `outlet_closed` | no till is open; nothing was queued |
| 409 | `cannot_cancel` | order is preparing or later |
| 409 | `idempotency_conflict` | same key, different body |
| 422 | `outlet_not_accepting` | the outlet paused online ordering |
| 422 | `outlet_not_configured` | the outlet cannot take delivery orders yet |
| 422 | `invalid_line` | unknown/unavailable variant or bad modifier (adds `line`, `reason`) |
| 429 | `rate_limited` | over 10 requests/s (burst 30) for this key; honour `Retry-After` |
| 503 | `auth_unavailable` | the key could not be checked; retry |

## Rules

- The partner's prices are never trusted. `partnerTotal` is advisory: a mismatch beyond 0.01 sets `priceMismatch: true` and the order still stands.
- The same `partnerReference` at the same outlet within 24 hours is a duplicate.
- A `pending` order is auto-rejected after the outlet's `acceptTimeoutMinutes` with reason `timeout`.
- A webhook is a prompt, never the only source of truth. `GET orders/{orderId}` and the menu ETag always tell the truth; keep polling them slowly.
- Menu `version` is a SHA-256 of the response without `version` and is returned as a strong `ETag`; the server caches a built menu for up to 60 s.

## Webhooks

One endpoint per restaurant and delivery partner, not per key: rotating a key keeps it. `secret` is returned by
`PUT` only. **Every `PUT` issues a new secret and the old one stops at once**; that is how it is rotated. Events
signed before you have stored the new secret fail your check and are lost. A key restricted to some outlets
cannot register a webhook: `PUT` answers `403 outlet_restricted_key`. A new endpoint receives only what happens after it was set. A
replacing `PUT` keeps `createdAt`, `lastDelivery` and `consecutiveFailures`; it changes `url`, `events`,
`updatedAt` and the secret.

URL rules, checked on `PUT` and again each time an event is sent: absolute; scheme `https`; no user or password;
port 443 or none; at most 2000 characters; every address the host resolves to is public (no loopback, private,
link-local, shared or metadata range, IPv4 or IPv6). `events` left out means both. In `PartnerWebhookDto`,
`events` is always in the order `order`, `menu`, whatever order the `PUT` named them in.

Times (`createdAt` on the webhook and on events, and `lastDelivery.at`) are ISO-8601 UTC ending in `Z`, with up to
seven fractional digits and trailing zeros dropped. Accept both a fractional form (`2026-10-08T09:12:44.1234567Z`)
and a whole-second form (`2026-10-08T09:12:44Z`).

| `type` | Sent when | `data` |
|---|---|---|
| `order.accepted`, `order.preparing`, `order.ready`, `order.picked_up` | the order reaches that status | `{ orderId, partnerReference, outletId, status }` |
| `order.rejected` | the restaurant rejects, or the accept timeout fires | the above plus `reason` |
| `order.cancelled` | the restaurant or the partner cancels | the above plus `reason`, `cancelledBy` |
| `menu.updated` | an outlet's menu `version` changes for this partner | `{ outletId, version }` |

`type` is `order.` plus the status; `status`, `reason` and `cancelledBy` are exactly what `GET orders/{orderId}`
returns. `pending` is never sent. `version` is the menu's `version`.

```text
POST <url>
Content-Type: application/json
User-Agent: Hubits-Webhooks/1
Hubits-Event-Id: <id>
Hubits-Event-Type: <type>
Hubits-Signature: t=<unix seconds>,v1=<lowercase hex HMAC-SHA256(key, "<t>." + raw body bytes)>

{ "id": "evt_<26-character ULID>", "type": "<type>", "createdAt": "<UTC Z>", "data": { … } }
```

The HMAC key is the 32 bytes that `whsec_` is followed by, base64url-decoded. Verify over the body bytes exactly as
received, compare in constant time, and refuse a `t` more than five minutes from now. A repeated `id` may be ignored.

Test vector (the client's and the receiver's tests pin it):

```text
secret     whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8        (key bytes 0x00 … 0x1f)
t          1791450764                                                 (2026-10-08T09:12:44Z)
body       {"id":"evt_01JA0000000000000000000000","type":"order.accepted","createdAt":"2026-10-08T09:12:44Z","data":{"orderId":"0b6f1c9e-2a4d-4e7b-9c31-5d8e7f6a1b02","partnerReference":"PX-88213","outletId":"3f1c6c2e-0d5b-4c7a-9a21-6b7e1a2d3c01","status":"accepted"}}
           (256 bytes, no trailing newline)
signature  t=1791450764,v1=88cd927dacae4753a86afe380fd999d557b1a6f27cc3305226af8310435fbc86
```

Delivery: one attempt, 5 seconds for all of it, redirects not followed, any 2xx is `delivered`. Anything else is
recorded as `http_error`, `timeout`, `connection_failed` or `blocked_address` and is **not sent again**. There is no
retry and no ordering guarantee: events can be lost and can arrive out of order. A webhook is a prompt, and a slow
poll stays as the backstop. `lastDelivery` and `consecutiveFailures` on `GET webhook` show how it is going.
