import type { PartnerOrderStatus } from '@foodops-partner/client';

export interface TrackedOrder {
  id: string;
  reference: string;
  partnerReference: string;
  outletId: string;
  outletName: string;
  createdAt: string;
  idempotencyKey: string;
  lastStatus: PartnerOrderStatus;
  /** `createdAt` of the last webhook event applied to this order; an older event is ignored. */
  lastEventAt?: string;
  priceMismatch: boolean;
  partnerTotal: number | null;
  total: number;
}

const KEY = 'partner-demo.orders';

export function listTracked(): TrackedOrder[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as TrackedOrder[]) : [];
  } catch {
    return [];
  }
}

function write(list: TrackedOrder[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: the board forgets on reload, which is acceptable for a demo.
  }
}

export function saveTracked(order: TrackedOrder): void {
  write([order, ...listTracked().filter((o) => o.id !== order.id)]);
}

export function updateTracked(id: string, patch: Partial<TrackedOrder>): void {
  write(listTracked().map((o) => (o.id === id ? { ...o, ...patch } : o)));
}
