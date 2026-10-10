import type { PartnerOrderStatus, PartnerTotals, PartnerWebhookEventName, PartnerWebhookOutcome } from '@foodops-partner/client';
import { OUTLETS } from './fixtures';
import { error } from './http';
import type { JsonResponse } from './http';
import type { Scheduler } from './scheduler';
import type { AutopilotSettings, FaultResponse, MockStateSnapshot } from './snapshot';

export interface StoredOrder {
  id: string;
  keyId: string;
  outletId: string;
  reference: string;
  partnerReference: string;
  status: PartnerOrderStatus;
  reason: string | null;
  cancelledBy: 'partner' | 'restaurant' | null;
  createdAt: number;
  updatedAt: number;
  totals: PartnerTotals;
  priceMismatch: boolean;
  partnerTotal: number | null;
  customer: { name: string; phone: string } | null;
  notes: string | null;
}

export interface StoredWebhook {
  url: string;
  /** `whsec_…`. Returned by PUT only; never in a GET, a snapshot or a log. */
  secret: string;
  events: PartnerWebhookEventName[];
  createdAt: number;
  updatedAt: number;
  lastDelivery: { at: number; httpStatus: number | null; outcome: PartnerWebhookOutcome } | null;
  consecutiveFailures: number;
  /** The menu version last announced (or seen at registration) per outlet. */
  menuVersions: Map<string, string>;
}

export interface OutletFlags { open: boolean; acceptingOnline: boolean }
export interface MockStateOptions {
  clock?: () => number;
  scheduler?: Scheduler;
  /** How events leave the mock. Tests inject a double; the default is the global fetch. */
  webhookFetch?: typeof fetch;
}

interface IdempotencyRecord { bodyKey: string; response: JsonResponse }

const noScheduler: Scheduler = { schedule: () => () => {} };

/** JSON with object keys sorted, so two bodies that mean the same thing compare equal. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

export class MockState {
  readonly clock: () => number;
  readonly scheduler: Scheduler;
  readonly orders = new Map<string, StoredOrder>();
  readonly outlets = new Map<string, OutletFlags>();
  readonly priceOverrides = new Map<string, number>();
  /** Autopilot timer cancel functions by order id. */
  readonly timers = new Map<string, () => void>();
  /** One endpoint per key id: in the mock every key is its own partner, as order visibility already is. */
  readonly webhooks = new Map<string, StoredWebhook>();
  /** Deliveries still in flight, so a test can wait for them. */
  readonly deliveries = new Set<Promise<void>>();
  readonly webhookFetch: typeof fetch;
  faults: FaultResponse[] = [];
  autopilot: AutopilotSettings = { enabled: false, stepSeconds: 5 };
  nextOrderNumber = 10001;
  /** Set by the server so a new order can be handed to the autopilot. */
  onOrderCreated: ((orderId: string) => void) | undefined;
  #idempotency = new Map<string, IdempotencyRecord>();

  constructor(options: MockStateOptions = {}) {
    this.clock = options.clock ?? (() => Date.now());
    this.scheduler = options.scheduler ?? noScheduler;
    this.webhookFetch = options.webhookFetch ?? ((input, init) => globalThis.fetch(input, init));
    this.reset();
  }

  reset(): void {
    for (const cancel of this.timers.values()) cancel();
    this.timers.clear();
    this.orders.clear();
    this.webhooks.clear();
    this.#idempotency.clear();
    this.priceOverrides.clear();
    this.faults = [];
    this.autopilot = { enabled: false, stepSeconds: 5 };
    this.nextOrderNumber = 10001;
    this.outlets.clear();
    for (const outlet of OUTLETS) this.outlets.set(outlet.outletId, { ...outlet.initial });
  }

  /** Resolves once every delivery that has started has finished, whatever its outcome. */
  async settleDeliveries(): Promise<void> {
    while (this.deliveries.size > 0) await Promise.allSettled([...this.deliveries]);
  }

  /** The stored answer for this key + Idempotency-Key, a 409 when the body differs, or undefined when unseen. */
  replay(keyId: string, idempotencyKey: string, body: unknown): JsonResponse | undefined {
    const record = this.#idempotency.get(`${keyId}:${idempotencyKey}`);
    if (!record) return undefined;
    if (record.bodyKey === canonicalJson(body)) return record.response;
    return error(409, 'idempotency_conflict', 'This Idempotency-Key was already used with a different request body. Mint a new key for a new request.');
  }

  /** Only successful answers are remembered; a refused request may be corrected and retried with the same key. */
  remember(keyId: string, idempotencyKey: string, body: unknown, response: JsonResponse): void {
    this.#idempotency.set(`${keyId}:${idempotencyKey}`, { bodyKey: canonicalJson(body), response });
  }

  snapshot(): MockStateSnapshot {
    return {
      outlets: OUTLETS.map((o) => ({ outletId: o.outletId, name: o.name, ...this.outlets.get(o.outletId)! })),
      orders: [...this.orders.values()].map((o) => ({
        id: o.id, keyId: o.keyId, outletId: o.outletId, reference: o.reference, partnerReference: o.partnerReference,
        status: o.status, reason: o.reason, cancelledBy: o.cancelledBy,
        createdAt: new Date(o.createdAt).toISOString(), updatedAt: new Date(o.updatedAt).toISOString(),
        totals: o.totals, priceMismatch: o.priceMismatch, partnerTotal: o.partnerTotal,
      })),
      faults: [...this.faults],
      autopilot: { ...this.autopilot },
      priceOverrides: [...this.priceOverrides.entries()].map(([variantId, price]) => ({ variantId, price })),
    };
  }
}
