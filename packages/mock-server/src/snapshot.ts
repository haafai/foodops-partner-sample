import type { PartnerOrderStatus, PartnerTotals } from '@foodops-partner/client';

export interface OutletSnapshot { outletId: string; name: string; open: boolean; acceptingOnline: boolean }

export interface OrderSnapshot {
  id: string;
  keyId: string;
  outletId: string;
  reference: string;
  partnerReference: string;
  status: PartnerOrderStatus;
  reason: string | null;
  cancelledBy: 'partner' | 'restaurant' | null;
  createdAt: string;
  updatedAt: string;
  totals: PartnerTotals;
  priceMismatch: boolean;
  partnerTotal: number | null;
}

export interface FaultResponse { status: number; retryAfterSeconds?: number }
export interface AutopilotSettings { enabled: boolean; stepSeconds: number }

export interface MockStateSnapshot {
  outlets: OutletSnapshot[];
  orders: OrderSnapshot[];
  faults: FaultResponse[];
  autopilot: AutopilotSettings;
  priceOverrides: Array<{ variantId: string; price: number }>;
}
