# Contract pin

Pinned to the Hubits partner API contract dated **2026-09-25**. The client types, the mock server and the
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
```

Request limits: `partnerReference` 1–64 characters; `lines` 1–100; `quantity` integer 1–999; `customer.name` ≤ 100; `customer.phone` ≤ 32; `notes` ≤ 500; `partnerTotal` ≥ 0; cancel `reason` 1–200.

## Statuses

`pending` → `accepted` → `preparing` → `ready` → `picked_up`, or `rejected` (from pending; `reason` is the
restaurant's, `timeout` when it never answered), or `cancelled` (`cancelledBy` is `partner` or `restaurant`).
Terminal: `picked_up`, `rejected`, `cancelled`. The partner may cancel while `pending` or `accepted`.

## Errors

Body `{ "error": "<code>", "message": "<text>" }` on a real status code. Some codes add fields.

| Status | `error` | When |
|---|---|---|
| 400 | `invalid_request` | body fails validation (adds `field`) |
| 400 | `idempotency_key_required` | write without `Idempotency-Key` |
| 401 | `invalid_api_key` | unknown, malformed, revoked, expired, wrong environment |
| 402 | `quota_exceeded` | the key's quota is spent |
| 403 | `partner_key_required` | org key not bound to a delivery partner |
| 403 | `endpoint_not_available` | the restaurant has not enabled partner ordering |
| 403 | `insufficient_scope` | missing `menu.read` / `orders.write` |
| 403 | `ip_not_allowed` | caller IP outside the key's allow-list |
| 404 | `not_found` | outlet or order not visible to this key |
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
- There are no webhooks. Poll `GET orders/{orderId}`.
- Menu `version` is a SHA-256 of the response without `version` and is returned as a strong `ETag`; the server caches a built menu for up to 60 s.
